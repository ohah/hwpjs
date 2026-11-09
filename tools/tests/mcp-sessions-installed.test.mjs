import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../packages/cli/package.json', import.meta.url));
const { Client } = await import(require.resolve('@modelcontextprotocol/client'));
const { StdioClientTransport } = await import(
  require.resolve('@modelcontextprotocol/client/stdio')
);
const required = (name) => {
  const value = process.env[name];
  assert(value && isAbsolute(value) && !/hwpers|title-column-roundtrip/i.test(value), name);
  return value;
};
const pkg = required('HWPJS_SESSION_TEST_PACKAGE');
const evidence = required('HWPJS_SESSION_TEST_EVIDENCE');
const fixtureHwp = required('HWPJS_TEST_NOORI');
const fixtureHwpx = required('HWPJS_TEST_NOORI_HWPX');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(
  sha(readFileSync(join(pkg, 'dist/hwpjs.wasm'))),
  process.env.HWPJS_SESSION_TEST_WASM_SHA256,
);
assert.equal(
  sha(readFileSync(fixtureHwp)),
  'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f',
);
assert.equal(
  sha(readFileSync(fixtureHwpx)),
  '6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab',
);
mkdirSync(evidence, { recursive: false });
const text = (reply) =>
  reply.content
    .map((item) => {
      assert.equal(item.type, 'text');
      return item.text;
    })
    .join('');
async function connect() {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(pkg, 'dist/hwpjs.mjs'), 'mcp'],
    cwd: evidence,
    env,
    stderr: 'pipe',
  });
  const errors = [];
  transport.stderr?.on('data', (data) => errors.push(String(data)));
  const client = new Client({ name: 'session-installed-verifier', version: '1' });
  try {
    await client.connect(transport);
  } catch (error) {
    await transport.close();
    throw error;
  }
  return { client, transport, errors };
}
test(
  'installed MCP retains Noori snapshots across repeated reads and isolates client handles',
  { timeout: 60000 },
  async () => {
    const first = await connect();
    let second;
    const rows = [];
    const call = async (client, name, args, error = false) => {
      const reply = await client.callTool({ name, arguments: args });
      assert.equal(Boolean(reply.isError), error, name + ': ' + text(reply));
      return reply;
    };
    try {
      second = await connect();
      const names = new Set((await first.client.listTools()).tools.map((tool) => tool.name));
      assert.equal(names.size, 19);
      for (const name of [
        'open_document_session',
        'read_document_session',
        'close_document_session',
      ])
        assert(names.has(name));
      for (const inputPath of [fixtureHwp, fixtureHwpx]) {
        const snapshotPath = join(
          evidence,
          inputPath === fixtureHwp ? 'snapshot.hwp' : 'snapshot.hwpx',
        );
        writeFileSync(snapshotPath, readFileSync(inputPath), { flag: 'wx' });
        const opened = await call(first.client, 'open_document_session', {
          inputPath: snapshotPath,
        });
        const meta = opened.structuredContent ?? JSON.parse(text(opened));
        assert.equal(typeof meta.sessionId, 'string');
        assert.equal(meta.sourceSha256, sha(readFileSync(inputPath)));
        const repeated = [];
        for (const format of ['text', 'markdown'])
          for (const view of ['content', 'structure']) {
            const file = await call(first.client, 'read_document', { inputPath, format, view });
            const a = await call(first.client, 'read_document_session', {
              sessionId: meta.sessionId,
              format,
              view,
            });
            const b = await call(first.client, 'read_document_session', {
              sessionId: meta.sessionId,
              format,
              view,
            });
            assert.equal(text(a), text(file), format + '/' + view);
            assert.equal(text(b), text(a));
            assert.match(text(a), /누리/);
            repeated.push({
              format,
              view,
              bytes: Buffer.byteLength(text(a)),
              sha256: sha(Buffer.from(text(a))),
            });
          }
        // Change only this test's owned copy. The session must retain its opened
        // snapshot while a fresh file-based read sees the invalid replacement.
        writeFileSync(snapshotPath, 'changed after open');
        await call(first.client, 'read_document', { inputPath: snapshotPath }, true);
        const retained = await call(first.client, 'read_document_session', {
          sessionId: meta.sessionId,
        });
        const original = await call(first.client, 'read_document', { inputPath });
        assert.equal(text(retained), text(original));
        await call(second.client, 'read_document_session', { sessionId: meta.sessionId }, true);
        await call(
          first.client,
          'read_document_session',
          { sessionId: meta.sessionId, inputPath },
          true,
        );
        await call(first.client, 'close_document_session', { sessionId: meta.sessionId });
        await call(first.client, 'read_document_session', { sessionId: meta.sessionId }, true);
        await call(first.client, 'close_document_session', { sessionId: meta.sessionId }, true);
        rows.push({ inputPath, format: meta.format, sourceSha256: meta.sourceSha256, repeated });
      }
    } finally {
      await Promise.allSettled([first.client.close(), ...(second ? [second.client.close()] : [])]);
      writeFileSync(
        join(evidence, 'results.json'),
        JSON.stringify({ rows, stderr: [...first.errors, ...(second?.errors ?? [])] }, null, 2),
      );
    }
  },
);
