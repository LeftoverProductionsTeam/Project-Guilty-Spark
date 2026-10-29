//! Original, isolated source-tag authoring for a two-trigger paired weapon.
//! This is not a live MCC input hook or a second active inventory weapon.
//! Caller supplies a separately validated native tag editor and owned paired
//! presentation assets. No executable or process-memory operation occurs here.
use crate::{invalid, maps, project, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

const MAX_TAG_BYTES: u64 = 64 * 1024 * 1024;
const MAX_EDITOR_CALLS: usize = 512;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PairedTagSpec {
    pub id: String,
    pub target_cache_version: u32,
    pub template_weapon: String,
    pub first_person_model: String,
    pub first_person_animations: String,
    pub world_model: String,
    /// Graph clips already assigned to primary-fire slot 2 and secondary-fire
    /// slot 14. Supplying indexes does not create or retarget animation data.
    pub firing_animation_indices: [u16; 2],
    /// Shared first-person reload-empty/full slots 7/8, not left/right reloads.
    pub reload_animation_indices: [u16; 2],
    pub projectile_offsets: [[f32; 3]; 2],
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TagEdit {
    Get(String),
    Count(String),
    CopyBlock { key: String },
    Set { key: String, value: String },
}
/// A narrow argv contract for the documented invader-edit interface. The
/// embedding build runner owns executable attestation, cancellation and timing.
pub trait PairTagEditor {
    fn edit(&mut self, tags: &Path, tag: &str, operation: &TagEdit) -> Result<String>;
}
pub fn editor_arguments(tags: &Path, tag: &str, operation: &TagEdit) -> Vec<String> {
    let mut args = vec!["-t".into(), tags.to_string_lossy().into_owned()];
    match operation {
        TagEdit::Get(key) => args.extend(["-G".into(), key.clone()]),
        TagEdit::Count(key) => args.extend(["-C".into(), key.clone()]),
        TagEdit::CopyBlock { key } => args.extend(["-c".into(), key.clone(), "end".into()]),
        TagEdit::Set { key, value } => args.extend(["-S".into(), key.clone(), value.clone()]),
    }
    args.push(tag.into());
    #[cfg(windows)]
    for arg in &mut args {
        *arg = arg.replace('/', "\\");
    }
    args
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedTagReceipt {
    pub status: String,
    pub target_cache_version: u32,
    pub output_tag: String,
    pub output_sha256: String,
    pub source_hashes: BTreeMap<String, String>,
    pub triggers: [u8; 2],
    pub magazines: [u8; 2],
    pub editor_calls: usize,
    pub native_gameplay_verified: bool,
    pub required_engine_evidence: Vec<String>,
}

fn dependency(value: &str, extension: &str) -> Result<PathBuf> {
    if value.len() > 180
        || value.starts_with('-')
        || !value.ends_with(extension)
        || value
            .bytes()
            .any(|b| !b.is_ascii_alphanumeric() && !b" /\\_.-".contains(&b))
    {
        return invalid("Choose a bounded class-specific source tag path");
    }
    crate::safe_relative(value)
}
fn checked_tag(tags: &Path, value: &str, extension: &str) -> Result<PathBuf> {
    let path = tags.join(dependency(value, extension)?);
    crate::reject_links(&path)?;
    let metadata = fs::metadata(&path)?;
    if !metadata.is_file() || !(64..=MAX_TAG_BYTES).contains(&metadata.len()) {
        return invalid(
            "Paired-weapon dependency is missing or exceeds the 64 MiB source-tag limit",
        );
    }
    Ok(path)
}
fn normalized(value: &str) -> String {
    value.trim().replace('\\', "/").to_ascii_lowercase()
}
fn boolean(value: &str) -> Option<bool> {
    match value.trim() {
        "true" | "1" => Some(true),
        "false" | "0" => Some(false),
        _ => None,
    }
}

struct Editor<'a> {
    inner: &'a mut dyn PairTagEditor,
    tags: &'a Path,
    calls: usize,
}
impl Editor<'_> {
    fn run(&mut self, tag: &str, operation: TagEdit) -> Result<String> {
        self.calls += 1;
        if self.calls > MAX_EDITOR_CALLS {
            return invalid("Paired-weapon tag inspection exceeded its 512-command bound");
        }
        let result = self.inner.edit(self.tags, tag, &operation)?;
        if result.len() > 8192 {
            return invalid("Native tag editor returned an oversized field response");
        }
        Ok(result.trim().to_owned())
    }
    fn get(&mut self, tag: &str, key: &str) -> Result<String> {
        self.run(tag, TagEdit::Get(key.into()))
    }
    fn count(&mut self, tag: &str, key: &str, max: usize) -> Result<usize> {
        let count = self
            .run(tag, TagEdit::Count(key.into()))?
            .parse::<usize>()
            .map_err(|_| {
                crate::SparkError::Invalid(
                    "Native tag editor returned an invalid block count".into(),
                )
            })?;
        if count > max {
            return invalid("Paired-weapon source block exceeds its inspection bound");
        }
        Ok(count)
    }
    fn set(&mut self, tag: &str, key: &str, value: &str) -> Result<()> {
        self.run(
            tag,
            TagEdit::Set {
                key: key.into(),
                value: value.into(),
            },
        )?;
        Ok(())
    }
    fn verify(&mut self, tag: &str, key: &str, expected: &str) -> Result<()> {
        let observed = self.get(tag, key)?;
        if normalized(&observed) != normalized(expected) {
            return invalid(format!("Paired-weapon readback did not match {key}"));
        }
        Ok(())
    }
    fn verify_offset(&mut self, tag: &str, hand: usize, expected: &[f32; 3]) -> Result<()> {
        let key = format!("triggers[{hand}].first_person_offset");
        let observed = self.get(tag, &key)?;
        let coordinates = observed
            .split(',')
            .map(str::trim)
            .map(str::parse::<f32>)
            .collect::<std::result::Result<Vec<_>, _>>();
        if !coordinates.is_ok_and(|values| {
            values.len() == 3
                && values.iter().zip(expected).all(|(actual, expected)| {
                    actual.is_finite() && (actual - expected).abs() <= 0.000002
                })
        }) {
            return invalid(format!(
                "Paired-weapon projectile offset readback did not match hand {hand}"
            ));
        }
        Ok(())
    }
}

fn paired_markers(editor: &mut Editor<'_>, tag: &str) -> Result<()> {
    let regions = editor.count(tag, "regions", 8)?;
    let mut primary = false;
    let mut secondary = false;
    let mut markers = 0;
    for region in 0..regions {
        let permutations = editor.count(tag, &format!("regions[{region}].permutations"), 8)?;
        for permutation in 0..permutations {
            let key = format!("regions[{region}].permutations[{permutation}].markers");
            let count = editor.count(tag, &key, 64)?;
            markers += count;
            if markers > 128 {
                return invalid("Paired model has too many markers for bounded inspection");
            }
            for marker in 0..count {
                match editor.get(tag, &format!("{key}[{marker}].name"))?.as_str() {
                    "primary trigger" => primary = true,
                    "secondary trigger" => secondary = true,
                    _ => {}
                }
            }
        }
    }
    if !primary || !secondary {
        return invalid("A genuine paired model needs both primary trigger and secondary trigger muzzle markers; a stock single-gun model is insufficient");
    }
    Ok(())
}

/// Build into an already isolated `workspace/tags`, outside every immutable
/// source/SDK root. Only a fresh UUID namespace is written. All input asset
/// hashes must remain unchanged. The callback must never be a shell command.
/// Successful source readback remains distinct from native gameplay acceptance.
pub fn author_pair(
    workspace: &Path,
    tags: &Path,
    protected_roots: &[PathBuf],
    spec: &PairedTagSpec,
    editor: &mut dyn PairTagEditor,
) -> Result<PairedTagReceipt> {
    let id = uuid::Uuid::parse_str(&spec.id)
        .map_err(|_| crate::SparkError::Invalid("Invalid paired-weapon UUID".into()))?;
    if id.to_string() != spec.id {
        return invalid("Use the canonical lowercase paired-weapon UUID");
    }
    if ![13, 609].contains(&spec.target_cache_version) {
        return invalid("Paired source authoring currently targets H1A or Custom Edition toolchains explicitly; other runtimes need their own validated path");
    }
    if spec.firing_animation_indices[0] == spec.firing_animation_indices[1]
        || spec
            .projectile_offsets
            .iter()
            .flatten()
            .any(|v| !v.is_finite() || v.abs() > 4.)
    {
        return invalid("Choose distinct firing clips and finite per-hand projectile offsets within four world units");
    }
    if protected_roots.is_empty() {
        return invalid("Declare the immutable source/SDK roots before authoring a paired weapon");
    }
    crate::reject_links(workspace)?;
    crate::reject_links(tags)?;
    let workspace = workspace.canonicalize()?;
    let tags = tags.canonicalize()?;
    if tags != workspace.join("tags").canonicalize()? {
        return invalid("Paired authoring must use this build job's own tags directory");
    }
    for root in protected_roots {
        crate::reject_links(root)?;
        let root = root.canonicalize()?;
        if tags.starts_with(&root) || root.starts_with(&tags) {
            return invalid("Paired authoring cannot modify a source/SDK master tag tree");
        }
    }
    let input_files = [
        (&spec.template_weapon, ".weapon"),
        (&spec.first_person_model, ".gbxmodel"),
        (&spec.first_person_animations, ".model_animations"),
        (&spec.world_model, ".gbxmodel"),
    ];
    let mut source_hashes = BTreeMap::new();
    for (name, extension) in input_files {
        let path = checked_tag(&tags, name, extension)?;
        source_hashes.insert(name.clone(), maps::hash_file(&path)?);
    }
    let mut editor = Editor {
        inner: editor,
        tags: &tags,
        calls: 0,
    };
    if editor.count(&spec.template_weapon, "triggers", 2)? != 1
        || editor.count(&spec.template_weapon, "magazines", 2)? != 1
    {
        return invalid("This authoring slice requires a single-trigger, single-magazine ballistic template; existing alternate-fire behavior cannot be discarded");
    }
    if boolean(&editor.get(&spec.template_weapon, "weapon_flags.must_be_readied")?) != Some(false) {
        return invalid("Flag/oddball-style must-be-readied weapons cannot be dual templates");
    }
    if normalized(&editor.get(&spec.template_weapon, "first_person_model")?)
        == normalized(&spec.first_person_model)
    {
        return invalid("Select an authored paired first-person model rather than reusing the single-gun template");
    }
    editor.verify(&spec.template_weapon, "triggers[0].magazine", "0")?;
    let loaded = editor
        .get(&spec.template_weapon, "magazines[0].rounds_loaded_maximum")?
        .parse::<i16>()
        .ok();
    let rounds_per_shot = editor
        .get(&spec.template_weapon, "triggers[0].rounds_per_shot")?
        .parse::<i16>()
        .ok();
    if loaded.is_none_or(|n| n <= 0) || rounds_per_shot.is_none_or(|n| n <= 0 || Some(n) > loaded) {
        return invalid("Choose a ballistic template with a real loaded magazine and positive ammunition consumption");
    }
    // Verify the copied per-hand ammunition/reload behavior, rather than only
    // accepting two empty blocks or two triggers still sharing one magazine.
    let mut preserved_fields = Vec::new();
    for (block, fields) in [
        (
            "magazines",
            &[
                "rounds_total_initial",
                "rounds_reserved_maximum",
                "rounds_loaded_maximum",
                "rounds_reloaded",
                "reload_time",
                "chamber_time",
            ][..],
        ),
        (
            "triggers",
            &[
                "rounds_per_shot",
                "minimum_rounds_loaded",
                "projectiles_per_shot",
                "projectile",
                "maximum_rate_of_fire",
            ][..],
        ),
    ] {
        for field in fields {
            let value = editor.get(&spec.template_weapon, &format!("{block}[0].{field}"))?;
            preserved_fields.push((block, *field, value));
        }
    }
    paired_markers(&mut editor, &spec.first_person_model)?;
    paired_markers(&mut editor, &spec.world_model)?;
    let nodes = editor.count(&spec.first_person_model, "nodes", 64)?;
    if nodes == 0 || editor.count(&spec.first_person_animations, "nodes", 64)? != nodes {
        return invalid("Paired first-person model and animation graph node counts differ");
    }
    for node in 0..nodes {
        if editor.get(&spec.first_person_model, &format!("nodes[{node}].name"))?
            != editor.get(
                &spec.first_person_animations,
                &format!("nodes[{node}].name"),
            )?
        {
            return invalid(
                "Paired first-person model and animations have different node identities",
            );
        }
    }
    let animation_count = editor.count(
        &spec.first_person_animations,
        "animations",
        if spec.target_cache_version == 609 {
            256
        } else {
            2048
        },
    )?;
    if editor.count(&spec.first_person_animations, "first_person_weapons", 1)? != 1
        || editor.count(
            &spec.first_person_animations,
            "first_person_weapons[0].animations",
            30,
        )? < 15
    {
        return invalid("Paired animation graph must contain the engine's primary/secondary first-person animation slots");
    }
    // These are data-format slot indexes from the pinned H1 weapon enum, not
    // process addresses. Reload slots are shared empty/full states in stock H1.
    for (slot, animation) in [
        (2, spec.firing_animation_indices[0]),
        (14, spec.firing_animation_indices[1]),
        (7, spec.reload_animation_indices[0]),
        (8, spec.reload_animation_indices[1]),
    ] {
        editor.verify(
            &spec.first_person_animations,
            &format!("first_person_weapons[0].animations[{slot}].animation"),
            &animation.to_string(),
        )?;
    }
    let checksum = editor.get(&spec.first_person_model, "node_list_checksum")?;
    for animation in spec
        .firing_animation_indices
        .into_iter()
        .chain(spec.reload_animation_indices)
    {
        if animation as usize >= animation_count {
            return invalid("Paired firing/reload clip is outside the animation graph");
        }
        if editor
            .get(
                &spec.first_person_animations,
                &format!("animations[{animation}].node_count"),
            )?
            .parse::<usize>()
            .ok()
            != Some(nodes)
            || editor.get(
                &spec.first_person_animations,
                &format!("animations[{animation}].node_list_checksum"),
            )? != checksum
            || editor
                .get(
                    &spec.first_person_animations,
                    &format!("animations[{animation}].frame_count"),
                )?
                .parse::<u16>()
                .ok()
                .is_none_or(|n| n == 0)
        {
            return invalid("Paired firing/reload animation rig or frame data is incompatible");
        }
    }
    let output_tag = format!("weapons/spark_pairs/{}/paired.weapon", spec.id);
    let directory = tags.join(format!("weapons/spark_pairs/{}", spec.id));
    crate::reject_links(&directory)?;
    fs::create_dir_all(directory.parent().unwrap())?;
    fs::create_dir(&directory)?;
    let output = tags.join(&output_tag);
    let result = (|| -> Result<PairedTagReceipt> {
        let mut input = fs::File::open(tags.join(crate::safe_relative(&spec.template_weapon)?))?;
        let mut target = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&output)?;
        let copied = std::io::copy(
            &mut Read::by_ref(&mut input).take(MAX_TAG_BYTES + 1),
            &mut target,
        )?;
        target.flush()?;
        drop(target);
        if copied > MAX_TAG_BYTES
            || maps::hash_file(&output)? != source_hashes[&spec.template_weapon]
        {
            return invalid("Paired template changed while copying");
        }
        for key in ["magazines[0]", "triggers[0]"] {
            editor.run(&output_tag, TagEdit::CopyBlock { key: key.into() })?;
        }
        for (key, value) in [
            ("secondary_trigger_mode", "normal"),
            ("weapon_flags.prevents_grenade_throwing", "1"),
            ("weapon_flags.secondary_trigger_overrides_grenades", "1"),
            ("zoom_levels", "0"),
            ("triggers[0].magazine", "0"),
            ("triggers[1].magazine", "1"),
            ("model", spec.world_model.as_str()),
            ("first_person_model", spec.first_person_model.as_str()),
            (
                "first_person_animations",
                spec.first_person_animations.as_str(),
            ),
        ] {
            editor.set(&output_tag, key, value)?;
        }
        for hand in 0..2 {
            let value = spec.projectile_offsets[hand]
                .iter()
                .map(|v| format!("{v:.8}"))
                .collect::<Vec<_>>()
                .join(",");
            editor.set(
                &output_tag,
                &format!("triggers[{hand}].first_person_offset"),
                &value,
            )?;
        }
        if editor.count(&output_tag, "triggers", 2)? != 2
            || editor.count(&output_tag, "magazines", 2)? != 2
        {
            return invalid("Paired output does not contain two complete trigger/magazine blocks");
        }
        for (key, value) in [
            ("secondary_trigger_mode", "normal"),
            ("zoom_levels", "0"),
            ("triggers[0].magazine", "0"),
            ("triggers[1].magazine", "1"),
            ("model", spec.world_model.as_str()),
            ("first_person_model", spec.first_person_model.as_str()),
            (
                "first_person_animations",
                spec.first_person_animations.as_str(),
            ),
        ] {
            editor.verify(&output_tag, key, value)?;
        }
        for key in [
            "weapon_flags.prevents_grenade_throwing",
            "weapon_flags.secondary_trigger_overrides_grenades",
        ] {
            if boolean(&editor.get(&output_tag, key)?) != Some(true) {
                return invalid(
                    "Paired output did not retain its grenade/secondary-trigger policy",
                );
            }
        }
        for hand in 0..2 {
            editor.verify_offset(&output_tag, hand, &spec.projectile_offsets[hand])?;
            for (block, field, expected) in &preserved_fields {
                editor.verify(&output_tag, &format!("{block}[{hand}].{field}"), expected)?;
            }
        }
        for (name, expected) in &source_hashes {
            if maps::hash_file(&tags.join(crate::safe_relative(name)?))? != *expected {
                return invalid("A source presentation/template tag changed while authoring; output was rejected");
            }
        }
        let output_sha256 = maps::hash_file(&output)?;
        if output_sha256 == source_hashes[&spec.template_weapon] {
            return invalid("Native tag editor made no persisted changes to the paired output");
        }
        let receipt = PairedTagReceipt {
            status: "sourceTagsAuthoredGameplayUnverified".into(),
            target_cache_version: spec.target_cache_version,
            output_tag: output_tag.clone(),
            output_sha256,
            source_hashes,
            triggers: [0, 1],
            magazines: [0, 1],
            editor_calls: editor.calls,
            native_gameplay_verified: false,
            required_engine_evidence: vec![
                "Verified LMB-primary/RMB-secondary bindings for the exact runtime; OpenCE input mapping is not MCC attestation.".into(),
                "Manual reload for each hand: inspected H1 source starts magazine 0 on reload; independent off-hand reload needs an engine-owned extension.".into(),
                "Real paired FP/world geometry, simultaneous firing/recoil and reload presentation, HUD ammo, reticle and hit-origin acceptance.".into(),
                "Halo 2 pickup/drop/melee/grenade/weapon-switch rules and host-authoritative two-client acceptance; a paired tag remains one inventory weapon.".into(),
            ],
        };
        project::atomic_write(
            &directory.join("spark-pair-receipt.json"),
            &serde_json::to_vec_pretty(&receipt)?,
            false,
        )?;
        Ok(receipt)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&output);
        let _ = fs::remove_file(directory.join("spark-pair-receipt.json"));
        let _ = fs::remove_dir(&directory);
    }
    result
}
