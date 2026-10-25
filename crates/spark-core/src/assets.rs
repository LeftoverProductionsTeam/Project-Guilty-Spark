use crate::{invalid, maps::MeshData, Result};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjImport {
    pub mesh: MeshData,
    pub has_uvs: bool,
    pub materials: Vec<String>,
    pub warnings: Vec<String>,
}
pub fn parse_obj(text: &str) -> Result<ObjImport> {
    if text.len() > 64 * 1024 * 1024 {
        return invalid("OBJ limit is 64 MiB");
    }
    let mut mesh = MeshData {
        label: "Imported OBJ mesh".into(),
        source: "obj".into(),
        ..Default::default()
    };
    let mut uvs = 0;
    let mut materials = vec![];
    let mut polygons = false;
    for (line_no, line) in text.lines().enumerate() {
        let mut words = line.split_whitespace();
        match words.next() {
            Some("v") => {
                let mut p = [0.0f32; 3];
                for v in &mut p {
                    *v = words
                        .next()
                        .ok_or_else(|| {
                            crate::SparkError::Invalid(format!(
                                "Incomplete vertex on line {}",
                                line_no + 1
                            ))
                        })?
                        .parse()
                        .map_err(|_| crate::SparkError::Invalid("Invalid OBJ coordinate".into()))?;
                    if !v.is_finite() || v.abs() > 1e7 {
                        return invalid("Invalid OBJ vertex coordinate");
                    }
                }
                mesh.positions.extend_from_slice(&p);
                if mesh.positions.len() > 3_000_000 {
                    return invalid("OBJ exceeds one million vertices");
                }
            }
            Some("vt") => uvs += 1,
            Some("usemtl") => {
                let name = words
                    .next()
                    .unwrap_or("")
                    .chars()
                    .take(128)
                    .collect::<String>();
                if !materials.contains(&name) {
                    materials.push(name);
                }
            }
            Some("f") => {
                let n = (mesh.positions.len() / 3) as i64;
                let mut indices = vec![];
                for word in words {
                    let idx: i64 =
                        word.split('/').next().unwrap_or("").parse().map_err(|_| {
                            crate::SparkError::Invalid("Invalid OBJ face index".into())
                        })?;
                    let actual = if idx < 0 { n + idx } else { idx - 1 };
                    if actual < 0 || actual >= n {
                        return invalid(format!(
                            "OBJ face index is out of range on line {}",
                            line_no + 1
                        ));
                    }
                    indices.push(actual as u32);
                    if indices.len() > 1024 {
                        return invalid("OBJ face exceeds 1024 vertices");
                    }
                }
                if indices.len() < 3 {
                    return invalid("OBJ face has fewer than three vertices");
                }
                polygons |= indices.len() > 3;
                for i in 1..indices.len() - 1 {
                    mesh.indices
                        .extend_from_slice(&[indices[0], indices[i], indices[i + 1]]);
                }
                if mesh.indices.len() > 6_000_000 {
                    return invalid("OBJ exceeds two million triangles");
                }
            }
            _ => {}
        }
    }
    if mesh.positions.is_empty() || mesh.indices.is_empty() {
        return invalid("OBJ contains no usable mesh triangles");
    }
    let mut warnings=vec!["Preview asset only. Converting workshop meshes into Halo render/collision tags is not implemented.".into()];
    if polygons {
        warnings.push("Polygon faces were fan-triangulated. Concave polygons should be triangulated in the source DCC tool.".into());
    }
    if uvs > 0 {
        warnings.push("UV presence is indexed; texture coordinates and external material/texture files are not ingested yet.".into());
    }
    Ok(ObjImport {
        mesh,
        has_uvs: uvs > 0,
        materials,
        warnings,
    })
}
