//! Original source geometry and JMS 8200 export. No compiled BSP is patched.
//! Compiler execution and game deployment are separate, evidence-producing stages.
use crate::{
    invalid, maps, project::atomic_write, reject_links, runtime::RuntimeId, safe_relative, Result,
    SparkError,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    fmt::Write as _,
    fs,
    path::{Path, PathBuf},
};

pub const SCHEMA_VERSION: u32 = 1;
pub const MAX_BRUSHES: usize = 256;
pub const MAX_TRIANGLES: usize = 32_000;
fn yes() -> bool {
    true
}
fn steps_default() -> u16 {
    4
}
fn draft() -> String {
    "draft".into()
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QuickForgeDocument {
    pub schema_version: u32,
    pub name: String,
    pub template: String,
    pub runtime_id: RuntimeId,
    pub game_mode: String,
    pub geometry: Vec<ForgeBrush>,
    pub materials: Vec<ForgeMaterial>,
    pub placements: Vec<ForgePlacement>,
    pub spawns: Vec<ForgeSpawn>,
    pub objectives: Vec<ForgeObjective>,
    #[serde(default)]
    pub sky_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub environment: Option<EditorEnvironment>,
    #[serde(default = "draft")]
    pub build_quality: String,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditorEnvironment {
    pub preview_enabled: bool,
    pub sky_color: [f32; 3],
    pub ambient_color: [f32; 3],
    pub ambient_intensity: f32,
    pub sun_color: [f32; 3],
    pub sun_intensity: f32,
    pub sun_azimuth: f32,
    pub sun_elevation: f32,
    pub fog_enabled: bool,
    pub fog_color: [f32; 3],
    pub fog_near: f32,
    pub fog_far: f32,
}
impl Default for EditorEnvironment {
    fn default() -> Self { Self {
        preview_enabled:true, sky_color:[0.051,0.098,0.133],
        ambient_color:[0.69,0.83,0.91],ambient_intensity:0.75,
        sun_color:[1.0,0.92,0.77],sun_intensity:2.2,
        sun_azimuth:-35.0,sun_elevation:50.0,
        fog_enabled:false,fog_color:[0.30,0.43,0.51],fog_near:25.0,fog_far:180.0,
    } }
}
impl EditorEnvironment {
    pub fn validate(&self) -> Result<()> {
        for rgb in [self.sky_color,self.ambient_color,self.sun_color,self.fog_color] {
            if rgb.iter().any(|c| !c.is_finite() || !(0.0..=1.0).contains(c)) {
                return invalid("Environment RGB colors must be finite within 0..1");
            }
        }
        for (n,min,max) in [
            (self.ambient_intensity,0.0,5.0), (self.sun_intensity,0.0,10.0),
            (self.sun_azimuth,-180.0,180.0),(self.sun_elevation,-90.0,90.0),
            (self.fog_near,0.0,20000.0),(self.fog_far,1.0,20000.0),
        ] {
            if !n.is_finite() || n < min || n > max {return invalid("Environment brightness, sun or fog value out of bounds");}
        }
        if self.fog_far <= self.fog_near + 0.5 {return invalid("Fog far must exceed fog near by at least 0.5");}
        Ok(())
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BrushKind {
    Room,
    Box,
    Wall,
    Floor,
    Ramp,
    Stairs,
    Platform,
    /// Editable source-only heightfield; never edits a compiled BSP.
    Terrain,
    /// Manifold hollow shell with two open passages and closed rim walls.
    CaveTunnel,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ForgeBrush {
    pub id: String,
    pub name: String,
    pub kind: BrushKind,
    pub position: [f32; 3],
    pub rotation: [f32; 3],
    pub dimensions: [f32; 3],
    pub material_id: String,
    #[serde(default = "yes")]
    pub visible: bool,
    #[serde(default)]
    pub locked: bool,
    #[serde(default = "steps_default")]
    pub steps: u16,
    /// (steps + 1)^2 top-surface height offsets, terrain brushes only.
    #[serde(default)]
    pub heights: Vec<f32>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ForgeMaterial {
    pub id: String,
    pub name: String,
    pub shader_path: Option<String>,
    pub color: [f32; 3],
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ForgePlacement {
    pub id: String,
    pub name: String,
    pub tag_path: String,
    pub tag_class: String,
    pub position: [f32; 3],
    pub rotation: [f32; 3],
    pub team: i16,
    pub respawn_seconds: u16,
    #[serde(default)]
    pub tag_id: Option<u32>,
    #[serde(default)]
    pub source_project_id: Option<String>,
    #[serde(default)]
    pub source_sha256: Option<String>,
    #[serde(default = "yes")]
    pub visible: bool,
    #[serde(default)]
    pub locked: bool,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ForgeSpawn {
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub position: [f32; 3],
    pub facing: f32,
    pub team: i16,
    pub game_modes: Vec<String>,
    #[serde(default = "yes")]
    pub visible: bool,
    #[serde(default)]
    pub locked: bool,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ForgeObjective {
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub kind: String,
    pub position: [f32; 3],
    pub facing: f32,
    pub team: i16,
    pub sequence: u16,
    #[serde(default = "yes")]
    pub visible: bool,
    #[serde(default)]
    pub locked: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgeMesh {
    pub positions: Vec<f32>,
    pub normals: Vec<f32>,
    pub uvs: Vec<f32>,
    pub indices: Vec<u32>,
    pub parts: Vec<ForgeMeshPart>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgeMeshPart {
    pub brush_id: String,
    pub material_id: String,
    pub index_start: usize,
    pub index_count: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeometryIssue {
    pub severity: String,
    pub code: String,
    pub message: String,
    pub brush_ids: Vec<String>,
    pub triangle_indices: Vec<usize>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeometryReport {
    pub valid: bool,
    pub issues: Vec<GeometryIssue>,
    pub vertices: usize,
    pub triangles: usize,
    pub closed_components: usize,
    pub source_sha256: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgeDependency {
    pub kind: String,
    pub tag_path: String,
    pub tag_class: String,
    pub source_project_id: Option<String>,
    pub source_sha256: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgeCommand {
    pub phase: String,
    pub tool: String,
    pub args: Vec<String>,
    pub expected_outputs: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceExport {
    pub directory: PathBuf,
    pub document_path: PathBuf,
    pub jms_path: PathBuf,
    pub scenario_plan_path: PathBuf,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub environment_plan_path: Option<PathBuf>,
    pub source_sha256: String,
    pub jms_sha256: String,
    pub scenario_path: String,
    pub bsp_name: String,
    pub validation: GeometryReport,
    pub dependencies: Vec<ForgeDependency>,
    pub commands: Vec<ForgeCommand>,
    pub blockers: Vec<String>,
}

fn finite(v: &[f32]) -> bool {
    v.iter().all(|x| x.is_finite() && x.abs() <= 2048.0)
}
fn identifier(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.bytes()
            .all(|x| x.is_ascii_alphanumeric() || b"_-".contains(&x))
}
fn mode(s: &str) -> bool {
    [
        "slayer",
        "teamSlayer",
        "ctf",
        "king",
        "oddball",
        "race",
        "firefight",
        "zombie",
    ]
    .contains(&s)
}
/// Halo CE scenario `usage_id` (legacy HEK labels it team_index) is NOT
/// always a team: KOTH uses it to group polygon points, Oddball numbers ball
/// spawns, and Race numbers checkpoints. Older Guilty Spark projects wrote
/// the original sequence for hill/oddball while storing team=-1, so preserve
/// those records until explicitly migrated in the editor.
fn objective_usage_id(o: &ForgeObjective) -> u16 {
    if o.kind == "raceCheckpoint" || (o.team < 0 && (o.kind == "hill" || o.kind == "oddball")) {
        o.sequence
    } else {
        o.team.max(0) as u16
    }
}
fn netgame_flag_issues(doc: &QuickForgeDocument) -> Vec<GeometryIssue> {
    let mut findings = Vec::new();
    if doc.objectives.len() > 200 {
        findings.push(issue("CE_FLAG_LIMIT", "Classic HEK supports at most 200 netgame flags", vec![]));
    }
    let mut ctf = BTreeMap::<u16, Vec<&ForgeObjective>>::new();
    let mut balls = BTreeMap::<u16, Vec<&ForgeObjective>>::new();
    let mut race = BTreeMap::<u16, Vec<&ForgeObjective>>::new();
    let mut hills = BTreeMap::<u16, Vec<&ForgeObjective>>::new();
    let mut teleports_in = BTreeMap::<u16, Vec<&ForgeObjective>>::new();
    let mut teleports_out = BTreeMap::<u16, Vec<&ForgeObjective>>::new();
    let mut race_vehicle_count=0;
    for obj in &doc.objectives {
        if obj.kind == "ctfFlag" && !(0..=1).contains(&obj.team) {
            findings.push(issue("CE_CTF_TEAM_RANGE", "CTF flag usage ID must be team 0 or 1", vec![obj.id.clone()]));
        }
        if (obj.kind=="teleportFrom" || obj.kind=="teleportTo") && !(0..=15).contains(&obj.team) {
            findings.push(issue("CE_TELEPORT_CHANNEL_RANGE", "Teleporter channel must be 0..15; invalid indices are not silently mapped to zero", vec![obj.id.clone()]));
        }
        let id = objective_usage_id(obj);
        if obj.kind == "raceVehicle" {
            race_vehicle_count += 1;
            continue; // Halo ignores its usage_id; do not require uniqueness.
        }
        let (groups, max): (&mut BTreeMap<u16, Vec<&ForgeObjective>>, u16) = match obj.kind.as_str() {
            "ctfFlag" => (&mut ctf, 1),
            "oddball" => (&mut balls, 15),
            "raceCheckpoint" => (&mut race, 31),
            "hill" => (&mut hills, 15),
            "teleportFrom" => (&mut teleports_in, 15),
            "teleportTo" => (&mut teleports_out, 15),
            _ => continue,
        };
        if id > max {
            findings.push(issue("CE_USAGE_ID_RANGE", format!("{} usage ID {} exceeds {}", obj.kind, id, max), vec![obj.id.clone()]));
        }
        groups.entry(id).or_default().push(obj);
    }
    if race_vehicle_count > 16 {
        findings.push(issue("CE_RACE_VEHICLE_LIMIT", "Classic Halo CE supports at most 16 race vehicle markers", doc.objectives.iter().filter(|o|o.kind=="raceVehicle").map(|o|o.id.clone()).collect()));
    }
    // Teleporter channels link one or more entrances to one or more exits.
    // Never silently export an orphaned entrance that strands players.
    for channel in teleports_in.keys().chain(teleports_out.keys()).copied().collect::<std::collections::BTreeSet<_>>() {
        let entries = teleports_in.get(&channel).map(Vec::as_slice).unwrap_or(&[]);
        let exits = teleports_out.get(&channel).map(Vec::as_slice).unwrap_or(&[]);
        if entries.is_empty() || exits.is_empty() {
            findings.push(issue("CE_TELEPORT_CHANNEL_UNPAIRED", format!("Teleporter channel {channel} needs both an entrance and exit"), entries.iter().chain(exits.iter()).map(|o|o.id.clone()).collect()));
        }
    }
    // Halo 1 CTF validates team spawns by proximity to their own flag.
    // If every eligible start lies closer to the opposing flag, that team
    // can be left unable to respawn ("waiting for space to clear").
    if let (Some(a),Some(b))=(ctf.get(&0).and_then(|v|v.first()),ctf.get(&1).and_then(|v|v.first())) {
        for team in [0,1] {
            let (own,enemy)=if team==0 {(a.position,b.position)}else{(b.position,a.position)};
            let eligible:Vec<_>=doc.spawns.iter().filter(|s|
                s.team==team && s.game_modes.iter().any(|m|m=="allGames"||m=="ctf")
            ).collect();
            if !eligible.is_empty() && eligible.iter().all(|s| {
                let dist=|flag:[f32;3]| (0..3).map(|i|(s.position[i]-flag[i]).powi(2)).sum::<f32>();
                dist(own)>dist(enemy)
            }) {
                findings.push(issue("CE_CTF_SPAWN_PROXIMITY",format!("All team {team} CTF starts lie closer to the enemy flag; move starts or flags before export"),eligible.iter().map(|s|s.id.clone()).collect()));
            }
        }
    }
    for (group_name, groups) in [("ctf", &ctf), ("ball", &balls), ("race", &race)] {
        for (id, members) in groups {
            if members.len() > 1 {
                findings.push(issue("CE_DUPLICATE_USAGE_ID", format!("Duplicate {group_name} usage ID {id}"), members.iter().map(|o|o.id.clone()).collect()));
            }
        }
        if group_name != "ctf" {
            for (expected, id) in groups.keys().enumerate() {
                if *id != expected as u16 {
                    findings.push(issue("CE_INDEX_GAP", format!("{group_name} IDs must start at 0 and be consecutive"), vec![]));
                    break;
                }
            }
        }
    }
    // The game treats one flag as a 2x2 hill. Exactly two flags per usage ID
    // can crash Standalone; 3-8 flags define a convex XY polygon.
    for (id, members) in &hills {
        if members.len() == 2 || members.len() > 8 {
            findings.push(issue("CE_INVALID_HILL_COUNT", format!("Hill {id} has {} markers: only 1 or 3-8 are valid", members.len()), members.iter().map(|o|o.id.clone()).collect()));
        } else if members.len() >= 3 {
            let mut area_possible=false;
            let a=members[0].position;
            'triangles: for b in members.iter().skip(1) {
                for c in members.iter().skip(1) {
                    let cross=(b.position[0]-a[0])*(c.position[1]-a[1])-(b.position[1]-a[1])*(c.position[0]-a[0]);
                    if cross.abs()>0.001 {area_possible=true;break 'triangles;}
                }
            }
            let mut unique=true;
            for i in 0..members.len() {
                for j in i+1..members.len() {
                    let a=members[i].position;let b=members[j].position;
                    if (a[0]-b[0]).powi(2)+(a[1]-b[1]).powi(2)<1e-10 {unique=false;}
                }
            }
            if !area_possible || !unique {
                findings.push(issue("CE_DEGENERATE_HILL", format!("Hill {id} has collinear/duplicate polygon points"), members.iter().map(|o|o.id.clone()).collect()));
            }
        }
    }
    findings
}

fn hash<T: Serialize>(value: &T) -> Result<String> {
    Ok(format!("{:x}", Sha256::digest(serde_json::to_vec(value)?)))
}
pub fn validate_document(doc: &QuickForgeDocument) -> Result<()> {
    if doc.schema_version != SCHEMA_VERSION
        || doc.name.trim().is_empty()
        || doc.name.len() > 100
        || doc.name.chars().any(char::is_control)
        || doc.template.len() > 64
        || !mode(&doc.game_mode)
        || !["draft", "final"].contains(&doc.build_quality.as_str())
    {
        return invalid("Unsupported QuickForge schema, name, mode or build quality");
    }
    if doc.geometry.len() > MAX_BRUSHES
        || doc.materials.len() > 64
        || doc.placements.len() > 1024
        || doc.spawns.len() > 256
        || doc.objectives.len() > 200
    {
        return invalid("QuickForge document exceeds supported authoring limits");
    }
    let mut ids = HashSet::new();
    for (id, name) in doc
        .geometry
        .iter()
        .map(|x| (&x.id, &x.name))
        .chain(doc.placements.iter().map(|x| (&x.id, &x.name)))
        .chain(doc.spawns.iter().map(|x| (&x.id, &x.name)))
        .chain(doc.objectives.iter().map(|x| (&x.id, &x.name)))
    {
        if !identifier(id)
            || !ids.insert(id)
            || name.len() > 160
            || name.chars().any(char::is_control)
        {
            return invalid("QuickForge entity IDs must be unique and names bounded");
        }
    }
    let mut material_ids = HashSet::new();
    for m in &doc.materials {
        if !identifier(&m.id)
            || !material_ids.insert(&m.id)
            || !identifier(&m.name)
            || m.name.len() > 31
            || m.color
                .iter()
                .any(|v| !v.is_finite() || !(0.0..=1.0).contains(v))
        {
            return invalid("Invalid QuickForge material identifier or color");
        }
        if let Some(path) = &m.shader_path {
            safe_relative(path)?;
        }
    }
    if let Some(sky) = &doc.sky_path {
        safe_relative(sky)?;
    }
    if let Some(environment) = &doc.environment { environment.validate()?; }
    for b in &doc.geometry {
        if !finite(&b.position)
            || !finite(&b.rotation)
            || b.dimensions
                .iter()
                .any(|v| !v.is_finite() || *v < 0.1 || *v > 512.0)
            || !(1..=64).contains(&b.steps)
            || (b.kind == BrushKind::Terrain && (b.steps > 32 || !b.heights.is_empty() && b.heights.len() != (b.steps as usize + 1).pow(2)))
            || (b.kind != BrushKind::Terrain && !b.heights.is_empty())
            || (b.kind == BrushKind::CaveTunnel && b.steps < 8)
            || b.heights.iter().any(|h| !h.is_finite() || *h < -b.dimensions[2] + 0.1 || *h > 64.0)
        {
            return invalid("Brush transforms must be finite, dimensions 0.1–512 world units, and stairs 1–64 steps");
        }
    }
    for p in &doc.placements {
        safe_relative(&p.tag_path)?;
        if [
            ".weapon",
            ".equipment",
            ".vehicle",
            ".scenery",
            ".biped",
            ".item_collection",
        ]
        .iter()
        .any(|suffix| p.tag_path.ends_with(suffix))
        {
            return invalid("Asset tag paths must omit the tag class extension");
        }
        if !["scen", "weap", "eqip", "vehi", "bipd", "itmc"].contains(&p.tag_class.as_str())
            || !finite(&p.position)
            || !finite(&p.rotation)
            || !(-1..=15).contains(&p.team)
            || p.respawn_seconds > 32767
        {
            return invalid("Invalid asset placement class, transform or scenario values");
        }
        if p.source_project_id.is_some() != p.source_sha256.is_some() {
            return invalid("Imported asset provenance needs both project ID and source SHA-256");
        }
        if let Some(id) = &p.source_project_id {
            uuid::Uuid::parse_str(id)
                .map_err(|_| SparkError::Invalid("Invalid source project UUID".into()))?;
        }
        if let Some(sha) = &p.source_sha256 {
            if sha.len() != 64 || !sha.bytes().all(|b| b.is_ascii_hexdigit()) {
                return invalid("Invalid source asset SHA-256");
            }
        }
    }
    for s in &doc.spawns {
        if !finite(&s.position)
            || !finite(&[s.facing])
            || !(-1..=15).contains(&s.team)
            || s.game_modes.is_empty()
            || s.game_modes.len() > 4
            || s.game_modes.iter().any(|s| !mode(s) && s != "allGames")
        {
            return invalid("Invalid player spawn position, team or game modes");
        }
    }
    for o in &doc.objectives {
        if !finite(&o.position)
            || !finite(&[o.facing])
            || !(-1..=15).contains(&o.team)
            || !["ctfFlag", "hill", "oddball", "raceCheckpoint", "raceVehicle", "teleportFrom", "teleportTo"].contains(&o.kind.as_str())
        {
            return invalid("Invalid objective kind, position or team");
        }
    }
    Ok(())
}
pub fn create_arena(name: &str, template: &str) -> Result<QuickForgeDocument> {
    if ![
        "smallIndoorArena",
        "sealedArena", // Original Phase 3 API name; retain descriptor/client compatibility.
        "emptyArena",
        "symmetricalCtfArena",
        "guiltySparkTestArena",
        "vehicleCombatArena",
        "customBlank",
        "firefightArena",
        "zombieArena",
    ]
    .contains(&template)
    {
        return invalid("Unsupported QuickForge template");
    }
    let mut doc = QuickForgeDocument {
        schema_version: 1,
        name: name.into(),
        template: template.into(),
        runtime_id: RuntimeId::MccSteam,
        game_mode: "slayer".into(),
        geometry: vec![],
        materials: vec![ForgeMaterial {
            id: "surface".into(),
            name: "quickforge_surface".into(),
            shader_path: None,
            color: [0.25, 0.38, 0.48],
        }],
        placements: vec![],
        spawns: vec![],
        objectives: vec![],
        sky_path: None,
        environment: None,
        build_quality: draft(),
    };
    if ["customBlank", "blank"].contains(&template) {
        validate_document(&doc)?;
        return Ok(doc);
    }
    let (width, depth) = if template.to_ascii_lowercase().contains("vehicle") {
        (40.0, 48.0)
    } else {
        (24.0, 32.0)
    };
    let brush = |id: &str, name: &str, kind, position, dimensions| ForgeBrush {
        id: id.into(),
        name: name.into(),
        kind,
        position,
        rotation: [0.; 3],
        dimensions,
        material_id: "surface".into(),
        visible: true,
        locked: false,
        steps: 4,
        heights: vec![],
    };
    doc.geometry.push(brush(
        "arena-room",
        "Arena shell",
        BrushKind::Room,
        [0., 0., 4.],
        [width, depth, 8.],
    ));
    if !["emptyArena", "empty"].contains(&template) {
        doc.geometry.push(brush(
            "ramp",
            "Central ramp",
            BrushKind::Ramp,
            [0., 2., 1.02],
            [3., 6., 2.],
        ));
        for (i, [x, y]) in [[-5., -4.], [5., 4.], [-5., 7.], [5., -7.]]
            .into_iter()
            .enumerate()
        {
            doc.geometry.push(brush(
                &format!("cover-{i}"),
                &format!("Cover {}", i + 1),
                BrushKind::Box,
                [x, y, 0.77],
                [2., 2., 1.5],
            ));
        }
    }
    for (i, [x, y]) in [
        [-width / 3., -depth / 3.],
        [width / 3., depth / 3.],
        [-width / 3., depth / 3.],
        [width / 3., -depth / 3.],
    ]
    .into_iter()
    .enumerate()
    {
        doc.spawns.push(ForgeSpawn {
            id: format!("spawn-{i}"),
            name: format!("Player start {}", i + 1),
            position: [x, y, 0.1],
            facing: if y < 0. {
                std::f32::consts::FRAC_PI_2
            } else {
                -std::f32::consts::FRAC_PI_2
            },
            team: (i % 2) as i16,
            game_modes: vec!["slayer".into()],
            visible: true,
            locked: false,
        });
    }
    if template.to_ascii_lowercase().contains("ctf") {
        doc.game_mode = "ctf".into();
        for s in &mut doc.spawns {
            s.game_modes = vec!["ctf".into()];
            s.team = if s.position[1] < 0. { 0 } else { 1 };
        }
        for (team, y) in [(0, -depth / 3.), (1, depth / 3.)] {
            doc.objectives.push(ForgeObjective {
                id: format!("flag-{team}"),
                name: format!("Team {team} flag"),
                kind: "ctfFlag".into(),
                position: [0., y, 0.1],
                facing: 0.,
                team,
                sequence: 0,
                visible: true,
                locked: false,
            });
        }
    } else if template == "guiltySparkTestArena" {
        // A direct native call (without a wizard-supplied target) should not
        // silently default this classic Halo CE scenario QA map to MCC.
        doc.runtime_id = RuntimeId::HaloCustomEdition;
        // Source-only, original geometry regression arena for every stock H1
        // multiplayer game mode. Halo Tool, correct source tags, and an actual
        // live engine test are still required before calling it playable.
        // Bungie's Halo PC editing guidance recommends 16 player starts per
        // team. This is an authoring capacity target, not game/clearance proof.
        // Preserve broad separation and avoid the arena's ramp / cover bounds.
        doc.spawns.clear();
        for (team, row_y) in [(0_i16, [-12.0_f32, -9.0, -6.0, -3.0]),
                              (1_i16, [3.0_f32, 6.0, 9.0, 12.0])] {
            for (row, y) in row_y.into_iter().enumerate() {
                for (column, x) in [-9.0_f32, -3.0, 3.0, 9.0].into_iter().enumerate() {
                    let index = row * 4 + column;
                    doc.spawns.push(ForgeSpawn {
                        id: format!("test-start-team-{team}-{index}"),
                        name: format!("Team {team} start {}", index + 1),
                        position: [x, y, 0.1],
                        facing: if team == 0 { std::f32::consts::FRAC_PI_2 }
                                else { -std::f32::consts::FRAC_PI_2 },
                        team,
                        game_modes: vec!["allGames".into()],
                        visible: true,
                        locked: false,
                    });
                }
            }
        }
        let mark = |id: &str, kind: &str, position: [f32; 3], usage: i16, sequence: u16| ForgeObjective {
            id: id.into(), name: id.replace('-', " "), kind: kind.into(), position,
            facing: 0., team: usage, sequence, visible: true, locked: false,
        };
        doc.objectives.push(mark("test-ctf-red", "ctfFlag", [0., -10.5, 0.15], 0, 0));
        doc.objectives.push(mark("test-ctf-blue", "ctfFlag", [0., 10.5, 0.15], 1, 0));
        // Two separate 4-corner convex hills also allow a Crazy King test.
        // Do NOT create a 2-marker hill: it can crash Halo CE Standalone.
        for (hill, cy) in [(0_i16, -3_f32), (1_i16, 8_f32)] {
            for (corner, (x,y)) in [(-1.5_f32,-1.5_f32),(1.5,-1.5),(1.5,1.5),(-1.5,1.5)].into_iter().enumerate() {
                doc.objectives.push(mark(&format!("test-hill-{hill}-{corner}"),"hill",[x,cy+y,0.15],hill,corner as u16));
            }
        }
        doc.objectives.push(mark("test-oddball-0", "oddball", [0.,-7.,0.15], 0, 0));
        for (i, (x,y)) in [(-8_f32,-8_f32),(-8.,8.),(8.,8.),(8.,-8.)].into_iter().enumerate() {
            doc.objectives.push(mark(&format!("test-race-{i}"),"raceCheckpoint",[x,y,0.15],0,i as u16));
        }
        // Race vehicle START flags are not the same thing as resolved vehicle
        // palette/tag data. No vehicle objects or licensed assets are shipped.
        for (i, (x,y)) in [(-8_f32,-10_f32),(-6.,-10.),(6.,10.),(8.,10.)].into_iter().enumerate() {
            doc.objectives.push(mark(&format!("test-race-vehicle-{i}"),"raceVehicle",[x,y,0.15],i as i16,0));
        }
        doc.objectives.push(mark("test-teleport-in", "teleportFrom", [-9.,0.,0.15], 0, 0));
        doc.objectives.push(mark("test-teleport-out", "teleportTo", [9.,0.,0.15], 0, 0));
        // Deliberately no stock-game asset or fake vehicle: real placements
        // must come from a provenance-checked user-owned Halo tag extraction.
    } else if template.to_ascii_lowercase().contains("firefight")
        || template.to_ascii_lowercase().contains("zombie")
    {
        doc.game_mode = if template.to_ascii_lowercase().contains("zombie") {
            "zombie"
        } else {
            "firefight"
        }
        .into();
        for s in &mut doc.spawns {
            s.game_modes = vec![doc.game_mode.clone()];
            s.team = 0;
        }
    }
    validate_document(&doc)?;
    Ok(doc)
}

fn sub(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
fn cross(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
fn dot(a: [f32; 3], b: [f32; 3]) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn rotate_axis(mut p: [f32; 3], axis: usize, angle: f32) -> [f32; 3] {
    let (a, b) = match axis {
        0 => (1, 2),
        1 => (2, 0),
        _ => (0, 1),
    };
    let (s, c) = angle.sin_cos();
    let x = p[a];
    p[a] = c * x - s * p[b];
    p[b] = s * x + c * p[b];
    p
}
fn transform(p: [f32; 3], b: &ForgeBrush) -> [f32; 3] {
    let mut v = p;
    for axis in (0..3).rev() {
        v = rotate_axis(v, axis, b.rotation[axis]);
    }
    for (i, x) in v.iter_mut().enumerate() {
        *x += b.position[i];
    }
    v
}
fn local(p: [f32; 3], b: &ForgeBrush) -> [f32; 3] {
    let mut v = sub(p, b.position);
    for axis in 0..3 {
        v = rotate_axis(v, axis, -b.rotation[axis]);
    }
    v
}
type Tri = [[f32; 3]; 3];
fn quad(out: &mut Vec<Tri>, vertices: &[[f32; 3]], q: [usize; 4]) {
    out.push([vertices[q[0]], vertices[q[1]], vertices[q[2]]]);
    out.push([vertices[q[0]], vertices[q[2]], vertices[q[3]]]);
}
// Geometry source primitives: each primitive forms a closed, oriented shell.
// Terrain edits adjust its top grid, with bottom and perimeter walls rebuilt.
// Tunnel is a hollow annulus with a traversable void at each end; the solid
// ring is manifold, but it is NOT unioned to another BSP or assigned portals.
fn quad_pts(out: &mut Vec<Tri>, a:[f32;3], c:[f32;3], d:[f32;3], e:[f32;3]) {
    quad(out, &[a,c,d,e], [0,1,2,3]);
}
fn terrain_tris(b:&ForgeBrush, out:&mut Vec<Tri>, joined:[bool;4]) {
    let n=b.steps as usize;
    let [x,y,z]=b.dimensions.map(|v|v*0.5);
    let top=|i:usize,j:usize| -> [f32;3] {
        let dx=i as f32/n as f32;
        let dy=j as f32/n as f32;
        let h=b.heights.get(j*(n+1)+i).copied().unwrap_or(0.);
        [-x+2.*x*dx,-y+2.*y*dy,z+h]
    };
    let bottom=|i:usize,j:usize| -> [f32;3] {
        [-x+2.*x*i as f32/n as f32,-y+2.*y*j as f32/n as f32,-z]
    };
    for j in 0..n { for i in 0..n {
        quad_pts(out,top(i,j),top(i+1,j),top(i+1,j+1),top(i,j+1));
        quad_pts(out,bottom(i,j),bottom(i,j+1),bottom(i+1,j+1),bottom(i+1,j));
    }}
    for i in 0..n {
        if !joined[2] {quad_pts(out,bottom(i,0),bottom(i+1,0),top(i+1,0),top(i,0));}
        if !joined[3] {quad_pts(out,top(i,n),top(i+1,n),bottom(i+1,n),bottom(i,n));}
    }
    for j in 0..n {
        if !joined[0] {quad_pts(out,top(0,j),top(0,j+1),bottom(0,j+1),bottom(0,j));}
        if !joined[1] {quad_pts(out,bottom(n,j),bottom(n,j+1),top(n,j+1),top(n,j));}
    }
}
fn cave_tunnel_tris(b:&ForgeBrush,out:&mut Vec<Tri>,joined:[bool;2]) {
    let n=b.steps as usize;
    let [x,y,z]=b.dimensions.map(|v|v*0.5);
    let ring=|i:usize,far:bool,inner:bool| -> [f32;3] {
        let a=(i%n) as f32*std::f32::consts::TAU/n as f32;
        let ratio=if inner {0.75}else{1.};
        [x*ratio*a.cos(),if far {y} else {-y},z*ratio*a.sin()]
    };
    for i in 0..n {
        let j=(i+1)%n;
        quad_pts(out,ring(i,false,false),ring(i,true,false),ring(j,true,false),ring(j,false,false));
        quad_pts(out,ring(j,false,true),ring(j,true,true),ring(i,true,true),ring(i,false,true));
        if !joined[0] {quad_pts(out,ring(i,false,false),ring(j,false,false),ring(j,false,true),ring(i,false,true));}
        if !joined[1] {quad_pts(out,ring(j,true,false),ring(i,true,false),ring(i,true,true),ring(j,true,true));}
    }
}
fn brush_triangles_with_joins(b: &ForgeBrush, joined:[bool;2], terrain_joined:[bool;4]) -> Result<Vec<Tri>> {
    let [x, y, z] = b.dimensions.map(|v| v * 0.5);
    let mut out = vec![];
    if b.kind == BrushKind::Terrain {
        terrain_tris(b,&mut out,terrain_joined);
    } else if b.kind == BrushKind::CaveTunnel {
        cave_tunnel_tris(b,&mut out,joined);
    } else if b.kind == BrushKind::Ramp {
        let v = [
            [-x, -y, -z],
            [x, -y, -z],
            [x, y, -z],
            [-x, y, -z],
            [x, y, z],
            [-x, y, z],
        ];
        for q in [[0, 3, 2, 1], [0, 1, 4, 5], [3, 5, 4, 2]] {
            quad(&mut out, &v, q);
        }
        out.push([v[0], v[5], v[3]]);
        out.push([v[1], v[2], v[4]]);
    } else if b.kind == BrushKind::Stairs {
        let n = b.steps as usize;
        let mut polygon = vec![[-y, -z], [y, -z], [y, z]];
        for step in (1..=n).rev() {
            let py = -y + 2. * y * (step - 1) as f32 / n as f32;
            polygon.push([py, -z + 2. * z * step as f32 / n as f32]);
            if step > 1 {
                polygon.push([py, -z + 2. * z * (step - 1) as f32 / n as f32]);
            }
        }
        let side = triangulate_polygon(&polygon)?;
        for t in side {
            let a = t.map(|i| [-x, polygon[i][0], polygon[i][1]]);
            out.push([a[2], a[1], a[0]]);
            out.push(t.map(|i| [x, polygon[i][0], polygon[i][1]]));
        }
        for i in 0..polygon.len() {
            let j = (i + 1) % polygon.len();
            let v = [
                [-x, polygon[i][0], polygon[i][1]],
                [-x, polygon[j][0], polygon[j][1]],
                [x, polygon[j][0], polygon[j][1]],
                [x, polygon[i][0], polygon[i][1]],
            ];
            quad(&mut out, &v, [0, 1, 2, 3]);
        }
    } else {
        let v = [
            [-x, -y, -z],
            [x, -y, -z],
            [x, y, -z],
            [-x, y, -z],
            [-x, -y, z],
            [x, -y, z],
            [x, y, z],
            [-x, y, z],
        ];
        for q in [
            [0, 3, 2, 1],
            [4, 5, 6, 7],
            [0, 1, 5, 4],
            [1, 2, 6, 5],
            [2, 3, 7, 6],
            [3, 0, 4, 7],
        ] {
            quad(&mut out, &v, q);
        }
        if b.kind == BrushKind::Room {
            for t in &mut out {
                t.swap(0, 2);
            }
        }
    }
    for t in &mut out {
        for p in t {
            *p = transform(*p, b);
        }
    }
    Ok(out)
}
fn triangulate_polygon(p: &[[f32; 2]]) -> Result<Vec<[usize; 3]>> {
    fn area(a: [f32; 2], b: [f32; 2], c: [f32; 2]) -> f32 {
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    }
    let mut active: Vec<_> = (0..p.len()).collect();
    let mut triangles = vec![];
    while active.len() > 3 {
        let mut found = None;
        for i in 0..active.len() {
            let a = active[(i + active.len() - 1) % active.len()];
            let b = active[i];
            let c = active[(i + 1) % active.len()];
            if area(p[a], p[b], p[c]) <= 1e-7 {
                continue;
            }
            if active.iter().copied().any(|j| {
                j != a
                    && j != b
                    && j != c
                    && area(p[a], p[b], p[j]) >= -1e-7
                    && area(p[b], p[c], p[j]) >= -1e-7
                    && area(p[c], p[a], p[j]) >= -1e-7
            }) {
                continue;
            }
            found = Some((i, [a, b, c]));
            break;
        }
        let (i, t) = found.ok_or_else(|| {
            SparkError::Invalid("Stair cross-section could not be triangulated".into())
        })?;
        triangles.push(t);
        active.remove(i);
    }
    triangles.push([active[0], active[1], active[2]]);
    Ok(triangles)
}
// Connect only exact, oppositely facing polygonal tunnel rims. This welds
// source triangles at a shared seam by removing their duplicate annular caps.
// It does NOT cut openings in imported BSPs/rooms or create Halo PVS, portals,
// navigation or collision tags. Uncertain, overlapping, or T-junction seams
// are deliberately left unmerged and subsequently rejected by validation.
fn brush_triangles(b: &ForgeBrush) -> Result<Vec<Tri>> {
    brush_triangles_with_joins(b,[false,false],[false;4])
}
#[derive(Clone)]
struct TunnelEnd {
    brush:usize,
    end:usize, // 0=near, 1=far
    center:[f32;3],
    outward:[f32;3],
    outer:Vec<(i64,i64,i64)>,
    inner:Vec<(i64,i64,i64)>,
}
fn tunnel_end(b:&ForgeBrush,brush:usize,end:usize)->TunnelEnd {
    let far=end==1;
    let sign=if far {1.} else {-1.};
    let center=transform([0.,sign*b.dimensions[1]*0.5,0.],b);
    let world_direction=transform([0.,sign,0.],b);
    let outward=sub(world_direction,b.position);
    let quant=|p:[f32;3]| -> (i64,i64,i64) {
        ((p[0] as f64*1e6).round() as i64,(p[1] as f64*1e6).round() as i64,(p[2] as f64*1e6).round() as i64)
    };
    let n=b.steps as usize;
    let mut outer=vec![];
    let mut inner=vec![];
    for i in 0..n {
        let a=(i as f32)*std::f32::consts::TAU/n as f32;
        for (is_inner,points) in [(false,&mut outer),(true,&mut inner)] {
            let scale=if is_inner {0.75} else {1.};
            points.push(quant(transform([b.dimensions[0]*0.5*scale*a.cos(),sign*b.dimensions[1]*0.5,b.dimensions[2]*0.5*scale*a.sin()],b)));
        }
    }
    outer.sort_unstable();inner.sort_unstable();
    TunnelEnd{brush,end,center,outward,outer,inner}
}
fn tunnel_weld_pairs(doc:&QuickForgeDocument)->Vec<(usize,usize,usize,usize)> {
    let mut ports=vec![];
    for (i,b) in doc.geometry.iter().enumerate() {
        if b.kind==BrushKind::CaveTunnel {
            ports.push(tunnel_end(b,i,0));ports.push(tunnel_end(b,i,1));
        }
    }
    let mut possible=vec![vec![];ports.len()];
    for i in 0..ports.len() {
        for j in i+1..ports.len() {
            let a=&ports[i];let b=&ports[j];
            if a.brush==b.brush || a.outer!=b.outer || a.inner!=b.inner {continue;}
            let delta=sub(a.center,b.center);
            if dot(delta,delta)>0.000001 {continue;}
            if dot(a.outward,b.outward)>-0.9999 {continue;}
            possible[i].push(j);possible[j].push(i);
        }
    }
    // Exactly one counterpart on each side. Ambiguous 3-way joints must not
    // be silently merged: they would create non-manifold BSP geometry.
    let mut pairs=vec![];
    for i in 0..ports.len() {
        if possible[i].len()!=1 {continue;}
        let j=possible[i][0];
        if i>=j || possible[j].len()!=1 || possible[j][0]!=i {continue;}
        pairs.push((ports[i].brush,ports[i].end,ports[j].brush,ports[j].end));
    }
    pairs
}
// Match only full terrain-tile border edges at equal source heights. Removing
// internal perimeter walls creates one source manifold across adjacent tiles.
// No Boolean cut, automatic nav mesh, portals, lighting or compiled Halo collision.
// Side order: 0=x-, 1=x+, 2=y-, 3=y+.
fn terrain_weld_pairs(doc:&QuickForgeDocument)->Vec<(usize,usize,usize,usize)> {
    let mut candidates: Vec<(usize,usize,usize,usize)>=Vec::new();
    for i in 0..doc.geometry.len() {
        let a=&doc.geometry[i];
        if a.kind!=BrushKind::Terrain || a.rotation.iter().any(|x|x.abs()>1e-6) {continue;}
        for j in i+1..doc.geometry.len() {
            let b=&doc.geometry[j];
            if b.kind!=BrushKind::Terrain || b.rotation.iter().any(|x|x.abs()>1e-6)
                || a.steps!=b.steps || a.steps<2
                || (0..3).any(|axis|(a.dimensions[axis]-b.dimensions[axis]).abs()>1e-5)
                || (a.position[2]-b.position[2]).abs()>1e-5 {continue;}
            let near=|v:f32,w:f32|(v-w).abs()<1e-5;
            let dx=b.position[0]-a.position[0];
            let dy=b.position[1]-a.position[1];
            let side=if near(dx,a.dimensions[0]) && near(dy,0.) {Some((1usize,0usize))}
                else if near(dx,-a.dimensions[0]) && near(dy,0.) {Some((0usize,1usize))}
                else if near(dy,a.dimensions[1]) && near(dx,0.) {Some((3usize,2usize))}
                else if near(dy,-a.dimensions[1]) && near(dx,0.) {Some((2usize,3usize))}
                else {None};
            let Some((sa,sb))=side else {continue};
            let n=a.steps as usize;
            let height=|brush:&ForgeBrush,side:usize,k:usize|->f32 {
                let (x,y)=match side {0=>(0,k),1=>(n,k),2=>(k,0),_=>(k,n)};
                brush.heights.get(y*(n+1)+x).copied().unwrap_or(0.)
            };
            if (0..=n).all(|k|(height(a,sa,k)-height(b,sb,k)).abs()<1e-5) {
                candidates.push((i,sa,j,sb));
            }
        }
    }
    candidates.iter().copied().filter(|&(a,sa,b,sb)|{
        candidates.iter().filter(|&&(x,sx,y,sy)|(x==a&&sx==sa)||(y==a&&sy==sa)).count()==1 &&
        candidates.iter().filter(|&&(x,sx,y,sy)|(x==b&&sx==sb)||(y==b&&sy==sb)).count()==1
    }).collect()
}

pub fn preview_mesh(doc: &QuickForgeDocument) -> Result<ForgeMesh> {
    validate_document(doc)?;
    let mut mesh = ForgeMesh {
        positions: vec![],
        normals: vec![],
        uvs: vec![],
        indices: vec![],
        parts: vec![],
    };
    let pairs=tunnel_weld_pairs(doc);
    let mut masks=vec![[false,false];doc.geometry.len()];
    for (a,ea,b,eb) in pairs {masks[a][ea]=true;masks[b][eb]=true;}
    let mut terrain_masks=vec![[false;4];doc.geometry.len()];
    for (a,ea,b,eb) in terrain_weld_pairs(doc) {
        terrain_masks[a][ea]=true;terrain_masks[b][eb]=true;
    }
    for (brush_index,b) in doc.geometry.iter().enumerate() {
        let start = mesh.indices.len();
        for tri in brush_triangles_with_joins(b,masks[brush_index],terrain_masks[brush_index])? {
            if mesh.indices.len() / 3 >= MAX_TRIANGLES {
                return invalid("QuickForge mesh exceeds 32,000-triangle compilation budget");
            }
            let n = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]));
            let len = dot(n, n).sqrt();
            if len < 1e-8 {
                return invalid("Primitive generated a degenerate triangle");
            }
            let n = n.map(|v| v / len);
            let axis = (0..3)
                .max_by(|a, b| n[*a].abs().total_cmp(&n[*b].abs()))
                .unwrap();
            for v in tri {
                mesh.indices.push((mesh.positions.len() / 3) as u32);
                mesh.positions.extend(v);
                mesh.normals.extend(n);
                let uv = match axis {
                    0 => [v[1], v[2]],
                    1 => [v[0], v[2]],
                    _ => [v[0], v[1]],
                };
                mesh.uvs.extend(uv);
            }
        }
        mesh.parts.push(ForgeMeshPart {
            brush_id: b.id.clone(),
            material_id: b.material_id.clone(),
            index_start: start,
            index_count: mesh.indices.len() - start,
        });
    }
    Ok(mesh)
}
fn issue(code: &str, message: impl Into<String>, brush_ids: Vec<String>) -> GeometryIssue {
    GeometryIssue {
        severity: "error".into(),
        code: code.into(),
        message: message.into(),
        brush_ids,
        triangle_indices: vec![],
    }
}
pub fn validate_mesh(mesh: &ForgeMesh) -> Vec<GeometryIssue> {
    let mut issues = vec![];
    let count = mesh.positions.len() / 3;
    if !mesh.positions.len().is_multiple_of(3)
        || mesh.normals.len() != mesh.positions.len()
        || mesh.uvs.len() != count * 2
        || !mesh.indices.len().is_multiple_of(3)
        || mesh.indices.len() / 3 > MAX_TRIANGLES
    {
        issues.push(issue(
            "MESH_LAYOUT",
            "Mesh array lengths or complexity are invalid",
            vec![],
        ));
        return issues;
    }
    if mesh
        .positions
        .iter()
        .chain(mesh.normals.iter())
        .chain(mesh.uvs.iter())
        .any(|v| !v.is_finite() || v.abs() > 2048.)
    {
        issues.push(issue(
            "MESH_BOUNDS",
            "Mesh has non-finite or unsupported coordinates",
            vec![],
        ));
        return issues;
    }
    type Point = (i64, i64, i64);
    let point = |i: usize| -> Point {
        let a = &mesh.positions[i * 3..i * 3 + 3];
        (
            (a[0] as f64 * 1e6).round() as i64,
            (a[1] as f64 * 1e6).round() as i64,
            (a[2] as f64 * 1e6).round() as i64,
        )
    };
    let mut edges: BTreeMap<(Point, Point), (usize, i32)> = BTreeMap::new();
    // QuickForge duplicates vertices across flat-shaded triangles. Detect
    // duplicate collidable faces by *quantized world coordinates*, not indices:
    // opposite winding alone cannot make two coincident triangles safe.
    let mut faces: BTreeMap<[Point; 3], usize> = BTreeMap::new();
    for (ti, t) in mesh.indices.as_chunks::<3>().0.iter().enumerate() {
        if t.iter().any(|i| *i as usize >= count) {
            let mut e = issue(
                "INVALID_INDEX",
                "Triangle references a missing vertex",
                vec![],
            );
            e.triangle_indices.push(ti);
            issues.push(e);
            continue;
        }
        let mut face = [point(t[0] as usize), point(t[1] as usize), point(t[2] as usize)];
        face.sort();
        if let Some(previous) = faces.insert(face, ti) {
            let mut e = issue(
                "DUPLICATE_COLLISION_FACE",
                "Two source faces occupy the same triangle; remove the duplicate before exporting Halo BSP collision",
                vec![],
            );
            e.triangle_indices.extend([previous, ti]);
            issues.push(e);
        }
        let a: [f32; 3] = mesh.positions[t[0] as usize * 3..t[0] as usize * 3 + 3]
            .try_into()
            .unwrap();
        let b: [f32; 3] = mesh.positions[t[1] as usize * 3..t[1] as usize * 3 + 3]
            .try_into()
            .unwrap();
        let c: [f32; 3] = mesh.positions[t[2] as usize * 3..t[2] as usize * 3 + 3]
            .try_into()
            .unwrap();
        let n = cross(sub(b, a), sub(c, a));
        if dot(n, n) < 1e-10 {
            let mut e = issue(
                "DEGENERATE_TRIANGLE",
                "Triangle has zero or negligible area",
                vec![],
            );
            e.triangle_indices.push(ti);
            issues.push(e);
        }
        for index in t {
            let normal: [f32; 3] = mesh.normals[*index as usize * 3..*index as usize * 3 + 3]
                .try_into()
                .unwrap();
            if (dot(normal, normal) - 1.).abs() > 0.01 || dot(normal, n) <= 0. {
                let mut e = issue(
                    "INVALID_NORMAL",
                    "Vertex normal disagrees with face winding",
                    vec![],
                );
                e.triangle_indices.push(ti);
                issues.push(e);
                break;
            }
        }
        for (i, j) in [(0, 1), (1, 2), (2, 0)] {
            let a = point(t[i] as usize);
            let b = point(t[j] as usize);
            let (key, dir) = if a < b { ((a, b), 1) } else { ((b, a), -1) };
            let entry = edges.entry(key).or_default();
            entry.0 += 1;
            entry.1 += dir;
        }
    }
    let open = edges.values().filter(|(n, _)| *n == 1).count();
    let nonmanifold = edges
        .values()
        .filter(|(n, d)| *n > 2 || (*n == 2 && *d != 0))
        .count();
    if open > 0 {
        issues.push(issue(
            "OPEN_EDGES",
            format!("{open} boundary edges leave the geometry unsealed"),
            vec![],
        ));
    }
    if nonmanifold > 0 {
        issues.push(issue(
            "NON_MANIFOLD",
            format!("{nonmanifold} edges have overlapping faces or inconsistent winding"),
            vec![],
        ));
    }
    issues
}
pub fn validate(doc: &QuickForgeDocument) -> Result<GeometryReport> {
    validate_document(doc)?;
    let mesh = preview_mesh(doc)?;
    let mut issues = validate_mesh(&mesh);
    issues.extend(netgame_flag_issues(doc));
    for item in &mut issues {
        for part in &mesh.parts {
            if item
                .triangle_indices
                .iter()
                .any(|t| *t * 3 >= part.index_start && *t * 3 < part.index_start + part.index_count)
            {
                item.brush_ids.push(part.brush_id.clone());
            }
        }
    }
    let rooms: Vec<_> = doc
        .geometry
        .iter()
        .filter(|b| b.kind == BrushKind::Room)
        .collect();
    if rooms.len() != 1 {
        issues.push(issue("SEALED_ROOM_REQUIRED","The first BSP pipeline requires exactly one sealed Room shell; joined-room CSG is not implemented",rooms.iter().map(|b|b.id.clone()).collect()));
    }
    for b in &doc.geometry {
        if !doc.materials.iter().any(|m| m.id == b.material_id) {
            issues.push(issue(
                "MISSING_MATERIAL",
                format!("Brush '{}' has no matching material", b.name),
                vec![b.id.clone()],
            ));
        }
    }
    if let Some(room) = rooms.first() {
        for b in doc.geometry.iter().filter(|b| b.kind != BrushKind::Room) {
            if brush_triangles(b)?.iter().flatten().any(|v| {
                let p = local(*v, room);
                (0..3).any(|i| p[i].abs() >= room.dimensions[i] * 0.5 - 0.001)
            }) {
                issues.push(issue(
                    "BRUSH_OUTSIDE_ROOM",
                    "Solid brush touches or crosses the sealed shell; CSG welding is required",
                    vec![b.id.clone(), room.id.clone()],
                ));
            }
        }
        for spawn in &doc.spawns {
            let p = local(spawn.position, room);
            if p[0].abs() > room.dimensions[0] * 0.5 - 0.5
                || p[1].abs() > room.dimensions[1] * 0.5 - 0.5
                || p[2] < -room.dimensions[2] * 0.5 + 0.01
                || p[2] > room.dimensions[2] * 0.5 - 0.8
            {
                issues.push(issue(
                    "UNSAFE_SPAWN",
                    format!("Spawn '{}' lacks room clearance", spawn.id),
                    vec![spawn.id.clone()],
                ));
            }
            for solid in doc.geometry.iter().filter(|b| b.kind != BrushKind::Room) {
                let p = local(spawn.position, solid);
                if p[0].abs() < solid.dimensions[0] * 0.5 + 0.3
                    && p[1].abs() < solid.dimensions[1] * 0.5 + 0.3
                    && p[2] > -solid.dimensions[2] * 0.5 - 0.7
                    && p[2] < solid.dimensions[2] * 0.5 + 0.01
                {
                    issues.push(issue(
                        "SPAWN_SOLID_COLLISION",
                        "Spawn overlaps a solid's conservative collision bounds",
                        vec![spawn.id.clone(), solid.id.clone()],
                    ));
                }
            }
        }
        for p in doc
            .placements
            .iter()
            .map(|p| (&p.id, p.position))
            .chain(doc.objectives.iter().map(|p| (&p.id, p.position)))
        {
            let v = local(p.1, room);
            if (0..3).any(|i| v[i].abs() >= room.dimensions[i] * 0.5) {
                issues.push(issue(
                    "PLACEMENT_OUTSIDE_ROOM",
                    "Scenario element is outside the sealed space",
                    vec![p.0.clone()],
                ));
            }
        }
    }
    // A matched tunnel seam has coincident boundaries with removed duplicate
    // caps. Only exempt that contact from the old overlapping-brush check if
    // the axis-aligned AABBs meet on a plane rather than overlap in volume.
    let welded=tunnel_weld_pairs(doc);
    let joined_terrain=terrain_weld_pairs(doc);
    for &(a,_,b,_) in &joined_terrain {
        let mut note=issue("TERRAIN_SOURCE_SEAM", "Matched sculpted terrain heightfield edges; removed duplicate internal walls from source mesh. Final Halo collision must be compiled/tested",vec![doc.geometry[a].id.clone(),doc.geometry[b].id.clone()]);
        note.severity="warning".into(); issues.push(note);
    }
    for &(a,_,b,_) in &welded {
        let mut note=issue("TUNNEL_SOURCE_SEAM", "Joined a matching cave seam in source geometry. Halo structure/portal/PVS/nav/collision still require compiler validation",vec![doc.geometry[a].id.clone(),doc.geometry[b].id.clone()]);
        note.severity="warning".into();issues.push(note);
    }
    let solids: Vec<_> = doc
        .geometry
        .iter()
        .filter(|b| b.kind != BrushKind::Room)
        .collect();
    let mut bounds = vec![];
    for b in &solids {
        let mut lo = [f32::INFINITY; 3];
        let mut hi = [f32::NEG_INFINITY; 3];
        for v in brush_triangles(b)?.iter().flatten() {
            for i in 0..3 {
                lo[i] = lo[i].min(v[i]);
                hi[i] = hi[i].max(v[i]);
            }
        }
        bounds.push((lo, hi));
    }
    for i in 0..solids.len() {
        for j in i + 1..solids.len() {
            if (0..3).all(|axis| {
                bounds[i].0[axis] <= bounds[j].1[axis] + 0.001
                    && bounds[j].0[axis] <= bounds[i].1[axis] + 0.001
            }) {
                let joined_tunnel=welded.iter().any(|&(a,_,b,_)| {
                    (doc.geometry[a].id==solids[i].id && doc.geometry[b].id==solids[j].id)
                        || (doc.geometry[b].id==solids[i].id && doc.geometry[a].id==solids[j].id)
                });
                let only_meet= (0..3).any(|axis| {
                    (bounds[i].1[axis]-bounds[j].0[axis]).abs()<0.001
                    || (bounds[j].1[axis]-bounds[i].0[axis]).abs()<0.001
                });
                let joined_terrain_pair=joined_terrain.iter().any(|&(a,_,b,_)|{
                    (doc.geometry[a].id==solids[i].id && doc.geometry[b].id==solids[j].id)
                     || (doc.geometry[b].id==solids[i].id && doc.geometry[a].id==solids[j].id)
                });
                if !(joined_tunnel || joined_terrain_pair) || !only_meet {
                    issues.push(issue("BRUSH_OVERLAP","Solid brush bounds overlap or touch without a proven source seam. Separate unsupported brushes before BSP export",vec![solids[i].id.clone(),solids[j].id.clone()]));
                }
            }
        }
    }
    // Detect the same player start twice in a mode where both may become active.
    // The old direct scenario editors could leave an MP player waiting for a
    // clear spawn. Disjoint game-mode records are allowed at the same point.
    for (i,a) in doc.spawns.iter().enumerate() {
        for b in doc.spawns.iter().skip(i+1) {
            if !a.game_modes.iter().any(|mode| b.game_modes.contains(mode)) {continue;}
            let distance_sq=(0..3).map(|axis|(a.position[axis]-b.position[axis]).powi(2)).sum::<f32>();
            if distance_sq < 0.0025 {
                issues.push(issue("DUPLICATE_SPAWN_POSITION",
                    "Two simultaneously eligible player starts occupy the same position; separate them to prevent an obvious spawn-clearance risk",
                    vec![a.id.clone(),b.id.clone()]));
            } else if distance_sq < 1.0 {
                let mut warning=issue("CROWDED_SPAWNS",
                    "Two player starts are less than one unit apart; check player collision and clearance inside Halo",
                    vec![a.id.clone(),b.id.clone()]);
                warning.severity="warning".into();issues.push(warning);
            }
        }
    }
    // A single destination tag path cannot resolve to two different binary
    // source identities. Import requires an explicit conflict resolution.
    let mut tag_origins=std::collections::BTreeMap::<String,Option<String>>::new();
    for placed in &doc.placements {
        let key=format!("{}:{}",placed.tag_class.to_ascii_lowercase(),placed.tag_path.replace('/', "\\").to_ascii_lowercase());
        if let Some(previous)=tag_origins.get(&key) {
            if previous != &placed.source_sha256 {
                issues.push(issue("CONFLICTING_TAG_ORIGINS",
                    format!("Tag path '{}' is used with incompatible source identities",placed.tag_path),vec![placed.id.clone()]));
            }
        } else {tag_origins.insert(key,placed.source_sha256.clone());}
    }
    if doc.spawns.len() < 4 {
        issues.push(issue(
            "SPAWN_MINIMUM",
            "A QuickForge arena needs at least four player starts",
            vec![],
        ));
    }
    if doc.game_mode == "ctf" {
        for team in [0, 1] {
            if !doc.spawns.iter().any(|s| s.team == team)
                || !doc
                    .objectives
                    .iter()
                    .any(|o| o.kind == "ctfFlag" && o.team == team)
            {
                issues.push(issue(
                    "CTF_SETUP",
                    format!("CTF team {team} needs a player start and flag"),
                    vec![],
                ));
            }
        }
    }
    if doc.game_mode == "king" && !doc.objectives.iter().any(|o| o.kind == "hill") {
        issues.push(issue(
            "HILL_REQUIRED",
            "King of the Hill needs a hill objective",
            vec![],
        ));
    }
    if doc.game_mode == "oddball" && !doc.objectives.iter().any(|o| o.kind == "oddball") {
        issues.push(issue(
            "ODDBALL_REQUIRED",
            "Oddball needs a ball spawn",
            vec![],
        ));
    }
    if doc.game_mode == "race"
        && doc
            .objectives
            .iter()
            .filter(|o| o.kind == "raceCheckpoint")
            .count()
            < 2
    {
        issues.push(issue(
            "RACE_CHECKPOINTS",
            "Race needs at least two checkpoints",
            vec![],
        ));
    }
    for material in &doc.materials {
        if material.shader_path.is_none() {
            let mut i = issue(
                "SHADER_UNRESOLVED",
                format!(
                    "Material '{}' needs an actual shader tag before compilation",
                    material.name
                ),
                vec![],
            );
            i.severity = "warning".into();
            issues.push(i);
        }
    }
    if !["firefight", "zombie"].contains(&doc.game_mode.as_str()) {
        for placement in &doc.placements {
            if ["weap", "eqip", "itmc"].contains(&placement.tag_class.as_str())
                && (placement.rotation[0].abs() > 0.00001 || placement.rotation[1].abs() > 0.00001)
            {
                let mut warning=issue("ITEM_FACING_ONLY","Multiplayer netgame equipment supports yaw only; remove pitch/roll before compilation",vec![placement.id.clone()]);
                warning.severity = "warning".into();
                issues.push(warning);
            }
        }
    }
    let valid = !issues.iter().any(|i| i.severity == "error");
    let mut roots=(0..doc.geometry.len()).collect::<Vec<_>>();
    for (a,_,b,_) in &welded {
        let ra=roots[*a];let rb=roots[*b];
        for root in &mut roots {if *root==rb {*root=ra;}}
    }
    let components=roots.iter().collect::<std::collections::BTreeSet<_>>().len();
    Ok(GeometryReport {
        valid,
        issues,
        vertices: mesh.positions.len() / 3,
        triangles: mesh.indices.len() / 3,
        closed_components: if valid { components } else { 0 },
        source_sha256: hash(doc)?,
    })
}

pub fn export_jms(doc: &QuickForgeDocument) -> Result<String> {
    let report = validate(doc)?;
    if !report.valid {
        return invalid(
            report
                .issues
                .iter()
                .filter(|i| i.severity == "error")
                .map(|i| i.message.as_str())
                .collect::<Vec<_>>()
                .join("\n"),
        );
    }
    let mesh = preview_mesh(doc)?;
    let mut out = String::from("8200\n0\n1\nframe\n-1\n-1\n0\t0\t0\t1\n0\t0\t0\n");
    writeln!(out, "{}", doc.materials.len()).unwrap();
    for m in &doc.materials {
        let name = m
            .shader_path
            .as_deref()
            .and_then(|p| p.rsplit(['\\', '/']).next())
            .unwrap_or(&m.name);
        writeln!(out, "{name}\n<none>").unwrap();
    }
    writeln!(out, "0\n1\n__unnamed\n{}", mesh.positions.len() / 3).unwrap();
    for i in 0..mesh.positions.len() / 3 {
        let p = &mesh.positions[i * 3..i * 3 + 3];
        let n = &mesh.normals[i * 3..i * 3 + 3];
        let uv = &mesh.uvs[i * 2..i * 2 + 2];
        writeln!(
            out,
            "0\n{:.6}\t{:.6}\t{:.6}\n{:.8}\t{:.8}\t{:.8}\n-1\n0\n{:.6}\n{:.6}\n0",
            p[0] * 100.,
            p[1] * 100.,
            p[2] * 100.,
            n[0],
            n[1],
            n[2],
            uv[0],
            uv[1]
        )
        .unwrap();
    }
    writeln!(out, "{}", mesh.indices.len() / 3).unwrap();
    for part in &mesh.parts {
        let material = doc
            .materials
            .iter()
            .position(|m| m.id == part.material_id)
            .unwrap();
        for triangle in
            mesh.indices[part.index_start..part.index_start + part.index_count].as_chunks::<3>().0
        {
            writeln!(
                out,
                "0\n{material}\n{}\t{}\t{}",
                triangle[0], triangle[1], triangle[2]
            )
            .unwrap();
        }
    }
    Ok(out)
}

pub fn scenario_path(doc: &QuickForgeDocument) -> Result<String> {
    validate_document(doc)?;
    let slug = doc
        .name
        .to_ascii_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect::<String>();
    let slug = slug.trim_matches('_').chars().take(31).collect::<String>();
    if slug.is_empty() {
        return invalid(
            "QuickForge name needs at least one ASCII letter or number for the Halo scenario path",
        );
    }
    Ok(format!("levels\\quickforge\\{slug}\\{slug}"))
}
fn class_extension(class: &str) -> Result<&'static str> {
    match class {
        "scen" => Ok("scenery"),
        "weap" => Ok("weapon"),
        "eqip" => Ok("equipment"),
        "vehi" => Ok("vehicle"),
        "bipd" => Ok("biped"),
        "itmc" => Ok("item_collection"),
        _ => invalid("Unsupported scenario asset class"),
    }
}
fn spawn_type(mode: &str) -> &str {
    match mode {
        "ctf" => "ctf",
        "king" => "king_of_the_hill",
        "oddball" => "oddball",
        "race" => "race",
        "slayer" | "teamSlayer" => "slayer",
        "allGames" => "all_games",
        _ => "none",
    }
}
fn vector(v: [f32; 3]) -> String {
    format!("{:.6},{:.6},{:.6}", v[0], v[1], v[2])
}
fn angle(v: f32) -> String {
    format!("{v:.8}")
}
/// Convert the editor's intrinsic XYZ rotation to Halo's yaw/pitch/roll order.
/// Reordering components alone is incorrect when multiple axes are rotated.
fn scenario_rotation(xyz: [f32; 3]) -> [f32; 3] {
    let basis = |mut v: [f32; 3]| {
        for axis in (0..3).rev() {
            v = rotate_axis(v, axis, xyz[axis]);
        }
        v
    };
    let x = basis([1., 0., 0.]);
    let y = basis([0., 1., 0.]);
    let z = basis([0., 0., 1.]);
    let pitch = (-x[2]).clamp(-1., 1.).asin();
    if pitch.cos().abs() > 0.00001 {
        [x[1].atan2(x[0]), pitch, y[2].atan2(z[2])]
    } else {
        [(-y[0]).atan2(y[1]), pitch, 0.]
    }
}
fn add_set(args: &mut Vec<String>, key: impl Into<String>, value: impl Into<String>) {
    args.extend(["-S".into(), key.into(), value.into()]);
}
fn edit_command(commands: &mut Vec<ForgeCommand>, tag: &str, mut args: Vec<String>) {
    args.push(tag.into());
    commands.push(ForgeCommand {
        phase: "scenario".into(),
        tool: "invaderEdit".into(),
        args,
        expected_outputs: vec![format!("tags/{}", tag.replace('\\', "/"))],
    });
}

/// Commands target a new scenario produced by Tool structure in an isolated root.
/// invader-edit setters take raw radians even though its getters display degrees.
pub fn scenario_commands(doc: &QuickForgeDocument) -> Result<Vec<ForgeCommand>> {
    validate_document(doc)?;
    let flag_errors = netgame_flag_issues(doc);
    if !flag_errors.is_empty() {
        return invalid(format!("Unsafe multiplayer netgame flags: {}", flag_errors.iter().map(|i| i.message.as_str()).collect::<Vec<_>>().join("; ")));
    }
    let scenario = scenario_path(doc)?;
    let scenario_tag = format!("{scenario}.scenario");
    let bsp_name = scenario.rsplit('\\').next().unwrap();
    let scenario_dir = scenario.rsplit_once('\\').unwrap().0;
    let mut commands = vec![ForgeCommand {
        phase: "structure".into(),
        tool: "haloTool".into(),
        args: vec!["structure".into(), scenario_dir.into(), bsp_name.into()],
        expected_outputs: vec![
            format!(
                "tags/{}.scenario_structure_bsp",
                scenario.replace('\\', "/")
            ),
            format!("tags/{}.scenario", scenario.replace('\\', "/")),
        ],
    }];
    let campaign = ["firefight", "zombie"].contains(&doc.game_mode.as_str());
    let mut initial = vec![];
    add_set(
        &mut initial,
        "type",
        if campaign {
            "singleplayer"
        } else {
            "multiplayer"
        },
    );
    if let Some(sky) = &doc.sky_path {
        initial.extend(["-I".into(), "skies".into(), "1".into(), "end".into()]);
        add_set(&mut initial, "skies[0].sky", format!("{sky}.sky"));
    }
    edit_command(&mut commands, &scenario_tag, initial);
    for (i, spawn) in doc.spawns.iter().enumerate() {
        let mut args = vec![
            "-I".into(),
            "player_starting_locations".into(),
            "1".into(),
            "end".into(),
        ];
        let prefix = format!("player_starting_locations[{i}]");
        add_set(
            &mut args,
            format!("{prefix}.position"),
            vector(spawn.position),
        );
        add_set(&mut args, format!("{prefix}.facing"), angle(spawn.facing));
        add_set(
            &mut args,
            format!("{prefix}.team_index"),
            spawn.team.to_string(),
        );
        add_set(&mut args, format!("{prefix}.bsp_index"), "0");
        for j in 0..4 {
            add_set(
                &mut args,
                format!("{prefix}.type_{j}"),
                spawn.game_modes.get(j).map_or("none", |m| spawn_type(m)),
            );
        }
        edit_command(&mut commands, &scenario_tag, args);
    }
    let mut palette_counts: BTreeMap<&str, usize> = BTreeMap::new();
    let mut netgame = 0;
    for (i, p) in doc.placements.iter().enumerate() {
        let reference = format!("{}.{}", p.tag_path, class_extension(&p.tag_class)?);
        if !campaign && ["weap", "eqip", "itmc"].contains(&p.tag_class.as_str()) {
            let collection = if p.tag_class == "itmc" {
                reference
            } else {
                let tag = format!("{scenario_dir}\\items\\item_{i}.item_collection");
                let mut args = vec![
                    "-N".into(),
                    "-I".into(),
                    "permutations".into(),
                    "1".into(),
                    "end".into(),
                ];
                add_set(&mut args, "permutations[0].weight", "1");
                add_set(&mut args, "permutations[0].item", reference);
                add_set(
                    &mut args,
                    "default_spawn_time",
                    p.respawn_seconds.to_string(),
                );
                edit_command(&mut commands, &tag, args);
                tag
            };
            let mut args = vec![
                "-I".into(),
                "netgame_equipment".into(),
                "1".into(),
                "end".into(),
            ];
            let prefix = format!("netgame_equipment[{netgame}]");
            netgame += 1;
            add_set(&mut args, format!("{prefix}.position"), vector(p.position));
            add_set(&mut args, format!("{prefix}.facing"), angle(p.rotation[2]));
            add_set(
                &mut args,
                format!("{prefix}.team_index"),
                p.team.to_string(),
            );
            add_set(
                &mut args,
                format!("{prefix}.spawn_time"),
                p.respawn_seconds.to_string(),
            );
            add_set(
                &mut args,
                format!("{prefix}.type_0"),
                spawn_type(&doc.game_mode),
            );
            add_set(&mut args, format!("{prefix}.item_collection"), collection);
            edit_command(&mut commands, &scenario_tag, args);
        } else {
            let (array,palette)=match p.tag_class.as_str(){"scen"=>("scenery","scenery_palette"),"vehi"=>("vehicles","vehicle_palette"),"bipd"=>("bipeds","biped_palette"),"weap"=>("weapons","weapon_palette"),"eqip"=>("equipment","equipment_palette"),_=>return invalid("Campaign item_collection placement needs an encounter/equipment translation that is not implemented")};
            let index = *palette_counts.entry(array).or_default();
            *palette_counts.get_mut(array).unwrap() += 1;
            let mut args = vec![
                "-I".into(),
                palette.into(),
                "1".into(),
                "end".into(),
                "-I".into(),
                array.into(),
                "1".into(),
                "end".into(),
            ];
            add_set(&mut args, format!("{palette}[{index}].name"), reference);
            let prefix = format!("{array}[{index}]");
            add_set(&mut args, format!("{prefix}.type"), index.to_string());
            add_set(&mut args, format!("{prefix}.name"), "-1");
            add_set(&mut args, format!("{prefix}.position"), vector(p.position));
            add_set(
                &mut args,
                format!("{prefix}.rotation"),
                vector(scenario_rotation(p.rotation)),
            );
            if p.tag_class == "vehi" {
                add_set(&mut args, format!("{prefix}.body_vitality"), "1");
                add_set(
                    &mut args,
                    format!("{prefix}.multiplayer_team_index"),
                    p.team.to_string(),
                );
                for key in ["slayer", "ctf", "king", "oddball"] {
                    add_set(
                        &mut args,
                        format!("{prefix}.multiplayer_spawn_flags.{key}_default"),
                        "1",
                    );
                    add_set(
                        &mut args,
                        format!("{prefix}.multiplayer_spawn_flags.{key}_allowed"),
                        "1",
                    );
                }
            }
            edit_command(&mut commands, &scenario_tag, args);
        }
    }
    for (i, o) in doc.objectives.iter().enumerate() {
        let mut args = vec![
            "-I".into(),
            "netgame_flags".into(),
            "1".into(),
            "end".into(),
        ];
        let prefix = format!("netgame_flags[{i}]");
        add_set(&mut args, format!("{prefix}.position"), vector(o.position));
        add_set(&mut args, format!("{prefix}.facing"), angle(o.facing));
        add_set(
            &mut args,
            format!("{prefix}.type"),
            match o.kind.as_str() {
                "ctfFlag" => "ctf_flag",
                "hill" => "hill_flag",
                "oddball" => "oddball_ball_spawn",
                "raceCheckpoint" => "race_track",
                "raceVehicle" => "race_vehicle",
                "teleportFrom" => "teleport_from",
                "teleportTo" => "teleport_to",
                _ => return invalid("Unrecognized Halo CE netgame marker; refusing fallback mapping"),
            },
        );
        add_set(
            &mut args,
            format!("{prefix}.usage_id"),
            objective_usage_id(o).to_string(),
        );
        edit_command(&mut commands, &scenario_tag, args);
    }
    commands.push(ForgeCommand {
        phase: "lightmaps".into(),
        tool: "haloTool".into(),
        args: vec![
            "lightmaps".into(),
            scenario.clone(),
            bsp_name.into(),
            if doc.build_quality == "final" {
                "1"
            } else {
                "0"
            }
            .into(),
            if doc.build_quality == "final" {
                "0.01"
            } else {
                "0.1"
            }
            .into(),
        ],
        expected_outputs: vec![format!(
            "tags/{}.scenario_structure_bsp",
            scenario.replace('\\', "/")
        )],
    });
    Ok(commands)
}

pub fn export_sources(doc: &QuickForgeDocument, output: &Path) -> Result<SourceExport> {
    let validation = validate(doc)?;
    if !validation.valid {
        return invalid("QuickForge geometry validation failed; fix the reported geometry and scenario issues before export");
    }
    reject_links(output)?;
    if output.exists() {
        return invalid("QuickForge source export requires a fresh isolated output directory");
    }
    let scenario = scenario_path(doc)?;
    let bsp_name = scenario.rsplit('\\').next().unwrap().to_string();
    let scenario_dir = scenario.rsplit_once('\\').unwrap().0;
    let jms = export_jms(doc)?;
    let commands = scenario_commands(doc)?;
    let document_path = output.join("quickforge-document.json");
    let jms_path = output
        .join("data")
        .join(safe_relative(scenario_dir)?)
        .join("models")
        .join(format!("{bsp_name}.jms"));
    let scenario_plan_path = output.join("scenario-plan.json");
    let environment_plan_path = output.join("environment-intent.json");
    let mut dependencies = vec![];
    let mut blockers = vec![];
    for m in &doc.materials {
        if let Some(path) = &m.shader_path {
            dependencies.push(ForgeDependency {
                kind: "shader".into(),
                tag_path: path.clone(),
                tag_class: "shader_environment".into(),
                source_project_id: None,
                source_sha256: None,
            });
        } else {
            blockers.push(format!(
                "Material '{}' needs an actual legal shader_environment tag",
                m.name
            ));
        }
    }
    if doc.environment.as_ref().is_some_and(|env| env != &EditorEnvironment::default()) {
        blockers.push("The custom environment preview has NOT been applied to Halo sky/fog tags or radiosity; compile and verify authored lighting before claiming gameplay parity".into());
    }
    if let Some(path) = &doc.sky_path {
        dependencies.push(ForgeDependency {
            kind: "sky".into(),
            tag_path: path.clone(),
            tag_class: "sky".into(),
            source_project_id: None,
            source_sha256: None,
        });
    } else {
        blockers.push("Select a legal sky tag for ambient lighting before compilation; emitted lighting is not inferred from preview colors".into());
    }
    for p in &doc.placements {
        dependencies.push(ForgeDependency {
            kind: "placement".into(),
            tag_path: p.tag_path.clone(),
            tag_class: class_extension(&p.tag_class)?.into(),
            source_project_id: p.source_project_id.clone(),
            source_sha256: p.source_sha256.clone(),
        });
        if !["firefight", "zombie"].contains(&doc.game_mode.as_str())
            && ["weap", "eqip", "itmc"].contains(&p.tag_class.as_str())
            && (p.rotation[0].abs() > 0.00001 || p.rotation[1].abs() > 0.00001)
        {
            blockers.push(format!("Multiplayer item '{}' supports facing only; set pitch and roll to zero before compilation",p.name));
        }
        if p.tag_class == "bipd" && !["firefight", "zombie"].contains(&doc.game_mode.as_str()) {
            blockers.push(format!(
                "Biped '{}' does not establish synchronized multiplayer AI",
                p.name
            ));
        }
    }
    if doc.geometry.iter().any(|brush| brush.kind == BrushKind::CaveTunnel) {
        blockers.push("Cave tunnel source geometry (including joined tunnel seams) has not been connected to the enclosing Halo BSP using verified CSG, collision, portals, PVS, lighting or AI navigation. JMS source export is permitted, but a playable QuickForge cache build is blocked until these systems are implemented and tested.".into());
    }
    if ["firefight", "zombie"].contains(&doc.game_mode.as_str()) {
        blockers.push("Firefight campaign geometry is exportable; encounter/script integration and runtime wave execution must be validated before a playable build is claimed".into());
    }
    let export = SourceExport {
        directory: output.to_path_buf(),
        document_path,
        jms_path,
        scenario_plan_path,
        environment_plan_path:Some(environment_plan_path),
        source_sha256: validation.source_sha256.clone(),
        jms_sha256: format!("{:x}", Sha256::digest(jms.as_bytes())),
        scenario_path: scenario,
        bsp_name,
        validation,
        dependencies,
        commands,
        blockers,
    };
    // A source export is a small transaction: write and verify EVERYTHING in
    // a new sibling folder before making the requested output visible. Broken
    // source packs must never masquerade as finished exports.
    let parent=output.parent().ok_or_else(||SparkError::Invalid("Export destination has no parent".into()))?;
    reject_links(parent)?;
    if !parent.is_dir() {return invalid("Export parent directory must already exist");}
    let staging=parent.join(format!(".spark-forge-export-{}",uuid::Uuid::new_v4()));
    reject_links(&staging)?;
    fs::create_dir(&staging)?;
    let attempt=(|| -> Result<()> {
        fs::create_dir(staging.join("tags"))?;
        let stage_path=|final_path:&Path|->Result<PathBuf>{
            Ok(staging.join(final_path.strip_prefix(output).map_err(|_|SparkError::Invalid("Export path escapes its destination".into()))?))
        };
        let staged_doc=stage_path(&export.document_path)?;
        let staged_jms=stage_path(&export.jms_path)?;
        let staged_commands=stage_path(&export.scenario_plan_path)?;
        let staged_environment=stage_path(export.environment_plan_path.as_ref().ok_or_else(||SparkError::Invalid("Environment intent path missing".into()))?)?;
        let env=doc.environment.clone().unwrap_or_default();
        let environment_intent=serde_json::json!({
            "schemaVersion":1,
            "kind":"guilty-spark-environment-intent",
            "status":"AUTHORING_ONLY_NOT_COMPILED",
            "haloSkyTag":doc.sky_path,
            "environment":env,
            "note":"Three.js lighting and linear fog are approximations. Use real Halo sky/fog tags and rebuild radiosity."
        });
        atomic_write(&staged_doc,&serde_json::to_vec_pretty(doc)?,false)?;
        atomic_write(&staged_jms,jms.as_bytes(),false)?;
        atomic_write(&staged_commands,&serde_json::to_vec_pretty(&export.commands)?,false)?;
        atomic_write(&staged_environment,&serde_json::to_vec_pretty(&environment_intent)?,false)?;
        atomic_write(&staging.join("source-export.json"),&serde_json::to_vec_pretty(&export)?,false)?;
        let roundtrip: QuickForgeDocument=serde_json::from_slice(&fs::read(&staged_doc)?)?;
        if roundtrip!=*doc || maps::hash_file(&staged_jms)?!=export.jms_sha256 {
            return invalid("Generated project or JMS failed source round-trip/hash verification");
        }
        let commands: Vec<ForgeCommand>=serde_json::from_slice(&fs::read(&staged_commands)?)?;
        if commands.len()!=export.commands.len() {return invalid("Export command plan failed readback");}
        let _: serde_json::Value=serde_json::from_slice(&fs::read(&staged_environment)?)?;
        if output.exists() {return invalid("Export output appeared while staging; refusing to overwrite it");}
        reject_links(output)?;
        fs::rename(&staging,output)?;
        Ok(())
    })();
    if attempt.is_err() && staging.is_dir() {
        // Only the random staging directory created by this invocation.
        // It is never an installed Halo path or an existing user folder.
        let _=fs::remove_dir_all(&staging);
    }
    attempt?;
    Ok(export)
}
