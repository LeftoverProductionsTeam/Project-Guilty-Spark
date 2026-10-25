mod common;
use common::*;
use spark_core::{binary::Reader, legacy, maps};
#[test]
fn normalizes_only_unused_caca_script_capacity_in_working_buffer() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("legacy.map");
    let mut b = fixture(6);
    put_u32(&mut b, 0x1474, 96);
    put_u32(&mut b, 0x1480, pointer(6, 0x4000));
    put_u16(&mut b, 0x4020, 0xcaca);
    std::fs::write(&path, &b).unwrap();
    let i = maps::inspect_map(&path, None).unwrap();
    let mut working = b.clone();
    let repairs = legacy::prepare_extraction(&mut working, &i).unwrap();
    assert_eq!(repairs.len(), 1);
    assert_eq!(Reader(&working).u16(0x4020).unwrap(), 2);
    assert_eq!(std::fs::read(&path).unwrap(), b);
    put_u32(&mut working, 0x14a8, 1);
    put_u16(&mut working, 0x4020, 0xcaca);
    assert!(legacy::prepare_extraction(&mut working, &i)
        .unwrap()
        .is_empty());
}
