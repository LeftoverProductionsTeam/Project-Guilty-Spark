//! Safe, source-only Wavefront OBJ ingestion for the Asset Workshop.
//!
//! Face position/texture/normal indices are independent in OBJ. To render
//! textured assets correctly each unique index tuple must become a separate
//! output vertex. No external materials, shaders or game tags are executed.
use crate::{invalid, maps::{MeshData, MeshPart}, Result, SparkError};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjImport {
    pub mesh: MeshData,
    pub has_uvs: bool,
    pub materials: Vec<String>,
    pub warnings: Vec<String>,
}

const MAX_VERTICES: usize = 1_000_000;
const MAX_INDICES: usize = 6_000_000;

fn point(words: &mut std::str::SplitWhitespace<'_>, n: usize, line: usize) -> Result<Vec<f32>> {
    let mut coords = Vec::with_capacity(n);
    for _ in 0..n {
        let value = words.next().ok_or_else(|| {
            SparkError::Invalid(format!("Incomplete OBJ coordinate at line {}", line + 1))
        })?.parse::<f32>().map_err(|_| SparkError::Invalid(format!("Invalid OBJ coordinate at line {}", line + 1)))?;
        if !value.is_finite() || value.abs() > 1e7 {
            return invalid(format!("Non-finite or excessive OBJ coordinate at line {}", line + 1));
        }
        coords.push(value);
    }
    Ok(coords)
}

fn resolve_index(text: &str, count: usize, line: usize) -> Result<usize> {
    let parsed = text.parse::<i64>().map_err(|_| {
        SparkError::Invalid(format!("Invalid OBJ face index on line {}", line + 1))
    })?;
    let len = count as i64;
    let index = if parsed > 0 { parsed - 1 } else { len + parsed };
    if parsed == 0 || index < 0 || index >= len {
        return invalid(format!("OBJ face index is out of range on line {}", line + 1));
    }
    Ok(index as usize)
}

fn face_indices(text: &str, positions: usize, uvs: usize, normals: usize, line: usize)
    -> Result<(usize, Option<usize>, Option<usize>)>
{
    let mut parts = text.split('/');
    let vertex = resolve_index(parts.next().unwrap_or(""), positions, line)?;
    let texture = match parts.next() {
        Some(v) if !v.is_empty() => Some(resolve_index(v, uvs, line)?),
        _ => None,
    };
    let normal = match parts.next() {
        Some(v) if !v.is_empty() => Some(resolve_index(v, normals, line)?),
        _ => None,
    };
    if parts.next().is_some() {
        return invalid(format!("Too many OBJ face index components on line {}", line + 1));
    }
    Ok((vertex, texture, normal))
}

fn computed_normals(mesh: &mut MeshData, declared: &[bool]) {
    let vertex_count = mesh.positions.len() / 3;
    let mut sums = vec![[0.0f32; 3]; vertex_count];
    for triangle in mesh.indices.chunks_exact(3) {
        let [a, b, c] = [triangle[0] as usize, triangle[1] as usize, triangle[2] as usize];
        let position = |i: usize| [mesh.positions[i*3], mesh.positions[i*3+1], mesh.positions[i*3+2]];
        let pa = position(a); let pb = position(b); let pc = position(c);
        let ab = [pb[0]-pa[0], pb[1]-pa[1], pb[2]-pa[2]];
        let ac = [pc[0]-pa[0], pc[1]-pa[1], pc[2]-pa[2]];
        let normal = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]];
        for &i in &[a,b,c] {
            if !declared[i] {for j in 0..3 { sums[i][j] += normal[j]; }}
        }
    }
    for (i, v) in sums.iter().enumerate() {
        if declared[i] { continue; }
        let len = v.iter().map(|x| (*x)*(*x)).sum::<f32>().sqrt();
        let n = if len > 0.00001 { [v[0]/len,v[1]/len,v[2]/len] } else { [0.,0.,1.] };
        mesh.normals[i*3..i*3+3].copy_from_slice(&n);
    }
}

