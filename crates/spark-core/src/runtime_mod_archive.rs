//! Presentation-pack ZIPs use the existing strict ZIP reader and owned-stage
//! rollback. A package is data only; no executable/installer is ever extracted.
use super::*;
use crate::archive;
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct PackagePlan {
    pub sha256:String,pub archive_bytes:u64,pub folder:String,pub name:String,
    pub files:usize,pub installed_bytes:u64,pub metadata_only_validation:bool,
    #[serde(skip)] entries:Vec<(String,String,u64)>,
}
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct InstallReceipt {pub folder:PathBuf,pub name:String,pub archive_sha256:String,pub files:usize,pub bytes:u64,pub file_sha256:BTreeMap<String,String>,pub payload_playback_verified:bool}
fn zip_error(e:impl std::fmt::Display)->SparkError{SparkError::Invalid(format!("Pack ZIP validation failed: {e}"))}
fn fallback(kind:&str)->Result<&'static str>{match kind{
    "uncompressedTextures"=>Ok("uncompressed_textures"),"tastefulEnhancements"=>Ok("tasteful_enhancements"),
    "uncompressedAudio"=>Ok("uncompressed_audio"),"custom"=>Ok("community_pack"),_=>invalid("Unknown presentation-pack choice")
}}
pub fn inspect_archive(file:&Path,kind:&str)->Result<PackagePlan>{
    let fallback=fallback(kind)?;let inventory=archive::inventory(file)?;
    let manifests=inventory.entries.iter().filter(|e|e.name.replace('\\',"/").rsplit('/').next().is_some_and(|s|s.eq_ignore_ascii_case("mod.toml"))).collect::<Vec<_>>();
    if manifests.len()!=1{return invalid("Choose a ZIP containing one pack: its mod.toml and tags folder. Multi-pack bundles need separate packages");}
    let entry=manifests[0];if entry.size>MAX_FILE{return invalid("Pack manifest exceeds 64 KiB");}
    let manifest=entry.name.replace('\\',"/");let prefix=manifest.strip_suffix(manifest.rsplit('/').next().unwrap()).unwrap();
    let mut zip=zip::ZipArchive::new(fs::File::open(file)?).map_err(zip_error)?;
    let mut text=String::new();zip.by_name(&entry.name).map_err(zip_error)?.take(MAX_FILE+1).read_to_string(&mut text)?;
    if text.len() as u64>MAX_FILE{return invalid("Pack manifest changed beyond its size limit");}
    let doc=parse(&text)?;
    let folder=if prefix.is_empty(){string(&doc,"id",fallback,63)?}else{prefix.trim_end_matches('/').rsplit('/').next().unwrap().to_string()};
    name_token(&folder)?;
    let metadata=pack_metadata(folder.clone(),&text,true,true)?;
    if !metadata.toggleable{return invalid(metadata.diagnostic.unwrap_or_else(||"Unsupported pack metadata".into()));}
    let mut entries=vec![];let mut bytes=0u64;let mut tags=0;
    for e in &inventory.entries{
        let name=e.name.replace('\\',"/");if name.ends_with('/'){continue;}
        let relative=if name==manifest{"mod.toml".to_string()}else if let Some(value)=name.strip_prefix(prefix){value.to_string()}else{
            let leaf=name.rsplit('/').next().unwrap_or("").to_ascii_lowercase();
            if !leaf.starts_with("readme")&&!leaf.starts_with("license")&&!leaf.starts_with("copying"){return invalid("Pack ZIP contains unrelated content outside its pack folder");}
            format!("publisher_docs/{name}")
        };
        crate::safe_relative(&relative)?;
        let leaf=relative.rsplit('/').next().unwrap_or("").to_ascii_lowercase();
        if relative.starts_with("tags/"){
            let ext=leaf.rsplit('.').next().unwrap_or("");
            if !["bitmap","sound","gbxmodel","model","string_list","unicode_string_list"].contains(&ext){
                return invalid(format!("Pack includes unsupported gameplay or executable data: {relative}"));
            }
            if e.size<64{return invalid(format!("Native tag is truncated: {relative}"));}
            tags+=1;
        }else if relative!="mod.toml" && !leaf.starts_with("readme") && !leaf.starts_with("license") && !leaf.starts_with("copying"){
            return invalid(format!("Pack includes unsupported data: {relative}"));
        }
        bytes=bytes.checked_add(e.size).ok_or_else(||SparkError::Invalid("Pack size overflow".into()))?;
        if bytes>2*1024*1024*1024{return invalid("Pack expands beyond the 2 GiB install limit");}
        entries.push((e.name.clone(),relative.into(),e.size));
    }
    if tags==0{return invalid("The pack has no native tag data; it is not ready to install");}
    Ok(PackagePlan{sha256:inventory.sha256,archive_bytes:inventory.size,folder,name:metadata.name,files:entries.len(),installed_bytes:bytes,metadata_only_validation:true,entries})
}
pub fn install_archive(file:&Path,kind:&str,expected_sha:&str,root:&Path,expected_inventory:&str)->Result<InstallReceipt>{
    let plan=inspect_archive(file,kind)?;
    if plan.sha256!=expected_sha{return invalid("Pack download changed since review");}
    let root=fs::canonicalize(root)?;crate::reject_links(&root)?;
    if scan(&root)?.1!=expected_inventory{return invalid("Installed packs changed; recheck before installing");}
    let mods=root.join("mods");crate::reject_links(&mods)?;fs::create_dir_all(&mods)?;
    if crate::storage::free_bytes(&mods).is_some_and(|n|n<plan.installed_bytes.saturating_add(256*1024*1024)){return invalid("Not enough free space to install the complete pack safely");}
    let lock=mods.join(".spark-pack.lock");crate::reject_links(&lock)?;
    let mut lock_file=fs::OpenOptions::new().write(true).create_new(true).open(&lock).map_err(|_|SparkError::Invalid("Another pack operation is active or interrupted".into()))?;
    let owner_text=format!("{}\n",std::process::id());
    let lock=OwnedFile::new(lock,&lock_file,owner_text.as_bytes())?;
    lock_file.write_all(owner_text.as_bytes())?;lock_file.sync_all()?;drop(lock_file);
    let destination=mods.join(&plan.folder);crate::reject_links(&destination)?;
    if destination.exists(){return invalid("This pack folder already exists. Spark will not overwrite it; keep the current pack or choose a separate reviewed version");}
    let mut stage=archive::StageGuard::new(&mods,uuid::Uuid::new_v4().to_string())?;
    let mut zip=zip::ZipArchive::new(fs::File::open(file)?).map_err(zip_error)?;
    let mut hashes=BTreeMap::new();
    for (name,relative,size) in &plan.entries{
        let mut entry=zip.by_name(name).map_err(zip_error)?;
        let out=stage.path().join("payload").join(crate::safe_relative(relative)?);
        let count=stage.copy(&mut entry.by_ref().take(size+1),&out)?;
        if count!=*size{return invalid("Pack entry length or CRC changed during extraction");}
        hashes.insert(relative.clone(),maps::hash_file(&out)?);
    }
    if maps::hash_file(file)?!=plan.sha256||scan(&root)?.1!=expected_inventory{return invalid("Source or installed packs changed during installation");}
    let receipt=InstallReceipt{folder:destination.clone(),name:plan.name,archive_sha256:plan.sha256,files:plan.files,bytes:plan.installed_bytes,file_sha256:hashes,payload_playback_verified:false};
    let record=serde_json::to_vec_pretty(&receipt)?;
    let record_path=stage.path().join("payload/.spark-pack-receipt.json");
    stage.copy(&mut std::io::Cursor::new(record),&record_path)?;
    lock.verify()?;
    stage.publish_payload_new(&destination)?;
    Ok(receipt)
}
#[cfg(test)]mod tests{
    use super::*;use zip::{ZipWriter,write::SimpleFileOptions};
    fn fixture(path:&Path,extra:Option<(&str,&[u8])>){
        let mut zip=ZipWriter::new(fs::File::create(path).unwrap());
        for (name,data) in [("pack/mod.toml",b"name='QA native data pack'\nid='fixture'\nformat=1\n".as_slice()),("pack/tags/fixture.bitmap",&[0u8;64][..]),("pack/LICENSE.txt",b"QA authored fixture".as_slice())].into_iter().chain(extra){
            zip.start_file(name,SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored)).unwrap();zip.write_all(data).unwrap();
        }zip.finish().unwrap();
    }
    #[cfg(windows)]
    #[test]fn valid_archive_installs_once_without_replacing_originals(){
        let t=tempfile::tempdir().unwrap();let file=t.path().join("fixture.zip");fixture(&file,None);let root=t.path().join("game");fs::create_dir(&root).unwrap();
        let before=scan(&root).unwrap().1;let p=inspect_archive(&file,"custom").unwrap();assert_eq!(p.files,3);assert!(p.metadata_only_validation);
        let out=install_archive(&file,"custom",&p.sha256,&root,&before).unwrap();
        assert!(!out.payload_playback_verified);assert_eq!(fs::read(out.folder.join("tags/fixture.bitmap")).unwrap(),vec![0;64]);
        let now=scan(&root).unwrap().1;assert!(install_archive(&file,"custom",&p.sha256,&root,&now).is_err());
        assert_eq!(maps::hash_file(&file).unwrap(),p.sha256);
        assert!(!fs::read_dir(root.join("mods")).unwrap().any(|e|e.unwrap().file_name().to_string_lossy().starts_with(".stage-")));
    }
    #[test]fn wrong_identity_and_executable_payload_are_refused_before_publication(){
        let t=tempfile::tempdir().unwrap();let file=t.path().join("fixture.zip");fixture(&file,Some(("pack/tags/evil.exe",b"not permitted")));
        assert!(inspect_archive(&file,"custom").is_err());
        fixture(&file,None);let before=scan(t.path()).unwrap().1;
        assert!(install_archive(&file,"custom",&"0".repeat(64),t.path(),&before).is_err());
        assert!(!t.path().join("mods").exists());
    }
    #[cfg(windows)]
    #[test]fn payload_crc_failure_rolls_back_only_owned_partial_files(){
        use std::io::Seek;
        let t=tempfile::tempdir().unwrap();let file=t.path().join("fixture.zip");fixture(&file,None);
        let offset={let mut z=zip::ZipArchive::new(fs::File::open(&file).unwrap()).unwrap();let offset=z.by_name("pack/tags/fixture.bitmap").unwrap().data_start().unwrap();offset};
        {let mut f=fs::OpenOptions::new().write(true).open(&file).unwrap();f.seek(std::io::SeekFrom::Start(offset)).unwrap();f.write_all(&[1]).unwrap();}
        let p=inspect_archive(&file,"custom").unwrap();let root=t.path().join("game");fs::create_dir(&root).unwrap();
        let before=scan(&root).unwrap().1;
        assert!(install_archive(&file,"custom",&p.sha256,&root,&before).is_err());
        assert!(!root.join("mods/pack").exists());assert!(fs::read_dir(root.join("mods")).unwrap().next().is_none());
        assert_eq!(maps::hash_file(&file).unwrap(),p.sha256);
    }

}

