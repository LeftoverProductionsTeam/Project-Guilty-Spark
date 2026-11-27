use crate::{
    invalid,
    maps::{MapInspection, SceneObject},
    reject_links, Result,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use uuid::Uuid;

pub const PROJECT_VERSION: u32 = 1;
pub const DEFAULT_AUTOMATIC_BACKUP_RETENTION: usize = 0;
pub const MAX_AUTOMATIC_BACKUP_RETENTION: usize = 100;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VehicleMount {
    pub source_sha256: String,
    pub vehicle_tag_id: u32,
    pub vehicle_path: String,
    pub position: [f64; 3],
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShapeDraft {
    pub id: Uuid,
    pub shape: String,
    pub dimensions: [f64; 3],
    pub profile: String,
    pub curl: f64,
    pub sweep: f64,
    pub paint_png: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vehicle_mount: Option<VehicleMount>,
}
impl ShapeDraft {
    fn validate(&self) -> Result<()> {
        if !matches!(self.shape.as_str(), "plow" | "box" | "wedge")
            || !matches!(self.profile.as_str(), "moldboard" | "rounded" | "v")
            || self.dimensions.iter().any(|n| !(0.05..=32.).contains(n))
            || !(0.0..=100.).contains(&self.curl)
            || !(0.0..=100.).contains(&self.sweep)
        {
            return invalid("Invalid Workshop shape or dimensions");
        }
        // The fixed PNG header includes the signature and 512 x 512 dimensions.
        // The browser decodes this bounded Canvas image when a draft reopens.
        const HEADER: &str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIA";
        let paint = &self.paint_png;
        let encoded = paint.strip_prefix("data:image/png;base64,").unwrap_or_default();
        if !paint.starts_with(HEADER) || encoded.len() < 72 || encoded.len() > 1_500_000
            || encoded.len() % 4 != 0
            || !encoded.trim_end_matches('=').bytes().all(|b| b.is_ascii_alphanumeric() || b == b'+' || b == b'/')
            || encoded.len() - encoded.trim_end_matches('=').len() > 2
        {
            return invalid("Workshop paint must be a bounded 512 × 512 PNG");
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Provenance {
    pub creator: String,
    pub community: String,
    pub release_year: Option<u16>,
    pub description: String,
    pub source_url: String,
    pub permissions: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub original_path: PathBuf,
    pub preserved_path: PathBuf,
    pub sha256: String,
    pub cache_version: u32,
    pub engine: String,
    pub scenario_path: String,
    #[serde(default)]
    pub archive: Option<ArchiveOrigin>,
    #[serde(default)]
    pub resource_directory: Option<PathBuf>,
    #[serde(default)]
    pub resource_sha256: std::collections::BTreeMap<String, String>,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub audio_resources: Option<crate::mcc_audio::Binding>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveOrigin {
    pub original_path: PathBuf,
    pub sha256: String,
    pub entry_path: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TagEdit {
    pub tag_id: u32,
    pub field_key: String,
    pub value: Value,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub timestamp: String,
    pub description: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub sha256: String,
    pub path: PathBuf,
    pub vertices: usize,
    pub triangles: usize,
    pub has_uvs: bool,
    pub materials: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildRecord {
    pub id: String,
    pub timestamp: String,
    pub status: String,
    pub target: String,
    pub output: Option<PathBuf>,
    pub sha256: Option<String>,
    pub message: String,
    pub project_fingerprint: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineBuildTarget {
    pub id:String,
    pub name:String,
    pub runtime_id:crate::runtime::RuntimeId,
    pub builder:String,
    pub hek_directory:Option<PathBuf>,
    pub hek_flavor:Option<String>,
    pub tags_directory:Option<PathBuf>,
    pub invader_directory:Option<PathBuf>,
    #[serde(default)] pub ce_compatible_tagset:bool,
    #[serde(default)] pub open_sauce:bool,
}
/// Project-local source draft. It never writes a native tag or selects a tool path.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScenarioScriptDraft {
    pub source_key:String,
    pub filename:String,
    pub content:String,
    pub file_sha256:String,
    pub replace_existing:bool,
}
impl ScenarioScriptDraft {
    fn validate(&self)->Result<()> {
        let stem=self.filename.strip_suffix(".hsc").unwrap_or("");
        if stem.is_empty()||stem.len()>31||stem.eq_ignore_ascii_case("global_scripts")||!stem.bytes().all(|c|c.is_ascii_alphanumeric()||b"_-".contains(&c)) {
            return invalid("Scenario script draft needs a safe scenario .hsc module name");
        }
        if self.source_key.is_empty()||self.source_key.len()>128*1024||self.source_key.chars().any(char::is_control)
            ||self.file_sha256.len()!=64||!self.file_sha256.bytes().all(|c|c.is_ascii_digit()||b"abcdef".contains(&c))
            ||self.content.len()>1024*1024||self.content.chars().any(|c|c.is_control()&&!matches!(c,'\r'|'\n'|'\t')) {
            return invalid("Scenario script draft exceeds its text/identity limits");
        }
        Ok(())
    }
}
/// Original runtime Forge layout, retained as authoring data.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ForgeSidecar {
    pub name: String,
    pub base_sha256: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bytes: Option<Vec<u8>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub record_keys: Option<Vec<String>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub forge_sidecar: Option<ForgeSidecar>,
    /// Optional Spark authoring preference, never exported as a native tag field.
    /// Absent older projects retain their existing application preference.
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub automatic_backup_retention: Option<usize>,
    #[serde(default,skip_serializing_if="Vec::is_empty")]
    pub native_asset_imports:Vec<crate::native_asset_imports::Binding>,
    #[serde(default,skip_serializing_if="Vec::is_empty")]
    pub tag_duplicates:Vec<crate::tag_duplicates::TagDuplicate>,
    #[serde(default,skip_serializing_if="Vec::is_empty")]
    pub tag_renames:Vec<crate::tag_renames::TagRename>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub audio_preview:Option<crate::audio_preview::SoundScene>,
    #[serde(default,skip_serializing_if="Vec::is_empty")]
    pub powerups:Vec<crate::powerups::Powerup>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub gameplay_controls:Option<crate::gameplay::Controls>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub bsp_assembly:Option<crate::bsp_assembly::BspAssembly>,
    /// Routes already present in this project's preserved compiled source.
    /// Native CE extensions recheck them alongside the new editable assembly.
    #[serde(default,skip_serializing_if="Vec::is_empty")]
    pub inherited_bsp_connections:Vec<crate::bsp_assembly::BspAssembly>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub megaworld_layout:Option<crate::megaworld::Layout>,
    #[serde(default,skip_serializing_if="Vec::is_empty")]
    pub animations:Vec<crate::animations::AnimationAsset>,
    #[serde(default,skip_serializing_if="Vec::is_empty")]
    pub animation_assignments:Vec<crate::animations::AnimationAssignment>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub render_features:Option<crate::render_features::RenderFeatures>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub conversion_profile:Option<String>,
    pub schema_version: u32,
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub modified_at: String,
    pub source: Option<Source>,
    pub provenance: Provenance,
    pub scene: Vec<SceneObject>,
    pub assets: Vec<Asset>,
    pub tag_edits: Vec<TagEdit>,
    pub history: Vec<HistoryEntry>,
    pub builds: Vec<BuildRecord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quick_forge: Option<crate::quickforge::QuickForgeDocument>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub firefight: Option<crate::firefight::FirefightConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub studio: Option<crate::creative::CreatorStudio>,
    /// Saved authoring only; compilation still requires a separate reviewed attachment.
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub scenario_script_draft:Option<ScenarioScriptDraft>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub shape_draft: Option<ShapeDraft>,
    #[serde(default,skip_serializing_if="Vec::is_empty")]
    pub build_targets:Vec<EngineBuildTarget>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub active_build_target:Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub megaworld_runtime_registration_id: Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub world_environment:Option<crate::quickforge::EditorEnvironment>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub native_lighting:Option<crate::native_lighting::NativeLighting>,
    #[serde(default)]
    pub source_scene_version:u32,
}
impl Project {
    pub fn scenario_path(&self) -> Result<String> {
        if let Some(document) = &self.quick_forge {
            return crate::quickforge::scenario_path(document);
        }
        self.source.as_ref().map(|s|s.scenario_path.clone()).ok_or_else(||crate::SparkError::Invalid("Project has no game scenario".into()))
    }
    pub fn new(title: &str) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            automatic_backup_retention:Some(DEFAULT_AUTOMATIC_BACKUP_RETENTION),
            native_asset_imports:vec![],
            tag_duplicates:vec![],
            tag_renames:vec![],
            audio_preview:None,
            powerups:vec![],
            schema_version: PROJECT_VERSION,
            id: Uuid::new_v4().to_string(),
            title: title.into(),
            created_at: now.clone(),
            modified_at: now,
            source: None,
            gameplay_controls:None,
            bsp_assembly:None,
            inherited_bsp_connections:vec![],
            megaworld_layout:None,
            conversion_profile:None,
            render_features:None,
            animations:vec![],animation_assignments:vec![],
            provenance: Provenance::default(),
            scene: vec![],
            assets: vec![],
            tag_edits: vec![],
            history: vec![],
            builds: vec![],
            quick_forge: None,
            firefight: None,
            studio: None,
            scenario_script_draft:None,
            shape_draft: None,
            forge_sidecar:None,
            build_targets:vec![],active_build_target:None,
            megaworld_runtime_registration_id:None,
            world_environment:None,
            native_lighting:None,
            source_scene_version:1,
        }
    }
    /// New compiled revisions use their own exact editable tags. Never replace
    /// a user's existing per-map tool configuration.
    pub fn bind_compiled_mcc_tags(&mut self,kit:PathBuf,tags:PathBuf,invader:Option<PathBuf>)->Result<bool> {
        if !self.build_targets.is_empty() || self.active_build_target.is_some() {return Ok(false);}
        let id=Uuid::new_v4().to_string();
        let mut next=self.clone();
        next.build_targets.push(EngineBuildTarget{id:id.clone(),name:"Compiled MCC revision".into(),runtime_id:crate::runtime::RuntimeId::MccSteam,builder:"h1a-tool".into(),hek_directory:Some(kit),hek_flavor:Some("h1aEk".into()),tags_directory:Some(tags),invader_directory:invader,ce_compatible_tagset:false,open_sauce:false});
        next.active_build_target=Some(id);next.validate()?;*self=next;Ok(true)
    }
    pub fn validate(&self) -> Result<()> {
        if let Some(draft)=&self.scenario_script_draft{draft.validate()?;}
        if let Some(draft) = &self.shape_draft {
            draft.validate()?;
            if let Some(mount) = &draft.vehicle_mount {
                if draft.shape != "plow"
                    || !self.source.as_ref().is_some_and(|source| source.cache_version == 13 && source.sha256 == mount.source_sha256)
                    || mount.vehicle_path.len() > 240
                    || !mount.vehicle_path.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b' ' | b'\\'))
                    || mount.position.iter().any(|n| !(-4.0..=4.0).contains(n))
                {
                    return invalid("Review the plow mount on a vehicle from this project’s preserved MCC map");
                }
                crate::safe_relative(&mount.vehicle_path)?;
            }
        }
        if self.automatic_backup_retention.is_some_and(|value|value>MAX_AUTOMATIC_BACKUP_RETENTION) {
            return invalid("Automatic backup retention must be None (0) or 1–100");
        }
        crate::native_asset_imports::validate(&self.native_asset_imports)?;
        crate::tag_duplicates::validate(&self.tag_duplicates)?;
        crate::tag_renames::validate(&self.tag_renames)?;
        if !self.tag_renames.is_empty()&&(self.source.is_none()||self.quick_forge.is_some()){
            return invalid("Native tag renaming requires a preserved source map; build and open generated source first");
        }
        if !self.tag_duplicates.is_empty()&&(self.source.is_none()||self.quick_forge.is_some()){
            return invalid("Tag duplication requires a preserved source map; build and open a QuickForge cache before duplicating its tags");
        }
        if let Some(audio)=&self.audio_preview{audio.validate()?;}
        crate::powerups::validate(&self.powerups)?;
        if let Some(controls)=&self.gameplay_controls{controls.validate()?;}
        if let Some(layout)=&self.megaworld_layout{layout.validate()?;}
        if !self.inherited_bsp_connections.is_empty() {
            let total = self.inherited_bsp_connections.len()
                + usize::from(self.bsp_assembly.as_ref().is_some_and(|plan| !plan.rebuild_native_connector));
            if total > crate::bsp_assembly::MAX_COMPILED_CONNECTIONS
                || self.source.as_ref().is_none_or(|source| !matches!(source.cache_version, 609 | 13))
                || self.quick_forge.is_some()
            {
                return invalid("Inherited connections require a preserved CE609 or MCC13 world within the native route limit");
            }
            for route in &self.inherited_bsp_connections {
                route.validate()?;
                if route.rebuild_native_connector { return invalid("Only the active BSP connection can request an in-place rebuild"); }
            }
        }
        if let Some(assembly)=&self.bsp_assembly{assembly.validate()?;if self.source.is_none()||self.quick_forge.is_some(){return invalid("A BSP assembly needs a preserved destination map");}}
        if let Some(features)=&self.render_features{features.validate()?;}
        if self.animations.len()>128||self.animation_assignments.len()>128{return invalid("Animation library exceeds 128 assets or assignments");}
        let mut animation_ids=std::collections::HashSet::new();for asset in &self.animations{asset.validate()?;if !animation_ids.insert(&asset.id){return invalid("Duplicate animation asset");}}
        for binding in &self.animation_assignments{uuid::Uuid::parse_str(&binding.id).map_err(|_|crate::SparkError::Invalid("Invalid animation assignment".into()))?;if !animation_ids.contains(&binding.asset_id)||!matches!(binding.mode.as_str(),"custom"|"replace-graph")||binding.source_sha256.len()!=64||binding.target_tag_path.len()>256||crate::safe_relative(&binding.target_tag_path).is_err(){return invalid("Invalid animation assignment or missing source asset");}}
        if self.conversion_profile.as_deref().is_some_and(|p|!matches!(p,"faithful"|"zombie-recovery"|"mcc-multiplayer-ui")){return invalid("Unknown map conversion profile");}
        if let Some(environment)=&self.world_environment {environment.validate()?;}
        if let Some(lighting)=&self.native_lighting {lighting.validate()?;if self.quick_forge.is_some()||self.bsp_assembly.is_none(){return invalid("Imported-map lighting currently requires an editable BSP assembly and its native rebuild");}}
        if self.megaworld_runtime_registration_id.as_deref().is_some_and(|id| !crate::runtime::version_token(id)) {
            return invalid("Invalid MegaWorld Forerunner profile ID");
        }
        if self.build_targets.len()>16 {return invalid("At most 16 engine build targets per project");}
        let mut target_ids=std::collections::HashSet::new();
        for target in &self.build_targets {
            Uuid::parse_str(&target.id).map_err(|_|crate::SparkError::Invalid("Invalid build target ID".into()))?;
            if !target_ids.insert(&target.id) || target.name.is_empty() || target.name.len()>100 ||
                !["h1a-tool","invader-mcc","invader-ce","unsupported"].contains(&target.builder.as_str()) ||
                target.hek_flavor.as_deref().is_some_and(|f|!matches!(f,"legacyHek"|"h1aEk")) {
                return invalid("Invalid or duplicate engine build target");
            }
            if target.open_sauce && target.runtime_id!=crate::runtime::RuntimeId::HaloCustomEdition {
                return invalid("OpenSauce belongs to legacy Custom Edition, not MCC or other runtimes");
            }
        }
        if let Some(id)=self.active_build_target.as_ref() {
            let target=self.build_targets.iter().find(|t| &t.id==id).ok_or_else(||crate::SparkError::Invalid("Active engine build target is missing".into()))?;
            if self.quick_forge.as_ref().is_some_and(|d|d.runtime_id!=target.runtime_id) {
                return invalid("QuickForge runtime differs from the active engine build target");
            }
        }
        if self.schema_version != PROJECT_VERSION {
            return invalid(
                "This project schema is not supported. The original project has not been modified.",
            );
        }
        Uuid::parse_str(&self.id)
            .map_err(|_| crate::SparkError::Invalid("Project ID is not a UUID".into()))?;
        // Incomplete geometry is valid authoring state; bounded shape/schema validation
        // happens independently from compiler readiness so a user can save repairs.
        if let Some(document) = &self.quick_forge {
            crate::quickforge::validate_document(document)?;
        }
        if let Some(config) = &self.firefight {
            crate::firefight::validate_document(config)?;
        }
        if let Some(studio) = &self.studio {
            studio.validate()?;
        }
        if let Some(source) = &self.source {
            if let Some(audio)=&source.audio_resources { audio.validate(source.cache_version)?; }
            if source.resource_sha256.iter().any(|(name, hash)| {
                !(["bitmaps.map", "sounds.map", "loc.map"].contains(&name.as_str())
                    || (source.cache_version==13&&(["common.ipak","inplace1.ipak","inplace2.ipak","mcc-textures","mcc-shared-bitmaps.map"].contains(&name.as_str())
                        || name.strip_suffix(".imeta").is_some_and(|n|!n.is_empty()&&n.len()<=64&&n.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'_'||b==b'-')))))
                    || hash.len() != 64
                    || !hash.bytes().all(|b| b.is_ascii_hexdigit())
            }) {
                return invalid(
                    "Resource identities must use fixed resource filenames and SHA-256 hashes",
                );
            }
        }
        if self.title.trim().is_empty()
            || self.title.len() > 200
            || self.scene.len() > 20000
            || self.assets.len() > 512
            || self.tag_edits.len() > 50000
            || self.history.len() > 2000
            || self.builds.len() > 1000
        {
            return invalid(
                "Project exceeds supported title, scene, asset, edit or history limits",
            );
        }
        if self.provenance.description.len() > 10000
            || self.provenance.creator.len() > 256
            || self.provenance.community.len() > 256
            || self.provenance.source_url.len() > 2048
            || self.provenance.permissions.len() > 10000
        {
            return invalid("Provenance text exceeds supported limits");
        }
        if let Some(layout) = &self.forge_sidecar {
            let source = self.source.as_ref().filter(|source| source.sha256 == layout.base_sha256);
            let compatible = match (&layout.text, &layout.bytes, source) {
                (Some(text), None, Some(source)) => matches!(source.cache_version, 5 | 609)
                    && layout.record_keys.is_none()
                    && layout.name.to_ascii_lowercase().ends_with(".txt")
                    && text.len() <= 1024 * 1024
                    && !text.contains('\0')
                    && text.trim_start_matches('\u{feff}').split(['\r', '\n']).next() == Some("[OpenCE Forge Map]"),
                (None, Some(bytes), Some(source)) => matches!(source.cache_version, 5 | 609)
                    && layout.name.strip_suffix(".hmv").is_some_and(|stem| {
                        (1..=28).contains(&stem.len()) && stem.bytes().all(|b| {
                            b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'-' | b'_')
                        })
                    })
                    && (68..=65536).contains(&bytes.len())
                    && bytes.starts_with(b"HFRG")
                    && matches!(u16::from_le_bytes([bytes[4], bytes[5]]), 1..=7 | 11..=16)
                    && u16::from_le_bytes([bytes[52], bytes[53]])
                        <= if u16::from_le_bytes([bytes[4], bytes[5]]) >= 13 { 512 } else { 256 }
                    && bytes[6..8] == [64, 0]
                    && layout.record_keys.as_ref().is_none_or(|keys| {
                        let count = u16::from_le_bytes([bytes[52], bytes[53]]) as usize;
                        let unique: std::collections::HashSet<_> = keys.iter().collect();
                        keys.len() == count && unique.len() == count
                            && keys.iter().all(|key| (1..=36).contains(&key.len())
                                && key.bytes().all(|byte| byte.is_ascii_lowercase()
                                    || byte.is_ascii_digit() || byte == b'-'))
                    })
                    && u32::from_le_bytes(bytes[56..60].try_into().unwrap()) as usize == bytes.len() - 64,
                _ => false,
            };
            if !compatible || layout.name.is_empty() || layout.name.len() > 240
                || layout.name.chars().any(|c| c.is_control() || ['/', '\\', ':'].contains(&c)) {
                return invalid("Forge layout must retain one bounded payload and its exact supported base-map identity");
            }
        }
        let mut ids = std::collections::HashSet::new();
        for object in &self.scene {
            if let Some(source) = &object.source_model {
                uuid::Uuid::parse_str(&source.project_id).map_err(|_| crate::SparkError::Invalid("Invalid source model project".into()))?;
                if source.source_sha256.len()!=64 || !source.source_sha256.bytes().all(|b|b.is_ascii_hexdigit()) || source.path.is_empty() || source.path.len()>512 || source.path.chars().any(char::is_control) || !matches!(source.class.as_str(),"scen"|"weap"|"eqip"|"vehi"|"bipd"|"itmc"|"mach"|"ctrl") {
                    return invalid("Invalid source model identity");
                }
            }
            if !ids.insert(&object.id)
                || object.id.len() > 200
                || object.name.len() > 512
                || object
                    .position
                    .iter()
                    .chain(object.rotation.iter())
                    .chain(object.scale.iter())
                    .any(|n| !n.is_finite() || n.abs() > 1e6)
                || object.scale.iter().any(|n| *n <= 0.0)
            {
                return invalid("Invalid scene object: duplicate ID, text limit, non-finite transform or unsupported scale");
            }
        }
        Ok(())
    }
    pub fn effective_automatic_backup_retention(&self, legacy_default:usize)->Result<usize> {
        let value=self.automatic_backup_retention.unwrap_or(legacy_default);
        if value>MAX_AUTOMATIC_BACKUP_RETENTION{return invalid("Automatic backup retention must be None (0) or 1–100");}
        Ok(value)
    }
    pub fn fingerprint(&self) -> Result<String> {
        // scenario_script_draft is saved authoring, not an applied native input.
        // Reviewed script attachments carry their own exact byte/source identities.
        use sha2::{Digest, Sha256};
        let bytes = fingerprint_json(serde_json::to_vec(&(
            &self.source.as_ref().map(|s| &s.sha256),
            &self
                .source
                .as_ref()
                .map(|s| (&s.resource_directory, &s.resource_sha256)),
            &self.scene,
            &self.tag_edits,
            &self.assets,
            &self.quick_forge,
            &self.firefight,
            // Keep historical hashes when no new native inputs are enabled.
        ))?);
        let base=if self.active_build_target.is_none() {
            crate::hex_bytes(Sha256::digest(bytes))
        } else {
            let mut hash=Sha256::new();hash.update(bytes);
            let active=self.build_targets.iter().find(|t|Some(&t.id)==self.active_build_target.as_ref())
                .ok_or_else(||crate::SparkError::Invalid("Active engine build target missing".into()))?;
            hash.update(serde_json::to_vec(active)?);
            crate::hex_bytes(hash.finalize())
        };
        let camera = self.studio.as_ref().map(crate::creative::CreatorStudio::enabled_engine_camera).transpose()?.flatten();
        let profile=self.conversion_profile.as_deref().filter(|p|*p!="faithful");
        let native_audio=crate::native_audio::fingerprint_inputs(self);
        let attachment=self.shape_draft.as_ref().filter(|draft| draft.vehicle_mount.is_some());
        if camera.is_none()&&profile.is_none()&&self.animation_assignments.is_empty()&&self.bsp_assembly.is_none()&&self.powerups.is_empty()&&self.tag_duplicates.is_empty()&&self.tag_renames.is_empty()&&self.native_asset_imports.is_empty()&&native_audio.is_empty()&&self.native_lighting.is_none()&&attachment.is_none(){return Ok(base);}
        let used:Vec<_>=self.animations.iter().filter(|asset|self.animation_assignments.iter().any(|a|a.asset_id==asset.id)).collect();
        let mut hash=Sha256::new();hash.update(b"spark-native-inputs-v1\0");hash.update(base.as_bytes());hash.update(fingerprint_json(serde_json::to_vec(&(camera,profile,&self.animation_assignments,used))?));if let Some(assembly)=&self.bsp_assembly{hash.update(b"bsp-assembly-v1\0");hash.update(fingerprint_json(serde_json::to_vec(assembly)?));}if !self.powerups.is_empty(){hash.update(b"custom-powerups-v1\0");hash.update(fingerprint_json(serde_json::to_vec(&self.powerups)?));}if !self.tag_duplicates.is_empty(){hash.update(b"tag-duplicates-v1\0");hash.update(fingerprint_json(serde_json::to_vec(&self.tag_duplicates)?));}if !self.tag_renames.is_empty(){hash.update(b"tag-renames-v1\0");hash.update(fingerprint_json(serde_json::to_vec(&self.tag_renames)?));}if !self.native_asset_imports.is_empty(){hash.update(b"native-asset-imports-v1\0");hash.update(fingerprint_json(serde_json::to_vec(&self.native_asset_imports)?));}if !native_audio.is_empty(){hash.update(b"native-audio-v1\0");hash.update(fingerprint_json(serde_json::to_vec(&native_audio)?));}if let Some(lighting)=&self.native_lighting{hash.update(b"native-lighting-v1\0");hash.update(fingerprint_json(serde_json::to_vec(lighting)?));}
        if let Some(draft)=attachment { hash.update(b"vehicle-attachment-v1\0");hash.update(fingerprint_json(serde_json::to_vec(draft)?)); }
        Ok(crate::hex_bytes(hash.finalize()))
    }
}

// JavaScript serializes -0 as 0. Normalize only numeric zero tokens so an
// unchanged UI round trip cannot invalidate a native build receipt.
fn fingerprint_json(bytes:Vec<u8>)->Vec<u8>{let mut out=Vec::with_capacity(bytes.len());let(mut i,mut quoted,mut escaped)=(0,false,false);while i<bytes.len(){let b=bytes[i];if quoted{out.push(b);if escaped{escaped=false;}else if b==b'\\'{escaped=true;}else if b==b'"'{quoted=false;}i+=1;continue;}if b==b'"'{quoted=true;}if bytes[i..].starts_with(b"-0.0")&&bytes.get(i+4).is_none_or(|b|b",]} \r\n\t".contains(b)){out.extend_from_slice(b"0.0");i+=4;}else{out.push(b);i+=1;}}out}

/// Snapshot only fixed resource names. Paths and hashes remain local project provenance.
pub fn resource_hashes(directory: &Path) -> Result<std::collections::BTreeMap<String, String>> {
    reject_links(directory)?;
    let mut hashes = std::collections::BTreeMap::new();
    for name in ["bitmaps.map", "sounds.map", "loc.map"] {
        let path = directory.join(name);
        reject_links(&path)?;
        if path.is_file() {
            if fs::metadata(&path)?.len() > 2 * 1024 * 1024 * 1024 {
                return invalid("Source resource exceeds 2 GiB");
            }
            hashes.insert(name.into(), crate::maps::hash_file(&path)?);
        }
    }
    Ok(hashes)
}

/// A saved descriptor/head is owned by its file identity as well as its bytes.
/// Refuse hardlinks and equivalent-byte replacement by another author.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub(crate) struct FileRevision { identity:Option<(u64,u64)>, pub(crate) sha256:Option<String> }
impl FileRevision {
    pub(crate) fn capture(path:&Path)->Result<Self> {
        reject_links(path)?;
        match fs::symlink_metadata(path) {
            Err(e) if e.kind()==std::io::ErrorKind::NotFound=>return Ok(Self::default()),
            Err(e)=>return Err(e.into()),
            Ok(meta) if !meta.is_file()||meta.len()>32*1024*1024=>return invalid("Saved metadata is not a bounded regular file; retained"),
            Ok(_)=>{},
        }
        let identity=crate::storage::unique_file_identity(path).ok_or_else(||crate::SparkError::Invalid("Saved metadata has hardlink aliases or unavailable ownership; retained".into()))?;
        let sha256=crate::maps::hash_file(path)?;
        reject_links(path)?;
        if crate::storage::unique_file_identity(path)!=Some(identity){return invalid("Saved metadata changed identity while being read; retained");}
        Ok(Self{identity:Some(identity),sha256:Some(sha256)})
    }
    pub(crate) fn verify(&self,path:&Path)->Result<()> {
        if *self!=Self::capture(path)?{return invalid("Saved metadata changed outside this operation; external revision retained");}Ok(())
    }
}

/// Sync a sibling temporary file, then publish a new name or replace a reviewed existing one.
/// A new name never overwrites an arriving file; replacement retains the requested exact backup.
pub fn atomic_write(path: &Path, bytes: &[u8], backup: bool) -> Result<Option<PathBuf>> {
    atomic_write_checked(path,bytes,backup,None)
}
pub(crate) fn atomic_write_checked(path:&Path,bytes:&[u8],backup:bool,expected:Option<&FileRevision>)->Result<Option<PathBuf>> {
    atomic_write_before_publish(path, bytes, backup, expected, false, |_| Ok(()))
}

fn atomic_write_before_publish(
    path: &Path,
    bytes: &[u8],
    backup: bool,
    expected: Option<&FileRevision>,
    managed: bool,
    prepare: impl FnOnce(&FileRevision) -> Result<()>,
) -> Result<Option<PathBuf>> {
    reject_links(path)?;
    if let Some(expected)=expected{expected.verify(path)?;}
    #[cfg(windows)]
    let destination_guard = hold_saved_destination(path, expected, managed)?;
    #[cfg(not(windows))]
    let _ = managed;
    #[cfg(windows)]
    let create_only = destination_guard.is_none();
    #[cfg(not(windows))]
    let create_only = if expected.is_some_and(|prior| prior.identity.is_none()) {
        true
    } else {
        match fs::symlink_metadata(path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => true,
            Err(error) => return Err(error.into()),
            Ok(_) => false,
        }
    };
    let parent = path
        .parent()
        .ok_or_else(|| crate::SparkError::Invalid("Output has no parent".into()))?;
    fs::create_dir_all(parent)?;
    let temp = parent.join(format!(".spark-write-{}.tmp", Uuid::new_v4()));
    let mut staged_revision = None;
    let result = (|| -> Result<Option<PathBuf>> {
        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(windows)] {
            use std::os::windows::fs::OpenOptionsExt;
            // Keep our create-new handle exclusive against writers/deleters
            // while staging. DELETE permits exact-handle failed-write cleanup.
            options.access_mode(0x40000000 | 0x00010000).share_mode(1);
        }
        let mut f = options.open(&temp)?;
        let identity = crate::storage::unique_file_handle_identity(&f)
            .ok_or_else(|| crate::SparkError::Invalid("Staged output ownership unavailable; retained".into()))?;
        if let Err(error) = f.write_all(bytes).and_then(|_| f.sync_all()) {
            #[cfg(windows)] let _ = dispose_verified_handle(&f);
            return Err(error.into());
        }
        use sha2::{Digest, Sha256};
        staged_revision = Some(StagedRevision { file: FileRevision { identity: Some(identity), sha256: Some(crate::hex_bytes(Sha256::digest(bytes))) }, len: bytes.len() as u64 });
        drop(f);
        prepare(&staged_revision.as_ref().unwrap().file)?;
        let bak = if !create_only && backup && path.is_file() {
            let bak = parent.join(format!(
                "{}.bak-{}",
                path.file_name().unwrap_or_default().to_string_lossy(),
                Uuid::new_v4()
            ));
            fs::copy(path, &bak)?;
            Some(bak)
        } else {
            None
        };
        if let Some(expected)=expected{expected.verify(path)?;}
        #[cfg(test)]
        atomic_publication_tests::run_publication_hook();
        #[cfg(windows)]
        if let Some(guard) = &destination_guard {
            let identity = crate::storage::unique_file_handle_identity(guard)
                .ok_or_else(|| crate::SparkError::Invalid("Saved file acquired aliases or lost ownership during Save; retained".into()))?;
            if crate::storage::unique_file_identity(path) != Some(identity) {
                return invalid("Saved file was replaced outside Spark during Save; external revision retained");
            }
        }
        let revision = staged_revision.as_ref().unwrap();
        #[cfg(windows)]
        if let Some(guard) = destination_guard.as_ref().filter(|_| managed) {
            let prior = expected.ok_or_else(|| crate::SparkError::Invalid("Managed Save has no reviewed previous revision".into()))?;
            publish_managed_staged_file(&temp, path, revision, guard, prior)?;
            return Ok(bak);
        }
        publish_staged_file(&temp, path, create_only, revision)?;
        Ok(bak)
    })();
    if let Some(revision) = &staged_revision {
        // Never retire a different file that now occupies our temporary name.
        let _ = dispose_staged_file(&temp, revision);
    }
    result
}
// Managed descriptors deny both write and rename sharing until Spark
// moves the reviewed object by handle. Other metadata retains its basic guard.
#[cfg(windows)]
fn hold_saved_destination(path: &Path, expected: Option<&FileRevision>, hold_name: bool) -> Result<Option<fs::File>> {
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
    let mut options = OpenOptions::new();
    options.read(true).custom_flags(0x00200000);
    if hold_name {
        options.access_mode(0x80000000 | 0x00010000).share_mode(1);
    } else {
        options.share_mode(1 | 4);
    }
    let file = match options.open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) if error.raw_os_error() == Some(32) => {
            let detail = if hold_name {
                "This saved file is open in another program. Finish there and retry Save; the current file was retained"
            } else {
                "This saved file is open for writing in another program. Finish that edit and retry Save; the current file was retained"
            };
            return invalid(detail);
        }
        Err(error) => return Err(error.into()),
    };
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.file_attributes() & 0x400 != 0 {
        return invalid("Saved destination is not a regular, unlinked file; retained");
    }
    let identity = crate::storage::unique_file_handle_identity(&file)
        .ok_or_else(|| crate::SparkError::Invalid("Saved destination has aliases or unavailable ownership; retained".into()))?;
    if let Some(expected) = expected {
        if expected.identity != Some(identity) {
            return invalid("Saved destination changed ownership before Save; external revision retained");
        }
        expected.verify(path)?;
    }
    Ok(Some(file))
}
struct StagedRevision { file: FileRevision, len: u64 }
fn verify_staged_handle(file: &mut fs::File, revision: &StagedRevision) -> Result<()> {
    use std::io::Read;
    use sha2::{Digest, Sha256};
    let metadata = file.metadata()?;
    #[cfg(windows)] {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 { return invalid("Linked staging output retained"); }
    }
    if !metadata.is_file() || metadata.len() != revision.len || crate::storage::unique_file_handle_identity(file) != revision.file.identity {
        return invalid("Staged output changed ownership; replacement retained");
    }
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 65536];
    // Even on a platform without mandatory sharing locks, an external writer
    // cannot turn validation into an unbounded read by continuously appending.
    let mut bounded = file.take(revision.len.saturating_add(1));
    loop {
        let count = bounded.read(&mut buffer)?;
        if count == 0 { break; }
        hash.update(&buffer[..count]);
    }
    if revision.file.sha256.as_deref() != Some(crate::hex_bytes(hash.finalize()).as_str()) {
        return invalid("Staged output changed bytes; replacement retained");
    }
    Ok(())
}
fn open_staged_file(path: &Path, revision: &StagedRevision) -> Result<fs::File> {
    reject_links(path)?;
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)] {
        use std::os::windows::fs::OpenOptionsExt;
        // No write/delete sharing; OPEN_REPARSE_POINT refuses following a
        // last-moment link. Identity and hash refer to this opened handle.
        options.access_mode(0x80000000 | 0x00010000).share_mode(1).custom_flags(0x00200000);
    }
    let mut file = options.open(path)?;
    verify_staged_handle(&mut file, revision)?;
    Ok(file)
}
fn dispose_staged_file(path: &Path, revision: &StagedRevision) -> Result<()> {
    let file = open_staged_file(path, revision)?;
    #[cfg(windows)] { dispose_verified_handle(&file)?; }
    #[cfg(not(windows))] {
        // Preserve the pathname guard on other targets. Descriptor-relative
        // unlink race closure needs separate native platform acceptance.
        if crate::storage::unique_file_identity(path) != revision.file.identity { return invalid("Staged cleanup ownership changed; retained"); }
        fs::remove_file(path)?;
    }
    drop(file);
    Ok(())
}
#[cfg(windows)]
fn set_staged_information(file: &fs::File, class: u32, information: *const std::ffi::c_void, size: u32) -> Result<()> {
    use std::os::windows::io::AsRawHandle;
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn SetFileInformationByHandle(handle: *mut std::ffi::c_void, class: u32, information: *const std::ffi::c_void, size: u32) -> i32;
    }
    if unsafe { SetFileInformationByHandle(file.as_raw_handle(), class, information, size) } == 0 {
        return Err(std::io::Error::last_os_error().into());
    }
    Ok(())
}
#[cfg(windows)]
pub(crate) fn dispose_verified_handle(file: &fs::File) -> Result<()> {
    // FILE_DISPOSITION_INFO: delete this verified handle on close, never a
    // newly resolved pathname. No read-only/security bypass flags are used.
    let delete_file = 1u8;
    set_staged_information(file, 4, (&delete_file as *const u8).cast(), 1)
}
#[cfg(windows)]
fn rename_saved_handle(file: &fs::File, path: &Path, create_only: bool) -> Result<()> {
    use std::os::windows::ffi::OsStrExt;
    #[repr(C)]
    struct RenameInformation { flags: u32, root: *mut std::ffi::c_void, length: u32, name: [u16; 1] }
    let destination = crate::native_staging::canonical_destination(path)?;
    let name = destination.as_os_str().encode_wide().collect::<Vec<_>>();
    if name.contains(&0) { return invalid("Output path contains a null character"); }
    let offset = std::mem::offset_of!(RenameInformation, name);
    let size = (offset + (name.len() + 1) * 2).max(std::mem::size_of::<RenameInformation>());
    let mut aligned = vec![0u64; size.div_ceil(8)];
    let information = aligned.as_mut_ptr().cast::<RenameInformation>();
    // First publication uses FileRenameInfo with no replacement. Updates
    // use FileRenameInfoEx/POSIX_SEMANTICS to retain our read-only target
    // guard during atomic replacement. No IGNORE_READONLY/security flags.
    // Unsupported filesystems fail; never drop the guard and retry unsafely.
    // The source is the exact verified handle, not its mutable pathname.
    unsafe {
        (*information).flags = if create_only { 0 } else { 1 | 2 };
        (*information).root = std::ptr::null_mut();
        (*information).length = u32::try_from(name.len() * 2).map_err(|_| crate::SparkError::Invalid("Output path too long".into()))?;
        std::ptr::copy_nonoverlapping(name.as_ptr(), aligned.as_mut_ptr().cast::<u8>().add(offset).cast::<u16>(), name.len());
    }
    set_staged_information(file, if create_only { 3 } else { 22 }, aligned.as_ptr().cast(), u32::try_from(size).map_err(|_| crate::SparkError::Invalid("Output path too long".into()))?)?;
    Ok(())
}

