import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { inspect, records } from '../../../tests/hwp5/style-preservation/text-record-oracle.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const required = (key) => {
  const value = process.env[key];
  assert.ok(value && isAbsolute(value) && !/hwpers|title-column-roundtrip/i.test(value), key);
  return value;
};
const pkg = required('HWPJS_EXTENDED_E2E_PACKAGE');
const evidence = required('HWPJS_EXTENDED_E2E_EVIDENCE');
const cli = join(pkg, 'dist/cli.mjs'),
  mcp = join(pkg, 'dist/mcp.mjs');
assert.equal(process.version, 'v24.20.0');
assert.equal(
  hash(readFileSync(join(pkg, 'dist/hwpjs.wasm'))),
  '82031994b4b7f066c28c725495954eebc67bb25570869c06528ea328e0155ccc',
);
mkdirSync(evidence, { recursive: true });
const ledger = [];
function invoke(label, args, expected = 0) {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  const result = spawnSync(process.execPath, ['--max-old-space-size=512', cli, ...args], {
    cwd: evidence,
    env,
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 4 * 1024 * 1024,
  });
  writeFileSync(join(evidence, label + '.stdout'), result.stdout ?? '', { flag: 'wx' });
  writeFileSync(join(evidence, label + '.stderr'), result.stderr ?? '', { flag: 'wx' });
  ledger.push({
    label,
    args,
    exit: result.status,
    signal: result.signal,
    error: result.error?.message ?? null,
  });
  assert.equal(result.error, undefined, label);
  assert.equal(result.signal, null, label);
  assert.equal(result.status, expected, label + ': ' + result.stderr);
  return result;
}
const documentSha = (name) => hash(readFileSync(join(evidence, name)));
const content = (result) =>
  result.content
    .map((block) => {
      assert.equal(block.type, 'text');
      return block.text;
    })
    .join('');
