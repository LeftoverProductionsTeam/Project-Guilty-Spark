use super::*;
use std::{cell::RefCell, collections::BTreeMap};
const BASE: u64 = 0x10000000;
const HEADER: u64 = 0x40000000;
const TABLE: u64 = HEADER + 0x1000;
const OBJECT: u64 = 0x70000034;
struct Mock {
    data: RefCell<BTreeMap<u64, u8>>,
    writes: RefCell<Vec<u64>>,
    ignore_writes: bool,
}
impl Mock {
    fn put(&self, p: u64, b: &[u8]) {
        for (i, b) in b.iter().enumerate() {
            self.data.borrow_mut().insert(p + i as u64, *b);
        }
    }
}
impl Memory for Mock {
    fn read(&self, p: u64, size: usize) -> Result<Vec<u8>> {
        (0..size)
            .map(|i| {
                self.data
                    .borrow()
                    .get(&(p + i as u64))
                    .copied()
                    .ok_or_else(|| crate::SparkError::Invalid("Unmapped mock page".into()))
            })
            .collect()
    }
    fn write(&self, p: u64, b: &[u8]) -> Result<()> {
        self.writes.borrow_mut().push(p);
        if !self.ignore_writes {
            self.put(p, b);
        }
        Ok(())
    }
}
fn fixture() -> Mock {
    let m = Mock {
        data: RefCell::new(BTreeMap::new()),
        writes: RefCell::new(vec![]),
        ignore_writes: false,
    };
    m.put(BASE + 0x2D9CE10, &HEADER.to_le_bytes());
    m.put(HEADER, &0x50001000u32.to_le_bytes());
    m.put(HEADER + 4, &0x10000u32.to_le_bytes());
    m.put(HEADER + 8, &1234u32.to_le_bytes());
    m.put(HEADER + 12, &2u32.to_le_bytes());
    m.put(HEADER + 0x24, b"sgat");
    m.put(BASE + 0x1C42248, &0x60000000u64.to_le_bytes());
    m.put(BASE + 0x2D9CDF8, &0x70000000u64.to_le_bytes());
    m.put(BASE + 0x2D9CD90, &0x71000000u64.to_le_bytes());
    m.put(0x71000004, &0x20000u32.to_le_bytes());
    m.put(0x60000038, &vec![255; 2048 * 12]);
    m.put(0x60000038, &[2, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0]);
    m.put(OBJECT, &0x10001u32.to_le_bytes());
    m.put(
        OBJECT + 0x18,
        &[1f32, 2., 3.]
            .iter()
            .flat_map(|v| v.to_le_bytes())
            .collect::<Vec<_>>(),
    );
    m.put(OBJECT + 0x24, &[0; 12]);
    m.put(OBJECT + 0x6c, &1f32.to_le_bytes());
    m.put(OBJECT + 0x70, &6u16.to_le_bytes());
    m.put(OBJECT+0x30,&[1f32,0.,0.].iter().flat_map(|v|v.to_le_bytes()).collect::<Vec<_>>());m.put(OBJECT+0x3c,&[0f32,0.,1.].iter().flat_map(|v|v.to_le_bytes()).collect::<Vec<_>>());m.put(OBJECT+0xd8,&u32::MAX.to_le_bytes());
    for (i, name) in [
        b"levels/quickforge/test/test".as_slice(),
        b"scenery/crate/crate".as_slice(),
    ]
    .into_iter()
    .enumerate()
    {
        m.put(
            TABLE + i as u64 * 32 + 12,
            &(0x10000u32 + i as u32).to_le_bytes(),
        );
        m.put(
            TABLE + i as u64 * 32 + 16,
            &(0x50002000u32 + i as u32 * 256).to_le_bytes(),
        );
        m.put(HEADER + 0x2000 + i as u64 * 256, &[name, b"\0"].concat());
    }
    m
}
fn operation() -> MoveObject {
    MoveObject {
        datum: 0x20000,
        tag_datum: 0x10001,
        expected_position: [1., 2., 3.],
        position: [4., 5., 6.],
    }
}
#[test]
fn gameplay_inventory_distinguishes_equipped_and_stowed_slots_without_writes() {
    let m=fixture();let id=identity(&m,BASE).unwrap().0;
    m.put(OBJECT,&vec![0;1024]);m.put(OBJECT+0x70,&0u16.to_le_bytes());
    m.put(0x60000038+3,&[0]);m.put(OBJECT+0x2d8,&[255;16]);
    let datum=0x30001u32;let weapon=OBJECT+4096;
    m.put(0x60000038+12,&[3,0,0,2,0,0,0,0,0,16,0,0]);
    m.put(weapon,&0x10001u32.to_le_bytes());m.put(weapon+0x70,&2u16.to_le_bytes());
    m.put(weapon+0xd8,&0x20000u32.to_le_bytes());
    m.put(OBJECT+0xd4,&datum.to_le_bytes());m.put(OBJECT+0x2dc,&datum.to_le_bytes());
    let inventory=gameplay_inventory(&m,BASE,&id).unwrap();
    assert_eq!(inventory.weapons.len(),1);assert_eq!(inventory.weapons[0].slot,1);assert!(inventory.weapons[0].equipped);
    assert!(inventory.read_only&&!inventory.input_hooks_ready&&m.writes.borrow().is_empty());
    m.put(weapon+0xd8,&u32::MAX.to_le_bytes());
    assert!(gameplay_inventory(&m,BASE,&id).is_err());assert!(m.writes.borrow().is_empty());
}
fn sprint_fixture()->(Mock,MapIdentity,u64){
    let m=fixture();let id=identity(&m,BASE).unwrap().0;
    m.put(OBJECT+0x70,&0u16.to_le_bytes());m.put(0x60000038+3,&[0]);
    m.put(OBJECT+0x1f8,&0x30000u32.to_le_bytes());m.put(OBJECT+0x1d8,&0u32.to_le_bytes());
    m.put(OBJECT+0x9c,&1f32.to_le_bytes());m.put(OBJECT+0x258,&1f32.to_le_bytes());
    let table=0x72000000u64;let record=table+0x38;m.put(BASE+0x1c40480,&table.to_le_bytes());
    m.put(table,b"players\0");m.put(table+0x20,&16u16.to_le_bytes());m.put(table+0x22,&0xc20u16.to_le_bytes());m.put(table+0x34,&0x38u32.to_le_bytes());
    m.put(record,&3u16.to_le_bytes());m.put(record+0x64,&0x20000u32.to_le_bytes());m.put(record+0xd4,&1.2f32.to_le_bytes());
    m.put(BASE+0x2b6f5e4,&1000u32.to_le_bytes());m.put(BASE+0x2e9f7ed,&[1]);m.put(BASE+0x2e9f7ec,&[1]);(m,id,record)
}
#[test]
fn native_sprint_uses_the_authored_player_multiplier_without_compounding_and_restores_exactly(){
    let(m,id,record)=sprint_fixture();let mut state=sprint::State::default();let config=sprint::Config::default();
    assert!(sprint::needs_update(&m,BASE,&id,&state,&config,true).unwrap());
    sprint::tick(&m,BASE,&id,&mut state,&config,true).unwrap();
    let expected=1.2f32*config.multiplier;assert_eq!(u32_at(&m,record+0xd4).unwrap(),expected.to_bits());
    assert!(!sprint::needs_update(&m,BASE,&id,&state,&config,true).unwrap());
    sprint::tick(&m,BASE,&id,&mut state,&config,true).unwrap();assert_eq!(m.writes.borrow().len(),1);
    sprint::tick(&m,BASE,&id,&mut state,&config,false).unwrap();assert_eq!(u32_at(&m,record+0xd4).unwrap(),1.2f32.to_bits());assert!(!state.active());
    assert!(m.writes.borrow().iter().all(|at|*at==record+0xd4));
}
#[test]
fn native_sprint_releases_for_reload_crouch_vehicle_and_death_without_velocity_writes(){
    for (at,bytes)in[(OBJECT+0x1d8,0x400u32.to_le_bytes()),(OBJECT+0x1d8,1u32.to_le_bytes()),(OBJECT+0xd8,7u32.to_le_bytes()),(OBJECT+0x9c,0f32.to_le_bytes())]{
        let(m,id,record)=sprint_fixture();let mut state=sprint::State::default();let config=sprint::Config::default();sprint::tick(&m,BASE,&id,&mut state,&config,true).unwrap();
        m.put(at,&bytes);sprint::tick(&m,BASE,&id,&mut state,&config,true).unwrap();assert_eq!(u32_at(&m,record+0xd4).unwrap(),1.2f32.to_bits());assert!(!state.active());
        assert!(m.writes.borrow().iter().all(|at|*at==record+0xd4));
    }
}
#[test]
fn native_sprint_refuses_layout_salt_changes_and_restores_after_a_failed_write(){
    let(mut m,id,record)=sprint_fixture();let mut state=sprint::State::default();let config=sprint::Config::default();
    m.ignore_writes=true;assert!(sprint::tick(&m,BASE,&id,&mut state,&config,true).is_err());assert!(!state.active());assert_eq!(u32_at(&m,record+0xd4).unwrap(),1.2f32.to_bits());
    m.ignore_writes=false;m.writes.borrow_mut().clear();m.put(record,&4u16.to_le_bytes());assert!(sprint::tick(&m,BASE,&id,&mut state,&config,true).is_err());assert!(m.writes.borrow().is_empty());
}
#[test]
fn native_sprint_handles_the_exact_decay_observed_in_the_real_trial_and_still_restores(){
    let(m,id,record)=sprint_fixture();m.put(record+0xd4,&1f32.to_le_bytes());let mut state=sprint::State::default();let config=sprint::Config{hotkey:"ShiftLeft".into(),multiplier:1.5};
    sprint::tick(&m,BASE,&id,&mut state,&config,true).unwrap();
    m.put(BASE+0x2b6f5e4,&1003u32.to_le_bytes());m.put(record+0xd4,&1.499666690826416f32.to_le_bytes());
    assert!(sprint::needs_update(&m,BASE,&id,&state,&config,true).unwrap());
    sprint::tick(&m,BASE,&id,&mut state,&config,true).unwrap();assert_eq!(u32_at(&m,record+0xd4).unwrap(),1.5f32.to_bits());
    m.put(BASE+0x2b6f5e4,&1006u32.to_le_bytes());m.put(record+0xd4,&1.499666690826416f32.to_le_bytes());
    sprint::tick(&m,BASE,&id,&mut state,&config,false).unwrap();assert_eq!(u32_at(&m,record+0xd4).unwrap(),1f32.to_bits());assert!(!state.active());
}
const CAMERA_UNIT:u64=HEADER+0x4000;
const CAMERA_WEAPON:u64=HEADER+0x5000;
const CAMERA_TRACK:u64=HEADER+0x6000;
const CAMERA_POINTS:u64=HEADER+0x8000;
const CAMERA_WEAPON_2:u64=HEADER+0x9000;
fn camera_fixture()->(Mock,MapIdentity){
    let m=fixture();m.put(HEADER+12,&5u32.to_le_bytes());
    for(index,class,offset)in[(1u32,*b"bipd",0x4000u32),(2,*b"weap",0x5000),(3,*b"trak",0x6000),(4,*b"weap",0x9000)]{
        let entry=TABLE+u64::from(index)*32;m.put(entry,&u32::from_be_bytes(class).to_le_bytes());m.put(entry+12,&(0x10000+index).to_le_bytes());m.put(entry+20,&(0x50000000+offset).to_le_bytes());
    }
    m.put(OBJECT+0x70,&0u16.to_le_bytes());m.put(0x60000038+3,&[0]);m.put(OBJECT+0x9c,&1f32.to_le_bytes());m.put(OBJECT+0xd4,&0x30001u32.to_le_bytes());
    m.put(0x60000038+12,&[3,0,0,2,0,0,0,0,0,16,0,0]);m.put(OBJECT+4096,&0x10002u32.to_le_bytes());m.put(OBJECT+4096+0x70,&2u16.to_le_bytes());m.put(OBJECT+4096+0xd8,&0x20000u32.to_le_bytes());
    m.put(CAMERA_UNIT+0x1f4,&1u32.to_le_bytes());m.put(CAMERA_UNIT+0x1f8,&0x50007000u32.to_le_bytes());m.put(HEADER+0x7000,&u32::from_be_bytes(*b"trak").to_le_bytes());m.put(HEADER+0x700c,&0x10003u32.to_le_bytes());
    m.put(CAMERA_TRACK+4,&4u32.to_le_bytes());m.put(CAMERA_TRACK+8,&0x50008000u32.to_le_bytes());m.put(CAMERA_POINTS,&[0;240]);
    for i in 0..4u64 {m.put(CAMERA_POINTS+i*60,&[-1f32,0.,0.5].iter().flat_map(|v|v.to_le_bytes()).collect::<Vec<_>>());m.put(CAMERA_POINTS+i*60+24,&1f32.to_le_bytes());}
    m.put(CAMERA_WEAPON+0x308,&0x21u32.to_le_bytes());m.put(CAMERA_WEAPON_2+0x308,&0x81u32.to_le_bytes());
    m.put(BASE+0x2d9bdd4,&[0;0x38]);m.put(BASE+0x2d9bdd4+0x20,&1f32.to_le_bytes());m.put(BASE+0x2d9bdd4+0x34,&1f32.to_le_bytes());
    let id=identity(&m,BASE).unwrap().0;(m,id)
}
#[test]
fn native_camera_edits_positions_without_compounding_or_changing_authored_rotations(){
    let(m,id)=camera_fixture();let mut state=camera::State::default();let config=camera::Config::default();
    let rotations=m.read(CAMERA_POINTS+12,16).unwrap();assert!(camera::info(&m,BASE,&id).unwrap().available);assert!(m.writes.borrow().is_empty());
    camera::apply(&m,BASE,&id,&mut state,Some(&config)).unwrap();assert!(state.engaged());assert!(!camera::needs_update(&m,BASE,&id,&state,&config).unwrap());
    assert_eq!(vec3(&m,CAMERA_POINTS).unwrap(),[-1.4,-0.3,0.65]);assert_eq!(u32_at(&m,CAMERA_WEAPON+0x308).unwrap(),0x21|(1<<17));assert_eq!(m.read(CAMERA_POINTS+12,16).unwrap(),rotations);
    let next=camera::Config{back:0.75,right:-0.25,up:0.3};camera::apply(&m,BASE,&id,&mut state,Some(&next)).unwrap();assert_eq!(vec3(&m,CAMERA_POINTS).unwrap(),[-1.75,0.25,0.8]);
    // Unrelated flag changes made by the engine must survive restoration.
    m.put(CAMERA_WEAPON+0x308,&(0x25u32|(1<<17)).to_le_bytes());camera::apply(&m,BASE,&id,&mut state,None).unwrap();
    assert_eq!(u32_at(&m,CAMERA_WEAPON+0x308).unwrap(),0x25);assert_eq!(vec3(&m,CAMERA_POINTS).unwrap(),[-1.,0.,0.5]);assert!(!state.active());
}
#[test]
fn native_camera_follows_weapon_switches_and_restores_both_weapon_definitions(){
    let(m,id)=camera_fixture();let mut state=camera::State::default();let config=camera::Config::default();camera::apply(&m,BASE,&id,&mut state,Some(&config)).unwrap();
    m.put(OBJECT+4096,&0x10004u32.to_le_bytes());assert!(camera::needs_update(&m,BASE,&id,&state,&config).unwrap());camera::apply(&m,BASE,&id,&mut state,Some(&config)).unwrap();
    assert_eq!(u32_at(&m,CAMERA_WEAPON+0x308).unwrap(),0x21);assert_eq!(u32_at(&m,CAMERA_WEAPON_2+0x308).unwrap(),0x81|(1<<17));assert_eq!(vec3(&m,CAMERA_POINTS).unwrap(),[-1.4,-0.3,0.65]);
    camera::apply(&m,BASE,&id,&mut state,None).unwrap();assert_eq!(u32_at(&m,CAMERA_WEAPON_2+0x308).unwrap(),0x81);
}
#[test]
fn native_camera_restores_for_vehicle_entry_and_death_then_can_reapply(){
    for(at,bytes)in[(OBJECT+0xd8,7u32.to_le_bytes()),(OBJECT+0x9c,0f32.to_le_bytes())]{
        let(m,id)=camera_fixture();let mut state=camera::State::default();let config=camera::Config::default();camera::apply(&m,BASE,&id,&mut state,Some(&config)).unwrap();m.put(at,&bytes);
        assert!(camera::needs_update(&m,BASE,&id,&state,&config).unwrap());camera::apply(&m,BASE,&id,&mut state,Some(&config)).unwrap();assert!(!state.active());assert_eq!(vec3(&m,CAMERA_POINTS).unwrap(),[-1.,0.,0.5]);
        m.put(OBJECT+0xd8,&u32::MAX.to_le_bytes());m.put(OBJECT+0x9c,&1f32.to_le_bytes());camera::apply(&m,BASE,&id,&mut state,Some(&config)).unwrap();assert!(state.engaged());
    }
}
#[test]
fn native_camera_refuses_bad_layouts_and_foreign_camera_changes_without_writes(){
    let(m,id)=camera_fixture();let mut state=camera::State::default();let config=camera::Config::default();m.put(CAMERA_TRACK+4,&17u32.to_le_bytes());
    assert!(camera::apply(&m,BASE,&id,&mut state,Some(&config)).is_err());assert!(m.writes.borrow().is_empty());
    m.put(CAMERA_TRACK+4,&4u32.to_le_bytes());camera::apply(&m,BASE,&id,&mut state,Some(&config)).unwrap();m.writes.borrow_mut().clear();m.put(CAMERA_POINTS,&3f32.to_le_bytes());
    assert!(camera::apply(&m,BASE,&id,&mut state,None).is_err());assert!(state.active());assert!(m.writes.borrow().is_empty());assert_eq!(vec3(&m,CAMERA_POINTS).unwrap()[0],3.);
}
#[test]
fn native_camera_retires_its_journal_on_map_change_without_restoring_old_addresses(){
    let(m,id)=camera_fixture();let mut state=camera::State::default();camera::apply(&m,BASE,&id,&mut state,Some(&camera::Config::default())).unwrap();m.writes.borrow_mut().clear();m.put(HEADER+8,&999u32.to_le_bytes());
    camera::apply(&m,BASE,&id,&mut state,None).unwrap();assert!(!state.active());assert!(m.writes.borrow().is_empty());
    assert!(camera::needs_update(&m,BASE,&id,&state,&camera::Config::default()).is_err());
    assert!(camera::apply(&m,BASE,&id,&mut state,Some(&camera::Config::default())).is_err());
    assert!(!state.active());assert!(m.writes.borrow().is_empty());
}
#[test]
fn native_camera_rolls_back_a_partial_write_and_preserves_preexisting_third_person(){
    struct Partial {inner:Mock,calls:RefCell<usize>}
    impl Memory for Partial {
        fn read(&self,p:u64,n:usize)->Result<Vec<u8>>{self.inner.read(p,n)}
        fn write(&self,p:u64,b:&[u8])->Result<()>{let mut calls=self.calls.borrow_mut();*calls+=1;if *calls==2 {self.inner.put(p,&b[..2]);return invalid("Simulated partial write");}self.inner.write(p,b)}
    }
    let(m,id)=camera_fixture();m.put(CAMERA_WEAPON+0x308,&(0x21u32|(1<<17)).to_le_bytes());let partial=Partial{inner:m,calls:RefCell::new(0)};let mut state=camera::State::default();
    assert!(camera::apply(&partial,BASE,&id,&mut state,Some(&camera::Config::default())).is_err());assert!(!state.active());assert_eq!(vec3(&partial,CAMERA_POINTS).unwrap(),[-1.,0.,0.5]);
    camera::apply(&partial,BASE,&id,&mut state,Some(&camera::Config::default())).unwrap();camera::apply(&partial,BASE,&id,&mut state,None).unwrap();assert_eq!(u32_at(&partial,CAMERA_WEAPON+0x308).unwrap(),0x21|(1<<17));
}
#[test]
fn binds_exact_map_object_and_confirms_real_readback() {
    let m = fixture();
    let s = snapshot(&m, BASE).unwrap();
    assert_eq!(s.objects.len(), 1);
    assert_eq!(s.objects[0].tag_path, "scenery/crate/crate");
    let r = move_objects(&m, BASE, &s.identity, &[operation()]).unwrap();
    assert!(r[0].applied);
    assert_eq!(r[0].observed_position, Some([4., 5., 6.]));
    assert_eq!(*m.writes.borrow(), vec![OBJECT + 0x18]);
}
#[test]
fn stale_map_never_writes() {
    let m = fixture();
    let s = snapshot(&m, BASE).unwrap();
    m.put(HEADER + 8, &1235u32.to_le_bytes());
    assert!(move_objects(&m, BASE, &s.identity, &[operation()]).is_err());
    assert!(m.writes.borrow().is_empty());
}
#[test]
fn recycled_object_salt_never_writes() {
    let m = fixture();
    let s = snapshot(&m, BASE).unwrap();
    m.put(0x60000038, &3u16.to_le_bytes());
    assert!(move_objects(&m, BASE, &s.identity, &[operation()]).is_err());
    assert!(m.writes.borrow().is_empty());
}
#[test]
fn moving_or_wrong_tag_objects_and_nonfinite_requests_never_write() {
    let m = fixture();
    let s = snapshot(&m, BASE).unwrap();
    for op in [
        MoveObject {
            expected_position: [0.; 3],
            ..operation()
        },
        MoveObject {
            tag_datum: 0x10000,
            ..operation()
        },
        MoveObject {
            position: [f32::NAN, 0., 0.],
            ..operation()
        },
    ] {
        assert!(move_objects(&m, BASE, &s.identity, &[op]).is_err());
    }
    assert!(m.writes.borrow().is_empty());
}
#[test]
fn readback_failure_is_not_an_applied_edit() {
    let mut m = fixture();
    m.ignore_writes = true;
    let s = snapshot(&m, BASE).unwrap();
    let r = move_objects(&m, BASE, &s.identity, &[operation()]).unwrap();
    assert!(!r[0].applied);
    assert_eq!(r[0].observed_position, Some([1., 2., 3.]));
}
#[test]
fn corrupt_tag_header_and_unmapped_pointers_refuse_connection() {
    let m = fixture();
    m.put(HEADER + 0x24, b"nope");
    assert!(snapshot(&m, BASE).is_err());
    let m = fixture();
    m.put(BASE + 0x2D9CE10, &0u64.to_le_bytes());
    assert!(snapshot(&m, BASE).is_err());
}
