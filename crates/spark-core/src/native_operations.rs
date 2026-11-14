//! Reviewed Invader command recipes and comparison of its native field output.
//! This is orchestration, not another native tag parser or tag schema.
use crate::{invalid, safe_relative, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Operation {
    Dependencies,
    AppendEncounter { name:String, #[serde(rename="actorPath")] actor_path:String, position:[f32;3], #[serde(rename="startActive")] start_active:bool,
        #[serde(default="single_actor")] count:u16, #[serde(default="actor_spacing")] spacing:f32 },
    AppendEncounters { encounters:Vec<EncounterAppend> },
    BoundingRadius { value: f64 },
    LensFlareScaleRepair,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct EncounterAppend {
    pub name:String,pub actor_path:String,pub position:[f32;3],pub start_active:bool,
    #[serde(default="single_actor")] pub count:u16,
    #[serde(default="actor_spacing")] pub spacing:f32,
}
impl EncounterAppend {
    pub fn operation(&self)->Operation {Operation::AppendEncounter{name:self.name.clone(),actor_path:self.actor_path.clone(),position:self.position,start_active:self.start_active,count:self.count,spacing:self.spacing}}
}
fn single_actor()->u16{1}
fn actor_spacing()->f32{0.75}
impl Operation {
    pub fn is_encounter_append(&self)->bool {matches!(self,Self::AppendEncounter{..}|Self::AppendEncounters{..})}
    pub fn encounter_appends(&self)->Result<Vec<EncounterAppend>> {
        match self {
            Self::AppendEncounter{name,actor_path,position,start_active,count,spacing}=>Ok(vec![EncounterAppend{name:name.clone(),actor_path:actor_path.clone(),position:*position,start_active:*start_active,count:*count,spacing:*spacing}]),
            Self::AppendEncounters{encounters}=>{
                if encounters.is_empty()||encounters.len()>16{return invalid("Review 1–16 native encounter groups in one operation");}
                Ok(encounters.clone())
            },
            _=>Ok(vec![]),
        }
    }
    pub fn tool_id(&self) -> &'static str {
        match self {
            Self::Dependencies => "invaderDependency",
            Self::BoundingRadius { .. } | Self::AppendEncounter { .. } | Self::AppendEncounters { .. } => "invaderNative",
            Self::LensFlareScaleRepair => "invaderRepair",
        }
    }
    pub fn field(&self) -> Option<&'static str> {
        match self {
            Self::Dependencies | Self::AppendEncounter { .. } | Self::AppendEncounters { .. } => None,
            Self::BoundingRadius { .. } => Some("bounding_radius"),
            Self::LensFlareScaleRepair => Some("rotation_function_scale"),
        }
    }
    pub fn target(&self) -> Option<f64> {
        match self {
            Self::Dependencies | Self::AppendEncounter { .. } | Self::AppendEncounters { .. } => None,
            Self::BoundingRadius { value } => Some(*value),
            Self::LensFlareScaleRepair => Some(0.0),
        }
    }
    pub fn validate(&self, class: &str, tag: &str) -> Result<()> {
        safe_relative(tag)?;
        if tag.starts_with('-') || tag.len() > 240 {
            return invalid("Native tag path is too long or begins with a command option");
        }
        match self {
            Self::AppendEncounter {name,actor_path,position,count,spacing,..} => {
                if class!="scnr" {return invalid("Append encounter requires a native scenario tag");}
                if name.is_empty()||name.len()>31||!name.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'_') {return invalid("Encounter name needs1–31ASCII letters, digits or underscores");}
                safe_relative(actor_path)?;
                if actor_path.is_empty()||actor_path.len()>240||actor_path.starts_with('-')||actor_path.ends_with(".actor_variant")||!actor_path.bytes().all(|c|c.is_ascii_alphanumeric()||b"_/\\ .-".contains(&c)) {return invalid("Choose a safe native actor-variant path without its extension");}
                if *count==0||*count>32{return invalid("A native encounter squad supports 1–32 authored starting locations");}
                let _=crate::firefight::native_actor_start_grid(*position,*count as usize,0,*count as usize,*spacing)?;
            }
            Self::AppendEncounters{..}=>{
                let entries=self.encounter_appends()?;let mut names=std::collections::BTreeSet::new();let mut total=0usize;
                for entry in entries {
                    entry.operation().validate(class,tag)?;
                    if !names.insert(entry.name.to_ascii_lowercase()){return invalid("Each appended encounter needs a distinct native name");}
                    total+=usize::from(entry.count);
                }
                if total>128{return invalid("One reviewed encounter group operation supports at most 128 starting locations");}
            }
            Self::BoundingRadius { value } => {
                if ![
                    "weap", "scen", "bipd", "vehi", "eqip", "garb", "proj", "mach", "ctrl", "lifi",
                    "ssce",
                ]
                .contains(&class)
                {
                    return invalid("This reviewed native field edit requires an object tag");
                }
                if !value.is_finite() || *value < 0.0 || *value > 100_000.0 {
                    return invalid(
                        "Bounding radius must be finite and between 0 and 100000 Halo world units",
                    );
                }
            }
            Self::LensFlareScaleRepair if class != "lens" => {
                return invalid("The reviewed lens-flare repair only accepts lens_flare tags")
            }
            _ => {}
        }
        Ok(())
    }
    pub fn arguments(&self, tags: &Path, class: &str, tag: &str) -> Result<Vec<String>> {
        self.validate(class, tag)?;
        let mut args = vec!["-t".into(), tags.to_string_lossy().into_owned()];
        match self {
            Self::Dependencies => args.push("-r".into()),
            Self::AppendEncounter { .. } | Self::AppendEncounters { .. } => return invalid("Encounter append needs the original scenario array inventory"),
            Self::BoundingRadius { value } => {
                args.extend(["-S".into(), "bounding_radius".into(), value.to_string()])
            }
            Self::LensFlareScaleRepair => {
                args.extend(["-T".into(), "broken-lens-flare-function-scale".into()])
            }
        }
        args.push(tag.into());
        Ok(args)
    }
}
// This interprets the pinned external reader's listing, not native tag bytes.
// Root array boundaries and four-character tree prefixes are the documented -L
// presentation in the existing Invader source. Unknown formatting fails closed.
struct ArrayListing {count:usize,start:usize,end:usize,body:Vec<String>}
fn array_listing(fields:&str,name:&str)->Result<ArrayListing> {
    let lines=fields.lines().collect::<Vec<_>>();
    let prefix=format!("{name}[");
    let matches=lines.iter().enumerate().filter_map(|(index,line)|line.strip_prefix(&prefix).map(|tail|(index,tail))).collect::<Vec<_>>();
    if matches.len()!=1{return invalid(format!("Native {name} array listing is missing or ambiguous"));}
    let (start,tail)=matches[0];
    let (size,kind)=tail.split_once(']').ok_or_else(||crate::SparkError::Invalid("Malformed native array declaration".into()))?;
    let count=size.parse::<usize>().map_err(|_|crate::SparkError::Invalid("Invalid native array size".into()))?;
    if kind.trim()!="array"||count>4096{return invalid("Unsupported native array declaration");}
    let end=(start+1..lines.len()).find(|i|!lines[*i].starts_with(' ')).unwrap_or(lines.len());
    let mut body=vec![];
    for line in &lines[start+1..end] {
        let mut tail=*line;let mut depth=0;
        while let Some(next)=[" │  "," ├──"," └──","    "].iter().find_map(|prefix|tail.strip_prefix(*prefix)) {depth+=1;tail=next;}
        if depth==0||tail.starts_with(char::is_whitespace)||tail.is_empty(){return invalid("Unknown native field-tree formatting; no append was accepted");}
        body.push(format!("{}{tail}","    ".repeat(depth)));
    }
    Ok(ArrayListing{count,start,end,body})
}
fn encounter_append_layout(fields:&str,name:&str,actor:&str)->Result<(ArrayListing,ArrayListing,usize)> {
    let encounters=array_listing(fields,"encounters")?;let palette=array_listing(fields,"actor_palette")?;
    if encounters.count>=128||palette.count>64{return invalid("The scenario has no checked encounter/palette capacity for an append");}
    if encounters.body.iter().filter_map(|line|line.strip_prefix("        name (")).filter_map(|s|s.split_once(')').map(|v|v.0)).any(|existing|existing.eq_ignore_ascii_case(name)){return invalid("An original encounter already owns that name; choose a new one");}
    let wanted=format!("{}.actor_variant",actor.replace('\\',"/"));
    let mut current=None;let mut found=None;
    for line in &palette.body {
        if let Some(tail)=line.strip_prefix("    actor_palette[") {
            let (index,kind)=tail.split_once(']').ok_or_else(||crate::SparkError::Invalid("Malformed actor-palette row".into()))?;
            if kind.trim()!="struct"{return invalid("Unknown actor-palette row format");}
            let index=index.parse::<usize>().map_err(|_|crate::SparkError::Invalid("Invalid actor-palette row".into()))?;
            if index>=palette.count{return invalid("Actor-palette row exceeds its array");}current=Some(index);
        } else if let Some(path)=line.strip_prefix("        reference (").and_then(|v|v.split_once(')').map(|v|v.0)) {
            if path.replace('\\',"/").eq_ignore_ascii_case(&wanted)&&found.is_none(){found=current;}
        }
    }
    let actor_index=found.unwrap_or(palette.count);
    if actor_index>=64{return invalid("Actor palette is full; the selected variant has no existing entry");}
    Ok((encounters,palette,actor_index))
}
// Allocate appended indices from the actual original inventory. Existing entries
// never move; groups sharing a new actor reuse its first appended palette row.
fn encounter_append_layouts(fields:&str,operation:&Operation)->Result<Vec<(EncounterAppend,usize,usize,bool)>> {
    let entries=operation.encounter_appends()?;
    let old_encounters=array_listing(fields,"encounters")?;let old_palette=array_listing(fields,"actor_palette")?;
    if old_encounters.count+entries.len()>128{return invalid("The scenario has no checked capacity for all encounter groups");}
    let mut palette_count=old_palette.count;let mut appended=std::collections::BTreeMap::new();let mut result=vec![];
    for (offset,entry) in entries.into_iter().enumerate() {
        let (_,_,existing)=encounter_append_layout(fields,&entry.name,&entry.actor_path)?;
        let key=entry.actor_path.replace('\\',"/").to_ascii_lowercase();
        let actor=if existing<old_palette.count{existing}else if let Some(index)=appended.get(&key){*index}else{
            if palette_count>=64{return invalid("All encounter groups do not fit the native actor palette");}
            let index=palette_count;palette_count+=1;appended.insert(key,index);index
        };
        let add=actor>=old_palette.count&&!result.iter().any(|row:&(EncounterAppend,usize,usize,bool)|row.2==actor);
        result.push((entry,old_encounters.count+offset,actor,add));
    }
    Ok(result)
}
impl Operation {
    pub fn arguments_with_fields(&self,tags:&Path,class:&str,tag:&str,before:&str)->Result<Vec<String>> {
        self.validate(class,tag)?;
        if !self.is_encounter_append(){return self.arguments(tags,class,tag);}
        let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned()];
        for (entry,index,actor,add_palette) in encounter_append_layouts(before,self)? {
        let EncounterAppend{name,actor_path,position,start_active,count,spacing}=&entry;
        let e=format!("encounters[{index}]");let squad=format!("{e}.squads[0]");
        let positions=crate::firefight::native_actor_start_grid(*position,*count as usize,0,*count as usize,*spacing)?;
        if add_palette {args.extend(["-I".into(),"actor_palette".into(),"1".into(),"end".into(),"-S".into(),format!("actor_palette[{actor}].reference"),format!("{actor_path}.actor_variant")]);}
        args.extend(["-I".into(),"encounters".into(),"1".into(),"end".into(),"-I".into(),format!("{e}.squads"),"1".into(),"end".into(),"-I".into(),format!("{squad}.starting_locations"),count.to_string(),"end".into(),"-I".into(),format!("{e}.firing_positions"),count.to_string(),"end".into()]);
        for(key,value)in [(format!("{e}.name"),name.clone()),(format!("{e}.flags.not_initially_created"),if *start_active{"0"}else{"1"}.into()),(format!("{e}.manual_bsp_index"),"-1".into()),
            (format!("{squad}.name"),"source_squad".into()),(format!("{squad}.actor_type"),actor.to_string()),(format!("{squad}.normal_diff_count"),count.to_string()),(format!("{squad}.insane_diff_count"),count.to_string()),(format!("{squad}.initial_state"),"alert".into()),(format!("{squad}.return_state"),"alert".into())] {args.extend(["-S".into(),key,value]);}
        for(index,(position,_))in positions.into_iter().enumerate() {
            let start=format!("{squad}.starting_locations[{index}]");let firing=format!("{e}.firing_positions[{index}]");let vector=position.map(|value|value.to_string()).join(",");
            for(key,value)in [(format!("{start}.position"),vector.clone()),(format!("{start}.facing"),"0".into()),(format!("{start}.flags.required"),"1".into()),(format!("{start}.sequence_id"),"-1".into()),(format!("{start}.actor_type"),"-1".into()),(format!("{start}.command_list"),"-1".into()),(format!("{start}.initial_state"),"alert".into()),(format!("{start}.return_state"),"alert".into()),(format!("{firing}.position"),vector),(format!("{firing}.group_index"),"a".into())] {args.extend(["-S".into(),key,value]);}
        }
        }
        args.push(tag.into());Ok(args)
    }
    pub fn actor_start_positions(&self)->Result<Option<Vec<[f32;3]>>> {
        if !self.is_encounter_append(){return Ok(None);}
        let mut positions=vec![];
        for entry in self.encounter_appends()? {positions.extend(crate::firefight::native_actor_start_grid(entry.position,entry.count as usize,0,entry.count as usize,entry.spacing)?.into_iter().map(|value|value.0));}
        Ok(Some(positions))
    }
    /// Keep reviewed command actions intact while respecting Windows argument
    /// length. All batches edit the same isolated candidate; acceptance is atomic.
    pub fn argument_batches(&self,args:Vec<String>,readback:bool)->Result<Vec<Vec<String>>> {
        if !self.is_encounter_append(){return Ok(vec![args]);}
        if args.len()<3||args[0]!="-t"{return invalid("Malformed native argument envelope");}
        let cost=|value:&str|value.encode_utf16().count()+value.chars().filter(|c|*c=='\\'||*c=='"').count()+3;
        let end=args.len()-1;let tag=args[end].clone();let base=args[..2].to_vec();
        let overhead=base.iter().map(|v|cost(v)).sum::<usize>()+cost(&tag);
        const LIMIT:usize=24000;
        if overhead>=LIMIT{return invalid("Native source path leaves no checked command-line capacity");}
        let mut result=vec![];let mut batch=base.clone();let mut used=overhead;let mut i=2;
        while i<end {
            let width=match(args[i].as_str(),readback){("-G",true)=>2,("-S",false)=>3,("-I",false)=>4,_=>return invalid("Unknown action in native encounter batch")};
            if i+width>end{return invalid("Incomplete native encounter action");}
            let action=&args[i..i+width];let bytes=action.iter().map(|v|cost(v)).sum::<usize>();
            if bytes>LIMIT-overhead{return invalid("One native action exceeds its checked command-line capacity");}
            if used+bytes>LIMIT {batch.push(tag.clone());result.push(batch);batch=base.clone();used=overhead;}
            batch.extend_from_slice(action);used+=bytes;i+=width;
        }
        if batch.len()>2{batch.push(tag);result.push(batch);}
        if result.is_empty(){return invalid("Native encounter batch contains no actions");}
        Ok(result)
    }
    /// Reuse the exact emitted scalar keys for bounded native -G readback.
    pub fn readback_arguments(&self,tags:&Path,class:&str,tag:&str,before:&str)->Result<Option<Vec<String>>> {
        if !self.is_encounter_append() {return Ok(None);}
        let written=self.arguments_with_fields(tags,class,tag,before)?;
        let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned()];let mut i=2;
        while i+1<written.len(){match written[i].as_str(){"-I"=>i+=4,"-S"=>{args.extend(["-G".into(),written[i+1].clone()]);i+=3;},_=>return invalid("Unexpected native append recipe")}}
        args.push(tag.into());Ok(Some(args))
    }
    pub fn verify_readback(&self,tags:&Path,class:&str,tag:&str,before:&str,output:&str)->Result<()> {
        let written=self.arguments_with_fields(tags,class,tag,before)?;
        let mut expected=vec![];let mut i=2;
        while i+1<written.len(){match written[i].as_str(){"-I"=>i+=4,"-S"=>{expected.push((&written[i+1],&written[i+2]));i+=3;},_=>return invalid("Unexpected native append recipe")}}
        let actual=output.lines().collect::<Vec<_>>();if actual.len()!=expected.len(){return invalid("Native encounter scalar readback count differs from the append recipe");}
        for ((key,value),actual) in expected.into_iter().zip(actual) {
            let same=if key.ends_with(".position")||key.ends_with(".facing") {
                let parse=|s:&str|s.split(',').map(|v|v.trim().parse::<f64>().ok().filter(|v|v.is_finite())).collect::<Option<Vec<_>>>();
                match(parse(value),parse(actual)){(Some(a),Some(b))=>a.len()==b.len()&&a.iter().zip(b).all(|(a,b)|(a-b).abs()<=0.000001f64.max(a.abs()*f64::from(f32::EPSILON)*2.)),_=>false}
            }else if key.ends_with(".reference"){actual.replace('\\',"/").eq_ignore_ascii_case(&value.replace('\\',"/"))}
            else if value.as_str()=="-1"{actual=="-1"||actual=="65535"}else{actual==value.as_str()};
            if !same{return invalid(format!("Native encounter readback differs at {key}: {actual}"));}
        }
        Ok(())
    }
}
fn reviewed_encounter_append(before:&str,after:&str,operation:&Operation)->Result<Vec<FieldDifference>> {
    let Operation::AppendEncounter{name,actor_path,position,start_active,count,spacing}=operation else{return invalid("Not an encounter append");};
    let (old_encounters,old_palette,actor)=encounter_append_layout(before,name,actor_path)?;
    let new_encounters=array_listing(after,"encounters")?;let new_palette=array_listing(after,"actor_palette")?;
    let added=usize::from(actor==old_palette.count);
    if new_encounters.count!=old_encounters.count+1||new_palette.count!=old_palette.count+added||!new_encounters.body.starts_with(&old_encounters.body)||!new_palette.body.starts_with(&old_palette.body)|| (added==0&&new_palette.body!=old_palette.body) {return invalid("Native append changed existing encounter/palette rows or unexpected array counts");}
    let added_body=&new_encounters.body[old_encounters.body.len()..];
    for expected in ["squads[1] array".to_string(),format!("starting_locations[{count}] array"),format!("firing_positions[{count}] array")] {
        if added_body.iter().filter(|line|line.split_whitespace().collect::<Vec<_>>().join(" ")==expected).count()!=1{return invalid("Native encounter append has unexpected squad/start/firing array sizes");}
    }
    let remaining=|text:&str,arrays:[&ArrayListing;2]| {
        text.lines().enumerate().filter(|(index,_)|arrays.iter().all(|a|*index<a.start||*index>=a.end)).map(|(_,line)|line).collect::<Vec<_>>().join("\n")
    };
    if remaining(before,[&old_encounters,&old_palette])!=remaining(after,[&new_encounters,&new_palette]) {return invalid("Native encounter append changed other scenario fields; no revision was selected");}
    Ok(vec![FieldDifference{before:format!("encounters[{}] / actor_palette[{}]",old_encounters.count,old_palette.count),after:format!("encounters[{}] / actor_palette[{}]: {name} → {actor_path}",new_encounters.count,new_palette.count)+&format!(" at grid center {position:?}; actors={count}, spacing={spacing}; initial creation={start_active}")}])
}

