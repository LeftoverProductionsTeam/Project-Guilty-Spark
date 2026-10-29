//! Persisted editor sound-event rehearsal; not a claim of engine mixer parity.
use crate::{invalid, Result};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SoundScene {
    pub schema_version: u32,
    pub master: f32,
    pub muted: bool,
    pub max_voices: usize,
    pub buses: BTreeMap<String, Bus>,
    pub emitters: Vec<Emitter>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bus {
    pub gain: f32,
    pub muted: bool,
    pub solo: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Emitter {
    pub id: String,
    pub name: String,
    pub tag_id: u32,
    #[serde(default)]
    pub source_project_id: Option<String>,
    #[serde(default)]
    pub source_sha256: Option<String>,
    pub pitch_range: usize,
    pub permutation: usize,
    #[serde(default = "follow_chain_default")]
    pub follow_chain: bool,
    pub event: String,
    pub bus: String,
    pub position: [f32; 3],
    pub gain: f32,
    pub pitch: f32,
    pub r#loop: bool,
    pub enabled: bool,
    pub min_distance: f32,
    pub max_distance: f32,
    pub rolloff: f32,
    pub priority: u32,
    pub cooldown_ms: u32,
    pub spatial: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub looping_source: Option<LoopingSource>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoopingSource { pub tag_id: u32, pub track: usize }
fn follow_chain_default() -> bool {
    true
}
impl SoundScene {
    pub fn validate(&self) -> Result<()> {
        let bounded = |n: f32, min: f32, max: f32| n.is_finite() && (min..=max).contains(&n);
        if self.schema_version != 1
            || !bounded(self.master, 0., 1.)
            || !(1..=32).contains(&self.max_voices)
            || self.emitters.len() > 64
            || self.buses.len() != 4
        {
            return invalid("Invalid editor audio mixer limits");
        }
        for key in ["ambience", "music", "effects", "dialogue"] {
            if self.buses.get(key).is_none_or(|b| !bounded(b.gain, 0., 1.)) {
                return invalid("Invalid editor audio bus");
            }
        }
        let mut ids = HashSet::new();
        for e in &self.emitters {
            uuid::Uuid::parse_str(&e.id)
                .map_err(|_| crate::SparkError::Invalid("Invalid sound emitter identity".into()))?;
            if e.source_project_id.is_some() != e.source_sha256.is_some() {
                return invalid("Linked sound source identity is incomplete");
            }
            if let Some(id) = &e.source_project_id {
                uuid::Uuid::parse_str(id).map_err(|_| {
                    crate::SparkError::Invalid("Invalid linked sound project".into())
                })?;
            }
            if e.source_sha256.as_ref().is_some_and(|hash| {
                hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit())
            }) {
                return invalid("Linked sound needs an exact SHA-256");
            }
            if !ids.insert(&e.id)
                || e.name.trim().is_empty()
                || e.name.chars().count() > 120
                || e.name.chars().any(char::is_control)
                || e.pitch_range > 7
                || e.permutation > 255
                || e.looping_source.as_ref().is_some_and(|source| source.track > 3)
                || !matches!(
                    e.event.as_str(),
                    "ambient"
                        | "mapStart"
                        | "manual"
                        | "weaponFire"
                        | "pickup"
                        | "explosion"
                        | "footstep"
                        | "interaction"
                )
                || !self.buses.contains_key(&e.bus)
                || e.position.iter().any(|v| !bounded(*v, -1e6, 1e6))
                || !bounded(e.gain, 0., 2.)
                || !bounded(e.pitch, -12., 12.)
                || !bounded(e.min_distance, 0.01, 10000.)
                || !bounded(e.max_distance, e.min_distance, 10000.)
                || !bounded(e.rolloff, 0., 10.)
                || e.priority > 100
                || e.cooldown_ms > 60000
            {
                return invalid("Invalid positional audio emitter");
            }
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn audio_rehearsal_roundtrips_and_rejects_invalid_buses_or_source_identity() {
        let mut document = serde_json::json!({"schemaVersion":1,"master":0.5,"muted":false,"maxVoices":24,"buses":{"ambience":{"gain":1,"muted":false,"solo":false},"music":{"gain":1,"muted":false,"solo":false},"effects":{"gain":1,"muted":false,"solo":false},"dialogue":{"gain":1,"muted":false,"solo":false}},"emitters":[{"id":uuid::Uuid::new_v4().to_string(),"name":"Wind","tagId":4,"pitchRange":0,"permutation":0,"event":"ambient","bus":"ambience","position":[1,2,3],"gain":1,"pitch":0,"loop":true,"enabled":true,"minDistance":1,"maxDistance":40,"rolloff":1,"priority":50,"cooldownMs":100,"spatial":true}]});
        let valid: SoundScene = serde_json::from_value(document.clone()).unwrap();
        valid.validate().unwrap();
        document["emitters"][0]["loopingSource"] = serde_json::json!({"tagId":7,"track":0});
        let linked: SoundScene = serde_json::from_value(document.clone()).unwrap(); linked.validate().unwrap();
        document["emitters"][0]["loopingSource"]["track"] = serde_json::json!(4);
        assert!(serde_json::from_value::<SoundScene>(document.clone()).unwrap().validate().is_err());
        document["emitters"][0]["loopingSource"] = serde_json::Value::Null;
        let mut p = crate::project::Project::new("Audio rehearsal");
        let fingerprint = p.fingerprint().unwrap();
        p.audio_preview = Some(valid);
        p.validate().unwrap();
        assert_eq!(p.fingerprint().unwrap(), fingerprint);
        let restored: crate::project::Project =
            serde_json::from_slice(&serde_json::to_vec(&p).unwrap()).unwrap();
        assert_eq!(restored.audio_preview.unwrap().emitters.len(), 1);
        document["emitters"][0]["sourceProjectId"] =
            serde_json::json!(uuid::Uuid::new_v4().to_string());
        assert!(serde_json::from_value::<SoundScene>(document.clone())
            .unwrap()
            .validate()
            .is_err());
        document["emitters"][0]["sourceProjectId"] = serde_json::Value::Null;
        document["buses"]["effects"]["gain"] = serde_json::json!(10);
        assert!(serde_json::from_value::<SoundScene>(document)
            .unwrap()
            .validate()
            .is_err());
    }
}
