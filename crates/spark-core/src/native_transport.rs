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
pub(super) fn preserved_arrays(before:&str,after:&str,changes:&[(&str,usize)])->Result<()>{
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
/// Native format references and exact driver labels only; no engine code or alias writer.
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct NativeTransportPilotBinding {pub aircraft:String,pub pilot:String,pub actors:Vec<String>,pub animation_graphs:Vec<String>,pub seats:Vec<String>,pub issue:Option<String>,pub crew_seats:Vec<String>,pub crew_issue:Option<String>}
#[cfg(test)]
fn graph_seat_labels(fields:&str)->Result<Vec<String>>{
 let units=array_listing(fields,"units")?;if units.count>32{return invalid("Native graph exceeds32unit seat labels");}
 array_items(&units,"units")?.iter().map(|item|{let root=direct_struct_fields(item)?;let mut values=root.lines().filter_map(|line|line.strip_prefix("label (")).filter_map(|line|line.rsplit_once(')'));let(label,kind)=values.next().ok_or_else(||crate::SparkError::Invalid("Native animation unit label is missing".into()))?;if values.next().is_some()||kind.trim()!="string"||label.len()>31||label.chars().any(char::is_control){return invalid("Native animation unit label is unsupported or ambiguous");}Ok(label.into())}).collect()
}
fn pilot_actors(fields:&str,pilot:&str)->Result<Vec<String>>{
 let palette=array_listing(fields,"actor_palette")?;if palette.count>64{return invalid("Native actor palette exceeds64entries");}
 let palette=array_items(&palette,"actor_palette")?.iter().map(|item|native_dependency_path(&direct_struct_fields(item)?,"reference","actor_variant")).collect::<Result<Vec<_>>>()?;
 let (encounter_name,squad_name)=pilot.split_once('/').map(|(a,b)|(a,Some(b))).unwrap_or((pilot,None));
 let table=array_listing(fields,"encounters")?;let mut actors=vec![];let mut encounters=0;let mut matched=0;
 for item in array_items(&table,"encounters")?{let root=direct_struct_fields(&item)?;if native_name(&root)?!=encounter_name{continue;}encounters+=1;
  for row in array_items(&array_listing(&root,"squads")?,"squads")?{let root=direct_struct_fields(&row)?;if squad_name.is_some_and(|name|native_name(&root).ok().as_deref()!=Some(name)){continue;}let normal=native_index(&root,"normal_diff_count")?;let insane=native_index(&root,"insane_diff_count")?;if normal==0&&insane==0{continue;}if normal>1||insane>1||normal<0||insane<0{return invalid("Pilot scope has unsupported native difficulty counts");}matched+=1;
   let base=native_index(&root,"actor_type")?;let starts=array_listing(&root,"starting_locations")?;if starts.count==0{return invalid("Native pilot has no starting location");}
   for start in array_items(&starts,"starting_locations")?{let override_index=native_index(&direct_struct_fields(&start)?,"actor_type")?;let index=if override_index==-1{base}else{override_index};let path=usize::try_from(index).ok().and_then(|index|palette.get(index)).and_then(Option::as_ref).ok_or_else(||crate::SparkError::Invalid("Native pilot actor palette reference is missing".into()))?;if !actors.contains(path){actors.push(path.clone());}}
  }
 }
 if encounters!=1||matched==0||squad_name.is_some()&&matched!=1||actors.is_empty(){return invalid("Native pilot scope is missing or ambiguous");}Ok(actors)
}
pub fn pilot_bindings(fields:&str,choices:&NativeTransportChoices,mut read:impl FnMut(&str)->Result<String>,mut graph:impl FnMut(&str)->Result<Vec<String>>)->Result<Vec<NativeTransportPilotBinding>>{
 if choices.pilots.len()>128{return invalid("Review at most128native pilot choices at a time");}
 // Cache only tiny summaries for this review, never graph bytes or persistent files.
 let mut cache=std::collections::BTreeMap::<String,std::result::Result<Vec<String>,String>>::new();
 let mut summary=|tag:&str|->std::result::Result<Vec<String>,String>{if let Some(value)=cache.get(tag){return value.clone();}if cache.len()>=256{return Err("Pilot dependency review exceeds256tags".into());}
  let result=if tag.ends_with(".model_animations"){graph(tag).and_then(|labels|{if labels.len()>32||labels.iter().any(|label|label.len()>31||label.chars().any(char::is_control)){return invalid("Native pilot graph labels exceed their bounds");}Ok(labels)})}else{read(tag).and_then(|text|{let(key,extension)=if tag.ends_with(".actor_variant"){("unit","biped")}else{("animation_graph","model_animations")};let reference=native_dependency_path(&text,key,extension)?.ok_or_else(||crate::SparkError::Invalid(format!("Native pilot {key} is null")))?;Ok(vec![format!("{reference}.{extension}")])})}.map_err(|error|error.to_string());cache.insert(tag.into(),result.clone());result};
 let mut bindings=vec![];
 for pilot in &choices.pilots{let mut actors=vec![];let mut graphs=vec![];let mut labels=vec![];let checked=(||->std::result::Result<(),String>{actors=pilot_actors(fields,pilot).map_err(|error|error.to_string())?;for actor in &actors{let unit=summary(&format!("{actor}.actor_variant"))?;let graph=summary(&unit[0])?;let seats=summary(&graph[0])?;if !graphs.contains(&graph[0]){graphs.push(graph[0].clone());labels.push(seats);}}Ok(())})();
  for vehicle in &choices.vehicles{let seats=if checked.is_ok(){vehicle.pilot_seats.iter().filter(|seat|!labels.is_empty()&&labels.iter().all(|names|names.iter().filter(|name|*name==*seat).count()==1)).cloned().collect::<Vec<_>>()}else{vec![]};let issue=checked.as_ref().err().cloned().or_else(||seats.is_empty().then(||format!("Pilot animation graph lacks a unique exact driver label for {}; choose/import a compatible pilot and refresh source",vehicle.name)));let crew_seats=if checked.is_ok(){vehicle.seats.iter().filter(|seat|!vehicle.pilot_seats.contains(seat)&&vehicle.seats.iter().filter(|name|name.to_ascii_lowercase().contains(&seat.to_ascii_lowercase())).count()==1&&!labels.is_empty()&&labels.iter().all(|names|names.iter().filter(|name|*name==*seat).count()==1)).cloned().collect::<Vec<_>>()}else{vec![]};let crew_issue=checked.as_ref().err().cloned().or_else(||crew_seats.is_empty().then(||format!("Actor animation graph lacks a unique exact non-driver seat for {}; import compatible crew source and refresh",vehicle.name)));bindings.push(NativeTransportPilotBinding{aircraft:vehicle.name.clone(),pilot:pilot.clone(),actors:actors.clone(),animation_graphs:graphs.clone(),seats,issue,crew_seats,crew_issue});}
 }Ok(bindings)
}

/// A conservative native command profile; advanced programs keep the manual source path.
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
 fn pilot_scene()->String{concat!("actor_palette[2] array\n    actor_palette[0] struct\n        reference (actors/pilot.actor_variant) dependency\n    actor_palette[1] struct\n        reference (actors/passenger.actor_variant) dependency\nencounters[1] array\n    encounters[0] struct\n        name (pilot) string\n        squads[1] array\n            squads[0] struct\n                name (source_squad) string\n                normal_diff_count (1) int16\n                insane_diff_count (1) int16\n                actor_type (0) index\n                starting_locations[1] array\n                    starting_locations[0] struct\n                        actor_type (-1) index\n").into()}
 #[test]fn pilot_animation_bindings_follow_actual_overrides_and_reuse_checked_references(){
  let mut choices=scenario_transport_choices(&before()).unwrap();choices.pilots=vec!["pilot".into(),"pilot/source_squad".into()];choices.vehicles.push(NativeTransportVehicle{name:"extraction_spirit".into(),tag_path:"vehicles/spirit".into(),seats:vec!["c_dropship driver".into(),"CD-passengerL01".into(),"CD-passengerR01".into()],pilot_seats:vec!["c_dropship driver".into()],flight:None,flight_issue:None});
  let mut reads=0;let mut reader=|tag:&str|{reads+=1;Ok(match tag{"actors/pilot.actor_variant"=>"unit (actors/pilot.biped) dependency","actors/pilot.biped"=>"animation_graph (rig/pilot.model_animations)\n    dependency","rig/pilot.model_animations"=>"units[1] array\n    units[0] struct\n        label (c_dropship driver) string\n",_=>panic!("Unexpected source read {tag}")}.into())};
  let bindings=pilot_bindings(&pilot_scene(),&choices,&mut reader,|_|Ok(vec!["c_dropship driver".into()])).unwrap();assert_eq!(reads,2);assert_eq!(bindings.len(),2);assert!(bindings.iter().all(|row|row.seats==["c_dropship driver"]&&row.issue.is_none()));assert_eq!(bindings[0].actors,["actors/pilot"]);assert_eq!(bindings[0].animation_graphs,["rig/pilot.model_animations"]);
  let wrong=pilot_scene().replace("actor_type (-1)","actor_type (1)");let refused=pilot_bindings(&wrong,&choices,|tag|if tag=="actors/passenger.actor_variant"{Ok("unit (actors/passenger.biped) dependency".into())}else if tag.ends_with(".biped"){Ok("animation_graph (rig/passenger.model_animations) dependency".into())}else{Ok(String::new())},|_|Ok(vec!["CD-passengerL01".into()])).unwrap();assert!(refused.iter().all(|row|row.seats.is_empty()&&row.issue.as_deref().unwrap().contains("driver label")));assert!(refused.iter().all(|row|row.crew_seats==["CD-passengerL01"]&&row.crew_issue.is_none()));
  let mut ambiguous=choices.clone();ambiguous.vehicles[0].seats.push("CD-passengerL010".into());let blocked=pilot_bindings(&wrong,&ambiguous,|tag|if tag.ends_with(".actor_variant"){Ok("unit (actors/passenger.biped) dependency".into())}else{Ok("animation_graph (rig/passenger.model_animations) dependency".into())},|_|Ok(vec!["CD-passengerL01".into()])).unwrap();assert!(blocked.iter().all(|row|row.crew_seats.is_empty()&&row.crew_issue.is_some()),"Native vehicle_load_magic matches substrings, so ambiguous selectors must refuse");
  for graph in ["units[2] array\n    units[0] struct\n        label (c_dropship driver) string\n    units[1] struct\n        label (c_dropship driver) string\n","units[0] array\n"]{let result=pilot_bindings(&pilot_scene(),&choices,|tag|if tag.ends_with(".actor_variant"){Ok("unit (actors/pilot.biped) dependency".into())}else if tag.ends_with(".biped"){Ok("animation_graph (rig/pilot.model_animations) dependency".into())}else{Ok(String::new())},|_|graph_seat_labels(graph)).unwrap();assert!(result.iter().all(|row|row.seats.is_empty()&&row.issue.is_some()));}
  assert_eq!(native_dependency_path("reference (characters/marine_armored/marine_armored assault rifle.actor_variant)","reference","actor_variant").unwrap().as_deref(),Some("characters/marine_armored/marine_armored assault rifle"));
  let missing=pilot_bindings(&pilot_scene(),&choices,|_|invalid("Missing source graph"),|_|invalid("Missing source graph")).unwrap();assert!(missing.iter().all(|row|row.issue.as_deref()==Some("Missing source graph")));assert!(native_dependency_path("unit (../original.biped) dependency","unit","biped").is_err());assert!(native_dependency_path("unit (actors/pilot.vehicle) dependency","unit","biped").is_err());assert!(native_dependency_path("unit (actors/pilot.biped) int16","unit","biped").is_err());assert!(native_dependency_path("unit (a.biped) dependency\nunit (b.biped) dependency","unit","biped").is_err());
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
  let graph_labels=|source:&Path,tag:&str|->Result<Vec<String>>{let count=run(&editor,vec!["-t".into(),source.to_string_lossy().into_owned(),"-C".into(),"units".into(),tag.into()]).trim().parse::<usize>().unwrap();assert!(count<=32);if count==0{return Ok(vec![]);}let mut args=vec!["-t".into(),source.to_string_lossy().into_owned()];for index in 0..count{args.extend(["-G".into(),format!("units[{index}].label")]);}args.push(tag.into());let output=run(&editor,args);assert!(output.len()<2048);let values=output.lines().map(str::to_owned).collect::<Vec<_>>();assert_eq!(values.len(),count);Ok(values)};
  let fields=||run(&editor,vec!["-t".into(),tags.to_string_lossy().into_owned(),"-L".into(),tag.into()]);
  let global_names=|text:&str|{let array=array_listing(text,"globals").unwrap();array_items(&array,"globals").unwrap().iter().map(|row|native_name(&direct_struct_fields(row).unwrap()).unwrap()).collect::<Vec<_>>()};
  let before=fields();let original_globals=global_names(&before);let original_squads=scenario_squad_start_choices(&before).unwrap();let original_scripts=scenario_script_names(&before).unwrap();let mut protected=vec![input.clone(),shared.join("globals/globals.globals")];
  let mission_input=std::env::var_os("SPARK_NATIVE_RECOVERED_MISSION").map(|fixture|{let fixture=std::path::PathBuf::from(fixture);crate::reject_links(&fixture).unwrap();assert!(std::fs::metadata(&fixture).unwrap().len()<512*1024);let hash=crate::maps::hash_file(&fixture).unwrap();let value:serde_json::Value=serde_json::from_slice(&std::fs::read(&fixture).unwrap()).unwrap();(fixture,hash,value)});
  let faction=mission_input.as_ref().and_then(|(_,_,value)|value["transportSource"]["content"].as_str()).map(|content|serde_json::from_str::<serde_json::Value>(content.lines().nth(1).unwrap().strip_prefix("; configuration: ").unwrap()).unwrap()["faction"].as_str().unwrap().to_string()).unwrap_or("unsc".into());assert!(["unsc","covenant"].contains(&faction.as_str()));let active=usize::from(faction=="covenant");let role=if active==0{"pelican"}else{"spirit"};
  let mut selected=vec![];
  for(index,name)in["extraction_pelican","extraction_spirit"].into_iter().enumerate(){
   let vehicle=if index==0{"forerunner/transport/pelican"}else{"forerunner/transport/spirit"};let source=shared.join(format!("{vehicle}.vehicle"));protected.push(source.clone());
   let listing=run(&editor,vec!["-t".into(),shared.to_string_lossy().into_owned(),"-L".into(),format!("{vehicle}.vehicle")]);validate_vehicle_source(&listing).unwrap();
   let value=TransportAppend{name:name.into(),tag_path:vehicle.into(),position:[if index==active{49.}else{65.},-87.472,0.078429],rotation_radians:[0.25,0.,0.]};let previous=fields();
   let operation=Operation::AppendTransport{transport:value.clone(),source_sha256:crate::maps::hash_file(&file).unwrap()};let args=operation.arguments_with_fields(&tags,"scnr",tag,&previous).unwrap();run(&editor,args);let after=fields();reviewed_difference(&previous,&after,&operation).unwrap();selected.push(name.into());
   assert_eq!(original_scripts,scenario_script_names(&after).unwrap());assert_eq!(serde_json::to_value(&original_squads).unwrap(),serde_json::to_value(scenario_squad_start_choices(&after).unwrap()).unwrap());
  }
  let faction_request=std::env::var_os("SPARK_NATIVE_FACTION_KITS").map(|request|{
   let request=std::path::PathBuf::from(request);crate::reject_links(&request).unwrap();assert!(std::fs::metadata(&request).unwrap().len()<65536);let bytes=std::fs::read(&request).unwrap();let operation:Operation=serde_json::from_slice(&bytes).unwrap();let kits=if let Operation::FactionKits{kits,..}=operation{kits}else{panic!("Expected actual UI faction-kits request")};assert_eq!(kits.len(),2);
   for kit in &kits{let control=format!("{}.device_control",kit.control_tag_path);let source=shared.join(&control);validate_faction_control_source(&run(&editor,vec!["-t".into(),shared.to_string_lossy().into_owned(),"-L".into(),control])).unwrap();protected.push(source);for weapon in std::iter::once(&kit.profile.primary_weapon).chain(kit.profile.secondary_weapon.iter()){protected.push(shared.join(format!("{weapon}.weapon")));}}
   let before=fields();let operation=Operation::FactionKits{kits:kits.clone(),source_sha256:crate::maps::hash_file(&file).unwrap()};run(&editor,operation.arguments_with_fields(&tags,"scnr",tag,&before).unwrap());let after=fields();assert_eq!(reviewed_difference(&before,&after,&operation).unwrap().len(),2);assert!(operation.arguments_with_fields(&tags,"scnr",tag,&after).is_err());assert_eq!(std::fs::read(&request).unwrap(),bytes);
   let good=std::fs::read(&file).unwrap();let good_sha=crate::maps::hash_file(&file).unwrap();let rows=native_faction_snapshots(&after).unwrap();
   for (key,value) in [("controls[0].power_group".into(),rows[0].power_group.to_string()),(format!("controls[{}].device_flags.initially_off",rows[0].control_index),"1".into()),(format!("player_starting_profile[{}].starting_health_modifier",rows[0].profile_index),"0.5".into()),("object_names[0].name".into(),"Extraction_UNSC".into())]{run(&editor,vec!["-t".into(),tags.to_string_lossy().into_owned(),"-S".into(),key,value,tag.into()]);assert!(native_faction_snapshots(&fields()).is_err());std::fs::write(&file,&good).unwrap();assert_eq!(crate::maps::hash_file(&file).unwrap(),good_sha);}
   eprintln!("Native faction source refusals PASS: shared groups, disabled control, vitality and case-colliding names; exact owned source restored");kits
  });
  let squad_request=std::env::var_os("SPARK_NATIVE_SQUAD_TERMINALS").map(|request|{
   let request=std::path::PathBuf::from(request);crate::reject_links(&request).unwrap();assert!(std::fs::metadata(&request).unwrap().len()<65536);let bytes=std::fs::read(&request).unwrap();
   let operations:Vec<Operation>=serde_json::from_slice(&bytes).unwrap();assert_eq!(operations.len(),2);
   for mut operation in operations{let terminals=match &mut operation{Operation::SquadTerminals{terminals,source_sha256}=>{*source_sha256=crate::maps::hash_file(&file).unwrap();terminals.clone()},_=>panic!("Expected actual browser squad terminal requests")};
    for terminal in &terminals{let control=format!("{}.device_control",terminal.control_tag_path);validate_faction_control_source(&run(&editor,vec!["-t".into(),shared.to_string_lossy().into_owned(),"-L".into(),control.clone()])).unwrap();protected.push(shared.join(control));}
    let before=fields();run(&editor,operation.arguments_with_fields(&tags,"scnr",tag,&before).unwrap());let after=fields();assert_eq!(reviewed_difference(&before,&after,&operation).unwrap().len(),terminals.len());assert!(operation.arguments_with_fields(&tags,"scnr",tag,&after).is_err());
   }
   let rows=native_squad_terminal_snapshots(&fields()).unwrap();assert_eq!(rows.len(),2);assert_eq!(rows[0].terminal.readiness,mission_input.as_ref().is_some_and(|(_,_,value)|value["studio"]["missions"].as_array().is_some_and(|beats|beats.iter().any(|beat|beat["squadNumber"].is_u64()))));assert!(rows[1].terminal.readiness);
   let good=std::fs::read(&file).unwrap();let sha=crate::maps::hash_file(&file).unwrap();
   for(key,value)in [("controls[0].power_group".into(),rows[1].ready_group.unwrap().to_string()),(format!("controls[{}].device_flags.initially_off",rows[0].control_index),"1".into()),(format!("device_groups[{}].initial_value",rows[1].ready_group.unwrap()),"1".into()),("object_names[0].name".into(),"Extraction_Squad_01".into())]{run(&editor,vec!["-t".into(),tags.to_string_lossy().into_owned(),"-S".into(),key,value,tag.into()]);assert!(native_squad_terminal_snapshots(&fields()).is_err());std::fs::write(&file,&good).unwrap();assert_eq!(crate::maps::hash_file(&file).unwrap(),sha);}
   assert_eq!(std::fs::read(&request).unwrap(),bytes);eprintln!("Native squad source refusals PASS: alias, disabled control, prematurely ready gate, case collision; exact source restored");rows
  });
  if let Some(operations)=mission_input.as_ref().and_then(|(_,_,value)|value.get("cameraOperations")){
   let operations=operations.as_array().expect("Actual reviewed camera UI requests");assert_eq!(operations.len(),2);
   for value in operations{let mut operation:Operation=serde_json::from_value(value.clone()).unwrap();match &mut operation{Operation::CutsceneCamera{append:true,source_sha256,..}=>*source_sha256=crate::maps::hash_file(&file).unwrap(),_=>panic!("Expected native camera append")};let before=fields();run(&editor,operation.arguments_with_fields(&tags,"scnr",tag,&before).unwrap());let after=fields();assert_eq!(reviewed_difference(&before,&after,&operation).unwrap().len(),1);let scalar=run(&editor,operation.readback_arguments(&tags,"scnr",tag,&before).unwrap().unwrap());operation.verify_readback(&tags,"scnr",tag,&before,&scalar).unwrap();}
   eprintln!("Actual browser camera source appends PASS: {}",serde_json::to_string(&scenario_camera_choices(&fields()).unwrap()).unwrap());
  }
  if let Some(operations)=mission_input.as_ref().and_then(|(_,_,value)|value.get("flagOperations")){
   let operations=operations.as_array().expect("Actual native flag UI requests");assert_eq!(operations.len(),3);
   for value in operations{let mut operation:Operation=serde_json::from_value(value.clone()).unwrap();match &mut operation{Operation::CutsceneFlag{source_sha256,..}=>*source_sha256=crate::maps::hash_file(&file).unwrap(),_=>panic!("Expected native flag operation")};let before=fields();run(&editor,operation.arguments_with_fields(&tags,"scnr",tag,&before).unwrap());let after=fields();assert!(!reviewed_difference(&before,&after,&operation).unwrap().is_empty());let scalar=run(&editor,operation.readback_arguments(&tags,"scnr",tag,&before).unwrap().unwrap());operation.verify_readback(&tags,"scnr",tag,&before,&scalar).unwrap();}
   eprintln!("Actual browser native flag append/pose/scalar readback PASS: {}",serde_json::to_string(&scenario_flag_choices(&fields()).unwrap()).unwrap());
  }
  // Tune only an owned vehicle copy; do not serialize the shared original.
  let vehicle_tag=if active==0{"forerunner/transport/pelican.vehicle"}else{"forerunner/transport/spirit.vehicle"};let original_vehicle=std::fs::read(shared.join(vehicle_tag)).unwrap();
  let vehicle_file=tags.join(vehicle_tag);std::fs::create_dir_all(vehicle_file.parent().unwrap()).unwrap();std::fs::write(&vehicle_file,&original_vehicle).unwrap();
  let before_flight=run(&editor,vec!["-t".into(),tags.to_string_lossy().into_owned(),"-L".into(),vehicle_tag.into()]);
  let flight=VehicleFlightTuning{throttle:if active==0{0.5}else{0.30},avoidance_distance:5.,pathfinding_radius:2.};
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
  let end=snapshots(&route_before,&selected).unwrap()[active].transport.position;let pad=volumes.iter().find(|v|v.geometry.as_ref().is_some_and(|g|g.contains(end))&&volumes.iter().filter(|p|p.name==v.name).count()==1).expect("native flight fixture needs a readable unique pad containing its authored aircraft origin");
  let command=|point,modifier|NativeCommand{atom:"go_to".into(),modifier,parameters:[0.;2],point1:point,point2:-1,animation:-1,script:-1,recording:-1,command:-1,object_name:-1};
  let route=NativeCommandList{index:command_source.lists.len() as u16,name:"gs_native_flight".into(),flags:[false,false,false,false,false,true],bsp:0,points:vec![[end[0],end[1],end[2]+8.],end],commands:vec![command(0,1),command(1,0)]};
  let mut route=route;if repair{let approach=expected_squads.iter().find(|row|row.encounter_name=="be_covenant").unwrap().starts.as_ref().unwrap()[0].position;assert!(approach.iter().zip(end).map(|(a,b)|(a-b).powi(2)).sum::<f32>()>16.,"A repaired approach must retain a real traversal distance");route.points[0]=approach;}route.points.push([end[0]+2.,end[1],end[2]]);route.commands[1].atom="go_to_and_face".into();route.commands[1].point2=2;
  let op=Operation::CommandList{list:route.clone(),append:true,source_sha256:crate::maps::hash_file(&file).unwrap()};for args in op.argument_batches(op.arguments_with_fields(&tags,"scnr",tag,&route_before).unwrap(),false).unwrap(){run(&editor,args);}let route_after=fields();reviewed_difference(&route_before,&route_after,&op).unwrap();let review=native_transport_routes(&route_after).unwrap().into_iter().find(|r|r.name==route.name).unwrap();assert!(review.issue.is_none());assert!(review.arrival_volumes.contains(&pad.name));assert_eq!(review.final_position,Some(end));
  let mut controller=None;let mut insertion_expected=false;let mut radio_inputs=None;
  let mission=mission_input.as_ref().map(|(fixture,fixture_sha,value)|{
   let fixture_sha=fixture_sha.clone();let source=value["content"].as_str().unwrap();
   let mut project=crate::project::Project::new("Generated recovered mission native fixture");project.studio=Some(serde_json::from_value(value["studio"].clone()).unwrap());
   if project.studio.as_ref().unwrap().missions.iter().any(|beat|beat.sound_cue.is_some()){
    let source_map=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_TRANSPORT_BASE_MAP").expect("Explicit native sound source"));let inspection=crate::maps::inspect_map(&source_map,None).unwrap();let mut source=crate::project::Project::new("Read-only owned mission audio source");
    source.source=Some(crate::project::Source{original_path:source_map.clone(),preserved_path:source_map.clone(),sha256:inspection.sha256.clone(),cache_version:inspection.header.version,engine:inspection.header.engine.clone(),scenario_path:inspection.scenario_path.clone(),archive:None,resource_directory:None,resource_sha256:Default::default(),audio_resources:None});project.source=source.source.clone();
    let managed=root.join("managed");std::fs::create_dir(&managed).unwrap();let tools=crate::build::Toolchain{invader_directory:Some(tools.to_path_buf()),resource_directory:None,h1a_directory:None,base_tags_directory:None};let cancel=std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let cues=project.studio.as_ref().unwrap().missions.iter().filter_map(|beat|beat.sound_cue.clone()).collect::<Vec<_>>();assert_eq!(cues.len(),1,"Reviewed real radio fixture owns one complete native sound");let cue=&cues[0];let prefix=format!("gs_assets_{}/",cue.import_id.replace('-',""));let original_path=cue.sound_path.strip_prefix(&prefix).expect("Actual UI import namespace");let selected=inspection.tags.iter().find(|tag|tag.class=="snd!"&&tag.path.replace('\\',"/")==original_path).expect("Actual sound exists in the protected map");
    let audio=crate::audio::inspect_sound(&source_map,&inspection.sha256,selected.id).unwrap();assert!(!audio.permutations.is_empty()&&audio.permutations.iter().all(|p|p.available&&p.byte_length>0&&p.sha256.is_some()),"Read real source samples without inventing silent data: {audio:?}");
    let extracted=crate::tag_exchange::extract_selected_tag(&source,&inspection,&tools,&managed,&uuid::Uuid::new_v4().to_string(),selected.id,cancel.clone(),|_|{}).unwrap();
    let imported=crate::native_asset_imports::prepare(&project,&source,&inspection,&extracted,&tools,&managed,&cue.import_id,selected.id,&cancel,|_|{}).unwrap();assert_eq!(imported.native_path,cue.sound_path);project.native_asset_imports.push(imported.clone());assert!(crate::native_asset_imports::is_used(&project,&imported));
    let hashes=crate::native_asset_imports::source_hashes(&managed,&project).unwrap();assert_eq!(crate::native_asset_imports::stage_working(&managed,&project,&tags).unwrap(),hashes);assert_eq!(crate::native_asset_imports::stage_working(&managed,&project,&tags).unwrap(),hashes);
    radio_inputs=Some((project.clone(),managed,source_map,inspection.sha256.clone(),audio,hashes));eprintln!("Actual native mission radio import/staging PASS: {} original permutations, {} verified tags; source preserved",radio_inputs.as_ref().unwrap().4.permutations.len(),imported.file_count);
   }
   let filename=value["filename"].as_str().unwrap_or("gs_mission.hsc");let binding=crate::creative::recovered_mission_binding_for_module(&project,source,filename,value["replacesSha256"].as_str()).unwrap().unwrap();let data=root.join("data");std::fs::create_dir(&data).unwrap();
   run(&tools.join("invader-recover.exe"),vec!["-t".into(),tags.to_string_lossy().into_owned(),"-d".into(),data.to_string_lossy().into_owned(),tag.into()]);
   let target=data.join("scripts").join(crate::safe_relative(filename).unwrap());
   let recovered_prior=value.get("previousGeneratedSource");
   if let Some(prior)=recovered_prior{
    assert_eq!(prior["filename"].as_str(),Some(filename));assert_eq!(prior["sha256"].as_str(),value["replacesSha256"].as_str());assert_eq!(Some(crate::maps::hash_file(&target).unwrap().as_str()),prior["replacesSha256"].as_str(),"Prior generated source must start from the exact original module");let content=prior["content"].as_str().unwrap();assert!(content.starts_with("; Spark recovered campaign mission v1\n")&&content.len()<=256*1024);std::fs::write(&target,content).unwrap();assert_eq!(Some(crate::maps::hash_file(&target).unwrap().as_str()),prior["sha256"].as_str());
   }else{
    if let Some(expected)=value["replacesSha256"].as_str(){assert_eq!(crate::maps::hash_file(&target).unwrap(),expected,"Only the exact reviewed recovered module may be revised in owned scratch");}else{assert!(!target.exists(),"Never replace an original recovered source module without its reviewed hash");}
    std::fs::create_dir_all(target.parent().unwrap()).unwrap();std::fs::write(&target,source).unwrap();
   }
   if let Some(transport)=value.get("transportSource"){
    // Consume the actual saved UI controller, using existing native append and
    // command writers for its missing content. No second mission/AI writer.
    let content=transport["content"].as_str().unwrap();assert!(content.starts_with("; Spark native transport controller v1\n"));
    let config:serde_json::Value=serde_json::from_str(content.lines().nth(1).unwrap().strip_prefix("; configuration: ").unwrap()).unwrap();
    assert_eq!(config["faction"],faction);assert_eq!(config["pilotSeat"],if active==0{"P-driver"}else{"c_dropship driver"});assert_eq!(config["hub"],"extraction_return");assert_eq!(config["field"],"extraction_zone");assert_eq!(config["returnAfterInsertion"],true);
    let pilot_name=config["pilot"].as_str().unwrap();let prior=fields();
    let actor=if active==0{"characters/marine_armored/marine_armored assault rifle"}else{"forerunner/transport/spirit_pilot"};let actor_source=shared.join(format!("{actor}.actor_variant"));assert!(actor_source.is_file(),"Use real prepared pilot source, never synthesize an actor");if active==0{assert_eq!(encounter_append_layout(&prior,pilot_name,actor).unwrap().2,0);}
    let pilot:EncounterAppend=serde_json::from_value(serde_json::json!({"name":pilot_name,"actorPath":actor,"position":end,"startActive":!config["createPilot"].as_bool().unwrap_or(false),"count":1,"spacing":1})).unwrap();
    let operation=pilot.operation();for batch in operation.argument_batches(operation.arguments_with_fields(&tags,"scnr",tag,&prior).unwrap(),false).unwrap(){run(&editor,batch);}
    let after=fields();reviewed_difference(&prior,&after,&operation).unwrap();expected_squads=scenario_squad_start_choices(&after).unwrap();
    assert!(scenario_transport_choices(&after).unwrap().pilots.contains(&pilot_name.to_string()));assert!(native_mission_encounters(&after).unwrap().iter().any(|row|row.name==pilot_name&&row.initially_created==pilot.start_active));if !pilot.start_active{assert!(scenario_transport_choices(&after).unwrap().script_created_pilots.contains(&pilot_name.to_string()));assert!(content.contains(&format!("(if (= (ai_living_count {pilot_name}) 0) (ai_place {pilot_name}))")));}
    let crew_config=config.get("crew").map(|rows|rows.as_array().unwrap().clone()).unwrap_or_default();assert!(crew_config.len()<=8);let mut crew_specs=vec![];insertion_expected=crew_config.iter().any(|member|member["releaseAtInsertion"].as_bool()==Some(true));
    for member in &crew_config{
     let group=member["group"].as_str().unwrap();let before=fields();if native_mission_encounters(&before).unwrap().iter().any(|row|row.name==group){assert!(member["releaseAtInsertion"].as_bool()==Some(true),"Existing mission groups need an explicit insertion handoff");assert!(scenario_transport_choices(&before).unwrap().pilots.contains(&group.to_string()));assert!(scenario_transport_choices(&before).unwrap().script_created_pilots.contains(&group.to_string()));assert!(pilot_actors(&before,group).is_ok());eprintln!("Existing insertion troop source retained without append PASS: {group}");continue;}
     let actor=if active==0{"characters/marine_armored/marine_armored assault rifle"}else{"characters/grunt/grunt minor plasma pistol"};assert!(shared.join(format!("{actor}.actor_variant")).is_file(),"Use real prepared compatible crew actors");
     let crew:EncounterAppend=serde_json::from_value(serde_json::json!({"name":member["group"],"actorPath":actor,"position":end,"startActive":!member["create"].as_bool().unwrap_or(false),"count":1,"spacing":1})).unwrap();
     let before=fields();let operation=crew.operation();for batch in operation.argument_batches(operation.arguments_with_fields(&tags,"scnr",tag,&before).unwrap(),false).unwrap(){run(&editor,batch);}let after=fields();reviewed_difference(&before,&after,&operation).unwrap();expected_squads=scenario_squad_start_choices(&after).unwrap();assert!(scenario_transport_choices(&after).unwrap().pilots.contains(&crew.name));crew_specs.push(crew);
    }
    let field=route.points[0];assert!(volumes.iter().find(|v|v.name=="extraction_zone").unwrap().geometry.as_ref().unwrap().contains(field));
    let mut routes=vec![];
    for (key,points) in [("outbound",vec![end,field,route.points[2]]),("inbound",vec![field,end,route.points[2]])]{
     let before=fields();let source=native_command_source(&before).unwrap();let list=NativeCommandList{index:source.lists.len() as u16,name:config[key].as_str().unwrap().into(),flags:route.flags,bsp:route.bsp,points,commands:route.commands.clone()};
     let operation=Operation::CommandList{list:list.clone(),append:true,source_sha256:crate::maps::hash_file(&file).unwrap()};for batch in operation.argument_batches(operation.arguments_with_fields(&tags,"scnr",tag,&before).unwrap(),false).unwrap(){run(&editor,batch);}
     let after=fields();reviewed_difference(&before,&after,&operation).unwrap();let reviewed=native_transport_routes(&after).unwrap().into_iter().find(|row|row.name==list.name).unwrap();assert!(reviewed.issue.is_none());assert!(reviewed.arrival_volumes.iter().any(|name|name==if key=="outbound"{"extraction_zone"}else{"extraction_return"}));routes.push(list);
    }
    let transport_filename=transport["filename"].as_str().unwrap();assert_eq!(transport_filename,format!("gs_{role}_transport.hsc"));let transport_file=data.join("scripts").join(transport_filename);assert!(!transport_file.exists());std::fs::write(&transport_file,content).unwrap();
    let mut choices=scenario_transport_choices(&fields()).unwrap();for vehicle in &mut choices.vehicles{let tag=format!("{}.vehicle",vehicle.tag_path);let source=if tags.join(&tag).is_file(){&tags}else{&shared};let listing=run(&editor,vec!["-t".into(),source.to_string_lossy().into_owned(),"-L".into(),tag]);vehicle.pilot_seats=native_vehicle_pilot_seats(&listing).unwrap();vehicle.seats=native_vehicle_seats(&listing).unwrap();}
    choices.pilots.retain(|value|value==pilot_name||value==&format!("{pilot_name}/source_squad")||crew_config.iter().any(|crew|crew["group"].as_str()==Some(value.as_str())));let graph_inputs=std::cell::RefCell::new(std::collections::BTreeMap::new());
    let bindings=pilot_bindings(&fields(),&choices,|tag|{let relative=crate::safe_relative(tag)?;let source=if tags.join(&relative).is_file(){&tags}else{&shared};let file=source.join(relative);crate::reject_links(&file)?;let sha=crate::maps::hash_file(&file)?;let listing=run(&editor,vec!["-t".into(),source.to_string_lossy().into_owned(),"-L".into(),tag.into()]);assert_eq!(sha,crate::maps::hash_file(&file).unwrap());assert!(listing.len()<=1024*1024,"Match the actual source reader stream bound");graph_inputs.borrow_mut().insert(tag.to_string(),(file,sha));Ok(listing)},|tag|{let relative=crate::safe_relative(tag)?;let source=if tags.join(&relative).is_file(){&tags}else{&shared};let file=source.join(relative);crate::reject_links(&file)?;let sha=crate::maps::hash_file(&file)?;let labels=graph_labels(source,tag)?;assert_eq!(sha,crate::maps::hash_file(&file).unwrap());graph_inputs.borrow_mut().insert(tag.to_string(),(file,sha));Ok(labels)}).unwrap();let binding=bindings.iter().find(|row|row.aircraft==format!("extraction_{role}")&&row.pilot==pilot_name).unwrap();assert!(binding.issue.is_none(),"{binding:?}");assert_eq!(binding.seats,vec![config["pilotSeat"].as_str().unwrap()]);
    for member in &crew_config{let binding=bindings.iter().find(|row|row.aircraft==format!("extraction_{role}")&&Some(row.pilot.as_str())==member["group"].as_str()).unwrap();assert!(binding.crew_issue.is_none(),"{binding:?}");assert!(binding.crew_seats.iter().any(|seat|Some(seat.as_str())==member["seat"].as_str()));eprintln!("Real native permanent crew graph binding PASS: {binding:?}");}
    eprintln!("Real native pilot graph binding PASS: {binding:?}");controller=Some((pilot,crew_specs,routes,crate::maps::hash_file(&transport_file).unwrap(),graph_inputs.into_inner()));
   }

   let compile_hud=|relative:&str,bytes:&[u8]|{let hmt=data.join(format!("{relative}.hmt"));std::fs::create_dir_all(hmt.parent().unwrap()).unwrap();std::fs::write(&hmt,bytes).unwrap();run(&tools.join("invader-string.exe"),vec!["-t".into(),tags.to_string_lossy().into_owned(),"-d".into(),data.to_string_lossy().into_owned(),"-T".into(),"hud_message_text".into(),relative.into()]);run(&editor,vec!["-t".into(),tags.to_string_lossy().into_owned(),"-S".into(),"hud_messages".into(),format!("{relative}.hud_message_text"),tag.into()]);};
   if value["seedHud"].as_bool()==Some(true){let original_hud=crate::firefight::format_native_hud_append(vec![crate::firefight::NativeRoundHudMessage{name:"legacy_objective".into(),text:"Keep this original HUD message.".into()}],None,&[]).unwrap().unwrap();compile_hud("be_native/legacy_messages",&original_hud.source);}
   let hud=crate::working_tags::prepare_mission_hud_append(&project,&tags,&fields(),None,&crate::maps::hash_file(&tools.join("invader-string.exe")).unwrap()).unwrap();
   if let Some(hud)=&hud{compile_hud(&hud.review.output_tag_path,&hud.source);if value["seedHud"].as_bool()==Some(true){assert_eq!(hud.original_count,1);assert_eq!(hud.input_messages[0].name,"legacy_objective");assert_eq!(hud.messages[0],hud.input_messages[0]);}}

   run(&tools.join("invader-script.exe"),vec!["-t".into(),tags.to_string_lossy().into_owned(),"-t".into(),shared.to_string_lossy().into_owned(),"-d".into(),data.to_string_lossy().into_owned(),"-g".into(),"gbx-custom".into(),"-E".into(),"be_native".into()]);
   if let Some(prior)=recovered_prior{
    let recovered=root.join("prior-source-readback");std::fs::create_dir(&recovered).unwrap();run(&tools.join("invader-recover.exe"),vec!["-t".into(),tags.to_string_lossy().into_owned(),"-d".into(),recovered.to_string_lossy().into_owned(),tag.into()]);let readback=recovered.join("scripts").join(filename);assert_eq!(Some(crate::maps::hash_file(&readback).unwrap().as_str()),prior["sha256"].as_str(),"Native recovered-source receipt must match the actual reviewed UI module");assert!(scenario_script_names(&fields()).unwrap().starts_with(&original_scripts));assert!(global_names(&fields()).starts_with(&original_globals));eprintln!("Previous generated module compiled and independently recovered before reviewed adoption PASS: {}",prior["sha256"]);
    std::fs::write(&target,source).unwrap();run(&tools.join("invader-script.exe"),vec!["-t".into(),tags.to_string_lossy().into_owned(),"-t".into(),shared.to_string_lossy().into_owned(),"-d".into(),data.to_string_lossy().into_owned(),"-g".into(),"gbx-custom".into(),"-E".into(),"be_native".into()]);
   }
   assert_eq!(fixture_sha,crate::maps::hash_file(&fixture).unwrap());eprintln!("Generated recovered mission source {}",crate::maps::hash_file(&target).unwrap());(binding,hud)
  });
  let squad_query=std::env::var_os("SPARK_NATIVE_SQUAD_QUERY").is_some();
  if squad_query{
   let data=root.join("squad-data");std::fs::create_dir(&data).unwrap();run(&tools.join("invader-recover.exe"),vec!["-t".into(),tags.to_string_lossy().into_owned(),"-d".into(),data.to_string_lossy().into_owned(),tag.into()]);
   std::fs::write(data.join("scripts/gs_squad_query.hsc"),"(script static object_list forerunner_squad_01_players (list_get (players) 32767))\n").unwrap();
   run(&tools.join("invader-script.exe"),vec!["-t".into(),tags.to_string_lossy().into_owned(),"-t".into(),shared.to_string_lossy().into_owned(),"-d".into(),data.to_string_lossy().into_owned(),"-g".into(),"gbx-custom".into(),"-E".into(),"be_native".into()]);
  }
  let reviewed=fields();let mut snapshots=snapshots(&reviewed,&selected).unwrap();snapshots[active].flight=Some(flight.clone());let source_sha=crate::maps::hash_file(&file).unwrap();
  run(&tools.join("invader-build.exe"),vec!["-t".into(),tags.to_string_lossy().into_owned(),"-t".into(),shared.to_string_lossy().into_owned(),"-g".into(),"gbx-custom".into(),"-m".into(),output.to_string_lossy().into_owned(),"be_native".into()]);
  if repair{let log=diagnostics.borrow();assert!(!log.contains("Encounter #2 (be_flood)"),"{log}");assert!(!log.contains("Command list #0 (gs_native_flight)"),"{log}");eprintln!("Native compiler confirms repaired Flood and all flight-route points have BSP surface bindings; native manual-index flags unchanged");}
  let cache=output.join("be_native.map");let map=crate::maps::inspect_map(&cache,None).unwrap();assert_eq!(map.header.version,609);assert_eq!(map.header.scenario_type,0);
  if let Some(original_map)=std::env::var_os("SPARK_NATIVE_TRANSPORT_BASE_MAP"){let baseline=crate::maps::inspect_map(&std::path::PathBuf::from(original_map),None).unwrap();assert!(map.encounters.len()>=baseline.encounters.len());for(old,new)in baseline.encounters.iter().zip(&map.encounters){assert_eq!((&old.name,old.team),(&new.name,new.team),"Mission runtime team choices must not rewrite original scenario AI teams");}eprintln!("Original native encounter teams retained PASS: {}",baseline.encounters.len());}
  verify_cache(&snapshots,&cache,&map).unwrap();
  let snapshot=ScenarioSquadReadback{named_objects:if mission.as_ref().is_some_and(|(b,_)|b.missions.iter().any(|beat|beat.guidance.as_ref().is_some_and(|g|g.object.is_some()))){Some(native_guidance_objects(&reviewed).unwrap())}else{None},cutscene_flags:Some(scenario_flag_choices(&reviewed).unwrap()),extraction_squads:squad_request.clone(),faction_kits:if faction_request.is_some(){Some(native_faction_snapshots(&reviewed).unwrap())}else{None},transports:Some(snapshots.clone()),command_lists:Some(native_command_source(&reviewed).unwrap().lists),devices:None,volumes:Some(volumes),cameras:if mission_input.as_ref().is_some_and(|(_,_,v)|v.get("cameraOperations").is_some()){Some(scenario_camera_choices(&reviewed).unwrap())}else{None},source_sha256:source_sha.clone(),squads:expected_squads,include_starts:true,combat:vec![]};snapshot.verify_cache(&cache,&map).unwrap();if let Some(flags)=snapshot.cutscene_flags.as_ref().filter(|flags|!flags.is_empty()){assert_eq!(crate::maps::scenario_flag_readback(&cache,&map).unwrap().len(),flags.len());let mut wrong=snapshot.clone();wrong.cutscene_flags.as_mut().unwrap()[0].position[0]+=1.;assert!(wrong.verify_cache(&cache,&map).is_err());}
  if let Some(objects)=&snapshot.named_objects{for field in 0..5{let mut wrong=snapshot.clone();let object=&mut wrong.named_objects.as_mut().unwrap()[0];match field{0=>object.position[0]+=1.,1=>object.tag_path.push_str("_changed"),2=>object.index+=1,3=>object.name_index+=1,_=>object.name.push_str("_changed")};assert!(wrong.verify_cache(&cache,&map).is_err(),"Compiled readback must reject object binding drift");}eprintln!("Named waypoint source/cache identity, asset and coordinates PASS: {}",serde_json::to_string(objects).unwrap());}
  if let Some(cameras)=&snapshot.cameras{assert_eq!(cameras.len(),2);let actual=crate::maps::scenario_camera_readback(&cache,&map).unwrap();assert!(cameras.iter().zip(&actual).all(|(a,b)|camera_points_close(a,b)));let mut wrong=snapshot.clone();wrong.cameras.as_mut().unwrap()[0].position[0]+=1.;assert!(wrong.verify_cache(&cache,&map).is_err());eprintln!("Compiled relative camera offset/orientation/FOV inventory readback PASS");}
  if repair{let locations=crate::maps::bsp_point_locations(&cache,&map,&route.points).unwrap();assert!(locations.iter().all(|row|row.supports.iter().any(|surface|surface.bsp==0)));eprintln!("Repaired compiled route point geometry: {}",serde_json::to_string(&locations).unwrap());}
  if let Some(kits)=&faction_request{
   let expected=snapshot.faction_kits.as_ref().unwrap();assert_eq!(expected.len(),2);let recovered=root.join("independent-factions");std::fs::create_dir(&recovered).unwrap();let mut args=vec!["-t".into(),recovered.to_string_lossy().into_owned(),"-s".into(),tag.into()];let unique=kits.iter().map(|kit|format!("{}.device_control",kit.control_tag_path)).collect::<std::collections::BTreeSet<_>>();for control in unique{args.extend(["-s".into(),control]);}args.push(cache.to_string_lossy().into_owned());run(&tools.join("invader-extract.exe"),args);
   for row in expected{let control=format!("{}.device_control",row.kit.control_tag_path);let get=|tag:&str,key:&str|run(&editor,vec!["-t".into(),recovered.to_string_lossy().into_owned(),"-G".into(),key.into(),tag.into()]);verify_native_faction_control_values(&get(&control,"triggers_when"),&get(tag,&format!("controls[{}].device_flags.initially_off",row.control_index))).unwrap();}
   for field in 0..5{let mut bad=expected.clone();match field{0=>bad[0].kit.profile.primary_reserved+=1,1=>bad[0].kit.position[0]+=1.,2=>bad[0].profile_index+=1,3=>bad[0].position_group=bad[0].power_group,_=>bad[0].kit.rotation_radians[0]+=0.2};assert!(verify_native_faction_kits(&bad,&cache,&map).is_err());}
   eprintln!("Native faction terminal/profile compile and independent control readback PASS: {}",serde_json::to_string(expected).unwrap());
  }
  if let Some(expected)=&squad_request{
   assert_eq!(crate::creative::compiled_extraction_requirements(&cache,&map).unwrap().unwrap(),vec![crate::creative::SQUAD_OBJECTIVES_FEATURE.to_string()]);
   let recovered=root.join("independent-squads");std::fs::create_dir(&recovered).unwrap();let mut args=vec!["-t".into(),recovered.to_string_lossy().into_owned(),"-s".into(),tag.into()];
   for control in expected.iter().map(|row|format!("{}.device_control",row.terminal.control_tag_path)).collect::<std::collections::BTreeSet<_>>(){args.extend(["-s".into(),control]);}args.push(cache.to_string_lossy().into_owned());run(&tools.join("invader-extract.exe"),args);
   for row in expected{let control=format!("{}.device_control",row.terminal.control_tag_path);let get=|tag:&str,key:&str|run(&editor,vec!["-t".into(),recovered.to_string_lossy().into_owned(),"-G".into(),key.into(),tag.into()]);verify_native_faction_control_values(&get(&control,"triggers_when"),&get(tag,&format!("controls[{}].device_flags.initially_off",row.control_index))).unwrap();}
   for field in 0..4{let mut wrong=expected.clone();match field{0=>wrong[0].terminal.position[0]+=1.,1=>wrong[0].name_index+=1,2=>wrong[1].ready_group=Some(wrong[1].position_group),_=>wrong[0].terminal.rotation_radians[0]+=0.2};assert!(verify_native_squad_terminals(&wrong,&cache,&map).is_err());}
   eprintln!("Native squad terminal/gate compile and independent interaction readback PASS: {}",serde_json::to_string(expected).unwrap());
  }
  let compiled_routes=crate::maps::scenario_command_readback(&cache,&map).unwrap();assert!(compiled_routes.iter().find(|r|r.name==route.name).unwrap().close(&route));eprintln!("Native physical-flight route source/readback PASS: {review:?}; geometry is authored source only, not flight acceptance");
  for field in 0..3{let mut wrong=flight.clone();match field{0=>wrong.throttle+=0.1,1=>wrong.avoidance_distance+=0.1,_=>wrong.pathfinding_radius+=0.1};assert!(wrong.verify_map(&map,"forerunner/transport/pelican").is_err());}
  for field in 0..4{let mut wrong=snapshots.clone();match field{0=>wrong[0].transport.position[0]+=1.,1=>wrong[0].transport.rotation_radians[0]+=0.5,2=>wrong[0].name_index+=1,_=>wrong[0].groups[0]+=1};assert!(verify_cache(&wrong,&cache,&map).is_err(),"Compiled aircraft readback accepted a wrong pose/name/group");}

  let names=map.scripts.iter().map(|s|s.name.clone()).collect::<Vec<_>>();
  if let Some((binding,hud))=&mission{let readback=root.join("independent-scripts");std::fs::create_dir(&readback).unwrap();run(&tools.join("invader-extract.exe"),vec!["-s".into(),tag.into(),"-t".into(),readback.to_string_lossy().into_owned(),cache.to_string_lossy().into_owned()]);let extracted=run(&editor,vec!["-t".into(),readback.to_string_lossy().into_owned(),"-L".into(),tag.into()]);assert!(global_names(&extracted).starts_with(&original_globals),"Compiled original global indices changed");assert!(scenario_script_names(&extracted).unwrap().starts_with(&original_scripts),"Independent native extraction reports shifted original script indices");eprintln!("Independent original script/global index readback PASS: {original_scripts:?} / {original_globals:?}");crate::creative::verify_native_mission_with_hud(binding,&map,&cache,hud.as_ref().map(|hud|(hud.review.output_tag_path.as_str(),hud.messages.as_slice()))).unwrap();if let Some(index)=binding.missions.iter().position(|beat|beat.guidance.as_ref().is_some_and(|g|g.object.is_some())){let mut wrong=binding.clone();wrong.missions[index].guidance.as_mut().unwrap().object=Some("missing_guidance_object".into());assert!(crate::creative::verify_native_mission_with_hud(&wrong,&map,&cache,hud.as_ref().map(|hud|(hud.review.output_tag_path.as_str(),hud.messages.as_slice()))).unwrap_err().to_string().contains("waypoint object"));}if binding.missions.iter().any(|beat|beat.trigger=="forerunnerExtractionSettled"){assert!(crate::creative::compiled_extraction_mode(&cache,&map).unwrap());}if let Some(hud)=hud{let read=crate::maps::scenario_hud_messages(&cache,&map).unwrap().unwrap();assert_eq!(read.messages,hud.messages);let mut wrong=hud.messages.clone();wrong[0].name.push_str("_changed");assert!(crate::creative::verify_native_mission_with_hud(binding,&map,&cache,Some((&hud.review.output_tag_path,&wrong))).is_err(),"Readback must reject changed original or authored HUD entries");eprintln!("Native complete mission HUD readback PASS: {} messages, original prefix {}",read.messages.len(),hud.original_count);}assert!(names.starts_with(&original_scripts),"Composed source shifted original native script indices: {original_scripts:?} -> {names:?}");let scopes=binding.missions.iter().filter_map(|beat|beat.squad_number).collect::<std::collections::BTreeSet<_>>();let guides=binding.missions.iter().filter(|beat|beat.guidance.is_some()).filter_map(|beat|beat.squad_number).collect::<std::collections::BTreeSet<_>>();let extra=4*scopes.len()+3*guides.len()+usize::from(!scopes.is_empty()&&binding.missions.iter().any(|beat|beat.squad_number.is_none()));assert_eq!(names.len(),original_scripts.len()+2+extra+(if controller.is_some(){3}else{0})+usize::from(insertion_expected)+usize::from(squad_query));eprintln!("Generated recovered mission CE609 compile/readback PASS: {} scripts {:?}; no mission/gameplay acceptance",map.sha256,names);}else{let mut expected=original_scripts.clone();if squad_query{expected.push("forerunner_squad_01_players".into());}assert_eq!(expected,names);}
  if squad_query{
   let requirements=crate::creative::compiled_extraction_requirements(&cache,&map).unwrap().unwrap();assert_eq!(requirements,vec![crate::creative::SQUAD_OBJECTIVES_FEATURE.to_string()]);
   let script=map.scripts.iter().find(|script|script.name=="forerunner_squad_01_players").unwrap();assert_eq!((script.script_type,script.return_type),(3,23));
   eprintln!("Native squad query CE609 requirement readback PASS: static object_list; {}",map.sha256);
  }

  if let Some((project,managed,source,source_sha,audio,hashes))=&radio_inputs{
   crate::native_asset_imports::verify_compiled(project,&map).unwrap();let binding=&project.native_asset_imports[0];let sound=map.tags.iter().find(|tag|tag.class=="snd!"&&tag.path.replace('\\',"/")==binding.native_path).unwrap();let actual=crate::audio::inspect_sound(&cache,&map.sha256,sound.id).unwrap();
   let signatures=|audio:&crate::audio::SoundInspection|audio.permutations.iter().map(|p|(p.pitch_range,p.permutation,p.next_permutation,p.format.clone(),p.channels,p.sample_rate,p.byte_length,p.sha256.clone())).collect::<Vec<_>>();assert_eq!(signatures(audio),signatures(&actual));assert!(actual.permutations.iter().all(|p|p.available));assert_eq!(*hashes,crate::native_asset_imports::source_hashes(managed,project).unwrap());assert_eq!(*source_sha,crate::maps::hash_file(source).unwrap());eprintln!("Compiled mission radio sample identity/readback PASS: {} real native permutations; {}",actual.permutations.len(),serde_json::to_string(&actual).unwrap());
  }
  // Optional continuation consumes another generated UI source revision through
  // the actual production parent/source builder and working-tag transaction.
  if let (Some((radio,managed,source,_,audio,_)),Some(revision))=(&radio_inputs,mission_input.as_ref().and_then(|(_,_,v)|v.get("workingRadioRevision"))){
   let native_tags=managed.join("recovered-native-tags");std::fs::create_dir(&native_tags).unwrap();
   let cancel=std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));let event=|_|{};let extraction_id=uuid::Uuid::new_v4().to_string();
   let native_runner=crate::build::Runner{id:&extraction_id,project:&radio.id,cancel:&cancel,event:&event};
   native_runner.run(&tools.join("invader-extract.exe"),&["-n".into(),"-e".into(),tag.into(),"-t".into(),native_tags.to_string_lossy().into_owned(),cache.to_string_lossy().into_owned()],root,"extract",10).unwrap();
   // Cache extraction cannot recover stripped source modules. Keep the exact
   // authored scenario instead of pretending bytecode is editable HaloScript.
   crate::native_staging::copy_file(&file,&native_tags.join(tag),std::fs::metadata(&file).unwrap().len(),Some(&source_sha),&cancel).unwrap();
   let jobs=managed.join("jobs");std::fs::create_dir(&jobs).unwrap();
   let mut parent=radio.clone();parent.native_asset_imports.clear();parent.studio=None;parent.scene=map.objects.clone();
   parent.source=Some(crate::project::Source{original_path:cache.clone(),preserved_path:cache.clone(),sha256:map.sha256.clone(),cache_version:609,engine:map.header.engine.clone(),scenario_path:map.scenario_path.clone(),archive:None,resource_directory:None,resource_sha256:Default::default(),audio_resources:None});
   let target_id=uuid::Uuid::new_v4().to_string();parent.build_targets=vec![crate::project::EngineBuildTarget{id:target_id.clone(),name:"Reviewed recovered CE source".into(),runtime_id:crate::runtime::RuntimeId::ChupathingyCe,builder:"invader-ce".into(),hek_directory:None,hek_flavor:None,tags_directory:Some(native_tags.clone()),invader_directory:Some(tools.to_path_buf()),ce_compatible_tagset:true,open_sauce:false}];parent.active_build_target=Some(target_id);
   let toolchain=crate::build::Toolchain{invader_directory:Some(tools.to_path_buf()),base_tags_directory:Some(native_tags),..Default::default()};
   let baseline=crate::build::run_build(&parent,&map,&toolchain,&jobs,&uuid::Uuid::new_v4().to_string(),cancel.clone(),|e|{if e.severity=="error"{eprintln!("{}: {}",e.phase,e.message);}}).unwrap();assert_eq!(baseline.status,"validated","{}",baseline.message);parent.builds.push(baseline.clone());
   let mut current=parent.clone();current.studio=Some(serde_json::from_value(revision["studio"].clone()).unwrap());
   let cue=current.studio.as_ref().unwrap().missions.iter().find_map(|beat|beat.sound_cue.as_ref()).unwrap().clone();
   let source_inspection=crate::maps::inspect_map(source,None).unwrap();let mut origin=crate::project::Project::new("Preserved original mission radio source");origin.source=radio.source.clone();
   let selected=source_inspection.tags.iter().find(|tag|tag.class=="snd!"&&tag.id==radio.native_asset_imports[0].tag_id).expect("Exact original native sound ID");assert_eq!(selected.path,radio.native_asset_imports[0].tag_path);
   let extracted=crate::tag_exchange::extract_selected_tag(&origin,&source_inspection,&toolchain,managed,&uuid::Uuid::new_v4().to_string(),selected.id,cancel.clone(),|_|{}).unwrap();
   let binding=crate::native_asset_imports::prepare(&current,&origin,&source_inspection,&extracted,&toolchain,managed,&cue.import_id,selected.id,&cancel,|_|{}).unwrap();assert_eq!(binding.native_path,cue.sound_path);current.native_asset_imports.push(binding.clone());
   let filename=revision["filename"].as_str().unwrap();let content=revision["content"].as_str().unwrap();let parent_job=jobs.join(&baseline.id);let parent_tags=parent_job.join("tags");
   let attachment=crate::working_tags::ScriptAttachment{filename:filename.into(),content:content.into(),sha256:crate::hex_bytes(sha2::Sha256::digest(content.as_bytes())),replaces_sha256:Some(revision["replacesSha256"].as_str().unwrap().into())};
   let input=crate::working_tags::WorkingTagsInput{mission_hud:None,hud_readback_targets:vec![],scenario_squad_readback:None,encounter_append:None,script_attachment:Some(attachment),expected_encounter:None,compile_scripts:true,expected_tag_identity:Some(crate::working_tags::source_identity(&parent_tags,&cancel).unwrap()),bsp_audio:None,parent_build:baseline.clone(),tags_directory:parent_tags.clone(),scenario_path:map.scenario_path.clone(),scenario_type:0,tool:tools.join("invader-build.exe"),invader_info:tools.join("invader-info.exe")};
   let before=crate::working_tags::source_identity(&parent_tags,&cancel).unwrap();let source_hashes=crate::native_asset_imports::source_hashes(managed,&current).unwrap();
   let rebuilt=crate::working_tags::run(&current,&input,&jobs,&uuid::Uuid::new_v4().to_string(),cancel.clone(),|e|{if e.severity=="error"{eprintln!("{}: {}",e.phase,e.message);}}).unwrap();assert_eq!(rebuilt.status,"validated","{}",rebuilt.message);
   let output=rebuilt.output.as_ref().unwrap();let inspection=crate::maps::inspect_map(output,None).unwrap();crate::native_asset_imports::verify_compiled(&current,&inspection).unwrap();
   let tag=inspection.tags.iter().find(|tag|tag.class=="snd!"&&tag.path.replace('\\',"/")==binding.native_path).unwrap();let read=crate::audio::inspect_sound(output,&inspection.sha256,tag.id).unwrap();
   assert_eq!(audio.permutations.iter().map(|p|(&p.sha256,p.byte_length)).collect::<Vec<_>>(),read.permutations.iter().map(|p|(&p.sha256,p.byte_length)).collect::<Vec<_>>());
   assert_eq!(before,crate::working_tags::source_identity(&parent_tags,&cancel).unwrap());assert_eq!(source_hashes,crate::native_asset_imports::source_hashes(managed,&current).unwrap());assert_eq!(map.sha256,crate::maps::hash_file(&cache).unwrap());
   // A conflicting loose tag is preserved, and the previous validated output
   // must remain byte-identical when the next production transaction refuses it.
   let edited=parent_tags.join(format!("{}.sound",binding.native_path));std::fs::create_dir_all(edited.parent().unwrap()).unwrap();assert!(!edited.exists());std::fs::write(&edited,b"edited source must never be overwritten").unwrap();
   let mut bad=input.clone();bad.expected_tag_identity=Some(crate::working_tags::source_identity(&parent_tags,&cancel).unwrap());
   let refused=crate::working_tags::run(&current,&bad,&jobs,&uuid::Uuid::new_v4().to_string(),cancel.clone(),|_|{}).unwrap();assert_eq!(refused.status,"failed");assert!(refused.message.contains("edited tags were preserved"),"{}",refused.message);assert!(refused.output.is_none());
   assert_eq!(std::fs::read(&edited).unwrap(),b"edited source must never be overwritten");assert_eq!(inspection.sha256,crate::maps::hash_file(output).unwrap());
   eprintln!("Production recovered radio source/rebuild PASS: parent {} revised {} source {} sample hashes {} preserved; conflicting-tag refusal keeps previous-good map; no Windows/game acceptance",baseline.sha256.unwrap(),inspection.sha256,crate::hex_bytes(sha2::Sha256::digest(content.as_bytes())),read.permutations.len());
  }
  if let Some((pilot,crew_specs,routes,controller_sha,graph_inputs))=&controller{
   verify_compiled_append(pilot,&map).unwrap();for crew in crew_specs{verify_compiled_append(crew,&map).unwrap();}let actual=crate::maps::scenario_command_readback(&cache,&map).unwrap();for route in routes{assert!(actual.iter().any(|row|row==route));}
   for name in [format!("gs_{role}_pilot"),format!("forerunner_{role}_complete"),format!("gs_{role}_trip")]{assert_eq!(names.iter().filter(|value|**value==name).count(),1);}
   let extracted=root.join("independent-pilot");std::fs::create_dir(&extracted).unwrap();let mut args=vec!["-t".into(),extracted.to_string_lossy().into_owned()];for tag in graph_inputs.keys(){args.extend(["-s".into(),tag.clone()]);}let vehicle_tag=format!("{}.vehicle",snapshots[active].transport.tag_path);args.extend(["-s".into(),vehicle_tag.clone(),"-s".into(),tag.into()]);args.push(cache.to_string_lossy().into_owned());run(&tools.join("invader-extract.exe"),args);
   let extracted_fields=run(&editor,vec!["-t".into(),extracted.to_string_lossy().into_owned(),"-L".into(),tag.into()]);let config=mission_input.as_ref().map(|(_,_,v)|serde_json::from_str::<serde_json::Value>(v["transportSource"]["content"].as_str().unwrap().lines().nth(1).unwrap().strip_prefix("; configuration: ").unwrap()).unwrap()).unwrap();
   let mut compiled_choices=scenario_transport_choices(&extracted_fields).unwrap();compiled_choices.pilots=std::iter::once(pilot.name.clone()).chain(config.get("crew").and_then(serde_json::Value::as_array).into_iter().flatten().map(|member|member["group"].as_str().unwrap().into())).collect();for vehicle in &mut compiled_choices.vehicles{if vehicle.name==format!("extraction_{role}"){let listing=run(&editor,vec!["-t".into(),extracted.to_string_lossy().into_owned(),"-L".into(),vehicle_tag.clone()]);vehicle.pilot_seats=native_vehicle_pilot_seats(&listing).unwrap();vehicle.seats=native_vehicle_seats(&listing).unwrap();}}
   let graph_readback=pilot_bindings(&extracted_fields,&compiled_choices,|tag|Ok(run(&editor,vec!["-t".into(),extracted.to_string_lossy().into_owned(),"-L".into(),tag.into()])),|tag|graph_labels(&extracted,tag)).unwrap();let check=graph_readback.iter().find(|row|row.aircraft==format!("extraction_{role}")&&row.pilot==pilot.name).unwrap();assert!(check.issue.is_none(),"{check:?}");for(file,hash)in graph_inputs.values(){assert_eq!(*hash,crate::maps::hash_file(file).unwrap());}eprintln!("Independent compiled pilot actor/biped/animation readback PASS: {check:?}");
   if let Some((_,_,value))=&mission_input{let content=value["transportSource"]["content"].as_str().unwrap();let config:serde_json::Value=serde_json::from_str(content.lines().nth(1).unwrap().strip_prefix("; configuration: ").unwrap()).unwrap();for member in config.get("crew").and_then(serde_json::Value::as_array).into_iter().flatten(){let row=graph_readback.iter().find(|row|row.aircraft==format!("extraction_{role}")&&Some(row.pilot.as_str())==member["group"].as_str()).unwrap();assert!(row.crew_issue.is_none(),"{row:?}");assert!(row.crew_seats.iter().any(|seat|Some(seat.as_str())==member["seat"].as_str()));eprintln!("Independent compiled permanent crew actor/seat/animation readback PASS: {row:?}");}}
   eprintln!("Combined native mission/transport PASS: pilot={} initial={} normal=1 insane=1; outbound/return routes={}, startup/landing/recall/settlement controllerSHA={controller_sha}; no flight/gameplay acceptance",pilot.name,pilot.start_active,routes.len());
  }

  if let Some((binding,hud))=&mission{if let Some(index)=binding.missions.iter().position(|beat|beat.transport_insertion.is_some()){let mut wrong=binding.clone();let role=wrong.missions[index].transport_insertion.as_ref().unwrap();wrong.missions[index].transport_insertion=Some(if role=="pelican"{"spirit"}else{"pelican"}.into());assert!(crate::creative::verify_native_mission_with_hud(&wrong,&map,&cache,hud.as_ref().map(|hud|(hud.review.output_tag_path.as_str(),hud.messages.as_slice()))).unwrap_err().to_string().contains("delivery global"));eprintln!("Native insertion latch/helper and wrong-role refusal PASS");}if binding.missions.iter().any(|beat|beat.create_weapon_object.is_some()){
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
  if let Some(export)=std::env::var_os("SPARK_NATIVE_MAP_EXPORT"){
   let export=std::path::PathBuf::from(export);let owned=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_TEST_ROOT").unwrap()).canonicalize().unwrap();crate::reject_links(&export).unwrap();
   assert!(export.parent().unwrap().canonicalize().unwrap().starts_with(&owned));assert!(!export.exists());crate::native_staging::copy_file(&cache,&export,std::fs::metadata(&cache).unwrap().len(),Some(&map.sha256),&std::sync::atomic::AtomicBool::new(false)).unwrap();
   eprintln!("Exported exact ephemeral native cache to the same bounded QA owner: {}",map.sha256);
  }
  eprintln!("Native vehicle flight tag original/restored {original_vehicle_sha}; modified {modified_vehicle_sha}; all three compiled fields independently verified");
  eprintln!("Native append CE609 PASS: cache {}; revised scenario {source_sha}; original/restored {original_sha}; new transports {:?}; original AI/script identities preserved; reviewed pose edits verified separately; no flight/gameplay acceptance",map.sha256,snapshots);
 }
}
