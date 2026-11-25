//! Bind native starting locations to their source region in the MCC13 export.
use crate::{
    bsp_assembly::{self, BspAssembly},
    bsp_audio::PlacementRegions,
    build::{self, Runner, Toolchain},
    invalid,
    maps::{self, MapInspection, NativeRegionStart, NATIVE_SPAWN_TYPES},
    project::Project,
    Result, SparkError,
};
use std::path::Path;

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreparedStarts {
    base: Vec<NativeRegionStart>,
    donor: Vec<NativeRegionStart>,
    base_bsp_count: usize,
}

impl PreparedStarts {
    pub(crate) fn base_count(&self) -> usize { self.base.len() }

    pub(crate) fn from_sources(
        project: &Project,
        base: &MapInspection,
        assembly: &BspAssembly,
        donor: &MapInspection,
        limit: usize,
    ) -> Result<Self> {
        let source = project
            .source
            .as_ref()
            .ok_or_else(|| SparkError::Invalid("Missing native base source".into()))?;
        let base_map_bsp_count = base.mesh.parts.len();
        let mut base = maps::scenario_region_starts(&source.preserved_path, base)?;
        let mut donor = maps::scenario_region_starts(&assembly.donor_source.preserved_path, donor)?;
        if base.len() + donor.len() > limit {
            return invalid(format!("Combined player start count {} exceeds the {limit} slots for the selected target.", base.len() + donor.len()));
        }
        let base_bsp_count = base_map_bsp_count;
        if base.iter().any(|row| !(0..base_bsp_count as i16).contains(&row.bsp_index)
                && !(base_bsp_count == 1 && row.bsp_index == -1))
            || donor.iter().any(|row| !matches!(row.bsp_index, -1 | 0))
        {
            return invalid("A source player start has an invalid native BSP binding");
        }
        for (index, row) in base.iter_mut().enumerate() {
            let id = format!("spawn-{index}");
            if let Some(placement) = project.scene.iter().find(|p| p.id == id) {
                row.position = placement.position;
                row.facing = placement.rotation[0];
            }
        }
        let donor_bsp = if assembly.separate_native_bsps {
            (base_bsp_count + usize::from(assembly.preserve_donor_bsp)) as i16
        } else { 0 };
        for row in &mut donor {
            if row.spawn_types.iter().any(|&entry| {
                NATIVE_SPAWN_TYPES
                    .get(entry as usize)
                    .copied()
                    .flatten()
                    .is_none()
            }) {
                return invalid("A donor player start has an unsupported native game type");
            }
            let position = bsp_assembly::transform(
                row.position.map(f64::from),
                assembly.translation,
                assembly.yaw_degrees,
            );
            if position.iter().any(|v| !v.is_finite() || v.abs() > 2048.) {
                return invalid("A donor player start exceeds the supported world bounds");
            }
            row.position = position.map(|v| v as f32);
            row.facing = bsp_assembly::transform_facing(row.facing, assembly.yaw_degrees);
            row.bsp_index = donor_bsp;
        }
        Ok(Self { base, donor, base_bsp_count })
    }

