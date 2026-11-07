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
    #[serde(default,skip_serializing_if="std::ops::Not::not")]
    pub session_only: bool,
}
pub struct Library {
    pub root: PathBuf,
    db: Connection,
    session_only: bool,
    /// The production workbench keeps editable documents in the existing RAM
    /// backend. The outer connection retains settings and explicitly saved
    /// projects; it is never used as an implicit autosave destination.
    session: Option<Box<Library>>,
}
impl Library {
    pub fn open(root: &Path) -> Result<Self> {
        crate::reject_links(root)?;
        crate::storage::reject_obsolete_repository_output(root)?;
        fs::create_dir_all(root)?;
        let db = Connection::open(root.join("library.sqlite3"))?;
        db.pragma_update(None, "journal_mode", "WAL")?;
        db.execute_batch("CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, summary TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA user_version=1;")?;
        Self::prepare_previews(&db)?;
        Ok(Self {
            root: root.into(),
            db,
            session_only: false,
            session: None,
        })
    }
    /// Opt-in session backend. Not the application default until explicit-save
    /// and shared Undo acceptance pass. Existing persistent libraries are never
    /// migrated or removed by opening this independent memory connection.
    pub fn memory(root:&Path)->Result<Self>{
        crate::reject_links(root)?;
        let db=Connection::open_in_memory()?;
        db.execute_batch("CREATE TABLE projects(id TEXT PRIMARY KEY, summary TEXT NOT NULL); CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE documents(id TEXT PRIMARY KEY,value TEXT NOT NULL);")?;
        Self::prepare_previews(&db)?;
        Ok(Self{root:root.into(),db,session_only:true,session:None})
    }
    pub fn is_session_only(&self)->bool{self.session_only}
    pub fn workspace(root:&Path)->Result<Self>{
        let mut library=Self::open(root)?;
        library.session=Some(Box::new(Self::memory(root)?));
        library.recover_interrupted_saves()?;
        Ok(library)
    }
    /// Reindex only a complete, hash-bound explicit Save left by an interrupted
    /// SQLite commit. Legacy/unknown/partial imports remain untouched.
    fn recover_interrupted_saves(&self)->Result<()> {
        let root=self.root.join("projects");crate::reject_links(&root)?;
        let entries=match fs::read_dir(&root){Ok(entries)=>entries,Err(e) if e.kind()==std::io::ErrorKind::NotFound=>return Ok(()),Err(e)=>return Err(e.into())};
        let mut scanned=0usize;let mut bytes=0u64;
        for entry in entries {
            let entry=entry?;scanned+=1;
            if scanned>4096{return invalid("Project discovery exceeds 4096 directories; saved content retained for manual review");}
            let path=entry.path();let id=entry.file_name().to_string_lossy().into_owned();
            if uuid::Uuid::parse_str(&id).is_err()||self.is_saved(&id)?||crate::reject_links(&path).is_err(){continue;}
            let file=path.join("project.gsproject");let head=path.join("window-history/head.json");
            if !file.is_file()||!head.is_file(){continue;}
            bytes=bytes.saturating_add(fs::metadata(&file)?.len());
            if bytes>128*1024*1024{return invalid("Interrupted Save discovery exceeds its 128 MiB metadata budget; content retained");}
            let Ok(project)=project::load_project(&file) else{continue};
            if project.id!=id||!matches!(crate::workspace_history::recoverable_save(&path.join("window-history"),&project),Ok(true)){continue;}
            let Ok(_owner)=crate::storage::lock(&path.join("save.lock")) else{continue};
            // Reload under the existing Save lock: another completing first
            // Save may have changed the descriptor while discovery waited.
            let expected=project::FileRevision::capture(&file)?;
            let project=project::load_project(&file)?;expected.verify(&file)?;
            if project.id!=id||!crate::workspace_history::recoverable_save(&path.join("window-history"),&project)?{continue;}
            // Same descriptor bytes; retain that identity across an index wait.
            // No map, dependency tree or historical archive is copied.
            self.save_internal_checked(&project,None,false,Some(&expected))?;
        }
        Ok(())
    }
    pub fn is_memory_first(&self)->bool{self.session_only||self.session.is_some()}
    pub fn is_saved(&self,id:&str)->Result<bool>{
        if self.session_only{return Ok(false);}
        Ok(self.db.query_row("SELECT EXISTS(SELECT 1 FROM projects WHERE id=?1)",[id],|r|r.get(0))?)
    }
    pub fn saved_project(&self,id:&str)->Result<Project>{
        if !self.is_saved(id)?{return invalid("This document has not been explicitly saved");}
        project::load_project(&self.project_dir(id)?.join("project.gsproject"))
    }
    /// Drop only an editable RAM document. An explicitly saved descriptor,
    /// previous-good recovery and all source assets remain untouched.
    pub fn discard_session(&self,id:&str)->Result<()> {
        uuid::Uuid::parse_str(id).map_err(|_|crate::SparkError::Invalid("Invalid project UUID".into()))?;
        if let Some(session)=&self.session{return session.discard_session(id);}
        if self.session_only{
            let transaction=self.db.unchecked_transaction()?;
            self.db.execute("DELETE FROM documents WHERE id=?1",[id])?;
            self.db.execute("DELETE FROM projects WHERE id=?1",[id])?;
            for key in [format!("savedBaseline.{id}"),format!("mapResourceOrigins.{id}")]{
                self.db.execute("DELETE FROM settings WHERE key=?1",[key])?;
            }
            transaction.commit()?;
        }
        Ok(())
    }
    fn prepare_previews(db:&Connection)->Result<()> {
        // One connection, no preview database or map copies. SQLite TEMP data
        // stays in RAM and disappears when this library session ends.
        db.pragma_update(None,"temp_store","MEMORY")?;
        db.execute_batch("CREATE TEMP TABLE preview_documents(id TEXT PRIMARY KEY,value TEXT NOT NULL);")?;
        Ok(())
    }
    fn preview(&self,id:&str)->Result<Option<Project>> {
        match self.db.query_row("SELECT value FROM preview_documents WHERE id=?1",[id],|row|row.get::<_,String>(0)) {
            Ok(text)=>Ok(Some(serde_json::from_str(&text)?)),
            Err(rusqlite::Error::QueryReturnedNoRows)=>Ok(None),
            Err(reason)=>Err(reason.into()),
        }
    }
    pub fn is_preview(&self,id:&str)->Result<bool>{Ok(self.preview(id)?.is_some())}
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
        let mut out:Vec<LibraryEntry> = vec![];
        for row in rows {
            out.push(serde_json::from_str(&row?)?);
        }
        if let Some(session)=&self.session{
            for mut entry in session.list()?{entry.session_only=!self.is_saved(&entry.id)?;out.retain(|saved|saved.id!=entry.id);out.push(entry);}
            out.sort_by(|a,b|b.modified_at.cmp(&a.modified_at));
        }
        Ok(out)
    }
    pub fn get(&self, id: &str) -> Result<Project> {
        if let Some(preview)=self.preview(id)?{return Ok(preview);}
        if let Some(session)=&self.session{
            let exists:bool=session.db.query_row("SELECT EXISTS(SELECT 1 FROM documents WHERE id=?1)",[id],|r|r.get(0))?;
            if exists{return session.get(id);}
        }
        if self.session_only{
            let text:String=self.db.query_row("SELECT value FROM documents WHERE id=?1",[id],|row|row.get(0))?;
            return Ok(serde_json::from_str(&text)?);
        }
        let dir = self.project_dir(id)?;
        let file=dir.join("project.gsproject");
        let mut project=project::load_project(&file)?;
        if let Some(session)=&self.session{
            // Compiler completion owns metadata, not an implicit authored Save.
            // Its existing persistent receipt can restore the current build on
            // reopen without rewriting source or scanning historical job trees.
            if project.quick_forge.is_some() {
                // The native build receipt is optional recovery metadata. A
                // damaged record stays intact and is reported by the build UI;
                // it must not make the independent editable source inaccessible.
                let receipt=match self.quickforge_receipt(id) {
                    Ok(receipt)=>receipt,
                    Err(crate::SparkError::Invalid(_))=>None,
                    Err(error)=>return Err(error),
                };
                if let Some(receipt)=receipt {
                    if receipt.schema_version==1&&receipt.project_id==project.id&&receipt.status=="validated"&&receipt.project_fingerprint==project.fingerprint()? {
                        if let Some(build)=receipt.build {
                            if build.status=="validated"&&build.id==receipt.job_id&&build.project_fingerprint==receipt.project_fingerprint&&!project.builds.iter().any(|old|old.id==build.id) {project.builds.push(build);}
                        }
                    }
                }
            }
            // Actual native operations still validate the owned job/output,
            // source fingerprint and byte hashes through verified_build.
            session.save(&project,None)?;
            session.set_setting(&format!("savedBaseline.{id}"),&project::FileRevision::capture(&file)?)?;
        }
        Ok(project)
    }
    /// Read only bounded optional native build metadata. Retain malformed bytes
    /// for review; callers may still open source and separately show this error.
    pub fn quickforge_receipt(&self,id:&str)->Result<Option<crate::forge_build::QuickForgeBuildReceipt>> {
        self.project_dir(id)?;
        let encoded=match self.db.query_row("SELECT CASE WHEN length(CAST(value AS BLOB))<=4194304 THEN value ELSE NULL END FROM settings WHERE key=?1",[format!("quickforge.receipt.{id}")],|row|row.get::<_,Option<String>>(0)) {
            Ok(Some(value))=>value,
            Ok(None)=>return invalid("Saved native build metadata exceeds 4 MiB. Your editable source is intact; rebuild to replace the damaged receipt."),
            Err(rusqlite::Error::QueryReturnedNoRows)=>return Ok(None),
            Err(error)=>return Err(error.into()),
        };
        serde_json::from_str(&encoded).map_err(|_|crate::SparkError::Invalid("Saved native build metadata is damaged. Your editable source and Undo are intact; rebuild to replace the receipt.".into()))
    }
    pub fn setting<T: serde::de::DeserializeOwned + Default>(&self, key: &str) -> Result<T> {
        if let Some(session)=&self.session{
            if key.starts_with("mapResourceOrigins."){return session.setting(key);}
        }
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
        if let Some(session)=&self.session{
            if key.starts_with("mapResourceOrigins."){return session.set_setting(key,value);}
        }
        self.db.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,serde_json::to_string(value)?])?;
        Ok(())
    }
    /// Cleanup must also preserve paths selected as SDKs, tools, resources or
    /// runtime content. Stream existing settings, including future keys.
    pub fn settings_reference_path(&self, path: &Path) -> Result<bool> {
        if let Some(session)=&self.session{
            for entry in session.list()?{
                let p=session.get(&entry.id)?;
                if crate::storage::document_references_path(&serde_json::to_value(p)?,path){return Ok(true);}
            }
        }
        let mut statement = self.db.prepare("SELECT length(CAST(value AS BLOB)), value FROM settings UNION ALL SELECT length(CAST(value AS BLOB)), value FROM preview_documents")?;
        let mut rows = statement.query([])?;
        let mut bytes = 0u64;
        let mut count = 0usize;
        while let Some(row) = rows.next()? {
            bytes = bytes.saturating_add(row.get::<_, i64>(0)?.max(0) as u64);
            count += 1;
            if bytes > 16 * 1024 * 1024 || count > 4096 {
                return invalid("Saved settings and active source previews exceed cleanup's reference-review budget; no files were removed");
            }
            let value: serde_json::Value = serde_json::from_str(&row.get::<_, String>(1)?)?;
            if crate::storage::document_references_path(&value, path) { return Ok(true); }
        }
        Ok(false)
    }
    pub fn save(
        &self,
        project: &Project,
        inspection: Option<&maps::MapInspection>,
    ) -> Result<LibraryEntry> {
        if !self.is_preview(&project.id)? {
            if let Some(session)=&self.session{let mut entry=session.save(project,inspection)?;entry.session_only=!self.is_saved(&project.id)?;return Ok(entry);}
        }
        self.save_internal(project,inspection,self.is_preview(&project.id)?)
    }
    /// Only the explicit Save command adopts a workbench document on disk.
    /// Source maps remain referenced in place and must still match their hash.
    pub fn save_with_history(&self,history:&mut crate::workspace_history::Session,project:&Project)->Result<LibraryEntry>{
        self.validate_explicit_save(project)?;
        let dir=self.project_dir(&project.id)?;fs::create_dir_all(&dir)?;
        let _save_owner=crate::storage::lock(&dir.join("save.lock"))?;
        self.validate_explicit_save(project)?;
        history.save_with(&dir.join("window-history"),project,||self.save_explicit_unlocked(project,None))
    }
    pub fn save_explicit(&self,project:&Project,inspection:Option<&maps::MapInspection>)->Result<LibraryEntry>{
        self.validate_explicit_save(project)?;
        let dir=self.project_dir(&project.id)?;fs::create_dir_all(&dir)?;
        let _save_owner=crate::storage::lock(&dir.join("save.lock"))?;
        self.save_explicit_unlocked(project,inspection)
    }
    fn validate_explicit_save(&self,project:&Project)->Result<project::FileRevision> {
        if self.is_preview(&project.id)?{return invalid("Open the source map before saving a background preview");}
        // Referenced OBJ/audio inputs are re-admitted before publishing a
        // descriptor. A changed external asset cannot become a valid Save.
        let _checked_assets=prepare_project_assets(project)?;
        if let Some(source)=&project.source{
            validate_local_input_path(&source.preserved_path)?;crate::reject_links(&source.preserved_path)?;
            if maps::hash_file(&source.preserved_path)?!=source.sha256{return invalid("The source map changed outside Spark; re-open and review it before saving. No descriptor was replaced");}
        }
        if self.session_only{return invalid("This standalone memory library has no persistent Save destination");}
        let file=self.project_dir(&project.id)?.join("project.gsproject");
        let actual=project::FileRevision::capture(&file)?;
        if let Some(session)=&self.session{
            let expected:Option<project::FileRevision>=session.setting(&format!("savedBaseline.{}",project.id))?;
            match (expected,actual.sha256.is_some()){
                (Some(expected),true) if expected==actual=>{},
                (None,false)=>{},
                _=>return invalid("The saved project changed outside this session. Review the external revision before saving; the existing file was retained"),
            }
        }
        Ok(actual)
    }
    fn save_explicit_unlocked(&self,project:&Project,inspection:Option<&maps::MapInspection>)->Result<LibraryEntry>{
        let expected=self.validate_explicit_save(project)?;
        let entry=self.save_internal_checked(project,inspection,false,Some(&expected))?;
        if let Some(session)=&self.session{
            session.save(project,inspection)?;
            session.set_setting(&format!("savedBaseline.{}",project.id),&project::FileRevision::capture(&self.project_dir(&project.id)?.join("project.gsproject"))?)?;
        }
        Ok(entry)
    }
    fn save_internal(&self,project:&Project,inspection:Option<&maps::MapInspection>,preview:bool)->Result<LibraryEntry> {
        self.save_internal_checked(project,inspection,preview,None)
    }
    fn save_internal_checked(&self,project:&Project,inspection:Option<&maps::MapInspection>,preview:bool,expected:Option<&project::FileRevision>)->Result<LibraryEntry> {
        project.validate()?;
        let dir = self.project_dir(&project.id)?;
        let file = dir.join("project.gsproject");
        let previous = self.list()?.into_iter().find(|e| e.id == project.id);
        if if preview{self.is_preview(&project.id)?}else if self.session_only{previous.is_some()}else{file.exists()} {
            let existing = self.get(&project.id)?;
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
        if let Some(source) = &project.source { if !self.session_only && self.session.is_none() && !preview {
            crate::reject_links(&source.preserved_path)?;crate::reject_links(&dir.join("source.map"))?;
            if fs::canonicalize(&source.preserved_path)? != fs::canonicalize(dir.join("source.map"))? {
                return invalid("Source must be the managed preserved copy");
            }
        } }
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
            session_only: self.session_only,
        };
        if preview {
            let text=serde_json::to_string(project)?;
            let(count,total):(i64,i64)=self.db.query_row("SELECT COUNT(*),COALESCE(SUM(length(CAST(value AS BLOB))),0) FROM preview_documents WHERE id<>?1",[&project.id],|row|Ok((row.get(0)?,row.get(1)?)))?;
            if count>=32 || total.saturating_add(text.len() as i64)>128*1024*1024{return invalid("Background source previews reached their 32-map/128 MiB budget. Existing previews and edits were retained; no map was copied");}
            self.db.execute("INSERT INTO preview_documents(id,value) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET value=excluded.value",params![project.id,text])?;
            return Ok(entry);
        }else if self.session_only{
            let text=serde_json::to_string(project)?;
            let total:i64=self.db.query_row("SELECT COALESCE(SUM(length(CAST(value AS BLOB))),0) FROM documents WHERE id<>?1",[&project.id],|r|r.get(0))?;
            if total.saturating_add(text.len() as i64)>128*1024*1024{return invalid("Open document data reached the 128 MiB memory budget; save and close an unused map. No existing edits were discarded");}
            self.db.execute("INSERT INTO documents(id,value) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET value=excluded.value",params![project.id,text])?;
        }else{
            // Check index publication before changing the descriptor. If an
            // OS/SQLite commit fails afterwards, the bound journal permits
            // deterministic first-Save reindexing on the next open.
            let transaction=if self.db.is_autocommit(){Some(self.db.unchecked_transaction()?)}else{None};
            self.db.execute("INSERT INTO projects(id,summary) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET summary=excluded.summary",params![project.id,serde_json::to_string(&entry)?])?;
            // The index can wait on another writer. Keep the pre-wait source
            // revision through publication rather than adopting changed bytes.
            if let Some(expected)=expected{project::save_managed_project_checked(&file,project,expected)?;}
            else{project::save_managed_project(&file,project)?;}
            if let Some(transaction)=transaction{transaction.commit()?;}return Ok(entry);
        }
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
        if let Some(session)=&self.session{
            let saved_count:i64=self.db.query_row("SELECT COUNT(*) FROM projects",[],|r|r.get(0))?;
            if saved_count==0{return session.import_map(path,resources);}
            // Reopen a deliberately saved project instead of creating a second
            // document for the same native source. New maps stay in RAM.
            let inspection=maps::inspect_map(path,resources)?;
            let mut statement=self.db.prepare("SELECT summary FROM projects")?;
            for row in statement.query_map([],|row|row.get::<_,String>(0))?{
                let entry:LibraryEntry=serde_json::from_str(&row?)?;
                if entry.sha256.as_deref()==Some(&inspection.sha256){
                    let project=self.get(&entry.id)?;
                    let source=project.source.as_ref().ok_or_else(||crate::SparkError::Invalid("Saved map has no native source".into()))?;
                    let verified=maps::inspect_map(&source.preserved_path,source.resource_directory.as_deref().or(resources))?;
                    if verified.sha256!=source.sha256{return invalid("Saved source checksum changed");}
                    return Ok((project,verified));
                }
            }
            return session.import_map(path,resources);
        }
        let transaction=self.db.unchecked_transaction()?;
        let (project,inspection,mut files)=self.import_map_internal(path,resources,true,false,None)?;
        if let Err(reason)=transaction.commit(){return Err(abort_import(&mut files,reason.into()));}
        if let Some(files)=&mut files{files.accepted=true;}
        Ok((project,inspection))
    }
    /// A background model/resource preview is not an editable imported map.
    /// Retain its verified source identity in RAM for the existing decoders.
    pub fn preview_map(&self,path:&Path,resources:Option<&Path>)->Result<(Project,maps::MapInspection)> {
        validate_local_input_path(path)?;crate::reject_links(path)?;
        let (project,inspection,_)=self.import_map_internal(path,resources,false,true,None)?;
        Ok((project,inspection))
    }
    /// Reuse the ordinary RAM preview path while retaining an already admitted
    /// source's exact resource pins. Hosting preferences never select its banks.
    pub fn preview_source(&self,source:&Source)->Result<(Project,maps::MapInspection)> {
        for path in [&source.original_path,&source.preserved_path].into_iter().chain(source.resource_directory.iter()).chain(source.audio_resources.iter().map(|a|&a.directory)) {validate_local_input_path(path)?;crate::reject_links(path)?;}
        let (project,inspection,_)=self.import_map_internal(&source.preserved_path,source.resource_directory.as_deref(),false,true,Some(source))?;
        Ok((project,inspection))
    }
    fn import_map_internal(&self,path:&Path,resources:Option<&Path>,reuse:bool,preview:bool,bound_source:Option<&Source>)->Result<(Project,maps::MapInspection,Option<ImportFiles>)> {
        // Persist the location now, so later app working directories cannot
        // reinterpret a relative map/resource selection. Missing resources are
        // still allowed; their absolute location remains explicit.
        let resource_directory=std::path::absolute(resources.or(path.parent()).filter(|p|!p.as_os_str().is_empty()).unwrap_or(Path::new(".")))?;
        let resource_directory=if resource_directory.is_dir(){fs::canonicalize(resource_directory)?}else{resource_directory};
        let inspection = maps::inspect_map(path, Some(&resource_directory))?;
        if let Some(source)=bound_source {
            if !preview||source.sha256!=inspection.sha256||source.cache_version!=inspection.header.version||source.scenario_path!=inspection.scenario_path{return invalid("The source preview does not match its admitted native identity");}
        }
        if preview {
            let expected=bound_source.map(serde_json::to_value).transpose()?;
            let original=fs::canonicalize(path)?;
            let mut rows=self.db.prepare("SELECT value FROM preview_documents")?;
            for text in rows.query_map([],|row|row.get::<_,String>(0))?{
                let project:Project=serde_json::from_str(&text?)?;
                let matches=if let Some(expected)=&expected {project.source.as_ref().map(serde_json::to_value).transpose()?.as_ref()==Some(expected)}else{project.source.as_ref().is_some_and(|source|source.sha256==inspection.sha256&&source.original_path==original)};
                if matches{return Ok((project,inspection,None));}
            }
        }
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
            // Deduplication keeps the original project but also remembers
            // resources beside another explicitly imported identical map.
            // These are candidates, not admitted resource pins.
            if [6,7,609].contains(&source.cache_version) {
                validate_local_input_path(path)?;crate::reject_links(path)?;
                let canonical=fs::canonicalize(path)?;
                if let Some(folder)=canonical.parent() {
                    let key=format!("mapResourceOrigins.{}",project.id);
                    let mut origins:Vec<PathBuf>=self.setting(&key)?;
                    origins.retain(|value|value!=folder);origins.insert(0,folder.to_owned());origins.truncate(8);
                    self.set_setting(&key,&origins)?;
                }
            }
            return Ok((project, inspection,None));
        }
        let resource_sha256=project::resource_hashes(&resource_directory)?;
        let mut p = Project::new(&inspection.header.name.replace('_', " "));
        let dir = self.project_dir(&p.id)?;
        crate::reject_links(&dir)?;
        let mut files=if self.session_only||preview{None}else{Some(ImportFiles::new(&dir)?)};
        let result=(||->Result<(Project,maps::MapInspection)>{
        let copy=if self.session_only || preview{
            validate_local_input_path(path)?;crate::reject_links(path)?;fs::canonicalize(path)?
        }else{
        fs::create_dir_all(&dir)?;
        let copy = dir.join("source.map");
        files.as_mut().unwrap().expect_hash("source.map",inspection.sha256.clone());
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
        files.as_mut().unwrap().record_created("source.map")?;
        let mut permissions = fs::metadata(&copy)?.permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&copy, permissions)?;
        copy};
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
            resource_sha256,
        });
        if let Some(source)=bound_source{p.source=Some(source.clone());}
        p.scene = inspection.objects.clone();
        if let Some(files)=&mut files{files.expect_project(&p)?;}
        let saved=self.save_internal(&p, Some(&inspection),preview);
        if let Some(files)=&mut files{files.record_project()?;}
        saved?;
        Ok((p,inspection))
        })();
        match result{Ok((project,inspection))=>Ok((project,inspection,files)),Err(reason)=>Err(abort_import(&mut files,reason))}
    }
    pub fn import_project(&self, path: &Path) -> Result<Project> {
        if let Some(session)=&self.session{return session.import_project(path);}
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
        let (project,mut files)=self.import_project_admitted(incoming)?;
        if let Err(reason)=transaction.commit(){return Err(abort_import(&mut files,reason.into()));}
        if let Some(files)=&mut files{files.accepted=true;}
        Ok(project)
    }
    fn import_project_admitted(&self,incoming:Project)->Result<(Project,Option<ImportFiles>)> {
        // Validate the entire payload before creating a managed project. A bad
        // later asset must not leave the earlier map/OBJ copy behind. The exact
        // checked bytes and parsed mesh are reused below, not read/decoded twice.
        let prepared=prepare_project_assets(&incoming)?;
        let (mut p,mut files) = if let Some(src) = &incoming.source {
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
            let (mut imported,_,files)=self.import_map_internal(&src.original_path, src.resource_directory.as_deref(),false,false,None)?;
            if let Some(source)=imported.source.as_mut(){source.resource_sha256=src.resource_sha256.clone();source.resource_directory=src.resource_directory.clone();source.audio_resources=src.audio_resources.clone();}(imported,files)
        } else {
            let p=Project::new(&incoming.title);
            let files=if self.session_only{None}else{Some(ImportFiles::new(&self.project_dir(&p.id)?)?)};
            (p,files)
        };
        let result=(||->Result<Project>{
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
        for (mut asset,bytes,parsed) in prepared {
            let original_id=asset.id.clone();let new_id=uuid::Uuid::new_v4().to_string();
            let extension=if parsed.is_some(){"obj".to_owned()}else{asset.path.extension().and_then(|value|value.to_str()).unwrap_or("").to_ascii_lowercase()};
            let raw=if self.session_only{
                // The admitted source file is immutable input. Inspecting a
                // descriptor must not allocate a copied OBJ/audio library.
                validate_local_input_path(&asset.path)?;crate::reject_links(&asset.path)?;fs::canonicalize(&asset.path)?
            }else{
            crate::reject_links(&dir)?;fs::create_dir_all(&dir)?;crate::reject_links(&dir)?;
            let raw=dir.join(format!("{new_id}.{extension}"));
            if let Some(files)=&mut files{files.expect_bytes(&format!("assets/{new_id}.{extension}"),&bytes);}
            project::atomic_write(&raw,&bytes,false)?;
            if let Some(files)=&mut files{files.record_created(&format!("assets/{new_id}.{extension}"))?;}
            raw};
            if let Some(parsed)=parsed {
                let mesh=serde_json::to_vec(&parsed.mesh)?;
                if !self.session_only{
                if let Some(files)=&mut files{files.expect_bytes(&format!("assets/{new_id}.mesh.json"),&mesh);}
                project::atomic_write(&dir.join(format!("{new_id}.mesh.json")),&mesh,false)?;
                if let Some(files)=&mut files{files.record_created(&format!("assets/{new_id}.mesh.json"))?;}
                }
                for object in &mut p.scene {if object.asset_id.as_deref()==Some(original_id.as_str()){object.asset_id=Some(new_id.clone());}}
                asset.vertices=parsed.mesh.positions.len()/3;asset.triangles=parsed.mesh.indices.len()/3;
                asset.has_uvs=parsed.has_uvs;asset.materials=parsed.materials;
            }else{
                if let Some(scene)=&mut p.audio_preview {for emitter in &mut scene.emitters {if emitter.source_project_id.as_deref()==Some(p.id.as_str()){if let Some(sound)=&mut emitter.custom_sound {if sound.asset_id==original_id{sound.asset_id=new_id.clone();}}}}}
                asset.vertices=0;asset.triangles=0;asset.has_uvs=false;asset.materials.clear();
            }
            asset.id=new_id;asset.path=raw;p.assets.push(asset);
        }
        if p.scene.iter().any(|o| {
            o.asset_id
                .as_ref()
                .is_some_and(|id| !p.assets.iter().any(|a| &a.id == id))
        }) {
            return invalid("A scene mesh is missing its asset metadata");
        }
        if let Some(files)=&mut files{files.expect_project(&p)?;}
        let saved=self.save(&p, None);
        if let Some(files)=&mut files{files.record_project()?;}
        saved?;
        Ok(p)
        })();
        match result{Ok(project)=>Ok((project,files)),Err(reason)=>Err(abort_import(&mut files,reason))}
    }
}

