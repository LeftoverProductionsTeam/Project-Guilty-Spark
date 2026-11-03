// Only creates a NEW DRAFT pre-release. No publication, replacement, deletion or git writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const repository = 'LeftoverProductionsTeam/Project-Guilty-Spark';
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const need = (condition, message) => {
  if (!condition) throw Error(message);
};
const filename = (name) => typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,160}$/.test(name);

export async function loadAssets(directories) {
  const assets = [],
    manifests = [];
  for (const directory of directories) {
    const names = await fs.readdir(directory);
    const manifestNames = names.filter((n) => n.endsWith('_manifest.json'));
    need(manifestNames.length === 1, 'One sealed platform manifest is required');
    const name = manifestNames[0],
      bytes = await fs.readFile(path.join(directory, name)),
      m = JSON.parse(bytes);
    need(
      m.repository === repository && m.verification?.complete === true && m.bundledHaloContent === false,
      'Unverified or unexpected release manifest',
    );
    need(
      /^[a-f0-9]{40}$/.test(m.sourceCommit) &&
        /^v\d+\.\d+\.\d+-preview\.[1-9]\d{0,3}$/.test(m.releaseTag) &&
        m.releaseTag.startsWith(`v${m.applicationVersion}-preview.`),
      'Invalid release source or tag',
    );
    const sumName = `SHA256SUMS-${m.platform}.txt`;
    const expected = new Map(m.artifacts.map((a) => [a.file, a.sha256]));
    need(expected.size === m.artifacts.length && expected.size >= 2, 'Duplicate or missing platform assets');
    expected.set(name, hash(bytes));
    const sums = await fs.readFile(path.join(directory, sumName));
    const rows = sums
      .toString()
      .trim()
      .split(/\r?\n/)
      .map((r) => r.split('  '));
    need(
      rows.length === expected.size &&
        new Set(rows.map((r) => r[1])).size === expected.size &&
        rows.every(([digest, n]) => expected.get(n) === digest),
      'Checksum index mismatch',
    );
    need(
      names.length === expected.size + 1 && names.every((n) => expected.has(n) || n === sumName),
      'Unexpected files in public release set',
    );
    for (const n of [...expected.keys(), sumName]) {
      need(filename(n), 'Unsafe release asset name');
      const file = path.join(directory, n),
        stat = await fs.lstat(file);
      need(
        stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 256 * 1024 * 1024,
        'Release asset is missing, linked or oversized',
      );
      const data = await fs.readFile(file),
        sha256 = hash(data);
      if (expected.has(n)) need(sha256 === expected.get(n), `Checksum mismatch: ${n}`);
      const item = m.artifacts.find((a) => a.file === n);
      if (item) need(item.bytes === stat.size, 'Asset size mismatch');
      assets.push({ name: n, bytes: data, sha256 });
    }
    manifests.push(m);
  }
  const first = manifests.find((m) => m.platform === 'windows-x64');
  need(
    first && new Set(manifests.map((m) => m.platform)).size === manifests.length,
    'Exactly one Windows candidate is required',
  );
  need(
    manifests.every(
      (m) =>
        m.sourceCommit === first.sourceCommit &&
        m.releaseTag === first.releaseTag &&
        m.applicationVersion === first.applicationVersion &&
        m.sourceTree === first.sourceTree,
    ),
    'Platform source identities differ',
  );
  need(
    new Set(assets.map((a) => a.name.toLowerCase())).size === assets.length,
    'Release asset name collision',
  );
  need(
    first.artifacts.some((a) => a.kind === 'nsis-installer') &&
      first.artifacts.some((a) => a.kind === 'portable-zip'),
    'Installer and portable ZIP are mandatory',
  );
  return { assets, manifests, identity: first };
}

