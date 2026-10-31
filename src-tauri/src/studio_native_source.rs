//! Explicit local admission, import and build actions. Network messages never
//! enter this module or supply command lines, executables or local paths.
use super::*;
use super::core::{native_operations as recipes, studio_native as content, tool_transaction as transaction};
use std::collections::BTreeMap;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
struct Admission { project_id:String, tags:PathBuf, source:content::Source }
fn key(id:&str)->String { format!("studio-native-source-{id}") }
fn admitted(state:&AppState, project:&str)->Reply<Admission> {
    let a:Option<Admission>=lock(&state.library)?.setting(&key(project)).map_err(error)?;
    let a=a.ok_or("Verify a local native source before hosting/joining this native session")?;
    if a.project_id!=project || !a.tags.starts_with(state.root.join("studio-native")) {return Err("Native admission belongs to another source".into());}
    core::reject_links(&a.tags).map_err(error)?;
    let owned=state.root.join("studio-native").canonicalize().map_err(error)?;
    let canonical=a.tags.canonicalize().map_err(error)?;
    if !canonical.starts_with(&owned)||canonical==owned {return Err("Native admission escaped its owned source directory".into());}
    let marker=a.tags.parent().ok_or("Native source has no owner")?.join("admission.json");
    core::reject_links(&marker).map_err(error)?;
    let stored:Admission=serde_json::from_slice(&bounded_read(&marker,128*1024)?).map_err(error)?;
    if stored.project_id!=a.project_id||stored.tags!=a.tags||stored.source!=a.source {return Err("Native admission receipt changed; restore its retained source before building".into());}
    Ok(a)
}
pub(super) fn require_unshared(state:&AppState,project:&str)->Reply<()> {
    if lock(&state.forge_session)?.as_ref().is_some_and(|s|s.project_id==project&&s.studio) {
        return Err("SparkLink owns this map's shared source revision. Use its supported native field/publication controls, or leave the session before accepting or compiling an independent Baboon/Invader revision. All external candidates and recovery source remain available.".into());
    }
    Ok(())
}
fn check_inventory(a:&Admission)->Reply<BTreeMap<String,String>> {
    let files=transaction::inventory(&a.tags).map_err(error)?;
    if content::inventory_hash(&files).map_err(error)?!=a.source.inventory_sha256 {return Err("Admitted native source changed or was corrupted. No build/import is allowed; the session and recoverable input remain intact.".into());}
    Ok(files)
}
pub(super) fn matches(state:&AppState, project:&str, doc:&quickforge::QuickForgeDocument)->Reply<()> {
    if let Some(native)=&doc.native {
        let a=admitted(state,project)?;
        if a.source!=native.source {return Err("This session requires the exact admitted native source/dependencies. Verify your local source first; no files or tools are requested over the network.".into());}
        let p=lock(&state.library)?.get(project).map_err(error)?;
        baboon_native::guard_regeneration(state,&p)?;
        let _=check_inventory(&a)?;
    }
    Ok(())
}
fn dependencies(state:&AppState,p:&Project,tags:&Path,tag:&str)->Reply<BTreeMap<String,String>> {
    let exe=native_operations_native::executable(state,p,"invaderDependency")?;
    let args=recipes::Operation::Dependencies.arguments(tags,"scen",tag).map_err(error)?;
    let (ok,out,err)=native_operations_native::run(&exe,&args)?;
    if !ok {return Err(format!("Native dependency validation failed: {err}"));}
    let mut result=BTreeMap::new();
    for row in recipes::dependency_lines(&out).map_err(error)? {
        if row.reported_broken {return Err(format!("Broken native asset dependency {}",row.path));}
        let file=tags.join(core::safe_relative(&row.path).map_err(error)?);core::reject_links(&file).map_err(error)?;
        result.insert(row.path,maps::hash_file(&file).map_err(error)?);
    }
    if result.is_empty()||result.len()>256 {return Err("Native asset has no bounded, validated dependency closure".into());}
    Ok(result)
}
#[tauri::command]
pub(super) async fn studio_native_admit(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String,template_tags_directory:Option<PathBuf>,preview_project_id:String,preview_tag_id:u32)->Reply<content::Document> {
    let owner=window.label().to_string();
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();let _guard=native_operations_native::source_guard()?;
        check_document_owner(&state,&project_id,&owner)?;
        if lock(&state.forge_session)?.is_some(){return Err("Leave the current session before admitting another native source".into());}
        let p=lock(&state.library)?.get(&project_id).map_err(error)?;
        baboon_native::guard_regeneration(&state,&p)?;
        let preview=lock(&state.library)?.get(&preview_project_id).map_err(error)?;
        let inspection=inspect(&state,&preview)?;let preserved=preview.source.as_ref().ok_or("Use an owned imported model source")?;
        if maps::hash_file(&preserved.preserved_path).map_err(error)?!=inspection.sha256 {return Err("Preview source changed".into());}
        let tag=inspection.tags.iter().find(|t|t.id==preview_tag_id&&t.class=="scen").ok_or("Choose a native scenery tag with an actual model")?;
        let template_tag=format!("{}.scenery",tag.path.replace('\\',"/"));
        if let Some(native)=p.quick_forge.as_ref().and_then(|d|d.native.as_ref()) {
            let a=admitted(&state,&project_id)?;
            if a.source!=native.source||a.source.preview_sha256!=inspection.sha256||a.source.preview_tag_id!=preview_tag_id||a.source.template_tag!=template_tag {return Err("This map retains another native admission. Preserve its shared source and create a separate reviewed project to change templates.".into());}
            let _=check_inventory(&a)?;
            if let Some(root)=&template_tags_directory {
                core::reject_links(root).map_err(error)?;
                if maps::hash_file(&root.join(core::safe_relative(&template_tag).map_err(error)?)).map_err(error)?!=a.source.template_sha256 {return Err("The chosen template differs from this map's retained native admission. No source was replaced.".into());}
            }
            if dependencies(&state,&p,&a.tags,&template_tag)?!=a.source.dependencies {return Err("Retained native dependencies changed".into());}
            let _=native_operations_native::fields(&state,&p,&a.tags,&a.source.field_tag)?;
            return Ok(native.clone());
        }
        let build=current_build(&state,&p)?;let base=runtime_workbench::compiled_tags(&state,&p,&build)?;
        if let Some(expected)=working_tag_changes_native::baseline(&state.root.join("jobs").join(&build.id))? {
            if transaction::inventory(&base).map_err(error)?!=expected {return Err("Reconcile external native saves before admission. The retained source differs from its validated native build; no edits were discarded.".into());}
        }
        let asset_root=template_tags_directory.unwrap_or_else(||base.clone());core::reject_links(&asset_root).map_err(error)?;
        let template_file=asset_root.join(core::safe_relative(&template_tag).map_err(error)?);core::reject_links(&template_file).map_err(error)?;
        if !template_file.is_file(){return Err(format!("The chosen native template folder does not contain {template_tag}. Select the matching extracted tags folder; the preview map alone does not supply loose tag files."));}
        let dep=dependencies(&state,&p,&asset_root,&template_tag)?;
        let bytes=bounded_read(&asset_root.join(core::safe_relative(&template_tag).map_err(error)?),content::MAX_ASSET_BYTES as u64)?;
        let template_sha256=content::digest(&bytes);
        native_operations_native::verify_bytes(&asset_root,&template_tag,&template_sha256)?;
        let _=native_operations_native::fields(&state,&p,&asset_root,&template_tag)?;
        let root=state.root.join("studio-native");core::reject_links(&root).map_err(error)?;fs::create_dir_all(&root).map_err(error)?;
        let parent=root.join(uuid::Uuid::new_v4().to_string());fs::create_dir(&parent).map_err(error)?;let tags=parent.join("tags");
        let base_inventory=transaction::fork(&base,&tags,Arc::new(AtomicBool::new(false))).map_err(error)?;
        let mut closure=dep.clone();closure.insert(template_tag.clone(),template_sha256.clone());
        for (path,sha) in &closure {
            let file=tags.join(core::safe_relative(path).map_err(error)?);
            if let Some(existing)=base_inventory.get(path) {if existing!=sha{return Err(format!("Native asset dependency conflicts with the retained source: {path}. No source was replaced."));}continue;}
            let input=asset_root.join(core::safe_relative(path).map_err(error)?);let data=bounded_read(&input,256*1024*1024)?;
            if content::digest(&data)!=*sha {return Err("Native asset changed during admission".into());}
            fs::create_dir_all(file.parent().unwrap()).map_err(error)?;project::atomic_write(&file,&data,false).map_err(error)?;
        }
        if dependencies(&state,&p,&asset_root,&template_tag)?!=dep||maps::hash_file(&asset_root.join(&template_tag)).map_err(error)?!=template_sha256 {return Err("Native template source changed while validating".into());}
        let field_tag="weapons/pistol/pistol.weapon".to_string();
        let fields=native_operations_native::fields(&state,&p,&tags,&field_tag)?;
        let files=transaction::inventory(&tags).map_err(error)?;
        let source=content::Source{inventory_sha256:content::inventory_hash(&files).map_err(error)?,field_tag_sha256:files[&field_tag].clone(),field_tag,bounding_radius:recipes::number(&fields,"bounding_radius").map_err(error)?,template_tag,template_sha256,dependencies:dep,preview_sha256:inspection.sha256.clone(),preview_tag_id,preview_tag_path:tag.path.replace('\\',"/")};
        let native=content::Document{source:source.clone(),fields:vec![],assets:vec![]};
        let mut doc=p.quick_forge.clone().ok_or("Native collaboration currently requires QuickForge source")?;doc.native=Some(native.clone());quickforge::validate_document(&doc).map_err(error)?;
        let admission=Admission{project_id:project_id.clone(),tags,source};
        project::atomic_write(&parent.join("admission.json"),&serde_json::to_vec_pretty(&admission).map_err(error)?,false).map_err(error)?;
        lock(&state.library)?.set_setting(&key(&project_id),&Some(admission)).map_err(error)?;Ok(native)
    }).await.map_err(error)?
}
#[tauri::command]
pub(super) async fn studio_native_import(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String,path:PathBuf,name:String)->Reply<content::Asset> {
    let owner=window.label().to_string();tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;
        let view=shared_editing::poll(&state,&owner,&project_id,None,false)?;
        if view.role=="viewer" {return Err("Viewers cannot import or publish shared native assets".into());}
        matches(&state,&project_id,&view.document)?;
        let a=admitted(&state,&project_id)?;let before=check_inventory(&a)?;
        let p=lock(&state.library)?.get(&project_id).map_err(error)?;core::reject_links(&path).map_err(error)?;
        let bytes=bounded_read(&path,content::MAX_ASSET_BYTES as u64)?;
        if content::digest(&bytes)!=a.source.template_sha256 {return Err("Import refused: this file is not the owner's admitted complete scenery asset. Arbitrary binary imports need a separate native validation review.".into());}
        let fields=native_operations_native::fields(&state,&p,&a.tags,&a.source.template_tag)?;
        if fields.is_empty()||dependencies(&state,&p,&a.tags,&a.source.template_tag)?!=a.source.dependencies||transaction::inventory(&a.tags).map_err(error)?!=before {return Err("Native import semantic/dependency validation failed".into());}
        let asset=content::Asset{id:uuid::Uuid::new_v4().to_string(),name,sha256:content::digest(&bytes),bytes};
        let mut doc=view.document;let native=doc.native.get_or_insert(content::Document{source:a.source,fields:vec![],assets:vec![]});native.assets.push(asset.clone());quickforge::validate_portable_document(&doc).map_err(error)?;
        let imports=state.root.join("studio-native/imports");fs::create_dir_all(&imports).map_err(error)?;
        project::atomic_write(&imports.join(format!("{}.json",asset.id)),&serde_json::to_vec_pretty(&asset).map_err(error)?,false).map_err(error)?;
        Ok(asset)
    }).await.map_err(error)?
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub(super) struct RecoveredSource { inventory_sha256:String, tags_directory:PathBuf, previous_directory:PathBuf, detail:String }
/// Restore complete, exact source files into a new fork. Never repair unknown
/// bytes in place or derive a replacement from a corrupt tag's contents.
#[tauri::command]
pub(super) async fn studio_native_recover_source(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String,template_tags_directory:Option<PathBuf>)->Reply<RecoveredSource> {
    let owner=window.label().to_string();tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();let _guard=native_operations_native::source_guard()?;
        check_document_owner(&state,&project_id,&owner)?;native_operations_native::require_idle(&state)?;
        let a=admitted(&state,&project_id)?;let p=lock(&state.library)?.get(&project_id).map_err(error)?;
        let tools=forge_build::tools_for_target(&p,forge_tools(&state)?).map_err(error)?;
        let base=tools.hek_tags_directory.or_else(||tools.hek_directory.map(|d|d.join("tags"))).ok_or("Choose the original matching native base tags in this map's tool profile before recovering")?;
        let mut expected=transaction::inventory(&base).map_err(error)?;
        let mut closure=a.source.dependencies.clone();closure.insert(a.source.template_tag.clone(),a.source.template_sha256.clone());
        for (file,sha) in &closure {if expected.get(file).is_some_and(|old|old!=sha){return Err(format!("Recovery base conflicts with admitted dependency: {file}"));}expected.insert(file.clone(),sha.clone());}
        if content::inventory_hash(&expected).map_err(error)?!=a.source.inventory_sha256{return Err("These base tags do not reconstruct the exact acknowledged native source. Select the matching preserved baseline; no source was replaced.".into());}
        let root=state.root.join("studio-native").join(uuid::Uuid::new_v4().to_string());fs::create_dir(&root).map_err(error)?;
        let tags=root.join("tags");transaction::fork(&base,&tags,Arc::new(AtomicBool::new(false))).map_err(error)?;
        for (relative,sha) in &closure {
            let target=tags.join(core::safe_relative(relative).map_err(error)?);if target.is_file(){continue;}
            let mut choices=vec![a.tags.join(core::safe_relative(relative).map_err(error)?)];
            if let Some(folder)=&template_tags_directory{core::reject_links(folder).map_err(error)?;choices.push(folder.join(core::safe_relative(relative).map_err(error)?));}
            let mut recovered=None;
            for file in choices {core::reject_links(&file).map_err(error)?;if file.is_file()&&maps::hash_file(&file).map_err(error)?==*sha {recovered=Some(bounded_read(&file,256*1024*1024)?);break;}}
            let bytes=recovered.ok_or_else(||format!("No exact preserved recovery bytes for {relative}. The damaged source and pending recovery fork remain available."))?;
            fs::create_dir_all(target.parent().unwrap()).map_err(error)?;project::atomic_write(&target,&bytes,false).map_err(error)?;
        }
        if transaction::inventory(&tags).map_err(error)?!=expected{return Err("Recovery file inventory differs; no source revision was selected".into());}
        let recovered=Admission{project_id:project_id.clone(),tags:tags.clone(),source:a.source.clone()};
        project::atomic_write(&root.join("admission.json"),&serde_json::to_vec_pretty(&recovered).map_err(error)?,false).map_err(error)?;
        project::atomic_write(&root.join("recovery.json"),&serde_json::to_vec_pretty(&(&a.tags,&base,&expected)).map_err(error)?,false).map_err(error)?;
        lock(&state.library)?.set_setting(&key(&project_id),&Some(recovered)).map_err(error)?;
        Ok(RecoveredSource{inventory_sha256:a.source.inventory_sha256,tags_directory:tags,previous_directory:a.tags,detail:"Restored the exact admitted native source into a new full fork. The damaged files, shared history and original inputs remain intact.".into()})
    }).await.map_err(error)?
}
/// Explicit owner-local build materialization. Later session revisions cannot
/// alter this complete frozen source fork or its bound input inventory.
pub(super) fn prepare_build(state:&AppState,p:&Project,tools:&mut forge_build::ForgeToolchain,cancel:Arc<AtomicBool>)->Reply<Option<BTreeMap<String,String>>> {
    let Some(native)=p.quick_forge.as_ref().and_then(|d|d.native.as_ref()) else{return Ok(None)};
    matches(state,&p.id,p.quick_forge.as_ref().unwrap())?;let a=admitted(state,&p.id)?;let before=check_inventory(&a)?;
    let parent=a.tags.parent().unwrap().join(format!("build-{}",uuid::Uuid::new_v4()));fs::create_dir(&parent).map_err(error)?;let tags=parent.join("tags");transaction::fork(&a.tags,&tags,cancel).map_err(error)?;
    if let Some(field)=native.fields.first() {
        let operation=recipes::Operation::BoundingRadius{value:field.bounding_radius};
        let old=native_operations_native::fields(state,p,&tags,&a.source.field_tag)?;
        if recipes::number(&old,"bounding_radius").map_err(error)?!=field.bounding_radius {
            let exe=native_operations_native::executable(state,p,"invaderNative")?;
            let (ok,_,err)=native_operations_native::run(&exe,&operation.arguments(&tags,"weap",&a.source.field_tag).map_err(error)?)?;
            if !ok{return Err(format!("Native semantic materialization failed: {err}"));}
            let new=native_operations_native::fields(state,p,&tags,&a.source.field_tag)?;recipes::reviewed_difference(&old,&new,&operation).map_err(error)?;
            native_operations_native::verify_bytes(&tags,&a.source.field_tag,&maps::hash_file(&tags.join(&a.source.field_tag)).map_err(error)?)?;
        }
    }
    for asset in &native.assets {
        let relative=format!("{}.scenery",asset.tag_path());let file=tags.join(core::safe_relative(&relative).map_err(error)?);
        fs::create_dir_all(file.parent().unwrap()).map_err(error)?;project::atomic_write(&file,&asset.bytes,false).map_err(error)?;
        let _=native_operations_native::fields(state,p,&tags,&relative)?;
    }
    let prepared=transaction::inventory(&tags).map_err(error)?;
    for change in transaction::compare(&before,&before,&prepared).changes {
        if change.path!=a.source.field_tag&&!native.assets.iter().any(|asset|change.path==format!("{}.scenery",asset.tag_path())) {return Err(format!("Native materialization changed an unrelated file: {}",change.path));}
    }
    if transaction::inventory(&a.tags).map_err(error)?!=before{return Err("Admitted source changed during build preparation".into());}
    project::atomic_write(&parent.join("prepared.json"),&serde_json::to_vec_pretty(&(p.fingerprint().map_err(error)?,native,&prepared)).map_err(error)?,false).map_err(error)?;
    tools.hek_tags_directory=Some(tags);Ok(Some(prepared))
}
