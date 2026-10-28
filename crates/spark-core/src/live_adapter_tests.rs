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
