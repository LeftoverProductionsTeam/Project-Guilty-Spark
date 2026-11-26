//! Bounded, source-only mission/cinematic/server/playtest authoring.
//!
//! These records preserve creator intent alongside a project; none of them
//! are a compiled script, game server command, or proof of gameplay.
use crate::{invalid, Result};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap,HashSet};

pub const STUDIO_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreatorStudio {
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub cinematic_trigger_volume:Option<String>,
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
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct MissionGuidance {
 #[serde(default,skip_serializing_if="Option::is_none")] pub flag:Option<String>,
 #[serde(default,skip_serializing_if="Option::is_none")] pub object:Option<String>,
 pub height:f32
}
impl MissionGuidance {fn target(&self)->Option<&str>{match(&self.flag,&self.object){(Some(name),None)|(None,Some(name))=>Some(name),_=>None}}}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MissionBeat {
    #[serde(default,skip_serializing_if="Option::is_none")] pub squad_number:Option<u8>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub allow_shared_presentation:Option<bool>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub guidance:Option<MissionGuidance>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub early_extraction:Option<bool>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub reset_on_deployment:Option<bool>,
    pub id: String,
    pub title: String,
    pub objective: String,
    pub trigger: String,
    pub encounter_name: String,
    #[serde(default,skip_serializing_if="Option::is_none")] pub encounter_team:Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub transport_insertion:Option<String>,
    #[serde(default)]
    pub trigger_ref: Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub weapon_path:Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub create_weapon_object:Option<String>,
    #[serde(default)]
    pub timer_seconds: Option<u32>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub minimum_survivors:Option<u16>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub escort_requires_player:Option<bool>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub escort_route:Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub escort_failure:Option<String>,
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
    pub condition_group:Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub condition_visit_during:Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub condition_outside:Option<bool>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub condition_result:Option<MissionOutcomeCondition>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub sound_cue:Option<MissionSoundCue>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub cinematic_cue:Option<MissionCinematicCue>,
}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct MissionCinematicCue {pub first_shot_id:String,pub last_shot_id:String,pub phase:String}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct MissionOutcomeCondition {pub beat_id:String,pub failed:bool}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
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
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub cinematic:Option<Vec<CameraShot>>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub cinematic_intro:Option<bool>,
}
/// Marker identity is shared with the frontend; standard scenario points only.
pub(crate) fn cinematic_markers(shots:&[CameraShot])->Result<Vec<String>> {
    let mut names=HashSet::new();
    shots.iter().enumerate().map(|(index,shot)|{
        let name=shot.camera_marker.as_deref().filter(|name|!name.is_empty()).map(str::to_owned).unwrap_or_else(||format!("gs_cs_{:03}",index+1));
        if !script_ident(&name)||!names.insert(name.to_ascii_lowercase()){return invalid("Cinematic camera names must be unique native identifiers");}
        crate::engine_machinima::camera_angles(shot)?;
        Ok(name)
    }).collect()
}
/// Authoring metadata does not replace source/geometry or compiled-cache checks.
fn supported_recovered_extraction_control(beat: &MissionBeat) -> bool {
    match beat.trigger_ref.as_deref() {
        Some("extraction_activate") => true,
        Some("extraction_pelican_activate" | "extraction_spirit_activate") => beat.squad_number.is_none(),
        _ => false,
    }
}

fn mission_scope_last(missions:&[MissionBeat],index:usize)->bool{missions[index+1..].iter().all(|other|other.squad_number!=missions[index].squad_number)}
fn validate_mission_scopes(missions:&[MissionBeat])->Result<()>{
 if missions.iter().any(|beat|beat.guidance.as_ref().is_some_and(|g|g.target().is_none_or(|name|!script_ident(name))||!g.height.is_finite()||g.height.abs()>100.)){return invalid("Mission guidance needs one native flag or object and a finite height");}
 if missions.iter().any(|beat|beat.squad_number.is_some_and(|number|!(1..=22).contains(&number))){return invalid("Squad numbers must be 1 through 22");}
 if let Some((index,beat))=missions.iter().enumerate().find(|(_,beat)|beat.early_extraction==Some(true)){
  let mut shared=missions.iter().filter(|row|row.squad_number.is_none());
  let valid_arrival=shared.next().is_some_and(|arrival|arrival.trigger=="triggerVolume"&&arrival.condition_volume.is_none()&&arrival.condition_result.is_none());
  let eligible=beat.squad_number.is_none()&&beat.trigger=="forerunnerExtractionSettled"&&mission_scope_last(missions,index)&&valid_arrival
      &&!shared.any(|row|row.cinematic_cue.is_some()||row.checkpoint==Some(true)||row.complete_mission==Some(true));
  if !eligible||missions.iter().filter(|row|row.early_extraction==Some(true)).count()!=1{return invalid("Early evacuation requires a shared mission with an unconditional first arrival volume and no cinematics, saves or level exit in later optional objectives");}
 }
 if missions.iter().enumerate().any(|(index,beat)|beat.reset_on_deployment==Some(true)&&(beat.squad_number.is_none()||beat.trigger!="forerunnerExtractionSettled"||!mission_scope_last(missions,index))){return invalid("Native deployment reset belongs to the final numbered squad settlement objective");}
 if !missions.iter().any(|beat|beat.squad_number.is_some()){return Ok(());}
 if missions.iter().any(|beat|beat.checkpoint==Some(true)||beat.complete_mission==Some(true)){return invalid("Independent squad operations cannot save or end the shared world; use a separate shared campaign");}
 for(index,beat)in missions.iter().enumerate(){
  if beat.squad_number.is_some(){
   if beat.cinematic_cue.is_some(){return invalid("Squad camera isolation is unsupported; preserve the scene in shared campaign scope");}
   if (beat.hud_objective==Some(true)||beat.sound_cue.is_some())&&beat.allow_shared_presentation!=Some(true){return invalid("Explicitly allow shared native HUD/radio presentation or keep the objective in shared scope");}
   let same=missions.iter().filter(|other|other.squad_number==beat.squad_number).collect::<Vec<_>>();
   if same.last().is_none_or(|last|last.trigger!="forerunnerExtractionSettled")||same.iter().filter(|other|other.trigger=="forerunnerExtractionSettled").count()!=1{return invalid("Every independent squad needs one final settled-extraction objective");}
  }
  for other in &missions[..index]{
   if beat.squad_number==other.squad_number{continue;}
   if matches!(beat.trigger.as_str(),"escort"|"encounterCleared")&&matches!(other.trigger.as_str(),"escort"|"encounterCleared")&&!beat.encounter_name.is_empty()&&(beat.encounter_name.eq_ignore_ascii_case(&other.encounter_name)||beat.encounter_name.to_ascii_lowercase().starts_with(&(other.encounter_name.to_ascii_lowercase()+"/"))||other.encounter_name.to_ascii_lowercase().starts_with(&(beat.encounter_name.to_ascii_lowercase()+"/"))){return invalid("Independent controllers cannot both own the same native encounter spawn");}
   if beat.create_weapon_object.as_ref().zip(other.create_weapon_object.as_ref()).is_some_and(|(a,b)|a.eq_ignore_ascii_case(b)){return invalid("Independent controllers cannot both recreate the same named weapon");}
  }
 }Ok(())
}

pub(crate) fn validate_working_mission(project:&crate::project::Project,binding:&NativeMissionBinding)->Result<()> {
    if binding.schema_version!=1||!["manual","startup"].contains(&binding.activation.as_str())||binding.source_sha256.len()!=64||!binding.source_sha256.bytes().all(|value|value.is_ascii_hexdigit()){return invalid("Unsupported prepared mission binding or source hash");}
    let studio=project.studio.as_ref().ok_or_else(||crate::SparkError::Invalid("Prepared mission has no originating Creator Studio data".into()))?;
    studio.validate()?;
    let current=&studio.missions;
    if binding.missions.is_empty() || &binding.missions!=current {
        return invalid("Mission beats changed after preparing native source. In Creator Studio, prepare the mission again; the old module and previous-good build remain intact");
    }
    if (binding.cinematic_intro.is_some()||binding.missions.iter().any(|beat|beat.cinematic_cue.is_some()))&&binding.cinematic.is_none() {
        return invalid("Prepared mission scenes are missing their reviewed camera shots");
    }
    if binding.cinematic_intro==Some(false)&&!binding.missions.iter().any(|beat|beat.cinematic_cue.is_some()){return invalid("Prepared shots have no selected mission scene; prepare the mission again");}
    if let Some(shots)=&binding.cinematic {
        let studio=project.studio.as_ref().unwrap();
        if shots.is_empty()||shots.len()>256||shots!=&studio.shots {
            return invalid("Cinematic shots changed after preparing the mission. Prepare again; the previous-good build remains intact");
        }
        if studio.engine_machinima.as_ref().is_some_and(|options|options.enabled){return invalid("Disable in-game recording before preparing a story scene; both would own the game camera");}
        cinematic_markers(shots)?;
    }
    for (index,beat) in binding.missions.iter().enumerate() {
        if beat.complete_mission==Some(true) && (index+1!=binding.missions.len()||beat.checkpoint==Some(true)||beat.condition_volume.is_some()||beat.condition_result.is_some()) {
            return invalid("Native level completion must be the final beat, without a checkpoint or optional condition on the same beat");
        }
        if beat.sound_cue.as_ref().is_some_and(|cue|!cue.included(project)) {
            return invalid(format!("Mission '{}' needs its exact included native sound; choose the imported sound again before preparing",beat.title));
        }
    }
    validate_mission_scopes(&binding.missions)?;
    let _=native_mission_hud(binding)?;
    Ok(())
}