/// Descriptor import preflight uses one bounded in-memory payload, never a new
/// archive, temporary SDK or staging database. ImportFiles couples the owned
/// filesystem output to the existing SQLite transaction's publication.
fn prepare_project_assets(incoming:&Project)->Result<Vec<(project::Asset,Vec<u8>,Option<crate::assets::ObjImport>)>> {
    use sha2::{Digest,Sha256};
    let mut prepared=vec![];let mut total=0u64;let mut ids=std::collections::BTreeSet::new();
    for asset in &incoming.assets {
        if !ids.insert(asset.id.as_str()){return invalid("Referenced asset identities must be unique");}
        if !matches!(asset.kind.as_str(),"obj"|"custom-sound"){return invalid("Referenced asset is not a supported OBJ or custom sound");}
        let size=fs::metadata(&asset.path)?.len();
        let maximum=if asset.kind=="custom-sound"{16*1024*1024}else{64*1024*1024};
        if size>maximum{return invalid(if asset.kind=="custom-sound"{"Custom audio exceeds 16 MiB"}else{"Referenced asset exceeds 64 MiB"});}
        total=total.checked_add(size).ok_or_else(||crate::SparkError::Invalid("Descriptor import payload size overflow".into()))?;
        if total>128*1024*1024{return invalid("Descriptor import asset payload exceeds its 128 MiB memory budget; no project was created");}
        let mut bytes=Vec::new();
        std::io::Read::read_to_end(&mut std::io::Read::take(fs::File::open(&asset.path)?,size+1),&mut bytes)?;
        if bytes.len() as u64!=size||crate::hex_bytes(Sha256::digest(&bytes))!=asset.sha256{return invalid(format!("Referenced asset checksum changed or exceeds its admitted size: {}",asset.name));}
        let parsed=if asset.kind=="obj" {
            Some(crate::assets::parse_obj(std::str::from_utf8(&bytes).map_err(|_|crate::SparkError::Invalid("Referenced OBJ must be UTF-8".into()))?)?)
        }else{
            let extension=asset.path.extension().and_then(|value|value.to_str()).unwrap_or("").to_ascii_lowercase();
            crate::custom_sounds::inspect(&bytes,&extension)?;None
        };
        prepared.push((asset.clone(),bytes,parsed));
    }
    if incoming.scene.iter().any(|object|object.asset_id.as_ref().is_some_and(|id|!ids.contains(id.as_str()))){return invalid("A scene mesh is missing its asset metadata");}
    Ok(prepared)
}


