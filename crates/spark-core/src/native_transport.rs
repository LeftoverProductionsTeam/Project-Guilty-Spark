//! Append-only native scenario transport operation. Uses the existing Invader
//! field reader, reviewed source transaction and compiled marker decoder.
use super::*;

#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct TransportAppend {pub name:String,pub tag_path:String,pub position:[f32;3],pub rotation_radians:[f32;3]}
impl TransportAppend {
 pub fn validate(&self)->Result<()>{
  if !["extraction_pelican","extraction_spirit"].contains(&self.name.as_str())||self.tag_path.starts_with('-')||self.tag_path.len()>230||self.tag_path.ends_with(".vehicle")||self.position.iter().any(|v|!v.is_finite()||v.abs()>2048.)||self.rotation_radians.iter().any(|v|!v.is_finite()||v.abs()>std::f32::consts::TAU){return invalid("Choose a Pelican/Spirit role, native vehicle tag path and finite world pose within2048units; rotation is radians");}
  safe_relative(&self.tag_path)?;Ok(())
 }
 pub fn group_names(&self)->[String;3]{["boarded","called","landed"].map(|suffix|format!("{}_{suffix}",self.name))}
}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct TransportSnapshot {pub vehicle_index:u16,pub name_index:u16,pub groups:[u16;3],pub transport:TransportAppend}
impl TransportSnapshot {
 pub fn validate(&self)->Result<()>{self.transport.validate()?;if self.vehicle_index>=256||self.name_index>=512||self.groups.iter().any(|i|*i>=128)||self.groups.iter().collect::<std::collections::BTreeSet<_>>().len()!=3{return invalid("Invalid native transport readback indices");}Ok(())}
}
struct Layout {vehicle:usize,name:usize,palette:usize,new_palette:bool,group:usize}
fn names(fields:&str,array:&str)->Result<Vec<String>>{let table=array_listing(fields,array)?;array_items(&table,array)?.iter().map(|row|native_name(&direct_struct_fields(row)?)).collect()}
fn layout(fields:&str,value:&TransportAppend)->Result<Layout>{
 value.validate()?;
 let objects=names(fields,"object_names")?;let vehicles=array_listing(fields,"vehicles")?;let palette=names(fields,"vehicle_palette")?;let groups=names(fields,"device_groups")?;
 // Legacy CE limits from the pinned native schema:80vehicles/100palette,
 //512names/128groups. Do not make a formerly valid classic map require extensions.
 if objects.len()>=512||vehicles.count>=80||palette.len()>100||groups.len()>125{return invalid("CE-compatible append capacity reached (80vehicles,100palette,512names,128groups)");}
 if objects.iter().any(|name|name.eq_ignore_ascii_case(&value.name))||groups.iter().any(|name|value.group_names().iter().any(|expected|name.eq_ignore_ascii_case(expected))){return invalid("Transport name or signal already exists; preserve it and use the existing source workflow instead of replacing it");}
 let reference=format!("{}.vehicle",value.tag_path.replace('\\',"/"));
 let found=palette.iter().position(|path|path.replace('\\',"/").eq_ignore_ascii_case(&reference));
 if found.is_none()&&palette.len()>=100{return invalid("CE vehicle palette capacity reached");}
 // A formerly dangling device-group index must not silently gain a new binding.
 for array in ["machines","controls"]{let table=array_listing(fields,array)?;for row in array_items(&table,array)?{let root=direct_struct_fields(row)?;for key in ["power_group","position_group"]{let i=native_index(&root,key)?;if i>=0&&(i as usize)>=groups.len(){return invalid("Existing device references a missing group; resolve it before appending transport signals");}}}}
 Ok(Layout{vehicle:vehicles.count,name:objects.len(),palette:found.unwrap_or(palette.len()),new_palette:found.is_none(),group:groups.len()})
}
pub fn arguments(tags:&Path,tag:&str,before:&str,value:&TransportAppend)->Result<Vec<String>>{
 let p=layout(before,value)?;let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned(),"-n".into()];
 let insert=|args:&mut Vec<String>,array:String,count:usize|args.extend(["-I".into(),array,count.to_string(),"end".into()]);
 let set=|args:&mut Vec<String>,key:String,value:String|args.extend(["-S".into(),key,value]);
 if p.new_palette{insert(&mut args,"vehicle_palette".into(),1);set(&mut args,format!("vehicle_palette[{}].name",p.palette),format!("{}.vehicle",value.tag_path));}
 insert(&mut args,"object_names".into(),1);set(&mut args,format!("object_names[{}].name",p.name),value.name.clone());
 insert(&mut args,"vehicles".into(),1);let prefix=format!("vehicles[{}]",p.vehicle);
 for(key,text)in [("type",p.palette.to_string()),("name",p.name.to_string()),("position",value.position.map(|v|v.to_string()).join(",")),("rotation",value.rotation_radians.map(|v|v.to_string()).join(",")),("body_vitality","1".into())]{set(&mut args,format!("{prefix}.{key}"),text);}
 insert(&mut args,"device_groups".into(),3);
 for(index,name)in value.group_names().into_iter().enumerate(){let prefix=format!("device_groups[{}]",p.group+index);set(&mut args,format!("{prefix}.name"),name);set(&mut args,format!("{prefix}.initial_value"),"0".into());set(&mut args,format!("{prefix}.flags.can_change_only_once"),"0".into());}
 args.push(tag.into());Ok(args)
}
fn preserved_arrays(before:&str,after:&str,changes:&[(&str,usize)])->Result<()>{
 let strip=|text:&str|->Result<Vec<String>>{let lines=text.lines().collect::<Vec<_>>();let mut omit=std::collections::BTreeSet::new();for(array,_)in changes{let block=array_listing(text,array)?;omit.extend(block.start..block.end);}Ok(lines.iter().enumerate().filter(|(i,_)|!omit.contains(i)).map(|(_,line)|(*line).into()).collect())};
 if strip(before)?!=strip(after)?{return invalid("Transport append changed unrelated scenario fields/scripts");}
 for(array,extra)in changes{let a=array_listing(before,array)?;let b=array_listing(after,array)?;let old=array_items(&a,array)?;let new=array_items(&b,array)?;if b.count!=a.count+extra||old.iter().zip(&new).any(|(a,b)|a!=b){return invalid("Transport append changed original array bodies or indices");}}
 Ok(())
}
pub fn reviewed(before:&str,after:&str,value:&TransportAppend)->Result<Vec<FieldDifference>>{
 let p=layout(before,value)?;preserved_arrays(before,after,&[("vehicles",1),("vehicle_palette",usize::from(p.new_palette)),("object_names",1),("device_groups",3)])?;
 let snapshot=snapshots(after,&[value.name.clone()])?.pop().ok_or_else(||crate::SparkError::Invalid("Appended transport is missing".into()))?;
 if snapshot.vehicle_index as usize!=p.vehicle||snapshot.name_index as usize!=p.name||snapshot.groups!=[p.group as u16,p.group as u16+1,p.group as u16+2]||snapshot.transport.tag_path.replace('\\',"/").to_ascii_lowercase()!=value.tag_path.replace('\\',"/").to_ascii_lowercase()||!positions_close(snapshot.transport.position,value.position)||!snapshot.transport.rotation_radians.iter().zip(value.rotation_radians).all(|(a,b)|facings_close(*a,b)){return invalid("Appended transport pose/reference/binding differs from review");}
 let table=array_listing(after,"vehicles")?;let rows=array_items(&table,"vehicles")?;let root=direct_struct_fields(rows[p.vehicle])?;
 if native_index(&root,"type")? as usize!=p.palette||number(&root,"body_vitality")?!=1.{return invalid("Appended vehicle palette/vitality differs from source request");}
 Ok(vec![FieldDifference{before:format!("{} vehicles / {} names / {} groups",p.vehicle,p.name,p.group),after:format!("Append {} at vehicle{} / name{}; tag{}; XYZ{:?}; yaw/pitch/roll{:?}rad; groups{:?}. All original fields/indices retained",value.name,p.vehicle,p.name,value.tag_path,value.position,value.rotation_radians,value.group_names())}])
}
pub fn snapshots(fields:&str,selected:&[String])->Result<Vec<TransportSnapshot>>{
 let source=scenario_transport_choices(fields)?;let objects=names(fields,"object_names")?;let groups=names(fields,"device_groups")?;let table=array_listing(fields,"vehicles")?;let rows=array_items(&table,"vehicles")?;let mut result=vec![];
 if selected.len()>2||selected.iter().collect::<std::collections::BTreeSet<_>>().len()!=selected.len(){return invalid("Transport snapshot selection is duplicated or exceeds two faction roles");}
 for name in selected{let found=source.vehicles.iter().filter(|v|v.name==*name).collect::<Vec<_>>();if found.len()!=1{return invalid("Transport snapshot vehicle name is unavailable or ambiguous");}
  let name_index=objects.iter().position(|n|n==name).ok_or_else(||crate::SparkError::Invalid("Missing native transport name".into()))?;
  let placed=rows.iter().enumerate().filter_map(|(i,row)|direct_struct_fields(row).ok().and_then(|root|native_index(&root,"name").ok().filter(|index|*index==name_index as i16).map(|_|(i,root)))).collect::<Vec<_>>();
  if placed.len()!=1{return invalid("Transport name has missing/ambiguous vehicle reverse binding");}let(index,root)=&placed[0];let(position,_)=native_vector(root,"position")?;let(rotation,_)=native_vector(root,"rotation")?;
  let transport=TransportAppend{name:name.clone(),tag_path:found[0].tag_path.clone(),position,rotation_radians:rotation.map(f32::to_radians)};
  let mut binding=[0;3];for(i,name)in transport.group_names().iter().enumerate(){if !source.groups.contains(name){return invalid("Missing isolated zero-initialized transport signal");}binding[i]=groups.iter().position(|g|g==name).ok_or_else(||crate::SparkError::Invalid("Transport signal index is missing".into()))? as u16;}
  let row=TransportSnapshot{vehicle_index:*index as u16,name_index:name_index as u16,groups:binding,transport};row.validate()?;result.push(row);
 }Ok(result)
}
pub fn verify_cache(expected:&[TransportSnapshot],path:&Path,map:&crate::maps::MapInspection)->Result<()>{
 let read=crate::maps::scenario_logic_readback(path,map)?;let mut signal_indices=std::collections::BTreeSet::new();
 for row in expected{row.validate()?;let value=&row.transport;let name=read.names.get(row.name_index as usize).ok_or_else(||crate::SparkError::Invalid("Compiled transport name is missing".into()))?;
  let vehicles=read.vehicles.iter().filter(|v|v.index==row.vehicle_index as usize).collect::<Vec<_>>();
  if name.name!=value.name||name.object_type!=1||name.object_index!=row.vehicle_index as i16||vehicles.len()!=1{return invalid("Compiled transport object/name/index binding differs");}let actual=vehicles[0];
  if actual.name_index!=row.name_index as i16||!actual.tag_path.replace('\\',"/").eq_ignore_ascii_case(&value.tag_path.replace('\\',"/"))||!positions_close(actual.position,value.position)||!actual.rotation_radians.iter().zip(value.rotation_radians).all(|(a,b)|facings_close(*a,b)){return invalid("Compiled transport tag/pose/reverse name differs");}
  for(index,name)in row.groups.iter().zip(value.group_names()){signal_indices.insert(*index as i16);let group=read.groups.get(*index as usize).ok_or_else(||crate::SparkError::Invalid("Compiled transport group is missing".into()))?;if group.name!=name||group.initial_value!=0.||group.flags!=0{return invalid("Compiled transport group identity/default/flags differ");}}
 }
 if read.devices.iter().any(|d|d.power_group.is_none_or(|i|signal_indices.contains(&i))||d.position_group.is_none_or(|i|signal_indices.contains(&i))){return invalid("Compiled transport signals are aliased by device power/position");}Ok(())
}

