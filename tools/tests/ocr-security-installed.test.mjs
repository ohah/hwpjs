import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(new URL('../../packages/cli/package.json', import.meta.url));
const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/client')));
const { StdioClientTransport } = await import(
  pathToFileURL(require.resolve('@modelcontextprotocol/client/stdio'))
);

const required = (key) => {
  const value = process.env[key];
  assert(value && isAbsolute(value) && !/hwpers|title-column-roundtrip/i.test(value), key);
  return value;
};
const pkg = required('HWPJS_OCR_SECURITY_PACKAGE');
const evidence = required('HWPJS_OCR_SECURITY_EVIDENCE');
const fixture = required('HWPJS_TEST_NOORI_HWPX');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(process.version, 'v24.20.0');
assert.notEqual(process.platform, 'win32', 'This shebang subprocess E2E covers POSIX hosts');
assert.equal(
  sha(readFileSync(fixture)),
  '6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab',
);
assert.equal(
  sha(readFileSync(join(pkg, 'dist/hwpjs.wasm'))),
  process.env.HWPJS_OCR_SECURITY_WASM_SHA256,
);
mkdirSync(evidence); // Preserve earlier cohorts; parent must exist.
const executable = join(evidence, 'owned-ocr.mjs');
const ledger = join(evidence, 'children.jsonl');
const cli = join(pkg, 'dist/hwpjs.mjs');
writeFileSync(
  executable,
  `#!${process.execPath}\n` +
    `
import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(ledger)}, JSON.stringify({
 pid:process.pid, args:process.argv.slice(2),
 secret:Object.hasOwn(process.env,'HWPJS_OCR_SECURITY_TEST_SECRET'),
 npmToken:Object.hasOwn(process.env,'NPM_OHAH_TOKEN'),
 nodeOptions:Object.hasOwn(process.env,'NODE_OPTIONS'),
 model:process.env.TESSDATA_PREFIX, threads:process.env.OMP_THREAD_LIMIT,
})+'\\n');
if(process.argv.includes('--list-langs')) process.stdout.write('kor\\neng\\n');
else {process.stdin.resume();process.stdin.once('end',()=>process.stdout.write('HWPJS_SECURITY_SYNTHETIC_OCR'));}
`,
  { mode: 0o700, flag: 'wx' },
);
const env = {
  ...process.env,
  HWPJS_OCR_SECURITY_TEST_SECRET: 'synthetic-not-real-secret',
  TESSDATA_PREFIX: '/synthetic-models',
  NODE_OPTIONS: '--no-warnings',
};
delete env.NODE_PATH;
const rows = () =>
  existsSync(ledger)
    ? readFileSync(ledger, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
const text = (result) =>
  result.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
function assertChildren() {
  const children = rows();
  assert(children.length > 1);
  for (const child of children) {
    assert.equal(child.secret, false);
    assert.equal(child.npmToken, false);
    assert.equal(child.nodeOptions, false);
    assert.equal(child.model, '/synthetic-models');
    assert.equal(child.threads, '1');
    assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
  }
  return children.length;
}

test('installed CLI retains operator OCR binary selection while stripping secrets', () => {
  const result = spawnSync(
    process.execPath,
    [cli, 'ocr', fixture, '--provider=tesseract', '--executable', executable],
    { env, encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 },
  );
  writeFileSync(join(evidence, 'cli.stdout'), result.stdout ?? '');
  writeFileSync(join(evidence, 'cli.stderr'), result.stderr ?? '');
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /HWPJS_SECURITY_SYNTHETIC_OCR/u);
  assertChildren();
});

test('installed stdio MCP rejects request binaries and uses only the operator startup setting', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, 'mcp', '--ocr-executable', executable],
    env,
    cwd: evidence,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'hwpjs-ocr-security', version: '1.0.0' });
  const stderr = [];
  transport.stderr?.on('data', (chunk) => stderr.push(String(chunk)));
  try {
    await client.connect(transport);
    const list = await client.listTools();
    assert.equal(list.tools.length, 20);
    const tool = list.tools.find((t) => t.name === 'ocr_document');
    assert(tool);
    assert.equal(Object.hasOwn(tool.inputSchema.properties, 'executable'), false);
    assert.equal(tool.annotations.readOnlyHint, false);
    const before = rows().length;
    const rejected = await client.callTool({
      name: 'ocr_document',
      arguments: { inputPath: fixture, executable },
    });
    assert.equal(rejected.isError, true);
    assert.match(text(rejected), /executable|Unrecognized/iu);
    assert.equal(rows().length, before);
    for (let i = 0; i < 2; i++) {
      const result = await client.callTool({
        name: 'ocr_document',
        arguments: { inputPath: fixture, provider: 'tesseract' },
      });
      assert.equal(Boolean(result.isError), false, text(result));
      assert.match(text(result), /HWPJS_SECURITY_SYNTHETIC_OCR/u);
    }
    assertChildren();
  } finally {
    await client.close();
    writeFileSync(join(evidence, 'mcp.stderr'), stderr.join(''));
  }
});
