//! Bounded read-only transparent-generic texture/register-combiner metadata.
//! Layouts: Invader 696830ff, shader_transparent_generic.json (100/112-byte rows).
use super::*;
use std::collections::HashMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShaderAnimation {
    pub source: u16,
    pub function: u16,
    pub period: f32,
    pub phase: f32,
    pub scale: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShaderStage {
    pub flags: u16,
    pub constant0_source: u16,
    pub constant0_function: u16,
    pub constant0_period: f32,
    pub constant0_lower: [f32; 4],
    pub constant0_upper: [f32; 4],
    pub constant1: [f32; 4],
    pub color_inputs: [u16; 8],
    pub color_outputs: [u16; 6],
    pub alpha_inputs: [u16; 8],
    pub alpha_outputs: [u16; 4],
}

fn bounded_float(r: &Reader, p: usize) -> Result<f32> {
    let v = r.f32(p)?;
    if !v.is_finite() || v.abs() > 65_536. {
        return invalid("Transparent shader parameter exceeds supported bounds");
    }
    Ok(v)
}
pub(super) fn animations(r: &Reader, p: usize) -> Result<Vec<ShaderAnimation>> {
    (0..3)
        .map(|i| {
            let p = p + i * 16;
            let source = r.u16(p)?;
            let function = r.u16(p + 2)?;
            if source > 4 || function > 11 {
                return invalid("Unknown transparent shader animation function");
            }
            Ok(ShaderAnimation {
                source,
                function,
                period: bounded_float(r, p + 4)?,
                phase: bounded_float(r, p + 8)?,
                scale: bounded_float(r, p + 12)?,
            })
        })
        .collect()
}
fn rgba(r: &Reader, p: usize) -> Result<[f32; 4]> {
    Ok([
        bounded_float(r, p + 4)?,
        bounded_float(r, p + 8)?,
        bounded_float(r, p + 12)?,
        bounded_float(r, p)?,
    ])
}

pub(super) fn inspect(
    r: &Reader,
    space: &Space,
    tag: &mut Tag,
    ids: &HashMap<u32, String>,
    at: usize,
) -> Result<()> {
    if at < space.begin || at.checked_add(108).is_none_or(|end| end > space.end) {
        return invalid("Transparent shader body escapes tag region");
    }
    r.bytes(at, 108)?;
    if r.u16(at + 42)? != 0 {
        return invalid("Transparent cube/screen maps require a distinct preview decoder");
    }
    let flags = r.bytes(at + 41, 1)?[0];
    if flags & 8 != 0 {
        return invalid("Screen-space transparent maps require a distinct preview decoder");
    }
    let blend = r.u16(at + 44)?;
    if blend > 7 {
        return invalid("Unknown transparent shader framebuffer blend");
    }
    let (table, count) = space.block(r, at + 84, 100, 4)?;
    if count == 0 {
        return invalid("Transparent shader has no source maps");
    }
    let mut layers = Vec::with_capacity(count);
    let mut references = Vec::with_capacity(count);
    for i in 0..count {
        let p = table + i * 100;
        let datum = r.u32(p + 40)?;
        if r.fourcc(p + 28)? != "bitm" || ids.get(&datum).is_none_or(|s| s != "bitm") {
            return invalid("Transparent shader bitmap class/datum mismatch");
        }
        // Generic map clamp bits differ from the Chicago map's alpha-replicate bit.
        let source_flags = r.u16(p)?;
        let scale =
            [bounded_float(r, p + 4)?, bounded_float(r, p + 8)?]
                .map(|v| if v == 0. { 1. } else { v });
        layers.push(ShaderLayer {
            bitmap_tag_id: datum,
            uv_scale: scale,
            uv_offset: [bounded_float(r, p + 12)?, bounded_float(r, p + 16)?],
            rotation: bounded_float(r, p + 20)?,
            color_function: 0,
            alpha_function: 0,
            flags: (source_flags & 1) | ((source_flags & 6) << 1),
            animations: animations(r, p + 44)?,
            rotation_center: [bounded_float(r, p + 92)?, bounded_float(r, p + 96)?],
        });
        references.push(TagReference {
            label: if i == 0 {
                "Base map".into()
            } else {
                format!("Transparent layer {i}")
            },
            target_id: datum,
            class: "bitm".into(),
            offset: p + 28,
        });
    }
    let (table, count) = space.block(r, at + 96, 112, 7)?;
    let mut stages = Vec::with_capacity(count);
    for i in 0..count {
        let p = table + i * 112;
        let mut words = [0u16; 26];
        for (j, v) in words.iter_mut().enumerate() {
            *v = r.u16(p + 60 + j * 2)?;
        }
        for j in (0..8).step_by(2).chain((14..22).step_by(2)) {
            if words[j] > 24 || words[j + 1] > 7 {
                return invalid("Unknown transparent combiner input");
            }
        }
        if [8, 10, 12, 22, 23, 24].into_iter().any(|j| words[j] > 8)
            || words[9] > 1
            || words[11] > 1
            || words[13] > 5
            || words[25] > 5
        {
            return invalid("Unknown transparent combiner output");
        }
        let constant0_source = r.u16(p + 4)?;
        let constant0_function = r.u16(p + 6)?;
        if constant0_source > 4 || constant0_function > 11 {
            return invalid("Unknown transparent constant animation");
        }
        stages.push(ShaderStage {
            flags: r.u16(p)?,
            constant0_source,
            constant0_function,
            constant0_period: bounded_float(r, p + 8)?,
            constant0_lower: rgba(r, p + 12)?,
            constant0_upper: rgba(r, p + 28)?,
            constant1: rgba(r, p + 44)?,
            color_inputs: words[0..8].try_into().unwrap(),
            color_outputs: words[8..14].try_into().unwrap(),
            alpha_inputs: words[14..22].try_into().unwrap(),
            alpha_outputs: words[22..26].try_into().unwrap(),
        });
    }
    tag.references.extend(references);
    tag.primary_bitmap_status = Some("resolved".into());
    tag.shader_preview = Some(ShaderPreview {
        kind: "generic".into(),
        alpha_test: flags & 1 != 0,
        two_sided: flags & 4 != 0,
        decal: flags & 2 != 0,
        uv_scale: [1., 1.],
        framebuffer_blend: blend,
        layers,
        stages,
        ..Default::default()
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (Vec<u8>, Tag, HashMap<u32, String>) {
        let mut b = vec![0u8; 640];
        for (at, v) in [(84, 1u32), (88, 128), (96, 1), (100, 256), (168, 7)] {
            b[at..at + 4].copy_from_slice(&v.to_le_bytes());
        }
        b[156..160].copy_from_slice(b"mtib");
        b[41] = 4;
        b[44] = 3;
        for p in [132, 136] {
            b[p..p + 4].copy_from_slice(&1f32.to_le_bytes());
        }
        let tag = Tag {
            id: 1,
            index: 0,
            class: "sotr".into(),
            path: "source/teleporter".into(),
            data_offset: Some(0),
            external: false,
            fields: vec![],
            references: vec![],
            primary_bitmap_status: None,
            shader_preview: None,
        };
        (b, tag, HashMap::from([(7, "bitm".into())]))
    }
    #[test]
    fn preserves_exact_texture_stage_and_register_metadata() {
        let (mut b, mut t, ids) = fixture();
        // R0.rgb = map0.rgb * constant0.alpha, retaining an independently computed alpha.
        for (p, v) in [(316, 5u16), (320, 23), (340, 1), (364, 1)] {
            b[p..p + 2].copy_from_slice(&v.to_le_bytes());
        }
        let before = b.clone();
        let space = Space {
            begin: 0,
            end: b.len(),
            address: 0,
        };
        inspect(&Reader(&b), &space, &mut t, &ids, 0).unwrap();
        let m = t.shader_preview.unwrap();
        assert_eq!(m.kind, "generic");
        assert_eq!(m.framebuffer_blend, 3);
        assert!(m.two_sided);
        assert_eq!(m.layers[0].bitmap_tag_id, 7);
        assert_eq!(m.stages[0].color_inputs[0], 5);
        assert_eq!(m.stages[0].color_inputs[2], 23);
        assert_eq!(b, before);
        assert_eq!(t.references[0].offset, 156);
    }
    #[test]
    fn rejects_bad_pointers_enums_nonfinite_and_wrong_bitmap_identity() {
        for (at, bytes) in [
            (88, 9999u32.to_le_bytes().to_vec()),
            (84, 5u32.to_le_bytes().to_vec()),
            (96, 8u32.to_le_bytes().to_vec()),
            (168, 8u32.to_le_bytes().to_vec()),
            (132, f32::NAN.to_le_bytes().to_vec()),
            (316, 25u16.to_le_bytes().to_vec()),
            (318, 8u16.to_le_bytes().to_vec()),
        ] {
            let (mut b, mut t, ids) = fixture();
            b[at..at + bytes.len()].copy_from_slice(&bytes);
            let space = Space {
                begin: 0,
                end: b.len(),
                address: 0,
            };
            assert!(
                inspect(&Reader(&b), &space, &mut t, &ids, 0).is_err(),
                "offset {at}"
            );
            assert!(t.references.is_empty());
            assert!(t.shader_preview.is_none());
        }
    }
}
