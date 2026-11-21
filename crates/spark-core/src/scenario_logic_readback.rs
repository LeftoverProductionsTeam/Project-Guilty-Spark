//! Standard H1 scenario marker layout, using the existing bounded cache reader.
//! Native interface data only; no Forerunner engine implementation is included.
use super::*;
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct ScenarioLogicName {pub name:String,pub object_type:i16,pub object_index:i16}
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct ScenarioLogicDevice {
    #[serde(skip_serializing_if="Option::is_none")] pub power_group:Option<i16>,
    #[serde(skip_serializing_if="Option::is_none")] pub position_group:Option<i16>,
    #[serde(skip_serializing_if="Option::is_none")] pub usable_from_both_sides:Option<bool>,
    #[serde(skip_serializing_if="Option::is_none")] pub interaction_disabled:Option<bool>,
    #[serde(skip_serializing_if="Option::is_none")] pub manual_activation:Option<bool>,
    #[serde(skip_serializing_if="Option::is_none")] pub initially_off:Option<bool>,
    #[serde(skip_serializing_if="Option::is_none")] pub initially_open:Option<bool>,
    pub class:String,pub index:usize,pub name_index:i16,pub tag_path:String,pub position:[f32;3],pub rotation_radians:[f32;3]}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ScenarioLogicVolume {pub name:String,pub kind:u16,pub geometry:Option<ScenarioLogicVolumeGeometry>}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ScenarioLogicVolumeGeometry {pub forward:[f32;3],pub up:[f32;3],pub corner:[f32;3],pub dimensions:[f32;3]}
