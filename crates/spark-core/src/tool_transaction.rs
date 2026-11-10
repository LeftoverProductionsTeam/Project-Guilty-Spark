//! Native-source forks and file-level three-way reconciliation for external tools.
//! All results are new directories. Neither the baseline, live working source,
//! external edit nor the last compiled build is overwritten. No tag parser or
//! proprietary tag fields are introduced here.
use crate::{invalid, maps, reject_links, safe_relative, Result, SparkError};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

pub type Inventory = BTreeMap<String, String>;
const MAX_FILES: usize = 20_000;
const MAX_BYTES: u64 = 16 * 1024 * 1024 * 1024;
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024 * 1024;

pub fn inventory(root: &Path) -> Result<Inventory> {
    reject_links(root)?;
    if !root.is_dir() {
        return invalid(
            "The native source folder is unavailable; its previous revision is preserved",
        );
    }
    let mut pending = vec![(root.to_path_buf(), 0)];
    let mut result = Inventory::new();
    let mut case_names = BTreeSet::new();
    let (mut directories, mut total) = (0, 0u64);
    while let Some((directory, depth)) = pending.pop() {
        directories += 1;
        if directories > MAX_FILES || depth > 32 {
            return invalid("Native source tree exceeds the supported directory limit");
        }
        reject_links(&directory)?;
        for entry in fs::read_dir(directory)? {
            let path = entry?.path();
            reject_links(&path)?;
            let before = fs::metadata(&path)?;
            if before.is_dir() {
                pending.push((path, depth + 1));
                continue;
            }
            if !before.is_file() {
                return invalid("Only ordinary native source files can enter a tool transaction");
            }
            total = total
                .checked_add(before.len())
                .ok_or_else(|| SparkError::Invalid("Source size overflow".into()))?;
            if result.len() >= MAX_FILES || before.len() > MAX_FILE_BYTES || total > MAX_BYTES {
                return invalid(
                    "Native source transaction exceeds 20000 files, 2 GiB/file or 16 GiB total",
                );
            }
            let relative = path
                .strip_prefix(root)
                .map_err(|_| SparkError::Invalid("Source escaped its root".into()))?
                .to_string_lossy()
                .replace('\\', "/");
            crate::native_staging::admitted_relative(&relative)?;
            safe_relative(&relative)?;
            let hash = maps::hash_file(&path)?;
            let after = fs::metadata(&path)?;
            if before.len() != after.len() || before.modified()? != after.modified()? {
                return invalid(
                    "An external tool is still saving; wait for a stable source revision",
                );
            }
            if !case_names.insert(relative.to_ascii_lowercase()) {
                return invalid("Case-colliding native source paths cannot be staged safely");
            }
            result.insert(relative, hash);
        }
    }
    Ok(result)
}

/// Reuse an immutable, previously compiled starting revision only when both its
/// preserved copy and the parent input still match every recorded byte. Native
/// header/semantic checks then apply to actual edits, not untouched SDK files.
pub fn verified_starting_inventory(
    preserved: &Path,
    parent: &Path,
    expected: &Inventory,
) -> Result<Inventory> {
    crate::working_tag_changes::validate_baseline(expected)?;
    if expected.is_empty() || inventory(preserved)? != *expected || inventory(parent)? != *expected {
        return invalid("The preserved starting tags or compiled parent source changed; no integrity baseline can be reused");
    }
    Ok(expected.clone())
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub path: String,
    pub kind: String,
    pub baseline: Option<String>,
    pub working: Option<String>,
    pub external: Option<String>,
    pub conflict: bool,
    /// These files own authored placements/detail/collision/visibility or scripts.
    /// A byte-level merge cannot certify their semantic preservation.
    pub requires_native_review: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    pub changes: Vec<Change>,
    pub conflicts: usize,
    pub protected_changes: usize,
    pub working_changes_preserved: usize,
}
pub fn compare(base: &Inventory, working: &Inventory, external: &Inventory) -> Review {
    let names: BTreeSet<_> = base
        .keys()
        .chain(working.keys())
        .chain(external.keys())
        .cloned()
        .collect();
    let mut review = Review {
        changes: vec![],
        conflicts: 0,
        protected_changes: 0,
        working_changes_preserved: 0,
    };
    for path in names {
        let (b, w, e) = (base.get(&path), working.get(&path), external.get(&path));
        if e == b {
            if w != b {
                review.working_changes_preserved += 1;
            }
            continue;
        }
        let conflict = w != b && w != e;
        let requires_native_review = [
            ".scenario",
            ".scenario_structure_bsp",
            ".collision_model",
            ".model_collision_geometry",
            ".jms",
            ".ass",
            ".blend",
            ".hsc",
        ]
        .iter()
        .any(|suffix| path.to_ascii_lowercase().ends_with(suffix))
            || e.is_none();
        review.conflicts += usize::from(conflict);
        review.protected_changes += usize::from(requires_native_review);
        review.changes.push(Change {
            path,
            kind: if e.is_none() {
                "removed"
            } else if b.is_none() {
                "added"
            } else {
                "modified"
            }
            .into(),
            baseline: b.cloned(),
            working: w.cloned(),
            external: e.cloned(),
            conflict,
            requires_native_review,
        });
    }
    review
}