#[cfg(windows)]
const MANAGED_PREVIOUS_PREFIX: &str = ".spark-save-previous-";

#[cfg(windows)]
fn parked_managed_path(path: &Path, previous: &FileRevision) -> Result<PathBuf> {
    let ((volume, identity), sha256) = previous.identity.zip(previous.sha256.as_deref()).ok_or_else(||
        crate::SparkError::Invalid("Managed Save has no previous file identity".into()))?;
    Ok(path.with_file_name(format!("{MANAGED_PREVIOUS_PREFIX}{volume:016x}-{identity:016x}-{sha256}")))
}

#[cfg(windows)]
fn publish_managed_staged_file(
    temp: &Path,
    path: &Path,
    revision: &StagedRevision,
    current: &fs::File,
    previous: &FileRevision,
) -> Result<()> {
    let staged = open_staged_file(temp, revision)?;
    #[cfg(test)]
    atomic_publication_tests::run_staged_handle_hook();
    previous.verify(path)?;

    let backup = project_recovery_path(path)?;
    let backup_revision = FileRevision::capture(&backup)?;
    if backup_revision.sha256 != previous.sha256 {
        return invalid("Previous-good project bytes could not be verified before Save; files retained");
    }
    let _backup = hold_saved_destination(&backup, Some(&backup_revision), true)?.ok_or_else(||
        crate::SparkError::Invalid("Previous-good project backup disappeared before Save".into()))?;

    // Keep both file objects by handle. The old name is vacant only between
    // two no-replace moves. A competing arrival always wins its own name.
    let parked = parked_managed_path(path, previous)?;
    rename_saved_handle(current, &parked, true)?;
    #[cfg(test)]
    atomic_publication_tests::run_managed_gap_hook();
    if let Err(publish_error) = rename_saved_handle(&staged, path, true) {
        if rename_saved_handle(current, path, true).is_err() {
            return invalid(format!("The project name changed externally during Save. Spark retained the current destination and parked its verified previous revision at {}", parked.display()));
        }
        return Err(publish_error);
    }
    // The locked backup holds the exact previous-good bytes. If the OS
    // refuses retirement, the parked revision can safely remain for review.
    if let Err(error) = dispose_verified_handle(current) {
        eprintln!("Verified previous project revision retained at {}: {error}", parked.display());
    }
    Ok(())
}

