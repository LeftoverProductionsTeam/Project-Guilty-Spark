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
    installed_version: Option<String>,
}
#[cfg(windows)]
fn file_version(path:&Path)->Option<String>{
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW,GetFileVersionInfoW,VerQueryValueW,VS_FIXEDFILEINFO};
    let file:Vec<u16>=path.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {
        let size=GetFileVersionInfoSizeW(file.as_ptr(),std::ptr::null_mut());if size==0||size>1024*1024{return None;}
        let mut bytes=vec![0u8;size as usize];if GetFileVersionInfoW(file.as_ptr(),0,size,bytes.as_mut_ptr().cast())==0{return None;}
        let mut value=std::ptr::null_mut();let mut length=0;let root=[b'\\' as u16,0];
        if VerQueryValueW(bytes.as_ptr().cast(),root.as_ptr(),&mut value,&mut length)==0||value.is_null()||length<std::mem::size_of::<VS_FIXEDFILEINFO>() as u32{return None;}
        let info=std::ptr::read_unaligned(value.cast::<VS_FIXEDFILEINFO>());
        if info.dwSignature!=0xfeef04bd{return None;}
        Some(format!("{}.{}.{}.{}",info.dwFileVersionMS>>16,info.dwFileVersionMS&65535,info.dwFileVersionLS>>16,info.dwFileVersionLS&65535))
    }
}
#[cfg(not(windows))]fn file_version(_path:&Path)->Option<String>{None}
fn installed_blender()->Option<PathBuf>{
    let root=PathBuf::from(std::env::var_os("ProgramFiles")?).join("Blender Foundation");core::reject_links(&root).ok()?;
    let mut folders=fs::read_dir(root).ok()?.take(32).filter_map(|item|item.ok()).filter(|e|e.file_name().to_string_lossy().starts_with("Blender ")).map(|e|e.path()).collect::<Vec<_>>();folders.sort();
    folders.into_iter().rev().map(|p|p.join("blender.exe")).find(|p|p.is_file()&&core::reject_links(p).is_ok())
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
// Standalone launch is still distinct from a source handoff. Reject a missing,
// changed or invalid executable before allocating even an empty launch folder.
fn standalone_folder(root:&Path,candidate:&Path)->Reply<(PathBuf,String,PathBuf)>{
    let(executable,identity,_)=dependency_install::pe_identity(candidate)?;
    let folder=root.join("tool-launches").join(uuid::Uuid::new_v4().to_string());
    core::reject_links(&folder).map_err(error)?;
    // Read-only admission also refuses source-checkout output; it must not
    // create the storage ledger merely to assess a failed launch.
    core::storage::Store::existing_for_output(&folder).map_err(error)?;
    fs::create_dir_all(folder.join("tags")).map_err(error)?;
    fs::create_dir(folder.join("data")).map_err(error)?;
    Ok((executable,identity,folder))
}
#[cfg(all(test,windows))]mod launcher_tests{
    use super::*;
    #[test]fn standalone_launch_profiles_do_not_enable_commands_or_foreign_runtimes(){
        assert!(launch_profile("guerilla","mccSteam").is_ok());
        assert!(launch_profile("reclaimer","mccSteam").is_ok());
        for id in ["invaderNative","haloTool","../../arbitrary.exe","unknown"]{assert!(launch_profile(id,"mccSteam").is_err());}
        assert!(launch_profile("guerilla","openCe").is_err());
    }
    #[test]fn invalid_standalone_executable_allocates_no_launch_or_storage_folder(){
        let parent=tempfile::tempdir().unwrap();let root=parent.path().join("application");
        assert!(standalone_folder(&root,&parent.path().join("missing.exe")).is_err());
        let bad=parent.path().join("not-a-program.exe");fs::write(&bad,b"invalid executable").unwrap();
        assert!(standalone_folder(&root,&bad).is_err());
        assert!(!root.exists());assert_eq!(fs::read(&bad).unwrap(),b"invalid executable");
    }
    #[test]fn standalone_preflight_refuses_source_checkout_before_allocating(){
        let parent=tempfile::tempdir().unwrap();let root=parent.path();
        fs::write(root.join("Cargo.toml"),"# source fixture").unwrap();fs::write(root.join("AGENTS.md"),"owner").unwrap();
        assert!(standalone_folder(root,&std::env::current_exe().unwrap()).is_err());
        assert!(!root.join("tool-launches").exists());assert!(!root.join("artifacts").exists());
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
            geometry_source: project.as_ref().is_some_and(|p|p.assets.iter().any(|a|a.kind=="obj")||p.quick_forge.is_some()),
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
            } else if definition.id=="blenderHalo" {
                if let Some(path)=installed_blender(){installed.found=true;executable=Some(path);}
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
            let installed_version=installed.version.clone().or_else(||if installed.sha256.is_some()&&installed.sha256==definition.sha256{definition.version.clone()}else{None})
                .or_else(||user_launcher.as_ref().filter(|l|l.available).map(|l|&l.path).or(executable.as_ref()).and_then(|p|file_version(p)));
            tools.push(Row {
                definition: definition.clone(),
                assessment,
                executable,
                installation_issue,
                external_companion,
                user_launcher,
                installed_version,
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
        let state=app.state::<AppState>();
        let selected=user_launcher(&state,&tool_id)?;
        let installed=if selected.is_none()&&tool_id=="baboon"{Some(baboon_native::installation(&state)?)}else{None};
        let candidate=if let Some(selected)=selected{
            if !selected.available{return Err("The selected application changed or is missing. Locate it again before launching; no process was started.".into());}
            selected.path
        }else if let Some(installed)=&installed{
            installed.executable.clone()
        }else if tool_id=="blenderHalo"{
            row.executable.ok_or("Locate an installed Blender application")?
        }else{
            if !["sapien","guerilla","tagTest","invaderEditor"].contains(&tool_id.as_str())||row.assessment.state=="requiresRuntime"{return Err("Locate the installed application first. Its standalone launcher does not establish a verified map handoff.".into());}
            row.executable.ok_or("Locate the installed tool or open its official download")?
        };
        let(mut executable,identity,folder)=standalone_folder(&state.root,&candidate)?;
        if let Some(installed)=installed{
            let kit=folder.join("kit");fs::create_dir_all(kit.join("tags")).map_err(error)?;
            executable=core::baboon::prepare_instance(&installed,&folder.join("editor"),&kit).map_err(error)?;
            if dependency_install::pe_identity(&executable)?.1!=identity{return Err("The prepared application differs from its verified installation; no process was started.".into());}
        }
        let mut command=std::process::Command::new(&executable);command.current_dir(&folder).stdin(Stdio::null());
        if tool_id=="baboon"{command.arg("-HCEEK");}
        if tool_id=="blenderHalo"{command.arg("--disable-autoexec");}
        let child=command.spawn().map_err(error)?;
        project::atomic_write(&folder.join("launch.json"),&serde_json::to_vec_pretty(&(&tool_id,&executable,&identity,child.id())).map_err(error)?,false).map_err(error)?;
        Ok(format!("Opened {} (PID {}). No map or original tag path was passed. Use its managed map action for a verified handoff.",profile.label,child.id()))
    }).await.map_err(error)?
}

