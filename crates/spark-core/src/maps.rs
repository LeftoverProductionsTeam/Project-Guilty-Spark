//! Original, bounds-checked cache reader. Format references are recorded in docs/RESEARCH.md.
//! Known field offsets are deliberately a small audited subset, never guessed from tag names.
use crate::{binary::Reader, invalid, Result, SparkError};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::Path,
    sync::{Arc, Mutex, OnceLock},
};
#[path = "map_decals.rs"]
mod decals;
#[path = "ui_tags.rs"]
mod ui_tags;
#[path = "shader_transparent.rs"]
mod shader_transparent;
pub use shader_transparent::{ShaderAnimation, ShaderStage};
pub use decals::SceneDecal;

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
    // OpenSauce's marker belongs to the classic cache header. Searching model,
    // bitmap or sound payload bytes falsely classified stock MCC campaign maps.
    let extended = matches!(version,7|609) && bytes[..2048].windows(4).any(|w|w==b"yelo"||w==b"oley");
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
    /// Classic PC shader base/diffuse bitmap provenance for read-only previews.
    /// Known values: resolved, missing, invalid, unavailable. Old project caches
    /// without this field are still readable (None).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub primary_bitmap_status: Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub shader_preview:Option<ShaderPreview>,
}
#[derive(Clone,Debug,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ShaderPreview {
    #[serde(default,skip_serializing_if="Option::is_none")] pub meter:Option<ShaderMeter>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub self_illumination:Option<ShaderSelfIllumination>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub glass_diffuse_absent:Option<bool>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub change_color_source:Option<u16>,
    #[serde(default)] pub first_map_screenspace:bool,
    #[serde(default)] pub scale_first_map_with_distance:bool,
    #[serde(default)] pub detail_mask:u16,
    #[serde(default)] pub detail_after_reflection:bool,
    #[serde(default)] pub detail_v_scale:f32,
    #[serde(default)] pub bump_is_specular:bool,
    #[serde(default,skip_serializing_if="Option::is_none")] pub glass_tint:Option<[f32;3]>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub glass_tint_scale:Option<f32>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub reflection:Option<ShaderReflection>,
    #[serde(default)] pub multipurpose_xbox:bool,
    #[serde(default)] pub bump_scale:f32,
    pub alpha_test:bool,pub two_sided:bool,pub uv_scale:[f32;2],
    #[serde(default)] pub kind:String,
    #[serde(default)] pub shader_type:u16,
    #[serde(default)] pub detail_function:u16,
    #[serde(default)] pub micro_detail_function:u16,
    #[serde(default)] pub detail_scales:[f32;3],
    #[serde(default)] pub framebuffer_blend:u16,
    #[serde(default)] pub layers:Vec<ShaderLayer>,
    #[serde(default)] pub stages:Vec<ShaderStage>,
    #[serde(default)] pub decal:bool,
    #[serde(default)] pub alpha_blended:bool,
}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ShaderMeter {pub flags:u16,pub gradient_min:[f32;3],pub gradient_max:[f32;3],pub background:[f32;3],pub flash:[f32;3],pub tint:[f32;3],pub meter_transparency:f32,pub background_transparency:f32,pub sources:[u16;5]}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ShaderSelfIllumination {pub source:u16,pub function:u16,pub period:f32,pub lower:[f32;3],pub upper:[f32;3]}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ShaderReflection {
    pub bitmap_tag_id:u32,
    pub perpendicular_brightness:f32,
    pub parallel_brightness:f32,
    pub perpendicular_tint:[f32;3],
    pub parallel_tint:[f32;3],
    pub falloff:f32,
    pub cutoff:f32,
}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ShaderLayer {pub bitmap_tag_id:u32,pub uv_scale:[f32;2],pub uv_offset:[f32;2],pub rotation:f32,
    pub color_function:u16,pub alpha_function:u16,
    #[serde(default)] pub flags:u16,
    #[serde(default)] pub animations:Vec<ShaderAnimation>,
    #[serde(default)] pub rotation_center:[f32;2]}
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_model: Option<SourceModelReference>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceModelReference {
    pub project_id: String,
    pub source_sha256: String,
    pub tag_id: u32,
    pub path: String,
    pub class: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshPart {
    pub name: String,
    pub index_start: usize,
    pub index_count: usize,
}
/// Source shader identities for BSP triangle ranges; not decoded textures.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshMaterialRange {
    pub shader_tag_id: u32,
    /// Original BSP signed-short permutation bits, distinct from the shader datum.
    #[serde(default)]
    pub shader_permutation: u16,
    pub bsp_index: usize,
    pub lightmap_index: usize,
    /// Actual bitmap page index in the BSP lightmap block, -1 when unlit.
    #[serde(default)]
    pub lightmap_page: i32,
    /// The bounded raw stream provided real secondary UVs, not default coordinates.
    #[serde(default)]
    pub has_lightmap_uvs: bool,
    /// The bounded secondary stream also contains finite authored radiosity vectors.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub has_incident_radiosity: bool,
    /// The compiled sbsp header references the bitmap tag containing its
    /// lightmap pages. This is candidate provenance only; callers must match
    /// it against a real bitm tag ID in the inspected cache before reading.
    #[serde(default)]
    pub lightmap_bitmap_tag_id: Option<u32>,
    pub index_start: usize,
    pub index_count: usize,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshData {
    /// Preview-only outputs for a stationary vehicle; unknown engine inputs stay null.
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub stationary_function_values:Option<[Option<f32>;4]>,
    /// Read-only native object bounds used by static source-lighting previews.
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub object_lighting:Option<ObjectLighting>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub change_colors:Option<Vec<[f32;3]>>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub rig:Option<ModelRig>,
    pub positions: Vec<f32>,
    pub indices: Vec<u32>,
    #[serde(default)]
    pub normals: Vec<f32>,
    #[serde(default)]
    pub uvs: Vec<f32>,
    /// Second UV channel sourced from the compiled BSP uncompressed lightmap stream.
    #[serde(default)]
    pub lightmap_uvs: Vec<f32>,
    /// Source incident-radiosity vectors, with magnitude retained (not unit normals).
    /// Zero padding is unavailable unless the material declares validated data.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub incident_radiosity: Vec<f32>,
    pub label: String,
    pub source: String,
    #[serde(default)]
    pub parts: Vec<MeshPart>,
    #[serde(default)]
    pub material_ranges: Vec<MeshMaterialRange>,
}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ObjectLighting{pub tag_class:String,pub offset:[f32;3],pub radius:f32,pub brighten:bool,#[serde(default)]pub casts_shadow:Option<bool>}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ModelBone{pub name:String,pub parent:i16,pub position:[f32;3],pub rotation:[f32;4]}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ModelRig{pub checksum:u32,pub nodes:Vec<ModelBone>,pub indices:Vec<u16>,pub weights:Vec<f32>}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Encounter {
    pub name: String,
    pub squads: Vec<String>,
    pub team: u16,
    /// None means unavailable/unreadable, including old inspection caches.
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub details: Option<EncounterDetails>,
}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct EncounterDetails {
    pub flags:u32,
    pub manual_bsp_index:i16,
    pub squads:Vec<EncounterSquad>,
    pub firing_positions:Vec<AiFiringPosition>,
}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct EncounterSquad {
    pub name:String,
    pub actor_palette_index:i16,
    pub actor_variant_tag_id:Option<u32>,
    pub normal_count:i16,
    pub insane_count:i16,
    pub initial_state:u16,
    pub return_state:u16,
    pub starting_locations:Vec<AiStartingLocation>,
}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct AiStartingLocation {
    pub position:[f32;3],
    pub facing:f32,
    pub flags:u8,
    pub initial_state:u16,
    pub return_state:u16,
    pub actor_palette_index:i16,
    pub actor_variant_tag_id:Option<u32>,
    pub command_list:i16,
}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct AiFiringPosition {
    pub position:[f32;3],
    pub group_index:u16,
    pub cluster_index:i16,
    pub surface_index:u32,
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
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct PlayerStartingProfile {
    pub name:String,
    pub health:f32,
    pub shields:f32,
    pub primary_weapon_tag_id:Option<u32>,
    pub primary_loaded:i16,
    pub primary_reserved:i16,
    pub secondary_weapon_tag_id:Option<u32>,
    pub secondary_loaded:i16,
    pub secondary_reserved:i16,
    pub fragmentation_grenades:i8,
    pub plasma_grenades:i8,
    pub grenade_type2:i8,
    pub grenade_type3:i8,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapInspection {
    /// None means an older inspection or unreadable native data, not an empty loadout.
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub player_starting_profiles: Option<Vec<PlayerStartingProfile>>,
    pub header: MapHeader,
    /// Tag-data checksum, distinct from the cache-header CRC used by the game loader.
    #[serde(default)]
    pub tag_checksum: Option<u32>,
    pub sha256: String,
    pub tags: Vec<Tag>,
    pub objects: Vec<SceneObject>,
    #[serde(default)]
    pub decals: Vec<SceneDecal>,
    pub mesh: MeshData,
    #[serde(default)]
    pub render_mesh: Option<MeshData>,
    #[serde(default)]
    pub model_meshes: std::collections::HashMap<u32, MeshData>,
    pub encounters: Vec<Encounter>,
    pub scripts: Vec<Script>,
    pub resources: Vec<Resource>,
    pub diagnostics: Vec<Diagnostic>,
    pub scenario_path: String,
}

pub fn hash_file(path: &Path) -> Result<String> {
    let f = File::open(path)?;
    const MAX_HASH_BYTES: u64 = 2 * 1024 * 1024 * 1024;
    if f.metadata()?.len() > MAX_HASH_BYTES {
        return invalid("File exceeds the 2 GiB hashing safety limit");
    }
    let mut f = f.take(MAX_HASH_BYTES + 1);
    let mut hash = Sha256::new();
    let mut buf = [0u8; 65536];
    let mut total = 0u64;
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        total += n as u64;
        if total > MAX_HASH_BYTES {
            return invalid("File grew beyond the 2 GiB hashing safety limit");
        }
        hash.update(&buf[..n]);
    }
    Ok(crate::hex_bytes(hash.finalize()))
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
    let (header, bytes, _) = read_cache_snapshot(path)?;
    Ok((header, bytes))
}
/// Parse and hash the same bounded file snapshot before any working-buffer normalization.
pub(crate) fn read_cache_snapshot(path: &Path) -> Result<(MapHeader, Vec<u8>, String)> {
    let (header,bytes,sha256)=read_original_cache_snapshot(path)?;
    let bytes=normalize_cache_snapshot(&header,bytes)?;
    Ok((header,bytes,sha256))
}
/// One bounded immutable decompression cache. Every caller still reads and
/// hashes the entire original file; a timestamp or path never proves identity.
/// Serializing normalization also prevents simultaneous texture batches from
/// each inflating the same Xbox campaign into another hundreds-of-MiB buffer.
pub(crate) fn read_cache_snapshot_shared(path: &Path) -> Result<(MapHeader, Arc<[u8]>, String)> {
    static XBOX: OnceLock<Mutex<Option<(String, Arc<[u8]>)>>> = OnceLock::new();
    let (header, original, hash) = read_original_cache_snapshot(path)?;
    if header.version != 5 || !header.compressed || header.declared_size > 320 * 1024 * 1024 {
        return Ok((header.clone(), Arc::from(normalize_cache_snapshot(&header, original)?), hash));
    }
    let mut cached = XBOX.get_or_init(|| Mutex::new(None)).lock()
        .map_err(|_| SparkError::Invalid("Xbox snapshot cache lock failed".into()))?;
    if let Some((identity, bytes)) = cached.as_ref().filter(|(identity, _)| identity == &hash) {
        return Ok((header, Arc::clone(bytes), identity.clone()));
    }
    let bytes: Arc<[u8]> = Arc::from(normalize_cache_snapshot(&header, original)?);
    *cached = Some((hash.clone(), Arc::clone(&bytes)));
    Ok((header, bytes, hash))
}
/// A metadata cache hit verifies all original bytes without decompressing a
/// payload which will not be inspected. The original SHA remains the identity.
pub(crate) fn read_original_cache_snapshot(path:&Path)->Result<(MapHeader,Vec<u8>,String)>{
    let file = File::open(path)?;
    if file.metadata()?.len() > MAX_CACHE_BYTES {
        return invalid(format!("Cache exceeds this reader's {} MiB memory safety limit. Use installed tool adapters for larger maps.",MAX_CACHE_BYTES/1024/1024));
    }
    let mut bytes = vec![];
    file.take(MAX_CACHE_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_CACHE_BYTES {
        return invalid("Cache grew beyond the memory safety limit while reading");
    }
    let header = parse_header(&bytes, bytes.len() as u64)?;
    if header.declared_size as u64 > MAX_CACHE_BYTES {
        return invalid("Declared cache size exceeds the memory safety limit");
    }
    let sha256 = crate::hex_bytes(Sha256::digest(&bytes));
    Ok((header,bytes,sha256))
}
pub(crate) fn normalize_cache_snapshot(header:&MapHeader,mut bytes:Vec<u8>)->Result<Vec<u8>>{
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
    Ok(bytes)
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
    let (header, bytes, sha256) = read_cache_snapshot_shared(path)?;
    inspect_snapshot(path,resource_directory,header,&bytes,sha256,true)
}
/// Metadata consumers can reuse one verified immutable file snapshot. The map
/// viewer always uses inspect_map, including every supported object model.
pub(crate) fn inspect_snapshot(path:&Path,resource_directory:Option<&Path>,mut header:MapHeader,bytes:&[u8],sha256:String,object_models:bool)->Result<MapInspection>{
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
        let shader_class = matches!(class.as_str(), "senv" | "soso" | "schi" | "scex" | "sotr" | "sgla" | "smet");
        tags.push(Tag {
            id,
            index: i,
            class,
            path: name,
            data_offset,
            external,
            shader_preview:None,
            fields: vec![],
            references: vec![],
            primary_bitmap_status: if shader_class {
                Some("unavailable".into())
            } else { None },
        });
    }
    let tag_ids: std::collections::HashMap<u32, String> =
        tags.iter().map(|t| (t.id, t.class.clone())).collect();
    let mut failed_fields = 0;
    for tag in &mut tags {
        if read_fields(&r, &space, tag, &tag_ids, header.version).is_err() {
            failed_fields += 1;
            tag.fields.clear();
            tag.references.clear();
            tag.shader_preview=None;
            // A failed tag read must NEVER enable basename shader guessing.
            if matches!(tag.class.as_str(), "senv" | "soso" | "schi" | "scex" | "sotr" | "sgla" | "smet") {
                tag.primary_bitmap_status = Some("invalid".into());
            }
        }
    }
    if failed_fields > 0 {
        diagnostics.push(Diagnostic::warning("UNSUPPORTED_FIELDS",format!("{failed_fields} tags have structures outside the audited schema or unresolved pointers; those tags are inspection-only.")));
    }
    let legacy_spawners = tags
        .iter()
        .filter(|t| {
            t.references
                .iter()
                .any(|r| r.label.contains("legacy object spawner"))
        })
        .count();
    if legacy_spawners > 0 {
        diagnostics.push(Diagnostic::warning("LEGACY_OBJECT_SPAWNERS", format!("{legacy_spawners} weapon tags instantiate non-projectile objects. Their observed dependencies are read-only; ordinary editing-kit compilers may reject this legacy mechanic and target-runtime behavior is unverified.")));
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
        (0x294, 0x2a0, 64, "Machine"),
        (0x2dc, 0x2e8, 40, "Sound scenery"),
    ] {
        match placements(
            &r,
            &space,
            scenario_at,
            (offset, palette, stride, kind),
            &tags,
            &mut diagnostics,
        ) {
            Ok(mut rows) => objects.append(&mut rows),
            Err(e) => diagnostics.push(Diagnostic::warning(
                "SCENARIO_BLOCK",
                format!("{kind}: {e}"),
            )),
        }
    }
    match space.block(&r, scenario_at + 0x354, 52, 4096) {
        Ok((at, n)) => {
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
                    source_model: None,
                });
            }
        }
        Err(e) => diagnostics.push(Diagnostic::warning(
            "PLAYER_SPAWNS_UNREADABLE",
            format!("Player spawns could not be read: {e}"),
        )),
    }
    let mut encounters = vec![];
    // Multiplayer pickups live in a different scenario block from ordinary
    // placed equipment. Each references an item collection, not a model.
    match space.block(&r,scenario_at+0x384,144,200){
        Ok((table,count))=>for index in 0..count {
            let row=table+index*144;let datum=r.u32(row+92)?;
            let Some(collection)=tags.iter().find(|t|t.id==datum&&t.class=="itmc")else{continue};
            if r.fourcc(row+80)?!="itmc"{continue;}
            objects.push(SceneObject{id:format!("netgame-equipment-{index}"),name:format!("{} · pickup {}",collection.path.rsplit('\\').next().unwrap_or(&collection.path),index+1),
                kind:"Netgame item".into(),tag_id:Some(datum),position:vec3(&r,row+64)?,rotation:[r.f32(row+76)?,0.,0.],scale:[1.;3],visible:true,
                source_offset:Some(row+64),rotation_offset:Some(row+76),asset_id:None,source_model:None});
        },
        Err(error)=>diagnostics.push(Diagnostic::warning("NETGAME_ITEMS_UNREADABLE",error.to_string())),
    }
    // Standard scenario player profiles precede player-start locations.
    // Keep raw signed counts, and require each non-null dependency to resolve.
    let player_starting_profiles=(|| -> Result<Vec<PlayerStartingProfile>> {
        let (at,count)=space.block(&r,scenario_at+0x348,104,256)?;
        let weapon=|at:usize| -> Result<Option<u32>> {
            let id=r.u32(at+12)?;
            if id==u32::MAX {return Ok(None);}
            if r.fourcc(at)!="weap" || !tags.iter().any(|tag|tag.id==id&&tag.class=="weap") {
                return invalid("Player starting-profile weapon does not resolve to its native weapon tag");
            }
            Ok(Some(id))
        };
        (0..count).map(|index| {
            let p=at+index*104;
            Ok(PlayerStartingProfile {name:r.string(p,32)?,health:r.f32(p+32)?,shields:r.f32(p+36)?,
                primary_weapon_tag_id:weapon(p+40)?,primary_loaded:r.u16(p+56)? as i16,primary_reserved:r.u16(p+58)? as i16,
                secondary_weapon_tag_id:weapon(p+60)?,secondary_loaded:r.u16(p+76)? as i16,secondary_reserved:r.u16(p+78)? as i16,
                fragmentation_grenades:r.bytes(p+80,1)?[0] as i8,plasma_grenades:r.bytes(p+81,1)?[0] as i8,
                grenade_type2:r.bytes(p+82,1)?[0] as i8,grenade_type3:r.bytes(p+83,1)?[0] as i8})
        }).collect()
    })();
    let player_starting_profiles=match player_starting_profiles {
        Ok(profiles)=>Some(profiles),
        Err(problem)=>{diagnostics.push(Diagnostic::warning("PLAYER_PROFILES_UNREADABLE",problem.to_string()));None},
    };
    let actor_palette = (|| -> Result<Vec<Option<u32>>> {
        let (at,count)=space.block(&r,scenario_at+0x420,16,64)?;
        (0..count).map(|index| {
            let id=r.u32(at+index*16+12)?;
            if id==u32::MAX {return Ok(None);}
            if r.fourcc(at+index*16)!="actv" || !tags.iter().any(|tag|tag.id==id&&tag.class=="actv") {return invalid(format!("Actor palette entry {index} does not resolve to an actor variant"));}
            Ok(Some(id))
        }).collect()
    })();
    if let Err(problem)=&actor_palette {diagnostics.push(Diagnostic::warning("AI_ACTOR_PALETTE_UNREADABLE",problem.to_string()));}
    match space.block(&r, scenario_at + 0x42c, 176, 128) {
        Ok((at, n)) => {
            for i in 0..n {
                let p = at + i * 176;
                let mut squads = vec![];
                match space.block(&r, p + 128, 232, 64) {
                    Ok((s, c)) => {
                        for j in 0..c {
                            squads.push(r.string(s + j * 232, 32)?);
                        }
                    }
                    Err(e) => diagnostics.push(Diagnostic::warning(
                        "AI_SQUADS_UNREADABLE",
                        format!("Encounter {i} squads could not be read: {e}"),
                    )),
                }
                let details=actor_palette.as_ref().map_err(|problem|SparkError::Invalid(problem.to_string()))
                    .and_then(|palette|encounter_details(&r,&space,p,palette));
                let details=match details {
                    Ok(details)=>Some(details),
                    Err(problem)=>{diagnostics.push(Diagnostic::warning("AI_ENCOUNTER_DETAILS_UNREADABLE",format!("Encounter {i}: {problem}")));None},
                };
                encounters.push(Encounter {
                    name: r.string(p, 32)?,
                    squads,
                    team: r.u16(p + 36)?,
                    details,
                });
            }
        }
        Err(e) => diagnostics.push(Diagnostic::warning(
            "AI_ENCOUNTERS_UNREADABLE",
            format!("AI encounters could not be read: {e}"),
        )),
    }
    let mut scripts = vec![];
    match space.block(&r, scenario_at + 0x49c, 92, 4096) {
        Ok((at, n)) => {
            for i in 0..n {
                let p = at + i * 92;
                scripts.push(Script {
                    name: r.string(p, 32)?,
                    script_type: r.u16(p + 32)?,
                    return_type: r.u16(p + 34)?,
                });
            }
        }
        Err(e) => diagnostics.push(Diagnostic::warning(
            "SCRIPTS_UNREADABLE",
            format!("Scripts could not be read: {e}"),
        )),
    }
    let decals = decals::inspect(&r, &space, scenario_at, &tags, header.version, &mut diagnostics);
    let mesh = match collision_mesh(&r, &space, scenario_at, &tags) {
        Ok(m) => m,
        Err(e) => {
            diagnostics.push(Diagnostic::warning("BSP_UNAVAILABLE",format!("Collision geometry unavailable: {e}. Object markers are shown at actual placements; no replacement environment is generated.")));
            MeshData::default()
        }
    };
    // Read-only render preview is independent of the existing collision mesh.
    // Unsupported or malformed render data never invalidates source inspection.
    let render_mesh = match crate::render::bsp_render_geometry(&bytes, &header, scenario_at) {
        Ok(mesh) => Some(mesh),
        Err(e) => {
            diagnostics.push(Diagnostic::warning("BSP_RENDER_UNAVAILABLE", format!("Render surfaces unavailable: {e}. Only the actual collision geometry can be previewed.")));
            None
        }
    };
    let (model_meshes, model_notes) = if object_models{crate::render::static_object_models(&bytes, &header, &tags, &objects)}else{(Default::default(),vec![])};
    for note in model_notes {
        diagnostics.push(Diagnostic::warning("MODEL_RENDER_UNAVAILABLE", note));
    }
    let folder = resource_directory
        .or_else(|| path.parent())
        .unwrap_or(Path::new("."));
    let mut resources = vec![];
    // A resident tag body can still reference raw pixels/samples outside the
    // cache. The index's external-tag bit alone missed Demo/PC dependencies
    // and let thousands of doomed extractions run with an empty maps folder.
    let mut raw_resources = std::collections::BTreeSet::new();
    if matches!(header.version,6|7|609|13) {
        for tag in tags.iter().filter(|t|matches!(t.class.as_str(),"bitm"|"snd!")) {
            match external_raw_resource(&r,&space,tag) {
                Ok(Some(name))=>{raw_resources.insert(name);},
                Ok(None)=>(),
                Err(problem)=>{
                    raw_resources.insert(if tag.class=="bitm"{"bitmaps.map"}else{"sounds.map"});
                    diagnostics.push(Diagnostic::warning("RESOURCE_LAYOUT_UNVERIFIED",format!("{}: {problem}. Native extraction needs a verified source dependency review.",tag.path)));
                }
            }
        }
    }
    for (name, classes) in [
        ("bitmaps.map", vec!["bitm"]),
        ("sounds.map", vec!["snd!"]),
        ("loc.map", vec!["font", "ustr", "hmt "]),
    ] {
        let required = tags
            .iter()
            .any(|t| t.external && classes.contains(&t.class.as_str()))
            || raw_resources.contains(name)
            || (header.version == 7 && name == "bitmaps.map");
        let found = folder.join(name).is_file();
        if required && !found {
            diagnostics.push(Diagnostic::warning("MISSING_RESOURCE",format!("{name} is required. Choose the original runtime's resource-map folder in Settings; MCC resources are not interchangeable with Demo/PC resources.")));
        }
        resources.push(Resource{name:name.into(),required,found,reason:if required{"Referenced by native tag or raw-data descriptors"}else{"No external reference observed in supported native descriptors; extraction still validates dependencies"}.into()});
    }
    diagnostics.push(Diagnostic::warning("RUNTIME_TEST_PENDING","Structural inspection is complete. Playability is only established by loading the resulting map in the target game. Multiplayer AI synchronization is a separate runtime capability."));
    Ok(MapInspection {
        player_starting_profiles,
        tag_checksum:Some(r.u32(start+8)?),
        header,
        sha256,
        tags,
        objects,
        decals,
        mesh,
        render_mesh,
        model_meshes,
        encounters,
        scripts,
        resources,
        diagnostics,
        scenario_path,
    })
}
fn external_raw_resource(r:&Reader,space:&Space,tag:&Tag)->Result<Option<&'static str>> {
    let resource=if tag.class=="bitm"{"bitmaps.map"}else{"sounds.map"};
    if tag.external{return Ok(Some(resource));}
    let at=tag.data_offset.ok_or_else(||SparkError::Invalid("Native resource tag has no resident body".into()))? as usize;
    let size=if tag.class=="bitm"{108}else{164};
    if at<space.begin||at.checked_add(size).is_none_or(|end|end>space.end){return invalid("Native resource body exceeds its tag region");}
    if tag.class=="bitm" {
        let (images,count)=space.block(r,at+0x60,48,2048)?;
        for index in 0..count {
            let image=images+index*48;
            if r.fourcc(image)?!="bitm"{return invalid("Invalid native bitmap record signature");}
            if r.u16(image+14)?&0x100!=0{return Ok(Some(resource));}
        }
    }else{
        let (pitches,count)=space.block(r,at+152,72,8)?;
        let mut total=0usize;
        for index in 0..count {
            let (samples,n)=space.block(r,pitches+index*72+60,124,256)?;
            total+=n;if total>2048{return invalid("Sound permutation budget exceeded");}
            for sample in 0..n {match r.u32(samples+sample*124+68)?{0=>(),1=>return Ok(Some(resource)),_=>return invalid("Unknown native sound raw-data flags")}}
        }
    }
    Ok(None)
}
fn vec3(r: &Reader, at: usize) -> Result<[f32; 3]> {
    Ok([r.f32(at)?, r.f32(at + 4)?, r.f32(at + 8)?])
}
// Published H1 scenario structures: Invader696830ff scenario.json.
// The existing Space/Reader enforce cache pointers, counts and finite floats.
fn encounter_details(r:&Reader,space:&Space,at:usize,palette:&[Option<u32>])->Result<EncounterDetails> {
    let actor=|index:i16| -> Result<Option<u32>> {
        if index == -1 {return Ok(None);}
        if index < 0 {return invalid("Invalid negative actor-palette index");}
        palette.get(index as usize).copied().ok_or_else(||SparkError::Invalid("Actor-palette index is out of bounds".into()))
    };
    let (squad_at,squad_count)=space.block(r,at+128,232,64)?;
    let mut squads=vec![];
    for index in 0..squad_count {
        let p=squad_at+index*232;
        let actor_index=r.u16(p+32)? as i16;
        let default_actor=actor(actor_index)?;
        let (locations,count)=space.block(r,p+208,28,32)?;
        let mut starting_locations=vec![];
        for index in 0..count {
            let q=locations+index*28;
            let override_index=r.u16(q+24)? as i16;
            starting_locations.push(AiStartingLocation {
                position:vec3(r,q)?,facing:r.f32(q+12)?,flags:r.bytes(q+19,1)?[0],
                return_state:r.u16(q+20)?,initial_state:r.u16(q+22)?,actor_palette_index:override_index,
                actor_variant_tag_id:if override_index == -1 {default_actor} else {actor(override_index)?},
                command_list:r.u16(q+26)? as i16,
            });
        }
        squads.push(EncounterSquad {name:r.string(p,32)?,actor_palette_index:actor_index,actor_variant_tag_id:default_actor,
            normal_count:r.u16(p+124)? as i16,insane_count:r.u16(p+126)? as i16,initial_state:r.u16(p+36)?,return_state:r.u16(p+38)?,starting_locations});
    }
    let (firing_at,firing_count)=space.block(r,at+152,24,512)?;
    let mut firing_positions=vec![];
    for index in 0..firing_count {
        let p=firing_at+index*24;
        firing_positions.push(AiFiringPosition {position:vec3(r,p)?,group_index:r.u16(p+12)?,cluster_index:r.u16(p+14)? as i16,surface_index:r.u32(p+20)?});
    }
    Ok(EncounterDetails {flags:r.u32(at+32)?,manual_bsp_index:r.u16(at+42)? as i16,squads,firing_positions})
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
/// Read-only classic Halo shader dependency discovery. The byte offsets are
/// independently calculated from the published shader structures, not copied
/// from third-party parser code. See docs/CONTINUATION_16_ENGINEERING.md.
/// In compiled caches, TagDependency is 16 bytes, with class at +0 and datum
/// at +12. Only a matching bitmap tag in THIS cache is trusted.
///
/// Layout: shader parent 40 bytes. senv base=0x88, details=0xB8/0xCC/0xFC,
/// bump=0x128. soso diffuse=0xA4, multipurpose=0xBC, detail=0xDC.
/// Other maps remain unsupported rather than guessed.
fn shader_bitmap_references(
    r: &Reader,
    space: &Space,
    tag: &mut Tag,
    ids: &std::collections::HashMap<u32, String>,
    at: usize,
) -> Result<()> {
    let (body_len, bitmap_refs): (usize, &[(usize, &str)]) = match tag.class.as_str() {
        "senv" => (836, &[
            (0x88, "Base map"),
            (0xB8, "Primary detail map"),
            (0xCC, "Secondary detail map"),
            (0xFC, "Micro detail map"),
            (0x128, "Bump map"),
            (0x324, "Reflection cube map"),
        ]),
        "soso" => (440, &[
            (0xA4, "Diffuse map"),
            (0xBC, "Multipurpose map"),
            (0xDC, "Detail map"),
            (0x164, "Reflection cube map"),
        ]),
        "smet" => (260, &[(76,"Base map")]),
        "sgla" => (480, &[(0x158,"Diffuse map"),(0x16c,"Detail map"),(0xc0,"Bump map"),(0xac,"Reflection cube map"),(0x64,"Background tint map")]),
        _ => return Ok(()),
    };
    // Check the entire known structure before reading any individual field.
    r.bytes(at, body_len)?;
    if at < space.begin || at.checked_add(body_len).is_none_or(|end| end > space.end) {
        return invalid("Shader metadata escapes its bounded cache tag region");
    }
    let mut primary_status = "missing";
    for (index, (offset, label)) in bitmap_refs.iter().enumerate() {
        let field_at = at.checked_add(*offset).ok_or_else(|| {
            SparkError::Invalid("Shader bitmap reference address overflow".into())
        })?;
        let datum = r.u32(field_at + 12)?;
        if datum == u32::MAX { continue; }
        let class = r.fourcc(field_at)?;
        if class != "bitm" || ids.get(&datum).is_none_or(|c| c != "bitm") {
            if index == 0 { primary_status = "invalid"; }
            continue;
        }
        tag.references.push(TagReference {
            label: (*label).into(), target_id: datum,
            class: "bitm".into(), offset: field_at,
        });
        // Do not create editable TagField records: source-only attribution
        // must not silently turn shader metadata into a writable operation.
        if index == 0 { primary_status = "resolved"; }
    }
    // A null diffuse dependency is legal for native glass: its authored tint
    // and reflection still contribute. An invalid/non-null bitmap never gains
    // this exception. Keep absence distinct from a successfully decoded image.
    let glass_diffuse_absent=tag.class=="sgla"&&r.u32(at+0x158+12)?==u32::MAX;
    tag.primary_bitmap_status = Some(if glass_diffuse_absent{"not-required"}else{primary_status}.into());
    if primary_status!="resolved"&&!glass_diffuse_absent{tag.shader_preview=None;return Ok(());}
    let flags=r.u16(at+40)?;
    if tag.class=="smet" {
        if flags&!31!=0{return invalid("Unsupported native meter flags");}
        let color=|offset:usize|->Result<[f32;3]>{let rgb=[r.f32(at+offset)?,r.f32(at+offset+4)?,r.f32(at+offset+8)?];if rgb.iter().any(|v|!v.is_finite()||!(0.0..=1.0).contains(v)){return invalid("Native meter color is invalid");}Ok(rgb)};
        let meter_transparency=r.f32(at+184)?;let background_transparency=r.f32(at+188)?;
        let sources=[r.u16(at+216)?,r.u16(at+218)?,r.u16(at+220)?,r.u16(at+222)?,r.u16(at+224)?];
        if sources.iter().any(|v|*v>4)||[meter_transparency,background_transparency].iter().any(|v|!v.is_finite()||!(0.0..=1.0).contains(v)){return invalid("Native meter inputs are invalid");}
        tag.shader_preview=Some(ShaderPreview{kind:"meter".into(),two_sided:flags&2!=0,decal:flags&1!=0,alpha_blended:true,uv_scale:[1.,1.],meter:Some(ShaderMeter{flags,gradient_min:color(124)?,gradient_max:color(136)?,background:color(148)?,flash:color(160)?,tint:color(172)?,meter_transparency,background_transparency,sources}),..Default::default()});return Ok(());
    }
    let uv_scale=if tag.class=="soso" {
        let u=r.f32(at+0x9c)?;let v=r.f32(at+0xa0)?;
        if !u.is_finite() || !v.is_finite() || u.abs()>1024. || v.abs()>1024. {return invalid("Unsupported model shader UV scale");}
        [if u==0.{1.}else{u},if v==0.{1.}else{v}]
    }else{[1.,1.]};
    let reflection=if let Some(reference)=tag.references.iter().find(|v|v.label=="Reflection cube map"){
        let model=tag.class=="soso";let glass=tag.class=="sgla";let perpendicular=r.f32(at+if model{0x144}else if glass{0x8c}else{0x2f4})?;let parallel=r.f32(at+if model{0x154}else if glass{0x9c}else{0x2f8})?;
        let tint=|offset:usize|->[f32;3]{std::array::from_fn(|i|r.f32(at+offset+i*4).unwrap_or(f32::NAN))};
        let perp=if model{tint(0x148)}else if glass{tint(0x90)}else{tint(0x2a8)};let para=if model{tint(0x158)}else if glass{tint(0xa0)}else{tint(0x2b4)};
        let falloff=if model{r.f32(at+0x13c)?}else{0.};let cutoff=if model{r.f32(at+0x140)?}else{0.};
        if [perpendicular,parallel].iter().all(|v|v.is_finite()&&(0.0..=1.0).contains(v))&&perp.iter().chain(&para).all(|v|v.is_finite()&&(0.0..=1.0).contains(v))&&[falloff,cutoff].iter().all(|v|v.is_finite()&&(0.0..=1e6).contains(v)){
            Some(ShaderReflection{bitmap_tag_id:reference.target_id,perpendicular_brightness:perpendicular,parallel_brightness:parallel,perpendicular_tint:perp,parallel_tint:para,falloff,cutoff})
        }else{None}
    }else{None};
    let glass=tag.class=="sgla";
    let glass_tint=if glass {let rgb=[r.f32(at+0x54)?,r.f32(at+0x58)?,r.f32(at+0x5c)?];if rgb.iter().any(|v|!(0.0..=1.0).contains(v)){return invalid("Glass background tint is invalid");}Some(rgb)}else{None};
    let model_detail=tag.class=="soso"&&tag.references.iter().any(|v|v.label=="Detail map");
    let self_illumination=if tag.class=="soso"&&tag.references.iter().any(|v|v.label=="Multipurpose map"){
        let source=r.u16(at+0x70)?;let function=r.u16(at+0x72)?;let period=r.f32(at+0x74)?;
        let lower=[r.f32(at+0x78)?,r.f32(at+0x7c)?,r.f32(at+0x80)?];let upper=[r.f32(at+0x84)?,r.f32(at+0x88)?,r.f32(at+0x8c)?];
        if source>4||function>11||!period.is_finite()||!(0.0..=86400.).contains(&period)||lower.iter().chain(&upper).any(|v|!v.is_finite()||!(0.0..=1.0).contains(v)){return invalid("Model self-illumination metadata is invalid");}
        Some(ShaderSelfIllumination{source,function,period:if period==0.{1.}else{period},lower,upper})
    }else{None};
    tag.shader_preview=Some(ShaderPreview{self_illumination,glass_diffuse_absent:glass_diffuse_absent.then_some(true),change_color_source:if tag.class=="soso"{Some(r.u16(at+76)?).filter(|v|*v<=4)}else{None},reflection,glass_tint,glass_tint_scale:if glass&&tag.references.iter().any(|v|v.label=="Background tint map"){Some(shader_scale(r,at+0x60)?)}else{None},detail_after_reflection:tag.class=="soso"&&flags&1!=0,detail_mask:if model_detail{r.u16(at+0xd6)?}else{0},detail_v_scale:if model_detail{shader_scale(r,at+0xec)?}else{1.},bump_is_specular:if glass{flags&8!=0}else{tag.class=="senv"&&flags&2!=0},alpha_test:if tag.class=="soso"{flags&12==0}else{flags&1!=0},
        multipurpose_xbox:tag.class=="soso"&&flags&64!=0,bump_scale:if tag.class=="senv"{r.f32(at+0x124).ok().filter(|v|v.abs()<=1024.&&*v!=0.).unwrap_or(1.)}else{1.},
        two_sided:if glass{flags&4!=0}else{tag.class=="soso"&&flags&2!=0},uv_scale:if glass{[shader_scale(r,at+0x154)?;2]}else{uv_scale},
        alpha_blended:glass||tag.class=="soso"&&flags&8!=0,decal:if glass{flags&2!=0}else{tag.class=="soso"&&flags&8!=0},
        kind:if tag.class=="senv"{"environment"}else if glass{"glass"}else{"model"}.into(),
        shader_type:if tag.class=="senv"{r.u16(at+0x2a)?}else{0},
        detail_function:if !glass&&tag.references.iter().any(|v|matches!(v.label.as_str(),"Primary detail map"|"Detail map")){r.u16(at+if tag.class=="senv"{0xb0}else{0xd4})?}else{0},
        micro_detail_function:if tag.references.iter().any(|v|v.label=="Micro detail map"){r.u16(at+0xf4)?}else{0},
        detail_scales:if tag.class=="senv"{[
            if tag.references.iter().any(|v|v.label=="Primary detail map"){shader_scale(r,at+0xb4)?}else{1.},
            if tag.references.iter().any(|v|v.label=="Secondary detail map"){shader_scale(r,at+0xc8)?}else{1.},
            if tag.references.iter().any(|v|v.label=="Micro detail map"){shader_scale(r,at+0xf8)?}else{1.}]}
            else{[if tag.references.iter().any(|v|v.label=="Detail map"){shader_scale(r,at+if glass{0x168}else{0xd8})?}else{1.},1.,1.]},..Default::default()});
    Ok(())
}
fn shader_scale(r:&Reader,at:usize)->Result<f32>{let v=r.f32(at)?;if v.abs()>1024.{return invalid("Shader UV scale exceeds supported range");}Ok(if v==0.{1.}else{v})}
fn chicago_bitmap_references(r:&Reader,space:&Space,tag:&mut Tag,ids:&std::collections::HashMap<u32,String>,at:usize)->Result<()> {
    let body=if tag.class=="schi"{108}else{120};
    if at<space.begin||at.checked_add(body).is_none_or(|end|end>space.end){return invalid("Chicago shader body escapes tag region");}
    r.bytes(at,body)?;
    if r.u16(at+0x2a)?!=0 {return invalid("Chicago cube-map stages need a distinct decoder");}
    let block=if tag.class=="scex"&&r.u32(at+0x54)?==0 {at+0x60}else{at+0x54};
    let count=r.u32(block)? as usize;if count==0||count>4{return invalid("Chicago map count outside supported 1–4 stages");}
    let table=space.pointer(r.u32(block+4)?,count*220)?;
    if table.checked_add(count*220).is_none_or(|end|end>space.end){return invalid("Chicago stage array escapes tag region");}
    r.bytes(table,count*220)?;
    let mut layers=vec![];
    for index in 0..count {let p=table+index*220;let reference=p+0x6c;let datum=r.u32(reference+12)?;
        if r.fourcc(reference)?!="bitm"||ids.get(&datum).is_none_or(|c|c!="bitm"){return invalid("Chicago bitmap stage has invalid class or datum");}
        let color_function=r.u16(p+0x2c)?;let alpha_function=r.u16(p+0x2e)?;
        if color_function>12||alpha_function>12{return invalid("Chicago colour/alpha function is unsupported");}
        layers.push(ShaderLayer{bitmap_tag_id:datum,uv_scale:[shader_scale(r,p+0x54)?,shader_scale(r,p+0x58)?],
            uv_offset:[r.f32(p+0x5c)?,r.f32(p+0x60)?],rotation:r.f32(p+0x64)?,color_function,alpha_function,
            flags:r.u16(p)?,animations:shader_transparent::animations(r,p+164)?,
            rotation_center:[r.f32(p+212)?,r.f32(p+216)?]});
        tag.references.push(TagReference{label:if index==0{"Base map".into()}else{format!("Chicago layer {index}")},target_id:datum,class:"bitm".into(),offset:reference});
    }
    tag.primary_bitmap_status=Some("resolved".into());tag.shader_preview=Some(ShaderPreview{kind:"chicago".into(),
        alpha_test:r.bytes(at+0x29,1)?[0]&1!=0,uv_scale:[1.,1.],two_sided:r.bytes(at+0x29,1)?[0]&4!=0,decal:r.bytes(at+0x29,1)?[0]&2!=0,framebuffer_blend:r.u16(at+0x2c)?,layers,..Default::default()});Ok(())
}

fn read_fields(
    r: &Reader,
    space: &Space,
    tag: &mut Tag,
    ids: &std::collections::HashMap<u32, String>,
    version: u32,
) -> Result<()> {
    let Some(at) = tag.data_offset else {
        return Ok(());
    };
    // The same bounded ModelShaderReference block used by the native model
    // renderer. Expose exact identities for inspection, never editable offsets:
    // a model's geometry-part shader index belongs to this 32-byte table.
    if matches!(version,5|6|7|13|609)&&matches!(tag.class.as_str(),"mode"|"mod2") {
        space.pointer(space.address+(at-space.begin)as u32,232)?;
        let (shaders,count)=space.block(r,at+220,32,32)?;
        for index in 0..count {
            let reference_at=shaders+index*32;
            if matches!(r.fourcc(reference_at)?.as_str(),"senv"|"soso"|"schi"|"scex"|"sotr"|"sgla"|"swat"|"spla"|"smet") {
                reference(r,tag,reference_at,&format!("Shader {}",index+1),None,ids)?;
            }
        }
    }
    if matches!(version,6|7|13|609) && matches!(tag.class.as_str(),"DeLa"|"tagc"|"Soul") {
        ui_tags::read(r,space,tag,ids)?;
    }
    if matches!(version,5|6|7|13|609)&&tag.class=="snd!" {
        space.pointer(space.address+(at-space.begin)as u32,164)?;
        for (offset,key,label,max,unit) in [(8,"sound-min-distance","Minimum audible distance",20000.,"world units"),
            (12,"sound-max-distance","Maximum audible distance",20000.,"world units"),
            (16,"sound-skip-fraction","Skip fraction",1.,""),(20,"sound-pitch-min","Minimum playback pitch",16.,"rate"),
            (24,"sound-pitch-max","Maximum playback pitch",16.,"rate"),(36,"sound-outer-gain","Outer cone gain",1.,""),
            (40,"sound-random-gain","Random gain modifier",1.,"")] {
            numeric(r,tag,at+offset,key,label,max,unit)?;
        }
        reference(r,tag,at+112,"Promotion sound",Some("snd!"),ids)?;
    }
    if matches!(version,5|6|7|13|609)&&tag.class=="lsnd" {
        space.pointer(space.address+(at-space.begin)as u32,84)?;
        let (tracks,count)=space.block(r,at+60,160,4)?;
        for index in 0..count {let track=tracks+index*160;
            for (offset,key,label,max) in [(4,"gain","Gain",1.),(8,"fade-in","Fade in duration",600.),(12,"fade-out","Fade out duration",600.)]{
                numeric(r,tag,track+offset,&format!("loop-{index}-{key}"),&format!("Track {} · {label}",index+1),max,if offset==4{""}else{"seconds"})?;
            }
            for (offset,label) in [(48,"Start"),(64,"Loop"),(80,"End"),(128,"Alternate loop"),(144,"Alternate end")]{
                reference(r,tag,track+offset,&format!("Track {} · {label}",index+1),Some("snd!"),ids)?;
            }
        }
        let (details,count)=space.block(r,at+72,104,32)?;
        for index in 0..count {reference(r,tag,details+index*104,&format!("Detail sound {}",index+1),Some("snd!"),ids)?;}
    }
    // PC-derived layouts, including the verified MCC v13 classic shader bodies.
    if matches!(tag.class.as_str(), "senv" | "soso" | "sgla" | "smet") && matches!(version, 5 | 6 | 7 | 13 | 609) {
        shader_bitmap_references(r, space, tag, ids, at)?;
        if version==5&&tag.class=="soso"{if let Some(preview)=tag.shader_preview.as_mut(){preview.multipurpose_xbox=true;}}
    }
    if matches!(tag.class.as_str(),"schi"|"scex")&&matches!(version,5|6|7|13|609){chicago_bitmap_references(r,space,tag,ids,at)?;}
    if tag.class=="sotr"&&matches!(version,5|6|7|13|609){shader_transparent::inspect(r,space,tag,ids,at)?;}
    // Read-only dependency metadata from Invader's HEK definitions. Actor variants
    // and item collections can drive AI even when the scenario has no encounters.
    if tag.class == "actv" {
        space.pointer(space.address + (at - space.begin) as u32, 568)?;
        for (offset, label) in [
            (4, "Actor definition"),
            (20, "Actor unit"),
            (36, "Major actor variant"),
            (100, "Actor weapon"),
            (448, "Actor equipment"),
        ] {
            reference(r, tag, at + offset, label, None, ids)?;
        }
    }
    if tag.class == "itmc" {
        space.pointer(space.address + (at - space.begin) as u32, 92)?;
        let (permutations, count) = space.block(r, at, 84, 32)?;
        for i in 0..count {
            reference(
                r,
                tag,
                permutations + i * 84 + 36,
                &format!("Item permutation {}", i + 1),
                None,
                ids,
            )?;
        }
    }
    if ["bipd", "vehi"].contains(&tag.class.as_str()) {
        space.pointer(space.address + (at - space.begin) as u32, 752)?;
        reference(r, tag, at + 588, "Spawned actor", None, ids)?;
        let (seats, count) = space.block(r, at + 740, 284, 16)?;
        for i in 0..count {
            reference(
                r,
                tag,
                seats + i * 284 + 248,
                &format!("Seat {} · built-in actor", i + 1),
                None,
                ids,
            )?;
        }
        let (weapons, count) = space.block(r, at + 728, 36, 4)?;
        for i in 0..count {
            reference(
                r,
                tag,
                weapons + i * 36,
                &format!("Unit weapon {}", i + 1),
                None,
                ids,
            )?;
        }
    }
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
        // Object attachments include the actual looping sounds used by placed
        // sound-scenery emitters. Keep tag identity instead of name guessing.
        let (attachments,count)=space.block(r,at+0x140,72,8)?;
        for i in 0..count{reference(r,tag,attachments+i*72,&format!("Attachment {}",i+1),None,ids)?;}
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
            if r.fourcc(t + 0x94)? != "proj" {
                // Historical spawner mods place a different object class in this
                // slot. Expose the observed dependency without offering an edit
                // or claiming the target runtime supports that legacy behavior.
                reference(
                    r,
                    tag,
                    t + 0x94,
                    &format!("Trigger {} · legacy object spawner (read-only)", i + 1),
                    None,
                    ids,
                )?;
            }
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
    diagnostics: &mut Vec<Diagnostic>,
) -> Result<Vec<SceneObject>> {
    let (offset, palette, stride, kind) = block;
    let (at, n) = space.block(r, sc + offset, stride, 4096)?;
    let (pal, pn) = space.block(r, sc + palette, 48, 4096)?;
    let mut rows = vec![];
    for i in 0..n {
        let p = at + i * stride;
        let idx = r.u16(p)? as usize;
        if idx >= pn && idx != u16::MAX as usize {
            diagnostics.push(Diagnostic::warning("INVALID_PLACEMENT_TYPE", format!("{kind} placement {i} has palette index {idx}, outside {pn} entries. Its intended object cannot be established.")));
        }
        let tid = if idx < pn {
            Some(r.u32(pal + idx * 48 + 12)?)
        } else {
            None
        };
        let name = tid
            .and_then(|id| tags.iter().find(|t| t.id == id))
            .map(|t| t.path.rsplit('\\').next().unwrap_or(&t.path).to_string())
            .unwrap_or_else(|| kind.into());
        let expected_class = match kind {
            "Scenery" => "scen",
            "Biped" => "bipd",
            "Vehicle" => "vehi",
            "Equipment" => "eqip",
            "Weapon" => "weap",
            "Machine" => "mach",
            "Sound scenery" => "ssce",
            _ => "",
        };
        if let Some(target) = tid.and_then(|id| tags.iter().find(|t| t.id == id)) {
            if target.class != expected_class {
                diagnostics.push(Diagnostic::warning("LEGACY_PLACEMENT_CLASS", format!("{kind} placement {i} references {} tag '{}'. This legacy cross-class placement may be rejected by the target compiler.", target.class, target.path)));
            }
        }
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
            source_model: None,
        });
    }
    Ok(rows)
}
#[derive(Clone,Debug)]
pub(crate) struct CollisionFace { pub shader:Option<u32>,pub flags:u8,pub normal:[f32;3] }
// Collision surfaces can be concave. A fan creates overlapping source faces;
// use a bounded planar ear clipping pass when recovering editable geometry.
pub(crate) fn source_polygon_triangles(poly:&[u32],positions:&[f32])->Result<Vec<[u32;3]>>{
    if poly.len()<3{return Ok(vec![]);}let p:Vec<[f64;3]>=poly.iter().map(|v|std::array::from_fn(|k|positions[*v as usize*3+k] as f64)).collect();let mut normal=[0.;3];for n in 0..p.len(){let(a,b)=(p[n],p[(n+1)%p.len()]);normal[0]+=(a[1]-b[1])*(a[2]+b[2]);normal[1]+=(a[2]-b[2])*(a[0]+b[0]);normal[2]+=(a[0]-b[0])*(a[1]+b[1]);}
    let drop=(0..3).max_by(|a,b|normal[*a].abs().total_cmp(&normal[*b].abs())).unwrap();if normal[drop].abs()<1e-12{return Ok(vec![]);}let axes:Vec<_>=(0..3).filter(|v|*v!=drop).collect();let q:Vec<[f64;2]>=p.iter().map(|p|[p[axes[0]],p[axes[1]]]).collect();let cross=|a:[f64;2],b:[f64;2],c:[f64;2]|(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);let area=(0..q.len()).map(|i|q[i][0]*q[(i+1)%q.len()][1]-q[(i+1)%q.len()][0]*q[i][1]).sum::<f64>();let sign=area.signum();let mut remaining:Vec<_>=(0..poly.len()).collect();let mut out=vec![];
    while remaining.len()>3{let mut found=false;for at in 0..remaining.len(){let a=remaining[(at+remaining.len()-1)%remaining.len()];let b=remaining[at];let c=remaining[(at+1)%remaining.len()];if cross(q[a],q[b],q[c])*sign<=1e-12{continue;}if remaining.iter().copied().filter(|v|*v!=a&&*v!=b&&*v!=c).any(|p|cross(q[a],q[b],q[p])*sign>=-1e-12&&cross(q[b],q[c],q[p])*sign>=-1e-12&&cross(q[c],q[a],q[p])*sign>=-1e-12){continue;}out.push([poly[a],poly[b],poly[c]]);remaining.remove(at);found=true;break;}if !found{return invalid("Collision polygon cannot be triangulated without overlapping source faces");}}
    if remaining.len()==3&&cross(q[remaining[0]],q[remaining[1]],q[remaining[2]]).abs()>1e-12{out.push([poly[remaining[0]],poly[remaining[1]],poly[remaining[2]]]);}Ok(out)
}
fn source_active_surfaces(r:&Reader,space:&Space,root:usize,surfaces:usize)->Result<Vec<bool>>{
    let (nodes,nodes_count)=space.block(r,root,12,262144)?;let(leaves,leaf_count)=space.block(r,root+0x18,8,262144)?;let(references,ref_count)=space.block(r,root+0x24,8,262144)?;let(nodes2d,count2d)=space.block(r,root+0x30,20,262144)?;
    let mut active=vec![false;surfaces];let mut visited=vec![false;nodes_count];let mut leaves_seen=vec![false;leaf_count];let mut nodes2d_seen=vec![false;count2d];let mut stack=vec![if nodes_count==0{0x80000000}else{0}];let mut references_to_walk=vec![];
    while let Some(child)=stack.pop(){if child==u32::MAX{continue;}if child&0x80000000!=0{let index=(child&0x7fffffff) as usize;if index>=leaf_count{return invalid("Source BSP3D leaf index is invalid");}if leaves_seen[index]{continue;}leaves_seen[index]=true;let row=leaves+index*8;let count=r.u16(row+2)? as usize;if count==0{continue;}let first=r.u32(row+4)? as usize;if first.checked_add(count).is_none_or(|end|end>ref_count){return invalid("Source BSP2D reference range is invalid");}for index in first..first+count{references_to_walk.push(r.u32(references+index*8+4)?);}}else{let index=child as usize;if index>=nodes_count{return invalid("Source BSP3D node index is invalid");}if visited[index]{continue;}visited[index]=true;stack.push(r.u32(nodes+index*12+4)?);stack.push(r.u32(nodes+index*12+8)?);}}
    while let Some(child)=references_to_walk.pop(){if child==u32::MAX{continue;}if child&0x80000000!=0{let index=(child&0x7fffffff) as usize;if index>=surfaces{return invalid("Source BSP2D surface index is invalid");}active[index]=true;}else{let index=child as usize;if index>=count2d{return invalid("Source BSP2D node index is invalid");}if nodes2d_seen[index]{continue;}nodes2d_seen[index]=true;references_to_walk.push(r.u32(nodes2d+index*20+12)?);references_to_walk.push(r.u32(nodes2d+index*20+16)?);}}
    Ok(active)
}
pub(crate) fn collision_source(path:&Path,inspection:&MapInspection)->Result<(MeshData,Vec<CollisionFace>)>{
    let (header,bytes,hash)=read_cache_snapshot(path)?;
    if hash!=inspection.sha256{return invalid("BSP source changed after inspection");}
    collision_snapshot(&header,&bytes,inspection)
}
pub(crate) fn collision_snapshot(header:&MapHeader,bytes:&[u8],inspection:&MapInspection)->Result<(MeshData,Vec<CollisionFace>)>{
    let r=Reader(&bytes);let start=header.tag_offset as usize;let array=r.u32(start)?;
    let address=match header.version{5=>0x803a6000,6=>0x4bf10000,13=>array.checked_sub(0x28).ok_or_else(||SparkError::Invalid("Invalid MCC index".into()))?,_=>0x40440000};
    let space=Space{begin:start,end:start+header.tag_size as usize,address};
    let sc=inspection.tags.iter().find(|t|t.class=="scnr"&&t.path==inspection.scenario_path).and_then(|t|t.data_offset).ok_or_else(||SparkError::Invalid("BSP scenario is unavailable".into()))? as usize;
    let mut faces=vec![];let mesh=collision_mesh_record(&r,&space,sc,&inspection.tags,Some(&mut faces))?;Ok((mesh,faces))
}
pub(crate) fn scenery_parameters(path: &Path, inspection: &MapInspection) -> Result<std::collections::BTreeMap<String, (u16, i16)>> {
    let (_, bytes, hash) = read_cache_snapshot(path)?;
    if hash != inspection.sha256 { return invalid("Scenery source changed after inspection"); }
    let r = Reader(&bytes);
    let mut parameters = std::collections::BTreeMap::new();
    for object in inspection.objects.iter().filter(|o| o.kind == "Scenery") {
        let position = object.source_offset.ok_or_else(|| SparkError::Invalid("Scenery has no source placement record".into()))?;
        let flags = position.checked_sub(4).ok_or_else(|| SparkError::Invalid("Invalid scenery placement offset".into()))?;
        if vec3(&r, position)? != object.position { return invalid("Scenery source position differs from its inspection"); }
        parameters.insert(object.id.clone(), (r.u16(flags)?, r.u16(flags + 2)? as i16));
    }
    Ok(parameters)
}
pub(crate) fn render_bsp_source(path:&Path,inspection:&MapInspection,index:usize)->Result<MeshData>{let(header,bytes,hash)=read_cache_snapshot(path)?;if hash!=inspection.sha256{return invalid("BSP source changed after inspection");}let scenario=inspection.tags.iter().find(|t|t.class=="scnr"&&t.path==inspection.scenario_path).and_then(|t|t.data_offset).ok_or_else(||SparkError::Invalid("BSP scenario is unavailable".into()))? as usize;crate::render::bsp_render_geometry_selected(&bytes,&header,scenario,Some(index))}
fn collision_mesh(r: &Reader, space: &Space, sc: usize, tags: &[Tag]) -> Result<MeshData> {
    collision_mesh_record(r,space,sc,tags,None)
}
fn collision_mesh_record(r: &Reader, space: &Space, sc: usize, tags: &[Tag],mut records:Option<&mut Vec<CollisionFace>>) -> Result<MeshData> {
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
        let mut material_ids=vec![];
        if records.is_some(){let (at,n)=bsp_space.block(r,bsp+0xa4,20,512)?;for m in 0..n{material_ids.push(r.u32(at+m*20+12)?);}}
        let (blocks, bn) = bsp_space.block(r, bsp + 0xb0, 96, 16)?;
        for b in 0..bn {
            let root = blocks + b * 96;
            let(planes,plane_count)=if records.is_some(){bsp_space.block(r,root+0xc,16,262144)?}else{(0,0)};
            let (surfaces, sn) = bsp_space.block(r, root + 0x3c, 12, 131072)?;
            let active=if records.is_some(){Some(source_active_surfaces(r,&bsp_space,root,sn)?)}else{None};
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
                if active.as_ref().is_some_and(|used|!used[s]){continue;}
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
                let triangles=if records.is_some(){source_polygon_triangles(&poly,&mesh.positions)?}else{(1..poly.len().saturating_sub(1)).map(|v|[poly[0],poly[v],poly[v+1]]).collect()};
                for triangle in triangles {
                    mesh.indices.extend_from_slice(&triangle);
                    if let Some(rows)=records.as_deref_mut(){let material=r.u16(surfaces+s*12+10)?;let shader=if material==u16::MAX{None}else{Some(*material_ids.get(material as usize).ok_or_else(||SparkError::Invalid("BSP collision material index is invalid".into()))?)};let plane=r.u32(surfaces+s*12)?;let index=(plane&0x7fffffff) as usize;if index>=plane_count{return invalid("BSP collision surface plane is invalid");}let mut normal=vec3(r,planes+index*16)?;if plane&0x80000000!=0{normal=normal.map(|v|-v);}rows.push(CollisionFace{shader,flags:r.bytes(surfaces+s*12+8,1)?[0],normal});}
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
pub(crate) fn validate_ui_layout(project:&crate::project::Project,inspection:&MapInspection)->Result<()> {
    ui_tags::validate_layout(project,inspection)
}

#[cfg(test)]
mod shader_dependency_tests {
    use super::*;
    #[test]
    fn native_meter_shader_is_bounded_exact_and_read_only(){
        let at=64;let mut b=vec![0u8;512];b[at+40..at+42].copy_from_slice(&17u16.to_le_bytes());install_ref(&mut b,at+76,21,b"mtib");
        for (i,v) in [0.45f32,0.9,0.07].iter().enumerate(){b[at+124+i*4..at+128+i*4].copy_from_slice(&v.to_le_bytes());}
        b[at+220..at+222].copy_from_slice(&3u16.to_le_bytes());b[at+224..at+226].copy_from_slice(&3u16.to_le_bytes());
        let ids=std::collections::HashMap::from([(21,"bitm".into())]);let region=Space{begin:0,end:b.len(),address:0};let original=b.clone();
        for version in [5,6,7,13,609]{let mut tag=shader_fixture("smet");read_fields(&Reader(&b),&region,&mut tag,&ids,version).unwrap();assert!(tag.fields.is_empty());assert_eq!(tag.references.len(),1);assert_eq!(tag.references[0].target_id,21);let p=tag.shader_preview.unwrap();assert_eq!(p.kind,"meter");assert!(!p.two_sided);assert!(p.decal&&p.alpha_blended);let m=p.meter.unwrap();assert_eq!(m.flags,17);assert_eq!(m.sources,[0,0,3,0,3]);assert_eq!(m.gradient_min,[0.45,0.9,0.07]);}
        assert_eq!(b,original);
        let short=Space{end:at+259,..region};assert!(shader_bitmap_references(&Reader(&b),&short,&mut shader_fixture("smet"),&ids,at).is_err());
        for (offset,value)in [(124,f32::NAN),(184,1.1),(188,-0.1)]{let mut corrupt=b.clone();corrupt[at+offset..at+offset+4].copy_from_slice(&value.to_le_bytes());assert!(shader_bitmap_references(&Reader(&corrupt),&region,&mut shader_fixture("smet"),&ids,at).is_err());}
        b[at+220..at+222].copy_from_slice(&5u16.to_le_bytes());assert!(shader_bitmap_references(&Reader(&b),&region,&mut shader_fixture("smet"),&ids,at).is_err());
        let mut bad=shader_fixture("smet");shader_bitmap_references(&Reader(&original),&region,&mut bad,&std::collections::HashMap::new(),at).unwrap();assert_eq!(bad.primary_bitmap_status.as_deref(),Some("invalid"));assert!(bad.shader_preview.is_none());
    }
    #[test]
    fn native_model_shader_links_are_bounded_exact_and_read_only() {
        let mut bytes=vec![0u8;640];
        bytes[64+220..64+224].copy_from_slice(&3u32.to_le_bytes());
        bytes[64+224..64+228].copy_from_slice(&400u32.to_le_bytes());
        install_ref(&mut bytes,400,17,b"osos");
        install_ref(&mut bytes,432,18,b"algs");
        install_ref(&mut bytes,464,19,b"!dns");
        let original=bytes.clone();
        let ids=std::collections::HashMap::from([(17,"soso".into()),(18,"sgla".into()),(19,"snd!".into())]);
        let region=Space{begin:0,end:bytes.len(),address:0};
        for (version,class) in [(5,"mode"),(6,"mod2"),(7,"mod2"),(13,"mod2"),(609,"mod2")] {
            let mut tag=shader_fixture(class);read_fields(&Reader(&bytes),&region,&mut tag,&ids,version).unwrap();
            assert_eq!(tag.references.len(),2);assert!(tag.fields.is_empty());
            assert_eq!((tag.references[0].target_id,tag.references[1].target_id),(17,18));
            assert_eq!(tag.references[1].offset,432);
        }
        assert_eq!(bytes,original);
        let wrong=std::collections::HashMap::from([(17,"bitm".into())]);
        let mut tag=shader_fixture("mod2");read_fields(&Reader(&bytes),&region,&mut tag,&wrong,13).unwrap();assert!(tag.references.is_empty());
        for (count,pointer) in [(33u32,400u32),(2,620),(1,32)] {
            bytes[64+220..64+224].copy_from_slice(&count.to_le_bytes());bytes[64+224..64+228].copy_from_slice(&pointer.to_le_bytes());
            let bounded=Space{begin:64,end:bytes.len(),address:64};
            assert!(read_fields(&Reader(&bytes),&bounded,&mut shader_fixture("mod2"),&ids,13).is_err());
        }
    }
    #[test]
    fn recovered_concave_collision_preserves_area_and_winding() {
        let positions = [0.,0.,0.,2.,0.,0.,2.,1.,0.,1.,1.,0.,1.,2.,0.,0.,2.,0.];
        for polygon in [vec![2,3,4,5,0,1],vec![1,0,5,4,3,2]] {
            let triangles = source_polygon_triangles(&polygon,&positions).unwrap();
            assert_eq!(triangles.len(),4);
            let areas: Vec<_> = triangles.iter().map(|t| {
                let p:Vec<_> = t.iter().map(|i| &positions[*i as usize*3..*i as usize*3+2]).collect();
                ((p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]))/2.
            }).collect();
            assert!(areas.iter().all(|a| a.signum()==areas[0].signum()));
            assert!((areas.iter().sum::<f32>().abs()-3.).abs()<1e-6);
        }
    }
    fn shader_fixture(class: &str) -> Tag {
        Tag {
            id: 1,
            index: 0,
            class: class.into(),
            path: "test/shaders/fixture".into(),
            data_offset: Some(64),
            external: false,
            fields: vec![],
            references: vec![],
            primary_bitmap_status:Some("unavailable".into()),shader_preview:None,
        }
    }
    fn install_ref(bytes: &mut [u8], field: usize, datum: u32, class: &[u8; 4]) {
        // FourCC on disk is byte-reversed by the cache Reader.
        bytes[field..field + 4].copy_from_slice(class);
        bytes[field + 12..field + 16].copy_from_slice(&datum.to_le_bytes());
    }
    #[test]
    fn classic_environment_base_is_distinct_from_detail_and_bump() {
        let mut bytes = vec![0xff; 1200];
        install_ref(&mut bytes, 64 + 0x88, 44, b"mtib");
        install_ref(&mut bytes, 64 + 0xB8, 45, b"mtib");
        install_ref(&mut bytes, 64 + 0x128, 46, b"mtib");
        let ids = std::collections::HashMap::from([
            (44, "bitm".to_string()),
            (45, "bitm".to_string()),
            (46, "bitm".to_string()),
        ]);
        let region = Space {begin: 0, end: bytes.len(), address: 0};
        bytes[64+0xb4..64+0xb8].copy_from_slice(&1f32.to_le_bytes());
        let mut tag = shader_fixture("senv");
        shader_bitmap_references(&Reader(&bytes), &region, &mut tag, &ids, 64).unwrap();
        assert_eq!(tag.primary_bitmap_status.as_deref(), Some("resolved"));
        assert_eq!(tag.references.len(), 3);
        assert_eq!(tag.references[0].target_id, 44);
        assert_eq!(tag.references[0].label, "Base map");
        assert_eq!(tag.references[1].label, "Primary detail map");
        assert_eq!(tag.references[2].label, "Bump map");
        assert!(!tag.shader_preview.as_ref().unwrap().two_sided,"environment shaders must not invent a two-sided flag");
        assert!(tag.fields.is_empty(), "preview metadata must not become writable fields");
    }
    #[test]
    fn model_shader_uses_diffuse_not_multipurpose() {
        let mut bytes = vec![0xff; 1200];
        install_ref(&mut bytes, 64 + 0xA4, 88, b"mtib");
        install_ref(&mut bytes, 64 + 0xBC, 89, b"mtib");
        let ids = std::collections::HashMap::from([
            (88, "bitm".to_string()),
            (89, "bitm".to_string()),
        ]);
        let region = Space {begin: 0, end: bytes.len(), address: 0};
        bytes[0x40+0x9c..0x40+0xa4].copy_from_slice(&[0,0,128,63,0,0,128,63]);
        bytes[64+0x70..64+0x90].fill(0);
        bytes[64+0x72..64+0x74].copy_from_slice(&2u16.to_le_bytes());
        bytes[64+0x74..64+0x78].copy_from_slice(&2f32.to_le_bytes());
        bytes[64+0x84..64+0x88].copy_from_slice(&0.75f32.to_le_bytes());
        let mut tag = shader_fixture("soso");
        shader_bitmap_references(&Reader(&bytes), &region, &mut tag, &ids, 64).unwrap();
        assert_eq!(tag.primary_bitmap_status.as_deref(), Some("resolved"));
        assert_eq!(tag.references.len(), 2);
        assert_eq!(tag.references[0].label, "Diffuse map");
        assert_eq!(tag.references[1].label, "Multipurpose map");
        let glow=tag.shader_preview.unwrap().self_illumination.unwrap();assert_eq!(glow.function,2);assert_eq!(glow.period,2.);assert_eq!(glow.upper,[0.75,0.,0.]);
        bytes[64+0x84..64+0x88].copy_from_slice(&f32::NAN.to_le_bytes());let mut bad=shader_fixture("soso");assert!(shader_bitmap_references(&Reader(&bytes),&region,&mut bad,&ids,64).is_err());
    }
    #[test]
    fn model_detail_order_preserves_the_native_flag_without_reinterpreting_environment_alpha() {
        let mut bytes=vec![0u8;1200];let at=64;
        install_ref(&mut bytes,at+0xa4,88,b"mtib");
        let ids=std::collections::HashMap::from([(88,"bitm".into())]);
        let region=Space{begin:0,end:bytes.len(),address:0};
        for flags in [0u16,1,4,64,65] {
            bytes[at+40..at+42].copy_from_slice(&flags.to_le_bytes());
            let original=bytes.clone();let mut tag=shader_fixture("soso");
            shader_bitmap_references(&Reader(&bytes),&region,&mut tag,&ids,at).unwrap();
            let preview=tag.shader_preview.unwrap();assert_eq!(preview.detail_after_reflection,flags&1!=0);
            assert!(tag.fields.is_empty());assert_eq!(bytes,original);
            let mut old=serde_json::to_value(&preview).unwrap();old.as_object_mut().unwrap().remove("detailAfterReflection");
            assert!(!serde_json::from_value::<ShaderPreview>(old).unwrap().detail_after_reflection);
        }
        install_ref(&mut bytes,at+0x88,88,b"mtib");bytes[at+40..at+42].copy_from_slice(&1u16.to_le_bytes());
        let mut environment=shader_fixture("senv");shader_bitmap_references(&Reader(&bytes),&region,&mut environment,&ids,at).unwrap();
        let preview=environment.shader_preview.unwrap();assert!(preview.alpha_test);assert!(!preview.detail_after_reflection);
    }
    #[test]
    fn native_model_decals_disable_cutout_without_changing_opaque_or_environment_flags(){
        let mut bytes=vec![0u8;1200];let at=64;
        install_ref(&mut bytes,at+0xa4,88,b"mtib");
        let ids=std::collections::HashMap::from([(88,"bitm".into())]);
        let region=Space{begin:0,end:bytes.len(),address:0};
        for flags in [0u16,1,2,4,8,9,12,64,72] {
            bytes[at+40..at+42].copy_from_slice(&flags.to_le_bytes());
            let original=bytes.clone();let mut tag=shader_fixture("soso");
            shader_bitmap_references(&Reader(&bytes),&region,&mut tag,&ids,at).unwrap();
            let preview=tag.shader_preview.unwrap();
            assert_eq!(preview.alpha_test,flags&12==0,"native model flags {flags:#x}");
            assert_eq!(preview.alpha_blended,flags&8!=0);assert_eq!(preview.decal,flags&8!=0);
            assert!(tag.fields.is_empty());assert_eq!(bytes,original);
        }
    }
    #[test]
    fn native_glass_keeps_tint_reflection_and_transparency_instead_of_an_opaque_shell(){
        let mut bytes=vec![0u8;1200];let at=64;
        install_ref(&mut bytes,at+0x158,17,b"mtib");install_ref(&mut bytes,at+0xac,18,b"mtib");
        bytes[at+40..at+42].copy_from_slice(&4u16.to_le_bytes());
        for(offset,value)in [(0x54,0.65f32),(0x58,0.7),(0x5c,1.),(0x8c,0.25),(0x9c,1.),(0x154,1.)]{bytes[at+offset..at+offset+4].copy_from_slice(&value.to_le_bytes());}
        for offset in [0x90,0x94,0x98,0xa0,0xa4,0xa8]{bytes[at+offset..at+offset+4].copy_from_slice(&1f32.to_le_bytes());}
        let region=Space{begin:0,end:bytes.len(),address:0};let ids=std::collections::HashMap::from([(17,"bitm".into()),(18,"bitm".into())]);let mut tag=shader_fixture("sgla");
        shader_bitmap_references(&Reader(&bytes),&region,&mut tag,&ids,at).unwrap();let preview=tag.shader_preview.unwrap();
        assert_eq!(preview.kind,"glass");assert!(preview.alpha_blended&&preview.two_sided);assert_eq!(preview.glass_tint,Some([0.65,0.7,1.]));assert_eq!(preview.reflection.unwrap().bitmap_tag_id,18);
        // Xbox Pelican glass intentionally has no diffuse image. Keep its
        // exact reflection/tint rather than discarding the material or using
        // the reflection cube as if it were an ordinary 2D base map.
        bytes[at+0x158+12..at+0x158+16].copy_from_slice(&u32::MAX.to_le_bytes());
        let mut absent=shader_fixture("sgla");shader_bitmap_references(&Reader(&bytes),&region,&mut absent,&ids,at).unwrap();
        assert_eq!(absent.primary_bitmap_status.as_deref(),Some("not-required"));
        let absent=absent.shader_preview.unwrap();assert_eq!(absent.glass_diffuse_absent,Some(true));assert_eq!(absent.reflection.unwrap().bitmap_tag_id,18);
        install_ref(&mut bytes,at+0x158,999,b"mtib");let mut invalid=shader_fixture("sgla");shader_bitmap_references(&Reader(&bytes),&region,&mut invalid,&ids,at).unwrap();assert_eq!(invalid.primary_bitmap_status.as_deref(),Some("invalid"));assert!(invalid.shader_preview.is_none());
        install_ref(&mut bytes,at+0x158,17,b"mtib");
        let mut corrupt=shader_fixture("sgla");bytes[at+0x54..at+0x58].copy_from_slice(&f32::NAN.to_le_bytes());assert!(shader_bitmap_references(&Reader(&bytes),&region,&mut corrupt,&ids,at).is_err());
    }
    #[test]
    fn glass_tint_map_has_its_own_exact_dependency_scale_and_bounds() {
        let mut bytes=vec![0u8;1200];let at=64;
        for offset in [0x158,0x16c,0xc0,0xac]{bytes[at+offset+12..at+offset+16].copy_from_slice(&u32::MAX.to_le_bytes());}
        install_ref(&mut bytes,at+0x64,88,b"mtib");
        bytes[at+0x60..at+0x64].copy_from_slice(&2f32.to_le_bytes());
        let ids=std::collections::HashMap::from([(88,"bitm".into())]);let region=Space{begin:0,end:bytes.len(),address:0};
        let original=bytes.clone();let mut tag=shader_fixture("sgla");
        shader_bitmap_references(&Reader(&bytes),&region,&mut tag,&ids,at).unwrap();
        assert_eq!(tag.references.len(),1);assert_eq!(tag.references[0].label,"Background tint map");assert_eq!(tag.references[0].target_id,88);
        let preview=tag.shader_preview.unwrap();assert_eq!(preview.glass_tint_scale,Some(2.));assert_eq!(preview.glass_diffuse_absent,Some(true));
        assert!(tag.fields.is_empty());assert_eq!(bytes,original);
        bytes[at+0x60..at+0x64].copy_from_slice(&f32::NAN.to_le_bytes());
        assert!(shader_bitmap_references(&Reader(&bytes),&region,&mut shader_fixture("sgla"),&ids,at).is_err());
        let truncated=Space{begin:0,end:at+479,address:0};
        assert!(shader_bitmap_references(&Reader(&original),&truncated,&mut shader_fixture("sgla"),&ids,at).is_err());
    }
    #[test]
    fn shader_bitmap_id_mismatch_is_not_resolved() {
        let mut bytes = vec![0xff; 1200];
        install_ref(&mut bytes, 64 + 0x88, 17, b"mtib");
        let region = Space {begin: 0, end: bytes.len(), address: 0};
        let mut tag = shader_fixture("senv");
        let wrong_class = std::collections::HashMap::from([(17, "snd!".to_string())]);
        shader_bitmap_references(&Reader(&bytes), &region, &mut tag, &wrong_class, 64).unwrap();
        assert_eq!(tag.primary_bitmap_status.as_deref(), Some("invalid"));
        assert!(tag.references.is_empty());
        let mut empty_tag = shader_fixture("senv");
        shader_bitmap_references(&Reader(&vec![0xff; 1200]), &region, &mut empty_tag, &wrong_class, 64).unwrap();
        assert_eq!(empty_tag.primary_bitmap_status.as_deref(), Some("missing"));
    }
    #[test]
    fn shader_data_cannot_escape_the_tag_region() {
        let bytes = vec![0xff; 1200];
        let too_short = Space {begin: 0, end: 128, address: 0};
        let mut tag = shader_fixture("senv");
        assert!(shader_bitmap_references(&Reader(&bytes), &too_short, &mut tag,
            &std::collections::HashMap::new(), 64).is_err());
        assert!(tag.references.is_empty());
    }
    #[test]
    fn chicago_stages_keep_exact_image_id_and_uv_transform() {
        let mut bytes=vec![0u8;1200];
        bytes[64+0x54..64+0x58].copy_from_slice(&2u32.to_le_bytes());
        bytes[64+0x58..64+0x5c].copy_from_slice(&512u32.to_le_bytes());
        bytes[64+0x29]=5;
        for (index,id) in [44u32,45].into_iter().enumerate(){
            let at=512+index*220;install_ref(&mut bytes,at+0x6c,id,b"mtib");
            bytes[at+0x54..at+0x58].copy_from_slice(&(if index==0{1f32}else{6f32}).to_le_bytes());
            bytes[at+0x58..at+0x5c].copy_from_slice(&2f32.to_le_bytes());
        }
        let ids=std::collections::HashMap::from([(44,"bitm".into()),(45,"bitm".into())]);
        let region=Space{begin:0,end:1200,address:0};let mut tag=shader_fixture("schi");
        chicago_bitmap_references(&Reader(&bytes),&region,&mut tag,&ids,64).unwrap();
        let metadata=tag.shader_preview.unwrap();assert_eq!(metadata.layers.len(),2);
        assert_eq!(metadata.layers[1].bitmap_tag_id,45);assert_eq!(metadata.layers[1].uv_scale,[6.,2.]);
        assert!(metadata.alpha_test&&metadata.two_sided);
        // An unsupported array size or stage datum cannot authorize a bitmap.
        bytes[64+0x54..64+0x58].copy_from_slice(&5u32.to_le_bytes());
        assert!(chicago_bitmap_references(&Reader(&bytes),&region,&mut shader_fixture("schi"),&ids,64).is_err());
        bytes[64+0x54..64+0x58].copy_from_slice(&2u32.to_le_bytes());
        install_ref(&mut bytes,512+0x6c,99,b"mtib");
        assert!(chicago_bitmap_references(&Reader(&bytes),&region,&mut shader_fixture("schi"),&ids,64).is_err());
    }
}
