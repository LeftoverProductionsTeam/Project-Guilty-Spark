//! Native orchestration for the runtime dock. Reports are not execution permits.
//! Every launch consumes a short-lived, window-bound native plan and rechecks it.
use super::*;
use spark_core as core;
use spark_core::{
    community_servers as servers, mcc_content_probe as content, runtime_adapters as adapters,
};
use std::process::{Child, Command};
const WORKING_TAG_SNAPSHOT_REASON:&str="before-build";

#[derive(Default)]
pub(super) struct WorkbenchState {
    listing: Option<servers::CommunityListing>,
    listing_gate: servers::ListingRefreshGate,
    fetching: bool,
    fetch_error: Option<String>,
    plans: HashMap<String, PendingTool>,
    joins: HashMap<String, PendingJoin>,
    processes: Vec<ToolProcess>,
}

struct PendingJoin {
    owner: String,
    runtime_id: runtime::RuntimeId,
    registration_id: String,
    server_id: String,
    executable_sha256: String,
    content_identity: String,
    data_root: PathBuf,
    expires_at_unix: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct JoinPreview {
    #[serde(flatten)]
    assessment: servers::JoinAssessment,
    preflight_id: Option<String>,
    executable_sha256: String,
    data_root: Option<PathBuf>,
    expires_at_unix: u64,
}

struct PendingTool {
    view: ToolLaunchPlan,
    owner: String,
    fingerprint: String,
    scenario_sha256: String,
    startup_script: Option<String>,
    created: Instant,
}

struct ToolProcess {
    child: Child,
    view: ToolProcessView,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ToolProcessView {
    id: String,
    action_id: String,
    project_id: String,
    process_id: u32,
    status: String,
    exit_code: Option<i32>,
    detail: String,
    executable: PathBuf,
    executable_sha256: String,
    tags_directory: PathBuf,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ToolLaunchPlan {
    id: String,
    runtime_id: runtime::RuntimeId,
    action_id: String,
    project_id: String,
    build_id: String,
    executable: PathBuf,
    executable_sha256: String,
    executable_architecture: String,
    working_directory: PathBuf,
    tags_directory: PathBuf,
    scenario_file: PathBuf,
    arguments: Vec<String>,
    startup_script: Option<String>,
    expires_at_unix: u64,
    detail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WorkbenchReport {
    report: adapters::RuntimeCapabilityReport,
    profiles: Vec<adapters::RuntimeAdapterProfile>,
    actions: Vec<adapters::RuntimeDockAction>,
    source_issue: Option<String>,
    tools_issue: Option<String>,
    processes: Vec<ToolProcessView>,
    working_build: Option<BuildRecord>,
    working_source: Option<WorkingSource>,
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
struct WorkingSource { build_id:String, tags_directory:PathBuf }

#[derive(Clone)]
struct SourceContext {
    build: BuildRecord,
    workspace: PathBuf,
    tags: PathBuf,
    scenario: PathBuf,
    scenario_path: String,
    scenario_sha256: String,
}

fn now() -> u64 {
    chrono::Utc::now().timestamp().max(0) as u64
}

pub(super) fn community_data_environment(
    command: &mut Command,
    id: runtime::RuntimeId,
    data_root: &Path,
) {
    command.env("HALO_DATA_ROOT", data_root);
    if id == runtime::RuntimeId::OpenCe {
        command.env("HALO_CUSTOM_MAPS_ROOT", data_root.join("custom_maps"));
    }
}

pub(super) fn release_window(state: &AppState, label: &str) {
    if let Ok(mut workbench) = state.runtime_workbench.lock() {
        workbench.plans.retain(|_, p| p.owner != label);
        workbench.joins.retain(|_, p| p.owner != label);
    }
}

fn canonical_directory(path: &Path) -> Reply<PathBuf> {
    core::reject_links(path).map_err(error)?;
    if !path.is_dir() {
        return Err("Required working directory is missing".into());
    }
    fs::canonicalize(path).map_err(error)
}

fn owned_child(root: &Path, candidate: &Path) -> Reply<PathBuf> {
    let root = canonical_directory(root)?;
    core::reject_links(candidate).map_err(error)?;
    let candidate = fs::canonicalize(candidate).map_err(error)?;
    if !candidate.starts_with(&root) || candidate == root {
        return Err("Editable source must stay inside its own build job".into());
    }
    Ok(candidate)
}

fn source_context(state: &AppState, project: &Project) -> Reply<SourceContext> {
    let build = current_build(state, project)?;
    source_context_for_build(state, project, build)
}

pub(super) fn compiled_tags(
    state: &AppState,
    project: &Project,
    build: &BuildRecord,
) -> Reply<PathBuf> {
    source_context_for_build(state, project, build.clone()).map(|context|context.tags)
}

fn source_context_for_build(
    state: &AppState,
    project: &Project,
    build: BuildRecord,
) -> Reply<SourceContext> {
    if build.target != "mcc-cea" {
        return Err("This tool route requires an MCC Halo 1 build; use the selected runtime's build workflow".into());
    }
    let job = state.root.join("jobs").join(&build.id);
    let workspace = if job.join("working-tags-receipt.json").is_file() {
        let receipt: core::working_tags::WorkingTagsReceipt = serde_json::from_slice(
            &bounded_read(&job.join("working-tags-receipt.json"), 4 * 1024 * 1024)?,
        )
        .map_err(error)?;
        if receipt.schema_version != 1
            || receipt.job_id != build.id
            || receipt.project_id != project.id
            || receipt.project_fingerprint != project.fingerprint().map_err(error)?
            || receipt.status != "validated"
            || !scenario_paths_match(
                &receipt.scenario_path,
                &project.scenario_path().map_err(error)?,
            )
            || receipt
                .build
                .as_ref()
                .is_none_or(|b| b.id != build.id || b.sha256 != build.sha256)
        {
            return Err("Working-tag source receipt does not match this map build".into());
        }
        let workspace = owned_child(&job, &receipt.workspace)?;
        if fs::canonicalize(&receipt.tags_directory).map_err(error)?
            != fs::canonicalize(workspace.join("tags")).map_err(error)?
        {
            return Err("Working-tag source folder changed".into());
        }
        workspace
    } else if project.quick_forge.is_some() {
        let receipt: forge_build::QuickForgeBuildReceipt = serde_json::from_slice(&bounded_read(
            &job.join("quickforge-receipt.json"),
            4 * 1024 * 1024,
        )?)
        .map_err(error)?;
        if receipt.project_id != project.id
            || receipt.job_id != build.id
            || receipt.project_fingerprint != project.fingerprint().map_err(error)?
            || receipt.status != "validated"
        {
            return Err("QuickForge source receipt does not match this saved map revision".into());
        }
        owned_child(
            &job,
            &receipt
                .sources
                .ok_or("Build has no editable source workspace")?
                .directory,
        )?
    } else {
        canonical_directory(&job)?
    };
    let default_tags = workspace.join("tags");
    let selected = baboon_native::working_source(state, project, &build.id, &default_tags)?;
    let tags = if selected == default_tags {
        owned_child(&job, &default_tags)?
    } else {
        canonical_directory(&selected)?
    };
    let scenario_path = project.scenario_path().map_err(error)?;
    let scenario = owned_child(
        &tags,
        &tags.join(core::safe_relative(&format!("{scenario_path}.scenario")).map_err(error)?),
    )?;
    let globals = owned_child(&tags, &tags.join("globals/globals.globals"))?;
    if !scenario.is_file()
        || !globals.is_file()
        || fs::metadata(&scenario).map_err(error)?.len() < 64
    {
        return Err(
            "Build the current scenario and its complete matching editable tag tree first".into(),
        );
    }
    let scenario_sha256 = maps::hash_file(&scenario).map_err(error)?;
    Ok(SourceContext {
        build,
        workspace,
        tags,
        scenario,
        scenario_path,
        scenario_sha256,
    })
}

/// Verify the selected generation against Steam's installed H1A kit, rather than
/// inferring it from a folder named HCEEK or an executable named sapien.exe.
fn official_h1a_kit(state: &AppState, settings: &Settings) -> Reply<PathBuf> {
    if !cfg!(windows) || settings.hek_flavor.as_deref() != Some("h1aEk") {
        return Err("Choose Halo: CE Mod Tools - MCC in this map's tool settings".into());
    }
    let selected = canonical_directory(
        settings
            .hek_directory
            .as_deref()
            .ok_or("Select the installed H1A editing kit")?,
    )?;
    let installation = lock(&state.installation)?.clone();
    for library in installation.libraries {
        let manifest = library.join("steamapps/appmanifest_1532190.acf");
        if !manifest.is_file() {
            continue;
        }
        let bytes = bounded_read(&manifest, 1024 * 1024)?;
        let parsed =
            steam::parse_vdf(std::str::from_utf8(&bytes).map_err(error)?).map_err(error)?;
        let Some(app) = parsed.get("AppState") else {
            continue;
        };
        if app.get("appid").and_then(|v| v.text()) != Some("1532190") {
            continue;
        }
        let Some(folder) = app.get("installdir").and_then(|v| v.text()) else {
            continue;
        };
        let relative = core::safe_relative(folder).map_err(error)?;
        let expected = library.join("steamapps/common").join(relative);
        if expected.is_dir() && canonical_directory(&expected)? == selected {
            return Ok(selected);
        }
    }
    Err("The selected folder is not the installed Steam H1A kit (app 1532190). Set up the matching kit; other tool generations remain separate.".into())
}

fn tool_settings(state: &AppState, project: Option<&Project>) -> Reply<Settings> {
    let mut settings = lock(&state.settings)?.clone();
    if let Some(project) = project {
        if let Some(target) = project
            .active_build_target
            .as_ref()
            .and_then(|id| project.build_targets.iter().find(|t| &t.id == id))
        {
            if target.runtime_id != runtime::RuntimeId::MccSteam {
                return Err("This map's selected build target is a different runtime; change it explicitly in Map tools".into());
            }
            settings.hek_directory = target.hek_directory.clone();
            settings.hek_flavor = target.hek_flavor.clone();
            settings.hek_tags_directory = target.tags_directory.clone();
            settings.invader_directory = target
                .invader_directory
                .clone()
                .or(settings.invader_directory);
        }
    }
    Ok(settings)
}
pub(super) fn has_running(state:&AppState,project:&str)->Reply<bool>{Ok(processes(state)?.iter().any(|p|p.project_id==project&&p.status=="running"))}

fn inspect_tool_file(settings: &Settings, tool_id: &str) -> Reply<(PathBuf, String, String)> {
    let choice = allowed_toolchain("mccSteam", Some("h1aEk"))
        .into_iter()
        .find(|c| c.id == tool_id)
        .ok_or("Unknown H1A tool")?;
    let file = known_tool_file(settings, choice)?
        .ok_or("The required executable is missing from the selected editing kit")?;
    let size = fs::metadata(&file).map_err(error)?.len();
    if !(64..=256 * 1024 * 1024).contains(&size) {
        return Err("Tool executable is outside the supported inspection size".into());
    }
    let mut handle = fs::File::open(&file).map_err(error)?;
    let mut header = [0u8; 64];
    handle.read_exact(&mut header).map_err(error)?;
    if &header[..2] != b"MZ" {
        return Err("Selected tool is not a Windows executable".into());
    }
    let offset = u32::from_le_bytes(header[60..64].try_into().unwrap()) as u64;
    if offset > size.saturating_sub(6) || offset > 4 * 1024 * 1024 {
        return Err("Invalid Windows executable header".into());
    }
    use std::io::{Seek, SeekFrom};
    handle.seek(SeekFrom::Start(offset)).map_err(error)?;
    let mut pe = [0u8; 6];
    handle.read_exact(&mut pe).map_err(error)?;
    if &pe[..4] != b"PE\0\0" || !supported_tool_machine(u16::from_le_bytes([pe[4], pe[5]])) {
        return Err(
            "The selected editing tool has an unsupported Windows executable architecture".into(),
        );
    }
    Ok((
        file.clone(),
        maps::hash_file(&file).map_err(error)?,
        if u16::from_le_bytes([pe[4], pe[5]]) == 0x014c {
            "x86"
        } else {
            "x86_64"
        }
        .into(),
    ))
}

fn supported_tool_machine(machine: u16) -> bool {
    matches!(machine, 0x014c | 0x8664)
}

fn processes(state: &AppState) -> Reply<Vec<ToolProcessView>> {
    let mut workbench = lock(&state.runtime_workbench)?;
    for process in &mut workbench.processes {
        if process.view.status == "running" {
            match process.child.try_wait() {
                Ok(Some(exit)) => {
                    process.view.status = "exited".into();
                    process.view.exit_code = exit.code();
                    process.view.detail = "Process exited. Exit status alone does not establish scene loading, connection or gameplay acceptance.".into();
                }
                Ok(None) => {}
                Err(_) => {
                    process.view.status = "unknown".into();
                    process.view.detail="Process observation unavailable; no connection or gameplay result inferred.".into();
                }
            }
        }
    }
    Ok(workbench.processes.iter().map(|p| p.view.clone()).collect())
}
pub(super) fn source_editor_context(state:&AppState,project_id:&str)->Reply<String>{
    let candidates:Vec<_>=processes(state)?.into_iter().filter(|p|p.project_id==project_id&&p.status=="running"&&matches!(p.action_id.as_str(),"editTags"|"editLevel")).map(|p|format!("{} PID {}",if p.action_id=="editTags"{"Guerilla"}else{"Sapien"},p.process_id)).collect();
    Ok(if candidates.is_empty(){"Writer unknown: no Spark-launched source editor is running. Filesystem events do not identify the writing process.".into()}else{format!("Open tool context: {}. Actual writer unconfirmed; filesystem events do not identify the writing process.",candidates.join(", "))})
}
pub(super) fn source_editor_associations(state: &AppState, project_id: &str, tags: &Path) -> Reply<Vec<native_save_evidence::ToolAssociation>> {
    Ok(processes(state)?.into_iter().filter(|process| process.project_id == project_id && process.status == "running" && process.tags_directory == tags && matches!(process.action_id.as_str(), "editTags" | "editLevel"))
        .map(|process| native_save_evidence::ToolAssociation {
            tool: if process.action_id == "editTags" { "Guerilla" } else { "Sapien" }.into(),
            version: "Selected editing-kit executable; product version not independently queried".into(),
            executable: process.executable, executable_sha256: process.executable_sha256,
            process_id: Some(process.process_id), basis: "Spark-observed launch for this map/source folder; actual writer unconfirmed".into(),
        }).collect())
}

#[tauri::command]
pub(super) async fn runtime_tool_processes(app: tauri::AppHandle) -> Reply<Vec<ToolProcessView>> {
    processes(&app.state::<AppState>())
}

#[tauri::command]
pub(super) async fn runtime_workbench_report(
    app: tauri::AppHandle,
    runtime_id: runtime::RuntimeId,
    project_id: Option<String>,
) -> Reply<WorkbenchReport> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let reports = runtime_reports(&state)?;
        let base = reports
            .iter()
            .find(|r| r.id == runtime_id)
            .ok_or("Runtime profile is unavailable")?;
        let mut observation = adapters::RuntimeObservation::from_report(base);
        observation.game_running =
            runtime_id == runtime::RuntimeId::MccSteam && steam::is_mcc_running();
        let project = project_id
            .map(|id| lock(&state.library)?.get(&id).map_err(error))
            .transpose()?;
        if let Some(project) = &project {
            observation.project.scenario_type = if project.quick_forge.is_some() {
                Some(1)
            } else if project.source.is_some() {
                Some(inspect(&state, project)?.header.scenario_type)
            } else {
                None
            };
            observation.project.cache_version = project
                .source
                .as_ref()
                .map(|s| s.cache_version)
                .or_else(|| {
                    project.quick_forge.as_ref().map(|_| {
                        if runtime_id == runtime::RuntimeId::MccSteam {
                            13
                        } else {
                            609
                        }
                    })
                });
            observation.project.content_identity =
                project.source.as_ref().map(|s| s.sha256.clone());
            observation.project.built_output_verified = current_build(&state, project).is_ok();
            observation.project.contains_new_scenario_objects = project.quick_forge.is_none()
                && project
                    .scene
                    .iter()
                    .any(|item| item.source_offset.is_none());
        }
        let context = project
            .as_ref()
            .map(|p| source_context(&state, p))
            .transpose();
        let source_issue = match &context {
            Ok(Some(_)) => None,
            Ok(None) => {
                Some("Open a map, then build its editable source in Build & playtest.".into())
            }
            Err(e) => Some(e.clone()),
        };
        let tools = tool_settings(&state, project.as_ref()).and_then(|settings| {
            official_h1a_kit(&state, &settings)?;
            Ok(settings)
        });
        let tools_issue = tools.as_ref().err().cloned();
        if runtime_id == runtime::RuntimeId::MccSteam {
            if let (Ok(Some(context)), Ok(settings)) = (&context, &tools) {
                let mut kinds = vec![];
                let mut architectures = std::collections::BTreeSet::new();
                for (id, kind) in [
                    ("sapien", adapters::ToolKind::Sapien),
                    ("guerilla", adapters::ToolKind::Guerilla),
                    ("haloTool", adapters::ToolKind::Tool),
                    ("tagTest", adapters::ToolKind::Standalone),
                ] {
                    if let Ok((_, _, architecture)) = inspect_tool_file(settings, id) {
                        kinds.push(kind);
                        architectures.insert(architecture);
                    }
                }
                observation.project.source_complete = true;
                if baboon_native::installation(&state).is_ok() {kinds.push(adapters::ToolKind::Baboon);}
                observation.toolchains.push(adapters::ToolchainEvidence {
                    generation: "h1a-ek".into(),
                    architecture: Some(architectures.into_iter().collect::<Vec<_>>().join(" / ")),
                    validated: true,
                    tools: kinds,
                    content_identity: Some(context.scenario_sha256.clone()),
                });
            }
        }
        let report = adapters::capability_report(&observation);
        let mut actions = adapters::dock_actions(&report);
        let observed = processes(&state)?;
        for action in &mut actions {
            if observed.iter().any(|p| {
                p.action_id == action.id
                    && p.status == "running"
                    && project
                        .as_ref()
                        .is_some_and(|project| project.id == p.project_id)
            }) {
                action.availability = adapters::ActionAvailability::Running;
            }
        }
        let working_build = context
            .as_ref()
            .ok()
            .and_then(|context| context.as_ref())
            .filter(|context| {
                state
                    .root
                    .join("jobs")
                    .join(&context.build.id)
                    .join("working-tags-receipt.json")
                    .is_file()
            })
            .map(|context| context.build.clone());
        let working_source=context.as_ref().ok().and_then(|c|c.as_ref()).map(|c|WorkingSource{build_id:c.build.id.clone(),tags_directory:c.tags.clone()});
        Ok(WorkbenchReport {
            report,
            profiles: adapters::registry(),
            actions,
            source_issue,
            tools_issue,
            processes: observed,
            working_build,
            working_source,
        })
    })
    .await
    .map_err(error)?
}

fn scenario_paths_match(a: &str, b: &str) -> bool {
    console_scenario(a)
        .ok()
        .zip(console_scenario(b).ok())
        .is_some_and(|(a, b)| a.eq_ignore_ascii_case(&b))
}

fn console_scenario(path: &str) -> Reply<String> {
    core::safe_relative(path).map_err(error)?;
    if !path
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || "_-/\\.".contains(c))
    {
        return Err(
            "This scenario name cannot be passed safely to the engine startup script".into(),
        );
    }
    Ok(path.replace('/', "\\"))
}

#[tauri::command]
pub(super) async fn prepare_runtime_tool(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    runtime_id: runtime::RuntimeId,
    project_id: String,
    action_id: String,
) -> Reply<ToolLaunchPlan> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state=app.state::<AppState>(); check_document_owner(&state,&project_id,&owner)?;
        if runtime_id!=runtime::RuntimeId::MccSteam {return Err("This source-aware tool route currently implements the H1A kit. Other runtimes retain their separate setup/build workflows.".into());}
        let project=lock(&state.library)?.get(&project_id).map_err(error)?;
        let context=source_context(&state,&project)?;
        let settings=tool_settings(&state,Some(&project))?;official_h1a_kit(&state,&settings)?;
        let tool_id=match action_id.as_str(){"editLevel"=>"sapien","editTags"=>"guerilla","testScene"=>"tagTest",_=>return Err("Choose an integrated scene or tag editor action".into())};
        let (executable,executable_sha256,executable_architecture)=inspect_tool_file(&settings,tool_id)?;
        let id=uuid::Uuid::new_v4().to_string();
        // Paths are relative to the reviewed derived workspace. Old Halo tools
        // have short path buffers and do not consistently accept Win32 \\?\ paths.
        let mut arguments=vec!["-tags_dir".into(),"tags".into()];
        let startup_script=if action_id=="testScene" {
            let scenario=console_scenario(&context.scenario_path)?;
            let multiplayer=if project.quick_forge.is_some(){true}else{inspect(&state,&project)?.header.scenario_type==1};
            let contents=format!("; Spark scene test, owned derived source\r\n{}map_name \"{scenario}\"\r\n",if multiplayer{"game_variant slayer\r\n"}else{""});
            arguments.extend(["-window".into(),"-data_dir".into(),"data".into(),"-exec".into(),format!("spark-scene-{id}.txt")]);
            Some(contents)
        }else {
            if action_id=="editLevel"{arguments.extend(["-multipleinstance".into(),"-data_dir".into(),"data".into()]);}
            arguments.push(format!("tags\\{}.scenario",context.scenario_path.replace('/',"\\")));None
        };
        let view=ToolLaunchPlan{id:id.clone(),runtime_id,action_id,project_id,build_id:context.build.id,executable,executable_sha256,executable_architecture,working_directory:context.workspace,tags_directory:context.tags,scenario_file:context.scenario,arguments,startup_script:startup_script.clone(),expires_at_unix:now()+90,
            detail:"Uses this map's derived build-job tags. External tools can edit those working files; source caches and SDK master tags are not selected. Close the tools, use Build working tag edits in dock details, then open that compiled map to bring changes into Spark. The ordinary source build regenerates its own tags. Standalone scene tests do not certify retail MCC or multiplayer.".into()};
        let mut workbench=lock(&state.runtime_workbench)?;
        if app.get_webview_window(&owner).is_none(){return Err("The requesting window closed during tool inspection".into());}
        workbench.plans.retain(|_,p|p.created.elapsed()<Duration::from_secs(90));
        if workbench.plans.len()>=16{return Err("Close an old launch preview before preparing another".into());}
        workbench.plans.insert(id,PendingTool{view:view.clone(),owner,fingerprint:project.fingerprint().map_err(error)?,scenario_sha256:context.scenario_sha256,startup_script,created:Instant::now()});
        Ok(view)
    }).await.map_err(error)?
}

