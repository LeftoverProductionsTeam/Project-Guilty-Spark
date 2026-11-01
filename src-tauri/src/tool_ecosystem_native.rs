//! Source-aware discovery. Finding an executable never creates a tag source,
//! execution permit, runtime bridge or gameplay-compatibility result.
use super::core::tool_ecosystem as ecosystem;
use super::*;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Report {
    schema_version: u32,
    reviewed_at: String,
    project_id: Option<String>,
    context: ecosystem::Context,
    source_issue: Option<String>,
    tools: Vec<Row>,
    companion_candidates: Vec<ecosystem::CompanionCandidate>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Row {
    definition: ecosystem::Tool,
    assessment: ecosystem::Assessment,
    executable: Option<PathBuf>,
    installation_issue: Option<String>,
    external_companion: Option<external_companions_native::Status>,
    user_launcher: Option<UserLauncher>,
}
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub(super) struct UserLauncher {tool_id:String,path:PathBuf,sha256:String,architecture:String,#[serde(default)]available:bool}
fn launcher_key(id:&str)->String{format!("tool-user-launcher-{id}")}
fn launch_profile(id:&str,runtime:&str)->Reply<ecosystem::Tool>{
    let tool=ecosystem::tool(id).map_err(error)?.clone();
    if tool.mode=="integratedCli"||tool.integration=="externalCompanion"||!tool.platforms.iter().any(|p|p==std::env::consts::OS)||(!tool.runtimes.is_empty()&&!tool.runtimes.iter().any(|r|r==runtime)){return Err("Choose a compatible desktop application profile; command-line tools use their managed workflow.".into());}Ok(tool)
}
fn user_launcher(state:&AppState,id:&str)->Reply<Option<UserLauncher>>{
    let selected:Option<UserLauncher>=lock(&state.library)?.setting(&launcher_key(id)).map_err(error)?;
    Ok(selected.map(|mut item|{item.available=item.tool_id==id&&dependency_install::pe_identity(&item.path).is_ok_and(|(path,sha,arch)|path==item.path&&sha==item.sha256&&arch==item.architecture);item}))
}
#[cfg(all(test,windows))]mod launcher_tests{
    use super::*;
    #[test]fn standalone_launch_profiles_do_not_enable_commands_or_foreign_runtimes(){
        assert!(launch_profile("guerilla","mccSteam").is_ok());
        assert!(launch_profile("reclaimer","mccSteam").is_ok());
        for id in ["invaderNative","haloTool","../../arbitrary.exe","unknown"]{assert!(launch_profile(id,"mccSteam").is_err());}
        assert!(launch_profile("guerilla","openCe").is_err());
    }
}
/// Explicit owner selection registers an ordinary app launcher, not a native
/// schema, source handoff, publisher certificate or peer execution permission.
#[tauri::command]
pub(super) async fn choose_tool_launcher(app:tauri::AppHandle,runtime_id:String,tool_id:String)->Reply<Option<UserLauncher>>{
    let tool=launch_profile(&tool_id,&runtime_id)?;
    tauri::async_runtime::spawn_blocking(move||{
        let Some(file)=rfd::FileDialog::new().set_title(format!("Select installed {} application",tool.label)).add_filter("Windows application",&["exe"]).pick_file() else{return Ok(None)};
        let(path,sha256,architecture)=dependency_install::pe_identity(&file)?;
        let selected=UserLauncher{tool_id:tool.id,path,sha256,architecture,available:true};
        lock(&app.state::<AppState>().library)?.set_setting(&launcher_key(&selected.tool_id),&selected).map_err(error)?;Ok(Some(selected))
    }).await.map_err(error)?
}
#[tauri::command]
pub(super) async fn tool_ecosystem_report(
    app: tauri::AppHandle,
    runtime_id: String,
    project_id: Option<String>,
) -> Reply<Report> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let project = project_id
            .as_ref()
            .map(|id| lock(&state.library)?.get(id).map_err(error))
            .transpose()?;
        let mut settings = lock(&state.settings)?.clone();
        if let Some(target) = project.as_ref().and_then(|p| {
            p.active_build_target
                .as_ref()
                .and_then(|id| p.build_targets.iter().find(|t| &t.id == id))
        }) {
            settings.hek_directory = target.hek_directory.clone();
            settings.hek_flavor = target.hek_flavor.clone();
            settings.invader_directory = target
                .invader_directory
                .clone()
                .or(settings.invader_directory);
        }
        if runtime_id=="mccSteam"&&settings.hek_directory.is_none(){
            settings.hek_directory=lock(&state.installation)?.editing_tools.clone();
            if settings.hek_directory.is_some(){settings.hek_flavor=Some("h1aEk".into());}
        }
        let source_kind = project.as_ref().map_or("none", |p| {
            if p.quick_forge.is_some() {
                "forgeSource"
            } else {
                match p.source.as_ref().map(|s| s.cache_version) {
                    Some(13) => "mccCache",
                    Some(5) => "xboxCache",
                    Some(6 | 7 | 609) => "classicCache",
                    _ => "other",
                }
            }
        });
        let (owned_native_tags, source_issue) = if let Some(p) = &project {
            match current_native_build(&state, p)
                .and_then(|b| runtime_workbench::compiled_tags(&state, p, &b))
            {
                Ok(_) => (true, None),
                Err(e) => (false, Some(e)),
            }
        } else {
            (
                false,
                Some("Open a map to assess its source format and working tags.".into()),
            )
        };
        let context = ecosystem::Context {
            runtime_id,
            family: "halo1".into(),
            host: std::env::consts::OS.into(),
            flavor: settings.hek_flavor.clone(),
            source_kind: source_kind.into(),
            owned_native_tags,
            cache_version: project
                .as_ref()
                .and_then(|p| p.source.as_ref().map(|s| s.cache_version)),
        };
        let catalog = ecosystem::catalog().map_err(error)?;
        let mut tools = Vec::new();
        for definition in &catalog.tools {
            let mut installed = ecosystem::Installation::default();
            let mut executable = None;
            let mut installation_issue = None;
            let external_companion = if definition.integration == "externalCompanion" {
                external_companions_native::status(&state)?
            } else {
                None
            };
            if let Some(value) = &external_companion {
                installed.found = value.available;
                installed.sha256 = Some(value.registration.executable_sha256.clone());
                executable = Some(value.registration.path.clone());
                if !value.available {
                    installation_issue = Some(value.detail.clone());
                }
            } else if definition.location == "baboon" {
                match baboon_native::installation(&state) {
                    Ok(value) => {
                        installed.found = true;
                        installed.sha256 = Some(value.executable_sha256);
                        installed.version = Some(value.version);
                        executable = Some(value.executable);
                    }
                    Err(e) => installation_issue = Some(e),
                }
            } else if let Some(filename) = definition.filename.as_ref() {
                let directory = if definition.location == "hek" {
                    settings.hek_directory.as_ref()
                } else if definition.location == "invader" {
                    settings.invader_directory.as_ref()
                } else {
                    None
                };
                if let Some(directory) = directory {
                    let file = directory.join(filename);
                    let checked = (|| -> Reply<Option<PathBuf>> {
                        core::reject_links(directory).map_err(error)?;
                        core::reject_links(&file).map_err(error)?;
                        if !file.is_file() {
                            return Ok(None);
                        }
                        let size = fs::metadata(&file).map_err(error)?.len();
                        if size == 0 || size > 256 * 1024 * 1024 {
                            return Err("Executable exceeds the discovery bounds".into());
                        }
                        let path = fs::canonicalize(&file).map_err(error)?;
                        if path.parent()
                            != Some(fs::canonicalize(directory).map_err(error)?.as_path())
                        {
                            return Err("Executable escaped the configured tool folder".into());
                        }
                        Ok(Some(path))
                    })();
                    match checked {
                        Ok(Some(path)) => {
                            installed.found = true;
                            if definition.sha256.is_some() {
                                installed.sha256 = Some(maps::hash_file(&path).map_err(error)?);
                            }
                            executable = Some(path);
                        }
                        Ok(None) => {}
                        Err(e) => installation_issue = Some(e),
                    }
                }
            }
            let assessment = ecosystem::assess(definition, &context, &installed);
            let user_launcher=user_launcher(&state,&definition.id)?;
            tools.push(Row {
                definition: definition.clone(),
                assessment,
                executable,
                installation_issue,
                external_companion,
                user_launcher,
            });
        }
        Ok(Report {
            schema_version: 1,
            reviewed_at: catalog.reviewed_at.clone(),
            project_id,
            context,
            source_issue,
            tools,
            companion_candidates: catalog.companion_candidates.clone(),
        })
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub(super) async fn launch_discovered_tool(app:tauri::AppHandle,window:tauri::WebviewWindow,runtime_id:String,project_id:Option<String>,tool_id:String)->Reply<String> {
    if let Some(id)=&project_id {check_document_owner(&app.state::<AppState>(),id,window.label())?;}
    let profile=launch_profile(&tool_id,&runtime_id)?;
    let report=tool_ecosystem_report(app.clone(),runtime_id,project_id).await?;
    let row=report.tools.into_iter().find(|r|r.definition.id==tool_id).ok_or("Unknown catalog tool")?;
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();let folder=state.root.join("tool-launches").join(uuid::Uuid::new_v4().to_string());core::reject_links(&folder).map_err(error)?;fs::create_dir_all(folder.join("tags")).map_err(error)?;fs::create_dir(folder.join("data")).map_err(error)?;
        let selected=user_launcher(&state,&tool_id)?;
        let (executable,cwd)=if let Some(selected)=selected{
            if !selected.available{return Err("The selected application changed or is missing. Locate it again before launching; no process was started.".into());}
            (selected.path,folder.clone())
        }else if tool_id=="baboon"{
            let kit=folder.join("kit");fs::create_dir_all(kit.join("tags")).map_err(error)?;
            let installed=baboon_native::installation(&state)?;let exe=core::baboon::prepare_instance(&installed,&folder.join("editor"),&kit).map_err(error)?;(exe,folder.clone())
        }else{
            if !["sapien","guerilla","tagTest","invaderEditor"].contains(&tool_id.as_str())||row.assessment.state=="requiresRuntime"{return Err("Locate the installed application first. Its standalone launcher does not establish a verified map handoff.".into());}
            let executable=row.executable.ok_or("Locate the installed tool or open its official download")?;(executable,folder.clone())
        };
        let(executable,identity,_)=dependency_install::pe_identity(&executable)?;
        let mut command=std::process::Command::new(&executable);command.current_dir(cwd).stdin(Stdio::null());
        if tool_id=="baboon"{command.arg("-HCEEK");}
        let child=command.spawn().map_err(error)?;
        project::atomic_write(&folder.join("launch.json"),&serde_json::to_vec_pretty(&(&tool_id,&executable,&identity,child.id())).map_err(error)?,false).map_err(error)?;
        Ok(format!("Opened {} (PID {}). No map or original tag path was passed. Use its managed map action for a verified handoff.",profile.label,child.id()))
    }).await.map_err(error)?
}
