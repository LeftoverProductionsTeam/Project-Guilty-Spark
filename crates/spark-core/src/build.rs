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
pub fn compatibility(
    project: &Project,
    inspection: &MapInspection,
    tools: &Toolchain,
) -> CompatibilityReport {
    let mut blockers = vec![];
    let mut warnings = vec![];
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
        if resource.required && !found && !(native&&inspection.header.version==609) {
            blockers.push(format!(
                "Missing {} from the original source runtime; choose its resource folder",
                resource.name
            ));
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
    if project.scene.iter().filter(|o|!crate::native_asset_imports::allowed_addition(project,o,inspection)).count() != inspection.objects.len()
        || project
            .scene
            .iter()
            .any(|o| !crate::native_asset_imports::allowed_addition(project,o,inspection)&&(!inspection.objects.iter().any(|v| v.id == o.id) || o.scale != [1.0; 3] || o.source_model.is_some() || o.asset_id.is_some()))
    {
        blockers.push("Editor-only instances, duplication, deletion and per-instance scale cannot be compiled into Halo tags yet".into());
    }
    if !native&&project.scene.iter().any(|o|o.source_model.is_some()){blockers.push("Imported native placements in compiled source maps require the native MCC source rebuild path".into());}
    if !project.assets.is_empty() {
        warnings
            .push("Workshop assets are preview-only and are not baked into the Halo map".into());
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
        || format!("{:x}", Sha256::digest(&bytes)) != expected_sha256
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
                || (name.eq_ignore_ascii_case("invader-refactor.exe") && matches!(phase,"bsp-namespace"|"bsp-shaders"|"asset-references"))
                || (name.eq_ignore_ascii_case("invader-extract.exe") && phase=="extract")
                || (name.eq_ignore_ascii_case("invader-edit.exe")&&matches!(phase,"asset-native-readback"|"asset-placement"))
                || (name.eq_ignore_ascii_case("invader-dependency.exe")&&phase=="asset-dependencies")
        }) {
            Some(crate::native_workspace::Alias::new(cwd)?)
        } else {None};
        #[cfg(windows)]
        let extraction_args = if matches!(phase,"extract"|"asset-references"|"asset-native-readback"|"asset-placement"|"asset-dependencies") {
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
        let (tx, rx) = std::sync::mpsc::channel();
        let incomplete_output = Arc::new(AtomicBool::new(false));
        let reader = |pipe: Box<dyn std::io::Read + Send>,
                      tx: std::sync::mpsc::Sender<(bool, String)>,
                      incomplete: Arc<AtomicBool>,
                      err| {
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
                            if total > 16 * 1024 * 1024 {
                                incomplete.store(true, Ordering::Relaxed);
                                let _ = tx.send((
                                    true,
                                    "Tool output exceeded 16 MiB; remaining output was discarded"
                                        .into(),
                                ));
                                std::io::copy(&mut reader, &mut std::io::sink()).ok();
                                break;
                            }
                            let line = String::from_utf8_lossy(&data).trim().to_string();
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
        let protected_write_phase = matches!(phase, "structure" | "lightmaps" | "scenario" | "bsp-structure" | "bsp-lightmaps");
        let mut deferred_cancel = false;
        let mut deferred_timeout = false;
        let mut output = String::new();
        let mut errors = vec![];
        let result = loop {
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
                if (phase!="bsp-detail"||err)&&(phase!="bsp-index"||err||!line.bytes().all(|b|b.is_ascii_digit())){
                    self.emit(phase, line, progress, if err { "tool" } else { "info" });
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
            if phase!="bsp-detail"||err {self.emit(phase, line, progress, if err { "tool" } else { "info" });}
        }
        result?;
        if incomplete_output.load(Ordering::Relaxed) {
            return invalid("External tool output was truncated or unreadable. Validation cannot establish success from incomplete diagnostics; build stopped.");
        }
        if !errors.is_empty() {
            return invalid(format!("Tag extraction was incomplete ({} errors), even though the tool returned exit code 0. Build stopped before compilation.\n{}\nProvide the source runtime's original resources or editing-kit tags. Stock MCC remastered assets are not recoverable from a map header alone.",errors.len(),errors.iter().take(4).cloned().collect::<Vec<_>>().join("\n")));
        }
        Ok(output.trim().into())
    }
}
pub fn validate_existing_mcc(
    project: &Project,
    inspection: &MapInspection,
    tools: &Toolchain,
    jobs_root: &Path,
    job_id: &str,
    cancel: Arc<AtomicBool>,
    on_event: impl Fn(JobEvent) + Send + Sync,
) -> Result<BuildRecord> {
    uuid::Uuid::parse_str(job_id).map_err(|_| SparkError::Invalid("Invalid job UUID".into()))?;
    if inspection.header.version != 13
        || inspection.header.extended
        || inspection.header.build.contains("synthetic parser fixture")
    {
        return invalid("This operation requires an existing unextended MCC cache, not a legacy map or test fixture");
    }
    if !project.tag_duplicates.is_empty() || !project.tag_edits.is_empty() || project.scene != inspection.objects
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
    if maps::hash_file(&source.preserved_path)? != source.sha256 {
        return invalid("Preserved source checksum changed");
    }
    let info=tool_path(tools,"invader-info").ok_or_else(||SparkError::Invalid("Configure invader-info in Settings to verify the source cache CRC and protection status".into()))?;
    let dir = jobs_root.join(job_id);
    crate::reject_links(&dir)?;
    fs::create_dir_all(&dir)?;
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
            return invalid(format!("Existing MCC cache failed {check}: {result}"));
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
    let record=BuildRecord{id:job_id.into(),timestamp:chrono::Utc::now().to_rfc3339(),status:"validated".into(),target:"mcc-existing".into(),output:Some(output),sha256:Some(source.sha256.clone()),message:"Existing MCC cache copied unchanged; tag/index, protection, stub and CRC checks passed. No conversion was performed. Target-game load remains pending.".into(),project_fingerprint:project.fingerprint()?};
    project::atomic_write(
        &dir.join("receipt.json"),
        &serde_json::to_vec_pretty(&record)?,
        false,
    )?;
    runner.emit("validated", &record.message, 100, "success");
    Ok(record)
}
use std::io::Read;
pub fn run_build(
    project: &Project,
    inspection: &MapInspection,
    tools: &Toolchain,
    jobs_root: &Path,
    job_id: &str,
    cancel: Arc<AtomicBool>,
    on_event: impl Fn(JobEvent) + Send + Sync,
) -> Result<BuildRecord> {
    uuid::Uuid::parse_str(job_id)
        .map_err(|_| SparkError::Invalid("Job ID is not a UUID".into()))?;
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
    crate::reject_links(&dir)?;
    fs::create_dir_all(&dir)?;
    let input_dir = dir.join("input");
    let tag_dir = dir.join("tags");
    let output_dir = dir.join("output");
    for p in [&input_dir, &tag_dir, &output_dir] {
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
    let result = (|| -> Result<PathBuf> {
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
        crate::native_asset_imports::verify_compiled(project,&validated)?;
        if !project.native_asset_imports.is_empty(){let _=crate::native_asset_imports::available_files(jobs_root.parent().unwrap(),project)?;}
        crate::tag_duplicates::verify_compiled(project,inspection,&validated)?;
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
                crate::bsp_scenery::verify_compiled(inspection,&validated,&output,&scenery,&format!("gsbsp_{}_1",&runner.id[..8]))?;
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
        Ok(output)
    })();
    let record = match result {
        Ok(output) => BuildRecord {
            id: job_id.into(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            status: "validated".into(),
            target: "mcc-cea".into(),
            sha256: Some(maps::hash_file(&output)?),
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
    Ok(record)
}

fn core_check_reused_tag(file:&Path,relative:&str)->Result<()>{crate::reject_links(file)?;if !file.is_file(){return invalid(format!("The selected editable tagset does not contain {relative}. MCC BSP assembly requires matching editable images and sounds; no replacement was substituted"));}Ok(())}

#[cfg(test)]
mod tests {
    use super::*;
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
