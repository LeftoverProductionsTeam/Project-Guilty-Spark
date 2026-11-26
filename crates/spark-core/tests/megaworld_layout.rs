use spark_core::{megaworld::{Layout,LayoutRegion},project::{self,Project}};
fn layout()->Layout{Layout{schema_version:1,regions:vec![LayoutRegion{region_id:format!("{}:0","a".repeat(64)),cache_sha256:"a".repeat(64),cache_version:609,bsp_index:0,map_name:"timberland".into(),bsp_name:"levels/test/timberland".into(),minimum:[-10.,-5.,-2.],maximum:[10.,5.,4.],translation:[0.;3],yaw_degrees:0.,hex_slot:None,underground:false}]}}
#[test]fn layout_save_reopen_preserves_hash_bound_plans_without_invalidating_native_build(){
 let temp=tempfile::tempdir().unwrap();let file=temp.path().join("world.gsproject");let mut p=Project::new("Atlas plan");let before=p.fingerprint().unwrap();
 let legacy=serde_json::to_value(&p).unwrap();assert!(legacy.get("megaworldLayout").is_none());assert!(serde_json::from_value::<Project>(legacy).unwrap().megaworld_layout.is_none());
 p.megaworld_layout=Some(layout());p.megaworld_layout.as_mut().unwrap().regions[0].yaw_degrees=35.;p.megaworld_layout.as_mut().unwrap().regions[0].translation=[120.,45.,0.];
 p.validate().unwrap();assert_eq!(before,p.fingerprint().unwrap());project::save_project(&file,&p).unwrap();let restored=project::load_project(&file).unwrap();assert_eq!(restored.megaworld_layout,p.megaworld_layout);assert_eq!(restored.fingerprint().unwrap(),before);
}
#[test]fn invalid_or_unbounded_plans_are_rejected_before_save(){
 let mut p=Project::new("Invalid Atlas");for bad in 0..7 {let mut l=layout();match bad{0=>l.schema_version=2,1=>l.regions[0].cache_sha256="wrong".into(),2=>l.regions.push(l.regions[0].clone()),3=>l.regions[0].translation[0]=f64::NAN,4=>l.regions[0].minimum[0]=20.,5=>l.regions[0].yaw_degrees=f64::INFINITY,_=>l.regions.resize(65,l.regions[0].clone())};p.megaworld_layout=Some(l);assert!(p.validate().is_err(),"case {bad}");}
 let unknown=serde_json::json!({"schemaVersion":1,"regions":[],"execute":"not an operation"});assert!(serde_json::from_value::<Layout>(unknown).is_err());
}


#[test]
#[ignore = "requires the retained compiled Atlas seam and owned stock CE maps"]
fn compiled_atlas_world_keeps_original_neighbor_frames() {
    use spark_core::{bsp_assembly::{self, BspAssembly}, library::Library};
    use std::path::PathBuf;
    let stock = PathBuf::from(std::env::var_os("SPARK_ATLAS_STOCK").unwrap());
    let compiled = PathBuf::from(std::env::var_os("SPARK_ATLAS_COMPILED").unwrap());
    let recipe = PathBuf::from(std::env::var_os("SPARK_ATLAS_RECIPE").unwrap());
    let value: serde_json::Value = serde_json::from_reader(std::fs::File::open(recipe).unwrap()).unwrap();
    let mut saved: Layout = serde_json::from_value(value["layout"].clone()).unwrap();
    let mut seam: BspAssembly = serde_json::from_value(value["recipe"]["plan"].clone()).unwrap();
    let temp = tempfile::tempdir().unwrap();
    let library = Library::open(temp.path()).unwrap();
    let (original, _) = library.import_map(&stock.join("timberland.map"), Some(&stock)).unwrap();
    let (mut merged, inspection) = library.import_map(&compiled, compiled.parent()).unwrap();
    let (interior, donor) = library.import_map(&stock.join("chillout.map"), Some(&stock)).unwrap();
    seam.atlas_origin = bsp_assembly::legacy_atlas_origin(original.source.as_ref().unwrap(), &saved, &seam);
    assert_eq!(seam.atlas_origin.as_ref(), Some(&saved.regions[0]));
    merged.inherited_bsp_connections.push(seam);
    let mut underground = saved.regions[0].clone();
    underground.cache_sha256 = donor.sha256.clone();
    underground.region_id = format!("{}:0", donor.sha256);
    underground.map_name = donor.header.name.clone();
    underground.minimum = std::array::from_fn(|axis| donor.mesh.positions.chunks_exact(3)
        .map(|v| f64::from(v[axis])).fold(f64::INFINITY, f64::min));
    underground.maximum = std::array::from_fn(|axis| donor.mesh.positions.chunks_exact(3)
        .map(|v| f64::from(v[axis])).fold(f64::NEG_INFINITY, f64::max));
    underground.underground = true;
    underground.hex_slot = Some([-1,1]);
    underground.translation = [-128.,0.,-44.];
    saved.regions.push(underground);
    merged.megaworld_layout = Some(saved);
    let stored = temp.path().join("merged.gsproject");
    project::save_project(&stored, &merged).unwrap();
    let loaded = project::load_project(&stored).unwrap();
    let regions = &loaded.megaworld_layout.as_ref().unwrap().regions;
    let prepare = |from, to| bsp_assembly::plan_from_atlas(&loaded, &inspection, &interior, &donor,
        from, to, PathBuf::new(), false);
    let passage = prepare(&regions[0], &regions[2]).unwrap();
    assert_eq!(passage.translation, [-128.,0.,-44.]);
    assert_eq!(passage.atlas_origin.as_ref(), Some(&regions[0]));
    assert!(passage.tunnel_points[0][0] < 0.);
    bsp_assembly::verify_atlas_plan(&loaded, &inspection, &passage).unwrap();
    let mut displaced = passage.clone();
    displaced.translation[0] += 1.;
    assert!(bsp_assembly::verify_atlas_plan(&loaded, &inspection, &displaced).is_err());
    let mut uncovered = passage.clone();
    uncovered.open_road = true;
    assert!(bsp_assembly::verify_atlas_plan(&loaded, &inspection, &uncovered).is_err());
    let mut unlinked = loaded.clone();
    unlinked.megaworld_layout.as_mut().unwrap().regions[2].hex_slot = Some([-2,2]);
    assert!(bsp_assembly::verify_atlas_plan(&unlinked, &inspection, &passage).is_err());
    let mut moved = regions[0].clone();
    moved.translation[1] += 1.;
    assert!(prepare(&moved, &regions[2]).unwrap_err().to_string().contains("differs from the compiled map"));
}

