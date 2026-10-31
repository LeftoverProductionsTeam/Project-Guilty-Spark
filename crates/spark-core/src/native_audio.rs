//! Opt-in native looping sound scenery. Rehearsal mixer settings are never baked.
use crate::{
    build::Runner,
    invalid, maps,
    project::{self, Project},
    safe_relative, Result, SparkError,
};
use serde::Serialize;
use std::{collections::HashSet, fs, path::Path};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Placement {
    pub emitter_id: String,
    pub source_project_id: String,
    pub source_sha256: String,
    pub looping_tag_id: u32,
    pub loop_path: String,
    pub scenery_path: String,
    pub position: [f32; 3],
}

pub fn requested(project: &Project) -> bool {
    project
        .audio_preview
        .as_ref()
        .is_some_and(|scene| scene.emitters.iter().any(|e| e.native_placement))
}

/// Only native inputs participate in build identity. Muting an editor never removes a native loop.
pub fn fingerprint_inputs(
    project: &Project,
) -> Vec<(
    &str,
    &Option<String>,
    &Option<String>,
    Option<u32>,
    [f32; 3],
)> {
    let mut rows: Vec<_> = project
        .audio_preview
        .iter()
        .flat_map(|s| &s.emitters)
        .filter(|e| e.native_placement)
        .map(|e| {
            (
                e.id.as_str(),
                &e.source_project_id,
                &e.source_sha256,
                e.looping_source.as_ref().map(|s| s.tag_id),
                e.position,
            )
        })
        .collect();
    rows.sort_by(|a, b| a.0.cmp(b.0));
    rows
}

pub fn plan(project: &Project) -> Result<Vec<Placement>> {
    if !requested(project) {
        return Ok(vec![]);
    }
    let scene = project.audio_preview.as_ref().unwrap();
    scene.validate()?;
    let doc = project.quick_forge.as_ref().ok_or_else(|| SparkError::Invalid(
        "Native sound emitters currently require an editable QuickForge map; source-map and direct cache edits cannot add them".into()))?;
    if doc.runtime_id != crate::runtime::RuntimeId::MccSteam || doc.native.is_some() {
        return invalid("Native looping sound placement currently requires a local MCC QuickForge project, outside a SparkLink native revision");
    }
    let project_id = uuid::Uuid::parse_str(&project.id)
        .map_err(|_| SparkError::Invalid("Invalid native sound project identity".into()))?
        .simple();
    let mut placements = vec![];
    let mut locations = HashSet::new();
    let mut outputs = HashSet::new();
    for e in scene.emitters.iter().filter(|e| e.native_placement) {
        let source = e.looping_source.as_ref().unwrap();
        let binding = project.native_asset_imports.iter().find(|b|
            Some(&b.source_project_id) == e.source_project_id.as_ref() && Some(&b.source_sha256) == e.source_sha256.as_ref()
            && b.tag_id == source.tag_id && b.tag_class == "lsnd")
            .ok_or_else(|| SparkError::Invalid(format!("Native sound '{}' needs its verified recursive looping-tag import; include the original loop again", e.name)))?;
        crate::native_asset_imports::validate(std::slice::from_ref(binding))?;
        // A dropped lsnd can expose several rehearsal tracks, but the native tag plays the whole loop once.
        let location = (
            binding.id.as_str(),
            e.position.map(|v| if v == 0. { 0 } else { v.to_bits() }),
        );
        if !locations.insert(location) {
            return invalid("Two native emitters use the same looping tag at the same location. Include one track only: Halo plays the original complete loop");
        }
        let id = uuid::Uuid::parse_str(&e.id)
            .map_err(|_| SparkError::Invalid("Invalid native sound emitter identity".into()))?
            .simple();
        let scenery_path = format!("spark/audio/{project_id}/{id}.sound_scenery");
        if !outputs.insert(scenery_path.clone()) {
            return invalid("Native sound emitter identities resolve to the same tag path");
        }
        placements.push(Placement {
            emitter_id: e.id.clone(),
            source_project_id: binding.source_project_id.clone(),
            source_sha256: binding.source_sha256.clone(),
            looping_tag_id: source.tag_id,
            loop_path: format!("{}.sound_looping", binding.native_path.replace('\\', "/")),
            scenery_path,
            position: e.position,
        });
    }
    placements.sort_by(|a, b| a.emitter_id.cmp(&b.emitter_id));
    Ok(placements)
}