/// Restore only an interrupted handoff's exact previous file and only into
/// an empty managed descriptor name. The caller holds the project's Save lock.
#[cfg(windows)]
pub(crate) fn recover_managed_previous(path: &Path, project_id: &str) -> Result<()> {
    if FileRevision::capture(path)?.sha256.is_some() { return Ok(()); }
    let backup = project_recovery_path(path)?;
    let backup_revision = FileRevision::capture(&backup)?;
    if backup_revision.sha256.is_none() { return Ok(()); }
    let parent = path.parent().ok_or_else(|| crate::SparkError::Invalid("Managed project has no parent".into()))?;
    let mut parked = None;
    for (index, entry) in fs::read_dir(parent)?.enumerate() {
        if index >= 4096 { return invalid("Managed Save recovery exceeded its directory limit; files retained"); }
        let entry = entry?;
        if !entry.file_name().to_string_lossy().starts_with(MANAGED_PREVIOUS_PREFIX) { continue; }
        let candidate = entry.path();
        let revision = FileRevision::capture(&candidate)?;
        if revision.sha256 != backup_revision.sha256 || parked_managed_path(path, &revision)? != candidate { continue; }
        if parked.replace((candidate, revision)).is_some() {
            return invalid("Multiple previous-good project revisions match an interrupted Save; files retained for review");
        }
    }
    let Some((parked, previous)) = parked else { return Ok(()); };
    let _backup = hold_saved_destination(&backup, Some(&backup_revision), true)?.ok_or_else(||
        crate::SparkError::Invalid("Managed Save recovery backup is unavailable; files retained".into()))?;
    let original = hold_saved_destination(&parked, Some(&previous), true)?.ok_or_else(||
        crate::SparkError::Invalid("Parked project revision disappeared; files retained".into()))?;
    if load_project(&parked)?.id != project_id {
        return invalid("Interrupted Save belongs to a different project; files retained");
    }
    rename_saved_handle(&original, path, true)?;
    Ok(())
}