#[tauri::command]
pub(super) async fn launch_runtime_tool(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    plan_id: String,
    confirmed: bool,
) -> Reply<ToolProcessView> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        if !confirmed{return Err("Review the exact executable and working tag folder before launching this external tool".into());}
        let state=app.state::<AppState>();
        let plan={let mut workbench=lock(&state.runtime_workbench)?;if workbench.plans.get(&plan_id).is_some_and(|plan|plan.owner!=owner){return Err("This launch preview belongs to another window".into());}workbench.plans.remove(&plan_id).ok_or("Launch preview expired or was already used; prepare it again")?};
        if plan.owner!=owner || plan.created.elapsed()>=Duration::from_secs(90){return Err("This launch preview belongs to another window or has expired".into());}
        check_document_owner(&state,&plan.view.project_id,&owner)?;
        let project=lock(&state.library)?.get(&plan.view.project_id).map_err(error)?;
        let context=source_context(&state,&project)?;
        let settings=tool_settings(&state,Some(&project))?;official_h1a_kit(&state,&settings)?;
        let tool_id=match plan.view.action_id.as_str(){"editLevel"=>"sapien","editTags"=>"guerilla","testScene"=>"tagTest",_=>return Err("Unknown tool launch plan".into())};
        let (executable,hash,_)=inspect_tool_file(&settings,tool_id)?;
        if project.fingerprint().map_err(error)?!=plan.fingerprint || context.build.id!=plan.view.build_id || context.tags!=plan.view.tags_directory || context.workspace!=plan.view.working_directory || context.scenario!=plan.view.scenario_file || context.scenario_sha256!=plan.scenario_sha256 || executable!=plan.view.executable || hash!=plan.view.executable_sha256 {
            return Err("The map, build source or tool changed since preview. Prepare a fresh launch preview".into());
        }
        let _=processes(&state)?;
        {
            let mut workbench=lock(&state.runtime_workbench)?;
            if workbench.processes.iter().any(|p|p.view.status=="running" && p.view.project_id==project.id && p.view.action_id==plan.view.action_id){return Err("This tool is already running for this map".into());}
            workbench.processes.retain(|p|p.view.status=="running");
            if workbench.processes.len()>=16{return Err("Close an existing tool before opening another (16 running tool limit)".into());}
        }
        if let Some(contents)=&plan.startup_script {
            let script=context.workspace.join(format!("spark-scene-{}.txt",plan.view.id));
            project::atomic_write(&script,contents.as_bytes(),false).map_err(error)?;
        }
        if plan.view.action_id!="editTags"{let data=context.workspace.join("data");core::reject_links(&data).map_err(error)?;fs::create_dir_all(data).map_err(error)?;}
        let mut command=Command::new(&executable);command.current_dir(&context.workspace).args(&plan.view.arguments).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        #[cfg(windows)]{use std::os::windows::process::CommandExt;command.creation_flags(0x08000000);}
        let child=command.spawn().map_err(error)?;
        let view=ToolProcessView{id:plan.view.id,action_id:plan.view.action_id,project_id:project.id,process_id:child.id(),status:"running".into(),exit_code:None,detail:"Process launch observed. Scene loading and gameplay await acceptance. Save and close this tool, then choose Build working tag edits in dock details.".into(),executable:plan.view.executable,executable_sha256:plan.view.executable_sha256,tags_directory:context.tags};
        lock(&state.runtime_workbench)?.processes.push(ToolProcess{child,view:view.clone()});
        Ok(view)
    }).await.map_err(error)?
}

