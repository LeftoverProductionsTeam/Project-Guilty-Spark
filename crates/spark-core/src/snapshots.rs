//! Versioned, atomic project metadata snapshots. Original maps/assets are
//! referenced, never rewritten, replaced, or pruned by snapshot retention.
use crate::{project::{self,Project},invalid,reject_links,Result};
use serde::{Serialize,Deserialize};
use sha2::{Digest,Sha256};
use std::{fs,path::{Path,PathBuf}};
const MAX_BYTES:u64=34*1024*1024;
pub const BEFORE_SHARED_RECOVERY: &str = "before-shared-recovery";
#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct Snapshot {schema_version:u32,id:String,created_at:String,reason:String,project:Project}
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct SnapshotInfo {pub id:String,pub created_at:String,pub reason:String,pub sha256:String,
    pub title:String,pub scene_objects:usize,pub tag_edits:usize,pub source_sha256:Option<String>}
fn folder(project_dir:&Path)->Result<PathBuf>{let p=project_dir.join("snapshots");reject_links(&p)?;Ok(p)}
fn read(project_dir:&Path,id:&str)->Result<(Snapshot,SnapshotInfo)> {
    uuid::Uuid::parse_str(id).map_err(|_|crate::SparkError::Invalid("Invalid snapshot ID".into()))?;
    let path=folder(project_dir)?.join(format!("{id}.gsproject"));reject_links(&path)?;
    let file=fs::File::open(path)?;
    if !file.metadata()?.is_file() || file.metadata()?.len()>MAX_BYTES {return invalid("Snapshot exceeds the project size bound");}
    use std::io::Read;let mut bytes=vec![];file.take(MAX_BYTES+1).read_to_end(&mut bytes)?;
    if bytes.len() as u64>MAX_BYTES{return invalid("Snapshot grew beyond its size bound");}
    let snapshot:Snapshot=serde_json::from_slice(&bytes)?;
    if snapshot.schema_version!=1 || snapshot.id!=id {return invalid("Unsupported or mismatched snapshot");}
    snapshot.project.validate()?;
    let info=SnapshotInfo{id:id.into(),created_at:snapshot.created_at.clone(),reason:snapshot.reason.clone(),
        sha256:format!("{:x}",Sha256::digest(bytes)),title:snapshot.project.title.clone(),scene_objects:snapshot.project.scene.len(),
        tag_edits:snapshot.project.tag_edits.len(),source_sha256:snapshot.project.source.as_ref().map(|s|s.sha256.clone())};
    Ok((snapshot,info))
}
pub fn list(project_dir:&Path)->Result<Vec<SnapshotInfo>> {
    let dir=folder(project_dir)?;if !dir.is_dir(){return Ok(vec![])}
    let mut out=vec![];
    for entry in fs::read_dir(dir)?.take(2048) {
        let entry=entry?;let path=entry.path();
        if path.extension().is_some_and(|e|e=="gsproject") {
            if let Some(id)=path.file_stem().and_then(|s|s.to_str()).filter(|s|uuid::Uuid::parse_str(s).is_ok()) {
                // A failed/interrupted write is never a restore candidate.
                if let Ok((_,info))=read(project_dir,id){out.push(info);}
            }
        }
    }
    out.sort_by(|a,b|b.created_at.cmp(&a.created_at));Ok(out)
}
pub fn create(project_dir:&Path,project:&Project,reason:&str,retention:usize)->Result<SnapshotInfo> {
    if !(1..=100).contains(&retention) || !["manual","periodic","before-build","before-restore","before-upgrade","before-shared-session",BEFORE_SHARED_RECOVERY].contains(&reason) {
        return invalid("Snapshot retention must be 1–100 and the reason must be known");
    }
    project.validate()?;
    let dir=folder(project_dir)?;fs::create_dir_all(&dir)?;
    let id=uuid::Uuid::new_v4().to_string();
    let snapshot=Snapshot{schema_version:1,id:id.clone(),created_at:chrono::Utc::now().to_rfc3339(),reason:reason.into(),project:project.clone()};
    let bytes=serde_json::to_vec(&snapshot)?;if bytes.len() as u64>MAX_BYTES{return invalid("Snapshot too large");}
    project::atomic_write(&dir.join(format!("{id}.gsproject")),&bytes,false)?;
    let (_,verified)=read(project_dir,&id)?;
    for old in list(project_dir)?.into_iter().skip(retention) {
        let path=dir.join(format!("{}.gsproject",old.id));reject_links(&path)?;
        fs::remove_file(path)?; // a verified UUID leaf in this project's snapshot folder
    }
    Ok(verified)
}
pub fn preview(project_dir:&Path,current:&Project,id:&str,expected_sha256:&str)->Result<Project> {
    let (snapshot,info)=read(project_dir,id)?;
    if info.sha256!=expected_sha256{return invalid("Snapshot changed since preview; inspect it again");}
    let p=snapshot.project;
    if p.id!=current.id || p.source.as_ref().map(|s|(&s.sha256,&s.preserved_path))!=
        current.source.as_ref().map(|s|(&s.sha256,&s.preserved_path)) {
        return invalid("Snapshot belongs to a different project or original source");
    }
    if let Some(source)=current.source.as_ref() {
        if crate::maps::hash_file(&source.preserved_path)?!=source.sha256{return invalid("Preserved source checksum changed; restore refused");}
    }
    Ok(p)
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn retention_preview_interruption_and_source_identity() {
        let dir=tempfile::tempdir().unwrap();let mut p=Project::new("First");
        let first=create(dir.path(),&p,"manual",2).unwrap();p.title="Second".into();
        let second=create(dir.path(),&p,"periodic",2).unwrap();
        assert_eq!(preview(dir.path(),&p,&first.id,&first.sha256).unwrap().title,"First");
        fs::write(folder(dir.path()).unwrap().join(".spark-write-interrupted.tmp"),b"partial").unwrap();
        fs::write(folder(dir.path()).unwrap().join(format!("{}.gsproject",uuid::Uuid::new_v4())),b"partial").unwrap();
        assert_eq!(list(dir.path()).unwrap().len(),2);
        assert!(preview(dir.path(),&p,&second.id,&"0".repeat(64)).is_err());
        let foreign=Project::new("Another");assert!(preview(dir.path(),&foreign,&first.id,&first.sha256).is_err());
        create(dir.path(),&p,"before-build",2).unwrap();assert_eq!(list(dir.path()).unwrap().len(),2);
        let recovery=create(dir.path(),&p,BEFORE_SHARED_RECOVERY,2).unwrap();
        assert_eq!(recovery.reason,BEFORE_SHARED_RECOVERY);
        assert_eq!(preview(dir.path(),&p,&recovery.id,&recovery.sha256).unwrap().title,p.title);
        assert!(preview(dir.path(),&p,"../source.map",&first.sha256).is_err());
    }
}
