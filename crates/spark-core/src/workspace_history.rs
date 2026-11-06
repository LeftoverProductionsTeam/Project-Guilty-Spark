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
#[derive(Clone, Serialize)]
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
    let bytes=encoded_draft(registered,revision,head,snapshots)?;
    let file=dir.join(format!("rejected-{}.json",uuid::Uuid::new_v4()));project::atomic_write(&file,&bytes,false)?;Ok(file)
}
fn encoded_draft(registered:&Project,revision:u64,head:&Head,snapshots:&[Snapshot])->Result<Vec<u8>>{
    head.validate()?;if snapshots.len()>2001{return invalid("Too many rejected history snapshots");}
    let mut errors=BTreeMap::new();let mut total=0usize;
    for s in snapshots{
        uuid::Uuid::parse_str(&s.key).map_err(|_|crate::SparkError::Invalid("Invalid rejected snapshot identity".into()))?;
        if !same_source(&s.project,registered){return invalid("Rejected draft has a foreign source identity");}
        let size=serde_json::to_vec(&s.project)?.len();total=total.saturating_add(size);
        if size as u64>MAX_SNAPSHOT||total>MAX_TRANSFER{return invalid("Rejected snapshot batch exceeds its byte budget");}
        // Quarantine is never read as an accepted snapshot or used by a build.
        // Keep semantically invalid authored data for diagnosis/recovery instead
        // of losing the very candidate that caused validation to refuse it.
        if let Err(reason)=s.project.validate(){errors.insert(s.key.clone(),reason.to_string());}
    }
    let bytes=serde_json::to_vec(&serde_json::json!({"schemaVersion":1,"projectId":registered.id,"expectedRevision":revision,"head":head,"snapshots":snapshots,"semanticErrors":errors,"accepted":false}))?;
    if bytes.len()>MAX_TRANSFER{return invalid("Rejected draft exceeds 64 MiB");}
    Ok(bytes)
}
/// Caller serializes commits and validates new native edit fields. Preflight
/// the complete proposed state before allocating immutable files. Files left by
/// interrupted I/O remain recoverable; rejected data must not create them.
pub fn commit(dir:&Path,registered:&Project,expected:u64,head:Head,additions:Vec<Snapshot>)->Result<u64>{
    commit_with_budget(dir,registered,expected,head,additions,MAX_TRANSFER)
}
fn commit_with_budget(dir:&Path,registered:&Project,expected:u64,head:Head,additions:Vec<Snapshot>,budget:usize)->Result<u64>{
    let old=checked(dir,registered)?;
    let prepared=prepare_commit(registered,old,expected,head,additions,budget,|key|{
        let file=dir.join(format!("{key}.json"));reject_links(&file)?;
        if !file.exists(){return Ok(None);}
        if fs::metadata(&file)?.len()>MAX_SNAPSHOT{return invalid("History snapshot exceeds 32 MiB");}
        Ok(Some(fs::read(file)?))
    })?;
    for(key,bytes)in prepared.pending{
        let file=dir.join(format!("{key}.json"));reject_links(&file)?;
        if file.exists(){if fs::metadata(&file)?.len()>MAX_SNAPSHOT || digest(&fs::read(&file)?)!=digest(&bytes){return invalid("An immutable history snapshot cannot be overwritten");}}
        else{project::atomic_write(&file,&bytes,false)?;}
    }
    write_head(dir,&prepared.state)?;
    Ok(prepared.state.revision)
}
struct Prepared { state:Stored, pending:BTreeMap<String,Vec<u8>> }
fn prepare_commit(registered:&Project,old:Option<Stored>,expected:u64,head:Head,additions:Vec<Snapshot>,budget:usize,existing:impl Fn(&str)->Result<Option<Vec<u8>>>)->Result<Prepared>{
    head.validate()?;
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
        let sha=digest(&bytes);
        if hashes.get(&item.key).is_some_and(|known|known!=&sha){return invalid("An immutable history snapshot cannot be overwritten");}
        if let Some(prior)=existing(&item.key)?{if prior.len() as u64>MAX_SNAPSHOT || digest(&prior)!=sha{return invalid("An immutable history snapshot cannot be overwritten");}}
        else{pending.insert(item.key.clone(),bytes);}
        hashes.insert(item.key,sha);
    }
    // Validate references including previously stored bytes before acknowledging.
    let mut referenced_bytes=0u64;let mut seen=BTreeSet::new();
    for key in head.keys(){
        if !seen.insert(key){continue;}
        let sha=hashes.get(key).ok_or_else(||crate::SparkError::Invalid("History references an unknown snapshot".into()))?;
        let bytes=if let Some(bytes)=pending.get(key){bytes.len() as u64}else{
            let bytes=existing(key)?.ok_or_else(||crate::SparkError::Invalid("History references a missing snapshot".into()))?;
            if bytes.len() as u64>MAX_SNAPSHOT||digest(&bytes)!=*sha{return invalid("History snapshot checksum mismatch; acknowledged head retained");}
            let p:Project=serde_json::from_slice(&bytes)?;p.validate()?;
            if !same_source(&p,registered){return invalid("History snapshot belongs to another project/source revision");}
            bytes.len() as u64
        };
        referenced_bytes=referenced_bytes.checked_add(bytes).ok_or_else(||crate::SparkError::Invalid("History size overflow".into()))?;
        if referenced_bytes>budget as u64{return invalid("History exceeds its recoverable transfer budget; acknowledged head retained without truncation");}
    }
    hashes.retain(|key,_|head.keys().any(|used|used==key));
    let next=revision.checked_add(1).ok_or_else(||crate::SparkError::Invalid("History revision exhausted".into()))?;
    let state=Stored{schema_version:1,project_id:registered.id.clone(),revision:next,head,hashes};
    Ok(Prepared{state,pending})
}
fn write_head(dir:&Path,state:&Stored)->Result<()> {
    let envelope=Envelope{sha256:digest(&serde_json::to_vec(state)?),state:state.clone()};
    let encoded=serde_json::to_vec(&envelope)?;
    project::atomic_write(&dir.join("head.json"),&encoded,false)?;
    Ok(())
}

