mod common;
use spark_core::{maps, multiplayer::*, runtime::*, steam};
use std::fs;

fn hash(c: char) -> String {
    std::iter::repeat_n(c, 64).collect()
}
fn peer() -> PeerManifest {
    PeerManifest {
        schema_version: MANIFEST_SCHEMA_VERSION,
        adapter_version: ADAPTER_VERSION,
        runtime_id: RuntimeId::ChupathingyCe,
        platform: "windows".into(),
        runtime_build: Some("0.8.1".into()),
        network_version: Some("32".into()),
        executable_sha256: Some(hash('a')),
        mode: SessionMode::NativeMultiplayer,
        anti_cheat_disabled: None,
        map: PeerMapIdentity {
            sha256: hash('b'),
            cache_version: 609,
            scenario_type: 1,
        },
        resources: ["bitmaps.map", "sounds.map", "loc.map"]
            .into_iter()
            .map(|name| PeerResourceIdentity {
                name: name.into(),
                sha256: Some(hash('c')),
                required: true,
            })
            .collect(),
        package_sha256: None,
        source_sha256: Some(hash('d')),
        build_tool_version: Some("invader-test".into()),
        build_verified: true,
        resource_set_verified: true,
        gameplay: None,
    }
}
#[test]
fn gameplay_identity_and_player_limits_are_compared_without_a_network_claim() {
    let mut local=peer();local.gameplay=Some(PeerGameplay{game_mode:"firefight".into(),expected_players:4,configuration_sha256:Some(hash('e'))});
    let mut remote=local.clone();remote.gameplay.as_mut().unwrap().configuration_sha256=Some(hash('f'));
    let report=compare(&local,&remote).unwrap();assert_eq!(report.status,TestStatus::Fail);assert!(!report.gameplay_verified);
    remote=local.clone();remote.gameplay.as_mut().unwrap().expected_players=3;assert_eq!(compare(&local,&remote).unwrap().status,TestStatus::Fail);
    local.runtime_id=RuntimeId::MccSteam;local.mode=SessionMode::MccCoopCampaign;
    assert!(validate_manifest(&local).is_err());
}
fn registration(root: &std::path::Path) -> RuntimeRegistration {
    let executable = root.join(if cfg!(windows) { "halo.exe" } else { "halo" });
    let signature: &[u8] = if cfg!(windows) {
        b"MZ\0\0unit-test-not-a-game"
    } else if cfg!(target_os = "macos") {
        b"\xcf\xfa\xed\xfeunit-test-not-a-game"
    } else {
        b"\x7fELFunit-test-not-a-game"
    };
    fs::write(&executable, signature).unwrap();
    RuntimeRegistration {
        id: "test-registration".into(),
        runtime_id: RuntimeId::ChupathingyCe,
        root: root.into(),
        executable,
        data_root: None,
        version: Some("test-build".into()),
        network_version: Some("32".into()),
    }
}

