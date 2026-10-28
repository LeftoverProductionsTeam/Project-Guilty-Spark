//! Original read-only decoder for authored scenario and compiled BSP decals.
//! Field layouts: Invader's published scenario, BSP and decal definitions.
use super::*;
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneDecal {
    pub id: String,
    pub decal_tag_id: u32,
    pub bitmap_tag_id: u32,
    pub position: [f32; 3],
    /// Signed byte angles retained verbatim. The viewer resolves the projector
    /// against real BSP triangles rather than inventing a supporting surface.
    pub yaw: i8,
    pub pitch: i8,
    pub bsp_index: Option<usize>,
    pub radius: f32,
    pub intensity: f32,
    pub color: [f32; 3],
    pub flags: u16,
    pub kind: u16,
    pub layer: u16,
    pub blend: u16,
    pub chain_index: usize,
}

#[derive(Clone)]
struct Placement {
    id: String,
    palette: usize,
    position: [f32; 3],
    yaw: i8,
    pitch: i8,
    bsp: Option<usize>,
}

fn placements(r: &Reader, space: &Space, scenario: usize) -> Result<Vec<Placement>> {
    let (at, count) = space.block(r, scenario + 0x3a8, 16, 65_536)?;
    let mut source = Vec::with_capacity(count);
    for i in 0..count {
        let p = at + i * 16;
        source.push(Placement {
            id: format!("decal-{i}"), palette: r.u16(p)? as usize,
            yaw: r.bytes(p + 2, 1)?[0] as i8, pitch: r.bytes(p + 3, 1)?[0] as i8,
            position: vec3(r, p + 4)?, bsp: None,
        });
    }
    // Stock compilers also store permanent decals in each BSP. Some caches
    // omit the scenario block entirely. Prefer these cluster-attributed rows
    // when they exist; never draw both copies over one another.
    let (table, count) = space.block(r, scenario + 0x5a4, 32, 16)?;
    let mut compiled = vec![];
    for bsp in 0..count {
        let row = table + bsp * 32;
        let begin = r.u32(row)? as usize;
        let length = r.u32(row + 4)? as usize;
        if !(648..=128 * 1024 * 1024).contains(&length) { return invalid("Invalid decal BSP region"); }
        r.bytes(begin, length)?;
        let region = Space { begin, end: begin.checked_add(length).ok_or_else(|| SparkError::Invalid("Decal BSP overflow".into()))?, address: r.u32(row + 8)? };
        let body = region.pointer(r.u32(begin)?, 648)?;
        let (at, n) = region.block(r, body + 0x258, 16, 65_536)?;
        if compiled.len() + n > 65_536 { return invalid("Compiled decal count exceeds the source limit"); }
        for i in 0..n {
            let p = at + i * 16;
            compiled.push(Placement {
                id: format!("bsp-{bsp}-decal-{i}"), palette: r.u16(p + 12)? as usize,
                position: vec3(r, p)?, yaw: r.bytes(p + 14, 1)?[0] as i8,
                pitch: r.bytes(p + 15, 1)?[0] as i8, bsp: Some(bsp),
            });
        }
    }
    Ok(if compiled.is_empty() { source } else { compiled })
}

