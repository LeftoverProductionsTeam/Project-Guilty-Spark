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
            match current_build(&state, p)
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
            tools.push(Row {
                definition: definition.clone(),
                assessment,
                executable,
                installation_issue,
                external_companion,
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
