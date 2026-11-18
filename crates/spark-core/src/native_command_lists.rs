//! Standard native command-list source editing; uses the existing reviewed writer.
use super::*;
pub const COMMAND_ATOMS:[&str;28]=["pause","go_to","go_to_and_face","move_in_direction","look","animation_mode","crouch","shoot","grenade","vehicle","running_jump","targeted_jump","script","animate","recording","action","vocalize","targeting","initiative","wait","loop","die","move_immediate","look_random","look_player","look_object","set_radius","teleport"];
const FLAGS:[&str;6]=["allow_initiative","allow_targeting","disable_looking","disable_communication","disable_falling_damage","manual_bsp_index"];
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct NativeCommand {pub atom:String,pub modifier:i16,pub parameters:[f32;2],pub point1:i16,pub point2:i16,pub animation:i16,pub script:i16,pub recording:i16,pub command:i16,pub object_name:i16}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct NativeCommandList {pub index:u16,pub name:String,pub flags:[bool;6],pub bsp:i16,pub commands:Vec<NativeCommand>,pub points:Vec<[f32;3]>}
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct NativeCommandSource {pub lists:Vec<NativeCommandList>,pub atoms:Vec<String>,pub reference_counts:[usize;5]}
impl NativeCommandList {
 pub fn validate(&self)->Result<()> {
  if self.index>=256||self.name.len()>32||self.name.chars().any(char::is_control)||self.commands.len()>64||self.points.len()>64||self.bsp< -1||self.points.iter().flatten().any(|v|!v.is_finite()||v.abs()>1e6){return invalid("Invalid native command-list identity, capacity or points");}
  let reference=|v:i16,n:usize|v== -1||(v>=0&&(v as usize)<n);
  for c in &self.commands{if !COMMAND_ATOMS.contains(&c.atom.as_str())||c.parameters.iter().any(|v|!v.is_finite()||v.abs()>1e6)||!reference(c.point1,self.points.len())||!reference(c.point2,self.points.len())||!reference(c.command,self.commands.len())||[c.animation,c.script,c.recording,c.object_name].iter().any(|v|*v< -1){return invalid("Native command has an unknown action, invalid parameter or missing local reference");}}
  Ok(())
 }
 /// Finite route actions used by generated transport and escort scripts.
 pub(crate) fn movement_destinations(&self) -> Result<Vec<(usize, usize)>> {
    self.validate()?;
    let mut destinations = Vec::new();
    for (index, command) in self.commands.iter().enumerate() {
        match command.atom.as_str() {
            "go_to" if [0, 1].contains(&command.modifier) && command.point1 >= 0 => {
                destinations.push((index, command.point1 as usize));
            }
            "go_to_and_face" if command.modifier == 0 && command.point1 >= 0 && command.point2 >= 0 => {
                destinations.push((index, command.point1 as usize));
            }
            "set_radius" if command.parameters[0] > 0. => {}
            "pause" if command.parameters[0] >= 0. => {}
            _ => return invalid(format!(
                "Route {} action {} ({}) is outside the generated movement profile. Use go-to (stop/keep-moving), go-to-and-face (stop with Point 2), positive set-radius or pause. Advanced source remains available manually.",
                self.name, index, command.atom
            )),
        }
    }
    if destinations.is_empty() {
        return invalid(format!("Route {} has no physical go-to actions", self.name));
    }
    Ok(destinations)
 }
 pub fn close(&self,b:&Self)->bool{let scalar=|a:f32,b:f32|(a-b).abs()<=1e-4;self.index==b.index&&self.name==b.name&&self.flags==b.flags&&self.bsp==b.bsp&&self.points.len()==b.points.len()&&self.points.iter().zip(&b.points).all(|(a,b)|positions_close(*a,*b))&&self.commands.len()==b.commands.len()&&self.commands.iter().zip(&b.commands).all(|(a,b)|a.atom==b.atom&&a.modifier==b.modifier&&a.parameters.iter().zip(b.parameters).all(|(a,b)|scalar(*a,b))&&a.point1==b.point1&&a.point2==b.point2&&a.animation==b.animation&&a.script==b.script&&a.recording==b.recording&&a.command==b.command&&a.object_name==b.object_name)}
}
fn integer(fields:&str,key:&str)->Result<i16>{let n=number(fields,key)?;if n.fract()!=0.||n<f64::from(i16::MIN)||n>f64::from(i16::MAX){return invalid("Native command modifier is not a signed short");}Ok(n as i16)}
pub fn source(fields:&str)->Result<NativeCommandSource>{
 let lists=inventory(fields)?.into_iter().map(|r|r.0).collect();
 let names=["ai_animation_references","ai_script_references","ai_recording_references","object_names","structure_bsps"];
 let mut reference_counts=[0;5];for(i,n)in names.iter().enumerate(){reference_counts[i]=array_listing(fields,n)?.count;if reference_counts[i]>4096{return invalid("Native command reference inventory exceeds bound");}}
 Ok(NativeCommandSource{lists,atoms:COMMAND_ATOMS.map(str::to_owned).to_vec(),reference_counts})
}
fn inventory(fields:&str)->Result<Vec<(NativeCommandList,Vec<usize>)>>{
 let block=array_listing(fields,"command_lists")?;if block.count>256{return invalid("Native command-list inventory exceeds256entries");}let mut result=vec![];let mut at=block.start+1;
 for(index,item)in array_items(&block,"command_lists")?.iter().enumerate(){let root=direct_struct_fields(item)?;let mut allowed=vec![];let name=native_name(&root)?;let(_,children)=native_children(&root,"flags","bitmask",6)?;let mut flags=[false;6];
  for(i,(line,text))in children.iter().enumerate(){let prefix=format!("{} (",FLAGS[i]);let value=text.strip_prefix(&prefix).and_then(|s|s.split_once(')')).map(|s|s.0).ok_or_else(||crate::SparkError::Invalid("Unknown native command flags".into()))?;flags[i]=match value{"0"=>false,"1"=>true,_=>return invalid("Invalid native command flag")};allowed.push(at+1+line);}
  let bsp=native_index(&root,"manual_bsp_index")?;allowed.push(at+1+root.lines().position(|s|s.starts_with("manual_bsp_index (")).ok_or_else(||crate::SparkError::Invalid("Missing native BSP field".into()))?);
  let commands=array_listing(&root,"commands")?;if commands.count>64{return invalid("Native command list exceeds64commands");}let mut command_at=at+2+commands.start;let mut actions=vec![];
  for item in array_items(&commands,"commands")?{let command=direct_struct_fields(item)?;let(_,choices)=native_children(&command,"atom_type","enum",28)?;let mut atom=None;for(i,(line,text))in choices.iter().enumerate(){let parts=text.split_whitespace().collect::<Vec<_>>();if parts!=[COMMAND_ATOMS[i],"enum","value"]&&parts!=[COMMAND_ATOMS[i],"(*)","enum","value"]{return invalid("Unknown native command action inventory");}if parts.len()==4&&atom.replace(COMMAND_ATOMS[i].to_owned()).is_some(){return invalid("Ambiguous native command action");}allowed.push(command_at+1+line);}
   for key in ["atom_modifier","parameter1","parameter2","point_1","point_2","animation","script","recording","command","object_name"]{allowed.push(command_at+1+command.lines().position(|line|line.starts_with(&format!("{key} ("))).ok_or_else(||crate::SparkError::Invalid("Native command scalar unavailable".into()))?);}
   actions.push(NativeCommand{atom:atom.ok_or_else(||crate::SparkError::Invalid("Native command action missing".into()))?,modifier:integer(&command,"atom_modifier")?,parameters:[number(&command,"parameter1")? as f32,number(&command,"parameter2")? as f32],point1:native_index(&command,"point_1")?,point2:native_index(&command,"point_2")?,animation:native_index(&command,"animation")?,script:native_index(&command,"script")?,recording:native_index(&command,"recording")?,command:native_index(&command,"command")?,object_name:native_index(&command,"object_name")?});command_at+=item.len();
  }
  let points=array_listing(&root,"points")?;if points.count>64{return invalid("Native command list exceeds64points");}let mut point_at=at+2+points.start;let mut positions=vec![];for item in array_items(&points,"points")?{let point=direct_struct_fields(item)?;let(position,line)=native_vector(&point,"position")?;positions.push(position);allowed.push(point_at+1+line);point_at+=item.len();}
  let row=NativeCommandList{index:index as u16,name,flags,bsp,commands:actions,points:positions};row.validate()?;result.push((row,allowed));at+=item.len();
 }Ok(result)
}
pub fn arguments(tags:&Path,tag:&str,before:&str,list:&NativeCommandList)->Result<Vec<String>>{
 list.validate()?;let current=source(before)?;let old=current.lists.get(list.index as usize).ok_or_else(||crate::SparkError::Invalid("Native command-list index missing".into()))?;
 if old.name!=list.name||old.commands.len()>list.commands.len()||old.points.len()>list.points.len(){return invalid("Preserve command-list name and every existing command/point index; only tail additions are supported");}if old.close(list){return invalid("Native command list already matches");}
 for c in &list.commands{for(v,n)in [c.animation,c.script,c.recording,c.object_name].into_iter().zip(current.reference_counts){if v>=0&&v as usize>=n{return invalid("Native command references a missing scenario binding");}}}
 if list.flags[5]&&(list.bsp<0||list.bsp as usize>=current.reference_counts[4]){return invalid("Manual command BSP needs an existing scenario BSP");}
 let prefix=format!("command_lists[{}]",list.index);let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned()];
 for (name,old_count,new_count) in [("commands",old.commands.len(),list.commands.len()),("points",old.points.len(),list.points.len())] {if new_count>old_count {args.extend(["-I".into(),format!("{prefix}.{name}"),(new_count-old_count).to_string(),"end".into()]);}}
 let mut set=|key:String,value:String|args.extend(["-S".into(),key,value]);
 for(i,key)in FLAGS.iter().enumerate(){if old.flags[i]!=list.flags[i]{set(format!("{prefix}.flags.{key}"),u8::from(list.flags[i]).to_string());}}if old.bsp!=list.bsp{set(format!("{prefix}.manual_bsp_index"),list.bsp.to_string());}
 for(i,new)in list.commands.iter().enumerate(){let old=old.commands.get(i);let fields=|c:&NativeCommand|[c.atom.clone(),c.modifier.to_string(),c.parameters[0].to_string(),c.parameters[1].to_string(),c.point1.to_string(),c.point2.to_string(),c.animation.to_string(),c.script.to_string(),c.recording.to_string(),c.command.to_string(),c.object_name.to_string()];for((a,b),key)in old.map(fields).map(|values|values.map(Some)).unwrap_or_else(||std::array::from_fn(|_|None)).into_iter().zip(fields(new)).zip(["atom_type","atom_modifier","parameter1","parameter2","point_1","point_2","animation","script","recording","command","object_name"]){if a.as_ref()!=Some(&b){set(format!("{prefix}.commands[{i}].{key}"),b);}}}
 for(i,b)in list.points.iter().enumerate(){if !old.points.get(i).is_some_and(|a|positions_close(*a,*b)){set(format!("{prefix}.points[{i}].position"),b.map(|n|n.to_string()).join(","));}}args.push(tag.into());Ok(args)
}