function xmlText(name) {
  const source =
    'import sys,zipfile,xml.etree.ElementTree as E\nz=zipfile.ZipFile(sys.argv[1])\nprint("".join(n.text or "" for n in E.fromstring(z.read("Contents/section0.xml")).iter() if n.tag.split("}")[-1]=="t"))';
  const result = spawnSync('python3', ['-c', source, join(evidence, name)], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trimEnd();
}

test(
  'installed JS CLI creates, queries, edits and converts through the shared Native engine',
  { timeout: 60000 },
  () => {
    writeFileSync(join(evidence, 'initial.txt'), 'Alpha\n\uD55C\uAE00\n', { flag: 'wx' });
    invoke('create-hwpx', [
      'create',
      '--format=hwpx',
      '--output=initial.hwpx',
      '--text-file=initial.txt',
    ]);
    assert.equal(xmlText('initial.hwpx'), 'Alpha\uD55C\uAE00');
    const before = documentSha('initial.hwpx');
    const detail = invoke('paragraph-hwpx', ['paragraph', 'initial.hwpx', '--target=s0:p1']);
    assert.match(detail.stdout, /expectedText \(JSON ASCII\):\n"Alpha"/);
    const operations = [
      {
        kind: 'splice',
        coordinates: 'current-transaction',
        section: 0,
        paragraph: 1,
        startUnit: 0,
        endUnit: 5,
        expectedRangeText: 'Alpha',
        text: 'Beta',
      },
    ];
    invoke('apply-hwpx', [
      'apply',
      'initial.hwpx',
      '--operations=' + JSON.stringify(operations),
      '--expect-sha256=' + before,
      '--output=edited.hwpx',
    ]);
    assert.equal(xmlText('edited.hwpx'), 'Beta\uD55C\uAE00');
    assert.equal(documentSha('initial.hwpx'), before);
    invoke(
      'sha-refuse',
      [
        'apply',
        'initial.hwpx',
        '--operations=' + JSON.stringify(operations),
        '--expect-sha256=' + '0'.repeat(64),
        '--output=bad.hwpx',
      ],
      1,
    );
    const reject = invoke(
      'convert-default-refuse',
      ['convert', 'edited.hwpx', '--to=hwp5', '--output=rejected.hwp'],
      1,
    );
    assert.match(reject.stderr, /UnsupportedDocumentConversion/);
    const converted = invoke('convert-hwp5', [
      'convert',
      'edited.hwpx',
      '--to=hwp5',
      '--output=converted.hwp',
      '--loss-policy=text-only',
      '--allow-stale-layout',
    ]);
    assert.match(converted.stdout, /lossless: false/);
    const decoded = inspect(readFileSync(join(evidence, 'converted.hwp')));
    const nativeText = decoded.sections
      .flatMap((section) => records(section.bytes))
      .filter((row) => row.tag === 67)
      .map((row) => row.payload.toString('utf16le'))
      .join('\n');
    assert.match(nativeText, /Beta/);
    assert.match(nativeText, /\uD55C\uAE00/);
    invoke('convert-hwpx', [
      'convert',
      'converted.hwp',
      '--to=hwpx',
      '--output=roundtrip.hwpx',
      '--loss-policy=text-only',
    ]);
    assert.equal(xmlText('roundtrip.hwpx'), 'Beta\uD55C\uAE00');
    const read = invoke('read-roundtrip', ['read', 'roundtrip.hwpx', '--format=markdown']);
    assert.match(read.stdout, /Beta/);
    assert.match(read.stdout, /\uD55C\uAE00/);
    invoke('create-hwp5', ['create', '--format=hwp5', '--output=blank.hwp']);
    assert.ok(inspect(readFileSync(join(evidence, 'blank.hwp'))).streams.has('FileHeader'));
    invoke('create-overwrite-refuse', ['create', '--format=hwpx', '--output=initial.hwpx'], 1);
    assert.equal(documentSha('initial.hwpx'), before);
  },
);

test(
  'installed JS MCP publishes twelve real tools and executes new edit services over stdio',
  { timeout: 60000 },
  async () => {
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    delete env.NODE_PATH;
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--max-old-space-size=512', mcp],
      cwd: evidence,
      env,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'hwpjs-installed-typescript-e2e', version: '1.0.0' });
    const output = [];
    transport.stderr?.on('data', (chunk) => output.push(String(chunk)));
    try {
      await client.connect(transport);
      const list = await client.listTools();
      assert.equal(list.tools.length, 12);
      const call = async (name, args, expectedError = false) => {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(Boolean(result.isError), expectedError, name + ': ' + content(result));
        ledger.push({ tool: name, isError: Boolean(result.isError) });
        return content(result);
      };
      await call('create_document', { outputPath: 'mcp.hwpx', format: 'hwpx', text: 'MCP' });
      assert.equal(xmlText('mcp.hwpx'), 'MCP');
      const detail = await call('get_document_paragraph', {
        inputPath: 'mcp.hwpx',
        target: 's0:p1',
      });
      assert.match(detail, /"MCP"/);
      await call('apply_document_changes', {
        inputPath: 'mcp.hwpx',
        outputPath: 'mcp-edited.hwpx',
        expectedSha256: documentSha('mcp.hwpx'),
        operations: [
          {
            kind: 'splice',
            coordinates: 'current-transaction',
            section: 0,
            paragraph: 1,
            startUnit: 0,
            endUnit: 3,
            expectedRangeText: 'MCP',
            text: 'Edited',
          },
        ],
      });
      assert.equal(xmlText('mcp-edited.hwpx'), 'Edited');
      const read = await call('read_document', {
        inputPath: 'mcp-edited.hwpx',
        format: 'markdown',
      });
      assert.match(read, /Edited/);
      await call('convert_document', {
        inputPath: 'mcp-edited.hwpx',
        outputPath: 'mcp-converted.hwp',
        to: 'hwp5',
        lossPolicy: 'text-only',
        allowStaleLayout: true,
      });
      await call(
        'ocr_document',
        { inputPath: 'mcp.hwpx', executable: join(evidence, 'missing-tesseract') },
        true,
      );
      await call('create_document', { outputPath: 'mcp.hwpx', format: 'hwpx' }, true);
      assert.equal(xmlText('mcp.hwpx'), 'MCP');
    } finally {
      await client.close();
      writeFileSync(join(evidence, 'mcp-stderr.log'), output.join(''), { flag: 'wx' });
      writeFileSync(
        join(evidence, 'invocations.json'),
        JSON.stringify(
          { cliSha256: hash(readFileSync(cli)), mcpSha256: hash(readFileSync(mcp)), ledger },
          null,
          2,
        ) + '\n',
        { flag: 'wx' },
      );
    }
  },
);
