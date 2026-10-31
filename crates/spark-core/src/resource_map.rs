//! Bounded, read-only Halo 1 shared-resource index inspection.
//!
//! The classic resource-map header is 16 bytes; its 12-byte entries point at
//! path strings (relative to the path table) and opaque resource data. Bitmap
//! resource maps use type 1. Demo/PC image keys end in _<index>; CE pixel keys
//! end in __pixels. We require an
//! explicitly named, user-selected, SHA-256-pinned `bitmaps.map`, an exact tag
//! path, and an enclosing resource entry before exposing any raw bitmap bytes.
//! MCC's legacy shared bitmap map retains the retail per-image key/span layout;
//! its separately pinned ipak resources still use their own reader.
//! No offsets are inferred from tag IDs or fuzzy filenames. MCC ipaks and
//! external *tag metadata* are not covered by this reader.
use crate::{invalid, reject_links, Result, SparkError};
use serde::{Deserialize, Serialize};
use std::{fs::File, io::{Read, Seek, SeekFrom}, path::Path};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

const MAX_RESOURCE_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_RESOURCES: usize = 65_535;
const MAX_PATH_BYTES: u64 = 240;

#[derive(Clone, Debug)]
pub struct ResourceEntry {
    pub path: String,
    pub data_offset: u64,
    pub data_size: u64,
}
#[derive(Clone, Debug)]
pub struct ResourceIndex {
    pub kind_code: u32,
    pub file_size: u64,
    entries: Vec<ResourceEntry>,
    // Immutable alongside entries; duplicates retain their count and are never silently resolved.
    by_path: BTreeMap<String, (usize, usize)>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceMapAudit {
    pub kind_code: u32,
    pub resource_count: usize,
    pub exact_bitmap_path_matches: usize,
    pub missing_bitmap_path_matches: usize,
    pub ambiguous_bitmap_paths: usize,
    pub resource_sha256: String,
    pub warning: String,
}

fn u32_at(bytes: &[u8], at: usize) -> Result<u32> {
    let value = bytes.get(at..at + 4)
        .ok_or_else(|| SparkError::Invalid("Truncated shared-resource index".into()))?;
    Ok(u32::from_le_bytes(value.try_into().unwrap()))
}
fn read_exact_at(file: &mut File, at: u64, out: &mut [u8]) -> Result<()> {
    file.seek(SeekFrom::Start(at))?;
    file.read_exact(out)?;
    Ok(())
}
fn checked_end(at: u64, size: u64, limit: u64) -> Result<()> {
    if at.checked_add(size).is_none_or(|end| end > limit) {
        return invalid("Shared-resource offset or length escapes its file");
    }
    Ok(())
}
/// No case-sensitive filesystem assumption: Halo paths are logical, delimited
/// by backslashes. Reject unsafe path components rather than normalizing them.
fn normalize_path(value: &str) -> Result<String> {
    crate::safe_relative(value)?;
    Ok(value.replace('/', "\\").to_ascii_lowercase())
}

/// Validate every entry and string before returning the index. The input is
/// ALWAYS an already-opened, non-link, exact `bitmaps.map` file.
fn parse_index_kind(file: &mut File, len: u64,expected_kind:u32) -> Result<ResourceIndex> {
    if !(16..=MAX_RESOURCE_BYTES).contains(&len) { return invalid("Unsupported shared-resource file length"); }
    let mut hdr = [0u8; 16];
    read_exact_at(file, 0, &mut hdr)?;
    let kind = u32_at(&hdr, 0)?;
    if kind != expected_kind { return invalid("Classic resource-map type differs from the selected resource kind"); }
    let paths = u32_at(&hdr, 4)? as u64;
    let index_offset = u32_at(&hdr, 8)? as u64;
    let count = u32_at(&hdr, 12)? as usize;
    if count == 0 || count > MAX_RESOURCES { return invalid("Shared-resource count is empty or excessive"); }
    let index_size = (count as u64).checked_mul(12)
        .ok_or_else(|| SparkError::Invalid("Shared-resource index length overflow".into()))?;
    if paths < 16 || index_offset < 16 { return invalid("Shared-resource table overlaps header"); }
    checked_end(index_offset, index_size, len)?;
    if paths >= len { return invalid("Shared-resource path table is outside the file"); }
    let mut array = vec![0u8; index_size as usize];
    read_exact_at(file, index_offset, &mut array)?;
    let mut entries = Vec::with_capacity(count);
    for i in 0..count {
        let at = i * 12;
        let path_rel = u32_at(&array, at)? as u64;
        let data_size = u32_at(&array, at + 4)? as u64;
        let data_offset = u32_at(&array, at + 8)? as u64;
        if data_size == 0 { return invalid("Shared-resource entry has no data"); }
        checked_end(data_offset, data_size, len)?;
        // Raw data may legitimately be located before the index; never allow
        // it to refer into the index or its header.
        if data_offset < 16 ||
            (data_offset < index_offset + index_size && data_offset + data_size > index_offset) {
            return invalid("Shared-resource data overlaps the header/index");
        }
        let path_at = paths.checked_add(path_rel)
            .ok_or_else(|| SparkError::Invalid("Shared-resource path pointer overflow".into()))?;
        if path_at < 16 || path_at >= len ||
            (path_at >= index_offset && path_at < index_offset + index_size) {
            return invalid("Shared-resource path pointer overlaps header/index or escapes file");
        }
        let available = (len - path_at).min(MAX_PATH_BYTES + 1) as usize;
        let mut buf = vec![0u8; available];
        read_exact_at(file, path_at, &mut buf)?;
        let end = buf.iter().position(|b| *b == 0)
            .ok_or_else(|| SparkError::Invalid("Unterminated or oversized shared-resource path".into()))?;
        let raw_path = std::str::from_utf8(&buf[..end])
            .map_err(|_| SparkError::Invalid("Non-UTF8 shared-resource path".into()))?;
        let path = normalize_path(raw_path)?;
        entries.push(ResourceEntry {path, data_offset, data_size});
    }
    Ok(ResourceIndex::new(kind, len, entries))
}
#[cfg(test)]
fn parse_index(file:&mut File,len:u64)->Result<ResourceIndex>{parse_index_kind(file,len,1)}

fn verify_handle_hash(file: &mut File, expected_sha256: &str) -> Result<()> {
    let mut hasher = Sha256::new();
    file.seek(SeekFrom::Start(0))?;
    let mut buf = [0u8; 65536];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
    }
    if format!("{:x}",hasher.finalize()) != expected_sha256.to_ascii_lowercase() {
        return invalid("Resource map differs from this project's recorded SHA-256");
    }
    Ok(())
}

