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
        resources:inspection.resources.clone(),
        readback:Readback{render_triangles:inspection.render_mesh.as_ref().map_or(0,|mesh|mesh.indices.len()/3),collision_triangles:inspection.mesh.indices.len()/3,
            model_types:inspection.model_meshes.len(),tags:inspection.tags.len(),typed_fields:inspection.tags.iter().map(|tag|tag.fields.len()).sum()},
        configured_build_targets:project.build_targets.iter().map(|target|target.id.clone()).collect(),candidate_preview_runtimes:candidates})
}