export function client(token, fetcher = fetch) {
  need(token, 'Authenticated GitHub access is required to prepare a private draft');
  return async (route, { method = 'GET', json, bytes, accept } = {}) => {
    const url = new URL(route, 'https://api.github.com');
    need(
      url.protocol === 'https:' && ['api.github.com', 'uploads.github.com'].includes(url.hostname),
      'Unexpected GitHub API host',
    );
    const response = await fetcher(url, {
      method,
      signal: AbortSignal.timeout(120000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept ?? 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Project-Guilty-Spark-release',
        ...(json ? { 'Content-Type': 'application/json' } : {}),
        ...(bytes ? { 'Content-Type': 'application/octet-stream' } : {}),
      },
      body: json ? JSON.stringify(json) : bytes,
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw Error(
        `GitHub ${method} ${url.pathname}: HTTP ${response.status}; ${String(detail.message ?? 'request refused').slice(0, 600)}`,
      );
    }
    return accept === 'application/octet-stream'
      ? Buffer.from(await response.arrayBuffer())
      : response.json();
  };
}

export async function createDraft(set, api, { runId, linuxStatus = 'not requested' } = {}) {
  const { assets, manifests, identity: m } = set;
  need(
    manifests.every(
      (p) =>
        p.sourceCommit === m.sourceCommit &&
        p.releaseTag === m.releaseTag &&
        p.applicationVersion === m.applicationVersion,
    ),
    'Platform source identities differ',
  );
  const base = `/repos/${repository}`;
  const commit = await api(`${base}/commits/${m.sourceCommit}`);
  need(commit?.sha === m.sourceCommit, 'Source commit is not available on GitHub');
  need(
    !(await api(`${base}/releases/tags/${m.releaseTag}`)),
    'A release already uses this tag; choose a new preview number',
  );
  need(
    !(await api(`${base}/git/ref/tags/${m.releaseTag}`)),
    'A tag already exists; never overwrite release history',
  );
  if (runId)
    need(
      manifests.every((p) => p.workflow?.runId === String(runId)),
      'Packages belong to another workflow run',
    );
  const linux = manifests.find((p) => p.platform === 'linux-x64');
  const notes = [
    `Project Guilty Spark ${m.applicationVersion} preview. Source: ${m.sourceCommit}.`,
    'This binary snapshot contains that exact source revision. Later master/README features are not retroactively included.',
    '',
    'Download the Windows x64 `_Setup.exe` installer or `_Portable.zip`. The portable app requires Microsoft Edge WebView2 Runtime. This preview is unsigned.',
    'Automated regression gates, a real extracted portable launch, NSIS installation/payload verification and an installed-app launch passed. Check the platform manifest and SHA-256 file for exact identities.',
    'No Halo maps, original game resources, SDKs, optional Steam bridge or credentials are included. Connect your owned Halo and matching tools separately.',
    '',
    linux
      ? `Linux: AppImage and Debian package both compiled and launched under Xvfb/WebKitGTK. ${linux.compatibility}`
      : `Linux packages are not attached or advertised as verified. Linux job: ${linuxStatus}. This does not block the verified Windows preview.`,
    '',
    'C48 shared BSP editing, author undo, durable recovery, the Megaworld Atlas and native source/tool workflows are preserved. Source synchronization is separate from Halo multiplayer/AI replication. All-map physical traversal, complete Zombie gameplay/conversion and in-game sound listening remain acceptance gates; see the source documentation.',
    '',
    '**Draft awaiting owner review. Public publication is a separate, explicit owner action.**',
  ].join('\n');
  const release = await api(`${base}/releases`, {
    method: 'POST',
    json: {
      tag_name: m.releaseTag,
      target_commitish: m.sourceCommit,
      name: `Project Guilty Spark ${m.applicationVersion} — preview ${m.releaseTag.split('.').at(-1)}`,
      body: notes,
      draft: true,
      prerelease: true,
      make_latest: 'false',
    },
  });
  need(
    release?.draft === true && release.prerelease === true && release.tag_name === m.releaseTag,
    'GitHub did not create the expected draft pre-release',
  );
  const upload = release.upload_url?.replace(/\{.*$/, '');
  need(upload && new URL(upload).hostname === 'uploads.github.com', 'Unexpected release upload URL');
  const verified = [];
  for (const asset of assets) {
    const uploaded = await api(`${upload}?name=${encodeURIComponent(asset.name)}`, {
      method: 'POST',
      bytes: asset.bytes,
    });
    need(
      uploaded?.name === asset.name && uploaded.size === asset.bytes.length && uploaded.state === 'uploaded',
      'Release upload incomplete',
    );
    if (uploaded.digest) need(uploaded.digest === `sha256:${asset.sha256}`, 'GitHub asset digest differs');
    const downloaded = await api(`${base}/releases/assets/${uploaded.id}`, {
      accept: 'application/octet-stream',
    });
    need(
      downloaded && downloaded.length === asset.bytes.length && hash(downloaded) === asset.sha256,
      `Downloaded draft asset failed verification: ${asset.name}`,
    );
    verified.push({
      name: asset.name,
      bytes: asset.bytes.length,
      sha256: asset.sha256,
      downloadVerified: true,
      assetId: uploaded.id,
      browserDownloadUrl: uploaded.browser_download_url,
    });
  }
  const current = await api(`${base}/releases/${release.id}`);
  need(
    current?.draft === true &&
      current.prerelease === true &&
      current.tag_name === m.releaseTag &&
      current.target_commitish === m.sourceCommit,
    'Draft state or commit changed during verification',
  );
  const remote = await api(`${base}/releases/${release.id}/assets?per_page=100`);
  need(
    remote?.length === assets.length &&
      remote.every((a) => verified.some((v) => v.assetId === a.id && v.name === a.name)),
    'Draft contains unexpected or missing assets',
  );
  return {
    schemaVersion: 1,
    sourceCommit: m.sourceCommit,
    releaseTag: m.releaseTag,
    draftUrl: current.html_url,
    draft: true,
    prerelease: true,
    publicPublicationVerified: false,
    attachedAssetsVerified: verified,
    publicationRequiresOwnerApproval: true,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [output, ...directories] = process.argv.slice(2);
  if (!output || !directories.length)
    throw Error('draft <new receipt.json> <sealed platform directory> [...]');
  const set = await loadAssets(directories);
  const receipt = await createDraft(set, client(process.env.GITHUB_TOKEN), {
    runId: process.env.GITHUB_RUN_ID,
    linuxStatus: process.env.SPARK_LINUX_JOB_RESULT ?? 'not requested',
  });
  await fs.writeFile(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  if (process.env.GITHUB_STEP_SUMMARY)
    await fs.appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `Verified draft: ${receipt.draftUrl}\n\n${receipt.attachedAssetsVerified.length} actual Release assets downloaded and SHA-256 verified. Owner publication approval is still required.\n`,
    );
  console.log(JSON.stringify(receipt, null, 2));
}
