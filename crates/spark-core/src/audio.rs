//! Read-only classic sound playback from preserved maps and exact, pinned
//! sounds.map entries. Vorbis remains original; PCM/ADPCM converts to WAV.
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
    /// Some sounds are split into linked chunks. Indices are local to a pitch range.
    pub next_permutation: Option<usize>,
    pub chain_start: bool,
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
    pub source_sha256:String,
    pub source_sample_sha256:String,
}

struct SoundData {
    report: SoundInspection,
    bytes: Vec<u8>,
    ranges: Vec<(usize, usize)>,
    external:std::collections::BTreeMap<usize,Vec<u8>>,
}

fn sound_data(path: &Path, expected_sha256: &str, tag_id: u32,resources:Option<(&Path,&str)>,audio:Option<&crate::mcc_audio::Binding>) -> Result<SoundData> {
    let (header, bytes, sha256) = maps::read_cache_snapshot(path)?;
    if sha256 != expected_sha256 {
        return invalid("Audio source checksum differs from the preserved project source");
    }
    if ![6, 7, 609,13].contains(&header.version) || header.extended {
        return invalid("Audio preview requires an unextended classic or MCC Halo 1 cache with supported sound metadata");
    }
    if let Some(binding)=audio { binding.validate(header.version)?; }
    let classic_path=audio.filter(|binding|binding.kind=="classic").map(|binding|binding.directory.join("sounds.map"));
    let resources=classic_path.as_ref().zip(audio.and_then(|binding|binding.sha256.get("sounds.map"))).map(|(path,hash)|(path.as_path(),hash.as_str())).or(resources);
    let mut mcc_bank:Option<Result<crate::mcc_audio::Bank>>=None;
    let r = Reader(&bytes);
    let start = header.tag_offset as usize;
    let end = start + header.tag_size as usize;
    let base = match header.version {6=>0x4bf10000,13=>r.u32(start)?.checked_sub(0x28).ok_or_else(||SparkError::Invalid("Invalid MCC sound tag index".into()))?,_=>0x40440000};
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
            external:Default::default(),
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
    let mut external=std::collections::BTreeMap::new();
    let mut resource=resources.map(|(p,h)|crate::resource_map::open_verified_sound(p,h)).transpose();
    let mut inspected_sample_bytes = 0usize;
    for pitch_range in 0..pitch_count {
        let pitch = pitches + pitch_range * 72;
        let pitch_name=r.string(pitch,32)?;
        let count = r.u32(pitch + 60)? as usize;
        if count > 256 {
            return invalid("Sound exceeds 256 permutations per pitch range");
        }
        let permutations = if count == 0 {
            0
        } else {
            pointer(r.u32(pitch + 64)?, count * 124)?
        };
        let actual_count = r.u16(pitch + 44)? as usize;
        if actual_count > count {
            return invalid("Sound's root permutation count exceeds its pitch range");
        }
        for permutation in 0..count {
            let perm = permutations + permutation * 124;
            let codec = r.u16(perm + 40)?;
            let next = r.u16(perm + 42)?;
            let length = r.u32(perm + 64)? as usize;
            let flags = r.u32(perm + 68)?;
            let offset = r.u32(perm + 72)? as usize;
            let mut item = SoundPermutation {
                pitch_range,
                permutation,
                name: r.string(perm, 32)?,
                next_permutation: (next != u16::MAX).then_some(next as usize),
                chain_start: actual_count == 0 || permutation < actual_count,
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
                if flags>1{return invalid("Unsupported sound raw-data flags");}
                if length == 0 || length > MAX_PREVIEW_BYTES {
                    return invalid("Audio preview must be between 1 byte and 16 MiB");
                }
                inspected_sample_bytes += length;
                if inspected_sample_bytes > 64 * 1024 * 1024 {
                    return invalid(
                        "This sound exceeds the 64 MiB aggregate preview inspection budget",
                    );
                }
                if flags==0&&offset < 2048 {
                    return invalid("Audio sample range overlaps the cache header");
                }
                let owned;
                let samples=if flags==1 {
                    if header.version==13&&audio.is_some_and(|binding|binding.kind=="mccClassicAdpcm") {
                        if codec!=1{return invalid("This MCC bank binding supports classic Xbox ADPCM; other bank codecs require a separate decoder");}
                        let bank=mcc_bank.get_or_insert_with(||crate::mcc_audio::Bank::open(audio.unwrap())).as_mut().map_err(|reason|SparkError::Invalid(format!("Pinned MCC sound bank: {reason}")))?;
                        owned=bank.read_sample(&report.tag_path,&pitch_name,pitch_range,&item.name,permutation,length,channels,sample_rate)?;
                    }else{
                    let pair=resource.as_mut().map_err(|_|SparkError::Invalid("Pinned sounds.map could not be verified".into()))?
                        .as_mut().ok_or_else(||SparkError::Invalid("Samples need an external resource: connect the original sounds.map in the project's resources folder".into()))?;
                    owned=crate::resource_map::read_external_sound_from_verified(&mut pair.0,&pair.1,&report.tag_path,pitch_range,permutation,header.version,offset as u64,length)?;
                    }
                    owned.as_slice()
                }else{r.bytes(offset,length)?};
                let duration=if codec==3 {
                    let (actual_channels,actual_rate,duration)=validate_vorbis(samples)?;
                    if actual_channels!=channels||actual_rate!=sample_rate{return invalid("Vorbis identification disagrees with the sound tag's rate or channels");}duration
                }else{crate::audio_pcm::frame_count(samples,codec,channels)? as f64/sample_rate as f64};
                if flags==1{external.insert(ranges.len(),samples.to_vec());}
                Ok((crate::hex_bytes(Sha256::digest(samples)), duration))
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
    if let Ok(Some((file,_)))=&mut resource {crate::resource_map::verify_open_handle_hash(file,resources.unwrap().1)?;}
    if let Some(Ok(bank))=&mut mcc_bank {bank.verify()?;}
    if audio.is_some_and(|binding|binding.kind=="mccClassicAdpcm") {report.warnings.push("Installed MCC classic ADPCM bank/index are hash-pinned; source tag, pitch, permutation, rate, channels and encoded length must match. CELT music/dialogue and native sound functions remain separate.".into());}
    report.warnings.push("Source samples are SHA-256 checked. Shared samples require an exact sounds.map permutation span. Individual sample playback does not apply native sound classes, scripts, acoustic clusters or looping-track transitions. The spatial mixer can follow linked sample segments.".into());
    Ok(SoundData {
        report,
        bytes,
        ranges,
        external,
    })
}

pub fn inspect_sound(path: &Path, expected_sha256: &str, tag_id: u32) -> Result<SoundInspection> {
    inspect_sound_with_resources(path,expected_sha256,tag_id,None)
}
pub fn inspect_sound_with_resources(path:&Path,expected_sha256:&str,tag_id:u32,resources:Option<(&Path,&str)>)->Result<SoundInspection>{
    inspect_sound_with_bindings(path,expected_sha256,tag_id,resources,None)
}
pub fn inspect_sound_with_bindings(path:&Path,expected_sha256:&str,tag_id:u32,resources:Option<(&Path,&str)>,audio:Option<&crate::mcc_audio::Binding>)->Result<SoundInspection>{
    Ok(sound_data(path,expected_sha256,tag_id,resources,audio)?.report)
}
pub fn preview_sound(
    path: &Path,
    expected_sha256: &str,
    tag_id: u32,
    pitch_range: usize,
    permutation: usize,
) -> Result<AudioPreview> {
    preview_sound_with_resources(path,expected_sha256,tag_id,pitch_range,permutation,None)
}
pub fn preview_sound_with_resources(path:&Path,expected_sha256:&str,tag_id:u32,pitch_range:usize,permutation:usize,resources:Option<(&Path,&str)>)->Result<AudioPreview>{
    preview_sound_with_bindings(path,expected_sha256,tag_id,pitch_range,permutation,resources,None)
}
pub fn preview_sound_with_bindings(path:&Path,expected_sha256:&str,tag_id:u32,pitch_range:usize,permutation:usize,resources:Option<(&Path,&str)>,audio:Option<&crate::mcc_audio::Binding>)->Result<AudioPreview>{
    let data = sound_data(path, expected_sha256, tag_id,resources,audio)?;
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
    let samples=if item.embedded {Reader(&data.bytes).bytes(offset,length)?}else{
        data.external.get(&index).ok_or_else(||SparkError::Invalid("Verified external sound data unavailable".into()))?.as_slice()};
    let (mime,bytes)=if item.format=="Ogg Vorbis" {("audio/ogg",samples.to_vec())}else{
        ("audio/wav",crate::audio_pcm::wave(samples,if item.format=="PCM"{0}else{1},item.channels,item.sample_rate)?)};
    Ok(AudioPreview {
        name: item.name.clone(),
        mime: mime.into(),
        sha256:crate::hex_bytes(Sha256::digest(&bytes)),bytes,
        source_sha256:data.report.source_sha256.clone(),source_sample_sha256:item.sha256.clone().unwrap(),
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
pub(crate) fn validate_vorbis(data: &[u8]) -> Result<(u8, u32, f64)> {
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
    fn sound_fixture(external:bool)->Vec<u8>{
        let mut bytes=vec![0u8;0x2000];
        let set=|b:&mut[u8],at:usize,n:u32|b[at..at+4].copy_from_slice(&n.to_le_bytes());
        bytes[..4].copy_from_slice(b"daeh");bytes[0x7fc..0x800].copy_from_slice(b"toof");
        set(&mut bytes,4,7);set(&mut bytes,8,0x2000);set(&mut bytes,16,0x800);set(&mut bytes,20,0x800);
        bytes[0x20..0x26].copy_from_slice(b"sound\0");bytes[0x40..0x4a].copy_from_slice(b"synthetic\0");
        set(&mut bytes,0x800,0x40440080);set(&mut bytes,0x80c,1);set(&mut bytes,0x824,0x74616773);
        bytes[0x880..0x884].copy_from_slice(b"!dns");set(&mut bytes,0x88c,0x1234);
        set(&mut bytes,0x890,0x40440100);set(&mut bytes,0x894,0x40440180);
        bytes[0x900..0x90b].copy_from_slice(b"test\\sound\0");
        set(&mut bytes,0x980+152,1);set(&mut bytes,0x980+156,0x40440300);
        set(&mut bytes,0xb00+60,1);set(&mut bytes,0xb00+64,0x40440380);
        bytes[0xb80..0xb85].copy_from_slice(b"clip\0");bytes[0xb80+40..0xb80+42].copy_from_slice(&1u16.to_le_bytes());
        set(&mut bytes,0xb80+64,36);set(&mut bytes,0xb80+68,u32::from(external));
        set(&mut bytes,0xb80+72,if external{0x300}else{0x1100});
        bytes[0x1100..0x1102].copy_from_slice(&1000i16.to_le_bytes());bytes
    }
    #[test]fn embedded_xbox_sample_converts_without_changing_source(){
        let dir=tempfile::tempdir().unwrap();let path=dir.path().join("source.map");let bytes=sound_fixture(false);std::fs::write(&path,&bytes).unwrap();
        let hash=crate::hex_bytes(Sha256::digest(&bytes));let report=inspect_sound(&path,&hash,0x1234).unwrap();
        assert!(report.permutations[0].available);let preview=preview_sound(&path,&hash,0x1234,0,0).unwrap();
        assert_eq!(preview.mime,"audio/wav");assert_eq!(preview.bytes.len(),172);assert_eq!(preview.source_sha256,hash);
        assert_eq!(&preview.bytes[44..46],&1000i16.to_le_bytes());assert_eq!(std::fs::read(&path).unwrap(),bytes);
        assert!(preview_sound(&path,&"f".repeat(64),0x1234,0,0).is_err());
    }
    #[test]fn linked_permutation_metadata_keeps_roots_and_chunks_distinct(){
        let mut bytes=sound_fixture(false);
        bytes[0xb00+44..0xb00+46].copy_from_slice(&1u16.to_le_bytes());
        bytes[0xb00+60..0xb00+64].copy_from_slice(&2u32.to_le_bytes());
        let second=bytes[0xb80..0xb80+124].to_vec();
        bytes[0xb80+124..0xb80+248].copy_from_slice(&second);
        bytes[0xb80+42..0xb80+44].copy_from_slice(&1u16.to_le_bytes());
        bytes[0xb80+124+42..0xb80+124+44].copy_from_slice(&u16::MAX.to_le_bytes());
        let dir=tempfile::tempdir().unwrap();let path=dir.path().join("linked.map");std::fs::write(&path,&bytes).unwrap();
        let hash=crate::hex_bytes(Sha256::digest(&bytes));let report=inspect_sound(&path,&hash,0x1234).unwrap();
        assert!(report.permutations.iter().all(|p|p.available));
        assert!(report.permutations[0].chain_start);assert_eq!(report.permutations[0].next_permutation,Some(1));
        assert!(!report.permutations[1].chain_start);assert_eq!(report.permutations[1].next_permutation,None);
        assert_eq!(std::fs::read(&path).unwrap(),bytes);
        bytes[0xb00+44..0xb00+46].copy_from_slice(&3u16.to_le_bytes());std::fs::write(&path,&bytes).unwrap();
        let hash=crate::hex_bytes(Sha256::digest(&bytes));assert!(inspect_sound(&path,&hash,0x1234).is_err());
    }
    #[test]fn mcc_audio_uses_the_map_specific_tag_base_and_preserves_verified_samples(){
        let mut bytes=sound_fixture(false);let set=|b:&mut[u8],at:usize,n:u32|b[at..at+4].copy_from_slice(&n.to_le_bytes());let base=0x52000000;
        let entry=bytes[0x880..0x8a0].to_vec();bytes[0x828..0x848].copy_from_slice(&entry);set(&mut bytes,4,13);set(&mut bytes,0x800,base+0x28);set(&mut bytes,0x838,base+0x100);set(&mut bytes,0x83c,base+0x180);set(&mut bytes,0x980+156,base+0x300);set(&mut bytes,0xb00+64,base+0x380);
        let dir=tempfile::tempdir().unwrap();let path=dir.path().join("mcc.map");std::fs::write(&path,&bytes).unwrap();let hash=crate::hex_bytes(Sha256::digest(&bytes));let sound=inspect_sound(&path,&hash,0x1234).unwrap();assert!(sound.permutations[0].available);let clip=preview_sound(&path,&hash,0x1234,0,0).unwrap();assert_eq!(&clip.bytes[44..46],&1000i16.to_le_bytes());assert_eq!(std::fs::read(&path).unwrap(),bytes);
        set(&mut bytes,0x980+156,0x40440300);std::fs::write(&path,&bytes).unwrap();let hash=crate::hex_bytes(Sha256::digest(&bytes));assert!(inspect_sound(&path,&hash,0x1234).is_err());
    }
    #[test]fn shared_samples_require_kind_hash_and_exact_permutation_span(){
        let dir=tempfile::tempdir().unwrap();let path=dir.path().join("source.map");let bytes=sound_fixture(true);std::fs::write(&path,&bytes).unwrap();
        let hash=crate::hex_bytes(Sha256::digest(&bytes));let resource=dir.path().join("sounds.map");let mut raw=vec![0u8;0x400];
        let set=|b:&mut[u8],at:usize,n:u32|b[at..at+4].copy_from_slice(&n.to_le_bytes());
        set(&mut raw,0,2);set(&mut raw,4,0x100);set(&mut raw,8,0x40);set(&mut raw,12,1);set(&mut raw,0x44,36);set(&mut raw,0x48,0x300);
        raw[0x100..0x111].copy_from_slice(b"test\\sound__0__0\0");std::fs::write(&resource,&raw).unwrap();
        let pinned=crate::hex_bytes(Sha256::digest(&raw));assert!(!inspect_sound(&path,&hash,0x1234).unwrap().permutations[0].available);
        let preview=preview_sound_with_resources(&path,&hash,0x1234,0,0,Some((&resource,&pinned))).unwrap();assert_eq!(preview.bytes.len(),172);
        assert!(preview_sound_with_resources(&path,&hash,0x1234,0,0,Some((&resource,&"0".repeat(64)))).is_err());
        raw[0x10e]=b'1';std::fs::write(&resource,&raw).unwrap();let changed=crate::hex_bytes(Sha256::digest(&raw));
        assert!(preview_sound_with_resources(&path,&hash,0x1234,0,0,Some((&resource,&changed))).is_err());
    }
}
