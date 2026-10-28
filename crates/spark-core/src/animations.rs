//! Owned Halo animation sources, strict rig matching and derived native graphs.
use crate::{invalid, maps, project, Result, SparkError};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};
pub const MAX_SOURCE_BYTES: u64 = 32 * 1024 * 1024;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnimationNode {
    pub name: String,
    pub parent: i16,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnimationClip {
    pub name: String,
    pub fps: f32,
    pub frame_count: usize,
    pub checksum: u32,
    pub nodes: Vec<AnimationNode>,
    pub transforms: Vec<f32>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnimationAsset {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub source_path: PathBuf,
    pub source_sha256: String,
    pub data_path: PathBuf,
    pub data_sha256: String,
    pub frame_count: usize,
    pub fps: f32,
    pub checksum: u32,
    pub node_names: Vec<String>,
    pub animation_names: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnimationAssignment {
    pub id: String,
    pub asset_id: String,
    pub target_tag_id: u32,
    pub target_tag_path: String,
    pub source_sha256: String,
    pub mode: String,
    pub play_on_take: bool,
}
fn bad(s: &str) -> SparkError {
    SparkError::Invalid(s.into())
}
fn valid_name(s: &str) -> bool {
    !s.is_empty() && s.len() <= 127 && !s.chars().any(|c| c.is_control())
}
fn hash(h: &str) -> bool {
    h.len() == 64 && h.bytes().all(|c| c.is_ascii_hexdigit())
}
impl AnimationAsset {
    pub fn validate(&self) -> Result<()> {
        uuid::Uuid::parse_str(&self.id).map_err(|_| bad("Invalid animation identity"))?;
        if !valid_name(&self.name)
            || !matches!(self.kind.as_str(), "clip" | "graph")
            || !hash(&self.source_sha256)
            || !hash(&self.data_sha256)
            || self.node_names.is_empty()
            || self.node_names.len() > 64
            || self.node_names.iter().any(|n| !valid_name(n))
            || self.animation_names.len() > 2048
            || self.animation_names.iter().any(|n| !valid_name(n))
            || self.frame_count > 9000
            || !self.fps.is_finite()
            || self.fps <= 0.
            || self.fps > 240.
        {
            return invalid("Invalid animation asset metadata");
        }
        Ok(())
    }
}
impl AnimationClip {
    pub fn validate(&self) -> Result<()> {
        let n = self.nodes.len();
        if !valid_name(&self.name)
            || n == 0
            || n > 64
            || self.frame_count == 0
            || self.frame_count > 9000
            || !self.fps.is_finite()
            || !(1. ..=240.).contains(&self.fps)
            || self.transforms.len() != self.frame_count * n * 8
            || self.transforms.len() > 2_000_000
        {
            return invalid("Animation exceeds the supported frame, node or transform budget");
        }
        let mut names = HashSet::new();
        for (i, node) in self.nodes.iter().enumerate() {
            if !valid_name(&node.name)
                || !names.insert(node.name.to_ascii_lowercase())
                || node.parent < -1
                || node.parent as isize >= n as isize
                || node.parent == i as i16
            {
                return invalid("Animation contains duplicate names or an invalid hierarchy");
            }
        }
        for node in &self.nodes {
            let mut p = node.parent;
            let mut depth = 0;
            while p >= 0 {
                depth += 1;
                if depth > n {
                    return invalid("Animation hierarchy contains a cycle");
                }
                p = self.nodes[p as usize].parent;
            }
        }
        for t in self.transforms.chunks_exact(8) {
            if t.iter().any(|v| !v.is_finite())
                || t[..3].iter().any(|v| v.abs() > 10000.)
                || !(0.001..=1000.).contains(&t[7])
            {
                return invalid("Animation contains nonfinite or unreasonable transforms");
            }
            let length = t[3..7].iter().map(|v| v * v).sum::<f32>();
            if !(0.9..=1.1).contains(&length) {
                return invalid("Animation contains an invalid rotation quaternion");
            }
        }
        Ok(())
    }
}
/// JMA 16392 stores centimetres, local quaternions and one uniform scale per node.
pub fn parse_jma(text: &str, name: &str) -> Result<AnimationClip> {
    if text.len() as u64 > MAX_SOURCE_BYTES {
        return invalid("Animation source exceeds 32 MiB");
    }
    let mut lines = text
        .trim_start_matches('\u{feff}')
        .lines()
        .map(str::trim)
        .filter(|s| !s.is_empty() && !s.starts_with(';'));
    fn integer(lines: &mut impl Iterator<Item = impl AsRef<str>>) -> Result<i64> {
        lines
            .next()
            .ok_or_else(|| bad("Animation header is truncated"))?
            .as_ref()
            .parse()
            .map_err(|_| bad("Animation header requires an integer"))
    }
    if integer(&mut lines)? != 16392 {
        return invalid("Unsupported JMA version; export Halo 1 JMA/JMM version 16392");
    }
    let frames = integer(&mut lines)?;
    let fps = integer(&mut lines)?;
    if integer(&mut lines)? != 1 {
        return invalid("Animation must contain one actor");
    }
    let actor = lines
        .next()
        .ok_or_else(|| bad("Animation actor is missing"))?;
    if !valid_name(actor) {
        return invalid("Invalid animation actor");
    }
    let count = integer(&mut lines)?;
    let sum = integer(&mut lines)?;
    if !(1..=64).contains(&count)
        || !(1..=9000).contains(&frames)
        || !(1..=240).contains(&fps)
        || sum < i32::MIN as i64
        || sum > u32::MAX as i64
        || frames * count * 8 > 2_000_000
    {
        return invalid("Animation header exceeds the supported budget");
    }
    let n = count as usize;
    let mut nodes = vec![];
    let mut siblings = vec![];
    let mut children = vec![];
    for _ in 0..n {
        let name = lines
            .next()
            .ok_or_else(|| bad("Animation node is missing"))?
            .to_string();
        let sibling = integer(&mut lines)?;
        let child = integer(&mut lines)?;
        if sibling < -1 || sibling >= count || child < -1 || child >= count {
            return invalid("Animation node link is out of range");
        }
        nodes.push(AnimationNode { name, parent: -1 });
        siblings.push(sibling);
        children.push(child);
    }
    for parent in 0..n {
        let mut child = children[parent];
        let mut seen = HashSet::new();
        while child >= 0 {
            let at = child as usize;
            if !seen.insert(at) || nodes[at].parent >= 0 {
                return invalid("Animation hierarchy contains a cycle or multiple parents");
            }
            nodes[at].parent = parent as i16;
            child = siblings[at];
        }
    }
    let expected = frames as usize * n * 8;
    let mut transforms = Vec::with_capacity(expected);
    for token in lines.flat_map(str::split_whitespace) {
        if transforms.len() >= expected {
            return invalid("Animation has trailing transform data");
        }
        let mut v: f32 = token
            .parse()
            .map_err(|_| bad("Invalid animation transform"))?;
        if transforms.len() % 8 < 3 {
            v /= 100.;
        }
        transforms.push(v);
    }
    let clip = AnimationClip {
        name: name.into(),
        fps: fps as f32,
        frame_count: frames as usize,
        checksum: sum as u32,
        nodes,
        transforms,
    };
    clip.validate()?;
    Ok(clip)
}
pub fn verified_clip(asset: &AnimationAsset) -> Result<AnimationClip> {
    asset.validate()?;
    if asset.kind != "clip" {
        return invalid("Animation graphs need their source clips for editor playback");
    }
    verify_file(&asset.source_path, &asset.source_sha256)?;
    verify_file(&asset.data_path, &asset.data_sha256)?;
    let clip: AnimationClip = serde_json::from_slice(&fs::read(&asset.data_path)?)?;
    clip.validate()?;
    if clip.frame_count != asset.frame_count
        || clip.checksum != asset.checksum
        || clip
            .nodes
            .iter()
            .map(|n| &n.name)
            .ne(asset.node_names.iter())
    {
        return invalid("Animation clip metadata differs from its preserved source");
    }
    Ok(clip)
}
pub fn verify_file(path: &Path, expected: &str) -> Result<()> {
    crate::reject_links(path)?;
    if fs::metadata(path)?.len() > 64 * 1024 * 1024 || maps::hash_file(path)? != expected {
        return invalid("Animation file changed or exceeds its budget");
    }
    Ok(())
}
pub fn jma_source(clip: &AnimationClip) -> Result<String> {
    use std::fmt::Write;
    clip.validate()?;
    let mut text = format!(
        "16392\n{}\n{}\n1\nspark_actor\n{}\n{}\n",
        clip.frame_count,
        clip.fps.round() as u32,
        clip.nodes.len(),
        clip.checksum as i32
    );
    for (i, node) in clip.nodes.iter().enumerate() {
        let sibling = clip
            .nodes
            .iter()
            .enumerate()
            .skip(i + 1)
            .find(|(_, n)| n.parent == node.parent)
            .map(|(j, _)| j as i16)
            .unwrap_or(-1);
        let child = clip
            .nodes
            .iter()
            .position(|n| n.parent == i as i16)
            .map(|j| j as i16)
            .unwrap_or(-1);
        writeln!(text, "{}\n{sibling}\n{child}", node.name)
            .map_err(|_| bad("Animation source formatting failed"))?;
    }
    for transform in clip.transforms.chunks_exact(8) {
        writeln!(
            text,
            "{:.8}\t{:.8}\t{:.8}\n{:.8}\t{:.8}\t{:.8}\t{:.8}\n{:.8}",
            transform[0] * 100.,
            transform[1] * 100.,
            transform[2] * 100.,
            transform[3],
            transform[4],
            transform[5],
            transform[6],
            transform[7]
        )
        .map_err(|_| bad("Animation source formatting failed"))?;
    }
    Ok(text.replace('\n', "\r\n"))
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAnimationAction {
    pub graph: String,
    pub animation: String,
    pub biped_tag: String,
    pub play_on_take: bool,
}
pub(crate) fn prepare_native(
    p: &project::Project,
    inspection: &maps::MapInspection,
    tools: &crate::build::Toolchain,
    workspace: &Path,
    runner: &crate::build::Runner,
) -> Result<Vec<NativeAnimationAction>> {
    if p.animation_assignments.is_empty() {
        return Ok(vec![]);
    }
    p.validate()?;
    let source = p.source.as_ref().ok_or_else(|| {
        bad("Native animation assignments currently require an imported source map")
    })?;
    let edit = crate::build::tool_path(tools, "invader-edit")
        .ok_or_else(|| bad("Invader edit is required for animation bindings"))?;
    let tool = crate::conversion::native_tool(tools)
        .ok_or_else(|| bad("MCC native animation compiler is missing"))?;
    let tags = workspace.join("tags");
    let mut actions = vec![];
    let mut receipts = vec![];
    let mut replacement_targets = HashSet::new();
    let mut custom_count = 0;
    for assignment in &p.animation_assignments {
        let asset = p
            .animations
            .iter()
            .find(|a| a.id == assignment.asset_id)
            .ok_or_else(|| bad("Assigned animation asset is missing"))?;
        asset.validate()?;
        verify_file(&asset.source_path, &asset.source_sha256)?;
        verify_file(&asset.data_path, &asset.data_sha256)?;
        let target = inspection
            .tags
            .iter()
            .find(|t| {
                t.id == assignment.target_tag_id
                    && t.class == "bipd"
                    && t.path
                        .replace('\\', "/")
                        .eq_ignore_ascii_case(&assignment.target_tag_path.replace('\\', "/"))
            })
            .ok_or_else(|| bad("Animation assignment does not identify an exact source biped"))?;
        if assignment.source_sha256 != source.sha256 || source.sha256 != inspection.sha256 {
            return invalid("Animation target source changed");
        }
        let (_, model) = crate::render::preview_owned_object_model(
            &source.preserved_path,
            &source.sha256,
            inspection,
            target.id,
        )?;
        let rig = model
            .rig
            .as_ref()
            .ok_or_else(|| bad("Assigned biped has no verified skeleton"))?;
        if rig.nodes.len() != asset.node_names.len() || rig.checksum != asset.checksum {
            return invalid("Animation and biped skeleton checksums differ. Re-export using the original biped rig");
        }
        let stem = format!("spark/animations/{}/{}", &p.id[..8], &asset.id[..8]);
        let graph = format!("{stem}/take/take.model_animations");
        let graph_file = tags.join(crate::safe_relative(&graph)?);
        fs::create_dir_all(
            graph_file
                .parent()
                .ok_or_else(|| bad("Graph output directory missing"))?,
        )?;
        let tag = format!("{}.biped", target.path);
        let original = runner
            .run(
                &edit,
                &[
                    "-t".into(),
                    tags.to_string_lossy().into_owned(),
                    "-G".into(),
                    "animation_graph".into(),
                    tag.clone(),
                ],
                workspace,
                "animation-bind",
                46,
            )?
            .trim()
            .to_string();
        if assignment.mode == "replace-graph" {
            if asset.kind != "graph" || !replacement_targets.insert(target.id) {
                return invalid("Choose one complete replacement animation graph per biped");
            }
            fs::copy(&asset.data_path, &graph_file)?;
            if maps::hash_file(&graph_file)? != asset.data_sha256 {
                return invalid("Replacement animation graph copy changed");
            }
        } else {
            if asset.kind != "clip" {
                return invalid("Custom actions require an individual source clip");
            }
            let clip = verified_clip(asset)?;
            let action = format!("gs_action_{}", &asset.id[..8]);
            let data = workspace
                .join("data")
                .join(crate::safe_relative(&format!("{stem}/take/animations"))?);
            fs::create_dir_all(&data)?;
            let extension = asset
                .source_path
                .extension()
                .and_then(|s| s.to_str())
                .filter(|s| ["jma", "jmm", "jmo", "jmr", "jmt", "jmz"].contains(s))
                .unwrap_or("jma");
            project::atomic_write(
                &data.join(format!("{action}.{extension}")),
                jma_source(&clip)?.as_bytes(),
                false,
            )?;
            runner.run(
                &tool,
                &[
                    "-data_dir".into(),
                    "data".into(),
                    "-tags_dir".into(),
                    "tags".into(),
                    "-game_root_dir".into(),
                    ".".into(),
                    "animations".into(),
                    format!("{stem}/take"),
                ],
                workspace,
                "animation-compile",
                47,
            )?;
            if assignment.play_on_take {
                custom_count += 1;
                if custom_count > 1 {
                    return invalid("Select one player custom action per native take");
                }
                if !p
                    .studio
                    .as_ref()
                    .and_then(|s| s.engine_machinima.as_ref())
                    .is_some_and(|m| m.enabled)
                {
                    return invalid(
                        "Enable native camera controls before selecting Play during native take",
                    );
                }
                let spartan = target.references.iter().any(|reference| {
                    reference.label == "Model"
                        && inspection.tags.iter().any(|t| {
                            t.id == reference.target_id
                                && ["characters/cyborg/cyborg", "characters/cyborg_mp/cyborg_mp"]
                                    .contains(
                                        &t.path.replace('\\', "/").to_ascii_lowercase().as_str(),
                                    )
                        })
                });
                if !spartan {
                    return invalid("Automatic take performance currently targets your player Spartan. Other bipeds require authored scenario scripts");
                }
            }
            actions.push(NativeAnimationAction {
                graph: graph
                    .trim_end_matches(".model_animations")
                    .replace('/', "\\"),
                animation: action,
                biped_tag: target.path.clone(),
                play_on_take: assignment.play_on_take,
            });
        }
        let check = runner.run(
            &edit,
            &[
                "-t".into(),
                tags.to_string_lossy().into_owned(),
                "-C".into(),
                "nodes".into(),
                "-G".into(),
                "animations[0].node_list_checksum".into(),
                graph.clone(),
            ],
            workspace,
            "animation-verify",
            48,
        )?;
        let values: Vec<_> = check.lines().map(str::trim).collect();
        if values.len() != 2
            || values[0].parse::<usize>().ok() != Some(rig.nodes.len())
            || values[1].parse::<i64>().ok().map(|n| n as u32) != Some(rig.checksum)
        {
            return invalid("Compiled graph node count or checksum failed readback");
        }
        if assignment.mode == "replace-graph" {
            runner.run(
                &edit,
                &[
                    "-t".into(),
                    tags.to_string_lossy().into_owned(),
                    "-S".into(),
                    "animation_graph".into(),
                    graph.clone(),
                    tag.clone(),
                ],
                workspace,
                "animation-bind",
                49,
            )?;
            let readback = runner.run(
                &edit,
                &[
                    "-t".into(),
                    tags.to_string_lossy().into_owned(),
                    "-G".into(),
                    "animation_graph".into(),
                    tag,
                ],
                workspace,
                "animation-bind",
                49,
            )?;
            if !readback
                .trim()
                .replace('\\', "/")
                .eq_ignore_ascii_case(&graph)
            {
                return invalid("Biped animation graph binding failed readback");
            }
        }
        receipts.push(serde_json::json!({"sourceSha256":asset.source_sha256,"dataSha256":asset.data_sha256,"target":target.path,"mode":assignment.mode,"originalGraph":original,"derivedGraph":graph,"graphSha256":maps::hash_file(&graph_file)?,"runtimeAcceptance":"pending"}));
    }
    project::atomic_write(
        &workspace.join("animation-manifest.json"),
        &serde_json::to_vec_pretty(
            &serde_json::json!({"schemaVersion":1,"changes":receipts,"actions":actions,"preservedSource":true}),
        )?,
        false,
    )?;
    Ok(actions)
}
pub fn import_owned(
    root: &Path,
    path: &Path,
    tools: &crate::build::Toolchain,
    project_id: &str,
    on_event: impl Fn(crate::build::JobEvent) + Send + Sync,
) -> Result<AnimationAsset> {
    let id = uuid::Uuid::new_v4().to_string();
    let cancel = std::sync::atomic::AtomicBool::new(false);
    let runner = crate::build::Runner {
        id: &id,
        project: project_id,
        cancel: &cancel,
        event: &on_event,
    };
    let result = import_source(root, path, tools, &runner);
    match &result {
        Ok(_) => runner.emit(
            "animation-ready",
            "Animation source preserved and validated",
            100,
            "success",
        ),
        Err(e) => runner.emit("animation-failed", e.to_string(), 100, "error"),
    };
    result
}
pub(crate) fn import_source(
    root: &Path,
    path: &Path,
    tools: &crate::build::Toolchain,
    runner: &crate::build::Runner,
) -> Result<AnimationAsset> {
    crate::reject_links(path)?;
    let meta = fs::metadata(path)?;
    if !meta.is_file() || meta.len() > MAX_SOURCE_BYTES {
        return invalid("Choose a regular animation file up to 32 MiB");
    }
    let extension = path
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ![
        "jma",
        "jmm",
        "jmo",
        "jmr",
        "jmt",
        "jmz",
        "fbx",
        "model_animations",
    ]
    .contains(&extension.as_str())
    {
        return invalid(
            "Supported animations: Halo JMA/JMM/JMO/JMR/JMT/JMZ, FBX, or model_animations",
        );
    }
    let name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| valid_name(s))
        .ok_or_else(|| bad("Animation filename is invalid"))?;
    let id = uuid::Uuid::new_v4().to_string();
    let dir = root.join("animations").join(&id);
    crate::reject_links(&dir)?;
    fs::create_dir_all(&dir)?;
    let sha = maps::hash_file(path)?;
    let original = dir.join(format!("source.{extension}"));
    fs::copy(path, &original)?;
    if maps::hash_file(path)? != sha || maps::hash_file(&original)? != sha {
        return invalid("Animation source changed while importing");
    }
    if extension == "model_animations" {
        let edit = crate::build::tool_path(tools, "invader-edit")
            .ok_or_else(|| bad("Configure Invader to inspect an animation graph"))?;
        let graph = dir.join("graph.model_animations");
        fs::copy(&original, &graph)?;
        let run = |args: Vec<String>| runner.run(&edit, &args, &dir, "animation-graph", 30);
        let args = |field: &str, flag: &str| {
            vec![
                "-t".into(),
                dir.to_string_lossy().into_owned(),
                flag.into(),
                field.into(),
                "graph.model_animations".into(),
            ]
        };
        let nodes = run(args("nodes", "-C"))?
            .trim()
            .parse::<usize>()
            .map_err(|_| bad("Animation graph node inventory unavailable"))?;
        let count = run(args("animations", "-C"))?
            .trim()
            .parse::<usize>()
            .map_err(|_| bad("Animation graph clip inventory unavailable"))?;
        if nodes == 0 || nodes > 64 || count == 0 || count > 2048 {
            return invalid("Animation graph exceeds the supported node or clip budget");
        }
        let read_names = |field: &str, count: usize| -> Result<Vec<String>> {
            let mut a = vec!["-t".into(), dir.to_string_lossy().into_owned()];
            for i in 0..count {
                a.extend(["-G".into(), format!("{field}[{i}].name")]);
            }
            a.push("graph.model_animations".into());
            let output = run(a)?;
            let names: Vec<_> = output.lines().map(|s| s.trim().to_string()).collect();
            if names.len() != count {
                return invalid("Animation graph inventory is incomplete");
            }
            Ok(names)
        };
        let names = read_names("nodes", nodes)?;
        let animations = read_names("animations", count)?;
        let checksum = run(args("animations[0].node_list_checksum", "-G"))?
            .trim()
            .parse::<i64>()
            .map_err(|_| bad("Animation graph checksum unavailable"))?
            as u32;
        let asset = AnimationAsset {
            id,
            name: name.into(),
            kind: "graph".into(),
            source_path: original,
            source_sha256: sha,
            data_path: graph.clone(),
            data_sha256: maps::hash_file(&graph)?,
            frame_count: 0,
            fps: 30.,
            checksum,
            node_names: names,
            animation_names: animations,
        };
        asset.validate()?;
        return Ok(asset);
    }
    let source = if extension == "fbx" {
        let tool=crate::conversion::native_tool(tools).ok_or_else(||bad("FBX animation import needs Halo: CE Mod Tools - MCC. Use Prepare installed MCC tools first"))?;
        let jma = dir.join("converted.jma");
        runner.run(
            &tool,
            &[
                "fbx-to-jma".into(),
                original.to_string_lossy().into_owned(),
                jma.to_string_lossy().into_owned(),
            ],
            &dir,
            "animation-fbx",
            25,
        )?;
        crate::reject_links(&jma)?;
        if fs::metadata(&jma)?.len() > MAX_SOURCE_BYTES {
            return invalid("Converted FBX animation exceeds 32 MiB");
        }
        jma
    } else {
        original.clone()
    };
    let clip = parse_jma(&fs::read_to_string(&source)?, name)?;
    let normalized = dir.join("clip.json");
    project::atomic_write(&normalized, &serde_json::to_vec(&clip)?, false)?;
    let asset = AnimationAsset {
        id,
        name: name.into(),
        kind: "clip".into(),
        source_path: original,
        source_sha256: sha,
        data_path: normalized.clone(),
        data_sha256: maps::hash_file(&normalized)?,
        frame_count: clip.frame_count,
        fps: clip.fps,
        checksum: clip.checksum,
        node_names: clip.nodes.iter().map(|n| n.name.clone()).collect(),
        animation_names: vec![clip.name.clone()],
    };
    asset.validate()?;
    Ok(asset)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn source() -> String {
        "16392\n2\n30\n1\nactor\n2\n123\nroot\n-1\n1\narm\n-1\n-1\n0 0 0\n0 0 0 1\n1\n100 0 0\n0 0 0 1\n1\n0 0 0\n0 0 0 1\n1\n200 0 0\n0 0 0 1\n1\n".into()
    }
    #[test]
    fn imports_local_hierarchy_and_converts_centimetres() {
        let c = parse_jma(&source(), "wave").unwrap();
        assert_eq!(c.nodes[1].parent, 0);
        assert_eq!(c.transforms[8], 1.);
        assert_eq!(c.transforms[24], 2.);
        assert_eq!(c.frame_count, 2);
    }
    #[test]
    fn refuses_truncation_cycles_nonfinite_and_excess() {
        let s = source();
        assert!(parse_jma(&s.replace("100 0 0", "NaN 0 0"), "x").is_err());
        assert!(parse_jma(&s.replace("root\n-1\n1", "root\n-1\n0"), "x").is_err());
        assert!(parse_jma(&(s.clone() + "1"), "x").is_err());
        assert!(parse_jma(&s[..s.len() - 8], "x").is_err());
    }
}
