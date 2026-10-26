use crate::{
    invalid, maps,
    project::{self, Project, Source},
    Result,
};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    pub id: String,
    pub title: String,
    pub engine: String,
    pub version: Option<u32>,
    pub sha256: Option<String>,
    pub modified_at: String,
    pub creator: String,
    pub tag_count: usize,
    pub object_count: usize,
    pub status: String,
    pub project_path: PathBuf,
    pub scenario_type: Option<u16>,
}
pub struct Library {
    pub root: PathBuf,
    db: Connection,
}
impl Library {
    pub fn open(root: &Path) -> Result<Self> {
        crate::reject_links(root)?;
        fs::create_dir_all(root)?;
        let db = Connection::open(root.join("library.sqlite3"))?;
        db.pragma_update(None, "journal_mode", "WAL")?;
        db.execute_batch("CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, summary TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA user_version=1;")?;
        Ok(Self {
            root: root.into(),
            db,
        })
    }
    pub fn project_dir(&self, id: &str) -> Result<PathBuf> {
        uuid::Uuid::parse_str(id)
            .map_err(|_| crate::SparkError::Invalid("Invalid project UUID".into()))?;
        Ok(self.root.join("projects").join(id))
    }
    pub fn list(&self) -> Result<Vec<LibraryEntry>> {
        let mut s = self.db.prepare(
            "SELECT summary FROM projects ORDER BY json_extract(summary,'$.modifiedAt') DESC",
        )?;
        let rows = s.query_map([], |r| r.get::<_, String>(0))?;
        let mut out = vec![];
        for row in rows {
            out.push(serde_json::from_str(&row?)?);
        }
        Ok(out)
    }
    pub fn get(&self, id: &str) -> Result<Project> {
        let dir = self.project_dir(id)?;
        project::load_project(&dir.join("project.gsproject"))
    }
    pub fn setting<T: serde::de::DeserializeOwned + Default>(&self, key: &str) -> Result<T> {
        match self
            .db
            .query_row("SELECT value FROM settings WHERE key=?1", [key], |r| {
                r.get::<_, String>(0)
            }) {
            Ok(s) => Ok(serde_json::from_str(&s)?),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(T::default()),
            Err(e) => Err(e.into()),
        }
    }
    pub fn set_setting(&self, key: &str, value: &impl Serialize) -> Result<()> {
        self.db.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,serde_json::to_string(value)?])?;
        Ok(())
    }
    pub fn save(
        &self,
        project: &Project,
        inspection: Option<&maps::MapInspection>,
    ) -> Result<LibraryEntry> {
        project.validate()?;
        let dir = self.project_dir(&project.id)?;
        let file = dir.join("project.gsproject");
        if file.exists() {
            let existing = project::load_project(&file)?;
            if existing
                .source
                .as_ref()
                .map(|s| (&s.sha256, &s.preserved_path))
                != project
                    .source
                    .as_ref()
                    .map(|s| (&s.sha256, &s.preserved_path))
            {
                return invalid(
                    "Source identity is immutable; reimport the map to change its source",
                );
            }
        }
        if let Some(source) = &project.source {
            if source.preserved_path != dir.join("source.map") {
                return invalid("Source must be the managed preserved copy");
            }
        }
        let previous = self.list()?.into_iter().find(|e| e.id == project.id);
        let entry = LibraryEntry {
            id: project.id.clone(),
            title: project.title.clone(),
            engine: project
                .source
                .as_ref()
                .map(|s| s.engine.clone())
                .unwrap_or_else(|| if project.quick_forge.is_some() { "QuickForge".into() } else { "Asset workshop".into() }),
            version: project.source.as_ref().map(|s| s.cache_version),
            sha256: project.source.as_ref().map(|s| s.sha256.clone()),
            modified_at: project.modified_at.clone(),
            creator: project.provenance.creator.clone(),
            tag_count: inspection
                .map(|i| i.tags.len())
                .or(previous.as_ref().map(|p| p.tag_count))
                .unwrap_or(0),
            object_count: project.quick_forge.as_ref().map_or(project.scene.len(), |q| q.geometry.len() + q.placements.len() + q.spawns.len() + q.objectives.len()),
            status: project
                .builds
                .last()
                .map(|b| b.status.clone())
                .unwrap_or_else(|| {
                    if project.source.is_some() {
                        "inspected".into()
                    } else {
                        "workspace".into()
                    }
                }),
            project_path: file.clone(),
            scenario_type: inspection
                .map(|i| i.header.scenario_type)
                .or(previous.and_then(|p| p.scenario_type)),
        };
        project::save_project(&file, project)?;
        self.db.execute("INSERT INTO projects(id,summary) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET summary=excluded.summary",params![project.id,serde_json::to_string(&entry)?])?;
        Ok(entry)
    }
    pub fn create(&self, title: &str) -> Result<Project> {
        let p = Project::new(title);
        self.save(&p, None)?;
        Ok(p)
    }
    pub fn import_map(
        &self,
        path: &Path,
        resources: Option<&Path>,
    ) -> Result<(Project, maps::MapInspection)> {
        let inspection = maps::inspect_map(path, resources)?;
        if let Some(entry) = self
            .list()?
            .into_iter()
            .find(|e| e.sha256.as_deref() == Some(&inspection.sha256))
        {
            let project = self.get(&entry.id)?;
            let source = project.source.as_ref().ok_or_else(|| {
                crate::SparkError::Invalid("Indexed map has no preserved source".into())
            })?;
            let mut inspection = maps::inspect_map(
                &source.preserved_path,
                source.resource_directory.as_deref().or(resources),
            )?;
            inspection.header.extended |= source
                .original_path
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("yelo"));
            if inspection.sha256 != source.sha256 {
                return invalid("Preserved source checksum changed");
            }
            return Ok((project, inspection));
        }
        let mut p = Project::new(&inspection.header.name.replace('_', " "));
        let dir = self.project_dir(&p.id)?;
        crate::reject_links(&dir)?;
        fs::create_dir_all(&dir)?;
        let copy = dir.join("source.map");
        let mut input = fs::File::open(path)?;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&copy)?;
        // Bound a concurrently growing source as well as the parser's initial snapshot.
        use std::io::Read;
        std::io::copy(&mut input.by_ref().take(768 * 1024 * 1024 + 1), &mut output)?;
        output.sync_all()?;
        drop(output);
        if maps::hash_file(&copy)? != inspection.sha256 {
            return invalid(
                "Source changed while being imported; retry after the copy is complete",
            );
        }
        let mut permissions = fs::metadata(&copy)?.permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&copy, permissions)?;
        p.source = Some(Source {
            original_path: fs::canonicalize(path)?,
            preserved_path: copy,
            sha256: inspection.sha256.clone(),
            cache_version: inspection.header.version,
            engine: inspection.header.engine.clone(),
            scenario_path: inspection.scenario_path.clone(),
            archive: None,
            resource_directory: resources.or(path.parent()).map(Path::to_path_buf),
            resource_sha256: resources
                .or(path.parent())
                .map(project::resource_hashes)
                .transpose()?
                .unwrap_or_default(),
        });
        p.scene = inspection.objects.clone();
        self.save(&p, Some(&inspection))?;
        Ok((p, inspection))
    }
    pub fn import_project(&self, path: &Path) -> Result<Project> {
        let incoming = project::load_project(path)?;
        let mut p = if let Some(src) = &incoming.source {
            if maps::hash_file(&src.original_path)? != src.sha256 {
                return invalid("The project source file is missing or changed; restore the original file before opening this project");
            }
            if let Some(directory) = &src.resource_directory {
                let actual = project::resource_hashes(directory)?;
                if src
                    .resource_sha256
                    .iter()
                    .any(|(name, hash)| actual.get(name) != Some(hash))
                {
                    return invalid("Project resources changed; restore them or select resources in the original project before exporting");
                }
            }
            self.import_map(&src.original_path, src.resource_directory.as_deref())?
                .0
        } else {
            self.create(&incoming.title)?
        };
        p.title = incoming.title;
        p.provenance = incoming.provenance;
        p.scene = incoming.scene;
        p.tag_edits = incoming.tag_edits;
        p.quick_forge = incoming.quick_forge;
        p.firefight = incoming.firefight;
        p.history = incoming.history;
        // Re-ingest referenced OBJ files with integrity checks; never trust a descriptor's compiled mesh or receipt paths.
        p.assets.clear();
        let dir = self.project_dir(&p.id)?.join("assets");
        for asset in incoming.assets {
            if asset.kind != "obj" || fs::metadata(&asset.path)?.len() > 64 * 1024 * 1024 {
                return invalid("Referenced asset is not a supported OBJ or exceeds 64 MiB");
            }
            if maps::hash_file(&asset.path)? != asset.sha256 {
                return invalid(format!("Referenced asset checksum changed: {}", asset.name));
            }
            let parsed = crate::assets::parse_obj(&fs::read_to_string(&asset.path)?)?;
            fs::create_dir_all(&dir)?;
            crate::reject_links(&dir)?;
            let new_id = uuid::Uuid::new_v4().to_string();
            let raw = dir.join(format!("{new_id}.obj"));
            fs::copy(&asset.path, &raw)?;
            project::atomic_write(
                &dir.join(format!("{new_id}.mesh.json")),
                &serde_json::to_vec(&parsed.mesh)?,
                false,
            )?;
            for object in &mut p.scene {
                if object.asset_id.as_deref() == Some(&asset.id) {
                    object.asset_id = Some(new_id.clone());
                }
            }
            p.assets.push(project::Asset {
                id: new_id,
                name: asset.name,
                kind: "obj".into(),
                sha256: asset.sha256,
                path: raw,
                vertices: parsed.mesh.positions.len() / 3,
                triangles: parsed.mesh.indices.len() / 3,
                has_uvs: parsed.has_uvs,
                materials: parsed.materials,
            });
        }
        if p.scene.iter().any(|o| {
            o.asset_id
                .as_ref()
                .is_some_and(|id| !p.assets.iter().any(|a| &a.id == id))
        }) {
            return invalid("A scene mesh is missing its asset metadata");
        }
        self.save(&p, None)?;
        Ok(p)
    }
}
