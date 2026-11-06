//! One durable local-window history per managed project. Window leases live in
//! the desktop layer; revisions here make an old owner unable to overwrite a
//! newer acknowledged head. No Halo bytes or tool commands are stored here.
use crate::{invalid, project::{self, Project}, reject_links, Result};
use serde::{Deserialize, Serialize};
use std::{collections::{BTreeMap, BTreeSet}, fs, path::Path};
use sha2::{Digest, Sha256};

const MAX_SNAPSHOT: u64 = 32 * 1024 * 1024;
const MAX_TRANSFER: usize = 64 * 1024 * 1024;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct Head {
    pub current: String, pub past: Vec<String>, pub future: Vec<String>,
    pub dirty: bool, pub limit: usize,
}
impl Head {
    fn keys(&self) -> impl Iterator<Item=&String> { std::iter::once(&self.current).chain(&self.past).chain(&self.future) }
    fn validate(&self) -> Result<()> {
        if !(1..=1000).contains(&self.limit) || self.past.len()>self.limit || self.future.len()>self.limit {
            return invalid("Window history exceeds its configured bound");
        }
        for key in self.keys() { uuid::Uuid::parse_str(key).map_err(|_|crate::SparkError::Invalid("Invalid history snapshot identity".into()))?; }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct Snapshot { pub key: String, pub project: Project }
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
struct Stored { schema_version:u32, project_id:String, revision:u64, head:Head, hashes:BTreeMap<String,String> }
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
struct Envelope { sha256:String, state:Stored }
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct View { pub revision:u64, pub head:Head, pub snapshots:Vec<Snapshot> }
fn digest(bytes:&[u8])->String { crate::hex_bytes(Sha256::digest(bytes)) }
fn same_source(a:&Project,b:&Project)->bool {
    a.id==b.id && a.created_at==b.created_at &&
    a.source.as_ref().map(|s|(&s.sha256,&s.preserved_path,s.cache_version))==
    b.source.as_ref().map(|s|(&s.sha256,&s.preserved_path,s.cache_version))
}
fn checked(dir:&Path, registered:&Project)->Result<Option<Stored>> {
    reject_links(dir)?; let file=dir.join("head.json"); reject_links(&file)?;
    if !file.exists(){return Ok(None);}
    if fs::metadata(&file)?.len()>1024*1024{return invalid("Window history head exceeds 1 MiB");}
    let envelope:Envelope=serde_json::from_slice(&fs::read(file)?)?;
    if envelope.sha256!=digest(&serde_json::to_vec(&envelope.state)?) || envelope.state.schema_version!=1 || envelope.state.project_id!=registered.id {
        return invalid("Window history integrity or project identity mismatch; retained for recovery");
    }
    envelope.state.head.validate()?; Ok(Some(envelope.state))
}
fn snapshot(dir:&Path,key:&str,sha:&str,registered:&Project)->Result<Project>{
    uuid::Uuid::parse_str(key).map_err(|_|crate::SparkError::Invalid("Invalid history identity".into()))?;
    let file=dir.join(format!("{key}.json"));reject_links(&file)?;
    if fs::metadata(&file)?.len()>MAX_SNAPSHOT{return invalid("History snapshot exceeds 32 MiB");}
    let bytes=fs::read(file)?;
    if digest(&bytes)!=sha{return invalid("History snapshot checksum mismatch; acknowledged head has not been replaced");}
    let p:Project=serde_json::from_slice(&bytes)?;p.validate()?;
    if !same_source(&p,registered){return invalid("History snapshot belongs to another project/source revision");}
    Ok(p)
}
pub fn read(dir:&Path,registered:&Project)->Result<Option<View>> {
    let Some(state)=checked(dir,registered)? else{return Ok(None)};
    let mut snapshots=vec![];let mut seen=BTreeSet::new();let mut bytes=0;
    for key in state.head.keys(){if !seen.insert(key){continue;}
        let sha=state.hashes.get(key).ok_or_else(||crate::SparkError::Invalid("History references an unacknowledged snapshot".into()))?;
        let p=snapshot(dir,key,sha,registered)?; bytes+=serde_json::to_vec(&p)?.len();
        if bytes>MAX_TRANSFER{return invalid("History transfer exceeds 64 MiB; head retained without truncation");}
        snapshots.push(Snapshot{key:key.clone(),project:p});
    }
    Ok(Some(View{revision:state.revision,head:state.head,snapshots}))
}
pub fn retain_draft(dir:&Path,registered:&Project,revision:u64,head:&Head,snapshots:&[Snapshot])->Result<std::path::PathBuf>{
    head.validate()?;if snapshots.len()>2001{return invalid("Too many rejected history snapshots");}
    let mut errors=BTreeMap::new();
    for s in snapshots{
        uuid::Uuid::parse_str(&s.key).map_err(|_|crate::SparkError::Invalid("Invalid rejected snapshot identity".into()))?;
        if !same_source(&s.project,registered){return invalid("Rejected draft has a foreign source identity");}
        if serde_json::to_vec(&s.project)?.len() as u64>MAX_SNAPSHOT{return invalid("Rejected snapshot exceeds 32 MiB");}
        // Quarantine is never read as an accepted snapshot or used by a build.
        // Keep semantically invalid authored data for diagnosis/recovery instead
        // of losing the very candidate that caused validation to refuse it.
        if let Err(reason)=s.project.validate(){errors.insert(s.key.clone(),reason.to_string());}
    }
    let bytes=serde_json::to_vec(&serde_json::json!({"schemaVersion":1,"projectId":registered.id,"expectedRevision":revision,"head":head,"snapshots":snapshots,"semanticErrors":errors,"accepted":false}))?;
    if bytes.len()>MAX_TRANSFER{return invalid("Rejected draft exceeds 64 MiB");}
    let file=dir.join(format!("rejected-{}.json",uuid::Uuid::new_v4()));project::atomic_write(&file,&bytes,false)?;Ok(file)
}
/// Caller serializes commits and validates new native edit fields. Preflight
/// the complete proposed state before allocating immutable files. Files left by
/// interrupted I/O remain recoverable; rejected data must not create them.
pub fn commit(dir:&Path,registered:&Project,expected:u64,head:Head,additions:Vec<Snapshot>)->Result<u64>{
    commit_with_budget(dir,registered,expected,head,additions,MAX_TRANSFER)
}
fn commit_with_budget(dir:&Path,registered:&Project,expected:u64,head:Head,additions:Vec<Snapshot>,budget:usize)->Result<u64>{
    head.validate()?;
    let old=checked(dir,registered)?;
    let revision=old.as_ref().map_or(0,|s|s.revision);
    if expected!=revision{return invalid(format!("Window revision conflict: expected {expected}, current {revision}. Your draft was retained."));}
    let mut hashes=old.map(|s|s.hashes).unwrap_or_default();
    let mut pending=BTreeMap::new();
    if additions.len()>2001{return invalid("Too many new history snapshots");}
    let mut total=0;
    for item in additions {
        uuid::Uuid::parse_str(&item.key).map_err(|_|crate::SparkError::Invalid("Invalid history snapshot identity".into()))?;
        item.project.validate().map_err(|reason|crate::SparkError::Invalid(format!("History snapshot {} was refused: {reason}",item.key)))?;
        if !same_source(&item.project,registered){return invalid("Cannot put another map/source revision into this history");}
        let bytes=serde_json::to_vec(&item.project)?;total+=bytes.len();
        if bytes.len() as u64>MAX_SNAPSHOT || total>budget{return invalid("History snapshot transfer exceeds its byte budget");}
        let sha=digest(&bytes);let file=dir.join(format!("{}.json",item.key));reject_links(&file)?;
        if hashes.get(&item.key).is_some_and(|known|known!=&sha){return invalid("An immutable history snapshot cannot be overwritten");}
        if file.exists(){if fs::metadata(&file)?.len()>MAX_SNAPSHOT || digest(&fs::read(&file)?)!=sha{return invalid("An immutable history snapshot cannot be overwritten");}}
        else{pending.insert(item.key.clone(),bytes);}
        hashes.insert(item.key,sha);
    }
    // Validate references including previously stored bytes before acknowledging.
    let mut referenced_bytes=0u64;let mut seen=BTreeSet::new();
    for key in head.keys(){
        if !seen.insert(key){continue;}
        let sha=hashes.get(key).ok_or_else(||crate::SparkError::Invalid("History references an unknown snapshot".into()))?;
        let bytes=if let Some(bytes)=pending.get(key){bytes.len() as u64}else{snapshot(dir,key,sha,registered)?;fs::metadata(dir.join(format!("{key}.json")))?.len()};
        referenced_bytes=referenced_bytes.checked_add(bytes).ok_or_else(||crate::SparkError::Invalid("History size overflow".into()))?;
        if referenced_bytes>budget as u64{return invalid("History exceeds its recoverable transfer budget; acknowledged head retained without truncation");}
    }
    hashes.retain(|key,_|head.keys().any(|used|used==key));
    let next=revision.checked_add(1).ok_or_else(||crate::SparkError::Invalid("History revision exhausted".into()))?;
    let state=Stored{schema_version:1,project_id:registered.id.clone(),revision:next,head,hashes};
    let envelope=Envelope{sha256:digest(&serde_json::to_vec(&state)?),state};
    let encoded=serde_json::to_vec(&envelope)?;
    for(key,bytes)in pending{
        let file=dir.join(format!("{key}.json"));reject_links(&file)?;
        if file.exists(){if fs::metadata(&file)?.len()>MAX_SNAPSHOT || digest(&fs::read(&file)?)!=digest(&bytes){return invalid("An immutable history snapshot cannot be overwritten");}}
        else{project::atomic_write(&file,&bytes,false)?;}
    }
    project::atomic_write(&dir.join("head.json"),&encoded,false)?;
    Ok(next)
}

#[cfg(test)] mod tests {
    use super::*;
    #[test]fn rejected_batches_do_not_allocate_earlier_snapshots_or_change_the_accepted_head(){
        let dir=tempfile::tempdir().unwrap();let good=Project::new("Accepted");let key=uuid::Uuid::new_v4().to_string();
        commit(dir.path(),&good,0,head(key.clone()),vec![Snapshot{key,project:good.clone()}]).unwrap();
        let accepted=fs::read(dir.path().join("head.json")).unwrap();
        let before=fs::read_dir(dir.path()).unwrap().count();
        for _ in 0..10{
            let candidate=uuid::Uuid::new_v4().to_string();let foreign=uuid::Uuid::new_v4().to_string();
            assert!(commit(dir.path(),&good,1,head(candidate.clone()),vec![Snapshot{key:candidate,project:good.clone()},Snapshot{key:foreign,project:Project::new("Other source")}]).is_err());
            assert_eq!(fs::read_dir(dir.path()).unwrap().count(),before);assert_eq!(fs::read(dir.path().join("head.json")).unwrap(),accepted);
        }
        let proposed=uuid::Uuid::new_v4().to_string();
        assert!(commit(dir.path(),&good,1,head(uuid::Uuid::new_v4().to_string()),vec![Snapshot{key:proposed,project:good.clone()}]).is_err());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(),before);assert_eq!(read(dir.path(),&good).unwrap().unwrap().revision,1);
    }
    #[test]fn missing_and_duplicate_snapshot_ids_cannot_be_rebound_to_different_bytes(){
        let dir=tempfile::tempdir().unwrap();let good=Project::new("Original");let key=uuid::Uuid::new_v4().to_string();
        commit(dir.path(),&good,0,head(key.clone()),vec![Snapshot{key:key.clone(),project:good.clone()}]).unwrap();
        let file=dir.path().join(format!("{key}.json"));fs::remove_file(&file).unwrap();
        let mut changed=good.clone();changed.title="Changed".into();
        assert!(commit(dir.path(),&good,1,head(key.clone()),vec![Snapshot{key:key.clone(),project:changed.clone()}]).unwrap_err().to_string().contains("immutable"));
        assert!(!file.exists());
        commit(dir.path(),&good,1,head(key.clone()),vec![Snapshot{key:key.clone(),project:good.clone()}]).unwrap();
        assert_eq!(read(dir.path(),&good).unwrap().unwrap().snapshots[0].project.title,"Original");
        let duplicate=uuid::Uuid::new_v4().to_string();
        assert!(commit(dir.path(),&good,2,head(duplicate.clone()),vec![Snapshot{key:duplicate.clone(),project:good.clone()},Snapshot{key:duplicate.clone(),project:changed}]).is_err());
        assert!(!dir.path().join(format!("{duplicate}.json")).exists());assert_eq!(read(dir.path(),&good).unwrap().unwrap().revision,2);
    }
    #[test]fn invalid_bsp_draft_is_quarantined_intact_without_changing_the_acknowledged_head(){
        let dir=tempfile::tempdir().unwrap();let mut good=Project::new("BSP");good.quick_forge=Some(crate::bsp_workshop::example().unwrap());
        let first=uuid::Uuid::new_v4().to_string();let h=head(first.clone());
        commit(dir.path(),&good,0,h,vec![Snapshot{key:first,project:good.clone()}]).unwrap();
        let accepted=fs::read(dir.path().join("head.json")).unwrap();
        let mut bad=good.clone();bad.quick_forge.as_mut().unwrap().workshop.as_mut().unwrap().portals.push(crate::bsp_workshop::Portal{
            id:"door".into(),material_id:"missing".into(),points:vec![[8.,-2.,0.],[8.,2.,0.],[8.,2.,3.],[8.,-2.,3.]]});
        let key=uuid::Uuid::new_v4().to_string();let h=head(key.clone());let snapshots=vec![Snapshot{key:key.clone(),project:bad.clone()}];
        assert!(commit(dir.path(),&good,1,h.clone(),snapshots.clone()).is_err());
        let file=retain_draft(dir.path(),&good,1,&h,&snapshots).unwrap();let retained:serde_json::Value=serde_json::from_slice(&fs::read(file).unwrap()).unwrap();
        assert_eq!(retained["accepted"],false);assert_eq!(retained["snapshots"][0]["project"],serde_json::to_value(bad).unwrap());
        assert!(retained["semanticErrors"][&key].as_str().unwrap().contains("portal"));
        assert_eq!(fs::read(dir.path().join("head.json")).unwrap(),accepted);assert_eq!(read(dir.path(),&good).unwrap().unwrap().revision,1);
        let mut foreign=snapshots;foreign[0].project.id=uuid::Uuid::new_v4().to_string();assert!(retain_draft(dir.path(),&good,1,&h,&foreign).is_err());
    }
    fn head(key:String)->Head{Head{current:key,past:vec![],future:vec![],dirty:true,limit:100}}
    #[test] fn durable_handoff_undo_redo_and_stale_owner_conflicts(){
        let dir=tempfile::tempdir().unwrap();let p=Project::new("A");let a=uuid::Uuid::new_v4().to_string();
        let mut h=head(a.clone());assert_eq!(commit(dir.path(),&p,0,h.clone(),vec![Snapshot{key:a.clone(),project:p.clone()}]).unwrap(),1);
        let mut edit=p.clone();edit.title="A edited".into();let b=uuid::Uuid::new_v4().to_string();h.past.push(a.clone());h.current=b.clone();
        commit(dir.path(),&p,1,h.clone(),vec![Snapshot{key:b.clone(),project:edit}]).unwrap();
        assert!(commit(dir.path(),&p,1,h.clone(),vec![]).is_err());
        let view=read(dir.path(),&p).unwrap().unwrap();assert_eq!(view.revision,2);assert_eq!(view.snapshots.len(),2);
        h.current=a;h.past.clear();h.future.push(b.clone());commit(dir.path(),&p,2,h.clone(),vec![]).unwrap();
        h.past.push(h.current.clone());h.current=b;h.future.clear();commit(dir.path(),&p,3,h,vec![]).unwrap();
        assert_eq!(read(dir.path(),&p).unwrap().unwrap().revision,4);
    }
    #[test] fn a_history_cannot_acknowledge_more_bytes_than_it_can_recover(){
        let dir=tempfile::tempdir().unwrap();let p=Project::new("A");let key=uuid::Uuid::new_v4().to_string();
        let budget=serde_json::to_vec(&p).unwrap().len()*3/2;
        let mut h=head(key.clone());commit_with_budget(dir.path(),&p,0,h.clone(),vec![Snapshot{key:key.clone(),project:p.clone()}],budget).unwrap();
        let before=fs::read(dir.path().join("head.json")).unwrap();
        let next=uuid::Uuid::new_v4().to_string();h.past.push(key);h.current=next.clone();
        assert!(commit_with_budget(dir.path(),&p,1,h,vec![Snapshot{key:next,project:p.clone()}],budget).unwrap_err().to_string().contains("recoverable transfer budget"));
        assert_eq!(before,fs::read(dir.path().join("head.json")).unwrap());assert_eq!(read(dir.path(),&p).unwrap().unwrap().revision,1);
    }
    #[test] fn corrupt_foreign_unknown_and_rebound_snapshots_never_replace_head(){
        let dir=tempfile::tempdir().unwrap();let p=Project::new("A");let key=uuid::Uuid::new_v4().to_string();let h=head(key.clone());
        commit(dir.path(),&p,0,h.clone(),vec![Snapshot{key:key.clone(),project:p.clone()}]).unwrap();
        let good=fs::read(dir.path().join("head.json")).unwrap();
        assert!(commit(dir.path(),&p,1,h.clone(),vec![Snapshot{key:key.clone(),project:Project::new("B")}]).is_err());
        let mut changed=p.clone();changed.title="overwrite".into();assert!(commit(dir.path(),&p,1,h.clone(),vec![Snapshot{key:key.clone(),project:changed}]).is_err());
        assert!(commit(dir.path(),&p,1,head(uuid::Uuid::new_v4().to_string()),vec![]).is_err());
        fs::write(dir.path().join(format!("{key}.json")),b"broken").unwrap();
        assert!(read(dir.path(),&p).is_err());assert!(commit(dir.path(),&p,1,h,vec![]).is_err());assert_eq!(good,fs::read(dir.path().join("head.json")).unwrap());
    }
}
