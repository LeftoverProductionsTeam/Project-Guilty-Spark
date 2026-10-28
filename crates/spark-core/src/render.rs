//! Bounded, read-only preview geometry for classic Halo CE PC-family caches.
//!
//! The layout is independently implemented from published tag structure and
//! cache documentation (see docs/LIVING_RENDER_ENGINEERING.md). This is not a
//! general tag converter. It never mutates original maps, never fabricates
//! surfaces, and deliberately rejects unsupported layouts.
use crate::{
    binary::Reader,
    invalid,
    maps::{MapHeader, MeshData, MeshPart, MeshMaterialRange, SceneObject, Tag},
    Result,
};
use std::collections::{HashMap, HashSet};

const MAX_BSP_VERTICES: usize = 500_000;
const MAX_MODEL_VERTICES: usize = 350_000;
const MAX_PREVIEW_INDICES: usize = 1_500_000;
const MAX_MODEL_TYPES: usize = 128;

// Memory addressing for a compiled tag region or loaded BSP. Never accept a
// pointer simply because it is numerically within the whole file.
#[derive(Clone, Copy)]
struct Region {
    begin: usize,
    end: usize,
    address: u32,
}
impl Region {
    fn pointer(self, raw: u32, len: usize) -> Result<usize> {
        let delta = raw.checked_sub(self.address).ok_or_else(|| {
            crate::SparkError::Invalid(format!("Pointer 0x{raw:08X} precedes its region"))
        })? as usize;
        let at = self.begin.checked_add(delta).ok_or_else(|| {
            crate::SparkError::Invalid("Pointer offset overflow".into())
        })?;
        if at.checked_add(len).is_none_or(|end| end > self.end) {
            return invalid(format!("Pointer 0x{raw:08X} escapes bounded region"));
        }
        Ok(at)
    }
    fn block(self, r: &Reader, at: usize, stride: usize, limit: usize) -> Result<(usize, usize)> {
        let count = r.u32(at)? as usize;
        if count > limit { return invalid("Reflexive count exceeds preview safety bound"); }
        if count == 0 { return Ok((0, 0)); }
        let size = count.checked_mul(stride).ok_or_else(|| {
            crate::SparkError::Invalid("Reflexive byte count overflow".into())
        })?;
        let start = self.pointer(r.u32(at+4)?, size)?;
        r.bytes(start, size)?;
        Ok((start,count))
    }
}

fn tag_space(r: &Reader, header: &MapHeader) -> Result<Region> {
    let begin = header.tag_offset as usize;
    let end = begin.checked_add(header.tag_size as usize).ok_or_else(|| {
        crate::SparkError::Invalid("Tag region overflow".into())
    })?;
    r.bytes(begin, header.tag_size as usize)?;
    let address = match header.version {
        6 => 0x4bf1_0000,
        7 | 609 => 0x4044_0000,
        13 => r.u32(begin)?.checked_sub(0x28).ok_or_else(|| {
            crate::SparkError::Invalid("Invalid MCC tag base".into())
        })?,
        5 => 0x803a_6000,
        _ => return invalid("Unsupported tag address mapping"),
    };
    Ok(Region {begin,end,address})
}

fn scene_bsps(r: &Reader, tag_region: Region, scenario_at: usize) -> Result<Vec<(Region, String, usize)>> {
    let (array,count) = tag_region.block(r, scenario_at + 0x5a4, 32, 16)?;
    let mut found = Vec::new();
    for i in 0..count {
        let row = array + i*32;
        let begin = r.u32(row)? as usize;
        let size = r.u32(row+4)? as usize;
        let address = r.u32(row+8)?;
        if size < 24 || size > 128*1024*1024 { return invalid("Invalid BSP region length"); }
        r.bytes(begin,size)?;
        let end = begin.checked_add(size).ok_or_else(|| crate::SparkError::Invalid("BSP end overflow".into()))?;
        let region = Region {begin,end,address};
        let base = region.pointer(r.u32(begin)?,648)?;
        found.push((region,format!("BSP {}",i+1),base));
    }
    Ok(found)
}

