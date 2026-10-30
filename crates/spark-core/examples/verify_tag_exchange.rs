//! Real recursive extraction and isolated import-staging acceptance helper.
//! Reads owner-installed tools/maps; never writes the original map/tagset.
use spark_core::{maps,project::{self,Project,Source},tag_exchange,build::Toolchain};
use std::{path::Path,sync::{Arc,atomic::AtomicBool}};
fn main()->Result<(),Box<dyn std::error::Error>>{
    let args:Vec<_>=std::env::args().collect();if args.len()!=6{return Err("Usage: verify_tag_exchange <owned map> <resources> <installed invader> <fresh managed root> <tag path>".into());}
    let map=Path::new(&args[1]);let resources=Path::new(&args[2]);let root=Path::new(&args[4]);
    if root.exists(){return Err("Choose a fresh managed acceptance folder".into());}std::fs::create_dir_all(root)?;
    let inspection=maps::inspect_map(map,Some(resources))?;
    let tag=inspection.tags.iter().find(|t|t.class=="weap"&&t.path.replace('\\',"/").eq_ignore_ascii_case(&args[5].replace('\\',"/"))).ok_or("Exact source weapon tag unavailable")?;
    let mut project=Project::new("Recursive source acceptance");project.source=Some(Source{audio_resources:None,original_path:map.into(),preserved_path:map.into(),sha256:inspection.sha256.clone(),
        cache_version:inspection.header.version,engine:inspection.header.engine.clone(),scenario_path:inspection.scenario_path.clone(),archive:None,
        resource_directory:Some(resources.into()),resource_sha256:project::resource_hashes(resources)?});project.scene=inspection.objects.clone();
    let tools=Toolchain{invader_directory:Some((&args[3]).into()),resource_directory:Some(resources.into()),..Toolchain::default()};let job=uuid::Uuid::new_v4().to_string();
    let extraction=tag_exchange::extract_selected_tag(&project,&inspection,&tools,root,&job,tag.id,Arc::new(AtomicBool::new(false)),|_|{})?;
    let mut target=project.clone();target.id=uuid::Uuid::new_v4().to_string();target.title="Isolated import acceptance".into();
    let staged=tag_exchange::stage_into_project(&target,root,&job,&uuid::Uuid::new_v4().to_string())?;
    if maps::hash_file(map)?!=inspection.sha256{return Err("Original source changed".into());}
    println!("{}",serde_json::to_string_pretty(&serde_json::json!({"sourceSha256":inspection.sha256,"requestedTag":extraction.requested_tag,"extractedFiles":extraction.files.len(),
        "importedFiles":staged.file_count,"totalBytes":staged.total_bytes,"status":staged.status,"sourceUnchanged":true,"engineLoadVerified":false}))?);Ok(())
}
