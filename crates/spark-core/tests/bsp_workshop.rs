use spark_core::{bsp_workshop as w, quickforge as q};
#[test]
fn two_rooms_corridor_and_ramp_export_closed_inward_structure_with_exact_faces() {
    let d = w::example().unwrap();
    let r = q::validate(&d).unwrap();
    assert!(r.valid, "{:?}", r.issues);
    let m = q::preview_mesh(&d).unwrap();
    assert!(r.triangles > 40);
    assert!(m.parts.iter().all(|p| p.face_id.is_some()));
    for id in ["room-a", "room-b", "corridor", "ramp"] {
        assert!(m.parts.iter().any(|p| p.brush_id == id), "{id}");
    }
    let j = q::export_jms(&d).unwrap();
    assert!(j.starts_with("8200\n"));
    let round: q::QuickForgeDocument =
        serde_json::from_slice(&serde_json::to_vec(&d).unwrap()).unwrap();
    assert_eq!(round, d);
    assert_eq!(j, q::export_jms(&round).unwrap());
    assert_eq!(r.source_sha256, q::validate(&round).unwrap().source_sha256);
    let volume: m64::Number = m
        .indices
        .chunks_exact(3)
        .map(|t| {
            let p = t.map_array(&m.positions);
            dot(p[0], cross(p[1], p[2])) / 6.
        })
        .sum();
    assert!(volume < -1000.);
}
// Small independent arithmetic avoids using the Workshop's triangulation code as
// its own normal-orientation oracle.
mod m64 {
    pub type Number = f64;
}
trait Points {
    fn map_array(&self, p: &[f32]) -> [[f64; 3]; 3];
}
impl Points for [u32] {
    fn map_array(&self, p: &[f32]) -> [[f64; 3]; 3] {
        std::array::from_fn(|i| std::array::from_fn(|k| p[self[i] as usize * 3 + k] as f64))
    }
}
fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    (0..3).map(|k| a[k] * b[k]).sum()
}
fn cross(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
#[test]
fn rejects_corrupt_topology_nonfinite_short_edges_bad_material_and_unsafe_spawn() {
    let d = w::example().unwrap();
    for corrupt in 0..9 {
        let mut bad = d.clone();
        let b = &mut bad.workshop.as_mut().unwrap().brushes[0];
        match corrupt {
            0 => {
                b.faces.remove(0);
            }
            1 => b.faces[0].vertices.reverse(),
            2 => b.vertices[0][0] = f64::NAN,
            3 => b.faces[0].vertices[0] = 999,
            4 => b.faces[0].material_id = "missing".into(),
            5 => b.faces[0].uv_scale[0] = 0.,
            6 => b.vertices[0] = b.vertices[1],
            8 => b.id = "start-0".into(),
            _ => b.vertices[0][0] += 0.5,
        }
        assert!(q::validate(&bad).is_err(), "corruption {corrupt}");
        assert_eq!(
            q::export_jms(&d).unwrap(),
            q::export_jms(&d.clone()).unwrap()
        );
    }
    let mut bad = d.clone();
    bad.spawns[0].position = [100., 100., 0.1];
    assert!(!q::validate(&bad).unwrap().valid);
    let mut bad = d;
    bad.geometry.push(
        q::create_arena("old", "smallIndoorArena")
            .unwrap()
            .geometry
            .remove(0),
    );
    assert!(q::validate_document(&bad).is_err());
}
#[test]
fn authored_portal_seals_actual_corridor_and_invalid_plane_never_exports() {
    let mut d = w::example().unwrap();
    d.materials.push(q::ForgeMaterial {
        id: "portal".into(),
        name: "+exactportal".into(),
        shader_path: None,
        color: [0., 1., 1.],
    });
    d.workshop.as_mut().unwrap().portals.push(w::Portal {
        id: "door-a".into(),
        material_id: "portal".into(),
        points: vec![[8., -2., 0.], [8., 2., 0.], [8., 2., 3.], [8., -2., 3.]],
    });
    assert!(q::validate(&d).unwrap().valid);
    assert!(q::export_jms(&d).unwrap().contains("+exactportal"));
    d.workshop.as_mut().unwrap().portals[0].points[0][1] = -1.9;
    assert!(q::export_jms(&d).is_err());
}
#[test]
fn edits_change_identity_failed_export_preserves_previous_good_and_legacy_shape() {
    let temp = tempfile::tempdir().unwrap();
    let d = w::example().unwrap();
    let good = q::export_sources(&d, &temp.path().join("good")).unwrap();
    let bytes = std::fs::read(&good.jms_path).unwrap();
    let mut bad = d.clone();
    bad.workshop.as_mut().unwrap().brushes[0].faces[0]
        .vertices
        .reverse();
    assert!(q::export_sources(&bad, &temp.path().join("bad")).is_err());
    assert!(!temp.path().join("bad").exists());
    assert_eq!(std::fs::read(good.jms_path).unwrap(), bytes);
    let mut edit = d.clone();
    edit.workshop.as_mut().unwrap().brushes[0].faces[0].uv_scale = [2., 3.];
    assert_ne!(
        q::validate(&d).unwrap().source_sha256,
        q::validate(&edit).unwrap().source_sha256
    );
    let legacy = q::create_arena("old", "smallIndoorArena").unwrap();
    assert!(!serde_json::to_string(&legacy).unwrap().contains("workshop"));
    assert!(!serde_json::to_string(&q::preview_mesh(&legacy).unwrap())
        .unwrap()
        .contains("faceId"));
}
#[test]
fn sky_seals_world_and_disconnected_drafts_never_export_as_valid_structure() {
    let mut d = w::example().unwrap();
    d.materials.push(q::ForgeMaterial {
        id: "sky".into(),
        name: "+sky".into(),
        shader_path: None,
        color: [0.2, 0.4, 0.8],
    });
    d.workshop.as_mut().unwrap().brushes[0].faces[1].material_id = "sky".into();
    assert!(q::validate(&d).unwrap().valid);
    assert!(q::export_jms(&d).unwrap().contains("+sky"));
    d.workshop.as_mut().unwrap().brushes[2].position[0] += 30.;
    let report = q::validate(&d).unwrap();
    assert!(!report.valid);
    assert!(report
        .issues
        .iter()
        .any(|i| i.code == "WORKSHOP_DISCONNECTED"));
    assert_eq!(report.closed_components, 2);
    assert!(q::export_jms(&d).is_err());
}
#[test]
fn workshop_keeps_existing_scenario_and_spawn_guards() {
    let mut d = w::example().unwrap();
    d.game_mode = "ctf".into();
    let report = q::validate(&d).unwrap();
    assert!(!report.valid);
    assert!(report.issues.iter().any(|i| i.code == "CTF_SETUP"));
    assert!(q::export_jms(&d).is_err());
    let mut d = w::example().unwrap();
    d.spawns[1].position = d.spawns[0].position;
    let report = q::validate(&d).unwrap();
    assert!(!report.valid);
    assert!(report
        .issues
        .iter()
        .any(|i| i.code == "DUPLICATE_SPAWN_POSITION"));
}
