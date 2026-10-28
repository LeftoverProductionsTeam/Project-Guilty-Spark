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
pub(super) fn read(
    r: &Reader,
    space: &Space,
    tag: &mut Tag,
    ids: &std::collections::HashMap<u32, String>,
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
