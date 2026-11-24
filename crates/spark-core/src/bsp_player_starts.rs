//! Bind native starting locations to their source region in the MCC13 export.
use crate::{
    bsp_assembly::{self, BspAssembly},
    bsp_audio::ListenerTree,
    build::{self, Runner, Toolchain},
    invalid,
    maps::{self, MapInspection, NativeRegionStart, NATIVE_SPAWN_TYPES},
    project::Project,
    Result, SparkError,
};
use std::path::Path;

pub(crate) struct PreparedStarts {
    base: Vec<NativeRegionStart>,
    donor: Vec<NativeRegionStart>,
}

impl PreparedStarts {
    pub(crate) fn from_sources(
        project: &Project,
        base: &MapInspection,
        assembly: &BspAssembly,
        donor: &MapInspection,
    ) -> Result<Self> {
        let source = project
            .source
            .as_ref()
            .ok_or_else(|| SparkError::Invalid("Missing native base source".into()))?;
        let mut base = maps::scenario_region_starts(&source.preserved_path, base)?;
        let mut donor = maps::scenario_region_starts(&assembly.donor_source.preserved_path, donor)?;
        if base.len() + donor.len() > maps::PLAYER_START_LIMIT {
            return invalid(format!(
                "The combined player starts exceed the reviewed native limit of {}",
                maps::PLAYER_START_LIMIT
            ));
        }
        if base
            .iter()
            .chain(&donor)
            .any(|row| !matches!(row.bsp_index, -1 | 0))
        {
            return invalid("A player start does not belong to its single-BSP source");
        }
        for (index, row) in base.iter_mut().enumerate() {
            let id = format!("spawn-{index}");
            if let Some(placement) = project.scene.iter().find(|p| p.id == id) {
                row.position = placement.position;
                row.facing = placement.rotation[0];
            }
        }
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
            row.bsp_index = 1;
        }
        Ok(Self { base, donor })
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
            .filter(|(_, row)| row.bsp_index != 0)
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
        path: &Path,
        map: &MapInspection,
        regional: bool,
        trees: [&ListenerTree; 2],
    ) -> Result<serde_json::Value> {
        let donor = if regional { self.donor.as_slice() } else { &[] };
        let actual = maps::scenario_region_starts(path, map)?;
        if actual.len() != self.base.len() + donor.len() {
            return invalid("Compiled player start count differs from the reviewed target");
        }
        let mut owned = [0usize; 2];
        for (index, (actual, expected)) in
            actual.iter().zip(self.base.iter().chain(donor)).enumerate()
        {
            let bsp = usize::from(index >= self.base.len());
            let expected_bsp = if regional {
                bsp as i16
            } else {
                expected.bsp_index
            };
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
                if !trees[bsp].contains_placement(actual.position) {
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
