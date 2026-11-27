//! Isolated native compiler integration for a source-bound BSP assembly.
use crate::{
    bsp_assembly::{self, AssemblyGeometry},
    build::{self, Runner, Toolchain},
    invalid,
    maps::{self, MapInspection},
    project::{self, Project},
    reject_links, safe_relative, Result, SparkError,
};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
};
fn find_tool(tools: &Toolchain, name: &str) -> Result<PathBuf> {
    build::tool_path(tools, name)
        .ok_or_else(|| SparkError::Invalid(format!("{name} is required for BSP assembly")))
}
fn extension(class: &str) -> Result<&'static str> {
    match class {
        "senv" => Ok("shader_environment"),
        "soso" => Ok("shader_model"),
        "sotr" => Ok("shader_transparent_generic"),
        "schi" => Ok("shader_transparent_chicago"),
        "scex" => Ok("shader_transparent_chicago_extended"),
        "swat" => Ok("shader_transparent_water"),
        "sgla" => Ok("shader_transparent_glass"),
        "smet" => Ok("shader_transparent_meter"),
        "spla" => Ok("shader_transparent_plasma"),
        _ => invalid(format!("Unsupported BSP shader class {class}")),
    }
}
fn bsp_tag(path: &Path, map: &MapInspection, index: usize) -> Result<String> {
    maps::scenario_bsp_tag_paths(path, map)?.into_iter().nth(index)
        .ok_or_else(|| SparkError::Invalid("Selected scenario BSP slot is unavailable".into()))
}
struct NamespacedDependencies {
    hashes: BTreeMap<String, String>,
    model_reference_changes: Vec<serde_json::Value>,
}
fn dependency_paths(output: &str) -> Result<Vec<String>> {
    output.lines().map(str::trim).filter(|s|!s.is_empty()).map(|line|{
        if let Some(path)=line.strip_suffix(" [BROKEN]") {
            return invalid(format!("BSP source dependency is broken: {path}. Supply matching editable tags before rebuilding"));
        }
        safe_relative(line)?;Ok(line.replace('\\',"/"))
    }).collect()
}
#[cfg(test)]
#[test]
fn broken_dependencies_report_the_actual_tag_before_filesystem_staging() {
    let error = dependency_paths("scenery/rock.scenery\nscenery/rock.model [BROKEN]\n")
        .unwrap_err()
        .to_string();
    assert!(error.contains("scenery/rock.model"));
    assert!(error.contains("matching editable tags"));
}
// Prefer authored tags; recover only missing, explicitly selected donor roots
// into this build's private staging. Never write into an editing kit or game.
fn dependency_input(source:&Path,recovered:&Path,relative:&str)->Result<PathBuf>{
    let relative_path=safe_relative(relative)?;
    for root in [source,recovered] {let input=root.join(&relative_path);crate::reject_links(&input)?;if input.is_file(){return Ok(input);}}
    invalid(format!("Missing native BSP/scenery dependency {relative}. Select matching editable donor tags or recover this tag from the original source map; no original was changed"))
}
fn recover_missing_roots(source:&Path,recovered:&Path,bsp:&str,scenery:&[crate::bsp_scenery::Placement],recovery:Option<(&project::Source,&MapInspection)>,tools:&Toolchain,runner:&Runner,workspace:&Path)->Result<()>{
    let mut roots=vec![format!("{bsp}.scenario_structure_bsp")];roots.extend(scenery.iter().map(|p|format!("{}.scenery",p.tag_path)));roots.sort();roots.dedup();
    for root in &roots {safe_relative(root)?;}
    let missing:Vec<_>=roots.into_iter().filter(|p|!source.join(p.replace('\\',"/")).is_file()).collect();
    fs::create_dir(recovered)?;
    if missing.is_empty(){return Ok(());}
    let (cache,inspection)=recovery.ok_or_else(||SparkError::Invalid(format!("Missing native source tag {} in {}. Choose matching editable tags; no build was accepted",missing[0],source.display())))?;
    if ![6,7,609].contains(&cache.cache_version)||inspection.sha256!=cache.sha256{return invalid("Missing donor dependencies require matching editable tags; automatic source recovery is not verified for this cache format");}
    let resources=cache.resource_directory.as_deref().ok_or_else(||SparkError::Invalid("Connect the donor's original resource maps before recovering missing scenery".into()))?;
    crate::tag_exchange::verify_source_snapshot(cache,Some(resources))?;
    crate::native_resources::review(cache,inspection,resources)?;
    let extract=find_tool(tools,"invader-extract")?;
    let mut indexed = BTreeMap::<String, usize>::new();
    for tag in &inspection.tags {
        let ext = match tag.class.as_str() {
            "sbsp" => "scenario_structure_bsp",
            "scen" => "scenery",
            _ => continue,
        };
        let path = format!("{}.{ext}", tag.path.replace('\\', "/")).to_ascii_lowercase();
        *indexed.entry(path).or_default() += 1;
    }
    for root in &missing {
        let key = root.replace('\\', "/").to_ascii_lowercase();
        if indexed.get(&key) != Some(&1) {
            return invalid(format!("Requested missing donor tag is not indexed by the exact source map: {root}"));
        }
    }
    // Invader accepts repeated -s patterns and resolves their dependency closure
    // in one pass. Bound each invocation's argument length for Windows.
    for batch in missing.chunks(24) {
        let mut args = vec!["-m".into(), resources.to_string_lossy().into_owned(), "-r".into(),
            "-t".into(), recovered.to_string_lossy().into_owned()];
        for root in batch {
            let relative = safe_relative(root)?;
            if !recovered.join(relative).is_file() {
                args.extend(["-s".into(), root.clone()]);
            }
        }
        if args.len() == 5 { continue; }
        args.push(cache.preserved_path.to_string_lossy().into_owned());
        runner.run(&extract, &args, workspace, "extract", 38)?;
        crate::tag_exchange::inventory(recovered)?;
        for root in batch {
            dependency_input(source, recovered, root)?;
        }
    }
    crate::tag_exchange::verify_source_snapshot(cache,Some(resources))?;
    let(files,bytes)=crate::tag_exchange::inventory(recovered)?;
    project::atomic_write(&workspace.join("bsp-donor-recovery.json"),&serde_json::to_vec_pretty(&serde_json::json!({"sourceSha256":cache.sha256,"files":files,"bytes":bytes,"authoredTagsPreferred":true,"originalsChanged":false}))?,false)?;
    runner.emit("bsp-recovery",format!("Recovered only missing donor dependencies: {} files, {bytes} bytes; existing editable tags take precedence",files.len()),38,"info");
    Ok(())
}
fn native_reference_matches(observed: &str, expected: &str) -> bool {
    observed.trim().replace('\\', "/").eq_ignore_ascii_case(&expected.replace('\\', "/"))
}

