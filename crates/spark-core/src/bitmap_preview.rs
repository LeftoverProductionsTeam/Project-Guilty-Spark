//! Strictly read-only, bounded top-mip previews for classic PC bitmap
//! data. The source map is hashed as one immutable snapshot; no tag or pixel
//! byte is ever modified. A narrowly verified bitmaps.map resource range can
//! supply external raw pixels if its index proves exact provenance; external
//! tag metadata, swizzled, cube/3D and protected formats fail closed. Supported
//! MCC texture packs use the separate hash-pinned MCC reader in this module.
//! See docs/CONTINUATION_20_ENGINEERING.md and c20 H1 bitmap/map field guides.
use crate::{binary::Reader, invalid, maps::{self, MapHeader, MapInspection}, Result, SparkError};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs::File, path::Path};

const MAX_IMAGE_EDGE: u16 = 4096;
const MAX_IMAGE_PIXELS: u32 = 16_777_216;
const MAX_TOP_MIP_BYTES: usize = 16 * 1024 * 1024;
const MAX_IMAGES_PER_TAG: usize = 2048;
const MAX_BATCH_REQUESTS: usize = 24;
const MAX_BATCH_RAW_BYTES: usize = 16 * 1024 * 1024;

/// Keep reader reasons, without exposing OS errors or host paths to a report.
fn bitmap_failure(error: &SparkError) -> (&'static str, String) {
    let SparkError::Invalid(reason) = error else {
        return ("resource-unavailable", "The selected file could not be read; check that it is still available".into());
    };
    if reason.contains("Symbolic links") || reason.contains("Reparse points") {
        return ("verification-failed", "Resource links or junctions are unsupported; select the original regular file".into());
    }
    let code = if reason.contains("pinned bitmaps.map") || reason.contains("Choose and hash") {
        "missing-resource"
    } else if reason.contains("pixel format") { "unsupported-format"
    } else if reason.contains("Swizzled") || reason.contains("2D single") || reason.contains("external metadata") || reason.contains("tag-body provenance") {
        "unsupported-layout"
    } else if reason.contains("limit") || reason.contains("exceed") { "budget-exceeded"
    } else if reason.contains("exact bitmap") || reason.contains("Pixel range") || reason.contains("Multiple shared-resource") {
        "resource-mismatch"
    } else { "verification-failed" };
    (code, reason.chars().take(200).collect())
}
/// MCC top mips use the exact map-imeta entry and one identical pack entry.
/// Pack dimensions/encoding are authoritative; stock bitmap tag metadata can differ.
pub fn preview_mcc_bitmap_batch(path:&Path,expected:&str,inspection:&MapInspection,requests:&[OwnedBitmapRequest],directory:&Path,hashes:&std::collections::BTreeMap<String,String>)->Result<OwnedBitmapBatch>{
    if requests.is_empty()||requests.len()>MAX_BATCH_REQUESTS{return invalid("MCC preview requires 1 to 24 bitmap requests");}
    let(header,bytes,actual)=maps::read_cache_snapshot(path)?;if header.version!=13||actual!=expected||actual!=inspection.sha256{return invalid("MCC bitmap source snapshot changed");}
    let mut bundle:Option<crate::mcc_textures::TextureBundle>=None;
    let mut shared:Option<(File,crate::resource_map::ResourceIndex,String)>=None;
    let r=Reader(&bytes);let start=header.tag_offset as usize;let end=start+header.tag_size as usize;let base=r.u32(start)?.checked_sub(40).ok_or_else(||SparkError::Invalid("Invalid MCC tag base".into()))?;
    let mut seen=HashSet::new();let mut spent=0;let mut items=vec![];
    for request in requests{if request.image_index>=MAX_IMAGES_PER_TAG||!seen.insert((request.bitmap_tag_id,request.image_index)){return invalid("MCC bitmap requests must be unique and bounded");}
        let attempt=(||->Result<OwnedBitmapPreview>{let tag=inspection.tags.iter().find(|t|t.id==request.bitmap_tag_id&&t.class=="bitm"&&!t.external).ok_or_else(||SparkError::Invalid("MCC bitmap tag identity is unavailable".into()))?;
            let at=tag.data_offset.ok_or_else(||SparkError::Invalid("MCC bitmap body unavailable".into()))?;if at<start||at.checked_add(108).is_none_or(|e|e>end){return invalid("MCC bitmap body escapes source tag region");}let count=r.u32(at+96)? as usize;if count>MAX_IMAGES_PER_TAG||request.image_index>=count{return invalid("MCC bitmap image index exceeds source collection");}
            let pointer=r.u32(at+100)?.checked_sub(base).ok_or_else(||SparkError::Invalid("Invalid MCC bitmap collection pointer".into()))? as usize;let table=start+pointer;if table.checked_add(count*48).is_none_or(|e|e>end){return invalid("MCC bitmap collection escapes its source region");}
            if r.u16(table+request.image_index*48+14)?&0x100==0 {
                let meta=read_top_mip_metadata(&bytes,&header,at,request.image_index)?;if spent+meta.size>MAX_BATCH_RAW_BYTES{return invalid("MCC bitmap batch exceeds 16 MiB");}let(_,_,_,pixels)=checked_top_mip(&bytes,&header,at,request.image_index)?;spent+=meta.size;
                return Ok(OwnedBitmapPreview{bitmap_tag_id:tag.id,image_index:request.image_index,width:meta.width,height:meta.height,format:meta.format.into(),source_sha256:actual.clone(),dds_base64:base64(&dds_top_mip(meta.width,meta.height,meta.format,&pixels)?),source_kind:"internal-cache".into(),resource_sha256:None});
            }
            let key=crate::mcc_textures::texture_key(&tag.path,request.image_index)?;
            if inspection.tags.iter().filter(|t|t.class=="bitm"&&t.id!=tag.id).any(|t|crate::mcc_textures::texture_key(&t.path,request.image_index).ok().as_deref()==Some(&key)){return invalid("MCC canonical bitmap key has a source tag collision");}
            if bundle.is_none(){bundle=Some(crate::mcc_textures::TextureBundle::open(directory,hashes,&header.name)?);}
            let bundle=bundle.as_mut().ok_or_else(||SparkError::Invalid("MCC texture bundle unavailable".into()))?;
            if bundle.contains_key(&key)? {
                let mip=bundle.top_mip(&key)?;let next=spent+mip.pixels.len();if next>MAX_BATCH_RAW_BYTES{return invalid("MCC bitmap batch exceeds 16 MiB");}spent=next;
                return Ok(OwnedBitmapPreview{bitmap_tag_id:tag.id,image_index:request.image_index,width:mip.width,height:mip.height,format:mip.format.into(),source_sha256:actual.clone(),dds_base64:base64(&dds_top_mip(mip.width,mip.height,mip.format,&mip.pixels)?),source_kind:"verified-resource".into(),resource_sha256:Some(bundle.sha256.clone())});
            }
            let hash=hashes.get("mcc-shared-bitmaps.map").ok_or_else(||SparkError::Invalid("Exact MCC texture key is missing; reconnect Halo Textures to verify MCC's shared bitmaps.map".into()))?;
            if shared.is_none() {
                let path=crate::mcc_textures::shared_bitmaps_path(directory).ok_or_else(||SparkError::Invalid("MCC shared bitmap location is unavailable".into()))?;
                let (file,index)=crate::resource_map::open_verified(&path,hash)?;
                shared=Some((file,index,hash.clone()));
            }
            let meta=read_top_mip_metadata(&bytes,&header,at,request.image_index)?;
            if spent+meta.size>MAX_BATCH_RAW_BYTES{return invalid("MCC bitmap batch exceeds 16 MiB");}
            let (file,index,_)=shared.as_mut().ok_or_else(||SparkError::Invalid("MCC shared bitmaps unavailable".into()))?;
            let pixels=crate::resource_map::read_external_top_mip_from_verified(file,index,&tag.path,meta.raw_offset as u64,meta.declared_size as u64,meta.size,13,request.image_index)?;
            spent+=pixels.len();
            Ok(OwnedBitmapPreview{bitmap_tag_id:tag.id,image_index:request.image_index,width:meta.width,height:meta.height,format:meta.format.into(),source_sha256:actual.clone(),dds_base64:base64(&dds_top_mip(meta.width,meta.height,meta.format,&pixels)?),source_kind:"verified-resource".into(),resource_sha256:Some(bundle.sha256.clone())})
        })();let(preview,error,error_code)=match attempt{Ok(p)=>(Some(p),None,None),Err(e)=>{let(code,reason)=bitmap_failure(&e);(None,Some(reason),Some(code.into()))}};items.push(OwnedBitmapBatchItem{bitmap_tag_id:request.bitmap_tag_id,image_index:request.image_index,preview,error,error_code});
    }
    if let Some((file,_,hash))=&mut shared { crate::resource_map::verify_open_handle_hash(file,hash)?; }
    Ok(OwnedBitmapBatch{source_sha256:actual,resource_sha256:bundle.map(|b|b.sha256),items})
}