// Part of the existing sibling-temp writer: publish a previously absent name
// without any replacing fallback. Only our completed temporary bytes are moved.
fn publish_staged_file(temp: &Path, path: &Path, create_only: bool, revision: &StagedRevision) -> Result<()> {
    let file = open_staged_file(temp, revision)?;
    #[cfg(test)] atomic_publication_tests::run_staged_handle_hook();
    #[cfg(windows)]
    rename_saved_handle(&file, path, create_only)?;
    #[cfg(not(windows))] {
        // This target still requires separate descriptor-relative publication
        // acceptance. No replacing fallback is allowed for a new filename.
        if crate::storage::unique_file_identity(temp) != revision.file.identity { return invalid("Staged publication ownership changed; retained"); }
        if create_only {
            fs::hard_link(temp, path)?;
            fs::remove_file(temp)?;
        } else { fs::rename(temp, path)?; }
    }
    drop(file);
    Ok(())
}
pub(crate) fn encoded_project(path:&Path,project:&Project)->Result<Vec<u8>> {
    project.validate()?;
    reject_links(path)?;
    let bytes = serde_json::to_vec_pretty(project)?;
    if bytes.len() > 32 * 1024 * 1024 {
        return invalid("Project JSON exceeds 32 MiB");
    }
    let _: Project = serde_json::from_slice(&bytes)?;
    Ok(bytes)
}
/// Serialize a portable descriptor without adopting or opening its references.
/// Keep the established export/fixture contract and its unique previous copy;
/// Library admission independently validates every referenced native input.
pub fn save_project(path:&Path,project:&Project)->Result<()> {
    let bytes=encoded_project(path,project)?;
    if path.is_file()&&fs::metadata(path)?.len()==bytes.len() as u64&&fs::read(path)?==bytes{return Ok(());}
    atomic_write(path,&bytes,true)?;Ok(())
}
/// Repeated saves of an admitted managed document retain one fixed recovery
/// revision. These new ownership checks do not alter portable serialization.
pub(crate) fn save_managed_project(path:&Path,project:&Project)->Result<()> {
    let expected=FileRevision::capture(path)?;
    save_managed_project_prepared(path, project, &expected, |_| Ok(()))
}
pub(crate) fn save_managed_project_prepared(
    path: &Path,
    project: &Project,
    expected: &FileRevision,
    prepare: impl FnOnce(&FileRevision) -> Result<()>,
) -> Result<()> {
    expected.verify(path)?;
    let bytes=encoded_project(path,project)?;
    if path.is_file()&&fs::metadata(path)?.len()==bytes.len() as u64&&fs::read(path)?==bytes{
        prepare(expected)?;
        return expected.verify(path);
    }
    let recovery = if path.is_file() {
        let previous=load_project(path)?;
        // A validated source-less descriptor may receive its first source.
        // Existing source bindings remain immutable; Library::save retains
        // the independent native admission checks at the application boundary.
        if previous.id!=project.id || (previous.source.is_some()&&!same_source_identity(&previous,project)) {
            return invalid("Existing project identity differs; choose a new project path");
        }
        let recovery=project_recovery_path(path)?;reject_links(&recovery)?;
        if recovery.exists() {
            let recovered=load_project(&recovery).map_err(|_|crate::SparkError::Invalid("Existing project recovery backup is invalid; preserve and review it before saving".into()))?;
            // The source-less initial revision is valid recovery for this
            // same project. Never accept another nonempty source binding.
            if recovered.id!=previous.id || (recovered.source.is_some()&&!same_source_identity(&recovered,&previous)) {
                return invalid("Existing project recovery backup belongs to another source or project; it was retained");
            }
        }
        let recovery_revision = FileRevision::capture(&recovery)?;
        Some((recovery, recovery_revision))
    } else {
        None
    };
    atomic_write_before_publish(path, &bytes, false, Some(expected), true, |revision| {
        prepare(revision)?;
        if let Some((recovery, recovery_revision)) = recovery {
            // Keep one independently written previous-good copy. A refused
            // preparation never rotates it or publishes the new descriptor.
            expected.verify(path)?;
            atomic_write_checked(&recovery, &fs::read(path)?, false, Some(&recovery_revision))?;
        }
        Ok(())
    })?;
    Ok(())
}
pub fn project_recovery_path(path:&Path)->Result<PathBuf> {
    let name=path.file_name().ok_or_else(||crate::SparkError::Invalid("Project path has no filename".into()))?;
    Ok(path.with_file_name(format!("{}.bak",name.to_string_lossy())))
}
pub(crate) fn same_source_identity(left:&Project,right:&Project)->bool {
    left.source.as_ref().map(|s|(&s.sha256,&s.preserved_path))==right.source.as_ref().map(|s|(&s.sha256,&s.preserved_path))
}
pub fn load_project(path: &Path) -> Result<Project> {
    if fs::metadata(path)?.len() > 32 * 1024 * 1024 {
        return invalid("Project exceeds 32 MiB");
    }
    decode_project(&fs::read(path)?)
}

