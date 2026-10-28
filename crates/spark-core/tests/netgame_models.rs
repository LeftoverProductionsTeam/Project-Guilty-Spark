mod common;
use common::*;
use spark_core::{maps,project::{self,Project,Source}};
#[test]
fn source_pickups_keep_collection_identity_and_patch_only_their_position_and_yaw(){
    let mut bytes=fixture(7);fourcc(&mut bytes,0x828+3*32,"itmc");
    put_u32(&mut bytes,0x2600,1);put_u32(&mut bytes,0x2604,pointer(7,0x4000));
    fourcc(&mut bytes,0x4000+36,"weap");put_u32(&mut bytes,0x4000+48,0xe0000001);
    put_u32(&mut bytes,0x1384,1);put_u32(&mut bytes,0x1388,pointer(7,0x4100));
    put_f32(&mut bytes,0x4140,12.);put_f32(&mut bytes,0x4144,-8.);put_f32(&mut bytes,0x4148,3.);put_f32(&mut bytes,0x414c,0.5);
    fourcc(&mut bytes,0x4150,"itmc");put_u32(&mut bytes,0x415c,0xe0000003);
    let dir=tempfile::tempdir().unwrap();let file=dir.path().join("fixture.map");std::fs::write(&file,&bytes).unwrap();
    let inspection=maps::inspect_map(&file,None).unwrap();let original=inspection.objects.iter().find(|o|o.kind=="Netgame item").unwrap();
    assert_eq!(original.tag_id,Some(0xe0000003));assert_eq!(original.position,[12.,-8.,3.]);
    let mut p=Project::new("Pickup source");p.source=Some(Source{original_path:file.clone(),preserved_path:file.clone(),sha256:inspection.sha256.clone(),
        cache_version:7,engine:"Halo PC".into(),scenario_path:inspection.scenario_path.clone(),archive:None,resource_directory:None,resource_sha256:Default::default()});p.scene=inspection.objects.clone();
    let object=p.scene.iter_mut().find(|o|o.kind=="Netgame item").unwrap();object.position[0]=15.;object.rotation[0]=1.;
    let patched=project::patched_cache(&p,&inspection).unwrap();assert_eq!(&patched[0x4150..0x4160],&bytes[0x4150..0x4160]);
    assert_eq!(&patched[0x414c..0x4150],&1f32.to_le_bytes());assert_eq!(&patched[0x4140..0x4144],&15f32.to_le_bytes());
    p.scene.iter_mut().find(|o|o.kind=="Netgame item").unwrap().rotation[1]=0.5;assert!(project::patched_cache(&p,&inspection).is_err());
    assert_eq!(std::fs::read(file).unwrap(),bytes);
}
