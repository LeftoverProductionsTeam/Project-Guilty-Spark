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

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all="camelCase")]
pub(crate) struct PreparedFlags {
    base: Vec<NativeNetgameFlag>,
    donor: Vec<NativeNetgameFlag>,
    original_teleporter_homes: Vec<Option<usize>>,
    merged_home: Option<usize>,
}

fn teleporter_side(kind: u16) -> Option<usize> {
    match kind {
        6 => Some(0),
        7 => Some(1),
        _ => None,
    }
}

fn exclusive_teleporter_home(regions: &crate::bsp_audio::PlacementRegions, position: [f32; 3]) -> Result<usize> {
    regions.unique_slot(position)
        .ok_or_else(|| SparkError::Invalid("A teleporter needs an unambiguous native home outside the overlap".into()))
}

fn teleporter_homes(path:&Path, map:&MapInspection, flags:&[NativeNetgameFlag]) -> Result<Vec<Option<usize>>> {
    if map.mesh.parts.len()==1 {
        return Ok(flags.iter().map(|row|teleporter_side(row.kind).map(|_|0)).collect());
    }
    let positions=flags.iter().filter(|row|teleporter_side(row.kind).is_some()).map(|row|row.position);
    let (_,regions)=crate::bsp_audio::inspect_placement_regions(path,&map.sha256,positions)?;
    flags.iter().map(|row| if teleporter_side(row.kind).is_some(){exclusive_teleporter_home(&regions,row.position).map(Some)}else{Ok(None)}).collect()
}

