//! A bounded external OBJ fork. Native tags, source assets and history remain
//! under their existing owners; adopting a review uses the ordinary OBJ import.
use crate::{assets, invalid, library::Library, project, reject_links, Result, SparkError};
use serde::{Deserialize, Serialize};
use std::{fs, io::Read, path::{Path, PathBuf}};
use sha2::{Digest, Sha256};
const MAX_BYTES: u64 = 64 * 1024 * 1024;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct Handoff {
    pub schema_version: u32, pub id: String, pub project_id: String,
    pub asset_id: String, pub baseline_sha256: String, pub source_sha256: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Prepared { pub handoff: Handoff, pub working_path: PathBuf }
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Review {
    pub handoff: Handoff, pub working_path: PathBuf, pub sha256: String,
    pub changed: bool, pub vertices: usize, pub triangles: usize, pub complete_uvs: bool,
    pub materials: Vec<String>, pub warnings: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Stamp { pub bytes:u64, pub modified_nanos:String }
pub fn stamp(lib:&Library,project_id:&str,id:&str)->Result<Stamp>{
    lib.get(project_id)?;let path=folder(lib,project_id,id)?.join("working.obj");reject_links(&path)?;
    let meta=fs::metadata(path)?;if !meta.is_file()||meta.len()>MAX_BYTES{return invalid("Geometry working file exceeds its bounds");}
    Ok(Stamp{bytes:meta.len(),modified_nanos:meta.modified()?.duration_since(std::time::UNIX_EPOCH).map_err(|_|SparkError::Invalid("Invalid source timestamp".into()))?.as_nanos().to_string()})
}
fn bounded(path:&Path, max:u64)->Result<Vec<u8>>{
    reject_links(path)?;
    let meta=fs::metadata(path)?;
    if !meta.is_file()||meta.len()>max{return invalid("Geometry source exceeds its ordinary-file/size bound");}
    let mut bytes=vec![];fs::File::open(path)?.take(max+1).read_to_end(&mut bytes)?;
    if bytes.len() as u64>max{return invalid("Geometry source grew beyond its size bound");}Ok(bytes)
}
fn digest(bytes:&[u8])->String{crate::hex_bytes(Sha256::digest(bytes))}
fn folder(lib:&Library,project_id:&str,id:&str)->Result<PathBuf>{
    uuid::Uuid::parse_str(id).map_err(|_|SparkError::Invalid("Invalid geometry handoff identity".into()))?;
    let root=lib.project_dir(project_id)?.join("geometry-handoffs").join(id);reject_links(&root)?;Ok(root)
}
fn source(lib:&Library,p:&project::Project,asset_id:&str)->Result<(Vec<u8>,String)>{
    let a=p.assets.iter().find(|a|a.id==asset_id&&a.kind=="obj").ok_or_else(||SparkError::Invalid("Select an imported OBJ in this project's Asset workshop".into()))?;
    uuid::Uuid::parse_str(asset_id).map_err(|_|SparkError::Invalid("Invalid source asset identity".into()))?;
    let expected=lib.project_dir(&p.id)?.join("assets").join(format!("{asset_id}.obj"));
    reject_links(&a.path)?;reject_links(&expected)?;
    if fs::canonicalize(&a.path)?!=fs::canonicalize(expected)?{return invalid("Geometry does not belong to this project");}
    let bytes=bounded(&a.path,MAX_BYTES)?;
    if digest(&bytes)!=a.sha256{return invalid("Original geometry source changed; preserve and reimport it before handoff");}
    assets::parse_obj(std::str::from_utf8(&bytes).map_err(|_|SparkError::Invalid("OBJ source must be UTF-8".into()))?)?;
    Ok((bytes,a.sha256.clone()))
}
pub fn prepare(lib:&Library,project_id:&str,asset_id:&str)->Result<Prepared>{
    let p=lib.get(project_id)?;let(bytes,sha)=source(lib,&p,asset_id)?;
    let parent=lib.project_dir(project_id)?.join("geometry-handoffs");reject_links(&parent)?;
    if parent.exists()&&fs::read_dir(&parent)?.count()>=16{return invalid("Sixteen geometry forks are retained for this project. Reuse a saved handoff; no source was removed");}
    let id=uuid::Uuid::new_v4().to_string();let root=folder(lib,project_id,&id)?;fs::create_dir_all(&root)?;
    let handoff=Handoff{schema_version:1,id,project_id:project_id.into(),asset_id:asset_id.into(),baseline_sha256:sha,source_sha256:p.source.map(|s|s.sha256)};
    project::atomic_write(&root.join("baseline.obj"),&bytes,false)?;
    project::atomic_write(&root.join("working.obj"),&bytes,false)?;
    project::atomic_write(&root.join("handoff.json"),&serde_json::to_vec_pretty(&handoff)?,false)?;
    Ok(Prepared{handoff,working_path:root.join("working.obj")})
}
pub fn prepared(lib:&Library,project_id:&str,id:&str)->Result<Prepared>{
    let root=folder(lib,project_id,id)?;
    let handoff:Handoff=serde_json::from_slice(&bounded(&root.join("handoff.json"),16*1024)?)?;
    if handoff.schema_version!=1||handoff.id!=id||handoff.project_id!=project_id{return invalid("Geometry handoff belongs to another project or version");}
    let p=lib.get(project_id)?;let(_,original)=source(lib,&p,&handoff.asset_id)?;
    if original!=handoff.baseline_sha256||p.source.as_ref().map(|s|&s.sha256)!=handoff.source_sha256.as_ref()
        ||digest(&bounded(&root.join("baseline.obj"),MAX_BYTES)?)!=handoff.baseline_sha256{
        return invalid("Geometry baseline or map source changed; keep this fork for recovery and prepare the correct source");
    }
    Ok(Prepared{handoff,working_path:root.join("working.obj")})
}
pub fn review(lib:&Library,project_id:&str,id:&str)->Result<Review>{
    let ready=prepared(lib,project_id,id)?;let bytes=bounded(&ready.working_path,MAX_BYTES)?;
    let parsed=assets::parse_obj(std::str::from_utf8(&bytes).map_err(|_|SparkError::Invalid("Edited OBJ must be UTF-8".into()))?)?;
    let sha=digest(&bytes);
    Ok(Review{changed:sha!=ready.handoff.baseline_sha256,handoff:ready.handoff,working_path:ready.working_path,sha256:sha,
        vertices:parsed.mesh.positions.len()/3,triangles:parsed.mesh.indices.len()/3,complete_uvs:parsed.complete_uvs,
        materials:parsed.materials,warnings:parsed.warnings})
}
