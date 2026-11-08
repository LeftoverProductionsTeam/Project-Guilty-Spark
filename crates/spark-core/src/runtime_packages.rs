//! Publisher-pinned engine packages. Engine binaries stay separate; owned game
//! content is referenced through the existing exact-build runtime profiles.
use crate::{archive,invalid,maps,reject_links,Result,runtime::RuntimeId};
use serde::Serialize;
use std::{collections::BTreeMap,fs,io::Read,path::{Path,PathBuf}};
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct Package {
 pub id:&'static str,pub name:&'static str,pub version:&'static str,pub runtime_id:RuntimeId,
 pub url:&'static str,pub release_page:&'static str,pub repository:&'static str,
 pub sha256:&'static str,pub bytes:u64,pub executable:&'static str,pub executable_sha256:&'static str,
 pub license:&'static str,pub vr_verified:bool,
}
pub fn catalog()->Vec<Package>{vec![
 Package{id:"opence",name:"OpenCE",version:"build-343",runtime_id:RuntimeId::OpenCe,url:"https://github.com/OpenCommunityEdition/OpenCE/releases/download/build-343/halo-windows-release.zip",release_page:"https://github.com/OpenCommunityEdition/OpenCE/releases/tag/build-343",repository:"https://github.com/OpenCommunityEdition/OpenCE",sha256:"4804cceef72a0b18f97813902625bf32c6f7677d0f023f3bc49eb31cceb2be81",bytes:15186349,executable:"halo.exe",executable_sha256:"cd249f7ffd94c21b7f8bec1efc3e734753c48cf45d56d16f21a4ef53bcf07dd9",license:"AGPL v3 (bundled license); all notices retained",vr_verified:false},
 Package{id:"chupathingy",name:"Chupathingy",version:"v0.9.0c",runtime_id:RuntimeId::ChupathingyCe,url:"https://github.com/ChupathingyCE/chupathingyce/releases/download/v0.9.0c/chupathingyce-windows64-release.zip",release_page:"https://github.com/ChupathingyCE/chupathingyce/releases/tag/v0.9.0c",repository:"https://github.com/ChupathingyCE/chupathingyce",sha256:"be85c65f3bd9abf3c1dfb8d912f900fb15d6940be3080412a866e8734fc2f72c",bytes:31227575,executable:"chupathingy.exe",executable_sha256:"fa9997520ebb2d8406fbe31db7146e1354b75569da1172c6dbf7717b9ee2b86b",license:"GPL v3 (bundled license); all notices retained",vr_verified:false},
 Package{id:"faber",name:"OpenCE Faber",version:"v2.3.4",runtime_id:RuntimeId::OpenCe,url:"https://github.com/SutlabSol/OpenCE-Faber/releases/download/v2.3.4/OpenCE-Faber-Windows-Full.zip",release_page:"https://github.com/SutlabSol/OpenCE-Faber/releases/tag/v2.3.4",repository:"https://github.com/SutlabSol/OpenCE-Faber",sha256:"b6ed7f1df72dfa4dbc935e3747bda347f6ea4bbd11ca613938a2d823c401d3ec",bytes:43294895,executable:"halo.exe",executable_sha256:"5c7368529b3ab0856f3987b1a03c62aa34c18e63ab833d35e385c8b61e2597e3",license:"AGPL v3 (bundled license); all notices retained",vr_verified:false},
 Package{id:"openh1",name:"OpenH1",version:"build-1845",runtime_id:RuntimeId::OpenCe,url:"https://github.com/OpenH1/OpenH1/releases/download/build-1845/OpenH1-Windows.zip",release_page:"https://github.com/OpenH1/OpenH1/releases/tag/build-1845",repository:"https://github.com/OpenH1/OpenH1",sha256:"557cb59541631515da49d8a2c96c385cc05e4ac0e9730ab8a41f4f478c16a9d7",bytes:20893816,executable:"halo.exe",executable_sha256:"7aab23553625099ed156faa627d31c7bbc342e4b5d252a348f0d0ddf464ddb46",license:"AGPL v3 (bundled license); all notices retained",vr_verified:false},
]}
/// Exact v0.9.0c publisher members, including notices. An isolated playtest
/// copies only these files; it must not launch beside the user's config/saves.
/// Inventory derived from the package SHA pinned in catalog(), not a folder scan.
pub fn chupathingy_playtest_members()->&'static [(&'static str,&'static str,u64)] { &[
 ("OpenCE-OFL.txt","2237b5d655a32d435d55f93e23d6cf83eac200f9518cb00b53efdb6ef3002424",4602),
 ("Kenney-Input-Prompts-CC0.txt","ca2f58f80f903512119da5828868199478119818cd7ecffb303d625cb74cbb5a",708),
 ("bimg-LICENSE.txt","ac2e0d253b1584316a36a0fae1d4407fa3ebcb15f27021ab479b23d27f0c9c08",1299),
 ("bgfx-LICENSE.txt","ac2e0d253b1584316a36a0fae1d4407fa3ebcb15f27021ab479b23d27f0c9c08",1299),
 ("Overpass-OFL.txt","f76873f787c73f5cfdf12caa616326026f4f0c8640433f39bcc43ae6db92743f",4485),
 ("chupathingy.exe","fa9997520ebb2d8406fbe31db7146e1354b75569da1172c6dbf7717b9ee2b86b",27652096),
 ("SDL3.dll","1f98969319302a100931f4385e5918a0bd53ab07773040682d22e7edb54858c0",2844160),
 ("bx-LICENSE.txt","ac2e0d253b1584316a36a0fae1d4407fa3ebcb15f27021ab479b23d27f0c9c08",1299),
 ("brokers.txt","62bcfaaa2bb777b4a8a12c74479b7b9f8ec2444cef7184b0b79314cb4a48641f",523),
 ("miniupnpc-LICENSE.txt","b3633761a56f77c6cd65358126da1f5d952eb1ecafa1a42e83dadb068b35e29f",1556),
 ("LICENSE.txt","230184f60bae2feaf244f10a8bac053c8ff33a183bcc365b4d8b876d2b7f4809",35823),
 ("halo.exe","e5ce1ebb95865492ed06255100d0c677852d30202f06fd506fdc243a0a7b57df",581632),
 ("CyborgInterfaceGothic-OFL.txt","81cc719292872d857c744ae86100fad7f8b887438a993236710d88d2baf525d6",4665),
 ("mbedtls-LICENSE.txt","f8582e76de1b7dd1caa680ab9a82cf2455b4392f00613b68a63df88121909175",30405),
 ("expat-COPYING.txt","431dd07ea1ffce7b9e525014bbf923006f129ee28ef5cdffc048f8e3eb39191c",1165),
 ("NotoSans-OFL.txt","bf51547e7634b219e85d0391a5836850696497e0cef079857978f286b5d9377f",4489),
 ("glslang-LICENSE.txt","17e70c676e1521ff3e4686f04a2053d93a7e28a33be8de7ec37ab0ff72feb677",54615),
] }
pub fn supported_host()->bool{cfg!(all(target_os="windows",target_arch="x86_64"))}
pub fn package(id:&str)->Result<Package>{catalog().into_iter().find(|p|p.id==id).ok_or_else(||crate::SparkError::Invalid("Unknown reviewed runtime package".into()))}
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct Plan {pub package:Package,pub files:usize,pub expanded_bytes:u64,pub omitted_aliases:Vec<String>}
pub fn inspect(file:&Path,id:&str)->Result<Plan>{
 let p=package(id)?;reject_links(file)?;
 let inventory=archive::inventory(file)?;
 if inventory.sha256!=p.sha256||inventory.size!=p.bytes{return invalid("Engine package differs from the publisher-pinned release. No files were installed");}
 let mut bytes=0u64;let mut files=0;let mut exe=false;let mut aliases=vec![];
 for e in inventory.entries{
  if e.name.ends_with('/'){continue;}
  let name=e.name.replace('\\',"/");crate::safe_relative(&name)?;
  let ext=name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
  if ["map","xiso","iso","yelo"].contains(&ext.as_str()){return invalid("Engine downloads must not contain proprietary game maps or disc images");}
  if name==p.executable{exe=true;}
  // Faber ships two byte-identical names for the same engine. Spark uses halo.exe.
  if p.id=="faber"&&name=="OpenCE - Faber.exe"{aliases.push(name);continue;}
  bytes=bytes.checked_add(e.size).ok_or_else(||crate::SparkError::Invalid("Engine size overflow".into()))?;
  if bytes>256*1024*1024{return invalid("Engine package expands beyond its reviewed storage budget");}files+=1;
 }
 if !exe{return invalid("The reviewed engine executable is missing");}
 Ok(Plan{package:p,files,expanded_bytes:bytes,omitted_aliases:aliases})
}
#[derive(Clone,Debug,Serialize,serde::Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Installed {
 pub package_id:String,pub version:String,pub root:PathBuf,pub executable:PathBuf,pub archive_sha256:String,
 pub file_sha256:BTreeMap<String,String>,pub bytes:u64,pub omitted_aliases:Vec<String>,pub reused:bool,
}
pub fn install(file:&Path,id:&str,engines:&Path)->Result<Installed>{
 if !supported_host(){return invalid("Managed engine installation is verified only on Windows x64");}
 let plan=inspect(file,id)?;let p=&plan.package;reject_links(engines)?;fs::create_dir_all(engines)?;
 let destination=engines.join(format!("{}-{}",p.id,p.version));reject_links(&destination)?;
 if destination.exists(){
  let receipt=destination.join(".spark-engine.json");reject_links(&receipt)?;
  if fs::metadata(&receipt)?.len()>128*1024{return invalid("Managed engine receipt is too large");}let bytes=fs::read(&receipt)?;
  let mut installed:Installed=serde_json::from_slice(&bytes)?;
  if installed.package_id!=p.id||installed.version!=p.version||installed.archive_sha256!=p.sha256||installed.root!=destination||installed.executable!=destination.join(p.executable){return invalid("Existing engine folder has a different owner or release; retained");}
  for (name,sha) in &installed.file_sha256{let path=destination.join(crate::safe_relative(name)?);reject_links(&path)?;if maps::hash_file(&path)?!=*sha{return invalid("Installed engine files changed; review the existing installation before repair");}}
  if installed.file_sha256.get(p.executable).map(String::as_str)!=Some(p.executable_sha256){return invalid("Installed engine identity changed");}installed.reused=true;return Ok(installed);
 }
 if crate::storage::free_bytes(engines).is_some_and(|n|n<plan.expanded_bytes+256*1024*1024){return invalid("Not enough free space for a complete engine installation");}
 let mut stage=archive::StageGuard::new(engines,uuid::Uuid::new_v4().to_string())?;
 let mut zip=zip::ZipArchive::new(fs::File::open(file)?).map_err(|e|crate::SparkError::Invalid(e.to_string()))?;
 let mut hashes=BTreeMap::new();
 for i in 0..zip.len(){
  let mut entry=zip.by_index(i).map_err(|e|crate::SparkError::Invalid(e.to_string()))?;if entry.is_dir(){continue;}
  let name=entry.name().map_err(|e|crate::SparkError::Invalid(e.to_string()))?.replace('\\',"/");let size=entry.size();
  if plan.omitted_aliases.contains(&name){
   let mut bytes=vec![];entry.by_ref().take(64*1024*1024).read_to_end(&mut bytes)?;
   use sha2::Digest;
   if crate::hex_bytes(sha2::Sha256::digest(&bytes))!=p.executable_sha256{return invalid("Duplicate engine alias no longer matches the reviewed executable");}continue;
  }
  let target=stage.path().join("payload").join(crate::safe_relative(&name)?);
  if stage.copy(&mut entry.by_ref().take(size+1),&target)?!=size{return invalid("Engine entry length/CRC mismatch");}
  hashes.insert(name,maps::hash_file(&target)?);
 }
 if hashes.get(p.executable).map(String::as_str)!=Some(p.executable_sha256)||maps::hash_file(file)?!=p.sha256{return invalid("Engine identity changed during installation");}
 let installed=Installed{package_id:p.id.into(),version:p.version.into(),root:destination.clone(),executable:destination.join(p.executable),archive_sha256:p.sha256.into(),file_sha256:hashes,bytes:plan.expanded_bytes,omitted_aliases:plan.omitted_aliases,reused:false};
 let record=serde_json::to_vec_pretty(&installed)?;let record_path=stage.path().join("payload/.spark-engine.json");stage.copy(&mut std::io::Cursor::new(record),&record_path)?;
 stage.publish_payload_new(&destination)?;Ok(installed)
}
#[cfg(test)]mod tests{
 use super::*;use std::io::Write;use crate::runtime;
 #[test]fn catalog_has_only_versioned_publisher_packages_and_exact_launch_interfaces(){
  let all=catalog();assert_eq!(all.len(),4);
  for p in all{assert_eq!(p.sha256.len(),64);assert_eq!(p.executable_sha256.len(),64);assert!(p.url.starts_with(&format!("{}/releases/download/{}/",p.repository,p.version)));assert!(p.bytes<50*1024*1024);assert!(runtime::shared_content_interface(p.runtime_id,p.executable_sha256).is_some());assert!(!p.vr_verified);}
  assert!(package("latest-unreviewed").is_err());
 }
 #[test]fn playtest_shell_is_exact_publisher_content_without_user_configuration(){
  let files=chupathingy_playtest_members();assert_eq!(files.len(),17);
  let package=package("chupathingy").unwrap();
  assert_eq!(files.iter().find(|row|row.0==package.executable).unwrap().1,package.executable_sha256);
  assert!(files.iter().any(|row|row.0=="SDL3.dll"));assert!(files.iter().any(|row|row.0=="LICENSE.txt"));
  assert!(files.iter().all(|(name,sha,_)|!name.contains('/')&&!name.contains('\\')&&sha.len()==64&&!name.ends_with(".map")&&!name.ends_with(".toml")));
  assert!(files.iter().map(|row|row.2).sum::<u64>()<32*1024*1024);
 }
 #[test]fn foreign_zip_is_refused_without_creating_engine_folder(){
  let t=tempfile::tempdir().unwrap();let input=t.path().join("wrong.zip");let mut zip=zip::ZipWriter::new(fs::File::create(&input).unwrap());
  zip.start_file("halo.exe",zip::write::SimpleFileOptions::default()).unwrap();zip.write_all(b"not publisher code").unwrap();zip.finish().unwrap();
  assert!(inspect(&input,"opence").is_err());assert!(!t.path().join("engines").exists());
 }
}