#[test]
#[ignore = "requires owned stock CE map files"]
fn saved_atlas_edge_reconstructs_stock_timberland_sidewinder_terrain() {
    use spark_core::{bsp_assembly, library::Library, maps};
    use std::{path::{Path, PathBuf}, sync::atomic::AtomicBool};
    let stock = PathBuf::from(std::env::var_os("SPARK_ATLAS_STOCK").expect("owned CE maps directory"));
    let output = tempfile::tempdir().unwrap();
    let library = Library::open(output.path()).unwrap();
    let (mut base, a) = library.import_map(&stock.join("timberland.map"), Some(&stock)).unwrap();
    let (donor, b) = library.import_map(&stock.join("sidewinder.map"), Some(&stock)).unwrap();
    let accepted = bsp_assembly::plan_terrain(&base, &a, &donor, &b, 0, PathBuf::new()).unwrap();
    let mut saved = layout();
    let source = |map: &maps::MapInspection, slot, translation| {
        let mut row = layout().regions.remove(0);
        row.region_id = format!("{}:0", map.sha256);
        row.cache_sha256 = map.sha256.clone();
        row.map_name.clone_from(&map.header.name);
        row.hex_slot = Some(slot);
        row.translation = translation;
        row
    };
    saved.regions = vec![source(&a,[0,0],[8.,5.,2.]),
        source(&b,[1,0],std::array::from_fn(|i| accepted.translation[i]+[8.,5.,2.][i]))];
    let from = saved.regions[0].region_id.clone();
    let to = saved.regions[1].region_id.clone();
    base.megaworld_layout = Some(saved);
    let stored = output.path().join("atlas.gsproject");
    project::save_project(&stored, &base).unwrap();
    let loaded = project::load_project(&stored).unwrap();
    let (start, end) = loaded.megaworld_layout.as_ref().unwrap().connection(&from,&to).unwrap();
    let draft = bsp_assembly::plan_from_atlas(&loaded,&a,&donor,&b,start,end,PathBuf::new(),true).unwrap();
    assert!(draft.terrain_seam.is_some() && draft.include_donor_scenery);
    for i in 0..3 { assert!((draft.translation[i]-accepted.translation[i]).abs()<1e-7); }
    let original = loaded.source.as_ref().unwrap();
    assert_eq!(draft.atlas_origin.as_ref(), Some(start));
    assert_eq!(bsp_assembly::legacy_atlas_origin(original, loaded.megaworld_layout.as_ref().unwrap(), &accepted).as_ref(), Some(start));
    let source = &original.preserved_path;
    let mesh = bsp_assembly::generate(source,&a,&draft,&AtomicBool::new(false)).unwrap();
    assert!(mesh.report.output_triangles>0 && mesh.report.walk_samples>0);
    assert_eq!(maps::hash_file(&stock.join(Path::new("timberland.map"))).unwrap(),a.sha256);
    assert_eq!(maps::hash_file(&stock.join(Path::new("sidewinder.map"))).unwrap(),b.sha256);
}
