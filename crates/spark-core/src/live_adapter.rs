//! Original, bounded MCC Halo 1 process-memory adapter. Address layout facts
//! are credited in docs/LIVE_ADAPTER.md. This module never injects executable code.
use crate::{invalid, safe_relative, Result};
use serde::{Deserialize, Serialize};

pub const MODULE_SHA256: &str = "0a12dc561780f449d3f4d0df10bb8d3bc7be7840a5beb2b236f672eb6cd42e6c";
pub const EXE_SHA256: &str = "be70d6dcd1a884f10ceb342a7a2dcb35ee0fa43181b66a1d19c3d830e9834691";
pub const PROFILE: &str = "mcc-steam-halo1-1.3528.0.0";
#[path = "live_scaling.rs"]
pub mod scaling;
#[cfg(test)]
#[path = "live_adapter_tests.rs"]
mod tests;
pub trait Memory {
    fn read(&self, address: u64, size: usize) -> Result<Vec<u8>>;
    fn write(&self, address: u64, bytes: &[u8]) -> Result<()>;
}
fn u16_at(m: &impl Memory, p: u64) -> Result<u16> {
    Ok(u16::from_le_bytes(m.read(p, 2)?.try_into().unwrap()))
}
fn u32_at(m: &impl Memory, p: u64) -> Result<u32> {
    Ok(u32::from_le_bytes(m.read(p, 4)?.try_into().unwrap()))
}
fn pointer(m: &impl Memory, p: u64) -> Result<u64> {
    let v = u64::from_le_bytes(m.read(p, 8)?.try_into().unwrap());
    if !(0x10000..0x0000_7fff_ffff_ffff).contains(&v) {
        return invalid("Halo pointer is not live; load a Halo 1 map before connecting");
    }
    Ok(v)
}
fn vec3(m: &impl Memory, p: u64) -> Result<[f32; 3]> {
    let b = m.read(p, 12)?;
    let v = std::array::from_fn(|i| f32::from_le_bytes(b[i * 4..i * 4 + 4].try_into().unwrap()));
    validate_position(v)?;
    Ok(v)
}
fn validate_position(v: [f32; 3]) -> Result<()> {
    if v.iter().any(|v| !v.is_finite() || v.abs() > 1_000_000.) {
        return invalid("Live position must be finite and within one million world units");
    }
    Ok(())
}
fn tag_pointer(header: u64, value: u32) -> Result<u64> {
    if value < 0x5000_0000 {
        return invalid("Invalid live Halo tag offset");
    }
    header
        .checked_add(u64::from(value - 0x5000_0000))
        .ok_or_else(|| crate::SparkError::Invalid("Tag offset overflow".into()))
}
fn tag_name(m: &impl Memory, header: u64, table: u64, count: u32, datum: u32) -> Result<String> {
    let index = datum & 0xffff;
    if datum == u32::MAX || index >= count {
        return invalid("Live tag datum is outside the current map");
    }
    let entry = table + u64::from(index) * 32;
    if u32_at(m, entry + 12)? != datum {
        return invalid("Live tag salt changed");
    }
    let start = tag_pointer(header, u32_at(m, entry + 16)?)?;
    let mut bytes = vec![];
    for i in 0..256 {
        let c = m.read(start + i, 1)?[0];
        if c == 0 {
            let name = String::from_utf8(bytes)
                .map_err(|_| crate::SparkError::Invalid("Live tag name is not UTF-8".into()))?;
            safe_relative(&name)?;
            return Ok(name.replace('\\', "/").to_ascii_lowercase());
        }
        bytes.push(c);
    }
    invalid("Live tag name exceeds 255 bytes")
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MapIdentity {
    pub scenario: String,
    pub checksum: u32,
    pub scenario_datum: u32,
    pub tag_count: u32,
    pub header: u64,
    pub object_table: u64,
    pub object_data: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveObject {
    pub datum: u32,
    pub tag_datum: u32,
    pub tag_path: String,
    pub kind: u8,
    pub position: [f32; 3],
    pub velocity: [f32; 3],
    pub forward: [f32;3],
    pub up: [f32;3],
    pub parent_datum:u32,
    pub scale: f32,
    pub player: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub profile: String,
    pub identity: MapIdentity,
    pub player_datum: u32,
    pub objects: Vec<LiveObject>,
}
fn identity(m: &impl Memory, base: u64) -> Result<(MapIdentity, u64)> {
    let header = pointer(m, base + 0x2D9CE10)?;
    if m.read(header + 0x24, 4)? != b"sgat" {
        return invalid(
            "Live Halo tag header is not valid; map is loading or this build is unsupported",
        );
    }
    let count = u32_at(m, header + 12)?;
    if !(1..=65535).contains(&count) {
        return invalid("Live tag count is invalid");
    }
    let table = tag_pointer(header, u32_at(m, header)?)?;
    let scenario_datum = u32_at(m, header + 4)?;
    let scenario = tag_name(m, header, table, count, scenario_datum)?;
    let object_table = pointer(m, base + 0x1C42248)? + 0x38;
    let object_data = pointer(m, base + 0x2D9CDF8)? + 0x34;
    Ok((
        MapIdentity {
            scenario,
            checksum: u32_at(m, header + 8)?,
            scenario_datum,
            tag_count: count,
            header,
            object_table,
            object_data,
        },
        table,
    ))
}
fn object_address(m: &impl Memory, id: &MapIdentity, datum: u32) -> Result<(u64, u8)> {
    let index = datum & 0xffff;
    if index >= 2048 || datum == u32::MAX {
        return invalid("Unsupported live object datum");
    }
    let entry = id.object_table + u64::from(index) * 12;
    if u16_at(m, entry)? != (datum >> 16) as u16 {
        return invalid("Object was destroyed or respawned; bind its new live instance");
    }
    let kind = m.read(entry + 3, 1)?[0];
    if ![0, 1, 2, 3, 6].contains(&kind) {
        return invalid("This live object type has no enabled transform adapter");
    }
    let offset = u32_at(m, entry + 8)?;
    if offset > 64 * 1024 * 1024 {
        return invalid("Live object offset exceeds the supported arena");
    }
    let address = id.object_data + u64::from(offset);
    if u16_at(m, address + 0x70)? != u16::from(kind) {
        return invalid("Live object body type does not match its header");
    }
    Ok((address, kind))
}
pub fn snapshot(m: &impl Memory, base: u64) -> Result<Snapshot> {
    let (id, table) = identity(m, base)?;
    let player = u32_at(m, pointer(m, base + 0x2D9CD90)? + 4)?;
    let mut objects = vec![];
    // H1 has at most 2048 object slots. Vacant slots are ignored; a malformed
    // occupied slot is never made writable by guessing its address.
    let headers = m.read(id.object_table, 2048 * 12)?;
    for index in 0..2048 {
        let h = &headers[index * 12..index * 12 + 12];
        let salt = u16::from_le_bytes(h[..2].try_into().unwrap());
        if salt == 0xffff || !([0, 1, 2, 3, 6].contains(&h[3])) {
            continue;
        }
        let datum = (u32::from(salt) << 16) | index as u32;
        let result = (|| -> Result<LiveObject> {
            let (p, kind) = object_address(m, &id, datum)?;
            let tag = u32_at(m, p)?;
            Ok(LiveObject {
                datum,
                tag_datum: tag,
                tag_path: tag_name(m, id.header, table, id.tag_count, tag)?,
                kind,
                position: vec3(m, p + 0x18)?,
                velocity: vec3(m, p + 0x24)?,
                forward:vec3(m,p+0x30)?,up:vec3(m,p+0x3c)?,parent_datum:u32_at(m,p+0xd8)?,
                scale: scaling::object_scale(m, p)?,
                player: datum == player,
            })
        })();
        if let Ok(object) = result {
            objects.push(object);
        }
    }
    if objects.is_empty() {
        return invalid("No validated live objects found; this map/build cannot be edited");
    }
    if identity(m, base)?.0 != id {
        return invalid("Map changed while reading the live session");
    }
    Ok(Snapshot {
        profile: PROFILE.into(),
        identity: id,
        player_datum: player,
        objects,
    })
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MoveObject {
    pub datum: u32,
    pub tag_datum: u32,
    pub expected_position: [f32; 3],
    pub position: [f32; 3],
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveReceipt {
    pub datum: u32,
    pub applied: bool,
    pub observed_position: Option<[f32; 3]>,
    pub message: String,
}
/// Only position data is writable. No raw address, executable memory, arbitrary
/// tag offsets, object creation or BSP substitution can enter through this API.
pub fn move_objects(
    m: &impl Memory,
    base: u64,
    expected: &MapIdentity,
    moves: &[MoveObject],
) -> Result<Vec<MoveReceipt>> {
    if moves.is_empty() || moves.len() > 128 {
        return invalid("A live update requires 1 to 128 bound objects");
    }
    if identity(m, base)?.0 != *expected {
        return invalid("Live map changed; reconnect and bind the new session");
    }
    let mut addresses = vec![];
    let mut ids = std::collections::HashSet::new();
    for op in moves {
        validate_position(op.position)?;
        validate_position(op.expected_position)?;
        if !ids.insert(op.datum) {
            return invalid("Duplicate object in live update");
        }
        let (p, _) = object_address(m, expected, op.datum)?;
        if u32_at(m, p)? != op.tag_datum {
            return invalid("Bound object tag changed");
        }
        let now = vec3(m, p + 0x18)?;
        if now
            .iter()
            .zip(op.expected_position)
            .any(|(a, b)| (a - b).abs() > 0.1)
        {
            return invalid("Object moved in game since the last sample; refresh before applying");
        }
        addresses.push(p);
    }
    let mut receipts = vec![];
    for (op, p) in moves.iter().zip(addresses) {
        let result = (|| -> Result<[f32; 3]> {
            if identity(m, base)?.0 != *expected
                || object_address(m, expected, op.datum)?.0 != p
                || u32_at(m, p)? != op.tag_datum
            {
                return invalid("Session or object changed before the write");
            }
            m.write(
                p + 0x18,
                &op.position
                    .iter()
                    .flat_map(|v| v.to_le_bytes())
                    .collect::<Vec<_>>(),
            )?;
            let observed = vec3(m, p + 0x18)?;
            if identity(m, base)?.0 != *expected {
                return invalid("Map changed during readback; disconnect before editing again");
            }
            Ok(observed)
        })();
        match result {
            Ok(observed) => {
                let applied = observed
                    .iter()
                    .zip(op.position)
                    .all(|(a, b)| (a - b).abs() < 0.001);
                receipts.push(MoveReceipt{datum:op.datum,applied,observed_position:Some(observed),message:if applied{"Position written and read back. Rendering, collision relinking and peer replication still require in-game verification."}else{"Game changed the position during readback; this update is not confirmed."}.into()});
            }
            Err(e) => {
                receipts.push(MoveReceipt {
                    datum: op.datum,
                    applied: false,
                    observed_position: None,
                    message: format!("Update stopped; earlier objects may already have moved: {e}"),
                });
                break;
            }
        }
    }
    Ok(receipts)
}