#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct DynamicLayout {pub root:PathBuf,pub engines:PathBuf,pub maps:PathBuf,pub custom_maps:PathBuf,pub ce_maps:PathBuf,pub player_mods:PathBuf,pub presentation_mods:PathBuf}
const DYNAMIC_OWNER:&str="ProjectGuiltySpark/dynamic-runtime-v1";
pub fn dynamic_layout(root:&Path)->Result<DynamicLayout>{
 if !root.is_absolute()||root.file_name().is_none(){return invalid("Choose a named empty folder or an existing Spark dynamic runtime");}
 reject_links(root)?;
 let root=if root.exists(){
  if !root.is_dir(){return invalid("Dynamic runtime location is not a directory");}
  let marker=root.join(".spark-dynamic-runtime.json");reject_links(&marker)?;
  if marker.exists(){
   if fs::metadata(&marker)?.len()>4096{return invalid("Dynamic runtime ownership record is too large");}
   let value:serde_json::Value=serde_json::from_slice(&fs::read(marker)?)?;
   if value["owner"]!=DYNAMIC_OWNER||value["schemaVersion"]!=1{return invalid("This folder belongs to another runtime setup; use your own runtime folders instead");}
  }else if fs::read_dir(root)?.next().is_some(){return invalid("This is an existing nonempty folder. Connect it with Use my runtime folders, or choose an empty folder for Spark");}
  fs::canonicalize(root)?
 }else{
  let parent=root.parent().ok_or_else(||crate::SparkError::Invalid("Dynamic folder has no parent".into()))?;
  reject_links(parent)?;fs::canonicalize(parent)?.join(root.file_name().unwrap())
 };
 Ok(DynamicLayout{engines:root.join("engines"),maps:root.join("maps"),custom_maps:root.join("custom_maps"),ce_maps:root.join("maps_ce"),player_mods:root.join("player_mods"),presentation_mods:root.join("mods"),root})
}
pub fn prepare_dynamic_layout(root:&Path)->Result<DynamicLayout>{
 let plan=dynamic_layout(root)?;
 if !plan.root.exists(){fs::create_dir(&plan.root)?;}
 let marker=plan.root.join(".spark-dynamic-runtime.json");
 if !marker.exists(){
  let mut file=fs::OpenOptions::new().write(true).create_new(true).open(marker)?;
  use std::io::Write;
  file.write_all(&serde_json::to_vec(&serde_json::json!({"owner":DYNAMIC_OWNER,"schemaVersion":1,"id":uuid::Uuid::new_v4().to_string()}))?)?;file.sync_all()?;
 }
 for dir in [&plan.engines,&plan.maps,&plan.custom_maps,&plan.ce_maps,&plan.player_mods,&plan.presentation_mods]{
  reject_links(dir)?;fs::create_dir_all(dir)?;
 }
 Ok(plan)
}


