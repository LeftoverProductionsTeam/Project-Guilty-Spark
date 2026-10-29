//! User-requested map data downloads. No executable, installer or game writes.
use reqwest::{header, Client, Response, Url};
use serde::Serialize;
use sha2::{Digest, Sha256};
use spark_core::{archive, invalid, maps, reject_links, Result, SparkError};
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    future::Future,
    io::{Read, Write},
    net::{IpAddr, SocketAddr, ToSocketAddrs},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc, Arc, Mutex,
    },
    task::{Poll, Waker},
    time::{Duration, Instant},
};

const MAX_BYTES: u64 = 768 * 1024 * 1024;
const MAX_JOBS: usize = 32;
const MAX_ACTIVE: usize = 2;
const MAX_REDIRECTS: usize = 4;
static DNS_ACTIVE: AtomicUsize = AtomicUsize::new(0);
const CANCELLED: &str = "Download cancelled";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum Phase {
    Queued,
    Resolving,
    Downloading,
    Validating,
    Publishing,
    Downloaded,
    Importing,
    Imported,
    Cancelled,
    Failed,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DownloadReceipt {
    pub id: String,
    pub path: PathBuf,
    pub sha256: String,
    pub bytes: u64,
    pub source_url: String,
    pub created_at: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DownloadStatus {
    pub id: String,
    pub phase: Phase,
    pub bytes: u64,
    pub total: Option<u64>,
    pub source_url: String,
    pub detail: String,
    pub receipt: Option<DownloadReceipt>,
    pub project_ids: Vec<String>,
}
#[derive(Clone, Copy)]
enum Kind {
    Map,
    Zip,
}
impl Kind {
    fn extension(self) -> &'static str {
        match self {
            Self::Map => "map",
            Self::Zip => "zip",
        }
    }
}
struct Job {
    url: Url,
    kind: Kind,
    created: Instant,
    cancelled: AtomicBool,
    waker: Mutex<Option<Waker>>,
    status: Mutex<DownloadStatus>,
}
#[derive(Default)]
pub(super) struct DownloadRegistry {
    jobs: Mutex<BTreeMap<String, Arc<Job>>>,
}

fn lock<T>(mutex: &Mutex<T>) -> Result<std::sync::MutexGuard<'_, T>> {
    mutex
        .lock()
        .map_err(|_| SparkError::Invalid("Download state is unavailable".into()))
}
fn source_label(url: &Url) -> String {
    format!(
        "{} /… (path and query kept private)",
        url.origin().ascii_serialization()
    )
}
fn checked_url(value: &str, initial: bool) -> Result<(Url, Option<Kind>)> {
    if value.len() > 4096 || value.chars().any(char::is_control) {
        return invalid("Use a direct HTTPS .map or .zip URL of at most 4096 characters");
    }
    let url =
        Url::parse(value).map_err(|_| SparkError::Invalid("The download URL is invalid".into()))?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port_or_known_default() != Some(443)
        || url.fragment().is_some()
    {
        return invalid(
            "Downloads require HTTPS on port 443 without user credentials or fragments",
        );
    }
    let host = url
        .host_str()
        .ok_or_else(|| SparkError::Invalid("Download URL has no host".into()))?
        .trim_matches(['[', ']'])
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if host == "localhost"
        || [
            ".localhost",
            ".local",
            ".lan",
            ".internal",
            ".home",
            ".invalid",
        ]
        .iter()
        .any(|s| host.ends_with(s))
    {
        return invalid("Local and internal download hosts are not allowed");
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        if !public_ip(ip) {
            return invalid("Download hosts must resolve exclusively to public Internet addresses");
        }
    }
    let path = url.path().to_ascii_lowercase();
    let kind = if path.ends_with(".map") {
        Some(Kind::Map)
    } else if path.ends_with(".zip") {
        Some(Kind::Zip)
    } else {
        None
    };
    if initial && kind.is_none() {
        return invalid("Paste the author's direct .map or .zip link. Catalog/HTML pages and executable downloads are not supported");
    }
    if [
        ".exe", ".dll", ".msi", ".bat", ".cmd", ".ps1", ".js", ".vbs", ".com", ".scr",
    ]
    .iter()
    .any(|ext| path.ends_with(ext))
    {
        return invalid("Executable and script downloads are not supported");
    }
    Ok((url, kind))
}
fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            let o = v.octets();
            !v.is_private()
                && !v.is_loopback()
                && !v.is_link_local()
                && !v.is_multicast()
                && !v.is_broadcast()
                && !v.is_unspecified()
                && !v.is_documentation()
                && o[0] != 0
                && o[0] < 224
                && !(o[0] == 100 && (64..=127).contains(&o[1]))
                && !(o[0] == 192 && o[1] == 0 && o[2] == 0)
                && !(o[0] == 198 && (o[1] == 18 || o[1] == 19))
        }
        IpAddr::V6(v) => {
            if let Some(v4) = v.to_ipv4_mapped() {
                return public_ip(IpAddr::V4(v4));
            }
            let s = v.segments();
            (s[0] & 0xe000) == 0x2000
                && !(s[0] == 0x2001 && s[1] < 0x0200)
                && !(s[0] == 0x2001 && s[1] == 0x0db8)
                && s[0] != 0x2002
                && s[0] != 0x3ffe
                && !(s[0] == 0x3fff && s[1] < 0x1000)
        }
    }
}
fn check_cancel(job: &Job) -> Result<()> {
    if job.cancelled.load(Ordering::Acquire) {
        invalid(CANCELLED)
    } else {
        Ok(())
    }
}
fn phase(job: &Job, value: Phase, detail: &str) -> Result<()> {
    let mut state = lock(&job.status)?;
    state.phase = value;
    state.detail = detail.into();
    Ok(())
}
async fn cancellable<F: Future>(job: &Job, future: F) -> Result<F::Output> {
    let mut future = std::pin::pin!(future);
    std::future::poll_fn(|context| {
        if job.cancelled.load(Ordering::Acquire) {
            return Poll::Ready(invalid(CANCELLED));
        }
        let Ok(mut slot) = job.waker.lock() else {
            return Poll::Ready(invalid("Download cancellation state is unavailable"));
        };
        *slot = Some(context.waker().clone());
        drop(slot);
        if job.cancelled.load(Ordering::Acquire) {
            return Poll::Ready(invalid(CANCELLED));
        }
        future.as_mut().poll(context).map(Ok)
    })
    .await
}
fn resolve_public(job: &Job, url: &Url) -> Result<Vec<SocketAddr>> {
    let host = url.host_str().unwrap().trim_matches(['[', ']']).to_owned();
    if let Ok(ip) = host.parse::<IpAddr>() {
        return if public_ip(ip) {
            Ok(vec![SocketAddr::new(ip, 443)])
        } else {
            invalid("Nonpublic download address refused")
        };
    }
    let mut count = DNS_ACTIVE.load(Ordering::Acquire);
    loop {
        if count >= 4 {
            return invalid("DNS resolver is busy; retry after the other download finishes");
        }
        match DNS_ACTIVE.compare_exchange_weak(
            count,
            count + 1,
            Ordering::AcqRel,
            Ordering::Acquire,
        ) {
            Ok(_) => break,
            Err(actual) => count = actual,
        }
    }
    let (tx, rx) = mpsc::sync_channel(1);
    let spawned = std::thread::Builder::new()
        .name("spark-map-dns".into())
        .spawn(move || {
            struct Count;
            impl Drop for Count {
                fn drop(&mut self) {
                    DNS_ACTIVE.fetch_sub(1, Ordering::AcqRel);
                }
            }
            let _count = Count;
            let result = (host.as_str(), 443)
                .to_socket_addrs()
                .map(|addresses| addresses.take(33).collect::<Vec<_>>());
            let _ = tx.send(result);
        });
    if spawned.is_err() {
        DNS_ACTIVE.fetch_sub(1, Ordering::AcqRel);
        return invalid("DNS resolver could not start");
    }
    let until = Instant::now() + Duration::from_secs(5);
    loop {
        check_cancel(job)?;
        if Instant::now() >= until {
            return invalid("Download host lookup timed out");
        }
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(Ok(addresses)) => {
                if addresses.is_empty()
                    || addresses.len() > 32
                    || addresses.iter().any(|a| !public_ip(a.ip()))
                {
                    return invalid("Download hosts must resolve exclusively to bounded public Internet addresses");
                }
                return Ok(addresses);
            }
            Ok(Err(_)) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                return invalid("Download host lookup failed")
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
    }
}
async fn fetch_response(job: &Job) -> Result<Response> {
    let mut url = job.url.clone();
    for hop in 0..=MAX_REDIRECTS {
        check_cancel(job)?;
        let addresses = resolve_public(job, &url)?;
        let client = Client::builder()
            .https_only(true)
            .no_proxy()
            .no_gzip()
            .no_brotli()
            .no_deflate()
            .no_zstd()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .read_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(600))
            .user_agent("ProjectGuiltySpark/0.4 MapDataDownload")
            .resolve_to_addrs(url.host_str().unwrap(), &addresses)
            .build()
            .map_err(|_| {
                SparkError::Invalid("HTTPS download client could not initialize".into())
            })?;
        let response = cancellable(
            job,
            client
                .get(url.clone())
                .header(header::ACCEPT_ENCODING, "identity")
                .send(),
        )
        .await?
        .map_err(|_| SparkError::Invalid("HTTPS transfer failed or timed out".into()))?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| {
                    SparkError::Invalid("Download redirect has no valid destination".into())
                })?;
            url = checked_redirect(&url, location, hop)?;
            continue;
        }
        if response.status() != reqwest::StatusCode::OK {
            return invalid(format!(
                "Download server returned HTTP {}",
                response.status().as_u16()
            ));
        }
        return Ok(response);
    }
    invalid("Download redirect limit exceeded")
}
fn checked_redirect(current: &Url, location: &str, hop: usize) -> Result<Url> {
    if hop >= MAX_REDIRECTS {
        return invalid("Download exceeded four HTTPS redirects");
    }
    if location.len() > 4096 {
        return invalid("Download redirect URL exceeds its length limit");
    }
    let next = current
        .join(location)
        .map_err(|_| SparkError::Invalid("Download redirect URL is invalid".into()))?;
    Ok(checked_url(next.as_str(), false)?.0)
}

