//! Native per-player movement multiplier for the reviewed MCC Halo 1 profile.
//! No velocity/position forcing, global movement-tag edits or executable writes.
use super::*;

const PLAYER_TABLE_GLOBAL: u64 = 0x1c40480;
const PLAYER_STRIDE: u64 = 0xc20;
const SPEED_OFFSET: u64 = 0xd4;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Config {
    pub hotkey: String,
    pub multiplier: f32,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            hotkey: "ShiftLeft".into(),
            multiplier: 1.75,
        }
    }
}
impl Config {
    pub fn validate(&self) -> Result<()> {
        if !crate::gameplay::keyboard_key(&self.hotkey)
            || !self.multiplier.is_finite()
            || !(1.05..=2.).contains(&self.multiplier)
        {
            return invalid("Choose a keyboard sprint key and a multiplier between 1.05 and 2");
        }
        Ok(())
    }
}
#[derive(Clone, Debug, PartialEq)]
struct PlayerKey {
    table: u64,
    slot: u16,
    salt: u16,
}
#[derive(Clone)]
struct Lease {
    key: PlayerKey,
    actor: u32,
    original: f32,
    applied: f32,
    clock: Clock,
}
#[derive(Clone, Copy)]
struct Clock {
    tick: u32,
    above: bool,
    below: bool,
}
fn clock(m: &impl Memory, base: u64) -> Result<Clock> {
    let above = m.read(base + 0x2e9f7ed, 1)?[0];
    let below = m.read(base + 0x2e9f7ec, 1)?[0];
    if above > 1 || below > 1 {
        return invalid("Native speed normalization flags do not match this profile");
    }
    Ok(Clock {
        tick: u32_at(m, base + 0x2b6f5e4)?,
        above: above != 0,
        below: below != 0,
    })
}
fn evolve(mut speed: f32, ticks: u32, clock: Clock) -> f32 {
    for _ in 0..ticks {
        if clock.above && speed > 1. {
            speed = (speed - f32::from_bits(0x38e90453)).max(1.);
        }
        if clock.below && speed < 1. {
            speed = (speed + f32::from_bits(0x373a69dc)).min(1.);
        }
    }
    speed
}
fn native_baseline(lease: &Lease, current: f32, now: Clock) -> Result<f32> {
    let elapsed = now.tick.wrapping_sub(lease.clock.tick);
    if elapsed > 100000 || now.above != lease.clock.above || now.below != lease.clock.below {
        return invalid(
            "Native speed clock or normalization mode changed; restore before reconnecting",
        );
    }
    // Player speed is co-owned by the engine: it normalizes toward 1 each
    // simulation tick. Accept exact native f32 steps only, including at most
    // two ticks of counter/update phase difference; arbitrary changes refuse.
    let candidates = [
        elapsed,
        elapsed.saturating_sub(1),
        elapsed.saturating_add(1),
        elapsed.saturating_sub(2),
        elapsed.saturating_add(2),
    ];
    for ticks in candidates {
        if evolve(lease.applied, ticks, now).to_bits() == current.to_bits() {
            return Ok(evolve(lease.original, ticks, now));
        }
    }
    invalid("Native player speed changed outside its verified normalization path")
}
#[derive(Default)]
pub struct State {
    lease: Option<Lease>,
    poisoned: bool,
}
impl State {
    pub fn active(&self) -> bool {
        self.lease.is_some() || self.poisoned
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    pub player_datum: u32,
    pub multiplier: f32,
    pub can_sprint: bool,
    pub reason: String,
}
struct Player {
    key: PlayerKey,
    datum: u32,
    speed: f32,
    allowed: bool,
    reason: &'static str,
}
fn scalar(m: &impl Memory, at: u64) -> Result<f32> {
    let value = f32::from_le_bytes(m.read(at, 4)?.try_into().unwrap());
    if !value.is_finite() {
        return invalid("Native movement value is nonfinite");
    }
    Ok(value)
}
fn table(m: &impl Memory, base: u64) -> Result<u64> {
    let table = pointer(m, base + PLAYER_TABLE_GLOBAL)?;
    if m.read(table, 8)? != b"players\0"
        || u16_at(m, table + 0x20)? != 16
        || u64::from(u16_at(m, table + 0x22)?) != PLAYER_STRIDE
        || u32_at(m, table + 0x34)? != 0x38
    {
        return invalid("Native player table does not match the reviewed sprint profile");
    }
    Ok(table)
}
fn record(m: &impl Memory, base: u64, key: &PlayerKey) -> Result<Option<u64>> {
    let current = table(m, base)?;
    if current != key.table || key.slot >= 16 {
        return Ok(None);
    }
    let at = current + 0x38 + u64::from(key.slot) * PLAYER_STRIDE;
    if u16_at(m, at)? != key.salt {
        return Ok(None);
    }
    Ok(Some(at))
}
fn player(m: &impl Memory, base: u64, id: &MapIdentity) -> Result<Player> {
    if &identity(m, base)?.0 != id {
        return invalid("Map changed; reconnect native gameplay controls");
    }
    let datum = u32_at(m, pointer(m, base + 0x2d9cd90)? + 4)?;
    let (body, kind) = object_address(m, id, datum)?;
    if kind != 0 {
        return invalid("Native sprint requires your own Halo 1 biped");
    }
    let owner = u32_at(m, body + 0x1f8)?;
    if owner == u32::MAX || owner & 0xffff >= 16 {
        return invalid("Player biped has no validated player-table owner");
    }
    let key = PlayerKey {
        table: table(m, base)?,
        slot: (owner & 0xffff) as u16,
        salt: (owner >> 16) as u16,
    };
    let at = record(m, base, &key)?.ok_or_else(|| {
        crate::SparkError::Invalid("Player slot was replaced; reconnect gameplay controls".into())
    })?;
    if u32_at(m, at + 0x64)? != datum {
        return invalid("Player record and controlled biped do not agree");
    }
    let speed = scalar(m, at + SPEED_OFFSET)?;
    if !(0.05..=10.).contains(&speed) {
        return invalid("Native player multiplier is outside the supported range");
    }
    let flags = u32_at(m, body + 0x1d8)?;
    let forward = scalar(m, body + 0x258)?;
    if !(-1.01..=1.01).contains(&forward) {
        return invalid("Player throttle does not match the native sprint profile");
    }
    let reason = if scalar(m, body + 0x9c)? <= 0. {
        "Your player is dead"
    } else if u32_at(m, body + 0xd8)? != u32::MAX {
        "Exit the vehicle before sprinting"
    } else if flags & 0x7c01 != 0 {
        "Sprinting stops while crouching, firing, reloading, throwing or switching weapons"
    } else if forward <= 0.1 {
        "Move forward to sprint"
    } else {
        "Native forward movement is available"
    };
    Ok(Player {
        key,
        datum,
        speed,
        allowed: reason == "Native forward movement is available",
        reason,
    })
}
pub fn info(m: &impl Memory, base: u64, id: &MapIdentity) -> Result<Info> {
    let p = player(m, base, id)?;
    Ok(Info {
        player_datum: p.datum,
        multiplier: p.speed,
        can_sprint: p.allowed,
        reason: p.reason.into(),
    })
}
pub fn needs_update(
    m: &impl Memory,
    base: u64,
    id: &MapIdentity,
    state: &State,
    config: &Config,
    held: bool,
) -> Result<bool> {
    config.validate()?;
    if state.poisoned {
        return invalid("Native sprint rollback is incomplete; reload the map");
    }
    if !held {
        return Ok(state.active());
    }
    let p = player(m, base, id)?;
    if !p.allowed {
        return Ok(state.active());
    }
    let Some(lease) = state.lease.as_ref() else {
        return Ok(true);
    };
    if lease.key != p.key {
        return Ok(true);
    }
    if lease.actor != p.datum {
        return Ok(true);
    }
    let baseline = native_baseline(lease, p.speed, clock(m, base)?)?;
    Ok((baseline * config.multiplier).to_bits() != p.speed.to_bits())
}
fn write_value(m: &impl Memory, at: u64, before: f32, after: f32) -> Result<bool> {
    if at & 3 != 0 {
        return invalid("Native player multiplier is not aligned");
    }
    if scalar(m, at)?.to_bits() != before.to_bits() {
        return invalid("Another writer changed the native player multiplier");
    }
    let result = m.write(at, &after.to_le_bytes()).and_then(|_| {
        if scalar(m, at)?.to_bits() == after.to_bits() {
            Ok(())
        } else {
            invalid("Native sprint write did not read back")
        }
    });
    if result.is_ok() {
        return Ok(true);
    }
    // A failed/partial write must restore the exact previous scalar, including
    // a non-default speed authored by a game type or another supported mod.
    let rollback = m.write(at, &before.to_le_bytes()).and_then(|_| {
        if scalar(m, at)?.to_bits() == before.to_bits() {
            Ok(())
        } else {
            invalid("Native sprint rollback did not read back")
        }
    });
    if rollback.is_ok() {
        Ok(false)
    } else {
        invalid("Native sprint rollback is incomplete; reload the map before continuing")
    }
}
pub fn reset(m: &impl Memory, base: u64, id: &MapIdentity, state: &mut State) -> Result<()> {
    if &identity(m, base)?.0 != id {
        *state = State::default();
        return Ok(());
    }
    if state.poisoned {
        return invalid("Native sprint rollback is incomplete; reload the map");
    }
    let Some(lease) = state.lease.clone() else {
        return Ok(());
    };
    let Some(at) = record(m, base, &lease.key)? else {
        state.lease = None;
        return Ok(());
    };
    let speed = scalar(m, at + SPEED_OFFSET)?;
    if speed.to_bits() == lease.original.to_bits() {
        state.lease = None;
        return Ok(());
    }
    if u32_at(m, at + 0x64)? != lease.actor && speed == 1. {
        state.lease = None;
        return Ok(());
    }
    let baseline = native_baseline(&lease, speed, clock(m, base)?)?;
    match write_value(m, at + SPEED_OFFSET, speed, baseline) {
        Ok(true) => {
            state.lease = None;
            Ok(())
        }
        Ok(false) => invalid("Native speed restore failed and was rolled back; retry"),
        Err(error) => {
            state.poisoned = true;
            Err(error)
        }
    }
}
pub fn tick(
    m: &impl Memory,
    base: u64,
    id: &MapIdentity,
    state: &mut State,
    config: &Config,
    held: bool,
) -> Result<Info> {
    config.validate()?;
    if state.poisoned {
        return invalid("Native sprint rollback is incomplete; reload the map");
    }
    if !held {
        reset(m, base, id, state)?;
        return info(m, base, id);
    }
    let p = player(m, base, id)?;
    if !p.allowed {
        reset(m, base, id, state)?;
        return info(m, base, id);
    }
    if state
        .lease
        .as_ref()
        .is_some_and(|l| l.key != p.key || l.actor != p.datum)
    {
        reset(m, base, id, state)?;
    }
    let before = state.lease.clone();
    let now = clock(m, base)?;
    let original = match before.as_ref() {
        Some(lease) => native_baseline(lease, p.speed, now)?,
        None => p.speed,
    };
    let expected = p.speed;
    let applied = original * config.multiplier;
    if !applied.is_finite() || applied > 10. {
        return invalid("Requested sprint exceeds the native movement limit");
    }
    if p.speed.to_bits() == applied.to_bits() {
        return info(m, base, id);
    }
    let at = record(m, base, &p.key)?.ok_or_else(|| {
        crate::SparkError::Invalid("Player left before sprint was applied".into())
    })?;
    if u32_at(m, at + 0x64)? != p.datum {
        return invalid("Player respawned before sprint was applied");
    }
    state.lease = Some(Lease {
        key: p.key,
        actor: p.datum,
        original,
        applied,
        clock: now,
    });
    match write_value(m, at + SPEED_OFFSET, expected, applied) {
        Ok(true) => info(m, base, id),
        Ok(false) => {
            state.lease = before;
            invalid("Native sprint write failed; exact previous speed restored")
        }
        Err(error) => {
            state.poisoned = true;
            Err(error)
        }
    }
}
