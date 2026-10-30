//! Opt-in, source-only extraction of a selected Halo 1 tag and dependencies.
//! Uses separately installed Invader; no cache edits, stock-tag overwrites or implicit imports.
use crate::{build::{self,JobEvent,Runner,Toolchain},invalid,maps::{self,MapInspection},project::{self,Project},reject_links,safe_relative,Result,SparkError};
use serde::{Deserialize,Serialize};
use std::{fs,io::Read,path::{Path,PathBuf},sync::{Arc,atomic::AtomicBool}};

const MAX_FILES: usize = 4096;
const MAX_TAG_BYTES: u64 = 64*1024*1024;
const MAX_TOTAL: u64 = 512*1024*1024;
#[derive(Clone,Debug,PartialEq,Eq,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ExtractedFile { pub path: String, pub bytes: u64, pub sha256: String }
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct TagExtractReceipt {
    pub status:String,
    pub job_id:String,
    pub source_sha256:String,
    pub source_project_id:String,
    pub source_engine:String,
    pub source_version:u32,
    pub requested_tag:String,
    pub tag_root:PathBuf,
    pub receipt_path:PathBuf,
    pub files:Vec<ExtractedFile>,
    pub total_bytes:u64,
    pub notice:String,
}
pub fn extension(class:&str)->Result<&'static str>{
    match class {
        "scnr"=>Ok("scenario"),"sbsp"=>Ok("scenario_structure_bsp"),
        "weap"=>Ok("weapon"),"proj"=>Ok("projectile"),"bipd"=>Ok("biped"),
        "scen"=>Ok("scenery"),"vehi"=>Ok("vehicle"),"eqip"=>Ok("equipment"),
        "itmc"=>Ok("item_collection"),"bitm"=>Ok("bitmap"),
        "senv"=>Ok("shader_environment"),"soso"=>Ok("shader_model"),
        "schi"=>Ok("shader_transparent_chicago"),"scex"=>Ok("shader_transparent_chicago_extended"),
        "sky "=>Ok("sky"),"actr"=>Ok("actor"),"actv"=>Ok("actor_variant"),
        "mod2"=>Ok("gbxmodel"),"antr"=>Ok("model_animations"),
        "snd!"=>Ok("sound"),"lsnd"=>Ok("sound_looping"),
        "effe"=>Ok("effect"),"jpt!"=>Ok("damage_effect"),
        "mach"=>Ok("device_machine"),"ctrl"=>Ok("device_control"),
        "lifi"=>Ok("device_light_fixture"),"matg"=>Ok("globals"),
        "trak"=>Ok("camera_track"),"coll"=>Ok("model_collision_geometry"),
        "DeLa"=>Ok("ui_widget_definition"),"Soul"=>Ok("ui_widget_collection"),
        "tagc"=>Ok("tag_collection"),"ustr"=>Ok("unicode_string_list"),"str#"=>Ok("string_list"),
        "font"=>Ok("font"),"hmt "=>Ok("hud_message_text"),"hud#"=>Ok("hud_number"),
        "hudg"=>Ok("hud_globals"),"wphi"=>Ok("weapon_hud_interface"),
        "unhi"=>Ok("unit_hud_interface"),"grhi"=>Ok("grenade_hud_interface"),
        "vcky"=>Ok("virtual_keyboard"),"mply"=>Ok("multiplayer_scenario_description"),
        "sotr"=>Ok("shader_transparent_generic"),
        "spla"=>Ok("shader_transparent_plasma"),"swat"=>Ok("shader_transparent_water"),
        "sgla"=>Ok("shader_transparent_glass"),"smet"=>Ok("shader_transparent_meter"),
        "fog "=>Ok("fog"),"ssce"=>Ok("sound_scenery"),"snde"=>Ok("sound_environment"),
        "ligh"=>Ok("light"),"lens"=>Ok("lens_flare"),"deca"=>Ok("decal"),
        "phys"=>Ok("physics"),"pphy"=>Ok("point_physics"),"part"=>Ok("particle"),
        "pctl"=>Ok("particle_system"),"rain"=>Ok("weather_particle_system"),
        "wind"=>Ok("wind"),"cont"=>Ok("contrail"),"flag"=>Ok("flag"),"elec"=>Ok("lightning"),
        "ant!"=>Ok("antenna"),"glw!"=>Ok("glow"),"cdmg"=>Ok("continuous_damage_effect"),
        "udlg"=>Ok("dialogue"),"foot"=>Ok("material_effects"),"boom"=>Ok("spheroid"),
        "dobc"=>Ok("detail_object_collection"),"plac"=>Ok("placeholder"),
        _=>invalid(format!("Invader tag class {class:?} needs a verified extension mapping before extraction"))
    }
}
fn tag_query(path:&str,class:&str)->Result<(String,PathBuf)>{
    let ext=extension(class)?;
    let tag_path=safe_relative(path)?;
    let path=tag_path.to_string_lossy().replace('/',"\\").to_ascii_lowercase();
    let query=format!("{path}.{ext}");
    let expected=safe_relative(&query)?;
    Ok((query,expected))
}
fn inventory(root:&Path)->Result<(Vec<ExtractedFile>,u64)> {
    let mut files=vec![];
    let mut total=0u64;
    let mut directories=vec![root.to_path_buf()];
    let mut visited_dirs=0usize;
    while let Some(folder)=directories.pop(){
        visited_dirs+=1;
        if visited_dirs>MAX_FILES{return invalid("Tag extraction exceeds 4096 source directories");}
        reject_links(&folder)?;
        for entry in fs::read_dir(&folder)? {
            let entry=entry?;let path=entry.path();
            reject_links(&path)?;
            let metadata=entry.metadata()?;
            if metadata.is_dir(){
                if directories.len()+files.len()>=MAX_FILES{return invalid("Tag extraction exceeds directory/file limit");}
                directories.push(path);continue;
            }
            if !metadata.is_file(){return invalid("Extraction produced an unsupported file type");}
            if metadata.len()>MAX_TAG_BYTES{return invalid("Extracted tag exceeds 64 MiB per-file limit");}
            total=total.checked_add(metadata.len()).ok_or_else(||SparkError::Invalid("Extracted tag byte count overflow".into()))?;
            if total>MAX_TOTAL || files.len()>=MAX_FILES{return invalid("Extraction exceeds 4096 files or 512 MiB");}
            let relative=path.strip_prefix(root).map_err(|_|SparkError::Invalid("Extraction escaped its managed tags folder".into()))?;
            let name=relative.to_string_lossy().replace('\\',"/");
            safe_relative(&name)?;
            files.push(ExtractedFile {path:name,bytes:metadata.len(),sha256:maps::hash_file(&path)?});
        }
    }
    files.sort_by(|a,b|a.path.cmp(&b.path));
    Ok((files,total))
}
fn verify_source_snapshot(source:&project::Source,resources:Option<&Path>)->Result<()> {
    reject_links(&source.preserved_path)?;
    if maps::hash_file(&source.preserved_path)?!=source.sha256{return invalid("Preserved source cache changed during tag exchange");}
    if let Some(resources)=resources {
        for(name,expected)in &source.resource_sha256 {
            if !["bitmaps.map","sounds.map","loc.map"].contains(&name.as_str())||maps::hash_file(&resources.join(name))?!=*expected{return invalid("Source resource changed during tag exchange");}
        }
    }
    Ok(())
}
/// The owner must click an explicit extraction button. Only a *new*, managed tags directory is written.
/// No automatic overwrite, injection, modification of game folders or map conversion is supported.
pub fn extract_selected_tag(
    project:&Project,inspection:&MapInspection,tools:&Toolchain,managed_root:&Path,
    job_id:&str,tag_id:u32,cancel:Arc<AtomicBool>,on_event:impl Fn(JobEvent)+Send+Sync,
)->Result<TagExtractReceipt>{
    uuid::Uuid::parse_str(job_id).map_err(|_|SparkError::Invalid("Invalid extraction job id".into()))?;
    let source=project.source.as_ref().ok_or_else(||SparkError::Invalid("No imported Halo source cache".into()))?;
    if source.sha256!=inspection.sha256 || source.cache_version!=inspection.header.version ||
        source.engine!=inspection.header.engine {return invalid("Inspection is not the preserved source cache");}
    if inspection.header.extended || inspection.header.build.contains("synthetic parser fixture") {
        return invalid("Extended/protected or synthetic test maps are not approved for automated extraction");
    }
    reject_links(&source.preserved_path)?;
    if maps::hash_file(&source.preserved_path)?!=source.sha256{return invalid("Preserved source cache changed; extraction blocked");}
    let tag=inspection.tags.iter().find(|t|t.id==tag_id).ok_or_else(||SparkError::Invalid("Selected source tag ID is missing".into()))?;
    if inspection.tags.iter().filter(|candidate|candidate.class==tag.class&&candidate.path.replace('\\',"/").eq_ignore_ascii_case(&tag.path.replace('\\',"/"))).count()!=1{
        return invalid("Selected tag has an ambiguous case-insensitive path and class; recursive extraction refused");
    }
    let (query,expected)=tag_query(&tag.path,&tag.class)?;
    let executable=build::tool_path(tools,"invader-extract").ok_or_else(||SparkError::Invalid("Configure an installed Invader folder in Settings before extracting real tags".into()))?;
    let info=build::tool_path(tools,"invader-info").ok_or_else(||SparkError::Invalid("invader-info is required to verify cache protection".into()))?;
    for binary in [&executable,&info]{reject_links(binary)?;}
    let resources=source.resource_directory.as_deref().or(tools.resource_directory.as_deref()).or_else(||source.preserved_path.parent()).ok_or_else(||SparkError::Invalid("No source map resources folder".into()))?;
    reject_links(resources)?;
    if !resources.is_dir(){return invalid("Selected resource directory is missing");}
    for (name,digest) in &source.resource_sha256 {
        if !["bitmaps.map","sounds.map","loc.map"].contains(&name.as_str()) ||
            maps::hash_file(&resources.join(name))?!=*digest {return invalid("Source resource checksum changed; extraction blocked");}
    }
    for resource in &inspection.resources {
        if resource.required && !resources.join(&resource.name).is_file() {
            return invalid(format!("Extraction requires the source runtime resource {}",resource.name));
        }
    }
    let out_root=managed_root.join("tag-exchanges");
    reject_links(&out_root)?;fs::create_dir_all(&out_root)?;
    let staging=out_root.join(format!(".pending-{job_id}"));
    let final_dir=out_root.join(job_id);
    reject_links(&staging)?;reject_links(&final_dir)?;
    if staging.exists() || final_dir.exists(){return invalid("Extraction job folder already exists");}
    fs::create_dir(&staging)?;
    let result=(||->Result<TagExtractReceipt>{
        let tags=staging.join("tags");fs::create_dir(&tags)?;
        let runner=Runner{id:job_id,project:&project.id,cancel:&cancel,event:&on_event};
        let protected=runner.run(&info,&["-T".into(),"is_protected".into(),source.preserved_path.to_string_lossy().into_owned()],&staging,"verify",10)?;
        if !["false","0"].contains(&protected.trim().to_ascii_lowercase().as_str()){
            return invalid("Invader identifies the source cache as protected or unknown; extraction stopped");
        }
        runner.run(&executable,&[
            "--recursive".into(),"--search".into(),query.clone(),
            "--tags".into(),tags.to_string_lossy().into_owned(),
            "--maps".into(),resources.to_string_lossy().into_owned(),
            source.preserved_path.to_string_lossy().into_owned(),
        ],&staging,"extract",70)?;
        let (files,total_bytes)=inventory(&tags)?;
        if files.is_empty() || !files.iter().any(|f|f.path.eq_ignore_ascii_case(&expected.to_string_lossy().replace('\\',"/"))) {
            return invalid("Invader finished without producing the selected requested .tag file");
        }
        verify_source_snapshot(source,Some(resources))?;
        let receipt_path=final_dir.join("extraction-receipt.json");
        let receipt=TagExtractReceipt{
            status:"extracted-unverified-import".into(),job_id:job_id.into(),
            source_sha256:source.sha256.clone(),source_project_id:project.id.clone(),
            source_engine:source.engine.clone(),source_version:inspection.header.version,
            requested_tag:query,tag_root:final_dir.join("tags"),receipt_path:receipt_path.clone(),
            files,total_bytes,
            notice:"Actual tags extracted into a new isolated folder by installed Invader. Dependencies require inspection before copy/import into a separate tags tree. No map rebuild, Halo run, tag merge, or rights verification has occurred.".into(),
        };
        project::atomic_write(&staging.join("extraction-receipt.json"),&serde_json::to_vec_pretty(&receipt)?,false)?;
        fs::rename(&staging,&final_dir)?;
        Ok(receipt)
    })();
    if result.is_err(){let _=fs::remove_dir_all(&staging);}
    result
}
/// A source-tag receipt is not an import approval. It identifies owner-selected
/// Invader output and is revalidated on every cross-project staging request.
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct TagExchangeSummary {
    pub job_id:String,
    pub source_project_id:String,
    pub source_engine:String,
    pub source_version:u32,
    pub source_sha256:String,
    pub requested_tag:String,
    pub file_count:usize,
    pub total_bytes:u64,
}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct TagImportReceipt {
    pub status:String,
    pub job_id:String,
    pub source_job_id:String,
    pub target_project_id:String,
    pub source_sha256:String,
    pub target_sha256:String,
    pub tag_root:PathBuf,
    pub receipt_path:PathBuf,
    pub file_count:usize,
    pub total_bytes:u64,
    pub notice:String,
}
fn job_dir(root:&Path,job_id:&str)->Result<PathBuf>{
    uuid::Uuid::parse_str(job_id).map_err(|_|SparkError::Invalid("Invalid exchange job ID".into()))?;
    let path=root.join("tag-exchanges").join(job_id);
    reject_links(&path)?;
    Ok(path)
}
fn load_receipt(root:&Path,job_id:&str)->Result<TagExtractReceipt>{
    let folder=job_dir(root,job_id)?;
    let path=folder.join("extraction-receipt.json");
    reject_links(&path)?;
    let metadata=fs::metadata(&path)?;
    if !metadata.is_file() || metadata.len()>2*1024*1024 {
        return invalid("Extraction receipt is missing or exceeds its 2 MiB limit");
    }
    let r:TagExtractReceipt=serde_json::from_slice(&fs::read(&path)?)?;
    if r.job_id!=job_id || r.source_project_id.is_empty() || r.source_engine.is_empty() ||
        r.status!="extracted-unverified-import" || r.files.is_empty() || r.files.len()>MAX_FILES ||
        r.total_bytes>MAX_TOTAL || r.receipt_path!=path || r.tag_root!=folder.join("tags") {
        return invalid("Extraction receipt fails identity or path validation");
    }
    Ok(r)
}
/// Returns metadata only. Never reads/exposes extracted tag payloads to the web frontend.
pub fn list_exchanges(managed_root:&Path)->Result<Vec<TagExchangeSummary>>{
    let root=managed_root.join("tag-exchanges");
    reject_links(&root)?;
    if !root.is_dir(){return Ok(vec![]);}
    let mut result=Vec::new();
    for entry in fs::read_dir(&root)?{
        let entry=entry?;
        reject_links(&entry.path())?;
        if result.len()>=512{return invalid("More than 512 tag jobs; clean up approved old jobs first");}
        let job_id=entry.file_name().to_string_lossy().into_owned();
        if uuid::Uuid::parse_str(&job_id).is_err(){continue;}
        let r=load_receipt(managed_root,&job_id)?;
        result.push(TagExchangeSummary{
            job_id,source_project_id:r.source_project_id,source_engine:r.source_engine,
            source_version:r.source_version,source_sha256:r.source_sha256,
            requested_tag:r.requested_tag,file_count:r.files.len(),total_bytes:r.total_bytes,
        });
    }
    result.sort_by(|a,b|a.job_id.cmp(&b.job_id));
    Ok(result)
}
/// Copy verified owner-extracted .tag files into an entirely new managed staging
/// directory for a *different* compatible source project. This does not import
/// tag references into the scenario or install a mod into the game.
pub fn stage_into_project(target:&Project,managed_root:&Path,source_job:&str,job_id:&str)->Result<TagImportReceipt>{
    uuid::Uuid::parse_str(job_id).map_err(|_|SparkError::Invalid("Invalid staged import job ID".into()))?;
    uuid::Uuid::parse_str(&target.id).map_err(|_|SparkError::Invalid("Invalid target project ID".into()))?;
    let target_source=target.source.as_ref().ok_or_else(||SparkError::Invalid("Open a target project backed by a preserved Halo map".into()))?;
    reject_links(&target_source.preserved_path)?;
    if maps::hash_file(&target_source.preserved_path)?!=target_source.sha256 {
        return invalid("Target project preserved Halo map changed; staging refused");
    }
    let original=load_receipt(managed_root,source_job)?;
    if original.source_project_id==target.id {
        return invalid("Choose a different destination map before staging extracted tags");
    }
    if target_source.engine!=original.source_engine || target_source.cache_version!=original.source_version {
        return invalid("Incompatible Halo engine or cache version; extracted tags cannot be staged into this project automatically");
    }
    let extracted_dir=job_dir(managed_root,source_job)?.join("tags");
    let (observed,total)=inventory(&extracted_dir)?;
    if observed!=original.files || total!=original.total_bytes {
        return invalid("Extraction receipt hashes or file inventory changed; transfer stopped");
    }
    let dest_root=managed_root.join("tag-imports").join(&target.id);
    reject_links(&dest_root)?;
    fs::create_dir_all(&dest_root)?;
    let staging=dest_root.join(format!(".pending-{job_id}"));
    let finished=dest_root.join(job_id);
    reject_links(&staging)?;
    reject_links(&finished)?;
    if staging.exists() || finished.exists(){return invalid("Destination staging job folder already exists");}
    fs::create_dir(&staging)?;
    let result=(||->Result<TagImportReceipt>{
        let tags=staging.join("tags");fs::create_dir(&tags)?;
        for file in &observed {
            let relative=safe_relative(&file.path)?;
            let source=extracted_dir.join(&relative);
            let destination=tags.join(&relative);
            reject_links(&source)?;
            if let Some(parent)=destination.parent() {reject_links(parent)?;fs::create_dir_all(parent)?;}
            reject_links(&destination)?;
            // Create-new prevents any accidental overwrite if a local workspace
            // was tampered with while the staging request was running.
            let reader=fs::File::open(&source)?;
            let mut writer=fs::OpenOptions::new().write(true).create_new(true).open(&destination)?;
            let copied=std::io::copy(&mut reader.take(file.bytes+1),&mut writer)?;
            if copied!=file.bytes {
                return invalid("Source tag size changed while staging; bounded copy refused");
            }
            writer.sync_all()?;
            if maps::hash_file(&destination)?!=file.sha256 {
                return invalid("Staged tag checksum mismatch; no import was committed");
            }
        }
        let (copied,copied_bytes)=inventory(&tags)?;
        if copied!=observed || copied_bytes!=total {
            return invalid("Staged tag inventory changed before commit");
        }
        verify_source_snapshot(target_source,None)?;
        let (unchanged_source,unchanged_bytes)=inventory(&extracted_dir)?;
        if unchanged_source!=original.files||unchanged_bytes!=original.total_bytes{return invalid("Extracted source tags changed during transfer; no staged import was committed");}
        let receipt=TagImportReceipt{
            status:"staged-not-merged".into(),job_id:job_id.into(),source_job_id:source_job.into(),
            target_project_id:target.id.clone(),source_sha256:original.source_sha256,
            target_sha256:target_source.sha256.clone(),tag_root:finished.join("tags"),
            receipt_path:finished.join("import-receipt.json"),file_count:copied.len(),total_bytes:copied_bytes,
            notice:"Files copied into a new Guilty Spark staging folder with verified SHA-256 hashes. They have not been merged into a scenario, compiled into a map, or installed in Halo; inspect dependencies and rights before any manual use.".into(),
        };
        project::atomic_write(&staging.join("import-receipt.json"),&serde_json::to_vec_pretty(&receipt)?,false)?;
        fs::rename(&staging,&finished)?;
        Ok(receipt)
    })();
    if result.is_err(){let _=fs::remove_dir_all(&staging);}
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn class_and_path_are_strict(){
        assert_eq!(tag_query("weapons\\pistol\\pistol","weap").unwrap().0,"weapons\\pistol\\pistol.weapon");
        assert_eq!(tag_query("textures\\rock","bitm").unwrap().0,"textures\\rock.bitmap");
        assert!(tag_query("..\\outside","weap").is_err());
        assert!(tag_query("weapons\\rocket*","weap").is_err());
        assert!(tag_query("weapons\\pistol","????").is_err());
    }
    #[test]
    fn receipts_reject_wrong_identity_and_path(){
        let root=tempfile::tempdir().unwrap();
        let job_id=uuid::Uuid::new_v4().to_string();
        let folder=root.path().join("tag-exchanges").join(&job_id);
        fs::create_dir_all(folder.join("tags")).unwrap();
        let test_path=folder.join("tags").join("test.weapon");
        fs::write(&test_path,b"fixture-tag-bytes").unwrap();
        let (files,total)=inventory(&folder.join("tags")).unwrap();
        let mut receipt=TagExtractReceipt{
            status:"extracted-unverified-import".into(),job_id:job_id.clone(),
            source_sha256:"ab".repeat(32),source_project_id:uuid::Uuid::new_v4().to_string(),
            source_engine:"halo1-fixture".into(),source_version:7,requested_tag:"test.weapon".into(),
            tag_root:folder.join("tags"),receipt_path:folder.join("extraction-receipt.json"),
            files,total_bytes:total,notice:"test".into(),
        };
        fs::write(&receipt.receipt_path,serde_json::to_vec(&receipt).unwrap()).unwrap();
        assert_eq!(load_receipt(root.path(),&job_id).unwrap().files.len(),1);
        receipt.tag_root=root.path().join("outside");
        fs::write(&receipt.receipt_path,serde_json::to_vec(&receipt).unwrap()).unwrap();
        assert!(load_receipt(root.path(),&job_id).is_err());
    }
    #[test]
    fn inventories_bounded_source(){
        let dir=tempfile::tempdir().unwrap();
        fs::write(dir.path().join("thing.weapon"),b"safe").unwrap();
        let (found,total)=inventory(dir.path()).unwrap();
        assert_eq!(total,4);
        assert_eq!(found.len(),1);
    }
    #[test]
    fn cross_project_staging_preserves_bytes_and_rejects_tampering_and_overwrite(){
        let root=tempfile::tempdir().unwrap();
        let job=uuid::Uuid::new_v4().to_string();let folder=root.path().join("tag-exchanges").join(&job);
        fs::create_dir_all(folder.join("tags/weapons")).unwrap();
        let bytes=b"synthetic standalone tag transfer fixture - not playable Halo content";
        fs::write(folder.join("tags/weapons/test.weapon"),bytes).unwrap();
        let(files,total)=inventory(&folder.join("tags")).unwrap();
        let receipt=TagExtractReceipt{status:"extracted-unverified-import".into(),job_id:job.clone(),source_sha256:"ab".repeat(32),source_project_id:uuid::Uuid::new_v4().to_string(),source_engine:"Test engine".into(),source_version:7,requested_tag:"weapons\\test.weapon".into(),tag_root:folder.join("tags"),receipt_path:folder.join("extraction-receipt.json"),files,total_bytes:total,notice:"Synthetic transfer test".into()};
        fs::write(&receipt.receipt_path,serde_json::to_vec(&receipt).unwrap()).unwrap();
        let cache=root.path().join("target.map");fs::write(&cache,b"immutable target identity fixture").unwrap();
        let mut target=Project::new("Target transfer test");target.source=Some(project::Source{audio_resources:None,original_path:cache.clone(),preserved_path:cache.clone(),sha256:maps::hash_file(&cache).unwrap(),cache_version:7,engine:"Test engine".into(),scenario_path:"fixture".into(),archive:None,resource_directory:None,resource_sha256:Default::default()});
        let id=uuid::Uuid::new_v4().to_string();let staged=stage_into_project(&target,root.path(),&job,&id).unwrap();
        assert_eq!(staged.status,"staged-not-merged");assert_eq!(fs::read(staged.tag_root.join("weapons/test.weapon")).unwrap(),bytes);
        assert!(stage_into_project(&target,root.path(),&job,&id).is_err());
        fs::write(folder.join("tags/weapons/test.weapon"),b"changed").unwrap();
        let rejected=uuid::Uuid::new_v4().to_string();assert!(stage_into_project(&target,root.path(),&job,&rejected).is_err());
        assert!(!root.path().join("tag-imports").join(&target.id).join(rejected).exists());
        assert_eq!(fs::read(&cache).unwrap(),b"immutable target identity fixture");
        assert_eq!(fs::read(staged.tag_root.join("weapons/test.weapon")).unwrap(),bytes);
    }
}
