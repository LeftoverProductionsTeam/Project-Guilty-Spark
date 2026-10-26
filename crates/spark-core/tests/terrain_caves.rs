use spark_core::quickforge::{self, BrushKind, ForgeBrush};
fn primitive(kind: BrushKind, steps: u16) -> ForgeBrush {
    ForgeBrush {
        id: "original".into(), name: "Test".into(), kind,
        position: [0.,0.,0.], rotation: [0.,0.,0.], dimensions: [12.,14.,4.],
        material_id: "surface".into(), visible:true, locked:false, steps,
        heights: vec![],
    }
}
#[test]
fn terrain_has_closed_rebuilt_top_and_sides() {
    let mut doc=quickforge::create_arena("Heightfield", "customBlank").unwrap();
    let mut brush=primitive(BrushKind::Terrain,8);
    brush.heights=vec![0.;81]; brush.heights[40]=1.25;
    doc.geometry.push(brush);
    let mesh=quickforge::preview_mesh(&doc).unwrap();
    assert_eq!(mesh.indices.len()/3, 2*8*8*2 + 8*8);
    assert!(quickforge::validate_mesh(&mesh).is_empty(),"heightfield must be manifold and oriented");
}
#[test]
fn hollow_cave_shell_has_two_passages_and_no_open_mesh_edges() {
    let mut doc=quickforge::create_arena("Hollow cave", "customBlank").unwrap();
    doc.geometry.push(primitive(BrushKind::CaveTunnel,16));
    let mesh=quickforge::preview_mesh(&doc).unwrap();
    assert_eq!(mesh.indices.len()/3,16*8);
    assert!(quickforge::validate_mesh(&mesh).is_empty(),"annular tunnel must be closed mesh despite open traversal ends");
}
#[test]
fn malformed_terrain_is_rejected_without_writing() {
    let mut doc=quickforge::create_arena("Bad data", "customBlank").unwrap();
    let mut b=primitive(BrushKind::Terrain,8);
    b.heights=vec![0.;80]; doc.geometry.push(b);
    assert!(quickforge::validate_document(&doc).is_err());
    doc.geometry[0].heights=vec![0.;81]; doc.geometry[0].heights[20]=-100.;
    assert!(quickforge::validate_document(&doc).is_err());
}

#[test]
fn aligned_tunnels_remove_shared_caps_and_keep_manifold_source() {
    let mut doc=quickforge::create_arena("Joined caves", "customBlank").unwrap();
    let mut first=primitive(BrushKind::CaveTunnel,16);
    first.id="first".into();first.position=[0.,-7.,0.];
    let mut second=first.clone(); second.id="second".into();second.position=[0.,7.,0.];
    doc.geometry.extend([first.clone(),second.clone()]);
    let mesh=quickforge::preview_mesh(&doc).unwrap();
    // 8 tris/step per independent tube, -4 tris/step for shared annular caps.
    assert_eq!(mesh.indices.len()/3,16*12);
    assert!(quickforge::validate_mesh(&mesh).is_empty(),"source seam must be closed and consistently oriented");
    second.position=[0.,8.,0.];doc.geometry[1]=second;
    let separate=quickforge::preview_mesh(&doc).unwrap();
    assert_eq!(separate.indices.len()/3,16*16);
}
#[test]
fn rotated_tunnel_rims_fail_closed_not_fake_weld() {
    let mut doc=quickforge::create_arena("Misaligned caves", "customBlank").unwrap();
    let mut first=primitive(BrushKind::CaveTunnel,12);
    first.id="first".into();first.position=[0.,-7.,0.];
    let mut second=first.clone();second.id="second".into();second.position=[0.,7.,0.];
    second.rotation=[0.,std::f32::consts::PI/12.,0.];
    doc.geometry.extend([first,second]);
    let mesh=quickforge::preview_mesh(&doc).unwrap();
    assert_eq!(mesh.indices.len()/3,12*16);
}
#[test]
fn room_contained_join_is_reported_without_gameplay_proof() {
    let mut doc=quickforge::create_arena("Joined source", "emptyArena").unwrap();
    doc.geometry[0].dimensions=[40.,80.,20.];doc.geometry[0].position=[0.,0.,0.];
    for (id,y) in [("first",-7.),("second",7.)] {
        let mut tube=primitive(BrushKind::CaveTunnel,12);
        tube.id=id.into();tube.position=[0.,y,0.];doc.geometry.push(tube);
    }
    // This is a source seam, not a compiler-complete connected Halo BSP.
    let result=quickforge::validate(&doc).unwrap();
    assert!(result.issues.iter().any(|i| i.code=="TUNNEL_SOURCE_SEAM"));
    assert!(!result.issues.iter().any(|i| i.code=="BRUSH_OVERLAP"));
    assert_eq!(result.closed_components,2); // room shell plus connected tunnel
}