/// Borrow one file for its SHA check and subsequent range reads; an additional
/// SHA pass after reading detects a modified resource during extraction.
pub fn open_verified(path: &Path, expected_sha256: &str) -> Result<(File, ResourceIndex)> {
    open_verified_kind(path,expected_sha256,"bitmaps.map",1)
}
pub fn open_verified_sound(path:&Path,expected_sha256:&str)->Result<(File,ResourceIndex)>{
    open_verified_kind(path,expected_sha256,"sounds.map",2)
}
fn open_verified_kind(path:&Path,expected_sha256:&str,name:&str,kind:u32)->Result<(File,ResourceIndex)>{
    if !matches!(path.file_name().and_then(|n| n.to_str()), Some(n) if n.eq_ignore_ascii_case(name)) {
        return invalid(format!("Select the exact {name} file, not a different resource map"));
    }
    if expected_sha256.len() != 64 || !expected_sha256.bytes().all(|b| b.is_ascii_hexdigit()) {
        return invalid("An explicit recorded resource SHA-256 is required");
    }
    reject_links(path)?;
    let mut file = File::open(path)?;
    let meta = file.metadata()?;
    if !meta.is_file() || !(16..=MAX_RESOURCE_BYTES).contains(&meta.len()) {
        return invalid("The pinned bitmap resource is not a regular bounded file");
    }
    let len = meta.len();
    verify_handle_hash(&mut file, expected_sha256)?;
    let index = parse_index_kind(&mut file, len,kind)?;
    verify_handle_hash(&mut file, expected_sha256)?;
    Ok((file, index))
}
impl ResourceIndex {
    pub(crate) fn has_external_image_key(&self, tag: &str, generation: u32, image: usize) -> Result<bool> {
        Ok(self.count_exact(&bitmap_image_key(tag,generation,image)?)>0)
    }
    fn new(kind_code:u32,file_size:u64,entries:Vec<ResourceEntry>)->Self {
        let mut by_path=BTreeMap::new();
        for (i,entry) in entries.iter().enumerate() {
            let record=by_path.entry(entry.path.clone()).or_insert((i,0usize));record.1+=1;
        }
        Self{kind_code,file_size,entries,by_path}
    }
    pub fn entries(&self)->&[ResourceEntry]{&self.entries}
    fn exact(&self, requested: &str) -> Result<&ResourceEntry> {
        let name = normalize_path(requested)?;
        let (first,count)=self.by_path.get(&name).ok_or_else(||SparkError::Invalid(
            "No exact tag/image path in the selected resource index; fuzzy matching refused".into()))?;
        if *count!=1{return invalid("Multiple shared-resource entries use the same tag/image path");}
        Ok(&self.entries[*first])
    }
    fn count_exact(&self, name: &str) -> usize {
        normalize_path(name).ok().and_then(|p|self.by_path.get(&p).map(|(_,count)|*count)).unwrap_or(0)
    }
}

