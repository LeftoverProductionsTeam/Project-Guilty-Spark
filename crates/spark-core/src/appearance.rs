//! Source-authored classic sky, lighting and atmospheric fog metadata.
use crate::{binary::Reader,maps::{self,MapInspection,MeshData},quickforge::EditorEnvironment,invalid,Result,SparkError};
use serde::{Serialize,Deserialize};
use std::path::Path;
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct SourceAppearance {
    pub source_sha256:String,pub sky_tag_id:Option<u32>,pub sky_path:Option<String>,
    pub environment:Option<EditorEnvironment>,pub fog_maximum_density:f32,
    pub sky_mesh:Option<MeshData>,pub warnings:Vec<String>,
}
pub fn inspect(path:&Path,hash:&str,inspection:&MapInspection)->Result<SourceAppearance>{
    let (header,bytes,actual)=maps::read_cache_snapshot(path)?;
    if actual!=hash||actual!=inspection.sha256{return invalid("Source changed during appearance inspection");}
    let mut result=SourceAppearance{source_sha256:actual,sky_tag_id:None,sky_path:None,environment:None,
        fog_maximum_density:0.,sky_mesh:None,warnings:vec![]};
    if !matches!(header.version,6|7|13|609){result.warnings.push("This engine's authored sky/appearance reader is not implemented".into());return Ok(result);}
    let start=header.tag_offset as usize;let end=start.checked_add(header.tag_size as usize).ok_or_else(||SparkError::Invalid("Sky tag region overflow".into()))?;
    let r=Reader(&bytes);r.bytes(start,header.tag_size as usize)?;
    let bounded=|at:usize,size:usize|->Result<()> {if at<start||at.checked_add(size).is_none_or(|last|last>end){return invalid("Sky metadata escapes bounded tag region");}r.bytes(at,size)?;Ok(())};
    let base=match header.version{6=>0x4bf1_0000,13=>r.u32(start)?.checked_sub(40).ok_or_else(||SparkError::Invalid("Invalid MCC tag base".into()))?,_=>0x4044_0000};
    let pointer=|value:u32,size:usize|->Result<usize>{
        let offset=value.checked_sub(base).ok_or_else(||SparkError::Invalid("Sky pointer precedes tag region".into()))? as usize;
        let at=start.checked_add(offset).ok_or_else(||SparkError::Invalid("Sky pointer overflow".into()))?;bounded(at,size)?;Ok(at)};
    let scenario=inspection.tags.iter().find(|t|t.class=="scnr"&&t.path==inspection.scenario_path)
        .and_then(|t|t.data_offset).ok_or_else(||SparkError::Invalid("Source scenario unavailable".into()))?;
    bounded(scenario,0x3c)?;let count=r.u32(scenario+0x30)? as usize;
    if count==0{return Ok(result)}if count>8{return invalid("Sky dependency count exceeds the classic limit");}
    let sky_refs=pointer(r.u32(scenario+0x34)?,count*16)?;
    if r.fourcc(sky_refs)?!="sky "{return invalid("Scenario sky reference has the wrong class");}
    let id=r.u32(sky_refs+12)?;
    let sky=inspection.tags.iter().find(|t|t.id==id&&t.class=="sky "&&!t.external)
        .ok_or_else(||SparkError::Invalid("Scenario sky datum does not identify an internal sky tag".into()))?;
    let at=sky.data_offset.ok_or_else(||SparkError::Invalid("Sky body unavailable".into()))?;bounded(at,208)?;
    let rgb=|p:usize|->Result<[f32;3]>{let c=[r.f32(p)?,r.f32(p+4)?,r.f32(p+8)?];if c.iter().any(|x|!(0.0..=1.0).contains(x)){return invalid("Sky colour outside supported range");}Ok(c)};
    let fog=rgb(at+0x58)?;let density=r.f32(at+0x6c)?;let near=r.f32(at+0x70)?;let far=r.f32(at+0x74)?;
    if !(0.0..=1.0).contains(&density)||near<0.||far<near||far>20_000.{return invalid("Unsupported source atmospheric fog range");}
    let mut env=EditorEnvironment{sky_color:fog,ambient_color:rgb(at+0x48)?,ambient_intensity:r.f32(at+0x54)?.clamp(0.,5.),
        fog_color:fog,fog_near:near,fog_far:far.max(near+1.),fog_enabled:density>0.,..Default::default()};
    let lights=r.u32(at+0xc4)? as usize;
    if lights>32{return invalid("Source sky light count exceeds the bounded preview limit");}
    if lights>0 {let light=pointer(r.u32(at+0xc8)?,lights*116)?;
        env.sun_color=rgb(light+0x50)?;env.sun_intensity=r.f32(light+0x5c)?.clamp(0.,10.);
        env.sun_azimuth=r.f32(light+0x68)?.to_degrees().rem_euclid(360.);if env.sun_azimuth>180.{env.sun_azimuth-=360.;}
        env.sun_elevation=r.f32(light+0x6c)?.to_degrees().clamp(-90.,90.);
    }else{env.sun_intensity=0.;}
    result.sky_tag_id=Some(id);result.sky_path=Some(sky.path.clone());result.environment=Some(env);result.fog_maximum_density=density;
    if count>1{result.warnings.push("Multiple skies require BSP cluster/portal sky selection; this view currently uses scenario sky 0".into());}
    if matches!(r.fourcc(at)?.as_str(),"mod2"|"mode") {
        match crate::render::cached_model_mesh(&bytes,&header,&inspection.tags,r.u32(at+12)?){Ok(mesh)=>result.sky_mesh=Some(mesh),Err(e)=>result.warnings.push(e.to_string())}
    }
    Ok(result)
}
