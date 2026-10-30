//! Reviewed Invader command recipes and comparison of its native field output.
//! This is orchestration, not another native tag parser or tag schema.
use crate::{invalid, safe_relative, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Operation {
    Dependencies,
    BoundingRadius { value: f64 },
    LensFlareScaleRepair,
}
impl Operation {
    pub fn tool_id(&self) -> &'static str {
        match self {
            Self::Dependencies => "invaderDependency",
            Self::BoundingRadius { .. } => "invaderNative",
            Self::LensFlareScaleRepair => "invaderRepair",
        }
    }
    pub fn field(&self) -> Option<&'static str> {
        match self {
            Self::Dependencies => None,
            Self::BoundingRadius { .. } => Some("bounding_radius"),
            Self::LensFlareScaleRepair => Some("rotation_function_scale"),
        }
    }
    pub fn target(&self) -> Option<f64> {
        match self {
            Self::Dependencies => None,
            Self::BoundingRadius { value } => Some(*value),
            Self::LensFlareScaleRepair => Some(0.0),
        }
    }
    pub fn validate(&self, class: &str, tag: &str) -> Result<()> {
        safe_relative(tag)?;
        if tag.starts_with('-') || tag.len() > 240 {
            return invalid("Native tag path is too long or begins with a command option");
        }
        match self {
            Self::BoundingRadius { value } => {
                if ![
                    "weap", "scen", "bipd", "vehi", "eqip", "garb", "proj", "mach", "ctrl", "lifi",
                    "ssce",
                ]
                .contains(&class)
                {
                    return invalid("This reviewed native field edit requires an object tag");
                }
                if !value.is_finite() || *value < 0.0 || *value > 100_000.0 {
                    return invalid(
                        "Bounding radius must be finite and between 0 and 100000 Halo world units",
                    );
                }
            }
            Self::LensFlareScaleRepair if class != "lens" => {
                return invalid("The reviewed lens-flare repair only accepts lens_flare tags")
            }
            _ => {}
        }
        Ok(())
    }
    pub fn arguments(&self, tags: &Path, class: &str, tag: &str) -> Result<Vec<String>> {
        self.validate(class, tag)?;
        let mut args = vec!["-t".into(), tags.to_string_lossy().into_owned()];
        match self {
            Self::Dependencies => args.push("-r".into()),
            Self::BoundingRadius { value } => {
                args.extend(["-S".into(), "bounding_radius".into(), value.to_string()])
            }
            Self::LensFlareScaleRepair => {
                args.extend(["-T".into(), "broken-lens-flare-function-scale".into()])
            }
        }
        args.push(tag.into());
        Ok(args)
    }
}
pub fn number(fields: &str, name: &str) -> Result<f64> {
    let prefix = format!("{name} (");
    let mut lines = fields.lines().filter_map(|l| l.strip_prefix(&prefix));
    let Some(value) = lines
        .next()
        .and_then(|l| l.split_once(')'))
        .and_then(|(n, _)| n.parse::<f64>().ok())
    else {
        return invalid("The reviewed native field was not exposed by Invader");
    };
    if !value.is_finite() || lines.next().is_some() {
        return invalid("The native field is ambiguous or not finite");
    }
    Ok(value)
}
/// This pinned Invader reader displays angle fields in degrees. The documented
/// malformed tag contains 360 radians, not an ordinary 360-degree rotation.
pub fn broken_lens_scale(display_degrees: f64) -> bool {
    display_degrees.is_finite() && (display_degrees - 360.0f64.to_degrees()).abs() <= 0.000001
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FieldDifference {
    pub before: String,
    pub after: String,
}
pub fn reviewed_difference(
    before: &str,
    after: &str,
    operation: &Operation,
) -> Result<Vec<FieldDifference>> {
    let field = operation.field().ok_or_else(|| {
        crate::SparkError::Invalid("Dependency analysis does not edit a field".into())
    })?;
    let old = before.replace("\r\n", "\n");
    let new = after.replace("\r\n", "\n");
    let a: Vec<_> = old.lines().collect();
    let b: Vec<_> = new.lines().collect();
    if a.len() != b.len() {
        return invalid(
            "Native field structure changed unexpectedly; both files are retained for review",
        );
    }
    let differences: Vec<_> = a
        .iter()
        .zip(&b)
        .filter(|(a, b)| a != b)
        .map(|(a, b)| FieldDifference {
            before: (*a).into(),
            after: (*b).into(),
        })
        .collect();
    let prefix = format!("{field} (");
    if differences.len() != 1
        || !differences[0].before.starts_with(&prefix)
        || !differences[0].after.starts_with(&prefix)
    {
        return invalid("The native reader cannot certify exactly the intended exposed field change. No source revision was selected; review the retained candidate in its native editor.");
    }
    let actual = number(after, field)?;
    let expected = operation.target().unwrap();
    if (actual - expected).abs() > 0.000001f64.max(expected.abs() * f64::from(f32::EPSILON) * 2.0) {
        return invalid("The native saved value does not match the requested value");
    }
    if matches!(operation, Operation::LensFlareScaleRepair)
        && !broken_lens_scale(number(before, field)?)
    {
        return invalid("The reviewed repair precondition was not present");
    }
    Ok(differences)
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dependency {
    pub path: String,
    pub reported_broken: bool,
}
pub fn dependency_lines(output: &str) -> Result<Vec<Dependency>> {
    if output.len() > 1024 * 1024 {
        return invalid("Dependency output exceeded the review bound");
    }
    let mut rows = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    for line in output.lines().filter(|l| !l.is_empty()) {
        if rows.len() >= 20_000 {
            return invalid("Dependency output exceeds 20000 native references");
        }
        let (value, broken) = line
            .strip_suffix(" [BROKEN]")
            .map_or((line, false), |v| (v, true));
        let path = value.replace('\\', "/");
        safe_relative(&path)?;
        if !path.rsplit('/').next().is_some_and(|n| n.contains('.')) || path.starts_with('-') {
            return invalid(
                "Unexpected native dependency output; it was not accepted as a complete analysis",
            );
        }
        if !seen.insert(path.to_ascii_lowercase()) {
            return invalid("Duplicate/case-colliding native dependency output needs review");
        }
        rows.push(Dependency {
            path,
            reported_broken: broken,
        });
    }
    Ok(rows)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lens_repair_distinguishes_raw_radians_from_reader_degrees() {
        assert!(broken_lens_scale(20626.480625));
        assert!(!broken_lens_scale(360.0));
        assert!(!broken_lens_scale(0.0));
        assert!(!broken_lens_scale(f64::NAN));
        assert!(reviewed_difference(
            "rotation_function_scale (20626.480625) angle (float32)\n",
            "rotation_function_scale (0.000000) angle (float32)\n",
            &Operation::LensFlareScaleRepair
        )
        .is_ok());
        assert!(reviewed_difference(
            "rotation_function_scale (360.000000) angle (float32)\n",
            "rotation_function_scale (0.000000) angle (float32)\n",
            &Operation::LensFlareScaleRepair
        )
        .is_err());
    }
    #[test]
    fn recipes_cannot_select_broad_repairs_or_accept_foreign_fields() {
        let p = Path::new("owned-tags");
        assert!(Operation::LensFlareScaleRepair
            .arguments(p, "weap", "weapons/pistol.weapon")
            .is_err());
        assert!(Operation::Dependencies
            .arguments(p, "weap", "../sdk/pistol.weapon")
            .is_err());
        assert!(Operation::Dependencies
            .arguments(p, "weap", "-b.weapon")
            .is_err());
        for value in [f64::NAN, f64::INFINITY, -1.0, 100001.0] {
            assert!(Operation::BoundingRadius { value }
                .arguments(p, "weap", "pistol.weapon")
                .is_err());
        }
        let args = Operation::LensFlareScaleRepair
            .arguments(p, "lens", "sun.lens_flare")
            .unwrap();
        assert_eq!(
            &args[2..],
            ["-T", "broken-lens-flare-function-scale", "sun.lens_flare"]
        );
    }
    #[test]
    fn native_field_comparison_rejects_adjacent_edits_precision_ambiguity_and_wrong_result() {
        let before = "bounding_radius (0.100000) float32\nacceleration_scale (2) float32\n";
        let good = before.replace("0.100000", "0.350000");
        let op = Operation::BoundingRadius { value: 0.35 };
        assert_eq!(reviewed_difference(before, &good, &op).unwrap().len(), 1);
        assert!(reviewed_difference(before, &good.replace("(2)", "(3)"), &op).is_err());
        assert!(reviewed_difference(before, before, &op).is_err());
        assert!(
            reviewed_difference(before, &good, &Operation::BoundingRadius { value: 0.5 }).is_err()
        );
    }
    #[test]
    fn dependency_success_does_not_hide_broken_paths_or_accept_traversal() {
        let r = dependency_lines("weapons\\pistol\\pistol.gbxmodel\nmissing.bitmap [BROKEN]\n")
            .unwrap();
        assert!(r[1].reported_broken);
        assert_eq!(r[0].path, "weapons/pistol/pistol.gbxmodel");
        assert!(dependency_lines("../secret.bitmap\n").is_err());
        assert!(dependency_lines("a.bitmap\nA.bitmap\n").is_err());
    }
}
