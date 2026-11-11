import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, isAbsolute } from 'node:path';
import { createNewDocumentBytes } from '../../../js/new-document.mjs';
import { createHwpxEditor } from '../../../js/hwpx-editor.mjs';
import { createExperimentalHwp5Editor } from '../../../js/hwp5-editor.mjs';
import { openDocument } from '../src/engine.ts';
import { applyDocumentOperations } from '../src/document-operations.ts';
import { prepareOperationSession } from '../src/mutations/dispatch.ts';
import { prepareCharacterExtensions } from '../src/mutations/character-extensions.ts';
const {
  HWPJS_TEST_WASM: wasmPath,
  HWPJS_TEST_WASM_SHA256: pin,
  HWPJS_CHARACTER_NATIVE_SCALE_EVIDENCE: evidence,
} = process.env;
for (const p of [wasmPath, evidence]) assert(p && isAbsolute(p), 'ExplicitAbsoluteInputsRequired');
const wasm = await readFile(wasmPath),
  hash = (b) => createHash('sha256').update(b).digest('hex');
assert.equal(hash(wasm), pin);
await mkdir(evidence);
const module = await WebAssembly.compile(wasm),
  ledger = [];
const op = (format, paragraph) => ({
  kind: 'character-properties',
  coordinates: 'current-transaction',
  section: 0,
  paragraph,
  startUnit: 0,
  endUnit: 3,
  expectedRangeText: 'SAM',
  properties: { textColor: '#123456' },
});
const late = {
  kind: 'paragraph-alignment',
  coordinates: 'current-transaction',
  section: 0,
  paragraph: 0xffffffff,
  alignment: 'LEFT',
};
async function construct(format, n) {
  const blank = await createNewDocumentBytes(module, format),
    sdk =
      format === 'hwpx'
        ? await createHwpxEditor(module)
        : await createExperimentalHwp5Editor(module, blank);
  try {
    const text = 'HEAD' + 'SAME'.repeat(n);
    if (format === 'hwpx') {
      sdk.open(blank);
      sdk.splice(0, 1, 0, 0, text);
      sdk.splitParagraph({ section: 0, paragraph: 1, atUnit: 4 });
    } else {
      sdk.splice({ section: 0, paragraph: 0, startUnit: 16, endUnit: 16, text });
      sdk.splitParagraph({ section: 0, paragraph: 0, atUnit: 20 });
    }
    for (let i = 0; i < n - 1; i++)
      sdk.splitParagraph({ section: 0, paragraph: i + (format === 'hwpx' ? 2 : 1), atUnit: 4 });
    const saved = sdk.save({ allowStaleLayout: true });
    return Uint8Array.from(format === 'hwpx' ? saved : saved.bytes);
  } finally {
    sdk.close();
  }
}
function instrument(document) {
  const counts = {
      flowCalls: 0,
      flowRowsReturned: 0,
      bridgeIndexReads: 0,
      referenceCalls: 0,
      formattingQueries: 0,
      writes: 0,
      bindings: 0,
      capabilities: 0,
      saves: 0,
      closed: 0,
      textReads: 0,
      historyEnables: 0,
      supportCalls: 0,
      legacyWrites: 0,
    },
    timing = {};
  const sdk = { ...document.sdk };
  for (const [name, key] of [
    ['paragraphFlow', 'flowCalls'],
    ['currentSourceReferences', 'referenceCalls'],
    ['queryFormatting', 'formattingQueries'],
    ['applyFormattingPatch', 'writes'],
    ['sourceTableCellSplitBinding', 'bindings'],
    ['atomicFormattingCapabilities', 'capabilities'],
    ['text', 'textReads'],
    ['anchorText', 'textReads'],
    ['enableHistoryV2', 'historyEnables'],
    ['supportsAtomicFormatting', 'supportCalls'],
    ['supportsSourceTableCellSplit', 'supportCalls'],
    ['supportsCurrentSourceReferences', 'supportCalls'],
    ['setParagraphAlignment', 'legacyWrites'],
  ]) {
    const original = sdk[name];
    if (typeof original !== 'function') continue;
    sdk[name] = (...args) => {
      counts[key]++;
      const start = process.hrtime.bigint();
      let value;
      try {
        value = Reflect.apply(original, document.sdk, args);
      } finally {
        timing[name] = (timing[name] ?? 0n) + process.hrtime.bigint() - start;
      }
      if (name === 'paragraphFlow') {
        counts.flowRowsReturned += value.length;
        return new Proxy(value, {
          get(target, key, receiver) {
            if (typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key)) counts.bridgeIndexReads++;
            return Reflect.get(target, key, receiver);
          },
        });
      }
      return value;
    };
  }
  const wrapped = {
    ...document,
    sdk,
    save(options) {
      counts.saves++;
      const start = process.hrtime.bigint();
      try {
        return document.save(options);
      } finally {
        timing.documentSave = (timing.documentSave ?? 0n) + process.hrtime.bigint() - start;
      }
    },
    close() {
      counts.closed++;
      const start = process.hrtime.bigint();
      try {
        return document.close();
      } finally {
        timing.documentClose = (timing.documentClose ?? 0n) + process.hrtime.bigint() - start;
      }
    },
  };
  return {
    wrapped,
    counts,
    summary(totalNs) {
      const sdkNs = Object.values(timing).reduce((n, x) => n + x, 0n);
      return {
        totalMs: Number(totalNs) / 1e6,
        sdkBoundaryMs: Object.fromEntries(
          Object.entries(timing).map(([k, n]) => [k, Number(n) / 1e6]),
        ),
        bridgeResidualMs: Number(totalNs - sdkNs) / 1e6,
        counts,
        scope:
          'SDK/read/support/write/save/close boundaries include Native + existing decode/validation; residual includes service capture/copy/scheduling, not a pure planning CPU benchmark. Construction/open excluded.',
      };
    },
  };
}
async function exact(format, bytes) {
  const d = await openDocument({ bytes, wasm });
  try {
    const saved = d.save({ allowStaleLayout: true });
    assert.deepEqual(Buffer.from(format === 'hwp5' ? saved.bytes : saved), Buffer.from(bytes));
  } finally {
    d.close();
  }
}
async function run(format, n, direction, bytes, fail = false) {
  const order = Array.from({ length: n }, (_, i) => i + (format === 'hwpx' ? 2 : 1));
  if (direction === 'reverse') order.reverse();
  const operations = order.map((p) => op(format, p));
  if (fail) operations.push(late);
  const d = await openDocument({ bytes, wasm }),
    probe = instrument(d),
    start = process.hrtime.bigint();
  let result;
  if (fail)
    await assert.rejects(
      applyDocumentOperations(
        { bytes, wasm, expectedSha256: hash(bytes), allowStaleLayout: true, operations },
        { openDocument: async () => probe.wrapped },
      ),
    );
  else
    result = await applyDocumentOperations(
      { bytes, wasm, expectedSha256: hash(bytes), allowStaleLayout: true, operations },
      { openDocument: async () => probe.wrapped },
    );
  const summary = probe.summary(process.hrtime.bigint() - start);
  assert.equal(probe.counts.flowCalls, n + 1);
  assert.equal(probe.counts.flowRowsReturned, (n + 1) * (n + 1));
  assert.equal(probe.counts.bridgeIndexReads, format === 'hwp5' ? n + 1 + 3 * n : n + 1 + n);
  assert.equal(probe.counts.formattingQueries, 3 * n);
  assert.equal(probe.counts.writes, n);
  assert.equal(probe.counts.saves, fail ? 0 : 1);
  assert.equal(probe.counts.closed, 1);
  if (result) {
    assert.equal(result.operationResults.length, n);
    assert(result.operationResults.every((x) => x.changed === true));
    assert(
      result.operationResults.every(
        (x) => x.after.aggregate['character.textColor'].value === 0x123456,
      ),
    );
    await exact(format, result.bytes);
    await writeFile(
      join(evidence, `${format}-${n}-${direction}.` + (format === 'hwpx' ? 'hwpx' : 'hwp')),
      result.bytes,
    );
  }
  ledger.push({ format, n, direction, lateFailure: fail, ...summary });
  await writeFile(
    join(evidence, 'NATIVE-SCALE.json'),
    JSON.stringify({ wasmSha256: pin, ledger }, null, 2) + '\n',
  );
  return result?.bytes;
}
async function oracle(format, n, direction) {
  const suffix = format === 'hwpx' ? 'hwpx' : 'hwp',
    plan = {
      format,
      n,
      color: '#123456',
      before: join(evidence, `${format}-${n}-input.${suffix}`),
      after: join(evidence, `${format}-${n}-${direction}.${suffix}`),
    },
    path = join(evidence, `${format}-${n}-${direction}-oracle-plan.json`),
    wrong = join(evidence, `${format}-${n}-${direction}-oracle-wrong.json`);
  await writeFile(path, JSON.stringify(plan));
  await writeFile(wrong, JSON.stringify({ ...plan, color: '#654321' }));
  const script = fileURLToPath(
    new URL('./helpers/character-plan-scale-oracle.py', import.meta.url),
  );
  const records = [];
  for (const flags of [[], ['-O']]) {
    const good = spawnSync('python3', ['-B', ...flags, script, path], { encoding: 'utf8' });
    assert.equal(good.status, 0, good.stderr);
    const bad = spawnSync('python3', ['-B', ...flags, script, wrong], { encoding: 'utf8' });
    assert.equal(bad.status, 1, bad.stdout + bad.stderr);
    records.push({ flags, result: JSON.parse(good.stdout), wrongValueRejected: true });
  }
  await writeFile(
    join(evidence, `${format}-${n}-${direction}-oracle.json`),
    JSON.stringify(records, null, 2),
  );
}
for (const format of ['hwp5', 'hwpx'])
  for (const n of [32, 64, 128])
    test(`actual ${format} N${n}: forward/reverse Native counters, exact bytes, and both late failures`, async () => {
      const bytes = await construct(format, n);
      await writeFile(
        join(evidence, `${format}-${n}-input.` + (format === 'hwpx' ? 'hwpx' : 'hwp')),
        bytes,
      );
      const original = hash(bytes);
      const forward = await run(format, n, 'forward', bytes),
        reverse = await run(format, n, 'reverse', bytes);
      assert.deepEqual(Buffer.from(forward), Buffer.from(reverse));
      await oracle(format, n, 'forward');
      await oracle(format, n, 'reverse');
      await run(format, n, 'forward', bytes, true);
      await run(format, n, 'reverse', bytes, true);
      assert.equal(hash(bytes), original);
    });
