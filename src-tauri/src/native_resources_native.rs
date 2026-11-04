use super::*;
/// The hosting selector is deliberately absent. A temporary compiler binding
/// must prove the preserved source's resource graph and never changes its
/// compatible viewer resources or writes a new project revision.
pub(super) fn for_project(
    state: &AppState,
    project: &Project,
    inspection: &MapInspection,
) -> Reply<Project> {
    let Some(source) = &project.source else {
        return Ok(project.clone());
    };
    if ![6, 7, 609].contains(&source.cache_version)
        || !inspection.resources.iter().any(|r| r.required)
    {
        return Ok(project.clone());
    }
    let roots = texture_resources_native::resource_roots(state, project)?
        .into_iter()
        .map(|(root, _)| root);
    let binding = core::native_resources::resolve(source, inspection, roots).map_err(error)?;
    let mut copy = project.clone();
    let source = copy.source.as_mut().unwrap();
    source.resource_directory = Some(binding.directory);
    source.resource_sha256 = binding.hashes;
    Ok(copy)
}
