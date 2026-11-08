import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourcePath = join(root, 'packages/hwpjs/src/cli.ts');
const builderPath = join(root, 'tools/build-public-package.mjs');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Execute the standard builder's selected blocks, without its SDK/Native build graph.
function block(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, end);
  return source.slice(from, to);
}

test('public launcher builds from observed source and dispatches in the same Node process', async (t) => {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'hwpjs-public-cli-')));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const dist = join(temporary, 'package with spaces'),
    cwd = join(temporary, 'consumer cwd');
  await mkdir(dist);
  await mkdir(cwd);
  const builder = await readFile(builderPath, 'utf8');
  const buildScript = join(temporary, 'build.mjs');
  await writeFile(
    buildScript,
    `import assert from 'node:assert/strict';
import { readFile, chmod } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { isProductionSource } from ${JSON.stringify(new URL('../../packages/hwpjs/build/source-policy.mjs', import.meta.url).href)};
const root = ${JSON.stringify(root)}, pkg = join(root, 'packages/hwpjs'), dist = ${JSON.stringify(dist)};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
${block(builder, 'const observed = new Map();', 'const { compile }')}
await observe(${JSON.stringify(builderPath)}, 'build-metadata-license');
${block(builder, 'const launcher = await Bun.build({', 'const bundledNotices =')}
${block(builder, 'const before = Object.fromEntries(', 'await writeFile(')}
console.log(JSON.stringify({ before, inputs: [...observed].map(([path, info]) => ({ path, categories: [...info.categories] })), fingerprint: sha(JSON.stringify(before)) }));
`,
  );
  const built = spawnSync(process.env.BUN ?? 'bun', [buildScript], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.ifError(built.error);
  assert.equal(built.status, 0, built.stdout + built.stderr);
  const manifest = JSON.parse(built.stdout);
  assert.equal(manifest.before['packages/hwpjs/src/cli.ts'], sha(await readFile(sourcePath)));
  assert.equal(manifest.before['tools/build-public-package.mjs'], sha(await readFile(builderPath)));
  assert.deepEqual(
    manifest.inputs.find((input) => input.path === 'packages/hwpjs/src/cli.ts').categories,
    ['runtime-module'],
  );
  assert.equal(manifest.fingerprint, sha(JSON.stringify(manifest.before)));
  assert.equal(Object.keys(manifest.before).length, 2);
  const entry = join(dist, 'hwpjs.mjs');
  assert.match(await readFile(entry, 'utf8'), /^#!\/usr\/bin\/env node\n/);
  assert.equal((await stat(entry)).mode & 0o777, 0o755);

  // These siblings do not exist until after the build: the launcher cannot bundle them.
  for (const mode of ['cli', 'mcp']) {
    await writeFile(
      join(dist, `${mode}.mjs`),
      `const mode = ${JSON.stringify(mode)};
process.stderr.write(JSON.stringify({mode, argv: process.argv, cwd: process.cwd(), pid: process.pid}) + '\\n');
const args = process.argv.slice(2);
if (args.includes('--invalid')) {
  process.stderr.write('invalid argument\\n');
  process.exitCode = 23;
} else if (args.includes('--exit')) {
  process.exit(17);
} else if (args.includes('--wire')) {
  for await (const chunk of process.stdin) process.stdout.write(chunk);
} else if (args.includes('--help')) {
  process.stdout.write(mode + ' original help\\n');
} else {
  process.stdout.write(mode + ' output\\n');
}
`,
    );
  }

  const cases = [
    { name: 'no args', args: [], mode: 'cli' },
    { name: 'CLI help', args: ['--help'], mode: 'cli', output: 'cli original help\n' },
    { name: 'MCP no args', args: ['mcp'], mode: 'mcp', forwarded: [] },
    {
      name: 'MCP help',
      args: ['mcp', '--help'],
      mode: 'mcp',
      forwarded: ['--help'],
      output: 'mcp original help\n',
    },
    {
      name: 'CLI arguments',
      args: ['read', './한글 file.hwpx', '--format', 'json', 'mcp'],
      mode: 'cli',
    },
    { name: 'exact subcommand only', args: ['MCP', '--flag=value'], mode: 'cli' },
    {
      name: 'MCP arguments',
      args: ['mcp', '--path', './한글 file.hwp', 'mcp', '--', '-x'],
      mode: 'mcp',
      forwarded: ['--path', './한글 file.hwp', 'mcp', '--', '-x'],
    },
    {
      name: 'CLI invalid argument',
      args: ['--invalid'],
      mode: 'cli',
      status: 23,
      output: '',
      diagnostic: 'invalid argument\n',
    },
    {
      name: 'MCP invalid argument',
      args: ['mcp', '--invalid'],
      mode: 'mcp',
      forwarded: ['--invalid'],
      status: 23,
      output: '',
      diagnostic: 'invalid argument\n',
    },
    { name: 'CLI explicit exit', args: ['--exit'], mode: 'cli', status: 17, output: '' },
    {
      name: 'MCP explicit exit',
      args: ['mcp', '--exit'],
      mode: 'mcp',
      forwarded: ['--exit'],
      status: 17,
      output: '',
    },
    {
      name: 'MCP wire stdout',
      args: ['mcp', '--wire'],
      mode: 'mcp',
      forwarded: ['--wire'],
      input: '{"jsonrpc":"2.0","id":1}\n\n한글\n',
      output: '{"jsonrpc":"2.0","id":1}\n\n한글\n',
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const result = spawnSync(process.execPath, [entry, ...scenario.args], {
        cwd,
        encoding: 'utf8',
        input: scenario.input,
        timeout: 10_000,
      });
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      assert.equal(result.status, scenario.status ?? 0, result.stderr);
      const newline = result.stderr.indexOf('\n');
      const record = JSON.parse(result.stderr.slice(0, newline));
      assert.deepEqual(record, {
        mode: scenario.mode,
        argv: [process.execPath, entry, ...(scenario.forwarded ?? scenario.args)],
        cwd,
        pid: result.pid,
      });
      assert.equal(result.stderr.slice(newline + 1), scenario.diagnostic ?? '');
      assert.equal(result.stdout, scenario.output ?? `${scenario.mode} output\n`);
    });
  }
});
