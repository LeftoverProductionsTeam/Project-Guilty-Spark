//! Bind native starting locations to their source region in the MCC13 export.
use crate::{
    bsp_assembly::{self, BspAssembly},
    bsp_audio::PlacementRegions,
    bsp_netgame_flags::MergedTeleporterDonor,
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
        relocate_starts(&mut donor, assembly.translation, assembly.yaw_degrees, donor_bsp)?;
        Ok(Self { base, donor, base_bsp_count })
    }

    pub(crate) fn restore_merged(
        path: &Path, map: &MapInspection, donors: &[MergedTeleporterDonor<'_>],
        destination_bsp: usize, limit: usize,
    ) -> Result<Self> {
        let base_bsp_count = map.mesh.parts.len();
        if map.header.version != 13 || map.header.scenario_type != 1 || destination_bsp >= base_bsp_count {
            return invalid("Select a native MCC13 multiplayer BSP to restore stock player starts");
        }
        let bsp = destination_bsp as i16;
        let base = maps::scenario_region_starts(path, map)?;
        let mut matched = vec![false; base.len()];
        let mut donor = Vec::new();
        for source in donors {
            if source.map.header.version != 609 || source.map.header.scenario_type != 1 || source.map.mesh.parts.len() != 1
                || maps::hash_file(source.path)? != source.map.sha256
            {
                return invalid("Stock starts require each exact single-BSP CE609 source");
            }
            let mut rows = maps::scenario_region_starts(source.path, source.map)?;
            if rows.iter().any(|row| !matches!(row.bsp_index, -1 | 0)) {
                return invalid("A stock player start has an invalid BSP binding");
            }
            relocate_starts(&mut rows, source.translation, source.yaw, bsp)?;
            for row in rows {
                if let Some(index) = base.iter().enumerate().position(|(index, old)| {
                    !matched[index] && old.bsp_index == bsp && same_start(old, &row)
                }) {
                    matched[index] = true;
                } else {
                    donor.push(row);
                }
            }
        }
        if base.len() + donor.len() > limit {
            return invalid(format!("Stock player starts exceed the reviewed {limit} slots"));
        }
        let (_, regions) = crate::bsp_audio::inspect_placement_regions(path, &map.sha256, donor.iter().map(|row| row.position))?;
        if let Some(row) = donor.iter().find(|row| !regions.contains(destination_bsp, row.position)) {
            return invalid(format!("Stock start at {:?} has no playable home in BSP {bsp}", row.position));
        }
        Ok(Self { base, donor, base_bsp_count })
    }

    pub(crate) fn generated_terrain_issues(&self, geometry: &bsp_assembly::AssemblyGeometry) -> Result<Vec<bsp_assembly::TerrainStartIssue>> {
        let terrain: Vec<_> = geometry.mesh.indices.chunks_exact(3).zip(&geometry.triangle_materials)
            .filter(|(_, slot)| {
                let material = &geometry.materials[**slot];
                material.name.starts_with("gster") && material.shader_path.is_some() && !material.collision_only
            })
            .flat_map(|(indices, _)| indices.iter().copied()).collect();
        if terrain.is_empty() { return Ok(Vec::new()); }
        let checker = crate::bsp_clearance::RouteChecker::for_indices(&geometry.mesh, &terrain)?;
        Ok([(false, &self.base), (true, &self.donor)].into_iter().flat_map(|(imported, rows)| {
            rows.iter().enumerate().filter_map({
                let checker = &checker;
                move |(index, row)| checker.terrain_above_start(row.position).map(|floor_height| {
                    bsp_assembly::TerrainStartIssue { index, imported, position: row.position, floor_height }
                })
            })
        }).collect())
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
            if actual.bsp_index != expected_bsp || !same_start(actual, expected) {
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

fn relocate_starts(rows: &mut [NativeRegionStart], translation: [f64; 3], yaw: f64, bsp: i16) -> Result<()> {
    for row in rows {
        if row.spawn_types.iter().any(|&entry| NATIVE_SPAWN_TYPES.get(entry as usize).copied().flatten().is_none()) {
            return invalid("A donor player start has an unsupported native game type");
        }
        let position = bsp_assembly::transform(row.position.map(f64::from), translation, yaw);
        if position.iter().any(|v| !v.is_finite() || v.abs() > 2048.) {
            return invalid("A donor player start exceeds the supported world bounds");
        }
        row.position = position.map(|v| v as f32);
        row.facing = bsp_assembly::transform_facing(row.facing, yaw);
        row.bsp_index = bsp;
    }
    Ok(())
}

fn same_start(a: &NativeRegionStart, b: &NativeRegionStart) -> bool {
    let yaw = a.facing - b.facing;
    a.team_index == b.team_index && a.spawn_types == b.spawn_types
        && a.position.iter().zip(b.position).all(|(x, y)| (*x - y).abs() <= 0.0002)
        && yaw.sin().atan2(yaw.cos()).abs() <= 0.00002
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

#[test]
#[ignore = "Requires verified stock maps, the reviewed assembly recipe and a disposable extracted tag tree"]
fn restore_merged_native_stock_gameplay() -> Result<()> {
    let input = |key| std::env::var_os(key).map(std::path::PathBuf::from)
        .ok_or_else(|| SparkError::Invalid(format!("Missing native fixture input {key}")));
    let path = input("SPARK_RESTOCK_PARENT")?;
    let stocks = input("SPARK_RESTOCK_STOCK")?;
    let root = input("SPARK_RESTOCK_WORKSPACE")?;
    let recipe: serde_json::Value = serde_json::from_slice(&std::fs::read(input("SPARK_RESTOCK_RECIPE")?)?)?;
    let map = maps::inspect_map(&path, None)?;
    assert_eq!(map.sha256, "33d253731ede4bdc1e7c304af31ae50fa042081368b0116e6693eaff8115b156");
    let originals = recipe["recipe"]["inheritedConnections"].as_array().expect("reviewed world connections");
    let mut stock_regions = Vec::new();
    let mut worlds = 1;
    for connection in originals.iter().chain(std::iter::once(&recipe["recipe"]["plan"])) {
        let mut source: crate::project::Source = serde_json::from_value(connection["donorSource"].clone())?;
        let name = source.original_path.file_name().expect("reviewed stock name");
        source.preserved_path = stocks.join(name);
        source.resource_directory = Some(stocks.clone());
        let inspection = maps::inspect_map(&source.preserved_path, Some(&stocks))?;
        assert_eq!(inspection.sha256, source.sha256);
        let separate = connection["separateNativeBsps"] == true;
        let intact = connection["preserveDonorBsp"] == true;
        let destination = if separate { worlds + usize::from(intact) } else { 0 };
        if separate { worlds = destination + 1; }
        stock_regions.push(crate::bsp_pickups::StockRegion {
            source, map: inspection, translation: serde_json::from_value(connection["translation"].clone())?,
            yaw: connection["yawDegrees"].as_f64().expect("reviewed yaw"), destination, restore_pickups: !separate,
        });
    }
    assert_eq!((stock_regions.len(), worlds), (18, 13));
    let donors = stock_regions.iter().filter(|region| region.restore_pickups).map(|region| MergedTeleporterDonor {
        path: &region.source.preserved_path, map: &region.map, translation: region.translation, yaw: region.yaw,
    }).collect::<Vec<_>>();
    assert_eq!(donors.len(), 11);
    let staged = PreparedStarts::restore_merged(&path, &map, &donors, 0, 1536)?;
    assert_eq!((staged.base.len(), staged.donor.len()), (568, 739));
    assert!(PreparedStarts::restore_merged(&path, &map, &donors, 0, 1024).is_err());
    let cancel = std::sync::atomic::AtomicBool::new(false);
    let runner = Runner { id: "stock-placements", project: "reviewed-megaworld", cancel: &cancel, event: &|event| {
        if event.severity == "error" || event.phase == "restore-stock-gameplay" || event.message.trim_start().starts_with("Tag space:") { eprintln!("{}", event.message); }
    }};
    let tools = Toolchain { invader_directory: Some(input("SPARK_RESTOCK_INVADER")?), ..Default::default() };
    staged.append(&map.scenario_path, &tools, &runner, &root)?;
    let inventory = crate::bsp_pickups::StockInventory::stage(&path, &map, &stock_regions, 1024, &tools, &runner, &root)?;
    let output = root.join("restored-stock");
    std::fs::create_dir(&output)?;
    let args = ["-t".into(), "tags".into(), "-g".into(), "mcc-cea".into(), "-T".into(), "67108864".into(),
        "-m".into(), "restored-stock".into(), "--resource-usage".into(), "none".into(), map.scenario_path.clone()];
    let tool = build::tool_path(&tools, "invader-build").expect("native compiler");
    runner.run(&tool, &args, &root, "compile-stock-starts", 80)?;
    let cache = output.join("gsmegaroad.map");
    let rebuilt = maps::inspect_map(&cache, None)?;
    assert_eq!((rebuilt.header.version, rebuilt.header.scenario_type, rebuilt.scenario_path.as_str()), (13, 1, map.scenario_path.as_str()));
    let actual = maps::scenario_region_starts(&cache, &rebuilt)?;
    let (_, regions) = crate::bsp_audio::inspect_placement_regions(&cache, &rebuilt.sha256, actual.iter().map(|row| row.position))?;
    let report = staged.verify(&actual, true, &regions)?;
    let gameplay = inventory.verify(&cache, &rebuilt)?;
    assert_eq!((gameplay["pickups"].as_u64(), gameplay["vehicles"].as_u64()), (Some(975), Some(227)));
    assert!(PreparedStarts::restore_merged(&cache, &rebuilt, &donors, 0, 1536)?.donor.is_empty());
    let original_flags = maps::scenario_netgame_flags(&path, &map)?;
    assert_eq!(serde_json::to_value(original_flags)?, serde_json::to_value(maps::scenario_netgame_flags(&cache, &rebuilt)?)?);
    let switches = maps::scenario_bsp_transitions(&path, &map)?;
    let restored_switches = maps::scenario_bsp_transitions(&cache, &rebuilt)?;
    assert_eq!(switches.bsp_tag_paths, restored_switches.bsp_tag_paths);
    assert_eq!(switches.transitions, restored_switches.transitions);
    assert_eq!(map.mesh.positions, rebuilt.mesh.positions);
    assert_eq!(map.mesh.indices, rebuilt.mesh.indices);
    assert_eq!(maps::hash_file(&path)?, map.sha256);
    let tool = build::tool_path(&tools, "invader-info").expect("native validator");
    for key in ["crc32_mismatched", "stub_count", "is_protected"] {
        assert_eq!(runner.run(&tool, &["-T".into(), key.into(), "restored-stock/gsmegaroad.map".into()],
            &root, "validate-stock-starts", 90)?.trim(), "0");
    }
    println!("{}", serde_json::json!({"nativeStarts":report, "stockGameplay":gameplay, "parentSha256":map.sha256,"cacheSha256":rebuilt.sha256}));
    Ok(())
}
