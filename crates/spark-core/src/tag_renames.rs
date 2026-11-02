//! Native tag renames in an isolated build tree. Never patch cache pointers.
use crate::{build::{self, Runner, Toolchain}, invalid, maps::{MapInspection, Tag}, native_operations,
    project::{self, Project}, safe_relative, Result, SparkError};
use serde::{Deserialize, Serialize};
use std::{collections::{BTreeMap, BTreeSet}, path::Path};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct TagRename { pub source_tag_id:u32, pub path:String }
fn normalized(value:&str)->String { value.replace('\\',"/").to_ascii_lowercase() }
pub fn validate(plans:&[TagRename])->Result<()> {
    if plans.len()>128 {return invalid("At most 128 tag renames may be queued per build");}
    let mut ids=BTreeSet::new();
    for plan in plans {
        safe_relative(&plan.path)?;
        if plan.path.len()>240 || plan.path.starts_with('-') || plan.path.ends_with(['/', '\\'])
            || plan.path.bytes().any(|b|!b.is_ascii()||b.is_ascii_control()||b"*?[]".contains(&b))
            || !ids.insert(plan.source_tag_id) {return invalid("Tag renames need unique source IDs and safe relative paths without extensions");}
    }
    Ok(())
}
fn tag(inspection:&MapInspection,id:u32)->Result<&Tag> {
    inspection.tags.iter().find(|tag|tag.id==id).ok_or_else(||SparkError::Invalid("Renamed tag is no longer indexed in this source revision".into()))
}
fn file(tag:&Tag,path:&str)->Result<String> {
    let result=format!("{}.{}",path,crate::tag_exchange::extension(&tag.class)?);safe_relative(&result)?;Ok(result)
}
pub fn validate_source(project:&Project,inspection:&MapInspection)->Result<()> {
    validate(&project.tag_renames)?;
    let mut targets=BTreeSet::new();
    for plan in &project.tag_renames {
        let source=tag(inspection,plan.source_tag_id)?;
        if matches!(source.class.as_str(),"scnr"|"sbsp"|"matg") {return invalid("Scenario, BSP and globals roots keep their dedicated build paths; rename their project or geometry through that workspace");}
        if inspection.tags.iter().filter(|t|t.class==source.class&&normalized(&t.path)==normalized(&source.path)).count()!=1 {
            return invalid("This source tag path is ambiguous; recover an unambiguous native tagset first");
        }
        if inspection.tags.iter().any(|t|t.class==source.class&&normalized(&t.path)==normalized(&plan.path))
            || !targets.insert(normalized(&file(source,&plan.path)?))
            || project.tag_duplicates.iter().any(|d|d.source_tag_id==source.id||d.owner_tag_id==source.id||normalized(&d.path)==normalized(&plan.path)) {
            return invalid("The custom tag path is already in use, is a case-only rename, or conflicts with a queued duplicate");
        }
        file(source,&source.path)?;
    }
    Ok(())
}
fn run(exe:&Path,tags:&Path,workspace:&Path,runner:&Runner,arguments:Vec<String>)->Result<String> {
    let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned()];args.extend(arguments);
    #[cfg(windows)] for arg in &mut args {*arg=arg.replace('/',"\\");}
    let result=runner.run(exe,&args,workspace,"tag-renaming",53)?;
    if result.lines().any(|line|line.to_ascii_lowercase().contains("error:")) {return invalid("Native tag rename tool reported an error; no output was accepted");}
    Ok(result)
}
// Only exact dependency values may change. Preserve every other exposed field,
// array, enum, string and number; whitespace inside non-dependency data matters.
fn semantic_fields(text:&str,replacements:&BTreeMap<String,String>)->Result<Vec<String>> {
    if text.len()>4*1024*1024 {return invalid("Native tag field readback exceeds the rename review bound");}
    Ok(text.lines().map(|line| {
        if let Some(value)=line.trim_end().strip_suffix("dependency") {
            if let Some((key,value))=value.trim_end().split_once(" (") {
                if let Some(path)=value.strip_suffix(')') {
                    let path=normalized(path);let target=replacements.get(&path).unwrap_or(&path);
                    return format!("{key} ({target}) dependency");
                }
            }
        }
        // Invader omits the type column when a long dependency fills it.
        // Only an exact planned dependency value gets this treatment. A
        // printed string type is never rewritten, including path-like text.
        if let Some((key,value))=line.trim_end().split_once(" (") {
            if let Some(value)=value.strip_suffix(')') {
                if let Some(target)=replacements.get(&normalized(value)) {return format!("{key} ({target}) dependency");}
            }
        }
        // Invader aligns the type column to the longest printed value. A
        // longer tag path can change padding on every line without changing
        // any value. Keep indentation and all whitespace inside values exact.
        let leading=line.len()-line.trim_start_matches(' ').len();
        let mut result=line[..leading].to_string();let(mut depth,mut spaces)=(0usize,false);
        for character in line[leading..].trim_end().chars(){
            if character==' '&&depth==0 {if !spaces{result.push(character);}spaces=true;continue;}
            spaces=false;if character=='(' {depth+=1;}else if character==')' {depth=depth.saturating_sub(1);}result.push(character);
        }
        result
    }).collect())
}
fn inventory(tags:&Path,runner:&Runner)->Result<BTreeMap<String,String>> {
    let original=crate::working_tags::tree_hashes(tags,runner.cancel)?;
    let mut normalized_paths=BTreeMap::new();
    for (path,hash) in original {if normalized_paths.insert(normalized(&path),hash).is_some(){return invalid("Case-colliding source tags cannot be safely renamed");}}
    Ok(normalized_paths)
}
pub(crate) fn prepare(project:&Project,inspection:&MapInspection,tools:&Toolchain,workspace:&Path,tags:&Path,runner:&Runner)->Result<()> {
    if project.tag_renames.is_empty(){return Ok(());}
    validate_source(project,inspection)?;
    let tool=|name:&str|build::tool_path(tools,name).ok_or_else(||SparkError::Invalid(format!("Tag renaming requires {name}")));
    let (refactor,dependency,reader)=(tool("invader-refactor")?,tool("invader-dependency")?,tool("invader-edit")?);
    let before=inventory(tags,runner)?;
    let mut renames=BTreeMap::new();let mut affected=BTreeSet::new();
    for plan in &project.tag_renames {
        let source=tag(inspection,plan.source_tag_id)?;let original=normalized(&file(source,&source.path)?);let target=normalized(&file(source,&plan.path)?);
        if !before.contains_key(&original)||before.keys().any(|p|normalized(p)==target) {return invalid("Native rename source is missing or its destination already exists in the staged tag tree");}
        let refs=run(&dependency,tags,workspace,runner,vec!["-R".into(),original.clone()])?;
        for row in native_operations::dependency_lines(&refs)? {
            if row.reported_broken{return invalid("A native rename referrer is broken; repair its source before renaming");}
            affected.insert(normalized(&row.path));
        }
        affected.insert(original.clone());renames.insert(original,target);
    }
    if affected.len()>512 {return invalid("This rename affects more than 512 source tags; split the operation for complete native readback");}
    let identity:BTreeMap<_,_>=renames.iter().flat_map(|(a,b)|[(a.clone(),a.clone()),(b.clone(),b.clone())]).collect();
    let expected_paths:BTreeMap<_,_>=identity.iter().map(|(a,b)|(a.clone(),renames.get(a).unwrap_or(b).clone())).collect();
    let mut fields=BTreeMap::new();
    for relative in &affected {
        let text=run(&reader,tags,workspace,runner,vec!["-L".into(),relative.clone()])?;
        fields.insert(relative.clone(),semantic_fields(&text,&expected_paths)?);
    }
    let mut args=vec!["-M".into(),"move".into()];
    for (original,target) in &renames {args.extend(["-T".into(),original.clone(),target.clone()]);}
    run(&refactor,tags,workspace,runner,args)?;
    let after=inventory(tags,runner)?;
    if before.len()!=after.len(){return invalid("Native renaming changed the source tag inventory size");}
    for (relative,hash) in &before {
        let target=renames.get(&normalized(relative)).map(String::as_str).unwrap_or(relative);
        let actual=after.get(target).ok_or_else(||SparkError::Invalid(format!("Renamed tag missing from staged output: {target}")))?;
        if !affected.contains(&normalized(relative))&&actual!=hash {return invalid(format!("Native rename changed an unrelated source tag: {relative}"));}
    }
    for (relative,expected) in fields {
        let target=renames.get(&relative).unwrap_or(&relative);
        let text=run(&reader,tags,workspace,runner,vec!["-L".into(),target.clone()])?;
        let actual=semantic_fields(&text,&identity)?;
        if actual!=expected {
            let differences:Vec<_>=(0..expected.len().max(actual.len())).filter(|&i|expected.get(i)!=actual.get(i)).take(64).map(|i|serde_json::json!({"line":i+1,"expected":expected.get(i),"actual":actual.get(i)})).collect();
            project::atomic_write(&workspace.join("tag-rename-rejected.json"),&serde_json::to_vec_pretty(&serde_json::json!({"tag":target,"differences":differences}))?,false)?;
            return invalid(format!("Native tag rename changed fields beyond the intended references: {target}"));
        }
    }
    for original in renames.keys(){if after.contains_key(original){return invalid("Native rename retained its old tag path");}}
    project::atomic_write(&workspace.join("tag-renames.json"),&serde_json::to_vec_pretty(&serde_json::json!({"schemaVersion":1,"renames":renames,"referrersReviewed":affected.len(),"tagCount":after.len(),"unrelatedHashesVerified":true,"exposedFieldsVerified":true}))?,false)?;
    Ok(())
}
pub(crate) fn verify_compiled(project:&Project,source:&MapInspection,compiled:&MapInspection)->Result<()> {
    for rename in &project.tag_renames {
        let original=tag(source,rename.source_tag_id)?;
        let matches:Vec<_>=compiled.tags.iter().filter(|t|t.class==original.class&&normalized(&t.path)==normalized(&rename.path)).collect();
        if matches.len()!=1||compiled.tags.iter().any(|t|t.class==original.class&&normalized(&t.path)==normalized(&original.path)) {
            return invalid(format!("Compiled cache did not preserve the renamed tag identity: {}",rename.path));
        }
        for owner in source.tags.iter().filter(|t|t.references.iter().any(|r|r.target_id==original.id)) {
            let owner_path=project.tag_renames.iter().find(|r|r.source_tag_id==owner.id).map(|r|r.path.as_str()).unwrap_or(&owner.path);
            let compiled_owner=compiled.tags.iter().find(|t|t.class==owner.class&&normalized(&t.path)==normalized(owner_path)).ok_or_else(||SparkError::Invalid("A renamed tag's referring owner disappeared during compilation".into()))?;
            if !compiled_owner.references.iter().any(|r|r.target_id==matches[0].id) {return invalid("Compiled tag reference readback does not point to the custom name");}
        }
    }
    Ok(())
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn only_exact_dependency_values_may_change(){
        let paths=BTreeMap::from([("weapons/pistol/bullet.projectile".into(),"custom/my bullet.projectile".into())]);
        let before="projectile (weapons\\pistol\\bullet.projectile)     dependency\nspeed (12.000000) float32\nname (weapons\\pistol\\bullet.projectile) string\n";
        let after="projectile (custom\\my bullet.projectile) dependency\nspeed (12.000000)         float32\nname (weapons\\pistol\\bullet.projectile)  string\n";
        assert_eq!(semantic_fields(before,&paths).unwrap(),semantic_fields(after,&BTreeMap::new()).unwrap());
        assert_ne!(semantic_fields(before,&paths).unwrap(),semantic_fields(&after.replace("12.000000","99.000000"),&BTreeMap::new()).unwrap());
        assert_ne!(semantic_fields(before,&paths).unwrap(),semantic_fields(&after.replace("name (weapons","name (changed"),&BTreeMap::new()).unwrap());
        assert_ne!(semantic_fields("name (my  name) string",&paths).unwrap(),semantic_fields("name (my name) string",&paths).unwrap());
    }
    #[test]
    #[ignore="Requires the owner's native looping-emitter output, native SDK tags, H1A kit and Invader; compiles an isolated copy"]
    fn owned_native_emitter_rename_compiles_with_updated_references(){
        let path=|name:&str|std::path::PathBuf::from(std::env::var(name).unwrap_or_else(|_|panic!("Set {name}")));
        let root=path("SPARK_RENAME_QA_ROOT");std::fs::create_dir(&root).unwrap();
        let cache=path("SPARK_RENAME_SOURCE");let source_hash=crate::maps::hash_file(&cache).unwrap();
        let sdk=path("SPARK_RENAME_TAGS");let cancel=std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let sdk_before=crate::working_tags::tree_hashes(&sdk,&cancel).unwrap();
        let library=crate::library::Library::open(&root.join("library")).unwrap();let(mut project,inspection)=library.import_map(&cache,None).unwrap();
        let emitter=inspection.tags.iter().find(|tag|tag.class=="ssce").expect("Source contains a genuinely compiled native emitter");
        project.tag_renames.push(TagRename{source_tag_id:emitter.id,path:"spark/custom_names/my ambient emitter".into()});
        let tools=Toolchain{h1a_directory:Some(path("SPARK_RENAME_KIT")),base_tags_directory:Some(sdk.clone()),invader_directory:Some(path("SPARK_RENAME_INVADER")),..Default::default()};
        let job=uuid::Uuid::new_v4().to_string();let events=std::sync::Mutex::new(vec![]);
        let result=build::run_build(&project,&inspection,&tools,&root.join("jobs"),&job,cancel.clone(),|event|{events.lock().unwrap().push(event);});
        std::fs::write(root.join("events.json"),serde_json::to_vec_pretty(&*events.lock().unwrap()).unwrap()).unwrap();
        let record=result.unwrap();assert_eq!(record.status,"validated","{}",record.message);let output=record.output.as_ref().unwrap();let compiled=crate::maps::inspect_map(output,None).unwrap();
        verify_compiled(&project,&inspection,&compiled).unwrap();
        assert_eq!(crate::maps::hash_file(&cache).unwrap(),source_hash);assert_eq!(crate::working_tags::tree_hashes(&sdk,&cancel).unwrap(),sdk_before);
        let renamed=compiled.tags.iter().find(|tag|tag.class=="ssce"&&normalized(&tag.path)=="spark/custom_names/my ambient emitter").unwrap();
        let positions=|map:&MapInspection,id|map.objects.iter().filter(|object|object.kind=="Sound scenery"&&object.tag_id==Some(id)).map(|object|object.position).collect::<Vec<_>>();
        assert!(!positions(&inspection,emitter.id).is_empty());assert_eq!(positions(&compiled,renamed.id),positions(&inspection,emitter.id));
        assert!(renamed.references.iter().any(|reference|reference.class=="lsnd"));
        std::fs::write(root.join("acceptance.json"),serde_json::to_vec_pretty(&serde_json::json!({"complete":true,"mockedTools":false,"build":record,"renamedTag":renamed.path,"originalSourcesUnchanged":true,"nativeAudioPlacementReadback":true,"gameplayVerified":false})).unwrap()).unwrap();
    }
}
