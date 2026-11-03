// Read-only, hash-bound native connection diagnostics. This never grants a
// player-walkthrough result and does not rebuild, install or launch a map.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const args = process.argv.slice(2);
if (args.length !== 4) throw Error('check-megaworld-connection <Invader> <compiled.map> <connection.gsproject> <fresh-output>');
const [tools, cache, project, output] = args.map(value => path.resolve(value));
const hash = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const report = {schemaVersion: 1, complete: false, cacheSha256: await hash(cache),
  connectionProjectSha256: await hash(project), nativeTools: {}, commands: [],
  playerWalkthroughVerified: false, verifiedPhysicallyTraversableConnections: 0,
  scope: 'Compiled BSP and start geometry, native portal graph and material/scenery readback. Player physics, rendering, PVS culling, scenery obstruction and sound require runtime acceptance.'};
await fs.mkdir(output); // Existing source/evidence directories can never be overwritten.
const run = (exe, params, label) => {
  const began = performance.now();
  const result = spawnSync(exe, params, {encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024});
  report.commands.push({label, executable: exe, args: params, exitCode: result.status, elapsedMs: performance.now() - began});
  const text = (result.stdout ?? '') + (result.stderr ?? '');
  return fs.writeFile(path.join(output, label + '.log'), text).then(() => {
    if (result.error || result.status !== 0 || /\b(?:ERROR:|Failed to extract|[1-9]\d* errors?)\b/i.test(text))
      throw Error(`${label} failed; inspect its retained native log`);
    return (result.stdout ?? '').trim();
  });
};
const rust = async (example, params, label) => JSON.parse((await run(process.execPath,
  ['scripts/cargo.mjs', 'run', '--locked', '-p', 'spark-core', '--example', example, '--', ...params], label)).split(/\r?\n/).at(-1));
