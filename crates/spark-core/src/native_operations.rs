//! Reviewed Invader command recipes and comparison of its native field output.
//! This is orchestration, not another native tag parser or tag schema.
use crate::{invalid, safe_relative, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest,Sha256};
use std::path::Path;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Operation {
    Dependencies,
    AppendEncounter { name:String, #[serde(rename="actorPath")] actor_path:String, position:[f32;3], #[serde(rename="startActive")] start_active:bool,
        #[serde(default="single_actor")] count:u16, #[serde(default="actor_spacing")] spacing:f32,
        #[serde(default,skip_serializing_if="Option::is_none")] difficulty:Option<EncounterDifficulty> },
    AppendEncounters { encounters:Vec<EncounterAppend>, #[serde(rename="sourceRules",default,skip_serializing_if="Option::is_none")] source_rules:Option<crate::firefight::FirefightConfig> },
    EncounterSquadCounts { encounter:u16,squad:u16,#[serde(rename="encounterName")] encounter_name:String,#[serde(rename="squadName")] squad_name:String,#[serde(rename="normalCount")] normal_count:u16,#[serde(rename="insaneCount")] insane_count:u16,#[serde(rename="sourceSha256")] source_sha256:String },
    EncounterSquadCountsBatch { edits:Vec<SquadCountEdit>,#[serde(rename="sourceSha256")] source_sha256:String },
    EncounterStartPosition {encounter:u16,squad:u16,start:u16,#[serde(rename="encounterName")] encounter_name:String,
        #[serde(rename="squadName")] squad_name:String,position:[f32;3],#[serde(rename="sourceSha256")] source_sha256:String,
        #[serde(rename="facingRadians",default,skip_serializing_if="Option::is_none")] facing_radians:Option<f32>},
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
    pub fn operation(&self)->Operation {Operation::AppendEncounter{name:self.name.clone(),actor_path:self.actor_path.clone(),position:self.position,start_active:self.start_active,count:self.count,spacing:self.spacing,difficulty:self.difficulty.clone()}}
}
fn single_actor()->u16{1}
fn actor_spacing()->f32{0.75}
impl Operation {
    pub fn is_squad_start_edit(&self)->bool{matches!(self,Self::EncounterStartPosition{..})}
    pub fn is_scenario_ai_edit(&self)->bool{self.is_squad_count_edit()||self.is_squad_start_edit()||self.combat_target_key().is_some()}
    pub fn combat_target_key(&self)->Option<(u8,u16,u16)>{match self{Self::EncounterSquadBehavior{encounter,squad,..}=>Some((2,*encounter,*squad)),Self::EncounterFiringPosition{encounter,point,..}=>Some((0,*encounter,*point)),Self::EncounterSquadFiringGroups{encounter,squad,..}=>Some((1,*encounter,*squad)),_=>None}}
    pub fn combat_encounter_name(&self)->Option<&str>{match self{Self::EncounterSquadBehavior{encounter_name,..}|Self::EncounterFiringPosition{encounter_name,..}|Self::EncounterSquadFiringGroups{encounter_name,..}=>Some(encounter_name),_=>None}}
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
            Self::AppendEncounter{name,actor_path,position,start_active,count,spacing,difficulty}=>Ok(vec![EncounterAppend{name:name.clone(),actor_path:actor_path.clone(),position:*position,start_active:*start_active,count:*count,spacing:*spacing,difficulty:difficulty.clone(),grid:None,starts:None,behavior:None,patrol:None,combat:None}]),
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
            Self::EncounterSquadBehavior { .. } | Self::EncounterFiringPosition { .. } | Self::EncounterSquadFiringGroups { .. } | Self::EncounterStartPosition { .. } | Self::EncounterSquadCounts { .. } | Self::EncounterSquadCountsBatch { .. } | Self::HudDuplicate { .. } | Self::BoundingRadius { .. } | Self::AppendEncounter { .. } | Self::AppendEncounters { .. } => "invaderNative",
            Self::LensFlareScaleRepair => "invaderRepair",
        }
    }
    pub fn field(&self) -> Option<&'static str> {
        match self {
            Self::Dependencies | Self::EncounterSquadBehavior { .. } | Self::EncounterFiringPosition { .. } | Self::EncounterSquadFiringGroups { .. } | Self::EncounterStartPosition { .. } | Self::EncounterSquadCounts { .. } | Self::EncounterSquadCountsBatch { .. } | Self::HudDuplicate { .. } | Self::AppendEncounter { .. } | Self::AppendEncounters { .. } => None,
            Self::BoundingRadius { .. } => Some("bounding_radius"),
            Self::LensFlareScaleRepair => Some("rotation_function_scale"),
        }
    }
    pub fn target(&self) -> Option<f64> {
        match self {
            Self::Dependencies | Self::EncounterSquadBehavior { .. } | Self::EncounterFiringPosition { .. } | Self::EncounterSquadFiringGroups { .. } | Self::EncounterStartPosition { .. } | Self::EncounterSquadCounts { .. } | Self::EncounterSquadCountsBatch { .. } | Self::HudDuplicate { .. } | Self::AppendEncounter { .. } | Self::AppendEncounters { .. } => None,
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
            Self::AppendEncounter {name,actor_path,position,count,spacing,difficulty,..} => {
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
                    if source_rules.is_some()&&(entry.difficulty.is_some()||entry.starts.is_some()||entry.behavior.is_some()||entry.patrol.is_some()||entry.combat.is_some()){return invalid("Prepared Firefight groups require the exact controller population, starting grid and actor states. Use Firefight wave rules rather than independent campaign overrides");}
                    entry.operation().validate(class,tag)?;
                    let _=entry.positions()?;
                    if !names.insert(entry.name.to_ascii_lowercase()){return invalid("Each appended encounter needs a distinct native name");}
                    total+=usize::from(entry.count);
                }
                if total>128{return invalid("One reviewed encounter group operation supports at most 128 starting locations");}
            }
            Self::EncounterSquadBehavior{encounter,squad,encounter_name,squad_name,behavior,source_sha256}=>{if class!="scnr"||*encounter>=128||*squad>=4096||[encounter_name,squad_name].iter().any(|n|n.len()>32||n.chars().any(char::is_control))||source_sha256.len()!=64||!source_sha256.bytes().all(|c|c.is_ascii_hexdigit()){return invalid("Native behavior needs exact source/squad identities");}behavior.validate()?;}
            Self::EncounterFiringPosition{encounter,point,encounter_name,position,group,source_sha256}=>{
                if class!="scnr"||*encounter>=128||*point>=512||encounter_name.len()>32||encounter_name.chars().any(char::is_control)||position.iter().any(|v|!v.is_finite()||v.abs()>1e6)||group.len()!=1||!group.as_bytes()[0].is_ascii_lowercase()||source_sha256.len()!=64||!source_sha256.bytes().all(|c|c.is_ascii_hexdigit()){return invalid("Firing-position editing needs exact native identity, finite XYZ and group A–Z");}
            }
            Self::EncounterSquadFiringGroups{encounter,squad,encounter_name,squad_name,groups,source_sha256}=>{
                if class!="scnr"||*encounter>=128||*squad>=4096||[encounter_name,squad_name].iter().any(|n|n.len()>32||n.chars().any(char::is_control))||source_sha256.len()!=64||!source_sha256.bytes().all(|c|c.is_ascii_hexdigit()){return invalid("Tactical-group editing needs exact native squad/source identities");}groups.masks()?;
            }
            Self::EncounterStartPosition{encounter,squad,start,encounter_name,squad_name,position,source_sha256,facing_radians}=>{
                if class!="scnr"||*encounter>=128||*squad>=4096||*start>=4096||
                    [encounter_name,squad_name].iter().any(|name|name.len()>32||name.chars().any(char::is_control))||
                    position.iter().any(|value|!value.is_finite()||value.abs()>1e6)||facing_radians.is_some_and(|value|!value.is_finite()||value.abs()>std::f32::consts::TAU+1e-6)||
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
            Self::EncounterSquadBehavior{..}|Self::EncounterFiringPosition{..}|Self::EncounterSquadFiringGroups{..}|Self::EncounterStartPosition{..}|Self::EncounterSquadCounts{..}|Self::EncounterSquadCountsBatch{..}=>return invalid("AI editing requires the original native encounter inventory"),
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
        if self.combat_target_key().is_some(){return combat_arguments(self,tags,tag,before);}
        if let Self::EncounterStartPosition{encounter,squad,start,encounter_name,squad_name,position,facing_radians,..}=self{
            let (row,point)=selected_native_start(before,*encounter,*squad,*start)?;
            if row.encounter_name!=*encounter_name||row.name!=*squad_name{return invalid("Native encounter/squad identity changed before start editing");}
            let heading_changed=if let Some(value)=facing_radians {let original=point.facing_radians.ok_or_else(||crate::SparkError::Invalid("Native starting facing is unavailable; only position editing is supported for this source".into()))?;!facings_close(original,*value)}else{false};
            let position_changed=!positions_close(point.position,*position);
            if !position_changed&&!heading_changed{return invalid("The AI starting position/facing already matches; no candidate was written");}
            let prefix=format!("encounters[{encounter}].squads[{squad}].starting_locations[{start}]");
            let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned()];
            if position_changed {args.extend(["-S".into(),format!("{prefix}.position"),position.map(|value|value.to_string()).join(",")]);}
            if heading_changed {args.extend(["-S".into(),format!("{prefix}.facing"),facing_radians.unwrap().to_string()]);}
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
        if let Self::EncounterStartPosition{position,..}|Self::EncounterFiringPosition{position,..}=self{return Ok(Some(vec![*position]));}
        if !self.is_encounter_append(){return Ok(None);}
        let mut positions=vec![];
        for entry in self.encounter_appends()? {positions.extend(entry.positions()?);}
        Ok(Some(positions))
    }
    /// Keep reviewed command actions intact while respecting Windows argument
    /// length. All batches edit the same isolated candidate; acceptance is atomic.
    pub fn argument_batches(&self,args:Vec<String>,readback:bool)->Result<Vec<Vec<String>>> {
        if !self.is_encounter_append()&&!self.is_scenario_ai_edit(){return Ok(vec![args]);}
        if args.len()<3||args[0]!="-t"{return invalid("Malformed native argument envelope");}
        let cost=|value:&str|value.encode_utf16().count()+value.chars().filter(|c|*c=='\\'||*c=='"').count()+3;
        let end=args.len()-1;let tag=args[end].clone();let base=args[..2].to_vec();
        let overhead=base.iter().map(|v|cost(v)).sum::<usize>()+cost(&tag);
        const LIMIT:usize=24000;
        if overhead>=LIMIT{return invalid("Native source path leaves no checked command-line capacity");}
        let mut result=vec![];let mut batch=base.clone();let mut used=overhead;let mut i=2;
        while i<end {
            let width=match(args[i].as_str(),readback){("-G",true)=>2,("-S",false)=>3,("-I",false)=>4,("-E",false)=>2,_=>return invalid("Unknown action in native encounter batch")};
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
        if !self.is_encounter_append()&&!self.is_scenario_ai_edit() {return Ok(None);}
        let written=self.arguments_with_fields(tags,class,tag,before)?;
        let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned()];let mut i=2;
        while i+1<written.len(){match written[i].as_str(){"-I"=>i+=4,"-S"=>{args.extend(["-G".into(),written[i+1].clone()]);i+=3;},_=>return invalid("Unexpected native append recipe")}}
        args.push(tag.into());Ok(Some(args))
    }
    pub fn verify_readback(&self,tags:&Path,class:&str,tag:&str,before:&str,output:&str)->Result<()> {
        let written=self.arguments_with_fields(tags,class,tag,before)?;
        let mut expected=vec![];let mut i=2;
        while i+1<written.len(){match written[i].as_str(){"-I"=>i+=4,"-S"=>{expected.push((&written[i+1],&written[i+2]));i+=3;},_=>return invalid("Unexpected native append recipe")}}
        let actual=output.lines().collect::<Vec<_>>();if actual.len()!=expected.len(){return invalid("Native encounter scalar readback count differs from the append recipe");}
        for ((key,value),actual) in expected.into_iter().zip(actual) {
            let same=if key.ends_with(".facing"){
                match(value.parse::<f32>(),actual.parse::<f32>()){(Ok(expected),Ok(degrees))=>facings_close(expected,degrees.to_radians()),_=>false}
            }else if key.ends_with(".position")||key.ends_with(".time")||key.ends_with(".weight") {
                let parse=|s:&str|s.split(',').map(|v|v.trim().parse::<f64>().ok().filter(|v|v.is_finite())).collect::<Option<Vec<_>>>();
                match(parse(value),parse(actual)){(Some(a),Some(b))=>a.len()==b.len()&&a.iter().zip(b).all(|(a,b)|(a-b).abs()<=0.000001f64.max(a.abs()*f64::from(f32::EPSILON)*2.)),_=>false}
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
    let Operation::AppendEncounter{name,actor_path,position,start_active,count,spacing,difficulty}=operation else{return invalid("Not an encounter append");};
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
    Ok(vec![FieldDifference{before:format!("encounters[{}] / actor_palette[{}]",old_encounters.count,old_palette.count),after:format!("encounters[{}] / actor_palette[{}]: {name} → {actor_path}",new_encounters.count,new_palette.count)+&format!(" at grid center {position:?}; actors={count}, spacing={spacing}; initial creation={start_active}")+&difficulty}])
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
        differences.push(FieldDifference{before:format!("No appended encounter at index{index}"),after:format!("{} → {}; center={:?}; actors={}, spacing={}; initial creation={}",entry.name,entry.actor_path,entry.position,entry.count,entry.spacing,entry.start_active)+&difficulty+&behavior+&patrol+&combat+if entry.starts.is_some(){"; individually authored XYZ/facing (including editor-hidden starts)"}else{""}});
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
        encounters.push(EncounterAppend{name:format!("gs_w{:02}_g{:02}",w+1,g+1),actor_path:enemy.actor_variant_path.clone(),position:layout.center,start_active:false,count:group.count,spacing:0.75,difficulty:None,grid:Some(EncounterGrid{total:layout.total as u16,offset:layout.offset as u16}),starts:None,behavior:None,patrol:None,combat:None});
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
        if let Self::EncounterStartPosition{encounter,squad,start,encounter_name,squad_name,position,facing_radians,..}=self{return verify_native_start(map,*encounter,*squad,*start,encounter_name,squad_name,*position,*facing_radians);}
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
    #[serde(default,skip_serializing_if="Vec::is_empty")] pub combat:Vec<Operation>,
    #[serde(default,skip_serializing_if="squad_positions_disabled")] pub include_starts:bool,
}
fn squad_positions_disabled(value:&bool)->bool{!*value}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ScenarioStartChoice {pub index:u16,pub position:[f32;3],
    #[serde(rename="facingRadians",default,skip_serializing_if="Option::is_none")] pub facing_radians:Option<f32>,
    #[serde(skip)] position_line:usize,#[serde(skip)] facing_line:Option<usize>}
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
        if self.source_sha256.len()!=64||!self.source_sha256.bytes().all(|c|c.is_ascii_hexdigit())||self.squads.len()>4096 {
            return invalid("Native squad readback needs an exact source SHA256 and bounded inventory");
        }
        if self.combat.len()>4096{return invalid("Native combat readback exceeds4096selected targets");}let mut targets=std::collections::BTreeSet::new();for op in &self.combat{let key=op.combat_target_key().ok_or_else(||crate::SparkError::Invalid("Unsupported combat readback operation".into()))?;if !targets.insert(key){return invalid("Duplicate native combat readback target");}op.validate("scnr","readback.scenario")?;let source=match op{Operation::EncounterSquadBehavior{source_sha256,..}|Operation::EncounterFiringPosition{source_sha256,..}|Operation::EncounterSquadFiringGroups{source_sha256,..}=>source_sha256,_=>unreachable!()};if !source.eq_ignore_ascii_case(&self.source_sha256){return invalid("Combat readback source identity differs from its snapshot");}}
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
                    if usize::from(point.index)!=index||point.position.iter().any(|value|!value.is_finite()||value.abs()>1e6)||point.facing_radians.is_some_and(|value|!value.is_finite()||value.abs()>20000.){
                        return invalid("Native starting-position inventory is incomplete or outside supported coordinates");
                    }
                }
            }
        }
        Ok(())
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
                    if !positions_close(point.position,actual.position)||point.facing_radians.is_some_and(|expected|!facings_close(expected,actual.facing)){return invalid("Compiled AI starting position/facing differs from the reviewed native source");}
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
fn squad_count_field(fields:&str,name:&str)->Result<(i16,usize)> {
    let value=number(fields,name)?;
    if value.fract()!=0.0||value<f64::from(i16::MIN)||value>f64::from(i16::MAX){return invalid("Native squad count is not an admitted signed short");}
    let line=fields.lines().position(|line|line.starts_with(&format!("{name} ("))).ok_or_else(||crate::SparkError::Invalid("Native squad count field is unavailable".into()))?;
    Ok((value as i16,line))
}
/// Current native-tool fields only. Array order, names, unknown values and
/// structural/script references are preserved; this does not interpret tag bytes.
pub fn scenario_squad_choices(fields:&str)->Result<Vec<ScenarioSquadChoice>> {scenario_squad_inventory(fields,false)}
pub fn scenario_squad_start_choices(fields:&str)->Result<Vec<ScenarioSquadChoice>> {scenario_squad_inventory(fields,true)}
fn native_position(fields:&str)->Result<([f32;3],usize)> {
    let values=fields.lines().enumerate().filter_map(|(index,line)|line.strip_prefix("position (").map(|tail|(index,tail))).collect::<Vec<_>>();
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
                    points.push(ScenarioStartChoice{index:index as u16,position,facing_radians,position_line:start_line+1+line,facing_line:facing_line.map(|line|start_line+1+line)});
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
pub struct ScenarioFiringSquadChoice {pub index:u16,pub name:String,pub groups:FiringGroups,#[serde(default,skip_serializing_if="Option::is_none")] pub behavior:Option<ScenarioSquadBehavior>,#[serde(default,skip_serializing_if="Option::is_none")] pub behavior_issue:Option<String>,#[serde(skip)] group_lines:Vec<Vec<usize>>}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ScenarioCombatChoice {pub encounter:u16,pub name:String,pub points:Vec<ScenarioFiringChoice>,pub squads:Vec<ScenarioFiringSquadChoice>}
pub const NATIVE_SOURCE_STATES:[&str;12]=["none","sleeping","alert","moving_repeat_same_position","moving_loop","moving_loop_back_and_forth","moving_loop_randomly","moving_randomly","guarding","guarding_at_guard_position","searching","fleeing"];
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ScenarioStartBehavior {pub index:u16,pub initial_state:String,pub return_state:String,#[serde(skip)] state_lines:Vec<Vec<usize>>}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ScenarioSquadBehavior {pub initial_state:String,pub return_state:String,pub starts:Vec<ScenarioStartBehavior>,pub patrol_count:usize,#[serde(skip)] state_lines:Vec<Vec<usize>>}
fn source_state(value:&str)->Result<u16>{NATIVE_SOURCE_STATES.iter().position(|v|*v==value).map(|i|i as u16).ok_or_else(||crate::SparkError::Invalid("Unknown native AI state".into()))}
fn source_state_route(value:&str,count:usize)->Result<()>{let state=source_state(value)?;let needed=match state{4..=6=>2,3|7=>1,_=>0};if count<needed{return invalid(format!("Native {value} requires at least{needed}authored patrol positions. Preserve/edit the route through its native source workflow first"));}Ok(())}
impl ScenarioSquadBehavior{
    fn validate(&self)->Result<()>{if self.starts.len()>4096||self.patrol_count>32{return invalid("Native behavior inventory exceeds its source bounds");}source_state(&self.initial_state)?;source_state(&self.return_state)?;for(i,p)in self.starts.iter().enumerate(){if usize::from(p.index)!=i{return invalid("Native behavior must preserve every starting-location index");}source_state(&p.initial_state)?;source_state(&p.return_state)?;}Ok(())}
    fn states(&self)->impl Iterator<Item=(&str,&str)> {std::iter::once((self.initial_state.as_str(),self.return_state.as_str())).chain(self.starts.iter().map(|p|(p.initial_state.as_str(),p.return_state.as_str())))}
}
fn native_state_field(fields:&str,name:&str,offset:usize)->Result<(String,Vec<usize>)>{let(_,children)=native_children(fields,name,"enum",12)?;let mut chosen=None;let mut lines=vec![];for(i,(line,text))in children.iter().enumerate(){let parts=text.split_whitespace().collect::<Vec<_>>();let state=NATIVE_SOURCE_STATES[i];if parts!=[state,"enum","value"]&&parts!=[state,"(*)","enum","value"]{return invalid("Native behavior enum formatting/choices are unsupported");}if parts.len()==4&&chosen.replace(state.to_string()).is_some(){return invalid("Native behavior has ambiguous selected state");}lines.push(offset+line);}Ok((chosen.ok_or_else(||crate::SparkError::Invalid("Native behavior state unavailable".into()))?,lines))}
fn native_squad_behavior(fields:&str,offset:usize)->Result<ScenarioSquadBehavior>{let(initial_state,initial)=native_state_field(fields,"initial_state",offset)?;let(return_state,return_lines)=native_state_field(fields,"return_state",offset)?;let patrol_count=array_listing(fields,"move_positions")?.count;if patrol_count>32{return invalid("Native patrol exceeds32positions");}let locations=array_listing(fields,"starting_locations")?;let mut start_line=offset+locations.start+1;let mut starts=vec![];for(i,item)in array_items(&locations,"starting_locations")?.iter().enumerate(){let fields=direct_struct_fields(item)?;let(initial_state,a)=native_state_field(&fields,"initial_state",start_line+1)?;let(return_state,b)=native_state_field(&fields,"return_state",start_line+1)?;starts.push(ScenarioStartBehavior{index:i as u16,initial_state,return_state,state_lines:vec![a,b]});start_line+=item.len();}Ok(ScenarioSquadBehavior{initial_state,return_state,starts,patrol_count,state_lines:vec![initial,return_lines]})}
const TACTICAL_FIELDS:[&str;6]=["attacking","attacking_search","attacking_guard","defending","defending_search","defending_guard"];
fn native_children(fields:&str,name:&str,kind:&str,count:usize)->Result<(usize,Vec<(usize,String)>)>{
    let lines=fields.lines().collect::<Vec<_>>();let matches=lines.iter().enumerate().filter(|(_,line)|!line.starts_with(char::is_whitespace)&&line.split_whitespace().eq([name,kind])).collect::<Vec<_>>();
    if matches.len()!=1{return invalid(format!("Native {name} {kind} is unavailable or ambiguous"));}let start=matches[0].0;let end=(start+1..lines.len()).find(|i|!lines[*i].starts_with(' ')).unwrap_or(lines.len());
    let mut children=vec![];for i in start+1..end{let text=lines[i].strip_prefix("    ").filter(|s|!s.starts_with(char::is_whitespace)).ok_or_else(||crate::SparkError::Invalid("Unknown native scalar children".into()))?;children.push((i,text.into()));}if children.len()!=count{return invalid(format!("Native {name} requires its exact {count}-choice inventory"));}Ok((start,children))
}
/// Read the installed native tool's field tree. No second tag-byte parser.
pub fn scenario_combat_choices(fields:&str)->Result<Vec<ScenarioCombatChoice>>{
    let encounters=array_listing(fields,"encounters")?;if encounters.count>128{return invalid("Native combat inventory exceeds128encounters");}let mut result=vec![];let mut encounter_line=encounters.start+1;let mut total_points=0;let mut total_squads=0;
    for(e,item)in array_items(&encounters,"encounters")?.iter().enumerate(){let root=direct_struct_fields(item)?;let firing=array_listing(&root,"firing_positions")?;total_points+=firing.count;if firing.count>512||total_points>4096{return invalid("Native firing inventory exceeds its bounded source capacity");}let mut points=vec![];let mut point_line=encounter_line+1+firing.start+1;
        for(i,item)in array_items(&firing,"firing_positions")?.iter().enumerate(){let fields=direct_struct_fields(item)?;let(position,line)=native_position(&fields)?;let(_,children)=native_children(&fields,"group_index","enum",26)?;let mut selected=None;let mut group_lines=vec![];for(bit,(line,text))in children.iter().enumerate(){let g=char::from(b'a'+bit as u8).to_string();let tokens=text.split_whitespace().collect::<Vec<_>>();if tokens!=[g.as_str(),"enum","value"]&&tokens!=[g.as_str(),"(*)","enum","value"]{return invalid("Unknown native firing-group enum");}if tokens.len()==4{if selected.replace(g).is_some(){return invalid("Ambiguous native firing group");}}group_lines.push(point_line+1+line);}points.push(ScenarioFiringChoice{index:i as u16,position,group:selected.ok_or_else(||crate::SparkError::Invalid("Native firing group is unavailable".into()))?,position_line:point_line+1+line,group_lines});point_line+=item.len();}
        let members=array_listing(&root,"squads")?;let mut squad_line=encounter_line+1+members.start+1;let mut squads=vec![];total_squads+=members.count;if total_squads>4096{return invalid("Native combat review exceeds4096squads");}
        for(i,item)in array_items(&members,"squads")?.iter().enumerate(){let fields=direct_struct_fields(item)?;let mut selections=vec![];let mut group_lines=vec![];for field in TACTICAL_FIELDS{let(_,children)=native_children(&fields,field,"bitmask",26)?;let mut values=vec![];let mut lines=vec![];for(bit,(line,text))in children.iter().enumerate(){let g=char::from(b'a'+bit as u8).to_string();let tokens=text.split_whitespace().collect::<Vec<_>>();if tokens.len()!=3||tokens[0]!=g||!matches!(tokens[1],"(0)"|"(1)")||tokens[2]!="bitfield"{return invalid("Unknown native tactical group field");}if tokens[1]=="(1)"{values.push(g);}lines.push(squad_line+1+line);}selections.push(values);group_lines.push(lines);}let mut values=selections.into_iter();let groups=FiringGroups{attacking:values.next().unwrap(),attacking_search:values.next().unwrap(),attacking_guard:values.next().unwrap(),defending:values.next().unwrap(),defending_search:values.next().unwrap(),defending_guard:values.next().unwrap()};let(behavior,behavior_issue)=match native_squad_behavior(&fields,squad_line+1){Ok(value)=>(Some(value),None),Err(issue)=>(None,Some(issue.to_string()))};squads.push(ScenarioFiringSquadChoice{index:i as u16,name:native_name(&fields)?,groups,group_lines,behavior,behavior_issue});squad_line+=item.len();}
        result.push(ScenarioCombatChoice{encounter:e as u16,name:native_name(&root)?,points,squads});encounter_line+=item.len();
    }Ok(result)
}
/// Refresh selected readback targets from current source after Accept or Restore.
/// Historical receipts select scope only; their old values are never replayed.
pub fn current_combat_targets(fields:&str,source_sha:&str,targets:&[Operation])->Result<Vec<Operation>>{
    if targets.is_empty(){return Ok(vec![]);}let rows=scenario_combat_choices(fields)?;let mut result=vec![];let mut seen=std::collections::BTreeSet::new();for old in targets{let key=old.combat_target_key().ok_or_else(||crate::SparkError::Invalid("Unknown combat readback target".into()))?;if !seen.insert(key){continue;}let row=rows.iter().find(|r|r.encounter==key.1).ok_or_else(||crate::SparkError::Invalid("Combat source encounter is unavailable".into()))?;if Some(row.name.as_str())!=old.combat_encounter_name(){return invalid("Combat source encounter identity changed");}let op=match old{Operation::EncounterFiringPosition{point,..}=>{let p=row.points.iter().find(|p|p.index==*point).ok_or_else(||crate::SparkError::Invalid("Combat source firing point is unavailable".into()))?;Operation::EncounterFiringPosition{encounter:row.encounter,point:*point,encounter_name:row.name.clone(),position:p.position,group:p.group.clone(),source_sha256:source_sha.into()}},Operation::EncounterSquadBehavior{squad,squad_name,..}=>{let member=row.squads.iter().find(|r|r.index==*squad).filter(|m|m.name==*squad_name).ok_or_else(||crate::SparkError::Invalid("Native behavior squad identity changed".into()))?;let behavior=member.behavior.clone().ok_or_else(||crate::SparkError::Invalid(member.behavior_issue.clone().unwrap_or_else(||"Native behavior unavailable".into())))?;Operation::EncounterSquadBehavior{encounter:row.encounter,squad:*squad,encounter_name:row.name.clone(),squad_name:member.name.clone(),behavior,source_sha256:source_sha.into()}},Operation::EncounterSquadFiringGroups{squad,squad_name,..}=>{let member=row.squads.iter().find(|r|r.index==*squad).filter(|m|m.name==*squad_name).ok_or_else(||crate::SparkError::Invalid("Combat source squad identity changed".into()))?;Operation::EncounterSquadFiringGroups{encounter:row.encounter,squad:*squad,encounter_name:row.name.clone(),squad_name:member.name.clone(),groups:member.groups.clone(),source_sha256:source_sha.into()}},_=>unreachable!()};result.push(op);}Ok(result)
}
fn combat_arguments(op:&Operation,tags:&Path,tag:&str,before:&str)->Result<Vec<String>>{
    let current=current_combat_targets(before,"",std::slice::from_ref(op))?.remove(0);let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned()];match(op,&current){
        (Operation::EncounterSquadBehavior{encounter,squad,behavior,..},Operation::EncounterSquadBehavior{behavior:old,..})=>{if behavior.starts.len()!=old.starts.len()||behavior.patrol_count!=old.patrol_count{return invalid("Native behavior cannot alter source start indices or patrol inventory");}let prefix=format!("encounters[{encounter}].squads[{squad}]");for(i,((a,b),(x,y)))in behavior.states().zip(old.states()).enumerate(){let target=if i==0{prefix.clone()}else{format!("{prefix}.starting_locations[{}]",i-1)};for(field,value,original)in[("initial_state",a,x),("return_state",b,y)]{if value!=original{source_state_route(value,behavior.patrol_count)?;args.extend(["-S".into(),format!("{target}.{field}"),value.into()]);}}}},
        (Operation::EncounterFiringPosition{encounter,point,position,group,..},Operation::EncounterFiringPosition{position:old,group:old_group,..})=>{let p=format!("encounters[{encounter}].firing_positions[{point}]");if !positions_close(*position,*old){args.extend(["-S".into(),format!("{p}.position"),position.map(|v|v.to_string()).join(",")]);}if group!=old_group{args.extend(["-S".into(),format!("{p}.group_index"),group.clone()]);}},
        (Operation::EncounterSquadFiringGroups{encounter,squad,groups,..},Operation::EncounterSquadFiringGroups{groups:old,..})=>{let expected=groups.masks()?;let prior=old.masks()?;for(i,field)in TACTICAL_FIELDS.iter().enumerate(){for bit in 0..26{let mask=1u32<<bit;if expected[i]&mask!=prior[i]&mask{args.extend(["-S".into(),format!("encounters[{encounter}].squads[{squad}].{field}.{}",char::from(b'a'+bit)),if expected[i]&mask!=0{"1"}else{"0"}.into()]);}}}},_=>return invalid("Unknown combat native operation")}
    if args.len()==2{return invalid("Native firing/tactical source already matches; no candidate was written");}args.push(tag.into());Ok(args)
}
fn verify_native_combat(op:&Operation,map:&crate::maps::MapInspection)->Result<()>{
    op.validate("scnr","readback.scenario")?;
    let(_,e,index)=op.combat_target_key().ok_or_else(||crate::SparkError::Invalid("Not a native combat edit".into()))?;let region=map.encounters.get(usize::from(e)).filter(|r|Some(r.name.as_str())==op.combat_encounter_name()).ok_or_else(||crate::SparkError::Invalid("Compiled combat encounter identity differs from source".into()))?;let details=region.details.as_ref().ok_or_else(||crate::SparkError::Invalid("Compiled combat telemetry unavailable".into()))?;match op{
        Operation::EncounterFiringPosition{position,group,..}=>{let p=details.firing_positions.get(usize::from(index)).ok_or_else(||crate::SparkError::Invalid("Compiled firing position unavailable".into()))?;if !positions_close(*position,p.position)||p.group_index!=u16::from(group.as_bytes()[0]-b'a'){return invalid("Compiled firing position/group differs from reviewed native source");}},
        Operation::EncounterSquadBehavior{squad_name,behavior,..}=>{let member=details.squads.get(usize::from(index)).filter(|s|s.name==*squad_name).ok_or_else(||crate::SparkError::Invalid("Compiled behavior squad identity differs".into()))?;if member.initial_state!=source_state(&behavior.initial_state)?||member.return_state!=source_state(&behavior.return_state)?||member.starting_locations.len()!=behavior.starts.len(){return invalid("Compiled squad behavior/start inventory differs from source");}let route=member.move_positions.as_ref().ok_or_else(||crate::SparkError::Invalid("Compiled patrol count unavailable".into()))?;if route.len()!=behavior.patrol_count{return invalid("Compiled patrol inventory differs from source");}for(p,n)in behavior.starts.iter().zip(&member.starting_locations){if n.initial_state!=source_state(&p.initial_state)?||n.return_state!=source_state(&p.return_state)?{return invalid("Compiled starting-location behavior differs from source");}}},
        Operation::EncounterSquadFiringGroups{squad_name,groups,..}=>{let squad=details.squads.get(usize::from(index)).filter(|s|s.name==*squad_name).ok_or_else(||crate::SparkError::Invalid("Compiled tactical squad identity differs".into()))?;let g=squad.firing_groups.as_ref().ok_or_else(||crate::SparkError::Invalid("Compiled tactical telemetry unavailable".into()))?;let actual=[g.attacking,g.attacking_search,g.attacking_guard,g.defending,g.defending_search,g.defending_guard];if groups.masks()?!=actual{return invalid(format!("Compiled tactical masks differ from reviewed native source: actual{actual:?}. Review target compiler search-group requirements; output was not accepted"));}},_=>return invalid("Not a native combat edit")};Ok(())
}
fn reviewed_combat(before:&str,after:&str,op:&Operation)->Result<Vec<FieldDifference>>{
    op.validate("scnr","readback.scenario")?;
    let(_,e,index)=op.combat_target_key().ok_or_else(||crate::SparkError::Invalid("Not a native combat edit".into()))?;let old=scenario_combat_choices(before)?;let new=scenario_combat_choices(after)?;let a=old.iter().find(|r|r.encounter==e).ok_or_else(||crate::SparkError::Invalid("Original combat encounter unavailable".into()))?;let b=new.iter().find(|r|r.encounter==e).filter(|r|Some(r.name.as_str())==op.combat_encounter_name()&&r.name==a.name).ok_or_else(||crate::SparkError::Invalid("Revised combat encounter identity changed".into()))?;let mut allowed=std::collections::BTreeSet::new();match op{
        Operation::EncounterFiringPosition{position,group,..}=>{let old=a.points.get(usize::from(index)).ok_or_else(||crate::SparkError::Invalid("Original firing point unavailable".into()))?;let new=b.points.get(usize::from(index)).ok_or_else(||crate::SparkError::Invalid("Revised firing point unavailable".into()))?;if old.position_line!=new.position_line||old.group_lines!=new.group_lines||!positions_close(*position,new.position)||*group!=new.group{return invalid("Revised firing point/structure differs from request");}if !positions_close(old.position,*position){allowed.insert(old.position_line);}if old.group!=*group{allowed.insert(old.group_lines[usize::from(old.group.as_bytes()[0]-b'a')]);allowed.insert(old.group_lines[usize::from(group.as_bytes()[0]-b'a')]);}},
        Operation::EncounterSquadBehavior{squad_name,behavior,..}=>{
            let old=a.squads.get(usize::from(index)).filter(|s|s.name==*squad_name).and_then(|s|s.behavior.as_ref()).ok_or_else(||crate::SparkError::Invalid("Original native behavior unavailable".into()))?;
            let new=b.squads.get(usize::from(index)).filter(|s|s.name==*squad_name).and_then(|s|s.behavior.as_ref()).ok_or_else(||crate::SparkError::Invalid("Revised native behavior unavailable".into()))?;
            if old.starts.len()!=new.starts.len()||old.starts.len()!=behavior.starts.len()||old.patrol_count!=new.patrol_count||old.patrol_count!=behavior.patrol_count{return invalid("Behavior edit changed native start/route inventory");}
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
fn selected_native_start(fields:&str,encounter:u16,squad:u16,start:u16)->Result<(ScenarioSquadChoice,ScenarioStartChoice)> {
    let row=scenario_squad_start_choices(fields)?.into_iter().find(|row|row.encounter==encounter&&row.squad==squad)
        .ok_or_else(||crate::SparkError::Invalid("Native AI squad is unavailable".into()))?;
    let point=row.starts.as_ref().and_then(|points|points.get(usize::from(start))).cloned()
        .ok_or_else(||crate::SparkError::Invalid("Native AI starting location is unavailable".into()))?;
    Ok((row,point))
}
fn verify_native_start(map:&crate::maps::MapInspection,encounter:u16,squad:u16,start:u16,encounter_name:&str,squad_name:&str,position:[f32;3],facing_radians:Option<f32>)->Result<()>{
    let region=map.encounters.get(usize::from(encounter)).ok_or_else(||crate::SparkError::Invalid("Compiled AI encounter is unavailable".into()))?;
    let member=region.details.as_ref().and_then(|details|details.squads.get(usize::from(squad)))
        .ok_or_else(||crate::SparkError::Invalid("Compiled AI squad is unavailable".into()))?;
    let point=member.starting_locations.get(usize::from(start)).ok_or_else(||crate::SparkError::Invalid("Compiled AI starting location is unavailable".into()))?;
    if region.name!=encounter_name||member.name!=squad_name||!positions_close(position,point.position)||facing_radians.is_some_and(|expected|!facings_close(expected,point.facing)){return invalid("Compiled AI starting position/identity differs from the reviewed edit");}
    Ok(())
}
fn reviewed_start_position(before:&str,after:&str,operation:&Operation)->Result<Vec<FieldDifference>>{
    let Operation::EncounterStartPosition{encounter,squad,start,encounter_name,squad_name,position,facing_radians,..}=operation else{return invalid("Not a native AI start edit");};
    let (old,original)=selected_native_start(before,*encounter,*squad,*start)?;let (new,revised)=selected_native_start(after,*encounter,*squad,*start)?;
    if old.encounter_name!=*encounter_name||new.encounter_name!=*encounter_name||old.name!=*squad_name||new.name!=*squad_name||
        original.position_line!=revised.position_line||original.facing_line!=revised.facing_line||!positions_close(revised.position,*position)||
        facing_radians.is_some_and(|expected|revised.facing_radians.is_none_or(|actual|!facings_close(expected,actual))){return invalid("Native AI starting pose or structure differs from the reviewed edit");}
    let mut allowed=std::collections::BTreeSet::new();
    if !positions_close(original.position,*position){allowed.insert(original.position_line);}
    if let Some(expected)=facing_radians {
        let old=original.facing_radians.ok_or_else(||crate::SparkError::Invalid("Native facing was unavailable before review".into()))?;
        if !facings_close(old,*expected){allowed.insert(original.facing_line.ok_or_else(||crate::SparkError::Invalid("Native facing field is unavailable".into()))?);}
    }
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
            position:[20.25,-8.5,4.125],source_sha256:before_sha.clone(),facing_radians:None};
        run(operation.arguments_with_fields(&tags,"scnr",tag,&before).unwrap());
        let after=fields();assert_eq!(reviewed_difference(&before,&after,&operation).unwrap().len(),1);
        let readback=run(operation.readback_arguments(&tags,"scnr",tag,&before).unwrap().unwrap());
        assert_eq!(readback.trim().split(',').map(|value|value.trim().parse::<f32>().unwrap()).collect::<Vec<_>>(),[20.25,-8.5,4.125]);
        let after_sha=crate::maps::hash_file(&file).unwrap();assert_ne!(before_sha,after_sha);
        ScenarioSquadReadback{combat:vec![],source_sha256:after_sha.clone(),squads:scenario_squad_start_choices(&after).unwrap(),include_starts:true}.validate().unwrap();
        let restore=Operation::EncounterStartPosition{encounter:1,squad:1,start:1,encounter_name:"original_1".into(),squad_name:"squad_1".into(),
            position:[1.,1.,1.],source_sha256:after_sha.clone(),facing_radians:None};
        run(restore.arguments_with_fields(&tags,"scnr",tag,&after).unwrap());assert_eq!(before,fields());
        let pose=|position:[f32;3],facing:f32|Operation::EncounterStartPosition{encounter:1,squad:1,start:1,encounter_name:"original_1".into(),squad_name:"squad_1".into(),position,source_sha256:crate::maps::hash_file(&file).unwrap(),facing_radians:Some(facing)};
        let rotation=pose([1.,1.,1.],-std::f32::consts::FRAC_PI_2);let args=rotation.arguments_with_fields(&tags,"scnr",tag,&before).unwrap();assert_eq!(args.iter().filter(|arg|arg.as_str()=="-S").count(),1);run(args);
        let rotated=fields();assert_eq!(reviewed_difference(&before,&rotated,&rotation).unwrap().len(),1);let native=run(rotation.readback_arguments(&tags,"scnr",tag,&before).unwrap().unwrap());rotation.verify_readback(&tags,"scnr",tag,&before,&native).unwrap();assert!(native.trim().parse::<f32>().unwrap()< -89.99);
        let combined=pose([2.,3.,4.],std::f32::consts::PI);run(combined.arguments_with_fields(&tags,"scnr",tag,&rotated).unwrap());let after_pose=fields();assert_eq!(reviewed_difference(&rotated,&after_pose,&combined).unwrap().len(),2);let read=run(combined.readback_arguments(&tags,"scnr",tag,&rotated).unwrap().unwrap());combined.verify_readback(&tags,"scnr",tag,&rotated,&read).unwrap();
        let original=pose([1.,1.,1.],std::f32::consts::FRAC_PI_4);run(original.arguments_with_fields(&tags,"scnr",tag,&after_pose).unwrap());assert_eq!(before,fields());assert_eq!(before_sha,crate::maps::hash_file(&file).unwrap());
        let original_bytes=fs::read(&file).unwrap();
        let inventory=scenario_combat_choices(&before).unwrap();let mut behavior=inventory[1].squads[1].behavior.clone().unwrap_or_else(||panic!("Native behavior inventory: {:?}",inventory[1].squads[1].behavior_issue));assert_eq!(behavior.initial_state,"none");assert_eq!(behavior.starts.len(),2);behavior.initial_state="sleeping".into();behavior.return_state="guarding".into();
        let only_squad=Operation::EncounterSquadBehavior{encounter:1,squad:1,encounter_name:"original_1".into(),squad_name:"squad_1".into(),behavior:behavior.clone(),source_sha256:before_sha.clone()};run(only_squad.arguments_with_fields(&tags,"scnr",tag,&before).unwrap());let squad_fields=fields();assert_eq!(reviewed_difference(&before,&squad_fields,&only_squad).unwrap().len(),4);assert!(scenario_combat_choices(&squad_fields).unwrap()[1].squads[1].behavior.as_ref().unwrap().starts.iter().all(|s|s.initial_state=="none"&&s.return_state=="none"));fs::write(&file,&original_bytes).unwrap();
        for p in &mut behavior.starts{p.initial_state=behavior.initial_state.clone();p.return_state=behavior.return_state.clone();}let mut all=only_squad.clone();if let Operation::EncounterSquadBehavior{behavior:value,..}=&mut all{*value=behavior.clone();}
        run(all.arguments_with_fields(&tags,"scnr",tag,&before).unwrap());let after=fields();assert_eq!(reviewed_difference(&before,&after,&all).unwrap().len(),12);assert!(reviewed_difference(&before,&after.replace("name (original_0)","name (wrong)"),&all).is_err());let scalar=run(all.readback_arguments(&tags,"scnr",tag,&before).unwrap().unwrap());all.verify_readback(&tags,"scnr",tag,&before,&scalar).unwrap();let sha=crate::maps::hash_file(&file).unwrap();let restored=current_combat_targets(&before,&before_sha,std::slice::from_ref(&all)).unwrap();if let Operation::EncounterSquadBehavior{behavior,..}=&restored[0]{assert_eq!(behavior.initial_state,"none");assert!(behavior.starts.iter().all(|s|s.return_state=="none"));}else{panic!("Wrong readback scope");}println!("Native squad/start behavior:3targets/6states; tagSHA={sha}; scalarSHA={}",crate::hex_bytes(Sha256::digest(scalar.as_bytes())));fs::write(&file,&original_bytes).unwrap();
        let mut moving=all.clone();if let Operation::EncounterSquadBehavior{behavior,..}=&mut moving{behavior.initial_state="moving_loop".into();}assert!(moving.arguments_with_fields(&tags,"scnr",tag,&before).is_err());let mut renumbered=all.clone();if let Operation::EncounterSquadBehavior{behavior,..}=&mut renumbered{behavior.starts[0].index=1;}assert!(renumbered.arguments_with_fields(&tags,"scnr",tag,&before).is_err());assert_eq!(before_sha,crate::maps::hash_file(&file).unwrap());
        let combat_inventory=scenario_combat_choices(&before).unwrap();assert_eq!(combat_inventory[1].points.len(),2);assert_eq!(combat_inventory[1].points[1].group,"z");
        let firing=Operation::EncounterFiringPosition{encounter:1,point:0,encounter_name:"original_1".into(),position:[7.,8.,9.],group:"b".into(),source_sha256:before_sha.clone()};run(firing.arguments_with_fields(&tags,"scnr",tag,&before).unwrap());let revised=fields();assert_eq!(reviewed_difference(&before,&revised,&firing).unwrap().len(),3);assert!(reviewed_difference(&before,&revised.replace("name (original_0)","name (changed)"),&firing).is_err());let read=run(firing.readback_arguments(&tags,"scnr",tag,&before).unwrap().unwrap());firing.verify_readback(&tags,"scnr",tag,&before,&read).unwrap();let firing_sha=crate::maps::hash_file(&file).unwrap();
        let groups=FiringGroups{attacking:vec!["a".into(),"z".into()],attacking_search:vec!["b".into()],attacking_guard:vec!["z".into()],defending:vec!["a".into()],defending_search:vec![],defending_guard:vec!["b".into(),"z".into()]};let tactical=Operation::EncounterSquadFiringGroups{encounter:1,squad:1,encounter_name:"original_1".into(),squad_name:"squad_1".into(),groups,source_sha256:firing_sha.clone()};for batch in tactical.argument_batches(tactical.arguments_with_fields(&tags,"scnr",tag,&revised).unwrap(),false).unwrap(){run(batch);}let final_fields=fields();assert_eq!(reviewed_difference(&revised,&final_fields,&tactical).unwrap().len(),7);let read=run(tactical.readback_arguments(&tags,"scnr",tag,&revised).unwrap().unwrap());tactical.verify_readback(&tags,"scnr",tag,&revised,&read).unwrap();let hash=crate::maps::hash_file(&file).unwrap();let targets=current_combat_targets(&final_fields,&hash,&[firing.clone(),tactical.clone()]).unwrap();let snapshot=ScenarioSquadReadback{source_sha256:hash.clone(),squads:scenario_squad_start_choices(&final_fields).unwrap(),include_starts:true,combat:targets};snapshot.validate().unwrap();let restored_targets=current_combat_targets(&before,&before_sha,&snapshot.combat).unwrap();assert!(matches!(&restored_targets[0],Operation::EncounterFiringPosition{position,group,..}if *position==[0.,0.,0.]&&group=="a"));assert!(matches!(&restored_targets[1],Operation::EncounterSquadFiringGroups{groups,..}if groups.masks().unwrap()==[0;6]));println!("Original native firing/tactics:pointSHA={firing_sha}; groupsSHA={hash}; scalarSHA={}; exact fields/restore scope verified",crate::hex_bytes(Sha256::digest(read.as_bytes())));fs::write(&file,&original_bytes).unwrap();assert_eq!(before_sha,crate::maps::hash_file(&file).unwrap());
        fs::create_dir_all(tags.join("actors")).unwrap();run(vec!["-t".into(),tags.to_string_lossy().into_owned(),"-N".into(),"actors/behavior.actor_variant".into()]);
        let states=[CampaignAiState::Sleeping,CampaignAiState::Alert,CampaignAiState::Guarding,CampaignAiState::Searching,CampaignAiState::Fleeing];
        let entries=states.iter().enumerate().map(|(i,state)|EncounterAppend{name:format!("behavior_{i}"),actor_path:"actors/behavior".into(),position:[i as f32,0.,0.],start_active:false,count:1,spacing:0.75,difficulty:None,grid:None,starts:None,behavior:Some(EncounterBehavior{initial_state:*state,return_state:states[states.len()-1-i]}),patrol:None,combat:None}).collect();
        let behavior=Operation::AppendEncounters{encounters:entries,source_rules:None};run(behavior.arguments_with_fields(&tags,"scnr",tag,&before).unwrap());let authored=fields();assert_eq!(reviewed_difference(&before,&authored,&behavior).unwrap().len(),5);let result=run(behavior.readback_arguments(&tags,"scnr",tag,&before).unwrap().unwrap());behavior.verify_readback(&tags,"scnr",tag,&before,&result).unwrap();let authored_sha=crate::maps::hash_file(&file).unwrap();
        // Restore only the generated fixture; production sources are never written by this test.
        fs::write(&file,original_bytes).unwrap();assert_eq!(before_sha,crate::maps::hash_file(&file).unwrap());
        println!("Native behavior fixture:5groups/all5initial+return states; authoredSHA={authored_sha}; scalarReadbackSHA={}",Sha256::digest(result.as_bytes()).iter().map(|b|format!("{b:02x}")).collect::<String>());
        let patrol_json=serde_json::json!({"name":"patrol_fixture","actorPath":"actors/behavior","position":[0,0,0],"startActive":false,"count":2,"behavior":{"initialState":"moving_loop","returnState":"moving_loop_back_and_forth"},"patrol":{"points":[{"id":"p0","position":[1,2,3],"facingRadians":0.0,"waitSeconds":[0.25,1.5],"weight":2.5},{"id":"p1","position":[4,5,3],"facingRadians":1.5707964,"waitSeconds":[0.0,0.0],"weight":1.0,"visible":false,"locked":true}]}});
        let entry:EncounterAppend=serde_json::from_value(patrol_json).unwrap();let patrol=Operation::AppendEncounters{encounters:vec![entry],source_rules:None};let prior=fs::read(&file).unwrap();run(patrol.arguments_with_fields(&tags,"scnr",tag,&before).unwrap());let after=fields();assert_eq!(reviewed_difference(&before,&after,&patrol).unwrap().len(),1);let values=run(patrol.readback_arguments(&tags,"scnr",tag,&before).unwrap().unwrap());patrol.verify_readback(&tags,"scnr",tag,&before,&values).unwrap();
        println!("Native patrol fixture:2ordered points/loop+back-and-forth/XYZ/facing/weight/wait; tagSHA={}; readbackSHA={}",crate::maps::hash_file(&file).unwrap(),crate::hex_bytes(Sha256::digest(values.as_bytes())));fs::write(&file,prior).unwrap();assert_eq!(before_sha,crate::maps::hash_file(&file).unwrap());
        let combat_json=serde_json::json!({"name":"combat_fixture","actorPath":"actors/behavior","position":[0,0,0],"startActive":false,"count":2,"combat":{"points":[{"id":"f0","position":[2,1,0.1],"group":"a"},{"id":"f1","position":[4,1,0.1],"group":"z","visible":false,"locked":true},{"id":"f2","position":[6,1,0.1],"group":"b"}],"groups":{"attacking":["a","z"],"attackingSearch":["b"],"attackingGuard":["z"],"defending":["a"],"defendingSearch":[],"defendingGuard":["b","z"]}}});
        let entry:EncounterAppend=serde_json::from_value(combat_json).unwrap();assert_eq!(entry.combat.as_ref().unwrap().groups.masks().unwrap(),[33554433,2,33554432,1,0,33554434]);let combat=Operation::AppendEncounters{encounters:vec![entry],source_rules:None};let prior=fs::read(&file).unwrap();for batch in combat.argument_batches(combat.arguments_with_fields(&tags,"scnr",tag,&before).unwrap(),false).unwrap(){run(batch);}let after=fields();assert_eq!(reviewed_difference(&before,&after,&combat).unwrap().len(),1);let mut values=vec![];for batch in combat.argument_batches(combat.readback_arguments(&tags,"scnr",tag,&before).unwrap().unwrap(),true).unwrap(){values.extend(run(batch).lines().map(str::to_owned));}let scalar=values.join("\n");combat.verify_readback(&tags,"scnr",tag,&before,&scalar).unwrap();println!("Native combat fixture:3independent firing points/2starts/6tactical contexts/high groupZ/empty selection; tagSHA={}; scalarSHA={}",crate::maps::hash_file(&file).unwrap(),crate::hex_bytes(Sha256::digest(scalar.as_bytes())));fs::write(&file,prior).unwrap();assert_eq!(before_sha,crate::maps::hash_file(&file).unwrap());
        println!("Native AI fixture:4squads/8starts; toolSHA={}; beforeSHA={before_sha}; afterSHA={after_sha}; restoredSHA={}",
            crate::maps::hash_file(&executable).unwrap(),crate::maps::hash_file(&file).unwrap());
    }

    fn ai_fields()->String {
        "actor_palette[0] array\nencounters[1] array\n    encounters[0] struct\n        name (original) tagstring\n        squads[1] array\n            squads[0] struct\n                name (squad_a) tagstring\n                normal_diff_count (1) int16\n                insane_diff_count (1) int16\n                starting_locations[1] array\n                    starting_locations[0] struct\n                        position (1,2,3) point3d\n                        facing (90) angle\n                return_state (alert) enum\nscript_marker (preserve) tagstring\n".into()
    }
    fn start_edit()->Operation {
        Operation::EncounterStartPosition{encounter:0,squad:0,start:0,encounter_name:"original".into(),squad_name:"squad_a".into(),
            position:[4.0,5.0,6.0],source_sha256:"a".repeat(64),facing_radians:None}
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
        let squad=EncounterSquad{name:"squad_a".into(),actor_palette_index:-1,actor_variant_tag_id:None,normal_count:1,insane_count:1,
            initial_state:2,return_state:2,firing_groups:None,move_positions:None,starting_locations:vec![AiStartingLocation{position:[1.0,2.0,3.0],facing:std::f32::consts::FRAC_PI_2,flags:0,
                initial_state:2,return_state:2,actor_palette_index:-1,actor_variant_tag_id:None,command_list:-1}]};
        let mut map=MapInspection{player_starting_profiles:None,header:MapHeader{version:609,engine:"unit fixture".into(),name:"unit".into(),
            build:String::new(),scenario_type:0,file_size:0,declared_size:0,tag_offset:0,tag_size:0,crc32:0,flags:0,demo_layout:false,
            compressed:false,extended:false,legacy_tag_size_repair:false},tag_checksum:None,sha256:"b".repeat(64),tags:vec![],objects:vec![],decals:vec![],
            mesh:MeshData::default(),render_mesh:None,model_meshes:Default::default(),encounters:vec![Encounter{name:"original".into(),squads:vec!["squad_a".into()],
                team:0,details:Some(EncounterDetails{flags:0,manual_bsp_index:-1,squads:vec![squad],firing_positions:vec![]})}],
            scripts:vec![],resources:vec![],diagnostics:vec![],scenario_path:"level".into()};
        let snapshot=ScenarioSquadReadback{combat:vec![],source_sha256:"a".repeat(64),squads:scenario_squad_start_choices(&ai_fields()).unwrap(),include_starts:true};
        snapshot.verify_map(&map).unwrap();
        map.encounters[0].details.as_mut().unwrap().squads[0].starting_locations[0].facing=0.;assert!(snapshot.verify_map(&map).is_err());
        map.encounters[0].details.as_mut().unwrap().squads[0].starting_locations[0].facing=std::f32::consts::FRAC_PI_2;
        map.encounters[0].details.as_mut().unwrap().squads[0].starting_locations[0].position[0]=9.0;
        assert!(snapshot.verify_map(&map).is_err());
        let legacy=ScenarioSquadReadback{combat:vec![],source_sha256:"a".repeat(64),squads:scenario_squad_choices(&ai_fields()).unwrap(),include_starts:false};
        let encoded=serde_json::to_value(&legacy).unwrap();assert!(encoded.get("includeStarts").is_none());
        serde_json::from_value::<ScenarioSquadReadback>(encoded.clone()).unwrap().verify_map(&map).unwrap();
        assert!(encoded.get("combat").is_none());let firing=Operation::EncounterFiringPosition{encounter:0,point:0,encounter_name:"original".into(),position:[4.,5.,6.],group:"z".into(),source_sha256:"a".repeat(64)};map.encounters[0].details.as_mut().unwrap().firing_positions.push(AiFiringPosition{position:[4.,5.,6.],group_index:25,cluster_index:-1,surface_index:0});firing.verify_compiled_encounter(&map).unwrap();map.encounters[0].details.as_mut().unwrap().firing_positions[0].group_index=0;assert!(firing.verify_compiled_encounter(&map).is_err());map.encounters[0].details.as_mut().unwrap().firing_positions[0].group_index=25;
        let groups=FiringGroups{attacking:vec!["z".into()],attacking_search:vec![],attacking_guard:vec![],defending:vec![],defending_search:vec![],defending_guard:vec![]};let tactical=Operation::EncounterSquadFiringGroups{encounter:0,squad:0,encounter_name:"original".into(),squad_name:"squad_a".into(),groups,source_sha256:"a".repeat(64)};assert!(tactical.verify_compiled_encounter(&map).is_err());map.encounters[0].details.as_mut().unwrap().squads[0].firing_groups=Some(SquadFiringGroups{attacking:33554432,attacking_search:0,attacking_guard:0,defending:0,defending_search:0,defending_guard:0});tactical.verify_compiled_encounter(&map).unwrap();let mut scoped=legacy.clone();scoped.combat=vec![firing.clone(),tactical];scoped.verify_map(&map).unwrap();scoped.combat.push(firing);assert!(scoped.validate().is_err());
        let behavior:ScenarioSquadBehavior=serde_json::from_value(serde_json::json!({"initialState":"alert","returnState":"alert","patrolCount":0,"starts":[{"index":0,"initialState":"alert","returnState":"alert"}]})).unwrap();let behavior_op=Operation::EncounterSquadBehavior{encounter:0,squad:0,encounter_name:"original".into(),squad_name:"squad_a".into(),behavior,source_sha256:"a".repeat(64)};assert!(behavior_op.verify_compiled_encounter(&map).is_err(),"unavailable route telemetry is not zero");map.encounters[0].details.as_mut().unwrap().squads[0].move_positions=Some(vec![]);behavior_op.verify_compiled_encounter(&map).unwrap();map.encounters[0].details.as_mut().unwrap().squads[0].starting_locations[0].initial_state=1;assert!(behavior_op.verify_compiled_encounter(&map).is_err());map.encounters[0].details.as_mut().unwrap().squads[0].starting_locations[0].initial_state=2;
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
            start_active: false, difficulty: None, count: 1, spacing: 1., grid: None, starts: None, behavior: None, patrol: None, combat: None,
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
