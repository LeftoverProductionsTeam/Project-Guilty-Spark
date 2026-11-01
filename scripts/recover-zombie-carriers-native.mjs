// Explicit owner-run research recipe. It accepts only the hashed C45 reviewed
// experimental tagset, copies it, and invokes local native tools in that copy.
// No download, game launch, runtime patch, remote command or original write.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nativeSoundStreamingFailures } from './native-runtime-health.mjs';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const none = (n) => (n === 65535 ? -1 : n);
const finiteVector = (v, size) =>
  Array.isArray(v) && v.length === size && v.every((n) => Number.isFinite(n) && Math.abs(n) < 1e6);

export function triangulateCollider(points, edges, surfaces) {
  if (
    !points.length ||
    points.length > 4096 ||
    points.some((p) => !finiteVector(p, 3)) ||
    !edges.length ||
    edges.length > 8192 ||
    !surfaces.length ||
    surfaces.length > 4096
  )
    throw Error('Invalid bounded collider source');
  const triangles = [];
  for (let face = 0; face < surfaces.length; face++) {
    const first = surfaces[face];
    let at = first;
    const polygon = [],
      visited = new Set();
    do {
      if (!Number.isInteger(at) || at < 0 || at >= edges.length || visited.has(at) || visited.size >= 64)
        throw Error('Invalid collision edge cycle');
      visited.add(at);
      const e = edges[at],
        left = e.left_surface === face;
      if (!left && e.right_surface !== face) throw Error('Collision edge does not belong to surface');
      const vertex = left ? e.start_vertex : e.end_vertex;
      if (!Number.isInteger(vertex) || vertex < 0 || vertex >= points.length)
        throw Error('Invalid collision vertex');
      polygon.push(vertex);
      at = left ? e.forward_edge : e.reverse_edge;
    } while (at !== first);
    if (polygon.length < 3 || new Set(polygon).size !== polygon.length)
      throw Error('Invalid collision polygon');
    for (let i = 1; i + 1 < polygon.length; i++) triangles.push([polygon[0], polygon[i], polygon[i + 1]]);
  }
  return triangles;
}

function checkedNodes(nodes) {
  if (
    !nodes.length ||
    nodes.length > 64 ||
    nodes.some(
      (n) =>
        typeof n.name !== 'string' ||
        !n.name.length ||
        n.name.length > 31 ||
        /[\r\n\0]/.test(n.name) ||
        !finiteVector(n.translation, 3) ||
        !finiteVector(n.rotation, 4),
    )
  )
    throw Error('Invalid native model nodes');
  const parents = new Array(nodes.length).fill(-1);
  for (const [i, n] of nodes.entries()) {
    for (const link of [n.child, n.sibling])
      if (!Number.isInteger(link) || link < -1 || link >= nodes.length)
        throw Error('Invalid model node link');
    let at = n.child;
    const visited = new Set();
    while (at !== -1) {
      if (at === i || visited.has(at) || parents[at] !== -1) throw Error('Cyclic or shared model child');
      visited.add(at);
      parents[at] = i;
      at = nodes[at].sibling;
    }
  }
  for (let i = 0; i < parents.length; i++) {
    let at = i;
    const visited = new Set();
    while (at !== -1) {
      if (visited.has(at)) throw Error('Cyclic model hierarchy');
      visited.add(at);
      at = parents[at];
    }
  }
}
export function carrierSources(nodes, checksum, mesh, regions, nodeByRegion) {
  checkedNodes(nodes);
  if (
    !Number.isSafeInteger(checksum) ||
    checksum < -2147483648 ||
    checksum > 4294967295 ||
    !regions.length ||
    regions.length > 8 ||
    regions.length !== nodeByRegion.length ||
    regions.some((n) => typeof n !== 'string' || !n.length || n.length > 31 || /[\r\n\0]/.test(n)) ||
    nodeByRegion.some((n) => !Number.isInteger(n) || n < 0 || n >= nodes.length) ||
    !mesh.points.length ||
    mesh.points.length > 4096 ||
    mesh.points.some((p) => !finiteVector(p, 3)) ||
    typeof mesh.material !== 'string' ||
    !mesh.material.length ||
    mesh.material.length > 127 ||
    /[\r\n\0]/.test(mesh.material) ||
    !mesh.triangles.length ||
    mesh.triangles.length > 8192 ||
    mesh.triangles.some(
      (t) => t.length !== 3 || t.some((n) => !Number.isInteger(n) || n < 0 || n >= mesh.points.length),
    )
  )
    throw Error('Invalid carrier source metadata');
  // The reviewed models have an identity root rotation. Native Tool handles
  // the inverse node transforms for the weighted bind-space vertices.
  if (nodes[0].rotation.some((n, i) => Math.abs(n - [0, 0, 0, 1][i]) > 1e-6))
    throw Error('Unreviewed model root rotation');
  const jms = ['8200', '0', String(nodes.length)];
  for (const n of nodes)
    jms.push(
      n.name,
      String(n.child),
      String(n.sibling),
      n.rotation.join('\t'),
      n.translation.map((v) => v * 100).join('\t'),
    );
  jms.push(
    '1',
    mesh.material,
    '<none>',
    '0',
    String(regions.length),
    ...regions,
    String(mesh.points.length * regions.length),
  );
  for (const node of nodeByRegion)
    for (const p of mesh.points)
      jms.push(
        String(node),
        p.map((v, i) => (v + nodes[0].translation[i]) * 100).join('\t'),
        '0\t0\t1',
        '-1',
        '0',
        '0',
        '0',
        '0',
      );
  jms.push(String(mesh.triangles.length * regions.length));
  for (let region = 0; region < regions.length; region++)
    for (const t of mesh.triangles)
      jms.push(String(region), '0', t.map((i) => i + region * mesh.points.length).join('\t'));
  const jma = ['16392', '2', '30', '1', 'carrier', String(nodes.length), String(checksum)];
  for (const n of nodes) jma.push(n.name, String(n.child), String(n.sibling));
  for (let frame = 0; frame < 2; frame++)
    for (const n of nodes) jma.push(n.translation.map((v) => v * 100).join('\t'), n.rotation.join('\t'), '1');
  return { jms: jms.join('\n') + '\n', jma: jma.join('\n') + '\n' };
}