for (const format of ['hwp5', 'hwpx'])
  test(`actual ${format} original lineage, receipt ABA and fresh binding cannot be bypassed by O(1) advance`, async () => {
    const bytes = await construct(format, 3),
      d = await openDocument({ bytes, wasm }),
      operations = [op(format, format === 'hwp5' ? 1 : 2), op(format, format === 'hwp5' ? 2 : 3)];
    try {
      prepareOperationSession(d, operations);
      const plan = prepareCharacterExtensions(d, operations);
      plan.apply(d, operations[0], 0);
      d.sdk.undo();
      d.sdk.redo();
      assert.throws(() => plan.advance(), /Stale/);
    } finally {
      d.close();
    }
  });
for (const format of ['hwp5', 'hwpx'])
  test(`actual ${format} all six legacy formatting predecessors produce only one-commit/no-op receipts`, async () => {
    const bytes = await construct(format, 2),
      paragraph = format === 'hwp5' ? 1 : 2,
      base = { coordinates: 'current-transaction', section: 0, paragraph };
    const legacy = [
      {
        ...base,
        kind: 'character-properties',
        startUnit: 0,
        endUnit: 3,
        expectedRangeText: 'SAM',
        properties: { bold: true },
      },
      {
        ...base,
        kind: 'character-format',
        startUnit: 0,
        endUnit: 3,
        expectedRangeText: 'SAM',
        charShapeId: 0,
      },
      { ...base, kind: 'paragraph-format', paraShapeId: 0 },
      { ...base, kind: 'paragraph-alignment', alignment: 'CENTER' },
      { ...base, kind: 'paragraph-margins', margins: { left: 100 } },
      { ...base, kind: 'paragraph-spacing', type: 'PERCENT', value: 150 },
    ];
    for (const operation of legacy) {
      const result = await applyDocumentOperations({
        bytes,
        wasm,
        expectedSha256: hash(bytes),
        allowStaleLayout: true,
        operations: [operation, op(format, paragraph + 1)],
      });
      assert.equal(result.operationResults.length, 1);
      await exact(format, result.bytes);
    }
  });
