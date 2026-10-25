#![allow(dead_code)]
pub fn put_u32(b: &mut [u8], at: usize, n: u32) {
    b[at..at + 4].copy_from_slice(&n.to_le_bytes());
}
pub fn put_u16(b: &mut [u8], at: usize, n: u16) {
    b[at..at + 2].copy_from_slice(&n.to_le_bytes());
}
pub fn put_f32(b: &mut [u8], at: usize, n: f32) {
    b[at..at + 4].copy_from_slice(&n.to_le_bytes());
}
pub fn text(b: &mut [u8], at: usize, s: &str) {
    b[at..at + s.len()].copy_from_slice(s.as_bytes());
}
pub fn fourcc(b: &mut [u8], at: usize, s: &str) {
    let s = s.as_bytes();
    for i in 0..4 {
        b[at + i] = s[3 - i];
    }
}
pub fn base(version: u32) -> u32 {
    match version {
        5 => 0x803a6000,
        6 => 0x4bf10000,
        13 => 0x50000000,
        _ => 0x40440000,
    }
}
pub fn pointer(version: u32, offset: usize) -> u32 {
    base(version) + (offset - 0x800) as u32
}
pub fn fixture(version: u32) -> Vec<u8> {
    let mut b = vec![0; 0x5800];
    let len = b.len() as u32;
    if version == 6 {
        put_u32(&mut b, 0x2c0, 0x45686564);
        put_u32(&mut b, 0x5f0, 0x47666f74);
        put_u32(&mut b, 0x588, 6);
        text(&mut b, 0x58c, "fixture");
        text(&mut b, 0x2c8, "synthetic parser fixture");
        put_u16(&mut b, 2, 1);
        put_u32(&mut b, 0x5e8, len);
        put_u32(&mut b, 0x5ec, 0x800);
        put_u32(&mut b, 0x2c4, 0x5000);
    } else {
        put_u32(&mut b, 0, 0x68656164);
        put_u32(&mut b, 0x7fc, 0x666f6f74);
        put_u32(&mut b, 4, version);
        text(&mut b, 0x20, "fixture");
        text(&mut b, 0x40, "synthetic parser fixture");
        put_u16(&mut b, 0x60, 1);
        put_u32(&mut b, 8, len);
        put_u32(&mut b, 0x10, 0x800);
        put_u32(&mut b, 0x14, 0x5000);
    }
    let th = if version == 5 { 0x24 } else { 0x28 };
    put_u32(&mut b, 0x800, pointer(version, 0x800 + th));
    put_u32(&mut b, 0x804, 0xe0000000);
    put_u32(&mut b, 0x80c, 4);
    put_u32(&mut b, 0x800 + th - 4, 0x74616773);
    for (i, (class, path, at)) in [
        ("scnr", "levels\\fixture\\fixture", 0x1000),
        ("weap", "weapons\\pistol\\pistol", 0x1800),
        ("proj", "weapons\\bullet\\bullet", 0x2200),
        ("proj", "weapons\\rocket\\rocket", 0x2600),
    ]
    .iter()
    .enumerate()
    {
        let row = 0x800 + th + i * 32;
        fourcc(&mut b, row, class);
        put_u32(&mut b, row + 12, 0xe0000000 + i as u32);
        let name = 0x900 + i * 0x80;
        text(&mut b, name, path);
        put_u32(&mut b, row + 16, pointer(version, name));
        put_u32(&mut b, row + 20, pointer(version, *at));
    }
    put_f32(&mut b, 0x1804, 0.5);
    put_f32(&mut b, 0x1820, 1.0);
    put_f32(&mut b, 0x1b38, 0.25);
    put_u32(&mut b, 0x1cfc, 1);
    put_u32(&mut b, 0x1d00, pointer(version, 0x2000));
    put_f32(&mut b, 0x2004, 5.0);
    put_f32(&mut b, 0x2008, 6.0);
    fourcc(&mut b, 0x2094, "proj");
    put_u32(&mut b, 0x2098, pointer(version, 0xa00));
    put_u32(&mut b, 0x20a0, 0xe0000002);
    for at in [0x2200, 0x2600] {
        put_f32(&mut b, at + 4, 0.1);
        put_f32(&mut b, at + 0x20, 1.0);
        put_f32(&mut b, at + 0x1e4, 15.0);
    }
    put_u32(&mut b, 0x1210, 1);
    put_u32(&mut b, 0x1214, pointer(version, 0x3000));
    put_u32(&mut b, 0x121c, 1);
    put_u32(&mut b, 0x1220, pointer(version, 0x3100));
    put_u32(&mut b, 0x310c, 0xe0000001);
    put_f32(&mut b, 0x3008, 1.0);
    put_f32(&mut b, 0x300c, 2.0);
    put_f32(&mut b, 0x3010, 3.0);
    put_u32(&mut b, 0x1354, 1);
    put_u32(&mut b, 0x1358, pointer(version, 0x3200));
    put_f32(&mut b, 0x3200, 5.0);
    put_f32(&mut b, 0x320c, 0.5);
    b
}
pub fn write_map(path: &std::path::Path, version: u32) {
    std::fs::write(path, fixture(version)).unwrap();
}