/// Render triangles from material vertex streams, independent of collision BSP.
/// Limited to uncompressed rendered vertices of PC-derived caches. This is
/// actual geometry, but the accompanying Halo shaders/bitmaps still need a
/// separate material pipeline. Never label the result game-textured.
pub fn bsp_render_geometry(bytes: &[u8], header: &MapHeader, scenario_at: usize) -> Result<MeshData> {
    bsp_render_geometry_selected(bytes,header,scenario_at,None)
}
pub(crate) fn bsp_render_geometry_selected(bytes:&[u8],header:&MapHeader,scenario_at:usize,selected:Option<usize>)->Result<MeshData>{
    if !matches!(header.version,6|7|13|609) {return invalid("Render BSP preview requires a supported PC-derived cache layout");}
    let r = Reader(bytes);
    let tags = tag_space(&r,header)?;
    let bsps = scene_bsps(&r,tags,scenario_at)?;
    let mut mesh = MeshData {label:"Imported BSP render surfaces (materials pending)".into(), source:"halo-render-untextured".into(),..Default::default()};
    for (bsp_index,(region,name,bsp)) in bsps.into_iter().enumerate() {
        if selected.is_some_and(|wanted|wanted!=bsp_index){continue;}
        let first_index=mesh.indices.len();
        // The H1 sbsp body begins with a 16-byte TagDependency whose datum
        // is at +12. Preserve only a structurally valid *candidate* ID;
        // the client independently checks the exact source tag table for
        // class=bitm before treating it as a texture. Never infer a tag ID
        // from the lightmap page number or from a neighbouring BSP.
        let lightmap_bitmap_tag_id = if r.fourcc(bsp)? == "bitm" {
            let id = r.u32(bsp + 12)?;
            (id != u32::MAX).then_some(id)
        } else { None };
        // scenario_structure_bsp.surfaces and .lightmaps
        let (surfaces, surface_count)=region.block(&r,bsp+0xf8,6,500_000)?;
        let (lightmaps, lightmap_count)=region.block(&r,bsp+0x104,32,256)?;
        for l in 0..lightmap_count {
            let lightmap=lightmaps + l*32;
            // Halo 1 BSP lightmap page is a signed 16-bit index; -1 is unlit.
            let lightmap_page=(r.u16(lightmap)? as i16) as i32;
            let (materials,material_count)=region.block(&r,lightmap+20,256,2048)?;
            for m in 0..material_count {
                let material=materials + m*256;
                // TagDependency.datum at +12. Reference is immutable provenance.
                let shader_tag_id=r.u32(material+12)?;
                let material_index_start=mesh.indices.len();
                // Material surface_start/count are signed, but the valid range is nonnegative.
                let start=r.u32(material+20)? as usize;
                let count=r.u32(material+24)? as usize;
                let vertex_type=r.u16(material+176)?;
                let vertices=r.u32(material+180)? as usize;
                if count == 0 || vertices == 0 {continue;}
                if vertex_type != 0 {continue;} // compressed vertex streams remain unsupported
                if start.checked_add(count).is_none_or(|end|end>surface_count) {
                    return invalid("BSP material references surfaces outside the BSP surface block");
                }
                if vertices > 100_000 || mesh.positions.len()/3+vertices>MAX_BSP_VERTICES {
                    return invalid("BSP render vertex safety limit exceeded");
                }
                // TagDataOffset: size, external, file offset, cached pointer data.
                let required=vertices.checked_mul(56).ok_or_else(||crate::SparkError::Invalid("Vertex byte count overflow".into()))?;
                let (vertex_at,lightmap_at)=if header.version==13 {
                    // MCC separates the uncompressed vertex pool from BSP metadata.
                    // Its BSP header stores pool byte length +4 and file offset +8;
                    // material +184/+204 are offsets into that one bounded pool.
                    let pool_length=r.u32(region.begin+4)? as usize;
                    let pool_offset=r.u32(region.begin+8)? as usize;
                    if pool_length>128*1024*1024||pool_offset<2048||pool_offset.checked_add(pool_length).is_none_or(|end|end>region.begin){return invalid("MCC BSP vertex pool escapes its separate raw-data region");}
                    r.bytes(pool_offset,pool_length)?;
                    let offset=r.u32(material+184)? as usize;
                    if offset.checked_add(required).is_none_or(|end|end>pool_length){return invalid("MCC BSP vertices escape the declared raw pool");}
                    let lm_count=r.u32(material+200)? as usize;let lm_offset=r.u32(material+204)? as usize;
                    let lm=if lm_count==vertices&&lm_offset.checked_add(vertices*20).is_some_and(|end|end<=pool_length){Some(pool_offset+lm_offset)}else{None};
                    (pool_offset+offset,lm)
                }else{
                    let data_length=r.u32(material+216)? as usize;
                    if data_length < required {return invalid("Uncompressed BSP vertex data is shorter than the declared vertex array");}
                // In Gearbox PC-family compiled BSPs, TagDataOffset.file_offset
                // is NOT a directly readable byte offset into the map.  The
                // adjacent cached vertex pointer identifies a location inside
                // this BSP's own bounded memory-addressed region. Reading the
                // untrusted file_offset produced triangle/index bytes as
                // absurd float positions in the prior implementation.
                //
                // Verified on the user's original Demo Blood Gulch: all 79
                // material streams validate with this region-mapped pointer,
                // totaling 5,762 vertices and 5,503 rendered triangles.
                    let vertex_pointer=r.u32(material+228)?;let at=region.pointer(vertex_pointer,required)?;
                    let lm=vertices.checked_mul(20).and_then(|extra|required.checked_add(extra)).filter(|total|*total<=data_length).and_then(|total|region.pointer(vertex_pointer,total).ok()).map(|at|at+required);
                    (at,lm)
                };
                let data=r.bytes(vertex_at,required)?;
                let raw=Reader(data);
                // Published H1 BSP material layout: uncompressed render vertices
                // (56 bytes each), followed by lightmap vertices (20 bytes each).
                // A lightmap vertex contains an incident-radiosity vector and
                // two f32 UVs at byte offsets +12/+16. Only trust this stream
                // when the material declares enough raw bytes and its *BSP-
                // relative* pointer bounds-checks. Unavailable or malformed
                // secondary UVs are never represented as actual lightmap data.
                let lightmap_values = if lightmap_page >= 0 {
                    lightmap_at.and_then(|at|r.bytes(at,vertices*20).ok())
                        .and_then(|bytes| {
                            let lm=Reader(bytes);
                            let mut values=Vec::with_capacity(vertices*2);
                            for vertex in 0..vertices {
                                let at=vertex*20;
                                let u=lm.f32(at+12).ok()?;
                                let v=lm.f32(at+16).ok()?;
                                if !u.is_finite() || !v.is_finite() || u.abs()>32.0 || v.abs()>32.0 {return None;}
                                values.extend_from_slice(&[u,v]);
                            }
                            Some(values)
                        })
                } else { None };
                let has_lightmap_uvs=lightmap_values.is_some();
                mesh.lightmap_uvs.extend(lightmap_values.unwrap_or_else(||vec![0.0; vertices*2]));
                let base=(mesh.positions.len()/3) as u32;
                for v in 0..vertices {
                    let p = v * 56;
                    let position = [raw.f32(p)?, raw.f32(p + 4)?, raw.f32(p + 8)?];
                    let normal = [raw.f32(p + 12)?, raw.f32(p + 16)?, raw.f32(p + 20)?];
                    let uv = [raw.f32(p + 48)?, raw.f32(p + 52)?];
                    // A map's raw-data pointer may be unsupported even when it
                    // happens to fall inside the file. Checking only finite
                    // floats would mistake index strips for rendered vertices.
                    let normal_length_sq = normal.iter().map(|x| (*x) * (*x)).sum::<f32>();
                    if position.iter().any(|x| x.abs() > 5000.0)
                        || !(0.5..=1.5).contains(&normal_length_sq)
                        || uv.iter().any(|x| x.abs() > 10_000.0)
                    {
                        return invalid("BSP render vertex stream is not validated for this cache; refusing to display potentially corrupted geometry");
                    }
                    mesh.positions.extend_from_slice(&position);
                    mesh.normals.extend_from_slice(&normal);
                    mesh.uvs.extend_from_slice(&uv);
                }
                for index in start..start+count {
                    let face=surfaces+index*6;
                    let triangle=[r.u16(face)? as usize,r.u16(face+2)? as usize,r.u16(face+4)? as usize];
                    if triangle.iter().any(|v| *v>=vertices) {
                        return invalid("BSP render surface contains a vertex index outside its material vertex array");
                    }
                    mesh.indices.extend_from_slice(&[base+triangle[0] as u32,base+triangle[1] as u32,base+triangle[2] as u32]);
                    if mesh.indices.len()>MAX_PREVIEW_INDICES {return invalid("BSP preview index safety limit exceeded");}
                }
                if mesh.indices.len() > material_index_start {
                    mesh.material_ranges.push(MeshMaterialRange {
                        shader_tag_id, bsp_index, lightmap_index:l,lightmap_page,has_lightmap_uvs,
                        lightmap_bitmap_tag_id,
                        index_start:material_index_start,
                        index_count:mesh.indices.len()-material_index_start,
                    });
                }
            }
        }
        mesh.parts.push(MeshPart{name,index_start:first_index,index_count:mesh.indices.len()-first_index});
    }
    if mesh.indices.is_empty() {return invalid("No supported uncompressed BSP render triangles in this cache; collision preview remains available");}
    Ok(mesh)
}

