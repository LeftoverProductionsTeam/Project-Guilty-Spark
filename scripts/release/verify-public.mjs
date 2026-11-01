// Read-only post-publication check. A draft or an empty Release is not distribution.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { repository } from './draft.mjs';
const [tag, commit, output] = process.argv.slice(2);
if (
  !/^v\d+\.\d+\.\d+-preview\.[1-9]\d{0,3}$/.test(tag ?? '') ||
  !/^[a-f0-9]{40}$/.test(commit ?? '') ||
  !output
)
  throw Error('verify-public <versioned preview tag> <expected full commit> <new receipt.json>');
const request = async (url, binary = false) => {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(120000),
    headers: {
      Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json',
      'User-Agent': 'Project-Guilty-Spark-public-download-verification',
    },
  });
  if (!response.ok) throw Error(`Public download returned HTTP ${response.status}`);
  return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
};
const release = await request(`https://api.github.com/repos/${repository}/releases/tags/${tag}`);
if (release.draft || !release.prerelease || release.tag_name !== tag)
  throw Error('Expected an approved public pre-release, not a draft');
const manifests = release.assets.filter((a) => a.name.endsWith('_manifest.json'));
if (!manifests.length || manifests.length > 2) throw Error('Public release lacks sealed platform manifests');
const checked = [],
  expected = new Set();
let hasWindows = false;
for (const asset of manifests) {
  const data = await request(asset.browser_download_url, true),
    m = JSON.parse(data);
  if (
    m.sourceCommit !== commit ||
    m.releaseTag !== tag ||
    !m.verification?.complete ||
    m.bundledHaloContent !== false
  )
    throw Error('Public manifest source or verification differs');
  if (m.platform === 'windows-x64') {
    hasWindows =
      m.artifacts.some((a) => a.kind === 'nsis-installer' && a.file.endsWith('_Setup.exe')) &&
      m.artifacts.some((a) => a.kind === 'portable-zip');
  }
  const rows = [
    ...m.artifacts,
    { file: asset.name, bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') },
  ];
  const sums = release.assets.find((a) => a.name === `SHA256SUMS-${m.platform}.txt`);
  if (!sums) throw Error('Public checksums missing');
  const lines = (await request(sums.browser_download_url, true)).toString().trim().split(/\r?\n/);
  if (lines.length !== rows.length || rows.some((r) => !lines.includes(`${r.sha256}  ${r.file}`)))
    throw Error('Public checksum index differs');
  expected.add(sums.name);
  for (const row of rows) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,160}$/.test(row.file) || expected.has(row.file))
      throw Error('Unsafe or duplicate public asset');
    expected.add(row.file);
    const remote = release.assets.find((a) => a.name === row.file);
    if (!remote || remote.size !== row.bytes || remote.size > 256 * 1024 * 1024)
      throw Error('Public asset is missing or incomplete');
    const bytes = await request(remote.browser_download_url, true);
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== row.sha256)
      throw Error('Public downloaded bytes differ');
    checked.push({
      name: row.file,
      bytes: bytes.length,
      sha256: row.sha256,
      url: remote.browser_download_url,
    });
  }
}
if (!hasWindows || expected.size !== release.assets.length)
  throw Error('Public release is missing Windows downloads or contains unverified extras');
await fs.writeFile(
  path.resolve(output),
  JSON.stringify(
    {
      schemaVersion: 1,
      publicPublicationVerified: true,
      sourceCommit: commit,
      releaseTag: tag,
      url: release.html_url,
      anonymouslyDownloadedAssets: checked,
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx' },
);
console.log(
  `Verified anonymous public Windows installer and ${checked.length} release assets: ${release.html_url}`,
);
