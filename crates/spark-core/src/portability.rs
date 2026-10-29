//! Read-only edition preflight and byte-preservation evidence. Uses the existing
//! runtime registry; reports are editor metadata, never native Halo tag extensions.
use crate::{
    build, invalid,
    maps::{self, MapInspection},
    project::{self, Project},
    runtime_adapters::{self, GameFamily, RuntimeAdapterProfile},
    Result, SparkError,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

const TAGS: &str = "https://c20.reclaimers.net/h1/tags/";
const PORTING: &str = "https://c20.reclaimers.net/h1/guides/porting-maps/";
const GENERIC: &str = "https://c20.reclaimers.net/h1/tags/shader/shader_transparent_generic/";
const DETAILS: &str = "https://c20.reclaimers.net/h1/tags/detail_object_collection/";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub code: String,
    pub severity: String,
    pub title: String,
    pub detail: String,
    pub next_action: String,
    pub source: String,
    pub tag_ids: Vec<u32>,
    pub affected_tags: usize,
}
fn finding(
    code: &str,
    severity: &str,
    title: &str,
    detail: &str,
    next: &str,
    source: &str,
    ids: Vec<u32>,
) -> Finding {
    let affected_tags = ids.len();
    Finding {
        code: code.into(),
        severity: severity.into(),
        title: title.into(),
        detail: detail.into(),
        next_action: next.into(),
        source: source.into(),
        tag_ids: ids.into_iter().take(64).collect(),
        affected_tags,
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetReport {
    pub profile: RuntimeAdapterProfile,
    pub cache_family_matches: bool,
    pub compiler: String,
    pub conversion_available: bool,
    pub findings: Vec<Finding>,
    pub build_preflight: Option<build::CompatibilityReport>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub schema_version: u32,
    pub project_id: String,
    pub project_fingerprint: String,
    pub source_sha256: String,
    pub source_edition: String,
    pub source_cache_version: u32,
    pub source_tags: usize,
    pub audited_fields: usize,
    pub targets: Vec<TargetReport>,
    pub limitations: Vec<String>,
}
pub fn profiles() -> Vec<RuntimeAdapterProfile> {
    runtime_adapters::registry()
        .into_iter()
        .filter(|p| p.target.family == GameFamily::Halo1)
        .collect()
}
pub fn target_findings(
    inspection: &MapInspection,
    profile: &RuntimeAdapterProfile,
) -> Vec<Finding> {
    let mut findings = vec![];
    let xbox = profile.target.edition == "originalXbox";
    let mcc = matches!(
        profile.target.edition.as_str(),
        "mccHalo1" | "h1aStandalone"
    );
    let gearbox = matches!(
        profile.target.edition.as_str(),
        "retail"
            | "trial"
            | "demo"
            | "haloMd"
            | "retailDedicated"
            | "customEdition"
            | "customEditionDedicated"
    );
    let ids = |class: &str| {
        inspection
            .tags
            .iter()
            .filter(|tag| tag.class == class)
            .map(|tag| tag.id)
            .collect::<Vec<_>>()
    };
    let models = ids(if xbox { "mod2" } else { "mode" });
    if !models.is_empty() && (xbox || mcc || gearbox) {
        findings.push(finding("MODEL_CLASS","blocker","Model tags require an explicit conversion",if xbox{"This source contains Gearbox gbxmodel (mod2) tags; the original Xbox target uses model (mode)."}else{"This source contains Xbox model (mode) tags; this target uses Gearbox gbxmodel (mod2)."},"Use a verified model conversion tool on derived tags, then review nodes, markers, shaders and LODs. Renaming the class is insufficient.","https://c20.reclaimers.net/h1/tags/gbxmodel/",models));
    }
    let generic = ids("sotr");
    if gearbox && !generic.is_empty() && profile.target.extension_ids.is_empty() {
        findings.push(finding("GENERIC_SHADER","blocker","Requires a different shader for this target","Gearbox PC/CE does not render shader_transparent_generic. A Chicago replacement can change appearance; there is no universal lossless substitution.","Author and review a target-specific shader in a derived tagset; retain the original.",GENERIC,generic));
    } else if gearbox && !generic.is_empty() {
        findings.push(finding("GENERIC_SHADER_EXTENSION","review","Verify this extension’s shader support","The stock Gearbox renderer does not support this generic shader. The selected extension needs its own exact build evidence; Spark does not assume stock restrictions or extension support are universal.","Check the selected extension’s renderer and test the source shader before substituting any tag.",GENERIC,generic));
    }
    if inspection.header.extended
        && !profile
            .target
            .extension_ids
            .iter()
            .any(|id| id == "openSauce")
    {
        findings.push(finding("ENGINE_EXTENSIONS","blocker","Source requires engine extensions","The source cache has an OpenSauce header. Ordinary cache-version agreement does not preserve its extension tags or behavior.","Keep an OpenSauce target or review every unsupported extension before preparing a separate conversion.",PORTING,vec![]));
    }
    if inspection.header.version == 13 && !mcc {
        findings.push(finding("H1A_FIELDS","review","MCC fields and limits need review","H1A-specific fields, flags, scripts and higher limits are not automatically portable to earlier engines. Spark has not audited every field of this tagset.","Compare native extracted tags against the target schemas; compile scripts with the target tools.",PORTING,vec![]));
    }
    if !inspection.scripts.is_empty() {
        findings.push(finding("SCRIPT_FUNCTIONS","review","Script compatibility is not established","The cache exposes script names/types, not a complete source function-call audit. H1A parameters and runtime-specific functions require target compilation.","Recover legal script source, retain it with the working tags and inspect the target compiler result.",PORTING,vec![]));
    }
    if !ids("dobc").is_empty() {
        findings.push(finding("PAINTED_DETAILS","warning","This editor may overwrite painted grass","Sapien cluster-setting changes can clear detail placements; CE/H1A resaves can shift them vertically. A detail collection tag alone does not establish a nonempty painted BSP.","Snapshot the native BSP, inspect actual painted instances and compare protected detail data before accepting a BSP save.",DETAILS,ids("dobc")));
    }
    let missing = inspection
        .resources
        .iter()
        .filter(|r| r.required && !r.found)
        .map(|r| r.name.clone())
        .collect::<Vec<_>>();
    if !missing.is_empty() {
        findings.push(finding("RESOURCE_DEPENDENCIES","review","Check missing source resources",&format!("The source inspection reported: {}. Build checks separately verify selected resource pins and any reviewed fallback.",missing.join(", ")),"Connect the matching original resource files; a viewer texture/audio pack is not necessarily an extraction resource.",TAGS,vec![]));
    }
    let unknown = inspection
        .tags
        .iter()
        .filter(|tag| crate::tag_exchange::extension(&tag.class).is_err())
        .map(|tag| tag.id)
        .collect::<Vec<_>>();
    if !unknown.is_empty() {
        findings.push(finding("UNAUDITED_CLASSES","review","Some tag schemas remain unaudited","Spark cannot claim field-level conversion or round-trip preservation for every class present. Native extraction mappings are deliberately bounded.","Keep these native files unchanged or obtain a verified tool/schema before converting them.",TAGS,unknown));
    }
    if !mcc && !xbox && !gearbox {
        findings.push(finding("TARGET_SCHEMA","review","Exact target content rules remain unverified","This community/experimental profile needs its exact runtime revision, resource layout and source-backed toolchain. Matching a base cache version is insufficient.","Select the actual client build and test its native compiler/content path; do not infer cross-play.",PORTING,vec![]));
    }
    findings
}
pub fn assess(
    project: &Project,
    inspection: &MapInspection,
    targets: &[String],
    tools: &build::Toolchain,
) -> Result<Report> {
    if targets.is_empty() || targets.len() > 8 {
        return invalid("Choose one to eight distinct runtime profiles");
    }
    let source = project.source.as_ref().ok_or_else(|| {
        SparkError::Invalid("Open a source map before checking portability".into())
    })?;
    if source.sha256 != inspection.sha256 {
        return invalid("Portability inspection belongs to another source");
    }
    let registry = profiles();
    let mut seen = BTreeSet::new();
    let mut reports = vec![];
    for id in targets {
        if !seen.insert(id) {
            return invalid("Duplicate portability target");
        }
        let profile = registry
            .iter()
            .find(|p| &p.profile_id == id)
            .ok_or_else(|| SparkError::Invalid("Unknown Halo 1 portability target".into()))?
            .clone();
        let mcc =
            profile.profile_id == runtime_adapters::profile_id(crate::runtime::RuntimeId::MccSteam);
        reports.push(TargetReport {
            cache_family_matches: profile.cache_versions.contains(&inspection.header.version),
            compiler: if mcc {
                "Installed H1A Tool with compatible editable tags (current conversion pipeline)"
                    .into()
            } else {
                format!(
                    "{}; imported-cache conversion is not implemented for this exact profile",
                    profile.toolchain_generation
                )
            },
            conversion_available: mcc,
            findings: target_findings(inspection, &profile),
            build_preflight: mcc.then(|| build::compatibility(project, inspection, tools)),
            profile,
        });
    }
    Ok(Report{schema_version:1,project_id:project.id.clone(),project_fingerprint:project.fingerprint()?,source_sha256:source.sha256.clone(),
        source_edition:match inspection.header.version{7=>"PC/Mac retail-family cache; provenance is needed to distinguish the original platform".into(),6=>"PC/Mac Demo/Trial cache family; provenance is needed for the original platform".into(),_=>inspection.header.engine.clone()},
        source_cache_version:inspection.header.version,source_tags:inspection.tags.len(),audited_fields:inspection.tags.iter().map(|t|t.fields.len()).sum(),targets:reports,
        limitations:vec!["Cache-family agreement is not native tag, script, shader, gameplay or network compatibility.".into(),"Only inspected classes/fields are audited. Unknown payloads are preserved by immutable source/derived-copy workflows; native tool reserialization needs separate proof.".into(),"Build readiness, successful compilation, game loading and multiplayer agreement are separate acceptance results.".into()]})
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldChange {
    pub tag_path: String,
    pub class: String,
    pub field: String,
    pub before: serde_json::Value,
    pub after: serde_json::Value,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticDiff {
    pub source_sha256: String,
    pub target_sha256: String,
    pub source_cache_version: u32,
    pub target_cache_version: u32,
    pub source_tags: usize,
    pub target_tags: usize,
    pub missing_tags: Vec<String>,
    pub added_tags: Vec<String>,
    pub missing_tag_count: usize,
    pub added_tag_count: usize,
    pub field_changes: Vec<FieldChange>,
    pub field_change_count: usize,
    pub unchanged_audited_fields: usize,
    pub unpaired_audited_fields: usize,
    pub source_objects: usize,
    pub target_objects: usize,
    pub scope: String,
}
fn tag_key(tag: &maps::Tag) -> String {
    format!(
        "{}:{}",
        tag.class,
        tag.path.replace('/', "\\").to_ascii_lowercase()
    )
}
fn indexed(map: &MapInspection) -> Result<BTreeMap<String, &maps::Tag>> {
    let mut tags = BTreeMap::new();
    for tag in &map.tags {
        if tags.insert(tag_key(tag), tag).is_some() {
            return invalid("Ambiguous duplicate tag path/class in semantic comparison");
        }
    }
    Ok(tags)
}
pub fn compare(source: &MapInspection, target: &MapInspection) -> Result<SemanticDiff> {
    let a = indexed(source)?;
    let b = indexed(target)?;
    let missing = a
        .keys()
        .filter(|key| !b.contains_key(*key))
        .cloned()
        .collect::<Vec<_>>();
    let added = b
        .keys()
        .filter(|key| !a.contains_key(*key))
        .cloned()
        .collect::<Vec<_>>();
    let value = |map: &MapInspection, field: &maps::TagField| {
        if field.kind == "reference" {
            field
                .value
                .as_u64()
                .and_then(|id| map.tags.iter().find(|tag| tag.id as u64 == id))
                .map(|tag| serde_json::json!({"nativeTag":tag_key(tag)}))
                .unwrap_or_else(|| serde_json::json!({"unresolvedDatum":field.value}))
        } else {
            field.value.clone()
        }
    };
    let mut changes = vec![];
    let (mut count, mut unchanged, mut unpaired) = (0, 0, 0);
    for (key, tag) in &a {
        for field in &tag.fields {
            let Some(other) = b.get(key).and_then(|tag| {
                tag.fields
                    .iter()
                    .find(|f| f.key == field.key && f.kind == field.kind)
            }) else {
                unpaired += 1;
                continue;
            };
            let before = value(source, field);
            let after = value(target, other);
            if before == after {
                unchanged += 1;
            } else {
                count += 1;
                if changes.len() < 512 {
                    changes.push(FieldChange {
                        tag_path: tag.path.clone(),
                        class: tag.class.clone(),
                        field: field.key.clone(),
                        before,
                        after,
                    });
                }
            }
        }
    }
    Ok(SemanticDiff{source_sha256:source.sha256.clone(),target_sha256:target.sha256.clone(),source_cache_version:source.header.version,target_cache_version:target.header.version,source_tags:a.len(),target_tags:b.len(),missing_tag_count:missing.len(),added_tag_count:added.len(),missing_tags:missing.into_iter().take(256).collect(),added_tags:added.into_iter().take(256).collect(),field_changes:changes,field_change_count:count,unchanged_audited_fields:unchanged,unpaired_audited_fields:unpaired,source_objects:source.objects.len(),target_objects:target.objects.len(),scope:"Native class/path identities and Spark-audited fields only. Reference datums resolve to native class/path; offsets and cache IDs may legitimately change. Lists cap at 256 tags/512 changes; totals are complete. Unknown fields, shader appearance, scripts, object behavior and gameplay are not semantic-equivalence claims.".into()})
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preservation {
    pub source_sha256: String,
    pub derived_sha256: String,
    pub bytes: usize,
    pub changed_bytes: usize,
    pub permitted_ranges: Vec<[usize; 2]>,
    pub untouched_bytes_preserved: bool,
    pub byte_identical: bool,
    pub scope: String,
}
/// Verifies the existing bounded semantic patcher without writing either buffer.
/// Only reviewed field cells and changed placement components may differ.
pub fn verify_preservation(
    project: &Project,
    inspection: &MapInspection,
) -> Result<(Vec<u8>, Preservation)> {
    let derived = project::patched_cache(project, inspection)?;
    let source = project
        .source
        .as_ref()
        .ok_or_else(|| SparkError::Invalid("No preserved source".into()))?;
    let (_, before, hash) = maps::read_cache_snapshot(&source.preserved_path)?;
    if hash != inspection.sha256 || before.len() != derived.len() {
        return invalid("Source changed during native preservation check");
    }
    let mut ranges = vec![];
    for edit in &project.tag_edits {
        let field = inspection
            .tags
            .iter()
            .find(|t| t.id == edit.tag_id)
            .and_then(|t| t.fields.iter().find(|f| f.key == edit.field_key))
            .ok_or_else(|| SparkError::Invalid("Unreviewed preservation field".into()))?;
        let at = field.offset;
        match field.kind.as_str() {
            "reference" => {
                ranges.push([at, at + 8]);
                ranges.push([at + 12, at + 16]);
            }
            "i16" | "u16" => ranges.push([at, at + 2]),
            "f32" | "i32" => ranges.push([at, at + 4]),
            _ => return invalid("Unreviewed native field width"),
        }
    }
    for object in &project.scene {
        let old = inspection
            .objects
            .iter()
            .find(|o| o.id == object.id)
            .ok_or_else(|| SparkError::Invalid("New placement has no preservation span".into()))?;
        for (at, values, previous, axes) in [
            (old.source_offset, object.position, old.position, 3),
            (
                old.rotation_offset,
                object.rotation,
                old.rotation,
                if matches!(old.kind.as_str(), "Player spawn" | "Netgame item") {
                    1
                } else {
                    3
                },
            ),
        ] {
            if let Some(at) = at {
                for i in 0..axes {
                    if values[i] != previous[i] {
                        ranges.push([at + i * 4, at + i * 4 + 4]);
                    }
                }
            }
        }
    }
    ranges.sort_unstable();
    if ranges.iter().any(|[a, b]| a >= b || *b > before.len()) {
        return invalid("Preservation span escapes source bytes");
    }
    let (mut index, mut changed) = (0, 0);
    for (at, (a, b)) in before.iter().zip(&derived).enumerate() {
        if a == b {
            continue;
        }
        changed += 1;
        while index < ranges.len() && ranges[index][1] <= at {
            index += 1;
        }
        if index == ranges.len() || ranges[index][0] > at {
            return invalid(format!(
                "Unexpected native byte change outside reviewed edits at 0x{at:X}"
            ));
        }
    }
    let receipt=Preservation{source_sha256:hash,derived_sha256:format!("{:x}",Sha256::digest(&derived)),bytes:derived.len(),changed_bytes:changed,permitted_ranges:ranges,untouched_bytes_preserved:true,byte_identical:changed==0,scope:"Derived cache extraction input only; original source is never written. All bytes outside reviewed changes are identical, including unknown data. Native extraction/serialization/repacking and final game validity require separate checks.".into()};
    Ok((derived, receipt))
}
pub fn markdown(report: &Report) -> String {
    let mut text = format!(
        "# Halo Portability Lab\n\nSource: {} (cache {})\n\nSHA-256: `{}`\n\n",
        report.source_edition, report.source_cache_version, report.source_sha256
    );
    for target in &report.targets {
        text+=&format!("## {}\n\nCompiler: {}\n\nCache family matches: {}. Conversion pipeline implemented: {}. Gameplay remains unverified.\n\n",target.profile.label,target.compiler,target.cache_family_matches,target.conversion_available);
        for finding in &target.findings {
            text += &format!(
                "- **{}: {}** — {} Next: {} [Source]({})\n",
                finding.severity,
                finding.title,
                finding.detail,
                finding.next_action,
                finding.source
            );
        }
        if let Some(build) = &target.build_preflight {
            text += &format!("\nExisting build preflight ready: {}\n", build.ready);
            for blocker in &build.blockers {
                text += &format!("- Build blocker: {blocker}\n");
            }
        }
        text.push('\n');
    }
    for limit in &report.limitations {
        text += &format!("\n- {limit}");
    }
    text.push('\n');
    text
}

pub fn diff_markdown(diff: &SemanticDiff) -> String {
    let mut text=format!("# Native Halo semantic change report\n\nSource cache {}: `{}`\n\nTarget cache {}: `{}`\n\n{} unchanged inspected fields; {} changed; {} not paired. {} missing and {} added native tag identities.\n\n{}\n\n",diff.source_cache_version,diff.source_sha256,diff.target_cache_version,diff.target_sha256,diff.unchanged_audited_fields,diff.field_change_count,diff.unpaired_audited_fields,diff.missing_tag_count,diff.added_tag_count,diff.scope);
    for change in &diff.field_changes {
        text += &format!(
            "- `{}` ({}) / `{}`: `{}` → `{}`\n",
            change.tag_path, change.class, change.field, change.before, change.after
        );
    }
    for tag in &diff.missing_tags {
        text += &format!("- Missing native identity: `{tag}`\n");
    }
    for tag in &diff.added_tags {
        text += &format!("- Added native identity: `{tag}`\n");
    }
    text
}