/// Append one explicitly reviewed route. Existing indices and source bodies stay stable.
pub fn append_arguments(tags:&Path,tag:&str,before:&str,list:&NativeCommandList)->Result<Vec<String>>{
 list.validate()?;let current=source(before)?;
 if usize::from(list.index)!=current.lists.len()||current.lists.len()>=256{return invalid("New command route must append at the current native inventory end; refresh changed source");}
 if list.name.is_empty()||list.name.len()>31||!list.name.bytes().enumerate().all(|(i,b)|b.is_ascii_alphanumeric()||b==b'_'&&i>0)||!list.name.as_bytes()[0].is_ascii_alphabetic()||current.lists.iter().any(|row|row.name.eq_ignore_ascii_case(&list.name)){return invalid("New route needs a unique1–31character native identifier, starting with a letter");}
 if list.points.is_empty()||list.commands.is_empty(){return invalid("New route needs at least one world point and command");}
 for c in &list.commands{for(v,n)in [c.animation,c.script,c.recording,c.object_name].into_iter().zip(current.reference_counts){if v>=0&&v as usize>=n{return invalid("New route references missing native scenario data");}}}
 if list.flags[5]&&(list.bsp<0||list.bsp as usize>=current.reference_counts[4]){return invalid("Manual route BSP must exist; it does not establish physical clearance");}
 let prefix=format!("command_lists[{}]",list.index);let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned(),"-I".into(),"command_lists".into(),"1".into(),"end".into(),"-I".into(),format!("{prefix}.commands"),list.commands.len().to_string(),"end".into(),"-I".into(),format!("{prefix}.points"),list.points.len().to_string(),"end".into()];
 let mut set=|key:String,value:String|args.extend(["-S".into(),key,value]);set(format!("{prefix}.name"),list.name.clone());
 for(i,flag)in FLAGS.iter().enumerate(){set(format!("{prefix}.flags.{flag}"),u8::from(list.flags[i]).to_string());}set(format!("{prefix}.manual_bsp_index"),list.bsp.to_string());
 for(i,c)in list.commands.iter().enumerate(){for(key,value)in ["atom_type","atom_modifier","parameter1","parameter2","point_1","point_2","animation","script","recording","command","object_name"].into_iter().zip([c.atom.clone(),c.modifier.to_string(),c.parameters[0].to_string(),c.parameters[1].to_string(),c.point1.to_string(),c.point2.to_string(),c.animation.to_string(),c.script.to_string(),c.recording.to_string(),c.command.to_string(),c.object_name.to_string()]){set(format!("{prefix}.commands[{i}].{key}"),value);}}
 for(i,p)in list.points.iter().enumerate(){set(format!("{prefix}.points[{i}].position"),p.map(|n|n.to_string()).join(","));}args.push(tag.into());Ok(args)
}
pub fn reviewed_append(before:&str,after:&str,list:&NativeCommandList)->Result<Vec<FieldDifference>>{
 // Recheck the complete request and compare all unrelated native fields verbatim.
 append_arguments(Path::new("tags"),"review.scenario",before,list)?;
 let old=array_listing(before,"command_lists")?;let new=array_listing(after,"command_lists")?;let old_items=array_items(&old,"command_lists")?;let new_items=array_items(&new,"command_lists")?;
 let a=before.lines().collect::<Vec<_>>();let b=after.lines().collect::<Vec<_>>();
 if new.count!=old.count+1||a[..old.start]!=b[..new.start]||a[old.end..]!=b[new.end..]||old_items.iter().zip(&new_items).any(|(a,b)|a!=b){return invalid("Route append changed original list indices/data or unrelated scenario fields");}
 let actual=source(after)?;if !actual.lists.last().is_some_and(|row|row.close(list)){return invalid("New native route differs from the reviewed commands/points/references");}
 Ok(vec![FieldDifference{before:format!("{} native command lists; no list at index{}",old.count,list.index),after:format!("New route {} at index{}: {} commands, {} points; existing lists/AI bindings preserved",list.name,list.index,list.commands.len(),list.points.len())}])
}
/// Compare the original layout after removing only explicitly admitted tails.
/// Normalize Invader tree branches; unknown fields and all existing indices stay.
fn retained_layout(fields:&str,index:usize,commands:usize,points:usize)->Result<String>{
 let block=array_listing(fields,"command_lists")?;
 let mut items=array_items(&block,"command_lists")?.into_iter().map(|item|item.to_vec()).collect::<Vec<_>>();
 let selected=items.get(index).ok_or_else(||crate::SparkError::Invalid("Command route missing during preservation review".into()))?;
 let mut root=direct_struct_fields(selected)?;
 for (name,count) in [("commands",commands),("points",points)] {
  let array=array_listing(&root,name)?;
  if array.count<count{return invalid("Command review removed existing indices");}
  let entries=array_items(&array,name)?;
  let replacement=std::iter::once(format!("{name}[{count}] array")).chain(entries.iter().take(count).flat_map(|entry|entry.iter().cloned())).collect::<Vec<_>>();
  let mut lines=root.lines().map(str::to_owned).collect::<Vec<_>>();lines.splice(array.start..array.end,replacement);root=lines.join("\n");
 }
 items[index]=std::iter::once(format!("    command_lists[{index}] struct")).chain(root.lines().map(|line|format!("        {line}"))).collect();
 let mut lines=fields.lines().map(str::to_owned).collect::<Vec<_>>();
 lines.splice(block.start..block.end,std::iter::once(format!("command_lists[{}] array",block.count)).chain(items.into_iter().flatten()));
 Ok(lines.join("\n"))
}
pub fn reviewed(before:&str,after:&str,list:&NativeCommandList)->Result<Vec<FieldDifference>>{
 arguments(Path::new("tags"),"review.scenario",before,list)?;
 let original=source(before)?.lists.get(list.index as usize).cloned().ok_or_else(||crate::SparkError::Invalid("Command list missing".into()))?;
 if original.commands.len()!=list.commands.len()||original.points.len()!=list.points.len(){
  let actual=source(after)?;if !actual.lists.get(list.index as usize).is_some_and(|value|value.close(list)){return invalid("Extended native route differs from reviewed commands/points/references");}
  let retained_before=retained_layout(before,list.index as usize,original.commands.len(),original.points.len())?;
  let retained_after=retained_layout(after,list.index as usize,original.commands.len(),original.points.len())?;
  let old=inventory(&retained_before)?;let allowed=&old[list.index as usize].1;
  let a=retained_before.lines().collect::<Vec<_>>();let b=retained_after.lines().collect::<Vec<_>>();
  if a.len()!=b.len()||a.iter().zip(&b).enumerate().any(|(i,(a,b))|a!=b&&!allowed.contains(&i)){return invalid("Route extension changed unrelated fields or existing native structure");}
  let mut differences=a.iter().zip(&b).filter(|(a,b)|a!=b).map(|(a,b)|FieldDifference{before:(*a).into(),after:(*b).into()}).collect::<Vec<_>>();
  differences.push(FieldDifference{before:format!("{} commands / {} points",original.commands.len(),original.points.len()),after:format!("{} commands / {} points; existing indices preserved",list.commands.len(),list.points.len())});return Ok(differences);
 }
 let old=inventory(before)?;let new=inventory(after)?;let(a,allowed)=old.get(list.index as usize).ok_or_else(||crate::SparkError::Invalid("Command list missing".into()))?;let(b,new_allowed)=new.get(list.index as usize).ok_or_else(||crate::SparkError::Invalid("Revised command list missing".into()))?;
 if old.len()!=new.len()||a.name!=list.name||!b.close(list)||allowed!=new_allowed{return invalid("Command-list source identity/structure or requested values changed");}let a=before.lines().collect::<Vec<_>>();let b=after.lines().collect::<Vec<_>>();if a.len()!=b.len(){return invalid("Command edit changed native structure");}let mut differences=vec![];for(i,(a,b))in a.iter().zip(b).enumerate(){if *a!=b{if !allowed.contains(&i){return invalid("Command edit changed unrelated scenario fields");}differences.push(FieldDifference{before:(*a).into(),after:b.into()});}}if differences.is_empty(){return invalid("Command edit changed no fields");}Ok(differences)
}

