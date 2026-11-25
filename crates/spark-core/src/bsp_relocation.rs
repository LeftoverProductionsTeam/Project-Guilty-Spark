//! Rigid translation of a standard CE609 BSP for extraction into owned native tags.
//! Topology, directions, lightmap coordinates and non-spatial data stay intact.
use super::{cache_tag_space, read_cache_snapshot_shared, vec3, MapHeader, MapInspection, Space};
use crate::{binary::Reader, invalid, Result, SparkError};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BspRelocation {
    pub source_sha256: String,
    pub translation: [f64; 3],
    pub spatial_writes: usize,
    pub projected_nodes: usize,
    pub render_vertices: usize,
}

#[derive(Clone, PartialEq)]
struct Write {
    at: usize,
    size: usize,
    bytes: [u8; 4],
}

struct Relocator<'a> {
    reader: Reader<'a>,
    region: Space,
    delta: [f64; 3],
    writes: Vec<Write>,
}

impl Relocator<'_> {
    fn block(&self, at: usize, stride: usize, limit: usize) -> Result<impl Iterator<Item = usize>> {
        let (begin, count) = self.region.block(&self.reader, at, stride, limit)?;
        Ok((0..count).map(move |index| begin + index * stride))
    }

    fn push(&mut self, write: Write) -> Result<()> {
        if write.at < self.region.begin || write.at + write.size > self.region.end {
            return invalid("A BSP translation would leave the selected structure");
        }
        if self.writes.len() >= 2_000_000 {
            return invalid("BSP relocation exceeds its coordinate budget");
        }
        self.writes.push(write);
        Ok(())
    }

    fn scalar(&mut self, at: usize, delta: f64) -> Result<()> {
        if delta == 0. {
            return Ok(());
        }
        let value = (f64::from(self.reader.f32(at)?) + delta) as f32;
        if !value.is_finite() {
            return invalid("A translated BSP coordinate is not finite");
        }
        self.push(Write {
            at,
            size: 4,
            bytes: value.to_le_bytes(),
        })
    }

    fn point(&mut self, at: usize) -> Result<()> {
        for (axis, delta) in self.delta.into_iter().enumerate() {
            self.scalar(at + axis * 4, delta)?;
        }
        Ok(())
    }

    fn bounds(&mut self, at: usize) -> Result<()> {
        for (axis, delta) in self.delta.into_iter().enumerate() {
            for edge in [0, 4] {
                self.scalar(at + axis * 8 + edge, delta)?;
            }
        }
        Ok(())
    }

    fn plane(&mut self, at: usize) -> Result<()> {
        let normal = vec3(&self.reader, at)?;
        let shift = normal
            .into_iter()
            .zip(self.delta)
            .map(|(n, d)| f64::from(n) * d)
            .sum();
        self.scalar(at + 12, shift)
    }

    fn point_block(
        &mut self,
        at: usize,
        stride: usize,
        limit: usize,
        point_offset: usize,
    ) -> Result<()> {
        for row in self.block(at, stride, limit)? {
            self.point(row + point_offset)?;
        }
        Ok(())
    }

    fn collision(&mut self, root: usize) -> Result<usize> {
        let planes: Vec<_> = self.block(root + 12, 16, 262_144)?.collect();
        let projected: Vec<_> = self.block(root + 48, 20, 262_144)?.collect();
        self.point_block(root + 84, 16, 131_072, 0)?;
        for &at in &planes {
            self.plane(at)?;
        }
        let mut shifts = vec![None::<f64>; projected.len()];
        let mut visited = vec![0u8; projected.len()];
        // A 2D cut is expressed in the coordinates selected by its parent
        // reference plane. Keep that projection when moving its distance.
        for reference in self.block(root + 36, 8, 262_144)? {
            let child = self.reader.u32(reference + 4)?;
            if child & 0x8000_0000 != 0 {
                continue;
            }
            let designator = self.reader.u32(reference)?;
            let at = planes
                .get((designator & 0x7fff_ffff) as usize)
                .ok_or_else(|| {
                    SparkError::Invalid("BSP projection references an invalid plane".into())
                })?;
            let (u, v) = projection_axes(vec3(&self.reader, *at)?, designator);
            let projection = 1u8 << (u * 3 + v);
            let mut stack = vec![child];
            while let Some(index) = stack.pop() {
                if index & 0x8000_0000 != 0 {
                    continue;
                }
                let index = index as usize;
                let at = *projected.get(index).ok_or_else(|| {
                    SparkError::Invalid("BSP projection references an invalid child".into())
                })?;
                if visited[index] & projection != 0 {
                    continue;
                }
                visited[index] |= projection;
                let shift = f64::from(self.reader.f32(at)?) * self.delta[u]
                    + f64::from(self.reader.f32(at + 4)?) * self.delta[v];
                let prior = &mut shifts[index];
                if prior.is_some_and(|known| (known - shift).abs() > 1e-5) {
                    return invalid("Shared BSP projection nodes require different translations");
                }
                *prior = Some(shift);
                stack.extend([self.reader.u32(at + 12)?, self.reader.u32(at + 16)?]);
            }
        }
        let mut count = 0;
        for (index, shift) in shifts.into_iter().enumerate() {
            if let Some(shift) = shift {
                self.scalar(projected[index] + 8, shift)?;
                count += 1;
            }
        }
        Ok(count)
    }

    fn render(&mut self, root: usize) -> Result<usize> {
        let mut total = 0;
        for lightmap in self.block(root + 0x104, 32, 128)? {
            for material in self.block(lightmap + 20, 256, 2048)? {
                self.point(material + 28)?;
                self.plane(material + 156)?;
                let count = self.reader.u32(material + 180)? as usize;
                if count == 0 {
                    continue;
                }
                let length = self.reader.u32(material + 216)? as usize;
                if count > 100_000
                    || self.reader.u16(material + 176)? != 0
                    || self.reader.u32(material + 236)? != 0
                    || length < count * 56
                {
                    return invalid("Relocation requires a checked uncompressed CE render stream");
                }
                let start = self
                    .region
                    .pointer(self.reader.u32(material + 228)?, length)?;
                for index in 0..count {
                    self.point(start + index * 56)?;
                }
                total += count;
                if total > 500_000 {
                    return invalid("BSP relocation exceeds its render vertex budget");
                }
            }
        }
        Ok(total)
    }

    fn detail_cells(&mut self, root: usize) -> Result<()> {
        for detail in self.block(root + 0x24c, 64, 1)? {
            for cell in self.block(detail, 32, 262_144)? {
                // Instance positions and height references are relative to this grid.
                for (axis, delta) in self.delta.into_iter().enumerate() {
                    if delta == 0. {
                        continue;
                    }
                    let cells = delta / 8.;
                    if cells.fract() != 0. {
                        return invalid("Painted BSP details require an 8-world-unit translation");
                    }
                    let at = cell + axis * 2;
                    let current = self.reader.u16(at)? as i16;
                    let relocated =
                        i16::try_from(i32::from(current) + cells as i32).map_err(|_| {
                            SparkError::Invalid(
                                "Translated detail cell exceeds native bounds".into(),
                            )
                        })?;
                    let [low, high] = relocated.to_le_bytes();
                    self.push(Write {
                        at,
                        size: 2,
                        bytes: [low, high, 0, 0],
                    })?;
                }
            }
        }
        Ok(())
    }

    fn environment(&mut self, root: usize) -> Result<()> {
        self.point_block(root + 0x128, 16, 65_536, 0)?;
        for cluster in self.block(root + 0x134, 104, 8192)? {
            for subcluster in self.block(cluster + 52, 36, 4096)? {
                self.bounds(subcluster)?;
            }
            for mirror in self.block(cluster + 80, 64, 16)? {
                self.plane(mirror)?;
                self.point_block(mirror + 52, 12, 512, 0)?;
            }
        }
        for portal in self.block(root + 0x154, 64, 512)? {
            self.point(portal + 8)?;
            self.point_block(portal + 52, 12, 128, 0)?;
        }
        self.point_block(root + 0x16c, 48, 256, 0)?;
        for fog in self.block(root + 0x178, 32, 32)? {
            self.plane(fog + 4)?;
            self.point_block(fog + 20, 12, 4096, 0)?;
        }
        for volume in self.block(root + 0x1c0, 32, 32)? {
            self.point(volume)?;
            for plane in self.block(volume + 20, 16, 16)? {
                self.plane(plane)?;
            }
        }
        self.point_block(root + 0x240, 60, 1024, 48)?;
        self.detail_cells(root)?;
        self.point_block(root + 0x258, 16, 6144, 0)
    }
}