/// Reject unsafe coordinates/NaNs before handing cached model bytes to WebGL.
fn finite_model_float(r:&Reader, at:usize) -> Result<f32> {
    let value=r.f32(at)?;
    if !value.is_finite() || value.abs()>1_000_000.0 {
        return invalid("Cached model contains non-finite or unreasonable vertex data");
    }
    Ok(value)
}

// PC/Demo Gearbox model geometry is in a separate raw vertex/index region.
// Model geometry is displayed in cached bind-pose coordinates. A multi-node
// preview is diagnostic only; bone transforms/animations are NOT reconstructed.
fn gbxmodel_static_mesh(r: &Reader, region: Region, model_at: usize, raw_start:usize, raw_vertex_size:usize, raw_model_size:usize) -> Result<MeshData> {
    r.bytes(model_at,232)?;
    let (nodes,node_count)=region.block(r,model_at+184,156,64)?;
    let (geometries,n_geometries)=region.block(r,model_at+208,48,256)?;
    let (shaders,n_shaders)=region.block(r,model_at+220,32,32)?;
    if n_geometries==0 {return invalid("Model contains no geometry");}
    // Pick the first region's first valid LOD, without stacking all LODs.
    let (regions,n_regions)=region.block(r,model_at+196,76,32)?;
    let mut selected=HashSet::new();
    for i in 0..n_regions {
        let (perms,n)=region.block(r,regions+i*76+64,88,32)?;
        if n==0 {continue;}
        let perm=perms;
        // Offsets 64..72 are superlow, low, medium, high, superhigh.
        for off in [72,70,68,66,64] {
            let idx=r.u16(perm+off)? as usize;
            if idx<n_geometries { selected.insert(idx); break; }
        }
    }
    if selected.is_empty() {selected.insert(0);}
    let label = if node_count>1 {"Halo CE gbxmodel bind-pose (skeletal animation not applied)"} else {"Halo CE gbxmodel static preview"};
    let mut mesh=MeshData{label:label.into(),source:"halo-model-untextured".into(),..Default::default()};
    let mut rig=(||->Result<crate::maps::ModelRig>{let mut bones=vec![];
        for i in 0..node_count{let at=nodes+i*156;let parent=r.u16(at+36)? as i16;if parent< -1||parent as isize>=node_count as isize||parent==i as i16{return invalid("Model skeleton parent is invalid");}
            let position=[r.f32(at+40)?,r.f32(at+44)?,r.f32(at+48)?];let rotation=[r.f32(at+52)?,r.f32(at+56)?,r.f32(at+60)?,r.f32(at+64)?];let length=rotation.iter().map(|v|v*v).sum::<f32>();if !(0.9..=1.1).contains(&length){return invalid("Model skeleton rotation is invalid");}
            bones.push(crate::maps::ModelBone{name:r.string(at,32)?,parent,position,rotation});
        }if bones.is_empty(){return invalid("Model skeleton unavailable");}
        for bone in &bones{let mut p=bone.parent;for depth in 0..=node_count{if p<0{break;}if depth==node_count{return invalid("Model skeleton contains a cycle");}p=bones[p as usize].parent;}}
        Ok(crate::maps::ModelRig{checksum:r.u32(model_at+4)?,nodes:bones,indices:vec![],weights:vec![]})})().ok();
    let local_nodes=r.u32(model_at)?&2!=0;
    let mut geometry_ids=selected.into_iter().collect::<Vec<_>>(); geometry_ids.sort_unstable();
    for idx in geometry_ids {
        let g=geometries+idx*48;
        let (parts,n_parts)=region.block(r,g+36,132,32)?;
        for p in 0..n_parts {
            let part=parts+p*132;
            let triangle_count=r.u32(part+72)? as usize;
            let triangle_offset=r.u32(part+76)? as usize;
            let vertex_count=r.u32(part+88)? as usize;
            // The PC cache part stores a transient vertex *pointer* at +96 and
            // a file-relative vertex *offset* at +100. Using the pointer as
            // an offset silently hid every real scenery model behind a diamond.
            // Confirmed against the user-supplied Halo Demo Blood Gulch cache:
            // 30 of 35 scenery tag models have bounded single-node meshes.
            let vertex_offset=r.u32(part+100)? as usize;
            if triangle_count==0 || vertex_count==0 {continue;}
            if vertex_count>65_535 || triangle_count>131_072 || mesh.positions.len()/3+vertex_count>MAX_MODEL_VERTICES {
                return invalid("GBX model exceeds bounded preview geometry limits");
            }
            let vertex_bytes=vertex_count.checked_mul(68).ok_or_else(||crate::SparkError::Invalid("Model vertex byte count overflow".into()))?;
            let vertex_end=vertex_offset.checked_add(vertex_bytes).ok_or_else(||crate::SparkError::Invalid("Model vertex offset overflow".into()))?;
            if vertex_end>raw_vertex_size {return invalid("Model part vertices escape the cache model vertex region");}
            let at=raw_start.checked_add(vertex_offset).ok_or_else(||crate::SparkError::Invalid("Model vertex file offset overflow".into()))?;
            let verts=Reader(r.bytes(at,vertex_bytes)?);
            let base=(mesh.positions.len()/3) as u32;
            for i in 0..vertex_count {
                let v=i*68;
                for off in [0,4,8] {mesh.positions.push(finite_model_float(&verts,v+off)?);}
                for off in [12,16,20] {mesh.normals.push(finite_model_float(&verts,v+off)?);}
                for off in [48,52] {mesh.uvs.push(finite_model_float(&verts,v+off)?);}
                if let Some(skeleton)=rig.as_mut(){let mut ids=[verts.u16(v+56)?,verts.u16(v+58)?];let mut weights=[verts.f32(v+60).unwrap_or(-1.),verts.f32(v+64).unwrap_or(-1.)];
                    if local_nodes{let count=r.bytes(part+107,1)?[0]as usize;for id in &mut ids{if *id!=u16::MAX{*id=if (*id as usize)<count&&count<=22{r.bytes(part+108+*id as usize,1)?[0]as u16}else{u16::MAX};}}}
                    for j in 0..2{if ids[j]==u16::MAX&&weights[j].abs()<0.001{ids[j]=0;weights[j]=0.;}}
                    let sum=weights[0]+weights[1];if ids.iter().any(|id|*id as usize>=node_count)||weights.iter().any(|w|!w.is_finite()||*w<0.||*w>1.001)||!(0.99..=1.01).contains(&sum){rig=None;}else{skeleton.indices.extend(ids);skeleton.weights.extend(weights.map(|w|w/sum));}
                }
            }
            // The cache stores triangle strips. Indices start after the model
            // vertex region and may include degenerate triangles and 0xFFFF.
            let index_start=raw_start.checked_add(raw_vertex_size).and_then(|v|v.checked_add(triangle_offset)).ok_or_else(||crate::SparkError::Invalid("Model triangle offset overflow".into()))?;
            let count=triangle_count.checked_add(2).ok_or_else(||crate::SparkError::Invalid("Model index count overflow".into()))?;
            let index_bytes=count.checked_mul(2).ok_or_else(||crate::SparkError::Invalid("Model strip byte count overflow".into()))?;
            if raw_vertex_size.checked_add(triangle_offset).and_then(|v|v.checked_add(index_bytes)).is_none_or(|end|end>raw_model_size) {
                return invalid("Model indices escape the bounded cache model data region");
            }
            let raw=Reader(r.bytes(index_start,index_bytes)?);
            let first_index = mesh.indices.len();
            // A PC gbxmodel part stores a triangle strip. Degenerate triangles
            // stitch neighboring strips; 0xFFFF explicitly restarts one. Do
            // not connect triangles across a restart or carry winding parity.
            let mut previous: [u16; 2] = [0, 0];
            let mut valid_previous = 0usize;
            let mut parity = 0usize;
            for i in 0..count {
                let c = raw.u16(i * 2)?;
                if c == u16::MAX {
                    valid_previous = 0;
                    parity = 0;
                    continue;
                }
                if c as usize >= vertex_count {
                    return invalid("Model triangle references an out-of-range vertex");
                }
                if valid_previous == 2 {
                    let [a, b] = previous;
                    if a != b && b != c && a != c {
                        let tri = if parity % 2 == 0 { [a, b, c] } else { [b, a, c] };
                        mesh.indices.extend_from_slice(&[
                            base + tri[0] as u32,
                            base + tri[1] as u32,
                            base + tri[2] as u32,
                        ]);
                        if mesh.indices.len() > MAX_PREVIEW_INDICES {
                            return invalid("Model preview exceeds index safety limit");
                        }
                    }
                    parity += 1;
                } else {
                    valid_previous += 1;
                }
                previous = [previous[1], c];
            }
            if mesh.indices.len() > first_index {
                // GBX ModelGeometryPart shader_index (+4) indexes 32-byte
                // ModelShaderReference entries. Preserve per-part identity.
                let shader_index=r.u16(part+4)? as usize;
                if shader_index<n_shaders {
                    let reference=shaders+shader_index*32;
                    let class=r.fourcc(reference)?;
                    let datum=r.u32(reference+12)?;
                    if datum!=u32::MAX && matches!(class.as_str(),"senv"|"soso"|"schi"|"scex"|"sotr"|"sgla"|"swat"|"spla") {
                        mesh.material_ranges.push(MeshMaterialRange{shader_tag_id:datum,bsp_index:0,
                            lightmap_index:0,lightmap_page:-1,has_lightmap_uvs:false,lightmap_bitmap_tag_id:None,
                            index_start:first_index,index_count:mesh.indices.len()-first_index});
                    }
                }
                mesh.parts.push(MeshPart {
                    name: format!("Geometry {} / part {}", idx + 1, p + 1),
                    index_start: first_index,
                    index_count: mesh.indices.len() - first_index,
                });
            }
        }
    }
    if mesh.indices.is_empty() {return invalid("No supported static GBX model triangles");}
    mesh.rig=rig;
    Ok(mesh)
}

