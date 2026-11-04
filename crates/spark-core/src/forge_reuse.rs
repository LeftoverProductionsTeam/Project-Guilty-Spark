//! Reuse only a previously accepted build of this exact source/tool revision.
//! This avoids a new writable tag tree for an unchanged Build click. No cache
//! hit can be inferred from filenames, timestamps or a compiler exit code.
use crate::{
    forge_build::{ForgeToolchain, QuickForgeBuildReceipt},
    maps,
    project::{self, Project},
    reject_links, safe_relative, tool_transaction, Result,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
};
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    schema_version: u32,
    source_root: PathBuf,
    kit_flavor: Option<String>,
    input_hashes: BTreeMap<String, String>,
    #[serde(default)]
    imported_hashes: BTreeMap<String, String>,
    compiled_tags: BTreeMap<String, String>,
    authored_data: BTreeMap<String, String>,
    project_sha256: String,
}
fn load<T: serde::de::DeserializeOwned>(p: &Path) -> Result<T> {
    reject_links(p)?;
    let f = fs::File::open(p)?;
    if f.metadata()?.len() > 4 * 1024 * 1024 {
        return crate::invalid("Build reuse metadata exceeds its bound");
    }
    let mut bytes = vec![];
    f.take(4 * 1024 * 1024 + 1).read_to_end(&mut bytes)?;
    Ok(serde_json::from_slice(&bytes)?)
}
pub(crate) fn record(
    job: &Path,
    source: &Path,
    tags: &Path,
    inputs: &BTreeMap<String, String>,
    imported_hashes: &BTreeMap<String, String>,
    tools: &ForgeToolchain,
) -> Result<()> {
    let compiled_tags = tool_transaction::inventory(tags)?;
    let workspace = job.join("workspace");
    let authored_data = tool_transaction::inventory(&workspace.join("data"))?;
    let project_sha256 = maps::hash_file(&workspace.join("project.gsproject"))?;
    project::atomic_write(
        &job.join("reuse-contract.json"),
        &serde_json::to_vec(&Contract {
            schema_version: 3,
            source_root: source.to_owned(),
            kit_flavor: tools.hek_flavor.clone(),
            input_hashes: inputs.clone(),
            imported_hashes: imported_hashes.clone(),
            compiled_tags,
            authored_data,
            project_sha256,
        })?,
        false,
    )?;
    Ok(())
}
pub(crate) fn find(
    project: &Project,
    tools: &ForgeToolchain,
    jobs: &Path,
) -> Option<QuickForgeBuildReceipt> {
    // Shared semantic recipes retain their own reviewed preparation protocol.
    // Local imports are eligible only with fresh receipt and source hash checks.
    if project.quick_forge.as_ref()?.native.is_some() {
        return None;
    }
    let fingerprint = project.fingerprint().ok()?;
    for build in project
        .builds
        .iter()
        .rev()
        .take(32)
        .filter(|b| b.status == "validated" && b.project_fingerprint == fingerprint)
    {
        let attempt = (|| -> Result<QuickForgeBuildReceipt> {
            uuid::Uuid::parse_str(&build.id)
                .map_err(|_| crate::SparkError::Invalid("Invalid cached build identity".into()))?;
            let job = jobs.join(&build.id);
            reject_links(&job)?;
            let receipt: QuickForgeBuildReceipt = load(&job.join("quickforge-receipt.json"))?;
            if receipt.project_id != project.id
                || receipt.project_fingerprint != fingerprint
                || receipt.status != "validated"
                || receipt.job_id != build.id
            {
                return crate::invalid("Cached build belongs to another source revision");
            }
            let source = tools
                .hek_tags_directory
                .clone()
                .or_else(|| tools.hek_directory.as_ref().map(|p| p.join("tags")))
                .ok_or_else(|| crate::SparkError::Invalid("Missing source tags".into()))?;
            let contract: Contract = load(&job.join("reuse-contract.json"))?;
            reject_links(&source)?;
            if contract.schema_version != 3
                || contract.kit_flavor != tools.hek_flavor
                || fs::canonicalize(&source)? != fs::canonicalize(&contract.source_root)?
            {
                return crate::invalid("Native reuse source/kit identity changed");
            }
            let imported = crate::native_asset_imports::source_hashes(
                jobs.parent().ok_or_else(|| {
                    crate::SparkError::Invalid("Native jobs have no library owner".into())
                })?,
                project,
            )?;
            if contract.imported_hashes != imported {
                return crate::invalid("Imported native source changed since compilation");
            }
            let sources = receipt.sources.as_ref().ok_or_else(|| {
                crate::SparkError::Invalid("Missing cached native sources".into())
            })?;
            if fs::canonicalize(&sources.directory)? != fs::canonicalize(job.join("workspace"))? {
                return crate::invalid("Cached sources escaped their owned job");
            }
            let selected = crate::native_staging::inventory(
                &source,
                &std::sync::atomic::AtomicBool::new(false),
            )?;
            let document = project.quick_forge.as_ref().unwrap();
            let mut required = std::collections::BTreeSet::from([
                "haloTool",
                "invaderEdit",
                "invaderInfo",
                "invaderDependency",
            ]);
            if document.logic.is_some() {
                required.insert("invaderScript");
            }
            if document.runtime_id != crate::runtime::RuntimeId::MccSteam {
                required.insert("invaderBuild");
            }
            if receipt
                .tool_identities
                .keys()
                .map(String::as_str)
                .collect::<std::collections::BTreeSet<_>>()
                != required
            {
                return crate::invalid("Native reuse lacks the complete compiler identity set");
            }
            if !crate::forge_build::audit_material_bindings(
                document,
                selected
                    .files
                    .iter()
                    .map(|f| &f.path)
                    .chain(imported.keys()),
            )?
            .is_empty()
            {
                return crate::invalid("Material namespace changed since compilation");
            }
            for (relative, expected) in &contract.input_hashes {
                if maps::hash_file(&source.join(safe_relative(relative)?))? != *expected {
                    return crate::invalid("Native source changed since compilation");
                }
            }
            for (name, expected) in &receipt.tool_identities {
                let file = if name == "haloTool" {
                    tools
                        .hek_directory
                        .as_ref()
                        .map(|p| p.join(if cfg!(windows) { "tool.exe" } else { "tool" }))
                } else {
                    let tool = match name.as_str() {
                        "invaderEdit" => "invader-edit",
                        "invaderInfo" => "invader-info",
                        "invaderBuild" => "invader-build",
                        "invaderScript" => "invader-script",
                        "invaderDependency" => "invader-dependency",
                        _ => return crate::invalid("Unknown cached native tool"),
                    };
                    tools.invader_directory.as_ref().map(|p| {
                        p.join(format!("{tool}{}", if cfg!(windows) { ".exe" } else { "" }))
                    })
                }
                .ok_or_else(|| crate::SparkError::Invalid("Native tool unavailable".into()))?;
                reject_links(&file)?;
                if maps::hash_file(&file)? != *expected {
                    return crate::invalid("Native compiler/tool revision changed");
                }
            }
            if tool_transaction::inventory(&sources.directory.join("tags"))?
                != contract.compiled_tags
            {
                return crate::invalid("Accepted native tags changed since compilation");
            }
            if tool_transaction::inventory(&sources.directory.join("data"))?
                != contract.authored_data
                || maps::hash_file(&sources.directory.join("project.gsproject"))?
                    != contract.project_sha256
            {
                return crate::invalid("Editable native source data changed since compilation");
            }
            let output = build
                .output
                .as_ref()
                .ok_or_else(|| crate::SparkError::Invalid("Missing cached output".into()))?;
            reject_links(output)?;
            if fs::canonicalize(output.parent().unwrap())? != fs::canonicalize(job.join("output"))?
                || Some(maps::hash_file(output)?) != build.sha256
            {
                return crate::invalid("Accepted map output changed");
            }
            let cached = receipt.build.as_ref().ok_or_else(|| {
                crate::SparkError::Invalid("Missing cached native receipt".into())
            })?;
            if cached.id != build.id
                || cached.sha256 != build.sha256
                || cached.output != build.output
                || cached.project_fingerprint != fingerprint
            {
                return crate::invalid("Cached receipt disagrees with accepted project history");
            }
            Ok(receipt)
        })();
        if let Ok(mut receipt) = attempt {
            receipt.warnings.push("Reused this exact validated native build after fresh source, tool, compiled-tag and output hash checks; no new SDK copy or compiler run was needed.".into());
            return Some(receipt);
        }
    }
    None
}