fn destination_outside_sources(output: &Path, sources: &[&Path]) -> Result<PathBuf> {
    if output.exists() {
        return invalid("Choose a new transaction folder; existing work is never replaced");
    }
    let parent = output
        .parent()
        .ok_or_else(|| SparkError::Invalid("Missing transaction parent".into()))?;
    reject_links(parent)?;
    let output = fs::canonicalize(parent)?.join(
        output
            .file_name()
            .ok_or_else(|| SparkError::Invalid("Missing transaction name".into()))?,
    );
    for source in sources {
        reject_links(source)?;
        let source = fs::canonicalize(source)?;
        if output.starts_with(&source) || source.starts_with(&output) {
            return invalid("The new revision must stay outside all source folders");
        }
    }
    Ok(output)
}
fn copy_inventory(
    source: &Path,
    destination: &Path,
    hashes: &Inventory,
    cancel: &AtomicBool,
) -> Result<()> {
    for (relative, expected) in hashes {
        if cancel.load(Ordering::Relaxed) {
            return invalid("Source staging cancelled; all previous revisions remain available");
        }
        let relative = crate::native_staging::admitted_relative(relative)?;
        let input = source.join(&relative);
        reject_links(&input)?;
        if maps::hash_file(&input)? != *expected {
            return invalid(
                "Source changed during staging; retry after the external editor finishes saving",
            );
        }
        let output = destination.join(relative);
        crate::native_staging::copy_file(&input,&output,fs::metadata(&input)?.len(),Some(expected),cancel)?;
    }
    Ok(())
}
fn reserve_revision(output:&Path,parts:&[(&Path,&Inventory)])->Result<crate::storage::Lease>{
    let mut bytes=0u64;let mut files=0usize;
    for (root,inventory) in parts {
        crate::native_staging::destination(root,output)?;
        for name in inventory.keys(){let file=root.join(crate::native_staging::admitted_relative(name)?);reject_links(&file)?;bytes=bytes.checked_add(fs::metadata(file)?.len()).ok_or_else(||SparkError::Invalid("Native revision size overflow".into()))?;files+=1;}
    }
    crate::storage::Store::for_output(output)?.reserve(output,parts.first().map(|p|p.0),crate::storage::estimate_copy(files,bytes),crate::storage::Category::Staging,"Preserved native baseline or reviewed external revision; full isolation fallback")
}

/// An immutable baseline is kept separately from the editor's writable fork.
pub fn fork(source: &Path, output: &Path, cancel: Arc<AtomicBool>) -> Result<Inventory> {
    let output = destination_outside_sources(output, &[source])?;
    let hashes = inventory(source)?;
    fork_inventory(source, &output, &hashes, &hashes, cancel)
}

