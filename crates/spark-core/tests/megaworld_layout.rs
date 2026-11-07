use spark_core::{megaworld::{Layout,LayoutRegion},project::{self,Project}};
fn layout()->Layout{Layout{schema_version:1,regions:vec![LayoutRegion{region_id:format!("{}:0","a".repeat(64)),cache_sha256:"a".repeat(64),cache_version:609,bsp_index:0,map_name:"timberland".into(),bsp_name:"levels/test/timberland".into(),minimum:[-10.,-5.,-2.],maximum:[10.,5.,4.],translation:[0.;3],yaw_degrees:0.}]}}
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
