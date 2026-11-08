use super::*;
use spark_core::runtime_mods::{self as packs,Preference,Applied};
fn registration(lib:&Library,id:&str)->Reply<runtime::RuntimeRegistration>{
    let profiles:Vec<runtime::RuntimeRegistration>=lib.setting("runtimeRegistrations").map_err(error)?;
    profiles.into_iter().find(|p|p.id==id).ok_or_else(||"Runtime profile is no longer connected".into())
}
#[tauri::command]
pub async fn runtime_mod_packs(app:tauri::AppHandle,registration_id:String)->Reply<packs::Inventory>{
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();
        let (reg,prefs)={let lib=lock(&state.library)?;(registration(&lib,&registration_id)?,lib.setting::<Vec<Preference>>("runtimeModPackPreferences").map_err(error)?)};
        packs::inspect(&reg,prefs.iter().find(|p|p.registration_id==registration_id)).map_err(error)
    }).await.map_err(error)?
}
#[tauri::command]
pub async fn save_runtime_mod_packs(app:tauri::AppHandle,registration_id:String,expected_inventory:String,expected_order:Option<String>,expected_preference:Option<String>,enabled:std::collections::BTreeMap<String,bool>)->Reply<packs::Inventory>{
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();let lib=lock(&state.library)?;
        let reg=registration(&lib,&registration_id)?;
        let mut prefs:Vec<Preference>=lib.setting("runtimeModPackPreferences").map_err(error)?;
        let observed=packs::inspect(&reg,prefs.iter().find(|p|p.registration_id==registration_id)).map_err(error)?;
        if observed.preference_sha256!=expected_preference{return Err("Pack choices changed in another Spark window. Recheck before saving.".into());}
        let chosen=packs::preference(&observed,&expected_inventory,expected_order.as_deref(),enabled).map_err(error)?;
        prefs.retain(|p|p.registration_id!=registration_id);prefs.push(chosen.clone());
        if prefs.len()>24{return Err("Runtime pack profile limit exceeded".into());}
        lib.set_setting("runtimeModPackPreferences",&prefs).map_err(error)?;
        // Saving is project-private preference storage, never a game-install write.
        let result=packs::inspect(&reg,Some(&chosen)).map_err(error)?;
        let _=app.emit("spark:runtime-packs-changed",&registration_id);Ok(result)
    }).await.map_err(error)?
}
pub(super) fn apply_for_launch(state:&AppState,reg:&runtime::RuntimeRegistration)->Reply<Option<PathBuf>>{
    let lib=lock(&state.library)?;
    let prefs:Vec<Preference>=lib.setting("runtimeModPackPreferences").map_err(error)?;
    let Some(pref)=prefs.iter().find(|p|p.registration_id==reg.id) else{return Ok(None)};
    // Reuse the existing read-only process inventory; no Live Link or memory access.
    if crate::live_mcc::presentation_game_running().map_err(error)?{
        return Err("Close the running Halo game before applying this profile's presentation packs. Saved choices are kept.".into());
    }
    let mut applied:Vec<Applied>=lib.setting("runtimeModPackApplied").map_err(error)?;
    let result=packs::apply(reg,pref,&applied).map_err(error)?;
    let data_root=result.data_root.clone();applied.retain(|p|p.data_root!=result.data_root);applied.push(result);
    if applied.len()>24{return Err("Runtime pack data-root limit exceeded".into());}
    lib.set_setting("runtimeModPackApplied",&applied).map_err(error)?;Ok(Some(data_root))
}


