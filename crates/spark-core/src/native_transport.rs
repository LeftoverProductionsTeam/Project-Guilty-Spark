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
pub struct TransportSnapshot {#[serde(default,skip_serializing_if="Option::is_none")] pub flight:Option<VehicleFlightTuning>,pub vehicle_index:u16,pub name_index:u16,pub groups:[u16;3],pub transport:TransportAppend}
impl TransportSnapshot {
 pub fn validate(&self)->Result<()>{self.transport.validate()?;if let Some(flight)=&self.flight{flight.validate()?;}if self.vehicle_index>=256||self.name_index>=512||self.groups.iter().any(|i|*i>=128)||self.groups.iter().collect::<std::collections::BTreeSet<_>>().len()!=3{return invalid("Invalid native transport readback indices");}Ok(())}
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
  let row=TransportSnapshot{flight:None,vehicle_index:*index as u16,name_index:name_index as u16,groups:binding,transport};row.validate()?;result.push(row);
 }Ok(result)
}
pub fn verify_cache(expected:&[TransportSnapshot],path:&Path,map:&crate::maps::MapInspection)->Result<()>{
 let read=crate::maps::scenario_logic_readback(path,map)?;let mut signal_indices=std::collections::BTreeSet::new();
 for row in expected{row.validate()?;let value=&row.transport;if let Some(flight)=&row.flight{flight.verify_map(map,&value.tag_path)?;}let name=read.names.get(row.name_index as usize).ok_or_else(||crate::SparkError::Invalid("Compiled transport name is missing".into()))?;
  let vehicles=read.vehicles.iter().filter(|v|v.index==row.vehicle_index as usize).collect::<Vec<_>>();
  if name.name!=value.name||name.object_type!=1||name.object_index!=row.vehicle_index as i16||vehicles.len()!=1{return invalid("Compiled transport object/name/index binding differs");}let actual=vehicles[0];
  if actual.name_index!=row.name_index as i16||!actual.tag_path.replace('\\',"/").eq_ignore_ascii_case(&value.tag_path.replace('\\',"/"))||!positions_close(actual.position,value.position)||!actual.rotation_radians.iter().zip(value.rotation_radians).all(|(a,b)|facings_close(*a,b)){return invalid("Compiled transport tag/pose/reverse name differs");}
  for(index,name)in row.groups.iter().zip(value.group_names()){signal_indices.insert(*index as i16);let group=read.groups.get(*index as usize).ok_or_else(||crate::SparkError::Invalid("Compiled transport group is missing".into()))?;if group.name!=name||group.initial_value!=0.||group.flags!=0{return invalid("Compiled transport group identity/default/flags differ");}}
 }
 if read.devices.iter().any(|d|d.power_group.is_none_or(|i|signal_indices.contains(&i))||d.position_group.is_none_or(|i|signal_indices.contains(&i))){return invalid("Compiled transport signals are aliased by device power/position");}Ok(())
}