fn namespace_materials(
    source: &Path,
    bsp: &str,
    source_index: usize,
    geometry: &AssemblyGeometry,
    scenery: &[crate::bsp_scenery::Placement],
    tools: &Toolchain,
    runner: &Runner,
    workspace: &Path,
    destination: &Path,
    recovery: Option<(&project::Source,&MapInspection)>,
    extra_roots: &[String],
    preserve_shader_paths: bool,
) -> Result<NamespacedDependencies> {
    if source.as_os_str().is_empty() || !source.is_dir() {
        return invalid(
            "Select the matching editable donor tags directory before compiling a BSP assembly",
        );
    }
    crate::reject_links(source)?;
    let source_arg=source.to_string_lossy().into_owned();
    let dependency = find_tool(tools, "invader-dependency")?;
    let reuse_base = source_index == 0 && source == destination && scenery.is_empty() && recovery.is_none();
    let working = workspace.join(format!("bsp-dependencies-{source_index}"));
    // Invader's recursive renamer does not handle Windows verbatim roots
    // consistently. Its cwd is the owned job, so keep these paths relative.
    let working_arg = format!("bsp-dependencies-{source_index}");
    fs::create_dir(&working)?;
    let recovered=workspace.join(format!("bsp-recovered-{source_index}"));
    recover_missing_roots(source,&recovered,bsp,scenery,recovery,tools,runner,workspace)?;
    let mut prepared = BTreeMap::new();
    let mut model_reference_changes = vec![];
    let mut prepared_bytes = 0u64;
    for row in scenery {
        let relative = format!("{}.scenery", row.tag_path.replace('\\', "/"));
        if prepared.contains_key(&relative) {
            continue;
        }
        let input = dependency_input(source,&recovered,&relative)?;
        crate::reject_links(&input)?;
        let size = fs::metadata(&input)?.len();
        prepared_bytes = prepared_bytes
            .checked_add(size)
            .ok_or_else(|| SparkError::Invalid("Scenery staging size overflow".into()))?;
        if size > 128 * 1024 * 1024 || prepared_bytes > 1024 * 1024 * 1024 {
            return invalid("Scenery dependency staging exceeds its file or total byte budget");
        }
        let source_hash = maps::hash_file(&input)?;
        let output = working.join(safe_relative(&relative)?);
        fs::create_dir_all(output.parent().unwrap()).map_err(|e| SparkError::Invalid(format!("Cannot prepare BSP destination directory {}: {e}",output.parent().unwrap().display())))?;
        fs::copy(&input, &output)?;
        let mut permissions = fs::metadata(&output)?.permissions();
        permissions.set_readonly(false);
        fs::set_permissions(&output, permissions)?;
        let edit = find_tool(tools, "invader-edit")?;
        let observed = runner.run(
            &edit,
            &[
                "-t".into(),
                working_arg.clone(),
                "-G".into(),
                "model".into(),
                relative.clone(),
            ],
            workspace,
            "bsp-scenery-model",
            39,
        )?;
        let reference = crate::bsp_scenery::model_reference(&row.model_path, &observed)?;
        let model = dependency_input(source,&recovered,&reference)?;
        crate::reject_links(&model)?;
        if !model.is_file() {
            return invalid(format!("Donor source GBX model is missing: {reference}"));
        }
        if !native_reference_matches(&observed, &reference) {
            runner.run(
                &edit,
                &[
                    "-t".into(),
                    working_arg.clone(),
                    "-S".into(),
                    "model".into(),
                    reference.clone(),
                    relative.clone(),
                ],
                workspace,
                "bsp-scenery-model",
                39,
            )?;
            let readback = runner.run(
                &edit,
                &[
                    "-t".into(),
                    working_arg.clone(),
                    "-G".into(),
                    "model".into(),
                    relative.clone(),
                ],
                workspace,
                "bsp-scenery-model-check",
                39,
            )?;
            if !native_reference_matches(&readback, &reference) {
                return invalid("Prepared scenery model reference readback failed");
            }
            model_reference_changes.push(serde_json::json!({"tag":relative,"beforeReference":observed.trim(),"afterReference":reference,"sourceSha256":source_hash,"preparedTagSha256":maps::hash_file(&output)?}));
        }
        if maps::hash_file(&input)? != source_hash {
            return invalid("Donor scenery source changed while preparing its model reference");
        }
        prepared.insert(relative, (source_hash, maps::hash_file(&output)?));
    }
    let mut required = BTreeSet::new();
    let mut roots = vec![format!("{bsp}.scenario_structure_bsp")];
    for m in geometry
        .materials
        .iter()
        .filter(|m| m.source == source_index)
    {
        if let (Some(path), Some(class)) = (&m.shader_path, &m.shader_class) {
            roots.push(format!("{path}.{}", extension(class)?));
        }
    }
    roots.extend(scenery.iter().map(|p| format!("{}.scenery", p.tag_path)));
    roots.extend(extra_roots.iter().cloned());
    roots.sort();
    roots.dedup();
    let bsp_root = format!("{bsp}.scenario_structure_bsp");
    // One recursive BSP inventory normally covers every source shader. Only the
    // user-selected tunnel material may need an additional recursive traversal.
    let output = runner.run(
        &dependency,
        &[
            "-t".into(),
            working_arg.clone(),
            "-t".into(),
            source_arg.clone(),
            "-t".into(),recovered.to_string_lossy().into_owned(),
            "-r".into(),
            bsp_root,
        ],
        workspace,
        "bsp-dependencies",
        40,
    )?;
    required.extend(dependency_paths(&output)?);
    for root in roots {
        let root = root.replace('\\', "/");
        if !required.contains(&root) {
            let output = runner.run(
                &dependency,
                &[
                    "-t".into(),
                    working_arg.clone(),
                    "-t".into(),
                    source_arg.clone(),
                    "-t".into(),recovered.to_string_lossy().into_owned(),
                    "-r".into(),
                    root.clone(),
                ],
                workspace,
                "bsp-dependencies",
                40,
            )?;
            required.extend(dependency_paths(&output)?);
            required.insert(root);
        }
    }
    if required.len() > 8192 {
        return invalid("BSP dependency closure exceeds 8192 files");
    }
    let mut hashes = BTreeMap::new();
    let mut bytes = 0u64;
    for relative in required {
        let input = dependency_input(source,&recovered,&relative)?;
        crate::reject_links(&input)?;
        let size = fs::metadata(&input)?.len();
        bytes = bytes
            .checked_add(size)
            .ok_or_else(|| SparkError::Invalid("BSP dependency size overflow".into()))?;
        if size > 128 * 1024 * 1024 || bytes > 1024 * 1024 * 1024 {
            return invalid("BSP material dependencies exceed 128 MiB per file or 1 GiB total");
        }
        let hash = maps::hash_file(&input)?;
        if reuse_base {
            hashes.insert(relative, hash);
            continue;
        }
        let output = working.join(safe_relative(&relative)?);
        fs::create_dir_all(output.parent().unwrap()).map_err(|e| SparkError::Invalid(format!("Cannot prepare BSP destination directory {}: {e}",output.parent().unwrap().display())))?;
        let expected = if let Some((source_hash, prepared_hash)) = prepared.get(&relative) {
            if *source_hash != hash {
                return invalid("Scenery source changed during dependency staging");
            }
            prepared_hash.clone()
        } else {
            fs::copy(&input, &output)?;
            hash.clone()
        };
        if maps::hash_file(&input)? != hash || maps::hash_file(&output)? != expected {
            return invalid("BSP dependency changed during staging");
        }
        let mut permissions = fs::metadata(&output)?.permissions();
        permissions.set_readonly(false);
        fs::set_permissions(&output, permissions)?;
        hashes.insert(relative, hash);
    }
    let namespace = format!("gsbsp_{}_{}", &runner.id[..8], source_index);
    if reuse_base {
        // The destination already owns the entire verified base tag tree.
        // Halo references those paths from the tag root, so only the shaders
        // named by the JMS need aliases. Renaming the rest at each extension
        // repeatedly lengthens the same inherited dependency paths.
        let alias_root = destination.join(&namespace);
        crate::reject_links(&alias_root)?;
        fs::create_dir(&alias_root)?;
        let aliases = alias_root.join("materials");
        fs::create_dir(&aliases)?;
        for material in geometry.materials.iter().filter(|m| m.source == source_index) {
            let (Some(path), Some(class)) = (&material.shader_path, &material.shader_class) else {
                continue;
            };
            let ext = extension(class)?;
            let relative = format!("{path}.{ext}").replace('\\', "/");
            let expected = hashes.get(&relative).ok_or_else(|| {
                SparkError::Invalid(format!("Base shader is missing from the verified dependency closure: {relative}"))
            })?;
            let original = source.join(safe_relative(&relative)?);
            let alias = aliases.join(safe_relative(&format!("{}.{ext}", material.name))?);
            crate::reject_links(&original)?;
            {
                let mut input = fs::File::open(&original)?;
                let mut output = fs::OpenOptions::new().create_new(true).write(true).open(&alias)?;
                std::io::copy(&mut input, &mut output)?;
            }
            if maps::hash_file(&original)? != *expected || maps::hash_file(&alias)? != *expected {
                return invalid("Base shader changed while preparing its native material alias");
            }
        }
        runner.emit("bsp-shaders", "Reused verified base dependency paths and staged only the native shader aliases", 44, "info");
        return Ok(NamespacedDependencies { hashes, model_reference_changes });
    }

    let refactor = find_tool(tools, "invader-refactor")?;
    if working.join(&namespace).exists() {
        return invalid("BSP dependency namespace collides with an input path");
    }
    let entries = fs::read_dir(&working).map_err(|e| SparkError::Invalid(format!("Cannot inspect BSP staging directory {}: {e}",working.display())))?.collect::<std::io::Result<Vec<_>>>()?;
    for entry in entries {
        let name = entry.file_name().to_string_lossy().into_owned();
        let mut args = vec!["-t".into(), working_arg.clone(), "-M".into(), "move".into()];
        if entry.file_type()?.is_dir() {
            args.extend(["-r".into(), name.clone(), format!("{namespace}\\{name}")]);
        } else {
            args.extend(["-T".into(), name.clone(), format!("{namespace}\\{name}")]);
        }
        runner.run(&refactor, &args, workspace, "bsp-namespace", 42)?;
    }
    for m in geometry
        .materials
        .iter()
        .filter(|m| m.source == source_index)
    {
        if let (Some(path), Some(class)) = (&m.shader_path, &m.shader_class) {
            let ext = extension(class)?;
            let original = format!("{namespace}\\{}.{}", path.replace('/', "\\"), ext);
            let alias = format!("{namespace}\\materials\\{}.{}", m.name, ext);
            let original_file = working.join(safe_relative(&original)?);
            if preserve_shader_paths && original_file.is_file() {
                // A structure check has no published scenario references to migrate. Keep
                // the namespaced dependency graph intact and give Tool a JMS shader alias.
                let alias_file = working.join(safe_relative(&alias)?);
                crate::reject_links(&original_file)?;
                crate::reject_links(&alias_file)?;
                if alias_file.exists() {
                    return invalid("BSP shader alias collides with an existing dependency");
                }
                fs::create_dir_all(alias_file.parent().unwrap())?;
                let expected = maps::hash_file(&original_file)?;
                fs::copy(&original_file, &alias_file)?;
                if maps::hash_file(&alias_file)? != expected {
                    return invalid("BSP shader alias differs from its namespaced source");
                }
            } else if !original_file.is_file() {
                // Repeated material flags can share a shader but need distinct JMS aliases.
                let previous = geometry
                    .materials
                    .iter()
                    .find(|other| {
                        other.source == source_index
                            && other.shader_path == m.shader_path
                            && working
                                .join(format!("{namespace}/materials/{}.{}", other.name, ext))
                                .is_file()
                    })
                    .ok_or_else(|| {
                        SparkError::Invalid("Namespaced BSP shader disappeared".into())
                    })?;
                let previous_file =
                    working.join(format!("{namespace}/materials/{}.{}", previous.name, ext));
                let alias_file = working.join(safe_relative(&alias)?);
                fs::copy(&previous_file, &alias_file).map_err(|e| SparkError::Invalid(format!(
                    "Cannot prepare repeated BSP shader alias {} from {}: {e}", alias_file.display(), previous_file.display()
                )))?;
            } else {
                runner.run(
                    &refactor,
                    &[
                        "-t".into(),
                        working_arg.clone(),
                        "-M".into(),
                        "move".into(),
                        "-T".into(),
                        original,
                        alias,
                    ],
                    workspace,
                    "bsp-shaders",
                    44,
                )?;
            }
        }
    }
    // Native rename tools can exit successfully after skipping long paths.
    // Check each input's expected destination before accepting the namespace.
    for relative in hashes.keys() {
        let material = geometry
            .materials
            .iter()
            .filter(|m| m.source == source_index)
            .find(|m| {
                if let (Some(path), Some(class)) = (&m.shader_path, &m.shader_class) {
                    extension(class).is_ok_and(|ext| {
                        format!("{path}.{ext}")
                            .replace('\\', "/")
                            .eq_ignore_ascii_case(relative)
                    })
                } else {
                    false
                }
            });
        let target = if let Some(m) = material {
            format!(
                "{namespace}/materials/{}.{}",
                m.name,
                extension(m.shader_class.as_ref().unwrap())?
            )
        } else {
            format!("{namespace}/{relative}")
        };
        if !working.join(safe_relative(&target)?).is_file() {
            return invalid(format!("BSP dependency did not reach its namespace: {relative}. The rename output is incomplete; no map was accepted"));
        }
    }
    let root = working.join(&namespace);
    let mut stack = vec![root.clone()];
    while let Some(folder) = stack.pop() {
        for e in fs::read_dir(&folder).map_err(|e| SparkError::Invalid(format!("Cannot read namespaced BSP directory {}: {e}",folder.display())))? {
            let e = e?;
            let path = e.path();
            crate::reject_links(&path)?;
            if e.file_type()?.is_dir() {
                stack.push(path);
                continue;
            }
            let relative = path
                .strip_prefix(&working)
                .map_err(|_| SparkError::Invalid("BSP namespace escaped working tree".into()))?;
            let output = destination.join(relative);
            crate::reject_links(&output)?;
            if output.exists() {
                return invalid("BSP dependency would overwrite a destination tag");
            }
            fs::create_dir_all(output.parent().unwrap()).map_err(|e| SparkError::Invalid(format!("Cannot prepare BSP destination directory {}: {e}",output.parent().unwrap().display())))?;
            let hash = maps::hash_file(&path).map_err(|e| SparkError::Invalid(format!("Cannot verify namespaced BSP dependency {}: {e}",path.display())))?;
            fs::copy(&path, &output).map_err(|e| SparkError::Invalid(format!("Cannot stage namespaced BSP dependency {} to {}: {e}",path.display(),output.display())))?;
            if maps::hash_file(&path)? != hash || maps::hash_file(&output)? != hash {
                return invalid("Namespaced dependency changed while copying into the native job");
            }
        }
    }
    Ok(NamespacedDependencies {
        hashes,
        model_reference_changes,
    })
}
fn append_scenery(
    rows: &[crate::bsp_scenery::Placement],
    base: &MapInspection,
    edit: &Path,
    runner: &Runner,
    workspace: &Path,
    tags: &Path,
) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let scenario = format!("{}.scenario", base.scenario_path);
    let counts = runner.run(
        edit,
        &[
            "-t".into(),
            tags.to_string_lossy().into_owned(),
            "-C".into(),
            "scenery".into(),
            "-C".into(),
            "scenery_palette".into(),
            scenario.clone(),
        ],
        workspace,
        "bsp-scenery-check",
        51,
    )?;
    let counts: Vec<usize> = counts
        .lines()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| {
            s.parse()
                .map_err(|_| SparkError::Invalid("Native scenery count was not an integer".into()))
        })
        .collect::<Result<_>>()?;
    let base_count = base.objects.iter().filter(|o| o.kind == "Scenery").count();
    if counts.len() != 2 || counts[0] != base_count || counts[0] + rows.len() > 4096 {
        return invalid("Destination scenery count differs from its preserved source or exceeds the import budget");
    }
    let namespace = format!("gsbsp_{}_1", &runner.id[..8]);
    let mut palette = BTreeMap::new();
    for row in rows {
        if palette.contains_key(&row.tag_path) {
            continue;
        }
        let index = counts[1] + palette.len();
        if index > 32766 {
            return invalid("Scenery palette exceeds the signed placement-index limit");
        }
        let reference = format!("{namespace}\\{}.scenery", row.tag_path.replace('/', "\\"));
        if !tags.join(safe_relative(&reference)?).is_file() {
            return invalid("Namespaced donor scenery dependency is missing");
        }
        runner.run(
            edit,
            &[
                "-t".into(),
                tags.to_string_lossy().into_owned(),
                "-I".into(),
                "scenery_palette".into(),
                "1".into(),
                "end".into(),
                "-S".into(),
                format!("scenery_palette[{index}].name"),
                reference,
                scenario.clone(),
            ],
            workspace,
            "bsp-scenery-palette",
            52,
        )?;
        palette.insert(row.tag_path.clone(), index);
    }
    let vector = |v: [f32; 3]| v.map(|n| format!("{n:.9}")).join(",");
    for (index, row) in rows.iter().enumerate() {
        let prefix = format!("scenery[{}]", base_count + index);
        let mut args = vec![
            "-t".into(),
            tags.to_string_lossy().into_owned(),
            "-I".into(),
            "scenery".into(),
            "1".into(),
            "end".into(),
        ];
        let mut set =
            |key: &str, value: String| args.extend(["-S".into(), format!("{prefix}.{key}"), value]);
        set("type", palette[&row.tag_path].to_string());
        set("name", "-1".into());
        set("position", vector(row.position));
        // Setters use native radians even though Invader prints degrees.
        set("rotation", vector(row.rotation));
        set("desired_permutation", row.permutation.to_string());
        for (bit, name) in ["automatically", "on_easy", "on_normal", "on_hard"]
            .iter()
            .enumerate()
        {
            set(
                &format!("not_placed.{name}"),
                ((row.not_placed >> bit) & 1).to_string(),
            );
        }
        args.push(scenario.clone());
        runner.run(edit, &args, workspace, "bsp-scenery", 52)?;
    }
    let count = runner.run(
        edit,
        &[
            "-t".into(),
            tags.to_string_lossy().into_owned(),
            "-C".into(),
            "scenery".into(),
            scenario,
        ],
        workspace,
        "bsp-scenery-readback",
        52,
    )?;
    if count.trim().parse::<usize>().ok() != Some(base_count + rows.len()) {
        return invalid("Native scenery count readback failed");
    }
    runner.emit("bsp-scenery",&format!("Retained {} donor scenery placements; compiled tag, transform and flag readback is required",rows.len()),52,"info");
    Ok(())
}
fn native_step(
    tool: &Path,
    runner: &Runner,
    workspace: &Path,
    args: &[String],
    phase: &str,
) -> Result<String> {
    let mut command = vec![
        "-data_dir".into(),
        "data".into(),
        "-tags_dir".into(),
        "tags".into(),
        "-game_root_dir".into(),
        ".".into(),
    ];
    command.extend_from_slice(args);
    let log = runner.run(tool, &command, workspace, phase, 48)?;
    let lower = log.to_ascii_lowercase();
    if lower.contains("### error")
        || lower.contains("exception halt")
        || lower.contains("exception_breakpoint")
        || lower.contains("couldn't create")
        || lower.contains("couldn't open")
        || lower.contains("failed to load")
        || lower.contains("radiosity error:")
        || lower
            .lines()
            .any(|line| line.trim_start().starts_with("failed "))
    {
        return invalid(format!(
            "Halo Tool rejected {phase}; inspect the isolated build log"
        ));
    }
    Ok(log)
}
fn restore_collision_flags(
    geometry: &AssemblyGeometry,
    edit: &Path,
    runner: &Runner,
    workspace: &Path,
    tags: &Path,
    bsp: &str,
) -> Result<usize> {
    let tag = format!("{bsp}.scenario_structure_bsp");
    let query = |field: &str| {
        runner.run(
            edit,
            &[
                "-t".into(),
                tags.to_string_lossy().into_owned(),
                "-G".into(),
                field.into(),
                tag.clone(),
            ],
            workspace,
            "bsp-index",
            53,
        )
    };
    let aliases: BTreeMap<_, _> = geometry
        .materials
        .iter()
        .filter(|m| m.collision_only)
        .map(|m| (m.name.as_str(), m.flags))
        .collect();
    let rows = query("collision_materials[*].shader")?;
    let expected: Vec<Option<u8>> = rows
        .lines()
        .map(|s| {
            let name = s
                .trim()
                .rsplit(['\\', '/'])
                .next()
                .unwrap_or("")
                .rsplit_once('.')
                .map(|v| v.0)
                .unwrap_or("");
            aliases.get(name).copied()
        })
        .collect();
    let rows = query("collision_bsp[0].surfaces[*].material")?;
    let mut values = vec![];
    for value in rows.lines() {
        let material = value.trim().parse::<usize>().map_err(|_| {
            SparkError::Invalid("Collision material index readback was malformed".into())
        })?;
        let flags = if material == 65535 {
            0
        } else {
            expected.get(material).copied().flatten().ok_or_else(|| {
                SparkError::Invalid("Compiled collision has an untracked material".into())
            })?
        };
        values.push((flags & 2) != 0);
    }
    if values.is_empty() || values.len() > 262144 {
        return invalid("Compiled collision surface count is unsupported");
    }
    let mut ranges = vec![];
    let mut start = 0;
    for n in 1..=values.len() {
        if n == values.len() || values[n] != values[start] {
            ranges.push((start, n - 1, values[start]));
            start = n;
        }
    }
    for batch in ranges.chunks(64) {
        let mut args = vec![
            "-t".into(),
            tags.to_string_lossy().into_owned(),
            "-n".into(),
        ];
        for (first, last, value) in batch {
            args.extend([
                "-S".into(),
                format!("collision_bsp[0].surfaces[{first}-{last}].flags.invisible"),
                if *value { "1" } else { "0" }.into(),
            ]);
        }
        args.push(tag.clone());
        runner.run(edit, &args, workspace, "bsp-flags", 54)?;
    }
    let readback = query("collision_bsp[0].surfaces[*].flags.invisible")?;
    let actual: Vec<_> = readback.lines().map(str::trim).collect();
    if actual.len() != values.len()
        || actual
            .iter()
            .zip(&values)
            .any(|(actual, expected)| *actual != if *expected { "1" } else { "0" })
    {
        return invalid(
            "Compiled collision surface flag readback differed; output was not accepted",
        );
    }
    Ok(values.len())
}
fn compile_structure(
    tool: &Path, runner: &Runner, workspace: &Path, tags: &Path,
    parent: &str, name: &str, geometry: &AssemblyGeometry,
) -> Result<(String, PathBuf, PathBuf)> {
    let source = workspace.join("data").join(safe_relative(&format!("{parent}/models/{name}.jms"))?);
    fs::create_dir_all(source.parent().unwrap())?;
    project::atomic_write(&source, bsp_assembly::export_jms(geometry)?.as_bytes(), false)?;
    native_step(tool, runner, workspace, &["structure".into(), parent.into(), name.into(), "true".into()], "bsp-structure")?;
    let bsp = format!("{parent}\\{name}");
    let compiled = tags.join(safe_relative(&format!("{bsp}.scenario_structure_bsp"))?);
    if !compiled.is_file() || fs::metadata(&compiled)?.len() < 648 {
        return invalid("Tool did not produce a complete structure BSP");
    }
    Ok((bsp, source, compiled))
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum PartitionStage {
    Structure,
    StructureCheck,
    Collision,
    Lighting,
}

// H1A's lighting tool reads classic scenario block bounds, even when the
// final MCC cache supports more skies and placements. Only the bake copy is trimmed.
fn with_native_bake_scenario<'a>(
    scenario_path: &str, edit: &Path, runner: &Runner, workspace: &Path, tags: &Path,
    bake_bsps: impl IntoIterator<Item = &'a str>, bake: impl FnOnce(&str) -> Result<()>,
) -> Result<()> {
    let sky_limit = crate::megaworld_build::STANDARD_SKY_SLOTS;
    let blocks = [
        ("skies", sky_limit),
        ("netgame_flags", maps::CLASSIC_NETGAME_FLAG_LIMIT),
        ("player_starting_locations", maps::PLAYER_START_LIMIT),
        ("netgame_equipment", maps::NETGAME_EQUIPMENT_LIMIT),
    ];
    let tags_arg = tags.to_string_lossy().into_owned();
    let query_counts = |tag: &str| -> Result<Vec<usize>> {
        let mut args = vec!["-t".into(), tags_arg.clone()];
        for (key, _) in blocks {
            args.extend(["-C".into(), key.into()]);
        }
        args.push(tag.into());
        let readback = runner.run(edit, &args, workspace, "bsp-bake-scenario", 64)?;
        let counts = readback.lines().map(|line| line.trim().parse::<usize>())
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|_| SparkError::Invalid("Unreadable native lighting scenario counts".into()))?;
        if counts.len() != blocks.len() {
            return invalid("Native lighting scenario counts are incomplete");
        }
        Ok(counts)
    };
    let scenario_tag = format!("{scenario_path}.scenario");
    let counts = query_counts(&scenario_tag)?;
    if counts[0] > sky_limit {
        for bsp in bake_bsps {
            let slots = runner.run(edit, &[
                "-t".into(), tags_arg.clone(), "-G".into(), "clusters[*].sky".into(),
                format!("{bsp}.scenario_structure_bsp"),
            ], workspace, "bsp-bake-scenario", 64)?;
            if slots.trim().is_empty() || !slots.lines().all(|slot| {
                slot.trim().parse::<i32>().is_ok_and(|slot| {
                    matches!(slot, -1 | 65535) || (0..sky_limit as i32).contains(&slot)
                })
            }) {
                return invalid(format!("The lighting tool cannot bake {bsp} with its expanded or unreadable sky assignments"));
            }
        }
    }
    if blocks.iter().zip(&counts).all(|((_, limit), count)| count <= limit) {
        return bake(scenario_path);
    }

    let source = tags.join(safe_relative(&scenario_tag)?);
    let original_hash = maps::hash_file(&source)?;
    let copy = safe_relative(scenario_path)?.with_file_name(format!("gsbake_{}", &runner.id[..8]));
    // Invader's save-as joins this path directly to its host tags directory.
    let copy_tag = format!("{}.scenario", copy.to_string_lossy().replace('\\', "/"));
    let file = tags.join(copy.with_extension("scenario"));
    reject_links(&file)?;
    if file.try_exists()? {
        return invalid("The bake-only scenario path already exists");
    }
    let mut args = vec!["-t".into(), tags_arg.clone()];
    for ((key, limit), &count) in blocks.iter().zip(&counts) {
        if count > *limit {
            args.extend(["-E".into(), format!("{key}[{limit}-{}]", count - 1)]);
        }
    }
    args.extend(["-O".into(), copy_tag.clone(), scenario_tag]);
    runner.run(edit, &args, workspace, "bsp-bake-scenario", 64)?;
    if maps::hash_file(&source)? != original_hash {
        return invalid("Native lighting changed the original gameplay scenario");
    }
    reject_links(&file)?;
    if !file.is_file() {
        return invalid(format!("Invader did not write the bake-only scenario at {copy_tag}"));
    }
    let operation = (|| {
        let expected = blocks.iter().zip(&counts).map(|((_, limit), count)| (*count).min(*limit));
        if !query_counts(&copy_tag)?.into_iter().eq(expected) || maps::hash_file(&source)? != original_hash {
            return invalid("The bake-only scenario differs from the reviewed scenario copy");
        }
        bake(&copy.to_string_lossy().replace('/', "\\"))
    })();
    if maps::hash_file(&source)? != original_hash {
        return invalid("Native lighting changed the original gameplay scenario");
    }
    reject_links(&file)?;
    fs::remove_file(&file)?;
    operation
}