/// Returns successful unique static scenery/vehicle models keyed by the
/// placement's object tag ID, and diagnostic detail for unsupported models.
pub fn static_object_models(bytes: &[u8], header: &MapHeader, tags: &[Tag], objects: &[SceneObject]) -> (HashMap<u32,MeshData>,Vec<String>) {
    if !matches!(header.version,6|7|13|609) {
        return (HashMap::new(),vec!["Static object preview requires a supported PC-derived cache; unsupported models are not drawn".into()]);
    }
    let r=Reader(bytes);
    let region=match tag_space(&r,header){Ok(r)=>r,Err(e)=>return (HashMap::new(),vec![e.to_string()])};
    let mut models=HashMap::new();
    let mut notes=Vec::new();
    let mut processed=HashSet::new();
    let mut tag_lookup=HashMap::new();
    for t in tags {tag_lookup.insert(t.id,t);}
    let map_start=header.tag_offset as usize;
    let raw_start=match r.u32(map_start+20) {Ok(v)=>v as usize,Err(e)=>return (models,vec![e.to_string()])};
    let raw_vertex_size=match r.u32(map_start+28) {Ok(v)=>v as usize,Err(e)=>return (models,vec![e.to_string()])};
    let raw_model_size=match r.u32(map_start+32) {Ok(v)=>v as usize,Err(e)=>return (models,vec![e.to_string()])};
    if raw_vertex_size>raw_model_size || raw_start.checked_add(raw_model_size).is_none_or(|end|end>bytes.len()) {
        return (models,vec!["Model vertex/index data is outside the bounded cache region".into()]);
    }
    let requested=objects.iter().filter(|o|matches!(o.kind.as_str(),"Scenery"|"Vehicle"|"Equipment"|"Weapon"|"Biped"|"Netgame item")).filter_map(|o|o.tag_id)
        .chain(tags.iter().filter(|t|matches!(t.class.as_str(),"scen"|"vehi"|"weap"|"eqip"|"bipd")).map(|t|t.id));
    for object_id in requested {
        if !processed.insert(object_id) {continue;}
        if processed.len()>MAX_MODEL_TYPES {notes.push("Model preview capped at 128 distinct object types".into());break;}
        let Some(object_tag)=tag_lookup.get(&object_id) else {continue};
        let Some(object_at)=object_tag.data_offset else {continue};
        if object_tag.class=="itmc" {
            match object_model_mesh(bytes,header,tags,object_id,0){Ok((_,mesh))=>{models.insert(object_id,mesh);},Err(error)=>{if notes.len()<32{notes.push(format!("{}: {error}",object_tag.path));}}}
            continue;
        }
        // Common object header model TagDependency at offset 40, datum ID +12.
        let model_id=match r.u32(object_at+52) {Ok(id)=>id,Err(_)=>continue};
        let Some(model_tag)=tag_lookup.get(&model_id) else {continue};
        if model_tag.class!="mod2" {continue;}
        let Some(model_at)=model_tag.data_offset else {continue};
        match gbxmodel_static_mesh(&r,region,model_at,raw_start,raw_vertex_size,raw_model_size) {
            Ok(mut mesh)=>{mesh.material_ranges.retain(|m|tag_lookup.get(&m.shader_tag_id)
                .is_some_and(|t|matches!(t.class.as_str(),"senv"|"soso"|"schi"|"scex"|"sotr"|"sgla"|"swat"|"spla")));
                models.insert(object_id,mesh);},
            Err(e)=>{if notes.len()<32 {notes.push(format!("{}: {}",model_tag.path,e));}},
        }
    }
    if models.len()<MAX_MODEL_TYPES {
        for object in tags.iter().filter(|t|t.class=="bipd"&&!t.external) {
            let spartan=object.references.iter().any(|reference|reference.label=="Model"&&tags.iter().any(|model|model.id==reference.target_id&&model.class=="mod2"&&
                matches!(model.path.replace('\\',"/").to_ascii_lowercase().as_str(),"characters/cyborg/cyborg"|"characters/cyborg_mp/cyborg_mp")));
            if spartan&&!models.contains_key(&object.id){match object_model_mesh(bytes,header,tags,object.id,0){Ok((_,mesh))=>{models.insert(object.id,mesh);},Err(error)=>notes.push(format!("Spartan model: {error}"))}break;}
        }
    }
    (models,notes)
}

