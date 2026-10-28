//! Duplicate editable tags in an isolated compiler job, never cache pointers.
use crate::{
    build::{self, Runner, Toolchain},
    invalid,
    maps::{self, MapInspection, Tag},
    project::{self, Project},
    reject_links, safe_relative, Result, SparkError,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, path::Path};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TagDuplicate {
    pub id: String,
    pub source_tag_id: u32,
    pub owner_tag_id: u32,
    /// A tag path without an extension; the source determines its class.
    pub path: String,
}
fn normalized(path: &str) -> String {
    path.replace('\\', "/").to_ascii_lowercase()
}
pub fn validate(plans: &[TagDuplicate]) -> Result<()> {
    if plans.len() > 128 {
        return invalid("At most 128 tag duplicates may be queued per build");
    }
    let (mut ids, mut paths, mut bindings) = (HashSet::new(), HashSet::new(), HashSet::new());
    for p in plans {
        uuid::Uuid::parse_str(&p.id)
            .map_err(|_| SparkError::Invalid("Invalid duplicate tag identity".into()))?;
        safe_relative(&p.path)?;
        if p.path.len() > 240
            || p.path.ends_with(['/', '\\'])
            || p.path
                .bytes()
                .any(|c| !c.is_ascii() || c.is_ascii_control() || b"*?[]".contains(&c))
            || p.source_tag_id == p.owner_tag_id
            || plans
                .iter()
                .any(|other| other.owner_tag_id == p.source_tag_id)
            || !ids.insert(&p.id)
            || !paths.insert(normalized(&p.path))
            || !bindings.insert((p.owner_tag_id, p.source_tag_id))
        {
            return invalid("Duplicate tags need unique paths and owner/source bindings; self-references are not a duplication target");
        }
    }
    Ok(())
}
fn find(inspection: &MapInspection, id: u32) -> Result<&Tag> {
    inspection.tags.iter().find(|t| t.id == id).ok_or_else(|| {
        SparkError::Invalid("Duplicate tag source or owner is no longer indexed".into())
    })
}
fn file(tag: &Tag) -> Result<String> {
    let extension = crate::tag_exchange::extension(&tag.class)?;
    safe_relative(&format!("{}.{extension}", tag.path))?;
    Ok(format!("{}.{extension}", tag.path))
}
pub fn validate_source(project: &Project, inspection: &MapInspection) -> Result<()> {
    validate(&project.tag_duplicates)?;
    if inspection.tags.len() + project.tag_duplicates.len() > maps::MAX_TAGS {
        return invalid("Tag duplication would exceed the cache's supported tag limit");
    }
    for p in &project.tag_duplicates {
        let source = find(inspection, p.source_tag_id)?;
        let owner = find(inspection, p.owner_tag_id)?;
        for tag in [source, owner] {
            if inspection
                .tags
                .iter()
                .filter(|t| t.class == tag.class && normalized(&t.path) == normalized(&tag.path))
                .count()
                != 1
            {
                return invalid("Source/owner tag path is ambiguous in this cache; use a matching editable tagset instead of duplicating ambiguous entries");
            }
        }
        if matches!(source.class.as_str(), "scnr" | "sbsp" | "matg") {
            return invalid("Scenario, BSP and globals roots require their dedicated rebuild workflow; they cannot be copied as ordinary dependencies");
        }
        file(source)?;
        file(owner)?;
        if inspection
            .tags
            .iter()
            .any(|t| t.class == source.class && normalized(&t.path) == normalized(&p.path))
        {
            return invalid("A tag of this class already uses the duplicate's path");
        }
    }
    Ok(())
}
fn run(
    exe: &Path,
    args: Vec<String>,
    tags: &Path,
    workspace: &Path,
    runner: &Runner,
) -> Result<String> {
    let mut args = [vec!["-t".into(), tags.to_string_lossy().into_owned()], args].concat();
    #[cfg(windows)]
    for arg in &mut args {
        *arg = arg.replace('/', "\\");
    }
    runner.run(exe, &args, workspace, "tag-duplication", 48)
}
fn dependencies(
    exe: &Path,
    tag: &str,
    tags: &Path,
    workspace: &Path,
    runner: &Runner,
) -> Result<HashSet<String>> {
    Ok(run(exe, vec![tag.into()], tags, workspace, runner)?
        .lines()
        .map(|s| normalized(s.trim()))
        .collect())
}
fn check_file(tags: &Path, relative: &str) -> Result<std::path::PathBuf> {
    let path = tags.join(safe_relative(relative)?);
    reject_links(&path)?;
    if !path.is_file() || !(64..=64 * 1024 * 1024).contains(&fs::metadata(&path)?.len()) {
        return invalid(format!(
            "Editable tag is missing, truncated or exceeds 64 MiB: {relative}"
        ));
    }
    Ok(path)
}
/// All operations take place after extraction into the job's own writable tag tree.
pub(crate) fn prepare(
    project: &Project,
    inspection: &MapInspection,
    tools: &Toolchain,
    workspace: &Path,
    tags: &Path,
    runner: &Runner,
) -> Result<()> {
    if project.tag_duplicates.is_empty() {
        return Ok(());
    }
    validate_source(project, inspection)?;
    let refactor = build::tool_path(tools, "invader-refactor")
        .ok_or_else(|| SparkError::Invalid("Tag duplication requires invader-refactor".into()))?;
    let dependency = build::tool_path(tools, "invader-dependency")
        .ok_or_else(|| SparkError::Invalid("Tag duplication requires invader-dependency".into()))?;
    let mut prepared = vec![];
    // Resolve all requests before creating a file or changing a dependency.
    for p in &project.tag_duplicates {
        let source = find(inspection, p.source_tag_id)?;
        let owner = find(inspection, p.owner_tag_id)?;
        let original = file(source)?;
        let owner = file(owner)?;
        let target = format!(
            "{}.{}",
            p.path,
            crate::tag_exchange::extension(&source.class)?
        );
        let from = check_file(tags, &original)?;
        let _ = check_file(tags, &owner)?;
        let to = tags.join(safe_relative(&target)?);
        reject_links(&to)?;
        if to.exists() {
            return invalid(format!("Duplicate destination already exists: {target}"));
        }
        if !dependencies(&dependency, &owner, tags, workspace, runner)?
            .contains(&normalized(&original))
        {
            return invalid(format!("{owner} has no direct dependency on {original}; choose a tag that actually references the source"));
        }
        prepared.push((p, original, owner, target, from, to));
    }
    let mut receipts = vec![];
    for (p, original, owner, target, from, to) in prepared {
        let original_hash = maps::hash_file(&from)?;
        fs::create_dir_all(to.parent().unwrap())?;
        // create_new prevents a concurrent request from overwriting an existing tag.
        let mut input = fs::File::open(&from)?;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&to)?;
        std::io::copy(&mut input, &mut output)?;
        output.sync_all()?;
        drop(output);
        if maps::hash_file(&to)? != original_hash {
            return invalid("Duplicate tag copy failed checksum verification");
        }
        let before = maps::hash_file(&check_file(tags, &owner)?)?;
        run(
            &refactor,
            vec![
                "-M".into(),
                "no-move".into(),
                "-s".into(),
                owner.clone(),
                "-T".into(),
                original.clone(),
                target.clone(),
            ],
            tags,
            workspace,
            runner,
        )?;
        let refs = dependencies(&dependency, &owner, tags, workspace, runner)?;
        if !refs.contains(&normalized(&target))
            || refs.contains(&normalized(&original))
            || maps::hash_file(&from)? != original_hash
        {
            return invalid("Tag duplicate dependency readback failed or its original was changed");
        }
        receipts.push(serde_json::json!({"id":p.id,"original":original,"duplicate":target,"owner":owner,
            "originalSha256":original_hash,"ownerBeforeSha256":before,"ownerAfterSha256":maps::hash_file(&check_file(tags,&owner)?)?,
            "dependencies":"shared; only the selected owner is redirected"}));
    }
    project::atomic_write(
        &workspace.join("tag-duplicates.json"),
        &serde_json::to_vec_pretty(&receipts)?,
        false,
    )?;
    Ok(())
}
pub(crate) fn verify_compiled(
    project: &Project,
    source: &MapInspection,
    compiled: &MapInspection,
) -> Result<()> {
    for p in &project.tag_duplicates {
        let original = find(source, p.source_tag_id)?;
        let owner = find(source, p.owner_tag_id)?;
        let duplicate = compiled
            .tags
            .iter()
            .find(|t| t.class == original.class && normalized(&t.path) == normalized(&p.path))
            .ok_or_else(|| {
                SparkError::Invalid(format!(
                    "Compiler did not include duplicate {}; build not accepted",
                    p.path
                ))
            })?;
        let compiled_owner = compiled
            .tags
            .iter()
            .find(|t| t.class == owner.class && normalized(&t.path) == normalized(&owner.path))
            .ok_or_else(|| {
                SparkError::Invalid("Duplicate tag's owner was dropped by the compiler".into())
            })?;
        if !compiled_owner.references.is_empty()
            && !compiled_owner
                .references
                .iter()
                .any(|r| r.target_id == duplicate.id)
        {
            return invalid("Compiled owner does not reference its duplicate");
        }
        if duplicate.data_offset.is_some()
            && compiled.tags.iter().any(|t| {
                t.class == original.class
                    && normalized(&t.path) == normalized(&original.path)
                    && t.data_offset == duplicate.data_offset
            })
        {
            return invalid("Compiler aliased original and duplicate root data; independent editing is not safe");
        }
    }
    if compiled.header.scenario_type != source.header.scenario_type {
        return invalid(
            "Compiler changed campaign/UI/multiplayer scenario type; output not accepted",
        );
    }
    Ok(())
}

