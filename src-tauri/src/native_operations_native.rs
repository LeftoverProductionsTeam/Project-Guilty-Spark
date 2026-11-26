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
#[serde(untagged)]
enum ReviewedFields {
    // Existing receipts stored the entire listing as a string.
    Inline(String),
    Digest { sha256: String },
}

impl ReviewedFields {
    fn digest(fields: &str) -> Self {
        Self::Digest { sha256: hash_bytes(fields.as_bytes()) }
    }

    fn matches(&self, fields: &str) -> bool {
        match self {
            Self::Inline(saved) => saved == fields,
            Self::Digest { sha256 } => *sha256 == hash_bytes(fields.as_bytes()),
        }
    }
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
    #[serde(default)]
    actor_import:Option<core::native_asset_imports::Binding>,
    #[serde(default)]
    imported_dependencies:BTreeMap<String,String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    generated_dependencies: BTreeMap<String, String>,
    tool_id: String,
    executable_sha256: String,
    before_sha256: String,
    after_sha256: String,
    before_fields: ReviewedFields,
    after_fields: ReviewedFields,
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
    check_dependency_pins(&tags,&receipt.source_dependencies)?;check_dependency_pins(&tags,&receipt.imported_dependencies)?;
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
fn encounter_review_metadata(state:&AppState,project:&Project,build:&BuildRecord,protect_reviewed_appends:bool)->Reply<(bool,bool,Vec<recipes::Operation>,std::collections::BTreeSet<String>,bool,bool,bool,bool,bool,std::collections::BTreeSet<String>,std::collections::BTreeSet<String>)> {
    let mut machine_tags=std::collections::BTreeSet::new();
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
        // Reviewed append expectations protect native fields from later edits, but
        // do not assign gameplay ownership. A manually authored dedicated pilot
        // can be bound to a controller; generated wave groups remain owned.
        if protect_reviewed_appends||matches!(operation,recipes::Operation::AppendEncounters{source_rules:Some(_),..}) {
            for entry in operation.encounter_appends().map_err(error)?{protected.insert(entry.name.to_ascii_lowercase());}
        }
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
        if let Some(snapshot)=&receipt.scenario_squad_readback { machine_tags.extend(snapshot.machine_settings.keys().cloned()); }
        let had_snapshot=receipt.scenario_squad_readback.is_some();
        let had_starts=receipt.scenario_squad_readback.as_ref().is_some_and(|snapshot|snapshot.include_starts);
        for operation in receipt.encounter_expectations.iter().chain(receipt.expected_encounter.iter()){inspect_operation(operation,&mut counts,&mut starts,&mut combat,&mut protected,&mut cameras,&mut volumes,&mut devices,&mut commands,&mut transports)?;}
        if let Some(generated)=&receipt.generated_firefight{
            inspect_operation(&generated.operation,&mut counts,&mut starts,&mut combat,&mut protected,&mut cameras,&mut volumes,&mut devices,&mut commands,&mut transports)?;
            for entry in generated.operation.encounter_appends().map_err(error)?{protected.insert(entry.name.to_ascii_lowercase());}
        }
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
        if matches!(receipt.operation,recipes::Operation::MachineSettings{..}) { machine_tags.insert(receipt.tag.clone()); }
        if receipt.operation.is_vehicle_flight(){flight_tags.insert(receipt.tag.replace('\\',"/").to_ascii_lowercase());}
        receipt.operation.validate(&receipt.class,&receipt.tag).map_err(error)?;
        inspect_operation(&receipt.operation,&mut counts,&mut starts,&mut combat,&mut protected,&mut cameras,&mut volumes,&mut devices,&mut commands,&mut transports)?;
    }
    Ok((counts,starts,combat,protected,cameras,volumes,devices,commands,transports,flight_tags,machine_tags))
}
pub(super) fn protected_mission_encounters(state:&AppState,project:&Project,build:&BuildRecord)->Reply<std::collections::BTreeSet<String>>{Ok(encounter_review_metadata(state,project,build,true)?.3)}
/// Controller binding does not rewrite encounter fields. Only recipe/wave
/// ownership blocks it; native mutation guards retain the full reviewed set.
pub(super) fn protected_transport_groups(state:&AppState,project:&Project,build:&BuildRecord)->Reply<std::collections::BTreeSet<String>>{Ok(encounter_review_metadata(state,project,build,false)?.3)}
pub(super) fn squad_readback_targets(state:&AppState,project:&Project,build:&BuildRecord,tags:&Path,force_cameras:bool)->Reply<Option<recipes::ScenarioSquadReadback>> {
    let (required,include_starts,combat,_,include_cameras,include_volumes,include_devices,include_commands,include_transports,flight_tags,machine_tags)=encounter_review_metadata(state,project,build,true)?;
    let include_cameras=include_cameras||force_cameras;
    let include_objects=project.studio.as_ref().is_some_and(|studio|studio.missions.iter().any(|beat|beat.guidance.as_ref().is_some_and(|g|g.object.is_some())));
    if !required&&!include_cameras&&!include_volumes&&!include_devices&&!include_commands&&!include_transports&&!include_objects&&machine_tags.is_empty(){return Ok(None);}
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
    let device_groups = if include_devices { Some(recipes::scenario_device_group_choices(&listing).map_err(error)?) } else { None };
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
    let mut machine_settings = BTreeMap::new();
    for tag in machine_tags {
        let listing = fields(state, project, tags, &tag)?;
        machine_settings.insert(tag, recipes::native_machine_settings(&listing).map_err(error)?);
    }
    let snapshot=recipes::ScenarioSquadReadback{machine_settings,named_objects,cutscene_flags,extraction_squads:if extraction_squads.is_empty(){None}else{Some(extraction_squads)},faction_kits:if faction_kits.is_empty(){None}else{Some(faction_kits)},transports,command_lists,source_sha256,squads,include_starts,combat,cameras,volumes,devices,device_groups};
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
    machine_settings:Option<recipes::NativeMachineSettings>,machine_settings_issue:Option<String>,
    control_settings:Option<recipes::NativeControlSettings>,control_settings_issue:Option<String>,control_requires_player_activation:bool,
    bounding_radius: Option<f64>,
    vehicle_flight:Option<recipes::VehicleFlightTuning>,
    vehicle_flight_issue:Option<String>,
    lens_flare_scale: Option<f64>,
    actor_variants:Vec<String>,
    can_append_encounter:bool,
    can_append_transport:bool,vehicle_sources:Vec<String>,
    can_append_faction_kits:bool,can_append_squad_terminals:bool,regional_faction_source:bool,control_sources:Vec<String>,weapon_sources:Vec<String>,biped_sources:Vec<String>,
    faction_kits:Vec<recipes::NativeFactionSnapshot>,faction_body_issue:Option<String>,
    scenario_squads:Vec<recipes::ScenarioSquadChoice>,
    scenario_start_squads:Vec<recipes::ScenarioSquadChoice>,
    scenario_player_starts:Vec<recipes::ScenarioStartChoice>,player_start_edit_issue:Option<String>,player_start_limit:usize,
    guidance_objects:Option<Vec<maps::NativeNamedObject>>,guidance_object_issue:Option<String>,
    mission_source:Option<recipes::NativeMissionSource>,mission_source_issue:Option<String>,
    scenario_devices:Vec<recipes::NativeDevicePlacement>,
    scenario_device_groups:Option<Vec<recipes::NativeDeviceGroupChoice>>,
    scenario_control_names:Option<Vec<String>>,
    scenario_control_name_issue:Option<String>,
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
    checked_read(state,project,tags,tag,|parser,tags,tag|{let(valid,text,cut)=native_tag_parser::review_fields(parser,tags,tag)?;if cut{return Err("Native source review exceeded its field limit or timed out; no source edit was accepted. Use the native kit for this larger tag.".into());}if !valid{return Err(format!("The reviewed native reader could not validate this tag: {}",text.chars().take(240).collect::<String>()));}Ok(text)})
}
pub(super) fn animation_seats(state:&AppState,project:&Project,tags:&Path,tag:&str)->Reply<Vec<String>>{
    checked_read(state,project,tags,tag,native_tag_parser::animation_seats)
}
pub(super) fn weapon_animation_label(state:&AppState,project:&Project,tags:&Path,tag:&str)->Reply<String>{
    checked_read(state,project,tags,tag,native_tag_parser::weapon_animation_label)
}
pub(super) fn standing_weapon_labels(state:&AppState,project:&Project,tags:&Path,tag:&str)->Reply<Vec<String>>{
    checked_read(state,project,tags,tag,native_tag_parser::standing_weapon_labels)
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
fn checked_actor_import(state:&AppState,source:&Source,operation:&recipes::Operation,binding:&core::native_asset_imports::Binding)->Reply<(Project,PathBuf)> {
    if source.class!="scnr"||source.project.source.is_none()||source.project.quick_forge.is_some()||!operation.is_encounter_append() {
        return Err("Imported actor review requires the existing recovered solo encounter workflow".into());
    }
    let path=binding.native_path.replace('\\',"/");
    if !operation.encounter_appends().map_err(error)?.iter().any(|entry|entry.actor_path.replace('\\',"/").eq_ignore_ascii_case(&path)) {
        return Err("The imported actor is not used by this encounter proposal".into());
    }
    let mut selected=source.project.clone();selected.native_asset_imports=vec![binding.clone()];
    asset_import_native::guard_import_sources(state,&selected)?;
    let tags=core::native_asset_imports::checked_actor_source(&state.root,&selected,binding).map_err(error)?;
    Ok((selected,tags))
}
fn player_start_cache_version(build: &core::project::BuildRecord) -> Reply<u32> {
    if build.target=="mcc-cea" {
        let output=build.output.as_ref().ok_or("Validated MCC output is missing")?;
        return Ok(maps::inspect_header(output).map_err(error)?.version);
    }
    Ok(609)
}

fn regional_faction_source(source: &Source) -> Reply<bool> {
    if source.class != "scnr" || source.build.target != "mcc-cea" { return Ok(false); }
    let output = source.build.output.as_ref().ok_or("Validated parent output is missing")?;
    let header = maps::inspect_header(output).map_err(error)?;
    if header.version != 13 || header.scenario_type != 1 || header.extended { return Ok(false); }
    let map = maps::inspect_map(output, None).map_err(error)?;
    if source.build.sha256.as_deref() != Some(map.sha256.as_str()) {
        return Err("The MCC13 faction source changed after validation".into());
    }
    Ok(recipes::megaworld_hub_starts(output, &map).map_err(error)?.is_some())
}

fn operation_dependencies(state:&AppState,source:&Source,operation:&recipes::Operation,edit:&Path,actor_import:Option<(&core::native_asset_imports::Binding,&Path)>)->Reply<BTreeMap<String,String>> {
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
    let regional = matches!(operation,
        recipes::Operation::FactionBody { .. } | recipes::Operation::FactionKits { .. }
        | recipes::Operation::FactionService { .. } | recipes::Operation::SquadTerminals { .. })
        && regional_faction_source(source)?;
    let mut reviewed_arms = BTreeMap::new();
    let roots=if let recipes::Operation::AppendTransport{transport,regional_mcc,..}=operation{
        let admitted=if *regional_mcc { regional_faction_source(source)? } else { source.build.target=="gbx-custom" };
        if !admitted { return Err("Native transport append needs CE609 solo or reviewed MCC13 MegaWorld working source".into()); }
        if let Some(slot) = transport.owner_bsp {
            if !*regional_mcc { return Err("Explicit aircraft BSP ownership is only available for native regional MCC13.".into()); }
            let output = source.build.output.as_ref().ok_or("Validated parent output is missing")?;
            let map = maps::inspect_map(output, None).map_err(error)?;
            let rows = maps::bsp_point_locations(output, &map, &[transport.position], Some(1.)).map_err(error)?;
            if rows[0].bsps != [u16::from(slot)] || !rows[0].ground.iter().any(|ground| ground.bsp == u16::from(slot)) {
                return Err(format!("Place the aircraft on supported ground inside only BSP {slot}."));
            }
        }
        let tag=format!("{}.vehicle",transport.tag_path);let listing=fields(state,&source.project,&source.tags,&tag)?;recipes::validate_transport_vehicle_source(&listing).map_err(error)?;
        vec![(tag,"vehi")]
    }else if let recipes::Operation::SquadTerminals{terminals,..}=operation{
        if source.build.target != "gbx-custom" && !regional {
            return Err("Native squad terminals require CE609 solo or reviewed MCC13 MegaWorld source".into());
        }
        let mut roots = Vec::new();
        for terminal in terminals {
            let tag = format!("{}.device_control", terminal.control_tag_path);
            recipes::validate_faction_control_source(&fields(state, &source.project, &source.tags, &tag)?).map_err(error)?;
            roots.push((tag, "ctrl"));
        }
        roots
    }else if let recipes::Operation::FactionService{service,..}=operation{
        if !regional{return Err("Faction services require reviewed MCC13 multiplayer source with both MegaWorld hubs".into());}
        let tag=format!("{}.device_control",service.control_tag_path.replace('\\',"/"));
        recipes::validate_faction_control_source(&fields(state,&source.project,&source.tags,&tag)?).map_err(error)?;
        let output=source.build.output.as_ref().ok_or("Validated parent output is missing")?;
        let map=maps::inspect_map(output,None).map_err(error)?;
        let hubs=recipes::megaworld_hub_starts(output,&map).map_err(error)?.ok_or("Verified MegaWorld hubs required")?;
        let hub=&hubs[usize::from(service.faction=="covenant")];
        let points=maps::bsp_point_locations(output,&map,&[service.position],Some(1.)).map_err(error)?;
        if matches!(service.service.as_str(),"fieldPickup"|"groundCall") {
            let [bsp]=points[0].bsps.as_slice() else {return Err("Place the field control inside one owning BSP.".into());};
            if !points[0].ground.iter().any(|ground|ground.bsp==*bsp){return Err("Place the field control on a supported surface.".into());}
        } else if points[0].bsps != [hub.bsp_index] || !points[0].ground.iter().any(|ground| ground.bsp==hub.bsp_index) {
            return Err(format!("Place the service on a supported surface within {} (BSP {}).",hub.name,hub.bsp_index));
        }
        vec![(tag,"ctrl")]
    }else if let recipes::Operation::FactionBody{body,..}=operation{
        if source.build.target!="gbx-custom" && !regional{return Err("Faction bodies require reviewed CE609 solo or MCC13 multiplayer source with verified MegaWorld hubs".into());}
        let mut roots = vec![(format!("{}.biped", body.biped_tag_path.replace('\\', "/")), "bipd")];
        if body.include_first_person_arms {
            let scenario = fields(state, &source.project, &source.tags, &source.tag)?;
            let kit = recipes::native_faction_snapshots(&scenario).map_err(error)?.into_iter()
                .find(|row| row.kit.faction == body.faction).ok_or("The selected faction has no native equipment kit")?;
            let weapons = recipes::verify_faction_arms_source(body, &kit.kit.profile, |tag| {
                let file = source.tags.join(core::safe_relative(tag)?);
                core::reject_links(&file)?;
                reviewed_arms.insert(tag.to_owned(), maps::hash_file(&file)?);
                fields(state, &source.project, &source.tags, tag).map_err(core::SparkError::Invalid)
            }).map_err(error)?;
            roots.push((format!("{}.scenery", body.arms_path()), "scen"));
            roots.extend(weapons.into_iter().map(|weapon| (weapon, "weap")));
        }
        roots
    }else if let recipes::Operation::FactionKits{kits,replace_existing_profiles,..}=operation{
        if source.build.target!="gbx-custom" && !regional{return Err("Faction kits require reviewed CE609 solo or MCC13 multiplayer source with verified MegaWorld hubs".into());}
        let current = if *replace_existing_profiles {
            recipes::native_faction_snapshots(&fields(state,&source.project,&source.tags,&source.tag)?).map_err(error)?
        } else { vec![] };
        let mut roots=vec![];
        for kit in kits {
            let tag=format!("{}.device_control",kit.control_tag_path);
            recipes::validate_faction_control_source(&fields(state,&source.project,&source.tags,&tag)?).map_err(error)?;
            roots.push((tag,"ctrl"));
            for weapon in std::iter::once(&kit.profile.primary_weapon).chain(kit.profile.secondary_weapon.iter()){
                roots.push((format!("{}.weapon",weapon.replace('\\',"/")),"weap"));
            }
            if let Some(binding) = current.iter().find(|row| row.kit.faction == kit.faction)
                .and_then(|row| row.body.as_ref()).filter(|body| body.first_person_arms) {
                let body = recipes::NativeFactionBody { faction:kit.faction.clone(), biped_tag_path:binding.biped_tag_path.clone(),
                    permutation:binding.permutation, include_first_person_arms:true, use_player_physics:false };
                recipes::verify_faction_arms_source(&body, &kit.profile, |tag| {
                    let file = source.tags.join(core::safe_relative(tag)?);
                    core::reject_links(&file)?;
                    reviewed_arms.insert(tag.to_owned(), maps::hash_file(&file)?);
                    fields(state, &source.project, &source.tags, tag).map_err(core::SparkError::Invalid)
                }).map_err(error)?;
            }
        }
        roots
    }else{operation.encounter_appends().map_err(error)?.into_iter().map(|entry|(format!("{}.actor_variant",entry.actor_path.replace('\\',"/")),"actv")).collect()};
    studio_native_source::require_unshared(state,&source.project.id)?;
    let output=source.build.output.as_ref().ok_or("Validated parent output is missing")?;
    let expected_type = if regional { "multiplayer" } else { "singleplayer" };
    if maps::inspect_header(output).map_err(error)?.scenario_type != u16::from(regional) {
        return Err(format!("This native edit requires a reviewed {expected_type} scenario."));
    }
    let(ok,value,stderr)=run(edit,&["-t".into(),source.tags.to_string_lossy().into_owned(),"-G".into(),"type".into(),source.tag.clone()])?;
    if !ok||value.trim()!=expected_type{return Err(format!("Working scenario is not a readable {expected_type} source: {stderr}"));}
    let dependency=executable(state,&source.project,"invaderDependency")?;
    let dependency_hash=maps::hash_file(&dependency).map_err(error)?;
    let mut pins=BTreeMap::new();let mut actors=std::collections::BTreeSet::new();
    for (actor,class) in roots {
        if !actors.insert(actor.to_ascii_lowercase()){continue;}
        let actor_root=actor_import.filter(|(binding,_)|class=="actv"&&actor.eq_ignore_ascii_case(&format!("{}.actor_variant",binding.native_path.replace('\\',"/")))).map(|(_,root)|root).unwrap_or(&source.tags);
        let file=actor_root.join(core::safe_relative(&actor).map_err(error)?);core::reject_links(&file).map_err(error)?;
        let hash=maps::hash_file(&file).map_err(error)?;verify_bytes(actor_root,&actor,&hash)?;
        let _=fields(state,&source.project,actor_root,&actor)?;
        let(ok,stdout,stderr)=run(&dependency,&recipes::Operation::Dependencies.arguments(actor_root,class,&actor).map_err(error)?)?;
        if !ok{return Err(format!("Native actor/aircraft dependency traversal failed: {stderr}"));}
        let rows=recipes::dependency_lines(&stdout).map_err(error)?;
        if rows.len()>2047{return Err("Actor/aircraft closure exceeds2048checked native tags".into());}
        let mut current=BTreeMap::from([(actor,hash)]);
        for row in rows {
            if row.reported_broken{return Err(format!("Actor/aircraft dependency is broken: {}",row.path));}
            let path=actor_root.join(core::safe_relative(&row.path).map_err(error)?);core::reject_links(&path).map_err(error)?;
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
    check_dependency_pins(&source.tags, &reviewed_arms)?;
    if maps::hash_file(&dependency).map_err(error)?!=dependency_hash{return Err("The dependency reader changed during review".into());}
    let prefix=actor_import.map(|(binding,_)|format!("gs_assets_{}/",binding.id.replace('-',"")));
    let original=pins.iter().filter(|(path,_)|prefix.as_ref().is_none_or(|prefix|!path.starts_with(prefix))).map(|(p,h)|(p.clone(),h.clone())).collect();
    check_dependency_pins(&source.tags,&original)?;
    if let Some((_,root))=actor_import {let imported=pins.iter().filter(|(path,_)|prefix.as_ref().is_some_and(|prefix|path.starts_with(prefix))).map(|(p,h)|(p.clone(),h.clone())).collect();check_dependency_pins(root,&imported)?;}
    Ok(pins)
}
// Use the existing native mission snapshots, not names guessed by the UI.
fn control_requires_player_activation(state:&AppState,project:&Project,tags:&Path,tag:&str)->Reply<bool>{
    let scenario=format!("{}.scenario",project.scenario_path().map_err(error)?);let file=tags.join(core::safe_relative(&scenario).map_err(error)?);core::reject_links(&file).map_err(error)?;let sha=maps::hash_file(&file).map_err(error)?;
    let values=fields(state,project,tags,&scenario)?;if maps::hash_file(&file).map_err(error)?!=sha{return Err("Native scenario changed during terminal-role review; refresh source".into());}
    let required=recipes::native_faction_snapshots(&values).map_err(error)?.into_iter().map(|row|row.kit.control_tag_path).chain(recipes::native_squad_terminal_snapshots(&values).map_err(error)?.into_iter().map(|row|row.terminal.control_tag_path));
    let selected=tag.replace('\\',"/");Ok(required.into_iter().any(|path|format!("{}.device_control",path.replace('\\',"/")).eq_ignore_ascii_case(&selected)))
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
    operation_dependencies(state,&source,operation,&edit,None).map(|_|())
}
fn faction_player_copy_paths(operation: &recipes::Operation) -> Reply<Vec<(String, String)>> {
    let recipes::Operation::FactionBody { body, .. } = operation else { return Ok(vec![]) };
    if !body.use_player_physics { return Ok(vec![]) }
    let target = body.playable_copy().map_err(error)?;
    let mut paths = vec![(
        format!("{}.biped", body.biped_tag_path.replace('\\', "/")),
        format!("{}.biped", target.biped_tag_path),
    )];
    if body.include_first_person_arms {
        for extension in ["gbxmodel", "scenery"] {
            paths.push((format!("{}.{extension}", body.arms_path()), format!("{}.{extension}", target.arms_path())));
        }
    }
    Ok(paths)
}

fn stage_faction_player_copy(
    state: &AppState, source: &Source, operation: &recipes::Operation,
    writer: &Path, candidate: &Path, source_pins: &BTreeMap<String, String>,
) -> Reply<(BTreeMap<String, String>, Vec<recipes::FieldDifference>)> {
    let paths = faction_player_copy_paths(operation)?;
    let mut generated = BTreeMap::new();
    let mut differences = vec![];
    for (original, revised) in paths {
        let from = source.tags.join(core::safe_relative(&original).map_err(error)?);
        let to = candidate.join(core::safe_relative(&revised).map_err(error)?);
        core::reject_links(&from).map_err(error)?;
        let bytes = bounded_read(&from, MAX_TAG)?;
        if source_pins.get(&original) != Some(&hash_bytes(&bytes)) {
            return Err("The reviewed faction asset changed before its playable copy was made".into());
        }
        fs::create_dir_all(to.parent().ok_or("Native playable copy has no parent")?).map_err(error)?;
        project::atomic_write(&to, &bytes, false).map_err(error)?;

        // Preserve the animation, collision and weapon setup on the original tags.
        let change = if revised.ends_with(".biped") {
            Some(("biped_flags.uses_player_physics", "1".to_owned()))
        } else {
            revised.strip_suffix(".scenery").map(|path| ("model", format!("{path}.gbxmodel")))
        };
        if let Some((key, value)) = change {
            let tags = native_tag_parser::reader_root(candidate, &revised)?;
            let args = |verb: &str, setting: Option<&str>| {
                let mut args = vec!["-t".into(), tags.to_string_lossy().into_owned(), verb.into(), key.into()];
                args.extend(setting.map(str::to_owned));
                args.push(revised.clone());
                args
            };
            let (ok, before, problem) = run(writer, &args("-G", None))?;
            if !ok { return Err(format!("Native copied faction tag could not be read: {problem}")); }
            let (ok, out, problem) = run(writer, &args("-S", Some(&value)))?;
            if !ok || out.lines().chain(problem.lines()).any(|line| line.trim().starts_with("Error:")) {
                return Err(format!("Invader rejected the playable faction copy: {problem}"));
            }
            let (ok, after, problem) = run(writer, &args("-G", None))?;
            if !ok { return Err(format!("Native playable copy readback failed: {problem}")); }
            if !after.trim().replace('\\', "/").eq_ignore_ascii_case(&value) {
                return Err("Native playable copy readback differs from the reviewed field".into());
            }
            differences.push(recipes::FieldDifference {
                before: format!("{original} · {key} = {}", before.trim()),
                after: format!("{revised} · {key} = {value}"),
            });
        }
        let hash = maps::hash_file(&to).map_err(error)?;
        let existing = source.tags.join(core::safe_relative(&revised).map_err(error)?);
        core::reject_links(&existing).map_err(error)?;
        if existing.exists() && maps::hash_file(&existing).map_err(error)? != hash {
            return Err(format!("A different source tag already exists at {revised}. It was preserved."));
        }
        generated.insert(revised, hash);
    }
    if !generated.is_empty() {
        // Read the tags again independently of the writer's status.
        let recipes::Operation::FactionBody { body, .. } = operation else { unreachable!() };
        let selected = format!("{}.biped", body.biped_tag_path.replace('\\', "/"));
        let copied = format!("{}.biped", body.playable_copy().map_err(error)?.biped_tag_path);
        let before = fields(state, &source.project, &source.tags, &selected)?;
        let after = fields(state, &source.project, candidate, &copied)?;
        recipes::verify_playable_biped_fields(&before, &after).map_err(error)?;
    }
    Ok((generated, differences))
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
    let paths = faction_player_copy_paths(&receipt.operation)?;
    if receipt.generated_dependencies.len() != paths.len() || paths.iter().any(|(_, path)| !receipt.generated_dependencies.contains_key(path)) {
        return Err("Retained playable source copy paths differ from the reviewed body".into());
    }
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
        let mut actor_variants=vec![];let mut vehicle_sources=vec![];let mut control_sources=vec![];let mut weapon_sources=vec![];let mut biped_sources=vec![];
        let can_append_encounter=source.class=="scnr"&&maps::inspect_header(source.build.output.as_ref().ok_or("Validated output is missing")?).map_err(error)?.scenario_type==0;
        let (regional_faction_source, regional_issue) = match regional_faction_source(&source) {
            Ok(chosen) => (chosen, None),
            Err(issue) => (false, Some(issue)),
        };
        if can_append_encounter || regional_faction_source {
            let inspection=if source.project.source.is_some(){inspect(&state,&source.project)?}else{Arc::new(maps::inspect_map(source.build.output.as_ref().unwrap(),None).map_err(error)?)};
            for tag in inspection.tags.iter().filter(|tag|tag.class=="actv") {
                if let Ok(relative)=core::safe_relative(&format!("{}.actor_variant",tag.path.replace('\\',"/"))) {
                    if source.tags.join(relative).is_file(){actor_variants.push(tag.path.replace('\\',"/"));}
                }
            }
            for path in recipes::scenario_actor_sources(&values).map_err(error)? {if source.tags.join(core::safe_relative(&format!("{path}.actor_variant")).map_err(error)?).is_file(){actor_variants.push(path);}}
            // Restoring an encounter removes its palette row, not its accepted
            // source dependencies. Keep those owned actors selectable so the
            // creator can revise a pose without extracting a duplicate namespace.
            for relative in transaction::inventory(&source.tags).map_err(error)?.keys() {
                if let Some(path)=relative.strip_suffix(".biped"){biped_sources.push(path.to_string());}
                if let Some(path)=relative.strip_suffix(".actor_variant") {
                    if actor_variants.len()>=4096{return Err("Native actor source inventory exceeds4096choices".into());}
                    actor_variants.push(path.to_string());
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
            match encounter_review_metadata(&state,&source.project,&source.build,true){
                Ok((_,_,_,names,..))=>names.into_iter().collect(),
                Err(issue)=>{squad_edit_issue=Some(issue);vec![]}
            }
        }else{vec![]};
        let (scenario_start_squads,mut start_edit_issue)=if source.class=="scnr"{
            match recipes::scenario_squad_start_choices(&values){Ok(rows)=>(rows,None),Err(issue)=>(vec![],Some(error(issue)))}
        }else{(vec![],None)};
        let(guidance_objects,guidance_object_issue)=if source.class=="scnr"{match recipes::native_guidance_objects(&values){Ok(rows)=>(Some(rows),None),Err(issue)=>(None,Some(error(issue)))}}else{(None,None)};
        let(mission_source,mission_source_issue)=if source.class=="scnr"{match recipes::native_mission_source(&values){Ok(value)=>(Some(value),None),Err(issue)=>(None,Some(error(issue)))}}else{(None,None)};
        let(scenario_player_starts,player_start_edit_issue)=if source.class=="scnr"{match recipes::scenario_player_start_choices(&values){Ok(rows)=>(rows,if source.project.quick_forge.is_some(){Some("Use the BSP Workshop for recipe-owned player spawns".into())}else{studio_native_source::require_unshared(&state,&source.project.id).err()}),Err(issue)=>(vec![],Some(error(issue)))}}else{(vec![],None)};
        let scenario_device_groups=if source.class=="scnr"{recipes::scenario_device_group_choices(&values).ok()}else{None};
        let (scenario_control_names, scenario_control_name_issue) = if source.class == "scnr" {
            match recipes::scenario_custom_control_names(&values, &source.tags) {
                Ok(rows) => (Some(rows), None),
                Err(issue) => (None, Some(error(issue))),
            }
        } else { (None, None) };
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
        let (machine_settings,machine_settings_issue) = if source.class == "mach" {
            match recipes::native_machine_settings(&values) {
                Ok(value) => (Some(value), edit_issue.clone().or_else(||studio_native_source::require_unshared(&state,&source.project.id).err())),
                Err(issue) => (None, Some(error(issue))),
            }
        } else { (None,None) };
        let(control_settings,control_settings_issue)=if source.class=="ctrl"{match recipes::native_control_settings(&values){Ok(value)=>(Some(value),edit_issue.clone().or_else(||studio_native_source::require_unshared(&state,&source.project.id).err())),Err(issue)=>(None,Some(error(issue)))}}else{(None,None)};
        if source.class=="scnr"{squad_edit_issue=squad_edit_issue.or_else(||edit_issue.clone()).or_else(||studio_native_source::require_unshared(&state,&source.project.id).err());}
        let control_requires_player_activation=source.class=="ctrl"&&control_requires_player_activation(&state,&source.project,&source.tags,&source.tag)?;
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
        let regional_hub_edits = regional_faction_source && edit_issue.is_none()
            && studio_native_source::require_unshared(&state, &source.project.id).is_ok();
        let can_append_squad_terminals = (can_append_encounter && source.build.target == "gbx-custom")
            || regional_hub_edits;
        let can_append_faction_kits = can_append_squad_terminals;
        let (faction_kits,faction_body_issue)=if source.class=="scnr"&&(source.build.target=="gbx-custom" || regional_faction_source) {
            match recipes::native_faction_snapshots(&values){Ok(kits)=>(kits,None),Err(issue)=>(vec![],Some(error(issue)))}
        }else{(vec![],regional_issue)};
        let (firefight_plan,firefight_plan_issue)=if can_append_encounter {
            match recipes::saved_firefight_encounters(&source.project,source.build.sha256.as_deref().unwrap_or(""),&values){Ok(plan)=>(Some(plan),None),Err(issue)=>(None,Some(error(issue)))}
        }else{(None,None)};
        let player_start_limit=recipes::native_player_start_limit(player_start_cache_version(&source.build)?);
        Ok(Context {
            player_start_limit,guidance_objects,guidance_object_issue,mission_source,mission_source_issue,vehicle_seats,vehicle_seat_issue,firefight_plan,firefight_plan_issue,hud_arrays,can_duplicate_hud,hud_structure_issue,scenario_squads,squad_edit_issue,protected_squad_encounters,scenario_start_squads,scenario_player_starts,player_start_edit_issue,command_source,command_source_issue,protected_command_lists,scenario_devices,scenario_device_groups,scenario_control_names,scenario_control_name_issue,device_edit_issue,scenario_volumes,trigger_edit_issue,scenario_flags,flag_edit_issue,scenario_cameras,camera_edit_issue,scenario_command_lists,command_list_issue,start_edit_issue,scenario_combat,combat_edit_issue,
            source_target: source.build.target.clone(),
            project_id,
            build_id: source.build.id,
            tag: source.tag,
            class: source.class,
            tags_directory: source.tags,
            tag_sha256:hash,
            actor_variants,
            can_append_faction_kits,can_append_squad_terminals,regional_faction_source,control_sources,weapon_sources,biped_sources,faction_kits,faction_body_issue,can_append_transport:can_append_squad_terminals||regional_faction_source&&can_append_faction_kits,vehicle_sources,can_append_encounter,
            vehicle_flight,vehicle_flight_issue,
            control_settings,control_settings_issue,control_requires_player_activation,machine_settings,machine_settings_issue,
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
pub(super) struct CommandGeometryReview {
    build_id: String,
    tag_sha256: String,
    output_sha256: String,
    ground_drop: Option<f32>,
    control_mount: Option<ControlMountReview>,
    #[serde(flatten)]
    geometry: maps::BspGeometryReview,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ControlMountReview {
    tag_path: String,
    offset: Option<f32>,
    issue: Option<String>,
}
#[tauri::command]
pub(super) async fn native_scenario_geometry(app:tauri::AppHandle,project_id:String,expected_build_id:String,expected_tag_sha256:String,points:Vec<[f32;3]>,ground_drop:Option<f32>,command_route:Option<recipes::NativeCommandList>,route_origin:Option<[f32;3]>,control_mount_tag:Option<String>)->Reply<CommandGeometryReview>{
 tauri::async_runtime::spawn_blocking(move||{
  if points.is_empty()||points.len()>64||expected_tag_sha256.len()!=64||!expected_tag_sha256.bytes().all(|v|v.is_ascii_hexdigit()){return Err("Invalid native source-point review".into());}
  let state=app.state::<AppState>();let _guard=source_guard()?;require_idle(&state)?;let selected=source(&state,&project_id,None)?;
  if selected.build.id!=expected_build_id{return Err("The native source build changed; refresh and review the current route".into());}
  let file=selected.tags.join(core::safe_relative(&selected.tag).map_err(error)?);
  if maps::hash_file(&file).map_err(error)?!=expected_tag_sha256{return Err("Native scenario changed after route selection; refresh source".into());}
  let output=selected.build.output.as_ref().ok_or("Compiled BSP reference is unavailable")?;core::reject_links(output).map_err(error)?;
  let map=maps::inspect_map(output,None).map_err(error)?;if selected.build.sha256.as_deref()!=Some(map.sha256.as_str()){return Err("Compiled BSP reference no longer matches its validated build".into());}
  let control_mount = if let Some(tag_path) = control_mount_tag {
      let normalized = tag_path.replace('\\', "/");
      if points.len() != 1 || command_route.is_some() || normalized.len() > 240
          || core::safe_relative(&normalized).is_err() {
          return Err("Invalid native terminal model review".into());
      }
      let readback = (|| -> Reply<f32> {
          let mut tags = map.tags.iter().filter(|tag| tag.class == "ctrl" && !tag.external
              && tag.path.replace('\\', "/").eq_ignore_ascii_case(&normalized));
          let tag = tags.next().ok_or("This control model is unavailable in the compiled reference")?;
          if tags.next().is_some() { return Err("The compiled control tag is ambiguous".into()); }
          let (_, mesh) = core::render::preview_owned_object_model(output, &map.sha256, &map, tag.id).map_err(error)?;
          core::render::upright_model_base_offset(&mesh).map_err(error)
      })();
      Some(match readback {
          Ok(offset) => ControlMountReview { tag_path, offset: Some(offset), issue: None },
          Err(issue) => ControlMountReview { tag_path, offset: None, issue: Some(issue) },
      })
  } else { None };
  let geometry=maps::bsp_geometry_review(output,&map,&points,ground_drop,command_route.as_ref(),route_origin).map_err(error)?;
  if maps::hash_file(&file).map_err(error)?!=expected_tag_sha256||lock(&state.library)?.get(&project_id).map_err(error)?.fingerprint().map_err(error)?!=selected.project.fingerprint().map_err(error)?{return Err("Native source changed during BSP review; no result was accepted".into());}
  Ok(CommandGeometryReview{build_id:expected_build_id,tag_sha256:expected_tag_sha256,output_sha256:map.sha256,ground_drop,control_mount,geometry})
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
    Ok(Preview{actor_positions:receipt.operation.actor_start_positions().map_err(error)?,id:receipt.id.clone(),tag:receipt.tag.clone(),tool_id:receipt.tool_id.clone(),before_sha256:receipt.before_sha256.clone(),after_sha256:receipt.after_sha256.clone(),changed_bytes:receipt.changed_bytes,field_changes:receipt.field_changes.clone(),current_state:if current==receipt.before_sha256{"before"}else if current==receipt.after_sha256{"after"}else{"conflict"}.into(),detail:if matches!(receipt.operation,recipes::Operation::MachineSettings{..}){"Only native machine type and transition/acceleration times may change. Accept selects a separate source revision, Save records it, and Restore selects the preceding tag. Test animation and collision in the target runtime."}else if matches!(receipt.operation,recipes::Operation::ControlSettings{..}){"Only reviewed native control type, trigger, call value, automatic activation radius and delay may differ. All placements sharing this tag are affected; scenario names, groups, flags, scripts and dependencies stay unchanged. Accept selects separate source; Save/rebuild and inspect the compiled control. Restore recovers the exact preceding tag. Mission roles and actual engine interaction require separate authoring/gameplay acceptance."}else if matches!(receipt.operation,recipes::Operation::SquadTerminals{..}){"Native squad-selection controls and optional isolated readiness gates are appended. Existing source/indices and equipment profiles stay unchanged. Accept selects a source revision; Save/rebuild independently checks names, poses, interaction and groups. A readiness gate starts zero and requires reviewed objective HaloScript. Forerunner owns membership and settlement; this does not create scoped missions or prove gameplay. Native Restore recovers the previous source."}else if matches!(&receipt.operation,recipes::Operation::FactionBody{body,..} if body.use_player_physics){"Review the dedicated biped’s native player movement flag and its faction binding. Accept and build to verify the compiled flag. The original NPC source keeps its settings. Native Restore returns to the previous faction binding."}else if matches!(receipt.operation,recipes::Operation::FactionBody{..}){"Review the faction’s dormant biped, permutation and optional first-person arms. The arms carrier adds a scenery palette entry. Save and rebuild verifies the compiled binding. Native Restore selects the previous source. Test first-person visuals, loadout and passenger animations in Forerunner."}else if matches!(receipt.operation,recipes::Operation::FactionKits{replace_existing_profiles:true,..}){"Review changes to the existing faction equipment profile. The native terminal, character, placement, and index are preserved. Accept selects a source revision. Save and Build working tag edits to verify the compiled profile. Restore selects the preceding tag. Forerunner applies the profile alongside the player's saved inventory."}else if matches!(receipt.operation,recipes::Operation::FactionService{..}){"One native faction service is appended inside its own hub. Save and rebuild verifies the service, its owning BSP, and independent groups. Forerunner multiplayer Extraction admission is pending."}else if receipt.operation.is_faction_edit(){"Native faction terminals and equipment-only profiles were appended together. Originals/indices remain; new power/position groups are isolated and repeatable. Accept selects separate source; Save/rebuild independently checks profiles, names, poses and groups. Forerunner owns faction choice, gear reservation and persistence. Native Restore is separate from project Undo; gameplay is unverified."}else if receipt.operation.is_vehicle_flight(){"Only the requested native AI throttle, avoidance and pathfinding-radius fields may differ. The named aircraft and scenario binding remain pinned. Accept selects separate source; Save/rebuild checks all three compiled values. Native Restore is separate from project Undo. Actual pilot behavior, hull clearance, landing and flight require gameplay acceptance."}else if receipt.operation.is_transport_append(){"One named aircraft and three isolated zero-initialized signals are appended. Existing palette, placements, names, groups and script indices/bodies are retained. Dependencies are pinned. Accept selects separate source; Save/rebuild independently checks compiled vehicle pose/name/tag and signal indices/flags. Restore selects the exact original scenario. Pilot, routes, boarding, flight and settlement remain separate authoring/game gates."}else if matches!(receipt.operation,recipes::Operation::CommandList{append:true,..}){"One reviewed native command list is appended. Existing lists, names, indices, AI bindings and scripts remain unchanged. Accept selects separate source; Save/rebuild verifies every compiled action and waypoint. Native Restore is separate from project Undo. A source route does not prove navigation, flight or clearance."}else if receipt.operation.is_command_edit(){"Only the selected existing command actions, parameters, references, flags and point coordinates may differ. Names, command/point indices, AI bindings and unrelated source are preserved. Accept selects separate source; Save/rebuild verifies complete compiled command data. Native Restore is distinct from project Undo. AI execution/navigation requires gameplay testing."}else if matches!(receipt.operation,recipes::Operation::PlayerStartPosition{copy_from:Some(_),..}){"One player start is appended with the selected template’s team, BSP and gametype filters. Review the new coordinates and yaw, then accept and rebuild. Restore selects the complete preceding source revision. Test safe spawning in the target runtime."}else if receipt.operation.is_player_start_edit(){"Only this existing native player start position/facing may differ. Team, BSP, gametype filters, indices, other spawns and scripts remain unchanged. Accept selects separate source; Save/restart and Build working tag edits independently checks compiled XYZ/yaw. Native Restore is separate from project Undo. A point-inside-BSP check does not prove aircraft hull clearance, safe spawning or gameplay."}else if matches!(receipt.operation,recipes::Operation::DeviceGroupAppend{..}){"One device group is appended at the next native index. Existing groups, bindings and scripts are preserved. Accept the group, then assign it in Device wiring. Save and rebuild to check the compiled group and bindings. Native Restore selects the preceding source revision."}else if matches!(receipt.operation,recipes::Operation::DeviceGroupSettings{..}){"This group keeps its name, index and bindings. Accept selects the reviewed initial value and repeat setting. Save and rebuild to verify the compiled group. Restore selects the preceding scenario source."}else if receipt.operation.is_device_edit(){"Only the reviewed pose, control or machine activation flags or device group bindings may differ. The group definitions, class, palette, names, other flags, vitality, teams and scripts remain unchanged. Accept selects separate source; Save/rebuild and independently inspect compiled placement. Native Restore is distinct from project Undo. Actual terminal use/doors/collision require gameplay acceptance."}else if matches!(receipt.operation,recipes::Operation::TriggerVolume{append:true,..}){"One dedicated oriented trigger area is appended. Existing names, indices, geometry and script references stay unchanged. Accept selects separate source; Save/rebuild checks the compiled area. Restore selects the exact preceding tag. The box is an invisible gameplay trigger, not collision or proof of a landing."}else if receipt.operation.is_trigger_edit(){"Only this oriented trigger box geometry may differ. Names, indices and script references are preserved. Preview is temporary; Accept selects a separate source revision. Save/rebuild and inspect compiled bounds; Restore selects the original source. Trigger execution needs gameplay testing."}else if receipt.operation.is_flag_edit(){"Only the reviewed native flag is appended or its pose changed. Existing names, indices and unrelated source stay intact. Accept creates a separate source revision; Save/rebuild independently checks all compiled flags. Restore selects the preceding source. A flag is a stable location, not a trigger or proof of a visible waypoint."}else if matches!(&receipt.operation,recipes::Operation::CutsceneCamera{append:true,..}){"One uniquely named native camera point is appended at the end. All original points, indices, scripts and unrelated source remain. Accept selects separate source; Save/rebuild independently checks the compiled camera inventory/pose/lens. Restore selects the complete before-edit source. Cinematic/gameplay acceptance remains separate."}else if receipt.operation.is_camera_edit(){"Only this camera pose and lens may differ. Native point names, indices, scripts and other scenario fields stay unchanged. Accept selects a source revision; Save and rebuild to apply it. Restore selects the complete before-edit source. Editor preview is not native cinematic/gameplay acceptance."}else if receipt.operation.combat_target_key().is_some(){"Only the requested native AI source fields may differ: firing XYZ/group, squad tactical bits, reviewed squad/start behavior or patrol ordering/pose/weight/waits. Accept selects separate source; Restore selects the original before-edit source. Rebuild and independently inspect compiled positions/groups/patrols. Target compilers can expand search masks; source is never normalized automatically. Navigation, cover use and gameplay remain unverified."}else if receipt.operation.is_squad_start_edit(){"Only the selected AI starting position, requested facing and optional existing command-list binding may differ in exposed native fields. Command-list contents and all other starts stay unchanged. Accept selects separate source; rebuild and read back the compiled pose. Squad/start state fields, firing positions and navigation stay unchanged. Actual spawning, command execution, facing and reachability need gameplay validation."}else if receipt.operation.is_squad_count_edit(){"Only the selected native squad difficulty counts differ in the exposed fields. Accept selects a separate source revision; Build working tag edits compiles it and checks the resulting cache counts. Source-history restoration and gameplay are separate; opaque bytes are not certified."}else if matches!(receipt.operation,recipes::Operation::HudDuplicate{..}){"One existing HUD element is appended as an exposed-field-matched copy. Original elements and indices remain in place; dependency files are pinned. Accept selects a separate native source revision. Build working tag edits, then reopen its compiled HUD to edit the new layout. Opaque cells and actual HUD/game behavior still require independent acceptance."}else if receipt.operation.is_encounter_append(){"The reviewed native encounters are appended, existing exposed scenario fields are retained, and actor references are checked. Accept to select a separate source revision, then build it. Navigation, actual spawning and gameplay remain unverified; opaque bytes are not certified."}else{"Exactly the requested exposed native field differs; opaque bytes are not certified. Accept to create a separate complete source revision. The original source/cache stay unchanged."}.into()})
}
#[tauri::command]
pub(super) async fn native_operation_preview(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    tag_id: Option<u32>,
    operation: recipes::Operation,
    actor_import:Option<core::native_asset_imports::Binding>,
) -> Reply<Preview> {
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move||{
    let _gate=lock(gate())?;let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;
    if matches!(operation,recipes::Operation::Dependencies){return Err("Use the read-only dependency check for this operation".into());}
    let source=source(&state,&project_id,tag_id)?;if matches!(operation,recipes::Operation::ControlSettings{..}|recipes::Operation::MachineSettings{..})||operation.is_player_start_edit()||operation.is_faction_edit()||operation.is_transport_append()||operation.is_command_edit()||operation.is_device_edit()||operation.is_camera_edit()||operation.is_trigger_edit(){studio_native_source::require_unshared(&state,&source.project.id)?;}operation.validate(&source.class,&source.tag).map_err(error)?;
    if operation.is_player_start_edit(){
        if source.project.quick_forge.is_some(){return Err("Use the BSP Workshop for recipe-owned player spawns".into());}
        operation.check_player_start_capacity(player_start_cache_version(&source.build)?).map_err(error)?;
    }
    if let recipes::Operation::CommandList{list,..}=&operation{
        let(_,_,_,protected,..)=encounter_review_metadata(&state,&source.project,&source.build,true)?;
        let inventory=fields(&state,&source.project,&source.tags,&source.tag)?;
        let starts=recipes::scenario_squad_start_choices(&inventory).map_err(error)?;
        if starts.iter().any(|row|protected.contains(&row.encounter_name.to_ascii_lowercase())&&row.starts.iter().flatten().any(|point|point.command_list==Some(list.index as i16))){return Err("This native command list is used by a recipe-owned group. Edit it through that recipe's source workflow; no command revision was admitted".into());}
    }
    if operation.is_scenario_ai_edit(){
        let (_,_,_,protected,..)=encounter_review_metadata(&state,&source.project,&source.build,true)?;
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
    if let recipes::Operation::ControlSettings{settings,..}=&operation{if settings.trigger!="touched_by_player"&&control_requires_player_activation(&state,&source.project,&source.tags,&source.tag)?{return Err("This tag supplies a native faction/squad terminal. Its trigger must remain touched-by-player; original source was not changed".into());}}
    let before_fields=fields(&state,&source.project,&source.tags,&source.tag)?;
    verify_firefight_plan(&source.project,&source.build,&before_fields,&operation)?;
    let imported_source=actor_import.as_ref().map(|binding|checked_actor_import(&state,&source,&operation,binding)).transpose()?;
    let imported_dependencies=if let Some((selected,_))=&imported_source{core::native_asset_imports::source_hashes(&state.root,selected).map_err(error)?}else{BTreeMap::new()};
    let mut source_dependencies=operation_dependencies(&state,&source,&operation,&exe,actor_import.as_ref().zip(imported_source.as_ref()).map(|(binding,(_,root))|(binding,root.as_path())))?;
    for (path,hash) in &imported_dependencies {if let Some(pin)=source_dependencies.remove(path){if &pin!=hash{return Err("Imported actor dependency changed during preview".into());}}}
    for (path,hash) in &imported_dependencies {let existing=source.tags.join(core::safe_relative(path).map_err(error)?);core::reject_links(&existing).map_err(error)?;if existing.exists()&&maps::hash_file(&existing).map_err(error)?!=*hash{return Err("This actor namespace contains edited source. Keep it and import a new actor revision instead of overwriting it.".into());}}
    if let Some(field)=operation.field(){if recipes::number(&before_fields,field).map_err(error)?==operation.target().unwrap(){return Err("This native value already matches. No serialization or repair was performed.".into());}}
    if matches!(operation,recipes::Operation::LensFlareScaleRepair)&&!recipes::broken_lens_scale(recipes::number(&before_fields,"rotation_function_scale").map_err(error)?){return Err("This lens flare does not have the reviewed 360-to-zero repair precondition. No repair ran.".into());}
    let relative=core::safe_relative(&source.tag).map_err(error)?;let before=bounded_read(&source.tags.join(&relative),MAX_TAG)?;
    let before_sha256=hash_bytes(&before);
    if let Some(source_sha256)=operation.expected_source_sha256() {if !source_sha256.eq_ignore_ascii_case(&before_sha256){return Err("Native source changed after selection; refresh before editing. No writer ran.".into());}}
    let id=uuid::Uuid::new_v4().to_string();let directory=root(&state,&id)?;
    let player_copy_paths = faction_player_copy_paths(&operation)?;
    let staging = if let Some((selected,_))=&imported_source {
        let inventory=core::native_asset_imports::staging_inventory(&state.root,selected).map_err(error)?;
        Some((inventory.files.len(), inventory.bytes, "Reviewed native actor closure and encounter preview"))
    } else if !player_copy_paths.is_empty() {
        // Only the chosen biped and optional two linked first-person tags.
        Some((player_copy_paths.len(), MAX_TAG * player_copy_paths.len() as u64, "Reviewed faction player body copy"))
    } else {
        None
    };
    let import_lease = if let Some((files, dependencies, purpose)) = staging {
        let bytes = dependencies.saturating_add((before.len()*2+before_fields.len()*2) as u64).saturating_add(4*1024*1024);
        Some(core::storage::Store::for_output(&directory).map_err(error)?.reserve(
            &directory, Some(&source.tags), core::storage::estimate_copy(files+4,bytes),
            core::storage::Category::Staging, purpose,
        ).map_err(error)?)
    } else {
        None
    };
    fs::create_dir(&directory).map_err(error)?;if let Some(lease)=&import_lease{lease.mark_owned().map_err(error)?;}
    project::atomic_write(&directory.join("before.tag"),&before,false).map_err(error)?;
    let candidate=directory.join("candidate/tags");
    if let Some((_,imported))=&imported_source {
        // Reuse the existing reviewed merge: one owned reservation, exact file
        // inventories, and ownership markers outside the native tag tree.
        let original=directory.join("original/tags");fs::create_dir_all(original.join(&relative).parent().unwrap()).map_err(error)?;
        project::atomic_write(&original.join(&relative),&before,false).map_err(error)?;
        let original_files=BTreeMap::from([(source.tag.replace('\\',"/"),before_sha256.clone())]);
        fs::create_dir_all(candidate.parent().unwrap()).map_err(error)?;
        transaction::reconcile(&BTreeMap::new(),&original,imported,&candidate,&original_files,&imported_dependencies,true,Arc::new(AtomicBool::new(false))).map_err(error)?;
    }else{fs::create_dir_all(candidate.join(&relative).parent().unwrap()).map_err(error)?;project::atomic_write(&candidate.join(&relative),&before,false).map_err(error)?;}
    let (generated_dependencies, copy_differences) = stage_faction_player_copy(
        &state, &source, &operation, &exe, &candidate, &source_dependencies,
    )?;
    // The pinned Windows reader also needs an extended-length root for deep tags.
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
    let after_fields=fields(&state,&source.project,&candidate,&source.tag)?;let mut field_changes=recipes::reviewed_difference(&before_fields,&after_fields,&operation).map_err(error)?;
    field_changes.extend(copy_differences);
    let after=bounded_read(&candidate.join(&relative),MAX_TAG)?;
    if source.class == "scnr" { recipes::verify_vehicle_bsp_preservation(&before, &after).map_err(error)?; }
    let after_sha256=hash_bytes(&after);verify_bytes(&candidate,&source.tag,&after_sha256)?;
    if maps::hash_file(&source.tags.join(&relative)).map_err(error)?!=before_sha256{return Err("Working source changed during preview. The candidate is retained; refresh before making another preview.".into());}
    let mut expected_candidate=imported_dependencies.clone();expected_candidate.extend(generated_dependencies.clone());expected_candidate.insert(source.tag.replace('\\',"/"),after_sha256.clone());
    if transaction::inventory(&candidate).map_err(error)?!=expected_candidate{return Err("The native operation changed unexpected candidate files; no revision was selected".into());}
    let changed_bytes=before.iter().zip(&after).filter(|(a,b)|a!=b).count()+before.len().abs_diff(after.len());
    let receipt=Receipt{schema_version:1,id:id.clone(),owner,project_id:project_id.clone(),fingerprint:source.project.fingerprint().map_err(error)?,parent_build_id:source.build.id,tag:source.tag.clone(),class:source.class,operation:operation.clone(),source_dependencies,actor_import,imported_dependencies,generated_dependencies,tool_id:operation.tool_id().into(),executable_sha256,before_sha256:before_sha256.clone(),after_sha256:after_sha256.clone(),before_fields:ReviewedFields::digest(&before_fields),after_fields:ReviewedFields::digest(&after_fields),field_changes:field_changes.clone(),changed_bytes,output:format!("{stdout}{stderr}"),created_at:chrono::Utc::now().to_rfc3339()};
    let receipt_bytes=serde_json::to_vec_pretty(&receipt).map_err(error)?;
    if receipt_bytes.len()>4*1024*1024{return Err("Native preview exceeds its existing recovery receipt limit; no source was selected".into());}
    project::atomic_write(&directory.join("operation.json"),&receipt_bytes,false).map_err(error)?;
    if let Some(lease)=import_lease{lease.finish(true,Some(receipt.fingerprint.clone())).map_err(error)?;}
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
    let project=lock(&state.library)?.get(&project_id).map_err(error)?;if matches!(receipt.operation,recipes::Operation::ControlSettings{..}|recipes::Operation::MachineSettings{..})||receipt.operation.is_faction_edit()||receipt.operation.is_transport_append()||receipt.operation.is_command_edit()||receipt.operation.is_device_edit()||receipt.operation.is_camera_edit()||receipt.operation.is_trigger_edit(){studio_native_source::require_unshared(&state,&project.id)?;}let (build,current)=runtime_workbench::native_operation_source(&state,&project)?;
    if !restore && receipt.operation.is_player_start_edit(){receipt.operation.check_player_start_capacity(player_start_cache_version(&build)?).map_err(error)?;}
    if !restore {if let recipes::Operation::ControlSettings{settings,..}=&receipt.operation{if settings.trigger!="touched_by_player"&&control_requires_player_activation(&state,&project,&current,&receipt.tag)?{return Err("Terminal roles changed after review: faction/squad controls require touched-by-player. No source was selected".into());}}}
    if project.fingerprint().map_err(error)?!=receipt.fingerprint||(!restore&&build.id!=receipt.parent_build_id){return Err("The saved map/build changed after this preview. No source was selected; preview the current saved map again.".into());}
    if baboon_native::has_running(&project_id)?||runtime_workbench::has_running(&state,&project_id)?{return Err("Close this map's native editor/test process before selecting a new source revision".into());}
    let exe=executable(&state,&project,&receipt.tool_id)?;if maps::hash_file(&exe).map_err(error)?!=receipt.executable_sha256{return Err("The native writer changed after preview; review its identity again".into());}
    let expected=native_source_revisions::current(&state,&project_id)?;let legacy=native_source_revisions::legacy_revision(&state,&project_id)?;
    let relative=core::safe_relative(&receipt.tag).map_err(error)?;
    if !restore{check_dependency_pins(&current,&receipt.source_dependencies)?;}
    let current_hash=maps::hash_file(&current.join(&relative)).map_err(error)?;
    let wanted_current=if restore{&receipt.after_sha256}else{&receipt.before_sha256};if &current_hash!=wanted_current{return Err("This native tag changed after preview/acceptance. Overlapping edits need review; both sources are retained.".into());}
    let directory=root(&state,&operation_id)?;let candidate=directory.join("candidate/tags");let before=bounded_read(&directory.join("before.tag"),MAX_TAG)?;
    if hash_bytes(&before)!=receipt.before_sha256||maps::hash_file(&candidate.join(&relative)).map_err(error)?!=receipt.after_sha256{return Err("The retained native preview or recovery bytes changed; no revision was selected".into());}
    let actual_fields=fields(&state,&project,&candidate,&receipt.tag)?;
    check_dependency_pins(&candidate, &receipt.generated_dependencies)?;
    if !receipt.after_fields.matches(&actual_fields) { return Err("Candidate native fields no longer match the reviewed result".into()); }
    if !restore {
        let current_fields = fields(&state, &project, &current, &receipt.tag)?;
        if !receipt.before_fields.matches(&current_fields) {
            return Err("The current native fields no longer match the reviewed starting source".into());
        }
        verify_firefight_plan(&project, &build, &current_fields, &receipt.operation)?;
        if receipt.class == "scnr" {
            let edited = bounded_read(&candidate.join(&relative), MAX_TAG)?;
            recipes::verify_vehicle_bsp_preservation(&before, &edited).map_err(error)?;
        }
        recipes::reviewed_difference(&current_fields, &actual_fields, &receipt.operation).map_err(error)?;
    }
    verify_bytes(&candidate,&receipt.tag,&receipt.after_sha256)?;
    let revision_id=uuid::Uuid::new_v4().to_string();let revision=native_source_revisions::directory(&state,&operation_id,&revision_id)?;
    fs::create_dir_all(revision.parent().unwrap()).map_err(error)?;
    if fs::read_dir(revision.parent().unwrap()).map_err(error)?.count()>=100{return Err("This native operation retains 100 revisions. Start a fresh preview; previous revisions remain preserved.".into());}
    fs::create_dir(&revision).map_err(error)?;
    let tags=revision.join("tags");let baseline=transaction::inventory(&current).map_err(error)?;
    let imported=if !restore {if let Some(binding)=&receipt.actor_import {
        let source=Source{project:project.clone(),build:build.clone(),tags:current.clone(),tag:receipt.tag.clone(),class:receipt.class.clone()};
        let(selected,imported)=checked_actor_import(&state,&source,&receipt.operation,binding)?;
        let hashes=core::native_asset_imports::source_hashes(&state.root,&selected).map_err(error)?;
        if hashes!=receipt.imported_dependencies{return Err("Imported actor changed after preview; no source revision was selected".into());}
        transaction::reconcile(&BTreeMap::new(),&current,&imported,&tags,&baseline,&hashes,true,Arc::new(AtomicBool::new(false))).map_err(error)?;hashes
    }else{if !receipt.imported_dependencies.is_empty(){return Err("Native actor provenance is missing; preserve the preview and review again".into());}transaction::fork(&current,&tags,Arc::new(AtomicBool::new(false))).map_err(error)?;BTreeMap::new()}}else{transaction::fork(&current,&tags,Arc::new(AtomicBool::new(false))).map_err(error)?;BTreeMap::new()};
    if !restore {
        for (tag, hash) in &receipt.generated_dependencies {
            let rel = core::safe_relative(tag).map_err(error)?;
            let destination = tags.join(&rel);
            if destination.exists() {
                if maps::hash_file(&destination).map_err(error)? != *hash {
                    return Err(format!("A different tag occupies the reviewed playable copy {tag}. Existing source was preserved."));
                }
            } else {
                fs::create_dir_all(destination.parent().ok_or("Native playable copy has no parent")?).map_err(error)?;
                let bytes = bounded_read(&candidate.join(&rel), MAX_TAG)?;
                if hash_bytes(&bytes) != *hash { return Err("The retained playable copy changed".into()); }
                project::atomic_write(&destination, &bytes, false).map_err(error)?;
            }
        }
    }
    let bytes=if restore{before}else{bounded_read(&candidate.join(&relative),MAX_TAG)?};project::atomic_write(&tags.join(&relative),&bytes,false).map_err(error)?;
    let expected_hash=if restore{&receipt.before_sha256}else{&receipt.after_sha256};let mut wanted=baseline.clone();wanted.extend(imported);if !restore{wanted.extend(receipt.generated_dependencies.clone());}wanted.insert(receipt.tag.replace('\\',"/"),expected_hash.clone());
    if transaction::inventory(&tags).map_err(error)?!=wanted||transaction::inventory(&current).map_err(error)?!=baseline{return Err("Native source changed while staging. The staged copy is retained but was not selected.".into());}
    let staged_fields = fields(&state, &project, &tags, &receipt.tag)?;
    let expected_fields = if restore { &receipt.before_fields } else { &receipt.after_fields };
    if !expected_fields.matches(&staged_fields) {
        return Err("Staged native field readback differs; no source was selected".into());
    }
    if restore {
        recipes::reviewed_difference(&staged_fields, &actual_fields, &receipt.operation).map_err(error)?;
    }
    if runtime_workbench::native_operation_source(&state,&project)?.1!=current{return Err("The selected native source changed while staging; refresh before accepting".into());}
    if !restore{check_dependency_pins(&tags,&receipt.source_dependencies)?;check_dependency_pins(&tags,&receipt.imported_dependencies)?;check_dependency_pins(&current,&receipt.source_dependencies)?;}
    if maps::hash_file(&exe).map_err(error)?!=receipt.executable_sha256{return Err("Native writer changed while selecting the revision; no source was selected".into());}
    let selection=native_source_revisions::Selection{project_id:project_id.clone(),fingerprint:receipt.fingerprint,parent_build_id:build.id,job_id:operation_id.clone(),revision_id:revision_id.clone(),baboon_revision_at_selection:legacy};
    let tags=native_source_revisions::publish(&state,&project,selection,expected)?;
    let _=app.emit("spark:library-changed",());
    Ok(Accepted{operation_id,revision_id,tags_directory:tags,files:wanted.len(),restored:restore,detail:if restore{"Created a recovery revision containing the exact before-edit tag and all other current files. Build working tag edits to compile it.".into()}else{"Selected a complete native source revision with the reviewed tag edit. Build working tag edits to compile a separate cache; no gameplay result is implied.".into()}})
}).await.map_err(error)?
}

#[cfg(test)]
mod ownership_tests {
    use super::*;

    #[test]
    fn reviewed_fields_match_legacy_receipts_and_verify_every_byte() {
        let source = "first field\nlast field\n";
        let legacy: ReviewedFields = serde_json::from_value(serde_json::json!(source)).unwrap();
        assert!(legacy.matches(source));
        let digest = ReviewedFields::digest(source);
        let encoded = serde_json::to_string(&digest).unwrap();
        let readback: ReviewedFields = serde_json::from_str(&encoded).unwrap();
        assert!(readback.matches(source));
        for changed in ["first field\n", "first field\nlast field\r\n", "first field\nchanged field\n"] {
            assert!(!legacy.matches(changed));
            assert!(!readback.matches(changed));
        }
    }

    #[test]
    #[ignore = "Requires the reviewed stock Silent Cartographer cache, pinned Invader and disposable storage"]
    fn native_b30_review_rewires_large_stock_source_without_rewriting_other_fields() {
        let env_path = |key| PathBuf::from(std::env::var_os(key).expect(key));
        let invader = env_path("SPARK_NATIVE_TEST_INVADER_DIRECTORY");
        let executable = invader.join("invader-edit.exe");
        let map = env_path("SPARK_NATIVE_TEST_B30_CACHE");
        let map_hash = maps::hash_file(&map).unwrap();
        assert_eq!(map_hash, "a6e2ae628f96b666922d6429541068c3e117e8aa5031d00d187b3c853630be0f");
        let root = tempfile::tempdir_in(env_path("SPARK_GENERATED_ROOT")).unwrap();
        let tags = root.path().join("tags");
        fs::create_dir(&tags).unwrap();
        let tag = "levels/b30/b30.scenario";
        let path = tags.join(tag);
        let (ok, stdout, stderr) = run(&invader.join("invader-extract.exe"), &[
            "-t".into(), tags.to_string_lossy().into_owned(),
            "-m".into(), map.parent().unwrap().to_string_lossy().into_owned(),
            "-s".into(), tag.into(), map.to_string_lossy().into_owned(),
        ]).unwrap();
        assert!(ok, "{stdout}\n{stderr}");
        let original = fs::read(&path).unwrap();
        let original_hash = hash_bytes(&original);
        let (valid, _, cut) = native_tag_parser::fields(&executable, &tags, tag).unwrap();
        assert!(valid && cut, "public field display remains bounded");
        let listing = || {
            let (valid, fields, cut) = native_tag_parser::review_fields(&executable, &tags, tag).unwrap();
            assert!(valid && !cut);
            fields
        };
        let before = listing();
        assert!(before.len() > 16 * 1024 * 1024);
        let inventory = recipes::scenario_device_choices(&before).unwrap();
        assert_eq!(inventory.iter().filter(|device| device.class == "ctrl").count(), 6);
        assert_eq!(inventory.iter().filter(|device| device.class == "mach").count(), 129);
        assert_eq!(recipes::scenario_device_group_choices(&before).unwrap().len(), 7);
        let original_review = ReviewedFields::digest(&before);
        let mut control = inventory.into_iter().find(|device| device.class == "ctrl" && device.index == 1).unwrap();
        assert_eq!(control.position_group, Some(1));
        control.position_group = Some(3);
        let operation = recipes::Operation::DevicePlacement { device: control, source_sha256: original_hash.clone() };
        let args = operation.arguments_with_fields(&tags, "scnr", tag, &before).unwrap();
        let (ok, stdout, stderr) = run(&executable, &args).unwrap();
        assert!(ok, "{stdout}\n{stderr}");
        let after = listing();
        let diff = recipes::reviewed_difference(&before, &after, &operation).unwrap();
        assert_eq!(diff.len(), 1);
        let verified = ReviewedFields::digest(&after);
        let encoded = serde_json::to_string(&verified).unwrap();
        assert!(encoded.len() < 100 && verified.matches(&after) && !verified.matches(&before));
        let revised = maps::hash_file(&path).unwrap();
        verify_bytes(&tags, tag, &revised).unwrap();
        fs::write(&path, original).unwrap();
        assert!(original_review.matches(&listing()));
        assert_eq!(maps::hash_file(&path).unwrap(), original_hash);
        assert_eq!(maps::hash_file(&map).unwrap(), map_hash);
        println!("Stock b30 native review: fields={} source={original_hash} candidate={revised} cache={map_hash}", before.len());
    }
    #[test]
    fn controller_binding_distinguishes_reviewed_appends_from_generated_owners() {
        let(_temp,state,p,build)=super::super::readiness_tests::fixture();
        let append=|name:&str|serde_json::json!({"kind":"appendEncounter","name":name,"actorPath":"actors/pilot","position":[1,2,3],"startActive":false,"count":1,"spacing":1});
        let mut receipt=serde_json::json!({"schemaVersion":1,"jobId":build.id,"projectId":p.id,"projectFingerprint":build.project_fingerprint,
            "parentBuildId":uuid::Uuid::new_v4().to_string(),"parentOutputSha256":"a".repeat(64),"scenarioPath":"level","scenarioType":0,
            "workspace":state.root,"tagsDirectory":state.root.join("tags"),"inputTagHashes":null,"finalTagHashes":null,
            "toolIdentities":{},"status":"validated","build":build,"encounterExpectations":[append("spirit_pilot")],
            "generatedFirefight":{"operation":append("wave_owned"),"controller":{"filename":"waves.hsc","sha256":"b".repeat(64)}}});
        let file=state.root.join("jobs").join(&build.id).join("working-tags-receipt.json");
        fs::write(&file,serde_json::to_vec(&receipt).unwrap()).unwrap();
        let fields=protected_mission_encounters(&state,&p,&build).unwrap();
        assert!(fields.contains("spirit_pilot")&&fields.contains("wave_owned"));
        let controllers=protected_transport_groups(&state,&p,&build).unwrap();
        assert!(!controllers.contains("spirit_pilot"));assert!(controllers.contains("wave_owned"));
        // A mismatched receipt still refuses both projections; this is not an
        // exemption from native provenance or from runtime seat/AI checks.
        receipt["projectId"]=serde_json::json!(uuid::Uuid::new_v4().to_string());
        fs::write(&file,serde_json::to_vec(&receipt).unwrap()).unwrap();
        assert!(protected_transport_groups(&state,&p,&build).is_err());
        assert!(protected_mission_encounters(&state,&p,&build).is_err());
    }
}