impl PreparedFlags {
    pub(crate) fn base_count(&self) -> usize { self.base.len() }

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
        let original_teleporter_homes=teleporter_homes(&base_source.preserved_path,base_map,&base)?;
        Ok(Self { base, donor, original_teleporter_homes, merged_home:None })
    }


    /// The single-BSP assembly path must preserve donor teleporters even when
    /// it keeps other original game-mode flags from the destination scenario.
    pub(crate) fn from_merged_teleporters(
        base_path: &Path, base_map: &MapInspection, destination_bsp: usize,
        donor_path: &Path, donor_map: &MapInspection, translation: [f64; 3], yaw: f64,
        cache_version: u32,
    ) -> Result<Self> {
        if destination_bsp >= base_map.mesh.parts.len() {
            return invalid("Select the native BSP which owns the restored teleporters");
        }
        let base = maps::scenario_netgame_flags(base_path, base_map)?;
        let original_teleporter_homes = teleporter_homes(base_path, base_map, &base)?;
        let mut donor_channels: BTreeMap<i16, Vec<NativeNetgameFlag>> = BTreeMap::new();
        for mut flag in maps::scenario_netgame_flags(donor_path, donor_map)? {
            if teleporter_side(flag.kind).is_none() { continue; }
            if flag.usage_id < 0 || flag.weapon_group.is_some() {
                return invalid("A donor teleporter has an invalid channel or unsupported item binding");
            }
            let moved = bsp_assembly::transform(flag.position.map(f64::from), translation, yaw);
            if moved.iter().any(|v| !v.is_finite() || v.abs() > 2048.) {
                return invalid("A donor teleporter moves outside the compiled world bounds");
            }
            flag.position = moved.map(|v| v as f32);
            flag.facing = bsp_assembly::transform_facing(flag.facing, yaw);
            donor_channels.entry(flag.usage_id).or_default().push(flag);
        }
        let mut used: std::collections::BTreeSet<_> = base.iter().zip(&original_teleporter_homes)
            .filter(|(_, home)| **home == Some(destination_bsp)).map(|(row, _)| row.usage_id).collect();
        let mut donor = Vec::new();
        for (stock_channel, rows) in donor_channels {
            let exits = rows.iter().filter(|row| row.kind == 7).count();
            if exits != 1 || rows.len() < 2 {
                return invalid(format!("Donor channel {stock_channel} needs at least one entrance and exactly one exit"));
            }
            let installed = rows.iter().filter_map(|row| base.iter().zip(&original_teleporter_homes)
                .find(|(known, home)| **home == Some(destination_bsp) && known.kind == row.kind
                    && crate::native_operations::positions_close(known.position, row.position)))
                .map(|(row, _)| row.usage_id).collect::<Vec<_>>();
            if !installed.is_empty() {
                if installed.len() == rows.len() && installed.iter().all(|id| *id == installed[0]) { continue; }
                return invalid(format!("Donor channel {stock_channel} partially overlaps existing teleporter markers; review those placements before importing"));
            }
            let channel = if !used.contains(&stock_channel) { stock_channel } else {
                (0..=i16::MAX).find(|id| !used.contains(id))
                    .ok_or_else(|| SparkError::Invalid("No unused native teleporter channel remains".into()))?
            };
            used.insert(channel);
            donor.extend(rows.into_iter().map(|mut row| { row.usage_id=channel; row }));
        }
        let limit=if cache_version==13 { maps::MCC13_REGIONAL_FLAG_LIMIT } else { maps::CLASSIC_NETGAME_FLAG_LIMIT };
        if base.len()+donor.len()>limit {
            return invalid(format!("Combined teleporter markers exceed this target’s {limit} multiplayer flag slots"));
        }
        Ok(Self { base, donor, original_teleporter_homes, merged_home: Some(destination_bsp) })
    }

    pub(crate) fn added(&self) -> usize { self.donor.len() }

    pub(crate) fn verify_merged(&self, output: &Path, map: &MapInspection) -> Result<serde_json::Value> {
        let rows=maps::scenario_netgame_flags(output,map)?;
        let (_, regions)=crate::bsp_audio::inspect_placement_regions(output, &map.sha256,
            rows.iter().filter(|flag|teleporter_side(flag.kind).is_some()).map(|flag|flag.position))?;
        self.verify(&rows,true,&regions)
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
            let (tag_path,phase) = if self.merged_home.is_some() {
                (workspace.join("tags").to_string_lossy().into_owned(),"bsp-teleporter-source")
            } else { ("tags".into(),"asset-placement") };
            let mut args = vec!["-t".into(), tag_path];
            args.extend(fields);
            args.push(format!("{scenario}.scenario"));
            runner.run(&edit, &args, workspace, phase, 74)
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
        actual: &[NativeNetgameFlag],
        regional: bool,
        regions: &crate::bsp_audio::PlacementRegions,
    ) -> Result<serde_json::Value> {
        let donor = if regional { self.donor.as_slice() } else { &[] };
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
                } else if let Some(home)=self.merged_home { home }
                else { regions.len().checked_sub(1).ok_or_else(|| SparkError::Invalid("Missing donor teleporter BSP".into()))? };
                if row.usage_id < 0 || exclusive_teleporter_home(regions, row.position)? != expected_bsp {
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
            "requiresVerifiedRegionalRuntime": regional && regions.len()>1 && !donor.is_empty()
        }))
    }
}

pub(crate) fn verify_merged_manifest(manifest:&serde_json::Value, output:&Path, map:&MapInspection) -> Result<Option<serde_json::Value>> {
    let Some(source)=manifest.get("mergedNetgameFlags").filter(|row|!row.is_null()) else { return Ok(None) };
    serde_json::from_value::<PreparedFlags>(source.clone())?.verify_merged(output,map).map(Some)
}