/// Fork only an exact previously validated dependency inventory. Generated
/// scenario/BSP outputs and unrelated SDK files never enter the new baseline.
pub fn fork_selected(source: &Path, output: &Path, selected: &Inventory, cancel: Arc<AtomicBool>) -> Result<Inventory> {
    crate::working_tag_changes::validate_baseline(selected)?;
    let output = destination_outside_sources(output, &[source])?;
    let before = inventory(source)?;
    if selected.iter().any(|(path, hash)| before.get(path) != Some(hash)) {
        return invalid("Selected native inputs changed; no revision was created");
    }
    fork_inventory(source, &output, selected, &before, cancel)
}
fn fork_inventory(source: &Path, output: &Path, hashes: &Inventory, before: &Inventory, cancel: Arc<AtomicBool>) -> Result<Inventory> {
    if cancel.load(Ordering::Relaxed) {
        return invalid("Source staging cancelled before creating a revision");
    }
    let lease=reserve_revision(output,&[(source,hashes)])?;
    fs::create_dir(&output)?;
    lease.mark_owned()?;
    copy_inventory(source, &output, &hashes, &cancel)?;
    if inventory(source)? != *before || inventory(output)? != *hashes {
        return invalid("Source changed while staging; the partial fork is retained for diagnosis and cannot be accepted");
    }
    use sha2::Digest;let revision=crate::hex_bytes(sha2::Sha256::digest(serde_json::to_vec(&hashes)?));lease.finish(true,Some(revision))?;
    Ok(hashes.clone())
}