fn bake_structure_lightmaps(
    project: &Project, tool: &Path, runner: &Runner, workspace: &Path, scenario: &str, bsp: &str,
) -> Result<()> {
    let quality = crate::native_lighting::request(project).map(|request| request.lightmap_quality()).unwrap_or(["0", "0.1"]);
    native_step(tool, runner, workspace, &["lightmaps".into(), scenario.into(), bsp.into(), quality[0].into(), quality[1].into()],
        "bsp-lightmaps")?;
    Ok(())
}

// Temporarily make the connector's private shader alias emit neutral light.
// Restore the unmodified material before cache compilation, even on failure.
fn bake_enclosed_connector(
    project: &Project, tool: &Path, runner: &Runner<'_>, workspace: &Path, edit: &Path,
    scenario: &str, bsp: &str, geometry: &AssemblyGeometry,
) -> Result<()> {
    let material = geometry.materials.first()
        .filter(|material| material.source == 0 && material.shader_class.as_deref() == Some("senv"))
        .ok_or_else(|| SparkError::Invalid("The enclosed connector has no native environment shader".into()))?;
    let tag = format!("gsbsp_{}_0\\materials\\{}.shader_environment", &runner.id[..8], material.name);
    let tags = workspace.join("tags");
    let alias = tags.join(safe_relative(&tag)?);
    reject_links(&alias)?;
    let original = fs::read(&alias)?;
    let before = maps::hash_file(&alias)?;
    let run = |fields: &[&str]| {
        let mut args = vec!["-t".into(), tags.to_string_lossy().into_owned()];
        args.extend(fields.iter().map(|value| value.to_string()));
        args.push(tag.clone());
        runner.run(edit, &args, workspace, "tunnel-lighting", 65)
    };
    let value = run(&["-G", "power"])?;
    let power = value.trim().parse::<f32>().ok().filter(|value| value.is_finite() && *value >= 0.)
        .ok_or_else(|| SparkError::Invalid("The connector shader power is invalid".into()))?;
    if power > 0. {
        return bake_structure_lightmaps(project, tool, runner, workspace, scenario, bsp);
    }
    let bake = (|| {
        run(&["-S", "power", "1", "-S", "color_of_emitted_light", "1,1,1"])?;
        if run(&["-G", "power"])?.trim().parse::<f32>().ok() != Some(1.) {
            return invalid("The tunnel lighting fill did not reach the staged shader");
        }
        bake_structure_lightmaps(project, tool, runner, workspace, scenario, bsp)
    })();
    project::atomic_write(&alias, &original, false)?;
    if maps::hash_file(&alias)? != before {
        return invalid("The original staged connector shader could not be restored");
    }
    bake
}

pub(crate) struct PreparedPartitions {
    pub receipt: serde_json::Value,
    pub switches: Vec<bsp_assembly::PartitionSwitch>,
    pub intact_overlaps: Option<[[[f64; 3]; 2]; 2]>,
    pub intact_sky_offset: Option<u8>,
    pub replacement_slots: Option<[usize; 2]>,
    pub retained_entrance_caps: [bool; 2],
    pub overlap: [[f64; 3]; 2],
    pub structure_tags: Vec<String>,
    pub scenery: Vec<crate::bsp_scenery::Placement>,
    pub donor_tag: String,
    pub donor_environment: Option<crate::bsp_audio::DonorEnvironment>,
    pub pickups: Option<crate::bsp_pickups::PreparedPickups>,
    pub netgame_flags: Option<crate::bsp_netgame_flags::PreparedFlags>,
    pub player_starts: Option<crate::bsp_player_starts::PreparedStarts>,
}

fn bind_partition_scenario(
    inspection: &MapInspection, edit: &Path, runner: &Runner, workspace: &Path, tags: &Path,
    original_structures: &[String], structures: &[String], switches: &[bsp_assembly::PartitionSwitch],
) -> Result<()> {
    let scenario = format!("{}.scenario", inspection.scenario_path);
    let scenario_file = tags.join(safe_relative(&scenario)?);
    let tags_arg = tags.to_string_lossy().into_owned();
    let run = |mut fields: Vec<String>| {
        let mut args = vec!["-t".into(), tags_arg.clone()];
        args.append(&mut fields);
        args.push(scenario.clone());
        runner.run(edit, &args, workspace, "partition-scenario", 58)
    };
    let bsp_count = || run(vec!["-C".into(), "structure_bsps".into()])?.trim().parse::<usize>()
        .map_err(|_| SparkError::Invalid("Native scenario BSP count is unreadable".into()));
    let verify_slots = |paths: &[String]| {
        if bsp_count()? != paths.len() { return invalid("Native scenario BSP count differs from the reviewed source"); }
        for (index, path) in paths.iter().enumerate() {
            let observed = run(vec!["-G".into(), format!("structure_bsps[{index}].structure_bsp")])?;
            if !native_reference_matches(&observed, &format!("{path}.scenario_structure_bsp")) {
                return invalid(format!("Native scenario BSP slot {index} differs from the reviewed structure"));
            }
        }
        Ok(())
    };
    let additions = structures.len().checked_sub(original_structures.len())
        .filter(|count| (1..=2).contains(count) && structures.len() <= 16)
        .ok_or_else(|| SparkError::Invalid("Invalid native BSP extension size".into()))?;
    if additions == 2 && (!structures.starts_with(original_structures) || switches.len() != 4) {
        return invalid("An intact extension must retain the original BSP slots and bind four switches");
    }
    let mut reviewed = BTreeSet::new();
    for transition in switches {
        if maps::native_bsp_switch_name(&transition.name)
            .is_none_or(|(from, to)| from >= structures.len() || to >= structures.len())
            || !reviewed.insert(transition.name.as_str())
        {
            return invalid("Native BSP extension has an invalid or duplicate directional switch");
        }
    }
    verify_slots(original_structures)?;
    let mut args = vec!["-I".into(), "structure_bsps".into(), additions.to_string(), "end".into()];
    for (index, bsp) in structures.iter().enumerate().filter(|(index, bsp)| original_structures.get(*index) != Some(*bsp)) {
        args.extend(["-S".into(), format!("structure_bsps[{index}].structure_bsp"), format!("{bsp}.scenario_structure_bsp")]);
    }
    run(args)?;
    verify_slots(structures)?;
    let mut before = run(vec!["-L".into()])?;
    for transition in switches {
        let count = crate::native_operations::scenario_volume_choices(&before)?.len();
        let index = u16::try_from(count).map_err(|_| SparkError::Invalid("Too many native trigger volumes".into()))?;
        let operation = crate::native_operations::Operation::TriggerVolume {
            append: true, index, name: transition.name.clone(), geometry: transition.geometry.clone(),
            source_sha256: maps::hash_file(&scenario_file)?,
        };
        operation.validate("scnr", &scenario)?;
        let args = operation.arguments_with_fields(tags, "scnr", &scenario, &before)?;
        runner.run(edit, &args, workspace, "partition-switches", 59)?;
        let after = run(vec!["-L".into()])?;
        crate::native_operations::reviewed_difference(&before, &after, &operation)?;
        before = after;
    }
    Ok(())
}

