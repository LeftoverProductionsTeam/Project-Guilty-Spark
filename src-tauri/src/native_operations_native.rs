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
    if !receipt.operation.is_encounter_append()&&!receipt.operation.is_scenario_ai_edit(){return Ok(None);}
    receipt.operation.validate(&receipt.class,&receipt.tag).map_err(error)?;
    let file=tags.join(core::safe_relative(&receipt.tag).map_err(error)?);core::reject_links(&file).map_err(error)?;
    let hash=maps::hash_file(&file).map_err(error)?;
    if hash==receipt.before_sha256{return Ok(None);}// Exact recovery revision intentionally removes the append.
    if hash!=receipt.after_sha256||receipt.parent_build_id!=build.id{return Err("Accepted encounter source changed; review it before building".into());}
    check_dependency_pins(&tags,&receipt.source_dependencies)?;
    Ok(Some(receipt.operation))
}

/// Build evidence follows the current selected source, not only its most recent
/// operation. Reviews are bounded by the existing native history; they never
/// authorize replaying an operation or launching a caller-selected executable.
pub(super) fn hud_readback_targets(state:&AppState,project:&Project,build:&BuildRecord)->Reply<Vec<recipes::HudSourceTarget>> {
    let ids:Vec<String>=lock(&state.library)?.setting(&history_key(&project.id)).map_err(error)?;
    if ids.len()>32{return Err("Native HUD review history exceeds its existing bound".into());}
    let fingerprint=project.fingerprint().map_err(error)?;
    let mut targets:Vec<recipes::HudSourceTarget>=vec![];
    for id in ids {
        let path=root(state,&id)?.join("operation.json");
        let Ok(bytes)=bounded_read(&path,4*1024*1024)else{continue;};
        let Ok(receipt)=serde_json::from_slice::<Receipt>(&bytes)else{continue;};
        if receipt.schema_version!=1||receipt.id!=id||receipt.project_id!=project.id||
            receipt.fingerprint!=fingerprint||receipt.parent_build_id!=build.id||
            !matches!(receipt.operation,recipes::Operation::HudDuplicate{..}) {continue;}
        receipt.operation.validate(&receipt.class,&receipt.tag).map_err(error)?;
        let target=recipes::HudSourceTarget{class:receipt.class,tag:receipt.tag};target.validate().map_err(error)?;
        if !targets.iter().any(|known|known.class==target.class&&known.tag.replace('\\',"/").eq_ignore_ascii_case(&target.tag.replace('\\',"/"))){targets.push(target);}
    }
    Ok(targets)
}

