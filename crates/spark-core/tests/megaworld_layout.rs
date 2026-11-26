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
    let source = &loaded.source.as_ref().unwrap().preserved_path;
    let mesh = bsp_assembly::generate(source,&a,&draft,&AtomicBool::new(false)).unwrap();
    assert!(mesh.report.output_triangles>0 && mesh.report.walk_samples>0);
    assert_eq!(maps::hash_file(&stock.join(Path::new("timberland.map"))).unwrap(),a.sha256);
    assert_eq!(maps::hash_file(&stock.join(Path::new("sidewinder.map"))).unwrap(),b.sha256);
}