/// One unpublished project directory, not another cache or storage catalog.
/// Only paths created by this import, with their expected bytes and native file
/// identities, may roll back. Unknown/changed/linked content is retained.
struct ImportFiles {
    directory:PathBuf,
    identity:(u64,u64),
    parent_identity:(u64,u64),
    expected:std::collections::BTreeMap<String,std::collections::BTreeSet<String>>,
    identities:std::collections::BTreeMap<String,(u64,u64)>,
    accepted:bool,
}
impl ImportFiles {
    fn new(directory:&Path)->Result<Self> {
        use sha2::Digest;
        crate::reject_links(directory)?;
        let parent=directory.parent().ok_or_else(||crate::SparkError::Invalid("Import has no project parent".into()))?;
        fs::create_dir_all(parent)?;crate::reject_links(parent)?;
        let parent_identity=crate::storage::file_identity(parent).ok_or_else(||crate::SparkError::Invalid("Cannot verify import parent identity".into()))?;
        fs::create_dir(directory)?;
        let identity=crate::storage::file_identity(directory).ok_or_else(||crate::SparkError::Invalid("Cannot verify new import identity; empty directory retained".into()))?;
        let mut result=Self{directory:fs::canonicalize(directory)?,identity,parent_identity,expected:Default::default(),identities:Default::default(),accepted:false};
        let owner=uuid::Uuid::new_v4().to_string().into_bytes();result.expect_hash(".spark-import-owner",crate::hex_bytes(sha2::Sha256::digest(&owner)));
        project::atomic_write(&directory.join(".spark-import-owner"),&owner,false)?;
        result.record_created(".spark-import-owner")?;
        Ok(result)
    }
    fn expect_hash(&mut self,relative:&str,hash:String){self.expected.entry(relative.to_owned()).or_default().insert(hash);}
    fn expect_bytes(&mut self,relative:&str,bytes:&[u8]){use sha2::Digest;self.expect_hash(relative,crate::hex_bytes(sha2::Sha256::digest(bytes)));}
    fn record_created(&mut self,relative:&str)->Result<()> {
        let path=self.directory.join(crate::safe_relative(relative)?);crate::reject_links(&path)?;
        let identity=crate::storage::unique_file_identity(&path).ok_or_else(||crate::SparkError::Invalid("Unpublished import file has an alias or unknown identity; retained".into()))?;
        if !self.expected.get(relative).is_some_and(|hashes|maps::hash_file(&path).is_ok_and(|hash|hashes.contains(&hash))){return invalid("Unpublished import bytes differ from their admitted payload; retained");}
        self.identities.insert(relative.to_owned(),identity);Ok(())
    }
    fn record_project(&mut self)->Result<()> {
        for relative in ["project.gsproject","project.gsproject.bak"]{if self.directory.join(relative).is_file(){self.record_created(relative)?;}}
        Ok(())
    }
    fn expect_project(&mut self,p:&Project)->Result<()> {
        let file=self.directory.join("project.gsproject");
        if file.is_file(){
            let hash=maps::hash_file(&file)?;
            if !self.expected.get("project.gsproject").is_some_and(|known|known.contains(&hash)){return invalid("Unpublished project changed outside its import; it was retained");}
            self.expect_hash("project.gsproject.bak",hash);
        }
        self.expect_bytes("project.gsproject",&serde_json::to_vec_pretty(p)?);Ok(())
    }
    fn rollback(&self)->Result<()> {
        crate::reject_links(&self.directory)?;
        let parent=self.directory.parent().ok_or_else(||crate::SparkError::Invalid("Import parent missing".into()))?;
        if crate::storage::file_identity(&self.directory)!=Some(self.identity)||crate::storage::file_identity(parent)!=Some(self.parent_identity){return invalid("Import directory identity changed; rollback refused");}
        let owner=self.directory.join(".spark-import-owner");
        if !owner.is_file()||!self.expected.get(".spark-import-owner").is_some_and(|hashes|maps::hash_file(&owner).is_ok_and(|hash|hashes.contains(&hash))){return invalid("Import owner nonce changed or disappeared; rollback refused");}
        let snapshot=crate::storage::measure(&self.directory)?;
        if snapshot.logical_bytes>1024*1024*1024{return invalid("Unpublished import exceeds rollback's 1 GiB bound; retained");}
        let mut pending=vec![self.directory.clone()];let mut files=vec![];let mut directories=vec![];
        while let Some(dir)=pending.pop(){for entry in fs::read_dir(&dir)?{
            let path=entry?.path();crate::reject_links(&path)?;let meta=fs::symlink_metadata(&path)?;
            let relative=path.strip_prefix(&self.directory).map_err(|_|crate::SparkError::Invalid("Import path escaped".into()))?.to_string_lossy().replace('\\',"/");
            if meta.is_dir(){if relative!="assets"{return invalid("Unknown import directory retained");}directories.push(path.clone());pending.push(path);continue;}
            if !meta.is_file()||files.len()>=4096{return invalid("Unknown or excessive import files retained");}
            let expected=self.expected.get(&relative).ok_or_else(||crate::SparkError::Invalid("Unknown import file retained".into()))?;
            if !expected.contains(&maps::hash_file(&path)?){return invalid("Import file contents changed; rollback refused");}
            let id=crate::storage::unique_file_identity(&path).ok_or_else(||crate::SparkError::Invalid("Import file has an alias or unavailable identity; retained".into()))?;
            if self.identities.get(&relative)!=Some(&id){return invalid("Import file identity changed since creation; rollback refused");}
            files.push((path,id));
        }}
        if crate::storage::measure(&self.directory)?.fingerprint!=snapshot.fingerprint{return invalid("Import changed during rollback verification; retained");}
        // Keep ownership evidence until all known payload has been retired.
        files.sort_by_key(|(path,_)|path.file_name().is_some_and(|name|name==".spark-import-owner"));
        for (path,id) in files {
            crate::reject_links(&path)?;
            if crate::storage::unique_file_identity(&path)!=Some(id){return invalid("Import file identity or link ownership changed before rollback; retained");}
            #[cfg(windows)]{let mut permissions=fs::metadata(&path)?.permissions();if permissions.readonly(){#[allow(clippy::permissions_set_readonly_false)] permissions.set_readonly(false);fs::set_permissions(&path,permissions)?;}}
            fs::remove_file(path)?;
        }
        for path in directories{fs::remove_dir(path)?;}
        fs::remove_dir(&self.directory)?;Ok(())
    }
}
fn abort_import(files:&mut Option<ImportFiles>,reason:crate::SparkError)->crate::SparkError {
    let Some(files)=files else{return reason;};
    // This disarms the local guard after an explicit failure decision, not a
    // successful publication. A refusal retains its nonce and exact files.
    files.accepted=true;
    match files.rollback(){Ok(())=>reason,Err(retained)=>crate::SparkError::Invalid(format!("{reason} Unpublished files were retained at {} because rollback could not prove ownership/content: {retained}",files.directory.display()))}
}
impl Drop for ImportFiles {
    fn drop(&mut self){if !self.accepted{if let Err(reason)=self.rollback(){eprintln!("Unpublished import retained at {}: {reason}",self.directory.display());}}}
}


