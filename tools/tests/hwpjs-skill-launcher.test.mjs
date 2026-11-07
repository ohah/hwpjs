import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const root = resolve('zig-out/verification/cli-mcp-skill-r1/skill/.tmp');
async function fixture(t) {
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(join(root, 'launcher-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const skill = join(dir, 'skill # space'),
    assets = join(skill, 'assets/hwpjs'),
    launcher = join(skill, 'scripts/hwpjs.mjs'),
    cwd = join(dir, 'foreign');
  await fs.mkdir(assets, { recursive: true });
  await fs.mkdir(join(skill, 'scripts'));
  await fs.mkdir(cwd);
  await fs.copyFile('skills/hwpjs/scripts/hwpjs.mjs', launcher);
  const script = `process.stdout.write(JSON.stringify({entry:import.meta.url,argv:process.argv.slice(2),cwd:process.cwd(),exec:process.execPath}));`;
  const values = {
    'cli.mjs': script,
    'mcp.mjs': script,
    'hwpjs.wasm': Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]),
    LICENSE: 'license',
    'THIRD_PARTY_NOTICES.md': 'notices',
  };
  const manifest = {
    schemaVersion: 1,
    namespace: '@ohah/hwpjs',
    runtime: 'node>=24.20.0',
    files: {},
  };
  for (const [name, value] of Object.entries(values)) {
    const bytes = Buffer.from(value);
    await fs.writeFile(join(assets, name), bytes);
    manifest.files[name] = { sha256: hash(bytes), bytes: bytes.length };
  }
  const save = () => fs.writeFile(join(assets, 'manifest.json'), JSON.stringify(manifest));
  await save();
  const write = async (name, value) => {
    const bytes = Buffer.from(value);
    await fs.writeFile(join(assets, name), bytes);
    manifest.files[name] = { sha256: hash(bytes), bytes: bytes.length };
    await save();
  };
  const run = (args = [], options = {}) =>
    spawnSync(process.execPath, [launcher, ...args], {
      cwd,
      encoding: 'utf8',
      timeout: 4000,
      maxBuffer: 1024 * 1024,
      ...options,
    });
  return { dir, skill, assets, launcher, cwd, manifest, save, write, run };
}
test('skill launcher validates local assets and preserves argv, current cwd and Node path without shell', async (t) => {
  const f = await fixture(t),
    args = ['read', '$(touch injected.hwp)', 'a; echo bad', '--wasm', '../explicit.wasm', ''];
  const result = f.run(args);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const observed = JSON.parse(result.stdout);
  assert.deepEqual(observed.argv, args);
  assert.equal(observed.cwd, f.cwd);
  assert.equal(observed.exec, process.execPath);
  assert.equal(observed.entry, pathToFileURL(join(f.assets, 'cli.mjs')).href);
  assert.deepEqual(await fs.readdir(f.cwd), []);
});
test('mcp routes only the leading token and preserves stdio protocol bytes with no launcher banner', async (t) => {
  const f = await fixture(t);
  await f.write(
    'mcp.mjs',
    `let text='';for await(const chunk of process.stdin)text+=chunk;process.stdout.write(text);`,
  );
  const payload = '{"jsonrpc":"2.0","id":1,"method":"initialize"}\n';
  const result = f.run(['mcp'], { input: payload });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, payload);
  assert.equal(result.stderr, '');
  await f.write('mcp.mjs', `process.stdout.write(JSON.stringify(process.argv.slice(2)));`);
  assert.deepEqual(JSON.parse(f.run(['mcp', '--wasm', '../runtime.wasm', 'mcp']).stdout), [
    '--wasm',
    '../runtime.wasm',
    'mcp',
  ]);
  assert.deepEqual(JSON.parse(f.run(['read', 'mcp']).stdout).argv, ['read', 'mcp']);
});
test('installation through a skill-directory symlink keeps the adjacent asset root', async (t) => {
  const f = await fixture(t),
    alias = join(f.dir, 'installed-link');
  await fs.symlink(f.skill, alias);
  const result = spawnSync(
    process.execPath,
    [join(alias, 'scripts/hwpjs.mjs'), 'read', 'file.hwpx'],
    { cwd: f.cwd, encoding: 'utf8', timeout: 4000 },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).entry, pathToFileURL(join(f.assets, 'cli.mjs')).href);
});
test('entry and WASM tampering or false byte sizes fail before child execution', async (t) => {
  for (const name of ['cli.mjs', 'mcp.mjs', 'hwpjs.wasm']) {
    const f = await fixture(t);
    await fs.appendFile(join(f.assets, name), 'tampered');
    const r = f.run(name === 'mcp.mjs' ? ['mcp'] : ['read']);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /SkillAssetIntegrityMismatch/);
  }
  const f = await fixture(t);
  f.manifest.files['cli.mjs'].bytes++;
  await f.save();
  assert.match(f.run().stderr, /SkillAssetIntegrityMismatch/);
});
test('bad schema, path keys and malformed descriptor types are rejected', async (t) => {
  for (const change of [
    (m) => {
      m.schemaVersion = 2;
    },
    (m) => {
      m.namespace = 'other';
    },
    (m) => {
      m.runtime = 'node>=18';
    },
    (m) => {
      m.files['../cli.mjs'] = m.files['cli.mjs'];
    },
    (m) => {
      delete m.files.LICENSE;
    },
    (m) => {
      m.files['cli.mjs'].bytes = '1';
    },
    (m) => {
      m.files['cli.mjs'].sha256 = '0'.repeat(63);
    },
    (m) => {
      m.files['cli.mjs'].path = '../foreign.mjs';
    },
    (m) => {
      m.files['cli.mjs'] = null;
    },
  ]) {
    const f = await fixture(t);
    change(f.manifest);
    await f.save();
    const result = f.run();
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /InvalidSkillManifest/);
  }
});
test('32MiB manifest caps reject oversized entries and WASM before allocating payload', async (t) => {
  for (const name of ['cli.mjs', 'mcp.mjs', 'hwpjs.wasm']) {
    const f = await fixture(t);
    f.manifest.files[name].bytes = 32 * 1024 * 1024 + 1;
    await f.save();
    const result = f.run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /InvalidSkillAssetSize/);
  }
  const f = await fixture(t);
  await fs.truncate(join(f.assets, 'hwpjs.wasm'), 32 * 1024 * 1024 + 1);
  assert.match(f.run().stderr, /InvalidSkillAssetSize/);
});
test('missing or malformed manifest and missing local runtime fail without bootstrap', async (t) => {
  for (const name of ['manifest.json', 'cli.mjs', 'hwpjs.wasm']) {
    const f = await fixture(t);
    await fs.unlink(join(f.assets, name));
    const result = f.run(['--help']);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /error: ENOENT/);
  }
  const f = await fixture(t);
  await fs.writeFile(join(f.assets, 'manifest.json'), 'not json');
  assert.equal(f.run().status, 1);
});
test('exit code and termination signal from the selected entry are propagated', async (t) => {
  const f = await fixture(t);
  await f.write('cli.mjs', 'process.exitCode=7;');
  assert.equal(f.run().status, 7);
  await f.write('cli.mjs', `process.kill(process.pid,'SIGTERM');`);
  assert.equal(f.run().status, 143);
});
test('Node below documented minimum refuses before dispatch', async (t) => {
  const f = await fixture(t);
  const code = `Object.defineProperty(process.versions,'node',{value:'24.19.9'});await import(${JSON.stringify(pathToFileURL(f.launcher).href)});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: f.cwd,
    encoding: 'utf8',
    timeout: 4000,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Node24.20.0OrLaterRequired/);
});
