//! Strict read-only main-track metadata. No alternate/detail scripting or game mixer emulation.
use crate::{binary::Reader, invalid, maps, Result, SparkError};
use serde::Serialize;
use std::{collections::HashMap, path::Path};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub index: usize,
    pub gain: f32,
    pub fade_in_seconds: f32,
    pub fade_out_seconds: f32,
    pub start_tag_id: Option<u32>,
    pub loop_tag_id: Option<u32>,
    pub end_tag_id: Option<u32>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Inspection {
    pub tag_id: u32,
    pub tag_path: String,
    pub source_sha256: String,
    pub loops: bool,
    pub tracks: Vec<Track>,
    pub warnings: Vec<String>,
}
pub fn inspect(path: &Path, expected_sha256: &str, tag_id: u32) -> Result<Inspection> {
    let (header, bytes, sha256) = maps::read_cache_snapshot(path)?;
    if sha256 != expected_sha256 {
        return invalid("Looping sound source identity changed");
    }
    inspect_bytes(&header, &bytes, sha256, tag_id)
}
fn inspect_bytes(
    header: &maps::MapHeader,
    bytes: &[u8],
    sha256: String,
    tag_id: u32,
) -> Result<Inspection> {
    if ![6, 7, 13, 609].contains(&header.version) || header.extended {
        return invalid("Looping sound preview needs a supported unextended Halo 1 cache");
    }
    let r = Reader(bytes);
    let begin = header.tag_offset as usize;
    let end = begin
        .checked_add(header.tag_size as usize)
        .filter(|end| *end <= bytes.len())
        .ok_or_else(|| SparkError::Invalid("Looping sound tag region exceeds the cache".into()))?;
    r.bytes(begin, 40)?;
    let base = match header.version {
        6 => 0x4bf10000,
        13 => r
            .u32(begin)?
            .checked_sub(40)
            .ok_or_else(|| SparkError::Invalid("Invalid MCC tag base".into()))?,
        _ => 0x40440000,
    };
    let pointer = |address: u32, size: usize| -> Result<usize> {
        let at = begin
            .checked_add(address.checked_sub(base).ok_or_else(|| {
                SparkError::Invalid("Looping sound pointer precedes tag data".into())
            })? as usize)
            .ok_or_else(|| SparkError::Invalid("Looping sound pointer overflow".into()))?;
        if at.checked_add(size).is_none_or(|last| last > end) {
            return invalid("Looping sound structure exceeds tag data");
        }
        Ok(at)
    };
    if r.u32(begin + 36)? != 0x74616773 {
        return invalid("Invalid looping sound tag index");
    }
    let count = r.u32(begin + 12)? as usize;
    if count > maps::MAX_TAGS {
        return invalid("Looping sound tag count exceeds the limit");
    }
    let table = pointer(r.u32(begin)?, count * 32)?;
    let mut tags = HashMap::new();
    for index in 0..count {
        let at = table + index * 32;
        if tags.insert(r.u32(at + 12)?, at).is_some() {
            return invalid("Duplicate looping sound tag identifier");
        }
    }
    let entry = *tags
        .get(&tag_id)
        .ok_or_else(|| SparkError::Invalid("Looping sound tag is absent".into()))?;
    if r.fourcc(entry)? != "lsnd" || r.u32(entry + 24)? != 0 {
        return invalid("Selected tag is not an embedded looping sound");
    }
    let name = pointer(r.u32(entry + 16)?, 1)?;
    let root = pointer(r.u32(entry + 20)?, 84)?;
    let flags = r.u32(root)?;
    if flags & !15 != 0 {
        return invalid("Looping sound has unsupported flag bits");
    }
    let count = r.u32(root + 60)? as usize;
    if count > 4 {
        return invalid("Looping sound exceeds four tracks");
    }
    let tracks = if count == 0 {
        0
    } else {
        pointer(r.u32(root + 64)?, count * 160)?
    };
    let reference = |at: usize| -> Result<Option<u32>> {
        let id = r.u32(at + 12)?;
        if id == u32::MAX {
            return Ok(None);
        }
        let tag = tags.get(&id).ok_or_else(|| {
            SparkError::Invalid("Looping sound phase references an absent tag".into())
        })?;
        if r.fourcc(at)? != "snd!" || r.fourcc(*tag)? != "snd!" {
            return invalid("Looping sound phase has the wrong tag class");
        }
        Ok(Some(id))
    };
    let mut report = Inspection {
        tag_id,
        tag_path: r.string(name, (end - name).min(1024))?,
        source_sha256: sha256,
        loops: flags & 2 == 0,
        tracks: vec![],
        warnings: vec![],
    };
    if flags & 12 != 0 {
        report.warnings.push(
            "Global music/script effects are not reproduced by editor main-track playback.".into(),
        );
    }
    let detail_count = r.u32(root + 72)? as usize;
    if detail_count > 32 {
        return invalid("Looping sound exceeds 32 detail sounds");
    }
    if detail_count != 0 {
        pointer(r.u32(root + 76)?, detail_count * 104)?;
        report
            .warnings
            .push("Random detail sounds are not sequenced by main-track playback.".into());
    }
    for index in 0..count {
        let at = tracks + index * 160;
        let flags = r.u32(at)?;
        if flags & !7 != 0 {
            return invalid("Looping sound track has unsupported flag bits");
        }
        let gain = r.f32(at + 4)?;
        let fade_in = r.f32(at + 8)?;
        let fade_out = r.f32(at + 12)?;
        if !(0.0..=1.0).contains(&gain)
            || !(0.0..=600.0).contains(&fade_in)
            || !(0.0..=600.0).contains(&fade_out)
        {
            return invalid("Looping sound gain or fade duration is invalid");
        }
        if reference(at + 128)?.is_some() || reference(at + 144)?.is_some() {
            report.warnings.push(format!(
                "Track {} alternate phases require a separate runtime/script cue.",
                index + 1
            ));
        }
        report.tracks.push(Track {
            index,
            gain,
            fade_in_seconds: if flags & 1 != 0 { fade_in } else { 0. },
            fade_out_seconds: if flags & 2 != 0 { fade_out } else { 0. },
            start_tag_id: reference(at + 48)?,
            loop_tag_id: reference(at + 64)?,
            end_tag_id: reference(at + 80)?,
        });
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(version: u32) -> (maps::MapHeader, Vec<u8>) {
        let mut bytes = vec![0u8; 4096];
        let base: u32 = if version == 6 { 0x4bf10000 } else { 0x40440000 };
        let write = |bytes: &mut [u8], at: usize, value: u32| {
            bytes[at..at + 4].copy_from_slice(&value.to_le_bytes())
        };
        let ptr = |at: u32| base + at - 0x100;
        write(&mut bytes, 0x100, base + 40);
        write(&mut bytes, 0x10c, 4);
        write(&mut bytes, 0x124, 0x74616773);
        for index in 0..4 {
            let at = 0x128 + index * 32;
            bytes[at..at + 4].copy_from_slice(if index == 0 { b"dnsl" } else { b"!dns" });
            write(&mut bytes, at + 12, index as u32 + 1);
        }
        write(&mut bytes, 0x128 + 16, ptr(0x300));
        write(&mut bytes, 0x128 + 20, ptr(0x400));
        bytes[0x300..0x305].copy_from_slice(b"loop\0");
        write(&mut bytes, 0x43c, 1);
        write(&mut bytes, 0x440, ptr(0x500));
        write(&mut bytes, 0x500, 3);
        write(&mut bytes, 0x504, 0.75f32.to_bits());
        write(&mut bytes, 0x508, 0.25f32.to_bits());
        write(&mut bytes, 0x50c, 0.5f32.to_bits());
        for (offset, id) in [(48, 2), (64, 3), (80, 4), (128, u32::MAX), (144, u32::MAX)] {
            bytes[0x500 + offset..0x504 + offset].copy_from_slice(b"!dns");
            write(&mut bytes, 0x500 + offset + 12, id);
        }
        (
            maps::MapHeader {
                version,
                engine: "synthetic".into(),
                name: "loop".into(),
                build: "fixture".into(),
                scenario_type: 1,
                file_size: bytes.len() as u64,
                declared_size: bytes.len() as u32,
                tag_offset: 0x100,
                tag_size: 0x800,
                crc32: 0,
                flags: 0,
                demo_layout: version == 6,
                compressed: false,
                extended: false,
                legacy_tag_size_repair: false,
            },
            bytes,
        )
    }
    #[test]
    fn main_phases_and_flagged_fades_are_source_bound_across_pc_families() {
        for version in [6, 7, 13, 609] {
            let (header, bytes) = fixture(version);
            let report = inspect_bytes(&header, &bytes, "a".repeat(64), 1).unwrap();
            assert_eq!(report.tag_path, "loop");
            assert!(report.loops);
            let track = &report.tracks[0];
            assert_eq!(
                (track.start_tag_id, track.loop_tag_id, track.end_tag_id),
                (Some(2), Some(3), Some(4))
            );
            assert_eq!(
                (track.gain, track.fade_in_seconds, track.fade_out_seconds),
                (0.75, 0.25, 0.5)
            );
            assert!(report.warnings.is_empty());
        }
    }
    #[test]
    fn absent_phases_and_disabled_fades_remain_explicit() {
        let (header, mut bytes) = fixture(13);
        bytes[0x400..0x404].copy_from_slice(&2u32.to_le_bytes());
        bytes[0x500..0x504].fill(0);
        bytes[0x500 + 48 + 12..0x500 + 48 + 16].copy_from_slice(&u32::MAX.to_le_bytes());
        let report = inspect_bytes(&header, &bytes, "a".repeat(64), 1).unwrap();
        assert!(!report.loops);
        assert!(report.tracks[0].start_tag_id.is_none());
        assert_eq!(report.tracks[0].fade_in_seconds, 0.);
        assert_eq!(report.tracks[0].fade_out_seconds, 0.);
    }
    #[test]
    fn bad_phase_identity_counts_and_floats_never_become_a_partial_track() {
        for (at, value) in [
            (0x43c, 5),
            (0x500 + 48 + 12, 99),
            (0x504, f32::NAN.to_bits()),
            (0x508, (-1f32).to_bits()),
            (0x500, 8),
            (0x400, 16),
        ] {
            let (header, mut bytes) = fixture(7);
            bytes[at..at + 4].copy_from_slice(&value.to_le_bytes());
            assert!(inspect_bytes(&header, &bytes, "a".repeat(64), 1).is_err());
        }
        let (header, mut bytes) = fixture(7);
        bytes[0x148..0x14c].copy_from_slice(b"paew");
        assert!(inspect_bytes(&header, &bytes, "a".repeat(64), 1).is_err());
    }
    #[test]
    fn region_escape_duplicate_ids_and_every_truncated_span_are_rejected() {
        let (header, bytes) = fixture(13);
        for length in [0, 255, 295, 512, 1024, 2303] {
            assert!(inspect_bytes(&header, &bytes[..length], "a".repeat(64), 1).is_err());
        }
        let mut changed = bytes.clone();
        changed[0x440..0x444].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(inspect_bytes(&header, &changed, "a".repeat(64), 1).is_err());
        let mut changed = bytes;
        changed[0x148 + 12..0x148 + 16].copy_from_slice(&1u32.to_le_bytes());
        assert!(inspect_bytes(&header, &changed, "a".repeat(64), 1).is_err());
    }
}