#[cfg(test)]
mod import_ownership_tests {
    use super::*;
    #[test]
    fn deferred_database_commit_failure_rolls_back_only_the_new_owned_project() {
        let root=tempfile::tempdir().unwrap();let library=Library::open(&root.path().join("library")).unwrap();
        let existing=library.create("Previously saved").unwrap();let file=library.project_dir(&existing.id).unwrap().join("project.gsproject");let before=fs::read(&file).unwrap();
        library.db.pragma_update(None,"foreign_keys",true).unwrap();
        library.db.execute_batch("CREATE TABLE import_parent(id INTEGER PRIMARY KEY); CREATE TABLE import_child(parent INTEGER REFERENCES import_parent(id) DEFERRABLE INITIALLY DEFERRED); CREATE TRIGGER fail_import_commit AFTER INSERT ON projects BEGIN INSERT INTO import_child VALUES(123); END;").unwrap();
        let descriptor=root.path().join("incoming.gsproject");project::save_project(&descriptor,&Project::new("Commit must fail")).unwrap();
        for _ in 0..10{assert!(library.import_project(&descriptor).is_err());assert_eq!(library.list().unwrap().len(),1);assert_eq!(fs::read_dir(library.root.join("projects")).unwrap().count(),1);assert_eq!(fs::read(&file).unwrap(),before);}
        assert_eq!(library.db.query_row("SELECT COUNT(*) FROM import_child",[],|row|row.get::<_,i64>(0)).unwrap(),0);
    }
    #[test]
    fn rollback_refuses_changed_unknown_owner_and_replaced_directory_content() {
        let root=tempfile::tempdir().unwrap();
        for mode in ["contents","unknown","owner","directory"] {
            let dir=root.path().join(uuid::Uuid::new_v4().to_string());let mut guard=ImportFiles::new(&dir).unwrap();
            let file=dir.join("owned.bin");guard.expect_bytes("owned.bin",b"owned generated bytes");fs::write(&file,b"owned generated bytes").unwrap();guard.record_created("owned.bin").unwrap();
            match mode {
                "contents"=>fs::write(&file,b"independent changed data").unwrap(),
                "unknown"=>fs::write(dir.join("unregistered.bin"),b"unknown data").unwrap(),
                "owner"=>fs::write(dir.join(".spark-import-owner"),b"changed nonce").unwrap(),
                _=>{fs::rename(&dir,root.path().join("original-generated")).unwrap();fs::create_dir(&dir).unwrap();fs::write(dir.join("unique.txt"),b"replacement directory").unwrap();}
            }
            assert!(guard.rollback().is_err(),"{mode}");assert!(dir.exists());
            if mode!="directory"{assert!(file.exists(),"no partial deletion on failed preflight");}
            guard.accepted=true; // Keep the deliberately changed evidence until tempfile's test-only owner ends.
        }
    }
}

