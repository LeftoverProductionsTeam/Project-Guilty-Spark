//! Uniform runtime scale with physical dimensions kept in step. Vehicle tags
//! share physics; all live vehicles using that physics tag are resized together.
//! Original implementation; layout facts and dimensional laws are documented.
use super::*;
use std::collections::HashMap;
#[path = "live_items.rs"]
mod items;
#[cfg(test)]
#[path = "live_scaling_tests.rs"]
mod tests;

fn number(m: &impl Memory, p: u64) -> Result<f32> {
    let v = f32::from_le_bytes(m.read(p, 4)?.try_into().unwrap());
    if !v.is_finite() || v.abs() > 1e12 {
        return invalid("Live scale/physics field is nonfinite or outside its supported range");
    }
    Ok(v)
}
// Native H1 uses zero as the default/unscaled sentinel for vehicles, bipeds and
// scenery. Item definitions can supply a positive authored world-model scale.
pub(super) fn object_scale(m: &impl Memory, p: u64) -> Result<f32> {
    let v = number(m, p + 0x6c)?;
    if v == 0. {
        return Ok(1.);
    }
    if !(0.0001..=100.).contains(&v) {
        return invalid("Object scale is invalid");
    }
    Ok(v)
}
fn data(m: &impl Memory, id: &MapIdentity, table: u64, datum: u32, class: &[u8; 4]) -> Result<u64> {
    let index = datum & 0xffff;
    if datum == u32::MAX || index >= id.tag_count {
        return invalid("Live physics tag is not in this map");
    }
    let entry = table + u64::from(index) * 32;
    if u32_at(m, entry + 12)? != datum || u32_at(m, entry)? != u32::from_be_bytes(*class) {
        return invalid("Live tag class or salt does not match the scale adapter");
    }
    tag_pointer(id.header, u32_at(m, entry + 20)?)
}
fn physics(m: &impl Memory, id: &MapIdentity, table: u64, tag: u32) -> Result<u32> {
    let p = data(m, id, table, tag, b"vehi")?;
    if u32_at(m, p + 0x80)? != u32::from_be_bytes(*b"phys") {
        return invalid("Vehicle has no reviewed physics dependency");
    }
    Ok(u32_at(m, p + 0x8c)?)
}
fn animation(m: &impl Memory, id: &MapIdentity, table: u64, tag: u32) -> Result<Option<u32>> {
    let p = data(m, id, table, tag, b"vehi")?;
    let datum = u32_at(m, p + 0x44)?;
    if datum == u32::MAX {
        return Ok(None);
    }
    if u32_at(m, p + 0x38)? != u32::from_be_bytes(*b"antr") {
        return invalid("Vehicle animation dependency is not supported");
    }
    data(m, id, table, datum, b"antr")?;
    Ok(Some(datum))
}
fn block(m: &impl Memory, id: &MapIdentity, p: u64, max: u32, stride: usize) -> Result<(u64, u32)> {
    let n = u32_at(m, p)?;
    if n > max {
        return invalid("Physics block exceeds supported count");
    }
    if n == 0 {
        return Ok((0, 0));
    }
    let pointer = tag_pointer(id.header, u32_at(m, p + 4)?)?;
    m.read(pointer, n as usize * stride)?;
    Ok((pointer, n))
}

