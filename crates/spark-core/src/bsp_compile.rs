//! Isolated native compiler integration for a source-bound BSP assembly.
use crate::{
    bsp_assembly::{self, AssemblyGeometry},
    build::{self, Runner, Toolchain},
    invalid,
    maps::{self, MapInspection},
    project::{self, Project},
    safe_relative, Result, SparkError,
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
fn bsp_tag(i: &MapInspection, index: usize) -> Result<String> {
    let name = &i
        .mesh
        .parts
        .get(index)
        .ok_or_else(|| SparkError::Invalid("Source BSP index changed".into()))?
        .name;
    i.tags
        .iter()
        .find(|t| {
            t.class == "sbsp"
                && t.path
                    .rsplit(['\\', '/'])
                    .next()
                    .is_some_and(|s| s.eq_ignore_ascii_case(name))
        })
        .map(|t| t.path.clone())
        .ok_or_else(|| SparkError::Invalid("Selected BSP tag identity is unavailable".into()))
}
fn namespace_materials(
    source: &Path,
    bsp: &str,
    source_index: usize,
    geometry: &AssemblyGeometry,
    tools: &Toolchain,
    runner: &Runner,
    workspace: &Path,
    destination: &Path,
) -> Result<BTreeMap<String, String>> {
    crate::reject_links(source)?;
    if !source.is_dir() {
        return invalid(
            "Select the matching editable donor tags directory before compiling a BSP assembly",
        );
    }
    let dependency = find_tool(tools, "invader-dependency")?;
    let refactor = find_tool(tools, "invader-refactor")?;
    let working = workspace.join(format!("bsp-dependencies-{source_index}"));
    // Invader's recursive renamer does not handle Windows verbatim roots
    // consistently. Its cwd is the owned job, so keep these paths relative.
    let working_arg = format!("bsp-dependencies-{source_index}");
    fs::create_dir(&working)?;
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
    // One recursive BSP inventory normally covers every source shader. Only the
    // user-selected tunnel material may need an additional recursive traversal.
    let output = runner.run(
        &dependency,
        &[
            "-t".into(),
            source.to_string_lossy().into_owned(),
            "-r".into(),
            roots[0].clone(),
        ],
        workspace,
        "bsp-dependencies",
        40,
    )?;
    for line in output.lines().map(str::trim).filter(|s| !s.is_empty()) {
        safe_relative(line)?;
        required.insert(line.replace('\\', "/"));
    }
    for root in roots {
        let root = root.replace('\\', "/");
        if !required.contains(&root) {
            let output = runner.run(
                &dependency,
                &[
                    "-t".into(),
                    source.to_string_lossy().into_owned(),
                    "-r".into(),
                    root.clone(),
                ],
                workspace,
                "bsp-dependencies",
                40,
            )?;
            for line in output.lines().map(str::trim).filter(|s| !s.is_empty()) {
                safe_relative(line)?;
                required.insert(line.replace('\\', "/"));
            }
            required.insert(root);
        }
    }
    if required.len() > 8192 {
        return invalid("BSP dependency closure exceeds 8192 files");
    }
    let mut hashes = BTreeMap::new();
    let mut bytes = 0u64;
    for relative in required {
        let input = source.join(safe_relative(&relative)?);
        crate::reject_links(&input)?;
        let size = fs::metadata(&input)?.len();
        bytes = bytes
            .checked_add(size)
            .ok_or_else(|| SparkError::Invalid("BSP dependency size overflow".into()))?;
        if size > 128 * 1024 * 1024 || bytes > 1024 * 1024 * 1024 {
            return invalid("BSP material dependencies exceed 128 MiB per file or 1 GiB total");
        }
        let hash = maps::hash_file(&input)?;
        let output = working.join(safe_relative(&relative)?);
        fs::create_dir_all(output.parent().unwrap())?;
        fs::copy(&input, &output)?;
        if maps::hash_file(&input)? != hash || maps::hash_file(&output)? != hash {
            return invalid("BSP dependency changed during staging");
        }
        let mut permissions = fs::metadata(&output)?.permissions();
        permissions.set_readonly(false);
        fs::set_permissions(&output, permissions)?;
        hashes.insert(relative, hash);
    }
    let namespace = format!("gsbsp_{}_{}", &runner.id[..8], source_index);
    if working.join(&namespace).exists() {
        return invalid("BSP dependency namespace collides with an input path");
    }
    let entries = fs::read_dir(&working)?.collect::<std::io::Result<Vec<_>>>()?;
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
            if !original_file.is_file() {
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
                fs::copy(previous_file, alias_file)?;
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
    let root = working.join(&namespace);
    let mut stack = vec![root.clone()];
    while let Some(folder) = stack.pop() {
        for e in fs::read_dir(folder)? {
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
            fs::create_dir_all(output.parent().unwrap())?;
            fs::copy(path, output)?;
        }
    }
    Ok(hashes)
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
pub fn prepare_native(
    project: &Project,
    inspection: &MapInspection,
    tools: &Toolchain,
    runner: &Runner,
    workspace: &Path,
    tags: &Path,
) -> Result<()> {
    let Some(assembly) = &project.bsp_assembly else {
        return Ok(());
    };
    assembly.validate()?;
    let tool = crate::conversion::native_tool(tools).ok_or_else(|| {
        SparkError::Invalid("BSP assemblies require the MCC H1A editing kit".into())
    })?;
    runner.emit(
        "bsp-assembly",
        "Rebuilding the destination, imported BSP and tunnel into one connected world",
        36,
        "info",
    );
    let geometry = bsp_assembly::generate_project(project, inspection, runner.cancel)?;
    let donor = maps::inspect_map(
        &assembly.donor_source.preserved_path,
        assembly.donor_source.resource_directory.as_deref(),
    )?;
    let base_hashes = namespace_materials(
        tags,
        &bsp_tag(inspection, 0)?,
        0,
        &geometry,
        tools,
        runner,
        workspace,
        tags,
    )?;
    let donor_hashes = namespace_materials(
        &assembly.donor_tags_directory,
        &bsp_tag(&donor, assembly.donor_bsp_index)?,
        1,
        &geometry,
        tools,
        runner,
        workspace,
        tags,
    )?;
    let parent = format!("levels\\spark\\assembly_{}", &project.id[..8]);
    let name = "connected";
    let source = workspace
        .join("data")
        .join(safe_relative(&format!("{parent}/models/{name}.jms"))?);
    fs::create_dir_all(source.parent().unwrap())?;
    project::atomic_write(
        &source,
        bsp_assembly::export_jms(&geometry)?.as_bytes(),
        false,
    )?;
    native_step(
        &tool,
        runner,
        workspace,
        &[
            "structure".into(),
            parent.clone(),
            name.into(),
            "true".into(),
        ],
        "bsp-structure",
    )?;
    let bsp = format!("{parent}\\{name}");
    let compiled = tags.join(safe_relative(&format!("{bsp}.scenario_structure_bsp"))?);
    if !compiled.is_file() || fs::metadata(&compiled)?.len() < 648 {
        return invalid("Tool did not produce a complete combined BSP");
    }
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
    native_step(
        &tool,
        runner,
        workspace,
        &[
            "lightmaps".into(),
            inspection.scenario_path.clone(),
            name.into(),
            "0".into(),
            "0.1".into(),
        ],
        "bsp-lightmaps",
    )?;
    let restored_flags = restore_collision_flags(&geometry, &edit, runner, workspace, tags, &bsp)?;
    project::atomic_write(
        &workspace.join("bsp-assembly.json"),
        &serde_json::to_vec_pretty(
            &serde_json::json!({"schemaVersion":1,"projectFingerprint":project.fingerprint()?,"baseSourceSha256":inspection.sha256,"donorSourceSha256":donor.sha256,"baseBsp":bsp_tag(inspection,0)?,"donorBsp":bsp_tag(&donor,assembly.donor_bsp_index)?,"compiledBsp":bsp,"jmsSha256":maps::hash_file(&source)?,"bspSha256":maps::hash_file(&compiled)?,"restoredCollisionSurfaces":restored_flags,"report":geometry.report,"materials":geometry.materials,"inputTagHashes":{"base":base_hashes,"donor":donor_hashes},"gameLoad":"pending","manualWalkthrough":"pending"}),
        )?,
        false,
    )?;
    Ok(())
}
