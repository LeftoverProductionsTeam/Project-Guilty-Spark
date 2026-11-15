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
pub fn validate(doc: &QuickForgeDocument) -> Result<()> {
    if let Some(profile)=crate::quickforge::campaign_profile(doc) {
        crate::firefight::native_player_profile_arguments(profile,0,crate::quickforge::CAMPAIGN_PROFILE_NAME)?;
        if doc.logic.as_ref().is_some_and(|logic|logic.manual_source.is_some()) {
            return invalid("Campaign starting loadout needs generated startup logic. Preserve handwritten HaloScript separately and explicitly return to generated logic before enabling the loadout");
        }
    }
    let Some(logic) = &doc.logic else {
        return Ok(());
    };
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
    doc.logic.is_some() || crate::quickforge::campaign_profile(doc).is_some()
}
fn effective_logic(doc:&QuickForgeDocument)->Option<Cow<'_,Document>> {
    doc.logic.as_ref().map(Cow::Borrowed).or_else(||crate::quickforge::campaign_profile(doc).map(|_|Cow::Owned(Document {
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
        lines.extend([
            format!(
                "  (device_set_power {name} {})",
                if device.powered { "1.0" } else { "0.0" }
            ),
            format!(
                "  (device_set_position_immediate {name} {})",
                real(device.initial_position)
            ),
        ]);
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
struct TriggerGeometry {forward:[f32;3],up:[f32;3],corner:[f32;3],dimensions:[f32;3]}
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
    if read.names.len()!=logic.devices.len()||read.volumes.len()!=logic.triggers.len(){return invalid("Compiled Logic marker inventory differs from authored source");}
    for (index,binding) in logic.devices.iter().enumerate(){
        let source=doc.placements.iter().find(|value|value.id==binding.placement_id).ok_or_else(||crate::SparkError::Invalid("Authored Logic device disappeared".into()))?;
        let array_index=doc.placements.iter().filter(|value|value.tag_class==source.tag_class).position(|value|value.id==source.id).unwrap();
        let name=&read.names[index];let native_type=if source.tag_class=="ctrl"{8}else{7};
        let compiled=read.devices.iter().find(|value|value.class==source.tag_class&&value.index==array_index)
            .ok_or_else(||crate::SparkError::Invalid("Compiled named device is unavailable".into()))?;
        if name.name!=device_name(&logic,&binding.placement_id)||name.object_type!=native_type||name.object_index<0||name.object_index as usize!=array_index||
            compiled.name_index<0||compiled.name_index as usize!=index||!compiled.tag_path.replace('\\',"/").eq_ignore_ascii_case(&source.tag_path.replace('\\',"/"))||
            !crate::native_operations::positions_close(source.position,compiled.position) {
            return invalid(format!("Compiled Logic device {} name/index/tag/position differs from source",source.name));
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

pub fn scenario_commands(doc: &QuickForgeDocument, scenario: &str) -> Result<Vec<ForgeCommand>> {
    validate(doc)?;
    let Some(logic) = &doc.logic else {
        return Ok(vec![]);
    };
    let tag = format!("{scenario}.scenario");
    let mut commands = vec![];
    let command = |args| ForgeCommand {
        phase: "logic-scenario".into(),
        tool: "invaderEdit".into(),
        args,
        expected_outputs: vec![format!("tags/{}", tag.replace('\\', "/"))],
    };
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
            "-1",
        );
        if placement.tag_class == "mach" {
            set(&mut args, format!("{array}[{device_index}].machine_flags.does_not_operate_automatically"), "1");
        }
        args.push(tag.clone());
        let mut names = command(args);
        names.phase = "logic-names".into();
        commands.push(names);
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
    for (i, binding) in logic.devices.iter().enumerate() {
        let placement = doc.placements.iter().find(|p| p.id == binding.placement_id).unwrap();
        let array = if placement.tag_class == "ctrl" { "controls" } else { "machines" };
        let index = doc.placements.iter().filter(|p| p.tag_class == placement.tag_class)
            .position(|p| p.id == binding.placement_id).unwrap();
        if placement.tag_class == "ctrl" && matches!(binding.native_name.as_deref(), Some("extraction_deploy" | "extraction_activate")) {
            let actual = runner.run(edit, &["-t".into(), tags.clone(), "-G".into(), "triggers_when".into(),
                format!("{}.device_control", placement.tag_path)], workspace, "logic-control-readback", 72)?;
            if actual.trim().replace('_', " ") != "touched by player" {
                return invalid("Extraction terminal must use a native touched-by-player control tag. Its source was not modified; choose a compatible terminal.");
            }
        }
        for (key, expected) in [
            (
                format!("object_names[{i}].name"),
                device_name(logic, &binding.placement_id),
            ),
            (format!("{array}[{index}].name"), i.to_string()),
        ] {
            let actual = runner.run(
                edit,
                &["-t".into(), tags.clone(), "-G".into(), key, tag.clone()],
                workspace,
                "logic-readback",
                72,
            )?;
            if actual.trim() != expected {
                return invalid("Native logic object-name linkage failed independent readback");
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
    let read=if effective_logic(doc).is_some_and(|logic|!logic.devices.is_empty()||!logic.triggers.is_empty()) {
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
