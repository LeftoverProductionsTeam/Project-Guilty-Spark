use spark_core::{source_recovery::readback_summary, tag_exchange::ExtractedFile};
#[test]
fn native_reconstruction_names_cannot_escape_the_output_or_name_devices() {
    assert_eq!(
        spark_core::tag_exchange::extension("mode").unwrap(),
        "model"
    );
    use spark_core::source_recovery::validate_output_names;
    for name in [
        "../escape",
        "..\\escape",
        "C:/original",
        "/absolute",
        "CON",
        "NUL.txt",
        "nested/file",
        "-argument",
    ] {
        assert!(validate_output_names(name).is_err(), "{name}");
    }
    assert!(validate_output_names("__base\nnormal variant\nglobal_scripts\n").is_ok());
}
fn files() -> Vec<ExtractedFile> {
    vec![
        ExtractedFile {
            path: "objects/a.device_machine".into(),
            bytes: 100,
            sha256: "0".repeat(64),
        },
        ExtractedFile {
            path: "objects/a.gbxmodel".into(),
            bytes: 100,
            sha256: "1".repeat(64),
        },
    ]
}
#[test]
fn h1a_compiler_support_never_replaces_authored_globals() {
    let root = tempfile::tempdir().unwrap();
    let path = spark_core::native_logic::ensure_h1a_global_source(root.path()).unwrap();
    assert_eq!(
        std::fs::read(&path).unwrap(),
        b"; Spark generated level: no additional global script definitions.\r\n"
    );
    let authored = b"(global short custom_counter 42)\r\n";
    std::fs::write(&path, authored).unwrap();
    spark_core::native_logic::ensure_h1a_global_source(root.path()).unwrap();
    assert_eq!(std::fs::read(&path).unwrap(), authored);
}
#[test]
fn folder_access_is_separate_from_old_validation_and_cannot_escape_its_owner() {
    use spark_core::source_recovery::{directory, load};
    let root = tempfile::tempdir().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let folder = root.path().join("recoveries").join(&id);
    std::fs::create_dir_all(&folder).unwrap();
    let mut report = serde_json::json!({"schemaVersion":1,"id":id,"directory":folder,"tagsDirectory":folder.join("tags"),"dataDirectory":folder.join("data"),
      "extractionId":uuid::Uuid::new_v4().to_string(),"nativeTags":[],"recoveredData":[],"nativeReadback":{},"dependencyClosure":[],"sourceRecoveryGaps":[],"tools":{},"status":"unverified","reused":false,"nativeCompilationVerified":false,"gameplayVerified":false,"nativeTagFidelity":"native-tag-recovered","dataFidelity":"structural-reconstruction",
      "plan":{"schemaVersion":1,"identity":"0".repeat(64),"projectId":uuid::Uuid::new_v4().to_string(),"sourceSha256":"1".repeat(64),"sourcePath":"original.map","sourceEdition":"test metadata","sourceVersion":13,"tagId":0,"requestedTag":"a.scenery","scope":"unit metadata only","indexedTags":1,"observedDependencies":[],"resources":{},"toolHashes":{},"blockers":[],"limitations":[]}});
    let path = folder.join("recovery-report.json");
    std::fs::write(&path, serde_json::to_vec(&report).unwrap()).unwrap();
    assert_eq!(directory(root.path(), &id).unwrap(), folder);
    assert!(load(root.path(), &id).is_err()); // No native content; never acceptance.
    report["tagsDirectory"] = serde_json::json!(root.path().join("outside"));
    std::fs::write(&path, serde_json::to_vec(&report).unwrap()).unwrap();
    assert!(directory(root.path(), &id).is_err());
    assert!(directory(root.path(), "../outside").is_err());
}
#[test]
fn batch_zero_exit_with_a_missing_or_duplicate_parse_is_not_acceptance() {
    let partial="0x12345678\nSuccessfully edited objects\\a.device_machine\nEdited 1 out of 2 tags (1 error)";
    assert!(readback_summary(partial, &files()).is_err());
    assert!(readback_summary(
        &format!("{partial}\n0x12345678\nSuccessfully edited objects\\a.device_machine"),
        &files()
    )
    .is_err());
    assert!(readback_summary("Successfully edited objects\\a.device_machine", &files()).is_err());
}
#[test]
fn native_readback_requires_exact_paths_and_every_parser_checksum() {
    let output="0x12345678\nSuccessfully edited objects\\a.device_machine\n0x9abcdef0\nSuccessfully edited objects\\a.gbxmodel\nEdited 2 out of 2 tags";
    assert_eq!(readback_summary(output, &files()).unwrap().len(), 2);
    assert!(readback_summary(&output.replace("a.gbxmodel", "other.gbxmodel"), &files()).is_err());
    assert!(readback_summary(&format!("{output}\nERROR: Failed to parse data"), &files()).is_err());
    assert!(readback_summary(
        &output.replace("objects\\a.gbxmodel", "..\\outside.gbxmodel"),
        &files()
    )
    .is_err());
    assert!(readback_summary("", &files()).is_err());
}