struct Partial {
    path: PathBuf,
    active: bool,
}
fn publish_unique(partial: &Path, destination: &Path) -> Result<()> {
    // Unlike rename-with-replacement, creating this same-filesystem link
    // atomically fails when a destination appeared concurrently. There is no
    // copy/overwrite fallback on filesystems without this capability.
    fs::hard_link(partial,destination).map_err(|_|SparkError::Invalid("Could not publish a unique download atomically; use a filesystem supporting local hard links and an unoccupied destination".into()))?;
    fs::remove_file(partial)?;
    Ok(())
}
impl Drop for Partial {
    fn drop(&mut self) {
        if self.active {
            let _ = fs::remove_file(&self.path);
        }
    }
}
async fn save_response(
    job: &Job,
    root: &Path,
    mut response: Response,
    limit: u64,
) -> Result<DownloadReceipt> {
    if response.status() != reqwest::StatusCode::OK {
        return invalid("Download requires a complete HTTP 200 response");
    }
    if response
        .headers()
        .get(header::CONTENT_ENCODING)
        .is_some_and(|h| h.as_bytes() != b"identity")
    {
        return invalid("Compressed HTTP responses are not accepted for map downloads");
    }
    if let Some(value) = response.headers().get(header::CONTENT_TYPE) {
        let content = value.to_str().unwrap_or("").to_ascii_lowercase();
        if content.starts_with("text/")
            || content.contains("json")
            || content.contains("html")
            || content.contains("msdownload")
            || content.contains("executable")
        {
            return invalid(
                "The server returned a page, executable or error document instead of map data",
            );
        }
    }
    let expected = response.content_length();
    if expected.is_some_and(|n| n > limit) {
        return invalid("Download exceeds the map/package byte limit (maximum 768 MiB)");
    }
    check_cancel(job)?;
    reject_links(root)?;
    fs::create_dir_all(root)?;
    reject_links(root)?;
    let id = lock(&job.status)?.id.clone();
    let directory = root.join(&id);
    fs::create_dir(&directory)?;
    reject_links(&directory)?;
    let mut owner = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(directory.join(".download-owner.json"))?;
    owner.write_all(&serde_json::to_vec(
        &serde_json::json!({"owner":"ProjectGuiltySpark/download-v1","id":id}),
    )?)?;
    owner.sync_all()?;
    drop(owner);
    let path = directory.join("download.partial");
    let mut guard = Partial {
        path: path.clone(),
        active: true,
    };
    let mut output = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&path)?;
    {
        let mut status = lock(&job.status)?;
        status.phase = Phase::Downloading;
        status.total = expected;
        status.detail = "Downloading preserved map data".into();
    }
    let (mut bytes, mut hash, mut prefix) = (0u64, Sha256::new(), Vec::<u8>::with_capacity(2048));
    while let Some(chunk) = cancellable(job, response.chunk())
        .await?
        .map_err(|_| SparkError::Invalid("Download stream was interrupted or timed out".into()))?
    {
        check_cancel(job)?;
        bytes = bytes
            .checked_add(chunk.len() as u64)
            .ok_or_else(|| SparkError::Invalid("Download byte count overflow".into()))?;
        if bytes > limit {
            return invalid("Download exceeds the map/package byte limit (maximum 768 MiB)");
        }
        prefix.extend_from_slice(&chunk[..chunk.len().min(2048 - prefix.len())]);
        if prefix.starts_with(b"MZ")
            || prefix.starts_with(b"<!DOCTYPE")
            || prefix.starts_with(b"<html")
        {
            return invalid("The response is not supported map/archive data");
        }
        if matches!(job.kind, Kind::Zip) && prefix.len() >= 4 && !prefix.starts_with(b"PK\x03\x04")
        {
            return invalid("The response has no supported ZIP signature");
        }
        output.write_all(&chunk)?;
        hash.update(&chunk);
        lock(&job.status)?.bytes = bytes;
    }
    check_cancel(job)?;
    if bytes == 0 || expected.is_some_and(|n| n != bytes) {
        return invalid(
            "Download length is empty or differs from the server's complete-file length",
        );
    }
    output.sync_all()?;
    drop(output);
    phase(job, Phase::Validating, "Checking cache/archive structure")?;
    match job.kind {
        Kind::Map => {
            maps::inspect_header(&path).map_err(|_| {
                SparkError::Invalid(
                    "Downloaded map is not a supported, bounded Halo scenario cache".into(),
                )
            })?;
        }
        Kind::Zip => {
            let inventory = archive::inventory(&path).map_err(|_| {
                SparkError::Invalid(
                    "Downloaded ZIP is corrupt or uses an unsupported archive format".into(),
                )
            })?;
            let count = inventory
                .entries
                .iter()
                .filter(|e| matches!(e.classification.as_str(), "scenarioMap" | "extendedMap"))
                .count();
            if count == 0 {
                return invalid("Downloaded ZIP contains no supported map candidates");
            }
            if count > 64 {
                return invalid("Download packages are limited to 64 map candidates; import larger local archives separately");
            }
        }
    }
    check_cancel(job)?;
    let sha256 = format!("{:x}", hash.finalize());
    // Pin the completed local bytes before publishing a path for import.
    let mut file = File::open(&path)?;
    let mut verified = Sha256::new();
    let mut checked = 0u64;
    let mut buffer = [0u8; 65536];
    loop {
        check_cancel(job)?;
        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        checked += n as u64;
        if checked > limit {
            return invalid("Download changed beyond its byte limit");
        }
        verified.update(&buffer[..n]);
    }
    drop(file);
    if checked != bytes || format!("{:x}", verified.finalize()) != sha256 {
        return invalid("Downloaded bytes changed during validation");
    }
    let final_path = directory.join(format!("download.{}", job.kind.extension()));
    if final_path.exists() {
        return invalid("Fresh download destination is occupied");
    }
    {
        let mut status = lock(&job.status)?;
        check_cancel(job)?;
        status.phase = Phase::Publishing;
        status.detail = "Preserving verified download atomically".into();
    }
    publish_unique(&path, &final_path)?;
    guard.active = false;
    let receipt = DownloadReceipt {
        id: id.clone(),
        path: final_path.clone(),
        sha256,
        bytes,
        source_url: source_label(&job.url),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let metadata = directory.join("download-receipt.json");
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(metadata)?;
    file.write_all(&serde_json::to_vec_pretty(&receipt)?)?;
    file.sync_all()?;
    let mut permissions = fs::metadata(&final_path)?.permissions();
    permissions.set_readonly(true);
    fs::set_permissions(&final_path, permissions)?;
    Ok(receipt)
}