fn run(
    edit: &Path,
    runner: &Runner,
    workspace: &Path,
    tags: &Path,
    tag: &str,
    args: Vec<String>,
) -> Result<String> {
    let mut all = vec!["-t".into(), tags.to_string_lossy().into_owned()];
    all.extend(args);
    all.push(tag.into());
    #[cfg(windows)]
    for arg in &mut all {
        *arg = arg.replace('/', "\\");
    }
    let out = runner.run(edit, &all, workspace, "native-audio", 78)?;
    if out.lines().any(|line| {
        let line = line.to_ascii_lowercase();
        line.contains("failed to") || line.starts_with("error:")
    }) {
        return invalid(
            "Invader rejected a native sound operation; inspect the isolated build log",
        );
    }
    Ok(out.trim().to_owned())
}
fn get(
    edit: &Path,
    runner: &Runner,
    workspace: &Path,
    tags: &Path,
    tag: &str,
    key: &str,
) -> Result<String> {
    run(
        edit,
        runner,
        workspace,
        tags,
        tag,
        vec!["-G".into(), key.into()],
    )
}
fn count(
    edit: &Path,
    runner: &Runner,
    workspace: &Path,
    tags: &Path,
    tag: &str,
    key: &str,
) -> Result<usize> {
    run(
        edit,
        runner,
        workspace,
        tags,
        tag,
        vec!["-C".into(), key.into()],
    )?
    .parse()
    .map_err(|_| SparkError::Invalid("Native sound array count did not read back".into()))
}
fn same_path(a: &str, b: &str) -> bool {
    a.replace('\\', "/")
        .eq_ignore_ascii_case(&b.replace('\\', "/"))
}
fn vector(v: [f32; 3]) -> String {
    format!("{:.8},{:.8},{:.8}", v[0], v[1], v[2])
}
fn check_file(tags: &Path, relative: &str) -> Result<()> {
    let path = tags.join(safe_relative(relative)?);
    crate::reject_links(&path)?;
    if !path.is_file() || fs::metadata(path)?.len() < 64 {
        return invalid(format!(
            "Native sound dependency is missing or truncated: {relative}"
        ));
    }
    Ok(())
}
pub(crate) fn prepare(
    project: &Project,
    scenario: &str,
    workspace: &Path,
    tags: &Path,
    edit: &Path,
    runner: &Runner,
) -> Result<()> {
    let placements = plan(project)?;
    if placements.is_empty() {
        return Ok(());
    }
    let scenario_tag = format!("{scenario}.scenario");
    check_file(tags, &scenario_tag)?;
    let first_palette = count(
        edit,
        runner,
        workspace,
        tags,
        &scenario_tag,
        "sound_scenery_palette",
    )?;
    let first_object = count(
        edit,
        runner,
        workspace,
        tags,
        &scenario_tag,
        "sound_scenery",
    )?;
    if first_palette + placements.len() > 256 || first_object + placements.len() > 256 {
        return invalid("Native sound scenery would exceed Halo's scenario limit");
    }
    for p in &placements {
        check_file(tags, &p.loop_path)?;
        let path = tags.join(safe_relative(&p.scenery_path)?);
        crate::reject_links(&path)?;
        if path.exists() {
            return invalid(
                "Generated native sound namespace already exists; start a fresh isolated build",
            );
        }
    }
    for (i, p) in placements.iter().enumerate() {
        let path = tags.join(safe_relative(&p.scenery_path)?);
        fs::create_dir_all(path.parent().unwrap())?;
        let source_hash = maps::hash_file(&tags.join(safe_relative(&p.loop_path)?))?;
        run(
            edit,
            runner,
            workspace,
            tags,
            &p.scenery_path,
            vec![
                "-N".into(),
                "-S".into(),
                "bounding_radius".into(),
                "1".into(),
                "-I".into(),
                "attachments".into(),
                "1".into(),
                "end".into(),
                "-S".into(),
                "attachments[0].type".into(),
                p.loop_path.clone(),
            ],
        )?;
        check_file(tags, &p.scenery_path)?;
        if count(
            edit,
            runner,
            workspace,
            tags,
            &p.scenery_path,
            "attachments",
        )? != 1
            || !same_path(
                &get(
                    edit,
                    runner,
                    workspace,
                    tags,
                    &p.scenery_path,
                    "attachments[0].type",
                )?,
                &p.loop_path,
            )
            || maps::hash_file(&tags.join(safe_relative(&p.loop_path)?))? != source_hash
        {
            return invalid(
                "Native looping attachment failed readback or changed its imported source",
            );
        }
        let palette = first_palette + i;
        let object = first_object + i;
        run(
            edit,
            runner,
            workspace,
            tags,
            &scenario_tag,
            vec![
                "-I".into(),
                "sound_scenery_palette".into(),
                "1".into(),
                "end".into(),
                "-S".into(),
                format!("sound_scenery_palette[{palette}].name"),
                p.scenery_path.clone(),
                "-I".into(),
                "sound_scenery".into(),
                "1".into(),
                "end".into(),
                "-S".into(),
                format!("sound_scenery[{object}].type"),
                palette.to_string(),
                "-S".into(),
                format!("sound_scenery[{object}].name"),
                "-1".into(),
                "-S".into(),
                format!("sound_scenery[{object}].position"),
                vector(p.position),
                "-S".into(),
                format!("sound_scenery[{object}].rotation"),
                "0,0,0".into(),
            ],
        )?;
        if !same_path(
            &get(
                edit,
                runner,
                workspace,
                tags,
                &scenario_tag,
                &format!("sound_scenery_palette[{palette}].name"),
            )?,
            &p.scenery_path,
        ) || get(
            edit,
            runner,
            workspace,
            tags,
            &scenario_tag,
            &format!("sound_scenery[{object}].type"),
        )? != palette.to_string()
        {
            return invalid("Native sound palette or placement failed readback");
        }
    }
    if count(
        edit,
        runner,
        workspace,
        tags,
        &scenario_tag,
        "sound_scenery",
    )? != first_object + placements.len()
    {
        return invalid("Native sound scenery count did not read back");
    }
    project::atomic_write(
        &workspace.join("native-audio.json"),
        &serde_json::to_vec_pretty(&placements)?,
        false,
    )?;
    Ok(())
}