#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct VehicleFlightTuning {pub throttle:f32,pub avoidance_distance:f32,pub pathfinding_radius:f32}
impl VehicleFlightTuning {
 pub fn validate(&self)->Result<()>{if !self.throttle.is_finite()||!(0.0..=1.0).contains(&self.throttle)||[self.avoidance_distance,self.pathfinding_radius].iter().any(|v|!v.is_finite()||!(0.0..=12.0).contains(v)){return invalid("Forerunner plane throttle must be0–1; avoidance and pathfinding radius0–12world units. Zero disables its native flight opt-in");}Ok(())}
 fn values(&self)->[(&'static str,f32);3]{[("ai_throttle_maximum",self.throttle),("ai_avoidance_distance",self.avoidance_distance),("ai_pathfinding_radius",self.pathfinding_radius)]}
 pub fn verify_map(&self,map:&crate::maps::MapInspection,tag_path:&str)->Result<()>{self.validate()?;let matches=map.tags.iter().filter(|t|t.class=="vehi"&&t.path.replace('\\',"/").eq_ignore_ascii_case(&tag_path.replace('\\',"/"))).collect::<Vec<_>>();if matches.len()!=1{return invalid("Compiled flight vehicle tag is missing or ambiguous");}for((_,expected),key)in self.values().into_iter().zip(["vehicle-ai-throttle","vehicle-ai-avoidance","vehicle-ai-pathfinding"]){let fields=matches[0].fields.iter().filter(|f|f.key==key).collect::<Vec<_>>();if fields.len()!=1||fields[0].value.as_f64().is_none_or(|v|!v.is_finite()||(v-f64::from(expected)).abs()>1e-6){return invalid("Compiled vehicle AI flight values differ from reviewed source");}}Ok(())}
}
pub fn flight_source(fields:&str)->Result<VehicleFlightTuning>{if vehicle_kind(fields)?!="human_plane"{return invalid("This Forerunner flight profile requires an actual native human-plane definition; other vehicle control is preserved");}Ok(VehicleFlightTuning{throttle:number(fields,"ai_throttle_maximum")? as f32,avoidance_distance:number(fields,"ai_avoidance_distance")? as f32,pathfinding_radius:number(fields,"ai_pathfinding_radius")? as f32})}
pub fn flight_arguments(tags:&Path,tag:&str,before:&str,tuning:&VehicleFlightTuning)->Result<Vec<String>>{tuning.validate()?;if flight_source(before)?==*tuning{return invalid("Native flight settings already match; no source was serialized");}let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned()];for(key,value)in tuning.values(){args.extend(["-S".into(),key.into(),value.to_string()]);}args.push(tag.into());Ok(args)}
pub fn reviewed_flight(before:&str,after:&str,tuning:&VehicleFlightTuning)->Result<Vec<FieldDifference>>{tuning.validate()?;flight_source(before)?;let actual=flight_source(after)?;for((_,a),(_,b))in tuning.values().into_iter().zip(actual.values()){if (a-b).abs()>1e-6{return invalid("Native flight field differs from request");}}let a=before.lines().collect::<Vec<_>>();let b=after.lines().collect::<Vec<_>>();if a.len()!=b.len(){return invalid("Flight edit changed native source structure");}let mut changes=vec![];for(a,b)in a.into_iter().zip(b){if a!=b{if !tuning.values().iter().any(|(key,_)|a.starts_with(&format!("{key} ("))&&b.starts_with(&format!("{key} ("))){return invalid("Flight edit changed unrelated native source");}changes.push(FieldDifference{before:a.into(),after:b.into()});}}if changes.is_empty(){return invalid("No native flight fields changed");}Ok(changes)}
fn vehicle_kind(fields:&str)->Result<&'static str>{
 let kinds=["human_tank","human_jeep","human_boat","human_plane","alien_scout","alien_fighter","turret"];
 let(_,children)=native_children(fields,"vehicle_type","enum",kinds.len())?;let mut selected=None;
 for((_,text),kind)in children.iter().zip(kinds){let tokens=text.split_whitespace().collect::<Vec<_>>();if tokens!=[kind,"enum","value"]&&tokens!=[kind,"(*)","enum","value"]{return invalid("Unknown native vehicle-type enum inventory");}if tokens.len()==4&&selected.replace(kind).is_some(){return invalid("Ambiguous selected native vehicle type");}}
 selected.ok_or_else(||crate::SparkError::Invalid("Native vehicle type is unavailable".into()))
}
/// Aircraft identity and actual boarding capacity; never a fabricated vehicle.
pub fn validate_vehicle_source(fields:&str)->Result<()>{
 let kind=vehicle_kind(fields)?;
 if !["human_plane","alien_fighter"].contains(&kind){return invalid("Transport append requires an actual native aircraft; ordinary cars/turrets are not relabeled as dropships");}
 let labels=native_vehicle_seats(fields)?;let drivers=native_vehicle_pilot_seats(fields)?;
 if drivers.len()!=1||labels.len()<2||labels.iter().any(|label|label.is_empty()){return invalid("Transport needs one real driver seat and at least one labeled passenger seat; repair or import the matching native vehicle source");}Ok(())
}