/// Self-contained H1A builds have embedded images and need no installed pack.
pub fn mcc_uses_external_bitmaps(path:&Path,expected:&str,inspection:&MapInspection)->Result<bool>{
    let(header,bytes,hash)=maps::read_cache_snapshot(path)?;
    if header.version!=13||hash!=expected||hash!=inspection.sha256{return invalid("MCC bitmap source snapshot changed");}
    let region=TagRegion::from_header(&bytes,&header)?;let r=Reader(&bytes);
    for tag in inspection.tags.iter().filter(|t|t.class=="bitm"){
        if tag.external{return Ok(true);}
        let at=tag.data_offset.ok_or_else(||SparkError::Invalid("MCC bitmap body unavailable".into()))?;region.contains(at,108)?;
        let count=r.u32(at+96)? as usize;if count>MAX_IMAGES_PER_TAG{return invalid("MCC bitmap collection exceeds its limit");}
        if count==0{continue;}let table=region.pointer(r.u32(at+100)?,count*48)?;
        for n in 0..count{if r.u16(table+n*48+14)?&0x100!=0{return Ok(true);}}
    }Ok(false)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnedBitmapPreview {
    pub bitmap_tag_id: u32,
    pub image_index: usize,
    pub width: u16,
    pub height: u16,
    pub format: String,
    /// The currently inspected source-cache SHA256; never a path or cache bytes.
    pub source_sha256: String,
    /// Exact top-mipmap pixels framed in a standard 128-byte DDS header.
    /// No original tag or map data is included outside this selected mipmap.
    pub dds_base64: String,
    /// One of internal-cache or verified-resource; never an inferred resource.
    pub source_kind: String,
    /// Present only after a SHA-256-pinned resource-map read.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_sha256: Option<String>,
}

/// A deliberately small list of exact bitmap ID/image-index pairs, never
/// shader path fragments, arbitrary file paths, or inferred map resources.
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnedBitmapRequest {
    pub bitmap_tag_id: u32,
    pub image_index: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnedBitmapBatchItem {
    pub bitmap_tag_id: u32,
    pub image_index: usize,
    pub preview: Option<OwnedBitmapPreview>,
    pub error: Option<String>,
    /// Stable category for friendly summaries; the exact bounded reason is retained.
    pub error_code: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnedBitmapBatch {
    pub source_sha256: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_sha256: Option<String>,
    pub items: Vec<OwnedBitmapBatchItem>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BitmapResourceCompatibility {
    pub cache_generation: u32,
    pub resource_sha256: String,
    pub verified_images: usize,
    pub missing_or_mismatched_images: usize,
    pub unsupported_images: usize,
    pub internal_images: usize,
}

/// A resource has no embedded game-version number. Compatibility is proven
/// per image by the source's generation-specific index key AND exact byte span.
/// No pixels are read or retained while inspecting a resource candidate.
pub fn verify_resource_for_source(path: &Path, expected_sha256: &str, inspection: &MapInspection,
    resource: &Path, resource_sha256: &str) -> Result<BitmapResourceCompatibility> {
    let (header, bytes, hash) = maps::read_cache_snapshot(path)?;
    if hash != expected_sha256 || hash != inspection.sha256 || !matches!(header.version,6|7|609) {
        return invalid("Source changed or uses a resource generation outside the classic bitmap reader");
    }
    let (mut file,index) = crate::resource_map::open_verified(resource,resource_sha256)?;
    let mut report = BitmapResourceCompatibility {cache_generation:header.version,
        resource_sha256:resource_sha256.into(),verified_images:0,missing_or_mismatched_images:0,
        unsupported_images:0,internal_images:0};
    let mut checked = 0;
    let region = TagRegion::from_header(&bytes,&header)?;
    for tag in inspection.tags.iter().filter(|t| t.class == "bitm" && !t.external) {
        let Some(at) = tag.data_offset else {continue};
        if region.contains(at,108).is_err() {report.unsupported_images+=1;continue;}
        let count = Reader(&bytes).u32(at+0x60)? as usize;
        if count>MAX_IMAGES_PER_TAG {report.unsupported_images+=1;continue;}
        checked+=count;
        if checked>16_384 {return invalid("Bitmap resource verification exceeds the image-count limit");}
        for image_index in 0..count {
            match read_top_mip_metadata(&bytes,&header,at,image_index) {
                Ok(m) if m.external => {
                    if crate::resource_map::prove_external_image_range(&index,&tag.path,m.raw_offset as u64,
                        m.declared_size as u64,m.size,header.version,image_index).is_ok() {report.verified_images+=1;}
                    else {report.missing_or_mismatched_images+=1;}
                },
                Ok(_) => report.internal_images+=1,
                Err(_) => report.unsupported_images+=1,
            }
        }
    }
    crate::resource_map::verify_open_handle_hash(&mut file,resource_sha256)?;
    if report.verified_images == 0 {
        return invalid("This resource file proves no external image ranges for the selected map. Choose that map's original bitmaps.map; self-contained maps do not need it");
    }
    Ok(report)
}

#[derive(Clone, Copy)]
struct TagRegion {
    start: usize,
    end: usize,
    memory_address: u32,
}
impl TagRegion {
    fn from_header(bytes: &[u8], h: &MapHeader) -> Result<Self> {
        let start = h.tag_offset as usize;
        let end = start.checked_add(h.tag_size as usize)
            .ok_or_else(|| SparkError::Invalid("Bitmap tag region length overflow".into()))?;
        Reader(bytes).bytes(start, h.tag_size as usize)?;
        let memory_address = match h.version {
            6 => 0x4bf1_0000,
            7 | 609 => 0x4044_0000,
            13 => Reader(bytes).u32(start)?.checked_sub(40).ok_or_else(||SparkError::Invalid("Invalid MCC bitmap tag base".into()))?,
            _ => return invalid("Automatic bitmap previews support only classic Demo/PC/CE caches"),
        };
        Ok(Self { start, end, memory_address })
    }
    fn pointer(&self, value: u32, length: usize) -> Result<usize> {
        let offset = value.checked_sub(self.memory_address).ok_or_else(||
            SparkError::Invalid("Bitmap pointer is before tag-region base".into()))? as usize;
        let at = self.start.checked_add(offset).ok_or_else(||
            SparkError::Invalid("Bitmap pointer overflow".into()))?;
        if at.checked_add(length).is_none_or(|end| end > self.end) {
            return invalid("Bitmap pointer escapes original bounded tag region");
        }
        Ok(at)
    }
    fn contains(&self, at: usize, length: usize) -> Result<()> {
        if at < self.start || at.checked_add(length).is_none_or(|end| end > self.end) {
            return invalid("Bitmap tag data escapes original bounded tag region");
        }
        Ok(())
    }
}

#[derive(Clone, Copy)]
struct TopMipMetadata {
    width: u16,
    height: u16,
    format: &'static str,
    size: usize,
    raw_offset: usize,
    declared_size: usize,
    external: bool,
}
fn read_top_mip_metadata(bytes: &[u8], header: &MapHeader, tag_data: usize, index: usize) -> Result<TopMipMetadata> {
    read_image_metadata(bytes,header,tag_data,index,false)
}
fn read_image_metadata(bytes: &[u8], header: &MapHeader, tag_data: usize, index: usize, cube:bool) -> Result<TopMipMetadata> {
    let r = Reader(bytes);
    let region = TagRegion::from_header(bytes, header)?;
    region.contains(tag_data, 108)?;
    // In classic cache tag data, the 48-byte bitmap_data block is referenced
    // by the reflexive at bitm_body+0x60. All pointers are tag-memory pointers.
    let count = r.u32(tag_data + 0x60)? as usize;
    if count == 0 || count > MAX_IMAGES_PER_TAG || index >= count {
        return invalid("Bitmap image index or image count is outside the supported bounds");
    }
    let table_length = count.checked_mul(48).ok_or_else(||
        SparkError::Invalid("Bitmap array byte count overflow".into()))?;
    let table = region.pointer(r.u32(tag_data + 0x64)?, table_length)?;
    let image = table + index * 48;
    if r.fourcc(image)? != "bitm" { return invalid("Bitmap data record has invalid class signature"); }
    let width = r.u16(image + 4)?;
    let height = r.u16(image + 6)?;
    let depth = r.u16(image + 8)?;
    let kind = r.u16(image + 10)?;
    let encoding = r.u16(image + 12)?;
    let flags = r.u16(image + 14)?;
    if width == 0 || height == 0 || width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE ||
        u32::from(width) * u32::from(height) > MAX_IMAGE_PIXELS {
        return invalid("Bitmap preview dimensions are invalid or exceed the 16-Mpixel limit");
    }
    if depth != 1 || kind != if cube {2}else{0} { return invalid("Bitmap image dimensionality differs from the requested 2D/cube preview"); }
    if cube && (width!=height || width>1024) {return invalid("Reflection cubes must be square and no larger than 1024 pixels per face");}
    if (flags & 0x8) != 0 { return invalid("Swizzled bitmap pixels cannot be decoded by the linear DDS preview path"); }
    let (format, block, stride) = match encoding {
        0 => ("A8",false,1usize),
        1 => ("Y8",false,1usize),
        3 => ("A8Y8",false,2usize),
        14 => ("DXT1", true, 8usize),
        15 => ("DXT3", true, 16usize),
        16 => ("DXT5", true, 16usize),
        6 => ("R5G6B5", false, 2usize),
        10 => ("BGRX8", false, 4usize),
        11 => ("BGRA8", false, 4usize),
        _ => return invalid(format!("Bitmap pixel format {encoding} is not yet supported for automatic preview")),
    };
    let size = if block {
        usize::from(width).div_ceil(4).checked_mul(usize::from(height).div_ceil(4))
            .and_then(|v| v.checked_mul(stride))
    } else {
        usize::from(width).checked_mul(usize::from(height))
            .and_then(|v| v.checked_mul(stride))
    }.ok_or_else(|| SparkError::Invalid("Bitmap decoded size overflow".into()))?;
    if size > MAX_TOP_MIP_BYTES { return invalid("Bitmap top mipmap is larger than the preview limit"); }
    // H1 classic bitmap_data stores a nonmagic (file-relative) offset for raw
    // pixel data. It is *not* a loaded tag pointer and must not be unmapped.
    let raw_offset = r.u32(image + 24)? as usize;
    let declared_size = r.u32(image + 28)? as usize;
    if declared_size < size { return invalid("Bitmap raw pixel metadata is shorter than the top mipmap"); }
    Ok(TopMipMetadata { width, height, format, size, raw_offset, declared_size, external: flags & 0x100 != 0 })
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct OwnedCubePreview {
    pub source_sha256:String,
    pub resource_sha256:Option<String>,
    pub bitmap_tag_id:u32,
    pub faces:Vec<OwnedBitmapPreview>,
}
/// Classic/H1A linear cube top faces are mip-major: the six level-zero faces
/// precede lower mipmaps. No face may escape the original declared image span.
pub fn preview_owned_cube(path:&Path,expected:&str,inspection:&MapInspection,bitmap_tag_id:u32,resources:Option<(&Path,&str)>)->Result<OwnedCubePreview>{
    let (header,bytes,actual)=maps::read_cache_snapshot(path)?;
    if actual!=expected||actual!=inspection.sha256{return invalid("Reflection cube source identity changed");}
    let tag=inspection.tags.iter().find(|t|t.id==bitmap_tag_id&&t.class=="bitm"&&!t.external).ok_or_else(||SparkError::Invalid("Reflection cube tag is unavailable in the preserved map".into()))?;
    let at=tag.data_offset.ok_or_else(||SparkError::Invalid("Reflection cube tag has no bounded body".into()))?;
    let meta=read_image_metadata(&bytes,&header,at,0,true)?;
    let total=meta.size.checked_mul(6).ok_or_else(||SparkError::Invalid("Cube face byte count overflow".into()))?;
    if total>MAX_BATCH_RAW_BYTES||total>meta.declared_size{return invalid("Reflection cube faces exceed the declared image span or 16 MiB budget");}
    let mut resource_hash=None;
    let pixels=if meta.external {
        let (resource,hash)=resources.ok_or_else(||SparkError::Invalid("Reflection cube needs its exact original pinned bitmaps.map".into()))?;
        let (mut file,index)=crate::resource_map::open_verified(resource,hash)?;
        let pixels=crate::resource_map::read_external_top_mip_from_verified(&mut file,&index,&tag.path,meta.raw_offset as u64,meta.declared_size as u64,total,header.version,0)?;
        crate::resource_map::verify_open_handle_hash(&mut file,hash)?;resource_hash=Some(hash.to_owned());pixels
    }else{
        if meta.raw_offset<2048{return invalid("Reflection cube pixels overlap the cache header");}
        Reader(&bytes).bytes(meta.raw_offset,total)?.to_vec()
    };
    let mut faces=Vec::with_capacity(6);
    for face in pixels.chunks_exact(meta.size){faces.push(OwnedBitmapPreview{bitmap_tag_id,image_index:0,width:meta.width,height:meta.height,format:meta.format.into(),source_sha256:actual.clone(),dds_base64:base64(&dds_top_mip(meta.width,meta.height,meta.format,face)?),source_kind:if meta.external{"verified-resource"}else{"internal-cache"}.into(),resource_sha256:resource_hash.clone()});}
    Ok(OwnedCubePreview{source_sha256:actual,resource_sha256:resource_hash,bitmap_tag_id,faces})
}
fn checked_top_mip(bytes: &[u8], header: &MapHeader, tag_data: usize, index: usize) -> Result<(u16, u16, &'static str, Vec<u8>)> {
    let m = read_top_mip_metadata(bytes, header, tag_data, index)?;
    if m.external { return invalid("External pixel data requires the exact pinned bitmaps.map resource and matching index entry"); }
    if m.raw_offset < 2048 { return invalid("Bitmap pixel offset overlaps the protected cache header"); }
    let pixels = Reader(bytes).bytes(m.raw_offset, m.size)?;
    Ok((m.width, m.height, m.format, pixels.to_vec()))
}

fn dds_top_mip(width: u16, height: u16, format: &str, pixels: &[u8]) -> Result<Vec<u8>> {
    let mut dds = vec![0u8; 128];
    fn set(v: &mut [u8], at: usize, value: u32) { v[at..at+4].copy_from_slice(&value.to_le_bytes()); }
    dds[0..4].copy_from_slice(b"DDS ");
    set(&mut dds, 4, 124);
    let compressed = matches!(format, "DXT1" | "DXT3" | "DXT5");
    set(&mut dds, 8, if compressed {0x81007} else {0x100f});
    set(&mut dds, 12, height.into());
    set(&mut dds, 16, width.into());
    let pixel_stride=match format {"A8"|"Y8"=>1,"R5G6B5"|"A8Y8"=>2,_=>4};
    set(&mut dds, 20, if compressed {pixels.len() as u32} else {u32::from(width) * pixel_stride});
    set(&mut dds, 76, 32);
    if compressed {
        set(&mut dds, 80, 4);
        dds[84..88].copy_from_slice(format.as_bytes());
    } else if matches!(format,"A8"|"Y8"|"A8Y8") {
        set(&mut dds,80,match format {"A8"=>0x2,"Y8"=>0x20000,_=>0x20001});
        set(&mut dds,88,if format=="A8Y8"{16}else{8});
        set(&mut dds,92,if format=="A8"{0}else{0xff});
        set(&mut dds,104,match format {"A8"=>0xff,"A8Y8"=>0xff00,_=>0});
    } else if format == "R5G6B5" {
        set(&mut dds, 80, 0x40);
        set(&mut dds, 88, 16);
        set(&mut dds, 92, 0xf800);
        set(&mut dds, 96, 0x07e0);
        set(&mut dds, 100, 0x001f);
    } else if matches!(format, "BGRA8" | "BGRX8") {
        set(&mut dds, 80, 0x40 | if format == "BGRA8" {1} else {0});
        set(&mut dds, 88, 32);
        set(&mut dds, 92, 0x00ff0000);
        set(&mut dds, 96, 0x0000ff00);
        set(&mut dds, 100, 0x000000ff);
        set(&mut dds, 104, if format == "BGRA8" {0xff000000} else {0});
    } else { return invalid("Bitmap DDS serialization has unsupported pixel layout"); }
    set(&mut dds, 108, 0x1000);
    dds.extend_from_slice(pixels);
    Ok(dds)
}

pub(crate) fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut encoded = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0]; let b1 = *chunk.get(1).unwrap_or(&0); let b2 = *chunk.get(2).unwrap_or(&0);
        encoded.push(TABLE[(b0 >> 2) as usize] as char);
        encoded.push(TABLE[(((b0 & 3) << 4) | (b1 >> 4)) as usize] as char);
        encoded.push(if chunk.len() > 1 {TABLE[(((b1 & 15) << 2) | (b2 >> 6)) as usize] as char} else {'='});
        encoded.push(if chunk.len() > 2 {TABLE[(b2 & 63) as usize] as char} else {'='});
    }
    encoded
}

/// Preview an internal bitmap from the *exact* preserved cache snapshot.
/// This compatibility wrapper deliberately has no external-resource access.
pub fn preview_owned_bitmap(path: &Path, expected_sha256: &str, inspection: &MapInspection, bitmap_tag_id: u32, image_index: usize) -> Result<OwnedBitmapPreview> {
    preview_owned_bitmap_with_resources(path, expected_sha256, inspection, bitmap_tag_id, image_index, None)
}

/// A selected resource is only considered when the internal bitmap metadata
/// explicitly marks its raw pixels external. An external *tag body* remains
/// unsupported because its in-memory pointers require a different loader.
/// Reads are bounded by both pixel metadata and a unique exact resource entry.
pub fn preview_owned_bitmap_with_resources(
    path: &Path, expected_sha256: &str, inspection: &MapInspection,
    bitmap_tag_id: u32, image_index: usize,
    resources: Option<(&Path, &str)>,
) -> Result<OwnedBitmapPreview> {
    if expected_sha256.len() != 64 || inspection.sha256 != expected_sha256 {
        return invalid("Source cache identity mismatch; reopen the inspected project");
    }
    let (header, bytes, actual_sha256) = maps::read_cache_snapshot(path)?;
    if actual_sha256 != expected_sha256 || inspection.header.version != header.version || inspection.header.tag_offset != header.tag_offset {
        return invalid("The original cache changed after inspection; bitmap preview refused");
    }
    let tag = inspection.tags.iter().find(|t| t.id == bitmap_tag_id && t.class == "bitm")
        .ok_or_else(|| SparkError::Invalid("Selected bitmap tag ID is not present in this source map".into()))?;
    if tag.external { return invalid("This bitmap tag has external metadata; extracting its body needs a verified tag-loader workflow"); }
    let at = tag.data_offset.ok_or_else(|| SparkError::Invalid("Bitmap tag has no internal data pointer".into()))?;
    let meta = read_top_mip_metadata(&bytes, &header, at, image_index)?;
    let (pixels, source_kind, resource_sha256) = if meta.external {
        let (resource_path, pinned_hash) = resources.ok_or_else(|| SparkError::Invalid(
            "Choose and hash the original bitmaps.map resource folder for this project before previewing external pixels".into()))?;
        let pixels = crate::resource_map::read_external_image_top_mip(
            resource_path, pinned_hash, &tag.path,
            meta.raw_offset as u64, meta.declared_size as u64, meta.size, header.version, image_index,
        )?;
        (pixels, "verified-resource", Some(pinned_hash.to_ascii_lowercase()))
    } else {
        let (_,_,_,pixels)=checked_top_mip(&bytes, &header, at, image_index)?;
        (pixels, "internal-cache", None)
    };
    let dds = dds_top_mip(meta.width, meta.height, meta.format, &pixels)?;
    Ok(OwnedBitmapPreview {
        bitmap_tag_id, image_index, width: meta.width, height: meta.height,
        format: meta.format.into(), source_sha256:actual_sha256,
        dds_base64:base64(&dds), source_kind:source_kind.into(), resource_sha256,
    })
}

/// Preview many exact classic bitmap images against ONE preserved cache
/// snapshot. External raw pixels, when requested, use one opened and pinned
/// bitmaps.map index, and a final same-handle SHA check *before* returning.
/// One unsupported image produces an explicit per-item refusal, not a guessed
/// pixel buffer; a broken source or changed opened resource fails the batch.
pub fn preview_owned_bitmap_batch_with_resources(
    path: &Path,
    expected_sha256: &str,
    inspection: &MapInspection,
    requests: &[OwnedBitmapRequest],
    resources: Option<(&Path, &str)>,
) -> Result<OwnedBitmapBatch> {
    if requests.is_empty() || requests.len() > MAX_BATCH_REQUESTS {
        return invalid("Automatic preview batch requires 1 to 24 bitmap image requests");
    }
    if expected_sha256.len() != 64 || !expected_sha256.bytes().all(|b| b.is_ascii_hexdigit()) ||
        inspection.sha256 != expected_sha256 {
        return invalid("Source cache SHA-256 differs from the inspected project");
    }
    let mut seen = HashSet::new();
    for request in requests {
        if request.image_index >= MAX_IMAGES_PER_TAG || !seen.insert((request.bitmap_tag_id, request.image_index)) {
            return invalid("Batch bitmap image indices must be bounded and unique");
        }
    }
    let (header, bytes, snapshot_hash) = maps::read_cache_snapshot(path)?;
    if snapshot_hash != expected_sha256 || inspection.header.version != header.version ||
        inspection.header.tag_offset != header.tag_offset ||
        inspection.header.tag_size != header.tag_size || !matches!(header.version, 6 | 7 | 13 | 609) {
        return invalid("Original cache snapshot changed or is an unsupported engine version");
    }
    let mut spent = 0usize;
    let mut resource_snapshot: Option<(File, crate::resource_map::ResourceIndex)> = None;
    let mut resource_failure: Option<String> = None;
    let mut items = Vec::with_capacity(requests.len());
    for request in requests {
        let attempt = (|| -> Result<OwnedBitmapPreview> {
            let mut found = inspection.tags.iter().filter(|tag| tag.id == request.bitmap_tag_id);
            let tag = found.next().ok_or_else(|| SparkError::Invalid("Unrecognized source bitmap tag ID".into()))?;
            if found.next().is_some() || tag.class != "bitm" || tag.external {
                return invalid("Bitmap tag class or internal tag-body provenance is not verified");
            }
            let at = tag.data_offset.ok_or_else(|| SparkError::Invalid("No internal bitmap metadata".into()))?;
            let meta = read_top_mip_metadata(&bytes, &header, at, request.image_index)?;
            let next = spent.checked_add(meta.size).ok_or_else(|| SparkError::Invalid("Preview batch size overflow".into()))?;
            if next > MAX_BATCH_RAW_BYTES {
                return invalid("Combined decoded bitmap top mips exceed the 16 MiB batch limit");
            }
            let (pixels, source_kind, resource_sha256) = if meta.external {
                let (resource_path, pinned) = resources.ok_or_else(|| SparkError::Invalid(
                    "Explicit project-pinned bitmaps.map required for external pixels".into()))?;
                if resource_snapshot.is_none() && resource_failure.is_none() {
                    match crate::resource_map::open_verified(resource_path, pinned) {
                        Ok(open) => resource_snapshot = Some(open),
                        Err(e) => resource_failure = Some(bitmap_failure(&e).1),
                    }
                }
                let (file, index) = resource_snapshot.as_mut().ok_or_else(|| SparkError::Invalid(
                    resource_failure.clone().unwrap_or_else(|| "Selected resource index could not be SHA-256 verified".into())))?;
                let data = crate::resource_map::read_external_top_mip_from_verified(
                    file, index, &tag.path, meta.raw_offset as u64,
                    meta.declared_size as u64, meta.size, header.version, request.image_index,
                )?;
                (data, "verified-resource", Some(pinned.to_ascii_lowercase()))
            } else {
                if meta.raw_offset < 2048 { return invalid("Bitmap offset overlaps the protected cache header"); }
                let data = Reader(&bytes).bytes(meta.raw_offset, meta.size)?.to_vec();
                (data, "internal-cache", None)
            };
            let dds = dds_top_mip(meta.width, meta.height, meta.format, &pixels)?;
            spent = next;
            Ok(OwnedBitmapPreview {
                bitmap_tag_id: request.bitmap_tag_id,
                image_index: request.image_index,
                width: meta.width,
                height: meta.height,
                format: meta.format.into(),
                source_sha256: snapshot_hash.clone(),
                dds_base64: base64(&dds),
                source_kind: source_kind.into(),
                resource_sha256,
            })
        })();
        let (preview, error, error_code) = match attempt {
            Ok(value) => (Some(value), None, None),
            Err(e) => { let (code, reason) = bitmap_failure(&e); (None, Some(reason), Some(code.into())) },
        };
        items.push(OwnedBitmapBatchItem {
            bitmap_tag_id: request.bitmap_tag_id,
            image_index: request.image_index,
            preview,
            error,
            error_code,
        });
    }
    if let Some((file, _)) = resource_snapshot.as_mut() {
        let (_, pinned) = resources.ok_or_else(|| SparkError::Invalid("Resource identity lost".into()))?;
        crate::resource_map::verify_open_handle_hash(file, pinned)?;
    }
    Ok(OwnedBitmapBatch {
        source_sha256: snapshot_hash,
        resource_sha256: if resource_snapshot.is_some() { resources.map(|(_, hash)| hash.to_ascii_lowercase()) } else {None},
        items,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(format: u16, flags: u16) -> (Vec<u8>, MapHeader) {
        let mut bytes = vec![0u8; 0x2800];
        let set32=|b:&mut [u8],at:usize,v:u32|b[at..at+4].copy_from_slice(&v.to_le_bytes());
        let set16=|b:&mut [u8],at:usize,v:u16|b[at..at+2].copy_from_slice(&v.to_le_bytes());
        set32(&mut bytes,0x900+0x60,1);
        set32(&mut bytes,0x900+0x64,0x4044_0000+0x180);
        bytes[0x980..0x984].copy_from_slice(b"mtib");
        set16(&mut bytes,0x984,4);set16(&mut bytes,0x986,4);set16(&mut bytes,0x988,1);
        set16(&mut bytes,0x98a,0);set16(&mut bytes,0x98c,format);set16(&mut bytes,0x98e,flags);
        set32(&mut bytes,0x980+24,0x2000);set32(&mut bytes,0x980+28,16);
        bytes[0x2000..0x2010].copy_from_slice(&[1;16]);
        (bytes,MapHeader {version:7,engine:"Halo PC".into(),name:"fixture".into(),build:"synthetic".into(),scenario_type:1,file_size:0x2800,declared_size:0x2800,tag_offset:0x800,tag_size:0x400,crc32:0,flags:0,demo_layout:false,compressed:false,extended:false,legacy_tag_size_repair:false})
    }
    #[test] fn bounded_internal_dxt3_and_dds_header() {
        let (bytes,header)=fixture(15,0);
        let (w,h,f,p)=checked_top_mip(&bytes,&header,0x900,0).unwrap();
        assert_eq!((w,h,f,p.len()),(4,4,"DXT3",16));
        let dds=dds_top_mip(w,h,f,&p).unwrap();
        assert_eq!(&dds[..4],b"DDS ");assert_eq!(&dds[84..88],b"DXT3");
        assert_eq!(dds.len(),144);
    }
    #[test] fn self_contained_mcc_images_need_no_installed_pack(){
        use crate::maps::{MapInspection,Tag,MeshData};
        let(mut bytes,mut header)=fixture(15,0);header.version=13;
        let put=|b:&mut[u8],at:usize,v:u32|b[at..at+4].copy_from_slice(&v.to_le_bytes());
        bytes[..4].copy_from_slice(b"daeh");bytes[0x7fc..0x800].copy_from_slice(b"toof");put(&mut bytes,4,13);let size=bytes.len()as u32;put(&mut bytes,8,size);put(&mut bytes,0x10,0x800);put(&mut bytes,0x14,0x400);put(&mut bytes,0x800,0x40440028);bytes[0x20..0x28].copy_from_slice(b"fixture\0");bytes[0x40..0x4a].copy_from_slice(b"synthetic\0");bytes[0x60..0x62].copy_from_slice(&1u16.to_le_bytes());
        let file=tempfile::NamedTempFile::new().unwrap();std::fs::write(file.path(),bytes).unwrap();let sha=maps::hash_file(file.path()).unwrap();let i=MapInspection{header,sha256:sha.clone(),tag_checksum:None,decals:vec![],tags:vec![Tag{id:0x1234,index:0,class:"bitm".into(),path:"test/bitmap".into(),data_offset:Some(0x900),external:false,fields:vec![],references:vec![],primary_bitmap_status:None,shader_preview:None}],objects:vec![],mesh:MeshData::default(),render_mesh:None,model_meshes:Default::default(),encounters:vec![],scripts:vec![],resources:vec![],diagnostics:vec![],scenario_path:"fixture".into()};
        assert!(!mcc_uses_external_bitmaps(file.path(),&sha,&i).unwrap());let batch=preview_mcc_bitmap_batch(file.path(),&sha,&i,&[OwnedBitmapRequest{bitmap_tag_id:0x1234,image_index:0}],Path::new("no-installed-packs"),&Default::default()).unwrap();assert_eq!(batch.resource_sha256,None);assert_eq!(batch.items[0].preview.as_ref().unwrap().source_kind,"internal-cache");
    }
    #[test] fn alpha_and_luminance_dds_preserve_channel_layout() {
        for (format,name,stride,flags,red,alpha) in [(0,"A8",1,2,0,0xff),(1,"Y8",1,0x20000,0xff,0),(3,"A8Y8",2,0x20001,0xff,0xff00)] {
            let (mut bytes,header)=fixture(format,0);
            bytes[0x980+28..0x980+32].copy_from_slice(&(16u32*stride).to_le_bytes());
            let (w,h,f,p)=checked_top_mip(&bytes,&header,0x900,0).unwrap();
            assert_eq!((w,h,f,p.len()),(4,4,name,16*stride as usize));
            let dds=dds_top_mip(w,h,f,&p).unwrap();
            let r=Reader(&dds);assert_eq!(r.u32(80).unwrap(),flags);assert_eq!(r.u32(92).unwrap(),red);assert_eq!(r.u32(104).unwrap(),alpha);
        }
    }
    #[test] fn bounded_bgra_top_mip_and_alpha_masks() {
        let (mut bytes, header) = fixture(11,0);
        bytes[0x980+28..0x980+32].copy_from_slice(&64u32.to_le_bytes());
        bytes[0x2000..0x2040].fill(42);
        let (w,h,f,p)=checked_top_mip(&bytes,&header,0x900,0).unwrap();
        assert_eq!((w,h,f,p.len()),(4,4,"BGRA8",64));
        let dds=dds_top_mip(w,h,f,&p).unwrap();
        assert_eq!(u32::from_le_bytes(dds[92..96].try_into().unwrap()),0x00ff0000);
        assert_eq!(u32::from_le_bytes(dds[104..108].try_into().unwrap()),0xff000000);
        assert_eq!(dds.len(),192);
        let (mut bytes, header) = fixture(10,0);
        bytes[0x980+28..0x980+32].copy_from_slice(&64u32.to_le_bytes());
        let (_,_,f,p)=checked_top_mip(&bytes,&header,0x900,0).unwrap();
        let dds=dds_top_mip(4,4,f,&p).unwrap();
        assert_eq!(f,"BGRX8");
        assert_eq!(u32::from_le_bytes(dds[104..108].try_into().unwrap()),0);
    }
    #[test] fn rejects_resource_swizzle_and_overflow() {
        let (b,h)=fixture(15,0x100);assert!(checked_top_mip(&b,&h,0x900,0).is_err());
        let (b,h)=fixture(15,0x8);assert!(checked_top_mip(&b,&h,0x900,0).is_err());
        let (mut b,h)=fixture(15,0);
        b[0x980+24..0x980+28].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(checked_top_mip(&b,&h,0x900,0).is_err());
    }
    #[test] fn preserved_cache_identity_is_required_even_for_valid_raw_pixels() {
        use crate::maps::{MapInspection, Tag, MeshData};
        use sha2::{Digest, Sha256};
        use std::io::Write;
        let (mut bytes, mut header) = fixture(15, 0);
        // A synthetic classic PC cache header. The unit test never uses an
        // installed map or any copyrighted source bytes.
        bytes[0..4].copy_from_slice(b"daeh");
        bytes[0x7fc..0x800].copy_from_slice(b"toof");
        bytes[4..8].copy_from_slice(&7u32.to_le_bytes());
        let full_len = bytes.len() as u32;
        bytes[8..12].copy_from_slice(&full_len.to_le_bytes());
        bytes[0x10..0x14].copy_from_slice(&0x800u32.to_le_bytes());
        bytes[0x14..0x18].copy_from_slice(&0x400u32.to_le_bytes());
        bytes[0x20..0x28].copy_from_slice(b"fixture\0");
        bytes[0x40..0x4a].copy_from_slice(b"synthetic\0");
        bytes[0x60..0x62].copy_from_slice(&1u16.to_le_bytes());
        header.name = "fixture".into();
        let expected = format!("{:x}", Sha256::digest(&bytes));
        let file = tempfile::NamedTempFile::new().unwrap();
        let mut writer = file.reopen().unwrap();
        writer.write_all(&bytes).unwrap();
        writer.sync_all().unwrap();
        let inspection = MapInspection { tag_checksum:None, decals:vec![],
            header, sha256:expected.clone(),
            tags:vec![Tag{id:0x1234,index:0,class:"bitm".into(),path:"test/bitmap".into(),
                data_offset:Some(0x900),external:false,fields:vec![],references:vec![],primary_bitmap_status:None,shader_preview:None}],
            objects:vec![],mesh:MeshData::default(),render_mesh:None,model_meshes:Default::default(),
            encounters:vec![],scripts:vec![],resources:vec![],diagnostics:vec![],scenario_path:"test".into(),
        };
        let good = preview_owned_bitmap(file.path(), &expected, &inspection, 0x1234, 0).unwrap();
        assert_eq!((good.width,good.height,good.format.as_str()),(4,4,"DXT3"));
        assert_eq!(good.source_sha256,expected);
        assert_eq!(good.dds_base64.len(),192);
        assert!(preview_owned_bitmap(file.path(), &expected, &inspection, 0x9999, 0).is_err());
        assert!(preview_owned_bitmap(file.path(), &"a".repeat(64), &inspection, 0x1234, 0).is_err());
        // Replacing the cache after the inspection refuses the preview.
        let mut changed = bytes;
        changed[0x2000] ^= 1;
        std::fs::write(file.path(), changed).unwrap();
        assert!(preview_owned_bitmap(file.path(), &expected, &inspection, 0x1234, 0).is_err());
    }
    #[test] fn external_raw_pixel_preview_requires_pinned_exact_index_entry() {
        use crate::maps::{MapInspection, Tag, MeshData};
        use sha2::{Digest, Sha256};
        use std::io::Write;
        let (mut cache, header) = fixture(15, 0x100);
        cache[0..4].copy_from_slice(b"daeh");
        cache[0x7fc..0x800].copy_from_slice(b"toof");
        cache[4..8].copy_from_slice(&7u32.to_le_bytes());
        let cache_len=cache.len() as u32;
        cache[8..12].copy_from_slice(&cache_len.to_le_bytes());
        cache[0x10..0x14].copy_from_slice(&0x800u32.to_le_bytes());
        cache[0x14..0x18].copy_from_slice(&0x400u32.to_le_bytes());
        cache[0x20..0x28].copy_from_slice(b"fixture\0");
        cache[0x40..0x4a].copy_from_slice(b"synthetic\0");
        cache[0x60..0x62].copy_from_slice(&1u16.to_le_bytes());
        // Synthetic external DXT3 pixels are known to occupy a unique indexed
        // span at 0x300 in the resource, NOT the map's original raw area.
        cache[0x980+24..0x980+28].copy_from_slice(&0x300u32.to_le_bytes());
        let expected=format!("{:x}",Sha256::digest(&cache));
        let cache_file=tempfile::NamedTempFile::new().unwrap();
        cache_file.reopen().unwrap().write_all(&cache).unwrap();
        let inspection = MapInspection { tag_checksum:None, decals:vec![],
            header,sha256:expected.clone(),tags:vec![Tag {
                id:0x1234,index:0,class:"bitm".into(),path:"test/bitmap".into(),
                data_offset:Some(0x900),external:false,fields:vec![],references:vec![],primary_bitmap_status:None,shader_preview:None,
            }],objects:vec![],mesh:MeshData::default(),render_mesh:None,model_meshes:Default::default(),
            encounters:vec![],scripts:vec![],resources:vec![],diagnostics:vec![],scenario_path:"fixture".into(),
        };
        let dir=tempfile::tempdir().unwrap();
        let resource_path=dir.path().join("bitmaps.map");
        let mut resource=vec![0u8;0x500];
        let set32=|bytes:&mut [u8],at:usize,v:u32|bytes[at..at+4].copy_from_slice(&v.to_le_bytes());
        set32(&mut resource,0,1);set32(&mut resource,4,0x100);
        set32(&mut resource,8,0x40);set32(&mut resource,12,1);
        set32(&mut resource,0x40,0);set32(&mut resource,0x44,64);
        set32(&mut resource,0x48,0x300);
        resource[0x100..0x10e].copy_from_slice(b"test\\bitmap_0\0");
        resource[0x300..0x310].fill(0x42);
        std::fs::write(&resource_path,&resource).unwrap();
        let resource_hash=format!("{:x}",Sha256::digest(&resource));
        assert!(preview_owned_bitmap(cache_file.path(),&expected,&inspection,0x1234,0).is_err());
        let result=preview_owned_bitmap_with_resources(cache_file.path(),&expected,&inspection,
            0x1234,0,Some((&resource_path,&resource_hash))).unwrap();
        assert_eq!(result.source_kind,"verified-resource");
        assert_eq!(result.resource_sha256,Some(resource_hash.clone()));
        assert!(preview_owned_bitmap_with_resources(cache_file.path(),&expected,&inspection,
            0x1234,0,Some((&resource_path,&"0".repeat(64)))).is_err());
        // A present-but-unrelated index path cannot be substituted.
        resource[0x100..0x10b].copy_from_slice(b"test\\other\0");
        std::fs::write(&resource_path,&resource).unwrap();
        let changed_hash=format!("{:x}",Sha256::digest(&resource));
        assert!(preview_owned_bitmap_with_resources(cache_file.path(),&expected,&inspection,
            0x1234,0,Some((&resource_path,&changed_hash))).is_err());
    }
    #[test] fn base64_known_vectors() {
        assert_eq!(base64(b"Man"),"TWFu");assert_eq!(base64(b"M"),"TQ==");
        assert_eq!(base64(b"Ma"),"TWE=");assert_eq!(base64(b""),"");
    }

    #[test]
    fn two_external_pages_use_exact_pinned_resource_and_refuse_tampering() {
        use crate::maps::{MapInspection, Tag, MeshData};
        use sha2::{Digest, Sha256};
        let (mut bytes, header) = fixture(15, 0x100);
        bytes[0..4].copy_from_slice(b"daeh");
        bytes[0x7fc..0x800].copy_from_slice(b"toof");
        bytes[4..8].copy_from_slice(&7u32.to_le_bytes());
        let fixture_length = bytes.len() as u32;
        bytes[8..12].copy_from_slice(&fixture_length.to_le_bytes());
        bytes[0x10..0x14].copy_from_slice(&0x800u32.to_le_bytes());
        bytes[0x14..0x18].copy_from_slice(&0x400u32.to_le_bytes());
        bytes[0x20..0x28].copy_from_slice(b"fixture\0");
        bytes[0x40..0x4a].copy_from_slice(b"synthetic\0");
        bytes[0x60..0x62].copy_from_slice(&1u16.to_le_bytes());
        bytes[0x900+0x60..0x900+0x64].copy_from_slice(&2u32.to_le_bytes());
        bytes[0x980+24..0x980+28].copy_from_slice(&0x300u32.to_le_bytes());
        bytes[0x9b0..0x9b4].copy_from_slice(b"mtib");
        bytes[0x9b4..0x9b6].copy_from_slice(&4u16.to_le_bytes());
        bytes[0x9b6..0x9b8].copy_from_slice(&4u16.to_le_bytes());
        bytes[0x9b8..0x9ba].copy_from_slice(&1u16.to_le_bytes());
        bytes[0x9bc..0x9be].copy_from_slice(&15u16.to_le_bytes());
        bytes[0x9be..0x9c0].copy_from_slice(&0x100u16.to_le_bytes());
        bytes[0x9b0+24..0x9b0+28].copy_from_slice(&0x310u32.to_le_bytes());
        bytes[0x9b0+28..0x9b0+32].copy_from_slice(&16u32.to_le_bytes());
        let expected=format!("{:x}",Sha256::digest(&bytes));
        let map=tempfile::NamedTempFile::new().unwrap();
        std::fs::write(map.path(),&bytes).unwrap();
        let inspected=MapInspection { tag_checksum:None, decals:vec![],
            header,sha256:expected.clone(),tags:vec![Tag {
                id:0x1234,index:0,class:"bitm".into(),path:"test/bitmap".into(),
                data_offset:Some(0x900),external:false,fields:vec![],references:vec![],primary_bitmap_status:None,shader_preview:None,
            }],objects:vec![],mesh:MeshData::default(),render_mesh:None,model_meshes:Default::default(),
            encounters:vec![],scripts:vec![],resources:vec![],diagnostics:vec![],scenario_path:"fixture".into(),
        };
        let dir=tempfile::tempdir().unwrap();
        let path=dir.path().join("bitmaps.map");
        let mut resource=vec![0u8;0x500];
        let put=|b:&mut [u8],at:usize,v:u32|b[at..at+4].copy_from_slice(&v.to_le_bytes());
        put(&mut resource,0,1);put(&mut resource,4,0x100);put(&mut resource,8,0x40);put(&mut resource,12,2);
        put(&mut resource,0x40,0);put(&mut resource,0x44,16);put(&mut resource,0x48,0x300);
        resource[0x100..0x10e].copy_from_slice(b"test\\bitmap_0\0");
        put(&mut resource,0x4c,14);put(&mut resource,0x50,16);put(&mut resource,0x54,0x310);
        resource[0x10e..0x11c].copy_from_slice(b"test\\bitmap_1\0");
        resource[0x300..0x310].fill(0x51);
        resource[0x310..0x320].fill(0x62);
        std::fs::write(&path,&resource).unwrap();
        let resource_hash=format!("{:x}",Sha256::digest(&resource));
        let requests=[OwnedBitmapRequest{bitmap_tag_id:0x1234,image_index:0},
            OwnedBitmapRequest{bitmap_tag_id:0x1234,image_index:1}];
        let report=preview_owned_bitmap_batch_with_resources(
            map.path(),&expected,&inspected,&requests,Some((&path,&resource_hash)),
        ).unwrap();
        assert_eq!(report.items.len(),2);
        assert!(report.items.iter().all(|item| item.preview.as_ref().is_some_and(|p|
            p.source_kind=="verified-resource" && p.resource_sha256.as_deref()==Some(resource_hash.as_str()))));
        assert_ne!(report.items[0].preview.as_ref().unwrap().dds_base64,
            report.items[1].preview.as_ref().unwrap().dds_base64);
        resource[0x310]^=1;
        std::fs::write(&path,&resource).unwrap();
        let changed=preview_owned_bitmap_batch_with_resources(
            map.path(),&expected,&inspected,&requests,Some((&path,&resource_hash)),
        ).unwrap();
        assert!(changed.items.iter().all(|item| item.preview.is_none()));
        assert_eq!(std::fs::read(map.path()).unwrap(),bytes);
    }

    #[test]
    fn single_snapshot_batch_is_bounded_ordered_and_read_only() {
        use crate::maps::{MapInspection, Tag, MeshData};
        use sha2::{Digest, Sha256};
        let (mut bytes, header) = fixture(15, 0);
        bytes[0..4].copy_from_slice(b"daeh");
        bytes[0x7fc..0x800].copy_from_slice(b"toof");
        bytes[4..8].copy_from_slice(&7u32.to_le_bytes());
        let fixture_length = bytes.len() as u32;
        bytes[8..12].copy_from_slice(&fixture_length.to_le_bytes());
        bytes[0x10..0x14].copy_from_slice(&0x800u32.to_le_bytes());
        bytes[0x14..0x18].copy_from_slice(&0x400u32.to_le_bytes());
        bytes[0x20..0x28].copy_from_slice(b"fixture\0");
        bytes[0x40..0x4a].copy_from_slice(b"synthetic\0");
        bytes[0x60..0x62].copy_from_slice(&1u16.to_le_bytes());
        let expected = format!("{:x}", Sha256::digest(&bytes));
        let file = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(file.path(), &bytes).unwrap();
        let inspected = MapInspection { tag_checksum:None, decals:vec![],
            header, sha256: expected.clone(), tags: vec![Tag {
                id: 0x1234, index: 0, class: "bitm".into(), path: "test/bitmap".into(),
                data_offset: Some(0x900), external: false, fields: vec![], references: vec![],
                primary_bitmap_status:None,shader_preview:None,
            }], objects:vec![], mesh:MeshData::default(), render_mesh:None,
            model_meshes:Default::default(), encounters:vec![], scripts:vec![],
            resources:vec![], diagnostics:vec![], scenario_path:"test".into(),
        };
        let req = [
            OwnedBitmapRequest { bitmap_tag_id:0x1234, image_index:0 },
            OwnedBitmapRequest { bitmap_tag_id:0x1234, image_index:1 },
            OwnedBitmapRequest { bitmap_tag_id:0x4567, image_index:0 },
        ];
        let batch = preview_owned_bitmap_batch_with_resources(
            file.path(), &expected, &inspected, &req, None,
        ).unwrap();
        assert_eq!(batch.items.len(), 3);
        assert_eq!(batch.items[0].preview.as_ref().unwrap().format, "DXT3");
        assert_eq!(batch.items[0].preview.as_ref().unwrap().source_sha256, expected);
        assert!(batch.items[1].preview.is_none());
        assert!(batch.items[2].preview.is_none());
        assert_eq!(std::fs::read(file.path()).unwrap(), bytes);
        assert!(preview_owned_bitmap_batch_with_resources(
            file.path(), &expected, &inspected, &[req[0],req[0]], None,
        ).is_err());
        assert!(preview_owned_bitmap_batch_with_resources(
            file.path(), &"0".repeat(64), &inspected, &req, None,
        ).is_err());
        assert!(preview_owned_bitmap_batch_with_resources(
            file.path(), &expected, &inspected, &[], None,
        ).is_err());
    }
    #[test]
    fn reflection_cube_reads_all_six_level_zero_faces_and_rejects_a_short_declared_span(){
        use crate::maps::{MapInspection,Tag,MeshData};
        let (mut bytes,mut header)=fixture(15,0);
        bytes.resize(0x2200,0);header.name="fixture".into();
        bytes[..4].copy_from_slice(b"daeh");bytes[0x7fc..0x800].copy_from_slice(b"toof");
        for (at,value)in [(4,7),(8,bytes.len()as u32),(0x10,0x800),(0x14,0x400)]{bytes[at..at+4].copy_from_slice(&value.to_le_bytes());}
        bytes[0x20..0x28].copy_from_slice(b"fixture\0");bytes[0x40..0x4a].copy_from_slice(b"synthetic\0");bytes[0x60..0x62].copy_from_slice(&1u16.to_le_bytes());
        bytes[0x98a..0x98c].copy_from_slice(&2u16.to_le_bytes());bytes[0x99c..0x9a0].copy_from_slice(&96u32.to_le_bytes());
        for face in 0..6 {bytes[0x2000+face*16..0x2010+face*16].fill(face as u8);}
        let file=tempfile::NamedTempFile::new().unwrap();std::fs::write(file.path(),&bytes).unwrap();let sha=maps::hash_file(file.path()).unwrap();
        let mut inspection=MapInspection{header,sha256:sha.clone(),tag_checksum:None,decals:vec![],tags:vec![Tag{id:0x1234,index:0,class:"bitm".into(),path:"test/bitmap".into(),data_offset:Some(0x900),external:false,fields:vec![],references:vec![],primary_bitmap_status:None,shader_preview:None}],objects:vec![],mesh:MeshData::default(),render_mesh:None,model_meshes:Default::default(),encounters:vec![],scripts:vec![],resources:vec![],diagnostics:vec![],scenario_path:"fixture".into()};
        let cube=preview_owned_cube(file.path(),&sha,&inspection,0x1234,None).unwrap();assert_eq!(cube.faces.len(),6);
        for (face,image)in cube.faces.iter().enumerate(){assert_eq!(image.dds_base64,base64(&dds_top_mip(4,4,"DXT3",&vec![face as u8;16]).unwrap()));}
        assert!(preview_owned_bitmap(file.path(),&sha,&inspection,0x1234,0).is_err());
        bytes[0x99c..0x9a0].copy_from_slice(&16u32.to_le_bytes());std::fs::write(file.path(),bytes).unwrap();let changed=maps::hash_file(file.path()).unwrap();inspection.sha256=changed.clone();
        assert!(preview_owned_cube(file.path(),&changed,&inspection,0x1234,None).is_err());assert!(preview_owned_cube(file.path(),&sha,&inspection,0x1234,None).is_err());
    }

}
