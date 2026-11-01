//! Three-way Workshop source merging. A brush's topology/material faces stay
//! atomic; independent brushes, transforms and portals can be edited together.
use crate::{
    bsp_workshop::{Brush, Workshop},
    invalid, Result,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BrushTransform {
    pub brush_id: String,
    pub position: [f64; 3],
    pub rotation: [f64; 3],
    pub scale: [f64; 3],
}
impl BrushTransform {
    pub fn validate(&self, document: &crate::quickforge::QuickForgeDocument) -> Result<()> {
        let mut doc = document.clone();
        let brush = doc
            .workshop
            .as_mut()
            .and_then(|w| w.brushes.iter_mut().find(|b| b.id == self.brush_id))
            .ok_or_else(|| {
                crate::SparkError::Invalid(
                    "The preview brush is not in the acknowledged Workshop source".into(),
                )
            })?;
        brush.position = self.position;
        brush.rotation = self.rotation;
        brush.scale = self.scale;
        crate::bsp_workshop::validate_source(&doc)
    }
}

fn field<T: Clone + PartialEq>(base: &T, next: &T, current: &T, target: &str) -> Result<T> {
    if next == base {
        return Ok(current.clone());
    }
    if current != base && current != next {
        return invalid(format!(
            "Concurrent Workshop conflict: {target}. Your draft was retained."
        ));
    }
    Ok(next.clone())
}
fn vector(base: &[f64; 3], next: &[f64; 3], current: &[f64; 3], target: &str) -> Result<[f64; 3]> {
    let mut result = *current;
    for axis in 0..3 {
        result[axis] = field(
            &base[axis],
            &next[axis],
            &current[axis],
            &format!("{target}/{axis}"),
        )?;
    }
    Ok(result)
}
fn shape_equal(a: &Brush, b: &Brush) -> bool {
    a.role == b.role && a.vertices == b.vertices && a.faces == b.faces
}
fn brush(base: &Brush, next: &Brush, current: &Brush) -> Result<Brush> {
    let target = format!("workshop/brushes/{}", base.id);
    let mut out = current.clone();
    if !shape_equal(base, next) {
        if !shape_equal(current, base) && !shape_equal(current, next) {
            return invalid(format!("Concurrent Workshop topology/material conflict: {target}. Keep both drafts and review the whole brush."));
        }
        out.role = next.role.clone();
        out.vertices = next.vertices.clone();
        out.faces = next.faces.clone();
    }
    out.name = field(
        &base.name,
        &next.name,
        &current.name,
        &format!("{target}/name"),
    )?;
    out.position = vector(
        &base.position,
        &next.position,
        &current.position,
        &format!("{target}/position"),
    )?;
    out.rotation = vector(
        &base.rotation,
        &next.rotation,
        &current.rotation,
        &format!("{target}/rotation"),
    )?;
    out.scale = vector(
        &base.scale,
        &next.scale,
        &current.scale,
        &format!("{target}/scale"),
    )?;
    Ok(out)
}
fn rows<T: Clone + PartialEq>(
    base: &[T],
    next: &[T],
    current: &[T],
    id: impl Fn(&T) -> &str,
    merge: impl Fn(&T, &T, &T) -> Result<T>,
    target: &str,
) -> Result<Vec<T>> {
    let mut out = current.to_vec();
    let ids: BTreeSet<_> = base.iter().chain(next).map(&id).collect();
    for key in ids {
        let b = base.iter().find(|v| id(v) == key);
        let n = next.iter().find(|v| id(v) == key);
        if b == n {
            continue;
        }
        let index = out.iter().position(|v| id(v) == key);
        match (b,n,index) {
            (None,Some(v),None) => out.push(v.clone()),
            (None,Some(v),Some(i)) if out[i]==*v => {},
            (Some(b),Some(n),Some(i)) => out[i]=merge(b,n,&out[i])?,
            (Some(b),None,Some(i)) if out[i]==*b => {out.remove(i);},
            (Some(_),None,None) => {},
            _ => return invalid(format!("Concurrent Workshop edit/delete conflict: {target}/{key}. Your draft was retained.")),
        }
    }
    Ok(out)
}
pub fn merge(
    base: &Option<Workshop>,
    next: &Option<Workshop>,
    current: &Option<Workshop>,
) -> Result<Option<Workshop>> {
    if next == base {
        return Ok(current.clone());
    }
    match (base, next, current) {
        (Some(b), Some(n), Some(c)) => Ok(Some(Workshop {
            schema_version: field(
                &b.schema_version,
                &n.schema_version,
                &c.schema_version,
                "workshop/schema",
            )?,
            brushes: rows(
                &b.brushes,
                &n.brushes,
                &c.brushes,
                |v| &v.id,
                brush,
                "workshop/brushes",
            )?,
            portals: rows(
                &b.portals,
                &n.portals,
                &c.portals,
                |v| &v.id,
                |b, n, c| field(b, n, c, &format!("workshop/portals/{}", b.id)),
                "workshop/portals",
            )?,
        })),
        _ => field(base, next, current, "workshop/schema"),
    }
}
pub fn structural_targets(base: &Option<Workshop>, next: &Option<Workshop>) -> Vec<String> {
    let (Some(b), Some(n)) = (base, next) else {
        return if base == next {
            vec![]
        } else {
            vec!["workshop/schema".into()]
        };
    };
    let mut targets = Vec::new();
    let ids: BTreeSet<_> = b.brushes.iter().chain(&n.brushes).map(|v| &v.id).collect();
    for id in ids {
        if match (
            b.brushes.iter().find(|v| &v.id == id),
            n.brushes.iter().find(|v| &v.id == id),
        ) {
            (Some(b), Some(n)) => !shape_equal(b, n),
            _ => true,
        } {
            targets.push(format!("workshop/brushes/{id}/structure"));
        }
    }
    let ids: BTreeSet<_> = b.portals.iter().chain(&n.portals).map(|v| &v.id).collect();
    for id in ids {
        if b.portals.iter().find(|v| &v.id == id) != n.portals.iter().find(|v| &v.id == id) {
            targets.push(format!("workshop/portals/{id}/structure"));
        }
    }
    targets
}
