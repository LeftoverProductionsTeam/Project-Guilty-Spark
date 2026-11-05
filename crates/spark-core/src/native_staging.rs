//! Dependency inventories and isolated native copies. Never copy a project,
//! prior job, hidden cache or source ancestor into its own staging directory.
use crate::{invalid, maps, reject_links, safe_relative, Result, SparkError};
use serde::{Deserialize, Serialize};
use sha2::Digest;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};

pub fn admitted_relative(relative: &str) -> Result<PathBuf> {
    let path = safe_relative(relative)?;
    if path.components().any(|part| {
        part.as_os_str().to_str().is_some_and(|p| {
            matches!(
                p.to_ascii_lowercase().as_str(),
                ".local"
                    | ".git"
                    | "node_modules"
                    | "target"
                    | "dist"
                    | "jobs"
                    | "archives"
                    | "storage-v1"
                    | ".spark-storage-v1"
            )
        })
    }) {
        return invalid("Native tag staging cannot include .local, .git, jobs, archives or generated dependency/build directories. Select the actual editable tags folder.");
    }
    Ok(path)
}
/// Give missing outputs the identity of their trusted existing ancestor. In
/// particular, canonical Windows sources use verbatim/expanded 8.3 spellings.
/// Never compare one of those against an unresolved destination string.
pub(crate) fn canonical_destination(output: &Path) -> Result<PathBuf> {
    reject_links(output)?;
    let absolute = std::path::absolute(output)?;
    let mut ancestor = absolute.as_path();
    let mut missing = vec![];
    loop {
        match fs::symlink_metadata(ancestor) {
            Ok(metadata) => {
                if !missing.is_empty() && !metadata.is_dir() {
                    return invalid("Native output ancestor is not a directory");
                }
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        missing.push(
            ancestor
                .file_name()
                .ok_or_else(|| SparkError::Invalid("Staging has no existing ancestor".into()))?
                .to_os_string(),
        );
        ancestor = ancestor
            .parent()
            .ok_or_else(|| SparkError::Invalid("Staging has no parent".into()))?;
    }
    reject_links(ancestor)?;
    let mut result = fs::canonicalize(ancestor)?;
    for name in missing.into_iter().rev() {
        result.push(name);
    }
    Ok(result)
}
pub fn destination(source: &Path, output: &Path) -> Result<PathBuf> {
    reject_links(source)?;
    let source = fs::canonicalize(source)?;
    let result = canonical_destination(output)?;
    if result.starts_with(&source) || source.starts_with(&result) {
        return invalid("Native staging must be outside its source and cannot contain its source");
    }
    Ok(result)
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct File {
    pub path: String,
    pub bytes: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Inventory {
    pub files: Vec<File>,
    pub bytes: u64,
}
/// Metadata first. No destination is created until the complete plan is admitted.
pub fn inventory(root: &Path, cancel: &AtomicBool) -> Result<Inventory> {
    reject_links(root)?;
    let root = fs::canonicalize(root)?;
    let mut pending = vec![(root.clone(), 0usize)];
    let mut files = vec![];
    let mut bytes = 0u64;
    let mut names = BTreeSet::new();
    let mut directories = 0usize;
    while let Some((dir, depth)) = pending.pop() {
        directories += 1;
        if depth > 32 || directories > 20000 {
            return invalid("Native staging directory limit exceeded");
        }
        for entry in fs::read_dir(dir)? {
            if cancel.load(Ordering::Relaxed) {
                return invalid("Native staging cancelled");
            }
            let p = entry?.path();
            reject_links(&p)?;
            let relative = p
                .strip_prefix(&root)
                .map_err(|_| SparkError::Invalid("Native source escaped its root".into()))?
                .to_string_lossy()
                .replace('\\', "/");
            admitted_relative(&relative)?;
            let m = fs::metadata(&p)?;
            if m.is_dir() {
                pending.push((p, depth + 1));
                continue;
            }
            if !m.is_file() {
                return invalid("Only regular native source files can be staged");
            }
            bytes = bytes
                .checked_add(m.len())
                .ok_or_else(|| SparkError::Invalid("Native staging size overflow".into()))?;
            if m.len() > 2 * 1024 * 1024 * 1024
                || bytes > 16 * 1024 * 1024 * 1024
                || files.len() >= 200000
            {
                return invalid("Native staging exceeds the 16 GiB/200000-file bound");
            }
            if !names.insert(relative.to_ascii_lowercase()) {
                return invalid("Native staging contains case-colliding paths");
            }
            files.push(File {
                path: relative,
                bytes: m.len(),
            });
        }
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(Inventory { files, bytes })
}
pub fn dependency_paths(log: &str, root: &Path, requested: &str) -> Result<BTreeSet<String>> {
    Ok(dependency_plan(log, root, requested, false)?.files)
}
pub struct Dependencies {
    pub files: BTreeSet<String>,
    pub followup: BTreeSet<String>,
    pub model_class_bindings: BTreeMap<String, String>,
}
pub fn dependency_plan(log: &str, root: &Path, requested: &str, h1a: bool) -> Result<Dependencies> {
    let mut paths = BTreeSet::new();
    let mut followup = BTreeSet::new();
    let mut bindings = BTreeMap::new();
    for p in std::iter::once(requested)
        .chain(log.lines())
        .map(str::trim)
        .filter(|p| !p.is_empty())
    {
        let mut p = p.replace('\\', "/");
        if let Some(broken) = p.strip_suffix(" [BROKEN]") {
            // H1A preserves a mode reference for some Halo 1 objects while
            // its actual native model is a same-path mod2 .gbxmodel. This is
            // the existing native class correction, not a fuzzy asset search.
            if !h1a || !broken.ends_with(".model") {
                return invalid(format!(
                    "Native dependency is missing: {broken}. No tag tree was copied."
                ));
            }
            let corrected = format!("{}.gbxmodel", &broken[..broken.len() - 6]);
            let file = root.join(admitted_relative(&corrected)?);
            reject_links(&file)?;
            let mut header = [0u8; 64];
            fs::File::open(&file)?.read_exact(&mut header)?;
            if &header[36..40] != b"mod2" || &header[60..64] != b"blam" {
                return invalid("H1A model-class binding is not a same-path native GBX tag");
            }
            bindings.insert(broken.to_owned(), corrected.clone());
            followup.insert(corrected.clone());
            p = corrected;
        }
        let relative = admitted_relative(&p)?;
        if relative.extension().is_none() {
            return invalid("Native dependency tool returned an unrecognized path");
        }
        let file = root.join(&relative);
        reject_links(&file)?;
        if !file.is_file() {
            return invalid(format!(
                "Native dependency is missing: {p}. No tag tree was copied."
            ));
        }
        paths.insert(p.to_ascii_lowercase());
        if paths.len() > 20000 {
            return invalid("Native dependency closure exceeds 20000 tags");
        }
    }
    Ok(Dependencies {
        files: paths,
        followup,
        model_class_bindings: bindings,
    })
}
pub fn selected_inventory(all: &Inventory, selected: &BTreeSet<String>) -> Result<Inventory> {
    let files = all
        .files
        .iter()
        .filter(|f| selected.contains(&f.path.to_ascii_lowercase()))
        .cloned()
        .collect::<Vec<_>>();
    if files.len() != selected.len() {
        return invalid("Native dependency closure and source inventory disagree");
    }
    Ok(Inventory {
        bytes: files.iter().map(|f| f.bytes).sum(),
        files,
    })
}
pub(crate) fn copy_file(
    input: &Path,
    target: &Path,
    bytes: u64,
    expected: Option<&str>,
    cancel: &AtomicBool,
) -> Result<String> {
    reject_links(input)?;
    reject_links(target)?;
    if target.exists() {
        return invalid("A native copied tag cannot overwrite an existing file");
    }
    let parent = target
        .parent()
        .ok_or_else(|| SparkError::Invalid("Native output has no parent".into()))?;
    fs::create_dir_all(parent)?;
    let temporary = parent.join(format!(".spark-copy-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut from = fs::File::open(input)?;
        let mut to = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        let mut buffer = vec![0u8; 1024 * 1024];
        let mut digest = sha2::Sha256::new();
        let mut count = 0u64;
        loop {
            if cancel.load(Ordering::Relaxed) {
                return invalid("Native copy cancelled");
            }
            let n = from.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            count += n as u64;
            if count > bytes {
                return invalid("Source grew during native staging");
            }
            to.write_all(&buffer[..n])?;
            digest.update(&buffer[..n]);
        }
        to.sync_all()?;
        drop(to);
        let hash = crate::hex_bytes(digest.finalize());
        if count != bytes
            || expected.is_some_and(|h| h != hash)
            || maps::hash_file(input)? != hash
            || maps::hash_file(&temporary)? != hash
        {
            return invalid("Native source or copied tag changed; no partial tag was adopted");
        }
        fs::rename(&temporary, target)?;
        Ok(hash)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}
pub fn copy(
    source: &Path,
    output: &Path,
    plan: &Inventory,
    cancel: &AtomicBool,
    mut progress: impl FnMut(usize, usize, u64, u64),
) -> Result<BTreeMap<String, String>> {
    let output = destination(source, output)?;
    if plan.files.len() > 200000
        || plan.files.iter().any(|f| f.bytes > 2 * 1024 * 1024 * 1024)
        || plan.files.iter().map(|f| f.bytes as u128).sum::<u128>() != plan.bytes as u128
        || plan.bytes > 16 * 1024 * 1024 * 1024
    {
        return invalid("Native staging plan exceeds its bounded file/byte inventory");
    }
    let unique = plan
        .files
        .iter()
        .map(|f| f.path.replace('\\', "/").to_ascii_lowercase())
        .collect::<BTreeSet<_>>();
    if unique.len() != plan.files.len() {
        return invalid("Native staging plan repeats a destination");
    }
    // Validate all input paths and sizes before creating any output, including
    // caller-supplied inventory rows. The compiler receives ordinary copies.
    for row in &plan.files {
        let input = source.join(admitted_relative(&row.path)?);
        reject_links(&input)?;
        if !input.is_file() || fs::metadata(input)?.len() != row.bytes {
            return invalid("Native source changed after staging was planned");
        }
    }
    if output.exists() {
        if fs::read_dir(&output)?.next().is_some() {
            return invalid("Native staging destination must be empty");
        }
        fs::remove_dir(&output)?;
    }
    let lease = crate::storage::Store::for_output(&output)?.reserve(
        &output,
        Some(source),
        crate::storage::estimate_copy(plan.files.len(), plan.bytes),
        crate::storage::Category::Staging,
        "Isolated writable native tag inputs",
    )?;
    fs::create_dir(&output)?;
    lease.mark_owned()?;
    let mut hashes = BTreeMap::new();
    let mut copied = 0u64;
    let mut last = std::time::Instant::now();
    progress(0, plan.files.len(), 0, plan.bytes);
    for (index, row) in plan.files.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return invalid("Build cancelled");
        }
        let input = source.join(admitted_relative(&row.path)?);
        let target = output.join(admitted_relative(&row.path)?);
        let hash = copy_file(&input, &target, row.bytes, None, cancel)?;
        hashes.insert(row.path.clone(), hash);
        copied += row.bytes;
        if last.elapsed().as_millis() >= 500 || index + 1 == plan.files.len() {
            progress(index + 1, plan.files.len(), copied, plan.bytes);
            last = std::time::Instant::now();
        }
    }
    let key = crate::hex_bytes(sha2::Sha256::digest(serde_json::to_vec(&hashes)?));
    lease.finish(false, Some(key))?;
    Ok(hashes)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn h1a_model_class_binding_requires_an_exact_native_tag_and_recursive_followup() {
        let d = tempfile::tempdir().unwrap();
        let mut header = vec![0u8; 64];
        header[36..40].copy_from_slice(b"mod2");
        header[60..64].copy_from_slice(b"blam");
        fs::write(d.path().join("test.gbxmodel"), &header).unwrap();
        assert!(dependency_plan("test.model [BROKEN]", d.path(), "test.gbxmodel", false).is_err());
        let plan = dependency_plan("test.model [BROKEN]", d.path(), "test.gbxmodel", true).unwrap();
        assert!(plan.followup.contains("test.gbxmodel"));
        assert_eq!(plan.model_class_bindings["test.model"], "test.gbxmodel");
        assert!(dependency_plan("other.model [BROKEN]", d.path(), "test.gbxmodel", true).is_err());
        header[36..40].copy_from_slice(b"bitm");
        fs::write(d.path().join("test.gbxmodel"), header).unwrap();
        assert!(dependency_plan("test.model [BROKEN]", d.path(), "test.gbxmodel", true).is_err());
    }
    #[test]
    fn cancelled_truncated_and_changed_copies_never_adopt_a_tag() {
        let d = tempfile::tempdir().unwrap();
        let source = d.path().join("input.bitmap");
        let output = d.path().join("stage");
        fs::create_dir(&output).unwrap();
        let target = output.join("test.bitmap");
        fs::write(&source, b"original-payload").unwrap();
        assert!(copy_file(&source, &target, 16, None, &AtomicBool::new(true)).is_err());
        assert!(copy_file(&source, &target, 99, None, &AtomicBool::new(false)).is_err());
        assert!(copy_file(
            &source,
            &target,
            16,
            Some(&"0".repeat(64)),
            &AtomicBool::new(false)
        )
        .is_err());
        assert!(!target.exists());
        assert_eq!(fs::read_dir(&output).unwrap().count(), 0);
        assert_eq!(fs::read(&source).unwrap(), b"original-payload");
    }
    #[test]
    fn caller_inventory_cannot_smuggle_caches_or_repeat_files() {
        let d = tempfile::tempdir().unwrap();
        let source = d.path().join("tags");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("a.weapon"), b"x").unwrap();
        for name in [
            "../a.weapon",
            ".local/a.weapon",
            "jobs/a.weapon",
            "target/a.weapon",
            "node_modules/a.weapon",
        ] {
            let output = d.path().join("stage");
            let plan = Inventory {
                files: vec![File {
                    path: name.into(),
                    bytes: 1,
                }],
                bytes: 1,
            };
            assert!(copy(
                &source,
                &output,
                &plan,
                &AtomicBool::new(false),
                |_, _, _, _| {}
            )
            .is_err());
            assert!(!output.exists());
        }
        let output = d.path().join("stage");
        let row = File {
            path: "a.weapon".into(),
            bytes: 1,
        };
        assert!(copy(
            &source,
            &output,
            &Inventory {
                files: vec![row.clone(), row],
                bytes: 2
            },
            &AtomicBool::new(false),
            |_, _, _, _| {}
        )
        .is_err());
        assert!(!output.exists());
    }
    #[cfg(windows)]
    #[test]
    fn directory_junction_cycles_are_rejected_without_copying() {
        let d = tempfile::tempdir().unwrap();
        let source = d.path().join("tags");
        fs::create_dir(&source).unwrap();
        let link = source.join("cycle");
        let status=std::process::Command::new("powershell.exe").args(["-NoProfile","-NonInteractive","-Command","New-Item -ItemType Junction -Path $env:SPARK_CYCLE_LINK -Target $env:SPARK_CYCLE_SOURCE | Out-Null"]).env("SPARK_CYCLE_LINK",&link).env("SPARK_CYCLE_SOURCE",&source).status().unwrap();
        assert!(status.success());
        let result = inventory(&source, &AtomicBool::new(false));
        fs::remove_dir(&link).unwrap();
        assert!(result.is_err());
        assert!(!d.path().join("stage").exists());
    }
    #[test]
    fn rejects_cache_recursion_before_creating_output() {
        let d = tempfile::tempdir().unwrap();
        let src = d.path().join("tags");
        fs::create_dir(&src).unwrap();
        fs::write(src.join("a.weapon"), b"source").unwrap();
        fs::create_dir(src.join(".local")).unwrap();
        fs::write(src.join(".local/leak"), b"no").unwrap();
        assert!(inventory(&src, &AtomicBool::new(false)).is_err());
        assert!(destination(&src, &src.join("child")).is_err());
        assert!(!src.join("child").exists());
    }
    #[test]
    fn selected_closure_preserves_writable_copy_isolation() {
        let d = tempfile::tempdir().unwrap();
        let src = d.path().join("tags");
        fs::create_dir(&src).unwrap();
        fs::write(src.join("a.weapon"), b"needed").unwrap();
        fs::write(src.join("unused.bitmap"), b"unused").unwrap();
        let all = inventory(&src, &AtomicBool::new(false)).unwrap();
        let paths = dependency_paths("a.weapon\n", &src, "a.weapon").unwrap();
        let plan = selected_inventory(&all, &paths).unwrap();
        let out = d.path().join("stage");
        let hashes = copy(&src, &out, &plan, &AtomicBool::new(false), |_, _, _, _| {}).unwrap();
        assert_eq!(hashes.len(), 1);
        assert!(!out.join("unused.bitmap").exists());
        fs::write(out.join("a.weapon"), b"edit").unwrap();
        assert_eq!(fs::read(src.join("a.weapon")).unwrap(), b"needed");
        assert!(dependency_paths("../a.weapon", &src, "a.weapon").is_err());
    }
}
