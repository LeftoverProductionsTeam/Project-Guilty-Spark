//! Bounded HEK UI widget metadata. No engine event handlers are executed here.
use super::*;
fn integer(
    r: &Reader,
    tag: &mut Tag,
    at: usize,
    key: &str,
    label: &str,
    kind: &str,
    min: i64,
    max: i64,
) -> Result<()> {
    let value = match kind {
        "i16" => r.u16(at)? as i16 as i64,
        "u16" => r.u16(at)? as i64,
        "i32" => r.u32(at)? as i32 as i64,
        _ => return invalid("Unknown UI integer field"),
    };
    if !(min..=max).contains(&value) {
        return Ok(());
    }
    tag.fields.push(TagField {
        key: key.into(),
        label: label.into(),
        offset: at,
        kind: kind.into(),
        value: serde_json::json!(value),
        min: min as f64,
        max: max as f64,
        unit: "".into(),
        target_class: None,
    });
    Ok(())
}

// Native HUD layout facts are shared with the 2D editor. The admitted cache
// families use 16-byte dependencies and 12-byte reflexives; Xbox layouts remain
// outside this path until their independent layout/readback gates are closed.
#[derive(Deserialize)]
struct HudSchema { roots: std::collections::HashMap<String,String>, structs: std::collections::HashMap<String,HudStruct> }
#[derive(Deserialize)]
struct HudStruct { size: usize, fields: Vec<HudField> }
#[derive(Deserialize)]
struct HudField {
    name: String, label: String, offset: usize, #[serde(rename="type")] kind: String,
    #[serde(rename="struct")] child: Option<String>, maximum: Option<f64>, minimum: Option<f64>, engines: Option<Vec<String>>,
    classes: Option<Vec<String>>, options: Option<Vec<String>>, width: Option<usize>,
    bounds: Option<bool>, unit: Option<String>,
}
fn hud_schema() -> Result<&'static HudSchema> {
    static SCHEMA: OnceLock<std::result::Result<HudSchema,String>> = OnceLock::new();
    SCHEMA.get_or_init(||serde_json::from_str(include_str!("../../../src/nativeHudSchema.json")).map_err(|e|e.to_string()))
        .as_ref().map_err(|e|SparkError::Invalid(format!("Native HUD schema: {e}")))
}
fn hud_scalar(r:&Reader,tag:&mut Tag,at:usize,key:&str,label:&str,kind:&str,min:f64,max:f64,unit:&str)->Result<()> {
    let value=match kind {
        "f32"=>r.f32(at)? as f64, "u32"=>r.u32(at)? as f64,
        "i32"=>r.u32(at)? as i32 as f64, "u16"=>r.u16(at)? as f64,
        "i16"=>r.u16(at)? as i16 as f64, "u8"=>r.bytes(at,1)?[0] as f64,
        "i8"=>r.bytes(at,1)?[0] as i8 as f64, _=>return invalid("Unknown HUD scalar encoding"),
    };
    // Do not reinterpret an unknown native enum or out-of-range native value.
    if value<min||value>max {return Ok(());}
    tag.fields.push(TagField{key:format!("hud:{key}"),label:label.into(),offset:at,kind:kind.into(),
        value:serde_json::json!(value),min,max,unit:unit.into(),target_class:None});
    Ok(())
}
fn hud_struct(r:&Reader,space:&Space,tag:&mut Tag,ids:&std::collections::HashMap<u32,String>,schema:&HudSchema,
    name:&str,at:usize,path:&str,depth:usize,budget:&mut usize,version:u32)->Result<()> {
    if depth>8 {return invalid("HUD reflexive nesting exceeds the native layout limit");}
    let definition=schema.structs.get(name).ok_or_else(||SparkError::Invalid("Unknown native HUD structure".into()))?;
    let relative=at.checked_sub(space.begin).and_then(|n|u32::try_from(n).ok()).and_then(|n|space.address.checked_add(n))
        .ok_or_else(||SparkError::Invalid("HUD address overflow".into()))?;
    space.pointer(relative,definition.size)?;
    for field in &definition.fields {
        if field.engines.as_ref().is_some_and(|engines|version!=13||!engines.iter().any(|engine|engine=="mcc")){continue;}
        if *budget==0 {return invalid("HUD field inventory exceeds 16384 entries");} *budget-=1;
        let address=at.checked_add(field.offset).ok_or_else(||SparkError::Invalid("HUD field offset overflow".into()))?;
        let key=if path.is_empty(){field.name.clone()}else{format!("{path}.{}",field.name)};
        let label=key.replace('_'," ");
        if field.kind=="TagReflexive" {
            let child=field.child.as_deref().ok_or_else(||SparkError::Invalid("HUD block has no native structure".into()))?;
            let stride=schema.structs.get(child).ok_or_else(||SparkError::Invalid("Unknown native HUD block".into()))?.size;
            let(rows,count)=space.block(r,address,stride,field.maximum.unwrap_or(0.) as usize)?;
            for index in 0..count {hud_struct(r,space,tag,ids,schema,child,rows+index*stride,&format!("{key}[{index}]"),depth+1,budget,version)?;}
            continue;
        }
        if field.kind=="TagDependency" {
            let expected=field.classes.as_ref().filter(|v|v.len()==1).and_then(|v|v.first()).map(String::as_str);
            let before=tag.fields.len(); reference(r,tag,address,&format!("HUD {label}"),expected,ids)?;
            if tag.fields.len()>before {tag.fields[before].key=format!("hud:{key}");}
            continue;
        }
        // Strings and reserved/cache-only/unused schema cells are never scalar edits.
        if field.kind=="TagString" {continue;}
        let components:&[&str]=match field.kind.as_str(){
            "Point2DInt"|"Point2D"=>&["x","y"],"Rectangle2D"=>&["top","left","bottom","right"],
            "ColorARGB"=>&["alpha","red","green","blue"],"ColorRGB"=>&["red","green","blue"],_=>&[""],
        };
        let (kind,min,max,unit)=if let Some(options)=&field.options {("u16",0.,if field.kind=="HUDInterfaceAnchor"&&version!=13{4.}else{options.len().saturating_sub(1) as f64},"")}
        else if let Some(width)=field.width {match width {8=>("u8",0.,255.,"flags"),16=>("u16",0.,65535.,"flags"),32=>("u32",0.,u32::MAX as f64,"flags"),_=>return invalid("Unsupported HUD flag width")}}
        else {match field.kind.as_str(){
            "Point2DInt"|"Rectangle2D"|"int16"|"Index"=>("i16",i16::MIN as f64,i16::MAX as f64,""),
            "int8"=>("i8",i8::MIN as f64,i8::MAX as f64,""),
            "ColorARGBInt"=>("u32",0.,u32::MAX as f64,"ARGB32"),
            "Fraction"|"ColorARGB"|"ColorRGB"=>("f32",0.,1.,""),
            "float"|"Point2D"|"Angle"=>("f32",-1_000_000.,1_000_000.,""),
            _=>return invalid(format!("Unsupported native HUD field {}",field.kind)),
        }};
        let min=field.minimum.unwrap_or(min);let max=field.maximum.unwrap_or(max);
        let unit=field.unit.as_deref().unwrap_or(if field.kind=="Angle"{"radians"}else{unit});
        let stride=if kind=="i16"||kind=="u16"{2}else if kind=="i8"||kind=="u8"{1}else{4};
        let bounds=if field.bounds==Some(true){2}else{1};
        for bound in 0..bounds {for (index,component) in components.iter().enumerate(){
            let suffix=if bounds==2 {if bound==0{".lower"}else{".upper"}}else{""};
            let component=if component.is_empty(){String::new()}else{format!(".{component}")};
            hud_scalar(r,tag,address+(bound*components.len()+index)*stride,&format!("{key}{suffix}{component}"),
                &format!("{}{suffix}{component}",if path.is_empty(){field.label.as_str()}else{label.as_str()}),kind,min,max,unit)?;
        }}
    }
    Ok(())
}
fn read_hud(r:&Reader,space:&Space,tag:&mut Tag,ids:&std::collections::HashMap<u32,String>,version:u32)->Result<()> {
    let schema=hud_schema()?;let Some(root)=schema.roots.get(&tag.class)else{return Ok(());};
    let Some(at)=tag.data_offset else{return Ok(());};let mut budget=16384;
    hud_struct(r,space,tag,ids,schema,root,at,"",0,&mut budget,version)
}

