//! Native MCC compilation of extracted classic tags. Never writes to a game or SDK master.
use crate::{
    build::{Runner, Toolchain},
    invalid,
    maps::{self, MapInspection},
    project::{self, Project},
    safe_relative, Result, SparkError,
};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};
pub const YOYORAST_V1_SHA256: &str =
    "e47286d17a1872878b6cf015cc66e77b35b5ae86d296a9a12b38977a5ce8d62c";
pub const BIGASS_V2104_SHA256: &str =
    "82d661a58e66f703fe55bcd4c631935ab0abec5e60f16034900c9ed88be7f79c";
pub fn is_yoyorast_v1(hash: &str) -> bool {
    hash == YOYORAST_V1_SHA256
}
pub fn use_mcc_multiplayer_ui(hash:&str,version:u32,scenario_type:u16,profile:Option<&str>)->Result<bool>{
    let explicit=profile==Some("mcc-multiplayer-ui");
    if explicit&&(version!=609||scenario_type!=1){return invalid("The MCC multiplayer UI profile only supports Custom Edition multiplayer caches");}
    Ok(explicit||is_yoyorast_v1(hash)||hash==BIGASS_V2104_SHA256)
}
pub fn native_tool(tools: &Toolchain) -> Option<PathBuf> {
    tools
        .h1a_directory
        .as_ref()
        .map(|p| p.join(if cfg!(windows) { "tool.exe" } else { "tool" }))
        .filter(|p| p.is_file())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TagChange {
    tag: String,
    field: String,
    before: String,
    after: String,
    before_sha256: String,
    after_sha256: String,
}

fn shader_changes() -> [(&'static str, &'static str, &'static str); 4] {
    [
        (
            "item collections/powerups/powerups.gbxmodel",
            "shaders[1].shader",
            "characters\\jackal\\shaders\\jackal shield",
        ),
        (
            "item collections/powerups/powerups.gbxmodel",
            "shaders[3].shader",
            "powerups\\over shield\\shaders\\over shield",
        ),
        (
            "powerups/active camoflage/active camoflage.gbxmodel",
            "shaders[1].shader",
            "powerups\\active camoflage\\shaders\\active camoflage",
        ),
        (
            "powerups/over shield/over shield.gbxmodel",
            "shaders[0].shader",
            "powerups\\over shield\\shaders\\over shield",
        ),
    ]
}
pub(crate) fn compile_native(
    project: &Project,
    inspection: &MapInspection,
    tools: &Toolchain,
    runner: &Runner,
    workspace: &Path,
    tags: &Path,
    output: &Path,
) -> Result<()> {
    let tool =
        native_tool(tools).ok_or_else(|| SparkError::Invalid("MCC H1A Tool missing".into()))?;
    crate::reject_links(&tool)?;
    let base = tools
        .base_tags_directory
        .as_ref()
        .ok_or_else(|| SparkError::Invalid("MCC SDK tags missing".into()))?;
    let mut changes = vec![];
    if is_yoyorast_v1(&inspection.sha256) {
        let edit = crate::build::tool_path(tools, "invader-edit")
            .ok_or_else(|| SparkError::Invalid("Invader edit missing".into()))?;
        for (tag, field, stem) in shader_changes() {
            let file = tags.join(safe_relative(tag)?);
            let original = format!("{stem}.shader_transparent_chicago_extended");
            let replacement = format!("{stem}.shader_transparent_generic");
            let sdk = base.join(safe_relative(&replacement)?);
            crate::reject_links(&sdk)?;
            if !sdk.is_file() {
                return invalid(format!(
                    "MCC native shader dependency missing: {replacement}"
                ));
            }
            let observed = runner.run(
                &edit,
                &[
                    "-t".into(),
                    tags.to_string_lossy().into_owned(),
                    "-G".into(),
                    field.into(),
                    tag.into(),
                ],
                workspace,
                "compatibility",
                42,
            )?;
            if !observed.trim().eq_ignore_ascii_case(&original) {
                return invalid(format!("The tested Yoyorast shader binding changed: {tag} {field}. No automatic replacement was made"));
            }
            let before = maps::hash_file(&file)?;
            runner.run(
                &edit,
                &[
                    "-t".into(),
                    tags.to_string_lossy().into_owned(),
                    "-S".into(),
                    field.into(),
                    replacement.clone(),
                    tag.into(),
                ],
                workspace,
                "compatibility",
                44,
            )?;
            let readback = runner.run(
                &edit,
                &[
                    "-t".into(),
                    tags.to_string_lossy().into_owned(),
                    "-G".into(),
                    field.into(),
                    tag.into(),
                ],
                workspace,
                "compatibility",
                45,
            )?;
            if !readback.trim().eq_ignore_ascii_case(&replacement) {
                return invalid("MCC shader binding readback failed");
            }
            changes.push(TagChange {
                tag: tag.into(),
                field: field.into(),
                before: original,
                after: replacement,
                before_sha256: before,
                after_sha256: maps::hash_file(&file)?,
            });
        }
    }
    if use_mcc_multiplayer_ui(&inspection.sha256,inspection.header.version,inspection.header.scenario_type,project.conversion_profile.as_deref())? {
        let tag = "ui/ui_tags_loaded_multiplayer_scenario_type.tag_collection";
        let source = base.join(safe_relative(tag)?);
        let target = tags.join(safe_relative(tag)?);
        crate::reject_links(&source)?;
        let before = maps::hash_file(&target)?;
        let after = maps::hash_file(&source)?;
        fs::copy(&source, &target)?;
        if maps::hash_file(&target)? != after || maps::hash_file(&source)? != after {
            return invalid("SDK UI tag changed while adapting the derived tagset");
        }
        changes.push(TagChange {
            tag: tag.into(),
            field: "MCC multiplayer UI dependency root".into(),
            before: "CE UI root".into(),
            after: "MCC SDK UI root".into(),
            before_sha256: before,
            after_sha256: after,
        });
    }
    let profile = if project.conversion_profile.as_deref() == Some("zombie-recovery") {
        "zombie-recovery"
    } else if project.conversion_profile.as_deref()==Some("mcc-multiplayer-ui") {
        "mcc-multiplayer-ui"
    } else if is_yoyorast_v1(&inspection.sha256) {
        "yoyorast-v1-mcc"
    } else if inspection.sha256 == BIGASS_V2104_SHA256 {
        "bigass-v2104-mcc"
    } else {
        "mcc-native"
    };
    project::atomic_write(
        &workspace.join("conversion-manifest.json"),
        &serde_json::to_vec_pretty(&serde_json::json!({
            "schemaVersion":1,"profile":profile,"sourceSha256":inspection.sha256,"sourcePreserved":true,"runtimeLoad":"pending",
            "compilerSha256":maps::hash_file(&tool)?,"changes":changes,
            "omittedAudio":if profile=="zombie-recovery"{vec!["sound/dialog/multiplayer1/scorpion","sound/dialog/multiplayer1/hill_occupied"]}else{vec![]},
            "spawnerMechanism":"Source object-class trigger references are retained; native MCC Tool performs target compilation"
        }))?,
        false,
    )?;
    fs::create_dir_all(workspace.join("data"))?;
    fs::create_dir_all(workspace.join("maps"))?;
    crate::tag_duplicates::prepare(project,inspection,tools,workspace,tags,runner)?;
    if project.scene.iter().any(|o|o.source_model.is_some()){let edit=crate::build::tool_path(tools,"invader-edit").ok_or_else(||SparkError::Invalid("Native asset placement needs invader-edit".into()))?;crate::native_asset_imports::append_scenario(project,inspection,tags,&edit,workspace,runner)?;}
    crate::bsp_compile::prepare_native(project,inspection,tools,runner,workspace,tags)?;
    crate::animations::prepare_native(project, inspection, tools, workspace, runner)?;
    if !project.powerups.is_empty(){crate::powerups::prepare(project,&inspection.scenario_path,workspace,tags,&crate::build::tool_path(tools,"invader-edit").ok_or_else(||SparkError::Invalid("Custom power-ups require invader-edit".into()))?,runner)?;}
    if project
        .studio
        .as_ref()
        .and_then(|s| s.engine_machinima.as_ref())
        .is_some_and(|o| o.enabled)
    {
        let edit = crate::build::tool_path(tools, "invader-edit")
            .ok_or_else(|| SparkError::Invalid("Invader edit missing".into()))?;
        crate::engine_machinima::prepare(
            project,
            &inspection.scenario_path,
            workspace,
            &edit,
            runner,
            inspection.scripts.len(),
        )?;
    }
    runner.emit("native-preservation","Snapshotting native tag bytes before target compilation",58,"info");
    let inventory_started=std::time::Instant::now();
    let input_tags=crate::working_tags::tree_hashes(tags,runner.cancel)?;
    let input_json=serde_json::to_vec_pretty(&input_tags)?;
    project::atomic_write(&workspace.join("native-tag-input-hashes.json"),&input_json,false)?;
    let inventory_before_ms=inventory_started.elapsed().as_millis();
    let log = runner.run(
        &tool,
        &[
            "-data_dir".into(),
            "data".into(),
            "-tags_dir".into(),
            "tags".into(),
            "-game_root_dir".into(),
            ".".into(),
            "build-cache-file".into(),
            inspection.scenario_path.clone(),
            "classic".into(),
            "none".into(),
        ],
        workspace,
        "compile",
        60,
    )?;
    if !native_compile_succeeded(&log) {
        return invalid(native_compile_failure(&log));
    }
    let inventory_started=std::time::Instant::now();
    let final_tags=crate::working_tags::tree_hashes(tags,runner.cancel)?;
    if input_tags!=final_tags{return invalid("Native compiler changed, added or removed editable input tags. Output was withheld; review the isolated workspace and original tag sources before continuing");}
    project::atomic_write(&workspace.join("native-tag-preservation.json"),&serde_json::to_vec_pretty(&serde_json::json!({
        "schemaVersion":1,"status":"passed","nativeFiles":input_tags.len(),"allInputTagBytesUnchanged":true,
        "inputManifestSha256":maps::hash_file(&workspace.join("native-tag-input-hashes.json"))?,
        "inventoryBeforeMs":inventory_before_ms,"inventoryAfterMs":inventory_started.elapsed().as_millis(),
        "scope":"Exact loose native tag bytes during target compilation only. Extraction, intentional compatibility edits and compiled cache repacking are separate operations; game loading remains pending."
    }))?,false)?;
    let name = crate::mcc::package_map_name(&inspection.scenario_path)?;
    let compiled = workspace.join("maps").join(&name);
    crate::reject_links(&compiled)?;
    let sha = maps::hash_file(&compiled)?;
    let target = output.join(&name);
    fs::copy(&compiled, &target)?;
    if maps::hash_file(&target)? != sha {
        return invalid("MCC cache changed while copying the output");
    }
    Ok(())
}
/// Diagnose actual missing files without treating Tool's zero exit as success.
pub fn native_compile_failure(log:&str)->String {
    let mut missing=std::collections::BTreeSet::new();
    for line in log.lines().take(4096){
        let lower=line.to_ascii_lowercase();
        if !lower.contains("0x00000002")&&!lower.contains("0x00000003"){continue;}
        let prefix="file_open('tags\\";
        let Some(start)=lower.find(prefix).map(|at|at+prefix.len()) else{continue};
        let Some(end)=line[start..].find("')").map(|at|at+start)else{continue};
        let tag=line[start..end].replace('\\',"/");
        if tag.len()>512||tag.is_empty()||tag.chars().any(|c|c.is_control()||":*?<>|\"".contains(c))||tag.split('/').any(|part|part.is_empty()||part=="."||part==".."){continue;}
        missing.insert(tag.to_ascii_lowercase());
    }
    if missing.is_empty(){return "MCC Tool did not confirm successful cache compilation. Its zero exit code alone is not success; inspect the conversion log".into();}
    let list=missing.iter().take(8).cloned().collect::<Vec<_>>().join("; ");
    let remaining=if missing.len()>8{format!(" (+{} more)",missing.len()-8)}else{String::new()};
    format!("MCC conversion needs {} missing source tag(s): {list}{remaining}. Locate the original map's matching classic resource files or editable tags and rebuild. Installed MCC texture packs are not a substitute for missing classic tag data. No playable output was accepted.",missing.len())
}
pub fn native_compile_succeeded(log: &str) -> bool {
    let s = log.to_ascii_lowercase();
    s.contains("successfully built cache file.")
        && !s.contains("### failed")
        && !s.contains("exception halt")
}
/// Inspect the installed SDK's archive listing before extracting tag data.
/// Executables/data outside tags/ are never selected for extraction.
pub fn sdk_tag_inventory(listing: &str) -> Result<(usize, u64)> {
    if listing.len() > 32 * 1024 * 1024 {
        return invalid("SDK archive inventory is too large");
    }
    let body = listing
        .split_once("----------")
        .ok_or_else(|| SparkError::Invalid("SDK archive file inventory missing".into()))?
        .1;
    let mut count = 0usize;
    let mut total = 0u64;
    for block in body.replace("\r\n", "\n").split("\n\n") {
        let Some(path) = block.lines().find_map(|l| l.strip_prefix("Path = ")) else {
            continue;
        };
        let normalized = path.replace('\\', "/");
        if normalized != "tags" && !normalized.starts_with("tags/") {
            continue;
        }
        safe_relative(&normalized)?;
        if block.contains("Symbolic Link =")
            || block.contains("Hard Link =")
            || block.contains("Encrypted = +")
        {
            return invalid("Linked or encrypted SDK tag entry refused");
        }
        let directory = block
            .lines()
            .find_map(|l| l.strip_prefix("Attributes = "))
            .is_some_and(|a| a.contains('D'));
        if directory {
            continue;
        }
        let size = block
            .lines()
            .find_map(|l| l.strip_prefix("Size = "))
            .and_then(|s| s.parse::<u64>().ok())
            .ok_or_else(|| SparkError::Invalid("SDK tag size missing".into()))?;
        total = total
            .checked_add(size)
            .ok_or_else(|| SparkError::Invalid("SDK tag byte count overflow".into()))?;
        count += 1;
        if count > 200000 || size > 2 * 1024 * 1024 * 1024 || total > 16 * 1024 * 1024 * 1024 {
            return invalid("SDK tags exceed the verified staging budget");
        }
    }
    if count == 0 {
        return invalid("The SDK archive contains no editable tags");
    }
    Ok((count, total))
}
pub fn prepare_sdk_tags(
    kit: &Path,
    cache: &Path,
    project_id: &str,
    job_id: &str,
    event: impl Fn(crate::build::JobEvent) + Send + Sync,
) -> Result<PathBuf> {
    uuid::Uuid::parse_str(job_id)
        .map_err(|_| SparkError::Invalid("Invalid SDK preparation job".into()))?;
    crate::reject_links(kit)?;
    crate::reject_links(cache)?;
    let archive = kit.join("HCEEK.7z");
    let extractor = kit.join("bin/x64/7zr.exe");
    crate::reject_links(&archive)?;
    crate::reject_links(&extractor)?;
    if cache.exists() {
        return invalid("SDK preparation needs a fresh owned cache folder");
    }
    fs::create_dir_all(cache)?;
    let before = maps::hash_file(&archive)?;
    let cancel = std::sync::atomic::AtomicBool::new(false);
    let runner = Runner {
        id: job_id,
        project: project_id,
        cancel: &cancel,
        event: &event,
    };
    let listing = runner.run(
        &extractor,
        &[
            "l".into(),
            "-slt".into(),
            archive.to_string_lossy().into_owned(),
        ],
        cache,
        "sdk-inventory",
        5,
    )?;
    let (files, bytes) = sdk_tag_inventory(&listing)?;
    runner.emit(
        "sdk-extract",
        format!(
            "Preparing {files} legal SDK tags ({:.0} MiB) locally",
            bytes as f64 / (1024. * 1024.)
        ),
        15,
        "info",
    );
    let log = runner.run(
        &extractor,
        &[
            "x".into(),
            archive.to_string_lossy().into_owned(),
            "tags\\*".into(),
            "-r".into(),
            "-y".into(),
            format!("-o{}", cache.display()),
        ],
        cache,
        "sdk-extract",
        20,
    )?;
    if !log.contains("Everything is Ok") || maps::hash_file(&archive)? != before {
        return invalid("SDK archive extraction or source identity verification failed");
    }
    let tags = cache.join("tags");
    if !tags.join("globals/globals.globals").is_file() {
        return invalid("Extracted SDK tags are incomplete");
    }
    let mut stack = vec![tags.clone()];
    let mut actual_files = 0;
    let mut actual_bytes = 0u64;
    while let Some(dir) = stack.pop() {
        for e in fs::read_dir(dir)? {
            let path = e?.path();
            crate::reject_links(&path)?;
            let m = fs::metadata(&path)?;
            if m.is_dir() {
                stack.push(path);
            } else if m.is_file() {
                actual_files += 1;
                actual_bytes += m.len();
            } else {
                return invalid("Non-file SDK tag entry");
            }
            if actual_files > files || actual_bytes > bytes {
                return invalid("SDK extraction differs from its verified inventory");
            }
        }
    }
    if actual_files != files || actual_bytes != bytes {
        return invalid("SDK extracted file count or length differs from its inventory");
    }
    project::atomic_write(
        &cache.join("sdk-provenance.json"),
        &serde_json::to_vec_pretty(
            &serde_json::json!({"sourceSha256":before,"files":files,"bytes":bytes,"extractorSha256":maps::hash_file(&extractor)?}),
        )?,
        false,
    )?;
    runner.emit(
        "sdk-ready",
        "MCC SDK tags prepared. Your Halo choice and tool folders are saved.",
        100,
        "success",
    );
    Ok(tags)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_tool_zero_exit_is_never_enough() {
        assert!(!native_compile_succeeded("### FAILED TO LOAD SCENARIO."));
        assert!(!native_compile_succeeded("writing tags..."));
        assert!(native_compile_succeeded(
            "warning: old shader\nsuccessfully built cache file."
        ));
        assert!(!native_compile_succeeded(
            "successfully built cache file.\nEXCEPTION halt"
        ));
    }
    #[test]
    fn missing_native_tags_report_exact_dependencies_and_matching_resource_guidance() {
        let log="file_open('tags\\scenery\\test\\dust.bitmap') error 0x00000002\nfile_open('tags\\SCENERY\\TEST\\DUST.BITMAP') error 0x00000002\nfile_open('tags\\powerups\\active camoflage\\camoflage.bitmap') error 0x00000003\n### FAILED TO LOAD SCENARIO.";
        let message=native_compile_failure(log);
        assert!(message.contains("2 missing source tag(s)"));
        assert!(message.contains("scenery/test/dust.bitmap"));
        assert!(message.contains("powerups/active camoflage/camoflage.bitmap"));
        assert!(message.contains("matching classic resource files"));
        assert!(message.contains("No playable output was accepted"));
        assert!(!native_compile_succeeded(log));
    }
    #[test]
    fn dependency_diagnostics_do_not_echo_absolute_or_traversing_paths() {
        let log="file_open('tags\\..\\private.bitmap') error 0x00000002\nfile_open('tags\\C:\\Users\\private.bitmap') error 0x00000002\n### FAILED TO LOAD SCENARIO.";
        let message=native_compile_failure(log);
        assert!(!message.contains("private.bitmap"));assert!(message.contains("zero exit code"));
    }
    #[test]
    fn compatibility_bindings_are_scoped_to_the_exact_published_yoyorast_source() {
        assert!(is_yoyorast_v1(YOYORAST_V1_SHA256));
        assert!(!is_yoyorast_v1(crate::legacy::ZOMBIE_DEMO_SHA256));
        assert!(shader_changes()
            .iter()
            .all(|(tag, field, _)| safe_relative(tag).is_ok() && field.starts_with("shaders[")));
    }
    #[test]
    fn an_unknown_ce_map_requires_an_explicit_multiplayer_ui_choice(){
        assert!(!use_mcc_multiplayer_ui(&"a".repeat(64),609,1,None).unwrap());
        assert!(use_mcc_multiplayer_ui(&"a".repeat(64),609,1,Some("mcc-multiplayer-ui")).unwrap());
        assert!(use_mcc_multiplayer_ui(&"a".repeat(64),609,0,Some("mcc-multiplayer-ui")).is_err());
        assert!(use_mcc_multiplayer_ui(&"a".repeat(64),13,1,Some("mcc-multiplayer-ui")).is_err());
        assert!(use_mcc_multiplayer_ui(YOYORAST_V1_SHA256,609,1,None).unwrap());
    }
    #[test]
    fn sdk_inventory_checks_tag_paths_sizes_and_links() {
        let good="----------\nPath = tags\\globals\\globals.globals\nSize = 32\nAttributes = A\n\nPath = data\\x\nSize = 100\nAttributes = A\n";
        assert_eq!(sdk_tag_inventory(good).unwrap(), (1, 32));
        assert!(
            sdk_tag_inventory(&good.replace("globals\\globals.globals", "..\\outside")).is_err()
        );
        assert!(sdk_tag_inventory(&good.replace("Size = 32", "Size = 999999999999")).is_err());
        assert!(sdk_tag_inventory(&good.replace("Attributes = A", "Symbolic Link = x")).is_err());
    }
}
