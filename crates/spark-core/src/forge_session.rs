//! Private QuickForge source sessions; SparkLink extends this existing transport. Only typed source documents cross
//! this transport; no game files, local paths, executables or memory addresses.
use crate::{invalid,quickforge::{self,QuickForgeDocument},Result};
use serde::{Deserialize,Serialize};
use std::collections::BTreeSet;


pub fn portable(mut doc:QuickForgeDocument)->QuickForgeDocument {for placement in &mut doc.placements{placement.source_project_id=None;}doc}
/// Rebase independent property edits; a competing edit to the same property,
/// or a deletion of a changed entity, is refused before any shared mutation.
pub fn merge(base:&QuickForgeDocument,next:&QuickForgeDocument,current:&QuickForgeDocument)->Result<QuickForgeDocument>{
    let b=serde_json::to_value(base)?;let n=serde_json::to_value(next)?;let mut c=serde_json::to_value(current)?;
    for(key,value)in n.as_object().unwrap(){if b.get(key)==Some(value){continue;}
        if ["geometry","materials","placements","spawns","objectives"].contains(&key.as_str()){
            let old=b[key].as_array().unwrap();let new=value.as_array().unwrap();let result=c[key].as_array_mut().unwrap();
            let keys:BTreeSet<String>=old.iter().chain(new).map(|v|v["id"].as_str().unwrap().to_owned()).collect();
            for id in keys{let before=old.iter().find(|v|v["id"]==id);let after=new.iter().find(|v|v["id"]==id);if before==after{continue;}let index=result.iter().position(|v|v["id"]==id);
                match(before,after,index){
                    (None,Some(a),None)=>result.push(a.clone()),
                    (None,Some(a),Some(i))if result[i]==*a=>{},
                    (Some(b),None,Some(i))if result[i]==*b=>{result.remove(i);},
                    (Some(_),None,None)=>{},
                    (Some(b),Some(a),Some(i))=>{for(k,v)in a.as_object().unwrap(){if b.get(k)==Some(v){continue;}
                        if let (Some(before),Some(after),Some(current))=(b.get(k).and_then(|v|v.as_array()),v.as_array(),result[i].get(k).and_then(|v|v.as_array())){
                            if ["position","rotation","dimensions","color"].contains(&k.as_str())&&before.len()==3&&after.len()==3&&current.len()==3&&before.iter().chain(after).chain(current).all(|v|v.is_number()){
                                let mut merged=current.clone();for axis in 0..3{if before[axis]==after[axis]{continue;}if current[axis]!=before[axis]&&current[axis]!=after[axis]{return invalid(format!("Concurrent edit conflict: {key}/{id}/{k}/{axis}. Your local draft was retained."));}merged[axis]=after[axis].clone();}result[i][k]=serde_json::Value::Array(merged);continue;
                            }
                        }
                        if result[i].get(k)!=b.get(k)&&result[i].get(k)!=Some(v){return invalid(format!("Concurrent edit conflict: {key}/{id}/{k}. Your local draft was retained."));}result[i][k]=v.clone();}},
                    _=>return invalid(format!("Concurrent edit/delete conflict: {key}/{id}. Your local draft was retained.")),
                }
            }
        }else if key=="environment"&&b[key].is_object()&&value.is_object()&&c[key].is_object(){for(k,v)in value.as_object().unwrap(){if b[key].get(k)==Some(v){continue;}if c[key].get(k)!=b[key].get(k)&&c[key].get(k)!=Some(v){return invalid(format!("Concurrent edit conflict: environment/{k}. Your local draft was retained."));}c[key][k]=v.clone();}}
        else{if c.get(key)!=b.get(key)&&c.get(key)!=Some(value){return invalid(format!("Concurrent edit conflict: {key}. Your local draft was retained."));}c[key]=value.clone();}
    }
    let doc:QuickForgeDocument=serde_json::from_value(c)?;quickforge::validate_portable_document(&doc)?;Ok(doc)
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct GameBinding { pub runtime_id: String, pub scenario: String, pub checksum: u32, pub tag_count: u32 }
impl GameBinding {
    pub fn validate(&self) -> Result<()> {
        if self.runtime_id != "mccSteam" || self.scenario.len() > 256 || self.tag_count == 0 || self.tag_count > 65536 { return invalid("Unsupported loaded-game binding"); }
        crate::safe_relative(&self.scenario)?; Ok(())
    }
}
pub use crate::studio_session::{PROTOCOL_VERSION,MAX_FRAME_BYTES,MAX_PARTICIPANTS,View,Peer,Host,Guest,private_ipv4,private_endpoint,write_frame,read_frame};
/// Generated terrain/topology stays atomic within one brush. This is not a
/// merge of native BSP bytes, polygon indices or imported binary assets.
pub fn structural_targets(before:&QuickForgeDocument,after:&QuickForgeDocument)->Vec<String>{
 let ids:BTreeSet<_>=before.geometry.iter().chain(&after.geometry).map(|b|b.id.clone()).collect();
 ids.into_iter().filter(|id|match(before.geometry.iter().find(|b|&b.id==id),after.geometry.iter().find(|b|&b.id==id)){(Some(a),Some(b))=>a.kind!=b.kind||a.steps!=b.steps||a.heights!=b.heights,(None,None)=>false,_=>true}).map(|id|format!("geometry/{id}/structure")).collect()
}
