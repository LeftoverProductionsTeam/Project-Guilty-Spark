//! Accepted native revisions produced by managed operations. C37 Baboon source
//! receipts remain valid. A later Baboon revision supersedes an operation's
//! selection automatically, without two competing writes to source settings.
use super::*;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Selection {
    pub project_id: String,
    pub fingerprint: String,
    pub parent_build_id: String,
    pub job_id: String,
    pub revision_id: String,
    pub baboon_revision_at_selection: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacySelection {
    revision_id: String,
}
fn key(project: &str) -> String {
    format!("native-operation-source-{project}")
}
fn baboon_revision(library: &core::library::Library, project: &str) -> Reply<Option<String>> {
    let value: Option<LegacySelection> = library
        .setting(&format!("baboon-source-{project}"))
        .map_err(error)?;
    Ok(value.map(|v| v.revision_id))
}
pub(super) fn legacy_revision(state: &AppState, project: &str) -> Reply<Option<String>> {
    baboon_revision(&*lock(&state.library)?, project)
}
pub(super) fn current(state: &AppState, project: &str) -> Reply<Option<Selection>> {
    lock(&state.library)?.setting(&key(project)).map_err(error)
}
pub(super) fn directory(state: &AppState, job: &str, revision: &str) -> Reply<PathBuf> {
    uuid::Uuid::parse_str(job).map_err(error)?;
    uuid::Uuid::parse_str(revision).map_err(error)?;
    let path = state
        .root
        .join("jobs")
        .join(format!("invader-{job}"))
        .join("revisions")
        .join(revision);
    core::reject_links(&path).map_err(error)?;
    Ok(path)
}
pub(super) fn retained(state: &AppState, project: &str) -> Reply<bool> {
    let value: Option<Selection> = lock(&state.library)?
        .setting(&key(project))
        .map_err(error)?;
    Ok(value.is_some())
}
pub(super) fn selected(
    state: &AppState,
    project: &Project,
    build_id: &str,
) -> Reply<Option<PathBuf>> {
    let (value, legacy) = {
        let library = lock(&state.library)?;
        (
            library
                .setting::<Option<Selection>>(&key(&project.id))
                .map_err(error)?,
            baboon_revision(&library, &project.id)?,
        )
    };
    let Some(value) = value else { return Ok(None) };
    if value.project_id != project.id {
        return Err("Native source selection belongs to another map".into());
    }
    if value.baboon_revision_at_selection != legacy
        || value.parent_build_id != build_id
        || value.fingerprint != project.fingerprint().map_err(error)?
    {
        return Ok(None);
    }
    let directory = directory(state, &value.job_id, &value.revision_id)?;
    let receipt = directory.join("source-selection.json");
    core::reject_links(&receipt).map_err(error)?;
    let stored: Selection =
        serde_json::from_slice(&bounded_read(&receipt, 16384)?).map_err(error)?;
    let tags = directory.join("tags");
    core::reject_links(&tags).map_err(error)?;
    if stored != value || !tags.is_dir() {
        return Err("The selected native source revision is unavailable; previous source and caches are retained".into());
    }
    Ok(Some(fs::canonicalize(tags).map_err(error)?))
}
pub(super) fn publish(
    state: &AppState,
    project: &Project,
    value: Selection,
    expected: Option<Selection>,
) -> Reply<PathBuf> {
    studio_native_source::require_unshared(state,&project.id)?;
    if value.project_id != project.id
        || value.fingerprint != project.fingerprint().map_err(error)?
    {
        return Err("Native source revision does not match this saved map".into());
    }
    let directory = directory(state, &value.job_id, &value.revision_id)?;
    let tags = directory.join("tags");
    if !tags.is_dir() {
        return Err("Native source revision has no staged tags".into());
    }
    project::atomic_write(
        &directory.join("source-selection.json"),
        &serde_json::to_vec_pretty(&value).map_err(error)?,
        false,
    )
    .map_err(error)?;
    let library = lock(&state.library)?;
    let saved = library.get(&project.id).map_err(error)?;
    let actual: Option<Selection> = library.setting(&key(&project.id)).map_err(error)?;
    if saved.fingerprint().map_err(error)? != value.fingerprint
        || serde_json::to_value(&saved.builds).map_err(error)?
            != serde_json::to_value(&project.builds).map_err(error)?
        || actual != expected
        || baboon_revision(&library, &project.id)? != value.baboon_revision_at_selection
    {
        return Err("The map or Baboon source changed during staging. The copy is retained but was not selected; review the current source again.".into());
    }
    library
        .set_setting(&key(&project.id), &Some(value))
        .map_err(error)?;
    Ok(tags)
}
