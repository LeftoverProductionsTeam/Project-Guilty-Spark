use spark_core::{bsp_workshop, forge_session, studio_journal::Journal};
fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
#[test]
fn separate_brushes_and_transform_axes_merge_and_author_undo_preserves_peers() {
    let base = bsp_workshop::example().unwrap();
    let journal = Journal::new(base.clone()).unwrap();
    let a = id();
    let b = id();
    let mut first = base.clone();
    let mut second = base.clone();
    first.workshop.as_mut().unwrap().brushes[0].faces[0].uv_offset[0] = 0.25;
    second.workshop.as_mut().unwrap().brushes[1].faces[0].uv_scale[0] = 0.5;
    let first = journal.propose(&id(), &a, 0, first).unwrap();
    let second = first.propose(&id(), &b, 0, second).unwrap();
    let undone = second.reverse(&id(), &a, false).unwrap();
    assert_eq!(
        undone.document.workshop.as_ref().unwrap().brushes[0],
        base.workshop.as_ref().unwrap().brushes[0]
    );
    assert_eq!(
        undone.document.workshop.as_ref().unwrap().brushes[1],
        second.document.workshop.as_ref().unwrap().brushes[1]
    );
    assert_eq!(
        undone.reverse(&id(), &a, true).unwrap().document,
        second.document
    );
    let mut x = base.clone();
    let mut y = base.clone();
    x.workshop.as_mut().unwrap().brushes[0].position[0] += 1.;
    y.workshop.as_mut().unwrap().brushes[0].position[1] += 2.;
    let merged = forge_session::merge(&base, &x, &y).unwrap();
    assert_eq!(merged.workshop.unwrap().brushes[0].position, [1., 2., 0.]);
}
#[test]
fn topology_is_atomic_and_edit_delete_conflicts_do_not_mutate_accepted_source() {
    let base = bsp_workshop::example().unwrap();
    let mut a = base.clone();
    let mut b = base.clone();
    for p in &mut a.workshop.as_mut().unwrap().brushes[0].vertices {
        p[0] *= 1.1;
    }
    b.workshop.as_mut().unwrap().brushes[0].faces[0].uv_offset[0] = 0.25;
    assert!(forge_session::merge(&base, &a, &b)
        .unwrap_err()
        .to_string()
        .contains("topology/material"));
    let preserved = b.clone();
    assert!(forge_session::merge(&base, &a, &b).is_err());
    assert_eq!(b, preserved);
    b.workshop.as_mut().unwrap().brushes.remove(0);
    assert!(forge_session::merge(&base, &a, &b).is_err());
    let targets = forge_session::structural_targets(&base, &a);
    assert_eq!(targets, vec!["workshop/brushes/room-a/structure"]);
}
#[test]
fn invalid_combined_material_references_are_rejected_before_a_shared_commit() {
    let base = bsp_workshop::example().unwrap();
    let mut a = base.clone();
    a.workshop.as_mut().unwrap().brushes[0].faces[0].material_id = "absent".into();
    assert!(forge_session::merge(&base, &a, &base).is_err());
    assert_eq!(forge_session::merge(&base, &base, &base).unwrap(), base);
}
#[test]
fn sustained_workshop_edits_bound_history_and_recover_acknowledged_author_undo() {
    use spark_core::studio_journal::Storage;
    let base = bsp_workshop::example().unwrap();
    let mut journal = Journal::new(base.clone()).unwrap();
    let a = id();
    let b = id();
    let first_id = id();
    let mut first = base.clone();
    first.workshop.as_mut().unwrap().brushes[0].position[0] = 0.125;
    journal = journal.propose(&first_id, &a, 0, first.clone()).unwrap();
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("session");
    let mut storage = Storage::create(&root, &journal).unwrap();
    for i in 1..1100 {
        let mut next = journal.document.clone();
        let (author, brush) = if i % 2 == 0 { (&a, 0) } else { (&b, 2) };
        next.workshop.as_mut().unwrap().brushes[brush].faces[0].uv_offset[0] = i as f64 / 4096.;
        journal = journal
            .propose(&id(), author, journal.revision, next)
            .unwrap();
        if i % 100 == 0 {
            storage.store(&journal).unwrap();
        }
        assert!(journal.transactions.len() <= 100);
    }
    storage.store(&journal).unwrap();
    drop(storage);
    let (_, restored) = Storage::open(&root).unwrap();
    assert_eq!(restored.document, journal.document);
    assert_eq!(restored.revision, 1100);
    assert_eq!(restored.transactions.len(), 100);
    assert_eq!(restored.acknowledged_operations(), 1100);
    assert_eq!(
        restored.propose(&first_id, &a, 0, first).unwrap().document,
        journal.document
    );
    let peer_brush = restored.document.workshop.as_ref().unwrap().brushes[2].clone();
    let undone = restored.reverse(&id(), &a, false).unwrap();
    assert_eq!(
        undone.document.workshop.as_ref().unwrap().brushes[2],
        peer_brush
    );
    assert_eq!(
        undone.reverse(&id(), &a, true).unwrap().document,
        restored.document
    );
}
