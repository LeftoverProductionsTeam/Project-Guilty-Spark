//! Plans bind one saved project/source revision. Execution re-resolves capabilities
//! and publishes only an owned verified copy; source compilation stays in its
//! existing pipeline and is never mislabeled as a direct cache edit.
use super::core::smart_edit::{self as router, Analysis, Choice, Intent, Preference, Route};
use super::*;
use sha2::{Digest, Sha256};
use std::{process::Command, sync::OnceLock};
const CRC_SHA: &str = "b15603c344c590760a81816866d3834dbb117504a2c935e39c380d3c9ab391e9";
const INFO_SHA: &str = "e53229f0d65c0ec0df5ce70f77ab690776fc9e2eb720ba0c221dd4470f8deef4";
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Plan {
    id: String,
    project_id: String,
    project_fingerprint: String,
    source_sha256: Option<String>,
    native_source_identity:Option<String>,
    runtime_id: runtime::RuntimeId,
    cache_version: Option<u32>,
    intents: Vec<Intent>,
    choices: Vec<Choice>,
    selected_route: Option<Route>,
    recovery: String,
    notes: Vec<String>,
    expires_at_unix: u64,
}
struct LiveWork {
    document: quickforge::QuickForgeDocument,
    bindings: Vec<LiveBinding>,
    expected_session: String,
    identity: core::live_adapter::MapIdentity,
}
/// A completed direct output belongs to its frozen saved revision, even after
/// the current map acquires new dependencies/edits. This grants only opening an
/// independently verified copy, never readiness for the newer current draft.
pub(super) fn output_snapshot(state:&AppState,current:&Project,build_id:&str)->Reply<Project> {
    uuid::Uuid::parse_str(build_id).map_err(error)?;
    let record=current.builds.iter().find(|b|b.id==build_id&&b.target=="mcc-direct"&&b.status=="validated").ok_or("No validated direct output belongs to this map")?.clone();
    let job=state.root.join("jobs").join(build_id);core::reject_links(&job).map_err(error)?;
    let mut snapshot:Project=serde_json::from_slice(&bounded_read(&job.join("project.gsproject"),32*1024*1024)?).map_err(error)?;
    snapshot.validate().map_err(error)?;
    let proof:serde_json::Value=serde_json::from_slice(&bounded_read(&job.join("smart-edit-receipt.json"),4*1024*1024)?).map_err(error)?;
    let source=snapshot.source.as_ref().ok_or("Direct output snapshot has no source")?;
    if snapshot.id!=current.id || current.source.as_ref().map(|s|s.sha256.as_str())!=Some(source.sha256.as_str())
        || snapshot.fingerprint().map_err(error)?!=record.project_fingerprint
        || proof["route"]!="directCache" || proof["projectId"]!=current.id
        || proof["projectFingerprint"]!=record.project_fingerprint || proof["sourceSha256"]!=source.sha256
        || proof["outputSha256"].as_str()!=record.sha256.as_deref() || proof["allOtherBytesPreserved"]!=true || proof["compilerRan"]!=false {
        return Err("Direct output snapshot/receipt no longer matches its source, revision or output.".into());
    }
    snapshot.builds.push(record);let _=verified_build(state,&snapshot,build_id)?;
    Ok(snapshot)
}
struct Pending {
    owner: String,
    created: Instant,
    preference: Preference,
    view: Plan,
    live: Option<LiveWork>,
}
fn plans() -> &'static Mutex<HashMap<String, Pending>> {
    static PLANS: OnceLock<Mutex<HashMap<String, Pending>>> = OnceLock::new();
    PLANS.get_or_init(|| Mutex::new(HashMap::new()))
}
fn validator(state: &AppState, p: &Project, name: &str, sha: &str) -> Reply<PathBuf> {
    if !cfg!(windows){return Err("Direct cache publication currently requires the reviewed Windows Invader utilities; this host platform has no verified direct writer.".into());}
    let tools = editing_tools(state, p)?;
    let dir=tools.invader_directory.ok_or("Select the reviewed Invader 0.55.0 folder in Dependencies & setup. Direct copies need its CRC/info utilities, not an editing-kit project.")?;
    let file = dir.join(name);
    core::reject_links(&file).map_err(error)?;
    if !file.is_file() || maps::hash_file(&file).map_err(error)? != sha {
        return Err(format!("{name} does not match the reviewed Invader 0.55.0 binary. Configure the tested tools before enabling direct writes."));
    }
    fs::canonicalize(file).map_err(error)
}
fn has_scene_changes(p: &Project, i: &MapInspection) -> bool {
    p.scene.len() != i.objects.len()
        || p.scene.iter().zip(&i.objects).any(|(a, b)| {
            a.position != b.position
                || a.rotation != b.rotation
                || a.scale != b.scale
                || a.tag_id != b.tag_id
                || a.asset_id != b.asset_id
                || a.source_model != b.source_model
        })
}
fn forge_ready(state: &AppState, p: &Project) -> Reply<()> {
    let doc = p.quick_forge.as_ref().ok_or("No generated map source")?;
    let tools = forge_build::tools_for_target(p, forge_tools(state)?).map_err(error)?;
    verify_compiler_location(state, &tools)?;
    match doc.runtime_id {
        runtime::RuntimeId::MccSteam if tools.hek_flavor.as_deref()==Some("h1aEk")=>{},
        runtime::RuntimeId::HaloCustomEdition if tools.hek_flavor.as_deref()==Some("legacyHek") ||
            (tools.hek_flavor.as_deref()==Some("h1aEk")&&p.active_build_target.as_ref().is_some_and(|id|p.build_targets.iter().any(|t|&t.id==id&&t.ce_compatible_tagset)))=>{},
        _=>return Err("The selected runtime has no verified generated-map compiler with these tools. Configure MCC H1A or a reviewed CE authoring target.".into()),
    }
    if !tools
        .hek_directory
        .as_ref()
        .is_some_and(|d| d.join("tool.exe").is_file())
    {
        return Err(
            "Select the matching installed Halo Tool in Settings → Dependencies & setup.".into(),
        );
    }
    let tags = tools
        .hek_tags_directory
        .clone()
        .or_else(|| tools.hek_directory.as_ref().map(|d| d.join("tags")))
        .ok_or("Select the legal editable base tags")?;
    if !tags.join("globals/globals.globals").is_file() {
        return Err("The selected native base tags have no globals/globals.globals.".into());
    }
    let invader = Toolchain {
        invader_directory: tools.invader_directory.clone(),
        ..Default::default()
    };
    for name in ["invader-edit", "invader-info", "invader-build"] {
        if name == "invader-build" && doc.runtime_id == runtime::RuntimeId::MccSteam {
            continue;
        }
        if build::tool_path(&invader, name).is_none() {
            return Err(format!(
                "Install/configure {name} before building this runtime."
            ));
        }
    }
    if p.firefight.is_some() {
        return Err("Firefight wave rules have no verified game-side bridge and cannot be advertised as a playable build.".into());
    }
    if p.scene
        .iter()
        .any(|s| s.asset_id.is_some() || s.source_model.is_some())
    {
        return Err("Custom/imported preview meshes require a verified native asset importer before publication; they are not silently omitted.".into());
    }
    let report = core::quickforge::validate(doc).map_err(error)?;
    if !report.valid {
        return Err(report
            .issues
            .iter()
            .filter(|i| i.severity == "error")
            .map(|i| i.message.as_str())
            .collect::<Vec<_>>()
            .join(" "));
    }
    let (dependencies, mut blockers) = core::quickforge::source_requirements(doc).map_err(error)?;
    blockers.extend(forge_provenance_blockers(state, p));
    for dependency in dependencies {
        let file = forge_build::dependency_path(&tags, &dependency.tag_path, &dependency.tag_class)
            .map_err(error)?;
        core::reject_links(&file).map_err(error)?;
        if !file.is_file() {
            blockers.push(format!(
                "Missing native dependency {} ({})",
                dependency.tag_path, dependency.tag_class
            ));
        }
    }
    if !blockers.is_empty() {
        return Err(blockers.join(" "));
    }
    Ok(())
}
fn plan(
    state: &AppState,
    project_id: &str,
    runtime_id: runtime::RuntimeId,
    preference: Preference,
) -> Reply<(Plan, Analysis)> {
    let p = lock(&state.library)?.get(project_id).map_err(error)?;
    let inspection = if p.source.is_some() {
        Some(inspect(state, &p)?)
    } else {
        None
    };
    let mut analysis = if let Some(i) = &inspection {
        router::analyze(&p, i).map_err(error)?
    } else {
        Analysis::default()
    };
    let runtime_matches = runtime_id == runtime::RuntimeId::MccSteam;
    let preservation = baboon_native::guard_regeneration(state, &p);
    let tools = editing_tools(state, &p)?;
    let mut choices = Vec::new();
    let direct_issue = if !runtime_matches {
        Some("This direct writer is reviewed for MCC Halo 1 only. Runtime/edition selection cannot bypass its cache-format gate.".into())
    } else if let Some(issue) = analysis.direct_blockers.first() {
        Some(issue.clone())
    } else if inspection.is_none() {
        Some("Open a compiled map to use direct cache editing.".into())
    } else if analysis.cells.is_empty() {
        Some("No reviewed native cells changed. Preview preferences alone do not produce a modified map.".into())
    } else if let Err(issue) = &preservation {
        Some(issue.clone())
    } else {
        validator(state, &p, "invader-crc.exe", CRC_SHA)
            .and_then(|_| validator(state, &p, "invader-info.exe", INFO_SHA))
            .err()
    };
    choices.push(Choice{route:Route::DirectCache,available:direct_issue.is_none(),reason:direct_issue.unwrap_or_else(||"Write only the listed native cells and format-specific CRC into a new map. No extraction, loose-tag preparation or compilation.".into()),tools:vec!["Invader CRC 0.55.0".into(),"Invader info 0.55.0".into()]});
    let mut native_issue=Some("This source route requires an imported MCC cache and the matching compiler/extractor. Other formats retain their explicit conversion workflows.".into());
    if runtime_matches
        && p.quick_forge.is_none()
        && inspection.as_ref().is_some_and(|i| i.header.version == 13)
    {
        if let Err(issue) = &preservation {
            native_issue = Some(issue.clone());
        } else {
            let report = build::compatibility(&p, inspection.as_ref().unwrap(), &tools);
            native_issue = if !report.ready {
                Some(report.blockers.join(" "))
            } else {
                // The existing extraction path has explicit placement/import limits.
                project::patched_cache(&p, inspection.as_ref().unwrap())
                    .map(|_| ())
                    .map_err(error)
                    .err()
            };
        }
    }
    choices.push(Choice{route:Route::NativeRebuild,available:native_issue.is_none()&&!analysis.intents.is_empty(),reason:native_issue.unwrap_or_else(||"Prepare isolated native tags using the existing extraction/dependency/compiler pipeline; preserve source and validate a separate output.".into()),tools:vec!["Matching H1A Tool".into(),"Invader extraction/info".into()]});
    let accepted = baboon_native::has_accepted_source(state, &p.id)?;
    let mut native_source_identity=None;
    let working = if runtime_matches
        && accepted
        && p.tag_edits.is_empty()
        && inspection
            .as_ref()
            .is_none_or(|i| !has_scene_changes(&p, i))
    {
        shared_editing::build_binding(state,&p).and_then(|binding|{
            if binding.is_some(){return Err("Native working tags are not shared by SparkLink. Use the owner's frozen QuickForge source build; native-tag collaboration needs its own verified phase.".into());}
            current_native_build(state, &p)
            .and_then(|b| runtime_workbench::compiled_tags(state, &p, &b))
                .and_then(|tags|{native_source_identity=Some(core::working_tags::source_identity(&tags,&AtomicBool::new(false)).map_err(error)?);Ok(())})
        })
    } else {
        Err("Working-tag publication consumes an accepted native revision. Pending cache/geometry edits must not be silently omitted.".into())
    };
    if working.is_ok() {
        analysis.intents.push(Intent::NativeSourceRevision);
    }
    choices.push(Choice{route:Route::WorkingTags,available:working.is_ok(),reason:working.err().unwrap_or_else(||"Compile the accepted complete native revision, including reconciled Baboon/Invader edits, using the existing source guards.".into()),tools:vec!["Matching H1A Tool".into()]});
    let forge = if let Some(doc) = &p.quick_forge {
        if !analysis
            .intents
            .iter()
            .any(|i| matches!(i, Intent::GeneratedGeometry))
        {
            analysis.intents.push(Intent::GeneratedGeometry);
        }
        if let Err(issue) = preservation {
            Err(issue)
        } else if doc.runtime_id != runtime_id {
            Err("Select the QuickForge document's actual output runtime; routing never converts it silently.".into())
        } else if let Err(issue) = shared_editing::build_binding(state, &p) {
            Err(issue)
        } else {
            forge_ready(state, &p)
        }
    } else {
        Err(
            "New geometry uses the existing QuickForge/BSP source workflow, not fixed cache cells."
                .into(),
        )
    };
    choices.push(Choice{route:Route::QuickForge,available:forge.is_ok(),reason:forge.err().unwrap_or_else(||"Build generated source through the existing native geometry/collision/BSP pipeline. Shared sessions retain owner-only frozen builds.".into()),tools:vec!["Matching native geometry/cache builder".into()]});
    choices.push(Choice{route:Route::LiveSession,available:false,reason:"Bind existing objects in QuickForge session → Live Halo adapter to plan temporary position edits against that exact running process. A map save never silently writes game memory.".into(),tools:vec!["Reviewed MCC mods-mode live adapter".into()]});
    let selected_route = router::choose(preference, &choices).ok();
    let view=Plan{id:uuid::Uuid::new_v4().to_string(),project_id:p.id.clone(),project_fingerprint:p.fingerprint().map_err(error)?,source_sha256:p.source.as_ref().map(|s|s.sha256.clone()),native_source_identity,runtime_id,cache_version:inspection.as_ref().map(|i|i.header.version),intents:analysis.intents.clone(),choices,selected_route,recovery:"Original map and prior outputs remain unchanged. The job retains its project snapshot, native cell diff, source identity, validator output and receipt; recovery reopens the original or a prior validated copy.".into(),notes:vec!["Only listed native changes are written. Imported-cache lighting, camera, sound mix, visibility and editor labels can be preview/project preferences; they are not silently claimed as game edits.".into(),"Reference replacement, new arrays/assets, BSP topology and live memory writes have different adapters. A readable field or manual preference grants no extra write permission.".into(),"Output validation and native compilation are distinct from game loading. This transaction does not broadcast native tag/assets to SparkLink or replicate changes to game peers.".into()],expires_at_unix:std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(error)?.as_secs()+300};
    Ok((view, analysis))
}
#[tauri::command]
pub(super) async fn smart_edit_plan(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    runtime_id: runtime::RuntimeId,
    preference: Preference,
) -> Reply<Plan> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        check_document_owner(&state, &project_id, &owner)?;
        let (view, _) = plan(&state, &project_id, runtime_id, preference)?;
        let mut registry = lock(plans())?;
        registry.retain(|_, p| p.created.elapsed() < Duration::from_secs(300));
        if registry.len() >= 32 {
            return Err("Close an older edit plan or wait for its five-minute expiry.".into());
        }
        registry.retain(|_, p| p.owner != owner || p.view.project_id != project_id);
        registry.insert(
            view.id.clone(),
            Pending {
                owner,
                created: Instant::now(),
                preference,
                view: view.clone(),
                live: None,
            },
        );
        Ok(view)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub(super) async fn smart_edit_live_plan(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    document: quickforge::QuickForgeDocument,
    bindings: Vec<LiveBinding>,
    expected_session: String,
) -> Reply<Plan> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;
        let p=lock(&state.library)?.get(&project_id).map_err(error)?;
        let(session,moves)=live_moves_for(&state,&project_id,&document,&bindings,&expected_session)?;
        let view=Plan{id:uuid::Uuid::new_v4().to_string(),project_id:project_id.clone(),project_fingerprint:p.fingerprint().map_err(error)?,source_sha256:p.source.as_ref().map(|s|s.sha256.clone()),native_source_identity:None,runtime_id:runtime::RuntimeId::MccSteam,cache_version:Some(13),
            intents:moves.iter().map(|m|Intent::MoveLiveObject{datum:m.datum,tag_datum:m.tag_datum,expected_position:m.expected_position,position:m.position}).collect(),
            choices:vec![Choice{route:Route::LiveSession,available:true,reason:format!("Existing-object position cells in the connected {} session (checksum {:08X}). Process, map, datum salt, class, original position, stationary/detached state and readback are checked by the same live adapter at execution.",session.identity.scenario,session.identity.checksum),tools:vec!["Reviewed MCC mods-mode adapter".into()]}],selected_route:Some(Route::LiveSession),
            recovery:"Before/after positions are retained in the local live-edit journal. Move bound objects back or reload the original map to restore positions; disconnect does not restore them. Save and publish the authoring map separately for persistence. Peer replication is unverified.".into(),
            notes:vec!["Explicit binding is required; no object guessing, arbitrary spawning, tag writes or BSP replacement.".into(),"This plan expires after ten seconds. Moving/recycled objects and changed/replaced sessions require a fresh plan.".into()],
            expires_at_unix:std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(error)?.as_secs()+10};
        let mut registry=lock(plans())?;registry.retain(|_,old|old.created.elapsed()<Duration::from_secs(300)&&(old.owner!=owner||old.view.project_id!=project_id));
        if registry.len()>=32{return Err("Too many pending edit plans; wait for expiry.".into());}
        registry.insert(view.id.clone(),Pending{owner,created:Instant::now(),preference:Preference::LiveSession,view:view.clone(),live:Some(LiveWork{document,bindings,expected_session,identity:session.identity.clone()})});
        Ok(view)
    }).await.map_err(error)?
}
fn run(exe: &Path, args: &[String]) -> Reply<String> {
    fn reader<R: Read + Send + 'static>(mut stream: R) -> std::thread::JoinHandle<(Vec<u8>, bool)> {
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let mut cut = false;
            let mut buffer = [0; 4096];
            while let Ok(n) = stream.read(&mut buffer) {
                if n == 0 {
                    break;
                }
                let room = (128 * 1024usize).saturating_sub(bytes.len());
                cut |= n > room;
                bytes.extend_from_slice(&buffer[..n.min(room)]);
            }
            (bytes, cut)
        })
    }
    let mut command = Command::new(exe);
    command
        .args(args)
        .current_dir(exe.parent().ok_or("Tool has no parent")?)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(error)?;
    let stdout = reader(child.stdout.take().ok_or("No tool stdout")?);
    let stderr = reader(child.stderr.take().ok_or("No tool stderr")?);
    let started = Instant::now();
    let status = loop {
        if let Some(s) = child.try_wait().map_err(error)? {
            break Some(s);
        }
        if started.elapsed() > Duration::from_secs(30) {
            let _ = child.kill();
            let _ = child.wait();
            break None;
        }
        std::thread::sleep(Duration::from_millis(15));
    };
    let (out, cut) = stdout.join().map_err(|_| "Tool reader failed")?;
    let (err, err_cut) = stderr.join().map_err(|_| "Tool reader failed")?;
    if status.is_none() || cut || err_cut {
        return Err(
            "Cache validator exceeded its time/output bound; candidate retained, never accepted."
                .into(),
        );
    }
    if !status.unwrap().success() {
        return Err(format!(
            "Native cache validator refused: {}",
            String::from_utf8_lossy(&err)
                .chars()
                .take(1000)
                .collect::<String>()
        ));
    }
    Ok(String::from_utf8_lossy(&out).into_owned())
}
fn check_info(info: &Path, map: &Path) -> Reply<Vec<(String, String)>> {
    let mut observations = Vec::new();
    for check in ["is_protected", "stub_count", "crc32_mismatched"] {
        let value = run(
            info,
            &[
                "-T".into(),
                check.into(),
                map.to_string_lossy().into_owned(),
            ],
        )?;
        if value.trim() != "0" && value.trim() != "false" {
            return Err(format!(
                "Native cache validation failed {check}: {}",
                value.trim()
            ));
        }
        observations.push((check.into(), value.trim().into()));
    }
    Ok(observations)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Execution {
    route: Route,
    job_id: String,
    status: String,
    record: Option<BuildRecord>,
    live_receipts: Vec<core::live_adapter::MoveReceipt>,
    warning: Option<String>,
}
fn live_journal(root: &Path, project_id: &str, value: &serde_json::Value) -> Reply<()> {
    use std::io::Write;
    static JOURNAL: Mutex<()> = Mutex::new(());
    let _guard = lock(&JOURNAL)?;
    uuid::Uuid::parse_str(project_id).map_err(error)?;
    let dir = root.join("live-edit-journal");
    core::reject_links(&dir).map_err(error)?;
    fs::create_dir_all(&dir).map_err(error)?;
    let file = dir.join(format!("{project_id}.jsonl"));
    core::reject_links(&file).map_err(error)?;
    let mut bytes = serde_json::to_vec(value).map_err(error)?;
    if bytes.len() > 128 * 1024
        || fs::metadata(&file).map(|m| m.len()).unwrap_or(0) > 32 * 1024 * 1024 - 256 * 1024
    {
        return Err("Live edit journal reached its size limit. Archive it before further live moves; no new memory write was started.".into());
    }
    bytes.push(b'\n');
    let mut out = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(file)
        .map_err(error)?;
    out.write_all(&bytes)
        .and_then(|_| out.sync_data())
        .map_err(error)
}
#[tauri::command]
pub(super) async fn smart_edit_execute(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    plan_id: String,
) -> Reply<Execution> {
    let owner = window.label().to_owned();
    let pending = {
        let mut registry = lock(plans())?;
        if registry.get(&plan_id).is_some_and(|p| p.owner != owner) {
            return Err("Edit plan belongs to another window.".into());
        }
        registry
            .remove(&plan_id)
            .ok_or("Edit plan expired or was already consumed; preview it again")?
    };
    if pending.owner != owner || pending.created.elapsed() >= Duration::from_secs(300) {
        return Err("Edit plan belongs to another window or expired.".into());
    }
    let state = app.state::<AppState>();
    check_document_owner(&state, &pending.view.project_id, &owner)?;
    if let Some(work) = pending.live {
        if pending.created.elapsed() >= Duration::from_secs(10) {
            return Err("Live edit plan expired. Refresh the bound object positions.".into());
        }
        let current = lock(&state.library)?
            .get(&pending.view.project_id)
            .map_err(error)?;
        if current.fingerprint().map_err(error)? != pending.view.project_fingerprint {
            return Err("Saved project changed after the live plan; no memory edit ran.".into());
        }
        let (session, _) = live_moves_for(
            &state,
            &current.id,
            &work.document,
            &work.bindings,
            &work.expected_session,
        )?;
        if session.identity != work.identity {
            return Err("Loaded map changed after the live preview.".into());
        }
        let root = state.root.clone();
        drop(state);
        let id = uuid::Uuid::new_v4().to_string();
        live_journal(
            &root,
            &current.id,
            &serde_json::json!({"id":id,"phase":"prepared","timestamp":chrono::Utc::now().to_rfc3339(),"projectFingerprint":pending.view.project_fingerprint,"mapIdentity":work.identity,"intents":pending.view.intents,"persistentMapEdited":false}),
        )?;
        let receipts = live_mcc_apply(
            app,
            current.id.clone(),
            work.document,
            work.bindings,
            work.expected_session,
        )
        .await?;
        let status = if receipts.iter().all(|r| r.applied) {
            "applied"
        } else {
            "unconfirmed"
        };
        let warning=live_journal(&root,&current.id,&serde_json::json!({"id":id,"phase":"observed","timestamp":chrono::Utc::now().to_rfc3339(),"schemaVersion":1,"route":"liveSession","projectId":current.id,"mapIdentity":work.identity,"status":status,"receipts":receipts,"persistentMapEdited":false,"gamePeerReplicationVerified":false})).err().map(|e|format!("Game memory was already observed, but its final journal write failed: {e}. Inspect the returned positions before retrying."));
        return Ok(Execution {
            route: Route::LiveSession,
            job_id: id,
            status: status.into(),
            record: None,
            live_receipts: receipts,
            warning,
        });
    }
    let (fresh, analysis) = plan(
        &state,
        &pending.view.project_id,
        pending.view.runtime_id,
        pending.preference,
    )?;
    if fresh.project_fingerprint != pending.view.project_fingerprint
        || fresh.source_sha256 != pending.view.source_sha256
        || fresh.native_source_identity != pending.view.native_source_identity
        || fresh.selected_route != pending.view.selected_route
    {
        return Err("Project, source or route capability changed after preview. No edit ran; preview the current revision again.".into());
    }
    let route = fresh
        .selected_route
        .ok_or("No verified execution route; review the plan's blockers")?;
    let id = fresh.project_id.clone();
    drop(state);
    match route {
        Route::NativeRebuild => {
            let job_id = begin_build(app, id)?;
            Ok(Execution {
                route,
                job_id,
                status: "building".into(),
                record: None,
                live_receipts: vec![],
                warning: None,
            })
        }
        Route::QuickForge => {
            let job_id = quickforge_build(app, id)?;
            Ok(Execution {
                route,
                job_id,
                status: "building".into(),
                record: None,
                live_receipts: vec![],
                warning: None,
            })
        }
        Route::WorkingTags => {
            let job_id = runtime_workbench::build_working_tags(app, window, id, None,fresh.native_source_identity).await?;
            Ok(Execution {
                route,
                job_id,
                status: "building".into(),
                record: None,
                live_receipts: vec![],
                warning: None,
            })
        }
        Route::DirectCache => {
            tauri::async_runtime::spawn_blocking(move || direct(&app, &owner, fresh, analysis))
                .await
                .map_err(error)?
        }
        Route::LiveSession => {
            Err("Live memory edits require an explicit bound-object live plan.".into())
        }
    }
}
fn direct(app: &tauri::AppHandle, owner: &str, plan: Plan, analysis: Analysis) -> Reply<Execution> {
    let _guard = native_operations_native::source_guard()?;
    let state = app.state::<AppState>();
    native_operations_native::require_idle(&state)?;
    check_document_owner(&state, &plan.project_id, owner)?;
    let p = lock(&state.library)?.get(&plan.project_id).map_err(error)?;
    if p.fingerprint().map_err(error)? != plan.project_fingerprint {
        return Err("Saved project changed before direct editing.".into());
    }
    baboon_native::guard_regeneration(&state, &p)?;
    let source = p.source.as_ref().ok_or("A source map is required")?;
    let crc = validator(&state, &p, "invader-crc.exe", CRC_SHA)?;
    let info = validator(&state, &p, "invader-info.exe", INFO_SHA)?;
    let bytes = router::read_direct_source(&p).map_err(error)?;
    let sha = source.sha256.clone();
    if Some(&sha) != plan.source_sha256.as_ref() {
        return Err("Cache identity no longer matches this direct-write plan.".into());
    }
    check_info(&info, &source.preserved_path)?;
    snapshot_project_state(&state, &p, "before-build")?;
    let id = uuid::Uuid::new_v4().to_string();
    let job = state.root.join("jobs").join(&id);
    core::reject_links(&job).map_err(error)?;
    fs::create_dir(&job).map_err(error)?;
    let candidate = job.join("candidate.map");
    let output_dir = job.join("output");
    fs::create_dir(&output_dir).map_err(error)?;
    let patched = router::apply(&bytes, &analysis.cells).map_err(error)?;
    project::atomic_write(&candidate, &patched, false).map_err(error)?;
    drop(patched);
    project::atomic_write(
        &job.join("project.gsproject"),
        &serde_json::to_vec_pretty(&p).map_err(error)?,
        false,
    )
    .map_err(error)?;
    let cancel = Arc::new(AtomicBool::new(false));
    lock(&state.jobs)?.insert(id.clone(), cancel.clone());
    event(
        app,
        JobEvent {
            job_id: id.clone(),
            project_id: p.id.clone(),
            phase: "verify".into(),
            severity: "info".into(),
            message: "Validating a direct native cache copy; no extraction or compiler runs."
                .into(),
            progress: 40,
            timestamp: chrono::Utc::now().to_rfc3339(),
        },
    );
    let result = (|| -> Reply<BuildRecord> {
        if cancel.load(Ordering::Acquire) {
            return Err("Direct save cancelled; candidate retained.".into());
        }
        // Only --fix-header on our owned candidate. CRC forging is not exposed.
        let crc_output = run(
            &crc,
            &[
                "--fix-header".into(),
                candidate.to_string_lossy().into_owned(),
            ],
        )?;
        let native_checks = check_info(&info, &candidate)?;
        let after = bounded_read(&candidate, maps::MAX_CACHE_BYTES)?;
        let changed = router::verify_footprint(&bytes, &after, &analysis.cells).map_err(error)?;
        let inspected =
            maps::inspect_map(&candidate, source.resource_directory.as_deref()).map_err(error)?;
        if inspected.sha256 != format!("{:x}", Sha256::digest(&after)) {
            return Err(
                "Candidate changed between byte-footprint verification and reopening.".into(),
            );
        }
        if inspected.header.version != 13 || inspected.tags.len() != inspect(&state, &p)?.tags.len()
        {
            return Err("Reopened cache edition/tag index differs unexpectedly.".into());
        }
        let desired = router::analyze(&p, &inspected).map_err(error)?;
        if !desired.cells.is_empty() {
            return Err("Reopened cache values do not match the semantic edit plan.".into());
        }
        if cancel.load(Ordering::Acquire) {
            return Err("Direct save cancelled; verified candidate retained.".into());
        }
        if maps::hash_file(&source.preserved_path).map_err(error)? != source.sha256
            || lock(&state.library)?
                .get(&p.id)
                .map_err(error)?
                .fingerprint()
                .map_err(error)?
                != plan.project_fingerprint
        {
            return Err(
                "Source/project changed during validation. Candidate retained without publishing."
                    .into(),
            );
        }
        let filename = core::mcc::package_map_name(&inspected.scenario_path).map_err(error)?;
        let relative = core::safe_relative(&filename).map_err(error)?;
        if relative.components().count() != 1 {
            return Err("Output map name must be a single native filename.".into());
        }
        let output = output_dir.join(relative);
        let record=BuildRecord{id:id.clone(),timestamp:chrono::Utc::now().to_rfc3339(),status:"validated".into(),target:"mcc-direct".into(),output:Some(output.clone()),sha256:Some(inspected.sha256.clone()),message:"Direct MCC cache copy validated: exact native cells, complete byte footprint, format-specific CRC and independent Invader checks. No extraction or source compilation ran. Ready for target-game testing; gameplay is unverified.".into(),project_fingerprint:plan.project_fingerprint.clone()};
        let evidence = serde_json::json!({"schemaVersion":1,"route":"directCache","projectId":p.id,"projectFingerprint":plan.project_fingerprint,"sourceSha256":sha,"outputSha256":inspected.sha256,"cacheVersion":13,"intents":plan.intents,"cells":analysis.cells,"changedNativeBytes":changed,"crcToolSha256":CRC_SHA,"infoToolSha256":INFO_SHA,"crcOutput":crc_output,"nativeChecks":native_checks,"allOtherBytesPreserved":true,"extractedTags":false,"compilerRan":false,"gameplayTested":false});
        project::atomic_write(
            &job.join("smart-edit-receipt.json"),
            &serde_json::to_vec_pretty(&evidence).map_err(error)?,
            false,
        )
        .map_err(error)?;
        if maps::hash_file(&candidate).map_err(error)? != inspected.sha256 {
            return Err("Candidate changed before publication.".into());
        }
        fs::rename(&candidate, &output).map_err(error)?;
        project::atomic_write(
            &job.join("receipt.json"),
            &serde_json::to_vec_pretty(&record).map_err(error)?,
            false,
        )
        .map_err(error)?;
        let lib = lock(&state.library)?;
        let mut current = lib.get(&p.id).map_err(error)?;
        if current.fingerprint().map_err(error)? != plan.project_fingerprint {
            return Err("Map revision changed at publication; output retained but not linked as a successful edit.".into());
        }
        current.builds.push(record.clone());
        lib.save(&current, None).map_err(error)?;
        Ok(record)
    })();
    lock(&state.jobs)?.remove(&id);
    match result {
        Ok(record) => {
            event(
                app,
                JobEvent {
                    job_id: id.clone(),
                    project_id: p.id,
                    phase: "validated".into(),
                    severity: "success".into(),
                    message: record.message.clone(),
                    progress: 100,
                    timestamp: chrono::Utc::now().to_rfc3339(),
                },
            );
            let _ = app.emit("spark:library-changed", ());
            Ok(Execution {
                route: Route::DirectCache,
                job_id: id,
                status: "validated".into(),
                record: Some(record),
                live_receipts: vec![],
                warning: None,
            })
        }
        Err(reason) => {
            let _=project::atomic_write(&job.join("failure.json"),&serde_json::to_vec_pretty(&serde_json::json!({"status":"rejected","reason":reason,"sourcePreserved":true})).map_err(error)?,false);
            event(
                app,
                JobEvent {
                    job_id: id,
                    project_id: p.id,
                    phase: "failed".into(),
                    severity: "error".into(),
                    message: reason.clone(),
                    progress: 100,
                    timestamp: chrono::Utc::now().to_rfc3339(),
                },
            );
            Err(reason)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn live_journal_records_attempts_before_observations_and_refuses_full_files() {
        let root = tempfile::tempdir().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        live_journal(
            root.path(),
            &id,
            &serde_json::json!({"phase":"prepared","before":[1,2,3]}),
        )
        .unwrap();
        live_journal(
            root.path(),
            &id,
            &serde_json::json!({"phase":"observed","after":[4,5,6]}),
        )
        .unwrap();
        let file = root
            .path()
            .join("live-edit-journal")
            .join(format!("{id}.jsonl"));
        let lines = fs::read_to_string(&file)
            .unwrap()
            .lines()
            .map(|line| serde_json::from_str::<serde_json::Value>(line).unwrap())
            .collect::<Vec<_>>();
        assert_eq!(lines[0]["phase"], "prepared");
        assert_eq!(lines[1]["phase"], "observed");
        fs::OpenOptions::new()
            .write(true)
            .open(&file)
            .unwrap()
            .set_len(32 * 1024 * 1024)
            .unwrap();
        assert!(live_journal(root.path(), &id, &serde_json::json!({"phase":"prepared"})).is_err());
        assert_eq!(fs::metadata(file).unwrap().len(), 32 * 1024 * 1024);
        assert!(live_journal(root.path(), "../outside", &serde_json::json!({})).is_err());
    }
}
