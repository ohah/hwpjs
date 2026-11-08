import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';

// 설치한 tarball을 실행해 의존 패키지/WASM 자동 선택과 stdio 전달을 검사합니다.
test(
  'installed MCP entry initializes and reads HWP5/HWPX with bundled WASM',
  { timeout: 60000 },
  async () => {
    const consumer = process.env.HWPJS_MCP_CONSUMER;
    const fixtureRoot = process.env.HWPJS_MCP_FIXTURES;
    assert(consumer && fixtureRoot, 'Explicit installed consumer and fixture paths required');
    const child = spawn(
      process.execPath,
      [join(consumer, 'node_modules/@ohah/hwpjs-mcp/dist/index.mjs')],
      {
        cwd: consumer,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    const exited = once(child, 'exit');
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    const lines = createInterface({ input: child.stdout });
    const pending = new Map();
    lines.on('line', (line) => {
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        waiter(message);
      }
    });
    let id = 0;
    const send = (message) =>
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
    const request = (method, params) =>
      new Promise((resolveResponse, reject) => {
        const current = ++id;
        const timer = setTimeout(() => {
          pending.delete(current);
          reject(new Error(`MCP response timeout: ${method}; ${stderr}`));
        }, 10000);
        pending.set(current, (message) => {
          clearTimeout(timer);
          resolveResponse(message);
        });
        send({ id: current, method, params });
      });
    try {
      const initialized = await request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'installed-mcp-package-test', version: '1.0.0' },
      });
      assert.equal(initialized.result.serverInfo.name, 'hwpjs');
      assert.equal(initialized.result.serverInfo.version, '0.1.0');
      send({ method: 'notifications/initialized' });
      const list = await request('tools/list', {});
      assert.equal(list.result.tools.length, 12);
      assert(list.result.tools.some((tool) => tool.name === 'read_document'));
      for (const name of ['noori.hwp', 'noori.hwpx']) {
        const read = await request('tools/call', {
          name: 'read_document',
          arguments: { inputPath: resolve(fixtureRoot, name), format: 'markdown' },
        });
        assert.notEqual(read.result.isError, true, JSON.stringify(read));
        assert(
          read.result.content.some((item) => item.type === 'text' && item.text.includes('누리')),
        );
      }
      const missing = await request('tools/call', {
        name: 'read_document',
        arguments: { inputPath: join(consumer, 'missing-document.hwp') },
      });
      assert.equal(missing.result.isError, true);
      assert.equal(stderr, '');
    } finally {
      lines.close();
      child.stdin.end();
      const watchdog = setTimeout(() => child.kill(), 3000);
      try {
        const [code, signal] = await exited;
        assert.equal(code, 0, stderr);
        assert.equal(signal, null);
      } finally {
        clearTimeout(watchdog);
      }
    }
  },
);

test('installed entry preserves MCP argument errors on stderr', () => {
  const consumer = process.env.HWPJS_MCP_CONSUMER;
  assert(consumer, 'Explicit installed consumer required');
  const result = spawnSync(
    process.execPath,
    [join(consumer, 'node_modules/@ohah/hwpjs-mcp/dist/index.mjs'), '--invalid'],
    { cwd: consumer, encoding: 'utf8', timeout: 10000 },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Usage: hwpjs-mcp/);
});
