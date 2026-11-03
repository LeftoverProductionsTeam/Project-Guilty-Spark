//! One read-only projection of the preserved source and its native inspection.
//! Candidate preview runtimes are search order, never decoder/write permission.
use crate::{invalid, maps::{MapInspection, Resource}, project::{Project, Source}, runtime::RuntimeId, Result};
use serde::Serialize;
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct RuntimeOrigin {
    pub runtime_id:RuntimeId,
    pub root:std::path::PathBuf,
    pub executable_sha256:Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct RuntimeInstallation {
    #[serde(flatten)]
    pub origin: RuntimeOrigin,
    pub original_location: bool,
    /// Registry input-family agreement only, never a game-load receipt.
    pub cache_family_matches: bool,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all="camelCase")]
pub enum RouteStatus { Available, RequiresPreflight, Unsupported, RequiresSource }

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct NativeRoute {
    pub operation: &'static str,
    pub status: RouteStatus,
    pub detail: &'static str,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct FormatContract {
    pub cache_version: u32,
    pub edition: &'static str,
    pub platform_ambiguous: bool,
    pub build: String,
    pub extended: bool,
    pub compressed: bool,
    pub operations: Vec<NativeRoute>,
    pub compilation_targets: Vec<NativeRoute>,
    pub runtime_family_candidates: Vec<RuntimeId>,
}

pub fn runtime_family_matches(runtime_id: RuntimeId, version: u32) -> bool {
    crate::runtime_adapters::registry().iter().any(|profile|
        profile.profile_id == crate::runtime_adapters::profile_id(runtime_id)
        && profile.cache_versions.contains(&version))
}

/// One source-family admission rule shared by preflight and the read-only
/// contract. Parsed Xbox assets are not an implemented Xbox -> MCC converter.
pub fn mcc_conversion_source(inspection: &MapInspection) -> bool {
    [6, 7, 609, 13].contains(&inspection.header.version)
        && !inspection.header.extended && !inspection.header.compressed
}