/// The same bounded model reader for a source-authored sky model reference.
pub fn cached_model_mesh(bytes:&[u8],header:&MapHeader,tags:&[Tag],model_id:u32)->Result<MeshData>{
    if !matches!(header.version,6|7|13|609){return invalid("Sky model preview requires a supported PC-derived cache");}
    let r=Reader(bytes);let region=tag_space(&r,header)?;
    let tag=tags.iter().find(|t|t.id==model_id&&t.class=="mod2"&&!t.external)
        .ok_or_else(||crate::SparkError::Invalid("Sky model reference is not an internal GBX model".into()))?;
    let at=tag.data_offset.ok_or_else(||crate::SparkError::Invalid("Sky model body unavailable".into()))?;
    let start=header.tag_offset as usize;
    let raw_start=r.u32(start+20)? as usize;let vertex_size=r.u32(start+28)? as usize;let total=r.u32(start+32)? as usize;
    if vertex_size>total||raw_start.checked_add(total).is_none_or(|end|end>bytes.len()){return invalid("Sky model raw region escapes cache");}
    let mut mesh=gbxmodel_static_mesh(&r,region,at,raw_start,vertex_size,total)?;
    mesh.material_ranges.retain(|m|tags.iter().any(|t|t.id==m.shader_tag_id&&matches!(t.class.as_str(),"senv"|"soso"|"schi"|"scex")));
    Ok(mesh)
}