pub(super) fn read(
    r: &Reader,
    space: &Space,
    tag: &mut Tag,
    ids: &std::collections::HashMap<u32, String>,
    version: u32,
) -> Result<()> {
    let Some(at) = tag.data_offset else {
        return Ok(());
    };
    if matches!(tag.class.as_str(), "tagc" | "Soul") {
        let (rows, count) = space.block(r, at, 16, 4096)?;
        for i in 0..count {
            reference(
                r,
                tag,
                rows + i * 16,
                &format!("Collection entry {}", i + 1),
                None,
                ids,
            )?;
        }
        return Ok(());
    }
    if matches!(tag.class.as_str(),"unhi"|"wphi"|"grhi"|"hudg") {
        return read_hud(r,space,tag,ids,version);
    }
    if tag.class != "DeLa" {
        return Ok(());
    }
    space.pointer(space.address + (at - space.begin) as u32, 1004)?;
    // Types 4–6 are explicitly unimplemented engine placeholders in the HEK
    // schema. Preserve them in sources, but do not offer them as new edits.
    integer(r, tag, at, "ui-widget-type", "Widget type", "u16", 0, 3)?;
    for (offset, key, label) in [
        (36, "ui-top", "Top"),
        (38, "ui-left", "Left"),
        (40, "ui-bottom", "Bottom"),
        (42, "ui-right", "Right"),
        (304, "ui-text-x", "Text horizontal offset"),
        (306, "ui-text-y", "Text vertical offset"),
    ] {
        integer(r, tag, at + offset, key, label, "i16", -32768, 32767)?;
    }
    for (offset, key, label) in [
        (48, "ui-close-ms", "Auto-close time (ms)"),
        (52, "ui-fade-ms", "Auto-close fade (ms)"),
    ] {
        integer(r, tag, at + offset, key, label, "i32", 0, i32::MAX as i64)?;
    }
    for (offset, label, class) in [
        (56, "Background bitmap", "bitm"),
        (236, "Text strings", "ustr"),
        (252, "Text font", "font"),
        (340, "List header bitmap", "bitm"),
        (356, "List footer bitmap", "bitm"),
        (420, "Extended description widget", "DeLa"),
    ] {
        reference(r, tag, at + offset, label, Some(class), ids)?;
    }
    for (i, label) in ["Alpha", "Red", "Green", "Blue"].iter().enumerate() {
        numeric(
            r,
            tag,
            at + 268 + i * 4,
            &format!("ui-text-color-{i}"),
            &format!("Text {label}"),
            1.,
            "",
        )?;
    }
    for (offset, label) in [(724, "Conditional widget"), (992, "Child widget")] {
        let (rows, count) = space.block(r, at + offset, 80, 32)?;
        for i in 0..count {
            reference(
                r,
                tag,
                rows + i * 80,
                &format!("{label} {}", i + 1),
                Some("DeLa"),
                ids,
            )?;
        }
    }
    let (rows, count) = space.block(r, at + 84, 72, 32)?;
    for i in 0..count {
        reference(
            r,
            tag,
            rows + i * 72 + 8,
            &format!("Event {} widget", i + 1),
            Some("DeLa"),
            ids,
        )?;
        reference(
            r,
            tag,
            rows + i * 72 + 24,
            &format!("Event {} sound", i + 1),
            Some("snd!"),
            ids,
        )?;
    }
    Ok(())
}
pub(super) fn validate_layout(
    project: &crate::project::Project,
    inspection: &MapInspection,
) -> Result<()> {
    for tag in inspection.tags.iter().filter(|t| t.class == "DeLa") {
        if !project.tag_edits.iter().any(|e| {
            e.tag_id == tag.id
                && matches!(
                    e.field_key.as_str(),
                    "ui-top" | "ui-left" | "ui-bottom" | "ui-right"
                )
        }) {
            continue;
        }
        let value = |key: &str| -> Result<i64> {
            project
                .tag_edits
                .iter()
                .find(|e| e.tag_id == tag.id && e.field_key == key)
                .map(|e| &e.value)
                .or_else(|| tag.fields.iter().find(|f| f.key == key).map(|f| &f.value))
                .and_then(|v| {
                    v.as_i64()
                        .or_else(|| v.as_f64().filter(|n| n.fract() == 0.).map(|n| n as i64))
                })
                .ok_or_else(|| SparkError::Invalid("Incomplete widget rectangle".into()))
        };
        let (top, left, bottom, right) = (
            value("ui-top")?,
            value("ui-left")?,
            value("ui-bottom")?,
            value("ui-right")?,
        );
        if bottom < top || right < left || bottom - top > 8192 || right - left > 8192 {
            return invalid(
                "UI widget rectangle must have non-negative width/height, at most 8192 pixels",
            );
        }
    }
    Ok(())
}