pub(super) fn inspect(r: &Reader, space: &Space, scenario: usize, tags: &[Tag], version: u32,
    diagnostics: &mut Vec<Diagnostic>) -> Vec<SceneDecal> {
    if !matches!(version, 6 | 7 | 13 | 609) { return vec![]; }
    let rows = match placements(r, space, scenario) {
        Ok(rows) => rows,
        Err(e) => { diagnostics.push(Diagnostic::warning("DECALS_UNREADABLE", e.to_string())); return vec![]; }
    };
    if rows.is_empty() { return vec![]; }
    let palette = match space.block(r, scenario + 0x3b4, 16, 32_767) {
        Ok((at, n)) => (0..n).map(|i| {
            let p = at + i * 16;
            if r.fourcc(p)? != "deca" { return invalid("Decal palette class mismatch"); }
            r.u32(p + 12)
        }).collect::<Result<Vec<_>>>(),
        Err(e) => Err(e),
    };
    let palette = match palette { Ok(p) => p, Err(e) => { diagnostics.push(Diagnostic::warning("DECAL_PALETTE_UNREADABLE",e.to_string()));return vec![]; } };
    let ids: HashMap<_, _> = tags.iter().map(|t| (t.id,t)).collect();
    let mut result = vec![];
    let mut failures = HashSet::new();
    for row in rows {
        let Some(&first) = palette.get(row.palette) else { failures.insert("Decal placement has no matching palette entry".to_string());continue; };
        let mut datum = first;
        let mut seen = HashSet::new();
        for chain in 0..16 {
            if datum == u32::MAX { break; }
            if !seen.insert(datum) { failures.insert("Circular decal chain refused".to_string());break; }
            let decoded = (|| -> Result<(SceneDecal,u32)> {
                let tag = ids.get(&datum).filter(|t| t.class=="deca" && !t.external)
                    .ok_or_else(||SparkError::Invalid("Decal chain datum/class is invalid".into()))?;
                let at = tag.data_offset.ok_or_else(||SparkError::Invalid("Decal tag is external".into()))?;
                if at<space.begin || at.checked_add(268).is_none_or(|end|end>space.end) {return invalid("Decal body escapes its tag region");}
                r.bytes(at,268)?;
                let next = r.u32(at+20)?;
                if next!=u32::MAX && r.fourcc(at+8)?!="deca" { return invalid("Decal chain reference has the wrong class"); }
                let bitmap = r.u32(at+228)?;
                if r.fourcc(at+216)?!="bitm" || ids.get(&bitmap).is_none_or(|t|t.class!="bitm" || t.external) {return invalid("Decal has no exact internal bitmap metadata");}
                let kind=r.u16(at+2)?;let layer=r.u16(at+4)?;let blend=r.u16(at+192)?;
                if kind>3 || layer>4 || blend>7 { return invalid("Unsupported decal type, layer or blend"); }
                let radius=[r.f32(at+24)?,r.f32(at+28)?];
                if radius.iter().any(|v|*v<0. || *v>16.) {return invalid("Decal radius is outside the supported 0..16 world units");}
                let intensity=[r.f32(at+44)?,r.f32(at+48)?];
                if intensity.iter().any(|v|!(0.0..=1.0).contains(v)){return invalid("Invalid decal intensity");}
                let lower=vec3(r,at+52)?;let upper=vec3(r,at+64)?;
                if lower.iter().chain(&upper).any(|v|!(0.0..=1.0).contains(v)){return invalid("Invalid decal color");}
                let color=if lower==[0.;3]&&upper==[0.;3]{[1.;3]}else{std::array::from_fn(|i|(lower[i]+upper[i])*0.5)};
                Ok((SceneDecal {id:format!("{}-chain-{chain}",row.id),decal_tag_id:datum,bitmap_tag_id:bitmap,
                    position:row.position,yaw:row.yaw,pitch:row.pitch,bsp_index:row.bsp,
                    radius:if radius==[0.;2]{0.125}else{(radius[0]+radius[1])*0.5},
                    intensity:if intensity==[0.;2]{1.}else{(intensity[0]+intensity[1])*0.5},
                    color,flags:r.u16(at)?,kind,layer,blend,chain_index:chain},next))
            })();
            match decoded {Ok((decal,next))=>{result.push(decal);datum=next;},Err(e)=>{failures.insert(e.to_string());break;}}
            if result.len()>=65_536 {failures.insert("Decal preview limit reached".to_string());break;}
        }
        if result.len()>=65_536 { break; }
    }
    for e in failures.into_iter().take(16) { diagnostics.push(Diagnostic::warning("DECAL_PREVIEW_UNAVAILABLE",e)); }
    result
}
