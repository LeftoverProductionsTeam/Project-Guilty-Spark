//! Bounded, source-only mission/cinematic/server/playtest authoring.
//!
//! These records preserve creator intent alongside a project; none of them
//! are a compiled script, game server command, or proof of gameplay.
use crate::{invalid, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub const STUDIO_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreatorStudio {
    pub schema_version: u32,
    pub missions: Vec<MissionBeat>,
    pub shots: Vec<CameraShot>,
    pub server: ServerPlan,
    pub playtests: Vec<PlaytestRecord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub machinima: Option<MachinimaSettings>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub engine_machinima:Option<EngineMachinima>,
}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct EngineMachinima{pub enabled:bool,pub playback:String,#[serde(default)]pub camera_id:Option<String>,#[serde(default)]pub auto_start:bool}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MissionBeat {
    pub id: String,
    pub title: String,
    pub objective: String,
    pub trigger: String,
    pub encounter_name: String,
    #[serde(default)]
    pub trigger_ref: Option<String>,
    #[serde(default)]
    pub timer_seconds: Option<u32>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CameraShot {
    pub id: String,
    pub name: String,
    pub duration_ms: u32,
    pub camera_position: [f32; 3],
    pub look_at: [f32; 3],
    pub fov: f32,
    pub subtitle: String,
    #[serde(default)]
    pub camera_marker: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub roll: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub easing: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MachinimaSettings {
    pub fps: u32,
    pub aspect: String,
    pub thirds: bool,
    pub safe_frame: bool,
    pub center: bool,
    pub show_path: bool,
    pub loop_playback: bool,
    pub speed: f32,
    pub depth_of_field: bool,
    pub focus_distance: f32,
    pub blur: f32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerPlan {
    pub name: String,
    /// Only the stock CE dedicated server profile has a validated exporter.
    pub runtime: String,
    pub max_players: u8,
    /// Private-by-default; deliberately no password/credential storage.
    pub public_listing: bool,
    pub rotation: Vec<MapCycleEntry>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub game_types: Vec<GameTypeDesign>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MapCycleEntry {
    pub id: String,
    pub map: String,
    pub game_variant: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameTypeDesign {
    pub id: String,
    pub name: String,
    pub base_variant: String,
    pub team_play: bool,
    pub score_limit: u16,
    pub time_limit_minutes: u16,
    pub respawn_seconds: u8,
    pub friendly_fire: bool,
    pub starting_equipment: String,
    pub special_rules: String,
    pub native_status: String,
    pub native_evidence: String,
    pub notes: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlaytestRecord {
    pub id: String,
    pub case_id: String,
    pub target: String,
    pub verdict: String,
    pub performed_at: String,
    pub evidence: String,
    pub notes: String,
    /// This is manually reported evidence, never automatic gameplay proof.
    pub manually_reported: bool,
}

fn bounded(s: &str, max: usize) -> bool {
    s.len() <= max && !s.chars().any(char::is_control)
}
fn valid_id(s: &str) -> bool {
    !s.is_empty() && s.len() <= 72 && s.bytes().all(|x| x.is_ascii_alphanumeric() || x == b'-' || x == b'_')
}
fn script_ident(s:&str) -> bool {
    !s.is_empty() && s.len() <= 31 && s.bytes().next().is_some_and(|c|c.is_ascii_alphabetic()||c==b'_') &&
    s.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'_')
}
fn server_token(s: &str) -> bool {
    !s.is_empty() && s.len() <= 64 && s.bytes().all(|x| x.is_ascii_alphanumeric() || x == b'-' || x == b'_')
}

fn variant_token(s: &str) -> bool {
    !s.trim().is_empty() && s.len() <= 64 && s.bytes().all(|x| x.is_ascii_alphanumeric() || x == b'-' || x == b'_' || x == b' ')
}

impl CreatorStudio {
    pub fn validate(&self) -> Result<()> {
        if let Some(engine)=&self.engine_machinima{
            if !["fixed","sequence"].contains(&engine.playback.as_str())||engine.camera_id.as_ref().is_some_and(|id|!valid_id(id)){return invalid("Invalid game-native machinima settings");}
            if engine.enabled&&(self.shots.is_empty()||self.shots.len()>64||engine.camera_id.as_ref().is_some_and(|id|!self.shots.iter().any(|s|&s.id==id))){return invalid("An engine take needs 1–64 camera keys and an existing selected camera");}
        }
        if self.schema_version != STUDIO_SCHEMA_VERSION
            || self.missions.len() > 128 || self.shots.len() > 256
            || self.playtests.len() > 500 || self.server.rotation.len() > 128 || self.server.game_types.len() > 64
        {
            return invalid("Unsupported Creator Studio version or collection limit");
        }
        let mut ids = HashSet::new();
        if let Some(m) = &self.machinima {
            if ![24, 30, 60].contains(&m.fps)
                || !["16:9", "2.39:1", "1:1", "9:16"].contains(&m.aspect.as_str())
                || !m.speed.is_finite() || !(0.25..=2.0).contains(&m.speed)
                || !m.focus_distance.is_finite() || !(0.1..=4096.0).contains(&m.focus_distance)
                || !m.blur.is_finite() || !(0.0..=1.0).contains(&m.blur)
            { return invalid("Invalid Machinima lens or playback settings"); }
        }
        for beat in &self.missions {
            if !valid_id(&beat.id) || !ids.insert(&beat.id)
                || !bounded(&beat.title, 120) || !bounded(&beat.objective, 2048)
                || !bounded(&beat.encounter_name, 128)
                || !["manual", "triggerVolume", "encounterCleared", "timer"].contains(&beat.trigger.as_str())
                || beat.trigger_ref.as_deref().is_some_and(|s| !s.is_empty() && !script_ident(s))
                || beat.timer_seconds.is_some_and(|n| n>600)
            { return invalid("Invalid Creator Studio mission beat"); }
        }
        for shot in &self.shots {
            if !valid_id(&shot.id) || !ids.insert(&shot.id)
                || !bounded(&shot.name, 120) || !bounded(&shot.subtitle, 2048)
                || !(100..=600_000).contains(&shot.duration_ms)
                || !(10.0..=140.0).contains(&shot.fov)
                || shot.roll.is_some_and(|n| !n.is_finite() || n.abs()>180.0)
                || shot.easing.as_deref().is_some_and(|s| !["linear", "smooth", "cut"].contains(&s))
                || !shot.camera_position.iter().chain(shot.look_at.iter())
                    .all(|n| n.is_finite() && n.abs() <= 4096.0)
                || shot.camera_marker.as_deref().is_some_and(|s| !s.is_empty() && !script_ident(s))
            { return invalid("Invalid Creator Studio camera shot"); }
        }
        let server = &self.server;
        if !bounded(&server.name, 63) || server.name.trim().is_empty()
            || server.name.contains('"') || server.name.contains('\\')
            || !["haloCustomEdition", "haloPC", "haloDemo", "mcc", "openCE", "chupathingyCE"].contains(&server.runtime.as_str())
            || !(1..=16).contains(&server.max_players)
        { return invalid("Invalid Creator Studio server plan"); }
        let mut names = HashSet::new();
        for game in &server.game_types {
            if !valid_id(&game.id) || !ids.insert(&game.id) || !variant_token(&game.name)
                || !names.insert(game.name.to_ascii_lowercase())
                || !["slayer","ctf","oddball","king","race","juggernaut","assault"].contains(&game.base_variant.as_str())
                || game.score_limit > 1000 || game.time_limit_minutes > 180 || game.respawn_seconds > 120
                || !["mapDefault","rockets","snipers","custom"].contains(&game.starting_equipment.as_str())
                || !["standard","infectionConcept","firefightConcept"].contains(&game.special_rules.as_str())
                || !["draft","userConfirmedInGame"].contains(&game.native_status.as_str())
                || !bounded(&game.native_evidence,180) || game.native_evidence.contains('<') || game.native_evidence.contains('>')
                || !bounded(&game.notes,1000)
                || (game.native_status == "userConfirmedInGame" && game.native_evidence.trim().is_empty())
            { return invalid("Invalid creator game type design"); }
        }
        for entry in &server.rotation {
            if !valid_id(&entry.id) || !ids.insert(&entry.id)
                || !server_token(&entry.map) || !variant_token(&entry.game_variant)
            { return invalid("Unsafe server map/variant token; only letters, numbers, hyphen, underscore permitted"); }
        }
        for record in &self.playtests {
            if !valid_id(&record.id) || !ids.insert(&record.id)
                || !bounded(&record.case_id, 120) || record.case_id.trim().is_empty()
                || !bounded(&record.target, 120) || !bounded(&record.performed_at, 50)
                || !bounded(&record.evidence, 2048) || !bounded(&record.notes, 4096)
                || !["notRun", "pass", "fail", "blocked"].contains(&record.verdict.as_str())
                || (record.verdict == "pass" && (!record.manually_reported || record.evidence.trim().is_empty()))
            { return invalid("Invalid Creator Studio playtest record; PASS requires manual evidence"); }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn studio() -> CreatorStudio {
        CreatorStudio {
            schema_version: 1, missions: vec![], shots: vec![], playtests: vec![], machinima: None,engine_machinima:None,
            server: ServerPlan { name: "LAN Test".into(), runtime: "haloCustomEdition".into(),
                max_players: 8, public_listing: false, rotation: vec![], game_types: vec![] },
        }
    }
    #[test]
    fn never_accepts_server_command_injection() {
        let mut doc = studio();
        doc.server.rotation.push(MapCycleEntry { id:"first".into(), map:"bloodgulch\nsv_public 1".into(), game_variant:"slayer".into() });
        assert!(doc.validate().is_err());
        doc.server.rotation[0].map="bloodgulch".into();
        assert!(doc.validate().is_ok());
        doc.server.name="hello\"\nsv_public 1".into();
        assert!(doc.validate().is_err());
    }
    #[test]
    fn game_type_design_persistence_is_backward_compatible() {
        let original=studio();
        let value=serde_json::to_value(&original).unwrap();
        let mut old=value.clone();
        old.get_mut("server").unwrap().as_object_mut().unwrap().remove("gameTypes");
        let decoded: CreatorStudio=serde_json::from_value(old).unwrap();
        assert!(decoded.server.game_types.is_empty());
        assert!(decoded.validate().is_ok());
        let mut corrupted=original;
        corrupted.server.game_types.push(GameTypeDesign {id:"custom".into(),name:"Zombie Apocalypse".into(),
            base_variant:"slayer".into(),team_play:false,score_limit:25,time_limit_minutes:15,
            respawn_seconds:5,friendly_fire:false,starting_equipment:"mapDefault".into(),
            special_rules:"infectionConcept".into(),native_status:"userConfirmedInGame".into(),
            native_evidence:String::new(),notes:String::new()});
        assert!(corrupted.validate().is_err());
    }
    #[test]
    fn pass_requires_manual_evidence() {
        let mut doc = studio();
        doc.playtests.push(PlaytestRecord { id:"one".into(), case_id:"QA-001".into(),
            target:"Halo CE".into(), verdict:"pass".into(), performed_at:"".into(),
            evidence:"".into(), notes:"".into(), manually_reported:true });
        assert!(doc.validate().is_err());
        doc.playtests[0].evidence="Observed in real Halo CE session".into();
        assert!(doc.validate().is_ok());
    }
}
