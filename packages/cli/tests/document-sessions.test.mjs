import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDocumentSessionManager,
  DOCUMENT_SESSION_LIMITS,
} from '../src/mcp/document-sessions.ts';
import { renderDocument } from '../src/render.ts';
import { renderReadResponse } from '../src/read-operation.ts';
import { buildObjectReference } from '../src/object-reference.ts';

const sha = 'a'.repeat(64);
const deferred = () => Promise.withResolvers();
const tick = () => new Promise((resolve) => setImmediate(resolve));
function model(format = 'hwp5') {
  const reference = (kind, node) =>
    buildObjectReference({ sourceSha256: sha, format, section: 0, kind, node });
  return {
    version: 1,
    format,
    sourceSha256: sha,
    sections: [
      {
        id: 'section',
        source: { section: 0 },
        header: { declarations: 'known', definitions: [], inheritance: { state: 'unresolved' } },
        footer: { declarations: 'known', definitions: [], inheritance: { state: 'unresolved' } },
        body: [
          {
            id: 'p',
            type: 'paragraph',
            displayText: '# 한글 *🙂* <x>\\',
            source: { section: 0, paragraph: format === 'hwpx' ? 1 : 0 },
            editability: 'unknown',
          },
          {
            id: 'i',
            type: 'image',
            reference: reference('image', 1),
            sourceInfo: { section: 0, pictureNode: 1 },
            altState: 'provided',
            alt: '그림 | <a>',
          },
          {
            id: 'o',
            type: 'unknown',
            kind: 'equation',
            reference: reference('equation', 2),
            source: { section: 0, node: 2 },
            diagnostic: { code: 'not-read', message: 'not-read' },
          },
        ],
      },
    ],
    unplaced: [],
    warnings: [],
    coverage: { inventoryComplete: true },
  };
}
export function harness(overrides = {}) {
  const counts = { open: 0, close: 0, observe: 0, files: 0 };
  const format = overrides.format ?? 'hwp5';
  const document = {
    format,
    sourceSha256: sha,
    sectionCount: 1,
    sdk: {},
    close() {
      counts.close++;
    },
  };
  const dependencies = {
    files: {
      resolveWasmPath: () => 'engine.wasm',
      async readInputSnapshot(path, options) {
        counts.files++;
        assert.equal(
          options.maxBytes,
          path === 'engine.wasm' ? 32 * 1024 * 1024 : 64 * 1024 * 1024,
        );
        return { bytes: Uint8Array.of(1), sha256: sha };
      },
    },
    async openDocument(input) {
      counts.open++;
      assert.equal(input.expectedSha256, sha);
      return document;
    },
    async readDocumentModel(input) {
      counts.observe++;
      assert.equal(input.sdk, document.sdk);
      return model(format);
    },
    ...overrides.dependencies,
  };
  return {
    manager: createDocumentSessionManager({}, dependencies),
    dependencies,
    counts,
    document,
  };
}

for (const format of ['hwp5', 'hwpx'])
  test(`opens ${format} once and repeats exact file text/Markdown with refs`, async () => {
    const { manager, counts } = harness({ format });
    const opened = await manager.open('/private/input', sha);
    assert.deepEqual(Object.keys(opened).sort(), [
      'format',
      'sectionCount',
      'sessionId',
      'sourceSha256',
    ]);
    assert.match(opened.sessionId, /^[a-f0-9]{64}$/);
    for (let repeat = 0; repeat < 2; repeat++)
      for (const format_ of ['text', 'markdown'])
        for (const view of ['content', 'structure']) {
          const text = renderDocument(model(format), { format: format_, view });
          assert.equal(
            await manager.read(opened.sessionId, { format: format_, view }),
            renderReadResponse({ format, sourceSha256: sha, text }, { view }),
          );
        }
    assert.equal(counts.open, 1);
    assert.equal(counts.files, 2);
    assert.equal(counts.observe, 8);
    await manager.close(opened.sessionId);
    assert.equal(counts.close, 1);
    assert.throws(() => manager.read(opened.sessionId), /InvalidDocumentSession/);
    assert.throws(() => manager.close(opened.sessionId), /InvalidDocumentSession/);
    await manager.dispose();
    assert.equal(counts.close, 1);
  });

