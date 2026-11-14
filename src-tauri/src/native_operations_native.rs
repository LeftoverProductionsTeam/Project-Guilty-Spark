//! Managed native Invader operations. Every writer runs against a candidate;
//! accepting or recovering selects a new full source fork, never the SDK tree.
use super::core::{native_operations as recipes, tool_transaction as transaction};
use super::*;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, process::Command, sync::OnceLock};

const MAX_TAG: u64 = 64 * 1024 * 1024;
fn hash_bytes(bytes: &[u8]) -> String {
    spark_core::hex_bytes(Sha256::digest(bytes))
}
fn gate() -> &'static Mutex<()> {
    static GATE: OnceLock<Mutex<()>> = OnceLock::new();
    GATE.get_or_init(|| Mutex::new(()))
}
pub(super) fn source_guard() -> Reply<std::sync::MutexGuard<'static, ()>> {
    gate().try_lock().map_err(|_|"Another native source operation is finishing. Wait for it before changing or building working tags.".into())
}
pub(super) fn require_idle(state: &AppState) -> Reply<()> {
    if !lock(&state.jobs)?.is_empty() {
        return Err("A build is using native source. Wait for it to finish before selecting another working revision.".into());
    }
    Ok(())
}
fn root(state: &AppState, id: &str) -> Reply<PathBuf> {
    uuid::Uuid::parse_str(id).map_err(error)?;
    let path = state.root.join("jobs").join(format!("invader-{id}"));
    core::reject_links(&path).map_err(error)?;
    Ok(path)
}
fn history_key(project: &str) -> String {
    format!("native-operation-history-{project}")
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Receipt {
    schema_version: u32,
    id: String,
    owner: String,
    project_id: String,
    fingerprint: String,
    parent_build_id: String,
    tag: String,
    class: String,
    operation: recipes::Operation,
    #[serde(default)]
    source_dependencies:BTreeMap<String,String>,
    tool_id: String,
    executable_sha256: String,
    before_sha256: String,
    after_sha256: String,
    before_fields: String,
    after_fields: String,
    field_changes: Vec<recipes::FieldDifference>,
    changed_bytes: usize,
    output: String,
    created_at: String,
}
/// Bind the active accepted append to subsequent native cache readback. This
/// does not revive an operation superseded by another source/Baboon revision.
pub(super) fn encounter_expectation(state:&AppState,project:&Project,build:&BuildRecord)->Reply<Option<recipes::Operation>> {
    let Some(tags)=native_source_revisions::selected(state,project,&build.id)? else{return Ok(None);};
    let selection=native_source_revisions::current(state,&project.id)?.ok_or("Native source selection disappeared")?;
    let receipt:Receipt=serde_json::from_slice(&bounded_read(&root(state,&selection.job_id)?.join("operation.json"),4*1024*1024)?).map_err(error)?;
    if receipt.schema_version!=1||receipt.id!=selection.job_id||receipt.project_id!=project.id||receipt.fingerprint!=project.fingerprint().map_err(error)? {return Err("Selected encounter receipt differs from its map/build revision".into());}
    if !receipt.operation.is_encounter_append(){return Ok(None);}
    receipt.operation.validate(&receipt.class,&receipt.tag).map_err(error)?;
    let file=tags.join(core::safe_relative(&receipt.tag).map_err(error)?);core::reject_links(&file).map_err(error)?;
    let hash=maps::hash_file(&file).map_err(error)?;
    if hash==receipt.before_sha256{return Ok(None);}// Exact recovery revision intentionally removes the append.
    if hash!=receipt.after_sha256||receipt.parent_build_id!=build.id{return Err("Accepted encounter source changed; review it before building".into());}
    check_dependency_pins(&tags,&receipt.source_dependencies)?;
    Ok(Some(receipt.operation))
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Context {
    source_target: String,
    project_id: String,
    build_id: String,
    tag: String,
    class: String,
    tags_directory: PathBuf,
    bounding_radius: Option<f64>,
    lens_flare_scale: Option<f64>,
    actor_variants:Vec<String>,
    can_append_encounter:bool,
    firefight_plan:Option<recipes::Operation>,
    firefight_plan_issue:Option<String>,
    can_edit: bool,
    can_repair: bool,
    edit_issue: Option<String>,
    repair_issue: Option<String>,
    history: Vec<Preview>,
}
struct Source {
    project: Project,
    build: BuildRecord,
    tags: PathBuf,
    tag: String,
    class: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TagChoice {
    id: u32,
    class: String,
    path: String,
}
#[tauri::command]
pub(super) async fn native_tag_inventory(
    app: tauri::AppHandle,
    project_id: String,
) -> Reply<Vec<TagChoice>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let project = lock(&state.library)?.get(&project_id).map_err(error)?;
        let (build,_) = runtime_workbench::native_operation_source(&state, &project)?;
        let inspection = if project.source.is_some() {
            inspect(&state, &project)?
        } else {
            Arc::new(
                maps::inspect_map(
                    build
                        .output
                        .as_ref()
                        .ok_or("Validated output is unavailable")?,
                    None,
                )
                .map_err(error)?,
            )
        };
        Ok(inspection
            .tags
            .iter()
            .map(|tag| TagChoice {
                id: tag.id,
                class: tag.class.clone(),
                path: tag.path.clone(),
            })
            .collect())
    })
    .await
    .map_err(error)?
}
fn source(state: &AppState, id: &str, tag_id: Option<u32>) -> Reply<Source> {
    let project = lock(&state.library)?.get(id).map_err(error)?;
    let (build,tags) = runtime_workbench::native_operation_source(state, &project)?;
    let (tag, class) = if let Some(id) = tag_id {
        let inspection = if project.source.is_some() {
            inspect(state, &project)?
        } else {
            Arc::new(
                maps::inspect_map(
                    build
                        .output
                        .as_ref()
                        .ok_or("Validated output is unavailable")?,
                    None,
                )
                .map_err(error)?,
            )
        };
        let entry = inspection
            .tags
            .iter()
            .find(|t| t.id == id)
            .ok_or("The selected tag is no longer in this map")?;
        (
            format!(
                "{}.{}",
                entry.path.replace('\\', "/"),
                core::tag_exchange::extension(&entry.class).map_err(error)?
            ),
            entry.class.clone(),
        )
    } else {
        (
            format!("{}.scenario", project.scenario_path().map_err(error)?),
            "scnr".into(),
        )
    };
    let file = tags.join(core::safe_relative(&tag).map_err(error)?);
    core::reject_links(&file).map_err(error)?;
    if !file.is_file() {
        return Err("This tag has no native file in the map's selected working source. Extract/build compatible source first.".into());
    }
    if fs::metadata(&file).map_err(error)?.len() > MAX_TAG {
        return Err("This tag exceeds the managed native-operation size bound".into());
    }
    Ok(Source {
        project,
        build,
        tags,
        tag,
        class,
    })
}
pub(super) fn executable(state: &AppState, project: &Project, id: &str) -> Reply<PathBuf> {
    let tool = core::tool_ecosystem::tool(id).map_err(error)?;
    if tool.integration != "managedWorkflow" || tool.location != "invader" {
        return Err("This tool has no reviewed native operation".into());
    }
    let directory = native_tag_parser::invader_directory(state, project)?;
    core::reject_links(&directory).map_err(error)?;
    let file = directory.join(
        tool.filename
            .as_deref()
            .ok_or("Missing native tool filename")?,
    );
    core::reject_links(&file).map_err(error)?;
    if fs::metadata(&file).map_err(error)?.len() > 256 * 1024 * 1024
        || Some(maps::hash_file(&file).map_err(error)?) != tool.sha256
    {
        return Err("This executable differs from the reviewed Invader release. No process was started; select the matching build or use a separately reviewed native workflow.".into());
    }
    Ok(file)
}
pub(super) fn fields(state: &AppState, project: &Project, tags: &Path, tag: &str) -> Reply<String> {
    let file = tags.join(core::safe_relative(tag).map_err(error)?);
    let before = maps::hash_file(&file).map_err(error)?;
    let parser = native_tag_parser::installed(state, project)?;
    let (valid, text, cut) = native_tag_parser::fields(&parser, tags, tag)?;
    if !valid || cut {
        return Err(format!(
            "The reviewed native reader could not validate this tag: {text}"
        ));
    }
    if maps::hash_file(&file).map_err(error)? != before {
        return Err(
            "The tag changed during native validation. Wait for the external save to finish."
                .into(),
        );
    }
    Ok(text)
}
const MAX_TOOL_STREAM: usize = 1024 * 1024;
fn pipe<R: Read + Send + 'static>(mut reader: R) -> std::thread::JoinHandle<(String, bool)> {
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let mut cut = false;
        let mut buffer = [0; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let room = MAX_TOOL_STREAM.saturating_sub(bytes.len());
                    cut |= n > room;
                    bytes.extend_from_slice(&buffer[..n.min(room)]);
                }
            }
        }
        (String::from_utf8_lossy(&bytes).replace("\r\n", "\n"), cut)
    })
}
pub(super) fn run(executable: &Path, args: &[String]) -> Reply<(bool, String, String)> {
    let mut command = Command::new(executable);
    command
        .args(args)
        .current_dir(executable.parent().ok_or("Tool has no directory")?)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(error)?;
    let stdout = pipe(child.stdout.take().ok_or("Missing tool stdout")?);
    let stderr = pipe(child.stderr.take().ok_or("Missing tool stderr")?);
    let began = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(error)? {
            break Some(status);
        }
        if began.elapsed() > Duration::from_secs(30) {
            let _ = child.kill();
            let _ = child.wait();
            break None;
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    let (stdout, out_cut) = stdout.join().map_err(|_| "Tool stdout reader failed")?;
    let (stderr, err_cut) = stderr.join().map_err(|_| "Tool stderr reader failed")?;
    if status.is_none() || out_cut || err_cut {
        return Err("Native operation timed out or exceeded its output bound. Its candidate is retained; no working source was selected.".into());
    }
    Ok((status.unwrap().success(), stdout, stderr))
}
pub(super) fn verify_bytes(tags: &Path, tag: &str, hash: &str) -> Reply<()> {
    let current = BTreeMap::from([(tag.into(), hash.into())]);
    let report = core::native_tag_integrity::Cache::default()
        .scan(tags, &BTreeMap::new(), &current, MAX_TAG)
        .map_err(error)?;
    if report.invalid_files != 0
        || report.unverified_files != 0
        || report.pending_files != 0
        || report.checked_files != 1
    {
        return Err("Native candidate header/class/CRC is invalid or unverified. Starting source and the candidate are retained for review.".into());
    }
    Ok(())
}
fn check_dependency_pins(tags:&Path,pins:&BTreeMap<String,String>)->Reply<()> {
    if pins.len()>2048{return Err("Encounter dependency inventory exceeds2048tags".into());}
    for(path,expected)in pins {
        let file=tags.join(core::safe_relative(path).map_err(error)?);core::reject_links(&file).map_err(error)?;
        if expected.len()!=64||!expected.bytes().all(|c|c.is_ascii_hexdigit())||maps::hash_file(&file).map_err(error)?!=*expected{return Err("An actor dependency changed after review; preserve the source and preview again".into());}
    }
    Ok(())
}
fn encounter_dependencies(state:&AppState,source:&Source,operation:&recipes::Operation,edit:&Path)->Reply<BTreeMap<String,String>> {
    if !operation.is_encounter_append(){return Ok(BTreeMap::new());}
    let entries=operation.encounter_appends().map_err(error)?;
    studio_native_source::require_unshared(state,&source.project.id)?;
    let output=source.build.output.as_ref().ok_or("Validated parent output is missing")?;
    if maps::inspect_header(output).map_err(error)?.scenario_type!=0{return Err("Native encounter append currently requires a reviewed singleplayer scenario. Multiplayer AI needs its engine-specific adapter.".into());}
    let(ok,value,stderr)=run(edit,&["-t".into(),source.tags.to_string_lossy().into_owned(),"-G".into(),"type".into(),source.tag.clone()])?;
    if !ok||value.trim()!="singleplayer"{return Err(format!("Working scenario is not a readable singleplayer source: {stderr}"));}
    let dependency=executable(state,&source.project,"invaderDependency")?;
    let dependency_hash=maps::hash_file(&dependency).map_err(error)?;
    let mut pins=BTreeMap::new();let mut actors=std::collections::BTreeSet::new();
    for entry in entries {
        let actor=format!("{}.actor_variant",entry.actor_path.replace('\\',"/"));
        if !actors.insert(actor.to_ascii_lowercase()){continue;}
        let file=source.tags.join(core::safe_relative(&actor).map_err(error)?);core::reject_links(&file).map_err(error)?;
        let hash=maps::hash_file(&file).map_err(error)?;verify_bytes(&source.tags,&actor,&hash)?;
        let _=fields(state,&source.project,&source.tags,&actor)?;
        let(ok,stdout,stderr)=run(&dependency,&recipes::Operation::Dependencies.arguments(&source.tags,"actv",&actor).map_err(error)?)?;
        if !ok{return Err(format!("Native actor dependency traversal failed: {stderr}"));}
        let rows=recipes::dependency_lines(&stdout).map_err(error)?;
        if rows.len()>2047{return Err("Actor closure exceeds2048checked native tags".into());}
        let mut current=BTreeMap::from([(actor,hash)]);
        for row in rows {
            if row.reported_broken{return Err(format!("Actor dependency is broken: {}",row.path));}
            let path=source.tags.join(core::safe_relative(&row.path).map_err(error)?);core::reject_links(&path).map_err(error)?;
            let hash=maps::hash_file(&path).map_err(error)?;
            if current.get(&row.path).is_some_and(|before|before!=&hash){return Err("An actor dependency changed during group review".into());}
            current.insert(row.path,hash);
        }
        for (path,hash) in current {
            if pins.get(&path).is_some_and(|before|before!=&hash){return Err("An encounter dependency changed between group reviews".into());}
            pins.insert(path,hash);
            if pins.len()>2048{return Err("Combined encounter groups exceed2048checked native tags".into());}
        }
    }
    if maps::hash_file(&dependency).map_err(error)?!=dependency_hash{return Err("The dependency reader changed during review".into());}
    check_dependency_pins(&source.tags,&pins)?;Ok(pins)
}
// Saved-rule plans are authoring metadata, not authority supplied by a caller.
// Recompute them against the current saved revision and actual native fields.
fn verify_firefight_plan(project:&Project,build:&BuildRecord,fields:&str,operation:&recipes::Operation)->Reply<()> {
    if matches!(operation,recipes::Operation::AppendEncounters{source_rules:Some(_),..}) {
        let planned=recipes::saved_firefight_encounters(project,build.sha256.as_deref().ok_or("Native source output has no hash")?,fields).map_err(error)?;
        if &planned!=operation{return Err("Saved Firefight rules, source or native group layout changed after review; prepare the groups again".into());}
    }
    Ok(())
}
fn read_receipt(state: &AppState, id: &str, owner: &str, project: &str) -> Reply<Receipt> {
    let file = root(state, id)?.join("operation.json");
    core::reject_links(&file).map_err(error)?;
    let receipt: Receipt =
        serde_json::from_slice(&bounded_read(&file, 4 * 1024 * 1024)?).map_err(error)?;
    if receipt.schema_version != 1
        || receipt.id != id
        || receipt.owner != owner
        || receipt.project_id != project
    {
        return Err(
            "The native preview belongs to another map/window or has an unsupported receipt".into(),
        );
    }
    receipt
        .operation
        .validate(&receipt.class, &receipt.tag)
        .map_err(error)?;
    if receipt.tool_id != receipt.operation.tool_id() {
        return Err("The native recipe identity changed".into());
    }
    Ok(receipt)
}
#[tauri::command]
pub(super) async fn native_tag_context(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    tag_id: Option<u32>,
) -> Reply<Context> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let source = source(&state, &project_id, tag_id)?;
        let values = fields(&state, &source.project, &source.tags, &source.tag)?;
        let mut actor_variants=vec![];
        let can_append_encounter=source.class=="scnr"&&maps::inspect_header(source.build.output.as_ref().ok_or("Validated output is missing")?).map_err(error)?.scenario_type==0;
        if can_append_encounter {
            let inspection=if source.project.source.is_some(){inspect(&state,&source.project)?}else{Arc::new(maps::inspect_map(source.build.output.as_ref().unwrap(),None).map_err(error)?)};
            for tag in inspection.tags.iter().filter(|tag|tag.class=="actv") {
                if let Ok(relative)=core::safe_relative(&format!("{}.actor_variant",tag.path.replace('\\',"/"))) {
                    if source.tags.join(relative).is_file(){actor_variants.push(tag.path.replace('\\',"/"));}
                }
            }
            actor_variants.sort();actor_variants.dedup();
        }
        let radius = recipes::number(&values, "bounding_radius").ok();
        let flare = recipes::number(&values, "rotation_function_scale").ok();
        let edit_issue = executable(&state, &source.project, "invaderNative").err();
        let repair_issue = executable(&state, &source.project, "invaderRepair").err();
        let ids: Vec<String> = lock(&state.library)?
            .setting(&history_key(&project_id))
            .map_err(error)?;
        if ids.len() > 32 {
            return Err("Native operation history exceeds the supported bound".into());
        }
        let hash = maps::hash_file(
            &source
                .tags
                .join(core::safe_relative(&source.tag).map_err(error)?),
        )
        .map_err(error)?;
        let mut history = Vec::new();
        for id in ids.iter().rev() {
            if let Ok(receipt) = read_receipt(&state, id, window.label(), &project_id) {
                if receipt.tag == source.tag {
                    history.push(preview_view(&receipt, &hash)?);
                }
            }
        }
        let can_append_encounter=can_append_encounter&&edit_issue.is_none()&&studio_native_source::require_unshared(&state,&source.project.id).is_ok();
        let (firefight_plan,firefight_plan_issue)=if can_append_encounter {
            match recipes::saved_firefight_encounters(&source.project,source.build.sha256.as_deref().unwrap_or(""),&values){Ok(plan)=>(Some(plan),None),Err(issue)=>(None,Some(error(issue)))}
        }else{(None,None)};
        Ok(Context {
            firefight_plan,firefight_plan_issue,
            source_target: source.build.target.clone(),
            project_id,
            build_id: source.build.id,
            tag: source.tag,
            class: source.class,
            tags_directory: source.tags,
            actor_variants,
            can_append_encounter,
            bounding_radius: radius,
            lens_flare_scale: flare,
            can_edit: radius.is_some() && edit_issue.is_none(),
            can_repair: flare.is_some_and(recipes::broken_lens_scale) && repair_issue.is_none(),
            edit_issue,
            repair_issue,
            history,
        })
    })
    .await
    .map_err(error)?
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DependencyReport {
    tag: String,
    tool: String,
    executable_sha256: String,
    complete: bool,
    dependencies: Vec<DependencyView>,
    output: String,
    detail: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DependencyView {
    path: String,
    reported_broken: bool,
    present: bool,
}
#[tauri::command]
pub(super) async fn native_dependency_check(
    app: tauri::AppHandle,
    project_id: String,
    tag_id: Option<u32>,
) -> Reply<DependencyReport> {
    tauri::async_runtime::spawn_blocking(move||{
    let state=app.state::<AppState>();let source=source(&state,&project_id,tag_id)?;let exe=executable(&state,&source.project,"invaderDependency")?;
    let before=transaction::inventory(&source.tags).map_err(error)?;let args=recipes::Operation::Dependencies.arguments(&source.tags,&source.class,&source.tag).map_err(error)?;
    let (ok,stdout,stderr)=run(&exe,&args)?;let rows=recipes::dependency_lines(&stdout).map_err(error)?;
    let mut dependencies=Vec::new();for row in rows {let file=source.tags.join(core::safe_relative(&row.path).map_err(error)?);core::reject_links(&file).map_err(error)?;dependencies.push(DependencyView{path:row.path,reported_broken:row.reported_broken,present:file.is_file()});}
    let stable=transaction::inventory(&source.tags).map_err(error)?==before;
    let complete=ok&&stable&&dependencies.iter().all(|d|d.present&&!d.reported_broken);
    Ok(DependencyReport{tag:source.tag,tool:"Invader dependency 0.55.0.r4134.33518109".into(),executable_sha256:maps::hash_file(&exe).map_err(error)?,complete,dependencies,output:format!("{stdout}{stderr}"),detail:if complete{"Native dependency traversal completed; listed references are present and the source inventory is unchanged. Compilation/playtesting remain separate.".into()}else{"Dependency analysis is incomplete: the native utility failed, a reference is broken/missing, or source changed during the check. A zero process exit alone never makes a missing dependency valid.".into()}})
}).await.map_err(error)?
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Preview {
    id: String,
    tag: String,
    tool_id: String,
    before_sha256: String,
    after_sha256: String,
    changed_bytes: usize,
    field_changes: Vec<recipes::FieldDifference>,
    actor_positions:Option<Vec<[f32;3]>>,
    detail: String,
    current_state: String,
}
fn preview_view(receipt: &Receipt, current: &str) -> Reply<Preview> {
    Ok(Preview{actor_positions:receipt.operation.actor_start_positions().map_err(error)?,id:receipt.id.clone(),tag:receipt.tag.clone(),tool_id:receipt.tool_id.clone(),before_sha256:receipt.before_sha256.clone(),after_sha256:receipt.after_sha256.clone(),changed_bytes:receipt.changed_bytes,field_changes:receipt.field_changes.clone(),current_state:if current==receipt.before_sha256{"before"}else if current==receipt.after_sha256{"after"}else{"conflict"}.into(),detail:if receipt.operation.is_encounter_append(){"The reviewed native encounters are appended, existing exposed scenario fields are retained, and actor references are checked. Accept to select a separate source revision, then build it. Navigation, actual spawning and gameplay remain unverified; opaque bytes are not certified."}else{"Exactly the requested exposed native field differs; opaque bytes are not certified. Accept to create a separate complete source revision. The original source/cache stay unchanged."}.into()})
}
#[tauri::command]
pub(super) async fn native_operation_preview(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    tag_id: Option<u32>,
    operation: recipes::Operation,
) -> Reply<Preview> {
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move||{
    let _gate=lock(gate())?;let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;
    if matches!(operation,recipes::Operation::Dependencies){return Err("Use the read-only dependency check for this operation".into());}
    let source=source(&state,&project_id,tag_id)?;operation.validate(&source.class,&source.tag).map_err(error)?;
    let mut history:Vec<String>=lock(&state.library)?.setting(&history_key(&project_id)).map_err(error)?;
    if history.len()>=32{return Err("This map retains 32 managed previews. Review/recover existing revisions before creating more; no source was deleted.".into());}
    let exe=executable(&state,&source.project,operation.tool_id())?;let executable_sha256=maps::hash_file(&exe).map_err(error)?;
    let before_fields=fields(&state,&source.project,&source.tags,&source.tag)?;
    verify_firefight_plan(&source.project,&source.build,&before_fields,&operation)?;
    let source_dependencies=encounter_dependencies(&state,&source,&operation,&exe)?;
    if let Some(field)=operation.field(){if recipes::number(&before_fields,field).map_err(error)?==operation.target().unwrap(){return Err("This native value already matches. No serialization or repair was performed.".into());}}
    if matches!(operation,recipes::Operation::LensFlareScaleRepair)&&!recipes::broken_lens_scale(recipes::number(&before_fields,"rotation_function_scale").map_err(error)?){return Err("This lens flare does not have the reviewed 360-to-zero repair precondition. No repair ran.".into());}
    let relative=core::safe_relative(&source.tag).map_err(error)?;let before=bounded_read(&source.tags.join(&relative),MAX_TAG)?;
    let before_sha256=hash_bytes(&before);let id=uuid::Uuid::new_v4().to_string();let directory=root(&state,&id)?;fs::create_dir(&directory).map_err(error)?;
    project::atomic_write(&directory.join("before.tag"),&before,false).map_err(error)?;
    let candidate=directory.join("candidate/tags");fs::create_dir_all(candidate.join(&relative).parent().unwrap()).map_err(error)?;project::atomic_write(&candidate.join(&relative),&before,false).map_err(error)?;
    let failed=|ok:bool,out:&str,err:&str|!ok||out.lines().chain(err.lines()).any(|line|line.trim().to_ascii_lowercase().starts_with("error:"));
    let args=operation.arguments_with_fields(&candidate,&source.class,&source.tag,&before_fields).map_err(error)?;
    let mut stdout=String::new();let mut stderr=String::new();
    for args in operation.argument_batches(args,false).map_err(error)? {
        let(ok,out,problem)=run(&exe,&args)?;
        if out.len()>MAX_TOOL_STREAM.saturating_sub(stdout.len())||problem.len()>MAX_TOOL_STREAM.saturating_sub(stderr.len()) {
            return Err("Native encounter batches exceeded the retained output bound; starting source is unchanged and no partial append was selected.".into());
        }
        stdout.push_str(&out);stderr.push_str(&problem);
        project::atomic_write(&directory.join("native-output.txt"),format!("{stdout}{stderr}").as_bytes(),false).map_err(error)?;
        if failed(ok,&out,&problem){
            let diagnostic=if problem.trim().is_empty(){&out}else{&problem};
            return Err(format!("{} rejected an isolated candidate batch: {}. Starting source remains unchanged; no partial append was selected.",operation.tool_id(),diagnostic.chars().take(600).collect::<String>()));
        }
    }
    if let Some(args)=operation.readback_arguments(&candidate,&source.class,&source.tag,&before_fields).map_err(error)? {
        let mut readback=String::new();
        for args in operation.argument_batches(args,true).map_err(error)? {
            let(ok,part,problem)=run(&exe,&args)?;
            if failed(ok,&part,&problem){
                let diagnostic=if problem.trim().is_empty(){&part}else{&problem};
                return Err(format!("Native encounter readback failed: {}",diagnostic.chars().take(600).collect::<String>()));
            }
            if part.len().saturating_add(1)>MAX_TOOL_STREAM.saturating_sub(readback.len()) {
                return Err("Native encounter readback batches exceeded the retained output bound; no partial append was selected.".into());
            }
            readback.push_str(part.trim_end_matches(&['\r','\n'][..]));readback.push('\n');
        }
        operation.verify_readback(&candidate,&source.class,&source.tag,&before_fields,&readback).map_err(error)?;
        project::atomic_write(&directory.join("native-encounter-readback.txt"),readback.as_bytes(),false).map_err(error)?;
    }
    check_dependency_pins(&source.tags,&source_dependencies)?;
    if maps::hash_file(&exe).map_err(error)?!=executable_sha256{return Err("Native writer changed during the preview; no source was selected".into());}
    let after_fields=fields(&state,&source.project,&candidate,&source.tag)?;let field_changes=recipes::reviewed_difference(&before_fields,&after_fields,&operation).map_err(error)?;
    let after=bounded_read(&candidate.join(&relative),MAX_TAG)?;let after_sha256=hash_bytes(&after);verify_bytes(&candidate,&source.tag,&after_sha256)?;
    if maps::hash_file(&source.tags.join(&relative)).map_err(error)?!=before_sha256{return Err("Working source changed during preview. The candidate is retained; refresh before making another preview.".into());}
    if transaction::inventory(&candidate).map_err(error)?!=BTreeMap::from([(source.tag.clone(),after_sha256.clone())]){return Err("The native operation changed unexpected candidate files; no revision was selected".into());}
    let changed_bytes=before.iter().zip(&after).filter(|(a,b)|a!=b).count()+before.len().abs_diff(after.len());
    let receipt=Receipt{schema_version:1,id:id.clone(),owner,project_id:project_id.clone(),fingerprint:source.project.fingerprint().map_err(error)?,parent_build_id:source.build.id,tag:source.tag.clone(),class:source.class,operation:operation.clone(),source_dependencies,tool_id:operation.tool_id().into(),executable_sha256,before_sha256:before_sha256.clone(),after_sha256:after_sha256.clone(),before_fields,after_fields,field_changes:field_changes.clone(),changed_bytes,output:format!("{stdout}{stderr}"),created_at:chrono::Utc::now().to_rfc3339()};
    project::atomic_write(&directory.join("operation.json"),&serde_json::to_vec_pretty(&receipt).map_err(error)?,false).map_err(error)?;
    history.push(id.clone());lock(&state.library)?.set_setting(&history_key(&project_id),&history).map_err(error)?;
    preview_view(&receipt,&before_sha256)
}).await.map_err(error)?
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Accepted {
    operation_id: String,
    revision_id: String,
    tags_directory: PathBuf,
    files: usize,
    restored: bool,
    detail: String,
}
#[tauri::command]
pub(super) async fn native_operation_accept(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    operation_id: String,
    restore: bool,
) -> Reply<Accepted> {
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move||{
    let _gate=source_guard()?;let state=app.state::<AppState>();require_idle(&state)?;check_document_owner(&state,&project_id,&owner)?;let receipt=read_receipt(&state,&operation_id,&owner,&project_id)?;
    let project=lock(&state.library)?.get(&project_id).map_err(error)?;let (build,current)=runtime_workbench::native_operation_source(&state,&project)?;
    if project.fingerprint().map_err(error)?!=receipt.fingerprint||(!restore&&build.id!=receipt.parent_build_id){return Err("The saved map/build changed after this preview. No source was selected; preview the current saved map again.".into());}
    if baboon_native::has_running(&project_id)?||runtime_workbench::has_running(&state,&project_id)?{return Err("Close this map's native editor/test process before selecting a new source revision".into());}
    let exe=executable(&state,&project,&receipt.tool_id)?;if maps::hash_file(&exe).map_err(error)?!=receipt.executable_sha256{return Err("The native writer changed after preview; review its identity again".into());}
    let expected=native_source_revisions::current(&state,&project_id)?;let legacy=native_source_revisions::legacy_revision(&state,&project_id)?;
    let relative=core::safe_relative(&receipt.tag).map_err(error)?;
    if !restore{check_dependency_pins(&current,&receipt.source_dependencies)?;}
    let current_hash=maps::hash_file(&current.join(&relative)).map_err(error)?;
    let wanted_current=if restore{&receipt.after_sha256}else{&receipt.before_sha256};if &current_hash!=wanted_current{return Err("This native tag changed after preview/acceptance. Overlapping edits need review; both sources are retained.".into());}
    if !restore&&fields(&state,&project,&current,&receipt.tag)?!=receipt.before_fields{return Err("The current native fields no longer match the reviewed starting source".into());}
    if !restore{verify_firefight_plan(&project,&build,&receipt.before_fields,&receipt.operation)?;}
    let directory=root(&state,&operation_id)?;let candidate=directory.join("candidate/tags");let before=bounded_read(&directory.join("before.tag"),MAX_TAG)?;
    if hash_bytes(&before)!=receipt.before_sha256||maps::hash_file(&candidate.join(&relative)).map_err(error)?!=receipt.after_sha256{return Err("The retained native preview or recovery bytes changed; no revision was selected".into());}
    let actual_fields=fields(&state,&project,&candidate,&receipt.tag)?;if actual_fields!=receipt.after_fields{return Err("Candidate native fields no longer match the reviewed result".into());}
    recipes::reviewed_difference(&receipt.before_fields,&actual_fields,&receipt.operation).map_err(error)?;verify_bytes(&candidate,&receipt.tag,&receipt.after_sha256)?;
    let revision_id=uuid::Uuid::new_v4().to_string();let revision=native_source_revisions::directory(&state,&operation_id,&revision_id)?;
    fs::create_dir_all(revision.parent().unwrap()).map_err(error)?;
    if fs::read_dir(revision.parent().unwrap()).map_err(error)?.count()>=100{return Err("This native operation retains 100 revisions. Start a fresh preview; previous revisions remain preserved.".into());}
    fs::create_dir(&revision).map_err(error)?;
    let tags=revision.join("tags");let baseline=transaction::fork(&current,&tags,Arc::new(AtomicBool::new(false))).map_err(error)?;
    let bytes=if restore{before}else{bounded_read(&candidate.join(&relative),MAX_TAG)?};project::atomic_write(&tags.join(&relative),&bytes,false).map_err(error)?;
    let expected_hash=if restore{&receipt.before_sha256}else{&receipt.after_sha256};let mut wanted=baseline.clone();wanted.insert(receipt.tag.clone(),expected_hash.clone());
    if transaction::inventory(&tags).map_err(error)?!=wanted||transaction::inventory(&current).map_err(error)?!=baseline{return Err("Native source changed while staging. The staged copy is retained but was not selected.".into());}
    let restored_fields=fields(&state,&project,&tags,&receipt.tag)?;if restored_fields!=if restore{receipt.before_fields.clone()}else{receipt.after_fields.clone()}{return Err("Staged native field readback differs; no source was selected".into());}
    if runtime_workbench::native_operation_source(&state,&project)?.1!=current{return Err("The selected native source changed while staging; refresh before accepting".into());}
    if !restore{check_dependency_pins(&tags,&receipt.source_dependencies)?;check_dependency_pins(&current,&receipt.source_dependencies)?;}
    if maps::hash_file(&exe).map_err(error)?!=receipt.executable_sha256{return Err("Native writer changed while selecting the revision; no source was selected".into());}
    let selection=native_source_revisions::Selection{project_id:project_id.clone(),fingerprint:receipt.fingerprint,parent_build_id:build.id,job_id:operation_id.clone(),revision_id:revision_id.clone(),baboon_revision_at_selection:legacy};
    let tags=native_source_revisions::publish(&state,&project,selection,expected)?;
    let _=app.emit("spark:library-changed",());
    Ok(Accepted{operation_id,revision_id,tags_directory:tags,files:wanted.len(),restored:restore,detail:if restore{"Created a recovery revision containing the exact before-edit tag and all other current files. Build working tag edits to compile it.".into()}else{"Selected a complete native source revision with the reviewed tag edit. Build working tag edits to compile a separate cache; no gameplay result is implied.".into()}})
}).await.map_err(error)?
}
