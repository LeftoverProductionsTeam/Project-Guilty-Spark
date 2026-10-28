//! H1 world items derive their scale from the shared item tag every update.
//! Editing only object.scale is immediately overwritten by the game.
use super::*;
#[derive(Clone)]
pub(super) struct Family {
    pub tag: u32,
    address: u64,
    original: f32,
    current: f32,
    kind: u8,
}
impl Family {
    pub fn active(&self) -> bool {
        self.current.to_bits() != self.original.to_bits()
    }
}
fn effective(raw: f32) -> Result<f32> {
    if raw == 0. {
        return Ok(1.);
    }
    if !(0.0001..=100.).contains(&raw) {
        return invalid("Shared world-item scale is invalid");
    }
    Ok(raw)
}
pub(super) fn field(
    m: &impl Memory,
    id: &MapIdentity,
    table: u64,
    tag: u32,
    kind: u8,
) -> Result<u64> {
    let class = match kind {
        2 => b"weap",
        3 => b"eqip",
        _ => return invalid("Unsupported world-item class"),
    };
    let p = data(m, id, table, tag, class)? + 0x184;
    effective(number(m, p)?)?;
    Ok(p)
}
fn world(m: &impl Memory, id: &MapIdentity, o: &LiveObject) -> Result<bool> {
    let (p, _) = object_address(m, id, o.datum)?;
    Ok(u32_at(m, p + 0xd8)? == u32::MAX)
}
pub(super) fn scope(
    m: &impl Memory,
    s: &Snapshot,
    selected: &LiveObject,
) -> Result<Vec<LiveObject>> {
    if !world(m, &s.identity, selected)? {
        return invalid("Select a dropped world item. Attached and first-person weapon models use a separate presentation path");
    }
    let mut objects = vec![];
    for o in &s.objects {
        if o.tag_datum == selected.tag_datum && o.kind == selected.kind && world(m, &s.identity, o)?
        {
            objects.push(o.clone());
        }
    }
    Ok(objects)
}
pub(super) fn prepare(
    m: &impl Memory,
    s: &Snapshot,
    table: u64,
    state: &ScaleState,
    op: &ScaleOperation,
    writes: &mut Vec<Write>,
) -> Result<(Family, Vec<u32>)> {
    if !op.include_shared_physics {
        return invalid(
            "World-item resizing requires the shared tag scope; confirm all matching dropped items",
        );
    }
    let selected = s
        .objects
        .iter()
        .find(|o| o.datum == op.datum && o.tag_datum == op.tag_datum)
        .ok_or_else(|| crate::SparkError::Invalid("Item disappeared".into()))?;
    let address = field(m, &s.identity, table, selected.tag_datum, selected.kind)?;
    let raw = number(m, address)?;
    let mut family = state
        .items
        .get(&selected.tag_datum)
        .cloned()
        .unwrap_or(Family {
            tag: selected.tag_datum,
            address,
            original: raw,
            current: raw,
            kind: selected.kind,
        });
    if family.address != address
        || family.kind != selected.kind
        || raw.to_bits() != family.current.to_bits()
    {
        return invalid("Shared item size changed outside this adapter; no writes were made");
    }
    let objects = scope(m, s, selected)?;
    let expected = effective(family.current)?;
    for o in &objects {
        if (o.scale - expected).abs() > 0.0001 {
            return invalid("Matching item has an untracked world size; refresh or reload the map before resizing");
        }
        object_plan(m, &s.identity, o, op.scale, 0., false, writes)?;
    }
    let next = if (op.scale - effective(family.original)?).abs() < 0.00001 {
        family.original
    } else {
        op.scale
    };
    plan(m, writes, address, next.to_le_bytes().to_vec())?;
    family.current = next;
    Ok((family, objects.iter().map(|o| o.datum).collect()))
}
pub(super) fn reset(
    m: &impl Memory,
    s: &Snapshot,
    table: u64,
    state: &mut ScaleState,
) -> Result<()> {
    let active: Vec<_> = state
        .items
        .values()
        .filter(|f| f.active())
        .cloned()
        .collect();
    for family in active {
        let address = field(m, &s.identity, table, family.tag, family.kind)?;
        if address != family.address {
            return invalid("Item tag moved; old addresses will not be restored");
        }
        let raw = number(m, address)?;
        let original = effective(family.original)?;
        let mut objects = vec![];
        for o in &s.objects {
            if o.tag_datum == family.tag && o.kind == family.kind && world(m, &s.identity, o)? {
                objects.push(o);
            }
        }
        if raw.to_bits() == family.original.to_bits()
            && objects.iter().all(|o| (o.scale - original).abs() < 0.0001)
        {
            state.items.get_mut(&family.tag).unwrap().current = family.original;
            continue;
        }
        if raw.to_bits() != family.current.to_bits() {
            return invalid("Shared item tag changed outside this adapter; restore refused");
        }
        let mut writes = vec![];
        for o in objects {
            object_plan(m, &s.identity, o, original, 0., false, &mut writes)?;
        }
        plan(
            m,
            &mut writes,
            address,
            family.original.to_le_bytes().to_vec(),
        )?;
        apply_writes(m, &writes, state)?;
        state.items.get_mut(&family.tag).unwrap().current = family.original;
    }
    Ok(())
}
