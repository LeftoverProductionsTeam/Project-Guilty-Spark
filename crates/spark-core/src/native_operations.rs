//! Reviewed Invader command recipes and comparison of its native field output.
//! This is orchestration, not another native tag parser or tag schema.
use crate::{invalid, safe_relative, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest,Sha256};
use std::path::Path;
#[path="native_command_lists.rs"] mod command_lists;
#[path="native_transport.rs"] mod transport;
#[path="native_factions.rs"] mod factions;
pub use factions::{NativeFactionBody,NativeFactionBodyBinding,NativeFactionKit,NativeFactionSnapshot,NativeSquadTerminal,NativeSquadTerminalSnapshot};
pub fn native_squad_terminal_snapshots(fields:&str)->Result<Vec<NativeSquadTerminalSnapshot>>{factions::squad_snapshots(fields)}
pub fn verify_native_squad_terminals(expected:&[NativeSquadTerminalSnapshot],cache:&Path,map:&crate::maps::MapInspection)->Result<()>{factions::verify_squad_cache(expected,cache,map)}
pub fn verify_faction_arms_source(body:&NativeFactionBody,profile:&crate::firefight::NativePlayerProfile,read:impl FnMut(&str)->Result<String>)->Result<Vec<String>>{factions::verify_arms_source(body,profile,read)}
pub(crate) use factions::arms_path as faction_arms_path;
pub fn validate_faction_control_source(fields:&str)->Result<()>{factions::validate_control_source(fields)}
pub fn native_faction_snapshots(fields:&str)->Result<Vec<NativeFactionSnapshot>>{factions::snapshots(fields)}
pub fn verify_native_faction_control_values(trigger:&str,initially_off:&str)->Result<()>{factions::verify_control_values(trigger,initially_off)}
pub fn verify_native_faction_kits(expected:&[NativeFactionSnapshot],cache:&Path,map:&crate::maps::MapInspection)->Result<()>{factions::verify_cache(expected,cache,map)}
pub use transport::{TransportAppend,TransportSnapshot,VehicleFlightTuning,NativeMovementRoute,NativeTransportPilotBinding};
pub use transport::NativeMovementRoute as TransportFlightRoute;
pub fn native_transport_pilot_bindings(fields:&str,choices:&NativeTransportChoices,read:impl FnMut(&str)->Result<String>,graph:impl FnMut(&str)->Result<Vec<String>>)->Result<Vec<NativeTransportPilotBinding>>{transport::pilot_bindings(fields,choices,read,graph)}
pub fn native_transport_routes(fields:&str)->Result<Vec<TransportFlightRoute>>{native_movement_routes(fields,true)}
pub fn native_escort_routes(fields:&str)->Result<Vec<NativeMovementRoute>>{native_movement_routes(fields,false)}
fn native_movement_routes(fields:&str,require_stop:bool)->Result<Vec<NativeMovementRoute>>{
    let routes=native_command_source(fields)?;
    let volumes=scenario_volume_choices(fields)?;
    Ok(routes.lists.iter().map(|route|transport::movement_route(route,&volumes,require_stop)).collect())
}
pub fn native_vehicle_flight(fields:&str)->Result<VehicleFlightTuning>{transport::flight_source(fields)}
pub fn scenario_transport_snapshots(fields:&str,names:&[String])->Result<Vec<TransportSnapshot>>{transport::snapshots(fields,names)}
pub fn complete_transport_snapshots(fields:&str)->Result<Vec<TransportSnapshot>>{let values=scenario_transport_choices(fields)?;let names=values.vehicles.iter().filter(|vehicle|["boarded","called","landed"].iter().all(|suffix|values.groups.contains(&format!("{}_{suffix}",vehicle.name)))).map(|v|v.name.clone()).collect::<Vec<_>>();transport::snapshots(fields,&names)}
pub fn validate_transport_vehicle_source(fields:&str)->Result<()> {transport::validate_vehicle_source(fields)}
pub use command_lists::{NativeCommand,NativeCommandList,NativeCommandSource,COMMAND_ATOMS};
pub const CONTROL_TYPES:[&str;4]=["toggle_switch","on_button","off_button","call_button"];
pub const CONTROL_TRIGGERS:[&str;2]=["touched_by_player","destroyed"];
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct NativeControlSettings {pub control_type:String,pub trigger:String,pub call_value:f64,pub automatic_activation_radius:f64,pub delay_seconds:f64}
impl NativeControlSettings {
    fn validate(&self)->Result<()> {
        if !CONTROL_TYPES.contains(&self.control_type.as_str())||!CONTROL_TRIGGERS.contains(&self.trigger.as_str())||
            !self.call_value.is_finite()||!(0.0..=1.0).contains(&self.call_value)||
            !self.automatic_activation_radius.is_finite()||!(0.0..=10000.0).contains(&self.automatic_activation_radius)||
            !self.delay_seconds.is_finite()||!(0.0..=300.0).contains(&self.delay_seconds){return invalid("Choose a native control type/trigger, call value0–1, activation radius0–10000 and delay0–300seconds");}Ok(())
    }
    fn values(&self)->[(&'static str,String);5]{[("type",self.control_type.clone()),("triggers_when",self.trigger.clone()),("call_value",self.call_value.to_string()),("automatic_activation_radius",self.automatic_activation_radius.to_string()),("delay_time",self.delay_seconds.to_string())]}
    fn close(&self,other:&Self)->bool{self.control_type==other.control_type&&self.trigger==other.trigger&&[(self.call_value,other.call_value),(self.automatic_activation_radius,other.automatic_activation_radius),(self.delay_seconds,other.delay_seconds)].iter().all(|(a,b)|(a-b).abs()<=0.000001f64.max(a.abs()*f64::from(f32::EPSILON)*2.))}
}
/// Reuse the installed reader's complete field tree; no new binary schema.
fn selected_native_enum(fields: &str, name: &str, choices: &[&str]) -> Result<String> {
    let (_, rows) = native_children(fields, name, "enum", choices.len())?;
    let mut value = None;
    for ((_, text), choice) in rows.iter().zip(choices) {
        let parts = text.split_whitespace().collect::<Vec<_>>();
        if parts != [*choice, "enum", "value"] && parts != [*choice, "(*)", "enum", "value"] {
            return invalid(format!("Native {name} enum shape or choices changed"));
        }
        if parts.len() == 4 && value.replace(choice.to_string()).is_some() {
            return invalid(format!("Native {name} enum is ambiguous"));
        }
    }
    value.ok_or_else(|| crate::SparkError::Invalid(format!("Native {name} enum has no selected value")))
}
pub fn native_control_settings(fields:&str)->Result<NativeControlSettings>{
    let value=NativeControlSettings{control_type:selected_native_enum(fields,"type",&CONTROL_TYPES)?,trigger:selected_native_enum(fields,"triggers_when",&CONTROL_TRIGGERS)?,call_value:number(fields,"call_value")?,automatic_activation_radius:number(fields,"automatic_activation_radius")?,delay_seconds:number(fields,"delay_time")?};value.validate()?;Ok(value)
}
fn reviewed_control_settings(before:&str,after:&str,settings:&NativeControlSettings)->Result<Vec<FieldDifference>>{
    settings.validate()?;let old=native_control_settings(before)?;let actual=native_control_settings(after)?;
    if old.close(&actual)||!settings.close(&actual){return invalid("Native control settings did not change or differ from the reviewed request");}
    let preserved=|fields:&str|->Result<String>{let mut allowed=std::collections::BTreeSet::new();for(name,count)in[("type",4),("triggers_when",2)]{for(i,_)in native_children(fields,name,"enum",count)?.1{allowed.insert(i);}}
        Ok(fields.lines().enumerate().filter(|(i,line)|!allowed.contains(i)&&!["call_value (","automatic_activation_radius (","delay_time ("].iter().any(|prefix|line.starts_with(prefix))).map(|(_,line)|line).collect::<Vec<_>>().join("\n"))};
    if preserved(before)?!=preserved(after)?{return invalid("Control edit changed unrelated native fields, flags or dependencies");}
    Ok(old.values().into_iter().zip(actual.values()).filter(|((_,a),(_,b))|a!=b).map(|((key,a),(_,b))|FieldDifference{before:format!("{key}: {a}"),after:format!("{key}: {b}")}).collect())
}

const MACHINE_TYPES: [&str; 3] = ["door", "platform", "gear"];

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeMachineSettings {
    pub machine_type: String,
    pub power_transition_time: f64,
    pub power_acceleration_time: f64,
    pub position_transition_time: f64,
    pub position_acceleration_time: f64,
    pub depowered_position_transition_time: f64,
    pub depowered_position_acceleration_time: f64,
}

impl NativeMachineSettings {
    fn times(&self) -> [(&'static str, f64); 6] {
        [
            ("power_transition_time", self.power_transition_time),
            ("power_acceleration_time", self.power_acceleration_time),
            ("position_transition_time", self.position_transition_time),
            ("position_acceleration_time", self.position_acceleration_time),
            ("depowered_position_transition_time", self.depowered_position_transition_time),
            ("depowered_position_acceleration_time", self.depowered_position_acceleration_time),
        ]
    }

    pub fn validate(&self) -> Result<()> {
        if !MACHINE_TYPES.contains(&self.machine_type.as_str())
            || self.times().iter().any(|&(_, value)| value < 0.0 || !(value as f32).is_finite())
        {
            return invalid("Choose a native machine type and finite nonnegative transition and acceleration times");
        }
        Ok(())
    }

    pub fn close(&self, other: &Self) -> bool {
        self.machine_type == other.machine_type
            && self.times().iter().zip(other.times()).all(|(&(_, expected), (_, actual))| {
                (expected - actual).abs() <= 0.000001_f64.max(expected.abs() * f64::from(f32::EPSILON) * 2.0)
            })
    }

    fn values(&self) -> impl Iterator<Item = (&'static str, String)> {
        std::iter::once(("machine_type", self.machine_type.clone()))
            .chain(self.times().into_iter().map(|(name, value)| (name, value.to_string())))
    }
}

pub fn native_machine_settings(fields: &str) -> Result<NativeMachineSettings> {
    let settings = NativeMachineSettings {
        machine_type: selected_native_enum(fields, "machine_type", &MACHINE_TYPES)?,
        power_transition_time: number(fields, "power_transition_time")?,
        power_acceleration_time: number(fields, "power_acceleration_time")?,
        position_transition_time: number(fields, "position_transition_time")?,
        position_acceleration_time: number(fields, "position_acceleration_time")?,
        depowered_position_transition_time: number(fields, "depowered_position_transition_time")?,
        depowered_position_acceleration_time: number(fields, "depowered_position_acceleration_time")?,
    };
    settings.validate()?;
    Ok(settings)
}

fn reviewed_machine_settings(before: &str, after: &str, requested: &NativeMachineSettings) -> Result<Vec<FieldDifference>> {
    let old = native_machine_settings(before)?;
    let actual = native_machine_settings(after)?;
    if old.close(&actual) || !requested.close(&actual) {
        return invalid("Native machine settings did not change or differ from the review");
    }
    let protected = |fields: &str| -> Result<Vec<String>> {
        let (_, choices) = native_children(fields, "machine_type", "enum", MACHINE_TYPES.len())?;
        let numbers = requested.times().map(|(name, _)| format!("{name} ("));
        Ok(fields.lines().enumerate().filter(|(index, line)| {
            !choices.iter().any(|(choice, _)| choice == index) && !numbers.iter().any(|key| line.starts_with(key))
        }).map(|(_, line)| line.to_owned()).collect())
    };
    if protected(before)? != protected(after)? {
        return invalid("Machine edit changed unrelated native fields, flags or dependencies");
    }
    Ok(old.values().zip(actual.values()).filter(|((_, before), (_, after))| before != after)
        .map(|((name, before), (_, after))| FieldDifference {
            before: format!("{name}: {before}"), after: format!("{name}: {after}"),
        }).collect())
}

fn command_append_is_false(value:&bool)->bool{!*value}
pub fn native_command_source(fields:&str)->Result<NativeCommandSource>{command_lists::source(fields)}
/// Read-only native seat labels; duplicates retain distinct capacity slots.
pub fn native_vehicle_seats(fields:&str)->Result<Vec<String>> {
 let seats=array_listing(fields,"seats")?;if seats.count>16{return invalid("Native vehicle exceeds16seats");}
 let mut labels=vec![];for item in array_items(&seats,"seats")?{
  let row=direct_struct_fields(item)?;let values=row.lines().filter_map(|line|line.strip_prefix("label (")).collect::<Vec<_>>();
  if values.len()!=1{return invalid("Native vehicle seat label is missing or ambiguous");}
  let(label,kind)=values[0].rsplit_once(')').ok_or_else(||crate::SparkError::Invalid("Native seat label is malformed".into()))?;
  if kind.trim()!="string"||label.len()>31||label.chars().any(char::is_control){return invalid("Native seat label has an unsupported shape");}labels.push(label.into());
 }Ok(labels)
}
/// Only real driver-flag seats may be offered to an authored AI pilot.
/// Labels still come from the same bounded native inventory above.
pub fn native_vehicle_pilot_seats(fields:&str)->Result<Vec<String>>{
 let labels=native_vehicle_seats(fields)?;let table=array_listing(fields,"seats")?;let mut pilots=vec![];
 for(label,row)in labels.iter().zip(array_items(&table,"seats")?){let root=direct_struct_fields(row)?;let flat=root.lines().map(str::trim).collect::<Vec<_>>().join("\n");let driver=number(&flat,"driver")?;
  if driver!=0.&&driver!=1.{return invalid("Native driver seat flag is invalid");}
  if driver==1.{if label.is_empty()||labels.iter().filter(|v|*v==label).count()!=1{return invalid("Native pilot seat label is empty or ambiguous");}pilots.push(label.clone());}
 }Ok(pilots)
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Operation {
    VehicleFlight {tuning:VehicleFlightTuning,#[serde(rename="sourceSha256")] source_sha256:String},
    SquadTerminals {terminals:Vec<NativeSquadTerminal>,#[serde(rename="sourceSha256")] source_sha256:String},
    FactionBody {body:NativeFactionBody,#[serde(rename="sourceSha256")] source_sha256:String,#[serde(rename="replaceExisting",default,skip_serializing_if="command_append_is_false")] replace_existing:bool},
    FactionKits {kits:Vec<NativeFactionKit>,#[serde(rename="sourceSha256")] source_sha256:String},
    AppendTransport {transport:TransportAppend,#[serde(rename="sourceSha256")] source_sha256:String},
    CommandList {list:NativeCommandList,#[serde(rename="sourceSha256")] source_sha256:String,#[serde(default,skip_serializing_if="command_append_is_false")] append:bool},
    MachineSettings {settings:NativeMachineSettings,#[serde(rename="sourceSha256")] source_sha256:String},
    ControlSettings {settings:NativeControlSettings,#[serde(rename="sourceSha256")] source_sha256:String},
    Dependencies,
    DevicePlacement {device:NativeDevicePlacement,#[serde(rename="sourceSha256")] source_sha256:String},
    DeviceGroupAppend {
        name: String,
        #[serde(rename = "initialValue")]
        initial_value: f32,
        #[serde(rename = "changeOnce")]
        change_once: bool,
        #[serde(rename = "sourceSha256")]
        source_sha256: String,
    },
    TriggerVolume {index:u16,name:String,geometry:crate::maps::ScenarioLogicVolumeGeometry,#[serde(rename="sourceSha256")] source_sha256:String,#[serde(default,skip_serializing_if="command_append_is_false")] append:bool},
    CutsceneFlag {point:crate::maps::NativeCutsceneFlag,#[serde(rename="sourceSha256")] source_sha256:String,#[serde(default,skip_serializing_if="command_append_is_false")] append:bool},
    CutsceneCamera {point:crate::maps::NativeCameraPoint,#[serde(rename="sourceSha256")] source_sha256:String,#[serde(default,skip_serializing_if="command_append_is_false")] append:bool},
    AppendEncounter { name:String, #[serde(rename="actorPath")] actor_path:String, position:[f32;3], #[serde(rename="startActive")] start_active:bool,
        #[serde(default="single_actor")] count:u16, #[serde(default="actor_spacing")] spacing:f32,
        #[serde(default,skip_serializing_if="Option::is_none")] difficulty:Option<EncounterDifficulty>,
        #[serde(rename="majorUpgrade",default,skip_serializing_if="Option::is_none")] major_upgrade:Option<String> },
    AppendEncounters { encounters:Vec<EncounterAppend>, #[serde(rename="sourceRules",default,skip_serializing_if="Option::is_none")] source_rules:Option<crate::firefight::FirefightConfig> },
    EncounterSquadCounts { encounter:u16,squad:u16,#[serde(rename="encounterName")] encounter_name:String,#[serde(rename="squadName")] squad_name:String,#[serde(rename="normalCount")] normal_count:u16,#[serde(rename="insaneCount")] insane_count:u16,#[serde(rename="sourceSha256")] source_sha256:String },
    EncounterSquadCountsBatch { edits:Vec<SquadCountEdit>,#[serde(rename="sourceSha256")] source_sha256:String },
    PlayerStartPosition {index:u16,#[serde(rename="copyFrom",default,skip_serializing_if="Option::is_none")] copy_from:Option<u16>,position:[f32;3],#[serde(rename="facingRadians")] facing_radians:f32,#[serde(rename="sourceSha256")] source_sha256:String},
    EncounterStartPosition {encounter:u16,squad:u16,start:u16,#[serde(rename="encounterName")] encounter_name:String,
        #[serde(rename="squadName")] squad_name:String,position:[f32;3],#[serde(rename="sourceSha256")] source_sha256:String,
        #[serde(rename="facingRadians",default,skip_serializing_if="Option::is_none")] facing_radians:Option<f32>,
        #[serde(rename="commandList",default,skip_serializing_if="Option::is_none")] command_list:Option<i16>},
    EncounterSquadPatrol {encounter:u16,squad:u16,#[serde(rename="encounterName")] encounter_name:String,#[serde(rename="squadName")] squad_name:String,route:ScenarioPatrolRoute,#[serde(rename="sourceSha256")] source_sha256:String},
    EncounterSquadBehavior {encounter:u16,squad:u16,#[serde(rename="encounterName")] encounter_name:String,#[serde(rename="squadName")] squad_name:String,behavior:ScenarioSquadBehavior,#[serde(rename="sourceSha256")] source_sha256:String},
    EncounterFiringPosition {encounter:u16,point:u16,#[serde(rename="encounterName")] encounter_name:String,position:[f32;3],group:String,#[serde(rename="sourceSha256")] source_sha256:String},
    EncounterSquadFiringGroups {encounter:u16,squad:u16,#[serde(rename="encounterName")] encounter_name:String,#[serde(rename="squadName")] squad_name:String,groups:FiringGroups,#[serde(rename="sourceSha256")] source_sha256:String},
    BoundingRadius { value: f64 },
    HudDuplicate { array:String,index:u16,#[serde(rename="sourceSha256")] source_sha256:String },
    LensFlareScaleRepair,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct SquadCountEdit {
    pub encounter:u16,pub squad:u16,pub encounter_name:String,pub squad_name:String,pub normal_count:u16,pub insane_count:u16,
}
impl SquadCountEdit {
    fn operation(&self,source_sha256:&str)->Operation {Operation::EncounterSquadCounts{encounter:self.encounter,squad:self.squad,
        encounter_name:self.encounter_name.clone(),squad_name:self.squad_name.clone(),normal_count:self.normal_count,insane_count:self.insane_count,source_sha256:source_sha256.into()}}
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct EncounterDifficulty {pub normal:u16,pub insane:u16}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct EncounterGrid {pub total:u16,pub offset:u16}
// Native ScenarioReturnState values; moving states need separately authored routes.
#[derive(Clone,Copy,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="snake_case")]
pub enum CampaignAiState {Sleeping,Alert,Guarding,Searching,Fleeing,MovingRepeatSamePosition,MovingLoop,MovingLoopBackAndForth,MovingLoopRandomly,MovingRandomly}
impl CampaignAiState {
    fn native(self)->(&'static str,u16){match self{Self::Sleeping=>("sleeping",1),Self::Alert=>("alert",2),Self::Guarding=>("guarding",8),Self::Searching=>("searching",10),Self::Fleeing=>("fleeing",11),Self::MovingRepeatSamePosition=>("moving_repeat_same_position",3),Self::MovingLoop=>("moving_loop",4),Self::MovingLoopBackAndForth=>("moving_loop_back_and_forth",5),Self::MovingLoopRandomly=>("moving_loop_randomly",6),Self::MovingRandomly=>("moving_randomly",7)}}
}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct EncounterBehavior {pub initial_state:CampaignAiState,pub return_state:CampaignAiState}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct PatrolPoint {pub id:String,pub position:[f32;3],pub facing_radians:f32,pub wait_seconds:[f32;2],pub weight:f32,
    #[serde(default="visible_start",skip_serializing_if="is_visible_start")] pub visible:bool,
    #[serde(default,skip_serializing_if="is_unlocked_start")] pub locked:bool}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct EncounterPatrol {pub points:Vec<PatrolPoint>}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct FiringPoint {pub id:String,pub position:[f32;3],pub group:String,
    #[serde(default="visible_start",skip_serializing_if="is_visible_start")] pub visible:bool,
    #[serde(default,skip_serializing_if="is_unlocked_start")] pub locked:bool}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct FiringGroups {pub attacking:Vec<String>,pub attacking_search:Vec<String>,pub attacking_guard:Vec<String>,pub defending:Vec<String>,pub defending_search:Vec<String>,pub defending_guard:Vec<String>}
impl FiringGroups {
    fn fields(&self)->[(&'static str,&[String]);6]{[("attacking",&self.attacking),("attacking_search",&self.attacking_search),("attacking_guard",&self.attacking_guard),("defending",&self.defending),("defending_search",&self.defending_search),("defending_guard",&self.defending_guard)]}
    fn masks(&self)->Result<[u32;6]>{let mut masks=[0;6];for(i,(_,groups))in self.fields().iter().enumerate(){let mut seen=std::collections::BTreeSet::new();for g in *groups{if g.len()!=1||!g.as_bytes()[0].is_ascii_lowercase()||!seen.insert(g){return invalid("Tactical selections require distinct native groups A–Z");}masks[i]|=1u32<<(g.as_bytes()[0]-b'a');}}Ok(masks)}
}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct EncounterCombat {pub points:Vec<FiringPoint>,pub groups:FiringGroups}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct EncounterStart {
    pub id:String,pub position:[f32;3],pub facing_radians:f32,
    #[serde(default="visible_start",skip_serializing_if="is_visible_start")] pub visible:bool,
    #[serde(default,skip_serializing_if="is_unlocked_start")] pub locked:bool,
}
fn visible_start()->bool{true}
fn is_visible_start(value:&bool)->bool{*value}
fn is_unlocked_start(value:&bool)->bool{!*value}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct EncounterAppend {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub major_upgrade: Option<String>,
    pub name:String,pub actor_path:String,pub position:[f32;3],pub start_active:bool,
    #[serde(default,skip_serializing_if="Option::is_none")] pub difficulty:Option<EncounterDifficulty>,
    #[serde(default="single_actor")] pub count:u16,
    #[serde(default="actor_spacing")] pub spacing:f32,
    #[serde(default,skip_serializing_if="Option::is_none")] pub grid:Option<EncounterGrid>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub starts:Option<Vec<EncounterStart>>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub behavior:Option<EncounterBehavior>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub patrol:Option<EncounterPatrol>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub combat:Option<EncounterCombat>,
}
impl EncounterAppend {
    fn states(&self)->(CampaignAiState,CampaignAiState){self.behavior.as_ref().map(|b|(b.initial_state,b.return_state)).unwrap_or((CampaignAiState::Alert,CampaignAiState::Alert))}
    pub fn difficulty_counts(&self)->(u16,u16) {self.difficulty.as_ref().map(|value|(value.normal,value.insane)).unwrap_or((self.count,self.count))}
    pub(crate) fn require_mcc_search_groups(&self)->Result<()>{if let Some(c)=&self.combat{let m=c.groups.masks()?;if m[0]&!m[1]!=0||m[0]&!m[4]!=0{return invalid("MCC Halo Tool includes attacking groups in both search contexts. In Creator Studio → Firing positions & tactical groups → MCC search-group compatibility, review and choose Include attacking groups in both search contexts, then Save/rebuild. Source was not changed automatically");}}Ok(())}
    fn combat_points(&self)->Result<&[FiringPoint]>{let Some(combat)=&self.combat else{return Ok(&[]);};if combat.points.is_empty()||combat.points.len()>512{return invalid("Native combat source needs1–512 firing positions");}combat.groups.masks()?;let mut ids=std::collections::BTreeSet::new();for p in &combat.points{if p.id.is_empty()||p.id.len()>64||!p.id.bytes().all(|c|c.is_ascii_alphanumeric()||b"_-".contains(&c))||!ids.insert(&p.id)||p.position.iter().any(|v|!v.is_finite()||v.abs()>2048.)||p.group.len()!=1||!p.group.as_bytes()[0].is_ascii_lowercase(){return invalid("Invalid native firing point identity, position or group");}}Ok(&combat.points)}
    fn firing_points(&self)->Result<Vec<FiringPoint>>{let custom=self.combat_points()?;if self.combat.is_some(){return Ok(custom.to_vec());}Ok(self.poses()?.into_iter().map(|p|FiringPoint{id:p.id,position:p.position,group:"a".into(),visible:true,locked:false}).collect())}
    fn patrol_points(&self)->Result<&[PatrolPoint]> {
        let points=self.patrol.as_ref().map(|p|p.points.as_slice()).unwrap_or(&[]);
        if self.patrol.is_some()&&(points.is_empty()||points.len()>32){return invalid("Native patrol needs1–32 movement points");}
        let mut ids=std::collections::BTreeSet::new();for p in points{if p.id.is_empty()||p.id.len()>64||!p.id.bytes().all(|c|c.is_ascii_alphanumeric()||b"_-".contains(&c))||!ids.insert(&p.id)||p.position.iter().any(|v|!v.is_finite()||v.abs()>2048.)||!p.facing_radians.is_finite()||p.facing_radians.abs()>std::f32::consts::TAU+1e-6||!p.weight.is_finite()||p.weight<=0.||p.weight>100.||p.wait_seconds.iter().any(|v|!v.is_finite()||*v<0.||*v>3600.)||p.wait_seconds[0]>p.wait_seconds[1]{return invalid("Invalid native patrol pose, weight or wait bounds");}}
        let(initial,returning)=self.states();for state in [initial,returning]{let required=match state{CampaignAiState::MovingRepeatSamePosition|CampaignAiState::MovingRandomly=>1,CampaignAiState::MovingLoop|CampaignAiState::MovingLoopBackAndForth|CampaignAiState::MovingLoopRandomly=>2,_=>0};if points.len()<required{return invalid("Author enough patrol points before selecting native movement behavior");}}
        Ok(points)
    }
    pub fn poses(&self)->Result<Vec<EncounterStart>> {
        self.patrol_points()?;self.combat_points()?;
        if let Some(starts)=&self.starts {
            if self.grid.is_some()||self.count==0||self.count>32||starts.len()!=usize::from(self.count){return invalid("Individual campaign starts must match the authored count and cannot override a partitioned wave grid");}
            let mut ids=std::collections::BTreeSet::new();
            for start in starts {
                if start.id.is_empty()||start.id.len()>64||!start.id.bytes().all(|v|v.is_ascii_alphanumeric()||b"_-".contains(&v))||!ids.insert(&start.id)||start.position.iter().any(|v|!v.is_finite()||v.abs()>2048.)||!start.facing_radians.is_finite()||start.facing_radians.abs()>std::f32::consts::TAU+1e-6{return invalid("Campaign starts need distinct authoring IDs, finite XYZ within2048 and facing within one turn");}
            }
            return Ok(starts.clone());
        }
        let(total,offset)=self.grid.as_ref().map(|grid|(usize::from(grid.total),usize::from(grid.offset))).unwrap_or((usize::from(self.count),0));
        Ok(crate::firefight::native_actor_start_grid(self.position,total,offset,usize::from(self.count),self.spacing)?.into_iter().enumerate().map(|(i,value)|EncounterStart{id:format!("grid-{i}"),position:value.0,facing_radians:0.,visible:true,locked:false}).collect())
    }
    pub fn positions(&self)->Result<Vec<[f32;3]>> {Ok(self.poses()?.into_iter().map(|value|value.position).collect())}
    pub fn operation(&self)->Operation {Operation::AppendEncounter{name:self.name.clone(),actor_path:self.actor_path.clone(),position:self.position,start_active:self.start_active,count:self.count,spacing:self.spacing,difficulty:self.difficulty.clone(),major_upgrade:self.major_upgrade.clone()}}
}
fn single_actor()->u16{1}
fn actor_spacing()->f32{0.75}
impl Operation {
    /// One exhaustive source binding for preview, retained reviews and readback.
    pub fn expected_source_sha256(&self)->Option<&str>{match self{
        Self::MachineSettings{source_sha256,..}|Self::ControlSettings{source_sha256,..}|Self::SquadTerminals{source_sha256,..}|Self::FactionKits{source_sha256,..}|Self::FactionBody{source_sha256,..}|Self::VehicleFlight{source_sha256,..}|Self::AppendTransport{source_sha256,..}|Self::CommandList{source_sha256,..}|Self::PlayerStartPosition{source_sha256,..}|Self::DevicePlacement{source_sha256,..}|Self::DeviceGroupAppend{source_sha256,..}|Self::TriggerVolume{source_sha256,..}|Self::CutsceneFlag{source_sha256,..}|Self::CutsceneCamera{source_sha256,..}|Self::HudDuplicate{source_sha256,..}|Self::EncounterSquadCounts{source_sha256,..}|Self::EncounterSquadCountsBatch{source_sha256,..}|Self::EncounterStartPosition{source_sha256,..}|Self::EncounterSquadPatrol{source_sha256,..}|Self::EncounterSquadBehavior{source_sha256,..}|Self::EncounterFiringPosition{source_sha256,..}|Self::EncounterSquadFiringGroups{source_sha256,..}=>Some(source_sha256),
        Self::Dependencies|Self::AppendEncounter{..}|Self::AppendEncounters{..}|Self::BoundingRadius{..}|Self::LensFlareScaleRepair=>None,
    }}
    pub fn is_vehicle_flight(&self)->bool{matches!(self,Self::VehicleFlight{..})}
    pub fn is_faction_edit(&self)->bool{matches!(self,Self::FactionKits{..}|Self::FactionBody{..}|Self::SquadTerminals{..})}
    pub fn is_transport_append(&self)->bool{matches!(self,Self::AppendTransport{..})}
    pub fn is_command_edit(&self)->bool{matches!(self,Self::CommandList{..})}
    pub fn is_device_edit(&self)->bool{matches!(self,Self::DevicePlacement{..}|Self::DeviceGroupAppend{..})}
    pub fn is_trigger_edit(&self)->bool{matches!(self,Self::TriggerVolume{..})}
    pub fn is_camera_edit(&self)->bool{matches!(self,Self::CutsceneCamera{..}|Self::CutsceneFlag{..})}
    pub fn is_flag_edit(&self)->bool{matches!(self,Self::CutsceneFlag{..})}

    pub fn is_squad_start_edit(&self)->bool{matches!(self,Self::EncounterStartPosition{..})}
    pub fn is_player_start_edit(&self)->bool{matches!(self,Self::PlayerStartPosition{..})}
    pub fn is_scenario_ai_edit(&self)->bool{self.is_squad_count_edit()||self.is_squad_start_edit()||self.combat_target_key().is_some()&&!self.is_player_start_edit()}
    pub fn combat_target_key(&self)->Option<(u8,u16,u16)>{match self{Self::PlayerStartPosition{index,..}=>Some((4,*index,0)),Self::EncounterSquadPatrol{encounter,squad,..}=>Some((3,*encounter,*squad)),Self::EncounterSquadBehavior{encounter,squad,..}=>Some((2,*encounter,*squad)),Self::EncounterFiringPosition{encounter,point,..}=>Some((0,*encounter,*point)),Self::EncounterSquadFiringGroups{encounter,squad,..}=>Some((1,*encounter,*squad)),_=>None}}
    pub fn combat_encounter_name(&self)->Option<&str>{match self{Self::EncounterSquadPatrol{encounter_name,..}|Self::EncounterSquadBehavior{encounter_name,..}|Self::EncounterFiringPosition{encounter_name,..}|Self::EncounterSquadFiringGroups{encounter_name,..}=>Some(encounter_name),_=>None}}
    pub fn is_squad_count_edit(&self)->bool {matches!(self,Self::EncounterSquadCounts{..}|Self::EncounterSquadCountsBatch{..})}
    pub fn squad_count_edits(&self)->Result<Vec<SquadCountEdit>> {
        match self {
            Self::EncounterSquadCounts{encounter,squad,encounter_name,squad_name,normal_count,insane_count,..}=>Ok(vec![SquadCountEdit{
                encounter:*encounter,squad:*squad,encounter_name:encounter_name.clone(),squad_name:squad_name.clone(),normal_count:*normal_count,insane_count:*insane_count}]),
            Self::EncounterSquadCountsBatch{edits,..}=>{
                if edits.is_empty()||edits.len()>128{return invalid("Select 1–128 squads per reviewed population operation");}
                Ok(edits.clone())
            },_=>Ok(vec![])
        }
    }
    pub fn is_encounter_append(&self)->bool {matches!(self,Self::AppendEncounter{..}|Self::AppendEncounters{..})}
    pub fn encounter_appends(&self)->Result<Vec<EncounterAppend>> {
        match self {
            Self::AppendEncounter{name,actor_path,position,start_active,count,spacing,difficulty,major_upgrade}=>Ok(vec![EncounterAppend{major_upgrade:major_upgrade.clone(),name:name.clone(),actor_path:actor_path.clone(),position:*position,start_active:*start_active,count:*count,spacing:*spacing,difficulty:difficulty.clone(),grid:None,starts:None,behavior:None,patrol:None,combat:None}]),
            Self::AppendEncounters{encounters,..}=>{
                if encounters.is_empty()||encounters.len()>16{return invalid("Review 1–16 native encounter groups in one operation");}
                Ok(encounters.clone())
            },
            _=>Ok(vec![]),
        }
    }
    pub fn tool_id(&self) -> &'static str {
        match self {
            Self::Dependencies => "invaderDependency",
            Self::MachineSettings { .. } | Self::ControlSettings { .. } | Self::SquadTerminals { .. } | Self::FactionKits { .. } | Self::FactionBody { .. } | Self::VehicleFlight { .. } | Self::AppendTransport { .. } | Self::CommandList { .. } | Self::PlayerStartPosition { .. } | Self::DevicePlacement { .. } | Self::DeviceGroupAppend { .. } | Self::TriggerVolume { .. } | Self::CutsceneFlag { .. } | Self::CutsceneCamera { .. } | Self::EncounterSquadPatrol { .. } | Self::EncounterSquadBehavior { .. } | Self::EncounterFiringPosition { .. } | Self::EncounterSquadFiringGroups { .. } | Self::EncounterStartPosition { .. } | Self::EncounterSquadCounts { .. } | Self::EncounterSquadCountsBatch { .. } | Self::HudDuplicate { .. } | Self::BoundingRadius { .. } | Self::AppendEncounter { .. } | Self::AppendEncounters { .. } => "invaderNative",
            Self::LensFlareScaleRepair => "invaderRepair",
        }
    }
    pub fn field(&self) -> Option<&'static str> {
        match self {
            Self::Dependencies | Self::MachineSettings { .. } | Self::ControlSettings { .. } | Self::SquadTerminals { .. } | Self::FactionKits { .. } | Self::FactionBody { .. } | Self::VehicleFlight { .. } | Self::AppendTransport { .. } | Self::CommandList { .. } | Self::PlayerStartPosition { .. } | Self::DevicePlacement { .. } | Self::DeviceGroupAppend { .. } | Self::TriggerVolume { .. } | Self::CutsceneFlag { .. } | Self::CutsceneCamera { .. } | Self::EncounterSquadPatrol { .. } | Self::EncounterSquadBehavior { .. } | Self::EncounterFiringPosition { .. } | Self::EncounterSquadFiringGroups { .. } | Self::EncounterStartPosition { .. } | Self::EncounterSquadCounts { .. } | Self::EncounterSquadCountsBatch { .. } | Self::HudDuplicate { .. } | Self::AppendEncounter { .. } | Self::AppendEncounters { .. } => None,
            Self::BoundingRadius { .. } => Some("bounding_radius"),
            Self::LensFlareScaleRepair => Some("rotation_function_scale"),
        }
    }
    pub fn target(&self) -> Option<f64> {
        match self {
            Self::Dependencies | Self::MachineSettings { .. } | Self::ControlSettings { .. } | Self::SquadTerminals { .. } | Self::FactionKits { .. } | Self::FactionBody { .. } | Self::VehicleFlight { .. } | Self::AppendTransport { .. } | Self::CommandList { .. } | Self::PlayerStartPosition { .. } | Self::DevicePlacement { .. } | Self::DeviceGroupAppend { .. } | Self::TriggerVolume { .. } | Self::CutsceneFlag { .. } | Self::CutsceneCamera { .. } | Self::EncounterSquadPatrol { .. } | Self::EncounterSquadBehavior { .. } | Self::EncounterFiringPosition { .. } | Self::EncounterSquadFiringGroups { .. } | Self::EncounterStartPosition { .. } | Self::EncounterSquadCounts { .. } | Self::EncounterSquadCountsBatch { .. } | Self::HudDuplicate { .. } | Self::AppendEncounter { .. } | Self::AppendEncounters { .. } => None,
            Self::BoundingRadius { value } => Some(*value),
            Self::LensFlareScaleRepair => Some(0.0),
        }
    }
    pub fn validate(&self, class: &str, tag: &str) -> Result<()> {
        safe_relative(tag)?;
        if tag.starts_with('-') || tag.len() > 240 {
            return invalid("Native tag path is too long or begins with a command option");
        }
        match self {
            Self::VehicleFlight{tuning,source_sha256}=>{if class!="vehi"||source_sha256.len()!=64||!source_sha256.bytes().all(|c|c.is_ascii_hexdigit()){return invalid("Vehicle flight editing needs an exact native vehicle source hash");}tuning.validate()?;}
            Self::SquadTerminals{terminals,source_sha256}=>{if class!="scnr"||source_sha256.len()!=64||!source_sha256.bytes().all(|b|b.is_ascii_hexdigit()){return invalid("Squad terminals need a reviewed scenario source hash");}factions::validate_squad_batch(terminals)?;},
            Self::FactionBody{body,source_sha256,..}=>{if class!="scnr"||source_sha256.len()!=64||!source_sha256.bytes().all(|b|b.is_ascii_hexdigit()){return invalid("Faction body requires its exact reviewed scenario");}body.validate()?;},
            Self::FactionKits{kits,source_sha256}=>{if class!="scnr"||kits.is_empty()||kits.len()>2||source_sha256.len()!=64||!source_sha256.bytes().all(|b|b.is_ascii_hexdigit()){return invalid("Faction kits require a reviewed scenario source hash and one or two kits");}factions::validate_batch(kits)?;},
            Self::AppendTransport{transport,source_sha256}=>{if class!="scnr"||source_sha256.len()!=64||!source_sha256.bytes().all(|c|c.is_ascii_hexdigit()){return invalid("Transport append requires an exact scenario source hash");}transport.validate()?;}
            Self::CommandList{list,source_sha256,..}=>{if class!="scnr"||source_sha256.len()!=64||!source_sha256.bytes().all(|c|c.is_ascii_hexdigit()){return invalid("Command source needs an exact native scenario hash");}list.validate()?;}
            Self::MachineSettings { settings, source_sha256 } => {
                if class != "mach" || !tag.ends_with(".device_machine") || source_sha256.len() != 64
                    || !source_sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
                {
                    return invalid("Machine editing requires its exact native device_machine source");
                }
                settings.validate()?;
            }
            Self::ControlSettings{settings,source_sha256}=>{if class!="ctrl"||source_sha256.len()!=64||!source_sha256.bytes().all(|c|c.is_ascii_hexdigit()){return invalid("Control editing requires its exact native device_control source");}settings.validate()?;}
            Self::DeviceGroupAppend { name, initial_value, source_sha256, .. } => {
                if class != "scnr" || name.is_empty() || name.len() >= 32
                    || !name.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_')
                    || extraction_device_binding(name) || !(*initial_value >= 0. && *initial_value <= 1.)
                    || source_sha256.len() != 64 || !source_sha256.bytes().all(|c| c.is_ascii_hexdigit())
                {
                    return invalid("Use a current scenario, a distinct 1–31 character group name with letters, digits or underscores, and an initial value from 0 to 1. Extraction names are reserved.");
                }
            }
            Self::DevicePlacement{device,source_sha256}=>{if class!="scnr"||!device.valid()||source_sha256.len()!=64||!source_sha256.bytes().all(|c|c.is_ascii_hexdigit()){return invalid("Device editing needs an exact native placement identity/source, finite pose and bounded group indices");}}
            Self::TriggerVolume{index,name,geometry,source_sha256,append}=>{if class!="scnr"||*index>=1024||name.len()>32||name.chars().any(char::is_control)||*append&&!crate::creative::script_ident(name)||!geometry.valid()||source_sha256.len()!=64||!source_sha256.bytes().all(|c|c.is_ascii_hexdigit()){return invalid("Trigger editing needs an exact source/index/name and a finite orthonormal box with positive dimensions");}}
            Self::CutsceneFlag{point,source_sha256,..}=>{
                if class!="scnr"||point.index>=512||point.name.len()>32||point.name.chars().any(char::is_control)||point.position.iter().any(|v|!v.is_finite()||v.abs()>1e6)||point.facing_radians.iter().any(|v|!v.is_finite()||v.abs()>std::f32::consts::TAU+1e-6)||source_sha256.len()!=64||!source_sha256.bytes().all(|v|v.is_ascii_hexdigit()){return invalid("Flag editing needs exact source/index/name and finite XYZ/yaw/pitch");}
            }
            Self::CutsceneCamera{point,source_sha256,..}=>{
                if class!="scnr"||point.index>=512||point.name.len()>32||point.name.chars().any(char::is_control)||point.position.iter().any(|v|!v.is_finite()||v.abs()>1e6)||point.orientation_radians.iter().any(|v|!v.is_finite()||v.abs()>std::f32::consts::TAU+1e-6)||!point.fov_radians.is_finite()||!(5f32.to_radians()..=150f32.to_radians()).contains(&point.fov_radians)||source_sha256.len()!=64||!source_sha256.bytes().all(|v|v.is_ascii_hexdigit()){return invalid("Native camera editing needs exact source/index/name, finite pose and5–150degree FOV");}
            }
            Self::AppendEncounter {name,actor_path,position,count,spacing,difficulty,major_upgrade,..} => {
                if let Some(value) = major_upgrade { major_upgrade_index(value)?; }
                if class!="scnr" {return invalid("Append encounter requires a native scenario tag");}
                if name.is_empty()||name.len()>31||!name.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'_') {return invalid("Encounter name needs1–31ASCII letters, digits or underscores");}
                safe_relative(actor_path)?;
                if actor_path.is_empty()||actor_path.len()>240||actor_path.starts_with('-')||actor_path.ends_with(".actor_variant")||!actor_path.bytes().all(|c|c.is_ascii_alphanumeric()||b"_/\\ .-".contains(&c)) {return invalid("Choose a safe native actor-variant path without its extension");}
                if *count==0||*count>32{return invalid("A native encounter squad supports 1–32 authored starting locations");}
                if difficulty.as_ref().is_some_and(|value|value.normal>*count||value.insane>*count){
                    return invalid("Author enough starting positions for both native difficulty counts; each supports 0–32 actors");
                }
                let _=crate::firefight::native_actor_start_grid(*position,*count as usize,0,*count as usize,*spacing)?;
            }
            Self::AppendEncounters{source_rules,..}=>{
                if let Some(rules)=source_rules{crate::firefight::validate(rules)?;}
                let entries=self.encounter_appends()?;let mut names=std::collections::BTreeSet::new();let mut total=0usize;
                for entry in entries {
                    if source_rules.is_some()&&(entry.major_upgrade.is_some()||entry.difficulty.is_some()||entry.starts.is_some()||entry.behavior.is_some()||entry.patrol.is_some()||entry.combat.is_some()){return invalid("Prepared Firefight groups require the exact controller population, starting grid and actor states. Use Firefight wave rules rather than independent campaign overrides");}
                    entry.operation().validate(class,tag)?;
                    let _=entry.positions()?;
                    if !names.insert(entry.name.to_ascii_lowercase()){return invalid("Each appended encounter needs a distinct native name");}
                    total+=usize::from(entry.count);
                }
                if total>128{return invalid("One reviewed encounter group operation supports at most 128 starting locations");}
            }
            Self::EncounterSquadPatrol{encounter,squad,encounter_name,squad_name,route,source_sha256}=>{if class!="scnr"||*encounter>=128||*squad>=4096||[encounter_name,squad_name].iter().any(|n|n.len()>32||n.chars().any(char::is_control))||source_sha256.len()!=64||!source_sha256.bytes().all(|c|c.is_ascii_hexdigit()){return invalid("Native patrol needs exact source/squad identities");}route.validate()?;},
            Self::EncounterSquadBehavior{encounter,squad,encounter_name,squad_name,behavior,source_sha256}=>{if class!="scnr"||*encounter>=128||*squad>=4096||[encounter_name,squad_name].iter().any(|n|n.len()>32||n.chars().any(char::is_control))||source_sha256.len()!=64||!source_sha256.bytes().all(|c|c.is_ascii_hexdigit()){return invalid("Native behavior needs exact source/squad identities");}behavior.validate()?;}
            Self::EncounterFiringPosition{encounter,point,encounter_name,position,group,source_sha256}=>{
                if class!="scnr"||*encounter>=128||*point>=512||encounter_name.len()>32||encounter_name.chars().any(char::is_control)||position.iter().any(|v|!v.is_finite()||v.abs()>1e6)||group.len()!=1||!group.as_bytes()[0].is_ascii_lowercase()||source_sha256.len()!=64||!source_sha256.bytes().all(|c|c.is_ascii_hexdigit()){return invalid("Firing-position editing needs exact native identity, finite XYZ and group A–Z");}
            }
            Self::EncounterSquadFiringGroups{encounter,squad,encounter_name,squad_name,groups,source_sha256}=>{
                if class!="scnr"||*encounter>=128||*squad>=4096||[encounter_name,squad_name].iter().any(|n|n.len()>32||n.chars().any(char::is_control))||source_sha256.len()!=64||!source_sha256.bytes().all(|c|c.is_ascii_hexdigit()){return invalid("Tactical-group editing needs exact native squad/source identities");}groups.masks()?;
            }
            Self::PlayerStartPosition{index,copy_from,position,facing_radians,source_sha256}=>{if class!="scnr"||*index>=4096||copy_from.is_some_and(|source|source>=*index||usize::from(*index)>=MAX_NATIVE_PLAYER_STARTS)||position.iter().any(|v|!v.is_finite()||v.abs()>1e6)||!facing_radians.is_finite()||facing_radians.abs()>std::f32::consts::TAU+1e-6||source_sha256.len()!=64||!source_sha256.bytes().all(|c|c.is_ascii_hexdigit()){return invalid("Player start editing needs an exact scenario/source identity, native index and finite XYZ/yaw");}}
            Self::EncounterStartPosition{encounter,squad,start,encounter_name,squad_name,position,source_sha256,facing_radians,command_list}=>{
                if class!="scnr"||*encounter>=128||*squad>=4096||*start>=4096||
                    [encounter_name,squad_name].iter().any(|name|name.len()>32||name.chars().any(char::is_control))||
                    command_list.is_some_and(|index| !(-1..256).contains(&index))||position.iter().any(|value|!value.is_finite()||value.abs()>1e6)||facing_radians.is_some_and(|value|!value.is_finite()||value.abs()>std::f32::consts::TAU+1e-6)||
                    source_sha256.len()!=64||!source_sha256.bytes().all(|value|value.is_ascii_hexdigit()){
                    return invalid("AI start editing needs exact scenario/source identities and finite supported coordinates");
                }
            }
            Self::EncounterSquadCountsBatch{source_sha256,..}=>{
                let mut seen=std::collections::BTreeSet::new();
                for edit in self.squad_count_edits()?{
                    edit.operation(source_sha256).validate(class,tag)?;
                    if !seen.insert((edit.encounter,edit.squad)){return invalid("A squad can appear only once in a population operation");}
                }
            }
            Self::EncounterSquadCounts{encounter,squad,encounter_name,squad_name,normal_count,insane_count,source_sha256}=>{
                if class!="scnr"||*encounter>=128||*squad>=4096||*normal_count>32||*insane_count>32||
                    [encounter_name,squad_name].iter().any(|name|name.len()>32||name.chars().any(char::is_control))||
                    source_sha256.len()!=64||!source_sha256.bytes().all(|b|b.is_ascii_hexdigit()){
                    return invalid("Existing squad editing needs a scenario, current source SHA256, valid indices and counts from 0 to 32");
                }
            }
            Self::HudDuplicate{array,index,source_sha256}=>{
                if source_sha256.len()!=64||!source_sha256.bytes().all(|b|b.is_ascii_hexdigit()){return invalid("Refresh the current native HUD source identity before copying an element");}
                let maximum=hud_array_limit(class,array)?;
                if usize::from(*index)>=maximum{return invalid("Selected HUD element exceeds the native array capacity");}
            }
            Self::BoundingRadius { value } => {
                if ![
                    "weap", "scen", "bipd", "vehi", "eqip", "garb", "proj", "mach", "ctrl", "lifi",
                    "ssce",
                ]
                .contains(&class)
                {
                    return invalid("This reviewed native field edit requires an object tag");
                }
                if !value.is_finite() || *value < 0.0 || *value > 100_000.0 {
                    return invalid(
                        "Bounding radius must be finite and between 0 and 100000 Halo world units",
                    );
                }
            }
            Self::LensFlareScaleRepair if class != "lens" => {
                return invalid("The reviewed lens-flare repair only accepts lens_flare tags")
            }
            _ => {}
        }
        Ok(())
    }
    pub fn arguments(&self, tags: &Path, class: &str, tag: &str) -> Result<Vec<String>> {
        self.validate(class, tag)?;
        let mut args = vec!["-t".into(), tags.to_string_lossy().into_owned()];
        match self {
            Self::Dependencies => args.push("-r".into()),
            Self::MachineSettings { settings, .. } => {
                for (key, value) in settings.values() { args.extend(["-S".into(), key.into(), value]); }
            }
            Self::ControlSettings{settings,..}=>{for(key,value)in settings.values(){args.extend(["-S".into(),key.into(),value]);}}
            Self::SquadTerminals{..}|Self::FactionKits{..}|Self::FactionBody{..}|Self::VehicleFlight{..}|Self::AppendTransport{..}|Self::CommandList{..}|Self::PlayerStartPosition{..}|Self::DevicePlacement{..}|Self::DeviceGroupAppend{..}|Self::TriggerVolume{..}|Self::CutsceneFlag{..}|Self::CutsceneCamera{..}|Self::EncounterSquadPatrol{..}|Self::EncounterSquadBehavior{..}|Self::EncounterFiringPosition{..}|Self::EncounterSquadFiringGroups{..}|Self::EncounterStartPosition{..}|Self::EncounterSquadCounts{..}|Self::EncounterSquadCountsBatch{..}=>return invalid("This native edit requires the original scenario or asset field inventory"),
            Self::HudDuplicate{..}=>return invalid("HUD duplication requires the original native array inventory"),
            Self::AppendEncounter { .. } | Self::AppendEncounters { .. } => return invalid("Encounter append needs the original scenario array inventory"),
            Self::BoundingRadius { value } => {
                args.extend(["-S".into(), "bounding_radius".into(), value.to_string()])
            }
            Self::LensFlareScaleRepair => {
                args.extend(["-T".into(), "broken-lens-flare-function-scale".into()])
            }
        }
        args.push(tag.into());
        Ok(args)
    }
}
// This interprets the pinned external reader's listing, not native tag bytes.
// Root array boundaries and four-character tree prefixes are the documented -L
// presentation in the existing Invader source. Unknown formatting fails closed.
struct ArrayListing {count:usize,start:usize,end:usize,body:Vec<String>}
fn array_listing(fields:&str,name:&str)->Result<ArrayListing> {
    let lines=fields.lines().collect::<Vec<_>>();
    let prefix=format!("{name}[");
    let matches=lines.iter().enumerate().filter_map(|(index,line)|line.strip_prefix(&prefix).map(|tail|(index,tail))).collect::<Vec<_>>();
    if matches.len()!=1{return invalid(format!("Native {name} array listing is missing or ambiguous"));}
    let (start,tail)=matches[0];
    let (size,kind)=tail.split_once(']').ok_or_else(||crate::SparkError::Invalid("Malformed native array declaration".into()))?;
    let count=size.parse::<usize>().map_err(|_|crate::SparkError::Invalid("Invalid native array size".into()))?;
    if kind.trim()!="array"||count>4096{return invalid("Unsupported native array declaration");}
    let end=(start+1..lines.len()).find(|i|!lines[*i].starts_with(' ')).unwrap_or(lines.len());
    let mut body=vec![];
    for line in &lines[start+1..end] {
        let mut tail=*line;let mut depth=0;
        while let Some(next)=[" │  "," ├──"," └──","    "].iter().find_map(|prefix|tail.strip_prefix(*prefix)) {depth+=1;tail=next;}
        if depth==0||tail.starts_with(char::is_whitespace)||tail.is_empty(){return invalid("Unknown native field-tree formatting; no append was accepted");}
        body.push(format!("{}{tail}","    ".repeat(depth)));
    }
    Ok(ArrayListing{count,start,end,body})
}
// Invader aligns the type column with spaces. Match the exact row path/depth
// and type without changing any stored field text or preservation identity.
fn encounter_row(line:&str,index:usize)->bool {
    line.strip_prefix(&format!("    encounters[{index}]"))
        .is_some_and(|tail|tail.starts_with(' ')&&tail.trim()=="struct")
}
/// Read the current source palette, including newly accepted actors that are
/// not in the original cache index. The existing array reader owns bounds/depth.
pub fn scenario_actor_sources(fields:&str)->Result<Vec<String>> {
    let palette=array_listing(fields,"actor_palette")?;
    if palette.count>64{return invalid("Native actor palette exceeds its supported source limit");}
    let mut paths=std::collections::BTreeSet::new();
    for line in palette.body {
        if let Some(path)=line.strip_prefix("        reference (").and_then(|value|value.split_once(')').map(|(path,_)|path)) {
            if let Some(path)=path.replace('\\',"/").strip_suffix(".actor_variant") {crate::safe_relative(path)?;paths.insert(path.to_string());}
        }
    }
    Ok(paths.into_iter().collect())
}
fn encounter_append_layout(fields:&str,name:&str,actor:&str)->Result<(ArrayListing,ArrayListing,usize)> {
    let encounters=array_listing(fields,"encounters")?;let palette=array_listing(fields,"actor_palette")?;
    if encounters.count>=128||palette.count>64{return invalid("The scenario has no checked encounter/palette capacity for an append");}
    if encounters.body.iter().filter_map(|line|line.strip_prefix("        name (")).filter_map(|s|s.split_once(')').map(|v|v.0)).any(|existing|existing.eq_ignore_ascii_case(name)){return invalid("An original encounter already owns that name; choose a new one");}
    let wanted=format!("{}.actor_variant",actor.replace('\\',"/"));
    let mut current=None;let mut found=None;
    for line in &palette.body {
        if let Some(tail)=line.strip_prefix("    actor_palette[") {
            let (index,kind)=tail.split_once(']').ok_or_else(||crate::SparkError::Invalid("Malformed actor-palette row".into()))?;
            if kind.trim()!="struct"{return invalid("Unknown actor-palette row format");}
            let index=index.parse::<usize>().map_err(|_|crate::SparkError::Invalid("Invalid actor-palette row".into()))?;
            if index>=palette.count{return invalid("Actor-palette row exceeds its array");}current=Some(index);
        } else if let Some(path)=line.strip_prefix("        reference (").and_then(|v|v.split_once(')').map(|v|v.0)) {
            if path.replace('\\',"/").eq_ignore_ascii_case(&wanted)&&found.is_none(){found=current;}
        }
    }
    let actor_index=found.unwrap_or(palette.count);
    if actor_index>=64{return invalid("Actor palette is full; the selected variant has no existing entry");}
    Ok((encounters,palette,actor_index))
}
// Allocate appended indices from the actual original inventory. Existing entries
// never move; groups sharing a new actor reuse its first appended palette row.
fn encounter_append_layouts(fields:&str,operation:&Operation)->Result<Vec<(EncounterAppend,usize,usize,bool)>> {
    let entries=operation.encounter_appends()?;
    let old_encounters=array_listing(fields,"encounters")?;let old_palette=array_listing(fields,"actor_palette")?;
    if old_encounters.count+entries.len()>128{return invalid("The scenario has no checked capacity for all encounter groups");}
    let mut palette_count=old_palette.count;let mut appended=std::collections::BTreeMap::new();let mut result=vec![];
    for (offset,entry) in entries.into_iter().enumerate() {
        let (_,_,existing)=encounter_append_layout(fields,&entry.name,&entry.actor_path)?;
        let key=entry.actor_path.replace('\\',"/").to_ascii_lowercase();
        let actor=if existing<old_palette.count{existing}else if let Some(index)=appended.get(&key){*index}else{
            if palette_count>=64{return invalid("All encounter groups do not fit the native actor palette");}
            let index=palette_count;palette_count+=1;appended.insert(key,index);index
        };
        let add=actor>=old_palette.count&&!result.iter().any(|row:&(EncounterAppend,usize,usize,bool)|row.2==actor);
        result.push((entry,old_encounters.count+offset,actor,add));
    }
    Ok(result)
}
// Exact normalized native rows include fields Spark does not edit. Their
// recorded identity prevents overwriting later handwritten encounter changes.
fn owned_encounter_rows(fields:&str,operation:&Operation)->Result<Vec<(usize,Vec<String>)>> {
    operation.validate("scnr","review.scenario")?;
    let array=array_listing(fields,"encounters")?;
    if array.count>128{return invalid("Native encounter inventory exceeds128rows");}
    let starts=array.body.iter().enumerate().filter_map(|(index,line)|line.starts_with("    encounters[").then_some(index)).collect::<Vec<_>>();
    if starts.len()!=array.count{return invalid("Native encounter row count differs from its declaration");}
    let mut rows=vec![];
    for(index,begin)in starts.iter().copied().enumerate(){
        if !encounter_row(&array.body[begin],index){return invalid("Native encounter row order is incomplete or ambiguous");}
        let end=starts.get(index+1).copied().unwrap_or(array.body.len());let body=&array.body[begin..end];
        let names=body.iter().filter_map(|line|line.strip_prefix("        name (")).filter_map(|tail|tail.split_once(')').map(|pair|pair.0)).collect::<Vec<_>>();
        if names.len()!=1{return invalid("Native encounter name is missing or ambiguous");}
        rows.push((index,names[0],body));
    }
    let mut result=vec![];
    for entry in operation.encounter_appends()? {
        let found=rows.iter().filter(|(_,name,_)|name.eq_ignore_ascii_case(&entry.name)).collect::<Vec<_>>();
        if found.len()!=1{return invalid("Recorded native encounter is missing or ambiguous; no replacement is permitted");}
        result.push((found[0].0,found[0].2.to_vec()));
    }
    Ok(result)
}
pub fn owned_encounter_identity(fields:&str,operation:&Operation)->Result<String> {
    Ok(crate::hex_bytes(Sha256::digest(serde_json::to_vec(&owned_encounter_rows(fields,operation)?)?)))
}
pub fn validate_owned_encounter_revision(existing:&Operation,desired:&Operation)->Result<()> {
    existing.validate("scnr","review.scenario")?;desired.validate("scnr","review.scenario")?;
    let old=existing.encounter_appends()?;let new=desired.encounter_appends()?;
    if old.len()!=new.len()||old.iter().zip(&new).any(|(old,new)|old.name!=new.name||old.start_active!=new.start_active){return invalid("Owned encounter revision must keep group names/order and activation flags. Adding/removing groups needs separate source reconciliation");}
    Ok(())
}
/// A recorded, unchanged generated suffix can be recreated at the same indices.
/// This synthetic listing is planning data, never native readback evidence.
pub fn encounter_revision_base(fields:&str,existing:&Operation,expected:&str)->Result<(String,Vec<usize>)> {
    if owned_encounter_identity(fields,existing)?!=expected{return invalid("Generated native encounter fields changed after their build; preserve/reconcile handwritten source before replacing groups");}
    let array=array_listing(fields,"encounters")?;let rows=owned_encounter_rows(fields,existing)?;
    let count=array.count.checked_sub(rows.len()).ok_or_else(||crate::SparkError::Invalid("Invalid generated encounter range".into()))?;
    if rows.iter().enumerate().any(|(offset,(index,_))|*index!=count+offset){return invalid("Generated groups are no longer the contiguous final encounter rows. Original indices cannot be shifted; reconcile the native source separately");}
    let first=array.body.iter().position(|line|encounter_row(line,count)).ok_or_else(||crate::SparkError::Invalid("Generated native encounter boundary is missing".into()))?;
    let lines=fields.lines().map(str::to_owned).collect::<Vec<_>>();
    let mut base=lines[..array.start].to_vec();base.push(format!("encounters[{count}] array"));base.extend_from_slice(&array.body[..first]);base.extend_from_slice(&lines[array.end..]);
    Ok((base.join("\n")+"\n",rows.into_iter().map(|(index,_)|index).collect()))
}
pub fn verify_encounter_revision_base(expected:&str,actual:&str)->Result<()> {
    let a=array_listing(expected,"encounters")?;let b=array_listing(actual,"encounters")?;
    let remaining=|text:&str,array:&ArrayListing|text.lines().enumerate().filter(|(index,_)|*index<array.start||*index>=array.end).map(|(_,line)|line).collect::<Vec<_>>().join("\n");
    if a.count!=b.count||a.body!=b.body||remaining(expected,&a)!=remaining(actual,&b){return invalid("Native generated-group removal changed original encounters, palettes or other scenario fields; candidate refused");}
    Ok(())
}
impl Operation {
    pub fn arguments_with_fields(&self,tags:&Path,class:&str,tag:&str,before:&str)->Result<Vec<String>> {
        self.validate(class,tag)?;
        if let Self::VehicleFlight{tuning,..}=self{return transport::flight_arguments(tags,tag,before,tuning);}
        if let Self::SquadTerminals{terminals,..}=self{return factions::squad_arguments(tags,tag,before,terminals);}
        if let Self::FactionBody{body,replace_existing,..}=self{return factions::body_arguments(tags,tag,before,body,*replace_existing);}
        if let Self::FactionKits{kits,..}=self{return factions::arguments(tags,tag,before,kits);}
        if let Self::AppendTransport{transport,..}=self{return transport::arguments(tags,tag,before,transport);}
        if let Self::CommandList{list,append,..}=self{return if *append{command_lists::append_arguments(tags,tag,before,list)}else{command_lists::arguments(tags,tag,before,list)};}
        if let Self::DeviceGroupAppend { name, initial_value, change_once, .. } = self {
            let index = device_group_append_index(before, name)?;
            let prefix = format!("device_groups[{index}]");
            return Ok(vec![
                "-t".into(), tags.to_string_lossy().into_owned(),
                "-I".into(), "device_groups".into(), "1".into(), "end".into(),
                "-S".into(), format!("{prefix}.name"), name.clone(),
                "-S".into(), format!("{prefix}.initial_value"), initial_value.to_string(),
                "-S".into(), format!("{prefix}.flags.can_change_only_once"), u8::from(*change_once).to_string(),
                tag.into(),
            ]);
        }
        if let Self::DevicePlacement{device,..}=self{
            let rows = native_device_fields(before)?;
            let (original, _) = rows.iter().find(|(row, _)| row.class == device.class && row.index == device.index)
                .ok_or_else(|| crate::SparkError::Invalid("Native device index missing".into()))?;
            if !original.same_identity(device) {
                return invalid("Native device identity is unavailable");
            }
            let prefix = format!("{}[{}]", device.array(), device.index);
            let mut args = vec!["-t".into(), tags.to_string_lossy().into_owned()];
            if !positions_close(original.position, device.position) {
                args.extend(["-S".into(), format!("{prefix}.position"), device.position.map(|v| v.to_string()).join(",")]);
            }
            if !original.same_rotation(device) {
                args.extend(["-S".into(), format!("{prefix}.rotation"), device.rotation_radians.map(|v| v.to_string()).join(",")]);
            }
            for (field, before, proposed) in [
                ("control_flags.usable_from_both_sides", original.usable_from_both_sides, device.usable_from_both_sides),
                ("device_flags.not_usable_from_any_side", original.interaction_disabled, device.interaction_disabled),
                ("machine_flags.does_not_operate_automatically", original.manual_activation, device.manual_activation),
                ("device_flags.initially_off", original.initially_off, device.initially_off),
                ("device_flags.initially_open", original.initially_open, device.initially_open),
            ] {
                let Some(value) = proposed.filter(|value| Some(*value) != before) else { continue; };
                if before.is_none() { return invalid(format!("Native setting {field} is unavailable")); }
                args.extend(["-S".into(), format!("{prefix}.{field}"), u8::from(value).to_string()]);
            }
            for (field, value) in changed_device_wiring(before, original, device)? {
                args.extend(["-S".into(), format!("{prefix}.{field}"), value.to_string()]);
            }
            if args.len() == 2 { return invalid("Native device placement already matches"); }
            args.push(tag.into());
            return Ok(args);
        }
        if let Self::TriggerVolume{index,name,geometry,append,..}=self{
            let rows=scenario_volume_choices(before)?;let prefix=format!("trigger_volumes[{index}]");let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned()];
            if *append {
                if *index as usize!=rows.len()||rows.iter().any(|row|row.name.eq_ignore_ascii_case(name)){return invalid("Append a uniquely named trigger at the end of its current source");}
                args.extend(["-I".into(),"trigger_volumes".into(),"1".into(),"end".into(),"-S".into(),format!("{prefix}.name"),name.clone(),"-S".into(),format!("{prefix}.type"),"rotational".into()]);
            }else{
                let row=rows.get(usize::from(*index)).ok_or_else(||crate::SparkError::Invalid("Native trigger index changed".into()))?;
                if row.name!=*name||row.kind!=1||row.geometry.as_ref().is_none_or(|g|volume_geometry_close(g,geometry)){return invalid("Trigger source changed, is unsupported or already matches");}
            }
            for(field,value)in volume_values(geometry){args.extend(["-S".into(),format!("{prefix}.{field}"),value.map(|v|v.to_string()).join(",")]);}args.push(tag.into());return Ok(args);
        }
        if let Self::CutsceneFlag{point,append,..}=self{
            let old=scenario_flag_choices(before)?;let prefix=format!("cutscene_flags[{}]",point.index);let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned()];
            if *append{
                if point.index as usize!=old.len()||!crate::creative::script_ident(&point.name)||old.iter().any(|p|p.name.eq_ignore_ascii_case(&point.name)){return invalid("Append a uniquely named flag at the end of its current source");}
                args.extend(["-I".into(),"cutscene_flags".into(),"1".into(),"end".into(),"-S".into(),format!("{prefix}.name"),point.name.clone()]);
            }else if old.iter().find(|p|p.index==point.index&&p.name==point.name).is_none_or(|p|flag_points_close(p,point)){return invalid("Selected flag changed or already matches");}
            for(field,value)in [("position",point.position.map(|v|v.to_string()).join(",")),("facing",point.facing_radians.map(|v|v.to_string()).join(","))]{args.extend(["-S".into(),format!("{prefix}.{field}"),value]);}args.push(tag.into());return Ok(args);
        }
        if let Self::CutsceneCamera{point,append,..}=self{
            let points=native_camera_fields(before)?;
            let prefix=format!("cutscene_camera_points[{}]",point.index);let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned()];
            if *append {
                if point.index as usize!=points.len()||!crate::creative::script_ident(&point.name)||points.iter().any(|(p,_)|p.name.eq_ignore_ascii_case(&point.name)){return invalid("Append a uniquely named camera at the end of the current native inventory");}
                args.extend(["-I".into(),"cutscene_camera_points".into(),"1".into(),"end".into(),"-S".into(),format!("{prefix}.name"),point.name.clone()]);
            }else{
                let original=points.into_iter().find(|(p,_)|p.index==point.index&&p.name==point.name).ok_or_else(||crate::SparkError::Invalid("Selected native camera index/name changed".into()))?.0;
                if camera_points_close(&original,point){return invalid("Native camera already matches; no candidate was written");}
            }
            for(field,value)in crate::engine_machinima::camera_point_values(point.position,point.orientation_radians,point.fov_radians){args.extend(["-S".into(),format!("{prefix}.{field}"),value]);}args.push(tag.into());return Ok(args);
        }
        if self.combat_target_key().is_some(){return combat_arguments(self,tags,tag,before);}
        if let Self::EncounterStartPosition{encounter,squad,start,encounter_name,squad_name,position,facing_radians,command_list,..}=self{
            let (row,point)=selected_native_start(before,*encounter,*squad,*start)?;
            if row.encounter_name!=*encounter_name||row.name!=*squad_name{return invalid("Native encounter/squad identity changed before start editing");}
            let heading_changed=if let Some(value)=facing_radians {let original=point.facing_radians.ok_or_else(||crate::SparkError::Invalid("Native starting facing is unavailable; only position editing is supported for this source".into()))?;!facings_close(original,*value)}else{false};
            let position_changed=!positions_close(point.position,*position);
            let command_changed=if let Some(index)=command_list{let old=point.command_list.ok_or_else(||crate::SparkError::Invalid("Native starting command list is unavailable".into()))?;if *index>=0&&!scenario_command_list_choices(before)?.iter().any(|list|list.index==*index as u16){return invalid("Selected native command list is missing; refresh source");}old!=*index}else{false};
            if !position_changed&&!heading_changed&&!command_changed{return invalid("The AI starting pose/command list already matches; no candidate was written");}
            let prefix=format!("encounters[{encounter}].squads[{squad}].starting_locations[{start}]");
            let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned()];
            if position_changed {args.extend(["-S".into(),format!("{prefix}.position"),position.map(|value|value.to_string()).join(",")]);}
            if heading_changed {args.extend(["-S".into(),format!("{prefix}.facing"),facing_radians.unwrap().to_string()]);}
            if command_changed {args.extend(["-S".into(),format!("{prefix}.command_list"),command_list.unwrap().to_string()]);}
            args.push(tag.into());return Ok(args);
        }
        if self.is_squad_count_edit() {
            let rows=scenario_squad_choices(before)?;
            let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned()];
            for edit in self.squad_count_edits()?{
                let selected=rows.iter().find(|row|row.encounter==edit.encounter&&row.squad==edit.squad)
                    .ok_or_else(||crate::SparkError::Invalid("A selected native squad is missing; refresh the source".into()))?;
                if selected.encounter_name!=edit.encounter_name||selected.name!=edit.squad_name{return invalid("A native encounter/squad identity changed; refresh before editing");}
                if selected.normal_count==edit.normal_count as i16&&selected.insane_count==edit.insane_count as i16{continue;}
                let prefix=format!("encounters[{}].squads[{}]",edit.encounter,edit.squad);
                args.extend(["-S".into(),format!("{prefix}.normal_diff_count"),edit.normal_count.to_string(),
                    "-S".into(),format!("{prefix}.insane_diff_count"),edit.insane_count.to_string()]);
            }
            if args.len()==2{return invalid("All selected native counts already match; no candidate was written");}
            args.push(tag.into());return Ok(args);
        }
        if let Self::HudDuplicate{array,index,..}=self {
            let listing=array_listing(before,array)?;let _=array_items(&listing,array)?;
            if usize::from(*index)>=listing.count||listing.count>=hud_array_limit(class,array)? {return invalid("Native HUD element is missing or the array has no remaining capacity");}
            return Ok(vec!["-t".into(),tags.to_string_lossy().into_owned(),"-c".into(),format!("{array}[{index}]"),"end".into(),tag.into()]);
        }
        if let Self::ControlSettings{settings,..}=self{if settings.close(&native_control_settings(before)?){return invalid("Native terminal settings already match");}}
        if let Self::MachineSettings { settings, .. } = self {
            let original = native_machine_settings(before)?;
            if settings.close(&original) {
                return invalid("Native machine settings already match");
            }
        }
        if !self.is_encounter_append(){return self.arguments(tags,class,tag);}
        let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned()];
        for (entry,index,actor,add_palette) in encounter_append_layouts(before,self)? {
        let (normal_count,insane_count)=entry.difficulty_counts();let(initial_state,return_state)=entry.states();
        let EncounterAppend{name,actor_path,start_active,count,..}=&entry;
        let e=format!("encounters[{index}]");let squad=format!("{e}.squads[0]");
        let poses=entry.poses()?;let patrol=entry.patrol_points()?;let firing=entry.firing_points()?;
        if add_palette {args.extend(["-I".into(),"actor_palette".into(),"1".into(),"end".into(),"-S".into(),format!("actor_palette[{actor}].reference"),format!("{actor_path}.actor_variant")]);}
        args.extend(["-I".into(),"encounters".into(),"1".into(),"end".into(),"-I".into(),format!("{e}.squads"),"1".into(),"end".into(),"-I".into(),format!("{squad}.starting_locations"),count.to_string(),"end".into(),"-I".into(),format!("{e}.firing_positions"),firing.len().to_string(),"end".into()]);
        for(key,value)in [(format!("{e}.name"),name.clone()),(format!("{e}.flags.not_initially_created"),if *start_active{"0"}else{"1"}.into()),(format!("{e}.manual_bsp_index"),"-1".into()),
            (format!("{squad}.name"),"source_squad".into()),(format!("{squad}.actor_type"),actor.to_string()),(format!("{squad}.normal_diff_count"),normal_count.to_string()),(format!("{squad}.insane_diff_count"),insane_count.to_string()),(format!("{squad}.initial_state"),initial_state.native().0.into()),(format!("{squad}.return_state"),return_state.native().0.into())] {args.extend(["-S".into(),key,value]);}
        if let Some(value) = &entry.major_upgrade {
            args.extend(["-S".into(), format!("{squad}.major_upgrade"), value.clone()]);
        }
        if let Some(combat)=&entry.combat{let masks=combat.groups.masks()?;for(i,(field,_))in combat.groups.fields().iter().enumerate(){for bit in 0..26{args.extend(["-S".into(),format!("{squad}.{field}.{}",char::from(b'a'+bit)),if masks[i]&(1u32<<bit)!=0{"1"}else{"0"}.into()]);}}}
        if !patrol.is_empty(){args.extend(["-I".into(),format!("{squad}.move_positions"),patrol.len().to_string(),"end".into()]);}
        for(index,point)in patrol.iter().enumerate(){let p=format!("{squad}.move_positions[{index}]");for(key,value)in [("position",point.position.map(|v|v.to_string()).join(",")),("facing",point.facing_radians.to_string()),("weight",point.weight.to_string()),("time",point.wait_seconds.map(|v|v.to_string()).join(",")),("animation","-1".into()),("sequence_id","0".into())]{args.extend(["-S".into(),format!("{p}.{key}"),value]);}}
        for(index,pose)in poses.into_iter().enumerate() {
            let position=pose.position;
            let start=format!("{squad}.starting_locations[{index}]");let vector=position.map(|value|value.to_string()).join(",");
            for(key,value)in [(format!("{start}.position"),vector.clone()),(format!("{start}.facing"),pose.facing_radians.to_string()),(format!("{start}.flags.required"),"1".into()),(format!("{start}.sequence_id"),"-1".into()),(format!("{start}.actor_type"),"-1".into()),(format!("{start}.command_list"),"-1".into()),(format!("{start}.initial_state"),initial_state.native().0.into()),(format!("{start}.return_state"),return_state.native().0.into())] {args.extend(["-S".into(),key,value]);}
        }
        for(index,point)in firing.iter().enumerate(){for(key,value)in [("position",point.position.map(|v|v.to_string()).join(",")),("group_index",point.group.clone())]{args.extend(["-S".into(),format!("{e}.firing_positions[{index}].{key}"),value]);}}
        }
        args.push(tag.into());Ok(args)
    }
    pub fn actor_start_positions(&self)->Result<Option<Vec<[f32;3]>>> {
        if let Self::PlayerStartPosition{position,..}|Self::EncounterStartPosition{position,..}|Self::EncounterFiringPosition{position,..}=self{return Ok(Some(vec![*position]));}
        if !self.is_encounter_append(){return Ok(None);}
        let mut positions=vec![];
        for entry in self.encounter_appends()? {positions.extend(entry.positions()?);}
        Ok(Some(positions))
    }
    /// Keep reviewed command actions intact while respecting Windows argument
    /// length. All batches edit the same isolated candidate; acceptance is atomic.
    pub fn argument_batches(&self,args:Vec<String>,readback:bool)->Result<Vec<Vec<String>>> {
        if !self.is_encounter_append()&&!self.is_scenario_ai_edit()&&!self.is_command_edit(){return Ok(vec![args]);}
        if args.len()<3||args[0]!="-t"{return invalid("Malformed native argument envelope");}
        let cost=|value:&str|value.encode_utf16().count()+value.chars().filter(|c|*c=='\\'||*c=='"').count()+3;
        let end=args.len()-1;let tag=args[end].clone();let base=args[..2].to_vec();
        let overhead=base.iter().map(|v|cost(v)).sum::<usize>()+cost(&tag);
        const LIMIT:usize=24000;
        if overhead>=LIMIT{return invalid("Native source path leaves no checked command-line capacity");}
        let mut result=vec![];let mut batch=base.clone();let mut used=overhead;let mut i=2;
        while i<end {
            let width=match(args[i].as_str(),readback){("-G",true)=>2,("-C",true) if matches!(self,Self::EncounterSquadPatrol{..})=>2,("-S",false)=>3,("-I",false)=>4,("-E",false)=>2,("-M"|"-c",false) if matches!(self,Self::EncounterSquadPatrol{..})=>3,_=>return invalid("Unknown action in native encounter batch")};
            if i+width>end{return invalid("Incomplete native encounter action");}
            let action=&args[i..i+width];let bytes=action.iter().map(|v|cost(v)).sum::<usize>();
            if bytes>LIMIT-overhead{return invalid("One native action exceeds its checked command-line capacity");}
            if used+bytes>LIMIT {batch.push(tag.clone());result.push(batch);batch=base.clone();used=overhead;}
            batch.extend_from_slice(action);used+=bytes;i+=width;
        }
        if batch.len()>2{batch.push(tag);result.push(batch);}
        if result.is_empty(){return invalid("Native encounter batch contains no actions");}
        Ok(result)
    }
    /// Reuse the exact emitted scalar keys for bounded native -G readback.
    pub fn readback_arguments(&self,tags:&Path,class:&str,tag:&str,before:&str)->Result<Option<Vec<String>>> {
        if !matches!(self,Self::ControlSettings{..}|Self::MachineSettings{..})&&!self.is_player_start_edit()&&!self.is_encounter_append()&&!self.is_scenario_ai_edit()&&!self.is_camera_edit()&&!self.is_trigger_edit()&&!self.is_device_edit()&&!self.is_command_edit()&&!self.is_vehicle_flight() {return Ok(None);}
        if let Self::EncounterSquadPatrol{encounter,squad,route,..}=self{self.arguments_with_fields(tags,class,tag,before)?;let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned(),"-C".into(),format!("encounters[{encounter}].squads[{squad}].move_positions")];for(key,_)in patrol_scalar_fields(*encounter,*squad,route){args.extend(["-G".into(),key]);}args.push(tag.into());return Ok(Some(args));}
        let written=self.arguments_with_fields(tags,class,tag,before)?;
        let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned()];let mut i=2;
        while i+1<written.len(){match written[i].as_str(){"-I"=>i+=4,"-E"=>i+=2,"-M"|"-c"=>i+=3,"-S"=>{args.extend(["-G".into(),written[i+1].clone()]);i+=3;},_=>return invalid("Unexpected native append recipe")}}
        args.push(tag.into());Ok(Some(args))
    }
    pub fn verify_readback(&self,tags:&Path,class:&str,tag:&str,before:&str,output:&str)->Result<()> {
        let written=self.arguments_with_fields(tags,class,tag,before)?;
        let mut expected=vec![];let mut i=2;
        if let Self::EncounterSquadPatrol{encounter,squad,route,..}=self{expected.push((format!("encounters[{encounter}].squads[{squad}].move_positions"),route.points.len().to_string()));expected.extend(patrol_scalar_fields(*encounter,*squad,route));}
        else{while i+1<written.len(){match written[i].as_str(){"-I"=>i+=4,"-c" if self.is_player_start_edit()=>i+=3,"-S"=>{expected.push((written[i+1].clone(),written[i+2].clone()));i+=3;},_=>return invalid("Unexpected native append recipe")}}}
        let actual=output.lines().collect::<Vec<_>>();if actual.len()!=expected.len(){return invalid("Native encounter scalar readback count differs from the append recipe");}
        for ((key,value),actual) in expected.into_iter().zip(actual) {
            let same=if key.ends_with(".facing")&&!self.is_flag_edit(){
                match(value.parse::<f32>(),actual.parse::<f32>()){(Ok(expected),Ok(degrees))=>facings_close(expected,degrees.to_radians()),_=>false}
            }else if (self.is_flag_edit()&&key.ends_with(".facing"))||key.ends_with(".orientation")||key.ends_with(".field_of_view")||key.ends_with(".rotation"){
                let parse=|v:&str|v.split(',').map(|s|s.trim().parse::<f32>()).collect::<std::result::Result<Vec<_>,_>>();
                match(parse(&value),parse(actual)){(Ok(a),Ok(b))=>a.len()==b.len()&&a.iter().zip(b).all(|(a,b)|facings_close(*a,b.to_radians())),_=>false}
            }else if matches!(self,Self::ControlSettings{..})&&["call_value","automatic_activation_radius","delay_time"].contains(&key.as_str())||matches!(self,Self::MachineSettings{..})&&key.ends_with("_time")||self.is_vehicle_flight()||self.is_trigger_edit()&&![".name",".type"].iter().any(|suffix|key.ends_with(suffix))||key.ends_with(".initial_value")||key.ends_with(".position")||key.ends_with(".time")||key.ends_with(".weight")||self.is_command_edit()&&(key.ends_with(".parameter1")||key.ends_with(".parameter2")) {
                let parse=|s:&str|s.split(',').map(|v|v.trim().parse::<f64>().ok().filter(|v|v.is_finite())).collect::<Option<Vec<_>>>();
                match(parse(&value),parse(actual)){(Some(a),Some(b))=>a.len()==b.len()&&a.iter().zip(b).all(|(a,b)|(a-b).abs()<=0.000001f64.max(a.abs()*f64::from(f32::EPSILON)*2.)),_=>false}
            }else if key.ends_with(".reference"){actual.replace('\\',"/").eq_ignore_ascii_case(&value.replace('\\',"/"))}
            else if value.as_str()=="-1"{actual=="-1"||actual=="65535"}else{actual==value.as_str()};
            if !same{return invalid(format!("Native encounter readback differs at {key}: {actual}"));}
        }
        Ok(())
    }
}
/// Preserve every native row outside the two explicitly edited arrays. Show
/// the first bounded difference rather than hiding the field behind a generic
/// refusal; this never adopts, normalizes or discards the changed source.
fn compare_scenario_remainder(before:&str,after:&str,old:[&ArrayListing;2],new:[&ArrayListing;2],context:&str)->Result<()> {
    let remaining=|text:&str,arrays:[&ArrayListing;2]|text.lines().enumerate().filter(|(index,_)|arrays.iter().all(|a|*index<a.start||*index>=a.end)).map(|(_,line)|line.to_string()).collect::<Vec<_>>();
    let a=remaining(before,old);let b=remaining(after,new);if a==b{return Ok(());}
    let index=a.iter().zip(&b).position(|(a,b)|a!=b).unwrap_or(a.len().min(b.len()));
    let snippet=|lines:&Vec<String>|lines.get(index).map(|line|line.chars().take(240).collect::<String>()).unwrap_or_else(||"<end>".into());
    invalid(format!("{context}: row {index} outside edited arrays, before={:?}, after={:?}; row counts{}→{}. No revision was selected",snippet(&a),snippet(&b),a.len(),b.len()))
}
fn reviewed_encounter_append(before:&str,after:&str,operation:&Operation)->Result<Vec<FieldDifference>> {
    let Operation::AppendEncounter{name,actor_path,position,start_active,count,spacing,difficulty,major_upgrade}=operation else{return invalid("Not an encounter append");};
    let (old_encounters,old_palette,actor)=encounter_append_layout(before,name,actor_path)?;
    let new_encounters=array_listing(after,"encounters")?;let new_palette=array_listing(after,"actor_palette")?;
    let added=usize::from(actor==old_palette.count);
    if new_encounters.count!=old_encounters.count+1||new_palette.count!=old_palette.count+added||!new_encounters.body.starts_with(&old_encounters.body)||!new_palette.body.starts_with(&old_palette.body)|| (added==0&&new_palette.body!=old_palette.body) {return invalid("Native append changed existing encounter/palette rows or unexpected array counts");}
    let added_body=&new_encounters.body[old_encounters.body.len()..];
    for expected in ["squads[1] array".to_string(),format!("starting_locations[{count}] array"),format!("firing_positions[{count}] array")] {
        if added_body.iter().filter(|line|line.split_whitespace().collect::<Vec<_>>().join(" ")==expected).count()!=1{return invalid("Native encounter append has unexpected squad/start/firing array sizes");}
    }
    compare_scenario_remainder(before,after,[&old_encounters,&old_palette],[&new_encounters,&new_palette],"Native encounter append changed other scenario fields")?;
    let difficulty=difficulty.as_ref().map(|value|format!("; native normal={}, insane={}",value.normal,value.insane)).unwrap_or_default();
    let upgrades = major_upgrade.as_ref().map(|value| format!("; major-variant upgrades={value}")).unwrap_or_default();
    Ok(vec![FieldDifference{before:format!("encounters[{}] / actor_palette[{}]",old_encounters.count,old_palette.count),after:format!("encounters[{}] / actor_palette[{}]: {name} → {actor_path}",new_encounters.count,new_palette.count)+&format!(" at grid center {position:?}; actors={count}, spacing={spacing}; initial creation={start_active}")+&difficulty+&upgrades}])
}

fn reviewed_encounter_group_append(before:&str,after:&str,operation:&Operation)->Result<Vec<FieldDifference>> {
    operation.validate("scnr","review.scenario")?;
    let plans=encounter_append_layouts(before,operation)?;
    let old=array_listing(before,"encounters")?;let palette=array_listing(before,"actor_palette")?;
    let new=array_listing(after,"encounters")?;let new_palette=array_listing(after,"actor_palette")?;
    let added=plans.iter().filter(|row|row.3).count();
    if new.count!=old.count+plans.len()||new_palette.count!=palette.count+added||!new.body.starts_with(&old.body)||!new_palette.body.starts_with(&palette.body)||(added==0&&new_palette.body!=palette.body){return invalid("Native encounter group append changed original rows or unexpected counts");}
    compare_scenario_remainder(before,after,[&old,&palette],[&new,&new_palette],"Native encounter group append changed other scenario fields")?;
    let mut differences=vec![];
    for (entry,index,_,_) in plans {
        let start=new.body.iter().position(|line|encounter_row(line,index)).ok_or_else(||crate::SparkError::Invalid("Appended encounter row is missing".into()))?;
        let end=(start+1..new.body.len()).find(|i|new.body[*i].starts_with("    encounters[")).unwrap_or(new.body.len());
        let body=&new.body[start+1..end];
        if body.iter().filter_map(|line|line.strip_prefix("        name (")).filter_map(|tail|tail.split_once(')').map(|pair|pair.0)).filter(|name|*name==entry.name.as_str()).count()!=1{return invalid("Appended encounter group name differs from the reviewed source");}
        if let Some(patrol)=&entry.patrol{let expected=format!("move_positions[{}] array",patrol.points.len());if body.iter().filter(|line|line.split_whitespace().collect::<Vec<_>>().join(" ")==expected).count()!=1{return invalid("Native patrol point count differs from reviewed source");}}
        for expected in ["squads[1] array".to_string(),format!("starting_locations[{}] array",entry.count),format!("firing_positions[{}] array",entry.firing_points()?.len())] {
            if body.iter().filter(|line|line.split_whitespace().collect::<Vec<_>>().join(" ")==expected).count()!=1{return invalid("Native encounter group has unexpected squad/start/firing counts");}
        }
        let difficulty=entry.difficulty.as_ref().map(|value|format!("; native normal={}, insane={}",value.normal,value.insane)).unwrap_or_default();
        let combat=entry.combat.as_ref().map(|c|format!("; {} independent firing points and reviewed squad tactical groups",c.points.len())).unwrap_or_default();
        let patrol=entry.patrol.as_ref().map(|p|format!("; {} native patrol points with facing/weight/wait",p.points.len())).unwrap_or_default();
        let behavior=entry.behavior.as_ref().map(|b|format!("; native initial={}, return={}",b.initial_state.native().0,b.return_state.native().0)).unwrap_or_default();
        let upgrades = entry.major_upgrade.as_ref().map(|value| format!("; major-variant upgrades={value}")).unwrap_or_default();
        differences.push(FieldDifference{before:format!("No appended encounter at index{index}"),after:format!("{} → {}; center={:?}; actors={}, spacing={}; initial creation={}",entry.name,entry.actor_path,entry.position,entry.count,entry.spacing,entry.start_active)+&difficulty+&behavior+&patrol+&combat+&upgrades+if entry.starts.is_some(){"; individually authored XYZ/facing (including editor-hidden starts)"}else{""}});
    }
    Ok(differences)
}

/// Prepare current saved wave groups only; no native writer or source selection.
/// The desktop must rederive this against the same saved source before writing.
pub fn saved_firefight_encounters(project:&crate::project::Project,parent_sha:&str,fields:&str)->Result<Operation> {
    let operation=saved_firefight_group_plan(project,parent_sha,fields)?;
    let _=encounter_append_layouts(fields,&operation)?;
    Ok(operation)
}
/// Reuse exact owned groups, or plan a reviewed replacement of the unchanged
/// generated suffix. Group names/indices and unrelated native data stay stable.
pub fn saved_firefight_controller_groups(project:&crate::project::Project,parent_sha:&str,fields:&str,existing:&Operation,owned_fields:Option<&str>)->Result<Operation> {
    let operation=saved_firefight_group_plan(project,parent_sha,fields)?;
    validate_owned_encounter_revision(existing,&operation)?;
    if operation.encounter_appends()?!=existing.encounter_appends()? {
        let expected=owned_fields.ok_or_else(||crate::SparkError::Invalid("This older build has no generated-field ownership identity; native group replacement needs separate review".into()))?;
        let (base,_)=encounter_revision_base(fields,existing,expected)?;
        let _=encounter_append_layouts(&base,&operation)?;
    }
    Ok(operation)
}
fn saved_firefight_group_plan(project:&crate::project::Project,parent_sha:&str,fields:&str)->Result<Operation> {
    let config=project.firefight.as_ref().ok_or_else(||crate::SparkError::Invalid("Save source-bound Firefight rules before preparing native groups".into()))?;
    crate::firefight::validate_native_round_rules(config)?;
    let source=project.source.as_ref().ok_or_else(||crate::SparkError::Invalid("Fresh levels use Prepare native solo round; this append preserves recovered source".into()))?;
    if config.source_sha256.as_deref()!=Some(source.sha256.as_str())&&config.source_sha256.as_deref()!=Some(parent_sha){return invalid("Saved Firefight rules use another source map; explicitly reconcile their source first");}
    let starts=array_listing(fields,"player_starting_locations")?;
    if starts.count==0||starts.count>256{return invalid("Review 1–256 native player starts before planning recovered encounter groups");}
    let mut players=vec![];
    for line in &starts.body {
        if let Some(vector)=line.strip_prefix("        position (").and_then(|tail|tail.split_once(')').map(|pair|pair.0)) {
            let values=vector.split(',').map(|value|value.trim().parse::<f32>().ok().filter(|value|value.is_finite())).collect::<Option<Vec<_>>>().ok_or_else(||crate::SparkError::Invalid("Native player-start position is unreadable".into()))?;
            let position:[f32;3]=values.try_into().map_err(|_|crate::SparkError::Invalid("Native player-start position needs three coordinates".into()))?;players.push(position);
        }
    }
    if players.len()!=starts.count{return invalid("Native player-start field listing is incomplete; no group positions were guessed");}
    let mut encounters=vec![];
    for(w,wave)in config.waves.iter().enumerate(){for(g,group)in wave.groups.iter().enumerate(){
        let enemy=config.enemies.iter().find(|enemy|enemy.id==group.enemy_id).ok_or_else(||crate::SparkError::Invalid("Saved wave actor is missing".into()))?;
        let layout=crate::firefight::native_group_grid(config,w,g,&players)?;
        encounters.push(EncounterAppend{major_upgrade:None,name:format!("gs_w{:02}_g{:02}",w+1,g+1),actor_path:enemy.actor_variant_path.clone(),position:layout.center,start_active:false,count:group.count,spacing:0.75,difficulty:None,grid:Some(EncounterGrid{total:layout.total as u16,offset:layout.offset as u16}),starts:None,behavior:None,patrol:None,combat:None});
    }}
    let operation=Operation::AppendEncounters{encounters,source_rules:Some(config.clone())};
    operation.validate("scnr","planned.scenario")?;
    Ok(operation)
}

/// Independently inspected cache, not the source writer's success status.
impl Operation {
    pub fn verify_compiled_encounter(&self,map:&crate::maps::MapInspection)->Result<()> {
        self.validate("scnr",&format!("{}.scenario",map.scenario_path))?;
        if self.combat_target_key().is_some(){return verify_native_combat(self,map);}
        if let Self::EncounterStartPosition{encounter,squad,start,encounter_name,squad_name,position,facing_radians,command_list,..}=self{return verify_native_start(map,*encounter,*squad,*start,encounter_name,squad_name,*position,*facing_radians,*command_list);}
        if self.is_squad_count_edit(){
            for edit in self.squad_count_edits()?{verify_native_squad(map,edit.encounter,edit.squad,&edit.encounter_name,&edit.squad_name,edit.normal_count as i16,edit.insane_count as i16)?;}
            return Ok(());
        }
        if !self.is_encounter_append(){return invalid("Unsupported encounter readback expectation");}
        for entry in self.encounter_appends()?{verify_compiled_append(&entry,map)?;}
        Ok(())
    }
}
pub(crate) fn verify_compiled_append(entry:&EncounterAppend,map:&crate::maps::MapInspection)->Result<()> {
        let(initial_state,return_state)=entry.states();
        entry.operation().validate("scnr",&format!("{}.scenario",map.scenario_path))?;
        let (normal_count,insane_count)=entry.difficulty_counts();
        let EncounterAppend{name,actor_path,start_active,count,..}=entry;
        let found=map.encounters.iter().filter(|encounter|encounter.name==*name).collect::<Vec<_>>();
        if map.header.scenario_type!=0||found.len()!=1{return invalid("Compiled native encounter is missing, ambiguous or not singleplayer");}
        let details=found[0].details.as_ref().ok_or_else(||crate::SparkError::Invalid("Compiled native encounter details are unreadable".into()))?;
        if (details.flags&1==0)!=*start_active||details.manual_bsp_index!=-1||details.squads.len()!=1||details.firing_positions.len()!=entry.firing_points()?.len(){return invalid("Compiled native encounter flags/BSP/squad/firing counts differ from the accepted source append");}
        let path=actor_path.replace('\\',"/");
        let actors=map.tags.iter().filter(|tag|tag.class=="actv"&&tag.path.replace('\\',"/").eq_ignore_ascii_case(&path)&&!tag.external&&tag.data_offset.is_some()).collect::<Vec<_>>();
        if actors.len()!=1{return invalid("Compiled source actor is missing, ambiguous or has no embedded body");}
        let actor=Some(actors[0].id);let squad=&details.squads[0];
        if squad.name!="source_squad"||squad.actor_variant_tag_id!=actor||squad.normal_count!=normal_count as i16||squad.insane_count!=insane_count as i16||squad.initial_state!=initial_state.native().1||squad.return_state!=return_state.native().1||squad.starting_locations.len()!=*count as usize{return invalid("Compiled native squad differs from the accepted source append");}
        if let Some(value) = &entry.major_upgrade {
            if squad.major_upgrade != Some(major_upgrade_index(value)?) {
                return invalid("Compiled major-variant upgrade policy differs from the accepted source append");
            }
        }
        let expected=entry.patrol_points()?;
        if !expected.is_empty(){let actual=squad.move_positions.as_ref().ok_or_else(||crate::SparkError::Invalid("Compiled patrol telemetry unavailable; rebuild/read the current source".into()))?;
            if actual.len()!=expected.len(){return invalid("Compiled native patrol count differs from source");}
            for(a,b)in actual.iter().zip(expected){if !positions_close(a.position,b.position)||!facings_close(a.facing,b.facing_radians)||(a.weight-b.weight).abs()>0.0001||a.wait_seconds.iter().zip(b.wait_seconds).any(|(x,y)|(*x-y).abs()>0.0001)||a.sequence_id!=0||a.animation!=-1{return invalid("Compiled native patrol differs from authored order, pose, weight or wait");}}
        }else if squad.move_positions.as_ref().is_some_and(|v|!v.is_empty()){return invalid("Compiled squad has unexpected movement points");}
        let mut remaining_poses=entry.poses()?;
        for start in &squad.starting_locations {
            if start.actor_variant_tag_id!=actor||start.actor_palette_index!=-1||start.command_list!=-1||start.flags&1==0||start.initial_state!=initial_state.native().1||start.return_state!=return_state.native().1{return invalid("Compiled native actor state differs from the accepted source append");}
            let index=remaining_poses.iter().position(|expected|positions_close(expected.position,start.position)&&facings_close(expected.facing_radians,start.facing)).ok_or_else(||crate::SparkError::Invalid("Compiled native actor pose differs from the accepted source".into()))?;remaining_poses.remove(index);
        }
        if let Some(combat)=&entry.combat{let g=squad.firing_groups.as_ref().ok_or_else(||crate::SparkError::Invalid("Compiled squad tactical telemetry unavailable; rebuild/reopen".into()))?;let actual=[g.attacking,g.attacking_search,g.attacking_guard,g.defending,g.defending_search,g.defending_guard];let expected=combat.groups.masks()?;if actual!=expected{return invalid(format!("Compiled tactical group selections differ from source: expected{expected:?}, actual{actual:?}. Review target compiler compatibility; no candidate was accepted"));}}
        let mut remaining=entry.firing_points()?;for p in &details.firing_positions{let i=remaining.iter().position(|v|positions_close(v.position,p.position)&&u16::from(v.group.as_bytes()[0]-b'a')==p.group_index).ok_or_else(||crate::SparkError::Invalid("Compiled firing point coordinate or group differs from source".into()))?;remaining.remove(i);}
        // Cached firing cluster/surface values can deliberately be NULL.
        // Source/cache identity is not navigation, collision or gameplay proof.
        Ok(())
}

pub fn number(fields: &str, name: &str) -> Result<f64> {
    let prefix = format!("{name} (");
    let mut lines = fields.lines().filter_map(|l| l.strip_prefix(&prefix));
    let Some(value) = lines
        .next()
        .and_then(|l| l.split_once(')'))
        .and_then(|(n, _)| n.parse::<f64>().ok())
    else {
        return invalid("The reviewed native field was not exposed by Invader");
    };
    if !value.is_finite() || lines.next().is_some() {
        return invalid("The native field is ambiguous or not finite");
    }
    Ok(value)
}
/// This pinned Invader reader displays angle fields in degrees. The documented
/// malformed tag contains 360 radians, not an ordinary 360-degree rotation.
pub fn broken_lens_scale(display_degrees: f64) -> bool {
    display_degrees.is_finite() && (display_degrees - 360.0f64.to_degrees()).abs() <= 0.000001
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FieldDifference {
    pub before: String,
    pub after: String,
}
pub fn reviewed_difference(
    before: &str,
    after: &str,
    operation: &Operation,
) -> Result<Vec<FieldDifference>> {
    if let Operation::VehicleFlight{tuning,..}=operation{return transport::reviewed_flight(before,after,tuning);}
    if let Operation::SquadTerminals{terminals,..}=operation{return factions::reviewed_squads(before,after,terminals);}
    if let Operation::FactionBody{body,replace_existing,..}=operation{return factions::review_body(before,after,body,*replace_existing);}
    if let Operation::FactionKits{kits,..}=operation{return factions::reviewed(before,after,kits);}
    if let Operation::AppendTransport{transport,..}=operation{return transport::reviewed(before,after,transport);}
    if let Operation::CommandList{list,append,..}=operation{return if *append{command_lists::reviewed_append(before,after,list)}else{command_lists::reviewed(before,after,list)};}
    if let Operation::MachineSettings { settings, .. } = operation { return reviewed_machine_settings(before, after, settings); }
    if let Operation::ControlSettings{settings,..}=operation{return reviewed_control_settings(before,after,settings);}
    if let Operation::DeviceGroupAppend { name, initial_value, change_once, .. } = operation {
        operation.validate("scnr", "readback.scenario")?;
        return reviewed_device_group_append(before, after, name, *initial_value, *change_once);
    }
    if let Operation::DevicePlacement{device,..}=operation{return reviewed_device(before,after,device);}
    if let Operation::TriggerVolume{index,name,geometry,append,..}=operation{
        if *append {
            operation.validate("scnr","readback.scenario")?;let old=scenario_volume_choices(before)?;let new=scenario_volume_choices(after)?;
            if *index as usize!=old.len()||old.iter().any(|row|row.name.eq_ignore_ascii_case(name))||new.len()!=old.len()+1||!new.last().is_some_and(|row|row.name==*name&&row.kind==1&&row.geometry.as_ref().is_some_and(|g|volume_geometry_close(g,geometry))){return invalid("Appended trigger differs from reviewed source");}
            transport::preserved_arrays(before,after,&[("trigger_volumes",1)])?;
            return Ok(vec![FieldDifference{before:format!("{} native areas",old.len()),after:format!("Append {name} at index{index}; original areas and script references retained")}]);
        }
        return reviewed_volume(before,after,*index,name,geometry);
    }
    if let Operation::CutsceneFlag{point,append,..}=operation{
        let old=native_flag_fields(before)?;let new=native_flag_fields(after)?;
        if *append{
            if point.index as usize!=old.len()||!crate::creative::script_ident(&point.name)||old.iter().any(|(p,_)|p.name.eq_ignore_ascii_case(&point.name))||new.len()!=old.len()+1||!new.last().is_some_and(|(p,_)|flag_points_close(p,point)){return invalid("Appended flag differs from reviewed native source");}
            transport::preserved_arrays(before,after,&[("cutscene_flags",1)])?;
            return Ok(vec![FieldDifference{before:format!("{} native flags",old.len()),after:format!("Append {} at index{}; original source retained",point.name,point.index)}]);
        }
        let original=old.iter().find(|(p,_)|p.index==point.index&&p.name==point.name).ok_or_else(||crate::SparkError::Invalid("Original flag identity changed".into()))?;
        let revised=new.iter().find(|(p,_)|p.index==point.index).ok_or_else(||crate::SparkError::Invalid("Revised flag missing".into()))?;
        if original.1!=revised.1||!flag_points_close(&revised.0,point){return invalid("Revised flag differs from requested pose");}
        let a_lines=before.lines().collect::<Vec<_>>();let b_lines=after.lines().collect::<Vec<_>>();if a_lines.len()!=b_lines.len(){return invalid("Flag edit changed source structure");}
        let mut differences=vec![];for(i,(a,b))in a_lines.iter().zip(b_lines).enumerate(){if *a==b{continue;}if !original.1.contains(&i){return invalid("Flag edit changed unrelated source");}differences.push(FieldDifference{before:(*a).into(),after:b.into()});}
        if differences.is_empty(){return invalid("Flag changed no fields");}return Ok(differences);
    }
    if let Operation::CutsceneCamera{point,append,..}=operation{
        if *append {
            let old=scenario_camera_choices(before)?;let new=scenario_camera_choices(after)?;
            if point.index as usize!=old.len()||!crate::creative::script_ident(&point.name)||old.iter().any(|p|p.name.eq_ignore_ascii_case(&point.name))||new.len()!=old.len()+1||!new.last().is_some_and(|p|camera_points_close(p,point)){return invalid("Appended camera differs from reviewed source/name/pose");}
            transport::preserved_arrays(before,after,&[("cutscene_camera_points",1)])?;
            return Ok(vec![FieldDifference{before:format!("{} native cameras",old.len()),after:format!("Append {} at index{}; original points and source retained",point.name,point.index)}]);
        }return reviewed_camera(before,after,point);
    }

    if operation.combat_target_key().is_some(){return reviewed_combat(before,after,operation);}
    if operation.is_squad_start_edit(){return reviewed_start_position(before,after,operation);}
    if operation.is_squad_count_edit() {return reviewed_squad_counts(before,after,operation);}
    if matches!(operation,Operation::HudDuplicate{..}) {return reviewed_hud_duplicate(before,after,operation);}
    if matches!(operation,Operation::AppendEncounters{..}) {return reviewed_encounter_group_append(before,after,operation);}
    if matches!(operation,Operation::AppendEncounter{..}) {return reviewed_encounter_append(before,after,operation);}
    let field = operation.field().ok_or_else(|| {
        crate::SparkError::Invalid("Dependency analysis does not edit a field".into())
    })?;
    let old = before.replace("\r\n", "\n");
    let new = after.replace("\r\n", "\n");
    let a: Vec<_> = old.lines().collect();
    let b: Vec<_> = new.lines().collect();
    if a.len() != b.len() {
        return invalid(
            "Native field structure changed unexpectedly; both files are retained for review",
        );
    }
    let differences: Vec<_> = a
        .iter()
        .zip(&b)
        .filter(|(a, b)| a != b)
        .map(|(a, b)| FieldDifference {
            before: (*a).into(),
            after: (*b).into(),
        })
        .collect();
    let prefix = format!("{field} (");
    if differences.len() != 1
        || !differences[0].before.starts_with(&prefix)
        || !differences[0].after.starts_with(&prefix)
    {
        return invalid("The native reader cannot certify exactly the intended exposed field change. No source revision was selected; review the retained candidate in its native editor.");
    }
    let actual = number(after, field)?;
    let expected = operation.target().unwrap();
    if (actual - expected).abs() > 0.000001f64.max(expected.abs() * f64::from(f32::EPSILON) * 2.0) {
        return invalid("The native saved value does not match the requested value");
    }
    if matches!(operation, Operation::LensFlareScaleRepair)
        && !broken_lens_scale(number(before, field)?)
    {
        return invalid("The reviewed repair precondition was not present");
    }
    Ok(differences)
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dependency {
    pub path: String,
    pub reported_broken: bool,
}
pub fn dependency_lines(output: &str) -> Result<Vec<Dependency>> {
    if output.len() > 1024 * 1024 {
        return invalid("Dependency output exceeded the review bound");
    }
    let mut rows = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    for line in output.lines().filter(|l| !l.is_empty()) {
        if rows.len() >= 20_000 {
            return invalid("Dependency output exceeds 20000 native references");
        }
        let (value, broken) = line
            .strip_suffix(" [BROKEN]")
            .map_or((line, false), |v| (v, true));
        let path = value.replace('\\', "/");
        safe_relative(&path)?;
        if !path.rsplit('/').next().is_some_and(|n| n.contains('.')) || path.starts_with('-') {
            return invalid(
                "Unexpected native dependency output; it was not accepted as a complete analysis",
            );
        }
        if !seen.insert(path.to_ascii_lowercase()) {
            return invalid("Duplicate/case-colliding native dependency output needs review");
        }
        rows.push(Dependency {
            path,
            reported_broken: broken,
        });
    }
    Ok(rows)
}


#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct HudArrayChoice {
    pub name:String,pub label:String,pub maximum:usize,pub count:Option<usize>,pub issue:Option<String>,
}
/// Inventory from the current loose tag's actual native-tool listing.
pub fn hud_array_choices(class:&str,fields:&str)->Result<Vec<HudArrayChoice>> {
    crate::maps::hud_root_arrays(class)?.into_iter().map(|array|{
        let (count,issue)=match array_listing(fields,&array.name) {
            Ok(listing) if listing.count<=array.maximum=>(Some(listing.count),None),
            Ok(_)=>(None,Some("Native array exceeds its admitted capacity".into())),
            Err(problem)=>(None,Some(problem.to_string())),
        };
        Ok(HudArrayChoice{name:array.name,label:array.label,maximum:array.maximum,count,issue})
    }).collect()
}
fn hud_array_limit(class:&str,name:&str)->Result<usize> {
    crate::maps::hud_root_arrays(class)?.into_iter().find(|array|array.name==name).map(|array|array.maximum)
        .ok_or_else(||crate::SparkError::Invalid("Choose an admitted native HUD root array, not an arbitrary tool key".into()))
}
fn array_items<'a>(listing:&'a ArrayListing,name:&str)->Result<Vec<&'a [String]>> {
    let mut starts=vec![];
    for(index,line)in listing.body.iter().enumerate() {
        if !line.starts_with("    ")||line.starts_with("        "){continue;}
        let tail=line.strip_prefix(&format!("    {name}[")).and_then(|tail|tail.split_once(']'))
            .ok_or_else(||crate::SparkError::Invalid("Unknown native array element boundary".into()))?;
        if tail.1.trim()!="struct"||tail.0.parse::<usize>().ok()!=Some(starts.len()){return invalid("Native elements are not a complete ordered inventory");}
        starts.push(index);
    }
    if starts.len()!=listing.count||(!starts.is_empty()&&starts[0]!=0)||starts.is_empty()&&!listing.body.is_empty(){return invalid("Native element count differs from its field inventory");}
    Ok(starts.iter().enumerate().map(|(index,start)|&listing.body[*start..starts.get(index+1).copied().unwrap_or(listing.body.len())]).collect())
}
/// Readback evidence for the current loose scenario, never a native tag group
/// or authority to replay source edits.
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ScenarioSquadReadback {
    pub source_sha256:String,pub squads:Vec<ScenarioSquadChoice>,
    #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub machine_settings: std::collections::BTreeMap<String, NativeMachineSettings>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub extraction_squads:Option<Vec<NativeSquadTerminalSnapshot>>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub faction_kits:Option<Vec<NativeFactionSnapshot>>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub transports:Option<Vec<TransportSnapshot>>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub command_lists:Option<Vec<NativeCommandList>>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub devices:Option<Vec<NativeDevicePlacement>>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub device_groups:Option<Vec<NativeDeviceGroupChoice>>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub volumes:Option<Vec<crate::maps::ScenarioLogicVolume>>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub named_objects:Option<Vec<crate::maps::NativeNamedObject>>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub cutscene_flags:Option<Vec<crate::maps::NativeCutsceneFlag>>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub cameras:Option<Vec<crate::maps::NativeCameraPoint>>,
    #[serde(default,skip_serializing_if="Vec::is_empty")] pub combat:Vec<Operation>,
    #[serde(default,skip_serializing_if="squad_positions_disabled")] pub include_starts:bool,
}
fn squad_positions_disabled(value:&bool)->bool{!*value}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ScenarioStartChoice {pub index:u16,pub position:[f32;3],
    #[serde(rename="facingRadians",default,skip_serializing_if="Option::is_none")] pub facing_radians:Option<f32>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub command_list:Option<i16>,
    #[serde(skip)] command_line:Option<usize>,
    #[serde(skip)] position_line:usize,#[serde(skip)] facing_line:Option<usize>}
/// Existing native player rows; no palette, team, BSP or gametype defaults are invented.
pub fn scenario_player_start_choices(fields:&str)->Result<Vec<ScenarioStartChoice>>{
 let array=array_listing(fields,"player_starting_locations")?;if array.count>4096{return invalid("Native player start inventory exceeds4096");}let mut line=array.start+1;let mut result=vec![];
 for(index,item)in array_items(&array,"player_starting_locations")?.iter().enumerate(){let root=direct_struct_fields(item)?;let(position,position_line)=native_vector(&root,"position")?;let facing=number(&root,"facing")? as f32;let facing_line=root.lines().position(|l|l.starts_with("facing (")).ok_or_else(||crate::SparkError::Invalid("Native player facing is unavailable".into()))?;if position.iter().any(|v|!v.is_finite()||v.abs()>1e6)||!facing.is_finite(){return invalid("Native player start pose is invalid");}result.push(ScenarioStartChoice{index:index as u16,position,facing_radians:Some(facing.to_radians()),command_list:None,command_line:None,position_line:line+1+position_line,facing_line:Some(line+1+facing_line)});line+=item.len();}Ok(result)
}
// The standard Halo 1 scenario block admits 256 starts.
const MAX_NATIVE_PLAYER_STARTS: usize = 256;

fn check_player_start_copy(fields: &str, index: u16, source: u16, position: [f32; 3]) -> Result<()> {
    let starts = scenario_player_start_choices(fields)?;
    if starts.len() >= MAX_NATIVE_PLAYER_STARTS || usize::from(index) != starts.len() || source >= index {
        return invalid("Choose an existing start and refresh the native start inventory before appending a copy");
    }
    if starts.iter().any(|start| positions_close(start.position, position)) {
        return invalid("Place the new start at a different position from every existing start");
    }
    Ok(())
}

fn reviewed_player_start_copy(before: &str, after: &str, index: u16, source: u16, position: [f32; 3], facing: f32) -> Result<Vec<FieldDifference>> {
    check_player_start_copy(before, index, source, position)?;
    let array = "player_starting_locations";
    transport::preserved_arrays(before, after, &[(array, 1)])?;
    let old = array_listing(before, array)?;
    let new = array_listing(after, array)?;
    let old_rows = array_items(&old, array)?;
    let new_rows = array_items(&new, array)?;
    let without_pose = |row: &[String]| row.iter().skip(1)
        .filter(|line| !line.starts_with("        position (") && !line.starts_with("        facing ("))
        .cloned().collect::<Vec<_>>();
    let copy = &scenario_player_start_choices(after)?[usize::from(index)];
    if without_pose(old_rows[usize::from(source)]) != without_pose(new_rows[usize::from(index)])
        || !positions_close(copy.position, position)
        || !copy.facing_radians.is_some_and(|value| facings_close(value, facing)) {
        return invalid("The appended start differs from the reviewed pose or its copied team, BSP, filters, or flags");
    }
    Ok(vec![FieldDifference {
        before: format!("{index} existing starts · template {source}"),
        after: format!("Start {index} · {:?} · {:.3}° · copied team, BSP, and gametype settings", position, facing.to_degrees()),
    }])
}

fn reviewed_player_start(before:&str,after:&str,op:&Operation)->Result<Vec<FieldDifference>>{
 let Operation::PlayerStartPosition{index,copy_from,position,facing_radians,..}=op else{return invalid("Not a player start edit");};op.validate("scnr","readback.scenario")?;if let Some(source)=copy_from{return reviewed_player_start_copy(before,after,*index,*source,*position,*facing_radians);}let old=scenario_player_start_choices(before)?;let new=scenario_player_start_choices(after)?;if old.len()!=new.len(){return invalid("Player start edit changed native inventory");}let a=old.get(usize::from(*index)).ok_or_else(||crate::SparkError::Invalid("Selected player start is missing".into()))?;let b=&new[usize::from(*index)];if a.position_line!=b.position_line||a.facing_line!=b.facing_line||!positions_close(*position,b.position)||!facings_close(*facing_radians,b.facing_radians.unwrap()){return invalid("Player start readback differs from reviewed pose");}let a_lines=before.lines().collect::<Vec<_>>();let b_lines=after.lines().collect::<Vec<_>>();if a_lines.len()!=b_lines.len(){return invalid("Player start edit changed native field structure");}let allowed=[a.position_line,a.facing_line.unwrap()];let mut changes=vec![];for(i,(a,b))in a_lines.iter().zip(b_lines).enumerate(){if *a!=b{if !allowed.contains(&i){return invalid("Player start edit changed other starts, BSP/team, gametype, flags, scripts or unrelated source");}changes.push(FieldDifference{before:(*a).into(),after:b.into()});}}if changes.is_empty(){return invalid("Player start pose already matches");}Ok(changes)
}
/// Native yaw is periodic. Invader's text angle is degrees; tag/cache values are radians.
pub(crate) fn facings_close(a:f32,b:f32)->bool {
    a.is_finite()&&b.is_finite()&&((f64::from(a)-f64::from(b)+std::f64::consts::PI).rem_euclid(std::f64::consts::TAU)-std::f64::consts::PI).abs()<=0.000002
}
pub(crate) fn positions_close(a:[f32;3],b:[f32;3])->bool {
    a.iter().zip(b).all(|(a,b)|a.is_finite()&&b.is_finite()&&
        (f64::from(*a)-f64::from(b)).abs()<=0.000001f64.max(f64::from(*a).abs()*f64::from(f32::EPSILON)*2.))
}
impl ScenarioSquadReadback {
    pub fn validate(&self)->Result<()> {
        if self.machine_settings.len() > 32 {
            return invalid("Native machine settings readback exceeds 32 reviewed tags");
        }
        for (tag, settings) in &self.machine_settings {
            safe_relative(tag)?;
            if tag.starts_with('-') || !tag.ends_with(".device_machine") || tag.contains(['?', '*']) {
                return invalid("Native machine settings readback requires an exact device_machine selector");
            }
            settings.validate()?;
        }
        if self.source_sha256.len()!=64||!self.source_sha256.bytes().all(|c|c.is_ascii_hexdigit())||self.squads.len()>4096 {
            return invalid("Native squad readback needs an exact source SHA256 and bounded inventory");
        }
        if self.combat.len()>4096{return invalid("Native combat readback exceeds4096selected targets");}let mut targets=std::collections::BTreeSet::new();for op in &self.combat{let key=op.combat_target_key().ok_or_else(||crate::SparkError::Invalid("Unsupported combat readback operation".into()))?;if !targets.insert(key){return invalid("Duplicate native combat readback target");}op.validate("scnr","readback.scenario")?;let source=op.expected_source_sha256().ok_or_else(||crate::SparkError::Invalid("Unsupported native combat readback source binding".into()))?;if !source.eq_ignore_ascii_case(&self.source_sha256){return invalid("Combat readback source identity differs from its snapshot");}}
        if let Some(rows)=&self.extraction_squads{if rows.len()>22{return invalid("Squad terminal snapshot exceeds22");}let mut seen=std::collections::BTreeSet::new();for row in rows{row.validate()?;if !seen.insert(row.terminal.number){return invalid("Duplicate squad terminal snapshot");}}}
        if let Some(kits)=&self.faction_kits{if kits.len()>2{return invalid("Faction snapshot exceeds two roles");}let mut seen=std::collections::BTreeSet::new();for row in kits{row.kit.validate()?;if !seen.insert(&row.kit.faction)||row.control_index>=100||row.name_index>=512||row.profile_index>=256||!(0..128).contains(&row.power_group)||!(0..128).contains(&row.position_group){return invalid("Invalid faction source snapshot");}}}
        if let Some(objects)=&self.named_objects{let mut names=std::collections::BTreeSet::new();let mut placements=std::collections::BTreeSet::new();if objects.len()>512||objects.iter().any(|o|o.name.len()>32||o.name.chars().any(char::is_control)||o.name_index>=512||o.index>=4096||!names.insert(o.name_index)||!placements.insert((&o.class,o.index))||!crate::maps::NAMED_OBJECT_BLOCKS.iter().any(|b|b.2==o.class)||crate::safe_relative(&o.tag_path).is_err()||o.position.iter().any(|v|!v.is_finite()||v.abs()>1e6)){return invalid("Invalid native named object snapshot");}}
        if let Some(flags)=&self.cutscene_flags{if flags.len()>512||flags.iter().enumerate().any(|(i,p)|p.index as usize!=i||p.name.len()>32||p.name.chars().any(char::is_control)||p.position.iter().any(|v|!v.is_finite()||v.abs()>1e6)||p.facing_radians.iter().any(|v|!v.is_finite()||v.abs()>20000.)){return invalid("Invalid native flag snapshot");}}
        if let Some(points)=&self.cameras{if points.len()>512||points.iter().enumerate().any(|(i,p)|usize::from(p.index)!=i||p.name.len()>32||p.name.chars().any(char::is_control)||p.position.iter().any(|v|!v.is_finite()||v.abs()>1e6)||p.orientation_radians.iter().any(|v|!v.is_finite()||v.abs()>20000.)||!p.fov_radians.is_finite()){return invalid("Invalid native camera snapshot inventory");}}
        if let Some(lists)=&self.command_lists{if lists.len()>256{return invalid("Command snapshot exceeds256lists");}for(i,list)in lists.iter().enumerate(){if list.index as usize!=i{return invalid("Command snapshot indices changed");}list.validate()?;}}
        if let Some(transports)=&self.transports{if transports.len()>2{return invalid("Transport snapshot exceeds two faction roles");}let mut names=std::collections::BTreeSet::new();for row in transports{row.validate()?;if !names.insert(&row.transport.name){return invalid("Duplicate transport snapshot role");}}}
        if let Some(groups) = &self.device_groups {
            if groups.len() > 128 || groups.iter().enumerate().any(|(index, group)| !group.valid_at(index)) {
                return invalid("Invalid native device group snapshot inventory");
            }
        }
        if let Some(devices)=&self.devices{let mut seen=std::collections::BTreeSet::new();if devices.len()>8192||devices.iter().any(|d|!d.valid()||!seen.insert((&d.class,d.index))){return invalid("Invalid native device snapshot inventory");}}
        if let Some(volumes)=&self.volumes{if volumes.len()>1024||volumes.iter().any(|v|v.name.len()>32||v.name.chars().any(char::is_control)||v.kind>1||(v.kind==1)!=v.geometry.is_some()||v.geometry.as_ref().is_some_and(|g|!g.valid())){return invalid("Invalid trigger snapshot inventory");}}
        let mut seen=std::collections::BTreeSet::new();let mut starts=0usize;
        for row in &self.squads {
            if row.encounter>=128||row.squad>=4096||!seen.insert((row.encounter,row.squad))||
                [&row.encounter_name,&row.name].iter().any(|name|name.len()>32||name.chars().any(char::is_control)) {
                return invalid("Native squad readback contains an invalid identity or duplicate index");
            }
            if self.include_starts!=row.starts.is_some(){return invalid("Native starting-position readback scope is inconsistent");}
            if let Some(points)=&row.starts{
                starts+=points.len();
                if starts>4096{return invalid("Native starting-position review exceeds4096points");}
                for (index,point) in points.iter().enumerate(){
                    if usize::from(point.index)!=index||point.command_list.is_some_and(|index|!(-1..256).contains(&index))||point.position.iter().any(|value|!value.is_finite()||value.abs()>1e6)||point.facing_radians.is_some_and(|value|!value.is_finite()||value.abs()>20000.){
                        return invalid("Native starting-position inventory is incomplete or outside supported coordinates");
                    }
                }
            }
        }
        Ok(())
    }
    pub fn verify_cache(&self,path:&Path,map:&crate::maps::MapInspection)->Result<()> {
        self.verify_map(map)?;
        if let Some(expected)=&self.named_objects{let actual=crate::maps::scenario_named_object_readback(path,map)?;if expected.len()!=actual.len()||expected.iter().zip(&actual).any(|(a,b)|a.name!=b.name||a.class!=b.class||a.index!=b.index||a.name_index!=b.name_index||!a.tag_path.replace('\\',"/").eq_ignore_ascii_case(&b.tag_path.replace('\\',"/"))||!positions_close(a.position,b.position)){return invalid("Compiled named object identity, asset or position differs from reviewed source");}}
        if let Some(expected)=&self.cutscene_flags{let actual=crate::maps::scenario_flag_readback(path,map)?;if expected.len()!=actual.len()||expected.iter().zip(&actual).any(|(a,b)|!flag_points_close(a,b)){return invalid("Compiled cutscene flags differ from reviewed source");}}if let Some(expected)=&self.extraction_squads{factions::verify_squad_cache(expected,path,map)?;}if let Some(expected)=&self.faction_kits{factions::verify_cache(expected,path,map)?;}if let Some(expected)=&self.transports{transport::verify_cache(expected,path,map)?;}if let Some(expected)=&self.command_lists{let actual=crate::maps::scenario_command_readback(path,map)?;if expected.len()!=actual.len()||expected.iter().zip(&actual).any(|(a,b)|!a.close(b)){return invalid("Compiled command lists/actions/parameters/references/points differ from reviewed source");}}if let Some(expected)=&self.devices{verify_devices_cache(expected,path,map)?;}
        if let Some(expected) = &self.device_groups { verify_device_groups_cache(expected, path, map)?; }
        if let Some(expected)=&self.volumes{let actual=crate::maps::scenario_volume_readback(path,map)?;if actual.len()!=expected.len()||expected.iter().zip(actual).any(|(a,b)|a.name!=b.name||a.kind!=b.kind||match(&a.geometry,&b.geometry){(Some(a),Some(b))=>!volume_geometry_close(a,b),(None,None)=>false,_=>true}){return invalid("Compiled trigger inventory, identity or geometry differs from reviewed source");}}if let Some(expected)=&self.cameras{let actual=crate::maps::scenario_camera_readback(path,map)?;if actual.len()!=expected.len()||expected.iter().zip(&actual).any(|(a,b)|!camera_points_close(a,b)){return invalid("Compiled native camera inventory/name/pose/lens differs from reviewed source");}}Ok(())
    }
    pub fn verify_map(&self,map:&crate::maps::MapInspection)->Result<()> {
        self.validate()?;
        let count=map.encounters.iter().try_fold(0usize,|count,encounter|encounter.details.as_ref().map(|details|count+details.squads.len())
            .ok_or_else(||crate::SparkError::Invalid("Compiled native encounter details are unavailable; squad parity is unproven".into())))?;
        if count!=self.squads.len(){return invalid("Compiled native squad inventory differs from the reviewed source");}
        for row in &self.squads {
            verify_native_squad(map,row.encounter,row.squad,&row.encounter_name,&row.name,row.normal_count,row.insane_count)?;
            if let Some(starts)=&row.starts{
                let native=map.encounters.get(usize::from(row.encounter)).and_then(|encounter|encounter.details.as_ref())
                    .and_then(|details|details.squads.get(usize::from(row.squad))).ok_or_else(||crate::SparkError::Invalid("Compiled AI starting locations are unavailable".into()))?;
                if native.starting_locations.len()!=starts.len(){return invalid("Compiled AI starting-location inventory differs from the source");}
                for point in starts{
                    let actual=&native.starting_locations[usize::from(point.index)];
                    if !positions_close(point.position,actual.position)||point.facing_radians.is_some_and(|expected|!facings_close(expected,actual.facing))||point.command_list.is_some_and(|expected|expected!=actual.command_list){return invalid("Compiled AI starting position/facing differs from the reviewed native source");}
                }
            }
        }
        for op in &self.combat{verify_native_combat(op,map)?;}
        Ok(())
    }
}
fn verify_native_squad(map:&crate::maps::MapInspection,encounter:u16,squad:u16,encounter_name:&str,squad_name:&str,normal:i16,insane:i16)->Result<()> {
    let region=map.encounters.get(usize::from(encounter)).ok_or_else(||crate::SparkError::Invalid("Compiled native encounter index is unavailable".into()))?;
    let member=region.details.as_ref().and_then(|details|details.squads.get(usize::from(squad)))
        .ok_or_else(||crate::SparkError::Invalid("Compiled native squad details are unavailable".into()))?;
    if region.name!=encounter_name||member.name!=squad_name||member.normal_count!=normal||member.insane_count!=insane {
        return invalid("Compiled native squad identity/difficulty counts differ from the accepted source");
    }
    Ok(())
}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ScenarioSquadChoice {
    pub encounter:u16,pub squad:u16,pub encounter_name:String,pub name:String,
    pub normal_count:i16,pub insane_count:i16,
    #[serde(default,skip_serializing_if="Option::is_none")] pub starts:Option<Vec<ScenarioStartChoice>>,
    #[serde(skip)] normal_line:usize,
    #[serde(skip)] insane_line:usize,
}
fn direct_struct_fields(item:&[String])->Result<String> {
    item.iter().skip(1).map(|line|line.strip_prefix("        ").ok_or_else(||crate::SparkError::Invalid("Unknown nested native field indentation".into())))
        .collect::<Result<Vec<_>>>().map(|lines|lines.join("\n"))
}
fn native_name(fields:&str)->Result<String> {
    let mut values=fields.lines().filter_map(|line|line.strip_prefix("name (")).filter_map(|line|line.rsplit_once(')').map(|value|value.0));
    let value=values.next().ok_or_else(||crate::SparkError::Invalid("Native encounter/squad name is unavailable".into()))?;
    if values.next().is_some(){return invalid("Native encounter/squad name is ambiguous");}
    Ok(value.into())
}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ScenarioCommandListChoice{pub index:u16,pub name:String,pub commands:usize}
/// Read native command-list identities only; never reinterpret or rewrite opcodes.
pub fn scenario_command_list_choices(fields:&str)->Result<Vec<ScenarioCommandListChoice>>{
    let array=array_listing(fields,"command_lists")?;if array.count>256{return invalid("Native command list inventory exceeds256entries");}
    array_items(&array,"command_lists")?.iter().enumerate().map(|(index,item)|{
        let root=direct_struct_fields(item)?;let name=native_name(&root)?;if name.len()>32||name.chars().any(char::is_control){return invalid("Invalid native command list name");}
        let commands=array_listing(&root,"commands")?.count;if commands>64{return invalid("Native command list exceeds64commands");}
        Ok(ScenarioCommandListChoice{index:index as u16,name,commands})
    }).collect()
}
fn squad_count_field(fields:&str,name:&str)->Result<(i16,usize)> {
    let value=number(fields,name)?;
    if value.fract()!=0.0||value<f64::from(i16::MIN)||value>f64::from(i16::MAX){return invalid("Native squad count is not an admitted signed short");}
    let line=fields.lines().position(|line|line.starts_with(&format!("{name} ("))).ok_or_else(||crate::SparkError::Invalid("Native squad count field is unavailable".into()))?;
    Ok((value as i16,line))
}
/// Current native-tool fields only. Array order, names, unknown values and
/// structural/script references are preserved; this does not interpret tag bytes.
pub fn scenario_squad_choices(fields:&str)->Result<Vec<ScenarioSquadChoice>> {scenario_squad_inventory(fields,false)}
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct NativeMissionEncounter {pub name:String,pub initially_created:bool}
/// Project the actual encounter flag from the existing bounded field listing.
pub fn native_mission_encounters(fields:&str)->Result<Vec<NativeMissionEncounter>>{
 let table=array_listing(fields,"encounters")?;if table.count>128{return invalid("Native mission encounter budget exceeded");}
 array_items(&table,"encounters")?.iter().map(|item|{let root=direct_struct_fields(item)?;let name=native_name(&root)?;let flags=root.lines().filter_map(|line|line.strip_prefix("    not_initially_created (")).collect::<Vec<_>>();
  if flags.len()!=1{return invalid("Native encounter initial-creation flag is missing or ambiguous");}
  let(value,kind)=flags[0].split_once(')').ok_or_else(||crate::SparkError::Invalid("Native encounter initial-creation flag is malformed".into()))?;if kind.trim()!="bitfield"{return invalid("Native encounter initial-creation flag has an unsupported type");}let initially_created=match value.trim(){"0"=>true,"1"=>false,_=>return invalid("Native encounter initial-creation flag has an unsupported value")};Ok(NativeMissionEncounter{name,initially_created})
 }).collect()
}
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct NativeMissionWeapon {pub tag_path:String,pub placements:Vec<u16>,pub starting_equipment:bool,pub objects:Vec<NativeMissionWeaponObject>}
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct NativeMissionWeaponObject {pub index:u16,pub name:Option<String>,pub not_placed_automatically:bool,pub create_issue:Option<String>}
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct NativeMissionSource {pub encounters:Vec<NativeMissionEncounter>,pub weapons:Vec<NativeMissionWeapon>}
/// Current native placements and every starting profile, never a stale cache's
/// palette alone. This is source selection, not a claim that an item spawns.
/// One checked native reader reference shape, shared by weapons and pilot chains.
fn native_dependency_path(root:&str,key:&str,extension:&str)->Result<Option<String>>{
 let prefix=format!("{key} (");let lines=root.lines().collect::<Vec<_>>();
 // Invader's actual listing prints an empty dependency without parentheses.
 // Count both spellings together: a missing or duplicated field is not null.
 let rows=lines.iter().enumerate().filter_map(|(i,line)|if let Some(value)=line.strip_prefix(&prefix){Some((i,Some(value)))}else if line.split_whitespace().collect::<Vec<_>>()==[key,"dependency"]{Some((i,None))}else{None}).collect::<Vec<_>>();
 if rows.len()!=1{return invalid(format!("Native {key} reference is missing or ambiguous"));}
 let (index,Some(text))=rows[0]else{return Ok(None);};let(value,kind)=text.rsplit_once(')').ok_or_else(||crate::SparkError::Invalid("Malformed native tag reference".into()))?;
 // Invader omits its type column on long values. The installed native reader
 // still validates the tag; require the known field's exact extension below.
 let kind=kind.trim();let kind=if kind.is_empty()&&lines.get(index+1).is_some_and(|line|line.trim()=="dependency"){"dependency"}else{kind};
 if !kind.is_empty()&&kind!="dependency"{return invalid(format!("Unsupported native {key} reference type"));}if value.is_empty()||value=="null"{return Ok(None);}
 let value=value.replace('\\',"/");let suffix=format!(".{extension}");let path=value.strip_suffix(&suffix).ok_or_else(||crate::SparkError::Invalid(format!("Native {key} reference has another tag class")))?;
 safe_relative(path)?;if path.len()>240||path.starts_with('-'){return invalid("Native tag path exceeds its safety bounds");}Ok(Some(path.into()))
}
pub fn native_guidance_objects(fields:&str)->Result<Vec<crate::maps::NativeNamedObject>>{
 let table=array_listing(fields,"object_names")?;if table.count>512{return invalid("Named object table exceeds512");}
 let names=array_items(&table,"object_names")?.iter().map(|item|native_name(&direct_struct_fields(item)?)).collect::<Result<Vec<_>>>()?;
 let mut result=vec![];let mut used=std::collections::BTreeSet::new();
 for &(array,palette,class,extension,_,_,_,_,_)in crate::maps::NAMED_OBJECT_BLOCKS{
  let block=array_listing(fields,array)?;if block.count>4096{return invalid("Named object placement count exceeds4096");}
  let pal=array_listing(fields,palette)?;if pal.count>4096{return invalid("Named object palette exceeds4096");}
  let references=array_items(&pal,palette)?.iter().map(|item|native_dependency_path(&direct_struct_fields(item)?,"name",extension)).collect::<Result<Vec<_>>>()?;
  for(index,item)in array_items(&block,array)?.iter().enumerate(){let root=direct_struct_fields(item)?;let name_index=native_index(&root,"name")?;if name_index<0{continue;}
   let name=names.get(name_index as usize).ok_or_else(||crate::SparkError::Invalid("Named object name index is missing".into()))?;
   if !used.insert(name_index){return invalid("Native object name binds more than one placement");}
   let tag=native_index(&root,"type")?;let tag_path=usize::try_from(tag).ok().and_then(|i|references.get(i)).and_then(|r|r.clone()).ok_or_else(||crate::SparkError::Invalid("Named object palette reference is unavailable".into()))?;
   let(position,_)=native_position(&root)?;
   result.push(crate::maps::NativeNamedObject{name:name.clone(),class:class.into(),index:index as u16,name_index:name_index as u16,tag_path,position});
  }
 }Ok(result)
}
pub fn native_mission_source(fields:&str)->Result<NativeMissionSource>{
 let encounters=native_mission_encounters(fields)?;
 let reference=|root:&str,key:&str|native_dependency_path(root,key,"weapon");
 let palette=array_listing(fields,"weapon_palette")?;let placed=array_listing(fields,"weapons")?;let profiles=array_listing(fields,"player_starting_profile")?;
 if palette.count>256||placed.count>4096||profiles.count>256{return invalid("Native mission weapon inventory exceeds its review bounds");}
 let refs=array_items(&palette,"weapon_palette")?.iter().map(|item|reference(&direct_struct_fields(item)?,"name")).collect::<Result<Vec<_>>>()?;
 let mut loadout=std::collections::BTreeSet::new();for item in array_items(&profiles,"player_starting_profile")?{let root=direct_struct_fields(item)?;for key in ["primary_weapon","secondary_weapon"]{if let Some(path)=reference(&root,key)?{loadout.insert(path.to_ascii_lowercase());}}}
 let names=array_listing(fields,"object_names")?;if names.count>512{return invalid("Native object name table exceeds512entries");}
 let names=array_items(&names,"object_names")?.iter().map(|row|native_name(&direct_struct_fields(row)?)).collect::<Result<Vec<_>>>()?;
 let mut weapons:Vec<NativeMissionWeapon>=vec![];
 for(index,item)in array_items(&placed,"weapons")?.iter().enumerate(){let root=direct_struct_fields(item)?;let palette=native_index(&root,"type")?;let tag=usize::try_from(palette).ok().and_then(|n|refs.get(n)).and_then(|path|path.as_ref()).ok_or_else(||crate::SparkError::Invalid("Placed native weapon has an invalid or null palette reference".into()))?;
  let name_index=native_index(&root,"name")?;let name=if name_index==-1{None}else{Some(names.get(usize::try_from(name_index).map_err(|_|crate::SparkError::Invalid("Invalid native weapon name index".into()))?).ok_or_else(||crate::SparkError::Invalid("Native weapon name index is outside its table".into()))?.clone())};
  let(_,flags)=native_children(&root,"not_placed","bitmask",5)?;let mut automatic=None;
  for(_,field)in flags{let(key,tail)=field.split_once(" (").ok_or_else(||crate::SparkError::Invalid("Invalid weapon placement flags".into()))?;let(value,kind)=tail.split_once(')').ok_or_else(||crate::SparkError::Invalid("Invalid weapon placement flag".into()))?;if kind.trim()!="bitfield"||!["0","1"].contains(&value){return invalid("Unsupported weapon placement flag value");}if key=="automatically"{if automatic.replace(value=="1").is_some(){return invalid("Ambiguous automatic weapon placement flag");}}}
  let not_placed_automatically=automatic.ok_or_else(||crate::SparkError::Invalid("Missing automatic weapon placement flag".into()))?;
  let create_issue=if let Some(name)=&name{if name.is_empty()||name.len()>31||!name.bytes().next().is_some_and(|v|v.is_ascii_alphabetic()||v==b'_')||!name.bytes().all(|v|v.is_ascii_alphanumeric()||v==b'_'){Some("This name needs manual source reconciliation before scripted creation".into())}else if names.iter().filter(|n|n.eq_ignore_ascii_case(name)).count()!=1{Some("This native object name is ambiguous".into())}else if !not_placed_automatically{Some("Automatic placement is enabled; use the existing placement or review its source flags".into())}else{None}}else{Some("This placement has no native script name".into())};
  let object=NativeMissionWeaponObject{index:index as u16,name,not_placed_automatically,create_issue};
  if let Some(row)=weapons.iter_mut().find(|row|row.tag_path.eq_ignore_ascii_case(tag)){row.placements.push(index as u16);row.objects.push(object);}else{weapons.push(NativeMissionWeapon{tag_path:tag.clone(),placements:vec![index as u16],starting_equipment:loadout.contains(&tag.to_ascii_lowercase()),objects:vec![object]});}
 }
 let mut counts=std::collections::BTreeMap::new();for object in weapons.iter().flat_map(|w|&w.objects){if let Some(name)=&object.name{*counts.entry(name.to_ascii_lowercase()).or_insert(0usize)+=1;}}
 for object in weapons.iter_mut().flat_map(|w|&mut w.objects){if object.name.as_ref().is_some_and(|name|counts[&name.to_ascii_lowercase()]!=1){object.create_issue=Some("Multiple weapon placements use this native name".into());}}
 Ok(NativeMissionSource{encounters,weapons})
}
pub fn scenario_squad_start_choices(fields:&str)->Result<Vec<ScenarioSquadChoice>> {scenario_squad_inventory(fields,true)}
fn native_position(fields:&str)->Result<([f32;3],usize)> {native_vector(fields,"position")}
fn native_vector(fields:&str,key:&str)->Result<([f32;3],usize)> {
    let values=fields.lines().enumerate().filter_map(|(index,line)|line.strip_prefix(&format!("{key} (")).map(|tail|(index,tail))).collect::<Vec<_>>();
    if values.len()!=1{return invalid("Native starting position is unavailable or ambiguous");}
    let (index,tail)=values[0];
    let value=tail.split_once(')').ok_or_else(||crate::SparkError::Invalid("Malformed native position field".into()))?.0;
    let coordinates=value.split(',').map(|value|value.trim().parse::<f32>()).collect::<std::result::Result<Vec<_>,_>>()
        .map_err(|_|crate::SparkError::Invalid("Native starting position is not a vector".into()))?;
    if coordinates.len()!=3||coordinates.iter().any(|value|!value.is_finite()||value.abs()>1e6){return invalid("Native starting position exceeds its coordinate bounds");}
    Ok(([coordinates[0],coordinates[1],coordinates[2]],index))
}
fn scenario_squad_inventory(fields:&str,include_starts:bool)->Result<Vec<ScenarioSquadChoice>> {
    let encounters=array_listing(fields,"encounters")?;
    if encounters.count>128{return invalid("Native encounter inventory exceeds128entries");}
    let mut choices=vec![];let mut encounter_line=encounters.start+1;let mut total_starts=0usize;
    for (encounter,item) in array_items(&encounters,"encounters")?.iter().enumerate() {
        let root=direct_struct_fields(item)?;let encounter_name=native_name(&root)?;
        let squads=array_listing(&root,"squads")?;
        let mut squad_line=encounter_line+1+squads.start+1;
        for (squad,item) in array_items(&squads,"squads")?.iter().enumerate() {
            if choices.len()>=4096{return invalid("Native squad inventory exceeds4096entries");}
            let root=direct_struct_fields(item)?;
            let (normal_count,normal)=squad_count_field(&root,"normal_diff_count")?;
            let (insane_count,insane)=squad_count_field(&root,"insane_diff_count")?;
            let starts=if include_starts{
                let locations=array_listing(&root,"starting_locations")?;
                total_starts+=locations.count;if total_starts>4096{return invalid("Native starting-position review exceeds4096points");}
                let mut start_line=squad_line+1+locations.start+1;let mut points=vec![];
                for (index,item) in array_items(&locations,"starting_locations")?.iter().enumerate(){
                    let fields=direct_struct_fields(item)?;let (position,line)=native_position(&fields)?;
                    let facing_line=fields.lines().position(|line|line.starts_with("facing ("));
                    let facing_radians=if facing_line.is_some(){if !fields.lines().nth(facing_line.unwrap()).is_some_and(|line|line.split_once(')').is_some_and(|(_,kind)|matches!(kind.trim(),"angle"|"angle (float32)"))){return invalid("Unknown native AI facing field type");}let degrees=number(&fields,"facing")?;if degrees.abs()>1e6{return invalid("Native AI facing exceeds the supported reader bound");}Some(degrees.to_radians() as f32)}else{None};
                    let command_line=fields.lines().position(|line|line.starts_with("command_list ("));
                    let command_list=if command_line.is_some(){let raw=number(&fields,"command_list")?;let value=if raw==65535.0{-1}else if raw.fract()==0.0&&(-1.0..256.0).contains(&raw){raw as i16}else{return invalid("Native start command list exceeds supported indices");};Some(value)}else{None};
                    points.push(ScenarioStartChoice{index:index as u16,position,facing_radians,command_list,command_line:command_line.map(|line|start_line+1+line),position_line:start_line+1+line,facing_line:facing_line.map(|line|start_line+1+line)});
                    start_line+=item.len();
                }
                Some(points)
            }else{None};
            choices.push(ScenarioSquadChoice{starts,encounter:encounter as u16,squad:squad as u16,encounter_name:encounter_name.clone(),
                name:native_name(&root)?,normal_count,insane_count,normal_line:squad_line+1+normal,insane_line:squad_line+1+insane});
            squad_line+=item.len();
        }
        encounter_line+=item.len();
    }
    Ok(choices)
}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ScenarioFiringChoice {pub index:u16,pub position:[f32;3],pub group:String,#[serde(skip)] position_line:usize,#[serde(skip)] group_lines:Vec<usize>}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ScenarioFiringSquadChoice {pub index:u16,pub name:String,pub groups:FiringGroups,#[serde(default,skip_serializing_if="Option::is_none")] pub behavior:Option<ScenarioSquadBehavior>,#[serde(default,skip_serializing_if="Option::is_none")] pub behavior_issue:Option<String>,#[serde(default,skip_serializing_if="Option::is_none")] pub patrol:Option<ScenarioPatrolRoute>,#[serde(default,skip_serializing_if="Option::is_none")] pub patrol_issue:Option<String>,#[serde(skip)] group_lines:Vec<Vec<usize>>}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ScenarioCombatChoice {pub encounter:u16,pub name:String,pub points:Vec<ScenarioFiringChoice>,pub squads:Vec<ScenarioFiringSquadChoice>}
/// Original movement rows keep their native identity through copy/move/erase.
/// Source indices select records, never animation or scenario references to rewrite.
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ScenarioPatrolPoint {
    pub source_index:Option<u16>,pub position:[f32;3],pub facing_radians:f32,
    pub weight:f32,pub wait_seconds:[f32;2],pub animation:i16,pub sequence_id:i8,
    #[serde(skip)] fields:Vec<String>,
}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ScenarioPatrolRoute {pub points:Vec<ScenarioPatrolPoint>,#[serde(skip)] start:usize,#[serde(skip)] end:usize}
impl ScenarioPatrolRoute {
    fn validate(&self)->Result<()> {
        if self.points.len()>32{return invalid("Native patrol exceeds32movement positions");}
        for p in &self.points {
            if p.source_index.is_some_and(|i|i>=32)||p.position.iter().any(|v|!v.is_finite()||v.abs()>1e6)||!p.facing_radians.is_finite()||p.facing_radians.abs()>1e6||!p.weight.is_finite()||p.weight<0.||p.weight>1e6||p.wait_seconds.iter().any(|v|!v.is_finite()||*v<0.||*v>1e6)||p.wait_seconds[0]>p.wait_seconds[1]{return invalid("Invalid native patrol pose, weight or wait bounds");}
        }Ok(())
    }
}
fn native_patrol(fields:&str,offset:usize)->Result<ScenarioPatrolRoute>{
    let array=array_listing(fields,"move_positions")?;if array.count>32{return invalid("Native patrol exceeds32positions");}let mut points=vec![];
    for(i,item)in array_items(&array,"move_positions")?.iter().enumerate(){
        let fields=direct_struct_fields(item)?;let(position,_)=native_position(&fields)?;let time=fields.lines().find_map(|s|s.strip_prefix("time (").and_then(|s|s.split_once(')').map(|p|p.0))).ok_or_else(||crate::SparkError::Invalid("Patrol wait bounds unavailable".into()))?;
        let values=time.split(',').map(|s|s.trim().parse::<f32>()).collect::<std::result::Result<Vec<_>,_>>().map_err(|_|crate::SparkError::Invalid("Patrol wait bounds invalid".into()))?;if values.len()!=2{return invalid("Patrol wait bounds unavailable");}
        let animation=number(&fields,"animation")?;let sequence=number(&fields,"sequence_id")?;if animation.fract()!=0.||!(0. ..=65535.).contains(&animation)||sequence.fract()!=0.||!(-128. ..=127.).contains(&sequence){return invalid("Patrol animation/sequence telemetry unsupported");}
        points.push(ScenarioPatrolPoint{source_index:Some(i as u16),position,facing_radians:number(&fields,"facing")?.to_radians() as f32,weight:number(&fields,"weight")? as f32,wait_seconds:[values[0],values[1]],animation:animation as u16 as i16,sequence_id:sequence as i8,fields:fields.lines().map(str::to_owned).collect()});
    }
    let route=ScenarioPatrolRoute{points,start:offset+array.start,end:offset+array.end};route.validate()?;Ok(route)
}
fn patrol_point_close(a:&ScenarioPatrolPoint,b:&ScenarioPatrolPoint)->bool{
    positions_close(a.position,b.position)&&facings_close(a.facing_radians,b.facing_radians)&&positions_close([a.weight,a.wait_seconds[0],a.wait_seconds[1]],[b.weight,b.wait_seconds[0],b.wait_seconds[1]])&&a.animation==b.animation&&a.sequence_id==b.sequence_id
}
fn patrol_arguments(encounter:u16,squad:u16,route:&ScenarioPatrolRoute,old:&ScenarioPatrolRoute,behavior:Option<&ScenarioSquadBehavior>)->Result<Vec<String>>{
    route.validate()?;let mut args=vec![];let prefix=format!("encounters[{encounter}].squads[{squad}].move_positions");
    if route.points.len()!=old.points.len(){let behavior=behavior.ok_or_else(||crate::SparkError::Invalid("Native state inventory unavailable; cannot change patrol count".into()))?;for(a,b)in behavior.states(){source_state_route(a,route.points.len())?;source_state_route(b,route.points.len())?;}}
    for p in &route.points{if let Some(index)=p.source_index{let source=old.points.get(usize::from(index)).ok_or_else(||crate::SparkError::Invalid("Patrol source index changed".into()))?;if p.animation!=source.animation||p.sequence_id!=source.sequence_id{return invalid("Existing patrol animation and sequence references must be preserved");}}else if p.animation!=-1||p.sequence_id!=0{return invalid("New patrol points require no animation and default sequence0");}}
    // Remove unused rows first so intermediate arrays never exceed the final bound.
    let mut order=(0..old.points.len()).map(|i|Some(i as u16)).collect::<Vec<_>>();
    for i in (0..order.len()).rev(){if !route.points.iter().any(|p|p.source_index==order[i]){args.extend(["-E".into(),format!("{prefix}[{i}]")]);order.remove(i);}}
    for(i,p)in route.points.iter().enumerate(){
        if let Some(source)=p.source_index{let from=order.iter().enumerate().skip(i).find_map(|(j,v)|(*v==Some(source)).then_some(j));if let Some(from)=from{if from!=i{args.extend(["-M".into(),format!("{prefix}[{from}]"),i.to_string()]);order.swap(from,i);}}else{let from=order.iter().position(|v|*v==Some(source)).ok_or_else(||crate::SparkError::Invalid("Patrol copy source unavailable".into()))?;args.extend(["-c".into(),format!("{prefix}[{from}]"),i.to_string()]);order.insert(i,Some(source));}}
        else{args.extend(["-I".into(),prefix.clone(),"1".into(),i.to_string()]);order.insert(i,None);}
    }
    for(i,p)in route.points.iter().enumerate(){
        let old=p.source_index.and_then(|i|old.points.get(usize::from(i)));let key=format!("{prefix}[{i}]");
        let mut set=|field:&str,value:String|args.extend(["-S".into(),format!("{key}.{field}"),value]);
        if old.is_none_or(|o|!positions_close(o.position,p.position)){set("position",p.position.map(|v|v.to_string()).join(","));}
        if old.is_none_or(|o|!facings_close(o.facing_radians,p.facing_radians)){set("facing",p.facing_radians.to_string());}
        if old.is_none_or(|o|o.weight!=p.weight){set("weight",p.weight.to_string());}
        if old.is_none_or(|o|o.wait_seconds!=p.wait_seconds){set("time",p.wait_seconds.map(|v|v.to_string()).join(","));}
        if old.is_none(){set("animation","-1".into());set("sequence_id","0".into());}
    }Ok(args)
}
fn patrol_scalar_fields(encounter:u16,squad:u16,route:&ScenarioPatrolRoute)->Vec<(String,String)>{
    let mut result=vec![];for(i,p)in route.points.iter().enumerate(){let prefix=format!("encounters[{encounter}].squads[{squad}].move_positions[{i}]");for(key,value)in[("position",p.position.map(|v|v.to_string()).join(",")),("facing",p.facing_radians.to_string()),("weight",p.weight.to_string()),("time",p.wait_seconds.map(|v|v.to_string()).join(",")),("animation",p.animation.to_string()),("sequence_id",p.sequence_id.to_string())]{result.push((format!("{prefix}.{key}"),value));}}result
}
fn reviewed_patrol(before:&str,after:&str,op:&Operation)->Result<Vec<FieldDifference>>{
    let Operation::EncounterSquadPatrol{encounter,squad,squad_name,route,..}=op else{return invalid("Not a patrol edit");};
    let find=|text:&str|->Result<ScenarioPatrolRoute>{scenario_combat_choices(text)?.into_iter().find(|r|r.encounter==*encounter&&Some(r.name.as_str())==op.combat_encounter_name()).and_then(|r|r.squads.into_iter().find(|r|r.index==*squad&&r.name==*squad_name)).and_then(|s|s.patrol).ok_or_else(||crate::SparkError::Invalid("Native patrol source unavailable".into()))};
    let old=find(before)?;let new=find(after)?;let outside=|text:&str,r:&ScenarioPatrolRoute|text.lines().enumerate().filter(|(i,_)|*i<r.start||*i>=r.end).map(|(_,line)|line).collect::<Vec<_>>().join("\n");
    if outside(before,&old)!=outside(after,&new)||new.points.len()!=route.points.len(){return invalid("Patrol edit changed unrelated source or requested point count");}
    let allowed=["position","facing","weight","time"];for(p,n)in route.points.iter().zip(&new.points){if !patrol_point_close(p,n){return invalid("Patrol fields differ from reviewed request");}
        let fields=|p:&ScenarioPatrolPoint|p.fields.iter().filter(|line|!allowed.iter().any(|field|line.starts_with(&format!("{field} (")))).cloned().collect::<Vec<_>>();
        if let Some(i)=p.source_index{if fields(old.points.get(usize::from(i)).ok_or_else(||crate::SparkError::Invalid("Patrol source index unavailable".into()))?)!=fields(n){return invalid("Patrol edit changed preserved native metadata");}}
        else if n.fields.len()!=6||n.animation!=-1||n.sequence_id!=0{return invalid("Unexpected new native patrol fields");}
    }
    if before==after{return invalid("Patrol already matches; no changed source");}
    Ok(vec![FieldDifference{before:format!("{} native patrol points; existing animation/sequence references preserved",old.points.len()),after:format!("{} reviewed native patrol points; exact XYZ/facing/weight/waits verified",new.points.len())}])
}
pub const NATIVE_SOURCE_STATES:[&str;12]=["none","sleeping","alert","moving_repeat_same_position","moving_loop","moving_loop_back_and_forth","moving_loop_randomly","moving_randomly","guarding","guarding_at_guard_position","searching","fleeing"];
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ScenarioStartBehavior {pub index:u16,pub initial_state:String,pub return_state:String,#[serde(skip)] state_lines:Vec<Vec<usize>>}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ScenarioSquadBehavior {#[serde(default,skip_serializing_if="Option::is_none")] pub major_upgrade:Option<String>,#[serde(skip)] major_upgrade_lines:Vec<usize>,#[serde(default,skip_serializing_if="Option::is_none")] pub automatic_migration:Option<bool>,#[serde(skip)] migration_line:Option<usize>,pub initial_state:String,pub return_state:String,pub starts:Vec<ScenarioStartBehavior>,pub patrol_count:usize,#[serde(skip)] state_lines:Vec<Vec<usize>>}
const NATIVE_MAJOR_UPGRADES:[&str;5]=["normal","few","many","none","all"];
fn major_upgrade_index(value: &str) -> Result<u16> {
    NATIVE_MAJOR_UPGRADES.iter().position(|choice| *choice == value).map(|index| index as u16)
        .ok_or_else(|| crate::SparkError::Invalid("Unknown native major-variant upgrade policy".into()))
}
fn source_state(value:&str)->Result<u16>{NATIVE_SOURCE_STATES.iter().position(|v|*v==value).map(|i|i as u16).ok_or_else(||crate::SparkError::Invalid("Unknown native AI state".into()))}
fn source_state_route(value:&str,count:usize)->Result<()>{let state=source_state(value)?;let needed=match state{4..=6=>2,3|7=>1,_=>0};if count<needed{return invalid(format!("Native {value} requires at least{needed}authored patrol positions. Preserve/edit the route through its native source workflow first"));}Ok(())}
impl ScenarioSquadBehavior{
    fn validate(&self)->Result<()>{if self.major_upgrade.as_ref().is_some_and(|value|!NATIVE_MAJOR_UPGRADES.contains(&value.as_str())){return invalid("Unknown native major-variant upgrade policy");}if self.starts.len()>4096||self.patrol_count>32{return invalid("Native behavior inventory exceeds its source bounds");}source_state(&self.initial_state)?;source_state(&self.return_state)?;for(i,p)in self.starts.iter().enumerate(){if usize::from(p.index)!=i{return invalid("Native behavior must preserve every starting-location index");}source_state(&p.initial_state)?;source_state(&p.return_state)?;}Ok(())}
    fn states(&self)->impl Iterator<Item=(&str,&str)> {std::iter::once((self.initial_state.as_str(),self.return_state.as_str())).chain(self.starts.iter().map(|p|(p.initial_state.as_str(),p.return_state.as_str())))}
}
fn native_state_field(fields:&str,name:&str,offset:usize)->Result<(String,Vec<usize>)>{native_enum_field(fields,name,offset,&NATIVE_SOURCE_STATES)}
fn native_enum_field(fields:&str,name:&str,offset:usize,choices:&[&str])->Result<(String,Vec<usize>)>{let(_,children)=native_children(fields,name,"enum",choices.len())?;let mut chosen=None;let mut lines=vec![];for(i,(line,text))in children.iter().enumerate(){let parts=text.split_whitespace().collect::<Vec<_>>();let state=choices[i];if parts!=[state,"enum","value"]&&parts!=[state,"(*)","enum","value"]{return invalid("Native behavior enum formatting/choices are unsupported");}if parts.len()==4&&chosen.replace(state.to_string()).is_some(){return invalid("Native behavior has ambiguous selected state");}lines.push(offset+line);}Ok((chosen.ok_or_else(||crate::SparkError::Invalid("Native behavior state unavailable".into()))?,lines))}
fn native_squad_behavior(fields:&str,offset:usize)->Result<ScenarioSquadBehavior>{let(initial_state,initial)=native_state_field(fields,"initial_state",offset)?;let(return_state,return_lines)=native_state_field(fields,"return_state",offset)?;let patrol_count=array_listing(fields,"move_positions")?.count;if patrol_count>32{return invalid("Native patrol exceeds32positions");}let locations=array_listing(fields,"starting_locations")?;let mut start_line=offset+locations.start+1;let mut starts=vec![];for(i,item)in array_items(&locations,"starting_locations")?.iter().enumerate(){let fields=direct_struct_fields(item)?;let(initial_state,a)=native_state_field(&fields,"initial_state",start_line+1)?;let(return_state,b)=native_state_field(&fields,"return_state",start_line+1)?;starts.push(ScenarioStartBehavior{index:i as u16,initial_state,return_state,state_lines:vec![a,b]});start_line+=item.len();}let(automatic_migration,migration_line)=native_squad_migration(fields,offset)?;let(major_upgrade,major_upgrade_lines)=if fields.lines().any(|line|line.split_whitespace().eq(["major_upgrade","enum"])){let(value,lines)=native_enum_field(fields,"major_upgrade",offset,&NATIVE_MAJOR_UPGRADES)?;(Some(value),lines)}else{(None,vec![])};Ok(ScenarioSquadBehavior{major_upgrade,major_upgrade_lines,automatic_migration,migration_line,initial_state,return_state,starts,patrol_count,state_lines:vec![initial,return_lines]})}
fn native_squad_migration(fields:&str,offset:usize)->Result<(Option<bool>,Option<usize>)>{
    if !fields.lines().any(|line|line.split_whitespace().eq(["flags","bitmask"])){return Ok((None,None));}
    let(_,children)=native_children(fields,"flags","bitmask",6)?;
    let names=["unused","never_search","start_timer_immediately","no_timer_delay_forever","magic_sight_after_timer","automatic_migration"];
    for((_,text),name)in children.iter().zip(names){let parts=text.split_whitespace().collect::<Vec<_>>();if parts.len()!=3||parts[0]!=name||!matches!(parts[1],"(0)"|"(1)")||parts[2]!="bitfield"{return invalid("Native squad flag inventory differs; no migration default assumed");}}
    Ok((Some(children[5].1.split_whitespace().nth(1)==Some("(1)")),Some(offset+children[5].0)))
}
const TACTICAL_FIELDS:[&str;6]=["attacking","attacking_search","attacking_guard","defending","defending_search","defending_guard"];
fn native_children(fields:&str,name:&str,kind:&str,count:usize)->Result<(usize,Vec<(usize,String)>)>{
    let lines=fields.lines().collect::<Vec<_>>();let matches=lines.iter().enumerate().filter(|(_,line)|!line.starts_with(char::is_whitespace)&&line.split_whitespace().eq([name,kind])).collect::<Vec<_>>();
    if matches.len()!=1{return invalid(format!("Native {name} {kind} is unavailable or ambiguous"));}let start=matches[0].0;let end=(start+1..lines.len()).find(|i|!lines[*i].starts_with(' ')).unwrap_or(lines.len());
    let mut children=vec![];for i in start+1..end{let text=lines[i].strip_prefix("    ").or_else(||lines[i].strip_prefix(" ├──")).or_else(||lines[i].strip_prefix(" └──")).filter(|s|!s.starts_with(char::is_whitespace)).ok_or_else(||crate::SparkError::Invalid("Unknown native scalar children".into()))?;children.push((i,text.into()));}if children.len()!=count{return invalid(format!("Native {name} requires its exact {count}-choice inventory"));}Ok((start,children))
}
/// Read the installed native tool's field tree. No second tag-byte parser.
pub fn scenario_combat_choices(fields:&str)->Result<Vec<ScenarioCombatChoice>>{
    let encounters=array_listing(fields,"encounters")?;if encounters.count>128{return invalid("Native combat inventory exceeds128encounters");}let mut result=vec![];let mut encounter_line=encounters.start+1;let mut total_points=0;let mut total_squads=0;
    for(e,item)in array_items(&encounters,"encounters")?.iter().enumerate(){let root=direct_struct_fields(item)?;let firing=array_listing(&root,"firing_positions")?;total_points+=firing.count;if firing.count>512||total_points>4096{return invalid("Native firing inventory exceeds its bounded source capacity");}let mut points=vec![];let mut point_line=encounter_line+1+firing.start+1;
        for(i,item)in array_items(&firing,"firing_positions")?.iter().enumerate(){let fields=direct_struct_fields(item)?;let(position,line)=native_position(&fields)?;let(_,children)=native_children(&fields,"group_index","enum",26)?;let mut selected=None;let mut group_lines=vec![];for(bit,(line,text))in children.iter().enumerate(){let g=char::from(b'a'+bit as u8).to_string();let tokens=text.split_whitespace().collect::<Vec<_>>();if tokens!=[g.as_str(),"enum","value"]&&tokens!=[g.as_str(),"(*)","enum","value"]{return invalid("Unknown native firing-group enum");}if tokens.len()==4{if selected.replace(g).is_some(){return invalid("Ambiguous native firing group");}}group_lines.push(point_line+1+line);}points.push(ScenarioFiringChoice{index:i as u16,position,group:selected.ok_or_else(||crate::SparkError::Invalid("Native firing group is unavailable".into()))?,position_line:point_line+1+line,group_lines});point_line+=item.len();}
        let members=array_listing(&root,"squads")?;let mut squad_line=encounter_line+1+members.start+1;let mut squads=vec![];total_squads+=members.count;if total_squads>4096{return invalid("Native combat review exceeds4096squads");}
        for(i,item)in array_items(&members,"squads")?.iter().enumerate(){let fields=direct_struct_fields(item)?;let mut selections=vec![];let mut group_lines=vec![];for field in TACTICAL_FIELDS{let(_,children)=native_children(&fields,field,"bitmask",26)?;let mut values=vec![];let mut lines=vec![];for(bit,(line,text))in children.iter().enumerate(){let g=char::from(b'a'+bit as u8).to_string();let tokens=text.split_whitespace().collect::<Vec<_>>();if tokens.len()!=3||tokens[0]!=g||!matches!(tokens[1],"(0)"|"(1)")||tokens[2]!="bitfield"{return invalid("Unknown native tactical group field");}if tokens[1]=="(1)"{values.push(g);}lines.push(squad_line+1+line);}selections.push(values);group_lines.push(lines);}let mut values=selections.into_iter();let groups=FiringGroups{attacking:values.next().unwrap(),attacking_search:values.next().unwrap(),attacking_guard:values.next().unwrap(),defending:values.next().unwrap(),defending_search:values.next().unwrap(),defending_guard:values.next().unwrap()};let(behavior,behavior_issue)=match native_squad_behavior(&fields,squad_line+1){Ok(value)=>(Some(value),None),Err(issue)=>(None,Some(issue.to_string()))};let(patrol,patrol_issue)=match native_patrol(&fields,squad_line+1){Ok(value)=>(Some(value),None),Err(issue)=>(None,Some(issue.to_string()))};squads.push(ScenarioFiringSquadChoice{patrol,patrol_issue,index:i as u16,name:native_name(&fields)?,groups,group_lines,behavior,behavior_issue});squad_line+=item.len();}
        result.push(ScenarioCombatChoice{encounter:e as u16,name:native_name(&root)?,points,squads});encounter_line+=item.len();
    }Ok(result)
}
fn current_player_start(point: &ScenarioStartChoice, source_sha: &str) -> Result<Operation> {
    Ok(Operation::PlayerStartPosition {
        index: point.index, copy_from: None, position: point.position,
        facing_radians: point.facing_radians.ok_or_else(|| crate::SparkError::Invalid("Native player facing unavailable".into()))?,
        source_sha256: source_sha.into(),
    })
}

/// Refresh selected readback targets from current source after Accept or Restore.
/// Historical receipts select scope only; their old values are never replayed.
pub fn current_combat_targets(fields:&str,source_sha:&str,targets:&[Operation])->Result<Vec<Operation>>{
    // History retains previews after Restore. For a structural edit, read the
    // entire current array so undone copies never become stale readback targets.
    if targets.iter().any(|op| matches!(op, Operation::PlayerStartPosition{copy_from:Some(_),..})) {
        let remaining = targets.iter().filter(|op| !op.is_player_start_edit()).cloned().collect::<Vec<_>>();
        let mut result = current_combat_targets(fields, source_sha, &remaining)?;
        for point in scenario_player_start_choices(fields)? {
            result.push(current_player_start(&point, source_sha)?);
        }
        return Ok(result);
    }

    if targets.is_empty(){return Ok(vec![]);}let rows=if targets.iter().any(|op|!op.is_player_start_edit()){scenario_combat_choices(fields)?}else{vec![]};let mut result=vec![];let mut seen=std::collections::BTreeSet::new();for old in targets{let key=old.combat_target_key().ok_or_else(||crate::SparkError::Invalid("Unknown combat readback target".into()))?;if !seen.insert(key){continue;}if let Operation::PlayerStartPosition{index,..}=old{let p=scenario_player_start_choices(fields)?.into_iter().find(|p|p.index==*index).ok_or_else(||crate::SparkError::Invalid("Selected player start no longer exists".into()))?;result.push(current_player_start(&p,source_sha)?);continue;}let row=rows.iter().find(|r|r.encounter==key.1).ok_or_else(||crate::SparkError::Invalid("Combat source encounter is unavailable".into()))?;if Some(row.name.as_str())!=old.combat_encounter_name(){return invalid("Combat source encounter identity changed");}let op=match old{Operation::EncounterSquadPatrol{squad,squad_name,..}=>{let member=row.squads.iter().find(|r|r.index==*squad&&r.name==*squad_name).ok_or_else(||crate::SparkError::Invalid("Native patrol squad identity changed".into()))?;let route=member.patrol.clone().ok_or_else(||crate::SparkError::Invalid(member.patrol_issue.clone().unwrap_or_else(||"Native patrol unavailable".into())))?;Operation::EncounterSquadPatrol{encounter:row.encounter,squad:*squad,encounter_name:row.name.clone(),squad_name:member.name.clone(),route,source_sha256:source_sha.into()}},Operation::EncounterFiringPosition{point,..}=>{let p=row.points.iter().find(|p|p.index==*point).ok_or_else(||crate::SparkError::Invalid("Combat source firing point is unavailable".into()))?;Operation::EncounterFiringPosition{encounter:row.encounter,point:*point,encounter_name:row.name.clone(),position:p.position,group:p.group.clone(),source_sha256:source_sha.into()}},Operation::EncounterSquadBehavior{squad,squad_name,..}=>{let member=row.squads.iter().find(|r|r.index==*squad).filter(|m|m.name==*squad_name).ok_or_else(||crate::SparkError::Invalid("Native behavior squad identity changed".into()))?;let behavior=member.behavior.clone().ok_or_else(||crate::SparkError::Invalid(member.behavior_issue.clone().unwrap_or_else(||"Native behavior unavailable".into())))?;Operation::EncounterSquadBehavior{encounter:row.encounter,squad:*squad,encounter_name:row.name.clone(),squad_name:member.name.clone(),behavior,source_sha256:source_sha.into()}},Operation::EncounterSquadFiringGroups{squad,squad_name,..}=>{let member=row.squads.iter().find(|r|r.index==*squad).filter(|m|m.name==*squad_name).ok_or_else(||crate::SparkError::Invalid("Combat source squad identity changed".into()))?;Operation::EncounterSquadFiringGroups{encounter:row.encounter,squad:*squad,encounter_name:row.name.clone(),squad_name:member.name.clone(),groups:member.groups.clone(),source_sha256:source_sha.into()}},_=>unreachable!()};result.push(op);}Ok(result)
}
fn combat_arguments(op:&Operation,tags:&Path,tag:&str,before:&str)->Result<Vec<String>>{
    if let Operation::PlayerStartPosition {index, copy_from: Some(source), position, facing_radians, ..} = op {
        check_player_start_copy(before, *index, *source, *position)?;
        let array = "player_starting_locations";
        return Ok(vec![
            "-t".into(), tags.to_string_lossy().into_owned(),
            "-c".into(), format!("{array}[{source}]"), "end".into(),
            "-S".into(), format!("{array}[{index}].position"), position.map(|value| value.to_string()).join(","),
            "-S".into(), format!("{array}[{index}].facing"), facing_radians.to_string(),
            tag.into(),
        ]);
    }
    let current=current_combat_targets(before,"",std::slice::from_ref(op))?.remove(0);let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned()];match(op,&current){
        (Operation::PlayerStartPosition{index,position,facing_radians,..},Operation::PlayerStartPosition{position:old,facing_radians:old_facing,..})=>{let prefix=format!("player_starting_locations[{index}]");if !positions_close(*position,*old){args.extend(["-S".into(),format!("{prefix}.position"),position.map(|v|v.to_string()).join(",")]);}if !facings_close(*facing_radians,*old_facing){args.extend(["-S".into(),format!("{prefix}.facing"),facing_radians.to_string()]);}},
        (Operation::EncounterSquadPatrol{encounter,squad,route,..},Operation::EncounterSquadPatrol{route:old,..})=>{let rows=scenario_combat_choices(before)?;let behavior=rows.iter().find(|r|r.encounter==*encounter).and_then(|r|r.squads.iter().find(|r|r.index==*squad)).and_then(|s|s.behavior.as_ref());args.extend(patrol_arguments(*encounter,*squad,route,old,behavior)?);},
        (Operation::EncounterSquadBehavior{encounter,squad,behavior,..},Operation::EncounterSquadBehavior{behavior:old,..})=>{if behavior.starts.len()!=old.starts.len()||behavior.patrol_count!=old.patrol_count{return invalid("Native behavior cannot alter source start indices or patrol inventory");}let prefix=format!("encounters[{encounter}].squads[{squad}]");if let Some(value)=behavior.automatic_migration{let previous=old.automatic_migration.ok_or_else(||crate::SparkError::Invalid("Native automatic migration is unavailable; refresh supported source".into()))?;if value!=previous{args.extend(["-S".into(),format!("{prefix}.flags.automatic_migration"),if value{"1"}else{"0"}.into()]);}}if let Some(value)=&behavior.major_upgrade{let previous=old.major_upgrade.as_ref().ok_or_else(||crate::SparkError::Invalid("Native upgrade policy unavailable; refresh source".into()))?;if value!=previous{args.extend(["-S".into(),format!("{prefix}.major_upgrade"),value.clone()]);}}for(i,((a,b),(x,y)))in behavior.states().zip(old.states()).enumerate(){let target=if i==0{prefix.clone()}else{format!("{prefix}.starting_locations[{}]",i-1)};for(field,value,original)in[("initial_state",a,x),("return_state",b,y)]{if value!=original{source_state_route(value,behavior.patrol_count)?;args.extend(["-S".into(),format!("{target}.{field}"),value.into()]);}}}},
        (Operation::EncounterFiringPosition{encounter,point,position,group,..},Operation::EncounterFiringPosition{position:old,group:old_group,..})=>{let p=format!("encounters[{encounter}].firing_positions[{point}]");if !positions_close(*position,*old){args.extend(["-S".into(),format!("{p}.position"),position.map(|v|v.to_string()).join(",")]);}if group!=old_group{args.extend(["-S".into(),format!("{p}.group_index"),group.clone()]);}},
        (Operation::EncounterSquadFiringGroups{encounter,squad,groups,..},Operation::EncounterSquadFiringGroups{groups:old,..})=>{let expected=groups.masks()?;let prior=old.masks()?;for(i,field)in TACTICAL_FIELDS.iter().enumerate(){for bit in 0..26{let mask=1u32<<bit;if expected[i]&mask!=prior[i]&mask{args.extend(["-S".into(),format!("encounters[{encounter}].squads[{squad}].{field}.{}",char::from(b'a'+bit)),if expected[i]&mask!=0{"1"}else{"0"}.into()]);}}}},_=>return invalid("Unknown combat native operation")}
    if args.len()==2{return invalid("Native firing/tactical source already matches; no candidate was written");}args.push(tag.into());Ok(args)
}
fn verify_native_combat(op:&Operation,map:&crate::maps::MapInspection)->Result<()>{
    op.validate("scnr","readback.scenario")?;
    if let Operation::PlayerStartPosition{index,position,facing_radians,..}=op{let p=map.objects.iter().find(|p|p.id==format!("spawn-{index}")&&p.kind=="Player spawn").ok_or_else(||crate::SparkError::Invalid("Compiled native player start is unavailable".into()))?;if !positions_close(*position,p.position)||!facings_close(*facing_radians,p.rotation[0]){return invalid("Compiled native player position/facing differs from reviewed source");}return Ok(());}
    let(_,e,index)=op.combat_target_key().ok_or_else(||crate::SparkError::Invalid("Not a native combat edit".into()))?;let region=map.encounters.get(usize::from(e)).filter(|r|Some(r.name.as_str())==op.combat_encounter_name()).ok_or_else(||crate::SparkError::Invalid("Compiled combat encounter identity differs from source".into()))?;let details=region.details.as_ref().ok_or_else(||crate::SparkError::Invalid("Compiled combat telemetry unavailable".into()))?;match op{
        Operation::EncounterSquadPatrol{squad_name,route,..}=>{let native=details.squads.get(usize::from(index)).filter(|s|s.name==*squad_name).and_then(|s|s.move_positions.as_ref()).ok_or_else(||crate::SparkError::Invalid("Compiled patrol unavailable".into()))?;if native.len()!=route.points.len(){return invalid("Compiled patrol count differs from source");}for(p,n)in route.points.iter().zip(native){let value=ScenarioPatrolPoint{source_index:None,position:n.position,facing_radians:n.facing,weight:n.weight,wait_seconds:n.wait_seconds,animation:n.animation,sequence_id:n.sequence_id,fields:vec![]};if !patrol_point_close(p,&value){return invalid("Compiled patrol fields differ from source");}}},
        Operation::EncounterFiringPosition{position,group,..}=>{let p=details.firing_positions.get(usize::from(index)).ok_or_else(||crate::SparkError::Invalid("Compiled firing position unavailable".into()))?;if !positions_close(*position,p.position)||p.group_index!=u16::from(group.as_bytes()[0]-b'a'){return invalid("Compiled firing position/group differs from reviewed native source");}},
        Operation::EncounterSquadBehavior{squad_name,behavior,..}=>{let member=details.squads.get(usize::from(index)).filter(|s|s.name==*squad_name).ok_or_else(||crate::SparkError::Invalid("Compiled behavior squad identity differs".into()))?;if member.initial_state!=source_state(&behavior.initial_state)?||member.return_state!=source_state(&behavior.return_state)?||member.starting_locations.len()!=behavior.starts.len(){return invalid("Compiled squad behavior/start inventory differs from source");}if let Some(expected)=&behavior.major_upgrade{let index = major_upgrade_index(expected)?;if member.major_upgrade!=Some(index){return invalid("Compiled native major-variant upgrade policy differs");}}if behavior.automatic_migration.is_some_and(|expected|member.automatic_migration!=Some(expected)){return invalid("Compiled squad automatic migration differs from reviewed source");}let route=member.move_positions.as_ref().ok_or_else(||crate::SparkError::Invalid("Compiled patrol count unavailable".into()))?;if route.len()!=behavior.patrol_count{return invalid("Compiled patrol inventory differs from source");}for(p,n)in behavior.starts.iter().zip(&member.starting_locations){if n.initial_state!=source_state(&p.initial_state)?||n.return_state!=source_state(&p.return_state)?{return invalid("Compiled starting-location behavior differs from source");}}},
        Operation::EncounterSquadFiringGroups{squad_name,groups,..}=>{let squad=details.squads.get(usize::from(index)).filter(|s|s.name==*squad_name).ok_or_else(||crate::SparkError::Invalid("Compiled tactical squad identity differs".into()))?;let g=squad.firing_groups.as_ref().ok_or_else(||crate::SparkError::Invalid("Compiled tactical telemetry unavailable".into()))?;let actual=[g.attacking,g.attacking_search,g.attacking_guard,g.defending,g.defending_search,g.defending_guard];if groups.masks()?!=actual{return invalid(format!("Compiled tactical masks differ from reviewed native source: actual{actual:?}. Review target compiler search-group requirements; output was not accepted"));}},_=>return invalid("Not a native combat edit")};Ok(())
}
fn reviewed_combat(before:&str,after:&str,op:&Operation)->Result<Vec<FieldDifference>>{
    if op.is_player_start_edit(){return reviewed_player_start(before,after,op);}
    if matches!(op,Operation::EncounterSquadPatrol{..}){return reviewed_patrol(before,after,op);}
    op.validate("scnr","readback.scenario")?;
    let(_,e,index)=op.combat_target_key().ok_or_else(||crate::SparkError::Invalid("Not a native combat edit".into()))?;let old=scenario_combat_choices(before)?;let new=scenario_combat_choices(after)?;let a=old.iter().find(|r|r.encounter==e).ok_or_else(||crate::SparkError::Invalid("Original combat encounter unavailable".into()))?;let b=new.iter().find(|r|r.encounter==e).filter(|r|Some(r.name.as_str())==op.combat_encounter_name()&&r.name==a.name).ok_or_else(||crate::SparkError::Invalid("Revised combat encounter identity changed".into()))?;let mut allowed=std::collections::BTreeSet::new();match op{
        Operation::EncounterFiringPosition{position,group,..}=>{let old=a.points.get(usize::from(index)).ok_or_else(||crate::SparkError::Invalid("Original firing point unavailable".into()))?;let new=b.points.get(usize::from(index)).ok_or_else(||crate::SparkError::Invalid("Revised firing point unavailable".into()))?;if old.position_line!=new.position_line||old.group_lines!=new.group_lines||!positions_close(*position,new.position)||*group!=new.group{return invalid("Revised firing point/structure differs from request");}if !positions_close(old.position,*position){allowed.insert(old.position_line);}if old.group!=*group{allowed.insert(old.group_lines[usize::from(old.group.as_bytes()[0]-b'a')]);allowed.insert(old.group_lines[usize::from(group.as_bytes()[0]-b'a')]);}},
        Operation::EncounterSquadBehavior{squad_name,behavior,..}=>{
            let old=a.squads.get(usize::from(index)).filter(|s|s.name==*squad_name).and_then(|s|s.behavior.as_ref()).ok_or_else(||crate::SparkError::Invalid("Original native behavior unavailable".into()))?;
            let new=b.squads.get(usize::from(index)).filter(|s|s.name==*squad_name).and_then(|s|s.behavior.as_ref()).ok_or_else(||crate::SparkError::Invalid("Revised native behavior unavailable".into()))?;
            if old.starts.len()!=new.starts.len()||old.starts.len()!=behavior.starts.len()||old.patrol_count!=new.patrol_count||old.patrol_count!=behavior.patrol_count{return invalid("Behavior edit changed native start/route inventory");}
            let expected_major=behavior.major_upgrade.as_ref().or(old.major_upgrade.as_ref());if new.major_upgrade.as_ref()!=expected_major||new.major_upgrade_lines!=old.major_upgrade_lines{return invalid("Revised native upgrade policy differs from request");}if new.major_upgrade!=old.major_upgrade{for value in [old.major_upgrade.as_ref(),new.major_upgrade.as_ref()]{let index=NATIVE_MAJOR_UPGRADES.iter().position(|name|Some(*name)==value.map(String::as_str)).ok_or_else(||crate::SparkError::Invalid("Native upgrade enum unavailable".into()))?;allowed.insert(old.major_upgrade_lines[index]);}}
            let expected=behavior.automatic_migration.or(old.automatic_migration);if new.automatic_migration!=expected||old.migration_line!=new.migration_line{return invalid("Revised squad migration/flag structure differs from request");}if old.automatic_migration!=new.automatic_migration{allowed.insert(old.migration_line.ok_or_else(||crate::SparkError::Invalid("Native migration flag unavailable".into()))?);}
            let old_lines=std::iter::once(&old.state_lines).chain(old.starts.iter().map(|s|&s.state_lines));
            let new_lines=std::iter::once(&new.state_lines).chain(new.starts.iter().map(|s|&s.state_lines));
            for (((old_pair,new_pair),requested),(old_lines,new_lines)) in old.states().zip(new.states()).zip(behavior.states()).zip(old_lines.zip(new_lines)) {
                if new_pair!=requested||old_lines!=new_lines{return invalid("Revised behavior fields/structure differ from request");}
                for (field,(before,after)) in [(old_pair.0,new_pair.0),(old_pair.1,new_pair.1)].iter().enumerate(){
                    if before!=after {allowed.insert(old_lines[field][usize::from(source_state(before)?)]);allowed.insert(old_lines[field][usize::from(source_state(after)?)]);}
                }
            }
        },
        Operation::EncounterSquadFiringGroups{squad_name,groups,..}=>{let old=a.squads.get(usize::from(index)).ok_or_else(||crate::SparkError::Invalid("Original tactical squad unavailable".into()))?;let new=b.squads.get(usize::from(index)).ok_or_else(||crate::SparkError::Invalid("Revised tactical squad unavailable".into()))?;if old.name!=*squad_name||new.name!=*squad_name||old.group_lines!=new.group_lines||new.groups.masks()?!=groups.masks()?{return invalid("Revised tactical fields/structure differ from request");}let old_masks=old.groups.masks()?;let masks=groups.masks()?;for i in 0..6{for bit in 0..26{if old_masks[i]&(1u32<<bit)!=masks[i]&(1u32<<bit){allowed.insert(old.group_lines[i][bit]);}}}},_=>return invalid("Not a native combat edit")}
    let a=before.lines().collect::<Vec<_>>();let b=after.lines().collect::<Vec<_>>();if a.len()!=b.len(){return invalid("Combat edit changed native field structure");}let mut differences=vec![];for(i,(a,b))in a.iter().zip(&b).enumerate(){if a==b{continue;}if !allowed.remove(&i){return invalid("Combat edit changed an unrelated native field");}differences.push(FieldDifference{before:(*a).into(),after:(*b).into()});}if !allowed.is_empty()||differences.is_empty(){return invalid("Cannot certify exactly the requested native combat edit");}Ok(differences)
}
pub fn camera_points_close(a:&crate::maps::NativeCameraPoint,b:&crate::maps::NativeCameraPoint)->bool{
    a.index==b.index&&a.name==b.name&&positions_close(a.position,b.position)&&a.orientation_radians.iter().zip(b.orientation_radians).all(|(a,b)|facings_close(*a,b))&&(a.fov_radians-b.fov_radians).abs()<=0.000002
}
pub fn volume_geometry_close(a:&crate::maps::ScenarioLogicVolumeGeometry,b:&crate::maps::ScenarioLogicVolumeGeometry)->bool{[(a.forward,b.forward),(a.up,b.up),(a.corner,b.corner),(a.dimensions,b.dimensions)].into_iter().all(|(a,b)|positions_close(a,b))}
fn volume_values(g:&crate::maps::ScenarioLogicVolumeGeometry)->[(&'static str,[f32;3]);4]{[("rotation_vector_forward",g.forward),("rotation_vector_up",g.up),("starting_corner",g.corner),("ending_corner_offset",g.dimensions)]}
pub fn scenario_volume_choices(fields:&str)->Result<Vec<crate::maps::ScenarioLogicVolume>>{Ok(native_volume_fields(fields)?.into_iter().map(|r|r.0).collect())}
fn native_volume_fields(fields:&str)->Result<Vec<(crate::maps::ScenarioLogicVolume,[usize;4])>>{
    let array=array_listing(fields,"trigger_volumes")?;if array.count>1024{return invalid("Native trigger inventory exceeds1024entries");}let mut line=array.start+1;let mut rows=vec![];
    for item in array_items(&array,"trigger_volumes")?{let root=direct_struct_fields(&item)?;let(_,types)=native_children(&root,"type","enum",2)?;let mut chosen=None;for(i,(_,text))in types.iter().enumerate(){let label=["fixed","rotational"][i];let parts=text.split_whitespace().collect::<Vec<_>>();if parts!=[label,"enum","value"]&&parts!=[label,"(*)","enum","value"]{return invalid("Unsupported native volume enum choices");}if parts.len()==4&&chosen.replace(i as u16).is_some(){return invalid("Ambiguous native volume type");}}let kind=chosen.ok_or_else(||crate::SparkError::Invalid("Native volume type unavailable".into()))?;let mut lines=[usize::MAX;4];let geometry=if kind==1{let mut values=vec![];for(i,key)in ["rotation_vector_forward","rotation_vector_up","starting_corner","ending_corner_offset"].into_iter().enumerate(){let(v,offset)=native_vector(&root,key)?;values.push(v);lines[i]=line+1+offset;}let g=crate::maps::ScenarioLogicVolumeGeometry{forward:values[0],up:values[1],corner:values[2],dimensions:values[3]};if !g.valid(){return invalid("Native trigger box has invalid basis, coordinates or dimensions");}Some(g)}else{None};rows.push((crate::maps::ScenarioLogicVolume{name:native_name(&root)?,kind,geometry},lines));line+=item.len();}Ok(rows)
}
fn reviewed_volume(before:&str,after:&str,index:u16,name:&str,geometry:&crate::maps::ScenarioLogicVolumeGeometry)->Result<Vec<FieldDifference>>{
    let old=native_volume_fields(before)?;let new=native_volume_fields(after)?;if old.len()!=new.len(){return invalid("Trigger edit changed inventory");}let(a,lines)=old.get(usize::from(index)).ok_or_else(||crate::SparkError::Invalid("Trigger index missing".into()))?;let(b,new_lines)=&new[usize::from(index)];if a.name!=name||b.name!=name||a.kind!=1||b.kind!=1||lines!=new_lines||b.geometry.as_ref().is_none_or(|g|!volume_geometry_close(g,geometry)){return invalid("Trigger edit changed identity or differs from proposed geometry");}
    let a=before.lines().collect::<Vec<_>>();let b=after.lines().collect::<Vec<_>>();if a.len()!=b.len(){return invalid("Trigger edit changed native field structure");}let mut differences=vec![];for(i,(a,b))in a.iter().zip(&b).enumerate(){if a!=b{if !lines.contains(&i){return invalid("Trigger edit changed unrelated fields or script references");}differences.push(FieldDifference{before:(*a).into(),after:(*b).into()});}}if differences.is_empty(){return invalid("Trigger edit changed no fields");}Ok(differences)
}
pub fn scenario_trigger_volume_names(fields:&str)->Result<Vec<String>>{
    let volumes=array_listing(fields,"trigger_volumes")?;if volumes.count>1024{return invalid("Native trigger inventory exceeds1024entries");}array_items(&volumes,"trigger_volumes")?.iter().map(|item|native_name(&direct_struct_fields(item)?)).collect()
}
pub fn scenario_script_names(fields:&str)->Result<Vec<String>>{
    let scripts=array_listing(fields,"scripts")?;if scripts.count>1024{return invalid("Native script inventory exceeds1024entries");}array_items(&scripts,"scripts")?.iter().map(|item|native_name(&direct_struct_fields(item)?)).collect()
}
pub fn flag_points_close(a:&crate::maps::NativeCutsceneFlag,b:&crate::maps::NativeCutsceneFlag)->bool{a.index==b.index&&a.name==b.name&&positions_close(a.position,b.position)&&a.facing_radians.iter().zip(b.facing_radians).all(|(a,b)|facings_close(*a,b))}
pub fn scenario_flag_choices(fields:&str)->Result<Vec<crate::maps::NativeCutsceneFlag>>{Ok(native_flag_fields(fields)?.into_iter().map(|(p,_)|p).collect())}
fn native_flag_fields(fields:&str)->Result<Vec<(crate::maps::NativeCutsceneFlag,[usize;2])>>{
    let array=array_listing(fields,"cutscene_flags")?;if array.count>512{return invalid("Native flags exceed512");}let mut line=array.start+1;let mut flags=vec![];
    for(index,item)in array_items(&array,"cutscene_flags")?.iter().enumerate(){let root=direct_struct_fields(item)?;let(position,pos)=native_position(&root)?;
        let rows=root.lines().enumerate().filter_map(|(i,s)|s.strip_prefix("facing (").map(|s|(i,s))).collect::<Vec<_>>();if rows.len()!=1{return invalid("Native flag facing unavailable or ambiguous");}
        let(facing_line,tail)=rows[0];let(value,kind)=tail.split_once(')').ok_or_else(||crate::SparkError::Invalid("Invalid flag facing".into()))?;if !kind.trim().starts_with("euler2d"){return invalid("Unsupported flag facing");}
        let values=value.split(',').map(|v|v.trim().parse::<f32>()).collect::<std::result::Result<Vec<_>,_>>().map_err(|_|crate::SparkError::Invalid("Invalid flag facing".into()))?;if values.len()!=2||values.iter().any(|v|!v.is_finite()||v.abs()>1e6){return invalid("Invalid flag facing values");}
        flags.push((crate::maps::NativeCutsceneFlag{index:index as u16,name:native_name(&root)?,position,facing_radians:[values[0].to_radians(),values[1].to_radians()]},[line+1+pos,line+1+facing_line]));line+=item.len();
    }Ok(flags)
}
pub fn scenario_camera_choices(fields:&str)->Result<Vec<crate::maps::NativeCameraPoint>>{Ok(native_camera_fields(fields)?.into_iter().map(|(point,_)|point).collect())}
fn native_camera_fields(fields:&str)->Result<Vec<(crate::maps::NativeCameraPoint,[usize;3])>>{
    let array=array_listing(fields,"cutscene_camera_points")?;if array.count>512{return invalid("Native camera inventory exceeds512points");}let mut line=array.start+1;let mut points=vec![];
    for(index,item)in array_items(&array,"cutscene_camera_points")?.iter().enumerate(){let root=direct_struct_fields(item)?;let(position,pos)=native_position(&root)?;
        let rows=root.lines().enumerate().filter_map(|(i,s)|s.strip_prefix("orientation (").map(|s|(i,s))).collect::<Vec<_>>();if rows.len()!=1{return invalid("Native camera orientation unavailable or ambiguous");}
        let(orientation_line,tail)=rows[0];let(value,kind)=tail.split_once(')').ok_or_else(||crate::SparkError::Invalid("Invalid native camera orientation".into()))?;if !kind.trim().starts_with("euler3d"){return invalid("Unsupported native camera orientation type");}
        let angles=value.split(',').map(|v|v.trim().parse::<f32>()).collect::<std::result::Result<Vec<_>,_>>().map_err(|_|crate::SparkError::Invalid("Invalid camera angles".into()))?;if angles.len()!=3||angles.iter().any(|v|!v.is_finite()||v.abs()>1e6){return invalid("Invalid camera orientation values");}
        let fov=number(&root,"field_of_view")?;if !fov.is_finite()||fov.abs()>1e6{return invalid("Invalid native camera lens");}let fov_line=root.lines().position(|s|s.starts_with("field_of_view (")).ok_or_else(||crate::SparkError::Invalid("Camera FOV unavailable".into()))?;
        points.push((crate::maps::NativeCameraPoint{index:index as u16,name:native_name(&root)?,position,orientation_radians:[angles[0].to_radians(),angles[1].to_radians(),angles[2].to_radians()],fov_radians:fov.to_radians() as f32},[line+1+pos,line+1+orientation_line,line+1+fov_line]));line+=item.len();
    }Ok(points)
}
fn reviewed_camera(before:&str,after:&str,point:&crate::maps::NativeCameraPoint)->Result<Vec<FieldDifference>>{
    let a=native_camera_fields(before)?;let b=native_camera_fields(after)?;if a.len()!=b.len(){return invalid("Camera edit changed point inventory");}let(old,lines)=a.get(usize::from(point.index)).ok_or_else(||crate::SparkError::Invalid("Camera source missing".into()))?;let(new,new_lines)=&b[usize::from(point.index)];if old.name!=point.name||lines!=new_lines||!camera_points_close(new,point){return invalid("Camera review identity/pose differs");}
    let a=before.lines().collect::<Vec<_>>();let b=after.lines().collect::<Vec<_>>();if a.len()!=b.len(){return invalid("Camera edit changed source structure");}let mut changes=vec![];for(i,(a,b))in a.iter().zip(&b).enumerate(){if a==b{continue;}if !lines.contains(&i){return invalid("Camera edit changed unrelated source or references");}changes.push(FieldDifference{before:(*a).into(),after:(*b).into()});}if changes.is_empty(){return invalid("Camera edit changed no fields");}Ok(changes)
}
fn selected_native_start(fields:&str,encounter:u16,squad:u16,start:u16)->Result<(ScenarioSquadChoice,ScenarioStartChoice)> {
    let row=scenario_squad_start_choices(fields)?.into_iter().find(|row|row.encounter==encounter&&row.squad==squad)
        .ok_or_else(||crate::SparkError::Invalid("Native AI squad is unavailable".into()))?;
    let point=row.starts.as_ref().and_then(|points|points.get(usize::from(start))).cloned()
        .ok_or_else(||crate::SparkError::Invalid("Native AI starting location is unavailable".into()))?;
    Ok((row,point))
}
fn verify_native_start(map:&crate::maps::MapInspection,encounter:u16,squad:u16,start:u16,encounter_name:&str,squad_name:&str,position:[f32;3],facing_radians:Option<f32>,command_list:Option<i16>)->Result<()>{
    let region=map.encounters.get(usize::from(encounter)).ok_or_else(||crate::SparkError::Invalid("Compiled AI encounter is unavailable".into()))?;
    let member=region.details.as_ref().and_then(|details|details.squads.get(usize::from(squad)))
        .ok_or_else(||crate::SparkError::Invalid("Compiled AI squad is unavailable".into()))?;
    let point=member.starting_locations.get(usize::from(start)).ok_or_else(||crate::SparkError::Invalid("Compiled AI starting location is unavailable".into()))?;
    if region.name!=encounter_name||member.name!=squad_name||!positions_close(position,point.position)||facing_radians.is_some_and(|expected|!facings_close(expected,point.facing))||command_list.is_some_and(|expected|expected!=point.command_list){return invalid("Compiled AI starting position/identity differs from the reviewed edit");}
    Ok(())
}
fn reviewed_start_position(before:&str,after:&str,operation:&Operation)->Result<Vec<FieldDifference>>{
    let Operation::EncounterStartPosition{encounter,squad,start,encounter_name,squad_name,position,facing_radians,command_list,..}=operation else{return invalid("Not a native AI start edit");};
    let (old,original)=selected_native_start(before,*encounter,*squad,*start)?;let (new,revised)=selected_native_start(after,*encounter,*squad,*start)?;
    if old.encounter_name!=*encounter_name||new.encounter_name!=*encounter_name||old.name!=*squad_name||new.name!=*squad_name||
        original.position_line!=revised.position_line||original.facing_line!=revised.facing_line||original.command_line!=revised.command_line||!positions_close(revised.position,*position)||
        command_list.is_some_and(|expected|revised.command_list!=Some(expected))||facing_radians.is_some_and(|expected|revised.facing_radians.is_none_or(|actual|!facings_close(expected,actual))){return invalid("Native AI starting pose or structure differs from the reviewed edit");}
    let mut allowed=std::collections::BTreeSet::new();
    if !positions_close(original.position,*position){allowed.insert(original.position_line);}
    if let Some(expected)=facing_radians {
        let old=original.facing_radians.ok_or_else(||crate::SparkError::Invalid("Native facing was unavailable before review".into()))?;
        if !facings_close(old,*expected){allowed.insert(original.facing_line.ok_or_else(||crate::SparkError::Invalid("Native facing field is unavailable".into()))?);}
    }
    if let Some(expected)=command_list{let old=original.command_list.ok_or_else(||crate::SparkError::Invalid("Native command list was unavailable before review".into()))?;if old!=*expected{allowed.insert(original.command_line.ok_or_else(||crate::SparkError::Invalid("Native command-list field unavailable".into()))?);}}
    let a=before.lines().collect::<Vec<_>>();let b=after.lines().collect::<Vec<_>>();if a.len()!=b.len(){return invalid("AI start edit changed native field structure");}
    let mut differences=vec![];for(index,(old,new))in a.iter().zip(&b).enumerate(){
        if old==new{continue;}if !allowed.remove(&index){return invalid("AI start edit changed an unrelated native field");}
        differences.push(FieldDifference{before:(*old).into(),after:(*new).into()});
    }
    if !allowed.is_empty()||differences.is_empty(){return invalid("Native reader cannot certify exactly the requested AI starting pose");}Ok(differences)
}
fn reviewed_squad_counts(before:&str,after:&str,operation:&Operation)->Result<Vec<FieldDifference>> {
    let edits=operation.squad_count_edits()?;
    if edits.is_empty(){return invalid("Not a squad population revision");}
    let old=scenario_squad_choices(before)?;let new=scenario_squad_choices(after)?;
    let mut allowed=std::collections::BTreeSet::new();
    for edit in edits {
        let original=old.iter().find(|row|row.encounter==edit.encounter&&row.squad==edit.squad)
            .ok_or_else(||crate::SparkError::Invalid("Selected original native squad is unavailable".into()))?;
        let revised=new.iter().find(|row|row.encounter==edit.encounter&&row.squad==edit.squad)
            .ok_or_else(||crate::SparkError::Invalid("Selected revised native squad is unavailable".into()))?;
        if original.encounter_name!=edit.encounter_name||original.name!=edit.squad_name||
            original.normal_line!=revised.normal_line||original.insane_line!=revised.insane_line||
            revised.encounter_name!=edit.encounter_name||revised.name!=edit.squad_name||
            revised.normal_count!=edit.normal_count as i16||revised.insane_count!=edit.insane_count as i16{
            return invalid("Native squad structure, identity or saved counts differ from the reviewed edit");
        }
        allowed.extend([original.normal_line,original.insane_line]);
    }
    let a=before.lines().collect::<Vec<_>>();let b=after.lines().collect::<Vec<_>>();
    if a.len()!=b.len(){return invalid("Native squad edit changed field structure; no source was selected");}
    let mut differences=vec![];
    for (index,(old,new)) in a.iter().zip(&b).enumerate() {
        if old==new{continue;}
        if !allowed.contains(&index){return invalid("Native population edit changed an unrelated field; no source was selected");}
        differences.push(FieldDifference{before:(*old).into(),after:(*new).into()});
    }
    if differences.is_empty(){return invalid("No native squad count changed");}
    Ok(differences)
}
fn reviewed_hud_duplicate(before:&str,after:&str,operation:&Operation)->Result<Vec<FieldDifference>> {
    let Operation::HudDuplicate{array,index,..}=operation else{return invalid("Not a HUD duplication");};
    let old=before.replace("\r\n","\n");let new=after.replace("\r\n","\n");
    let original=array_listing(&old,array)?;let result=array_listing(&new,array)?;
    let old_items=array_items(&original,array)?;let new_items=array_items(&result,array)?;
    let copied=old_items.get(usize::from(*index)).ok_or_else(||crate::SparkError::Invalid("Selected native HUD element no longer exists".into()))?;
    if result.count!=original.count+1||!result.body.starts_with(&original.body) {
        return invalid("HUD duplication changed an original element or unexpected array count");
    }
    let appended=new_items.last().ok_or_else(||crate::SparkError::Invalid("Native HUD copy was not appended".into()))?;
    // Root indices necessarily differ. Every exposed descendant value, nested
    // array/enum/flag and dependency must remain exactly the selected element.
    if copied.len()<2||copied.get(1..)!=appended.get(1..) {return invalid("Native HUD duplicate differs from its selected source element");}
    let rest=|text:&str,list:&ArrayListing|text.lines().enumerate().filter(|(index,_)|*index<list.start||*index>=list.end).map(|(_,line)|line.to_string()).collect::<Vec<_>>();
    if rest(&old,&original)!=rest(&new,&result){return invalid("HUD duplication changed fields outside the selected native array");}
    Ok(vec![FieldDifference{before:format!("{array}[{}] · element {index} retained",original.count),
        after:format!("{array}[{}] · exact exposed copy appended at {}",result.count,original.count)}])
}


#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct PlayerProfileAppend {
    pub index:usize,pub name:String,pub profile:crate::firefight::NativePlayerProfile,pub reuse:bool,
    pub original_names:Vec<String>,pub source_fields_sha256:String,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub profile_fields_sha256:Option<String>,
}
fn profile_fields_hash(body:&[String])->Result<String>{Ok(crate::hex_bytes(Sha256::digest(serde_json::to_vec(body)?)))}
fn profile_names(items:&[&[String]])->Result<Vec<String>> {
    items.iter().map(|item|{
        let names=item.iter().filter_map(|line|line.strip_prefix("        name (")).filter_map(|tail|tail.rsplit_once(')').map(|pair|pair.0)).collect::<Vec<_>>();
        if names.len()!=1||names[0].len()>31{return invalid("Native player profile names are incomplete or unsupported");}
        Ok(names[0].to_string())
    }).collect()
}
/// Append only. Reusing a previous generated profile requires its exact field identity.
pub fn prepare_player_profile(fields:&str,profile:&crate::firefight::NativePlayerProfile,previous:Option<&PlayerProfileAppend>)->Result<PlayerProfileAppend> {
    let _=crate::firefight::native_player_profile_arguments(profile,0,"gs_ff_loadout")?;
    let array=array_listing(fields,"player_starting_profile")?;
    let items=array_items(&array,"player_starting_profile")?;
    if array.count>256{return invalid("Native starting-profile capacity exceeds the admitted scenario format");}
    let names=profile_names(&items)?;
    if let Some(old)=previous.filter(|old|old.profile==*profile) {
        let current=items.get(old.index).ok_or_else(||crate::SparkError::Invalid("Recorded player profile was removed; preserve/reconcile source first".into()))?;
        if names[old.index]!=old.name||old.profile_fields_sha256.as_deref()!=Some(profile_fields_hash(current)?.as_str()){
            return invalid("Recorded player loadout changed; automatic reuse was refused");
        }
        return Ok(PlayerProfileAppend{index:old.index,name:old.name.clone(),profile:profile.clone(),reuse:true,original_names:names,source_fields_sha256:profile_fields_hash(&array.body)?,profile_fields_sha256:old.profile_fields_sha256.clone()});
    }
    if array.count>=256{return invalid("Native scenario has no free player profile slot; original profiles were retained");}
    let name=format!("gs_ff_loadout_{}",array.count);
    if names.iter().any(|existing|existing.eq_ignore_ascii_case(&name)){return invalid("Generated player-profile name is already occupied; no profile was replaced");}
    let _=crate::firefight::native_player_profile_arguments(profile,array.count,&name)?;
    Ok(PlayerProfileAppend{index:array.count,name,profile:profile.clone(),reuse:false,original_names:names,source_fields_sha256:profile_fields_hash(&array.body)?,profile_fields_sha256:None})
}
pub fn review_player_profile(before:&str,after:&str,plan:&PlayerProfileAppend)->Result<PlayerProfileAppend> {
    let old=array_listing(before,"player_starting_profile")?;let new=array_listing(after,"player_starting_profile")?;
    if profile_fields_hash(&old.body)?!=plan.source_fields_sha256||new.count!=old.count+usize::from(!plan.reuse)||!new.body.starts_with(&old.body){
        return invalid("Native profile append changed existing indices/fields or unexpected counts");
    }
    let old_items=array_items(&old,"player_starting_profile")?;let items=array_items(&new,"player_starting_profile")?;
    let names=profile_names(&items)?;
    if profile_names(&old_items)?!=plan.original_names||names.get(plan.index)!=Some(&plan.name){return invalid("Native profile names differ from reviewed source");}
    let rest=|text:&str,array:&ArrayListing|text.lines().enumerate().filter(|(index,_)|*index<array.start||*index>=array.end).map(|(_,line)|line).collect::<Vec<_>>().join("\n");
    if rest(before,&old)!=rest(after,&new){return invalid("Player loadout append changed unrelated scenario fields");}
    let mut result=plan.clone();result.profile_fields_sha256=Some(profile_fields_hash(items[plan.index])?);Ok(result)
}
impl PlayerProfileAppend {
    pub fn verify_map(&self,map:&crate::maps::MapInspection)->Result<()> {
        let profiles=map.player_starting_profiles.as_ref().ok_or_else(||crate::SparkError::Invalid("Compiled player profiles are unreadable".into()))?;
        if profiles.len()!=self.original_names.len()+usize::from(!self.reuse)||
            profiles.iter().take(self.original_names.len()).zip(&self.original_names).any(|(profile,name)|profile.name!=*name){
            return invalid("Compiled loadout append lost/reordered original player profiles");
        }
        crate::firefight::verify_native_player_profile(&self.profile,&self.name,self.index,map)
    }
}

#[derive(Clone,Debug,Serialize,Deserialize,PartialEq,Eq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct HudSourceTarget {pub class:String,pub tag:String}
impl HudSourceTarget {
    pub fn validate(&self)->Result<()> {
        safe_relative(&self.tag)?;
        if crate::maps::hud_root_arrays(&self.class)?.is_empty()||self.tag.len()>240||self.tag.starts_with('-')||
            self.tag.bytes().any(|b|b"*?[]".contains(&b))||
            !self.tag.ends_with(&format!(".{}",crate::tag_exchange::extension(&self.class)?)) {
            return invalid("HUD readback needs an exact admitted native tag path/class, not a wildcard");
        }
        Ok(())
    }
}
#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct HudArrayReadback {pub name:String,pub elements:usize,pub exposed_rows:usize}
/// Compare current native source with a separately recovered compiled HUD tag.
/// Root scalars, opaque cells and target-game behavior are outside this contract.
pub fn compare_hud_arrays(class:&str,source:&str,compiled:&str)->Result<Vec<HudArrayReadback>> {
    let definitions=crate::maps::hud_root_arrays(class)?;
    if definitions.is_empty(){return invalid("This is not an admitted native HUD tag class");}
    let mut result=vec![];
    for definition in definitions {
        let before=array_listing(source,&definition.name)?;let after=array_listing(compiled,&definition.name)?;
        let _=array_items(&before,&definition.name)?;let _=array_items(&after,&definition.name)?;
        if before.count>definition.maximum||after.count!=before.count||after.body!=before.body {
            return invalid(format!("Compiled native HUD array differs from staged source: {}",definition.name));
        }
        result.push(HudArrayReadback{name:definition.name,elements:before.count,exposed_rows:before.body.len()});
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Requires the installed Invader editor and an owned disposable development workspace"]
    fn native_ai_start_coordinates_round_trip() {
        use std::{fs,process::Command};
        let executable=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_INVADER_EDIT").expect("Explicit installed Invader path required"));
        let generated=std::path::PathBuf::from(std::env::var_os("SPARK_GENERATED_ROOT").expect("Owned disposable output required"));
        let temporary=tempfile::tempdir_in(&generated).unwrap();
        let tags=temporary.path().join("tags");fs::create_dir_all(tags.join("levels/ai_fixture")).unwrap();
        let tag="levels/ai_fixture/ai_fixture.scenario";
        let run=|args:Vec<String>|{
            let result=Command::new(&executable).args(args).current_dir(temporary.path()).output().unwrap();
            assert!(result.status.success(),"Native fixture failed: {}",String::from_utf8_lossy(&result.stderr));
            String::from_utf8(result.stdout).unwrap()
        };
        // Native-tool-created fixture only. No map, SDK or actor dependency is copied or invented.
        let mut create=vec!["-t".into(),tags.to_string_lossy().into_owned(),"-N".into(),"-I".into(),"encounters".into(),"2".into(),"end".into()];
        for encounter in 0..2 {
            create.extend(["-S".into(),format!("encounters[{encounter}].name"),format!("original_{encounter}"),
                "-I".into(),format!("encounters[{encounter}].squads"),"2".into(),"end".into()]);
            for squad in 0..2 {
                let prefix=format!("encounters[{encounter}].squads[{squad}]");
                for (key,value) in [("name",format!("squad_{squad}")),("normal_diff_count","1".into()),("insane_diff_count","2".into())] {
                    create.extend(["-S".into(),format!("{prefix}.{key}"),value]);
                }
                create.extend(["-I".into(),format!("{prefix}.starting_locations"),"2".into(),"end".into()]);
                for start in 0..2 {
                    create.extend(["-S".into(),format!("{prefix}.starting_locations[{start}].position"),format!("{encounter},{squad},{start}")]);
                }
            }
        }
        create.extend(["-I".into(),"encounters[1].firing_positions".into(),"2".into(),"end".into(),"-S".into(),"encounters[1].firing_positions[1].group_index".into(),"z".into()]);
        create.extend(["-S".into(),"encounters[1].squads[1].starting_locations[1].facing".into(),std::f32::consts::FRAC_PI_4.to_string()]);
        create.push(tag.into());run(create);
        let fields=||run(vec!["-t".into(),tags.to_string_lossy().into_owned(),"-L".into(),tag.into()]);
        let before=fields();let file=tags.join(tag);let before_sha=crate::maps::hash_file(&file).unwrap();
        let inventory=scenario_squad_start_choices(&before).unwrap();assert_eq!(inventory.len(),4);
        assert!(inventory.iter().all(|row|row.starts.as_ref().unwrap().len()==2));
        let operation=Operation::EncounterStartPosition{encounter:1,squad:1,start:1,encounter_name:"original_1".into(),squad_name:"squad_1".into(),
            position:[20.25,-8.5,4.125],source_sha256:before_sha.clone(),facing_radians:None,command_list:None};
        run(operation.arguments_with_fields(&tags,"scnr",tag,&before).unwrap());
        let after=fields();assert_eq!(reviewed_difference(&before,&after,&operation).unwrap().len(),1);
        let readback=run(operation.readback_arguments(&tags,"scnr",tag,&before).unwrap().unwrap());
        assert_eq!(readback.trim().split(',').map(|value|value.trim().parse::<f32>().unwrap()).collect::<Vec<_>>(),[20.25,-8.5,4.125]);
        let after_sha=crate::maps::hash_file(&file).unwrap();assert_ne!(before_sha,after_sha);
        ScenarioSquadReadback{machine_settings:Default::default(),named_objects:None,cutscene_flags:None,extraction_squads:None,faction_kits:None,transports:None,command_lists:None,devices:None,device_groups:None,volumes:None,cameras:None,combat:vec![],source_sha256:after_sha.clone(),squads:scenario_squad_start_choices(&after).unwrap(),include_starts:true}.validate().unwrap();
        let restore=Operation::EncounterStartPosition{encounter:1,squad:1,start:1,encounter_name:"original_1".into(),squad_name:"squad_1".into(),
            position:[1.,1.,1.],source_sha256:after_sha.clone(),facing_radians:None,command_list:None};
        run(restore.arguments_with_fields(&tags,"scnr",tag,&after).unwrap());assert_eq!(before,fields());
        let pose=|position:[f32;3],facing:f32|Operation::EncounterStartPosition{encounter:1,squad:1,start:1,encounter_name:"original_1".into(),squad_name:"squad_1".into(),position,source_sha256:crate::maps::hash_file(&file).unwrap(),facing_radians:Some(facing),command_list:None};
        let rotation=pose([1.,1.,1.],-std::f32::consts::FRAC_PI_2);let args=rotation.arguments_with_fields(&tags,"scnr",tag,&before).unwrap();assert_eq!(args.iter().filter(|arg|arg.as_str()=="-S").count(),1);run(args);
        let rotated=fields();assert_eq!(reviewed_difference(&before,&rotated,&rotation).unwrap().len(),1);let native=run(rotation.readback_arguments(&tags,"scnr",tag,&before).unwrap().unwrap());rotation.verify_readback(&tags,"scnr",tag,&before,&native).unwrap();assert!(native.trim().parse::<f32>().unwrap()< -89.99);
        let combined=pose([2.,3.,4.],std::f32::consts::PI);run(combined.arguments_with_fields(&tags,"scnr",tag,&rotated).unwrap());let after_pose=fields();assert_eq!(reviewed_difference(&rotated,&after_pose,&combined).unwrap().len(),2);let read=run(combined.readback_arguments(&tags,"scnr",tag,&rotated).unwrap().unwrap());combined.verify_readback(&tags,"scnr",tag,&rotated,&read).unwrap();
        let original=pose([1.,1.,1.],std::f32::consts::FRAC_PI_4);run(original.arguments_with_fields(&tags,"scnr",tag,&after_pose).unwrap());assert_eq!(before,fields());assert_eq!(before_sha,crate::maps::hash_file(&file).unwrap());
        let original_bytes=fs::read(&file).unwrap();
        run(vec!["-t".into(),tags.to_string_lossy().into_owned(),"-I".into(),"cutscene_camera_points".into(),"2".into(),"end".into(),"-S".into(),"cutscene_camera_points[1].name".into(),"native_camera".into(),"-S".into(),"cutscene_camera_points[1].field_of_view".into(),70f32.to_radians().to_string(),tag.into()]);let camera_before=fields();let mut point=scenario_camera_choices(&camera_before).unwrap()[1].clone();point.position=[4.25,-5.5,6.75];point.orientation_radians=[1.25,-0.2,0.4];point.fov_radians=80f32.to_radians();let edit=Operation::CutsceneCamera{append:false,point:point.clone(),source_sha256:crate::maps::hash_file(&file).unwrap()};run(edit.arguments_with_fields(&tags,"scnr",tag,&camera_before).unwrap());let camera_after=fields();assert_eq!(reviewed_difference(&camera_before,&camera_after,&edit).unwrap().len(),3);let result=run(edit.readback_arguments(&tags,"scnr",tag,&camera_before).unwrap().unwrap());edit.verify_readback(&tags,"scnr",tag,&camera_before,&result).unwrap();assert!(camera_points_close(&point,&scenario_camera_choices(&camera_after).unwrap()[1]));println!("Native cutscene camera:index/name preserved; pose/lens roundtrip; sourceSHA={}",crate::maps::hash_file(&file).unwrap());fs::write(&file,&original_bytes).unwrap();assert_eq!(before_sha,crate::maps::hash_file(&file).unwrap());
        run(vec!["-t".into(),tags.to_string_lossy().into_owned(),"-I".into(),"trigger_volumes".into(),"1".into(),"end".into(),"-S".into(),"trigger_volumes[0].type".into(),"rotational".into(),"-S".into(),"trigger_volumes[0].name".into(),"native_volume".into(),"-S".into(),"trigger_volumes[0].rotation_vector_forward".into(),"1,0,0".into(),"-S".into(),"trigger_volumes[0].rotation_vector_up".into(),"0,0,1".into(),"-S".into(),"trigger_volumes[0].starting_corner".into(),"0,0,0".into(),"-S".into(),"trigger_volumes[0].ending_corner_offset".into(),"4,4,4".into(),tag.into()]);let volume_before=fields();let volume=Operation::TriggerVolume{append:false,index:0,name:"native_volume".into(),geometry:crate::maps::ScenarioLogicVolumeGeometry{forward:[0.,1.,0.],up:[0.,0.,1.],corner:[1.25,-2.5,3.75],dimensions:[6.,7.,8.]},source_sha256:crate::maps::hash_file(&file).unwrap()};run(volume.arguments_with_fields(&tags,"scnr",tag,&volume_before).unwrap());let volume_after=fields();assert_eq!(reviewed_difference(&volume_before,&volume_after,&volume).unwrap().len(),3);let read=run(volume.readback_arguments(&tags,"scnr",tag,&volume_before).unwrap().unwrap());volume.verify_readback(&tags,"scnr",tag,&volume_before,&read).unwrap();fs::write(&file,&original_bytes).unwrap();assert_eq!(before_sha,crate::maps::hash_file(&file).unwrap());

        run(vec!["-t".into(),tags.to_string_lossy().into_owned(),"-I".into(),"command_lists".into(),"2".into(),"end".into(),"-S".into(),"command_lists[0].name".into(),"guard".into(),"-S".into(),"command_lists[1].name".into(),"patrol".into(),tag.into()]);
        let commands=fields();let lists=scenario_command_list_choices(&commands).unwrap();assert_eq!(lists.len(),2);assert_eq!(lists[1].name,"patrol");
        let point=scenario_squad_start_choices(&commands).unwrap()[3].starts.as_ref().unwrap()[1].clone();assert_eq!(point.command_list,Some(-1));
        let binding=Operation::EncounterStartPosition{encounter:1,squad:1,start:1,encounter_name:"original_1".into(),squad_name:"squad_1".into(),position:point.position,source_sha256:crate::maps::hash_file(&file).unwrap(),facing_radians:None,command_list:Some(1)};
        run(binding.arguments_with_fields(&tags,"scnr",tag,&commands).unwrap());let bound=fields();assert_eq!(reviewed_difference(&commands,&bound,&binding).unwrap().len(),1);let read=run(binding.readback_arguments(&tags,"scnr",tag,&commands).unwrap().unwrap());binding.verify_readback(&tags,"scnr",tag,&commands,&read).unwrap();assert_eq!(scenario_squad_start_choices(&bound).unwrap()[3].starts.as_ref().unwrap()[1].command_list,Some(1));
        let mut clear=binding.clone();if let Operation::EncounterStartPosition{command_list,..}=&mut clear{*command_list=Some(-1);}run(clear.arguments_with_fields(&tags,"scnr",tag,&bound).unwrap());let cleared=fields();assert_eq!(commands,cleared);println!("Native command binding: existing index1/clear/other source fields preserved; boundSHA={}",crate::hex_bytes(Sha256::digest(bound.as_bytes())));fs::write(&file,&original_bytes).unwrap();assert_eq!(before_sha,crate::maps::hash_file(&file).unwrap());
        let inventory=scenario_combat_choices(&before).unwrap();let mut behavior=inventory[1].squads[1].behavior.clone().unwrap_or_else(||panic!("Native behavior inventory: {:?}",inventory[1].squads[1].behavior_issue));assert_eq!(behavior.initial_state,"none");assert_eq!(behavior.starts.len(),2);behavior.initial_state="sleeping".into();behavior.return_state="guarding".into();
        let only_squad=Operation::EncounterSquadBehavior{encounter:1,squad:1,encounter_name:"original_1".into(),squad_name:"squad_1".into(),behavior:behavior.clone(),source_sha256:before_sha.clone()};run(only_squad.arguments_with_fields(&tags,"scnr",tag,&before).unwrap());let squad_fields=fields();assert_eq!(reviewed_difference(&before,&squad_fields,&only_squad).unwrap().len(),4);assert!(scenario_combat_choices(&squad_fields).unwrap()[1].squads[1].behavior.as_ref().unwrap().starts.iter().all(|s|s.initial_state=="none"&&s.return_state=="none"));fs::write(&file,&original_bytes).unwrap();
        for p in &mut behavior.starts{p.initial_state=behavior.initial_state.clone();p.return_state=behavior.return_state.clone();}let mut all=only_squad.clone();if let Operation::EncounterSquadBehavior{behavior:value,..}=&mut all{*value=behavior.clone();}
        run(all.arguments_with_fields(&tags,"scnr",tag,&before).unwrap());let after=fields();assert_eq!(reviewed_difference(&before,&after,&all).unwrap().len(),12);assert!(reviewed_difference(&before,&after.replace("name (original_0)","name (wrong)"),&all).is_err());let scalar=run(all.readback_arguments(&tags,"scnr",tag,&before).unwrap().unwrap());all.verify_readback(&tags,"scnr",tag,&before,&scalar).unwrap();let sha=crate::maps::hash_file(&file).unwrap();let restored=current_combat_targets(&before,&before_sha,std::slice::from_ref(&all)).unwrap();if let Operation::EncounterSquadBehavior{behavior,..}=&restored[0]{assert_eq!(behavior.initial_state,"none");assert!(behavior.starts.iter().all(|s|s.return_state=="none"));}else{panic!("Wrong readback scope");}println!("Native squad/start behavior:3targets/6states; tagSHA={sha}; scalarSHA={}",crate::hex_bytes(Sha256::digest(scalar.as_bytes())));fs::write(&file,&original_bytes).unwrap();
        let mut moving=all.clone();if let Operation::EncounterSquadBehavior{behavior,..}=&mut moving{behavior.initial_state="moving_loop".into();}assert!(moving.arguments_with_fields(&tags,"scnr",tag,&before).is_err());let mut renumbered=all.clone();if let Operation::EncounterSquadBehavior{behavior,..}=&mut renumbered{behavior.starts[0].index=1;}assert!(renumbered.arguments_with_fields(&tags,"scnr",tag,&before).is_err());assert_eq!(before_sha,crate::maps::hash_file(&file).unwrap());
        let mut migration=only_squad.clone();if let Operation::EncounterSquadBehavior{behavior,..}=&mut migration{*behavior=inventory[1].squads[1].behavior.clone().unwrap();assert_eq!(behavior.automatic_migration,Some(false));behavior.automatic_migration=Some(true);}
        run(migration.arguments_with_fields(&tags,"scnr",tag,&before).unwrap());let migrated=fields();assert_eq!(reviewed_difference(&before,&migrated,&migration).unwrap().len(),1);assert_eq!(scenario_combat_choices(&migrated).unwrap()[1].squads[1].behavior.as_ref().unwrap().automatic_migration,Some(true));let read=run(migration.readback_arguments(&tags,"scnr",tag,&before).unwrap().unwrap());assert_eq!(read.trim(),"1");migration.verify_readback(&tags,"scnr",tag,&before,&read).unwrap();assert!(reviewed_difference(&before,&migrated.replace("never_search (0)","never_search (1)"),&migration).is_err());fs::write(&file,&original_bytes).unwrap();println!("Native automatic migration: exact one-flag edit/readback/restore PASS");
        let mut upgrades=only_squad.clone();if let Operation::EncounterSquadBehavior{behavior,..}=&mut upgrades{*behavior=inventory[1].squads[1].behavior.clone().unwrap();behavior.major_upgrade=Some(if behavior.major_upgrade.as_deref()==Some("none"){"normal"}else{"none"}.into());}
        run(upgrades.arguments_with_fields(&tags,"scnr",tag,&before).unwrap());let changed=fields();assert_eq!(reviewed_difference(&before,&changed,&upgrades).unwrap().len(),2);let read=run(upgrades.readback_arguments(&tags,"scnr",tag,&before).unwrap().unwrap());upgrades.verify_readback(&tags,"scnr",tag,&before,&read).unwrap();let mut invalid=upgrades.clone();if let Operation::EncounterSquadBehavior{behavior,..}=&mut invalid{behavior.major_upgrade=Some("invented".into());}assert!(invalid.validate("scnr",tag).is_err());fs::write(&file,&original_bytes).unwrap();println!("Native major-variant policy: exact enum edit/readback/restore PASS");

        let combat_inventory=scenario_combat_choices(&before).unwrap();assert_eq!(combat_inventory[1].points.len(),2);assert_eq!(combat_inventory[1].points[1].group,"z");
        let firing=Operation::EncounterFiringPosition{encounter:1,point:0,encounter_name:"original_1".into(),position:[7.,8.,9.],group:"b".into(),source_sha256:before_sha.clone()};run(firing.arguments_with_fields(&tags,"scnr",tag,&before).unwrap());let revised=fields();assert_eq!(reviewed_difference(&before,&revised,&firing).unwrap().len(),3);assert!(reviewed_difference(&before,&revised.replace("name (original_0)","name (changed)"),&firing).is_err());let read=run(firing.readback_arguments(&tags,"scnr",tag,&before).unwrap().unwrap());firing.verify_readback(&tags,"scnr",tag,&before,&read).unwrap();let firing_sha=crate::maps::hash_file(&file).unwrap();
        let groups=FiringGroups{attacking:vec!["a".into(),"z".into()],attacking_search:vec!["b".into()],attacking_guard:vec!["z".into()],defending:vec!["a".into()],defending_search:vec![],defending_guard:vec!["b".into(),"z".into()]};let tactical=Operation::EncounterSquadFiringGroups{encounter:1,squad:1,encounter_name:"original_1".into(),squad_name:"squad_1".into(),groups,source_sha256:firing_sha.clone()};for batch in tactical.argument_batches(tactical.arguments_with_fields(&tags,"scnr",tag,&revised).unwrap(),false).unwrap(){run(batch);}let final_fields=fields();assert_eq!(reviewed_difference(&revised,&final_fields,&tactical).unwrap().len(),7);let read=run(tactical.readback_arguments(&tags,"scnr",tag,&revised).unwrap().unwrap());tactical.verify_readback(&tags,"scnr",tag,&revised,&read).unwrap();let hash=crate::maps::hash_file(&file).unwrap();let targets=current_combat_targets(&final_fields,&hash,&[firing.clone(),tactical.clone()]).unwrap();let snapshot=ScenarioSquadReadback{machine_settings:Default::default(),named_objects:None,cutscene_flags:None,extraction_squads:None,faction_kits:None,transports:None,command_lists:None,devices:None,device_groups:None,volumes:None,cameras:None,source_sha256:hash.clone(),squads:scenario_squad_start_choices(&final_fields).unwrap(),include_starts:true,combat:targets};snapshot.validate().unwrap();let restored_targets=current_combat_targets(&before,&before_sha,&snapshot.combat).unwrap();assert!(matches!(&restored_targets[0],Operation::EncounterFiringPosition{position,group,..}if *position==[0.,0.,0.]&&group=="a"));assert!(matches!(&restored_targets[1],Operation::EncounterSquadFiringGroups{groups,..}if groups.masks().unwrap()==[0;6]));println!("Original native firing/tactics:pointSHA={firing_sha}; groupsSHA={hash}; scalarSHA={}; exact fields/restore scope verified",crate::hex_bytes(Sha256::digest(read.as_bytes())));fs::write(&file,&original_bytes).unwrap();assert_eq!(before_sha,crate::maps::hash_file(&file).unwrap());
        fs::create_dir_all(tags.join("actors")).unwrap();run(vec!["-t".into(),tags.to_string_lossy().into_owned(),"-N".into(),"actors/behavior.actor_variant".into()]);
        let states=[CampaignAiState::Sleeping,CampaignAiState::Alert,CampaignAiState::Guarding,CampaignAiState::Searching,CampaignAiState::Fleeing];
        let entries=states.iter().enumerate().map(|(i,state)|EncounterAppend{major_upgrade:(i==0).then(||"none".into()),name:format!("behavior_{i}"),actor_path:"actors/behavior".into(),position:[i as f32,0.,0.],start_active:false,count:1,spacing:0.75,difficulty:None,grid:None,starts:None,behavior:Some(EncounterBehavior{initial_state:*state,return_state:states[states.len()-1-i]}),patrol:None,combat:None}).collect();
        let behavior=Operation::AppendEncounters{encounters:entries,source_rules:None};run(behavior.arguments_with_fields(&tags,"scnr",tag,&before).unwrap());let authored=fields();assert_eq!(reviewed_difference(&before,&authored,&behavior).unwrap().len(),5);let result=run(behavior.readback_arguments(&tags,"scnr",tag,&before).unwrap().unwrap());behavior.verify_readback(&tags,"scnr",tag,&before,&result).unwrap();let authored_sha=crate::maps::hash_file(&file).unwrap();
        // Restore only the generated fixture; production sources are never written by this test.
        fs::write(&file,original_bytes).unwrap();assert_eq!(before_sha,crate::maps::hash_file(&file).unwrap());
        println!("Native behavior fixture:5groups/all5initial+return states; authoredSHA={authored_sha}; scalarReadbackSHA={}",Sha256::digest(result.as_bytes()).iter().map(|b|format!("{b:02x}")).collect::<String>());
        let patrol_json=serde_json::json!({"name":"patrol_fixture","actorPath":"actors/behavior","position":[0,0,0],"startActive":false,"count":2,"behavior":{"initialState":"moving_loop","returnState":"moving_loop_back_and_forth"},"patrol":{"points":[{"id":"p0","position":[1,2,3],"facingRadians":0.0,"waitSeconds":[0.25,1.5],"weight":2.5},{"id":"p1","position":[4,5,3],"facingRadians":1.5707964,"waitSeconds":[0.0,0.0],"weight":1.0,"visible":false,"locked":true}]}});
        let entry:EncounterAppend=serde_json::from_value(patrol_json).unwrap();let patrol=Operation::AppendEncounters{encounters:vec![entry],source_rules:None};let prior=fs::read(&file).unwrap();run(patrol.arguments_with_fields(&tags,"scnr",tag,&before).unwrap());let after=fields();assert_eq!(reviewed_difference(&before,&after,&patrol).unwrap().len(),1);let values=run(patrol.readback_arguments(&tags,"scnr",tag,&before).unwrap().unwrap());patrol.verify_readback(&tags,"scnr",tag,&before,&values).unwrap();
        let authored_patrol_bytes=fs::read(&file).unwrap();let source=scenario_combat_choices(&after).unwrap();let row=source.iter().find(|r|r.name=="patrol_fixture").unwrap();let member=&row.squads[0];let original_route=member.patrol.clone().unwrap();assert_eq!(original_route.points.len(),2);
        let mut changed=original_route.points[1].clone();changed.position=[8.,9.,3.];changed.facing_radians=-0.5;changed.weight=0.75;changed.wait_seconds=[1.,2.];
        let mut created=changed.clone();created.source_index=None;created.position=[10.,9.,3.];created.animation=-1;created.sequence_id=0;
        let revised_route=ScenarioPatrolRoute{points:vec![changed,created,original_route.points[0].clone(),original_route.points[1].clone()],start:0,end:0};
        let patrol_edit=Operation::EncounterSquadPatrol{encounter:row.encounter,squad:member.index,encounter_name:row.name.clone(),squad_name:member.name.clone(),route:revised_route.clone(),source_sha256:crate::maps::hash_file(&file).unwrap()};
        for batch in patrol_edit.argument_batches(patrol_edit.arguments_with_fields(&tags,"scnr",tag,&after).unwrap(),false).unwrap(){run(batch);}let route_after=fields();reviewed_difference(&after,&route_after,&patrol_edit).unwrap();assert!(reviewed_difference(&after,&route_after.replace("name (original_0)","name (bad)"),&patrol_edit).is_err());
        let mut scalar=vec![];for batch in patrol_edit.argument_batches(patrol_edit.readback_arguments(&tags,"scnr",tag,&after).unwrap().unwrap(),true).unwrap(){scalar.extend(run(batch).lines().map(str::to_owned));}let scalar=scalar.join("\n");patrol_edit.verify_readback(&tags,"scnr",tag,&after,&scalar).unwrap();
        let refreshed=current_combat_targets(&route_after,&crate::maps::hash_file(&file).unwrap(),std::slice::from_ref(&patrol_edit)).unwrap();if let Operation::EncounterSquadPatrol{route,..}=&refreshed[0]{assert_eq!(route.points.len(),4);assert!(route.points.iter().enumerate().all(|(i,p)|p.source_index==Some(i as u16)));}else{panic!("Wrong patrol readback scope");}
        let binding=ScenarioSquadReadback{machine_settings:Default::default(),named_objects:None,cutscene_flags:None,extraction_squads:None,faction_kits:None,transports:None,command_lists:None,devices:None,device_groups:None,volumes:None,cameras:None,source_sha256:crate::maps::hash_file(&file).unwrap(),squads:scenario_squad_start_choices(&route_after).unwrap(),include_starts:true,combat:refreshed};binding.validate().unwrap();let mut stale=binding.clone();stale.source_sha256="f".repeat(64);assert!(stale.validate().is_err());
        println!("Original patrol source: insert/copy/move/erase/pose/weight/waits; tagSHA={}; scalarSHA={}",crate::maps::hash_file(&file).unwrap(),crate::hex_bytes(Sha256::digest(scalar.as_bytes())));
        let mut invalid=patrol_edit.clone();if let Operation::EncounterSquadPatrol{route,..}=&mut invalid{route.points[0].animation=7;}assert!(invalid.arguments_with_fields(&tags,"scnr",tag,&after).is_err());
        if let Operation::EncounterSquadPatrol{route,..}=&mut invalid{*route=revised_route.clone();route.points.truncate(1);}assert!(invalid.arguments_with_fields(&tags,"scnr",tag,&after).is_err());
        fs::write(&file,authored_patrol_bytes).unwrap();
        println!("Native patrol fixture:2ordered points/loop+back-and-forth/XYZ/facing/weight/wait; tagSHA={}; readbackSHA={}",crate::maps::hash_file(&file).unwrap(),crate::hex_bytes(Sha256::digest(values.as_bytes())));fs::write(&file,prior).unwrap();assert_eq!(before_sha,crate::maps::hash_file(&file).unwrap());
        let combat_json=serde_json::json!({"name":"combat_fixture","actorPath":"actors/behavior","position":[0,0,0],"startActive":false,"count":2,"combat":{"points":[{"id":"f0","position":[2,1,0.1],"group":"a"},{"id":"f1","position":[4,1,0.1],"group":"z","visible":false,"locked":true},{"id":"f2","position":[6,1,0.1],"group":"b"}],"groups":{"attacking":["a","z"],"attackingSearch":["b"],"attackingGuard":["z"],"defending":["a"],"defendingSearch":[],"defendingGuard":["b","z"]}}});
        let entry:EncounterAppend=serde_json::from_value(combat_json).unwrap();assert_eq!(entry.combat.as_ref().unwrap().groups.masks().unwrap(),[33554433,2,33554432,1,0,33554434]);let combat=Operation::AppendEncounters{encounters:vec![entry],source_rules:None};let prior=fs::read(&file).unwrap();for batch in combat.argument_batches(combat.arguments_with_fields(&tags,"scnr",tag,&before).unwrap(),false).unwrap(){run(batch);}let after=fields();assert_eq!(reviewed_difference(&before,&after,&combat).unwrap().len(),1);let mut values=vec![];for batch in combat.argument_batches(combat.readback_arguments(&tags,"scnr",tag,&before).unwrap().unwrap(),true).unwrap(){values.extend(run(batch).lines().map(str::to_owned));}let scalar=values.join("\n");combat.verify_readback(&tags,"scnr",tag,&before,&scalar).unwrap();println!("Native combat fixture:3independent firing points/2starts/6tactical contexts/high groupZ/empty selection; tagSHA={}; scalarSHA={}",crate::maps::hash_file(&file).unwrap(),crate::hex_bytes(Sha256::digest(scalar.as_bytes())));fs::write(&file,prior).unwrap();assert_eq!(before_sha,crate::maps::hash_file(&file).unwrap());
        println!("Native AI fixture:4squads/8starts; toolSHA={}; beforeSHA={before_sha}; afterSHA={after_sha}; restoredSHA={}",
            crate::maps::hash_file(&executable).unwrap(),crate::maps::hash_file(&file).unwrap());
    }

    fn ai_fields()->String {
        "actor_palette[0] array\nencounters[1] array\n    encounters[0] struct\n        name (original) tagstring\n        squads[1] array\n            squads[0] struct\n                name (squad_a) tagstring\n                normal_diff_count (1) int16\n                insane_diff_count (1) int16\n                starting_locations[1] array\n                    starting_locations[0] struct\n                        position (1,2,3) point3d\n                        facing (90) angle\n                return_state (alert) enum\nscript_marker (preserve) tagstring\n".into()
    }
    #[test]
    fn native_start_command_binding_requires_current_lists_and_preserves_their_contents(){
        let before=ai_fields().replace("facing (90) angle", "facing (90) angle\n                        command_list (65535) index")+"command_lists[2] array\n    command_lists[0] struct\n        name (guard) tagstring\n        commands[0] array\n    command_lists[1] struct\n        name (patrol) tagstring\n        commands[0] array\n";
        let mut op=start_edit();if let Operation::EncounterStartPosition{position,command_list,..}=&mut op{*position=[1.,2.,3.];*command_list=Some(1);}
        let args=op.arguments_with_fields(Path::new("owned"),"scnr","level.scenario",&before).unwrap();assert_eq!(args.iter().filter(|s|s.as_str()=="-S").count(),1);assert!(args.iter().any(|s|s.ends_with(".command_list")));
        let after=before.replace("command_list (65535)","command_list (1)");assert_eq!(reviewed_difference(&before,&after,&op).unwrap().len(),1);op.verify_readback(Path::new("owned"),"scnr","level.scenario",&before,"1").unwrap();assert!(op.verify_readback(Path::new("owned"),"scnr","level.scenario",&before,"0").is_err());
        for text in [after.replace("name (patrol)","name (changed)"),after.replace("facing (90)","facing (0)"),after.replace("command_list (1)","command_list (0)")]{assert!(reviewed_difference(&before,&text,&op).is_err());}
        for index in [-2,2,256]{if let Operation::EncounterStartPosition{command_list,..}=&mut op{*command_list=Some(index);}assert!(op.arguments_with_fields(Path::new("owned"),"scnr","level.scenario",&before).is_err());}
        let missing=before.replace("                        command_list (65535) index\n","");if let Operation::EncounterStartPosition{command_list,..}=&mut op{*command_list=Some(-1);}assert!(op.arguments_with_fields(Path::new("owned"),"scnr","level.scenario",&missing).is_err());assert!(scenario_command_list_choices(&before.replace("command_lists[2]","command_lists[257]")).is_err());
        let legacy:ScenarioStartChoice=serde_json::from_value(serde_json::json!({"index":0,"position":[1,2,3]})).unwrap();assert!(legacy.command_list.is_none());
    }
    #[test]
    fn native_actor_palette_reads_accepted_source_not_only_the_cache_index(){
        let fields="actor_palette[2] array\n    actor_palette[0] struct\n        reference (actors/grunt.actor_variant) tagref\n    actor_palette[1] struct\n        reference (gs_assets_owned/actors/pilot.actor_variant) tagref\nencounters[0] array\n";
        assert_eq!(scenario_actor_sources(fields).unwrap(),vec!["actors/grunt","gs_assets_owned/actors/pilot"]);
        let actual="actor_palette[1]                                                        array\n └──actor_palette[0]                                                  struct\n     └──reference (gs_assets_owned\\actors\\pilot.actor_variant)               \nencounters[0]                                                         array\n";
        assert_eq!(scenario_actor_sources(actual).unwrap(),vec!["gs_assets_owned/actors/pilot"]);
        assert!(scenario_actor_sources("actor_palette[65] array\n").is_err());
        assert!(scenario_actor_sources("actor_palette[1] array\n    actor_palette[0] struct\n        reference (../pilot.actor_variant) tagref\n").is_err());
    }
    #[test]
    fn native_trigger_geometry_edit_preserves_identity_and_refuses_unrelated_changes(){
        let before="trigger_volumes[1] array\n    trigger_volumes[0] struct\n        type enum
            fixed enum value
            rotational (*) enum value\n        name (intro_area) tagstring\n        rotation_vector_forward (1,0,0) vector3d\n        rotation_vector_up (0,0,1) vector3d\n        starting_corner (0,0,0) point3d\n        ending_corner_offset (4,4,4) vector3d\nscript_marker (preserve) tagstring\n";
        let geometry=crate::maps::ScenarioLogicVolumeGeometry{forward:[0.,1.,0.],up:[0.,0.,1.],corner:[1.,2.,3.],dimensions:[6.,7.,8.]};let op=Operation::TriggerVolume{append:false,index:0,name:"intro_area".into(),geometry:geometry.clone(),source_sha256:"a".repeat(64)};op.validate("scnr","owned.scenario").unwrap();let args=op.arguments_with_fields(Path::new("tags"),"scnr","owned.scenario",before).unwrap();assert!(args.iter().any(|s|s=="trigger_volumes[0].starting_corner"));assert!(!args.iter().any(|s|s.ends_with(".name")||s.ends_with(".type")));op.verify_readback(Path::new("tags"),"scnr","owned.scenario",before,"0,1,0\n0,0,1\n1,2,3\n6,7,8").unwrap();
        let after=before.replace("(1,0,0)","(0,1,0)").replace("(0,0,0)","(1,2,3)").replace("(4,4,4)","(6,7,8)");assert_eq!(reviewed_difference(before,&after,&op).unwrap().len(),3);for changed in [after.replace("name (intro_area)","name (other)"),after.replace("script_marker (preserve)","script_marker (lost)"),after.replace("rotational (*)","fixed (*)")]{assert!(reviewed_difference(before,&changed,&op).is_err());}
        let mut bad=geometry;bad.dimensions[0]=0.;assert!(Operation::TriggerVolume{append:false,index:0,name:"intro_area".into(),geometry:bad,source_sha256:"a".repeat(64)}.validate("scnr","owned.scenario").is_err());assert!(op.arguments_with_fields(Path::new("tags"),"scnr","owned.scenario",&before.replace("rotational (*)","rotational").replace("fixed enum","fixed (*) enum")).is_err());
    }
    #[test]
    fn native_squad_migration_requires_exact_source_flags_and_preserves_missing_telemetry(){
        let flags="flags bitmask\n    unused (0) bitfield\n    never_search (1) bitfield\n    start_timer_immediately (0) bitfield\n    no_timer_delay_forever (0) bitfield\n    magic_sight_after_timer (0) bitfield\n    automatic_migration (0) bitfield\n";
        assert_eq!(native_squad_migration(flags,10).unwrap(),(Some(false),Some(16)));
        assert_eq!(native_squad_migration(&flags.replace("automatic_migration (0)","automatic_migration (1)"),10).unwrap(),(Some(true),Some(16)));
        assert_eq!(native_squad_migration("name (old source) string\n",0).unwrap(),(None,None));
        for changed in [flags.replace("automatic_migration (0)","automatic_migration (2)"),flags.replace("never_search (1)","automatic_migration (1)"),flags.replace("    unused (0) bitfield\n","")]{assert!(native_squad_migration(&changed,0).is_err());}
    }
    #[test]
    fn native_control_behavior_preserves_unrelated_fields_and_verifies_requested_values(){
        let before="bounding_radius (1) float32\nautomatic_activation_radius (0) float32\ndelay_time (0) float32\ntype enum\n    toggle_switch (*) enum value\n    on_button enum value\n    off_button enum value\n    call_button enum value\ntriggers_when enum\n    touched_by_player (*) enum value\n    destroyed enum value\ncall_value (0) float32\non dependency\nscript_marker (preserved) string\n";
        let mut settings=native_control_settings(before).unwrap();let original=settings.clone();settings.control_type="call_button".into();settings.trigger="destroyed".into();settings.call_value=0.75;settings.automatic_activation_radius=3.5;settings.delay_seconds=1.25;
        let op=Operation::ControlSettings{settings:settings.clone(),source_sha256:"a".repeat(64)};op.validate("ctrl","devices/terminal.device_control").unwrap();assert!(op.validate("mach","devices/door.device_machine").is_err());assert_eq!(op.expected_source_sha256(),Some("a".repeat(64).as_str()));
        let args=op.arguments_with_fields(Path::new("tags"),"ctrl","devices/terminal.device_control",before).unwrap();assert!(args.windows(3).any(|v|v==["-S","type","call_button"]));assert!(op.readback_arguments(Path::new("tags"),"ctrl","devices/terminal.device_control",before).unwrap().is_some());op.verify_readback(Path::new("tags"),"ctrl","devices/terminal.device_control",before,"call_button\ndestroyed\n0.750000\n3.500000\n1.250000").unwrap();
        let after=before.replace("toggle_switch (*)","toggle_switch").replace("call_button enum","call_button (*) enum").replace("touched_by_player (*)","touched_by_player").replace("destroyed enum","destroyed (*) enum").replace("call_value (0)","call_value (0.75)").replace("radius (0)","radius (3.5)").replace("delay_time (0)","delay_time (1.25)");assert_eq!(reviewed_difference(before,&after,&op).unwrap().len(),5);
        for bad in[after.replace("preserved","lost"),after.replace("radius (1)","radius (2)"),after.replace("call_value (0.75)","call_value (0.5)"),after.replace("on dependency","off dependency")]{assert!(reviewed_difference(before,&bad,&op).is_err());}
        assert!(Operation::ControlSettings{settings:original,source_sha256:"a".repeat(64)}.arguments_with_fields(Path::new("tags"),"ctrl","devices/terminal.device_control",before).is_err());
        for value in[-1.,1.01,f64::NAN,f64::INFINITY]{let mut bad=settings.clone();bad.call_value=value;assert!(bad.validate().is_err());}for value in["invented","on_button\n-S"]{let mut bad=settings.clone();bad.control_type=value.into();assert!(bad.validate().is_err());}
        for bad in[before.replace("toggle_switch (*)","toggle_switch"),before.replace("on_button enum","on_button (*) enum"),before.replace("call_value (0) float32","call_value (0) float32\ncall_value (1) float32")]{assert!(native_control_settings(&bad).is_err());}
        let mut rounded=settings.clone();rounded.automatic_activation_radius=5000.333;let mut compiled=rounded.clone();compiled.automatic_activation_radius=f64::from(5000.333_f32);assert!(rounded.close(&compiled));
    }
    #[test]
    fn native_trigger_append_preserves_existing_areas_and_script_bindings(){
        let empty="trigger_volumes[0] array\nscript_marker (preserve) tagstring\n";
        let row="    trigger_volumes[0] struct\n        type enum\n            fixed enum value\n            rotational (*) enum value\n        name (spirit_pad) tagstring\n        rotation_vector_forward (1,0,0) vector3d\n        rotation_vector_up (0,0,1) vector3d\n        starting_corner (0,0,0) point3d\n        ending_corner_offset (4,4,4) vector3d\n";
        let first=format!("trigger_volumes[1] array\n{row}script_marker (preserve) tagstring\n");
        let geometry=crate::maps::ScenarioLogicVolumeGeometry{forward:[1.,0.,0.],up:[0.,0.,1.],corner:[0.,0.,0.],dimensions:[4.,4.,4.]};
        let mut op=Operation::TriggerVolume{index:0,name:"spirit_pad".into(),geometry,source_sha256:"a".repeat(64),append:true};
        op.validate("scnr","owned.scenario").unwrap();let args=op.arguments_with_fields(Path::new("owned"),"scnr","owned.scenario",empty).unwrap();assert!(args.windows(4).any(|v|v==["-I","trigger_volumes","1","end"]));
        op.verify_readback(Path::new("owned"),"scnr","owned.scenario",empty,"spirit_pad\nrotational\n1,0,0\n0,0,1\n0,0,0\n4,4,4").unwrap();
        assert_eq!(reviewed_difference(empty,&first,&op).unwrap().len(),1);
        assert!(reviewed_difference(empty,&first.replace("preserve","lost"),&op).is_err());
        assert!(op.arguments_with_fields(Path::new("owned"),"scnr","owned.scenario",&first).is_err());
        if let Operation::TriggerVolume{index,name,..}=&mut op{*index=1;*name="spirit_return".into();}
        let second=format!("trigger_volumes[2] array\n{row}{}script_marker (preserve) tagstring\n",row.replace("[0]","[1]").replace("spirit_pad","spirit_return"));
        op.arguments_with_fields(Path::new("owned"),"scnr","owned.scenario",&first).unwrap();reviewed_difference(&first,&second,&op).unwrap();
        assert!(reviewed_difference(&first,&second.replacen("(spirit_pad)","(changed)",1),&op).is_err());
        if let Operation::TriggerVolume{name,..}=&mut op{*name="SPIRIT_PAD".into();}assert!(op.arguments_with_fields(Path::new("owned"),"scnr","owned.scenario",&first).is_err());
        if let Operation::TriggerVolume{name,..}=&mut op{*name="bad name".into();}assert!(op.validate("scnr","owned.scenario").is_err());
        let mut legacy=serde_json::to_value(&op).unwrap();legacy.as_object_mut().unwrap().remove("append");assert!(matches!(serde_json::from_value::<Operation>(legacy).unwrap(),Operation::TriggerVolume{append:false,..}));
    }
    #[test]
    fn native_cinematic_area_inventory_preserves_names_and_refuses_malformed_fields(){
        let fields="trigger_volumes[2] array
    trigger_volumes[0] struct
        name (intro_area) tagstring
        position (1,2,3) point3d
    trigger_volumes[1] struct
        name (later_area) tagstring
        position (4,5,6) point3d
";
        assert_eq!(scenario_trigger_volume_names(fields).unwrap(),vec!["intro_area","later_area"]);
        assert!(scenario_trigger_volume_names(&fields.replace("name (intro_area)","missing (intro_area)")).is_err());assert!(scenario_trigger_volume_names(&fields.replace("trigger_volumes[2] array","trigger_volumes[1025] array")).is_err());
    }
    #[test]
    fn original_cutscene_camera_review_retains_indices_names_scripts_and_other_fields(){
        let before="cutscene_camera_points[1] array\n    cutscene_camera_points[0] struct\n        name (intro) tagstring\n        position (1,2,3) point3d\n        orientation (45,0,10) euler3d\n        field_of_view (70) angle\nscript_marker (preserve) tagstring\n";
        let mut point=scenario_camera_choices(before).unwrap().remove(0);point.position=[4.,5.,6.];point.orientation_radians=[std::f32::consts::FRAC_PI_2,0.,0.];point.fov_radians=80f32.to_radians();let op=Operation::CutsceneCamera{append:false,point:point.clone(),source_sha256:"a".repeat(64)};
        assert_eq!(op.expected_source_sha256(),Some("a".repeat(64).as_str()));let after=before.replace("position (1,2,3)","position (4,5,6)").replace("orientation (45,0,10)","orientation (90,0,0)").replace("field_of_view (70)","field_of_view (80)");assert_eq!(reviewed_difference(before,&after,&op).unwrap().len(),3);op.verify_readback(Path::new("owned"),"scnr","level.scenario",before,"4,5,6\n90,0,0\n80").unwrap();
        for changed in [after.replace("name (intro)","name (other)"),after.replace("script_marker (preserve)","script_marker (lost)"),after.replace("orientation (90,0,0)","orientation (0,0,0)")]{assert!(reviewed_difference(before,&changed,&op).is_err());}
        for fov in [f32::NAN,0.,180f32.to_radians()]{let mut bad=op.clone();if let Operation::CutsceneCamera{point,..}=&mut bad{point.fov_radians=fov;}assert!(bad.arguments_with_fields(Path::new("owned"),"scnr","level.scenario",before).is_err());}
    }
    fn start_edit()->Operation {
        Operation::EncounterStartPosition{encounter:0,squad:0,start:0,encounter_name:"original".into(),squad_name:"squad_a".into(),
            position:[4.0,5.0,6.0],source_sha256:"a".repeat(64),facing_radians:None,command_list:None}
    }
    #[test]
    fn ai_start_review_rejects_adjacent_fields_stale_identity_and_unavailable_coordinates(){
        let before=ai_fields();let after=before.replace("position (1,2,3)","position (4,5,6)");
        let operation=start_edit();let args=operation.arguments_with_fields(Path::new("owned-tags"),"scnr","level.scenario",&before).unwrap();
        assert!(args.iter().any(|arg|arg=="encounters[0].squads[0].starting_locations[0].position"));
        assert_eq!(reviewed_difference(&before,&after,&operation).unwrap().len(),1);
        assert!(reviewed_difference(&before,&after.replace("facing (90)","facing (91)"),&operation).is_err());
        assert!(reviewed_difference(&before,&after.replace("name (squad_a)","name (other)"),&operation).is_err());
        assert!(operation.arguments_with_fields(Path::new("owned-tags"),"scnr","level.scenario",&before.replace("name (original)","name (other)")).is_err());
        let unavailable=before.replace("position (1,2,3)","position (NaN,2,3)");
        assert!(scenario_squad_choices(&unavailable).is_ok(),"count-only inspection must not require position telemetry");
        assert!(scenario_squad_start_choices(&unavailable).is_err());
    }
    #[test]
    fn original_patrol_snapshot_validates_its_source_binding_without_panicking(){
        let operation:Operation=serde_json::from_value(serde_json::json!({"kind":"encounterSquadPatrol","encounter":0,"squad":0,"encounterName":"original_0","squadName":"squad_0","route":{"points":[]},"sourceSha256":"a".repeat(64)})).unwrap();
        let mut snapshot=ScenarioSquadReadback{machine_settings:Default::default(),named_objects:None,cutscene_flags:None,extraction_squads:None,faction_kits:None,transports:None,command_lists:None,devices:None,device_groups:None,volumes:None,cameras:None,source_sha256:"a".repeat(64),squads:vec![],include_starts:false,combat:vec![operation.clone()]};snapshot.validate().unwrap();
        snapshot.source_sha256="b".repeat(64);assert!(snapshot.validate().is_err());snapshot.source_sha256="a".repeat(64);snapshot.combat.push(operation);assert!(snapshot.validate().is_err());
    }
    #[test]
    fn campaign_difficulty_defaults_and_bounds_reach_existing_native_writer(){
        let value=serde_json::json!({"kind":"appendEncounter","name":"gs_new","actorPath":"characters/grunt","position":[0,0,0],
            "startActive":false,"count":4,"spacing":0.75});
        let default:Operation=serde_json::from_value(value.clone()).unwrap();
        assert!(serde_json::to_value(&default).unwrap().get("difficulty").is_none());
        let mut modified=value;modified["difficulty"]=serde_json::json!({"normal":2,"insane":4});
        let operation:Operation=serde_json::from_value(modified.clone()).unwrap();
        let args=operation.arguments_with_fields(Path::new("owned-tags"),"scnr","level.scenario",&ai_fields()).unwrap();
        assert!(args.windows(3).any(|args|args==["-S","encounters[1].squads[0].normal_diff_count","2"]));
        assert!(args.windows(3).any(|args|args==["-S","encounters[1].squads[0].insane_diff_count","4"]));
        modified["difficulty"]["insane"]=serde_json::json!(5);
        assert!(serde_json::from_value::<Operation>(modified).unwrap().validate("scnr","level.scenario").is_err());
    }

    #[test]
    fn ai_coordinate_snapshot_rejects_wrong_compiled_values_missing_details_and_legacy_scope_changes(){
        use crate::maps::*;
        let squad=EncounterSquad{major_upgrade:None,automatic_migration:None,name:"squad_a".into(),actor_palette_index:-1,actor_variant_tag_id:None,normal_count:1,insane_count:1,
            initial_state:2,return_state:2,firing_groups:None,move_positions:None,starting_locations:vec![AiStartingLocation{position:[1.0,2.0,3.0],facing:std::f32::consts::FRAC_PI_2,flags:0,
                initial_state:2,return_state:2,actor_palette_index:-1,actor_variant_tag_id:None,command_list:-1}]};
        let mut map=MapInspection{player_starting_profiles:None,header:MapHeader{version:609,engine:"unit fixture".into(),name:"unit".into(),
            build:String::new(),scenario_type:0,file_size:0,declared_size:0,tag_offset:0,tag_size:0,crc32:0,flags:0,demo_layout:false,
            compressed:false,extended:false,legacy_tag_size_repair:false},tag_checksum:None,sha256:"b".repeat(64),tags:vec![],objects:vec![],decals:vec![],
            mesh:MeshData::default(),render_mesh:None,model_meshes:Default::default(),encounters:vec![Encounter{name:"original".into(),squads:vec!["squad_a".into()],
                team:0,details:Some(EncounterDetails{flags:0,manual_bsp_index:-1,squads:vec![squad],firing_positions:vec![]})}],
            scripts:vec![],resources:vec![],diagnostics:vec![],scenario_path:"level".into()};
        let snapshot=ScenarioSquadReadback{machine_settings:Default::default(),named_objects:None,cutscene_flags:None,extraction_squads:None,faction_kits:None,transports:None,command_lists:None,devices:None,device_groups:None,volumes:None,cameras:None,combat:vec![],source_sha256:"a".repeat(64),squads:scenario_squad_start_choices(&ai_fields()).unwrap(),include_starts:true};
        snapshot.verify_map(&map).unwrap();
        map.encounters[0].details.as_mut().unwrap().squads[0].starting_locations[0].facing=0.;assert!(snapshot.verify_map(&map).is_err());
        map.encounters[0].details.as_mut().unwrap().squads[0].starting_locations[0].facing=std::f32::consts::FRAC_PI_2;
        map.encounters[0].details.as_mut().unwrap().squads[0].starting_locations[0].position[0]=9.0;
        assert!(snapshot.verify_map(&map).is_err());
        map.encounters[0].details.as_mut().unwrap().squads[0].starting_locations[0].position=[1.,2.,3.];
        let fields=ai_fields().replace("facing (90) angle","facing (90) angle\n                        command_list (1) index");let bound=ScenarioSquadReadback{machine_settings:Default::default(),named_objects:None,cutscene_flags:None,extraction_squads:None,faction_kits:None,transports:None,command_lists:None,devices:None,device_groups:None,volumes:None,cameras:None,source_sha256:"a".repeat(64),squads:scenario_squad_start_choices(&fields).unwrap(),include_starts:true,combat:vec![]};assert!(bound.verify_map(&map).is_err());map.encounters[0].details.as_mut().unwrap().squads[0].starting_locations[0].command_list=1;bound.verify_map(&map).unwrap();let mut binding=start_edit();if let Operation::EncounterStartPosition{position,facing_radians,command_list,..}=&mut binding{*position=[1.,2.,3.];*facing_radians=Some(std::f32::consts::FRAC_PI_2);*command_list=Some(1);}binding.verify_compiled_encounter(&map).unwrap();map.encounters[0].details.as_mut().unwrap().squads[0].starting_locations[0].command_list=-1;assert!(binding.verify_compiled_encounter(&map).is_err());
        let legacy=ScenarioSquadReadback{machine_settings:Default::default(),named_objects:None,cutscene_flags:None,extraction_squads:None,faction_kits:None,transports:None,command_lists:None,devices:None,device_groups:None,volumes:None,cameras:None,combat:vec![],source_sha256:"a".repeat(64),squads:scenario_squad_choices(&ai_fields()).unwrap(),include_starts:false};
        let encoded=serde_json::to_value(&legacy).unwrap();assert!(encoded.get("includeStarts").is_none());
        serde_json::from_value::<ScenarioSquadReadback>(encoded.clone()).unwrap().verify_map(&map).unwrap();
        assert!(encoded.get("combat").is_none());let firing=Operation::EncounterFiringPosition{encounter:0,point:0,encounter_name:"original".into(),position:[4.,5.,6.],group:"z".into(),source_sha256:"a".repeat(64)};map.encounters[0].details.as_mut().unwrap().firing_positions.push(AiFiringPosition{position:[4.,5.,6.],group_index:25,cluster_index:-1,surface_index:0});firing.verify_compiled_encounter(&map).unwrap();map.encounters[0].details.as_mut().unwrap().firing_positions[0].group_index=0;assert!(firing.verify_compiled_encounter(&map).is_err());map.encounters[0].details.as_mut().unwrap().firing_positions[0].group_index=25;
        let groups=FiringGroups{attacking:vec!["z".into()],attacking_search:vec![],attacking_guard:vec![],defending:vec![],defending_search:vec![],defending_guard:vec![]};let tactical=Operation::EncounterSquadFiringGroups{encounter:0,squad:0,encounter_name:"original".into(),squad_name:"squad_a".into(),groups,source_sha256:"a".repeat(64)};assert!(tactical.verify_compiled_encounter(&map).is_err());map.encounters[0].details.as_mut().unwrap().squads[0].firing_groups=Some(SquadFiringGroups{attacking:33554432,attacking_search:0,attacking_guard:0,defending:0,defending_search:0,defending_guard:0});tactical.verify_compiled_encounter(&map).unwrap();let mut scoped=legacy.clone();scoped.combat=vec![firing.clone(),tactical];scoped.verify_map(&map).unwrap();scoped.combat.push(firing);assert!(scoped.validate().is_err());
        let behavior:ScenarioSquadBehavior=serde_json::from_value(serde_json::json!({"initialState":"alert","returnState":"alert","patrolCount":0,"starts":[{"index":0,"initialState":"alert","returnState":"alert"}]})).unwrap();let behavior_op=Operation::EncounterSquadBehavior{encounter:0,squad:0,encounter_name:"original".into(),squad_name:"squad_a".into(),behavior,source_sha256:"a".repeat(64)};assert!(behavior_op.verify_compiled_encounter(&map).is_err(),"unavailable route telemetry is not zero");map.encounters[0].details.as_mut().unwrap().squads[0].move_positions=Some(vec![]);behavior_op.verify_compiled_encounter(&map).unwrap();map.encounters[0].details.as_mut().unwrap().squads[0].starting_locations[0].initial_state=1;assert!(behavior_op.verify_compiled_encounter(&map).is_err());map.encounters[0].details.as_mut().unwrap().squads[0].starting_locations[0].initial_state=2;let mut migration_op=behavior_op.clone();if let Operation::EncounterSquadBehavior{behavior,..}=&mut migration_op{behavior.automatic_migration=Some(true);}assert!(migration_op.verify_compiled_encounter(&map).is_err(),"missing compiled migration telemetry is not false");map.encounters[0].details.as_mut().unwrap().squads[0].automatic_migration=Some(false);assert!(migration_op.verify_compiled_encounter(&map).is_err());map.encounters[0].details.as_mut().unwrap().squads[0].automatic_migration=Some(true);migration_op.verify_compiled_encounter(&map).unwrap();let mut upgrades=behavior_op.clone();if let Operation::EncounterSquadBehavior{behavior,..}=&mut upgrades{behavior.major_upgrade=Some("none".into());}assert!(upgrades.verify_compiled_encounter(&map).is_err());map.encounters[0].details.as_mut().unwrap().squads[0].major_upgrade=Some(0);assert!(upgrades.verify_compiled_encounter(&map).is_err());map.encounters[0].details.as_mut().unwrap().squads[0].major_upgrade=Some(3);upgrades.verify_compiled_encounter(&map).unwrap();
        map.encounters[0].details=None;
        assert!(snapshot.verify_map(&map).is_err(),"missing data is unavailable, not zero");
    }

    #[test]
    fn padded_native_encounter_declarations_preserve_original_rows_and_revision_identity() {
        let before = concat!(
            "actor_palette[1] array\n",
            "    actor_palette[0]                         struct\n",
            "        reference (actors/grunt.actor_variant) tagref\n",
            "encounters[1] array\n",
            "    encounters[0]                           struct\n",
            "        name (original) tagstring\n",
            "        squads[0] array\n",
            "script_marker (preserve) tagstring\n");
        let added = concat!(
            "    encounters[1]                           struct\n",
            "        name (survivors) tagstring\n",
            "        squads[1] array\n",
            "            squads[0] struct\n",
            "                starting_locations[1] array\n",
            "                firing_positions[1] array\n");
        let after = before.replace("encounters[1] array", "encounters[2] array")
            .replace("script_marker", &format!("{added}script_marker"));
        let operation = Operation::AppendEncounters { encounters: vec![EncounterAppend {
            name: "survivors".into(), actor_path: "actors/grunt".into(), position: [0.;3],
            start_active: false, difficulty: None, major_upgrade: None, count: 1, spacing: 1., grid: None, starts: None, behavior: None, patrol: None, combat: None,
        }], source_rules: None };
        assert_eq!(reviewed_difference(before, &after, &operation).unwrap().len(), 1);
        let identity = owned_encounter_identity(&after, &operation).unwrap();
        let (base, indices) = encounter_revision_base(&after, &operation, &identity).unwrap();
        assert_eq!(indices, [1]);
        assert_eq!(base, before);
        for changed in [after.replace("(preserve)", "(foreign)"),
                        after.replace("name (original)", "name (foreign)")] {
            assert!(reviewed_difference(before, &changed, &operation).is_err());
        }
        let changed_owned = after.replace("name (survivors)", "name (foreign)");
        assert!(encounter_revision_base(&changed_owned, &operation, &identity).is_err());
        for wrong in ["        encounters[1] struct", "    encounters[10] struct",
                      "    encounters[1]struct", "    encounters[1] other"] {
            assert!(!encounter_row(wrong, 1));
        }
    }
    #[test]
    fn lens_repair_distinguishes_raw_radians_from_reader_degrees() {
        assert!(broken_lens_scale(20626.480625));
        assert!(!broken_lens_scale(360.0));
        assert!(!broken_lens_scale(0.0));
        assert!(!broken_lens_scale(f64::NAN));
        assert!(reviewed_difference(
            "rotation_function_scale (20626.480625) angle (float32)\n",
            "rotation_function_scale (0.000000) angle (float32)\n",
            &Operation::LensFlareScaleRepair
        )
        .is_ok());
        assert!(reviewed_difference(
            "rotation_function_scale (360.000000) angle (float32)\n",
            "rotation_function_scale (0.000000) angle (float32)\n",
            &Operation::LensFlareScaleRepair
        )
        .is_err());
    }
    #[test]
    fn recipes_cannot_select_broad_repairs_or_accept_foreign_fields() {
        let p = Path::new("owned-tags");
        assert!(Operation::LensFlareScaleRepair
            .arguments(p, "weap", "weapons/pistol.weapon")
            .is_err());
        assert!(Operation::Dependencies
            .arguments(p, "weap", "../sdk/pistol.weapon")
            .is_err());
        assert!(Operation::Dependencies
            .arguments(p, "weap", "-b.weapon")
            .is_err());
        for value in [f64::NAN, f64::INFINITY, -1.0, 100001.0] {
            assert!(Operation::BoundingRadius { value }
                .arguments(p, "weap", "pistol.weapon")
                .is_err());
        }
        let args = Operation::LensFlareScaleRepair
            .arguments(p, "lens", "sun.lens_flare")
            .unwrap();
        assert_eq!(
            &args[2..],
            ["-T", "broken-lens-flare-function-scale", "sun.lens_flare"]
        );
    }
    #[test]
    fn native_field_comparison_rejects_adjacent_edits_precision_ambiguity_and_wrong_result() {
        let before = "bounding_radius (0.100000) float32\nacceleration_scale (2) float32\n";
        let good = before.replace("0.100000", "0.350000");
        let op = Operation::BoundingRadius { value: 0.35 };
        assert_eq!(reviewed_difference(before, &good, &op).unwrap().len(), 1);
        assert!(reviewed_difference(before, &good.replace("(2)", "(3)"), &op).is_err());
        assert!(reviewed_difference(before, before, &op).is_err());
        assert!(
            reviewed_difference(before, &good, &Operation::BoundingRadius { value: 0.5 }).is_err()
        );
    }
    #[test]
    fn dependency_success_does_not_hide_broken_paths_or_accept_traversal() {
        let r = dependency_lines("weapons\\pistol\\pistol.gbxmodel\nmissing.bitmap [BROKEN]\n")
            .unwrap();
        assert!(r[1].reported_broken);
        assert_eq!(r[0].path, "weapons/pistol/pistol.gbxmodel");
        assert!(dependency_lines("../secret.bitmap\n").is_err());
        assert!(dependency_lines("a.bitmap\nA.bitmap\n").is_err());
    }
    #[test]
    fn campaign_behavior_preserves_legacy_source_and_rejects_unsupported_states() {
        let base=serde_json::json!({"name":"guards","actorPath":"actors/guard","position":[0,0,0],"startActive":false,"count":2});
        let mut entry:EncounterAppend=serde_json::from_value(base.clone()).unwrap();assert!(entry.behavior.is_none());assert_eq!(entry.states(),(CampaignAiState::Alert,CampaignAiState::Alert));assert!(serde_json::to_value(&entry).unwrap().get("behavior").is_none());
        entry.behavior=Some(EncounterBehavior{initial_state:CampaignAiState::Sleeping,return_state:CampaignAiState::Searching});
        let operation=Operation::AppendEncounters{encounters:vec![entry],source_rules:None};let args=operation.arguments_with_fields(Path::new("tags"),"scnr","level.scenario",&ai_fields()).unwrap();
        assert_eq!(args.windows(3).filter(|a|a[0]=="-S"&&a[1].ends_with(".initial_state")&&a[2]=="sleeping").count(),3);assert_eq!(args.windows(3).filter(|a|a[0]=="-S"&&a[1].ends_with(".return_state")&&a[2]=="searching").count(),3);
        let mut rules=crate::firefight::default_config();rules.enemies.push(crate::firefight::EnemyType{id:"guard".into(),name:"Guard".into(),actor_variant_path:"actors/guard".into(),points:10});rules.waves.push(crate::firefight::WaveDefinition{id:"wave".into(),name:"Wave".into(),boss:false,score_multiplier_milli:1000,groups:vec![crate::firefight::EnemyGroup{enemy_id:"guard".into(),count:1,spawn_zone_id:None}]});crate::firefight::validate(&rules).unwrap();
        let prepared=Operation::AppendEncounters{encounters:operation.encounter_appends().unwrap(),source_rules:Some(rules)};assert!(prepared.validate("scnr","level.scenario").unwrap_err().to_string().contains("exact controller"));
        for state in ["attacking","moving_unknown","inherit",""]{let mut invalid=base.clone();invalid["behavior"]=serde_json::json!({"initialState":state,"returnState":"alert"});assert!(serde_json::from_value::<EncounterAppend>(invalid).is_err());}
        for(state,index)in [(CampaignAiState::Sleeping,1),(CampaignAiState::Alert,2),(CampaignAiState::Guarding,8),(CampaignAiState::Searching,10),(CampaignAiState::Fleeing,11)]{assert_eq!(state.native().1,index);}
    }
    #[test]
    fn combat_source_keeps_legacy_output_and_validates_independent_points_and_masks(){
        let base=serde_json::json!({"name":"guards","actorPath":"actors/guard","position":[0,0,0],"startActive":false,"count":2});let old:EncounterAppend=serde_json::from_value(base.clone()).unwrap();assert_eq!(old.firing_points().unwrap().len(),2);assert!(serde_json::to_value(&old).unwrap().get("combat").is_none());
        let mut value=base;value["combat"]=serde_json::json!({"points":[{"id":"f0","position":[5,6,7],"group":"z"}],"groups":{"attacking":["a","z"],"attackingSearch":[],"attackingGuard":["z"],"defending":[],"defendingSearch":[],"defendingGuard":[]}});let entry:EncounterAppend=serde_json::from_value(value.clone()).unwrap();assert_eq!(entry.firing_points().unwrap().len(),1);assert_eq!(entry.combat.as_ref().unwrap().groups.masks().unwrap()[0],33554433);assert!(entry.require_mcc_search_groups().is_err());let mut repaired=entry.clone();let g=&mut repaired.combat.as_mut().unwrap().groups;g.attacking_search=vec!["a".into(),"z".into()];g.defending_search=vec!["a".into(),"z".into()];repaired.require_mcc_search_groups().unwrap();
        let op=Operation::AppendEncounters{encounters:vec![entry],source_rules:None};let args=op.arguments_with_fields(Path::new("tags"),"scnr","level.scenario",&ai_fields()).unwrap();assert!(args.windows(4).any(|r|r==["-I","encounters[1].firing_positions","1","end"]));assert!(args.windows(3).any(|r|r==["-S","encounters[1].squads[0].attacking.z","1"]));
        for bad in [serde_json::json!([]),serde_json::json!(["a","a"]),serde_json::json!(["bad"]) ]{let mut invalid=value.clone();if bad.as_array().unwrap().is_empty(){invalid["combat"]["points"]=bad;}else{invalid["combat"]["groups"]["attacking"]=bad;}assert!(serde_json::from_value::<EncounterAppend>(invalid).unwrap().poses().is_err());}
        let mut bad=value.clone();bad["combat"]["points"][0]["group"]=serde_json::json!("aa");assert!(serde_json::from_value::<EncounterAppend>(bad).unwrap().poses().is_err());let mut bad=value;bad["combat"]["points"][0]["position"]=serde_json::json!([2049,0,0]);assert!(serde_json::from_value::<EncounterAppend>(bad).unwrap().poses().is_err());
    }
    #[test]
    fn patrol_source_rejects_missing_paths_invalid_waits_duplicate_ids_and_recipe_overrides(){
        let point=serde_json::json!({"id":"p0","position":[1,2,3],"facingRadians":0,"waitSeconds":[0,1],"weight":1});let mut base=serde_json::json!({"name":"patrol","actorPath":"actors/guard","position":[0,0,0],"startActive":false,"count":1,"behavior":{"initialState":"moving_loop","returnState":"alert"},"patrol":{"points":[point.clone(),{"id":"p1","position":[4,5,3],"facingRadians":1,"waitSeconds":[0,0],"weight":2}]}});
        let entry:EncounterAppend=serde_json::from_value(base.clone()).unwrap();entry.poses().unwrap();let args=Operation::AppendEncounters{encounters:vec![entry],source_rules:None}.arguments_with_fields(Path::new("tags"),"scnr","level.scenario",&ai_fields()).unwrap();assert_eq!(args.windows(3).filter(|v|v[0]=="-S"&&v[1].contains("move_positions")&&v[1].ends_with(".sequence_id")&&v[2]=="0").count(),2);
        let original=base.clone();for invalid in [serde_json::Value::Null,serde_json::json!({"points":[point.clone()]})]{base=original.clone();base["patrol"]=invalid;assert!(serde_json::from_value::<EncounterAppend>(base.clone()).unwrap().poses().is_err());}
        for(key,value)in [("weight",serde_json::json!(0)),("waitSeconds",serde_json::json!([2,1])),("id",serde_json::json!("p1")),("position",serde_json::json!([2049,0,0]))]{base=original.clone();base["patrol"]["points"][0][key]=value;assert!(serde_json::from_value::<EncounterAppend>(base.clone()).unwrap().poses().is_err());}
    }
    #[test]
    fn authored_campaign_poses_keep_legacy_grid_and_reject_ambiguous_source() {
        let base=serde_json::json!({"name":"guards","actorPath":"characters/grunt","position":[4,3,0.1],"startActive":false,"count":2});
        let legacy:EncounterAppend=serde_json::from_value(base.clone()).unwrap();assert!(legacy.starts.is_none());assert!(serde_json::to_value(&legacy).unwrap().get("starts").is_none());let mut custom=legacy.clone();let mut starts=custom.poses().unwrap();starts[0].position=[6.,4.,0.1];starts[0].facing_radians=std::f32::consts::FRAC_PI_2;starts[1].visible=false;starts[1].locked=true;custom.starts=Some(starts);
        let op=Operation::AppendEncounters{encounters:vec![custom.clone()],source_rules:None};op.validate("scnr","level.scenario").unwrap();assert_eq!(custom.positions().unwrap(),vec![[6.,4.,0.1],[4.375,2.625,0.1]]);
        let fields="actor_palette[0] array\nencounters[0] array\n";let args=op.arguments_with_fields(Path::new("tags"),"scnr","level.scenario",fields).unwrap();assert!(args.windows(3).any(|row|row[0]=="-S"&&row[1].ends_with("starting_locations[0].facing")&&row[2]==std::f32::consts::FRAC_PI_2.to_string()));assert!(args.windows(4).any(|row|row==["-I","encounters[0].squads[0].starting_locations","2","end"]));
        let mut wrong=custom.clone();wrong.count=1;assert!(wrong.poses().is_err());wrong=custom.clone();wrong.grid=Some(EncounterGrid{total:2,offset:0});assert!(wrong.poses().is_err());
        for value in [f32::NAN,2049.] {wrong=custom.clone();wrong.starts.as_mut().unwrap()[0].position[0]=value;assert!(wrong.poses().is_err());}
        wrong=custom.clone();wrong.starts.as_mut().unwrap()[0].facing_radians=7.;assert!(wrong.poses().is_err());wrong=custom;wrong.starts.as_mut().unwrap()[1].id="grid-0".into();assert!(wrong.poses().is_err());
    }
    #[test]
    fn named_waypoint_objects_require_real_unique_reverse_source_bindings(){
        let mut source=String::from("object_names[1] array\n    object_names[0] struct\n        name (craft) string\n");
        for &(array,palette,_,extension,_,_,_,_,_)in crate::maps::NAMED_OBJECT_BLOCKS{
            if array=="vehicles"{source.push_str("vehicles[1] array\n    vehicles[0] struct\n        type (0) index\n        name (0) index\n        position (1,2,3) point3d\nvehicle_palette[1] array\n    vehicle_palette[0] struct\n");source.push_str(&format!("        name (vehicles/craft.{extension}) dependency\n"));}
            else{source.push_str(&format!("{array}[0] array\n{palette}[0] array\n"));}
        }
        let objects=native_guidance_objects(&source).unwrap();assert_eq!(objects.len(),1);assert_eq!(objects[0].class,"vehi");assert_eq!(objects[0].name,"craft");assert_eq!(objects[0].position,[1.,2.,3.]);
        for broken in [source.replace("name (0) index","name (99) index"),source.replace("type (0) index","type (5) index"),source.replace(".vehicle)",".weapon)")]{assert!(native_guidance_objects(&broken).is_err());}
        assert!(native_guidance_objects(&source.replace("vehicles[1] array","vehicles[4097] array")).is_err());
    }

    #[test]
    fn objective_flag_pose_append_and_readback_preserve_source_identity(){
        let before="cutscene_flags[1] array\n    cutscene_flags[0] struct\n        name (original) string\n        position (1,2,3) point3d\n        facing (90,0) euler2d\noriginal_metadata (keep) string\n";
        let mut point=scenario_flag_choices(before).unwrap().remove(0);point.position=[4.,5.,6.];point.facing_radians=[0.5,-0.2];
        let op=Operation::CutsceneFlag{point:point.clone(),append:false,source_sha256:"a".repeat(64)};
        let args=op.arguments_with_fields(Path::new("owned"),"scnr","level.scenario",before).unwrap();assert!(!args.contains(&"-I".into()));
        let after=before.replace("(1,2,3)","(4,5,6)").replace("(90,0)","(28.64789,-11.459156)");
        assert_eq!(reviewed_difference(before,&after,&op).unwrap().len(),2);
        op.verify_readback(Path::new("owned"),"scnr","level.scenario",before,"4,5,6\n28.64789,-11.459156\n").unwrap();
        assert!(reviewed_difference(before,&after.replace("(keep)","(changed)"),&op).is_err());
        assert!(op.arguments_with_fields(Path::new("owned"),"scnr","level.scenario",&before.replace("(original)","(other)")).is_err());
        let mut append=point;append.index=1;append.name="objective".into();let op=Operation::CutsceneFlag{point:append.clone(),append:true,source_sha256:"a".repeat(64)};
        assert!(op.arguments_with_fields(Path::new("owned"),"scnr","level.scenario",before).unwrap().contains(&"-I".into()));
        append.name="ORIGINAL".into();assert!(Operation::CutsceneFlag{point:append,append:true,source_sha256:"a".repeat(64)}.arguments_with_fields(Path::new("owned"),"scnr","level.scenario",before).is_err());
    }

    #[test]
    fn camera_append_retains_originals_and_legacy_edit_shape(){
        let before="cutscene_camera_points[0] array\noriginal_metadata (preserved) string\n";
        let point=crate::maps::NativeCameraPoint{index:0,name:"new_camera".into(),position:[1.,2.,3.],orientation_radians:[0.;3],fov_radians:60f32.to_radians()};
        let op=Operation::CutsceneCamera{point:point.clone(),append:true,source_sha256:"a".repeat(64)};let args=op.arguments_with_fields(Path::new("owned"),"scnr","level.scenario",before).unwrap();assert!(args.windows(3).any(|w|w==["-I","cutscene_camera_points","1"]));
        let after="cutscene_camera_points[1] array\n    cutscene_camera_points[0] struct\n        name (new_camera) string\n        position (1,2,3) point3d\n        orientation (0,0,0) euler3d\n        field_of_view (60) angle\noriginal_metadata (preserved) string\n";
        assert_eq!(reviewed_difference(before,after,&op).unwrap().len(),1);assert!(op.arguments_with_fields(Path::new("owned"),"scnr","level.scenario",after).is_err());assert!(reviewed_difference(before,&after.replace("preserved","lost"),&op).is_err());
        let legacy:Operation=serde_json::from_value(serde_json::json!({"kind":"cutsceneCamera","point":point,"sourceSha256":"a".repeat(64)})).unwrap();assert!(matches!(&legacy,Operation::CutsceneCamera{append:false,..}));assert!(serde_json::to_value(legacy).unwrap().get("append").is_none());
    }

    #[test]
    fn native_start_pose_changes_only_requested_position_and_heading_with_degree_readback() {
        let before=ai_fields();let mut operation=start_edit();if let Operation::EncounterStartPosition{position,facing_radians,..}=&mut operation{*position=[1.,2.,3.];*facing_radians=Some(0.);}
        let args=operation.arguments_with_fields(Path::new("owned-tags"),"scnr","level.scenario",&before).unwrap();assert_eq!(args.iter().filter(|arg|arg.as_str()=="-S").count(),1);assert!(args.iter().any(|arg|arg.ends_with(".facing")));
        let after=before.replace("facing (90)","facing (0)");assert_eq!(reviewed_difference(&before,&after,&operation).unwrap().len(),1);operation.verify_readback(Path::new("owned-tags"),"scnr","level.scenario",&before,"0").unwrap();assert!(reviewed_difference(&before,&after.replace("return_state (alert)","return_state (guarding)"),&operation).is_err());
        if let Operation::EncounterStartPosition{facing_radians,..}=&mut operation{*facing_radians=Some(-std::f32::consts::FRAC_PI_2);}
        operation.verify_readback(Path::new("owned-tags"),"scnr","level.scenario",&before,"-90.000003").unwrap();assert!(operation.verify_readback(Path::new("owned-tags"),"scnr","level.scenario",&before,"-1.570796").is_err());
        let actual_type=before.replace("facing (90) angle","facing (90)                       angle (float32)");assert_eq!(scenario_squad_start_choices(&actual_type).unwrap()[0].starts.as_ref().unwrap()[0].facing_radians,Some(std::f32::consts::FRAC_PI_2));
        let absent=before.replace("                        facing (90) angle\n","");assert!(scenario_squad_start_choices(&absent).unwrap()[0].starts.as_ref().unwrap()[0].facing_radians.is_none());assert!(operation.arguments_with_fields(Path::new("owned-tags"),"scnr","level.scenario",&absent).is_err());
        assert!(scenario_squad_start_choices(&before.replace("facing (90) angle","facing (90) float32")).is_err());
        for value in [f32::NAN,f32::INFINITY,7.] {let mut invalid=operation.clone();if let Operation::EncounterStartPosition{facing_radians,..}=&mut invalid{*facing_radians=Some(value);}assert!(invalid.arguments_with_fields(Path::new("owned-tags"),"scnr","level.scenario",&before).is_err());}
        let legacy=serde_json::json!({"index":0,"position":[1.0,2.0,3.0]});let point:ScenarioStartChoice=serde_json::from_value(legacy.clone()).unwrap();assert!(point.facing_radians.is_none());assert_eq!(serde_json::to_value(point).unwrap(),legacy);
    }

}


#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct NativeDevicePlacement {
    pub class: String,
    pub index: u16,
    pub name_index: i16,
    pub name: String,
    pub tag_path: String,
    pub position: [f32; 3],
    pub rotation_radians: [f32; 3],
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usable_from_both_sides: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interaction_disabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub manual_activation: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub initially_off: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub initially_open: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub power_group: Option<i16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position_group: Option<i16>,
}
impl NativeDevicePlacement {
    fn array(&self)->&str{match self.class.as_str(){"ctrl"=>"controls","vehi"=>"vehicles",_=>"machines"}}
    fn valid(&self)->bool{["ctrl","mach","vehi"].contains(&self.class.as_str())&&(self.class=="ctrl"||(self.usable_from_both_sides.is_none()&&self.interaction_disabled.is_none()))
        && (self.class == "mach" || self.manual_activation.is_none())
        && (self.class != "vehi" || self.initially_off.is_none() && self.initially_open.is_none())
        && [self.power_group, self.position_group].into_iter().flatten().all(|group| self.class != "vehi" && (-1..128).contains(&group))&&self.index<4096&&(-1..512).contains(&self.name_index)&&self.name.len()<=32&&!self.name.chars().any(char::is_control)&&(self.name_index>=0||self.name.is_empty())&&!self.tag_path.is_empty()&&self.tag_path.len()<=240&&crate::safe_relative(&self.tag_path.replace('\\',"/")).is_ok()&&self.position.iter().all(|v|v.is_finite()&&v.abs()<=1e6)&&self.rotation_radians.iter().all(|v|v.is_finite()&&v.abs()<=20000.)}
    fn same_identity(&self,b:&Self)->bool{self.class==b.class&&self.index==b.index&&self.name_index==b.name_index&&self.name==b.name&&self.tag_path.replace('\\',"/").eq_ignore_ascii_case(&b.tag_path.replace('\\',"/"))}
    fn same_rotation(&self, other: &Self) -> bool {
        self.rotation_radians.iter().zip(other.rotation_radians).all(|(a, b)| facings_close(*a, b))
    }
}
fn native_index(fields:&str,key:&str)->Result<i16>{let n=number(fields,key)?;if n.fract()!=0.||n< -1.||n>65535.{return invalid("Invalid native placement index");}if n==65535.{Ok(-1)}else{i16::try_from(n as i64).map_err(|_|crate::SparkError::Invalid("Native placement index exceeds signed short".into()))}}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeDeviceGroupChoice {
    pub index: i16,
    pub name: String,
    pub initial_value: f32,
    pub change_once: bool,
    pub reserved: bool,
}

impl NativeDeviceGroupChoice {
    fn valid_at(&self, index: usize) -> bool {
        usize::try_from(self.index).ok() == Some(index)
            && self.name.len() <= 32 && !self.name.chars().any(char::is_control)
            && self.initial_value.is_finite() && self.reserved == extraction_device_binding(&self.name)
    }
}

/// Internal full Invader source listings, never displayed verbatim in the UI.
pub const MAX_SCENARIO_REVIEW_BYTES: usize = 32 * 1024 * 1024;

fn extraction_device_binding(name: &str) -> bool {
    name.to_ascii_lowercase().starts_with("extraction_")
}

pub fn scenario_device_group_choices(fields: &str) -> Result<Vec<NativeDeviceGroupChoice>> {
    let groups = factions::groups(fields)?;
    if groups.len() > 128 { return invalid("Native device group budget exceeded"); }
    groups.into_iter().enumerate().map(|(index, (name, initial_value, change_once))| {
        let group = NativeDeviceGroupChoice { index: index as i16, reserved: extraction_device_binding(&name),
            name, initial_value, change_once };
        if !group.valid_at(index) { return invalid("Invalid native device group"); }
        Ok(group)
    }).collect()
}

fn device_group_append_index(fields: &str, name: &str) -> Result<usize> {
    let groups = scenario_device_group_choices(fields)?;
    let index = groups.len();
    if index == 128 || groups.iter().any(|group| group.name.eq_ignore_ascii_case(name)) {
        return invalid("Choose a distinct device group name and keep the native inventory within 128 groups");
    }
    if scenario_device_choices(fields)?.iter().any(|device|
        [device.power_group, device.position_group].contains(&Some(index as i16))
    ) {
        return invalid("Appending at this index would activate an existing invalid device binding. Unbind or repair that placement first");
    }
    Ok(index)
}

fn reviewed_device_group_append(before: &str, after: &str, name: &str, value: f32, change_once: bool) -> Result<Vec<FieldDifference>> {
    let index = device_group_append_index(before, name)?;
    transport::preserved_arrays(before, after, &[("device_groups", 1)])?;
    let groups = scenario_device_group_choices(after)?;
    if !groups.get(index).is_some_and(|group| group.name == name
        && positions_close([group.initial_value, 0., 0.], [value, 0., 0.])
        && group.change_once == change_once) {
        return invalid("Appended native device group differs from its reviewed settings");
    }
    Ok(vec![FieldDifference {
        before: format!("{index} existing device groups"),
        after: format!("Append {name} at index {index} · initial value {value} · {}", if change_once {"change once"} else {"repeatable"}),
    }])
}

fn verify_device_groups_cache(expected: &[NativeDeviceGroupChoice], path: &Path, map: &crate::maps::MapInspection) -> Result<()> {
    let actual = crate::maps::scenario_logic_readback(path, map)?.groups;
    if expected.len() != actual.len() || expected.iter().zip(actual).any(|(group, row)|
        group.name != row.name || !positions_close([group.initial_value, 0., 0.], [row.initial_value, 0., 0.])
            || (row.flags & 1 != 0) != group.change_once
    ) {
        return invalid("Compiled device groups differ from the reviewed source inventory");
    }
    Ok(())
}

fn changed_device_wiring(fields: &str, original: &NativeDevicePlacement, desired: &NativeDevicePlacement)
    -> Result<Vec<(&'static str, i16)>>
{
    let changes = [("power_group", original.power_group, desired.power_group),
        ("position_group", original.position_group, desired.position_group)].into_iter()
        .filter_map(|(key, before, after)| after.filter(|value| Some(*value) != before).map(|value| (key, before, value)))
        .collect::<Vec<_>>();
    let changes_activation = [
        (original.manual_activation, desired.manual_activation),
        (original.initially_off, desired.initially_off),
        (original.initially_open, desired.initially_open),
    ].into_iter().any(|(before, after)| after.is_some() && before != after);
    if changes.is_empty() && !changes_activation { return Ok(vec![]); }
    let groups = scenario_device_group_choices(fields)?;
    let reserved = |value: i16| value >= 0 && groups.get(value as usize).is_some_and(|group| group.reserved);
    if extraction_device_binding(&original.name) ||
        [original.power_group, original.position_group].into_iter().flatten().any(reserved) {
        return invalid("Extraction-owned device wiring must stay with its mission editor");
    }
    changes.into_iter().map(|(key, before, value)| {
        if before.is_none() || value < -1 || value >= groups.len() as i16 || reserved(value) {
            return invalid("Choose an existing editable device group or Unbound");
        }
        Ok((key, value))
    }).collect()
}

fn device_group_field(root: &str, key: &str, first_line: usize) -> Result<(Option<i16>, Option<usize>)> {
    let line = root.lines().position(|line| line.starts_with(&format!("{key} (")));
    let Some(line) = line else { return Ok((None, None)); };
    Ok((Some(native_index(root, key)?), Some(first_line + line)))
}

fn device_flag(root: &str, key: &str, first_line: usize) -> Result<(Option<bool>, Option<usize>)> {
    let mut flags = root.lines().enumerate().filter_map(|(line, row)| {
        let mut fields = row.split_whitespace();
        (fields.next() == Some(key)).then_some((line, fields))
    });
    let Some((line, mut fields)) = flags.next() else { return Ok((None, None)); };
    let value = match (fields.next(), fields.next(), fields.next()) {
        (Some("(0)"), Some("bitfield"), None) => false,
        (Some("(1)"), Some("bitfield"), None) => true,
        _ => return invalid(format!("Invalid native device flag {key}")),
    };
    if flags.next().is_some() { return invalid(format!("Ambiguous native device flag {key}")); }
    Ok((Some(value), Some(first_line + line)))
}

pub fn scenario_device_choices(fields:&str)->Result<Vec<NativeDevicePlacement>>{Ok(native_device_fields(fields)?.into_iter().map(|row|row.0).collect())}
fn native_device_fields(fields:&str)->Result<Vec<(NativeDevicePlacement,[Option<usize>;9])>>{
    let names=array_listing(fields,"object_names")?;if names.count>512{return invalid("Native object name table exceeds512entries");}let names=array_items(&names,"object_names")?.iter().map(|row|native_name(&direct_struct_fields(row)?)).collect::<Result<Vec<_>>>()?;
    let mut result=vec![];
    for(array,palette,class,extension)in [("machines","machine_palette","mach","device_machine"),("controls","control_palette","ctrl","device_control"),("vehicles","vehicle_palette","vehi","vehicle")]{
        let inventory=array_listing(fields,array)?;let pal=array_listing(fields,palette)?;let refs=array_items(&pal,palette)?.iter().map(|row|native_name(&direct_struct_fields(row)?)).collect::<Result<Vec<_>>>()?;let mut line=inventory.start+1;
        for(index,item)in array_items(&inventory,array)?.into_iter().enumerate(){let root=direct_struct_fields(item)?;let palette_index=native_index(&root,"type")?;let name_index=native_index(&root,"name")?;let name=if name_index<0{String::new()}else{names.get(name_index as usize).cloned().ok_or_else(||crate::SparkError::Invalid("Native object name index missing".into()))?};
            let tag=usize::try_from(palette_index).ok().and_then(|i|refs.get(i)).and_then(|v|v.strip_suffix(&format!(".{extension}"))).ok_or_else(||crate::SparkError::Invalid("Native device palette reference is unavailable or has another class".into()))?;
            let (position, p) = native_vector(&root, "position")?;
            let (rotation, r) = native_vector(&root, "rotation")?;
            let (usable_from_both_sides, side_line) = if class == "ctrl" && root.lines().any(|row| row.split_whitespace().eq(["control_flags", "bitmask"])) {
                let (_, flags) = native_children(&root, "control_flags", "bitmask", 1)?;
                let (flag_line, field) = &flags[0];
                let enabled = match field.split_whitespace().collect::<Vec<_>>().as_slice() {
                    ["usable_from_both_sides", "(0)", "bitfield"] => false,
                    ["usable_from_both_sides", "(1)", "bitfield"] => true,
                    _ => return invalid("Native control-side flag is unavailable"),
                };
                (Some(enabled), Some(line + 1 + flag_line))
            } else {
                (None, None)
            };
            let (interaction_disabled, interaction_line) = if class == "ctrl" {
                device_flag(&root, "not_usable_from_any_side", line + 1)?
            } else { (None, None) };
            let (manual_activation, activation_line) = if class == "mach" {
                device_flag(&root, "does_not_operate_automatically", line + 1)?
            } else { (None, None) };
            let ((power_group, power_line), (position_group, position_line)) = if class == "vehi" {
                ((None, None), (None, None))
            } else {
                (device_group_field(&root, "power_group", line + 1)?, device_group_field(&root, "position_group", line + 1)?)
            };
            let ((initially_off, power_flag_line), (initially_open, position_flag_line)) = if class == "vehi" {
                ((None, None), (None, None))
            } else {
                (device_flag(&root, "initially_off", line + 1)?, device_flag(&root, "initially_open", line + 1)?)
            };
            let row = NativeDevicePlacement { class:class.into(), index:index as u16, name_index, name, tag_path:tag.replace('\\', "/"), position, rotation_radians:rotation.map(f32::to_radians), usable_from_both_sides, interaction_disabled, manual_activation, initially_off, initially_open, power_group, position_group };
            if !row.valid() { return invalid("Native device identity/pose is invalid"); }
            result.push((row, [Some(line + 1 + p), Some(line + 1 + r), side_line, power_line, position_line, interaction_line, activation_line, power_flag_line, position_flag_line]));
            line += item.len();
        }
    }Ok(result)
}
fn reviewed_device(before:&str,after:&str,desired:&NativeDevicePlacement)->Result<Vec<FieldDifference>>{
    let old = native_device_fields(before)?;
    let new = native_device_fields(after)?;
    if old.len() != new.len() { return invalid("Device edit changed native inventory"); }
    let index = old.iter().position(|(row, _)| row.class == desired.class && row.index == desired.index)
        .ok_or_else(|| crate::SparkError::Invalid("Native device missing".into()))?;
    let (original, lines) = &old[index];
    let (revised, new_lines) = &new[index];
    changed_device_wiring(before, original, desired)?;
    if !original.same_identity(desired) || !revised.same_identity(desired)
        || !positions_close(revised.position, desired.position) || !revised.same_rotation(desired)
        || revised.usable_from_both_sides != desired.usable_from_both_sides.or(original.usable_from_both_sides)
        || revised.interaction_disabled != desired.interaction_disabled.or(original.interaction_disabled)
        || revised.manual_activation != desired.manual_activation.or(original.manual_activation)
        || revised.initially_off != desired.initially_off.or(original.initially_off)
        || revised.initially_open != desired.initially_open.or(original.initially_open)
        || revised.power_group != desired.power_group.or(original.power_group)
        || revised.position_group != desired.position_group.or(original.position_group)
        || lines != new_lines {
        return invalid("Device readback differs from the reviewed identity, pose, activation or group bindings");
    }
    let before = before.lines().collect::<Vec<_>>();
    let after = after.lines().collect::<Vec<_>>();
    if before.len() != after.len() { return invalid("Device edit changed field structure"); }
    let mut differences = vec![];
    for (index, (a, b)) in before.iter().zip(&after).enumerate() {
        if a != b {
            if !lines.contains(&Some(index)) { return invalid("Device edit changed unrelated fields, flags, scripts or indices"); }
            differences.push(FieldDifference { before: (*a).into(), after: (*b).into() });
        }
    }
    if differences.is_empty() { return invalid("Device edit changed no fields"); }
    Ok(differences)
}
fn verify_devices_cache(expected:&[NativeDevicePlacement],path:&Path,map:&crate::maps::MapInspection)->Result<()> {
    // Old receipts cover devices only. New placement receipts also pin the
    // complete vehicle inventory without retroactively changing old coverage.
    let vehicles=expected.iter().any(|row|row.class=="vehi");
    let actual=if vehicles{crate::maps::scenario_placement_readback(path,map)?}else{crate::maps::scenario_logic_readback(path,map)?};
    let rows=actual.devices.iter().chain(actual.vehicles.iter().filter(|_|vehicles)).collect::<Vec<_>>();
    if rows.len()!=expected.len(){return invalid("Compiled native placement inventory differs from source");}
    for(a,b)in expected.iter().zip(rows){if a.class!=b.class||usize::from(a.index)!=b.index||a.name_index!=b.name_index||!a.tag_path.replace('\\',"/").eq_ignore_ascii_case(&b.tag_path.replace('\\',"/"))||!positions_close(a.position,b.position)||a.rotation_radians.iter().zip(b.rotation_radians).any(|(a,b)|!facings_close(*a,b))||a.usable_from_both_sides.is_some_and(|sides|Some(sides)!=b.usable_from_both_sides)||a.interaction_disabled.is_some_and(|disabled|Some(disabled)!=b.interaction_disabled)||a.manual_activation.is_some_and(|value|Some(value)!=b.manual_activation)||a.initially_off.is_some_and(|value|Some(value)!=b.initially_off)||a.initially_open.is_some_and(|value|Some(value)!=b.initially_open)||a.power_group.is_some_and(|group|Some(group)!=b.power_group)||a.position_group.is_some_and(|group|Some(group)!=b.position_group){return invalid("Compiled device identity, reference, pose, activation or group bindings differ from native source");}if a.name_index>=0{let name=actual.names.get(a.name_index as usize).ok_or_else(||crate::SparkError::Invalid("Compiled device name index unavailable".into()))?;if name.name!=a.name||name.object_type!=match a.class.as_str(){"ctrl"=>8,"vehi"=>1,_=>7}||name.object_index!=a.index as i16{return invalid("Compiled device name-table binding differs from source");}}}
    Ok(())
}

#[cfg(test)]
mod device_placement_tests {
 use super::*;
 fn fields()->String{concat!("object_names[1] array\n    object_names[0] struct\n        name (terminal) string\nvehicles[0] array\nvehicle_palette[0] array\nmachines[0] array\nmachine_palette[0] array\ncontrol_palette[1] array\n    control_palette[0] struct\n        name (devices/terminal.device_control) tagref\ncontrols[1] array\n    controls[0] struct\n        type (0) index\n        name (0) index\n        position (1,2,3) point3d (float32)\n        rotation (0,0,0) euler3d (float)\n        power_group (65535) index\n        position_group (65535) index\n        device_flags bitmask\n            initially_off (0) bitfield\nscripts[0] array\n").into()}
 #[test]
 fn native_devices_preserve_complete_identity_and_reject_unrelated_or_stale_changes(){
  let before=fields();let original=scenario_device_choices(&before).unwrap().remove(0);assert_eq!(original.name,"terminal");assert_eq!(original.tag_path,"devices/terminal");let mut desired=original.clone();desired.position=[2.,3.,4.];desired.rotation_radians=[0.,0.,std::f32::consts::FRAC_PI_2];let op=Operation::DevicePlacement{device:desired.clone(),source_sha256:"a".repeat(64)};op.validate("scnr","level.scenario").unwrap();let args=op.arguments_with_fields(Path::new("tags"),"scnr","level.scenario",&before).unwrap();assert!(args.windows(3).any(|row|row[0]=="-S"&&row[1]=="controls[0].position"&&row[2]=="2,3,4"));
  let after=before.replace("position (1,2,3)","position (2,3,4)").replace("rotation (0,0,0)","rotation (0,0,90)");assert_eq!(reviewed_difference(&before,&after,&op).unwrap().len(),2);op.verify_readback(Path::new("tags"),"scnr","level.scenario",&before,"2,3,4\n0,0,90\n").unwrap();assert!(op.verify_readback(Path::new("tags"),"scnr","level.scenario",&before,"2,3,4\n0,0,1.570796\n").is_err());
  for invalid in [after.replace("initially_off (0)","initially_off (1)"),after.replace("power_group (65535)","power_group (0)"),after.replace("name (terminal)","name (another)"),after.replace("name (devices/terminal.device_control)","name (devices/other.device_control)")]{assert!(reviewed_difference(&before,&invalid,&op).is_err());}
  let mut invalid=desired.clone();invalid.class="weap".into();assert!(!invalid.valid());invalid=desired.clone();invalid.position[0]=f32::NAN;assert!(!invalid.valid());invalid=desired.clone();invalid.name_index=-1;assert!(!invalid.valid());
  let snapshot=ScenarioSquadReadback{machine_settings:Default::default(),named_objects:None,cutscene_flags:None,extraction_squads:None,faction_kits:None,transports:None,command_lists:None,devices:Some(vec![desired]),device_groups:None,volumes:None,cameras:None,source_sha256:"a".repeat(64),squads:vec![],include_starts:false,combat:vec![]};snapshot.validate().unwrap();let mut bad=snapshot.clone();bad.devices.as_mut().unwrap().push(original);assert!(bad.validate().is_err());
 }
    #[test]
    fn device_wiring_writes_existing_groups_and_guards_reserved_bindings() {
        let before = fields() + concat!(
            "device_groups[3] array\n",
            "    device_groups[0] struct\n        name (door_power) string\n        initial_value (1) float\n        flags bitmask\n            can_change_only_once (0) bitfield\n",
            "    device_groups[1] struct\n        name (door_position) string\n        initial_value (0) float\n        flags bitmask\n            can_change_only_once (0) bitfield\n",
            "    device_groups[2] struct\n        name (extraction_spirit_called) string\n        initial_value (0) float\n        flags bitmask\n            can_change_only_once (0) bitfield\n",
        );
        let groups = scenario_device_group_choices(&before).unwrap();
        assert_eq!(groups[1].name, "door_position");
        assert!(groups[2].reserved);
        let mut device = scenario_device_choices(&before).unwrap().remove(0);
        assert_eq!((device.power_group, device.position_group), (Some(-1), Some(-1)));
        device.power_group = Some(0);
        device.position_group = Some(1);
        let op = |device| Operation::DevicePlacement { device, source_sha256: "a".repeat(64) };
        let tags = Path::new("tags");
        let args = op(device.clone()).arguments_with_fields(tags, "scnr", "level.scenario", &before).unwrap();
        assert_eq!(&args[2..8], ["-S", "controls[0].power_group", "0", "-S", "controls[0].position_group", "1"]);
        let after = before.replace("power_group (65535)", "power_group (0)").replace("position_group (65535)", "position_group (1)");
        assert_eq!(reviewed_difference(&before, &after, &op(device.clone())).unwrap().len(), 2);
        op(device.clone()).verify_readback(tags, "scnr", "level.scenario", &before, "0\n1\n").unwrap();
        assert!(reviewed_difference(&before, &after.replace("name (door_position)", "name (wrong)"), &op(device.clone())).is_err());
        for reserved in [before.replace("position_group (65535)", "position_group (2)"), before.replace("name (terminal)", "name (extraction_loadout)")] {
            let mut change = scenario_device_choices(&reserved).unwrap().remove(0);
            change.position_group = Some(1);
            assert!(op(change).arguments_with_fields(tags, "scnr", "level.scenario", &reserved).is_err());
        }
        for invalid in [2, 3] {
            device.position_group = Some(invalid);
            assert!(op(device.clone()).arguments_with_fields(tags, "scnr", "level.scenario", &before).is_err());
        }
    }

    #[test]
    fn device_group_append_preserves_indices_and_rejects_collisions() {
        let before = fields().replace("scripts[0] array", "device_groups[0] array\nscripts[0] array");
        let op = |name: &str, initial_value| Operation::DeviceGroupAppend {
            name: name.into(), initial_value, change_once: true, source_sha256: "a".repeat(64),
        };
        let operation = op("vehicle_gate", 0.375);
        let tags = Path::new("tags");
        let tag = "level.scenario";
        let appended = "device_groups[1] array\n    device_groups[0] struct\n        name (vehicle_gate) string\n        initial_value (0.375) float\n        flags bitmask\n            can_change_only_once (1) bitfield";
        let after = before.replace("device_groups[0] array", appended);
        assert_eq!(reviewed_difference(&before, &after, &operation).unwrap().len(), 1);
        operation.verify_readback(tags, "scnr", tag, &before, "vehicle_gate\n0.375000\n1\n").unwrap();
        for tampered in [
            after.replace("0.375", "0.5"),
            after.replace("can_change_only_once (1)", "can_change_only_once (0)"),
            after.replace("scripts[0] array", "scripts[1] array"),
        ] {
            assert!(reviewed_difference(&before, &tampered, &operation).is_err());
        }
        let chained = after.replace(appended, &appended.replacen("groups[1] array", "groups[2] array", 1))
            .replace("scripts[0] array", "    device_groups[1] struct\n        name (second_gate) string\n        initial_value (0) float\n        flags bitmask\n            can_change_only_once (1) bitfield\nscripts[0] array");
        let second = op("second_gate", 0.);
        assert!(reviewed_difference(&after, &chained, &second).is_ok());
        assert!(reviewed_difference(&after, &chained.replace("vehicle_gate", "edited_original"), &second).is_err());
        assert!(op("VEHICLE_GATE", 0.).arguments_with_fields(tags, "scnr", tag, &after).is_err());
        assert!(op("Extraction_gate", 0.).validate("scnr", tag).is_err());
        assert!(op("bad", f32::NAN).validate("scnr", tag).is_err());
        let dangling = before.replace("power_group (65535)", "power_group (0)");
        assert!(operation.arguments_with_fields(tags, "scnr", tag, &dangling).is_err());
    }

    #[test]
    #[ignore = "Requires an owned Danger Canyon CE cache and installed Invader, with disposable build storage"]
    fn wiring_readback_matches_an_actual_ce_compile() {
        let get_path = |key| std::path::PathBuf::from(std::env::var_os(key).expect(key));
        let original = get_path("SPARK_NATIVE_WIRING_MAP");
        let invader = get_path("SPARK_NATIVE_WIRING_INVADER");
        let generated = get_path("SPARK_GENERATED_ROOT");
        let playtest = std::env::var("SPARK_NATIVE_WIRING_PLAYTEST").as_deref() == Ok("1");
        assert!(!playtest || std::env::var_os("SPARK_NATIVE_WIRING_WIZARD").is_some());
        let root = tempfile::tempdir_in(&generated).unwrap();
        let tags = root.path().join("tags");
        let output = root.path().join("wired.map");
        std::fs::create_dir(&tags).unwrap();
        let tag = "levels/test/dangercanyon/dangercanyon.scenario";
        let original_tag_root = tags.to_str().unwrap();
        let banks = original.parent().unwrap().to_str().unwrap();
        let hash = |path: &Path| crate::maps::hash_file(path).unwrap();
        let original_hash = hash(&original);
        let run = |name: &str, args: &[&str]| {
            let result = std::process::Command::new(invader.join(format!("{name}.exe"))).args(args).output().unwrap();
            assert!(result.status.success(), "{name}: {}\n{}", String::from_utf8_lossy(&result.stdout), String::from_utf8_lossy(&result.stderr));
            String::from_utf8_lossy(&result.stdout).replace("\r\n", "\n")
        };
        run("invader-extract", &["-t", original_tag_root, "-m", banks, original.to_str().unwrap()]);
        let plan = crate::ce_source_recovery::review(&tags).unwrap();
        let corrected = crate::ce_source_recovery::create(&plan, &root.path().join("corrected"),
            std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)), |recipe| {
                let tool = match recipe.tool { crate::ce_source_recovery::Tool::Edit => "invader-edit",
                    crate::ce_source_recovery::Tool::Repair => "invader-bludgeon" };
                let args = recipe.args.iter().map(String::as_str).collect::<Vec<_>>();
                Ok(crate::ce_source_recovery::NativeRecord { recipe: recipe.clone(),
                    executable_sha256: hash(&invader.join(format!("{tool}.exe"))), stdout: run(tool, &args), stderr: String::new() })
            }).unwrap();
        crate::ce_source_recovery::verify(&corrected).unwrap();
        let tags = corrected.tags_directory;
        let tag_path = tags.join(tag);
        let tag_root = tags.to_str().unwrap();
        assert_eq!(run("invader-edit", &["-t", tag_root, "-C", "device_groups", tag]).trim(), "0");
        let unmodified_source = std::fs::read(&tag_path).unwrap();
        let unmodified_sha = hash(&tag_path);
        let fields = || run("invader-edit", &["-t", tag_root, "-L", tag]);
        for (name, initial_value, change_once) in [("wiring_power", 1., false), ("wiring_position", 0.25, false)] {
            let before = fields();
            let operation = Operation::DeviceGroupAppend { name: name.into(), initial_value, change_once, source_sha256: hash(&tag_path) };
            let write = operation.arguments_with_fields(&tags, "scnr", tag, &before).unwrap();
            run("invader-edit", &write.iter().map(String::as_str).collect::<Vec<_>>());
            assert_eq!(reviewed_difference(&before, &fields(), &operation).unwrap().len(), 1);
            let read = operation.readback_arguments(&tags, "scnr", tag, &before).unwrap().unwrap();
            let readback = run("invader-edit", &read.iter().map(String::as_str).collect::<Vec<_>>());
            operation.verify_readback(&tags, "scnr", tag, &before, &readback).unwrap();
        }
        let machine = std::env::var_os("SPARK_NATIVE_WIRING_WIZARD").map(|wizard| {
            let wizard = std::path::PathBuf::from(wizard);
            let donor_hash = hash(&wizard);
            let machine = "levels/test/wizard/devices/wiz_alert_light/wiz_alert_light.device_machine";
            run("invader-extract", &["-t", tag_root, "-m", banks, "-s", machine, "-r", wizard.to_str().unwrap()]);
            let machine_file = tags.join(machine);
            let listing = || run("invader-edit", &["-t", tag_root, "-L", machine]);
            let before = listing();
            let original_machine = std::fs::read(&machine_file).unwrap();
            let original_machine_hash = hash(&machine_file);
            let mut settings = native_machine_settings(&before).unwrap();
            assert_eq!(settings.machine_type, "gear");
            settings.machine_type = "platform".into();
            settings.position_acceleration_time = 0.125;
            let operation = Operation::MachineSettings { settings: settings.clone(), source_sha256: original_machine_hash.clone() };
            let write = operation.arguments_with_fields(&tags, "mach", machine, &before).unwrap();
            run("invader-edit", &write.iter().map(String::as_str).collect::<Vec<_>>());
            let revised = listing();
            assert_eq!(reviewed_difference(&before, &revised, &operation).unwrap().len(), 2);
            assert!(reviewed_difference(&before, &format!("{revised}\nextra (1) float32"), &operation).is_err());
            let read = operation.readback_arguments(&tags, "mach", machine, &before).unwrap().unwrap();
            operation.verify_readback(&tags, "mach", machine, &before,
                &run("invader-edit", &read.iter().map(String::as_str).collect::<Vec<_>>())).unwrap();
            let mounted = hash(&machine_file);
            assert_eq!(run("invader-edit", &["-t", tag_root, "-C", "machines", tag]).trim(), "0");
            run("invader-edit", &["-t", tag_root, "-I", "machine_palette", "1", "end",
                "-S", "machine_palette[0].name", machine, "-I", "machines", "1", "end",
                "-S", "machines[0].type", "0", "-S", "machines[0].name", "-1",
                "-S", "machines[0].position", "0.968243,55.121728,0.85713",
                "-S", "machines[0].power_group", "0", "-S", "machines[0].position_group", "1", tag]);
            let before_placement = fields();
            let mut placement = scenario_device_choices(&before_placement).unwrap().into_iter()
                .find(|row| row.class == "mach" && row.index == 0).unwrap();
            assert_eq!(placement.manual_activation, Some(false));
            placement.manual_activation = Some(true);
            if !playtest {
                assert_eq!((placement.initially_off, placement.initially_open), (Some(false), Some(false)));
                placement.initially_off = Some(true);
                placement.initially_open = Some(true);
            }
            let operation = Operation::DevicePlacement { device: placement, source_sha256: hash(&tag_path) };
            let write = operation.arguments_with_fields(&tags, "scnr", tag, &before_placement).unwrap();
            run("invader-edit", &write.iter().map(String::as_str).collect::<Vec<_>>());
            assert_eq!(reviewed_difference(&before_placement, &fields(), &operation).unwrap().len(), if playtest { 1 } else { 3 });
            let read = operation.readback_arguments(&tags, "scnr", tag, &before_placement).unwrap().unwrap();
            operation.verify_readback(&tags, "scnr", tag, &before_placement,
                &run("invader-edit", &read.iter().map(String::as_str).collect::<Vec<_>>())).unwrap();
            (wizard, donor_hash, machine, original_machine, original_machine_hash, mounted, settings)
        });
        if playtest {
            let listing = fields();
            let name_index = array_listing(&listing, "object_names").unwrap().count.to_string();
            run("invader-edit", &["-t", tag_root, "-n", "-I", "object_names", "1", "end",
                "-S", &format!("object_names[{name_index}].name"), "wiring_platform",
                "-S", "machines[0].name", &name_index, tag]);
            // Keep stock team/BSP and game filters. Position the fixture starts
            // on the approach verified in the companion loopback trial.
            let start_choices = scenario_player_start_choices(&listing).unwrap();
            assert!(!start_choices.is_empty());
            for start in start_choices {
                let before = fields();
                let (position, facing) = if start.index % 2 == 0 {
                    ([-2.429, 55.961, 0.272], -133_f32)
                } else {
                    ([0.068, 55.572, 0.206], -117_f32)
                };
                let operation = Operation::PlayerStartPosition { index: start.index, copy_from: None, position,
                    facing_radians: facing.to_radians(), source_sha256: hash(&tag_path) };
                let write = operation.arguments_with_fields(&tags, "scnr", tag, &before).unwrap();
                run("invader-edit", &write.iter().map(String::as_str).collect::<Vec<_>>());
                assert_eq!(reviewed_difference(&before, &fields(), &operation).unwrap().len(), 2);
            }
        }
        let source_sha256 = hash(&tag_path);
        let before = fields();
        let mut control = scenario_device_choices(&before).unwrap().into_iter()
            .find(|device| device.class == "ctrl" && device.index == 1).unwrap();
        let previous_position = control.position;
        if playtest {
            control.position = [0.068243, 54.741728, 0.72713];
        }
        let moved = !positions_close(previous_position, control.position);
        if playtest { println!("Fixture switch: {} {:?} -> {:?}", control.tag_path, previous_position, control.position); }
        assert_eq!((control.power_group, control.position_group), (Some(-1), Some(-1)));
        control.power_group = Some(0);
        control.position_group = Some(1);
        let previous_interaction_lock = control.interaction_disabled.expect("Native control interaction flag");
        control.interaction_disabled = Some(!previous_interaction_lock);
        let operation = Operation::DevicePlacement { device: control, source_sha256: source_sha256.clone() };
        let write = operation.arguments_with_fields(&tags, "scnr", tag, &before).unwrap();
        run("invader-edit", &write.iter().map(String::as_str).collect::<Vec<_>>());
        let after = fields();
        assert_eq!(reviewed_difference(&before, &after, &operation).unwrap().len(), 3 + usize::from(moved));
        let read = operation.readback_arguments(&tags, "scnr", tag, &before).unwrap().unwrap();
        let readback = run("invader-edit", &read.iter().map(String::as_str).collect::<Vec<_>>());
        operation.verify_readback(&tags, "scnr", tag, &before, &readback).unwrap();
        let revised_source = hash(&tag_path);
        run("invader-build", &["-t", tag_root, "-R", banks, "-r", "check", "-g", "gbx-custom",
            "-o", output.to_str().unwrap(), tag.strip_suffix(".scenario").unwrap()]);
        let cache = crate::maps::inspect_map(&output, Some(original.parent().unwrap())).unwrap();
        assert_eq!(cache.header.version, 609);
        if let Some((wizard, donor_hash, machine, original_machine, original_machine_hash, source_hash, expected)) = machine {
            let extracted = root.path().join("compiled-machine");
            std::fs::create_dir(&extracted).unwrap();
            run("invader-extract", &["-t", extracted.to_str().unwrap(), "-m", banks, "-s", machine, output.to_str().unwrap()]);
            let recovered = run("invader-edit", &["-t", extracted.to_str().unwrap(), "-L", machine]);
            assert!(expected.close(&native_machine_settings(&recovered).unwrap()));
            println!("Native machine platform compile: cache={} authoredTag={source_hash} recoveredTag={} originalTag={original_machine_hash} poweredTime={} poweredAcceleration={}",
                hash(&output), hash(&extracted.join(machine)), expected.position_transition_time, expected.position_acceleration_time);
            let machine_file = tags.join(machine);
            std::fs::write(&machine_file, original_machine).unwrap();
            assert_eq!(hash(&machine_file), original_machine_hash);
            assert_eq!(hash(&wizard), donor_hash);
        }
        let mut devices = scenario_device_choices(&after).unwrap();
        verify_devices_cache(&devices, &output, &cache).unwrap();
        if !playtest {
            if let Some(index) = devices.iter().position(|device| device.class == "mach") {
                assert_eq!((devices[index].initially_off, devices[index].initially_open), (Some(true), Some(true)));
                let mut expected = devices.clone();
                expected[index].initially_off = Some(false);
                assert!(verify_devices_cache(&expected, &output, &cache).is_err());
                expected[index].initially_off = Some(true);
                expected[index].initially_open = Some(false);
                assert!(verify_devices_cache(&expected, &output, &cache).is_err());
            }
        }
        devices.iter_mut().find(|device| device.class == "ctrl" && device.index == 1)
            .unwrap().interaction_disabled = Some(previous_interaction_lock);
        assert!(verify_devices_cache(&devices, &output, &cache).is_err());
        if let Some(platform) = devices.iter_mut().find(|device| device.class == "mach" && device.index == 0) {
            platform.manual_activation = Some(false);
            devices.iter_mut().find(|device| device.class == "ctrl" && device.index == 1)
                .unwrap().interaction_disabled = Some(!previous_interaction_lock);
            assert!(verify_devices_cache(&devices, &output, &cache).is_err());
            println!("Native switch: manual machine activation verified, repeatable position group at 0.25");
        }
        let mut groups = scenario_device_group_choices(&after).unwrap();
        verify_device_groups_cache(&groups, &output, &cache).unwrap();
        groups[1].change_once = true;
        assert!(verify_device_groups_cache(&groups, &output, &cache).is_err());
        println!("Native group authoring: original={original_hash} sourceBeforeGroups={unmodified_sha} sourceAfterGroups={source_sha256} revisedSource={revised_source} compiled={} power=0 position=1 interactionDisabled={}", hash(&output), !previous_interaction_lock);
        std::fs::write(&tag_path, unmodified_source).unwrap();
        assert_eq!(hash(&tag_path), unmodified_sha);
        assert_eq!(hash(&original), original_hash);
        if playtest {
            // Hand the verified fixture to the caller in the same disposable lease.
            let exported = generated.join("wired-playtest.map");
            crate::reject_links(&exported).unwrap();
            let mut destination = std::fs::OpenOptions::new().write(true).create_new(true).open(&exported).unwrap();
            std::io::copy(&mut std::fs::File::open(&output).unwrap(), &mut destination).unwrap();
            assert_eq!(hash(&exported), hash(&output));
        }
    }

    #[test]
    fn control_sides_use_only_the_selected_native_flag_and_preserve_legacy_pose_edits() {
        let before = fields().replace("scripts[0] array", "            not_usable_from_any_side (1) bitfield\n        control_flags bitmask\n            usable_from_both_sides (0) bitfield\nscripts[0] array");
        let mut device = scenario_device_choices(&before).unwrap().remove(0);
        assert_eq!(device.usable_from_both_sides, Some(false));
        assert_eq!(device.interaction_disabled, Some(true));
        device.usable_from_both_sides = Some(true);
        let tags = Path::new("tags");
        let op = Operation::DevicePlacement {device:device.clone(),source_sha256:"a".repeat(64)};
        let args = op.arguments_with_fields(tags, "scnr", "level.scenario", &before).unwrap();
        assert_eq!(&args[2..5], ["-S", "controls[0].control_flags.usable_from_both_sides", "1"]);
        assert_eq!(args.len(), 6);
        let after = before.replace("usable_from_both_sides (0)", "usable_from_both_sides (1)");
        assert_eq!(reviewed_difference(&before, &after, &op).unwrap().len(), 1);
        assert!(reviewed_difference(&before, &after.replace("initially_off (0)", "initially_off (1)"), &op).is_err());
        op.verify_readback(tags, "scnr", "level.scenario", &before, "1\n").unwrap();
        assert!(op.verify_readback(tags, "scnr", "level.scenario", &before, "0\n").is_err());
        assert!(op.arguments_with_fields(tags, "scnr", "level.scenario", &fields()).is_err());

        device.usable_from_both_sides = None;
        device.interaction_disabled = Some(false);
        let unlock = Operation::DevicePlacement {device:device.clone(),source_sha256:"a".repeat(64)};
        let args = unlock.arguments_with_fields(tags, "scnr", "level.scenario", &before).unwrap();
        assert_eq!(&args[2..5], ["-S", "controls[0].device_flags.not_usable_from_any_side", "0"]);
        let unlocked = before.replace("not_usable_from_any_side (1)", "not_usable_from_any_side (0)");
        assert_eq!(reviewed_difference(&before, &unlocked, &unlock).unwrap().len(), 1);
        assert!(reviewed_difference(&before, &unlocked.replace("initially_off (0)", "initially_off (1)"), &unlock).is_err());
        assert!(reviewed_difference(&before, &unlocked.replace("usable_from_both_sides (0)", "usable_from_both_sides (1)"), &unlock).is_err());
        unlock.verify_readback(tags, "scnr", "level.scenario", &before, "0\n").unwrap();
        assert!(unlock.arguments_with_fields(tags, "scnr", "level.scenario", &fields()).is_err());

        device.interaction_disabled = None;
        device.position[0] = 4.;
        let legacy = Operation::DevicePlacement {device,source_sha256:"a".repeat(64)};
        let local_move = before.replace("position (1,2,3)", "position (4,2,3)");
        assert_eq!(reviewed_difference(&before, &local_move, &legacy).unwrap().len(), 1);
        assert!(reviewed_difference(&before, &local_move.replace("usable_from_both_sides (0)", "usable_from_both_sides (1)"), &legacy).is_err());
    }
 #[test]
 fn native_vehicle_pose_reuses_the_existing_review_and_preserves_names_flags_and_other_placements(){
  let before=fields().replace("object_names[1] array","object_names[2] array").replace("vehicles[0] array\nvehicle_palette[0] array", "vehicles[1] array\n    vehicles[0] struct\n        type (0) index\n        name (1) index\n        position (7,8,9) point3d (float32)\n        rotation (0,0,0) euler3d (float)\n        body_vitality (1) float\n        team_index (0) enum\nvehicle_palette[1] array\n    vehicle_palette[0] struct\n        name (vehicles/pelican/pelican.vehicle) tagref").replace("vehicles[1] array","    object_names[1] struct\n        name (extraction_pelican) string\nvehicles[1] array");
  let inventory=scenario_device_choices(&before).unwrap();assert_eq!(inventory.len(),2);let mut vehicle=inventory.iter().find(|p|p.class=="vehi").unwrap().clone();assert_eq!(vehicle.name,"extraction_pelican");assert_eq!(vehicle.index,0);assert_eq!(vehicle.name_index,1);vehicle.position=[12.,15.,2.5];vehicle.rotation_radians=[std::f32::consts::FRAC_PI_4,0.,0.];
  let op=Operation::DevicePlacement{device:vehicle.clone(),source_sha256:"a".repeat(64)};op.validate("scnr","level.scenario").unwrap();let args=op.arguments_with_fields(Path::new("tags"),"scnr","level.scenario",&before).unwrap();assert!(args.windows(3).any(|a|a==["-S","vehicles[0].position","12,15,2.5"]));assert!(!args.iter().any(|a|a=="controls[0].position"));
  let after=before.replace("position (7,8,9)","position (12,15,2.5)").replacen("rotation (0,0,0)","rotation (45,0,0)",1);assert_eq!(reviewed_difference(&before,&after,&op).unwrap().len(),2);op.verify_readback(Path::new("tags"),"scnr","level.scenario",&before,"12,15,2.5\n45,0,0\n").unwrap();
  for changed in [after.replace("body_vitality (1)","body_vitality (0)"),after.replace("position (1,2,3)","position (9,2,3)"),after.replace("name (extraction_pelican)","name (another)"),after.replace("vehicles/pelican/pelican.vehicle","vehicles/other.vehicle")]{assert!(reviewed_difference(&before,&changed,&op).is_err());}
  let mut stale=vehicle;stale.name_index=0;assert!(Operation::DevicePlacement{device:stale,source_sha256:"a".repeat(64)}.arguments_with_fields(Path::new("tags"),"scnr","level.scenario",&before).is_err());
 }
 #[test]
 fn native_machine_pose_uses_its_own_array_and_preserves_control_inventory(){
  let before=fields().replace("machines[0] array\nmachine_palette[0] array\n","controls[0] array\ncontrol_palette[0] array\n").replace("control_palette[1]","machine_palette[1]").replace("    control_palette[0] struct","    machine_palette[0] struct").replace("devices/terminal.device_control","devices/door.device_machine").replace("controls[1] array\n    controls[0]","machines[1] array\n    machines[0]");let mut row=scenario_device_choices(&before).unwrap().remove(0);assert_eq!(row.class,"mach");row.position[0]=9.;let op=Operation::DevicePlacement{device:row,source_sha256:"a".repeat(64)};let after=before.replace("position (1,2,3)","position (9,2,3)");assert_eq!(reviewed_difference(&before,&after,&op).unwrap().len(),1);let args=op.arguments_with_fields(Path::new("tags"),"scnr","door.scenario",&before).unwrap();assert!(args.iter().any(|a|a=="machines[0].position"));assert!(!args.iter().any(|a|a=="controls[0].position"));

  let before = before.replace("device_flags bitmask\n            initially_off (0) bitfield",
     "device_flags bitmask\n            initially_off (0) bitfield\n        machine_flags bitmask\n            does_not_operate_automatically (0) bitfield\n            one_sided (0) bitfield") + "device_groups[0] array\n";
  let tags = Path::new("tags");
  let mut desired = scenario_device_choices(&before).unwrap().remove(0);
  assert_eq!(desired.manual_activation, Some(false));
  desired.manual_activation = Some(true);
  let changed = Operation::DevicePlacement { device: desired.clone(), source_sha256: "a".repeat(64) };
  let args = changed.arguments_with_fields(tags, "scnr", "door.scenario", &before).unwrap();
  assert_eq!(&args[2..5], ["-S", "machines[0].machine_flags.does_not_operate_automatically", "1"]);
  let after = before.replace("does_not_operate_automatically (0)", "does_not_operate_automatically (1)");
  assert_eq!(reviewed_difference(&before, &after, &changed).unwrap().len(), 1);
  changed.verify_readback(tags, "scnr", "door.scenario", &before, "1\n").unwrap();
  assert!(reviewed_difference(&before, &after.replace("one_sided (0)", "one_sided (1)"), &changed).is_err());
  assert!(changed.arguments_with_fields(tags, "scnr", "door.scenario", &before.replace("does_not_operate_automatically (0) bitfield", "unavailable (0) bitfield")).is_err());
  let protected = before.replace("name (terminal)", "name (extraction_door)");
  desired.name = "extraction_door".into();
  let reserved = Operation::DevicePlacement { device: desired, source_sha256: "a".repeat(64) };
  assert!(reserved.arguments_with_fields(tags, "scnr", "door.scenario", &protected).is_err());
 }
}

#[cfg(test)]
mod installed_device_inventory_test {
 use super::*;
 #[test]
 #[ignore="Requires explicitly selected legitimate native source and installed Invader; read-only"]
 fn existing_native_device_inventory_is_read_only(){
  let edit=std::env::var_os("SPARK_NATIVE_INVADER_EDIT").expect("Installed native tool required");let root=std::env::var_os("SPARK_NATIVE_DEVICE_SOURCE_ROOT").expect("Explicit source root required");let tag=std::env::var("SPARK_NATIVE_DEVICE_SOURCE_TAG").expect("Explicit scenario required");let file=Path::new(&root).join(&tag);let before=crate::maps::hash_file(&file).unwrap();let result=std::process::Command::new(edit).args(["-t",Path::new(&root).to_str().unwrap(),"-L",&tag]).output().unwrap();assert!(result.status.success());let fields=String::from_utf8(result.stdout).unwrap();let rows=scenario_device_choices(&fields).unwrap();assert!(rows.iter().any(|row|row.class=="ctrl"&&row.name=="extraction_loadout"));assert!(rows.iter().all(NativeDevicePlacement::valid));assert_eq!(crate::maps::hash_file(&file).unwrap(),before);println!("Actual native device rows={}, sourceSHA={before}, no writes",rows.len());
 }
}


#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct NativeTransportVehicle {
 pub name:String,pub tag_path:String,pub seats:Vec<String>,pub pilot_seats:Vec<String>,
 #[serde(skip_serializing_if="Option::is_none")] pub flight:Option<VehicleFlightTuning>,
 #[serde(skip_serializing_if="Option::is_none")] pub flight_issue:Option<String>,
}
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct NativeTransportChoices {pub vehicles:Vec<NativeTransportVehicle>,pub groups:Vec<String>,pub routes:Vec<String>,pub pilots:Vec<String>,pub script_created_pilots:Vec<String>,#[serde(skip_serializing_if="Vec::is_empty")]pub protected_groups:Vec<String>,pub pilot_bindings:Vec<NativeTransportPilotBinding>,#[serde(skip_serializing_if="Option::is_none")] pub flight_routes:Option<Vec<TransportFlightRoute>>}
/// Reuse the existing bounded Invader field inventory, never a second tag reader.
pub fn scenario_transport_choices(fields:&str)->Result<NativeTransportChoices>{
 let table=array_listing(fields,"object_names")?;if table.count>512{return invalid("Transport names exceed512entries");}
 let names=array_items(&table,"object_names")?.iter().map(|row|native_name(&direct_struct_fields(row)?)).collect::<Result<Vec<_>>>()?;
 let table=array_listing(fields,"vehicle_palette")?;if table.count>512{return invalid("Vehicle palette exceeds512entries");}
 let palette=array_items(&table,"vehicle_palette")?.iter().map(|row|native_name(&direct_struct_fields(row)?)).collect::<Result<Vec<_>>>()?;
 let table=array_listing(fields,"vehicles")?;if table.count>4096{return invalid("Vehicle source exceeds4096entries");}let mut vehicles=vec![];
 for row in array_items(&table,"vehicles")?{let root=direct_struct_fields(row)?;let index=native_index(&root,"name")?;
  let name=if index<0{continue}else{names.get(index as usize).ok_or_else(||crate::SparkError::Invalid("Vehicle name index is invalid".into()))?};
  if !["extraction_pelican","extraction_spirit"].contains(&name.as_str()){continue;}
  let index=native_index(&root,"type")?;let tag=usize::try_from(index).ok().and_then(|index|palette.get(index)).and_then(|path|path.strip_suffix(".vehicle")).ok_or_else(||crate::SparkError::Invalid("Transport vehicle palette reference is invalid".into()))?;
  safe_relative(&tag.replace('\\',"/"))?;if vehicles.iter().any(|v:&NativeTransportVehicle|v.name==*name){return invalid("Transport native vehicle name is ambiguous");}
  vehicles.push(NativeTransportVehicle{name:name.clone(),tag_path:tag.replace('\\',"/"),seats:vec![],pilot_seats:vec![],flight:None,flight_issue:None});
 }
 let table=array_listing(fields,"device_groups")?;if table.count>128{return invalid("Native device group budget exceeded");}
 let mut groups=vec![];let mut indices=std::collections::BTreeSet::new();
 for(index,row)in array_items(&table,"device_groups")?.iter().enumerate(){let root=direct_struct_fields(row)?;let name=native_name(&root)?;
  if !["extraction_pelican","extraction_spirit"].iter().any(|craft|["_boarded","_called","_landed"].iter().any(|suffix|name==format!("{craft}{suffix}"))){continue;}
  let trimmed=root.lines().map(str::trim).collect::<Vec<_>>().join("\n");
  if groups.contains(&name)||number(&root,"initial_value")?!=0.||number(&trimmed,"can_change_only_once")?!=0.{return invalid("Transport groups must be unique, initially zero and repeatable");}
  groups.push(name);indices.insert(index as i16);
 }
 for array in ["machines","controls"]{let table=array_listing(fields,array)?;for row in array_items(&table,array)?{let root=direct_struct_fields(row)?;for key in ["power_group","position_group"]{if indices.contains(&native_index(&root,key)?){return invalid("Transport groups must not drive device power or position");}}}}
 let routes=scenario_command_list_choices(fields)?.into_iter().filter(|route|route.commands>0).map(|route|route.name).collect();
 let squads=scenario_squad_start_choices(fields)?;let mut pilots=vec![];
 let has_start=|squad:&&ScenarioSquadChoice|squad.starts.as_ref().is_some_and(|starts|!starts.is_empty())||(squad.normal_count==0&&squad.insane_count==0);
 for squad in &squads{if squad.normal_count==1&&squad.insane_count==1&&has_start(&squad){pilots.push(format!("{}/{}",squad.encounter_name,squad.name));}}
 for name in squads.iter().map(|s|&s.encounter_name).collect::<std::collections::BTreeSet<_>>(){let rows=squads.iter().filter(|s|&s.encounter_name==name).collect::<Vec<_>>();if rows.iter().all(|s|s.normal_count>=0&&s.insane_count>=0&&has_start(s))&&rows.iter().map(|s|i32::from(s.normal_count)).sum::<i32>()==1&&rows.iter().map(|s|i32::from(s.insane_count)).sum::<i32>()==1{pilots.push(name.clone());}}
 let initial=native_mission_encounters(fields)?;let script_created_pilots=pilots.iter().filter(|pilot|{let name=pilot.split('/').next().unwrap();let matches=initial.iter().filter(|row|row.name==name).collect::<Vec<_>>();matches.len()==1&&!matches[0].initially_created}).cloned().collect();
 Ok(NativeTransportChoices{vehicles,groups,routes,pilots,script_created_pilots,protected_groups:vec![],pilot_bindings:vec![],flight_routes:None})
}

#[cfg(test)]mod mission_source_flags_tests {
 use super::*;
 #[test]fn mission_collection_choices_require_placed_native_weapons_and_check_every_loadout(){
  let fields=concat!("encounters[0] array\nobject_names[1] array\n    object_names[0] struct\n        name (technology) string\nweapon_palette[1] array\n    weapon_palette[0] struct\n        name (weapons/plasma pistol/plasma pistol.weapon) dependency\nweapons[2] array\n    weapons[0] struct\n        type (0) index\n        name (0) index\n        not_placed bitmask\n            automatically (1) bitfield\n            on_easy (0) bitfield\n            on_normal (0) bitfield\n            on_hard (0) bitfield\n            use_player_appearance (0) bitfield\n    weapons[1] struct\n        type (0) index\n        name (-1) index\n        not_placed bitmask\n            automatically (0) bitfield\n            on_easy (0) bitfield\n            on_normal (0) bitfield\n            on_hard (0) bitfield\n            use_player_appearance (0) bitfield\nplayer_starting_profile[2] array\n    player_starting_profile[0] struct\n        primary_weapon (weapons/assault rifle/assault rifle.weapon) dependency\n        secondary_weapon (null) dependency\n    player_starting_profile[1] struct\n        primary_weapon (weapons/pistol/pistol.weapon) dependency\n        secondary_weapon () dependency\n");
  let source=native_mission_source(fields).unwrap();assert!(source.encounters.is_empty());assert_eq!(source.weapons.len(),1);assert_eq!(source.weapons[0].placements,vec![0,1]);assert!(!source.weapons[0].starting_equipment);
  assert_eq!(source.weapons[0].objects[0].name.as_deref(),Some("technology"));assert!(source.weapons[0].objects[0].not_placed_automatically);assert!(source.weapons[0].objects[0].create_issue.is_none());assert!(source.weapons[0].objects[1].create_issue.is_some());
  assert!(native_mission_source(&fields.replace("name (0) index","name (999) index")).is_err());assert!(native_mission_source(&fields.replace("automatically (1)","automatically (2)")).is_err());assert!(native_mission_source(&fields.replace("automatically (1) bitfield","unknown_flag (1) bitfield")).is_err());
  let duplicate=native_mission_source(&fields.replace("name (-1) index","name (0) index")).unwrap();assert!(duplicate.weapons[0].objects.iter().all(|object|object.create_issue.is_some()));
  let grant=fields.replace("primary_weapon (weapons/pistol/pistol.weapon)","primary_weapon (weapons/plasma pistol/plasma pistol.weapon)");assert!(native_mission_source(&grant).unwrap().weapons[0].starting_equipment);
  assert!(native_mission_source(&fields.replace("type (0)","type (1)")).is_err());
  assert!(native_mission_source(&fields.replace("weapons/plasma pistol/plasma pistol.weapon","../unsafe.weapon")).is_err());
  assert!(native_mission_source(&fields.replace(".weapon)",".sound)")).is_err());
  assert!(native_mission_source(&fields.replace("secondary_weapon () dependency","")).is_err());
 }
 #[test]fn mission_activation_comes_from_the_actual_encounter_flag(){
  let fields="encounters[1] array\n    encounters[0] struct\n        name (be_marines) string\n        flags bitmask\n            not_initially_created (1) bitfield\n";
  let rows=native_mission_encounters(fields).unwrap();assert_eq!(rows[0].name,"be_marines");assert!(!rows[0].initially_created);assert!(!native_mission_encounters(&fields.replace("(1) bitfield","(1)     bitfield")).unwrap()[0].initially_created);assert!(native_mission_encounters(&fields.replace("(1) bitfield","(0) bitfield")).unwrap()[0].initially_created);
  assert!(native_mission_encounters(&fields.replace("not_initially_created","unknown")).is_err());assert!(native_mission_encounters(&fields.replace("(1) bitfield","(2) bitfield")).is_err());assert!(native_mission_encounters(&fields.replace("not_initially_created (1) bitfield","not_initially_created (1) bitfield\n            not_initially_created (0) bitfield")).is_err());
 }
}

#[cfg(test)]
mod player_start_tests {
 use super::*;
 fn fields()->String {"player_starting_locations[2] array\n    player_starting_locations[0] struct\n        position (1,2,3) point3d (float32)\n        facing (90) angle (float32)\n        team_index (0) int16\n        bsp_index (0) int16\n        type_0 (0) enum\n    player_starting_locations[1] struct\n        position (7,8,9) point3d (float32)\n        facing (0) angle (float32)\n        team_index (1) int16\n        bsp_index (0) int16\n        type_0 (0) enum\nscripts[0] array\n".into()}
 #[test]
 fn player_start_copy_appends_only_distinct_pose_and_restores_readback_scope() {
     let before=fields();
     let copy="    player_starting_locations[2] struct\n        position (4,5,6) point3d (float32)\n        facing (180) angle (float32)\n        team_index (1) int16\n        bsp_index (0) int16\n        type_0 (0) enum\n";
     let after=before.replacen("[2] array","[3] array",1).replace("scripts[0]",&format!("{copy}scripts[0]"));
     let op=Operation::PlayerStartPosition{index:2,copy_from:Some(1),position:[4.,5.,6.],
         facing_radians:std::f32::consts::PI,source_sha256:"a".repeat(64)};
     let tags=Path::new("tags");
     let args=op.arguments_with_fields(tags,"scnr","level.scenario",&before).unwrap();
     assert_eq!(&args[2..5],&["-c","player_starting_locations[1]","end"]);
     assert!(reviewed_difference(&before,&after,&op).is_ok());
     assert!(reviewed_difference(&before,&after.replace(copy,&copy.replace("team_index (1)","team_index (0)")),&op).is_err());
     assert!(reviewed_difference(&before,&after.replace("(1,2,3)","(2,2,3)"),&op).is_err());
     assert!(reviewed_difference(&before,&after.replace("scripts[0]","scripts[1]"),&op).is_err());
     op.verify_readback(tags,"scnr","level.scenario",&before,"4,5,6\n180\n").unwrap();
     let targets=[op.clone()];
     assert_eq!(current_combat_targets(&after,&"b".repeat(64),&targets).unwrap().len(),3);
     assert_eq!(current_combat_targets(&before,&"a".repeat(64),&targets).unwrap().len(),2);
     assert!(op.arguments_with_fields(tags,"scnr","level.scenario",&after).is_err());
     let mut overlap=op;
     if let Operation::PlayerStartPosition{position,..}=&mut overlap{*position=[1.,2.,3.];}
     assert!(overlap.arguments_with_fields(tags,"scnr","level.scenario",&before).is_err());
 }

 fn proposal()->Operation {Operation::PlayerStartPosition{index:0,copy_from:None,position:[4.,5.,6.],facing_radians:std::f32::consts::PI,source_sha256:"a".repeat(64)}}
 #[test]
 fn player_start_preserves_other_spawns_team_bsp_gametype_and_script_fields(){
  let before=fields();let rows=scenario_player_start_choices(&before).unwrap();assert_eq!(rows.len(),2);assert!(facings_close(rows[0].facing_radians.unwrap(),std::f32::consts::FRAC_PI_2));let op=proposal();let after=before.replace("position (1,2,3)","position (4,5,6)").replace("facing (90)","facing (180)");assert_eq!(reviewed_difference(&before,&after,&op).unwrap().len(),2);let args=op.arguments_with_fields(Path::new("tags"),"scnr","level.scenario",&before).unwrap();assert!(args.windows(3).any(|a|a==["-S","player_starting_locations[0].position","4,5,6"]));op.verify_readback(Path::new("tags"),"scnr","level.scenario",&before,"4,5,6\n180\n").unwrap();assert!(op.verify_readback(Path::new("tags"),"scnr","level.scenario",&before,"4,5,6\n3.141593\n").is_err());
  for bad in [after.replace("team_index (0)","team_index (1)"),after.replace("bsp_index (0)","bsp_index (1)"),after.replace("type_0 (0)","type_0 (1)"),after.replace("position (7,8,9)","position (0,0,0)"),after.replace("scripts[0] array","scripts[1] array")]{assert!(reviewed_difference(&before,&bad,&op).is_err());}
 }
 #[test]
 fn player_readback_scope_follows_current_source_after_restore_without_replaying_old_values(){
  let targets=[proposal(),proposal()];let current=current_combat_targets(&fields(),&"b".repeat(64),&targets).unwrap();assert_eq!(current.len(),1);assert!(matches!(&current[0],Operation::PlayerStartPosition{index:0,position,facing_radians,source_sha256,..}if *position==[1.,2.,3.]&&facings_close(*facing_radians,std::f32::consts::FRAC_PI_2)&&source_sha256==&"b".repeat(64)));let snapshot:ScenarioSquadReadback=serde_json::from_value(serde_json::json!({"sourceSha256":"b".repeat(64),"squads":[],"combat":current})).unwrap();snapshot.validate().unwrap();let mut stale=snapshot.clone();stale.source_sha256="a".repeat(64);assert!(stale.validate().is_err());
 }
 #[test]
 fn player_start_refuses_missing_indices_invalid_poses_and_noop_source(){
  let mut op=proposal();if let Operation::PlayerStartPosition{index,..}=&mut op{*index=2;}assert!(op.arguments_with_fields(Path::new("tags"),"scnr","level.scenario",&fields()).is_err());if let Operation::PlayerStartPosition{index,position,..}=&mut op{*index=0;position[0]=f32::NAN;}assert!(op.validate("scnr","level.scenario").is_err());assert!(proposal().validate("vehi","vehicle.vehicle").is_err());assert!(scenario_player_start_choices(&fields().replace("facing (90)","unknown_facing (90)")).is_err());assert!(reviewed_difference(&fields(),&fields(),&proposal()).is_err());
 }
}
