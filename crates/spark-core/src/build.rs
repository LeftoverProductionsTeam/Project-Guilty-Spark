use crate::{
    invalid,
    maps::{self, MapInspection},
    project::{self, BuildRecord, Project},
    safe_relative, Result, SparkError,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MapExport {
    pub project_id: String,
    pub build_id: String,
    pub project_fingerprint: String,
    pub output: PathBuf,
    pub sha256: String,
    pub bytes: u64,
    pub cache_version: u32,
    pub runtime_id: crate::runtime::RuntimeId,
    pub reused: bool,
}

/// Export a validated owned build, without conversion, overwriting or loading
/// its bytes into RAM. The desktop verifies the job receipt/source revision
/// and excludes original installation directories before calling this helper.
pub fn export_map_copy(
    manager: &crate::storage::Store, project_id: &str, build: &BuildRecord,
    runtime_id: crate::runtime::RuntimeId, base: &Path,
) -> Result<MapExport> {
    use std::io::{Read, Write};
    for id in [project_id, build.id.as_str()] {
        uuid::Uuid::parse_str(id).map_err(|_| SparkError::Invalid("Invalid map export identity".into()))?;
    }
    if build.status != "validated" { return invalid("Export requires a validated build"); }
    let source = build.output.as_ref().ok_or_else(|| SparkError::Invalid("Map output is missing".into()))?;
    crate::reject_links(source)?; crate::reject_links(base)?;
    let hash = build.sha256.as_ref().filter(|h| h.len()==64 && h.bytes().all(|c| c.is_ascii_hexdigit()))
        .ok_or_else(|| SparkError::Invalid("Map export has no valid source hash".into()))?;
    let header = maps::inspect_header(source)?;
    if header.extended || !crate::runtime::supports_map_version(runtime_id, header.version) {
        return invalid("This cache format cannot be exported for that runtime. Choose a compatible target or build a conversion first");
    }
    let bytes = fs::metadata(source)?.len();
    if bytes > 768*1024*1024 || maps::hash_file(source)? != *hash {
        return invalid("Map output changed or exceeds the supported export bound");
    }
    let name = source.file_name().and_then(|n| n.to_str()).ok_or_else(|| SparkError::Invalid("Map filename is unavailable".into()))?;
    if safe_relative(name)?.components().count()!=1 || source.extension().is_none_or(|e| !e.eq_ignore_ascii_case("map")) {
        return invalid("Export requires an ordinary native .map filename");
    }
    let base = fs::canonicalize(base)?;
    let directory = base.join(format!("Spark-{}", build.id));
    crate::reject_links(&directory)?;
    let output = directory.join(name);
    let receipt = directory.join("spark-map-export.json");
    let mut result = MapExport { project_id: project_id.into(), build_id: build.id.clone(),
        project_fingerprint: build.project_fingerprint.clone(), output: output.clone(),
        sha256: hash.clone(), bytes, cache_version: header.version, runtime_id, reused: false };
    if directory.exists() {
        crate::reject_links(&receipt)?; crate::reject_links(&output)?;
        let mut json = Vec::new();
        fs::File::open(&receipt)?.take(65537).read_to_end(&mut json)?;
        if json.len()>65536 { return invalid("Export receipt exceeds its bound"); }
        let existing: MapExport = serde_json::from_slice(&json)?;
        let mut expected = result.clone();
        expected.runtime_id = existing.runtime_id;
        if existing != expected || !crate::runtime::supports_map_version(existing.runtime_id, header.version)
            || fs::metadata(&output)?.len()!=bytes || maps::hash_file(&output)?!=*hash {
            return invalid("The existing export was changed or belongs to another revision; it was not overwritten");
        }
        result.reused = true;
        return Ok(result);
    }
    let lease = manager.reserve(&directory, Some(source), crate::storage::estimate_copy(3, bytes.saturating_add(65536)),
        crate::storage::Category::Staging, "Explicit native map export; user output, never disposable cache")?;
    fs::create_dir(&directory)?; lease.mark_owned()?;
    // A failed/interrupted new export remains owned and unacknowledged. It can
    // never replace a prior good export or be adopted without this receipt.
    let mut input = fs::File::open(source)?;
    let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&output)?;
    let mut digest = Sha256::new(); let mut buffer = [0u8; 65536]; let mut copied = 0u64;
    loop {
        let count = input.read(&mut buffer)?; if count==0 { break; }
        copied += count as u64;
        if copied>bytes { return invalid("Map changed while exporting; incomplete copy retained for review"); }
        file.write_all(&buffer[..count])?; digest.update(&buffer[..count]);
    }
    file.sync_all()?; drop(file);
    if copied!=bytes || crate::hex_bytes(digest.finalize())!=*hash || maps::hash_file(source)?!=*hash || maps::hash_file(&output)?!=*hash {
        return invalid("Map export failed exact byte verification; previous-good output stays intact");
    }
    project::atomic_write(&receipt, &serde_json::to_vec_pretty(&result)?, false)?;
    lease.finish(true, Some(build.project_fingerprint.clone()))?;
    Ok(result)
}

