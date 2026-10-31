//! Opt-in read-only audit of an actual separately compiled native cache.
fn main()->Result<(),Box<dyn std::error::Error>>{
    let a:Vec<_>=std::env::args_os().skip(1).collect();
    if a.len()!=3{return Err("qa_sound_classes <map> safe|music-conflict <fresh-report.json>".into());}
    let path=std::path::PathBuf::from(&a[0]);let mode=a[1].to_string_lossy();
    if !matches!(mode.as_ref(),"safe"|"music-conflict"){return Err("Unknown expected result".into());}
    let output=std::path::PathBuf::from(&a[2]);if output.exists(){return Err("Report already exists".into());}
    let map=spark_core::maps::inspect_map(&path,None)?;
    let audit=spark_core::audio_rules::verify(&path,&map);
    let report=match audit {
        Ok(audit) if mode=="safe"=>serde_json::json!({"complete":true,"expected":"safe","sha256":map.sha256,"audit":audit}),
        Err(error) if mode=="music-conflict"&&error.to_string().contains("Unsafe Halo music-class combination")=>
            serde_json::json!({"complete":true,"expected":"music-conflict","sha256":map.sha256,"rejected":true,"reason":error.to_string()}),
        Ok(_)=>return Err("Expected native music-class conflict was not rejected".into()),
        Err(error)=>return Err(error.into()),
    };
    spark_core::project::atomic_write(&output,&serde_json::to_vec_pretty(&report)?,false)?;
    println!("{}",serde_json::to_string(&report)?);Ok(())
}
