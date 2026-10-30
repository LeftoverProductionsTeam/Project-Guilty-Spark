//! Read-only owned cache/resource diagnostic. Never writes game files or emits pixels.
use spark_core::{maps,bitmap_preview as bitmap};
use std::path::PathBuf;
fn main()->Result<(),Box<dyn std::error::Error>>{
 let args:Vec<_>=std::env::args_os().skip(1).collect();if args.len()!=2{return Err("usage: qa_map_materials <owned-map> <matching-bitmaps.map>".into());}
 let path=PathBuf::from(&args[0]);let resource=PathBuf::from(&args[1]);
 let inspection=maps::inspect_map(&path,resource.parent())?;let original=inspection.sha256.clone();let resource_hash=maps::hash_file(&resource)?;
 let compatibility=bitmap::verify_resource_for_source(&path,&original,&inspection,&resource,&resource_hash);
 let mut requests=Vec::new();let mut shaders=Vec::new();
 let mesh=serde_json::to_value(&inspection.render_mesh)?;let bsp_ids:std::collections::HashSet<u32>=mesh["materialRanges"].as_array().into_iter().flatten().filter_map(|r|r["shaderTagId"].as_u64().map(|id|id as u32)).collect();
 let mut ordered:Vec<_>=inspection.tags.iter().filter(|tag|tag.primary_bitmap_status.is_some()).collect();ordered.sort_by_key(|tag|!bsp_ids.contains(&tag.id));
 for tag in ordered{
  shaders.push(serde_json::json!({"class":tag.class,"path":tag.path,"primary":tag.primary_bitmap_status,"references":tag.references}));
  for reference in &tag.references{if reference.class=="bitm"&&!requests.iter().any(|r:&bitmap::OwnedBitmapRequest|r.bitmap_tag_id==reference.target_id)&&requests.len()<24{requests.push(bitmap::OwnedBitmapRequest{bitmap_tag_id:reference.target_id,image_index:0});}}
 }
 let batch=bitmap::preview_owned_bitmap_batch_with_resources(&path,&original,&inspection,&requests,Some((&resource,&resource_hash)))?;
 let items:Vec<_>=batch.items.into_iter().map(|item|serde_json::json!({"id":item.bitmap_tag_id,"path":inspection.tags.iter().find(|tag|tag.id==item.bitmap_tag_id).map(|tag|&tag.path),"error":item.error,"code":item.error_code,"preview":item.preview.map(|p|serde_json::json!({"width":p.width,"height":p.height,"format":p.format,"source":p.source_kind}))})).collect();
 if maps::hash_file(&path)?!=original||maps::hash_file(&resource)?!=resource_hash{return Err("Owned source changed during read-only diagnostic".into());}
 println!("{}",serde_json::to_string_pretty(&serde_json::json!({"sourceSha256":original,"resourceSha256":resource_hash,"cacheVersion":inspection.header.version,"bitmapTags":inspection.tags.iter().filter(|tag|tag.class=="bitm").count(),"compatibility":compatibility.map(|r|serde_json::to_value(r).unwrap()).map_err(|e|e.to_string()),"shaders":shaders,"sampledImages":items,"originalsUnchanged":true}))?);Ok(())
}