/// Import actual OBJ texture coordinates, normals, and consecutive material groups.
/// This is a workshop mesh, not yet a Halo render/collision tag conversion.
pub fn parse_obj(text: &str) -> Result<ObjImport> {
    if text.len() > 64 * 1024 * 1024 { return invalid("OBJ limit is 64 MiB"); }
    let mut mesh = MeshData {
        label: "Imported OBJ mesh".into(), source: "obj".into(), ..Default::default()
    };
    let mut raw_positions: Vec<[f32;3]> = Vec::new();
    let mut raw_uvs: Vec<[f32;2]> = Vec::new();
    let mut raw_normals: Vec<[f32;3]> = Vec::new();
    let mut material_names: Vec<String> = Vec::new();
    let mut vertex_map = HashMap::<(usize,Option<usize>,Option<usize>), u32>::new();
    let mut declared_normals = Vec::<bool>::new();
    let mut warnings = Vec::new();
    let mut active_material = "default".to_string();
    let mut active_part_start = 0usize;
    let mut polygons = false;
    let mut partial_uvs = false;
    let mut referenced_uvs = false;
    let mut has_external_material_library = false;
    let mut any_faces = false;

    for (line_no, line) in text.lines().enumerate() {
        let mut words = line.split_whitespace();
        match words.next() {
            Some("v") => {
                let p = point(&mut words,3,line_no)?;
                raw_positions.push([p[0],p[1],p[2]]);
                if raw_positions.len() > MAX_VERTICES {return invalid("OBJ exceeds one million source vertices");}
            }
            Some("vt") => {
                let uv=point(&mut words,2,line_no)?;
                raw_uvs.push([uv[0],uv[1]]);
                if raw_uvs.len() > MAX_VERTICES {return invalid("OBJ exceeds one million UV coordinates");}
            }
            Some("vn") => {
                let n=point(&mut words,3,line_no)?;
                raw_normals.push([n[0],n[1],n[2]]);
                if raw_normals.len() > MAX_VERTICES {return invalid("OBJ exceeds one million normals");}
            }
            Some("mtllib") => has_external_material_library = true,
            Some("usemtl") => {
                if mesh.indices.len() > active_part_start {
                    mesh.parts.push(MeshPart {
                        name: active_material.clone(),
                        index_start: active_part_start,
                        index_count: mesh.indices.len() - active_part_start,
                    });
                }
                active_part_start = mesh.indices.len();
                active_material = words.next().unwrap_or("default").chars().take(128).collect();
                if !material_names.contains(&active_material) { material_names.push(active_material.clone()); }
            }
            Some("f") => {
                let mut indices = Vec::<u32>::new();
                for token in words {
                    if token.starts_with('#') { break; }
                    let tuple=face_indices(token,raw_positions.len(),raw_uvs.len(),raw_normals.len(),line_no)?;
                    let idx=if let Some(&existing)=vertex_map.get(&tuple) { existing } else {
                        if mesh.positions.len()/3 >= MAX_VERTICES {return invalid("OBJ exceeds one million unique render vertices");}
                        let next = (mesh.positions.len()/3) as u32;
                        mesh.positions.extend_from_slice(&raw_positions[tuple.0]);
                        let uv=tuple.1.map(|id|raw_uvs[id]).unwrap_or([0.,0.]);
                        mesh.uvs.extend_from_slice(&uv);
                        referenced_uvs |= tuple.1.is_some();
                        partial_uvs |= tuple.1.is_none();
                        let normal=tuple.2.map(|id|raw_normals[id]).unwrap_or([0.,0.,0.]);
                        mesh.normals.extend_from_slice(&normal);
                        declared_normals.push(tuple.2.is_some());
                        vertex_map.insert(tuple,next);
                        next
                    };
                    indices.push(idx);
                    if indices.len()>1024 {return invalid("OBJ face exceeds 1024 vertices");}
                }
                if indices.len()<3 {return invalid("OBJ face has fewer than three vertices");}
                any_faces = true;
                polygons |= indices.len()>3;
                for i in 1..indices.len()-1 {
                    if mesh.indices.len()+3 > MAX_INDICES {return invalid("OBJ exceeds two million triangles");}
                    let [a,b,c] = [indices[0],indices[i],indices[i+1]];
                    if a == b || b == c || c == a {
                        return invalid(format!("Degenerate face on line {}",line_no+1));
                    }
                    mesh.indices.extend_from_slice(&[a,b,c]);
                }
            }
            _ => {}
        }
    }
    if !any_faces || mesh.indices.is_empty() {return invalid("OBJ contains no usable mesh triangles");}
    if mesh.indices.len() > active_part_start {
        mesh.parts.push(MeshPart {
            name: active_material.clone(),
            index_start: active_part_start,
            index_count: mesh.indices.len()-active_part_start,
        });
    }
    computed_normals(&mut mesh,&declared_normals);
    if !referenced_uvs {mesh.uvs.clear();}
    if polygons {warnings.push("Polygon faces were fan-triangulated. Concave polygons should be triangulated in the source DCC tool.".into());}
    if referenced_uvs && partial_uvs {warnings.push("Some face corners lack UVs; untextured corners received (0, 0).".into());}
    if has_external_material_library {warnings.push("Material group names are preserved; external MTL/texture image files are not automatically loaded.".into());}
    warnings.push("Preview asset only. Converting workshop meshes into Halo render/collision tags is not implemented.".into());
    Ok(ObjImport {mesh,has_uvs:referenced_uvs,materials:material_names,warnings})
}