#[cfg(test)]
mod import_alias_tests {
    use super::*;
    #[test]
    fn unchanged_bytes_replaced_by_a_hardlink_never_change_or_delete_the_original() {
        let root=tempfile::tempdir().unwrap();let directory=root.path().join(uuid::Uuid::new_v4().to_string());let mut guard=ImportFiles::new(&directory).unwrap();
        let original=root.path().join("original.bin");fs::write(&original,b"same bytes").unwrap();
        let owned=directory.join("copy.bin");guard.expect_bytes("copy.bin",b"same bytes");fs::write(&owned,b"same bytes").unwrap();guard.record_created("copy.bin").unwrap();
        fs::remove_file(&owned).unwrap();fs::hard_link(&original,&owned).unwrap();
        let before=fs::metadata(&original).unwrap().permissions().readonly();
        assert!(guard.rollback().is_err());assert!(original.is_file());assert!(owned.is_file());
        assert_eq!(fs::read(&original).unwrap(),b"same bytes");assert_eq!(fs::metadata(&original).unwrap().permissions().readonly(),before);
        guard.accepted=true;
    }
}

#[cfg(test)]
mod import_retention_report_tests {
    use super::*;
    #[test]
    fn failed_import_reports_the_exact_retained_folder_in_the_returned_error() {
        let root=tempfile::tempdir().unwrap();let directory=root.path().join(uuid::Uuid::new_v4().to_string());
        let guard=ImportFiles::new(&directory).unwrap();fs::write(directory.join("independent.txt"),b"must remain").unwrap();
        let mut files=Some(guard);let message=abort_import(&mut files,crate::SparkError::Invalid("Original import failure".into())).to_string();
        assert!(message.contains("Original import failure"));assert!(message.contains(&fs::canonicalize(&directory).unwrap().display().to_string()));
        assert!(message.contains("retained"));drop(files);assert_eq!(fs::read(directory.join("independent.txt")).unwrap(),b"must remain");
        assert!(directory.join(".spark-import-owner").is_file());
    }
}
