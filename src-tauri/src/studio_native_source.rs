//! Explicit local admission, import and build actions. Network messages never
//! enter this module or supply command lines, executables or local paths.
use super::*;
use super::core::{native_operations as recipes, studio_native as content, tool_transaction as transaction};
use std::collections::BTreeMap;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
struct Admission {
    project_id:String, tags:PathBuf, source:content::Source,
    /// Local-only complete input manifest. Legacy admissions have no subset.
    #[serde(default,skip_serializing_if="Option::is_none")]
    inputs_sha256:Option<String>,
}
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
    if stored.project_id!=a.project_id||stored.tags!=a.tags||stored.source!=a.source||stored.inputs_sha256!=a.inputs_sha256 {return Err("Native admission receipt changed; restore its retained source before building".into());}
    Ok(a)
}
pub(super) fn require_unshared(state:&AppState,project:&str)->Reply<()> {
    if lock(&state.forge_session)?.as_ref().is_some_and(|s|s.project_id==project&&s.studio) {
        return Err("SparkLink owns this map's shared source revision. Use its External editor review for the supported native field, or its publication controls. Leave the session before accepting or compiling an independent Baboon/Invader revision. All external candidates and recovery source remain available.".into());
    }
    Ok(())
}
fn check_inventory(a:&Admission)->Reply<BTreeMap<String,String>> {
    let files=transaction::inventory(&a.tags).map_err(error)?;
    if content::inventory_hash(&files).map_err(error)?!=a.source.inventory_sha256 {return Err("Admitted native source changed or was corrupted. No build/import is allowed; the session and recoverable input remain intact.".into());}
    Ok(files)
}

