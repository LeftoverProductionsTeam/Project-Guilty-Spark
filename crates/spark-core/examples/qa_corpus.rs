//! Local owner-supplied corpus regression. Never runs a supplied executable.
//! Usage: qa_corpus <corpus> <output-directory> [invader-directory]
use serde_json::{json, Value};
use spark_core::{build, library::Library, maps, project, Result};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, Arc},
};

fn files(root: &Path, output: &mut Vec<PathBuf>) -> Result<()> {
    spark_core::reject_links(root)?;
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        spark_core::reject_links(&entry.path())?;
        if entry.file_type()?.is_dir() {
            files(&entry.path(), output)?;
        } else if entry.file_type()?.is_file() {
            output.push(entry.path());
        }
        if output.len() > 4096 {
            return spark_core::invalid("Corpus exceeds 4096 files");
        }
    }
    Ok(())
}
fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        return spark_core::invalid(
            "Usage: qa_corpus <corpus> <output-directory> [invader-directory]",
        );
    }
    let corpus = fs::canonicalize(&args[1])?;
    let out = Path::new(&args[2]);
    fs::create_dir_all(out)?;
    let library = Library::open(&out.join("library"))?;
    let resources = corpus.join("Zombie Apocalypse/maps");
    let tools = build::Toolchain {
        invader_directory: args.get(3).map(PathBuf::from),
        resource_directory: Some(resources.clone()),
        ..Default::default()
    };
    let mut paths = vec![];
    files(&corpus, &mut paths)?;
    paths.sort();
    let mut inventory = vec![];
    let mut cases = vec![];
    let mut builds: BTreeMap<String, Value> = BTreeMap::new();
    for path in paths {
        let relative = path
            .strip_prefix(&corpus)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        let meta = fs::metadata(&path)?;
        let hash = maps::hash_file(&path)?;
        let ext = path
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_ascii_lowercase();
        let resource = matches!(
            path.file_name().unwrap_or_default().to_str(),
            Some("bitmaps.map" | "sounds.map" | "loc.map")
        );
        inventory.push(json!({"path":relative,"size":meta.len(),"sha256":hash,"readonly":meta.permissions().readonly(),"classification":if resource{"sharedResource"}else if ext=="map"{"scenarioCandidate"}else if ["exe","dll","bin"].contains(&ext.as_str()){"untrustedBinaryNotExecuted"}else{"historicalSupportingFile"}}));
        if ext != "map" || resource {
            continue;
        }
        eprintln!("Corpus: {relative}");
        let (mut p, i) = library.import_map(&path, Some(&resources))?;
        let preserved = p.source.as_ref().unwrap().preserved_path.clone();
        let before = p.fingerprint()?;
        p.provenance.description =
            "Owner-supplied historical regression fixture; gameplay untested".into();
        library.save(&p, Some(&i))?;
        let loaded = library.get(&p.id)?;
        assert_eq!(before, loaded.fingerprint()?);
        assert_eq!(i.sha256, hash);
        assert_eq!(maps::hash_file(&preserved)?, hash);
        assert!(fs::metadata(&preserved)?.permissions().readonly());
        assert!(!i.tags.is_empty());
        let expected = match hash.as_str() {
            "b38f35508188872b2535888193de80f766d92d3b8d53a8ada7be4fc9808a996d" => {
                Some((6, 2825, 197, 5940))
            }
            "2bd5532e977faf388f863ce19ea5e8b7dd6a09e479843923bec2e30688bdc10c"
            | "0ba3e6c8c1fb7d1a692aed1598a32d1b85b2c0ca669b85e372d317a93d7aebb7" => {
                Some((7, 2825, 197, 5940))
            }
            "745efe81e4c07c0d43e55dae51b432e1d48d0719eb7ac4c0c249a7135170c697" => {
                Some((7, 2717, 339, 33092))
            }
            "8e4345f1529adeab4441ee639d54b7d5f1ec3672e2a0f2b368f749ec85b1ff9b" => {
                Some((6, 1534, 1, 5940))
            }
            "45a990410896412bdd961254cac1491beda4bc1d79d1d704caa5c7c2c57e1e04"
            | "35667fadbbec931c780d73d7d28be74550111d8308cf173ccb052c84084dc709" => {
                Some((7, 1534, 1, 5940))
            }
            _ => None,
        };
        if let Some(expected) = expected {
            assert_eq!(
                (
                    i.header.version,
                    i.tags.len(),
                    i.objects.len(),
                    i.mesh.indices.len() / 3
                ),
                expected,
                "Known corpus regression: {relative}"
            );
        }
        assert!(!i.mesh.indices.is_empty());
        assert!(i
            .mesh
            .indices
            .iter()
            .all(|v| (*v as usize) < i.mesh.positions.len() / 3));
        let mut classes: BTreeMap<String, usize> = BTreeMap::new();
        for tag in &i.tags {
            *classes.entry(tag.class.clone()).or_default() += 1;
        }
        let refs = i
            .tags
            .iter()
            .flat_map(|tag| tag.references.iter().map(move |r| (tag, r)))
            .collect::<Vec<_>>();
        let unresolved = refs
            .iter()
            .filter(|(_, r)| !i.tags.iter().any(|t| t.id == r.target_id))
            .map(|(t, r)| json!({"tag":t.path,"reference":r.label,"targetId":r.target_id}))
            .collect::<Vec<_>>();
        let compatibility = build::compatibility(&p, &i, &tools);
        if !builds.contains_key(&hash) {
            let conversion = if compatibility.ready && args.len() > 3 {
                let job = uuid::Uuid::new_v4().to_string();
                let events = std::sync::Mutex::new(Vec::new());
                let result = build::run_build(
                    &p,
                    &i,
                    &tools,
                    &out.join("jobs"),
                    &job,
                    Arc::new(AtomicBool::new(false)),
                    |e| events.lock().unwrap().push(e),
                );
                project::atomic_write(
                    &out.join(format!("{job}-events.json")),
                    &serde_json::to_vec_pretty(&*events.lock().unwrap())?,
                    false,
                )?;
                match result {
                    Ok(record) => {
                        json!({"status":if record.status=="validated"{"PASS"}else{"FAIL"},"record":record,"scope":"tool pipeline only; no game launch"})
                    }
                    Err(e) => json!({"status":"FAIL","message":e.to_string()}),
                }
            } else {
                json!({"status":"BLOCKED","blockers":compatibility.blockers,"scope":"conversion preflight"})
            };
            builds.insert(hash.clone(), conversion);
        }
        assert_eq!(maps::hash_file(&path)?, hash, "Original changed");
        cases.push(json!({"path":relative,"sha256":hash,"header":i.header,"scenario":i.scenario_path,"tags":i.tags.len(),"classes":classes,"objects":i.objects.len(),"collisionVertices":i.mesh.positions.len()/3,"collisionTriangles":i.mesh.indices.len()/3,"encounters":i.encounters,"scripts":i.scripts,"resources":i.resources,"diagnostics":i.diagnostics,"decodedReferenceCount":refs.len(),"unresolvedDecodedReferences":unresolved,"tests":{"formatHeaderTags":"PASS","projectSaveReload":"PASS","sourceImmutability":"PASS","preservedCopyReadonly":"PASS","collisionMeshBounds":"PASS","dependencyCompleteness":"BLOCKED","gameplay":"UNTESTED","twoComputerAi":"UNTESTED"},"mccConversion":builds.get(&hash),"projectId":p.id,"tagInventory":i.tags.iter().map(|t|json!({"id":t.id,"class":t.class,"path":t.path,"external":t.external,"fields":t.fields,"references":t.references})).collect::<Vec<_>>()}));
    }
    let result = json!({"schemaVersion":1,"recordedAt":chrono::Utc::now().to_rfc3339(),"files":inventory,"scenarios":cases,"uniqueMaps":library.list()?.len(),"archivedExecutablesExecuted":false,"steamModified":false,"gameLaunched":false,"zipSupplied":inventory.iter().any(|f|f["path"].as_str().unwrap_or("").ends_with(".zip"))});
    project::atomic_write(
        &out.join("corpus-results.json"),
        &serde_json::to_vec_pretty(&result)?,
        false,
    )?;
    println!("{}", out.join("corpus-results.json").display());
    Ok(())
}
