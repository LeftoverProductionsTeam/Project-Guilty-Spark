//! Source-bound multiplayer pickup assembly in writable native staging.
use crate::{
    bsp_assembly::{self, BspAssembly},
    build::{self, Runner, Toolchain},
    invalid,
    maps::{self, MapInspection, NativeItemCollection, NativeNetgamePickup, NATIVE_SPAWN_TYPES},
    native_staging,
    project::{Project, Source},
    reject_links, safe_relative, Result, SparkError,
};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreparedPickups {
    base: Vec<NativeNetgamePickup>,
    moved_base: Vec<usize>,
    donor: Vec<NativeNetgamePickup>,
    aliased_tags: usize,
    shared_tags: usize,
    collections: BTreeMap<String, NativeItemCollection>,
    donor_membership: Vec<bool>,
    #[serde(default)]
    vehicles: Option<crate::bsp_vehicles::PreparedVehicles>,
}

impl PreparedPickups {
    pub(crate) fn total_count(&self) -> usize { self.base.len() + self.donor.len() }

    pub(crate) fn donor_count(&self) -> usize {
        self.donor.len()
    }

    pub(crate) fn dependency_summary(&self) -> serde_json::Value {
        serde_json::json!({"aliasedTags": self.aliased_tags, "sharedTags": self.shared_tags})
    }

    fn verify_inventory(
        &self,
        path: &Path,
        map: &MapInspection,
        actual: &[NativeNetgamePickup],
    ) -> Result<()> {
        if actual.len() != self.base.len() + self.donor.len() {
            return invalid("Compiled scenario changed the reviewed pickup count");
        }
        for (index, (actual, expected)) in actual
            .iter()
            .zip(self.base.iter().chain(&self.donor))
            .enumerate()
        {
            let facing_delta = actual.facing - expected.facing;
            if actual.collection != expected.collection
                || actual.flags != expected.flags
                || actual.spawn_types != expected.spawn_types
                || actual.team_index != expected.team_index
                || actual.spawn_time != expected.spawn_time
                || actual
                    .position
                    .iter()
                    .zip(expected.position)
                    .any(|(a, b)| (*a - b).abs() > 0.0002)
                || facing_delta.sin().atan2(facing_delta.cos()).abs() > 0.00002
            {
                return invalid(format!("Compiled native pickup {index} differs from the reviewed placement or spawn rules"));
            }
        }
        let selected = self.collections.keys().cloned().collect();
        if maps::native_item_collections(path, map, &selected)? != self.collections {
            return invalid(
                "Compiled pickup collections changed ordered items, weights or spawn timing",
            );
        }
        if let Some(vehicles) = &self.vehicles { vehicles.verify(path, map)?; }
        Ok(())
    }

    pub(crate) fn verify(
        &self,
        path: &Path,
        map: &MapInspection,
        actual: &[NativeNetgamePickup],
        regions: &crate::bsp_audio::PlacementRegions,
    ) -> Result<usize> {
        self.verify_inventory(path, map, actual)?;
        let donor_slot = regions.len().checked_sub(1)
            .ok_or_else(|| SparkError::Invalid("Missing compiled pickup region".into()))?;
        for &index in &self.moved_base {
            if regions.unique_slot(actual[index].position).is_none_or(|slot| slot >= donor_slot) {
                return invalid(format!("Moved pickup {} needs a position inside exactly one existing BSP", index + 1));
            }
        }
        if donor_slot > 1 && actual[..self.base.len()].iter().any(|row| regions.contains(donor_slot, row.position)) {
            return invalid("The donor overlaps an existing pickup. Move the shared passage clear of the item.");
        }
        for (index, (row, expected)) in actual[self.base.len()..]
            .iter()
            .zip(&self.donor_membership)
            .enumerate()
        {
            if (0..donor_slot).any(|index| regions.contains(index, row.position))
                || regions.contains(donor_slot, row.position) != *expected
            {
                return invalid(format!(
                    "Donor pickup {index} changed region membership at {:?}",
                    row.position
                ));
            }
        }
        Ok(self
            .donor_membership
            .iter()
            .filter(|&&inside| inside)
            .count())
    }
}

