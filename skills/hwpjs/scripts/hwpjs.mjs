#!/usr/bin/env node
import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { fileURLToPath } from 'node:url';

const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_WASM_BYTES = 32 * 1024 * 1024;
const names = ['cli.mjs', 'mcp.mjs', 'hwpjs.wasm', 'LICENSE', 'THIRD_PARTY_NOTICES.md'];
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
async function boundedRead(url, limit) {
  const file = await open(url, 'r');
  try {
    const before = await file.stat();
    if (
      !before.isFile() ||
      !Number.isSafeInteger(before.size) ||
      before.size > limit ||
      before.size < 1
    )
      throw Error('InvalidSkillAssetSize');
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) throw Error('SkillAssetChangedDuringRead');
      offset += bytesRead;
    }
    if ((await file.read(Buffer.alloc(1), 0, 1, offset)).bytesRead)
      throw Error('SkillAssetChangedDuringRead');
    const after = await file.stat();
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    )
      throw Error('SkillAssetChangedDuringRead');
    return bytes;
  } finally {
    await file.close();
  }
}
async function launch() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 24 || (major === 24 && minor < 20)) throw Error('Node24.20.0OrLaterRequired');
  const directory = new URL('../assets/hwpjs/', import.meta.url);
  const manifest = JSON.parse(
    (await boundedRead(new URL('manifest.json', directory), 32 * 1024)).toString('utf8'),
  );
  if (
    !object(manifest) ||
    manifest.schemaVersion !== 1 ||
    manifest.namespace !== '@ohah/hwpjs' ||
    manifest.runtime !== 'node>=24.20.0' ||
    !object(manifest.files) ||
    Object.keys(manifest.files).length !== names.length ||
    !Object.keys(manifest.files).every((name) => names.includes(name))
  )
    throw Error('InvalidSkillManifest');
  for (const name of names) {
    const entry = manifest.files[name];
    if (
      !object(entry) ||
      Object.keys(entry).length !== 2 ||
      !Object.hasOwn(entry, 'sha256') ||
      !Object.hasOwn(entry, 'bytes') ||
      typeof entry.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 1
    )
      throw Error('InvalidSkillManifest');
    if (
      (name.endsWith('.mjs') && entry.bytes > MAX_ENTRY_BYTES) ||
      (name === 'hwpjs.wasm' && entry.bytes > MAX_WASM_BYTES)
    )
      throw Error('InvalidSkillAssetSize');
  }
  const argv = process.argv.slice(2);
  const name = argv[0] === 'mcp' ? 'mcp.mjs' : 'cli.mjs';
  if (name === 'mcp.mjs') argv.shift();
  for (const [asset, limit] of [
    [name, MAX_ENTRY_BYTES],
    ['hwpjs.wasm', MAX_WASM_BYTES],
  ]) {
    const bytes = await boundedRead(new URL(asset, directory), limit),
      expected = manifest.files[asset];
    if (
      bytes.length !== expected.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== expected.sha256
    )
      throw Error('SkillAssetIntegrityMismatch:' + asset);
  }
  const child = spawn(process.execPath, [fileURLToPath(new URL(name, directory)), ...argv], {
    stdio: 'inherit',
    shell: false,
  });
  const interrupt = () => {
      child.kill('SIGINT');
    },
    terminate = () => {
      child.kill('SIGTERM');
    };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    return await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(code ?? 128 + (constants.signals[signal] ?? 0)));
    });
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
  }
}
try {
  process.exitCode = await launch();
} catch (cause) {
  const message = Array.from(String(cause?.code ?? cause?.message ?? cause), (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? '\\u' + code.toString(16).padStart(4, '0') : character;
  }).join('');
  process.exitCode = 1;
  await new Promise((resolve) => {
    process.stderr.once('error', resolve);
    process.stderr.write('error: ' + message + '\n', resolve);
  });
}
