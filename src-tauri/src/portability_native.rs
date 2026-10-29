//! Source-bound, read-only preflight. Exports go only to a fresh project-owned
//! report directory; no native tag, SDK master, installed map or game is changed.
use super::*;
use spark_core::portability;

fn context(state: &AppState, id: &str, owner: &str) -> Reply<(Project, Arc<maps::MapInspection>)> {
    check_document_owner(state, id, owner)?;
    let project = lock(&state.library)?.get(id).map_err(error)?;
    let source = project
        .source
        .as_ref()
        .ok_or("Open a source map before checking native portability")?;
    core::reject_links(&source.preserved_path).map_err(error)?;
    if maps::hash_file(&source.preserved_path).map_err(error)? != source.sha256 {
        return Err("Preserved source changed; portability check cancelled".into());
    }
    let inspection = inspect(state, &project)?;
    Ok((project, inspection))
}
#[tauri::command]
pub(super) fn portability_profiles() -> Vec<core::runtime_adapters::RuntimeAdapterProfile> {
    portability::profiles()
}

#[tauri::command]
pub(super) async fn inspect_portability(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    targets: Vec<String>,
) -> Reply<portability::Report> {
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let (p, i) = context(&state, &project_id, &owner)?;
        portability::assess(&p, &i, &targets, &project_tools(&state, &p)?).map_err(error)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub(super) async fn verify_native_preservation(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
) -> Reply<portability::Preservation> {
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let (p, i) = context(&state, &project_id, &owner)?;
        Ok(portability::verify_preservation(&p, &i).map_err(error)?.1)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub(super) async fn compare_portability(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    build_id: String,
) -> Reply<portability::SemanticDiff> {
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let (p, i) = context(&state, &project_id, &owner)?;
        let build = verified_build(&state, &p, &build_id)?;
        let output = build.output.ok_or("No validated build output")?;
        let target = maps::inspect_map(&output, None).map_err(error)?;
        portability::compare(&i, &target).map_err(error)
    })
    .await
    .map_err(error)?
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SavedReport {
    json: PathBuf,
    markdown: PathBuf,
}
#[tauri::command]
pub(super) async fn save_portability_report(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    targets: Vec<String>,
) -> Reply<SavedReport> {
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let (p, i) = context(&state, &project_id, &owner)?;
        let report =
            portability::assess(&p, &i, &targets, &project_tools(&state, &p)?).map_err(error)?;
        let fingerprint = p.fingerprint().map_err(error)?;
        let library = lock(&state.library)?;
        check_document_owner(&state, &project_id, &owner)?;
        if library
            .get(&project_id)
            .map_err(error)?
            .fingerprint()
            .map_err(error)?
            != fingerprint
        {
            return Err("Project changed while preparing its report; inspect again".into());
        }
        let root = library
            .project_dir(&project_id)
            .map_err(error)?
            .join("portability-reports");
        core::reject_links(&root).map_err(error)?;
        fs::create_dir_all(&root).map_err(error)?;
        let folder = root.join(uuid::Uuid::new_v4().to_string());
        fs::create_dir(&folder).map_err(error)?;
        let json = folder.join("portability.json");
        let markdown = folder.join("portability.md");
        project::atomic_write(
            &json,
            &serde_json::to_vec_pretty(&report).map_err(error)?,
            false,
        )
        .map_err(error)?;
        project::atomic_write(&markdown, portability::markdown(&report).as_bytes(), false)
            .map_err(error)?;
        Ok(SavedReport { json, markdown })
    })
    .await
    .map_err(error)?
}