/// Existing receipts are evidence for readback/protection only. They never
/// authorize replaying writes or launching a tool.
fn encounter_review_metadata(state:&AppState,project:&Project,build:&BuildRecord)->Reply<(bool,bool,Vec<recipes::Operation>,std::collections::BTreeSet<String>,bool,bool,bool,bool,bool,std::collections::BTreeSet<String>)> {
    let mut flight_tags=std::collections::BTreeSet::new();let mut counts=false;let mut starts=false;let mut cameras=false;let mut volumes=false;let mut devices=false;let mut commands=false;let mut transports=false;let mut combat=vec![];let mut protected=std::collections::BTreeSet::new();
    let inspect_operation=|operation:&recipes::Operation,counts:&mut bool,starts:&mut bool,combat:&mut Vec<recipes::Operation>,protected:&mut std::collections::BTreeSet<String>,cameras:&mut bool,volumes:&mut bool,devices:&mut bool,commands:&mut bool,transports:&mut bool|->Reply<()>{
        if operation.is_faction_edit(){*counts=true;*devices=true;*volumes=true;}
        if operation.is_transport_append()||operation.is_vehicle_flight(){*counts=true;*starts=true;*transports=true;}
        if operation.is_command_edit(){*counts=true;*commands=true;}
        if operation.is_device_edit(){*counts=true;*devices=true;}
        if operation.is_trigger_edit(){*counts=true;*volumes=true;}
        if operation.is_camera_edit(){*counts=true;*cameras=true;}
        if operation.is_squad_count_edit(){*counts=true;}
        if let Some(key)=operation.combat_target_key(){*counts=true;if !combat.iter().any(|op|op.combat_target_key()==Some(key)){if combat.len()>=4096{return Err("Native combat readback exceeds4096targets".into());}combat.push(operation.clone());}}
        if operation.is_squad_start_edit(){*counts=true;*starts=true;}
        for entry in operation.encounter_appends().map_err(error)?{protected.insert(entry.name.to_ascii_lowercase());}
        Ok(())
    };
    if let Some(doc)=&project.quick_forge {
        for encounter in &doc.campaign_encounters{protected.insert(encounter.name.to_ascii_lowercase());}
        if doc.game_mode!="campaign"{
            if let Some(plan)=core::firefight::native_round_plan(project).map_err(error)?{
                for name in plan.encounter_names{protected.insert(name.to_ascii_lowercase());}
            }
        }
    }
    uuid::Uuid::parse_str(&build.id).map_err(error)?;
    let parent=state.root.join("jobs").join(&build.id).join("working-tags-receipt.json");
    core::reject_links(&parent).map_err(error)?;
    if parent.is_file(){
        let receipt:core::working_tags::WorkingTagsReceipt=serde_json::from_slice(&bounded_read(&parent,4*1024*1024)?).map_err(error)?;
        if receipt.schema_version!=1||receipt.job_id!=build.id||receipt.project_id!=project.id||receipt.status!="validated"||
            receipt.project_fingerprint!=build.project_fingerprint{return Err("Native encounter parent evidence changed; no squad edit was admitted".into());}
        if let Some(rows)=receipt.scenario_squad_readback.as_ref().and_then(|s|s.transports.as_ref()){for row in rows.iter().filter(|row|row.flight.is_some()){flight_tags.insert(format!("{}.vehicle",row.transport.tag_path).replace('\\',"/").to_ascii_lowercase());}}
        let had_snapshot=receipt.scenario_squad_readback.is_some();
        let had_starts=receipt.scenario_squad_readback.as_ref().is_some_and(|snapshot|snapshot.include_starts);
        for operation in receipt.encounter_expectations.iter().chain(receipt.expected_encounter.iter()){inspect_operation(operation,&mut counts,&mut starts,&mut combat,&mut protected,&mut cameras,&mut volumes,&mut devices,&mut commands,&mut transports)?;}
        if let Some(generated)=&receipt.generated_firefight{inspect_operation(&generated.operation,&mut counts,&mut starts,&mut combat,&mut protected,&mut cameras,&mut volumes,&mut devices,&mut commands,&mut transports)?;}
        if let Some(snapshot)=&receipt.scenario_squad_readback{snapshot.validate().map_err(error)?;for op in &snapshot.combat{inspect_operation(op,&mut counts,&mut starts,&mut combat,&mut protected,&mut cameras,&mut volumes,&mut devices,&mut commands,&mut transports)?;}}
        transports|=receipt.scenario_squad_readback.as_ref().is_some_and(|s|s.transports.is_some());commands|=receipt.scenario_squad_readback.as_ref().is_some_and(|s|s.command_lists.is_some());devices|=receipt.scenario_squad_readback.as_ref().is_some_and(|snapshot|snapshot.devices.is_some());volumes|=receipt.scenario_squad_readback.as_ref().is_some_and(|snapshot|snapshot.volumes.is_some());counts|=had_snapshot;starts|=had_starts;cameras|=receipt.scenario_squad_readback.as_ref().is_some_and(|snapshot|snapshot.cameras.is_some());
    }
    let ids:Vec<String>=lock(&state.library)?.setting(&history_key(&project.id)).map_err(error)?;
    if ids.len()>32{return Err("Native encounter review history exceeds its existing bound".into());}
    let fingerprint=project.fingerprint().map_err(error)?;
    for id in ids {
        let file=root(state,&id)?.join("operation.json");core::reject_links(&file).map_err(error)?;
        let receipt:Receipt=serde_json::from_slice(&bounded_read(&file,4*1024*1024)?).map_err(error)?;
        if receipt.schema_version!=1||receipt.id!=id||receipt.project_id!=project.id{return Err("Native encounter history identity changed; review its recovery evidence".into());}
        if receipt.parent_build_id!=build.id||receipt.fingerprint!=fingerprint{continue;}
        if receipt.operation.is_vehicle_flight(){flight_tags.insert(receipt.tag.replace('\\',"/").to_ascii_lowercase());}
        receipt.operation.validate(&receipt.class,&receipt.tag).map_err(error)?;
        inspect_operation(&receipt.operation,&mut counts,&mut starts,&mut combat,&mut protected,&mut cameras,&mut volumes,&mut devices,&mut commands,&mut transports)?;
    }
    Ok((counts,starts,combat,protected,cameras,volumes,devices,commands,transports,flight_tags))
}
pub(super) fn protected_mission_encounters(state:&AppState,project:&Project,build:&BuildRecord)->Reply<std::collections::BTreeSet<String>>{Ok(encounter_review_metadata(state,project,build)?.3)}
pub(super) fn squad_readback_targets(state:&AppState,project:&Project,build:&BuildRecord,tags:&Path,force_cameras:bool)->Reply<Option<recipes::ScenarioSquadReadback>> {
    let (required,include_starts,combat,_,include_cameras,include_volumes,include_devices,include_commands,include_transports,flight_tags)=encounter_review_metadata(state,project,build)?;
    let include_cameras=include_cameras||force_cameras;
    let include_objects=project.studio.as_ref().is_some_and(|studio|studio.missions.iter().any(|beat|beat.guidance.as_ref().is_some_and(|g|g.object.is_some())));
    if !required&&!include_cameras&&!include_volumes&&!include_devices&&!include_commands&&!include_transports&&!include_objects{return Ok(None);}
    let tag=format!("{}.scenario",project.scenario_path().map_err(error)?);
    let file=tags.join(core::safe_relative(&tag).map_err(error)?);core::reject_links(&file).map_err(error)?;
    let source_sha256=maps::hash_file(&file).map_err(error)?;
    let listing=fields(state,project,tags,&tag)?;
    if maps::hash_file(&file).map_err(error)?!=source_sha256{return Err("Native scenario changed during squad review; rebuild was not started".into());}
    let squads=if include_starts{recipes::scenario_squad_start_choices(&listing)}else{recipes::scenario_squad_choices(&listing)}.map_err(error)?;
    let combat=if combat.is_empty(){vec![]}else{recipes::current_combat_targets(&listing,&source_sha256,&combat).map_err(error)?};
    let named_objects=if include_objects{Some(recipes::native_guidance_objects(&listing).map_err(error)?)}else{None};
    let cutscene_flags=if include_cameras{Some(recipes::scenario_flag_choices(&listing).map_err(error)?)}else{None};
    let cameras=if include_cameras{Some(recipes::scenario_camera_choices(&listing).map_err(error)?)}else{None};
    let volumes=if include_volumes{Some(recipes::scenario_volume_choices(&listing).map_err(error)?)}else{None};
    let devices=if include_devices{Some(recipes::scenario_device_choices(&listing).map_err(error)?)}else{None};
    let command_lists=if include_commands{Some(recipes::native_command_source(&listing).map_err(error)?.lists)}else{None};
    let transports=if include_transports{
        let mut rows=recipes::complete_transport_snapshots(&listing).map_err(error)?;
        let mut found=std::collections::BTreeSet::new();
        for row in &mut rows {let tag=format!("{}.vehicle",row.transport.tag_path);let key=tag.replace('\\',"/").to_ascii_lowercase();if flight_tags.contains(&key){let listing=fields(state,project,tags,&tag)?;let tuning=recipes::native_vehicle_flight(&listing).map_err(error)?;tuning.validate().map_err(error)?;row.flight=Some(tuning);found.insert(key);}}
        if found!=flight_tags{return Err("A reviewed flight vehicle no longer has its complete named source binding; rebuild was not started".into());}
        Some(rows)
    }else{None};
    let extraction_squads=recipes::native_squad_terminal_snapshots(&listing).map_err(error)?;
    let faction_kits=recipes::native_faction_snapshots(&listing).map_err(error)?;
    let snapshot=recipes::ScenarioSquadReadback{named_objects,cutscene_flags,extraction_squads:if extraction_squads.is_empty(){None}else{Some(extraction_squads)},faction_kits:if faction_kits.is_empty(){None}else{Some(faction_kits)},transports,command_lists,source_sha256,squads,include_starts,combat,cameras,volumes,devices};
    snapshot.validate().map_err(error)?;
    Ok(Some(snapshot))
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
    tag_sha256:String,
    bounding_radius: Option<f64>,
    vehicle_flight:Option<recipes::VehicleFlightTuning>,
    vehicle_flight_issue:Option<String>,
    lens_flare_scale: Option<f64>,
    actor_variants:Vec<String>,
    can_append_encounter:bool,
    can_append_transport:bool,vehicle_sources:Vec<String>,
    can_append_faction_kits:bool,control_sources:Vec<String>,weapon_sources:Vec<String>,
    scenario_squads:Vec<recipes::ScenarioSquadChoice>,
    scenario_start_squads:Vec<recipes::ScenarioSquadChoice>,
    guidance_objects:Option<Vec<maps::NativeNamedObject>>,guidance_object_issue:Option<String>,
    mission_source:Option<recipes::NativeMissionSource>,mission_source_issue:Option<String>,
    scenario_devices:Vec<recipes::NativeDevicePlacement>,
    device_edit_issue:Option<String>,
    scenario_volumes:Vec<maps::ScenarioLogicVolume>,
    trigger_edit_issue:Option<String>,
    scenario_flags:Vec<maps::NativeCutsceneFlag>,flag_edit_issue:Option<String>,
    scenario_cameras:Vec<maps::NativeCameraPoint>,
    camera_edit_issue:Option<String>,
    command_source:Option<recipes::NativeCommandSource>,command_source_issue:Option<String>,protected_command_lists:Vec<u16>,
    vehicle_seats:Option<Vec<String>>,vehicle_seat_issue:Option<String>,
    scenario_command_lists:Vec<recipes::ScenarioCommandListChoice>,
    command_list_issue:Option<String>,
    start_edit_issue:Option<String>,
    scenario_combat:Vec<recipes::ScenarioCombatChoice>,
    combat_edit_issue:Option<String>,
    squad_edit_issue:Option<String>,
    protected_squad_encounters:Vec<String>,
    hud_arrays:Vec<recipes::HudArrayChoice>,
    can_duplicate_hud:bool,
    hud_structure_issue:Option<String>,
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
/// Flight tuning stays bound to a real named CE solo transport and its existing
/// source receipt. Arbitrary/unbound vehicle edits use their separate workflow.
fn require_flight_transport(state:&AppState,source:&Source)->Reply<()> {
    if source.class!="vehi"||source.build.target!="gbx-custom"||maps::inspect_header(source.build.output.as_ref().ok_or("Validated output is missing")?).map_err(error)?.scenario_type!=0{return Err("Flight tuning requires a named aircraft in reviewed CE609 solo working source".into());}
    studio_native_source::require_unshared(state,&source.project.id)?;
    let tag=format!("{}.scenario",source.project.scenario_path().map_err(error)?);
    let native=fields(state,&source.project,&source.tags,&tag)?;
    let rows=recipes::complete_transport_snapshots(&native).map_err(error)?;
    if !rows.iter().any(|row|format!("{}.vehicle",row.transport.tag_path).replace('\\',"/").eq_ignore_ascii_case(&source.tag.replace('\\',"/"))){return Err("Bind this aircraft as a Pelican/Spirit with all three dedicated signals and build its source before tuning flight".into());}
    Ok(())
}
pub(super) fn fields(state: &AppState, project: &Project, tags: &Path, tag: &str) -> Reply<String> {
    checked_read(state,project,tags,tag,|parser,tags,tag|{let(valid,text,cut)=native_tag_parser::fields(parser,tags,tag)?;if !valid||cut{return Err(format!("The reviewed native reader could not validate this tag: {text}"));}Ok(text)})
}
pub(super) fn animation_seats(state:&AppState,project:&Project,tags:&Path,tag:&str)->Reply<Vec<String>>{
    checked_read(state,project,tags,tag,native_tag_parser::animation_seats)
}
fn checked_read<T>(state:&AppState,project:&Project,tags:&Path,tag:&str,read:impl FnOnce(&Path,&Path,&str)->Reply<T>)->Reply<T>{
    let file = tags.join(core::safe_relative(tag).map_err(error)?);
    let before = maps::hash_file(&file).map_err(error)?;
    let parser = native_tag_parser::installed(state, project)?;
    let text=read(&parser,tags,tag)?;
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
        if expected.len()!=64||!expected.bytes().all(|c|c.is_ascii_hexdigit())||maps::hash_file(&file).map_err(error)?!=*expected{return Err("A native dependency changed after review; preserve the source and preview again".into());}
    }
    Ok(())
}
fn operation_dependencies(state:&AppState,source:&Source,operation:&recipes::Operation,edit:&Path)->Reply<BTreeMap<String,String>> {
    if matches!(operation,recipes::Operation::HudDuplicate{..}) {
        studio_native_source::require_unshared(state,&source.project.id)?;
        let dependency=executable(state,&source.project,"invaderDependency")?;
        let identity=maps::hash_file(&dependency).map_err(error)?;
        let(ok,output,stderr)=run(&dependency,&recipes::Operation::Dependencies.arguments(&source.tags,&source.class,&source.tag).map_err(error)?)?;
        if !ok||output.lines().chain(stderr.lines()).any(|line|line.trim_start().to_ascii_lowercase().starts_with("error:")) {
            return Err(format!("HUD dependency traversal failed: {}",stderr.chars().take(600).collect::<String>()));
        }
        let rows=recipes::dependency_lines(&output).map_err(error)?;
        if rows.len()>2048{return Err("HUD closure exceeds2048checked native tags".into());}
        let mut pins=BTreeMap::new();
        for row in rows {
            if row.reported_broken{return Err(format!("HUD dependency is broken: {}",row.path));}
            // A self-reference is covered by the operation's original/candidate
            // hashes. Other dependencies must remain unchanged after acceptance.
            if row.path.replace('\\',"/").eq_ignore_ascii_case(&source.tag.replace('\\',"/")){continue;}
            let path=source.tags.join(core::safe_relative(&row.path).map_err(error)?);core::reject_links(&path).map_err(error)?;
            pins.insert(row.path,maps::hash_file(&path).map_err(error)?);
        }
        if maps::hash_file(&dependency).map_err(error)?!=identity{return Err("HUD dependency reader changed during review".into());}
        check_dependency_pins(&source.tags,&pins)?;return Ok(pins);
    }
    if operation.is_vehicle_flight(){
        let tag=format!("{}.scenario",source.project.scenario_path().map_err(error)?);
        let file=source.tags.join(core::safe_relative(&tag).map_err(error)?);core::reject_links(&file).map_err(error)?;
        let before=maps::hash_file(&file).map_err(error)?;require_flight_transport(state,source)?;
        if maps::hash_file(&file).map_err(error)?!=before{return Err("Native aircraft binding changed during flight review".into());}
        return Ok(BTreeMap::from([(tag,before)]));
    }
    if !operation.is_encounter_append()&&!operation.is_transport_append()&&!operation.is_faction_edit(){return Ok(BTreeMap::new());}
    let roots=if let recipes::Operation::AppendTransport{transport,..}=operation{
        if source.build.target!="gbx-custom"{return Err("Native transport append currently requires reviewed CE609 solo source".into());}
        let tag=format!("{}.vehicle",transport.tag_path);let listing=fields(state,&source.project,&source.tags,&tag)?;recipes::validate_transport_vehicle_source(&listing).map_err(error)?;
        vec![(tag,"vehi")]
    }else if let recipes::Operation::SquadTerminals{terminals,..}=operation{
        if source.build.target!="gbx-custom"{return Err("Native squad terminals require CE609 solo source".into());}let mut roots=vec![];for terminal in terminals{let tag=format!("{}.device_control",terminal.control_tag_path);recipes::validate_faction_control_source(&fields(state,&source.project,&source.tags,&tag)?).map_err(error)?;roots.push((tag,"ctrl"));}roots
    }else if let recipes::Operation::FactionKits{kits,..}=operation{
        if source.build.target!="gbx-custom"{return Err("Forerunner faction kits require reviewed CE609 solo source".into());}let mut roots=vec![];for kit in kits{let tag=format!("{}.device_control",kit.control_tag_path);recipes::validate_faction_control_source(&fields(state,&source.project,&source.tags,&tag)?).map_err(error)?;roots.push((tag,"ctrl"));for weapon in std::iter::once(&kit.profile.primary_weapon).chain(kit.profile.secondary_weapon.iter()){roots.push((format!("{weapon}.weapon"),"weap"));}}roots
    }else{operation.encounter_appends().map_err(error)?.into_iter().map(|entry|(format!("{}.actor_variant",entry.actor_path.replace('\\',"/")),"actv")).collect()};
    studio_native_source::require_unshared(state,&source.project.id)?;
    let output=source.build.output.as_ref().ok_or("Validated parent output is missing")?;
    if maps::inspect_header(output).map_err(error)?.scenario_type!=0{return Err("Native encounter append currently requires a reviewed singleplayer scenario. Multiplayer AI needs its engine-specific adapter.".into());}
    let(ok,value,stderr)=run(edit,&["-t".into(),source.tags.to_string_lossy().into_owned(),"-G".into(),"type".into(),source.tag.clone()])?;
    if !ok||value.trim()!="singleplayer"{return Err(format!("Working scenario is not a readable singleplayer source: {stderr}"));}
    let dependency=executable(state,&source.project,"invaderDependency")?;
    let dependency_hash=maps::hash_file(&dependency).map_err(error)?;
    let mut pins=BTreeMap::new();let mut actors=std::collections::BTreeSet::new();
    for (actor,class) in roots {
        if !actors.insert(actor.to_ascii_lowercase()){continue;}
        let file=source.tags.join(core::safe_relative(&actor).map_err(error)?);core::reject_links(&file).map_err(error)?;
        let hash=maps::hash_file(&file).map_err(error)?;verify_bytes(&source.tags,&actor,&hash)?;
        let _=fields(state,&source.project,&source.tags,&actor)?;
        let(ok,stdout,stderr)=run(&dependency,&recipes::Operation::Dependencies.arguments(&source.tags,class,&actor).map_err(error)?)?;
        if !ok{return Err(format!("Native actor/aircraft dependency traversal failed: {stderr}"));}
        let rows=recipes::dependency_lines(&stdout).map_err(error)?;
        if rows.len()>2047{return Err("Actor/aircraft closure exceeds2048checked native tags".into());}
        let mut current=BTreeMap::from([(actor,hash)]);
        for row in rows {
            if row.reported_broken{return Err(format!("Actor/aircraft dependency is broken: {}",row.path));}
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
pub(super) fn review_encounter_dependencies(state:&AppState,project:&Project,build:&BuildRecord,tags:&Path,operation:&recipes::Operation)->Reply<()> {
    let source=Source{project:project.clone(),build:build.clone(),tags:tags.to_path_buf(),tag:format!("{}.scenario",project.scenario_path().map_err(error)?),class:"scnr".into()};
    operation.validate(&source.class,&source.tag).map_err(error)?;
    let edit=executable(state,project,"invaderNative")?;
    operation_dependencies(state,&source,operation,&edit).map(|_|())
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
    if let Some(source_sha256)=receipt.operation.expected_source_sha256() {if !source_sha256.eq_ignore_ascii_case(&receipt.before_sha256){return Err("Retained native operation source identity differs from its original revision".into());}}
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
        let context_file=source.tags.join(core::safe_relative(&source.tag).map_err(error)?);
        let context_sha256=maps::hash_file(&context_file).map_err(error)?;
        let values = fields(&state, &source.project, &source.tags, &source.tag)?;
        if maps::hash_file(&context_file).map_err(error)?!=context_sha256{return Err("Native source changed during inspection; refresh before editing".into());}
        let mut actor_variants=vec![];let mut vehicle_sources=vec![];let mut control_sources=vec![];let mut weapon_sources=vec![];
        let can_append_encounter=source.class=="scnr"&&maps::inspect_header(source.build.output.as_ref().ok_or("Validated output is missing")?).map_err(error)?.scenario_type==0;
        if can_append_encounter {
            let inspection=if source.project.source.is_some(){inspect(&state,&source.project)?}else{Arc::new(maps::inspect_map(source.build.output.as_ref().unwrap(),None).map_err(error)?)};
            for tag in inspection.tags.iter().filter(|tag|tag.class=="actv") {
                if let Ok(relative)=core::safe_relative(&format!("{}.actor_variant",tag.path.replace('\\',"/"))) {
                    if source.tags.join(relative).is_file(){actor_variants.push(tag.path.replace('\\',"/"));}
                }
            }
            for tag in inspection.tags.iter().filter(|tag|tag.class=="vehi") {let path=tag.path.replace('\\',"/");if let Ok(relative)=core::safe_relative(&format!("{path}.vehicle")){if source.tags.join(relative).is_file(){vehicle_sources.push(path);}}}
            for entry in source.project.native_asset_imports.iter().filter(|entry|entry.tag_class=="vehi"){if let Ok(relative)=core::safe_relative(&format!("{}.vehicle",entry.native_path)){if source.tags.join(relative).is_file(){vehicle_sources.push(entry.native_path.clone());}}}
            for tag in inspection.tags.iter().filter(|tag|["ctrl","weap"].contains(&tag.class.as_str())){let path=tag.path.replace('\\',"/");let extension=if tag.class=="ctrl"{"device_control"}else{"weapon"};if let Ok(relative)=core::safe_relative(&format!("{path}.{extension}")){if source.tags.join(relative).is_file(){if tag.class=="ctrl"{control_sources.push(path);}else{weapon_sources.push(path);}}}}
            for entry in source.project.native_asset_imports.iter().filter(|e|["ctrl","weap"].contains(&e.tag_class.as_str())){let extension=if entry.tag_class=="ctrl"{"device_control"}else{"weapon"};if let Ok(relative)=core::safe_relative(&format!("{}.{extension}",entry.native_path)){if source.tags.join(relative).is_file(){if entry.tag_class=="ctrl"{control_sources.push(entry.native_path.clone());}else{weapon_sources.push(entry.native_path.clone());}}}}
            control_sources.sort();control_sources.dedup();weapon_sources.sort();weapon_sources.dedup();
            vehicle_sources.sort();vehicle_sources.dedup();actor_variants.sort();actor_variants.dedup();
        }
        let (scenario_squads,mut squad_edit_issue)=if source.class=="scnr" {
            match recipes::scenario_squad_choices(&values){Ok(rows)=>(rows,None),Err(issue)=>(vec![],Some(error(issue)))}
        }else{(vec![],None)};
        let protected_squad_encounters=if source.class=="scnr" {
            match encounter_review_metadata(&state,&source.project,&source.build){
                Ok((_,_,_,names,_,_,_,_,_,_))=>names.into_iter().collect(),
                Err(issue)=>{squad_edit_issue=Some(issue);vec![]}
            }
        }else{vec![]};
        let (scenario_start_squads,mut start_edit_issue)=if source.class=="scnr"{
            match recipes::scenario_squad_start_choices(&values){Ok(rows)=>(rows,None),Err(issue)=>(vec![],Some(error(issue)))}
        }else{(vec![],None)};
        let(guidance_objects,guidance_object_issue)=if source.class=="scnr"{match recipes::native_guidance_objects(&values){Ok(rows)=>(Some(rows),None),Err(issue)=>(None,Some(error(issue)))}}else{(None,None)};
        let(mission_source,mission_source_issue)=if source.class=="scnr"{match recipes::native_mission_source(&values){Ok(value)=>(Some(value),None),Err(issue)=>(None,Some(error(issue)))}}else{(None,None)};
        let(scenario_devices,device_edit_issue)=if source.class=="scnr"{match recipes::scenario_device_choices(&values){Ok(rows)=>(rows,studio_native_source::require_unshared(&state,&source.project.id).err()),Err(issue)=>(vec![],Some(error(issue)))}}else{(vec![],None)};
        let(scenario_volumes,trigger_edit_issue)=if source.class=="scnr"{match recipes::scenario_volume_choices(&values){Ok(rows)=>(rows,studio_native_source::require_unshared(&state,&source.project.id).err()),Err(issue)=>(vec![],Some(error(issue)))}}else{(vec![],None)};
        let(scenario_flags,flag_edit_issue)=if source.class=="scnr"{match recipes::scenario_flag_choices(&values){Ok(rows)=>(rows,studio_native_source::require_unshared(&state,&source.project.id).err()),Err(issue)=>(vec![],Some(error(issue)))}}else{(vec![],None)};
        let(scenario_cameras,camera_edit_issue)=if source.class=="scnr"{match recipes::scenario_camera_choices(&values){Ok(rows)=>(rows,studio_native_source::require_unshared(&state,&source.project.id).err()),Err(issue)=>(vec![],Some(error(issue)))}}else{(vec![],None)};
        let protected_command_lists=scenario_start_squads.iter().filter(|row|protected_squad_encounters.contains(&row.encounter_name.to_ascii_lowercase())).flat_map(|row|row.starts.iter().flatten()).filter_map(|point|point.command_list).filter_map(|index|u16::try_from(index).ok()).collect::<std::collections::BTreeSet<_>>().into_iter().collect();
        let(command_source,command_source_issue)=if source.class=="scnr"{match recipes::native_command_source(&values){Ok(rows)=>(Some(rows),studio_native_source::require_unshared(&state,&source.project.id).err()),Err(issue)=>(None,Some(error(issue)))}}else{(None,None)};
        let(scenario_command_lists,command_list_issue)=if source.class=="scnr"{match recipes::scenario_command_list_choices(&values){Ok(rows)=>(rows,None),Err(issue)=>(vec![],Some(error(issue)))}}else{(vec![],None)};
        let(scenario_combat,mut combat_edit_issue)=if source.class=="scnr"{match recipes::scenario_combat_choices(&values){Ok(rows)=>(rows,None),Err(issue)=>(vec![],Some(error(issue)))}}else{(vec![],None)};
        let(vehicle_seats,vehicle_seat_issue)=if source.class=="vehi"{match recipes::native_vehicle_seats(&values){Ok(rows)=>(Some(rows),None),Err(issue)=>(None,Some(error(issue)))}}else{(None,None)};
        let(vehicle_flight,vehicle_flight_issue)=if source.class=="vehi"{match require_flight_transport(&state,&source).and_then(|_|recipes::native_vehicle_flight(&values).map_err(error)){Ok(value)=>(Some(value),None),Err(issue)=>(None,Some(issue))}}else{(None,None)};
        let radius = recipes::number(&values, "bounding_radius").ok();
        let flare = recipes::number(&values, "rotation_function_scale").ok();
        let edit_issue = executable(&state, &source.project, "invaderNative").err();
        let repair_issue = executable(&state, &source.project, "invaderRepair").err();
        if source.class=="scnr"{squad_edit_issue=squad_edit_issue.or_else(||edit_issue.clone()).or_else(||studio_native_source::require_unshared(&state,&source.project.id).err());}
        let hud_arrays=recipes::hud_array_choices(&source.class,&values).map_err(error)?;
        let hud_structure_issue=if hud_arrays.is_empty(){None}else{
            edit_issue.clone().or_else(||executable(&state,&source.project,"invaderDependency").err())
                .or_else(||studio_native_source::require_unshared(&state,&source.project.id).err())
                .or_else(||(!hud_arrays.iter().any(|array|array.count.is_some_and(|count|count>0&&count<array.maximum))).then(||"No admitted HUD array has an existing element and spare native capacity.".into()))
        };
        let can_duplicate_hud=!hud_arrays.is_empty()&&hud_structure_issue.is_none();
        if source.class=="scnr"{start_edit_issue=start_edit_issue.or_else(||edit_issue.clone()).or_else(||squad_edit_issue.clone());combat_edit_issue=combat_edit_issue.or_else(||edit_issue.clone()).or_else(||squad_edit_issue.clone());}
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
        if hash!=context_sha256{return Err("Native source changed during context preparation; refresh before editing".into());}
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
            guidance_objects,guidance_object_issue,mission_source,mission_source_issue,vehicle_seats,vehicle_seat_issue,firefight_plan,firefight_plan_issue,hud_arrays,can_duplicate_hud,hud_structure_issue,scenario_squads,squad_edit_issue,protected_squad_encounters,scenario_start_squads,command_source,command_source_issue,protected_command_lists,scenario_devices,device_edit_issue,scenario_volumes,trigger_edit_issue,scenario_flags,flag_edit_issue,scenario_cameras,camera_edit_issue,scenario_command_lists,command_list_issue,start_edit_issue,scenario_combat,combat_edit_issue,
            source_target: source.build.target.clone(),
            project_id,
            build_id: source.build.id,
            tag: source.tag,
            class: source.class,
            tags_directory: source.tags,
            tag_sha256:hash,
            actor_variants,
            can_append_faction_kits:can_append_encounter&&source.build.target=="gbx-custom",control_sources,weapon_sources,can_append_transport:can_append_encounter&&source.build.target=="gbx-custom",vehicle_sources,can_append_encounter,
            vehicle_flight,vehicle_flight_issue,
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
#[serde(rename_all="camelCase")]
pub(super) struct CommandGeometryReview {build_id:String,tag_sha256:String,output_sha256:String,ground_drop:Option<f32>,points:Vec<maps::BspPointLocation>}
#[tauri::command]
pub(super) async fn native_scenario_geometry(app:tauri::AppHandle,project_id:String,expected_build_id:String,expected_tag_sha256:String,points:Vec<[f32;3]>,ground_drop:Option<f32>)->Reply<CommandGeometryReview>{
 tauri::async_runtime::spawn_blocking(move||{
  if points.is_empty()||points.len()>64||expected_tag_sha256.len()!=64||!expected_tag_sha256.bytes().all(|v|v.is_ascii_hexdigit()){return Err("Invalid native source-point review".into());}
  let state=app.state::<AppState>();let _guard=source_guard()?;require_idle(&state)?;let selected=source(&state,&project_id,None)?;
  if selected.build.id!=expected_build_id{return Err("The native source build changed; refresh and review the current route".into());}
  let file=selected.tags.join(core::safe_relative(&selected.tag).map_err(error)?);
  if maps::hash_file(&file).map_err(error)?!=expected_tag_sha256{return Err("Native scenario changed after route selection; refresh source".into());}
  let output=selected.build.output.as_ref().ok_or("Compiled BSP reference is unavailable")?;core::reject_links(output).map_err(error)?;
  let map=maps::inspect_map(output,None).map_err(error)?;if selected.build.sha256.as_deref()!=Some(map.sha256.as_str()){return Err("Compiled BSP reference no longer matches its validated build".into());}
  let result=maps::bsp_point_locations(output,&map,&points,ground_drop).map_err(error)?;
  if maps::hash_file(&file).map_err(error)?!=expected_tag_sha256||lock(&state.library)?.get(&project_id).map_err(error)?.fingerprint().map_err(error)?!=selected.project.fingerprint().map_err(error)?{return Err("Native source changed during BSP review; no result was accepted".into());}
  Ok(CommandGeometryReview{build_id:expected_build_id,tag_sha256:expected_tag_sha256,output_sha256:map.sha256,ground_drop,points:result})
 }).await.map_err(error)?
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
    Ok(Preview{actor_positions:receipt.operation.actor_start_positions().map_err(error)?,id:receipt.id.clone(),tag:receipt.tag.clone(),tool_id:receipt.tool_id.clone(),before_sha256:receipt.before_sha256.clone(),after_sha256:receipt.after_sha256.clone(),changed_bytes:receipt.changed_bytes,field_changes:receipt.field_changes.clone(),current_state:if current==receipt.before_sha256{"before"}else if current==receipt.after_sha256{"after"}else{"conflict"}.into(),detail:if matches!(receipt.operation,recipes::Operation::SquadTerminals{..}){"Native squad-selection controls and optional isolated readiness gates are appended. Existing source/indices and equipment profiles stay unchanged. Accept selects a source revision; Save/rebuild independently checks names, poses, interaction and groups. A readiness gate starts zero and requires reviewed objective HaloScript. Forerunner owns membership and settlement; this does not create scoped missions or prove gameplay. Native Restore recovers the previous source."}else if receipt.operation.is_faction_edit(){"Native faction terminals and equipment-only profiles were appended together. Originals/indices remain; new power/position groups are isolated and repeatable. Accept selects separate source; Save/rebuild independently checks profiles, names, poses and groups. Forerunner owns faction choice, gear reservation and persistence. Native Restore is separate from project Undo; gameplay is unverified."}else if receipt.operation.is_vehicle_flight(){"Only the requested native AI throttle, avoidance and pathfinding-radius fields may differ. The named aircraft and scenario binding remain pinned. Accept selects separate source; Save/rebuild checks all three compiled values. Native Restore is separate from project Undo. Actual pilot behavior, hull clearance, landing and flight require gameplay acceptance."}else if receipt.operation.is_transport_append(){"One named aircraft and three isolated zero-initialized signals are appended. Existing palette, placements, names, groups and script indices/bodies are retained. Dependencies are pinned. Accept selects separate source; Save/rebuild independently checks compiled vehicle pose/name/tag and signal indices/flags. Restore selects the exact original scenario. Pilot, routes, boarding, flight and settlement remain separate authoring/game gates."}else if receipt.operation.is_command_edit(){"Only the selected existing command actions, parameters, references, flags and point coordinates may differ. Names, command/point indices, AI bindings and unrelated source are preserved. Accept selects separate source; Save/rebuild verifies complete compiled command data. Native Restore is distinct from project Undo. AI execution/navigation requires gameplay testing."}else if receipt.operation.is_device_edit(){"Only this native device position/rotation may differ. Class, palette, name-table binding, flags, power/position groups and scripts remain unchanged. Accept selects separate source; Save/rebuild and independently inspect compiled placement. Native Restore is distinct from project Undo. Actual terminal use/doors/collision require gameplay acceptance."}else if receipt.operation.is_trigger_edit(){"Only this oriented trigger box geometry may differ. Names, indices and script references are preserved. Preview is temporary; Accept selects a separate source revision. Save/rebuild and inspect compiled bounds; Restore selects the original source. Trigger execution needs gameplay testing."}else if receipt.operation.is_flag_edit(){"Only the reviewed native flag is appended or its pose changed. Existing names, indices and unrelated source stay intact. Accept creates a separate source revision; Save/rebuild independently checks all compiled flags. Restore selects the preceding source. A flag is a stable location, not a trigger or proof of a visible waypoint."}else if matches!(&receipt.operation,recipes::Operation::CutsceneCamera{append:true,..}){"One uniquely named native camera point is appended at the end. All original points, indices, scripts and unrelated source remain. Accept selects separate source; Save/rebuild independently checks the compiled camera inventory/pose/lens. Restore selects the complete before-edit source. Cinematic/gameplay acceptance remains separate."}else if receipt.operation.is_camera_edit(){"Only this camera pose and lens may differ. Native point names, indices, scripts and other scenario fields stay unchanged. Accept selects a source revision; Save and rebuild to apply it. Restore selects the complete before-edit source. Editor preview is not native cinematic/gameplay acceptance."}else if receipt.operation.combat_target_key().is_some(){"Only the requested native AI source fields may differ: firing XYZ/group, squad tactical bits, reviewed squad/start behavior or patrol ordering/pose/weight/waits. Accept selects separate source; Restore selects the original before-edit source. Rebuild and independently inspect compiled positions/groups/patrols. Target compilers can expand search masks; source is never normalized automatically. Navigation, cover use and gameplay remain unverified."}else if receipt.operation.is_squad_start_edit(){"Only the selected AI starting position, requested facing and optional existing command-list binding may differ in exposed native fields. Command-list contents and all other starts stay unchanged. Accept selects separate source; rebuild and read back the compiled pose. Squad/start state fields, firing positions and navigation stay unchanged. Actual spawning, command execution, facing and reachability need gameplay validation."}else if receipt.operation.is_squad_count_edit(){"Only the selected native squad difficulty counts differ in the exposed fields. Accept selects a separate source revision; Build working tag edits compiles it and checks the resulting cache counts. Source-history restoration and gameplay are separate; opaque bytes are not certified."}else if matches!(receipt.operation,recipes::Operation::HudDuplicate{..}){"One existing HUD element is appended as an exposed-field-matched copy. Original elements and indices remain in place; dependency files are pinned. Accept selects a separate native source revision. Build working tag edits, then reopen its compiled HUD to edit the new layout. Opaque cells and actual HUD/game behavior still require independent acceptance."}else if receipt.operation.is_encounter_append(){"The reviewed native encounters are appended, existing exposed scenario fields are retained, and actor references are checked. Accept to select a separate source revision, then build it. Navigation, actual spawning and gameplay remain unverified; opaque bytes are not certified."}else{"Exactly the requested exposed native field differs; opaque bytes are not certified. Accept to create a separate complete source revision. The original source/cache stay unchanged."}.into()})
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
    let source=source(&state,&project_id,tag_id)?;if operation.is_faction_edit()||operation.is_transport_append()||operation.is_command_edit()||operation.is_device_edit()||operation.is_camera_edit()||operation.is_trigger_edit(){studio_native_source::require_unshared(&state,&source.project.id)?;}operation.validate(&source.class,&source.tag).map_err(error)?;
    if let recipes::Operation::CommandList{list,..}=&operation{
        let(_,_,_,protected,_,_,_,_,_,_)=encounter_review_metadata(&state,&source.project,&source.build)?;
        let inventory=fields(&state,&source.project,&source.tags,&source.tag)?;
        let starts=recipes::scenario_squad_start_choices(&inventory).map_err(error)?;
        if starts.iter().any(|row|protected.contains(&row.encounter_name.to_ascii_lowercase())&&row.starts.iter().flatten().any(|point|point.command_list==Some(list.index as i16))){return Err("This native command list is used by a recipe-owned group. Edit it through that recipe's source workflow; no command revision was admitted".into());}
    }
    if operation.is_scenario_ai_edit(){
        let (_,_,_,protected,_,_,_,_,_,_)=encounter_review_metadata(&state,&source.project,&source.build)?;
        let owned=if let Some(name)=operation.combat_encounter_name(){protected.contains(&name.to_ascii_lowercase())}
            else if let recipes::Operation::EncounterStartPosition{encounter_name,..}=&operation{protected.contains(&encounter_name.to_ascii_lowercase())}
            else{operation.squad_count_edits().map_err(error)?.iter().any(|edit|protected.contains(&edit.encounter_name.to_ascii_lowercase()))};
        if owned{
            return Err("This encounter has a preserved source recipe. Direct native AI edits cannot override its controller/encounter guards. Change source in its original authoring workflow; manually appended groups require source reconciliation.".into());
        }
    }
    let mut history:Vec<String>=lock(&state.library)?.setting(&history_key(&project_id)).map_err(error)?;
    if history.len()>=32{return Err("This map retains 32 managed previews. Review/recover existing revisions before creating more; no source was deleted.".into());}
    let exe=executable(&state,&source.project,operation.tool_id())?;let executable_sha256=maps::hash_file(&exe).map_err(error)?;
    let before_fields=fields(&state,&source.project,&source.tags,&source.tag)?;
    verify_firefight_plan(&source.project,&source.build,&before_fields,&operation)?;
    let source_dependencies=operation_dependencies(&state,&source,&operation,&exe)?;
    if let Some(field)=operation.field(){if recipes::number(&before_fields,field).map_err(error)?==operation.target().unwrap(){return Err("This native value already matches. No serialization or repair was performed.".into());}}
    if matches!(operation,recipes::Operation::LensFlareScaleRepair)&&!recipes::broken_lens_scale(recipes::number(&before_fields,"rotation_function_scale").map_err(error)?){return Err("This lens flare does not have the reviewed 360-to-zero repair precondition. No repair ran.".into());}
    let relative=core::safe_relative(&source.tag).map_err(error)?;let before=bounded_read(&source.tags.join(&relative),MAX_TAG)?;
    let before_sha256=hash_bytes(&before);
    if let Some(source_sha256)=operation.expected_source_sha256() {if !source_sha256.eq_ignore_ascii_case(&before_sha256){return Err("Native source changed after selection; refresh before editing. No writer ran.".into());}}
    let id=uuid::Uuid::new_v4().to_string();let directory=root(&state,&id)?;fs::create_dir(&directory).map_err(error)?;
    project::atomic_write(&directory.join("before.tag"),&before,false).map_err(error)?;
    let candidate=directory.join("candidate/tags");fs::create_dir_all(candidate.join(&relative).parent().unwrap()).map_err(error)?;project::atomic_write(&candidate.join(&relative),&before,false).map_err(error)?;
    // Reuse the reader path contract: this pinned Windows writer also needs
    // the extended-length root for deeply nested owned candidates.
    let candidate=native_tag_parser::reader_root(&candidate,&source.tag)?;
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
    if transaction::inventory(&candidate).map_err(error)?!=BTreeMap::from([(source.tag.replace('\\',"/"),after_sha256.clone())]){return Err("The native operation changed unexpected candidate files; no revision was selected".into());}
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
    let project=lock(&state.library)?.get(&project_id).map_err(error)?;if receipt.operation.is_faction_edit()||receipt.operation.is_transport_append()||receipt.operation.is_command_edit()||receipt.operation.is_device_edit()||receipt.operation.is_camera_edit()||receipt.operation.is_trigger_edit(){studio_native_source::require_unshared(&state,&project.id)?;}let (build,current)=runtime_workbench::native_operation_source(&state,&project)?;
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
    let expected_hash=if restore{&receipt.before_sha256}else{&receipt.after_sha256};let mut wanted=baseline.clone();wanted.insert(receipt.tag.replace('\\',"/"),expected_hash.clone());
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
