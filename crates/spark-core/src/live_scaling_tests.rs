use super::*;
use std::{
    cell::{Cell as Counter, RefCell},
    collections::BTreeMap,
};
const BASE: u64 = 0x10000000;
const HEADER: u64 = 0x40000000;
const TABLE: u64 = HEADER + 0x1000;
const ARENA: u64 = 0x70000034;
const PHYS: u64 = HEADER + 0x5000;
const MATRICES: u64 = HEADER + 0x6000;
const POINTS: u64 = HEADER + 0x7000;
const HEADERS: u64 = 0x60000038;
struct Mock {
    bytes: RefCell<BTreeMap<u64, u8>>,
    writes: Counter<usize>,
    fail_once: Counter<Option<usize>>,
    ignore: Counter<bool>,
}
impl Mock {
    fn put(&self, p: u64, b: &[u8]) {
        self.bytes
            .borrow_mut()
            .extend(b.iter().enumerate().map(|(i, b)| (p + i as u64, *b)));
    }
    fn float(&self, p: u64, v: f32) {
        self.put(p, &v.to_le_bytes());
    }
    fn vector(&self, p: u64, v: [f32; 3]) {
        self.put(
            p,
            &v.iter().flat_map(|v| v.to_le_bytes()).collect::<Vec<_>>(),
        );
    }
    fn tag(&self, index: u32, class: &[u8; 4], offset: u32, name: &str) {
        let p = TABLE + u64::from(index) * 32;
        self.put(p, &[0; 32]);
        self.put(p, &u32::from_be_bytes(*class).to_le_bytes());
        self.put(p + 12, &(0x10000 + index).to_le_bytes());
        self.put(p + 16, &(0x50002000 + index * 256).to_le_bytes());
        self.put(p + 20, &(0x50000000 + offset).to_le_bytes());
        self.put(
            HEADER + 0x2000 + u64::from(index) * 256,
            &[name.as_bytes(), b"\0"].concat(),
        );
    }
    fn object(&self, index: u32, tag: u32, kind: u8, position: [f32; 3]) {
        let off = index * 0x800;
        let p = ARENA + u64::from(off);
        self.put(
            HEADERS + u64::from(index) * 12,
            &[2, 0, 0, kind, 0, 0, 0, 0, 0, 0, 0, 0],
        );
        self.put(HEADERS + u64::from(index) * 12 + 8, &off.to_le_bytes());
        self.put(p, &[0; 0x180]);
        self.put(p, &tag.to_le_bytes());
        self.vector(p + 0x18, position);
        self.vector(p + 0x5c, position);
        self.vector(p + 0x30, [1., 0., 0.]);
        self.vector(p + 0x3c, [0., 0., 1.]);
        self.float(p + 0x68, 2.);
        self.float(p + 0x6c, 1.);
        self.put(p + 0x70, &u16::from(kind).to_le_bytes());
        self.put(p + 0xd8, &u32::MAX.to_le_bytes());
        self.put(p + 0x10, &[0x60]);
    }
}
impl Memory for Mock {
    fn read(&self, p: u64, n: usize) -> Result<Vec<u8>> {
        (0..n)
            .map(|i| {
                self.bytes
                    .borrow()
                    .get(&(p + i as u64))
                    .copied()
                    .ok_or_else(|| crate::SparkError::Invalid("Unmapped fixture address".into()))
            })
            .collect()
    }
    fn write(&self, p: u64, b: &[u8]) -> Result<()> {
        let n = self.writes.get() + 1;
        self.writes.set(n);
        if self.fail_once.get() == Some(n) {
            self.fail_once.set(None);
            self.put(p, &b[..1]);
            return invalid("Simulated partial transport write");
        }
        if !self.ignore.get() {
            self.put(p, b);
        }
        Ok(())
    }
}
fn fixture() -> Mock {
    let m = Mock {
        bytes: RefCell::new(BTreeMap::new()),
        writes: Counter::new(0),
        fail_once: Counter::new(None),
        ignore: Counter::new(false),
    };
    m.put(BASE + 0x2d9ce10, &HEADER.to_le_bytes());
    m.put(HEADER, &0x50001000u32.to_le_bytes());
    m.put(HEADER + 4, &0x10000u32.to_le_bytes());
    m.put(HEADER + 8, &1234u32.to_le_bytes());
    m.put(HEADER + 12, &6u32.to_le_bytes());
    m.put(HEADER + 0x24, b"sgat");
    m.put(BASE + 0x1c42248, &0x60000000u64.to_le_bytes());
    m.put(BASE + 0x2d9cdf8, &0x70000000u64.to_le_bytes());
    m.put(BASE + 0x2d9cd90, &0x71000000u64.to_le_bytes());
    m.put(0x71000004, &u32::MAX.to_le_bytes());
    m.put(HEADERS, &vec![255; 2048 * 12]);
    m.tag(0, b"scnr", 0x3000, "levels/test/test");
    m.tag(1, b"vehi", 0x4000, "vehicles/car/car");
    m.tag(2, b"vehi", 0x4200, "vehicles/car/variant");
    m.tag(3, b"phys", 0x5000, "vehicles/car/physics");
    m.tag(4, b"weap", 0x4400, "weapons/pistol/pistol");
    m.tag(5, b"bipd", 0x4600, "characters/cyborg/cyborg");
    for offset in [0x4000, 0x4200] {
        let p = HEADER + offset;
        m.put(p, &[0; 256]);
        m.put(p + 0x44, &u32::MAX.to_le_bytes());
        m.put(p + 0x80, &u32::from_be_bytes(*b"phys").to_le_bytes());
        m.put(p + 0x8c, &0x10003u32.to_le_bytes());
    }
    for offset in [0x4400, 0x4600] {
        m.put(HEADER + offset, &[0; 256]);
        m.put(HEADER + offset + 0x8c, &u32::MAX.to_le_bytes());
    }
    m.put(PHYS, &[0; 128]);
    m.float(PHYS, -1.);
    m.float(PHYS + 4, 1.);
    m.float(PHYS + 8, 100.);
    m.vector(PHYS + 0xc, [0., 0., 0.25]);
    m.float(PHYS + 0x18, 2.);
    m.float(PHYS + 0x1c, 1.);
    m.float(PHYS + 0x24, 0.2);
    m.float(PHYS + 0x3c, 0.4);
    m.put(PHYS + 0x5c, &2u32.to_le_bytes());
    m.put(PHYS + 0x60, &0x50006000u32.to_le_bytes());
    m.put(MATRICES, &[0; 72]);
    for (i, v) in [8f32, 12., 16.].into_iter().enumerate() {
        m.float(PHYS + 0x50 + i as u64 * 4, v);
        m.float(MATRICES + i as u64 * 16, v);
        m.float(MATRICES + 36 + i as u64 * 16, 1. / v);
    }
    m.put(PHYS + 0x74, &4u32.to_le_bytes());
    m.put(PHYS + 0x78, &0x50007000u32.to_le_bytes());
    m.put(POINTS, &[0; 512]);
    for i in 0..4 {
        let p = POINTS + i * 128;
        m.float(p + 0x2c, 25.);
        m.vector(
            p + 0x38,
            [
                if i & 1 == 0 { -1. } else { 1. },
                if i & 2 == 0 { -1. } else { 1. },
                0.,
            ],
        );
        m.float(p + 0x68, 0.25);
        m.float(p + 0x34, 2.);
    }
    m.object(0, 0x10001, 1, [0., 0., 1.]);
    m.object(1, 0x10002, 1, [10., 0., 1.]);
    m.float(HEADER + 0x4400 + 0x184, 1.);
    m
}
fn op(scale: f32, expected_scale: f32) -> ScaleOperation {
    ScaleOperation {
        datum: 0x20000,
        tag_datum: 0x10001,
        expected_scale,
        scale,
        include_shared_physics: true,
    }
}
#[test]
fn vehicle_size_mass_inertia_contacts_and_shared_variants_scale_together() {
    let m = fixture();
    let id = snapshot(&m, BASE).unwrap().identity;
    let mut state = ScaleState::default();
    let r = resize(&m, BASE, &id, &mut state, &op(2., 1.)).unwrap();
    assert_eq!(r.affected_objects, vec![0x20000, 0x20001]);
    assert_eq!(number(&m, PHYS + 8).unwrap(), 800.);
    assert_eq!(number(&m, MATRICES).unwrap(), 256.);
    assert_eq!(number(&m, MATRICES + 36).unwrap(), 1. / 256.);
    assert_eq!(number(&m, POINTS + 0x2c).unwrap(), 200.);
    assert_eq!(number(&m, POINTS + 0x38).unwrap(), -2.);
    assert_eq!(number(&m, POINTS + 0x68).unwrap(), 0.5);
    assert_eq!(number(&m, PHYS + 0x24).unwrap(), 0.4);
    assert_eq!(number(&m, PHYS + 0x18).unwrap(), 2.);
    assert_eq!(number(&m, PHYS).unwrap(), -1.);
    for p in [ARENA, ARENA + 0x800] {
        assert_eq!(object_scale(&m, p).unwrap(), 2.);
        assert_eq!(vec3(&m, p + 0x18).unwrap()[2], 1.5);
        assert_eq!(m.read(p + 0x10, 1).unwrap(), [0x40]);
    }
}
#[test]
fn repeat_changes_and_reset_restore_original_physics_without_cumulative_drift() {
    let m = fixture();
    let id = snapshot(&m, BASE).unwrap().identity;
    let original = m.read(PHYS, 128).unwrap();
    let points = m.read(POINTS, 512).unwrap();
    let matrices = m.read(MATRICES, 72).unwrap();
    let mut state = ScaleState::default();
    let mut previous = 1.;
    for scale in [2., 0.5, 1.25, 0.75, 1.] {
        resize(&m, BASE, &id, &mut state, &op(scale, previous)).unwrap();
        previous = scale;
    }
    assert_eq!(m.read(PHYS, 128).unwrap(), original);
    assert_eq!(m.read(POINTS, 512).unwrap(), points);
    assert_eq!(m.read(MATRICES, 72).unwrap(), matrices);
    assert!(!state.active());
}
#[test]
fn visual_only_moving_occupied_and_nonfinite_vehicle_resizes_never_write() {
    for case in 0..5 {
        let m = fixture();
        let id = snapshot(&m, BASE).unwrap().identity;
        let mut request = op(2., 1.);
        match case {
            0 => request.include_shared_physics = false,
            1 => m.float(ARENA + 0x24, 0.02),
            2 => {
                m.object(2, 0x10005, 0, [0., 0., 1.]);
                m.put(ARENA + 0x1000 + 0xd8, &0x20000u32.to_le_bytes());
            }
            3 => request.scale = f32::NAN,
            _ => request.scale = 4.,
        };
        assert!(
            resize(&m, BASE, &id, &mut ScaleState::default(), &request).is_err(),
            "case {case}"
        );
        assert_eq!(m.writes.get(), 0);
    }
}
#[test]
fn changed_map_matrix_or_external_physics_refuses_all_writes() {
    for case in 0..3 {
        let m = fixture();
        let id = snapshot(&m, BASE).unwrap().identity;
        match case {
            0 => m.put(HEADER + 8, &999u32.to_le_bytes()),
            1 => m.float(MATRICES + 36, 2.),
            _ => m.float(POINTS + 0x2c, 0.),
        };
        assert!(resize(&m, BASE, &id, &mut ScaleState::default(), &op(2., 1.)).is_err());
        assert_eq!(m.writes.get(), 0);
    }
}
#[test]
fn failed_partial_write_rolls_back_every_attempted_cell() {
    let m = fixture();
    let id = snapshot(&m, BASE).unwrap().identity;
    let before = m.bytes.borrow().clone();
    m.fail_once.set(Some(6));
    let mut state = ScaleState::default();
    let error = resize(&m, BASE, &id, &mut state, &op(2., 1.))
        .unwrap_err()
        .to_string();
    assert!(error.contains("Rollback confirmed"), "{error}");
    assert_eq!(*m.bytes.borrow(), before);
    assert!(!state.active());
}
#[test]
fn ignored_writes_do_not_report_success() {
    let m = fixture();
    let id = snapshot(&m, BASE).unwrap().identity;
    m.ignore.set(true);
    assert!(resize(&m, BASE, &id, &mut ScaleState::default(), &op(2., 1.)).is_err());
}
#[test]
fn respawn_alignment_uses_reviewed_tags_and_preserves_physics() {
    let m = fixture();
    let id = snapshot(&m, BASE).unwrap().identity;
    let mut state = ScaleState::default();
    resize(&m, BASE, &id, &mut state, &op(0.5, 1.)).unwrap();
    let physics = m.read(PHYS, 128).unwrap();
    m.object(2, 0x10001, 1, [20., 0., 1.]);
    assert!(needs_synchronization(&m, BASE, &id, &state).unwrap());
    assert_eq!(synchronize_respawns(&m, BASE, &id, &mut state).unwrap(), 1);
    assert_eq!(object_scale(&m, ARENA + 0x1000).unwrap(), 0.5);
    assert_eq!(m.read(PHYS, 128).unwrap(), physics);
    assert!(!needs_synchronization(&m, BASE, &id, &state).unwrap());
    reset(&m, BASE, &id, &mut state).unwrap();
    assert!(!state.active());
    assert_eq!(object_scale(&m, ARENA + 0x1000).unwrap(), 1.);
}
#[test]
fn world_weapon_scaling_keeps_bounds_in_step() {
    let m = fixture();
    m.object(0, 0x10004, 2, [0., 0., 1.]);
    let id = snapshot(&m, BASE).unwrap().identity;
    let r = resize(
        &m,
        BASE,
        &id,
        &mut ScaleState::default(),
        &ScaleOperation {
            tag_datum: 0x10004,
            include_shared_physics: true,
            ..op(0.1, 1.)
        },
    )
    .unwrap();
    assert!(r.applied);
    assert_eq!(object_scale(&m, ARENA).unwrap(), 0.1);
    assert_eq!(number(&m, ARENA + 0x68).unwrap(), 0.2);
}
#[test]
fn native_zero_scale_is_unity_and_restores_the_zero_sentinel() {
    let m = fixture();
    m.float(ARENA + 0x6c, 0.);
    m.float(ARENA + 0x800 + 0x6c, 0.);
    let s = snapshot(&m, BASE).unwrap();
    assert_eq!(s.objects.len(), 2);
    assert_eq!(s.objects[0].scale, 1.);
    let mut state = ScaleState::default();
    resize(&m, BASE, &s.identity, &mut state, &op(2., 1.)).unwrap();
    reset(&m, BASE, &s.identity, &mut state).unwrap();
    assert_eq!(number(&m, ARENA + 0x6c).unwrap(), 0.);
    assert_eq!(number(&m, ARENA + 0x800 + 0x6c).unwrap(), 0.);
}
#[test]
fn destroyed_vehicles_do_not_prevent_restoring_their_shared_physics() {
    let m = fixture();
    let id = snapshot(&m, BASE).unwrap().identity;
    let mut state = ScaleState::default();
    resize(&m, BASE, &id, &mut state, &op(2., 1.)).unwrap();
    m.put(HEADERS, &[255; 24]);
    m.object(2, 0x10005, 0, [0., 0., 1.]);
    reset(&m, BASE, &id, &mut state).unwrap();
    assert_eq!(number(&m, PHYS + 8).unwrap(), 100.);
    assert!(!state.active());
}
#[test]
fn same_map_reload_at_baseline_retires_the_old_scale_journal() {
    let m = fixture();
    let id = snapshot(&m, BASE).unwrap().identity;
    let mut state = ScaleState::default();
    resize(&m, BASE, &id, &mut state, &op(2., 1.)).unwrap();
    let fresh = fixture();
    let writes = m.writes.get();
    *m.bytes.borrow_mut() = fresh.bytes.into_inner();
    reset(&m, BASE, &id, &mut state).unwrap();
    assert!(!state.active());
    assert_eq!(m.writes.get(), writes);
}
#[test]
fn wheel_suspension_depths_follow_scale_and_restore_exactly() {
    let m = fixture();
    m.put(HEADER + 12, &7u32.to_le_bytes());
    m.tag(6, b"antr", 0x8000, "vehicles/car/animations");
    m.put(HEADER + 0x8000, &[0; 128]);
    m.put(HEADER + 0x8024, &1u32.to_le_bytes());
    m.put(HEADER + 0x8028, &0x50009000u32.to_le_bytes());
    m.put(HEADER + 0x9000, &[0; 116]);
    m.put(HEADER + 0x9068, &1u32.to_le_bytes());
    m.put(HEADER + 0x906c, &0x5000a000u32.to_le_bytes());
    m.put(HEADER + 0xa000, &[0; 20]);
    m.float(HEADER + 0xa004, -0.3);
    m.float(HEADER + 0xa008, -0.1);
    for off in [0x4000, 0x4200] {
        m.put(
            HEADER + off + 0x38,
            &u32::from_be_bytes(*b"antr").to_le_bytes(),
        );
        m.put(HEADER + off + 0x44, &0x10006u32.to_le_bytes());
    }
    let id = snapshot(&m, BASE).unwrap().identity;
    let mut state = ScaleState::default();
    assert_eq!(
        info(&m, BASE, &id, &state, 0x20000)
            .unwrap()
            .suspension_points,
        1
    );
    resize(&m, BASE, &id, &mut state, &op(2., 1.)).unwrap();
    assert_eq!(number(&m, HEADER + 0xa004).unwrap(), -0.6);
    assert_eq!(number(&m, HEADER + 0xa008).unwrap(), -0.2);
    resize(&m, BASE, &id, &mut state, &op(0.5, 2.)).unwrap();
    assert_eq!(number(&m, HEADER + 0xa004).unwrap(), -0.15);
    reset(&m, BASE, &id, &mut state).unwrap();
    assert_eq!(number(&m, HEADER + 0xa004).unwrap(), -0.3);
    assert_eq!(number(&m, HEADER + 0xa008).unwrap(), -0.1);
}
#[test]
fn shared_world_item_tag_keeps_native_updates_in_step_and_restores_authored_size() {
    let m = fixture();
    m.float(HEADER + 0x4400 + 0x184, 1.7);
    m.object(0, 0x10004, 2, [0., 0., 1.]);
    m.object(1, 0x10004, 2, [10., 0., 1.]);
    m.float(ARENA + 0x6c, 1.7);
    m.float(ARENA + 0x800 + 0x6c, 1.7);
    let id = snapshot(&m, BASE).unwrap().identity;
    let mut state = ScaleState::default();
    let request = ScaleOperation {
        tag_datum: 0x10004,
        ..op(0.5, 1.7)
    };
    let r = resize(&m, BASE, &id, &mut state, &request).unwrap();
    assert_eq!(r.affected_objects.len(), 2);
    assert_eq!(number(&m, HEADER + 0x4400 + 0x184).unwrap(), 0.5);
    for p in [ARENA, ARENA + 0x800] {
        m.float(p + 0x6c, number(&m, HEADER + 0x4400 + 0x184).unwrap());
        assert_eq!(object_scale(&m, p).unwrap(), 0.5);
    }
    assert!(state.active());
    assert!(!state.vehicle_active());
    reset(&m, BASE, &id, &mut state).unwrap();
    assert_eq!(number(&m, HEADER + 0x4400 + 0x184).unwrap(), 1.7);
    assert_eq!(object_scale(&m, ARENA).unwrap(), 1.7);
    assert!(!state.active());
}
#[test]
fn unconfirmed_or_attached_world_items_refuse_tag_edits() {
    for attached in [false, true] {
        let m = fixture();
        m.object(0, 0x10004, 2, [0., 0., 1.]);
        if attached {
            m.put(ARENA + 0xd8, &0x20001u32.to_le_bytes());
        }
        let id = snapshot(&m, BASE).unwrap().identity;
        let request = ScaleOperation {
            tag_datum: 0x10004,
            include_shared_physics: attached,
            ..op(0.5, 1.)
        };
        assert!(resize(&m, BASE, &id, &mut ScaleState::default(), &request).is_err());
        assert_eq!(m.writes.get(), 0);
    }
}
