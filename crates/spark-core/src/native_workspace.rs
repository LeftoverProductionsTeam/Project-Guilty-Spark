//! Relative paths for legacy native tools running inside an owned physical project directory.

#[cfg(windows)]
pub(crate) fn prepare_command(
    executable: &std::path::Path,
    workspace: &std::path::Path,
    args: &[String],
    phase: &str,
) -> crate::Result<(Option<Vec<String>>, Option<std::path::PathBuf>)> {
    let tool = executable.file_name().unwrap_or_default().to_string_lossy().to_ascii_lowercase();
    let extended = tool == "invader-extract.exe";
    let relative = match tool.as_str() {
        "invader-build.exe" => phase == "compile-ce",
        "invader-refactor.exe" => matches!(phase, "asset-references" | "tag-renaming" | "xbox-model-references"),
        "invader-convert.exe" => phase == "xbox-model-to-pc",
        "invader-edit.exe" => matches!(phase, "asset-native-readback" | "asset-placement" | "tag-renaming"
            | "bsp-scenery-model" | "bsp-scenery-model-check" | "model-adaptation-readback"
            | "recovery-readback" | "recovery-dependencies" | "recovery-data"),
        "invader-dependency.exe" => matches!(phase, "dependencies" | "asset-dependencies"
            | "tag-renaming" | "bsp-dependencies" | "recovery-readback" | "recovery-dependencies" | "recovery-data"),
        "invader-recover.exe" => matches!(phase, "recovery-readback" | "recovery-dependencies" | "recovery-data"),
        _ => false,
    };
    let normalized = (extended || relative).then(|| extraction_arguments(args, workspace, extended)).transpose()?;
    // Halo Tool still opens relative tag names through a legacy Windows file
    // API. Its reported missing dependency can be a combined path over
    // MAX_PATH even when Invader already verified the file.
    let prefers_short_root = tool == "invader-refactor.exe"
        || matches!(phase, "bsp-structure" | "bsp-lightmaps" | "bsp-isolated-lightmaps");
    let working_directory = prefers_short_root.then(|| short_physical_directory(workspace)).flatten();
    Ok((normalized, working_directory))
}

#[cfg(windows)]
pub(crate) fn extraction_arguments(args: &[String], workspace: &std::path::Path, extended_tags: bool) -> crate::Result<Vec<String>> {
    use std::path::Path;
    crate::reject_links(workspace)?;
    let root = workspace.canonicalize()?;
    args.iter().enumerate().map(|(index, arg)| {
        let path = Path::new(arg);
        let tags = extended_tags && index.checked_sub(1).is_some_and(|prior|
            matches!(args[prior].as_str(), "-t" | "--tags"));
        let resolved = if path.is_absolute() {
            path.canonicalize()?
        } else if tags {
            root.join(path).canonicalize()?
        } else {
            return Ok(arg.clone());
        };
        Ok(match resolved.strip_prefix(&root) {
            // Invader extraction uses the Windows file API for each tag.
            // An extended physical root preserves paths beyond MAX_PATH.
            Ok(_) if tags => resolved.to_string_lossy().into_owned(),
            Ok(relative) if relative.as_os_str().is_empty() => ".".into(),
            Ok(relative) => relative.to_string_lossy().into_owned(),
            Err(_) => arg.clone(),
        })
    }).collect()
}

/// Request an existing filesystem short name. This never creates path aliases
/// or changes the DOS device table. Only use a verified spelling of the same directory.
#[cfg(windows)]
pub(crate) fn short_physical_directory(workspace: &std::path::Path) -> Option<std::path::PathBuf> {
    use std::{ffi::OsString, os::windows::ffi::{OsStrExt, OsStringExt}, path::PathBuf};
    #[link(name = "kernel32")]
    extern "system" {
        fn GetShortPathNameW(input: *const u16, output: *mut u16, capacity: u32) -> u32;
    }
    let original = workspace.canonicalize().ok()?;
    let input = workspace.as_os_str().encode_wide().chain(Some(0)).collect::<Vec<_>>();
    let mut buffer = vec![0; 32768];
    let count = unsafe { GetShortPathNameW(input.as_ptr(), buffer.as_mut_ptr(), buffer.len() as u32) } as usize;
    if count == 0 || count >= buffer.len() || count + 1 >= input.len() {
        return None;
    }
    let candidate = PathBuf::from(OsString::from_wide(&buffer[..count]));
    (candidate.is_absolute() && candidate.canonicalize().ok().as_ref() == Some(&original)).then_some(candidate)
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
        let actual = extraction_arguments(&args, &root, false).unwrap();
        assert_eq!(actual, ["-t", "tags", "-m", &args[3], "-O", "original input.map", "."]);
        assert_eq!(std::fs::read(root.join(&actual[5])).unwrap(), b"source");
        let extraction = extraction_arguments(&args, &root, true).unwrap();
        assert_eq!(extraction[1], root.join("tags").canonicalize().unwrap().to_string_lossy());
        assert_eq!(&extraction[2..], &actual[2..]);
        let relative = extraction_arguments(&["--tags".into(), "tags".into()], &root, true).unwrap();
        assert_eq!(relative[1], extraction[1]);
    }
}
