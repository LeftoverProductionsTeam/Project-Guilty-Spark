//! Read-only proof of shared original pixels in a single pinned source cache.
//! Does not rename tags, deduplicate native data, strip path suffixes or look
//! for visually similar images. Low-level resource span validation stays exact.
use super::*;
use crate::maps::Tag;
use crate::resource_map::{prove_external_image_range, ResourceIndex};
use std::collections::HashMap;

#[derive(Default)]
pub(super) struct BitmapAliases {
    by_records: Option<HashMap<Vec<u8>, Vec<String>>>,
}
/// All images in the native array must agree, including registration, mip
/// counts, dimensions, format, flags, file offset AND complete declared span.
/// Bytes 32..48 contain per-tag IDs, runtime pointers and editor bookkeeping;
/// they are neither dereferenced nor used to choose pixels. Never write/dedupe
/// these native structures (Invader marks BitmapData unsafe_to_dedupe).
fn records(bytes: &[u8], header: &MapHeader, tag: &Tag) -> Result<Vec<u8>> {
    if tag.external || tag.class != "bitm" {
        return invalid("Alias witness needs internal bitmap metadata");
    }
    let at = tag
        .data_offset
        .ok_or_else(|| SparkError::Invalid("Bitmap alias has no native body".into()))?;
    let region = TagRegion::from_header(bytes, header)?;
    region.contains(at, 108)?;
    let r = Reader(bytes);
    let count = r.u32(at + 96)? as usize;
    if count == 0 || count > MAX_IMAGES_PER_TAG {
        return invalid("Bitmap alias array is empty or excessive");
    }
    let table = region.pointer(r.u32(at + 100)?, count * 48)?;
    let mut key = Vec::with_capacity(4 + count * 32);
    key.extend_from_slice(&(count as u32).to_le_bytes());
    for image in 0..count {
        let p = table + image * 48;
        if r.fourcc(p)? != "bitm" || r.u16(p + 14)? & 0x100 == 0 {
            return invalid("Bitmap alias array has no complete external-image identity");
        }
        key.extend_from_slice(r.bytes(p, 32)?);
    }
    Ok(key)
}
impl BitmapAliases {
    pub(super) fn resolve(
        &mut self,
        bytes: &[u8],
        header: &MapHeader,
        inspection: &MapInspection,
        index: &ResourceIndex,
        tag: &Tag,
        image: usize,
        meta: &TopMipMetadata,
    ) -> Result<String> {
        let exact = prove_external_image_range(
            index,
            &tag.path,
            meta.raw_offset as u64,
            meta.declared_size as u64,
            meta.size,
            header.version,
            image,
        );
        if exact.is_ok() {
            return Ok(tag.path.clone());
        }
        // Never mask a duplicate key or an existing named entry with a bad
        // span. Aliases only explain an ABSENT name in a classic resource map.
        if !matches!(header.version, 6 | 7 | 609)
            || index.has_external_image_key(&tag.path, header.version, image)?
        {
            return Err(exact.unwrap_err());
        }
        let key = records(bytes, header, tag)?;
        if self.by_records.is_none() {
            let mut groups: HashMap<Vec<u8>, Vec<String>> = HashMap::new();
            let mut images = 0;
            for candidate in inspection
                .tags
                .iter()
                .filter(|t| t.class == "bitm" && !t.external)
            {
                let Ok(signature) = records(bytes, header, candidate) else {
                    continue;
                };
                images += (signature.len() - 4) / 32;
                if images > 16_384 {
                    return invalid("Bitmap alias review exceeds the image-count limit");
                }
                groups
                    .entry(signature)
                    .or_default()
                    .push(candidate.path.clone());
            }
            for paths in groups.values_mut() {
                paths.sort();
                paths.dedup();
            }
            self.by_records = Some(groups);
        }
        for witness in self
            .by_records
            .as_ref()
            .and_then(|groups| groups.get(&key))
            .into_iter()
            .flatten()
        {
            if witness == &tag.path {
                continue;
            }
            if prove_external_image_range(
                index,
                witness,
                meta.raw_offset as u64,
                meta.declared_size as u64,
                meta.size,
                header.version,
                image,
            )
            .is_ok()
            {
                return Ok(witness.clone());
            }
        }
        Err(exact.unwrap_err())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    struct Context {
        _directory: tempfile::TempDir,
        bytes: Vec<u8>,
        header: MapHeader,
        inspection: MapInspection,
        index: ResourceIndex,
    }
    fn tag(id: u32, path: &str, offset: usize) -> Tag {
        Tag {
            id,
            index: id as usize,
            class: "bitm".into(),
            path: path.into(),
            data_offset: Some(offset),
            external: false,
            fields: vec![],
            references: vec![],
            primary_bitmap_status: None,
            shader_preview: None,
        }
    }
    fn context(entries: &[(&str, u32, u32)]) -> Context {
        let mut bytes = vec![0; 0x1800];
        for (body, table, id) in [(0x900, 0xb00, 1u32), (0xa00, 0xc00, 2u32)] {
            bytes[body + 96..body + 100].copy_from_slice(&2u32.to_le_bytes());
            bytes[body + 100..body + 104]
                .copy_from_slice(&(0x4044_0000u32 + (table - 0x800) as u32).to_le_bytes());
            for frame in 0..2 {
                let at = table + frame * 48;
                bytes[at..at + 4].copy_from_slice(b"mtib");
                for (offset, value) in [
                    (4, 4u16),
                    (6, 4),
                    (8, 1),
                    (10, 0),
                    (12, 14),
                    (14, 0x100),
                    (20, 1),
                ] {
                    bytes[at + offset..at + offset + 2].copy_from_slice(&value.to_le_bytes());
                }
                bytes[at + 24..at + 28]
                    .copy_from_slice(&(0x400u32 + frame as u32 * 16).to_le_bytes());
                bytes[at + 28..at + 32].copy_from_slice(&16u32.to_le_bytes());
                bytes[at + 32..at + 36].copy_from_slice(&id.to_le_bytes());
            }
        }
        let header = MapHeader {
            version: 7,
            engine: "Halo PC".into(),
            name: "fixture".into(),
            build: "synthetic".into(),
            scenario_type: 1,
            file_size: 0x1800,
            declared_size: 0x1800,
            tag_offset: 0x800,
            tag_size: 0x800,
            crc32: 0,
            flags: 0,
            demo_layout: false,
            compressed: false,
            extended: false,
            legacy_tag_size_repair: false,
        };
        let inspection = MapInspection {
            header: header.clone(),
            sha256: "a".repeat(64),
            tag_checksum: None,
            decals: vec![],
            tags: vec![
                tag(1, "test/original", 0x900),
                tag(2, "test/original++", 0xa00),
            ],
            objects: vec![],
            mesh: maps::MeshData::default(),
            render_mesh: None,
            model_meshes: Default::default(),
            encounters: vec![],
            scripts: vec![],
            resources: vec![],
            diagnostics: vec![],
            scenario_path: "fixture".into(),
        };
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("bitmaps.map");
        let mut resource = vec![0u8; 0x600];
        for (at, value) in [(0, 1), (4, 0x100), (8, 0x40), (12, entries.len() as u32)] {
            resource[at..at + 4].copy_from_slice(&value.to_le_bytes());
        }
        let mut path_offset = 0usize;
        for (n, (name, offset, size)) in entries.iter().enumerate() {
            let at = 0x40 + n * 12;
            for (field, value) in [(0, path_offset as u32), (4, *size), (8, *offset)] {
                resource[at + field..at + field + 4].copy_from_slice(&value.to_le_bytes());
            }
            resource[0x100 + path_offset..0x100 + path_offset + name.len()]
                .copy_from_slice(name.as_bytes());
            path_offset += name.len() + 1;
        }
        fs::write(&file, resource).unwrap();
        let hash = maps::hash_file(&file).unwrap();
        let (_, index) = crate::resource_map::open_verified(&file, &hash).unwrap();
        Context {
            _directory: directory,
            bytes,
            header,
            inspection,
            index,
        }
    }
    fn standard() -> Context {
        context(&[
            ("test/original_0", 0x400, 16),
            ("test/original_1", 0x410, 16),
        ])
    }
    fn resolve(c: &Context) -> Result<String> {
        let meta = read_top_mip_metadata(&c.bytes, &c.header, 0xa00, 0)?;
        BitmapAliases::default().resolve(
            &c.bytes,
            &c.header,
            &c.inspection,
            &c.index,
            &c.inspection.tags[1],
            0,
            &meta,
        )
    }
    #[test]
    fn full_native_arrays_prove_shared_pixels_without_deduplicating_tag_ids_or_pointers() {
        let mut c = standard();
        c.bytes[0xc00 + 36..0xc00 + 48].fill(0xff);
        let original = c.bytes.clone();
        assert_eq!(resolve(&c).unwrap(), "test/original");
        assert_eq!(c.bytes, original);
    }
    #[test]
    fn an_identical_first_frame_is_insufficient_if_another_frame_or_the_count_differs() {
        let mut c = standard();
        c.bytes[0xc00 + 48 + 16] = 1;
        assert!(resolve(&c).is_err());
        let mut c = standard();
        c.bytes[0xa00 + 96..0xa00 + 100].copy_from_slice(&1u32.to_le_bytes());
        assert!(resolve(&c).is_err());
    }
    #[test]
    fn similar_names_and_raw_spans_without_a_native_witness_are_refused() {
        let mut c = standard();
        c.inspection.tags[0].external = true;
        assert!(resolve(&c).is_err());
        let mut c = standard();
        c.bytes[0xc00 + 4..0xc00 + 6].copy_from_slice(&2u16.to_le_bytes());
        assert!(resolve(&c).is_err());
    }
    #[test]
    fn a_named_but_bad_span_or_duplicate_resource_key_never_falls_back() {
        let c = context(&[
            ("test/original_0", 0x400, 16),
            ("test/original_1", 0x410, 16),
            ("test/original++_0", 0x450, 16),
        ]);
        assert!(resolve(&c).is_err());
        let c = context(&[
            ("test/original_0", 0x400, 16),
            ("test/original_0", 0x400, 16),
            ("test/original_1", 0x410, 16),
        ]);
        assert!(resolve(&c).is_err());
    }
    #[test]
    fn malformed_source_arrays_and_nonclassic_alias_requests_are_refused() {
        let mut c = standard();
        c.bytes[0xa00 + 100..0xa00 + 104].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(resolve(&c).is_err());
        let mut c = standard();
        let meta = read_top_mip_metadata(&c.bytes, &c.header, 0xa00, 0).unwrap();
        c.header.version = 13;
        assert!(BitmapAliases::default()
            .resolve(
                &c.bytes,
                &c.header,
                &c.inspection,
                &c.index,
                &c.inspection.tags[1],
                0,
                &meta
            )
            .is_err());
    }
}