/// Append a credit record beside the verified export. A changed attribution
/// gets its own file and cannot replace earlier credits or the map.
pub fn write_map_export_credits(export: &MapExport, text: &str) -> Result<PathBuf> {
    if text.len() > 4 * 1024 * 1024 {
        return invalid("Map export attribution exceeds its supported size");
    }
    let hash = crate::hex_bytes(Sha256::digest(text.as_bytes()));
    let name = format!("CREDITS-{}.txt", &hash[..16]);
    let directory = export.output.parent()
        .ok_or_else(|| SparkError::Invalid("Map export has no folder".into()))?;
    let path = directory.join(name);
    let prior = project::FileRevision::capture(&path)?;
    if prior.sha256.is_none() {
        project::atomic_write_checked(&path, text.as_bytes(), false, Some(&prior))?;
    }
    if project::FileRevision::capture(&path)?.sha256.as_deref() != Some(hash.as_str()) {
        return invalid("An existing credit record differs; it was preserved");
    }
    Ok(path)
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Toolchain {
    pub invader_directory: Option<PathBuf>,
    pub resource_directory: Option<PathBuf>,
    pub h1a_directory: Option<PathBuf>,
    pub base_tags_directory: Option<PathBuf>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityReport {
    pub target: String,
    pub pipeline: String,
    pub blockers: Vec<String>,
    pub warnings: Vec<String>,
    pub ready: bool,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub bitmap_dependencies:Option<crate::conversion_resources::BitmapAudit>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobEvent {
    pub job_id: String,
    pub project_id: String,
    pub phase: String,
    pub severity: String,
    pub message: String,
    pub progress: u8,
    pub timestamp: String,
}
pub fn tool_path(tools: &Toolchain, name: &str) -> Option<PathBuf> {
    let dir = tools.invader_directory.as_ref()?;
    let path = dir.join(format!("{name}{}", if cfg!(windows) { ".exe" } else { "" }));
    path.is_file().then_some(path)
}
fn resource_folder<'a>(source: &'a project::Source, tools: &'a Toolchain) -> Option<&'a Path> {
    // Saber packs provide viewer pixels, not Invader's classic resource maps.
    if source.cache_version==13 && source.resource_sha256.contains_key("mcc-textures") {
        return source.original_path.parent();
    }
    source
        .resource_directory
        .as_deref()
        .or(tools.resource_directory.as_deref())
        .or_else(|| source.original_path.parent())
}
fn validate_resource_snapshot(source: &project::Source, folder: Option<&Path>) -> Result<()> {
    if source.resource_sha256.is_empty() {
        return Ok(());
    }
    if source.cache_version==13 && source.resource_sha256.contains_key("mcc-textures") {
        let directory=source.resource_directory.as_deref().ok_or_else(||SparkError::Invalid("MCC texture pack directory is missing".into()))?;
        let name=maps::inspect_header(&source.preserved_path)?.name;
        if crate::mcc_textures::pin(directory,&name)?!=source.resource_sha256 {
            return invalid("MCC texture resources changed or are missing; reconnect the source appearance before rebuilding");
        }
        return Ok(());
    }
    let folder = folder.ok_or_else(|| {
        SparkError::Invalid("Recorded source resources have no selected folder".into())
    })?;
    for (name, expected) in &source.resource_sha256 {
        if !["bitmaps.map", "sounds.map", "loc.map"].contains(&name.as_str()) {
            return invalid("Project contains an unsupported resource snapshot entry");
        }
        let path = folder.join(name);
        if !path.is_file() || maps::hash_file(&path)? != *expected {
            return invalid(format!("Source resource {name} changed or is missing. Choose the source resources again to record their current identity before rebuilding."));
        }
    }
    Ok(())
}
pub fn fallback_bitmap_audit(project:&Project,inspection:&MapInspection,tools:&Toolchain)->Result<Option<crate::conversion_resources::BitmapAudit>>{
    if tools.h1a_directory.is_none()||inspection.header.version!=609{return Ok(None);}
    if project.source.as_ref().and_then(|source|resource_folder(source,tools)).is_some_and(|root|root.join("bitmaps.map").is_file()){return Ok(None);}
    let sdk=tools.base_tags_directory.as_ref().ok_or_else(||SparkError::Invalid("Choose extracted MCC SDK tags before resolving indexed classic bitmaps".into()))?;
    Ok(Some(crate::conversion_resources::audit(&inspection.tags,sdk)?))
}
/// The imported-cache route admits only existing bounded placements or
/// reviewed native-tag additions. QuickForge's own source writer is separate.
pub fn has_unsupported_world_edits(project:&Project,inspection:&MapInspection)->bool {
    project.scene.iter().filter(|o|!crate::native_asset_imports::allowed_addition(project,o,inspection)).count() != inspection.objects.len()
        || project
            .scene
            .iter()
            .any(|o| !crate::native_asset_imports::allowed_addition(project,o,inspection)&&(!inspection.objects.iter().any(|v| v.id == o.id) || o.scale != [1.0; 3] || o.source_model.is_some() || o.asset_id.is_some()))
}
pub fn compatibility(
    project: &Project,
    inspection: &MapInspection,
    tools: &Toolchain,
) -> CompatibilityReport {
    if selected_ce_source(project){let blockers=ce_source_preflight(project,inspection,tools).err().map(|e|vec![e.to_string()]).unwrap_or_default();return CompatibilityReport{target:"Custom Edition / Chupathingy · CE609".into(),pipeline:"Reviewed matching CE tags → isolated source/module staging → Invader CE build → independent cache/CRC/signature readback".into(),ready:blockers.is_empty(),blockers,warnings:vec!["Native source must match this scenario. The selected tags are compiled without overwriting them; cache edits and gameplay are separate workflows. Stripped HaloScript cannot be reconstructed.".into()],bitmap_dependencies:None};}

    let mut blockers = vec![];
    let mut warnings = vec![];
    if let Some(source)=&project.source {
        if let Err(problem)=crate::source_identity::validate(source,inspection){blockers.push(problem.to_string());}
    }
    if !crate::source_identity::mcc_conversion_source(inspection) {
        blockers.push("This source format has no reviewed imported-cache MCC conversion route. Xbox, extended and compressed assets being readable does not make them convertible; preserve them and use a separately supported source workflow.".into());
    }
    if crate::native_audio::requested(project) {
        blockers.push("Native looping emitters currently require the MCC QuickForge source build; existing-map conversion cannot add them".into());
    }
    if let Some(profile)=crate::portability::profiles().into_iter().find(|p|p.profile_id=="halo1-mcc-steam") {
        for finding in crate::portability::target_findings(inspection,&profile) {
            if finding.code=="MODEL_CLASS" {blockers.push(format!("{}: {}",finding.title,finding.next_action));}
            if finding.code=="PAINTED_DETAILS" {warnings.push(format!("{}: {}",finding.title,finding.next_action));}
        }
    }
    if let Some(source) = &project.source {
        if let Err(e) = validate_resource_snapshot(source, resource_folder(source, tools)) {
            blockers.push(e.to_string());
        }
        if source.resource_sha256.is_empty() {
            warnings.push("Source resource identity is unverified for this older project; choose its original resource folder to record hashes.".into());
        }
    }
    let native=tools.h1a_directory.is_some();
    if !project.tag_renames.is_empty(){
        if !native{blockers.push("Native tag renaming requires the matching MCC H1A source compiler".into());}
        for name in ["invader-refactor","invader-dependency","invader-edit"]{if tool_path(tools,name).is_none(){blockers.push(format!("{name} is required for verified native tag renaming"));}}
        if let Err(e)=crate::tag_renames::validate_source(project,inspection){blockers.push(e.to_string());}
    }
    if !project.tag_duplicates.is_empty(){
        if !native{blockers.push("Tag duplication requires the native MCC H1A compiler; enable the installed MCC editing kit".into());}
        for name in ["invader-refactor","invader-dependency"]{if tool_path(tools,name).is_none(){blockers.push(format!("{name} is required for verified tag duplication"));}}
        if let Err(e)=crate::tag_duplicates::validate_source(project,inspection){blockers.push(e.to_string());}
        warnings.push("Tag duplicates are rebuilt from editable tags with a new path. Only the selected referencing tag is redirected; dependencies remain shared. Campaign/UI game-load acceptance is still required.".into());
    }
    if let Some(assembly)=&project.bsp_assembly{
        if !native{blockers.push("Connected BSP assemblies require the MCC H1A compiler".into());}
        if !assembly.donor_tags_directory.is_dir(){blockers.push("Choose the donor's matching editable tags folder before starting a connected-map build".into());}
        if inspection.mesh.parts.len()!=1 {blockers.push("A connected-map destination must contain one BSP; existing destination sections cannot be discarded".into());}
        if inspection.header.version==13 {
            for tag in inspection.tags.iter().filter(|t|t.class=="sbsp"&&inspection.mesh.parts.iter().any(|p|t.path.rsplit(['\\','/']).next().is_some_and(|name|name.eq_ignore_ascii_case(&p.name)))) {
                let exists=safe_relative(&format!("{}.scenario_structure_bsp",tag.path)).ok().is_some_and(|relative|tools.base_tags_directory.as_ref().is_some_and(|root|root.join(relative).is_file()));
                if !exists {blockers.push(format!("Matching editable BSP is missing: {}. Use the tags from the build that created this map; stock SDK tags cannot replace a compiled revision",tag.path));}
            }
        }
        for name in ["invader-dependency","invader-refactor"]{if tool_path(tools,name).is_none(){blockers.push(format!("{name} is required to namespace imported BSP materials"));}}
        warnings.push("BSP assembly rebuilds a derived world and regenerates lightmaps. Review imported geometry, per-cluster atmosphere/audio and campaign-only content, then perform a player walkthrough.".into());
    }
    if native {
        if crate::conversion::native_tool(tools).is_none(){blockers.push("The selected MCC H1A Tool is missing".into());}
        if tools.base_tags_directory.as_ref().is_none_or(|p|!p.join("globals/globals.globals").is_file()){
            blockers.push("Select the legal, extracted MCC SDK tags folder for native conversion".into());
        }
        warnings.push("Conversion layers extracted custom tags over a verified copy of the selected MCC SDK tagset. All writes stay in a fresh job; the source and SDK masters remain unchanged.".into());
        if crate::conversion::is_yoyorast_v1(&inspection.sha256){warnings.push("Yoyorast V1 uses the tested MCC stock-shader and multiplayer UI adaptation. Every changed derived tag is recorded in conversion-manifest.json.".into());}
    }
    if project.conversion_profile.as_deref()==Some("mcc-multiplayer-ui"){
        if !native{blockers.push("The MCC multiplayer UI profile requires the native H1A compiler".into());}
        if let Err(error)=crate::conversion::use_mcc_multiplayer_ui(&inspection.sha256,inspection.header.version,inspection.header.scenario_type,project.conversion_profile.as_deref()){blockers.push(error.to_string());}
        warnings.push("The selected profile replaces the CE startup multiplayer UI collection with the installed MCC SDK version. Custom entries under that collection are not retained; review the conversion manifest and test custom UI/HUD behavior in game.".into());
    }
    if !project.powerups.is_empty(){
        if !native{blockers.push("Custom power-up conversion requires the native MCC H1A compiler and invader-edit".into());}
        if inspection.header.scenario_type!=1{blockers.push("Custom power-up pickups require a multiplayer scenario".into());}
        warnings.push("Custom power-ups generate native equipment and item-collection tags in this build. Native pickup/effect behavior needs target-game testing.".into());
    }
    if project.conversion_profile.as_deref()==Some("zombie-recovery"){
        if inspection.sha256!=crate::legacy::ZOMBIE_DEMO_SHA256{blockers.push("The Zombie recovery profile only accepts the exact audited Demo source".into());}
        if !native{blockers.push("The Zombie recovery edition requires the native MCC H1A compiler".into());}
        warnings.push("Recovery edition: two unavailable custom event sounds are omitted and the corrupt first scenery placement is disabled. The original mod and its vehicle-based zombie spawners are preserved. This is not a faithful audio restoration.".into());
    }
    for name in ["invader-info", "invader-extract", if native{"invader-edit"}else{"invader-build"}] {
        if tool_path(tools, name).is_none() {
            blockers.push(format!("{name} is not configured. Select a separately installed Invader folder in Settings."));
        }
    }
    if inspection.header.extended {
        blockers
            .push("OpenSauce engine extensions cannot be carried into MCC by this pipeline".into());
    }
    if inspection.header.build.contains("synthetic parser fixture") {
        blockers.push("This is a synthetic parser fixture, not a playable map. It cannot be built or packaged as game content.".into());
    }
    for resource in &inspection.resources {
        let selected_folder = project
            .source
            .as_ref()
            .and_then(|s| s.resource_directory.as_deref())
            .or(tools.resource_directory.as_deref());
        let found = selected_folder.map_or(resource.found, |folder| {
            folder.join(&resource.name).is_file()
        });
        if resource.required && !found && !(native&&inspection.header.version==609&&resource.name=="bitmaps.map") && !(native&&inspection.header.version==13) {
            blockers.push(format!(
                "Missing {} from the original source runtime; choose its resource folder",
                resource.name
            ));
        }
    }
    if inspection.diagnostics.iter().any(|d|d.code=="RESOURCE_LAYOUT_UNVERIFIED") {
        blockers.push("Native bitmap or sound dependency metadata is incomplete. Review the source's resource diagnostics before extraction; a different hosting runtime cannot repair these bytes.".into());
    }
    if [6,7,609].contains(&inspection.header.version) {
        if let Some(source)=&project.source {
            if let Some(folder)=resource_folder(source,tools) {
                // The reviewed CE indexed-bitmap fallback uses native tags
                // rather than claiming a missing bitmaps.map is compatible.
                let needs_classic=inspection.resources.iter().any(|r|r.required&&!(native&&inspection.header.version==609&&r.name=="bitmaps.map"&&!folder.join("bitmaps.map").is_file()));
                if needs_classic {
                    let mut required=inspection.clone();
                    if native&&inspection.header.version==609&&!folder.join("bitmaps.map").is_file(){required.resources.retain(|r|r.name!="bitmaps.map");}
                    if let Err(problem)=crate::native_resources::review(source,&required,folder){blockers.push(problem.to_string());}
                }
            }
        }
    }
    if inspection.header.compressed
        && (!project.tag_edits.is_empty() || project.scene != inspection.objects)
    {
        blockers.push(
            "Xbox compressed-cache editing is not implemented; inspect and extract before editing"
                .into(),
        );
    }
    if let Err(e) = project::validate_edits(project, inspection) {
        blockers.push(e.to_string());
    }
    if has_unsupported_world_edits(project,inspection)
    {
        blockers.push("Editor-only instances, duplication, deletion and per-instance scale cannot be compiled into Halo tags yet".into());
    }
    if !native&&project.scene.iter().any(|o|o.source_model.is_some()){blockers.push("Imported native placements in compiled source maps require the native MCC source rebuild path".into());}
    if !project.assets.is_empty() {
        warnings
            .push("This imported-cache rebuild does not compile OBJ/audio workshop assets. Supported static models and sounds use the separate QuickForge/Workshop native build; unplaced previews are not included in this cache".into());
    }
    if !inspection.encounters.is_empty() {
        warnings.push("This map contains AI encounters. Importing it does not add multiplayer AI synchronization to MCC.".into());
    }
    warnings.push("A successful extraction/rebuild/CRC check establishes structural validity. MCC load testing is still required; playable is never inferred from the header.".into());
    let bitmap_dependencies=match fallback_bitmap_audit(project,inspection,tools){
        Ok(Some(audit))=>{
            if audit.blocked(){let paths=audit.missing.iter().chain(&audit.invalid).take(8).map(|item|item.path.as_str()).collect::<Vec<_>>().join("; ");blockers.push(format!("Indexed CE bitmap dependencies need matching classic resources or editable tags: {paths}. Review the bitmap dependency repair before copying a large SDK. MCC texture packs cannot replace these classic tag files."));}
            Some(audit)
        },Ok(None)=>None,Err(error)=>{if native{blockers.push(error.to_string());}None}
    };
    CompatibilityReport {
        target: "MCC Halo 1 · cache 13".into(),
        pipeline:if native{"Verified SDK copy → source tag extraction → explicit compatibility profile → MCC H1A Tool → tag/index/CRC validation".into()}else{"Invader extract → audited edits → invader-build -g mcc-cea → tag/index/CRC validation".into()},
        ready: blockers.is_empty(),
        blockers,
        warnings,
        bitmap_dependencies,
    }
}
pub(crate) struct Runner<'a> {
    pub(crate) id: &'a str,
    pub(crate) project: &'a str,
    pub(crate) cancel: &'a AtomicBool,
    pub(crate) event: &'a (dyn Fn(JobEvent) + Send + Sync),
}
fn copy_verified_source(source: &Path, expected_sha256: &str, output: &Path) -> Result<()> {
    let file = fs::File::open(source)?;
    if file.metadata()?.len() > maps::MAX_CACHE_BYTES {
        return invalid("Source exceeds cache copy safety limit");
    }
    let mut bytes = vec![];
    file.take(maps::MAX_CACHE_BYTES + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > maps::MAX_CACHE_BYTES
        || crate::hex_bytes(Sha256::digest(&bytes)) != expected_sha256
    {
        return invalid("Source changed during the validated cache copy");
    }
    // New derived files must not inherit a preserved source's read-only attribute.
    fs::write(output, bytes)?;
    Ok(())
}
pub fn extraction_errors(output: &str) -> Vec<String> {
    output
        .lines()
        .filter(|line| {
            let s = line.trim();
            s.starts_with("ERROR:")
                || s.starts_with("FATAL ERROR:")
                || s.starts_with("Failed to extract ")
        })
        .map(str::to_string)
        .collect()
}
/// Halo Tool can return zero and print a successful cache footer after it
/// failed to stream a sound. Such a cache contains missing sample ranges.
/// Keep ordinary missing optional resource-pack notices separate.
pub fn native_compile_errors(output: &str) -> Vec<String> {
    output.lines().filter(|line| {
        line.to_ascii_lowercase().contains("failed to load sound for adding to cache file")
    }).map(|line| line.chars().take(512).collect()).collect()
}
impl Runner<'_> {
    pub(crate) fn emit(&self, phase: &str, message: impl Into<String>, progress: u8, severity: &str) {
        (self.event)(JobEvent {
            job_id: self.id.into(),
            project_id: self.project.into(),
            phase: phase.into(),
            message: message.into(),
            severity: severity.into(),
            progress,
            timestamp: chrono::Utc::now().to_rfc3339(),
        });
    }
    pub(crate) fn run(
        &self,
        executable: &Path,
        args: &[String],
        cwd: &Path,
        phase: &str,
        progress: u8,
    ) -> Result<String> {
        if self.cancel.load(Ordering::Relaxed) {
            return invalid("Build cancelled");
        }
        // The parent reserves a concrete budget before staging. Watch that
        // owned output, never a stock SDK/installation. Safety exhaustion is
        // an emergency rejection, distinct from ordinary deferred cancellation.
        let budget=crate::storage::Store::existing_for_output(&cwd.join("tool-budget"))?.map(|store|store.tool_budget(cwd)).transpose()?.flatten();
        if let Some(budget)=&budget{budget.check()?;}
        self.emit(
            phase,
            format!(
                "{} {}",
                executable.file_name().unwrap_or_default().to_string_lossy(),
                args.iter()
                    .map(|s| format!("{s:?}"))
                    .collect::<Vec<_>>()
                    .join(" ")
            ),
            progress,
            "info",
        );
        let mut cmd = crate::steam::command(executable.to_string_lossy().as_ref());
        #[cfg(windows)]
        let native_alias = if executable.file_name().is_some_and(|s|{
            let name=s.to_string_lossy();
            (name.eq_ignore_ascii_case("tool.exe") && args.iter().any(|s|s=="-tags_dir"))
                || (name.eq_ignore_ascii_case("invader-refactor.exe") && matches!(phase,"bsp-namespace"|"bsp-shaders"|"asset-references"|"tag-renaming"|"xbox-model-references"))
                || (name.eq_ignore_ascii_case("invader-convert.exe")&&phase=="xbox-model-to-pc")
                || (name.eq_ignore_ascii_case("invader-extract.exe") && phase=="extract")
                || (name.eq_ignore_ascii_case("invader-build.exe") && phase=="compile-ce")
                || (name.eq_ignore_ascii_case("invader-edit.exe")&&matches!(phase,"asset-native-readback"|"asset-placement"|"tag-renaming"|"bsp-scenery-model"|"bsp-scenery-model-check"|"model-adaptation-readback"))
                || (name.eq_ignore_ascii_case("invader-dependency.exe")&&matches!(phase,"dependencies"|"asset-dependencies"|"tag-renaming"|"bsp-dependencies"))
                || (matches!(phase,"recovery-readback"|"recovery-dependencies"|"recovery-data") && ["invader-edit.exe","invader-dependency.exe","invader-recover.exe"].contains(&name.as_ref()))
        }) {
            Some(crate::native_workspace::Alias::new(cwd)?)
        } else {None};
        #[cfg(windows)]
        let extraction_args = if matches!(phase,"compile-ce"|"bsp-dependencies"|"bsp-scenery-model"|"bsp-scenery-model-check"|"dependencies"|"extract"|"asset-references"|"asset-native-readback"|"asset-placement"|"asset-dependencies"|"tag-renaming"|"recovery-readback"|"recovery-dependencies"|"recovery-data"|"xbox-model-to-pc"|"xbox-model-references"|"model-adaptation-readback") {
            native_alias.as_ref().map(|alias|crate::native_workspace::extraction_arguments(args,cwd,alias.path())).transpose()?
        } else {None};
        #[cfg(windows)]
        let args=extraction_args.as_deref().unwrap_or(args);
        #[cfg(windows)]
        let cwd = native_alias.as_ref().map_or(cwd,|a|a.path());
        let mut child = cmd
            .args(args)
            .current_dir(cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        // Retain the complete scenario listing for comparison without sending
        // hundreds of thousands of field lines to the build UI.
        let scenario_review = phase == "squad-readback"
            && executable.file_stem().is_some_and(|name| name == "invader-edit")
            && args.iter().any(|arg| arg == "-L");
        let (tx, rx) = std::sync::mpsc::channel();
        let incomplete_output = Arc::new(AtomicBool::new(false));
        let reader = |pipe: Box<dyn std::io::Read + Send>,
                      tx: std::sync::mpsc::Sender<(bool, String)>,
                      incomplete: Arc<AtomicBool>,
                      err: bool| {
            std::thread::spawn(move || {
                let mut reader = BufReader::new(pipe);
                let mut data = vec![];
                let mut total = 0usize;
                loop {
                    data.clear();
                    match reader.by_ref().take(65537).read_until(b'\n', &mut data) {
                        Ok(0) => break,
                        Err(e) => {
                            incomplete.store(true, Ordering::Relaxed);
                            let _ = tx
                                .send((true, format!("Could not read complete tool output: {e}")));
                            break;
                        }
                        Ok(_) => {
                            total += data.len();
                            let limit = if !err && scenario_review { crate::native_operations::MAX_SCENARIO_REVIEW_BYTES } else { 16 * 1024 * 1024 };
                            if total > limit {
                                incomplete.store(true, Ordering::Relaxed);
                                let _ = tx.send((
                                    true,
                                    format!("Tool output exceeded {} MiB; remaining output was discarded", limit / (1024 * 1024)),
                                ));
                                std::io::copy(&mut reader, &mut std::io::sink()).ok();
                                break;
                            }
                            // Native field listings use indentation as structure. Only remove
                            // the stream delimiter; log presentation is trimmed separately.
                            let line = String::from_utf8_lossy(&data)
                                .trim_end_matches(['\r', '\n']).to_string();
                            if tx.send((err, line)).is_err() {
                                break;
                            }
                        }
                    }
                }
            })
        };
        let out_thread = reader(
            Box::new(stdout),
            tx.clone(),
            incomplete_output.clone(),
            false,
        );
        let err_thread = reader(
            Box::new(stderr),
            tx.clone(),
            incomplete_output.clone(),
            true,
        );
        drop(tx);
        let start = Instant::now();
        // Halo Tool structure import can destroy or partially replace BSP tag
        // fields when interrupted. Our job workspace is isolated, but even a
        // staged BSP must not be treated as safe to terminate mid-write.
        // A requested cancellation/soft timeout is honored *between* write
        // phases, after the current native process exits by itself.
        let protected_write_phase = matches!(phase, "structure" | "lightmaps" | "scenario" | "bsp-structure" | "bsp-lightmaps" | "logic-names" | "logic-scenario" | "logic-script");
        let mut deferred_cancel = false;
        let mut deferred_timeout = false;
        let mut output = String::new();
        let mut errors = vec![];
        let mut compile_errors = vec![];
        let mut last_budget_check=Instant::now();
        let result = loop {
            if last_budget_check.elapsed()>=Duration::from_secs(2){
                if let Some(budget)=&budget{if let Err(problem)=budget.check(){let _=child.kill();let _=child.wait();break Err(problem);}}
                last_budget_check=Instant::now();
            }
            let mut interactive_shader=false;
            for (err, line) in rx.try_iter() {
                if protected_write_phase&&line.to_ascii_lowercase().contains("choose a type for the shader") {interactive_shader=true;}
                if !err {
                    output.push_str(&line);
                    output.push('\n');
                }
                if phase == "extract" {
                    errors.extend(extraction_errors(&line));
                }
                if compile_errors.len() < 4 {
                    compile_errors.extend(native_compile_errors(&line));
                }
                let display = line.trim();
                if (!scenario_review||err)&&(phase!="bsp-detail"||err)&&(phase!="bsp-index"||err||!display.bytes().all(|b|b.is_ascii_digit())){
                    self.emit(phase, display, progress, if err { "tool" } else { "info" });
                }
            }
            // Tool loops forever on EOF at this prompt. It is waiting for
            // input, rather than writing a tag. Reject the owned job instead
            // of inventing an empty shader or leaving an unbounded process.
            if interactive_shader{let _=child.kill();let _=child.wait();break invalid("Halo Tool could not resolve a material and requested an interactive shader type. The isolated job was stopped; repair its shader binding before rebuilding");}
            let cancel_requested = self.cancel.load(Ordering::Relaxed);
            let soft_timed_out = start.elapsed() > Duration::from_secs(600);
            if protected_write_phase {
                if cancel_requested && !deferred_cancel {
                    deferred_cancel = true;
                    self.emit(phase, "Cancellation deferred: Halo tag-writing tool must finish naturally. Remaining build stages will be skipped; do not kill Tool externally.".to_string(), progress, "warning");
                }
                if soft_timed_out && !deferred_timeout {
                    deferred_timeout = true;
                    self.emit(phase, "Ten-minute soft limit reached during tag writing. Waiting for Tool to finish naturally; remaining stages will be skipped.".to_string(), progress, "warning");
                }
            } else if cancel_requested || soft_timed_out {
                let _ = child.kill();
                let _ = child.wait();
                break invalid(if cancel_requested {
                    "Build cancelled; non-structure external tool terminated"
                } else {
                    "External tool exceeded its ten-minute timeout"
                });
            }
            match child.try_wait() {
                Ok(Some(status)) => {
                    break if protected_write_phase && (deferred_cancel || self.cancel.load(Ordering::Relaxed)) {
                        invalid("Cancellation honored after native tag write completed; remaining build stages skipped")
                    } else if protected_write_phase && deferred_timeout {
                        invalid("Native tag writer completed after soft timeout. Inspect isolated outputs before retrying")
                    } else if status.success() {
                        Ok(())
                    } else {
                        invalid(format!(
                            "{} exited with {status}; inspect the preceding tool diagnostics",
                            executable.display()
                        ))
                    };
                }
                Ok(None) => {}
                Err(e) => break Err(e.into()),
            }
            std::thread::sleep(Duration::from_millis(50));
        };
        let out_failed = out_thread.join().is_err();
        let err_failed = err_thread.join().is_err();
        if out_failed || err_failed {
            incomplete_output.store(true, Ordering::Relaxed);
        }
        for (err, line) in rx.try_iter() {
            if !err {
                output.push_str(&line);
                output.push('\n');
            }
            if phase == "extract" {
                errors.extend(extraction_errors(&line));
            }
            if compile_errors.len() < 4 {
                compile_errors.extend(native_compile_errors(&line));
            }
            let display = line.trim();
            if (!scenario_review||err)&&(phase!="bsp-detail"||err)&&(phase!="bsp-index"||err||!display.bytes().all(|b|b.is_ascii_digit())) {
                self.emit(phase, display, progress, if err { "tool" } else { "info" });
            }
        }
        result?;
        if let Some(budget)=&budget{budget.check()?;}
        if incomplete_output.load(Ordering::Relaxed) {
            return invalid("External tool output was truncated or unreadable. Validation cannot establish success from incomplete diagnostics; build stopped.");
        }
        if !compile_errors.is_empty() {
            return invalid(format!("Native compiler omitted sound data despite its exit status or success footer. This output is not validated or publishable; repair the source sound format/chunks and rebuild in a new job.\n{}", compile_errors.join("\n")));
        }
        if !errors.is_empty() {
            return invalid(format!("Tag extraction was incomplete ({} errors), even though the tool returned exit code 0. Build stopped before compilation.\n{}\nProvide the source runtime's original resources or editing-kit tags. Stock MCC remastered assets are not recoverable from a map header alone.",errors.len(),errors.iter().take(4).cloned().collect::<Vec<_>>().join("\n")));
        }
        Ok(output.trim_end_matches(['\r', '\n']).into())
    }
}
pub fn validate_existing_cache(
    project: &Project,
    inspection: &MapInspection,
    tools: &Toolchain,
    jobs_root: &Path,
    job_id: &str,
    cancel: Arc<AtomicBool>,
    on_event: impl Fn(JobEvent) + Send + Sync,
) -> Result<BuildRecord> {
    uuid::Uuid::parse_str(job_id).map_err(|_| SparkError::Invalid("Invalid job UUID".into()))?;
    if !matches!(inspection.header.version, 13 | 609)
        || inspection.header.extended
        || inspection.header.compressed
        || inspection.header.build.contains("synthetic parser fixture")
    {
        return invalid("This operation requires an existing standard MCC13 or CE609 cache, not an extended/compressed map or test fixture");
    }
    if !project.tag_duplicates.is_empty() || !project.tag_renames.is_empty() || !project.tag_edits.is_empty() || project.scene != inspection.objects
        || project.quick_forge.is_some() || project.firefight.is_some() || !project.assets.is_empty()
        || !project.native_asset_imports.is_empty() || project.native_lighting.is_some()
        || !crate::native_audio::fingerprint_inputs(project).is_empty()
        || project.bsp_assembly.is_some() || !project.animation_assignments.is_empty() || !project.powerups.is_empty()
        || project.studio.as_ref().and_then(|s|s.engine_machinima.as_ref()).is_some_and(|take|take.enabled)
        || project.conversion_profile.as_deref().is_some_and(|profile|profile!="faithful")
    {
        return invalid("Project changes require extraction and rebuilding. Existing-cache validation only accepts an unchanged source map.");
    }
    let source = project
        .source
        .as_ref()
        .ok_or_else(|| SparkError::Invalid("No source cache".into()))?;
    crate::source_identity::validate(source, inspection)?;
    project.validate()?;
    if maps::hash_file(&source.preserved_path)? != source.sha256 {
        return invalid("Preserved source checksum changed");
    }
    let info=tool_path(tools,"invader-info").ok_or_else(||SparkError::Invalid("Configure invader-info in Settings to verify the source cache CRC and protection status".into()))?;
    let dir = jobs_root.join(job_id);
    crate::reject_links(&dir)?;
    let lease=crate::storage::Store::for_output(&dir)?.reserve(&dir,Some(&source.preserved_path),crate::storage::estimate_copy(1,fs::metadata(&source.preserved_path)?.len()).saturating_add(65536),crate::storage::Category::Staging,"Unchanged native cache validation; original source is read-only")?;
    fs::create_dir_all(jobs_root)?;
    fs::create_dir(&dir)?;
    lease.mark_owned()?;
    let output_dir = dir.join("output");
    fs::create_dir(&output_dir)?;
    let runner = Runner {
        id: job_id,
        project: &project.id,
        cancel: &cancel,
        event: &on_event,
    };
    for (check, expected) in [
        ("is_protected", "0"),
        ("crc32_mismatched", "0"),
        ("stub_count", "0"),
    ] {
        let result = runner.run(
            &info,
            &[
                "-T".into(),
                check.into(),
                source.preserved_path.to_string_lossy().into_owned(),
            ],
            &dir,
            "verify",
            60,
        )?;
        if result.trim() != expected && result.trim() != "false" {
            return invalid(format!("Existing cache failed {check}: {result}"));
        }
    }
    let filename = safe_relative(&crate::mcc::package_map_name(&inspection.scenario_path)?)?;
    if filename.components().count() != 1 {
        return invalid("Unsafe source cache filename");
    }
    let output = output_dir.join(filename);
    copy_verified_source(&source.preserved_path, &source.sha256, &output)?;
    if maps::hash_file(&output)? != source.sha256 {
        return invalid("Validated output copy does not match the preserved source");
    }
    let readback=maps::inspect_map(&output,source.resource_directory.as_deref())?;
    crate::source_identity::validate(source,&readback)?;
    if readback.header.scenario_type!=inspection.header.scenario_type || serde_json::to_value(&readback.tags)?!=serde_json::to_value(&inspection.tags)? {
        return invalid("Validated cache readback differs from the preserved native source");
    }
    let ce=inspection.header.version==609;
    let record=BuildRecord{id:job_id.into(),timestamp:chrono::Utc::now().to_rfc3339(),status:"validated".into(),target:if ce{"ce-existing"}else{"mcc-existing"}.into(),output:Some(output),sha256:Some(source.sha256.clone()),message:format!("Existing {} cache copied unchanged; independent tag/index, protection, stub and CRC checks passed. No conversion or compilation was performed. Target-game load remains pending.",if ce{"CE609"}else{"MCC13"}),project_fingerprint:project.fingerprint()?};
    project::atomic_write(
        &dir.join("receipt.json"),
        &serde_json::to_vec_pretty(&record)?,
        false,
    )?;
    lease.finish(true,Some(record.project_fingerprint.clone()))?;
    runner.emit("validated", &record.message, 100, "success");
    Ok(record)
}
use std::io::Read;
/// The edited/decompressed extractor input is reproducible from the immutable
/// source and saved project. Keep it outside the accepted editable tag job so
/// its consumer can end its lifetime without weakening that job's protection.
struct TransientInput {
    directory: PathBuf,
    lease: crate::storage::Lease,
    source: PathBuf,
    source_sha256: String,
}
impl TransientInput {
    fn create(jobs_root: &Path, source: &Path, source_sha256: &str, maximum_bytes: u64) -> Result<Self> {
        let library = jobs_root.parent().ok_or_else(|| SparkError::Invalid("Native jobs have no library owner".into()))?;
        let scratch = library.join("scratch");
        crate::reject_links(&scratch)?;
        fs::create_dir_all(&scratch)?;
        let directory = scratch.join(format!("native-input-{}", uuid::Uuid::new_v4()));
        let lease = crate::storage::Store::for_output(&directory)?.reserve(
            &directory, Some(source), crate::storage::estimate_copy(1, maximum_bytes),
            crate::storage::Category::Staging,
            "Disposable edited/decompressed native extractor input; original cache and accepted editable tags retained",
        )?;
        fs::create_dir(&directory)?;
        lease.mark_owned()?;
        Ok(Self { directory, lease, source: source.to_owned(), source_sha256: source_sha256.into() })
    }
    fn finish(self, record: &BuildRecord, receipt: &Path) -> Result<u64> {
        if record.status != "validated" {
            return invalid("Incomplete native input remains owned for recovery");
        }
        let output = record.output.as_ref().ok_or_else(|| SparkError::Invalid("Validated native output is missing".into()))?;
        if crate::storage::document_references_path(&serde_json::json!(output), &self.directory) {
            return invalid("Native output still uses its input staging folder; source was retained");
        }
        crate::reject_links(output)?;
        let output_sha256 = maps::hash_file(output)?;
        if record.sha256.as_deref() != Some(output_sha256.as_str())
            || maps::hash_file(&self.source)? != self.source_sha256
        {
            return invalid("Native output or preserved original changed; input was retained");
        }
        let input_hashes = crate::tool_transaction::inventory(&self.directory)?;
        if input_hashes.len() != 1 || input_hashes.keys().any(|name| !name.ends_with(".map")) {
            return invalid("Native input contains unexpected data; retained for review");
        }
        let mut evidence = serde_json::json!({
            "schemaVersion": 1, "kind": "transient-native-extractor-input",
            "sourceSha256": self.source_sha256, "derivedInputHashes": input_hashes,
            "acceptedOutputSha256": output_sha256, "disposed": false,
            "scope": "Extractor input only; accepted editable tags, original cache and output retained"
        });
        project::atomic_write(receipt, &serde_json::to_vec_pretty(&evidence)?, false)?;
        let bytes = self.lease.finish_disposable()?;
        evidence["disposed"] = true.into();
        evidence["bytesReleased"] = bytes.into();
        project::atomic_write(receipt, &serde_json::to_vec_pretty(&evidence)?, false)?;
        Ok(bytes)
    }
}
#[cfg(test)]
#[path = "../tests/common/mod.rs"]
mod lifecycle_fixture;
/// Shared receipt admission keeps legacy MCC conversion provenance separate from
/// an explicitly compiled CE source job. A target label cannot grant admission.
pub fn verify_native_source_provenance(receipt:&serde_json::Value,target:&str,source_sha256:&str,compiler_sha256:&str)->Result<()> {
    let ce=target=="gbx-custom";
    if !matches!(target,"mcc-cea"|"gbx-custom")||receipt.get("schemaVersion").and_then(|v|v.as_u64())!=Some(1)||
        receipt.get("compilerSha256").and_then(|v|v.as_str())!=Some(compiler_sha256)||receipt.get("sourceSha256").and_then(|v|v.as_str())!=Some(source_sha256)||receipt.get("sourcePreserved").and_then(|v|v.as_bool())!=Some(true)||
        (ce&&(receipt.get("nativeTarget").and_then(|v|v.as_str())!=Some("gbx-custom")||receipt.get("cacheVersion").and_then(|v|v.as_u64())!=Some(609)||receipt.get("selectedEditableSource").and_then(|v|v.as_bool())!=Some(true)))||
        (!ce&&receipt.get("nativeTarget").and_then(|v|v.as_str()).is_some_and(|t|t!="mcc-cea")) {
        return invalid("Native source compiler/format/provenance no longer matches its reviewed build");
    }
    Ok(())
}
/// An imported map can be rebuilt from explicitly reviewed native CE source.
/// This is the same build entrypoint and job/provenance model, not conversion.
pub fn selected_ce_source(project:&Project)->bool {
    project.source.is_some()&&project.quick_forge.is_none()&&project.bsp_assembly.is_none()&&
    project.active_build_target.as_ref().and_then(|id|project.build_targets.iter().find(|t|&t.id==id))
        .is_some_and(|t|matches!(t.runtime_id,crate::runtime::RuntimeId::HaloCustomEdition|crate::runtime::RuntimeId::ChupathingyCe))
}
fn ce_source_preflight(project:&Project,inspection:&MapInspection,tools:&Toolchain)->Result<()> {
    project.validate()?;
    crate::source_identity::validate(project.source.as_ref().ok_or_else(||SparkError::Invalid("Native source is missing".into()))?,inspection)?;
    if !selected_ce_source(project){return invalid("Choose an explicit Custom Edition or Chupathingy native source target");}
    let target=project.build_targets.iter().find(|t|Some(&t.id)==project.active_build_target.as_ref()).unwrap();
    if target.builder!="invader-ce"||!target.ce_compatible_tagset||target.open_sauce{return invalid("Native CE source needs the reviewed standard CE tagset and Invader CE builder; extended caches are separate");}
    let source=project.source.as_ref().unwrap();
    if source.sha256!=inspection.sha256||source.scenario_path.replace('\\',"/")!=inspection.scenario_path.replace('\\',"/")||source.cache_version!=609||inspection.header.version!=609||inspection.header.extended||inspection.header.scenario_type>1{return invalid("This source rebuild requires the exact standard CE609 campaign or multiplayer map. Other formats need their reviewed conversion workflow");}
    if project.scene!=inspection.objects||!project.tag_edits.is_empty()||!project.tag_renames.is_empty()||!project.tag_duplicates.is_empty()||!project.native_asset_imports.is_empty()||!project.powerups.is_empty()||!project.animation_assignments.is_empty()||!crate::native_audio::fingerprint_inputs(project).is_empty()||project.firefight.is_some()||project.conversion_profile.as_ref().is_some_and(|p|p!="faithful")||project.studio.as_ref().and_then(|s|s.engine_machinima.as_ref()).is_some_and(|m|m.enabled){return invalid("This build compiles the selected editable CE tags. Pending cache edits, imports, Firefight rules, recording or conversion changes cannot be silently omitted. Apply them through their supported native source workflow first");}
    let root=tools.base_tags_directory.as_ref().filter(|p|p.is_dir()).ok_or_else(||SparkError::Invalid("Select this map's complete matching editable CE tags in Engine build targets; a map cache or stock SDK is not a replacement scenario".into()))?;
    crate::reject_links(root)?;
    if target.tags_directory.as_ref().map(fs::canonicalize).transpose()?!=Some(fs::canonicalize(root)?){return invalid("The selected CE source root differs from its reviewed target");}
    for relative in [format!("{}.scenario",inspection.scenario_path),"globals/globals.globals".into()] {
        let file=root.join(safe_relative(&relative)?);crate::reject_links(&file)?;if !file.is_file(){return invalid(format!("Matching native CE source is missing: {relative}"));}
    }
    for name in ["invader-build","invader-info","invader-edit","invader-recover","invader-dependency"] {if tool_path(tools,name).is_none(){return invalid(format!("{name} is required for CE source build and independent source/readback"));}}
    Ok(())
}
fn run_ce_source_build(project:&Project,inspection:&MapInspection,tools:&Toolchain,jobs:&Path,id:&str,cancel:Arc<AtomicBool>,event:impl Fn(JobEvent)+Send+Sync)->Result<BuildRecord>{
    ce_source_preflight(project,inspection,tools)?;
    let source=project.source.as_ref().unwrap();if maps::hash_file(&source.preserved_path)?!=source.sha256{return invalid("Preserved CE source changed before compilation");}
    // Preserve Windows' canonical verbatim spelling for Invader. Ordinary paths
    // can make existing nested imported tags appear BROKEN beyond MAX_PATH.
    let canonical_base=fs::canonicalize(tools.base_tags_directory.as_ref().unwrap())?;
    let base=&canonical_base;let all=crate::native_staging::inventory(base,&cancel)?;
    let runner=Runner{id,project:&project.id,cancel:&cancel,event:&event};
    let dependency=tool_path(tools,"invader-dependency").unwrap();let dependency_sha256=maps::hash_file(&dependency)?;
    let mut roots=std::collections::BTreeSet::from([format!("{}.scenario",inspection.scenario_path).replace('\\',"/"),"globals/globals.globals".into()]);
    roots.extend(crate::forge_build::ce_cache_roots(inspection.header.scenario_type)?.into_iter().map(str::to_owned));
    let (selected,_)=crate::native_staging::collect_dependency_files(base,roots,false,all.files.len().max(1),20000,|tag|runner.run(&dependency,&["-r".into(),"-t".into(),base.to_string_lossy().into(),tag.into()],jobs.parent().ok_or_else(||SparkError::Invalid("Native jobs have no owned library".into()))?,"dependencies",8))?;
    if maps::hash_file(&dependency)?!=dependency_sha256{return invalid("CE dependency tool changed while planning; no source was staged");}
    let inventory=crate::native_staging::selected_inventory(&all,&selected)?;
    let dir=jobs.join(id);let lease=crate::storage::Store::for_output(&dir)?.reserve(&dir,Some(base),crate::storage::estimate_copy(inventory.files.len(),inventory.bytes).saturating_add(inspection.header.declared_size as u64*2).saturating_add(512*1024*1024),crate::storage::Category::Staging,"Native CE source build; isolated matching tags, recovered modules and compiled output")?;
    crate::reject_links(&dir)?;fs::create_dir_all(jobs)?;fs::create_dir(&dir)?;lease.mark_owned()?;
    project::save_project(&dir.join("project.gsproject"),project)?;
    let runner=Runner{id,project:&project.id,cancel:&cancel,event:&event};
    let executables=["invader-build","invader-info","invader-edit","invader-recover","invader-dependency"].into_iter().map(|name|{let file=tool_path(tools,name).unwrap();crate::reject_links(&file)?;Ok((name,(file.clone(),maps::hash_file(&file)?)))}).collect::<Result<std::collections::BTreeMap<_,_>>>()?;
    let recheck=||->Result<()>{for (_, (file,hash)) in &executables {if maps::hash_file(file)?!=*hash{return invalid("Native CE tool changed during build");}}Ok(())};
    let result=(||->Result<(PathBuf,String)>{
        let tags=dir.join("tags");let hashes=crate::native_staging::copy(base,&tags,&inventory,&cancel,|done,total,_,_|{if done==total{runner.emit("stage",format!("Prepared {total} matching native CE tags; originals unchanged"),20,"info");}})?;
        let tags=fs::canonicalize(&tags)?;
        project::atomic_write(&dir.join("input-tags.json"),&serde_json::to_vec_pretty(&hashes)?,false)?;
        let data=dir.join("data");fs::create_dir(&data)?;let data=fs::canonicalize(data)?;
        let scenario=format!("{}.scenario",inspection.scenario_path);
        recheck()?;
        let kind=runner.run(&executables["invader-edit"].0,&["-t".into(),tags.to_string_lossy().into(),"-G".into(),"type".into(),scenario.clone()],&dir,"recovery-readback",22)?;
        let expected=if inspection.header.scenario_type==0{"singleplayer"}else{"multiplayer"};
        if kind.trim()!=expected{return invalid("Selected editable scenario has a different native type from the source map");}
        let modules=runner.run(&executables["invader-edit"].0,&["-t".into(),tags.to_string_lossy().into(),"-C".into(),"source_files".into(),scenario.clone()],&dir,"recovery-readback",23)?.trim().parse::<usize>().map_err(|_|SparkError::Invalid("Native scenario module count is unreadable".into()))?;
        if modules>16{return invalid("Native scenario exceeds the supported complete16-module source recovery limit");}
        if modules>0 {
            let names=runner.run(&executables["invader-edit"].0,&["-t".into(),tags.to_string_lossy().into(),"-G".into(),"source_files[*].name".into(),scenario.clone()],&dir,"recovery-readback",24)?;
            crate::source_recovery::validate_output_names(&names)?;
            if names.lines().count()!=modules{return invalid("Native module names differ from their array count");}
            runner.run(&executables["invader-recover"].0,&["-t".into(),tags.to_string_lossy().into(),"-d".into(),data.to_string_lossy().into(),"-b".into(),scenario.clone()],&dir,"recovery-data",27)?;
            let files=crate::working_tags::script_source_inventory(Some(&data),&cancel)?.0;
            if files.len()!=modules{return invalid("Recovered HaloScript modules are incomplete; no native source build was accepted");}
        }
        let output_dir=dir.join("output");fs::create_dir(&output_dir)?;let output_dir=fs::canonicalize(output_dir)?;recheck()?;
        runner.run(&executables["invader-build"].0,&["-g".into(),"gbx-custom".into(),"-t".into(),tags.to_string_lossy().into(),"-m".into(),output_dir.to_string_lossy().into(),"--resource-usage".into(),"none".into(),inspection.scenario_path.clone()],&dir,"compile-ce",55)?;
        let stem=inspection.scenario_path.rsplit(['\\','/']).next().ok_or_else(||SparkError::Invalid("Missing native CE scenario name".into()))?;
        let output=output_dir.join(format!("{stem}.map"));let compiled=maps::inspect_map(&output,None)?;
        if compiled.header.version!=609||compiled.header.extended||compiled.header.scenario_type!=inspection.header.scenario_type||compiled.scenario_path.replace('\\',"/").to_lowercase()!=inspection.scenario_path.replace('\\',"/").to_lowercase()||(!inspection.mesh.indices.is_empty()&&compiled.mesh.indices.is_empty()){return invalid("CE source build has the wrong format/scenario/type or lost native collision");}
        for script in &inspection.scripts {if !compiled.scripts.iter().any(|s|s.name==script.name&&s.script_type==script.script_type&&s.return_type==script.return_type){return invalid("CE source rebuild lost an original script signature; reconcile the source instead of dropping it");}}
        for check in ["crc32_mismatched","is_protected","stub_count"] {
            let value=runner.run(&executables["invader-info"].0,&["-T".into(),check.into(),output.to_string_lossy().into()],&dir,"verify",90)?;
            if !["0","false"].contains(&value.trim()){return invalid(format!("Native CE {check} check failed: {value}"));}
        }
        crate::audio_rules::verify(&output,&compiled)?;recheck()?;
        if serde_json::to_value(crate::native_staging::inventory(base,&cancel)?)?!=serde_json::to_value(&all)?{return invalid("Selected CE source inventory changed during compilation");}
        for (relative,hash) in &hashes {if cancel.load(Ordering::Relaxed){return invalid("Build cancelled");}if maps::hash_file(&base.join(safe_relative(relative)?))?!=*hash{return invalid("Selected CE source changed during compilation");}}
        if maps::hash_file(&source.preserved_path)?!=source.sha256||maps::hash_file(&output)?!=compiled.sha256{return invalid("Original CE cache or compiled output changed during readback");}
        project::atomic_write(&dir.join("conversion-manifest.json"),&serde_json::to_vec_pretty(&serde_json::json!({"schemaVersion":1,"nativeTarget":"gbx-custom","sourceSha256":source.sha256,"sourcePreserved":true,"compilerSha256":executables["invader-build"].1,"cacheVersion":609,"selectedEditableSource":true,"inputTagsSha256":maps::hash_file(&dir.join("input-tags.json"))?,"recoveredScriptModules":modules,"selectedTagFiles":inventory.files.len(),"selectedTagBytes":inventory.bytes,"availableTagFiles":all.files.len(),"dependencyToolSha256":dependency_sha256,"gameplayVerified":false}))?,false)?;
        let semantic=crate::portability::compare(inspection,&compiled)?;project::atomic_write(&dir.join("semantic-changes.json"),&serde_json::to_vec_pretty(&semantic)?,false)?;
        Ok((output,compiled.sha256))
    })();
    let record=match result {Ok((output,hash))=>BuildRecord{id:id.into(),timestamp:chrono::Utc::now().to_rfc3339(),status:"validated".into(),target:"gbx-custom".into(),output:Some(output),sha256:Some(hash),message:"Selected native CE tags compiled, recovered scripts and independent cache/type/CRC/source checks passed. Native source changes and gameplay require review; this is not an automatic format conversion.".into(),project_fingerprint:project.fingerprint()?},Err(e)=>BuildRecord{id:id.into(),timestamp:chrono::Utc::now().to_rfc3339(),status:if cancel.load(Ordering::Relaxed){"cancelled"}else{"failed"}.into(),target:"gbx-custom".into(),output:None,sha256:None,message:e.to_string(),project_fingerprint:project.fingerprint()?}};
    project::atomic_write(&dir.join("receipt.json"),&serde_json::to_vec_pretty(&record)?,false)?;
    runner.emit(&record.status,&record.message,100,if record.status=="validated"{"success"}else{"error"});
    if record.status=="validated"{lease.finish(true,Some(record.project_fingerprint.clone()))?;}
    Ok(record)
}

pub fn run_build(
    project: &Project,
    inspection: &MapInspection,
    tools: &Toolchain,
    jobs_root: &Path,
    job_id: &str,
    cancel: Arc<AtomicBool>,
    on_event: impl Fn(JobEvent) + Send + Sync,
) -> Result<BuildRecord> {
    run_build_with_retention(project, inspection, tools, jobs_root, job_id, cancel, on_event, true)
}

pub fn run_batch_map(
    project: &Project,
    inspection: &MapInspection,
    tools: &Toolchain,
    jobs_root: &Path,
    job_id: &str,
    cancel: Arc<AtomicBool>,
    on_event: impl Fn(JobEvent) + Send + Sync,
) -> Result<BuildRecord> {
    if selected_ce_source(project) {
        return invalid("Numeric batch compilation requires the imported-map MCC route");
    }
    if cancel.load(Ordering::Relaxed) {
        return invalid("Build cancelled");
    }
    run_build_with_retention(project, inspection, tools, jobs_root, job_id, cancel, on_event, false)
}

fn run_build_with_retention(
    project: &Project,
    inspection: &MapInspection,
    tools: &Toolchain,
    jobs_root: &Path,
    job_id: &str,
    cancel: Arc<AtomicBool>,
    on_event: impl Fn(JobEvent) + Send + Sync,
    retain: bool,
) -> Result<BuildRecord> {
    uuid::Uuid::parse_str(job_id)
        .map_err(|_| SparkError::Invalid("Job ID is not a UUID".into()))?;
    if selected_ce_source(project){return run_ce_source_build(project,inspection,tools,jobs_root,job_id,cancel,on_event);}
    let report = compatibility(project, inspection, tools);
    if !report.ready {
        return invalid(report.blockers.join("\n"));
    }
    let source = project
        .source
        .as_ref()
        .ok_or_else(|| SparkError::Invalid("No source cache".into()))?;
    if maps::hash_file(&source.preserved_path)? != source.sha256 {
        return invalid("Preserved source checksum changed");
    }
    let name = safe_relative(&inspection.header.name)?;
    if name.components().count() != 1 {
        return invalid("Cache name is not a single safe filename");
    }
    safe_relative(&inspection.scenario_path)?;
    let dir = jobs_root.join(job_id);
    let sdk_bytes=if let Some(tags)=tools.base_tags_directory.as_ref().filter(|p|p.is_dir()){let plan=crate::native_staging::inventory(tags,&cancel)?;crate::storage::estimate_copy(plan.files.len(),plan.bytes)}else{0};
    let estimate=sdk_bytes.saturating_add(inspection.header.declared_size as u64*2).saturating_add(1024*1024*1024);
    let storage_lease=crate::storage::Store::for_output(&dir)?.reserve(&dir,Some(&source.preserved_path),estimate,crate::storage::Category::Staging,"Imported-cache conversion: isolated input, native tags and compiler output")?;
    crate::reject_links(&dir)?;
    fs::create_dir_all(&dir)?;
    storage_lease.mark_owned()?;
    project::save_project(&dir.join("project.gsproject"),project)?;
    let input_workspace = TransientInput::create(jobs_root, &source.preserved_path, &source.sha256,
        fs::metadata(&source.preserved_path)?.len().max(inspection.header.declared_size as u64))?;
    let input_dir = input_workspace.directory.clone();
    let tag_dir = dir.join("tags");
    let output_dir = dir.join("output");
    for p in [&tag_dir, &output_dir] {
        fs::create_dir(p)?;
    }
    let runner = Runner {
        id: job_id,
        project: &project.id,
        cancel: &cancel,
        event: &on_event,
    };
    runner.emit(
        "validate",
        "Source SHA-256 verified. Original and stock maps remain read-only.",
        5,
        "info",
    );
    let result = (|| -> Result<(PathBuf,String)> {
        let info = tool_path(tools, "invader-info").unwrap();
        let extract = tool_path(tools, "invader-extract").unwrap();
        let native=crate::conversion::native_tool(tools);
        if !project.powerups.is_empty()&&native.is_none(){return invalid("Custom power-up conversion requires the native MCC H1A compiler and invader-edit; select the installed MCC tools before rebuilding");}
        let build = tool_path(tools, "invader-build");
        for exe in [&info, &extract].into_iter().chain(build.as_ref().filter(|_|native.is_none())) {
            runner.run(exe, &["-i".into()], &dir, "tools", 8)?;
        }
        let input = input_dir.join(format!("{}.map", inspection.header.name));
        if inspection.header.compressed
            && project.tag_edits.is_empty()
            && project.scene == inspection.objects
        {
            copy_verified_source(&source.preserved_path, &source.sha256, &input)?;
        } else {
            let mut bytes = if project.tag_edits.is_empty() && project.scene == inspection.objects {
                let (_, bytes, sha256) = maps::read_cache_snapshot(&source.preserved_path)?;
                if sha256 != source.sha256 || sha256 != inspection.sha256 {
                    return invalid(
                        "Preserved source or inspection changed before the build snapshot",
                    );
                }
                bytes
            } else {
                let(bytes,preservation)=crate::portability::verify_preservation(project,inspection)?;
                project::atomic_write(&dir.join("native-preservation.json"),&serde_json::to_vec_pretty(&preservation)?,false)?;
                bytes
            };
            let mut repairs = crate::legacy::prepare_extraction(&mut bytes, inspection)?;
            if project.conversion_profile.as_deref()==Some("zombie-recovery"){repairs.extend(crate::legacy::prepare_zombie_recovery(&mut bytes,inspection)?);}
            for repair in &repairs {
                runner.emit("compatibility", &repair.message, 10, "warning");
            }
            if !repairs.is_empty() {
                project::atomic_write(
                    &dir.join("compatibility-repairs.json"),
                    &serde_json::to_vec_pretty(&repairs)?,
                    false,
                )?;
            }
            fs::write(&input, bytes)?;
        }
        let protected = runner.run(
            &info,
            &[
                "-T".into(),
                "is_protected".into(),
                input.to_string_lossy().into_owned(),
            ],
            &dir,
            "validate",
            12,
        )?;
        if !["false", "0"].contains(&protected.trim().to_ascii_lowercase().as_str()) {
            return invalid(format!("Source protection check did not return false: {protected}. No extraction was attempted."));
        }
        let resource_root=fs::canonicalize(resource_folder(source, tools).unwrap_or(&input_dir))?;
        let resource_dir=resource_root.as_path();
        validate_resource_snapshot(source, Some(resource_dir))?;
        if native.is_some(){
            runner.emit("dependencies","Copying and hashing the selected legal SDK tags into this job",15,"info");
            let hashes=crate::forge_build::stage_tags(tools.base_tags_directory.as_ref().ok_or_else(||SparkError::Invalid("MCC SDK tags missing".into()))?,&dir.join("sdk-tags"),&cancel,|done,total,bytes,total_bytes|runner.emit("tag-staging",&format!("Prepared {done}/{total} tags · {}/{} MiB",bytes/(1024*1024),total_bytes/(1024*1024)),(15+done*8/total.max(1)) as u8,"info"))?;
            // Keep one writable tag tree. SDK hashes are retained separately;
            // extracted source tags replace the staged copies via -O.
            fs::remove_dir(&tag_dir)?;
            fs::rename(dir.join("sdk-tags"),&tag_dir)?;
            project::atomic_write(&dir.join("input-sdk-tags.json"),&serde_json::to_vec_pretty(&hashes)?,false)?;
        }
        let mut extraction=vec!["-t".into(),tag_dir.to_string_lossy().into_owned(),"-m".into(),resource_dir.to_string_lossy().into_owned()];
        if native.is_some(){
            extraction.push("-O".into());
            if (inspection.header.version==609&&!resource_dir.join("bitmaps.map").is_file())||inspection.header.version==13{
                if inspection.header.version==13{
                    let scenario=tag_dir.join(safe_relative(&format!("{}.scenario",inspection.scenario_path))?);
                    if !scenario.is_file(){return invalid("Rebuilding this MCC map needs matching editable scenario tags. Select the tagset that created this map; shared MCC resources cannot be reconstructed from a cache header");}
                    runner.emit("mcc-resources","Using the selected matching editable tagset for MCC bitmap/sound resources; extracted local tags retain their own identities. Campaign and UI scenario types are preserved",23,"warning");
                    let mut reused=std::collections::BTreeMap::new();
                    for tag in inspection.tags.iter().filter(|t|matches!(t.class.as_str(),"bitm"|"snd!")){
                        let extension=if tag.class=="bitm"{"bitmap"}else{"sound"};let relative=format!("{}.{extension}",tag.path);let file=tag_dir.join(safe_relative(&relative)?);core_check_reused_tag(&file,&relative)?;reused.insert(relative,maps::hash_file(&file)?);
                    }
                    project::atomic_write(&dir.join("mcc-shared-resources.json"),&serde_json::to_vec_pretty(&reused)?,false)?;
                    extraction.extend(["-e".into(),"*.bitmap".into(),"-e".into(),"*.sound".into()]);
                }
                extraction.push("-G".into());
            }
        }
        if project.conversion_profile.as_deref()==Some("zombie-recovery"){for name in ["sound\\dialog\\multiplayer1\\scorpion.sound","sound\\dialog\\multiplayer1\\hill_occupied.sound"]{extraction.extend(["-e".into(),name.into()]);}}
        extraction.push(input.to_string_lossy().into_owned());
        runner.run(
            &extract,
            &extraction,
            &dir,
            "extract",
            25,
        )?;
        let scenario_file = tag_dir.join(safe_relative(&format!(
            "{}.scenario",
            inspection.scenario_path
        ))?);
        if !scenario_file.is_file()
            && !tag_dir
                .join(safe_relative(&format!(
                    "{}.scenario",
                    inspection.scenario_path.to_ascii_lowercase()
                ))?)
                .is_file()
        {
            return invalid("Extractor did not produce the indexed scenario; refusing to compile a different map");
        }
        if !project.native_asset_imports.is_empty(){let root=jobs_root.parent().ok_or_else(||SparkError::Invalid("Managed job root is missing".into()))?;crate::native_asset_imports::stage(root,project,&tag_dir)?;}
        if native.is_some(){crate::conversion::compile_native(project,inspection,tools,&runner,&dir,&tag_dir,&output_dir)?;}else{runner.run(
            build.as_ref().ok_or_else(||SparkError::Invalid("Invader builder missing".into()))?,
            &[
                "-g".into(),
                "mcc-cea".into(),
                "-t".into(),
                tag_dir.to_string_lossy().into_owned(),
                "-m".into(),
                output_dir.to_string_lossy().into_owned(),
                "--resource-usage".into(),
                "none".into(),
                inspection.scenario_path.clone(),
            ],
            &dir,
            "compile",
            55,
        )?;}
        let stem = inspection
            .scenario_path
            .rsplit(['\\', '/'])
            .next()
            .ok_or_else(|| SparkError::Invalid("Empty scenario name".into()))?;
        let mut output = output_dir.join(format!("{stem}.map"));
        if !output.is_file() {
            output = output_dir.join(format!("{}.map", stem.to_ascii_lowercase()));
        }
        let validated = maps::inspect_map(&output, Some(resource_dir))?;
        let sound_classes=crate::audio_rules::verify(&output,&validated)?;
        project::atomic_write(&dir.join("native-sound-classes.json"),&serde_json::to_vec_pretty(&sound_classes)?,false)?;
        crate::native_asset_imports::verify_compiled(project,&validated)?;
        if !project.native_asset_imports.is_empty(){let _=crate::native_asset_imports::available_files(jobs_root.parent().unwrap(),project)?;}
        crate::tag_duplicates::verify_compiled(project,inspection,&validated)?;
        crate::tag_renames::verify_compiled(project,inspection,&validated)?;
        if let Some(hud)=maps::verify_hud_edits(project,inspection,&validated)? {
            project::atomic_write(&dir.join("native-hud-readback.json"),&serde_json::to_vec_pretty(&hud)?,false)?;
            runner.emit("hud-readback",format!("{} HUD tags: {} admitted native fields matched saved source, including {} staged edits. Rendering/game acceptance is separate.",hud.tags.len(),hud.tags.iter().map(|tag|tag.fields_compared).sum::<usize>(),hud.tags.iter().map(|tag|tag.edited_fields).sum::<usize>()),89,"info");
        }
        crate::native_lighting::verify_cache(project,&output,&validated)?;
        crate::powerups::verify_compiled(project,&validated,&dir)?;
        if let Some(assembly)=&project.bsp_assembly{
            let (compiled_collision,compiled_faces)=maps::collision_source(&output,&validated)?;
            let manifest:serde_json::Value=serde_json::from_slice(&fs::read(dir.join("bsp-assembly.json"))?)?;
            let materials:Vec<crate::bsp_assembly::AssemblyMaterial>=serde_json::from_value(manifest.get("materials").cloned().ok_or_else(||SparkError::Invalid("Assembly material receipt missing".into()))?)?;
            let expected:std::collections::BTreeMap<_,_>=materials.iter().filter(|m|m.collision_only).map(|m|(m.name.as_str(),m.flags&15)).collect();
            for face in &compiled_faces{if let Some(id)=face.shader{let tag=validated.tags.iter().find(|t|t.id==id).ok_or_else(||SparkError::Invalid("Compiled collision shader is not indexed".into()))?;let name=tag.path.rsplit(['\\','/']).next().unwrap_or("");if expected.get(name).copied()!=Some(face.flags&15){return invalid("MCC cache collision surface flags differ from their source identities; output was not accepted");}}}
            let samples=crate::bsp_assembly::verify_route(&compiled_collision,assembly)?;
            if assembly.include_donor_scenery {
                let scenery:Vec<crate::bsp_scenery::Placement>=serde_json::from_value(manifest.get("donorScenery").cloned().ok_or_else(||SparkError::Invalid("Donor scenery receipt is missing".into()))?)?;
                crate::bsp_scenery::verify_compiled(inspection,&validated,&output,&scenery,&format!("gsbsp_{}_1",&runner.id[..8]),0)?;
                runner.emit("bsp-scenery-readback",&format!("{} donor scenery tags, transforms, permutations and placement flags verified in the compiled cache",scenery.len()),92,"success");
            }
            runner.emit("bsp-clearance",&format!("Compiled collision checked at {samples} tunnel floor/clearance samples; manual walkthrough pending"),92,"success");
        }
        if validated.header.version != 13
            || !validated
                .scenario_path
                .replace('\\', "/")
                .eq_ignore_ascii_case(&inspection.scenario_path.replace('\\', "/"))
        {
            return invalid("Build output has the wrong cache version or scenario");
        }
        if inspection.scripts.iter().any(|script|!validated.scripts.iter().any(|s|s.name==script.name)){
            return invalid("Target compilation lost an original scenario script; recover its source before converting. This output is not accepted");
        }
        let mismatch = runner.run(
            &info,
            &[
                "-T".into(),
                "crc32_mismatched".into(),
                output.to_string_lossy().into_owned(),
            ],
            &dir,
            "verify",
            90,
        )?;
        if !["false", "0"].contains(&mismatch.trim().to_ascii_lowercase().as_str()) {
            return invalid(format!("Output CRC32 validation failed: {mismatch}"));
        }
        for kind in ["is_protected","stub_count"]{let value=runner.run(&info,&["-T".into(),kind.into(),output.to_string_lossy().into_owned()],&dir,"verify",93)?;if !["false","0"].contains(&value.trim().to_ascii_lowercase().as_str()){return invalid(format!("Output {kind} validation failed: {value}"));}}
        if maps::hash_file(&source.preserved_path)? != source.sha256 {
            return invalid("Preserved source integrity changed during build");
        }
        validate_resource_snapshot(source, Some(resource_dir))?;
        let semantic=crate::portability::compare(inspection,&validated)?;
        project::atomic_write(&dir.join("semantic-changes.json"),&serde_json::to_vec_pretty(&semantic)?,false)?;
        project::atomic_write(&dir.join("semantic-changes.md"),crate::portability::diff_markdown(&semantic).as_bytes(),false)?;
        if maps::hash_file(&output)?!=validated.sha256 {return invalid("Compiled output changed after native readback; no output was adopted");}
        Ok((output,validated.sha256))
    })();
    let record = match result {
        Ok((output,verified_sha256)) => BuildRecord {
            id: job_id.into(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            status: "validated".into(),
            target: "mcc-cea".into(),
            sha256: Some(verified_sha256),
            output: Some(output),
            message: if project.conversion_profile.as_deref()==Some("zombie-recovery"){"Zombie Apocalypse recovery edition compiled as MCC cache 13. Two custom audio cues are unavailable and one corrupt placement is disabled; valid placements and vehicle spawners remain. Game load and behavior require testing."}else{"MCC cache rebuilt and structurally validated. In-game load test pending."}.into(),
            project_fingerprint: project.fingerprint()?,
        },
        Err(e) => BuildRecord {
            id: job_id.into(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            status: if cancel.load(Ordering::Relaxed) {
                "cancelled"
            } else {
                "failed"
            }
            .into(),
            target: "mcc-cea".into(),
            output: None,
            sha256: None,
            message: e.to_string(),
            project_fingerprint: project.fingerprint()?,
        },
    };
    if record.status == "validated" {
        input_workspace.finish(&record, &dir.join("transient-input-receipt.json"))?;
    } else {
        // Failure/cancellation/interruption keeps the owned partial input and
        // its lease for recovery; it is never certified disposable.
        drop(input_workspace);
    }
    project::atomic_write(
        &dir.join("receipt.json"),
        &serde_json::to_vec_pretty(&record)?,
        false,
    )?;
    runner.emit(
        &record.status,
        &record.message,
        100,
        if record.status == "validated" {
            "success"
        } else {
            "error"
        },
    );
    if record.status=="validated"{storage_lease.finish(retain,Some(record.project_fingerprint.clone()))?;}else{drop(storage_lease);}
    Ok(record)
}

fn core_check_reused_tag(file:&Path,relative:&str)->Result<()>{crate::reject_links(file)?;if !file.is_file(){return invalid(format!("The selected editable tagset does not contain {relative}. MCC BSP assembly requires matching editable images and sounds; no replacement was substituted"));}Ok(())}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_source_provenance_never_relabels_mcc_or_unreviewed_ce_receipts() {
        let mut receipt=serde_json::json!({"schemaVersion":1,"sourceSha256":"a".repeat(64),"compilerSha256":"b".repeat(64),"sourcePreserved":true});
        verify_native_source_provenance(&receipt,"mcc-cea",&"a".repeat(64),&"b".repeat(64)).unwrap();
        assert!(verify_native_source_provenance(&receipt,"gbx-custom",&"a".repeat(64),&"b".repeat(64)).is_err());
        receipt["nativeTarget"]="gbx-custom".into();receipt["cacheVersion"]=609.into();receipt["selectedEditableSource"]=true.into();
        verify_native_source_provenance(&receipt,"gbx-custom",&"a".repeat(64),&"b".repeat(64)).unwrap();
        assert!(verify_native_source_provenance(&receipt,"mcc-cea",&"a".repeat(64),&"b".repeat(64)).is_err());
        assert!(verify_native_source_provenance(&receipt,"gbx-custom",&"c".repeat(64),&"b".repeat(64)).is_err());
        assert!(verify_native_source_provenance(&receipt,"gbx-custom",&"a".repeat(64),&"c".repeat(64)).is_err());
        receipt["sourcePreserved"]=false.into();assert!(verify_native_source_provenance(&receipt,"gbx-custom",&"a".repeat(64),&"b".repeat(64)).is_err());
    }
    #[test]
    #[ignore="Requires explicitly selected owned CE map, matching tags, tools and disposable jobs output"]
    fn installed_ce_source_build_retains_modules_provenance_and_originals() {
        let source=PathBuf::from(std::env::var_os("SPARK_NATIVE_CE_SOURCE_CACHE").expect("Owned CE cache required"));
        let tags=PathBuf::from(std::env::var_os("SPARK_NATIVE_CE_SOURCE_TAGS").expect("Matching CE tags required"));
        let invader=PathBuf::from(std::env::var_os("SPARK_NATIVE_CE_SOURCE_INVADER").expect("Installed Invader required"));
        let jobs=PathBuf::from(std::env::var_os("SPARK_NATIVE_CE_SOURCE_JOBS").expect("Owned disposable jobs required"));
        let before=maps::hash_file(&source).unwrap();let inspection=maps::inspect_map(&source,None).unwrap();assert_eq!(inspection.header.version,609);
        let mut project=Project::new("Native CE source handoff");project.scene=inspection.objects.clone();
        project.source=Some(crate::project::Source{original_path:source.clone(),preserved_path:source.clone(),sha256:before.clone(),cache_version:609,engine:inspection.header.engine.clone(),scenario_path:inspection.scenario_path.clone(),archive:None,resource_directory:None,resource_sha256:Default::default(),audio_resources:None});
        let target=uuid::Uuid::new_v4().to_string();project.active_build_target=Some(target.clone());
        project.build_targets.push(crate::project::EngineBuildTarget{id:target,name:"Reviewed native CE".into(),runtime_id:crate::runtime::RuntimeId::ChupathingyCe,builder:"invader-ce".into(),hek_directory:None,hek_flavor:Some("legacyHek".into()),tags_directory:Some(tags.clone()),invader_directory:Some(invader.clone()),ce_compatible_tagset:true,open_sauce:false});
        let tools=Toolchain{base_tags_directory:Some(tags),invader_directory:Some(invader.clone()),..Default::default()};
        let report=compatibility(&project,&inspection,&tools);assert!(report.ready,"{:?}",report.blockers);assert!(report.target.contains("609"));
        let mut pending=project.clone();pending.scene.pop();assert!(!compatibility(&pending,&inspection,&tools).ready,"Native pending edits must not disappear");
        let id=uuid::Uuid::new_v4().to_string();let build=run_build(&project,&inspection,&tools,&jobs,&id,Arc::new(AtomicBool::new(false)),|e|println!("{}: {}",e.phase,e.message)).unwrap();
        assert_eq!(build.status,"validated","{}",build.message);assert_eq!(build.target,"gbx-custom");
        let output=build.output.as_ref().unwrap();let readback=maps::inspect_map(output,None).unwrap();assert_eq!(readback.header.version,609);assert_eq!(readback.header.scenario_type,inspection.header.scenario_type);
        let receipt:serde_json::Value=serde_json::from_slice(&fs::read(jobs.join(&id).join("conversion-manifest.json")).unwrap()).unwrap();
        verify_native_source_provenance(&receipt,"gbx-custom",&before,&maps::hash_file(&tool_path(&tools,"invader-build").unwrap()).unwrap()).unwrap();
        assert!(receipt["selectedTagFiles"].as_u64().unwrap()<=receipt["availableTagFiles"].as_u64().unwrap());
        let modules=crate::working_tags::script_source_inventory(Some(&jobs.join(&id).join("data")),&AtomicBool::new(false)).unwrap().0;
        assert_eq!(modules.len() as u64,receipt["recoveredScriptModules"].as_u64().unwrap());
        assert_eq!(before,maps::hash_file(&source).unwrap());project.builds.push(build.clone());project::save_project(&jobs.join("ce-handoff.gsproject"),&project).unwrap();
        let reopened=project::load_project(&jobs.join("ce-handoff.gsproject")).unwrap();assert_eq!(reopened.fingerprint().unwrap(),project.fingerprint().unwrap());
        let input=crate::working_tags::WorkingTagsInput{mission_hud:None,hud_readback_targets:vec![],scenario_squad_readback:None,encounter_append:None,script_attachment:None,expected_encounter:None,compile_scripts:true,expected_tag_identity:Some(crate::working_tags::source_identity(&jobs.join(&id).join("tags"),&AtomicBool::new(false)).unwrap()),bsp_audio:None,parent_build:build.clone(),tags_directory:jobs.join(&id).join("tags"),scenario_path:inspection.scenario_path.clone(),scenario_type:inspection.header.scenario_type,tool:tool_path(&tools,"invader-build").unwrap(),invader_info:tool_path(&tools,"invader-info").unwrap()};
        let hud_review=std::env::var("SPARK_NATIVE_CE_MISSION_HUD_REVIEW").as_deref()==Ok("1");
        let mut reopened=reopened;let mut input=input;
        let read_fields=|tags:&Path|{
            let result=std::process::Command::new(invader.join("invader-edit.exe")).args(["-t",tags.to_str().unwrap(),"-L",&format!("{}.scenario",inspection.scenario_path)]).output().unwrap();
            assert!(result.status.success(),"{}",String::from_utf8_lossy(&result.stderr));String::from_utf8(result.stdout).unwrap()
        };
        if hud_review {
            assert_eq!(inspection.header.scenario_type,0,"Mission HUD requires actual solo source");
            reopened.studio=Some(serde_json::from_value(serde_json::json!({"schemaVersion":1,"missions":[{"id":"technology","title":"Technology","objective":"Recover the technology","trigger":"manual","encounterName":"","hudObjective":true,"hudText":"Recover the technology and return to extraction."}],"shots":[],"playtests":[],"server":{"name":"Private","runtime":"haloCustomEdition","maxPlayers":1,"publicListing":false,"rotation":[],"gameTypes":[]}})).unwrap());
            let string_sha=maps::hash_file(&invader.join("invader-string.exe")).unwrap();
            input.mission_hud=Some(crate::working_tags::prepare_mission_hud_append(&reopened,&input.tags_directory,&read_fields(&input.tags_directory),None,&string_sha).unwrap().unwrap().review);
            // A reviewed native module exercises the name without replacing the recovered mission.
            let content="(script dormant gs_hud_review\n  (hud_set_objective_text gs_mission_obj_1)\n)\n".to_string();
            input.script_attachment=Some(crate::working_tags::ScriptAttachment{filename:"spark_hud_review.hsc".into(),sha256:crate::hex_bytes(Sha256::digest(content.as_bytes())),content,replaces_sha256:None});
        }
        let second=uuid::Uuid::new_v4().to_string();let rebuilt=crate::working_tags::run_build_from_tags(&reopened,&input,&jobs,&second,Arc::new(AtomicBool::new(false)),|e|println!("working {}: {}",e.phase,e.message)).unwrap();
        assert_eq!(rebuilt.status,"validated","{}",rebuilt.message);assert_eq!(maps::hash_file(&source).unwrap(),before);
        println!("CE source/Save/reopen/native working-script rebuild PASS: first={}; second={}; originalSHA={before}; modules={}; no app/game acceptance",readback.sha256,rebuilt.sha256.as_ref().unwrap(),modules.len());
        if hud_review {
            let output=rebuilt.output.as_ref().unwrap();let compiled=maps::inspect_map(output,None).unwrap();
            let receipt:crate::working_tags::WorkingTagsReceipt=serde_json::from_slice(&fs::read(jobs.join(&second).join("working-tags-receipt.json")).unwrap()).unwrap();
            let owner=receipt.generated_mission_hud.as_ref().unwrap();let hud=maps::scenario_hud_messages(output,&compiled).unwrap().unwrap();assert_eq!(hud.messages,owner.messages);assert!(compiled.scripts.iter().any(|script|script.name=="gs_hud_review"));
            let parent_tags_identity=crate::working_tags::source_identity(&receipt.tags_directory,&AtomicBool::new(false)).unwrap();
            let old_index=hud.messages.iter().position(|message|message.name=="gs_mission_obj_1").unwrap();
            reopened.builds.push(rebuilt.clone());reopened.studio.as_mut().unwrap().missions[0].hud_text=Some("Bring the technology back to the extraction terminal.".into());
            project::save_project(&jobs.join("ce-handoff.gsproject"),&reopened).unwrap();let revised=project::load_project(&jobs.join("ce-handoff.gsproject")).unwrap();
            let mut text_only=input.clone();text_only.parent_build=rebuilt.clone();text_only.tags_directory=receipt.tags_directory.clone();text_only.expected_tag_identity=Some(parent_tags_identity.clone());text_only.compile_scripts=false;text_only.script_attachment=None;
            text_only.mission_hud=Some(crate::working_tags::prepare_mission_hud_append(&revised,&text_only.tags_directory,&read_fields(&text_only.tags_directory),Some(owner),&maps::hash_file(&invader.join("invader-string.exe")).unwrap()).unwrap().unwrap().review);
            let third=uuid::Uuid::new_v4().to_string();let final_build=crate::working_tags::run_build_from_tags(&revised,&text_only,&jobs,&third,Arc::new(AtomicBool::new(false)),|e|println!("HUD text {}: {}",e.phase,e.message)).unwrap();assert_eq!(final_build.status,"validated","{}",final_build.message);
            let final_map=maps::inspect_map(final_build.output.as_ref().unwrap(),None).unwrap();let final_hud=maps::scenario_hud_messages(final_build.output.as_ref().unwrap(),&final_map).unwrap().unwrap();
            assert_eq!(final_hud.messages.len(),hud.messages.len());assert_eq!(final_hud.messages[old_index].name,"gs_mission_obj_1");assert_ne!(final_hud.messages[old_index],hud.messages[old_index]);
            for (index,message) in hud.messages.iter().enumerate(){if index!=old_index{assert_eq!(&final_hud.messages[index],message);}}
            assert_eq!(serde_json::to_value(&final_map.scripts).unwrap(),serde_json::to_value(&compiled.scripts).unwrap(),"Text-only revision preserves all compiled script signatures");
            assert_eq!(crate::working_tags::source_identity(&text_only.tags_directory,&AtomicBool::new(false)).unwrap(),parent_tags_identity);assert_eq!(maps::hash_file(&source).unwrap(),before);
            println!("Campaign HUD combined script/cache + text-only Save/reopen/native readback PASS: combined={}; text-only={}; HUD index={old_index}; messages={}; no native UI/game acceptance",rebuilt.sha256.unwrap(),final_build.sha256.unwrap(),final_hud.messages.len());
        }
    }
    fn lifecycle_record(output: &Path) -> BuildRecord {
        let inspection = maps::inspect_map(output, None).unwrap();
        assert_eq!(inspection.header.version, 13);
        assert_eq!(inspection.tags.len(), 4);
        BuildRecord {
            id: uuid::Uuid::new_v4().to_string(), timestamp: "fixture".into(),
            status: "validated".into(), target: "mcc-cea".into(),
            output: Some(output.to_owned()), sha256: Some(maps::hash_file(output).unwrap()),
            message: "Native-format lifecycle fixture; not a compiler or gameplay acceptance".into(),
            project_fingerprint: "fixture-project".into(),
        }
    }
    #[test]
    fn native_input_lifetime_disposes_after_output_readback_without_removing_editable_tags() {
        let root = tempfile::tempdir().unwrap();
        let library = root.path().join("library");
        let jobs = library.join("jobs");
        fs::create_dir_all(&jobs).unwrap();
        fs::write(library.join("library.sqlite3"), b"fixture library owner").unwrap();
        let source = root.path().join("original.map");
        let original = lifecycle_fixture::fixture(13);
        fs::write(&source, &original).unwrap();
        let source_sha = maps::hash_file(&source).unwrap();
        let store = crate::storage::Store::for_output(&jobs.join("fixture")).unwrap();
        for _ in 0..3 {
            let job = jobs.join(uuid::Uuid::new_v4().to_string());
            let parent = store.reserve(&job, Some(&source), 1024*1024,
                crate::storage::Category::Staging, "Accepted native source/output owner").unwrap();
            fs::create_dir(&job).unwrap();
            fs::create_dir(job.join("tags")).unwrap();
            fs::write(job.join("tags/authored.weapon"), b"unique editable native source").unwrap();
            let input = TransientInput::create(&jobs, &source, &source_sha, original.len() as u64).unwrap();
            let scratch = input.directory.clone();
            copy_verified_source(&source, &source_sha, &scratch.join("fixture.map")).unwrap();
            let mut built = original.clone();
            built[0x1804..0x1808].copy_from_slice(&0.75f32.to_le_bytes());
            let output = job.join("accepted.map");
            fs::write(&output, built).unwrap();
            let record = lifecycle_record(&output);
            assert!(input.finish(&record, &job.join("transient-input-receipt.json")).unwrap() > 0);
            assert!(!scratch.exists());
            assert_eq!(maps::hash_file(&source).unwrap(), source_sha);
            assert_eq!(maps::hash_file(&output).unwrap(), record.sha256.clone().unwrap());
            assert_eq!(fs::read(job.join("tags/authored.weapon")).unwrap(), b"unique editable native source");
            let receipt: serde_json::Value = serde_json::from_slice(&fs::read(job.join("transient-input-receipt.json")).unwrap()).unwrap();
            assert_eq!(receipt["disposed"], true);
            assert_eq!(receipt["derivedInputHashes"]["fixture.map"], source_sha);
            parent.finish(true, Some(record.project_fingerprint)).unwrap();
            assert!(store.overview().unwrap().entries.iter().all(|entry| entry.protected));
            assert_eq!(fs::read_dir(library.join("scratch")).unwrap().count(), 0);
        }
        assert!(!root.path().join(".local").exists());
    }
    #[test]
    fn native_input_interruption_or_unaccepted_output_retains_its_owned_copy() {
        let root = tempfile::tempdir().unwrap();
        let library = root.path().join("library");
        let jobs = library.join("jobs");
        fs::create_dir_all(&jobs).unwrap();
        fs::write(library.join("library.sqlite3"), b"fixture library owner").unwrap();
        let source = root.path().join("original.map");
        let bytes = lifecycle_fixture::fixture(13);
        fs::write(&source, &bytes).unwrap();
        let source_sha = maps::hash_file(&source).unwrap();
        let store = crate::storage::Store::for_output(&jobs.join("fixture")).unwrap();
        let interrupted = TransientInput::create(&jobs, &source, &source_sha, bytes.len() as u64).unwrap();
        let interrupted_path = interrupted.directory.clone();
        copy_verified_source(&source, &source_sha, &interrupted_path.join("fixture.map")).unwrap();
        drop(interrupted);
        assert!(interrupted_path.join("fixture.map").is_file());
        assert_eq!(store.overview().unwrap().entries[0].state, "failed");
        let input = TransientInput::create(&jobs, &source, &source_sha, bytes.len() as u64).unwrap();
        let scratch = input.directory.clone();
        copy_verified_source(&source, &source_sha, &scratch.join("fixture.map")).unwrap();
        let output = root.path().join("output.map");
        fs::write(&output, &bytes).unwrap();
        let record = lifecycle_record(&output);
        fs::write(&output, b"changed output").unwrap();
        assert!(input.finish(&record, &root.path().join("receipt.json")).is_err());
        assert!(scratch.join("fixture.map").is_file());
        assert_eq!(maps::hash_file(&source).unwrap(), source_sha);
        assert!(store.overview().unwrap().entries.iter().all(|entry| entry.state == "failed"));
    }
    #[test]
    fn native_input_is_retained_when_it_is_itself_the_only_accepted_output() {
        let root = tempfile::tempdir().unwrap();
        let jobs = root.path().join("library/jobs");
        fs::create_dir_all(&jobs).unwrap();
        let source = root.path().join("original.map");
        let bytes = lifecycle_fixture::fixture(13);
        fs::write(&source, &bytes).unwrap();
        let sha = maps::hash_file(&source).unwrap();
        let input = TransientInput::create(&jobs, &source, &sha, bytes.len() as u64).unwrap();
        let output = input.directory.join("fixture.map");
        copy_verified_source(&source, &sha, &output).unwrap();
        let record = lifecycle_record(&output);
        assert!(input.finish(&record, &root.path().join("receipt.json")).is_err());
        assert_eq!(maps::hash_file(&output).unwrap(), sha);
    }
    #[test]
    fn unchanged_sdk_preparation_reuses_verified_tags_without_executing_or_copying_again() {
        let root = tempfile::tempdir().unwrap();
        let kit = root.path().join("kit");
        fs::create_dir_all(kit.join("bin/x64")).unwrap();
        let archive = kit.join("HCEEK.7z");
        let extractor = kit.join("bin/x64/7zr.exe");
        fs::write(&archive, b"SDK archive identity fixture; not an actual SDK archive").unwrap();
        fs::write(&extractor, b"Reuse must return before this non-executable fixture is invoked").unwrap();
        let caches = root.path().join("library/sdk-cache");
        let prepared = caches.join("prepared");
        let tags = prepared.join("tags");
        fs::create_dir_all(tags.join("globals")).unwrap();
        fs::write(tags.join("globals/globals.globals"), b"small retained input hash fixture").unwrap();
        let hashes = crate::tool_transaction::inventory(&tags).unwrap();
        fs::write(prepared.join("sdk-input-tags.json"), serde_json::to_vec(&hashes).unwrap()).unwrap();
        fs::write(prepared.join("sdk-provenance.json"), serde_json::to_vec(&serde_json::json!({
            "sourceSha256": maps::hash_file(&archive).unwrap(),
            "extractorSha256": maps::hash_file(&extractor).unwrap(),
        })).unwrap()).unwrap();
        // Archive content identity authorizes reuse even outside the tool folder.
        let selected=root.path().join("selected-sdk.7z");fs::copy(&archive,&selected).unwrap();
        let id=uuid::Uuid::new_v4().to_string();let candidate=caches.join(&id);
        assert_eq!(crate::conversion::prepare_sdk_tags_from_archive(&kit,&selected,&candidate,"fixture",&id,
            |_|panic!("An identical selected SDK must not start extraction")).unwrap(),tags);
        assert!(!candidate.exists());assert_eq!(fs::read(&selected).unwrap(),fs::read(&archive).unwrap());
        for _ in 0..3 {
            let id = uuid::Uuid::new_v4().to_string();
            let candidate = caches.join(&id);
            assert_eq!(crate::conversion::prepare_sdk_tags(&kit, &candidate, "fixture", &id,
                |_| panic!("An identical verified SDK must not start extraction")).unwrap(), tags);
            assert!(!candidate.exists());
            assert_eq!(crate::tool_transaction::inventory(&tags).unwrap(), hashes);
            assert_eq!(fs::read_dir(&caches).unwrap().count(), 1);
        }
    }
    #[test]
    fn sound_stream_failure_overrides_success_footer_without_rejecting_optional_pack_notices() {
        assert!(native_compile_errors("Failed to read data file header sounds\n### FAILED TO OPEN DATA-CACHE FILE.\nsuccessfully built cache file.").is_empty());
        let errors = native_compile_errors("streaming tags...failed to load sound for adding to cache file.\nsuccessfully built cache file.");
        assert_eq!(errors.len(), 1);
        assert!(errors[0].contains("failed to load sound"));
    }
    #[cfg(windows)]
    #[test]
    fn runner_preserves_structured_stdout_and_trims_only_log_presentation() {
        let dir = tempfile::tempdir().unwrap();
        let cancel = AtomicBool::new(false);
        let events = std::sync::Mutex::new(Vec::new());
        let emit = |event: JobEvent| events.lock().unwrap().push(event.message);
        let runner = Runner { id: "structured-output", project: "test", cancel: &cancel, event: &emit };
        // The first line and nested rows deliberately begin with spaces. A
        // field-list consumer must see identical structure after process I/O.
        let expected = "  native fields  \nactor_palette[1] array\n    actor_palette[0] struct\n        reference tag  ";
        let output = runner.run(Path::new("powershell.exe"), &[
            "-NoProfile".into(), "-NonInteractive".into(), "-Command".into(),
            "[Console]::Out.Write(\"  native fields  \r\nactor_palette[1] array\r\n    actor_palette[0] struct\r\n        reference tag  \"); [Console]::Error.WriteLine('  diagnostic  ')".into(),
        ], dir.path(), "bsp-fields", 0).unwrap();
        assert_eq!(output, expected);
        let events = events.lock().unwrap();
        assert!(events.iter().any(|line| line == "native fields"));
        assert!(events.iter().any(|line| line == "diagnostic"));
        assert!(events.iter().all(|line| line == line.trim()));
    }
    #[cfg(windows)]
    #[test]
    fn zero_exit_sound_failure_on_either_stream_refuses_the_build_and_retains_previous_output() {
        let dir = tempfile::tempdir().unwrap();
        let previous = dir.path().join("previous-good.map");
        fs::write(&previous, b"previous verified output").unwrap();
        let hash = maps::hash_file(&previous).unwrap();
        let cancel = AtomicBool::new(false);
        let runner = Runner { id: "native-sound-failure", project: "test", cancel: &cancel, event: &|_| {} };
        for stream in ["Out", "Error"] {
            let result = runner.run(Path::new("powershell.exe"), &[
                "-NoProfile".into(), "-NonInteractive".into(), "-Command".into(),
                format!("[Console]::{stream}.WriteLine('streaming tags...failed to load sound for adding to cache file.'); [Console]::Out.WriteLine('successfully built cache file.'); exit 0"),
            ], dir.path(), "compile", 0);
            assert!(result.unwrap_err().to_string().contains("omitted sound data"));
            assert_eq!(maps::hash_file(&previous).unwrap(), hash);
        }
    }
    #[cfg(windows)]
    #[test]
    fn unresolved_native_shader_prompt_stops_instead_of_looping_on_eof() {
        let dir = tempfile::tempdir().unwrap();
        let cancel = AtomicBool::new(false);
        let runner = Runner { id:"shader-prompt-test",project:"test",cancel:&cancel,event:&|_|{} };
        let start = Instant::now();
        let result = runner.run(Path::new("powershell.exe"), &[
            "-NoProfile".into(),"-NonInteractive".into(),"-Command".into(),
            "while ($true) { [Console]::Out.WriteLine('choose a type for the shader'); Start-Sleep -Milliseconds 20 }".into()
        ],dir.path(),"bsp-structure",0);
        assert!(result.unwrap_err().to_string().contains("interactive shader type"));
        assert!(start.elapsed()<Duration::from_secs(15));
    }
    #[test]
    fn derived_copy_does_not_inherit_preserved_readonly_attribute() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("source.map");
        let output = dir.path().join("derived.map");
        fs::write(&source, b"preserved bytes").unwrap();
        let original_permissions = fs::metadata(&source).unwrap().permissions();
        let mut permissions = original_permissions.clone();
        permissions.set_readonly(true);
        fs::set_permissions(&source, permissions).unwrap();
        let hash = maps::hash_file(&source).unwrap();
        copy_verified_source(&source, &hash, &output).unwrap();
        assert!(!fs::metadata(&output).unwrap().permissions().readonly());
        assert!(fs::metadata(&source).unwrap().permissions().readonly());
        assert_eq!(
            maps::hash_file(&source).unwrap(),
            maps::hash_file(&output).unwrap()
        );
        fs::set_permissions(&source, original_permissions).unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn zero_exit_with_truncated_output_never_passes_validation() {
        let dir = tempfile::tempdir().unwrap();
        let cancel = AtomicBool::new(false);
        let runner = Runner {
            id: "test",
            project: "test",
            cancel: &cancel,
            event: &|_| {},
        };
        let result = runner.run(
            Path::new("powershell.exe"),
            &[
                "-NoProfile".into(),
                "-NonInteractive".into(),
                "-Command".into(),
                "[Console]::Out.Write('x' * (16 * 1024 * 1024 + 1))".into(),
            ],
            dir.path(),
            "extract",
            0,
        );
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("truncated or unreadable"));
    }
}
