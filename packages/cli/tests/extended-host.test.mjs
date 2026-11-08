import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runCLI } from '../src/main.ts';
import { parseArguments } from '../src/arguments.ts';
import { createFiles } from '../src/files.ts';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourceSha = sha('source');
async function setup(t) {
  const directory = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'hwpjs-cli-extended-')));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(join(directory, 'input.hwp'), 'source');
  await fs.writeFile(join(directory, 'native.wasm'), 'wasm');
  const stdout = [],
    stderr = [],
    calls = [];
  const files = createFiles({ cwd: () => directory });
  const dependencies = {
    files,
    io: {
      stdout: { write: (text) => stdout.push(text) },
      stderr: { write: (text) => stderr.push(text) },
    },
  };
  const invoke = (...argv) => runCLI([...argv, '--wasm=native.wasm'], dependencies);
  return { directory, stdout, stderr, calls, dependencies, invoke };
}
const createResult = () => ({
  schemaVersion: 1,
  format: 'hwpx',
  bytes: Uint8Array.of(1, 2),
  layoutRequiresReflow: false,
  paragraphCount: 1,
});
const splice = {
  kind: 'splice',
  coordinates: 'current-transaction',
  section: 0,
  paragraph: 0,
  startUnit: 0,
  endUnit: 1,
  expectedRangeText: 'a',
  text: 'b',
};
const applyArgs = (...more) => [
  'apply',
  'input.hwp',
  `--expect-sha256=${sourceSha}`,
  '--output=edited.hwp',
  ...more,
];

test('new command parsing requires explicit loss policy, provider and current source admission', () => {
  assert.equal(
    parseArguments(['convert', 'in.hwp', '--to=hwpx', '--output=out.hwpx']).lossPolicy,
    'reject',
  );
  assert.equal(parseArguments(['ocr', 'in.hwp']).provider, 'tesseract');
  for (const args of [
    ['create', 'in.hwp', '--format=hwpx', '--output=out.hwpx'],
    ['apply', 'in.hwp', '--operations=[]', '--output=out.hwp'],
    [
      'apply',
      'in.hwp',
      '--patch=p',
      '--operations=[]',
      `--expect-sha256=${sourceSha}`,
      '--output=o.hwp',
    ],
    ['ocr', 'in.hwp', '--provider=vision', '--executable=x'],
    ['ocr', 'in.hwp', '--languages=eng+eng'],
    ['paragraph', 'in.hwp', '--target=s00:p3'],
  ])
    assert.throws(() => parseArguments(args));
});

test('create publishes new bytes without requiring or modifying a source document', async (t) => {
  const f = await setup(t);
  f.dependencies.createDocument = async (args) => {
    f.calls.push(args);
    return createResult();
  };
  assert.equal(await f.invoke('create', '--format=hwpx', '--output=new.hwpx'), 0);
  assert.equal(f.calls[0].text, '');
  assert.deepEqual([...(await fs.readFile(join(f.directory, 'new.hwpx')))], [1, 2]);
  assert.equal(await fs.readFile(join(f.directory, 'input.hwp'), 'utf8'), 'source');
  assert.match(f.stdout.join(''), /paragraphCount: 1/);
  assert.equal(await f.invoke('create', '--format=hwpx', '--output=new.hwpx'), 1);
  assert.equal(f.calls.length, 1);
});

test('create UTF8 text and MCP text share one service, conflicting sources are rejected', async (t) => {
  const f = await setup(t);
  await fs.writeFile(join(f.directory, 'text.txt'), 'A\n\uD55C\uAE00\n');
  f.dependencies.createDocument = async (args) => {
    f.calls.push(args);
    return createResult();
  };
  assert.equal(
    await f.invoke('create', '--format=hwpx', '--output=new.hwpx', '--text-file=text.txt'),
    0,
  );
  assert.equal(f.calls[0].text, 'A\n\uD55C\uAE00\n');
  f.dependencies.creationText = 'MCP';
  assert.equal(await f.invoke('create', '--format=hwpx', '--output=mcp.hwpx'), 0);
  assert.equal(f.calls[1].text, 'MCP');
  assert.equal(
    await f.invoke('create', '--format=hwpx', '--output=bad.hwpx', '--text-file=text.txt'),
    1,
  );
  await assert.rejects(fs.stat(join(f.directory, 'bad.hwpx')), { code: 'ENOENT' });
});

test('invalid format and malformed service output never publish a file', async (t) => {
  const f = await setup(t);
  f.dependencies.createDocument = async () => {
    f.calls.push(1);
    return createResult();
  };
  assert.equal(await f.invoke('create', '--format=hwpx', '--output=bad.hwp'), 1);
  assert.equal(f.calls.length, 0);
  f.dependencies.createDocument = async () => ({ ...createResult(), paragraphCount: -1 });
  assert.equal(await f.invoke('create', '--format=hwpx', '--output=bad.hwpx'), 1);
  await assert.rejects(fs.stat(join(f.directory, 'bad.hwpx')), { code: 'ENOENT' });
});

test('apply validates full patch and source hash before opening a mutation session', async (t) => {
  const f = await setup(t);
  let validates = 0;
  f.dependencies.operationService = {
    validateDocumentOperations: (value) => {
      validates++;
      assert.deepEqual(value, [splice]);
      return value;
    },
    applyDocumentOperations: async (options) => {
      f.calls.push(options);
      return {
        format: 'hwp5',
        bytes: Uint8Array.of(9),
        layoutRequiresReflow: true,
        sourceSha256: sourceSha,
        appliedOperations: 1,
        changed: true,
        operationResults: [],
      };
    },
  };
  await fs.writeFile(
    join(f.directory, 'patch.json'),
    JSON.stringify({ version: 1, operations: [splice] }),
  );
  assert.equal(await f.invoke(...applyArgs('--patch=patch.json', '--allow-stale-layout')), 0);
  assert.equal(validates, 1);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].allowStaleLayout, true);
  assert.deepEqual([...(await fs.readFile(join(f.directory, 'edited.hwp')))], [9]);
  assert.equal(
    await f.invoke(
      ...applyArgs('--operations=[]').map((v) =>
        v.startsWith('--expect-sha256=') ? '--expect-sha256=' + '0'.repeat(64) : v,
      ),
    ),
    1,
  );
  assert.equal(validates, 1);
});