// Return only loose immutable-layout input from the reviewed cache. Native
// dependency extraction and the existing namespacer handle all tag references.
fn extract_intact_donor(
    plan: &bsp_assembly::BspAssembly, donor: &MapInspection, donor_bsp: &str,
    tools: &Toolchain, runner: &Runner, workspace: &Path,
) -> Result<(PathBuf, Vec<String>)> {
    let source = &plan.donor_source;
    let resources = source.resource_directory.as_deref().ok_or_else(||
        SparkError::Invalid("Connect the original CE donor resource banks before preserving its BSP".into()))?;
    crate::tag_exchange::verify_source_snapshot(source, Some(resources))?;
    crate::native_resources::review(source, donor, resources)?;
    let root = workspace.join("intact-donor-tags");
    fs::create_dir(&root)?;
    let scenario = format!("{}.scenario", donor.scenario_path);
    let edit = find_tool(tools, "invader-edit")?;
    let extract = find_tool(tools, "invader-extract")?;
    let extract_tags = |cache: &Path, roots: &[String], recursive: bool| {
        let mut args = vec!["-t".into(), root.to_string_lossy().into_owned(),
            "-m".into(), resources.to_string_lossy().into_owned()];
        for tag in roots { args.extend(["-s".into(), tag.clone()]); }
        if recursive { args.push("-r".into()); }
        args.push(cache.to_string_lossy().into_owned());
        runner.run(&extract, &args, workspace, "extract", 38)
    };
    extract_tags(&source.preserved_path, std::slice::from_ref(&scenario), false)?;
    let sky_count = runner.run(&edit, &["-t".into(), root.to_string_lossy().into_owned(), "-C".into(),
        "skies".into(), scenario.clone()], workspace, "partition-environment", 39)?
        .trim().parse::<usize>().ok().filter(|&count| count <= 8)
        .ok_or_else(|| SparkError::Invalid("Native donor sky count is unreadable".into()))?;
    let mut skies = Vec::with_capacity(sky_count);
    for index in 0..sky_count {
        let sky = runner.run(&edit, &["-t".into(), root.to_string_lossy().into_owned(), "-G".into(),
            format!("skies[{index}].sky"), scenario.clone()], workspace, "partition-environment", 39)?;
        let sky = sky.trim();
        safe_relative(sky)?;
        if !sky.ends_with(".sky") { return invalid("Donor has an unsupported empty or non-native sky reference"); }
        skies.push(sky.to_owned());
    }
    let mut dependencies = vec![format!("{donor_bsp}.scenario_structure_bsp")];
    dependencies.extend_from_slice(&skies);
    if plan.translation == [0.; 3] {
        extract_tags(&source.preserved_path, &dependencies, true)?;
    } else {
        let (cache, _) = maps::translate_bsp_extraction_input(&source.preserved_path, donor, plan.translation)?;
        let input = workspace.join("intact-donor-extract.map");
        project::atomic_write(&input, &cache, false)?;
        let result = extract_tags(&input, &dependencies, true);
        fs::remove_file(&input)?;
        result?;
    }
    for tag in &dependencies {
        if !root.join(safe_relative(tag)?).is_file() { return invalid(format!("Intact donor extraction is missing {tag}")); }
    }
    crate::tag_exchange::verify_source_snapshot(source, Some(resources))?;
    Ok((root, skies))
}

fn intact_sky_span(existing: &[String], used: &BTreeSet<usize>, donor_count: usize, limit: usize) -> Result<usize> {
    if existing.len() > limit || used.iter().any(|&slot| slot >= existing.len()) {
        return invalid("Retained BSP references an invalid native sky slot");
    }
    if donor_count <= limit - existing.len() {
        return Ok(existing.len());
    }
    // Keep the first native reference for each sky even if no cluster uses it.
    // Only a later, unused copy of the same sky may be overwritten.
    if donor_count > limit { return invalid(format!("The donor exceeds the reviewed {limit}-slot sky budget")); }
    let mut names = BTreeSet::new();
    let mut available = vec![true; limit];
    for (slot, name) in existing.iter().enumerate() {
        let name = name.replace('/', "\\").to_ascii_lowercase();
        available[slot] = name.ends_with(".sky") && !names.insert(name) && !used.contains(&slot);
    }
    available.windows(donor_count).position(|span| span.iter().all(|&slot| slot))
        .ok_or_else(|| SparkError::Invalid(format!("The intact extension exceeds the reviewed {limit}-slot sky budget after checking unused duplicate slots")))
}

#[test]
fn intact_sky_binding_uses_only_unused_duplicate_slots_when_full() {
    let skies = ["a.sky", "b.sky", "c.sky", "night.sky", "dusk.sky", "dusk.sky", "dusk.sky", "ice.sky"].map(str::to_owned);
    let used = BTreeSet::from([0, 1, 2, 3, 7]);
    assert_eq!(intact_sky_span(&skies, &used, 1, 8).unwrap(), 5);
    assert_eq!(intact_sky_span(&skies, &used, 2, 8).unwrap(), 5);
    assert_eq!(intact_sky_span(&skies, &used, 8, 16).unwrap(), 8);
    assert!(intact_sky_span(&skies, &used, 9, 16).is_err());
    assert!(intact_sky_span(&skies, &used, 3, 8).is_err());
    assert!(intact_sky_span(&skies, &BTreeSet::from([0, 1, 2, 3, 5, 6, 7]), 1, 8).is_err());
    assert_eq!(intact_sky_span(&skies[..6], &used.iter().copied().filter(|&n| n < 6).collect(), 1, 8).unwrap(), 6);
}

fn bind_intact_skies(
    edit: &Path, runner: &Runner, workspace: &Path, tags: &Path,
    scenario: &str, retained: &[String], donor: &str, donor_skies: &[String], limit: usize,
) -> Result<u8> {
    let run = |tag: &str, fields: Vec<String>| {
        let mut args = vec!["-t".into(), tags.to_string_lossy().into_owned()];
        args.extend(fields);
        args.push(tag.into());
        runner.run(edit, &args, workspace, "partition-environment", 57)
    };
    let base_count = run(scenario, vec!["-C".into(), "skies".into()])?.trim()
        .parse::<usize>().ok().filter(|&count| count <= limit)
        .ok_or_else(|| SparkError::Invalid(format!("Retained scenario exceeds the reviewed {limit}-slot sky budget")))?;
    if donor_skies.len() > limit { return invalid(format!("Donor exceeds the reviewed {limit}-slot sky budget")); }
    let read_slots = || -> Result<Vec<String>> {
        Ok(run(scenario, vec!["-G".into(), "skies[*].sky".into()])?
            .lines().map(str::trim).map(str::to_owned).collect())
    };
    let original = if base_count == 0 { Vec::new() } else { read_slots()? };
    if original.len() != base_count { return invalid("Retained native sky slots are unreadable"); }
    let read_clusters = |tag: &str, slot_count| -> Result<Vec<usize>> {
        run(tag, vec!["-G".into(), "clusters[*].sky".into()])?.lines().map(|value| {
            value.trim().parse::<usize>().ok().filter(|&index| index == 65535 || index < slot_count)
                .ok_or_else(|| SparkError::Invalid(format!("A cluster in {tag} references an invalid sky slot")))
        }).collect()
    };
    let indices = read_clusters(donor, donor_skies.len())?;
    if donor_skies.is_empty() { return Ok(0); }
    let mut used = BTreeSet::new();
    if base_count + donor_skies.len() > limit {
        for structure in retained {
            used.extend(read_clusters(&format!("{structure}.scenario_structure_bsp"), base_count)?
                .into_iter().filter(|&index| index != 65535));
        }
    }
    let offset = intact_sky_span(&original, &used, donor_skies.len(), limit)?;
    let append = (offset + donor_skies.len()).saturating_sub(base_count);
    let mut expected_slots = original;
    expected_slots.resize(base_count + append, String::new());
    let mut args = Vec::new();
    if append != 0 { args.extend(["-I".into(), "skies".into(), append.to_string(), "end".into()]); }
    for (index, sky) in donor_skies.iter().enumerate() {
        let slot = offset + index;
        let sky = format!("gsbsp_{}_1\\{sky}", &runner.id[..8]);
        expected_slots[slot] = sky.clone();
        args.extend(["-S".into(), format!("skies[{slot}].sky"), sky]);
    }
    run(scenario, args)?;
    let actual_slots = read_slots()?;
    let normalize = |path: &str| path.replace('/', "\\").to_ascii_lowercase();
    if !actual_slots.iter().map(|path| normalize(path)).eq(expected_slots.iter().map(|path| normalize(path))) {
        return invalid("Native scenario sky slots differ from the reviewed bindings");
    }
    if offset != 0 {
        let mut args = Vec::new();
        for (cluster, &index) in indices.iter().enumerate().filter(|(_, i)| **i != 65535) {
            args.extend(["-S".into(), format!("clusters[{cluster}].sky"), (offset + index).to_string()]);
            // Bound Windows native command lines on highly partitioned donors.
            if args.len() >= 600 { run(donor, std::mem::take(&mut args))?; }
        }
        if !args.is_empty() { run(donor, args)?; }
    }
    let after = run(donor, vec!["-G".into(), "clusters[*].sky".into()])?;
    let expected = indices.into_iter().map(|i| if i == 65535 { i } else { offset + i }).collect::<Vec<_>>();
    if !after.lines().map(|s| s.trim().parse::<usize>().ok()).eq(expected.into_iter().map(Some)) {
        return invalid("Intact donor sky remap did not survive native readback");
    }
    Ok(offset as u8)
}

fn native_sky_listener(
    mut query: impl FnMut(&str) -> Result<String>,
    cluster_count: usize,
) -> Result<crate::bsp_audio::ListenerTree> {
    let integers = |text: String, max: usize| -> Result<Vec<u32>> {
        let rows = text.lines().take(max + 1).map(|row| {
            let row = row.trim();
            row.parse::<u32>().or_else(|_| row.parse::<i32>().map(|value| value as u32))
                .map_err(|_| SparkError::Invalid("Native sky BSP index is unreadable".into()))
        }).collect::<Result<Vec<_>>>()?;
        if rows.is_empty() || rows.len() > max { return invalid("Native sky BSP index exceeds its bounds"); }
        Ok(rows)
    };
    let nodes = "collision_bsp[0].bsp3d_nodes[*]";
    let planes_at = integers(query(&format!("{nodes}.plane"))?, 131072)?;
    let back = integers(query(&format!("{nodes}.back_child"))?, 131072)?;
    let front = integers(query(&format!("{nodes}.front_child"))?, 131072)?;
    if planes_at.len() != back.len() || planes_at.len() != front.len() {
        return invalid("Native sky BSP node fields disagree about their size");
    }
    let planes = query("collision_bsp[0].planes[*].plane")?.lines().take(65537).map(|line| {
        let mut plane = [0.; 4];
        let fields = line.split(',').collect::<Vec<_>>();
        if fields.len() != 4 { return invalid("Native sky BSP plane has the wrong dimension"); }
        for (value, field) in plane.iter_mut().zip(fields) {
            *value = field.trim().parse::<f32>().ok().filter(|value| value.is_finite())
                .ok_or_else(|| SparkError::Invalid("Native sky BSP plane is unreadable".into()))?;
        }
        Ok(plane)
    }).collect::<Result<Vec<_>>>()?;
    if planes.is_empty() || planes.len() > 65536 { return invalid("Native sky BSP plane count exceeds its bounds"); }
    let leaf_clusters = integers(query("leaves[*].cluster")?, 65536)?.into_iter().map(|slot| {
        if slot == u16::MAX as u32 || slot == u32::MAX { return Ok(None); }
        if (slot as usize) < cluster_count { return Ok(Some(slot as usize)); }
        invalid("Native sky BSP leaf references an invalid cluster")
    }).collect::<Result<Vec<_>>>()?;
    let node_count = planes_at.len();
    let nodes = planes_at.into_iter().zip(back).zip(front).map(|((plane, back), front)| {
        let valid = |child: u32| {
            let count = if child >> 31 == 0 { node_count } else { leaf_clusters.len() };
            child == u32::MAX || ((child & 0x7fff_ffff) as usize) < count
        };
        if plane as usize >= planes.len() || !valid(back) || !valid(front) {
            return invalid("Native sky BSP node references invalid geometry");
        }
        Ok([plane, back, front])
    }).collect::<Result<Vec<_>>>()?;
    Ok(crate::bsp_audio::ListenerTree { nodes, planes, leaf_clusters })
}

