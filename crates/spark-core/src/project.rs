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
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub bsp_assembly:Option<crate::bsp_assembly::BspAssembly>,
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
    #[serde(default,skip_serializing_if="Vec::is_empty")]
    pub build_targets:Vec<EngineBuildTarget>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub active_build_target:Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub world_environment:Option<crate::quickforge::EditorEnvironment>,
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
            schema_version: PROJECT_VERSION,
            id: Uuid::new_v4().to_string(),
            title: title.into(),
            created_at: now.clone(),
            modified_at: now,
            source: None,
            bsp_assembly:None,
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
            build_targets:vec![],active_build_target:None,
            world_environment:None,
            source_scene_version:1,
        }
    }
    pub fn validate(&self) -> Result<()> {
        if let Some(assembly)=&self.bsp_assembly{assembly.validate()?;if self.source.is_none()||self.quick_forge.is_some(){return invalid("A BSP assembly needs a preserved destination map");}}
        if let Some(features)=&self.render_features{features.validate()?;}
        if self.animations.len()>128||self.animation_assignments.len()>128{return invalid("Animation library exceeds 128 assets or assignments");}
        let mut animation_ids=std::collections::HashSet::new();for asset in &self.animations{asset.validate()?;if !animation_ids.insert(&asset.id){return invalid("Duplicate animation asset");}}
        for binding in &self.animation_assignments{uuid::Uuid::parse_str(&binding.id).map_err(|_|crate::SparkError::Invalid("Invalid animation assignment".into()))?;if !animation_ids.contains(&binding.asset_id)||!matches!(binding.mode.as_str(),"custom"|"replace-graph")||binding.source_sha256.len()!=64||binding.target_tag_path.len()>256||crate::safe_relative(&binding.target_tag_path).is_err(){return invalid("Invalid animation assignment or missing source asset");}}
        if self.conversion_profile.as_deref().is_some_and(|p|!matches!(p,"faithful"|"zombie-recovery")){return invalid("Unknown map conversion profile");}
        if let Some(environment)=&self.world_environment {environment.validate()?;}
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
            if source.resource_sha256.iter().any(|(name, hash)| {
                !(["bitmaps.map", "sounds.map", "loc.map"].contains(&name.as_str())
                    || (source.cache_version==13&&(["common.ipak","inplace1.ipak","inplace2.ipak","mcc-textures"].contains(&name.as_str())
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
        let mut ids = std::collections::HashSet::new();
        for object in &self.scene {
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
    pub fn fingerprint(&self) -> Result<String> {
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
            format!("{:x}", Sha256::digest(bytes))
        } else {
            let mut hash=Sha256::new();hash.update(bytes);
            let active=self.build_targets.iter().find(|t|Some(&t.id)==self.active_build_target.as_ref())
                .ok_or_else(||crate::SparkError::Invalid("Active engine build target missing".into()))?;
            hash.update(serde_json::to_vec(active)?);
            format!("{:x}",hash.finalize())
        };
        let camera=self.studio.as_ref().and_then(|s|s.engine_machinima.as_ref().filter(|o|o.enabled).map(|o|(o,&s.shots)));
        let profile=self.conversion_profile.as_deref().filter(|p|*p!="faithful");
        if camera.is_none()&&profile.is_none()&&self.animation_assignments.is_empty()&&self.bsp_assembly.is_none(){return Ok(base);}
        let used:Vec<_>=self.animations.iter().filter(|asset|self.animation_assignments.iter().any(|a|a.asset_id==asset.id)).collect();
        let mut hash=Sha256::new();hash.update(b"spark-native-inputs-v1\0");hash.update(base.as_bytes());hash.update(fingerprint_json(serde_json::to_vec(&(camera,profile,&self.animation_assignments,used))?));if let Some(assembly)=&self.bsp_assembly{hash.update(b"bsp-assembly-v1\0");hash.update(fingerprint_json(serde_json::to_vec(assembly)?));}Ok(format!("{:x}",hash.finalize()))
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

/// Write to a sibling temporary file, fsync, then replace. Keep an exact backup before replacement.
pub fn atomic_write(path: &Path, bytes: &[u8], backup: bool) -> Result<Option<PathBuf>> {
    reject_links(path)?;
    let parent = path
        .parent()
        .ok_or_else(|| crate::SparkError::Invalid("Output has no parent".into()))?;
    fs::create_dir_all(parent)?;
    let temp = parent.join(format!(".spark-write-{}.tmp", Uuid::new_v4()));
    let result = (|| -> Result<Option<PathBuf>> {
        let mut f = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        let bak = if backup && path.is_file() {
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
        fs::rename(&temp, path)?;
        Ok(bak)
    })();
    if temp.exists() {
        let _ = fs::remove_file(temp);
    }
    result
}
pub fn save_project(path: &Path, project: &Project) -> Result<()> {
    project.validate()?;
    let bytes = serde_json::to_vec_pretty(project)?;
    if bytes.len() > 32 * 1024 * 1024 {
        return invalid("Project JSON exceeds 32 MiB");
    }
    let _: Project = serde_json::from_slice(&bytes)?;
    atomic_write(path, &bytes, true)?;
    Ok(())
}
pub fn load_project(path: &Path) -> Result<Project> {
    if fs::metadata(path)?.len() > 32 * 1024 * 1024 {
        return invalid("Project exceeds 32 MiB");
    }
    let p: Project = serde_json::from_slice(&fs::read(path)?)?;
    p.validate()?;
    Ok(p)
}

/// A renderer supplies semantic edits, never arbitrary offsets. Re-resolve every field from the cache.
pub fn validate_edits(project: &Project, inspection: &MapInspection) -> Result<()> {
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
            if !value.is_finite() || value < field.min || value > field.max {
                return invalid(format!(
                    "{} must be between {} and {}",
                    field.label, field.min, field.max
                ));
            }
        }
    }
    Ok(())
}
pub fn patched_cache(project: &Project, inspection: &MapInspection) -> Result<Vec<u8>> {
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
            bytes[f.offset..f.offset + 4]
                .copy_from_slice(&(edit.value.as_f64().unwrap() as f32).to_le_bytes());
        }
    }
    for object in &project.scene {
        if let Some(original) = inspection.objects.iter().find(|o| o.id == object.id) {
            if object.scale != [1.0; 3] {
                return invalid("Halo scenario instances do not support per-instance scale. Scale is available only for workshop meshes.");
            }
            if let Some(at) = original.source_offset {
                for i in 0..3 {
                    bytes[at + i * 4..at + i * 4 + 4]
                        .copy_from_slice(&object.position[i].to_le_bytes());
                }
            }
            if let Some(at) = original.rotation_offset {
                if matches!(original.kind.as_str(),"Player spawn"|"Netgame item") {
                    if object.rotation[1]!=0.||object.rotation[2]!=0.{return invalid("This source placement supports yaw only; pitch and roll must remain zero");}
                    bytes[at..at + 4].copy_from_slice(&object.rotation[0].to_le_bytes());
                } else {
                    for i in 0..3 {
                        bytes[at + i * 4..at + i * 4 + 4]
                            .copy_from_slice(&object.rotation[i].to_le_bytes());
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