pub(crate) fn read_external_sound_from_verified(file:&mut File,index:&ResourceIndex,tag:&str,pitch:usize,permutation:usize,generation:u32,offset:u64,length:usize)->Result<Vec<u8>>{
    if index.kind_code!=2||length==0||length>16*1024*1024{return invalid("Unsupported or oversized sound resource span");}
    let key=match generation{6|7=>format!("{tag}__{pitch}__{permutation}"),609=>format!("{tag}__samples"),_=>return invalid("Unsupported sound resource generation")};
    let entry=index.exact(&key)?;let end=offset.checked_add(length as u64).ok_or_else(||SparkError::Invalid("Sound span overflow".into()))?;
    if offset<entry.data_offset||end>entry.data_offset+entry.data_size||end>index.file_size{return invalid("Sound range does not belong to its exact indexed permutation");}
    let mut bytes=vec![0u8;length];read_exact_at(file,offset,&mut bytes)?;Ok(bytes)
}

pub fn audit(path: &Path, expected_sha256: &str, bitmap_paths: &[String]) -> Result<ResourceMapAudit> {
    let (_file, index) = open_verified(path, expected_sha256)?;
    let mut exact = 0;
    let mut missing = 0;
    let mut ambiguous = 0;
    for path in bitmap_paths {
        match index.count_exact(path) {
            1 => exact += 1,
            0 => missing += 1,
            _ => ambiguous += 1,
        }
    }
    Ok(ResourceMapAudit {
        kind_code: index.kind_code,
        resource_count: index.entries.len(),
        exact_bitmap_path_matches: exact,
        missing_bitmap_path_matches: missing,
        ambiguous_bitmap_paths: ambiguous,
        resource_sha256: expected_sha256.to_ascii_lowercase(),
        warning: "Index audit only. Pixel previews additionally require the generation-specific image key and bounded raw span. External tag metadata and MCC ipaks remain unsupported.".into(),
    })
}

/// Re-check an already-open, pinned resource handle after a group of reads.
/// No new path is followed and no data is returned until this check succeeds.
pub(crate) fn verify_open_handle_hash(file: &mut File, sha256: &str) -> Result<()> {
    verify_handle_hash(file, sha256)
}

/// Read from an already verified handle and index. The *caller* must verify the
/// same handle's SHA-256 again after ALL reads, before exposing any results.
/// This lets a whole preview batch share one bounded index and hash pass.
pub(crate) fn read_external_top_mip_from_verified(
    file: &mut File,
    index: &ResourceIndex,
    tag_path: &str,
    raw_offset: u64,
    declared_size: u64,
    top_mip_size: usize,
    generation: u32,
    image_index: usize,
) -> Result<Vec<u8>> {
    prove_external_image_range(index, tag_path, raw_offset, declared_size, top_mip_size, generation, image_index)?;
    let mut bytes = vec![0u8; top_mip_size];
    read_exact_at(file, raw_offset, &mut bytes)?;
    Ok(bytes)
}

