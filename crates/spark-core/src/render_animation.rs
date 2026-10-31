//! Read-only, bounded native Halo 1 animation previews. Compressed streams are
//! refused explicitly; no guessed frame or synthetic idle replaces native data.
use super::{object_model_mesh, tag_space, Region};
use crate::{
    animations::{AnimationClip, AnimationNode},
    binary::Reader,
    invalid,
    maps::{MapHeader, ModelRig, Tag},
    Result, SparkError,
};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAnimations {
    pub object_tag_id: u32,
    pub graph_tag_id: u32,
    pub clips: Vec<AnimationClip>,
    pub unavailable: Vec<String>,
}
fn data<'a>(r: &Reader<'a>, region: Region, at: usize, maximum: usize) -> Result<&'a [u8]> {
    let length = r.u32(at)? as usize;
    if length > maximum {
        return invalid("Native animation data exceeds its preview budget");
    }
    if r.u32(at + 4)? != 0 {
        return invalid("External native animation data is unsupported");
    }
    if length == 0 {
        return Ok(&[]);
    }
    r.bytes(region.pointer(r.u32(at + 12)?, length)?, length)
}
fn flags(r: &Reader, at: usize, count: usize) -> Result<u64> {
    let value = r.u32(at)? as u64 | ((r.u32(at + 4)? as u64) << 32);
    if count < 64 && value >> count != 0 {
        return invalid("Animation channels refer to a missing bone");
    }
    Ok(value)
}
fn rotation(r: &Reader, cursor: &mut usize) -> Result<[f32; 4]> {
    let mut q = [0.; 4];
    for (i, v) in q.iter_mut().enumerate() {
        *v = r.u16(*cursor + i * 2)? as i16 as f32 / 32767.;
    }
    *cursor += 8;
    let length = q.iter().map(|v| v * v).sum::<f32>().sqrt();
    if !(0.98..=1.02).contains(&length) {
        return invalid("Native animation quaternion is invalid");
    }
    for v in &mut q {
        *v /= length;
    }
    Ok(q)
}
fn translation(r: &Reader, cursor: &mut usize) -> Result<[f32; 3]> {
    let result = [r.f32(*cursor)?, r.f32(*cursor + 4)?, r.f32(*cursor + 8)?];
    *cursor += 12;
    Ok(result)
}
fn decode(r: &Reader, region: Region, at: usize, rig: &ModelRig) -> Result<AnimationClip> {
    let frames = r.u16(at + 34)? as usize;
    let stride = r.u16(at + 36)? as usize;
    let count = r.u16(at + 44)? as usize;
    if count == 0
        || count != rig.nodes.len()
        || count > 64
        || frames == 0
        || frames > 9000
        || frames * count * 8 > 2_000_000
    {
        return invalid("Native animation frame/bone count is invalid or excessive");
    }
    let clip_flags = r.u16(at + 58)?;
    if clip_flags & 1 != 0 || r.u32(at + 136)? != 0 {
        return invalid("Compressed native animation playback is not implemented");
    }
    if clip_flags & !7 != 0 || clip_flags & 2 != 0 {
        return invalid("World-relative or unknown native animation flags are unsupported");
    }
    let checksum = r.u32(at + 40)?;
    if checksum != rig.checksum {
        return invalid("Native animation and model skeleton checksums differ");
    }
    let t = flags(r, at + 92, count)?;
    let q = flags(r, at + 108, count)?;
    let s = flags(r, at + 124, count)?;
    let animated = (q.count_ones() * 8 + t.count_ones() * 12 + s.count_ones() * 4) as usize;
    if animated != stride {
        return invalid("Native animation channel sizes disagree with its frame stride");
    }
    let defaults = data(r, region, at + 140, 16384)?;
    let frames_data = data(r, region, at + 160, 1024 * 1024)?;
    if defaults.len() != count * 24 - stride || frames_data.len() != frames * stride {
        return invalid("Native animation frame/default data is truncated or inconsistent");
    }
    let mut pose = vec![[0., 0., 0., 0., 0., 0., 1., 1.]; count];
    let dr = Reader(defaults);
    let mut cursor = 0;
    for (i, node) in pose.iter_mut().enumerate() {
        if q & (1 << i) == 0 {
            node[3..7].copy_from_slice(&rotation(&dr, &mut cursor)?);
        }
        if t & (1 << i) == 0 {
            node[..3].copy_from_slice(&translation(&dr, &mut cursor)?);
        }
        if s & (1 << i) == 0 {
            node[7] = dr.f32(cursor)?;
            cursor += 4;
        }
    }
    let fr = Reader(frames_data);
    let mut transforms = Vec::with_capacity(frames * count * 8);
    for frame in 0..frames {
        let mut cursor = frame * stride;
        for (i, default) in pose.iter().enumerate() {
            let mut node = *default;
            if q & (1 << i) != 0 {
                node[3..7].copy_from_slice(&rotation(&fr, &mut cursor)?);
            }
            if t & (1 << i) != 0 {
                node[..3].copy_from_slice(&translation(&fr, &mut cursor)?);
            }
            if s & (1 << i) != 0 {
                node[7] = fr.f32(cursor)?;
                cursor += 4;
            }
            transforms.extend(node);
        }
    }
    let clip = AnimationClip {
        name: r.string(at, 32)?,
        fps: if clip_flags & 4 != 0 { 25. } else { 30. },
        frame_count: frames,
        checksum,
        // Cached graph hierarchy cells can be stripped. Use the verified model
        // hierarchy only after exact source graph, checksum, names and order agree.
        nodes: rig
            .nodes
            .iter()
            .map(|n| AnimationNode {
                name: n.name.clone(),
                parent: n.parent,
            })
            .collect(),
        transforms,
    };
    clip.validate()?;
    Ok(clip)
}
fn multiply(a: &[f32], b: &[f32]) -> [f32; 4] {
    [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ]
}
fn apply_overlay(clip: &mut AnimationClip, basis: &[f32]) -> Result<()> {
    let count = clip.nodes.len();
    for (i, node) in clip.transforms.chunks_exact_mut(8).enumerate() {
        let base = &basis[(i % count) * 8..(i % count + 1) * 8];
        let rotation = multiply(&base[3..7], &node[3..7]);
        let vector = multiply(
            &multiply(&base[3..7], &[node[0], node[1], node[2], 0.]),
            &[-base[3], -base[4], -base[5], base[6]],
        );
        for axis in 0..3 {
            node[axis] = base[axis] + vector[axis] * base[7];
        }
        node[3..7].copy_from_slice(&rotation);
        node[7] *= base[7];
    }
    clip.validate()
}
pub fn object_animation_clips(
    bytes: &[u8],
    header: &MapHeader,
    tags: &[Tag],
    object_id: u32,
) -> Result<NativeAnimations> {
    if !matches!(header.version, 6 | 7 | 609 | 13) {
        return invalid("Native animation preview requires a supported PC-derived Halo 1 cache");
    }
    let object = tags
        .iter()
        .find(|t| t.id == object_id && !t.external)
        .ok_or_else(|| SparkError::Invalid("Animation object is absent".into()))?;
    let graph = object
        .references
        .iter()
        .filter(|reference| reference.label == "Animation graph")
        .find_map(|reference| {
            tags.iter()
                .find(|t| t.id == reference.target_id && t.class == "antr" && !t.external)
        })
        .ok_or_else(|| {
            SparkError::Invalid("This object has no internal native animation graph".into())
        })?;
    let (_, model) = object_model_mesh(bytes, header, tags, object_id, 0)?;
    let rig = model.rig.ok_or_else(|| {
        SparkError::Invalid("The model has no verified native skeleton and skin weights".into())
    })?;
    let r = Reader(bytes);
    let region = tag_space(&r, header)?;
    let at = graph
        .data_offset
        .ok_or_else(|| SparkError::Invalid("Animation graph body is absent".into()))?;
    if at < region.begin || at.checked_add(128).is_none_or(|end| end > region.end) {
        return invalid("Native graph header escapes its tag region");
    }
    let (nodes, count) = region.block(&r, at + 104, 64, 64)?;
    if count != rig.nodes.len() || count == 0 {
        return invalid("Native graph skeleton size differs from its model");
    }
    for (i, node) in rig.nodes.iter().enumerate() {
        if r.string(nodes + i * 64, 32)? != node.name {
            return invalid("Native graph skeleton names/order differ from the exact model");
        }
    }
    let (animations, count) = region.block(&r, at + 116, 180, 2048)?;
    let mut candidates = (0..count)
        .map(|i| {
            let row = animations + i * 180;
            Ok((row, r.string(row, 32)?))
        })
        .collect::<Result<Vec<_>>>()?;
    candidates.sort_by_key(|(_, name)| {
        if name == "idle overlay" {
            0
        } else if name.ends_with("idle") {
            1
        } else {
            2
        }
    });
    let mut clips = vec![];
    let mut unavailable = vec![];
    let mut kinds = vec![];
    let mut values = 0;
    for (row, name) in candidates.into_iter().take(16) {
        let kind = r.u16(row + 32)?;
        if kind > 1 {
            unavailable.push(format!(
                "{name}: replacement clips require native channel blending"
            ));
            continue;
        }
        match decode(&r, region, row, &rig) {
            Ok(clip) => {
                values += clip.transforms.len();
                if values > 2_000_000 {
                    unavailable.push("Additional clips exceed the animation preview budget".into());
                    break;
                }
                kinds.push(kind);
                clips.push(clip);
            }
            Err(error) => unavailable.push(format!("{name}: {error}")),
        }
    }
    let basis = clips
        .iter()
        .zip(&kinds)
        .find(|(_, kind)| **kind == 0)
        .map(|(clip, _)| clip.transforms[..rig.nodes.len() * 8].to_vec())
        .unwrap_or_else(|| {
            rig.nodes
                .iter()
                .flat_map(|node| node.position.into_iter().chain(node.rotation).chain([1.]))
                .collect()
        });
    for (clip, kind) in clips.iter_mut().zip(kinds) {
        if kind == 1 {
            apply_overlay(clip, &basis)?;
        }
    }
    Ok(NativeAnimations {
        object_tag_id: object_id,
        graph_tag_id: graph.id,
        clips,
        unavailable,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (Vec<u8>, ModelRig, Region) {
        let mut b = vec![0; 512];
        let put16 =
            |b: &mut [u8], at: usize, v: u16| b[at..at + 2].copy_from_slice(&v.to_le_bytes());
        let put32 =
            |b: &mut [u8], at: usize, v: u32| b[at..at + 4].copy_from_slice(&v.to_le_bytes());
        b[..11].copy_from_slice(b"native idle");
        for (at, v) in [(34, 2), (36, 20), (44, 2)] {
            put16(&mut b, at, v);
        }
        put32(&mut b, 40, 123);
        put32(&mut b, 92, 1);
        put32(&mut b, 108, 1);
        for (at, length, offset) in [(140, 28, 200), (160, 40, 300)] {
            put32(&mut b, at, length);
            put32(&mut b, at + 12, 4096 + offset);
        }
        // Static node-zero scale, then node-one quaternion/position/scale.
        put32(&mut b, 200, 1f32.to_bits());
        put16(&mut b, 210, 32767);
        for (at, v) in [(212, 4f32), (216, 5.), (220, 6.), (224, 2.)] {
            put32(&mut b, at, v.to_bits());
        }
        for (frame, p) in [[1f32, 2., 3.], [7., 8., 9.]].iter().enumerate() {
            let at = 300 + frame * 20;
            put16(&mut b, at + 6, 32767);
            for i in 0..3 {
                put32(&mut b, at + 8 + i * 4, p[i].to_bits());
            }
        }
        let rig = ModelRig {
            checksum: 123,
            nodes: vec![
                crate::maps::ModelBone {
                    name: "root".into(),
                    parent: -1,
                    position: [0.; 3],
                    rotation: [0., 0., 0., 1.],
                },
                crate::maps::ModelBone {
                    name: "child".into(),
                    parent: 0,
                    position: [4., 5., 6.],
                    rotation: [0., 0., 0., 1.],
                },
            ],
            indices: vec![],
            weights: vec![],
        };
        let region = Region {
            begin: 0,
            end: b.len(),
            address: 4096,
        };
        (b, rig, region)
    }
    #[test]
    fn uncompressed_channels_keep_static_bones_and_exact_native_motion() {
        let (b, rig, region) = fixture();
        let clip = decode(&Reader(&b), region, 0, &rig).unwrap();
        assert_eq!(clip.frame_count, 2);
        assert_eq!(clip.fps, 30.);
        assert_eq!(&clip.transforms[..3], &[1., 2., 3.]);
        assert_eq!(&clip.transforms[8..11], &[4., 5., 6.]);
        assert_eq!(&clip.transforms[16..19], &[7., 8., 9.]);
        assert_eq!(&clip.transforms[24..27], &[4., 5., 6.]);
        assert_eq!(clip.transforms[31], 2.);
        for (at, bytes) in [
            (160, 39u32.to_le_bytes()),
            (172, 4600u32.to_le_bytes()),
            (108, 4u32.to_le_bytes()),
            (40, 124u32.to_le_bytes()),
            (212, f32::NAN.to_bits().to_le_bytes()),
        ] {
            let mut changed = b.clone();
            changed[at..at + 4].copy_from_slice(&bytes);
            assert!(
                decode(&Reader(&changed), region, 0, &rig).is_err(),
                "offset {at}"
            );
        }
        let mut compressed = b;
        compressed[58] = 1;
        assert!(decode(&Reader(&compressed), region, 0, &rig)
            .unwrap_err()
            .to_string()
            .contains("Compressed"));
    }
    #[test]
    fn overlays_use_the_base_pose_rotation_translation_and_scale() {
        let mut clip = AnimationClip {
            name: "overlay".into(),
            fps: 30.,
            frame_count: 1,
            checksum: 1,
            nodes: vec![AnimationNode {
                name: "root".into(),
                parent: -1,
            }],
            transforms: vec![1., 0., 0., 0., 0., 0., 1., 1.],
        };
        let v = std::f32::consts::FRAC_1_SQRT_2;
        apply_overlay(&mut clip, &[3., 4., 5., 0., 0., v, v, 2.]).unwrap();
        for (a, b) in clip.transforms[..3].iter().zip([3., 6., 5.]) {
            assert!((*a - b).abs() < 0.00001);
        }
        assert!((clip.transforms[5] - v).abs() < 0.00001);
        assert_eq!(clip.transforms[7], 2.);
    }
}