test('foreign handles are invalid and managers issue independent random handles', async () => {
  const a = harness(),
    b = harness();
  const first = await a.manager.open('same'),
    second = await b.manager.open('same');
  assert.notEqual(first.sessionId, second.sessionId);
  assert.throws(() => b.manager.read(first.sessionId), /InvalidDocumentSession/);
  assert.throws(() => b.manager.close(first.sessionId), /InvalidDocumentSession/);
  await Promise.all([a.manager.dispose(), b.manager.dispose()]);
});

test('four-session cap includes opens; closing frees capacity', async () => {
  const { manager, counts } = harness();
  const ids = [];
  for (let i = 0; i < 4; i++) ids.push((await manager.open('x')).sessionId);
  await assert.rejects(manager.open('fifth'), /DocumentSessionLimitExceeded/);
  assert.equal(counts.open, 4);
  await manager.close(ids[0]);
  await manager.open('replacement');
  await manager.dispose();
  assert.equal(counts.close, 5);
});

test('128 MiB reservation is transactional before first await and rejects without I/O', async () => {
  const gate = deferred();
  let reads = 0;
  const { manager } = harness({
    dependencies: {
      files: {
        resolveWasmPath: () => 'engine.wasm',
        async readInputSnapshot() {
          reads++;
          await gate.promise;
          throw Error('InputFailure');
        },
      },
    },
  });
  const first = manager.open('first'),
    second = manager.open('second');
  const rejectedFirst = assert.rejects(first, /InputFailure/),
    rejectedSecond = assert.rejects(second, /InputFailure/);
  await assert.rejects(manager.open('third'), /DocumentSessionInputLimitExceeded/);
  assert.equal(reads, 2);
  gate.resolve();
  await Promise.all([rejectedFirst, rejectedSecond]);
  await assert.rejects(manager.open('retry'), /InputFailure/);
  assert.equal(reads, 3);
  await manager.dispose();
});

test('two retained 64 MiB inputs consume total input capacity', async () => {
  const big = new Uint8Array(64 * 1024 * 1024);
  const { manager } = harness({
    dependencies: {
      files: {
        resolveWasmPath: () => 'engine.wasm',
        async readInputSnapshot(path) {
          return { bytes: path === 'engine.wasm' ? Uint8Array.of(1) : big, sha256: sha };
        },
      },
    },
  });
  const a = await manager.open('a');
  await manager.open('b');
  await assert.rejects(manager.open('c'), /DocumentSessionInputLimitExceeded/);
  await manager.close(a.sessionId);
  await manager.open('c');
  await manager.dispose();
});

test('SHA mismatch and snapshot/engine/open failures release reservations', async () => {
  let fail = true;
  const h = harness({
    dependencies: {
      async openDocument() {
        if (fail) throw Error('OpenFailed');
        return h.document;
      },
    },
  });
  for (let i = 0; i < 5; i++) await assert.rejects(h.manager.open('x'), /OpenFailed/);
  fail = false;
  await assert.rejects(h.manager.open('x', 'b'.repeat(64)), /SourceSha256Mismatch/);
  await h.manager.open('x');
  await h.manager.dispose();
  assert.equal(h.counts.close, 1);
  const bad = harness();
  bad.document.format = 'bad';
  for (let i = 0; i < 5; i++) await assert.rejects(bad.manager.open('x'), /InvalidEngineFormat/);
  assert.equal(bad.counts.close, 5);
  await bad.manager.dispose();
});

