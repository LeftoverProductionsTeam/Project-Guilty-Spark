//! Hash-verified copies between registered projects. No installed game path is writable.
use crate::{
    assets, invalid,
    library::Library,
    maps,
    project::{self, Asset, Project},
    Result,
};
use sha2::{Digest, Sha256};
use std::{fs, io::Read};

pub fn copy_obj(
    lib: &Library,
    source_id: &str,
    asset_id: &str,
    target_id: &str,
) -> Result<(Project, Asset, assets::ObjImport)> {
    if source_id == target_id {
        return invalid("Choose a different source map");
    }
    uuid::Uuid::parse_str(asset_id)
        .map_err(|_| crate::SparkError::Invalid("Invalid asset identity".into()))?;
    let source = lib.get(source_id)?;
    let mut target = lib.get(target_id)?;
    let original = source
        .assets
        .iter()
        .find(|a| a.id == asset_id)
        .ok_or_else(|| {
            crate::SparkError::Invalid("Asset is not registered in the source map".into())
        })?;
    if original.kind != "obj" {
        return invalid("Only registered OBJ assets can be copied by this operation");
    }
    let path = lib
        .project_dir(source_id)?
        .join("assets")
        .join(format!("{asset_id}.obj"));
    crate::reject_links(&path)?;
    let mut bytes = Vec::new();
    fs::File::open(&path)?
        .take(64 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 64 * 1024 * 1024 {
        return invalid("Source OBJ exceeds 64 MiB");
    }
    let hash = format!("{:x}", Sha256::digest(&bytes));
    if hash != original.sha256 {
        return invalid("Source asset changed since import; transfer refused");
    }
    let imported = assets::parse_obj(
        std::str::from_utf8(&bytes)
            .map_err(|_| crate::SparkError::Invalid("OBJ must be UTF-8".into()))?,
    )?;
    let id = uuid::Uuid::new_v4().to_string();
    let dir = lib.project_dir(target_id)?.join("assets");
    crate::reject_links(&dir)?;
    fs::create_dir_all(&dir)?;
    let raw = dir.join(format!("{id}.obj"));
    project::atomic_write(&raw, &bytes, false)?;
    if maps::hash_file(&raw)? != hash {
        return invalid("Transferred asset failed SHA-256 readback");
    }
    project::atomic_write(
        &dir.join(format!("{id}.mesh.json")),
        &serde_json::to_vec(&imported.mesh)?,
        false,
    )?;
    let asset = Asset {
        id,
        name: original.name.clone(),
        kind: "obj".into(),
        sha256: hash,
        path: raw,
        vertices: imported.mesh.positions.len() / 3,
        triangles: imported.mesh.indices.len() / 3,
        has_uvs: imported.has_uvs,
        materials: imported.materials.clone(),
    };
    target.assets.push(asset.clone());
    target.modified_at = chrono::Utc::now().to_rfc3339();
    target.history.push(project::HistoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        description: format!(
            "Copied verified OBJ {} from project {}",
            asset.name, source_id
        ),
    });
    lib.save(&target, None)?;
    Ok((target, asset, imported))
}