#[test]
fn native_sky_listener_keeps_unsigned_and_signed_leaf_addresses() {
    let leaf_row = "0\n1\n";
    let mut source = |field: &str| -> Result<String> {
        let value = match field {
            "collision_bsp[0].bsp3d_nodes[*].plane" => "0\n",
            "collision_bsp[0].bsp3d_nodes[*].back_child" => "-2147483648\n",
            "collision_bsp[0].bsp3d_nodes[*].front_child" => "2147483649\n",
            "collision_bsp[0].planes[*].plane" => "1.0,0.0,0.0,0.0\n",
            "leaves[*].cluster" => leaf_row,
            _ => panic!("unexpected native field: {field}"),
        };
        Ok(value.into())
    };
    let tree = native_sky_listener(&mut source, 2).unwrap();
    assert_eq!(tree.cluster_at([-1., 0., 0.]), Some(0));
    assert_eq!(tree.cluster_at([1., 0., 0.]), Some(1));
    assert!(native_sky_listener(source, 1).is_err());
}

fn apply_outdoor_stock_skies(
    project: &Project, structure: &str, scenario: &str, edit: &Path,
    tools: &Toolchain, runner: &Runner, workspace: &Path, tags: &Path, limit: usize,
) -> Result<()> {
    let bindings = project.inherited_bsp_connections.iter().chain(project.bsp_assembly.iter())
        .filter_map(|plan| bsp_assembly::outdoor_sky_witnesses(plan).map(|witnesses| (plan, witnesses)))
        .collect::<Vec<_>>();
    if bindings.is_empty() { return Ok(()); }
    let run = |root: &Path, tag: &str, fields: &[String]| {
        let mut args = vec!["-t".into(), root.to_string_lossy().into_owned()];
        args.extend_from_slice(fields);
        args.push(tag.to_owned());
        let phase = if fields.first().is_some_and(|field| field == "-G")
            && fields.get(1).is_some_and(|field| field.starts_with("collision_bsp[") || field.starts_with("leaves["))
        { "outdoor-sky-tree" } else { "outdoor-sky-source" };
        runner.run(edit, &args, workspace, phase, 65)
    };
    let get = |root: &Path, tag: &str, key: &str| run(root, tag, &["-G".into(), key.into()]);
    let structure = format!("{structure}.scenario_structure_bsp");
    let count = run(tags, &structure, &["-C".into(), "clusters".into()])?.trim().parse::<usize>()
        .ok().filter(|&count| (1..=8192).contains(&count))
        .ok_or_else(|| SparkError::Invalid("Native outdoor BSP has an invalid cluster count".into()))?;
    let listener = native_sky_listener(|key| get(tags, &structure, key), count)?;
    let normalize = |name: &str| name.replace('/', "\\").to_ascii_lowercase();
    let scenario = format!("{scenario}.scenario");
    let mut slots = get(tags, &scenario, "skies[*].sky")?.lines()
        .map(str::trim).filter(|name| !name.is_empty()).map(normalize).collect::<Vec<_>>();
    let extract = find_tool(tools, "invader-extract")?;
    let mut bound = BTreeSet::new();
    for (index, (plan, [base, donor])) in bindings.into_iter().enumerate() {
        let cluster = listener.cluster_at(donor).filter(|&cluster| {
            listener.cluster_at(base).is_some_and(|other| other != cluster)
        }).ok_or_else(|| SparkError::Invalid(format!("{} outdoor sky needs separate native road clusters", plan.donor_title)))?;
        if !bound.insert(cluster) {
            return invalid("Two regional sky assignments target the same outdoor BSP cluster");
        }
        let source = &plan.donor_source;
        let resources = source.resource_directory.as_deref().or_else(|| source.preserved_path.parent())
            .ok_or_else(|| SparkError::Invalid("Stock sky source has no resource directory".into()))?;
        crate::tag_exchange::verify_source_snapshot(source, Some(resources))?;
        let sky = normalize(&format!("{}.sky", bsp_assembly::outdoor_stock_sky(plan)?));
        let input = workspace.join(format!("outdoor-sky-source-{index}"));
        let slot = match slots.iter().position(|existing| *existing == sky) {
            Some(slot) => slot,
            None => {
                if slots.len() >= limit { return invalid(format!("Regional sky would exceed the reviewed {limit}-slot sky budget")); }
                let destination = tags.join(safe_relative(&sky)?);
                if !destination.is_file() {
                    fs::create_dir(&input)?;
                    runner.run(&extract, &["-t".into(), input.to_string_lossy().into_owned(), "-m".into(),
                        resources.to_string_lossy().into_owned(), "-s".into(), sky.clone(), "-r".into(),
                        source.preserved_path.to_string_lossy().into_owned()], workspace, "extract", 65)?;
                    let inventory = crate::native_staging::inventory(&input, runner.cancel)?;
                    for entry in inventory.files {
                        let relative = safe_relative(&entry.path)?;
                        let from = input.join(&relative);
                        let to = tags.join(relative);
                        reject_links(&to)?;
                        let hash = maps::hash_file(&from)?;
                        if to.is_file() {
                            if maps::hash_file(&to)? != hash {
                                return invalid(format!("Original outdoor sky dependency conflicts with an authored tag: {}", entry.path));
                            }
                        } else {
                            fs::create_dir_all(to.parent().unwrap())?;
                            crate::native_staging::copy_file(&from, &to, entry.bytes, Some(&hash), runner.cancel)?;
                        }
                    }
                    if !destination.is_file() { return invalid("Original outdoor sky dependency extraction did not produce its root"); }
                }
                let slot = slots.len();
                run(tags, &scenario, &["-I".into(), "skies".into(), "1".into(), "end".into(),
                    "-S".into(), format!("skies[{slot}].sky"), sky.clone()])?;
                slots.push(sky.clone());
                slot
            }
        };
        run(tags, &structure, &["-S".into(), format!("clusters[{cluster}].sky"), slot.to_string()])?;
        let assigned = get(tags, &structure, &format!("clusters[{cluster}].sky"))?;
        let bound_sky = get(tags, &scenario, &format!("skies[{slot}].sky"))?;
        if assigned.trim().parse::<usize>().ok() != Some(slot) || normalize(bound_sky.trim()) != sky {
            return invalid("Native outdoor sky binding failed readback");
        }
        crate::tag_exchange::verify_source_snapshot(source, Some(resources))?;
        runner.emit("outdoor-sky-source", format!("{} stock sky bound to cluster {cluster}", plan.donor_title), 65, "success");
    }
    Ok(())
}

/// Stage each native structure. Only the explicit scenario probe binds the
/// pair and appends the reviewed switches to the owned scenario copy.
fn prepare_retained_connector(
    project: &Project, inspection: &MapInspection, tools: &Toolchain,
    runner: &Runner, workspace: &Path, tags: &Path, base_tags: &Path, stage: PartitionStage,
    intact: bsp_assembly::PreservedConnector,
) -> Result<PreparedPartitions> {
    let plan = project.bsp_assembly.as_ref().unwrap();
    let source = project.source.as_ref().unwrap();
    let [slot, island] = intact.replacement_slots.ok_or_else(|| SparkError::Invalid("Missing reviewed connector slots".into()))?;
    let geometry = &intact.geometry;
    let mut structure_tags = maps::scenario_bsp_tag_paths(&source.preserved_path, inspection)?;
    let donor_tag = format!("{}.scenario_structure_bsp", structure_tags[island]);
    let structure_check = stage == PartitionStage::StructureCheck;
    let retained = if structure_check { Vec::new() } else {
        structure_tags.iter().enumerate().filter(|(index, _)| *index != slot).map(|(_, path)| {
            let file = tags.join(safe_relative(&format!("{path}.scenario_structure_bsp"))?);
            let hash = maps::hash_file(&file)?;
            Ok((file, hash))
        }).collect::<Result<Vec<_>>>()?
    };
    namespace_materials(base_tags, &structure_tags[plan.base_bsp_index], 0, geometry,
        &[], tools, runner, workspace, tags, None, &[], structure_check)?;
    if geometry.materials.iter().any(|material| material.source == 1 && material.shader_path.is_some()) {
        let donor = maps::inspect_map(&plan.donor_source.preserved_path, plan.donor_source.resource_directory.as_deref())?;
        let donor_bsp = bsp_tag(&plan.donor_source.preserved_path, &donor, plan.donor_bsp_index)?;
        let (donor_tags, _) = extract_intact_donor(plan, &donor, &donor_bsp, tools, runner, workspace)?;
        namespace_materials(&donor_tags, &donor_bsp, 1, geometry,
            &[], tools, runner, workspace, tags, Some((&plan.donor_source, &donor)), &[], structure_check)?;
    }
    let parent = format!("levels\\spark\\assembly_{}", &project.id[..8]);
    let name = "retained_connector";
    let tool = crate::conversion::native_tool(tools).ok_or_else(|| SparkError::Invalid("Missing H1A tool".into()))?;
    let (bsp, jms, compiled) = compile_structure(&tool, runner, workspace, tags, &parent, name, geometry)?;
    let edit = find_tool(tools, "invader-edit")?;
    let bound = matches!(stage, PartitionStage::Collision | PartitionStage::Lighting);
    if bound {
        let scenario = format!("{}.scenario", inspection.scenario_path);
        let key = format!("structure_bsps[{slot}].structure_bsp");
        let invoke = |fields: &[String]| {
            let mut args = vec!["-t".into(), tags.to_string_lossy().into_owned()];
            args.extend_from_slice(fields);
            args.push(scenario.clone());
            runner.run(&edit, &args, workspace, "partition-scenario", 58)
        };
        let old_tag = format!("{}.scenario_structure_bsp", structure_tags[slot]);
        let new_tag = format!("{bsp}.scenario_structure_bsp");
        if !native_reference_matches(&invoke(&["-G".into(), key.clone()])?, &old_tag) {
            return invalid("Editable scenario no longer has the reviewed connector in its native slot");
        }
        invoke(&["-S".into(), key.clone(), new_tag.clone()])?;
        if !native_reference_matches(&invoke(&["-G".into(), key])?, &new_tag) {
            return invalid("Editable scenario did not retain the replacement connector in its native slot");
        }
    }
    if stage == PartitionStage::Lighting {
        with_native_bake_scenario(&inspection.scenario_path, &edit, runner, workspace, tags,
            [bsp.as_str()], |scenario| {
                if plan.tunnel_bake_fill {
                    bake_enclosed_connector(project, &tool, runner, workspace, &edit, scenario, name, geometry)
                } else {
                    bake_structure_lightmaps(project, &tool, runner, workspace, scenario, name)
                }
            })?;
    }
    let flags = restore_collision_flags(geometry, &edit, runner, workspace, tags, &bsp)?;
    for (file, hash) in &retained {
        if maps::hash_file(file)? != *hash { return invalid("Connector rebuild changed a retained BSP tag"); }
    }
    structure_tags[slot] = bsp.clone();
    let receipt = serde_json::json!({"schemaVersion": 1, "baseSha256": inspection.sha256, "donorSha256": plan.donor_source.sha256,
        "replacementSlot": slot, "donorSlot": island, "switchesRetained": intact.switches,
        "retainedEntranceCaps": intact.retained_entrance_caps,
        "scenarioBound": bound, "structures": [{"name": name, "nativeTag": bsp, "jmsSha256": maps::hash_file(&jms)?,
            "bspSha256": maps::hash_file(&compiled)?, "restoredCollisionSurfaces": flags, "report": geometry.report}]});
    Ok(PreparedPartitions { receipt, switches: vec![], intact_overlaps: Some(intact.overlaps),
        intact_sky_offset: None, replacement_slots: Some([slot, island]), retained_entrance_caps: intact.retained_entrance_caps, overlap: intact.overlaps[0],
        structure_tags, scenery: vec![], donor_tag, donor_environment: None, pickups: None, netgame_flags: None, player_starts: None })
}

