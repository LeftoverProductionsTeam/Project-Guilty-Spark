//! Compile fresh original source with owner-installed H1A tools. No deployment.
use spark_core::{forge_build::{self,ForgeToolchain},quickforge::{self,ForgeBrush,BrushKind},project::Project,runtime::RuntimeId};
use std::{path::Path,sync::{Arc,atomic::AtomicBool}};
fn main()->Result<(),Box<dyn std::error::Error>>{
    let args:Vec<_>=std::env::args().collect();if args.len()!=6{return Err("Usage: verify_forge_collision <installed H1A kit> <owned tags> <installed Invader> <fresh jobs root> <room|tunnel>".into());}
    let mut p=Project::new("C33 collision acceptance");let mut document=quickforge::create_arena("c33_collision_acceptance","emptyArena")?;document.runtime_id=RuntimeId::MccSteam;
    document.sky_path=Some("levels/test/bloodgulch/bloodgulch".into());
    document.materials[0].name="example_tutorial_metal_floor".into();document.materials[0].shader_path=Some("levels/test/tutorial/shaders/example_tutorial_metal_floor".into());
    if args[5]=="tunnel"{document.name="c33_tunnel_acceptance".into();document.geometry.push(ForgeBrush{id:uuid::Uuid::new_v4().to_string(),name:"Original contained tunnel collision acceptance".into(),kind:BrushKind::CaveTunnel,position:[0.,0.,2.],rotation:[0.;3],dimensions:[8.,3.,3.],material_id:document.materials[0].id.clone(),visible:true,locked:false,steps:12,heights:vec![]});}
    let report=quickforge::validate(&document)?;p.quick_forge=Some(document);
    let tools=ForgeToolchain{hek_directory:Some((&args[1]).into()),hek_tags_directory:Some((&args[2]).into()),invader_directory:Some((&args[3]).into()),hek_flavor:Some("h1aEk".into())};
    let root=Path::new(&args[4]);if root.exists(){return Err("Choose a fresh acceptance jobs folder".into());}std::fs::create_dir_all(root)?;
    let receipt=forge_build::run_job(&p,&tools,root,&uuid::Uuid::new_v4().to_string(),false,vec![],Arc::new(AtomicBool::new(false)),|event|eprintln!("{}: {}",event.phase,event.message))?;
    println!("{}",serde_json::to_string_pretty(&serde_json::json!({"geometry":report,"receipt":receipt,"inGameCollisionVerified":false}))?);Ok(())
}
