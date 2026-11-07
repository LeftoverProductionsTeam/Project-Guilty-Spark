mod common;
use spark_core::{bsp_assembly,library::Library,maps,project};

// Source ownership and history isolation; synthetic reader data is not gameplay.
#[test]
fn a_new_connected_world_preserves_original_document_and_allocates_no_map_copy(){
    let temp=tempfile::tempdir().unwrap();let root=temp.path().join("library");let file=temp.path().join("owned.map");
    let bytes=common::fixture(13);std::fs::write(&file,&bytes).unwrap();
    let library=Library::workspace(&root).unwrap();let (mut base,mut inspection)=library.import_map(&file,None).unwrap();
    base.title="Owner's edited source".into();base.scene[0].name="Original edited object".into();library.save(&base,Some(&inspection)).unwrap();library.save_explicit(&base,Some(&inspection)).unwrap();
    let original=std::fs::read(library.project_dir(&base.id).unwrap().join("project.gsproject")).unwrap();
    inspection.mesh.parts=vec![maps::MeshPart{name:"Synthetic base".into(),index_start:0,index_count:0}];
    let world=bsp_assembly::source_project("New independent world",&base,&inspection).unwrap();
    assert_ne!(world.id,base.id);assert_eq!(world.source.as_ref().unwrap().sha256,inspection.sha256);
    assert_eq!(world.scene[0].name,inspection.objects[0].name);assert_ne!(world.scene[0].name,base.scene[0].name);
    assert!(world.tag_edits.is_empty()&&world.builds.is_empty()&&world.assets.is_empty());
    library.save(&world,Some(&inspection)).unwrap();assert!(!library.is_saved(&world.id).unwrap());
    assert!(!root.join("projects").join(&world.id).exists());
    library.save_explicit(&world,Some(&inspection)).unwrap();
    assert!(!library.project_dir(&world.id).unwrap().join("source.map").exists());drop(library);
    let library=Library::workspace(&root).unwrap();let restored=library.get(&world.id).unwrap();
    assert_eq!(restored.source.as_ref().unwrap().preserved_path,std::fs::canonicalize(&file).unwrap());
    assert_eq!(std::fs::read(library.project_dir(&base.id).unwrap().join("project.gsproject")).unwrap(),original);
    assert_eq!(std::fs::read(&file).unwrap(),bytes);
    assert_ne!(project::load_project(&library.project_dir(&base.id).unwrap().join("project.gsproject")).unwrap().id,restored.id);
}
#[test]
fn stale_source_campaign_and_bad_donor_selection_are_refused_before_new_state(){
    let temp=tempfile::tempdir().unwrap();let file=temp.path().join("owned.map");let bytes=common::fixture(13);std::fs::write(&file,&bytes).unwrap();
    let library=Library::workspace(&temp.path().join("library")).unwrap();let (base,mut inspection)=library.import_map(&file,None).unwrap();
    inspection.mesh.parts=vec![maps::MeshPart{name:"Synthetic base".into(),index_start:0,index_count:0}];
    inspection.header.scenario_type=0;assert!(bsp_assembly::source_project("No campaign masquerade",&base,&inspection).is_err());inspection.header.scenario_type=1;
    assert!(bsp_assembly::plan(&base,&inspection,&base,&inspection,usize::MAX,temp.path().into()).is_err());
    let mut corrupted=bytes;corrupted[400]^=1;std::fs::write(&file,corrupted).unwrap();
    assert!(bsp_assembly::source_project("Stale",&base,&inspection).unwrap_err().to_string().contains("source changed"));assert_eq!(library.list().unwrap().len(),1);
}

#[test]
fn saved_world_resolves_only_its_verified_donor_after_the_ram_document_is_gone(){
    let temp=tempfile::tempdir().unwrap();let file=temp.path().join("owned.map");let bytes=common::fixture(13);std::fs::write(&file,&bytes).unwrap();let root=temp.path().join("library");
    let library=Library::workspace(&root).unwrap();let(donor,_)=library.preview_map(&file,None).unwrap();let mut owner=project::Project::new("Saved world");owner.source=donor.source.clone();owner.bsp_assembly=Some(serde_json::from_value(serde_json::json!({"schemaVersion":1,"donorProjectId":donor.id,"donorTitle":"Saved donor","donorSource":donor.source,"donorTagsDirectory":temp.path(),"donorBspIndex":0,"translation":[20.,0.,0.],"yawDegrees":0.,"tunnelPoints":[[0.,0.,0.],[20.,0.,0.]],"tunnelWidth":2.,"tunnelHeight":1.6,"tunnelShaderPath":"fixture/stone"})).unwrap());library.save(&owner,None).unwrap();library.save_explicit(&owner,None).unwrap();drop(library);
    let library=Library::workspace(&root).unwrap();assert!(library.get(&donor.id).is_err());let restored=library.get(&owner.id).unwrap();let reference=bsp_assembly::referenced_donor(&restored,&donor.id).unwrap().unwrap();
    assert_eq!(reference.source.unwrap().sha256,maps::hash_file(&file).unwrap());assert!(library.get(&donor.id).is_err());assert!(bsp_assembly::referenced_donor(&restored,&owner.id).unwrap().is_none());
    std::fs::write(&file,b"broken external donor").unwrap();assert!(bsp_assembly::referenced_donor(&restored,&donor.id).unwrap_err().to_string().contains("donor source changed"));
}