test('dispose while engine open awaits refuses publication and closes returned Native', async () => {
  const gate = deferred(),
    started = deferred();
  const h = harness({
    dependencies: {
      async openDocument() {
        started.resolve();
        return gate.promise;
      },
    },
  });
  const opening = h.manager.open('x');
  const rejected = assert.rejects(opening, /DocumentSessionsDisposed/);
  await started.promise;
  let done = false;
  const disposing = h.manager.dispose().then(() => {
    done = true;
  });
  await tick();
  assert.equal(done, false);
  gate.resolve(h.document);
  await Promise.all([rejected, disposing]);
  assert.equal(h.counts.close, 1);
  await assert.rejects(h.manager.open('x'), /DocumentSessionsDisposed/);
});

for (const teardown of ['close', 'dispose'])
  test(`${teardown} immediately refuses reads but waits for async model lease`, async () => {
    const gate = deferred(),
      started = deferred();
    const h = harness({
      dependencies: {
        async readDocumentModel() {
          started.resolve();
          return gate.promise;
        },
      },
    });
    const { sessionId } = await h.manager.open('x');
    const reading = h.manager.read(sessionId);
    await started.promise;
    const closing = teardown === 'close' ? h.manager.close(sessionId) : h.manager.dispose();
    assert.throws(
      () => h.manager.read(sessionId),
      /InvalidDocumentSession|DocumentSessionsDisposed/,
    );
    await tick();
    assert.equal(h.counts.close, 0);
    gate.resolve(model());
    await reading;
    await closing;
    assert.equal(h.counts.close, 1);
    await h.manager.dispose();
  });

test('model/read/output failures invalidate handle and close Native', async () => {
  for (const dependencies of [
    {
      readDocumentModel: async () => {
        throw Error('ModelFailed');
      },
    },
    {
      renderDocument: () => {
        throw Error('RenderFailed');
      },
    },
    {
      renderDocument: () => '한'.repeat(Math.floor(DOCUMENT_SESSION_LIMITS.maxOutputBytes / 3) + 1),
    },
  ]) {
    const h = harness({ dependencies });
    const { sessionId } = await h.manager.open('x');
    await assert.rejects(
      h.manager.read(sessionId),
      /ModelFailed|RenderFailed|DocumentSessionOutputLimitExceeded/,
    );
    assert.throws(() => h.manager.read(sessionId), /InvalidDocumentSession/);
    await h.manager.dispose();
    assert.equal(h.counts.close, 1);
  }
});

test('dispose attempts every close and releases accounting even when close throws', async () => {
  let attempts = 0;
  const h = harness({
    dependencies: {
      async openDocument() {
        return {
          ...h.document,
          close() {
            attempts++;
            throw Error('CloseFailed');
          },
        };
      },
    },
  });
  await h.manager.open('a');
  await h.manager.open('b');
  const first = h.manager.dispose();
  assert.equal(h.manager.dispose(), first);
  await assert.rejects(first, /DocumentSessionCleanupFailed/);
  assert.equal(attempts, 2);
});

import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createMcpServer, runMcpServer } from '../src/mcp/server.ts';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { McpServer } from '@modelcontextprotocol/server';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
const textOf = (result) => result.content.map((block) => block.text).join('');

async function connected(t, h = harness()) {
  const server = createMcpServer({ sessionDependencies: h.dependencies });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'session-source-test', version: '1' });
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(b);
  await client.connect(a);
  return { client, server, h, transport: b };
}

