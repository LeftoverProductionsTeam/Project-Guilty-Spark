//! Compiler inputs are bound to the preserved map, independently of the
//! hosting runtime and the viewer's compatible-pixel search. Nothing is copied.
use crate::{
    invalid,
    maps::{self, MapInspection},
    project::Source,
    reject_links, Result, SparkError,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs::File,
    io::Read,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Binding {
    pub directory: PathBuf,
    pub hashes: BTreeMap<String, String>,
    pub source_sha256: String,
    pub source_version: u32,
}

pub fn review(source: &Source, inspection: &MapInspection, directory: &Path) -> Result<Binding> {
    crate::source_identity::validate(source, inspection)?;
    reject_links(directory)?;
    if ![6, 7, 609].contains(&inspection.header.version) || inspection.header.extended {
        return invalid(
            "Classic resource-map admission is separate from Xbox and MCC native resources",
        );
    }
    if inspection
        .diagnostics
        .iter()
        .any(|d| d.code == "RESOURCE_LAYOUT_UNVERIFIED")
    {
        return invalid("The source contains unreadable native bitmap/sound dependency descriptors. Repair or recover the source before extraction.");
    }
    let mut hashes = BTreeMap::new();
    for resource in inspection.resources.iter().filter(|r| r.required) {
        let kind = match resource.name.as_str() {
            "bitmaps.map" => 1u32,
            "sounds.map" => 2,
            "loc.map" => 3,
            _ => return invalid("Unknown native resource dependency"),
        };
        let path = directory.join(&resource.name);
        reject_links(&path)?;
        if !path.is_file() {
            return invalid(format!("{} (source cache v{}) requires its original {}. {} does not contain it. Choose the original source resources or a reviewed native-source recovery profile; changing the output/hosting runtime cannot supply missing custom assets.",inspection.header.name,inspection.header.version,resource.name,directory.display()));
        }
        let mut file = File::open(&path)?;
        let mut header = [0u8; 16];
        file.read_exact(&mut header)?;
        if u32::from_le_bytes(header[..4].try_into().unwrap()) != kind {
            return invalid(format!("{} has the wrong native resource kind; viewer packs and other editions cannot authorize extraction",resource.name));
        }
        let hash = maps::hash_file(&path)?;
        if let Some(expected) = source.resource_sha256.get(&resource.name) {
            if expected != &hash {
                return invalid(format!("{} differs from this preserved source's recorded identity. Source resources were not substituted.",resource.name));
            }
        } else if resource.name != "bitmaps.map" {
            // Sound/localization formats do not contain a universal edition ID. A
            // filename or registration alone is insufficient to select them remotely.
            return invalid(format!("{} has no recorded source identity. Connect the source's original resource folder to record its hash before native extraction.",resource.name));
        }
        if resource.name == "bitmaps.map" {
            let coverage = crate::bitmap_preview::verify_resource_for_source(
                &source.preserved_path,
                &source.sha256,
                inspection,
                &path,
                &hash,
            )?;
            if coverage.verified_images == 0
                || coverage.missing_or_mismatched_images != 0
                || coverage.unsupported_images != 0
                || coverage.shared_native_images != 0
            {
                return invalid("This bitmap candidate cannot prove every external image by the source's exact native path, generation and span. Compatible viewer pixels/aliases are not compiler resources.");
            }
        }
        hashes.insert(resource.name.clone(), hash);
    }
    Ok(Binding {
        directory: directory.to_owned(),
        hashes,
        source_sha256: source.sha256.clone(),
        source_version: source.cache_version,
    })
}

pub fn resolve(
    source: &Source,
    inspection: &MapInspection,
    candidates: impl IntoIterator<Item = PathBuf>,
) -> Result<Binding> {
    let mut seen = std::collections::BTreeSet::new();
    let mut reasons = vec![];
    for directory in candidates.into_iter().take(48) {
        if !directory.is_dir() || reject_links(&directory).is_err() {
            continue;
        }
        let Ok(real) = std::fs::canonicalize(&directory) else {
            continue;
        };
        if !seen.insert(real) {
            continue;
        }
        match review(source, inspection, &directory) {
            Ok(binding) => return Ok(binding),
            Err(error) => {
                if reasons.len() < 3 {
                    reasons.push(error.to_string());
                }
            }
        }
    }
    Err(SparkError::Invalid(format!(
        "No complete compiler resource set was verified for source cache v{}. {}",
        inspection.header.version,
        reasons.join("\n")
    )))
}
