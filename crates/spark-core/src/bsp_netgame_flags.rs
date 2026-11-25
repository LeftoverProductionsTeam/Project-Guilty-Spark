//! Keep exact native scenario flags when compiling the optional regional cache.
use crate::{
    bsp_assembly::{self, BspAssembly},
    build::{self, Runner, Toolchain},
    invalid,
    maps::{self, MapInspection, NativeNetgameFlag},
    project::Source,
    Result, SparkError,
};
use std::{collections::BTreeMap, path::Path};

const FLAG_TYPES: [Option<&str>; 9] = [
    Some("ctf_flag"),
    None,
    Some("oddball_ball_spawn"),
    Some("race_track"),
    Some("race_vehicle"),
    None,
    Some("teleport_from"),
    Some("teleport_to"),
    Some("hill_flag"),
];

pub(crate) struct PreparedFlags {
    base: Vec<NativeNetgameFlag>,
    donor: Vec<NativeNetgameFlag>,
    original_teleporter_homes: Vec<Option<usize>>,
    original_bsp_count: usize,
}

fn teleporter_side(kind: u16) -> Option<usize> {
    match kind {
        6 => Some(0),
        7 => Some(1),
        _ => None,
    }
}

fn exclusive_teleporter_home(trees: &[&crate::bsp_audio::ListenerTree], position: [f32; 3]) -> Result<usize> {
    let mut matches = trees.iter().enumerate().filter(|(_, tree)| tree.contains_placement(position));
    matches.next().filter(|_| matches.next().is_none()).map(|(index, _)| index)
        .ok_or_else(|| SparkError::Invalid("A teleporter needs an unambiguous native home outside the overlap".into()))
}

impl PreparedFlags {
    pub(crate) fn from_sources(
        base_source: &Source,
        base_map: &MapInspection,
        assembly: &BspAssembly,
        donor_map: &MapInspection,
    ) -> Result<Self> {
        let base = maps::scenario_netgame_flags(&base_source.preserved_path, base_map)?;
        let mut donor =
            maps::scenario_netgame_flags(&assembly.donor_source.preserved_path, donor_map)?;
        if base.len() + donor.len() > maps::MCC13_REGIONAL_FLAG_LIMIT {
            return invalid("Combined multiplayer flags exceed the reviewed MCC13 regional limit");
        }
        for row in &mut donor {
            if row.weapon_group.is_some()
                || FLAG_TYPES
                    .get(row.kind as usize)
                    .copied()
                    .flatten()
                    .is_none()
            {
                return invalid("Donor multiplayer flag uses an unsupported marker type or legacy collection binding");
            }
            let position = bsp_assembly::transform(
                row.position.map(f64::from),
                assembly.translation,
                assembly.yaw_degrees,
            );
            if position.iter().any(|v| !v.is_finite() || v.abs() > 2048.) {
                return invalid("Donor multiplayer flag exceeds the supported world bounds");
            }
            row.position = position.map(|v| v as f32);
            row.facing = bsp_assembly::transform_facing(row.facing, assembly.yaw_degrees);
        }
        let original_bsp_count = base_map.mesh.parts.len();
        let original_teleporter_homes = if original_bsp_count == 1 {
            base.iter().map(|row| teleporter_side(row.kind).map(|_| 0)).collect()
        } else {
            let world = crate::bsp_audio::inspect_ambience(&base_source.preserved_path, &base_map.sha256)?;
            let trees = world.bsps.iter().map(|bsp| bsp.listener_tree.as_ref()
                .ok_or_else(|| SparkError::Invalid("Retained BSP collision is unavailable".into())))
                .collect::<Result<Vec<_>>>()?;
            base.iter().map(|row| if teleporter_side(row.kind).is_some() {
                exclusive_teleporter_home(&trees, row.position).map(Some)
            } else { Ok(None) }).collect::<Result<Vec<_>>>()?
        };
        Ok(Self { base, donor, original_teleporter_homes, original_bsp_count })
    }

