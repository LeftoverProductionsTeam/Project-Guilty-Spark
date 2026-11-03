//! Changed Halo 1 loose-tag byte checks. A valid CRC is not semantic proof.
use crate::{reject_links, safe_relative, working_tag_changes::Hashes, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, io::Read, path::Path};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub path: String,
    pub state: String,
    pub detail: String,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub native_parser_checked_files: usize,
    pub semantic_unverified_files: usize,
    pub equivalent_field_files: usize,
    pub changed_field_files: usize,
    pub checked_files: usize,
    pub invalid_files: usize,
    pub unverified_files: usize,
    pub pending_files: usize,
    pub findings: Vec<Finding>,
    pub list_truncated: bool,
}
impl Report {
    pub fn blocked(&self) -> bool {
        self.invalid_files > 0
            || self.pending_files > 0
            || self.semantic_unverified_files > 0
            || self.native_parser_checked_files < self.checked_files + self.unverified_files
    }
}
#[derive(Default)]
pub struct Cache {
    files: BTreeMap<String, (String, Finding)>,
}
fn finding(path: &str, state: &str, detail: impl Into<String>) -> Finding {
    Finding {
        path: path.into(),
        state: state.into(),
        detail: detail.into(),
    }
}
fn inspect(root: &Path, relative: &str, expected: &str) -> Result<Finding> {
    let path = root.join(safe_relative(relative)?);
    reject_links(&path)?;
    let before = fs::metadata(&path)?;
    let mut file = fs::File::open(&path)?;
    let mut header = [0u8; 64];
    if before.len() < 64 {
        return Ok(finding(
            relative,
            "invalid",
            "Native tag is truncated before its 64-byte header.",
        ));
    }
    file.read_exact(&mut header)?;
    if &header[60..64] != b"blam" {
        let state = if &header[60..64] == b"BLAM" || &header[60..64] == b"MALB" {
            "unverified"
        } else {
            "invalid"
        };
        return Ok(finding(relative,state,"Unsupported or damaged signature; this live checker covers big-endian Halo 1 loose tags."));
    }
    if u32::from_be_bytes(header[44..48].try_into().unwrap()) != 64 {
        return Ok(finding(
            relative,
            "invalid",
            "Native header size is invalid; restore the previous source or retry the editor save.",
        ));
    }
    let class = std::str::from_utf8(&header[36..40]).unwrap_or("");
    let extension = match crate::tag_exchange::extension(class) {
        Ok(ext) => ext,
        Err(_) => {
            return Ok(finding(
                relative,
                "unverified",
                "Tag class is outside the checked Halo 1 registry.",
            ))
        }
    };
    if path
        .extension()
        .and_then(|v| v.to_str())
        .is_none_or(|v| !v.eq_ignore_ascii_case(extension))
    {
        return Ok(finding(
            relative,
            "invalid",
            "Native tag class does not match its file extension.",
        ));
    }
    if before.len() > 512 * 1024 * 1024 {
        return Ok(finding(
            relative,
            "unverified",
            "Tag exceeds the 512 MiB live checksum limit; native review is required.",
        ));
    }
    let mut crc = flate2::Crc::new();
    let mut sha = Sha256::new();
    sha.update(header);
    let mut buffer = [0u8; 64 * 1024];
    let mut bytes = 64u64;
    loop {
        let size = file.read(&mut buffer)?;
        if size == 0 {
            break;
        }
        bytes += size as u64;
        if bytes > before.len() {
            return Ok(finding(
                relative,
                "pending",
                "File changed during verification; waiting for a stable save.",
            ));
        }
        crc.update(&buffer[..size]);
        sha.update(&buffer[..size]);
    }
    if bytes != before.len()
        || crate::hex_bytes(sha.finalize()) != expected
        || fs::metadata(&path)?.modified()? != before.modified()?
    {
        return Ok(finding(
            relative,
            "pending",
            "File changed during verification; waiting for a stable save.",
        ));
    }
    let recorded = u32::from_be_bytes(header[40..44].try_into().unwrap());
    if recorded == 0 {
        return Ok(finding(
            relative,
            "unverified",
            "Writer recorded no native CRC. Header checks pass; byte integrity is unverified.",
        ));
    }
    if recorded != !crc.sum() {
        return Ok(finding(relative,"invalid","Native payload CRC differs from its header. Possible corrupt/incomplete save or a writer that did not update the checksum. Review or restore before accepting or compiling."));
    }
    Ok(finding(relative,"checked","Header, class and payload CRC match. Semantic structures/dependencies still require a native parser/compiler."))
}
impl Cache {
    pub fn scan(
        &mut self,
        root: &Path,
        base: &Hashes,
        current: &Hashes,
        mut budget: u64,
    ) -> Result<Report> {
        let mut report = Report::default();
        let mut reads = 0;
        self.files.retain(|path, _| current.contains_key(path));
        for (path, hash) in current
            .iter()
            .filter(|(path, hash)| base.get(*path) != Some(*hash))
        {
            if self.files.get(path).is_none_or(|(known, _)| known != hash) {
                let file = root.join(safe_relative(path)?);
                reject_links(&file)?;
                let size = fs::metadata(file)?.len();
                if budget < size && reads > 0 {
                    report.pending_files += 1;
                    continue;
                }
                budget = budget.saturating_sub(size);
                reads += 1;
                let checked = inspect(root, path, hash)?;
                if checked.state == "pending" {
                    report.pending_files += 1;
                    if report.findings.len() < 128 {
                        report.findings.push(checked);
                    }
                    continue;
                }
                self.files.insert(path.clone(), (hash.clone(), checked));
            }
            let result = &self.files[path].1;
            match result.state.as_str() {
                "invalid" => report.invalid_files += 1,
                "checked" => report.checked_files += 1,
                _ => report.unverified_files += 1,
            }
            if result.state != "checked" {
                if report.findings.len() < 128 {
                    report.findings.push(result.clone());
                } else {
                    report.list_truncated = true;
                }
            }
        }
        Ok(report)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::maps;
    #[test]
    fn unverified_semantics_never_authorize_reconciliation_or_compilation() {
        let mut report = Report {
            checked_files: 2,
            native_parser_checked_files: 1,
            ..Default::default()
        };
        assert!(report.blocked());
        report.native_parser_checked_files = 2;
        assert!(!report.blocked());
        report.semantic_unverified_files = 1;
        assert!(report.blocked());
        report.semantic_unverified_files = 0;
        report.pending_files = 1;
        assert!(report.blocked());
    }
    fn tag(payload: &[u8]) -> Vec<u8> {
        let mut bytes = vec![0; 64];
        bytes[36..40].copy_from_slice(b"weap");
        bytes[44..48].copy_from_slice(&64u32.to_be_bytes());
        bytes[60..64].copy_from_slice(b"blam");
        let mut crc = flate2::Crc::new();
        crc.update(payload);
        bytes[40..44].copy_from_slice(&(!crc.sum()).to_be_bytes());
        bytes.extend_from_slice(payload);
        bytes
    }
    #[test]
    fn detects_corruption_and_recovers_without_repairing_bytes() {
        let root = tempfile::tempdir().unwrap();
        let file = root.path().join("pistol.weapon");
        let valid = tag(b"synthetic payload; not a semantic weapon");
        fs::write(&file, &valid).unwrap();
        let mut cache = Cache::default();
        let base = Hashes::new();
        let report = cache
            .scan(
                root.path(),
                &base,
                &Hashes::from([("pistol.weapon".into(), maps::hash_file(&file).unwrap())]),
                u64::MAX,
            )
            .unwrap();
        assert_eq!(report.checked_files, 1);
        assert!(
            report.blocked(),
            "CRC alone must not authorize reconciliation"
        );
        let mut damaged = valid.clone();
        damaged[70] ^= 1;
        fs::write(&file, &damaged).unwrap();
        let report = cache
            .scan(
                root.path(),
                &base,
                &Hashes::from([("pistol.weapon".into(), maps::hash_file(&file).unwrap())]),
                u64::MAX,
            )
            .unwrap();
        assert_eq!(report.invalid_files, 1);
        assert!(report.findings[0].detail.contains("CRC"));
        assert_eq!(fs::read(&file).unwrap(), damaged);
        fs::write(&file, &valid).unwrap();
        assert_eq!(
            cache
                .scan(
                    root.path(),
                    &base,
                    &Hashes::from([("pistol.weapon".into(), maps::hash_file(&file).unwrap())]),
                    u64::MAX
                )
                .unwrap()
                .invalid_files,
            0
        );
    }
    #[test]
    fn truncation_and_wrong_class_are_invalid_but_unrecorded_crc_is_unverified() {
        let root = tempfile::tempdir().unwrap();
        let file = root.path().join("pistol.weapon");
        for bytes in [b"blam".to_vec(), {
            let mut b = tag(b"data");
            b[36..40].copy_from_slice(b"scen");
            b
        }] {
            fs::write(&file, bytes).unwrap();
            assert_eq!(
                inspect(
                    root.path(),
                    "pistol.weapon",
                    &maps::hash_file(&file).unwrap()
                )
                .unwrap()
                .state,
                "invalid"
            );
        }
        let mut bytes = tag(b"data");
        bytes[40..44].fill(0);
        fs::write(&file, bytes).unwrap();
        assert_eq!(
            inspect(
                root.path(),
                "pistol.weapon",
                &maps::hash_file(&file).unwrap()
            )
            .unwrap()
            .state,
            "unverified"
        );
    }
    #[test]
    fn a_small_scan_budget_makes_progress_past_cached_files() {
        let root = tempfile::tempdir().unwrap();
        let bytes = tag(b"bounded native checksum fixture");
        let mut hashes = Hashes::new();
        for name in ["a.weapon", "b.weapon"] {
            let file = root.path().join(name);
            fs::write(&file, &bytes).unwrap();
            hashes.insert(name.into(), maps::hash_file(&file).unwrap());
        }
        let mut cache = Cache::default();
        let first = cache.scan(root.path(), &Hashes::new(), &hashes, 1).unwrap();
        assert_eq!(first.checked_files, 1);
        assert_eq!(first.pending_files, 1);
        let second = cache.scan(root.path(), &Hashes::new(), &hashes, 1).unwrap();
        assert_eq!(second.checked_files, 2);
        assert_eq!(second.pending_files, 0);
    }
    #[test]
    fn verified_starting_bytes_exclude_untouched_stale_crc_but_never_hide_a_new_bad_save() {
        let root = tempfile::tempdir().unwrap();
        let parent = root.path().join("parent");
        let preserved = root.path().join("preserved");
        let edited = root.path().join("edited");
        let mut original = tag(b"previously compiled native source fixture");
        original[40] ^= 1; // Original header CRC is stale; never repair it by guessing.
        for folder in [&parent, &preserved, &edited] {
            fs::create_dir(folder).unwrap();
            fs::write(folder.join("same.weapon"), &original).unwrap();
        }
        let expected = crate::tool_transaction::inventory(&parent).unwrap();
        let baseline = crate::tool_transaction::verified_starting_inventory(&preserved, &parent, &expected).unwrap();
        let mut cache = Cache::default();
        let old = cache.scan(&edited, &baseline, &expected, u64::MAX).unwrap();
        assert!(!old.blocked());
        assert_eq!(old.checked_files, 0, "Unchanged native input is not a newly edited tag");
        fs::write(edited.join("same.weapon"), b"bad save").unwrap();
        let bad = crate::tool_transaction::inventory(&edited).unwrap();
        assert!(cache.scan(&edited, &baseline, &bad, u64::MAX).unwrap().blocked());
        fs::write(parent.join("same.weapon"), b"changed parent").unwrap();
        assert!(crate::tool_transaction::verified_starting_inventory(&preserved, &parent, &expected).is_err());
        fs::write(parent.join("same.weapon"), &original).unwrap();
        fs::write(preserved.join("same.weapon"), b"changed preserved copy").unwrap();
        assert!(crate::tool_transaction::verified_starting_inventory(&preserved, &parent, &expected).is_err());
        assert!(crate::tool_transaction::verified_starting_inventory(&parent, &parent, &Hashes::new()).is_err());
    }
    #[test]
    fn standard_garbage_class_is_known_but_still_requires_matching_extension_and_payload() {
        let root = tempfile::tempdir().unwrap();
        let mut bytes = tag(b"header verification fixture, not semantic gameplay evidence");
        bytes[36..40].copy_from_slice(b"garb");
        let file = root.path().join("piece.garbage");
        fs::write(&file, &bytes).unwrap();
        assert_eq!(inspect(root.path(), "piece.garbage", &maps::hash_file(&file).unwrap()).unwrap().state, "checked");
        fs::write(root.path().join("piece.weapon"), &bytes).unwrap();
        assert_eq!(inspect(root.path(), "piece.weapon", &maps::hash_file(&file).unwrap()).unwrap().state, "invalid");
        bytes.push(1);
        fs::write(&file, &bytes).unwrap();
        assert_eq!(inspect(root.path(), "piece.garbage", &maps::hash_file(&file).unwrap()).unwrap().state, "invalid");
    }
}
