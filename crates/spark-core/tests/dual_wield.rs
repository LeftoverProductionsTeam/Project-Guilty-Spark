//! Tests of Spark's original source-authoring transaction and documented argv
//! contract. These synthetic tags/editor never stand in for a native Halo test.
use spark_core::{
    dual_wield::{author_pair, editor_arguments, PairTagEditor, PairedTagSpec, TagEdit},
    maps, Result,
};
use std::{
    collections::BTreeMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Default)]
struct RecordingEditor {
    values: BTreeMap<String, BTreeMap<String, String>>,
    calls: Vec<(String, TagEdit)>,
    output_reads: BTreeMap<String, String>,
    fail_key: Option<String>,
    no_persist: bool,
    template: String,
}
impl RecordingEditor {
    fn put(&mut self, tag: &str, key: &str, value: impl ToString) {
        self.values
            .entry(tag.into())
            .or_default()
            .insert(key.into(), value.to_string());
    }
    fn output(tag: &str) -> bool {
        tag.starts_with("weapons/spark_pairs/")
    }
}
impl PairTagEditor for RecordingEditor {
    fn edit(&mut self, tags: &Path, tag: &str, operation: &TagEdit) -> Result<String> {
        self.calls.push((tag.into(), operation.clone()));
        let key = match operation {
            TagEdit::Get(key)
            | TagEdit::Count(key)
            | TagEdit::CopyBlock { key }
            | TagEdit::Set { key, .. } => key,
        };
        if Self::output(tag) && self.fail_key.as_ref() == Some(key) {
            return spark_core::invalid("Synthetic editor failed");
        }
        if Self::output(tag) && !self.values.contains_key(tag) {
            self.values
                .insert(tag.into(), self.values[&self.template].clone());
        }
        match operation {
            TagEdit::Get(_) | TagEdit::Count(_) => {
                if Self::output(tag) {
                    if let Some(value) = self.output_reads.get(key) {
                        return Ok(value.clone());
                    }
                }
                self.values
                    .get(tag)
                    .and_then(|fields| fields.get(key))
                    .cloned()
                    .ok_or_else(|| {
                        spark_core::SparkError::Invalid(format!("Unexpected synthetic field {key}"))
                    })
            }
            TagEdit::CopyBlock { key } => {
                assert!(Self::output(tag), "only the fresh output can be mutated");
                let prefix = key.strip_suffix("[0]").expect("single source block");
                let source = format!("{prefix}[0].");
                let fields = self.values.get_mut(tag).unwrap();
                let copy: Vec<_> = fields
                    .iter()
                    .filter_map(|(k, v)| {
                        k.strip_prefix(&source)
                            .map(|suffix| (format!("{prefix}[1].{suffix}"), v.clone()))
                    })
                    .collect();
                fields.extend(copy);
                fields.insert(prefix.into(), "2".into());
                if !self.no_persist {
                    fs::OpenOptions::new()
                        .append(true)
                        .open(tags.join(tag))?
                        .write_all(b"synthetic copy\n")?;
                }
                Ok(String::new())
            }
            TagEdit::Set { key, value } => {
                assert!(
                    Self::output(tag),
                    "source presentation and template files are immutable"
                );
                self.put(tag, key, value);
                if !self.no_persist {
                    fs::OpenOptions::new()
                        .append(true)
                        .open(tags.join(tag))?
                        .write_all(b"synthetic set\n")?;
                }
                Ok(String::new())
            }
        }
    }
}

