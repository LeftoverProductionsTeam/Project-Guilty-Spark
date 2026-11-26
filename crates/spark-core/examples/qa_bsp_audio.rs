//! Read-only metadata probe; native build acceptance is a separate path.
fn main() -> spark_core::Result<()> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() == 4 && args[1] == "--sky-starts" {
        let Ok(bsp) = args[3].parse() else {
            return spark_core::invalid("BSP index must be a nonnegative integer");
        };
        return inspect_start_skies(std::path::Path::new(&args[2]), bsp);
    }
    if args.len() == 5 && args[1] == "--workspace" {
        let cache = std::path::Path::new(&args[2]);
        let sha = spark_core::maps::hash_file(cache)?;
        println!(
            "{}",
            serde_json::to_string(&spark_core::bsp_audio::inspect_workspace(
                &args[4],
                cache,
                &sha,
                std::path::Path::new(&args[3])
            )?)?
        );
        return Ok(());
    }
    if args.len() == 6 && args[1] == "--build" {
        spark_core::reject_links(std::path::Path::new(&args[3]))?;
        if std::fs::metadata(&args[3])?.len() > 4 * 1024 * 1024
            || std::path::Path::new(&args[5]).exists()
        {
            return spark_core::invalid(
                "QA build input exceeds 4 MiB or its report already exists",
            );
        }
        let project = spark_core::project::load_project(std::path::Path::new(&args[2]))?;
        let input: spark_core::working_tags::WorkingTagsInput =
            serde_json::from_slice(&std::fs::read(&args[3])?)?;
        if input.bsp_audio.is_none() {
            return spark_core::invalid("QA audio build needs an explicit request");
        }
        let record = spark_core::working_tags::run(
            &project,
            &input,
            std::path::Path::new(&args[4]),
            &uuid::Uuid::new_v4().to_string(),
            std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            |e| eprintln!("{} {} {}", e.phase, e.progress, e.message),
        )?;
        spark_core::project::atomic_write(
            std::path::Path::new(&args[5]),
            &serde_json::to_vec_pretty(&record)?,
            false,
        )?;
        if record.status != "validated" {
            return spark_core::invalid(record.message);
        }
        println!("{}", serde_json::to_string(&record)?);
        return Ok(());
    }
    if args.len() != 2 {
        return spark_core::invalid("qa_bsp_audio <owned.map> or --sky-starts <owned.map> <bsp>");
    }
    let path = std::path::Path::new(&args[1]);
    let sha = spark_core::maps::hash_file(path)?;
    println!(
        "{}",
        serde_json::to_string(&spark_core::bsp_audio::inspect(path, &sha)?)?
    );
    Ok(())
}

fn inspect_start_skies(cache: &std::path::Path, bsp_index: usize) -> spark_core::Result<()> {
    let map = spark_core::maps::inspect_map(cache, None)?;
    let ambience = spark_core::bsp_audio::inspect_ambience_for_bsp(cache, &map.sha256, Some(bsp_index))?;
    let Some(bsp) = ambience.bsps.first() else {
        return spark_core::invalid("Selected BSP is missing");
    };
    let Some(tree) = &bsp.listener_tree else {
        return spark_core::invalid("Selected BSP has no native listener tree");
    };
    let starts: Vec<_> = map
        .objects
        .iter()
        .filter(|row| row.kind == "Player spawn")
        .map(|row| {
            let mut eye = row.position;
            eye[2] += 0.62;
            let cluster = tree.cluster_at(eye).and_then(|index| bsp.clusters.get(index));
            serde_json::json!({
                "id": row.id,
                "eye": eye,
                "cluster": cluster.map(|cluster| cluster.index),
                "skySlot": cluster.map(|cluster| cluster.sky),
            })
        })
        .collect();
    println!("{}", serde_json::json!({
        "cacheSha256": map.sha256,
        "bspIndex": bsp_index,
        "starts": starts,
    }));
    Ok(())
}