#[tauri::command]
pub(super) async fn inspect_bsp_audio_workspace(app:tauri::AppHandle,project_id:String)->Reply<core::bsp_audio::Workspace>{
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();
        let project=lock(&state.library)?.get(&project_id).map_err(error)?;
        let context=source_context(&state,&project)?;
        let cache=context.build.output.as_ref().ok_or("Validated parent cache is missing")?;
        let sha=context.build.sha256.as_deref().ok_or("Validated parent cache identity is missing")?;
        core::bsp_audio::inspect_workspace(&context.build.id,cache,sha,&context.tags).map_err(error)
    }).await.map_err(error)?
}

#[tauri::command]
pub(super) async fn build_working_tags(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    bsp_audio: Option<core::bsp_audio::Request>,
) -> Reply<String> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let _source_guard=native_operations_native::source_guard()?;
        let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;
        let project=lock(&state.library)?.get(&project_id).map_err(error)?;
        let context=source_context(&state,&project)?;
        if processes(&state)?.iter().any(|p|p.project_id==project_id && p.status=="running") || baboon_native::has_running(&project_id)? {return Err("Save and close this map's native editing/test tools, including Baboon, before compiling its working tags".into());}
        let settings=tool_settings(&state,Some(&project))?;official_h1a_kit(&state,&settings)?;
        let (tool,_,_)=inspect_tool_file(&settings,"haloTool")?;
        let tools=build::Toolchain{invader_directory:settings.invader_directory.clone(),..Default::default()};
        let invader_info=build::tool_path(&tools,"invader-info").ok_or("Configure Invader info before verifying a working-tag build")?;
        verify_compiler_location(&state,&forge_build::ForgeToolchain{hek_directory:settings.hek_directory.clone(),hek_flavor:settings.hek_flavor.clone(),invader_directory:settings.invader_directory.clone(),hek_tags_directory:Some(context.tags.clone())})?;
        let scenario_type=if project.quick_forge.is_some(){1}else{inspect(&state,&project)?.header.scenario_type};
        let mut input=core::working_tags::WorkingTagsInput{bsp_audio,parent_build:context.build,tags_directory:context.tags,scenario_path:context.scenario_path,scenario_type,tool,invader_info};
        snapshot_project_state(&state,&project,WORKING_TAG_SNAPSHOT_REASON)?;
        let job_id=uuid::Uuid::new_v4().to_string();let cancel=Arc::new(AtomicBool::new(false));
        let mut jobs=lock(&state.jobs)?;if !jobs.is_empty(){return Err("Another build is running; wait for completion or cancel it first".into());}jobs.insert(job_id.clone(),cancel.clone());drop(jobs);
        let jobs_root=state.root.join("jobs");let returned=job_id.clone();let worker_app=app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let state=worker_app.state::<AppState>();
            let result=baboon_native::compilation_source(&state,&project,&input.parent_build,&input.tags_directory,cancel.clone()).and_then(|tags|{
                input.tags_directory=tags;
                core::working_tags::run_build_from_tags(&project,&input,&jobs_root,&job_id,cancel,|e|event(&worker_app,e)).map_err(error)
            });
            let result=result.and_then(|record|{let library=lock(&state.library)?;let mut current=library.get(&project_id).map_err(error)?;current.builds.push(record);current.modified_at=chrono::Utc::now().to_rfc3339();library.save(&current,None).map_err(error)});
            if let Err(message)=result{event(&worker_app,JobEvent{job_id:job_id.clone(),project_id,phase:"failed".into(),severity:"error".into(),message,progress:100,timestamp:chrono::Utc::now().to_rfc3339()});}
            if let Ok(mut jobs)=state.jobs.lock(){jobs.remove(&job_id);}
            let _=worker_app.emit("spark:library-changed",());
        });
        Ok(returned)
    }).await.map_err(error)?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ListingView {
    listing: Option<servers::CommunityListing>,
    stale: bool,
    refresh_after_unix: u64,
    fetching: bool,
    error: Option<String>,
}

