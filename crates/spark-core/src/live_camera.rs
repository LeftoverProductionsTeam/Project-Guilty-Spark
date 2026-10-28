//! Temporary, journalled third-person camera data for the reviewed MCC profile.
//! The engine retains camera simulation, rendering, input and weapon aiming.
use super::*;
use std::collections::{BTreeMap, BTreeSet};

const THIRD_PERSON: u32 = 1 << 17;
const WEAPON_FLAGS: u64 = 0x308;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Shortcut {
    pub enabled: bool,
    pub key: String,
}
impl Default for Shortcut {
    fn default() -> Self {
        Self {
            enabled: true,
            key: "F6".into(),
        }
    }
}
impl Shortcut {
    pub fn function_key(&self) -> Result<u8> {
        let number = self
            .key
            .strip_prefix('F')
            .and_then(|s| s.parse::<u8>().ok())
            .filter(|n| (1..=12).contains(n) && self.key == format!("F{n}"));
        number.ok_or_else(|| {
            crate::SparkError::Invalid("Choose a camera shortcut from F1 through F12".into())
        })
    }
}
#[derive(Default)]
pub struct ShortcutLatch {
    initialized: bool,
    down: bool,
}
impl ShortcutLatch {
    /// Observe the actual key even outside MCC, so holding it while changing
    /// focus or enabling the shortcut never generates an extra toggle.
    pub fn sample(&mut self, shortcut: &Shortcut, down: bool, focused: bool) -> bool {
        let pressed = self.initialized && shortcut.enabled && focused && down && !self.down;
        self.initialized = true;
        self.down = down;
        pressed
    }
}

