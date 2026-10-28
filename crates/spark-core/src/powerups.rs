//! Custom Halo 1 equipment and multiplayer pickup authoring. All generated tags
//! are created in an isolated build job; installed/source tags stay read-only.
use crate::{
    build::Runner,
    invalid, maps,
    project::{self, Project},
    safe_relative, Result, SparkError,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, path::Path};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Powerup {
    pub id: String,
    pub name: String,
    pub effect: Effect,
    pub duration_seconds: f32,
    pub respawn_seconds: u16,
    pub position: [f32; 3],
    pub facing_degrees: f32,
    pub levitate: bool,
    pub model_tag: Option<String>,
    pub pickup_sound: Option<String>,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Effect {
    Camouflage,
    Overshield,
    Health,
    FragGrenade,
    PlasmaGrenade,
    DoubleSpeed,
}
impl Effect {
    fn template(self) -> &'static str {
        match self {
            Self::Camouflage => "powerups/active camouflage.equipment",
            Self::Overshield => "powerups/over shield.equipment",
            Self::Health => "powerups/health pack.equipment",
            Self::FragGrenade => "weapons/frag grenade/frag grenade.equipment",
            Self::PlasmaGrenade => "weapons/plasma grenade/plasma grenade.equipment",
            Self::DoubleSpeed => "powerups/double speed.equipment",
        }
    }
    fn native(self) -> &'static str {
        match self {
            Self::Camouflage => "active_camouflage",
            Self::Overshield => "over_shield",
            Self::Health => "health",
            Self::FragGrenade | Self::PlasmaGrenade => "grenade",
            Self::DoubleSpeed => "double_speed",
        }
    }
}
fn dependency(value: &str, extensions: &[&str]) -> Result<()> {
    if value.len() > 240
        || !extensions
            .iter()
            .any(|ext| value.to_ascii_lowercase().ends_with(ext))
    {
        return invalid(
            "Power-up dependency needs a relative model or sound tag filename with its extension",
        );
    }
    safe_relative(value)?;
    Ok(())
}
pub fn validate(powerups: &[Powerup]) -> Result<()> {
    if powerups.len() > 64 {
        return invalid("A map supports at most 64 custom power-up pickups");
    }
    let mut ids = HashSet::new();
    for p in powerups {
        uuid::Uuid::parse_str(&p.id)
            .map_err(|_| SparkError::Invalid("Invalid custom power-up identity".into()))?;
        if !ids.insert(&p.id)
            || p.name.trim().is_empty()
            || p.name.len() > 80
            || p.name.chars().any(char::is_control)
            || !p.duration_seconds.is_finite()
            || !(1.0..=600.0).contains(&p.duration_seconds)
            || !(1..=3600).contains(&p.respawn_seconds)
            || p.position.iter().any(|n| !n.is_finite() || n.abs() > 4096.)
            || !p.facing_degrees.is_finite()
            || p.facing_degrees.abs() > 360.
        {
            return invalid("Invalid custom power-up: use a name, finite map position, duration 1–600 seconds and respawn 1–3600 seconds");
        }
        if let Some(tag) = &p.model_tag {
            dependency(tag, &[".gbxmodel", ".model"])?;
        }
        if let Some(tag) = &p.pickup_sound {
            dependency(tag, &[".sound"])?;
        }
    }
    Ok(())
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
    // A canonical Windows root may use the verbatim prefix. Invader's output
    // path join retains separators, so forward slashes must be normalized.
    #[cfg(windows)]
    for argument in &mut all {
        *argument = argument.replace('/', "\\");
    }
    runner.run(edit, &all, workspace, "powerups", 76)
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
    .map(|v| v.trim().to_owned())
}
fn vec(v: [f32; 3]) -> String {
    format!("{:.8},{:.8},{:.8}", v[0], v[1], v[2])
}
fn check_tag(tags: &Path, path: &str) -> Result<()> {
    let file = tags.join(safe_relative(path)?);
    crate::reject_links(&file)?;
    if !file.is_file() || fs::metadata(&file)?.len() < 64 {
        return invalid(format!(
            "Custom power-up dependency is missing or incomplete: {path}"
        ));
    }
    Ok(())
}
/// Generate fresh equipment + item-collection tags and append pickups. The
/// caller owns this isolated staged tagset and recompiles the resulting map.
pub(crate) fn prepare(
    project: &Project,
    scenario: &str,
    workspace: &Path,
    tags: &Path,
    edit: &Path,
    runner: &Runner,
) -> Result<()> {
    if project.powerups.is_empty() {
        return Ok(());
    }
    validate(&project.powerups)?;
    safe_relative(scenario)?;
    let scenario_tag = format!("{scenario}.scenario");
    check_tag(tags, &scenario_tag)?;
    if get(edit, runner, workspace, tags, &scenario_tag, "type")? != "multiplayer" {
        return invalid("Custom power-up pickups currently require a Halo 1 multiplayer scenario");
    }
    let count = run(
        edit,
        runner,
        workspace,
        tags,
        &scenario_tag,
        vec!["-C".into(), "netgame_equipment".into()],
    )?
    .trim()
    .parse::<usize>()
    .map_err(|_| SparkError::Invalid("Power-up spawn count could not be read".into()))?;
    if count + project.powerups.len() > 200 {
        return invalid("Custom power-ups would exceed 200 multiplayer pickups in this scenario");
    }
    // Check every dependency before generating any tag or changing the scenario.
    for p in &project.powerups {
        check_tag(tags, p.effect.template())?;
        if let Some(tag) = &p.model_tag {
            check_tag(tags, tag)?;
        }
        if let Some(tag) = &p.pickup_sound {
            check_tag(tags, tag)?;
        }
    }
    let job = uuid::Uuid::parse_str(runner.id)
        .map_err(|_| SparkError::Invalid("Invalid isolated power-up build identity".into()))?
        .simple()
        .to_string();
    let mut receipts = vec![];
    for (i, p) in project.powerups.iter().enumerate() {
        let id = uuid::Uuid::parse_str(&p.id).unwrap().simple().to_string();
        let stem = format!("spark/powerups/{job}/{id}");
        let equipment = format!("{stem}.equipment");
        let collection = format!("{stem}.item_collection");
        for output in [&equipment, &collection] {
            let path = tags.join(safe_relative(output)?);
            crate::reject_links(&path)?;
            if path.exists() {
                return invalid("Generated power-up path already exists; start a fresh build job");
            }
            fs::create_dir_all(path.parent().unwrap())?;
        }
        let template = p.effect.template();
        let original = maps::hash_file(&tags.join(template))?;
        let mut args = vec![
            "-O".into(),
            equipment.clone(),
            "-S".into(),
            "powerup_type".into(),
            p.effect.native().into(),
            "-S".into(),
            "powerup_time".into(),
            format!("{:.6}", p.duration_seconds),
        ];
        if let Some(model) = &p.model_tag {
            args.extend(["-S".into(), "model".into(), model.clone()]);
        }
        if let Some(sound) = &p.pickup_sound {
            args.extend(["-S".into(), "pickup_sound".into(), sound.clone()]);
        }
        run(edit, runner, workspace, tags, template, args)?;
        check_tag(tags, &equipment)?;
        if maps::hash_file(&tags.join(template))? != original {
            return invalid("Power-up template changed during tag generation");
        }
        let duration = get(edit, runner, workspace, tags, &equipment, "powerup_time")?
            .parse::<f32>()
            .map_err(|_| SparkError::Invalid("Power-up duration did not read back".into()))?;
        if (duration - p.duration_seconds).abs() > 0.0001
            || get(edit, runner, workspace, tags, &equipment, "powerup_type")? != p.effect.native()
        {
            return invalid("Custom power-up effect or duration did not read back");
        }
        for (key,expected) in [("model",p.model_tag.as_ref()),("pickup_sound",p.pickup_sound.as_ref())]{if let Some(expected)=expected{if get(edit,runner,workspace,tags,&equipment,key)?.replace('\\',"/")!=expected.replace('\\',"/"){return invalid("Custom power-up model or pickup sound did not read back");}}}
        let args = vec![
            "-N".into(),
            "-I".into(),
            "permutations".into(),
            "1".into(),
            "end".into(),
            "-S".into(),
            "permutations[0].weight".into(),
            "1".into(),
            "-S".into(),
            "permutations[0].item".into(),
            equipment.clone(),
            "-S".into(),
            "default_spawn_time".into(),
            p.respawn_seconds.to_string(),
        ];
        run(edit, runner, workspace, tags, &collection, args)?;
        check_tag(tags, &collection)?;
        if get(
            edit,
            runner,
            workspace,
            tags,
            &collection,
            "permutations[0].item",
        )?
        .replace('\\', "/")
            != equipment
        {
            return invalid("Power-up item collection did not retain its equipment dependency");
        }
        let prefix = format!("netgame_equipment[{}]", count + i);
        let mut args = vec![
            "-I".into(),
            "netgame_equipment".into(),
            "1".into(),
            "end".into(),
        ];
        for (key, value) in [
            ("type_0", "all_games".into()),
            ("type_1", "none".into()),
            ("type_2", "none".into()),
            ("type_3", "none".into()),
            ("team_index", "-1".into()),
            ("spawn_time", p.respawn_seconds.to_string()),
            ("position", vec(p.position)),
            ("facing", format!("{:.8}", p.facing_degrees.to_radians())),
            ("item_collection", collection.clone()),
            ("flags.levitate", if p.levitate { "1" } else { "0" }.into()),
        ] {
            args.extend(["-S".into(), format!("{prefix}.{key}"), value]);
        }
        run(edit, runner, workspace, tags, &scenario_tag, args)?;
        if get(
            edit,
            runner,
            workspace,
            tags,
            &scenario_tag,
            &format!("{prefix}.item_collection"),
        )?
        .replace('\\', "/")
            != collection
        {
            return invalid("Scenario did not retain the custom power-up pickup");
        }
        receipts.push(serde_json::json!({"recipe":p,"equipment":equipment,"equipmentSha256":maps::hash_file(&tags.join(&equipment))?,"collection":collection,"collectionSha256":maps::hash_file(&tags.join(&collection))?,"scenarioIndex":count+i}));
    }
    project::atomic_write(
        &workspace.join("custom-powerups.json"),
        &serde_json::to_vec_pretty(
            &serde_json::json!({"schemaVersion":1,"sourceFilesUnchanged":true,"pickups":receipts,"runtimePickupAcceptance":"pending"}),
        )?,
        false,
    )?;
    runner.emit(
        "powerups",
        &format!(
            "{} custom equipment definitions and multiplayer pickups generated and read back",
            project.powerups.len()
        ),
        77,
        "info",
    );
    Ok(())
}
pub(crate) fn verify_compiled(
    project: &Project,
    inspection: &maps::MapInspection,
    workspace: &Path,
) -> Result<()> {
    if project.powerups.is_empty() {
        return Ok(());
    }
    let manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(workspace.join("custom-powerups.json"))?)?;
    let records = manifest["pickups"]
        .as_array()
        .ok_or_else(|| SparkError::Invalid("Custom power-up build receipt is missing".into()))?;
    if records.len() != project.powerups.len() {
        return invalid("Custom power-up receipt count changed");
    }
    for record in records {
        let recipe: Powerup = serde_json::from_value(record["recipe"].clone())?;
        for (key, class) in [("equipment", "eqip"), ("collection", "itmc")] {
            let path = record[key]
                .as_str()
                .and_then(|p| p.rsplit_once('.').map(|p| p.0))
                .ok_or_else(|| {
                    SparkError::Invalid("Custom power-up tag receipt is malformed".into())
                })?;
            let tag = inspection
                .tags
                .iter()
                .find(|t| t.class == class && t.path.replace('\\', "/") == path)
                .ok_or_else(|| {
                    SparkError::Invalid(format!(
                        "Compiled cache lost custom power-up {class} tag: {}",
                        recipe.name
                    ))
                })?;
            if class == "itmc"
                && !inspection.objects.iter().any(|o| {
                    o.tag_id == Some(tag.id)
                        && o.position
                            .iter()
                            .zip(recipe.position)
                            .all(|(a, b)| (a - b).abs() < 0.001)
                })
            {
                return invalid(format!(
                    "Compiled cache lost custom power-up placement: {}",
                    recipe.name
                ));
            }
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn recipe() -> Powerup {
        Powerup {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Long camouflage".into(),
            effect: Effect::Camouflage,
            duration_seconds: 90.,
            respawn_seconds: 120,
            position: [1., 2., 3.],
            facing_degrees: 0.,
            levitate: true,
            model_tag: None,
            pickup_sound: None,
        }
    }
    #[test]
    fn recipes_reject_duplicate_identity_nonfinite_values_and_path_escape() {
        let mut p = recipe();
        assert!(validate(&[p.clone()]).is_ok());
        assert!(validate(&[p.clone(), p.clone()]).is_err());
        p.position[1] = f32::NAN;
        assert!(validate(&[p.clone()]).is_err());
        p = recipe();
        p.model_tag = Some("../other/model.gbxmodel".into());
        assert!(validate(&[p]).is_err());
    }
    #[test]
    fn powerup_inputs_invalidate_build_receipts_and_survive_project_roundtrip() {
        let mut p = Project::new("Power-up fixture");
        let baseline = p.fingerprint().unwrap();
        p.powerups.push(recipe());
        let authored = p.fingerprint().unwrap();
        assert_ne!(baseline, authored);
        p.powerups[0].duration_seconds = 120.;
        assert_ne!(authored, p.fingerprint().unwrap());
        let roundtrip: Project = serde_json::from_slice(&serde_json::to_vec(&p).unwrap()).unwrap();
        roundtrip.validate().unwrap();
        assert_eq!(roundtrip.powerups, p.powerups);
        assert_eq!(roundtrip.fingerprint().unwrap(), p.fingerprint().unwrap());
    }
    /// Optional real toolchain acceptance. Owned SDK assets remain local; no
    /// copyrighted fixtures are required or distributed by the normal suite.
    #[test]
    #[ignore = "requires SPARK_POWERUP_TAGS, SPARK_POWERUP_KIT and SPARK_POWERUP_INVADER"]
    fn owned_mcc_powerup_cache_compiles_and_contains_every_custom_pickup() {
        use std::sync::atomic::AtomicBool;
        let source = std::path::PathBuf::from(
            std::env::var_os("SPARK_POWERUP_TAGS").expect("owned editable SDK tags"),
        );
        let kit = std::path::PathBuf::from(
            std::env::var_os("SPARK_POWERUP_KIT").expect("MCC H1A editing kit"),
        );
        let invader = std::path::PathBuf::from(
            std::env::var_os("SPARK_POWERUP_INVADER").expect("Invader tools"),
        );
        let id = uuid::Uuid::new_v4().to_string();
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .unwrap()
            .join(".local/continuation33/native-gameplay");
        let reuse = std::env::var_os("SPARK_POWERUP_WORKSPACE").map(std::path::PathBuf::from);
        let workspace = if let Some(path) = reuse {
            let path = path.canonicalize().unwrap();
            assert_eq!(path.parent().unwrap(), root.canonicalize().unwrap());
            assert!(path
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("powerup-native-"));
            path
        } else {
            let path = root.join(format!("powerup-native-{id}"));
            fs::create_dir(&path).unwrap();
            path
        };
        let tags = workspace.join("tags");
        let cancel = AtomicBool::new(false);
        if !tags.exists() {
            crate::forge_build::stage_tags(&source, &tags, &cancel, |_, _, _, _| {}).unwrap();
        }
        fs::create_dir_all(workspace.join("data")).unwrap();
        fs::create_dir_all(workspace.join("maps")).unwrap();
        let edit = invader.join("invader-edit.exe");
        let mut p = Project::new("Native custom power-up acceptance");
        let log = std::sync::Mutex::new(String::new());
        let tool_log = workspace.join(format!("native-powerups-{id}.log"));
        let event = |e: crate::build::JobEvent| {
            use std::io::Write;
            let mut text = log.lock().unwrap();
            text.push_str(&e.message);
            text.push('\n');
            writeln!(
                fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&tool_log)
                    .unwrap(),
                "{}: {}",
                e.phase,
                e.message
            )
            .unwrap();
        };
        let runner = Runner {
            id: &id,
            project: &p.id,
            cancel: &cancel,
            event: &event,
        };
        let source_scenario = "levels/test/bloodgulch/bloodgulch.scenario";
        let position_text = get(
            &edit,
            &runner,
            &workspace,
            &tags,
            source_scenario,
            "player_starting_locations[0].position",
        )
        .unwrap();
        let values: Vec<f32> = position_text
            .split([',', ' '])
            .filter(|s| !s.is_empty())
            .map(|s| s.parse().unwrap())
            .collect();
        assert_eq!(values.len(), 3);
        for (i, effect) in [
            Effect::Camouflage,
            Effect::Overshield,
            Effect::Health,
            Effect::FragGrenade,
            Effect::PlasmaGrenade,
            Effect::DoubleSpeed,
        ]
        .into_iter()
        .enumerate()
        {
            let mut item = recipe();
            item.effect = effect;
            item.position = [values[0] + i as f32, values[1], values[2] + 0.5];
            p.powerups.push(item);
        }
        p.powerups[0].model_tag = Some("powerups/over shield/over shield.gbxmodel".into());
        let scenario = "levels/spark/powerup_acceptance";
        let scenario_file = tags.join(format!("{scenario}.scenario"));
        fs::create_dir_all(scenario_file.parent().unwrap()).unwrap();
        fs::copy(tags.join(source_scenario), &scenario_file).unwrap();
        let runner = Runner {
            id: &id,
            project: &p.id,
            cancel: &cancel,
            event: &event,
        };
        prepare(&p, scenario, &workspace, &tags, &edit, &runner).unwrap();
        let native_scenario = scenario.replace('/', "\\");
        let args = [
            "-data_dir",
            "data",
            "-tags_dir",
            "tags",
            "-game_root_dir",
            ".",
            "build-cache-file",
            &native_scenario,
            "classic",
            "none",
        ]
        .map(String::from);
        let compiled = runner
            .run(&kit.join("tool.exe"), &args, &workspace, "compile", 82)
            .unwrap();
        assert!(compiled
            .to_ascii_lowercase()
            .contains("successfully built cache file."));
        let output = workspace.join("maps/powerup_acceptance.map");
        let inspection = maps::inspect_map(&output, None).unwrap();
        verify_compiled(&p, &inspection, &workspace).unwrap();
        assert_eq!(inspection.header.version, 13);
        let mut audio_available = 0;
        let mut audio_checked = 0;
        let mut audio_reasons = vec![];
        for tag in inspection
            .tags
            .iter()
            .filter(|t| t.class == "snd!")
            .take(12)
        {
            audio_checked += 1;
            match crate::audio::inspect_sound(&output, &inspection.sha256, tag.id) {
                Ok(report) => {
                    for sample in report.permutations.iter().filter(|s| s.available).take(1) {
                        let clip = crate::audio::preview_sound(
                            &output,
                            &inspection.sha256,
                            tag.id,
                            sample.pitch_range,
                            sample.permutation,
                        )
                        .unwrap();
                        assert!(!clip.bytes.is_empty());
                        audio_available += 1;
                    }
                    if audio_reasons.len() < 3 {
                        audio_reasons.extend(
                            report
                                .permutations
                                .iter()
                                .filter_map(|s| s.reason.clone())
                                .take(1),
                        );
                    }
                }
                Err(error) => {
                    if audio_reasons.len() < 3 {
                        audio_reasons.push(error.to_string());
                    }
                }
            }
        }
        fs::write(root.join("native-mcc-audio-probe.json"),serde_json::to_vec_pretty(&serde_json::json!({"checked":audio_checked,"available":audio_available,"reasons":audio_reasons})).unwrap()).unwrap();
        let record = serde_json::json!({"nativeMccCompiler":true,"sourceTagsetUnchanged":true,"customPickups":p.powerups.len(),"effects":p.powerups.iter().map(|p|p.effect).collect::<Vec<_>>(),"compiledPlacementsVerified":true,"cacheSha256":maps::hash_file(&output).unwrap(),"runtimePickupAcceptance":"pending"});
        fs::write(
            root.join("native-powerups-receipt.json"),
            serde_json::to_vec_pretty(&record).unwrap(),
        )
        .unwrap();
        fs::write(
            workspace.join("native-powerups-tool.log"),
            log.lock().unwrap().as_bytes(),
        )
        .unwrap();
        println!("{}", record);
    }
}