/// Verify the native cache, not merely invader-edit's exit code or the editor mix.
pub(crate) fn verify_compiled(
    project: &Project,
    inspected: &maps::MapInspection,
    cache: &Path,
) -> Result<()> {
    let mut checked_sounds = HashSet::new();
    for p in plan(project)? {
        let tag = inspected
            .tags
            .iter()
            .find(|t| {
                t.class == "ssce"
                    && same_path(&format!("{}.sound_scenery", t.path), &p.scenery_path)
            })
            .ok_or_else(|| {
                SparkError::Invalid("Compiled map omitted a native sound scenery tag".into())
            })?;
        let loop_tag = inspected
            .tags
            .iter()
            .find(|t| {
                t.class == "lsnd" && same_path(&format!("{}.sound_looping", t.path), &p.loop_path)
            })
            .ok_or_else(|| {
                SparkError::Invalid(
                    "Compiled map omitted an imported original looping sound".into(),
                )
            })?;
        if !tag
            .references
            .iter()
            .any(|r| r.class == "lsnd" && r.target_id == loop_tag.id)
        {
            return invalid("Compiled sound scenery does not attach the expected original loop");
        }
        let mut todo = vec![loop_tag.id];
        let mut seen = HashSet::new();
        let mut sound_count = 0;
        while let Some(id) = todo.pop() {
            if !seen.insert(id) {
                continue;
            }
            if seen.len() > 64 {
                return invalid("Compiled native sound closure exceeds its dependency budget");
            }
            let dependency = inspected.tags.iter().find(|t| t.id == id).ok_or_else(|| {
                SparkError::Invalid("Compiled sound dependency is missing".into())
            })?;
            if !matches!(dependency.class.as_str(), "lsnd" | "snd!") {
                return invalid(
                    "Compiled native sound closure has an unsupported dependency class",
                );
            }
            if dependency.class == "snd!" {
                sound_count += 1;
                if checked_sounds.insert(id) {
                    let sound = crate::audio::inspect_sound(cache, &inspected.sha256, id)?;
                    if sound.permutations.is_empty()
                        || sound
                            .permutations
                            .iter()
                            .any(|sample| !sample.available || !sample.embedded)
                    {
                        return invalid(format!("Compiled native sound has missing, external or invalid original samples: {}",dependency.path));
                    }
                }
            }
            todo.extend(dependency.references.iter().map(|r| r.target_id));
        }
        if sound_count == 0 {
            return invalid("Compiled native emitter has no actual sound sample dependencies");
        }
        let objects: Vec<_> = inspected
            .objects
            .iter()
            .filter(|o| o.kind == "Sound scenery" && o.tag_id == Some(tag.id))
            .collect();
        if objects.len() != 1
            || objects[0]
                .position
                .iter()
                .zip(p.position)
                .any(|(a, b)| (a - b).abs() > 0.0001)
        {
            return invalid("Compiled native sound placement is missing, duplicated or moved");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Project {
        let mut p = Project::new("Native audio contract");
        p.quick_forge =
            Some(crate::quickforge::create_arena("Native audio contract", "emptyArena").unwrap());
        p.quick_forge.as_mut().unwrap().runtime_id = crate::runtime::RuntimeId::MccSteam;
        let id = uuid::Uuid::new_v4().to_string();
        let source = uuid::Uuid::new_v4().to_string();
        p.native_asset_imports
            .push(crate::native_asset_imports::Binding {
                native_path: format!("gs_assets_{}/sound/ambient/wind", id.replace('-', "")),
                id,
                source_project_id: source.clone(),
                source_sha256: "a".repeat(64),
                tag_id: 123,
                tag_class: "lsnd".into(),
                tag_path: "sound/ambient/wind".into(),
                receipt_sha256: "b".repeat(64),
                file_count: 3,
            });
        p.audio_preview=Some(serde_json::from_value(serde_json::json!({
            "schemaVersion":1,"master":0.5,"muted":false,"maxVoices":24,
            "buses":{"ambience":{"gain":1,"muted":false,"solo":false},"music":{"gain":1,"muted":false,"solo":false},"effects":{"gain":1,"muted":false,"solo":false},"dialogue":{"gain":1,"muted":false,"solo":false}},
            "emitters":[{"id":uuid::Uuid::new_v4().to_string(),"name":"Wind","tagId":124,"sourceProjectId":source,"sourceSha256":"a".repeat(64),
                "pitchRange":0,"permutation":0,"event":"ambient","bus":"ambience","position":[0,0,1],"gain":1,"pitch":0,"loop":true,"enabled":true,"minDistance":1,"maxDistance":40,"rolloff":1,"priority":50,"cooldownMs":100,"spatial":true,
                "loopingSource":{"tagId":123,"track":0},"nativePlacement":true}]
        })).unwrap());
        p
    }
    #[test]
    fn old_rehearsal_does_not_change_fingerprints_or_serialized_shape_but_native_positions_do() {
        let mut p = fixture();
        p.audio_preview.as_mut().unwrap().emitters[0].native_placement = false;
        let baseline = p.fingerprint().unwrap();
        assert!(!serde_json::to_string(&p)
            .unwrap()
            .contains("nativePlacement"));
        let mut no_rehearsal = p.clone();
        no_rehearsal.audio_preview = None;
        assert_eq!(baseline, no_rehearsal.fingerprint().unwrap());
        p.audio_preview.as_mut().unwrap().emitters[0].native_placement = true;
        let included = p.fingerprint().unwrap();
        assert_ne!(baseline, included);
        let audio = p.audio_preview.as_mut().unwrap();
        audio.muted = true;
        audio.master = 0.;
        audio.emitters[0].enabled = false;
        audio.emitters[0].gain = 0.;
        audio.emitters[0].pitch = 3.;
        assert_eq!(p.fingerprint().unwrap(), included);
        assert_eq!(plan(&p).unwrap().len(), 1);
        p.audio_preview.as_mut().unwrap().emitters[0].position[0] = 2.;
        assert_ne!(p.fingerprint().unwrap(), included);
        let roundtrip: Project = serde_json::from_slice(&serde_json::to_vec(&p).unwrap()).unwrap();
        assert_eq!(roundtrip.fingerprint().unwrap(), p.fingerprint().unwrap());
    }
    #[test]
    fn incomplete_wrong_hash_or_unverified_loops_and_unsupported_routes_are_refused() {
        let p = fixture();
        assert_eq!(plan(&p).unwrap().len(), 1);
        let mut bad = p.clone();
        bad.native_asset_imports.clear();
        assert!(plan(&bad).is_err());
        let mut bad = p.clone();
        bad.native_asset_imports[0].source_sha256 = "c".repeat(64);
        assert!(plan(&bad).is_err());
        let mut bad = p.clone();
        bad.native_asset_imports[0].tag_class = "snd!".into();
        assert!(plan(&bad).is_err());
        let mut bad = p.clone();
        bad.audio_preview.as_mut().unwrap().emitters[0].looping_source = None;
        assert!(plan(&bad).is_err());
        let mut bad = p.clone();
        bad.quick_forge = None;
        assert!(plan(&bad).is_err());
        let mut bad = p.clone();
        bad.quick_forge.as_mut().unwrap().runtime_id = crate::runtime::RuntimeId::HaloCustomEdition;
        assert!(plan(&bad).is_err());
        let mut bad = p.clone();
        bad.quick_forge.as_mut().unwrap().native=Some(serde_json::from_value(serde_json::json!({
            "source":{"inventorySha256":"a".repeat(64),"fieldTag":"weapons/pistol/pistol.weapon","fieldTagSha256":"a".repeat(64),"boundingRadius":0.1,
                "templateTag":"scenery/rock.scenery","templateSha256":"b".repeat(64),"dependencies":{},"previewSha256":"c".repeat(64),"previewTagId":1,"previewTagPath":"scenery/rock"},
            "fields":[],"assets":[]
        })).unwrap());
        assert!(plan(&bad).unwrap_err().to_string().contains("SparkLink"));
        let mut bad = p.clone();
        bad.audio_preview.as_mut().unwrap().emitters[0].position[2] = f32::NAN;
        assert!(plan(&bad).is_err());
        let mut bad = p.clone();
        bad.native_asset_imports[0].native_path = "../outside".into();
        assert!(plan(&bad).is_err());
    }
    #[test]
    fn multitrack_loop_is_not_compiled_twice_at_the_same_position() {
        let mut p = fixture();
        let mut second = p.audio_preview.as_ref().unwrap().emitters[0].clone();
        second.id = uuid::Uuid::new_v4().to_string();
        second.position[0] = -0.;
        second.looping_source.as_mut().unwrap().track = 1;
        p.audio_preview.as_mut().unwrap().emitters.push(second);
        assert!(plan(&p).unwrap_err().to_string().contains("complete"));
        p.audio_preview.as_mut().unwrap().emitters[1].position[0] = 5.;
        let positions = plan(&p).unwrap();
        assert_eq!(positions.len(), 2);
        assert_ne!(positions[0].scenery_path, positions[1].scenery_path);
        p.audio_preview.as_mut().unwrap().emitters[0].id =
            "abcdefab-cdef-4abc-8def-abcdefabcdef".into();
        p.audio_preview.as_mut().unwrap().emitters[1].id =
            "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF".into();
        assert!(plan(&p).unwrap_err().to_string().contains("same tag path"));
    }
}
