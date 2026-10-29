//! Synthetic owner-run Tool input; no game assets or executables are bundled.
use spark_core::{
    bsp_assembly::{export_jms, AssemblyGeometry, AssemblyMaterial, AssemblyReport},
    bsp_visibility::{authored_centers, authored_portal_quad, VisibilityZone},
    maps::MeshData,
    Result,
};
use std::{fs::OpenOptions, io::Write, path::Path};
fn quad(mesh: &mut MeshData, slots: &mut Vec<usize>, p: [[f64; 3]; 4], material: usize) {
    let a = std::array::from_fn::<_, 3, _>(|i| p[1][i] - p[0][i]);
    let b = std::array::from_fn::<_, 3, _>(|i| p[2][i] - p[0][i]);
    let n = [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
    let len = n.iter().map(|v| v * v).sum::<f64>().sqrt();
    let at = mesh.positions.len() as u32 / 3;
    for (i, p) in p.iter().enumerate() {
        mesh.positions.extend(p.map(|v| v as f32));
        mesh.normals.extend(n.map(|v| (v / len) as f32));
        mesh.uvs.extend([[0., 0.], [1., 0.], [1., 1.], [0., 1.]][i]);
    }
    mesh.indices
        .extend([at, at + 1, at + 2, at, at + 2, at + 3]);
    slots.extend([material, material]);
}
fn main() -> Result<()> {
    let args: Vec<_> = std::env::args().collect();
    if args.len()==3 && args[1]=="--fingerprint" {
        let project=spark_core::project::load_project(Path::new(&args[2]))?;
        println!("{}",project.fingerprint()?);
        return Ok(());
    }
    if args.len() != 3 {
        return spark_core::invalid(
            "qa_visibility_zones <fresh-baseline.jms> <fresh-authored.jms>",
        );
    }
    let (mut mesh, mut slots) = (MeshData::default(), vec![]);
    for p in [
        [[0., -2., 0.], [12., -2., 0.], [12., 2., 0.], [0., 2., 0.]],
        [[0., 2., 3.], [12., 2., 3.], [12., -2., 3.], [0., -2., 3.]],
        [[0., -2., 0.], [0., 2., 0.], [0., 2., 3.], [0., -2., 3.]],
        [[12., 2., 0.], [12., -2., 0.], [12., -2., 3.], [12., 2., 3.]],
        [[12., -2., 0.], [0., -2., 0.], [0., -2., 3.], [12., -2., 3.]],
        [[0., 2., 0.], [12., 2., 0.], [12., 2., 3.], [0., 2., 3.]],
    ] {
        quad(&mut mesh, &mut slots, p, 0);
    }
    let mut geometry = AssemblyGeometry {
        mesh,
        triangle_materials: slots,
        materials: vec![AssemblyMaterial {
            name: "example_tutorial_metal_floor".into(),
            source: 0,
            shader_path: None,
            shader_class: None,
            flags: 0,
            collision_only: false,
        }],
        report: AssemblyReport {
            input_triangles: 12,
            output_triangles: 12,
            generated_uv_faces: 0,
            walk_samples: 0,
            portal_count: 0,
            donor_scenery: 0,
            warnings: vec![],
        },
    };
    let write = |path: &str, geometry: &AssemblyGeometry| -> Result<()> {
        let path = Path::new(path);
        spark_core::reject_links(path)?;
        let mut file = OpenOptions::new().create_new(true).write(true).open(path)?;
        file.write_all(export_jms(geometry)?.as_bytes())?;
        Ok(())
    };
    write(&args[1], &geometry)?;
    let zones = vec![VisibilityZone::Tunnel {
        id: uuid::Uuid::nil().to_string(),
        name: "Native portal zone".into(),
        segment: 0,
        start: 0.25,
        end: 0.75,
    }];
    for center in authored_centers(&zones, &[[0.; 3], [12., 0., 0.]], 0)?.unwrap() {
        quad(
            &mut geometry.mesh,
            &mut geometry.triangle_materials,
            authored_portal_quad(center, [12., 0., 0.], 4., 3.)?,
            1,
        );
    }
    geometry.materials.push(AssemblyMaterial {
        name: "+portal".into(),
        source: 0,
        shader_path: None,
        shader_class: None,
        flags: 0,
        collision_only: false,
    });
    geometry.report.portal_count = 2;
    geometry.report.output_triangles = 16;
    write(&args[2], &geometry)?;
    println!(
        "{}",
        serde_json::json!({"baselineTriangles":12,"authoredTriangles":16,"authoredPortals":2,"scope":"Synthetic JMS via product VisibilityZone centers/authored_portal_quad and export_jms; compile/game acceptance separate"})
    );
    Ok(())
}