fn projection_axes(normal: [f32; 3], designator: u32) -> (usize, usize) {
    let [x, y, z] = normal.map(f32::abs);
    let major = if z >= x && z >= y {
        2
    } else {
        usize::from(y >= x)
    };
    let next = (major + 1) % 3;
    let last = (major + 2) % 3;
    if (normal[major] > 0.) != (designator & 0x8000_0000 != 0) {
        (next, last)
    } else {
        (last, next)
    }
}

pub(crate) fn preflight_bsp_relocation(path: &Path, inspection: &MapInspection, delta: [f64; 3]) -> Result<()> {
    let (header, bytes, hash) = read_cache_snapshot_shared(path)?;
    checked_relocation_root(&Reader(&bytes), &header, &hash, inspection, delta)?;
    Ok(())
}

fn checked_relocation_root(
    reader: &Reader<'_>, header: &MapHeader, source_sha256: &str,
    inspection: &MapInspection, delta: [f64; 3],
) -> Result<(Space, usize)> {
    if delta.iter().any(|v| !v.is_finite() || v.abs() > 1500.) || delta == [0.; 3] {
        return invalid("Choose a finite nonzero BSP translation within 1500 world units");
    }
    if header.version != 609
        || header.extended
        || inspection.header.extended
        || inspection.sha256 != source_sha256
    {
        return invalid("BSP relocation requires the exact inspected stock CE609 source");
    }
    let tags = cache_tag_space(reader, header)?;
    let scenario = inspection
        .tags
        .iter()
        .find(|tag| tag.class == "scnr" && tag.path == inspection.scenario_path)
        .and_then(|tag| tag.data_offset)
        .ok_or_else(|| SparkError::Invalid("Stock scenario tag is unavailable".into()))?
        as usize;
    let (reference, count) = tags.block(reader, scenario + 0x5a4, 32, 16)?;
    if count != 1 {
        return invalid("This relocation requires a single donor BSP");
    }
    let begin = reader.u32(reference)? as usize;
    let size = reader.u32(reference + 4)? as usize;
    reader.bytes(begin, size)?;
    let region = Space {
        begin,
        end: begin + size,
        address: reader.u32(reference + 8)?,
    };
    let root = region.pointer(reader.u32(begin)?, 648)?;
    if reader.u32(root + 0x270)? != 0 || reader.u32(root + 0x27c)? != 0 {
        return invalid(
            "Editor-only leaf map coordinates require a source format that supports relocation",
        );
    }
    for (axis, delta) in delta.into_iter().enumerate() {
        let low = f64::from(reader.f32(root + 0xc8 + axis * 8)?) + delta;
        let high = f64::from(reader.f32(root + 0xcc + axis * 8)?) + delta;
        if low > high || low < -1500. || high > 1500. {
            return invalid("Relocated structure bounds exceed the reviewed 1500-world-unit limit");
        }
    }
    Ok((region, root))
}