#[cfg(test)]
mod shortcut_tests {
    use super::*;
    #[test]
    fn camera_shortcut_is_one_toggle_per_press_only_inside_the_game() {
        let mut latch = ShortcutLatch::default();
        let mut shortcut = Shortcut::default();
        assert!(!latch.sample(&shortcut, true, true)); // Already held at connection.
        assert!(!latch.sample(&shortcut, false, true));
        assert!(latch.sample(&shortcut, true, true));
        assert!(!latch.sample(&shortcut, true, true));
        assert!(!latch.sample(&shortcut, false, false));
        assert!(!latch.sample(&shortcut, true, false));
        assert!(!latch.sample(&shortcut, true, true));
        shortcut.enabled = false;
        assert!(!latch.sample(&shortcut, false, true));
        assert!(!latch.sample(&shortcut, true, true));
        shortcut.enabled = true;
        assert!(!latch.sample(&shortcut, true, true));
        assert!(!latch.sample(&shortcut, false, true));
        assert!(latch.sample(&shortcut, true, true));
        assert_eq!(shortcut.function_key().unwrap(), 6);
        for key in ["F0", "F13", "F06", "KeyQ", "Alt+F4"] {
            shortcut.key = key.into();
            assert!(shortcut.function_key().is_err());
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Config {
    /// Extra distance behind the authored camera track, in world units.
    pub back: f32,
    /// Positive moves toward the character's right shoulder.
    pub right: f32,
    pub up: f32,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            back: 0.4,
            right: 0.3,
            up: 0.15,
        }
    }
}
impl Config {
    pub fn validate(&self) -> Result<()> {
        if !self.back.is_finite()
            || !(0.0..=3.0).contains(&self.back)
            || !self.right.is_finite()
            || !(-1.5..=1.5).contains(&self.right)
            || !self.up.is_finite()
            || !(-1.0..=2.0).contains(&self.up)
        {
            return invalid("Camera offsets must be finite: back 0–3, shoulder -1.5–1.5 and height -1–2 world units");
        }
        Ok(())
    }
}
#[derive(Clone)]
struct Track {
    datum: u32,
    points: u64,
    original: Vec<[f32; 3]>,
    applied: Vec<[f32; 3]>,
}
#[derive(Clone)]
struct Weapon {
    datum: u32,
    original: bool,
}
#[derive(Default)]
pub struct State {
    weapon: Option<Weapon>,
    tracks: BTreeMap<u32, Track>,
    config: Option<Config>,
    poisoned: bool,
}
impl State {
    pub fn active(&self) -> bool {
        self.weapon.is_some() || !self.tracks.is_empty() || self.poisoned
    }
    pub fn engaged(&self) -> bool {
        self.weapon.is_some() && !self.poisoned
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    pub available: bool,
    pub reason: String,
    pub weapon_third_person: bool,
    pub track_count: usize,
    pub camera_position: [f32; 3],
    pub camera_forward: [f32; 3],
    pub camera_up: [f32; 3],
}
struct Target {
    weapon: u32,
    tracks: BTreeSet<u32>,
}
fn data(m: &impl Memory, id: &MapIdentity, table: u64, datum: u32, class: [u8; 4]) -> Result<u64> {
    if datum == u32::MAX || datum & 0xffff >= id.tag_count {
        return invalid("Camera dependency is outside the loaded map");
    }
    let entry = table + u64::from(datum & 0xffff) * 32;
    if u32_at(m, entry + 12)? != datum || u32_at(m, entry)? != u32::from_be_bytes(class) {
        return invalid("Camera dependency class or salt changed");
    }
    tag_pointer(id.header, u32_at(m, entry + 20)?)
}
fn target(m: &impl Memory, base: u64, id: &MapIdentity, table: u64) -> Result<Option<Target>> {
    let actor = u32_at(m, pointer(m, base + 0x2d9cd90)? + 4)?;
    if actor == u32::MAX {
        return Ok(None);
    }
    let (body, kind) = object_address(m, id, actor)?;
    if kind != 0 {
        return invalid("Third-person controls require your own Halo 1 biped");
    }
    let health = f32::from_le_bytes(m.read(body + 0x9c, 4)?.try_into().unwrap());
    if !health.is_finite() {
        return invalid("Player health is not valid camera data");
    }
    if health <= 0.0 || u32_at(m, body + 0xd8)? != u32::MAX {
        return Ok(None);
    }
    let equipped = u32_at(m, body + 0xd4)?;
    if equipped == u32::MAX {
        return Ok(None);
    }
    let (weapon, kind) = object_address(m, id, equipped)?;
    if kind != 2 || u32_at(m, weapon + 0xd8)? != actor {
        return invalid("Held weapon and camera owner do not agree; retry after switching");
    }
    let weapon = u32_at(m, weapon)?;
    data(m, id, table, weapon, *b"weap")?;
    let unit = data(m, id, table, u32_at(m, body)?, *b"bipd")?;
    let count = u32_at(m, unit + 0x1f4)?;
    if !(1..=2).contains(&count) {
        return invalid("This biped has no supported native third-person camera track");
    }
    let start = tag_pointer(id.header, u32_at(m, unit + 0x1f8)?)?;
    let mut tracks = BTreeSet::new();
    for i in 0..count {
        let at = start + u64::from(i) * 28;
        if u32_at(m, at)? != u32::from_be_bytes(*b"trak") {
            return invalid("Biped camera dependency is not a camera track");
        }
        let datum = u32_at(m, at + 12)?;
        data(m, id, table, datum, *b"trak")?;
        tracks.insert(datum);
    }
    Ok(Some(Target { weapon, tracks }))
}
fn read_track(m: &impl Memory, id: &MapIdentity, table: u64, datum: u32) -> Result<Track> {
    let track = data(m, id, table, datum, *b"trak")?;
    let count = u32_at(m, track + 4)?;
    if !(4..=16).contains(&count) {
        return invalid("Native camera track requires 4–16 control points");
    }
    let points = tag_pointer(id.header, u32_at(m, track + 8)?)?;
    let bytes = m.read(points, count as usize * 60)?;
    let mut original = vec![];
    for point in bytes.chunks_exact(60) {
        let position: [f32; 3] = std::array::from_fn(|i| {
            f32::from_le_bytes(point[i * 4..i * 4 + 4].try_into().unwrap())
        });
        let q: [f32; 4] = std::array::from_fn(|i| {
            f32::from_le_bytes(point[12 + i * 4..16 + i * 4].try_into().unwrap())
        });
        if position.iter().any(|v| !v.is_finite() || v.abs() > 1000.0)
            || q.iter().any(|v| !v.is_finite())
            || !(0.98..=1.02).contains(&q.iter().map(|v| v * v).sum::<f32>())
        {
            return invalid("Native camera control points or rotations are malformed");
        }
        original.push(position);
    }
    Ok(Track {
        datum,
        points,
        applied: original.clone(),
        original,
    })
}
fn same(a: &[f32; 3], b: &[f32; 3]) -> bool {
    a.iter().zip(b).all(|(a, b)| a.to_bits() == b.to_bits())
}
fn verify(m: &impl Memory, id: &MapIdentity, table: u64, state: &State) -> Result<()> {
    if state.poisoned {
        return invalid("Camera rollback is incomplete; reload a different map before continuing");
    }
    if let Some(w) = &state.weapon {
        if u32_at(m, data(m, id, table, w.datum, *b"weap")? + WEAPON_FLAGS)? & THIRD_PERSON == 0 {
            return invalid("Another writer changed the active third-person flag; camera restore requires attention");
        }
    }
    for lease in state.tracks.values() {
        let current = read_track(m, id, table, lease.datum)?;
        if current.points != lease.points
            || current.original.len() != lease.applied.len()
            || !current
                .original
                .iter()
                .zip(&lease.applied)
                .all(|(a, b)| same(a, b))
        {
            return invalid(
                "Another writer changed the camera track; refusing to overwrite its new position",
            );
        }
    }
    Ok(())
}
pub fn info(m: &impl Memory, base: u64, expected: &MapIdentity) -> Result<Info> {
    let (id, table) = identity(m, base)?;
    if &id != expected {
        return invalid("Loaded map changed; reconnect third-person controls");
    }
    let target = target(m, base, &id, table)?;
    let third = target
        .as_ref()
        .map(|t| {
            data(m, &id, table, t.weapon, *b"weap").and_then(|at| u32_at(m, at + WEAPON_FLAGS))
        })
        .transpose()?
        .is_some_and(|f| f & THIRD_PERSON != 0);
    let camera = base + 0x2d9bdd4;
    let forward = vec3(m, camera + 0x20)?;
    let up = vec3(m, camera + 0x2c)?;
    for v in [forward, up] {
        if !(0.9..=1.1).contains(&v.iter().map(|v| v * v).sum::<f32>()) {
            return invalid("Native camera basis is invalid");
        }
    }
    Ok(Info {
        available: target.is_some(),
        reason: if target.is_some() {
            "Native on-foot camera available"
        } else {
            "Waiting for a living, on-foot player with an equipped weapon"
        }
        .into(),
        weapon_third_person: third,
        track_count: target.map_or(0, |t| t.tracks.len()),
        camera_position: vec3(m, camera)?,
        camera_forward: forward,
        camera_up: up,
    })
}
pub fn needs_update(
    m: &impl Memory,
    base: u64,
    expected: &MapIdentity,
    state: &State,
    config: &Config,
) -> Result<bool> {
    config.validate()?;
    let (id, table) = identity(m, base)?;
    if &id != expected {
        return invalid("Loaded map changed; reconnect third-person controls");
    }
    verify(m, &id, table, state)?;
    let Some(t) = target(m, base, &id, table)? else {
        return Ok(state.active());
    };
    Ok(state.config.as_ref() != Some(config)
        || state.weapon.as_ref().is_none_or(|w| w.datum != t.weapon)
        || state.tracks.keys().copied().collect::<BTreeSet<_>>() != t.tracks)
}
struct Write {
    address: u64,
    before: Vec<u8>,
    after: Vec<u8>,
}
fn plan(
    m: &impl Memory,
    writes: &mut BTreeMap<u64, Write>,
    address: u64,
    after: Vec<u8>,
) -> Result<()> {
    if let Some(w) = writes.get_mut(&address) {
        w.after = after;
    } else {
        writes.insert(
            address,
            Write {
                address,
                before: m.read(address, after.len())?,
                after,
            },
        );
    }
    Ok(())
}
fn position_bytes(p: &[f32; 3]) -> Vec<u8> {
    p.iter().flat_map(|v| v.to_le_bytes()).collect()
}
fn commit(m: &impl Memory, writes: BTreeMap<u64, Write>, state: &mut State) -> Result<()> {
    let writes: Vec<_> = writes
        .into_values()
        .filter(|w| w.before != w.after)
        .collect();
    if writes.len() > 66 {
        return invalid("Camera transaction exceeds its bound");
    }
    for w in &writes {
        if m.read(w.address, w.before.len())? != w.before {
            return invalid("Camera changed before the transaction; no writes made");
        }
    }
    let mut done = 0;
    let result = (|| -> Result<()> {
        for w in &writes {
            done += 1; // Include a failed or partial write in rollback.
            m.write(w.address, &w.after)?;
            if m.read(w.address, w.after.len())? != w.after {
                return invalid("Camera write did not read back");
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
            "Camera transaction failed: {error}; {}",
            if restored {
                "previous data restored"
            } else {
                "rollback incomplete; reload a different map"
            }
        ));
    }
    Ok(())
}
/// Called with the native simulation paused, after validating process lifetime.
pub fn apply(
    m: &impl Memory,
    base: u64,
    expected: &MapIdentity,
    state: &mut State,
    config: Option<&Config>,
) -> Result<()> {
    if let Some(c) = config {
        c.validate()?;
    }
    let (id, table) = identity(m, base)?;
    if &id != expected {
        *state = State::default();
        return if config.is_some() {
            invalid("Loaded map changed; reconnect third-person controls")
        } else {
            Ok(())
        };
    }
    verify(m, &id, table, state)?;
    let next = if config.is_some() {
        target(m, base, &id, table)?
    } else {
        None
    };
    let mut writes = BTreeMap::new();
    if let Some(w) = &state.weapon {
        let at = data(m, &id, table, w.datum, *b"weap")? + WEAPON_FLAGS;
        let flags = u32_at(m, at)?;
        let restored = if w.original {
            flags | THIRD_PERSON
        } else {
            flags & !THIRD_PERSON
        };
        plan(m, &mut writes, at, restored.to_le_bytes().to_vec())?;
    }
    for t in state.tracks.values() {
        for (i, p) in t.original.iter().enumerate() {
            plan(m, &mut writes, t.points + i as u64 * 60, position_bytes(p))?;
        }
    }
    let mut next_state = State::default();
    if let (Some(target), Some(config)) = (next, config) {
        let at = data(m, &id, table, target.weapon, *b"weap")? + WEAPON_FLAGS;
        let flags = u32_at(m, at)?;
        let original = state
            .weapon
            .as_ref()
            .filter(|w| w.datum == target.weapon)
            .map_or(flags & THIRD_PERSON != 0, |w| w.original);
        next_state.weapon = Some(Weapon {
            datum: target.weapon,
            original,
        });
        plan(
            m,
            &mut writes,
            at,
            (flags | THIRD_PERSON).to_le_bytes().to_vec(),
        )?;
        for datum in target.tracks {
            let mut track = state
                .tracks
                .get(&datum)
                .cloned()
                .map_or_else(|| read_track(m, &id, table, datum), Ok)?;
            track.applied = track
                .original
                .iter()
                .map(|p| [p[0] - config.back, p[1] - config.right, p[2] + config.up])
                .collect();
            for (i, p) in track.applied.iter().enumerate() {
                plan(
                    m,
                    &mut writes,
                    track.points + i as u64 * 60,
                    position_bytes(p),
                )?;
            }
            next_state.tracks.insert(datum, track);
        }
        next_state.config = Some(config.clone());
    }
    commit(m, writes, state)?;
    *state = next_state;
    Ok(())
}