pub(crate) fn prepare_partition_structure(
    project: &Project, inspection: &MapInspection, tools: &Toolchain,
    runner: &Runner, workspace: &Path, tags: &Path, stage: PartitionStage, cache_version: u32, limits: crate::megaworld_build::GameplayLimits,
    retained_connector: Option<bsp_assembly::PreservedConnector>,
) -> Result<PreparedPartitions> {
    let bind = matches!(stage, PartitionStage::Collision | PartitionStage::Lighting);
    let base_tags = if stage == PartitionStage::StructureCheck {
        tools.base_tags_directory.as_deref().ok_or_else(|| SparkError::Invalid("Missing editable base tags".into()))?
    } else {
        tags
    };
    let plan = project.bsp_assembly.as_ref().ok_or_else(|| SparkError::Invalid("Author a connection first".into()))?;
    let tool = crate::conversion::native_tool(tools).ok_or_else(|| SparkError::Invalid("BSP structures require the H1A editing kit".into()))?;
    if plan.rebuild_native_connector {
        let intact = retained_connector.ok_or_else(|| SparkError::Invalid("Missing preflight result for the retained connector".into()))?;
        return prepare_retained_connector(project, inspection, tools, runner, workspace, tags, base_tags, stage, intact);
    }
    let (base_geometry, added_geometry, switches, overlap, overlap_samples, max_floor_delta, intact_overlaps) =
        if plan.preserve_donor_bsp {
            let intact = bsp_assembly::generate_preserved_connector(project, inspection, runner.cancel)?;
            (None, intact.geometry, Vec::from(intact.switches), intact.overlaps[0], None, None, Some(intact.overlaps))
        } else {
            let parts = bsp_assembly::generate_partitioned_project(project, inspection, runner.cancel)?;
            (parts.base, parts.donor, Vec::from(parts.switches), parts.overlap, Some(parts.overlap_samples), Some(parts.max_floor_delta), None)
        };
    if let Some(base) = &base_geometry {
        base.source_preflight()?.require_buildable()?;
    }
    added_geometry.source_preflight()?.require_buildable()?;
    let donor = maps::inspect_map(&plan.donor_source.preserved_path, plan.donor_source.resource_directory.as_deref())?;
    let base_source = project.source.as_ref().ok_or_else(|| SparkError::Invalid("Missing partition base source".into()))?;
    let original_structures = maps::scenario_bsp_tag_paths(&base_source.preserved_path, inspection)?;
    if original_structures.len() != inspection.mesh.parts.len() {
        return invalid("A native source BSP is missing from its collision inspection");
    }
    let preserve_shader_paths = stage == PartitionStage::StructureCheck;
    let mut retained = Vec::new();
    if let Some(base) = &base_geometry {
        namespace_materials(base_tags, &original_structures[0], 0, base, &[], tools, runner, workspace, tags, None, &[], preserve_shader_paths)?;
    } else {
        for bsp in &original_structures {
            let file = base_tags.join(safe_relative(&format!("{bsp}.scenario_structure_bsp"))?);
            let sha = maps::hash_file(&file)?;
            retained.push((file, sha));
        }
        namespace_materials(base_tags, &original_structures[plan.base_bsp_index], 0, &added_geometry, &[], tools, runner, workspace, tags, None, &[], preserve_shader_paths)?;
    }
    let scenery = if bind { crate::bsp_scenery::plan(plan, &donor)? } else { vec![] };
    let donor_source_bsp = bsp_tag(&plan.donor_source.preserved_path, &donor, plan.donor_bsp_index)?;
    let extracted = plan.preserve_donor_bsp.then(||
        extract_intact_donor(plan, &donor, &donor_source_bsp, tools, runner, workspace)).transpose()?;
    let (donor_root, skies) = extracted.as_ref().map_or(
        (plan.donor_tags_directory.as_path(), &[][..]), |(root, skies)| (root.as_path(), skies.as_slice()));
    namespace_materials(donor_root, &donor_source_bsp, 1, &added_geometry, &scenery,
        tools, runner, workspace, tags, Some((&plan.donor_source, &donor)), skies, preserve_shader_paths)?;
    let parent = format!("levels\\spark\\assembly_{}", &project.id[..8]);
    let edit = find_tool(tools, "invader-edit")?;
    let donor_name = if base_geometry.is_some() { "donor".into() } else { format!("region_{}", original_structures.len()) };
    if original_structures.iter().any(|tag| tag.rsplit(['\\', '/']).next().is_some_and(|name| name.eq_ignore_ascii_case(&donor_name)))
        && base_geometry.is_none()
    {
        return invalid("The generated donor BSP name already exists in the retained source");
    }
    let mut regions = Vec::with_capacity(2);
    if let Some(base) = &base_geometry { regions.push(("base", base)); }
    regions.push((donor_name.as_str(), &added_geometry));
    let built = regions.iter().map(|(name, geometry)| compile_structure(&tool, runner, workspace, tags, &parent, name, geometry))
        .collect::<Result<Vec<_>>>()?;
    let mut structure_tags = if base_geometry.is_some() {
        built.iter().map(|(tag, _, _)| tag.clone()).collect::<Vec<_>>()
    } else {
        original_structures.iter().cloned().chain(built.iter().map(|(tag, _, _)| tag.clone())).collect()
    };
    let mut intact_sky_offset = None;
    if plan.preserve_donor_bsp {
        let donor_path = format!("gsbsp_{}_1\\{}", &runner.id[..8], donor_source_bsp);
        let donor_tag = format!("{donor_path}.scenario_structure_bsp");
        if bind {
            intact_sky_offset = Some(bind_intact_skies(&edit, runner, workspace, tags,
                &format!("{}.scenario", inspection.scenario_path), &original_structures, &donor_tag, skies, limits.skies)?);
        }
        let file = tags.join(safe_relative(&donor_tag)?);
        retained.push((file.clone(), maps::hash_file(&file)?));
        structure_tags.push(donor_path);
    }
    let netgame_flags = if bind {
        Some(crate::bsp_netgame_flags::PreparedFlags::from_sources(base_source, inspection, plan, &donor, limits.flags)?)
    } else { None };
    let player_starts = if bind {
        Some(crate::bsp_player_starts::PreparedStarts::from_sources(project, inspection, plan, &donor, limits.starts)?)
    } else { None };
    let pickups = if bind {
        bind_partition_scenario(inspection, &edit, runner, workspace, tags, &original_structures, &structure_tags, &switches)?;
        append_scenery(&scenery, inspection, &edit, runner, workspace, tags)?;
        Some(crate::bsp_pickups::stage(
            project, inspection, plan, &donor, tools, runner, workspace, tags, cache_version, limits.pickups,
        )?)
    } else { None };
    if stage == PartitionStage::Lighting {
        crate::native_lighting::apply(project, tags, &inspection.scenario_path, &edit, runner, workspace)?;
        if base_geometry.is_some() {
            apply_outdoor_stock_skies(project, &structure_tags[0], &inspection.scenario_path, &edit, tools, runner, workspace, tags, limits.skies)?;
        }
        with_native_bake_scenario(&inspection.scenario_path, &edit, runner, workspace, tags,
            built.iter().map(|(bsp, _, _)| bsp.as_str()), |scenario| {
            for (name, geometry) in &regions {
                if plan.tunnel_bake_fill {
                    bake_enclosed_connector(project, &tool, runner, workspace, &edit, scenario, name, geometry)?;
                } else {
                    bake_structure_lightmaps(project, &tool, runner, workspace, scenario, name)?;
                }
            }
            Ok(())
        })?;
    }
    let donor_tag = format!("{}.scenario_structure_bsp", structure_tags.last().unwrap());
    let donor_environment = if bind && !plan.preserve_donor_bsp {
        let source = format!("gsbsp_{}_1\\{}.scenario_structure_bsp", &runner.id[..8], donor_source_bsp);
        let invoke = |tag: &str, fields: Vec<String>| {
            let mut args = vec!["-t".into(), tags.to_string_lossy().into_owned()];
            args.extend(fields);
            args.push(tag.into());
            runner.run(&edit, &args, workspace, "partition-environment", 65)
        };
        let source_path = tags.join(safe_relative(&source)?);
        let source_hash = maps::hash_file(&source_path)?;
        let environment = crate::bsp_audio::stage_donor_environment(
            |args| invoke(&source, args), |args| invoke(&donor_tag, args), plan.yaw_degrees)?;
        if maps::hash_file(&source_path)? != source_hash {
            return invalid("Staged original donor BSP changed during ambience transfer");
        }
        if environment.is_none() {
            runner.emit("partition-environment", "Donor sky, fog or mixed ambience needs a reviewed cluster mapping", 66, "info");
        }
        environment
    } else { None };
    let structures = regions.into_iter().zip(built).map(|((name, geometry), (bsp, jms, compiled))| {
        let restored = restore_collision_flags(geometry, &edit, runner, workspace, tags, &bsp)?;
        Ok(serde_json::json!({"name": name, "nativeTag": bsp, "jmsSha256": maps::hash_file(&jms)?,
            "bspSha256": maps::hash_file(&compiled)?, "restoredCollisionSurfaces": restored, "report": geometry.report}))
    }).collect::<Result<Vec<_>>>()?;
    for (file, sha) in &retained {
        if maps::hash_file(file)? != *sha { return invalid("A retained native BSP tag was modified by the extension build"); }
    }
    let receipt = serde_json::json!({"schemaVersion": 1, "baseSha256": inspection.sha256, "donorSha256": donor.sha256,
        "retainedStructureTags": retained.len(),
        "overlap": overlap, "overlapSamples": overlap_samples, "maxFloorDelta": max_floor_delta, "intactOverlaps": intact_overlaps,
        "switches": switches, "structures": structures, "scenarioBound": bind, "donorScenery": scenery.len()});
    Ok(PreparedPartitions { receipt, switches, overlap, intact_overlaps, intact_sky_offset, replacement_slots: None, retained_entrance_caps: [false; 2], structure_tags, scenery, donor_tag, donor_environment, pickups, netgame_flags, player_starts })
}

pub fn prepare_native(
    project: &Project,
    inspection: &MapInspection,
    tools: &Toolchain,
    runner: &Runner,
    workspace: &Path,
    tags: &Path,
    cache_version: u32,
) -> Result<()> {
    prepare_native_with_limits(project, inspection, tools, runner, workspace, tags, cache_version,
        crate::megaworld_build::GameplayLimits::native(cache_version))
}

pub(crate) fn prepare_native_with_limits(
    project: &Project, inspection: &MapInspection, tools: &Toolchain, runner: &Runner,
    workspace: &Path, tags: &Path, cache_version: u32, limits: crate::megaworld_build::GameplayLimits,
) -> Result<()> {
    let Some(assembly) = &project.bsp_assembly else { return Ok(()); };
    assembly.validate()?;
    if assembly.separate_native_bsps {
        return invalid("Use the BSP Assembly connected-region build for separate native BSPs");
    }
    let tool = crate::conversion::native_tool(tools).ok_or_else(|| {
        SparkError::Invalid("BSP assemblies require the MCC H1A editing kit".into())
    })?;
    runner.emit(
        "bsp-assembly",
        "Rebuilding the destination, imported BSP and tunnel into one connected world",
        36,
        "info",
    );
    let donor = maps::inspect_map(
        &assembly.donor_source.preserved_path,
        assembly.donor_source.resource_directory.as_deref(),
    )?;
    let base_source = project.source.as_ref().ok_or_else(|| SparkError::Invalid("Missing assembled base source".into()))?;
    let import_gameplay = [inspection, &donor].into_iter().all(|map| {
        matches!(map.header.version, 609 | 13) && !map.header.extended && map.header.scenario_type == 1
    });
    if import_gameplay {
        let budget = maps::scenario_gameplay_merge_budget(
            &base_source.preserved_path, inspection, &assembly.donor_source.preserved_path, &donor,
        )?;
        let counts = [
            ("native item placements", budget.netgame_equipment, limits.pickups),
            ("native player starts", budget.player_starts, limits.starts),
            ("native vehicle placements", budget.vehicles, crate::bsp_vehicles::limit(cache_version)),
        ];
        for (kind, count, limit) in counts {
            let total = count.existing + count.donor;
            if total > limit {
                return invalid(format!("The merged world needs {total} {kind}. Cache version {cache_version} supports {limit}. Choose a compatible target before building."));
            }
        }
    }
    let restored_starts = import_gameplay.then(|| crate::bsp_player_starts::PreparedStarts::from_sources(
        project, inspection, assembly, &donor, limits.starts,
    )).transpose()?;
    let restored_teleporters = crate::bsp_netgame_flags::PreparedFlags::from_merged_teleporters(
        &base_source.preserved_path, inspection, 0, &[crate::bsp_netgame_flags::MergedTeleporterDonor {
            path: &assembly.donor_source.preserved_path, map: &donor,
            translation: assembly.translation, yaw: assembly.yaw_degrees,
        }], cache_version,
    )?;
    if restored_teleporters.total_count() > limits.flags {
        return invalid(format!("Combined teleporter markers exceed the {} slots for the selected target", limits.flags));
    }
    let geometry = bsp_assembly::generate_project(project, inspection, runner.cancel)?;
    geometry.source_preflight()?.require_buildable()?;
    let scenery = crate::bsp_scenery::plan(assembly, &donor)?;
    let base_bsp = bsp_tag(&base_source.preserved_path, inspection, 0)?;
    let donor_bsp = bsp_tag(&assembly.donor_source.preserved_path, &donor, assembly.donor_bsp_index)?;
    let base_hashes = namespace_materials(
        tags,
        &base_bsp,
        0,
        &geometry,
        &[],
        tools,
        runner,
        workspace,
        tags,
        None,
        &[],
        false,
    )?;
    let donor_hashes = namespace_materials(
        &assembly.donor_tags_directory,
        &donor_bsp,
        1,
        &geometry,
        &scenery,
        tools,
        runner,
        workspace,
        tags,
        Some((&assembly.donor_source,&donor)),
        &[],
        false,
    )?;
    let parent = format!("levels\\spark\\assembly_{}", &project.id[..8]);
    let name = "connected";
    let (bsp, source, compiled) = compile_structure(&tool, runner, workspace, tags, &parent, name, &geometry)?;
    let edit = find_tool(tools, "invader-edit")?;
    let scenario = format!("{}.scenario", inspection.scenario_path);
    runner.run(
        &edit,
        &[
            "-t".into(),
            tags.to_string_lossy().into_owned(),
            "-E".into(),
            "structure_bsps[*]".into(),
            "-I".into(),
            "structure_bsps".into(),
            "1".into(),
            "end".into(),
            "-S".into(),
            "structure_bsps[0].structure_bsp".into(),
            format!("{bsp}.scenario_structure_bsp"),
            scenario.clone(),
        ],
        workspace,
        "bsp-bind",
        50,
    )?;
    let bound = runner.run(
        &edit,
        &[
            "-t".into(),
            tags.to_string_lossy().into_owned(),
            "-C".into(),
            "structure_bsps".into(),
            "-G".into(),
            "structure_bsps[0].structure_bsp".into(),
            scenario,
        ],
        workspace,
        "bsp-bind-check",
        51,
    )?;
    if !bound.lines().any(|s| s.trim() == "1")
        || !bound
            .to_ascii_lowercase()
            .contains(&bsp.to_ascii_lowercase())
    {
        return invalid("Scenario did not bind exactly one rebuilt BSP");
    }
    append_scenery(&scenery, inspection, &edit, runner, workspace, tags)?;
    crate::native_lighting::apply(project,tags,&inspection.scenario_path,&edit,runner,workspace)?;
    apply_outdoor_stock_skies(project, &bsp, &inspection.scenario_path, &edit, tools, runner, workspace, tags, limits.skies)?;
    with_native_bake_scenario(&inspection.scenario_path, &edit, runner, workspace, tags, [bsp.as_str()], |scenario| {
        bake_structure_lightmaps(project, &tool, runner, workspace, scenario, name)
    })?;
    if let Some(starts) = &restored_starts {
        starts.append(&inspection.scenario_path, tools, runner, workspace)?;
    }
    restored_teleporters.append(&inspection.scenario_path, tools, runner, workspace)?;
    let restored_pickups = import_gameplay.then(|| crate::bsp_pickups::stage(
        project, inspection, assembly, &donor, tools, runner, workspace, tags, cache_version, limits.pickups,
    )).transpose()?;
    let restored_flags = restore_collision_flags(&geometry, &edit, runner, workspace, tags, &bsp)?;
    project::atomic_write(
        &workspace.join("bsp-assembly.json"),
        &serde_json::to_vec_pretty(
            &serde_json::json!({"schemaVersion":1,"projectFingerprint":project.fingerprint()?,"baseSourceSha256":inspection.sha256,"donorSourceSha256":donor.sha256,"baseBsp":base_bsp,"donorBsp":donor_bsp,"compiledBsp":bsp,"jmsSha256":maps::hash_file(&source)?,"bspSha256":maps::hash_file(&compiled)?,"restoredCollisionSurfaces":restored_flags,"report":geometry.report,"materials":geometry.materials,"exactSkyPortals":geometry.exact_sky_portals,"donorScenery":scenery,"mergedNetgameFlags":(restored_teleporters.added()>0).then_some(restored_teleporters),"mergedNetgamePickups":restored_pickups,"mergedPlayerStarts":restored_starts,"modelReferenceChanges":donor_hashes.model_reference_changes,"inputTagHashes":{"base":base_hashes.hashes,"donor":donor_hashes.hashes},"gameLoad":"pending","manualWalkthrough":"pending"}),
        )?,
        false,
    )?;
    Ok(())
}