#[test]
fn manifest_agreement_is_never_gameplay_or_network_proof() {
    let manifest = peer();
    let report = compare(&manifest, &manifest).unwrap();
    assert_eq!(report.status, TestStatus::Pass);
    assert_eq!(report.scope, "manifestComparisonOnly");
    assert!(!report.gameplay_verified);
    assert!(report
        .diagnostics
        .iter()
        .any(|s| s.contains("self-reported")));
    let json = export_manifest(&manifest).unwrap();
    let parsed = parse_manifest(&json).unwrap();
    assert_eq!(parsed.map.sha256, manifest.map.sha256);
    for private_field in [
        "root",
        "executable",
        "dataRoot",
        "originalPath",
        "username",
        "account",
        "ipAddress",
    ] {
        assert!(!serde_json::from_str::<serde_json::Value>(&json)
            .unwrap()
            .as_object()
            .unwrap()
            .contains_key(private_field));
    }
}
#[test]
fn peer_import_rejects_private_extra_fields_and_nested_payloads() {
    let value = serde_json::to_value(peer()).unwrap();
    for field in ["path", "account", "ipAddress"] {
        let mut bad = value.clone();
        bad[field] = "private".into();
        assert!(parse_manifest(&bad.to_string()).is_err());
    }
    let mut nested = value.clone();
    nested["map"]["path"] = "C:/Users/private/map.map".into();
    assert!(parse_manifest(&nested.to_string()).is_err());
    let mut version_path = peer();
    version_path.runtime_build = Some("C:/Users/private".into());
    assert!(export_manifest(&version_path).is_err());
    assert!(parse_manifest(&" ".repeat(MAX_MANIFEST_BYTES + 1)).is_err());
}
#[test]
fn versions_hashes_duplicates_and_resource_completeness_are_enforced() {
    let local = peer();
    let mut changed = local.clone();
    changed.runtime_build = None;
    assert_eq!(
        compare(&local, &changed).unwrap().status,
        TestStatus::Blocked
    );
    changed = local.clone();
    changed.network_version = None;
    assert_eq!(
        compare(&local, &changed).unwrap().status,
        TestStatus::Blocked
    );
    changed = local.clone();
    changed.map.sha256 = hash('e');
    assert_eq!(compare(&local, &changed).unwrap().status, TestStatus::Fail);
    changed = local.clone();
    changed.resources[0].sha256 = None;
    assert_eq!(
        compare(&local, &changed).unwrap().status,
        TestStatus::Blocked
    );
    changed = local.clone();
    changed.resources[0].sha256 = Some(hash('f'));
    assert_eq!(compare(&local, &changed).unwrap().status, TestStatus::Fail);
    changed = local.clone();
    changed.build_verified = false;
    assert_eq!(
        compare(&local, &changed).unwrap().status,
        TestStatus::Blocked
    );
    changed = local.clone();
    changed.resource_set_verified = false;
    assert_eq!(
        compare(&local, &changed).unwrap().status,
        TestStatus::Blocked
    );
    changed = local.clone();
    changed.resources[1].name = changed.resources[0].name.clone();
    assert!(validate_manifest(&changed).is_err());
    changed = local.clone();
    changed.schema_version = 9;
    assert!(validate_manifest(&changed).is_err());
    changed = local;
    changed.map.sha256 = "fake".into();
    assert!(validate_manifest(&changed).is_err());
}
#[test]
fn cross_platform_hashes_are_not_false_protocol_mismatches() {
    let local = peer();
    let mut other = local.clone();
    other.platform = "linux".into();
    other.executable_sha256 = Some(hash('f'));
    let report = compare(&local, &other).unwrap();
    assert_eq!(report.status, TestStatus::Pass);
    assert!(!report.gameplay_verified);
    other.platform = "windows".into();
    assert_eq!(compare(&local, &other).unwrap().status, TestStatus::Fail);
    other = local.clone();
    other.runtime_id = RuntimeId::OpenCe;
    assert_eq!(compare(&local, &other).unwrap().status, TestStatus::Blocked);
    let mut open = local;
    open.runtime_id = RuntimeId::OpenCe;
    open.platform = "macos".into();
    assert_eq!(compare(&open, &open).unwrap().status, TestStatus::Blocked);
}
#[test]
fn mcc_mode_and_eac_declarations_do_not_attest_the_game_process() {
    let mut manifest = peer();
    manifest.runtime_id = RuntimeId::MccSteam;
    manifest.mode = SessionMode::MccCoopCampaign;
    manifest.map.cache_version = 13;
    manifest.map.scenario_type = 0;
    manifest.package_sha256 = Some(hash('f'));
    assert_eq!(
        compare(&manifest, &manifest).unwrap().status,
        TestStatus::Blocked
    );
    manifest.anti_cheat_disabled = Some(true);
    let result = compare(&manifest, &manifest).unwrap();
    assert_eq!(result.status, TestStatus::Pass);
    assert!(!result.gameplay_verified);
    assert!(result
        .checks
        .iter()
        .find(|c| c.key == "antiCheatDeclaration")
        .unwrap()
        .detail
        .contains("self-reported"));
    manifest.mode = SessionMode::MccCustomMultiplayer;
    manifest.map.scenario_type = 1;
    let custom = compare(&manifest, &manifest).unwrap();
    assert_eq!(custom.status, TestStatus::Pass);
    let ai = custom
        .checks
        .iter()
        .find(|c| c.key == "aiSynchronization")
        .unwrap();
    assert_eq!(ai.status, TestStatus::Untested);
    assert!(ai.detail.contains("not implemented"));
    manifest.mode = SessionMode::MccCoopCampaign;
    manifest.map.scenario_type = 1;
    assert_eq!(
        compare(&manifest, &manifest).unwrap().status,
        TestStatus::Fail
    );
}
#[test]
fn read_only_registration_inventory_and_launch_plan_preserve_files() {
    let temp = tempfile::tempdir().unwrap();
    let registration = registration(temp.path());
    fs::create_dir(temp.path().join("maps_ce")).unwrap();
    common::write_map(&temp.path().join("maps_ce/fixture.map"), 609);
    fs::write(temp.path().join("maps_ce/bitmaps.map"), b"unit resource").unwrap();
    fs::write(temp.path().join("maps_ce/broken.map"), b"not a map").unwrap();
    let before_exe = fs::read(&registration.executable).unwrap();
    let before_map = maps::hash_file(&temp.path().join("maps_ce/fixture.map")).unwrap();
    let installation = inspect_registration(&registration).unwrap();
    assert_eq!(installation.identity, "userDeclared");
    let inventory = inventory_maps(&registration).unwrap();
    assert_eq!(inventory.maps.len(), 2);
    assert!(
        !inventory
            .maps
            .iter()
            .find(|m| m.relative_path.ends_with("broken.map"))
            .unwrap()
            .valid
    );
    assert_eq!(
        inventory.resources[0].sha256,
        Some(maps::hash_file(&temp.path().join("maps_ce/bitmaps.map")).unwrap())
    );
    let plan = prepare_launch(&registration).unwrap();
    assert!(plan.args.is_empty());
    assert!(!plan.direct_map_launch);
    assert_eq!(fs::read(&registration.executable).unwrap(), before_exe);
    assert_eq!(
        maps::hash_file(&temp.path().join("maps_ce/fixture.map")).unwrap(),
        before_map
    );
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 2);
}
#[test]
fn registrations_reject_scripts_escape_and_preservation_only_profiles() {
    let temp = tempfile::tempdir().unwrap();
    let mut registration = registration(temp.path());
    registration.runtime_id = RuntimeId::MacDemo;
    assert!(inspect_registration(&registration).is_err());
    registration.runtime_id = RuntimeId::MccSteam;
    assert!(inspect_registration(&registration).is_err());
    registration.runtime_id = RuntimeId::ChupathingyCe;
    fs::write(&registration.executable, b"#!/bin/sh\necho not a game").unwrap();
    assert!(inspect_registration(&registration).is_err());
    let other = tempfile::tempdir().unwrap();
    registration.executable = other.path().join("halo.exe");
    fs::write(&registration.executable, b"MZ\0\0").unwrap();
    assert!(inspect_registration(&registration).is_err());
}
#[test]
fn upstream_and_preservation_descriptors_never_claim_local_ai_verification() {
    let reports = report(&steam::Installation::default(), &[]).unwrap();
    assert_eq!(reports.len(), 10);
    for runtime in &reports {
        assert!(runtime.installation.is_none());
        assert!(runtime
            .capabilities
            .iter()
            .all(|c| c.test_status != TestStatus::Pass));
        if runtime.id.is_native() {
            let ai = runtime
                .capabilities
                .iter()
                .find(|c| c.key == "networkedAi")
                .unwrap();
            assert_eq!(ai.status, SupportStatus::Supported);
            assert_eq!(ai.evidence, EvidenceKind::UpstreamSource);
            assert_eq!(ai.test_status, TestStatus::Untested);
        }
    }
    for id in [
        RuntimeId::MacRetail,
        RuntimeId::MacDemo,
        RuntimeId::HaloPcTrial,
        RuntimeId::HaloMd,
        RuntimeId::HaloXbox,
    ] {
        let row = reports.iter().find(|r| r.id == id).unwrap();
        assert_eq!(
            row.capabilities
                .iter()
                .find(|c| c.key == "launchRuntime")
                .unwrap()
                .status,
            SupportStatus::Unsupported
        );
    }
}
#[test]
fn inventory_preserves_ambiguous_version_seven_and_mcc_is_read_only() {
    let temp = tempfile::tempdir().unwrap();
    let registration = registration(temp.path());
    fs::create_dir(temp.path().join("maps_md")).unwrap();
    common::write_map(&temp.path().join("maps_md/fixture.map"), 7);
    let inventory = inventory_maps(&registration).unwrap();
    assert_eq!(inventory.maps[0].family, "pcMacHaloMd");
    fs::create_dir_all(temp.path().join("halo1/maps")).unwrap();
    common::write_map(&temp.path().join("halo1/maps/fixture.map"), 13);
    let installation = steam::Installation {
        mcc_path: Some(temp.path().into()),
        ..Default::default()
    };
    let before = maps::hash_file(&temp.path().join("halo1/maps/fixture.map")).unwrap();
    assert_eq!(
        inventory_mcc(&installation).unwrap().maps[0].cache_version,
        Some(13)
    );
    assert_eq!(
        maps::hash_file(&temp.path().join("halo1/maps/fixture.map")).unwrap(),
        before
    );
}
#[test]
fn resource_export_hashes_allowlisted_files_without_disclosing_paths() {
    let temp = tempfile::tempdir().unwrap();
    common::write_map(&temp.path().join("fixture.map"), 609);
    fs::write(temp.path().join("bitmaps.map"), b"resource").unwrap();
    let inspection =
        maps::inspect_map(&temp.path().join("fixture.map"), Some(temp.path())).unwrap();
    let resources = resource_identities(&inspection, temp.path()).unwrap();
    assert_eq!(resources.len(), 3);
    assert!(resources[0].sha256.is_some());
    assert!(resources[1].sha256.is_none());
    let json = serde_json::to_string(&resources).unwrap();
    assert!(!json.contains(&temp.path().to_string_lossy().to_string()));
    let declared = peer();
    let context = ManifestContext {
        runtime_id: declared.runtime_id,
        platform: declared.platform,
        runtime_build: declared.runtime_build,
        network_version: declared.network_version,
        executable_sha256: declared.executable_sha256,
        mode: declared.mode,
        anti_cheat_disabled: None,
        package_sha256: None,
        source_sha256: None,
        build_tool_version: declared.build_tool_version,
        build_verified: true,
        resource_set_verified: true,
    };
    let fixture_manifest = create_manifest(&inspection, context, resources).unwrap();
    assert!(!fixture_manifest.build_verified);
    assert!(!fixture_manifest.resource_set_verified);
}
#[test]
fn halo_one_editing_kit_discovery_recognizes_hceek_and_excludes_other_titles() {
    let temp = tempfile::tempdir().unwrap();
    for folder in [
        "HCEEK",
        "Halo Combat Evolved Editing Kit",
        "Halo 2 Editing Kit",
    ] {
        fs::create_dir(temp.path().join(folder)).unwrap();
        fs::write(temp.path().join(folder).join("tool.exe"), b"not executed").unwrap();
    }
    assert!(steam::is_halo1_editing_kit(&temp.path().join("HCEEK")));
    assert!(steam::is_halo1_editing_kit(
        &temp.path().join("Halo Combat Evolved Editing Kit")
    ));
    assert!(!steam::is_halo1_editing_kit(
        &temp.path().join("Halo 2 Editing Kit")
    ));
    #[cfg(windows)]
    {
        assert!(steam::find_steam_launcher(temp.path()).is_none());
        fs::write(temp.path().join("steam.exe"), b"not executed").unwrap();
        assert_eq!(
            steam::find_steam_launcher(temp.path()),
            Some(temp.path().join("steam.exe"))
        );
    }
}
#[test]
fn mcc_build_identity_requires_a_matching_bounded_steam_manifest() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("steamapps/common/MCC");
    fs::create_dir_all(&root).unwrap();
    let installation = steam::Installation {
        mcc_path: Some(root),
        ..Default::default()
    };
    assert_eq!(steam::mcc_build_id(&installation).unwrap(), None);
    let manifest = temp.path().join("steamapps/appmanifest_976730.acf");
    fs::write(
        &manifest,
        "\"AppState\"{\"appid\"\"976730\" \"installdir\"\"MCC\" \"buildid\"\"123456\"}",
    )
    .unwrap();
    assert_eq!(
        steam::mcc_build_id(&installation).unwrap().as_deref(),
        Some("123456")
    );
    fs::write(
        &manifest,
        "\"AppState\"{\"appid\"\"976730\" \"installdir\"\"AnotherGame\" \"buildid\"\"123456\"}",
    )
    .unwrap();
    assert!(steam::mcc_build_id(&installation).is_err());
}