/// The baseline identifies the exact opened descriptor and the bytes used
/// to construct the editable session, even if preparation waits elsewhere.
pub(crate) fn load_project_revision(path: &Path) -> Result<(Project, FileRevision)> {
    use sha2::{Digest, Sha256};
    use std::io::Read;

    const MAX_BYTES: u64 = 32 * 1024 * 1024;
    reject_links(path)?;
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000).share_mode(1 | 4);
    }
    let file = options.open(path)?;
    let metadata = file.metadata()?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return invalid("Saved project is a linked file; retained");
        }
    }
    if !metadata.is_file() || metadata.len() > MAX_BYTES {
        return invalid("Saved project is not a bounded regular file; retained");
    }
    let identity = crate::storage::unique_file_handle_identity(&file)
        .ok_or_else(|| crate::SparkError::Invalid("Saved project has aliases or unavailable ownership; retained".into()))?;
    let mut bytes = Vec::new();
    (&file).take(MAX_BYTES + 1).read_to_end(&mut bytes)?;
    reject_links(path)?;
    if bytes.len() as u64 != metadata.len() || crate::storage::unique_file_identity(path) != Some(identity) {
        return invalid("Saved project changed while being opened; review the external revision");
    }
    let project = decode_project(&bytes)?;
    Ok((project, FileRevision {
        identity: Some(identity),
        sha256: Some(crate::hex_bytes(Sha256::digest(&bytes))),
    }))
}

fn decode_project(bytes: &[u8]) -> Result<Project> {
    let project: Project = serde_json::from_slice(bytes)?;
    project.validate()?;
    Ok(project)
}

/// A renderer supplies semantic edits, never arbitrary offsets. Re-resolve every field from the cache.
pub fn validate_edits(project: &Project, inspection: &MapInspection) -> Result<()> {
    if let Some(mount) = project.shape_draft.as_ref().and_then(|draft| draft.vehicle_mount.as_ref()) {
        if mount.source_sha256 != inspection.sha256 || !inspection.tags.iter().any(|tag| {
            tag.id == mount.vehicle_tag_id && tag.class == "vehi" && !tag.external
                && tag.path.eq_ignore_ascii_case(&mount.vehicle_path)
        }) {
            return invalid("The reviewed vehicle tag differs from this map. Preview the mount again.");
        }
    }
    crate::tag_renames::validate_source(project, inspection)?;
    for edit in &project.tag_edits {
        let field = inspection
            .tags
            .iter()
            .find(|t| t.id == edit.tag_id)
            .and_then(|t| t.fields.iter().find(|f| f.key == edit.field_key))
            .ok_or_else(|| {
                crate::SparkError::Invalid(format!(
                    "Unrecognized editable field {}",
                    edit.field_key
                ))
            })?;
        use crate::maps::{VEHICLE_SPAWN_FLAGS_KEY_PREFIX, VEHICLE_SPAWN_FLAGS_MASK};
        if field.key.starts_with(VEHICLE_SPAWN_FLAGS_KEY_PREFIX) {
            let requested = edit.value.as_u64().and_then(|value| u16::try_from(value).ok());
            let original = field.value.as_u64().and_then(|value| u16::try_from(value).ok());
            if !requested.zip(original).is_some_and(|(new, old)| (new ^ old) & !VEHICLE_SPAWN_FLAGS_MASK == 0) {
                return invalid("A vehicle placement edit may only change the reviewed multiplayer flags");
            }
        }
        if field.kind == "reference" {
            let id = edit
                .value
                .as_u64()
                .filter(|v| *v <= u32::MAX as u64)
                .ok_or_else(|| {
                    crate::SparkError::Invalid("Tag reference must be a uint32 ID".into())
                })?;
            let target = inspection
                .tags
                .iter()
                .find(|t| t.id == id as u32)
                .ok_or_else(|| {
                    crate::SparkError::Invalid("Referenced tag does not exist in this cache".into())
                })?;
            if field.target_class.as_ref() != Some(&target.class) {
                return invalid("Tag reference class mismatch");
            }
        } else {
            let value = edit
                .value
                .as_f64()
                .ok_or_else(|| crate::SparkError::Invalid("Field must be numeric".into()))?;
            if !value.is_finite() || value < field.min || value > field.max ||
                (matches!(field.kind.as_str(),"i8"|"u8"|"i16"|"u16"|"i32"|"u32")&&value.fract()!=0.) {
                return invalid(format!(
                    "{} must be between {} and {}",
                    field.label, field.min, field.max
                ));
            }
        }
    }
    crate::maps::validate_ui_layout(project,inspection)?;
    Ok(())
}
pub fn patched_cache(project: &Project, inspection: &MapInspection) -> Result<Vec<u8>> {
    if project.scene.iter().any(|object| object.source_model.is_some()) {
        if project.scene.iter().filter(|o|o.source_model.is_some()).all(|o|crate::native_asset_imports::allowed_addition(project,o,inspection)){let mut native=project.clone();native.scene.retain(|o|o.source_model.is_none());return patched_cache(&native,inspection); }
        return invalid("Source-linked preview models require editable scenario placement tags before a game build. Use QuickForge source placements or remove the preview placement.");
    }
    validate_edits(project, inspection)?;
    let source = project.source.as_ref().ok_or_else(|| {
        crate::SparkError::Invalid("A Halo map is required to build a cache".into())
    })?;
    let (header, mut bytes, snapshot_sha256) =
        crate::maps::read_cache_snapshot(&source.preserved_path)?;
    if snapshot_sha256 != source.sha256 || snapshot_sha256 != inspection.sha256 {
        return invalid("Preserved source checksum changed; build cancelled");
    }
    if header.compressed {
        return invalid(
            "Editing Xbox compressed caches requires an external extraction adapter first",
        );
    }
    for edit in &project.tag_edits {
        let f = inspection
            .tags
            .iter()
            .find(|t| t.id == edit.tag_id)
            .unwrap()
            .fields
            .iter()
            .find(|f| f.key == edit.field_key)
            .unwrap();
        // A UI/JSON round trip can normalize signed zero or numeric spelling.
        // Leave the original native cell intact when its semantic value agrees.
        if edit.value.as_f64()==f.value.as_f64() {continue;}
        if f.kind == "reference" {
            let target = inspection
                .tags
                .iter()
                .find(|t| t.id == edit.value.as_u64().unwrap() as u32)
                .unwrap();
            let class = target.class.as_bytes();
            if class.len() != 4 {
                return invalid("Invalid reference class");
            }
            for i in 0..4 {
                bytes[f.offset + i] = class[3 - i];
            }
            bytes[f.offset + 12..f.offset + 16].copy_from_slice(&target.id.to_le_bytes());
            // Cached dependencies carry a path pointer. Keep it consistent for extractors as well as the datum ID.
            let tag_header = header.tag_offset as usize;
            let array_ptr = crate::binary::Reader(&bytes).u32(tag_header)?;
            let base = match header.version {
                6 => 0x4bf10000,
                13 => array_ptr - 0x28,
                _ => 0x40440000,
            };
            let table = tag_header + (array_ptr - base) as usize;
            let path_ptr = crate::binary::Reader(&bytes).u32(table + target.index * 32 + 16)?;
            bytes[f.offset + 4..f.offset + 8].copy_from_slice(&path_ptr.to_le_bytes());
        } else {
            let value=edit.value.as_f64().unwrap();
            let encoded=match f.kind.as_str(){"i8"=>vec![(value as i8) as u8],"u8"=>vec![value as u8],"u32"=>(value as u32).to_le_bytes().to_vec(),"i16"=>(value as i16).to_le_bytes().to_vec(),
                "u16"=>(value as u16).to_le_bytes().to_vec(),"i32"=>(value as i32).to_le_bytes().to_vec(),
                "f32"=>(value as f32).to_le_bytes().to_vec(),_=>return invalid("Unsupported editable field encoding")};
            bytes[f.offset..f.offset+encoded.len()].copy_from_slice(&encoded);
        }
    }
    for object in &project.scene {
        if let Some(original) = inspection.objects.iter().find(|o| o.id == object.id) {
            if object.scale != [1.0; 3] {
                return invalid("Halo scenario instances do not support per-instance scale. Scale is available only for workshop meshes.");
            }
            if let Some(at) = original.source_offset {
                for i in 0..3 {
                    if object.position[i]!=original.position[i] {
                        bytes[at + i * 4..at + i * 4 + 4]
                            .copy_from_slice(&object.position[i].to_le_bytes());
                    }
                }
            }
            if let Some(at) = original.rotation_offset {
                if matches!(original.kind.as_str(),"Player spawn"|"Netgame item") {
                    if object.rotation[1]!=0.||object.rotation[2]!=0.{return invalid("This source placement supports yaw only; pitch and roll must remain zero");}
                    if object.rotation[0]!=original.rotation[0] {bytes[at..at + 4].copy_from_slice(&object.rotation[0].to_le_bytes());}
                } else {
                    for i in 0..3 {
                        if object.rotation[i]!=original.rotation[i] {
                            bytes[at + i * 4..at + i * 4 + 4]
                                .copy_from_slice(&object.rotation[i].to_le_bytes());
                        }
                    }
                }
            }
        } else {
            return invalid("New/duplicated editor objects and workshop meshes cannot be compiled into a Halo scenario yet. Remove them from the project before a game build.");
        }
    }
    if project.scene.len() != inspection.objects.len() {
        return invalid("Removing Halo scenario instances requires rebuilding reflexive arrays; this operation is editor-only until that adapter is implemented");
    }
    Ok(bytes)
}

