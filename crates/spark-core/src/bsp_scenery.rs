//! Optional source scenery for single-BSP donors. No actors or script bindings.
use crate::{
    bsp_assembly::BspAssembly,
    invalid,
    maps::{self, MapInspection},
    safe_relative, Result, SparkError,
};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Placement {
    pub source_id: String,
    pub tag_path: String,
    pub model_path: String,
    pub position: [f32; 3],
    /// Native scenario yaw, pitch, roll in radians.
    pub rotation: [f32; 3],
    pub not_placed: u16,
    pub permutation: i16,
}
fn transformed(mut row: Placement, assembly: &BspAssembly) -> Result<Placement> {
    safe_relative(&row.tag_path)?;
    safe_relative(&row.model_path)?;
    if row.tag_path.len() > 200 || row.not_placed & !0x0f != 0 {
        return invalid(format!(
            "Donor scenery {} uses unsupported placement flags or a long tag path",
            row.source_id
        ));
    }
    if row
        .position
        .iter()
        .chain(&row.rotation)
        .any(|v| !v.is_finite())
    {
        return invalid("Donor scenery has non-finite placement coordinates");
    }
    let angle = assembly.yaw_degrees.to_radians();
    let (s, c) = angle.sin_cos();
    let [x, y, z] = row.position.map(f64::from);
    let position = [
        c * x - s * y + assembly.translation[0],
        s * x + c * y + assembly.translation[1],
        z + assembly.translation[2],
    ];
    if position.iter().any(|v| !v.is_finite() || v.abs() > 2048.) {
        return invalid(format!(
            "Donor scenery {} falls outside the supported world bounds",
            row.source_id
        ));
    }
    row.position = position.map(|v| v as f32);
    row.rotation[0] = ((f64::from(row.rotation[0]) + angle + std::f64::consts::PI)
        .rem_euclid(std::f64::consts::TAU)
        - std::f64::consts::PI) as f32;
    Ok(row)
}
pub(crate) fn plan(assembly: &BspAssembly, donor: &MapInspection) -> Result<Vec<Placement>> {
    if !assembly.include_donor_scenery {
        return Ok(vec![]);
    }
    assembly.validate()?;
    if donor.mesh.parts.len() != 1 || assembly.donor_bsp_index != 0 {
        return invalid("Donor scenery currently requires a single-BSP source map; multi-BSP scenario placements need separate section binding");
    }
    if donor.sha256 != assembly.donor_source.sha256 {
        return invalid("Donor scenery source identity changed");
    }
    let objects: Vec<_> = donor
        .objects
        .iter()
        .filter(|o| o.kind == "Scenery")
        .collect();
    if objects.len() > 512 {
        return invalid("Donor scenery exceeds the 512-placement import budget");
    }
    let parameters = maps::scenery_parameters(&assembly.donor_source.preserved_path, donor)?;
    objects
        .into_iter()
        .map(|o| {
            let tag = o
                .tag_id
                .and_then(|id| donor.tags.iter().find(|t| t.id == id && t.class == "scen"))
                .ok_or_else(|| {
                    SparkError::Invalid(format!("Donor scenery {} has no valid scenery tag", o.id))
                })?;
            let model = tag
                .references
                .iter()
                .find(|r| r.label == "Model")
                .and_then(|r| {
                    donor
                        .tags
                        .iter()
                        .find(|t| t.id == r.target_id && t.class == "mod2")
                })
                .ok_or_else(|| {
                    SparkError::Invalid(format!(
                        "Donor scenery {} has no supported source GBX model",
                        o.id
                    ))
                })?;
            let &(not_placed, permutation) = parameters.get(&o.id).ok_or_else(|| {
                SparkError::Invalid("Missing donor scenery placement settings".into())
            })?;
            transformed(
                Placement {
                    source_id: o.id.clone(),
                    tag_path: tag.path.clone(),
                    model_path: canonical_tag_path(&model.path)?,
                    position: o.position,
                    rotation: o.rotation,
                    not_placed,
                    permutation,
                },
                assembly,
            )
        })
        .collect()
}
fn canonical_tag_path(path: &str) -> Result<String> {
    let value = path.replace('\\', "/");
    if value.starts_with('/') {
        return invalid("A source model path must be relative");
    }
    let value = value
        .split('/')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\\");
    safe_relative(&value)?;
    Ok(value)
}
/// Correct only the SDK's generic model class when the cache identifies the
/// same path as an actual GBX model. This never chooses an alternative asset.
pub(crate) fn model_reference(expected: &str, observed: &str) -> Result<String> {
    let (stem, extension) = observed
        .trim()
        .rsplit_once('.')
        .ok_or_else(|| SparkError::Invalid("SDK scenery has no model reference".into()))?;
    let path = canonical_tag_path(stem)?;
    if !["model", "gbxmodel"].contains(&extension.to_ascii_lowercase().as_str())
        || !path.eq_ignore_ascii_case(&canonical_tag_path(expected)?)
    {
        return invalid(
            "SDK scenery model differs from the source map; choose matching editable donor tags",
        );
    }
    Ok(format!("{path}.gbxmodel"))
}
pub(crate) fn verify_compiled(
    base: &MapInspection,
    compiled: &MapInspection,
    path: &Path,
    rows: &[Placement],
    namespace: &str,
) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let base_count = base.objects.iter().filter(|o| o.kind == "Scenery").count();
    if compiled
        .objects
        .iter()
        .filter(|o| o.kind == "Scenery")
        .count()
        != base_count + rows.len()
    {
        return invalid("Compiled donor scenery count differs from the source-bound plan");
    }
    let parameters = maps::scenery_parameters(path, compiled)?;
    for (index, expected) in rows.iter().enumerate() {
        let id = format!("Scenery-{}", base_count + index);
        let object = compiled
            .objects
            .iter()
            .find(|o| o.id == id)
            .ok_or_else(|| SparkError::Invalid("Compiled donor scenery is missing".into()))?;
        let expected_path = format!("{namespace}\\{}", expected.tag_path.replace('/', "\\"));
        let tag_matches = object
            .tag_id
            .and_then(|id| compiled.tags.iter().find(|t| t.id == id))
            .is_some_and(|t| {
                t.class == "scen"
                    && t.path
                        .replace('/', "\\")
                        .eq_ignore_ascii_case(&expected_path)
            });
        let expected_model = format!("{namespace}\\{}", expected.model_path.replace('/', "\\"));
        let model_matches = object
            .tag_id
            .and_then(|id| compiled.tags.iter().find(|t| t.id == id))
            .and_then(|t| t.references.iter().find(|r| r.label == "Model"))
            .and_then(|r| compiled.tags.iter().find(|t| t.id == r.target_id))
            .is_some_and(|t| {
                t.class == "mod2"
                    && t.path
                        .replace('/', "\\")
                        .eq_ignore_ascii_case(&expected_model)
            });
        let rotation_matches = object
            .rotation
            .iter()
            .zip(expected.rotation)
            .all(|(a, b)| ((a - b).sin().atan2((a - b).cos())).abs() < 0.0001);
        let position_matches = object
            .position
            .iter()
            .zip(expected.position)
            .all(|(a, b)| (a - b).abs() <= 0.0002);
        let settings_match =
            parameters.get(&id) == Some(&(expected.not_placed, expected.permutation));
        let mismatch = if !tag_matches {
            Some("scenery tag")
        } else if !model_matches {
            Some("model tag")
        } else if !rotation_matches {
            Some("rotation")
        } else if !position_matches {
            Some("position")
        } else if !settings_match {
            Some("permutation or placement flags")
        } else {
            None
        };
        if let Some(field) = mismatch {
            return invalid(format!(
                "Compiled donor scenery {} failed {field} readback",
                expected.source_id,
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn assembly() -> BspAssembly {
        serde_json::from_value(serde_json::json!({"schemaVersion":1,"donorProjectId":"00000000-0000-0000-0000-000000000000","donorTitle":"Synthetic donor","donorSource":{"originalPath":"fixture.map","preservedPath":"fixture.map","sha256":"a".repeat(64),"cacheVersion":13,"engine":"synthetic","scenarioPath":"fixture"},"donorTagsDirectory":"fixture-tags","donorBspIndex":0,"translation":[20.,10.,2.],"yawDegrees":90.,"tunnelPoints":[[0.,0.,0.],[10.,0.,0.]],"tunnelWidth":2.,"tunnelHeight":1.6,"tunnelShaderPath":"fixture/metal"})).unwrap()
    }
    fn row() -> Placement {
        Placement {
            source_id: "Scenery-0".into(),
            tag_path: "scenery/fixture".into(),
            model_path: "scenery/fixture".into(),
            position: [2., 3., 4.],
            rotation: [0.25, -0.2, 0.1],
            not_placed: 0b1010,
            permutation: 3,
        }
    }
    #[test]
    fn native_yaw_transform_preserves_pitch_roll_and_placement_settings() {
        let moved = transformed(row(), &assembly()).unwrap();
        assert_eq!(moved.position, [17., 12., 6.]);
        assert!((moved.rotation[0] - (0.25 + std::f32::consts::FRAC_PI_2)).abs() < 0.00001);
        assert_eq!(&moved.rotation[1..], &[-0.2, 0.1]);
        assert_eq!((moved.not_placed, moved.permutation), (0b1010, 3));
    }
    #[test]
    fn old_assembly_serialization_and_fingerprints_keep_their_shape() {
        let plan = assembly();
        assert!(!plan.include_donor_scenery);
        let old = serde_json::to_value(&plan).unwrap();
        assert!(old.get("includeDonorScenery").is_none());
        let mut enabled = plan;
        enabled.include_donor_scenery = true;
        assert_eq!(
            serde_json::to_value(enabled).unwrap()["includeDonorScenery"],
            true
        );
    }
    #[test]
    fn model_class_correction_requires_the_same_source_path() {
        assert_eq!(
            model_reference("scenery\\rocks\\rock", "scenery/rocks/rock.model").unwrap(),
            "scenery\\rocks\\rock.gbxmodel"
        );
        assert!(model_reference("scenery/rocks/rock", "scenery/other.model").is_err());
        assert!(model_reference("scenery/rocks/rock", "scenery/rocks/rock.scenery").is_err());
        assert!(model_reference("scenery/rocks/rock", "//server/rock.model").is_err());
        assert_eq!(
            canonical_tag_path("levels\\test\\scenery\\\\pine\\pine").unwrap(),
            "levels\\test\\scenery\\pine\\pine"
        );
    }
    #[test]
    fn refuses_appearance_flags_invalid_paths_and_out_of_bounds_objects() {
        let mut appearance = row();
        appearance.not_placed = 0x10;
        assert!(transformed(appearance, &assembly()).is_err());
        let mut escape = row();
        escape.tag_path = "../outside".into();
        assert!(transformed(escape, &assembly()).is_err());
        let mut far = row();
        far.position = [0., -2048., 0.];
        assert!(transformed(far, &assembly()).is_err());
    }
}