fn reviewed_encounter_group_append(before:&str,after:&str,operation:&Operation)->Result<Vec<FieldDifference>> {
    operation.validate("scnr","review.scenario")?;
    let plans=encounter_append_layouts(before,operation)?;
    let old=array_listing(before,"encounters")?;let palette=array_listing(before,"actor_palette")?;
    let new=array_listing(after,"encounters")?;let new_palette=array_listing(after,"actor_palette")?;
    let added=plans.iter().filter(|row|row.3).count();
    if new.count!=old.count+plans.len()||new_palette.count!=palette.count+added||!new.body.starts_with(&old.body)||!new_palette.body.starts_with(&palette.body)||(added==0&&new_palette.body!=palette.body){return invalid("Native encounter group append changed original rows or unexpected counts");}
    let remaining=|text:&str,arrays:[&ArrayListing;2]|text.lines().enumerate().filter(|(index,_)|arrays.iter().all(|a|*index<a.start||*index>=a.end)).map(|(_,line)|line).collect::<Vec<_>>().join("\n");
    if remaining(before,[&old,&palette])!=remaining(after,[&new,&new_palette]){return invalid("Native encounter group append changed other scenario fields");}
    let mut differences=vec![];
    for (entry,index,_,_) in plans {
        let row=format!("    encounters[{index}] struct");
        let start=new.body.iter().position(|line|line==&row).ok_or_else(||crate::SparkError::Invalid("Appended encounter row is missing".into()))?;
        let end=(start+1..new.body.len()).find(|i|new.body[*i].starts_with("    encounters[")).unwrap_or(new.body.len());
        let body=&new.body[start+1..end];
        if body.iter().filter_map(|line|line.strip_prefix("        name (")).filter_map(|tail|tail.split_once(')').map(|pair|pair.0)).filter(|name|*name==entry.name.as_str()).count()!=1{return invalid("Appended encounter group name differs from the reviewed source");}
        for expected in ["squads[1] array".to_string(),format!("starting_locations[{}] array",entry.count),format!("firing_positions[{}] array",entry.count)] {
            if body.iter().filter(|line|line.split_whitespace().collect::<Vec<_>>().join(" ")==expected).count()!=1{return invalid("Native encounter group has unexpected squad/start/firing counts");}
        }
        differences.push(FieldDifference{before:format!("No appended encounter at index{index}"),after:format!("{} → {}; center={:?}; actors={}, spacing={}; initial creation={}",entry.name,entry.actor_path,entry.position,entry.count,entry.spacing,entry.start_active)});
    }
    Ok(differences)
}

