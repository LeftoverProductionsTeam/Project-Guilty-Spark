//! SparkLink metadata: authoritative source transactions, not Halo tag formats.
use crate::{
    forge_session::{merge, portable},
    invalid,
    quickforge::{self, QuickForgeDocument},
    Result, SparkError,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, VecDeque},
    fs,
    path::{Path, PathBuf},
};
const MAX_BYTES: usize = 24 * 1024 * 1024;
const MAX_OPERATIONS: usize = 4096;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Role {
    Editor,
    Viewer,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Member {
    pub id: String,
    pub name: String,
    pub role: Role,
    pub credential_sha256: String,
    pub revoked: bool,
}
pub fn credential_hash(value: &str) -> Result<String> {
    if value.len() != 64 || !value.bytes().all(|b| b.is_ascii_hexdigit()) {
        return invalid("Invalid participant credential");
    }
    Ok(digest(value.as_bytes()))
}
fn fail(s: impl Into<String>) -> SparkError {
    SparkError::Invalid(s.into())
}
fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Edit,
    Undo,
    Redo,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Transaction {
    pub id: String,
    pub author: String,
    pub kind: Kind,
    pub base_revision: u64,
    pub revision: u64,
    pub digest: String,
    pub before: QuickForgeDocument,
    pub after: QuickForgeDocument,
    pub reverses: Option<String>,
    #[serde(default)]
    pub accepted_at: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Ack {
    author: String,
    digest: String,
    revision: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Journal {
    pub schema_version: u32,
    pub session_id: String,
    pub revision: u64,
    pub document: QuickForgeDocument,
    pub transactions: VecDeque<Transaction>,
    acknowledged: BTreeMap<String, Ack>,
    undo: BTreeMap<String, Vec<String>>,
    redo: BTreeMap<String, Vec<String>>,
    #[serde(default)]
    pub members: BTreeMap<String, Member>,
}
impl Journal {
    pub fn new(document: QuickForgeDocument) -> Result<Self> {
        let document = portable(document);
        quickforge::validate_portable_document(&document)?;
        Ok(Self {
            schema_version: 1,
            session_id: uuid::Uuid::new_v4().to_string(),
            revision: 0,
            document,
            transactions: VecDeque::new(),
            acknowledged: BTreeMap::new(),
            undo: BTreeMap::new(),
            redo: BTreeMap::new(),
            members: BTreeMap::new(),
        })
    }
    pub fn validate(&self) -> Result<()> {
        if self.schema_version != 1
            || uuid::Uuid::parse_str(&self.session_id).is_err()
            || self.transactions.len() > 100
            || self.acknowledged.len() > MAX_OPERATIONS
        {
            return invalid("Unsupported SparkLink journal or history bound");
        }
        quickforge::validate_portable_document(&self.document)?;
        if self.members.len() > 64 {
            return invalid("SparkLink participant history exceeds its bound");
        }
        for (id, member) in &self.members {
            if id != &member.id
                || uuid::Uuid::parse_str(id).is_err()
                || member.name.is_empty()
                || member.name.len() > 64
                || member.name.chars().any(char::is_control)
                || member.credential_sha256.len() != 64
                || !member
                    .credential_sha256
                    .bytes()
                    .all(|b| b.is_ascii_hexdigit())
            {
                return invalid("Invalid SparkLink participant metadata");
            }
        }
        let mut last = None;
        let mut last_document = None;
        for t in &self.transactions {
            uuid::Uuid::parse_str(&t.id).map_err(|_| fail("Invalid transaction identity"))?;
            quickforge::validate_portable_document(&t.before)?;
            quickforge::validate_portable_document(&t.after)?;
            if t.revision == 0
                || t.revision > self.revision
                || t.base_revision >= t.revision
                || (t.author != "host" && uuid::Uuid::parse_str(&t.author).is_err())
                || t.before.runtime_id != self.document.runtime_id
                || t.after.runtime_id != self.document.runtime_id
            {
                return invalid("SparkLink journal revision/runtime mismatch");
            }
            if let Some(previous) = last {
                if t.revision != previous + 1 {
                    return invalid("SparkLink history contains a revision gap");
                }
            }
            if last_document.is_some_and(|previous| previous != &t.before) {
                return invalid("SparkLink history contains a broken source chain");
            }
            if self.acknowledged.get(&t.id).is_none_or(|ack| {
                ack.author != t.author || ack.digest != t.digest || ack.revision != t.revision
            }) {
                return invalid("SparkLink transaction acknowledgement mismatch");
            }
            last = Some(t.revision);
            last_document = Some(&t.after);
        }
        if self.revision > 0 && self.transactions.is_empty() {
            return invalid("SparkLink accepted revision has no retained history");
        }
        if self
            .transactions
            .back()
            .is_some_and(|t| t.revision != self.revision || t.after != self.document)
        {
            return invalid("SparkLink journal does not match its accepted state");
        }
        Ok(())
    }
    fn fingerprint(
        author: &str,
        base: u64,
        kind: &Kind,
        document: Option<&QuickForgeDocument>,
    ) -> Result<String> {
        Ok(digest(&serde_json::to_vec(&(
            author, base, kind, document,
        ))?))
    }
    pub fn can_undo(&self, author: &str) -> bool {
        self.undo.get(author).is_some_and(|v| !v.is_empty())
    }
    pub fn can_redo(&self, author: &str) -> bool {
        self.redo.get(author).is_some_and(|v| !v.is_empty())
    }
    fn duplicate(&self, id: &str, author: &str, hash: &str) -> Result<bool> {
        uuid::Uuid::parse_str(id).map_err(|_| fail("Invalid operation identity"))?;
        if author != "host" && uuid::Uuid::parse_str(author).is_err() {
            return invalid("Invalid participant identity");
        }
        if let Some(ack) = self.acknowledged.get(id) {
            if ack.author != author || ack.digest != hash {
                return invalid("Operation identity was reused with another author/payload");
            }
            return Ok(true);
        }
        if self.acknowledged.len() >= MAX_OPERATIONS {
            return invalid("This session retains 4096 acknowledged operations. Close it and host a fresh session; accepted work remains recoverable.");
        }
        Ok(false)
    }
    fn base(&self, revision: u64) -> Result<&QuickForgeDocument> {
        if revision == self.revision {
            return Ok(&self.document);
        }
        self.transactions.iter().find(|t|t.revision.checked_sub(1)==Some(revision)).map(|t|&t.before).ok_or_else(||fail("The proposal's base revision expired. Preserve the local draft and review against the current shared version."))
    }
    pub fn propose(
        &self,
        id: &str,
        author: &str,
        revision: u64,
        document: QuickForgeDocument,
    ) -> Result<Self> {
        let document = portable(document);
        quickforge::validate_portable_document(&document)?;
        let hash = Self::fingerprint(author, revision, &Kind::Edit, Some(&document))?;
        if self.duplicate(id, author, &hash)? {
            return Ok(self.clone());
        }
        if revision > self.revision {
            return invalid("The proposal is ahead of the authoritative session revision");
        }
        if document.runtime_id != self.document.runtime_id
            || document.schema_version != self.document.schema_version
        {
            return invalid("Changing the session's target runtime/schema requires a new session");
        }
        let next = merge(self.base(revision)?, &document, &self.document)?;
        self.commit(id, author, revision, Kind::Edit, hash, next, None)
    }
    fn commit(
        &self,
        id: &str,
        author: &str,
        base_revision: u64,
        kind: Kind,
        hash: String,
        document: QuickForgeDocument,
        reverses: Option<String>,
    ) -> Result<Self> {
        let mut next = self.clone();
        if document == self.document {
            next.acknowledged.insert(
                id.into(),
                Ack {
                    author: author.into(),
                    digest: hash,
                    revision: self.revision,
                },
            );
            return Ok(next);
        }
        quickforge::validate_portable_document(&document)?;
        let revision = self
            .revision
            .checked_add(1)
            .ok_or_else(|| fail("Session revision overflow"))?;
        let transaction = Transaction {
            id: id.into(),
            author: author.into(),
            kind: kind.clone(),
            base_revision,
            revision,
            digest: hash.clone(),
            before: self.document.clone(),
            after: document.clone(),
            reverses,
            accepted_at: chrono::Utc::now().to_rfc3339(),
        };
        next.document = document;
        next.revision = revision;
        next.transactions.push_back(transaction);
        next.acknowledged.insert(
            id.into(),
            Ack {
                author: author.into(),
                digest: hash,
                revision,
            },
        );
        match kind {
            Kind::Edit => {
                next.undo.entry(author.into()).or_default().push(id.into());
                next.redo.remove(author);
            }
            Kind::Undo => {
                next.undo.entry(author.into()).or_default().pop();
                next.redo.entry(author.into()).or_default().push(id.into());
            }
            Kind::Redo => {
                next.redo.entry(author.into()).or_default().pop();
                next.undo.entry(author.into()).or_default().push(id.into());
            }
        }
        while next.transactions.len() > 100 || serde_json::to_vec(&next)?.len() > MAX_BYTES {
            if next.transactions.len() < 2 {
                return invalid("This source state exceeds the bounded collaboration journal size");
            }
            next.transactions.pop_front();
        }
        let retained: std::collections::BTreeSet<_> =
            next.transactions.iter().map(|t| t.id.clone()).collect();
        for stack in next.undo.values_mut().chain(next.redo.values_mut()) {
            stack.retain(|id| retained.contains(id));
        }
        next.validate()?;
        Ok(next)
    }
    pub fn reverse(&self, id: &str, author: &str, redo: bool) -> Result<Self> {
        let kind = if redo { Kind::Redo } else { Kind::Undo };
        let hash = Self::fingerprint(author, 0, &kind, None)?;
        if self.duplicate(id, author, &hash)? {
            return Ok(self.clone());
        }
        let target = (if redo { &self.redo } else { &self.undo })
            .get(author)
            .and_then(|s| s.last())
            .ok_or_else(|| {
                fail(if redo {
                    "No shared edit to redo for this participant"
                } else {
                    "No shared edit to undo for this participant"
                })
            })?;
        let original = self
            .transactions
            .iter()
            .find(|t| &t.id == target)
            .ok_or_else(|| {
                fail("This participant's undo history expired; current work is retained")
            })?;
        let document = merge(&original.after, &original.before, &self.document).map_err(|e| {
            fail(format!(
                "Cannot safely undo/redo: {e}. Another creator's change is retained."
            ))
        })?;
        self.commit(
            id,
            author,
            self.revision,
            kind,
            hash,
            document,
            Some(target.clone()),
        )
    }
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Head {
    schema_version: u32,
    session_id: String,
    revision: u64,
    slot: String,
    sha256: String,
}
/// Two verified checkpoint slots and an atomic head. The acknowledged state is
/// synced before publication. A file lock prevents a second recovered host.
pub struct Storage {
    root: PathBuf,
    _lease: fs::File,
    head_hash: String,
    slot: String,
}
impl Storage {
    fn lease(root: &Path) -> Result<fs::File> {
        crate::reject_links(root)?;
        let lock = root.join("host.lock");
        crate::reject_links(&lock)?;
        let file = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(lock)?;
        file.try_lock()
            .map_err(|_| fail("This recovered session already has a local host"))?;
        Ok(file)
    }
    pub fn create(root: &Path, journal: &Journal) -> Result<Self> {
        if root.exists() {
            return invalid("Use a fresh SparkLink session directory");
        }
        crate::reject_links(root.parent().ok_or_else(|| fail("Session has no parent"))?)?;
        fs::create_dir(root)?;
        let lease = Self::lease(root)?;
        let mut storage = Self {
            root: root.into(),
            _lease: lease,
            head_hash: String::new(),
            slot: "b".into(),
        };
        storage.store(journal)?;
        Ok(storage)
    }
    pub fn open(root: &Path) -> Result<(Self, Journal)> {
        let lease = Self::lease(root)?;
        let bytes = Self::read(&root.join("head.json"), 16384)?;
        let head: Head = serde_json::from_slice(&bytes)?;
        if head.schema_version != 1 || !["a", "b"].contains(&head.slot.as_str()) {
            return invalid("Unsupported SparkLink checkpoint selector");
        }
        let content = Self::read(&root.join(format!("state-{}.json", head.slot)), MAX_BYTES)?;
        if digest(&content) != head.sha256 {
            return invalid("SparkLink checkpoint checksum failed. Both slots remain available; no state was overwritten.");
        }
        let journal: Journal = serde_json::from_slice(&content)?;
        journal.validate()?;
        if journal.revision != head.revision || journal.session_id != head.session_id {
            return invalid("SparkLink checkpoint identity/revision mismatch");
        }
        Ok((
            Self {
                root: root.into(),
                _lease: lease,
                head_hash: digest(&bytes),
                slot: head.slot,
            },
            journal,
        ))
    }
    fn read(file: &Path, max: usize) -> Result<Vec<u8>> {
        crate::reject_links(file)?;
        if fs::metadata(file)?.len() > max as u64 {
            return invalid("SparkLink journal exceeds its storage bound");
        }
        Ok(fs::read(file)?)
    }
    pub fn store(&mut self, journal: &Journal) -> Result<()> {
        journal.validate()?;
        let bytes = serde_json::to_vec(journal)?;
        if bytes.len() > MAX_BYTES {
            return invalid("SparkLink journal exceeds its storage bound");
        }
        let head = self.root.join("head.json");
        if !self.head_hash.is_empty() && digest(&Self::read(&head, 16384)?) != self.head_hash {
            return invalid("SparkLink journal changed outside the active host. No new operation was acknowledged.");
        }
        let slot = if self.slot == "a" { "b" } else { "a" };
        let file = self.root.join(format!("state-{slot}.json"));
        crate::project::atomic_write(&file, &bytes, false)?;
        let marker = Head {
            schema_version: 1,
            session_id: journal.session_id.clone(),
            revision: journal.revision,
            slot: slot.into(),
            sha256: digest(&bytes),
        };
        let marker = serde_json::to_vec(&marker)?;
        crate::project::atomic_write(&head, &marker, false)?;
        self.head_hash = digest(&marker);
        self.slot = slot.into();
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn id() -> String {
        uuid::Uuid::new_v4().to_string()
    }
    #[test]
    fn portable_native_asset_reference_never_grants_local_build_provenance() {
        let mut document = quickforge::create_arena("assets", "emptyArena").unwrap();
        document.placements.push(quickforge::ForgePlacement {
            id: id(),
            name: "Owned Warthog".into(),
            tag_path: "vehicles/warthog/mp_warthog".into(),
            tag_class: "vehi".into(),
            tag_id: Some(123),
            source_project_id: Some(id()),
            source_sha256: Some("a".repeat(64)),
            position: [0., 0., 1.],
            rotation: [0.; 3],
            team: 0,
            respawn_seconds: 30,
            visible: true,
            locked: false,
        });
        assert!(quickforge::validate_document(&document).is_ok());
        let initial = Journal::new(document).unwrap();
        assert!(initial.document.placements[0].source_project_id.is_none());
        assert!(quickforge::validate_document(&initial.document).is_err());
        let mut moved = initial.document.clone();
        moved.placements[0].position[0] = 5.;
        let accepted = initial.propose(&id(), &id(), 0, moved).unwrap();
        accepted.validate().unwrap();
        assert_eq!(accepted.document.placements[0].position[0], 5.);
        let mut invalid = accepted.document.clone();
        invalid.placements[0].source_sha256 = Some("not a hash".into());
        assert!(accepted.propose(&id(), &id(), 1, invalid).is_err());
        let mut no_tag = accepted.document.clone();
        no_tag.placements[0].tag_id = None;
        assert!(accepted.propose(&id(), &id(), 1, no_tag).is_err());
    }
    #[test]
    fn disconnected_transaction_history_is_not_recovered_as_valid_source() {
        let base = Journal::new(quickforge::create_arena("chain", "emptyArena").unwrap()).unwrap();
        let mut a = base.document.clone();
        a.name = "first".into();
        let first = base.propose(&id(), &id(), 0, a).unwrap();
        let mut b = first.document.clone();
        b.name = "second".into();
        let mut second = first.propose(&id(), &id(), 1, b).unwrap();
        second.transactions[1].before.name = "different valid document".into();
        assert!(second.validate().unwrap_err().to_string().contains("chain"));
        assert_eq!(second.document.name, "second");
    }
    #[test]
    fn replay_and_author_undo_preserve_other_creators() {
        let a = id();
        let b = id();
        let base =
            Journal::new(quickforge::create_arena("journal", "emptyArena").unwrap()).unwrap();
        let mut first = base.document.clone();
        first.geometry[0].position[0] += 1.;
        let op = id();
        let next = base.propose(&op, &a, 0, first.clone()).unwrap();
        let replay = next.propose(&op, &a, 0, first).unwrap();
        assert_eq!(replay.revision, 1);
        let mut second = base.document.clone();
        second.geometry[0].position[1] += 2.;
        let merged = next.propose(&id(), &b, 0, second).unwrap();
        assert_eq!(merged.revision, 2);
        let undo = merged.reverse(&id(), &a, false).unwrap();
        assert_eq!(
            undo.document.geometry[0].position[0],
            base.document.geometry[0].position[0]
        );
        assert_eq!(
            undo.document.geometry[0].position[1],
            base.document.geometry[0].position[1] + 2.
        );
        assert_eq!(
            undo.reverse(&id(), &a, true).unwrap().document,
            merged.document
        );
        assert!(next.propose(&op, &b, 0, base.document.clone()).is_err());
    }
    #[test]
    fn overlapping_edits_and_inverse_conflicts_do_not_discard_state() {
        let a = id();
        let b = id();
        let base =
            Journal::new(quickforge::create_arena("conflict", "emptyArena").unwrap()).unwrap();
        let mut first = base.document.clone();
        first.geometry[0].position[0] += 1.;
        let next = base.propose(&id(), &a, 0, first).unwrap();
        let mut clash = base.document.clone();
        clash.geometry[0].position[0] += 2.;
        assert!(next.propose(&id(), &b, 0, clash.clone()).is_err());
        let newer = next.propose(&id(), &b, 1, clash).unwrap();
        assert!(newer.reverse(&id(), &a, false).is_err());
        assert_eq!(newer.revision, 2);
    }
    #[test]
    fn durable_acknowledgment_reopens_and_blocks_a_second_host() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("session");
        let base =
            Journal::new(quickforge::create_arena("durable", "emptyArena").unwrap()).unwrap();
        let mut storage = Storage::create(&root, &base).unwrap();
        let mut document = base.document.clone();
        document.name = "saved by creator".into();
        let next = base.propose(&id(), &id(), 0, document).unwrap();
        storage.store(&next).unwrap();
        assert!(Storage::open(&root).is_err());
        drop(storage);
        let (storage, opened) = Storage::open(&root).unwrap();
        assert_eq!(opened.document, next.document);
        assert_eq!(opened.revision, 1);
        drop(storage);
        fs::write(root.join("state-b.json"), b"corrupt controlled fixture").unwrap();
        assert!(Storage::open(&root).is_err());
        assert!(root.join("state-a.json").is_file());
    }
}
