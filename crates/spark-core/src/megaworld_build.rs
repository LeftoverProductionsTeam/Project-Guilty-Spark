//! Bounded CE acceptance path for two original regions. Reuses the existing
//! native assembly exporter, namespace/dependency checks and collision verifier.
//! It never treats scenario BSP references as streaming.
use crate::{build::{self,JobEvent,Runner,Toolchain},maps::{self,MapInspection},project::{self,Project,BuildRecord},invalid,Result,SparkError};
use std::{fs,path::Path,sync::{Arc,atomic::{AtomicBool,Ordering}},time::Instant};
pub fn selected(project:&Project)->bool{project.bsp_assembly.is_some()&&project.build_targets.iter().find(|t|Some(&t.id)==project.active_build_target.as_ref()).is_some_and(|t|t.runtime_id==crate::runtime::RuntimeId::HaloCustomEdition)}
pub fn preflight(project:&Project,inspection:&MapInspection)->Result<Toolchain>{
    project.validate()?;
    let target=project.build_targets.iter().find(|t|Some(&t.id)==project.active_build_target.as_ref()).ok_or_else(||SparkError::Invalid("Choose an explicit CE build target".into()))?;
    crate::forge_build::tools_for_target(project,Default::default())?;
    if target.runtime_id!=crate::runtime::RuntimeId::HaloCustomEdition||target.hek_flavor.as_deref()!=Some("h1aEk"){return invalid("Connected CE regions require the reviewed H1A authoring / Invader CE profile");}
    let plan=project.bsp_assembly.as_ref().ok_or_else(||SparkError::Invalid("Author a connected BSP plan first".into()))?;plan.validate()?;
    let source=project.source.as_ref().ok_or_else(||SparkError::Invalid("Import an original CE map first".into()))?;
    if source.sha256!=inspection.sha256||source.scenario_path!=inspection.scenario_path{return invalid("The base inspection belongs to another source revision");}
    if source.cache_version!=609||plan.donor_source.cache_version!=609||inspection.header.version!=609||inspection.mesh.parts.len()!=1||inspection.header.scenario_type!=1{return invalid("Initial CE Megaworld acceptance needs a single-BSP CE multiplayer base and a CE donor; cross-runtime source conversion is a separate step");}
    if !project.tag_edits.is_empty()||project.scene!=inspection.objects||!project.tag_renames.is_empty()||!project.tag_duplicates.is_empty()||!project.native_asset_imports.is_empty()||!project.powerups.is_empty()||!project.animation_assignments.is_empty()||!crate::native_audio::fingerprint_inputs(project).is_empty()||project.conversion_profile.is_some(){return invalid("This first CE connected-world path preserves original scenario placements. Other authored tag/object/asset/audio edits require their existing native build path and will not be silently omitted");}
    let tools=Toolchain{h1a_directory:target.hek_directory.clone(),base_tags_directory:target.tags_directory.clone(),invader_directory:target.invader_directory.clone(),..Default::default()};
    if tools.base_tags_directory.as_ref().is_none_or(|p|!p.is_dir())||crate::conversion::native_tool(&tools).is_none(){return invalid("Select matching extracted CE source tags and the installed H1A authoring kit");}
    for name in ["invader-edit","invader-build","invader-info","invader-dependency","invader-refactor"]{if build::tool_path(&tools,name).is_none(){return invalid(format!("{name} is required for connected CE source"));}}
    Ok(tools)
}
pub fn run(project:&Project,inspection:&MapInspection,jobs:&Path,id:&str,cancel:Arc<AtomicBool>,event:impl Fn(JobEvent)+Send+Sync)->Result<BuildRecord>{
    uuid::Uuid::parse_str(id).map_err(|_|SparkError::Invalid("Invalid build identity".into()))?;
    let tools=preflight(project,inspection)?;let started=Instant::now();
    let source=project.source.as_ref().unwrap();let plan=project.bsp_assembly.as_ref().unwrap();
    for s in [source,&plan.donor_source]{if maps::hash_file(&s.preserved_path)?!=s.sha256{return invalid("An original region changed after planning");}}
    crate::reject_links(jobs)?;fs::create_dir_all(jobs)?;let dir=jobs.join(id);
    let base=tools.base_tags_directory.as_ref().unwrap();let inputs=crate::native_staging::inventory(base,&cancel)?;
    let storage_lease=crate::storage::Store::for_output(&dir)?.reserve(&dir,Some(base),crate::storage::estimate_copy(inputs.files.len(),inputs.bytes).saturating_add(2*1024*1024*1024),crate::storage::Category::Staging,"Connected native BSP build; source copy and bounded dependency/compiler allowance")?;
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
    crate::bsp_compile::prepare_native(project,inspection,&tools,&runner,&dir,&tags)?;
    let output=dir.join("output");fs::create_dir(&output)?;
    let build=build::tool_path(&tools,"invader-build").unwrap();
    runner.run(&build,&["-g".into(),"gbx-custom".into(),"-t".into(),tags.to_string_lossy().into_owned(),"-m".into(),output.to_string_lossy().into_owned(),"--resource-usage".into(),"none".into(),inspection.scenario_path.clone()],&dir,"compile-ce",80)?;
    let name=inspection.scenario_path.rsplit(['\\','/']).next().ok_or_else(||SparkError::Invalid("No native scenario filename".into()))?;
    let file=output.join(format!("{name}.map"));let compiled=maps::inspect_map(&file,None)?;
    if compiled.header.version!=609||compiled.header.scenario_type!=1||compiled.mesh.parts.len()!=1||compiled.scenario_path!=inspection.scenario_path{return invalid("Native output has the wrong CE identity or resident BSP count");}
    let info=build::tool_path(&tools,"invader-info").unwrap();for field in ["crc32_mismatched","is_protected","stub_count"]{let value=runner.run(&info,&["-T".into(),field.into(),file.to_string_lossy().into_owned()],&dir,"validate-ce",90)?;if !["0","false"].contains(&value.trim().to_lowercase().as_str()){return invalid(format!("Native CE cache {field} failed: {value}"));}}
    let routes=crate::bsp_assembly::verify_compiled_routes(&file,std::slice::from_ref(plan))?;
    let manifest:serde_json::Value=serde_json::from_slice(&fs::read(dir.join("bsp-assembly.json"))?)?;
    let materials:Vec<crate::bsp_assembly::AssemblyMaterial>=serde_json::from_value(manifest["materials"].clone())?;
    let expected:std::collections::BTreeMap<_,_>=materials.iter().filter(|m|m.collision_only).map(|m|(m.name.as_str(),m.flags&15)).collect();
    let (_,faces)=maps::collision_source(&file,&compiled)?;
    for face in &faces{if let Some(id)=face.shader{let tag=compiled.tags.iter().find(|t|t.id==id).ok_or_else(||SparkError::Invalid("Compiled collision shader is not indexed".into()))?;let name=tag.path.rsplit(['\\','/']).next().unwrap_or("");if expected.get(name).copied()!=Some(face.flags&15){return invalid("Compiled CE collision flags differ from the source surface identities");}}}
    let scenery:Vec<crate::bsp_scenery::Placement>=serde_json::from_value(manifest["donorScenery"].clone())?;
    if plan.include_donor_scenery{crate::bsp_scenery::verify_compiled(inspection,&compiled,&file,&scenery,&format!("gsbsp_{}_1",&id[..8]))?;}
    for (relative,sha) in &hashes{if cancel.load(Ordering::Relaxed){return invalid("Build cancelled");}if maps::hash_file(&base_tags.join(crate::safe_relative(relative)?))?!=*sha{return invalid("CE source changed while the world was compiling");}}
    for s in [source,&plan.donor_source]{if maps::hash_file(&s.preserved_path)?!=s.sha256{return invalid("Original region identity changed during build");}}
    let sha=maps::hash_file(&file)?;if sha!=compiled.sha256{return invalid("Compiled connected cache changed during validation");}
    let record=BuildRecord{id:id.into(),timestamp:chrono::Utc::now().to_rfc3339(),status:"validated".into(),target:"gbx-custom".into(),output:Some(file),sha256:Some(sha),message:"Two source regions and their authored connection compiled into one CE BSP; native dependencies, CRC and collision route checked. Player traversal remains unverified.".into(),project_fingerprint:project.fingerprint()?};
    project::atomic_write(&dir.join("megaworld-receipt.json"),&serde_json::to_vec_pretty(&serde_json::json!({"schemaVersion":1,"build":record,"durationMs":started.elapsed().as_millis(),"routes":routes,"detailSources":detail,"originalHashesVerified":true,"inputTags":hashes.len(),"residentBsps":compiled.mesh.parts.len(),"donorScenery":scenery.len(),"gameplayVerified":false,"streaming":false}))?,false)?;
    project::atomic_write(&dir.join("receipt.json"),&serde_json::to_vec_pretty(&record)?,false)?;
    storage_lease.finish(true,Some(record.project_fingerprint.clone()))?;
    runner.emit("validated","CE source compilation and readback passed; player walkthrough is still required",100,"success");Ok(record)
}