/// Independently inspected cache, not the source writer's success status.
impl Operation {
    pub fn verify_compiled_encounter(&self,map:&crate::maps::MapInspection)->Result<()> {
        if matches!(self,Self::AppendEncounters{..}) {
            self.validate("scnr",&format!("{}.scenario",map.scenario_path))?;
            for entry in self.encounter_appends()?{entry.operation().verify_compiled_encounter(map)?;}
            return Ok(());
        }
        self.validate("scnr",&format!("{}.scenario",map.scenario_path))?;
        let Self::AppendEncounter{name,actor_path,position,start_active,count,spacing}=self else{return invalid("Unsupported encounter readback expectation");};
        let found=map.encounters.iter().filter(|encounter|encounter.name==*name).collect::<Vec<_>>();
        if map.header.scenario_type!=0||found.len()!=1{return invalid("Compiled native encounter is missing, ambiguous or not singleplayer");}
        let details=found[0].details.as_ref().ok_or_else(||crate::SparkError::Invalid("Compiled native encounter details are unreadable".into()))?;
        if (details.flags&1==0)!=*start_active||details.manual_bsp_index!=-1||details.squads.len()!=1||details.firing_positions.len()!=*count as usize{return invalid("Compiled native encounter flags/BSP/squad/firing counts differ from the accepted source append");}
        let path=actor_path.replace('\\',"/");
        let actors=map.tags.iter().filter(|tag|tag.class=="actv"&&tag.path.replace('\\',"/").eq_ignore_ascii_case(&path)&&!tag.external&&tag.data_offset.is_some()).collect::<Vec<_>>();
        if actors.len()!=1{return invalid("Compiled source actor is missing, ambiguous or has no embedded body");}
        let actor=Some(actors[0].id);let squad=&details.squads[0];
        if squad.name!="source_squad"||squad.actor_variant_tag_id!=actor||squad.normal_count!=*count as i16||squad.insane_count!=*count as i16||squad.initial_state!=2||squad.return_state!=2||squad.starting_locations.len()!=*count as usize{return invalid("Compiled native squad differs from the accepted source append");}
        let positions=crate::firefight::native_actor_start_grid(*position,*count as usize,0,*count as usize,*spacing)?.into_iter().map(|value|value.0).collect::<Vec<_>>();
        let consume=|remaining:&mut Vec<[f32;3]>,position:[f32;3]|->Result<()> {
            let index=remaining.iter().position(|expected|expected.iter().zip(position).all(|(a,b)|(*a-b).abs()<=0.0001)).ok_or_else(||crate::SparkError::Invalid("Compiled native start/firing position differs from the accepted grid".into()))?;
            remaining.remove(index);Ok(())
        };
        let mut remaining=positions.clone();
        for start in &squad.starting_locations {
            if start.actor_variant_tag_id!=actor||start.actor_palette_index!=-1||start.command_list!=-1||start.flags&1==0||start.facing.abs()>0.0001||start.initial_state!=2||start.return_state!=2{return invalid("Compiled native actor state differs from the accepted source append");}
            consume(&mut remaining,start.position)?;
        }
        let mut remaining=positions;
        for firing in &details.firing_positions {if firing.group_index!=0{return invalid("Compiled native firing group differs from the accepted source append");}consume(&mut remaining,firing.position)?;}
        // Cached firing cluster/surface values can deliberately be NULL.
        // Source/cache identity is not navigation, collision or gameplay proof.
        Ok(())
    }
}

