import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  request,
  metadata,
  result,
  frameParser,
  protocolForVersion,
} from './zig-test-protocol.mjs';
import { nativeAuditOptions, nativeTestRange } from './native-test-range.mjs';

const options = nativeAuditOptions(process.argv.slice(2));
const { binary, size } = options;
const hash = () => createHash('sha256').update(readFileSync(binary)).digest('hex');
const digest = hash(),
  outcomes = [],
  counts = { pass: 0, fail: 0, skip: 0, fuzzDeclarations: 0 };
if (options.expectedSha256 !== undefined)
  assert.equal(digest, options.expectedSha256, 'NativeBinarySha256Mismatch');

function server() {
  const child = spawn(binary, ['--listen=-', '--seed=0x485750'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const queued = [],
    waiting = [];
  let failure = null;
  const abort = (error) => {
    failure ??= error;
    while (waiting.length) waiting.shift().reject(failure);
  };
  const parser = frameParser((message) => {
    if (waiting.length) waiting.shift().resolve(message);
    else queued.push(message);
  });
  child.stderr.on('data', (bytes) => process.stderr.write(bytes));
  child.stdin.on('error', abort);
  child.stdout.on('data', (bytes) => {
    try {
      parser.push(bytes);
    } catch (error) {
      abort(error);
      child.kill('SIGTERM');
    }
  });
  child.on('error', abort);
  const closed = new Promise((resolve) =>
    child.on('close', (code, signal) => {
      try {
        parser.end();
      } catch (error) {
        abort(error);
      }
      abort(new Error(`NativeRunnerClosed: code=${code} signal=${signal}`));
      resolve({ code, signal });
    }),
  );
  return {
    child,
    next() {
      if (queued.length) return Promise.resolve(queued.shift());
      if (failure) return Promise.reject(failure);
      return new Promise((resolve, reject) => waiting.push({ resolve, reject }));
    },
    send(tag, index) {
      if (failure) throw failure;
      child.stdin.write(request(tag, index));
    },
    async stop(normal) {
      if (normal && !failure) child.stdin.end(request(0));
      else if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      const exit = await closed;
      if (normal)
        assert.deepEqual(exit, { code: 0, signal: null }, 'NativeRunnerDidNotExitCleanly');
    },
  };
}

let names = null;
let range = null;
try {
  let start = options.start;
  do {
    assert.equal(hash(), digest, 'NativeBinaryChanged');
    const runner = server();
    let normal = false;
    try {
      const version = await runner.next();
      assert.equal(version.tag, 0);
      protocolForVersion(version.body.toString());
      runner.send(4);
      const inventory = await runner.next();
      assert.equal(inventory.tag, 3);
      const actual = metadata(inventory.body);
      if (names === null) {
        names = actual;
        range = nativeTestRange(options, names.length);
        console.log(
          JSON.stringify({
            kind: 'inventory',
            zigVersion: version.body.toString(),
            binarySha256: digest,
            tests: names.length,
            batchSize: size,
            seed: '0x485750',
            range,
          }),
        );
      } else assert.deepEqual(actual, names, 'NativeTestInventoryChanged');
      const end = Math.min(range.end, start + size);
      console.log(JSON.stringify({ kind: 'batch', pid: runner.child.pid, start, end }));
      for (let index = start; index < end; index++) {
        console.log(JSON.stringify({ kind: 'test-start', index, name: names[index] }));
        runner.send(5, index);
        const started = await runner.next();
        assert.equal(started.tag, 5);
        assert.equal(started.body.length, 0);
        const message = await runner.next();
        assert.equal(message.tag, 4);
        const outcome = result(message.body);
        assert.equal(outcome.index, index, 'UnexpectedNativeTestIndex');
        assert.equal(outcomes.length, index - range.start, 'NativeTestCoverageGap');
        outcomes.push(outcome);
        counts[['pass', 'fail', 'skip'][outcome.status]]++;
        if (outcome.fuzz) counts.fuzzDeclarations++;
        if (outcome.logs || outcome.leaks) process.exitCode = 1;
        console.log(JSON.stringify({ kind: 'test-result', name: names[index], ...outcome }));
      }
      normal = true;
      start = end;
    } finally {
      await runner.stop(normal);
    }
  } while (start < range.end);
  assert.equal(outcomes.length, range.end - range.start, 'IncompleteNativeTestCoverage');
  assert.equal(hash(), digest, 'NativeBinaryChanged');
  const logErrors = outcomes.reduce((sum, outcome) => sum + outcome.logs, 0),
    leaks = outcomes.reduce((sum, outcome) => sum + outcome.leaks, 0);
  const success = !counts.fail && !counts.skip && !logErrors && !leaks;
  if (!success) process.exitCode = 1;
  console.log(
    JSON.stringify({
      kind: range.fullInventoryCovered ? 'complete' : 'range-complete',
      success,
      binarySha256: digest,
      tests: names.length,
      completed: outcomes.length,
      range,
      ...counts,
      logErrors,
      leaks,
      scope:
        'selected compiled unit tests in isolated standard-runner processes; not a long-lived single-process gate or fuzz campaign',
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      kind: 'incomplete',
      completed: outcomes.length,
      tests: names?.length ?? null,
      range,
      error: error.message,
    }),
  );
  process.exitCode = 1;
}
