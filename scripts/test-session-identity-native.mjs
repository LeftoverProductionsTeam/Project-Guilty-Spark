// Three independent Spark processes and private libraries. Only owned loopback
// sessions are used. No real player's credentials, game process or mock IPC.
import { chromium, expect as assertion } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import { spawn } from 'node:child_process';
const expect = assertion.configure({ timeout: 45000 }),
  [binary, destination] = process.argv.slice(2);
if (!binary || !destination) throw Error('test-session-identity-native <Spark.exe> <fresh acceptance root>');
const root = path.resolve(destination);
await fs.mkdir(root);
const receipt = {
    schemaVersion: 1,
    nativeProcesses: 3,
    separateLibraries: 3,
    physicalMachines: 1,
    mockedIpc: false,
    gameProcessTouched: false,
    complete: false,
    appSha256: crypto
      .createHash('sha256')
      .update(await fs.readFile(binary))
      .digest('hex'),
  },
  actors = [],
  errors = [],
  proxies = [];
async function start(actor, restart = false) {
  const socket = net.createServer();
  await new Promise((r) => socket.listen(0, '127.0.0.1', r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  actor.child = spawn(actor.exe, [], {
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      GUILTY_SPARK_DATA_DIR: actor.data,
      WEBVIEW2_USER_DATA_FOLDER: path.join(root, actor.name, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
  await expect
    .poll(() =>
      fetch(`http://127.0.0.1:${port}/json/version`).then(
        (r) => r.ok,
        () => false,
      ),
    )
    .toBe(true);
  actor.browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect
    .poll(() =>
      actor.browser
        .contexts()
        .flatMap((c) => c.pages())
        .some((p) => p.url().includes('tauri.localhost')),
    )
    .toBe(true);
  actor.page = actor.browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('tauri.localhost'));
  actor.page.on('pageerror', (e) => errors.push({ actor: actor.name, error: String(e) }));
  actor.call = (command, args = {}) =>
    actor.page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), {
      command,
      args,
    });
  if (!restart) {
    const boot = await actor.call('bootstrap');
    await actor.call('save_settings', {
      settings: { ...boot.settings, onboardingCompleted: true, autoBuild: false },
    });
    const created = await actor.call('create_quickforge_project', {
      title: 'Identity ' + actor.name,
      template: 'smallIndoorArena',
      target: 'mccSteam',
    });
    actor.id = created.project.id;
    actor.document = created.project.quickForge;
  }
  await actor.call('claim_project_document', { id: actor.id });
}
async function actor(name) {
  const dir = path.join(root, name);
  await fs.mkdir(dir);
  const a = { name, data: path.join(dir, 'library'), exe: path.join(dir, 'GuiltySpark-identity-qa.exe') };
  await fs.mkdir(a.data);
  await fs.copyFile(path.resolve(binary), a.exe, fs.constants.COPYFILE_EXCL);
  actors.push(a);
  await start(a);
  return a;
}
async function host(a, studio) {
  const result = await a.call('forge_session_host', {
    projectId: a.id,
    document: a.document,
    lan: false,
    transport: 'lan',
    linkGame: false,
    studio,
    displayName: a.name,
    bindAddress: '127.0.0.1',
  });
  a.session = result.sessionId;
  return result;
}
async function invite(a) {
  return a.call('forge_session_invite', {
    projectId: a.id,
    sessionId: a.session,
    address: '127.0.0.1',
    viewer: false,
  });
}
async function join(a, text, legacy) {
  const result = await a.call('forge_session_join', {
    projectId: a.id,
    endpoint: legacy?.endpoint ?? '',
    key: legacy?.key ?? '',
    transport: 'lan',
    invite: text ?? null,
    displayName: a.name,
  });
  a.session = result.sessionId;
  return result.authorId;
}
async function leave(a) {
  await a.call('forge_session_leave', { projectId: a.id, sessionId: a.session });
  a.session = null;
}
async function crash(a) {
  await a.browser.close().catch(() => {});
  a.browser = null;
  if (a.child.exitCode === null) {
    await new Promise((resolve) => {
      a.child.once('exit', resolve);
      a.child.kill();
    });
  }
}
async function observeOwnPlaintext(endpoint) {
  const [host, port] = endpoint.split(':'),
    sockets = new Set();
  let captured;
  const server = net.createServer((socket) => {
    const upstream = net.createConnection({ host, port: Number(port) });
    sockets.add(socket);
    sockets.add(upstream);
    let pending = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      if (captured) return;
      pending = Buffer.concat([pending, chunk]);
      if (pending.length > 4 * 1024 * 1024 + 4) {
        socket.destroy();
        return;
      }
      if (pending.length >= 4 && pending.length >= 4 + pending.readUInt32BE(0)) {
        const request = JSON.parse(pending.subarray(4, 4 + pending.readUInt32BE(0)).toString('utf8'));
        if (request.command.kind === 'join')
          captured = { client: request.client, credential: request.credential };
      }
    });
    socket.on('error', () => upstream.destroy());
    upstream.on('error', () => socket.destroy());
    socket.on('close', () => {
      sockets.delete(socket);
      upstream.destroy();
    });
    upstream.on('close', () => {
      sockets.delete(upstream);
      socket.destroy();
    });
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const proxy = {
    endpoint: '127.0.0.1:' + server.address().port,
    captured: () => captured,
    close: () => {
      for (const s of sockets) s.destroy();
      server.close();
    },
  };
  proxies.push(proxy);
  return proxy;
}
async function pollUsingEarlierPlainCredentials(target, credential) {
  const [host, port] = target.endpoint.split(':'),
    der = Buffer.from(target.certificate, 'hex'),
    pem =
      '-----BEGIN CERTIFICATE-----\n' +
      der
        .toString('base64')
        .match(/.{1,64}/g)
        .join('\n') +
      '\n-----END CERTIFICATE-----\n';
  return new Promise((resolve, reject) => {
    let pending = Buffer.alloc(0);
    const socket = tls.connect(
      {
        host,
        port: Number(port),
        servername: 'sparklink.local',
        ca: pem,
        minVersion: 'TLSv1.3',
        maxVersion: 'TLSv1.3',
        rejectUnauthorized: true,
      },
      () => {
        const payload = Buffer.from(
            JSON.stringify({
              schemaVersion: target.schemaVersion,
              key: '',
              ...credential,
              command: { kind: 'poll', revision: null },
            }),
          ),
          prefix = Buffer.alloc(4);
        prefix.writeUInt32BE(payload.length);
        socket.write(Buffer.concat([prefix, payload]));
      },
    );
    const timer = setTimeout(() => socket.destroy(Error('Owned TLS probe timed out')), 5000);
    socket.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      if (pending.length > 4 * 1024 * 1024 + 4) {
        socket.destroy(Error('Oversized owned response'));
        return;
      }
      if (pending.length >= 4 && pending.length >= 4 + pending.readUInt32BE(0)) {
        clearTimeout(timer);
        const response = JSON.parse(pending.subarray(4, 4 + pending.readUInt32BE(0)).toString('utf8'));
        socket.destroy();
        resolve(!response.error && response.view?.sessionId === target.sessionId);
      }
    });
  });
}
try {
  const a = await actor('A'),
    b = await actor('B'),
    c = await actor('C');
  const legacy = await host(a, false),
    proxy = await observeOwnPlaintext(legacy.endpoint),
    route = { ...legacy, endpoint: proxy.endpoint },
    oldIdentity = await join(b, null, route);
  await leave(b);
  const secondPlain = await join(b, null, route);
  receipt.plaintextIdentityIsEphemeral = secondPlain !== oldIdentity;
  await leave(b);
  await leave(a);
  const captured = proxy.captured();
  expect(captured.client).toBe(oldIdentity);
  proxy.close();
  receipt.ownedLegacyWireObserved = true;
  const modern = await host(a, true);
  await host(c, true);
  const aInvite = await invite(a),
    cInvite = await invite(c);
  const first = await join(b, aInvite),
    target = await a.call('forge_session_parse_invite', { text: aInvite });
  receipt.earlierPlainCredentialsCanReadLaterTlsSession = await pollUsingEarlierPlainCredentials(
    target,
    captured,
  );
  expect(receipt.earlierPlainCredentialsCanReadLaterTlsSession).toBe(false);
  receipt.noPlaintextCredentialReuse = first !== oldIdentity && first !== secondPlain;
  expect(receipt.noPlaintextCredentialReuse).toBe(true);
  expect(receipt.plaintextIdentityIsEphemeral).toBe(true);
  await leave(b);
  const other = await join(b, cInvite);
  expect(other).not.toBe(first);
  receipt.independentTlsSessionsUseDifferentIdentities = true;
  await leave(b);
  expect(await join(b, aInvite)).toBe(first);
  receipt.sameSessionRejoinRetainsAuthor = true;
  await leave(b);
  const records = await a.call('forge_studio_history', { projectId: a.id }),
    record = records.find((r) => r.sessionId === modern.sessionId);
  expect(record).toBeTruthy();
  await crash(a);
  await start(a, true);
  const recovered = await a.call('forge_studio_recover', {
    projectId: a.id,
    directoryId: record.directoryId,
    address: '127.0.0.1',
    displayName: a.name,
  });
  expect(recovered.sessionId).toBe(modern.sessionId);
  a.session = recovered.sessionId;
  const fresh = await invite(a);
  expect(fresh).not.toBe(aInvite);
  expect(await join(b, fresh)).toBe(first);
  receipt.recoveredSessionRetainsAuthorWithNewPinnedInvitation = true;
  receipt.pageErrors = errors;
  expect(errors).toEqual([]);
  receipt.complete = true;
  await fs.writeFile(path.join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log('PASS isolated legacy/TLS identities, independent sessions, rejoin and native host recovery');
} catch (e) {
  receipt.error = String(e);
  receipt.stack = e.stack;
  receipt.pageErrors = errors;
  await fs.writeFile(path.join(root, 'failure.json'), JSON.stringify(receipt, null, 2));
  throw e;
} finally {
  for (const p of proxies) p.close();
  for (const a of actors) {
    if (a.browser && a.session) await leave(a).catch(() => {});
    await a.browser?.close().catch(() => {});
    if (a.child?.exitCode === null) a.child.kill();
  }
}