#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct ArchiveReview {pub path:PathBuf,pub plan:packs::PackagePlan}
fn checked_install(lib:&Library,id:&str,expected_executable:&str,expected_root:&Path)->Reply<(runtime::RuntimeRegistration,packs::Inventory)>{
    let reg=registration(lib,id)?;let inventory=packs::inspect(&reg,None).map_err(error)?;
    if !inventory.supported{return Err(inventory.reason);}
    if inventory.executable_sha256!=expected_executable||inventory.data_root!=expected_root{return Err("The selected engine or content folder changed. Recheck before installing.".into());}
    Ok((reg,inventory))
}
fn install(state:&AppState,reg:&runtime::RuntimeRegistration,file:&Path,kind:&str,sha:&str,inventory:&str,enable:bool)->Reply<packs::InstallReceipt>{
    if crate::live_mcc::presentation_game_running().map_err(error)?{return Err("Close the running Halo game before installing a presentation pack.".into());}
    let lib=lock(&state.library)?;let current=registration(&lib,&reg.id)?;
    if current.executable!=reg.executable||current.data_root!=reg.data_root||current.root!=reg.root{return Err("Runtime profile changed during pack setup. Recheck before installing.".into());}
    let observed=packs::inspect(&current,None).map_err(error)?;
    let receipt=packs::install_archive(file,kind,sha,&observed.data_root,inventory).map_err(error)?;
    let mut prefs:Vec<Preference>=lib.setting("runtimeModPackPreferences").map_err(error)?;
    let old=prefs.iter().find(|p|p.registration_id==reg.id);
    let after=packs::inspect(&current,None).map_err(error)?;
    let folder=receipt.folder.file_name().and_then(|n|n.to_str()).ok_or("Installed pack name changed")?;
    let enabled=after.packs.iter().filter(|p|p.toggleable).map(|p|{
        let enabled=if p.folder==folder{enable}else{old.and_then(|v|v.enabled.get(&p.folder)).copied().unwrap_or(p.native_enabled)};(p.folder.clone(),enabled)
    }).collect();
    let choice=packs::preference(&after,&after.inventory_sha256,after.order_sha256.as_deref(),enabled).map_err(error)?;
    prefs.retain(|p|p.registration_id!=reg.id);prefs.push(choice);
    if prefs.len()>24{return Err("Pack installed; profile choices exceed their limit. Recheck Games & tools.".into());}
    lib.set_setting("runtimeModPackPreferences",&prefs).map_err(|e|format!("Pack installed; its preferences could not be saved: {e}"))?;
    Ok(receipt)
}
#[tauri::command]
pub async fn choose_runtime_pack_zip()->Reply<Option<PathBuf>>{
    Ok(rfd::AsyncFileDialog::new().set_title("Choose a publisher's native presentation pack").add_filter("Native pack ZIP",&["zip"]).pick_file().await.map(|p|p.path().into()))
}
#[tauri::command]
pub async fn inspect_runtime_pack_archive(app:tauri::AppHandle,registration_id:String,path:PathBuf,kind:String)->Reply<ArchiveReview>{
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();let reg=registration(&*lock(&state.library)?,&registration_id)?;
        let current=packs::inspect(&reg,None).map_err(error)?;if !current.supported{return Err(current.reason);}
        core::reject_links(&path).map_err(error)?;
        Ok(ArchiveReview{path:fs::canonicalize(&path).map_err(error)?,plan:packs::inspect_archive(&path,&kind).map_err(error)?})
    }).await.map_err(error)?
}
#[tauri::command]
pub async fn install_runtime_pack_archive(app:tauri::AppHandle,registration_id:String,path:PathBuf,kind:String,expected_sha256:String,expected_executable:String,expected_root:PathBuf,expected_inventory:String,enabled:bool)->Reply<packs::InstallReceipt>{
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();
        let reg={let lib=lock(&state.library)?;checked_install(&lib,&registration_id,&expected_executable,&expected_root)?.0};
        let receipt=install(&state,&reg,&path,&kind,&expected_sha256,&expected_inventory,enabled)?;
        let _=app.emit("spark:runtime-packs-changed",&registration_id);Ok(receipt)
    }).await.map_err(error)?
}
#[tauri::command]
pub async fn prepare_runtime_pack_download(app:tauri::AppHandle,registration_id:String,url:String,kind:String)->Reply<map_download::DownloadStatus>{
    tauri::async_runtime::spawn_blocking(move||{
        if !["uncompressedTextures","tastefulEnhancements","uncompressedAudio","custom"].contains(&kind.as_str()){return Err("Unknown pack category".into());}
        if kind!="custom"{return Err("Source unverified for this named pack. Import an author-provided local ZIP until an official download is verified.".into());}
        let state=app.state::<AppState>();let reg=registration(&*lock(&state.library)?,&registration_id)?;
        let current=packs::inspect(&reg,None).map_err(error)?;if !current.supported{return Err(current.reason);}
        state.map_downloads.prepare_pack(&url,map_download::PackBinding{registration_id,executable_sha256:current.executable_sha256,data_root:current.data_root,inventory_sha256:current.inventory_sha256,kind}).map_err(error)
    }).await.map_err(error)?
}
#[tauri::command]
pub async fn fetch_runtime_pack_download(app:tauri::AppHandle,id:String)->Reply<ArchiveReview>{
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();let binding=state.map_downloads.pack_binding(&id).map_err(error)?;
        {let lib=lock(&state.library)?;checked_install(&lib,&binding.registration_id,&binding.executable_sha256,&binding.data_root)?;}
        let receipt=state.map_downloads.download(&id,&state.root.join("Inbox/downloads")).map_err(error)?;
        Ok(ArchiveReview{plan:packs::inspect_archive(&receipt.path,&binding.kind).map_err(error)?,path:receipt.path})
    }).await.map_err(error)?
}
#[tauri::command]
pub async fn install_runtime_pack_download(app:tauri::AppHandle,id:String,enabled:bool)->Reply<packs::InstallReceipt>{
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();let binding=state.map_downloads.pack_binding(&id).map_err(error)?;
        let reg={let lib=lock(&state.library)?;checked_install(&lib,&binding.registration_id,&binding.executable_sha256,&binding.data_root)?.0};
        let status=state.map_downloads.status(&id).map_err(error)?;let download=status.receipt.ok_or("Pack download has not completed")?;
        state.map_downloads.mark_importing(&id).map_err(error)?;
        let result=install(&state,&reg,&download.path,&binding.kind,&download.sha256,&binding.inventory_sha256,enabled);
        match result{
            Ok(receipt)=>{state.map_downloads.finish_pack_install(&id,&state.root.join("Inbox/downloads")).map_err(error)?;let _=app.emit("spark:runtime-packs-changed",&binding.registration_id);Ok(receipt)},
            Err(e)=>{let _=state.map_downloads.mark_import_failed(&id);Err(e)}
        }
    }).await.map_err(error)?
}


#[tauri::command]
pub async fn discard_runtime_pack_download(app:tauri::AppHandle,id:String)->Reply<bool>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();state.map_downloads.discard_pack(&id,&state.root.join("Inbox/downloads")).map_err(error)}).await.map_err(error)?
}

