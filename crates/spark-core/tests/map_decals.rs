mod common;
use common::*;
use spark_core::maps;

fn decal_fixture(version:u32)->Vec<u8>{
    let mut b=fixture(version);
    fourcc(&mut b,0x828+32,"deca");fourcc(&mut b,0x828+64,"bitm");
    b[0x1800..0x190c].fill(0);
    put_u16(&mut b,0x1800,0x108);put_u16(&mut b,0x1802,3);
    put_u32(&mut b,0x1814,u32::MAX);
    put_f32(&mut b,0x1818,0.5);put_f32(&mut b,0x181c,0.5);
    put_u16(&mut b,0x18c0,3);fourcc(&mut b,0x18d8,"bitm");put_u32(&mut b,0x18e4,0xe0000002);
    put_u32(&mut b,0x13a8,1);put_u32(&mut b,0x13ac,pointer(version,0x4000));
    put_u16(&mut b,0x4000,0);b[0x4002]=(-64i8)as u8;b[0x4003]=0;
    put_f32(&mut b,0x4004,1.);put_f32(&mut b,0x4008,2.);put_f32(&mut b,0x400c,3.);
    put_u32(&mut b,0x13b4,1);put_u32(&mut b,0x13b8,pointer(version,0x4100));
    fourcc(&mut b,0x4100,"deca");put_u32(&mut b,0x410c,0xe0000001);
    b
}
#[test]
fn authored_decals_preserve_exact_bitmap_and_signed_angles_across_pc_family(){
    for version in [6,7,13,609]{
        let dir=tempfile::tempdir().unwrap();let path=dir.path().join("decal.map");let bytes=decal_fixture(version);std::fs::write(&path,&bytes).unwrap();
        let i=maps::inspect_map(&path,None).unwrap();assert_eq!(i.decals.len(),1);
        let d=&i.decals[0];assert_eq!(d.decal_tag_id,0xe0000001);assert_eq!(d.bitmap_tag_id,0xe0000002);
        assert_eq!(d.position,[1.,2.,3.]);assert_eq!((d.yaw,d.pitch),(-64,0));assert_eq!(d.radius,0.5);
        assert_eq!(d.intensity,1.);assert_eq!(d.color,[1.;3]);assert_eq!(d.blend,3);assert_eq!(std::fs::read(&path).unwrap(),bytes);
    }
}
#[test]
fn compiled_cluster_decals_replace_the_scenario_copy_and_keep_bsp_identity(){
    let version=7;let mut b=decal_fixture(version);
    put_u32(&mut b,0x15a4,1);put_u32(&mut b,0x15a8,pointer(version,0x4300));
    put_u32(&mut b,0x4300,0x4400);put_u32(&mut b,0x4304,0x1000);put_u32(&mut b,0x4308,0x60000000);
    put_u32(&mut b,0x4400,0x60000020);put_u32(&mut b,0x4420+0x258,1);put_u32(&mut b,0x4420+0x25c,0x60000400);
    put_f32(&mut b,0x4800,1.);put_f32(&mut b,0x4804,2.);put_f32(&mut b,0x4808,3.);put_u16(&mut b,0x480c,0);b[0x480e]=64;
    let dir=tempfile::tempdir().unwrap();let path=dir.path().join("compiled.map");std::fs::write(&path,b).unwrap();
    let i=maps::inspect_map(&path,None).unwrap();assert_eq!(i.decals.len(),1);assert_eq!(i.decals[0].bsp_index,Some(0));assert_eq!(i.decals[0].yaw,64);
}
#[test]
fn malformed_decal_references_and_circular_chains_are_bounded(){
    for failure in 0..4 {
        let mut b=decal_fixture(7);
        match failure {
            0=>put_u32(&mut b,0x18e4,0xdeadbeef),
            1=>put_u32(&mut b,0x13ac,1),
            2=>{fourcc(&mut b,0x1808,"deca");put_u32(&mut b,0x1814,0xe0000001);},
            _=>put_f32(&mut b,0x1818,f32::NAN),
        }
        let dir=tempfile::tempdir().unwrap();let path=dir.path().join("invalid.map");std::fs::write(&path,b).unwrap();
        let i=maps::inspect_map(&path,None).unwrap();assert!(i.decals.len()<=1);assert!(i.diagnostics.iter().any(|d|d.code.starts_with("DECAL")));
        if failure!=2 {assert!(i.decals.is_empty());}
    }
}
