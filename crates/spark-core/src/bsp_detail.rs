//! Conservative preservation gate for painted Halo 1 BSP detail objects.
//!
//! Loose HEK tags are serialized sequentially, not with cache virtual pointers.
//! A separately verified Invader reader supplies typed counts/values. Its float
//! output is rounded, so unchanged displayed fields cannot prove exact Z-vector
//! preservation after serialization. A changed file containing detail payload is
//! deliberately blocked until an exact native payload reader is available.
//! Layout/CLI research: SnowyMouse/invader revision
//! 696830ff80af227e84e7237c2ef26eb2301ed110, scenario_structure_bsp.json
//! and edit.cpp. Original implementation; no upstream code is included.
use crate::{invalid, maps, reject_links, safe_relative, Result, SparkError};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, io::Read, path::Path};

const MAX_NATIVE_BYTES: u64 = 128 * 1024 * 1024;
const MAX_OUTPUT_BYTES: usize = 16 * 1024 * 1024;
const MAX_QUERY_VALUES: usize = 2_000_000;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    pub native_sha256: String,
    pub inspector_sha256: String,
    pub detail_blocks: usize,
    pub cells: usize,
    pub instances: usize,
    pub layer_counts: usize,
    pub z_reference_vectors: usize,
    /// Exact integer fields, including cell/packed instance coordinates.
    pub integer_fields_sha256: String,
    /// Rounded reader output, never proof of exact native floating-point bytes.
    pub z_reference_display_sha256: String,
}