struct Fixture {
    _temp: tempfile::TempDir,
    workspace: PathBuf,
    tags: PathBuf,
    source: PathBuf,
    spec: PairedTagSpec,
    editor: RecordingEditor,
}
impl Fixture {
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let workspace = temp.path().join("private-build");
        let tags = workspace.join("tags");
        let source = temp.path().join("immutable-sdk");
        fs::create_dir_all(&tags).unwrap();
        fs::create_dir(&source).unwrap();
        let spec = PairedTagSpec {
            id: uuid::Uuid::new_v4().to_string(),
            target_cache_version: 13,
            template_weapon: "weapons/pistol/pistol.weapon".into(),
            first_person_model: "weapons/paired/fp.gbxmodel".into(),
            first_person_animations: "weapons/paired/fp.model_animations".into(),
            world_model: "weapons/paired/world.gbxmodel".into(),
            firing_animation_indices: [0, 1],
            reload_animation_indices: [2, 3],
            projectile_offsets: [[0.3, 0.2, -0.1], [0.3, -0.2, -0.1]],
        };
        for name in [
            &spec.template_weapon,
            &spec.first_person_model,
            &spec.first_person_animations,
            &spec.world_model,
        ] {
            let path = tags.join(name);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, vec![0x3Au8; 128]).unwrap();
        }
        let mut editor = RecordingEditor {
            template: spec.template_weapon.clone(),
            ..Default::default()
        };
        for (key, value) in [
            ("triggers", "1"),
            ("magazines", "1"),
            ("weapon_flags.must_be_readied", "0"),
            ("first_person_model", "weapons/pistol/fp/fp.gbxmodel"),
            ("triggers[0].magazine", "0"),
            ("triggers[0].rounds_per_shot", "1"),
            ("triggers[0].minimum_rounds_loaded", "1"),
            ("triggers[0].projectiles_per_shot", "1"),
            ("triggers[0].projectile", "weapons/pistol/bullet.projectile"),
            ("triggers[0].maximum_rate_of_fire", "6.000000,6.000000"),
            ("magazines[0].rounds_total_initial", "60"),
            ("magazines[0].rounds_reserved_maximum", "120"),
            ("magazines[0].rounds_loaded_maximum", "12"),
            ("magazines[0].rounds_reloaded", "12"),
            ("magazines[0].reload_time", "1.500000"),
            ("magazines[0].chamber_time", "0.000000"),
        ] {
            editor.put(&spec.template_weapon, key, value);
        }
        for tag in [&spec.first_person_model, &spec.world_model] {
            for (key, value) in [
                ("regions", "1"),
                ("regions[0].permutations", "1"),
                ("regions[0].permutations[0].markers", "2"),
                (
                    "regions[0].permutations[0].markers[0].name",
                    "primary trigger",
                ),
                (
                    "regions[0].permutations[0].markers[1].name",
                    "secondary trigger",
                ),
            ] {
                editor.put(tag, key, value);
            }
        }
        for tag in [&spec.first_person_model, &spec.first_person_animations] {
            for (key, value) in [
                ("nodes", "2"),
                ("nodes[0].name", "root"),
                ("nodes[1].name", "hands"),
            ] {
                editor.put(tag, key, value);
            }
        }
        editor.put(&spec.first_person_model, "node_list_checksum", "12345");
        for (key, value) in [
            ("animations", "4"),
            ("first_person_weapons", "1"),
            ("first_person_weapons[0].animations", "28"),
        ] {
            editor.put(&spec.first_person_animations, key, value);
        }
        for (slot, animation) in [(2, 0), (14, 1), (7, 2), (8, 3)] {
            editor.put(
                &spec.first_person_animations,
                &format!("first_person_weapons[0].animations[{slot}].animation"),
                animation,
            );
        }
        for clip in 0..4 {
            for (field, value) in [
                ("node_count", "2"),
                ("node_list_checksum", "12345"),
                ("frame_count", "6"),
            ] {
                editor.put(
                    &spec.first_person_animations,
                    &format!("animations[{clip}].{field}"),
                    value,
                );
            }
        }
        Self {
            _temp: temp,
            workspace,
            tags,
            source,
            spec,
            editor,
        }
    }
    fn output(&self) -> PathBuf {
        self.tags.join(format!(
            "weapons/spark_pairs/{}/paired.weapon",
            self.spec.id
        ))
    }
    fn run(&mut self) -> Result<spark_core::dual_wield::PairedTagReceipt> {
        author_pair(
            &self.workspace,
            &self.tags,
            std::slice::from_ref(&self.source),
            &self.spec,
            &mut self.editor,
        )
    }
}

