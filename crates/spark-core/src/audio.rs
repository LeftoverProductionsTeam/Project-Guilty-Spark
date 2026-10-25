//! Read-only, bounded preview of embedded legacy Vorbis audio. No decoder or
//! resource substitution is inferred from a filename. The browser decodes audio
//! only after complete Ogg container and Vorbis header validation here.
use crate::{binary::Reader, invalid, maps, Result, SparkError};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;

pub const MAX_PREVIEW_BYTES: usize = 16 * 1024 * 1024;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundPermutation {
    pub pitch_range: usize,
    pub permutation: usize,
    pub name: String,
    pub format: String,
    pub channels: u8,
    pub sample_rate: u32,
    pub byte_length: usize,
    pub embedded: bool,
    pub available: bool,
    pub sha256: Option<String>,
    pub duration_seconds: Option<f64>,
    pub reason: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundInspection {
    pub tag_id: u32,
    pub tag_path: String,
    pub source_sha256: String,
    pub permutations: Vec<SoundPermutation>,
    pub warnings: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioPreview {
    pub name: String,
    pub mime: String,
    pub sha256: String,
    pub bytes: Vec<u8>,
}

struct SoundData {
    report: SoundInspection,
    bytes: Vec<u8>,
    ranges: Vec<(usize, usize)>,
}

fn sound_data(path: &Path, expected_sha256: &str, tag_id: u32) -> Result<SoundData> {
    let (header, bytes, sha256) = maps::read_cache_snapshot(path)?;
    if sha256 != expected_sha256 {
        return invalid("Audio source checksum differs from the preserved project source");
    }
    if ![6, 7, 609].contains(&header.version) || header.extended {
        return invalid("Embedded audio preview currently supports unextended Demo, PC/Mac/MD and Custom Edition cache layouts");
    }
    let r = Reader(&bytes);
    let start = header.tag_offset as usize;
    let end = start + header.tag_size as usize;
    let base = if header.version == 6 {
        0x4bf10000
    } else {
        0x40440000
    };
    let pointer = |value: u32, size: usize| -> Result<usize> {
        let offset =
            start
                .checked_add(value.checked_sub(base).ok_or_else(|| {
                    SparkError::Invalid("Audio pointer precedes tag region".into())
                })? as usize)
                .ok_or_else(|| SparkError::Invalid("Audio pointer overflow".into()))?;
        if offset.checked_add(size).is_none_or(|last| last > end) {
            return invalid("Audio structure exceeds tag region");
        }
        Ok(offset)
    };
    if r.u32(start + 36)? != 0x74616773 {
        return invalid("Invalid tag index for audio inspection");
    }
    let count = r.u32(start + 12)? as usize;
    if count > maps::MAX_TAGS {
        return invalid("Audio tag count exceeds limit");
    }
    let table = pointer(r.u32(start)?, count * 32)?;
    let mut selected = None;
    for index in 0..count {
        let at = table + index * 32;
        if r.u32(at + 12)? == tag_id {
            if selected.is_some() {
                return invalid("Duplicate audio tag identifier");
            }
            selected = Some(at);
        }
    }
    let tag = selected
        .ok_or_else(|| SparkError::Invalid("Sound tag is not in the source cache".into()))?;
    if r.fourcc(tag)? != "snd!" {
        return invalid("Selected tag is not a sound");
    }
    let name_at = pointer(r.u32(tag + 16)?, 1)?;
    let mut report = SoundInspection {
        tag_id,
        tag_path: r.string(name_at, (end - name_at).min(1024))?,
        source_sha256: sha256,
        permutations: vec![],
        warnings: vec![],
    };
    if r.u32(tag + 24)? != 0 {
        report.warnings.push("Sound metadata is indexed in an external resource cache; embedded preview is unavailable".into());
        return Ok(SoundData {
            report,
            bytes,
            ranges: vec![],
        });
    }
    let at = pointer(r.u32(tag + 20)?, 164)?;
    let channels = match r.u16(at + 108)? {
        0 => 1,
        1 => 2,
        _ => return invalid("Unsupported sound channel enum"),
    };
    let sample_rate = match r.u16(at + 6)? {
        0 => 22050,
        1 => 44100,
        _ => return invalid("Unsupported sound sample-rate enum"),
    };
    let pitch_count = r.u32(at + 152)? as usize;
    if pitch_count > 8 {
        return invalid("Sound exceeds eight pitch ranges");
    }
    let pitches = if pitch_count == 0 {
        0
    } else {
        pointer(r.u32(at + 156)?, pitch_count * 72)?
    };
    let mut ranges = vec![];
    let mut inspected_sample_bytes = 0usize;
    for pitch_range in 0..pitch_count {
        let pitch = pitches + pitch_range * 72;
        let count = r.u32(pitch + 60)? as usize;
        if count > 256 {
            return invalid("Sound exceeds 256 permutations per pitch range");
        }
        let permutations = if count == 0 {
            0
        } else {
            pointer(r.u32(pitch + 64)?, count * 124)?
        };
        for permutation in 0..count {
            let perm = permutations + permutation * 124;
            let codec = r.u16(perm + 40)?;
            let length = r.u32(perm + 64)? as usize;
            let flags = r.u32(perm + 68)?;
            let offset = r.u32(perm + 72)? as usize;
            let mut item = SoundPermutation {
                pitch_range,
                permutation,
                name: r.string(perm, 32)?,
                format: match codec {
                    0 => "PCM",
                    1 => "Xbox ADPCM",
                    2 => "IMA ADPCM",
                    3 => "Ogg Vorbis",
                    _ => "Unknown",
                }
                .into(),
                channels,
                sample_rate,
                byte_length: length,
                embedded: flags == 0,
                available: false,
                sha256: None,
                duration_seconds: None,
                reason: None,
            };
            let validation = (|| -> Result<(String, f64)> {
                if flags != 0 {
                    return invalid("Samples reference an external resource cache; no replacement audio was selected");
                }
                if codec != 3 {
                    return invalid("Preview decoding is only implemented for embedded Ogg Vorbis");
                }
                if length == 0 || length > MAX_PREVIEW_BYTES {
                    return invalid("Audio preview must be between 1 byte and 16 MiB");
                }
                inspected_sample_bytes += length;
                if inspected_sample_bytes > 64 * 1024 * 1024 {
                    return invalid(
                        "This sound exceeds the 64 MiB aggregate preview inspection budget",
                    );
                }
                if offset < 2048 {
                    return invalid("Audio sample range overlaps the cache header");
                }
                let samples = r.bytes(offset, length)?;
                let (actual_channels, actual_rate, duration) = validate_vorbis(samples)?;
                if actual_channels != channels || actual_rate != sample_rate {
                    return invalid(
                        "Vorbis identification disagrees with the sound tag's rate or channels",
                    );
                }
                Ok((format!("{:x}", Sha256::digest(samples)), duration))
            })();
            match validation {
                Ok((hash, duration)) => {
                    item.available = true;
                    item.sha256 = Some(hash);
                    item.duration_seconds = Some(duration);
                }
                Err(e) => item.reason = Some(e.to_string()),
            }
            ranges.push((offset, length));
            report.permutations.push(item);
        }
    }
    report.warnings.push("Preview validates complete Ogg pages, checksums and Vorbis headers. Browser decode and target-game playback remain separate checks.".into());
    Ok(SoundData {
        report,
        bytes,
        ranges,
    })
}

pub fn inspect_sound(path: &Path, expected_sha256: &str, tag_id: u32) -> Result<SoundInspection> {
    Ok(sound_data(path, expected_sha256, tag_id)?.report)
}
pub fn preview_sound(
    path: &Path,
    expected_sha256: &str,
    tag_id: u32,
    pitch_range: usize,
    permutation: usize,
) -> Result<AudioPreview> {
    let data = sound_data(path, expected_sha256, tag_id)?;
    let index = data
        .report
        .permutations
        .iter()
        .position(|p| p.pitch_range == pitch_range && p.permutation == permutation)
        .ok_or_else(|| SparkError::Invalid("Audio permutation is not in the source tag".into()))?;
    let item = &data.report.permutations[index];
    if !item.available {
        return invalid(item.reason.as_deref().unwrap_or("Audio is unavailable"));
    }
    let (offset, length) = data.ranges[index];
    Ok(AudioPreview {
        name: item.name.clone(),
        mime: "audio/ogg".into(),
        sha256: item.sha256.clone().unwrap(),
        bytes: data.bytes[offset..offset + length].to_vec(),
    })
}

fn ogg_crc(page: &[u8]) -> u32 {
    static TABLE: std::sync::OnceLock<[u32; 256]> = std::sync::OnceLock::new();
    let table = TABLE.get_or_init(|| {
        let mut table = [0u32; 256];
        for (i, entry) in table.iter_mut().enumerate() {
            let mut value = (i as u32) << 24;
            for _ in 0..8 {
                value = if value & 0x8000_0000 != 0 {
                    (value << 1) ^ 0x04c1_1db7
                } else {
                    value << 1
                };
            }
            *entry = value;
        }
        table
    });
    let mut crc = 0u32;
    for (i, byte) in page.iter().enumerate() {
        let byte = if (22..26).contains(&i) { 0 } else { *byte };
        crc = (crc << 8) ^ table[((crc >> 24) as u8 ^ byte) as usize];
    }
    crc
}

/// A complete single logical Vorbis stream, with bounded headers and duration.
/// This does not claim the compressed audio packets have been decoded.
fn validate_vorbis(data: &[u8]) -> Result<(u8, u32, f64)> {
    if data.len() > MAX_PREVIEW_BYTES {
        return invalid("Vorbis exceeds preview size limit");
    }
    let r = Reader(data);
    let mut at = 0;
    let mut serial = None;
    let mut sequence = 0u32;
    let mut continued = false;
    let mut headers: Vec<Vec<u8>> = vec![];
    let mut packet = vec![];
    let mut granule = None;
    let mut eos = false;
    while at < data.len() {
        if sequence >= 65536 {
            return invalid("Ogg stream exceeds page count limit");
        }
        let fixed = r.bytes(at, 27)?;
        let flags = fixed[5];
        if &fixed[..4] != b"OggS"
            || fixed[4] != 0
            || flags & !7 != 0
            || (flags & 1 != 0) != continued
            || (at == 0) != (flags & 2 != 0)
        {
            return invalid("Invalid Ogg page signature, version or continuation flags");
        }
        let this_serial = r.u32(at + 14)?;
        let this_sequence = r.u32(at + 18)?;
        if serial.is_some_and(|s| s != this_serial) || this_sequence != sequence {
            return invalid("Ogg serial or page sequence is discontinuous");
        }
        serial = Some(this_serial);
        sequence = sequence
            .checked_add(1)
            .ok_or_else(|| SparkError::Invalid("Ogg page sequence overflow".into()))?;
        let segments = r.bytes(at + 27, fixed[26] as usize)?;
        let page_size = 27 + segments.len() + segments.iter().map(|n| *n as usize).sum::<usize>();
        let page = r.bytes(at, page_size)?;
        if ogg_crc(page) != r.u32(at + 22)? {
            return invalid("Ogg page checksum failed");
        }
        let mut cursor = at + 27 + segments.len();
        for length in segments {
            let length = *length as usize;
            if headers.len() < 3 {
                if packet.len() + length > 1024 * 1024 {
                    return invalid("Vorbis header packet exceeds 1 MiB");
                }
                packet.extend_from_slice(r.bytes(cursor, length)?);
                if length < 255 {
                    headers.push(std::mem::take(&mut packet));
                }
            }
            cursor += length;
            continued = length == 255;
        }
        let raw_granule = u64::from_le_bytes(r.bytes(at + 6, 8)?.try_into().unwrap());
        if raw_granule != u64::MAX {
            granule = Some(raw_granule);
        }
        at += page_size;
        if flags & 4 != 0 {
            if at != data.len() || continued || raw_granule == u64::MAX {
                return invalid("Ogg EOS does not end a complete single stream");
            }
            eos = true;
        } else if eos {
            return invalid("Data follows Ogg end-of-stream");
        }
    }
    if !eos || headers.len() != 3 {
        return invalid("Ogg stream is incomplete or has no Vorbis headers");
    }
    for (header, kind) in headers.iter().zip([1, 3, 5]) {
        if header.len() < 7 || header[0] != kind || &header[1..7] != b"vorbis" {
            return invalid("Invalid Vorbis identification/comment/setup header");
        }
    }
    let identification = Reader(&headers[0]);
    if headers[0].len() != 30 || identification.u32(7)? != 0 || headers[0][29] != 1 {
        return invalid("Unsupported Vorbis identification header");
    }
    let channels = headers[0][11];
    let rate = identification.u32(12)?;
    let blocks = headers[0][28];
    if ![1, 2].contains(&channels)
        || ![22050, 44100].contains(&rate)
        || !(6..=13).contains(&(blocks & 15))
        || !(6..=13).contains(&(blocks >> 4))
        || blocks & 15 > blocks >> 4
    {
        return invalid("Unsupported Vorbis channels, rate or block sizes");
    }
    let duration = granule
        .ok_or_else(|| SparkError::Invalid("Vorbis final sample position is missing".into()))?
        as f64
        / rate as f64;
    if duration <= 0.0 || duration > 3600.0 {
        return invalid("Vorbis duration exceeds preview bounds");
    }
    Ok((channels, rate, duration))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn stream() -> Vec<u8> {
        let mut id = vec![1];
        id.extend_from_slice(b"vorbis");
        id.extend_from_slice(&0u32.to_le_bytes());
        id.push(2);
        id.extend_from_slice(&44100u32.to_le_bytes());
        id.extend_from_slice(&[0; 12]);
        id.extend_from_slice(&[0xb8, 1]);
        let comment = b"\x03vorbis\0\0\0\0\0\0\0\0\x01";
        let setup = b"\x05vorbis\x01";
        let mut bytes = b"OggS\0\x06".to_vec();
        bytes.extend_from_slice(&44100u64.to_le_bytes());
        bytes.extend_from_slice(&1u32.to_le_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.extend_from_slice(&[0; 4]);
        bytes.push(3);
        bytes.extend_from_slice(&[id.len() as u8, comment.len() as u8, setup.len() as u8]);
        bytes.extend(id);
        bytes.extend(comment);
        bytes.extend(setup);
        let crc = ogg_crc(&bytes);
        bytes[22..26].copy_from_slice(&crc.to_le_bytes());
        bytes
    }
    #[test]
    fn checks_entire_container_and_rejects_corruption_truncation_and_chaining() {
        let bytes = stream();
        assert_eq!(validate_vorbis(&bytes).unwrap(), (2, 44100, 1.0));
        let mut corrupt = bytes.clone();
        *corrupt.last_mut().unwrap() ^= 1;
        assert!(validate_vorbis(&corrupt).is_err());
        assert!(validate_vorbis(&bytes[..bytes.len() - 1]).is_err());
        let mut chained = bytes.clone();
        chained.extend(&bytes);
        assert!(validate_vorbis(&chained).is_err());
    }
}