/// The same revision and native-source validator backs active desktop windows.
/// Only an explicit Save or opted-in recovery policy checkpoints this RAM
/// state. Closing an unsaved document does not allocate a history directory.
#[derive(Default)]
pub struct Session { documents:BTreeMap<String,MemoryDocument>, drafts:BTreeMap<String,Vec<u8>> }
#[derive(Clone)]
struct MemoryDocument { state:Option<Stored>, snapshots:BTreeMap<String,Vec<u8>>, immutable:BTreeMap<String,String>, disk_head:Option<String> }
impl Session {
    const MAX_BYTES:usize=256*1024*1024;
    fn bytes(&self)->usize{self.documents.values().map(|d|d.snapshots.values().map(Vec::len).sum::<usize>()+d.immutable.iter().map(|(key,hash)|key.len()+hash.len()).sum::<usize>()).sum::<usize>()+self.drafts.values().map(Vec::len).sum::<usize>()}
    fn attach(&mut self,dir:&Path,registered:&Project)->Result<()> {
        if self.documents.contains_key(&registered.id){return Ok(());}
        if self.documents.len()>=32{return invalid("Close an unused document before opening another shared history (32-map limit)");}
        let mut state=checked(dir,registered)?;let mut snapshots=BTreeMap::new();let mut total=0usize;
        if let Some(state)=&mut state{
            let keys:BTreeSet<_>=state.head.keys().cloned().collect();state.hashes.retain(|key,_|keys.contains(key));
            for key in keys{
            let sha=state.hashes.get(&key).ok_or_else(||crate::SparkError::Invalid("History references an unknown snapshot".into()))?;
            let file=dir.join(format!("{key}.json"));reject_links(&file)?;let size=fs::metadata(&file)?.len();
            if size>MAX_SNAPSHOT||size>MAX_TRANSFER.saturating_sub(total) as u64{return invalid("Saved history exceeds its recoverable byte budget");}
            let p=snapshot(dir,&key,sha,registered)?;let bytes=serde_json::to_vec(&p)?;total+=bytes.len();snapshots.insert(key,bytes);
        }}
        if self.bytes()+snapshots.values().map(Vec::len).sum::<usize>()>Self::MAX_BYTES{return invalid("Shared Undo history reached its 256 MiB RAM budget. Save and close an unused document; existing work was retained");}
        let file=dir.join("head.json");let disk_head=if file.exists(){Some(crate::maps::hash_file(&file)?)}else{None};
        let immutable=state.as_ref().map(|state|state.hashes.clone()).unwrap_or_default();
        self.documents.insert(registered.id.clone(),MemoryDocument{state,snapshots,immutable,disk_head});Ok(())
    }
    pub fn read(&mut self,dir:&Path,registered:&Project)->Result<Option<View>> {
        self.attach(dir,registered)?;let document=&self.documents[&registered.id];let Some(state)=&document.state else{return Ok(None)};
        let mut snapshots=vec![];
        for(key,sha)in &state.hashes{
            let bytes=document.snapshots.get(key).ok_or_else(||crate::SparkError::Invalid("Shared history snapshot is missing".into()))?;
            if digest(bytes)!=*sha{return invalid("Shared history checksum differs");}
            let p:Project=serde_json::from_slice(bytes)?;p.validate()?;if !same_source(&p,registered){return invalid("Shared history has another source identity");}
            snapshots.push(Snapshot{key:key.clone(),project:p});
        }
        Ok(Some(View{revision:state.revision,head:state.head.clone(),snapshots}))
    }
    pub fn commit(&mut self,dir:&Path,registered:&Project,expected:u64,head:Head,additions:Vec<Snapshot>)->Result<u64>{
        self.attach(dir,registered)?;let document=&self.documents[&registered.id];
        for item in &additions{let sha=digest(&serde_json::to_vec(&item.project)?);if document.immutable.get(&item.key).is_some_and(|known|*known!=sha){return invalid("An immutable history snapshot cannot be overwritten");}}
        let prepared=prepare_commit(registered,document.state.clone(),expected,head,additions,MAX_TRANSFER,|key|Ok(document.snapshots.get(key).cloned()))?;
        let mut next=document.clone();next.snapshots.extend(prepared.pending);next.snapshots.retain(|key,_|prepared.state.hashes.contains_key(key));
        next.immutable.extend(prepared.state.hashes.clone());
        if next.immutable.len()>4096{return invalid("This session reached its 4096-edit identity budget. Save and reopen the document; existing work and Undo were retained");}
        next.state=Some(prepared.state);let revision=next.state.as_ref().unwrap().revision;
        let before=document.snapshots.values().map(Vec::len).sum::<usize>()+document.immutable.iter().map(|(key,hash)|key.len()+hash.len()).sum::<usize>();let after=next.snapshots.values().map(Vec::len).sum::<usize>()+next.immutable.iter().map(|(key,hash)|key.len()+hash.len()).sum::<usize>();
        if self.bytes()-before+after>Self::MAX_BYTES{return invalid("Shared Undo history reached its 256 MiB RAM budget. Existing acknowledged edits were retained");}
        self.documents.insert(registered.id.clone(),next);Ok(revision)
    }
    pub fn checkpoint(&mut self,dir:&Path,registered:&Project)->Result<()> {
        self.checkpoint_with_budget(dir,registered,MAX_TRANSFER)
    }
    fn checkpoint_with_budget(&mut self,dir:&Path,registered:&Project,budget:usize)->Result<()> {
        self.attach(dir,registered)?;let document=self.documents.get_mut(&registered.id).unwrap();
        let file=dir.join("head.json");reject_links(&file)?;
        let actual=if file.exists(){Some(crate::maps::hash_file(&file)?)}else{None};
        if actual!=document.disk_head{return invalid("Saved window history changed externally; review it before saving. The external head was retained");}
        let Some(state)=&document.state else{return Ok(())};
        // Refuse growth before writing. Existing recovery selections and old
        // snapshots stay intact; the live document remains in bounded RAM.
        let envelope=Envelope{sha256:digest(&serde_json::to_vec(state)?),state:state.clone()};
        let mut total=serde_json::to_vec(&envelope)?.len() as u64;
        let mut count=1usize;
        match fs::read_dir(dir){
            Ok(entries)=>for entry in entries{
                let entry=entry?;let path=entry.path();reject_links(&path)?;
                let meta=fs::symlink_metadata(&path)?;
                if !meta.is_file(){return invalid("Unexpected history directory entry retained; review recovery before saving");}
                if entry.file_name()!="head.json"{total=total.saturating_add(meta.len());count+=1;}
                if total>budget as u64||count>4096{return invalid("Undo recovery reached its 64 MiB/4096-file disk budget. Existing recovery and current in-memory edits were retained; export your document before reviewing old recovery files");}
            },
            Err(error) if error.kind()==std::io::ErrorKind::NotFound=>{},
            Err(error)=>return Err(error.into()),
        }
        for(key,bytes)in &document.snapshots{
            if !dir.join(format!("{key}.json")).exists(){total=total.saturating_add(bytes.len() as u64);count+=1;}
        }
        if total>budget as u64||count>4096{return invalid("Undo recovery would exceed its 64 MiB/4096-file disk budget. No journal files were written; current edits remain in memory. Export your document before reviewing old recovery files");}
        for(key,sha)in &state.hashes{
            let bytes=&document.snapshots[key];if digest(bytes)!=*sha{return invalid("Shared snapshot checksum differs before Save");}
            let file=dir.join(format!("{key}.json"));reject_links(&file)?;
            if file.exists(){if fs::metadata(&file)?.len()>MAX_SNAPSHOT||digest(&fs::read(&file)?)!=*sha{return invalid("Saved history snapshot changed externally; retained");}}
        }
        for(key,bytes)in &document.snapshots{let file=dir.join(format!("{key}.json"));if !file.exists(){project::atomic_write(&file,bytes,false)?;}}
        write_head(dir,state)?;document.disk_head=Some(crate::maps::hash_file(&dir.join("head.json"))?);Ok(())
    }
    pub fn saved_checkpoint(&mut self,dir:&Path,registered:&Project)->Result<()> {
        self.attach(dir,registered)?;let previous=self.documents[&registered.id].clone();
        if let Some(state)=&mut self.documents.get_mut(&registered.id).unwrap().state{state.head.dirty=false;}
        let result=self.checkpoint(dir,registered);
        if result.is_err(){self.documents.insert(registered.id.clone(),previous);}
        result
    }
    pub fn retain_draft(&mut self,registered:&Project,revision:u64,head:&Head,snapshots:&[Snapshot])->Result<String>{
        let bytes=encoded_draft(registered,revision,head,snapshots)?;
        if self.drafts.len()>=16||self.bytes()+bytes.len()>Self::MAX_BYTES{return invalid("Rejected draft retention reached its RAM budget; keep this window open and export the local draft");}
        let id=uuid::Uuid::new_v4().to_string();self.drafts.insert(id.clone(),bytes);Ok(format!("in-memory draft {id} (until Spark exits; explicitly save/export for crash recovery)"))
    }
    /// An explicit Discard restores the last saved descriptor rather than
    /// reopening an opted-in journal containing the discarded unsaved edits.
    pub fn reset_saved(&mut self,dir:&Path,registered:&Project)->Result<()> {
        self.attach(dir,registered)?;let previous=self.documents[&registered.id].clone();
        let revision=previous.state.as_ref().map_or(0,|state|state.revision);
        let key=uuid::Uuid::new_v4().to_string();let head=Head{current:key.clone(),past:vec![],future:vec![],dirty:false,limit:previous.state.as_ref().map_or(100,|state|state.head.limit)};
        let result=(||{self.commit(dir,registered,revision,head,vec![Snapshot{key,project:registered.clone()}])?;
            if dir.join("head.json").exists(){self.checkpoint(dir,registered)?;}Ok(())})();
        if result.is_err(){self.documents.insert(registered.id.clone(),previous);}
        result
    }
    pub fn discard(&mut self,id:&str){self.documents.remove(id);}
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
    #[test]fn memory_history_handoff_fifty_edits_and_discard_do_not_allocate_files(){
        let root=tempfile::tempdir().unwrap();let directory=root.path().join("uncreated-history");let p=Project::new("RAM source");let mut session=Session::default();
        let first=uuid::Uuid::new_v4().to_string();let mut h=head(first.clone());session.commit(&directory,&p,0,h.clone(),vec![Snapshot{key:first,project:p.clone()}]).unwrap();
        for index in 1..=50{
            let mut edit=p.clone();edit.title=format!("Edit {index}");let key=uuid::Uuid::new_v4().to_string();
            h.past.push(h.current.clone());h.current=key.clone();let revision=session.read(&directory,&p).unwrap().unwrap().revision;
            session.commit(&directory,&p,revision,h.clone(),vec![Snapshot{key,project:edit}]).unwrap();
            let mut undo=h.clone();undo.future.push(undo.current.clone());undo.current=undo.past.pop().unwrap();
            session.commit(&directory,&p,revision+1,undo,vec![]).unwrap();session.commit(&directory,&p,revision+2,h.clone(),vec![]).unwrap();
            assert!(!directory.exists());assert!(session.commit(&directory,&p,revision,h.clone(),vec![]).is_err());
        }
        let view=session.read(&directory,&p).unwrap().unwrap();assert_eq!(view.revision,151);assert_eq!(view.snapshots.len(),51);
        session.discard(&p.id);assert!(session.read(&directory,&p).unwrap().is_none());assert!(!directory.exists());
    }
    #[test]fn explicit_history_checkpoint_recovers_without_allowing_external_head_overwrite(){
        let root=tempfile::tempdir().unwrap();let directory=root.path().join("history");let p=Project::new("Saved");let mut session=Session::default();
        let key=uuid::Uuid::new_v4().to_string();let h=head(key.clone());session.commit(&directory,&p,0,h.clone(),vec![Snapshot{key,project:p.clone()}]).unwrap();
        session.checkpoint(&directory,&p).unwrap();let saved=fs::read(directory.join("head.json")).unwrap();
        let key=uuid::Uuid::new_v4().to_string();let mut edit=p.clone();edit.title="Unsaved".into();session.commit(&directory,&p,1,head(key.clone()),vec![Snapshot{key,project:edit}]).unwrap();
        assert_eq!(fs::read(directory.join("head.json")).unwrap(),saved);
        let mut restarted=Session::default();assert_eq!(restarted.read(&directory,&p).unwrap().unwrap().revision,1);
        fs::write(directory.join("head.json"),b"changed by another writer").unwrap();assert!(session.checkpoint(&directory,&p).is_err());assert_eq!(fs::read(directory.join("head.json")).unwrap(),b"changed by another writer");
        assert_eq!(session.read(&directory,&p).unwrap().unwrap().revision,2);
    }
    #[test]fn discard_replaces_opted_in_unsaved_recovery_with_the_saved_revision(){
        let root=tempfile::tempdir().unwrap();let directory=root.path().join("history");let saved=Project::new("Last explicit Save");let mut session=Session::default();
        let key=uuid::Uuid::new_v4().to_string();session.commit(&directory,&saved,0,head(key.clone()),vec![Snapshot{key,project:saved.clone()}]).unwrap();session.saved_checkpoint(&directory,&saved).unwrap();
        let key=uuid::Uuid::new_v4().to_string();let mut unsaved=saved.clone();unsaved.title="Opted-in recovery".into();session.commit(&directory,&saved,1,head(key.clone()),vec![Snapshot{key,project:unsaved}]).unwrap();session.checkpoint(&directory,&saved).unwrap();
        session.reset_saved(&directory,&saved).unwrap();let mut restarted=Session::default();let view=restarted.read(&directory,&saved).unwrap().unwrap();assert!(!view.head.dirty);assert_eq!(view.revision,3);assert_eq!(view.snapshots[0].project.title,saved.title);
    }
    #[test]fn checkpoint_disk_budget_refuses_growth_before_writing_and_preserves_ram_and_recovery(){
        let root=tempfile::tempdir().unwrap();let directory=root.path().join("history");let p=Project::new("Saved");let mut session=Session::default();
        let first=uuid::Uuid::new_v4().to_string();session.commit(&directory,&p,0,head(first.clone()),vec![Snapshot{key:first,project:p.clone()}]).unwrap();session.checkpoint(&directory,&p).unwrap();
        let saved=fs::read(directory.join("head.json")).unwrap();let files=fs::read_dir(&directory).unwrap().count();
        let budget=fs::read_dir(&directory).unwrap().map(|entry|entry.unwrap().metadata().unwrap().len() as usize).sum();
        let next=uuid::Uuid::new_v4().to_string();let mut edit=p.clone();edit.title="Unsaved in memory".into();
        session.commit(&directory,&p,1,head(next.clone()),vec![Snapshot{key:next.clone(),project:edit.clone()}]).unwrap();
        assert!(session.checkpoint_with_budget(&directory,&p,budget).unwrap_err().to_string().contains("disk budget"));
        assert_eq!(fs::read(directory.join("head.json")).unwrap(),saved);assert_eq!(fs::read_dir(&directory).unwrap().count(),files);assert!(!directory.join(format!("{next}.json")).exists());
        let view=session.read(&directory,&p).unwrap().unwrap();assert_eq!(view.revision,2);assert_eq!(view.snapshots[0].project.title,edit.title);
        let mut restarted=Session::default();assert_eq!(restarted.read(&directory,&p).unwrap().unwrap().revision,1);
    }
    #[test]fn memory_history_never_rebinds_a_retired_snapshot_identity(){
        let root=tempfile::tempdir().unwrap();let p=Project::new("Original");let mut session=Session::default();let a=uuid::Uuid::new_v4().to_string();let b=uuid::Uuid::new_v4().to_string();
        session.commit(root.path(),&p,0,head(a.clone()),vec![Snapshot{key:a.clone(),project:p.clone()}]).unwrap();session.commit(root.path(),&p,1,head(b.clone()),vec![Snapshot{key:b,project:p.clone()}]).unwrap();
        let mut changed=p.clone();changed.title="Rebound".into();assert!(session.commit(root.path(),&p,2,head(a.clone()),vec![Snapshot{key:a,project:changed}]).is_err());assert_eq!(session.read(root.path(),&p).unwrap().unwrap().revision,2);
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