#[test]
fn unverified_cave_to_room_csg_is_a_game_build_blocker() {
    let mut doc=quickforge::create_arena("Source-only caves", "emptyArena").unwrap();
    doc.geometry[0].dimensions=[40.,80.,20.];doc.geometry[0].position=[0.,0.,0.];
    for (id,y) in [("first",-7.),("second",7.)] {
        let mut tunnel=primitive(BrushKind::CaveTunnel,12);
        tunnel.id=id.into();tunnel.position=[0.,y,0.];
        doc.geometry.push(tunnel);
    }
    let temp=tempfile::tempdir().unwrap();
    let export=quickforge::export_sources(&doc,&temp.path().join("safe-source")).unwrap();
    assert!(export.jms_path.is_file(),"owner may export source geometry to a separate workspace");
    assert!(export.blockers.iter().any(|b|b.contains("Cave tunnel source geometry")),
        "unverified room CSG/collision/PVS must block playable build claims");
}

#[test]
fn adjacent_equal_height_terrain_tiles_join_to_one_source_collision_surface() {
    let mut doc=quickforge::create_arena("Welded heightfields", "emptyArena").unwrap();
    let mut a=primitive(BrushKind::Terrain,8);a.id="west".into();a.position=[-6.,0.,0.];
    a.heights=vec![0.;81];
    let mut b=a.clone();b.id="east".into();b.position=[6.,0.,0.];
    for row in 0..=8 {a.heights[row*9+8]=0.5;b.heights[row*9]=0.5;}
    doc.geometry.extend([a,b]);
    let mesh=quickforge::preview_mesh(&doc).unwrap();
    let single=2*8*8*2+8*8;
    let terrain_triangles=mesh.parts.iter().filter(|part|["west","east"].contains(&part.brush_id.as_str())).map(|part|part.index_count/3).sum::<usize>();
    assert_eq!(terrain_triangles,single*2-8*4,"two internal boundary wall strips removed");
    assert_eq!(mesh.indices.len()/3,terrain_triangles+12,"the original enclosing room remains intact");
    assert!(quickforge::validate_mesh(&mesh).is_empty(),"shared source edges must be manifold");
    // It is still a source shell, not a game-tag collision BSP.
}
#[test]
fn mismatched_terrain_edge_heights_refuse_join() {
    let mut doc=quickforge::create_arena("Terrain mismatch", "customBlank").unwrap();
    let mut a=primitive(BrushKind::Terrain,8);a.id="west".into();a.position=[-6.,0.,0.];a.heights=vec![0.;81];
    let mut b=a.clone();b.id="east".into();b.position=[6.,0.,0.]; b.heights[0]=1.;
    doc.geometry.extend([a,b]);
    let mesh=quickforge::preview_mesh(&doc).unwrap();
    let single=2*8*8*2+8*8;
    assert_eq!(mesh.indices.len()/3,single*2,"mismatched heights preserve walls and block a weld");
}
#[test]
fn terrain_join_diagnostics_do_not_claim_gameplay_collision() {
    let mut doc=quickforge::create_arena("Heightfield pair", "emptyArena").unwrap();
    doc.geometry[0].dimensions=[60.,60.,20.];doc.geometry[0].position=[0.,0.,0.];
    for (id,x) in [("west",-6.),("east",6.)] {
        let mut b=primitive(BrushKind::Terrain,8);b.id=id.into();b.position=[x,0.,0.];b.heights=vec![0.;81];
        doc.geometry.push(b);
    }
    let report=quickforge::validate(&doc).unwrap();
    assert!(report.issues.iter().any(|i|i.code=="TERRAIN_SOURCE_SEAM"));
    assert!(!report.issues.iter().any(|i|i.code=="BRUSH_OVERLAP"));
}

#[test]
fn coincident_triangle_in_separate_brush_geometry_fails_closed() {
    let mut doc=quickforge::create_arena("Duplicate collision", "customBlank").unwrap();
    doc.geometry.push(primitive(BrushKind::Box,4));
    let mut mesh=quickforge::preview_mesh(&doc).unwrap();
    // Reuse the positions, UV and normal of the first triangle with new vertex
    // indices. An index-only topology test would miss this duplicate face.
    let originals=mesh.indices[0..3].to_vec();
    let initial=(mesh.positions.len()/3) as u32;
    for original in originals {
        let idx=original as usize;
        let p=mesh.positions[idx*3..idx*3+3].to_vec();
        let n=mesh.normals[idx*3..idx*3+3].to_vec();
        let uv=mesh.uvs[idx*2..idx*2+2].to_vec();
        mesh.positions.extend_from_slice(&p);
        mesh.normals.extend_from_slice(&n);
        mesh.uvs.extend_from_slice(&uv);
    }
    mesh.indices.extend([initial, initial+1, initial+2]);
    let issues=quickforge::validate_mesh(&mesh);
    assert!(issues.iter().any(|i|i.code=="DUPLICATE_COLLISION_FACE"),
        "coordinate-coincident faces must fail in the native validator");
}