impl ScenarioLogicVolumeGeometry {
    pub(crate) fn valid(&self)->bool{self.contains(self.corner)&&self.corner.iter().chain(self.dimensions.iter()).all(|v|v.abs()<=1e6)}
    pub(crate) fn contains(&self,point:[f32;3])->bool {
        let dot=|a:[f32;3],b:[f32;3]|a.iter().zip(b).map(|(x,y)|x*y).sum::<f32>();
        if point.iter().chain(self.forward.iter()).chain(self.up.iter()).chain(self.corner.iter()).chain(self.dimensions.iter()).any(|v|!v.is_finite())
            ||self.dimensions.iter().any(|d|*d<=0.)||(dot(self.forward,self.forward)-1.).abs()>1e-4||(dot(self.up,self.up)-1.).abs()>1e-4||dot(self.forward,self.up).abs()>1e-4{return false;}
        let [ux,uy,uz]=self.up;let [fx,fy,fz]=self.forward;let side=[uy*fz-uz*fy,uz*fx-ux*fz,ux*fy-uy*fx];
        let delta=std::array::from_fn(|i|point[i]-self.corner[i]);
        [self.forward,side,self.up].into_iter().zip(self.dimensions).all(|(axis,extent)|{let value=dot(delta,axis);value>=-1e-5&&value<=extent+1e-5})
    }
}
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct ScenarioLogicReadback {pub groups:Vec<ScenarioLogicGroup>,pub names:Vec<ScenarioLogicName>,pub devices:Vec<ScenarioLogicDevice>,pub vehicles:Vec<ScenarioLogicDevice>,pub volumes:Vec<ScenarioLogicVolume>}
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct ScenarioLogicGroup {pub name:String,pub initial_value:f32,pub flags:u32}
/// Matches the exact previously inspected cache, never a source tag or sidecar.
pub fn scenario_logic_readback(path:&Path,inspection:&MapInspection)->Result<ScenarioLogicReadback> {
    with_scenario(path,inspection,|r,space,at|parse(r,space,at,&inspection.tags))
}
/// Full placement checks additionally need unnamed vehicles. This shares the
/// same decoder while retaining the existing named-marker reader's scope.
pub fn scenario_placement_readback(path:&Path,inspection:&MapInspection)->Result<ScenarioLogicReadback>{
    with_scenario(path,inspection,|r,space,at|parse_placements(r,space,at,&inspection.tags,true))
}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct NativeCameraPoint {pub index:u16,pub name:String,pub position:[f32;3],pub orientation_radians:[f32;3],pub fov_radians:f32}
/// Cutscene camera points use the standard104-byte H1 scenario structure.
/// Read only the requested block; unrelated device data is not camera evidence.
pub fn scenario_camera_readback(path:&Path,inspection:&MapInspection)->Result<Vec<NativeCameraPoint>> {
    with_scenario(path,inspection,parse_cameras)
}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct NativeCutsceneFlag {pub index:u16,pub name:String,pub position:[f32;3],pub facing_radians:[f32;2]}
/// Standard92-byte H1 cutscene flags, adjacent to the existing camera block.
pub fn scenario_flag_readback(path:&Path,inspection:&MapInspection)->Result<Vec<NativeCutsceneFlag>>{
    with_scenario(path,inspection,|r,space,at|{
        let(start,count)=space.block(r,at+0x4e4,92,512)?;let mut flags=vec![];
        for index in 0..count{let p=start+index*92;let flag=NativeCutsceneFlag{index:index as u16,name:r.string(p+4,32)?,position:vec3(r,p+36)?,facing_radians:[r.f32(p+48)?,r.f32(p+52)?]};
            if flag.position.iter().any(|v|!v.is_finite()||v.abs()>1e6)||flag.facing_radians.iter().any(|v|!v.is_finite()){return invalid("Invalid compiled cutscene flag pose");}flags.push(flag);
        }Ok(flags)
    })
}
fn parse_cameras(r:&Reader,space:&Space,at:usize)->Result<Vec<NativeCameraPoint>>{
    let(start,count)=space.block(r,at+0x4f0,104,512)?;let mut points=vec![];
    for index in 0..count {let p=start+index*104;let point=NativeCameraPoint{index:index as u16,name:r.string(p+4,32)?,position:vec3(r,p+40)?,orientation_radians:vec3(r,p+52)?,fov_radians:r.f32(p+64)?};
        if point.position.iter().any(|v|!v.is_finite()||v.abs()>1e6)||point.orientation_radians.iter().any(|v|!v.is_finite()||v.abs()>20000.)||!point.fov_radians.is_finite(){return invalid("Compiled cutscene camera contains invalid numeric values");}points.push(point);
    }Ok(points)
}
fn with_scenario<T>(path:&Path,inspection:&MapInspection,decode:impl FnOnce(&Reader,&Space,usize)->Result<T>)->Result<T> {
    let (header,bytes,hash)=read_cache_snapshot_shared(path)?;
    if hash!=inspection.sha256{return invalid("Logic cache changed after map inspection");}
    let r=Reader(&bytes);let space=cache_tag_space(&r,&header)?;
    let scenario_id=r.u32(space.begin+4)?;
    let scenarios=inspection.tags.iter().filter(|tag|tag.id==scenario_id&&tag.class=="scnr"&&tag.path==inspection.scenario_path&&!tag.external).collect::<Vec<_>>();
    if scenarios.len()!=1{return invalid("Compiled Logic scenario identity is missing or ambiguous");}
    let at=scenarios[0].data_offset.ok_or_else(||SparkError::Invalid("Compiled Logic scenario body is unavailable".into()))?;
    if at<space.begin||at.checked_add(0x5b0).is_none_or(|end|end>space.end){return invalid("Compiled Logic scenario body escapes its tag region");}
    decode(&r,&space,at)
}
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct NativeScriptGlobal {pub name:String,pub value_type:u16}
pub fn scenario_global_readback(path:&Path,map:&MapInspection)->Result<Vec<NativeScriptGlobal>>{with_scenario(path,map,|r,space,sc|{let(at,count)=space.block(r,sc+0x4a8,92,4096)?;(0..count).map(|index|{let p=at+index*92;Ok(NativeScriptGlobal{name:r.string(p,32)?,value_type:r.u16(p+32)?})}).collect()})}
pub fn scenario_volume_readback(path:&Path,inspection:&MapInspection)->Result<Vec<ScenarioLogicVolume>> {with_scenario(path,inspection,parse_volumes)}
fn parse_volumes(r:&Reader,space:&Space,at:usize)->Result<Vec<ScenarioLogicVolume>> {
    let (at,count)=space.block(r,at+0x360,96,4096)?;let mut volumes=vec![];
    for index in 0..count {let p=at+index*96;let kind=r.u16(p)?;
        if kind>1{return invalid("Compiled native trigger volume has an unsupported representation");}
        // Axis-aligned volumes use another union member. Never interpret their
        // unused basis bytes as an oriented box or manufacture zero telemetry.
        let geometry=if kind==1{Some(ScenarioLogicVolumeGeometry{forward:vec3(r,p+48)?,up:vec3(r,p+60)?,corner:vec3(r,p+72)?,dimensions:vec3(r,p+84)?})}else{None};
        volumes.push(ScenarioLogicVolume{name:r.string(p+4,32)?,kind,geometry});
    }
    Ok(volumes)
}
#[derive(Clone,Debug)]
pub struct ScenarioLogicWeapon {pub index:usize,pub name_index:i16,pub tag_path:String,pub not_placed:u16}
/// Native placement blocks shared by source selection and independent cache bindings.
pub(crate) const NAMED_OBJECT_BLOCKS:&[(&str,&str,&str,&str,i16,usize,usize,usize,&str)]=&[
 ("scenery","scenery_palette","scen","scenery",6,0x210,0x21c,72,"Scenery"),
 ("bipeds","biped_palette","bipd","biped",0,0x228,0x234,120,"Biped"),
 ("vehicles","vehicle_palette","vehi","vehicle",1,0x240,0x24c,120,"Vehicle"),
 ("equipment","equipment_palette","eqip","equipment",3,0x258,0x264,40,"Equipment"),
 ("weapons","weapon_palette","weap","weapon",2,0x270,0x27c,92,"Weapon"),
 ("machines","machine_palette","mach","device_machine",7,0x294,0x2a0,64,"Machine"),
 ("controls","control_palette","ctrl","device_control",8,0x2ac,0x2b8,64,"Control"),
 ("light_fixtures","light_fixture_palette","lifi","device_light_fixture",9,0x2c4,0x2d0,88,"Light fixture"),
 ("sound_scenery","sound_scenery_palette","ssce","sound_scenery",11,0x2dc,0x2e8,40,"Sound scenery"),
];
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct NativeNamedObject {pub name:String,pub class:String,pub index:u16,pub name_index:u16,pub tag_path:String,pub position:[f32;3]}
pub fn scenario_named_object_readback(path:&Path,map:&MapInspection)->Result<Vec<NativeNamedObject>>{
 with_scenario(path,map,|r,space,sc|{
  let names=parse_names(r,space,sc)?;let mut result=vec![];
  for &(_,_,class,_,object_type,offset,palette,stride,kind)in NAMED_OBJECT_BLOCKS{
   if !names.iter().any(|n|n.object_type==object_type){continue;}
   let mut diagnostics=vec![];let objects=placements(r,space,sc,(offset,palette,stride,kind),&map.tags,&mut diagnostics)?;
   if !diagnostics.is_empty(){return invalid("Named waypoint object placement/palette is invalid");}
   let(at,_)=space.block(r,sc+offset,stride,4096)?;
   for(name_index,name)in names.iter().enumerate().filter(|(_,n)|n.object_type==object_type){
    let index=usize::try_from(name.object_index).map_err(|_|SparkError::Invalid("Named object has no compiled placement".into()))?;
    let object=objects.get(index).ok_or_else(||SparkError::Invalid("Named object placement is missing".into()))?;
    if r.u16(at+index*stride+2)? as usize!=name_index||object.position.iter().any(|v|!v.is_finite()){return invalid("Compiled object reverse name or pose is invalid");}
    let tags=map.tags.iter().filter(|tag|Some(tag.id)==object.tag_id&&tag.class==class).collect::<Vec<_>>();
    if tags.len()!=1{return invalid("Named object tag/class is missing or ambiguous");}
    result.push(NativeNamedObject{name:name.name.clone(),class:class.into(),index:index as u16,name_index:name_index as u16,tag_path:tags[0].path.clone(),position:object.position});
   }
  }Ok(result)
 })
}
pub fn scenario_faction_body_readback(
    path: &Path, map: &MapInspection, name: &str,
) -> Result<Option<crate::native_operations::NativeFactionBodyBinding>> {
    with_scenario(path, map, |r, space, sc| {
        let names = parse_names(r, space, sc)?;
        let matches = names.iter().enumerate().filter(|(_, row)| row.name.eq_ignore_ascii_case(name)).collect::<Vec<_>>();
        let [(name_index, binding)] = matches.as_slice() else {
            return if matches.is_empty() { Ok(None) } else { invalid("Compiled faction body name is duplicated") };
        };
        if binding.name != name || binding.object_type != 0 || binding.object_index < 0 {
            return invalid("Compiled faction body name must bind a native biped");
        }
        let index = binding.object_index as usize;
        let (_, _, _, _, _, offset, palette, stride, kind) = NAMED_OBJECT_BLOCKS[1];
        let (at, count) = space.block(r, sc + offset, stride, 4096)?;
        if index >= count { return invalid("Compiled faction biped placement is missing"); }
        let p = at + index * stride;
        let permutation = r.u16(p + 6)? as i16;
        if r.u16(p + 2)? as usize != *name_index || r.u16(p + 4)? & 1 == 0 || permutation < -1 {
            return invalid("Compiled faction biped name, nonautomatic flag or permutation is invalid");
        }
        let mut diagnostics = Vec::new();
        let placed = placements(r, space, sc, (offset, palette, stride, kind), &map.tags, &mut diagnostics)?;
        if !diagnostics.is_empty() { return invalid("Compiled faction biped placement or palette is invalid"); }
        let object = &placed[index];
        let sources = map.tags.iter().filter(|tag| Some(tag.id) == object.tag_id && tag.class == "bipd" && !tag.external).collect::<Vec<_>>();
        let [tag] = sources.as_slice() else { return invalid("Compiled faction biped tag is missing or ambiguous"); };
        let arms_path = crate::native_operations::faction_arms_path(&tag.path);
        let (_, _, _, _, _, _, scenery_palette, _, _) = NAMED_OBJECT_BLOCKS[0];
        let (palette_at, palette_count) = space.block(r, sc + scenery_palette, 48, 4096)?;
        let carriers: Vec<_> = map.tags.iter().filter(|tag|
            tag.class == "scen" && tag.path.replace('\\', "/").eq_ignore_ascii_case(&arms_path)
        ).collect();
        let mut first_person_arms = false;
        if let [carrier] = carriers.as_slice() {
            for index in 0..palette_count {
                if r.u32(palette_at + index * 48 + 12)? != carrier.id { continue; }
                if first_person_arms || carrier.external || !carrier.references.iter().any(|reference|
                    reference.label == "Model" && map.tags.iter().any(|model| model.id == reference.target_id
                        && model.class == "mod2" && !model.external && model.path.replace('\\', "/") == arms_path)
                ) {
                    return invalid("Compiled faction arms carrier or its exact native model is invalid");
                }
                first_person_arms = true;
            }
        } else if carriers.len() > 1 {
            return invalid("Compiled faction arms carrier is ambiguous");
        }
        Ok(Some(crate::native_operations::NativeFactionBodyBinding {biped_tag_path: tag.path.replace('\\', "/"),
            permutation, index: index as u16, name_index: *name_index as u16, position: object.position, first_person_arms}))
    })
}
fn parse_names(r:&Reader,space:&Space,sc:usize)->Result<Vec<ScenarioLogicName>>{
    let(at,count)=space.block(r,sc+0x204,36,512)?;let mut names=vec![];
    for index in 0..count{let p=at+index*36;names.push(ScenarioLogicName{name:r.string(p,32)?,object_type:r.u16(p+32)? as i16,object_index:r.u16(p+34)? as i16});}Ok(names)
}
/// Named native weapons share the same bounded placement/name decoders.
pub fn scenario_weapon_readback(path:&Path,map:&MapInspection)->Result<(Vec<ScenarioLogicName>,Vec<ScenarioLogicWeapon>)>{
    with_scenario(path,map,|r,space,sc|{
        let names=parse_names(r,space,sc)?;let mut diagnostics=vec![];let placed=placements(r,space,sc,(0x270,0x27c,92,"Weapon"),&map.tags,&mut diagnostics)?;
        if !diagnostics.is_empty(){return invalid("Compiled mission weapon placement/palette is invalid");}
        let(at,_)=space.block(r,sc+0x270,92,4096)?;let mut weapons=vec![];
        for(index,object)in placed.iter().enumerate(){let targets=map.tags.iter().filter(|tag|Some(tag.id)==object.tag_id&&tag.class=="weap").collect::<Vec<_>>();if targets.len()!=1||object.position.iter().any(|v|!v.is_finite()){return invalid("Compiled mission weapon identity or position is invalid");}let p=at+index*92;weapons.push(ScenarioLogicWeapon{index,name_index:r.u16(p+2)? as i16,tag_path:targets[0].path.clone(),not_placed:r.u16(p+4)?});}Ok((names,weapons))
    })
}
fn parse(r:&Reader,space:&Space,sc:usize,tags:&[Tag])->Result<ScenarioLogicReadback>{
    parse_placements(r,space,sc,tags,false)
}
fn parse_placements(r:&Reader,space:&Space,sc:usize,tags:&[Tag],all_vehicles:bool)->Result<ScenarioLogicReadback>{
    let names=parse_names(r,space,sc)?;
    let volumes=parse_volumes(r,space,sc)?;
    let(at,count)=space.block(r,sc+0x288,52,128)?;let mut groups=vec![];
    for index in 0..count{let p=at+index*52;let initial_value=r.f32(p+32)?;
        if !initial_value.is_finite(){return invalid("Compiled device group initial value is not finite");}
        groups.push(ScenarioLogicGroup{name:r.string(p,32)?,initial_value,flags:r.u32(p+36)?});
    }
    let mut devices=vec![];let mut vehicles=vec![];
    let mut blocks=vec![(0x294,0x2a0,64,"mach","Machine"),(0x2ac,0x2b8,64,"ctrl","Control")];
    // Vehicle1 is a standard native object type. Keep unrelated unnamed vehicle
    // inventories outside this optional marker readback; reuse the same decoder.
    if all_vehicles||names.iter().any(|name|name.object_type==1){blocks.push((0x240,0x24c,120,"vehi","Vehicle"));}
    for (offset,palette,stride,class,kind) in blocks {
        // Reuse the editor's native placement decoder; only the reverse name
        // binding is additional metadata absent from SceneObject.
        let mut diagnostics=vec![];
        let placed=placements(r,space,sc,(offset,palette,stride,kind),tags,&mut diagnostics)?;
        if !diagnostics.is_empty(){return invalid("Compiled Logic device placement/palette is invalid; review native diagnostics");}
        let (at,_)=space.block(r,sc+offset,stride,4096)?;
        for (index,object) in placed.into_iter().enumerate(){
            let targets=tags.iter().filter(|tag|Some(tag.id)==object.tag_id&&tag.class==class).collect::<Vec<_>>();
            if targets.len()!=1{return invalid("Compiled Logic device tag identity/class is missing or ambiguous");}
            let placement_at = at + index * stride;
            // Both 64-byte placements keep their class-specific flags after the common device flags.
            let usable_from_both_sides = if class == "ctrl" { Some(r.u32(placement_at + 48)? & 1 != 0) } else { None };
            let manual_activation = if class == "mach" { Some(r.u32(placement_at + 48)? & 1 != 0) } else { None };
            let device_flags = if class != "vehi" { Some(r.u32(placement_at + 44)?) } else { None };
            let interaction_disabled = device_flags.filter(|_| class == "ctrl").map(|flags| flags & (1 << 4) != 0);
            let initially_off = device_flags.map(|flags| flags & (1 << 1) != 0);
            let initially_open = device_flags.map(|flags| flags & 1 != 0);
            let placement=ScenarioLogicDevice{interaction_disabled,manual_activation,initially_off,initially_open,power_group:if class=="vehi"{None}else{Some(r.u16(placement_at+40)? as i16)},position_group:if class=="vehi"{None}else{Some(r.u16(placement_at+42)? as i16)},usable_from_both_sides,class:class.into(),index,name_index:r.u16(placement_at+2)? as i16,
                tag_path:targets[0].path.clone(),position:object.position,rotation_radians:object.rotation};
            if class=="vehi"{vehicles.push(placement);}else{devices.push(placement);}
        }
    }
    Ok(ScenarioLogicReadback{groups,names,devices,vehicles,volumes})
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_camera_cache_offsets_and_bounds_are_independent_of_devices(){
        let mut bytes=vec![0u8;4096];bytes[0x4f0..0x4f4].copy_from_slice(&1u32.to_le_bytes());bytes[0x4f4..0x4f8].copy_from_slice(&0x800u32.to_le_bytes());bytes[0x804..0x809].copy_from_slice(b"intro");for(offset,value)in [(40,1f32),(44,2.),(48,3.),(52,0.5),(56,-0.2),(60,0.1),(64,1.2)]{bytes[0x800+offset..0x804+offset].copy_from_slice(&value.to_le_bytes());}
        let space=Space{begin:0,end:bytes.len(),address:0};let points=parse_cameras(&Reader(&bytes),&space,0).unwrap();assert_eq!(points.len(),1);assert_eq!(points[0].name,"intro");assert_eq!(points[0].position,[1.,2.,3.]);assert_eq!(points[0].orientation_radians,[0.5,-0.2,0.1]);assert_eq!(points[0].fov_radians,1.2);
        bytes[0x4f0..0x4f4].copy_from_slice(&513u32.to_le_bytes());assert!(parse_cameras(&Reader(&bytes),&space,0).is_err());bytes[0x4f0..0x4f4].copy_from_slice(&1u32.to_le_bytes());bytes[0x828..0x82c].copy_from_slice(&f32::NAN.to_le_bytes());assert!(parse_cameras(&Reader(&bytes),&space,0).is_err());
    }
    fn fixture()->(Vec<u8>,Vec<Tag>){
        let mut bytes=vec![0u8;4096];
        let block=|bytes:&mut [u8],at:usize,count:u32,pointer:u32|{bytes[at..at+4].copy_from_slice(&count.to_le_bytes());bytes[at+4..at+8].copy_from_slice(&pointer.to_le_bytes());};
        block(&mut bytes,0x204,1,0x700);bytes[0x700..0x706].copy_from_slice(b"deploy");bytes[0x720..0x722].copy_from_slice(&8u16.to_le_bytes());
        block(&mut bytes,0x360,1,0x800);bytes[0x800..0x802].copy_from_slice(&1u16.to_le_bytes());bytes[0x804..0x807].copy_from_slice(b"hub");
        bytes[0x830..0x834].copy_from_slice(&1f32.to_le_bytes());bytes[0x844..0x848].copy_from_slice(&1f32.to_le_bytes());
        for at in [0x854,0x858,0x85c]{bytes[at..at+4].copy_from_slice(&4f32.to_le_bytes());}
        block(&mut bytes,0x2ac,1,0xa00);block(&mut bytes,0x2b8,1,0xb00);bytes[0xb00..0xb04].copy_from_slice(b"lrtc");bytes[0xb0c..0xb10].copy_from_slice(&12u32.to_le_bytes());
        let tag=serde_json::from_value(serde_json::json!({"id":12,"index":0,"class":"ctrl","path":"devices/terminal","dataOffset":null,"external":false,"fields":[],"references":[]})).unwrap();
        (bytes,vec![tag])
    }
    #[test]
    #[ignore = "Requires an explicitly selected owned/legitimate native map; read-only format acceptance only"]
    fn installed_native_cache_marker_readback_is_read_only(){
        let path=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_LOGIC_CACHE").expect("Explicit native cache required"));
        let before=hash_file(&path).unwrap();let inspection=inspect_map(&path,None).unwrap();
        let read=scenario_logic_readback(&path,&inspection).unwrap();
        assert_eq!(before,hash_file(&path).unwrap());
        if std::env::var_os("SPARK_NATIVE_LOGIC_REQUIRE_MARKERS").is_some(){assert!(!read.names.is_empty()&&!read.devices.is_empty()&&!read.volumes.is_empty(),"Selected campaign cache must exercise actual named devices and volumes");}
        println!("Native marker readback: cacheSHA={before}; version={}; names={}; devices={}; volumes={}; originalUnchanged=true",inspection.header.version,read.names.len(),read.devices.len(),read.volumes.len());
    }
    #[test]
    fn native_marker_layout_reads_basis_names_and_exact_device_reference(){
        let (bytes,tags)=fixture();let space=Space{begin:0,end:bytes.len(),address:0};let read=parse(&Reader(&bytes),&space,0,&tags).unwrap();
        assert_eq!(read.names[0].name,"deploy");assert_eq!(read.names[0].object_type,8);assert_eq!(read.devices[0].tag_path,"devices/terminal");
        assert_eq!(read.volumes[0].name,"hub");assert_eq!(read.volumes[0].geometry.as_ref().unwrap().forward,[1.,0.,0.]);assert_eq!(read.volumes[0].geometry.as_ref().unwrap().up,[0.,0.,1.]);assert_eq!(read.volumes[0].geometry.as_ref().unwrap().dimensions,[4.;3]);
    }
    #[test]
    fn vehicle_name_reverse_binding_uses_native_vehicle_stride_and_palette(){
        let(mut bytes,mut tags)=fixture();
        bytes[0x204..0x208].copy_from_slice(&2u32.to_le_bytes());bytes[0x724..0x736].copy_from_slice(b"extraction_pelican");bytes[0x744..0x746].copy_from_slice(&1u16.to_le_bytes());
        for(at,pointer)in[(0x240,0xc00u32),(0x24c,0xd00u32)]{bytes[at..at+4].copy_from_slice(&1u32.to_le_bytes());bytes[at+4..at+8].copy_from_slice(&pointer.to_le_bytes());}
        bytes[0xc02..0xc04].copy_from_slice(&1u16.to_le_bytes());bytes[0xc08..0xc0c].copy_from_slice(&4f32.to_le_bytes());bytes[0xd00..0xd04].copy_from_slice(b"ihev");bytes[0xd0c..0xd10].copy_from_slice(&13u32.to_le_bytes());
        let mut tag=tags[0].clone();tag.id=13;tag.class="vehi".into();tag.path="vehicles/pelican/pelican".into();tags.push(tag);
        let space=Space{begin:0,end:bytes.len(),address:0};let read=parse(&Reader(&bytes),&space,0,&tags).unwrap();assert_eq!(read.devices.len(),1);assert_eq!(read.vehicles.len(),1);assert_eq!(read.vehicles[0].name_index,1);assert_eq!(read.vehicles[0].tag_path,"vehicles/pelican/pelican");assert_eq!(read.vehicles[0].position,[4.,0.,0.]);assert_eq!(read.names[1].object_type,1);
        bytes[0xc00..0xc02].copy_from_slice(&1u16.to_le_bytes());assert!(parse(&Reader(&bytes),&space,0,&tags).is_err());
    }
    #[test]
    fn full_placement_readback_includes_unnamed_vehicles_without_broadening_marker_checks(){
        let(mut bytes,mut tags)=fixture();for(at,pointer)in[(0x240,0xc00u32),(0x24c,0xd00u32)]{bytes[at..at+4].copy_from_slice(&1u32.to_le_bytes());bytes[at+4..at+8].copy_from_slice(&pointer.to_le_bytes());}
        bytes[0xc02..0xc04].copy_from_slice(&u16::MAX.to_le_bytes());bytes[0xc08..0xc0c].copy_from_slice(&4f32.to_le_bytes());bytes[0xd00..0xd04].copy_from_slice(b"ihev");bytes[0xd0c..0xd10].copy_from_slice(&13u32.to_le_bytes());
        let mut tag=tags[0].clone();tag.id=13;tag.class="vehi".into();tag.path="vehicles/pelican/pelican".into();tags.push(tag);
        let space=Space{begin:0,end:bytes.len(),address:0};assert!(parse(&Reader(&bytes),&space,0,&tags).unwrap().vehicles.is_empty());
        let read=parse_placements(&Reader(&bytes),&space,0,&tags,true).unwrap();assert_eq!(read.vehicles.len(),1);assert_eq!(read.vehicles[0].name_index,-1);assert_eq!(read.vehicles[0].position,[4.,0.,0.]);
        bytes[0xc00..0xc02].copy_from_slice(&1u16.to_le_bytes());assert!(parse_placements(&Reader(&bytes),&space,0,&tags,true).is_err());
    }
    #[test]
    fn native_device_groups_read_real_initial_values_and_device_aliases(){
        let(mut bytes,tags)=fixture();bytes[0x288..0x28c].copy_from_slice(&2u32.to_le_bytes());bytes[0x28c..0x290].copy_from_slice(&0xe00u32.to_le_bytes());
        bytes[0xe00..0xe1a].copy_from_slice(b"extraction_pelican_boarded");bytes[0xe34..0xe4d].copy_from_slice(b"extraction_pelican_called");
        bytes[0xa28..0xa2a].copy_from_slice(&1u16.to_le_bytes());bytes[0xa2a..0xa2c].copy_from_slice(&u16::MAX.to_le_bytes());
        let space=Space{begin:0,end:bytes.len(),address:0};let read=parse(&Reader(&bytes),&space,0,&tags).unwrap();assert_eq!(read.groups.len(),2);assert_eq!(read.groups[0].name,"extraction_pelican_boarded");assert_eq!(read.groups[1].initial_value,0.);assert_eq!(read.groups[0].flags,0);assert_eq!(read.devices[0].power_group,Some(1));assert_eq!(read.devices[0].position_group,Some(-1));
        bytes[0xe20..0xe24].copy_from_slice(&f32::NAN.to_le_bytes());assert!(parse(&Reader(&bytes),&space,0,&tags).is_err());bytes[0xe20..0xe24].copy_from_slice(&0f32.to_le_bytes());bytes[0x288..0x28c].copy_from_slice(&129u32.to_le_bytes());assert!(parse(&Reader(&bytes),&space,0,&tags).is_err());
    }
    #[test]
    fn axis_aligned_union_does_not_expose_unused_oriented_basis(){
        let (mut bytes,tags)=fixture();bytes[0x800..0x802].copy_from_slice(&0u16.to_le_bytes());
        bytes[0x830..0x834].copy_from_slice(&f32::NAN.to_le_bytes());
        let space=Space{begin:0,end:bytes.len(),address:0};
        let read=parse(&Reader(&bytes),&space,0,&tags).unwrap();assert!(read.volumes[0].geometry.is_none());
    }
    #[test]
    fn malformed_native_marker_pointers_types_and_tags_are_refused(){
        let (bytes,tags)=fixture();let space=Space{begin:0,end:bytes.len(),address:0};
        let mut broken=bytes.clone();broken[0x364..0x368].copy_from_slice(&4090u32.to_le_bytes());assert!(parse(&Reader(&broken),&space,0,&tags).is_err());
        let mut broken=bytes.clone();broken[0x800..0x802].copy_from_slice(&9u16.to_le_bytes());assert!(parse(&Reader(&broken),&space,0,&tags).is_err());
        let mut broken=bytes.clone();broken[0xa00..0xa02].copy_from_slice(&1u16.to_le_bytes());assert!(parse(&Reader(&broken),&space,0,&tags).is_err());
        let mut broken=bytes;broken[0xb0c..0xb10].copy_from_slice(&99u32.to_le_bytes());assert!(parse(&Reader(&broken),&space,0,&tags).is_err());
    }
}