test('official in-memory SDK exposes 19 tools, strict schemas, metadata and exact read response', async (t) => {
  const { client, h } = await connected(t);
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 19);
  for (const name of ['open_document_session', 'read_document_session', 'close_document_session']) {
    assert.equal(
      listed.tools.find((tool) => tool.name === name).inputSchema.additionalProperties,
      false,
    );
  }
  const invalidOpen = await client.callTool({
    name: 'open_document_session',
    arguments: { inputPath: 'x', bytes: [1] },
  });
  assert.equal(invalidOpen.isError, true);
  const opened = await client.callTool({
    name: 'open_document_session',
    arguments: { inputPath: 'x', expectedSha256: sha },
  });
  const { sessionId, sectionCount } = opened.structuredContent;
  assert.equal(sectionCount, 1);
  assert.deepEqual(JSON.parse(textOf(opened)), opened.structuredContent);
  for (const arguments_ of [
    { sessionId, inputPath: 'replace' },
    { sessionId, bytes: [2] },
    { sessionId, format: 'html' },
    { sessionId, view: 'other' },
  ])
    assert.equal(
      (await client.callTool({ name: 'read_document_session', arguments: arguments_ })).isError,
      true,
    );
  for (const format of ['text', 'markdown']) {
    const read = await client.callTool({
      name: 'read_document_session',
      arguments: { sessionId, format },
    });
    assert.equal(textOf(read), renderDocument(model(), { format, view: 'content' }));
  }
  const foreign = await connected(t);
  assert.match(
    textOf(
      await foreign.client.callTool({ name: 'read_document_session', arguments: { sessionId } }),
    ),
    /InvalidDocumentSession/,
  );
  assert.match(
    textOf(
      await foreign.client.callTool({ name: 'close_document_session', arguments: { sessionId } }),
    ),
    /InvalidDocumentSession/,
  );
  const closed = await client.callTool({
    name: 'close_document_session',
    arguments: { sessionId },
  });
  assert.deepEqual(closed.structuredContent, { closed: true });
  for (const name of ['read_document_session', 'close_document_session']) {
    const result = await client.callTool({ name, arguments: { sessionId } });
    assert.equal(result.isError, true);
    assert.equal(textOf(result), 'InvalidDocumentSession');
  }
  assert.equal(h.counts.open, 1);
  assert.equal(h.counts.close, 1);
});

test('actual in-memory transport close disposes open Native session', async (t) => {
  const { client, h, transport } = await connected(t);
  await client.callTool({ name: 'open_document_session', arguments: { inputPath: 'x' } });
  await transport.close();
  await tick();
  assert.equal(h.counts.close, 1);
});

test('connection startup failure cleans up and can close safely', async () => {
  const h = harness();
  const server = createMcpServer({ sessionDependencies: h.dependencies });
  await assert.rejects(
    server.connect({
      async start() {
        throw Error('StartupFailed');
      },
      async close() {},
      async send() {},
    }),
    /StartupFailed/,
  );
  await server.close();
  assert.equal(h.counts.open, 0);
});

test('registration failure tears down the manager', async () => {
  const original = McpServer.prototype.registerTool;
  McpServer.prototype.registerTool = function (name, ...args) {
    if (name === 'read_document_session') throw Error('RegistrationFailed');
    return original.call(this, name, ...args);
  };
  try {
    assert.throws(() => createMcpServer(), /RegistrationFailed/);
  } finally {
    McpServer.prototype.registerTool = original;
  }
});

test('real stdio EOF with pending open refuses publication and closes Native after resolve', async () => {
  const gate = deferred(),
    started = deferred();
  const h = harness({
    dependencies: {
      async openDocument() {
        started.resolve();
        return gate.promise;
      },
    },
  });
  const input = new PassThrough(),
    output = new PassThrough();
  const [clientWire, peer] = InMemoryTransport.createLinkedPair();
  const reader = createInterface({ input: output });
  const errors = [],
    messages = [];
  reader.on('line', (line) => {
    messages.push(JSON.parse(line));
    void peer.send(JSON.parse(line)).catch((error) => errors.push(error));
  });
  peer.onmessage = (message) => {
    input.write(JSON.stringify(message) + '\n');
  };
  const handle = runMcpServer({
    sessionDependencies: h.dependencies,
    transport: new StdioServerTransport(input, output),
    onerror: (error) => errors.push(error),
  });
  const client = new Client({ name: 'EOF-source-test', version: '1' });
  try {
    await client.connect(clientWire);
    const opening = client
      .callTool({ name: 'open_document_session', arguments: { inputPath: 'x' } })
      .catch((error) => error);
    await started.promise;
    input.end();
    await tick();
    assert.equal(h.counts.close, 0);
    gate.resolve(h.document);
    await handle.close();
    await client.close();
    await opening;
    assert.equal(
      messages.some((message) => message.result?.structuredContent?.sessionId),
      false,
    );
    assert.equal(h.counts.close, 1);
    assert.deepEqual(errors, []);
  } finally {
    gate.resolve(h.document);
    await client.close();
    await handle.close();
    reader.close();
    input.destroy();
    output.destroy();
  }
});