async function regular(file, max = 512 * 1024 * 1024) {
  const s = await fs.lstat(file);
  if (!s.isFile() || s.isSymbolicLink() || s.size > max) throw Error('Expected bounded regular input');
  const b = await fs.readFile(file),
    after = await fs.lstat(file);
  if (b.length !== s.size || after.size !== s.size || after.mtimeMs !== s.mtimeMs)
    throw Error('Input changed during read');
  return b;
}
async function inventory(root) {
  const files = [];
  let bytes = 0;
  async function walk(folder, relative = '', depth = 0) {
    const stat = await fs.lstat(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink() || depth > 32)
      throw Error('Expected bounded source tree');
    for (const n of (await fs.readdir(folder)).sort()) {
      const p = path.join(folder, n),
        rel = relative ? relative + '/' + n : n,
        s = await fs.lstat(p);
      if (s.isSymbolicLink()) throw Error('Source links are not accepted');
      if (s.isDirectory()) await walk(p, rel, depth + 1);
      else {
        const b = await regular(p);
        bytes += b.length;
        if (files.length >= 10000 || bytes > 2 * 1024 ** 3) throw Error('Source inventory exceeds bound');
        files.push([rel, hash(b)]);
      }
    }
  }
  await walk(root);
  return files.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
async function execute(argv) {
  const options = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    if (
      !['--source-tags', '--output', '--classic-tool', '--invader-edit'].includes(argv[i]) ||
      !argv[i + 1] ||
      options.has(argv[i])
    )
      throw Error('Use unique required named arguments');
    options.set(argv[i], argv[i + 1]);
  }
  if (options.size !== 4 || process.platform !== 'win32')
    throw Error(
      'Windows only: --source-tags reviewed-tags --output fresh-short-workspace --classic-tool owned-tool.exe --invader-edit owned-invader-edit.exe',
    );
  const pinBytes = await fs.readFile(new URL('../docs/fixtures/c45-carrier-inputs.json', import.meta.url));
  const pins = JSON.parse(pinBytes);
  const source = await fs.realpath(path.resolve(options.get('--source-tags'))),
    output = path.resolve(options.get('--output'));
  const tool = await fs.realpath(path.resolve(options.get('--classic-tool'))),
    edit = await fs.realpath(path.resolve(options.get('--invader-edit')));
  const within = (parent, child) => {
    const p = path.relative(parent, child);
    return p === '' || (!p.startsWith('..' + path.sep) && p !== '..' && !path.isAbsolute(p));
  };
  const parent = path.dirname(output);
  if (
    (await fs.realpath(parent)) !== parent ||
    within(source, output) ||
    within(path.dirname(tool), output) ||
    within(path.dirname(edit), output)
  )
    throw Error('Choose a fresh independent workspace in a real directory');
  if (
    hash(await regular(tool, 16 * 1024 * 1024)) !== pins.tools.classic ||
    hash(await regular(edit, 16 * 1024 * 1024)) !== pins.tools.invaderEdit
  )
    throw Error('Native tool identity differs from the reviewed recipe');
  const before = await inventory(source);
  if (before.length !== pins.tagCount || hash(JSON.stringify(before)) !== pins.tagTreeSha256)
    throw Error(
      'This recipe only accepts the complete exact reviewed C45 wrapper baseline; no changes were attempted',
    );
  for (const [tag, expected] of Object.entries(pins.files))
    if (new Map(before).get(tag) !== expected) throw Error('Recovery input identity differs');
  await fs.mkdir(output);
  const tags = path.join(output, 'tags');
  await fs.mkdir(tags);
  const report = {
    schemaVersion: 1,
    recipeSourceSha256: hash(await fs.readFile(fileURLToPath(import.meta.url))),
    pinsSourceSha256: hash(pinBytes),
    experimental: true,
    source,
    output,
    sourceTreeSha256: pins.tagTreeSha256,
    sourceFiles: before.length,
    steps: [],
    changes: [],
    complete: false,
    gameplayAccepted: false,
    faithfulConversionAccepted: false,
    limitations: [
      'Two original custom audio cues remain unavailable in this inherited recovery baseline.',
      'Native source compilation does not establish fault-free loading, AI synchronization or audiovisual playback.',
    ],
  };
  let sequence = 0;
  function native(exe, args, label) {
    const r = spawnSync(exe, args, {
      cwd: output,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 180000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const text = (r.stdout ?? '') + '\n' + (r.stderr ?? ''),
      file = `native-${String(sequence++).padStart(4, '0')}-${label}.log`;
    report.steps.push({ file, exitCode: r.status, args });
    // Synchronous writes keep every failed native invocation reviewable too.
    return fs.writeFile(path.join(output, file), text, { flag: 'wx' }).then(() => {
      if (r.status !== 0 || r.error) throw Error(`Native ${label} refused; inspect ${file}`);
      if (nativeSoundStreamingFailures(text).length)
        throw Error(`Native ${label} omitted sound data despite its status; inspect ${file}`);
      return (r.stdout ?? '').trim();
    });
  }
  try {
    for (const [rel, expected] of before) {
      const dest = path.join(tags, ...rel.split('/'));
      if (dest.length > 240) throw Error('Use a shorter workspace path for legacy Halo Tool');
      await fs.mkdir(path.dirname(dest), { recursive: true });
      const b = await regular(path.join(source, ...rel.split('/')));
      if (hash(b) !== expected) throw Error('Source changed while staging');
      await fs.writeFile(dest, b, { flag: 'wx' });
    }
    for (const [name, expected] of Object.entries(pins.toolFiles)) {
      const b = await regular(path.join(path.dirname(tool), name), 16 * 1024 * 1024);
      if (hash(b) !== expected) throw Error('Native companion identity differs');
      await fs.writeFile(path.join(output, name), b, { flag: 'wx' });
    }
    await fs.mkdir(path.join(output, 'maps'));
    await fs.mkdir(path.join(output, 'tools'));
    const localEdit = path.join(output, 'tools', 'invader-edit.exe');
    await fs.writeFile(localEdit, await regular(edit, 16 * 1024 * 1024), { flag: 'wx' });
    const invader = (args, tag) => native(localEdit, ['-t', tags, ...args, tag], 'invader');
    const get = (tag, key) => invader(['-G', key], tag),
      count = async (tag, key) => Number(await invader(['-C', key], tag));
    const collision = 'powerups/sniper rifle ammo/sniper rifle ammo.model_collision_geometry',
      base = 'nodes[0].bsps[0]';
    const points = [],
      edges = [],
      surfaces = [];
    for (let i = 0, n = await count(collision, base + '.vertices'); i < n; i++)
      points.push((await get(collision, `${base}.vertices[${i}].point`)).split(',').map(Number));
    for (let i = 0, n = await count(collision, base + '.edges'); i < n; i++) {
      const edge = {};
      for (const k of [
        'start_vertex',
        'end_vertex',
        'forward_edge',
        'reverse_edge',
        'left_surface',
        'right_surface',
      ])
        edge[k] = Number(await get(collision, `${base}.edges[${i}].${k}`));
      edges.push(edge);
    }
    for (let i = 0, n = await count(collision, base + '.surfaces'); i < n; i++)
      surfaces.push(Number(await get(collision, `${base}.surfaces[${i}].first_edge`)));
    const mesh = {
      points,
      triangles: triangulateCollider(points, edges, surfaces),
      material: await get(collision, 'materials[0].name'),
    };
    report.colliderSource = {
      vertices: points.length,
      triangles: mesh.triangles.length,
      coordinateReadbackMaximumAbsoluteError: 0.00000051,
    };
    for (let i = 0; i < 3; i++) {
      const tag = `gs_compat/zombie_spawn_${i}.effect`;
      if (
        (await count(tag, 'locations')) !== 0 ||
        (await get(tag, 'events[0].parts[0].location')) !== '65535'
      )
        throw Error('Effect baseline differs');
      await invader(['-I', 'locations', '1', 'end', '-S', 'events[0].parts[0].location', '0'], tag);
    }
    const colliderTags = [];
    for (const [i, model] of [
      'vehicles/rwarthog/rwarthog.gbxmodel',
      'weapons/gravity rifle/gravity rifle.gbxmodel',
    ].entries()) {
      const nodes = [];
      for (let j = 0, n = await count(model, 'nodes'); j < n; j++)
        nodes.push({
          name: await get(model, `nodes[${j}].name`),
          child: none(Number(await get(model, `nodes[${j}].first_child_node_index`))),
          sibling: none(Number(await get(model, `nodes[${j}].next_sibling_node_index`))),
          translation: (await get(model, `nodes[${j}].default_translation`)).split(',').map(Number),
          rotation: (await get(model, `nodes[${j}].default_rotation`)).split(',').map(Number),
        });
      const regions = [];
      for (let j = 0, n = await count(model, 'regions'); j < n; j++)
        regions.push(await get(model, `regions[${j}].name`));
      const sources = carrierSources(
        nodes,
        Number(await get(model, 'node_list_checksum')),
        mesh,
        regions,
        i === 0 ? [0, 14] : [0],
      );
      const stem = `gs_compat/recovered_carrier_${i}`,
        name = `recovered_carrier_${i}`,
        tag = `${stem}/${name}.model_collision_geometry`,
        folder = path.join(output, 'data', stem, 'physics');
      await fs.mkdir(folder, { recursive: true });
      await fs.mkdir(path.dirname(path.join(tags, tag)), { recursive: true });
      await fs.writeFile(path.join(folder, 'base superhigh.jms'), sources.jms, { flag: 'wx' });
      // Native Tool retains the authored damage/effect properties while it
      // rebuilds the read-only collision geometry. Original tag stays intact.
      await fs.writeFile(path.join(tags, tag), await regular(path.join(tags, collision)), { flag: 'wx' });
      await native(
        path.join(output, 'tool.exe'),
        ['collision-geometry', stem.replaceAll('/', '\\')],
        'collision',
      );
      if ((await count(tag, 'nodes')) !== nodes.length || (await count(tag, 'regions')) !== regions.length)
        throw Error('Native collider hierarchy/region readback differs');
      for (const key of [
        'maximum_body_vitality',
        'body_system_shock',
        'body_depleted_effect',
        'body_destroyed_effect',
      ])
        if ((await get(tag, key)) !== (await get(collision, key)))
          throw Error('Native collider lost authored damage properties');
      colliderTags.push(tag);
      if (i === 1) {
        const dir = path.join(output, 'data', 'gs_compat', 'carrier_idle', 'animations');
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'stand idle.jma'), sources.jma, { flag: 'wx' });
        await native(path.join(output, 'tool.exe'), ['animations', 'gs_compat\\carrier_idle'], 'animation');
        if ((await count('gs_compat/carrier_idle/carrier_idle.model_animations', 'nodes')) !== nodes.length)
          throw Error('Native animation rig differs');
        for (const [j, node] of nodes.entries()) {
          const graph = 'gs_compat/carrier_idle/carrier_idle.model_animations';
          if (none(Number(await get(graph, `nodes[${j}].first_child_node_index`))) !== node.child ||
              none(Number(await get(graph, `nodes[${j}].next_sibling_node_index`))) !== node.sibling)
            throw Error('Native animation child/sibling readback differs');
        }
      }
    }
    for (const name of ['evolved zombie container', 'zombie container', 'alpha zombie containerorig']) {
      const tag = 'mgm/fonzie/sparky/tags/' + name + '.vehicle',
        args = ['-S', 'collision_model', colliderTags[name === 'zombie container' ? 1 : 0]];
      if (name === 'zombie container')
        args.push('-S', 'animation_graph', 'gs_compat/carrier_idle/carrier_idle.model_animations');
      await invader(args, tag);
    }
    // These three original spawners also use the five-node gravity-rifle
    // model. Tool drops their unrelated ammunition collider. Reuse the
    // native-generated small collider with the matching five-node hierarchy.
    const spawners = [
      'mgm/fonzie/sparky/tags/ai respawning/evolved zombie spawnerorig.weapon',
      'origmgm/fonzie/sparky/tags/ai respawning/alpha zombie spawner.weapon',
      'mgm/fonzie/sparky/tags/ai respawning/zombie spawner.weapon',
    ];
    for (const tag of spawners) {
      if ((await get(tag, 'model')).replaceAll('\\', '/') !== 'weapons/gravity rifle/gravity rifle.gbxmodel')
        throw Error('Spawner model differs from reviewed carrier collider');
      await invader(['-S', 'collision_model', colliderTags[1]], tag);
    }
    const log = await native(
      path.join(output, 'tool.exe'),
      ['build-cache-file', 'zombie_apocalypse'],
      'cache',
    );
    if (!log.includes('successfully built cache file.'))
      throw Error('Native compiler did not establish cache completion');
    const cache = await regular(path.join(output, 'maps', 'zombie_apocalypse.map'));
    if (
      cache.length < 2048 ||
      cache.subarray(0, 4).toString('ascii') !== 'daeh' ||
      cache.readUInt32LE(4) !== 609 ||
      cache.readUInt32LE(8) !== cache.length
    )
      throw Error('Native cache header readback differs');
    const after = await inventory(tags),
      original = new Map(before);
    report.changes = after
      .filter(([tag, sha]) => original.get(tag) !== sha)
      .map(([tag, sha]) => ({ tag, beforeSha256: original.get(tag) ?? null, afterSha256: sha }));
    const permitted = new Set([
      'gs_compat/recovered_carrier_0/recovered_carrier_0.model_collision_geometry',
      'gs_compat/recovered_carrier_1/recovered_carrier_1.model_collision_geometry',
      'gs_compat/carrier_idle/carrier_idle.model_animations',
      ...[0, 1, 2].map((n) => `gs_compat/zombie_spawn_${n}.effect`),
      ...['evolved zombie container', 'zombie container', 'alpha zombie containerorig'].map(
        (n) => `mgm/fonzie/sparky/tags/${n}.vehicle`,
      ),
      ...spawners,
    ]);
    if (
      before.some(([tag]) => !new Map(after).has(tag)) ||
      report.changes.some((c) => !permitted.has(c.tag)) ||
      report.changes.length !== 12
    )
      throw Error('Native recipe changed content outside its reviewed twelve-tag footprint');
    report.cache = { bytes: cache.length, sha256: hash(cache), version: 609 };
    report.complete = true;
  } catch (error) {
    report.error = String(error);
    process.exitCode = 1;
  } finally {
    try {
      report.originalsUnchanged = hash(JSON.stringify(await inventory(source))) === pins.tagTreeSha256;
      report.toolsUnchanged =
        hash(await regular(tool)) === pins.tools.classic &&
        hash(await regular(edit)) === pins.tools.invaderEdit;
      report.stagedToolsUnchanged =
        hash(await regular(path.join(output, 'tool.exe'))) === pins.tools.classic &&
        hash(await regular(path.join(output, 'tools', 'invader-edit.exe'))) === pins.tools.invaderEdit;
      for (const [name, expected] of Object.entries(pins.toolFiles))
        if (hash(await regular(path.join(output, name))) !== expected) report.stagedToolsUnchanged = false;
    } catch (error) {
      report.integrityReadbackError = String(error);
      report.stagedToolsUnchanged = false;
    }
    if (!report.originalsUnchanged || !report.toolsUnchanged || !report.stagedToolsUnchanged) {
      report.complete = false;
      process.exitCode = 1;
    }
    await fs.writeFile(
      path.join(output, 'carrier-recovery-receipt.json'),
      JSON.stringify(report, null, 2) + '\n',
      { flag: 'wx' },
    );
    console.log(
      JSON.stringify({
        complete: report.complete,
        error: report.error,
        cache: report.cache,
        originalsUnchanged: report.originalsUnchanged,
        gameplayAccepted: false,
        faithfulConversionAccepted: false,
      }),
    );
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  execute(process.argv.slice(2)).catch((e) => {
    console.error(String(e));
    process.exitCode = 1;
  });