#[cfg(test)]
mod forge_sidecar_project_tests {
    use super::*;
    #[test]
    fn forge_sidecar_survives_project_serialization_and_rejects_changed_base_identity() {
        let mut project = Project::new("Forge layout");
        project.source = Some(Source {
            original_path:"base.map".into(), preserved_path:"preserved/base.map".into(),
            sha256:"a".repeat(64),cache_version:609,engine:"Halo Custom Edition".into(),
            scenario_path:"levels/test".into(),archive:None,resource_directory:None,
            resource_sha256:Default::default(),audio_resources:None,
        });
        let text = "\u{feff}[OpenCE Forge Map]\r\nBase Map: custom_maps\\test\n[ForgeState]\rOPAQUE|1";
        project.forge_sidecar = Some(ForgeSidecar {
            name:"saved.txt".into(),base_sha256:"a".repeat(64),text:Some(text.into()),bytes:None,record_keys:None,
        });
        project.validate().unwrap();
        let mut reopened: Project = serde_json::from_slice(&serde_json::to_vec(&project).unwrap()).unwrap();
        reopened.validate().unwrap();
        assert_eq!(reopened.forge_sidecar.as_ref().unwrap().text.as_deref(), Some(text));
        reopened.source.as_mut().unwrap().sha256 = "b".repeat(64);
        assert!(reopened.validate().is_err());
    }

    #[test]
    fn forge_hmv_survives_project_serialization_without_mixing_layout_formats() {
        let mut project = Project::new("Forge layout");
        project.source = Some(Source {
            original_path: "base.map".into(), preserved_path: "preserved/base.map".into(),
            sha256: "a".repeat(64), cache_version: 5, engine: "Xbox".into(),
            scenario_path: "levels/test".into(), archive: None, resource_directory: None,
            resource_sha256: Default::default(), audio_resources: None,
        });
        let mut bytes = vec![0; 69];
        bytes[..8].copy_from_slice(b"HFRG\x01\x00\x40\x00");
        bytes[52] = 1;
        bytes[56] = 5;
        project.forge_sidecar = Some(ForgeSidecar {
            name: "about.hmv".into(), base_sha256: "a".repeat(64), text: None, bytes: Some(bytes.clone()), record_keys: Some(vec!["sample-placement".into()]),
        });
        project.validate().unwrap();
        let mut reopened: Project = serde_json::from_slice(&serde_json::to_vec(&project).unwrap()).unwrap();
        reopened.validate().unwrap();
        assert_eq!(reopened.forge_sidecar.as_ref().unwrap().bytes.as_deref(), Some(bytes.as_slice()));
        assert_eq!(reopened.forge_sidecar.as_ref().unwrap().record_keys, Some(vec!["sample-placement".into()]));
        reopened.forge_sidecar.as_mut().unwrap().record_keys = Some(vec![]);
        assert!(reopened.validate().is_err());
        reopened.forge_sidecar.as_mut().unwrap().record_keys = None;
        reopened.validate().unwrap();
        reopened.forge_sidecar.as_mut().unwrap().text = Some("[OpenCE Forge Map]".into());
        assert!(reopened.validate().is_err());
        reopened.forge_sidecar.as_mut().unwrap().text = None;
        reopened.source.as_mut().unwrap().cache_version = 7;
        assert!(reopened.validate().is_err());

        for version in [11, 12, 13, 14, 15, 16] {
            let mut advanced = project.clone();
            let layout = advanced.forge_sidecar.as_mut().unwrap();
            let contents = layout.bytes.as_mut().unwrap();
            let count = if version >= 13 { 512_u16 } else { 256_u16 };
            contents[4] = version;
            contents[52..54].copy_from_slice(&count.to_le_bytes());
            layout.record_keys = Some((0..count).map(|index| index.to_string()).collect());
            let encoded = serde_json::to_vec(&advanced).unwrap();
            let mut restored: Project = serde_json::from_slice(&encoded).unwrap();
            restored.validate().unwrap();
            let layout = restored.forge_sidecar.as_ref().unwrap();
            assert_eq!(layout.bytes, advanced.forge_sidecar.as_ref().unwrap().bytes);
            assert_eq!(layout.record_keys, advanced.forge_sidecar.as_ref().unwrap().record_keys);
            if version == 16 {
                let bytes = restored.forge_sidecar.as_mut().unwrap().bytes.as_mut().unwrap();
                bytes[4] = 10;
                assert!(restored.validate().is_err());
                let bytes = restored.forge_sidecar.as_mut().unwrap().bytes.as_mut().unwrap();
                bytes[4] = 16;
                bytes[52..54].copy_from_slice(&513_u16.to_le_bytes());
                assert!(restored.validate().is_err());
            }
        }
    }
}

#[cfg(test)]
mod compiled_revision_tests {
    use super::*;
    #[test]
    fn compiled_revision_links_its_own_tags_and_matching_kit() {
        let mut p=Project::new("Synthetic compiled map");
        assert!(p.bind_compiled_mcc_tags("synthetic/sdk".into(),"synthetic/job/tags".into(),Some("synthetic/invader".into())).unwrap());
        let t=&p.build_targets[0];assert_eq!(p.active_build_target.as_ref(),Some(&t.id));
        assert_eq!(t.tags_directory.as_deref(),Some(Path::new("synthetic/job/tags")));
        assert_eq!(t.hek_flavor.as_deref(),Some("h1aEk"));assert_eq!(t.builder,"h1a-tool");
    }
    #[test]
    fn compiled_tag_binding_preserves_existing_user_tool_choices() {
        let mut p=Project::new("Synthetic compiled map");p.bind_compiled_mcc_tags("synthetic/sdk".into(),"synthetic/user-tags".into(),None).unwrap();
        p.build_targets[0].name="My authored tool profile".into();let before=serde_json::to_value(&p).unwrap();
        assert!(!p.bind_compiled_mcc_tags("other/sdk".into(),"other/tags".into(),None).unwrap());
        assert_eq!(serde_json::to_value(p).unwrap(),before);
    }
}