/// Aircraft identity and actual boarding capacity; never a fabricated vehicle.
pub fn validate_vehicle_source(fields:&str)->Result<()>{
 let kinds=["human_tank","human_jeep","human_boat","human_plane","alien_scout","alien_fighter","turret"];
 let(_,children)=native_children(fields,"vehicle_type","enum",kinds.len())?;let mut selected=None;
 for((_,text),kind)in children.iter().zip(kinds){let tokens=text.split_whitespace().collect::<Vec<_>>();if tokens!=[kind,"enum","value"]&&tokens!=[kind,"(*)","enum","value"]{return invalid("Unknown native vehicle-type enum inventory");}if tokens.len()==4&&selected.replace(kind).is_some(){return invalid("Ambiguous selected native vehicle type");}}
 let kind=selected.ok_or_else(||crate::SparkError::Invalid("Native vehicle type is unavailable".into()))?;
 if !["human_plane","alien_fighter"].contains(&kind){return invalid("Transport append requires an actual native aircraft; ordinary cars/turrets are not relabeled as dropships");}
 let labels=native_vehicle_seats(fields)?;let table=array_listing(fields,"seats")?;let mut drivers=0;
 for row in array_items(&table,"seats")?{let root=direct_struct_fields(row)?;let flat=root.lines().map(str::trim).collect::<Vec<_>>().join("\n");if number(&flat,"driver")?==1.{drivers+=1;}}
 if drivers!=1||labels.len()<2||labels.iter().any(|label|label.is_empty()){return invalid("Transport needs one real driver seat and at least one labeled passenger seat; repair or import the matching native vehicle source");}Ok(())
}