pub(crate) fn verify_merged_manifest(
    manifest: &serde_json::Value, path: &Path, map: &MapInspection,
) -> Result<Option<serde_json::Value>> {
    let Some(receipt) = manifest.get("mergedNetgamePickups").filter(|value| !value.is_null()) else {
        return Ok(None);
    };
    let planned: PreparedPickups = serde_json::from_value(receipt.clone())?;
    let actual = maps::scenario_netgame_pickups(path, map)?;
    planned.verify_inventory(path, map, &actual)?;
    if planned.donor_membership.len() != planned.donor.len()
        || planned.moved_base.iter().any(|&index| index >= planned.base.len())
    {
        return invalid("Merged native pickup receipt has inconsistent placement ownership");
    }
    let verify_positions = planned.moved_base.iter().map(|&i| actual[i].position).chain(
        actual[planned.base.len()..].iter().zip(&planned.donor_membership)
            .filter(|(_, originally_inside)| **originally_inside).map(|(row, _)| row.position),
    );
    let positions = verify_positions.collect::<Vec<_>>();
    let (_, regions) = crate::bsp_audio::inspect_placement_regions(path, &map.sha256, positions.iter().copied())?;
    if positions.iter().any(|&position| regions.unique_slot(position) != Some(0)) {
        return invalid("An imported or moved pickup no longer has a valid home in the merged native BSP");
    }
    Ok(Some(serde_json::json!({ "count": actual.len(), "donorCount": planned.donor_count(),
        "checkedMembership": positions.len(), "donorVehicleCount": planned.vehicles.as_ref().map_or(0, |rows| rows.donor_count()),
        "dependencies": planned.dependency_summary() })))
}


fn reuse_reviewed_recovery(
    source: &Path, staged: &Path, dependencies: &BTreeSet<String>, runner: &Runner,
) -> Result<()> {
    for correction in crate::ce_source_recovery::corrections() {
        if !dependencies.contains(correction.tag) { continue; }
        let original = source.join(safe_relative(correction.tag)?);
        let reviewed = staged.join(safe_relative(correction.tag)?);
        reject_links(&original)?;
        reject_links(&reviewed)?;
        if !reviewed.is_file() || maps::hash_file(&original)? != correction.before_sha256
            || maps::hash_file(&reviewed)? != correction.after_sha256
        {
            continue;
        }
        // The reviewed lens edit is valid only for the same one-image bitmap.
        if correction.tag.ends_with(".lens_flare") {
            let bitmap = source.join(crate::ce_source_recovery::BITMAP);
            reject_links(&bitmap)?;
            if !bitmap.is_file()
                || maps::hash_file(&bitmap)? != crate::ce_source_recovery::BITMAP_SHA
            {
                continue;
            }
        }
        fs::copy(&reviewed, &original)?;
        if maps::hash_file(&original)? != correction.after_sha256 {
            return invalid("The staged donor recovery bytes differ from the acknowledged correction");
        }
        runner.emit("bsp-gameplay-recovery", format!("{}: {}", correction.tag, correction.explanation), 43, "info");
    }
    Ok(())
}

