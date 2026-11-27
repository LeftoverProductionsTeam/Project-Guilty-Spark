//! Relative paths for legacy native tools running inside an owned physical project directory.

#[cfg(windows)]
pub(crate) fn extraction_arguments(args: &[String], workspace: &std::path::Path) -> crate::Result<Vec<String>> {
    use std::path::Path;
    crate::reject_links(workspace)?;
    let root = workspace.canonicalize()?;
    args.iter().map(|arg| {
        let path = Path::new(arg);
        if !path.is_absolute() { return Ok(arg.clone()); }
        let resolved = path.canonicalize()?;
        Ok(match resolved.strip_prefix(&root) {
            Ok(relative) if relative.as_os_str().is_empty() => ".".into(),
            Ok(relative) => relative.to_string_lossy().into_owned(),
            Err(_) => arg.clone(),
        })
    }).collect()
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn native_arguments_use_physical_workspace_relative_paths() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("owned project");
        std::fs::create_dir_all(root.join("tags")).unwrap();
        let input = root.join("original input.map");
        std::fs::write(&input, b"source").unwrap();
        let external = temp.path().join("classic resources");
        std::fs::create_dir(&external).unwrap();
        let args = vec!["-t".into(), root.join("tags").display().to_string(),
            "-m".into(), external.display().to_string(), "-O".into(),
            input.display().to_string(), root.display().to_string()];
        let actual = extraction_arguments(&args, &root).unwrap();
        assert_eq!(actual, ["-t", "tags", "-m", &args[3], "-O", "original input.map", "."]);
        assert_eq!(std::fs::read(root.join(&actual[5])).unwrap(), b"source");
    }
}