impl DownloadRegistry {
    fn job(&self, id: &str) -> Result<Arc<Job>> {
        lock(&self.jobs)?
            .get(id)
            .cloned()
            .ok_or_else(|| SparkError::Invalid("Download job is unknown or expired".into()))
    }
    pub(super) fn prepare(&self, url: &str) -> Result<DownloadStatus> {
        let (url, kind) = checked_url(url, true)?;
        let mut jobs = lock(&self.jobs)?;
        if jobs.len() >= MAX_JOBS {
            let old = jobs
                .iter()
                .filter(|(_, job)| {
                    job.status.lock().is_ok_and(|s| {
                        matches!(s.phase, Phase::Imported | Phase::Cancelled | Phase::Failed)
                    })
                })
                .min_by_key(|(_, job)| job.created)
                .map(|(id, _)| id.clone());
            if let Some(old) = old {
                jobs.remove(&old);
            } else {
                return invalid("Finish or cancel an existing download before starting another");
            }
        }
        let id = uuid::Uuid::new_v4().to_string();
        let status = DownloadStatus {
            id: id.clone(),
            phase: Phase::Queued,
            bytes: 0,
            total: None,
            source_url: source_label(&url),
            detail: "Ready to download the reviewed direct link".into(),
            receipt: None,
            project_ids: vec![],
        };
        jobs.insert(
            id,
            Arc::new(Job {
                url,
                kind: kind.unwrap(),
                created: Instant::now(),
                cancelled: AtomicBool::new(false),
                waker: Mutex::new(None),
                status: Mutex::new(status.clone()),
            }),
        );
        Ok(status)
    }
    pub(super) fn status(&self, id: &str) -> Result<DownloadStatus> {
        Ok(lock(&self.job(id)?.status)?.clone())
    }
    pub(super) fn cancel(&self, id: &str) -> Result<bool> {
        let job = self.job(id)?;
        let mut state = lock(&job.status)?;
        if matches!(
            state.phase,
            Phase::Publishing
                | Phase::Downloaded
                | Phase::Importing
                | Phase::Imported
                | Phase::Failed
                | Phase::Cancelled
        ) {
            return Ok(false);
        }
        job.cancelled.store(true, Ordering::Release);
        if state.phase == Phase::Queued {
            state.phase = Phase::Cancelled;
            state.detail = CANCELLED.into();
        }
        drop(state);
        let wake = lock(&job.waker)?.take();
        if let Some(wake) = wake {
            wake.wake();
        }
        Ok(true)
    }
    fn execute(
        &self,
        id: &str,
        root: &Path,
        fetch: impl FnOnce(Arc<Job>) -> Result<Response>,
    ) -> Result<DownloadReceipt> {
        self.execute_bound(id, root, fetch, MAX_BYTES)
    }
    fn execute_bound(
        &self,
        id: &str,
        root: &Path,
        fetch: impl FnOnce(Arc<Job>) -> Result<Response>,
        limit: u64,
    ) -> Result<DownloadReceipt> {
        let job = self.job(id)?;
        {
            let jobs = lock(&self.jobs)?;
            let active = jobs
                .values()
                .filter(|j| {
                    j.status.lock().is_ok_and(|s| {
                        matches!(
                            s.phase,
                            Phase::Resolving
                                | Phase::Downloading
                                | Phase::Validating
                                | Phase::Publishing
                        )
                    })
                })
                .count();
            if active >= MAX_ACTIVE {
                return invalid("Two map downloads are already active");
            }
            let mut state = lock(&job.status)?;
            if state.phase == Phase::Cancelled {
                return invalid(CANCELLED);
            }
            if state.phase != Phase::Queued {
                return invalid("Download job has already started");
            }
            state.phase = Phase::Resolving;
            state.detail = "Resolving and validating the download host".into();
        }
        let result = (|| {
            check_cancel(&job)?;
            let response = fetch(job.clone())?;
            tauri::async_runtime::block_on(save_response(&job, root, response, limit))
        })();
        lock(&job.waker)?.take();
        match &result {
            Ok(receipt) => {
                let mut state = lock(&job.status)?;
                state.phase = Phase::Downloaded;
                state.detail =
                    "Download preserved and validated; ready for source-safe import".into();
                state.receipt = Some(receipt.clone());
            }
            Err(_) => {
                let mut state = lock(&job.status)?;
                state.phase = if job.cancelled.load(Ordering::Acquire) {
                    Phase::Cancelled
                } else {
                    Phase::Failed
                };
                state.detail = if state.phase == Phase::Cancelled {
                    CANCELLED.into()
                } else {
                    "Download failed; no source or game content was replaced".into()
                };
            }
        }
        result
    }
    pub(super) fn download(&self, id: &str, root: &Path) -> Result<DownloadReceipt> {
        self.execute(id, root, |job| {
            tauri::async_runtime::block_on(fetch_response(&job))
        })
    }
    pub(super) fn mark_importing(&self, id: &str) -> Result<()> {
        let job = self.job(id)?;
        let mut state = lock(&job.status)?;
        if state.phase != Phase::Downloaded {
            return invalid("Download is not ready for import");
        }
        state.phase = Phase::Importing;
        state.detail = "Importing preserved maps; archive validation will finish safely".into();
        Ok(())
    }
    pub(super) fn mark_imported(&self, id: &str, project_ids: Vec<String>) -> Result<()> {
        let job = self.job(id)?;
        let mut state = lock(&job.status)?;
        state.phase = Phase::Imported;
        state.project_ids = project_ids;
        state.detail = "Preserved map projects are ready to open".into();
        Ok(())
    }
    pub(super) fn mark_import_failed(&self, id: &str) -> Result<()> {
        let job = self.job(id)?;
        phase(
            &job,
            Phase::Failed,
            "Import failed; the completed download and provenance remain preserved",
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    fn fixture_map() -> Vec<u8> {
        let mut b = vec![0u8; 8192];
        let put =
            |b: &mut Vec<u8>, at: usize, n: u32| b[at..at + 4].copy_from_slice(&n.to_le_bytes());
        for (at, n) in [
            (0, 0x68656164),
            (4, 609),
            (8, 8192),
            (0x10, 0x800),
            (0x14, 0x1800),
            (0x7fc, 0x666f6f74),
            (0x800, 0x40440028),
            (0x804, 0xe0000000),
            (0x80c, 1),
            (0x824, 0x74616773),
            (0x834, 0xe0000000),
            (0x838, 0x40440100),
            (0x83c, 0x40440800),
        ] {
            put(&mut b, at, n);
        }
        b[0x20..0x27].copy_from_slice(b"fixture");
        b[0x60] = 1;
        b[0x828..0x82c].copy_from_slice(b"rncs");
        b[0x900..0x907].copy_from_slice(b"fixture");
        b
    }
    #[test]
    fn atomic_publication_never_replaces_an_existing_file() {
        let root = tempfile::tempdir().unwrap();
        let partial = root.path().join("download.partial");
        let existing = root.path().join("existing.map");
        fs::write(&partial, b"new verified data").unwrap();
        fs::write(&existing, b"preserved original").unwrap();
        assert!(publish_unique(&partial, &existing).is_err());
        assert_eq!(fs::read(&existing).unwrap(), b"preserved original");
        let fresh = root.path().join("new.map");
        publish_unique(&partial, &fresh).unwrap();
        assert_eq!(fs::read(fresh).unwrap(), b"new verified data");
        assert!(!partial.exists());
    }
    fn response(body: Vec<u8>, headers: &str) -> Response {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let headers = headers.to_owned();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut input = [0; 2048];
            let _ = stream.read(&mut input);
            let _ = write!(
                stream,
                "HTTP/1.1 200 OK\r\nConnection: close\r\n{headers}\r\n"
            );
            let _ = stream.write_all(&body);
        });
        // Only this cfg(test) fixture bypasses the production HTTPS/public-IP
        // admission path; the real response/storage/cancellation code is used.
        tauri::async_runtime::block_on(
            Client::builder()
                .no_proxy()
                .build()
                .unwrap()
                .get(format!("http://{address}/fixture"))
                .send(),
        )
        .unwrap()
    }
    fn stored_zip(name: &str, data: &[u8]) -> Vec<u8> {
        let mut crc = 0xffff_ffffu32;
        for &byte in data {
            crc ^= byte as u32;
            for _ in 0..8 {
                crc = (crc >> 1) ^ if crc & 1 != 0 { 0xedb88320 } else { 0 };
            }
        }
        crc ^= 0xffff_ffff;
        let mut local = vec![0u8; 30];
        let p16 =
            |b: &mut Vec<u8>, at: usize, n: u16| b[at..at + 2].copy_from_slice(&n.to_le_bytes());
        let p32 =
            |b: &mut Vec<u8>, at: usize, n: u32| b[at..at + 4].copy_from_slice(&n.to_le_bytes());
        p32(&mut local, 0, 0x04034b50);
        p16(&mut local, 4, 20);
        p32(&mut local, 14, crc);
        p32(&mut local, 18, data.len() as u32);
        p32(&mut local, 22, data.len() as u32);
        p16(&mut local, 26, name.len() as u16);
        local.extend_from_slice(name.as_bytes());
        local.extend_from_slice(data);
        let central_at = local.len() as u32;
        let mut central = vec![0u8; 46];
        p32(&mut central, 0, 0x02014b50);
        p16(&mut central, 4, 20);
        p16(&mut central, 6, 20);
        p32(&mut central, 16, crc);
        p32(&mut central, 20, data.len() as u32);
        p32(&mut central, 24, data.len() as u32);
        p16(&mut central, 28, name.len() as u16);
        central.extend_from_slice(name.as_bytes());
        let central_size = central.len() as u32;
        local.extend(central);
        let mut end = vec![0u8; 22];
        p32(&mut end, 0, 0x06054b50);
        p16(&mut end, 8, 1);
        p16(&mut end, 10, 1);
        p32(&mut end, 12, central_size);
        p32(&mut end, 16, central_at);
        local.extend(end);
        local
    }
    #[test]
    fn url_admission_blocks_ssrf_credentials_executables_and_redacts_provenance() {
        for url in [
            "http://example.com/map.map",
            "https://127.0.0.1/map.map",
            "https://2130706433/map.map",
            "https://[::1]/map.map",
            "https://[::ffff:127.0.0.1]/map.map",
            "https://169.254.169.254/map.map",
            "https://100.64.1.2/map.map",
            "https://user:pass@example.com/map.map",
            "https://example.com/game.exe",
            "https://example.com/catalog.html",
            "https://example.com:8443/map.map",
        ] {
            assert!(checked_url(url, true).is_err(), "{url}");
        }
        let registry = DownloadRegistry::default();
        let status = registry
            .prepare("https://example.com/private-path/map.zip?key=synthetic-value")
            .unwrap();
        let json = serde_json::to_string(&status).unwrap();
        assert!(!json.contains("synthetic-value"));
        assert!(!json.contains("private-path"));
        assert!(!public_ip("198.18.1.1".parse().unwrap()));
        assert!(public_ip("8.8.8.8".parse().unwrap()));
        assert!(!public_ip("2001:db8::1".parse().unwrap()));
        assert!(public_ip("2606:4700:4700::1111".parse().unwrap()));
    }
    #[test]
    fn native_http_fixture_downloads_hashes_and_imports_real_synthetic_map() {
        let root = tempfile::tempdir().unwrap();
        let registry = DownloadRegistry::default();
        let status = registry.prepare("https://example.com/arena.map").unwrap();
        let bytes = fixture_map();
        let receipt = registry
            .execute(&status.id, &root.path().join("downloads"), |_| {
                Ok(response(
                    bytes.clone(),
                    &format!(
                        "Content-Type: application/octet-stream\r\nContent-Length: {}\r\n",
                        bytes.len()
                    ),
                ))
            })
            .unwrap();
        assert_eq!(receipt.sha256, format!("{:x}", Sha256::digest(&bytes)));
        assert_eq!(fs::read(&receipt.path).unwrap(), bytes);
        assert!(!receipt.path.with_file_name("download.partial").exists());
        let library = spark_core::library::Library::open(&root.path().join("library")).unwrap();
        let (project, inspection) = library.import_map(&receipt.path, None).unwrap();
        assert_eq!(inspection.header.version, 609);
        assert_eq!(project.source.unwrap().sha256, receipt.sha256);
    }
    #[test]
    fn native_http_fixture_preserves_zip_then_imports_its_scenario() {
        let root = tempfile::tempdir().unwrap();
        let registry = DownloadRegistry::default();
        let status = registry.prepare("https://example.com/arena.zip").unwrap();
        let bytes = stored_zip("arena.map", &fixture_map());
        let receipt = registry
            .execute(&status.id, &root.path().join("downloads"), |_| {
                Ok(response(
                    bytes.clone(),
                    &format!(
                        "Content-Type: application/zip\r\nContent-Length: {}\r\n",
                        bytes.len()
                    ),
                ))
            })
            .unwrap();
        fs::create_dir(root.path().join("library")).unwrap();
        let imported =
            archive::import_archive(&receipt.path, &root.path().join("library")).unwrap();
        assert_eq!(imported.maps.len(), 1);
        assert_eq!(imported.sha256, receipt.sha256);
        assert_eq!(fs::read(&imported.preserved_path).unwrap(), bytes);
        let library = spark_core::library::Library::open(&root.path().join("projects")).unwrap();
        let (_, inspection) = library.import_map(&imported.maps[0].path, None).unwrap();
        assert_eq!(inspection.header.version, 609);
    }
    #[test]
    fn streaming_limit_does_not_trust_an_absent_content_length() {
        let root = tempfile::tempdir().unwrap();
        let registry = DownloadRegistry::default();
        let status = registry.prepare("https://example.com/arena.map").unwrap();
        assert!(registry
            .execute_bound(
                &status.id,
                root.path(),
                |_| Ok(response(
                    fixture_map(),
                    "Content-Type: application/octet-stream\r\n"
                )),
                4096
            )
            .is_err());
        assert!(!root
            .path()
            .join(&status.id)
            .join("download.partial")
            .exists());
        assert!(!root.path().join(&status.id).join("download.map").exists());
    }
    #[test]
    fn every_redirect_repeats_protocol_address_and_credential_admission() {
        let source = Url::parse("https://example.com/arena.zip").unwrap();
        for target in [
            "http://example.com/arena.zip",
            "https://127.0.0.1/arena.zip",
            "//169.254.169.254/arena.zip",
            "https://user:pass@example.com/arena.zip",
            "https://example.com/game.exe",
        ] {
            assert!(checked_redirect(&source, target, 0).is_err());
        }
        assert!(checked_redirect(&source, "https://cdn.example.com/arena.zip", 4).is_err());
        assert_eq!(
            checked_redirect(&source, "https://cdn.example.com/opaque?key=synthetic", 3)
                .unwrap()
                .host_str(),
            Some("cdn.example.com")
        );
    }
    #[test]
    fn cancellation_wakes_an_inflight_body_and_removes_partial_bytes() {
        let root = tempfile::tempdir().unwrap();
        let registry = DownloadRegistry::default();
        let status = registry.prepare("https://example.com/arena.map").unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let bytes = fixture_map();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0u8; 2048];
            let _ = stream.read(&mut request);
            let _=write!(stream,"HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/octet-stream\r\nConnection: close\r\n\r\n",bytes.len());
            let _ = stream.write_all(&bytes[..4096]);
            let _ = stream.flush();
            std::thread::sleep(Duration::from_millis(700));
            let _ = stream.write_all(&bytes[4096..]);
        });
        std::thread::scope(|scope| {
            scope.spawn(|| {
                let until = Instant::now() + Duration::from_secs(3);
                loop {
                    if registry.status(&status.id).unwrap().bytes > 0 {
                        assert!(registry.cancel(&status.id).unwrap());
                        break;
                    }
                    assert!(Instant::now() < until, "stream never exposed progress");
                    std::thread::sleep(Duration::from_millis(2));
                }
            });
            let result = registry.execute(&status.id, root.path(), |_| {
                Ok(tauri::async_runtime::block_on(
                    Client::builder()
                        .no_proxy()
                        .build()
                        .unwrap()
                        .get(format!("http://{address}/fixture"))
                        .send(),
                )
                .unwrap())
            });
            assert!(result.is_err());
        });
        assert_eq!(registry.status(&status.id).unwrap().phase, Phase::Cancelled);
        assert!(!root
            .path()
            .join(&status.id)
            .join("download.partial")
            .exists());
        assert!(!root.path().join(&status.id).join("download.map").exists());
    }
    #[test]
    fn cancels_queued_jobs_and_rejects_oversized_html_corrupt_zip_or_executable_responses() {
        let root = tempfile::tempdir().unwrap();
        for (url, body, headers) in [
            (
                "https://example.com/large.map",
                vec![],
                format!("Content-Length: {}\r\n", MAX_BYTES + 1),
            ),
            (
                "https://example.com/page.map",
                b"<html>error</html>".to_vec(),
                "Content-Type: text/html\r\n".into(),
            ),
            (
                "https://example.com/bad.zip",
                b"PK\x03\x04truncated".to_vec(),
                "Content-Type: application/zip\r\n".into(),
            ),
            (
                "https://example.com/game.map",
                b"MZnot map data".to_vec(),
                "Content-Type: application/octet-stream\r\n".into(),
            ),
        ] {
            let registry = DownloadRegistry::default();
            let status = registry.prepare(url).unwrap();
            assert!(registry
                .execute(&status.id, root.path(), |_| Ok(response(body, &headers)))
                .is_err());
            assert!(matches!(
                registry.status(&status.id).unwrap().phase,
                Phase::Failed
            ));
            let directory = root.path().join(&status.id);
            if directory.exists() {
                assert!(!directory.join("download.partial").exists());
                assert!(!directory.join("download.map").exists());
                assert!(!directory.join("download.zip").exists());
            }
        }
        let registry = DownloadRegistry::default();
        let status = registry.prepare("https://example.com/arena.map").unwrap();
        assert!(registry.cancel(&status.id).unwrap());
        assert!(registry
            .execute(&status.id, root.path(), |_| panic!(
                "cancelled job made network request"
            ))
            .is_err());
        assert_eq!(registry.status(&status.id).unwrap().phase, Phase::Cancelled);
    }
}