#[cfg(test)]
#[test]
#[ignore = "Requires the retained nineteen-region map and legally installed original Sidewinder"]
fn restore_stock_sidewinder_teleporters_in_merged_bsp() {
    let env_path=|key|std::path::PathBuf::from(std::env::var_os(key).unwrap());
    let parent=env_path("SPARK_MERGED_TELEPORT_PARENT");
    let original=env_path("SPARK_MERGED_TELEPORT_STOCK");
    let workspace=env_path("SPARK_MERGED_TELEPORT_WORKSPACE");
    let tags=workspace.join("tags");
    let scenario=tags.join("levels/test/timberland/gsmegaroad.scenario");
    assert!(scenario.is_file(),"Exact extracted scenario is absent at {}",scenario.display());
    let actual=maps::inspect_map(&parent,None).unwrap();
    let stock=maps::inspect_map(&original,original.parent()).unwrap();
    assert_eq!(actual.sha256,"84c955d34ad5869d4119c571aac87ce73a6d244e0ced1c1f5b5f97bd1d930067");
    let placement=[114.02209091186523,9.3280029296875,-17.233085022040342];
    let reviewed=PreparedFlags::from_merged_teleporters(&parent,&actual,0,&original,&stock,placement,0.,13).unwrap();
    assert_eq!(reviewed.added(),12);
    let cancel=std::sync::atomic::AtomicBool::new(false);
    let runner=Runner{id:"merged-teleporter-native",project:"retained-megaworld",cancel:&cancel,event:&|event|{
        if event.phase=="bsp-teleporter-source" || event.severity=="error" { eprintln!("{}",event.message); }
    }};
    let tools=Toolchain{invader_directory:Some(env_path("SPARK_MERGED_TELEPORT_INVADER")), ..Default::default()};
    reviewed.append(&actual.scenario_path,&tools,&runner,&workspace).unwrap();
    let output=workspace.join("restored-native-teleporters");
    std::fs::create_dir(&output).unwrap();
    let args=["-t".into(),tags.to_string_lossy().into_owned(),"-g".into(),"mcc-cea".into(),"-T".into(),"67108864".into(),
        "-m".into(),output.to_string_lossy().into_owned(),"--resource-usage".into(),"none".into(),actual.scenario_path.clone()];
    let compile=build::tool_path(&tools,"invader-build").unwrap();
    runner.run(&compile,&args,&workspace,"compile-cache",80).unwrap();
    let cache=output.join("gsmegaroad.map");
    let retained=maps::inspect_map(&cache,None).unwrap();
    assert_eq!((retained.header.version,retained.header.scenario_type),(13,1));
    let report=reviewed.verify_merged(&cache,&retained).unwrap();
    let before=maps::scenario_bsp_transitions(&parent,&actual).unwrap();
    let after=maps::scenario_bsp_transitions(&cache,&retained).unwrap();
    assert_eq!(before.bsp_tag_paths,after.bsp_tag_paths);
    assert_eq!(serde_json::to_value(&before.transitions).unwrap(),serde_json::to_value(&after.transitions).unwrap());
    assert_eq!(actual.mesh.positions,retained.mesh.positions);
    assert_eq!(actual.mesh.indices,retained.mesh.indices);
    assert_eq!(maps::hash_file(&parent).unwrap(),actual.sha256);
    assert_eq!(maps::hash_file(&original).unwrap(),stock.sha256);
    let info=build::tool_path(&tools,"invader-info").unwrap();
    for key in ["crc32_mismatched","stub_count","is_protected"] {
        assert_eq!(runner.run(&info,&["-T".into(),key.into(),cache.to_string_lossy().into_owned()],&workspace,"validate-cache",90).unwrap().trim(),"0");
    }
    let check=PreparedFlags::from_merged_teleporters(&cache,&retained,0,&original,&stock,placement,0.,13).unwrap();
    assert_eq!(check.added(),0,"The exact stock transform must not re-add restored markers");
    let receipt=serde_json::json!({"baseSha256":actual.sha256,"stockSha256":stock.sha256,"cacheSha256":retained.sha256,
        "report":report,"added":reviewed.donor,"preservedBspCount":after.bsp_count,"preservedSwitchCount":after.transitions.len()});
    println!("{}",receipt);
    std::fs::write(output.join("teleporter-review.json"),serde_json::to_vec_pretty(&receipt).unwrap()).unwrap();
}
