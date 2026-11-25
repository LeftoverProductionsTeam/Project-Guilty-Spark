//! Native CE609 and MCC13 acceptance for connected CE-authored regions. Reuses the existing
//! native assembly exporter, namespace/dependency checks and collision verifier.
//! It never treats scenario BSP references as streaming.
use crate::{build::{self,JobEvent,Runner,Toolchain},maps::{self,MapInspection},project::{self,Project,BuildRecord},invalid,Result,SparkError};
use std::{fs,path::Path,sync::{Arc,atomic::{AtomicBool,Ordering}},time::Instant};
use crate::runtime::RuntimeId;

#[derive(Clone, Copy)]
struct CacheTarget {
    engine: &'static str,
    version: u32,
    tag_base: u32,
    tag_capacity: u32,
    name: &'static str,
}

const CLASSIC: CacheTarget = CacheTarget {
    engine: "gbx-custom", version: 609, tag_base: 0x4044_0000,
    tag_capacity: 23 * 1024 * 1024, name: "Custom Edition CE609",
};
const MCC: CacheTarget = CacheTarget {
    engine: "mcc-cea", version: 13, tag_base: 0x5000_0000,
    tag_capacity: 64 * 1024 * 1024, name: "MCC Halo 1 cache 13",
};

fn cache_target(project: &Project) -> Option<CacheTarget> {
    project.bsp_assembly.as_ref()?;
    let profile = project.build_targets.iter().find(|t| Some(&t.id) == project.active_build_target.as_ref())?;
    match profile.runtime_id {
        RuntimeId::HaloCustomEdition | RuntimeId::ChupathingyCe => Some(CLASSIC),
        RuntimeId::MccSteam if project.source.as_ref().is_some_and(|source| {
            source.cache_version == 609 || (source.cache_version == 13 && !project.inherited_bsp_connections.is_empty())
        }) => Some(MCC),
        _ => None,
    }
}

pub fn selected(project: &Project) -> bool {
    cache_target(project).is_some()
}

