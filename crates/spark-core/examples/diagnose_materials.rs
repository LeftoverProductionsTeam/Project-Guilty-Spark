//! Read-only exact-image diagnostic, without exporting any game pixels.
use spark_core::{bitmap_preview::{self, OwnedBitmapRequest}, maps};
use std::path::Path;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 4 { return Err("Usage: diagnose_materials <map> <resources folder> <requests.json>".into()); }
    let inspection = maps::inspect_map(Path::new(&args[1]), Some(Path::new(&args[2])))?;
    let requests: Vec<OwnedBitmapRequest> = serde_json::from_slice(&std::fs::read(&args[3])?)?;
    let resource = Path::new(&args[2]).join("bitmaps.map");
    let hash = maps::hash_file(&resource)?;
    let batch = bitmap_preview::preview_owned_bitmap_batch_with_resources(
        Path::new(&args[1]), &inspection.sha256, &inspection, &requests, Some((&resource,&hash)))?;
    let items: Vec<_> = batch.items.iter().map(|i| serde_json::json!({
        "bitmapTagId":i.bitmap_tag_id,"imageIndex":i.image_index,"error":i.error,"errorCode":i.error_code,
        "preview":i.preview.as_ref().map(|p| serde_json::json!({"width":p.width,"height":p.height,
            "format":p.format,"sourceKind":p.source_kind,"ddsBase64Length":p.dds_base64.len()}))
    })).collect();
    println!("{}",serde_json::to_string_pretty(&serde_json::json!({
        "sourceSha256":batch.source_sha256,"resourceSha256":batch.resource_sha256,"items":items}))?);
    Ok(())
}