/// Stage a new result of a reviewed merge. The caller must retain the baseline
/// bytes and bind these inventories to its project/revision before accepting it.
/// Protected files require explicit native review, never a generic auto-repair.
pub fn reconcile(
    base: &Inventory,
    working_root: &Path,
    external_root: &Path,
    output: &Path,
    expected_working: &Inventory,
    expected_external: &Inventory,
    allow_native_review: bool,
    cancel: Arc<AtomicBool>,
) -> Result<Review> {
    let output = destination_outside_sources(output, &[working_root, external_root])?;
    if inventory(working_root)? != *expected_working
        || inventory(external_root)? != *expected_external
    {
        return invalid(
            "The reviewed source changed again; refresh the comparison before accepting it",
        );
    }
    let review = compare(base, expected_working, expected_external);
    if review.conflicts != 0 {
        return invalid("Both tools changed the same native file. Both revisions are preserved; resolve the conflict before rebuilding");
    }
    if review.protected_changes != 0 && !allow_native_review {
        return invalid("Scenario/BSP/collision/script changes need native review. The existing placements, painted details and compiled map remain preserved");
    }
    if cancel.load(Ordering::Relaxed) {
        return invalid("Reconciliation cancelled before creating a revision");
    }
    let mut external_files = Inventory::new();
    let mut working_files = expected_working.clone();
    for change in &review.changes {
        working_files.remove(&change.path);
        if let Some(hash) = &change.external {
            external_files.insert(change.path.clone(), hash.clone());
        }
    }
    let lease=reserve_revision(&output,&[(working_root,&working_files),(external_root,&external_files)])?;
    fs::create_dir(&output)?;
    lease.mark_owned()?;
    copy_inventory(working_root, &output, &working_files, &cancel)?;
    copy_inventory(external_root, &output, &external_files, &cancel)?;
    if inventory(working_root)? != *expected_working
        || inventory(external_root)? != *expected_external
    {
        return invalid("An external source changed during reconciliation; this partial revision is not accepted");
    }
    let mut expected = working_files;
    expected.extend(external_files);
    if inventory(&output)? != expected {
        return invalid(
            "Reconciled native source verification failed; the old revision remains available",
        );
    }
    use sha2::Digest;let revision=crate::hex_bytes(sha2::Sha256::digest(serde_json::to_vec(&expected)?));lease.finish(true,Some(revision))?;
    Ok(review)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn cancel() -> Arc<AtomicBool> {
        Arc::new(AtomicBool::new(false))
    }
    #[test]
    fn selected_fork_retains_only_validated_inputs_and_refuses_changed_or_unsafe_names() {
        let root=tempfile::tempdir().unwrap();let source=root.path().join("compiled");fs::create_dir(&source).unwrap();
        fs::write(source.join("input.weapon"),b"validated input").unwrap();
        fs::write(source.join("generated.scenario_structure_bsp"),b"previous geometry").unwrap();
        let before=inventory(&source).unwrap();let selected=Inventory::from([("input.weapon".into(),before["input.weapon"].clone())]);
        let output=root.path().join("admitted");assert_eq!(fork_selected(&source,&output,&selected,cancel()).unwrap(),selected);
        assert_eq!(inventory(&source).unwrap(),before);assert!(!output.join("generated.scenario_structure_bsp").exists());
        fs::write(output.join("input.weapon"),b"external candidate").unwrap();assert_eq!(inventory(&source).unwrap(),before);
        let target=root.path().join("refused");fs::write(source.join("input.weapon"),b"changed input").unwrap();
        assert!(fork_selected(&source,&target,&selected,cancel()).is_err());assert!(!target.exists());
        let unsafe_names=Inventory::from([("../input.weapon".into(),before["input.weapon"].clone())]);
        assert!(fork_selected(&source,&target,&unsafe_names,cancel()).is_err());assert!(!target.exists());
        assert!(fork_selected(&source,&source.join("nested"),&inventory(&source).unwrap(),cancel()).is_err());
        assert!(!source.join("nested").exists());
    }
    #[test]
    fn geometry_and_saved_placements_merge_into_a_new_revision_without_touching_either_editor() {
        let root = tempfile::tempdir().unwrap();
        let base = root.path().join("base");
        fs::create_dir(&base).unwrap();
        fs::write(base.join("level.scenario"), b"authored scenery 1,2,3").unwrap();
        fs::write(base.join("mesh.model"), b"blockout").unwrap();
        let external = root.path().join("external");
        let baseline = fork(&base, &external, cancel()).unwrap();
        fs::write(base.join("level.scenario"), b"authored scenery 1,2,3,4").unwrap();
        fs::write(external.join("mesh.model"), b"updated geometry").unwrap();
        let work = inventory(&base).unwrap();
        let edit = inventory(&external).unwrap();
        let merged = root.path().join("merged");
        let review = reconcile(
            &baseline,
            &base,
            &external,
            &merged,
            &work,
            &edit,
            false,
            cancel(),
        )
        .unwrap();
        assert_eq!(review.working_changes_preserved, 1);
        assert_eq!(
            fs::read(merged.join("level.scenario")).unwrap(),
            b"authored scenery 1,2,3,4"
        );
        assert_eq!(
            fs::read(merged.join("mesh.model")).unwrap(),
            b"updated geometry"
        );
        assert_eq!(inventory(&base).unwrap(), work);
        assert_eq!(inventory(&external).unwrap(), edit);
    }
    #[test]
    fn same_file_conflict_protected_bsp_stale_review_and_cancel_never_create_accepted_output() {
        let root = tempfile::tempdir().unwrap();
        let base = root.path().join("base");
        fs::create_dir(&base).unwrap();
        fs::write(
            base.join("level.scenario_structure_bsp"),
            b"painted detail payload",
        )
        .unwrap();
        let external = root.path().join("external");
        let baseline = fork(&base, &external, cancel()).unwrap();
        fs::write(
            external.join("level.scenario_structure_bsp"),
            b"lost painted payload",
        )
        .unwrap();
        let work = inventory(&base).unwrap();
        let edit = inventory(&external).unwrap();
        let output = root.path().join("blocked");
        assert!(reconcile(
            &baseline,
            &base,
            &external,
            &output,
            &work,
            &edit,
            false,
            cancel()
        )
        .is_err());
        assert!(!output.exists());
        fs::write(
            base.join("level.scenario_structure_bsp"),
            b"new saved placements",
        )
        .unwrap();
        let current = inventory(&base).unwrap();
        assert_eq!(compare(&baseline, &current, &edit).conflicts, 1);
        assert!(reconcile(
            &baseline,
            &base,
            &external,
            &output,
            &current,
            &edit,
            true,
            cancel()
        )
        .is_err());
        assert!(reconcile(
            &baseline,
            &base,
            &external,
            &output,
            &work,
            &edit,
            true,
            cancel()
        )
        .is_err());
        assert!(fork(
            &base,
            &root.path().join("cancelled"),
            Arc::new(AtomicBool::new(true))
        )
        .is_err());
        assert!(!root.path().join("cancelled").exists());
        assert!(!output.exists());
    }
}