pub fn number(fields: &str, name: &str) -> Result<f64> {
    let prefix = format!("{name} (");
    let mut lines = fields.lines().filter_map(|l| l.strip_prefix(&prefix));
    let Some(value) = lines
        .next()
        .and_then(|l| l.split_once(')'))
        .and_then(|(n, _)| n.parse::<f64>().ok())
    else {
        return invalid("The reviewed native field was not exposed by Invader");
    };
    if !value.is_finite() || lines.next().is_some() {
        return invalid("The native field is ambiguous or not finite");
    }
    Ok(value)
}
/// This pinned Invader reader displays angle fields in degrees. The documented
/// malformed tag contains 360 radians, not an ordinary 360-degree rotation.
pub fn broken_lens_scale(display_degrees: f64) -> bool {
    display_degrees.is_finite() && (display_degrees - 360.0f64.to_degrees()).abs() <= 0.000001
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FieldDifference {
    pub before: String,
    pub after: String,
}
pub fn reviewed_difference(
    before: &str,
    after: &str,
    operation: &Operation,
) -> Result<Vec<FieldDifference>> {
    if matches!(operation,Operation::AppendEncounters{..}) {return reviewed_encounter_group_append(before,after,operation);}
    if matches!(operation,Operation::AppendEncounter{..}) {return reviewed_encounter_append(before,after,operation);}
    let field = operation.field().ok_or_else(|| {
        crate::SparkError::Invalid("Dependency analysis does not edit a field".into())
    })?;
    let old = before.replace("\r\n", "\n");
    let new = after.replace("\r\n", "\n");
    let a: Vec<_> = old.lines().collect();
    let b: Vec<_> = new.lines().collect();
    if a.len() != b.len() {
        return invalid(
            "Native field structure changed unexpectedly; both files are retained for review",
        );
    }
    let differences: Vec<_> = a
        .iter()
        .zip(&b)
        .filter(|(a, b)| a != b)
        .map(|(a, b)| FieldDifference {
            before: (*a).into(),
            after: (*b).into(),
        })
        .collect();
    let prefix = format!("{field} (");
    if differences.len() != 1
        || !differences[0].before.starts_with(&prefix)
        || !differences[0].after.starts_with(&prefix)
    {
        return invalid("The native reader cannot certify exactly the intended exposed field change. No source revision was selected; review the retained candidate in its native editor.");
    }
    let actual = number(after, field)?;
    let expected = operation.target().unwrap();
    if (actual - expected).abs() > 0.000001f64.max(expected.abs() * f64::from(f32::EPSILON) * 2.0) {
        return invalid("The native saved value does not match the requested value");
    }
    if matches!(operation, Operation::LensFlareScaleRepair)
        && !broken_lens_scale(number(before, field)?)
    {
        return invalid("The reviewed repair precondition was not present");
    }
    Ok(differences)
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dependency {
    pub path: String,
    pub reported_broken: bool,
}
pub fn dependency_lines(output: &str) -> Result<Vec<Dependency>> {
    if output.len() > 1024 * 1024 {
        return invalid("Dependency output exceeded the review bound");
    }
    let mut rows = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    for line in output.lines().filter(|l| !l.is_empty()) {
        if rows.len() >= 20_000 {
            return invalid("Dependency output exceeds 20000 native references");
        }
        let (value, broken) = line
            .strip_suffix(" [BROKEN]")
            .map_or((line, false), |v| (v, true));
        let path = value.replace('\\', "/");
        safe_relative(&path)?;
        if !path.rsplit('/').next().is_some_and(|n| n.contains('.')) || path.starts_with('-') {
            return invalid(
                "Unexpected native dependency output; it was not accepted as a complete analysis",
            );
        }
        if !seen.insert(path.to_ascii_lowercase()) {
            return invalid("Duplicate/case-colliding native dependency output needs review");
        }
        rows.push(Dependency {
            path,
            reported_broken: broken,
        });
    }
    Ok(rows)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lens_repair_distinguishes_raw_radians_from_reader_degrees() {
        assert!(broken_lens_scale(20626.480625));
        assert!(!broken_lens_scale(360.0));
        assert!(!broken_lens_scale(0.0));
        assert!(!broken_lens_scale(f64::NAN));
        assert!(reviewed_difference(
            "rotation_function_scale (20626.480625) angle (float32)\n",
            "rotation_function_scale (0.000000) angle (float32)\n",
            &Operation::LensFlareScaleRepair
        )
        .is_ok());
        assert!(reviewed_difference(
            "rotation_function_scale (360.000000) angle (float32)\n",
            "rotation_function_scale (0.000000) angle (float32)\n",
            &Operation::LensFlareScaleRepair
        )
        .is_err());
    }
    #[test]
    fn recipes_cannot_select_broad_repairs_or_accept_foreign_fields() {
        let p = Path::new("owned-tags");
        assert!(Operation::LensFlareScaleRepair
            .arguments(p, "weap", "weapons/pistol.weapon")
            .is_err());
        assert!(Operation::Dependencies
            .arguments(p, "weap", "../sdk/pistol.weapon")
            .is_err());
        assert!(Operation::Dependencies
            .arguments(p, "weap", "-b.weapon")
            .is_err());
        for value in [f64::NAN, f64::INFINITY, -1.0, 100001.0] {
            assert!(Operation::BoundingRadius { value }
                .arguments(p, "weap", "pistol.weapon")
                .is_err());
        }
        let args = Operation::LensFlareScaleRepair
            .arguments(p, "lens", "sun.lens_flare")
            .unwrap();
        assert_eq!(
            &args[2..],
            ["-T", "broken-lens-flare-function-scale", "sun.lens_flare"]
        );
    }
    #[test]
    fn native_field_comparison_rejects_adjacent_edits_precision_ambiguity_and_wrong_result() {
        let before = "bounding_radius (0.100000) float32\nacceleration_scale (2) float32\n";
        let good = before.replace("0.100000", "0.350000");
        let op = Operation::BoundingRadius { value: 0.35 };
        assert_eq!(reviewed_difference(before, &good, &op).unwrap().len(), 1);
        assert!(reviewed_difference(before, &good.replace("(2)", "(3)"), &op).is_err());
        assert!(reviewed_difference(before, before, &op).is_err());
        assert!(
            reviewed_difference(before, &good, &Operation::BoundingRadius { value: 0.5 }).is_err()
        );
    }
    #[test]
    fn dependency_success_does_not_hide_broken_paths_or_accept_traversal() {
        let r = dependency_lines("weapons\\pistol\\pistol.gbxmodel\nmissing.bitmap [BROKEN]\n")
            .unwrap();
        assert!(r[1].reported_broken);
        assert_eq!(r[0].path, "weapons/pistol/pistol.gbxmodel");
        assert!(dependency_lines("../secret.bitmap\n").is_err());
        assert!(dependency_lines("a.bitmap\nA.bitmap\n").is_err());
    }
}