fn listing_view(state: &AppState) -> Reply<ListingView> {
    let workbench = lock(&state.runtime_workbench)?;
    let time = now();
    Ok(ListingView {
        stale: workbench
            .listing
            .as_ref()
            .is_none_or(|l| time >= l.expires_at_unix),
        listing: workbench.listing.clone(),
        refresh_after_unix: time + workbench.listing_gate.seconds_until_refresh(time),
        fetching: workbench.fetching,
        error: workbench.fetch_error.clone(),
    })
}

fn fetch_listing() -> Reply<servers::CommunityListing> {
    let client = reqwest::blocking::Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(servers::REQUEST_TIMEOUT_SECONDS))
        .user_agent("Project-Guilty-Spark/0.4 C34 read-only server browser")
        .build()
        .map_err(error)?;
    let response = client
        .get(servers::DELTA_LIST_URL)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .map_err(|_| {
            "Community listing is unavailable. Check the connection and try again after 30 seconds."
                .to_string()
        })?;
    if !response.status().is_success() {
        return Err(format!(
            "Community provider returned HTTP {}. No game server was contacted.",
            response.status().as_u16()
        ));
    }
    if !response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|h| h.to_str().ok())
        .is_some_and(|v| {
            v.split(';')
                .next()
                .is_some_and(|media| media.trim().eq_ignore_ascii_case("application/json"))
        })
    {
        return Err("Community provider returned an unexpected content type; expected JSON".into());
    }
    if response
        .content_length()
        .is_some_and(|size| size > servers::MAX_LISTING_BYTES as u64)
    {
        return Err("Community listing exceeds 1 MiB".into());
    }
    let mut bytes = vec![];
    response
        .take((servers::MAX_LISTING_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(error)?;
    servers::parse_delta_listing(&bytes, now()).map_err(error)
}

#[tauri::command]
pub(super) async fn community_listing(app: tauri::AppHandle, refresh: bool) -> Reply<ListingView> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        if refresh {
            let allowed = {
                let mut workbench = lock(&state.runtime_workbench)?;
                if workbench.fetching || workbench.listing_gate.seconds_until_refresh(now()) > 0 {
                    false
                } else {
                    workbench.listing_gate.begin_refresh(now()).map_err(error)?;
                    workbench.fetching = true;
                    true
                }
            };
            if allowed {
                let result = fetch_listing();
                let mut workbench = lock(&state.runtime_workbench)?;
                workbench.fetching = false;
                match result {
                    Ok(listing) => {
                        workbench.listing = Some(listing);
                        workbench.fetch_error = None;
                    }
                    Err(e) => workbench.fetch_error = Some(e),
                }
            }
        }
        listing_view(&state)
    })
    .await
    .map_err(error)?
}

