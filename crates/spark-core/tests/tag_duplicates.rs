mod common;
use spark_core::{
    library::Library,
    project::Project,
    tag_duplicates::{self, TagDuplicate},
};
#[test]
fn duplication_is_a_native_build_input_and_rejects_aliases_or_special_roots() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("campaign.map");
    let mut bytes = common::fixture(13);
    common::put_u16(&mut bytes, 0x60, 0);
    std::fs::write(&path, bytes).unwrap();
    let lib = Library::open(&dir.path().join("library")).unwrap();
    let (mut project, inspection) = lib.import_map(&path, None).unwrap();
    let before = project.fingerprint().unwrap();
    project.tag_duplicates.push(TagDuplicate {
        id: uuid::Uuid::new_v4().to_string(),
        source_tag_id: 0xe0000002,
        owner_tag_id: 0xe0000001,
        path: "spark/campaign/custom_bullet".into(),
    });
    project.validate().unwrap();
    tag_duplicates::validate_source(&project, &inspection).unwrap();
    assert_ne!(project.fingerprint().unwrap(), before);
    let roundtrip: Project =
        serde_json::from_slice(&serde_json::to_vec(&project).unwrap()).unwrap();
    assert_eq!(roundtrip.tag_duplicates.len(), 1);
    project.tag_duplicates[0].path = "WEAPONS/bullet/bullet".into();
    assert!(tag_duplicates::validate_source(&project, &inspection).is_err());
    project.tag_duplicates[0].path = "spark/campaign/copy".into();
    project.tag_duplicates[0].source_tag_id = 0xe0000000;
    assert!(tag_duplicates::validate_source(&project, &inspection).is_err());
    for bad in ["../escape", "/absolute", "C:/escape", "bad?path", "good/"] {
        project.tag_duplicates[0].path = bad.into();
        assert!(project.validate().is_err(), "{bad}");
    }
    project.tag_duplicates.clear();
    assert_eq!(project.fingerprint().unwrap(), before);
}
