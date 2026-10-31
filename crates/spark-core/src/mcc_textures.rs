//! Read-only MCC Halo 1 texture packs. Original reader; format facts credited in docs.
use crate::{binary::Reader, invalid, maps, Result, SparkError};
use flate2::read::ZlibDecoder;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap, VecDeque},
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::SystemTime,
};
const STRIDE: usize = 328;
const MAX_TOP: usize = 16 * 1024 * 1024;
#[derive(Clone, Debug, PartialEq)]
struct Entry {
    name: String,
    width: u32,
    height: u32,
    depth: u32,
    mips: u32,
    faces: u32,
    format: u32,
    size: u32,
    address: u32,
}
fn entries(bytes: &[u8]) -> Result<Vec<Entry>> {
    let r = Reader(bytes);
    let count = r.u32(0)? as usize;
    if count > 8192 {
        return invalid("MCC texture index exceeds 8192 entries");
    }
    r.bytes(8, count * STRIDE)?;
    let mut result = Vec::with_capacity(count);
    for n in 0..count {
        let at = 8 + n * STRIDE;
        let name_bytes = r.bytes(at, 256)?;
        let end = name_bytes
            .iter()
            .position(|v| *v == 0)
            .ok_or_else(|| SparkError::Invalid("Unterminated MCC texture name".into()))?;
        let name = std::str::from_utf8(&name_bytes[..end])
            .map_err(|_| SparkError::Invalid("Non-UTF8 MCC texture name".into()))?
            .to_string();
        if name.is_empty() || !name.bytes().all(|b| b.is_ascii_graphic() || b == b' ') {
            return invalid("Invalid MCC texture name");
        }
        result.push(Entry {
            name,
            width: r.u32(at + 268)?,
            height: r.u32(at + 272)?,
            depth: r.u32(at + 276)?,
            mips: r.u32(at + 280)?,
            faces: r.u32(at + 284)?,
            format: r.u32(at + 288)?,
            size: r.u32(at + 308)?,
            address: r.u32(at + 312)?,
        });
    }
    Ok(result)
}
pub fn texture_key(path: &str, image: usize) -> Result<String> {
    let normalized = path.replace('\\', "/").to_ascii_lowercase();
    let parts: Vec<_> = normalized.split('/').collect();
    if parts.is_empty()
        || parts.iter().any(|p| {
            p.is_empty()
                || *p == "."
                || *p == ".."
                || !p
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b" _-!+#%&'().".contains(&b))
        })
    {
        return invalid("Unsupported canonical MCC bitmap path");
    }
    let prefix: String = parts[..parts.len() - 1]
        .iter()
        .map(|s| s.chars().next().unwrap())
        .collect();
    Ok(format!(
        "hce_{}_{}_{}",
        prefix,
        parts.last().unwrap().replace(' ', "_"),
        image
    ))
}
fn map_name(name: &str) -> Result<&str> {
    if name.is_empty()
        || name.len() > 64
        || !name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return invalid("Unsupported MCC map resource name");
    }
    Ok(name)
}
pub fn bundle_id(hashes: &BTreeMap<String, String>) -> Result<String> {
    let mut selected = hashes.clone();
    selected.remove("mcc-textures");
    if selected.is_empty()
        || selected
            .values()
            .any(|h| h.len() != 64 || !h.bytes().all(|c| c.is_ascii_hexdigit()))
    {
        return invalid("MCC resources are not SHA-256 pinned");
    }
    Ok(crate::hex_bytes(Sha256::digest(serde_json::to_vec(&selected)?)))
}
pub fn pin(directory: &Path, name: &str) -> Result<BTreeMap<String, String>> {
    let name = map_name(name)?;
    crate::reject_links(directory)?;
    let mut hashes = BTreeMap::new();
    for file in [
        format!("{name}.imeta"),
        "common.ipak".into(),
        "inplace1.ipak".into(),
        "inplace2.ipak".into(),
    ] {
        let path = directory.join(&file);
        crate::reject_links(&path)?;
        if path.is_file() {
            let len = fs::metadata(&path)?.len();
            if len > 2 * 1024 * 1024 * 1024 {
                return invalid("MCC texture pack exceeds 2 GiB");
            }
            hashes.insert(file, maps::hash_file(&path)?);
        }
    }
    if !hashes.contains_key(&format!("{name}.imeta"))
        || !hashes.keys().any(|k| k.ends_with(".ipak"))
    {
        return invalid("Matching MCC imeta and texture packs were not found");
    }
    // Some classic shaders still reference Xbox-era images absent from imeta.
    // Those exact original image spans live in MCC's own shared bitmap map.
    if let Some(shared) = shared_bitmaps_path(directory) {
        if shared.is_file() {
            crate::reject_links(&shared)?;
            if fs::metadata(&shared)?.len() > 2 * 1024 * 1024 * 1024 { return invalid("MCC shared bitmaps exceed 2 GiB"); }
            hashes.insert("mcc-shared-bitmaps.map".into(),maps::hash_file(&shared)?);
        }
    }
    hashes.insert("mcc-textures".into(), bundle_id(&hashes)?);
    Ok(hashes)
}
pub(crate) fn shared_bitmaps_path(directory: &Path) -> Option<PathBuf> {
    Some(directory.parent()?.parent()?.join("maps/bitmaps.map"))
}
#[derive(Clone)]
struct Chunk {
    file: u64,
    packed: usize,
    size: usize,
    logical: u64,
}
struct Pak {
    file: File,
    len: u64,
    modified: SystemTime,
    chunks: Vec<Chunk>,
    logical_len: u64,
    index: Vec<Entry>,
    cache: VecDeque<(usize, Vec<u8>)>,
}
impl Pak {
    fn check(&self) -> Result<()> {
        let meta = self.file.metadata()?;
        if meta.len() != self.len || meta.modified()? != self.modified {
            return invalid("Pinned MCC texture pack changed while open");
        }
        Ok(())
    }
    fn open(path: &Path, expected: &str) -> Result<Self> {
        crate::reject_links(path)?;
        let mut file = File::open(path)?;
        let meta = file.metadata()?;
        if meta.len() > 2 * 1024 * 1024 * 1024 {
            return invalid("MCC pack exceeds 2 GiB");
        }
        let mut sha = Sha256::new();
        let mut buffer = vec![0u8; 65536];
        loop {
            let n = file.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            sha.update(&buffer[..n]);
        }
        if crate::hex_bytes(sha.finalize()) != expected {
            return invalid("Pinned MCC texture pack SHA-256 changed");
        }
        file.seek(SeekFrom::Start(0))?;
        let mut count = [0; 4];
        file.read_exact(&mut count)?;
        let count = u32::from_le_bytes(count) as usize;
        if !(1..=65536).contains(&count) {
            return invalid("MCC chunk count exceeds limits");
        }
        let mut offsets = vec![0u8; count * 4];
        file.read_exact(&mut offsets)?;
        let mut starts: Vec<u64> = offsets
            .chunks_exact(4)
            .map(|b| u32::from_le_bytes(b.try_into().unwrap()) as u64)
            .collect();
        starts.push(meta.len());
        let mut chunks = Vec::with_capacity(count);
        let mut logical = 0u64;
        for n in 0..count {
            let start = starts[n];
            let end = starts[n + 1];
            if start < 4 + (count * 4) as u64
                || end <= start + 4
                || end > meta.len()
                || end - start > 8 * 1024 * 1024
            {
                return invalid("MCC compressed chunk escapes its file");
            }
            file.seek(SeekFrom::Start(start))?;
            let mut size = [0; 4];
            file.read_exact(&mut size)?;
            let size = u32::from_le_bytes(size) as usize;
            if size == 0 || size > 8 * 1024 * 1024 {
                return invalid("MCC inflated chunk exceeds 8 MiB");
            }
            chunks.push(Chunk {
                file: start + 4,
                packed: (end - start - 4) as usize,
                size,
                logical,
            });
            logical += size as u64;
            if logical > 4 * 1024 * 1024 * 1024 {
                return invalid("MCC logical texture data exceeds 4 GiB");
            }
        }
        let mut pak = Self {
            file,
            len: meta.len(),
            modified: meta.modified()?,
            chunks,
            logical_len: logical,
            index: vec![],
            cache: VecDeque::new(),
        };
        let first = pak.range(0, 8)?;
        let count = Reader(&first).u32(0)? as usize;
        if count > 8192 {
            return invalid("MCC pack item count exceeds limits");
        }
        pak.index = entries(&pak.range(0, 8 + count * STRIDE)?)?;
        pak.check()?;
        Ok(pak)
    }
    fn range(&mut self, offset: u64, size: usize) -> Result<Vec<u8>> {
        self.check()?;
        if size > MAX_TOP + 4096
            || offset
                .checked_add(size as u64)
                .is_none_or(|e| e > self.logical_len)
        {
            return invalid("MCC texture span exceeds logical pack bounds");
        }
        let mut out = Vec::with_capacity(size);
        let mut at = offset;
        while out.len() < size {
            let index = self
                .chunks
                .partition_point(|c| c.logical <= at)
                .checked_sub(1)
                .ok_or_else(|| SparkError::Invalid("MCC chunk lookup underflow".into()))?;
            let chunk = self.chunks[index].clone();
            let start = (at - chunk.logical) as usize;
            if !self.cache.iter().any(|(i, _)| *i == index) {
                let mut packed = vec![0; chunk.packed];
                self.file.seek(SeekFrom::Start(chunk.file))?;
                self.file.read_exact(&mut packed)?;
                let mut decoded = Vec::with_capacity(chunk.size);
                ZlibDecoder::new(packed.as_slice())
                    .take(chunk.size as u64 + 1)
                    .read_to_end(&mut decoded)?;
                if decoded.len() != chunk.size {
                    return invalid("MCC inflated chunk length differs from its header");
                }
                while self.cache.iter().map(|(_, b)| b.len()).sum::<usize>() + decoded.len()
                    > 8 * 1024 * 1024
                {
                    self.cache.pop_front();
                }
                self.cache.push_back((index, decoded));
            }
            let data = &self.cache.iter().find(|(i, _)| *i == index).unwrap().1;
            let n = (size - out.len()).min(data.len() - start);
            if n == 0 {
                return invalid("Empty MCC chunk range");
            }
            out.extend_from_slice(&data[start..start + n]);
            at += n as u64;
        }
        self.check()?;
        Ok(out)
    }
}
type SharedPak = Arc<Mutex<Pak>>;
static PACKS: OnceLock<Mutex<HashMap<(PathBuf, String), SharedPak>>> = OnceLock::new();
fn pak(path: &Path, expected: &str) -> Result<SharedPak> {
    let key = (path.to_path_buf(), expected.to_string());
    let cache = PACKS.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(p) = cache
        .lock()
        .map_err(|_| SparkError::Invalid("MCC pack cache unavailable".into()))?
        .get(&key)
    {
        return Ok(p.clone());
    }
    let result = Arc::new(Mutex::new(Pak::open(path, expected)?));
    let mut cache = cache
        .lock()
        .map_err(|_| SparkError::Invalid("MCC pack cache unavailable".into()))?;
    if cache.len() >= 8 {
        cache.clear();
    }
    cache.insert(key, result.clone());
    Ok(result)
}
pub struct TextureBundle {
    entries: Vec<Entry>,
    paks: Vec<SharedPak>,
    pub sha256: String,
}
pub struct TopMip {
    pub width: u16,
    pub height: u16,
    pub format: &'static str,
    pub pixels: Vec<u8>,
}
impl TextureBundle {
    pub fn contains_key(&self, key: &str) -> Result<bool> {
        match self.entries.iter().filter(|e|e.name==key).count() {
            0 => Ok(false), 1 => Ok(true), _ => invalid("Ambiguous duplicate MCC texture key"),
        }
    }
    pub fn open(directory: &Path, hashes: &BTreeMap<String, String>, name: &str) -> Result<Self> {
        let name = map_name(name)?;
        let sha = bundle_id(hashes)?;
        if hashes.get("mcc-textures") != Some(&sha) {
            return invalid("MCC texture bundle identity differs from its pinned files");
        }
        let filename = format!("{name}.imeta");
        let expected = hashes
            .get(&filename)
            .ok_or_else(|| SparkError::Invalid("Matching map imeta was not pinned".into()))?;
        let path = directory.join(&filename);
        crate::reject_links(&path)?;
        let mut bytes = Vec::new();
        File::open(&path)?
            .take((8 + 8192 * STRIDE + 1) as u64)
            .read_to_end(&mut bytes)?;
        if bytes.len() > 8 + 8192 * STRIDE || crate::hex_bytes(Sha256::digest(&bytes)) != *expected {
            return invalid("MCC map texture index changed or exceeds limits");
        }
        let entries = entries(&bytes)?;
        let mut paks = vec![];
        for file in ["common.ipak", "inplace1.ipak", "inplace2.ipak"] {
            if let Some(hash) = hashes.get(file) {
                paks.push(pak(&directory.join(file), hash)?);
            }
        }
        if paks.is_empty() {
            return invalid("MCC resource pack missing");
        }
        Ok(Self {
            entries,
            paks,
            sha256: sha,
        })
    }
    pub fn top_mip(&mut self, key: &str) -> Result<TopMip> {
        let mut found = self.entries.iter().filter(|e| e.name == key);
        let entry = found
            .next()
            .ok_or_else(|| {
                SparkError::Invalid("Exact MCC texture key is missing from this map imeta".into())
            })?
            .clone();
        if found.next().is_some() {
            return invalid("Ambiguous duplicate MCC texture key");
        }
        if entry.width == 0
            || entry.height == 0
            || entry.width > 4096
            || entry.height > 4096
            || entry.depth != 1
            || entry.faces != 1
            || entry.mips > 16
        {
            return invalid("MCC texture is not a bounded single-slice 2D image");
        }
        let (format, block, stride) = match entry.format {
            10 | 48 => ("A8Y8", false, 2),
            70 | 12 | 13 => ("DXT1", true, 8),
            73 | 15 => ("DXT3", true, 16),
            76 | 17 => ("DXT5", true, 16),
            90 | 0 => ("BGRA8", false, 4),
            22 => ("BGRX8", false, 4),
            _ => return invalid("MCC texture pixel format is not supported"),
        };
        let size = if block {
            entry.width.div_ceil(4) as usize * entry.height.div_ceil(4) as usize * stride
        } else {
            entry.width as usize * entry.height as usize * stride
        };
        if size > MAX_TOP || size > entry.size as usize {
            return invalid("MCC texture top mip exceeds its bounded record");
        }
        let mut matches = vec![];
        for p in &self.paks {
            let p = p
                .lock()
                .map_err(|_| SparkError::Invalid("MCC pack busy".into()))?;
            for candidate in p.index.iter().filter(|e| e.name == key) {
                if candidate == &entry {
                    matches.push(candidate.clone());
                }
            }
        }
        if matches.len() != 1 {
            return invalid("MCC texture does not have one exact imeta-to-pack identity");
        }
        for p in &self.paks {
            let mut p = p
                .lock()
                .map_err(|_| SparkError::Invalid("MCC pack busy".into()))?;
            if !p.index.iter().any(|e| e == &entry) {
                continue;
            }
            let head = p.range(entry.address as u64, 58)?;
            let r = Reader(&head);
            if r.bytes(6, 4)? != b"TCIP"
                || r.u32(16)? != entry.width
                || r.u32(20)? != entry.height
                || r.u32(24)? != entry.depth
                || r.u32(28)? != entry.faces
            {
                return invalid("MCC texture chunk header differs from exact index metadata");
            }
            let pixels = p.range(entry.address as u64 + 58, size)?;
            return Ok(TopMip {
                width: entry.width as u16,
                height: entry.height as u16,
                format,
                pixels,
            });
        }
        invalid("MCC texture source disappeared")
    }
}