/// Standard H1 command-list block (scenario+0x438); fixed-layout native data.
/// Runtime-generated BSP/surface cache fields are deliberately not source edits.
pub fn scenario_command_readback(path:&Path,inspection:&MapInspection)->Result<Vec<crate::native_operations::NativeCommandList>>{with_scenario(path,inspection,parse_commands)}
fn parse_commands(r:&Reader,space:&Space,sc:usize)->Result<Vec<crate::native_operations::NativeCommandList>>{
 use crate::native_operations::{NativeCommandList,NativeCommand};
 let(at,n)=space.block(r,sc+0x438,96,256)?;let mut lists=vec![];
 for index in 0..n{let p=at+index*96;let bits=r.u32(p+32)?;if bits&!63!=0{return invalid("Compiled command list has unknown flags");}let(c,cn)=space.block(r,p+48,32,64)?;let(points,pn)=space.block(r,p+60,20,64)?;let mut commands=vec![];
  for i in 0..cn{let a=c+i*32;let atom=crate::native_operations::COMMAND_ATOMS.get(r.u16(a)? as usize).ok_or_else(||SparkError::Invalid("Compiled command action unsupported".into()))?;commands.push(NativeCommand{atom:(*atom).into(),modifier:r.u16(a+2)? as i16,parameters:[r.f32(a+4)?,r.f32(a+8)?],point1:r.u16(a+12)? as i16,point2:r.u16(a+14)? as i16,animation:r.u16(a+16)? as i16,script:r.u16(a+18)? as i16,recording:r.u16(a+20)? as i16,command:r.u16(a+22)? as i16,object_name:r.u16(a+24)? as i16});}
  let mut positions=vec![];for i in 0..pn{positions.push(vec3(r,points+i*20)?);}let list=NativeCommandList{index:index as u16,name:r.string(p,32)?,flags:std::array::from_fn(|i|bits&(1<<i)!=0),bsp:r.u16(p+44)? as i16,commands,points:positions};list.validate()?;lists.push(list);
 }Ok(lists)
}