#[test]
fn copies_independent_ammunition_and_checks_authored_animation_slots_without_modifying_sources() {
    let mut f = Fixture::new();
    let sources: Vec<_> = [
        &f.spec.template_weapon,
        &f.spec.first_person_model,
        &f.spec.first_person_animations,
        &f.spec.world_model,
    ]
    .into_iter()
    .map(|name| (name.clone(), fs::read(f.tags.join(name)).unwrap()))
    .collect();
    let receipt = f.run().unwrap();
    assert_eq!(receipt.status, "sourceTagsAuthoredGameplayUnverified");
    assert!(!receipt.native_gameplay_verified);
    assert_eq!(receipt.triggers, [0, 1]);
    assert_eq!(receipt.magazines, [0, 1]);
    assert_eq!(receipt.output_sha256, maps::hash_file(&f.output()).unwrap());
    let fields = &f.editor.values[&receipt.output_tag];
    assert_eq!(fields["secondary_trigger_mode"], "normal");
    assert_eq!(fields["triggers[0].magazine"], "0");
    assert_eq!(fields["triggers[1].magazine"], "1");
    assert_eq!(fields["magazines[1].rounds_loaded_maximum"], "12");
    assert_eq!(
        fields["weapon_flags.secondary_trigger_overrides_grenades"],
        "1"
    );
    assert_eq!(fields["weapon_flags.prevents_grenade_throwing"], "1");
    assert_eq!(fields["zoom_levels"], "0");
    for (name, bytes) in sources {
        assert_eq!(fs::read(f.tags.join(name)).unwrap(), bytes);
    }
    assert_eq!(
        f.editor
            .calls
            .iter()
            .filter(|(_, op)| matches!(op, TagEdit::CopyBlock { .. }))
            .count(),
        2
    );
    assert!(f
        .output()
        .parent()
        .unwrap()
        .join("spark-pair-receipt.json")
        .is_file());
}

#[test]
fn refuses_sdk_roots_and_never_calls_an_editor_on_a_protected_tree() {
    let mut f = Fixture::new();
    let error = author_pair(
        &f.workspace,
        &f.tags,
        std::slice::from_ref(&f.tags),
        &f.spec,
        &mut f.editor,
    )
    .unwrap_err();
    assert!(error.to_string().contains("source/SDK master"));
    assert!(f.editor.calls.is_empty());
    assert!(!f.output().exists());
}

#[test]
fn stock_single_gun_assets_and_incompatible_authored_graphs_are_rejected_before_writes() {
    for failure in 0..6 {
        let mut f = Fixture::new();
        match failure {
            0 => f.editor.put(
                &f.spec.first_person_model,
                "regions[0].permutations[0].markers[1].name",
                "single gun",
            ),
            1 => f.editor.put(
                &f.spec.first_person_animations,
                "nodes[1].name",
                "different rig",
            ),
            2 => f.editor.put(
                &f.spec.first_person_animations,
                "animations[1].node_list_checksum",
                "9876",
            ),
            3 => f.editor.put(
                &f.spec.first_person_animations,
                "first_person_weapons[0].animations[14].animation",
                "0",
            ),
            4 => f.editor.put(
                &f.spec.first_person_animations,
                "animations[2].frame_count",
                "0",
            ),
            _ => f.editor.put(
                &f.spec.template_weapon,
                "first_person_model",
                &f.spec.first_person_model,
            ),
        }
        assert!(f.run().is_err(), "failure {failure}");
        assert!(!f.output().exists());
        assert!(!f
            .editor
            .calls
            .iter()
            .any(|(_, op)| matches!(op, TagEdit::Set { .. } | TagEdit::CopyBlock { .. })));
    }
}

#[test]
fn never_silently_discards_existing_alt_fire_or_infinite_ammunition_behavior() {
    for (key, value) in [
        ("triggers", "2"),
        ("magazines", "2"),
        ("weapon_flags.must_be_readied", "1"),
        ("triggers[0].magazine", "-1"),
        ("magazines[0].rounds_loaded_maximum", "0"),
        ("triggers[0].rounds_per_shot", "-1"),
    ] {
        let mut f = Fixture::new();
        f.editor.put(&f.spec.template_weapon, key, value);
        assert!(f.run().is_err(), "{key}");
        assert!(!f.output().exists());
    }
}