/// A conservative source profile for generated physical flights. Advanced native
/// programs remain editable through the manual HaloScript path; no simulation.
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct TransportFlightRoute {pub name:String,pub points:usize,pub commands:usize,pub final_position:Option<[f32;3]>,pub arrival_volumes:Vec<String>,pub issue:Option<String>}
pub fn flight_route(route:&NativeCommandList,volumes:&[crate::maps::ScenarioLogicVolume])->TransportFlightRoute {
 let check=||->Result<[f32;3]>{
  route.validate()?;
  for(index,command)in route.commands.iter().enumerate(){
   match command.atom.as_str(){
    "go_to" if [0,1].contains(&command.modifier)&&command.point1>=0=>{},
    "go_to_and_face" if command.modifier==0&&command.point1>=0&&command.point2>=0=>{},
    "set_radius" if command.parameters[0]>0.=>{},
    "pause" if command.parameters[0]>=0.=>{},
    _=>return invalid(format!("Route {} action{} ({}) is outside the generated physical-flight profile. Use go-to (stop/keep-moving), go-to-and-face (stop with Point2), positive set-radius or pause; advanced source remains available manually",route.name,index,command.atom)),
   }
  }
  let final_step=route.commands.iter().rfind(|command|matches!(command.atom.as_str(),"go_to"|"go_to_and_face")).ok_or_else(||crate::SparkError::Invalid(format!("Route {} has no physical go-to actions",route.name)))?;
  if final_step.modifier!=0{return invalid(format!("Route {} must end with a go-to Stop at point; a keep-moving point or completed command is not a landing",route.name));}
  route.points.get(final_step.point1 as usize).copied().ok_or_else(||crate::SparkError::Invalid(format!("Route {} final landing point is unavailable",route.name)))
 };
 let (final_position,issue)=match check(){Ok(point)=>(Some(point),None),Err(issue)=>(None,Some(issue.to_string()))};
 let mut names=std::collections::BTreeMap::new();for volume in volumes{*names.entry(volume.name.as_str()).or_insert(0usize)+=1;}
 let arrival_volumes=final_position.map(|point|volumes.iter().filter(|v|names.get(v.name.as_str())==Some(&1)&&v.geometry.as_ref().is_some_and(|g|g.contains(point))).map(|v|v.name.clone()).collect()).unwrap_or_default();
 TransportFlightRoute{name:route.name.clone(),points:route.points.len(),commands:route.commands.len(),final_position,arrival_volumes,issue}
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
 #[test]fn flight_route_profile_checks_physical_commands_and_rotated_pad_bounds(){
  let command=|point,modifier|NativeCommand{atom:"go_to".into(),modifier,parameters:[0.;2],point1:point,point2:-1,animation:-1,script:-1,recording:-1,command:-1,object_name:-1};
  let route=NativeCommandList{index:0,name:"approach".into(),flags:[false;6],bsp:-1,points:vec![[2.,2.,8.],[2.,2.,1.]],commands:vec![command(0,1),command(1,0)]};
  let pad=crate::maps::ScenarioLogicVolume{name:"pad".into(),kind:1,geometry:Some(crate::maps::ScenarioLogicVolumeGeometry{forward:[0.,1.,0.],up:[0.,0.,1.],corner:[4.,0.,0.],dimensions:[4.;3]})};
  let ready=flight_route(&route,&[pad.clone()]);assert!(ready.issue.is_none());assert_eq!(ready.final_position,Some([2.,2.,1.]));assert_eq!(ready.arrival_volumes,vec!["pad"]);
  let mut wrong=route.clone();wrong.points[1]=[5.,2.,1.];assert!(flight_route(&wrong,&[pad.clone()]).arrival_volumes.is_empty());
  for fault in 0..7{let mut wrong=route.clone();match fault{0=>wrong.commands[1].modifier=1,1=>wrong.commands[0].atom="teleport".into(),2=>wrong.commands[0].atom="loop".into(),3=>wrong.commands[1].point1=-1,4=>wrong.commands[0].atom="script".into(),5=>wrong.commands[0].modifier=2,_=>wrong.commands.clear()};assert!(flight_route(&wrong,&[pad.clone()]).issue.is_some(),"Unsupported route fault {fault}");}
  let mut facing=route.clone();facing.commands[1].atom="go_to_and_face".into();facing.commands[1].point2=0;assert!(flight_route(&facing,&[pad.clone()]).issue.is_none());facing.commands[1].point2=-1;assert!(flight_route(&facing,&[pad.clone()]).issue.is_some());
  let mut radius=command(-1,0);radius.atom="set_radius".into();radius.parameters[0]=4.;let mut with_radius=route.clone();with_radius.commands.insert(1,radius.clone());assert!(flight_route(&with_radius,&[pad.clone()]).issue.is_none());with_radius.commands[1].parameters[0]=0.;assert!(flight_route(&with_radius,&[pad.clone()]).issue.is_some());
  let mut paused=route.clone();let mut pause=command(-1,0);pause.atom="pause".into();pause.parameters[0]=1.;paused.commands.push(pause);assert!(flight_route(&paused,&[pad.clone()]).issue.is_none());
  assert!(flight_route(&route,&[pad.clone(),pad.clone()]).arrival_volumes.is_empty());let mut fixed=pad;fixed.geometry=None;assert!(flight_route(&route,&[fixed]).arrival_volumes.is_empty());
 }
 #[test]fn flight_fields_preserve_every_other_field_and_bound_native_values(){
  let before="ai_throttle_maximum (0.65) float32\nai_avoidance_distance (4) float32\nai_pathfinding_radius (1.8) float32\nunrelated (retained) string\n";
  let request=VehicleFlightTuning{throttle:0.5,avoidance_distance:5.,pathfinding_radius:2.};
  let after=before.replace("(0.65)","(0.5)").replace("(4)","(5)").replace("(1.8)","(2)");
  // Field preservation and native values are independent of kind/seat parsing.
  let enum_fields="vehicle_type enum\n    human_tank enum value\n    human_jeep enum value\n    human_boat enum value\n    human_plane (*) enum value\n    alien_scout enum value\n    alien_fighter enum value\n    turret enum value\n";
  let before=enum_fields.to_owned()+before;let after=enum_fields.to_owned()+&after;
  assert_eq!(reviewed_flight(&before,&after,&request).unwrap().len(),3);
  assert!(reviewed_flight(&before,&after.replace("retained","lost"),&request).is_err());
  assert!(reviewed_flight(&before,&after.replace("(0.5)","(0.6)"),&request).is_err());
  assert!(flight_arguments(Path::new("tags"),"ship.vehicle",&after,&request).is_err());
  for bad in [VehicleFlightTuning{throttle:f32::NAN,..request.clone()},VehicleFlightTuning{throttle:1.1,..request.clone()},VehicleFlightTuning{avoidance_distance:12.1,..request.clone()},VehicleFlightTuning{pathfinding_radius:-1.,..request.clone()}]{assert!(bad.validate().is_err());}
  let disabled=VehicleFlightTuning{throttle:0.,avoidance_distance:0.,pathfinding_radius:0.};disabled.validate().unwrap();
 }
 #[test]fn transport_draft_and_aircraft_validation_refuse_invalid_inputs(){
  for value in [TransportAppend{name:"not_a_role".into(),..value()},TransportAppend{tag_path:"../original".into(),..value()},TransportAppend{position:[f32::NAN,0.,0.],..value()}]{assert!(value.validate().is_err());}
  let vehicle="vehicle_type enum\n ├──human_tank enum value\n ├──human_jeep enum value\n ├──human_boat enum value\n ├──human_plane (*) enum value\n ├──alien_scout enum value\n ├──alien_fighter enum value\n └──turret enum value\nseats[2] array\n    seats[0] struct\n        label (P-driver) string\n        flags bitmask\n            driver (1) bitfield\n    seats[1] struct\n        label (P-passenger) string\n        flags bitmask\n            driver (0) bitfield\n";
  validate_vehicle_source(vehicle).unwrap();assert_eq!(native_vehicle_pilot_seats(vehicle).unwrap(),vec!["P-driver"]);assert!(native_vehicle_pilot_seats(&vehicle.replace("P-passenger","P-driver")).is_err());assert!(native_vehicle_pilot_seats(&vehicle.replace("driver (0)","driver (2)")).is_err());assert!(validate_vehicle_source(&vehicle.replace("human_plane (*)","human_plane").replace("human_jeep enum","human_jeep (*) enum")).is_err());assert!(validate_vehicle_source(&vehicle.replace("human_plane (*)","human_plane")).is_err());assert!(validate_vehicle_source(&vehicle.replace("alien_fighter enum","alien_fighter (*) enum")).is_err());assert!(validate_vehicle_source(&vehicle.replace("human_boat enum","unknown enum")).is_err());assert!(validate_vehicle_source(&vehicle.replace("driver (1)","driver (0)")).is_err());
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
  let diagnostics=std::cell::RefCell::new(String::new());let run=|tool:&Path,args:Vec<String>|{let value=Command::new(tool).args(&args).current_dir(root).output().unwrap();assert!(value.status.success(),"{} {:?}: {}",tool.display(),args,String::from_utf8_lossy(&value.stderr));assert!(!String::from_utf8_lossy(&value.stderr).lines().any(|line|line.trim().starts_with("ERROR:")),"{}",String::from_utf8_lossy(&value.stderr));if !value.stderr.is_empty(){eprintln!("{}",String::from_utf8_lossy(&value.stderr));}*diagnostics.borrow_mut()=String::from_utf8_lossy(&value.stderr).into_owned();String::from_utf8(value.stdout).unwrap()};
  let fields=||run(&editor,vec!["-t".into(),tags.to_string_lossy().into_owned(),"-L".into(),tag.into()]);
  let global_names=|text:&str|{let array=array_listing(text,"globals").unwrap();array_items(&array,"globals").unwrap().iter().map(|row|native_name(&direct_struct_fields(row).unwrap()).unwrap()).collect::<Vec<_>>()};
  let before=fields();let original_globals=global_names(&before);let original_squads=scenario_squad_start_choices(&before).unwrap();let original_scripts=scenario_script_names(&before).unwrap();let mut protected=vec![input.clone(),shared.join("globals/globals.globals")];
  let mut selected=vec![];
  for(index,name)in["extraction_pelican","extraction_spirit"].into_iter().enumerate(){
   let vehicle=if index==0{"forerunner/transport/pelican"}else{"forerunner/transport/spirit"};let source=shared.join(format!("{vehicle}.vehicle"));protected.push(source.clone());
   let listing=run(&editor,vec!["-t".into(),shared.to_string_lossy().into_owned(),"-L".into(),format!("{vehicle}.vehicle")]);validate_vehicle_source(&listing).unwrap();
   let value=TransportAppend{name:name.into(),tag_path:vehicle.into(),position:[49.+index as f32*16.,-87.472,0.078429],rotation_radians:[0.25,0.,0.]};let previous=fields();
   let operation=Operation::AppendTransport{transport:value.clone(),source_sha256:crate::maps::hash_file(&file).unwrap()};let args=operation.arguments_with_fields(&tags,"scnr",tag,&previous).unwrap();run(&editor,args);let after=fields();reviewed_difference(&previous,&after,&operation).unwrap();selected.push(name.into());
   assert_eq!(original_scripts,scenario_script_names(&after).unwrap());assert_eq!(serde_json::to_value(&original_squads).unwrap(),serde_json::to_value(scenario_squad_start_choices(&after).unwrap()).unwrap());
  }
  // Tune only an owned vehicle copy; do not serialize the shared original.
  let vehicle_tag="forerunner/transport/pelican.vehicle";let original_vehicle=std::fs::read(shared.join(vehicle_tag)).unwrap();
  let vehicle_file=tags.join(vehicle_tag);std::fs::create_dir_all(vehicle_file.parent().unwrap()).unwrap();std::fs::write(&vehicle_file,&original_vehicle).unwrap();
  let before_flight=run(&editor,vec!["-t".into(),tags.to_string_lossy().into_owned(),"-L".into(),vehicle_tag.into()]);
  let flight=VehicleFlightTuning{throttle:0.5,avoidance_distance:5.,pathfinding_radius:2.};
  let operation=Operation::VehicleFlight{tuning:flight.clone(),source_sha256:crate::maps::hash_file(&vehicle_file).unwrap()};
  run(&editor,operation.arguments_with_fields(&tags,"vehi",vehicle_tag,&before_flight).unwrap());
  let after_flight=run(&editor,vec!["-t".into(),tags.to_string_lossy().into_owned(),"-L".into(),vehicle_tag.into()]);
  reviewed_difference(&before_flight,&after_flight,&operation).unwrap();let scalar=run(&editor,operation.readback_arguments(&tags,"vehi",vehicle_tag,&before_flight).unwrap().unwrap());operation.verify_readback(&tags,"vehi",vehicle_tag,&before_flight,&scalar).unwrap();
  let modified_vehicle_sha=crate::maps::hash_file(&vehicle_file).unwrap();let original_vehicle_sha=crate::maps::hash_file(&shared.join(vehicle_tag)).unwrap();
  let hashes=protected.iter().map(|p|crate::maps::hash_file(p).unwrap()).collect::<Vec<_>>();
  let repair=std::env::var("SPARK_NATIVE_BSP_REPAIR").ok().as_deref()==Some("1");let mut expected_squads=original_squads.clone();let mut route_before=fields();
  if repair{
   let reference=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_TRANSPORT_BASE_MAP").expect("Explicit compiled BSP reference for source repair"));let map=crate::maps::inspect_map(&reference,None).unwrap();
   let squad=expected_squads.iter_mut().find(|row|row.encounter_name=="be_flood").unwrap();let point=&mut squad.starts.as_mut().unwrap()[0];let old=point.position;
   let combat=scenario_combat_choices(&route_before).unwrap();let target=combat.iter().find(|row|row.name=="be_flood").unwrap().points.iter().find(|row|(row.position[0]-old[0]).abs()<1e-4&&(row.position[1]-old[1]).abs()<1e-4).unwrap().position;
   let check=crate::maps::bsp_point_locations(&reference,&map,&[old,target]).unwrap();assert!(check[0].supports.is_empty());assert!(check[1].supports.iter().any(|surface|surface.bsp==0));
   let operation=Operation::EncounterStartPosition{encounter:squad.encounter,squad:squad.squad,start:point.index,encounter_name:squad.encounter_name.clone(),squad_name:squad.name.clone(),position:target,source_sha256:crate::maps::hash_file(&file).unwrap(),facing_radians:None,command_list:None};run(&editor,operation.arguments_with_fields(&tags,"scnr",tag,&route_before).unwrap());let after=fields();reviewed_difference(&route_before,&after,&operation).unwrap();point.position=target;route_before=after;
   eprintln!("Native reviewed Flood source repair: {old:?} -> {target:?}; all other source fields preserved");assert_eq!(crate::maps::hash_file(&reference).unwrap(),map.sha256);
  }
  let native_mission=native_mission_source(&route_before).unwrap();assert_eq!(native_mission.weapons.len(),1);assert_eq!(native_mission.weapons[0].objects[0].name.as_deref(),Some("be_technology"));assert!(native_mission.weapons[0].objects[0].not_placed_automatically);assert!(native_mission.weapons[0].objects[0].create_issue.is_none());assert_eq!(native_mission.weapons[0].tag_path,"forerunner/be_native/technology");assert_eq!(native_mission.weapons[0].placements,vec![0]);assert!(!native_mission.weapons[0].starting_equipment);eprintln!("Native mission collection source PASS: forerunner/be_native/technology at placement0, absent from every starting profile");let mission_encounters=native_mission_encounters(&route_before).unwrap();assert!(!mission_encounters.is_empty());eprintln!("Native recovered mission flags: {mission_encounters:?}");let command_source=native_command_source(&route_before).unwrap();let volumes=scenario_volume_choices(&route_before).unwrap();
  if let Some(reference)=std::env::var_os("SPARK_NATIVE_TRANSPORT_BASE_MAP"){
   let reference=std::path::PathBuf::from(reference);let inspected=crate::maps::inspect_map(&reference,None).unwrap();let points=[[49.,-87.472,0.078429],[49.,-87.472,8.078429],[51.,-87.472,0.078429],[58.845612,-89.472122,1.0],[58.845612,-89.472122,0.078429]];
   let locations=crate::maps::bsp_point_locations(&reference,&inspected,&points).unwrap();eprintln!("Native BSP point locations: {}",serde_json::to_string(&locations).unwrap());
  }
  let end=snapshots(&route_before,&selected).unwrap()[0].transport.position;let pad=volumes.iter().find(|v|v.geometry.as_ref().is_some_and(|g|g.contains(end))&&volumes.iter().filter(|p|p.name==v.name).count()==1).expect("native flight fixture needs a readable unique pad containing its authored aircraft origin");
  let command=|point,modifier|NativeCommand{atom:"go_to".into(),modifier,parameters:[0.;2],point1:point,point2:-1,animation:-1,script:-1,recording:-1,command:-1,object_name:-1};
  let route=NativeCommandList{index:command_source.lists.len() as u16,name:"gs_native_flight".into(),flags:[false,false,false,false,false,true],bsp:0,points:vec![[end[0],end[1],end[2]+8.],end],commands:vec![command(0,1),command(1,0)]};
  let mut route=route;if repair{let approach=expected_squads.iter().find(|row|row.encounter_name=="be_covenant").unwrap().starts.as_ref().unwrap()[0].position;assert!(approach.iter().zip(end).map(|(a,b)|(a-b).powi(2)).sum::<f32>()>16.,"A repaired approach must retain a real traversal distance");route.points[0]=approach;}route.points.push([end[0]+2.,end[1],end[2]]);route.commands[1].atom="go_to_and_face".into();route.commands[1].point2=2;
  let op=Operation::CommandList{list:route.clone(),append:true,source_sha256:crate::maps::hash_file(&file).unwrap()};for args in op.argument_batches(op.arguments_with_fields(&tags,"scnr",tag,&route_before).unwrap(),false).unwrap(){run(&editor,args);}let route_after=fields();reviewed_difference(&route_before,&route_after,&op).unwrap();let review=native_transport_routes(&route_after).unwrap().into_iter().find(|r|r.name==route.name).unwrap();assert!(review.issue.is_none());assert!(review.arrival_volumes.contains(&pad.name));assert_eq!(review.final_position,Some(end));
  let mission=std::env::var_os("SPARK_NATIVE_RECOVERED_MISSION").map(|fixture|{
   let fixture=std::path::PathBuf::from(fixture);crate::reject_links(&fixture).unwrap();assert!(std::fs::metadata(&fixture).unwrap().len()<512*1024);
   let fixture_sha=crate::maps::hash_file(&fixture).unwrap();let value:serde_json::Value=serde_json::from_slice(&std::fs::read(&fixture).unwrap()).unwrap();let source=value["content"].as_str().unwrap();
   let mut project=crate::project::Project::new("Generated recovered mission native fixture");project.studio=Some(serde_json::from_value(value["studio"].clone()).unwrap());
   let filename=value["filename"].as_str().unwrap_or("gs_mission.hsc");let binding=crate::creative::recovered_mission_binding_for_module(&project,source,filename,value["replacesSha256"].as_str()).unwrap().unwrap();let data=root.join("data");std::fs::create_dir(&data).unwrap();
   run(&tools.join("invader-recover.exe"),vec!["-t".into(),tags.to_string_lossy().into_owned(),"-d".into(),data.to_string_lossy().into_owned(),tag.into()]);
   let target=data.join("scripts").join(crate::safe_relative(filename).unwrap());
   if let Some(expected)=value["replacesSha256"].as_str(){assert_eq!(crate::maps::hash_file(&target).unwrap(),expected,"Only the exact reviewed recovered module may be revised in owned scratch");}else{assert!(!target.exists(),"Never replace an original recovered source module without its reviewed hash");}
   std::fs::create_dir_all(target.parent().unwrap()).unwrap();std::fs::write(&target,source).unwrap();
   let compile_hud=|relative:&str,bytes:&[u8]|{let hmt=data.join(format!("{relative}.hmt"));std::fs::create_dir_all(hmt.parent().unwrap()).unwrap();std::fs::write(&hmt,bytes).unwrap();run(&tools.join("invader-string.exe"),vec!["-t".into(),tags.to_string_lossy().into_owned(),"-d".into(),data.to_string_lossy().into_owned(),"-T".into(),"hud_message_text".into(),relative.into()]);run(&editor,vec!["-t".into(),tags.to_string_lossy().into_owned(),"-S".into(),"hud_messages".into(),format!("{relative}.hud_message_text"),tag.into()]);};
   if value["seedHud"].as_bool()==Some(true){let original_hud=crate::firefight::format_native_hud_append(vec![crate::firefight::NativeRoundHudMessage{name:"legacy_objective".into(),text:"Keep this original HUD message.".into()}],None,&[]).unwrap().unwrap();compile_hud("be_native/legacy_messages",&original_hud.source);}
   let hud=crate::working_tags::prepare_mission_hud_append(&project,&tags,&fields(),None,&crate::maps::hash_file(&tools.join("invader-string.exe")).unwrap()).unwrap();
   if let Some(hud)=&hud{compile_hud(&hud.review.output_tag_path,&hud.source);if value["seedHud"].as_bool()==Some(true){assert_eq!(hud.original_count,1);assert_eq!(hud.input_messages[0].name,"legacy_objective");assert_eq!(hud.messages[0],hud.input_messages[0]);}}

   run(&tools.join("invader-script.exe"),vec!["-t".into(),tags.to_string_lossy().into_owned(),"-t".into(),shared.to_string_lossy().into_owned(),"-d".into(),data.to_string_lossy().into_owned(),"-g".into(),"gbx-custom".into(),"-E".into(),"be_native".into()]);
   assert_eq!(fixture_sha,crate::maps::hash_file(&fixture).unwrap());eprintln!("Generated recovered mission source {}",crate::maps::hash_file(&target).unwrap());(binding,hud)
  });
  let reviewed=fields();let mut snapshots=snapshots(&reviewed,&selected).unwrap();snapshots[0].flight=Some(flight.clone());let source_sha=crate::maps::hash_file(&file).unwrap();
  run(&tools.join("invader-build.exe"),vec!["-t".into(),tags.to_string_lossy().into_owned(),"-t".into(),shared.to_string_lossy().into_owned(),"-g".into(),"gbx-custom".into(),"-m".into(),output.to_string_lossy().into_owned(),"be_native".into()]);
  if repair{let log=diagnostics.borrow();assert!(!log.contains("Encounter #2 (be_flood)"),"{log}");assert!(!log.contains("Command list #0 (gs_native_flight)"),"{log}");eprintln!("Native compiler confirms repaired Flood and all flight-route points have BSP surface bindings; native manual-index flags unchanged");}
  let cache=output.join("be_native.map");let map=crate::maps::inspect_map(&cache,None).unwrap();assert_eq!(map.header.version,609);assert_eq!(map.header.scenario_type,0);verify_cache(&snapshots,&cache,&map).unwrap();
  let snapshot=ScenarioSquadReadback{transports:Some(snapshots.clone()),command_lists:Some(native_command_source(&reviewed).unwrap().lists),devices:None,volumes:Some(volumes),cameras:None,source_sha256:source_sha.clone(),squads:expected_squads,include_starts:true,combat:vec![]};snapshot.verify_cache(&cache,&map).unwrap();
  if repair{let locations=crate::maps::bsp_point_locations(&cache,&map,&route.points).unwrap();assert!(locations.iter().all(|row|row.supports.iter().any(|surface|surface.bsp==0)));eprintln!("Repaired compiled route point geometry: {}",serde_json::to_string(&locations).unwrap());}
  let compiled_routes=crate::maps::scenario_command_readback(&cache,&map).unwrap();assert!(compiled_routes.iter().find(|r|r.name==route.name).unwrap().close(&route));eprintln!("Native physical-flight route source/readback PASS: {review:?}; geometry is authored source only, not flight acceptance");
  for field in 0..3{let mut wrong=flight.clone();match field{0=>wrong.throttle+=0.1,1=>wrong.avoidance_distance+=0.1,_=>wrong.pathfinding_radius+=0.1};assert!(wrong.verify_map(&map,"forerunner/transport/pelican").is_err());}
  for field in 0..4{let mut wrong=snapshots.clone();match field{0=>wrong[0].transport.position[0]+=1.,1=>wrong[0].transport.rotation_radians[0]+=0.5,2=>wrong[0].name_index+=1,_=>wrong[0].groups[0]+=1};assert!(verify_cache(&wrong,&cache,&map).is_err(),"Compiled aircraft readback accepted a wrong pose/name/group");}

  let names=map.scripts.iter().map(|s|s.name.clone()).collect::<Vec<_>>();
  if let Some((binding,hud))=&mission{let readback=root.join("independent-scripts");std::fs::create_dir(&readback).unwrap();run(&tools.join("invader-extract.exe"),vec!["-s".into(),tag.into(),"-t".into(),readback.to_string_lossy().into_owned(),cache.to_string_lossy().into_owned()]);let extracted=run(&editor,vec!["-t".into(),readback.to_string_lossy().into_owned(),"-L".into(),tag.into()]);assert!(global_names(&extracted).starts_with(&original_globals),"Compiled original global indices changed");assert!(scenario_script_names(&extracted).unwrap().starts_with(&original_scripts),"Independent native extraction reports shifted original script indices");eprintln!("Independent original script/global index readback PASS: {original_scripts:?} / {original_globals:?}");crate::creative::verify_native_mission_with_hud(binding,&map,&cache,hud.as_ref().map(|hud|(hud.review.output_tag_path.as_str(),hud.messages.as_slice()))).unwrap();if binding.missions.iter().any(|beat|beat.trigger=="forerunnerExtractionSettled"){assert!(crate::creative::compiled_extraction_mode(&cache,&map).unwrap());}if let Some(hud)=hud{let read=crate::maps::scenario_hud_messages(&cache,&map).unwrap().unwrap();assert_eq!(read.messages,hud.messages);let mut wrong=hud.messages.clone();wrong[0].name.push_str("_changed");assert!(crate::creative::verify_native_mission_with_hud(binding,&map,&cache,Some((&hud.review.output_tag_path,&wrong))).is_err(),"Readback must reject changed original or authored HUD entries");eprintln!("Native complete mission HUD readback PASS: {} messages, original prefix {}",read.messages.len(),hud.original_count);}assert!(names.starts_with(&original_scripts),"Composed source shifted original native script indices: {original_scripts:?} -> {names:?}");assert_eq!(names.len(),original_scripts.len()+2);eprintln!("Generated recovered mission CE609 compile/readback PASS: {} scripts {:?}; no mission/gameplay acceptance",map.sha256,names);}else{assert_eq!(original_scripts,names);}

  if let Some((binding,hud))=&mission{if binding.missions.iter().any(|beat|beat.create_weapon_object.is_some()){
   let good_scenario=std::fs::read(&file).unwrap();let good_cache_sha=crate::maps::hash_file(&cache).unwrap();let bad_output=root.join("automatic-placement-negative");std::fs::create_dir(&bad_output).unwrap();
   run(&editor,vec!["-t".into(),tags.to_string_lossy().into_owned(),"-S".into(),"weapons[0].not_placed.automatically".into(),"0".into(),tag.into()]);
   run(&tools.join("invader-build.exe"),vec!["-t".into(),tags.to_string_lossy().into_owned(),"-t".into(),shared.to_string_lossy().into_owned(),"-g".into(),"gbx-custom".into(),"-m".into(),bad_output.to_string_lossy().into_owned(),"be_native".into()]);
   let bad=bad_output.join("be_native.map");let bad_map=crate::maps::inspect_map(&bad,None).unwrap();let problem=crate::creative::verify_native_mission_with_hud(binding,&bad_map,&bad,hud.as_ref().map(|hud|(hud.review.output_tag_path.as_str(),hud.messages.as_slice()))).unwrap_err().to_string();assert!(problem.contains("automatic placement disabled"),"{problem}");
   let mut wrong=binding.clone();let beat=wrong.missions.iter_mut().find(|beat|beat.create_weapon_object.is_some()).unwrap();beat.create_weapon_object=Some("extraction_activate".into());assert!(crate::creative::verify_native_mission_with_hud(&wrong,&map,&cache,hud.as_ref().map(|hud|(hud.review.output_tag_path.as_str(),hud.messages.as_slice()))).unwrap_err().to_string().contains("not a native weapon"));
   std::fs::write(&file,&good_scenario).unwrap();assert_eq!(crate::maps::hash_file(&cache).unwrap(),good_cache_sha);assert_eq!(crate::maps::hash_file(&file).unwrap(),source_sha);eprintln!("Named creation native readback PASS; automatically placed candidate and control-as-weapon refused; previous-good cache unchanged {good_cache_sha}");
  }}
  assert_eq!(hashes,protected.iter().map(|p|crate::maps::hash_file(p).unwrap()).collect::<Vec<_>>());assert_eq!(original_sha,crate::maps::hash_file(&input).unwrap());
  std::fs::write(&vehicle_file,&original_vehicle).unwrap();assert_eq!(crate::maps::hash_file(&vehicle_file).unwrap(),crate::maps::hash_file(&shared.join(vehicle_tag)).unwrap());
  std::fs::write(&file,&original).unwrap();assert_eq!(original_sha,crate::maps::hash_file(&file).unwrap());
  eprintln!("Native vehicle flight tag original/restored {original_vehicle_sha}; modified {modified_vehicle_sha}; all three compiled fields independently verified");
  eprintln!("Native append CE609 PASS: cache {}; revised scenario {source_sha}; original/restored {original_sha}; new transports {:?}; original AI/script identities preserved; reviewed pose edits verified separately; no flight/gameplay acceptance",map.sha256,snapshots);
 }
}
