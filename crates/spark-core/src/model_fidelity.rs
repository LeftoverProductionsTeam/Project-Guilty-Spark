//! Static source-model readback. Compiler reordering and vertex welding are
//! allowed; changed winding, UV seams, normals or native shader identities are not.
use crate::{invalid, maps::{MeshData, Tag}, Result, SparkError};
use serde::Serialize;
use std::collections::{BTreeSet, HashMap};

const POSITION_EPS: f64 = 0.00005;
const UV_EPS: f64 = 0.00005;
const MIN_NORMAL_DOT: f64 = 0.999;
const CELL: f64 = POSITION_EPS * 2.;

#[derive(Clone, Debug)]
pub struct SourceMaterialRange {
    pub index_start: usize,
    pub index_count: usize,
    pub shader_path: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct FidelityReport {
    pub triangles: usize,
    pub shader_paths: Vec<String>,
    pub max_position_error: f64,
    pub max_uv_error: f64,
    pub minimum_normal_dot: f64,
    pub winding_preserved: bool,
}
fn fail(message: &str) -> SparkError { SparkError::Invalid(message.into()) }
fn shape(mesh: &MeshData) -> Result<()> {
    let vertices = mesh.positions.len()/3;
    if vertices==0 || vertices>350000 || mesh.positions.len()%3!=0 || mesh.indices.len()%3!=0 || mesh.indices.is_empty() || mesh.indices.len()/3>32768
        || mesh.normals.len()!=mesh.positions.len() || mesh.uvs.len()!=vertices*2
        || mesh.positions.iter().any(|v|v.abs()>128.)
        || mesh.indices.iter().any(|&i|i as usize>=vertices)
        || mesh.positions.iter().chain(&mesh.normals).chain(&mesh.uvs).any(|v|!v.is_finite()) {
        return invalid("Static model fidelity requires bounded, complete finite position/normal/UV/index streams");
    }
    Ok(())
}
fn materials(count: usize, ranges: impl Iterator<Item=(usize,usize,String)>) -> Result<Vec<String>> {
    let mut result = vec![None;count];
    for (start,len,path) in ranges {
        if start%3!=0 || len%3!=0 || start.checked_add(len).is_none_or(|end|end>count*3) {
            return invalid("Model material range escapes its triangles");
        }
        for slot in &mut result[start/3..(start+len)/3] {
            if slot.is_some() {return invalid("Model material ranges overlap");}
            *slot=Some(path.replace('\\',"/").to_ascii_lowercase());
        }
    }
    result.into_iter().map(|v|v.ok_or_else(||fail("Model has triangles without a verified native shader"))).collect()
}
fn cell(mesh: &MeshData, triangle: usize) -> [i64;3] {
    std::array::from_fn(|axis| {
        let sum=mesh.indices[triangle*3..triangle*3+3].iter().map(|&i|mesh.positions[i as usize*3+axis] as f64).sum::<f64>();
        (sum/(3.*CELL)).floor() as i64
    })
}
fn compare_corners(source: &MeshData, a: usize, output: &MeshData, b: usize, offset: usize) -> Option<(f64,f64,f64)> {
    let (mut position,mut uv,mut normal)=(0f64,0f64,1f64);
    for corner in 0..3 {
        let i=source.indices[a*3+corner] as usize;
        let j=output.indices[b*3+(corner+offset)%3] as usize;
        for axis in 0..3 {position=position.max((source.positions[i*3+axis] as f64-output.positions[j*3+axis] as f64).abs());}
        for axis in 0..2 {uv=uv.max((source.uvs[i*2+axis] as f64-output.uvs[j*2+axis] as f64).abs());}
        let n=&source.normals[i*3..i*3+3];let m=&output.normals[j*3..j*3+3];
        let dot=n.iter().zip(m).map(|(&x,&y)|x as f64*y as f64).sum::<f64>();
        let length=(n.iter().map(|&x|(x as f64).powi(2)).sum::<f64>()*m.iter().map(|&x|(x as f64).powi(2)).sum::<f64>()).sqrt();
        if length<1e-10 {return None;}
        normal=normal.min((dot/length).clamp(-1.,1.));
    }
    Some((position,uv,normal))
}
pub fn compare_render(source: &MeshData, source_materials: &[SourceMaterialRange], output: &MeshData, tags: &[Tag]) -> Result<FidelityReport> {
    shape(source)?;shape(output)?;
    if source.indices.len()!=output.indices.len() {return invalid("Compiled model triangle topology differs from the authored source");}
    let count=source.indices.len()/3;
    let expected=materials(count,source_materials.iter().map(|m|(m.index_start,m.index_count,m.shader_path.clone())))?;
    let mut ranges=Vec::new();
    for range in &output.material_ranges {
        let mut matching=tags.iter().filter(|tag|tag.id==range.shader_tag_id && matches!(tag.class.as_str(),"soso"|"senv"));
        let tag=matching.next().ok_or_else(||fail("Compiled model shader reference is missing or unsupported"))?;
        if matching.next().is_some(){return invalid("Compiled model shader identity is ambiguous");}
        ranges.push((range.index_start,range.index_count,tag.path.clone()));
    }
    let actual=materials(count,ranges.into_iter())?;
    let mut candidates=HashMap::<[i64;3],Vec<usize>>::new();
    for triangle in 0..count {
        let bucket=candidates.entry(cell(source,triangle)).or_default();
        if bucket.len()>=128 {return invalid("Static fidelity encountered more than128 coincident triangles; review overlapping source surfaces");}
        bucket.push(triangle);
    }
    let mut consumed=vec![false;count];
    let mut report=FidelityReport{triangles:count,shader_paths:expected.iter().cloned().collect::<BTreeSet<_>>().into_iter().collect(),max_position_error:0.,max_uv_error:0.,minimum_normal_dot:1.,winding_preserved:true};
    for triangle in 0..count {
        let base=cell(output,triangle);let mut found=None;
        'search: for x in -1..=1 {for y in -1..=1 {for z in -1..=1 {
            if let Some(bucket)=candidates.get(&[base[0]+x,base[1]+y,base[2]+z]) {
                for &candidate in bucket {
                    if consumed[candidate] || expected[candidate]!=actual[triangle] {continue;}
                    for offset in 0..3 {if let Some(errors)=compare_corners(source,candidate,output,triangle,offset){if errors.0<=POSITION_EPS && errors.1<=UV_EPS && errors.2>=MIN_NORMAL_DOT{found=Some((candidate,errors));break 'search;}}}
                }
            }
        }}}
        let (candidate,(position,uv,normal))=found.ok_or_else(||{
            let mut nearest=(f64::INFINITY,f64::INFINITY,-1.);
            for candidate in 0..count {if expected[candidate]==actual[triangle]{for offset in 0..3{if let Some(errors)=compare_corners(source,candidate,output,triangle,offset){if errors.0<nearest.0{nearest=errors;}}}}}
            fail(&format!("Compiled model triangle {triangle} changes authored topology, winding, normals, UV seams or shader assignment (nearest position error {:.8}, UV error {:.8}, normal dot {:.8}); output was not adopted",nearest.0,nearest.1,nearest.2))
        })?;
        consumed[candidate]=true;
        report.max_position_error=report.max_position_error.max(position);report.max_uv_error=report.max_uv_error.max(uv);report.minimum_normal_dot=report.minimum_normal_dot.min(normal);
    }
    Ok(report)
}
