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
 if old.name!=list.name||old.commands.len()!=list.commands.len()||old.points.len()!=list.points.len(){return invalid("Preserve command-list name and existing command/point indices; structural changes need a separate review");}if old.close(list){return invalid("Native command list already matches");}
 for c in &list.commands{for(v,n)in [c.animation,c.script,c.recording,c.object_name].into_iter().zip(current.reference_counts){if v>=0&&v as usize>=n{return invalid("Native command references a missing scenario binding");}}}
 if list.flags[5]&&(list.bsp<0||list.bsp as usize>=current.reference_counts[4]){return invalid("Manual command BSP needs an existing scenario BSP");}
 let prefix=format!("command_lists[{}]",list.index);let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned()];let mut set=|key:String,value:String|args.extend(["-S".into(),key,value]);
 for(i,key)in FLAGS.iter().enumerate(){if old.flags[i]!=list.flags[i]{set(format!("{prefix}.flags.{key}"),u8::from(list.flags[i]).to_string());}}if old.bsp!=list.bsp{set(format!("{prefix}.manual_bsp_index"),list.bsp.to_string());}
 for(i,(old,new))in old.commands.iter().zip(&list.commands).enumerate(){let fields=|c:&NativeCommand|[c.atom.clone(),c.modifier.to_string(),c.parameters[0].to_string(),c.parameters[1].to_string(),c.point1.to_string(),c.point2.to_string(),c.animation.to_string(),c.script.to_string(),c.recording.to_string(),c.command.to_string(),c.object_name.to_string()];for((a,b),key)in fields(old).into_iter().zip(fields(new)).zip(["atom_type","atom_modifier","parameter1","parameter2","point_1","point_2","animation","script","recording","command","object_name"]){if a!=b{set(format!("{prefix}.commands[{i}].{key}"),b);}}}
 for(i,(a,b))in old.points.iter().zip(&list.points).enumerate(){if !positions_close(*a,*b){set(format!("{prefix}.points[{i}].position"),b.map(|n|n.to_string()).join(","));}}args.push(tag.into());Ok(args)
}
pub fn reviewed(before:&str,after:&str,list:&NativeCommandList)->Result<Vec<FieldDifference>>{
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
 #[test]#[ignore="Requires installed Invader and an explicitly owned disposable fixture"]
 fn installed_command_actions_parameters_and_waypoints_roundtrip(){
  use std::{fs,process::Command};let root=std::path::PathBuf::from(std::env::var_os("SPARK_GENERATED_ROOT").unwrap()).canonicalize().unwrap();let tags=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_COMMAND_TAGS").unwrap()).canonicalize().unwrap();assert!(tags.starts_with(root));let exe=std::env::var_os("SPARK_NATIVE_INVADER_EDIT").unwrap();let file=tags.join("be_native.scenario");crate::reject_links(&file).unwrap();let bytes=fs::read(&file).unwrap();
  let run=|args:Vec<String>|{let output=Command::new(&exe).args(args).output().unwrap();assert!(output.status.success(),"{}",String::from_utf8_lossy(&output.stderr));String::from_utf8(output.stdout).unwrap()};let fields=||run(vec!["-t".into(),tags.to_string_lossy().into_owned(),"-L".into(),"be_native.scenario".into()]);let before=fields();let mut list=source(&before).unwrap().lists[0].clone();list.commands[0].atom="go_to".into();list.commands[0].point1=0;list.commands[0].parameters=[1.25,0.5];list.flags[0]=true;list.points[0]=[4.,5.,6.];let op=Operation::CommandList{list:list.clone(),source_sha256:crate::maps::hash_file(&file).unwrap()};for batch in op.argument_batches(op.arguments_with_fields(&tags,"scnr","be_native.scenario",&before).unwrap(),false).unwrap(){run(batch);}let after=fields();reviewed_difference(&before,&after,&op).unwrap();let scalar=run(op.readback_arguments(&tags,"scnr","be_native.scenario",&before).unwrap().unwrap());op.verify_readback(&tags,"scnr","be_native.scenario",&before,&scalar).unwrap();assert!(source(&after).unwrap().lists[0].close(&list));fs::write(&file,bytes).unwrap();assert_eq!(before,fields());
 }
}