    pub(crate) fn append(
        &self,
        scenario: &str,
        tools: &Toolchain,
        runner: &Runner,
        workspace: &Path,
    ) -> Result<()> {
        let edit = build::tool_path(tools, "invader-edit").ok_or_else(|| {
            SparkError::Invalid("invader-edit is required to bind regional player starts".into())
        })?;
        let run = |fields: Vec<String>| {
            let mut args = vec!["-t".into(), "tags".into()];
            args.extend(fields);
            args.push(format!("{scenario}.scenario"));
            runner.run(&edit, &args, workspace, "asset-placement", 74)
        };
        let count = || {
            run(vec!["-C".into(), "player_starting_locations".into()])?
                .parse::<usize>()
                .map_err(|_| SparkError::Invalid("Native player start count is unreadable".into()))
        };
        if count()? != self.base.len() {
            return invalid("Editable native player starts differ from the base cache");
        }
        let base_bindings: Vec<_> = self
            .base
            .iter()
            .enumerate()
            .filter(|(_, row)| self.base_bsp_count == 1 && row.bsp_index == -1)
            .flat_map(|(index, _)| {
                [
                    "-S".into(),
                    format!("player_starting_locations[{index}].bsp_index"),
                    "0".into(),
                ]
            })
            .collect();
        if !base_bindings.is_empty() {
            run(base_bindings)?;
        }
        if !self.donor.is_empty() {
            run(vec![
                "-I".into(),
                "player_starting_locations".into(),
                self.donor.len().to_string(),
                "end".into(),
            ])?;
        }
        for (batch, rows) in self.donor.chunks(12).enumerate() {
            let mut args = vec![];
            for (offset, row) in rows.iter().enumerate() {
                let prefix = format!(
                    "player_starting_locations[{}]",
                    self.base.len() + batch * 12 + offset
                );
                let mut set = |field: &str, value: String| {
                    args.extend(["-S".into(), format!("{prefix}.{field}"), value])
                };
                set(
                    "position",
                    row.position
                        .iter()
                        .map(f32::to_string)
                        .collect::<Vec<_>>()
                        .join(","),
                );
                set("facing", row.facing.to_string());
                set("team_index", row.team_index.to_string());
                set("bsp_index", row.bsp_index.to_string());
                for (slot, &code) in row.spawn_types.iter().enumerate() {
                    set(
                        &format!("type_{slot}"),
                        NATIVE_SPAWN_TYPES[code as usize].unwrap().into(),
                    );
                }
            }
            run(args)?;
        }
        if count()? != self.base.len() + self.donor.len() {
            return invalid("Native player start writer did not retain the reviewed count");
        }
        Ok(())
    }

    pub(crate) fn verify(
        &self,
        actual: &[NativeRegionStart],
        regional: bool,
        regions: &PlacementRegions,
    ) -> Result<serde_json::Value> {
        let donor = if regional { self.donor.as_slice() } else { &[] };
        if actual.len() != self.base.len() + donor.len() {
            return invalid("Compiled player start count differs from the reviewed target");
        }
        let mut owned = vec![0usize; regions.len()];
        for (index, (actual, expected)) in
            actual.iter().zip(self.base.iter().chain(donor)).enumerate()
        {
            let expected_bsp = if regional { expected.bsp_index.max(0) } else { expected.bsp_index };
            let yaw = actual.facing - expected.facing;
            if actual.bsp_index != expected_bsp
                || actual.team_index != expected.team_index
                || actual.spawn_types != expected.spawn_types
                || actual
                    .position
                    .iter()
                    .zip(expected.position)
                    .any(|(a, b)| (*a - b).abs() > 0.0002)
                || yaw.sin().atan2(yaw.cos()).abs() > 0.00002
            {
                return invalid(format!(
                    "Compiled player start {index} differs from its reviewed native placement"
                ));
            }
            if regional {
                let bsp = expected_bsp as usize;
                if !regions.contains(bsp, actual.position) {
                    return invalid(format!(
                        "Player start {index} is outside its authored BSP {bsp}"
                    ));
                }
                // The explicit index resolves overlap without moving the marker.
                owned[bsp] += 1;
            }
        }
        Ok(serde_json::json!({
            "count": actual.len(), "donorCount": donor.len(), "explicitBspOwnership": if regional { Some(owned) } else { None }
        }))
    }
}

pub(crate) fn verify_merged_manifest(
    manifest: &serde_json::Value, path: &Path, map: &MapInspection,
) -> Result<Option<serde_json::Value>> {
    let Some(receipt) = manifest.get("mergedPlayerStarts").filter(|value| !value.is_null()) else {
        return Ok(None);
    };
    let planned: PreparedStarts = serde_json::from_value(receipt.clone())?;
    let actual = maps::scenario_region_starts(path, map)?;
    let (_, regions) = crate::bsp_audio::inspect_placement_regions(path, &map.sha256, actual.iter().map(|row| row.position))?;
    planned.verify(&actual, true, &regions).map(Some)
}