pub fn format_contract(project: &Project, inspection: &MapInspection) -> FormatContract {
    use RouteStatus::*;
    let plain = !inspection.header.extended && !inspection.header.compressed;
    let rebuild = mcc_conversion_source(inspection);
    let edition = match inspection.header.version {
        5 => "Original Xbox-derived cache",
        6 => "PC Trial / Mac Demo family; original platform needs provenance",
        7 => "PC Retail / Mac / HaloMD family; original platform needs provenance",
        609 => "Halo Custom Edition cache",
        13 => "MCC Halo 1 cache",
        _ => "Unclassified native cache",
    };
    let operations = vec![
        NativeRoute {operation:"inspect",status:Available,detail:"This exact preserved cache was read by its native parser; counts are decoder evidence."},
        NativeRoute {operation:"assetPreview",status:RequiresPreflight,detail:"Resolve exact resource identities and supported bitmap/model/audio payloads. Rendering and audible playback remain separate acceptance."},
        NativeRoute {operation:"compiledCacheEdit",status:if plain&&inspection.header.version==13 {RequiresPreflight}else{Unsupported},detail:"The current direct writer reviews bounded MCC v13 cells/CRC. It cannot add arrays, tags or BSP topology; Smart Edit must admit each transaction."},
        NativeRoute {operation:"looseTagRebuild",status:if rebuild {RequiresPreflight}else{Unsupported},detail:"Existing imported-cache publication rebuilds into MCC using matching native tools, complete recovered tags and explicit conversion preflight."},
        NativeRoute {operation:"bspTopology",status:if rebuild&&project.bsp_assembly.is_some(){RequiresPreflight}else{RequiresSource},detail:"Use existing BSP assembly or editable QuickForge/Workshop source. Selecting a compiled triangle does not make it editable source."},
    ];
    let compilation_targets = vec![
        NativeRoute {operation:"mccSteam",status:if rebuild{RequiresPreflight}else{Unsupported},detail:"MCC output requires the native conversion preflight and full dependencies. Unchanged MCC copies are not conversions."},
        NativeRoute {operation:"haloCustomEdition",status:Unsupported,detail:"Imported-cache conversion to CE is not integrated. The separate reviewed CE QuickForge/working-source builder does not grant arbitrary reverse conversion."},
        NativeRoute {operation:"openCe",status:Unsupported,detail:"OpenCE can admit reviewed native CE content through its own loader; this is not a separate cache compiler or an arbitrary converter."},
        NativeRoute {operation:"chupathingyCe",status:Unsupported,detail:"Chupathingy has distinct native input families and resources. A CE source build/handoff is not universal cache conversion."},
        NativeRoute {operation:"haloXbox",status:Unsupported,detail:"Xbox preservation and asset decoding are implemented subsets. No verified imported-cache console compiler or original-console publication route is integrated."},
        NativeRoute {operation:"haloMd",status:Unsupported,detail:"A v7 family match is not a native HaloMD conversion. Preserve original platform/build resources; native Mac/MD compilation and gameplay need separate engineering."},
    ];
    FormatContract {cache_version:inspection.header.version,edition,
        platform_ambiguous:matches!(inspection.header.version,6|7),build:inspection.header.build.clone(),
        extended:inspection.header.extended,compressed:inspection.header.compressed,operations,compilation_targets,
        runtime_family_candidates:[RuntimeId::MccSteam,RuntimeId::HaloCustomEdition,RuntimeId::OpenCe,RuntimeId::ChupathingyCe,
            RuntimeId::HaloPc,RuntimeId::MacRetail,RuntimeId::MacDemo,RuntimeId::HaloPcTrial,RuntimeId::HaloMd,RuntimeId::HaloXbox]
            .into_iter().filter(|id|runtime_family_matches(*id,inspection.header.version)).collect()}
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct Readback {
    pub render_triangles: usize,
    pub collision_triangles: usize,
    pub model_types: usize,
    pub tags: usize,
    pub typed_fields: usize,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct SourceIdentity {
    pub schema_version: u32,
    pub project_id: String,
    pub source: Source,
    pub format: String,
    /// Matching original bytes under a validated installation, when known.
    /// This does not grant runtime gameplay, conversion or Live Link support.
    pub runtime_origin: Option<RuntimeOrigin>,
    pub runtime_installations: Vec<RuntimeInstallation>,
    pub contract: FormatContract,
    pub resources: Vec<Resource>,
    pub readback: Readback,
    /// Configured profiles still need their normal source/tool preflight.
    pub configured_build_targets: Vec<String>,
    pub candidate_preview_runtimes: Vec<RuntimeId>,
}

/// This checks the immutable metadata binding. Every payload reader must still
/// hash fresh bytes and apply its format-specific layout/resource validation.
pub fn validate(source: &Source, inspection: &MapInspection) -> Result<()> {
    let normalize=|path:&str|path.replace('\\',"/").to_lowercase();
    if source.sha256!=inspection.sha256 || source.cache_version!=inspection.header.version ||
        normalize(&source.scenario_path)!=normalize(&inspection.scenario_path) {
        return invalid("The preserved source identity does not match its native inspection");
    }
    Ok(())
}

pub fn describe(project: &Project, inspection: &MapInspection) -> Result<SourceIdentity> {
    let source=project.source.as_ref().ok_or_else(||crate::SparkError::Invalid("This workspace has no preserved Halo map".into()))?;
    validate(source,inspection)?;
    // Xbox/MCC internal layouts already have their own readers. Classic-only
    // substitutions must not be broadened to them or to extended/compressed
    // layouts by this search plan.
    let candidates=if inspection.header.extended||inspection.header.compressed {vec![]} else {
        match source.cache_version {
            609=>vec![RuntimeId::HaloCustomEdition,RuntimeId::MccSteam,RuntimeId::HaloPc],
            7=>vec![RuntimeId::HaloPc,RuntimeId::MccSteam,RuntimeId::HaloCustomEdition],
            6=>vec![RuntimeId::MccSteam,RuntimeId::HaloPc,RuntimeId::HaloCustomEdition],
            _=>vec![],
        }
    };
    Ok(SourceIdentity{schema_version:1,project_id:project.id.clone(),source:source.clone(),format:inspection.header.engine.clone(),runtime_origin:None,
        runtime_installations:vec![],contract:format_contract(project,inspection),
        resources:inspection.resources.clone(),
        readback:Readback{render_triangles:inspection.render_mesh.as_ref().map_or(0,|mesh|mesh.indices.len()/3),collision_triangles:inspection.mesh.indices.len()/3,
            model_types:inspection.model_meshes.len(),tags:inspection.tags.len(),typed_fields:inspection.tags.iter().map(|tag|tag.fields.len()).sum()},
        configured_build_targets:project.build_targets.iter().map(|target|target.id.clone()).collect(),candidate_preview_runtimes:candidates})
}