#[cfg(test)] mod source_precedence_tests {
 use super::*;
 #[test] fn recovery_uses_authored_tags_first_and_reports_the_exact_missing_dependency(){
  let root=tempfile::tempdir().unwrap();let source=root.path().join("authored");let recovered=root.path().join("recovered");fs::create_dir(&source).unwrap();fs::create_dir(&recovered).unwrap();
  fs::write(source.join("boulder.scenery"),b"authored edit").unwrap();fs::write(recovered.join("boulder.scenery"),b"original").unwrap();
  assert_eq!(fs::read(dependency_input(&source,&recovered,"boulder.scenery").unwrap()).unwrap(),b"authored edit");
  fs::write(recovered.join("model.gbxmodel"),b"native model").unwrap();assert_eq!(dependency_input(&source,&recovered,"model.gbxmodel").unwrap(),recovered.join("model.gbxmodel"));
  let error=dependency_input(&source,&recovered,"missing.bitmap").unwrap_err().to_string();assert!(error.contains("missing.bitmap")&&error.contains("no original was changed"));
  assert!(dependency_input(&source,&recovered,"../escape.bitmap").is_err());
 }
}

/// A bounded edit of an existing source placement, never a new native object.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BaseTransform {
    object_id: String,
    block: String,
    source_count: usize,
    index: usize,
    before_position: [f32; 3],
    position: [f32; 3],
    before_rotation: [f32; 3],
    rotation: [f32; 3],
    yaw_only: bool,
    tag: Option<String>,
}
/// Partition the existing scenario from reviewed, namespaced scenery additions.
/// These rows still need receipt/hash staging and independent compiled readback.
pub(crate) fn connected_additions<'a>(project: &'a Project, base: &MapInspection) -> Result<Vec<&'a maps::SceneObject>> {
    project.validate()?;
    let originals: BTreeSet<_> = base.objects.iter().map(|row| row.id.as_str()).collect();
    if originals.len() != base.objects.len() || project.scene.iter().filter(|row| originals.contains(row.id.as_str())).count() != originals.len() {
        return invalid("Connected-world original placements were removed or have invalid identities; no source object will be silently omitted");
    }
    let mut additions = vec![];
    for object in project.scene.iter().filter(|row| !originals.contains(row.id.as_str())) {
        let binding = object.source_model.as_ref().and_then(|source| crate::native_asset_imports::find(project, source));
        if uuid::Uuid::parse_str(&object.id).is_err() || object.kind != "Source model" || object.tag_id.is_some()
            || !crate::native_asset_imports::allowed_addition(project, object, base)
            || binding.is_none_or(|binding| binding.tag_class != "scen")
            || object.position.iter().any(|value| !value.is_finite() || value.abs() > 2048.) {
            return invalid("Connected CE additions require visible, unit-scale, source-bound scenery from Asset library. Other classes, replacements and unbound meshes need their validated native authoring path");
        }
        additions.push(object);
    }
    Ok(additions)
}
/// Resolve native fields from the trusted inspection, not renderer offsets.
/// Structural removals and editor-only metadata cannot be ignored.
pub(crate) fn base_transforms(project: &Project, base: &MapInspection) -> Result<Vec<BaseTransform>> {
    connected_additions(project, base)?;
    let originals: BTreeMap<_,_> = base.objects.iter().map(|row|(row.id.as_str(),row)).collect();
    let mut counts = BTreeMap::new();for row in &base.objects { *counts.entry(row.kind.as_str()).or_insert(0usize) += 1; }
    let mut result = vec![];
    for object in &project.scene {
        let Some(old) = originals.get(object.id.as_str()).copied() else { continue; };
        let mut expected = old.clone(); expected.position = object.position; expected.rotation = object.rotation;
        if *object != expected {
            return invalid(format!("{} changes native identity, scale or unsupported placement metadata; only original position/rotation edits are integrated", object.id));
        }
        if object == old { continue; }
        let (block, prefix, yaw_only) = match old.kind.as_str() {
            "Player spawn" => ("player_starting_locations", "spawn", true),
            "Netgame item" => ("netgame_equipment", "netgame-equipment", true),
            "Scenery" => ("scenery", "Scenery", false),
            "Biped" => ("bipeds", "Biped", false),
            "Vehicle" => ("vehicles", "Vehicle", false),
            "Equipment" => ("equipment", "Equipment", false),
            "Weapon" => ("weapons", "Weapon", false),
            "Machine" => ("machines", "Machine", false),
            "Control" => ("controls", "Control", false),
            "Sound scenery" => ("sound_scenery", "Sound scenery", false),
            _ => return invalid(format!("{} has no reviewed connected-world native transform setter", old.kind)),
        };
        let index = old.id.strip_prefix(&format!("{prefix}-")).and_then(|v| v.parse::<usize>().ok())
            .filter(|i| old.id == format!("{prefix}-{i}"))
            .ok_or_else(|| SparkError::Invalid("Original native placement index is invalid".into()))?;
        if old.source_offset.is_none() || old.rotation_offset.is_none()
            || object.position.iter().any(|v| !v.is_finite() || v.abs() > 2048.)
            || (yaw_only && (object.rotation[1] != 0. || object.rotation[2] != 0.)) {
            return invalid(format!("{} exceeds the supported native position/rotation bounds", object.id));
        }
        let tag = old.tag_id.map(|id| {
            let tag = base.tags.iter().find(|t| t.id == id)
                .ok_or_else(|| SparkError::Invalid("Source placement tag is missing".into()))?;
            let extension = match (old.kind.as_str(), tag.class.as_str()) {
                ("Scenery", "scen") => "scenery", ("Biped", "bipd") => "biped",
                ("Vehicle", "vehi") => "vehicle", ("Equipment", "eqip") => "equipment",
                ("Weapon", "weap") => "weapon", ("Machine", "mach") => "device_machine",
                ("Control", "ctrl") => "device_control",
                ("Sound scenery", "ssce") => "sound_scenery",
                ("Netgame item", "itmc") if !tag.external => "item_collection",
                _ => return invalid("Source placement class does not match its native scenario reference"),
            };
            let path = format!("{}.{}", tag.path, extension); safe_relative(&path)?; Ok(path)
        }).transpose()?;
        if tag.is_none() && block != "player_starting_locations" { return invalid("Native placement has no verified source tag"); }
        result.push(BaseTransform { object_id: old.id.clone(), block: block.into(), source_count: counts[old.kind.as_str()], index,
            before_position: old.position, position: object.position, before_rotation: old.rotation,
            rotation: object.rotation, yaw_only, tag });
    }
    Ok(result)
}
fn transform_numbers(text: &str, expected: &[f32], degrees: bool) -> Result<()> {
    let values = text.trim().split(',').map(|s| s.trim().parse::<f32>())
        .collect::<std::result::Result<Vec<_>, _>>().map_err(|_| SparkError::Invalid("Native placement readback is not numeric".into()))?;
    if values.len() != expected.len() || values.iter().zip(expected).any(|(a,b)| {
        let a = if degrees { a.to_radians() } else { *a };
        !a.is_finite() || if degrees { (a-b).sin().atan2((a-b).cos()).abs() > 0.0001 } else { (a-b).abs() > 0.0002 }
    }) { return invalid("Native placement differs from its reviewed source transform"); }
    Ok(())
}
/// Mutate only this build's private scenario. A divergent external tag is a
/// conflict, not permission to overwrite the author's source edits.
pub(crate) fn apply_base_transforms(project: &Project, base: &MapInspection, edit: &Path, runner: &Runner,
    workspace: &Path, tags: &Path) -> Result<serde_json::Value> {
    let rows = base_transforms(project, base)?;
    let scenario = format!("{}.scenario", base.scenario_path);
    let file = tags.join(safe_relative(&scenario)?); crate::reject_links(&file)?;
    let before = maps::hash_file(&file)?;
    let query = |flag: &str, field: String| runner.run(edit, &["-t".into(), tags.to_string_lossy().into_owned(), flag.into(), field, scenario.clone()], workspace, "bsp-gameplay-source", 30);
    let read_transform = |row: &BaseTransform, position: &[f32; 3], rotation: &[f32; 3]| -> Result<()> {
        let prefix = format!("{}[{}]", row.block, row.index);
        transform_numbers(&query("-G", format!("{prefix}.position"))?, position, false)?;
        transform_numbers(&query("-G", format!("{prefix}.{}", if row.yaw_only {"facing"} else {"rotation"}))?,
            if row.yaw_only { &rotation[..1] } else { &rotation[..] }, true)
    };
    let mut counts = BTreeSet::new();
    for row in &rows {
        if counts.insert(row.block.clone()) {
            let count = query("-C", row.block.clone())?.trim().parse::<usize>()
                .map_err(|_| SparkError::Invalid("Native placement count is invalid".into()))?;
            let expected = row.source_count;
            if count != expected { return invalid(format!("{} native array differs from its original cache; reconcile external edits before rebuilding", row.block)); }
        }
        read_transform(row, &row.before_position, &row.before_rotation).map_err(|e| SparkError::Invalid(format!("{} source conflict: {e}", row.object_id)))?;
        if let Some(expected) = &row.tag {
            let prefix = format!("{}[{}]", row.block, row.index);
            let reference = if row.block == "netgame_equipment" {
                format!("{prefix}.item_collection")
            } else {
                let slot = query("-G", format!("{prefix}.type"))?.trim().parse::<usize>()
                    .map_err(|_| SparkError::Invalid("Native placement palette index is invalid".into()))?;
                let palette = match row.block.as_str() {
                    "machines" => "machine_palette".into(),
                    "sound_scenery" => "sound_scenery_palette".into(),
                    "scenery" => "scenery_palette".into(),
                    block => format!("{}_palette", block.trim_end_matches('s')),
                };
                format!("{palette}[{slot}].name")
            };
            let actual = query("-G", reference)?;
            if !native_reference_matches(&actual, &expected) {
                return invalid(format!("{} native tag reference differs from the source; reconcile it before rebuilding",row.object_id));
            }
        }
    }
    for batch in rows.chunks(24) {
        let mut args = vec!["-t".into(),tags.to_string_lossy().into_owned()];
        for row in batch {
            let prefix = format!("{}[{}]",row.block,row.index);
            if row.position != row.before_position { args.extend(["-S".into(),format!("{prefix}.position"),row.position.map(|v|v.to_string()).join(",")]); }
            if row.rotation != row.before_rotation { args.extend(["-S".into(),format!("{prefix}.{}",if row.yaw_only {"facing"} else {"rotation"}),if row.yaw_only {row.rotation[0].to_string()} else {row.rotation.map(|v|v.to_string()).join(",")}]); }
        }
        args.push(scenario.clone()); runner.run(edit,&args,workspace,"bsp-gameplay-author",31)?;
    }
    for row in &rows { read_transform(row,&row.position,&row.rotation)?; }
    Ok(serde_json::json!({"schemaVersion":1,"sourceSha256":base.sha256,"scenario":scenario,"beforeSha256":before,
        "afterSha256":maps::hash_file(&file)?,"transforms":rows,"scope":"Original scenario position/rotation fields only; staged tag readback passed. Compiled readback and gameplay are independent gates."}))
}
/// Use the reviewed pickup poses as the expected output of the partitioned build.
pub(crate) fn apply_expected_pickup_poses(
    project: &Project,
    base: &MapInspection,
    pickups: &mut [maps::NativeNetgamePickup],
) -> Result<Vec<usize>> {
    let mut moved = vec![];
    for row in base_transforms(project, base)?.into_iter().filter(|row| row.block == "netgame_equipment") {
        let pickup = pickups.get_mut(row.index)
            .ok_or_else(|| SparkError::Invalid(format!("{} is missing from native pickup readback", row.object_id)))?;
        if pickup.position != row.before_position || pickup.facing != row.before_rotation[0] {
            return invalid(format!("{} differs from the reviewed native pickup", row.object_id));
        }
        if row.position != row.before_position {
            moved.push(row.index);
        }
        pickup.position = row.position;
        pickup.facing = row.rotation[0];
    }
    Ok(moved)
}

