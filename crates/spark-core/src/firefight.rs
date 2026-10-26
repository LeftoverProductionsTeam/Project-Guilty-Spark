//! Deterministic authoring/simulation rules. No game process or network bridge is attached.
use crate::{invalid, maps::MapInspection, Result, SparkError};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, VecDeque};

pub const SCHEMA_VERSION: u32 = 1;
pub const MAX_COMMANDS: usize = 4096;
const MAX_EVENTS: usize = 32768;
const MAX_CLOCK_MS: u64 = 86_400_000;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EnemyType {
    pub id: String,
    pub name: String,
    pub actor_variant_path: String,
    pub points: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpawnZone {
    pub id: String,
    pub position: [f32; 3],
    pub radius: f32,
    pub enabled: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EnemyGroup {
    pub enemy_id: String,
    pub count: u16,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WaveDefinition {
    pub id: String,
    pub name: String,
    pub boss: bool,
    pub score_multiplier_milli: u32,
    pub groups: Vec<EnemyGroup>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FirefightConfig {
    pub schema_version: u32,
    pub title: String,
    pub source_sha256: Option<String>,
    pub seed: u32,
    pub player_count: u8,
    pub team_lives: u16,
    pub allow_revives: bool,
    pub rounds: u16,
    pub endless: bool,
    pub preparation_ms: u32,
    pub countdown_ms: u32,
    pub intermission_ms: u32,
    pub spawn_interval_ms: u32,
    pub spawn_timeout_ms: u32,
    pub stuck_timeout_ms: u32,
    pub max_spawn_attempts: u8,
    pub max_alive: u16,
    pub max_total_per_wave: u16,
    pub difficulty_step_percent: u16,
    pub extra_player_count_percent: u16,
    pub enemies: Vec<EnemyType>,
    pub spawn_zones: Vec<SpawnZone>,
    pub waves: Vec<WaveDefinition>,
    pub starting_equipment: Vec<String>,
    pub replenish_ammo_each_wave: bool,
    pub supply_drop_tags: Vec<String>,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    Preparation,
    Countdown,
    WaveStart,
    ActiveWave,
    Boss,
    WaveComplete,
    Intermission,
    NextWave,
    Victory,
    Defeat,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ActorStatus {
    Pending,
    Alive,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActorSnapshot {
    pub id: u32,
    pub enemy_id: String,
    pub zone_id: String,
    pub position: [f32; 3],
    pub status: ActorStatus,
    pub attempt: u8,
    pub requested_at_ms: u64,
    pub last_progress_ms: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FirefightState {
    pub phase: Phase,
    pub elapsed_ms: u64,
    pub phase_deadline_ms: Option<u64>,
    pub wave_number: u32,
    pub round_number: u32,
    pub wave_id: Option<String>,
    pub queued_enemies: u16,
    pub spawned_enemies: u32,
    pub kills: u32,
    pub score: u64,
    pub team_lives: u16,
    pub players_alive: Vec<bool>,
    pub actors: Vec<ActorSnapshot>,
    pub reason: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FirefightEvent {
    pub at_ms: u64,
    pub kind: String,
    pub actor_id: Option<u32>,
    pub enemy_id: Option<String>,
    pub zone_id: Option<String>,
    pub position: Option<[f32; 3]>,
    pub actor_variant_path: Option<String>,
    pub detail: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum FirefightCommand {
    Start {},
    Advance { milliseconds: u32 },
    SpawnSucceeded { actor_id: u32 },
    SpawnFailed { actor_id: u32 },
    ActorKilled { actor_id: u32 },
    ActorProgress { actor_id: u32 },
    PlayerDown { player: u8 },
    RespawnPlayer { player: u8 },
    RevivePlayer { player: u8 },
    Abort {},
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SimulationReport {
    pub schema_version: u32,
    pub scope: String,
    pub runtime_integrated: bool,
    pub gameplay_verified: bool,
    pub config_sha256: String,
    pub state: FirefightState,
    pub events: Vec<FirefightEvent>,
    pub diagnostics: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    pub valid: bool,
    pub source_matches: bool,
    pub missing_actor_variants: Vec<String>,
    pub missing_equipment: Vec<String>,
    pub runtime_integrated: bool,
    pub diagnostics: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirefightPreset {
    pub id: String,
    pub name: String,
    pub config: Option<FirefightConfig>,
    pub missing_actor_variants: Vec<String>,
    pub detail: String,
}

pub fn default_config() -> FirefightConfig {
    FirefightConfig {
        schema_version: SCHEMA_VERSION,
        title: "Firefight".into(),
        source_sha256: None,
        seed: 1,
        player_count: 2,
        team_lives: 5,
        allow_revives: false,
        rounds: 3,
        endless: false,
        preparation_ms: 1000,
        countdown_ms: 3000,
        intermission_ms: 5000,
        spawn_interval_ms: 500,
        spawn_timeout_ms: 5000,
        stuck_timeout_ms: 60000,
        max_spawn_attempts: 3,
        max_alive: 16,
        max_total_per_wave: 128,
        difficulty_step_percent: 25,
        extra_player_count_percent: 50,
        enemies: vec![],
        spawn_zones: vec![SpawnZone {
            id: "spawn-1".into(),
            position: [0.0; 3],
            radius: 2.0,
            enabled: true,
        }],
        waves: vec![],
        starting_equipment: vec![],
        replenish_ammo_each_wave: false,
        supply_drop_tags: vec![],
    }
}
fn identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c))
}
fn label(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= 160 && !value.chars().any(char::is_control)
}
fn tag_key(value: &str) -> String {
    value.replace('\\', "/").to_lowercase()
}
pub fn validate_document(config: &FirefightConfig) -> Result<()> {
    if config.schema_version != SCHEMA_VERSION || !label(&config.title) {
        return invalid("Invalid Firefight schema or title");
    }
    if config.source_sha256.as_ref().is_some_and(|s| {
        s.len() != 64
            || !s
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    }) {
        return invalid("Invalid source map SHA256");
    }
    if !(1..=16).contains(&config.player_count)
        || config.team_lives > 1000
        || !(1..=1000).contains(&config.rounds)
    {
        return invalid("Firefight supports 1-16 authored players, at most 1000 team lives and 1-1000 finite rounds; target runtime limits are separate");
    }
    if config.preparation_ms > 600000
        || config.countdown_ms > 600000
        || !(100..=600000).contains(&config.intermission_ms)
        || !(50..=60000).contains(&config.spawn_interval_ms)
        || !(100..=600000).contains(&config.spawn_timeout_ms)
        || !(1000..=3_600_000).contains(&config.stuck_timeout_ms)
    {
        return invalid("Firefight timings exceed safe simulation bounds");
    }
    if !(1..=10).contains(&config.max_spawn_attempts)
        || !(1..=128).contains(&config.max_alive)
        || !(1..=2048).contains(&config.max_total_per_wave)
        || config.difficulty_step_percent > 1000
        || config.extra_player_count_percent > 1000
    {
        return invalid("Firefight spawn/scaling limits are invalid");
    }
    if config.enemies.len() > 64 || config.spawn_zones.len() > 64 || config.waves.len() > 64 {
        return invalid("At most 64 enemy types, spawn zones and waves are allowed");
    }
    let mut enemy_ids = BTreeSet::new();
    for enemy in &config.enemies {
        if !identifier(&enemy.id)
            || !enemy_ids.insert(enemy.id.as_str())
            || !label(&enemy.name)
            || enemy.points > 100000
        {
            return invalid("Invalid or duplicate enemy identity/score");
        }
        crate::safe_relative(&enemy.actor_variant_path)?;
    }
    let mut zone_ids = BTreeSet::new();
    for zone in &config.spawn_zones {
        if !identifier(&zone.id)
            || !zone_ids.insert(zone.id.as_str())
            || !zone.radius.is_finite()
            || !(0.0..=10000.0).contains(&zone.radius)
            || zone
                .position
                .iter()
                .any(|v| !v.is_finite() || v.abs() > 100000.0)
        {
            return invalid("Invalid/duplicate spawn zone or nonfinite/out-of-bounds position");
        }
    }
    let mut wave_ids = BTreeSet::new();
    for wave in &config.waves {
        if !identifier(&wave.id)
            || !wave_ids.insert(wave.id.as_str())
            || !label(&wave.name)
            || !(1..=100000).contains(&wave.score_multiplier_milli)
            || wave.groups.len() > 16
        {
            return invalid("Invalid wave identity, score multiplier or group count");
        }
        let mut total = 0u32;
        let mut groups = BTreeSet::new();
        for group in &wave.groups {
            if group.count == 0
                || !identifier(&group.enemy_id)
                || !groups.insert(group.enemy_id.as_str())
            {
                return invalid(
                    "Wave group references an invalid/duplicate enemy ID or has zero count",
                );
            }
            total += group.count as u32;
        }
        if total > config.max_total_per_wave as u32 {
            return invalid("Authored wave count exceeds maxTotalPerWave");
        }
    }
    if config.starting_equipment.len() > 16 || config.supply_drop_tags.len() > 16 {
        return invalid("At most 16 equipment or supply references are allowed");
    }
    for path in config
        .starting_equipment
        .iter()
        .chain(&config.supply_drop_tags)
    {
        crate::safe_relative(path)?;
    }
    Ok(())
}
pub fn validate(config: &FirefightConfig) -> Result<()> {
    validate_document(config)?;
    if config.enemies.is_empty()
        || config.waves.is_empty()
        || !config.spawn_zones.iter().any(|z| z.enabled)
    {
        return invalid(
            "Runnable simulation requires enemies, waves and at least one enabled spawn zone",
        );
    }
    let ids = config
        .enemies
        .iter()
        .map(|e| e.id.as_str())
        .collect::<BTreeSet<_>>();
    for wave in &config.waves {
        if wave.groups.is_empty()
            || wave
                .groups
                .iter()
                .any(|g| !ids.contains(g.enemy_id.as_str()))
        {
            return invalid("Each runnable wave needs groups referencing available enemy IDs");
        }
    }
    Ok(())
}
pub fn validate_assets(config: &FirefightConfig, inspection: &MapInspection) -> ValidationReport {
    let mut diagnostics=vec!["Asset identity checks do not validate spawn collision/pathfinding or generate runtime scripts. No game bridge is attached.".into()];
    if let Err(error) = validate(config) {
        diagnostics.push(error.to_string());
    }
    let source_matches = config.source_sha256.as_deref() == Some(inspection.sha256.as_str());
    if !source_matches {
        diagnostics.push(
            "Configuration source SHA256 is missing or differs from the inspected map.".into(),
        );
    }
    let actors: BTreeSet<_> = inspection
        .tags
        .iter()
        .filter(|t| t.class == "actv")
        .map(|t| tag_key(&t.path))
        .collect();
    let equipment: BTreeSet<_> = inspection
        .tags
        .iter()
        .filter(|t| ["weap", "eqip", "itmc"].contains(&t.class.as_str()))
        .map(|t| tag_key(&t.path))
        .collect();
    let missing_actor_variants = config
        .enemies
        .iter()
        .filter(|e| !actors.contains(&tag_key(&e.actor_variant_path)))
        .map(|e| e.actor_variant_path.clone())
        .collect::<Vec<_>>();
    let missing_equipment = config
        .starting_equipment
        .iter()
        .chain(&config.supply_drop_tags)
        .filter(|p| !equipment.contains(&tag_key(p)))
        .cloned()
        .collect::<Vec<_>>();
    ValidationReport {
        valid: validate(config).is_ok()
            && source_matches
            && missing_actor_variants.is_empty()
            && missing_equipment.is_empty(),
        source_matches,
        missing_actor_variants,
        missing_equipment,
        runtime_integrated: false,
        diagnostics,
    }
}
pub fn available_enemies(inspection: &MapInspection) -> Vec<EnemyType> {
    inspection
        .tags
        .iter()
        .filter(|t| t.class == "actv")
        .map(|t| EnemyType {
            id: format!("enemy-{:08x}", t.id),
            name: t.path.rsplit(['\\', '/']).next().unwrap_or(&t.path).into(),
            actor_variant_path: t.path.clone(),
            points: 100,
        })
        .collect()
}
pub fn presets(inspection: &MapInspection) -> Vec<FirefightPreset> {
    let available = available_enemies(inspection);
    let standard = "MGM\\Fonzie\\Sparky\\Tags\\Zombies\\Zombie";
    let evolved = "MGM\\Fonzie\\Sparky\\Tags\\Zombies\\Evolved Zombie orig";
    let alpha = "MGM\\Fonzie\\Sparky\\Tags\\Alpha Zombieorig";
    [("standardZombieWaves","Standard Zombie Waves",vec![standard],false,false),
     ("evolvedZombieWaves","Evolved Zombie Waves",vec![standard,evolved],false,false),
     ("alphaZombieBossWaves","Alpha Zombie Boss Waves",vec![standard,alpha],true,false),
     ("endlessHorde","Endless Horde",vec![standard,evolved,alpha],true,true),
     ("teamSurvival","Team Survival",vec![standard,evolved],false,false)].into_iter().map(|(id,name,paths,boss,endless)| {
        let missing_actor_variants=paths.iter().filter(|p|!available.iter().any(|e|tag_key(&e.actor_variant_path)==tag_key(p))).map(|p|p.to_string()).collect::<Vec<_>>();
        let config=if missing_actor_variants.is_empty() {
            let mut c=default_config();c.title=format!("Fonzie's Zombie Apocalypse — {name}");c.source_sha256=Some(inspection.sha256.clone());c.endless=endless;
            c.enemies=paths.iter().filter_map(|p|available.iter().find(|e|tag_key(&e.actor_variant_path)==tag_key(p)).cloned()).collect();
            c.waves.push(WaveDefinition{id:"wave-1".into(),name:"Opening wave".into(),boss:false,score_multiplier_milli:1000,groups:vec![EnemyGroup{enemy_id:c.enemies[0].id.clone(),count:8}]});
            c.waves.push(WaveDefinition{id:"wave-2".into(),name:if boss{"Boss wave"}else{"Escalation"}.into(),boss,score_multiplier_milli:if boss{2000}else{1250},groups:c.enemies.iter().enumerate().map(|(i,e)|EnemyGroup{enemy_id:e.id.clone(),count:if i==0{8}else{2}}).collect()});
            Some(c)
        } else {None};
        FirefightPreset{id:id.into(),name:name.into(),config,missing_actor_variants,detail:"Authored Firefight derivative using actual imported actor-variant paths. Original credits remain Patrick Davis/Fonzie/AnonDavis and collaborators. Draft spawn zone needs placement/pathfinding review; legacy spawner mechanics are not automatically converted. No gameplay/runtime integration.".into()}
    }).collect()
}

#[derive(Clone)]
struct Ticket {
    enemy_id: String,
    attempt: u8,
}
struct Director<'a> {
    config: &'a FirefightConfig,
    state: FirefightState,
    started: bool,
    queue: VecDeque<Ticket>,
    actors: BTreeMap<u32, ActorSnapshot>,
    spawn_due: u64,
    next_actor: u32,
    rng: u32,
    completed_waves: u32,
    events: Vec<FirefightEvent>,
}
impl<'a> Director<'a> {
    fn new(config: &'a FirefightConfig) -> Self {
        Self {
            config,
            state: FirefightState {
                phase: Phase::Preparation,
                elapsed_ms: 0,
                phase_deadline_ms: None,
                wave_number: 0,
                round_number: 0,
                wave_id: None,
                queued_enemies: 0,
                spawned_enemies: 0,
                kills: 0,
                score: 0,
                team_lives: config.team_lives,
                players_alive: vec![true; config.player_count as usize],
                actors: vec![],
                reason: None,
            },
            started: false,
            queue: VecDeque::new(),
            actors: BTreeMap::new(),
            spawn_due: 0,
            next_actor: 1,
            rng: if config.seed == 0 {
                0x9e3779b9
            } else {
                config.seed
            },
            completed_waves: 0,
            events: vec![],
        }
    }
    fn active(&self) -> bool {
        matches!(self.state.phase, Phase::ActiveWave | Phase::Boss)
    }
    fn terminal(&self) -> bool {
        matches!(self.state.phase, Phase::Victory | Phase::Defeat)
    }
    fn event(&mut self, kind: &str, detail: impl Into<String>) -> Result<()> {
        if self.events.len() >= MAX_EVENTS {
            return invalid("Simulation event limit exceeded; preview fewer waves or use larger spawn intervals");
        }
        self.events.push(FirefightEvent {
            at_ms: self.state.elapsed_ms,
            kind: kind.into(),
            actor_id: None,
            enemy_id: None,
            zone_id: None,
            position: None,
            actor_variant_path: None,
            detail: detail.into(),
        });
        Ok(())
    }
    fn phase(&mut self, phase: Phase) -> Result<()> {
        self.state.phase = phase;
        self.event("phaseChanged", format!("{phase:?}"))
    }
    fn end(&mut self, phase: Phase, reason: impl Into<String>) -> Result<()> {
        let reason = reason.into();
        self.state.reason = Some(reason.clone());
        self.state.phase_deadline_ms = None;
        self.phase(phase)?;
        self.event(
            if phase == Phase::Victory {
                "victory"
            } else {
                "defeat"
            },
            reason,
        )
    }
    fn random(&mut self) -> u32 {
        let mut x = self.rng;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.rng = x;
        x
    }
    fn start_wave(&mut self) -> Result<()> {
        self.state.wave_number += 1;
        self.state.round_number = (self.state.wave_number - 1) / self.config.waves.len() as u32 + 1;
        if self.state.round_number > 1_000_000 {
            return self.end(Phase::Defeat, "Simulation round limit reached");
        }
        let index = (self.state.wave_number as usize - 1) % self.config.waves.len();
        let wave = &self.config.waves[index];
        self.state.wave_id = Some(wave.id.clone());
        self.state.phase_deadline_ms = None;
        self.phase(Phase::WaveStart)?;
        let scale = 100u64
            + self.config.difficulty_step_percent as u64 * (self.state.round_number as u64 - 1);
        let players = 100u64
            + self.config.extra_player_count_percent as u64 * (self.config.player_count as u64 - 1);
        let mut budget = self.config.max_total_per_wave as usize;
        for (index, group) in wave.groups.iter().enumerate() {
            let requested = (group.count as u64 * scale * players).div_ceil(10000) as usize;
            let remaining_groups = wave.groups.len() - index - 1;
            let count = requested.min(budget - remaining_groups).max(1);
            budget -= count;
            for _ in 0..count {
                self.queue.push_back(Ticket {
                    enemy_id: group.enemy_id.clone(),
                    attempt: 1,
                });
            }
        }
        self.event(
            "waveStarted",
            format!(
                "Wave {} / round {}: {} enemies; difficulty {}%; player scale {}%; cap {}",
                self.state.wave_number,
                self.state.round_number,
                self.queue.len(),
                scale,
                players,
                self.config.max_total_per_wave
            ),
        )?;
        if self.config.replenish_ammo_each_wave || !self.config.supply_drop_tags.is_empty() {
            self.event(
                "supplyRequested",
                format!(
                    "Authoring intent only: replenish ammo={}, supply tags={:?}",
                    self.config.replenish_ammo_each_wave, self.config.supply_drop_tags
                ),
            )?;
        }
        self.spawn_due = self.state.elapsed_ms;
        self.phase(if wave.boss {
            Phase::Boss
        } else {
            Phase::ActiveWave
        })
    }
    fn spawn(&mut self) -> Result<()> {
        if self.next_actor > 100000 {
            return self.end(Phase::Defeat, "Simulation actor ID budget exhausted");
        }
        let ticket = self
            .queue
            .pop_front()
            .ok_or_else(|| SparkError::Invalid("Spawn queue is empty".into()))?;
        let zones = self
            .config
            .spawn_zones
            .iter()
            .filter(|z| z.enabled)
            .collect::<Vec<_>>();
        let zone = zones[(self.random() as usize) % zones.len()];
        // Integer pseudo-random offsets avoid platform-dependent trigonometry. A square
        // inscribed in the circle keeps every proposed point inside the authored radius.
        let x = (self.random() % 2001) as f32 / 1000.0 - 1.0;
        let y = (self.random() % 2001) as f32 / 1000.0 - 1.0;
        let position = [
            zone.position[0] + x * zone.radius * 0.707,
            zone.position[1] + y * zone.radius * 0.707,
            zone.position[2],
        ];
        let actor = ActorSnapshot {
            id: self.next_actor,
            enemy_id: ticket.enemy_id.clone(),
            zone_id: zone.id.clone(),
            position,
            status: ActorStatus::Pending,
            attempt: ticket.attempt,
            requested_at_ms: self.state.elapsed_ms,
            last_progress_ms: self.state.elapsed_ms,
        };
        self.next_actor += 1;
        self.spawn_due = self.state.elapsed_ms + self.config.spawn_interval_ms as u64;
        self.event(
            "spawnRequested",
            "Virtual spawn requested; pending until explicitly acknowledged",
        )?;
        let event = self.events.last_mut().unwrap();
        event.actor_id = Some(actor.id);
        event.enemy_id = Some(actor.enemy_id.clone());
        event.zone_id = Some(actor.zone_id.clone());
        event.position = Some(position);
        event.actor_variant_path = self
            .config
            .enemies
            .iter()
            .find(|e| e.id == actor.enemy_id)
            .map(|e| e.actor_variant_path.clone());
        self.actors.insert(actor.id, actor);
        Ok(())
    }
    fn failed_spawn(&mut self, id: u32) -> Result<()> {
        let actor = self.actors.get(&id).ok_or_else(|| {
            SparkError::Invalid("Spawn failure references an unknown/stale actor ID".into())
        })?;
        if actor.status != ActorStatus::Pending {
            return invalid("Only a pending spawn can fail");
        }
        let actor = self.actors.remove(&id).unwrap();
        if actor.attempt >= self.config.max_spawn_attempts {
            return self.end(
                Phase::Defeat,
                format!(
                    "Spawn {} failed after {} attempts; no score or wave completion awarded",
                    actor.enemy_id, actor.attempt
                ),
            );
        }
        self.queue.push_back(Ticket {
            enemy_id: actor.enemy_id.clone(),
            attempt: actor.attempt + 1,
        });
        self.event(
            "spawnRetry",
            format!(
                "Actor {id} failed; attempt {} will receive a new actor ID",
                actor.attempt + 1
            ),
        )?;
        self.events.last_mut().unwrap().actor_id = Some(id);
        Ok(())
    }
    fn wave_complete(&mut self) -> Result<()> {
        if !self.active() || !self.queue.is_empty() || !self.actors.is_empty() {
            return Ok(());
        }
        self.completed_waves += 1;
        self.phase(Phase::WaveComplete)?;
        self.event(
            "waveCompleted",
            format!(
                "Wave {} completed after all acknowledged enemies were killed",
                self.state.wave_number
            ),
        )?;
        if !self.config.endless
            && self.completed_waves >= self.config.rounds as u32 * self.config.waves.len() as u32
        {
            return self.end(Phase::Victory, "All configured rounds completed");
        }
        self.phase(Phase::Intermission)?;
        self.state.phase_deadline_ms =
            Some(self.state.elapsed_ms + self.config.intermission_ms as u64);
        Ok(())
    }
    fn advance(&mut self, milliseconds: u32) -> Result<()> {
        if !self.started || self.terminal() {
            return invalid("Time advancement requires a started, unfinished simulation");
        }
        if milliseconds > 60000 {
            return invalid("Advance at most 60000 ms per command");
        }
        let target = self.state.elapsed_ms + milliseconds as u64;
        if target > MAX_CLOCK_MS {
            return invalid("Simulation is bounded to 24 hours");
        }
        loop {
            let timeout = self
                .actors
                .values()
                .map(|a| {
                    if a.status == ActorStatus::Pending {
                        a.requested_at_ms + self.config.spawn_timeout_ms as u64
                    } else {
                        a.last_progress_ms + self.config.stuck_timeout_ms as u64
                    }
                })
                .min();
            let spawn = if self.active()
                && !self.queue.is_empty()
                && self.actors.len() < self.config.max_alive as usize
            {
                Some(self.spawn_due.max(self.state.elapsed_ms))
            } else {
                None
            };
            let next = [self.state.phase_deadline_ms, timeout, spawn]
                .into_iter()
                .flatten()
                .min();
            let Some(next) = next.filter(|next| *next <= target) else {
                break;
            };
            self.state.elapsed_ms = next;
            let expired = self
                .actors
                .values()
                .filter(|a| {
                    if a.status == ActorStatus::Pending {
                        a.requested_at_ms + self.config.spawn_timeout_ms as u64 <= next
                    } else {
                        a.last_progress_ms + self.config.stuck_timeout_ms as u64 <= next
                    }
                })
                .map(|a| a.id)
                .collect::<Vec<_>>();
            for id in expired {
                if self.actors[&id].status == ActorStatus::Alive {
                    self.end(Phase::Defeat,format!("Actor {id} made no reported progress before the stuck timeout; it was not silently killed or scored"))?;
                } else {
                    self.failed_spawn(id)?;
                }
                if self.terminal() {
                    return Ok(());
                }
            }
            if self
                .state
                .phase_deadline_ms
                .is_some_and(|deadline| deadline <= next)
            {
                match self.state.phase {
                    Phase::Preparation => {
                        self.phase(Phase::Countdown)?;
                        self.state.phase_deadline_ms = Some(next + self.config.countdown_ms as u64);
                    }
                    Phase::Countdown => self.start_wave()?,
                    Phase::Intermission => {
                        self.phase(Phase::NextWave)?;
                        self.start_wave()?;
                    }
                    _ => return invalid("Unexpected timed state"),
                }
            }
            if self.active()
                && !self.queue.is_empty()
                && self.actors.len() < self.config.max_alive as usize
                && self.spawn_due <= next
            {
                self.spawn()?;
            }
            if self.terminal() {
                return Ok(());
            }
        }
        self.state.elapsed_ms = target;
        Ok(())
    }
    fn apply(&mut self, command: &FirefightCommand) -> Result<()> {
        if self.terminal() {
            return invalid("Simulation already ended");
        }
        if !self.started && !matches!(command, FirefightCommand::Start {}) {
            return invalid("Start the simulation first");
        }
        match *command {
            FirefightCommand::Start {} => {
                if self.started {
                    return invalid("Simulation is already started");
                }
                self.started = true;
                self.state.phase_deadline_ms = Some(self.config.preparation_ms as u64);
                self.event("preparation", "Starting offline authoring simulation")?;
                if !self.config.starting_equipment.is_empty() {
                    self.event(
                        "startingEquipmentRequested",
                        format!(
                            "Authoring intent only: {:?}",
                            self.config.starting_equipment
                        ),
                    )?;
                }
                self.advance(0)
            }
            FirefightCommand::Advance { milliseconds } => self.advance(milliseconds),
            FirefightCommand::SpawnFailed { actor_id } => self.failed_spawn(actor_id),
            FirefightCommand::SpawnSucceeded { actor_id } => {
                let actor = self.actors.get_mut(&actor_id).ok_or_else(|| {
                    SparkError::Invalid("Unknown/stale spawn acknowledgement".into())
                })?;
                if actor.status != ActorStatus::Pending {
                    return invalid("Spawn was already acknowledged");
                }
                actor.status = ActorStatus::Alive;
                actor.last_progress_ms = self.state.elapsed_ms;
                self.state.spawned_enemies += 1;
                self.event(
                    "actorActivated",
                    format!("Virtual actor {actor_id} acknowledged"),
                )?;
                self.events.last_mut().unwrap().actor_id = Some(actor_id);
                Ok(())
            }
            FirefightCommand::ActorProgress { actor_id } => {
                let actor = self
                    .actors
                    .get_mut(&actor_id)
                    .ok_or_else(|| SparkError::Invalid("Unknown actor progress event".into()))?;
                if actor.status != ActorStatus::Alive {
                    return invalid("Pending actors cannot report progress");
                }
                actor.last_progress_ms = self.state.elapsed_ms;
                Ok(())
            }
            FirefightCommand::ActorKilled { actor_id } => {
                let actor = self.actors.get(&actor_id).ok_or_else(|| {
                    SparkError::Invalid(
                        "Unknown or already-dead actor ID; no duplicate score awarded".into(),
                    )
                })?;
                if actor.status != ActorStatus::Alive {
                    return invalid("Unacknowledged spawns cannot be killed or scored");
                }
                let enemy = self
                    .config
                    .enemies
                    .iter()
                    .find(|e| e.id == actor.enemy_id)
                    .unwrap();
                let wave = &self.config.waves
                    [(self.state.wave_number as usize - 1) % self.config.waves.len()];
                let points = enemy.points as u64 * wave.score_multiplier_milli as u64 / 1000;
                self.state.score += points;
                self.state.kills += 1;
                self.actors.remove(&actor_id);
                self.event(
                    "actorKilled",
                    format!(
                        "Virtual actor {actor_id}: +{points}; total score {}",
                        self.state.score
                    ),
                )?;
                self.events.last_mut().unwrap().actor_id = Some(actor_id);
                self.wave_complete()
            }
            FirefightCommand::PlayerDown { player } => {
                if !self.started {
                    return invalid("Start the simulation first");
                }
                let alive = self
                    .state
                    .players_alive
                    .get_mut(player as usize)
                    .ok_or_else(|| SparkError::Invalid("Player index out of bounds".into()))?;
                if !*alive {
                    return invalid("Player is already down");
                }
                *alive = false;
                self.event(
                    "playerDown",
                    format!(
                        "Player {player} is down; {} shared respawns remain",
                        self.state.team_lives
                    ),
                )?;
                if !self.state.players_alive.iter().any(|a| *a) && self.state.team_lives == 0 {
                    self.end(
                        Phase::Defeat,
                        "All players down with no shared respawns remaining",
                    )
                } else {
                    Ok(())
                }
            }
            FirefightCommand::RespawnPlayer { player }
            | FirefightCommand::RevivePlayer { player } => {
                if !self.started {
                    return invalid("Start the simulation first");
                }
                let revive = matches!(command, FirefightCommand::RevivePlayer { .. });
                let alive = self
                    .state
                    .players_alive
                    .get(player as usize)
                    .ok_or_else(|| SparkError::Invalid("Player index out of bounds".into()))?;
                if *alive {
                    return invalid("Player is already alive");
                }
                if revive
                    && (!self.config.allow_revives || !self.state.players_alive.iter().any(|a| *a))
                {
                    return invalid("Revive requires configured revives and a living teammate");
                }
                if !revive && self.state.team_lives == 0 {
                    return invalid("No shared respawns remain");
                }
                if !revive {
                    self.state.team_lives -= 1;
                }
                self.state.players_alive[player as usize] = true;
                self.event(
                    if revive {
                        "playerRevived"
                    } else {
                        "playerRespawned"
                    },
                    format!(
                        "Player {player} alive; {} shared respawns remain",
                        self.state.team_lives
                    ),
                )
            }
            FirefightCommand::Abort {} => self.end(Phase::Defeat, "Simulation aborted by author"),
        }
    }
    fn report(mut self, preview: bool) -> Result<SimulationReport> {
        self.state.actors = self.actors.into_values().collect();
        self.state.queued_enemies = self.queue.len() as u16;
        Ok(SimulationReport{schema_version:SCHEMA_VERSION,scope:"authoringSimulationOnly".into(),runtime_integrated:false,gameplay_verified:false,config_sha256:format!("{:x}",Sha256::digest(serde_json::to_vec(self.config)?)),state:self.state,events:self.events,diagnostics:vec![
            if preview{"This preview scripts successful virtual spawn acknowledgements and kills. It tests rules, not AI or a game engine."}else{"Commands were replayed in a deterministic offline simulation. No game actor or network packet was observed."}.into(),
            "No Halo script/tag generation or runtime Firefight bridge is implemented. Spawn zones still require collision, navigation and gameplay validation. Revive/equipment/supply events are authoring intents only.".into(),
            "MCC Halo1 campaign co-op is a separate two-player target; authored player counts do not expand runtime limits or synchronize arbitrary multiplayer AI.".into()]})
    }
}
pub fn simulate(
    config: &FirefightConfig,
    commands: &[FirefightCommand],
) -> Result<SimulationReport> {
    validate(config)?;
    if commands.len() > MAX_COMMANDS {
        return invalid("Simulation command count exceeds 4096");
    }
    let mut director = Director::new(config);
    for command in commands {
        director.apply(command)?;
    }
    director.report(false)
}
pub fn preview(config: &FirefightConfig, completed_waves: u16) -> Result<SimulationReport> {
    validate(config)?;
    if !(1..=8).contains(&completed_waves) {
        return invalid("Preview 1-8 waves at a time");
    }
    let mut director = Director::new(config);
    director.apply(&FirefightCommand::Start {})?;
    for _ in 0..20000 {
        if director.terminal() || director.completed_waves >= completed_waves as u32 {
            return director.report(true);
        }
        let pending = director
            .actors
            .values()
            .filter(|a| a.status == ActorStatus::Pending)
            .map(|a| a.id)
            .collect::<Vec<_>>();
        for actor_id in pending {
            director.apply(&FirefightCommand::SpawnSucceeded { actor_id })?;
        }
        let alive = director
            .actors
            .values()
            .filter(|a| a.status == ActorStatus::Alive)
            .map(|a| a.id)
            .collect::<Vec<_>>();
        for actor_id in alive {
            director.apply(&FirefightCommand::ActorKilled { actor_id })?;
            if director.terminal() {
                break;
            }
        }
        if director.terminal() || director.completed_waves >= completed_waves as u32 {
            return director.report(true);
        }
        let next = director
            .state
            .phase_deadline_ms
            .unwrap_or(director.spawn_due.max(director.state.elapsed_ms));
        director.advance(next.saturating_sub(director.state.elapsed_ms).min(60000) as u32)?;
    }
    invalid("Preview step budget exceeded; reduce wave counts or complexity")
}
