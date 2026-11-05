use spark_core::{geometry_exchange as exchange,library::Library,maps,project::{Asset,Project}};
use std::fs;
fn setup()->(tempfile::TempDir,Library,Project,String){
    let dir=tempfile::tempdir().unwrap();let lib=Library::open(dir.path()).unwrap();let mut p=Project::new("DCC source");let id=uuid::Uuid::new_v4().to_string();
    let assets=lib.project_dir(&p.id).unwrap().join("assets");fs::create_dir_all(&assets).unwrap();let path=assets.join(format!("{id}.obj"));
    fs::write(&path,"v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3\n").unwrap();
    p.assets.push(Asset{id:id.clone(),name:"Triangle".into(),kind:"obj".into(),sha256:maps::hash_file(&path).unwrap(),path,vertices:3,triangles:1,has_uvs:true,materials:vec!["default".into()]});lib.save(&p,None).unwrap();(dir,lib,p,id)
}
#[test]fn review_preserves_original_and_unrelated_project_edits(){
    let(_dir,lib,mut p,id)=setup();let original=fs::read(&p.assets[0].path).unwrap();let fork=exchange::prepare(&lib,&p.id,&id).unwrap();
    assert!(!exchange::review(&lib,&p.id,&fork.handoff.id).unwrap().changed);
    let edited=String::from_utf8(original.clone()).unwrap().replace("v 1 0 0","v 2 0 0");fs::write(&fork.working_path,&edited).unwrap();
    p.title="Concurrent source edit".into();lib.save(&p,None).unwrap();let review=exchange::review(&lib,&p.id,&fork.handoff.id).unwrap();
    assert!(review.changed&&review.complete_uvs);assert_eq!(review.triangles,1);assert_eq!(fs::read(&p.assets[0].path).unwrap(),original);
    assert_eq!(lib.get(&p.id).unwrap().assets.len(),1); // Review is not adoption.
    fs::write(&fork.working_path,"v 0 0 0\nf 999 1 2").unwrap();assert!(exchange::review(&lib,&p.id,&fork.handoff.id).is_err());
    fs::write(&fork.working_path,edited).unwrap();assert!(exchange::review(&lib,&p.id,&fork.handoff.id).is_ok());
}
#[test]fn rejects_foreign_receipts_and_tampered_original_or_baseline(){
    let(_dir,lib,p,id)=setup();let fork=exchange::prepare(&lib,&p.id,&id).unwrap();let other=Project::new("Other");lib.save(&other,None).unwrap();
    assert!(exchange::review(&lib,&other.id,&fork.handoff.id).is_err());assert!(exchange::review(&lib,&p.id,"../foreign").is_err());
    let baseline=fork.working_path.with_file_name("baseline.obj");fs::write(&baseline,"tampered").unwrap();assert!(exchange::review(&lib,&p.id,&fork.handoff.id).is_err());
    fs::copy(&p.assets[0].path,&baseline).unwrap();fs::write(&p.assets[0].path,"changed original").unwrap();assert!(exchange::review(&lib,&p.id,&fork.handoff.id).is_err());
}
