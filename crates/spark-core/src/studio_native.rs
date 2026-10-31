//! Bounded semantic source collaboration. Complete, immutable scenery files are
//! admitted by the owner's local native reader before hosting. No offsets,
//! binary deltas, executable paths or remote tool commands are in this schema.
use crate::{invalid, quickforge::QuickForgeDocument, safe_relative, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

pub const MAX_ASSET_BYTES: usize = 16 * 1024;
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Source {
    pub inventory_sha256: String,
    pub field_tag: String,
    pub field_tag_sha256: String,
    pub bounding_radius: f64,
    pub template_tag: String,
    pub template_sha256: String,
    pub dependencies: BTreeMap<String, String>,
    pub preview_sha256: String,
    pub preview_tag_id: u32,
    pub preview_tag_path: String,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Field {
    pub id: String,
    pub bounding_radius: f64,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Asset {
    pub id: String,
    pub name: String,
    pub sha256: String,
    /// A complete admitted .scenery file, never a patch to somebody's tags.
    pub bytes: Vec<u8>,
}
impl Asset {
    pub fn tag_path(&self) -> String { format!("scenery/sparklink/{}", self.id) }
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Document {
    pub source: Source,
    pub fields: Vec<Field>,
    pub assets: Vec<Asset>,
}
pub fn digest(bytes: &[u8]) -> String { crate::hex_bytes(Sha256::digest(bytes)) }
pub fn inventory_hash(files: &BTreeMap<String, String>) -> Result<String> {
    Ok(digest(&serde_json::to_vec(files)?))
}
fn hash(s: &str) -> bool { s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) }
pub fn validate(doc: &QuickForgeDocument) -> Result<()> {
    let Some(native) = &doc.native else {
        if doc.placements.iter().any(|p|p.published_asset_id.is_some()) { return invalid("Published asset has no admitted native source"); }
        return Ok(());
    };
    let s = &native.source;
    if doc.runtime_id != crate::runtime::RuntimeId::MccSteam || !hash(&s.inventory_sha256)
        || !hash(&s.field_tag_sha256) || !hash(&s.template_sha256) || !hash(&s.preview_sha256)
        || s.field_tag != "weapons/pistol/pistol.weapon" || !s.template_tag.ends_with(".scenery")
        || s.dependencies.is_empty() || s.dependencies.len() > 256 || native.fields.len() > 1 || native.assets.len() > 8 {
        return invalid("Unsupported native collaboration admission or content bound");
    }
    for path in [&s.template_tag, &s.preview_tag_path] { safe_relative(path)?; }
    crate::native_operations::Operation::BoundingRadius{value:s.bounding_radius}.validate("weap", &s.field_tag)?;
    for (path, sha) in &s.dependencies { safe_relative(path)?; if !hash(sha) {return invalid("Invalid native dependency identity");} }
    for field in &native.fields {
        if field.id != "pistolBoundingRadius" { return invalid("Unsupported shared native field"); }
        crate::native_operations::Operation::BoundingRadius{value:field.bounding_radius}.validate("weap", &s.field_tag)?;
    }
    let mut ids = BTreeSet::new();
    for asset in &native.assets {
        if uuid::Uuid::parse_str(&asset.id).ok().is_none_or(|id|id.to_string()!=asset.id) || !ids.insert(&asset.id) || asset.name.trim().is_empty()
            || asset.name.len() > 80 || asset.name.chars().any(char::is_control) || asset.bytes.len() < 64
            || asset.bytes.len() > MAX_ASSET_BYTES || asset.sha256 != s.template_sha256 || digest(&asset.bytes) != asset.sha256 {
            return invalid("Native asset is not the complete, hash-verified owner-admitted scenery template");
        }
    }
    for placement in &doc.placements {
        if let Some(id) = &placement.published_asset_id {
            let Some(asset) = native.assets.iter().find(|a|&a.id == id) else { return invalid("Published asset is still placed in the world; remove its placements before withdrawing publication"); };
            if placement.tag_path != asset.tag_path() || placement.tag_class != "scen"
                || placement.tag_id != Some(s.preview_tag_id) || placement.source_sha256.as_deref() != Some(&s.preview_sha256) {
                return invalid("Published placement does not match its admitted native file and owned preview model");
            }
        } else if placement.tag_path.starts_with("scenery/sparklink/") { return invalid("Shared native asset placements require a publication identity"); }
    }
    Ok(())
}
/// Atomic entity inverses preserve other authors' independent fields/assets.
fn merge_rows<T: Clone + PartialEq>(base:&[T], next:&[T], current:&[T], id:impl Fn(&T)->&str) -> Result<Vec<T>> {
    let mut out = current.to_vec();
    let ids:BTreeSet<_> = base.iter().chain(next).map(&id).collect();
    for key in ids {
        let b=base.iter().find(|x|id(x)==key); let n=next.iter().find(|x|id(x)==key);
        if b==n {continue;} let i=out.iter().position(|x|id(x)==key);
        if i.and_then(|i|out.get(i)) != b && i.and_then(|i|out.get(i)) != n {
            return invalid(format!("Concurrent native edit/delete conflict: {key}. Your draft is retained."));
        }
        match (i,n) { (Some(i),Some(n))=>out[i]=n.clone(), (None,Some(n))=>out.push(n.clone()), (Some(i),None)=>{out.remove(i);}, _=>{} }
    }
    Ok(out)
}
pub fn merge(base:&Option<Document>, next:&Option<Document>, current:&Option<Document>) -> Result<Option<Document>> {
    match (base,next,current) {
        (None,None,None)=>Ok(None),
        (Some(b),Some(n),Some(c)) if b.source==n.source && b.source==c.source => Ok(Some(Document {
            source:c.source.clone(),
            fields:merge_rows(&b.fields,&n.fields,&c.fields,|f|&f.id)?,
            assets:merge_rows(&b.assets,&n.assets,&c.assets,|a|&a.id)?,
        })),
        _=>invalid("Native source admission is immutable during a session; host a new reviewed session to change it"),
    }
}
