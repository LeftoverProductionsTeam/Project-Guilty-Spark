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
    let expected=match profile.runtime_id {RuntimeId::MccSteam=>"h1a-tool",RuntimeId::HaloCustomEdition|RuntimeId::ChupathingyCe=>"invader-ce",
        _=>return invalid("This runtime has no verified integrated builder; retain its configuration and export source for research")};
    if profile.builder!=expected {return invalid("Selected builder produces the wrong engine output");}
    if profile.runtime_id==RuntimeId::MccSteam && profile.hek_flavor.as_deref()!=Some("h1aEk") {
        return invalid("MCC source compilation requires the H1A editing kit");
    }
    if matches!(profile.runtime_id,RuntimeId::HaloCustomEdition|RuntimeId::ChupathingyCe) && !profile.ce_compatible_tagset {
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
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub source_document_sha256: Option<String>,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub current: Option<bool>,
    pub status: String,
    pub duration_ms: u64,
    pub sources: Option<SourceExport>,
    pub blockers: Vec<String>,
    pub warnings: Vec<String>,
    pub build: Option<BuildRecord>,
    pub tool_identities: BTreeMap<String,String>,
}
/// Used only after the caller verifies the exact current native build and its
/// owned source. Retain the dependency subset without prior generated geometry.
pub fn collaboration_input_hashes(job: &Path, tags: &Path) -> Result<BTreeMap<String,String>> {
    crate::forge_reuse::admission_inputs(job, tags)
}
/// H1A loads these native tags outside the scenario's recursive cache closure.
/// Keep this exact SDK contract separate from CE or Xbox runtime resources.
pub fn h1a_scene_roots(scenario_type:u16)->Result<Vec<&'static str>> {
    let collection=match scenario_type {
        0=>"ui/ui_tags_loaded_solo_scenario_type.tag_collection",
        1=>"ui/ui_tags_loaded_multiplayer_scenario_type.tag_collection",
        2=>"ui/ui_tags_loaded_mainmenu_scenario_type.tag_collection",
        _=>return invalid("Unsupported H1A scenario type for a Standalone source test"),
    };
    let mut roots=vec!["ui/ui_tags_loaded_all_scenario_types.tag_collection",collection,
        "ui/shell/bitmaps/background.bitmap","ui/shell/strings/loading.unicode_string_list",
        "ui/shell/bitmaps/trouble_brewing.bitmap","sound/sfx/ui/cursor.sound",
        "sound/sfx/ui/forward.sound","sound/sfx/ui/back.sound"];
    if scenario_type==1 {roots.extend(["ui/shell/main_menu/mp_map_list.unicode_string_list",
        "ui/shell/bitmaps/team_icon_slayer.bitmap","ui/shell/bitmaps/team_background.bitmap"]);}
    Ok(roots)
}
/// Read-only launch preflight, not game or semantic acceptance. Native builds
/// recursively validate/hash the complete optional closure when it is available.
pub fn h1a_scene_preflight(tags:&Path,scenario_type:u16)->Result<()> {
    use std::io::Read;
    crate::reject_links(tags)?;let mut missing=vec![];
    for relative in h1a_scene_roots(scenario_type)? {
        let file=tags.join(safe_relative(relative)?);crate::reject_links(&file)?;
        let usable=(||->Result<bool>{
            let mut input=match fs::File::open(&file){Ok(input)=>input,Err(error) if error.kind()==std::io::ErrorKind::NotFound=>return Ok(false),Err(error)=>return Err(error.into())};
            let metadata=input.metadata()?;if !metadata.is_file()||metadata.len()<64||metadata.len()>64*1024*1024{return Ok(false);}
            let mut header=[0u8;64];input.read_exact(&mut header)?;
            let class=std::str::from_utf8(&header[36..40]).unwrap_or("");
            Ok(&header[60..64]==b"blam"&&crate::tag_exchange::extension(class).ok()==file.extension().and_then(|s|s.to_str()))
        })()?;
        if !usable{missing.push(relative);}
    }
    if !missing.is_empty(){return invalid(format!("Standalone needs {} matching H1A UI/shell source tag(s): {}. Choose the matching legal SDK tags and rebuild; the native cache and editable source were retained. A valid cache alone does not include these extra source-test dependencies.",missing.len(),missing.into_iter().take(4).collect::<Vec<_>>().join("; ")));}
    Ok(())
}
fn reuse_has_scene_sources(tools:&ForgeToolchain,receipt:&QuickForgeBuildReceipt,document:&quickforge::QuickForgeDocument)->bool {
    if tools.hek_flavor.as_deref()!=Some("h1aEk"){return true;}
    let source=tools.hek_tags_directory.clone().or_else(||tools.hek_directory.as_ref().map(|p|p.join("tags")));
    let kind=quickforge::native_scenario_type(document);
    // An SDK may intentionally provide only a cache-build subset. Do not make
    // optional Standalone UI data a requirement for those existing builds.
    if source.as_ref().is_none_or(|tags|h1a_scene_preflight(tags,kind).is_err()){return true;}
    receipt.sources.as_ref().is_some_and(|s|h1a_scene_preflight(&s.directory.join("tags"),kind).is_ok())
}
// Re-derive console grammar from the validated document. Receipt metadata is not authority.
fn workshop_playtest_scenario(document:&quickforge::QuickForgeDocument,receipt_path:&str)->Result<String>{
    let expected=quickforge::scenario_path(document)?;
    if receipt_path!=expected{return invalid("Workshop receipt scenario differs from its verified source document");}
    Ok(expected)
}
/// Owner-run Standalone acceptance. Keep the existing short-path alias alive for
/// the whole game process; dropping it after spawn makes lazy tag reads fail.
/// This verifies the source/build identities but does not certify player movement.
#[cfg(windows)]
pub fn workshop_playtest(receipt:&QuickForgeBuildReceipt,kit:&Path)->Result<()> {
    workshop_playtest_with_debug(receipt,kit,false)
}
#[cfg(windows)]
pub fn workshop_playtest_with_debug(receipt:&QuickForgeBuildReceipt,kit:&Path,debug:bool)->Result<()> {
    if receipt.status!="validated" {return invalid("Only a validated native Workshop build can be playtested");}
    let sources=receipt.sources.as_ref().ok_or_else(||SparkError::Invalid("Missing source receipt".into()))?;
    let build=receipt.build.as_ref().ok_or_else(||SparkError::Invalid("Missing native build receipt".into()))?;
    let output=build.output.as_ref().ok_or_else(||SparkError::Invalid("Missing compiled output".into()))?;
    if build.sha256.as_deref()!=Some(maps::hash_file(output)?.as_str())||sources.jms_sha256!=maps::hash_file(&sources.jms_path)? {return invalid("Workshop output or source JMS changed since compilation");}
    let project=project::load_project(&sources.directory.join("project.gsproject"))?;
    if project.fingerprint()?!=receipt.project_fingerprint||project.quick_forge.as_ref().is_none_or(|d|d.workshop.is_none()||d.runtime_id!=RuntimeId::MccSteam) {return invalid("Workshop source is not the exact compiled MCC project");}
    let scenario=workshop_playtest_scenario(project.quick_forge.as_ref().unwrap(),&sources.scenario_path)?;
    h1a_scene_preflight(&sources.directory.join("tags"),quickforge::native_scenario_type(project.quick_forge.as_ref().unwrap()))?;
    let exe=kit.join("halo_tag_test.exe");crate::reject_links(&exe)?;
    let alias=crate::native_workspace::Alias::new(&sources.directory)?;
    let init_name=format!("spark-workshop-{}.txt",uuid::Uuid::new_v4());
    let debug_commands=if debug {"debug_trigger_volumes true\r\ndebug_scripting true\r\n"}else{""};
    project::atomic_write(&sources.directory.join(&init_name),format!("game_variant slayer\r\nmap_name \"{}\"\r\n{}",scenario,debug_commands).as_bytes(),false)?;
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
// A Chupathingy authoring document emits standard CE tags, never an Xbox/MCC
// cache relabel. Require the same explicit reviewed CE profile as its build route.
fn authoring_preflight(project:&Project,tools:&ForgeToolchain,document:&quickforge::QuickForgeDocument)->Result<()> {
    let selected=project.active_build_target.as_ref().and_then(|id|project.build_targets.iter().find(|p|&p.id==id));
    let reviewed=selected.is_some_and(|p|p.ce_compatible_tagset&&p.builder=="invader-ce"&&!p.open_sauce&&matches!(p.runtime_id,RuntimeId::HaloCustomEdition|RuntimeId::ChupathingyCe));
    match document.runtime_id {
        RuntimeId::MccSteam if tools.hek_flavor.as_deref()!=Some("h1aEk")=>invalid("MCC/H1A builds require an explicitly selected H1A Editing Kit, not classic HEK. Configure the kit generation in Settings."),
        RuntimeId::HaloCustomEdition if tools.hek_flavor.as_deref()!=Some("legacyHek")&&!(tools.hek_flavor.as_deref()==Some("h1aEk")&&reviewed)=>invalid("CE requires classic HEK or an explicitly reviewed H1A authoring profile with a CE base tagset. Invader must build gbx-custom output."),
        RuntimeId::ChupathingyCe if !reviewed||!selected.is_some_and(|p|p.runtime_id==RuntimeId::ChupathingyCe)||!matches!(tools.hek_flavor.as_deref(),Some("legacyHek"|"h1aEk"))=>invalid("Chupathingy needs its selected, reviewed CE base tagset and a compatible authoring kit. Invader must build standard gbx-custom output; Xbox/MCC caches are not substituted."),
        RuntimeId::OpenCe=>invalid("OpenCE target-specific structure and runtime output have not been verified. Export sources and validate with the actual runtime before enabling compilation."),
        _=>Ok(()),
    }
}
fn target(runtime: RuntimeId)->Result<(&'static str,u32)> {
    match runtime {
        RuntimeId::MccSteam=>Ok(("mcc-cea",13)),
        RuntimeId::ChupathingyCe|RuntimeId::OpenCe|RuntimeId::HaloCustomEdition=>Ok(("gbx-custom",609)),
        _=>invalid("QuickForge compilation currently targets MCC or Custom Edition-compatible caches only"),
    }
}
pub fn dependency_path(root:&Path,path:&str,class:&str)->Result<PathBuf> {
    let extension=match class {"senv"|"shader_environment"=>"shader_environment","soso"|"shader_model"=>"shader_model","sky "|"sky"=>"sky","weap"|"weapon"=>"weapon","eqip"|"equipment"=>"equipment","itmc"|"item_collection"=>"item_collection","vehi"|"vehicle"=>"vehicle","scen"|"scenery"=>"scenery","actv"|"actor_variant"=>"actor_variant","bipd"|"biped"=>"biped","mach"|"device_machine"=>"device_machine",_=>return invalid(format!("Unsupported build dependency class {class}"))};
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
    crate::native_staging::destination(source,destination)?;
    let plan=crate::native_staging::inventory(source,cancel)?;
    crate::native_staging::copy(source,destination,&plan,cancel,&mut progress)
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeBuildPeak {
    selected_tag_files: usize,
    selected_tag_bytes: u64,
    imported_tag_files: usize,
    imported_tag_bytes: u64,
    authored_source_bytes: u64,
    compiler_output_bytes: u64,
    reserved_bytes: u64,
}

fn native_build_peak(selected: &crate::native_staging::Inventory, imported: &crate::native_staging::Inventory, authored_source_bytes: u64) -> Result<NativeBuildPeak> {
    let overflow = || SparkError::Invalid("Native build peak estimate overflow; no staging was allocated".into());
    let payload = selected.bytes.checked_add(imported.bytes).and_then(|n| n.checked_add(authored_source_bytes)).ok_or_else(overflow)?;
    // H1A can retain the compiler's map and its adopted output simultaneously.
    // Keep the existing 1 GiB floor, scaling it for larger selected inputs.
    let compiler_output_bytes = payload.checked_mul(2).ok_or_else(overflow)?.max(1024 * 1024 * 1024);
    let copies = crate::storage::estimate_copy(selected.files.len(), selected.bytes)
        .checked_add(crate::storage::estimate_copy(imported.files.len(), imported.bytes)).ok_or_else(overflow)?;
    let reserved_bytes = copies.checked_add(authored_source_bytes).and_then(|n| n.checked_add(compiler_output_bytes)).ok_or_else(overflow)?;
    Ok(NativeBuildPeak { selected_tag_files: selected.files.len(), selected_tag_bytes: selected.bytes,
        imported_tag_files: imported.files.len(), imported_tag_bytes: imported.bytes,
        authored_source_bytes, compiler_output_bytes, reserved_bytes })
}

fn admit_native_job(store: &crate::storage::Store, directory: &Path, source: Option<&Path>, estimate: u64) -> Result<crate::storage::Lease> {
    store.reserve(directory, source, estimate, crate::storage::Category::Staging,
        "Native BSP peak: validated dependency/import copies, authored sources and compiler/output headroom")
        .map_err(|error| SparkError::Invalid(format!("Native build peak admission rejected ({estimate} bytes reserved); no new job or tag staging was created. {error}")))
}

fn authored_source_reserve(project: &Project, custom: &crate::model_build::Plan) -> Result<u64> {
    let mut bytes = 16 * 1024 * 1024u64; // bounded source manifests, logs and authoring metadata
    for extra in std::iter::once(quickforge::export_jms(&custom.document)?.len() as u64)
        .chain(std::iter::once(serde_json::to_vec(project)?.len() as u64))
        .chain(custom.models.iter().map(|model| (model.jms.len() as u64).saturating_mul(2))) {
        bytes = bytes.checked_add(extra).ok_or_else(|| SparkError::Invalid("Native authored-source estimate overflow".into()))?;
    }
    Ok(bytes)
}

/// Resolve a future jobs path without creating it. Missing dependencies and
/// rejected admission must not create a new job or writable source tree.
fn future_jobs_root(root: &Path) -> Result<PathBuf> {
    crate::reject_links(root)?;
    let absolute = std::path::absolute(root)?;
    let mut existing = absolute.as_path();
    let mut missing = vec![];
    while !existing.exists() {
        missing.push(existing.file_name().ok_or_else(|| SparkError::Invalid("Jobs folder has no existing ancestor".into()))?.to_owned());
        existing = existing.parent().ok_or_else(|| SparkError::Invalid("Jobs folder has no existing ancestor".into()))?;
    }
    if !existing.is_dir() { return invalid("Jobs folder ancestor is not a directory"); }
    let mut resolved = fs::canonicalize(existing)?;
    for name in missing.into_iter().rev() { resolved.push(name); }
    Ok(resolved)
}

struct NativeInputs {
    all: crate::native_staging::Inventory,
    selected: crate::native_staging::Inventory,
    imported: crate::native_staging::Inventory,
    model_class_bindings: BTreeMap<String, String>,
    dependency_tool_sha256: String,
    peak: NativeBuildPeak,
}

fn validate_prepared_inventory(source: &Path, inventory: &crate::native_staging::Inventory, expected: &BTreeMap<String, String>) -> Result<()> {
    if inventory.files.len() != expected.len() || inventory.files.iter().any(|file| !expected.contains_key(&file.path)) {
        return invalid("Prepared native dependency inventory has missing or extra files; no job or tag staging was created");
    }
    for file in &inventory.files {
        let input = source.join(crate::native_staging::admitted_relative(&file.path)?);
        crate::reject_links(&input)?;
        if maps::hash_file(&input)? != expected[&file.path] {
            return invalid("Prepared native dependency source hash changed; no job or tag staging was created");
        }
    }
    Ok(())
}

/// Use the same recursive Invader/H1A dependency contract as the compiler path.
/// The callback is read-only; the returned inventory is reused, never replanned
/// against a different source revision after storage has been admitted.
fn dependency_subset(
    source: &Path, all: &crate::native_staging::Inventory,
    dependencies: &[quickforge::ForgeDependency], generated: &std::collections::BTreeSet<String>,
    imported: &std::collections::BTreeSet<String>, extra_roots: std::collections::BTreeSet<String>,
    h1a: bool, read: impl FnMut(&str) -> Result<String>,
) -> Result<(crate::native_staging::Inventory, BTreeMap<String, String>)> {
    let mut roots = std::collections::BTreeSet::from(["globals/globals.globals".to_owned()]);
    for dependency in dependencies {
        if generated.contains(&format!("{}.scenery", dependency.tag_path.replace('\\', "/"))) && dependency.tag_class == "scenery" { continue; }
        if imported.contains(&format!("{}.{}", dependency.tag_path.replace('\\', "/"), dependency.tag_class)) { continue; }
        let file = dependency_path(source, &dependency.tag_path, &dependency.tag_class)?;
        roots.insert(file.strip_prefix(source).map_err(|_| SparkError::Invalid("Source dependency escaped its root".into()))?.to_string_lossy().replace('\\', "/"));
    }
    roots.extend(extra_roots);
    roots.retain(|path| !imported.contains(&path.replace('\\', "/").to_ascii_lowercase()));
    let (selected,bindings)=crate::native_staging::collect_dependency_files(source,roots,h1a,all.files.len().max(1),20000,read)?;
    Ok((crate::native_staging::selected_inventory(all, &selected)?, bindings))
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
    let custom=crate::model_build::plan(project)?;
    let generated=custom.generated();
    uuid::Uuid::parse_str(job_id).map_err(|_|SparkError::Invalid("Job ID is not a UUID".into()))?;
    let document=&custom.document;
    let started=Instant::now();
    let jobs_root=future_jobs_root(jobs_root)?;
    if !export_only&&prepared.is_none()&&extra_blockers.is_empty(){
        if let Some(receipt)=crate::forge_reuse::find(project,tools,&jobs_root).filter(|receipt|reuse_has_scene_sources(tools,receipt,document)){
            if !custom.models.is_empty(){let output=receipt.build.as_ref().and_then(|build|build.output.as_deref()).ok_or_else(||SparkError::Invalid("Reused model build has no native output".into()))?;custom.inspect_cache(&maps::inspect_map(output,None)?,output)?;custom.verify_sources()?;}
            on_event(JobEvent{job_id:job_id.into(),project_id:project.id.clone(),phase:"validated".into(),severity:"success".into(),progress:100,timestamp:chrono::Utc::now().to_rfc3339(),message:format!("Reused verified build {}. Source, tool, compiled tags and map hashes match; no new tag tree was copied.",receipt.job_id)});return Ok(receipt);
        }
    }
    let directory=jobs_root.join(job_id);
    let selected_tags=tools.hek_tags_directory.clone().or_else(||tools.hek_directory.as_ref().map(|p|p.join("tags")));
    let runner=Runner{id:job_id,project:&project.id,cancel:&cancel,event:&on_event};
    let (mut requirements,mut source_blockers)=quickforge::source_requirements(document)?;
    let native_round=match crate::firefight::native_round_plan(project) {Ok(plan)=>plan,Err(error)=>{source_blockers.push(error.to_string());None}};
    if let Some(plan)=&native_round {requirements.extend(plan.dependencies.clone());}
    let native_inputs=if !export_only && extra_blockers.is_empty() && source_blockers.is_empty() && !cancel.load(Ordering::Relaxed) {
        if let (Some(tags),Some(dependency_tool))=(selected_tags.as_ref().filter(|p|p.is_dir()),invader(tools,"invader-dependency")) {
            let import_root=jobs_root.parent().ok_or_else(||SparkError::Invalid("Managed jobs folder has no library root".into()))?;
            let imported=crate::native_asset_imports::staging_inventory(import_root,project)?;
            let imported_names=imported.files.iter().map(|file|file.path.clone()).collect();
            let all=crate::native_staging::inventory(tags,&cancel)?;
            requirements.extend(custom.shader_dependencies(all.files.iter().chain(imported.files.iter()).map(|file| &file.path))?);
            crate::reject_links(&dependency_tool)?;
            let dependency_tool_sha256=maps::hash_file(&dependency_tool)?;
            let (selected,model_class_bindings)=if let Some(expected)=prepared{validate_prepared_inventory(tags,&all,expected)?;(all.clone(),BTreeMap::new())}else{
                let mut extra=crate::powerups::source_dependencies(project).into_iter().collect::<std::collections::BTreeSet<_>>();
                if tools.hek_flavor.as_deref()==Some("h1aEk")&&h1a_scene_preflight(tags,quickforge::native_scenario_type(document)).is_ok() {
                    extra.extend(h1a_scene_roots(quickforge::native_scenario_type(document))?.into_iter().map(str::to_owned));
                }
                dependency_subset(tags,&all,&requirements,&generated,&imported_names,
                    extra,tools.hek_flavor.as_deref()==Some("h1aEk"),
                    |requested|runner.run(&dependency_tool,&["-r".into(),"-t".into(),tags.to_string_lossy().into_owned(),requested.into()],tags,"dependencies",2))?
            };
            if maps::hash_file(&dependency_tool)?!=dependency_tool_sha256{return invalid("Native dependency tool changed while planning; no staging was allocated");}
            let peak=native_build_peak(&selected,&imported,authored_source_reserve(project,&custom)?)?;
            Some(NativeInputs{all,selected,imported,model_class_bindings,dependency_tool_sha256,peak})
        }else{None}
    }else{None};
    let estimate=native_inputs.as_ref().map_or(16*1024*1024,|inputs|inputs.peak.reserved_bytes);
    let storage_lease=admit_native_job(&crate::storage::Store::for_output(&directory)?,&directory,selected_tags.as_deref(),estimate)?;
    crate::reject_links(&jobs_root)?;fs::create_dir_all(&jobs_root)?;
    crate::reject_links(&directory)?;fs::create_dir(&directory)?;
    storage_lease.mark_owned()?;
    let emit=|phase:&str,message:String,progress:u8,severity:&str|on_event(JobEvent{job_id:job_id.into(),project_id:project.id.clone(),phase:phase.into(),severity:severity.into(),message,progress,timestamp:chrono::Utc::now().to_rfc3339()});
    let mut receipt=QuickForgeBuildReceipt{schema_version:1,job_id:job_id.into(),project_id:project.id.clone(),project_fingerprint:project.fingerprint()?,source_document_sha256:if custom.models.is_empty(){None}else{Some(quickforge::validate(project.quick_forge.as_ref().unwrap())?.source_sha256)},current:None,status:"failed".into(),duration_ms:0,sources:None,blockers:extra_blockers,warnings:vec!["Compiler integration requires an owner-installed HCEEK and extracted legal tags. Source exports and structural validation do not prove game loading or multiplayer.".into()],build:None,tool_identities:BTreeMap::new()};
    let result=(||->Result<()> {
        if cancel.load(Ordering::Relaxed){return invalid("Build cancelled");}
        emit("geometry","Validating editable geometry and writing JMS source".into(),5,"info");
        let mut sources=quickforge::export_sources(document,&directory.join("workspace"))?;
        if let Some(plan)=&native_round {
            sources.commands.extend(plan.commands.clone());sources.dependencies.extend(plan.dependencies.clone());
            project::atomic_write(&sources.scenario_plan_path,&serde_json::to_vec_pretty(&sources.commands)?,false)?;
        }
        sources.blockers.extend(source_blockers.clone());
        // Include resolved model shader classes in the native build receipt.
        sources.dependencies.extend(requirements.iter().filter(|dependency|dependency.kind=="modelShader").cloned());
        match crate::native_audio::plan(project) {
            Ok(placements) if !placements.is_empty()=>{project::atomic_write(&sources.directory.join("native-audio-intent.json"),&serde_json::to_vec_pretty(&placements)?,false)?;},
            Err(error)=>receipt.blockers.push(error.to_string()),
            _=>(),
        }
        if project.firefight.is_some() && native_round.is_none(){sources.blockers.push("This source has no valid prepared native Firefight round. In Firefight rules, choose Use solo native rules, review Player loadout, then Prepare native solo round and Save before exporting or rebuilding. Multiplayer AI requires a separately supported runtime integration.".into());}
        receipt.blockers.extend(sources.blockers.clone());
        receipt.sources=Some(sources.clone());
        custom.export(&sources.directory)?;
        project::save_project(&sources.directory.join("project.gsproject"),project)?;
        if let Some(config)=&project.firefight {project::atomic_write(&sources.directory.join("firefight-authoring.json"),&serde_json::to_vec_pretty(config)?,false)?;}
        // Keep the on-disk descriptor consistent with the final command/dependency
        // list and source blockers, including export-only jobs. Exported means files
        // were written; receipt blockers still prevent native-ready acceptance.
        project::atomic_write(&sources.directory.join("source-export.json"),&serde_json::to_vec_pretty(&sources)?,false)?;
        if export_only {receipt.status="exported".into();return Ok(());}
        if document.native.is_some() && prepared.is_none() {return invalid("Native shared source requires an explicit local verified materialization before compilation");}
        let engine=match target(document.runtime_id){Ok(v)=>Some(v),Err(e)=>{receipt.blockers.push(e.to_string());None}};
        let tool=tool_file(tools);
        if let Err(problem)=authoring_preflight(project,tools,document) {receipt.blockers.push(problem.to_string());}
        if tool.is_none(){receipt.blockers.push("Halo 1 Editing Kit Tool is missing. Select the separately installed matching HEK or H1A kit folder in Settings.".into());}
        let tags=tools.hek_tags_directory.clone().or_else(||tools.hek_directory.as_ref().map(|p|p.join("tags")));
        if tags.as_ref().is_none_or(|p|!p.is_dir()){receipt.blockers.push("Legal editable base tags are missing. Select the extracted HCEEK tags folder in Settings.".into());}
        for name in ["invader-edit","invader-build","invader-info","invader-dependency"] {if name=="invader-build"&&document.runtime_id==RuntimeId::MccSteam{continue;}if invader(tools,name).is_none(){receipt.blockers.push(format!("{name} is missing from the selected Invader folder"));}}
        if document.logic.is_some()&&invader(tools,"invader-script").is_none(){receipt.blockers.push("Logic / Events requires invader-script in the selected Invader folder before staging native sources".into());}
        let import_root=jobs_root.parent().ok_or_else(||SparkError::Invalid("Managed jobs folder has no library root".into()))?;
        let imported=if let Some(inputs)=&native_inputs {inputs.imported.files.iter().map(|file|file.path.clone()).collect()}else{crate::native_asset_imports::available_files(import_root,project)?};
        if let Some(tags)=tags.as_ref().filter(|p|p.is_dir()) {
            for dependency in &sources.dependencies {
                if generated.contains(&format!("{}.scenery",dependency.tag_path.replace('\\',"/"))) && dependency.tag_class=="scenery" {continue;}
                if imported.contains(&format!("{}.{}",dependency.tag_path.replace('\\',"/"),dependency.tag_class)){continue;}
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
        let mut executables=vec![("haloTool",tool.clone()),("invaderEdit",invader(tools,"invader-edit").unwrap()),("invaderInfo",invader(tools,"invader-info").unwrap()),("invaderDependency",invader(tools,"invader-dependency").unwrap())];
        if document.logic.is_some(){executables.push(("invaderScript",invader(tools,"invader-script").unwrap()));}
        if document.runtime_id!=RuntimeId::MccSteam{executables.push(("invaderBuild",invader(tools,"invader-build").unwrap()));}
        for (name,path) in executables {
            crate::reject_links(&path)?;receipt.tool_identities.insert(name.into(),maps::hash_file(&path)?);
        }
        if native_inputs.as_ref().is_some_and(|inputs|receipt.tool_identities.get("invaderDependency")!=Some(&inputs.dependency_tool_sha256)){return invalid("Native dependency tool changed after admission; no tags were copied");}
        emit("dependencies","Using admitted native dependency closure before copying tag data".into(),15,"info");
        let workspace=&sources.directory;let stage=workspace.join("tags");
        let source_tags=tags.as_ref().unwrap();
        let inputs=native_inputs.as_ref().ok_or_else(||SparkError::Invalid("Native inputs were not admitted before creating the job; no tags were copied".into()))?;
        let all_inputs=&inputs.all;let plan=&inputs.selected;let model_class_bindings=&inputs.model_class_bindings;
        // Local authored maps have a defined dependency set. Namespaced imports
        // carry their separately verified complete closure and are staged below.
        // Shared prepared revisions retain their complete input hash contract.
        project::atomic_write(&directory.join("staging-plan.json"),&serde_json::to_vec_pretty(&serde_json::json!({"source":source_tags,"sourceFiles":all_inputs.files.len(),"sourceBytes":all_inputs.bytes,"stagedFiles":plan.files.len(),"stagedBytes":plan.bytes,"dependencySubset":plan.files.len()<all_inputs.files.len(),"nativeModelClassBindings":model_class_bindings,"peakReservation":inputs.peak,"mutableHardlinks":false,"reservedDirectoriesExcluded":true}))?,false)?;
        let hashes=crate::native_staging::copy(source_tags,&stage,plan,&cancel,|done,total,bytes,total_bytes|emit("tag-staging",format!("Prepared {done}/{total} required tags · {}/{} MiB",bytes/(1024*1024),total_bytes/(1024*1024)),(15+done*8/total.max(1)) as u8,"info"))?;
        if prepared.is_some_and(|expected|expected!=&hashes) {return invalid("Prepared native revision changed before compilation; no Halo compiler was started");}
        if let Some(native)=&document.native {
            for asset in &native.assets {if hashes.get(&format!("{}.scenery",asset.tag_path()))!=Some(&asset.sha256){return invalid("Prepared source omitted or changed a published native asset");}}
            project::atomic_write(&directory.join("native-source-binding.json"),&serde_json::to_vec_pretty(&(document.native.as_ref(),&hashes))?,false)?;
        }
        project::atomic_write(&directory.join("input-tags.json"),&serde_json::to_vec_pretty(&hashes)?,false)?;
        let import_hashes=crate::native_asset_imports::stage(import_root,project,&stage)?;
        let mut combined_hashes=hashes.clone();combined_hashes.extend(import_hashes.clone());
        let source_names=all_inputs.files.iter().map(|f|&f.path).chain(combined_hashes.keys()).collect::<std::collections::BTreeSet<_>>();
        let material_blockers=audit_material_bindings(document,source_names.into_iter())?;
        if !material_blockers.is_empty(){receipt.blockers.extend(material_blockers);receipt.status="blocked".into();return Ok(());}
        let scenario_file=stage.join(safe_relative(&format!("{}.scenario",sources.scenario_path))?);
        if scenario_file.parent().is_some_and(|p|p.exists()){return invalid("Generated scenario namespace already exists in the supplied tags. Choose a unique project name; stale BSP/lightmap/item tags cannot be accepted as new output.");}
        custom.compile(workspace,&tool,&halo_tool_prefix(tools.hek_flavor.as_deref(),workspace,&stage)?,&invader(tools,"invader-edit").unwrap(),&runner)?;
        let mut reviewed_new_logic_names=false;
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
            let mut native_args=command.args.clone();
            if command.phase=="lightmaps" {
                crate::native_lighting::apply(project,&stage,&sources.scenario_path,&invader(tools,"invader-edit").unwrap(),&runner,workspace)?;
                if let Some(lighting)=crate::native_lighting::request(project){let quality=lighting.lightmap_quality();if native_args.len()!=5||native_args[0]!="lightmaps"{return invalid("Unexpected native lightmap command");}native_args[3]=quality[0].into();native_args[4]=quality[1].into();}
            }
            args.extend(native_args);
            if command.phase=="logic-names"&&!reviewed_new_logic_names {
                // Only a new Tool-generated scenario may receive this bounded
                // Sapien-style name table. Never disable editing safeguards on
                // existing user tags or arbitrary caller-provided commands.
                let count=runner.run(&invader(tools,"invader-edit").unwrap(),&["-t".into(),stage.to_string_lossy().into_owned(),"-C".into(),"object_names".into(),format!("{}.scenario",sources.scenario_path)],workspace,"logic-names-review",45)?;
                if count.trim()!="0"{return invalid("Logic naming requires an empty new scenario table; existing names and handwritten references are protected");}
                reviewed_new_logic_names=true;
            }
            let output=runner.run(&executable,&args,workspace,&command.phase,(25+index*45/sources.commands.len().max(1)) as u8)?;
            if let Some(line)=output.lines().find(|line|{let text=line.to_ascii_lowercase();text.contains("### error")||text.contains("exception halt")||text.contains("exception_breakpoint")}){return invalid(format!("{} compiler rejected the source: {}",command.phase,line.chars().take(400).collect::<String>()));}
            for expected in &command.expected_outputs {
                let file=workspace.join(safe_relative(expected)?);crate::reject_links(&file)?;
                if !file.is_file() || fs::metadata(file)?.len()<64{return invalid(format!("{} did not produce a complete expected tag: {expected}",command.phase));}
            }
        }
        let output_dir=directory.join("output");fs::create_dir(&output_dir)?;
        crate::powerups::prepare(project,&sources.scenario_path,workspace,&stage,&invader(tools,"invader-edit").unwrap(),&runner)?;
        crate::native_audio::prepare(project,&sources.scenario_path,workspace,&stage,&invader(tools,"invader-edit").unwrap(),&runner)?;
        crate::native_logic::compile(document,workspace,&sources.scenario_path,&invader(tools,"invader-edit").unwrap(),engine,&runner)?;
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
        let sound_classes=crate::audio_rules::verify(&output,&inspected)?;
        project::atomic_write(&workspace.join("native-sound-classes.json"),&serde_json::to_vec_pretty(&sound_classes)?,false)?;
        crate::native_asset_imports::verify_compiled(project,&inspected)?;
        crate::native_audio::verify_compiled(project,&inspected,&output)?;
        crate::native_logic::verify_compiled(document,&inspected)?;
        if let Some(plan)=&native_round {crate::firefight::verify_native_round(plan,&inspected)?;}
        crate::native_logic::verify_exported_sources(document,workspace,&sources.scenario_path)?;
        if crate::native_asset_imports::source_hashes(import_root,project)?!=import_hashes{return invalid("Imported native inputs changed during compilation");}
        crate::powerups::verify_compiled(project,&inspected,workspace)?;
        custom.verify_cache(&inspected,&output)?;
        if !custom.models.is_empty(){emit("verify","Imported static models: native topology, winding, normals, UVs, shader identities and collision bounds match source.".into(),93,"info");}
        if inspected.header.version!=version || !inspected.scenario_path.replace('\\',"/").eq_ignore_ascii_case(&sources.scenario_path.replace('\\',"/")) || inspected.header.scenario_type!=quickforge::native_scenario_type(document) || inspected.mesh.indices.is_empty() {return invalid("Compiled map has wrong engine/scenario/type or no collision BSP");}
        for check in ["crc32_mismatched","is_protected","stub_count"] {
            let value=runner.run(&invader(tools,"invader-info").unwrap(),&["-T".into(),check.into(),output.to_string_lossy().into_owned()],workspace,"verify",94)?;
            if !["0","false"].contains(&value.trim().to_ascii_lowercase().as_str()){return invalid(format!("Output {check} verification failed: {value}"));}
        }
        // A compiler result is not accepted if owner-selected inputs changed mid-build.
        for (relative,expected) in &hashes {
            let source=tags.as_ref().unwrap().join(safe_relative(relative)?);
            if maps::hash_file(&source)?!=*expected{return invalid("Owner-selected source tag identity changed during compilation");}
        }
        custom.verify_sources()?;
        for placement in &document.placements {
            if !inspected.tags.iter().any(|tag|tag.class==placement.tag_class&&tag.path.replace('\\',"/").eq_ignore_ascii_case(&placement.tag_path.replace('\\',"/"))) {return invalid(format!("Built cache omits placed asset {}",placement.name));}
        }
        if maps::hash_file(&output)?!=inspected.sha256 {return invalid("Compiled output changed during verification; the modified artifact is rejected and the previous build is retained");}
        crate::forge_reuse::record(&directory,source_tags,&stage,&hashes,&import_hashes,tools)?;
        crate::native_lighting::verify_cache(project,&output,&inspected)?;
        let record=BuildRecord{id:job_id.into(),timestamp:chrono::Utc::now().to_rfc3339(),status:"validated".into(),target:engine.into(),output:Some(output.clone()),sha256:Some(inspected.sha256.clone()),message:if document.native_lighting.is_some(){format!("Native sky settings, BSP lightmap references and cache structure independently verified after {} radiosity. Target-game appearance and gameplay require separate acceptance.",document.native_lighting.as_ref().unwrap().quality)}else{"QuickForge BSP/scenario compiled and cache structure/CRC validated. Fast radiosity preview; target-game load, packaging and multiplayer remain untested.".into()},project_fingerprint:project.fingerprint()?};
        project::atomic_write(&directory.join("receipt.json"),&serde_json::to_vec_pretty(&record)?,false)?;
        receipt.build=Some(record);receipt.status="validated".into();Ok(())
    })();
    if let Err(e)=result {receipt.blockers.push(e.to_string());receipt.status=if cancel.load(Ordering::Relaxed){"cancelled"}else{"failed"}.into();}
    receipt.duration_ms=started.elapsed().as_millis() as u64;
    project::atomic_write(&directory.join("quickforge-receipt.json"),&serde_json::to_vec_pretty(&receipt)?,false)?;
    if matches!(receipt.status.as_str(),"validated"|"exported"){storage_lease.finish(true,Some(receipt.project_fingerprint.clone()))?;}else{drop(storage_lease);}
    emit(&receipt.status,if receipt.blockers.is_empty(){format!("QuickForge {} in {} ms",receipt.status,receipt.duration_ms)}else{receipt.blockers.join("\n")},100,if receipt.status=="validated"{"success"}else if receipt.status=="exported"{"info"}else{"error"});
    Ok(receipt)
}

#[cfg(test)]
mod tool_generation_tests {
    use super::*;
    #[test]
    fn chupathingy_authoring_requires_a_reviewed_ce_profile_and_keeps_other_engines_separate() {
        use crate::project::EngineBuildTarget;
        let mut p=Project::new("Chupathingy authoring");
        let mut doc=quickforge::create_arena("Owned source","smallIndoorArena").unwrap();doc.runtime_id=RuntimeId::ChupathingyCe;
        let mut tools=ForgeToolchain{hek_flavor:Some("h1aEk".into()),..Default::default()};
        assert!(authoring_preflight(&p,&tools,&doc).is_err());
        let id=uuid::Uuid::new_v4().to_string();p.active_build_target=Some(id.clone());
        p.build_targets.push(EngineBuildTarget{id,name:"CE for Chupathingy".into(),runtime_id:RuntimeId::ChupathingyCe,builder:"invader-ce".into(),hek_directory:None,hek_flavor:tools.hek_flavor.clone(),tags_directory:None,invader_directory:None,ce_compatible_tagset:true,open_sauce:false});
        authoring_preflight(&p,&tools,&doc).unwrap();
        tools.hek_flavor=Some("legacyHek".into());authoring_preflight(&p,&tools,&doc).unwrap();
        p.build_targets[0].ce_compatible_tagset=false;assert!(authoring_preflight(&p,&tools,&doc).is_err());p.build_targets[0].ce_compatible_tagset=true;
        p.build_targets[0].builder="h1a-tool".into();assert!(authoring_preflight(&p,&tools,&doc).is_err());p.build_targets[0].builder="invader-ce".into();
        p.build_targets[0].open_sauce=true;assert!(authoring_preflight(&p,&tools,&doc).is_err());p.build_targets[0].open_sauce=false;
        doc.runtime_id=RuntimeId::OpenCe;assert!(authoring_preflight(&p,&tools,&doc).is_err());
        doc.runtime_id=RuntimeId::MccSteam;assert!(authoring_preflight(&p,&tools,&doc).is_err());
    }
    #[test]
    fn native_peak_uses_the_validated_subset_not_unrelated_sdk_bytes() {
        use std::io::{Read, Write};
        let root=tempfile::tempdir().unwrap();let tags=root.path().join("tags");
        fs::create_dir_all(tags.join("globals")).unwrap();fs::create_dir_all(tags.join("bitmaps")).unwrap();
        fs::write(tags.join("globals/globals.globals"),b"identity-only globals").unwrap();
        fs::write(tags.join("bitmaps/used.bitmap"),b"identity-only bitmap").unwrap();
        let cancel=AtomicBool::new(false);
        let subset=|inventory:&crate::native_staging::Inventory|dependency_subset(&tags,inventory,&[],&Default::default(),&Default::default(),Default::default(),false,|_|Ok("bitmaps/used.bitmap".into())).unwrap().0;
        let small=subset(&crate::native_staging::inventory(&tags,&cancel).unwrap());
        let empty=crate::native_staging::Inventory{files:vec![],bytes:0};
        let small_peak=native_build_peak(&small,&empty,16*1024*1024).unwrap();
        // A genuine large metadata fixture, physically only one small cluster.
        // Never allocate/copy a proprietary SDK to exercise peak admission.
        let unrelated=tags.join("unrelated.bitmap");let mut file=fs::File::create(&unrelated).unwrap();
        #[cfg(windows)] {
            use std::os::windows::io::AsRawHandle;
            #[link(name="kernel32")]
            unsafe extern "system" { fn DeviceIoControl(handle:*mut std::ffi::c_void,code:u32,input:*mut std::ffi::c_void,input_bytes:u32,output:*mut std::ffi::c_void,output_bytes:u32,returned:*mut u32,overlapped:*mut std::ffi::c_void)->i32; }
            let mut returned=0;
            assert_ne!(unsafe{DeviceIoControl(file.as_raw_handle(),0x000900c4,std::ptr::null_mut(),0,std::ptr::null_mut(),0,&mut returned,std::ptr::null_mut())},0,"Sparse identity fixture requires native sparse-file support");
        }
        file.write_all(b"unused").unwrap();file.set_len(1024*1024*1024).unwrap();drop(file);
        let before=fs::metadata(&unrelated).unwrap();
        let all=crate::native_staging::inventory(&tags,&cancel).unwrap();assert!(all.bytes>=1024*1024*1024);
        let selected=subset(&all);let peak=native_build_peak(&selected,&empty,16*1024*1024).unwrap();
        assert_eq!(selected.files.len(),2);assert_eq!(peak.reserved_bytes,small_peak.reserved_bytes);
        assert_eq!(peak.compiler_output_bytes,1024*1024*1024);
        let input_hashes=selected.files.iter().map(|row|(row.path.clone(),maps::hash_file(&tags.join(&row.path)).unwrap())).collect::<BTreeMap<_,_>>();
        let staged=root.path().join("staged");let hashes=crate::native_staging::copy(&tags,&staged,&selected,&cancel,|_,_,_,_|{}).unwrap();
        assert_eq!(hashes,input_hashes);assert!(!staged.join("unrelated.bitmap").exists());
        for (relative,hash) in hashes {assert_eq!(maps::hash_file(&tags.join(relative)).unwrap(),hash);}
        assert_eq!(fs::metadata(&unrelated).unwrap().len(),before.len());
        assert_eq!(fs::metadata(&unrelated).unwrap().modified().unwrap(),before.modified().unwrap());
        let mut sentinel=[0;6];fs::File::open(&unrelated).unwrap().read_exact(&mut sentinel).unwrap();assert_eq!(&sentinel,b"unused");
    }
    #[test]
    fn missing_native_dependency_fails_before_creating_jobs_or_running_a_tool() {
        let root=tempfile::tempdir().unwrap();let tags=root.path().join("tags");fs::create_dir(&tags).unwrap();
        let invader=root.path().join("invader");fs::create_dir(&invader).unwrap();
        fs::write(invader.join(if cfg!(windows){"invader-dependency.exe"}else{"invader-dependency"}),b"must not execute").unwrap();
        let mut project=Project::new("Admission fixture");let mut document=quickforge::create_arena("Admission fixture","sealedArena").unwrap();
        for material in &mut document.materials {material.shader_path=Some("materials/fixture".into());}
        document.sky_path=Some("sky/fixture".into());assert!(quickforge::source_requirements(&document).unwrap().1.is_empty());
        project.quick_forge=Some(document);
        let previous=root.path().join("previous-good.map");fs::write(&previous,b"retained previous map").unwrap();let previous_hash=maps::hash_file(&previous).unwrap();
        let jobs=root.path().join("jobs");let tools=ForgeToolchain{hek_tags_directory:Some(tags.clone()),invader_directory:Some(invader),..Default::default()};
        let error=run_job(&project,&tools,&jobs,&uuid::Uuid::new_v4().to_string(),false,vec![],Arc::new(AtomicBool::new(false)),|_|{}).unwrap_err();
        assert!(error.to_string().contains("Native dependency is missing: globals/globals.globals"),"{error}");
        assert!(!jobs.exists());assert_eq!(maps::hash_file(&previous).unwrap(),previous_hash);assert_eq!(fs::read_dir(tags).unwrap().count(),0);
    }
    #[test]
    fn native_peak_budget_rejection_retains_previous_build_and_creates_no_job() {
        let root=tempfile::tempdir().unwrap();let source=root.path().join("tags");fs::create_dir(&source).unwrap();
        let previous=root.path().join("previous-good.map");fs::write(&previous,b"previous validated result").unwrap();let expected=maps::hash_file(&previous).unwrap();
        let store=crate::storage::Store::open(&root.path().join("store")).unwrap();let mut limits=store.limits().unwrap();limits.per_operation_bytes=16*1024*1024;limits.minimum_free_bytes=0;store.set_limits(&limits).unwrap();
        let selected=crate::native_staging::Inventory{files:vec![],bytes:0};let estimate=native_build_peak(&selected,&selected,16*1024*1024).unwrap();
        let job=root.path().join("jobs/new-job");let error=admit_native_job(&store,&job,Some(&source),estimate.reserved_bytes).err().unwrap();
        assert!(error.to_string().contains("Native build peak admission rejected"));assert!(error.to_string().contains("no new job"));
        assert!(!job.parent().unwrap().exists());assert_eq!(maps::hash_file(&previous).unwrap(),expected);
    }
    #[test]
    fn native_peak_includes_imports_dual_output_headroom_and_overflow_refusal() {
        let selected=crate::native_staging::Inventory{files:vec![],bytes:600*1024*1024};
        let imported=crate::native_staging::Inventory{files:vec![crate::native_staging::File{path:"owned/asset.bitmap".into(),bytes:200*1024*1024}],bytes:200*1024*1024};
        let peak=native_build_peak(&selected,&imported,16*1024*1024).unwrap();
        assert_eq!(peak.imported_tag_bytes,imported.bytes);assert_eq!(peak.imported_tag_files,1);assert!(peak.compiler_output_bytes>1024*1024*1024);
        assert!(peak.reserved_bytes>=selected.bytes+imported.bytes+peak.authored_source_bytes+peak.compiler_output_bytes);
        assert!(native_build_peak(&crate::native_staging::Inventory{files:vec![],bytes:u64::MAX},&imported,1).is_err());
    }
    #[test]
    fn prepared_native_inventory_rejects_missing_extra_and_changed_sources_before_job_creation() {
        let root=tempfile::tempdir().unwrap();let tags=root.path().join("tags");fs::create_dir_all(tags.join("globals")).unwrap();
        let source=tags.join("globals/globals.globals");fs::write(&source,b"prepared source identity").unwrap();
        let expected=BTreeMap::from([("globals/globals.globals".to_string(),maps::hash_file(&source).unwrap())]);
        let cancel=AtomicBool::new(false);let inventory=crate::native_staging::inventory(&tags,&cancel).unwrap();
        validate_prepared_inventory(&tags,&inventory,&expected).unwrap();
        let staged=root.path().join("verified-copy");
        assert_eq!(crate::native_staging::copy(&tags,&staged,&inventory,&cancel,|_,_,_,_|{}).unwrap(),expected,"Early validation must retain the complete original copy plan");
        let invader=root.path().join("invader");fs::create_dir(&invader).unwrap();
        fs::write(invader.join(if cfg!(windows){"invader-dependency.exe"}else{"invader-dependency"}),b"must not execute").unwrap();
        let mut project=Project::new("Prepared admission");let mut document=quickforge::create_arena("Prepared admission","sealedArena").unwrap();
        for material in &mut document.materials {material.shader_path=Some("materials/fixture".into());}
        document.sky_path=Some("sky/fixture".into());project.quick_forge=Some(document);
        let tools=ForgeToolchain{hek_tags_directory:Some(tags.clone()),invader_directory:Some(invader),..Default::default()};
        let previous=root.path().join("previous-good.map");fs::write(&previous,b"accepted earlier output").unwrap();let previous_hash=maps::hash_file(&previous).unwrap();
        let run=|name:&str,contract:&BTreeMap<String,String>|{
            let jobs=root.path().join(name).join("jobs");
            let error=run_prepared_job(&project,&tools,&jobs,&uuid::Uuid::new_v4().to_string(),false,vec![],Arc::new(AtomicBool::new(false)),Some(contract),|_|{}).unwrap_err();
            assert!(!jobs.parent().unwrap().exists(),"No job ancestors may be allocated for a rejected prepared revision");
            assert_eq!(maps::hash_file(&previous).unwrap(),previous_hash);
            error.to_string()
        };
        let mut missing=expected.clone();missing.insert("missing.bitmap".into(),"0".repeat(64));
        assert!(run("missing",&missing).contains("missing or extra"));
        assert!(run("extra",&BTreeMap::new()).contains("missing or extra"));
        fs::write(&source,b"new authored source bytes").unwrap();
        assert!(run("changed",&expected).contains("source hash changed"));
        assert_eq!(fs::read(&source).unwrap(),b"new authored source bytes");
    }
    #[test]
    fn h1a_source_test_requires_exact_extra_shell_roots_without_mutating_source() {
        let temp=tempfile::tempdir().unwrap();let tags=temp.path().join("tags");
        assert!(h1a_scene_preflight(&tags,1).unwrap_err().to_string().contains("UI/shell"));assert!(!tags.exists());
        for path in h1a_scene_roots(1).unwrap(){let file=tags.join(path);fs::create_dir_all(file.parent().unwrap()).unwrap();
            let class=if path.ends_with(".tag_collection"){b"tagc"}else if path.ends_with(".bitmap"){b"bitm"}else if path.ends_with(".sound"){b"snd!"}else{b"ustr"};
            let mut bytes=[0u8;64];bytes[36..40].copy_from_slice(class);bytes[60..64].copy_from_slice(b"blam");fs::write(file,bytes).unwrap();}
        // This synthetic header fixture tests admission, not native semantics or gameplay.
        h1a_scene_preflight(&tags,1).unwrap();
        let document=quickforge::create_arena("Reuse shell","smallIndoorArena").unwrap();
        let tools=ForgeToolchain{hek_tags_directory:Some(tags.clone()),hek_flavor:Some("h1aEk".into()),..Default::default()};
        let receipt=QuickForgeBuildReceipt{schema_version:1,job_id:uuid::Uuid::new_v4().to_string(),project_id:uuid::Uuid::new_v4().to_string(),project_fingerprint:String::new(),source_document_sha256:None,current:None,status:"validated".into(),duration_ms:0,sources:None,blockers:vec![],warnings:vec![],build:None,tool_identities:Default::default()};
        assert!(!reuse_has_scene_sources(&tools,&receipt,&document),"a previously cache-only receipt must not suppress newly available scene dependencies");
        let missing=tags.join("ui/shell/bitmaps/team_background.bitmap");fs::write(&missing,b"truncated").unwrap();
        assert!(h1a_scene_preflight(&tags,1).is_err());assert_eq!(fs::read(missing).unwrap(),b"truncated");
        assert!(h1a_scene_roots(0).unwrap().contains(&"ui/ui_tags_loaded_solo_scenario_type.tag_collection"));
        assert!(h1a_scene_roots(2).unwrap().contains(&"ui/ui_tags_loaded_mainmenu_scenario_type.tag_collection"));
        assert!(h1a_scene_roots(7).is_err());
    }
    #[test]
    fn native_source_mode_and_scene_launcher_share_the_campaign_decision() {
        let mut doc=quickforge::create_arena("Source mode","smallIndoorArena").unwrap();assert_eq!(quickforge::native_scenario_type(&doc),1);
        for mode in ["firefight","zombie"] {doc.game_mode=mode.into();assert_eq!(quickforge::native_scenario_type(&doc),0);}
    }
    #[test]
    fn workshop_receipt_cannot_inject_console_grammar_or_select_another_scenario(){
        let doc=crate::bsp_workshop::example().unwrap();let expected=quickforge::scenario_path(&doc).unwrap();
        assert_eq!(workshop_playtest_scenario(&doc,&expected).unwrap(),expected);
        for value in ["levels/test/bloodgulch/bloodgulch", "foo\"\r\nquit\r\n", "foo;quit", "../foo"] {assert!(workshop_playtest_scenario(&doc,value).is_err());}
    }
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
