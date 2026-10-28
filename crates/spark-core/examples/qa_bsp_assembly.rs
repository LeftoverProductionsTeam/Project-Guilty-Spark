//! Owner-run source and compiler acceptance of a connected imported BSP.
use spark_core::{bsp_assembly, library::Library, maps, Result};
use std::{fs, path::Path, sync::atomic::AtomicBool};
fn main() -> Result<()> {
    let a: Vec<_> = std::env::args().collect();
    if a.len() == 4 && a[1] == "--check" {
        let p = spark_core::project::load_project(Path::new(&a[2]))?;
        let source = p.source.as_ref().unwrap();
        let i = maps::inspect_map(&source.preserved_path, source.resource_directory.as_deref())?;
        let geometry = bsp_assembly::generate_project(&p, &i, &AtomicBool::new(false))?;
        let output = Path::new(&a[3]);
        if output.exists() {
            return Err(spark_core::SparkError::Invalid(
                "Recheck output must be a fresh JMS file".into(),
            ));
        }
        fs::write(output, bsp_assembly::export_jms(&geometry)?)?;
        println!("{}", serde_json::to_string(&geometry.report)?);
        return Ok(());
    }
    if a.len() != 6 {
        eprintln!("qa_bsp_assembly <base.map> <donor.map> <donor BSP index> <donor tags> <fresh output directory>");
        std::process::exit(2);
    }
    let out = Path::new(&a[5]);
    fs::create_dir(out)?;
    let out = fs::canonicalize(out)?;
    let lib = Library::open(&out.join("library"))?;
    let (mut p, i) = lib.import_map(Path::new(&a[1]), None)?;
    if i.header.version == 13 {
        if let Some(root) = Path::new(&a[1]).parent().and_then(Path::parent) {
            let packs = root.join("prebuild/paks");
            if packs.is_dir() {
                let source = p.source.as_mut().unwrap();
                source.resource_sha256 = spark_core::mcc_textures::pin(&packs, &i.header.name)?;
                source.resource_directory = Some(packs);
            }
        }
    }
    let (d, j) = lib.import_map(Path::new(&a[2]), None)?;
    let index = a[3]
        .parse()
        .map_err(|_| spark_core::SparkError::Invalid("Invalid BSP index".into()))?;
    let plan = bsp_assembly::plan(&p, &i, &d, &j, index, fs::canonicalize(&a[4])?)?;
    eprintln!("plan {}", serde_json::to_string(&plan)?);
    p.bsp_assembly = Some(plan);
    spark_core::project::save_project(&out.join("project.gsproject"), &p)?;
    let geometry = bsp_assembly::generate_project(&p, &i, &AtomicBool::new(false))?;
    fs::write(
        out.join("combined.jms"),
        bsp_assembly::export_jms(&geometry)?,
    )?;
    fs::write(
        out.join("geometry.json"),
        serde_json::to_vec(&geometry.mesh)?,
    )?;
    fs::write(
        out.join("materials.json"),
        serde_json::to_vec_pretty(&geometry.materials)?,
    )?;
    lib.save(&p, Some(&i))?;
    spark_core::project::save_project(&out.join("project.gsproject"), &p)?;
    fs::write(
        out.join("report.json"),
        serde_json::to_vec_pretty(&geometry.report)?,
    )?;
    println!("{}", serde_json::to_string(&geometry.report)?);
    Ok(())
}