#[cfg(test)]mod dynamic_tests{
 use super::*;
 #[test]fn managed_layout_is_explicit_recoverable_and_keeps_player_mods(){
  let t=tempfile::tempdir().unwrap();let root=t.path().join("dynamic");
  let plan=dynamic_layout(&root).unwrap();assert!(!plan.root.exists());
  let made=prepare_dynamic_layout(&root).unwrap();
  for dir in [&made.engines,&made.maps,&made.ce_maps,&made.custom_maps,&made.player_mods,&made.presentation_mods]{assert!(dir.is_dir());}
  let authored=made.player_mods.join("authored.map");fs::write(&authored,b"authored ownership fixture").unwrap();let hash=maps::hash_file(&authored).unwrap();
  prepare_dynamic_layout(&root).unwrap();assert_eq!(maps::hash_file(&authored).unwrap(),hash);
  assert!(fs::read_dir(made.maps).unwrap().next().is_none());
 }
 #[test]fn existing_runtime_and_changed_owner_are_never_adopted_or_rearranged(){
  let t=tempfile::tempdir().unwrap();let root=t.path().join("owned");fs::create_dir(&root).unwrap();let game=root.join("halo.exe");fs::write(&game,b"protected user installation").unwrap();
  assert!(prepare_dynamic_layout(&root).is_err());assert_eq!(fs::read(&game).unwrap(),b"protected user installation");assert!(!root.join(".spark-dynamic-runtime.json").exists());
  fs::write(root.join(".spark-dynamic-runtime.json"),b"{\"owner\":\"another-app\",\"schemaVersion\":1}").unwrap();assert!(prepare_dynamic_layout(&root).is_err());
 }
 #[test]fn a_conflicting_layout_file_and_relative_root_remain_protected(){
  let t=tempfile::tempdir().unwrap();let root=t.path().join("dynamic");let plan=prepare_dynamic_layout(&root).unwrap();
  fs::remove_dir(&plan.ce_maps).unwrap();fs::write(&plan.ce_maps,b"user file").unwrap();
  assert!(prepare_dynamic_layout(&root).is_err());assert_eq!(fs::read(&plan.ce_maps).unwrap(),b"user file");
  assert!(dynamic_layout(Path::new("relative")).is_err());
 }
}