/// Check every original placement, including untouched rows, against the
/// compiled cache. Native datum IDs may change; class/path identities may not.
pub(crate) fn verify_compiled_base(project: &Project, base: &MapInspection, compiled: &MapInspection) -> Result<()> {
    base_transforms(project,base)?;
    let tag = |inspection: &MapInspection,id: Option<u32>| id.and_then(|id|inspection.tags.iter().find(|t|t.id==id))
        .map(|t|(t.class.clone(),t.path.replace('/',"\\").to_ascii_lowercase()));
    let objects: BTreeMap<_,_> = compiled.objects.iter().map(|row|(row.id.as_str(),row)).collect();
    let originals: BTreeSet<_> = base.objects.iter().map(|row| row.id.as_str()).collect();
    for expected in project.scene.iter().filter(|row| originals.contains(row.id.as_str())) {
        let actual = objects.get(expected.id.as_str()).copied()
            .ok_or_else(||SparkError::Invalid(format!("Compiled base placement {} is missing",expected.id)))?;
        if actual.kind != expected.kind || tag(base,expected.tag_id) != tag(compiled,actual.tag_id)
            || actual.position.iter().zip(expected.position).any(|(a,b)|!a.is_finite() || (a-b).abs()>0.0002)
            || actual.rotation.iter().zip(expected.rotation).any(|(a,b)|!a.is_finite() || (a-b).sin().atan2((a-b).cos()).abs()>0.0001) {
            return invalid(format!("Compiled base placement {} differs from the authored source",expected.id));
        }
    }
    Ok(())
}

#[cfg(test)]
mod base_transform_tests {
    use super::*;
    fn source() -> (Project, MapInspection) {
        let object = maps::SceneObject {id:"spawn-0".into(),name:"Player spawn 1".into(),kind:"Player spawn".into(),tag_id:None,
            position:[1.,2.,3.],rotation:[0.,0.,0.],scale:[1.;3],visible:true,source_offset:Some(100),rotation_offset:Some(112),asset_id:None,source_model:None};
        let base = MapInspection {header:maps::MapHeader {version:609,engine:"synthetic".into(),name:"fixture".into(),build:"fixture".into(),scenario_type:1,
            file_size:2048,declared_size:2048,tag_offset:0,tag_size:0,crc32:0,flags:0,demo_layout:false,compressed:false,extended:false,legacy_tag_size_repair:false},
            sha256:"0".repeat(64),tag_checksum:None,tags:vec![],objects:vec![object.clone()],decals:vec![],mesh:Default::default(),render_mesh:None,
            model_meshes:Default::default(),player_starting_profiles:None,encounters:vec![],scripts:vec![],resources:vec![],diagnostics:vec![],scenario_path:"levels/fixture/fixture".into()};
        let mut project=Project::new("Synthetic placement source");project.scene=vec![object];(project,base)
    }
    #[test]
    fn existing_spawn_moves_in_native_axes_without_granting_structural_changes() {
        let (mut project,base)=source();assert!(base_transforms(&project,&base).unwrap().is_empty());
        project.scene[0].position[0]=1.25;project.scene[0].rotation[0]=std::f32::consts::FRAC_PI_2;
        let plan=base_transforms(&project,&base).unwrap();assert_eq!(plan.len(),1);assert_eq!(plan[0].block,"player_starting_locations");
        assert_eq!(plan[0].index,0);assert_eq!(plan[0].position,[1.25,2.,3.]);assert_eq!(plan[0].before_position,[1.,2.,3.]);assert!(plan[0].yaw_only);
        let expected=project.scene.clone();
        for change in 0..7 {project.scene=expected.clone();match change {
            0=>project.scene[0].rotation[1]=0.2,1=>project.scene[0].scale=[2.;3],2=>project.scene[0].tag_id=Some(5),
            3=>project.scene[0].source_offset=Some(200),4=>project.scene[0].visible=false,5=>project.scene[0].name="Unintegrated rename".into(),_=>project.scene[0].position[0]=2049.,
        }assert!(base_transforms(&project,&base).is_err(),"unsafe change {change}");}
        project.scene=expected;project.scene.clear();assert!(base_transforms(&project,&base).is_err());
    }
    #[test]
    fn native_readback_handles_degree_output_and_rejects_stale_or_nonfinite_values() {
        assert!(transform_numbers("90",&[std::f32::consts::FRAC_PI_2],true).is_ok());
        assert!(transform_numbers("450",&[std::f32::consts::FRAC_PI_2],true).is_ok());
        for value in ["NaN","inf","0","90,90"] {assert!(transform_numbers(value,&[std::f32::consts::FRAC_PI_2],true).is_err());}
        assert!(transform_numbers("1,2,3",&[1.,2.,3.],false).is_ok());
        assert!(transform_numbers("1,2,3.1",&[1.,2.,3.],false).is_err());
    }
    #[test]
    fn compiled_readback_requires_authored_transform_and_all_untouched_placements() {
        let (mut project,base)=source();project.scene[0].position[0]=1.25;
        assert!(verify_compiled_base(&project,&base,&base).is_err());
        let mut compiled=base.clone();compiled.objects=project.scene.clone();assert!(verify_compiled_base(&project,&base,&compiled).is_ok());
        compiled.objects[0].position[0]=f32::NAN;assert!(verify_compiled_base(&project,&base,&compiled).is_err());
        compiled.objects.clear();assert!(verify_compiled_base(&project,&base,&compiled).is_err());
        project.scene=base.objects.clone();let mut compiled=base.clone();compiled.objects[0].rotation[0]=0.1;
        assert!(verify_compiled_base(&project,&base,&compiled).is_err());
    }
    // Identity-only fixtures. Native receipt payloads and the real Halo compiler
    // are independently exercised by the connected-world desktop acceptance.
    fn imported_source() -> (Project, MapInspection) {
        let (mut project,base)=source();let id=uuid::Uuid::new_v4().to_string();
        let binding=crate::native_asset_imports::Binding{id:id.clone(),source_project_id:uuid::Uuid::new_v4().to_string(),
            source_sha256:"a".repeat(64),tag_id:42,tag_class:"scen".into(),tag_path:"scenery/rock".into(),
            native_path:format!("gs_assets_{}/scenery/rock",id.replace('-',"")),receipt_sha256:"b".repeat(64),file_count:5};
        let object=maps::SceneObject{id:uuid::Uuid::new_v4().to_string(),name:"Imported rock".into(),kind:"Source model".into(),tag_id:None,
            position:[4.,5.,6.],rotation:[0.3,-0.2,0.1],scale:[1.;3],visible:true,source_offset:None,rotation_offset:None,asset_id:None,
            source_model:Some(maps::SourceModelReference{project_id:binding.source_project_id.clone(),source_sha256:binding.source_sha256.clone(),
                tag_id:binding.tag_id,path:binding.tag_path.clone(),class:binding.tag_class.clone()})};
        project.native_asset_imports.push(binding);project.scene.push(object);(project,base)
    }
    #[test]
    fn connected_scenery_keeps_originals_and_rejects_unbound_replacement_and_editor_only_changes() {
        let (project,base)=imported_source();assert_eq!(connected_additions(&project,&base).unwrap().len(),1);
        assert!(base_transforms(&project,&base).unwrap().is_empty());
        let mut moved=project.clone();moved.scene[0].position[0]+=0.25;
        assert_eq!(base_transforms(&moved,&base).unwrap().len(),1);
        for change in 0..9 {let mut bad=project.clone();match change {
            0=>{bad.scene.remove(0);},1=>bad.scene[1].scale=[2.;3],2=>bad.scene[1].visible=false,
            3=>bad.scene[1].source_model=None,4=>bad.scene[1].position[0]=2049.,5=>bad.scene[1].source_offset=Some(500),
            6=>bad.scene[1].tag_id=Some(42),7=>bad.scene[1].source_model.as_mut().unwrap().source_sha256="c".repeat(64),
            _=>bad.scene[1].kind="Scenery".into(),
        }assert!(base_transforms(&bad,&base).is_err(),"unsafe addition {change}");}
        let mut replaced=project.clone();replaced.scene[1].id=replaced.scene[0].id.clone();assert!(base_transforms(&replaced,&base).is_err());
        let mut unsupported=project.clone();unsupported.native_asset_imports[0].tag_class="vehi".into();unsupported.scene[1].source_model.as_mut().unwrap().class="vehi".into();
        assert!(base_transforms(&unsupported,&base).is_err());
    }
    #[test]
    fn compiled_scenery_requires_every_copy_transform_and_original_including_coincident_copies() {
        let (mut project,base)=imported_source();let mut copy=project.scene[1].clone();copy.id=uuid::Uuid::new_v4().to_string();project.scene.push(copy);
        let binding=&project.native_asset_imports[0];let mut compiled=base.clone();
        compiled.tags.push(maps::Tag{id:100,index:0,class:"scen".into(),path:binding.native_path.clone(),data_offset:Some(1000),external:false,
            fields:vec![],references:vec![],primary_bitmap_status:None,shader_preview:None});
        for (index,object) in project.scene[1..].iter().enumerate(){let mut native=object.clone();native.id=format!("Scenery-{index}");
            native.kind="Scenery".into();native.tag_id=Some(100);native.source_model=None;compiled.objects.push(native);}
        let verify=|output:&MapInspection|{verify_compiled_base(&project,&base,output)?;crate::native_asset_imports::verify_compiled(&project,output)};
        verify(&compiled).unwrap();
        let mut changed=compiled.clone();changed.objects[1].position[0]+=0.25;assert!(verify(&changed).is_err());
        changed=compiled.clone();changed.objects[1].rotation[1]+=0.1;assert!(verify(&changed).is_err());
        changed=compiled.clone();changed.objects.pop();assert!(verify(&changed).is_err());
        changed=compiled.clone();changed.objects.push(compiled.objects[1].clone());assert!(verify(&changed).is_err());
        changed=compiled.clone();changed.objects[0].position[0]+=0.25;assert!(verify(&changed).is_err());
        changed=compiled.clone();changed.objects[1].position[0]=f32::NAN;assert!(verify(&changed).is_err());
        changed=compiled.clone();changed.tags[0].path="unrelated/rock".into();assert!(verify(&changed).is_err());
    }
    #[test]
    fn pickup_moves_preserve_collection_and_spawn_rules() {
        let (mut project, mut base) = source();
        let object = &mut base.objects[0];
        object.id = "netgame-equipment-0".into();
        object.kind = "Netgame item".into();
        object.tag_id = Some(42);
        base.tags.push(maps::Tag { id: 42, index: 0, class: "itmc".into(), path: "items/rockets".into(),
            data_offset: Some(1000), external: false, fields: vec![], references: vec![],
            primary_bitmap_status: None, shader_preview: None });
        project.scene = base.objects.clone();
        project.scene[0].position[2] = 2.5;
        project.scene[0].rotation[0] = 0.25;
        assert_eq!(base_transforms(&project, &base).unwrap()[0].tag.as_deref(), Some("items/rockets.item_collection"));
        let mut pickups = [maps::NativeNetgamePickup { collection: "items/rockets".into(),
            flags: 1, spawn_types: [12, 0, 0, 0], team_index: -1, spawn_time: 45,
            position: [1., 2., 3.], facing: 0. }];
        assert_eq!(apply_expected_pickup_poses(&project, &base, &mut pickups).unwrap(), vec![0]);
        let [item] = pickups;
        assert_eq!((item.position, item.facing), ([1., 2., 2.5], 0.25));
        assert_eq!((item.collection.as_str(), item.flags, item.spawn_types, item.team_index, item.spawn_time),
            ("items/rockets", 1, [12, 0, 0, 0], -1, 45));
        let mut compiled = base.clone();
        compiled.objects = project.scene.clone();
        verify_compiled_base(&project, &base, &compiled).unwrap();
        assert!(verify_compiled_base(&project, &base, &base).is_err());
        project.scene[0].rotation[1] = 0.25;
        assert!(base_transforms(&project, &base).is_err());
    }

    #[test]
    fn missing_native_spans_and_unreviewed_source_kinds_cannot_be_transformed() {
        let (mut project,mut base)=source();base.objects[0].source_offset=None;project.scene=base.objects.clone();project.scene[0].position[0]+=0.25;
        assert!(base_transforms(&project,&base).is_err());
        let (mut project,mut base)=source();base.objects[0].kind="Netgame item".into();project.scene=base.objects.clone();
        assert!(base_transforms(&project,&base).unwrap().is_empty());project.scene[0].position[0]+=0.25;
        assert!(base_transforms(&project,&base).is_err());
    }
}
