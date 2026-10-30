//! QuickForge compiler orchestration. Generated tags and all compiler writes stay
//! inside a fresh owned job. A source export is never a validated game build.
use crate::{build::{self, JobEvent, Runner}, invalid, maps, project::{self, BuildRecord, Project}, quickforge::{self, SourceExport}, runtime::RuntimeId, safe_relative, Result, SparkError};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, path::{Path, PathBuf}, sync::{Arc, atomic::{AtomicBool, Ordering}}, time::Instant};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ForgeToolchain {
    pub hek_directory: Option<PathBuf>,
    pub hek_tags_directory: Option<PathBuf>,
    pub invader_directory: Option<PathBuf>,
    /// Required explicit selected kit generation. Classic HEK has no custom
    /// content-path flags, unlike the H1A/MCC Editing Kit.
    pub hek_flavor: Option<String>,
}
pub fn tools_for_target(project:&Project,fallback:ForgeToolchain)->Result<ForgeToolchain> {
    let Some(id)=&project.active_build_target else{return Ok(fallback)};
    let profile=project.build_targets.iter().find(|p|&p.id==id)
        .ok_or_else(||SparkError::Invalid("Active build target missing".into()))?;
    if profile.open_sauce {return invalid("OpenSauce .yelo compilation is not integrated. Use a separate CE/OpenSauce toolchain; MCC cannot load it");}
    let expected=match profile.runtime_id {RuntimeId::MccSteam=>"h1a-tool",RuntimeId::HaloCustomEdition=>"invader-ce",
        _=>return invalid("This runtime has no verified integrated builder; retain its configuration and export source for research")};
    if profile.builder!=expected {return invalid("Selected builder produces the wrong engine output");}
    if profile.runtime_id==RuntimeId::MccSteam && profile.hek_flavor.as_deref()!=Some("h1aEk") {
        return invalid("MCC source compilation requires the H1A editing kit");
    }
    if profile.runtime_id==RuntimeId::HaloCustomEdition && !profile.ce_compatible_tagset {
        return invalid("Confirm a Custom Edition base tagset and review incompatible MCC fields/scripts before building CE. No fields are silently stripped");
    }
    Ok(ForgeToolchain{hek_directory:profile.hek_directory.clone(),hek_tags_directory:profile.tags_directory.clone(),
        invader_directory:profile.invader_directory.clone(),hek_flavor:profile.hek_flavor.clone()})
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct QuickForgeBuildReceipt {
    pub schema_version: u32,
    pub job_id: String,
    pub project_id: String,
    pub project_fingerprint: String,
    pub status: String,
    pub duration_ms: u64,
    pub sources: Option<SourceExport>,
    pub blockers: Vec<String>,
    pub warnings: Vec<String>,
    pub build: Option<BuildRecord>,
    pub tool_identities: BTreeMap<String,String>,
}
/// Owner-run Standalone acceptance. Keep the existing short-path alias alive for
/// the whole game process; dropping it after spawn makes lazy tag reads fail.
/// This verifies the source/build identities but does not certify player movement.
#[cfg(windows)]
pub fn workshop_playtest(receipt:&QuickForgeBuildReceipt,kit:&Path)->Result<()> {
    if receipt.status!="validated" {return invalid("Only a validated native Workshop build can be playtested");}
    let sources=receipt.sources.as_ref().ok_or_else(||SparkError::Invalid("Missing source receipt".into()))?;
    let build=receipt.build.as_ref().ok_or_else(||SparkError::Invalid("Missing native build receipt".into()))?;
    let output=build.output.as_ref().ok_or_else(||SparkError::Invalid("Missing compiled output".into()))?;
    if build.sha256.as_deref()!=Some(maps::hash_file(output)?.as_str())||sources.jms_sha256!=maps::hash_file(&sources.jms_path)? {return invalid("Workshop output or source JMS changed since compilation");}
    let project=project::load_project(&sources.directory.join("project.gsproject"))?;
    if project.fingerprint()?!=receipt.project_fingerprint||project.quick_forge.as_ref().is_none_or(|d|d.workshop.is_none()||d.runtime_id!=RuntimeId::MccSteam) {return invalid("Workshop source is not the exact compiled MCC project");}
    let exe=kit.join("halo_tag_test.exe");crate::reject_links(&exe)?;
    let alias=crate::native_workspace::Alias::new(&sources.directory)?;
    let init_name=format!("spark-workshop-{}.txt",uuid::Uuid::new_v4());
    project::atomic_write(&sources.directory.join(&init_name),format!("game_variant slayer\r\nmap_name \"{}\"\r\n",sources.scenario_path).as_bytes(),false)?;
    let mut command=std::process::Command::new(exe);
    command.current_dir(kit).args(["-window","-vidmode","1280,720","-tags_dir"]).arg(alias.path().join("tags")).arg("-data_dir").arg(alias.path().join("data")).arg("-exec").arg(alias.path().join(init_name));
    use std::os::windows::process::CommandExt;command.creation_flags(0x08000000);
    let mut child=command.spawn()?;eprintln!("Workshop Standalone process {}. Walk from Room A through the corridor to Room B and up the ramp. Close the game to release the temporary content path.",child.id());
    let status=child.wait()?;if !status.success(){return invalid(format!("Standalone exited with {status}; inspect its reports/debug.txt. This is not gameplay acceptance"));}Ok(())
}
/// Strictly versioned Tool argument prefix. Legacy HEK does not support
/// content-path overrides and must use an isolated workspace current_dir.
/// H1A supports the explicit root flags to keep its writes in that workspace.
fn halo_tool_prefix(flavor:Option<&str>,workspace:&Path,stage:&Path)->Result<Vec<String>> {
    match flavor {
        Some("legacyHek")=>Ok(vec![]),
        Some("h1aEk")=>{
            if stage!=workspace.join("tags"){return invalid("H1A tags must be scoped to this compiler workspace");}
            // Tool retains a short internal filename buffer. Relative content
            // roots avoid its observed absolute-path assertion, while Runner
            // still starts exclusively inside the isolated workspace.
            Ok(vec!["-data_dir".into(),"data".into(),"-tags_dir".into(),"tags".into(),"-game_root_dir".into(),".".into()])
        },
        _=>invalid("Unknown Halo Tool generation; configure classic HEK or H1A explicitly"),
    }
}
fn tool_file(tools: &ForgeToolchain) -> Option<PathBuf> {
    tools.hek_directory.as_ref().map(|p|p.join(if cfg!(windows){"tool.exe"}else{"tool"})).filter(|p|p.is_file())
}
fn invader(tools:&ForgeToolchain,name:&str)->Option<PathBuf> {
    build::tool_path(&build::Toolchain{invader_directory:tools.invader_directory.clone(),..Default::default()},name)
}
fn target(runtime: RuntimeId)->Result<(&'static str,u32)> {
    match runtime {
        RuntimeId::MccSteam=>Ok(("mcc-cea",13)),
        RuntimeId::ChupathingyCe|RuntimeId::OpenCe|RuntimeId::HaloCustomEdition=>Ok(("gbx-custom",609)),
        _=>invalid("QuickForge compilation currently targets MCC or Custom Edition-compatible caches only"),
    }
}
pub fn dependency_path(root:&Path,path:&str,class:&str)->Result<PathBuf> {
    let extension=match class {"senv"|"shader_environment"=>"shader_environment","soso"|"shader_model"=>"shader_model","sky "|"sky"=>"sky","weap"|"weapon"=>"weapon","eqip"|"equipment"=>"equipment","itmc"|"item_collection"=>"item_collection","vehi"|"vehicle"=>"vehicle","scen"|"scenery"=>"scenery","actv"|"actor_variant"=>"actor_variant","bipd"|"biped"=>"biped",_=>return invalid(format!("Unsupported build dependency class {class}"))};
    let file=root.join(safe_relative(&format!("{path}.{extension}"))?);
    crate::reject_links(&file)?;
    Ok(file)
}
/// Halo Tool resolves JMS materials by basename across shader classes, not by
/// the full shader path stored in our document. Refuse ambiguous bindings before
/// allowing Tool to choose an unintended shader or prompt for an empty one.
pub fn audit_material_bindings(document:&quickforge::QuickForgeDocument,files:impl IntoIterator<Item=impl AsRef<str>>)->Result<Vec<String>> {
    quickforge::validate_document(document)?;
    let mut shaders:BTreeMap<String,Vec<String>>=BTreeMap::new();
    for (index,file) in files.into_iter().enumerate() {
        if index>=200000{return invalid("Material binding inventory exceeds 200000 files");}
        let path=file.as_ref().replace('\\',"/").to_ascii_lowercase();
        safe_relative(&path)?;
        let Some((tag,extension))=path.rsplit_once('.') else{continue};
        if extension=="shader"||extension.starts_with("shader_") {
            let name=tag.rsplit('/').next().unwrap_or(tag).to_owned();
            shaders.entry(name).or_default().push(path);
        }
    }
    let mut blockers=vec![];
    for material in &document.materials {
        let Some(path)=&material.shader_path else{continue};
        let normalized=path.replace('\\',"/").to_ascii_lowercase();
        let name=normalized.rsplit('/').next().unwrap_or(&normalized);
        let expected=format!("{normalized}.shader_environment");
        let candidates=shaders.get(name).map(Vec::as_slice).unwrap_or(&[]);
        if candidates.len()!=1 || candidates[0]!=expected {
            blockers.push(format!("Material '{}' cannot bind uniquely to '{}': Halo Tool resolves JMS name '{}' across all shader classes ({} matches). Rename the source shader uniquely or select an unambiguous material before compiling.",material.name,path,name,candidates.len()));
        }
    }
    Ok(blockers)
}
/// Bounded copy of owner-selected editable tags, never hardlinks into an installation.
/// Hashes cover every input copied so a later build can be compared meaningfully.
pub(crate) fn stage_tags(source:&Path,destination:&Path,cancel:&AtomicBool,mut progress:impl FnMut(usize,usize,u64,u64))->Result<BTreeMap<String,String>> {
    crate::reject_links(source)?;
    if !source.is_dir(){return invalid("Select an extracted HCEEK tags directory, not compiled .map files");}
    let source=source.canonicalize()?;
    let destination_absolute=std::path::absolute(destination)?;
    // Compare canonical existing ancestors so Windows verbatim paths and normal
    // paths cannot bypass the source/destination containment guard.
    let mut ancestor=destination_absolute.as_path();let mut missing=vec![];
    while !ancestor.exists() {missing.push(ancestor.file_name().ok_or_else(||SparkError::Invalid("Invalid staging destination".into()))?.to_os_string());ancestor=ancestor.parent().ok_or_else(||SparkError::Invalid("Staging destination has no existing parent".into()))?;}
    crate::reject_links(ancestor)?;
    let mut canonical_destination=ancestor.canonicalize()?;for name in missing.into_iter().rev(){canonical_destination.push(name);}
    if canonical_destination.starts_with(&source){return invalid("Build staging cannot be inside the source tags directory");}
    if destination.exists() {
        crate::reject_links(destination)?;
        if fs::read_dir(destination)?.next().is_some(){return invalid("Tag staging destination must be empty");}
    } else {fs::create_dir(destination)?;}
    let mut stack=vec![(source.clone(),0usize)];
    let mut files=vec![];
    let mut bytes=0u64;
    while let Some((directory,depth))=stack.pop(){
        if depth>32{return invalid("Tag tree nesting exceeds 32 directories");}
        for entry in fs::read_dir(directory)? {
            if cancel.load(Ordering::Relaxed){return invalid("Build cancelled");}
            let entry=entry?; let path=entry.path(); crate::reject_links(&path)?;
            let metadata=entry.metadata()?;
            if metadata.is_dir(){stack.push((path,depth+1));continue;}
            if !metadata.is_file(){return invalid("Only regular files are allowed in a tag tree");}
            bytes=bytes.checked_add(metadata.len()).ok_or_else(||SparkError::Invalid("Tag size overflow".into()))?;
            if metadata.len()>2*1024*1024*1024 || bytes>16*1024*1024*1024 || files.len()>=200000 {return invalid("Tag staging exceeds limits: 2 GiB/file, 16 GiB total, 200000 files");}
            let relative=path.strip_prefix(&source).map_err(|_|SparkError::Invalid("Tag escaped source root".into()))?.to_path_buf();
            safe_relative(&relative.to_string_lossy())?;
            files.push((path,relative,metadata.len()));
        }
    }
    let mut hashes=BTreeMap::new();let total=files.len();let mut copied=0u64;let mut last=Instant::now();let mut buffer=vec![0u8;1024*1024];
    progress(0,total,0,bytes);
    for (index,(path,relative,expected_size)) in files.into_iter().enumerate() {
        if cancel.load(Ordering::Relaxed){return invalid("Build cancelled");}
        let output=destination.join(&relative); crate::reject_links(&output)?;
        fs::create_dir_all(output.parent().unwrap())?;
        use std::io::{Read,Write};use sha2::{Digest,Sha256};
        // Hash the exact bytes while copying; a second source hash and output
        // readback retain the consistency check without an extra source pass.
        let mut input=fs::File::open(&path)?;let mut target=fs::OpenOptions::new().write(true).create_new(true).open(&output)?;
        let mut digest=Sha256::new();let mut count=0u64;
        loop {
            if cancel.load(Ordering::Relaxed){return invalid("Build cancelled");}
            let read=input.read(&mut buffer)?;if read==0 {break;}
            count=count.checked_add(read as u64).ok_or_else(||SparkError::Invalid("Tag copy size overflow".into()))?;
            if count>expected_size {return invalid("Source tag size changed while staging");}
            target.write_all(&buffer[..read])?;digest.update(&buffer[..read]);
        }
        drop(target);drop(input);
        if count!=expected_size {return invalid("Source tag size changed while staging");}
        let hash=format!("{:x}",digest.finalize());
        #[cfg(windows)]{let mut p=fs::metadata(&output)?.permissions();p.set_readonly(false);fs::set_permissions(&output,p)?;}
        if maps::hash_file(&output)?!=hash || maps::hash_file(&path)?!=hash{return invalid("Source tags changed while staging");}
        hashes.insert(relative.to_string_lossy().replace('\\',"/"),hash);
        copied+=count;
        if last.elapsed().as_millis()>=500 || index+1==total {progress(index+1,total,copied,bytes);last=Instant::now();}
    }
    Ok(hashes)
}
pub fn run_job(
    project:&Project,tools:&ForgeToolchain,jobs_root:&Path,job_id:&str,export_only:bool,
    extra_blockers:Vec<String>,cancel:Arc<AtomicBool>,on_event:impl Fn(JobEvent)+Send+Sync,
) -> Result<QuickForgeBuildReceipt> {
    run_prepared_job(project,tools,jobs_root,job_id,export_only,extra_blockers,cancel,None,on_event)
}
/// Native semantic recipes must first be materialized and read back by the
/// local reviewed native tools. Pin every staged input to that prepared fork.
pub fn run_prepared_job(
    project:&Project,tools:&ForgeToolchain,jobs_root:&Path,job_id:&str,export_only:bool,
    extra_blockers:Vec<String>,cancel:Arc<AtomicBool>,prepared:Option<&BTreeMap<String,String>>,on_event:impl Fn(JobEvent)+Send+Sync,
) -> Result<QuickForgeBuildReceipt> {
    project.validate()?;
    if project.scene.iter().any(|object|object.source_model.is_some()||object.asset_id.is_some()) {return invalid("Custom/source preview meshes need compiled Halo model and scenario tags before a QuickForge game build. Remove the preview placements or compile their source models first.");}
    uuid::Uuid::parse_str(job_id).map_err(|_|SparkError::Invalid("Job ID is not a UUID".into()))?;
    let document=project.quick_forge.as_ref().ok_or_else(||SparkError::Invalid("This project has no QuickForge document".into()))?;
    let started=Instant::now(); let directory=jobs_root.join(job_id);
    crate::reject_links(&directory)?;fs::create_dir_all(jobs_root)?;fs::create_dir(&directory)?;
    let emit=|phase:&str,message:String,progress:u8,severity:&str|on_event(JobEvent{job_id:job_id.into(),project_id:project.id.clone(),phase:phase.into(),severity:severity.into(),message,progress,timestamp:chrono::Utc::now().to_rfc3339()});
    let mut receipt=QuickForgeBuildReceipt{schema_version:1,job_id:job_id.into(),project_id:project.id.clone(),project_fingerprint:project.fingerprint()?,status:"failed".into(),duration_ms:0,sources:None,blockers:extra_blockers,warnings:vec!["Compiler integration requires an owner-installed HCEEK and extracted legal tags. Source exports and structural validation do not prove game loading or multiplayer.".into()],build:None,tool_identities:BTreeMap::new()};
    let result=(||->Result<()> {
        if cancel.load(Ordering::Relaxed){return invalid("Build cancelled");}
        emit("geometry","Validating editable geometry and writing JMS source".into(),5,"info");
        let sources=quickforge::export_sources(document,&directory.join("workspace"))?;
        receipt.blockers.extend(sources.blockers.clone());
        receipt.sources=Some(sources.clone());
        project::save_project(&sources.directory.join("project.gsproject"),project)?;
        if let Some(config)=&project.firefight {project::atomic_write(&sources.directory.join("firefight-authoring.json"),&serde_json::to_vec_pretty(config)?,false)?;}
        if export_only {receipt.status="exported".into();return Ok(());}
        if document.native.is_some() && prepared.is_none() {return invalid("Native shared source requires an explicit local verified materialization before compilation");}
        let engine=match target(document.runtime_id){Ok(v)=>Some(v),Err(e)=>{receipt.blockers.push(e.to_string());None}};
        if project.firefight.is_some(){receipt.blockers.push("Firefight rules are authored and locally simulated, but no supported game-side wave bridge has been implemented or verified. A Firefight game build is blocked.".into());}
        let tool=tool_file(tools);
        match document.runtime_id {
            RuntimeId::MccSteam if tools.hek_flavor.as_deref()!=Some("h1aEk") =>
                receipt.blockers.push("MCC/H1A builds require an explicitly selected H1A Editing Kit, not classic HEK. Configure the kit generation in Settings.".into()),
            RuntimeId::HaloCustomEdition if tools.hek_flavor.as_deref()!=Some("legacyHek") &&
                !(tools.hek_flavor.as_deref()==Some("h1aEk") && project.active_build_target.as_ref().is_some_and(|id|
                    project.build_targets.iter().any(|p|&p.id==id&&p.ce_compatible_tagset))) =>
                receipt.blockers.push("CE requires classic HEK or an explicitly reviewed H1A authoring profile with a CE base tagset. Invader must build gbx-custom output.".into()),
            RuntimeId::OpenCe|RuntimeId::ChupathingyCe =>
                receipt.blockers.push("OpenCE / ChupathingyCE target-specific structure and runtime output have not been verified. Export sources and validate with the actual runtime before enabling compilation.".into()),
            _ => (),
        }
        if tool.is_none(){receipt.blockers.push("Halo 1 Editing Kit Tool is missing. Select the separately installed matching HEK or H1A kit folder in Settings.".into());}
        let tags=tools.hek_tags_directory.clone().or_else(||tools.hek_directory.as_ref().map(|p|p.join("tags")));
        if tags.as_ref().is_none_or(|p|!p.is_dir()){receipt.blockers.push("Legal editable base tags are missing. Select the extracted HCEEK tags folder in Settings.".into());}
        for name in ["invader-edit","invader-build","invader-info"] {if name=="invader-build"&&document.runtime_id==RuntimeId::MccSteam{continue;}if invader(tools,name).is_none(){receipt.blockers.push(format!("{name} is missing from the selected Invader folder"));}}
        if let Some(tags)=tags.as_ref().filter(|p|p.is_dir()) {
            for dependency in &sources.dependencies {
                match dependency_path(tags,&dependency.tag_path,&dependency.tag_class) {
                    Ok(p) if p.is_file()=>{},
                    Ok(_)=>receipt.blockers.push(format!("Missing editable dependency {} ({}) in selected tags",dependency.tag_path,dependency.tag_class)),
                    Err(e)=>receipt.blockers.push(e.to_string()),
                }
            }
            if !tags.join("globals/globals.globals").is_file(){receipt.blockers.push("The selected base tag tree has no globals/globals.globals".into());}
        }
        if !receipt.blockers.is_empty(){receipt.status="blocked".into();return Ok(());}
        let (engine,version)=engine.unwrap(); let tool=tool.unwrap();
        let mut executables=vec![("haloTool",tool.clone()),("invaderEdit",invader(tools,"invader-edit").unwrap()),("invaderInfo",invader(tools,"invader-info").unwrap())];
        if document.runtime_id!=RuntimeId::MccSteam{executables.push(("invaderBuild",invader(tools,"invader-build").unwrap()));}
        for (name,path) in executables {
            crate::reject_links(&path)?;receipt.tool_identities.insert(name.into(),maps::hash_file(&path)?);
        }
        emit("dependencies","Copying and hashing owner-selected tags into an isolated job".into(),15,"info");
        let workspace=&sources.directory;let stage=workspace.join("tags");
        let hashes=stage_tags(tags.as_ref().unwrap(),&stage,&cancel,|done,total,bytes,total_bytes|emit("tag-staging",format!("Prepared {done}/{total} tags · {}/{} MiB",bytes/(1024*1024),total_bytes/(1024*1024)),(15+done*8/total.max(1)) as u8,"info"))?;
        if prepared.is_some_and(|expected|expected!=&hashes) {return invalid("Prepared native revision changed before compilation; no Halo compiler was started");}
        if let Some(native)=&document.native {
            for asset in &native.assets {if hashes.get(&format!("{}.scenery",asset.tag_path()))!=Some(&asset.sha256){return invalid("Prepared source omitted or changed a published native asset");}}
            project::atomic_write(&directory.join("native-source-binding.json"),&serde_json::to_vec_pretty(&(document.native.as_ref(),&hashes))?,false)?;
        }
        project::atomic_write(&directory.join("input-tags.json"),&serde_json::to_vec_pretty(&hashes)?,false)?;
        let material_blockers=audit_material_bindings(document,hashes.keys())?;
        if !material_blockers.is_empty(){receipt.blockers.extend(material_blockers);receipt.status="blocked".into();return Ok(());}
        let scenario_file=stage.join(safe_relative(&format!("{}.scenario",sources.scenario_path))?);
        if scenario_file.parent().is_some_and(|p|p.exists()){return invalid("Generated scenario namespace already exists in the supplied tags. Choose a unique project name; stale BSP/lightmap/item tags cannot be accepted as new output.");}
        let runner=Runner{id:job_id,project:&project.id,cancel:&cancel,event:&on_event};
        for (index,command) in sources.commands.iter().enumerate() {
            if cancel.load(Ordering::Relaxed){return invalid("Build cancelled");}
            for expected in &command.expected_outputs {
                let output=workspace.join(safe_relative(expected)?);
                crate::reject_links(&output)?;
                fs::create_dir_all(output.parent().unwrap())?;
            }
            let (executable,mut args)=match command.tool.as_str(){
                "haloTool"=>{
                    // Classic HEK Tool only understands the conventional data/tags
                    // folders at the process working directory. All sources and
                    // copied tags are already isolated in `workspace`.
                    // H1A Tool, in contrast, supports custom content path flags.
                    let kit_args=halo_tool_prefix(tools.hek_flavor.as_deref(),workspace,&stage)?;
                    (tool.clone(),kit_args)
                },
                "invaderEdit"=>(invader(tools,"invader-edit").unwrap(),vec!["-t".into(),stage.to_string_lossy().into_owned()]),
                other=>return invalid(format!("Unsupported compiler command {other}")),
            };
            args.extend(command.args.clone());
            let output=runner.run(&executable,&args,workspace,&command.phase,(25+index*45/sources.commands.len().max(1)) as u8)?;
            if let Some(line)=output.lines().find(|line|{let text=line.to_ascii_lowercase();text.contains("### error")||text.contains("exception halt")||text.contains("exception_breakpoint")}){return invalid(format!("{} compiler rejected the source: {}",command.phase,line.chars().take(400).collect::<String>()));}
            for expected in &command.expected_outputs {
                let file=workspace.join(safe_relative(expected)?);crate::reject_links(&file)?;
                if !file.is_file() || fs::metadata(file)?.len()<64{return invalid(format!("{} did not produce a complete expected tag: {expected}",command.phase));}
            }
        }
        let output_dir=directory.join("output");fs::create_dir(&output_dir)?;
        crate::powerups::prepare(project,&sources.scenario_path,workspace,&stage,&invader(tools,"invader-edit").unwrap(),&runner)?;
        let output=output_dir.join(format!("{}.map",sources.bsp_name));
        if document.runtime_id==RuntimeId::MccSteam {
            crate::engine_machinima::prepare(project,&sources.scenario_path,workspace,&invader(tools,"invader-edit").unwrap(),&runner,0)?;
            // H1A native tags include model classes/fields which Invader's
            // classic input parser cannot compile. Use the matching SDK Tool.
            let mut args=halo_tool_prefix(tools.hek_flavor.as_deref(),workspace,&stage)?;
            args.extend(["build-cache-file".into(),sources.scenario_path.clone(),"classic".into(),"none".into()]);
            let log=runner.run(&tool,&args,workspace,"compile",82)?;
            if !log.to_ascii_lowercase().contains("successfully built cache file."){return invalid("H1A Tool did not confirm cache compilation; inspect its log");}
            let compiled=workspace.join("maps").join(format!("{}.map",sources.bsp_name));crate::reject_links(&compiled)?;
            fs::copy(compiled,&output)?;
        }else{
            runner.run(&invader(tools,"invader-build").unwrap(),&["-g".into(),engine.into(),"-t".into(),stage.to_string_lossy().into_owned(),"-m".into(),output_dir.to_string_lossy().into_owned(),"--resource-usage".into(),"none".into(),sources.scenario_path.clone()],workspace,"compile",82)?;
        }
        let inspected=maps::inspect_map(&output,None)?;
        crate::powerups::verify_compiled(project,&inspected,workspace)?;
        if inspected.header.version!=version || !inspected.scenario_path.replace('\\',"/").eq_ignore_ascii_case(&sources.scenario_path.replace('\\',"/")) || inspected.header.scenario_type!=1 || inspected.mesh.indices.is_empty() {return invalid("Compiled map has wrong engine/scenario/type or no collision BSP");}
        for check in ["crc32_mismatched","is_protected","stub_count"] {
            let value=runner.run(&invader(tools,"invader-info").unwrap(),&["-T".into(),check.into(),output.to_string_lossy().into_owned()],workspace,"verify",94)?;
            if !["0","false"].contains(&value.trim().to_ascii_lowercase().as_str()){return invalid(format!("Output {check} verification failed: {value}"));}
        }
        // A compiler result is not accepted if owner-selected inputs changed mid-build.
        for (relative,expected) in &hashes {
            let source=tags.as_ref().unwrap().join(safe_relative(relative)?);
            if maps::hash_file(&source)?!=*expected{return invalid("Owner-selected source tag identity changed during compilation");}
        }
        for placement in &document.placements {
            if !inspected.tags.iter().any(|tag|tag.class==placement.tag_class&&tag.path.replace('\\',"/").eq_ignore_ascii_case(&placement.tag_path.replace('\\',"/"))) {return invalid(format!("Built cache omits placed asset {}",placement.name));}
        }
        let record=BuildRecord{id:job_id.into(),timestamp:chrono::Utc::now().to_rfc3339(),status:"validated".into(),target:engine.into(),output:Some(output.clone()),sha256:Some(maps::hash_file(&output)?),message:"QuickForge BSP/scenario compiled and cache structure/CRC validated. Fast radiosity preview; target-game load, packaging and multiplayer remain untested.".into(),project_fingerprint:project.fingerprint()?};
        project::atomic_write(&directory.join("receipt.json"),&serde_json::to_vec_pretty(&record)?,false)?;
        receipt.build=Some(record);receipt.status="validated".into();Ok(())
    })();
    if let Err(e)=result {receipt.blockers.push(e.to_string());receipt.status=if cancel.load(Ordering::Relaxed){"cancelled"}else{"failed"}.into();}
    receipt.duration_ms=started.elapsed().as_millis() as u64;
    project::atomic_write(&directory.join("quickforge-receipt.json"),&serde_json::to_vec_pretty(&receipt)?,false)?;
    emit(&receipt.status,if receipt.blockers.is_empty(){format!("QuickForge {} in {} ms",receipt.status,receipt.duration_ms)}else{receipt.blockers.join("\n")},100,if receipt.status=="validated"{"success"}else if receipt.status=="exported"{"info"}else{"error"});
    Ok(receipt)
}

#[cfg(test)]
mod tool_generation_tests {
    use super::*;
    #[test]
    fn staging_verifies_copied_bytes_preserves_sources_and_reports_completion() {
        let root=tempfile::tempdir().unwrap();let source=root.path().join("source");fs::create_dir(&source).unwrap();
        fs::create_dir(source.join("nested")).unwrap();fs::write(source.join("nested/fixture.bitmap"),b"synthetic bitmap bytes").unwrap();fs::write(source.join("fixture.scenery"),b"synthetic scenery bytes").unwrap();
        let mut progress=vec![];let destination=root.path().join("staged");
        let hashes=stage_tags(&source,&destination,&AtomicBool::new(false),|a,b,c,d|progress.push((a,b,c,d))).unwrap();
        assert_eq!(hashes.len(),2);
        for (file,hash) in &hashes {assert_eq!(&maps::hash_file(&source.join(file)).unwrap(),hash);assert_eq!(&maps::hash_file(&destination.join(file)).unwrap(),hash);}
        let complete=progress.last().unwrap();assert_eq!((complete.0,complete.1),(2,2));assert_eq!(complete.2,complete.3);
        assert!(stage_tags(&source,&destination,&AtomicBool::new(false),|_,_,_,_|{}).is_err(),"A nonempty staging destination cannot be overwritten");
    }
    #[test]
    fn staging_inside_source_is_rejected_before_creating_a_directory() {
        let root=tempfile::tempdir().unwrap();let source=root.path().join("source");fs::create_dir(&source).unwrap();
        let nested=source.join("staged");
        assert!(stage_tags(&source,&nested,&AtomicBool::new(false),|_,_,_,_|{}).is_err());
        assert!(!nested.exists(),"Canonical Windows prefixes must not permit writes inside the source tree");
    }
    #[test]
    fn staging_cancellation_does_not_copy_or_change_source_files() {
        let root=tempfile::tempdir().unwrap();let source=root.path().join("source");fs::create_dir(&source).unwrap();fs::write(source.join("fixture.bitmap"),b"owned synthetic source").unwrap();
        let cancel=AtomicBool::new(false);let destination=root.path().join("staged");
        assert!(stage_tags(&source,&destination,&cancel,|_,_,_,_|cancel.store(true,Ordering::Relaxed)).is_err());
        assert_eq!(fs::read(source.join("fixture.bitmap")).unwrap(),b"owned synthetic source");assert_eq!(fs::read_dir(destination).unwrap().count(),0);
    }
    #[test]
    fn classic_hek_does_not_receive_h1a_path_flags() {
        let cwd=Path::new("/tmp/isolated_halo_job");
        let args=halo_tool_prefix(Some("legacyHek"),cwd,&cwd.join("tags")).unwrap();
        assert!(args.is_empty());
        assert!(halo_tool_prefix(None,cwd,&cwd.join("tags")).is_err());
        assert!(halo_tool_prefix(Some("other"),cwd,&cwd.join("tags")).is_err());
    }
    #[test]
    fn h1a_tool_receives_scoped_content_paths_only() {
        let cwd=Path::new("/tmp/isolated_halo_job");
        let args=halo_tool_prefix(Some("h1aEk"),cwd,&cwd.join("tags")).unwrap();
        assert_eq!(args.len(),6);
        assert_eq!(args[0],"-data_dir");
        assert_eq!(args[2],"-tags_dir");
        assert_eq!(args[4],"-game_root_dir");
        assert_eq!((&args[1],&args[3],&args[5]),(&"data".to_string(),&"tags".to_string(),&".".to_string()));
        assert!(halo_tool_prefix(Some("h1aEk"),cwd,Path::new("/different/tags")).is_err());
    }
}