#[cfg(test)]
mod tests{
 use super::*;
 fn value()->TransportAppend{TransportAppend{name:"extraction_pelican".into(),tag_path:"vehicles/pelican/pelican".into(),position:[1.,2.,3.],rotation_radians:[0.;3]}}
 fn before()->String{"type (singleplayer) enum\nobject_names[1] array\n    object_names[0] struct\n        name (original) string\nvehicles[0] array\nvehicle_palette[0] array\ndevice_groups[1] array\n    device_groups[0] struct\n        name (original_power) string\n        initial_value (1) float\n        flags bitmask\n            can_change_only_once (1) bitfield\nmachines[0] array\ncontrols[0] array\ncommand_lists[0] array\nencounters[0] array\nscripts[0] array\nsource_metadata (retained) string\n".into()}
 fn after()->String{
  let mut text=before().replace("object_names[1] array","object_names[2] array").replace("vehicles[0] array","vehicles[1] array\n    vehicles[0] struct\n        type (0) index\n        name (1) index\n        position (1,2,3) point3d\n        rotation (0,0,0) euler3d\n        body_vitality (1) float").replace("vehicle_palette[0] array","vehicle_palette[1] array\n    vehicle_palette[0] struct\n        name (vehicles/pelican/pelican.vehicle) tagref").replace("device_groups[1] array","device_groups[4] array");
  text=text.replace("vehicles[1] array","    object_names[1] struct\n        name (extraction_pelican) string\nvehicles[1] array");
  let mut groups=String::new();for(i,name)in value().group_names().iter().enumerate(){groups.push_str(&format!("    device_groups[{}] struct\n        name ({name}) string\n        initial_value (0) float\n        flags bitmask\n            can_change_only_once (0) bitfield\n",i+1));}text.replace("machines[0] array",&(groups+"machines[0] array"))
 }
 #[test]fn append_preserves_original_arrays_fields_and_refuses_native_corruption(){
  let value=value();let before=before();let after=after();let args=arguments(Path::new("tags"),"level.scenario",&before,&value).unwrap();assert!(args.contains(&"-n".into()));assert_eq!(reviewed(&before,&after,&value).unwrap().len(),1);let snapshot=snapshots(&after,&[value.name.clone()]).unwrap();assert_eq!(snapshot[0].groups,[1,2,3]);assert_eq!(snapshot[0].name_index,1);
  for wrong in [after.replace("name (original)","name (changed)"),after.replace("initial_value (1)","initial_value (0)"),after.replace("source_metadata (retained)","source_metadata (lost)"),after.replace("position (1,2,3)","position (2,2,3)"),after.replace("can_change_only_once (0)","can_change_only_once (1)"),after.replace("body_vitality (1)","body_vitality (0)")]{assert!(reviewed(&before,&wrong,&value).is_err());}
  assert!(arguments(Path::new("tags"),"level.scenario",&after,&value).is_err());
  let partial=before.replace("name (original_power)","name (extraction_pelican_landed)");assert!(arguments(Path::new("tags"),"level.scenario",&partial,&value).is_err());
 }
 #[test]fn transport_draft_and_aircraft_validation_refuse_invalid_inputs(){
  for value in [TransportAppend{name:"not_a_role".into(),..value()},TransportAppend{tag_path:"../original".into(),..value()},TransportAppend{position:[f32::NAN,0.,0.],..value()}]{assert!(value.validate().is_err());}
  let vehicle="vehicle_type enum\n ├──human_tank enum value\n ├──human_jeep enum value\n ├──human_boat enum value\n ├──human_plane (*) enum value\n ├──alien_scout enum value\n ├──alien_fighter enum value\n └──turret enum value\nseats[2] array\n    seats[0] struct\n        label (P-driver) string\n        flags bitmask\n            driver (1) bitfield\n    seats[1] struct\n        label (P-passenger) string\n        flags bitmask\n            driver (0) bitfield\n";
  validate_vehicle_source(vehicle).unwrap();assert!(validate_vehicle_source(&vehicle.replace("human_plane (*)","human_plane").replace("human_jeep enum","human_jeep (*) enum")).is_err());assert!(validate_vehicle_source(&vehicle.replace("human_plane (*)","human_plane")).is_err());assert!(validate_vehicle_source(&vehicle.replace("alien_fighter enum","alien_fighter (*) enum")).is_err());assert!(validate_vehicle_source(&vehicle.replace("human_boat enum","unknown enum")).is_err());assert!(validate_vehicle_source(&vehicle.replace("driver (1)","driver (0)")).is_err());
 }
}