fn selected_server(state: &AppState, server_id: &str) -> Reply<servers::CommunityServer> {
    let workbench = lock(&state.runtime_workbench)?;
    let listing = workbench
        .listing
        .as_ref()
        .ok_or("Refresh the provider listing before selecting a game")?;
    if now() >= listing.expires_at_unix {
        return Err("This listing expired; refresh before joining".into());
    }
    listing
        .servers
        .iter()
        .find(|s| s.id == server_id)
        .cloned()
        .ok_or("This game is no longer in the current provider listing".into())
}

pub(super) fn client_profile(
    state: &AppState,
    id: runtime::RuntimeId,
) -> Reply<(
    runtime::RuntimeRegistration,
    servers::CommunityClientProfile,
    String,
    String,
    PathBuf,
)> {
    let registration = runtime_registration(state, id)?;
    let installation = runtime::inspect_registration(&registration).map_err(error)?;
    let inventory = runtime::inventory_maps(&registration).map_err(error)?;
    let profile = servers::profile_from_inventory(&registration, &installation, &inventory);
    let executable_sha256 = installation
        .executable_sha256
        .ok_or("The registered executable identity could not be inspected")?;
    use sha2::Digest;
    let mut identities = std::collections::BTreeMap::new();
    for file in &inventory.maps {
        identities.insert(format!("map:{}", file.relative_path), file.sha256.clone());
    }
    for file in &inventory.resources {
        identities.insert(
            format!("resource:{}", file.relative_path),
            file.sha256.clone(),
        );
    }
    identities.insert(
        "registration".into(),
        Some(serde_json::to_string(&registration).map_err(error)?),
    );
    let content_identity = format!(
        "{:x}",
        sha2::Sha256::digest(serde_json::to_vec(&identities).map_err(error)?)
    );
    Ok((
        registration,
        profile,
        executable_sha256,
        content_identity,
        installation.data_root,
    ))
}