#[test]
fn output_field_or_origin_mismatch_rolls_back_only_the_fresh_namespace() {
    for (key, value) in [
        ("triggers[1].magazine", "0"),
        ("magazines[1].rounds_loaded_maximum", "99"),
        ("triggers[1].first_person_offset", "0.3,0.2,-0.1"),
        ("triggers[0].first_person_offset", "NaN,0.2,-0.1"),
    ] {
        let mut f = Fixture::new();
        f.editor.output_reads.insert(key.into(), value.into());
        let original = fs::read(f.tags.join(&f.spec.template_weapon)).unwrap();
        assert!(f.run().is_err(), "{key}");
        assert!(!f.output().parent().unwrap().exists());
        assert_eq!(
            fs::read(f.tags.join(&f.spec.template_weapon)).unwrap(),
            original
        );
    }
}

#[test]
fn executor_failure_and_noop_persistence_cannot_produce_a_success_receipt() {
    for noop in [false, true] {
        let mut f = Fixture::new();
        if noop {
            f.editor.no_persist = true;
        } else {
            f.editor.fail_key = Some("triggers[0]".into());
        }
        assert!(f.run().is_err());
        assert!(!f.output().parent().unwrap().exists());
    }
}

#[test]
fn existing_pair_namespace_is_not_overwritten_or_deleted() {
    let mut f = Fixture::new();
    fs::create_dir_all(f.output().parent().unwrap()).unwrap();
    fs::write(f.output(), b"keep authored pair").unwrap();
    assert!(f.run().is_err());
    assert_eq!(fs::read(f.output()).unwrap(), b"keep authored pair");
}

#[test]
fn unsafe_specs_and_unsupported_cache_families_cannot_enter_the_native_editor() {
    for failure in 0..6 {
        let mut f = Fixture::new();
        match failure {
            0 => f.spec.template_weapon = "../escape.weapon".into(),
            1 => f.spec.template_weapon = "-help.weapon".into(),
            2 => f.spec.target_cache_version = 7,
            3 => f.spec.projectile_offsets[1][1] = f32::NAN,
            4 => f.spec.id = "../../outside".into(),
            _ => f.spec.firing_animation_indices = [0, 0],
        }
        assert!(f.run().is_err());
        assert!(f.editor.calls.is_empty());
    }
}

#[test]
fn native_field_responses_and_model_traversal_have_fixed_bounds() {
    for oversized_response in [false, true] {
        let mut f = Fixture::new();
        if oversized_response {
            f.editor.put(
                &f.spec.template_weapon,
                "weapon_flags.must_be_readied",
                "x".repeat(8193),
            );
        } else {
            f.editor
                .put(&f.spec.first_person_model, "regions", "999999");
        }
        assert!(f.run().is_err());
        assert!(f.editor.calls.len() < 32);
        assert!(!f
            .editor
            .calls
            .iter()
            .any(|(_, op)| matches!(op, TagEdit::Set { .. } | TagEdit::CopyBlock { .. })));
        assert!(!f.output().exists());
    }
}

#[test]
fn typed_cli_arguments_do_not_turn_paths_or_values_into_shell_programs() {
    let args = editor_arguments(
        Path::new("D:/private build/tags"),
        "weapons/pair.weapon",
        &TagEdit::CopyBlock {
            key: "triggers[0]".into(),
        },
    );
    assert_eq!(args.len(), 6);
    assert_eq!(args[0], "-t");
    assert_eq!(args[2], "-c");
    assert_eq!(args[3], "triggers[0]");
    assert_eq!(args[4], "end");
    assert!(args[1].contains("private build"));
    let set = editor_arguments(
        Path::new("tags"),
        "pair.weapon",
        &TagEdit::Set {
            key: "first_person_model".into(),
            value: "a b/c.gbxmodel".into(),
        },
    );
    assert_eq!(set.len(), 6);
    assert_eq!(set[2], "-S");
    assert!(set[4].contains("a b"));
}
