use spark_core::quickforge::{self, BrushKind, ForgeMesh};

fn arena() -> quickforge::QuickForgeDocument {
    quickforge::create_arena("Guilty Spark Test Arena", "smallIndoorArena").unwrap()
}
fn has(doc: &quickforge::QuickForgeDocument, code: &str) -> bool {
    quickforge::validate(doc)
        .unwrap()
        .issues
        .iter()
        .any(|i| i.code == code)
}
fn signed_volume(mesh: &ForgeMesh, start: usize, count: usize) -> f64 {
    mesh.indices[start..start + count]
        .as_chunks::<3>().0.iter()
        .map(|t| {
            let v = t
                .iter()
                .map(|i| {
                    let p = &mesh.positions[*i as usize * 3..*i as usize * 3 + 3];
                    [p[0] as f64, p[1] as f64, p[2] as f64]
                })
                .collect::<Vec<_>>();
            (v[0][0] * (v[1][1] * v[2][2] - v[1][2] * v[2][1])
                + v[0][1] * (v[1][2] * v[2][0] - v[1][0] * v[2][2])
                + v[0][2] * (v[1][0] * v[2][1] - v[1][1] * v[2][0]))
                / 6.
        })
        .sum()
}
#[test]
fn arena_is_closed_inward_shell_with_outward_solids() {
    let doc = arena();
    let report = quickforge::validate(&doc).unwrap();
    assert!(report.valid, "{:?}", report.issues);
    assert_eq!(report.triangles, 68);
    assert_eq!(doc.spawns.len(), 4);
    let mesh = quickforge::preview_mesh(&doc).unwrap();
    for (i, p) in mesh.parts.iter().enumerate() {
        let volume = signed_volume(&mesh, p.index_start, p.index_count);
        assert!(
            if i == 0 { volume < 0. } else { volume > 0. },
            "{}: {volume}",
            p.brush_id
        );
    }
}
#[test]
fn stairs_and_rotations_preserve_manifold_winding() {
    for steps in [1, 4, 64] {
        let mut doc = arena();
        doc.geometry.truncate(2);
        let b = &mut doc.geometry[1];
        b.kind = BrushKind::Stairs;
        b.steps = steps;
        b.rotation = [0.01, 0.02, 0.3];
        b.position = [0., 2., 2.];
        let mesh = quickforge::preview_mesh(&doc).unwrap();
        assert!(quickforge::validate_mesh(&mesh).is_empty());
        let p = &mesh.parts[1];
        let volume = signed_volume(&mesh, p.index_start, p.index_count);
        assert!(volume > 0.);
        let expected = 3. * 6. * 2. * (steps as f64 + 1.) / (2. * steps as f64);
        assert!((volume - expected).abs() < 0.0001, "{volume} != {expected}");
    }
}
#[test]
fn topology_diagnostics_reject_open_degenerate_and_invalid_meshes() {
    let mesh = quickforge::preview_mesh(&arena()).unwrap();
    let mut open = mesh.clone();
    open.indices.truncate(open.indices.len() - 3);
    assert!(quickforge::validate_mesh(&open)
        .iter()
        .any(|i| i.code == "OPEN_EDGES"));
    let mut duplicate = mesh.clone();
    duplicate.indices.extend_from_slice(&mesh.indices[..3]);
    assert!(quickforge::validate_mesh(&duplicate)
        .iter()
        .any(|i| i.code == "NON_MANIFOLD"));
    let mut degenerate = mesh.clone();
    degenerate.indices[1] = degenerate.indices[0];
    assert!(quickforge::validate_mesh(&degenerate)
        .iter()
        .any(|i| i.code == "DEGENERATE_TRIANGLE"));
    let mut index = mesh;
    index.indices[0] = u32::MAX;
    assert!(quickforge::validate_mesh(&index)
        .iter()
        .any(|i| i.code == "INVALID_INDEX"));
}
#[test]
fn unsafe_placement_overlap_and_unsealed_world_are_actionable() {
    let mut doc = arena();
    doc.geometry.remove(0);
    assert!(has(&doc, "SEALED_ROOM_REQUIRED"));
    let mut doc = arena();
    doc.geometry[2].position = doc.geometry[3].position;
    assert!(has(&doc, "BRUSH_OVERLAP"));
    let mut doc = arena();
    doc.spawns[0].position = doc.geometry[2].position;
    assert!(has(&doc, "SPAWN_SOLID_COLLISION"));
    let mut doc = arena();
    doc.geometry[1].position[0] = 50.;
    assert!(has(&doc, "BRUSH_OUTSIDE_ROOM"));
    let mut doc = arena();
    doc.geometry[0].material_id = "missing".into();
    assert!(has(&doc, "MISSING_MATERIAL"));
}
#[test]
fn document_persistence_and_identity_include_geometry_and_provenance() {
    let doc = arena();
    let round: quickforge::QuickForgeDocument =
        serde_json::from_slice(&serde_json::to_vec(&doc).unwrap()).unwrap();
    assert_eq!(doc, round);
    let hash = quickforge::validate(&doc).unwrap().source_sha256;
    let mut changed = doc.clone();
    changed.geometry[1].dimensions[0] += 0.1;
    assert_ne!(hash, quickforge::validate(&changed).unwrap().source_sha256);
    changed.geometry[1].dimensions[0] = f32::NAN;
    assert!(quickforge::validate_document(&changed).is_err());
    changed = doc;
    changed.materials[0].shader_path = Some("..\\outside".into());
    assert!(quickforge::validate_document(&changed).is_err());
}
#[test]
fn sources_are_real_jms_with_hashes_and_explicit_dependencies() {
    let temp = tempfile::tempdir().unwrap();
    let output = temp.path().join("export");
    let doc = arena();
    let receipt = quickforge::export_sources(&doc, &output).unwrap();
    assert_eq!(
        receipt.scenario_path,
        "levels\\quickforge\\guilty_spark_test_arena\\guilty_spark_test_arena"
    );
    assert_eq!(
        spark_core::maps::hash_file(&receipt.jms_path).unwrap(),
        receipt.jms_sha256
    );
    assert_eq!(receipt.blockers.len(), 2);
    assert!(quickforge::export_sources(&doc, &output).is_err());
    let jms = std::fs::read_to_string(receipt.jms_path).unwrap();
    let mut lines = jms.lines();
    assert_eq!(lines.next(), Some("8200"));
    assert_eq!(lines.next(), Some("0"));
    assert_eq!(lines.next(), Some("1"));
    assert_eq!(lines.next(), Some("frame"));
    for _ in 0..4 {
        lines.next().unwrap();
    }
    let materials: usize = lines.next().unwrap().parse().unwrap();
    assert_eq!(materials, 1);
    for _ in 0..materials * 2 {
        lines.next().unwrap();
    }
    assert_eq!(lines.next(), Some("0"));
    assert_eq!(lines.next(), Some("1"));
    assert_eq!(lines.next(), Some("__unnamed"));
    let count: usize = lines.next().unwrap().parse().unwrap();
    assert_eq!(count, 204);
    let mesh = quickforge::preview_mesh(&doc).unwrap();
    for i in 0..count {
        assert_eq!(lines.next(), Some("0"));
        let xyz = lines
            .next()
            .unwrap()
            .split_whitespace()
            .map(|s| s.parse::<f32>().unwrap())
            .collect::<Vec<_>>();
        for (j, v) in xyz.iter().enumerate() {
            assert!((*v / 100. - mesh.positions[i * 3 + j]).abs() < 0.0001);
        }
        for _ in 0..6 {
            lines.next().unwrap();
        }
    }
    let triangles: usize = lines.next().unwrap().parse().unwrap();
    assert_eq!(triangles, 68);
    for _ in 0..triangles {
        assert_eq!(lines.next(), Some("0"));
        assert_eq!(lines.next(), Some("0"));
        let indices = lines
            .next()
            .unwrap()
            .split_whitespace()
            .map(|s| s.parse::<usize>().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(indices.len(), 3);
        assert!(indices.iter().all(|i| *i < count));
    }
    assert!(lines.next().is_none());
}
#[test]
fn mode_templates_provide_required_starts_and_objectives() {
    let ctf = quickforge::create_arena("CTF", "symmetricalCtfArena").unwrap();
    assert!(quickforge::validate(&ctf).unwrap().valid);
    assert_eq!(ctf.objectives.len(), 2);
    let blank = quickforge::create_arena("Blank", "customBlank").unwrap();
    assert!(!quickforge::validate(&blank).unwrap().valid);
    let mut doc = arena();
    doc.build_quality = "final".into();
    let plan = quickforge::scenario_commands(&doc).unwrap();
    let lightmaps = plan.last().unwrap();
    assert_eq!(&lightmaps.args[3..], ["1", "0.01"]);
}