/// Resolve an exact object datum (or a selected item-collection permutation)
/// to its world model. First-person weapon models are a different dependency.
pub fn object_model_mesh(bytes:&[u8],header:&MapHeader,tags:&[Tag],object_id:u32,permutation:usize)->Result<(u32,MeshData)>{
    let r=Reader(bytes);let region=tag_space(&r,header)?;
    let mut object=tags.iter().find(|t|t.id==object_id&&!t.external)
        .ok_or_else(||crate::SparkError::Invalid("Object tag is missing or external".into()))?;
    if object.class=="itmc" {
        let at=object.data_offset.ok_or_else(||crate::SparkError::Invalid("Item collection body unavailable".into()))?;
        if at<region.begin||at.checked_add(12).is_none_or(|end|end>region.end){return invalid("Item collection body escapes tag region");}
        let (table,count)=region.block(&r,at,84,32)?;
        if permutation>=count{return invalid("Item collection permutation unavailable");}
        let dependency=table+permutation*84+36;let id=r.u32(dependency+12)?;let class=r.fourcc(dependency)?;
        object=tags.iter().find(|t|t.id==id&&t.class==class&&!t.external)
            .ok_or_else(||crate::SparkError::Invalid("Item collection dependency is not an exact internal object".into()))?;
    }
    if !matches!(object.class.as_str(),"weap"|"eqip"|"scen"|"vehi"|"bipd"|"garb"|"proj"|"mach"|"ctrl"|"lifi"|"ssce"){
        return invalid("Selected tag class has no supported world model dependency");
    }
    let at=object.data_offset.ok_or_else(||crate::SparkError::Invalid("Object body unavailable".into()))?;
    if at<region.begin||at.checked_add(56).is_none_or(|end|end>region.end){return invalid("Object model dependency escapes tag region");}
    if r.fourcc(at+40)?!="mod2" {return invalid("Object does not reference a supported world GBX model");}
    let model_id=r.u32(at+52)?;Ok((model_id,cached_model_mesh(bytes,header,tags,model_id)?))
}
pub fn preview_owned_object_model(path:&std::path::Path,expected:&str,inspection:&crate::maps::MapInspection,object_id:u32)->Result<(u32,MeshData)>{
    let (header,bytes,actual)=crate::maps::read_cache_snapshot(path)?;
    if actual!=expected||actual!=inspection.sha256{return invalid("Model source changed during inspection");}
    object_model_mesh(&bytes,&header,&inspection.tags,object_id,0)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn region_rejects_before_or_after_and_accepts_exact_end() {
        let region=Region{begin:10,end:30,address:100};
        assert!(region.pointer(99,1).is_err());
        assert!(region.pointer(121,1).is_err());
        assert_eq!(region.pointer(100,20).unwrap(),10);
        assert_eq!(region.pointer(120,0).unwrap(),30);
    }
    #[test]
    fn untrusted_reflexive_counts_are_bounded() {
        let mut b=[0u8;32]; b[0..4].copy_from_slice(&100u32.to_le_bytes());
        assert!(Region{begin:0,end:32,address:0}.block(&Reader(&b),0,48,32).is_err());
    }
}