/// Returns a derived extractor input. Its scenario placements and cache
/// checksum are untouched, so the returned bytes are not a playable export.
pub fn translate_bsp_extraction_input(
    path: &Path,
    inspection: &MapInspection,
    delta: [f64; 3],
) -> Result<(Vec<u8>, BspRelocation)> {
    let (header, bytes, source_sha256) = read_cache_snapshot_shared(path)?;
    let reader = Reader(&bytes);
    let (region, root) = checked_relocation_root(&reader, &header, &source_sha256, inspection, delta)?;
    let (collision, count) = region.block(&reader, root + 0xb0, 96, 1)?;
    if count != 1 {
        return invalid("Donor does not have one checked native collision BSP");
    }
    let mut relocate = Relocator {
        reader,
        region,
        delta,
        writes: vec![],
    };
    let projected_nodes = relocate.collision(collision)?;
    let render_vertices = relocate.render(root)?;
    relocate.scalar(root + 16, delta[2])?;
    relocate.scalar(root + 20, delta[2])?;
    relocate.bounds(root + 0xc8)?;
    relocate.environment(root)?;
    relocate.writes.sort_by_key(|write| write.at);
    relocate.writes.dedup();
    if relocate
        .writes
        .windows(2)
        .any(|pair| pair[0].at + pair[0].size > pair[1].at)
    {
        return invalid("Native BSP fields overlap with incompatible coordinate writes");
    }
    let mut output = bytes.to_vec();
    for write in &relocate.writes {
        output[write.at..write.at + write.size].copy_from_slice(&write.bytes[..write.size]);
    }
    Ok((
        output,
        BspRelocation {
            source_sha256,
            translation: delta,
            spatial_writes: relocate.writes.len(),
            projected_nodes,
            render_vertices,
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::maps::{hash_file, inspect_map};
    use sha2::{Digest, Sha256};

    #[test]
    #[ignore = "requires the reviewed owner-installed Death Island CE609 cache"]
    fn installed_translation_preserves_the_reviewed_stock_structure() {
        let source = std::path::PathBuf::from(
            std::env::var_os("SPARK_STOCK_PORTAL_MAP").expect("Set the exact owned fixture"),
        );
        let inspection = inspect_map(&source, source.parent()).unwrap();
        assert_eq!(
            inspection.sha256,
            "f9684cb7e5436fd2901b7ea226726a6089957b91459923421264a5436f743244"
        );
        preflight_bsp_relocation(&source, &inspection, [-104., 0., 72.]).unwrap();
        let (translated, report) =
            translate_bsp_extraction_input(&source, &inspection, [-104., 0., 72.]).unwrap();
        assert_eq!(
            crate::hex_bytes(Sha256::digest(&translated)),
            "d55c9e5840d64bfec3b46412441d8ede14415cf34b74b7031b4437b3c8ce3144"
        );
        assert_eq!(
            (
                report.projected_nodes,
                report.render_vertices,
                report.spatial_writes
            ),
            (2_358, 23_427, 86_378)
        );
        assert!(translate_bsp_extraction_input(&source, &inspection, [1500., 0., 0.]).is_err());
        assert!(preflight_bsp_relocation(&source, &inspection, [1500., 0., 0.]).is_err());
        assert_eq!(hash_file(&source).unwrap(), inspection.sha256);
    }
}
