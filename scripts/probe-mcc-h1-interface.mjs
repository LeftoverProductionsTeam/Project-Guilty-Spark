// Read-only PE interface inventory. Never loads a DLL, calls an export, attaches
// a debugger, reads credentials or modifies game/process/network configuration.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function inspectPeInterface(bytes) {
  const span = (at, size) => {
    if (
      !Number.isSafeInteger(at) ||
      !Number.isSafeInteger(size) ||
      at < 0 ||
      size < 0 ||
      at + size > bytes.length
    )
      throw Error('PE range escapes file');
    return bytes.subarray(at, at + size);
  };
  const u16 = (at) => span(at, 2).readUInt16LE(),
    u32 = (at) => span(at, 4).readUInt32LE();
  if (span(0, 2).toString('ascii') !== 'MZ') throw Error('Not a PE image');
  const pe = u32(0x3c);
  if (!span(pe, 4).equals(Buffer.from([80, 69, 0, 0]))) throw Error('Invalid PE signature');
  const machine = u16(pe + 4),
    count = u16(pe + 6),
    optionalSize = u16(pe + 20),
    optional = pe + 24;
  if (machine !== 0x8664 || count < 1 || count > 96 || optionalSize < 128 || u16(optional) !== 0x20b)
    throw Error('Expected bounded Windows x64 PE32+ MCC image');
  span(optional, optionalSize);
  span(optional + optionalSize, count * 40);
  const directories = u32(optional + 108),
    headerSize = u32(optional + 60),
    sections = [];
  if (
    directories < 2 ||
    directories > 16 ||
    112 + directories * 8 > optionalSize ||
    headerSize > bytes.length
  )
    throw Error('Invalid PE directory/header bounds');
  for (let index = 0; index < count; index++) {
    const at = optional + optionalSize + index * 40;
    sections.push({ virtual: u32(at + 12), raw: u32(at + 20), size: u32(at + 16) });
  }
  const offset = (rva, length = 1) => {
    if (!Number.isSafeInteger(rva) || rva < 0) throw Error('Invalid PE RVA');
    if (rva < headerSize && rva + length <= headerSize) {
      span(rva, length);
      return rva;
    }
    const matching = sections.filter(
      (section) => rva >= section.virtual && rva - section.virtual + length <= section.size,
    );
    if (matching.length !== 1) throw Error('Unmapped or ambiguous PE RVA');
    const at = matching[0].raw + rva - matching[0].virtual;
    span(at, length);
    return at;
  };
  const string = (rva) => {
    const at = offset(rva);
    let size = 0;
    while (size < 256) {
      const byte = span(at + size, 1)[0];
      // Keep the entire string inside one mapped file range.
      offset(rva, size + 1);
      if (byte === 0) return span(at, size).toString('ascii');
      if (byte < 32 || byte > 126) throw Error('Invalid PE symbol encoding');
      size++;
    }
    throw Error('PE symbol exceeds 255 bytes');
  };
  const exports = [],
    imports = [];
  const exportRva = u32(optional + 112),
    exportBytes = u32(optional + 116);
  if (exportRva || exportBytes) {
    if (!exportRva || exportBytes < 40) throw Error('Invalid PE export directory');
    const at = offset(exportRva, 40),
      functions = u32(at + 20),
      names = u32(at + 24);
    if (functions > 8192 || names > functions) throw Error('PE export count exceeds bound');
    const functionTable = offset(u32(at + 28), functions * 4),
      nameTable = offset(u32(at + 32), names * 4),
      ordinals = offset(u32(at + 36), names * 2);
    const seen = new Set();
    for (let i = 0; i < names; i++) {
      const name = string(u32(nameTable + i * 4)),
        ordinal = u16(ordinals + i * 2);
      if (!name || seen.has(name) || ordinal >= functions) throw Error('Invalid/duplicate PE export');
      seen.add(name);
      const target = u32(functionTable + ordinal * 4);
      if (!target) throw Error('PE named export has no target');
      exports.push({ name, forwarded: target >= exportRva && target < exportRva + exportBytes });
    }
  }
  const importRva = u32(optional + 120),
    importBytes = u32(optional + 124);
  if (importRva || importBytes) {
    if (!importRva || importBytes < 20 || importBytes > 1024 * 1024)
      throw Error('Invalid PE import directory');
    let terminated = false,
      totalSymbols = 0;
    for (let i = 0; i < Math.min(256, Math.floor(importBytes / 20)); i++) {
      const at = offset(importRva + i * 20, 20);
      if (span(at, 20).every((byte) => byte === 0)) {
        terminated = true;
        break;
      }
      const dll = string(u32(at + 12));
      if (!dll || /[\\/:]/.test(dll)) throw Error('Invalid imported DLL identity');
      const thunk = u32(at) || u32(at + 16),
        symbols = [];
      let end = false;
      for (let n = 0; n < 4096; n++) {
        const value = span(offset(thunk + n * 8, 8), 8).readBigUInt64LE();
        if (value === 0n) {
          end = true;
          break;
        }
        if (++totalSymbols > 32768) throw Error('PE total import bound');
        if (value & 0x8000000000000000n) symbols.push(`#${Number(value & 0xffffn)}`);
        else {
          if (value > 0xfffffffdn) throw Error('Invalid PE import RVA');
          symbols.push(string(Number(value) + 2));
        }
      }
      if (!end) throw Error('Unterminated PE import table');
      imports.push({ dll, symbols });
    }
    if (!terminated) throw Error('Unterminated PE import directory');
  }
  return {
    machine: 'x64',
    format: 'PE32+',
    exports,
    imports,
    directWinsockImport: imports.some((entry) => /^(?:ws2_32|wsock32)\.dll$/i.test(entry.dll)),
    factoryExportPresent: exports.some((entry) => entry.name === 'CreateGameEngine'),
    limitation:
      'Static file symbols only. A factory export does not verify its ABI, engine/session ownership, safe update callbacks or a join interface. Absence of direct socket imports does not establish absence of networking.',
  };
}