#[cfg(test)]
mod tests{
 use super::*;
 fn fixture()->String{
  let mut text=String::from("command_lists[1] array\n    command_lists[0] struct\n        name (route) string\n        flags bitmask\n");for f in FLAGS{text+=&format!("            {f} (0) bitfield\n");}text+="        manual_bsp_index (65535) index\n        commands[1] array\n            commands[0] struct\n                atom_type enum\n";for(i,a)in COMMAND_ATOMS.iter().enumerate(){text+=&format!("                    {a}{} enum value\n",if i==0{" (*)"}else{""});}for(k,v)in [("atom_modifier","0"),("parameter1","0"),("parameter2","0"),("point_1","65535"),("point_2","65535"),("animation","65535"),("script","65535"),("recording","65535"),("command","65535"),("object_name","65535")]{text+=&format!("                {k} ({v}) number\n");}text+="        points[1] array\n            points[0] struct\n                position (1,2,3) point3d\nai_animation_references[0] array\nai_script_references[0] array\nai_recording_references[0] array\nobject_names[0] array\nstructure_bsps[0] array\n";text
 }
 #[test]fn existing_commands_preserve_structure_and_reject_missing_references_or_unrelated_edits(){let before=fixture();let original=source(&before).unwrap().lists[0].clone();let mut list=original.clone();list.commands[0].parameters[0]=1.25;list.points[0]=[4.,5.,6.];let args=arguments(Path::new("tags"),"level.scenario",&before,&list).unwrap();assert_eq!(args.iter().filter(|a|a.as_str()=="-S").count(),2);let after=before.replace("parameter1 (0)","parameter1 (1.25)").replace("position (1,2,3)","position (4,5,6)");assert_eq!(reviewed(&before,&after,&list).unwrap().len(),2);assert!(reviewed(&before,&after.replace("name (route)","name (other)"),&list).is_err());let mut bad=list.clone();bad.commands[0].script=0;assert!(arguments(Path::new("tags"),"level.scenario",&before,&bad).is_err());bad=list.clone();bad.commands[0].point1=1;assert!(bad.validate().is_err());bad=list.clone();bad.commands.clear();assert!(arguments(Path::new("tags"),"level.scenario",&before,&bad).is_err());bad=list;bad.points[0][0]=f32::NAN;assert!(bad.validate().is_err());assert!(arguments(Path::new("tags"),"level.scenario",&before,&original).is_err());}