#[tauri::command]
pub(super) async fn community_join_preflight(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    server_id: String,
    runtime_id: runtime::RuntimeId,
) -> Reply<JoinPreview> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state=app.state::<AppState>();let server=selected_server(&state,&server_id)?;
        if !runtime_id.is_native() {
            return Ok(JoinPreview{assessment:servers::JoinAssessment{readiness:servers::JoinReadiness::Blocked,runtime_id,registration_id:String::new(),issues:vec![servers::JoinIssue{code:"wrongRuntime".into(),summary:"Choose a ChupathingyCE or OpenCE installation for this provider. MCC and classic CE clients use different session protocols.".into(),setup_route:"runtimeSetup".into()}],limitations:vec!["The active map/runtime was not switched. Choose its matching provider or explicitly select a community runtime.".into()],connection_outcome:"notObserved".into()},preflight_id:None,executable_sha256:String::new(),data_root:None,expires_at_unix:server.fetched_at_unix+servers::LISTING_TTL_SECONDS});
        }
        let (_,profile,executable_sha256,content_identity,data_root)=client_profile(&state,runtime_id)?;
        let assessment=servers::assess_join(&server,&profile);
        let expires_at_unix=server.fetched_at_unix+servers::LISTING_TTL_SECONDS;
        if now()>=expires_at_unix{return Err("The listing expired during local content inspection; refresh and check again".into());}
        let preflight_id=if assessment.readiness==servers::JoinReadiness::ReadyForRuntimeCheck {
            let id=uuid::Uuid::new_v4().to_string();let mut workbench=lock(&state.runtime_workbench)?;
            if app.get_webview_window(&owner).is_none(){return Err("The requesting window closed during inspection".into());}
            workbench.joins.retain(|_,p|p.expires_at_unix>now() && !(p.owner==owner && p.server_id==server_id));
            if workbench.joins.len()>=32{return Err("Too many pending join previews; wait for an old preview to expire".into());}
            workbench.joins.insert(id.clone(),PendingJoin{owner,runtime_id,registration_id:profile.registration_id.clone(),server_id,executable_sha256:executable_sha256.clone(),content_identity,data_root:data_root.clone(),expires_at_unix});Some(id)
        }else{None};
        Ok(JoinPreview{assessment,preflight_id,executable_sha256,data_root:Some(data_root),expires_at_unix})
    }).await.map_err(error)?
}