    pub(crate) fn append(
        &self,
        scenario: &str,
        tools: &Toolchain,
        runner: &Runner,
        workspace: &Path,
    ) -> Result<()> {
        if self.donor.is_empty() {
            return Ok(());
        }
        let edit = build::tool_path(tools, "invader-edit").ok_or_else(|| {
            SparkError::Invalid("invader-edit is required for native multiplayer flags".into())
        })?;
        let run = |fields: Vec<String>| {
            let mut args = vec!["-t".into(), "tags".into()];
            args.extend(fields);
            args.push(format!("{scenario}.scenario"));
            runner.run(&edit, &args, workspace, "asset-placement", 74)
        };
        let count = || {
            run(vec!["-C".into(), "netgame_flags".into()])?
                .parse::<usize>()
                .map_err(|_| {
                    SparkError::Invalid("Native multiplayer flag count is unreadable".into())
                })
        };
        if count()? != self.base.len() {
            return invalid("Staged multiplayer flags differ from the base cache before import");
        }
        run(vec![
            "-I".into(),
            "netgame_flags".into(),
            self.donor.len().to_string(),
            "end".into(),
        ])?;
        for (batch, rows) in self.donor.chunks(16).enumerate() {
            let mut args = vec![];
            for (offset, row) in rows.iter().enumerate() {
                let prefix = format!("netgame_flags[{}]", self.base.len() + batch * 16 + offset);
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
                set("type", FLAG_TYPES[row.kind as usize].unwrap().into());
                set("usage_id", row.usage_id.to_string());
            }
            run(args)?;
        }
        if count()? != self.base.len() + self.donor.len() {
            return invalid("Native writer did not retain the reviewed multiplayer flag count");
        }
        Ok(())
    }

    pub(crate) fn verify(
        &self,
        path: &Path,
        map: &MapInspection,
        regional: bool,
        trees: &[&crate::bsp_audio::ListenerTree],
    ) -> Result<serde_json::Value> {
        let donor = if regional { self.donor.as_slice() } else { &[] };
        let actual = maps::scenario_netgame_flags(path, map)?;
        if actual.len() != self.base.len() + donor.len() {
            return invalid("Compiled multiplayer flag count differs from the reviewed target");
        }
        for (index, (actual, expected)) in
            actual.iter().zip(self.base.iter().chain(donor)).enumerate()
        {
            let yaw = actual.facing - expected.facing;
            if actual.kind != expected.kind
                || actual.usage_id != expected.usage_id
                || actual.weapon_group != expected.weapon_group
                || actual
                    .position
                    .iter()
                    .zip(expected.position)
                    .any(|(a, b)| (*a - b).abs() > 0.0002)
                || yaw.sin().atan2(yaw.cos()).abs() > 0.00002
            {
                return invalid(format!(
                    "Compiled multiplayer flag {index} differs from the reviewed source"
                ));
            }
        }
        let mut pairs = 0;
        if regional && actual.iter().any(|row| teleporter_side(row.kind).is_some()) {
            let mut channels = BTreeMap::new();
            for (index, row) in actual.iter().enumerate() {
                let Some(side) = teleporter_side(row.kind) else {
                    continue;
                };
                let expected_bsp = if index < self.base.len() {
                    self.original_teleporter_homes[index].unwrap()
                } else { self.original_bsp_count };
                if row.usage_id < 0 || exclusive_teleporter_home(trees, row.position)? != expected_bsp {
                    return invalid(format!("Teleporter flag {index} needs an unambiguous native home outside the overlap"));
                }
                channels
                    .entry((expected_bsp, row.usage_id))
                    .or_insert([0usize; 2])[side] += 1;
            }
            if channels
                .values()
                .any(|count| count[0] == 0 || count[1] != 1)
            {
                return invalid(
                    "A regional teleporter channel has no entrance or lacks an unambiguous exit",
                );
            }
            pairs = channels.len();
        }
        Ok(serde_json::json!({
            "count": actual.len(), "donorCount": donor.len(), "regionalTeleporterChannels": pairs,
            "requiresVerifiedRegionalRuntime": regional && !donor.is_empty()
        }))
    }
}