pub(crate) fn prove_external_image_range(index: &ResourceIndex, tag_path: &str,
    raw_offset: u64, declared_size: u64, top_mip_size: usize, generation: u32, image_index: usize) -> Result<()> {
    if top_mip_size == 0 || top_mip_size > 16 * 1024 * 1024 || declared_size < top_mip_size as u64 {
        return invalid("Invalid or oversized external bitmap mipmap");
    }
    // Gearbox retail/Demo indexes each image as <tag>_<image>, while CE
    // groups the tag's images in <tag>__pixels. These are format-defined keys,
    // never filename guesses. See Invader resource.cpp and C33 research notes.
    let key = bitmap_image_key(tag_path,generation,image_index)?;
    let entry = index.exact(&key)?;
    let entry_end = entry.data_offset.checked_add(entry.data_size)
        .ok_or_else(|| SparkError::Invalid("External resource span overflow".into()))?;
    if raw_offset < entry.data_offset ||
        raw_offset.checked_add(top_mip_size as u64).is_none_or(|end| end > entry_end || end > index.file_size) ||
        raw_offset.checked_add(declared_size).is_none_or(|end| end > entry_end) {
        return invalid("Pixel range not proven to belong to the exact bitmap resource entry");
    }
    Ok(())
}

fn bitmap_image_key(tag_path:&str,generation:u32,image_index:usize)->Result<String>{
    Ok(match generation {
        6 | 7 | 13 => format!("{tag_path}_{image_index}"),
        609 => format!("{tag_path}__pixels"),
        0 => tag_path.to_owned(),
        _ => return invalid("Unsupported resource-map generation; MCC ipaks need a separate reader"),
    })
}

/// Returns one precisely bounded top-mip byte range only when its raw offset
/// is demonstrably inside a unique resource entry with the exact tag path.
/// Other external layouts are deliberately unsupported. Nothing is persisted.
pub fn read_external_top_mip(path: &Path, expected_sha256: &str, tag_path: &str, raw_offset: u64, declared_size: u64, top_mip_size: usize) -> Result<Vec<u8>> {
    read_external_image_top_mip(path, expected_sha256, tag_path, raw_offset, declared_size, top_mip_size, 0, 0)
}