test('bad JSON wrappers and Native operation errors preserve source and do not publish', async (t) => {
  const f = await setup(t);
  f.dependencies.operationService = {
    validateDocumentOperations: (value) => value,
    applyDocumentOperations: async () => {
      throw Error('NativeRejected');
    },
  };
  await fs.writeFile(
    join(f.directory, 'patch.json'),
    JSON.stringify({ version: 1, operations: [splice], extra: true }),
  );
  assert.equal(await f.invoke(...applyArgs('--patch=patch.json')), 1);
  assert.match(f.stderr.join(''), /InvalidOperationPatch/);
  assert.equal(await f.invoke(...applyArgs('--operations=' + JSON.stringify([splice]))), 1);
  assert.match(f.stderr.join(''), /NativeRejected/);
  await assert.rejects(fs.stat(join(f.directory, 'edited.hwp')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(join(f.directory, 'input.hwp'), 'utf8'), 'source');
});

test('apply captures result scalars once before publication and preserves created identities', async (t) => {
  const f = await setup(t);
  let changedReads = 0;
  f.dependencies.operationService = {
    validateDocumentOperations: (value) => value,
    applyDocumentOperations: async () => ({
      format: 'hwp5',
      bytes: Uint8Array.of(9),
      layoutRequiresReflow: false,
      sourceSha256: sourceSha,
      appliedOperations: 1,
      get changed() {
        changedReads++;
        return changedReads === 1;
      },
      operationResults: [{ operation: 0, kind: 'table-insert', identity: '123' }],
    }),
  };
  assert.equal(await f.invoke(...applyArgs('--operations=' + JSON.stringify([splice]))), 0);
  assert.equal(changedReads, 1);
  assert.match(f.stdout.join(''), /changed: true/);
  assert.match(f.stdout.join(''), /identity: 123/);
});

test('conversion rejects unsupported fidelity with report; lossy success is explicit', async (t) => {
  const f = await setup(t);
  f.dependencies.convertDocument = async (options) => {
    f.calls.push(options);
    if (options.lossPolicy === 'reject')
      throw Object.assign(Error('UnsupportedDocumentConversion'), {
        code: 'UnsupportedDocumentConversion',
        report: { missing: ['tables'] },
      });
    return {
      ...createResult(),
      sourceSha256: sourceSha,
      lossPolicy: 'text-only',
      lossless: false,
      report: { omitted: ['tables'] },
    };
  };
  assert.equal(await f.invoke('convert', 'input.hwp', '--to=hwpx', '--output=out.hwpx'), 1);
  assert.match(f.stderr.join(''), /conversion\.missing\.0: tables/);
  await assert.rejects(fs.stat(join(f.directory, 'out.hwpx')), { code: 'ENOENT' });
  assert.equal(
    await f.invoke(
      'convert',
      'input.hwp',
      '--to=hwpx',
      '--output=out.hwpx',
      '--loss-policy=text-only',
    ),
    0,
  );
  assert.match(f.stdout.join(''), /lossless: false/);
});

test('OCR partial results keep successful text, return failure and never publish documents', async (t) => {
  const f = await setup(t);
  f.dependencies.ocrDocument = async () => ({
    schemaVersion: 1,
    format: 'hwp5',
    sourceSha256: sourceSha,
    status: 'partial',
    text: 'RECOGNIZED\n',
  });
  assert.equal(await f.invoke('ocr', 'input.hwp'), 1);
  assert.equal(f.stdout.join(''), 'RECOGNIZED\n');
  assert.match(f.stderr.join(''), /IncompleteDocumentOCR/);
  assert.deepEqual((await fs.readdir(f.directory)).sort(), ['input.hwp', 'native.wasm']);
});

test('paragraph query requires observed target match and preserves native escaped text', async (t) => {
  const f = await setup(t);
  f.dependencies.inspectDocumentParagraph = async (options) => ({
    schemaVersion: 1,
    format: 'hwp5',
    sourceSha256: sourceSha,
    target: options.target,
    text: 'expectedText: "A\\r"\n',
  });
  assert.equal(await f.invoke('paragraph', 'input.hwp', '--target=s0:p3'), 0);
  assert.equal(f.stdout.join(''), 'expectedText: "A\\r"\n');
  f.dependencies.inspectDocumentParagraph = async () => ({
    schemaVersion: 1,
    format: 'hwp5',
    sourceSha256: sourceSha,
    target: { section: 0, paragraph: 4 },
    text: 'wrong',
  });
  assert.equal(await f.invoke('paragraph', 'input.hwp', '--target=s0:p3'), 1);
});

test('publication followed by stream error reports the already committed file truthfully', async (t) => {
  const f = await setup(t);
  f.dependencies.createDocument = async () => createResult();
  f.dependencies.io.stdout.write = () => {
    throw Error('PipeClosed');
  };
  assert.equal(await f.invoke('create', '--format=hwpx', '--output=new.hwpx'), 1);
  assert.match(f.stderr.join(''), /published: true/);
  assert.match(f.stderr.join(''), /output: .*new.hwpx/);
  assert.deepEqual([...(await fs.readFile(join(f.directory, 'new.hwpx')))], [1, 2]);
});
