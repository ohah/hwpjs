import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { buildAgentSkill, parseBuildArguments } from '../build-agent-skill.mjs';
const evidence = resolve('zig-out/verification/cli-mcp-skill-r1/builder/.tmp');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const names = [
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'cli.mjs',
  'hwpjs.wasm',
  'manifest.json',
  'mcp.mjs',
];
async function fixture(t) {
  await fs.mkdir(evidence, { recursive: true });
  const root = await fs.mkdtemp(join(evidence, 'case-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const pkg = join(root, 'pkg'),
    output = join(root, 'skills/hwpjs/assets/hwpjs');
  await fs.mkdir(join(pkg, 'dist'), { recursive: true });
  const packageManifest = {
    name: '@ohah/hwpjs',
    bin: { hwpjs: './dist/cli.mjs', 'hwpjs-mcp': './dist/mcp.mjs' },
  };
  const build = {
    schemaVersion: 1,
    namespace: '@ohah/hwpjs',
    sourceFingerprint: 'a'.repeat(64),
    files: {},
  };
  const values = {
    'cli.mjs': Buffer.from('#!/usr/bin/env node\nconsole.log("cli");\n'),
    'mcp.mjs': Buffer.from('#!/usr/bin/env node\nconsole.log("mcp");\n'),
    'hwpjs.wasm': Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]),
    LICENSE: Buffer.from('MIT license\n'),
    'THIRD_PARTY_NOTICES.md': Buffer.from('Third party license notices\n'),
  };
  const save = async () => {
    await fs.writeFile(join(pkg, 'package.json'), JSON.stringify(packageManifest));
    await fs.writeFile(join(pkg, 'dist/build-manifest.json'), JSON.stringify(build));
  };
  for (const [name, bytes] of Object.entries(values)) {
    await fs.writeFile(
      join(pkg, name === 'LICENSE' || name === 'THIRD_PARTY_NOTICES.md' ? '' : 'dist', name),
      bytes,
    );
    if (name !== 'LICENSE' && name !== 'THIRD_PARTY_NOTICES.md') build.files[name] = hash(bytes);
  }
  await save();
  const run = (overrides) => buildAgentSkill({ packageDir: 'pkg' }, { root, ...overrides });
  const snapshot = async (path = output) =>
    Object.fromEntries(
      await Promise.all(
        (await fs.readdir(path))
          .sort()
          .map(async (name) => [name, (await fs.readFile(join(path, name))).toString('base64')]),
      ),
    );
  const replaceCLI = async () => {
    const bytes = Buffer.from('console.log("new cli");\n');
    await fs.writeFile(join(pkg, 'dist/cli.mjs'), bytes);
    build.files['cli.mjs'] = hash(bytes);
    await save();
  };
  return { root, pkg, output, packageManifest, build, values, save, run, snapshot, replaceCLI };
}
test('canonical byte copies and launcher schema are deterministic with executable Node entries', async (t) => {
  const f = await fixture(t),
    result = await f.run();
  assert.equal(result.published, true);
  assert.equal(result.replaced, false);
  assert.deepEqual(await fs.readdir(f.output).then((v) => v.sort()), names);
  const manifest = JSON.parse(await fs.readFile(join(f.output, 'manifest.json'), 'utf8'));
  assert.equal(manifest.runtime, 'node>=24.20.0');
  assert.equal(manifest.sourceFingerprint, 'a'.repeat(64));
  for (const [name, bytes] of Object.entries(f.values)) {
    assert.deepEqual(await fs.readFile(join(f.output, name)), bytes);
    assert.deepEqual(manifest.files[name], { sha256: hash(bytes), bytes: bytes.length });
  }
  assert.equal((await fs.stat(join(f.output, 'cli.mjs'))).mode & 0o777, 0o755);
  const launcher = join(f.root, 'skills/hwpjs/scripts/hwpjs.mjs');
  await fs.mkdir(dirname(launcher), { recursive: true });
  await fs.copyFile('skills/hwpjs/scripts/hwpjs.mjs', launcher);
  for (const [args, expected] of [
    [['read', 'document.hwp'], 'cli\n'],
    [['mcp'], 'mcp\n'],
  ]) {
    const child = spawnSync(process.execPath, [launcher, ...args], {
      cwd: f.root,
      encoding: 'utf8',
      timeout: 4000,
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, expected);
  }
});
test('all bound runtime digests validate before writes and preserve previous output on corruption', async (t) => {
  for (const name of ['cli.mjs', 'mcp.mjs', 'hwpjs.wasm']) {
    const f = await fixture(t);
    await f.run();
    const before = await f.snapshot();
    await fs.appendFile(join(f.pkg, 'dist', name), 'bad');
    await assert.rejects(f.run(), /CanonicalSkillDigestMismatch/);
    assert.deepEqual(await f.snapshot(), before);
    assert.deepEqual(await fs.readdir(dirname(f.output)), ['hwpjs']);
  }
});
test('missing MCP cannot create output parents or leave partial assets', async (t) => {
  const f = await fixture(t);
  await fs.unlink(join(f.pkg, 'dist/mcp.mjs'));
  await assert.rejects(f.run(), { code: 'ENOENT' });
  await assert.rejects(fs.lstat(join(f.root, 'skills')), { code: 'ENOENT' });
});
test('wrong namespace, bin mapping, metadata or WASM signature cannot publish', async (t) => {
  for (const kind of ['name', 'bin', 'schema', 'fingerprint', 'signature']) {
    const f = await fixture(t);
    if (kind === 'name') f.packageManifest.name = 'other';
    if (kind === 'bin') f.packageManifest.bin['hwpjs-mcp'] = '../mcp.mjs';
    if (kind === 'schema') f.build.schemaVersion = 2;
    if (kind === 'fingerprint') f.build.sourceFingerprint = 'bad';
    if (kind === 'signature') {
      const bytes = Buffer.from('not wasm');
      await fs.writeFile(join(f.pkg, 'dist/hwpjs.wasm'), bytes);
      f.build.files['hwpjs.wasm'] = hash(bytes);
    }
    await f.save();
    await assert.rejects(f.run(), /InvalidCanonical|InvalidSkillWasm/);
    await assert.rejects(fs.lstat(f.output), { code: 'ENOENT' });
  }
});
test('unowned output path is refused but owned verification output works', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    buildAgentSkill({ packageDir: 'pkg', out: 'unowned' }, { root: f.root }),
    /UnownedSkillOutput/,
  );
  await assert.rejects(fs.lstat(join(f.root, 'unowned')), { code: 'ENOENT' });
  const result = await buildAgentSkill(
    { packageDir: 'pkg', out: 'zig-out/verification/owned/runtime' },
    { root: f.root },
  );
  assert.equal(result.published, true);
});
test('source symlink leaves and destination symlink directories are never followed', async (t) => {
  const f = await fixture(t),
    entry = join(f.pkg, 'dist/cli.mjs');
  await fs.rename(entry, entry + '.original');
  await fs.symlink(entry + '.original', entry);
  await assert.rejects(f.run(), /SkillInputNotRegularFile/);
  await fs.unlink(entry);
  await fs.rename(entry + '.original', entry);
  await fs.mkdir(dirname(f.output), { recursive: true });
  const foreign = join(f.root, 'foreign');
  await fs.mkdir(foreign);
  await fs.symlink(foreign, f.output);
  await assert.rejects(f.run(), /SkillOutputNotDirectory/);
  assert.deepEqual(await fs.readdir(foreign), []);
  assert.ok((await fs.lstat(f.output)).isSymbolicLink());
});
test('unknown previous output files are preserved as a whole rather than recursively cleaned', async (t) => {
  const f = await fixture(t);
  await f.run();
  await fs.writeFile(join(f.output, 'user-notes.txt'), 'retain');
  const before = await f.snapshot();
  await f.replaceCLI();
  await assert.rejects(f.run(), /UnknownSkillOutputFiles/);
  assert.deepEqual(await f.snapshot(), before);
});
test('previous symlink leaf is rejected without touching its target', async (t) => {
  const f = await fixture(t);
  await f.run();
  const source = join(f.root, 'original-license');
  await fs.writeFile(source, 'retain');
  await fs.unlink(join(f.output, 'LICENSE'));
  await fs.symlink(source, join(f.output, 'LICENSE'));
  await assert.rejects(f.run(), /SkillInputNotRegularFile/);
  assert.equal(await fs.readFile(source, 'utf8'), 'retain');
  assert.ok((await fs.lstat(join(f.output, 'LICENSE'))).isSymbolicLink());
});
test('validated replacement publishes new bytes and removes only its own known backup', async (t) => {
  const f = await fixture(t);
  await f.run();
  const before = await f.snapshot();
  await f.replaceCLI();
  const result = await f.run();
  assert.equal(result.replaced, true);
  assert.notDeepEqual(await f.snapshot(), before);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(await fs.readdir(dirname(f.output)), ['hwpjs']);
});
test('failed staged rename rolls back original output and cleans the owned stage', async (t) => {
  const f = await fixture(t);
  await f.run();
  const before = await f.snapshot();
  await f.replaceCLI();
  const injected = {
    ...fs,
    rename: async (from, to) => {
      if (from.includes('.hwpjs-skill-stage-') && to === f.output)
        throw Object.assign(Error('rename failed'), { code: 'EIO' });
      return fs.rename(from, to);
    },
  };
  await assert.rejects(f.run({ fs: injected }), { code: 'EIO' });
  assert.deepEqual(await f.snapshot(), before);
  assert.deepEqual(await fs.readdir(dirname(f.output)), ['hwpjs']);
});
test('rollback conflict preserves foreign destination and all old bytes in reported backup', async (t) => {
  const f = await fixture(t);
  await f.run();
  const before = await f.snapshot();
  await f.replaceCLI();
  const injected = {
    ...fs,
    rename: async (from, to) => {
      if (from.includes('.hwpjs-skill-stage-') && to === f.output) {
        await fs.mkdir(to);
        await fs.writeFile(join(to, 'foreign'), 'retain');
        throw Error('injected publish failure');
      }
      return fs.rename(from, to);
    },
  };
  let rejected;
  try {
    await f.run({ fs: injected });
    assert.fail('must reject');
  } catch (error) {
    rejected = error;
  }
  assert.ok(rejected.preservedBackup);
  assert.deepEqual(await f.snapshot(rejected.preservedBackup), before);
  assert.equal(await fs.readFile(join(f.output, 'foreign'), 'utf8'), 'retain');
});
test('late unknown file in retired backup is preserved and reported after successful publication', async (t) => {
  const f = await fixture(t);
  await f.run();
  const before = await f.snapshot();
  await f.replaceCLI();
  let backup;
  const injected = {
    ...fs,
    rename: async (from, to) => {
      if (from === f.output) backup = to;
      await fs.rename(from, to);
      if (from.includes('.hwpjs-skill-stage-') && to === f.output)
        await fs.writeFile(join(backup, 'foreign'), 'retain');
    },
  };
  const result = await f.run({ fs: injected });
  assert.equal(result.published, true);
  assert.equal(result.warnings[0].path, backup);
  const old = await f.snapshot(backup);
  assert.equal(old.foreign, Buffer.from('retain').toString('base64'));
  delete old.foreign;
  assert.deepEqual(old, before);
});
test('strict builder arguments and help do not require package artifacts', () => {
  assert.deepEqual(
    parseBuildArguments(['--package-dir=some path', '--out', 'zig-out/verification/x']),
    { packageDir: 'some path', out: 'zig-out/verification/x' },
  );
  for (const args of [['--unknown=x'], ['--out'], ['--out=a', '--out=b'], ['--package-dir=']])
    assert.throws(() => parseBuildArguments(args), /InvalidSkillBuildArgument/);
  const result = spawnSync(process.execPath, [resolve('tools/build-agent-skill.mjs'), '--help'], {
    encoding: 'utf8',
    timeout: 4000,
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--package-dir PATH/);
});
test('failed stage with an unexpected file preserves it and exposes the cleanup path', async (t) => {
  const f = await fixture(t);
  await f.run();
  const before = await f.snapshot();
  await f.replaceCLI();
  const injected = {
    ...fs,
    writeFile: async (path, ...args) => {
      if (path.includes('.hwpjs-skill-stage-') && path.endsWith('mcp.mjs')) {
        await fs.writeFile(join(dirname(path), 'foreign'), 'retain');
        throw Error('injected staging failure');
      }
      return fs.writeFile(path, ...args);
    },
  };
  let failure;
  try {
    await f.run({ fs: injected });
    assert.fail('must reject');
  } catch (error) {
    failure = error;
  }
  assert.equal(failure.message, 'injected staging failure');
  const warning = failure.cleanupWarnings[0];
  assert.equal(warning.error, 'UnknownSkillCleanupFiles');
  assert.equal(await fs.readFile(join(warning.path, 'foreign'), 'utf8'), 'retain');
  assert.deepEqual(await f.snapshot(), before);
});

test('unified npm launcher is verified while Skill reuses standalone CLI and MCP', async (t) => {
  const f = await fixture(t);
  const launcher = Buffer.from('#!/usr/bin/env node\n// dispatcher\n');
  f.packageManifest.bin.hwpjs = './dist/hwpjs.mjs';
  f.build.files['hwpjs.mjs'] = hash(launcher);
  await fs.writeFile(join(f.pkg, 'dist/hwpjs.mjs'), launcher);
  await f.save();
  await f.run();
  assert.deepEqual(await fs.readdir(f.output).then((entries) => entries.sort()), names);
  const before = await f.snapshot();
  await fs.writeFile(join(f.pkg, 'dist/hwpjs.mjs'), 'changed');
  await assert.rejects(f.run(), /CanonicalSkillDigestMismatch:hwpjs.mjs/);
  assert.deepEqual(await f.snapshot(), before);
});
