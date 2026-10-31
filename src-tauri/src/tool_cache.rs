//! Explicit, per-user, offline caching of a user-installed Invader CLI bundle.
//!
//! No download, installation, execution, or game-folder modification happens
//! here. Only a constrained set of known executable filenames and adjacent
//! DLLs is copied, and every copied byte is rehashed. This cache is NOT part
//! of the redistributable Guilty Spark application.
use sha2::{Digest, Sha256};
use std::{fs, io::{Read, Write}, path::{Path, PathBuf}};

const MAX_TOTAL_BYTES: u64 = 256 * 1024 * 1024;
const MAX_FILES: usize = 32;
const MAX_SINGLE_FILE: u64 = 128 * 1024 * 1024;

fn sha256_file(path: &Path) -> Result<String, String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !metadata.file_type().is_file() || metadata.len() > MAX_SINGLE_FILE {
        return Err("Cached tools must be regular files smaller than 128 MiB".into());
    }
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new();
    let mut read = 0u64;
    let mut buffer = [0u8; 65_536];
    loop {
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        read += n as u64;
        if read > MAX_SINGLE_FILE { return Err("Tool exceeded the configured cache size limit".into()); }
        hash.update(&buffer[..n]);
    }
    Ok(spark_core::hex_bytes(hash.finalize()))
}

fn executable_name(name: &str) -> bool {
    matches!(name.to_ascii_lowercase().as_str(),
        "invader-info" | "invader-info.exe" |
        "invader-extract" | "invader-extract.exe" |
        "invader-build" | "invader-build.exe")
}

pub fn cache_invader(source: &Path, data_root: &Path) -> Result<PathBuf, String> {
    let source = fs::canonicalize(source).map_err(|e| format!("Cannot resolve Invader folder: {e}"))?;
    if !source.is_dir() { return Err("Select an existing Invader tool directory".into()); }
    let cache_root = data_root.join("tool-cache").join("invader");
    fs::create_dir_all(&cache_root).map_err(|e| e.to_string())?;
    let cache_root = fs::canonicalize(&cache_root).map_err(|e| e.to_string())?;
    if source.starts_with(&cache_root) || cache_root.starts_with(&source) {
        return Err("The source cannot contain or reside within the tool cache".into());
    }
    let mut files: Vec<(String, PathBuf, String, u64)> = Vec::new();
    let mut total = 0u64;
    let mut found = [false; 3];
    for entry in fs::read_dir(&source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let raw_name = entry.file_name();
        let Some(name) = raw_name.to_str() else { continue };
        let lower = name.to_ascii_lowercase();
        // Only the required Invader binaries, adjacent DLLs and license notices.
        // Scripts, cached maps and unrelated binaries are never copied.
        let notice = matches!(lower.as_str(),
            "license" | "license.txt" | "license.md" | "copying" |
            "copying.txt" | "notice" | "notice.txt");
        if !executable_name(name) && !lower.ends_with(".dll") && !notice { continue; }
        let metadata = fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
        if !metadata.file_type().is_file() {
            return Err(format!("Rejecting non-regular or linked tool file: {name}"));
        }
        if metadata.len() > MAX_SINGLE_FILE { return Err(format!("Tool file exceeds size limit: {name}")); }
        total = total.checked_add(metadata.len()).ok_or("Tool cache size overflow")?;
        if total > MAX_TOTAL_BYTES { return Err("Tool folder exceeds 256 MiB cache limit".into()); }
        if files.len() >= MAX_FILES { return Err("Too many tool files for this controlled cache".into()); }
        let digest = sha256_file(&entry.path())?;
        for (n, id) in ["invader-info", "invader-extract", "invader-build"].iter().enumerate() {
            if lower == *id || lower == format!("{id}.exe") { found[n] = true; }
        }
        files.push((name.into(), entry.path(), digest, metadata.len()));
    }
    if found.iter().any(|v| !v) {
        return Err("Invader folder must contain invader-info, invader-extract and invader-build (or .exe variants)".into());
    }
    files.sort_by(|a,b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
    let mut overall = Sha256::new();
    for (name, _, digest, size) in &files {
        overall.update(name.as_bytes());
        overall.update(digest.as_bytes());
        overall.update(size.to_le_bytes());
    }
    let id = spark_core::hex_bytes(overall.finalize());
    let target = cache_root.join(&id[..24]);
    if target.exists() {
        // Refuse directory symlinks/junction-style redirections to unrelated data.
        if fs::symlink_metadata(&target).map_err(|e| e.to_string())?.file_type().is_symlink() {
            return Err("Cached tool directory must not be a symbolic link".into());
        }
        // Existing version is never silently overwritten or trusted blindly.
        for (name, _, digest, _) in &files {
            let existing = target.join(name);
            if sha256_file(&existing)? != *digest {
                return Err(format!("Existing cached tool does not match its source: {name}. Please inspect the cache."));
            }
        }
        return Ok(target);
    }
    let staging = cache_root.join(format!(".stage-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&staging).map_err(|e| e.to_string())?;
    let result = (|| -> Result<(), String> {
        let mut manifest = Vec::new();
        for (name, src, digest, size) in &files {
            let dst = staging.join(name);
            fs::copy(src, &dst).map_err(|e| format!("Copying {name}: {e}"))?;
            if sha256_file(&dst)? != *digest { return Err(format!("Verification failed for {name}")); }
            manifest.push(serde_json::json!({"filename": name,"sha256":digest,"bytes":size}));
        }
        let details = serde_json::json!({
            "schemaVersion":1,
            "tool":"Invader",
            "immutableCacheId":id,
            "files":manifest,
            "notice":"Personal offline cache of user-provided tools, not redistributable or executable by this operation"
        });
        let bytes = serde_json::to_vec_pretty(&details).map_err(|e| e.to_string())?;
        fs::File::create(staging.join("cache-manifest.json"))
            .and_then(|mut f| f.write_all(&bytes)).map_err(|e| e.to_string())?;
        fs::rename(&staging,&target).map_err(|e| e.to_string())?;
        Ok(())
    })();
    if result.is_err() { let _ = fs::remove_dir_all(&staging); }
    result?;
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refuses_incomplete_tool_directory() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("tools");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("invader-info.exe"),b"test executable").unwrap();
        assert!(cache_invader(&source, &root.path().join("data")).is_err());
    }
    #[test]
    fn copies_only_approved_files_and_rejects_cache_tampering() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("tools");
        fs::create_dir_all(&source).unwrap();
        for tool in ["invader-info.exe","invader-extract.exe","invader-build.exe"] {
            fs::write(source.join(tool),tool.as_bytes()).unwrap();
        }
        fs::write(source.join("readme.txt"),b"not cacheable").unwrap();
        fs::write(source.join("userdata.map"),b"private content").unwrap();
        let data = root.path().join("data");
        let path = cache_invader(&source,&data).unwrap();
        assert!(path.join("invader-build.exe").is_file());
        assert!(!path.join("readme.txt").exists());
        assert!(!path.join("userdata.map").exists());
        assert_eq!(path,cache_invader(&source,&data).unwrap());
        fs::write(path.join("invader-build.exe"),b"tampered").unwrap();
        assert!(cache_invader(&source,&data).is_err());
    }
}