pub fn read_external_image_top_mip(path: &Path, expected_sha256: &str, tag_path: &str, raw_offset: u64, declared_size: u64, top_mip_size: usize, generation: u32, image_index: usize) -> Result<Vec<u8>> {
    let (mut file, index) = open_verified(path, expected_sha256)?;
    let pixels = read_external_top_mip_from_verified(
        &mut file, &index, tag_path, raw_offset, declared_size, top_mip_size, generation, image_index,
    )?;
    // Prevent a concurrent source-file change from creating an apparently
    // verified image after a valid initial SHA read.
    verify_open_handle_hash(&mut file, expected_sha256)?;
    Ok(pixels)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    fn fixture() -> (tempfile::NamedTempFile, String) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bitmaps.map");
        let mut bytes = vec![0u8; 0x500];
        let put = |b: &mut [u8], at: usize, x: u32| b[at..at+4].copy_from_slice(&x.to_le_bytes());
        put(&mut bytes,0,1); put(&mut bytes,4,0x100); put(&mut bytes,8,0x40); put(&mut bytes,12,1);
        put(&mut bytes,0x40,0);put(&mut bytes,0x44,64);put(&mut bytes,0x48,0x300);
        bytes[0x100..0x100+18].copy_from_slice(b"test\\wall\\albedo\0\0");
        bytes[0x300..0x340].fill(0x5a);
        let mut f = File::create(&path).unwrap();f.write_all(&bytes).unwrap();f.sync_all().unwrap();
        let sha = format!("{:x}",Sha256::digest(&bytes));
        // Keep the directory alive while returning a NamedTempFile-like handle.
        let copy = tempfile::NamedTempFile::new().unwrap();
        std::fs::copy(&path,copy.path()).unwrap();
        (copy,sha)
    }
    #[test] fn bounded_index_and_verified_exact_span() {
        let (tmp,sha) = fixture();
        // The parser fixture has a neutral temp basename; rename within a
        // dedicated temp directory for the strict resource identity check.
        let dir = tempfile::tempdir().unwrap();
        let path=dir.path().join("bitmaps.map");std::fs::copy(tmp.path(),&path).unwrap();
        let (_,index)=open_verified(&path,&sha).unwrap();
        assert_eq!(index.entries.len(),1);
        let bytes=read_external_top_mip(&path,&sha,"TEST/wall/albedo",0x300,64,16).unwrap();
        assert_eq!(bytes,vec![0x5a;16]);
        assert!(read_external_top_mip(&path,&sha,"test/wall/other",0x300,64,16).is_err());
        assert!(read_external_top_mip(&path,&sha,"test/wall/albedo",0x2ff,64,16).is_err());
        assert!(open_verified(&path,&"0".repeat(64)).is_err());
    }
    #[test] fn malformed_index_and_traversal_fail_closed() {
        let (tmp,_sha)=fixture();
        let mut file=File::open(tmp.path()).unwrap();
        let len=file.metadata().unwrap().len();
        assert_eq!(parse_index(&mut file,len).unwrap().entries[0].path,"test\\wall\\albedo");
        let mut bytes=std::fs::read(tmp.path()).unwrap();
        bytes[0x100..0x105].copy_from_slice(b"../x\0");
        let mut file=tempfile::NamedTempFile::new().unwrap();file.write_all(&bytes).unwrap();
        assert!(parse_index(file.as_file_mut(), bytes.len() as u64).is_err());
        let mut bytes=std::fs::read(tmp.path()).unwrap();
        bytes[0x48..0x4c].copy_from_slice(&0xffff_fff0u32.to_le_bytes());
        let mut file=tempfile::NamedTempFile::new().unwrap();file.write_all(&bytes).unwrap();
        assert!(parse_index(file.as_file_mut(), bytes.len() as u64).is_err());
    }
    #[test]
    fn mcc_shared_pixels_require_the_exact_image_key_and_entire_declared_span() {
        let index=ResourceIndex::new(1,2048,vec![ResourceEntry{
            path:"scenery\\teleporter\\mask_0".into(),data_offset:512,data_size:64}]);
        assert!(prove_external_image_range(&index,"scenery/teleporter/mask",512,64,16,13,0).is_ok());
        for (path,offset,length,image) in [("scenery/teleporter/mask",512,65,0),("scenery/teleporter/mask",511,64,0),
            ("scenery/teleporter/mask",512,64,1),("scenery/teleporter/other",512,64,0)] {
            assert!(prove_external_image_range(&index,path,offset,length,16,13,image).is_err());
        }
    }
    #[test]
    fn full_sized_path_index_preserves_unique_and_ambiguous_entries() {
        let mut entries=(0..MAX_RESOURCES-1).map(|i|ResourceEntry{path:format!("bitmap_{i}"),data_offset:i as u64+16,data_size:1}).collect::<Vec<_>>();
        entries.push(entries[0].clone());let index=ResourceIndex::new(1,MAX_RESOURCE_BYTES,entries);
        assert_eq!(index.entries().len(),MAX_RESOURCES);assert_eq!(index.by_path.len(),MAX_RESOURCES-1);
        assert_eq!(index.count_exact("BITMAP_0"),2);assert!(index.exact("bitmap_0").is_err());
        for i in 1..MAX_RESOURCES-1 {assert_eq!(index.count_exact(&format!("bitmap_{i}")),1);assert_eq!(index.exact(&format!("BITMAP_{i}")).unwrap().data_offset,i as u64+16);}
        assert_eq!(index.count_exact("absent"),0);assert!(index.exact("../bitmap_1").is_err());
    }

}
