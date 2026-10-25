//! Original, bounds-checked cache reader. Format references are recorded in docs/RESEARCH.md.
//! Known field offsets are deliberately a small audited subset, never guessed from tag names.
use crate::{binary::Reader, invalid, Result, SparkError};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::Path,
};

pub const MAX_CACHE_BYTES: u64 = 768 * 1024 * 1024;
pub const MAX_TAGS: usize = 65_535;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub severity: String,
    pub code: String,
    pub message: String,
}
impl Diagnostic {
    pub fn warning(code: &str, message: impl Into<String>) -> Self {
        Self {
            severity: "warning".into(),
            code: code.into(),
            message: message.into(),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapHeader {
    pub version: u32,
    pub engine: String,
    pub name: String,
    pub build: String,
    pub scenario_type: u16,
    pub file_size: u64,
    pub declared_size: u32,
    pub tag_offset: u32,
    pub tag_size: u32,
    pub crc32: u32,
    pub flags: u16,
    pub demo_layout: bool,
    pub compressed: bool,
    pub extended: bool,
    pub legacy_tag_size_repair: bool,
}
pub fn parse_header(bytes: &[u8], actual_size: u64) -> Result<MapHeader> {
    if actual_size < 2048 {
        return invalid("Not a Halo cache: the file is smaller than the 2048-byte header");
    }
    let r = Reader(bytes);
    r.bytes(0, 2048)?;
    // FourCCs are stored as little-endian integers, so disk bytes are reversed.
    let demo = r.u32(0x2c0)? == 0x45686564 && r.u32(0x5f0)? == 0x47666f74;
    if !demo && (r.u32(0)? != 0x68656164 || r.u32(0x7fc)? != 0x666f6f74) {
        return invalid("Unrecognized cache signatures. Expected daeh/toof, or the reordered Halo Demo header. Resource caches (bitmaps/sounds/loc), archives, and Saber-compressed files are not scenario maps.");
    }
    let version = r.u32(if demo { 0x588 } else { 4 })?;
    let engine = match version {
        5 => "Halo Xbox",
        6 => "Halo Demo / Trial",
        7 => "Halo PC / Mac / HaloMD",
        13 => "Halo MCC — Halo 1",
        609 => "Halo Custom Edition",
        _ => {
            return invalid(format!(
            "Unsupported Halo cache version {version}; this reader recognizes 5, 6, 7, 13 and 609"
        ))
        }
    };
    if demo && version != 6 {
        return invalid("The Demo header signature conflicts with its cache version");
    }
    if !demo && version == 6 {
        return invalid(
            "Version 6 without the reordered Demo header is not a supported Demo cache",
        );
    }
    let declared = r.u32(if demo { 0x5e8 } else { 8 })?;
    let compressed = version == 5 && declared as u64 > actual_size;
    let tag_offset = r.u32(if demo { 0x5ec } else { 0x10 })?;
    let mut tag_size = r.u32(if demo { 0x2c4 } else { 0x14 })?;
    // Some historical Demo-to-PC/Pearl exports wrote whole-file length into
    // this field. Recognize only that exact self-consistent signature; every
    // pointer and BSP is still checked against the actual remaining bytes.
    let legacy_tag_size_repair = version == 7
        && declared as u64 == actual_size
        && tag_size == declared
        && tag_offset >= 2048
        && tag_offset < declared;
    if legacy_tag_size_repair {
        tag_size = declared - tag_offset;
    }
    let logical_size = if compressed {
        declared as u64
    } else {
        actual_size
    };
    if tag_offset < 2048
        || tag_size < (if version == 5 { 0x24 } else { 0x28 })
        || tag_size > 128 * 1024 * 1024
        || tag_offset as u64 + tag_size as u64 > logical_size
    {
        return invalid(format!("Tag region 0x{tag_offset:X} + 0x{tag_size:X} is outside this {logical_size}-byte cache; it may be compressed, truncated, extended or protected"));
    }
    let scenario_type = r.u16(if demo { 2 } else { 0x60 })?;
    if scenario_type > 2 {
        return invalid(format!("Invalid scenario type {scenario_type}"));
    }
    let name = r.string(if demo { 0x58c } else { 0x20 }, 32)?;
    if name.is_empty() {
        return invalid("Cache scenario name is empty");
    }
    let extended = bytes.windows(4).any(|w| w == b"yelo" || w == b"oley");
    Ok(MapHeader {
        version,
        engine: engine.into(),
        name,
        build: r.string(if demo { 0x2c8 } else { 0x40 }, 32)?,
        scenario_type,
        file_size: actual_size,
        declared_size: declared,
        tag_offset,
        tag_size,
        crc32: r.u32(if demo { 0x5b0 } else { 0x64 })?,
        flags: if version == 13 { r.u16(0x68)? } else { 0 },
        demo_layout: demo,
        compressed,
        extended,
        legacy_tag_size_repair,
    })
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagField {
    pub key: String,
    pub label: String,
    pub offset: usize,
    pub kind: String,
    pub value: serde_json::Value,
    pub min: f64,
    pub max: f64,
    pub unit: String,
    pub target_class: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagReference {
    pub label: String,
    pub target_id: u32,
    pub class: String,
    pub offset: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: u32,
    pub index: usize,
    pub class: String,
    pub path: String,
    pub data_offset: Option<usize>,
    pub external: bool,
    pub fields: Vec<TagField>,
    pub references: Vec<TagReference>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SceneObject {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub tag_id: Option<u32>,
    pub position: [f32; 3],
    pub rotation: [f32; 3],
    pub scale: [f32; 3],
    pub visible: bool,
    pub source_offset: Option<usize>,
    pub rotation_offset: Option<usize>,
    pub asset_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshPart {
    pub name: String,
    pub index_start: usize,
    pub index_count: usize,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshData {
    pub positions: Vec<f32>,
    pub indices: Vec<u32>,
    pub label: String,
    pub source: String,
    #[serde(default)]
    pub parts: Vec<MeshPart>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Encounter {
    pub name: String,
    pub squads: Vec<String>,
    pub team: u16,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Script {
    pub name: String,
    pub script_type: u16,
    pub return_type: u16,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Resource {
    pub name: String,
    pub required: bool,
    pub found: bool,
    pub reason: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapInspection {
    pub header: MapHeader,
    pub sha256: String,
    pub tags: Vec<Tag>,
    pub objects: Vec<SceneObject>,
    pub mesh: MeshData,
    pub encounters: Vec<Encounter>,
    pub scripts: Vec<Script>,
    pub resources: Vec<Resource>,
    pub diagnostics: Vec<Diagnostic>,
    pub scenario_path: String,
}

pub fn hash_file(path: &Path) -> Result<String> {
    let mut f = File::open(path)?;
    let mut hash = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hash.update(&buf[..n]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
pub fn inspect_header(path: &Path) -> Result<MapHeader> {
    let mut f = File::open(path)?;
    let size = f.metadata()?.len();
    let mut b = [0; 2048];
    f.read_exact(&mut b)
        .map_err(|_| SparkError::Invalid("Map is shorter than its header".into()))?;
    parse_header(&b, size)
}

pub fn read_cache(path: &Path) -> Result<(MapHeader, Vec<u8>)> {
    let header = inspect_header(path)?;
    if header.file_size > MAX_CACHE_BYTES || header.declared_size as u64 > MAX_CACHE_BYTES {
        return invalid(format!("Cache exceeds this reader's {} MiB memory safety limit. Use installed tool adapters for larger maps.",MAX_CACHE_BYTES/1024/1024));
    }
    let mut bytes = fs::read(path)?;
    if header.legacy_tag_size_repair {
        bytes[0x14..0x18].copy_from_slice(&header.tag_size.to_le_bytes());
    }
    if header.compressed {
        let mut decoded = bytes[..2048].to_vec();
        let mut z = flate2::read::ZlibDecoder::new(&bytes[2048..]);
        z.by_ref()
            .take(header.declared_size as u64 - 2048 + 1)
            .read_to_end(&mut decoded)?;
        if decoded.len() != header.declared_size as usize {
            return invalid("Xbox decompression length does not match its header");
        }
        bytes = decoded;
    }
    Ok((header, bytes))
}
struct Space {
    begin: usize,
    end: usize,
    address: u32,
}
impl Space {
    fn pointer(&self, value: u32, len: usize) -> Result<usize> {
        let delta = value.checked_sub(self.address).ok_or_else(|| {
            SparkError::Invalid(format!("Pointer 0x{value:X} precedes its tag region"))
        })? as usize;
        let offset = self
            .begin
            .checked_add(delta)
            .ok_or_else(|| SparkError::Invalid("Pointer overflow".into()))?;
        if offset.checked_add(len).is_none_or(|end| end > self.end) {
            return invalid(format!(
                "Pointer 0x{value:X} points outside its tag/BSP region"
            ));
        }
        Ok(offset)
    }
    fn block(&self, r: &Reader, at: usize, stride: usize, max: usize) -> Result<(usize, usize)> {
        let count = r.u32(at)? as usize;
        if count > max {
            return invalid(format!("Reflexive count {count} exceeds {max}"));
        }
        if count == 0 {
            return Ok((0, 0));
        }
        let len = count
            .checked_mul(stride)
            .ok_or_else(|| SparkError::Invalid("Reflexive length overflow".into()))?;
        let o = self.pointer(r.u32(at + 4)?, len)?;
        r.bytes(o, len)?;
        Ok((o, count))
    }
}

pub fn inspect_map(path: &Path, resource_directory: Option<&Path>) -> Result<MapInspection> {
    let (mut header, bytes) = read_cache(path)?;
    header.extended |= path
        .extension()
        .is_some_and(|x| x.eq_ignore_ascii_case("yelo"));
    let r = Reader(&bytes);
    let start = header.tag_offset as usize;
    let tag_header = if header.version == 5 { 0x24 } else { 0x28 };
    if r.u32(start + tag_header - 4)? != 0x74616773 {
        return invalid("Tag index signature is invalid. Protected/extended maps and compressed MCC chunks require an external decoder; no tags were guessed.");
    }
    let array_ptr = r.u32(start)?;
    let address = match header.version {
        5 => 0x803a6000,
        6 => 0x4bf10000,
        13 => array_ptr
            .checked_sub(0x28)
            .ok_or_else(|| SparkError::Invalid("Invalid MCC tag index pointer".into()))?,
        _ => 0x40440000,
    };
    let space = Space {
        begin: start,
        end: start + header.tag_size as usize,
        address,
    };
    let count = r.u32(start + 0xc)? as usize;
    if count == 0 || count > MAX_TAGS {
        return invalid(format!("Invalid tag count {count}; maximum {MAX_TAGS}"));
    }
    let table = space.pointer(array_ptr, count * 32)?;
    let mut tags = Vec::with_capacity(count);
    let mut diagnostics = vec![];
    if header.legacy_tag_size_repair {
        diagnostics.push(Diagnostic::warning("LEGACY_TAG_SIZE", "The legacy header declares whole-file length as tag-data length. Inspection bounds it to the actual remaining bytes; a build normalizes only its working copy before full extraction and recompilation. This is not MCC conversion."));
    }
    if header.extended
        || path
            .extension()
            .is_some_and(|x| x.eq_ignore_ascii_case("yelo"))
    {
        diagnostics.push(Diagnostic::warning("EXTENDED_CACHE","OpenSauce/extended cache detected. Read-only inspection is available; MCC conversion is blocked because engine extensions are not portable."));
    }
    if header.declared_size as u64 != header.file_size && !header.compressed {
        diagnostics.push(Diagnostic::warning("SIZE_MISMATCH","Header size differs from actual size. Export requires rebuilding and validating all tags."));
    }
    let mut ids = std::collections::HashSet::new();
    for i in 0..count {
        let at = table + i * 32;
        let class = r.fourcc(at)?;
        let id = r.u32(at + 12)?;
        if !ids.insert(id) {
            return invalid("Duplicate tag identifiers indicate a protected or corrupt cache");
        }
        let path_at = space.pointer(r.u32(at + 16)?, 1)?;
        let name = r.string(path_at, (space.end - path_at).min(1024))?;
        // A legacy tag may have an empty basename: the extracted file still has
        // its class extension (e.g. folder/.particle). Validate the directory
        // without rejecting that safe, historically used filename form.
        let normalized = name.replace('\\', "/");
        if normalized.starts_with('/') {
            return invalid(format!("Absolute tag path at index {i}: {name:?}"));
        }
        let collapsed = normalized
            .split('/')
            .filter(|c| !c.is_empty())
            .collect::<Vec<_>>()
            .join("/");
        let validation_path = if name.ends_with(['\\', '/']) {
            format!("{collapsed}/__unnamed")
        } else {
            collapsed
        };
        crate::safe_relative(&validation_path).map_err(|_| {
            SparkError::Invalid(format!(
                "Unsafe or protected tag path at index {i}: {name:?}"
            ))
        })?;
        let external_flag = r.u32(at + 24)?;
        if header.version != 5 && external_flag > 1 {
            return invalid(format!(
                "Invalid resource flag {external_flag} at tag index {i}"
            ));
        }
        let external = header.version != 5 && external_flag == 1;
        let data_offset = if external || class == "sbsp" {
            None
        } else {
            Some(space.pointer(r.u32(at + 20)?, 1)?)
        };
        tags.push(Tag {
            id,
            index: i,
            class,
            path: name,
            data_offset,
            external,
            fields: vec![],
            references: vec![],
        });
    }
    let tag_ids: std::collections::HashMap<u32, String> =
        tags.iter().map(|t| (t.id, t.class.clone())).collect();
    let mut failed_fields = 0;
    for tag in &mut tags {
        if read_fields(&r, &space, tag, &tag_ids).is_err() {
            failed_fields += 1;
            tag.fields.clear();
            tag.references.clear();
        }
    }
    if failed_fields > 0 {
        diagnostics.push(Diagnostic::warning("UNSUPPORTED_FIELDS",format!("{failed_fields} tags have structures outside the audited schema or unresolved pointers; those tags are inspection-only.")));
    }
    let scenario_id = r.u32(start + 4)?;
    let scenario = tags
        .iter()
        .find(|t| t.id == scenario_id && t.class == "scnr")
        .ok_or_else(|| {
            SparkError::Invalid("The tag index does not reference a valid scenario tag".into())
        })?;
    let scenario_path = scenario.path.clone();
    let scenario_at = scenario
        .data_offset
        .ok_or_else(|| SparkError::Invalid("Scenario is external".into()))?;
    let mut objects = vec![];
    for (offset, palette, stride, kind) in [
        (0x210, 0x21c, 72, "Scenery"),
        (0x228, 0x234, 120, "Biped"),
        (0x240, 0x24c, 120, "Vehicle"),
        (0x258, 0x264, 40, "Equipment"),
        (0x270, 0x27c, 92, "Weapon"),
    ] {
        match placements(
            &r,
            &space,
            scenario_at,
            (offset, palette, stride, kind),
            &tags,
        ) {
            Ok(mut rows) => objects.append(&mut rows),
            Err(e) => diagnostics.push(Diagnostic::warning(
                "SCENARIO_BLOCK",
                format!("{kind}: {e}"),
            )),
        }
    }
    if let Ok((at, n)) = space.block(&r, scenario_at + 0x354, 52, 4096) {
        for i in 0..n {
            let p = at + i * 52;
            objects.push(SceneObject {
                id: format!("spawn-{i}"),
                name: format!("Player spawn {} · team {}", i + 1, r.u16(p + 16)?),
                kind: "Player spawn".into(),
                tag_id: None,
                position: vec3(&r, p)?,
                rotation: [r.f32(p + 12)?, 0.0, 0.0],
                scale: [1.0; 3],
                visible: true,
                source_offset: Some(p),
                rotation_offset: Some(p + 12),
                asset_id: None,
            });
        }
    }
    let mut encounters = vec![];
    if let Ok((at, n)) = space.block(&r, scenario_at + 0x42c, 176, 128) {
        for i in 0..n {
            let p = at + i * 176;
            let mut squads = vec![];
            if let Ok((s, c)) = space.block(&r, p + 128, 232, 64) {
                for j in 0..c {
                    squads.push(r.string(s + j * 232, 32)?);
                }
            }
            encounters.push(Encounter {
                name: r.string(p, 32)?,
                squads,
                team: r.u16(p + 36)?,
            });
        }
    }
    let mut scripts = vec![];
    if let Ok((at, n)) = space.block(&r, scenario_at + 0x49c, 92, 4096) {
        for i in 0..n {
            let p = at + i * 92;
            scripts.push(Script {
                name: r.string(p, 32)?,
                script_type: r.u16(p + 32)?,
                return_type: r.u16(p + 34)?,
            });
        }
    }
    let mesh = match collision_mesh(&r, &space, scenario_at, &tags) {
        Ok(m) => m,
        Err(e) => {
            diagnostics.push(Diagnostic::warning("BSP_UNAVAILABLE",format!("Collision geometry unavailable: {e}. Object markers are shown at actual placements; no replacement environment is generated.")));
            MeshData::default()
        }
    };
    let folder = resource_directory
        .or_else(|| path.parent())
        .unwrap_or(Path::new("."));
    let mut resources = vec![];
    for (name, classes) in [
        ("bitmaps.map", vec!["bitm"]),
        ("sounds.map", vec!["snd!"]),
        ("loc.map", vec!["font", "ustr", "hmt "]),
    ] {
        let required = tags
            .iter()
            .any(|t| t.external && classes.contains(&t.class.as_str()))
            || (header.version == 7 && name == "bitmaps.map");
        let found = folder.join(name).is_file();
        if required && !found {
            diagnostics.push(Diagnostic::warning("MISSING_RESOURCE",format!("{name} is required. Choose the original runtime's resource-map folder in Settings; MCC resources are not interchangeable with Demo/PC resources.")));
        }
        resources.push(Resource{name:name.into(),required,found,reason:if required{"Referenced by source cache"}else{"Not proven necessary by tag index; the extraction tool checks raw-data dependencies"}.into()});
    }
    diagnostics.push(Diagnostic::warning("RUNTIME_TEST_PENDING","Structural inspection is complete. Playability is only established by loading the resulting map in the target game. Multiplayer AI synchronization is a separate runtime capability."));
    Ok(MapInspection {
        header,
        sha256: hash_file(path)?,
        tags,
        objects,
        mesh,
        encounters,
        scripts,
        resources,
        diagnostics,
        scenario_path,
    })
}
fn vec3(r: &Reader, at: usize) -> Result<[f32; 3]> {
    Ok([r.f32(at)?, r.f32(at + 4)?, r.f32(at + 8)?])
}
fn numeric(
    r: &Reader,
    tag: &mut Tag,
    at: usize,
    key: &str,
    label: &str,
    max: f64,
    unit: &str,
) -> Result<()> {
    let min = 0.0;
    let value = r.f32(at)? as f64;
    if value < min || value > max {
        return Ok(());
    }
    tag.fields.push(TagField {
        key: key.into(),
        label: label.into(),
        offset: at,
        kind: "f32".into(),
        value: serde_json::json!(value),
        min,
        max,
        unit: unit.into(),
        target_class: None,
    });
    Ok(())
}
fn reference(
    r: &Reader,
    tag: &mut Tag,
    at: usize,
    label: &str,
    expected: Option<&str>,
    ids: &std::collections::HashMap<u32, String>,
) -> Result<()> {
    let id = r.u32(at + 12)?;
    if id == u32::MAX {
        return Ok(());
    }
    let class = r.fourcc(at)?;
    if ids.get(&id).is_none_or(|v| v != &class) || expected.is_some_and(|v| v != class) {
        return Ok(());
    }
    tag.references.push(TagReference {
        label: label.into(),
        target_id: id,
        class: class.clone(),
        offset: at,
    });
    if let Some(class) = expected {
        tag.fields.push(TagField {
            key: format!("ref-{at}"),
            label: label.into(),
            offset: at,
            kind: "reference".into(),
            value: serde_json::json!(id),
            min: 0.0,
            max: u32::MAX as f64,
            unit: String::new(),
            target_class: Some(class.into()),
        });
    }
    Ok(())
}
fn read_fields(
    r: &Reader,
    space: &Space,
    tag: &mut Tag,
    ids: &std::collections::HashMap<u32, String>,
) -> Result<()> {
    let Some(at) = tag.data_offset else {
        return Ok(());
    };
    if [
        "weap", "proj", "scen", "bipd", "vehi", "eqip", "mach", "ctrl", "lifi", "garb", "ssce",
    ]
    .contains(&tag.class.as_str())
    {
        space.pointer(space.address + (at - space.begin) as u32, 0x17c)?;
        numeric(
            r,
            tag,
            at + 4,
            "bounding-radius",
            "Bounding radius",
            10000.0,
            "world units",
        )?;
        numeric(
            r,
            tag,
            at + 0x20,
            "acceleration-scale",
            "Acceleration scale",
            1000.0,
            "",
        )?;
        for (o, label) in [
            (0x28, "Model"),
            (0x38, "Animation graph"),
            (0x70, "Collision model"),
            (0x80, "Physics"),
            (0x90, "Modifier shader"),
            (0xa0, "Creation effect"),
        ] {
            reference(r, tag, at + o, label, None, ids)?;
        }
    }
    if tag.class == "weap" {
        space.pointer(space.address + (at - space.begin) as u32, 0x508)?;
        numeric(
            r,
            tag,
            at + 0x338,
            "ready-time",
            "Ready time",
            300.0,
            "seconds",
        )?;
        numeric(
            r,
            tag,
            at + 0x3e8,
            "autoaim-range",
            "Autoaim range",
            10000.0,
            "world units",
        )?;
        let (triggers, count) = space.block(r, at + 0x4fc, 276, 2)?;
        for i in 0..count {
            let t = triggers + i * 276;
            numeric(
                r,
                tag,
                t + 4,
                &format!("fire-min-{i}"),
                &format!("Trigger {} · minimum rate", i + 1),
                1000.0,
                "rounds / second",
            )?;
            numeric(
                r,
                tag,
                t + 8,
                &format!("fire-max-{i}"),
                &format!("Trigger {} · maximum rate", i + 1),
                1000.0,
                "rounds / second",
            )?;
            reference(
                r,
                tag,
                t + 0x94,
                &format!("Trigger {} · projectile", i + 1),
                Some("proj"),
                ids,
            )?;
        }
    }
    if tag.class == "proj" {
        space.pointer(space.address + (at - space.begin) as u32, 0x24c)?;
        for (o, key, label, max, unit) in [
            (
                0x1a0,
                "collision-radius",
                "Collision radius",
                100.0,
                "world units",
            ),
            (0x1a4, "arming-time", "Arming time", 300.0, "seconds"),
            (
                0x1c8,
                "maximum-range",
                "Maximum range",
                100000.0,
                "world units",
            ),
            (0x1cc, "air-gravity", "Air gravity scale", 100.0, ""),
            (
                0x1e4,
                "initial-velocity",
                "Initial velocity",
                100000.0,
                "cached world units / tick",
            ),
            (
                0x1e8,
                "final-velocity",
                "Final velocity",
                100000.0,
                "cached world units / tick",
            ),
        ] {
            numeric(r, tag, at + o, key, label, max, unit)?;
        }
    }
    Ok(())
}
fn placements(
    r: &Reader,
    space: &Space,
    sc: usize,
    block: (usize, usize, usize, &str),
    tags: &[Tag],
) -> Result<Vec<SceneObject>> {
    let (offset, palette, stride, kind) = block;
    let (at, n) = space.block(r, sc + offset, stride, 4096)?;
    let (pal, pn) = space.block(r, sc + palette, 48, 4096)?;
    let mut rows = vec![];
    for i in 0..n {
        let p = at + i * stride;
        let idx = r.u16(p)? as usize;
        let tid = if idx < pn {
            Some(r.u32(pal + idx * 48 + 12)?)
        } else {
            None
        };
        let name = tid
            .and_then(|id| tags.iter().find(|t| t.id == id))
            .map(|t| t.path.rsplit('\\').next().unwrap_or(&t.path).to_string())
            .unwrap_or_else(|| kind.into());
        rows.push(SceneObject {
            id: format!("{kind}-{i}"),
            name: format!("{name} · {}", i + 1),
            kind: kind.into(),
            tag_id: tid,
            position: vec3(r, p + 8)?,
            rotation: vec3(r, p + 20)?,
            scale: [1.0; 3],
            visible: true,
            source_offset: Some(p + 8),
            rotation_offset: Some(p + 20),
            asset_id: None,
        });
    }
    Ok(rows)
}
fn collision_mesh(r: &Reader, space: &Space, sc: usize, tags: &[Tag]) -> Result<MeshData> {
    let (bsps, count) = space.block(r, sc + 0x5a4, 32, 16)?;
    let mut mesh = MeshData {
        label: "Imported BSP collision geometry".into(),
        source: "halo-collision".into(),
        ..Default::default()
    };
    for i in 0..count {
        let index_start = mesh.indices.len();
        let row = bsps + i * 32;
        let begin = r.u32(row)? as usize;
        let size = r.u32(row + 4)? as usize;
        let address = r.u32(row + 8)?;
        r.bytes(begin, size)?;
        if size < 24 {
            return invalid("BSP block is too small");
        }
        let bsp_space = Space {
            begin,
            end: begin + size,
            address,
        };
        let bsp = bsp_space.pointer(r.u32(begin)?, 648)?;
        let (blocks, bn) = bsp_space.block(r, bsp + 0xb0, 96, 16)?;
        for b in 0..bn {
            let root = blocks + b * 96;
            let (surfaces, sn) = bsp_space.block(r, root + 0x3c, 12, 131072)?;
            let (edges, en) = bsp_space.block(r, root + 0x48, 24, 262144)?;
            let (vertices, vn) = bsp_space.block(r, root + 0x54, 16, 131072)?;
            if mesh.positions.len() / 3 + vn > 500000 {
                return invalid("Collision mesh exceeds 500000 vertices");
            }
            let base = (mesh.positions.len() / 3) as u32;
            for v in 0..vn {
                mesh.positions
                    .extend_from_slice(&vec3(r, vertices + v * 16)?);
            }
            for s in 0..sn {
                let first = r.u32(surfaces + s * 12 + 4)? as usize;
                let mut edge = first;
                let mut poly = vec![];
                for _ in 0..128 {
                    if edge >= en {
                        return invalid("Collision edge is outside its reflexive");
                    }
                    let at = edges + edge * 24;
                    let left = r.u32(at + 16)? as usize == s;
                    if !left && r.u32(at + 20)? as usize != s {
                        return invalid("Collision surface edge has no matching side");
                    }
                    let v = r.u32(at + if left { 0 } else { 4 })?;
                    if v as usize >= vn {
                        return invalid("Collision vertex index is out of range");
                    }
                    poly.push(base + v);
                    edge = r.u32(at + if left { 8 } else { 12 })? as usize;
                    if edge == first {
                        break;
                    }
                }
                if edge != first {
                    return invalid("Collision surface did not form a bounded closed polygon");
                }
                for v in 1..poly.len().saturating_sub(1) {
                    mesh.indices
                        .extend_from_slice(&[poly[0], poly[v], poly[v + 1]]);
                }
                if mesh.indices.len() > 3000000 {
                    return invalid("Collision mesh triangle limit exceeded");
                }
            }
        }
        let tag_id = r.u32(row + 28)?;
        let name = tags
            .iter()
            .find(|t| t.id == tag_id)
            .map(|t| {
                t.path
                    .rsplit(['\\', '/'])
                    .next()
                    .unwrap_or(&t.path)
                    .to_string()
            })
            .unwrap_or_else(|| format!("BSP {}", i + 1));
        mesh.parts.push(MeshPart {
            name,
            index_start,
            index_count: mesh.indices.len() - index_start,
        });
    }
    if mesh.positions.is_empty() {
        return invalid("No readable collision BSP vertices");
    }
    Ok(mesh)
}

pub fn read_range(path: &Path, offset: u64, len: usize) -> Result<Vec<u8>> {
    if len > 4096 {
        return invalid("Range view is limited to 4096 bytes");
    }
    let mut f = File::open(path)?;
    if offset
        .checked_add(len as u64)
        .is_none_or(|n| n > f.metadata().map(|m| m.len()).unwrap_or(0))
    {
        return invalid("Range exceeds the source cache");
    }
    f.seek(SeekFrom::Start(offset))?;
    let mut b = vec![0; len];
    f.read_exact(&mut b)?;
    Ok(b)
}
