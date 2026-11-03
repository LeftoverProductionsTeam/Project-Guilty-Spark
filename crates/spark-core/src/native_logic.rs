//! Optional authoring metadata -> ordinary scenario references and HaloScript.
//! No custom native tag fields, engine extension, shell command or runtime VM.
use crate::{
    invalid,
    quickforge::{ForgeCommand, QuickForgeDocument},
    Result,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Document {
    pub schema_version: u32,
    pub triggers: Vec<Trigger>,
    pub devices: Vec<Device>,
    pub rules: Vec<Rule>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub manual_source: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Trigger {
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
fn text(value: &str, max: usize) -> bool {
    !value.is_empty() && value.len() <= max && !value.chars().any(char::is_control)
}
fn unit(value: f32) -> bool {
    value.is_finite() && (0.0..=1.0).contains(&value)
}
fn seconds(value: f32) -> bool {
    value.is_finite() && (0.0..=3600.0).contains(&value)
}
pub fn validate(doc: &QuickForgeDocument) -> Result<()> {
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
    for trigger in &logic.triggers {
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
        if !devices.insert(binding.placement_id.as_str())
            || !unit(binding.initial_position)
            || !doc
                .placements
                .iter()
                .any(|p| p.id == binding.placement_id && p.tag_class == "mach")
        {
            return invalid("A logic device must reference one existing device_machine placement with position 0–1");
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
    Ok(())
}
fn real(v: f32) -> String {
    format!("{v:.6}")
}
fn ticks(v: f32) -> u32 {
    ((v * 30.).round() as u32).max(1)
}
fn volume(id: &str) -> String {
    format!("(volume_test_objects {} (players))", native_name("tv", id))
}
pub fn generate(doc: &QuickForgeDocument) -> Result<Option<Source>> {
    validate(doc)?;
    let Some(logic) = &doc.logic else {
        return Ok(None);
    };
    let mut lines = vec![
        "; Generated from Spark Logic / Events; ordinary Halo 1 HaloScript.".into(),
        "; Native named objects and volumes are supplied by the scenario plan.".into(),
        "(global boolean gs_logic_ready false)".into(),
        "(script startup gs_logic_init".into(),
    ];
    for device in &logic.devices {
        let name = native_name("obj", &device.placement_id);
        lines.extend([
            format!("  (device_operates_automatically_set {name} false)"),
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
                lines.push(format!("  (sleep_until {} 1)", volume(trigger_id)))
            }
            Event::Exit { trigger_id } => lines.extend([
                format!("  (sleep_until {} 1)", volume(trigger_id)),
                format!("  (sleep_until (not {}) 1)", volume(trigger_id)),
            ]),
            Event::Timer { seconds } => lines.push(format!("  (sleep {})", ticks(*seconds))),
        }
        if let Some(condition) = &rule.condition {
            lines.push(format!(
                "  (if (>= (device_get_position {}) {}) (begin",
                native_name("obj", &condition.target_id),
                real(condition.at_least)
            ));
        }
        for action in &rule.actions {
            lines.push(match action {
                Action::DevicePosition { target_id, value } => format!(
                    "  (device_set_position {} {})",
                    native_name("obj", target_id),
                    real(*value)
                ),
                Action::DevicePower { target_id, value } => format!(
                    "  (device_set_power {} {})",
                    native_name("obj", target_id),
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
                lines.push(format!("  (sleep_until (not {}) 1)", volume(trigger_id)));
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
        let machine_index = doc
            .placements
            .iter()
            .filter(|p| p.tag_class == "mach")
            .position(|p| p.id == device.placement_id)
            .unwrap();
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
            native_name("obj", &device.placement_id),
        );
        set(
            &mut args,
            format!("machines[{machine_index}].name"),
            i.to_string(),
        );
        set(
            &mut args,
            format!("machines[{machine_index}].power_group"),
            "-1",
        );
        set(
            &mut args,
            format!("machines[{machine_index}].position_group"),
            "-1",
        );
        set(
            &mut args,
            format!("machines[{machine_index}].machine_flags.does_not_operate_automatically"),
            "1",
        );
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
            native_name("tv", &trigger.id),
        );
        // Halo volume basis is forward/up, dimensions positive from one corner.
        // The editor currently exposes yaw-only volumes; reject tilted volumes
        // until their full native basis has independent acceptance.
        if trigger.rotation[0].abs() > 0.00001 || trigger.rotation[1].abs() > 0.00001 {
            return invalid("Native trigger volumes currently support yaw rotation; X/Y tilt is not implemented");
        }
        let (s, c) = trigger.rotation[2].sin_cos();
        let offset = [
            -trigger.dimensions[0] / 2.,
            -trigger.dimensions[1] / 2.,
            -trigger.dimensions[2] / 2.,
        ];
        let corner = [
            trigger.position[0] + c * offset[0] - s * offset[1],
            trigger.position[1] + s * offset[0] + c * offset[1],
            trigger.position[2] + offset[2],
        ];
        set(
            &mut args,
            format!("{prefix}.rotation_vector_forward"),
            vector([c, s, 0.]),
        );
        set(&mut args, format!("{prefix}.rotation_vector_up"), "0,0,1");
        set(
            &mut args,
            format!("{prefix}.starting_corner"),
            vector(corner),
        );
        set(
            &mut args,
            format!("{prefix}.ending_corner_offset"),
            vector(trigger.dimensions),
        );
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
pub fn script_path(workspace: &std::path::Path, scenario: &str) -> Result<std::path::PathBuf> {
    let scenario = crate::safe_relative(scenario)?;
    Ok(workspace
        .join("data")
        .join(scenario.parent().unwrap())
        .join("scripts/gs_logic.hsc"))
}
pub fn export(doc: &QuickForgeDocument, workspace: &std::path::Path, scenario: &str) -> Result<()> {
    if let Some(source) = generate(doc)? {
        let path = script_path(workspace, scenario)?;
        crate::reject_links(&path)?;
        if path.exists() {
            return invalid("Generated logic must not overwrite an existing handwritten script");
        }
        std::fs::create_dir_all(path.parent().unwrap())?;
        crate::project::atomic_write(&path, source.content.as_bytes(), false)?;
        crate::project::atomic_write(
            &workspace.join("logic-source-map.json"),
            &serde_json::to_vec_pretty(&source)?,
            false,
        )?;
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
    let logic = doc.logic.as_ref().unwrap();
    for (i, binding) in logic.devices.iter().enumerate() {
        let index = doc
            .placements
            .iter()
            .filter(|p| p.tag_class == "mach")
            .position(|p| p.id == binding.placement_id)
            .unwrap();
        for (key, expected) in [
            (
                format!("object_names[{i}].name"),
                native_name("obj", &binding.placement_id),
            ),
            (format!("machines[{index}].name"), i.to_string()),
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
    for i in 0..logic.triggers.len() {
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
    if crate::maps::hash_file(&path)? != source.sha256 {
        return invalid("Logic source changed after export; review the originating project revision before compiling");
    }
    // H1A recompiles source during build-cache-file. Its source indexing expects
    // the conventional globals file even when the level declares no globals.
    // Match the existing native machinima path, without replacing authored text.
    let globals = workspace.join("data/global_scripts.hsc");
    crate::reject_links(&globals)?;
    if engine == "mcc-cea" && !globals.exists() {
        crate::project::atomic_write(
            &globals,
            b"; Spark generated level: no additional global script definitions.\r\n",
            false,
        )?;
    }
    let limit = if engine == "mcc-cea" { 16 } else { 8 };
    let mut count = usize::from(globals.is_file());
    if globals.is_file() && std::fs::metadata(&globals)?.len() > 256 * 1024 {
        return invalid("Global HaloScript source exceeds the bounded source-file size");
    }
    for entry in std::fs::read_dir(path.parent().unwrap())? {
        let p = entry?.path();
        crate::reject_links(&p)?;
        if p.extension().is_some_and(|x| x == "hsc") {
            count += 1;
            if std::fs::metadata(&p)?.len() > 256 * 1024 {
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
pub fn verify_compiled(doc: &QuickForgeDocument, map: &crate::maps::MapInspection) -> Result<()> {
    let Some(source) = generate(doc)? else {
        return Ok(());
    };
    for name in std::iter::once("gs_logic_init")
        .chain(source.regions.iter().map(|r| r.native_name.as_str()))
    {
        if !map.scripts.iter().any(|script| script.name == name) {
            return invalid(format!(
                "Compiled native cache omits required Logic / Events script {name}"
            ));
        }
    }
    Ok(())
}
