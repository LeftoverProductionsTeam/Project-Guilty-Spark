//! Halo-specific native playback hazards, separate from editor mixer settings.
use crate::{binary::Reader, invalid, maps, Result, SparkError};
use serde::Serialize;
use std::{
    collections::{BTreeSet, HashMap},
    path::Path,
};

const MUSIC: u16 = 0x20;
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Audit {
    pub scenery_loops: usize,
    pub background_loops: usize,
    pub checked_sounds: usize,
    pub music_scenery: Vec<String>,
    pub music_backgrounds: Vec<String>,
}
fn normalize(value: &str) -> String {
    value.replace('\\', "/").to_ascii_lowercase()
}
fn reject_conflict(scenery: &[String], backgrounds: &[String]) -> Result<()> {
    if let (Some(scenery), Some(background)) = (scenery.first(), backgrounds.first()) {
        return invalid(format!("Unsafe Halo music-class combination: sound scenery '{scenery}' and BSP background '{background}' both reach music-class sounds. This combination is known to crash Halo/Sapien. Choose an ambient-class loop or explicitly review the authored source classes; Spark has not changed them."));
    }
    Ok(())
}
/// Check all statically placed sound-scenery loop attachments against all used
/// BSP background loops, including alternate, detail and promoted sound refs.
/// This does not claim analysis of arbitrary runtime scripts or dynamic sounds.
pub fn verify(cache: &Path, map: &maps::MapInspection) -> Result<Audit> {
    let mut scenery = BTreeSet::new();
    for object in map.objects.iter().filter(|o| o.kind == "Sound scenery") {
        let tag = object
            .tag_id
            .and_then(|id| map.tags.iter().find(|t| t.id == id && t.class == "ssce"))
            .ok_or_else(|| {
                SparkError::Invalid("Native sound scenery has no exact ssce tag identity".into())
            })?;
        scenery.extend(
            tag.references
                .iter()
                .filter(|r| r.class == "lsnd")
                .map(|r| r.target_id),
        );
    }
    let mut audit = Audit {
        scenery_loops: scenery.len(),
        background_loops: 0,
        checked_sounds: 0,
        music_scenery: vec![],
        music_backgrounds: vec![],
    };
    if scenery.is_empty() {
        return Ok(audit);
    }
    let bsps = crate::bsp_audio::inspect_ambience(cache, &map.sha256)?;
    let mut backgrounds = BTreeSet::new();
    for bsp in &bsps.bsps {
        for cluster in &bsp.clusters {
            if let Some(index) = cluster.background {
                let path = bsp
                    .background_palette
                    .get(index)
                    .and_then(|p| p.tag_path.as_deref())
                    .ok_or_else(|| {
                        SparkError::Invalid(
                            "Used BSP background has no readable native loop identity".into(),
                        )
                    })?;
                let tag = map
                    .tags
                    .iter()
                    .find(|t| t.class == "lsnd" && normalize(&t.path) == normalize(path))
                    .ok_or_else(|| {
                        SparkError::Invalid(
                            "Used BSP background loop is missing from the native cache".into(),
                        )
                    })?;
                backgrounds.insert(tag.id);
            }
        }
    }
    audit.background_loops = backgrounds.len();
    let (header, bytes, hash) = maps::read_cache_snapshot(cache)?;
    if hash != map.sha256 {
        return invalid("Native cache changed before sound-class verification");
    }
    let reader = Reader(&bytes);
    let begin = header.tag_offset as usize;
    let end = begin + header.tag_size as usize;
    let mut classes = HashMap::<u32, u16>::new();
    let mut music = |root: u32| -> Result<bool> {
        let mut todo = vec![root];
        let mut visited = BTreeSet::new();
        let mut found = false;
        while let Some(id) = todo.pop() {
            if !visited.insert(id) {
                continue;
            }
            if visited.len() > 4096 {
                return invalid("Native sound-class dependency graph exceeds its safety bound");
            }
            let tag = map.tags.iter().find(|t| t.id == id).ok_or_else(|| {
                SparkError::Invalid("Native sound-class reference is unresolved".into())
            })?;
            if tag.class == "snd!" {
                let class = if let Some(class) = classes.get(&id) {
                    *class
                } else {
                    let at = tag
                        .data_offset
                        .filter(|at| {
                            !tag.external
                                && *at >= begin
                                && at.checked_add(6).is_some_and(|limit| limit <= end)
                        })
                        .ok_or_else(|| {
                            SparkError::Invalid(format!(
                                "Cannot verify native sound class for {}",
                                tag.path
                            ))
                        })?;
                    let value = reader.u16(at + 4)?;
                    classes.insert(id, value);
                    value
                };
                found |= class == MUSIC;
            }
            todo.extend(
                tag.references
                    .iter()
                    .filter(|r| matches!(r.class.as_str(), "lsnd" | "snd!"))
                    .map(|r| r.target_id),
            );
        }
        Ok(found)
    };
    for id in scenery {
        if music(id)? {
            audit
                .music_scenery
                .push(map.tags.iter().find(|t| t.id == id).unwrap().path.clone());
        }
    }
    for id in backgrounds {
        if music(id)? {
            audit
                .music_backgrounds
                .push(map.tags.iter().find(|t| t.id == id).unwrap().path.clone());
        }
    }
    audit.checked_sounds = classes.len();
    reject_conflict(&audit.music_scenery, &audit.music_backgrounds)?;
    Ok(audit)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_music_hazard_needs_both_playback_routes_and_never_rewrites_classes() {
        let scenery = vec!["sound/music/placed_loop".into()];
        let background = vec!["sound/music/background_loop".into()];
        assert!(reject_conflict(&scenery, &background)
            .unwrap_err()
            .to_string()
            .contains("music-class"));
        assert!(reject_conflict(&scenery, &[]).is_ok());
        assert!(reject_conflict(&[], &background).is_ok());
        assert!(reject_conflict(&[], &[]).is_ok());
        assert_eq!(scenery[0], "sound/music/placed_loop");
        assert_eq!(background[0], "sound/music/background_loop");
    }
}