#[tauri::command]
pub(super) async fn prepare_geometry_handoff(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String,asset_id:String)->Reply<core::geometry_exchange::Prepared>{
    let owner=window.label().to_string();tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;
        let lib=lock(&state.library)?;
        core::geometry_exchange::prepare(&lib,&project_id,&asset_id).map_err(error)
    }).await.map_err(error)?
}
#[tauri::command]
pub(super) async fn review_geometry_handoff(app:tauri::AppHandle,project_id:String,id:String)->Reply<core::geometry_exchange::Review>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let lib=lock(&state.library)?;core::geometry_exchange::review(&lib,&project_id,&id).map_err(error)}).await.map_err(error)?
}
#[tauri::command]
pub(super) async fn geometry_handoff_status(app:tauri::AppHandle,project_id:String,id:String)->Reply<core::geometry_exchange::Stamp>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let lib=lock(&state.library)?;core::geometry_exchange::stamp(&lib,&project_id,&id).map_err(error)}).await.map_err(error)?
}
#[tauri::command]
pub(super) async fn launch_geometry_tool(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String,id:String)->Reply<String>{
    let owner=window.label().to_string();tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;
        let prepared=core::geometry_exchange::prepared(&*lock(&state.library)?,&project_id,&id).map_err(error)?;
        let selected=user_launcher(&state,"blenderHalo")?;
        let executable=if let Some(selected)=selected{if !selected.available{return Err("The selected Blender application changed. Locate it again before launch.".into());}selected.path}else{installed_blender().ok_or("Install or locate Blender in Games & tools first")?};
        let(executable,sha256,_)=dependency_install::pe_identity(&executable)?;
        let folder=prepared.working_path.parent().ok_or("Invalid geometry handoff directory")?;
        let launches=folder.join("launches");core::reject_links(&launches).map_err(error)?;fs::create_dir_all(&launches).map_err(error)?;
        if fs::read_dir(&launches).map_err(error)?.count()>=16{return Err("This handoff retains sixteen launch records; keep it for recovery and prepare another before launching again.".into());}
        let child=std::process::Command::new(&executable).arg("--disable-autoexec").current_dir(folder).stdin(Stdio::null()).spawn().map_err(error)?;
        project::atomic_write(&launches.join(format!("{}.json",uuid::Uuid::new_v4())),&serde_json::to_vec_pretty(&serde_json::json!({"tool":"blenderHalo","pid":child.id(),"executable":executable,"sha256":sha256,"arguments":["--disable-autoexec"],"writerConfirmed":false})).map_err(error)?,false).map_err(error)?;
        Ok(format!("Opened Blender (PID {}). Import working.obj, edit, then export OBJ back to the displayed working path. No script or native tag was passed.",child.id()))
    }).await.map_err(error)?
}
