//! Semantic edit routing over the existing project model. No renderer-provided
//! offsets, new Halo formats, or inferred cross-edition write permissions.
use crate::{
    invalid,
    maps::{MapInspection, SceneObject},
    project::Project,
    Result,
};
use serde::{Deserialize, Serialize};
pub const MAX_DIRECT_BYTES: u64 = 256 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Preference {
    #[default]
    Automatic,
    DirectCache,
    NativeRebuild,
    WorkingTags,
    QuickForge,
    LiveSession,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Route {
    DirectCache,
    NativeRebuild,
    WorkingTags,
    QuickForge,
    LiveSession,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Intent {
    SetTagNumber {
        tag_id: u32,
        tag_path: String,
        class: String,
        field_key: String,
        before: f64,
        after: f64,
    },
    TransformPlacement {
        object_id: String,
        tag_id: Option<u32>,
        before_position: [f32; 3],
        position: [f32; 3],
        before_rotation: [f32; 3],
        rotation: [f32; 3],
    },
    NativeSourceRevision,
    MoveLiveObject {
        datum: u32,
        tag_datum: u32,
        expected_position: [f32; 3],
        position: [f32; 3],
    },
    GeneratedGeometry,
    StructuralSourceChange {
        category: String,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Cell {
    pub offset: usize,
    pub before: Vec<u8>,
    pub after: Vec<u8>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Analysis {
    pub intents: Vec<Intent>,
    pub cells: Vec<Cell>,
    pub direct_blockers: Vec<String>,
}
/// Read one bounded, identity-checked source for the reviewed direct writer.
/// This is intentionally narrower than general cache inspection.
pub fn read_direct_source(project: &Project) -> Result<Vec<u8>> {
    project.validate()?;
    let source = project
        .source
        .as_ref()
        .ok_or_else(|| crate::SparkError::Invalid("Direct editing requires a source map".into()))?;
    if std::fs::metadata(&source.preserved_path)?.len() > MAX_DIRECT_BYTES {
        return invalid("Direct map copies are limited to 256 MiB; use the matching source workflow for larger maps");
    }
    let (header, bytes, sha) = crate::maps::read_cache_snapshot(&source.preserved_path)?;
    if header.version != 13
        || header.compressed
        || header.extended
        || header.legacy_tag_size_repair
        || header.build.contains("synthetic parser fixture")
        || sha != source.sha256
    {
        return invalid(
            "Cache identity or format no longer matches the reviewed MCC direct writer",
        );
    }
    Ok(bytes)
}
fn same_placement_identity(a: &SceneObject, b: &SceneObject) -> bool {
    a.id == b.id
        && a.tag_id == b.tag_id
        && a.kind == b.kind
        && a.source_offset == b.source_offset
        && a.rotation_offset == b.rotation_offset
        && a.asset_id == b.asset_id
        && a.source_model == b.source_model
}
fn push_float(cells: &mut Vec<Cell>, offset: usize, before: f32, after: f32) {
    if before != after {
        cells.push(Cell {
            offset,
            before: before.to_le_bytes().to_vec(),
            after: after.to_le_bytes().to_vec(),
        });
    }
}
/// This deliberately narrower writer allowlist is independent of the inspector's
/// read schema. Being visible or float-sized does not grant cache write support.
fn scalar_layout(class: &str, key: &str) -> Option<usize> {
    match key {
        "bounding-radius"
            if [
                "weap", "scen", "vehi", "bipd", "eqip", "proj", "mach", "ctrl", "lifi", "garb",
                "ssce",
            ]
            .contains(&class) =>
        {
            Some(4)
        }
        "acceleration-scale"
            if [
                "weap", "scen", "vehi", "bipd", "eqip", "proj", "mach", "ctrl", "lifi", "garb",
                "ssce",
            ]
            .contains(&class) =>
        {
            Some(0x20)
        }
        "ready-time" if class == "weap" => Some(0x338),
        "autoaim-range" if class == "weap" => Some(0x3e8),
        _ => None,
    }
}
pub fn analyze(project: &Project, map: &MapInspection) -> Result<Analysis> {
    project.validate()?;
    crate::project::validate_edits(project, map)?;
    let mut a = Analysis::default();
    if map.header.file_size > MAX_DIRECT_BYTES {
        a.direct_blockers.push("Direct map copies are limited to 256 MiB; larger caches require a verified source workflow.".into());
    }
    if map.header.version != 13
        || map.header.compressed
        || map.header.extended
        || map.header.legacy_tag_size_repair
    {
        a.direct_blockers.push("Direct writes currently require an unextended, uncompressed MCC Halo 1 cache (13); other editions keep their own read/source routes.".into());
    }
    if project.quick_forge.is_some() {
        a.intents.push(Intent::GeneratedGeometry);
        a.direct_blockers
            .push("Generated geometry requires its native BSP/cache build.".into());
    }
    for (present, category) in [
        (!project.tag_duplicates.is_empty(), "tag duplication"),
        (project.bsp_assembly.is_some(), "BSP assembly"),
        (
            !project.animation_assignments.is_empty(),
            "animation replacement",
        ),
        (!project.powerups.is_empty(), "custom power-ups"),
        (project.firefight.is_some(), "Firefight wave rules"),
        (
            project
                .studio
                .as_ref()
                .and_then(|s| s.engine_machinima.as_ref())
                .is_some_and(|s| s.enabled),
            "engine camera scripts",
        ),
        (
            project
                .conversion_profile
                .as_deref()
                .is_some_and(|s| s != "faithful"),
            "format conversion",
        ),
    ] {
        if present {
            a.intents.push(Intent::StructuralSourceChange {
                category: category.into(),
            });
            a.direct_blockers.push(format!(
                "{category} requires a verified source/build operation."
            ));
        }
    }
    for edit in &project.tag_edits {
        let tag = map
            .tags
            .iter()
            .find(|t| t.id == edit.tag_id)
            .ok_or_else(|| crate::SparkError::Invalid("Tag identity changed".into()))?;
        let field = tag
            .fields
            .iter()
            .find(|f| f.key == edit.field_key)
            .ok_or_else(|| crate::SparkError::Invalid("Field identity changed".into()))?;
        if edit.value.as_f64() == field.value.as_f64() {
            continue;
        }
        let supported = field.kind == "f32"
            && !tag.external
            && tag
                .data_offset
                .zip(scalar_layout(&tag.class, &field.key))
                .is_some_and(|(base, relative)| base.checked_add(relative) == Some(field.offset));
        if !supported {
            a.intents.push(Intent::StructuralSourceChange {
                category: format!("{} · {}", tag.path, field.key),
            });
            a.direct_blockers.push(format!("{}: {} is outside the reviewed cache writer. References need dependency/asset compatibility review; a readable field alone is insufficient.",tag.path,field.key));
            continue;
        }
        let before = field
            .value
            .as_f64()
            .ok_or_else(|| crate::SparkError::Invalid("Native scalar is not numeric".into()))?;
        let after = edit
            .value
            .as_f64()
            .ok_or_else(|| crate::SparkError::Invalid("Requested scalar is not numeric".into()))?;
        if !before.is_finite() || !(after as f32).is_finite() {
            return invalid("Cache scalar must be finite in its native float32 representation");
        }
        a.intents.push(Intent::SetTagNumber {
            tag_id: tag.id,
            tag_path: tag.path.clone(),
            class: tag.class.clone(),
            field_key: field.key.clone(),
            before,
            after: after as f32 as f64,
        });
        push_float(&mut a.cells, field.offset, before as f32, after as f32);
    }
    if project.scene.len() != map.objects.len() {
        a.intents.push(Intent::StructuralSourceChange {
            category: "scenario array changes".into(),
        });
        a.direct_blockers.push("Adding/removing scenario entries changes native arrays and cannot use the fixed-cell writer.".into());
    }
    for object in &project.scene {
        let Some(old) = map.objects.iter().find(|o| o.id == object.id) else {
            a.direct_blockers.push("New placements and imported preview assets require scenario/native import support.".into());
            continue;
        };
        if !same_placement_identity(object, old) || object.scale != old.scale {
            a.intents.push(Intent::StructuralSourceChange {
                category: format!("{} placement identity, model or scale", old.name),
            });
            a.direct_blockers.push(format!("{} changes placement identity, model or scale; these are not native fixed-cell transforms.",old.name));
            continue;
        }
        if object.position == old.position && object.rotation == old.rotation {
            continue;
        }
        if !["Scenery", "Vehicle", "Player spawn", "Netgame item"].contains(&old.kind.as_str())
            || old.source_offset.is_none()
            || old.rotation_offset.is_none()
        {
            a.direct_blockers.push(format!(
                "{} has no reviewed persistent placement transform.",
                old.name
            ));
            continue;
        }
        let yaw_only = matches!(old.kind.as_str(), "Player spawn" | "Netgame item");
        if yaw_only
            && (object.rotation[1] != old.rotation[1] || object.rotation[2] != old.rotation[2])
        {
            a.direct_blockers
                .push("This placement supports yaw only.".into());
            continue;
        }
        a.intents.push(Intent::TransformPlacement {
            object_id: object.id.clone(),
            tag_id: old.tag_id,
            before_position: old.position,
            position: object.position,
            before_rotation: old.rotation,
            rotation: object.rotation,
        });
        for i in 0..3 {
            push_float(
                &mut a.cells,
                old.source_offset.unwrap() + i * 4,
                old.position[i],
                object.position[i],
            );
        }
        for i in 0..if yaw_only { 1 } else { 3 } {
            push_float(
                &mut a.cells,
                old.rotation_offset.unwrap() + i * 4,
                old.rotation[i],
                object.rotation[i],
            );
        }
    }
    a.cells.sort_by_key(|c| c.offset);
    for cells in a.cells.windows(2) {
        if cells[0].offset + cells[0].before.len() > cells[1].offset {
            return invalid("Native edit cells overlap; the source layout cannot be certified");
        }
    }
    Ok(a)
}
pub fn apply(bytes: &[u8], cells: &[Cell]) -> Result<Vec<u8>> {
    validate_cells(bytes, cells)?;
    let mut output = bytes.to_vec();
    for cell in cells {
        output[cell.offset..cell.offset + 4].copy_from_slice(&cell.after);
    }
    Ok(output)
}
fn validate_cells(bytes: &[u8], cells: &[Cell]) -> Result<()> {
    let mut end_of_previous = 2048;
    for cell in cells {
        if cell.before.len() != 4 || cell.after.len() != 4 || cell.offset < end_of_previous {
            return invalid("Only ordered, disjoint four-byte tag/scenario cells may be patched");
        }
        let end = cell
            .offset
            .checked_add(4)
            .ok_or_else(|| crate::SparkError::Invalid("Cache cell overflow".into()))?;
        if bytes.get(cell.offset..end) != Some(cell.before.as_slice()) {
            return invalid("Cache cell no longer matches its planned original bytes");
        }
        end_of_previous = end;
    }
    Ok(())
}
/// Check every byte, including opaque structures. Only the reviewed MCC header
/// checksum cell may additionally differ after the pinned native CRC utility.
pub fn verify_footprint(before: &[u8], after: &[u8], cells: &[Cell]) -> Result<usize> {
    if before.len() != after.len() {
        return invalid("Direct editing changed the cache size");
    }
    validate_cells(before, cells)?;
    let (mut changed, mut cell_index) = (0, 0);
    for i in 0..before.len() {
        if (0x64..0x68).contains(&i) {
            continue;
        }
        while cell_index < cells.len() && i >= cells[cell_index].offset + 4 {
            cell_index += 1;
        }
        let expected = if cell_index < cells.len() && i >= cells[cell_index].offset {
            cells[cell_index].after[i - cells[cell_index].offset]
        } else {
            before[i]
        };
        if after[i] != expected {
            return invalid(format!(
                "Unexpected native byte change at 0x{i:X}; candidate retained, not published"
            ));
        }
        if before[i] != after[i] {
            changed += 1;
        }
    }
    Ok(changed)
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Choice {
    pub route: Route,
    pub available: bool,
    pub reason: String,
    pub tools: Vec<String>,
}
pub fn choose(preference: Preference, choices: &[Choice]) -> Result<Route> {
    let desired = match preference {
        Preference::Automatic => None,
        Preference::DirectCache => Some(Route::DirectCache),
        Preference::NativeRebuild => Some(Route::NativeRebuild),
        Preference::WorkingTags => Some(Route::WorkingTags),
        Preference::QuickForge => Some(Route::QuickForge),
        Preference::LiveSession => Some(Route::LiveSession),
    };
    choices.iter().find(|c|c.available&&desired.is_none_or(|d|d==c.route)).map(|c|c.route).ok_or_else(||crate::SparkError::Invalid("No verified route is available for this edit and exact runtime; manual preference cannot override a hard gate".into()))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn changed_expected_bytes_and_opaque_writes_are_rejected() {
        let mut bytes = vec![0; 4096];
        bytes[2052..2056].copy_from_slice(&1f32.to_le_bytes());
        let cells = vec![Cell {
            offset: 2052,
            before: 1f32.to_le_bytes().to_vec(),
            after: 2f32.to_le_bytes().to_vec(),
        }];
        let mut output = apply(&bytes, &cells).unwrap();
        output[0x64] = 123;
        assert!(verify_footprint(&bytes, &output, &cells).is_ok());
        output[3000] = 1;
        assert!(verify_footprint(&bytes, &output, &cells).is_err());
        bytes[2052] = 9;
        assert!(apply(&bytes, &cells).is_err());
    }
    #[test]
    fn readable_fields_and_manual_preferences_do_not_grant_writes() {
        assert_eq!(scalar_layout("weap", "bounding-radius"), Some(4));
        assert_eq!(scalar_layout("vehi", "ready-time"), None);
        assert_eq!(scalar_layout("weap", "ref-40"), None);
        let choices = vec![
            Choice {
                route: Route::DirectCache,
                available: false,
                reason: "unsupported edition".into(),
                tools: vec![],
            },
            Choice {
                route: Route::NativeRebuild,
                available: true,
                reason: String::new(),
                tools: vec![],
            },
        ];
        assert_eq!(
            choose(Preference::Automatic, &choices).unwrap(),
            Route::NativeRebuild
        );
        assert!(choose(Preference::DirectCache, &choices).is_err());
    }
}
