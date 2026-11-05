//! Versioned, atomic project metadata snapshots. Original maps/assets are
//! referenced, never rewritten, replaced, or pruned by snapshot retention.
use crate::{project::{self,Project},invalid,reject_links,Result};
use serde::{Serialize,Deserialize};
use sha2::{Digest,Sha256};
use std::{fs,path::{Path,PathBuf}};
const MAX_BYTES:u64=34*1024*1024;
pub const BEFORE_SHARED_RECOVERY: &str = "before-shared-recovery";
pub const BEFORE_SHARED_ROLLOVER: &str = "before-shared-rollover";
#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct Snapshot {schema_version:u32,id:String,created_at:String,reason:String,project:Project,
    #[serde(default)] automatic_retention_owned:bool}
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct SnapshotInfo {pub id:String,pub created_at:String,pub reason:String,pub sha256:String,
    pub title:String,pub scene_objects:usize,pub tag_edits:usize,pub source_sha256:Option<String>,pub bytes:u64,pub automatic:bool}
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
        sha256:crate::hex_bytes(Sha256::digest(&bytes)),title:snapshot.project.title.clone(),scene_objects:snapshot.project.scene.len(),
        tag_edits:snapshot.project.tag_edits.len(),source_sha256:snapshot.project.source.as_ref().map(|s|s.sha256.clone()),bytes:bytes.len() as u64,
        automatic:snapshot.reason=="periodic"&&snapshot.automatic_retention_owned};
    Ok((snapshot,info))
}
pub fn list(project_dir:&Path)->Result<Vec<SnapshotInfo>> {
    let dir=folder(project_dir)?;if !dir.is_dir(){return Ok(vec![])}
    let mut out=vec![];
    for (index,entry) in fs::read_dir(dir)?.enumerate() {
        if index>=2048{return invalid("Snapshot inventory exceeds its 2048-entry bound; no backups were removed");}
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
    if !(1..=100).contains(&retention) || !["manual","periodic","before-build","before-restore","before-upgrade","before-shared-session",BEFORE_SHARED_RECOVERY,BEFORE_SHARED_ROLLOVER].contains(&reason) {
        return invalid("Snapshot retention must be 1–100 and the reason must be known");
    }
    project.validate()?;
    // Save timestamps are not a new recoverable revision. Compare the full
    // metadata, not the narrower native-build fingerprint: names, provenance,
    // editor preferences and source/resource bindings must also be preserved.
    // Explicit manual/build/recovery checkpoints always retain their meaning.
    if reason=="periodic" {
        if let Some(latest)=list(project_dir)?.first() {
            let (snapshot,verified)=read(project_dir,&latest.id)?;
            let mut previous=snapshot.project;
            previous.modified_at=project.modified_at.clone();
            if serde_json::to_vec(&previous)?==serde_json::to_vec(project)? {return Ok(verified);}
        }
    }
    let dir=folder(project_dir)?;fs::create_dir_all(&dir)?;
    let id=uuid::Uuid::new_v4().to_string();
    let snapshot=Snapshot{schema_version:1,id:id.clone(),created_at:chrono::Utc::now().to_rfc3339(),reason:reason.into(),project:project.clone(),automatic_retention_owned:reason=="periodic"};
    let bytes=serde_json::to_vec(&snapshot)?;if bytes.len() as u64>MAX_BYTES{return invalid("Snapshot too large");}
    project::atomic_write(&dir.join(format!("{id}.gsproject")),&bytes,false)?;
    let (_,verified)=read(project_dir,&id)?;
    // Creation never confirms cleanup on the user's behalf. Only the reviewed
    // excess-automatic UUID/hash command below may retire versioned backups.
    Ok(verified)
}
pub fn create_automatic(project_dir:&Path,project:&Project,legacy_default:usize)->Result<Option<SnapshotInfo>> {
    project.validate()?;
    let retention=project.effective_automatic_backup_retention(legacy_default)?;
    if retention==0{return Ok(None);}
    let mut owned=0;
    for info in list(project_dir)?.into_iter().filter(|info|info.automatic) {
        let (snapshot,_)=read(project_dir,&info.id)?;
        if snapshot.project.id==project.id&&project::same_source_identity(&snapshot.project,project){owned+=1;}
    }
    // A cap is not permission to delete a recovery revision. The user can
    // review one exact oldest owned slot before another backup is allocated.
    if owned>=retention{return Ok(None);}
    create(project_dir,project,"periodic",retention).map(Some)
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

#[derive(Clone,Debug,Serialize,Deserialize,PartialEq,Eq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct CleanupEntry {pub id:String,pub sha256:String,pub bytes:u64}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct CleanupPlan {pub project_id:String,pub source_sha256:Option<String>,pub retention:usize,pub entries:Vec<CleanupEntry>}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct CleanupResult {pub files:usize,pub logical_bytes:u64}
pub fn cleanup_plan(project_dir:&Path,project:&Project,legacy_default:usize)->Result<CleanupPlan> {
    project.validate()?;let retention=project.effective_automatic_backup_retention(legacy_default)?;
    let mut owned=vec![];
    for info in list(project_dir)?.into_iter().filter(|info|info.automatic) {
        let (snapshot,_)=read(project_dir,&info.id)?;
        if snapshot.project.id==project.id&&project::same_source_identity(&snapshot.project,project){owned.push(info);}
    }
    Ok(CleanupPlan{project_id:project.id.clone(),source_sha256:project.source.as_ref().map(|s|s.sha256.clone()),retention,
        entries:if owned.len()>=retention {owned.into_iter().skip(retention.saturating_sub(1)).map(|info|CleanupEntry{id:info.id,sha256:info.sha256,bytes:info.bytes}).collect()}else{vec![]}})
}
/// Stateless review of exact UUID/hash leaves. Manual, safety and legacy
/// snapshots are never eligible, even when automatic backups are disabled.
pub fn cleanup(project_dir:&Path,project:&Project,legacy_default:usize,plan:&CleanupPlan,confirmed:bool)->Result<CleanupResult> {
    if !confirmed{return invalid("Review and confirm excess automatic backups before cleanup");}
    let current=cleanup_plan(project_dir,project,legacy_default)?;
    if plan.project_id!=current.project_id||plan.source_sha256!=current.source_sha256||plan.retention!=current.retention||plan.entries.len()>2048 {
        return invalid("Backup project, source or retention changed after review");
    }
    let mut seen=std::collections::HashSet::new();
    for requested in &plan.entries {
        if !seen.insert(&requested.id)||!current.entries.contains(requested){return invalid("A reviewed backup changed or is not an excess owned automatic backup");}
        let (snapshot,info)=read(project_dir,&requested.id)?;
        if !info.automatic||info.sha256!=requested.sha256||snapshot.project.id!=project.id||!project::same_source_identity(&snapshot.project,project){return invalid("Reviewed backup identity or bytes changed");}
    }
    // Validate every requested row before removing the first one.
    let mut logical_bytes=0;
    for requested in &plan.entries {
        let (_,info)=read(project_dir,&requested.id)?;
        if info.sha256!=requested.sha256{return invalid("Backup changed during cleanup; remaining backups retained");}
        let file=folder(project_dir)?.join(format!("{}.gsproject",requested.id));reject_links(&file)?;fs::remove_file(file)?;logical_bytes+=requested.bytes;
    }
    Ok(CleanupResult{files:plan.entries.len(),logical_bytes})
}
#[derive(Default,Serialize)]
#[serde(rename_all="camelCase")]
pub struct Usage {pub count:usize,pub logical_bytes:u64,pub allocated_bytes:Option<u64>}
impl Usage {
    fn measured()->Self{Self{allocated_bytes:Some(0),..Default::default()}}
    fn add_file(&mut self,file:&Path)->Result<()> {
        reject_links(file)?;if !fs::symlink_metadata(file)?.is_file(){return invalid("Backup entry is not an ordinary file");}
        let size=crate::storage::measure(file)?;self.count+=1;self.logical_bytes+=size.logical_bytes;
        self.allocated_bytes=self.allocated_bytes.zip(size.allocated_bytes).map(|(a,b)|a.saturating_add(b));Ok(())
    }
    fn add(&mut self,other:&Self){self.count+=other.count;self.logical_bytes+=other.logical_bytes;self.allocated_bytes=self.allocated_bytes.zip(other.allocated_bytes).map(|(a,b)|a.saturating_add(b));}
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct RecoveryUsage {pub present:bool,pub valid:bool,pub logical_bytes:u64,pub allocated_bytes:Option<u64>}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Overview {pub project_id:String,pub automatic_retention:usize,pub inherited:bool,pub automatic_at_capacity:bool,pub automatic_blocked_reason:Option<String>,pub automatic:Usage,pub manual:Usage,pub safety:Usage,pub legacy:Usage,pub recovery:RecoveryUsage,pub total:Usage,pub cleanup:CleanupPlan}
pub fn overview(project_dir:&Path,project:&Project,legacy_default:usize)->Result<Overview> {
    let mut automatic=Usage::measured();let mut manual=Usage::measured();let mut safety=Usage::measured();let mut legacy=Usage::measured();let dir=folder(project_dir)?;
    let mut recognized=std::collections::HashSet::new();
    for info in list(project_dir)? {
        let file=dir.join(format!("{}.gsproject",info.id));recognized.insert(file.clone());
        let group=if info.automatic{&mut automatic}else if info.reason=="manual"{&mut manual}else if info.reason=="periodic"{&mut legacy}else{&mut safety};group.add_file(&file)?;
    }
    if dir.is_dir(){for (n,entry) in fs::read_dir(&dir)?.enumerate(){if n>=2048{return invalid("Backup usage exceeds its inventory bound");}let file=entry?.path();if !recognized.contains(&file)&&fs::symlink_metadata(&file)?.is_file(){legacy.add_file(&file)?;}}}
    let fixed=project::project_recovery_path(&project_dir.join("project.gsproject"))?;reject_links(&fixed)?;
    let mut recovered=Usage::measured();let present=fixed.exists();
    if present{recovered.add_file(&fixed)?;}
    let valid=present&&project::load_project(&fixed).is_ok_and(|p|p.id==project.id&&project::same_source_identity(&p,project));
    for (n,entry) in fs::read_dir(project_dir)?.enumerate(){
        if n>=4096{return invalid("Project backup usage exceeds its inventory bound");}
        let file=entry?.path();if file.file_name().and_then(|s|s.to_str()).and_then(|s|s.strip_prefix("project.gsproject.bak-")).is_some_and(|id|uuid::Uuid::parse_str(id).is_ok()){legacy.add_file(&file)?;}
    }
    let mut total=Usage::measured();for group in [&automatic,&manual,&safety,&legacy,&recovered]{total.add(group);}
    let automatic_retention=project.effective_automatic_backup_retention(legacy_default)?;
    let automatic_at_capacity=automatic_retention>0&&automatic.count>=automatic_retention;
    let automatic_blocked_reason=if automatic_retention==0{Some("Automatic backups are disabled; current project, recovery copy and Undo history remain separate".into())}else if automatic_at_capacity{Some("Automatic backup limit reached; review owned backups to free a slot. Recovery copy and Undo history remain enabled".into())}else{None};
    Ok(Overview{project_id:project.id.clone(),automatic_retention,inherited:project.automatic_backup_retention.is_none(),automatic_at_capacity,automatic_blocked_reason,automatic,manual,safety,legacy,
        recovery:RecoveryUsage{present,valid,logical_bytes:recovered.logical_bytes,allocated_bytes:recovered.allocated_bytes},total,cleanup:cleanup_plan(project_dir,project,legacy_default)?})
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn unchanged_periodic_metadata_reuses_only_the_latest_verified_checkpoint() {
        let dir=tempfile::tempdir().unwrap();let mut p=Project::new("First");
        let first=create(dir.path(),&p,"periodic",10).unwrap();
        p.modified_at="later save timestamp".into();
        let same=create(dir.path(),&p,"periodic",10).unwrap();
        assert_eq!(same.id,first.id);assert_eq!(list(dir.path()).unwrap().len(),1);
        // The build fingerprint deliberately omits names/provenance. Snapshot
        // equality must preserve these metadata edits as well as native inputs.
        p.title="Renamed".into();
        let renamed=create(dir.path(),&p,"periodic",10).unwrap();assert_ne!(renamed.id,first.id);
        p.title="First".into();
        let returned=create(dir.path(),&p,"periodic",10).unwrap();assert_ne!(returned.id,first.id);
        let manual=create(dir.path(),&p,"manual",10).unwrap();assert_ne!(manual.id,returned.id);
        assert_eq!(create(dir.path(),&p,"periodic",10).unwrap().id,manual.id);
        let build=create(dir.path(),&p,"before-build",10).unwrap();assert_ne!(build.id,manual.id);
        // An unreadable latest checkpoint cannot suppress a replacement.
        fs::write(folder(dir.path()).unwrap().join(format!("{}.gsproject",build.id)),b"corrupt").unwrap();
        p.provenance.description="New recoverable metadata".into();
        let replacement=create(dir.path(),&p,"periodic",10).unwrap();
        assert_ne!(replacement.id,build.id);
        assert_eq!(preview(dir.path(),&p,&replacement.id,&replacement.sha256).unwrap().provenance.description,p.provenance.description);
    }
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
        create(dir.path(),&p,"before-build",2).unwrap();assert_eq!(list(dir.path()).unwrap().len(),3);
        let recovery=create(dir.path(),&p,BEFORE_SHARED_RECOVERY,2).unwrap();
        assert_eq!(recovery.reason,BEFORE_SHARED_RECOVERY);
        assert_eq!(preview(dir.path(),&p,&recovery.id,&recovery.sha256).unwrap().title,p.title);
        let rollover=create(dir.path(),&p,BEFORE_SHARED_ROLLOVER,2).unwrap();
        assert_eq!(rollover.reason,BEFORE_SHARED_ROLLOVER);
        assert_eq!(preview(dir.path(),&p,&rollover.id,&rollover.sha256).unwrap().title,p.title);
        assert!(create(dir.path(),&p,"unknown-reason",2).is_err());
        assert!(preview(dir.path(),&p,"../source.map",&first.sha256).is_err());
    }
    #[test] fn twenty_edits_cap_owned_automatic_backups_and_preserve_recovery_and_other_projects() {
        let one=tempfile::tempdir().unwrap();let two=tempfile::tempdir().unwrap();let mut p=Project::new("One");let mut other=Project::new("Two");
        p.automatic_backup_retention=Some(3);other.automatic_backup_retention=Some(3);
        let file=one.path().join("project.gsproject");project::save_managed_project(&file,&p).unwrap();
        let manual=create(one.path(),&p,"manual",3).unwrap();let safety=create(one.path(),&p,"before-build",3).unwrap();
        let foreign=create_automatic(two.path(),&other,20).unwrap().unwrap();
        let mut created=0;
        for edit in 1..=20 {p.title=format!("Edit {edit}");project::save_managed_project(&file,&p).unwrap();if create_automatic(one.path(),&p,20).unwrap().is_some(){created+=1;}}
        assert_eq!(created,3);let usage=overview(one.path(),&p,20).unwrap();assert_eq!(usage.automatic.count,3);assert!(usage.automatic_at_capacity);assert!(usage.automatic_blocked_reason.unwrap().contains("limit reached"));
        assert_eq!(usage.manual.count,1);assert_eq!(usage.safety.count,1);assert!(usage.recovery.present&&usage.recovery.valid);assert_eq!(usage.cleanup.entries.len(),1);
        assert_eq!(preview(one.path(),&p,&manual.id,&manual.sha256).unwrap().title,"One");assert_eq!(preview(one.path(),&p,&safety.id,&safety.sha256).unwrap().title,"One");
        assert_eq!(preview(two.path(),&other,&foreign.id,&foreign.sha256).unwrap().title,"Two");
        assert_eq!(project::load_project(&file).unwrap().title,"Edit 20");assert_eq!(project::load_project(&project::project_recovery_path(&file).unwrap()).unwrap().title,"Edit 19");
    }
    #[test] fn default_none_disables_only_automatic_backups_without_deleting_history() {
        let dir=tempfile::tempdir().unwrap();let mut p=Project::new("Saved");assert_eq!(p.automatic_backup_retention,Some(0));
        assert!(create_automatic(dir.path(),&p,20).unwrap().is_none());assert!(!dir.path().join("snapshots").exists());
        let manual=create(dir.path(),&p,"manual",3).unwrap();let safety=create(dir.path(),&p,BEFORE_SHARED_RECOVERY,3).unwrap();
        let file=dir.path().join("project.gsproject");project::save_managed_project(&file,&p).unwrap();p.title="Latest".into();p.history.push(project::HistoryEntry{id:uuid::Uuid::new_v4().to_string(),timestamp:"now".into(),description:"Undo remains authored metadata".into()});project::save_managed_project(&file,&p).unwrap();
        assert!(create_automatic(dir.path(),&p,20).unwrap().is_none());assert_eq!(list(dir.path()).unwrap().len(),2);
        assert_eq!(preview(dir.path(),&p,&manual.id,&manual.sha256).unwrap().title,"Saved");assert!(preview(dir.path(),&p,&safety.id,&safety.sha256).is_ok());
        assert_eq!(project::load_project(&file).unwrap().history.len(),1);assert_eq!(project::load_project(&project::project_recovery_path(&file).unwrap()).unwrap().title,"Saved");
    }
    #[test] fn explicit_cleanup_validates_all_hashes_and_rejects_foreign_manual_legacy_and_policy_changes() {
        let dir=tempfile::tempdir().unwrap();let mut p=Project::new("Project");
        p.automatic_backup_retention=Some(3);
        let legacy=create(dir.path(),&p,"periodic",3).unwrap();let legacy_file=folder(dir.path()).unwrap().join(format!("{}.gsproject",legacy.id));
        let mut legacy_json:serde_json::Value=serde_json::from_slice(&fs::read(&legacy_file).unwrap()).unwrap();legacy_json.as_object_mut().unwrap().remove("automaticRetentionOwned");fs::write(&legacy_file,serde_json::to_vec(&legacy_json).unwrap()).unwrap();
        for n in 0..3 {p.title=format!("Automatic {n}");create_automatic(dir.path(),&p,20).unwrap().unwrap();}
        let manual=create(dir.path(),&p,"manual",3).unwrap();let safety=create(dir.path(),&p,"before-build",3).unwrap();let plan=cleanup_plan(dir.path(),&p,20).unwrap();assert_eq!(plan.entries.len(),1);
        assert!(cleanup(dir.path(),&p,20,&plan,false).is_err());
        let mut unsafe_plan=plan.clone();unsafe_plan.entries.push(CleanupEntry{id:manual.id.clone(),sha256:manual.sha256.clone(),bytes:manual.bytes});
        assert!(cleanup(dir.path(),&p,20,&unsafe_plan,true).is_err());assert_eq!(list(dir.path()).unwrap().len(),6);
        unsafe_plan.entries.pop();unsafe_plan.entries.push(CleanupEntry{id:safety.id.clone(),sha256:safety.sha256.clone(),bytes:safety.bytes});assert!(cleanup(dir.path(),&p,20,&unsafe_plan,true).is_err());
        let other=Project::new("Other");assert!(cleanup(dir.path(),&other,20,&plan,true).is_err());
        p.automatic_backup_retention=Some(1);assert!(cleanup(dir.path(),&p,20,&plan,true).is_err());p.automatic_backup_retention=Some(3);
        unsafe_plan=plan.clone();unsafe_plan.entries[0].sha256="0".repeat(64);assert!(cleanup(dir.path(),&p,20,&unsafe_plan,true).is_err());assert_eq!(list(dir.path()).unwrap().len(),6);
        let result=cleanup(dir.path(),&p,20,&plan,true).unwrap();assert_eq!(result.files,1);assert_eq!(list(dir.path()).unwrap().len(),5);assert!(legacy_file.is_file());
        p.title="Next allocation after explicit review".into();assert!(create_automatic(dir.path(),&p,20).unwrap().is_some());assert_eq!(overview(dir.path(),&p,20).unwrap().automatic.count,3);
        assert!(cleanup_plan(dir.path(),&p,20).unwrap().entries.iter().all(|entry|entry.id!=legacy.id&&entry.id!=manual.id&&entry.id!=safety.id));
    }
}