fn validate_join_preview(
    preview: &PendingJoin,
    owner: &str,
    server_id: &str,
    runtime_id: runtime::RuntimeId,
    registration_id: &str,
    exe_hash: &str,
    content_identity: &str,
    time: u64,
) -> Reply<()> {
    if preview.owner != owner
        || preview.server_id != server_id
        || preview.runtime_id != runtime_id
        || preview.registration_id != registration_id
        || time >= preview.expires_at_unix
    {
        return Err("Join preview expired or no longer belongs to this window/runtime/game; check requirements again".into());
    }
    if preview.executable_sha256 != exe_hash || preview.content_identity != content_identity {
        return Err("The inspected runtime or content changed after your join preview; check requirements again".into());
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct JoinHandoff {
    process_id: u32,
    status: String,
    detail: String,
}

#[tauri::command]
pub(super) async fn community_join(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    server_id: String,
    runtime_id: runtime::RuntimeId,
    preflight_id: String,
    confirmed: bool,
) -> Reply<JoinHandoff> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        if !confirmed{return Err("Confirm the selected runtime and game before handing off the invitation".into());}
        let state=app.state::<AppState>();let server=selected_server(&state,&server_id)?;
        let preview={let mut workbench=lock(&state.runtime_workbench)?;if workbench.joins.get(&preflight_id).is_some_and(|preview|preview.owner!=owner){return Err("This join preview belongs to another window".into());}workbench.joins.remove(&preflight_id).ok_or("This join preview expired or was already used; check requirements again")?};
        let (registration,profile,expected_hash,content_identity,data_root)=client_profile(&state,runtime_id)?;
        validate_join_preview(&preview,&owner,&server_id,runtime_id,&registration.id,&expected_hash,&content_identity,now())?;
        if preview.data_root!=data_root{return Err("The selected runtime data folder changed after preview".into());}
        let target=servers::prepare_join(&server,&profile,now()).map_err(error)?;
        let plan=runtime::prepare_launch(&registration).map_err(error)?;
        if maps::hash_file(&plan.executable).map_err(error)?!=expected_hash{return Err("The runtime executable changed during the join check; inspect it again before launching".into());}
        let protected=fs::canonicalize(&state.root).map_err(error)?;
        if plan.executable.starts_with(protected.join("archives")) || plan.executable.starts_with(protected.join("Inbox")){return Err("Imported executables cannot be launched; register a separately installed runtime".into());}
        let mut command=steam::command(plan.executable.to_string_lossy().as_ref());
        community_data_environment(&mut command,runtime_id,&data_root);
        let child=command.current_dir(&plan.cwd).arg(target.argument()).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|_|"The registered game could not start; no connection outcome is available".to_string())?;
        Ok(JoinHandoff{process_id:child.id(),status:"handedOffUnobserved".into(),detail:"The documented invitation was handed to the inspected game. The game must verify the protocol and map, and may require a password in its own UI. Spark has no authenticated game connection observer yet; this is not a successful-join receipt.".into()})
    }).await.map_err(error)?
}

