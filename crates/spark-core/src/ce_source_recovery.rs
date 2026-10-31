//! Explicit, non-lossless recovery of three exact extracted stock CE tags.
//! Native Invader recipes run only in a new fork. Unknown inputs are refused.
use crate::{invalid, maps, reject_links, tool_transaction as transaction, Result};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Correction {
    pub tag: &'static str,
    pub before_sha256: &'static str,
    pub after_sha256: &'static str,
    pub fields: usize,
    pub explanation: &'static str,
}
pub fn corrections() -> Vec<Correction> {
    vec![
        Correction { tag: "vehicles/warthog/warthog gunner.actor_variant", before_sha256: "96fead28ec58a2ad7cf7a71c363bce5a311cd037c106bb3caf6fa574cf0ed635", after_sha256: "11d62f35c32952b44acd7d68602d493f909447aedf25b95099b4109f14ae7a3e", fields: 3, explanation: "Reset undefined grenade_type, trajectory_type and grenade_stimulus to human_fragmentation, toss and never. This changes undefined behaviour; the original values cannot be recovered as meaningful settings." },
        Correction { tag: "vehicles/scorpion/headlights scorpion.lens_flare", before_sha256: "ea922b11a81401005b1d6a79f3f0515a015a217bb7dd552937f7edacc9106c4f", after_sha256: "8156c34ece61bdb064df2763901882fb17a6ccd0c14e4bbb71ba3ce25ed0eaba", fields: 1, explanation: "Change reflection bitmap index 2 to image 0 in the exact known one-image headlight bitmap." },
        Correction { tag: "vehicles/scorpion/secondary fire bullet.effect", before_sha256: "84d8518bf452c7e92f5ffff76c950b95705687a29ac6bca8a908e11810f2fc9a", after_sha256: "c1f91648209a895d2514a82a984379a3380d2058886b1cfbeac5b1eacb11a447", fields: 3, explanation: "Clear three references to missing effect location 1 to the native null sentinel (65535). Those undefined attachment references are removed." },
    ]
}
const BITMAP: &str = "vehicles/scorpion/bitmaps/headlight_lens_flare.bitmap";
const BITMAP_SHA: &str = "030be8836308fa1a732436e458e39ce33199803a2c1737d02045bc20989aa1ff";
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub source_tags: PathBuf,
    pub files: usize,
    pub corrections: Vec<Correction>,
    pub lossless: bool,
    #[serde(skip_serializing)]
    inventory: transaction::Inventory,
}
pub fn review(source: &Path) -> Result<Plan> {
    if !source.is_absolute() {
        return invalid("Choose an absolute path to an extracted CE source tagset");
    }
    reject_links(source)?;
    let source = fs::canonicalize(source)?;
    let inventory = transaction::inventory(&source)?;
    for (path, expected) in corrections()
        .iter()
        .map(|c| (c.tag, c.before_sha256))
        .chain([(BITMAP, BITMAP_SHA)])
    {
        if inventory.get(path).map(String::as_str) != Some(expected) {
            return invalid(format!("This stock CE recovery does not match {path}. It only accepts the exact reviewed original tags; no automatic repair was attempted."));
        }
    }
    Ok(Plan {
        source_tags: source,
        files: inventory.len(),
        corrections: corrections(),
        lossless: false,
        inventory,
    })
}
#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Tool {
    Edit,
    Repair,
}
#[derive(Clone, Debug, Serialize)]
pub struct Recipe {
    pub tool: Tool,
    pub args: Vec<String>,
}
pub fn recipes(tags: &Path) -> Vec<Recipe> {
    let base = || vec!["-t".into(), tags.to_string_lossy().into_owned()];
    let mut enums = base();
    enums.extend([
        "-T".into(),
        "invalid-enums".into(),
        corrections()[0].tag.into(),
    ]);
    let mut lens = base();
    lens.extend([
        "-S".into(),
        "reflections[0].bitmap_index".into(),
        "0".into(),
        corrections()[1].tag.into(),
    ]);
    let mut effect = base();
    effect.extend([
        "-T".into(),
        "invalid-indices".into(),
        corrections()[2].tag.into(),
    ]);
    vec![
        Recipe {
            tool: Tool::Repair,
            args: enums,
        },
        Recipe {
            tool: Tool::Edit,
            args: lens,
        },
        Recipe {
            tool: Tool::Repair,
            args: effect,
        },
    ]
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRecord {
    pub recipe: Recipe,
    pub executable_sha256: String,
    pub stdout: String,
    pub stderr: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    pub schema_version: u32,
    pub source_tags: PathBuf,
    pub tags_directory: PathBuf,
    pub originals_directory: PathBuf,
    pub corrections: Vec<Correction>,
    pub original_inventory: transaction::Inventory,
    pub recovered_inventory: transaction::Inventory,
    pub native_records: Vec<NativeRecord>,
    pub lossless: bool,
    pub compilation_verified: bool,
    pub gameplay_verified: bool,
}
pub fn verify(receipt: &Receipt) -> Result<()> {
    if transaction::inventory(&receipt.source_tags)? != receipt.original_inventory
        || transaction::inventory(&receipt.tags_directory)? != receipt.recovered_inventory
    {
        return invalid("Original or recovered source changed after recovery. Review the new source revision before selecting it.");
    }
    for c in &receipt.corrections {
        if maps::hash_file(&receipt.originals_directory.join(c.tag))? != c.before_sha256 {
            return invalid(
                "A preserved original changed; this recovery can no longer be selected",
            );
        }
    }
    Ok(())
}
fn check_output(plan: &Plan, output: &transaction::Inventory) -> Result<()> {
    let mut expected = plan.inventory.clone();
    for c in &plan.corrections {
        expected.insert(c.tag.into(), c.after_sha256.into());
    }
    if *output != expected {
        return invalid("Native recovery changed unexpected bytes or did not produce the exact reviewed corrections. Originals and candidate are retained; the candidate is not selected.");
    }
    Ok(())
}
pub fn create(
    plan: &Plan,
    destination: &Path,
    cancel: Arc<AtomicBool>,
    mut run: impl FnMut(&Recipe) -> Result<NativeRecord>,
) -> Result<Receipt> {
    // Re-review all source bytes, not only the three target tags.
    let current = review(&plan.source_tags)?;
    if current.inventory != plan.inventory {
        return invalid(
            "The source changed since review. Review the current source again before recovery.",
        );
    }
    reject_links(destination)?;
    let absolute =
        fs::canonicalize(destination.parent().ok_or_else(|| {
            crate::SparkError::Invalid("Recovery needs a parent directory".into())
        })?)?
        .join(destination.file_name().ok_or_else(|| {
            crate::SparkError::Invalid("Recovery needs a new directory name".into())
        })?);
    if absolute.starts_with(&plan.source_tags) {
        return invalid("Recovery must be outside the original tagset");
    }
    if cancel.load(Ordering::Relaxed) {
        return invalid("Source recovery cancelled before creating a copy");
    }
    fs::create_dir(&absolute)?;
    let tags = absolute.join("tags");
    transaction::fork(&plan.source_tags, &tags, cancel.clone())?;
    let originals = absolute.join("originals");
    for c in &plan.corrections {
        let from = tags.join(c.tag);
        let to = originals.join(c.tag);
        fs::create_dir_all(to.parent().unwrap())?;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&to)?;
        std::io::copy(&mut fs::File::open(from)?, &mut output)?;
        output.sync_all()?;
        if maps::hash_file(&to)? != c.before_sha256 {
            return invalid("Original tag preservation failed; recovery was not started");
        }
    }
    let mut records = Vec::new();
    let commands = recipes(&tags)
        .into_iter()
        .chain(plan.corrections.iter().map(|c| Recipe {
            tool: Tool::Edit,
            args: vec![
                "-t".into(),
                tags.to_string_lossy().into_owned(),
                "-L".into(),
                c.tag.into(),
            ],
        }));
    for recipe in commands {
        if cancel.load(Ordering::Relaxed) {
            return invalid(
                "Source recovery cancelled; the original and partial copy are retained",
            );
        }
        records.push(run(&recipe)?);
    }
    let recovered = transaction::inventory(&tags)?;
    check_output(plan, &recovered)?;
    if transaction::inventory(&plan.source_tags)? != plan.inventory {
        return invalid("The original source changed during recovery. The copy was not selected; review both revisions.");
    }
    for c in &plan.corrections {
        if maps::hash_file(&originals.join(c.tag))? != c.before_sha256 {
            return invalid(
                "A preserved original changed during recovery; the copy was not selected",
            );
        }
    }
    let receipt = Receipt {
        schema_version: 1,
        source_tags: plan.source_tags.clone(),
        tags_directory: tags,
        originals_directory: originals,
        corrections: plan.corrections.clone(),
        original_inventory: plan.inventory.clone(),
        recovered_inventory: recovered,
        native_records: records,
        lossless: false,
        compilation_verified: false,
        gameplay_verified: false,
    };
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(absolute.join("ce-source-recovery.json"))?;
    serde_json::to_writer_pretty(&mut file, &receipt)?;
    file.sync_all()?;
    Ok(receipt)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unknown_or_modified_sources_never_enter_recovery() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("unrelated.weapon"), b"not a known CE tag").unwrap();
        assert!(review(root.path()).is_err());
        assert!(review(Path::new("relative/tags")).is_err());
        assert_eq!(
            fs::read(root.path().join("unrelated.weapon")).unwrap(),
            b"not a known CE tag"
        );
    }
    #[test]
    fn recipes_are_exact_scoped_native_operations() {
        let recipes = recipes(Path::new("/isolated/tags"));
        assert_eq!(recipes.len(), 3);
        assert_eq!(recipes[0].tool, Tool::Repair);
        assert_eq!(&recipes[0].args[2..4], ["-T", "invalid-enums"]);
        assert_eq!(
            &recipes[1].args[2..5],
            ["-S", "reflections[0].bitmap_index", "0"]
        );
        assert_eq!(&recipes[2].args[2..4], ["-T", "invalid-indices"]);
        assert_eq!(corrections().iter().map(|c| c.fields).sum::<usize>(), 7);
    }
    #[test]
    fn unrelated_changes_missing_files_and_incomplete_repairs_are_refused() {
        let mut inventory =
            transaction::Inventory::from([("preserved.weapon".into(), "original".into())]);
        for c in corrections() {
            inventory.insert(c.tag.into(), c.before_sha256.into());
        }
        let plan = Plan {
            source_tags: PathBuf::from("/unused"),
            files: inventory.len(),
            corrections: corrections(),
            lossless: false,
            inventory,
        };
        let mut result = plan.inventory.clone();
        assert!(check_output(&plan, &result).is_err());
        for c in corrections() {
            result.insert(c.tag.into(), c.after_sha256.into());
        }
        check_output(&plan, &result).unwrap();
        result.insert("preserved.weapon".into(), "tampered".into());
        assert!(check_output(&plan, &result).is_err());
        result.remove("preserved.weapon");
        assert!(check_output(&plan, &result).is_err());
    }
}
