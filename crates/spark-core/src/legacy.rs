//! Narrow, evidence-backed compatibility fixes on job-local buffers only.
use crate::{binary::Reader, invalid, maps::MapInspection, Result};
use serde::{Deserialize, Serialize};
pub const ZOMBIE_DEMO_SHA256:&str="b38f35508188872b2535888193de80f766d92d3b8d53a8ada7be4fc9808a996d";
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Repair {
    pub code: String,
    pub message: String,
    pub offset: usize,
    pub original: u32,
    pub replacement: u32,
}
pub fn prepare_extraction(bytes: &mut [u8], inspection: &MapInspection) -> Result<Vec<Repair>> {
    let mut repairs = vec![];
    if inspection.header.legacy_tag_size_repair {
        repairs.push(Repair{code:"LEGACY_TAG_SIZE".into(),message:"Normalized a known legacy whole-file tag-size declaration in the working copy; all pointers were separately bounds-checked.".into(),offset:0x14,original:inspection.header.declared_size,replacement:inspection.header.tag_size});
    }
    if ![6, 7].contains(&inspection.header.version) {
        return Ok(repairs);
    }
    let Some(scenario) = inspection
        .tags
        .iter()
        .find(|t| t.class == "scnr" && t.path == inspection.scenario_path)
        .and_then(|t| t.data_offset)
    else {
        return Ok(repairs);
    };
    let r = Reader(bytes);
    if r.u32(scenario + 0x49c)? != 0 || r.u32(scenario + 0x4a8)? != 0 {
        return Ok(repairs);
    }
    let size = r.u32(scenario + 0x474)? as usize;
    if size < 56 || !(size - 56).is_multiple_of(20) {
        return Ok(repairs);
    }
    let base = if inspection.header.version == 6 {
        0x4bf10000
    } else {
        0x40440000
    };
    let pointer = r.u32(scenario + 0x480)?;
    let Some(delta) = pointer.checked_sub(base) else {
        return Ok(repairs);
    };
    let at = inspection.header.tag_offset as usize + delta as usize;
    if at.checked_add(size).is_none_or(|end| {
        end > inspection.header.tag_offset as usize + inspection.header.tag_size as usize
    }) {
        return invalid("Unused script data lies outside the validated tag region");
    }
    r.bytes(at, size)?;
    let capacity = (size - 56) / 20;
    let declared = r.u16(at + 32)?;
    // 0xCACA is the concrete uninitialized-header pattern observed in the
    // supplied Demo restoration. Never touch a table with scripts or globals.
    if declared == 0xcaca && capacity > 0 && capacity <= u16::MAX as usize {
        bytes[at + 32..at + 34].copy_from_slice(&(capacity as u16).to_le_bytes());
        repairs.push(Repair{code:"UNUSED_SCRIPT_CAPACITY".into(),message:format!("Normalized unused script-table capacity 0xCACA to {capacity}; source has zero scripts and zero globals. Original map bytes are preserved."),offset:at+32,original:declared as u32,replacement:capacity as u32});
    }
    Ok(repairs)
}
/// Explicit recovery edition only. All preconditions are checked before any
/// change; no missing audio is substituted and no valid zombie object is removed.
pub fn prepare_zombie_recovery(bytes:&mut [u8],inspection:&MapInspection)->Result<Vec<Repair>>{
    if inspection.sha256!=ZOMBIE_DEMO_SHA256||inspection.header.version!=6{return invalid("Recovery only accepts the exact audited Zombie Apocalypse Demo source");}
    let r=Reader(bytes);let mut patches=vec![];
    for (at,expected) in [(49_227_018usize,0xe6be054au32),(49_227_274,0xe6ce055a)]{
        if r.fourcc(at)?!="snd!"||r.u32(at+12)?!=expected{return invalid("Audited unavailable event sound reference changed");}
        for (offset,replacement) in [(at+4,0),(at+8,0),(at+12,u32::MAX)]{patches.push(Repair{code:"RECOVERY_MISSING_EVENT_AUDIO".into(),message:"Recovery edition omits one missing custom event sound dependency; no replacement audio".into(),offset,original:r.u32(offset)?,replacement});}
    }
    let scenario=inspection.tags.iter().find(|t|t.class=="scnr"&&t.path==inspection.scenario_path).and_then(|t|t.data_offset).ok_or_else(||crate::SparkError::Invalid("Recovery scenario missing".into()))?;
    if r.u32(scenario+0x204)?!=0||r.u32(scenario+0x210)?==0{return invalid("Recovery object-name or scenery layout changed");}
    let delta=r.u32(scenario+0x214)?.checked_sub(0x4bf10000).ok_or_else(||crate::SparkError::Invalid("Recovery scenery pointer invalid".into()))? as usize;
    let at=(inspection.header.tag_offset as usize).checked_add(delta).ok_or_else(||crate::SparkError::Invalid("Recovery scenery overflow".into()))?;
    if at+72>inspection.header.tag_offset as usize+inspection.header.tag_size as usize||r.u16(at)?!=10704||r.u16(at+2)?!=5984{return invalid("The audited corrupt first scenery row changed; no placement was disabled");}
    patches.push(Repair{code:"RECOVERY_CORRUPT_SCENERY".into(),message:"Disable the first corrupt scenery record (type 10704, name 5984); its intended identity is not recoverable. Valid mixed-class placements and vehicle spawners remain".into(),offset:at,original:r.u32(at)?,replacement:u32::MAX});
    for patch in &patches{bytes[patch.offset..patch.offset+4].copy_from_slice(&patch.replacement.to_le_bytes());}Ok(patches)
}