/// Semantic readback of the admitted native HUD fields carried through the
/// existing extraction/rebuild path. Source and output datum IDs may differ.
/// This neither writes tags nor certifies pixels, fonts, gameplay or unknown cells.
#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct HudTagReadback {
    pub source_tag_id:u32,
    pub output_tag_id:u32,
    pub class:String,
    pub path:String,
    pub fields_compared:usize,
    pub edited_fields:usize,
}
#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct HudEditReadback {
    pub source_sha256:String,
    pub output_sha256:String,
    pub source_version:u32,
    pub output_version:u32,
    pub tags:Vec<HudTagReadback>,
    pub scope:&'static str,
}
fn hud_path(path:&str)->String {path.replace('\\',"/").to_ascii_lowercase()}
fn output_hud_path(project:&crate::project::Project,tag:&Tag)->String {
    hud_path(project.tag_renames.iter().find(|rename|rename.source_tag_id==tag.id).map_or(tag.path.as_str(),|rename|rename.path.as_str()))
}
pub fn verify_hud_edits(project:&crate::project::Project,before:&MapInspection,after:&MapInspection)->Result<Option<HudEditReadback>> {
    let requested=project.tag_edits.iter().filter(|edit|edit.field_key.starts_with("hud:")).collect::<Vec<_>>();
    if requested.is_empty(){return Ok(None);}
    let source=project.source.as_ref().ok_or_else(||SparkError::Invalid("HUD readback requires the preserved source identity".into()))?;
    if source.sha256!=before.sha256||source.cache_version!=before.header.version {
        return invalid("HUD readback source differs from the inspected project");
    }
    if ![6,7,13,609].contains(&before.header.version)||![6,7,13,609].contains(&after.header.version) {
        return invalid("This native HUD source/output layout has not been admitted");
    }
    crate::project::validate_edits(project,before)?;
    let schema=hud_schema()?;
    let by_source_id=before.tags.iter().map(|tag|(tag.id,tag)).collect::<std::collections::HashMap<_,_>>();
    let by_output_id=after.tags.iter().map(|tag|(tag.id,tag)).collect::<std::collections::HashMap<_,_>>();
    if by_source_id.len()!=before.tags.len()||by_output_id.len()!=after.tags.len(){return invalid("Ambiguous native tag IDs during HUD readback");}
    let mut by_output_path=std::collections::HashMap::<(String,String),Vec<&Tag>>::new();
    for tag in &after.tags {by_output_path.entry((tag.class.clone(),hud_path(&tag.path))).or_default().push(tag);}
    let mut edits=std::collections::BTreeMap::new();
    let mut ids=std::collections::BTreeSet::new();
    for edit in requested {
        let tag=by_source_id.get(&edit.tag_id).ok_or_else(||SparkError::Invalid("Edited HUD tag is no longer indexed".into()))?;
        if !schema.roots.contains_key(&tag.class)||!tag.fields.iter().any(|field|field.key==edit.field_key) {
            return invalid(format!("Edited native HUD field {} has no admitted source layout",edit.field_key));
        }
        if edits.insert((edit.tag_id,edit.field_key.as_str()),&edit.value).is_some(){return invalid("Duplicate HUD field edits cannot establish one expected native value");}
        ids.insert(edit.tag_id);
    }
    let mut tags=vec![];
    for id in ids {
        let tag=by_source_id[&id];
        let path=output_hud_path(project,tag);
        if before.tags.iter().filter(|other|other.class==tag.class&&hud_path(&other.path)==hud_path(&tag.path)).count()!=1 {
            return invalid("Edited HUD source class/path is ambiguous");
        }
        let candidates=by_output_path.get(&(tag.class.clone(),path.clone()));
        let target=match candidates.map(Vec::as_slice) {
            Some([target])=>*target,
            _=>return invalid(format!("Compiled HUD {} ({}) is missing or ambiguous",path,tag.class)),
        };
        let fields=target.fields.iter().filter(|field|field.key.starts_with("hud:")).map(|field|(field.key.as_str(),field)).collect::<std::collections::HashMap<_,_>>();
        if fields.len()!=target.fields.iter().filter(|field|field.key.starts_with("hud:")).count(){return invalid("Compiled HUD field identities are ambiguous");}
        let mut compared=0usize;let mut edited=0usize;let mut keys=std::collections::BTreeSet::new();
        for field in tag.fields.iter().filter(|field|field.key.starts_with("hud:")) {
            if !keys.insert(field.key.as_str()){return invalid("Source HUD field identities are ambiguous");}
            let actual=fields.get(field.key.as_str()).ok_or_else(||SparkError::Invalid(format!("Compiled HUD lost admitted field {} in {}",field.key,path)))?;
            if actual.kind!=field.kind||actual.unit!=field.unit||actual.target_class!=field.target_class {
                return invalid(format!("Compiled HUD field type changed: {} in {}",field.key,path));
            }
            let edit=edits.get(&(id,field.key.as_str())).copied();
            let expected=edit.unwrap_or(&field.value);
            let matched=if field.kind=="reference" {
                let expected_id=expected.as_u64().and_then(|id|u32::try_from(id).ok()).ok_or_else(||SparkError::Invalid("Expected HUD reference is not a native uint32 ID".into()))?;
                let actual_id=actual.value.as_u64().and_then(|id|u32::try_from(id).ok()).ok_or_else(||SparkError::Invalid("Compiled HUD reference is not a native uint32 ID".into()))?;
                let original=by_source_id.get(&expected_id).ok_or_else(||SparkError::Invalid("Expected HUD dependency is no longer indexed".into()))?;
                let dependency=by_output_id.get(&actual_id).ok_or_else(||SparkError::Invalid("Compiled HUD dependency is not indexed".into()))?;
                let expected_path=output_hud_path(project,original);
                original.class==dependency.class&&expected_path==hud_path(&dependency.path)&&
                    by_output_path.get(&(original.class.clone(),expected_path)).is_some_and(|tags|tags.len()==1)
            }else{
                let expected=expected.as_f64().filter(|n|n.is_finite()).ok_or_else(||SparkError::Invalid("Expected HUD scalar is not finite".into()))?;
                let actual=actual.value.as_f64().filter(|n|n.is_finite()).ok_or_else(||SparkError::Invalid("Compiled HUD scalar is not finite".into()))?;
                if field.kind=="f32" {actual as f32==expected as f32}else{actual==expected}
            };
            if !matched {return invalid(format!("Compiled HUD value/reference differs from saved source: {} in {}",field.key,path));}
            compared+=1;if edit.is_some(){edited+=1;}
        }
        if compared==0||edited==0{return invalid("Edited HUD has no provable native field readback");}
        tags.push(HudTagReadback{source_tag_id:id,output_tag_id:target.id,class:tag.class.clone(),path,fields_compared:compared,edited_fields:edited});
    }
    Ok(Some(HudEditReadback{source_sha256:before.sha256.clone(),output_sha256:after.sha256.clone(),
        source_version:before.header.version,output_version:after.header.version,tags,
        scope:"Saved HUD scalar/reference edits and other admitted fields in those tags, matched by native class/path across rebuild. Target-only fields and opaque/unsupported cells are outside this comparison. Native rendering and game behavior require separate acceptance."}))
}