fn isolate_dependencies(
    source: &Source,
    donor: &MapInspection,
    roots: &BTreeSet<String>,
    tools: &Toolchain,
    runner: &Runner,
    workspace: &Path,
    tags: &Path,
) -> Result<(BTreeMap<String, String>, usize)> {
    let tool = |name| {
        build::tool_path(tools, name)
            .ok_or_else(|| SparkError::Invalid(format!("{name} is required for pickup staging")))
    };
    let extracted = workspace.join("pickup-source");
    let resources = source.resource_directory.as_deref();
    crate::tag_exchange::verify_source_snapshot(source, resources)?;
    let info = tool("invader-info")?;
    for field in ["crc32_mismatched", "is_protected"] {
        let result = runner.run(
            &info,
            &[
                "-T".into(),
                field.into(),
                source.preserved_path.to_string_lossy().into_owned(),
            ],
            workspace,
            "bsp-pickup-source",
            40,
        )?;
        if !["0", "false"].contains(&result.trim().to_lowercase().as_str()) {
            return invalid(format!(
                "Donor gameplay extraction stopped at source check {field}: {result}"
            ));
        }
    }
    for tag in &donor.tags {
        maps::validate_cache_tag_path(&tag.path).map_err(|error| {
            SparkError::Invalid(format!("Unsafe donor gameplay extraction tag {} {:?}: {error}", tag.class, tag.path))
        })?;
    }
    fs::create_dir(&extracted)?;
    let mut args = vec!["-t".into(), "pickup-source".into()];
    if let Some(resources) = resources {
        crate::native_resources::review(source, donor, resources)?;
        args.extend(["-m".into(), resources.to_string_lossy().into_owned()]);
    }
    // Direct extraction keeps CE particle references that Invader's recursive
    // reconstruction cannot decode. Only checked reachable tags are imported.
    args.push(source.preserved_path.to_string_lossy().into_owned());
    runner.run(&tool("invader-extract")?, &args, workspace, "extract", 41)?;
    native_staging::inventory(&extracted, runner.cancel)?;
    crate::tag_exchange::verify_source_snapshot(source, resources)?;

    let dependency = tool("invader-dependency")?;
    let closure = |path: &str, tag_root: &str, tree: &Path| {
        let log = runner.run(
            &dependency,
            &["-t".into(), tag_root.into(), "-r".into(), path.into()],
            workspace,
            "bsp-dependencies",
            42,
        )?;
        native_staging::dependency_paths(&log, tree, path)
    };
    let mut bindings = BTreeMap::new();
    let mut dependencies = BTreeSet::new();
    for root in roots {
        let files = closure(root, "pickup-source", &extracted)?;
        dependencies.extend(files.iter().cloned());
        if dependencies.len() > 8192 {
            return invalid("Donor gameplay dependency closure exceeds 8192 native tags");
        }
        bindings.insert(root, files);
    }
    reuse_reviewed_recovery(&extracted, tags, &dependencies, runner)?;
    let working = workspace.join("pickup-aliases");
    fs::create_dir(&working)?;
    let mut candidates = BTreeMap::new();
    for path in &dependencies {
        let relative = safe_relative(path)?;
        let from = extracted.join(&relative);
        let current = tags.join(&relative);
        reject_links(&current)?;
        let expected = current
            .is_file()
            .then(|| maps::hash_file(&current))
            .transpose()?;
        let hash = maps::hash_file(&from)?;
        native_staging::copy_file(
            &from,
            &working.join(&relative),
            fs::metadata(&from)?.len(),
            Some(&hash),
            runner.cancel,
        )?;
        candidates.insert(path.clone(), expected);
    }

    let namespace = format!("gspickup_{}", &runner.id[..8]);
    let refactor = tool("invader-refactor")?;
    let mut aliases = BTreeMap::new();
    // Invader remaps exact references in the isolated donor closure. Any
    // previously identical parent rewritten by a child move must then move
    // itself. Tags left in place still match their staged base bytes exactly.
    loop {
        let mut moves = Vec::new();
        for (path, expected) in &candidates {
            if expected.as_ref() != Some(&maps::hash_file(&working.join(safe_relative(path)?))?) {
                moves.push((path.clone(), format!("{namespace}/{path}")));
            }
        }
        if moves.is_empty() {
            break;
        }
        for batch in moves.chunks(24) {
            let mut args = vec![
                "-t".into(),
                "pickup-aliases".into(),
                "-M".into(),
                "move".into(),
            ];
            for (source, target) in batch {
                args.extend([
                    "-T".into(),
                    source.replace('/', "\\"),
                    target.replace('/', "\\"),
                ]);
            }
            runner.run(&refactor, &args, workspace, "bsp-namespace", 43)?;
        }
        for (from, to) in moves {
            if working.join(safe_relative(&from)?).exists()
                || !working.join(safe_relative(&to)?).is_file()
            {
                return invalid(format!(
                    "Native pickup dependency was not moved to its reviewed namespace: {from}"
                ));
            }
            candidates.remove(&from);
            aliases.insert(from, to);
        }
    }
    for destination in aliases.values() {
        let relative = safe_relative(destination)?;
        let from = working.join(&relative);
        let to = tags.join(relative);
        let hash = maps::hash_file(&from)?;
        native_staging::copy_file(
            &from,
            &to,
            fs::metadata(&from)?.len(),
            Some(&hash),
            runner.cancel,
        )?;
    }
    let remap = |key: &str| {
        aliases
            .get(key)
            .map(String::as_str)
            .unwrap_or(key)
            .to_owned()
    };
    for (root, files) in bindings {
        let expected: BTreeSet<_> = files.iter().map(|path| remap(path)).collect();
        let root = remap(root);
        if closure(&root, "tags", tags)? != expected {
            return invalid(format!(
                "Namespaced donor dependency readback differed for {root}"
            ));
        }
    }
    Ok((aliases, dependencies.len()))
}