test('four pending engine opens reserve slots before publication', async () => {
  const gates = [],
    starts = [];
  const h = harness({
    dependencies: {
      async openDocument() {
        const gate = deferred();
        gates.push(gate);
        starts.shift()?.resolve();
        return gate.promise;
      },
    },
  });
  const operations = [];
  for (let index = 0; index < 4; index++) {
    const started = deferred();
    starts.push(started);
    operations.push(h.manager.open('x'));
    await started.promise;
  }
  await assert.rejects(h.manager.open('fifth'), /DocumentSessionLimitExceeded/);
  for (const gate of gates) gate.resolve(h.document);
  await Promise.all(operations);
  await h.manager.dispose();
  assert.equal(h.counts.close, 4);
});

test('dispose while file read awaits never calls engine and cannot publish', async () => {
  const gate = deferred();
  const h = harness({
    dependencies: {
      files: {
        resolveWasmPath: () => 'engine.wasm',
        async readInputSnapshot() {
          return gate.promise;
        },
      },
    },
  });
  const opening = h.manager.open('x');
  const rejected = assert.rejects(opening, /DocumentSessionsDisposed/);
  const disposal = h.manager.dispose();
  gate.resolve({ bytes: Uint8Array.of(1), sha256: sha });
  await Promise.all([rejected, disposal]);
  assert.equal(h.counts.open, 0);
});

test('WASM loading and invalid snapshot failures release all reservations', async () => {
  for (const failWasm of [false, true]) {
    const h = harness({
      dependencies: {
        files: {
          resolveWasmPath: () => 'engine.wasm',
          async readInputSnapshot(path) {
            if (path === 'engine.wasm') throw Error('WasmReadFailed');
            return { bytes: failWasm ? Uint8Array.of(1) : new Uint8Array(), sha256: sha };
          },
        },
      },
    });
    for (let index = 0; index < 5; index++)
      await assert.rejects(h.manager.open('x'), /WasmReadFailed|InvalidInputSnapshot/);
    assert.equal(h.counts.open, 0);
    await h.manager.dispose();
  }
});

test('session uses existing regular-file host checks and 64 MiB file maximum', async () => {
  const { mkdtemp, open, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'hwpjs-read-session-'));
  const path = join(directory, 'oversized.hwp');
  const file = await open(path, 'wx');
  try {
    await file.truncate(64 * 1024 * 1024 + 1);
    await file.close();
    const manager = createDocumentSessionManager();
    await assert.rejects(manager.open(path), /FileTooLarge/);
    await assert.rejects(manager.open(directory), /InputNotRegularFile/);
    await manager.dispose();
  } finally {
    await file.close();
    await rm(directory, { recursive: true });
  }
});

test('overlapping reads refuse before Native observation without queuing or invalidating the handle', async () => {
  const gate = deferred();
  const started = deferred();
  let observations = 0;
  const h = harness({
    dependencies: {
      async readDocumentModel() {
        observations++;
        started.resolve();
        return gate.promise;
      },
    },
  });
  const { sessionId } = await h.manager.open('x');
  try {
    const first = h.manager.read(sessionId);
    await started.promise;
    for (let index = 0; index < 1000; index++)
      assert.throws(() => h.manager.read(sessionId), /DocumentSessionBusy/);
    assert.equal(observations, 1);
    gate.resolve(model());
    const text = await first;
    assert.equal(await h.manager.read(sessionId), text);
    assert.equal(observations, 2);
    assert.equal(h.counts.close, 0);
  } finally {
    gate.resolve(model());
    await h.manager.dispose();
  }
});
