//! Read-only opt-in audit of an actual authored OBJ project and native cache.
//! Reuses the production model planner/reader, never rewrites accepted evidence.
use spark_core::{maps,model_build,project,Result,SparkError};
use std::path::PathBuf;
fn audit() -> Result<()> {
    let args=std::env::args_os().skip(1).map(PathBuf::from).collect::<Vec<_>>();
    let probes=args.len()==3&&args[2].as_os_str()=="--probe-in-memory";
    if args.len()!=2&&!probes{return Err(SparkError::Invalid("qa_model_fidelity <project.gsproject> <compiled.map> [--probe-in-memory]".into()));}
    for path in &args[..2] {spark_core::reject_links(path)?;}
    let source_hash=maps::hash_file(&args[0])?;
    let project=project::load_project(&args[0])?;
    let plan=model_build::plan(&project)?;
    if plan.models.is_empty(){return Err(SparkError::Invalid("Actual imported OBJ models are required; empty audit refused".into()));}
    let inspection=maps::inspect_map(&args[1],None)?;
    if std::env::var_os("SPARK_QA_MODEL_DUMP").is_some(){
        let model=&plan.models[0];
        if std::fs::metadata(&args[1])?.len()>768*1024*1024{return Err(SparkError::Invalid("Diagnostic cache exceeds its byte bound".into()));}
        let bytes=std::fs::read(&args[1])?;
        let tag=inspection.tags.iter().find(|tag|tag.class=="scen"&&tag.path.replace('\\',"/")==model.tag).ok_or_else(||SparkError::Invalid("Missing compiled source model".into()))?;
        let (_,mesh)=spark_core::render::object_model_mesh(&bytes,&inspection.header,&inspection.tags,tag.id,0)?;
        let triangles=mesh.indices.chunks_exact(3).take(12).map(|tri|tri.iter().map(|&i|{let i=i as usize;serde_json::json!({"position":&mesh.positions[i*3..i*3+3],"normal":&mesh.normals[i*3..i*3+3],"uv":&mesh.uvs[i*2..i*2+2]})}).collect::<Vec<_>>()).collect::<Vec<_>>();
        println!("{}",serde_json::to_string_pretty(&serde_json::json!({"diagnosticOnly":true,"firstModel":model.tag,"triangles":triangles}))?);
    }
    let evidence=plan.inspect_cache(&inspection,&args[1])?;
    let mut rejected_probes=Vec::new();
    if probes {
        let bytes=std::fs::read(&args[1])?;
        let tag=inspection.tags.iter().find(|tag|tag.class=="scen"&&tag.path.replace('\\',"/")==plan.models[0].tag).ok_or_else(||SparkError::Invalid("Missing probe model".into()))?;
        let (_,mesh)=spark_core::render::object_model_mesh(&bytes,&inspection.header,&inspection.tags,tag.id,0)?;
        let ranges=mesh.material_ranges.iter().map(|range|model_build::SourceMaterialRange{index_start:range.index_start,index_count:range.index_count,shader_path:inspection.tags.iter().find(|tag|tag.id==range.shader_tag_id).unwrap().path.clone()}).collect::<Vec<_>>();
        for kind in ["uv","normal","winding","shader"] {
            let mut changed=mesh.clone();let mut tags=inspection.tags.clone();
            match kind {"uv"=>changed.uvs[0]+=0.25,"normal"=>{for n in &mut changed.normals{*n = -*n;}},"winding"=>changed.indices.swap(0,1),_=>{tags.iter_mut().find(|tag|tag.id==changed.material_ranges[0].shader_tag_id).unwrap().path="unrelated/probe_shader".into();}}
            if model_build::compare_render(&mesh,&ranges,&changed,&tags).is_ok(){return Err(SparkError::Invalid(format!("In-memory native {kind} corruption was not rejected")));}
            rejected_probes.push(kind);
        }
    }
    plan.verify_sources()?;
    if maps::hash_file(&args[0])?!=source_hash || maps::hash_file(&args[1])?!=inspection.sha256{return Err(SparkError::Invalid("Source or output changed during read-only fidelity audit".into()));}
    println!("{}",serde_json::to_string_pretty(&serde_json::json!({"schemaVersion":1,"sourceProjectSha256":source_hash,"cacheSha256":inspection.sha256,"evidence":evidence,"rejectedInMemoryNativeProbes":rejected_probes,"sourceUnchanged":true,"gameplayAccepted":false}))?);
    Ok(())
}
fn main(){if let Err(error)=audit(){eprintln!("{error}");std::process::exit(1);}}