#[cfg(test)]
mod backup_policy_tests {
    use super::*;
    #[test]
    fn old_projects_inherit_and_new_projects_default_to_zero_without_changing_native_identity() {
        let mut p=Project::new("New");assert_eq!(p.automatic_backup_retention,Some(0));let native=p.fingerprint().unwrap();
        p.automatic_backup_retention=Some(0);p.validate().unwrap();assert_eq!(native,p.fingerprint().unwrap());
        let mut old=serde_json::to_value(&p).unwrap();old.as_object_mut().unwrap().remove("automaticBackupRetention");
        let old:Project=serde_json::from_value(old).unwrap();assert_eq!(old.automatic_backup_retention,None);assert_eq!(old.effective_automatic_backup_retention(20).unwrap(),20);
        p.automatic_backup_retention=Some(101);assert!(p.validate().is_err());assert!(p.effective_automatic_backup_retention(20).is_err());
    }
    #[test]
    fn twenty_saves_keep_one_atomic_recovery_copy_and_preserve_legacy_backups() {
        let dir=tempfile::tempdir().unwrap();let file=dir.path().join("project.gsproject");let mut p=Project::new("Initial");p.automatic_backup_retention=Some(0);
        save_managed_project(&file,&p).unwrap();let legacy=dir.path().join(format!("project.gsproject.bak-{}",Uuid::new_v4()));fs::write(&legacy,b"original historical backup").unwrap();
        for n in 1..=20 {p.title=format!("Edit {n}");save_managed_project(&file,&p).unwrap();}
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(),3);assert_eq!(load_project(&file).unwrap().title,"Edit 20");assert_eq!(load_project(&project_recovery_path(&file).unwrap()).unwrap().title,"Edit 19");
        assert_eq!(fs::read(legacy).unwrap(),b"original historical backup");
    }
    #[test]
    fn invalid_foreign_or_corrupt_recovery_cannot_change_the_current_project() {
        let dir=tempfile::tempdir().unwrap();let file=dir.path().join("project.gsproject");let mut p=Project::new("Previous good");save_managed_project(&file,&p).unwrap();let before=fs::read(&file).unwrap();let recovery=project_recovery_path(&file).unwrap();
        fs::write(&recovery,b"corrupt recovery evidence").unwrap();p.title="Not adopted".into();assert!(save_managed_project(&file,&p).is_err());assert_eq!(fs::read(&file).unwrap(),before);assert_eq!(fs::read(&recovery).unwrap(),b"corrupt recovery evidence");
        let foreign=Project::new("Foreign original");fs::write(&recovery,serde_json::to_vec(&foreign).unwrap()).unwrap();assert!(save_managed_project(&file,&p).is_err());assert_eq!(fs::read(&file).unwrap(),before);
        fs::remove_file(&recovery).unwrap();p.automatic_backup_retention=Some(101);assert!(save_managed_project(&file,&p).is_err());assert_eq!(fs::read(&file).unwrap(),before);assert!(!recovery.exists());
    }
    #[test]
    fn source_less_initialization_retains_prior_revision_and_refuses_rebinding_an_existing_source() {
        let dir=tempfile::tempdir().unwrap();let file=dir.path().join("project.gsproject");let mut p=Project::new("Source initialization");save_managed_project(&file,&p).unwrap();
        p.source=Some(Source{original_path:dir.path().join("original.map"),preserved_path:dir.path().join("source.map"),sha256:"a".repeat(64),cache_version:609,engine:"synthetic".into(),scenario_path:"levels/test/fixture".into(),archive:None,resource_directory:None,resource_sha256:Default::default(),audio_resources:None});
        save_managed_project(&file,&p).unwrap();let recovery=project_recovery_path(&file).unwrap();assert!(load_project(&recovery).unwrap().source.is_none());
        // An independent native reader still rejects incorrect cache metadata;
        // the serializer does not migrate it or replace that admission gate.
        p.source.as_mut().unwrap().cache_version=13;save_managed_project(&file,&p).unwrap();assert_eq!(load_project(&recovery).unwrap().source.unwrap().cache_version,609);
        let before=fs::read(&file).unwrap();let backup_before=fs::read(&recovery).unwrap();p.source.as_mut().unwrap().sha256="b".repeat(64);assert!(save_managed_project(&file,&p).is_err());assert_eq!(fs::read(&file).unwrap(),before);assert_eq!(fs::read(&recovery).unwrap(),backup_before);
        p.source.as_mut().unwrap().sha256="a".repeat(64);let mut foreign=p.clone();foreign.source.as_mut().unwrap().sha256="b".repeat(64);fs::write(&recovery,serde_json::to_vec(&foreign).unwrap()).unwrap();p.title="Not adopted".into();assert!(save_managed_project(&file,&p).is_err());assert_eq!(fs::read(&file).unwrap(),before);
    }
    #[test]
    fn portable_descriptor_serialization_keeps_unique_history_and_does_not_adopt_untrusted_inputs() {
        let root=tempfile::tempdir().unwrap();let file=root.path().join("incoming.gsproject");let first=Project::new("Previous descriptor");save_project(&file,&first).unwrap();
        let mut incoming=Project::new("Untrusted references");incoming.assets.push(Asset{id:"untrusted".into(),name:"Untrusted".into(),kind:"obj".into(),sha256:"a".repeat(64),path:PathBuf::from(r"\\server.invalid\share\untrusted.obj"),vertices:0,triangles:0,has_uvs:false,materials:vec![]});
        save_project(&file,&incoming).unwrap();assert_eq!(load_project(&file).unwrap().id,incoming.id);
        let backups=fs::read_dir(root.path()).unwrap().map(|entry|entry.unwrap().path()).filter(|p|p.file_name().unwrap().to_string_lossy().starts_with("incoming.gsproject.bak-")).collect::<Vec<_>>();assert_eq!(backups.len(),1);assert_eq!(load_project(&backups[0]).unwrap().id,first.id);
        let library=crate::library::Library::open(&root.path().join("library")).unwrap();assert!(library.import_project(&file).unwrap_err().to_string().contains("No referenced input was opened"));assert!(library.list().unwrap().is_empty());
    }
}

#[cfg(test)]
mod native_lighting_revision_tests {
    use super::*;
    #[test]
    fn imported_bsp_bakes_have_distinct_revisions_and_preview_does_not_replace_them() {
        let mut p=Project::new("Lighting revision fixture");
        let source=serde_json::json!({"originalPath":"fixture.map","preservedPath":"fixture.map","sha256":"a".repeat(64),"cacheVersion":609,"engine":"Halo Custom Edition","scenarioPath":"levels/test/fixture"});
        p.source=Some(serde_json::from_value(source.clone()).unwrap());
        p.bsp_assembly=Some(serde_json::from_value(serde_json::json!({"schemaVersion":1,"donorProjectId":Uuid::new_v4().to_string(),"donorTitle":"Fixture donor","donorSource":source,"donorTagsDirectory":"fixture-tags","donorBspIndex":0,"translation":[10.,0.,0.],"yawDegrees":0.,"tunnelPoints":[[1.,0.,0.],[9.,0.,0.]],"tunnelWidth":2.,"tunnelHeight":1.6,"tunnelShaderPath":"fixture/metal"})).unwrap());
        p.validate().unwrap();
        let original=p.fingerprint().unwrap();
        let mut preview=crate::quickforge::EditorEnvironment::default();preview.ambient_intensity=0.6;
        p.world_environment=Some(preview.clone());assert_eq!(p.fingerprint().unwrap(),original);
        p.native_lighting=Some(crate::native_lighting::NativeLighting{sky_path:"sky/example".into(),environment:preview,quality:"draft".into()});
        p.validate().unwrap();let draft=p.fingerprint().unwrap();assert_ne!(draft,original);
        let reloaded:Project=serde_json::from_slice(&serde_json::to_vec(&p).unwrap()).unwrap();
        assert_eq!(reloaded.fingerprint().unwrap(),draft);
        p.native_lighting.as_mut().unwrap().environment.ambient_intensity=0.75;
        assert_ne!(p.fingerprint().unwrap(),draft);
        p=reloaded;p.native_lighting.as_mut().unwrap().quality="final".into();
        assert_ne!(p.fingerprint().unwrap(),draft);
        p.native_lighting=None;p.validate().unwrap();
        assert_eq!(p.fingerprint().unwrap(),original);
    }
}