#[derive(Clone)]
struct Cell {
    address: u64,
    value: f32,
    power: i32,
}
#[derive(Clone)]
struct Family {
    cells: Vec<Cell>,
    factor: f32,
    physics: u32,
    path: String,
    points: Vec<([f32; 3], f32)>,
    center: [f32; 3],
    vehicle_tags: Vec<u32>,
    suspension_points: usize,
}
#[derive(Default)]
pub struct ScaleState {
    families: HashMap<u32, Family>,
    items: HashMap<u32, items::Family>,
    zero_defaults: std::collections::HashSet<(u32, u32)>,
    poisoned: bool,
}
impl ScaleState {
    pub fn active(&self) -> bool {
        self.items.values().any(|item| item.active()) || self.vehicle_active()
    }
    pub fn vehicle_active(&self) -> bool {
        self.poisoned
            || self
                .families
                .values()
                .any(|f| (f.factor - 1.).abs() > 0.00001)
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScaleOperation {
    pub datum: u32,
    pub tag_datum: u32,
    pub expected_scale: f32,
    pub scale: f32,
    pub include_shared_physics: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaleInfo {
    pub current_scale: f32,
    pub minimum: f32,
    pub maximum: f32,
    pub shared_vehicles: usize,
    pub shared_items: usize,
    pub physics_tag: Option<String>,
    pub mass_points: usize,
    pub suspension_points: usize,
    pub vehicle_physics: bool,
    pub detail: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaleReceipt {
    pub applied: bool,
    pub scale: f32,
    pub affected_objects: Vec<u32>,
    pub physics_tag: Option<String>,
    pub message: String,
}
fn base_family(m: &impl Memory, id: &MapIdentity, table: u64, tag: u32) -> Result<Family> {
    let p = data(m, id, table, tag, b"phys")?;
    m.read(p, 128)?;
    let mass = number(m, p + 8)?;
    if mass <= 0. || number(m, p + 4)? <= 0. {
        return invalid("Vehicle physics mass and moment scale must be positive");
    }
    let (matrices, n) = block(m, id, p + 0x5c, 2, 36)?;
    if n != 2 {
        return invalid("Vehicle requires an inertia matrix and its inverse");
    }
    let mut matrix = [0f32; 18];
    for (i, v) in matrix.iter_mut().enumerate() {
        *v = number(m, matrices + i as u64 * 4)?;
    }
    for row in 0..3 {
        for col in 0..3 {
            let value = (0..3)
                .map(|k| matrix[row * 3 + k] * matrix[9 + k * 3 + col])
                .sum::<f32>();
            if (value - if row == col { 1. } else { 0. }).abs() > 0.02 {
                return invalid("Vehicle inertia and inverse do not agree; resizing is refused");
            }
        }
        if matrix[row * 3 + row] <= 0. {
            return invalid("Vehicle inertia is not positive");
        }
    }
    let (mp, count) = block(m, id, p + 0x74, 32, 128)?;
    if count == 0 {
        return invalid("Vehicle has no mass points");
    }
    let mut cells = vec![];
    let mut add = |address: u64, power: i32| -> Result<()> {
        cells.push(Cell {
            address,
            value: number(m, address)?,
            power,
        });
        Ok(())
    };
    if number(m, p)? >= 0. {
        add(p, 1)?;
    }
    add(p + 8, 3)?;
    for off in [0xc, 0x10, 0x14, 0x24, 0x3c] {
        add(p + off, 1)?;
    }
    for off in [0x50, 0x54, 0x58] {
        add(p + off, 5)?;
    }
    for i in 0..18 {
        add(matrices + i * 4, if i < 9 { 5 } else { -5 })?;
    }
    let mut points = vec![];
    let mut total = 0.;
    for i in 0..count {
        let point = mp + u64::from(i) * 128;
        let pm = number(m, point + 0x2c)?;
        let radius = number(m, point + 0x68)?;
        if pm < 0. || radius < 0. || radius > 1000. {
            return invalid("Vehicle mass-point mass or radius is invalid");
        }
        total += pm;
        points.push((vec3(m, point + 0x38)?, radius));
        add(point + 0x2c, 3)?;
        for off in [0x38, 0x3c, 0x40, 0x68] {
            add(point + off, 1)?;
        }
    }
    if ((total - mass) / mass).abs() > 0.01 {
        return invalid("Vehicle mass points do not sum to its total mass");
    }
    let (powered, powered_count) = block(m, id, p + 0x68, 32, 128)?;
    for i in 0..powered_count {
        for off in [0x28, 0x2c] {
            add(powered + u64::from(i) * 128 + off, 1)?;
        }
    }
    let mut vehicle_tags = vec![];
    let mut other_animations = vec![];
    for i in 0..id.tag_count {
        let entry = table + u64::from(i) * 32;
        let class = u32_at(m, entry)?;
        let datum = u32_at(m, entry + 12)?;
        if class == u32::from_be_bytes(*b"vehi") {
            if physics(m, id, table, datum).ok() == Some(tag) {
                vehicle_tags.push(datum);
            } else if let Some(graph) = animation(m, id, table, datum)? {
                other_animations.push(graph);
            }
        } else if [
            *b"bipd", *b"weap", *b"eqip", *b"scen", *b"mach", *b"ctrl", *b"lifi", *b"proj",
            *b"ssce", *b"garb", *b"plac",
        ]
        .iter()
        .any(|c| u32::from_be_bytes(*c) == class)
        {
            let p = tag_pointer(id.header, u32_at(m, entry + 20)?)?;
            if u32_at(m, p + 0x8c)? == tag {
                return invalid("This physics tag is also used by a non-vehicle object; coupled resizing is refused");
            }
            other_animations.push(u32_at(m, p + 0x44)?);
        }
    }
    let mut graphs = std::collections::HashSet::new();
    let mut suspension_points = 0;
    for vehicle in &vehicle_tags {
        if let Some(graph) = animation(m, id, table, *vehicle)? {
            if !graphs.insert(graph) {
                continue;
            }
            if other_animations.contains(&graph) {
                return invalid("Suspension animation is shared outside this physics family; resizing is refused");
            }
            let a = data(m, id, table, graph, b"antr")?;
            let (vehicles, n) = block(m, id, a + 0x24, 1, 116)?;
            for i in 0..n {
                let (suspensions, n) = block(m, id, vehicles + u64::from(i) * 116 + 0x68, 32, 20)?;
                for j in 0..n {
                    let s = suspensions + u64::from(j) * 20;
                    let point = u16_at(m, s)?;
                    let extension = number(m, s + 4)?;
                    let compression = number(m, s + 8)?;
                    if u32::from(point) >= count
                        || extension >= compression
                        || extension.abs() > 1000.
                        || compression.abs() > 1000.
                    {
                        return invalid(
                            "Suspension references or extension/compression depths are invalid",
                        );
                    }
                    add(s + 4, 1)?;
                    add(s + 8, 1)?;
                    suspension_points += 1;
                }
            }
        }
    }
    Ok(Family {
        cells,
        factor: 1.,
        physics: tag,
        path: tag_name(m, id.header, table, id.tag_count, tag)?,
        points,
        center: vec3(m, p + 0xc)?,
        vehicle_tags,
        suspension_points,
    })
}
fn family_objects(m: &impl Memory, s: &Snapshot, table: u64, tag: u32) -> Result<Vec<LiveObject>> {
    let mut result = vec![];
    for object in &s.objects {
        if object.kind == 1 && physics(m, &s.identity, table, object.tag_datum).ok() == Some(tag) {
            result.push(object.clone());
        }
    }
    if result.is_empty() {
        return invalid("No live vehicles use this physics tag");
    }
    Ok(result)
}
fn parked(m: &impl Memory, s: &Snapshot, objects: &[LiveObject]) -> Result<()> {
    for object in objects {
        let (p, _) = object_address(m, &s.identity, object.datum)?;
        if object
            .velocity
            .iter()
            .chain(vec3(m, p + 0x48)?.iter())
            .any(|v| v.abs() > 0.01)
        {
            return invalid("Park all vehicles sharing this physics before resizing");
        }
    }
    for biped in s.objects.iter().filter(|o| o.kind == 0) {
        let (p, _) = object_address(m, &s.identity, biped.datum)?;
        let parent = u32_at(m, p + 0xd8)?;
        if objects.iter().any(|o| o.datum == parent) {
            return invalid("Exit all vehicles sharing this physics before resizing; then enter a resized vehicle to test driving");
        }
    }
    Ok(())
}
pub fn info(
    m: &impl Memory,
    base: u64,
    id: &MapIdentity,
    state: &ScaleState,
    datum: u32,
) -> Result<ScaleInfo> {
    let s = snapshot(m, base)?;
    if s.identity != *id {
        return invalid("Map changed; reconnect before resizing");
    }
    let o = s
        .objects
        .iter()
        .find(|o| o.datum == datum)
        .ok_or_else(|| crate::SparkError::Invalid("Select a current live object".into()))?;
    if o.kind == 1 {
        let table = identity(m, base)?.1;
        let phys = physics(m, id, table, o.tag_datum)?;
        let f = state
            .families
            .get(&phys)
            .cloned()
            .map(Ok)
            .unwrap_or_else(|| base_family(m, id, table, phys))?;
        let objects = family_objects(m, &s, table, phys)?;
        Ok(ScaleInfo{current_scale:o.scale,minimum:0.5,maximum:2.,shared_vehicles:objects.len(),shared_items:0,physics_tag:Some(f.path),mass_points:f.points.len(),suspension_points:f.suspension_points,vehicle_physics:true,detail:"Vehicle physics is shared. Resize all matching parked, unoccupied vehicles together. Contact geometry, suspension extension/compression, center of mass, mass, inertia and inverse inertia are coupled. Driving still needs a real game check.".into()})
    } else if [2, 3].contains(&o.kind) {
        let table = identity(m, base)?.1;
        let count = items::scope(m, &s, o)?.len();
        items::field(m, id, table, o.tag_datum, o.kind)?;
        Ok(ScaleInfo{current_scale:o.scale,minimum:0.1,maximum:4.,shared_vehicles:0,shared_items:count,physics_tag:None,mass_points:0,suspension_points:0,vehicle_physics:false,detail:"Halo reapplies the shared item tag's world size every update. All matching dropped items and future drops use this size. Attached and first-person weapon models have separate presentation paths.".into()})
    } else if o.kind == 6 {
        Ok(ScaleInfo {
            current_scale: o.scale,
            minimum: 0.1,
            maximum: 4.,
            shared_vehicles: 0,
            shared_items: 0,
            physics_tag: None,
            mass_points: 0,
            suspension_points: 0,
            vehicle_physics: false,
            detail: "Uniform scenery scale with updated bounds and physics wake-up.".into(),
        })
    } else {
        invalid("Live resizing currently supports weapons, equipment, scenery and vehicles")
    }
}
struct Write {
    address: u64,
    before: Vec<u8>,
    after: Vec<u8>,
}
fn plan(m: &impl Memory, writes: &mut Vec<Write>, address: u64, after: Vec<u8>) -> Result<()> {
    let before = m.read(address, after.len())?;
    if before != after {
        writes.push(Write {
            address,
            before,
            after,
        });
    }
    Ok(())
}
fn object_plan(
    m: &impl Memory,
    id: &MapIdentity,
    o: &LiveObject,
    next: f32,
    lift: f32,
    zero_default: bool,
    writes: &mut Vec<Write>,
) -> Result<()> {
    let (p, _) = object_address(m, id, o.datum)?;
    if u32_at(m, p)? != o.tag_datum {
        return invalid("Object tag changed before resizing");
    }
    let current = object_scale(m, p)?;
    if (current - o.scale).abs() > 0.0001 {
        return invalid("Object scale changed during preparation");
    }
    let ratio = next / current;
    let center = vec3(m, p + 0x5c)?;
    let radius = number(m, p + 0x68)?;
    if radius < 0. || radius > 100000. {
        return invalid("Object bounds are invalid");
    }
    let mut position = o.position;
    position[2] += lift;
    validate_position(position)?;
    let c: [f32; 3] = std::array::from_fn(|i| position[i] + (center[i] - o.position[i]) * ratio);
    let raw_next = if next == 1. && zero_default {
        0f32
    } else {
        next
    };
    plan(m, writes, p + 0x6c, raw_next.to_le_bytes().to_vec())?;
    plan(m, writes, p + 0x68, (radius * ratio).to_le_bytes().to_vec())?;
    plan(
        m,
        writes,
        p + 0x5c,
        c.iter().flat_map(|v| v.to_le_bytes()).collect(),
    )?;
    if lift.abs() > 0.00001 {
        plan(
            m,
            writes,
            p + 0x18,
            position.iter().flat_map(|v| v.to_le_bytes()).collect(),
        )?;
    }
    let flags = m.read(p + 0x10, 1)?[0];
    plan(m, writes, p + 0x10, vec![flags & !0x20])?;
    Ok(())
}
fn support(m: &impl Memory, id: &MapIdentity, o: &LiveObject, f: &Family) -> Result<f32> {
    let (p, _) = object_address(m, id, o.datum)?;
    let forward = vec3(m, p + 0x30)?;
    let up = vec3(m, p + 0x3c)?;
    let norm = |v: [f32; 3]| v.iter().map(|v| v * v).sum::<f32>();
    if (norm(forward) - 1.).abs() > 0.01
        || (norm(up) - 1.).abs() > 0.01
        || forward
            .iter()
            .zip(up)
            .map(|(a, b)| a * b)
            .sum::<f32>()
            .abs()
            > 0.01
    {
        return invalid("Vehicle orientation is not an orthonormal basis");
    }
    let left_z = up[0] * forward[1] - up[1] * forward[0];
    let mut low = f32::INFINITY;
    for (point, radius) in &f.points {
        let height = (point[0] - f.center[0]) * forward[2]
            + (point[1] - f.center[1]) * left_z
            + (point[2] - f.center[2]) * up[2]
            - radius;
        low = low.min(height);
    }
    if !low.is_finite() || low.abs() > 1000. {
        return invalid("Vehicle support extent is invalid");
    }
    Ok(low)
}
/// The Windows caller freezes the exact game process briefly for this bounded
/// transaction, then resumes every thread. Static fields are read back and a
/// failed transaction attempts rollback before returning an error.
pub fn resize(
    m: &impl Memory,
    base: u64,
    id: &MapIdentity,
    state: &mut ScaleState,
    op: &ScaleOperation,
) -> Result<ScaleReceipt> {
    if state.poisoned {
        return invalid("A previous physics rollback was incomplete. Reload the map before further live resizing");
    }
    let s = snapshot(m, base)?;
    if s.identity != *id {
        return invalid("Map changed; reconnect before resizing");
    }
    let object = s
        .objects
        .iter()
        .find(|o| o.datum == op.datum && o.tag_datum == op.tag_datum)
        .ok_or_else(|| crate::SparkError::Invalid("Object respawned or changed".into()))?;
    let range = if object.kind == 1 { 0.5..=2. } else { 0.1..=4. };
    if !op.scale.is_finite()
        || !range.contains(&op.scale)
        || !op.expected_scale.is_finite()
        || (object.scale - op.expected_scale).abs() > 0.0001
    {
        return invalid("Scale is outside the supported range or changed since the last sample");
    }
    let table = identity(m, base)?.1;
    let mut writes = vec![];
    let mut changed_family = None;
    let mut changed_item = None;
    let mut affected = vec![object.datum];
    let mut physics_name = None;
    let mut zeros = vec![];
    if object.kind == 1 {
        if !op.include_shared_physics {
            return invalid(
                "Vehicle resizing requires shared physics; visual-only vehicle scale is refused",
            );
        }
        let tag = physics(m, id, table, object.tag_datum)?;
        let family = if let Some(f) = state.families.get(&tag) {
            f.clone()
        } else {
            base_family(m, id, table, tag)?
        };
        let objects = family_objects(m, &s, table, tag)?;
        parked(m, &s, &objects)?;
        if objects
            .iter()
            .any(|o| (o.scale - family.factor).abs() > 0.0001)
        {
            return invalid("Vehicle family has an untracked scale. Restore it through the original adapter or reload the map before resizing");
        }
        for cell in &family.cells {
            let expected = cell.value * (family.factor as f64).powi(cell.power) as f32;
            if number(m, cell.address)?.to_bits() != expected.to_bits() {
                return invalid(
                    "Shared physics changed outside this adapter; no scale writes were made",
                );
            }
            let next = cell.value * (op.scale as f64).powi(cell.power) as f32;
            if !next.is_finite() {
                return invalid("Scaled physics would be nonfinite");
            }
            plan(m, &mut writes, cell.address, next.to_le_bytes().to_vec())?;
        }
        for o in &objects {
            let (p, _) = object_address(m, id, o.datum)?;
            let zero =
                number(m, p + 0x6c)? == 0. || state.zero_defaults.contains(&(o.datum, o.tag_datum));
            if zero {
                zeros.push((o.datum, o.tag_datum));
            }
            let lift = support(m, id, o, &family)? * (family.factor - op.scale);
            object_plan(m, id, o, op.scale, lift, zero, &mut writes)?;
        }
        affected = objects.iter().map(|o| o.datum).collect();
        physics_name = Some(family.path.clone());
        changed_family = Some(family);
    } else if [2, 3].contains(&object.kind) {
        let (family, objects) = items::prepare(m, &s, table, state, op, &mut writes)?;
        affected = objects;
        changed_item = Some(family);
    } else if object.kind == 6 {
        let (p, _) = object_address(m, id, object.datum)?;
        let zero = number(m, p + 0x6c)? == 0.
            || state
                .zero_defaults
                .contains(&(object.datum, object.tag_datum));
        if zero {
            zeros.push((object.datum, object.tag_datum));
        }
        object_plan(m, id, object, op.scale, 0., zero, &mut writes)?;
    } else {
        return invalid("This object type has no reviewed scale adapter");
    }
    if writes.len() > 512 {
        return invalid("Scale transaction exceeds 512 bounded fields");
    }
    if identity(m, base)?.0 != *id {
        return invalid("Map changed before resizing");
    }
    let mut written = 0usize;
    let result = (|| -> Result<()> {
        for w in &writes {
            if m.read(w.address, w.before.len())? != w.before {
                return invalid("Object data changed before the scale transaction");
            }
            written += 1;
            m.write(w.address, &w.after)?;
            if m.read(w.address, w.after.len())? != w.after {
                return invalid("Scale/physics readback failed");
            }
        }
        Ok(())
    })();
    if let Err(error) = result {
        let mut rollback = true;
        for w in writes[..written].iter().rev() {
            if m.write(w.address, &w.before).is_err()
                || m.read(w.address, w.before.len()).ok().as_ref() != Some(&w.before)
            {
                rollback = false;
            }
        }
        state.poisoned = !rollback;
        return invalid(format!(
            "Scale transaction stopped: {error}. Rollback {}.",
            if rollback {
                "confirmed"
            } else {
                "INCOMPLETE; reload this map before further editing"
            }
        ));
    }
    if let Some(mut family) = changed_family {
        family.factor = op.scale;
        state.families.insert(family.physics, family);
    }
    state.zero_defaults.extend(zeros);
    if let Some(item) = changed_item {
        state.items.insert(item.tag, item);
    }
    Ok(ScaleReceipt{applied:true,scale:op.scale,affected_objects:affected,physics_tag:physics_name,message:"Scale and coupled bounds/physics fields were written and read back. Vehicle driving and multiplayer behavior require in-game verification.".into()})
}

/// Keep respawned vehicles visually aligned with the shared physics already in
/// use. Only previously reviewed vehicle tags in this map can enter this path.
pub fn synchronize_respawns(
    m: &impl Memory,
    base: u64,
    id: &MapIdentity,
    state: &mut ScaleState,
) -> Result<usize> {
    if state.poisoned {
        return invalid(
            "Physics synchronization stopped after an incomplete rollback; reload this map",
        );
    }
    if !state.active() {
        return Ok(0);
    }
    if identity(m, base)?.0 != *id {
        return invalid("Map changed; scaling keeper stopped");
    }
    let headers = m.read(id.object_table, 2048 * 12)?;
    let mut writes = vec![];
    let mut count = 0;
    let mut zeros = vec![];
    for index in 0..2048 {
        let h = &headers[index * 12..index * 12 + 12];
        if h[3] != 1 {
            continue;
        }
        let salt = u16::from_le_bytes(h[..2].try_into().unwrap());
        if salt == 0xffff {
            continue;
        }
        let datum = (u32::from(salt) << 16) | index as u32;
        let Ok((p, _)) = object_address(m, id, datum) else {
            continue;
        };
        let tag = u32_at(m, p)?;
        let Some(family) = state
            .families
            .values()
            .find(|f| f.vehicle_tags.contains(&tag) && (f.factor - 1.).abs() > 0.00001)
        else {
            continue;
        };
        let scale = object_scale(m, p)?;
        if (scale - family.factor).abs() < 0.0001 {
            continue;
        }
        if (scale - 1.).abs() > 0.0001 {
            return invalid(
                "Respawned vehicle has an untracked scale; scaling keeper refused to overwrite it",
            );
        }
        let zero = number(m, p + 0x6c)? == 0. || state.zero_defaults.contains(&(datum, tag));
        if zero {
            zeros.push((datum, tag));
        }
        let object = LiveObject {
            datum,
            tag_datum: tag,
            tag_path: String::new(),
            kind: 1,
            position: vec3(m, p + 0x18)?,
            velocity: vec3(m, p + 0x24)?,
            forward:vec3(m,p+0x30)?,up:vec3(m,p+0x3c)?,parent_datum:u32_at(m,p+0xd8)?,
            scale,
            player: false,
        };
        object_plan(m, id, &object, family.factor, 0., zero, &mut writes)?;
        count += 1;
    }
    if writes.len() > 512 {
        return invalid("Respawn scale batch exceeds its bound");
    }
    for w in &writes {
        if m.read(w.address, w.before.len())? != w.before {
            return invalid("Respawned object changed before synchronization");
        }
    }
    let mut done = 0;
    let result = (|| -> Result<()> {
        for w in &writes {
            done += 1;
            m.write(w.address, &w.after)?;
            if m.read(w.address, w.after.len())? != w.after {
                return invalid("Respawn scale readback did not match");
            }
        }
        Ok(())
    })();
    if let Err(error) = result {
        let mut restored = true;
        for old in writes[..done].iter().rev() {
            if m.write(old.address, &old.before).is_err()
                || m.read(old.address, old.before.len()).ok().as_ref() != Some(&old.before)
            {
                restored = false;
            }
        }
        state.poisoned = !restored;
        return invalid(format!(
            "Respawn synchronization stopped: {error}. Rollback {}.",
            if restored {
                "confirmed"
            } else {
                "INCOMPLETE; reload this map"
            }
        ));
    }
    state.zero_defaults.extend(zeros);
    Ok(count)
}
pub fn needs_synchronization(
    m: &impl Memory,
    base: u64,
    id: &MapIdentity,
    state: &ScaleState,
) -> Result<bool> {
    if !state.active() {
        return Ok(false);
    }
    if identity(m, base)?.0 != *id {
        return invalid("Map changed; scaling keeper stopped");
    }
    let headers = m.read(id.object_table, 2048 * 12)?;
    for index in 0..2048 {
        let h = &headers[index * 12..index * 12 + 12];
        if h[3] != 1 {
            continue;
        }
        let salt = u16::from_le_bytes(h[..2].try_into().unwrap());
        if salt == 0xffff {
            continue;
        }
        let datum = (u32::from(salt) << 16) | index as u32;
        let Ok((p, _)) = object_address(m, id, datum) else {
            continue;
        };
        let tag = u32_at(m, p)?;
        if let Some(f) = state
            .families
            .values()
            .find(|f| f.vehicle_tags.contains(&tag) && (f.factor - 1.).abs() > 0.00001)
        {
            if (object_scale(m, p)? - f.factor).abs() > 0.0001 {
                return Ok(true);
            }
        }
    }
    Ok(false)
}
pub fn reset(m: &impl Memory, base: u64, id: &MapIdentity, state: &mut ScaleState) -> Result<()> {
    if state.poisoned {
        return invalid("A physics rollback was incomplete. Reload a different map or restart MCC before disconnecting");
    }
    let s = snapshot(m, base)?;
    if s.identity != *id {
        return invalid("Map changed; no old-map physics addresses will be restored");
    }
    let active: Vec<_> = state
        .families
        .values()
        .filter(|f| (f.factor - 1.).abs() > 0.00001)
        .cloned()
        .collect();
    let table = identity(m, base)?.1;
    for f in active {
        let objects: Vec<_> = s
            .objects
            .iter()
            .filter(|o| o.kind == 1 && f.vehicle_tags.contains(&o.tag_datum))
            .collect();
        // A same-map reload can reuse every pointer and datum. It is safe to
        // retire this journal only after both tags and objects are at baseline.
        if objects.iter().all(|o| o.scale == 1.)
            && f.cells.iter().all(|cell| {
                number(m, cell.address).ok().map(f32::to_bits) == Some(cell.value.to_bits())
            })
        {
            state.families.get_mut(&f.physics).unwrap().factor = 1.;
            continue;
        }
        if let Some(o) = objects.first() {
            resize(
                m,
                base,
                id,
                state,
                &ScaleOperation {
                    datum: o.datum,
                    tag_datum: o.tag_datum,
                    expected_scale: o.scale,
                    scale: 1.,
                    include_shared_physics: true,
                },
            )?;
        } else {
            let mut writes = vec![];
            for cell in &f.cells {
                let expected = cell.value * (f.factor as f64).powi(cell.power) as f32;
                if number(m, cell.address)?.to_bits() != expected.to_bits() {
                    return invalid(
                        "Unoccupied physics changed outside this adapter; restore refused",
                    );
                }
                plan(
                    m,
                    &mut writes,
                    cell.address,
                    cell.value.to_le_bytes().to_vec(),
                )?;
            }
            apply_writes(m, &writes, state)?;
            state.families.get_mut(&f.physics).unwrap().factor = 1.;
        }
    }
    items::reset(m, &s, table, state)
}
fn apply_writes(m: &impl Memory, writes: &[Write], state: &mut ScaleState) -> Result<()> {
    if writes.len() > 512 {
        return invalid("Scale transaction exceeds 512 bounded fields");
    }
    let mut done = 0;
    let result = (|| -> Result<()> {
        for w in writes {
            if m.read(w.address, w.before.len())? != w.before {
                return invalid("Physics data changed before restoration");
            }
            done += 1;
            m.write(w.address, &w.after)?;
            if m.read(w.address, w.after.len())? != w.after {
                return invalid("Physics restore readback failed");
            }
        }
        Ok(())
    })();
    if let Err(error) = result {
        let mut restored = true;
        for w in writes[..done].iter().rev() {
            if m.write(w.address, &w.before).is_err()
                || m.read(w.address, w.before.len()).ok().as_ref() != Some(&w.before)
            {
                restored = false;
            }
        }
        state.poisoned = !restored;
        return invalid(format!(
            "Physics restore stopped: {error}; rollback {}",
            if restored {
                "confirmed"
            } else {
                "INCOMPLETE; reload the map"
            }
        ));
    }
    Ok(())
}
