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

pub fn validate_local_input_path(path:&Path)->Result<()> {
    let text=path.to_string_lossy();
    let normalized=text.replace('/',"\\");
    let bytes=normalized.as_bytes();
    let local_verbatim=normalized.starts_with("\\\\?\\") && bytes.len()>=7 && bytes[4].is_ascii_alphabetic() && bytes[5]==b':' && bytes[6]==b'\\';
    let device_component=normalized.split('\\').any(|part| {
        let part=part.trim_end_matches(['.',' ']);let stem=part.split('.').next().unwrap_or("").to_ascii_uppercase();
        ["CON","PRN","AUX","NUL","COM1","COM2","COM3","COM4","COM5","COM6","COM7","COM8","COM9","LPT1","LPT2","LPT3","LPT4","LPT5","LPT6","LPT7","LPT8","LPT9"].contains(&stem.as_str()) || (part.contains(':')&&!(part.len()==2&&part.as_bytes()[0].is_ascii_alphabetic()&&part.as_bytes()[1]==b':'))
    });
    if !path.is_absolute() || text.len()>32767 || device_component || text.contains("://") ||
        (normalized.starts_with("\\\\")&&!local_verbatim) ||
        normalized.starts_with("\\??\\") || normalized.to_ascii_lowercase().starts_with("\\device\\") {
        return invalid("Project descriptor references a network, device or relative location. No referenced input was opened. Rebind the source, resources and assets to reviewed local absolute paths, then import again");
    }
    #[cfg(windows)]
    {
        #[link(name="kernel32")] unsafe extern "system" {fn GetDriveTypeW(root:*const u16)->u32;}
        let drive=if local_verbatim {bytes[4]}else{bytes[0]};
        let root=[drive as u16,b':' as u16,b'\\' as u16,0];
        if unsafe{GetDriveTypeW(root.as_ptr())}==4 {return invalid("Project descriptor references a mapped network drive. Rebind inputs to reviewed local files before importing");}
    }
    Ok(())
}

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
            crate::reject_links(&source.preserved_path)?;crate::reject_links(&dir.join("source.map"))?;
            if fs::canonicalize(&source.preserved_path)? != fs::canonicalize(dir.join("source.map"))? {
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
        self.import_map_internal(path,resources,true)
    }
    fn import_map_internal(&self,path:&Path,resources:Option<&Path>,reuse:bool)->Result<(Project,maps::MapInspection)> {
        // Persist the location now, so later app working directories cannot
        // reinterpret a relative map/resource selection. Missing resources are
        // still allowed; their absolute location remains explicit.
        let resource_directory=std::path::absolute(resources.or(path.parent()).filter(|p|!p.as_os_str().is_empty()).unwrap_or(Path::new(".")))?;
        let resource_directory=if resource_directory.is_dir(){fs::canonicalize(resource_directory)?}else{resource_directory};
        let inspection = maps::inspect_map(path, Some(&resource_directory))?;
        if let Some(entry) = self
            .list()?
            .into_iter()
            .find(|e| reuse && e.sha256.as_deref() == Some(&inspection.sha256))
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
            resource_directory: Some(resource_directory.clone()),
            audio_resources: None,
            resource_sha256: project::resource_hashes(&resource_directory)?,
        });
        p.scene = inspection.objects.clone();
        self.save(&p, Some(&inspection))?;
        Ok((p, inspection))
    }
    pub fn import_project(&self, path: &Path) -> Result<Project> {
        let incoming = project::load_project(path)?;
        // A descriptor is data, not approval to contact a file server/device.
        // Admit every referenced input before metadata/hash/open can touch one.
        let mut references = incoming.assets.iter().map(|a|a.path.as_path()).collect::<Vec<_>>();
        if let Some(source)=&incoming.source {
            references.push(&source.original_path);
            if let Some(directory)=&source.resource_directory {references.push(directory);}
            if let Some(audio)=&source.audio_resources {references.push(&audio.directory);}
        }
        for reference in &references {validate_local_input_path(reference)?;}
        for reference in references {crate::reject_links(reference)?;}
        let transaction=self.db.unchecked_transaction()?;
        let result=self.import_project_admitted(incoming);
        if result.is_ok(){transaction.commit()?;}
        result
    }
    fn import_project_admitted(&self,incoming:Project)->Result<Project> {
        let mut p = if let Some(src) = &incoming.source {
            if maps::hash_file(&src.original_path)? != src.sha256 {
                return invalid("The project source file is missing or changed; restore the original file before opening this project");
            }
            if let Some(directory) = &src.resource_directory {
                let actual = if src.cache_version==13&&src.resource_sha256.contains_key("mcc-textures") {
                    let header=maps::inspect_header(&src.original_path)?;crate::mcc_textures::pin(directory,&header.name)?
                }else{project::resource_hashes(directory)?};
                if src
                    .resource_sha256
                    .iter()
                    .any(|(name, hash)| actual.get(name) != Some(hash))
                {
                    return invalid("Project resources changed; restore them or select resources in the original project before exporting");
                }
            }
            let mut imported=self.import_map_internal(&src.original_path, src.resource_directory.as_deref(),false)?.0;
            if let Some(source)=imported.source.as_mut(){source.resource_sha256=src.resource_sha256.clone();source.resource_directory=src.resource_directory.clone();source.audio_resources=src.audio_resources.clone();}imported
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
        p.audio_preview = incoming.audio_preview;
        p.studio=incoming.studio;
        p.world_environment=incoming.world_environment;
        p.render_features=incoming.render_features;
        p.powerups=incoming.powerups;
        p.gameplay_controls=incoming.gameplay_controls;
        p.conversion_profile=incoming.conversion_profile;
        for object in &mut p.scene {if let Some(reference)=&mut object.source_model {if reference.project_id==incoming.id&&p.source.as_ref().is_some_and(|source|source.sha256==reference.source_sha256){reference.project_id=p.id.clone();}}}
        if let Some(scene)=&mut p.audio_preview {for emitter in &mut scene.emitters {if emitter.custom_sound.is_some()&&emitter.source_project_id.as_deref()==Some(incoming.id.as_str()){emitter.source_project_id=Some(p.id.clone());}}}
        // Re-ingest referenced OBJ files with integrity checks; never trust a descriptor's compiled mesh or receipt paths.
        p.assets.clear();
        let dir = self.project_dir(&p.id)?.join("assets");
        for asset in incoming.assets {
            if asset.kind=="custom-sound" {
                let bytes=crate::custom_sounds::read(&asset.path)?;
                let extension=asset.path.extension().and_then(|value|value.to_str()).unwrap_or("").to_ascii_lowercase();
                crate::custom_sounds::inspect(&bytes,&extension)?;
                use sha2::{Digest,Sha256};
                if crate::hex_bytes(Sha256::digest(&bytes))!=asset.sha256{return invalid("Referenced custom sound checksum changed");}
                crate::reject_links(&dir)?;fs::create_dir_all(&dir)?;
                let new_id=uuid::Uuid::new_v4().to_string();let raw=dir.join(format!("{new_id}.{extension}"));project::atomic_write(&raw,&bytes,false)?;
                if let Some(scene)=&mut p.audio_preview {for emitter in &mut scene.emitters {if emitter.source_project_id.as_deref()==Some(p.id.as_str()){if let Some(sound)=&mut emitter.custom_sound {if sound.asset_id==asset.id {sound.asset_id=new_id.clone();}}}}}
                p.assets.push(project::Asset{id:new_id,name:asset.name,kind:asset.kind,sha256:asset.sha256,path:raw,vertices:0,triangles:0,has_uvs:false,materials:vec![]});continue;
            }
            if asset.kind != "obj" || fs::metadata(&asset.path)?.len() > 64 * 1024 * 1024 {
                return invalid("Referenced asset is not a supported OBJ or exceeds 64 MiB");
            }
            let mut bytes=Vec::new();
            std::io::Read::read_to_end(&mut std::io::Read::take(fs::File::open(&asset.path)?,64*1024*1024+1),&mut bytes)?;
            use sha2::{Digest,Sha256};
            if bytes.len()>64*1024*1024 || crate::hex_bytes(Sha256::digest(&bytes))!=asset.sha256 {
                return invalid(format!("Referenced asset checksum changed or exceeds 64 MiB: {}",asset.name));
            }
            let parsed=crate::assets::parse_obj(std::str::from_utf8(&bytes).map_err(|_|crate::SparkError::Invalid("Referenced OBJ must be UTF-8".into()))?)?;
            fs::create_dir_all(&dir)?;
            crate::reject_links(&dir)?;
            let new_id = uuid::Uuid::new_v4().to_string();
            let raw = dir.join(format!("{new_id}.obj"));
            project::atomic_write(&raw,&bytes,false)?;
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