#[cfg(test)]
mod atomic_publication_tests {
    use super::*;
    std::thread_local! {
        static PUBLICATION_HOOK: std::cell::RefCell<Option<Box<dyn FnOnce()>>> = std::cell::RefCell::new(None);
        static STAGED_HANDLE_HOOK: std::cell::RefCell<Option<Box<dyn FnOnce()>>> = std::cell::RefCell::new(None);
        #[cfg(windows)]
        static MANAGED_GAP_HOOK: std::cell::RefCell<Option<Box<dyn FnOnce()>>> = std::cell::RefCell::new(None);
    }
    pub(super) fn run_publication_hook() {
        let hook = PUBLICATION_HOOK.with(|slot| slot.borrow_mut().take());
        if let Some(hook) = hook { hook(); }
    }
    pub(super) fn run_staged_handle_hook() {
        let hook = STAGED_HANDLE_HOOK.with(|slot| slot.borrow_mut().take());
        if let Some(hook) = hook { hook(); }
    }
    #[cfg(windows)]
    pub(super) fn run_managed_gap_hook() {
        let hook = MANAGED_GAP_HOOK.with(|slot| slot.borrow_mut().take());
        if let Some(hook) = hook { hook(); }
    }
    #[cfg(windows)]
    #[test]
    fn verified_staging_handle_denies_external_writes_and_renames() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().to_path_buf();
        STAGED_HANDLE_HOOK.with(|slot| *slot.borrow_mut() = Some(Box::new(move || {
            let staged = fs::read_dir(&directory).unwrap().map(|e| e.unwrap().path())
                .find(|p| p.file_name().unwrap().to_string_lossy().starts_with(".spark-write-")).unwrap();
            assert!(fs::write(&staged, b"foreign writer").is_err());
            assert!(fs::rename(&staged, directory.join("foreign-rename")).is_err());
        })));
        let target = root.path().join("project.gsproject");
        atomic_write(&target, b"verified staged source", false).unwrap();
        assert_eq!(fs::read(target).unwrap(), b"verified staged source");
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    }
    #[cfg(windows)]
    fn existing_in_place_writer_cannot_be_lost(checked: bool) {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("project.gsproject");
        fs::write(&target, b"reviewed source").unwrap();
        let reviewed = FileRevision::capture(&target).unwrap();
        let foreign = target.clone();
        let accepted = std::rc::Rc::new(std::cell::Cell::new(false));
        let observed = accepted.clone();
        PUBLICATION_HOOK.with(|slot| *slot.borrow_mut() = Some(Box::new(move || {
            let result = fs::write(foreign, b"external editor's new revision");
            if let Err(error) = &result { assert_eq!(error.raw_os_error(), Some(32), "refusal must be native sharing enforcement"); }
            observed.set(result.is_ok());
        })));
        let result = atomic_write_checked(&target, b"our saved revision", false, checked.then_some(&reviewed));
        if accepted.get() {
            assert!(result.is_err(), "an external write accepted during Save must never be overwritten");
            assert_eq!(fs::read(&target).unwrap(), b"external editor's new revision");
        } else {
            result.unwrap();
            assert_eq!(fs::read(&target).unwrap(), b"our saved revision");
        }
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    }
    #[cfg(windows)]
    #[test]
    fn checked_existing_save_preserves_a_late_in_place_editor_write() { existing_in_place_writer_cannot_be_lost(true); }
    #[cfg(windows)]
    #[test]
    fn unchecked_existing_save_preserves_a_late_in_place_editor_write() { existing_in_place_writer_cannot_be_lost(false); }
    #[cfg(windows)]
    #[test]
    fn checked_existing_save_preserves_a_late_atomic_editor_replacement() {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("project.gsproject");
        fs::write(&target, b"reviewed source").unwrap();
        let reviewed = FileRevision::capture(&target).unwrap();
        let foreign = target.clone();
        PUBLICATION_HOOK.with(|slot| *slot.borrow_mut() = Some(Box::new(move || {
            let staged = foreign.with_extension("external-editor");
            fs::write(&staged, b"external editor's atomic revision").unwrap();
            fs::rename(staged, foreign).unwrap();
        })));
        assert!(atomic_write_checked(&target, b"our saved revision", false, Some(&reviewed)).is_err());
        assert_eq!(fs::read(&target).unwrap(), b"external editor's atomic revision");
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    }
    #[cfg(windows)]
    #[test]
    fn managed_save_cannot_overwrite_a_replacement_after_its_final_identity_check() {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("project.gsproject");
        let mut project = Project::new("Previously saved");
        save_managed_project(&target, &project).unwrap();
        let mut external = project.clone();
        external.title = "External editor".into();
        let incoming = root.path().join("external-save.gsproject");
        fs::write(&incoming, encoded_project(&incoming, &external).unwrap()).unwrap();
        let foreign_target = target.clone();
        let accepted = std::rc::Rc::new(std::cell::Cell::new(false));
        let observed = accepted.clone();
        // The first staged handle belongs to the previous-good backup. Arm
        // the competing Save only at the final descriptor publication.
        STAGED_HANDLE_HOOK.with(|slot| *slot.borrow_mut() = Some(Box::new(move || {
            STAGED_HANDLE_HOOK.with(|slot| *slot.borrow_mut() = Some(Box::new(move || {
                observed.set(fs::rename(&incoming, &foreign_target).is_ok());
            })));
        })));
        project.title = "Spark edit".into();
        let saved = save_managed_project(&target, &project);
        if accepted.get() {
            assert!(saved.is_err(), "Spark must refuse a later external replacement");
            assert_eq!(load_project(&target).unwrap().title, "External editor");
        } else {
            saved.unwrap();
            assert_eq!(load_project(&target).unwrap().title, "Spark edit");
        }
        assert_eq!(load_project(&project_recovery_path(&target).unwrap()).unwrap().title, "Previously saved");
    }
    #[cfg(windows)]
    #[test]
    fn managed_save_protects_an_external_arrival_during_the_no_replace_handoff() {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("project.gsproject");
        let mut project = Project::new("Previously saved");
        save_managed_project(&target, &project).unwrap();
        let previous = FileRevision::capture(&target).unwrap();
        let parked = parked_managed_path(&target, &previous).unwrap();
        let mut external = project.clone();
        external.title = "External editor".into();
        let incoming = encoded_project(&target, &external).unwrap();
        let foreign_target = target.clone();
        MANAGED_GAP_HOOK.with(|slot| *slot.borrow_mut() = Some(Box::new(move || {
            let mut arrived = OpenOptions::new().create_new(true).write(true).open(&foreign_target).unwrap();
            arrived.write_all(&incoming).unwrap();
            arrived.sync_all().unwrap();
        })));
        project.title = "Spark edit".into();
        let error = save_managed_project(&target, &project).unwrap_err();
        assert!(error.to_string().contains("project name changed externally"));
        let after = FileRevision::capture(&target).unwrap();
        assert_eq!(load_project(&target).unwrap().title, "External editor");
        assert_eq!(FileRevision::capture(&parked).unwrap(), previous);
        assert_eq!(FileRevision::capture(&project_recovery_path(&target).unwrap()).unwrap().sha256, previous.sha256);
        recover_managed_previous(&target, &project.id).unwrap();
        assert_eq!(FileRevision::capture(&target).unwrap(), after);
        assert_eq!(FileRevision::capture(&parked).unwrap(), previous);
    }

    #[cfg(windows)]
    #[test]
    fn interrupted_managed_handoff_restores_exact_previous_descriptor_on_library_reopen() {
        const CHILD_ROOT: &str = "SPARK_TEST_INTERRUPTED_MANAGED_SAVE_ROOT";
        const CHILD_ID: &str = "SPARK_TEST_INTERRUPTED_MANAGED_SAVE_ID";
        if let Some(root) = std::env::var_os(CHILD_ROOT) {
            let library = crate::library::Library::workspace(Path::new(&root)).unwrap();
            let mut project = library.get(&std::env::var(CHILD_ID).unwrap()).unwrap();
            project.title = "Unpublished edit".into();
            MANAGED_GAP_HOOK.with(|slot| *slot.borrow_mut() = Some(Box::new(|| std::process::exit(71))));
            library.save_explicit(&project, None).unwrap();
            panic!("Child never reached the interrupted Save boundary");
        }

        let root = tempfile::tempdir().unwrap();
        let library = crate::library::Library::workspace(root.path()).unwrap();
        let project = Project::new("Previously saved");
        library.save_explicit(&project, None).unwrap();
        let target = library.project_dir(&project.id).unwrap().join("project.gsproject");
        let previous = FileRevision::capture(&target).unwrap();
        let mut reader = fs::File::open(&target).unwrap();
        let parked = parked_managed_path(&target, &previous).unwrap();
        drop(library);
        let child = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "project::atomic_publication_tests::interrupted_managed_handoff_restores_exact_previous_descriptor_on_library_reopen"])
            .env(CHILD_ROOT, root.path()).env(CHILD_ID, &project.id).output().unwrap();
        assert_eq!(child.status.code(), Some(71), "{}", String::from_utf8_lossy(&child.stdout));
        assert!(!target.exists());
        assert_eq!(FileRevision::capture(&parked).unwrap(), previous);
        let library = crate::library::Library::workspace(root.path()).unwrap();
        let mut restored = library.get(&project.id).unwrap();
        assert_eq!(restored.title, "Previously saved");
        assert_eq!(FileRevision::capture(&target).unwrap(), previous);
        assert!(!parked.exists());
        restored.title = "Retried Save".into();
        library.save_explicit(&restored, None).unwrap();
        assert_eq!(load_project(&target).unwrap().title, "Retried Save");
        use std::io::Read;
        let mut original = Vec::new();
        reader.read_to_end(&mut original).unwrap();
        assert_eq!(serde_json::from_slice::<Project>(&original).unwrap().title, "Previously saved");
    }

    #[cfg(windows)]
    #[test]
    fn an_already_open_external_writer_prevents_save_without_closing_that_writer() {
        use std::io::{Seek, SeekFrom};
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("project.gsproject");
        fs::write(&target, b"reviewed source").unwrap();
        let mut external = OpenOptions::new().write(true).open(&target).unwrap();
        let error = atomic_write(&target, b"our saved revision", false).unwrap_err();
        assert!(error.to_string().contains("Finish that edit and retry Save"));
        assert_eq!(fs::read(&target).unwrap(), b"reviewed source");
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
        external.seek(SeekFrom::Start(0)).unwrap();
        external.write_all(b"external source").unwrap();
        drop(external);
        atomic_write(&target, b"our saved revision", false).unwrap();
        assert_eq!(fs::read(target).unwrap(), b"our saved revision");
    }
    #[cfg(windows)]
    #[test]
    fn guarded_save_preserves_existing_reader_snapshot_and_publishes_new_revision() {
        use std::io::Read;
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("project.gsproject");
        fs::write(&target, b"reviewed source").unwrap();
        let mut reader = fs::File::open(&target).unwrap();
        atomic_write(&target, b"our saved revision", false).unwrap();
        let mut original = Vec::new();reader.read_to_end(&mut original).unwrap();
        assert_eq!(original, b"reviewed source");
        assert_eq!(fs::read(target).unwrap(), b"our saved revision");
    }
    fn arriving_file_is_preserved(checked: bool) {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("new-project.gsproject");
        let absent = FileRevision::capture(&target).unwrap();
        let foreign = target.clone();
        PUBLICATION_HOOK.with(|slot| *slot.borrow_mut() = Some(Box::new(move || {
            fs::write(foreign, b"independently saved user project").unwrap();
        })));
        let result = atomic_write_checked(&target, b"our new project", false, checked.then_some(&absent));
        assert!(result.is_err(), "publishing a new file must not replace an independently arriving revision");
        assert_eq!(fs::read(&target).unwrap(), b"independently saved user project");
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1, "only our unused temporary file may be retired");
    }
    #[test]
    fn staging_content_changes_with_the_same_file_identity_are_retained() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().to_path_buf();
        PUBLICATION_HOOK.with(|slot| *slot.borrow_mut() = Some(Box::new(move || {
            let staged = fs::read_dir(&directory).unwrap().map(|e| e.unwrap().path())
                .find(|p| p.file_name().unwrap().to_string_lossy().starts_with(".spark-write-")).unwrap();
            let before = crate::storage::unique_file_identity(&staged);
            fs::write(&staged, b"bad reviewed project").unwrap();
            assert_eq!(crate::storage::unique_file_identity(&staged), before);
        })));
        let target = root.path().join("project.gsproject");
        assert!(atomic_write(&target, b"our reviewed project", false).is_err());
        assert!(!target.exists());
        let staged = fs::read_dir(root.path()).unwrap().next().unwrap().unwrap().path();
        assert_eq!(fs::read(staged).unwrap(), b"bad reviewed project");
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    }
    fn replaced_stage_is_preserved(destination_arrives: bool) {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("project.gsproject");
        let directory = root.path().to_path_buf();
        let foreign_target = target.clone();
        PUBLICATION_HOOK.with(|slot| *slot.borrow_mut() = Some(Box::new(move || {
            let staged = fs::read_dir(&directory).unwrap().map(|e| e.unwrap().path())
                .find(|p| p.file_name().unwrap().to_string_lossy().starts_with(".spark-write-")).unwrap();
            // Keep the original inode alive to exclude accidental file-ID reuse.
            fs::rename(&staged, directory.join("our-detached-stage")).unwrap();
            fs::write(&staged, b"another owner's temporary source").unwrap();
            if destination_arrives { fs::write(foreign_target, b"another owner's project").unwrap(); }
        })));
        let result = atomic_write(&target, b"our reviewed project", false);
        assert!(result.is_err(), "a replaced staging file must never be published");
        let staged = fs::read_dir(root.path()).unwrap().map(|e| e.unwrap().path())
            .find(|p| p.file_name().unwrap().to_string_lossy().starts_with(".spark-write-"))
            .expect("foreign replacement must not be deleted by error cleanup");
        assert_eq!(fs::read(staged).unwrap(), b"another owner's temporary source");
        assert_eq!(fs::read(root.path().join("our-detached-stage")).unwrap(), b"our reviewed project");
        if destination_arrives { assert_eq!(fs::read(target).unwrap(), b"another owner's project"); }
        else { assert!(!target.exists()); }
    }
    #[test]
    fn new_file_publication_refuses_a_replaced_staging_file() { replaced_stage_is_preserved(false); }
    #[test]
    fn failed_publication_preserves_foreign_staging_replacement() { replaced_stage_is_preserved(true); }
    #[test]
    fn new_file_publication_supports_relative_filename() {
        const CHILD_ROOT: &str = "SPARK_ATOMIC_RELATIVE_TEST_ROOT";
        if let Some(root) = std::env::var_os(CHILD_ROOT) {
            assert_eq!(fs::canonicalize(std::env::current_dir().unwrap()).unwrap(), fs::canonicalize(root).unwrap());
            atomic_write(Path::new("relative-fixture.gsproject"), b"relative path source", false).unwrap();
            return;
        }
        let root = tempfile::tempdir().unwrap();
        let child = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "project::atomic_publication_tests::new_file_publication_supports_relative_filename"])
            .env(CHILD_ROOT, root.path()).current_dir(root.path()).output().unwrap();
        assert!(child.status.success(), "{}", String::from_utf8_lossy(&child.stderr));
        assert_eq!(fs::read(root.path().join("relative-fixture.gsproject")).unwrap(), b"relative path source");
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    }
    #[test]
    fn new_file_publication_keeps_normal_save_and_exact_backup() {
        let root = tempfile::tempdir().unwrap(); let target = root.path().join("project.gsproject");
        assert!(atomic_write(&target, b"first", true).unwrap().is_none());
        assert!(crate::storage::unique_file_identity(&target).is_some());
        let backup = atomic_write(&target, b"second", true).unwrap().unwrap();
        assert_eq!(fs::read(backup).unwrap(), b"first");
        assert_eq!(fs::read(target).unwrap(), b"second");
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 2);
    }
    #[cfg(windows)]
    #[test]
    fn new_file_publication_supports_long_unicode_windows_paths() {
        let root = tempfile::tempdir().unwrap();
        let parent = (0..4).fold(root.path().to_path_buf(), |path, n| path.join(format!("section{n}-{}", "x".repeat(75))));
        let target = parent.join("creation-\u{00e9}.gsproject");
        atomic_write(&target, b"long path source", false).unwrap();
        assert_eq!(fs::read(target).unwrap(), b"long path source");
        assert_eq!(fs::read_dir(parent).unwrap().count(), 1);
    }
    #[test]
    fn unchecked_new_file_publication_preserves_last_moment_arrival() { arriving_file_is_preserved(false); }
    #[test]
    fn checked_new_file_publication_preserves_last_moment_arrival() { arriving_file_is_preserved(true); }
}