pub const RECOVERED_MISSION_PREFIX:&str="; Spark recovered campaign mission v1";
/// Read the existing generated source's intent. The working-tag transaction pins
/// the complete file bytes, preserves native inputs, and checks the compiled map.
pub fn recovered_mission_binding(project:&crate::project::Project,source:&str)->Result<Option<NativeMissionBinding>> {recovered_mission_binding_for_module(project,source,"gs_mission.hsc",None)}
pub fn recovered_mission_binding_for_module(project:&crate::project::Project,source:&str,filename:&str,reviewed_source_sha256:Option<&str>)->Result<Option<NativeMissionBinding>> {
    let mut lines=source.splitn(3,'\n');
    if lines.next().unwrap_or("").trim_end_matches('\r')!=RECOVERED_MISSION_PREFIX{return Ok(None);}
    if source.len()>256*1024{return invalid("Recovered mission source exceeds256KiB");}
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Configuration {activation:String,forerunner:bool,missions:Vec<MissionBeat>,shots:Vec<CameraShot>,#[serde(default)]composition:Option<Composition>}
    #[derive(Deserialize)]
    #[serde(rename_all="camelCase",deny_unknown_fields)]
    struct Composition {filename:String,source_sha256:String,retained_sha256:String,retired_startups:Vec<String>,replace_extraction_callback:bool}
    let header=lines.next().unwrap_or("").trim_end_matches('\r').strip_prefix("; configuration: ")
        .ok_or_else(||crate::SparkError::Invalid("Recovered mission configuration is missing".into()))?;
    let config:Configuration=serde_json::from_str(header)?;
    let body=lines.next().filter(|body|!body.trim().is_empty()).ok_or_else(||crate::SparkError::Invalid("Recovered mission source body is missing".into()))?;
    if !["manual","startup"].contains(&config.activation.as_str()){return invalid("Unsupported recovered mission activation");}
    if let Some(composition)=&config.composition {
        let valid_module=composition.filename.strip_suffix(".hsc").is_some_and(|stem|!stem.is_empty()&&stem.len()<=31&&stem.bytes().all(|c|c.is_ascii_alphanumeric()||b"_-".contains(&c))&&!stem.eq_ignore_ascii_case("global_scripts"));
        let mut names=std::collections::BTreeSet::new();
        if !valid_module||composition.filename!=filename||composition.source_sha256.len()!=64||!composition.source_sha256.bytes().all(|c|c.is_ascii_hexdigit())||composition.retired_startups.len()>16||composition.retired_startups.iter().any(|name|!script_ident(name)||!names.insert(name.to_ascii_lowercase()))||!body.contains("\n; Spark retained module body v1\n") {return invalid("Recovered mission composition no longer matches its reviewed module ownership");}
        if reviewed_source_sha256.is_some_and(|expected|!composition.source_sha256.eq_ignore_ascii_case(expected)){return invalid("Composed mission original identity differs from the reviewed source revision");}
        let retained=body.split_once("\n; Spark retained module body v1\n").unwrap().1.split_once("\n; Spark generated mission body v1\n").ok_or_else(||crate::SparkError::Invalid("Missing composed mission body boundary".into()))?.0;if crate::studio_native::digest(retained.as_bytes())!=composition.retained_sha256{return invalid("Retained native source differs from its reviewed composition checksum");}
        if composition.replace_extraction_callback&&(!config.forerunner||!config.missions.iter().any(|beat|beat.trigger=="forerunnerExtractionSettled")){return invalid("Revised composition must retain its original Forerunner extraction callback");}
    } else if !filename.eq_ignore_ascii_case("gs_mission.hsc") {return invalid("Recovered mission source was renamed without reviewed composition ownership");}
    let scenes=config.missions.iter().any(|beat|beat.cinematic_cue.is_some());
    let binding=NativeMissionBinding {schema_version:1,missions:config.missions,activation:config.activation,
        source_sha256:crate::studio_native::digest(body.as_bytes()),cinematic:if scenes{Some(config.shots.clone())}else{None},cinematic_intro:if scenes{Some(false)}else{None}};
    validate_working_mission(project,&binding)?;
    if !config.forerunner&&binding.missions.iter().any(|beat|beat.guidance.is_some()){return invalid("Native objective waypoints require Forerunner mission export");}
    if project.studio.as_ref().is_none_or(|studio|studio.shots!=config.shots){return invalid("Recovered mission camera references changed; prepare again");}
    for (index,beat) in binding.missions.iter().enumerate() {
        if beat.trigger=="forerunnerExtractionSettled" && (!config.forerunner||!mission_scope_last(&binding.missions,index)||!supported_recovered_extraction_control(beat)||beat.condition_volume.is_some()||beat.condition_result.is_some()||beat.checkpoint==Some(true)||beat.complete_mission==Some(true)) {
            return invalid("Forerunner settlement must be the final unconditional objective on a reviewed CE solo target");
        }
    }
    Ok(Some(binding))
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
    validate_working_mission(project,&binding)?;
    if binding.missions.iter().any(|beat|beat.early_extraction==Some(true)){return invalid("Early evacuation requires reviewed CE609 working tags");}
    if binding.missions.iter().any(|beat|beat.guidance.is_some()){return invalid("Native objective waypoints require reviewed CE609 working tags. Prepare the mission against recovered source");}
    if binding.missions.iter().any(|beat|beat.transport_insertion.is_some()){return invalid("Dropship insertion needs the reviewed CE609 working-tag transport module; build/open the base map and use recovered source");}
    if binding.missions.iter().any(|beat|beat.squad_number.is_some()){return invalid("Independent squads require reviewed CE609 working tags with numbered terminals/readiness gates; preserve mission data and use the recovered source workflow");}
    if !crate::studio_native::digest(body.as_bytes()).eq_ignore_ascii_case(&binding.source_sha256) {
        return invalid("Prepared mission HaloScript was edited. Preserve/export the handwritten module in Logic / Events before explicit regeneration; no source was replaced");
    }
    for (beat_index,beat) in binding.missions.iter().enumerate() {
        if let Some(name)=&beat.condition_volume {
            if !script_ident(name)||!doc.logic.as_ref().is_some_and(|logic|logic.triggers.iter().any(|trigger|crate::native_logic::trigger_name(trigger)==*name)) {
                return invalid(format!("Mission '{}' references missing optional-condition volume '{}'",beat.title,name));
            }
        }
        if beat.create_weapon_object.is_some(){return invalid("Scheduled named weapon creation requires recovered native source; blank-map weapons currently use automatic placement");}
        match beat.trigger.as_str() {
            "triggerVolume"=>{
                let name=beat.trigger_ref.as_deref().unwrap_or("");
                if !doc.logic.as_ref().is_some_and(|logic|logic.triggers.iter().any(|trigger|crate::native_logic::trigger_name(trigger)==name)) {
                    return invalid(format!("Mission '{}' references missing source volume '{}'. Name or select a volume in Logic / Events",beat.title,name));
                }
            },
            "weaponOwned"=>{
                let path=beat.weapon_path.as_deref().unwrap_or("");
                if path.is_empty()||!doc.placements.iter().any(|p|p.tag_class=="weap"&&p.tag_path.replace('\\',"/")==path){return invalid("Mission collection needs a placed native technology weapon");}
                if doc.starting_profile.as_ref().is_some_and(|p|p.primary_weapon==path||p.secondary_weapon.as_deref()==Some(path)){return invalid("Technology must be absent from authored starting equipment");}
            },
            "forerunnerExtractionSettled"=>{
                if !matches!(doc.runtime_id,crate::runtime::RuntimeId::HaloCustomEdition|crate::runtime::RuntimeId::ChupathingyCe)||!mission_scope_last(&binding.missions,beat_index)||binding.missions.iter().filter(|b|b.squad_number==beat.squad_number&&b.trigger=="forerunnerExtractionSettled").count()!=1||beat.condition_volume.is_some()||beat.condition_result.is_some()||beat.checkpoint==Some(true)||beat.complete_mission==Some(true)||beat.trigger_ref.as_deref()!=Some("extraction_activate"){return invalid("Forerunner settlement must be the final unconditional objective on its CE campaign target");}
                crate::native_logic::validate_extraction_layout(doc,false)?;

            },
            "deviceActivated"=>{
                let name=beat.trigger_ref.as_deref().unwrap_or("");
                let bindings=doc.logic.iter().flat_map(|logic|&logic.devices).filter(|device|device.native_name.as_deref()==Some(name)).collect::<Vec<_>>();
                let placements=bindings.iter().flat_map(|device|doc.placements.iter().filter(move |placement|placement.id==device.placement_id)).collect::<Vec<_>>();
                if !script_ident(name)||bindings.len()!=1||placements.len()!=1||placements[0].tag_class!="ctrl"||!bindings[0].powered||
                    !bindings[0].initial_position.is_finite()||!(0.0..0.5).contains(&bindings[0].initial_position) {
                    return invalid("Mission terminal needs one explicitly named, powered native control with initial position below0.5; no source was changed");
                }
            },
            "encounterCleared"|"escort"=>{
                let mut parts=beat.encounter_name.split('/');
                let name=parts.next().unwrap_or("");
                let squad=parts.next();
                let group=doc.campaign_encounters.iter().find(|entry|entry.name==name);
                if parts.next().is_some() || squad.is_some_and(|name|name!="source_squad") || group.is_none() {
                    return invalid(format!("Mission '{}' references missing campaign encounter/squad '{}'",beat.title,beat.encounter_name));
                }
                if beat.trigger=="escort" {
                    let minimum=beat.minimum_survivors.unwrap_or(1);let group=group.unwrap();let (normal,insane)=group.difficulty_counts();
                    if minimum==0||minimum>32||minimum>group.count||minimum>normal||minimum>insane {
                        return invalid("Survivor minimum exceeds the authored starts or native difficulty population");
                    }
                    let destination=beat.trigger_ref.as_deref().unwrap_or("");
                    if !script_ident(destination)||!doc.logic.as_ref().is_some_and(|logic|logic.triggers.iter().any(|trigger|crate::native_logic::trigger_name(trigger)==destination)) {
                        return invalid("Survivor escort needs an existing named destination volume");
                    }
                    if binding.missions.iter().filter(|other|matches!(other.trigger.as_str(),"escort"|"encounterCleared")&&other.encounter_name.split('/').next()==Some(name)).count()!=1 {
                        return invalid("Survivor encounter needs one mission spawn owner; another beat cannot respawn the same survivors");
                    }
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
/// A recovered native mission may lack Studio metadata. Admit the existing
/// engine mode from its compiled callback/markers, never from a project label.
pub const SQUAD_OBJECTIVES_FEATURE:&str="extraction.squad_objectives.v1";
pub const SQUAD_BEGIN_FEATURE:&str="extraction.squad_begin.v1";
pub const FACTION_LANDING_ZONES_FEATURE: &str = "extraction.faction_landing_zones.v1";
pub const PELICAN_RETURN_PAD_FEATURE: &str = "extraction.pelican_return_pad.v1";
pub const HOVER_TRANSFER_FEATURE: &str = "extraction.hover_transfer.v1";
/// Native interface names from the reviewed Forerunner contract. This detects
/// required engine behavior, not mission completion, membership or gameplay.
fn squad_interface_number(name:&str,prefix:&str,suffix:&str)->Result<Option<u8>> {
    let Some(number)=name.strip_prefix(prefix).and_then(|value|value.strip_suffix(suffix)) else{return Ok(None);};
    if number.len()!=2||!number.bytes().all(|c|c.is_ascii_digit()){return invalid("Native squad bindings need their exact two-digit squad number");}
    let number=number.parse::<u8>().unwrap();
    if !(1..=22).contains(&number){return invalid("Native squad binding exceeds the reviewed Forerunner 01–22 interface range; this is not player-scale acceptance");}
    Ok(Some(number))
}
fn squad_callbacks(scripts:&[crate::maps::Script], suffix:&str)->Result<std::collections::BTreeSet<u8>> {
    let mut callbacks=std::collections::BTreeSet::new();
    for script in scripts {
        if let Some(number)=squad_interface_number(&script.name,"forerunner_squad_",suffix)? {
            // CE types 1 and 2 are dormant and continuous. Both have void return type (4).
            if !matches!(script.script_type,1|2)||script.return_type!=4||!callbacks.insert(number){
                return invalid(format!("Native squad {suffix} callbacks require unique dormant or continuous void declarations"));
            }
        }
    }
    Ok(callbacks)
}
pub fn compiled_extraction_requirements(cache:&std::path::Path,map:&crate::maps::MapInspection)->Result<Option<Vec<String>>> {
    let callbacks=map.scripts.iter().filter(|s|s.name=="forerunner_extraction_complete").collect::<Vec<_>>();
    let mut queries=std::collections::BTreeSet::new();
    for script in &map.scripts{if let Some(number)=squad_interface_number(&script.name,"forerunner_squad_","_players")?{
        if script.script_type!=3||script.return_type!=23||!queries.insert(number){return invalid("Native squad player queries require unique static object_list declarations");}
    }}
    let begins=squad_callbacks(&map.scripts,"_begin")?;
    let settled=squad_callbacks(&map.scripts,"_complete")?;
    let aborted=squad_callbacks(&map.scripts,"_aborted")?;
    let mut hover_transfer = false;
    for marker in ["gs_pelican_hover_field", "gs_spirit_hover_field"] {
        let mut matches = map.scripts.iter().filter(|script| script.name == marker);
        if let Some(script) = matches.next() {
            if script.script_type != 3 || script.return_type != 5 || matches.next().is_some() {
                return invalid("Hover transfer requires a unique static boolean marker for each opted-in aircraft");
            }
            hover_transfer = true;
        }
    }
    let has_squad_scripts=![&queries,&begins,&settled,&aborted].iter().all(|rows|rows.is_empty());
    if map.header.version!=609||map.header.scenario_type!=0||map.header.extended{
        if callbacks.is_empty()&&!has_squad_scripts&&!hover_transfer{return Ok(None);}
        return invalid("Forerunner Extraction requires a standard native CE609 solo map");
    }
    if !callbacks.is_empty()&&(callbacks.len()!=1||callbacks[0].script_type!=1){return invalid("Forerunner settled Extraction requires one dormant completion callback");}
    let markers=crate::maps::scenario_logic_readback(cache,map)?;
    let mut ready=std::collections::BTreeSet::new();
    for group in &markers.groups{if let Some(number)=squad_interface_number(&group.name,"extraction_squad_","_ready")?{if !ready.insert(number){return invalid("Native squad readiness groups must be unique");}}}
    // Terminal-only and settlement-callback maps also need the reviewed squad
    // helpers, even when no objective query or ready group was authored.
    let mut terminals=std::collections::BTreeSet::new();
    for (index,name) in markers.names.iter().enumerate(){if let Some(number)=squad_interface_number(&name.name,"extraction_squad_","")?{
        if name.object_type!=8||name.object_index<0||!terminals.insert(number)||markers.devices.iter().filter(|device|device.class=="ctrl"&&device.index==name.object_index as usize&&device.name_index==index as i16).count()!=1{return invalid("Native squad terminals require unique live control bindings");}
    }}
    if !begins.is_subset(&terminals)||!aborted.is_subset(&terminals){return invalid("Native squad begin and abort callbacks require their matching numbered hub terminal");}
    let squad=has_squad_scripts||!ready.is_empty()||!terminals.is_empty();
    if callbacks.is_empty()&&!squad&&!hover_transfer{return Ok(None);}
    let faction_landing_zones = crate::native_logic::validate_compiled_extraction_layout(map, &markers)?;
    let mut features = Vec::new();
    if squad { features.push(SQUAD_OBJECTIVES_FEATURE.into()); }
    if hover_transfer { features.push(HOVER_TRANSFER_FEATURE.into()); }
    if !begins.is_empty() { features.push(SQUAD_BEGIN_FEATURE.into()); }
    if faction_landing_zones { features.push(FACTION_LANDING_ZONES_FEATURE.into()); }
    if markers.volumes.iter().any(|volume| volume.name == "pelican_return") {
        features.push(PELICAN_RETURN_PAD_FEATURE.into());
    }
    Ok(Some(features))
}
pub fn compiled_extraction_mode(cache:&std::path::Path,map:&crate::maps::MapInspection)->Result<bool> {
    Ok(compiled_extraction_requirements(cache,map)?.is_some())
}
/// Native ScriptType values follow the existing Invader scenario definition.
/// Presence/type checks are independent readback, not gameplay acceptance.
pub fn verify_native_mission(binding:&NativeMissionBinding,map:&crate::maps::MapInspection,cache:&std::path::Path)->Result<()> {verify_native_mission_with_hud(binding,map,cache,None)}

pub(crate) fn verify_native_mission_with_hud(binding:&NativeMissionBinding,map:&crate::maps::MapInspection,cache:&std::path::Path,retained_hud:Option<(&str,&[crate::maps::NativeHudMessage])>)->Result<()> {
    validate_mission_scopes(&binding.missions)?;
    if binding.missions.iter().any(|beat|beat.transport_insertion.is_some()) {
        if map.header.version!=609||map.header.extended{return invalid("Dropship insertion needs standard Forerunner CE609 source");}
        let globals=crate::maps::scenario_global_readback(cache,map)?;
        for beat in binding.missions.iter().filter(|beat|beat.transport_insertion.is_some()) {
            let role=beat.transport_insertion.as_deref().unwrap();
            let passenger=beat.trigger=="triggerVolume";
            let name=if passenger{format!("gs_{role}_player_arrived")}else{format!("gs_{role}_insertion_complete")};
            if globals.iter().filter(|g|g.name==name&&g.value_type==5).count()!=1||globals.iter().filter(|g|g.name.eq_ignore_ascii_case(&name)).count()!=1{return invalid(if passenger{"Compiled native passenger arrival global is missing, ambiguous or not boolean"}else{"Compiled native troop delivery global is missing, ambiguous or not boolean"});}
            if passenger {
                let volumes=crate::maps::scenario_volume_readback(cache,map)?;
                if volumes.iter().filter(|area|Some(area.name.as_str())==beat.trigger_ref.as_deref()).count()!=1{return invalid("Compiled passenger insertion pad is missing or ambiguous");}
                let controller=format!("gs_{role}_trip");
                if map.scripts.iter().filter(|s|s.name==controller&&s.script_type==2).count()!=1{return invalid("Compiled passenger insertion controller is missing or has the wrong type");}
            }else{
                let helper=format!("gs_{role}_troop_aboard");
                if map.scripts.iter().filter(|s|s.name==helper&&s.script_type==3&&s.return_type==5).count()!=1{return invalid("Compiled native troop rider helper is missing or has the wrong type");}
            }
        }
    }
    if map.header.scenario_type!=0{return invalid("Compiled mission is not a native singleplayer scenario");}
    let mut expected=vec![("gs_mission".to_string(),1u16)];
    if binding.missions.iter().any(|beat|beat.early_extraction==Some(true)){expected.push(("gs_optional_contracts".into(),1));}
    let scoped=binding.missions.iter().filter_map(|beat|beat.squad_number).collect::<std::collections::BTreeSet<_>>();
    if binding.missions.iter().any(|beat|beat.guidance.is_some()){
        if map.header.version!=609||map.header.extended{return invalid("Native objective waypoints require standard Forerunner CE609 output");}
        let flags=crate::maps::scenario_flag_readback(cache,map)?;
        let objects=if binding.missions.iter().any(|beat|beat.guidance.as_ref().is_some_and(|g|g.object.is_some())){crate::maps::scenario_named_object_readback(cache,map)?}else{vec![]};
        for guide in binding.missions.iter().filter_map(|beat|beat.guidance.as_ref()){
            if let Some(name)=&guide.flag{if flags.iter().filter(|flag|flag.name.eq_ignore_ascii_case(name)).count()!=1{return invalid("Compiled objective waypoint flag is missing or ambiguous");}}
            if let Some(name)=&guide.object{if objects.iter().filter(|object|object.name.eq_ignore_ascii_case(name)).count()!=1{return invalid("Compiled objective waypoint object is missing or ambiguous");}}
        }
        if binding.missions.iter().any(|beat|beat.squad_number.is_none()&&beat.guidance.is_some()){
            expected.extend(["hide","show","update"].map(|name|(format!("gs_nav_{name}"),3)));
            expected.push(("gs_guard".into(),2));
        }
    }
    if !scoped.is_empty(){
        if map.header.version!=609||map.header.extended{return invalid("Independent squad missions require standard CE609 Forerunner content");}
        if binding.missions.iter().any(|beat|beat.squad_number.is_none()){expected.push(("gs_shared_mission".into(),1));}
        let markers=crate::maps::scenario_logic_readback(cache,map)?;
        crate::native_logic::validate_compiled_extraction_layout(map,&markers)?;
        for number in &scoped{
            expected.extend([(format!("gs_sq{number:02}_mission"),2),(format!("forerunner_squad_{number:02}_players"),3)]);
            let lifecycle=binding.missions.iter().any(|beat|beat.squad_number==Some(*number)&&beat.reset_on_deployment==Some(true));
            let guided=binding.missions.iter().any(|beat|beat.squad_number==Some(*number)&&beat.guidance.is_some());
            if lifecycle{expected.extend(["begin","aborted"].map(|name|(format!("forerunner_squad_{number:02}_{name}"),2)));}
            if guided||!lifecycle{expected.push((format!("gs_sq{number:02}_guard"),2));}
            if guided{expected.extend(["hide","show","update"].map(|name|(format!("gs_sq{number:02}_nav_{name}"),3)));}
            let ready=format!("extraction_squad_{number:02}_ready");
            let groups=markers.groups.iter().enumerate().filter(|(_,group)|group.name==ready).collect::<Vec<_>>();
            if groups.len()!=1||groups[0].1.initial_value!=0.||groups[0].1.flags!=0||markers.devices.iter().any(|device|[device.power_group,device.position_group].contains(&Some(groups[0].0 as i16))){return invalid("Compiled squad mission needs one isolated zero-initialized readiness group");}
            let controls=markers.names.iter().enumerate().filter(|(_,name)|name.name==format!("extraction_squad_{number:02}")).collect::<Vec<_>>();
            if controls.len()!=1||controls[0].1.object_type!=8||!markers.devices.iter().any(|device|device.class=="ctrl"&&device.index==controls[0].1.object_index as usize&&device.name_index==controls[0].0 as i16){return invalid("Compiled squad mission needs its unique native selection control");}
        }
        let _=compiled_extraction_requirements(cache,map)?;
    }
    if let Some(control) = binding.missions.iter().find_map(|beat| {
        if beat.trigger != "forerunnerExtractionSettled" || beat.squad_number.is_some() { return None; }
        beat.trigger_ref.as_deref().filter(|name| *name != "extraction_activate")
    }) {
        let markers = crate::maps::scenario_logic_readback(cache, map)?;
        crate::native_logic::validate_compiled_extraction_layout(map, &markers)?;
        if markers.names.iter().filter(|row| row.name == control).count() != 1 {
            return invalid(format!("Compiled mission evacuation control is missing or ambiguous: {control}"));
        }
    }
    if binding.cinematic.is_some()&&binding.cinematic_intro!=Some(false){expected.push(("gs_cinematic".into(),3));}
    if binding.activation=="startup"{expected.push(("gs_mission_bootstrap".into(),0));}
    for (index,beat) in binding.missions.iter().enumerate() {
        if beat.cinematic_cue.is_some(){expected.push((format!("gs_scene_{}",index+1),3));}
        if beat.trigger=="forerunnerExtractionSettled"{if map.header.version!=609{return invalid("Forerunner Extraction requires native CE609 output; another cache format is not interchangeable");}expected.push((beat.squad_number.map(|number|format!("forerunner_squad_{number:02}_complete")).unwrap_or_else(||"forerunner_extraction_complete".into()),if beat.squad_number.is_some(){2}else{1}));}
        if beat.trigger=="manual"{expected.push((beat.squad_number.map(|number|format!("gs_sq{number:02}_complete_{}",index+1)).unwrap_or_else(||format!("gs_complete_{}",index+1)),3));}
    }
    for (name,kind) in expected {
        let scripts=map.scripts.iter().filter(|script|script.name==name).collect::<Vec<_>>();
        if scripts.len()!=1 || scripts[0].script_type!=kind {
            return invalid(format!("Compiled mission script is missing, ambiguous or has the wrong native type: {name}"));
        }
    }
    for beat in &binding.missions {
        if matches!(beat.trigger.as_str(),"encounterCleared"|"escort") {
            let parts=beat.encounter_name.split('/').collect::<Vec<_>>();
            let rows=map.encounters.iter().filter(|row|row.name==parts[0]).collect::<Vec<_>>();
            if parts.len()>2||rows.len()!=1{return invalid(format!("Compiled mission encounter is missing or ambiguous: {}",beat.encounter_name));}
            let details=rows[0].details.as_ref().ok_or_else(||crate::SparkError::Invalid("Compiled mission encounter flags and squads are unreadable".into()))?;
            if details.flags&1==0{return invalid(format!("Mission encounter {} starts automatically; use script-created source to avoid duplicate AI ownership",parts[0]));}
            let squads=details.squads.iter().filter(|squad|parts.len()==1||squad.name==parts[1]).collect::<Vec<_>>();
            if squads.is_empty()||(parts.len()==2&&squads.len()!=1){return invalid("Compiled mission squad is missing or ambiguous");}
            if beat.trigger=="escort" {
                let minimum=beat.minimum_survivors.unwrap_or(1) as usize;
                let normal=squads.iter().map(|squad|squad.normal_count.max(0) as usize).sum::<usize>();
                let insane=squads.iter().map(|squad|squad.insane_count.max(0) as usize).sum::<usize>();
                let starts=squads.iter().map(|squad|squad.starting_locations.len()).sum::<usize>();
                if minimum==0||minimum>normal||minimum>insane||minimum>starts{return invalid("Survivor minimum exceeds compiled native starts or difficulty populations");}
            }
        }
        if beat.trigger=="weaponOwned"{verify_mission_collection(beat,map,cache)?;}
        if let Some(cue)=&beat.sound_cue {
            let found=map.tags.iter().filter(|tag|tag.class=="snd!"&&tag.path.replace('\\',"/")==cue.sound_path).count();
            if found!=1{return invalid(format!("Compiled mission sound is missing or ambiguous: {}",cue.sound_path));}
        }
    }
    if let Some(hud)=native_mission_hud(binding)? {
        let expected=retained_hud.map(|(path,_)|path.replace('\\',"/")).unwrap_or_else(||format!("{}/gs_mission_messages",map.scenario_path.replace('\\',"/")));
        let tags=map.tags.iter().filter(|tag|tag.class=="hmt "&&tag.path.replace('\\',"/").eq_ignore_ascii_case(&expected)).collect::<Vec<_>>();
        if tags.len()!=1||tags[0].external||tags[0].data_offset.is_none(){return invalid("Compiled mission HUD dependency is missing, ambiguous or external");}
        let actual=crate::maps::scenario_hud_messages(cache,map)?.ok_or_else(||crate::SparkError::Invalid("Compiled mission has no scenario HUD-message reference".into()))?;
        if actual.tag_id!=tags[0].id||!actual.tag_path.replace('\\',"/").eq_ignore_ascii_case(&expected) {
            return invalid("Compiled mission references a different HUD-message tag");
        }
        let mut complete=hud.clone();
        if let Some((_,messages))=retained_hud {
            for authored in &hud.messages {if messages.iter().filter(|message|message.name==authored.name).count()!=1||!messages.contains(authored){return invalid("Reviewed retained HUD no longer contains the current mission messages");}}
            complete.messages=messages.to_vec();
        }
        crate::firefight::verify_preserving_hud(&complete,&actual)?;
    }
    Ok(())
}
/// Verify the actual native scenario output, independently of authoring intent.
/// A dependency alone is not a placed collectible, and any starting profile can
/// make ownership true before the player reaches the authored technology.
fn verify_mission_collection(beat:&MissionBeat,map:&crate::maps::MapInspection,cache:&std::path::Path)->Result<()> {
    let path=beat.weapon_path.as_deref().unwrap_or("");
    let tags=map.tags.iter().filter(|tag|tag.class=="weap"&&!tag.external&&tag.path.replace('\\',"/")==path).collect::<Vec<_>>();
    if tags.len()!=1{return invalid("Compiled mission technology weapon is missing, external or ambiguous");}
    let id=tags[0].id;
    if !map.objects.iter().any(|object|object.kind=="Weapon"&&object.tag_id==Some(id)&&object.position.iter().all(|v|v.is_finite())) {
        return invalid("Compiled mission technology weapon has no readable native weapon placement; a tag dependency alone cannot supply collection");
    }
    let profiles=map.player_starting_profiles.as_ref().filter(|profiles|!profiles.is_empty()).ok_or_else(||crate::SparkError::Invalid("Compiled mission starting profiles are unavailable; technology ownership cannot be verified".into()))?;
    if profiles.iter().any(|profile|profile.primary_weapon_tag_id==Some(id)||profile.secondary_weapon_tag_id==Some(id)) {
        return invalid("Compiled mission technology is already granted by a native starting profile; select different technology or repair the loadout");
    }
    if let Some(name)=&beat.create_weapon_object {
        let (names,weapons)=crate::maps::scenario_weapon_readback(cache,map)?;
        let selected=names.iter().enumerate().filter(|(_,row)|row.name==*name).collect::<Vec<_>>();
        if selected.len()!=1||selected[0].1.object_type!=2||selected[0].1.object_index<0{return invalid("Compiled collection object is missing, ambiguous or not a native weapon");}
        let (name_index,binding)=selected[0];let placed=weapons.iter().filter(|row|row.index==binding.object_index as usize&&row.name_index==name_index as i16).collect::<Vec<_>>();
        if placed.len()!=1||placed[0].tag_path.replace('\\',"/")!=path||placed[0].not_placed&1==0{return invalid("Compiled collection object must uniquely reference the selected weapon with automatic placement disabled");}
    }
    Ok(())
}
/// Share the standard HMT source writer; never invent an engine HUD payload.
pub fn native_mission_hud(binding:&NativeMissionBinding)->Result<Option<crate::firefight::NativeHudAppendPlan>> {
    let messages=mission_hud_messages(&binding.missions)?;
    if messages.is_empty(){return Ok(None);}
    crate::firefight::format_native_hud_append(messages,None,&[])
}
/// Shared messages for generated missions and reviewed recovered-map source.
/// Formatting a HUD never asserts that a handwritten script displays it.
pub fn mission_hud_messages(missions:&[MissionBeat])->Result<Vec<crate::firefight::NativeRoundHudMessage>> {
    if missions.len()>128{return invalid("Mission HUD supports at most128objectives");}
    let mut messages=vec![];
    for (index,beat) in missions.iter().enumerate() {
        if beat.trigger=="escort" {
            messages.push(crate::firefight::NativeRoundHudMessage{name:format!("gs_mission_fail_{}",index+1),text:if beat.escort_failure.as_deref()==Some("continue"){"Rescue failed: not enough survivors. Continuing the operation.".into()}else{"Rescue failed: not enough survivors. Restart or revise the operation.".into()}});
        }
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
    Ok(messages)
}

fn bounded(s: &str, max: usize) -> bool {
    s.len() <= max && !s.chars().any(char::is_control)
}
fn valid_id(s: &str) -> bool {
    !s.is_empty() && s.len() <= 72 && s.bytes().all(|x| x.is_ascii_alphanumeric() || x == b'-' || x == b'_')
}
pub(crate) fn script_ident(s:&str) -> bool {
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
        if self.cinematic_trigger_volume.as_ref().is_some_and(|name|!script_ident(name)){return invalid("Cinematic trigger area needs a native script identifier");}
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
        let mut branches:HashMap<&str,(&str,Option<u8>)>=HashMap::new();
        for (index,beat) in self.missions.iter().enumerate() {
            if let Some(cue)=&beat.cinematic_cue {
                let first=self.shots.iter().position(|shot|shot.id==cue.first_shot_id);let last=self.shots.iter().position(|shot|shot.id==cue.last_shot_id);
                if !["start","complete"].contains(&cue.phase.as_str())||first.is_none()||last.is_none()||first>last{return invalid("Mission camera scene needs an existing first and last shot in timeline order");}
            }
            if !valid_id(&beat.id) || !ids.insert(&beat.id)
                || !bounded(&beat.title, 120) || !bounded(&beat.objective, 2048)
                || !bounded(&beat.encounter_name, 128)
                || beat.squad_number.is_some_and(|n|!(1..=22).contains(&n))
                || beat.guidance.as_ref().is_some_and(|g|g.target().is_none_or(|name|!name.is_empty()&&!script_ident(name))||!g.height.is_finite()||g.height.abs()>100.)
                || !["manual", "triggerVolume", "encounterCleared", "escort", "deviceActivated", "weaponOwned", "forerunnerExtractionSettled", "timer"].contains(&beat.trigger.as_str())
                || beat.trigger_ref.as_deref().is_some_and(|s| !s.is_empty() && !script_ident(s))
                || beat.condition_volume.as_deref().is_some_and(|s| !s.is_empty() && !script_ident(s))
                || beat.sound_cue.as_ref().is_some_and(|cue|!cue.valid())
                || beat.weapon_path.as_deref().is_some_and(|p|!p.is_empty()&&(p.len()>240||crate::safe_relative(p).is_err()||!p.bytes().all(|c|c.is_ascii_alphanumeric()||b"_ ./-".contains(&c))||p.ends_with(".weapon")))
                || beat.create_weapon_object.as_deref().is_some_and(|name|beat.trigger!="weaponOwned"||!script_ident(name))
                || beat.minimum_survivors.is_some_and(|n|n<1||n>32)
                || beat.timer_seconds.is_some_and(|n| n>600)
                || beat.hud_text.as_ref().is_some_and(|text|text.encode_utf16().count()>254||text.chars().any(char::is_control))
            { return invalid("Invalid Creator Studio mission beat"); }
            if beat.transport_insertion.as_deref().is_some_and(|role|!["escort","triggerVolume"].contains(&beat.trigger.as_str())||beat.squad_number.is_some()||!["pelican","spirit"].contains(&role)){return invalid("Dropship insertion requires a shared native escort or area objective");}
            if beat.encounter_team.as_deref().is_some_and(|team|!matches!(beat.trigger.as_str(),"escort"|"encounterCleared")||!["source","human","covenant","flood"].contains(&team)){return invalid("Encounter team needs a native combat or survivor objective");}
            if beat.escort_requires_player.is_some()&&beat.trigger!="escort"{return invalid("Requiring a player at rescue arrival needs a survivor escort");}
            if beat.escort_route.as_deref().is_some_and(|route|beat.trigger!="escort"||!script_ident(route)){return invalid("An escort route needs a native command-list identifier and a survivor escort");}
            if beat.escort_failure.as_deref().is_some_and(|mode|beat.trigger!="escort"||!["stop","continue"].contains(&mode)){return invalid("Rescue failure handling requires a survivor escort");}
            if let Some(result)=&beat.condition_result {
                if !self.missions[..index].iter().any(|source|source.id==result.beat_id&&source.squad_number==beat.squad_number&&source.trigger=="escort"&&source.escort_failure.as_deref()==Some("continue")){return invalid("Choose an earlier survivor escort configured to continue on failure");}
            }
            if (beat.condition_group.is_some()||beat.condition_outside.is_some())&&beat.condition_volume.is_none(){return invalid("Mission branch decisions need an optional condition volume");}
            if let Some(visit)=&beat.condition_visit_during {
                let valid=self.missions[..index].iter().any(|source|source.id==*visit&&source.squad_number==beat.squad_number&&source.trigger=="weaponOwned"&&source.condition_volume.is_none()&&source.condition_result.is_none());
                if !valid||beat.condition_volume.is_none()||beat.condition_group.is_some(){return invalid("Choose an earlier unconditional weapon collection in the same scope and a separate area decision");}
            }
            if let Some(group)=&beat.condition_group {
                if !valid_id(group){return invalid("Invalid shared mission decision");}
                let volume=beat.condition_volume.as_deref().unwrap();
                if branches.insert(group,(volume,beat.squad_number)).is_some_and(|previous|previous!=(volume,beat.squad_number)){return invalid("Shared mission decisions must use the same native volume and objective scope");}
            }
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
#[path = "../tests/common/mod.rs"]
mod test_fixture;

#[cfg(test)]
mod tests {
    #[test]
    #[ignore = "Requires the pinned CE609 Black Echo return survey cache"]
    fn compiled_pelican_return_footprint_has_readable_surfaces() {
        let cache=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_PELICAN_PAD_MAP").expect("Select the reviewed Black Echo cache"));
        let map=crate::maps::inspect_map(&cache,None).unwrap();
        let routes=crate::maps::scenario_command_readback(&cache,&map).unwrap();
        let route=routes.iter().find(|route|route.name=="hub_loaded").unwrap();
        let volumes=crate::maps::scenario_volume_readback(&cache,&map).unwrap();
        let pad=volumes.iter().find(|volume|volume.name=="pelican_return").unwrap().geometry.as_ref().unwrap();
        eprintln!("Occupied return movement destinations: {:?}",route.movement_destinations().unwrap());
        // Survey the recorded hull center and three candidate pad centers.
        let centers=[[55.391,-99.150],[53.5,-102.5],[54.0,-103.0],[54.5,-102.5]];
        let steps=[-1.5,0.,1.5];
        let points:Vec<_>=centers.iter().flat_map(|center|steps.iter().flat_map(move |x|steps.map(|y|[center[0]+x,center[1]+y,3.]))).collect();
        let surveyed=crate::maps::bsp_point_locations(&cache,&map,&points,Some(5.)).unwrap();
        for (center,grid) in centers.iter().zip(surveyed.chunks_exact(9)){
            let z:Vec<_>=grid.iter().map(|sample|sample.ground.iter().find(|surface|surface.bsp==0).expect("Readable BSP 0 ground").z).collect();
            let relief=z.iter().copied().fold(f32::NEG_INFINITY,f32::max)-z.iter().copied().fold(f32::INFINITY,f32::min);
            let rise_x=(z[7]-z[1])/3.; let rise_y=(z[5]-z[3])/3.;
            let center_up=(1.+rise_x*rise_x+rise_y*rise_y).sqrt().recip();
            assert!(pad.contains([center[0],center[1],z[4]+0.5]));
            eprintln!("Return center {center:?} | Z samples {z:?} | relief {relief:.4} | estimated terrain up.k {center_up:.4}");
        }
        assert_eq!(crate::maps::hash_file(&cache).unwrap(),map.sha256);
    }

    #[test]
    #[ignore = "Requires an explicitly selected owned CE609 Black Echo pad candidate"]
    fn compiled_extraction_loadout_must_be_usable_from_the_hub() {
        let cache = std::path::PathBuf::from(
            std::env::var_os("SPARK_NATIVE_PELICAN_PAD_MAP").expect("Select the owned compiled Black Echo fixture"),
        );
        let map = crate::maps::inspect_map(&cache, None).unwrap();
        let mut markers = crate::maps::scenario_logic_readback(&cache, &map).unwrap();
        crate::native_logic::validate_compiled_extraction_layout(&map, &markers).unwrap();
        let control_index = markers.names.iter().position(|name| name.name == "extraction_loadout").unwrap();
        let activation_index = markers.names.iter().position(|name| name.name == "extraction_activate").unwrap();
        let field = markers.devices.iter().find(|control| control.name_index == activation_index as i16).unwrap().position;
        let loadout = markers.devices.iter_mut().find(|control| control.name_index == control_index as i16).unwrap();
        loadout.position = field;
        let error = crate::native_logic::validate_compiled_extraction_layout(&map, &markers).unwrap_err();
        assert!(error.to_string().contains("extraction_loadout must be inside the safe hub"));
        assert_eq!(crate::maps::hash_file(&cache).unwrap(), map.sha256);
    }

    #[test]
    #[ignore = "Requires an explicitly selected owned CE609 Black Echo pad candidate"]
    fn compiled_pelican_return_pad_requires_explicit_runtime_support() {
        let cache = std::path::PathBuf::from(
            std::env::var_os("SPARK_NATIVE_PELICAN_PAD_MAP").expect("Select the owned compiled pad fixture"),
        );
        let map = crate::maps::inspect_map(&cache, None).unwrap();
        let features = super::compiled_extraction_requirements(&cache, &map).unwrap().unwrap();
        assert!(features.iter().any(|feature| feature == super::PELICAN_RETURN_PAD_FEATURE));
        let mut markers = crate::maps::scenario_logic_readback(&cache, &map).unwrap();
        let field = markers.volumes.iter().find(|volume| volume.name == "extraction_zone").unwrap().geometry.clone();
        let pad = markers.volumes.iter_mut().find(|volume| volume.name == "pelican_return").unwrap();
        pad.geometry = field;
        let error = crate::native_logic::validate_compiled_extraction_layout(&map, &markers).unwrap_err();
        assert!(error.to_string().contains("Pelican return pad intersects"));
    }

    use super::*;
    fn studio() -> CreatorStudio {
        CreatorStudio {
            schema_version: 1, missions: vec![], shots: vec![], playtests: vec![], machinima: None,engine_machinima:None,cinematic_trigger_volume:None,
            server: ServerPlan { name: "LAN Test".into(), runtime: "haloCustomEdition".into(),
                max_players: 8, public_listing: false, rotation: vec![], game_types: vec![] },
        }
    }
    #[test]
    fn recovered_mission_metadata_uses_current_studio_and_compiled_readback() {
        let mut project=crate::project::Project::new("Recovered mission metadata");
        let mut document=studio();
        document.missions.push(serde_json::from_value(serde_json::json!({"id":"one","title":"Arrival","objective":"Reach the pad","trigger":"triggerVolume","triggerRef":"pad","encounterName":""})).unwrap());
        project.studio=Some(document.clone());
        let source=|doc:&CreatorStudio,activation:&str|format!("{RECOVERED_MISSION_PREFIX}\n; configuration: {}\n(script dormant gs_mission (sleep 1))\n",serde_json::json!({"activation":activation,"forerunner":true,"missions":doc.missions,"shots":doc.shots}));
        let text=source(&document,"manual");let binding=recovered_mission_binding(&project,&text).unwrap().unwrap();
        assert_eq!(binding.source_sha256,crate::studio_native::digest(b"(script dormant gs_mission (sleep 1))\n"));
        assert!(recovered_mission_binding_for_module(&project,&text,"GS_MISSION.hsc",None).unwrap().is_some());
        assert!(recovered_mission_binding(&project,"(script dormant manual (sleep 1))").unwrap().is_none());
        assert!(recovered_mission_binding(&project,&source(&document,"unknown")).is_err());
        document.missions[0].title="Changed".into();assert!(recovered_mission_binding(&project,&source(&document,"manual")).unwrap_err().to_string().contains("Mission beats changed"));
        let mut faction = document.clone();
        faction.missions.push(serde_json::from_value(serde_json::json!({
            "id":"settle","title":"Return","objective":"Bank gear","trigger":"forerunnerExtractionSettled",
            "triggerRef":"extraction_spirit_activate","encounterName":""
        })).unwrap());
        project.studio = Some(faction.clone());
        assert!(recovered_mission_binding(&project, &source(&faction, "manual")).unwrap().is_some());
        faction.missions.last_mut().unwrap().trigger_ref = Some("other_control".into());
        project.studio = Some(faction.clone());
        assert!(recovered_mission_binding(&project, &source(&faction, "manual")).is_err());
        let root=tempfile::tempdir().unwrap();let map_path=root.path().join("synthetic.map");std::fs::write(&map_path,test_fixture::fixture(609)).unwrap();
        let map=crate::maps::inspect_map(&map_path,None).unwrap();
        assert!(verify_native_mission(&binding,&map,&map_path).is_err(),"A readable cache without the authored mission is never accepted");
    }
    #[test]
    fn recovered_composition_pins_real_module_and_retains_forerunner_callback_ownership(){
        let mut project=crate::project::Project::new("Composed recovered source");let mut doc=studio();doc.missions.push(serde_json::from_value(serde_json::json!({"id":"last","title":"Return","objective":"Settle","trigger":"forerunnerExtractionSettled","triggerRef":"extraction_activate","encounterName":""})).unwrap());project.studio=Some(doc.clone());
        let mut config=serde_json::json!({"activation":"startup","forerunner":true,"missions":doc.missions,"shots":doc.shots,"composition":{"filename":"original.hsc","sourceSha256":"a".repeat(64),"retainedSha256":crate::studio_native::digest(b"(script startup old_start (sleep -1))\n"),"retiredStartups":["old_start"],"replaceExtractionCallback":true}});
        let source=|value:&serde_json::Value|format!("{RECOVERED_MISSION_PREFIX}\n; configuration: {value}\n(script dormant gs_mission (sleep 1))\n; Spark retained module body v1\n(script startup old_start (sleep -1))\n\n; Spark generated mission body v1\n(script dormant generated (sleep 1))\n");
        assert!(recovered_mission_binding_for_module(&project,&source(&config),"original.hsc",None).unwrap().is_some());assert!(recovered_mission_binding_for_module(&project,&source(&config),"original.hsc",Some(&"a".repeat(64))).unwrap().is_some());for wrong in ["".to_string(),"b".repeat(64)]{assert!(recovered_mission_binding_for_module(&project,&source(&config),"original.hsc",Some(&wrong)).is_err());}assert!(recovered_mission_binding(&project,&source(&config)).is_err());
        for bad in ["../original.hsc","global_scripts.hsc","original.HSC",""]{config["composition"]["filename"]=bad.into();assert!(recovered_mission_binding_for_module(&project,&source(&config),bad,None).is_err());}
        config["composition"]["filename"]="original.hsc".into();config["composition"]["retiredStartups"]=serde_json::json!(["old_start","OLD_START"]);assert!(recovered_mission_binding_for_module(&project,&source(&config),"original.hsc",None).is_err());config["composition"]["retiredStartups"]=serde_json::json!(["old_start"]);config["forerunner"]=false.into();assert!(recovered_mission_binding_for_module(&project,&source(&config),"original.hsc",None).is_err());
    }
    #[test]
    fn native_cinematic_trigger_roundtrips_without_changing_legacy_studio_defaults(){
        let mut doc=studio();assert!(serde_json::to_value(&doc).unwrap().get("cinematicTriggerVolume").is_none());doc.cinematic_trigger_volume=Some("intro_area".into());doc.validate().unwrap();let saved=serde_json::to_string(&doc).unwrap();let reopened:CreatorStudio=serde_json::from_str(&saved).unwrap();assert_eq!(reopened.cinematic_trigger_volume,doc.cinematic_trigger_volume);doc.cinematic_trigger_volume=Some("bad) (quit".into());assert!(doc.validate().is_err());
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
    fn insertion_handoff_persists_and_rejects_wrong_scope_or_trigger(){
        let mut document=studio();document.missions=serde_json::from_value(serde_json::json!([{"id":"rescue","title":"Rescue","objective":"Escort landed troops","trigger":"escort","encounterName":"marines","triggerRef":"rally","transportInsertion":"pelican"}])).unwrap();document.validate().unwrap();let restored:CreatorStudio=serde_json::from_slice(&serde_json::to_vec(&document).unwrap()).unwrap();assert_eq!(document.missions,restored.missions);document.missions[0].squad_number=Some(1);assert!(document.validate().is_err());document.missions[0].squad_number=None;document.missions[0].trigger="manual".into();assert!(document.validate().is_err());document.missions[0].trigger="escort".into();document.missions[0].transport_insertion=Some("bad) (quit)".into());assert!(document.validate().is_err());
    }
    #[test]
    fn encounter_allegiance_persists_and_rejects_non_ai_or_injected_teams(){
        let mut document=studio();document.missions=serde_json::from_value(serde_json::json!([{"id":"rescue","title":"Rescue Covenant","objective":"Escort","trigger":"escort","encounterName":"allies","triggerRef":"rally","encounterTeam":"covenant"}])).unwrap();document.validate().unwrap();let restored:CreatorStudio=serde_json::from_slice(&serde_json::to_vec(&document).unwrap()).unwrap();assert_eq!(document.missions,restored.missions);
        document.missions[0].encounter_team=Some("source".into());document.validate().unwrap();document.missions[0].encounter_team=Some("human) (ai_erase_all".into());assert!(document.validate().is_err());document.missions[0].encounter_team=Some("human".into());document.missions[0].trigger="manual".into();assert!(document.validate().is_err());
    }
    #[test]
    fn rescue_outcome_conditions_preserve_failure_routes_and_require_an_earlier_continuing_escort() {
        let mut document=studio();document.missions=serde_json::from_value(serde_json::json!([
            {"id":"rescue","title":"Rescue","objective":"Escort","trigger":"escort","encounterName":"survivors","triggerRef":"rally","escortFailure":"continue"},
            {"id":"success","title":"Success","objective":"Normal route","trigger":"manual","encounterName":"","conditionResult":{"beatId":"rescue","failed":false}},
            {"id":"failure","title":"Failure","objective":"Fallback","trigger":"manual","encounterName":"","conditionResult":{"beatId":"rescue","failed":true}}
        ])).unwrap();document.validate().unwrap();
        let restored:CreatorStudio=serde_json::from_slice(&serde_json::to_vec(&document).unwrap()).unwrap();assert_eq!(restored.missions,document.missions);
        let binding=NativeMissionBinding{schema_version:1,cinematic_intro:None,cinematic:None,missions:document.missions.clone(),activation:"manual".into(),source_sha256:"a".repeat(64)};
        assert!(native_mission_hud(&binding).unwrap().unwrap().messages[0].panels.iter().any(|panel|matches!(panel,crate::maps::NativeHudPanel::Text(text) if text.contains("Continuing the operation"))));
        let mut stopped=document.clone();stopped.missions[0].escort_failure=None;assert!(stopped.validate().is_err());
        let mut forward=document.clone();forward.missions[1].condition_result.as_mut().unwrap().beat_id="failure".into();assert!(forward.validate().is_err());
        let mut missing=document.clone();missing.missions[1].condition_result.as_mut().unwrap().beat_id="unknown".into();assert!(missing.validate().is_err());
        let mut mixed=document.clone();mixed.missions[1].condition_volume=Some("rally".into());mixed.validate().unwrap();
        let mut wrong=document.clone();wrong.missions[0].trigger="timer".into();assert!(wrong.validate().is_err());
    }
    #[test]
    fn shared_mission_paths_preserve_the_decision_and_reject_inconsistent_sources() {
        let mut document=studio();
        for (id,outside) in [("inside",false),("outside",true)] {
            document.missions.push(serde_json::from_value(serde_json::json!({"id":id,"title":"Path","objective":"Native branch","trigger":"timer","timerSeconds":1,"encounterName":"","conditionVolume":"choice","conditionGroup":"decision","conditionOutside":outside})).unwrap());
        }
        document.validate().unwrap();let restored:CreatorStudio=serde_json::from_slice(&serde_json::to_vec(&document).unwrap()).unwrap();assert_eq!(document.missions,restored.missions);
        let mut different=document.clone();different.missions[1].condition_volume=Some("elsewhere".into());assert!(different.validate().is_err());
        let mut missing=document.clone();missing.missions[1].condition_volume=None;assert!(missing.validate().is_err());
        let mut invalid=document.clone();invalid.missions[1].condition_group=Some("not a decision id".into());assert!(invalid.validate().is_err());
    }
    #[test]
    fn collection_visit_requires_an_earlier_unconditional_objective_in_the_same_scope() {
        let mut document=studio();
        for value in [
            serde_json::json!({"id":"collect","title":"Collect","objective":"Pick up a weapon","trigger":"weaponOwned","encounterName":"","weaponPath":"weapons/technology"}),
            serde_json::json!({"id":"branch","title":"Contain","objective":"Enter containment","trigger":"timer","timerSeconds":1,"encounterName":"","conditionVolume":"containment","conditionVisitDuring":"collect"}),
        ]{document.missions.push(serde_json::from_value(value).unwrap());}
        document.validate().unwrap();
        let restored:CreatorStudio=serde_json::from_slice(&serde_json::to_vec(&document).unwrap()).unwrap();
        assert_eq!(restored.missions,document.missions);
        let mut other_scope=document.clone();other_scope.missions[0].squad_number=Some(1);assert!(other_scope.validate().is_err());
        let mut skipped=document.clone();skipped.missions[0].condition_volume=Some("skip_pickup".into());assert!(skipped.validate().is_err());
        let mut shared=document.clone();shared.missions[1].condition_group=Some("shared".into());assert!(shared.validate().is_err());
        document.missions.swap(0,1);assert!(document.validate().is_err());
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
        let prepared=NativeMissionBinding{schema_version:1,cinematic_intro:None,cinematic:None,missions:vec![beat.clone()],activation:"manual".into(),source_sha256:crate::studio_native::digest(body.as_bytes())};
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

    #[test]
    fn native_escort_owns_real_source_group_destination_and_feasible_difficulty() {
        let mut project=crate::project::Project::new("Survivors");let mut document=studio();
        document.missions.push(serde_json::from_value(serde_json::json!({"id":"rescue","title":"Rescue","objective":"Escort Marines","trigger":"escort","encounterName":"survivors","triggerRef":"rally","minimumSurvivors":2})).unwrap());
        project.studio=Some(document);let mut doc=crate::quickforge::create_arena("Rescue","customBlank").unwrap();doc.game_mode="campaign".into();
        doc.logic=Some(serde_json::from_value(serde_json::json!({"schemaVersion":1,"triggers":[{"id":"rally","nativeName":"rally","name":"Rally","position":[10,0,2],"rotation":[0,0,0],"dimensions":[4,4,3],"visible":true,"locked":false}],"devices":[],"rules":[]})).unwrap());
        doc.campaign_encounters.push(serde_json::from_value(serde_json::json!({"name":"survivors","actorPath":"characters/marine/marine","position":[0,0,0],"startActive":false,"count":3,"spacing":1,"difficulty":{"normal":2,"insane":3}})).unwrap());
        project.quick_forge=Some(doc);
        // Binding validation fixture only; actual source syntax has the separate
        // installed Invader test. Never treat this body as playable content.
        let check=|value:&crate::project::Project| {
            let mut doc=value.quick_forge.clone().unwrap();let body="; binding fixture\n";
            let binding=NativeMissionBinding{schema_version:1,cinematic_intro:None,cinematic:None,missions:value.studio.as_ref().unwrap().missions.clone(),activation:"manual".into(),source_sha256:crate::studio_native::digest(body.as_bytes())};
            doc.logic.as_mut().unwrap().handwritten_sources=serde_json::from_value(serde_json::json!([{"filename":"gs_mission.hsc","content":format!("{}{}\n{}",NATIVE_MISSION_BINDING,serde_json::to_string(&binding).unwrap(),body)}])).unwrap();
            native_mission_binding(value,&doc)
        };
        let binding=check(&project).unwrap().unwrap();let hud=native_mission_hud(&binding).unwrap().unwrap();assert_eq!(hud.messages.len(),1);assert_eq!(hud.messages[0].name,"gs_mission_fail_1");
        let restored:crate::project::Project=serde_json::from_slice(&serde_json::to_vec(&project).unwrap()).unwrap();assert_eq!(restored.studio.as_ref().unwrap().missions[0].minimum_survivors,Some(2));check(&restored).unwrap();
        let mut impossible=project.clone();impossible.studio.as_mut().unwrap().missions[0].minimum_survivors=Some(3);assert!(check(&impossible).unwrap_err().to_string().contains("difficulty population"));
        let mut absent=project.clone();absent.studio.as_mut().unwrap().missions[0].trigger_ref=Some("missing_rally".into());assert!(check(&absent).unwrap_err().to_string().contains("destination volume"));
        let mut duplicate=project.clone();let mut second=binding.missions[0].clone();second.id="duplicate".into();duplicate.studio.as_mut().unwrap().missions.push(second);assert!(check(&duplicate).unwrap_err().to_string().contains("spawn owner"));
        let mut active=project;active.quick_forge.as_mut().unwrap().campaign_encounters[0].start_active=true;assert!(check(&active).unwrap_err().to_string().contains("disable initial actor creation"));
    }

    #[test]
    fn named_collection_creation_is_optional_typed_intent_and_never_a_manual_stub(){
        let mut doc=studio();let beat:MissionBeat=serde_json::from_value(serde_json::json!({"id":"technology","title":"Collect","objective":"Recover","trigger":"weaponOwned","weaponPath":"weapons/technology","createWeaponObject":"be_technology","encounterName":""})).unwrap();doc.missions.push(beat);doc.validate().unwrap();assert_eq!(serde_json::from_str::<CreatorStudio>(&serde_json::to_string(&doc).unwrap()).unwrap().missions,doc.missions);
        for name in ["","bad) (quit)","../original"]{doc.missions[0].create_weapon_object=Some(name.into());assert!(doc.validate().is_err());}doc.missions[0].create_weapon_object=Some("be_technology".into());doc.missions[0].trigger="manual".into();assert!(doc.validate().is_err());doc.missions[0].create_weapon_object=None;doc.validate().unwrap();assert!(serde_json::to_value(&doc.missions[0]).unwrap().get("createWeaponObject").is_none());
    }
    #[test]
    fn mission_collection_checks_native_placement_and_every_starting_profile() {
        // Synthetic native inspection regression, not compilation/game evidence.
        let beat:MissionBeat=serde_json::from_value(serde_json::json!({"id":"technology","title":"Collect","objective":"Recover","trigger":"weaponOwned","weaponPath":"weapons/technology","encounterName":""})).unwrap();
        let mut map:crate::maps::MapInspection=serde_json::from_value(serde_json::json!({
            "header":{"version":609,"engine":"test","name":"collection","build":"test","scenarioType":0,"fileSize":0,"declaredSize":0,"tagOffset":0,"tagSize":0,"crc32":0,"flags":0,"demoLayout":false,"compressed":false,"extended":false,"legacyTagSizeRepair":false},
            "sha256":"a".repeat(64),"tags":[{"id":42,"index":0,"class":"weap","path":"weapons/technology","dataOffset":2048,"external":false,"fields":[],"references":[]}],"objects":[],"mesh":crate::maps::MeshData::default(),"encounters":[],"scripts":[],"resources":[],"diagnostics":[],"scenarioPath":"levels/test"})).unwrap();
        assert!(verify_mission_collection(&beat,&map,std::path::Path::new("not-read")).unwrap_err().to_string().contains("placement"));
        map.objects.push(serde_json::from_value(serde_json::json!({"id":"weapon-0","name":"Technology","kind":"Weapon","tagId":42,"position":[1,2,3],"rotation":[0,0,0],"scale":[1,1,1],"visible":true,"sourceOffset":2048,"rotationOffset":2060,"assetId":null})).unwrap());
        assert!(verify_mission_collection(&beat,&map,std::path::Path::new("not-read")).unwrap_err().to_string().contains("profiles are unavailable"));
        let profile:crate::maps::PlayerStartingProfile=serde_json::from_value(serde_json::json!({"name":"insertion","health":1,"shields":1,"primaryWeaponTagId":7,"primaryLoaded":10,"primaryReserved":30,"secondaryWeaponTagId":null,"secondaryLoaded":0,"secondaryReserved":0,"fragmentationGrenades":0,"plasmaGrenades":0,"grenadeType2":0,"grenadeType3":0})).unwrap();
        map.player_starting_profiles=Some(vec![profile.clone()]);verify_mission_collection(&beat,&map,std::path::Path::new("not-read")).unwrap();
        let mut extra=profile;extra.name="alternate".into();extra.secondary_weapon_tag_id=Some(42);map.player_starting_profiles.as_mut().unwrap().push(extra);
        assert!(verify_mission_collection(&beat,&map,std::path::Path::new("not-read")).unwrap_err().to_string().contains("already granted"));
        map.player_starting_profiles.as_mut().unwrap()[1].secondary_weapon_tag_id=None;
        map.objects[0].tag_id=Some(7);assert!(verify_mission_collection(&beat,&map,std::path::Path::new("not-read")).is_err());map.objects[0].tag_id=Some(42);
        map.objects[0].position[2]=f32::NAN;assert!(verify_mission_collection(&beat,&map,std::path::Path::new("not-read")).is_err());map.objects[0].position[2]=3.;
        map.tags.push(map.tags[0].clone());assert!(verify_mission_collection(&beat,&map,std::path::Path::new("not-read")).unwrap_err().to_string().contains("ambiguous"));
    }
    #[test]
    #[ignore="Requires an explicitly selected owned native collection cache and weapon; read-only acceptance"]
    fn installed_native_collection_readback_requires_placement_and_nonstarting_weapon() {
        let path=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_MISSION_COLLECTION_CACHE").expect("Explicit owned native cache required"));
        let weapon=std::env::var("SPARK_NATIVE_MISSION_COLLECTION_WEAPON").expect("Explicit placed nonstarting weapon required");
        let before=crate::maps::hash_file(&path).unwrap();let map=crate::maps::inspect_map(&path,None).unwrap();
        let beat:MissionBeat=serde_json::from_value(serde_json::json!({"id":"readback","title":"Readback","objective":"Read native collection data","trigger":"weaponOwned","weaponPath":weapon,"encounterName":""})).unwrap();
        verify_mission_collection(&beat,&map,std::path::Path::new("not-read")).unwrap();assert_eq!(before,crate::maps::hash_file(&path).unwrap());
        println!("Native collection placement/profile readback PASS; cacheSHA={before}; weapon={}; profiles={}; not complete mission or gameplay acceptance",beat.weapon_path.unwrap(),map.player_starting_profiles.unwrap().len());
    }
    #[test]
    fn forerunner_mission_requires_real_technology_and_gated_safe_hub() {
        let mut project=crate::project::Project::new("Forerunner objectives");let mut document=studio();
        document.missions=serde_json::from_value(serde_json::json!([
            {"id":"collect","title":"Collect","objective":"Actual ownership","trigger":"weaponOwned","weaponPath":"weapons/technology","encounterName":""},
            {"id":"settle","title":"Return","objective":"Actual settlement","trigger":"forerunnerExtractionSettled","triggerRef":"extraction_activate","encounterName":""}
        ])).unwrap();document.validate().unwrap();project.studio=Some(document);
        let mut doc=crate::quickforge::create_arena("Native hub","customBlank").unwrap();doc.game_mode="campaign".into();doc.runtime_id=crate::runtime::RuntimeId::HaloCustomEdition;
        doc.spawns=serde_json::from_value(serde_json::json!([{"id":"hub_start","name":"Hub start","position":[0,0,0],"facing":0,"team":0,"gameModes":[],"visible":true,"locked":false}])).unwrap();
        for(id,kind,path,x)in[("technology","weap","weapons/technology",10.),("deploy","ctrl","devices/control",0.),("activate","ctrl","devices/control",20.)]{doc.placements.push(serde_json::from_value(serde_json::json!({"id":id,"name":id,"tagPath":path,"tagClass":kind,"position":[x,0,0],"rotation":[0,0,0],"team":0,"respawnSeconds":0})).unwrap());}
        doc.logic=Some(serde_json::from_value(serde_json::json!({"schemaVersion":1,"rules":[],"devices":[{"placementId":"deploy","nativeName":"extraction_deploy","powered":true,"initialPosition":0},{"placementId":"activate","nativeName":"extraction_activate","powered":false,"initialPosition":0}],"triggers":[{"id":"hub","name":"Hub","nativeName":"extraction_return","position":[0,0,1],"rotation":[0,0,0],"dimensions":[8,8,4],"visible":true,"locked":false},{"id":"field","name":"Field","nativeName":"extraction_zone","position":[20,0,1],"rotation":[0,0,0],"dimensions":[4,4,4],"visible":true,"locked":false}]})).unwrap());
        let body="; Typed binding fixture only, not native script/gameplay evidence\n";let binding=NativeMissionBinding{schema_version:1,missions:project.studio.as_ref().unwrap().missions.clone(),activation:"startup".into(),source_sha256:crate::studio_native::digest(body.as_bytes()),cinematic:None,cinematic_intro:None};
        doc.logic.as_mut().unwrap().handwritten_sources=serde_json::from_value(serde_json::json!([{"filename":"gs_mission.hsc","content":format!("{}{}\n{}",NATIVE_MISSION_BINDING,serde_json::to_string(&binding).unwrap(),body)}])).unwrap();
        native_mission_binding(&project,&doc).unwrap();
        let mut bad=doc.clone();bad.logic.as_mut().unwrap().devices[1].powered=true;assert!(native_mission_binding(&project,&bad).is_err());
        let mut bad=doc.clone();bad.spawns[0].position=[20.,0.,0.];bad.spawns[0].visible=false;assert!(native_mission_binding(&project,&bad).unwrap_err().to_string().contains("Every selectable"));
        let mut bad=doc.clone();bad.placements.remove(0);assert!(native_mission_binding(&project,&bad).unwrap_err().to_string().contains("technology weapon"));
        let mut bad=doc;bad.runtime_id=crate::runtime::RuntimeId::MccSteam;assert!(native_mission_binding(&project,&bad).is_err());
        let restored:CreatorStudio=serde_json::from_slice(&serde_json::to_vec(project.studio.as_ref().unwrap()).unwrap()).unwrap();assert_eq!(restored.missions,binding.missions);
    }

    #[test]
    fn mission_terminal_requires_one_inactive_powered_native_control() {
        let mut project=crate::project::Project::new("Communications");let mut document=studio();
        document.missions.push(serde_json::from_value(serde_json::json!({"id":"terminal","title":"Restore communications","objective":"Use terminal","trigger":"deviceActivated","encounterName":"","triggerRef":"restore_comms"})).unwrap());
        document.validate().unwrap();project.studio=Some(document);
        let mut doc=crate::quickforge::create_arena("Terminal","customBlank").unwrap();doc.game_mode="campaign".into();
        doc.placements.push(serde_json::from_value(serde_json::json!({"id":"terminal","name":"Terminal","tagPath":"devices/control","tagClass":"ctrl","position":[0,0,0],"rotation":[0,0,0],"team":0,"respawnSeconds":0})).unwrap());
        doc.logic=Some(serde_json::from_value(serde_json::json!({"schemaVersion":1,"triggers":[],"devices":[{"placementId":"terminal","nativeName":"restore_comms","initialPosition":0,"powered":true}],"rules":[]})).unwrap());
        let body="; binding fixture, not native syntax proof\n";
        let binding=NativeMissionBinding{schema_version:1,cinematic_intro:None,cinematic:None,missions:project.studio.as_ref().unwrap().missions.clone(),activation:"manual".into(),source_sha256:crate::studio_native::digest(body.as_bytes())};
        doc.logic.as_mut().unwrap().handwritten_sources=serde_json::from_value(serde_json::json!([{"filename":"gs_mission.hsc","content":format!("{}{}\n{}",NATIVE_MISSION_BINDING,serde_json::to_string(&binding).unwrap(),body)}])).unwrap();
        native_mission_binding(&project,&doc).unwrap();
        let restored:CreatorStudio=serde_json::from_slice(&serde_json::to_vec(project.studio.as_ref().unwrap()).unwrap()).unwrap();assert_eq!(restored.missions,binding.missions);
        for variant in ["missing","duplicate","machine","unpowered","active"] {
            let mut bad=doc.clone();
            match variant {
                "missing"=>bad.logic.as_mut().unwrap().devices.clear(),
                "duplicate"=>{let device=bad.logic.as_ref().unwrap().devices[0].clone();bad.logic.as_mut().unwrap().devices.push(device);},
                "machine"=>bad.placements[0].tag_class="mach".into(),
                "unpowered"=>bad.logic.as_mut().unwrap().devices[0].powered=false,
                _=>bad.logic.as_mut().unwrap().devices[0].initial_position=0.5,
            }
            assert!(native_mission_binding(&project,&bad).unwrap_err().to_string().contains("native control"),"{variant}");
        }
    }

    #[test]
    fn cinematic_markers_preserve_native_identities_and_refuse_collisions_or_degenerate_look_at() {
        let mut camera:CameraShot=serde_json::from_value(serde_json::json!({"id":"intro","name":"Intro","durationMs":1000,"cameraPosition":[1,2,3],"lookAt":[2,3,4],"fov":60,"subtitle":""})).unwrap();
        assert_eq!(cinematic_markers(&[camera.clone()]).unwrap(),vec!["gs_cs_001"]);
        camera.camera_marker=Some("Approach".into());let mut duplicate=camera.clone();duplicate.camera_marker=Some("approach".into());
        assert!(cinematic_markers(&[camera.clone(),duplicate]).is_err());
        camera.look_at=camera.camera_position;assert!(cinematic_markers(&[camera]).is_err());
    }

    #[test]
    fn prepared_cinematic_refuses_stale_shots_and_competing_game_camera_ownership() {
        let mut project=crate::project::Project::new("Native intro");let mut studio=studio();
        studio.missions=vec![serde_json::from_value(serde_json::json!({"id":"begin","title":"Begin","objective":"Advance","trigger":"timer","timerSeconds":1,"encounterName":""})).unwrap()];
        studio.shots=vec![serde_json::from_value(serde_json::json!({"id":"intro","name":"Intro","durationMs":1000,"cameraPosition":[1,2,3],"lookAt":[2,3,4],"fov":60,"subtitle":""})).unwrap()];
        let binding=NativeMissionBinding{schema_version:1,cinematic_intro:None,missions:studio.missions.clone(),cinematic:Some(studio.shots.clone()),activation:"manual".into(),source_sha256:crate::studio_native::digest(b"; fixture source")};
        let mut doc=crate::quickforge::create_arena("Intro","smallIndoorArena").unwrap();doc.game_mode="campaign".into();
        doc.logic=Some(serde_json::from_value(serde_json::json!({"schemaVersion":1,"triggers":[],"devices":[],"rules":[],"handwrittenSources":[{"filename":"gs_mission.hsc","content":format!("{NATIVE_MISSION_BINDING}{}\n; fixture source",serde_json::to_string(&binding).unwrap())}]})).unwrap());
        project.studio=Some(studio);assert!(native_mission_binding(&project,&doc).unwrap().is_some());
        project.studio.as_mut().unwrap().shots[0].camera_position[0]=9.;assert!(native_mission_binding(&project,&doc).unwrap_err().to_string().contains("shots changed"));
        project.studio.as_mut().unwrap().shots=binding.cinematic.unwrap();project.studio.as_mut().unwrap().engine_machinima=Some(EngineMachinima{enabled:true,playback:"sequence".into(),camera_id:None,auto_start:false});
        assert!(native_mission_binding(&project,&doc).unwrap_err().to_string().contains("both would own"));
    }

    #[test]
    fn mission_scene_ranges_validate_saved_shots_and_require_a_prepared_snapshot() {
        let mut project=crate::project::Project::new("Mission scenes");let mut studio=studio();
        studio.shots=vec![serde_json::from_value(serde_json::json!({"id":"first","name":"First","durationMs":1000,"cameraPosition":[0,-4,3],"lookAt":[4,0,1],"fov":60,"subtitle":""})).unwrap(),
            serde_json::from_value(serde_json::json!({"id":"last","name":"Last","durationMs":1500,"cameraPosition":[25,0,3],"lookAt":[29,0,1],"fov":70,"subtitle":""})).unwrap()];
        studio.missions=vec![serde_json::from_value(serde_json::json!({"id":"begin","title":"Begin","objective":"Advance","trigger":"timer","timerSeconds":1,"encounterName":"","cinematicCue":{"firstShotId":"first","lastShotId":"last","phase":"complete"}})).unwrap()];
        studio.validate().unwrap();let mut missing=studio.clone();missing.shots.remove(0);assert!(missing.validate().unwrap_err().to_string().contains("timeline order"));
        let mut reversed=studio.clone();reversed.missions[0].cinematic_cue.as_mut().unwrap().first_shot_id="last".into();reversed.missions[0].cinematic_cue.as_mut().unwrap().last_shot_id="first".into();assert!(reversed.validate().is_err());
        let mut unsafe_phase=studio.clone();unsafe_phase.missions[0].cinematic_cue.as_mut().unwrap().phase="unknown".into();assert!(unsafe_phase.validate().is_err());
        let mut binding=NativeMissionBinding{schema_version:1,cinematic_intro:Some(false),cinematic:None,missions:studio.missions.clone(),activation:"manual".into(),source_sha256:crate::studio_native::digest(b"; fixture")};
        let mut doc=crate::quickforge::create_arena("Scene","smallIndoorArena").unwrap();doc.game_mode="campaign".into();
        let attach=|doc:&mut crate::quickforge::QuickForgeDocument,binding:&NativeMissionBinding|{doc.logic=Some(serde_json::from_value(serde_json::json!({"schemaVersion":1,"triggers":[],"devices":[],"rules":[],"handwrittenSources":[{"filename":"gs_mission.hsc","content":format!("{NATIVE_MISSION_BINDING}{}\n; fixture",serde_json::to_string(binding).unwrap())}]})).unwrap());};
        project.studio=Some(studio);attach(&mut doc,&binding);assert!(native_mission_binding(&project,&doc).unwrap_err().to_string().contains("reviewed camera shots"));
        binding.cinematic=Some(project.studio.as_ref().unwrap().shots.clone());attach(&mut doc,&binding);native_mission_binding(&project,&doc).unwrap();
        project.studio.as_mut().unwrap().shots[0].fov=80.;assert!(native_mission_binding(&project,&doc).unwrap_err().to_string().contains("shots changed"));
    }

    #[test]
    fn recovered_shared_waypoint_requires_forerunner_and_preserves_binding() {
        let mut project=crate::project::Project::new("Shared waypoint");
        let mut studio=studio();
        studio.missions=vec![serde_json::from_value(serde_json::json!({
            "id":"deploy","title":"Deploy","objective":"Use the terminal","trigger":"deviceActivated",
            "encounterName":"","triggerRef":"extraction_deploy","guidance":{"object":"extraction_deploy","height":0.35}
        })).unwrap()];
        project.studio=Some(studio);
        let source=|forerunner|format!("{RECOVERED_MISSION_PREFIX}\n; configuration: {}\n; fixture",
            serde_json::json!({"activation":"manual","forerunner":forerunner,"missions":project.studio.as_ref().unwrap().missions,"shots":[]}));
        let binding=recovered_mission_binding(&project,&source(true)).unwrap().unwrap();
        assert_eq!(binding.missions[0].guidance.as_ref().unwrap().target(),Some("extraction_deploy"));
        assert!(recovered_mission_binding(&project,&source(false)).unwrap_err().to_string().contains("Forerunner"));
    }

    #[test]
    #[ignore = "Requires the explicitly selected native numbered Extraction build"]
    fn compiled_squad_replay_requires_the_deployment_callback_capability() {
        let cache=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_SQUAD_REPLAY_MAP").expect("Select the owned numbered Extraction build"));
        let map=crate::maps::inspect_map(&cache,None).unwrap();
        let features=super::compiled_extraction_requirements(&cache,&map).unwrap().unwrap();
        assert!(features.iter().any(|feature|feature==super::SQUAD_OBJECTIVES_FEATURE));
        assert!(features.iter().any(|feature|feature==super::SQUAD_BEGIN_FEATURE));
        assert!(!features.iter().any(|feature|feature==super::HOVER_TRANSFER_FEATURE));
        let mut hover=map.clone();
        hover.scripts.push(crate::maps::Script{name:"gs_pelican_hover_field".into(),script_type:3,return_type:5});
        assert!(super::compiled_extraction_requirements(&cache,&hover).unwrap().unwrap().iter().any(|feature|feature==super::HOVER_TRANSFER_FEATURE));
        hover.scripts.last_mut().unwrap().return_type=4;
        assert!(super::compiled_extraction_requirements(&cache,&hover).unwrap_err().to_string().contains("static boolean marker"));
        let mut altered=map.clone();
        altered.scripts.iter_mut().find(|script|script.name=="forerunner_squad_01_begin").unwrap().return_type=5;
        assert!(super::compiled_extraction_requirements(&cache,&altered).unwrap_err().to_string().contains("void declarations"));
        altered.scripts.retain(|script|script.name!="forerunner_squad_01_begin");
        assert!(!super::compiled_extraction_requirements(&cache,&altered).unwrap().unwrap().iter().any(|feature|feature==super::SQUAD_BEGIN_FEATURE));
        assert_eq!(crate::maps::hash_file(&cache).unwrap(),map.sha256);
        let scene=crate::maps::scenario_logic_readback(&cache,&map).unwrap();
        let index=scene.names.iter().position(|name|name.name=="extraction_squad_01").unwrap();
        let terminal=scene.devices.iter().find(|device|device.class=="ctrl"&&device.name_index==index as i16).unwrap();
        let hub=scene.volumes.iter().find(|volume|volume.name=="extraction_return").unwrap().geometry.as_ref().unwrap();
        assert!(hub.contains(terminal.position));
        let model=map.tags.iter().find(|tag|tag.class=="ctrl"&&tag.path.replace('\\',"/").eq_ignore_ascii_case(&terminal.tag_path.replace('\\',"/"))).unwrap();
        let (_,mesh)=crate::render::preview_owned_object_model(&cache,&map.sha256,&map,model.id).unwrap();
        let offset=crate::render::upright_model_base_offset(&mesh).unwrap();
        let support=crate::maps::bsp_point_locations(&cache,&map,&[terminal.position],Some(2.)).unwrap();
        assert_eq!(support[0].ground.len(),1,"One readable surface must support the numbered terminal");
        let surface=support[0].ground[0].z;
        eprintln!("Numbered terminal origin {:?}, collision surface {surface}, measured model base offset {offset}, bottom gap {}",terminal.position,terminal.position[2]-surface-offset);
        eprintln!("Numbered Extraction cache {} requires {features:?}",map.sha256);
    }

    #[test]
    fn detects_only_supported_native_squad_callback_signatures(){
        let script=|name:&str,script_type,return_type|crate::maps::Script{name:name.into(),script_type,return_type};
        let valid=vec![script("forerunner_squad_01_begin",2,4),script("forerunner_squad_22_begin",1,4),script("forerunner_squad_01_aborted",2,4)];
        assert_eq!(squad_callbacks(&valid,"_begin").unwrap(),[1,22].into_iter().collect());
        assert_eq!(squad_callbacks(&valid,"_aborted").unwrap(),[1].into_iter().collect());
        for bad in [script("forerunner_squad_01_begin",3,4),script("forerunner_squad_01_begin",2,5),script("forerunner_squad_23_begin",2,4)]{
            assert!(squad_callbacks(&[bad],"_begin").is_err());
        }
        assert!(squad_callbacks(&[valid[0].clone(),valid[0].clone()],"_begin").is_err());
    }

    #[test]
    fn squad_native_contract_names_are_bounded_and_do_not_guess_other_scripts(){
        for number in [1,9,22]{assert_eq!(squad_interface_number(&format!("forerunner_squad_{number:02}_players"),"forerunner_squad_","_players").unwrap(),Some(number));}
        for name in ["forerunner_squad_1_players","forerunner_squad_00_players","forerunner_squad_23_players","forerunner_squad_ab_players"]{assert!(squad_interface_number(name,"forerunner_squad_","_players").is_err());}
        assert_eq!(squad_interface_number("forerunner_extraction_complete","forerunner_squad_","_players").unwrap(),None);
        assert_eq!(squad_interface_number("extraction_squad_01_ready","extraction_squad_","_ready").unwrap(),Some(1));
    }

    #[test]
    fn independent_squad_missions_require_real_settlement_and_isolated_spawn_owners(){
        let beat=|id:&str,trigger:&str,scope:u8|serde_json::from_value::<MissionBeat>(serde_json::json!({"id":id,"title":id,"objective":id,"trigger":trigger,"triggerRef":"extraction_activate","encounterName":"","squadNumber":scope})).unwrap();
        let mut missions=vec![beat("combat","encounterCleared",1),beat("end","forerunnerExtractionSettled",1),beat("manual","manual",2),beat("end2","forerunnerExtractionSettled",2)];
        missions[0].encounter_name="guards".into();validate_mission_scopes(&missions).unwrap();
        let saved=serde_json::to_value(&missions).unwrap();assert_eq!(saved[0]["squadNumber"],1);
        let reopened:Vec<MissionBeat>=serde_json::from_value(saved).unwrap();assert_eq!(missions,reopened);
        missions[2].trigger="encounterCleared".into();missions[2].encounter_name="GUARDS/patrol".into();assert!(validate_mission_scopes(&missions).unwrap_err().to_string().contains("encounter spawn"));
        missions[2].trigger="manual".into();missions[0].hud_objective=Some(true);assert!(validate_mission_scopes(&missions).unwrap_err().to_string().contains("shared native HUD"));
        missions[0].allow_shared_presentation=Some(true);validate_mission_scopes(&missions).unwrap();
        missions[0].checkpoint=Some(true);assert!(validate_mission_scopes(&missions).is_err());missions[0].checkpoint=None;
        missions[3].trigger="manual".into();assert!(validate_mission_scopes(&missions).unwrap_err().to_string().contains("final settled"));
        missions[3].trigger="forerunnerExtractionSettled".into();missions[3].squad_number=Some(23);assert!(validate_mission_scopes(&missions).is_err());
    }

}