#[cfg(test)]
mod installed {
 use super::*;use std::process::Command;
 #[test]
 #[ignore="Requires explicitly selected original scenario, matching read-only native aircraft tags and Invader; disposable native candidate only"]
 fn source_append_compiles_preserves_originals_and_reads_back_vehicle_and_signal_indices(){
  let input=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_TRANSPORT_BASE_SCENARIO").expect("Explicit original scenario"));
  let shared=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_TRANSPORT_TAGS").expect("Explicit read-only aircraft tags"));
  let editor=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_INVADER_EDIT").expect("Explicit native writer"));let tools=editor.parent().unwrap();
  let temp=tempfile::tempdir_in(std::env::var_os("SPARK_NATIVE_TEST_ROOT").expect("Owned disposable root")).unwrap();let root=temp.path();let tags=root.join("tags");let output=root.join("maps");std::fs::create_dir(&tags).unwrap();std::fs::create_dir(&output).unwrap();let tag="be_native.scenario";let file=tags.join(tag);
  let original=std::fs::read(&input).unwrap();let original_sha=crate::maps::hash_file(&input).unwrap();std::fs::write(&file,&original).unwrap();
  let run=|tool:&Path,args:Vec<String>|{let value=Command::new(tool).args(&args).current_dir(root).output().unwrap();assert!(value.status.success(),"{} {:?}: {}",tool.display(),args,String::from_utf8_lossy(&value.stderr));assert!(!String::from_utf8_lossy(&value.stderr).lines().any(|line|line.trim().starts_with("ERROR:")),"{}",String::from_utf8_lossy(&value.stderr));if !value.stderr.is_empty(){eprintln!("{}",String::from_utf8_lossy(&value.stderr));}String::from_utf8(value.stdout).unwrap()};
  let fields=||run(&editor,vec!["-t".into(),tags.to_string_lossy().into_owned(),"-L".into(),tag.into()]);
  let before=fields();let original_squads=scenario_squad_start_choices(&before).unwrap();let original_scripts=scenario_script_names(&before).unwrap();let mut protected=vec![input.clone(),shared.join("globals/globals.globals")];
  let mut selected=vec![];
  for(index,name)in["extraction_pelican","extraction_spirit"].into_iter().enumerate(){
   let vehicle=if index==0{"forerunner/transport/pelican"}else{"forerunner/transport/spirit"};let source=shared.join(format!("{vehicle}.vehicle"));protected.push(source.clone());
   let listing=run(&editor,vec!["-t".into(),shared.to_string_lossy().into_owned(),"-L".into(),format!("{vehicle}.vehicle")]);validate_vehicle_source(&listing).unwrap();
   let value=TransportAppend{name:name.into(),tag_path:vehicle.into(),position:[49.+index as f32*16.,-87.472,0.078429],rotation_radians:[0.25,0.,0.]};let previous=fields();
   let operation=Operation::AppendTransport{transport:value.clone(),source_sha256:crate::maps::hash_file(&file).unwrap()};let args=operation.arguments_with_fields(&tags,"scnr",tag,&previous).unwrap();run(&editor,args);let after=fields();reviewed_difference(&previous,&after,&operation).unwrap();selected.push(name.into());
   assert_eq!(original_scripts,scenario_script_names(&after).unwrap());assert_eq!(serde_json::to_value(&original_squads).unwrap(),serde_json::to_value(scenario_squad_start_choices(&after).unwrap()).unwrap());
  }
  let hashes=protected.iter().map(|p|crate::maps::hash_file(p).unwrap()).collect::<Vec<_>>();
  let reviewed=fields();let snapshots=snapshots(&reviewed,&selected).unwrap();let source_sha=crate::maps::hash_file(&file).unwrap();
  run(&tools.join("invader-build.exe"),vec!["-t".into(),tags.to_string_lossy().into_owned(),"-t".into(),shared.to_string_lossy().into_owned(),"-g".into(),"gbx-custom".into(),"-m".into(),output.to_string_lossy().into_owned(),"be_native".into()]);
  let cache=output.join("be_native.map");let map=crate::maps::inspect_map(&cache,None).unwrap();assert_eq!(map.header.version,609);assert_eq!(map.header.scenario_type,0);verify_cache(&snapshots,&cache,&map).unwrap();
  let snapshot=ScenarioSquadReadback{transports:Some(snapshots.clone()),command_lists:None,devices:None,volumes:None,cameras:None,source_sha256:source_sha.clone(),squads:original_squads,include_starts:true,combat:vec![]};snapshot.verify_cache(&cache,&map).unwrap();
  for field in 0..4{let mut wrong=snapshots.clone();match field{0=>wrong[0].transport.position[0]+=1.,1=>wrong[0].transport.rotation_radians[0]+=0.5,2=>wrong[0].name_index+=1,_=>wrong[0].groups[0]+=1};assert!(verify_cache(&wrong,&cache,&map).is_err(),"Compiled aircraft readback accepted a wrong pose/name/group");}

  let names=map.scripts.iter().map(|s|s.name.clone()).collect::<Vec<_>>();assert_eq!(original_scripts,names);
  assert_eq!(hashes,protected.iter().map(|p|crate::maps::hash_file(p).unwrap()).collect::<Vec<_>>());assert_eq!(original_sha,crate::maps::hash_file(&input).unwrap());
  std::fs::write(&file,&original).unwrap();assert_eq!(original_sha,crate::maps::hash_file(&file).unwrap());
  eprintln!("Native append CE609 PASS: cache {}; revised scenario {source_sha}; original/restored {original_sha}; new transports {:?}; all original AI/scripts preserved; no flight/gameplay acceptance",map.sha256,snapshots);
 }
}