// External applications edit a private fork. Only a reviewed semantic value
// enters SparkLink; neither raw patches nor native tool commands cross peers.
#[derive(Clone,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct ExternalSource {
    id:String,project_id:String,session_id:String,revision:u64,source:content::Source,
    before_radius:f64,baseline:BTreeMap<String,String>,before_fields:String,field_size:u64,
}
fn external_root(state:&AppState,id:&str)->Reply<PathBuf>{
    uuid::Uuid::parse_str(id).map_err(error)?;
    let root=state.root.join("studio-native/external").join(id);core::reject_links(&root).map_err(error)?;Ok(root)
}
fn external_key(id:&str)->String{format!("studio-external-{id}")}
fn external_source(state:&AppState,project:&str,id:&str)->Reply<(ExternalSource,PathBuf)>{
    let root=external_root(state,id)?;
    let saved:Option<ExternalSource>=lock(&state.library)?.setting(&external_key(id)).map_err(error)?;
    let saved=saved.ok_or("No retained external source with this identity")?;
    let disk:ExternalSource=serde_json::from_slice(&bounded_read(&root.join("source.json"),4*1024*1024)?).map_err(error)?;
    if saved!=disk||saved.id!=id||saved.project_id!=project{return Err("External source receipt changed or belongs to another map. All files remain retained.".into());}
    let admission=admitted(state,project)?;
    if saved.source!=admission.source{return Err("External source belongs to another native admission; no shared edit was queued".into());}
    Ok((saved,root))
}
fn write_radius(state:&AppState,p:&Project,tags:&Path,tag:&str,value:f64)->Reply<()>{
    let operation=recipes::Operation::BoundingRadius{value};
    let exe=native_operations_native::executable(state,p,operation.tool_id())?;
    let args=operation.arguments(tags,"weap",tag).map_err(error)?;
    let(ok,_,err)=native_operations_native::run(&exe,&args)?;
    if !ok{return Err(format!("Native field writer refused the private candidate: {err}"));}Ok(())
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub(super) struct ExternalView {
    id:String,tags_directory:PathBuf,tag:String,before_radius:f64,revision:u64,source_sha256:String,candidate_sha256:String,baseline_sha256:String,
}
fn external_view(receipt:&ExternalSource,root:&Path)->Reply<ExternalView>{
    let tags=root.join("tags");let file=tags.join(core::safe_relative(&receipt.source.field_tag).map_err(error)?);core::reject_links(&file).map_err(error)?;
    if fs::metadata(&file).map_err(error)?.len()!=receipt.field_size{return Err("The external tag changed size or is still being saved. Its files are retained; review structural changes separately.".into());}
    Ok(ExternalView{id:receipt.id.clone(),tags_directory:tags,tag:receipt.source.field_tag.clone(),before_radius:receipt.before_radius,revision:receipt.revision,source_sha256:receipt.source.inventory_sha256.clone(),candidate_sha256:maps::hash_file(&file).map_err(error)?,baseline_sha256:receipt.baseline[&receipt.source.field_tag].clone()})
}
#[tauri::command]
pub(super) async fn studio_external_prepare(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String)->Reply<ExternalView>{
    let owner=window.label().to_string();
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;
        let view=shared_editing::poll(&state,&owner,&project_id,None,false)?;
        if view.role=="viewer"{return Err("Viewers cannot prepare editable native sources".into());}
        matches(&state,&project_id,&view.document)?;
        let a=admitted(&state,&project_id)?;let inventory=check_inventory(&a)?;
        let native=view.document.native.as_ref().ok_or("This shared revision has no native admission")?;
        let radius=native.fields.first().map_or(native.source.bounding_radius,|field|field.bounding_radius);
        let id=uuid::Uuid::new_v4().to_string();let root=external_root(&state,&id)?;
        fs::create_dir_all(root.parent().ok_or("External source has no owner")?).map_err(error)?;fs::create_dir(&root).map_err(error)?;
        let tags=root.join("tags");
        if transaction::fork(&a.tags,&tags,Arc::new(AtomicBool::new(false))).map_err(error)?!=inventory{return Err("Admitted source changed while preparing the tool fork; no source was selected".into());}
        let p=lock(&state.library)?.get(&project_id).map_err(error)?;
        write_radius(&state,&p,&tags,&a.source.field_tag,radius)?;
        let before_fields=native_operations_native::fields(&state,&p,&tags,&a.source.field_tag)?;
        let baseline=transaction::inventory(&tags).map_err(error)?;
        fs::copy(tags.join(core::safe_relative(&a.source.field_tag).map_err(error)?),root.join("before.weapon")).map_err(error)?;
        let field_size=fs::metadata(root.join("before.weapon")).map_err(error)?.len();
        let receipt=ExternalSource{id:id.clone(),project_id,session_id:view.session_id,revision:view.revision,source:a.source,before_radius:radius,baseline,before_fields,field_size};
        project::atomic_write(&root.join("source.json"),&serde_json::to_vec_pretty(&receipt).map_err(error)?,false).map_err(error)?;
        lock(&state.library)?.set_setting(&external_key(&id),&receipt).map_err(error)?;
        external_view(&receipt,&root)
    }).await.map_err(error)?
}
#[tauri::command]
pub(super) async fn studio_external_status(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String,id:String)->Reply<ExternalView>{
    let owner=window.label().to_string();
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;let(receipt,root)=external_source(&state,&project_id,&id)?;external_view(&receipt,&root)}).await.map_err(error)?
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub(super) struct ExternalReview {
    id:String,source_sha256:String,candidate_sha256:String,before_radius:f64,bounding_radius:f64,changed:bool,revision:u64,serialization:&'static str,detail:String,
}
#[tauri::command]
pub(super) async fn studio_external_review(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String,id:String)->Reply<ExternalReview>{
    let owner=window.label().to_string();
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;
        let view=shared_editing::poll(&state,&owner,&project_id,None,false)?;
        if view.role=="viewer"{return Err("Viewers cannot propose external native edits".into());}
        let(receipt,root)=external_source(&state,&project_id,&id)?;
        let _=check_inventory(&admitted(&state,&project_id)?)?;
        if view.session_id!=receipt.session_id{return Err("The external fork belongs to another SparkLink session; no edit was queued".into());}
        let native=view.document.native.as_ref().ok_or("Shared native admission is unavailable")?;
        if native.source!=receipt.source{return Err("External native source identity no longer matches the session".into());}
        let committed=native.fields.first().map_or(native.source.bounding_radius,|field|field.bounding_radius);
        let tags=root.join("tags");let before=transaction::inventory(&tags).map_err(error)?;
        if before.len()!=receipt.baseline.len()||receipt.baseline.keys().any(|path|before.get(path)!=receipt.baseline.get(path)&&path!=&receipt.source.field_tag){return Err("Other native tags were added, removed or changed. The complete candidate is retained for separate review; no shared source was replaced.".into());}
        let tag=&receipt.source.field_tag;let p=lock(&state.library)?.get(&project_id).map_err(error)?;
        native_operations_native::verify_bytes(&tags,tag,&before[tag])?;
        let fields=native_operations_native::fields(&state,&p,&tags,tag)?;
        let radius=recipes::number(&fields,"bounding_radius").map_err(error)?;
        let operation=recipes::Operation::BoundingRadius{value:radius};operation.validate("weap",tag).map_err(error)?;
        if fields!=receipt.before_fields{let _=recipes::reviewed_difference(&receipt.before_fields,&fields,&operation).map_err(error)?;}
        // Reproduce the scalar from the preserved baseline. A different native
        // serializer may rewrite bookkeeping/padding: normalize a separate copy
        // only after CRC and full exposed-field checks. Never replace the raw
        // candidate or treat native normalization as an unknown-byte repair.
        let oracle=root.join(format!("review-{}",uuid::Uuid::new_v4()));let relative=core::safe_relative(tag).map_err(error)?;
        let target=oracle.join(&relative);fs::create_dir_all(target.parent().ok_or("Tag has no parent")?).map_err(error)?;
        let baseline=root.join("before.weapon");core::reject_links(&baseline).map_err(error)?;
        if maps::hash_file(&baseline).map_err(error)?!=receipt.baseline[tag]{return Err("Preserved tool baseline changed; candidate is retained".into());}
        fs::copy(&baseline,&target).map_err(error)?;write_radius(&state,&p,&oracle,tag,radius)?;
        let candidate=tags.join(&relative);let candidate_sha256=maps::hash_file(&candidate).map_err(error)?;
        let expected=maps::hash_file(&target).map_err(error)?;
        native_operations_native::verify_bytes(&oracle,tag,&expected)?;
        let serialization=if candidate_sha256==expected{"exactNativeReplay"}else{
            let normalized=oracle.join("candidate");let copy=normalized.join(&relative);
            fs::create_dir_all(copy.parent().ok_or("Tag has no parent")?).map_err(error)?;fs::copy(&candidate,&copy).map_err(error)?;
            if maps::hash_file(&copy).map_err(error)?!=candidate_sha256{return Err("External file changed while retaining its review copy; retry after saving finishes".into());}
            write_radius(&state,&p,&normalized,tag,radius)?;
            let normalized_sha=maps::hash_file(&copy).map_err(error)?;
            native_operations_native::verify_bytes(&normalized,tag,&normalized_sha)?;
            if native_operations_native::fields(&state,&p,&normalized,tag)?!=fields||normalized_sha!=expected{return Err("The external save does not normalize to the reviewed native field replay. This is an unreviewed rewrite, not a certified source repair; all files are retained.".into());}
            "equivalentNativeSerialization"
        };
        if transaction::inventory(&tags).map_err(error)?!=before{return Err("The external save changed during review. Wait for it to finish, then review again.".into());}
        if committed!=receipt.before_radius&&committed!=radius{return Err("Conflict: another participant changed this native field. The external candidate is retained; prepare a new fork before merging.".into());}
        Ok(ExternalReview{id,source_sha256:receipt.source.inventory_sha256,candidate_sha256,before_radius:receipt.before_radius,bounding_radius:radius,changed:radius!=committed,revision:receipt.revision,serialization,detail:if radius==committed{"Native round-trip matched the committed semantic value; no shared transaction is needed."}else if serialization=="equivalentNativeSerialization"{"The raw save has a different native serialization. CRC, exposed fields and its separately normalized copy match the reviewed field replay. Only the scalar can be shared; raw and normalized files remain retained, and opaque bytes are not imported."}else{"Only the supported native scalar is reviewed. Share it through the existing authoritative transaction flow; the tool fork and admitted source remain separate."}.into()})
    }).await.map_err(error)?
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
    let h1a=content::target_cache_version(p.quick_forge.as_ref().ok_or("Native collaboration requires QuickForge source")?.runtime_id).map_err(error)?==13;
    if h1a {
        // H1A's publisher source can reference mode while providing an exact
        // same-path mod2 tag. Reuse compilation's verified provider traversal;
        // every other missing dependency stays a hard failure. CE stays strict.
        let (mut files,_)=core::native_staging::collect_dependency_files(tags,std::collections::BTreeSet::from([tag.to_owned()]),true,257,257,|requested| {
            let args=recipes::Operation::Dependencies.arguments(tags,"scen",requested)?;
            let (ok,out,err)=native_operations_native::run(&exe,&args).map_err(core::SparkError::Invalid)?;
            if !ok {return core::invalid(format!("Native dependency validation failed: {err}"));}
            let _=recipes::dependency_lines(&out)?;
            Ok(out)
        }).map_err(error)?;
        files.remove(&tag.to_ascii_lowercase());
        if files.is_empty()||files.len()>256 {return Err("Native asset has no bounded, validated dependency closure".into());}
        return files.into_iter().map(|relative| {
            let file=tags.join(core::safe_relative(&relative).map_err(error)?);core::reject_links(&file).map_err(error)?;
            Ok((relative,maps::hash_file(&file).map_err(error)?))
        }).collect();
    }
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
        native_operations_native::require_idle(&state)?;
        let cache_version=content::target_cache_version(p.quick_forge.as_ref().ok_or("Native collaboration requires QuickForge source")?.runtime_id).map_err(error)?;
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
            asset_import_native::retain_source_reference(&state,&owner,&preview,&inspection)?;
            return Ok(native.clone());
        }
        let build=current_build(&state,&p)?;let base=runtime_workbench::collaboration_tags(&state,&p,&build)?;
        let selected=core::forge_build::collaboration_input_hashes(&state.root.join("jobs").join(&build.id),&base).map_err(error)?;
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
        let base_inventory=transaction::fork_selected(&base,&tags,&selected,Arc::new(AtomicBool::new(false))).map_err(error)?;
        let mut closure=dep.clone();closure.insert(template_tag.clone(),template_sha256.clone());
        for (path,sha) in &closure {
            let file=tags.join(core::safe_relative(path).map_err(error)?);
            if let Some(existing)=base_inventory.get(path) {if existing!=sha{return Err(format!("Native asset dependency conflicts with the retained source: {path}. No source was replaced."));}continue;}
            let input=asset_root.join(core::safe_relative(path).map_err(error)?);let data=bounded_read(&input,256*1024*1024)?;
            if content::digest(&data)!=*sha {return Err("Native asset changed during admission".into());}
            fs::create_dir_all(file.parent().unwrap()).map_err(error)?;project::atomic_write(&file,&data,false).map_err(error)?;
        }
        if dependencies(&state,&p,&asset_root,&template_tag)?!=dep||maps::hash_file(&asset_root.join(&template_tag)).map_err(error)?!=template_sha256 {return Err("Native template source changed while validating".into());}
        if core::forge_build::collaboration_input_hashes(&state.root.join("jobs").join(&build.id),&base).map_err(error)?!=selected {
            return Err("Validated native input inventory changed during admission; no new source was selected".into());
        }
        let field_tag="weapons/pistol/pistol.weapon".to_string();
        let fields=native_operations_native::fields(&state,&p,&tags,&field_tag)?;
        let files=transaction::inventory(&tags).map_err(error)?;
        let source=content::Source{cache_version,inventory_sha256:content::inventory_hash(&files).map_err(error)?,field_tag_sha256:files[&field_tag].clone(),field_tag,bounding_radius:recipes::number(&fields,"bounding_radius").map_err(error)?,template_tag,template_sha256,dependencies:dep,preview_sha256:inspection.sha256.clone(),preview_tag_id,preview_tag_path:tag.path.replace('\\',"/")};
        let native=content::Document{source:source.clone(),fields:vec![],assets:vec![]};
        let mut doc=p.quick_forge.clone().ok_or("Native collaboration currently requires QuickForge source")?;doc.native=Some(native.clone());quickforge::validate_document(&doc).map_err(error)?;
        let inputs=serde_json::to_vec_pretty(&selected).map_err(error)?;
        project::atomic_write(&parent.join("base-inputs.json"),&inputs,false).map_err(error)?;
        let admission=Admission{project_id:project_id.clone(),tags,source,inputs_sha256:Some(content::digest(&inputs))};
        project::atomic_write(&parent.join("admission.json"),&serde_json::to_vec_pretty(&admission).map_err(error)?,false).map_err(error)?;
        asset_import_native::retain_source_reference(&state,&owner,&preview,&inspection)?;
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
        let inputs=if let Some(expected)=&a.inputs_sha256 {
            let file=a.tags.parent().ok_or("Native source has no owner")?.join("base-inputs.json");core::reject_links(&file).map_err(error)?;
            let bytes=bounded_read(&file,4*1024*1024)?;
            if content::digest(&bytes)!=*expected{return Err("Native recovery input manifest changed; no source was replaced".into());}
            let hashes:BTreeMap<String,String>=serde_json::from_slice(&bytes).map_err(error)?;
            core::working_tag_changes::validate_baseline(&hashes).map_err(error)?;Some((bytes,hashes))
        }else{None};
        let mut expected=if let Some((_,hashes))=&inputs {hashes.clone()}else{transaction::inventory(&base).map_err(error)?};
        let mut closure=a.source.dependencies.clone();closure.insert(a.source.template_tag.clone(),a.source.template_sha256.clone());
        for (file,sha) in &closure {if expected.get(file).is_some_and(|old|old!=sha){return Err(format!("Recovery base conflicts with admitted dependency: {file}"));}expected.insert(file.clone(),sha.clone());}
        if content::inventory_hash(&expected).map_err(error)?!=a.source.inventory_sha256{return Err("These base tags do not reconstruct the exact acknowledged native source. Select the matching preserved baseline; no source was replaced.".into());}
        let root=state.root.join("studio-native").join(uuid::Uuid::new_v4().to_string());fs::create_dir(&root).map_err(error)?;
        let tags=root.join("tags");
        if let Some((_,selected))=&inputs {transaction::fork_selected(&base,&tags,selected,Arc::new(AtomicBool::new(false))).map_err(error)?;}
        else {transaction::fork(&base,&tags,Arc::new(AtomicBool::new(false))).map_err(error)?;}
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
        let recovered=Admission{project_id:project_id.clone(),tags:tags.clone(),source:a.source.clone(),inputs_sha256:a.inputs_sha256.clone()};
        if let Some((bytes,_))=&inputs {project::atomic_write(&root.join("base-inputs.json"),bytes,false).map_err(error)?;}
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
