//! Real two-original-region native CE compiler acceptance. Player proof is separate.
use spark_core::{bsp_assembly,library::Library,project::{self,EngineBuildTarget},runtime::RuntimeId,Result};
use std::{fs,path::Path,sync::{Arc,atomic::AtomicBool}};
fn main()->Result<()>{
    let a=std::env::args().skip(1).collect::<Vec<_>>();
    if a.len()!=7{return spark_core::invalid("qa_megaworld_ce <base CE.map> <donor CE.map> <reviewed CE tags> <H1A kit> <Invader> <fresh output> <previous connection project or auto>");}
    let out=Path::new(&a[5]);fs::create_dir(out)?;let lib=Library::open(&out.join("library"))?;
    let (mut p,i)=lib.import_map(Path::new(&a[0]),Path::new(&a[0]).parent())?;
    let (donor,j)=lib.import_map(Path::new(&a[1]),Path::new(&a[1]).parent())?;
    let tags=fs::canonicalize(&a[2])?;let mut plan=if a[6]=="terrain"{bsp_assembly::plan_terrain(&p,&i,&donor,&j,0,tags.clone())?}else{bsp_assembly::plan(&p,&i,&donor,&j,0,tags.clone())?};
    if a[6]!="auto"&&a[6]!="terrain"{let prior=project::load_project(Path::new(&a[6]))?;let known=prior.bsp_assembly.ok_or_else(||spark_core::SparkError::Invalid("Previous plan has no connection".into()))?;plan.translation=known.translation;plan.yaw_degrees=known.yaw_degrees;plan.tunnel_points=known.tunnel_points;plan.tunnel_width=known.tunnel_width;plan.tunnel_height=known.tunnel_height;plan.tunnel_shader_path=known.tunnel_shader_path;plan.visibility_zones=known.visibility_zones;plan.open_road=known.open_road;plan.infantry_tunnel=known.infantry_tunnel;plan.high_ground=known.high_ground;plan.terrain_seam=known.terrain_seam;plan.sections=known.sections;plan.arch_segments=known.arch_segments;}
    plan.include_donor_scenery=true;p.bsp_assembly=Some(plan);p.title="C43 Timberland + Sidewinder CE".into();
    let target=EngineBuildTarget{id:uuid::Uuid::new_v4().to_string(),name:"Reviewed CE original regions".into(),runtime_id:RuntimeId::HaloCustomEdition,builder:"invader-ce".into(),hek_directory:Some(fs::canonicalize(&a[3])?),hek_flavor:Some("h1aEk".into()),tags_directory:Some(tags),invader_directory:Some(fs::canonicalize(&a[4])?),ce_compatible_tagset:true,open_sauce:false};p.active_build_target=Some(target.id.clone());p.build_targets.push(target);
    project::save_project(&out.join("connection.gsproject"),&p)?;lib.save(&p,Some(&i))?;
    let id=uuid::Uuid::new_v4().to_string();let log=out.join("native-events.jsonl");
    let record=spark_core::megaworld_build::run(&p,&i,&out.join("library/jobs"),&id,Arc::new(AtomicBool::new(false)),|event|{
        use std::io::Write;if let Ok(mut file)=fs::OpenOptions::new().create(true).append(true).open(&log){let _=writeln!(file,"{}",serde_json::to_string(&event).unwrap());}eprintln!("{}: {}",event.phase,event.message);
    })?;
    p.builds.push(record.clone());lib.save(&p,Some(&i))?;project::save_project(&out.join("compiled.gsproject"),&p)?;
    project::atomic_write(&out.join("acceptance.json"),&serde_json::to_vec_pretty(&serde_json::json!({"build":record,"projectId":p.id,"gameplayVerified":false,"streaming":false}))?,false)?;
    println!("Validated CE cache {}",record.sha256.unwrap());Ok(())
}
