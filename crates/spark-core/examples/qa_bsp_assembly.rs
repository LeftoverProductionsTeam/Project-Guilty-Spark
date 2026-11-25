//! Owner-run source and compiler acceptance of a connected imported BSP.
use spark_core::{bsp_assembly, library::Library, maps, Result};
use std::{fs, path::Path, sync::atomic::AtomicBool};
fn main() -> Result<()> {
    let mut a: Vec<_> = std::env::args().collect();
    let plan_only = a.get(1).is_some_and(|arg| arg == "--plan-only");
    if plan_only { a.remove(1); }
    let direction = if a.get(1).is_some_and(|arg| arg == "--direction") {
        a.remove(1);
        let angle = a.get(1).and_then(|arg| arg.parse::<f64>().ok())
            .ok_or_else(|| spark_core::SparkError::Invalid("Missing tunnel direction in degrees".into()))?;
        a.remove(1);
        angle
    } else { 0. };
    let terrain=a.get(1).is_some_and(|v|v=="--terrain");if terrain{a.remove(1);}
    let edge_section = if a.get(1).is_some_and(|v| v == "--edge-section") {
        a.remove(1);
        let offset: f64 = a.get(1).ok_or_else(|| spark_core::SparkError::Invalid("Choose an explicit seam-section branch offset".into()))?.parse().map_err(|_| spark_core::SparkError::Invalid("Invalid seam-section offset".into()))?;
        if !offset.is_finite() || offset.abs() > 64. { return spark_core::invalid("Section offset must be finite and within 64 units"); }
        a.remove(1); Some(offset)
    } else { None };
    if a.len() == 4 && a[1] == "--verify-walkthrough" {
        let p = spark_core::project::load_project(Path::new(&a[3]))?;
        let route = p.bsp_assembly.as_ref().ok_or_else(|| spark_core::SparkError::Invalid("Project has no connection route".into()))?;
        let report = bsp_assembly::verify_compiled_walkthrough(Path::new(&a[2]), route)?;
        println!("{}", serde_json::to_string(&report)?);
        if report.starts.iter().any(|s| s.issue.is_some()) { std::process::exit(2); }
        return Ok(());
    }
    if a.len() == 3 && a[1] == "--read-native-transitions" {
        let file = Path::new(&a[2]);
        let map = maps::inspect_map(file, None)?;
        println!("{}", serde_json::to_string(&maps::scenario_bsp_transitions(file, &map)?)?);
        return Ok(());
    }
    if a.len() >= 4 && a[1] == "--verify-cache" {
        if a.len() - 3 > bsp_assembly::MAX_COMPILED_CONNECTIONS {
            return spark_core::invalid(format!("Choose at most {} connection projects", bsp_assembly::MAX_COMPILED_CONNECTIONS));
        }
        let file = Path::new(&a[2]);
        let mut projects = vec![];
        let mut plans = vec![];
        for source in &a[3..] {
            let p = spark_core::project::load_project(Path::new(source))?;
            let plan = p.bsp_assembly.as_ref().ok_or_else(|| {
                spark_core::SparkError::Invalid(format!("{} has no connection route", p.title))
            })?;
            plans.push(plan.clone());
            projects.push(p);
        }
        let report = bsp_assembly::verify_compiled_routes(file, &plans)?;
        let mut routes = vec![];
        for ((p, source), samples) in projects.iter().zip(&a[3..]).zip(report.walk_samples) {
            routes.push(serde_json::json!({
                "projectTitle": p.title,
                "projectFileSha256": maps::hash_file(Path::new(source))?,
                "donorTitle": p.bsp_assembly.as_ref().unwrap().donor_title,
                "walkSamples": samples,
            }));
        }
        println!("{}", serde_json::json!({
            "cacheSha256": report.cache_sha256,
            "collisionTriangles": report.collision_triangles,
            "routes": routes,
            "status": "PASS",
            "scope": "BSP collision route sampling only; scenery and player physics need in-game testing",
        }));
        return Ok(());
    }
    if a.len() == 4 && a[1] == "--export-intact-connector" {
        let p = spark_core::project::load_project(Path::new(&a[2]))?;
        let source = p.source.as_ref().ok_or_else(|| spark_core::SparkError::Invalid("No preserved base map".into()))?;
        let base = maps::inspect_map(&source.preserved_path, source.resource_directory.as_deref())?;
        let connector = bsp_assembly::generate_preserved_connector(&p, &base, &AtomicBool::new(false))?;
        let output = Path::new(&a[3]);
        spark_core::reject_links(output)?;
        fs::create_dir(output)?;
        fs::write(output.join("connector.jms"), bsp_assembly::export_jms(&connector)?)?;
        fs::write(output.join("connector-materials.json"), serde_json::to_vec(&connector.materials)?)?;
        println!("{}", serde_json::to_string(&connector.report)?);
        return Ok(());
    }
    if a.len() == 4 && a[1] == "--export-partitions" {
        let p = spark_core::project::load_project(Path::new(&a[2]))?;
        let source = p.source.as_ref().ok_or_else(|| spark_core::SparkError::Invalid("No preserved base map".into()))?;
        let i = maps::inspect_map(&source.preserved_path, source.resource_directory.as_deref())?;
        let parts = bsp_assembly::generate_partitioned_project(&p, &i, &AtomicBool::new(false))?;
        let output = Path::new(&a[3]);
        fs::create_dir(output)?;
        for (name, geometry) in parts.base.iter().map(|base| ("base", base)).chain(std::iter::once(("donor", &parts.donor))) {
            fs::write(output.join(format!("{name}.jms")), bsp_assembly::export_jms(geometry)?)?;
            fs::write(output.join(format!("{name}-materials.json")), serde_json::to_vec(&geometry.materials)?)?;
        }
        let receipt = serde_json::json!({"base":parts.base.as_ref().map(|base| &base.report),"donor":parts.donor.report,"overlap":parts.overlap,"overlapSamples":parts.overlap_samples,"maxFloorDelta":parts.max_floor_delta,"switches":parts.switches});
        fs::write(output.join("partitions.json"), serde_json::to_vec_pretty(&receipt)?)?;
        println!("{receipt}");
        return Ok(());
    }
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
        eprintln!("qa_bsp_assembly [--plan-only] [--direction <degrees>] [--terrain | --edge-section <branch offset>] <base.map> <donor.map> <donor BSP index> <donor tags> <fresh output directory>");
        eprintln!("qa_bsp_assembly --export-partitions <connection-project.gsproject> <fresh output directory>");
        eprintln!("qa_bsp_assembly --read-native-transitions <compiled.map>");
        eprintln!("qa_bsp_assembly --verify-cache <compiled.map> <connection-project.gsproject> [...]");
        eprintln!("qa_bsp_assembly --verify-walkthrough <compiled.map> <connection-project.gsproject>");
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
    let plan = if terrain{bsp_assembly::plan_terrain(&p,&i,&d,&j,index,fs::canonicalize(&a[4])?)?}else{bsp_assembly::plan_in_direction(&p, &i, &d, &j, index, fs::canonicalize(&a[4])?, direction)?};
    let plan = if let Some(offset) = edge_section {
        // Exercise genuine rendered source edges, never manufactured points or
        // a shortcut around the same entrance checks used by viewport picks.
        let start = plan.tunnel_points[0];
        let base_edge = nearest_edge(&i, Path::new(&a[1]), 0, start)?;
        let end = *plan.tunnel_points.last().unwrap();
        let donor_at = std::array::from_fn(|k| end[k] - plan.translation[k]);
        let donor_edge = nearest_edge(&j, Path::new(&a[2]), index, donor_at)?;
        let mut next = bsp_assembly::append_edge_section(Path::new(&a[1]), &i, &plan, [base_edge, donor_edge])?;
        // Model a creator reshaping the section after the two genuine picks:
        // retain established walkable landings and branch in the free gap.
        let bend = |t: f64| std::array::from_fn(|k| start[k] + (end[k] - start[k]) * t + if k == 1 { offset } else { 0. });
        next.sections[0].points = vec![start, bend(0.25), bend(0.75), end];
        next.validate()?;
        next
    } else { plan };
    eprintln!("plan {}", serde_json::to_string(&plan)?);
    p.bsp_assembly = Some(plan);
    spark_core::project::save_project(&out.join("project.gsproject"), &p)?;
    if plan_only { return Ok(()); }
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

/// Deterministic installed-map fixture pick. Production still gets its edge
/// from the viewport; append_edge_section independently verifies this pick.
fn nearest_edge(i: &maps::MapInspection, source: &Path, bsp: usize, at: [f64; 3]) -> Result<bsp_assembly::SeamEdge> {
    let rendered = i.render_mesh.as_ref().ok_or_else(|| spark_core::SparkError::Invalid(format!("Source render geometry unavailable: {}", source.display())))?;
    let vertex = |id: u32| std::array::from_fn::<_, 3, _>(|k| rendered.positions[id as usize * 3 + k] as f64);
    let mut nearest: Option<(f64, [[f64; 3]; 2], [f64; 3])> = None;
    for range in rendered.material_ranges.iter().filter(|r| r.bsp_index == bsp) {
        for ids in rendered.indices[range.index_start..range.index_start + range.index_count].chunks_exact(3) {
            for n in 0..3 {
                let vertices = [vertex(ids[n]), vertex(ids[(n + 1) % 3])];
                let delta: [f64; 3] = std::array::from_fn(|k| vertices[1][k] - vertices[0][k]);
                let length = delta.iter().map(|v| v * v).sum::<f64>();
                if length < 1e-8 { continue; }
                let t = ((0..3).map(|k| (at[k] - vertices[0][k]) * delta[k]).sum::<f64>() / length).clamp(0., 1.);
                let point: [f64; 3] = std::array::from_fn(|k| vertices[0][k] + t * delta[k]);
                let distance = (0..3).map(|k| (point[k] - at[k]).powi(2)).sum();
                if nearest.as_ref().is_none_or(|(best, _, _)| distance < *best) { nearest = Some((distance, vertices, point)); }
            }
        }
    }
    let (_, vertices, point) = nearest.ok_or_else(|| spark_core::SparkError::Invalid("Source has no rendered BSP edges".into()))?;
    Ok(bsp_assembly::SeamEdge { source_sha256: i.sha256.clone(), bsp_index: bsp, vertices, point })
}