#[cfg(test)]mod command_tests{
 use super::*;
 #[test]fn native_command_cache_uses_bounded_actions_parameters_references_and_points(){
  let mut bytes=vec![0u8;4096];for(at,value)in [(0x438,1u32),(0x43c,0x800),(0x830,1),(0x834,0x900),(0x83c,1),(0x840,0xa00)]{bytes[at..at+4].copy_from_slice(&value.to_le_bytes());}bytes[0x800..0x805].copy_from_slice(b"route");bytes[0x82c..0x82e].copy_from_slice(&65535u16.to_le_bytes());bytes[0x900..0x902].copy_from_slice(&1u16.to_le_bytes());for at in [0x90e,0x910,0x912,0x914,0x916,0x918]{bytes[at..at+2].copy_from_slice(&65535u16.to_le_bytes());}bytes[0x904..0x908].copy_from_slice(&1.25f32.to_le_bytes());for(i,n)in [1f32,2.,3.].into_iter().enumerate(){bytes[0xa00+i*4..0xa04+i*4].copy_from_slice(&n.to_le_bytes());}let space=Space{begin:0,end:bytes.len(),address:0};let read=parse_commands(&Reader(&bytes),&space,0).unwrap();assert_eq!(read[0].commands[0].atom,"go_to");assert_eq!(read[0].commands[0].parameters,[1.25,0.]);assert_eq!(read[0].commands[0].point1,0);assert_eq!(read[0].points,[[1.,2.,3.]]);
  let mut bad=bytes.clone();bad[0x900..0x902].copy_from_slice(&28u16.to_le_bytes());assert!(parse_commands(&Reader(&bad),&space,0).is_err());bad=bytes.clone();bad[0x834..0x838].copy_from_slice(&4090u32.to_le_bytes());assert!(parse_commands(&Reader(&bad),&space,0).is_err());bad=bytes.clone();bad[0x90c..0x90e].copy_from_slice(&1u16.to_le_bytes());assert!(parse_commands(&Reader(&bad),&space,0).is_err());bad=bytes;bad[0xa00..0xa04].copy_from_slice(&f32::NAN.to_le_bytes());assert!(parse_commands(&Reader(&bad),&space,0).is_err());
 }
}
