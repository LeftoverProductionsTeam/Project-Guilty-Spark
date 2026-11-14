//! Presentation packs through a reviewed runtime's native mods protocol.
//! Only bounded manifests are inspected; the engine validates payloads on load.
use crate::{invalid, maps, runtime::{self, RuntimeId, RuntimeRegistration}, Result, SparkError};
use serde::{Deserialize, Serialize};
use std::{collections::{BTreeMap,BTreeSet}, fs, io::{Read,Write}, path::{Path,PathBuf}};
use toml_edit::{DocumentMut,Array,value};
#[path="runtime_mod_archive.rs"] mod packages;
pub use packages::{inspect_archive,install_archive,PackagePlan,InstallReceipt};
const MAX_FILE:u64=65536;
const MAX_PACKS:usize=256;
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Preference {
    pub registration_id:String, pub executable_sha256:String, pub data_root:PathBuf,
    pub inventory_sha256:String, pub baseline_order_sha256:Option<String>,
    pub enabled:BTreeMap<String,bool>,
}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Applied {
    pub data_root:PathBuf, pub inventory_sha256:String, pub order_sha256:Option<String>,
}
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct Pack {
    pub folder:String, pub id:String, pub name:String, pub version:Option<String>,
    pub description:String, pub kind:Option<String>, pub manifest_sha256:String,
    pub load_after:Vec<String>, pub load_before:Vec<String>, pub incompatible:Vec<String>,
    pub enabled:bool, pub native_enabled:bool, pub toggleable:bool, pub diagnostic:Option<String>,
}
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct Inventory {
    pub registration_id:String, pub supported:bool, pub reason:String, pub data_root:PathBuf,
    pub executable_sha256:String, pub inventory_sha256:String, pub order_sha256:Option<String>,
    pub packs:Vec<Pack>, pub saved:bool, pub needs_review:bool, pub preference_sha256:Option<String>,
}
// Independently reviewed Windows builds, not inferred from a filename or family.
// OpenCE docs/mods.md and port/linux/src/port_mods.c at fc9deb0b; no engine code copied.
pub fn supported(id:RuntimeId,sha:&str)->bool {
    id==RuntimeId::OpenCe && matches!(sha,
        "cd249f7ffd94c21b7f8bec1efc3e734753c48cf45d56d16f21a4ef53bcf07dd9"
        | "5c7368529b3ab0856f3987b1a03c62aa34c18e63ab833d35e385c8b61e2597e3"
        | "b9b69d43a6757961152cec070bfa3d59d96209d16f8018befd74c9896209b1ea" | "7aab23553625099ed156faa627d31c7bbc342e4b5d252a348f0d0ddf464ddb46")
}
fn bounded(path:&Path)->Result<Option<String>> {
    crate::reject_links(path)?;
    match fs::File::open(path){
        Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Ok(None),
        Err(e)=>Err(e.into()),
        Ok(file)=>{
            if !file.metadata()?.is_file() || file.metadata()?.len()>MAX_FILE{return invalid("Mod metadata exceeds its 64 KiB limit");}
            let mut bytes=Vec::new();file.take(MAX_FILE+1).read_to_end(&mut bytes)?;
            if bytes.len() as u64>MAX_FILE{return invalid("Mod metadata changed beyond its size limit");}
            String::from_utf8(bytes).map(Some).map_err(|_|SparkError::Invalid("Mod metadata must be UTF-8".into()))
        }
    }
}
fn digest(text:&str)->String {use sha2::Digest;crate::hex_bytes(sha2::Sha256::digest(text.as_bytes()))}
fn parse(text:&str)->Result<DocumentMut>{text.parse().map_err(|_|SparkError::Invalid("Invalid mod TOML; fix the original metadata before changing packs".into()))}
fn name_token(text:&str)->Result<()> {
    crate::safe_relative(text)?;
    if text.len()>63 || text.contains(['\\','/']) {return invalid("Mod folder or identifier exceeds native limits");}Ok(())
}
fn names(doc:&DocumentMut,key:&str,maximum:usize)->Result<Vec<String>> {
    let Some(item)=doc.get(key) else{return Ok(vec![])};
    let list=item.as_array().ok_or_else(||SparkError::Invalid(format!("Mod {key} must be a string array")))?;
    if list.len()>maximum{return invalid(format!("Mod {key} exceeds its native limit"));}
    list.iter().map(|v|{
        let s=v.as_str().ok_or_else(||SparkError::Invalid(format!("Mod {key} must contain strings")))?;
        name_token(s)?;Ok(s.to_string())
    }).collect()
}
fn string(doc:&DocumentMut,key:&str,default:&str,maximum:usize)->Result<String> {
    let Some(item)=doc.get(key) else{return Ok(default.into())};
    let s=item.as_str().ok_or_else(||SparkError::Invalid(format!("Mod {key} must be text")))?;
    if s.len()>maximum || s.contains(['\0','\r']){return invalid(format!("Mod {key} is too long or invalid"));}Ok(s.into())
}
fn pack(folder:String,text:&str,native_enabled:bool,tags:&Path)->Result<Pack> {
    crate::reject_links(tags)?;
    pack_metadata(folder,text,native_enabled,tags.is_dir())
}
fn pack_metadata(folder:String,text:&str,native_enabled:bool,has_tags:bool)->Result<Pack>{
    let d=parse(text)?;
    let id=string(&d,"id",&folder,63)?;name_token(&id)?;
    let name=string(&d,"name",&folder,256)?;
    let description=string(&d,"description","",2048)?;
    let version=if d.contains_key("version"){Some(string(&d,"version","",128)?)}else{None};
    let format=match d.get("format"){None=>1,Some(x)=>x.as_integer().ok_or_else(||SparkError::Invalid("Mod format must be an integer".into()))?};
    names(&d,"maps",64)?;
    let channel=string(&d,"channel_order","pc",8)?;
    let diagnostic=if format!=1{Some("This pack needs a different native mod format".into())}
        else if !["pc","xbox"].contains(&channel.as_str()){Some("Unknown native texture-channel order".into())}
        else if !has_tags{Some("Missing tags folder; finish installing this pack first".into())}else{None};
    let key=format!("{id} {folder} {name}").to_ascii_lowercase().chars().filter(|c|c.is_ascii_alphanumeric()).collect::<String>();
    let kind=if key.contains("uncompressedtexture"){Some("uncompressedTextures".into())}
        else if key.contains("tasteful"){Some("tastefulEnhancements".into())}
        else if key.contains("uncompressedaudio")||key.contains("uncompressedsound"){Some("uncompressedAudio".into())}else{None};
    Ok(Pack{folder,id,name,version,description,kind,manifest_sha256:digest(text),load_after:names(&d,"load_after",256)?,load_before:names(&d,"load_before",256)?,incompatible:names(&d,"incompatible",256)?,enabled:native_enabled,native_enabled,toggleable:diagnostic.is_none(),diagnostic})
}
fn scan(root:&Path)->Result<(Vec<Pack>,String,Option<String>)> {
    let mods=root.join("mods");crate::reject_links(&mods)?;
    let order=bounded(&mods.join("load_order.toml"))?;
    let d=parse(order.as_deref().unwrap_or(""))?;
    names(&d,"order",MAX_PACKS)?;
    let disabled=names(&d,"disabled",MAX_PACKS)?.into_iter().map(|s|s.to_ascii_lowercase()).collect::<BTreeSet<_>>();
    let mut packs=vec![];
    if mods.exists(){
        let mut count=0;
        for entry in fs::read_dir(&mods)?{
            let entry=entry?;count+=1;
            if count>1024{return invalid("Too many entries in the native mods folder");}
            crate::reject_links(&entry.path())?;
            if !entry.file_type()?.is_dir(){continue;}
            let folder=entry.file_name().into_string().map_err(|_|SparkError::Invalid("Mod folder is not Unicode".into()))?;
            name_token(&folder)?;
            let Some(text)=bounded(&entry.path().join("mod.toml"))? else{continue};
            if packs.len()>=MAX_PACKS{return invalid("Native pack count exceeds 256");}
            match pack(folder.clone(),&text,!disabled.contains(&folder.to_ascii_lowercase()),&entry.path().join("tags")){
                Ok(pack)=>packs.push(pack),
                Err(error)=>packs.push(Pack{folder:folder.clone(),id:folder.clone(),name:folder,version:None,description:String::new(),kind:None,manifest_sha256:digest(&text),load_after:vec![],load_before:vec![],incompatible:vec![],enabled:false,native_enabled:false,toggleable:false,diagnostic:Some(error.to_string())})
            }
        }
    }
    packs.sort_by_key(|p|p.folder.to_ascii_lowercase());
    let mut folders=BTreeSet::new();
    for p in &packs{if !folders.insert(p.folder.to_ascii_lowercase()){return invalid("Ambiguous case-colliding mod folders");}}
    let identity=packs.iter().map(|p|format!("{}\0{}\0{}\n",p.folder,p.manifest_sha256,p.toggleable)).collect::<String>();
    Ok((packs,digest(&identity),order.as_deref().map(digest)))
}
pub fn inspect(reg:&RuntimeRegistration,pref:Option<&Preference>)->Result<Inventory>{
    let installation=runtime::inspect_registration(reg)?;
    let sha=installation.executable_sha256.unwrap_or_default();
    let capable=installation.validation==runtime::TestStatus::Pass&&supported(reg.runtime_id,&sha);
    let (mut packs,inventory_sha256,order_sha256)=if capable{scan(&installation.data_root)?}else{(vec![],String::new(),None)};
    let valid=pref.is_some_and(|p|p.registration_id==reg.id&&p.executable_sha256==sha&&p.data_root==installation.data_root&&p.inventory_sha256==inventory_sha256);
    if valid{for p in &mut packs{if let Some(enabled)=pref.unwrap().enabled.get(&p.folder){p.enabled=*enabled;}}}
    Ok(Inventory{registration_id:reg.id.clone(),supported:capable,reason:if capable{"Local presentation packs; saved choices apply on the next launch from Spark. Native load order is preserved.".into()}else{"This installed build has no verified compatible pack loader. Spark will not replace its maps or resources.".into()},data_root:installation.data_root,executable_sha256:sha,inventory_sha256,order_sha256,packs,saved:valid,needs_review:pref.is_some()&&!valid,preference_sha256:pref.map(|p|serde_json::to_string(p).map(|s|digest(&s))).transpose()?})
}
fn validate_choices(packs:&[Pack],enabled:&BTreeMap<String,bool>)->Result<()> {
    if enabled.len()>MAX_PACKS || enabled.keys().any(|key|!packs.iter().any(|p|&p.folder==key&&p.toggleable)){
        return invalid("Pack choices include a missing or unsupported pack; recheck the list");
    }
    let active=packs.iter().filter(|p|p.toggleable&&enabled.get(&p.folder).copied().unwrap_or(p.native_enabled)).collect::<Vec<_>>();
    for a in &active{for b in &active{
        if a.folder!=b.folder && a.incompatible.iter().any(|id|id.eq_ignore_ascii_case(&b.id)||id.eq_ignore_ascii_case(&b.folder)){
            return invalid(format!("{} and {} are declared incompatible; turn one off",a.name,b.name));
        }
    }}Ok(())
}
pub fn preference(snapshot:&Inventory,expected_inventory:&str,expected_order:Option<&str>,enabled:BTreeMap<String,bool>)->Result<Preference>{
    if !snapshot.supported{return invalid(&snapshot.reason);}
    if snapshot.inventory_sha256!=expected_inventory||snapshot.order_sha256.as_deref()!=expected_order{return invalid("Native pack settings changed. Recheck before saving choices");}
    validate_choices(&snapshot.packs,&enabled)?;
    Ok(Preference{registration_id:snapshot.registration_id.clone(),executable_sha256:snapshot.executable_sha256.clone(),data_root:snapshot.data_root.clone(),inventory_sha256:snapshot.inventory_sha256.clone(),baseline_order_sha256:snapshot.order_sha256.clone(),enabled})
}
fn order_text(text:&str,packs:&[Pack],enabled:&BTreeMap<String,bool>)->Result<String>{
    validate_choices(packs,enabled)?;
    let mut doc=parse(text)?;
    names(&doc,"order",MAX_PACKS)?;
    let mut disabled=names(&doc,"disabled",MAX_PACKS)?;
    // Preserve unknown/disconnected packs and every native priority/comment.
    for (folder,on) in enabled{
        disabled.retain(|name|!name.eq_ignore_ascii_case(folder));
        if !on{disabled.push(folder.clone());}
    }
    if disabled.len()>MAX_PACKS{return invalid("Disabled pack list exceeds native limits");}
    let mut array=Array::new();for folder in disabled{array.push(folder);}
    let decor=doc.get("disabled").and_then(|x|x.as_value()).map(|x|x.decor().clone());
    doc["disabled"]=value(array);
    if let Some(decor)=decor{*doc["disabled"].as_value_mut().unwrap().decor_mut()=decor;}
    Ok(doc.to_string())
}
struct OwnedFile { path:PathBuf, identity:(u64,u64), sha256:String, bytes:u64 }
impl OwnedFile {
    fn new(path:PathBuf,file:&fs::File,expected:&[u8])->Result<Self> {
        use sha2::Digest;
        let identity=crate::storage::unique_file_handle_identity(file).ok_or_else(||SparkError::Invalid("Pack lock ownership is unavailable; retained".into()))?;
        if crate::storage::unique_file_identity(&path)!=Some(identity){return invalid("Pack lock was replaced; external file retained");}
        Ok(Self{path,identity,sha256:crate::hex_bytes(sha2::Sha256::digest(expected)),bytes:expected.len() as u64})
    }
    fn verify(&self)->Result<()> {
        use sha2::Digest;
        crate::reject_links(&self.path)?;
        let file=fs::File::open(&self.path)?;
        if crate::storage::unique_file_handle_identity(&file)!=Some(self.identity)||file.metadata()?.len()!=self.bytes{
            return invalid("Pack lock changed outside this operation; external file retained");
        }
        // Read only the expected tiny lock plus one byte, even if another
        // process grows this inode while cleanup is checking it.
        let mut bytes=Vec::new();file.take(self.bytes+1).read_to_end(&mut bytes)?;
        if bytes.len() as u64!=self.bytes||crate::hex_bytes(sha2::Sha256::digest(&bytes))!=self.sha256
            ||crate::storage::unique_file_identity(&self.path)!=Some(self.identity){return invalid("Pack lock changed outside this operation; external file retained");}
        Ok(())
    }
}
impl Drop for OwnedFile { fn drop(&mut self){if self.verify().is_ok(){let _=fs::remove_file(&self.path);}} }
// Only at deliberate launch, after the desktop's running-game check. Shared
// roots alternate known Spark states, never overwrite an unreviewed menu edit.
pub fn apply(reg:&RuntimeRegistration,pref:&Preference,applied:&[Applied])->Result<Applied>{
    let inventory=inspect(reg,Some(pref))?;
    apply_inventory(inventory,pref,applied)
}
fn apply_inventory(inventory:Inventory,pref:&Preference,applied:&[Applied])->Result<Applied>{
    apply_after_review(inventory,pref,applied,|_|Ok(()))
}
// A private checkpoint lets adversarial tests interrupt the real adoption path;
// no callback or executable operation is exposed to users, tools or peers.
fn apply_after_review(inventory:Inventory,pref:&Preference,applied:&[Applied],before_adopt:impl FnOnce(&Path)->Result<()>)->Result<Applied>{
    if !inventory.supported||!inventory.saved{return invalid("Runtime or pack metadata changed. Recheck and save pack choices before launching");}
    let mods=inventory.data_root.join("mods");
    if inventory.packs.is_empty(){return invalid("No installed packs to apply");}
    crate::reject_links(&mods)?;
    let lock=mods.join(".spark-pack.lock");crate::reject_links(&lock)?;
    let mut handle=fs::OpenOptions::new().write(true).create_new(true).open(&lock).map_err(|_|SparkError::Invalid("Pack settings are busy or interrupted; inspect .spark-pack.lock before retrying".into()))?;
    let owner_text=format!("{}\n",std::process::id());
    let lock=OwnedFile::new(lock,&handle,owner_text.as_bytes())?;handle.write_all(owner_text.as_bytes())?;handle.sync_all()?;drop(handle);
    let file=mods.join("load_order.toml");
    let revision=crate::project::FileRevision::capture(&file)?;
    let old=bounded(&file)?;revision.verify(&file)?;let old_hash=old.as_deref().map(digest);
    if old_hash!=pref.baseline_order_sha256 && !applied.iter().any(|p|p.data_root==inventory.data_root&&p.inventory_sha256==inventory.inventory_sha256&&p.order_sha256==old_hash){
        return invalid("The game's pack settings changed outside Spark. Recheck and save your choices before launching");
    }
    let text=order_text(old.as_deref().unwrap_or(""),&inventory.packs,&pref.enabled)?;
    if old.as_deref()!=Some(&text){
        let (_,now_inventory,now_order)=scan(&inventory.data_root)?;
        if now_inventory!=inventory.inventory_sha256||now_order!=old_hash{return invalid("Native pack settings changed during launch; no settings were adopted");}
        before_adopt(&file)?;
        lock.verify()?;
        crate::project::atomic_write_checked(&file,text.as_bytes(),false,Some(&revision))?;
        if bounded(&file)?.as_deref()!=Some(&text){return invalid("Native pack settings readback failed; game was not launched");}
    }
    Ok(Applied{data_root:inventory.data_root,inventory_sha256:inventory.inventory_sha256,order_sha256:Some(digest(&text))})
}
#[cfg(test)] mod tests{
    use super::*;
    fn fixture(root:&Path,name:&str,extra:&str){let p=root.join("mods").join(name);fs::create_dir_all(p.join("tags")).unwrap();fs::write(p.join("mod.toml"),format!("name = '{name}'\n{extra}")).unwrap();}
    #[test]fn native_priority_comments_and_unknown_entries_survive(){
        let t=tempfile::tempdir().unwrap();fixture(t.path(),"uncompressed_textures","");fixture(t.path(),"tasteful_enhancements","load_after=['uncompressed_textures']\n");
        let original="# user priority\norder = ['tasteful_enhancements', 'uncompressed_textures'] # manual\ndisabled = ['unavailable_pack'] # keep\n[extra]\nvalue=42\n";
        fs::write(t.path().join("mods/load_order.toml"),original).unwrap();
        let (packs,_,_)=scan(t.path()).unwrap();assert_eq!(packs[0].load_after,vec!["uncompressed_textures"]);
        let text=order_text(original,&packs,&BTreeMap::from([("uncompressed_textures".into(),false),("tasteful_enhancements".into(),true)])).unwrap();
        for comment in ["# user priority","# manual","# keep"]{assert!(text.contains(comment));}
        let d=parse(&text).unwrap();assert_eq!(names(&d,"order",256).unwrap(),vec!["tasteful_enhancements","uncompressed_textures"]);assert_eq!(names(&d,"disabled",256).unwrap(),vec!["unavailable_pack","uncompressed_textures"]);assert_eq!(d["extra"]["value"].as_integer(),Some(42));
        assert_eq!(order_text(&text,&packs,&BTreeMap::from([("uncompressed_textures".into(),false)])).unwrap(),text);
    }
    #[test]fn malformed_oversized_future_and_conflicting_packs_refuse(){
        let t=tempfile::tempdir().unwrap();fixture(t.path(),"one","incompatible=['two']\n");fixture(t.path(),"two","");fixture(t.path(),"future","format=2\n");
        let (packs,_,_)=scan(t.path()).unwrap();assert!(!packs.iter().find(|p|p.folder=="future").unwrap().toggleable);
        assert!(validate_choices(&packs,&BTreeMap::new()).is_err());
        assert!(validate_choices(&packs,&BTreeMap::from([("two".into(),false)])).is_ok());
        assert!(order_text("disabled=[3]",&packs,&BTreeMap::new()).is_err());
        fs::write(t.path().join("mods/load_order.toml"),"x".repeat(65537)).unwrap();assert!(scan(t.path()).is_err());
    }
    #[test]fn manifest_identity_and_executable_proof_are_specific(){
        let t=tempfile::tempdir().unwrap();fixture(t.path(),"uncompressed_audio","");let(p,sha,_)=scan(t.path()).unwrap();assert_eq!(p[0].kind.as_deref(),Some("uncompressedAudio"));
        fixture(t.path(),"uncompressed_audio","version='2'\n");assert_ne!(sha,scan(t.path()).unwrap().1);
        let hash="cd249f7ffd94c21b7f8bec1efc3e734753c48cf45d56d16f21a4ef53bcf07dd9";
        assert!(supported(RuntimeId::OpenCe,hash));assert!(!supported(RuntimeId::ChupathingyCe,hash));assert!(!supported(RuntimeId::OpenCe,&"0".repeat(64)));
    }

    fn inventory(root:&Path)->Inventory{
        let(packs,sha,order)=scan(root).unwrap();Inventory{registration_id:"fixture".into(),supported:true,reason:String::new(),data_root:root.into(),executable_sha256:"fixture".into(),inventory_sha256:sha,order_sha256:order,packs,saved:true,needs_review:false,preference_sha256:None}
    }
    #[test]fn two_profiles_share_one_data_root_without_losing_each_others_choices(){
        let t=tempfile::tempdir().unwrap();fixture(t.path(),"audio","");let payload=t.path().join("mods/audio/tags/owned.sound");fs::write(&payload,b"protected payload").unwrap();
        let one=inventory(t.path());let off=preference(&one,&one.inventory_sha256,one.order_sha256.as_deref(),BTreeMap::from([("audio".into(),false)])).unwrap();
        let on=preference(&one,&one.inventory_sha256,one.order_sha256.as_deref(),BTreeMap::from([("audio".into(),true)])).unwrap();
        let a=apply_inventory(one,&off,&[]).unwrap();
        assert!(names(&parse(&bounded(&t.path().join("mods/load_order.toml")).unwrap().unwrap()).unwrap(),"disabled",256).unwrap().contains(&"audio".into()));
        let b=apply_inventory(inventory(t.path()),&on,&[a]).unwrap();
        assert!(names(&parse(&bounded(&t.path().join("mods/load_order.toml")).unwrap().unwrap()).unwrap(),"disabled",256).unwrap().is_empty());
        apply_inventory(inventory(t.path()),&off,&[b]).unwrap();
        assert_eq!(fs::read(payload).unwrap(),b"protected payload");
        let external="# changed in the native game menu\ndisabled=[]\n";fs::write(t.path().join("mods/load_order.toml"),external).unwrap();
        assert!(apply_inventory(inventory(t.path()),&off,&[]).is_err());
        assert_eq!(bounded(&t.path().join("mods/load_order.toml")).unwrap().unwrap(),external);
        assert!(!t.path().join("mods/.spark-pack.lock").exists());
    }
    #[test]fn stale_choices_and_an_existing_owner_cannot_overwrite_native_settings(){
        let t=tempfile::tempdir().unwrap();fixture(t.path(),"textures","");let i=inventory(t.path());
        assert!(preference(&i,"stale",None,BTreeMap::new()).is_err());
        let pref=preference(&i,&i.inventory_sha256,None,BTreeMap::from([("textures".into(),false)])).unwrap();
        fs::write(t.path().join("mods/.spark-pack.lock"),"other owner").unwrap();
        assert!(apply_inventory(i,&pref,&[]).is_err());
        assert_eq!(fs::read_to_string(t.path().join("mods/.spark-pack.lock")).unwrap(),"other owner");
        assert!(!t.path().join("mods/load_order.toml").exists());
    }

    #[test]fn pack_adoption_preserves_an_equivalent_byte_external_replacement(){
        let t=tempfile::tempdir().unwrap();fixture(t.path(),"audio","");
        let file=t.path().join("mods/load_order.toml");fs::write(&file,"disabled=[]\n").unwrap();
        let i=inventory(t.path());let pref=preference(&i,&i.inventory_sha256,i.order_sha256.as_deref(),BTreeMap::from([("audio".into(),false)])).unwrap();
        let original=t.path().join("reviewed-original.toml");
        let result=apply_after_review(i,&pref,&[],|path|{fs::rename(path,&original)?;fs::write(path,"disabled=[]\n")?;Ok(())});
        assert!(result.is_err());assert_eq!(fs::read(&file).unwrap(),b"disabled=[]\n");assert_eq!(fs::read(original).unwrap(),b"disabled=[]\n");
        assert!(!t.path().join("mods/.spark-pack.lock").exists());
    }
    #[test]fn pack_adoption_retains_external_bytes_changed_after_review(){
        let t=tempfile::tempdir().unwrap();fixture(t.path(),"audio","");let i=inventory(t.path());
        let pref=preference(&i,&i.inventory_sha256,None,BTreeMap::from([("audio".into(),false)])).unwrap();
        let result=apply_after_review(i,&pref,&[],|path|{fs::write(path,"# external engine settings\ndisabled=[]\n")?;Ok(())});
        assert!(result.is_err());assert_eq!(fs::read(t.path().join("mods/load_order.toml")).unwrap(),b"# external engine settings\ndisabled=[]\n");
        assert!(!t.path().join("mods/.spark-pack.lock").exists());
    }
    #[test]fn replaced_pack_lock_is_never_deleted_or_used_to_adopt_settings(){
        let t=tempfile::tempdir().unwrap();fixture(t.path(),"audio","");let i=inventory(t.path());
        let pref=preference(&i,&i.inventory_sha256,None,BTreeMap::from([("audio".into(),false)])).unwrap();
        let saved=t.path().join("original-lock");let lock=t.path().join("mods/.spark-pack.lock");
        let result=apply_after_review(i,&pref,&[],|_|{fs::rename(&lock,&saved)?;fs::write(&lock,b"foreign user file")?;Ok(())});
        assert!(result.is_err());assert_eq!(fs::read(&lock).unwrap(),b"foreign user file");assert!(saved.is_file());
        assert!(!t.path().join("mods/load_order.toml").exists());
    }
    #[test]fn changed_in_place_pack_lock_is_retained(){
        let t=tempfile::tempdir().unwrap();fixture(t.path(),"audio","");let i=inventory(t.path());
        let pref=preference(&i,&i.inventory_sha256,None,BTreeMap::from([("audio".into(),false)])).unwrap();
        let lock=t.path().join("mods/.spark-pack.lock");
        let result=apply_after_review(i,&pref,&[],|_|{fs::write(&lock,b"externally changed lock")?;Ok(())});
        assert!(result.is_err());assert_eq!(fs::read(&lock).unwrap(),b"externally changed lock");
        assert!(!t.path().join("mods/load_order.toml").exists());
    }
    #[test]fn hardlinked_native_order_is_not_replaced(){
        let t=tempfile::tempdir().unwrap();fixture(t.path(),"audio","");let file=t.path().join("mods/load_order.toml");
        fs::write(&file,b"disabled=[]\n").unwrap();let alias=t.path().join("user-alias.toml");fs::hard_link(&file,&alias).unwrap();
        let i=inventory(t.path());let pref=preference(&i,&i.inventory_sha256,i.order_sha256.as_deref(),BTreeMap::from([("audio".into(),false)])).unwrap();
        assert!(apply_inventory(i,&pref,&[]).is_err());assert_eq!(fs::read(&file).unwrap(),b"disabled=[]\n");assert_eq!(fs::read(alias).unwrap(),b"disabled=[]\n");
        assert!(!t.path().join("mods/.spark-pack.lock").exists());
    }

}
