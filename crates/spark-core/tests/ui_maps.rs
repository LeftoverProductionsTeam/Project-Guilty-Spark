mod common;
use spark_core::{
    library::Library,
    maps,
    project::{self, TagEdit},
};
#[test]
fn ui_cache_widgets_preserve_integer_layout_and_cycle_safe_dependencies() {
    for version in [7, 13] {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ui.map");
        let mut bytes = common::fixture(version);
        common::put_u16(&mut bytes, 0x60, 2);
        common::fourcc(&mut bytes, 0x828 + 32, "DeLa");
        bytes[0x1800..0x1800 + 1004].fill(0);
        common::put_u16(&mut bytes, 0x1800 + 40, 480);
        common::put_u16(&mut bytes, 0x1800 + 42, 640);
        common::put_u32(&mut bytes, 0x1800 + 992, 1);
        common::put_u32(&mut bytes, 0x1800 + 996, common::pointer(version, 0x4100));
        common::fourcc(&mut bytes, 0x4100, "DeLa");
        common::put_u32(&mut bytes, 0x410c, 0xe0000001);
        std::fs::write(&path, &bytes).unwrap();
        let lib = Library::open(&dir.path().join("library")).unwrap();
        let (mut p, i) = lib.import_map(&path, None).unwrap();
        assert_eq!(i.header.scenario_type, 2);
        let widget = i.tags.iter().find(|t| t.class == "DeLa").unwrap();
        assert!(widget.references.iter().any(|r| r.target_id == widget.id));
        let left = widget.fields.iter().find(|f| f.key == "ui-left").unwrap();
        assert_eq!(left.kind, "i16");
        p.tag_edits.push(TagEdit {
            tag_id: widget.id,
            field_key: left.key.clone(),
            value: serde_json::json!(-20),
        });
        let changed = project::patched_cache(&p, &i).unwrap();
        assert_eq!(
            &changed[left.offset..left.offset + 2],
            &(-20i16).to_le_bytes()
        );
        assert_eq!(
            &changed[left.offset + 2..left.offset + 6],
            &bytes[left.offset + 2..left.offset + 6]
        );
        assert_eq!(maps::hash_file(&path).unwrap(), i.sha256);
        p.tag_edits[0].value = serde_json::json!(-20.5);
        assert!(project::patched_cache(&p, &i).is_err());
        p.tag_edits[0].value = serde_json::json!(700);
        assert!(project::patched_cache(&p, &i).is_err());
        p.tag_edits=vec![TagEdit{tag_id:widget.id,field_key:"ui-widget-type".into(),value:serde_json::json!(4)}];
        assert!(project::patched_cache(&p,&i).is_err());
    }
}
