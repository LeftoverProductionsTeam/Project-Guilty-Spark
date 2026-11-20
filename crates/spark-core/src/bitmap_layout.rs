//! Native bitmap sequence/atlas facts for the existing preview pipeline.
//! No pixel decoder, source writer, image synthesis or inferred resource lookup.
use super::*;

#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct BitmapLayoutImage {pub width:u16,pub height:u16,pub kind:u16,pub registration:[i16;2]}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct BitmapLayoutSprite {
    pub image_index:usize,pub left:f32,pub right:f32,pub top:f32,pub bottom:f32,
    /// Native normalized atlas registration, not a guessed sprite center.
    pub registration:[f32;2],
}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct BitmapLayoutSequence {
    pub name:String,pub first_image:i16,pub image_count:u16,pub sprites:Vec<BitmapLayoutSprite>,
}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct OwnedBitmapLayout {
    pub bitmap_tag_id:u32,pub source_sha256:String,pub source_kind:String,
    #[serde(skip_serializing_if="Option::is_none")]pub resource_sha256:Option<String>,
    pub group_flags:u16,
    pub images:Vec<BitmapLayoutImage>,pub sequences:Vec<BitmapLayoutSequence>,
}
struct BitmapLayout {group_flags:u16,images:Vec<BitmapLayoutImage>,sequences:Vec<BitmapLayoutSequence>}
fn read_layout(bytes:&[u8],region:TagRegion,at:usize)->Result<BitmapLayout>{
    let r=Reader(bytes);region.contains(at,108)?;
    let group_flags=r.u16(at+6)?;
    let count=r.u32(at+96)? as usize;
    if count==0||count>MAX_IMAGES_PER_TAG {return invalid("HUD bitmap image table exceeds its native preview bound");}
    let table=region.pointer(r.u32(at+100)?,count*48)?;
    let indexed=region.start==0&&region.memory_address==0;
    if indexed&&table<108{return invalid("Indexed HUD image table overlaps its metadata header");}
    let mut images=Vec::with_capacity(count);
    for index in 0..count {
        let row=table+index*48;
        if r.fourcc(row)?!="bitm" {return invalid("HUD bitmap image signature changed");}
        let(width,height,kind)=(r.u16(row+4)?,r.u16(row+6)?,r.u16(row+10)?);
        if width==0||height==0||width>MAX_IMAGE_EDGE||height>MAX_IMAGE_EDGE||kind>2 {
            return invalid("HUD bitmap dimensions or image kind exceed supported bounds");
        }
        images.push(BitmapLayoutImage{width,height,kind,registration:[r.u16(row+16)? as i16,r.u16(row+18)? as i16]});
    }
    // HEK bitmap root +84: 64-byte sequences. Sequence +52: 32-byte sprites.
    // Source: pinned native bitmap definitions, not engine implementation code.
    let count=r.u32(at+84)? as usize;
    if count>256 {return invalid("HUD bitmap sequence count exceeds 256; extended layouts require their own admission");}
    if count==0{return Ok(BitmapLayout{group_flags,images,sequences:vec![]});}
    let table=region.pointer(r.u32(at+88)?,count*64)?;
    if indexed&&table<108{return invalid("Indexed HUD sequence table overlaps its metadata header");}
    let mut sequences=Vec::with_capacity(count);let mut total_sprites=0usize;
    for index in 0..count {
        let row=table+index*64;
        let name=r.bytes(row,32)?;let end=name.iter().position(|b|*b==0).unwrap_or(32);
        if name[..end].iter().any(|b|*b<0x20){return invalid("HUD bitmap sequence name contains control characters");}
        let name=std::str::from_utf8(&name[..end]).map_err(|_|SparkError::Invalid("HUD bitmap sequence name is not UTF-8".into()))?.to_owned();
        let first_image=r.u16(row+32)? as i16;let image_count=r.u16(row+34)?;
        let sprite_count=r.u32(row+52)? as usize;
        if sprite_count>64 {return invalid("HUD bitmap sprite count exceeds 64 per sequence");}
        total_sprites+=sprite_count;
        if total_sprites>16384 {return invalid("HUD bitmap sprite metadata exceeds the bounded preview inventory");}
        let sprite_table=if sprite_count==0{0}else{region.pointer(r.u32(row+56)?,sprite_count*32)?};
        if indexed&&sprite_count>0&&sprite_table<108{return invalid("Indexed HUD sprite table overlaps its metadata header");}
        let mut sprites=Vec::with_capacity(sprite_count);
        for sprite_index in 0..sprite_count {
            let sprite=sprite_table+sprite_index*32;
            let image=r.u16(sprite)? as i16;
            if image<0||image as usize>=images.len()||images[image as usize].kind!=0{return invalid("HUD sprite references an unavailable 2D bitmap image");}
            let(left,right,top,bottom)=(r.f32(sprite+8)?,r.f32(sprite+12)?,r.f32(sprite+16)?,r.f32(sprite+20)?);
            if !(0.<=left&&left<right&&right<=1.&&0.<=top&&top<bottom&&bottom<=1.) {
                return invalid("HUD sprite bounds escape its original atlas image");
            }
            let registration=[r.f32(sprite+24)?,r.f32(sprite+28)?];
            if registration.iter().any(|n|n.abs()>65536.){return invalid("HUD sprite registration exceeds the native preview coordinate limit");}
            sprites.push(BitmapLayoutSprite{image_index:image as usize,left,right,top,bottom,registration});
        }
        if sprites.is_empty()&&image_count>0&&(first_image<0||(first_image as usize).checked_add(image_count as usize).is_none_or(|end|end>images.len())) {
            return invalid("HUD bitmap sequence references images outside its native table");
        }
        sequences.push(BitmapLayoutSequence{name,first_image,image_count,sprites});
    }
    Ok(BitmapLayout{group_flags,images,sequences})
}
/// Read exact source-bound sequence metadata without decoding any pixels.
/// Indexed CE bodies use the same checked native slot/path and opened resource
/// handle as existing previews; no global/runtime-selected resources are used.
pub fn owned_bitmap_layout(path:&Path,expected:&str,inspection:&MapInspection,bitmap_tag_id:u32,
    resources:Option<(&Path,&str)>)->Result<OwnedBitmapLayout>{
    if expected.len()!=64||!expected.bytes().all(|b|b.is_ascii_hexdigit())||inspection.sha256!=expected {
        return invalid("HUD bitmap layout source identity differs from the project");
    }
    let(header,bytes,actual)=maps::read_cache_snapshot_shared(path)?;
    if actual!=expected||header.version!=inspection.header.version||header.tag_offset!=inspection.header.tag_offset||
        header.tag_size!=inspection.header.tag_size||!matches!(header.version,5|6|7|13|609) {
        return invalid("HUD bitmap layout cache snapshot changed or its format is unsupported");
    }
    let tag=inspection.tags.iter().find(|tag|tag.id==bitmap_tag_id&&tag.class=="bitm")
        .ok_or_else(||SparkError::Invalid("HUD bitmap tag is absent from this source map".into()))?;
    let(layout,source_kind,resource_sha256)=if tag.external {
        let(path,hash)=resources.ok_or_else(||SparkError::Invalid("Project-pinned bitmaps.map is required for this HUD bitmap layout".into()))?;
        let(mut file,index)=crate::resource_map::open_verified(path,hash)?;let mut spent=0;
        let body=ce_indexed_body(&bytes,&header,tag,&mut file,&index,&mut spent)?;
        let layout=read_layout(&body,TagRegion{start:0,end:body.len(),memory_address:0},0)?;
        crate::resource_map::verify_open_handle_hash(&mut file,hash)?;
        (layout,"verified-resource",Some(hash.to_owned()))
    }else{
        let at=tag.data_offset.ok_or_else(||SparkError::Invalid("HUD bitmap layout has no native tag body".into()))?;
        let layout=read_layout(&bytes,TagRegion::from_header(&bytes,&header)?,at)?;
        (layout,"internal-cache",None)
    };
    Ok(OwnedBitmapLayout{bitmap_tag_id,source_sha256:actual,source_kind:source_kind.into(),resource_sha256,group_flags:layout.group_flags,images:layout.images,sequences:layout.sequences})
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layout_carries_group_flags_from_the_validated_bitmap_root() {
        let mut tag = vec![0u8; 156];
        tag[6..8].copy_from_slice(&0x90u16.to_le_bytes());
        tag[96..100].copy_from_slice(&1u32.to_le_bytes());
        tag[100..104].copy_from_slice(&108u32.to_le_bytes());
        tag[108..112].copy_from_slice(b"mtib");
        tag[112..114].copy_from_slice(&128u16.to_le_bytes());
        tag[114..116].copy_from_slice(&64u16.to_le_bytes());
        let region = TagRegion { start: 0, end: tag.len(), memory_address: 0 };
        let layout = read_layout(&tag, region, 0).unwrap();
        assert_eq!(layout.group_flags, 0x90);
        assert_eq!((layout.images[0].width, layout.images[0].height), (128, 64));
    }
}
