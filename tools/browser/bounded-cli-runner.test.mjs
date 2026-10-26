import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  inspectBrowserCli,
  createBoundedCliRunner,
  decodeCliRecord,
} from './bounded-cli-runner.mjs';
const identity = (mode) => ({ mode, executable: { path: '/mock/cli' } });
function mockProcess({
  fallback = false,
  validGroup = true,
  complete = true,
  status = 0,
  stdout = '{"success":true,"data":{"ok":true}}',
  orphan = false,
} = {}) {
  let alive = true,
    starts = 0;
  const kills = [],
    go = [];
  const child = new EventEmitter();
  child.pid = 987654;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdio = [null, child.stdout, child.stderr, new EventEmitter()];
  child.stdin = {
    end: (data) => {
      go.push(data);
      if (complete) queueMicrotask(finish);
    },
  };
  child.kill = (signal) => {
    kills.push(['child', signal]);
    alive = false;
  };
  function finish() {
    child.stdout.emit('data', Buffer.from(stdout));
    child.stderr.emit('data', Buffer.from('diagnostic stderr'));
    alive = orphan;
    child.emit('exit', status, null);
    child.emit('close', status, null);
  }
  return {
    child,
    kills,
    go,
    get starts() {
      return starts;
    },
    options: {
      timeoutMs: 15,
      graceMs: 1,
      checkIdentity: false,
      spawnProcess: (_exe, _args, options) => {
        starts++;
        assert.equal(options.detached, true);
        assert.equal(options.shell, false);
        queueMicrotask(() => {
          child.emit('spawn');
          if (fallback) child.stdio[3].emit('data', JSON.stringify({ pid: child.pid }) + '\n');
          else if (complete) finish();
        });
        return child;
      },
      getPgid: (pid) => (pid === child.pid ? (validGroup ? child.pid : 111) : 222),
      hasGroup: () => alive,
      killGroup: (pid, signal) => {
        assert.equal(pid, child.pid);
        kills.push([pid, signal]);
        alive = false;
        child.emit('exit', null, signal);
        child.emit('close', null, signal);
      },
    },
  };
}
test('native header is checked; package name/path alone cannot authorize sibling execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bounded-cli-inspection-'));
  try {
    const native = join(root, 'native');
    await writeFile(native, Buffer.from('cffaedfe00000000', 'hex'), { mode: 0o755 });
    assert.equal(inspectBrowserCli({ cli: native }).mode, 'native-direct');
    const bin = join(root, 'bin');
    await mkdir(bin);
    const shim = join(bin, 'cli.js');
    await writeFile(shim, '#!/usr/bin/env node\nconsole.log("unreviewed");', { mode: 0o755 });
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'agent-browser',
        version: '0.31.1',
        bin: { 'agent-browser': 'bin/cli.js' },
      }),
    );
    await writeFile(
      join(bin, 'agent-browser-darwin-arm64'),
      Buffer.from('cffaedfe00000000', 'hex'),
      { mode: 0o755 },
    );
    const value = inspectBrowserCli({ cli: shim, platform: 'darwin', arch: 'arm64' });
    assert.equal(value.mode, 'owned-group-fallback');
    assert.equal(value.executable.path, await realpath(shim));
    assert(value.launcher.sha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('one command, exact stdout/stderr/status plus monotonic timestamps; JSON failures retain raw records', async () => {
  const mock = mockProcess(),
    runner = createBoundedCliRunner(identity('native-direct'), mock.options);
  const record = await runner.run(['press', 'Escape']);
  assert.equal(mock.starts, 1);
  assert(BigInt(record.endMonotonicNs) >= BigInt(record.startMonotonicNs));
  assert(record.elapsedMs >= 0);
  assert.equal(record.status, 0);
  assert.equal(record.stderr, 'diagnostic stderr');
  assert.deepEqual(decodeCliRecord(record), { ok: true });
  assert.throws(
    () => decodeCliRecord({ ...record, stdout: '{bad' }),
    (e) => e.code === 'INVALID_JSON' && e.stdout === '{bad',
  );
  assert.throws(
    () => decodeCliRecord({ ...record, stdout: '{"success":false,"error":"Wait timed out"}' }),
    (e) => e.record.cliResponse.error === 'Wait timed out',
  );
});
test('nonzero exit preserves status and structured stdout; runner never retries', async () => {
  const mock = mockProcess({ status: 1, stdout: '{"success":false,"error":"operation timeout"}' });
  const runner = createBoundedCliRunner(identity('native-direct'), mock.options);
  await assert.rejects(
    runner.run(['wait', '--fn', 'false']),
    (e) => e.status === 1 && JSON.parse(e.stdout).error === 'operation timeout',
  );
  assert.equal(mock.starts, 1);
  assert.equal(runner.records.length, 1);
});
test('fallback target receives GO only after detached group verification', async () => {
  const mock = mockProcess({ fallback: true });
  const runner = createBoundedCliRunner(identity('owned-group-fallback'), mock.options);
  const record = await runner.run(['press', 'Escape']);
  assert.deepEqual(mock.go, ['GO\n']);
  assert(record.processGroup.verified);
});
test('unverified fallback never starts target or signals an unowned group', async () => {
  const mock = mockProcess({ fallback: true, validGroup: false });
  const runner = createBoundedCliRunner(identity('owned-group-fallback'), mock.options);
  await assert.rejects(
    runner.run(['press', 'Escape']),
    (e) => e.code === 'UNVERIFIED_PROCESS_GROUP',
  );
  assert.deepEqual(mock.go, []);
  assert.deepEqual(mock.kills, [['child', 'SIGKILL']]);
});
test('deadline cleans owned process group without input retry; stdout and timeout code survive', async () => {
  const mock = mockProcess({ complete: false });
  const runner = createBoundedCliRunner(identity('native-direct'), mock.options);
  await assert.rejects(
    runner.run(['press', 'Escape']),
    (e) =>
      e.code === 'ETIMEDOUT' && e.record.timedOut && e.record.processGroup.cleanup === 'group-gone',
  );
  assert.equal(mock.starts, 1);
  assert.equal(mock.kills.length, 1);
});
test('a completed shim with lingering children is failure and group is cleaned', async () => {
  const mock = mockProcess({ fallback: true, orphan: true });
  const runner = createBoundedCliRunner(identity('owned-group-fallback'), mock.options);
  await assert.rejects(
    runner.run(['press', 'Escape']),
    (e) => e.code === 'OWNED_GROUP_NOT_QUIESCENT' && e.record.processGroup.cleanup === 'group-gone',
  );
});
test('concurrent commands rejected and oversized outputs terminated with bounded saved bytes', async () => {
  const mock = mockProcess({ complete: false }),
    runner = createBoundedCliRunner(identity('native-direct'), { ...mock.options, maxBytes: 8 });
  const first = runner.run(['eval', 'large']);
  await assert.rejects(runner.run(['press', 'Escape']), /Concurrent/);
  mock.child.stdout.emit('data', '1234567890');
  await assert.rejects(
    first,
    (e) => e.code === 'MAX_BUFFER' && e.stdout === '12345678' && e.record.truncated,
  );
});
test('split UTF-8 output preserved and explicit abort cleans only the verified group', async () => {
  const mock = mockProcess({ complete: false }),
    runner = createBoundedCliRunner(identity('native-direct'), mock.options);
  const pending = runner.run(['press', 'Escape']);
  await Promise.resolve();
  const bytes = Buffer.from('문서');
  mock.child.stdout.emit('data', bytes.subarray(0, 2));
  mock.child.stdout.emit('data', bytes.subarray(2));
  const rejected = assert.rejects(
    pending,
    (e) =>
      e.code === 'AUDIT_SIGTERM' &&
      e.stdout === '문서' &&
      e.record.processGroup.cleanup === 'group-gone',
  );
  await runner.abortActive('AUDIT_SIGTERM');
  await rejected;
  assert.equal(mock.starts, 1);
});
test('spawn failure has structured code/stdout/stderr and no command retry', async () => {
  const runner = createBoundedCliRunner(identity('native-direct'), {
    checkIdentity: false,
    spawnProcess() {
      throw Object.assign(Error('missing'), { code: 'ENOENT' });
    },
  });
  await assert.rejects(
    runner.run(['snapshot']),
    (e) => e.code === 'ENOENT' && e.stdout === '' && e.stderr.includes('missing'),
  );
  assert.equal(runner.records.length, 1);
});
test('TERM-resistant owned group gets KILL; cleanup failure stays a failure', async () => {
  const mock = mockProcess({ complete: false });
  let alive = true;
  const signals = [];
  const runner = createBoundedCliRunner(identity('native-direct'), {
    ...mock.options,
    hasGroup: () => alive,
    killGroup: (_id, signal) => {
      signals.push(signal);
      if (signal === 'SIGKILL') alive = false;
    },
  });
  await assert.rejects(
    runner.run(['press', 'Escape']),
    (e) => e.code === 'ETIMEDOUT' && e.record.processGroup.cleanup === 'group-gone',
  );
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
});
test('process-group inspection errors fail closed and are recorded instead of becoming uncaught events', async () => {
  const mock = mockProcess({ complete: false });
  const runner = createBoundedCliRunner(identity('native-direct'), {
    ...mock.options,
    getPgid() {
      throw Error('ps failed');
    },
  });
  await assert.rejects(
    runner.run(['press', 'Escape']),
    (e) =>
      e.code === 'PROCESS_GROUP_INSPECTION_FAILURE' &&
      e.record.processGroup.cleanup === 'cleanup-error',
  );
  assert.equal(mock.kills.length, 0, 'never signal a group that was not verified');
});