try {
  report.collision = await rust('qa_bsp_assembly', ['--verify-walkthrough', cache, project], 'compiled-capsules-and-route');
  report.structure = await rust('qa_bsp_audio', [cache], 'compiled-clusters');
  if (report.collision.cacheSha256 !== report.cacheSha256 || report.structure.sourceSha256 !== report.cacheSha256)
    throw Error('Native diagnostics observed different cache identities');
  const tags = path.join(output, 'tags');
  await fs.mkdir(tags);
  const extract = path.join(tools, 'invader-extract.exe'), edit = path.join(tools, 'invader-edit.exe');
  report.nativeTools = {invaderExtract: await hash(extract), invaderEdit: await hash(edit)};
  await run(extract, ['-t', tags, '-s', '*.scenario_structure_bsp', '-s', '*.scenario', cache], 'native-structural-readback');
  const get = async (tag, query, label) => (await run(edit, ['-t', tags, ...query, tag], label)).split(/\r?\n/);
  report.portalGraphs = [];
  const scenarios = [];
  async function findScenarios(directory) {
    for (const entry of await fs.readdir(directory, {withFileTypes: true})) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await findScenarios(file);
      else if (entry.name.endsWith('.scenario')) scenarios.push(path.relative(tags, file));
    }
  }
  await findScenarios(tags);
  if (scenarios.length !== 1) throw Error('Expected one native scenario in the compiled cache');
  const fields = ['scenery', 'scenery_palette', 'player_starting_locations', 'sound_scenery', 'bipeds', 'vehicles'];
  const counts = (await get(scenarios[0], fields.flatMap(field => ['-C', field]), 'native-scenario-counts')).map(Number);
  if (counts.length !== fields.length || counts.some(n => !Number.isInteger(n) || n < 0) || counts[2] !== report.collision.starts.length)
    throw Error('Scenario placement readback differs from native inspection');
  report.scenario = {tag: scenarios[0], counts: Object.fromEntries(fields.map((field, i) => [field, counts[i]]))};
  for (const bsp of report.structure.bsps) {
    const tag = bsp.tagPath + '.scenario_structure_bsp';
    const counts = (await get(tag, ['-C', 'clusters', '-C', 'cluster_portals', '-C', 'lightmaps'], `bsp-${bsp.index}-counts`)).map(Number);
    if (counts.length !== 3 || counts.some(n => !Number.isInteger(n) || n < 0) || counts[0] !== bsp.clusters.length || counts[1] !== bsp.portalCount || counts[1] > 1024 || counts[2] > 128)
      throw Error('Compiled native structure counts disagree or exceed this audit bound');
    const edges = [];
    for (let i = 0; i < counts[1]; i++) {
      const edge = (await get(tag, ['-G', `cluster_portals[${i}].front_cluster`, '-G', `cluster_portals[${i}].back_cluster`], `bsp-${bsp.index}-portal-${i}`)).map(Number);
      if (edge.length !== 2 || edge.some(n => !Number.isInteger(n) || n < 0 || n >= counts[0]) || edge[0] === edge[1])
        throw Error('Native portal does not connect two valid distinct clusters');
      edges.push(edge);
    }
    const reached = new Set(counts[0] ? [0] : []);
    for (let size = -1; size !== reached.size;) {
      size = reached.size;
      for (const [a, b] of edges) {if (reached.has(a)) reached.add(b); if (reached.has(b)) reached.add(a);}
    }
    const materialCounts = [];
    for (let i = 0; i < counts[2]; i++) {
      const count = Number((await get(tag, ['-C', `lightmaps[${i}].materials`], `bsp-${bsp.index}-materials-${i}`))[0]);
      if (!Number.isInteger(count) || count < 0 || count > 4096) throw Error('Invalid native material count');
      materialCounts.push(count);
    }
    report.portalGraphs.push({bsp: bsp.index, clusters: counts[0], edges, reachedClusters: [...reached],
      connected: reached.size === counts[0] && counts[0] > 0, materialCounts});
    if (reached.size !== counts[0] || !counts[0]) throw Error('Compiled portal graph contains unreachable clusters');
  }
  const document = JSON.parse(await fs.readFile(project, 'utf8'));
  const assembly = document.bspAssembly;
  if (!assembly?.tunnelPoints?.length) throw Error('Connection project has no authored route');
  const points = assembly.tunnelPoints.map(p => [p[0], -p[1]]);
  const bounds = report.structure.bsps.flatMap(b => b.clusters.flatMap(c => c.bounds ? [[c.bounds[0][0], -c.bounds[0][1]], [c.bounds[1][0], -c.bounds[1][1]]] : []));
  const all = [...points, ...bounds], min = [0, 1].map(i => Math.min(...all.map(p => p[i])) - 5), max = [0, 1].map(i => Math.max(...all.map(p => p[i])) + 5);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[c]));
  const rects = report.structure.bsps.flatMap(b => b.clusters.filter(c => c.bounds).map(c => {
    const [a, z] = c.bounds;
    return `<rect x="${a[0]}" y="${-z[1]}" width="${z[0]-a[0]}" height="${z[1]-a[1]}" fill="#68c6bd18" stroke="#68c6bd" stroke-width="0.35"/><text x="${a[0]+1}" y="${-z[1]+3}" fill="#b4dbd7" font-size="2.7">Cluster ${c.index}</text>`;
  })).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="650" viewBox="0 0 1100 650"><rect width="1100" height="650" fill="#101820"/><g font-family="sans-serif" fill="#fff"><text x="24" y="30" font-size="19">${escape(document.title)} — compiled connection</text><text x="24" y="54" font-size="13">0 player-verified connections · two-way collision sampling passed · gameplay pending</text><svg x="24" y="80" width="1052" height="490" viewBox="${min[0]} ${min[1]} ${max[0]-min[0]} ${max[1]-min[1]}">${rects}<polyline points="${points.map(p => p.join(',')).join(' ')}" fill="none" stroke="#ffc36b" stroke-width="1"/>${points.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="0.7" fill="#ffc36b"/><text x="${p[0]+2}" y="${p[1]-2}" fill="#fff" font-size="3">${i===0?'Timberland entrance':i===points.length-1?escape(assembly.donorTitle)+' entrance':i}</text>`).join('')}</svg><text x="24" y="600" font-size="12">Compiled cluster bounds + authored tunnel floor centerline; not a gameplay or streaming certificate.</text><text x="24" y="624" font-size="11">Cache SHA-256 ${report.cacheSha256}</text></g></svg>`;
  await fs.writeFile(path.join(output, 'connection-map.svg'), svg);
  if (await hash(cache) !== report.cacheSha256 || await hash(project) !== report.connectionProjectSha256)
    throw Error('Source cache or connection project changed during native readback');
  report.complete = true;
} catch (error) {report.error = String(error); process.exitCode = 1;}
finally {
  await fs.writeFile(path.join(output, 'connection-audit.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({complete: report.complete, cacheSha256: report.cacheSha256,
    verifiedPhysicallyTraversableConnections: 0, error: report.error ?? null}));
}
