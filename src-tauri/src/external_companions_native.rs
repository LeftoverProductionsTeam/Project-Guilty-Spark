//! Opt-in, no-argument external companions. This is separate from legacy tools:
//! a saved executable never grants a different runtime/cache any compatibility.
use super::core::tool_ecosystem as ecosystem;
use super::*;
use std::process::Command;

const TOOL: &str = "openceMantle";
const KEY: &str = "externalCompanion-openceMantle";
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Registration {
    id: String,
    tool_id: String,
    pub path: PathBuf,
    pub executable_sha256: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Status {
    pub registration: Registration,
    pub available: bool,
    pub detail: String,
}
fn eligible(context: &ecosystem::Context, launch: bool) -> Reply<()> {
    let tool = ecosystem::tool(TOOL).map_err(error)?;
    if !tool.runtimes.contains(&context.runtime_id) || !tool.platforms.contains(&context.host) {
        return Err("OpenCE Mantle is an optional Windows Halo Custom Edition companion, not an MCC or other-runtime adapter.".into());
    }
    if launch
        && !ecosystem::assess(
            tool,
            context,
            &ecosystem::Installation {
                found: true,
                ..Default::default()
            },
        )
        .can_use_workflow
    {
        return Err("Open a genuine Halo Custom Edition PC cache (609) before launching Mantle from this map. A .map extension or runtime selection alone is insufficient.".into());
    }
    Ok(())
}
fn context(
    state: &AppState,
    runtime_id: String,
    project_id: Option<String>,
) -> Reply<ecosystem::Context> {
    let project = project_id
        .as_ref()
        .map(|id| lock(&state.library)?.get(id).map_err(error))
        .transpose()?;
    Ok(ecosystem::Context {
        runtime_id,
        family: "halo1".into(),
        host: std::env::consts::OS.into(),
        flavor: None,
        source_kind: if project.as_ref().is_some_and(|p| {
            p.quick_forge.is_none() && p.source.as_ref().is_some_and(|s| s.cache_version == 609)
        }) {
            "classicCache"
        } else {
            "none"
        }
        .into(),
        owned_native_tags: false,
        cache_version: project.and_then(|p| p.source.map(|s| s.cache_version)),
    })
}
fn inspect(reg: &Registration, root: &Path) -> Reply<()> {
    uuid::Uuid::parse_str(&reg.id).map_err(error)?;
    if reg.tool_id != TOOL {
        return Err("Unknown external companion registration".into());
    }
    let (path, sha) = crate::legacy_companions::fingerprint(&reg.path, "windows-pe", root)?;
    if path != reg.path || sha != reg.executable_sha256 {
        return Err(
            "The selected application changed. Review it and select it again before launching."
                .into(),
        );
    }
    Ok(())
}
pub(super) fn status(state: &AppState) -> Reply<Option<Status>> {
    let registration: Option<Registration> = lock(&state.library)?.setting(KEY).map_err(error)?;
    Ok(registration.map(|registration| {
        let checked = inspect(&registration, &state.root);
        Status {
            available: checked.is_ok(),
            detail: checked.err().unwrap_or_else(|| "Selected file matches its registered SHA-256. Product/version identity and actual application behavior are unverified.".into()),
            registration,
        }
    }))
}
fn launch_plan(
    reg: &Registration,
    root: &Path,
    context: &ecosystem::Context,
    confirmed: bool,
) -> Reply<Command> {
    if !confirmed {
        return Err("Confirm the external application launch first.".into());
    }
    eligible(context, true)?;
    inspect(reg, root)?;
    // No shell, source file, map, user argument, or invented CLI flag.
    let mut command = Command::new(&reg.path);
    command.current_dir(
        reg.path
            .parent()
            .ok_or("Application has no parent folder")?,
    );
    Ok(command)
}
#[tauri::command]
pub(super) async fn choose_external_companion_path(
    app: tauri::AppHandle,
    runtime_id: String,
    project_id: Option<String>,
) -> Reply<Option<PathBuf>> {
    eligible(
        &context(&app.state::<AppState>(), runtime_id, project_id)?,
        false,
    )?;
    Ok(rfd::AsyncFileDialog::new()
        .set_title("Choose an installed OpenCE Mantle application, not its installer")
        .add_filter("Windows application", &["exe"])
        .pick_file()
        .await
        .map(|file| file.path().to_path_buf()))
}
#[tauri::command]
pub(super) async fn register_external_companion(
    app: tauri::AppHandle,
    runtime_id: String,
    project_id: Option<String>,
    path: PathBuf,
) -> Reply<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        eligible(&context(&state, runtime_id, project_id)?, false)?;
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        if ["setup", "installer", "uninstall"]
            .iter()
            .any(|part| name.contains(part))
        {
            return Err(
                "Select the installed or portable application, not an installer/uninstaller."
                    .into(),
            );
        }
        let (path, executable_sha256) =
            crate::legacy_companions::fingerprint(&path, "windows-pe", &state.root)?;
        let registration = Registration {
            id: uuid::Uuid::new_v4().to_string(),
            tool_id: TOOL.into(),
            path,
            executable_sha256,
        };
        lock(&state.library)?
            .set_setting(KEY, &Some(registration))
            .map_err(error)?;
        Ok(())
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub(super) async fn forget_external_companion(app: tauri::AppHandle) -> Reply<()> {
    lock(&app.state::<AppState>().library)?
        .set_setting(KEY, &None::<Registration>)
        .map_err(error)
}
#[tauri::command]
pub(super) async fn launch_external_companion(
    app: tauri::AppHandle,
    runtime_id: String,
    project_id: Option<String>,
    confirm_external_launch: bool,
) -> Reply<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let context = context(&state, runtime_id, project_id)?;
        let registration: Option<Registration> = lock(&state.library)?.setting(KEY).map_err(error)?;
        let mut command = launch_plan(&registration.ok_or("Select an installed Mantle application first")?, &state.root, &context, confirm_external_launch)?;
        let child = command.spawn().map_err(error)?;
        Ok(format!("Mantle launch requested (process {}). Actual startup/save behavior is unverified. No map or source path was passed; open an isolated copy inside Mantle.", child.id()))
    }).await.map_err(error)?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn no_argument_plan_is_runtime_cache_consent_and_hash_bound() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("library");
        fs::create_dir(&root).unwrap();
        let file = temp.path().join("companion-fixture.exe");
        // A format fixture, never executable code or an application acceptance test.
        let mut bytes = vec![0; 256];
        bytes[..2].copy_from_slice(b"MZ");
        bytes[60..64].copy_from_slice(&64u32.to_le_bytes());
        bytes[64..68].copy_from_slice(b"PE\0\0");
        bytes[68..70].copy_from_slice(&0x8664u16.to_le_bytes());
        fs::write(&file, bytes).unwrap();
        let (path, executable_sha256) =
            crate::legacy_companions::fingerprint(&file, "windows-pe", &root).unwrap();
        let reg = Registration {
            id: uuid::Uuid::new_v4().to_string(),
            tool_id: TOOL.into(),
            path,
            executable_sha256,
        };
        let mut context = ecosystem::Context {
            runtime_id: "haloCustomEdition".into(),
            family: "halo1".into(),
            host: "windows".into(),
            flavor: None,
            source_kind: "classicCache".into(),
            cache_version: Some(609),
            owned_native_tags: false,
        };
        assert!(launch_plan(&reg, &root, &context, false).is_err());
        let command = launch_plan(&reg, &root, &context, true).unwrap();
        assert_eq!(command.get_program(), reg.path.as_os_str());
        assert_eq!(command.get_args().count(), 0);
        context.runtime_id = "mccSteam".into();
        assert!(launch_plan(&reg, &root, &context, true).is_err());
        context.runtime_id = "haloCustomEdition".into();
        for cache in [None, Some(5), Some(6), Some(7), Some(13)] {
            context.cache_version = cache;
            assert!(launch_plan(&reg, &root, &context, true).is_err());
        }
        context.cache_version = Some(609);
        fs::write(file, b"tampered").unwrap();
        assert!(launch_plan(&reg, &root, &context, true).is_err());
    }
}