 #[test]fn route_extensions_keep_old_indices_and_reject_unrelated_or_unknown_field_changes(){
  let before=fixture().replace("                position (1,2,3) point3d","                position (1,2,3) point3d\n                surface_index (65535) index");
  let old=source(&before).unwrap().lists[0].clone();let mut list=old.clone();list.commands.push(NativeCommand{atom:"go_to".into(),modifier:1,parameters:[0.,0.],point1:1,point2:-1,animation:-1,script:-1,recording:-1,command:-1,object_name:-1});list.points.push([4.,5.,6.]);
  let args=arguments(Path::new("tags"),"level.scenario",&before,&list).unwrap();assert_eq!(args.iter().filter(|a|a.as_str()=="-I").count(),2);
  let command_start=before.find("            commands[0] struct").unwrap();let command_end=before.find("        points[1] array").unwrap();
  let added=before[command_start..command_end].replace("commands[0]","commands[1]").replace("pause (*)","pause").replace("go_to enum","go_to (*) enum").replace("atom_modifier (0)","atom_modifier (1)").replace("point_1 (65535)","point_1 (1)");
  let after=before.replace("commands[1] array","commands[2] array").replace("        points[1] array",&format!("{added}        points[2] array")).replace("ai_animation_references[0] array","            points[1] struct\n                position (4,5,6) point3d\n                surface_index (65535) index\nai_animation_references[0] array");
  assert!(source(&after).unwrap().lists[0].close(&list));assert_eq!(reviewed(&before,&after,&list).unwrap().len(),1);
  for changed in [after.replacen("surface_index (65535)","surface_index (1)",1),after.replace("name (route)","name (other)"),after.replace("ai_script_references[0]","ai_script_references[1]"),after.replace("parameter1 (0)","parameter1 (1)")]{assert!(reviewed(&before,&changed,&list).is_err());}
  list.commands[0].command=1;let chained=after.replacen("command (65535)","command (1)",1);assert!(reviewed(&before,&chained,&list).is_ok());
  let mut bad=list.clone();bad.points.remove(0);assert!(arguments(Path::new("tags"),"level.scenario",&before,&bad).is_err());bad=list.clone();bad.commands[0].script=0;assert!(arguments(Path::new("tags"),"level.scenario",&before,&bad).is_err());
 }

 #[test]fn appended_routes_preserve_original_inventory_and_legacy_operation_shape(){
  let before=fixture();let old=source(&before).unwrap().lists[0].clone();let mut list=old.clone();list.index=1;list.name="pelican_approach".into();list.points[0]=[4.,5.,6.];
  let args=append_arguments(Path::new("tags"),"level.scenario",&before,&list).unwrap();assert_eq!(args.iter().filter(|v|v.as_str()=="-I").count(),3);
  let array=array_listing(&before,"command_lists").unwrap();let added=array.body.join("\n").replacen("command_lists[0]","command_lists[1]",1).replace("name (route)","name (pelican_approach)").replace("position (1,2,3)","position (4,5,6)");let lines=before.lines().collect::<Vec<_>>();
  let after=format!("{}command_lists[2] array\n{}\n{}\n{}\n",lines[..array.start].join("\n"),array.body.join("\n"),added,lines[array.end..].join("\n"));
  assert_eq!(reviewed_append(&before,&after,&list).unwrap().len(),1);assert!(source(&after).unwrap().lists[0].close(&old));
  for wrong in [after.replace("name (route)","name (changed)"),after.replace("object_names[0]","object_names[1]"),after.replace("position (4,5,6)","position (7,8,9)")]{assert!(reviewed_append(&before,&wrong,&list).is_err());}
  let op=Operation::CommandList{list:list.clone(),append:true,source_sha256:"a".repeat(64)};assert!(serde_json::to_value(&op).unwrap()["append"].as_bool().unwrap());let legacy=Operation::CommandList{list:old,append:false,source_sha256:"a".repeat(64)};let value=serde_json::to_value(&legacy).unwrap();assert!(value.get("append").is_none());assert_eq!(serde_json::to_value(serde_json::from_value::<Operation>(value.clone()).unwrap()).unwrap(),value);
  let mut largest=list.clone();largest.points=vec![[1.,2.,3.];64];largest.commands=vec![largest.commands[0].clone();64];let max_op=Operation::CommandList{list:largest.clone(),append:true,source_sha256:"a".repeat(64)};let batches=max_op.argument_batches(append_arguments(Path::new("tags"),"level.scenario",&before,&largest).unwrap(),false).unwrap();assert!(batches.len()>1);assert!(batches.iter().all(|batch|batch.first().unwrap()=="-t"&&batch.last().unwrap()=="level.scenario"));largest.points.push([0.;3]);assert!(append_arguments(Path::new("tags"),"level.scenario",&before,&largest).is_err());
  for fault in 0..6{let mut bad=list.clone();match fault{0=>bad.index=0,1=>bad.name="ROUTE".into(),2=>bad.points.clear(),3=>bad.commands[0].script=0,4=>{bad.flags[5]=true;bad.bsp=0;},_=>bad.name="bad name".into()}assert!(append_arguments(Path::new("tags"),"level.scenario",&before,&bad).is_err(),"append fault {fault}");}
 }

 #[test]#[ignore="Requires explicitly owned output and installed Invader; optional source is read-only"]
 fn installed_appended_route_roundtrips_native_fields_and_compiler_symbols(){
  use std::{fs,process::Command};let root=std::path::PathBuf::from(std::env::var_os("SPARK_GENERATED_ROOT").unwrap()).canonicalize().unwrap();let temp=tempfile::tempdir_in(&root).unwrap();let tags=temp.path().join("tags");fs::create_dir(&tags).unwrap();let tool=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_INVADER_EDIT").unwrap());let tool_sha=crate::maps::hash_file(&tool).unwrap();
  let run=|args:Vec<String>|{let out=Command::new(&tool).args(args).current_dir(temp.path()).output().unwrap();assert!(out.status.success(),"Native route writer: {}",String::from_utf8_lossy(&out.stderr));String::from_utf8(out.stdout).unwrap()};
  let original=std::env::var_os("SPARK_NATIVE_ROUTE_SCENARIO").map(std::path::PathBuf::from);let original_sha=original.as_ref().map(|p|crate::maps::hash_file(p).unwrap());let mut evidence=vec![];
  for supplied in [false,true]{if supplied&&original.is_none(){continue;}let name=if supplied{"owned_original"}else{"fresh"};let tag=format!("{name}.scenario");let file=tags.join(&tag);
   if let Some(source)=original.as_ref().filter(|_|supplied){assert!(!source.canonicalize().unwrap().starts_with(&root));fs::copy(source,&file).unwrap();}else{run(vec!["-t".into(),tags.to_string_lossy().into_owned(),"-N".into(),"-I".into(),"encounters".into(),"1".into(),"end".into(),"-S".into(),"encounters[0].name".into(),"pilot".into(),tag.clone()]);}
   let initial_bytes=fs::read(&file).unwrap();let initial_sha=crate::maps::hash_file(&file).unwrap();
   for phase in 0..2 {let before=run(vec!["-t".into(),tags.to_string_lossy().into_owned(),"-L".into(),tag.clone()]);let current=source(&before).unwrap();let new=NativeCommandList{index:current.lists.len() as u16,name:format!("pilot_route_{phase}"),flags:[false,false,false,false,false,supplied],bsp:if supplied{0}else{-1},points:vec![[1.,2.,3.],[4.,5.,6.]],commands:vec![NativeCommand{atom:"go_to".into(),modifier:0,parameters:[0.,0.],point1:0,point2:-1,animation:-1,script:-1,recording:-1,command:-1,object_name:-1},NativeCommand{atom:"go_to".into(),modifier:0,parameters:[0.,0.],point1:1,point2:-1,animation:-1,script:-1,recording:-1,command:-1,object_name:-1}]};
    let operation=Operation::CommandList{list:new.clone(),append:true,source_sha256:crate::maps::hash_file(&file).unwrap()};let args=operation.arguments_with_fields(&tags,"scnr",&tag,&before).unwrap();for batch in operation.argument_batches(args,false).unwrap(){run(batch);}
    let after=run(vec!["-t".into(),tags.to_string_lossy().into_owned(),"-L".into(),tag.clone()]);reviewed_difference(&before,&after,&operation).unwrap();let actual=source(&after).unwrap();assert_eq!(actual.lists.len(),current.lists.len()+1);assert!(actual.lists[..current.lists.len()].iter().zip(&current.lists).all(|(a,b)|a.close(b)));assert!(actual.lists.last().unwrap().close(&new));let mut read=String::new();for batch in operation.argument_batches(operation.readback_arguments(&tags,"scnr",&tag,&before).unwrap().unwrap(),true).unwrap(){read+=&run(batch);}operation.verify_readback(&tags,"scnr",&tag,&before,&read).unwrap();
    let mut extended=new.clone();extended.points.push([7.,8.,9.]);let mut command=extended.commands.last().unwrap().clone();command.point1=2;extended.commands.push(command);extended.commands[0].modifier=1;
    let edit=Operation::CommandList{list:extended.clone(),append:false,source_sha256:crate::maps::hash_file(&file).unwrap()};for batch in edit.argument_batches(edit.arguments_with_fields(&tags,"scnr",&tag,&after).unwrap(),false).unwrap(){run(batch);}
    let updated=run(vec!["-t".into(),tags.to_string_lossy().into_owned(),"-L".into(),tag.clone()]);reviewed_difference(&after,&updated,&edit).unwrap();let mut read=String::new();for batch in edit.argument_batches(edit.readback_arguments(&tags,"scnr",&tag,&after).unwrap().unwrap(),true).unwrap(){read+=&run(batch);}edit.verify_readback(&tags,"scnr",&tag,&after,&read).unwrap();
    let actual=source(&updated).unwrap();assert!(actual.lists.last().unwrap().close(&extended));assert!(actual.lists[..current.lists.len()].iter().zip(&current.lists).all(|(a,b)|a.close(b)));
    evidence.push(serde_json::json!({"source":name,"index":extended.index,"name":extended.name,"points":extended.points,"scenarioSha256":crate::maps::hash_file(&file).unwrap(),"unchangedPreviousLists":current.lists.len(),"extendedAcceptedRoute":true}));
   }
   if supplied {if let Some(shared)=std::env::var_os("SPARK_NATIVE_ROUTE_SHARED_TAGS"){
    let shared=std::path::PathBuf::from(shared).canonicalize().unwrap();assert!(!shared.starts_with(&root));crate::reject_links(&shared).unwrap();
    let builder=tool.parent().unwrap().join("invader-build.exe");let builder_sha=crate::maps::hash_file(&builder).unwrap();let maps=temp.path().join("maps");fs::create_dir(&maps).unwrap();
    let cancel=std::sync::atomic::AtomicBool::new(false);let on_event=|event:crate::build::JobEvent|{if event.severity=="warning"||event.severity=="error"{eprintln!("{}: {}",event.phase,event.message);}};
    let runner=crate::build::Runner{id:"route-extension",project:"owned-route-fixture",cancel:&cancel,event:&on_event};
    runner.run(&builder,&["-t".into(),tags.to_string_lossy().into_owned(),"-t".into(),shared.to_string_lossy().into_owned(),"-m".into(),maps.to_string_lossy().into_owned(),"-g".into(),"gbx-custom".into(),name.into()],temp.path(),"compile-ce",90).unwrap();
    let cache=maps.join(format!("{name}.map"));let map=crate::maps::inspect_map(&cache,None).unwrap();assert_eq!(map.header.version,609);assert_eq!(map.header.scenario_type,0);
    let expected=source(&run(vec!["-t".into(),tags.to_string_lossy().into_owned(),"-L".into(),tag.clone()])).unwrap().lists;let readback=crate::maps::scenario_command_readback(&cache,&map).unwrap();assert_eq!(expected.len(),readback.len());assert!(expected.iter().zip(&readback).all(|(a,b)|a.close(b)));
    assert_eq!(builder_sha,crate::maps::hash_file(&builder).unwrap());println!("NATIVE_ROUTE_CACHE {}",serde_json::json!({"sha256":map.sha256,"bytes":fs::metadata(&cache).unwrap().len(),"cacheVersion":609,"scenarioType":0,"commandLists":readback.len(),"gameplayVerified":false}));
   }}
   if !supplied{let data=temp.path().join("data/scripts");fs::create_dir_all(&data).unwrap();fs::write(data.join("pilot.hsc"),"(script static void pilot_launch (ai_command_list pilot pilot_route_0))\n").unwrap();let compiler=tool.parent().unwrap().join("invader-script.exe");let result=Command::new(compiler).args(["-t"]).arg(&tags).arg("-d").arg(temp.path().join("data")).args(["-g","gbx-custom","-E",name]).current_dir(temp.path()).output().unwrap();assert!(result.status.success(),"Native route HSC: {}",String::from_utf8_lossy(&result.stderr));assert!(run(vec!["-t".into(),tags.to_string_lossy().into_owned(),"-L".into(),tag.clone()]).contains("pilot_launch"));}
   fs::write(&file,&initial_bytes).unwrap();assert_eq!(initial_sha,crate::maps::hash_file(&file).unwrap());
  }
  assert_eq!(original_sha,original.as_ref().map(|p|crate::maps::hash_file(p).unwrap()));assert_eq!(tool_sha,crate::maps::hash_file(&tool).unwrap());println!("NATIVE_ROUTE_EVIDENCE {}",serde_json::to_string(&evidence).unwrap());
 }
 #[test]#[ignore="Requires installed Invader and an explicitly owned disposable fixture"]
 fn installed_command_actions_parameters_and_waypoints_roundtrip(){
  use std::{fs,process::Command};let root=std::path::PathBuf::from(std::env::var_os("SPARK_GENERATED_ROOT").unwrap()).canonicalize().unwrap();let tags=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_COMMAND_TAGS").unwrap()).canonicalize().unwrap();assert!(tags.starts_with(&root));let exe=std::env::var_os("SPARK_NATIVE_INVADER_EDIT").unwrap();let file=tags.join("be_native.scenario");crate::reject_links(&file).unwrap();let bytes=fs::read(&file).unwrap();
  let run=|args:Vec<String>|{let output=Command::new(&exe).args(args).output().unwrap();assert!(output.status.success(),"{}",String::from_utf8_lossy(&output.stderr));String::from_utf8(output.stdout).unwrap()};let fields=||run(vec!["-t".into(),tags.to_string_lossy().into_owned(),"-L".into(),"be_native.scenario".into()]);let before=fields();let mut list=source(&before).unwrap().lists.into_iter().find(|row|!row.commands.is_empty()&&!row.points.is_empty()).expect("fixture needs an existing route with commands and points");list.commands[0].atom="go_to".into();list.commands[0].point1=0;list.commands[0].parameters=[1.25,0.5];list.flags[0]=true;list.points[0]=[4.,5.,6.];let op=Operation::CommandList{list:list.clone(),append:false,source_sha256:crate::maps::hash_file(&file).unwrap()};for batch in op.argument_batches(op.arguments_with_fields(&tags,"scnr","be_native.scenario",&before).unwrap(),false).unwrap(){run(batch);}let after=fields();reviewed_difference(&before,&after,&op).unwrap();let scalar=run(op.readback_arguments(&tags,"scnr","be_native.scenario",&before).unwrap().unwrap());op.verify_readback(&tags,"scnr","be_native.scenario",&before,&scalar).unwrap();assert!(source(&after).unwrap().lists[list.index as usize].close(&list));
  if let Some(builder)=std::env::var_os("SPARK_NATIVE_COMMAND_BUILD") {
   let shared=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_COMMAND_SHARED_TAGS").unwrap()).canonicalize().unwrap();assert!(!shared.starts_with(&root));
   let output_dir=tempfile::tempdir_in(&root).unwrap();let output=output_dir.path();
   let compiled=Command::new(builder).args(["-t"]).arg(&tags).args(["-t"]).arg(&shared).args(["-m"]).arg(&output).args(["-g","gbx-custom","be_native"]).output().unwrap();
   assert!(compiled.status.success(),"{}",String::from_utf8_lossy(&compiled.stderr));eprintln!("{}",String::from_utf8_lossy(&compiled.stderr));
   let cache=output.join("be_native.map");let map=crate::maps::inspect_map(&cache,None).unwrap();
   let expected=source(&after).unwrap().lists;let actual=crate::maps::scenario_command_readback(&cache,&map).unwrap();
   assert_eq!(expected.len(),actual.len());assert!(expected.iter().zip(&actual).all(|(a,b)|a.close(b)),"every compiled command/list/point must match reviewed source");
   println!("native command route index {}: {} lists; point {:?}; cache SHA256 {}; warnings: {}",list.index,actual.len(),actual[list.index as usize].points[0],crate::maps::hash_file(&cache).unwrap(),String::from_utf8_lossy(&compiled.stderr).to_ascii_lowercase().matches("warning").count());
  }
  fs::write(&file,bytes).unwrap();assert_eq!(before,fields());
 }
}
