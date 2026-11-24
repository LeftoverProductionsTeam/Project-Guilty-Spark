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

fn cache_target(project: &Project) -> Option<CacheTarget> {
    project.bsp_assembly.as_ref()?;
    let profile = project.build_targets.iter().find(|t| Some(&t.id) == project.active_build_target.as_ref())?;
    match profile.runtime_id {
        RuntimeId::HaloCustomEdition | RuntimeId::ChupathingyCe => Some(CacheTarget {
            engine: "gbx-custom", version: 609, tag_base: 0x4044_0000,
            tag_capacity: 23 * 1024 * 1024, name: "Custom Edition CE609",
        }),
        RuntimeId::MccSteam if project.source.as_ref().is_some_and(|source| source.cache_version == 609) => Some(CacheTarget {
            engine: "mcc-cea", version: 13, tag_base: 0x5000_0000,
            tag_capacity: 64 * 1024 * 1024, name: "MCC Halo 1 cache 13",
        }),
        _ => None,
    }
}

pub fn selected(project: &Project) -> bool {
    cache_target(project).is_some()
}

pub fn compatibility(project: &Project, inspection: &MapInspection) -> build::CompatibilityReport {
    let target = cache_target(project).expect("selected connected-region target");
    let blockers = preflight(project, inspection).err().map(|e| vec![e.to_string()]).unwrap_or_default();
    let mut warnings = vec!["One resident BSP. Native compilation is separate from player traversal. Painted detail requires native preservation support.".into()];
    if target.version == 13 {
        warnings.push("MCC13 requires an MCC cache loader. Forerunner runtime and multiplayer acceptance are separate from Spark build validation.".into());
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
        || source.build.target != "gbx-custom" || build.target != "gbx-custom"
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
    if cache_target(project).is_none() {
        return invalid("Select an explicit Custom Edition, Chupathingy or MCC target for the connected CE regions");
    }
    let target = crate::forge_build::tools_for_target(project, Default::default())?;
    if target.hek_flavor.as_deref() != Some("h1aEk") {
        return invalid("Connected regions require the reviewed H1A authoring kit and matching editable base tags");
    }
    let plan=project.bsp_assembly.as_ref().ok_or_else(||SparkError::Invalid("Author a connected BSP plan first".into()))?;plan.validate()?;
    let source=project.source.as_ref().ok_or_else(||SparkError::Invalid("Import an original CE map first".into()))?;
    if source.sha256!=inspection.sha256||source.scenario_path!=inspection.scenario_path{return invalid("The base inspection belongs to another source revision");}
    if source.cache_version!=609||plan.donor_source.cache_version!=609||inspection.header.version!=609||inspection.mesh.parts.len()!=1||inspection.header.scenario_type!=1{return invalid("Initial CE Megaworld acceptance needs a single-BSP CE multiplayer base and a CE donor; cross-runtime source conversion is a separate step");}
    crate::bsp_compile::base_transforms(project,inspection)?;
    if !project.tag_edits.is_empty()||!project.tag_renames.is_empty()||!project.tag_duplicates.is_empty()||!project.powerups.is_empty()||!project.animation_assignments.is_empty()||!crate::native_audio::fingerprint_inputs(project).is_empty()||project.conversion_profile.is_some(){return invalid("Connected CE builds support original scenario position/rotation edits and validated scenery imports. Tag edits, other structural placement/asset/audio changes and conversion profiles still require their validated native authoring path; nothing is silently omitted");}
    let tools=Toolchain{h1a_directory:target.hek_directory,base_tags_directory:target.hek_tags_directory,invader_directory:target.invader_directory,..Default::default()};
    if tools.base_tags_directory.as_ref().is_none_or(|p|!p.is_dir())||crate::conversion::native_tool(&tools).is_none(){return invalid("Select matching extracted CE source tags and the installed H1A authoring kit");}
    for name in ["invader-edit","invader-build","invader-info","invader-dependency","invader-refactor"]{if build::tool_path(&tools,name).is_none(){return invalid(format!("{name} is required for connected CE source"));}}
    Ok(tools)
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
    for (i,root,index) in [(inspection,base_tags,0),(&donor,&plan.donor_tags_directory,plan.donor_bsp_index)]{
        let name=&i.mesh.parts.get(index).ok_or_else(||SparkError::Invalid("Selected BSP disappeared".into()))?.name;
        let tag=i.tags.iter().find(|t|t.class=="sbsp"&&t.path.rsplit(['\\','/']).next().is_some_and(|p|p.eq_ignore_ascii_case(name))).ok_or_else(||SparkError::Invalid("Native source BSP identity unavailable".into()))?;
        let relative=format!("{}.scenario_structure_bsp",tag.path);let file=root.join(crate::safe_relative(&relative)?);
        if !file.is_file(){return invalid(format!("Matching editable source BSP is missing: {}. Extract this exact region and its dependencies before rebuilding",file.display()));}
        let snapshot=crate::bsp_detail::snapshot(&file,&edit,|args|{let mut a=vec!["-t".into(),root.to_string_lossy().into_owned()];a.extend_from_slice(args);a.push(relative.clone());runner.run(&edit,&a,&dir,"detail-preflight",8)})?;
        if snapshot.has_payload(){return invalid(format!("{} contains {} painted detail instances. Their transformed native rebuild is not implemented; originals and prior builds were retained",tag.path,snapshot.instances));}detail.push(snapshot);
    }
    let tags=dir.join("tags");let hashes=crate::forge_build::stage_tags(base_tags,&tags,&cancel,|done,total,_,_|{if done==total{runner.emit("stage",format!("Verified {total} isolated CE source tags"),20,"info");}})?;
    fs::create_dir(dir.join("data"))?;
    let authored=crate::bsp_compile::apply_base_transforms(project,inspection,&build::tool_path(&tools,"invader-edit").unwrap(),&runner,&dir,&tags)?;
        project::atomic_write(&dir.join("authored-scenario.json"),&serde_json::to_vec_pretty(&authored)?,false)?;
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
        "{} · one resident BSP · {:.2} / {:.2} MiB tag space. All {} connections passed native collision checks. Runtime traversal remains unverified.",
        target.name, f64::from(memory.resident_bytes) / 1048576.0, f64::from(target.tag_capacity) / 1048576.0, connection_plans.len(),
    );
    let record=BuildRecord{id:id.into(),timestamp:chrono::Utc::now().to_rfc3339(),status:"validated".into(),target:target.engine.into(),output:Some(file),sha256:Some(sha),message,project_fingerprint:project.fingerprint()?};
    let compiled_tag_hashes = crate::tool_transaction::inventory(&tags)?;
    project::atomic_write(&dir.join("megaworld-receipt.json"),&serde_json::to_vec_pretty(&serde_json::json!({"schemaVersion":1,"build":record,"durationMs":started.elapsed().as_millis(),"routes":routes,"ceTagSpace":if target.version == 609 { tag_space } else { None },"compilerTagSpace":tag_space,"tagMemory":memory,"compiledTagHashes":compiled_tag_hashes,"detailSources":detail,"originalHashesVerified":true,"inputTags":hashes.len(),"residentBsps":compiled.mesh.parts.len(),"donorScenery":scenery.len(),"authoredScenario":authored,"originalPlacementsVerified":inspection.objects.len(),"importedPlacementsVerified":additions,"importedTagFiles":import_hashes.len(),"gameplayVerified":false,"streaming":false}))?,false)?;
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
        assert_eq!(extension_tags(job.path(), &build).unwrap(), Some(tags));
        build.sha256 = Some("3".repeat(64));
        assert!(extension_tags(job.path(), &build).is_err());
        build.sha256 = Some("1".repeat(64));
        fs::write(&scenario, b"changed stage").unwrap();
        assert!(extension_tags(job.path(), &build).is_err());
    }
}
