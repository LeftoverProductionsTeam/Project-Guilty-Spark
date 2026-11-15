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
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct MissionSoundCue {
    pub import_id:String,
    pub sound_path:String,
    pub phase:String,
    pub gain:f32,
    pub delay_ms:u32,
    pub caption:String,
}
impl MissionSoundCue {
    fn valid(&self)->bool {
        valid_id(&self.import_id)&&!self.sound_path.is_empty()&&self.sound_path.len()<=255&&
        self.sound_path.bytes().next().is_some_and(|c|c.is_ascii_alphanumeric()||c==b'_')&&
        self.sound_path.bytes().all(|c|c.is_ascii_alphanumeric()||b"_ ./-".contains(&c))&&
        self.sound_path.split('/').all(|part|!part.is_empty()&&part!="."&&part!="..")&&
        matches!(self.phase.as_str(),"start"|"complete")&&self.gain.is_finite()&&(0.0..=1.0).contains(&self.gain)&&
        self.delay_ms<=60000&&self.caption.encode_utf16().count()<=254&&!self.caption.contains('%')&&!self.caption.chars().any(char::is_control)
    }
    fn included(&self,project:&crate::project::Project)->bool {
        self.valid()&&project.native_asset_imports.iter().filter(|binding|binding.id==self.import_id).count()==1&&
        project.native_asset_imports.iter().any(|binding|binding.id==self.import_id&&binding.tag_class=="snd!"&&binding.native_path.replace('\\',"/")==self.sound_path)
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
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
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub hud_objective:Option<bool>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub hud_text:Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub checkpoint:Option<bool>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub complete_mission:Option<bool>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub condition_volume:Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub sound_cue:Option<MissionSoundCue>,
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
    #[serde(default, skip_serializing_if = "is_false")]
    pub green_screen: bool,
    pub focus_distance: f32,
    pub blur: f32,
}
fn is_false(value: &bool) -> bool { !*value }

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


pub const NATIVE_MISSION_BINDING:&str="; Spark native mission configuration: ";
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct NativeMissionBinding {
    pub schema_version:u32,
    pub missions:Vec<MissionBeat>,
    pub activation:String,
    pub source_sha256:String,
}
/// Validate the generated module's intent and bytes, not a second HSC writer.
/// Editable mission drafts may be saved while stale; native builds must stop.
pub fn native_mission_binding(project:&crate::project::Project,doc:&crate::quickforge::QuickForgeDocument)->Result<Option<NativeMissionBinding>> {
    let owned=doc.logic.iter().flat_map(|logic|&logic.handwritten_sources)
        .filter(|source|source.content.starts_with(NATIVE_MISSION_BINDING)).collect::<Vec<_>>();
    if owned.is_empty(){return Ok(None);}
    if owned.len()!=1 || !owned[0].filename.eq_ignore_ascii_case("gs_mission.hsc") {
        return invalid("Generated mission binding is duplicated or renamed. Preserve the modules and reconcile them in Logic / Events before building");
    }
    if doc.game_mode!="campaign" || doc.native.is_some() ||
        !matches!(doc.runtime_id,crate::runtime::RuntimeId::MccSteam|crate::runtime::RuntimeId::HaloCustomEdition|crate::runtime::RuntimeId::ChupathingyCe) {
        return invalid("Prepared mission source requires an editable Campaign / scripted solo target. Preserve or explicitly remove the mission module before changing its build workflow");
    }
    let (header,body)=owned[0].content.split_once('\n').ok_or_else(||crate::SparkError::Invalid("Prepared mission has no source body; preserve it before preparing again".into()))?;
    let binding:NativeMissionBinding=serde_json::from_str(header.trim_end_matches('\r').strip_prefix(NATIVE_MISSION_BINDING).unwrap())
        .map_err(|_|crate::SparkError::Invalid("Prepared mission binding is invalid; preserve the source module before preparing again".into()))?;
    if binding.schema_version!=1 || !["manual","startup"].contains(&binding.activation.as_str()) ||
        binding.source_sha256.len()!=64 || !binding.source_sha256.bytes().all(|value|value.is_ascii_hexdigit()) {
        return invalid("Unsupported prepared mission binding or source hash");
    }
    let current=&project.studio.as_ref().ok_or_else(||crate::SparkError::Invalid("Prepared mission has no originating Creator Studio data".into()))?.missions;
    if binding.missions.is_empty() || &binding.missions!=current {
        return invalid("Mission beats changed after preparing native source. In Creator Studio, prepare the mission again; the old module and previous-good build remain intact");
    }
    if !crate::studio_native::digest(body.as_bytes()).eq_ignore_ascii_case(&binding.source_sha256) {
        return invalid("Prepared mission HaloScript was edited. Preserve/export the handwritten module in Logic / Events before explicit regeneration; no source was replaced");
    }
    for (index,beat) in binding.missions.iter().enumerate() {
        if beat.complete_mission==Some(true) && (index+1!=binding.missions.len()||beat.checkpoint==Some(true)||beat.condition_volume.is_some()) {
            return invalid("Native level completion must be the final beat, without a checkpoint or optional condition on the same beat");
        }
        if beat.sound_cue.as_ref().is_some_and(|cue|!cue.included(project)) {
            return invalid(format!("Mission '{}' needs its exact included native sound; choose the imported sound again before preparing",beat.title));
        }
        if let Some(name)=&beat.condition_volume {
            if !script_ident(name)||!doc.logic.as_ref().is_some_and(|logic|logic.triggers.iter().any(|trigger|crate::native_logic::trigger_name(trigger)==*name)) {
                return invalid(format!("Mission '{}' references missing optional-condition volume '{}'",beat.title,name));
            }
        }
        match beat.trigger.as_str() {
            "triggerVolume"=>{
                let name=beat.trigger_ref.as_deref().unwrap_or("");
                if !doc.logic.as_ref().is_some_and(|logic|logic.triggers.iter().any(|trigger|crate::native_logic::trigger_name(trigger)==name)) {
                    return invalid(format!("Mission '{}' references missing source volume '{}'. Name or select a volume in Logic / Events",beat.title,name));
                }
            },
            "encounterCleared"=>{
                let mut parts=beat.encounter_name.split('/');
                let name=parts.next().unwrap_or("");
                let squad=parts.next();
                let group=doc.campaign_encounters.iter().find(|entry|entry.name==name);
                if parts.next().is_some() || squad.is_some_and(|name|name!="source_squad") || group.is_none() {
                    return invalid(format!("Mission '{}' references missing campaign encounter/squad '{}'",beat.title,beat.encounter_name));
                }
                if group.unwrap().start_active {
                    return invalid(format!("Mission '{}' owns ai_place for '{}'; disable initial actor creation before building this mission",beat.title,name));
                }
            },
            "timer" if !beat.timer_seconds.is_some_and(|seconds|(1..=600).contains(&seconds))=>{
                return invalid("Prepared mission delay must be between 1 and 600 seconds");
            },
            "manual"|"timer"=>(),
            _=>return invalid("Prepared mission trigger is unsupported"),
        }
    }
    let _=native_mission_hud(&binding)?;
    Ok(Some(binding))
}
/// Native ScriptType values follow the existing Invader scenario definition.
/// Presence/type checks are independent readback, not gameplay acceptance.
pub fn verify_native_mission(binding:&NativeMissionBinding,map:&crate::maps::MapInspection,cache:&std::path::Path)->Result<()> {
    if map.header.scenario_type!=0{return invalid("Compiled mission is not a native singleplayer scenario");}
    let mut expected=vec![("gs_mission".to_string(),1u16)];
    if binding.activation=="startup"{expected.push(("gs_mission_bootstrap".into(),0));}
    for (index,beat) in binding.missions.iter().enumerate() {
        if beat.trigger=="manual"{expected.push((format!("gs_complete_{}",index+1),3));}
    }
    for (name,kind) in expected {
        let scripts=map.scripts.iter().filter(|script|script.name==name).collect::<Vec<_>>();
        if scripts.len()!=1 || scripts[0].script_type!=kind {
            return invalid(format!("Compiled mission script is missing, ambiguous or has the wrong native type: {name}"));
        }
    }
    for beat in &binding.missions {
        if let Some(cue)=&beat.sound_cue {
            let found=map.tags.iter().filter(|tag|tag.class=="snd!"&&tag.path.replace('\\',"/")==cue.sound_path).count();
            if found!=1{return invalid(format!("Compiled mission sound is missing or ambiguous: {}",cue.sound_path));}
        }
    }
    if let Some(hud)=native_mission_hud(binding)? {
        let expected=format!("{}/gs_mission_messages",map.scenario_path.replace('\\',"/"));
        let tags=map.tags.iter().filter(|tag|tag.class=="hmt "&&tag.path.replace('\\',"/").eq_ignore_ascii_case(&expected)).collect::<Vec<_>>();
        if tags.len()!=1||tags[0].external||tags[0].data_offset.is_none(){return invalid("Compiled mission HUD dependency is missing, ambiguous or external");}
        let actual=crate::maps::scenario_hud_messages(cache,map)?.ok_or_else(||crate::SparkError::Invalid("Compiled mission has no scenario HUD-message reference".into()))?;
        if actual.tag_id!=tags[0].id||!actual.tag_path.replace('\\',"/").eq_ignore_ascii_case(&expected) {
            return invalid("Compiled mission references a different HUD-message tag");
        }
        crate::firefight::verify_preserving_hud(&hud,&actual)?;
    }
    Ok(())
}
/// Share the standard HMT source writer; never invent an engine HUD payload.
pub fn native_mission_hud(binding:&NativeMissionBinding)->Result<Option<crate::firefight::NativeHudAppendPlan>> {
    let mut messages=vec![];
    for (index,beat) in binding.missions.iter().enumerate() {
        if let Some(cue)=&beat.sound_cue {
            if !cue.valid(){return invalid("Invalid native mission radio cue");}
            if !cue.caption.is_empty(){messages.push(crate::firefight::NativeRoundHudMessage{name:format!("gs_mission_cue_{}",index+1),text:cue.caption.clone()});}
        }
        if beat.hud_objective!=Some(true){continue;}
        let text=beat.hud_text.clone().unwrap_or_default();
        if text.is_empty()||text.encode_utf16().count()>254||text.contains('%')||text.chars().any(char::is_control) {
            return invalid(format!("Mission '{}' HUD text needs 1–254 UTF-16 characters without percent/control characters; direction notes remain separate",beat.title));
        }
        messages.push(crate::firefight::NativeRoundHudMessage{name:format!("gs_mission_obj_{}",index+1),text});
    }
    if messages.is_empty(){return Ok(None);}
    crate::firefight::format_native_hud_append(messages,None,&[])
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
                || beat.condition_volume.as_deref().is_some_and(|s| !s.is_empty() && !script_ident(s))
                || beat.sound_cue.as_ref().is_some_and(|cue|!cue.valid())
                || beat.timer_seconds.is_some_and(|n| n>600)
                || beat.hud_text.as_ref().is_some_and(|text|text.encode_utf16().count()>254||text.chars().any(char::is_control))
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
    fn greenscreen_is_optional_editor_metadata_and_survives_saved_source() {
        let old=serde_json::json!({"fps":30,"aspect":"16:9","thirds":true,"safeFrame":true,"center":false,"showPath":true,"loopPlayback":false,"speed":1.,"depthOfField":false,"focusDistance":20.,"blur":0.25});
        let mut settings:MachinimaSettings=serde_json::from_value(old.clone()).unwrap();
        assert!(!settings.green_screen);assert_eq!(serde_json::to_value(&settings).unwrap(),old);
        settings.green_screen=true;let mut document=studio();document.machinima=Some(settings);document.validate().unwrap();
        let value=serde_json::to_value(&document).unwrap();assert_eq!(value["machinima"]["greenScreen"],true);
        let restored:CreatorStudio=serde_json::from_value(value).unwrap();assert!(restored.machinima.unwrap().green_screen);
        let mut invalid=old;invalid["greenScreen"]=serde_json::json!("true");assert!(serde_json::from_value::<MachinimaSettings>(invalid).is_err());
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
    #[test]
    fn optional_objective_condition_survives_project_save_without_changing_legacy_fields() {
        let old=serde_json::json!({"id":"objective","title":"Containment","objective":"Contain the outbreak","trigger":"encounterCleared","encounterName":"be_flood"});
        let original:MissionBeat=serde_json::from_value(old.clone()).unwrap();
        assert!(original.condition_volume.is_none());assert!(serde_json::to_value(&original).unwrap().get("conditionVolume").is_none());
        let mut value=old;value["conditionVolume"]=serde_json::json!("be_containment");
        let mut document=studio();document.missions.push(serde_json::from_value(value).unwrap());document.validate().unwrap();
        let saved=serde_json::to_vec(&document).unwrap();let restored:CreatorStudio=serde_json::from_slice(&saved).unwrap();
        assert_eq!(restored.missions[0].condition_volume.as_deref(),Some("be_containment"));
        document.missions[0].condition_volume=Some("unsafe volume".into());assert!(document.validate().is_err());
    }

    #[test]
    fn mission_radio_preserves_import_ownership_captions_and_saved_source() {
        let beat:MissionBeat=serde_json::from_value(serde_json::json!({"id":"radio","title":"Evacuation","objective":"Defend","trigger":"manual","encounterName":"",
            "soundCue":{"importId":"12345678-1234-4234-8234-123456789012","soundPath":"gs_assets_owned/sound/radio distress","phase":"complete","gain":0.5,"delayMs":500,"caption":"Evacuation ready."}})).unwrap();
        let mut document=studio();document.missions.push(beat.clone());document.validate().unwrap();
        let restored:CreatorStudio=serde_json::from_slice(&serde_json::to_vec(&document).unwrap()).unwrap();assert_eq!(restored.missions,document.missions);
        let mut project=crate::project::Project::new("Radio ownership");
        let binding=crate::native_asset_imports::Binding{id:beat.sound_cue.as_ref().unwrap().import_id.clone(),source_project_id:uuid::Uuid::new_v4().to_string(),
            source_sha256:"a".repeat(64),tag_id:42,tag_class:"snd!".into(),tag_path:"sound/radio distress".into(),
            native_path:beat.sound_cue.as_ref().unwrap().sound_path.clone(),receipt_sha256:"b".repeat(64),file_count:1};
        project.native_asset_imports.push(binding.clone());project.studio=Some(document.clone());
        let mut doc=crate::quickforge::create_arena("Radio","customBlank").unwrap();doc.game_mode="campaign".into();
        project.quick_forge=Some(doc.clone());
        assert!(beat.sound_cue.as_ref().unwrap().included(&project));assert!(crate::native_asset_imports::is_used(&project,&binding));
        let body="; source identity only, not compiler evidence\n";
        let prepared=NativeMissionBinding{schema_version:1,missions:vec![beat.clone()],activation:"manual".into(),source_sha256:crate::studio_native::digest(body.as_bytes())};
        let content=format!("{}{}\n{}",NATIVE_MISSION_BINDING,serde_json::to_string(&prepared).unwrap(),body);
        doc.logic=Some(serde_json::from_value(serde_json::json!({"schemaVersion":1,"triggers":[],"devices":[],"rules":[],"handwrittenSources":[{"filename":"gs_mission.hsc","content":content}]})).unwrap());
        assert!(native_mission_binding(&project,&doc).unwrap().is_some());
        let hud=native_mission_hud(&prepared).unwrap().unwrap();assert_eq!(hud.messages.len(),1);assert_eq!(hud.messages[0].name,"gs_mission_cue_1");
        // Synthetic readback guards only, not a compiled audio/gameplay proof.
        let mut no_caption=prepared.clone();no_caption.missions[0].sound_cue.as_mut().unwrap().caption.clear();
        let mut map:crate::maps::MapInspection=serde_json::from_value(serde_json::json!({
            "header":{"version":609,"engine":"test","name":"radio","build":"test","scenarioType":0,"fileSize":0,"declaredSize":0,"tagOffset":0,"tagSize":0,"crc32":0,"flags":0,"demoLayout":false,"compressed":false,"extended":false,"legacyTagSizeRepair":false},
            "sha256":"a".repeat(64),"tags":[],"objects":[],"mesh":crate::maps::MeshData::default(),"encounters":[],
            "scripts":[{"name":"gs_mission","scriptType":1,"returnType":4},{"name":"gs_complete_1","scriptType":3,"returnType":4}],"resources":[],"diagnostics":[],"scenarioPath":"levels/test"})).unwrap();
        let absent=std::path::Path::new("missing-unused-cache");
        assert!(verify_native_mission(&no_caption,&map,absent).unwrap_err().to_string().contains("sound is missing"));
        map.tags.push(serde_json::from_value(serde_json::json!({"id":42,"index":0,"class":"snd!","path":binding.native_path,"dataOffset":2048,"external":false,"fields":[],"references":[]})).unwrap());
        verify_native_mission(&no_caption,&map,absent).unwrap();crate::native_asset_imports::verify_compiled(&project,&map).unwrap();
        map.tags.push(map.tags[0].clone());assert!(verify_native_mission(&no_caption,&map,absent).is_err());map.tags.clear();
        assert!(crate::native_asset_imports::verify_compiled(&project,&map).unwrap_err().to_string().contains("omitted imported native asset"));
        project.native_asset_imports[0].tag_class="lsnd".into();assert!(native_mission_binding(&project,&doc).unwrap_err().to_string().contains("included native sound"));
        project.native_asset_imports[0]=binding.clone();project.native_asset_imports[0].native_path="sound/other".into();assert!(!crate::native_asset_imports::is_used(&project,&project.native_asset_imports[0]));assert!(native_mission_binding(&project,&doc).is_err());
        for path in ["../secret","/absolute","sound//radio","sound/./radio","sound/../../other","sound/\" ) (quit)"] {
            let mut invalid=document.clone();invalid.missions[0].sound_cue.as_mut().unwrap().sound_path=path.into();assert!(invalid.validate().is_err(),"{path}");
        }
        for caption in ["100%","unsafe\ntext"]{let mut invalid=document.clone();invalid.missions[0].sound_cue.as_mut().unwrap().caption=caption.into();assert!(invalid.validate().is_err());}
        let mut invalid=document;invalid.missions[0].sound_cue.as_mut().unwrap().gain=f32::NAN;assert!(invalid.validate().is_err());
        let old=serde_json::json!({"id":"legacy","title":"Start","objective":"","trigger":"manual","encounterName":""});
        let legacy:MissionBeat=serde_json::from_value(old).unwrap();assert!(legacy.sound_cue.is_none());assert!(serde_json::to_value(legacy).unwrap().get("soundCue").is_none());
    }

}