#[cfg(test)]
mod geometry_tests {
    use super::*;
    fn put32(b:&mut [u8],at:usize,v:u32){b[at..at+4].copy_from_slice(&v.to_le_bytes());}
    fn put16(b:&mut [u8],at:usize,v:u16){b[at..at+2].copy_from_slice(&v.to_le_bytes());}
    fn putf(b:&mut [u8],at:usize,v:f32){b[at..at+4].copy_from_slice(&v.to_le_bytes());}
    #[test]
    fn uncompressed_render_bsp_reads_real_surfaces_not_collision_edges() {
        let mut b=vec![0u8;0x5000];
        let tag=0x1000usize;
        let scenario=0x1800usize;
        let base=0x4044_0000u32;
        // Scenario structure BSP array.
        put32(&mut b,scenario+0x5a4,1);
        put32(&mut b,scenario+0x5a8,base+0xe00);
        let row=0x1e00;
        put32(&mut b,row,0x800);
        put32(&mut b,row+4,0x4800);
        put32(&mut b,row+8,0x5000_0000);
        put32(&mut b,0x800,0x5000_0020);
        let bsp=0x820;
        // Source sbsp lightmap tag dependency is stored at offset zero.
        b[bsp..bsp+4].copy_from_slice(b"mtib");
        put32(&mut b,bsp+12,0x0000_8899);
        put32(&mut b,bsp+0xf8,1);
        put32(&mut b,bsp+0xfc,0x5000_0360);
        put32(&mut b,bsp+0x104,1);
        put32(&mut b,bsp+0x108,0x5000_0380);
        // Triangle surface at BSP-space + 0x360.
        put16(&mut b,0xb60,0);put16(&mut b,0xb62,1);put16(&mut b,0xb64,2);
        // Lightmap material reflexive.
        put32(&mut b,0xb80+20,1);put32(&mut b,0xb80+24,0x5000_0400);
        let mat=0xc00;
        put32(&mut b,mat+12,0x0000_4321);
        put32(&mut b,mat+20,0);put32(&mut b,mat+24,1);
        put16(&mut b,mat+176,0);
        put32(&mut b,mat+180,3);
        put32(&mut b,mat+216,3*56);
        // Store an intentionally unusable raw-data file offset to ensure the
        // decoder uses the bounded BSP address pointer instead.
        put32(&mut b,mat+224,0xffff_ff00);
        put32(&mut b,mat+228,0x5000_3800);
        for (i,pos) in [[0.0,0.0,0.0],[1.0,0.0,0.0],[0.0,1.0,0.0]].iter().enumerate(){
            let v=0x4000+i*56;
            for k in 0..3{putf(&mut b,v+k*4,pos[k]);}
            putf(&mut b,v+20,1.0);
            putf(&mut b,v+48,pos[0]);putf(&mut b,v+52,pos[1]);
        }
        let header=MapHeader{version:7,engine:"Halo PC".into(),name:"fixture".into(),build:"test".into(),scenario_type:1,file_size:b.len() as u64,declared_size:b.len() as u32,tag_offset:tag as u32,tag_size:0x2000,crc32:0,flags:0,demo_layout:false,compressed:false,extended:false,legacy_tag_size_repair:false};
        let mesh=bsp_render_geometry(&b,&header,scenario).unwrap();
        assert_eq!(mesh.indices,[0,1,2]);
        assert_eq!(mesh.positions.len(),9);
        assert_eq!(mesh.normals.len(),9);
        assert_eq!(mesh.uvs.len(),6);
        assert_eq!(mesh.parts.len(),1);
        assert_eq!(mesh.material_ranges.len(),1);
        assert_eq!(mesh.material_ranges[0].shader_tag_id,0x4321);
        assert_eq!(mesh.material_ranges[0].lightmap_bitmap_tag_id,Some(0x8899));
        assert_eq!(mesh.material_ranges[0].index_count,3);
        assert_eq!(mesh.lightmap_uvs,vec![0.0;6]);
        assert!(!mesh.material_ranges[0].has_lightmap_uvs);
        // Inject a genuine bounded secondary stream and a valid lightmap page.
        put16(&mut b,0xb80,2);
        put32(&mut b,mat+216,3*(56+20));
        for i in 0..3 {
            let at=0x4000+3*56+i*20;
            putf(&mut b,at+12,i as f32*0.25);
            putf(&mut b,at+16,i as f32*0.5);
        }
        let lit=bsp_render_geometry(&b,&header,scenario).unwrap();
        assert_eq!(lit.lightmap_uvs,vec![0.,0.,0.25,0.5,0.5,1.0]);
        assert_eq!(lit.material_ranges[0].lightmap_page,2);
        assert!(lit.material_ranges[0].has_lightmap_uvs);
        putf(&mut b,0x4000+3*56+12,f32::INFINITY);
        let corrupt=bsp_render_geometry(&b,&header,scenario).unwrap();
        assert!(!corrupt.material_ranges[0].has_lightmap_uvs);
        assert_eq!(corrupt.lightmap_uvs,vec![0.;6]);
        // A non-bitmap dependency must never be published as a usable
        // lightmap source, regardless of its numerically plausible datum.
        b[bsp..bsp+4].copy_from_slice(b"dnos");
        let unbound=bsp_render_geometry(&b,&header,scenario).unwrap();
        assert!(unbound.material_ranges[0].lightmap_bitmap_tag_id.is_none());
        b[bsp..bsp+4].copy_from_slice(b"mtib");
        put32(&mut b,bsp+12,u32::MAX);
        let nulled=bsp_render_geometry(&b,&header,scenario).unwrap();
        assert!(nulled.material_ranges[0].lightmap_bitmap_tag_id.is_none());
        put32(&mut b,bsp+12,0x0000_8899);
        // A bad BSP pointer must never be treated as a valid file offset.
        put32(&mut b,mat+228,0xffff_ffff);
        assert!(bsp_render_geometry(&b,&header,scenario).is_err());
        put32(&mut b,mat+228,0x5000_3800);
        // Malformed triangles are rejected, not clamped into fake geometry.
        put16(&mut b,0xb60,9);
        assert!(bsp_render_geometry(&b,&header,scenario).is_err());
    }
    #[test]
    fn static_model_reads_bounded_geometry_and_rejects_bad_indices() {
        let mut b=vec![0u8;0x1800];
        let base=0x4044_0000u32;
        let model=0x100;
        put32(&mut b,model+208,1);
        put32(&mut b,model+212,base+0x300);
        put32(&mut b,0x300+36,1);
        put32(&mut b,0x300+40,base+0x400);
        let p=0x400;
        put32(&mut b,p+72,1);put32(&mut b,p+76,0);
        // The cache-only transient vertex pointer is not a file offset.
        put32(&mut b,p+88,3);put32(&mut b,p+96,0xC945_0000);put32(&mut b,p+100,0);
        let raw=0x600;
        for (i,pos) in [[0.0,0.0,0.0],[1.0,0.0,0.0],[0.0,1.0,0.0]].iter().enumerate(){
            for k in 0..3{putf(&mut b,raw+i*68+k*4,pos[k]);}
            putf(&mut b,raw+i*68+20,1.0);
        }
        let indices=raw+3*68;
        put16(&mut b,indices,0);put16(&mut b,indices+2,1);put16(&mut b,indices+4,2);
        let region=Region{begin:0,end:0x1800,address:base};
        let mesh=gbxmodel_static_mesh(&Reader(&b),region,model,raw,3*68,3*68+6).unwrap();
        assert_eq!(mesh.indices,[0,1,2]);
        assert_eq!(mesh.positions.len(),9);
        assert_eq!(mesh.parts.len(),1);
        put16(&mut b,indices+4,4);
        assert!(gbxmodel_static_mesh(&Reader(&b),region,model,raw,3*68,3*68+6).is_err());
        // Bind pose remains available for multi-node static preview only.
        put16(&mut b,indices+4,2);
        put32(&mut b,model+184,3);
        put32(&mut b,model+188,base+0xa00);
        let pose=gbxmodel_static_mesh(&Reader(&b),region,model,raw,3*68,3*68+6).unwrap();
        assert!(pose.label.contains("bind-pose"));
        assert_eq!(pose.indices,[0,1,2]);
        // Reject a plausible in-file index location if outside model region.
        assert!(gbxmodel_static_mesh(&Reader(&b),region,model,raw,3*68,3*68+4).is_err());
    }
}