pub(crate) fn stage(
    project: &Project,
    base: &MapInspection,
    assembly: &BspAssembly,
    donor: &MapInspection,
    tools: &Toolchain,
    runner: &Runner,
    workspace: &Path,
    tags: &Path,
    cache_version: u32,
) -> Result<PreparedPickups> {
    if donor.mesh.parts.len() != 1 || assembly.donor_bsp_index != 0 {
        return invalid(
            "Pickup import needs a single-BSP donor to associate every native placement",
        );
    }
    let base_source = project.source.as_ref()
        .ok_or_else(|| SparkError::Invalid("Missing pickup base source".into()))?;
    let mut base_rows = maps::scenario_netgame_pickups(&base_source.preserved_path, base)?;
    let moved_base = crate::bsp_compile::apply_expected_pickup_poses(project, base, &mut base_rows)?;
    let mut donor_rows =
        maps::scenario_netgame_pickups(&assembly.donor_source.preserved_path, donor)?;
    let limit = maps::netgame_equipment_limit(cache_version);
    if base_rows.len() + donor_rows.len() > limit {
        return invalid(format!("Combined native pickup count {} exceeds the {limit} slots supported by cache version {cache_version}.", base_rows.len() + donor_rows.len()));
    }
    let base_collections = base_rows.iter().map(|row| row.collection.clone()).collect();
    let mut collections =
        maps::native_item_collections(&base_source.preserved_path, base, &base_collections)?;
    if donor_rows.is_empty() && !donor.objects.iter().any(|row| row.kind == "Vehicle") {
        return Ok(PreparedPickups {
            base: base_rows,
            moved_base,
            donor: donor_rows,
            aliased_tags: 0,
            shared_tags: 0,
            collections,
            donor_membership: vec![],
            vehicles: None,
        });
    }
    let original =
        crate::bsp_audio::inspect_ambience(&assembly.donor_source.preserved_path, &donor.sha256)?;
    let collision = original
        .bsps
        .first()
        .and_then(|bsp| bsp.listener_tree.as_ref())
        .ok_or_else(|| {
            SparkError::Invalid("Original donor pickup collision tree is unavailable".into())
        })?;
    let donor_membership = donor_rows
        .iter()
        .map(|row| collision.contains_placement(row.position))
        .collect();

    for row in &mut donor_rows {
        if row.flags & !1 != 0
            || row.spawn_types.iter().any(|&v| {
                NATIVE_SPAWN_TYPES
                    .get(v as usize)
                    .copied()
                    .flatten()
                    .is_none()
            })
        {
            return invalid("Donor pickup uses an unsupported native flag or game type");
        }
        let translated = bsp_assembly::transform(
            row.position.map(f64::from),
            assembly.translation,
            assembly.yaw_degrees,
        );
        if translated.iter().any(|v| !v.is_finite() || v.abs() > 2048.) {
            return invalid("A donor pickup falls outside the supported world bounds");
        }
        row.position = translated.map(|v| v as f32);
        row.facing = bsp_assembly::transform_facing(row.facing, assembly.yaw_degrees);
    }

    let mut vehicles = crate::bsp_vehicles::PreparedVehicles::from_sources(
        project, base, assembly, donor, cache_version, |position| collision.contains_placement(position),
    )?;
    let roots = donor_rows
        .iter()
        .map(|row| format!("{}.item_collection", row.collection))
        .chain(vehicles.roots())
        .collect();
    let (aliases, total_tags) = isolate_dependencies(
        &assembly.donor_source,
        donor,
        &roots,
        tools,
        runner,
        workspace,
        tags,
    )?;
    let donor_collections = donor_rows
        .iter()
        .map(|row| row.collection.clone())
        .collect();
    for (name, mut contents) in maps::native_item_collections(
        &assembly.donor_source.preserved_path,
        donor,
        &donor_collections,
    )? {
        let original = format!("{name}.item_collection");
        let selected = aliases
            .get(&original)
            .unwrap_or(&original)
            .strip_suffix(".item_collection")
            .unwrap();
        for (_, item) in &mut contents.permutations {
            if let Some(remapped) = aliases.get(item) {
                *item = remapped.clone();
            }
        }
        if collections
            .get(selected)
            .is_some_and(|prior| prior != &contents)
        {
            return invalid(format!(
                "Same-path native collection differs between the reviewed sources: {selected}"
            ));
        }
        collections.insert(selected.into(), contents);
    }
    let edit = build::tool_path(tools, "invader-edit").ok_or_else(|| {
        SparkError::Invalid("invader-edit is required for pickup placement".into())
    })?;
    let run = |fields: Vec<String>| {
        let mut args = vec!["-t".into(), tags.to_string_lossy().into_owned()];
        args.extend(fields);
        args.push(format!("{}.scenario", base.scenario_path));
        runner.run(&edit, &args, workspace, "asset-placement", 61)
    };
    let count = || {
        run(vec!["-C".into(), "netgame_equipment".into()])?
            .parse::<usize>()
            .map_err(|_| SparkError::Invalid("Could not read staged native pickup count".into()))
    };
    if count()? != base_rows.len() {
        return invalid("Staged base pickup count changed. Reconcile editable tags with the source cache before merging");
    }
    if !donor_rows.is_empty() {
        run(vec![
            "-I".into(),
            "netgame_equipment".into(),
            donor_rows.len().to_string(),
            "end".into(),
        ])?;
    }
    for (index, row) in donor_rows.iter_mut().enumerate() {
        let from = format!("{}.item_collection", row.collection);
        let target = aliases.get(&from).map(String::as_str).unwrap_or(&from);
        row.collection = target.strip_suffix(".item_collection").unwrap().into();
        let prefix = format!("netgame_equipment[{}]", base_rows.len() + index);
        let mut args = vec![];
        let mut set = |field: &str, value: String| {
            args.extend(["-S".into(), format!("{prefix}.{field}"), value])
        };
        set("flags.levitate", (row.flags & 1).to_string());
        for (slot, &code) in row.spawn_types.iter().enumerate() {
            set(
                &format!("type_{slot}"),
                NATIVE_SPAWN_TYPES[code as usize].unwrap().into(),
            );
        }
        set("team_index", row.team_index.to_string());
        set("spawn_time", row.spawn_time.to_string());
        set(
            "position",
            row.position
                .iter()
                .map(f32::to_string)
                .collect::<Vec<_>>()
                .join(","),
        );
        set("facing", row.facing.to_string());
        set("item_collection", target.replace('/', "\\"));
        run(args)?;
    }
    if count()? != base_rows.len() + donor_rows.len() {
        return invalid("Native writer did not retain the reviewed pickup count");
    }
    vehicles.append(&aliases, cache_version, run)?;
    Ok(PreparedPickups {
        base: base_rows,
        moved_base,
        donor: donor_rows,
        aliased_tags: aliases.len(),
        shared_tags: total_tags - aliases.len(),
        collections,
        donor_membership,
        vehicles: Some(vehicles),
    })
}