impl Snapshot {
    pub fn has_payload(&self) -> bool {
        self.cells != 0
            || self.instances != 0
            || self.layer_counts != 0
            || self.z_reference_vectors != 0
    }
    fn validate(&self) -> Result<()> {
        if self.detail_blocks > 1
            || self.cells > 262144
            || self.instances > 2097152
            || self.layer_counts > 8388608
            || self.z_reference_vectors > 262144
            || (self.detail_blocks == 0 && self.has_payload())
            || [
                &self.native_sha256,
                &self.inspector_sha256,
                &self.integer_fields_sha256,
                &self.z_reference_display_sha256,
            ]
            .into_iter()
            .any(|value| value.len() != 64 || !value.bytes().all(|b| b.is_ascii_hexdigit()))
        {
            return invalid("BSP detail snapshot identity/counts are invalid");
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Comparison {
    pub safe_for_environment_edit: bool,
    pub byte_identical: bool,
    pub displayed_fields_unchanged: bool,
    pub reasons: Vec<String>,
}

fn native_hash(path: &Path) -> Result<String> {
    reject_links(path)?;
    let file = fs::File::open(path)?;
    if !file.metadata()?.is_file() || !(712..=MAX_NATIVE_BYTES).contains(&file.metadata()?.len()) {
        return invalid("BSP detail source is missing, truncated or exceeds 128 MiB");
    }
    let mut bytes = vec![];
    file.take(MAX_NATIVE_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_NATIVE_BYTES
        || bytes.get(36..40) != Some(b"sbsp".as_slice())
        || bytes.get(44..48) != Some(64u32.to_be_bytes().as_slice())
        || bytes.get(56..58) != Some(5u16.to_be_bytes().as_slice())
        || bytes.get(60..64) != Some(b"blam".as_slice())
    {
        return invalid("Detail preservation requires a native version-5 Halo 1 BSP tag, not a cache pointer layout");
    }
    Ok(crate::hex_bytes(Sha256::digest(&bytes)))
}

fn inspector_hash(path: &Path) -> Result<String> {
    reject_links(path)?;
    if !path.is_file() || !(1..=256 * 1024 * 1024).contains(&fs::metadata(path)?.len()) {
        return invalid("BSP detail inspector is missing or exceeds its bound");
    }
    maps::hash_file(path)
}

fn lines(text: &str) -> Result<Vec<&str>> {
    if text.len() > MAX_OUTPUT_BYTES {
        return invalid("BSP detail reader output exceeds 16 MiB");
    }
    let rows: Vec<_> = text
        .lines()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .take(MAX_QUERY_VALUES + 1)
        .collect();
    if rows.len() > MAX_QUERY_VALUES {
        return invalid("BSP detail reader exceeds its value budget");
    }
    Ok(rows)
}

fn counts(text: &str, maxima: &[usize]) -> Result<Vec<usize>> {
    let rows = lines(text)?;
    if rows.len() != maxima.len() {
        return invalid("BSP detail reader returned an incomplete array inventory");
    }
    rows.into_iter()
        .zip(maxima)
        .map(|(row, max)| {
            let count = row.parse::<usize>().map_err(|_| {
                SparkError::Invalid("BSP detail count is not a decimal integer".into())
            })?;
            if count > *max {
                return invalid("BSP detail count exceeds the verified Halo 1 layout");
            }
            Ok(count)
        })
        .collect()
}

/// Runs read-only -C/-G requests through the caller's verified tool boundary.
///
/// The callback must prefix its pinned tag root and suffix the selected native
/// BSP path, just like bsp_audio's Invader invocation. It must retain bounded
/// output/cancellation and suppress per-value UI logging. No per-object process
/// is launched: at most three calls cover all counts and fields.
pub(crate) fn snapshot(
    native_file: &Path,
    inspector: &Path,
    mut query: impl FnMut(&[String]) -> Result<String>,
) -> Result<Snapshot> {
    let native_sha256 = native_hash(native_file)?;
    let inspector_sha256 = inspector_hash(inspector)?;
    let detail_blocks = counts(&query(&["-C".into(), "detail_objects".into()])?, &[1])?[0];
    let sizes = if detail_blocks == 0 {
        vec![0; 4]
    } else {
        let args: Vec<String> = ["cells", "instances", "counts", "z_reference_vectors"]
            .into_iter()
            .flat_map(|field| ["-C".into(), format!("detail_objects[0].{field}")])
            .collect();
        counts(&query(&args)?, &[262144, 2097152, 8388608, 262144])?
    };
    let fields: [(&str, usize, i64, i64); 17] = [
        ("cells[*].cell_x", sizes[0], -32768, 32767),
        ("cells[*].cell_y", sizes[0], -32768, 32767),
        ("cells[*].cell_z", sizes[0], -32768, 32767),
        ("cells[*].offset_z", sizes[0], -32768, 32767),
        ("cells[*].valid_layers_flags", sizes[0], 0, u32::MAX as i64),
        ("cells[*].start_index", sizes[0], 0, sizes[1] as i64),
        ("cells[*].count_index", sizes[0], 0, sizes[2] as i64),
        ("instances[*].position_x", sizes[1], -128, 127),
        ("instances[*].position_y", sizes[1], -128, 127),
        ("instances[*].position_z", sizes[1], -128, 127),
        ("instances[*].data", sizes[1], -128, 127),
        ("instances[*].color", sizes[1], -32768, 32767),
        ("counts[*].count", sizes[2], 0, 65535),
        ("z_reference_vectors[*].z_reference_i", sizes[3], 0, 0),
        ("z_reference_vectors[*].z_reference_j", sizes[3], 0, 0),
        ("z_reference_vectors[*].z_reference_k", sizes[3], 0, 0),
        ("z_reference_vectors[*].z_reference_l", sizes[3], 0, 0),
    ];
    let total = fields
        .iter()
        .try_fold(0usize, |sum, field| sum.checked_add(field.1))
        .ok_or_else(|| SparkError::Invalid("BSP detail value count overflows".into()))?;
    if total > MAX_QUERY_VALUES {
        return invalid("BSP detail snapshot exceeds its bounded value budget");
    }
    let mut integer = Sha256::new();
    let mut floats = Sha256::new();
    if total != 0 {
        let args: Vec<String> = fields
            .iter()
            .filter(|field| field.1 != 0)
            .flat_map(|field| ["-G".into(), format!("detail_objects[0].{}", field.0)])
            .collect();
        let text = query(&args)?;
        let rows = lines(&text)?;
        if rows.len() != total {
            return invalid("BSP detail reader returned missing or extra placement values");
        }
        let mut row = 0;
        for (index, (name, count, min, max)) in fields.iter().enumerate() {
            let digest = if index < 13 {
                &mut integer
            } else {
                &mut floats
            };
            digest.update(name.as_bytes());
            digest.update((*count as u64).to_be_bytes());
            for value in &rows[row..row + count] {
                if index < 13 {
                    let value = value.parse::<i64>().map_err(|_| {
                        SparkError::Invalid(
                            "BSP detail integer field was not a decimal integer".into(),
                        )
                    })?;
                    if value < *min || value > *max {
                        return invalid(
                            "BSP detail placement integer exceeds its native field range",
                        );
                    }
                    digest.update(value.to_be_bytes());
                } else {
                    let value = value.parse::<f64>().map_err(|_| {
                        SparkError::Invalid("BSP detail Z reference is not a float".into())
                    })?;
                    if !value.is_finite() || !(value as f32).is_finite() {
                        return invalid(
                            "BSP detail Z reference is nonfinite or exceeds native float range",
                        );
                    }
                    digest.update(value.to_bits().to_be_bytes());
                }
            }
            row += count;
        }
    }
    if native_hash(native_file)? != native_sha256 || inspector_hash(inspector)? != inspector_sha256
    {
        return invalid("BSP detail source or reader changed during inspection");
    }
    let snapshot = Snapshot {
        native_sha256,
        inspector_sha256,
        detail_blocks,
        cells: sizes[0],
        instances: sizes[1],
        layer_counts: sizes[2],
        z_reference_vectors: sizes[3],
        integer_fields_sha256: crate::hex_bytes(integer.finalize()),
        z_reference_display_sha256: crate::hex_bytes(floats.finalize()),
    };
    snapshot.validate()?;
    Ok(snapshot)
}

/// Does not bless rounded float equality as exact native preservation.
pub fn compare(before: &Snapshot, after: &Snapshot) -> Result<Comparison> {
    before.validate()?;
    after.validate()?;
    if before.inspector_sha256 != after.inspector_sha256 {
        return invalid("BSP detail reader identity changed between snapshots");
    }
    let byte_identical = before.native_sha256 == after.native_sha256;
    let displayed_fields_unchanged = (
        before.cells,
        before.instances,
        before.layer_counts,
        before.z_reference_vectors,
        &before.integer_fields_sha256,
        &before.z_reference_display_sha256,
    ) == (
        after.cells,
        after.instances,
        after.layer_counts,
        after.z_reference_vectors,
        &after.integer_fields_sha256,
        &after.z_reference_display_sha256,
    );
    let mut reasons = vec![];
    if before.instances > after.instances {
        reasons.push("Painted detail instances were removed; retain the original BSP snapshot and restore its derived working copy.".into());
    }
    if !displayed_fields_unchanged {
        reasons.push("Painted detail counts, packed positions, layer/color data or displayed Z references changed unexpectedly.".into());
    }
    if !byte_identical && (before.has_payload() || after.has_payload()) {
        reasons.push("Painted detail preservation is unverified after BSP serialization: the inspector rounds floating-point Z references. This change is blocked until exact native detail payload preservation can be proved; the original BSP remains recoverable.".into());
    }
    if byte_identical && !displayed_fields_unchanged {
        reasons.push("The same native BSP bytes produced inconsistent detail observations; do not accept this inspection.".into());
    }
    Ok(Comparison {
        safe_for_environment_edit: reasons.is_empty(),
        byte_identical,
        displayed_fields_unchanged,
        reasons,
    })
}

pub fn ensure_preserved(before: &Snapshot, after: &Snapshot) -> Result<Comparison> {
    let result = compare(before, after)?;
    if !result.safe_for_environment_edit {
        return invalid(result.reasons.join(" "));
    }
    Ok(result)
}

/// Validate a metadata path before the caller joins it to an owned working tree.
pub fn native_bsp_path(value: &str) -> Result<std::path::PathBuf> {
    let path = safe_relative(value)?;
    if path.extension().and_then(|s| s.to_str()) != Some("scenario_structure_bsp") {
        return invalid("Detail preservation requires a native BSP tag path");
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, std::path::PathBuf, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let native = dir.path().join("world.scenario_structure_bsp");
        let tool = dir.path().join("invader-edit.exe");
        let mut bytes = vec![0; 712];
        bytes[36..40].copy_from_slice(b"sbsp");
        bytes[44..48].copy_from_slice(&64u32.to_be_bytes());
        bytes[56..58].copy_from_slice(&5u16.to_be_bytes());
        bytes[60..64].copy_from_slice(b"blam");
        fs::write(&native, bytes).unwrap();
        fs::write(&tool, b"test-owned reader identity").unwrap();
        (dir, native, tool)
    }
    fn observed(
        native: &Path,
        tool: &Path,
        payload: bool,
        position_z: i8,
        z: &str,
    ) -> Result<Snapshot> {
        snapshot(native, tool, |args| {
            if args == ["-C", "detail_objects"] {
                return Ok(if payload { "1\n" } else { "0\n" }.into());
            }
            if args[0] == "-C" {
                return Ok("1\n1\n1\n1\n".into());
            }
            let mut output = String::new();
            for field in args.chunks_exact(2) {
                let name = field[1].as_str();
                let value = if name.ends_with("position_z") {
                    position_z.to_string()
                } else if name.contains("z_reference_vectors") {
                    z.into()
                } else {
                    "0".into()
                };
                output.push_str(&value);
                output.push('\n');
            }
            Ok(output)
        })
    }
    #[test]
    fn immutable_painted_bytes_and_empty_serialization_are_distinct_proofs() {
        let (_dir, native, tool) = fixture();
        let before = observed(&native, &tool, true, 1, "0.123456").unwrap();
        let same = observed(&native, &tool, true, 1, "0.123456").unwrap();
        assert!(ensure_preserved(&before, &same).unwrap().byte_identical);
        let empty_before = observed(&native, &tool, false, 0, "0").unwrap();
        let mut bytes = fs::read(&native).unwrap();
        bytes[100] = 1;
        fs::write(&native, bytes).unwrap();
        let empty_after = observed(&native, &tool, false, 0, "0").unwrap();
        assert!(
            !ensure_preserved(&empty_before, &empty_after)
                .unwrap()
                .byte_identical
        );
        let same_displayed = observed(&native, &tool, true, 1, "0.123456").unwrap();
        let blocked = compare(&before, &same_displayed).unwrap();
        assert!(blocked.displayed_fields_unchanged);
        assert!(!blocked.safe_for_environment_edit);
        assert!(blocked
            .reasons
            .iter()
            .any(|reason| reason.contains("rounds floating-point")));
    }
    #[test]
    fn clearing_movement_reader_changes_and_inconsistent_results_never_pass() {
        let (_dir, native, tool) = fixture();
        let before = observed(&native, &tool, true, 1, "0").unwrap();
        let moved = observed(&native, &tool, true, 2, "0").unwrap();
        assert!(ensure_preserved(&before, &moved).is_err());
        let cleared = observed(&native, &tool, false, 0, "0").unwrap();
        assert!(compare(&before, &cleared)
            .unwrap()
            .reasons
            .iter()
            .any(|reason| reason.contains("removed")));
        fs::write(&tool, b"different reader").unwrap();
        let other = observed(&native, &tool, true, 1, "0").unwrap();
        assert!(compare(&before, &other).is_err());
    }
    #[test]
    fn truncated_overflow_nonfinite_extra_values_and_mid_read_mutation_are_refused() {
        let (_dir, native, tool) = fixture();
        assert!(observed(&native, &tool, true, 0, "NaN").is_err());
        assert!(snapshot(&native, &tool, |_| Ok("2\n".into())).is_err());
        assert!(snapshot(&native, &tool, |args| Ok(if args.len() == 2 {
            "1\n"
        } else {
            "262145\n0\n0\n0\n"
        }
        .into()))
        .is_err());
        assert!(snapshot(&native, &tool, |_| {
            let mut bytes = fs::read(&native)?;
            bytes[100] ^= 1;
            fs::write(&native, bytes)?;
            Ok("0\n".into())
        })
        .is_err());
        assert!(counts("1\n2\n", &[1]).is_err());
        assert!(counts("-1", &[1]).is_err());
        fs::write(&native, b"truncated").unwrap();
        assert!(observed(&native, &tool, false, 0, "0").is_err());
        assert!(native_bsp_path("../bad.scenario_structure_bsp").is_err());
    }
    #[test]
    #[ignore = "Requires explicit local owned BSP/Invader paths; never ships game data"]
    fn owned_painted_bsp_reads_all_values_and_blocks_changed_serialization() {
        use std::{process::Command, time::Instant};
        let source = std::path::PathBuf::from(
            std::env::var_os("GUILTY_SPARK_DETAIL_QA_BSP").expect("Set an owned native BSP path"),
        );
        let inspector = std::path::PathBuf::from(
            std::env::var_os("GUILTY_SPARK_DETAIL_QA_INSPECTOR")
                .expect("Set the verified Invader-edit path"),
        );
        let source_sha = native_hash(&source).unwrap();
        let workspace = tempfile::tempdir().unwrap();
        let copy = workspace.path().join("world.scenario_structure_bsp");
        fs::copy(&source, &copy).unwrap();
        let read = |args: &[String]| -> Result<String> {
            let output = Command::new(&inspector)
                .arg("-t")
                .arg(workspace.path())
                .args(args)
                .arg("world.scenario_structure_bsp")
                .output()?;
            if !output.status.success()
                || output.stdout.len() > MAX_OUTPUT_BYTES
                || !output.stderr.is_empty()
            {
                return invalid("Owned native detail reader failed or returned diagnostics");
            }
            String::from_utf8(output.stdout)
                .map_err(|_| SparkError::Invalid("Non-UTF8 native detail result".into()))
        };
        let started = Instant::now();
        let before = snapshot(&copy, &inspector, read).unwrap();
        assert!(
            before.instances > 0,
            "Select a fixture with actual painted details"
        );
        let snapshot_ms = started.elapsed().as_millis();
        let mut bytes = fs::read(&copy).unwrap();
        bytes[0] = b'Q';
        fs::write(&copy, bytes).unwrap();
        let after = snapshot(&copy, &inspector, read).unwrap();
        let compared = compare(&before, &after).unwrap();
        assert!(compared.displayed_fields_unchanged);
        assert!(!compared.safe_for_environment_edit);
        assert_eq!(native_hash(&source).unwrap(), source_sha);
        println!("{}",serde_json::to_string(&serde_json::json!({"before":before,"after":after,"comparison":compared,"snapshotMilliseconds":snapshot_ms,"originalUnchanged":true,"gameLaunched":false})).unwrap());
    }
}