async function main(args) {
  if (args.length !== 4 || args[0] !== '--mcc' || args[2] !== '--output')
    throw Error('Use --mcc <owned-MCC-root> --output <new-json-file>');
  const root = path.resolve(args[1]),
    output = path.resolve(args[3]);
  const source = await fs.readFile(
    new URL('../crates/spark-core/src/live_adapter.rs', import.meta.url),
    'utf8',
  );
  const reviewed = Object.fromEntries(
    ['EXE_SHA256', 'MODULE_SHA256'].map((name) => {
      const match = source.match(new RegExp(`pub const ${name}: &str = "([a-f0-9]{64})"`));
      if (!match) throw Error('Existing reviewed MCC identity missing');
      return [name, match[1]];
    }),
  );
  const files = [];
  for (const [relative, expected] of [
    ['MCC/Binaries/Win64/MCC-Win64-Shipping.exe', reviewed.EXE_SHA256],
    ['halo1/halo1.dll', reviewed.MODULE_SHA256],
  ]) {
    const filename = path.join(root, relative),
      stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024 * 1024)
      throw Error('Expected bounded original MCC file');
    const bytes = await fs.readFile(filename),
      after = await fs.lstat(filename);
    if (stat.size !== after.size || stat.mtimeMs !== after.mtimeMs)
      throw Error('MCC file changed during read');
    files.push({
      relativePath: relative,
      bytes: bytes.length,
      sha256: hash(bytes),
      matchesExistingReviewedLiveProfile: hash(bytes) === expected,
      interface: inspectPeInterface(bytes),
    });
  }
  const report = {
    schemaVersion: 1,
    files,
    dllLoadedOrExecuted: false,
    processMemoryRead: false,
    processMemoryWritten: false,
    sessionAdmissionApiVerified: false,
    crossPlayEstablished: false,
    scope:
      'Offline inspection of actual owned MCC H1 engine/shell files; not a transport capture, accepted engine ABI or gameplay bridge.',
  };
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(
    JSON.stringify(
      files.map((file) => ({
        file: file.relativePath,
        sha256: file.sha256,
        exportCount: file.interface.exports.length,
        engineExports: file.interface.exports.filter((entry) =>
          ['CreateGameEngine', 'CreateDataAccess', 'SetLibrarySettings'].includes(entry.name),
        ),
        importedDlls: file.interface.imports.map((entry) => entry.dll),
        directWinsock: file.interface.directWinsockImport,
      })),
    ),
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(String(error));
    process.exitCode = 1;
  });
}
