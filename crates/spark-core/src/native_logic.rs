//! Optional authoring metadata -> ordinary scenario references and HaloScript.
//! No custom native tag fields, engine extension, shell command or runtime VM.
use crate::{
    invalid,
    quickforge::{ForgeCommand, QuickForgeDocument},
    Result,
};
use serde::{Deserialize, Serialize};
use std::{borrow::Cow, collections::BTreeSet};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Document {
    pub schema_version: u32,
    pub triggers: Vec<Trigger>,
    pub devices: Vec<Device>,
    pub rules: Vec<Rule>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub manual_source: Option<String>,
    /// Original source modules are optional authoring metadata. Export writes
    /// ordinary sibling .hsc files, never fields inside an asset tag.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub handwritten_sources: Vec<HandwrittenSource>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HandwrittenSource {
    pub filename: String,
    pub content: String,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Trigger {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub native_name: Option<String>,
    pub id: String,
    pub name: String,
    pub position: [f32; 3],
    pub rotation: [f32; 3],
    pub dimensions: [f32; 3],
    pub visible: bool,
    pub locked: bool,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Device {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub native_name: Option<String>,
    pub placement_id: String,
    pub initial_position: f32,
    pub powered: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position_control_id: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Rule {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub once: bool,
    pub event: Event,
    pub actions: Vec<Action>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub condition: Option<Condition>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Event {
    Enter { trigger_id: String },
    Exit { trigger_id: String },
    Timer { seconds: f32 },
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Action {
    DevicePosition { target_id: String, value: f32 },
    DevicePower { target_id: String, value: f32 },
    AiVehicleLoad { target_id: String, encounter_name: String, seat: String },
    Delay { seconds: f32 },
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Condition {
    pub target_id: String,
    pub at_least: f32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRegion {
    pub rule_id: String,
    pub name: String,
    pub native_name: String,
    pub first_line: usize,
    pub last_line: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub filename: String,
    pub content: String,
    pub sha256: String,
    pub regions: Vec<SourceRegion>,
    pub manual: bool,
}

pub fn native_name(prefix: &str, id: &str) -> String {
    format!(
        "gs_{prefix}_{}",
        &crate::studio_native::digest(id.as_bytes())[..12]
    )
}
/// Native group names from the existing Forerunner transport contract.
pub fn transport_signal_groups(doc:&QuickForgeDocument)->Vec<String> {
    doc.placements.iter().filter(|p|p.transport_signals==Some(true)).flat_map(|p|
        p.native_name.as_deref().filter(|name|["extraction_pelican","extraction_spirit"].contains(name))
         .map(|name|vec![format!("{name}_boarded"),format!("{name}_called"),format!("{name}_landed")]).unwrap_or_default()).collect()
}
fn authored_name(value: &Option<String>) -> bool {
    value.as_ref().is_none_or(|name| {
        !name.is_empty() && name.len() <= 31 && !name.starts_with("gs_")
            && name.as_bytes()[0].is_ascii_lowercase()
            && name.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_')
    })
}
pub(crate) fn trigger_name(trigger: &Trigger) -> String {
    trigger.native_name.clone().unwrap_or_else(|| native_name("tv", &trigger.id))
}
fn device_name(logic: &Document, id: &str) -> String {
    logic.devices.iter().find(|d| d.placement_id == id).and_then(|d| d.native_name.clone())
        .unwrap_or_else(|| native_name("obj", id))
}
fn position_group_controls(logic: &Document) -> Vec<&Device> {
    let linked = logic.devices.iter().filter_map(|device| device.position_control_id.as_deref())
        .collect::<BTreeSet<_>>();
    logic.devices.iter().filter(|device| linked.contains(device.placement_id.as_str())).collect()
}

fn linked_position_group(binding: &Device, controls: &[&Device], offset: usize) -> i16 {
    let owner = binding.position_control_id.as_deref().unwrap_or(&binding.placement_id);
    controls.iter().position(|control| control.placement_id == owner).map_or(-1, |index| (offset + index) as i16)
}

fn text(value: &str, max: usize) -> bool {
    !value.is_empty() && value.len() <= max && !value.chars().any(char::is_control)
}
fn unit(value: f32) -> bool {
    value.is_finite() && (0.0..=1.0).contains(&value)
}
fn seconds(value: f32) -> bool {
    value.is_finite() && (0.0..=3600.0).contains(&value)
}
pub fn validate_handwritten_sources(sources: &[HandwrittenSource]) -> Result<()> {
    if sources.len() > 14 {
        return invalid("At most 14 handwritten source modules can accompany generated logic; the selected native target may permit fewer");
    }
    let mut names = BTreeSet::from(["gs_logic.hsc".to_owned(), "global_scripts.hsc".to_owned()]);
    for source in sources {
        let path = crate::safe_relative(&source.filename)?;
        let stem = source.filename.strip_suffix(".hsc").unwrap_or("");
        if path.components().count() != 1
            || stem.is_empty()
            || stem.len() > 31
            || !stem.bytes().all(|b| b.is_ascii() && !b.is_ascii_control())
            || !names.insert(source.filename.to_ascii_lowercase())
        {
            return invalid("Handwritten modules need unique plain .hsc filenames with a native name of 1–31 ASCII characters. gs_logic.hsc and global_scripts.hsc are reserved; no source is renamed automatically");
        }
        if source.content.is_empty()
            || source.content.len() > 1024 * 1024
            || source.content.bytes().any(|b| b == 0 || b > 127)
        {
            return invalid(format!("Handwritten source {} must contain ASCII text within 1 MiB; the selected target may allow less. Original bytes will not be silently converted", source.filename));
        }
    }
    Ok(())
}
fn crew_population(doc:&QuickForgeDocument,target:&str,encounter:&str,seat:&str)->Result<usize>{
 if doc.native.is_some()||doc.game_mode!="campaign"||!matches!(doc.runtime_id,crate::runtime::RuntimeId::MccSteam|crate::runtime::RuntimeId::HaloCustomEdition|crate::runtime::RuntimeId::ChupathingyCe){return invalid("AI seating requires editable native Campaign source");}
 let vehicle=doc.placements.iter().find(|p|p.id==target&&p.tag_class=="vehi").ok_or_else(||crate::SparkError::Invalid("AI seating vehicle is missing".into()))?;
 if vehicle.native_name.is_none(){return invalid("AI seating vehicle needs a native scenario name");}
 if seat.is_empty()||seat.len()>31||seat.trim().is_empty()||seat.bytes().any(|b|!(32..=126).contains(&b)||b==b'"'||b==b'\\'){return invalid("AI seat text must be1–31 printable ASCII characters without quotes/backslashes");}
 if encounter.is_empty()||encounter.len()>31||!encounter.as_bytes()[0].is_ascii_alphabetic()&&encounter.as_bytes()[0]!=b'_'||!encounter.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'_'){return invalid("AI seating needs an exact native encounter identifier");}
 let group=doc.campaign_encounters.iter().find(|g|g.name==encounter).ok_or_else(||crate::SparkError::Invalid("AI seating encounter is missing; its original spawning owner must create it".into()))?;
 let normal=group.difficulty.as_ref().map(|d|d.normal).unwrap_or(group.count);let insane=group.difficulty.as_ref().map(|d|d.insane).unwrap_or(group.count);
 if group.count==0||group.count>32||normal>group.count||insane>group.count||normal==0||insane==0{return invalid("AI seating encounter must have actors on every difficulty");}Ok(normal.max(insane) as usize)
}
/// Compare authored AI seating with independently read native seat labels.
pub fn verify_vehicle_crew_seats(doc:&QuickForgeDocument,vehicle_id:&str,labels:&[String])->Result<()> {
 validate(doc)?;if labels.len()>16{return invalid("Native vehicle exceeds16seats");}
 let mut reserved=BTreeSet::new();
 for rule in doc.logic.iter().flat_map(|l|&l.rules).filter(|r|r.enabled){for action in &rule.actions{if let Action::AiVehicleLoad{target_id,encounter_name,seat}=action{if target_id!=vehicle_id{continue;}
  let required=crew_population(doc,target_id,encounter_name,seat)?;
  let matches=labels.iter().enumerate().filter_map(|(i,label)|label.contains(seat).then_some(i)).collect::<Vec<_>>();
  if matches.len()<required{return invalid(format!("AI encounter {encounter_name} needs {required} seats matching '{seat}'. Available native labels: {}. No vehicle tag was changed",labels.join(", ")));}
  for i in matches{if !reserved.insert(i){return invalid("Enabled AI seating connections overlap the same vehicle seats. Use distinct labels or combine the crew into one encounter; no source was changed");}}
 }}}Ok(())
}
pub fn validate(doc: &QuickForgeDocument) -> Result<()> {
    if let Some(profile)=crate::quickforge::campaign_profile(doc) {
        crate::firefight::native_player_profile_arguments(profile,0,crate::quickforge::CAMPAIGN_PROFILE_NAME)?;
        if doc.logic.as_ref().is_some_and(|logic|logic.manual_source.is_some()) {
            return invalid("Campaign starting loadout needs generated startup logic. Preserve handwritten HaloScript separately and explicitly return to generated logic before enabling the loadout");
        }
    }
    let effective=effective_logic(doc);
    let Some(logic)=effective.as_deref() else{return Ok(());};
    if doc.placements.iter().any(|p|p.native_name.is_some()&&(p.tag_class!="vehi"||doc.native.is_some()||crate::quickforge::native_scenario_type(doc)!=0||!authored_name(&p.native_name))) {
        return invalid("Native placement names require editable solo vehicle source and lowercase identifiers of 1–31 characters; gs_ is reserved");
    }
    if doc.placements.iter().any(|p|p.transport_signals==Some(true)&&(p.tag_class!="vehi"||doc.native.is_some()||crate::quickforge::native_scenario_type(doc)!=0||
        !matches!(p.native_name.as_deref(),Some("extraction_pelican"|"extraction_spirit"))||logic.manual_source.is_some())) {
        return invalid("Transport signals need a uniquely named Pelican or Spirit in generated editable solo source; handwritten modules are preserved");
    }
    if logic.devices.len()+doc.placements.iter().filter(|p|p.native_name.is_some()).count()>512 {
        return invalid("Native scenario object name limit512 reached; no bindings were dropped");
    }
    if logic.schema_version != 1
        || logic.triggers.len() > 64
        || logic.devices.len() > 64
        || logic.rules.len() > 32
    {
        return invalid(
            "Logic / Events supports schema 1, 64 triggers/devices and 32 rules per level",
        );
    }
    let mut ids: BTreeSet<&str> = doc
        .geometry
        .iter()
        .map(|v| v.id.as_str())
        .chain(doc.placements.iter().map(|v| v.id.as_str()))
        .chain(doc.spawns.iter().map(|v| v.id.as_str()))
        .chain(doc.objectives.iter().map(|v| v.id.as_str()))
        .collect();
    if let Some(workshop) = &doc.workshop {
        ids.extend(workshop.brushes.iter().map(|v| v.id.as_str()));
    }
    let mut names: BTreeSet<String> = ["gs_logic_ready".to_owned(), "gs_logic_init".to_owned()]
        .into_iter().chain(logic.rules.iter().map(|r| native_name("evt", &r.id))).collect();
    for placement in doc.placements.iter().filter(|p|p.native_name.is_some()) {
        if !names.insert(placement.native_name.clone().unwrap()){return invalid("Native vehicle, device and trigger names must be unique");}
    }
    for trigger in &logic.triggers {
        if !authored_name(&trigger.native_name) || !names.insert(trigger_name(trigger)) {
            return invalid("Native trigger names must be unique ASCII identifiers of 1–31 lowercase characters; gs_ is reserved");
        }
        if !text(&trigger.id, 72)
            || !ids.insert(&trigger.id)
            || !text(&trigger.name, 160)
            || trigger
                .position
                .iter()
                .any(|v| !v.is_finite() || v.abs() > 1500.)
            || trigger
                .rotation
                .iter()
                .any(|v| !v.is_finite() || v.abs() > 628.)
            || trigger.rotation[0].abs() > 0.00001
            || trigger.rotation[1].abs() > 0.00001
            || trigger
                .dimensions
                .iter()
                .any(|v| !v.is_finite() || !(0.1..=128.).contains(v))
        {
            return invalid(
                "Trigger volumes need unique identities, finite transforms and dimensions 0.1–128",
            );
        }
    }
    let mut devices = BTreeSet::new();
    for binding in &logic.devices {
        if !authored_name(&binding.native_name) || !names.insert(device_name(logic, &binding.placement_id)) {
            return invalid("Native device names must be unique ASCII identifiers of 1–31 lowercase characters; gs_ is reserved");
        }
        if !devices.insert(binding.placement_id.as_str())
            || !unit(binding.initial_position)
            || !doc
                .placements
                .iter()
                .any(|p| p.id == binding.placement_id && ["mach", "ctrl"].contains(&p.tag_class.as_str()))
        {
            return invalid("A logic device must reference one existing device_machine or device_control placement with position 0–1");
        }
    }
    for binding in logic.devices.iter().filter(|device| device.position_control_id.is_some()) {
        let target = binding.position_control_id.as_deref().unwrap();
        let control = logic.devices.iter().find(|device| device.placement_id == target);
        if doc.native.is_some() ||
            !doc.placements.iter().any(|p| p.id == binding.placement_id && p.tag_class == "mach") ||
            !doc.placements.iter().any(|p| p.id == target && p.tag_class == "ctrl") ||
            !control.is_some_and(|c| !c.native_name.as_deref().unwrap_or_default().starts_with("extraction_"))
        {
            return invalid("Native switch wiring needs an editable machine and a bound, non-Extraction control.");
        }
    }
    let mut crew_owners=BTreeSet::new();
    for rule in &logic.rules {
        if !text(&rule.id, 72)
            || !ids.insert(&rule.id)
            || !text(&rule.name, 160)
            || rule.actions.is_empty()
            || rule.actions.len() > 8
        {
            return invalid("Logic rules need unique identities, a name and 1–8 typed actions");
        }
        match &rule.event {
            Event::Enter{trigger_id}|Event::Exit{trigger_id} if !logic.triggers.iter().any(|t|&t.id==trigger_id)=>return invalid(format!("Logic rule '{}' references a missing trigger",rule.name)),
            Event::Timer{seconds:s} if !seconds(*s)||(!rule.once&&*s<1./30.)=>return invalid("A repeating timer must yield for at least one native tick; maximum delay is one hour"),
            _=>(),
        }
        for action in &rule.actions {
            match action {
                Action::DevicePosition { target_id, value }
                | Action::DevicePower { target_id, value } => {
                    if !devices.contains(target_id.as_str()) || !unit(*value) {
                        return invalid(format!(
                            "Logic rule '{}' needs a bound device and value 0–1",
                            rule.name
                        ));
                    }
                }
                Action::AiVehicleLoad{target_id,encounter_name,seat}=>{
                    crew_population(doc,target_id,encounter_name,seat)?;
                    if rule.enabled&&!crew_owners.insert(encounter_name){return invalid("One enabled AI seating owner per encounter; disable or edit the existing connection");}
                }
                Action::Delay { seconds: s } if !seconds(*s) => {
                    return invalid("Logic delays must be finite within one hour")
                }
                _ => (),
            }
        }
        if rule
            .condition
            .as_ref()
            .is_some_and(|c| !devices.contains(c.target_id.as_str()) || !unit(c.at_least))
        {
            return invalid("A device condition needs a bound device and threshold 0–1");
        }
    }
    if logic
        .manual_source
        .as_ref()
        .is_some_and(|s| s.is_empty() || s.len() > 65536 || s.bytes().any(|b| b == 0 || b > 127))
    {
        return invalid("Manual HaloScript must be nonempty ASCII source within 64 KiB; native compilation still validates semantics");
    }
    validate_handwritten_sources(&logic.handwritten_sources)?;
    let (files, bytes) = if doc.runtime_id == crate::runtime::RuntimeId::MccSteam {
        (16, 1024 * 1024)
    } else {
        (8, 256 * 1024)
    };
    let generated = 1 + usize::from(doc.runtime_id == crate::runtime::RuntimeId::MccSteam);
    if logic.handwritten_sources.len() + generated > files
        || logic
            .handwritten_sources
            .iter()
            .any(|s| s.content.len() > bytes)
    {
        return invalid(format!("Selected target permits {files} script source files and {bytes} bytes per file; generated/global source counts toward that budget. No source was omitted or truncated"));
    }
    Ok(())
}
fn real(v: f32) -> String {
    format!("{v:.6}")
}
fn ticks(v: f32) -> u32 {
    ((v * 30.).round() as u32).max(1)
}
fn volume(logic: &Document, id: &str) -> String {
    let name = logic.triggers.iter().find(|t| t.id == id).map(trigger_name)
        .unwrap_or_else(|| native_name("tv", id));
    format!("(volume_test_objects {name} (players))")
}
pub fn has_source(doc:&QuickForgeDocument)->bool {
    doc.logic.is_some() || crate::quickforge::campaign_profile(doc).is_some() || doc.placements.iter().any(|p|p.native_name.is_some()||p.transport_signals.is_some())
}
fn effective_logic(doc:&QuickForgeDocument)->Option<Cow<'_,Document>> {
    doc.logic.as_ref().map(Cow::Borrowed).or_else(||(crate::quickforge::campaign_profile(doc).is_some()||doc.placements.iter().any(|p|p.native_name.is_some()||p.transport_signals.is_some())).then(||Cow::Owned(Document {
        schema_version:1,triggers:vec![],devices:vec![],rules:vec![],manual_source:None,handwritten_sources:vec![],
    })))
}
pub fn generate(doc: &QuickForgeDocument) -> Result<Option<Source>> {
    validate(doc)?;
    let effective=effective_logic(doc);
    let Some(logic) = effective.as_deref() else {
        return Ok(None);
    };
    let mut lines = vec![
        "; Generated from Spark Logic / Events; ordinary Halo 1 HaloScript.".into(),
        "; Native named objects and volumes are supplied by the scenario plan.".into(),
        "(global boolean gs_logic_ready false)".into(),
        "(script startup gs_logic_init".into(),
    ];
    for device in &logic.devices {
        let name = device_name(logic, &device.placement_id);
        if doc.placements.iter().any(|p| p.id == device.placement_id && p.tag_class == "mach") {
            lines.push(format!("  (device_operates_automatically_set {name} false)"));
        }
        lines.push(format!(
            "  (device_set_power {name} {})",
            if device.powered { "1.0" } else { "0.0" }
        ));
        // The linked control owns the starting position of every machine on its group.
        if device.position_control_id.is_none() {
            lines.push(format!("  (device_set_position_immediate {name} {})", real(device.initial_position)));
        }
    }
    if crate::quickforge::campaign_profile(doc).is_some() {
        lines.extend([
            "  (sleep_until (> (unit_get_health (unit (list_get (players) 0))) 0) 1)".into(),
            format!("  (player_add_equipment (unit (list_get (players) 0)) {} true)",crate::quickforge::CAMPAIGN_PROFILE_NAME),
        ]);
    }
    lines.extend(["  (set gs_logic_ready true)".into(), ")".into()]);
    let mut regions = vec![];
    for rule in logic.rules.iter().filter(|r| r.enabled) {
        let name = native_name("evt", &rule.id);
        let first_line = lines.len() + 1;
        lines.push(format!(
            "(script {} {name}",
            if rule.once { "startup" } else { "continuous" }
        ));
        lines.push("  (sleep_until gs_logic_ready 1)".into());
        match &rule.event {
            Event::Enter { trigger_id } => {
                lines.push(format!("  (sleep_until {} 1)", volume(logic, trigger_id)))
            }
            Event::Exit { trigger_id } => lines.extend([
                format!("  (sleep_until {} 1)", volume(logic, trigger_id)),
                format!("  (sleep_until (not {}) 1)", volume(logic, trigger_id)),
            ]),
            Event::Timer { seconds } => lines.push(format!("  (sleep {})", ticks(*seconds))),
        }
        if let Some(condition) = &rule.condition {
            lines.push(format!(
                "  (if (>= (device_get_position {}) {}) (begin",
                device_name(logic, &condition.target_id),
                real(condition.at_least)
            ));
        }
        for action in &rule.actions {
            if let Action::AiVehicleLoad{target_id,encounter_name,seat}=action {
                let vehicle=doc.placements.iter().find(|p|p.id==*target_id).unwrap().native_name.as_deref().unwrap();
                lines.push(format!("  (sleep_until (and (> (ai_living_count {encounter_name}) 0) (> (unit_get_health (unit {vehicle})) 0)) 1)"));
                lines.push(format!("  (vehicle_load_magic (unit {vehicle}) \"{seat}\" (ai_actors {encounter_name}))"));
                continue;
            }
            lines.push(match action {
                Action::DevicePosition { target_id, value } => format!(
                    "  (device_set_position {} {})",
                    device_name(logic, target_id),
                    real(*value)
                ),
                Action::DevicePower { target_id, value } => format!(
                    "  (device_set_power {} {})",
                    device_name(logic, target_id),
                    real(*value)
                ),
                Action::Delay { seconds } => format!("  (sleep {})", ticks(*seconds)),
                Action::AiVehicleLoad{..}=>unreachable!("handled above"),
            });
        }
        if rule.condition.is_some() {
            lines.push("  ))".into());
        }
        if !rule.once {
            if let Event::Enter { trigger_id } = &rule.event {
                lines.push(format!("  (sleep_until (not {}) 1)", volume(logic, trigger_id)));
            }
        }
        lines.push(")".into());
        regions.push(SourceRegion {
            rule_id: rule.id.clone(),
            name: rule.name.clone(),
            native_name: name,
            first_line,
            last_line: lines.len(),
        });
    }
    let content = logic
        .manual_source
        .clone()
        .unwrap_or_else(|| lines.join("\n") + "\n");
    Ok(Some(Source {
        filename: "gs_logic.hsc".into(),
        sha256: crate::studio_native::digest(content.as_bytes()),
        content,
        regions,
        manual: logic.manual_source.is_some(),
    }))
}
fn set(args: &mut Vec<String>, field: impl Into<String>, value: impl Into<String>) {
    args.extend(["-S".into(), field.into(), value.into()]);
}
fn vector(v: [f32; 3]) -> String {
    v.map(real).join(",")
}
/// Invader operates on stock native fields; the sidecar never becomes tag data.
use crate::maps::ScenarioLogicVolumeGeometry as TriggerGeometry;
fn trigger_geometry(trigger:&Trigger)->Result<TriggerGeometry>{
    if trigger.rotation[0].abs()>0.00001||trigger.rotation[1].abs()>0.00001 {
        return invalid("Native trigger volumes currently support yaw rotation; X/Y tilt is not implemented");
    }
    let (s,c)=trigger.rotation[2].sin_cos();let [x,y,z]=trigger.dimensions.map(|value|-value/2.);
    Ok(TriggerGeometry{forward:[c,s,0.],up:[0.,0.,1.],corner:[trigger.position[0]+c*x-s*y,trigger.position[1]+s*x+c*y,trigger.position[2]+z],dimensions:trigger.dimensions})
}
/// Checks the same basis/corner used by source generation, without executing any script.
pub fn verify_marker_readback(doc:&QuickForgeDocument,read:&crate::maps::ScenarioLogicReadback)->Result<()> {
    validate(doc)?;
    let Some(logic)=effective_logic(doc) else{return Ok(());};
    if read.names.len()!=logic.devices.len()+doc.placements.iter().filter(|p|p.native_name.is_some()).count()||read.volumes.len()!=logic.triggers.len(){return invalid("Compiled Logic marker inventory differs from authored source");}
    let signals = transport_signal_groups(doc);
    let controls = position_group_controls(&logic);
    let groups = signals.iter().map(|name| (name.clone(), 0.))
        .chain(controls.iter().map(|control| (native_name("dg", &control.placement_id), control.initial_position)));
    if (doc.placements.iter().any(|p| p.transport_signals.is_some()) || !controls.is_empty()) &&
        (read.groups.len() != signals.len() + controls.len() ||
        read.groups.iter().zip(groups).any(|(actual, (name, value))| actual.name != name ||
            (actual.initial_value - value).abs() > 0.000001 || !actual.initial_value.is_finite() || actual.flags != 0))
    {
        return invalid("Compiled native device groups differ from the reviewed transport or switch wiring definitions");
    }
    if !signals.is_empty() && read.devices.iter().any(|device|
        [device.power_group, device.position_group].into_iter().any(|group| match group {
            None => true, Some(index) => index >= 0 && (index as usize) < signals.len(),
        })
    ) {
        return invalid("Transport boarding/recall/landing groups must not drive any device power or position");
    }
    for (index,binding) in logic.devices.iter().enumerate(){
        let source=doc.placements.iter().find(|value|value.id==binding.placement_id).ok_or_else(||crate::SparkError::Invalid("Authored Logic device disappeared".into()))?;
        let array_index=doc.placements.iter().filter(|value|value.tag_class==source.tag_class).position(|value|value.id==source.id).unwrap();
        let name=&read.names[index];let native_type=if source.tag_class=="ctrl"{8}else{7};
        let compiled=read.devices.iter().find(|value|value.class==source.tag_class&&value.index==array_index)
            .ok_or_else(||crate::SparkError::Invalid("Compiled named device is unavailable".into()))?;
        if name.name!=device_name(&logic,&binding.placement_id)||name.object_type!=native_type||name.object_index<0||name.object_index as usize!=array_index||
            compiled.name_index<0||compiled.name_index as usize!=index||!compiled.tag_path.replace('\\',"/").eq_ignore_ascii_case(&source.tag_path.replace('\\',"/"))||
            !crate::native_operations::positions_close(source.position,compiled.position)
            || (!controls.is_empty() && (compiled.power_group != Some(-1)
                || compiled.position_group != Some(linked_position_group(binding, &controls, signals.len())))) {
            return invalid(format!("Compiled Logic device {} name/index/tag/position or wiring differs from source",source.name));
        }
        if binding.position_control_id.is_some() && compiled.manual_activation != Some(true) {
            return invalid(format!("Compiled position switch target {} can operate automatically or its machine flag is unreadable", source.name));
        }
        if controls.iter().any(|control| control.placement_id == binding.placement_id)
            && compiled.interaction_disabled != Some(false)
        {
            return invalid(format!("Compiled position switch {} blocks player interaction or its placement flag is unreadable", source.name));
        }
    }
    for (offset,source) in doc.placements.iter().filter(|p|p.native_name.is_some()).enumerate(){
        let index=logic.devices.len()+offset;
        let vehicle_index=doc.placements.iter().filter(|p|p.tag_class=="vehi").position(|p|p.id==source.id).unwrap();
        let name=&read.names[index];let compiled=read.vehicles.iter().find(|p|p.index==vehicle_index)
            .ok_or_else(||crate::SparkError::Invalid("Compiled named vehicle is unavailable".into()))?;
        let rotation=crate::quickforge::scenario_rotation(source.rotation);
        if name.name!=source.native_name.as_deref().unwrap()||name.object_type!=1||name.object_index<0||name.object_index as usize!=vehicle_index||
            compiled.name_index<0||compiled.name_index as usize!=index||!compiled.tag_path.replace('\\',"/").eq_ignore_ascii_case(&source.tag_path.replace('\\',"/"))||
            !crate::native_operations::positions_close(source.position,compiled.position)||!crate::native_operations::positions_close(rotation,compiled.rotation_radians){
            return invalid(format!("Compiled vehicle {} name/index/tag/pose differs from source",source.name));
        }
    }
    for (source,compiled) in logic.triggers.iter().zip(&read.volumes){
        let expected=trigger_geometry(source)?;
        let actual=compiled.geometry.as_ref().ok_or_else(||crate::SparkError::Invalid("Compiled trigger has no oriented geometry; expected native rotational volume".into()))?;
        if compiled.name!=trigger_name(source)||compiled.kind!=1||
            ![(expected.forward,actual.forward),(expected.up,actual.up),(expected.corner,actual.corner),(expected.dimensions,actual.dimensions)]
                .into_iter().all(|(a,b)|crate::native_operations::positions_close(a,b)) {
            return invalid(format!("Compiled trigger {} name/type/basis/corner/dimensions differ from source",source.name));
        }
    }
    Ok(())
}

/// Authoritative source guard for Forerunner's existing native hub contract.
/// Collision/use distance and gameplay remain separate native acceptance gates.
pub fn validate_extraction_layout(doc:&QuickForgeDocument,activation_powered:bool)->Result<()> {
    let logic=doc.logic.as_ref().ok_or_else(||crate::SparkError::Invalid("Extraction needs native controls and volumes".into()))?;
    if logic.manual_source.is_some(){return invalid("Handwritten startup owns extraction power; reconcile it before preparing");}
    let zone=|name:&str|->Result<&Trigger>{let found=logic.triggers.iter().filter(|t|trigger_name(t)==name).collect::<Vec<_>>();if found.len()!=1{return invalid(format!("Extraction needs one named {name} volume"));}Ok(found[0])};
    let hub=zone("extraction_return")?;let field=zone("extraction_zone")?;
    let inside=|point:[f32;3],volume:&Trigger|trigger_geometry(volume).is_ok_and(|geometry|geometry.contains(point));
    for(name,powered)in[("extraction_deploy",true),("extraction_activate",activation_powered),("extraction_loadout",true),("extraction_debrief",true)] {
        let rows=logic.devices.iter().filter(|d|d.native_name.as_deref()==Some(name)).collect::<Vec<_>>();
        if rows.is_empty() && matches!(name, "extraction_loadout" | "extraction_debrief") { continue; }
        if rows.len()!=1||rows[0].powered!=powered||!rows[0].initial_position.is_finite()||!(0. ..0.5).contains(&rows[0].initial_position){return invalid("Extraction native control power/position is incomplete");}
        let placements=doc.placements.iter().filter(|p|p.id==rows[0].placement_id&&p.tag_class=="ctrl").collect::<Vec<_>>();if placements.len()!=1{return invalid("Extraction needs one native control placement per binding");}let p=placements[0].position;
        let valid = if name == "extraction_activate" { inside(p, field) } else { inside(p, hub) && !inside(p, field) };
        if !valid { return invalid(format!("Extraction control {name} is outside its required hub or activation area")); }
    }
    if doc.spawns.is_empty()||doc.spawns.iter().any(|spawn|!inside(spawn.position,hub)||inside(spawn.position,field)){return invalid("Every selectable native player start must be inside the safe hub and outside activation, including hidden or filtered starts");}
    Ok(())
}
/// Read-only compiled marker/start admission for the existing Forerunner mode.
/// The engine still owns control-use behavior, collision, settlement and gameplay.
pub fn validate_compiled_extraction_layout(map: &crate::maps::MapInspection, read: &crate::maps::ScenarioLogicReadback) -> Result<bool> {
    if map.diagnostics.iter().any(|d| d.code == "PLAYER_SPAWNS_UNREADABLE") {
        return invalid("Compiled Extraction player starts are unreadable");
    }
    let has_name = |name: &str| read.names.iter().any(|row| row.name == name);
    let has_volume = |name: &str| read.volumes.iter().any(|row| row.name == name);
    let volume = |name: &str| -> Result<&TriggerGeometry> {
        let rows = read.volumes.iter().filter(|row| row.name == name).collect::<Vec<_>>();
        if rows.len() != 1 || rows[0].kind != 1 {
            return invalid(format!("Compiled Extraction needs one readable rotational {name} volume"));
        }
        rows[0].geometry.as_ref().filter(|geometry| geometry.valid())
            .ok_or_else(|| crate::SparkError::Invalid(format!("Compiled Extraction volume {name} has invalid geometry")))
    };
    let control = |name: &str| -> Result<[f32; 3]> {
        let rows = read.names.iter().enumerate().filter(|(_, row)| row.name == name).collect::<Vec<_>>();
        if rows.len() != 1 || rows[0].1.object_type != 8 || rows[0].1.object_index < 0 {
            return invalid(format!("Compiled Extraction control {name} is missing, ambiguous or has the wrong native type"));
        }
        let (index, binding) = rows[0];
        let devices = read.devices.iter().filter(|d| d.class == "ctrl"
            && d.index == binding.object_index as usize && d.name_index == index as i16).collect::<Vec<_>>();
        if devices.len() != 1 {
            return invalid(format!("Compiled Extraction control {name} has an invalid reverse binding"));
        }
        if devices[0].interaction_disabled != Some(false) {
            return invalid(format!("Compiled Extraction control {name} blocks player interaction or its placement flag is unreadable"));
        }
        Ok(devices[0].position)
    };
    let bound_vehicle = |name: &str| {
        let mut ships = read.names.iter().enumerate().filter(|(_, row)| row.name == name);
        let Some((index, ship)) = ships.next() else { return false; };
        ships.next().is_none() && ship.object_type == 1 &&
            read.vehicles.iter().any(|vehicle| vehicle.class == "vehi" &&
                vehicle.name_index == index as i16 && i16::try_from(vehicle.index).ok() == Some(ship.object_index))
    };
    let hub = volume("extraction_return")?;
    let deploy = control("extraction_deploy")?;
    let mut field_zones = Vec::new();
    let shared = has_name("extraction_activate") || has_volume("extraction_zone");
    if shared {
        let field = volume("extraction_zone")?;
        if !field.contains(control("extraction_activate")?) {
            return invalid("Compiled Extraction shared control is outside its activation area");
        }
        field_zones.push(field);
    }
    let mut faction_zones = false;
    for (ship, call, field) in [
        ("extraction_pelican", "extraction_pelican_activate", "extraction_pelican_zone"),
        ("extraction_spirit", "extraction_spirit_activate", "extraction_spirit_zone"),
    ] {
        let override_route = has_name(call) || has_volume(field);
        if !override_route && (shared || !has_name(ship)) { continue; }
        if !bound_vehicle(ship) {
            return invalid(format!("Compiled Extraction route {call} needs its named native vehicle {ship}"));
        }
        let zone = volume(field)?;
        if !zone.contains(control(call)?) {
            return invalid(format!("Compiled Extraction control {call} is outside {field}"));
        }
        field_zones.push(zone);
        faction_zones = true;
    }
    if field_zones.is_empty() {
        return invalid("Compiled Extraction needs a shared field route or a complete route for every named dropship");
    }
    if has_name("extraction_spirit") && has_volume("spirit_return") {
        let pad = volume("spirit_return")?;
        if field_zones.iter().any(|field| pad.intersects(field)) {
            return invalid("Compiled Spirit return pad intersects a field Extraction zone");
        }
        faction_zones = true;
    }
    if has_volume("pelican_return") {
        let pad = volume("pelican_return")?;
        if !bound_vehicle("extraction_pelican") {
            return invalid("Compiled Pelican return pad needs one valid native extraction_pelican vehicle binding");
        }
        if field_zones.iter().any(|field| pad.intersects(field)) {
            return invalid("Compiled Pelican return pad intersects a field Extraction zone");
        }
    }
    let in_field = |point| field_zones.iter().any(|field| field.contains(point));
    if !hub.contains(deploy) || in_field(deploy) {
        return invalid("Compiled Extraction deployment control must be inside the hub and outside field zones");
    }
    for name in ["extraction_loadout", "extraction_debrief"] {
        if has_name(name) {
            let point = control(name)?;
            if !hub.contains(point) || in_field(point) {
                return invalid(format!("Compiled Extraction control {name} must be inside the safe hub and outside field zones"));
            }
        }
    }
    let mut starts = map.objects.iter().filter(|object| object.kind == "Player spawn").peekable();
    if starts.peek().is_none() || starts.any(|spawn| !hub.contains(spawn.position) || in_field(spawn.position)) {
        return invalid("Every compiled player start must be inside the safe hub and outside activation");
    }
    Ok(faction_zones)
}

pub fn scenario_commands(doc: &QuickForgeDocument, scenario: &str) -> Result<Vec<ForgeCommand>> {
    validate(doc)?;
    let effective=effective_logic(doc);
    let Some(logic)=effective.as_deref() else{return Ok(vec![]);};
    let tag = format!("{scenario}.scenario");
    let mut commands = vec![];
    let command = |args| ForgeCommand {
        phase: "logic-scenario".into(),
        tool: "invaderEdit".into(),
        args,
        expected_outputs: vec![format!("tags/{}", tag.replace('\\', "/"))],
    };
    let signals = transport_signal_groups(doc);
    let controls = position_group_controls(logic);
    let groups = signals.iter().map(|name| (name.clone(), 0.))
        .chain(controls.iter().map(|control| (native_name("dg", &control.placement_id), control.initial_position)));
    for (index, (name, initial_value)) in groups.enumerate() {
        let mut args=vec!["-I".into(),"device_groups".into(),"1".into(),"end".into()];
        set(&mut args,format!("device_groups[{index}].name"),name);
        set(&mut args,format!("device_groups[{index}].initial_value"),initial_value.to_string());
        set(&mut args,format!("device_groups[{index}].flags.can_change_only_once"),"0");
        args.push(tag.clone());let mut group=command(args);group.phase="logic-groups".into();commands.push(group);
    }
    for (i, device) in logic.devices.iter().enumerate() {
        let placement = doc.placements.iter().find(|p| p.id == device.placement_id).unwrap();
        let array = if placement.tag_class == "ctrl" { "controls" } else { "machines" };
        let device_index = doc.placements.iter().filter(|p| p.tag_class == placement.tag_class)
            .position(|p| p.id == device.placement_id).unwrap();
        // Invader marks this Sapien-authored table read-only. Use its documented
        // per-invocation authoring option only for this fresh generated table;
        // forge_build verifies emptiness first and every binding afterward.
        // Cache-only object type/index are deliberately left to the compiler.
        let mut args = vec![
            "-n".into(),
            "-I".into(),
            "object_names".into(),
            "1".into(),
            "end".into(),
        ];
        set(
            &mut args,
            format!("object_names[{i}].name"),
            device_name(logic, &device.placement_id),
        );
        set(
            &mut args,
            format!("{array}[{device_index}].name"),
            i.to_string(),
        );
        set(
            &mut args,
            format!("{array}[{device_index}].power_group"),
            "-1",
        );
        set(
            &mut args,
            format!("{array}[{device_index}].position_group"),
            linked_position_group(device, &controls, signals.len()).to_string(),
        );
        if placement.tag_class == "mach" {
            set(&mut args, format!("{array}[{device_index}].machine_flags.does_not_operate_automatically"), "1");
        } else if controls.iter().any(|control| control.placement_id == device.placement_id) {
            set(&mut args, format!("{array}[{device_index}].device_flags.not_usable_from_any_side"), "0");
        }
        args.push(tag.clone());
        let mut names = command(args);
        names.phase = "logic-names".into();
        commands.push(names);
    }
    for (offset,placement) in doc.placements.iter().filter(|p|p.native_name.is_some()).enumerate(){
        let index=logic.devices.len()+offset;
        let vehicle_index=doc.placements.iter().filter(|p|p.tag_class=="vehi").position(|p|p.id==placement.id).unwrap();
        let mut args=vec!["-n".into(),"-I".into(),"object_names".into(),"1".into(),"end".into()];
        set(&mut args,format!("object_names[{index}].name"),placement.native_name.clone().unwrap());
        set(&mut args,format!("vehicles[{vehicle_index}].name"),index.to_string());args.push(tag.clone());
        let mut names=command(args);names.phase="logic-names".into();commands.push(names);
    }
    for (i, trigger) in logic.triggers.iter().enumerate() {
        let mut args = vec![
            "-I".into(),
            "trigger_volumes".into(),
            "1".into(),
            "end".into(),
        ];
        let prefix = format!("trigger_volumes[{i}]");
        // A newly inserted native volume defaults to `fixed`, whose parameters
        // are axis-aligned bounds rather than this authored corner/basis. The
        // engine otherwise tests an empty box even though HSC compiles.
        set(&mut args, format!("{prefix}.type"), "rotational");
        set(
            &mut args,
            format!("{prefix}.name"),
            trigger_name(trigger),
        );
        let geometry=trigger_geometry(trigger)?;
        for (field,value) in [("rotation_vector_forward",geometry.forward),("rotation_vector_up",geometry.up),
            ("starting_corner",geometry.corner),("ending_corner_offset",geometry.dimensions)] {
            set(&mut args,format!("{prefix}.{field}"),vector(value));
        }
        args.push(tag.clone());
        commands.push(command(args));
    }
    Ok(commands)
}
pub fn merge(
    base: &Option<Document>,
    next: &Option<Document>,
    current: &Option<Document>,
) -> Result<Option<Document>> {
    if next == base {
        return Ok(current.clone());
    }
    if current != base && current != next {
        return invalid("Concurrent Logic / Events conflict; both drafts are retained for review");
    }
    Ok(next.clone())
}
/// H1A indexes its conventional globals source even when there are no global
/// definitions. Never replace authored source. Shared by native authored and
/// recovered-project preparation; this is a generated compiler support file.
pub(crate) const H1A_EMPTY_GLOBAL_SOURCE:&[u8]=b"; Spark generated level: no additional global script definitions.\r\n";
pub fn ensure_h1a_global_source(workspace: &std::path::Path) -> Result<std::path::PathBuf> {
    let globals = workspace.join("data/global_scripts.hsc");
    crate::reject_links(&globals)?;
    if !globals.exists() {
        std::fs::create_dir_all(workspace.join("data"))?;
        crate::project::atomic_write(
            &globals,
            H1A_EMPTY_GLOBAL_SOURCE,
            false,
        )?;
    }
    Ok(globals)
}
pub fn script_path(workspace: &std::path::Path, scenario: &str) -> Result<std::path::PathBuf> {
    let scenario = crate::safe_relative(scenario)?;
    Ok(workspace
        .join("data")
        .join(scenario.parent().unwrap())
        .join("scripts/gs_logic.hsc"))
}
/// The native compiler consumes these files as one scenario unit. It remains
/// authoritative for function types, declarations, dependencies and budgets.
pub fn source_modules(doc: &QuickForgeDocument) -> Result<Vec<Source>> {
    let Some(generated) = generate(doc)? else {
        return Ok(vec![]);
    };
    let mut modules = vec![generated];
    for module in doc.logic.iter().flat_map(|logic| &logic.handwritten_sources) {
        modules.push(Source {
            filename: module.filename.clone(),
            content: module.content.clone(),
            sha256: crate::studio_native::digest(module.content.as_bytes()),
            regions: vec![],
            manual: true,
        });
    }
    Ok(modules)
}
pub fn export(doc: &QuickForgeDocument, workspace: &std::path::Path, scenario: &str) -> Result<()> {
    let modules = source_modules(doc)?;
    if modules.is_empty() {
        return Ok(());
    }
    let directory = script_path(workspace, scenario)?
        .parent()
        .unwrap()
        .to_owned();
    // Preflight every destination before writing even the generated module.
    // An existing manual file must never be replaced by a partial export.
    for source in &modules {
        let path = directory.join(&source.filename);
        crate::reject_links(&path)?;
        if path.exists() {
            return invalid(format!(
                "Logic export must not overwrite existing script {}; original source is unchanged",
                source.filename
            ));
        }
    }
    for source in &modules {
        let path = directory.join(&source.filename);
        std::fs::create_dir_all(path.parent().unwrap())?;
        crate::project::atomic_write(&path, source.content.as_bytes(), false)?;
    }
    if let Some(source) = modules.first() {
        crate::project::atomic_write(
            &workspace.join("logic-source-map.json"),
            &serde_json::to_vec_pretty(&source)?,
            false,
        )?;
    }
    if modules.len() > 1 {
        crate::project::atomic_write(
            &workspace.join("logic-sources.json"),
            &serde_json::to_vec_pretty(&modules)?,
            false,
        )?;
    }
    Ok(())
}
pub fn verify_exported_sources(
    doc: &QuickForgeDocument,
    workspace: &std::path::Path,
    scenario: &str,
) -> Result<()> {
    let directory = script_path(workspace, scenario)?
        .parent()
        .unwrap()
        .to_owned();
    for module in source_modules(doc)? {
        let input = directory.join(&module.filename);
        crate::reject_links(&input)?;
        if crate::maps::hash_file(&input)? != module.sha256 {
            return invalid(format!("HaloScript {} changed after export; reconcile the originating source before compiling. Edited files remain intact", module.filename));
        }
    }
    Ok(())
}
pub(crate) fn compile(
    doc: &QuickForgeDocument,
    workspace: &std::path::Path,
    scenario: &str,
    edit: &std::path::Path,
    engine: &str,
    runner: &crate::build::Runner<'_>,
) -> Result<()> {
    let Some(source) = generate(doc)? else {
        return Ok(());
    };
    let tag = format!("{scenario}.scenario");
    let tags = workspace.join("tags").to_string_lossy().into_owned();
    // Independently read through the native editor without -n. Names are not
    // trusted merely because a setter returned zero.
    let effective=effective_logic(doc);
    let logic = effective.as_deref().ok_or_else(||crate::SparkError::Invalid("Generated native startup has no source document".into()))?;
    if !source.manual {
        let mut seat_labels=std::collections::BTreeMap::new();let mut reviewed_vehicles=BTreeSet::new();
        for rule in logic.rules.iter().filter(|rule|rule.enabled){for action in &rule.actions{if let Action::AiVehicleLoad{target_id,..}=action{
            if !reviewed_vehicles.insert(target_id){continue;}
            let vehicle=doc.placements.iter().find(|p|p.id==*target_id).unwrap();
            if !seat_labels.contains_key(&vehicle.tag_path){let fields=runner.run(edit,&["-t".into(),tags.clone(),"-L".into(),format!("{}.vehicle",vehicle.tag_path)],workspace,"crew-seats-review",72)?;seat_labels.insert(vehicle.tag_path.clone(),crate::native_operations::native_vehicle_seats(&fields)?);}
            verify_vehicle_crew_seats(doc,target_id,&seat_labels[&vehicle.tag_path])?;
        }}}
    }
    let controls = position_group_controls(logic);
    let signal_count = transport_signal_groups(doc).len();
    for (i, binding) in logic.devices.iter().enumerate() {
        let placement = doc.placements.iter().find(|p| p.id == binding.placement_id).unwrap();
        let array = if placement.tag_class == "ctrl" { "controls" } else { "machines" };
        let index = doc.placements.iter().filter(|p| p.tag_class == placement.tag_class)
            .position(|p| p.id == binding.placement_id).unwrap();
        let position_group = linked_position_group(binding, &controls, signal_count);
        if placement.tag_class == "ctrl" && (position_group >= 0 ||
            matches!(binding.native_name.as_deref(), Some("extraction_deploy" | "extraction_activate" | "extraction_loadout" | "extraction_debrief"))) {
            let actual = runner.run(edit, &["-t".into(), tags.clone(), "-G".into(), "triggers_when".into(),
                format!("{}.device_control", placement.tag_path)], workspace, "logic-control-readback", 72)?;
            if actual.trim().replace('_', " ") != "touched by player" {
                return invalid("The linked switch or Extraction terminal must use a native touched-by-player control tag. Choose a compatible control.");
            }
        }
        if binding.position_control_id.is_some() {
            let machine_tag = format!("{}.device_machine", placement.tag_path);
            let machine_type = runner.run(edit,
                &["-t".into(), tags.clone(), "-G".into(), "machine_type".into(), machine_tag],
                workspace, "logic-machine-readback", 72)?;
            if !matches!(machine_type.trim(), "door" | "platform") {
                return invalid(format!(
                    "Position switch target {} uses native machine type {}. Choose a door or platform for a shared position switch.",
                    placement.name, machine_type.trim(),
                ));
            }
        }
        for (key, expected) in [
            (
                format!("object_names[{i}].name"),
                device_name(logic, &binding.placement_id),
            ),
            (format!("{array}[{index}].name"), i.to_string()),
            (format!("{array}[{index}].position_group"), if position_group < 0 {"65535".into()} else {position_group.to_string()}),
        ] {
            let actual = runner.run(
                edit,
                &["-t".into(), tags.clone(), "-G".into(), key, tag.clone()],
                workspace,
                "logic-readback",
                72,
            )?;
            let is_null_index = expected == "65535" && actual.trim() == "-1";
            if actual.trim() != expected && !is_null_index {
                return invalid("Native logic object-name or position group linkage failed independent readback");
            }
        }
    }
    for (i, trigger) in logic.triggers.iter().enumerate() {
        let actual_name = runner.run(edit, &["-t".into(), tags.clone(), "-G".into(),
            format!("trigger_volumes[{i}].name"), tag.clone()], workspace, "logic-readback", 72)?;
        if actual_name.trim() != trigger_name(trigger) {
            return invalid("Native trigger name failed independent readback");
        }
        let actual = runner.run(
            edit,
            &[
                "-t".into(),
                tags.clone(),
                "-G".into(),
                format!("trigger_volumes[{i}].type"),
                tag.clone(),
            ],
            workspace,
            "logic-readback",
            72,
        )?;
        if actual.trim() != "rotational" {
            return invalid("Native trigger representation differs from its authored corner/basis; refusing a nonfunctional trigger");
        }
    }
    let path = script_path(workspace, scenario)?;
    crate::reject_links(&path)?;
    let modules = source_modules(doc)?;
    verify_exported_sources(doc, workspace, scenario)?;
    // H1A recompiles source during build-cache-file. Its source indexing expects
    // the conventional globals file even when the level declares no globals.
    // Match the existing native machinima path, without replacing authored text.
    let globals = workspace.join("data/global_scripts.hsc");
    crate::reject_links(&globals)?;
    if engine == "mcc-cea" && !globals.exists() {
        ensure_h1a_global_source(workspace)?;
    }
    let limit = if engine == "mcc-cea" { 16 } else { 8 };
    let mut count = usize::from(globals.is_file());
    let source_limit = if engine == "mcc-cea" {
        1024 * 1024
    } else {
        256 * 1024
    };
    if globals.is_file() && std::fs::metadata(&globals)?.len() > source_limit {
        return invalid("Global HaloScript source exceeds the bounded source-file size");
    }
    for entry in std::fs::read_dir(path.parent().unwrap())? {
        let p = entry?.path();
        crate::reject_links(&p)?;
        if p.extension().is_some_and(|x| x == "hsc") {
            count += 1;
            if std::fs::metadata(&p)?.len() > source_limit {
                return invalid("A HaloScript source exceeds the bounded source-file size");
            }
        }
    }
    if count > limit {
        return invalid(format!("Selected target permits at most {limit} scenario script files; no source was silently omitted"));
    }
    let compiler = edit.parent().unwrap().join(if cfg!(windows) {
        "invader-script.exe"
    } else {
        "invader-script"
    });
    crate::reject_links(&compiler)?;
    if !compiler.is_file() {
        return invalid("Logic / Events requires the installed invader-script native compiler alongside invader-edit");
    }
    let mut args = vec![
        "-g".into(),
        engine.into(),
        "-t".into(),
        workspace.join("tags").to_string_lossy().into_owned(),
        "-d".into(),
        workspace.join("data").to_string_lossy().into_owned(),
    ];
    if !workspace.join("data/global_scripts.hsc").exists() {
        args.push("-E".into());
    }
    args.push(scenario.into());
    let diagnostics = std::sync::Mutex::new(Vec::<String>::new());
    let capture = |event: crate::build::JobEvent| {
        if event.phase == "logic-script" {
            if let Ok(mut lines) = diagnostics.lock() {
                if lines.len() < 64 {
                    lines.push(event.message.chars().take(2048).collect());
                }
            }
        }
        (runner.event)(event);
    };
    let linked_runner = crate::build::Runner {
        id: runner.id,
        project: runner.project,
        cancel: runner.cancel,
        event: &capture,
    };
    if let Err(error) = linked_runner.run(&compiler, &args, workspace, "logic-script", 73) {
        let details = diagnostics
            .lock()
            .map(|lines| compiler_diagnostic(&source, &lines))
            .unwrap_or_default();
        return invalid(format!("Logic / Events native compilation failed: {details}\n{error}. See gs_logic.hsc and logic-source-map.json; handwritten sources and the previous-good build remain unchanged"));
    }
    for module in &modules {
        let input = path.parent().unwrap().join(&module.filename);
        if crate::maps::hash_file(&input)? != module.sha256 {
            return invalid(format!("Native script compilation changed original source {}; previous-good output is retained", module.filename));
        }
    }
    Ok(())
}
/// Link an actual native compiler line to optional visual authoring metadata.
/// Manually edited files keep their real line number; generated regions may no
/// longer match, so no graph attribution is invented for them.
pub fn compiler_diagnostic(source: &Source, lines: &[String]) -> String {
    for message in lines {
        if let Some((_, location)) = message.split_once("gs_logic.hsc:") {
            if let Some(line) = location
                .split(':')
                .next()
                .and_then(|v| v.parse::<usize>().ok())
            {
                let rule = if source.manual {
                    None
                } else {
                    source
                        .regions
                        .iter()
                        .find(|r| line >= r.first_line && line <= r.last_line)
                };
                return format!(
                    "{}{}",
                    message,
                    rule.map(|r| format!(" · connection '{}' ({})", r.name, r.rule_id))
                        .unwrap_or_default()
                );
            }
        }
    }
    lines
        .iter()
        .filter(|line| line.to_ascii_lowercase().contains("error"))
        .take(3)
        .cloned()
        .collect::<Vec<_>>()
        .join("\n")
}
pub fn verify_compiled(doc: &QuickForgeDocument, map: &crate::maps::MapInspection, output:&std::path::Path) -> Result<Option<crate::maps::ScenarioLogicReadback>> {
    let Some(source) = generate(doc)? else {
        return Ok(None);
    };
    let read=if effective_logic(doc).is_some_and(|logic|!logic.devices.is_empty()||!logic.triggers.is_empty()||doc.placements.iter().any(|p|p.native_name.is_some()||p.transport_signals.is_some())) {
        let read=crate::maps::scenario_logic_readback(output,map)?;
        verify_marker_readback(doc,&read)?;Some(read)
    }else{None};
    for name in std::iter::once("gs_logic_init")
        .chain(source.regions.iter().map(|r| r.native_name.as_str()))
    {
        if !map.scripts.iter().any(|script| script.name == name) {
            return invalid(format!(
                "Compiled native cache omits required Logic / Events script {name}"
            ));
        }
    }
    Ok(read)
}
