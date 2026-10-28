use spark_core::{maps, render};
fn u32at(b: &mut [u8], at: usize, v: u32) {
    b[at..at + 4].copy_from_slice(&v.to_le_bytes());
}
fn u16at(b: &mut [u8], at: usize, v: u16) {
    b[at..at + 2].copy_from_slice(&v.to_le_bytes());
}
fn f32at(b: &mut [u8], at: usize, v: f32) {
    b[at..at + 4].copy_from_slice(&v.to_le_bytes());
}
#[test]
fn mcc_bsp_uses_separate_raw_vertex_pool_and_preserves_real_lightmap_uvs() {
    let mut b = vec![0u8; 0x6000];
    let scenario = 0x1800;
    let row = 0x1e00;
    let begin = 0x2800;
    let bsp = begin + 24;
    let lm = 0x2c30;
    let mat = 0x2c80;
    u32at(&mut b, 0, 0x68656164);
    u32at(&mut b, 4, 13);
    u32at(&mut b, 8, 0x6000);
    u32at(&mut b, 16, 0x1000);
    u32at(&mut b, 20, 0x5000);
    b[32..36].copy_from_slice(b"test");
    u32at(&mut b, 0x7fc, 0x666f6f74);
    u32at(&mut b, 0x1000, 0x50000028);
    u32at(&mut b, scenario + 0x5a4, 1);
    u32at(&mut b, scenario + 0x5a8, 0x50000e00);
    u32at(&mut b, row, begin as u32);
    u32at(&mut b, row + 4, 0x2000);
    u32at(&mut b, row + 8, 0x53000000);
    u32at(&mut b, begin, 0x53000018);
    u32at(&mut b, begin + 4, 228);
    u32at(&mut b, begin + 8, 0x800);
    b[bsp..bsp + 4].copy_from_slice(b"mtib");
    u32at(&mut b, bsp + 12, 7);
    u32at(&mut b, bsp + 0xf8, 1);
    u32at(&mut b, bsp + 0xfc, 0x53000400);
    u32at(&mut b, bsp + 0x104, 1);
    u32at(&mut b, bsp + 0x108, 0x53000430);
    u32at(&mut b, lm + 20, 1);
    u32at(&mut b, lm + 24, 0x53000480);
    u32at(&mut b, mat + 12, 9);
    u32at(&mut b, mat + 24, 1);
    u32at(&mut b, mat + 180, 3);
    u32at(&mut b, mat + 200, 3);
    u32at(&mut b, mat + 204, 168);
    for (i, xyz) in [[0., 0., 0.], [1., 0., 0.], [0., 1., 0.]]
        .iter()
        .enumerate()
    {
        for (n, x) in xyz.iter().enumerate() {
            f32at(&mut b, 0x800 + i * 56 + n * 4, *x);
        }
        f32at(&mut b, 0x800 + i * 56 + 20, 1.);
        f32at(&mut b, 0x800 + 168 + i * 20 + 12, i as f32 / 2.);
        f32at(&mut b, 0x800 + 168 + i * 20 + 16, 0.25);
    }
    for (i, v) in [0, 1, 2].iter().enumerate() {
        u16at(&mut b, 0x2c00 + i * 2, *v);
    }
    let header = maps::parse_header(&b, b.len() as u64).unwrap();
    let mesh = render::bsp_render_geometry(&b, &header, scenario).unwrap();
    assert_eq!(mesh.indices, [0, 1, 2]);
    assert_eq!(mesh.lightmap_uvs, [0., 0.25, 0.5, 0.25, 1., 0.25]);
    assert!(mesh.material_ranges[0].has_lightmap_uvs);
    u32at(&mut b, mat + 184, 228);
    assert!(render::bsp_render_geometry(&b, &header, scenario).is_err());
    u32at(&mut b, mat + 184, 0);
    u32at(&mut b, begin + 4, u32::MAX);
    assert!(render::bsp_render_geometry(&b, &header, scenario).is_err());
}
