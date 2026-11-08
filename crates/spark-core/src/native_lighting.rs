//! Explicit native sky authoring and Tool radiosity in an existing isolated build.
//! Field names follow Invader HEK sky schema 696830ff80af227e84e7237c2ef26eb2301ed110.
//! No preview backdrop, original tag, compiled-cache patch or new native class is written.
use crate::{invalid, maps, project::{self,Project}, quickforge::EditorEnvironment, reject_links, safe_relative, Result, SparkError};
use crate::build::Runner;
use serde::{Deserialize,Serialize};
use std::{fs,path::{Path,PathBuf}};
#[derive(Clone,Debug,PartialEq,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct NativeLighting {
    pub sky_path:String,
    pub environment:EditorEnvironment,
    pub quality:String,
}
impl NativeLighting {
    pub fn validate(&self)->Result<()> {
        self.environment.validate()?;
        if self.sky_path.is_empty()||self.sky_path.len()>220||self.sky_path.ends_with(".sky")||safe_relative(&self.sky_path).is_err()||!["draft","final"].contains(&self.quality.as_str()) {
            return invalid("Native lighting needs an existing sky tag path and draft/final bake quality");
        }
        Ok(())
    }
    pub fn lightmap_quality(&self)->[&str;2] {if self.quality=="final"{["1","0.01"]}else{["0","0.1"]}}
    fn values(&self)->Vec<(String,Vec<f32>)>{
        let e=&self.environment;let mut values=vec![];
        for prefix in ["indoor","outdoor"] {
            values.extend([
                (format!("{prefix}_ambient_radiosity_color"),e.ambient_color.to_vec()),
                (format!("{prefix}_ambient_radiosity_power"),vec![e.ambient_intensity]),
                (format!("{prefix}_fog_color"),e.fog_color.to_vec()),
                (format!("{prefix}_fog_maximum_density"),vec![1.]),
                (format!("{prefix}_fog_start_distance"),vec![if e.fog_enabled{e.fog_near}else{0.}]),
                (format!("{prefix}_fog_opaque_distance"),vec![if e.fog_enabled{e.fog_far}else{0.}]),
            ]);
        }
        values
    }
}
pub(crate) fn request(project:&Project)->Option<&NativeLighting>{project.quick_forge.as_ref().and_then(|doc|doc.native_lighting.as_ref()).or(project.native_lighting.as_ref())}
fn sky_path(project:&Project)->Result<String>{
    uuid::Uuid::parse_str(&project.id).map_err(|_|SparkError::Invalid("Native lighting needs a valid project identity".into()))?;
    Ok(format!("levels/guilty_spark_lighting/{}/sky",project.id.replace('-',"")))
}
fn tag(root:&Path,name:&str)->Result<PathBuf>{Ok(root.join(safe_relative(&format!("{name}.sky"))?))}
fn floats(output:&str,expected:&[f32])->Result<()> {
    let values=output.trim().split(',').map(|v|v.trim().parse::<f32>()).collect::<std::result::Result<Vec<_>,_>>().map_err(|_|SparkError::Invalid("Native sky readback is not numeric".into()))?;
    if values.len()!=expected.len()||values.iter().zip(expected).any(|(a,b)|!a.is_finite()||(*a-*b).abs()>0.0001_f32.max(b.abs()*0.00001)) {return invalid("Native sky readback differs from the reviewed lighting request");}Ok(())
}
/// The caller already admitted/copied this build's native dependency closure.
pub(crate) fn apply(project:&Project,tags:&Path,scenario:&str,edit:&Path,runner:&Runner<'_>,workspace:&Path)->Result<()> {
    let Some(request)=request(project)else{return Ok(())};request.validate()?;
    let query=|key:&str,sky:&str|runner.run(edit,&["-t".into(),tags.to_string_lossy().into_owned(),"-G".into(),key.into(),format!("{sky}.sky")],workspace,"lighting-readback",65);
    let source=tag(tags,&request.sky_path)?;reject_links(&source)?;
    if fs::metadata(&source)?.len()>64*1024*1024{return invalid("Native sky exceeds its 64 MiB authoring bound");}
    let source_hash=maps::hash_file(&source)?;
    let name=sky_path(project)?;let candidate=tag(tags,&name)?;reject_links(&candidate)?;
    if candidate.exists(){return invalid("Generated lighting sky already exists; original source was not overwritten");}
    let scenario_tag=format!("{scenario}.scenario");
    let count=runner.run(edit,&["-t".into(),tags.to_string_lossy().into_owned(),"-C".into(),"skies".into(),scenario_tag.clone()],workspace,"lighting-source",64)?;
    if count.trim()!="1"{return invalid("This lighting bake currently requires exactly one scenario sky; multiple cluster skies need individual authoring");}
    let bound=runner.run(edit,&["-t".into(),tags.to_string_lossy().into_owned(),"-G".into(),"skies[0].sky".into(),scenario_tag.clone()],workspace,"lighting-source",64)?;
    if bound.trim().replace('\\',"/").to_ascii_lowercase()!=format!("{}.sky",request.sky_path).replace('\\',"/").to_ascii_lowercase(){return invalid("Scenario sky differs from the selected lighting source; recheck the source before baking");}
    fs::create_dir_all(candidate.parent().unwrap())?;
    crate::native_staging::copy_file(&source,&candidate,fs::metadata(&source)?.len(),Some(&source_hash),runner.cancel)?;
    let lights=runner.run(edit,&["-t".into(),tags.to_string_lossy().into_owned(),"-C".into(),"lights".into(),format!("{name}.sky")],workspace,"lighting-source",65)?.trim().parse::<usize>().map_err(|_|SparkError::Invalid("Native sky light count is invalid".into()))?;
    if lights>8{return invalid("Native sky exceeds eight supported lights");}
    let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned()];
    let add_sun=lights==0;
    if add_sun{args.extend(["-I".into(),"lights".into(),"1".into(),"end".into(),"-S".into(),"lights[0].flags.affects_exteriors".into(),"1".into()]);}
    let mut values=request.values();
    if lights>0||add_sun {values.extend([
        ("lights[0].color".into(),request.environment.sun_color.to_vec()),
        ("lights[0].power".into(),vec![request.environment.sun_intensity]),
        ("lights[0].direction".into(),vec![request.environment.sun_azimuth.to_radians(),request.environment.sun_elevation.to_radians()]),
    ]);}
    for (key,value) in &values{args.extend(["-S".into(),key.clone(),value.iter().map(f32::to_string).collect::<Vec<_>>().join(",")]);}
    args.push(format!("{name}.sky"));runner.run(edit,&args,workspace,"lighting-author",66)?;
    for (key,value) in &values{
        // Pinned Invader CLI SET uses native radians, GET presents Euler degrees.
        let expected=if key=="lights[0].direction"{value.iter().map(|v|v.to_degrees()).collect::<Vec<_>>()}else{value.clone()};
        floats(&query(key,&name)?,&expected)?;
    }
    runner.run(edit,&["-t".into(),tags.to_string_lossy().into_owned(),"-S".into(),"skies[0].sky".into(),format!("{name}.sky"),scenario_tag],workspace,"lighting-bind",67)?;
    if maps::hash_file(&source)?!=source_hash{return invalid("Original staged sky changed during lighting authoring; build rejected");}
    project::atomic_write(&workspace.join("native-lighting.json"),&serde_json::to_vec_pretty(&serde_json::json!({"schemaVersion":1,"request":request,"sourceSkySha256":source_hash,"authoredSky":name,"authoredSkySha256":maps::hash_file(&candidate)?,"nativeFieldReadback":true,"backdropColorApplied":false,"bakeStatus":"awaiting Tool radiosity and compiled-cache readback"}))?,false)?;
    Ok(())
}
pub(crate) fn verify_cache(project:&Project,path:&Path,inspection:&maps::MapInspection)->Result<()> {
    let Some(request)=request(project)else{return Ok(())};
    let actual=crate::appearance::inspect(path,&inspection.sha256,inspection)?;
    if actual.sky_path.as_ref().map(|p|p.replace('\\',"/"))!=Some(sky_path(project)?){return invalid("Compiled scenario did not retain its authored lighting sky");}
    let render=maps::render_bsp_source(path,inspection,0)?;
    if !render.material_ranges.iter().any(|range|range.lightmap_page>=0&&range.has_lightmap_uvs&&range.lightmap_bitmap_tag_id.is_some_and(|id|inspection.tags.iter().any(|tag|tag.id==id&&tag.class=="bitm"))){return invalid("Native lighting bake produced no independently readable BSP lightmap pages and UVs");}
    let e=actual.environment.ok_or_else(||SparkError::Invalid("Compiled native sky could not be independently read".into()))?;let wanted=&request.environment;
    for (a,b) in [(e.ambient_color,wanted.ambient_color),(e.sun_color,wanted.sun_color),(e.fog_color,wanted.fog_color)] {floats(&a.iter().map(f32::to_string).collect::<Vec<_>>().join(","),&b)?;}
    floats(&format!("{},{},{},{}",e.ambient_intensity,e.sun_intensity,e.sun_azimuth,e.sun_elevation),&[wanted.ambient_intensity,wanted.sun_intensity,wanted.sun_azimuth,wanted.sun_elevation])?;
    // Halo/Invader interpret zero density as the native default (one). A zero
    // distance range disables atmospheric fog, as in the original space skies.
    // Compare raw compiled distances, never the renderer's positive-range clamp.
    floats(&format!("{},{},{}",actual.fog_maximum_density,actual.fog_start_distance,actual.fog_opaque_distance),&[1.,if wanted.fog_enabled{wanted.fog_near}else{0.},if wanted.fog_enabled{wanted.fog_far}else{0.}])?;
    if e.fog_enabled!=wanted.fog_enabled{return invalid("Compiled native fog enablement differs from the lighting request");}Ok(())
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn lighting_uses_real_native_fields_and_excludes_preview_backdrop(){
        let r=NativeLighting{sky_path:"sky/example".into(),environment:EditorEnvironment::default(),quality:"draft".into()};r.validate().unwrap();
        let values=r.values();assert_eq!(values.len(),12);assert!(values.iter().any(|(k,_)|k=="indoor_ambient_radiosity_power"));assert!(!values.iter().any(|(k,_)|k.contains("sky_color")||k.contains("preview")));assert_eq!(r.lightmap_quality(),["0","0.1"]);
        let mut final_bake=r.clone();final_bake.quality="final".into();assert_eq!(final_bake.lightmap_quality(),["1","0.01"]);
        final_bake.sky_path="../sky".into();assert!(final_bake.validate().is_err());
    }
    #[test] fn fog_off_uses_native_zero_distance_range_not_defaulted_zero_density(){
        let mut request=NativeLighting{sky_path:"sky/example".into(),environment:EditorEnvironment::default(),quality:"draft".into()};
        request.environment.fog_enabled=false;
        let values=request.values();
        for prefix in ["indoor","outdoor"] {
            assert_eq!(values.iter().find(|(k,_)|k==&format!("{prefix}_fog_maximum_density")).unwrap().1,[1.]);
            for suffix in ["start_distance","opaque_distance"] {assert_eq!(values.iter().find(|(k,_)|k==&format!("{prefix}_fog_{suffix}")).unwrap().1,[0.]);}
        }
        request.environment.fog_enabled=true;request.environment.fog_near=20.;request.environment.fog_far=200.;
        let enabled=request.values();
        assert_eq!(enabled.iter().find(|(k,_)|k=="outdoor_fog_start_distance").unwrap().1,[20.]);
        assert_eq!(enabled.iter().find(|(k,_)|k=="outdoor_fog_opaque_distance").unwrap().1,[200.]);
    }
    #[test] fn readback_rejects_missing_nonfinite_and_changed_native_values(){assert!(floats("0.5, 1",&[0.5,1.]).is_ok());for v in ["NaN, 1","0.4, 1","0.5","0.5, 1, 0"]{assert!(floats(v,&[0.5,1.]).is_err());}}
}