#[tauri::command]
pub(super) async fn mcc_owned_content_probe(
    app: tauri::AppHandle,
    target: content::ProbeTarget,
) -> Reply<content::ContentProbe> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let root = lock(&state.installation)?
            .mcc_path
            .clone()
            .ok_or("Select your owned MCC installation in Settings & tools")?;
        content::probe_installation(&root, target).map_err(error)
    })
    .await
    .map_err(error)?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn working_tag_build_snapshot_uses_the_supported_persistence_contract() {
        let directory=tempfile::tempdir().unwrap();
        let project=Project::new("Saved tool edits");
        let snapshot=core::snapshots::create(directory.path(),&project,WORKING_TAG_SNAPSHOT_REASON,10).unwrap();
        let restored=core::snapshots::preview(directory.path(),&project,&snapshot.id,&snapshot.sha256).unwrap();
        assert_eq!(restored.fingerprint().unwrap(),project.fingerprint().unwrap());
        assert_eq!(snapshot.reason,"before-build");
    }
    #[test]
    fn working_receipts_match_native_quickforge_scenario_spelling() {
        assert!(scenario_paths_match(
            "levels/quickforge/c33_collision_acceptance/c33_collision_acceptance",
            "levels\\quickforge\\c33_collision_acceptance\\c33_collision_acceptance"
        ));
        assert!(scenario_paths_match("levels/Test/A", "levels\\test\\a"));
        assert!(!scenario_paths_match("levels/a", "levels/b"));
        assert!(!scenario_paths_match("levels/../a", "levels/a"));
    }
    #[test]
    fn community_launch_binds_the_reviewed_data_and_custom_map_tree() {
        let mut command = Command::new("never-executed");
        let root = Path::new("reviewed-data");
        community_data_environment(&mut command, runtime::RuntimeId::OpenCe, root);
        let environment: std::collections::BTreeMap<_, _> = command
            .get_envs()
            .map(|(key, value)| {
                (
                    key.to_string_lossy().into_owned(),
                    value.map(|v| v.to_string_lossy().into_owned()),
                )
            })
            .collect();
        assert_eq!(
            environment.get("HALO_DATA_ROOT"),
            Some(&Some(root.to_string_lossy().into_owned()))
        );
        assert_eq!(
            environment.get("HALO_CUSTOM_MAPS_ROOT"),
            Some(&Some(
                root.join("custom_maps").to_string_lossy().into_owned()
            ))
        );
    }
    #[test]
    fn startup_scenarios_cannot_inject_engine_commands() {
        assert_eq!(
            console_scenario("levels/test/bloodgulch/bloodgulch").unwrap(),
            "levels\\test\\bloodgulch\\bloodgulch"
        );
        for value in [
            "../escape",
            "levels/a\"\r\nquit",
            "levels/foo;quit",
            "levels/with space/x",
            "C:/game/map",
        ] {
            assert!(console_scenario(value).is_err(), "{value:?}");
        }
    }
    #[test]
    fn sdk_architecture_is_not_inferred_from_the_mcc_game_process() {
        // The installed official H1A kit is x86; the reviewed MCC game is x64.
        assert!(supported_tool_machine(0x014c));
        assert!(supported_tool_machine(0x8664));
        assert!(!supported_tool_machine(0xaa64));
        assert!(!supported_tool_machine(0));
    }
    #[test]
    fn source_context_cannot_escape_its_job() {
        let temp = tempfile::tempdir().unwrap();
        let inside = temp.path().join("job");
        let other = temp.path().join("other");
        fs::create_dir(&inside).unwrap();
        fs::create_dir(&other).unwrap();
        assert!(owned_child(&inside, &other).is_err());
        assert!(owned_child(&inside, &inside).is_err());
        let file = inside.join("working.scenario");
        fs::write(&file, b"source").unwrap();
        assert_eq!(
            owned_child(&inside, &file).unwrap(),
            fs::canonicalize(file).unwrap()
        );
    }
    #[test]
    fn invitation_consent_is_bound_to_window_runtime_game_and_inspected_content() {
        let preview = PendingJoin {
            owner: "main".into(),
            runtime_id: runtime::RuntimeId::OpenCe,
            registration_id: "registered".into(),
            server_id: "server".into(),
            executable_sha256: "exeA".into(),
            content_identity: "mapsA".into(),
            data_root: PathBuf::from("reviewed-content"),
            expires_at_unix: 130,
        };
        let check = |owner, server, runtime, registration, exe, maps, time| {
            validate_join_preview(
                &preview,
                owner,
                server,
                runtime,
                registration,
                exe,
                maps,
                time,
            )
        };
        assert!(check(
            "main",
            "server",
            runtime::RuntimeId::OpenCe,
            "registered",
            "exeA",
            "mapsA",
            129
        )
        .is_ok());
        assert!(check(
            "main",
            "server",
            runtime::RuntimeId::OpenCe,
            "registered",
            "exeB",
            "mapsA",
            129
        )
        .is_err());
        assert!(check(
            "main",
            "server",
            runtime::RuntimeId::OpenCe,
            "registered",
            "exeA",
            "mapsB",
            129
        )
        .is_err());
        assert!(check(
            "other",
            "server",
            runtime::RuntimeId::OpenCe,
            "registered",
            "exeA",
            "mapsA",
            129
        )
        .is_err());
        assert!(check(
            "main",
            "other",
            runtime::RuntimeId::OpenCe,
            "registered",
            "exeA",
            "mapsA",
            129
        )
        .is_err());
        assert!(check(
            "main",
            "server",
            runtime::RuntimeId::MccSteam,
            "registered",
            "exeA",
            "mapsA",
            129
        )
        .is_err());
        assert!(check(
            "main",
            "server",
            runtime::RuntimeId::OpenCe,
            "changed",
            "exeA",
            "mapsA",
            129
        )
        .is_err());
        assert!(check(
            "main",
            "server",
            runtime::RuntimeId::OpenCe,
            "registered",
            "exeA",
            "mapsA",
            130
        )
        .is_err());
    }
    #[test]
    #[ignore = "Explicit read-only HTTPS provider check; requires internet, never joins a game"]
    fn native_community_https_listing_is_bounded_and_redacted() {
        let listing = fetch_listing().unwrap();
        assert!(listing.servers.len() <= servers::MAX_LISTING_ROWS);
        let encoded = serde_json::to_string(&listing).unwrap();
        assert!(!encoded.contains("\"invite\":"));
        assert!(!encoded.contains("halo://join/"));
        println!(
            "Native HTTPS provider: {} accepted rows, {} rejected; no game contact or join",
            listing.servers.len(),
            listing.rejected_rows
        );
    }
}
