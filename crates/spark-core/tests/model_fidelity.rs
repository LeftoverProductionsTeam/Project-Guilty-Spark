use spark_core::{assets, maps::{MeshData,MeshMaterialRange,Tag},model_build::{compare_render,SourceMaterialRange}};
fn fixture() -> (MeshData,Vec<SourceMaterialRange>,MeshData,Vec<Tag>) {
    let source=assets::parse_obj(include_str!("fixtures/static_wedge.obj")).unwrap().mesh;
    let mut output=source.clone();
    output.material_ranges=vec![MeshMaterialRange{shader_permutation:0,shader_tag_id:42,bsp_index:0,lightmap_index:0,lightmap_page:-1,has_lightmap_uvs:false,has_incident_radiosity:false,lightmap_bitmap_tag_id:None,index_start:0,index_count:output.indices.len()}];
    let ranges=vec![SourceMaterialRange{shader_path:"models/own/surface".into(),index_start:0,index_count:source.indices.len()}];
    let tags=vec![serde_json::from_value(serde_json::json!({"id":42,"index":0,"class":"soso","path":"models\\own\\surface","dataOffset":0,"external":false,"fields":[],"references":[]})).unwrap()];
    (source,ranges,output,tags)
}
#[test]
fn reordered_triangles_and_cyclic_indices_preserve_native_surface_fidelity() {
    let (source,ranges,mut output,tags)=fixture();
    output.indices=output.indices.chunks_exact(3).rev().flat_map(|t|[t[1],t[2],t[0]]).collect();
    for p in &mut output.positions {*p+=0.000001;}
    let evidence=compare_render(&source,&ranges,&output,&tags).unwrap();
    assert_eq!(evidence.triangles,8);
    assert_eq!(evidence.shader_paths,vec!["models/own/surface"]);
    assert!(evidence.max_position_error>0. && evidence.max_position_error<0.00001);
    assert!(evidence.winding_preserved);
}
#[test]
fn unchanged_bounds_and_triangle_count_cannot_hide_uv_normal_winding_or_shader_corruption() {
    let (source,ranges,output,tags)=fixture();
    for damage in 0..5 {
        let mut changed=output.clone();let mut changed_tags=tags.clone();
        match damage {
            0=>changed.uvs[0]+=0.2,
            1=>changed.normals.iter_mut().for_each(|n|*n = -*n),
            2=>changed.indices.swap(0,1),
            3=>changed_tags[0].path="unrelated/surface".into(),
            _=>changed.indices[0]=changed.indices[1],
        }
        assert!(compare_render(&source,&ranges,&changed,&changed_tags).is_err(),"Corruption {damage} was accepted");
    }
}
#[test]
fn untrusted_ranges_references_and_streams_are_rejected_without_panics() {
    let (source,ranges,output,tags)=fixture();
    for damage in 0..7 {
        let mut changed=output.clone();let mut changed_tags=tags.clone();
        match damage {
            0=>changed.indices[0]=u32::MAX,
            1=>changed.uvs.clear(),
            2=>changed.positions[0]=f32::NAN,
            3=>changed.positions[0]=f32::MAX,
            4=>changed.material_ranges.push(changed.material_ranges[0].clone()),
            5=>changed.material_ranges[0].index_count=3,
            _=>changed_tags.push(changed_tags[0].clone()),
        }
        assert!(compare_render(&source,&ranges,&changed,&changed_tags).is_err());
    }
}
