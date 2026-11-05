mod common;
use spark_core::{build, maps, project::BuildRecord, runtime::RuntimeId, storage::{Limits,Store}};
use std::{fs,path::Path};
fn fixture(root:&Path)->(Store,String,BuildRecord,std::path::PathBuf){
    let source=root.join("build.map");fs::write(&source,common::fixture(13)).unwrap();
    let base=root.join("exports");fs::create_dir(&base).unwrap();
    let store=Store::open(&root.join("storage")).unwrap();let mut limits=Limits::default();limits.minimum_free_bytes=0;store.set_limits(&limits).unwrap();
    (store,uuid::Uuid::new_v4().to_string(),BuildRecord{id:uuid::Uuid::new_v4().to_string(),timestamp:"synthetic".into(),status:"validated".into(),target:"synthetic-mcc-header-only".into(),output:Some(source.clone()),sha256:Some(maps::hash_file(&source).unwrap()),message:"Synthetic structural fixture, never gameplay evidence".into(),project_fingerprint:"synthetic-revision".into()},base)
}
#[test]
fn repeated_export_verifies_one_independent_native_copy_and_refuses_tampering(){
    let root=tempfile::tempdir().unwrap();let(store,id,build,base)=fixture(root.path());
    let first=build::export_map_copy(&store,&id,&build,RuntimeId::MccSteam,&base).unwrap();assert!(!first.reused);
    let before=spark_core::storage::measure(&base).unwrap();
    for _ in 0..20{assert!(build::export_map_copy(&store,&id,&build,RuntimeId::MccSteam,&base).unwrap().reused);}
    assert_eq!(before.logical_bytes,spark_core::storage::measure(&base).unwrap().logical_bytes);
    assert_eq!(fs::read(&first.output).unwrap(),fs::read(build.output.as_ref().unwrap()).unwrap());
    fs::write(&first.output,b"external edit must survive").unwrap();
    assert!(build::export_map_copy(&store,&id,&build,RuntimeId::MccSteam,&base).is_err());
    assert_eq!(fs::read(first.output).unwrap(),b"external edit must survive");
    assert_eq!(maps::hash_file(build.output.as_ref().unwrap()).unwrap(),build.sha256.unwrap());
}
#[test]
fn unsupported_target_changed_source_foreign_export_and_budget_refuse_allocation(){
    let root=tempfile::tempdir().unwrap();let(store,id,mut build,base)=fixture(root.path());
    assert!(build::export_map_copy(&store,&id,&build,RuntimeId::HaloCustomEdition,&base).is_err());assert_eq!(fs::read_dir(&base).unwrap().count(),0);
    let hash=build.sha256.clone();build.sha256=Some("a".repeat(64));assert!(build::export_map_copy(&store,&id,&build,RuntimeId::MccSteam,&base).is_err());build.sha256=hash;
    let mut limits=store.limits().unwrap();limits.per_operation_bytes=1;store.set_limits(&limits).unwrap();
    assert!(build::export_map_copy(&store,&id,&build,RuntimeId::MccSteam,&base).is_err());assert_eq!(fs::read_dir(&base).unwrap().count(),0);
    limits.per_operation_bytes=1024*1024;store.set_limits(&limits).unwrap();
    let output=base.join(format!("Spark-{}",build.id));fs::create_dir(&output).unwrap();fs::write(output.join("unique.txt"),"unique").unwrap();
    assert!(build::export_map_copy(&store,&id,&build,RuntimeId::MccSteam,&base).is_err());assert_eq!(fs::read_to_string(output.join("unique.txt")).unwrap(),"unique");
}
#[test]
fn compatible_ce_exports_share_bytes_without_rewriting_the_cache(){
    let root=tempfile::tempdir().unwrap();let(store,id,mut build,base)=fixture(root.path());
    fs::write(build.output.as_ref().unwrap(),common::fixture(609)).unwrap();build.sha256=Some(maps::hash_file(build.output.as_ref().unwrap()).unwrap());
    let first=build::export_map_copy(&store,&id,&build,RuntimeId::HaloCustomEdition,&base).unwrap();
    for runtime in [RuntimeId::OpenCe,RuntimeId::ChupathingyCe]{let copy=build::export_map_copy(&store,&id,&build,runtime,&base).unwrap();assert!(copy.reused);assert_eq!(copy.output,first.output);assert_eq!(copy.cache_version,609);}
    assert_eq!(fs::read_dir(base).unwrap().filter(|e|e.as_ref().unwrap().file_type().unwrap().is_dir()).count(),1);
}
