//! Standard H1 scenario marker layout, using the existing bounded cache reader.
//! Native interface data only; no Forerunner engine implementation is included.
use super::*;
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct ScenarioLogicName {pub name:String,pub object_type:i16,pub object_index:i16}
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct ScenarioLogicDevice {pub class:String,pub index:usize,pub name_index:i16,pub tag_path:String,pub position:[f32;3]}
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
pub struct ScenarioLogicReadback {pub names:Vec<ScenarioLogicName>,pub devices:Vec<ScenarioLogicDevice>,pub volumes:Vec<ScenarioLogicVolume>}
/// Matches the exact previously inspected cache, never a source tag or sidecar.
pub fn scenario_logic_readback(path:&Path,inspection:&MapInspection)->Result<ScenarioLogicReadback> {
    with_scenario(path,inspection,|r,space,at|parse(r,space,at,&inspection.tags))
}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct NativeCameraPoint {pub index:u16,pub name:String,pub position:[f32;3],pub orientation_radians:[f32;3],pub fov_radians:f32}
/// Cutscene camera points use the standard104-byte H1 scenario structure.
/// Read only the requested block; unrelated device data is not camera evidence.
pub fn scenario_camera_readback(path:&Path,inspection:&MapInspection)->Result<Vec<NativeCameraPoint>> {
    with_scenario(path,inspection,parse_cameras)
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
fn parse(r:&Reader,space:&Space,sc:usize,tags:&[Tag])->Result<ScenarioLogicReadback>{
    let (at,count)=space.block(r,sc+0x204,36,512)?;let mut names=vec![];
    for index in 0..count {let p=at+index*36;names.push(ScenarioLogicName{name:r.string(p,32)?,object_type:r.u16(p+32)? as i16,object_index:r.u16(p+34)? as i16});}
    let volumes=parse_volumes(r,space,sc)?;
    let mut devices=vec![];
    for (offset,palette,class,kind) in [(0x294,0x2a0,"mach","Machine"),(0x2ac,0x2b8,"ctrl","Control")] {
        // Reuse the editor's native placement decoder; only the reverse name
        // binding is additional metadata absent from SceneObject.
        let mut diagnostics=vec![];
        let placed=placements(r,space,sc,(offset,palette,64,kind),tags,&mut diagnostics)?;
        if !diagnostics.is_empty(){return invalid("Compiled Logic device placement/palette is invalid; review native diagnostics");}
        let (at,_)=space.block(r,sc+offset,64,4096)?;
        for (index,object) in placed.into_iter().enumerate(){
            let targets=tags.iter().filter(|tag|Some(tag.id)==object.tag_id&&tag.class==class).collect::<Vec<_>>();
            if targets.len()!=1{return invalid("Compiled Logic device tag identity/class is missing or ambiguous");}
            devices.push(ScenarioLogicDevice{class:class.into(),index,name_index:r.u16(at+index*64+2)? as i16,
                tag_path:targets[0].path.clone(),position:object.position});
        }
    }
    Ok(ScenarioLogicReadback{names,devices,volumes})
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
