mod common;
use spark_core::{library::Library, tag_renames::{self,TagRename}};
#[test]
fn renames_are_native_inputs_and_reject_aliases_without_changing_historical_fingerprints(){
    let dir=tempfile::tempdir().unwrap();let file=dir.path().join("source.map");std::fs::write(&file,common::fixture(13)).unwrap();
    let library=Library::open(&dir.path().join("library")).unwrap();let(mut project,inspection)=library.import_map(&file,None).unwrap();
    let hash=project.fingerprint().unwrap();
    project.tag_renames.push(TagRename{source_tag_id:0xe0000002,path:"custom/my projectile".into()});
    project.validate().unwrap();tag_renames::validate_source(&project,&inspection).unwrap();
    assert_ne!(hash,project.fingerprint().unwrap());
    let roundtrip:spark_core::project::Project=serde_json::from_slice(&serde_json::to_vec(&project).unwrap()).unwrap();assert_eq!(roundtrip.tag_renames.len(),1);
    project.tag_renames[0].path="WEAPONS/bullet/bullet".into();assert!(tag_renames::validate_source(&project,&inspection).is_err());
    project.tag_renames[0].path="../escape".into();assert!(project.validate().is_err());
    project.tag_renames.clear();assert_eq!(hash,project.fingerprint().unwrap());
}
