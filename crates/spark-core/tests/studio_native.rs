//! Schema/authority regressions. Genuine independent-process acceptance is in
//! test-sparklink-content-native.mjs, not these small in-memory unit fixtures.
use spark_core::{quickforge, studio_journal::Journal, studio_native::*};
use std::collections::BTreeMap;
fn id()->String {uuid::Uuid::new_v4().to_string()}
fn document()->quickforge::QuickForgeDocument {
    let mut d=quickforge::create_arena("native", "emptyArena").unwrap();
    let bytes=vec![0u8;64];
    d.native=Some(Document{source:Source{inventory_sha256:"a".repeat(64),field_tag:"weapons/pistol/pistol.weapon".into(),field_tag_sha256:"b".repeat(64),bounding_radius:0.1,template_tag:"scenery/rock.scenery".into(),template_sha256:digest(&bytes),dependencies:BTreeMap::from([("scenery/rock.gbxmodel".into(),"c".repeat(64))]),preview_sha256:"d".repeat(64),preview_tag_id:10,preview_tag_path:"scenery/rock".into()},fields:vec![],assets:vec![]});d
}
#[test]
fn native_field_publication_placement_order_and_author_inverses() {
    let j=Journal::new(document()).unwrap();let (a,b,c)=(id(),id(),id());
    let mut field=j.document.clone();field.native.as_mut().unwrap().fields.push(Field{id:"pistolBoundingRadius".into(),bounding_radius:0.225});
    let j1=j.propose(&id(),&a,0,field).unwrap();
    let mut publish=j.document.clone();let asset=Asset{id:id(),name:"Rock".into(),sha256:j.document.native.as_ref().unwrap().source.template_sha256.clone(),bytes:vec![0;64]};publish.native.as_mut().unwrap().assets.push(asset.clone());
    let j2=j1.propose(&id(),&b,0,publish).unwrap();assert_eq!(j2.revision,2);
    let mut placed=j2.document.clone();placed.placements.push(quickforge::ForgePlacement{published_asset_id:Some(asset.id.clone()),id:id(),name:"Rock".into(),tag_path:asset.tag_path(),tag_class:"scen".into(),position:[1.,1.,0.],rotation:[0.;3],team:0,respawn_seconds:0,tag_id:Some(10),source_project_id:None,source_sha256:Some("d".repeat(64)),visible:true,locked:false});
    let j3=j2.propose(&id(),&c,2,placed).unwrap();
    let j4=j3.reverse(&id(),&a,false).unwrap();assert!(j4.document.native.as_ref().unwrap().fields.is_empty());assert_eq!(j4.document.placements.len(),1);assert_eq!(j4.document.native.as_ref().unwrap().assets.len(),1);
    assert!(j4.reverse(&id(),&b,false).unwrap_err().to_string().contains("still placed"));
    let j5=j4.reverse(&id(),&c,false).unwrap();let j6=j5.reverse(&id(),&b,false).unwrap();assert!(j6.document.native.as_ref().unwrap().assets.is_empty());
    let j7=j6.reverse(&id(),&b,true).unwrap();let j8=j7.reverse(&id(),&c,true).unwrap();assert_eq!(j8.document.placements.len(),1);
}
#[test]
fn corrupt_asset_unknown_field_admission_changes_and_same_field_conflict_refuse() {
    let j=Journal::new(document()).unwrap();let mut field=j.document.clone();field.native.as_mut().unwrap().fields.push(Field{id:"pistolBoundingRadius".into(),bounding_radius:0.3});
    let next=j.propose(&id(),&id(),0,field.clone()).unwrap();field.native.as_mut().unwrap().fields[0].bounding_radius=0.4;
    assert!(next.propose(&id(),&id(),0,field).is_err());
    let mut changed=j.document.clone();changed.native.as_mut().unwrap().source.inventory_sha256="e".repeat(64);assert!(j.propose(&id(),&id(),0,changed).is_err());
    let mut corrupt=j.document.clone();corrupt.native.as_mut().unwrap().assets.push(Asset{id:id(),name:"Bad".into(),sha256:j.document.native.as_ref().unwrap().source.template_sha256.clone(),bytes:vec![1;64]});assert!(j.propose(&id(),&id(),0,corrupt).is_err());
    let value=serde_json::json!({"id":"pistolBoundingRadius","boundingRadius":1,"offset":128});assert!(serde_json::from_value::<Field>(value).is_err());
}
