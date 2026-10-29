//! Source-bound BSP audio palette inspection and explicit native-build requests.
use crate::{binary::Reader, invalid, maps, safe_relative, Result, SparkError};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    fs,
    path::Path,
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Dependency {
    pub path: String,
    pub sha256: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Change {
    pub cluster: usize,
    pub background: Option<Dependency>,
    pub environment: Option<Dependency>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub parent_build_id: String,
    pub source_sha256: String,
    pub bsp_index: usize,
    pub bsp_tag: String,
    pub bsp_tag_sha256: String,
    pub changes: Vec<Change>,
}
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Palette {
    pub name: String,
    pub tag_path: Option<String>,
}
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Cluster {
    pub index: usize,
    pub background: Option<usize>,
    pub environment: Option<usize>,
    pub sky: i16,
    pub fog: i16,
    pub weather: i16,
    pub transition_bsp: i16,
    pub bounds: Option<[[f32; 3]; 2]>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bsp {
    pub index: usize,
    pub tag_path: String,
    pub clusters: Vec<Cluster>,
    pub background_palette: Vec<Palette>,
    pub environment_palette: Vec<Palette>,
    pub portal_count: usize,
    pub pvs_sha256: String,
    pub pas_sha256: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Inspection {
    pub source_sha256: String,
    pub bsps: Vec<Bsp>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub parent_build_id: String,
    pub inspection: Inspection,
    pub bsp_tag_hashes: BTreeMap<String, String>,
    pub backgrounds: Vec<Dependency>,
    pub environments: Vec<Dependency>,
}
#[derive(Clone, Copy)]
struct Region {
    begin: usize,
    end: usize,
    base: u32,
}
impl Region {
    fn ptr(self, raw: u32, size: usize) -> Result<usize> {
        let at = raw
            .checked_sub(self.base)
            .and_then(|d| self.begin.checked_add(d as usize))
            .ok_or_else(|| SparkError::Invalid("BSP audio pointer precedes its region".into()))?;
        if at.checked_add(size).is_none_or(|end| end > self.end) {
            return invalid("BSP audio pointer exceeds its region");
        }
        Ok(at)
    }
    fn block(self, r: &Reader, at: usize, stride: usize, max: usize) -> Result<(usize, usize)> {
        let count = r.u32(at)? as usize;
        if count > max {
            return invalid("BSP audio array exceeds its bound");
        }
        if count == 0 {
            return Ok((0, 0));
        }
        Ok((self.ptr(r.u32(at + 4)?, count * stride)?, count))
    }
}
pub fn inspect(path: &Path, expected: &str) -> Result<Inspection> {
    let (header, bytes, sha) = maps::read_cache_snapshot(path)?;
    if sha != expected {
        return invalid("BSP audio source cache changed");
    }
    read(&header, &bytes, sha)
}
fn read(header: &maps::MapHeader, bytes: &[u8], sha: String) -> Result<Inspection> {
    if ![6, 7, 13, 609].contains(&header.version) || header.extended {
        return invalid("BSP audio inspection requires an unextended Halo 1 PC-family cache");
    }
    let r = Reader(bytes);
    let begin = header.tag_offset as usize;
    let end = begin
        .checked_add(header.tag_size as usize)
        .filter(|v| *v <= bytes.len())
        .ok_or_else(|| SparkError::Invalid("BSP audio tag region exceeds the cache".into()))?;
    let base = match header.version {
        6 => 0x4bf10000,
        13 => r
            .u32(begin)?
            .checked_sub(40)
            .ok_or_else(|| SparkError::Invalid("Invalid MCC BSP audio tag base".into()))?,
        _ => 0x40440000,
    };
    let tags = Region { begin, end, base };
    tags.ptr(base, 40)?;
    if r.u32(begin + 36)? != 0x74616773 {
        return invalid("Invalid BSP audio tag index");
    }
    let count = r.u32(begin + 12)? as usize;
    if count > maps::MAX_TAGS {
        return invalid("BSP audio tag index exceeds its limit");
    }
    let table = tags.ptr(r.u32(begin)?, count * 32)?;
    let mut entries = HashMap::new();
    for i in 0..count {
        let at = table + i * 32;
        let name = tags.ptr(r.u32(at + 16)?, 1)?;
        let path = r.string(name, (end - name).min(1024))?;
        if entries
            .insert(
                r.u32(at + 12)?,
                (r.fourcc(at)?, path, r.u32(at + 20)?, r.u32(at + 24)?),
            )
            .is_some()
        {
            return invalid("Duplicate BSP audio tag ID");
        }
    }
    let scenario = entries
        .get(&r.u32(begin + 4)?)
        .filter(|e| e.0 == "scnr" && e.3 == 0)
        .ok_or_else(|| SparkError::Invalid("BSP audio scenario is absent or external".into()))?;
    let sc = tags.ptr(scenario.2, 0x5b0)?;
    let (refs, bsp_count) = tags.block(&r, sc + 0x5a4, 32, 16)?;
    let dependency = |at: usize, class: &str| -> Result<Option<String>> {
        let id = r.u32(at + 12)?;
        if id == u32::MAX {
            return Ok(None);
        }
        let tag = entries
            .get(&id)
            .ok_or_else(|| SparkError::Invalid("BSP audio dependency ID is missing".into()))?;
        if r.fourcc(at)? != class || tag.0 != class {
            return invalid("BSP audio dependency class differs from its index entry");
        }
        Ok(Some(tag.1.clone()))
    };
    let mut bsps = vec![];
    let (mut total_clusters, mut total_subclusters) = (0, 0);
    for index in 0..bsp_count {
        let row = refs + index * 32;
        let path = dependency(row + 16, "sbsp")?
            .ok_or_else(|| SparkError::Invalid("Scenario BSP audio reference is null".into()))?;
        let bsp_begin = r.u32(row)? as usize;
        let size = r.u32(row + 4)? as usize;
        if bsp_begin < 2048 || !(648..=128 * 1024 * 1024).contains(&size) {
            return invalid("Invalid BSP audio region size");
        }
        r.bytes(bsp_begin, size)?;
        let space = Region {
            begin: bsp_begin,
            end: bsp_begin + size,
            base: r.u32(row + 8)?,
        };
        let root = space.ptr(r.u32(bsp_begin)?, 648)?;
        let palette = |at: usize, stride: usize, class: &str| -> Result<Vec<Palette>> {
            let (start, count) = space.block(&r, at, stride, 64)?;
            let mut result = vec![];
            for i in 0..count {
                let at = start + i * stride;
                result.push(Palette {
                    name: r.string(at, 32)?,
                    tag_path: dependency(at + 32, class)?,
                });
            }
            Ok(result)
        };
        let background_palette = palette(root + 0x1fc, 116, "lsnd")?;
        let environment_palette = palette(root + 0x208, 80, "snde")?;
        let (at, count) = space.block(&r, root + 0x134, 104, 8192)?;
        total_clusters += count;
        if total_clusters > 8192 {
            return invalid("BSP audio inspection exceeds 8192 total clusters");
        }
        let selected = |value: u16, max: usize| -> Result<Option<usize>> {
            if value == u16::MAX {
                return Ok(None);
            }
            if value as usize >= max {
                return invalid("BSP audio cluster references a missing palette entry");
            }
            Ok(Some(value as usize))
        };
        let mut clusters = vec![];
        for i in 0..count {
            let c = at + i * 104;
            let (sub, n) = space.block(&r, c + 52, 36, 4096)?;
            total_subclusters += n;
            if total_subclusters > 131072 {
                return invalid("BSP audio inspection exceeds its subcluster bound");
            }
            let mut bounds: Option<[[f32; 3]; 2]> = None;
            for j in 0..n {
                let p = sub + j * 36;
                let low = [r.f32(p)?, r.f32(p + 8)?, r.f32(p + 16)?];
                let high = [r.f32(p + 4)?, r.f32(p + 12)?, r.f32(p + 20)?];
                if (0..3).any(|a| low[a] > high[a] || low[a].abs() > 1e6 || high[a].abs() > 1e6) {
                    return invalid("Invalid BSP audio subcluster bounds");
                }
                bounds = Some(match bounds {
                    None => [low, high],
                    Some([old_low, old_high]) => [
                        std::array::from_fn(|a| low[a].min(old_low[a])),
                        std::array::from_fn(|a| high[a].max(old_high[a])),
                    ],
                });
            }
            clusters.push(Cluster {
                index: i,
                background: selected(r.u16(c + 4)?, background_palette.len())?,
                environment: selected(r.u16(c + 6)?, environment_palette.len())?,
                sky: r.u16(c)? as i16,
                fog: r.u16(c + 2)? as i16,
                weather: r.u16(c + 8)? as i16,
                transition_bsp: r.u16(c + 10)? as i16,
                bounds,
            });
        }
        let data_hash = |at: usize| -> Result<String> {
            let size = r.u32(at)? as usize;
            if size > 16 * 1024 * 1024 {
                return invalid("BSP audio visibility/audibility data exceeds 16 MiB");
            }
            let data = if size == 0 {
                &[][..]
            } else {
                r.bytes(space.ptr(r.u32(at + 12)?, size)?, size)?
            };
            Ok(format!("{:x}", Sha256::digest(data)))
        };
        let portal_count = r.u32(root + 0x154)? as usize;
        if portal_count > 65536 {
            return invalid("BSP portal count exceeds the inspection bound");
        }
        bsps.push(Bsp {
            index,
            tag_path: path,
            clusters,
            background_palette,
            environment_palette,
            portal_count,
            pvs_sha256: data_hash(root + 0x140)?,
            pas_sha256: data_hash(root + 0x214)?,
        });
    }
    Ok(Inspection {
        source_sha256: sha,
        bsps,
    })
}

pub fn relative(path: &str, extension: &str) -> Result<std::path::PathBuf> {
    if path.len() > 240
        || !path
            .to_ascii_lowercase()
            .ends_with(&format!(".{extension}"))
    {
        return invalid("BSP audio tag path has the wrong extension or length");
    }
    safe_relative(&path.replace('\\', "/"))
}
pub fn file_hash(root: &Path, path: &str, extension: &str) -> Result<String> {
    let path = root.join(relative(path, extension)?);
    crate::reject_links(&path)?;
    if !path.is_file() || !(64..=128 * 1024 * 1024).contains(&fs::metadata(&path)?.len()) {
        return invalid("BSP audio dependency is missing, truncated or too large");
    }
    use std::io::Read;
    let mut header = [0; 64];
    fs::File::open(&path)?.read_exact(&mut header)?;
    let class = match extension {
        "sound_looping" => b"lsnd",
        "sound_environment" => b"snde",
        "scenario_structure_bsp" => b"sbsp",
        _ => return invalid("Unsupported BSP audio tag class"),
    };
    if &header[36..40] != class || &header[60..64] != b"blam" {
        return invalid("BSP audio editable tag header has the wrong class or signature");
    }
    maps::hash_file(&path)
}
pub fn inspect_workspace(
    parent_id: &str,
    path: &Path,
    expected: &str,
    tags: &Path,
) -> Result<Workspace> {
    let inspection = inspect(path, expected)?;
    let mut bsp_tag_hashes = BTreeMap::new();
    for bsp in &inspection.bsps {
        let name = format!("{}.scenario_structure_bsp", bsp.tag_path);
        bsp_tag_hashes.insert(
            name.clone(),
            file_hash(tags, &name, "scenario_structure_bsp")?,
        );
    }
    let mut stack = vec![(tags.to_path_buf(), 0)];
    let (mut entries, mut backgrounds, mut environments) = (0, vec![], vec![]);
    while let Some((folder, depth)) = stack.pop() {
        if depth > 32 {
            return invalid("BSP audio tag inventory is too deep");
        }
        for entry in fs::read_dir(folder)? {
            entries += 1;
            if entries > 200000 {
                return invalid("BSP audio inventory exceeds 200000 entries");
            }
            let entry = entry?;
            let path = entry.path();
            crate::reject_links(&path)?;
            if entry.file_type()?.is_dir() {
                stack.push((path, depth + 1));
                continue;
            }
            let extension = path.extension().and_then(|v| v.to_str()).unwrap_or("");
            if !["sound_looping", "sound_environment"].contains(&extension) {
                continue;
            }
            if backgrounds.len() + environments.len() >= 4096 {
                return invalid("BSP audio inventory exceeds 4096 sound tags");
            }
            let name = path
                .strip_prefix(tags)
                .map_err(|_| SparkError::Invalid("BSP audio inventory escaped its root".into()))?
                .to_string_lossy()
                .replace('\\', "/");
            let item = Dependency {
                sha256: file_hash(tags, &name, extension)?,
                path: name,
            };
            if extension == "sound_looping" {
                backgrounds.push(item);
            } else {
                environments.push(item);
            }
        }
    }
    backgrounds.sort_by(|a, b| a.path.cmp(&b.path));
    environments.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(Workspace {
        parent_build_id: parent_id.into(),
        inspection,
        bsp_tag_hashes,
        backgrounds,
        environments,
    })
}
pub fn validate(
    request: &Request,
    parent_id: &str,
    source: &Inspection,
    tags: &Path,
) -> Result<()> {
    if request.parent_build_id != parent_id
        || request.source_sha256 != source.source_sha256
        || request.changes.is_empty()
        || request.changes.len() > 256
    {
        return invalid("BSP audio request is stale or exceeds 256 cluster changes");
    }
    let bsp = source
        .bsps
        .get(request.bsp_index)
        .ok_or_else(|| SparkError::Invalid("BSP audio selection is absent".into()))?;
    if relative(&request.bsp_tag, "scenario_structure_bsp")?
        != relative(
            &format!("{}.scenario_structure_bsp", bsp.tag_path),
            "scenario_structure_bsp",
        )?
        || file_hash(tags, &request.bsp_tag, "scenario_structure_bsp")? != request.bsp_tag_sha256
    {
        return invalid("Working BSP changed after audio inspection; refresh before rebuilding");
    }
    let mut seen = BTreeSet::new();
    for change in &request.changes {
        if change.cluster >= bsp.clusters.len() || !seen.insert(change.cluster) {
            return invalid("BSP audio cluster selection is missing or duplicated");
        }
        for (item, extension) in [
            (&change.background, "sound_looping"),
            (&change.environment, "sound_environment"),
        ] {
            if let Some(item) = item {
                if item.sha256.len() != 64 || file_hash(tags, &item.path, extension)? != item.sha256
                {
                    return invalid("BSP audio dependency changed after inspection");
                }
            }
        }
    }
    Ok(())
}
pub fn normalize(path: &str) -> String {
    path.replace('\\', "/").to_ascii_lowercase()
}
pub fn verify_output(before: &Inspection, after: &Inspection, request: &Request) -> Result<()> {
    if before.bsps.len() != after.bsps.len() {
        return invalid("BSP audio rebuild changed the BSP count");
    }
    for (old, new) in before.bsps.iter().zip(&after.bsps) {
        if normalize(&old.tag_path) != normalize(&new.tag_path)
            || old.clusters.len() != new.clusters.len()
            || old.portal_count != new.portal_count
            || old.pvs_sha256 != new.pvs_sha256
            || old.pas_sha256 != new.pas_sha256
        {
            return invalid("BSP audio rebuild changed BSP topology or visibility/audibility data");
        }
        for (a, b) in old.clusters.iter().zip(&new.clusters) {
            if (a.index, a.sky, a.fog, a.weather, a.transition_bsp, a.bounds)
                != (b.index, b.sky, b.fog, b.weather, b.transition_bsp, b.bounds)
            {
                return invalid("BSP audio rebuild changed non-audio cluster properties");
            }
            let path = |palette: &[Palette], index: Option<usize>| {
                index
                    .and_then(|i| palette[i].tag_path.as_deref())
                    .map(normalize)
            };
            let change = request
                .changes
                .iter()
                .find(|c| old.index == request.bsp_index && c.cluster == a.index);
            let expected_bg = change
                .map(|c| {
                    c.background.as_ref().map(|d| {
                        normalize(d.path.strip_suffix(".sound_looping").unwrap_or(&d.path))
                    })
                })
                .unwrap_or_else(|| path(&old.background_palette, a.background));
            let expected_env = change
                .map(|c| {
                    c.environment.as_ref().map(|d| {
                        normalize(d.path.strip_suffix(".sound_environment").unwrap_or(&d.path))
                    })
                })
                .unwrap_or_else(|| path(&old.environment_palette, a.environment));
            if expected_bg != path(&new.background_palette, b.background)
                || expected_env != path(&new.environment_palette, b.environment)
            {
                return invalid(
                    "Compiled BSP audio assignment differs from the requested cluster binding",
                );
            }
        }
    }
    Ok(())
}

fn indices(output: &str, count: usize) -> Result<Vec<Option<usize>>> {
    let rows: Vec<_> = output
        .lines()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();
    if rows.len() != count {
        return invalid("Native BSP audio index count differs from the source cache");
    }
    rows.into_iter()
        .map(|s| {
            let value = s.parse::<i64>().map_err(|_| {
                SparkError::Invalid("Native BSP audio index was not an integer".into())
            })?;
            match value {
                -1 | 65535 => Ok(None),
                0..=32767 => Ok(Some(value as usize)),
                _ => invalid("Native BSP audio index is out of range"),
            }
        })
        .collect()
}
/// Changes only a fresh job's copied BSP. The source tag tree remains hash-pinned by working_tags.
pub(crate) fn apply(
    request: &Request,
    source: &Inspection,
    tags: &Path,
    edit: &Path,
    runner: &crate::build::Runner,
    workspace: &Path,
) -> Result<()> {
    validate(request, &request.parent_build_id, source, tags)?;
    let bsp = &source.bsps[request.bsp_index];
    if file_hash(tags, &request.bsp_tag, "scenario_structure_bsp")? != request.bsp_tag_sha256 {
        return invalid("Copied BSP differs from the inspected audio input");
    }
    for c in &request.changes {
        for (d, ext) in [
            (&c.background, "sound_looping"),
            (&c.environment, "sound_environment"),
        ] {
            if let Some(d) = d {
                if file_hash(tags, &d.path, ext)? != d.sha256 {
                    return invalid("Copied BSP audio dependency changed");
                }
            }
        }
    }
    let invoke = |mut args: Vec<String>| -> Result<String> {
        let mut prefix = vec!["-t".into(), tags.to_string_lossy().into_owned()];
        prefix.append(&mut args);
        prefix.push(request.bsp_tag.clone());
        runner.run(edit, &prefix, workspace, "bsp-audio", 45)
    };
    let query = |name: &str| invoke(vec!["-G".into(), name.into()]);
    let count = |name: &str| -> Result<usize> {
        let text = invoke(vec!["-C".into(), name.into()])?;
        text.trim().parse().map_err(|_| {
            SparkError::Invalid("Native BSP audio array count was not an integer".into())
        })
    };
    let fields = [
        (
            "background_sound_palette",
            "background_sound",
            "sound_looping",
            &bsp.background_palette,
        ),
        (
            "sound_environment_palette",
            "sound_environment",
            "sound_environment",
            &bsp.environment_palette,
        ),
    ];
    if count("clusters")? != bsp.clusters.len() {
        return invalid("Working BSP cluster count differs from the inspected cache; rebuild/open working tags first");
    }
    let mut desired: Vec<Vec<Option<String>>> = vec![];
    for (palette, field, extension, original) in fields {
        if count(palette)? != original.len() {
            return invalid("Working BSP audio palette differs from the inspected cache; rebuild/open working tags first");
        }
        if !original.is_empty() {
            let text = query(&format!("{palette}[*].{field}"))?;
            let actual: Vec<_> = text
                .lines()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .collect();
            if actual.len() != original.len() {
                return invalid("Native BSP audio palette dependency count is invalid");
            }
            for (actual, expected) in actual.iter().zip(original) {
                let expected = expected
                    .tag_path
                    .as_ref()
                    .map(|p| normalize(&format!("{p}.{extension}")));
                let actual = if ["null", "(null)"].contains(&actual.to_ascii_lowercase().as_str()) {
                    None
                } else {
                    Some(normalize(actual))
                };
                if actual != expected {
                    return invalid("Working BSP audio dependency differs from the inspected cache; rebuild/open working tags first");
                }
            }
        }
        let original_indices: Vec<_> = bsp
            .clusters
            .iter()
            .map(|c| {
                if field == "background_sound" {
                    c.background
                } else {
                    c.environment
                }
            })
            .collect();
        if indices(&query(&format!("clusters[*].{field}"))?, bsp.clusters.len())?
            != original_indices
        {
            return invalid("Working BSP cluster audio differs from the inspected cache; rebuild/open working tags first");
        }
        let mut paths: Vec<_> = original
            .iter()
            .map(|p| p.tag_path.as_ref().map(|p| format!("{p}.{extension}")))
            .collect();
        for change in &request.changes {
            let dependency = if field == "background_sound" {
                &change.background
            } else {
                &change.environment
            };
            if let Some(d) = dependency {
                if !paths
                    .iter()
                    .flatten()
                    .any(|p| normalize(p) == normalize(&d.path))
                {
                    paths.push(Some(d.path.clone()));
                }
            }
        }
        if paths.len() > 64 {
            return invalid("BSP audio palette would exceed 64 entries");
        }
        desired.push(paths);
    }
    // Both complete palettes are checked before the first mutation.
    for ((palette, field, _, original), paths) in fields.into_iter().zip(&desired) {
        for (index, path) in paths.iter().enumerate().skip(original.len()) {
            invoke(vec![
                "-I".into(),
                palette.into(),
                "1".into(),
                "end".into(),
                "-S".into(),
                format!("{palette}[{index}].name"),
                format!("Spark audio {index}"),
                "-S".into(),
                format!("{palette}[{index}].{field}"),
                path.clone().unwrap(),
            ])?;
        }
    }
    for batch in request.changes.chunks(32) {
        let mut args = vec![];
        for change in batch {
            for (which, dependency, field) in [
                (0, &change.background, "background_sound"),
                (1, &change.environment, "sound_environment"),
            ] {
                let index = dependency
                    .as_ref()
                    .map(|d| {
                        desired[which]
                            .iter()
                            .position(|p| {
                                p.as_ref()
                                    .is_some_and(|p| normalize(p) == normalize(&d.path))
                            })
                            .unwrap()
                            .to_string()
                    })
                    .unwrap_or_else(|| "-1".into());
                args.extend([
                    "-S".into(),
                    format!("clusters[{}].{field}", change.cluster),
                    index,
                ]);
            }
        }
        invoke(args)?;
    }
    for (which, (_, field, _, _)) in fields.iter().enumerate() {
        let values = indices(&query(&format!("clusters[*].{field}"))?, bsp.clusters.len())?;
        for (cluster, value) in bsp.clusters.iter().zip(values) {
            let change = request.changes.iter().find(|c| c.cluster == cluster.index);
            let expected = if let Some(c) = change {
                let d = if which == 0 {
                    &c.background
                } else {
                    &c.environment
                };
                d.as_ref().map(|d| {
                    desired[which]
                        .iter()
                        .position(|p| {
                            p.as_ref()
                                .is_some_and(|p| normalize(p) == normalize(&d.path))
                        })
                        .unwrap()
                })
            } else if which == 0 {
                cluster.background
            } else {
                cluster.environment
            };
            if value != expected {
                return invalid(
                    "Native BSP audio field readback differs from the requested values",
                );
            }
        }
    }
    runner.emit("bsp-audio","BSP audio palette and all cluster index fields read back; native cache verification follows",48,"info");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn word(bytes: &mut [u8], at: usize, value: u32) {
        bytes[at..at + 4].copy_from_slice(&value.to_le_bytes());
    }
    fn half(bytes: &mut [u8], at: usize, value: u16) {
        bytes[at..at + 2].copy_from_slice(&value.to_le_bytes());
    }
    fn fixture(version: u32) -> (maps::MapHeader, Vec<u8>) {
        let mut b = vec![0; 0x4000];
        let base = if version == 6 { 0x4bf10000 } else { 0x40440000 };
        let tag = |at: u32| base + at - 0x100;
        let bsp = |at: u32| 0x60000000 + at - 0x2000;
        word(&mut b, 0x100, base + 40);
        word(&mut b, 0x104, 1);
        word(&mut b, 0x10c, 4);
        word(&mut b, 0x124, 0x74616773);
        for (i, class, name) in [
            (0, b"rncs", b"levels/test/world\0".as_slice()),
            (1, b"psbs", b"levels/test/world\0".as_slice()),
            (2, b"dnsl", b"sound/wind\0".as_slice()),
            (3, b"edns", b"sound/room\0".as_slice()),
        ] {
            let at = 0x128 + i * 32;
            b[at..at + 4].copy_from_slice(class);
            word(&mut b, at + 12, i as u32 + 1);
            word(&mut b, at + 16, tag(0x240 + i as u32 * 40));
            b[0x240 + i * 40..0x240 + i * 40 + name.len()].copy_from_slice(name);
        }
        word(&mut b, 0x128 + 20, tag(0x400));
        word(&mut b, 0x400 + 0x5a4, 1);
        word(&mut b, 0x400 + 0x5a8, tag(0xb00));
        word(&mut b, 0xb00, 0x2000);
        word(&mut b, 0xb04, 0x2000);
        word(&mut b, 0xb08, 0x60000000);
        b[0xb10..0xb14].copy_from_slice(b"psbs");
        word(&mut b, 0xb1c, 2);
        word(&mut b, 0x2000, bsp(0x2020));
        for (at, count, pointer) in [
            (0x2020 + 0x134, 2, 0x2500),
            (0x2020 + 0x1fc, 1, 0x2300),
            (0x2020 + 0x208, 1, 0x2400),
            (0x2500 + 52, 1, 0x2700),
        ] {
            word(&mut b, at, count);
            word(&mut b, at + 4, bsp(pointer));
        }
        b[0x2300..0x2305].copy_from_slice(b"Wind\0");
        b[0x2320..0x2324].copy_from_slice(b"dnsl");
        word(&mut b, 0x232c, 3);
        b[0x2400..0x2405].copy_from_slice(b"Room\0");
        b[0x2420..0x2424].copy_from_slice(b"edns");
        word(&mut b, 0x242c, 4);
        for c in [0x2500, 0x2500 + 104] {
            half(&mut b, c + 2, u16::MAX);
            half(&mut b, c + 8, u16::MAX);
        }
        half(&mut b, 0x2500 + 104 + 4, u16::MAX);
        half(&mut b, 0x2500 + 104 + 6, u16::MAX);
        for (i, f) in [-1f32, 1., -2., 2., -3., 3.].iter().enumerate() {
            word(&mut b, 0x2700 + i * 4, f.to_bits());
        }
        for (at, p) in [(0x2020 + 0x140, 0x2800), (0x2020 + 0x214, 0x2810)] {
            word(&mut b, at, 4);
            word(&mut b, at + 12, bsp(p));
            b[p as usize..p as usize + 4].copy_from_slice(&(p as u32).to_le_bytes());
        }
        (
            maps::MapHeader {
                version,
                engine: "synthetic".into(),
                name: "test".into(),
                build: "synthetic parser fixture".into(),
                file_size: b.len() as u64,
                declared_size: b.len() as u32,
                tag_offset: 0x100,
                tag_size: 0x1800,
                scenario_type: 1,
                crc32: 0,
                flags: 0,
                demo_layout: version == 6,
                compressed: false,
                extended: false,
                legacy_tag_size_repair: false,
            },
            b,
        )
    }
    #[test]
    fn reads_exact_palette_references_clusters_bounds_and_visibility_across_pc_families() {
        for version in [6, 7, 13, 609] {
            let (h, b) = fixture(version);
            let report = read(&h, &b, "a".repeat(64)).unwrap();
            let bsp = &report.bsps[0];
            assert_eq!(bsp.clusters.len(), 2);
            assert_eq!(
                bsp.clusters[0].bounds,
                Some([[-1., -2., -3.], [1., 2., 3.]])
            );
            assert_eq!(bsp.clusters[0].background, Some(0));
            assert_eq!(bsp.clusters[1].background, None);
            assert_eq!(
                bsp.background_palette[0].tag_path.as_deref(),
                Some("sound/wind")
            );
            assert_eq!(
                bsp.environment_palette[0].tag_path.as_deref(),
                Some("sound/room")
            );
            assert_ne!(bsp.pvs_sha256, bsp.pas_sha256);
        }
    }
    #[test]
    fn malformed_counts_references_classes_and_region_escapes_never_pass() {
        let (h, good) = fixture(13);
        for (at, value) in [
            (0x10c, (maps::MAX_TAGS + 1) as u32),
            (0x128 + 32 + 12, 1),
            (0x232c, 99),
            (0x2020 + 0x134, 8193),
            (0x2020 + 0x1fc, 65),
            (0x2500 + 52, 4097),
            (0x2020 + 0x140 + 12, 0x5fffffff),
            (0xb04, 128 * 1024 * 1024 + 1),
            (0x128 + 20, 0x4043ffff),
        ] {
            let mut b = good.clone();
            word(&mut b, at, value);
            assert!(
                read(&h, &b, "a".repeat(64)).is_err(),
                "accepted invalid field at {at:x}"
            );
        }
        let mut b = good.clone();
        b[0x2320..0x2324].copy_from_slice(b"paew");
        assert!(read(&h, &b, "a".repeat(64)).is_err());
        let mut b = good.clone();
        half(&mut b, 0x2500 + 4, 1);
        assert!(read(&h, &b, "a".repeat(64)).is_err());
        let mut b = good;
        word(&mut b, 0x2700, f32::NAN.to_bits());
        assert!(read(&h, &b, "a".repeat(64)).is_err());
    }
    #[test]
    fn null_dependencies_and_no_palettes_remain_explicit() {
        let (h, mut b) = fixture(7);
        word(&mut b, 0x232c, u32::MAX);
        assert!(
            read(&h, &b, "a".repeat(64)).unwrap().bsps[0].background_palette[0]
                .tag_path
                .is_none()
        );
        word(&mut b, 0x2020 + 0x1fc, 0);
        half(&mut b, 0x2500 + 4, u16::MAX);
        assert!(read(&h, &b, "a".repeat(64)).unwrap().bsps[0]
            .background_palette
            .is_empty());
    }
    fn source_tag(root: &Path, path: &str, class: &[u8; 4]) -> Dependency {
        let file = root.join(path);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        let mut bytes = vec![0; 128];
        bytes[36..40].copy_from_slice(class);
        bytes[60..64].copy_from_slice(b"blam");
        fs::write(&file, bytes).unwrap();
        Dependency {
            path: path.into(),
            sha256: maps::hash_file(&file).unwrap(),
        }
    }
    #[test]
    fn stale_file_dependency_parent_duplicate_cluster_and_path_requests_are_refused() {
        let root = tempfile::tempdir().unwrap();
        let (h, b) = fixture(13);
        let snapshot = read(&h, &b, "a".repeat(64)).unwrap();
        let tag = source_tag(
            root.path(),
            "levels/test/world.scenario_structure_bsp",
            b"sbsp",
        );
        let bg = source_tag(root.path(), "sound/new.sound_looping", b"lsnd");
        let request = Request {
            parent_build_id: "parent".into(),
            source_sha256: snapshot.source_sha256.clone(),
            bsp_index: 0,
            bsp_tag: tag.path,
            bsp_tag_sha256: tag.sha256,
            changes: vec![Change {
                cluster: 0,
                background: Some(bg),
                environment: None,
            }],
        };
        validate(&request, "parent", &snapshot, root.path()).unwrap();
        assert!(validate(&request, "other", &snapshot, root.path()).is_err());
        let mut changed = request.clone();
        changed.changes.push(changed.changes[0].clone());
        assert!(validate(&changed, "parent", &snapshot, root.path()).is_err());
        let mut changed = request.clone();
        changed.changes[0].cluster = 2;
        assert!(validate(&changed, "parent", &snapshot, root.path()).is_err());
        let mut changed = request.clone();
        changed.bsp_tag = "../world.scenario_structure_bsp".into();
        assert!(validate(&changed, "parent", &snapshot, root.path()).is_err());
        fs::write(root.path().join("sound/new.sound_looping"), b"changed").unwrap();
        assert!(validate(&request, "parent", &snapshot, root.path()).is_err());
    }
    #[test]
    fn compiled_readback_checks_requested_bindings_and_keeps_other_cluster_and_pvs_fields() {
        let (h, b) = fixture(13);
        let before = read(&h, &b, "a".repeat(64)).unwrap();
        let mut after = before.clone();
        after.bsps[0].background_palette.push(Palette {
            name: "New".into(),
            tag_path: Some("sound/new".into()),
        });
        after.bsps[0].clusters[0].background = Some(1);
        after.bsps[0].clusters[0].environment = None;
        let request = Request {
            parent_build_id: "parent".into(),
            source_sha256: before.source_sha256.clone(),
            bsp_index: 0,
            bsp_tag: "levels/test/world.scenario_structure_bsp".into(),
            bsp_tag_sha256: "b".repeat(64),
            changes: vec![Change {
                cluster: 0,
                background: Some(Dependency {
                    path: "sound/new.sound_looping".into(),
                    sha256: "c".repeat(64),
                }),
                environment: None,
            }],
        };
        verify_output(&before, &after, &request).unwrap();
        let mut wrong = after.clone();
        wrong.bsps[0].clusters[1].fog = 0;
        assert!(verify_output(&before, &wrong, &request).is_err());
        let mut wrong = after.clone();
        wrong.bsps[0].pvs_sha256 = "changed".into();
        assert!(verify_output(&before, &wrong, &request).is_err());
        after.bsps[0].clusters[0].background = Some(0);
        assert!(verify_output(&before, &after, &request).is_err());
    }
    #[test]
    fn native_index_readback_rejects_nonintegers_wrong_counts_and_invalid_sentinels() {
        assert_eq!(indices("0\n65535\n-1\n", 3).unwrap(), [Some(0), None, None]);
        for (s, n) in [("0\n", 2), ("-2\n", 1), ("true\n", 1), ("999999\n", 1)] {
            assert!(indices(s, n).is_err());
        }
    }
}