pub fn compatibility(project: &Project, inspection: &MapInspection) -> build::CompatibilityReport {
    let target = cache_target(project).expect("selected connected-region target");
    let blockers = preflight(project, inspection).err().map(|e| vec![e.to_string()]).unwrap_or_default();
    let separate = project.bsp_assembly.as_ref().is_some_and(|plan| plan.separate_native_bsps);
    let mut warnings = vec![if separate {
        "Two native BSPs with paired corridor switches. Independent regional occupancy requires runtime verification.".into()
    } else {
        "One resident BSP. Painted detail requires native preservation support.".into()
    }];
    if separate {
        warnings.push("Review region ambience after rebuilding. Sky, fog and mixed per-cluster assignments need a verified mapping.".into());
    }
    if separate && target.version == CLASSIC.version {
        warnings.push("CE609 retains the base player starts and netgame flags. Choose MCC13 to include the donor starts and teleporters.".into());
    }
    let readers: Vec<_> = RuntimeId::ALL.into_iter()
        .filter(|&id| crate::runtime::supports_map_version(id, target.version))
        .map(RuntimeId::name)
        .collect();
    warnings.push(format!(
        "{} builds have a {} MiB resident tag limit. Declared cache-family readers are {}. The build result reports actual memory use.",
        target.name, target.tag_capacity / (1024 * 1024), readers.join(", "),
    ));
    if target.version == 13 {
        warnings.push("Forerunner can be tested with its native MCC loader. Its current Spark startup contract is CE609 solo only. Check the exact runtime build and map in a private session.".into());
    }
    build::CompatibilityReport {
        target: target.engine.into(),
        pipeline: format!("Authored CE regions → H1A structure and lightmaps → Invader {} → native readback", target.name),
        ready: blockers.is_empty(), blockers, warnings, bitmap_dependencies: None,
    }
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtensionSource {
    schema_version: u32,
    build: BuildRecord,
    #[serde(default)]
    compiled_tag_hashes: Option<std::collections::BTreeMap<String, String>>,
}

/// Check the loose tags sealed by the same native job as the selected map.
pub fn extension_tags(job: &Path, build: &BuildRecord) -> Result<Option<std::path::PathBuf>> {
    use std::io::Read;
    const MAX_RECEIPT_BYTES: u64 = 4 * 1024 * 1024;
    let receipt = job.join("megaworld-receipt.json");
    if !receipt.try_exists()? { return Ok(None); }
    crate::reject_links(&receipt)?;
    let mut bytes = Vec::new();
    fs::File::open(&receipt)?.take(MAX_RECEIPT_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_RECEIPT_BYTES {
        return invalid("Connected-world source receipt exceeds its size limit");
    }
    let source: ExtensionSource = serde_json::from_slice(&bytes)?;
    if source.schema_version != 1 || source.build.id != build.id
        || !matches!(build.target.as_str(), "gbx-custom" | "mcc-cea") || source.build.target != build.target
        || source.build.status != "validated" || build.status != "validated"
        || source.build.sha256.is_none() || source.build.sha256 != build.sha256
        || source.build.project_fingerprint != build.project_fingerprint
    {
        return invalid("Connected-world source receipt differs from the selected validated cache");
    }
    let Some(expected) = source.compiled_tag_hashes else { return Ok(None); };
    let tags = job.join("tags");
    if crate::tool_transaction::inventory(&tags)? != expected {
        return invalid("Connected-world editable tags differ from the native build");
    }
    Ok(Some(tags))
}

pub fn preflight(project:&Project,inspection:&MapInspection)->Result<Toolchain>{
    project.validate()?;
    let cache = cache_target(project).ok_or_else(|| {
        SparkError::Invalid("Select an explicit Custom Edition, Chupathingy or MCC target for the connected regions".into())
    })?;
    let target = crate::forge_build::tools_for_target(project, Default::default())?;
    if target.hek_flavor.as_deref() != Some("h1aEk") {
        return invalid("Connected regions require the reviewed H1A authoring kit and matching editable base tags");
    }
    let plan=project.bsp_assembly.as_ref().ok_or_else(||SparkError::Invalid("Author a connected BSP plan first".into()))?;plan.validate()?;
    let source=project.source.as_ref().ok_or_else(||SparkError::Invalid("Import an original CE map first".into()))?;
    if source.sha256!=inspection.sha256||source.scenario_path!=inspection.scenario_path{return invalid("The base inspection belongs to another source revision");}
    let supported_base = source.cache_version == 609
        || (source.cache_version == 13 && cache.version == 13 && !project.inherited_bsp_connections.is_empty());
    if !supported_base || plan.donor_source.cache_version != 609 || inspection.header.version != source.cache_version
        || inspection.mesh.parts.len() != 1 || inspection.header.scenario_type != 1
    {
        return invalid("Use a single-BSP CE multiplayer base or a reopened compiled MCC13 world with its build tags, and choose a CE donor");
    }
    crate::bsp_compile::base_transforms(project,inspection)?;
    if !project.tag_edits.is_empty()||!project.tag_renames.is_empty()||!project.tag_duplicates.is_empty()||!project.powerups.is_empty()||!project.animation_assignments.is_empty()||!crate::native_audio::fingerprint_inputs(project).is_empty()||project.conversion_profile.is_some(){return invalid("Connected CE builds support original scenario position/rotation edits and validated scenery imports. Tag edits, other structural placement/asset/audio changes and conversion profiles still require their validated native authoring path; nothing is silently omitted");}
    let tools=Toolchain{h1a_directory:target.hek_directory,base_tags_directory:target.hek_tags_directory,invader_directory:target.invader_directory,..Default::default()};
    if tools.base_tags_directory.as_ref().is_none_or(|p|!p.is_dir())||crate::conversion::native_tool(&tools).is_none(){return invalid("Select matching extracted CE source tags and the installed H1A authoring kit");}
    for name in ["invader-edit","invader-build","invader-info","invader-dependency","invader-refactor"]{if build::tool_path(&tools,name).is_none(){return invalid(format!("{name} is required for connected CE source"));}}
    if plan.separate_native_bsps {
        if build::tool_path(&tools, "invader-extract").is_none() {
            return invalid("Separate native BSPs require Invader extraction for placement and ambience readback");
        }
        if !crate::bsp_compile::connected_additions(project, inspection)?.is_empty() {
            return invalid("Save new scenery imports in the source region before compiling separate native BSPs");
        }
    }
    Ok(tools)
}
/// Compile partition structure tags for owner review without publishing a map.
pub fn preview_partitions(
    project: &Project, inspection: &MapInspection, jobs: &Path, id: &str,
    cancel: Arc<AtomicBool>, event: impl Fn(JobEvent) + Send + Sync,
) -> Result<serde_json::Value> {
    partition_preview(project, inspection, jobs, id, cancel, event, crate::bsp_compile::PartitionStage::Structure)
}

/// Compile and inspect the staged scenario without advertising it as a playable build.
pub fn probe_partition_scenario(
    project: &Project, inspection: &MapInspection, jobs: &Path, id: &str, bake: bool,
    cancel: Arc<AtomicBool>, event: impl Fn(JobEvent) + Send + Sync,
) -> Result<serde_json::Value> {
    use crate::bsp_compile::PartitionStage;
    let stage = if bake { PartitionStage::Lighting } else { PartitionStage::Collision };
    partition_preview(project, inspection, jobs, id, cancel, event, stage)
}

fn partition_preview(
    project: &Project, inspection: &MapInspection, jobs: &Path, id: &str,
    cancel: Arc<AtomicBool>, event: impl Fn(JobEvent) + Send + Sync, stage: crate::bsp_compile::PartitionStage,
) -> Result<serde_json::Value> {
    use crate::bsp_compile::PartitionStage;
    let bind = stage != PartitionStage::Structure;
    let bake = stage == PartitionStage::Lighting;
    uuid::Uuid::parse_str(id).map_err(|_| SparkError::Invalid("Invalid build identity".into()))?;
    let tools = preflight(project, inspection)?;
    if bind && build::tool_path(&tools, "invader-extract").is_none() {
        return invalid("Native partition environment readback requires invader-extract");
    }
    let source_tags = tools.base_tags_directory.as_ref().unwrap();
    let source = project.source.as_ref().unwrap();
    let plan = project.bsp_assembly.as_ref().unwrap();
    crate::reject_links(jobs)?;
    fs::create_dir_all(jobs)?;
    let workspace = jobs.join(id);
    let inputs = crate::native_staging::inventory(source_tags, &cancel)?;
    let budget = crate::storage::estimate_copy(inputs.files.len(), inputs.bytes).saturating_add(2 * 1024 * 1024 * 1024);
    let lease = crate::storage::Store::for_output(&workspace)?.reserve(&workspace, Some(source_tags), budget,
        crate::storage::Category::Staging, "Owned native partition structure preview")?;
    fs::create_dir(&workspace)?;
    lease.mark_owned()?;
    let workspace = fs::canonicalize(workspace)?;
    let tags = workspace.join("tags");
    let input_hashes = crate::forge_build::stage_tags(source_tags, &tags, &cancel, |_, _, _, _| {})?;
    let runner = Runner { id, project: &project.id, cancel: &cancel, event: &event };
    if bind {
        if !crate::bsp_compile::connected_additions(project, inspection)?.is_empty() {
            return invalid("Partition probes require an unchanged import list. Keep new authored assets in the source project.");
        }
        let edit = build::tool_path(&tools, "invader-edit").unwrap();
        crate::bsp_compile::apply_base_transforms(project, inspection, &edit, &runner, &workspace, &tags)?;
    }
    let prepared = crate::bsp_compile::prepare_partition_structure(project, inspection, &tools, &runner, &workspace, &tags, stage)?;
    let receipt = if bind {
        let caches = build_partition_probes(project, inspection, &prepared, &tools, &runner, &workspace, &tags, bake)?;
        serde_json::json!({"partitions": prepared.receipt, "caches": caches, "lightingBaked": bake,
            "donorEnvironment": prepared.donor_environment, "allRegionEnvironmentsVerified": false,
            "donorPickups": prepared.pickups.as_ref().map(|pickups| pickups.donor_count()),
            "pickupDependencies": prepared.pickups.as_ref().map(|pickups| pickups.dependency_summary()),
            "gameplayVerified": false})
    } else { prepared.receipt };
    for input in [source, &plan.donor_source] {
        if maps::hash_file(&input.preserved_path)? != input.sha256 {
            return invalid("An original region changed during partition compilation");
        }
    }
    if crate::tool_transaction::inventory(source_tags)? != input_hashes {
        return invalid("Editable input tags changed during partition compilation");
    }
    project::atomic_write(&workspace.join("partition-structure.json"), &serde_json::to_vec_pretty(&receipt)?, false)?;
    lease.finish(true, Some(project.fingerprint()?))?;
    Ok(receipt)
}

fn build_partition_probes(
    project: &Project, source: &MapInspection, prepared: &crate::bsp_compile::PreparedPartitions,
    tools: &Toolchain, runner: &Runner, workspace: &Path, tags: &Path, bake: bool,
) -> Result<Vec<serde_json::Value>> {
    // Keep the classic cache before the staged scenario receives the MCC rows.
    [CLASSIC, MCC].into_iter().map(|target| {
        let output = workspace.join(target.engine);
        Ok(build_partition_cache(project, source, prepared, tools, runner, workspace, tags, &output, target, bake)?.receipt)
    }).collect()
}

struct PartitionCache {
    path: std::path::PathBuf,
    sha256: String,
    resident_bytes: u32,
    receipt: serde_json::Value,
}

fn build_partition_cache(
    project: &Project, source: &MapInspection, prepared: &crate::bsp_compile::PreparedPartitions,
    tools: &Toolchain, runner: &Runner, workspace: &Path, tags: &Path, output: &Path,
    target: CacheTarget, bake: bool,
) -> Result<PartitionCache> {
    let plan = project.bsp_assembly.as_ref().unwrap();
    let preserved_path = &project.source.as_ref().unwrap().preserved_path;
    let existing = maps::scenario_volume_readback(preserved_path, source)?;
    let compiler = build::tool_path(tools, "invader-build").unwrap();
    let info = build::tool_path(tools, "invader-info").unwrap();
    let name = source.scenario_path.rsplit(['\\', '/']).next().ok_or_else(|| SparkError::Invalid("Missing scenario filename".into()))?;
    fs::create_dir(output)?;
    let regional = target.version == MCC.version;
    if regional {
        if let Some(flags) = &prepared.netgame_flags {
            flags.append(&source.scenario_path, tools, runner, workspace)?;
        }
        if let Some(starts) = &prepared.player_starts {
            starts.append(&source.scenario_path, tools, runner, workspace)?;
        }
    }
    runner.run(&compiler, &["-g".into(), target.engine.into(), "-t".into(), tags.to_string_lossy().into_owned(),
        "-m".into(), output.to_string_lossy().into_owned(), "--resource-usage".into(), "none".into(), source.scenario_path.clone()],
        workspace, "partition-cache", 75)?;
    let path = output.join(format!("{name}.map"));
    let map = maps::inspect_map(&path, None)?;
    if map.header.version != target.version || map.header.scenario_type != source.header.scenario_type
        || map.scenario_path != source.scenario_path || map.mesh.parts.len() != 2
        || map.tags.iter().any(|tag| tag.external) || map.resources.iter().any(|resource| resource.required) {
        return invalid("Native partition probe differs from the authored scenario, format or self-contained resource policy");
    }
    for field in ["crc32_mismatched", "is_protected", "stub_count"] {
        let value = runner.run(&info, &["-T".into(), field.into(), path.to_string_lossy().into_owned()],
            workspace, "partition-cache-check", 90)?;
        if !["0", "false"].contains(&value.trim().to_lowercase().as_str()) {
            return invalid(format!("Partition probe {field} failed: {value}"));
        }
    }
    crate::bsp_compile::verify_compiled_base(project, source, &map)?;
    if !prepared.scenery.is_empty() {
        crate::bsp_scenery::verify_compiled(source, &map, &path, &prepared.scenery, &format!("gsbsp_{}_1", &runner.id[..8]), 0)?;
    }
    let volumes = maps::scenario_volume_readback(&path, &map)?;
    let transitions = maps::scenario_bsp_transitions(&path, &map)?;
    if transitions.bsp_tag_paths.len() != prepared.structure_tags.len() || transitions.bsp_tag_paths.iter()
        .zip(&prepared.structure_tags).any(|(compiled, expected)| !compiled.eq_ignore_ascii_case(expected))
    {
        return invalid("Compiled native BSP slots differ from the staged structure tag identities");
    }
    if volumes.len() != existing.len() + prepared.switches.len() || volumes[..existing.len()] != existing[..]
        || transitions.bsp_count != 2 || transitions.transitions.len() != 2 {
        return invalid("Partition probe lost original volumes or compiled an unexpected BSP switch set");
    }
    for (index, expected) in prepared.switches.iter().enumerate() {
        let volume_index = existing.len() + index;
        let volume = &volumes[volume_index];
        let (from, to) = maps::native_bsp_switch_name(&expected.name).unwrap();
        if volume.name != expected.name || volume.kind != 1 || volume.geometry.as_ref().is_none_or(|geometry| {
            !crate::native_operations::volume_geometry_close(geometry, &expected.geometry)
        }) || !transitions.transitions.iter().any(|row| row.trigger_index == volume_index
            && row.trigger_name == expected.name && row.source_bsp == from && row.destination_bsp == to && row.arrival_marker.is_none()) {
            return invalid("Compiled partition switch differs from the reviewed markerless volume");
        }
    }
    let world = crate::bsp_audio::inspect_ambience(&path, &map.sha256)?;
    let [base, donor] = world.bsps.as_slice() else { return invalid("Expected both compiled placement collision trees") };
    let [Some(base_tree), Some(donor_tree)] = [base.listener_tree.as_ref(), donor.listener_tree.as_ref()] else {
        return invalid("Missing compiled placement collision tree");
    };
    let trees = [base_tree, donor_tree];
    let donor_pickups_in_region = prepared.pickups.as_ref().map(|pickups| pickups.verify(&path, &map, trees)).transpose()?;
    let native_flags = prepared.netgame_flags.as_ref().map(|flags| flags.verify(&path, &map, regional, trees)).transpose()?;
    let native_starts = prepared.player_starts.as_ref().map(|starts| starts.verify(&path, &map, regional, trees)).transpose()?;
    let collision = crate::bsp_assembly::verify_bound_partition_collision(&path, &map, plan, &project.inherited_bsp_connections, prepared.overlap)?;
    let memory = maps::verify_resident_tag_window(&path, &map, target.tag_base, target.tag_capacity)?;
    if let Some(environment) = &prepared.donor_environment {
        let readback = output.join("environment-tags");
        fs::create_dir(&readback)?;
        let extract = build::tool_path(tools, "invader-extract").unwrap();
        runner.run(&extract, &["-t".into(), readback.to_string_lossy().into_owned(), "-s".into(),
            prepared.donor_tag.clone(), path.to_string_lossy().into_owned()], workspace, "partition-environment-readback", 91)?;
        let edit = build::tool_path(tools, "invader-edit").unwrap();
        environment.verify(|fields| {
            let mut args = vec!["-t".into(), readback.to_string_lossy().into_owned()];
            args.extend(fields);
            args.push(prepared.donor_tag.clone());
            runner.run(&edit, &args, workspace, "partition-environment-readback", 91)
        })?;
    }
    let lightmap_pages = if bake {
        crate::native_lighting::verify_cache(project, &path, &map)?;
        Some([crate::native_lighting::verify_bsp_lightmaps(&path, &map, 0)?,
            crate::native_lighting::verify_bsp_lightmaps(&path, &map, 1)?])
    } else { None };
    if maps::hash_file(&path)? != map.sha256 { return invalid("Compiled partition cache changed during validation"); }
    let receipt = serde_json::json!({"target": target.engine, "path": path, "sha256": map.sha256,
        "collision": collision, "tagMemory": memory, "nativeSwitches": transitions.transitions, "bspTagPaths": transitions.bsp_tag_paths, "lightmapPages": lightmap_pages,
        "donorEnvironmentVerified": prepared.donor_environment.is_some(), "donorPickupsInRegion": donor_pickups_in_region,
        "netgameFlags": native_flags, "playerStarts": native_starts});
    Ok(PartitionCache { path, sha256: map.sha256, resident_bytes: memory.resident_bytes, receipt })
}

pub fn run(project:&Project,inspection:&MapInspection,jobs:&Path,id:&str,cancel:Arc<AtomicBool>,event:impl Fn(JobEvent)+Send+Sync)->Result<BuildRecord>{
    uuid::Uuid::parse_str(id).map_err(|_|SparkError::Invalid("Invalid build identity".into()))?;
    let tools=preflight(project,inspection)?;let started=Instant::now();
    let target = cache_target(project).expect("preflight checked the connected-region target");
    let source=project.source.as_ref().unwrap();let plan=project.bsp_assembly.as_ref().unwrap();
    for s in [source,&plan.donor_source]{if maps::hash_file(&s.preserved_path)?!=s.sha256{return invalid("An original region changed after planning");}}
    crate::reject_links(jobs)?;fs::create_dir_all(jobs)?;let dir=jobs.join(id);
    let base=tools.base_tags_directory.as_ref().unwrap();let inputs=crate::native_staging::inventory(base,&cancel)?;
    let import_root=jobs.parent().ok_or_else(||SparkError::Invalid("Managed import root is missing".into()))?;
    let imported=crate::native_asset_imports::staging_inventory(import_root,project)?;
    let additions=crate::bsp_compile::connected_additions(project,inspection)?.len();
    let storage_lease=crate::storage::Store::for_output(&dir)?.reserve(&dir,Some(base),crate::storage::estimate_copy(inputs.files.len(),inputs.bytes).saturating_add(crate::storage::estimate_copy(imported.files.len(),imported.bytes)).saturating_add(2*1024*1024*1024),crate::storage::Category::Staging,"Connected native BSP build; source copy and bounded dependency/compiler allowance")?;
    crate::reject_links(&dir)?;fs::create_dir(&dir)?;storage_lease.mark_owned()?;let dir=fs::canonicalize(dir)?;
    let runner=Runner{id,project:&project.id,cancel:&cancel,event:&event};
    let edit=build::tool_path(&tools,"invader-edit").unwrap();let base_tags=tools.base_tags_directory.as_ref().unwrap();
    // Rebuilding painted detail transforms is not implemented. Refuse before
    // generating replacement geometry rather than dropping authored instances.
    let donor=maps::inspect_map(&plan.donor_source.preserved_path,plan.donor_source.resource_directory.as_deref())?;
    let mut detail=vec![];
    for (cache,i,root,index) in [(&source.preserved_path,inspection,base_tags,0),(&plan.donor_source.preserved_path,&donor,&plan.donor_tags_directory,plan.donor_bsp_index)]{
        let path=maps::scenario_bsp_tag_paths(cache,i)?.into_iter().nth(index).ok_or_else(||SparkError::Invalid("Native source BSP slot is unavailable".into()))?;
        let relative=format!("{path}.scenario_structure_bsp");let file=root.join(crate::safe_relative(&relative)?);
        if !file.is_file(){return invalid(format!("Matching editable source BSP is missing: {}. Extract this exact region and its dependencies before rebuilding",file.display()));}
        let snapshot=crate::bsp_detail::snapshot(&file,&edit,|args|{let mut a=vec!["-t".into(),root.to_string_lossy().into_owned()];a.extend_from_slice(args);a.push(relative.clone());runner.run(&edit,&a,&dir,"detail-preflight",8)})?;
        if snapshot.has_payload(){return invalid(format!("{} contains {} painted detail instances. Their transformed native rebuild is not implemented; originals and prior builds were retained",path,snapshot.instances));}detail.push(snapshot);
    }
    let tags=dir.join("tags");let hashes=crate::forge_build::stage_tags(base_tags,&tags,&cancel,|done,total,_,_|{if done==total{runner.emit("stage",format!("Verified {total} isolated CE source tags"),20,"info");}})?;
    fs::create_dir(dir.join("data"))?;
    let authored=crate::bsp_compile::apply_base_transforms(project,inspection,&build::tool_path(&tools,"invader-edit").unwrap(),&runner,&dir,&tags)?;
        project::atomic_write(&dir.join("authored-scenario.json"),&serde_json::to_vec_pretty(&authored)?,false)?;
    if plan.separate_native_bsps {
        let parts = crate::bsp_compile::prepare_partition_structure(project, inspection, &tools, &runner, &dir, &tags,
            crate::bsp_compile::PartitionStage::Lighting)?;
        let cache = build_partition_cache(project, inspection, &parts, &tools, &runner, &dir, &tags, &dir.join("output"), target, true)?;
        if cancel.load(Ordering::Relaxed) { return invalid("Build cancelled"); }
        if crate::tool_transaction::inventory(base_tags)? != hashes {
            return invalid("Editable source tags changed during partition compilation");
        }
        for original in [source, &plan.donor_source] {
            if maps::hash_file(&original.preserved_path)? != original.sha256 {
                return invalid("Original region identity changed during build");
            }
        }
        let fingerprint = project.fingerprint()?;
        let record = BuildRecord {
            id: id.into(), timestamp: chrono::Utc::now().to_rfc3339(), status: "validated".into(),
            target: target.engine.into(), output: Some(cache.path), sha256: Some(cache.sha256),
            message: format!("{} · two native BSPs · {:.2} / {:.2} MiB resident tag space · physical corridor clearance checked. Runtime traversal remains unverified.",
                target.name, f64::from(cache.resident_bytes) / 1048576., f64::from(target.tag_capacity) / 1048576.),
            project_fingerprint: fingerprint,
        };
        let compiled_tag_hashes = crate::tool_transaction::inventory(&tags)?;
        let receipt = serde_json::json!({"schemaVersion": 1, "build": record, "compiledTagHashes": compiled_tag_hashes,
            "residentBsps": 2, "partitions": parts.receipt, "cache": cache.receipt, "detailSources": detail,
            "authoredScenario": authored, "originalHashesVerified": true, "gameplayVerified": false, "streaming": false});
        project::atomic_write(&dir.join("megaworld-receipt.json"), &serde_json::to_vec_pretty(&receipt)?, false)?;
        project::atomic_write(&dir.join("receipt.json"), &serde_json::to_vec_pretty(&record)?, false)?;
        storage_lease.finish(true, Some(record.project_fingerprint.clone()))?;
        runner.emit("validated", "Native BSPs, corridor switches and lightmaps passed readback", 100, "success");
        return Ok(record);
    }
    let import_hashes=crate::native_asset_imports::stage(import_root,project,&tags)?;
    crate::bsp_compile::prepare_native(project,inspection,&tools,&runner,&dir,&tags)?;
    // Donor scenery keeps its stable native array slots. Append authored rows
    // afterward through the existing Invader schema, never cache offsets.
    crate::native_asset_imports::append_scenario(project,inspection,&tags,&edit,&dir,&runner)?;
    let output=dir.join("output");fs::create_dir(&output)?;
    let build=build::tool_path(&tools,"invader-build").unwrap();
    let compile_output = runner.run(&build,&["-g".into(),target.engine.into(),"-t".into(),tags.to_string_lossy().into_owned(),"-m".into(),output.to_string_lossy().into_owned(),"--resource-usage".into(),"none".into(),inspection.scenario_path.clone()],&dir,"compile-cache",80)?;
    // Use Invader’s native total, which includes the largest BSP. The
    // tag-data length in the cache header alone omits that memory.
    let tag_space = compile_output.lines().find_map(|line| {
        line.trim().strip_prefix("Tag space:").map(str::trim).filter(|value| !value.is_empty())
    });
    let name=inspection.scenario_path.rsplit(['\\','/']).next().ok_or_else(||SparkError::Invalid("No native scenario filename".into()))?;
    let file=output.join(format!("{name}.map"));let compiled=maps::inspect_map(&file,None)?;crate::bsp_compile::verify_compiled_base(project,inspection,&compiled)?;crate::native_asset_imports::verify_compiled(project,&compiled)?;
    if compiled.header.version!=target.version||compiled.header.scenario_type!=1||compiled.mesh.parts.len()!=1||compiled.scenario_path!=inspection.scenario_path{return invalid("Native output has the wrong cache identity or resident BSP count");}
    if compiled.tags.iter().any(|tag| tag.external) || compiled.resources.iter().any(|resource| resource.required) {
        return invalid("The connected build references external resource banks. Rebuild with embedded resources");
    }
    let memory = maps::verify_resident_tag_window(&file, &compiled, target.tag_base, target.tag_capacity)?;
    let info=build::tool_path(&tools,"invader-info").unwrap();for field in ["crc32_mismatched","is_protected","stub_count"]{let value=runner.run(&info,&["-T".into(),field.into(),file.to_string_lossy().into_owned()],&dir,"validate-cache",90)?;if !["0","false"].contains(&value.trim().to_lowercase().as_str()){return invalid(format!("{} cache {field} failed: {value}", target.name));}}
    let mut connection_plans = project.inherited_bsp_connections.clone();
    connection_plans.push(plan.clone());
    let routes = crate::bsp_assembly::verify_compiled_routes(&file, &connection_plans)?;
    let manifest:serde_json::Value=serde_json::from_slice(&fs::read(dir.join("bsp-assembly.json"))?)?;
    let structure = crate::bsp_audio::inspect(&file, &compiled.sha256)?;
    let bsp = structure.bsps.first().ok_or_else(|| SparkError::Invalid("Native visibility metadata is missing".into()))?;
    let visibility = serde_json::json!({
        "clusters": bsp.clusters.len(), "portals": bsp.portal_count, "maxClusterSubclusters": bsp.max_cluster_subclusters,
    });
    let materials:Vec<crate::bsp_assembly::AssemblyMaterial>=serde_json::from_value(manifest["materials"].clone())?;
    let expected:std::collections::BTreeMap<_,_>=materials.iter().filter(|m|m.collision_only).map(|m|(m.name.as_str(),m.flags&15)).collect();
    let (_,faces)=maps::collision_source(&file,&compiled)?;
    for face in &faces{if let Some(id)=face.shader{let tag=compiled.tags.iter().find(|t|t.id==id).ok_or_else(||SparkError::Invalid("Compiled collision shader is not indexed".into()))?;let name=tag.path.rsplit(['\\','/']).next().unwrap_or("");if expected.get(name).copied()!=Some(face.flags&15){return invalid("Compiled CE collision flags differ from the source surface identities");}}}
    let scenery:Vec<crate::bsp_scenery::Placement>=serde_json::from_value(manifest["donorScenery"].clone())?;
    if plan.include_donor_scenery{crate::bsp_scenery::verify_compiled(inspection,&compiled,&file,&scenery,&format!("gsbsp_{}_1",&id[..8]),additions)?;}
    for (relative,sha) in &hashes{if cancel.load(Ordering::Relaxed){return invalid("Build cancelled");}if maps::hash_file(&base_tags.join(crate::safe_relative(relative)?))?!=*sha{return invalid("CE source changed while the world was compiling");}}
    for s in [source,&plan.donor_source]{if maps::hash_file(&s.preserved_path)?!=s.sha256{return invalid("Original region identity changed during build");}}
    if crate::native_asset_imports::source_hashes(import_root,project)?!=import_hashes{return invalid("Imported scenery source changed while the world was compiling; the previous-good build was retained");}
    crate::native_lighting::verify_cache(project,&file,&compiled)?;
    let sha=maps::hash_file(&file)?;if sha!=compiled.sha256{return invalid("Compiled connected cache changed during validation");}
    let message = format!(
        "{} · one resident BSP · {:.2} / {:.2} MiB tag space · {} clusters, {} portals, {} max subclusters per cluster. All {} connections passed native collision checks. Runtime traversal remains unverified.",
        target.name, f64::from(memory.resident_bytes) / 1048576.0, f64::from(target.tag_capacity) / 1048576.0,
        bsp.clusters.len(), bsp.portal_count, bsp.max_cluster_subclusters, connection_plans.len(),
    );
    let record=BuildRecord{id:id.into(),timestamp:chrono::Utc::now().to_rfc3339(),status:"validated".into(),target:target.engine.into(),output:Some(file),sha256:Some(sha),message,project_fingerprint:project.fingerprint()?};
    let compiled_tag_hashes = crate::tool_transaction::inventory(&tags)?;
    project::atomic_write(&dir.join("megaworld-receipt.json"),&serde_json::to_vec_pretty(&serde_json::json!({"schemaVersion":1,"build":record,"durationMs":started.elapsed().as_millis(),"routes":routes,"ceTagSpace":if target.version == 609 { tag_space } else { None },"compilerTagSpace":tag_space,"tagMemory":memory,"visibility":visibility,"compiledTagHashes":compiled_tag_hashes,"detailSources":detail,"originalHashesVerified":true,"inputTags":hashes.len(),"residentBsps":compiled.mesh.parts.len(),"donorScenery":scenery.len(),"authoredScenario":authored,"originalPlacementsVerified":inspection.objects.len(),"importedPlacementsVerified":additions,"importedTagFiles":import_hashes.len(),"gameplayVerified":false,"streaming":false}))?,false)?;
    project::atomic_write(&dir.join("receipt.json"),&serde_json::to_vec_pretty(&record)?,false)?;
    storage_lease.finish(true,Some(record.project_fingerprint.clone()))?;
    runner.emit("validated","Native compilation and readback passed; player walkthrough is still required",100,"success");Ok(record)
}


#[cfg(test)]
mod tests {
    use super::extension_tags;
    use crate::{project::BuildRecord, tool_transaction};
    use std::fs;

    #[test]
    fn extension_source_requires_the_exact_build_and_unchanged_tags() {
        let job = tempfile::tempdir().unwrap();
        let tags = job.path().join("tags");
        fs::create_dir(&tags).unwrap();
        let scenario = tags.join("test.scenario");
        fs::write(&scenario, b"original stage").unwrap();
        let mut build = BuildRecord {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: String::new(),
            status: "validated".into(),
            target: "gbx-custom".into(),
            output: None,
            sha256: Some("1".repeat(64)),
            message: String::new(),
            project_fingerprint: "2".repeat(64),
        };
        assert!(extension_tags(job.path(), &build).unwrap().is_none());
        let receipt = serde_json::json!({
            "schemaVersion": 1,
            "build": build,
            "compiledTagHashes": tool_transaction::inventory(&tags).unwrap(),
        });
        fs::write(job.path().join("megaworld-receipt.json"), receipt.to_string()).unwrap();
        assert_eq!(extension_tags(job.path(), &build).unwrap(), Some(tags.clone()));
        build.target = "mcc-cea".into();
        assert!(extension_tags(job.path(), &build).is_err());
        let mut mcc_receipt = receipt;
        mcc_receipt["build"] = serde_json::to_value(&build).unwrap();
        fs::write(job.path().join("megaworld-receipt.json"), mcc_receipt.to_string()).unwrap();
        assert_eq!(extension_tags(job.path(), &build).unwrap(), Some(tags));
        build.sha256 = Some("3".repeat(64));
        assert!(extension_tags(job.path(), &build).is_err());
        build.sha256 = Some("1".repeat(64));
        fs::write(&scenario, b"changed stage").unwrap();
        assert!(extension_tags(job.path(), &build).is_err());
    }
}
