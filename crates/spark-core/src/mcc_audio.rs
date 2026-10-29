//! Read-only MCC classic ADPCM bank binding. Source tag/pitch/permutation names,
//! rate, channels and encoded length must all agree with the pinned bank/index.
use crate::{
    audio::MAX_PREVIEW_BYTES, binary::Reader, invalid, maps, reject_links, Result, SparkError,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Binding {
    pub kind: String,
    pub directory: PathBuf,
    pub sha256: BTreeMap<String, String>,
}
impl Binding {
    pub fn validate(&self, version: u32) -> Result<()> {
        let expected: &[&str] = match self.kind.as_str() {
            "mccClassicAdpcm" if version == 13 => &["sounds_adpcm.fsb", "sounds_adpcm.lst.bin"],
            "classic" if [6, 7, 609].contains(&version) => &["sounds.map"],
            _ => return invalid("Audio resource kind does not match this source cache"),
        };
        if !self.directory.is_absolute()
            || self.sha256.len() != expected.len()
            || expected.iter().any(|name| {
                self.sha256.get(*name).is_none_or(|hash| {
                    hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit())
                })
            })
        {
            return invalid(
                "Audio resources require an exact local directory and fixed SHA-256 pins",
            );
        }
        Ok(())
    }
}
pub fn pin_classic(directory: &Path) -> Result<Binding> {
    let file = directory.join("sounds.map");
    reject_links(&file)?;
    if fs::metadata(&file)?.len() > 2 * 1024 * 1024 * 1024 {
        return invalid("Sound resource exceeds 2 GiB");
    }
    let hash = maps::hash_file(&file)?;
    crate::resource_map::open_verified_sound(&file, &hash)?;
    Ok(Binding {
        kind: "classic".into(),
        directory: directory.to_path_buf(),
        sha256: BTreeMap::from([("sounds.map".into(), hash)]),
    })
}
pub fn pin_mcc(directory: &Path) -> Result<Binding> {
    let mut sha256 = BTreeMap::new();
    for (name, file) in [
        ("sounds_adpcm.fsb", directory.join("sounds_adpcm.fsb")),
        (
            "sounds_adpcm.lst.bin",
            directory.join("lst/sounds_adpcm.lst.bin"),
        ),
    ] {
        reject_links(&file)?;
        let limit = if name.ends_with(".fsb") {
            2 * 1024 * 1024 * 1024
        } else {
            4 * 1024 * 1024
        };
        if fs::metadata(&file)?.len() > limit {
            return invalid("MCC audio resource exceeds its bound");
        }
        sha256.insert(name.into(), maps::hash_file(&file)?);
    }
    let binding = Binding {
        kind: "mccClassicAdpcm".into(),
        directory: directory.to_path_buf(),
        sha256,
    };
    Bank::open(&binding)?.verify()?;
    Ok(binding)
}
#[derive(Debug)]
struct Sample {
    name: String,
    offset: u64,
    span: usize,
    frames: usize,
    rate: u32,
    channels: u8,
}
#[derive(Debug)]
struct Group {
    first: usize,
    count: usize,
}
pub(crate) struct Bank {
    file: File,
    list: File,
    binding: Binding,
    samples: Vec<Sample>,
    groups: BTreeMap<String, Group>,
}
fn read_at(file: &mut File, at: u64, size: usize) -> Result<Vec<u8>> {
    let mut bytes = vec![0; size];
    file.seek(SeekFrom::Start(at))?;
    file.read_exact(&mut bytes)?;
    Ok(bytes)
}
fn logical(path: &str) -> Result<String> {
    crate::safe_relative(path)?;
    Ok(path.replace('/', "\\").to_ascii_lowercase())
}
impl Bank {
    pub(crate) fn open(binding: &Binding) -> Result<Self> {
        binding.validate(13)?;
        if binding.kind != "mccClassicAdpcm" {
            return invalid("Expected an MCC classic bank binding");
        }
        let bank_path = binding.directory.join("sounds_adpcm.fsb");
        let list_path = binding.directory.join("lst/sounds_adpcm.lst.bin");
        reject_links(&bank_path)?;
        reject_links(&list_path)?;
        let mut file = File::open(&bank_path)?;
        let mut list = File::open(&list_path)?;
        let length = file.metadata()?.len();
        let list_length = list.metadata()?.len();
        if !(60..=2 * 1024 * 1024 * 1024).contains(&length)
            || !(8..=4 * 1024 * 1024).contains(&list_length)
        {
            return invalid("MCC audio files exceed their bounds");
        }
        crate::resource_map::verify_open_handle_hash(
            &mut file,
            &binding.sha256["sounds_adpcm.fsb"],
        )?;
        crate::resource_map::verify_open_handle_hash(
            &mut list,
            &binding.sha256["sounds_adpcm.lst.bin"],
        )?;
        let header = read_at(&mut file, 0, 60)?;
        let r = Reader(&header);
        if &header[..4] != b"FSB5" || r.u32(4)? != 1 || r.u32(24)? != 7 || r.u32(32)? != 0 {
            return invalid("MCC sound preview needs the supported FSB5 classic IMA ADPCM layout");
        }
        let count = r.u32(8)? as usize;
        let header_size = r.u32(12)? as usize;
        let names_size = r.u32(16)? as usize;
        let data_size = r.u32(20)? as usize;
        if count == 0
            || count > 8192
            || header_size != count * 8
            || names_size < count * 4
            || names_size > 2 * 1024 * 1024
            || data_size > length as usize
            || 60 + header_size + names_size + data_size != length as usize
        {
            return invalid("MCC bank index dimensions are invalid");
        }
        let headers = read_at(&mut file, 60, header_size)?;
        let names = read_at(&mut file, (60 + header_size) as u64, names_size)?;
        let mut samples = vec![];
        let data_start = 60 + header_size + names_size;
        for index in 0..count {
            let word = u64::from_le_bytes(headers[index * 8..index * 8 + 8].try_into().unwrap());
            if word & 1 != 0 {
                return invalid("MCC bank sample has unsupported extended metadata");
            }
            let offset = (((word >> 7) & 0x7ffffff) * 32) as usize;
            let next = if index + 1 == count {
                data_size
            } else {
                let word =
                    u64::from_le_bytes(headers[index * 8 + 8..index * 8 + 16].try_into().unwrap());
                (((word >> 7) & 0x7ffffff) * 32) as usize
            };
            let channels = match (word >> 5) & 3 {
                0 => 1,
                1 => 2,
                _ => return invalid("MCC bank sample exceeds stereo"),
            };
            let rate = match (word >> 1) & 15 {
                5 => 22050,
                8 => 44100,
                _ => return invalid("MCC bank sample uses an unsupported rate"),
            };
            let frames = (word >> 34) as usize;
            let name_at = Reader(&names).u32(index * 4)? as usize;
            if name_at < count * 4
                || name_at >= names.len()
                || offset >= next
                || next > data_size
                || frames == 0
            {
                return invalid("MCC bank sample escapes its indexed span");
            }
            let name = Reader(&names).string(name_at, (names.len() - name_at).min(128))?;
            if name.is_empty()
                || name.contains(['\\', '/'])
                || name.bytes().any(|b| b < 32 || b == 127)
            {
                return invalid("Invalid MCC bank sample name");
            }
            samples.push(Sample {
                name,
                offset: (data_start + offset) as u64,
                span: next - offset,
                frames,
                rate,
                channels,
            });
        }
        let bytes = read_at(&mut list, 0, list_length as usize)?;
        let r = Reader(&bytes);
        if r.u32(0)? != 1 {
            return invalid("Unsupported MCC sound list version");
        }
        let groups_count = r.u32(4)? as usize;
        if groups_count == 0 || groups_count > 8192 {
            return invalid("MCC sound list count exceeds bounds");
        }
        let mut groups = BTreeMap::new();
        let mut at = 8;
        let mut covered = 0;
        for _ in 0..groups_count {
            let size = r.u32(at)? as usize;
            at += 4;
            if !(2..=241).contains(&size) {
                return invalid("Invalid MCC sound-list path length");
            }
            let value = r.bytes(at, size)?;
            if value[size - 1] != 0 || value[..size - 1].contains(&0) {
                return invalid("MCC sound-list path is not terminated exactly");
            }
            let name = logical(
                std::str::from_utf8(&value[..size - 1])
                    .map_err(|_| SparkError::Invalid("Non-UTF8 MCC sound path".into()))?,
            )?;
            at += size;
            let first = r.u32(at)? as usize;
            let count = r.u32(at + 4)? as usize;
            at += 8;
            if first != covered
                || count == 0
                || count > 2048
                || first + count > samples.len()
                || groups.insert(name, Group { first, count }).is_some()
            {
                return invalid("MCC sound-list groups overlap, duplicate or escape the bank");
            }
            covered += count;
        }
        if at != bytes.len() || covered != samples.len() {
            return invalid("MCC sound list does not cover its exact bank");
        }
        Ok(Self {
            file,
            list,
            binding: binding.clone(),
            samples,
            groups,
        })
    }
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn read_sample(
        &mut self,
        tag: &str,
        pitch_name: &str,
        pitch: usize,
        name: &str,
        permutation: usize,
        length: usize,
        channels: u8,
        rate: u32,
    ) -> Result<Vec<u8>> {
        let tag = logical(tag)?;
        if pitch_name.contains(['\\', '/']) {
            return invalid("MCC pitch name is not a single component");
        }
        let find = |tag: &str| -> Result<Option<(&Group, usize)>> {
            let base = self.groups.get(tag);
            let child = if pitch_name.is_empty() {
                None
            } else {
                self.groups
                    .get(&format!("{tag}\\{}", pitch_name.to_ascii_lowercase()))
            };
            match (base, child) {
                (Some(_), Some(_)) => invalid("MCC sound has ambiguous root and pitch groups"),
                (Some(group), None) => Ok(Some((group, pitch))),
                (None, Some(group)) => Ok(Some((group, pitch))),
                _ => Ok(None),
            }
        };
        let found = find(&tag)?;
        // MCC's classic bank uses this explicit namespace, while cache tags retain sfx.
        let classic = tag
            .strip_prefix("sound\\sfx\\")
            .map(|tail| format!("sound\\old_sfx\\{tail}"));
        let resolved = match found {
            Some(group) => Some(group),
            None => match classic {
                Some(ref path) => find(path)?,
                None => None,
            },
        };
        let (group,range)=resolved.ok_or_else(||SparkError::Invalid("No exact classic MCC sound/pitch group; CELT music/dialogue banks require a separate decoder".into()))?;
        let expected = format!("{name}_{range}_{permutation}");
        let mut matches = self.samples[group.first..group.first + group.count]
            .iter()
            .filter(|sample| sample.name.eq_ignore_ascii_case(&expected));
        let sample = matches.next().ok_or_else(|| {
            SparkError::Invalid("MCC bank permutation name does not match the source".into())
        })?;
        if matches.next().is_some()
            || sample.channels != channels
            || sample.rate != rate
            || length == 0
            || length > MAX_PREVIEW_BYTES
            || sample.frames % 64 != 0
            || sample.frames / 64 * 36 * channels as usize != length
            || sample.span < length
            || sample.span - length >= 32
        {
            return invalid(
                "MCC sample name, length, frames, channels or rate differs from source metadata",
            );
        }
        let bytes = read_at(&mut self.file, sample.offset, sample.span)?;
        if bytes[length..].iter().any(|byte| *byte != 0) {
            return invalid("MCC sample alignment contains nonzero data");
        }
        Ok(bytes[..length].to_vec())
    }
    pub(crate) fn verify(&mut self) -> Result<()> {
        crate::resource_map::verify_open_handle_hash(
            &mut self.file,
            &self.binding.sha256["sounds_adpcm.fsb"],
        )?;
        crate::resource_map::verify_open_handle_hash(
            &mut self.list,
            &self.binding.sha256["sounds_adpcm.lst.bin"],
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, Vec<u8>, Vec<u8>) {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("lst")).unwrap();
        let names = ["one_0_0", "two_1_0"];
        let mut strings = vec![];
        let mut table = vec![];
        for name in names {
            table.extend(((8 + strings.len()) as u32).to_le_bytes());
            strings.extend(name.as_bytes());
            strings.push(0);
        }
        table.extend(strings);
        let mut bytes = vec![0; 60];
        bytes[..4].copy_from_slice(b"FSB5");
        for (at, value) in [
            (4, 1),
            (8, 2),
            (12, 16),
            (16, table.len() as u32),
            (20, 128),
            (24, 7),
        ] {
            bytes[at..at + 4].copy_from_slice(&value.to_le_bytes());
        }
        for offset in [0u64, 64] {
            let mode = (64u64 << 34) | ((offset / 32) << 7) | (5 << 1);
            bytes.extend(mode.to_le_bytes());
        }
        bytes.extend(table);
        let start = bytes.len();
        bytes.resize(start + 128, 0);
        bytes[start..start + 2].copy_from_slice(&500i16.to_le_bytes());
        let mut list = vec![];
        list.extend(1u32.to_le_bytes());
        list.extend(2u32.to_le_bytes());
        for (index, name) in [
            "sound\\old_sfx\\test\\pitch_a",
            "sound\\old_sfx\\test\\pitch_b",
        ]
        .iter()
        .enumerate()
        {
            list.extend(((name.len() + 1) as u32).to_le_bytes());
            list.extend(name.as_bytes());
            list.push(0);
            list.extend((index as u32).to_le_bytes());
            list.extend(1u32.to_le_bytes());
        }
        fs::write(root.path().join("sounds_adpcm.fsb"), &bytes).unwrap();
        fs::write(root.path().join("lst/sounds_adpcm.lst.bin"), &list).unwrap();
        (root, bytes, list)
    }
    #[test]
    fn exact_classic_namespace_pitch_name_and_source_dimensions_are_required() {
        let (root, _, _) = fixture();
        let binding = pin_mcc(root.path()).unwrap();
        binding.validate(13).unwrap();
        assert!(binding.validate(609).is_err());
        let mut bank = Bank::open(&binding).unwrap();
        let sample = bank
            .read_sample("sound/sfx/test", "pitch_a", 0, "one", 0, 36, 1, 22050)
            .unwrap();
        assert_eq!(sample.len(), 36);
        assert!(bank.read_sample("sound/sfx/test","pitch_b",1,"two",0,36,1,22050).is_ok());
        assert!(bank.read_sample("sound/sfx/test","pitch_b",0,"two",0,36,1,22050).is_err());
        assert_eq!(&sample[..2], &500i16.to_le_bytes());
        bank.verify().unwrap();
        for (tag, pitch, name, permutation, length, channels, rate) in [
            ("sound/sfx/other", "pitch_a", "one", 0, 36, 1, 22050),
            ("sound/sfx/test", "pitch_b", "one", 0, 36, 1, 22050),
            ("sound/sfx/test", "pitch_a", "renamed", 0, 36, 1, 22050),
            ("sound/sfx/test", "pitch_a", "one", 1, 36, 1, 22050),
            ("sound/sfx/test", "pitch_a", "one", 0, 35, 1, 22050),
            ("sound/sfx/test", "pitch_a", "one", 0, 36, 2, 22050),
            ("sound/sfx/test", "pitch_a", "one", 0, 36, 1, 44100),
        ] {
            assert!(bank
                .read_sample(tag, pitch, 0, name, permutation, length, channels, rate)
                .is_err());
        }
    }
    #[test]
    fn bank_and_list_tampering_are_detected_before_and_after_sample_reads() {
        for list_changed in [false, true] {
            let (root, bytes, list) = fixture();
            let binding = pin_mcc(root.path()).unwrap();
            let mut bank = Bank::open(&binding).unwrap();
            let (path, mut data) = if list_changed {
                (root.path().join("lst/sounds_adpcm.lst.bin"), list)
            } else {
                (root.path().join("sounds_adpcm.fsb"), bytes)
            };
            let last = data.len() - 1;
            data[last] ^= 1;
            fs::write(&path, data).unwrap();
            assert!(bank.verify().is_err());
            assert!(Bank::open(&binding).is_err());
        }
    }
    #[test]
    fn malformed_bank_layout_codec_names_and_sound_lists_are_not_pinned() {
        for field in [4, 8, 12, 16, 20, 24, 32] {
            let (root, mut bytes, _) = fixture();
            bytes[field..field + 4].copy_from_slice(&u32::MAX.to_le_bytes());
            fs::write(root.path().join("sounds_adpcm.fsb"), bytes).unwrap();
            assert!(pin_mcc(root.path()).is_err());
        }
        for mode in [0, 1, 2] {
            let (root, _, mut list) = fixture();
            if mode == 0 {
                list[8..12].copy_from_slice(&u32::MAX.to_le_bytes());
            } else if mode == 1 {
                let size = u32::from_le_bytes(list[8..12].try_into().unwrap()) as usize;
                list[12 + size..16 + size].copy_from_slice(&1u32.to_le_bytes());
            } else {
                list.push(0);
            }
            fs::write(root.path().join("lst/sounds_adpcm.lst.bin"), list).unwrap();
            assert!(pin_mcc(root.path()).is_err());
        }
    }
    #[test]
    fn nonzero_sample_padding_never_becomes_audio() {
        let (root, mut bytes, _) = fixture();
        let at = bytes.len() - 128 + 36;
        bytes[at] = 1;
        fs::write(root.path().join("sounds_adpcm.fsb"), bytes).unwrap();
        let binding = pin_mcc(root.path()).unwrap();
        let mut bank = Bank::open(&binding).unwrap();
        assert!(bank
            .read_sample("sound/sfx/test", "pitch_a", 0, "one", 0, 36, 1, 22050)
            .is_err());
    }
    #[test]
    fn audio_bindings_roundtrip_without_invalidating_native_build_identity() {
        let (root, _, _) = fixture();
        let binding = pin_mcc(root.path()).unwrap();
        let mut p = crate::project::Project::new("Audio binding fixture");
        p.source = Some(crate::project::Source {
            original_path: root.path().join("source.map"),
            preserved_path: root.path().join("source.map"),
            sha256: "a".repeat(64),
            cache_version: 13,
            engine: "MCC".into(),
            scenario_path: "levels/test".into(),
            archive: None,
            resource_directory: None,
            resource_sha256: BTreeMap::new(),
            audio_resources: None,
        });
        let before = p.fingerprint().unwrap();
        let old = serde_json::to_value(&p).unwrap();
        assert!(old["source"].get("audioResources").is_none());
        assert!(serde_json::from_value::<crate::project::Project>(old)
            .unwrap()
            .source
            .unwrap()
            .audio_resources
            .is_none());
        p.source.as_mut().unwrap().audio_resources = Some(binding);
        p.validate().unwrap();
        assert_eq!(p.fingerprint().unwrap(), before);
        let restored: crate::project::Project =
            serde_json::from_slice(&serde_json::to_vec(&p).unwrap()).unwrap();
        assert_eq!(
            restored.source.unwrap().audio_resources.unwrap().kind,
            "mccClassicAdpcm"
        );
    }
}