#[cfg(test)]
mod owned_sdk_tests {
    use super::*;
    use std::sync::{atomic::AtomicBool, Arc};
    #[test]
    #[ignore = "Requires the owner's installed MCC maps, SDK tags and Invader; writes an isolated local job"]
    fn owned_campaign_tag_duplicate_and_ui_cache_compile() {
        let env = |name: &str| {
            std::path::PathBuf::from(
                std::env::var(name).unwrap_or_else(|_| panic!("Set {name} to owned local input")),
            )
        };
        let (source_tags, kit, invader, campaign_path, ui_path) = (
            env("SPARK_MAP_TAGS"),
            env("SPARK_MAP_KIT"),
            env("SPARK_MAP_INVADER"),
            env("SPARK_CAMPAIGN_MAP"),
            env("SPARK_UI_MAP"),
        );
        let campaign = maps::inspect_map(&campaign_path, campaign_path.parent()).unwrap();
        let ui = maps::inspect_map(&ui_path, ui_path.parent()).unwrap();
        assert_eq!(campaign.header.scenario_type, 0);
        assert_eq!(ui.header.scenario_type, 2);
        let source = campaign
            .tags
            .iter()
            .find(|t| t.class == "mod2" && normalized(&t.path) == "weapons/pistol/pistol")
            .unwrap();
        let owner = campaign
            .tags
            .iter()
            .find(|t| t.class == "weap" && normalized(&t.path) == "weapons/pistol/pistol")
            .unwrap();
        let mut project = Project::new("Owned campaign tag duplication acceptance");
        project.tag_duplicates.push(TagDuplicate {
            id: uuid::Uuid::new_v4().to_string(),
            source_tag_id: source.id,
            owner_tag_id: owner.id,
            path: "spark/acceptance/pistol_campaign_model".into(),
        });
        let id = uuid::Uuid::new_v4().to_string();
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.local/continuation33/native-gameplay");
        fs::create_dir_all(&root).unwrap();
        let workspace = root.join(format!("map-tag-native-{id}"));
        fs::create_dir(&workspace).unwrap();
        let tags = workspace.join("tags");
        let cancel = Arc::new(AtomicBool::new(false));
        let inventory =
            crate::forge_build::stage_tags(&source_tags, &tags, &cancel, |_, _, _, _| {}).unwrap();
        let tools = Toolchain {
            h1a_directory: Some(kit.clone()),
            base_tags_directory: Some(source_tags.clone()),
            invader_directory: Some(invader),
            ..Default::default()
        };
        let events = std::sync::Mutex::new(Vec::new());
        let event = |e: build::JobEvent| {
            events.lock().unwrap().push(e);
        };
        let runner = Runner {
            id: &id,
            project: &project.id,
            cancel: &cancel,
            event: &event,
        };
        let output = workspace.join("output");
        fs::create_dir(&output).unwrap();
        // Match the product rebuild: keep SDK resource tags, but recover the
        // campaign's actual local tags and scripts. SDK-only campaign scripts
        // can differ from the installed retail revision and must not substitute.
        let extract = build::tool_path(&tools, "invader-extract").unwrap();
        let mut args = vec![
            "-t".into(),
            tags.to_string_lossy().into_owned(),
            "-m".into(),
            campaign_path
                .parent()
                .unwrap()
                .to_string_lossy()
                .into_owned(),
            "-O".into(),
            "-e".into(),
            "*.bitmap".into(),
            "-e".into(),
            "*.sound".into(),
            "-G".into(),
            campaign_path.to_string_lossy().into_owned(),
        ];
        #[cfg(windows)]
        for arg in &mut args {
            *arg = arg.replace('/', "\\");
        }
        runner
            .run(&extract, &args, &workspace, "extract-campaign", 25)
            .unwrap();
        crate::conversion::compile_native(
            &project, &campaign, &tools, &runner, &workspace, &tags, &output,
        )
        .unwrap();
        let name = crate::mcc::package_map_name(&campaign.scenario_path).unwrap();
        let campaign_output = output.join(&name);
        let compiled = maps::inspect_map(&campaign_output, None).unwrap();
        verify_compiled(&project, &campaign, &compiled).unwrap();
        assert!(
            campaign
                .scripts
                .iter()
                .all(|s| compiled.scripts.iter().any(|t| t.name == s.name)),
            "Campaign script names changed"
        );
        let tool = crate::conversion::native_tool(&tools).unwrap();
        let ui_log = runner
            .run(
                &tool,
                &[
                    "-data_dir".into(),
                    "data".into(),
                    "-tags_dir".into(),
                    "tags".into(),
                    "-game_root_dir".into(),
                    ".".into(),
                    "build-cache-file".into(),
                    ui.scenario_path.replace('/', "\\"),
                    "classic".into(),
                    "none".into(),
                ],
                &workspace,
                "compile-ui",
                90,
            )
            .unwrap();
        assert!(crate::conversion::native_compile_succeeded(&ui_log));
        let ui_output = workspace
            .join("maps")
            .join(crate::mcc::package_map_name(&ui.scenario_path).unwrap());
        let compiled_ui = maps::inspect_map(&ui_output, None).unwrap();
        assert_eq!(compiled_ui.header.scenario_type, 2);
        let info = build::tool_path(&tools, "invader-info").unwrap();
        for path in [&campaign_output, &ui_output] {
            for kind in ["is_protected", "stub_count", "crc32_mismatched"] {
                let observed = runner
                    .run(
                        &info,
                        &[
                            "-T".into(),
                            kind.into(),
                            path.to_string_lossy().into_owned(),
                        ],
                        &workspace,
                        "verify",
                        95,
                    )
                    .unwrap();
                assert!(
                    ["0", "false"].contains(&observed.trim()),
                    "{kind}: {observed}"
                );
            }
        }
        for relative in [file(source).unwrap(), file(owner).unwrap()] {
            assert_eq!(
                maps::hash_file(&source_tags.join(safe_relative(&relative).unwrap())).unwrap(),
                inventory
                    .get(&relative.replace('\\', "/"))
                    .cloned()
                    .unwrap()
            );
        }
        assert_eq!(maps::hash_file(&campaign_path).unwrap(), campaign.sha256);
        assert_eq!(maps::hash_file(&ui_path).unwrap(), ui.sha256);
        let receipt = serde_json::json!({"campaignSourceSha256":campaign.sha256,"uiSourceSha256":ui.sha256,
            "campaignOutputSha256":compiled.sha256,"uiOutputSha256":compiled_ui.sha256,
            "campaignType":compiled.header.scenario_type,"uiType":compiled_ui.header.scenario_type,
            "campaignScriptsPreserved":true,"tagDuplicateVerified":true,"sourceAndSdkPreserved":true,
            "campaignTags":compiled.tags.len(),"uiTags":compiled_ui.tags.len(),"engineLoadPending":true});
        project::atomic_write(
            &workspace.join("native-map-tag-acceptance.json"),
            &serde_json::to_vec_pretty(&receipt).unwrap(),
            false,
        )
        .unwrap();
        project::atomic_write(
            &workspace.join("native-map-tag-events.json"),
            &serde_json::to_vec_pretty(&events.into_inner().unwrap()).unwrap(),
            false,
        )
        .unwrap();
        println!("Native campaign duplicate and UI caches compiled; receipts in {}. Game loading remains pending.",workspace.display());
    }
}
