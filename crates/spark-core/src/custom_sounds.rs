//! Managed user audio for editor rehearsal, independently pinned from Halo cache tags.
use crate::{
    invalid,
    library::Library,
    project::{self, Asset, Project},
    Result, SparkError,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, io::Read, path::Path};
const MAX_BYTES: usize = 16 * 1024 * 1024;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SoundInfo {
    pub mime_type: String,
    pub channels: u8,
    pub sample_rate: u32,
    pub duration_seconds: f64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub asset_id: String,
    pub sha256: String,
    pub info: SoundInfo,
    pub base64: String,
}
fn u16_at(bytes: &[u8], offset: usize) -> Result<u16> {
    Ok(u16::from_le_bytes(
        bytes
            .get(offset..offset + 2)
            .ok_or_else(|| SparkError::Invalid("Truncated WAVE field".into()))?
            .try_into()
            .unwrap(),
    ))
}
fn u32_at(bytes: &[u8], offset: usize) -> Result<u32> {
    Ok(u32::from_le_bytes(
        bytes
            .get(offset..offset + 4)
            .ok_or_else(|| SparkError::Invalid("Truncated WAVE field".into()))?
            .try_into()
            .unwrap(),
    ))
}
pub fn inspect(bytes: &[u8], extension: &str) -> Result<SoundInfo> {
    if bytes.len() > MAX_BYTES {
        return invalid("Custom audio exceeds 16 MiB");
    }
    if extension.eq_ignore_ascii_case("ogg") {
        let (channels, sample_rate, duration_seconds) = crate::audio::validate_vorbis(bytes)?;
        if !duration_seconds.is_finite()
            || duration_seconds <= 0.
            || duration_seconds * sample_rate as f64 * channels as f64 * 4. > 32. * 1024. * 1024.
        {
            return invalid("Custom sound exceeds decoded clip limits");
        }
        return Ok(SoundInfo {
            mime_type: "audio/ogg".into(),
            channels,
            sample_rate,
            duration_seconds,
        });
    }
    if extension != "wav"
        || bytes.get(..4) != Some(b"RIFF")
        || bytes.get(8..12) != Some(b"WAVE")
        || u64::from(u32_at(bytes, 4)?) + 8 != bytes.len() as u64
    {
        return invalid("Choose a complete PCM/float WAVE or Vorbis OGG file");
    }
    let (mut cursor, mut chunks, mut format, mut data) = (12usize, 0usize, None, None);
    while cursor < bytes.len() {
        chunks += 1;
        if chunks > 4096 {
            return invalid("Too many WAVE chunks");
        }
        let header = bytes
            .get(cursor..cursor + 8)
            .ok_or_else(|| SparkError::Invalid("Truncated WAVE chunk".into()))?;
        let length = u32_at(header, 4)? as usize;
        let start = cursor
            .checked_add(8)
            .ok_or_else(|| SparkError::Invalid("WAVE range overflow".into()))?;
        let end = start
            .checked_add(length)
            .filter(|end| *end <= bytes.len())
            .ok_or_else(|| SparkError::Invalid("WAVE chunk exceeds file".into()))?;
        match &header[..4] {
            b"fmt " => {
                if format.is_some() || length < 16 {
                    return invalid("Duplicate or truncated WAVE format");
                }
                format = Some(&bytes[start..end]);
            }
            b"data" => {
                if data.is_some() {
                    return invalid("Multiple WAVE data chunks are unsupported");
                }
                data = Some(&bytes[start..end]);
            }
            _ => {}
        }
        cursor = end
            .checked_add(length % 2)
            .filter(|end| *end <= bytes.len())
            .ok_or_else(|| SparkError::Invalid("Missing WAVE chunk padding".into()))?;
    }
    let format = format.ok_or_else(|| SparkError::Invalid("WAVE format is missing".into()))?;
    let data = data.ok_or_else(|| SparkError::Invalid("WAVE samples are missing".into()))?;
    let (codec, channels, sample_rate, rate, alignment, bits) = (
        u16_at(format, 0)?,
        u16_at(format, 2)?,
        u32_at(format, 4)?,
        u32_at(format, 8)?,
        u16_at(format, 12)?,
        u16_at(format, 14)?,
    );
    if !(1..=2).contains(&channels)
        || !(8000..=192000).contains(&sample_rate)
        || !((codec == 1 && [8, 16, 24, 32].contains(&bits)) || (codec == 3 && bits == 32))
        || alignment != channels * (bits / 8)
        || rate != sample_rate * alignment as u32
        || data.is_empty()
        || data.len() % alignment as usize != 0
    {
        return invalid("Unsupported or inconsistent WAVE channel/sample format");
    }
    let frames = data.len() / alignment as usize;
    if frames * channels as usize * 4 > 32 * 1024 * 1024 {
        return invalid("Custom sound exceeds the 32 MiB decoded clip limit");
    }
    if codec == 3
        && data.chunks_exact(4).any(|sample| {
            let value = f32::from_le_bytes(sample.try_into().unwrap());
            !value.is_finite() || value.abs() > 16.
        })
    {
        return invalid("Non-finite or excessive float WAVE samples");
    }
    Ok(SoundInfo {
        mime_type: "audio/wav".into(),
        channels: channels as u8,
        sample_rate,
        duration_seconds: frames as f64 / sample_rate as f64,
    })
}
pub(crate) fn read(path: &Path) -> Result<Vec<u8>> {
    crate::reject_links(path)?;
    let mut bytes = vec![];
    fs::File::open(path)?
        .take(MAX_BYTES as u64 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > MAX_BYTES {
        return invalid("Custom audio exceeds 16 MiB");
    }
    Ok(bytes)
}
pub fn import(lib: &Library, project_id: &str, path: &Path) -> Result<(Project, Asset)> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let bytes = read(path)?;
    inspect(&bytes, &extension)?;
    let mut project = lib.get(project_id)?;
    if project.assets.len() >= 512 {
        return invalid("The project's asset library is full");
    }
    let (id, directory) = (
        uuid::Uuid::new_v4().to_string(),
        lib.project_dir(project_id)?.join("assets"),
    );
    crate::reject_links(&directory)?;
    fs::create_dir_all(&directory)?;
    let stored = directory.join(format!("{id}.{extension}"));
    project::atomic_write(&stored, &bytes, false)?;
    let asset = Asset {
        id,
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .chars()
            .take(120)
            .collect(),
        kind: "custom-sound".into(),
        sha256: format!("{:x}", Sha256::digest(&bytes)),
        path: stored,
        vertices: 0,
        triangles: 0,
        has_uvs: false,
        materials: vec![],
    };
    project.assets.push(asset.clone());
    project.modified_at = chrono::Utc::now().to_rfc3339();
    lib.save(&project, None)?;
    Ok((project, asset))
}
pub fn preview(
    lib: &Library,
    project_id: &str,
    asset_id: &str,
    expected_sha256: &str,
) -> Result<Preview> {
    uuid::Uuid::parse_str(asset_id)
        .map_err(|_| SparkError::Invalid("Invalid custom sound identity".into()))?;
    let project = lib.get(project_id)?;
    let asset = project
        .assets
        .iter()
        .find(|asset| asset.id == asset_id && asset.kind == "custom-sound")
        .ok_or_else(|| SparkError::Invalid("Sound is not registered in this project".into()))?;
    if asset.sha256 != expected_sha256 {
        return invalid("Custom sound identity changed");
    }
    let extension = asset
        .path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if !matches!(extension, "wav" | "ogg") {
        return invalid("Invalid stored custom sound format");
    }
    let file = lib
        .project_dir(project_id)?
        .join("assets")
        .join(format!("{asset_id}.{extension}"));
    crate::reject_links(&asset.path)?;
    if fs::canonicalize(&asset.path)? != fs::canonicalize(&file)? {
        return invalid("Custom sound escaped its managed asset folder");
    }
    let bytes = read(&file)?;
    let sha256 = format!("{:x}", Sha256::digest(&bytes));
    if sha256 != expected_sha256 {
        return invalid("Stored custom sound bytes changed");
    }
    let info = inspect(&bytes, extension)?;
    Ok(Preview {
        asset_id: asset_id.into(),
        sha256,
        info,
        base64: crate::bitmap_preview::base64(&bytes),
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    fn wave() -> Vec<u8> {
        let mut data = b"RIFF".to_vec();
        data.extend_from_slice(&44u32.to_le_bytes());
        data.extend_from_slice(b"WAVEfmt ");
        data.extend_from_slice(&16u32.to_le_bytes());
        data.extend_from_slice(&1u16.to_le_bytes());
        data.extend_from_slice(&1u16.to_le_bytes());
        data.extend_from_slice(&8000u32.to_le_bytes());
        data.extend_from_slice(&16000u32.to_le_bytes());
        data.extend_from_slice(&2u16.to_le_bytes());
        data.extend_from_slice(&16u16.to_le_bytes());
        data.extend_from_slice(b"data");
        data.extend_from_slice(&8u32.to_le_bytes());
        data.extend_from_slice(&[0, 0, 255, 127, 0, 128, 0, 0]);
        data
    }
    #[test]
    fn wave_clock_and_chunk_ranges_are_exact() {
        let bytes = wave();
        let info = inspect(&bytes, "wav").unwrap();
        assert_eq!(info.channels, 1);
        assert_eq!(info.sample_rate, 8000);
        assert_eq!(info.duration_seconds, 4. / 8000.);
        for end in 0..bytes.len() {
            assert!(inspect(&bytes[..end], "wav").is_err());
        }
        let mut bad = bytes.clone();
        bad[40..44].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(inspect(&bad, "wav").is_err());
        let mut bad = bytes.clone();
        bad[32] = 0;
        assert!(inspect(&bad, "wav").is_err());
        assert!(inspect(&bytes, "exe").is_err());
    }
    #[test]
    fn managed_sound_preserves_input_and_refuses_changed_bytes_and_identity() {
        let root = tempfile::tempdir().unwrap();
        let lib = Library::open(&root.path().join("library")).unwrap();
        let project = Project::new("Custom sound");
        lib.save(&project, None).unwrap();
        let source = root.path().join("input.wav");
        let bytes = wave();
        fs::write(&source, &bytes).unwrap();
        let (updated, asset) = import(&lib, &project.id, &source).unwrap();
        assert!(updated.scene.is_empty());
        assert_eq!(
            preview(&lib, &project.id, &asset.id, &asset.sha256)
                .unwrap()
                .info
                .sample_rate,
            8000
        );
        assert!(preview(&lib, &project.id, &asset.id, &"0".repeat(64)).is_err());
        fs::write(&asset.path, b"changed").unwrap();
        assert!(preview(&lib, &project.id, &asset.id, &asset.sha256).is_err());
        assert_eq!(fs::read(source).unwrap(), bytes);
    }
    #[test]
    fn descriptor_reimports_audio_into_new_owned_storage_and_rebinds_its_emitter() {
        let root = tempfile::tempdir().unwrap();
        let lib = Library::open(&root.path().join("first")).unwrap();
        let project = lib.create("Authored sound").unwrap();
        let source = root.path().join("input.wav");
        fs::write(&source, wave()).unwrap();
        let (mut project, asset) = import(&lib, &project.id, &source).unwrap();
        let emitter = serde_json::json!({"id":uuid::Uuid::new_v4().to_string(),"name":"Editor wind","tagId":0,"sourceProjectId":project.id,"sourceSha256":asset.sha256,"customSound":{"assetId":asset.id,"sha256":asset.sha256},"pitchRange":0,"permutation":0,"event":"ambient","bus":"ambience","position":[0,0,0],"gain":1,"pitch":0,"loop":true,"enabled":true,"minDistance":1,"maxDistance":40,"rolloff":1,"priority":50,"cooldownMs":100,"spatial":false});
        project.audio_preview=Some(serde_json::from_value(serde_json::json!({"schemaVersion":1,"master":0.5,"muted":false,"maxVoices":24,"buses":{"ambience":{"gain":1,"muted":false,"solo":false},"music":{"gain":1,"muted":false,"solo":false},"effects":{"gain":1,"muted":false,"solo":false},"dialogue":{"gain":1,"muted":false,"solo":false}},"emitters":[emitter]})).unwrap());
        let descriptor = root.path().join("authored.gsproject");
        project::save_project(&descriptor, &project).unwrap();
        let other = Library::open(&root.path().join("second")).unwrap();
        let imported = other.import_project(&descriptor).unwrap();
        assert_ne!(imported.id, project.id);
        assert_ne!(imported.assets[0].id, asset.id);
        assert_ne!(imported.assets[0].path, asset.path);
        let saved = &imported.audio_preview.unwrap().emitters[0];
        assert_eq!(
            saved.source_project_id.as_deref(),
            Some(imported.id.as_str())
        );
        assert_eq!(
            saved.custom_sound.as_ref().unwrap().asset_id,
            imported.assets[0].id
        );
        assert_eq!(
            preview(&other, &imported.id, &imported.assets[0].id, &asset.sha256)
                .unwrap()
                .info
                .channels,
            1
        );
        assert_eq!(fs::read(source).unwrap(), wave());
    }
    #[test]
    fn float_samples_and_duplicate_format_chunks_are_checked() {
        let mut bytes = wave();
        bytes[20..22].copy_from_slice(&3u16.to_le_bytes());
        bytes[28..32].copy_from_slice(&32000u32.to_le_bytes());
        bytes[32..34].copy_from_slice(&4u16.to_le_bytes());
        bytes[34..36].copy_from_slice(&32u16.to_le_bytes());
        bytes[44..48].copy_from_slice(&0.25f32.to_le_bytes());
        bytes[48..52].copy_from_slice(&(-0.25f32).to_le_bytes());
        assert!(inspect(&bytes, "wav").is_ok());
        for value in [f32::NAN, f32::INFINITY, 17.] {
            let mut bad = bytes.clone();
            bad[44..48].copy_from_slice(&value.to_le_bytes());
            assert!(inspect(&bad, "wav").is_err());
        }
        let format = bytes[12..36].to_vec();
        bytes.extend_from_slice(&format);
        let length = (bytes.len() - 8) as u32;
        bytes[4..8].copy_from_slice(&length.to_le_bytes());
        assert!(inspect(&bytes, "wav").is_err());
    }
}
