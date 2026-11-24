//! Reviewed numeric edits for the existing imported-map compiler.
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::{build, invalid, maps, project, Result, SparkError};
use maps::{MapInspection, Tag, TagField};
use project::{Project, TagEdit};

pub const MAX_MAPS: usize = 32;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub class: String,
    pub path: String,
    pub field: String,
    pub value: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Match {
    pub class: String,
    pub path: String,
    pub field: String,
    pub label: String,
    pub kind: String,
    pub unit: String,
}

impl Match {
    pub fn present_in(&self, tags: &[Tag]) -> bool {
        let identity = Rule {
            class: self.class.clone(),
            path: self.path.clone(),
            field: self.field.clone(),
            value: 0.0,
        };
        one_field(tags, &identity)
            .is_ok_and(|(_, field)| field.kind == self.kind && field.unit == self.unit)
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Row {
    pub project_id: String,
    pub title: String,
    pub cache_version: u32,
    pub source_sha256: String,
    pub source_revision: String,
    pub resource_sha256: std::collections::BTreeMap<String, String>,
    pub before: Value,
    pub after: Value,
    pub kind: String,
    pub unit: String,
    pub map_name: String,
}

fn numeric(field: &TagField) -> bool {
    matches!(field.kind.as_str(), "f32" | "i8" | "u8" | "i16" | "u16" | "i32" | "u32")
        && field.value.is_number() && field.target_class.is_none()
}

fn normalized(path: &str) -> String {
    path.replace('\\', "/").to_ascii_lowercase()
}

pub fn search(inspection: &MapInspection, query: &str) -> Vec<Match> {
    let query = query.to_ascii_lowercase();
    inspection.tags.iter()
        .filter(|tag| !tag.external && tag.data_offset.is_some())
        .flat_map(|tag| tag.fields.iter().filter_map(|field| {
            if !numeric(field) {
                return None;
            }
            let text = format!("{} {} {} {}", tag.class, normalized(&tag.path), field.key, field.label);
            query.split_whitespace().all(|term| text.to_ascii_lowercase().contains(term))
                .then(|| Match {
                    class: tag.class.clone(), path: normalized(&tag.path), field: field.key.clone(),
                    label: field.label.clone(), kind: field.kind.clone(), unit: field.unit.clone(),
                })
        }))
        .take(60)
        .collect()
}

fn one_field<'a>(candidates: &'a [Tag], rule: &Rule) -> Result<(&'a Tag, &'a TagField)> {
    let path = normalized(&rule.path);
    let mut tags = candidates.iter().filter(|tag| tag.class == rule.class && normalized(&tag.path) == path);
    let tag = tags.next().ok_or_else(|| SparkError::Invalid("This map has no matching native tag path and class".into()))?;
    if tags.next().is_some() || tag.external || tag.data_offset.is_none() {
        return invalid("The matching tag must have exactly one locally stored native definition");
    }
    let mut fields = tag.fields.iter().filter(|field| field.key == rule.field && numeric(field));
    let field = fields.next().ok_or_else(|| SparkError::Invalid("This tag has no matching supported numeric field".into()))?;
    if fields.next().is_some() {
        return invalid("The matching field is ambiguous");
    }
    Ok((tag, field))
}

pub fn check_source(project: &Project) -> Result<()> {
    let source = project.source.as_ref().ok_or_else(|| SparkError::Invalid("This project has no imported cache".into()))?;
    for path in [&source.original_path, &source.preserved_path] {
        crate::reject_links(path)?;
        if maps::hash_file(path)? != source.sha256 {
            return invalid("Original or preserved cache differs from its reviewed SHA-256");
        }
    }
    Ok(())
}

pub fn prepare(
    project: &Project,
    inspection: &MapInspection,
    tools: &build::Toolchain,
    rule: &Rule,
) -> Result<(Row, Project)> {
    let source = project.source.as_ref().ok_or_else(|| SparkError::Invalid("This project has no imported cache".into()))?;
    if !matches!(source.cache_version, 609 | 13) || source.archive.is_some() || project.quick_forge.is_some() || build::selected_ce_source(project)
        || crate::megaworld_build::selected(project) || !project.tag_renames.is_empty()
        || !project.tag_duplicates.is_empty()
    {
        return invalid("This numeric batch route supports saved standalone imported maps targeting MCC");
    }
    if !rule.value.is_finite() || rule.path.len() > 512 || rule.field.len() > 128 {
        return invalid("Choose a valid tag, field and finite numeric value");
    }
    crate::safe_relative(&rule.path)?;
    check_source(project)?;
    let (tag, field) = one_field(&inspection.tags, rule)?;
    let before = project.tag_edits.iter().find(|edit| edit.tag_id == tag.id && edit.field_key == field.key)
        .map_or_else(|| field.value.clone(), |edit| edit.value.clone());
    let after = Value::from(rule.value);
    if field.kind == "f32" && !((rule.value as f32).is_finite()) {
        return invalid("Value exceeds native float range");
    }
    let mut draft = project.clone();
    draft.tag_edits.retain(|edit| edit.tag_id != tag.id || edit.field_key != field.key);
    draft.tag_edits.push(TagEdit { tag_id: tag.id, field_key: field.key.clone(), value: after.clone() });
    project::validate_edits(&draft, inspection)?;
    let report = build::compatibility(&draft, inspection, tools);
    if !report.ready {
        return invalid(report.blockers.join("\n"));
    }
    let source_revision = crate::hex_bytes(Sha256::digest(serde_json::to_vec(&(
        project.fingerprint()?, &project.modified_at, &project.source, tools,
    ))?));
    let name = inspection.scenario_path.rsplit(['\\', '/']).next().unwrap_or("");
    let map_name = format!("{}.map", name.to_ascii_lowercase());
    if crate::safe_relative(&map_name)?.components().count() != 1 || name.is_empty() {
        return invalid("The native scenario needs a valid output filename");
    }
    Ok((Row {
        project_id: project.id.clone(), title: project.title.clone(), cache_version: inspection.header.version,
        source_sha256: source.sha256.clone(), source_revision, resource_sha256: source.resource_sha256.clone(),
        before, after, kind: field.kind.clone(), unit: field.unit.clone(), map_name,
    }, draft))
}

pub fn receipt_hash(rule: &Rule, rows: &[Row]) -> Result<String> {
    Ok(crate::hex_bytes(Sha256::digest(serde_json::to_vec(&("spark-numeric-batch-v1", rule, rows))?)))
}

pub fn verify_compiled(path: &Path, rule: &Rule, row: &Row, expected_sha: &str) -> Result<()> {
    crate::reject_links(path)?;
    let compiled = maps::inspect_map(path, None)?;
    let (_, field) = one_field(&compiled.tags, rule)?;
    let actual = field.value.as_f64().ok_or_else(|| SparkError::Invalid("Compiled field is not numeric".into()))?;
    let expected = if row.kind == "f32" { f64::from(rule.value as f32) } else { rule.value };
    if compiled.sha256 != expected_sha || compiled.header.version != 13
        || field.kind != row.kind || field.unit != row.unit || actual != expected
    {
        return invalid("Native readback did not preserve the reviewed numeric field and cache identity");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tag(id: u32) -> Tag {
        Tag {
            id,
            index: 0,
            class: "weap".into(),
            path: "Weapons\\Pistol\\Pistol".into(),
            data_offset: Some(2048),
            external: false,
            fields: vec![TagField {
                key: "test-rate".into(), label: "Rate".into(), offset: 8, kind: "f32".into(),
                value: Value::from(2.0), min: 0.0, max: 10.0, unit: "rounds/s".into(), target_class: None,
            }],
            references: vec![], primary_bitmap_status: None, shader_preview: None,
        }
    }

    fn rule() -> Rule {
        Rule { class: "weap".into(), path: "weapons/pistol/pistol".into(), field: "test-rate".into(), value: 3.0 }
    }

    #[test]
    fn resolves_native_path_and_class_across_different_local_ids() {
        let first = [tag(7)];
        let second = [tag(21)];
        assert_eq!(one_field(&first, &rule()).unwrap().0.id, 7);
        assert_eq!(one_field(&second, &rule()).unwrap().0.id, 21);
        let mut wrong_class = tag(7);
        wrong_class.class = "eqip".into();
        assert!(one_field(&[wrong_class], &rule()).is_err());
        let mut missing_field = tag(21);
        missing_field.fields.clear();
        assert!(one_field(&[missing_field], &rule()).unwrap_err().to_string().contains("numeric field"));
        let mut external = tag(21);
        external.external = true;
        assert!(one_field(&[external], &rule()).is_err());
        assert!(one_field(&[tag(7), tag(21)], &rule()).is_err());
    }

    #[test]
    fn field_search_availability_requires_one_matching_local_schema() {
        let field = Match {
            class: "weap".into(), path: "weapons/pistol/pistol".into(), field: "test-rate".into(),
            label: "Rate".into(), kind: "f32".into(), unit: "rounds/s".into(),
        };
        assert!(field.present_in(&[tag(19)]));
        assert!(!field.present_in(&[tag(19), tag(20)]));
        let mut other = tag(19);
        other.fields[0].unit = "seconds".into();
        assert!(!field.present_in(&[other.clone()]));
        other.fields[0].unit = field.unit.clone();
        other.fields[0].kind = "i16".into();
        assert!(!field.present_in(&[other.clone()]));
        other.fields[0].kind = field.kind.clone();
        other.external = true;
        assert!(!field.present_in(&[other]));
    }

    #[test]
    fn reviewed_plan_identity_changes_with_source_resource_or_requested_value() {
        let mut rule = rule();
        let mut row = Row {
            project_id: "first".into(), title: "Campaign".into(), cache_version: 13,
            source_sha256: "a".repeat(64), source_revision: "b".repeat(64),
            resource_sha256: Default::default(), before: Value::from(2.0), after: Value::from(3.0),
            kind: "f32".into(), unit: "rounds/s".into(), map_name: "a10.map".into(),
        };
        let original = receipt_hash(&rule, std::slice::from_ref(&row)).unwrap();
        row.source_revision = "c".repeat(64);
        let edited = receipt_hash(&rule, std::slice::from_ref(&row)).unwrap();
        assert_ne!(original, edited);
        row.resource_sha256.insert("bitmaps.map".into(), "d".repeat(64));
        let resources = receipt_hash(&rule, std::slice::from_ref(&row)).unwrap();
        assert_ne!(edited, resources);
        rule.value = 4.0;
        assert_ne!(resources, receipt_hash(&rule, &[row]).unwrap());
    }

    #[test]
    #[ignore = "requires two creator-owned MCC campaign maps and installed native tools in an isolated workspace"]
    fn owned_campaign_maps_compile_and_read_back_the_same_rule() -> Result<()> {
        use crate::library::Library;
        use std::{path::PathBuf, sync::{Arc, atomic::AtomicBool}};

        let field = |name| std::env::var_os(name).map(PathBuf::from);
        let root = field("SPARK_GENERATED_ROOT").expect("Use the owned development workspace");
        let maps_dir = field("SPARK_BATCH_CAMPAIGN_MAPS").expect("Select the owned campaign maps folder");
        // The development runner owns this directory and removes it after the
        // compiler and storage monitor have stopped.
        let work = root.join("batch-campaign-fixture");
        std::fs::create_dir(&work)?;
        let library = Library::open(&work)?;
        let kit = field("SPARK_BATCH_H1A");
        let prepared = if let Some(tags) = field("SPARK_BATCH_SDK_TAGS") {
            Some(tags)
        } else if let Some(kit) = kit.as_ref() {
            Some(crate::conversion::prepare_sdk_tags(kit, &work.join("sdk").join("prepared"), "batch-fixture", &uuid::Uuid::new_v4().to_string(), |_| {})?)
        } else { None };
        let tools = build::Toolchain {
            invader_directory: field("SPARK_BATCH_INVADER"),
            resource_directory: Some(maps_dir.clone()),
            h1a_directory: kit,
            base_tags_directory: prepared,
        };
        let rule = Rule {
            class: "weap".into(), path: "weapons/pistol/pistol".into(),
            field: "ready-time".into(), value: 1.5,
        };
        let mut input_hashes = vec![];
        for name in ["a10.map", "b30.map"] {
            let original = maps_dir.join(name);
            let (project, inspection) = library.import_map(&original, Some(&maps_dir))?;
            assert_eq!(inspection.header.scenario_type, 0);
            let (row, draft) = prepare(&project, &inspection, &tools, &rule)?;
            input_hashes.push((original, row.source_sha256.clone()));
            println!("Reviewed {name}: {} → {}, input {}", row.before, row.after, row.source_sha256);
            let job = uuid::Uuid::new_v4().to_string();
            let jobs = work.join("jobs");
            let rejected = build::run_batch_map(&draft, &inspection, &tools, &jobs, &job, Arc::new(AtomicBool::new(true)), |_| {});
            assert!(rejected.is_err() && !jobs.join(&job).exists());
            let output = build::run_batch_map(&draft, &inspection, &tools, &jobs, &job, Arc::new(AtomicBool::new(false)), |event| {
                if event.severity == "error" || event.phase == "compile" { println!("{}: {}", event.phase, event.message); }
            })?;
            assert_eq!(output.status, "validated", "{}", output.message);
            let path = output.output.unwrap();
            let hash = output.sha256.unwrap();
            verify_compiled(&path, &rule, &row, &hash)?;
            println!("{name} compiled and independently read back: {hash}");
            check_source(&project)?;
        }
        for (path, expected) in input_hashes { assert_eq!(maps::hash_file(&path)?, expected); }
        Ok(())
    }
}
