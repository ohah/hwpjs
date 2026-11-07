#!/usr/bin/env node
import * as nodeFS from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FILES = ['cli.mjs', 'mcp.mjs', 'hwpjs.wasm', 'LICENSE', 'THIRD_PARTY_NOTICES.md'];
const OUTPUTS = [...FILES, 'manifest.json'];
const LIMIT = 32 * 1024 * 1024;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fail = (code) => {
  throw Error(code);
};
const identity = (value) => `${value.dev}:${value.ino}`;
export function parseBuildArguments(argv) {
  const options = {};
  if (argv.length === 1 && argv[0] === '--help') return { help: true };
  for (let index = 0; index < argv.length; index++) {
    const match = /^--(package-dir|out)(?:=(.*))?$/.exec(argv[index]);
    if (!match || Object.hasOwn(options, match[1])) fail('InvalidSkillBuildArgument');
    const value = match[2] ?? argv[++index];
    if (typeof value !== 'string' || !value || value.startsWith('--') || value.includes('\0'))
      fail('InvalidSkillBuildArgument');
    options[match[1]] = value;
  }
  return { packageDir: options['package-dir'], out: options.out };
}
/** Copies only validated canonical package outputs. No parser, bundler or network. */
export async function buildAgentSkill(
  { packageDir = 'packages/hwpjs', out = 'skills/hwpjs/assets/hwpjs' } = {},
  { fs = nodeFS, root = ROOT } = {},
) {
  root = await fs.realpath(root);
  const output = resolve(root, out),
    defaultOutput = join(root, 'skills/hwpjs/assets/hwpjs'),
    verification = join(root, 'zig-out/verification') + sep;
  if (output !== defaultOutput && !output.startsWith(verification)) fail('UnownedSkillOutput');
  const parent = dirname(output),
    pkg = resolve(root, packageDir);
  const read = async (path, limit = LIMIT) => {
    const leaf = await fs.lstat(path);
    if (!leaf.isFile() || leaf.isSymbolicLink()) fail('SkillInputNotRegularFile');
    const handle = await fs.open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const before = await handle.stat();
      if (
        identity(before) !== identity(leaf) ||
        !before.isFile() ||
        !Number.isSafeInteger(before.size) ||
        before.size < 1 ||
        before.size > limit
      )
        fail('InvalidSkillInputSize');
      const bytes = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!bytesRead) fail('SkillInputChanged');
        offset += bytesRead;
      }
      const extra = await handle.read(Buffer.alloc(1), 0, 1, offset),
        after = await handle.stat();
      if (
        extra.bytesRead ||
        before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs ||
        before.ctimeMs !== after.ctimeMs
      )
        fail('SkillInputChanged');
      return bytes;
    } finally {
      await handle.close();
    }
  };
  const packageManifest = JSON.parse(
    (await read(join(pkg, 'package.json'), 4 * 1024 * 1024)).toString('utf8'),
  );
  const build = JSON.parse(
    (await read(join(pkg, 'dist/build-manifest.json'), 4 * 1024 * 1024)).toString('utf8'),
  );
  if (
    packageManifest.name !== '@ohah/hwpjs' ||
    !object(packageManifest.bin) ||
    !['dist/cli.mjs', './dist/cli.mjs'].includes(packageManifest.bin.hwpjs) ||
    !['dist/mcp.mjs', './dist/mcp.mjs'].includes(packageManifest.bin['hwpjs-mcp'])
  )
    fail('InvalidCanonicalSkillPackage');
  if (build.schemaVersion !== 1 || build.namespace !== '@ohah/hwpjs' || !object(build.files))
    fail('InvalidCanonicalBuildManifest');
  if (build.sourceFingerprint !== undefined && !validHash(build.sourceFingerprint))
    fail('InvalidCanonicalBuildManifest');
  const bytes = new Map();
  for (const name of FILES) {
    const value = await read(
      join(pkg, name.endsWith('.mjs') || name === 'hwpjs.wasm' ? 'dist' : '', name),
    );
    if (name.endsWith('.mjs') || name === 'hwpjs.wasm') {
      if (!validHash(build.files[name]) || digest(value) !== build.files[name])
        fail('CanonicalSkillDigestMismatch:' + name);
    }
    bytes.set(name, value);
  }
  if (
    !bytes
      .get('hwpjs.wasm')
      .subarray(0, 8)
      .equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]))
  )
    fail('InvalidSkillWasm');
  const manifest = {
    schemaVersion: 1,
    namespace: '@ohah/hwpjs',
    runtime: 'node>=24.20.0',
    files: Object.fromEntries(
      [...bytes].map(([name, value]) => [name, { sha256: digest(value), bytes: value.length }]),
    ),
    ...(build.sourceFingerprint ? { sourceFingerprint: build.sourceFingerprint } : {}),
  };
  bytes.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  // Check existing ancestors before mkdir; output symlinks never redirect writes.
  let cursor = root;
  for (const part of relative(root, parent).split(sep)) {
    cursor = join(cursor, part);
    try {
      const value = await fs.lstat(cursor);
      if (!value.isDirectory() || value.isSymbolicLink()) fail('SkillOutputParentNotDirectory');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const inspectOutput = async (path) => {
    let info;
    try {
      info = await fs.lstat(path);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    if (!info.isDirectory() || info.isSymbolicLink()) fail('SkillOutputNotDirectory');
    const entries = await fs.readdir(path);
    if (entries.length !== OUTPUTS.length || !entries.every((name) => OUTPUTS.includes(name)))
      fail('UnknownSkillOutputFiles');
    const hashes = {};
    for (const name of OUTPUTS)
      hashes[name] = digest(
        await read(join(path, name), name === 'manifest.json' ? 32 * 1024 : LIMIT),
      );
    const previous = JSON.parse(
      (await read(join(path, 'manifest.json'), 32 * 1024)).toString('utf8'),
    );
    if (
      previous.schemaVersion !== 1 ||
      previous.namespace !== '@ohah/hwpjs' ||
      !object(previous.files) ||
      Object.keys(previous.files).length !== FILES.length ||
      !Object.keys(previous.files).every((name) => FILES.includes(name))
    )
      fail('UnknownSkillOutputManifest');
    return { identity: identity(info), hashes };
  };
  const previous = await inspectOutput(output);
  await fs.mkdir(parent, { recursive: true });
  const stage = await fs.mkdtemp(join(parent, '.hwpjs-skill-stage-'));
  let backup = null,
    movedOld = false,
    published = false,
    failure;
  const warnings = [];
  const cleanup = async (path) => {
    // Refuse unfamiliar entries as a whole; never recursively remove a tree.
    const entries = await fs.readdir(path);
    if (!entries.every((name) => OUTPUTS.includes(name))) fail('UnknownSkillCleanupFiles');
    for (const name of entries) {
      const info = await fs.lstat(join(path, name));
      if (!info.isFile() || info.isSymbolicLink()) fail('UnknownSkillCleanupEntry');
    }
    for (const name of entries) await fs.unlink(join(path, name));
    await fs.rmdir(path);
  };
  try {
    for (const [name, value] of bytes)
      await fs.writeFile(join(stage, name), value, {
        flag: 'wx',
        mode: name.endsWith('.mjs') ? 0o755 : 0o644,
      });
    const current = await inspectOutput(output);
    if (JSON.stringify(current) !== JSON.stringify(previous)) fail('SkillOutputChanged');
    if (previous) {
      backup = await fs.mkdtemp(join(parent, '.hwpjs-skill-backup-'));
      await fs.rename(output, backup);
      movedOld = true;
    }
    try {
      await fs.rename(stage, output);
      published = true;
    } catch (error) {
      if (movedOld) {
        try {
          if (
            await fs.lstat(output).then(
              () => true,
              (cause) => (cause.code === 'ENOENT' ? false : Promise.reject(cause)),
            )
          )
            fail('SkillRollbackDestinationExists');
          await fs.rename(backup, output);
          backup = null;
          movedOld = false;
        } catch (rollback) {
          error.rollbackError = String(rollback.message);
          error.preservedBackup = backup;
        }
      }
      throw error;
    }
    if (backup) {
      try {
        await cleanup(backup);
        backup = null;
      } catch (error) {
        warnings.push({ phase: 'cleanup-backup', path: backup, error: String(error.message) });
      }
    }
    return { published: true, output, replaced: Boolean(previous), manifest, warnings };
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    if (!published) {
      try {
        await cleanup(stage);
      } catch (error) {
        warnings.push({ phase: 'cleanup-stage', path: stage, error: String(error.message) });
      }
    }
    if (backup && !movedOld) {
      try {
        await fs.rmdir(backup);
      } catch (error) {
        warnings.push({
          phase: 'cleanup-empty-backup',
          path: backup,
          error: String(error.message),
        });
      }
    }
    if (failure && warnings.length) failure.cleanupWarnings = warnings;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseBuildArguments(process.argv.slice(2));
    if (options.help)
      console.log('Usage: node tools/build-agent-skill.mjs [--package-dir PATH] [--out PATH]');
    else console.log(JSON.stringify(await buildAgentSkill(options)));
  } catch (error) {
    console.error(
      JSON.stringify({
        error: String(error.message),
        ...(error.preservedBackup
          ? { preservedBackup: error.preservedBackup, rollbackError: error.rollbackError }
          : {}),
        ...(error.cleanupWarnings ? { cleanupWarnings: error.cleanupWarnings } : {}),
      }),
    );
    process.exitCode = 1;
  }
}
