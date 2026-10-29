import { createReaderRuntime } from '../../web/preview/reader-runtime.mjs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { sourceTextChange } from '../../web/preview/text-offsets.mjs';
import { verifySavedBytes } from './style-preservation/plain-footnote-saved-oracle.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  inspect,
  records,
  paragraphRecords,
  encodeRecord,
} from './style-preservation/text-record-oracle.mjs';
import { buildExpected, verifyParsed } from './style-preservation/plain-footnote-saved-oracle.mjs';
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
assert.equal(resolve(process.cwd()), resolve(repoRoot), 'RepoRootCwdRequired');
const fixture = 'legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwp';
const original = existsSync(fixture) ? readFileSync(fixture) : null;
const fixtureOptions = { skip: !original };
function control() {
  const { before, expected, targets } = buildExpected(original),
    after = inspect(original);
  for (const s of after.sections) s.bytes = Buffer.from(expected.get(s.path));
  return { before, expected, targets, after };
}
function rejectMutated(change) {
  const c = control();
  change(c);
  assert.throws(
    () => verifyParsed(c.before, c.after, c.expected),
    /FullRawSectionMismatch|NonTargetStreamChanged/,
  );
}
test(
  'oracle synthetic expected sections are accepted without Native execution',
  fixtureOptions,
  () => {
    const c = control();
    verifyParsed(c.before, c.after, c.expected);
  },
);
test('oracle rejects target text corruption', fixtureOptions, () =>
  rejectMutated((c) => {
    const t = c.targets[0],
      s = c.after.sections[t.section],
      r = paragraphRecords(s.bytes, t.paragraph).direct.find((r) => r.tag === 67);
    s.bytes[r.start + r.raw.length - 4] ^= 1;
  }),
);
test('oracle rejects target line-mask corruption', fixtureOptions, () =>
  rejectMutated((c) => {
    const t = c.targets[0],
      s = c.after.sections[t.section],
      r = paragraphRecords(s.bytes, t.paragraph).head;
    const at = r.start + r.raw.length - r.payload.length + 4;
    s.bytes.writeUInt32LE((s.bytes.readUInt32LE(at) ^ 0x400) >>> 0, at);
  }),
);
test('oracle rejects non-target paragraph record corruption', fixtureOptions, () =>
  rejectMutated((c) => {
    const s = c.after.sections[0],
      all = records(s.bytes),
      excluded = new Set(
        c.targets
          .filter((t) => t.section === 0)
          .flatMap((t) =>
            paragraphRecords(s.bytes, t.paragraph)
              .direct.filter((r) => r.tag === 67)
              .map((r) => r.start),
          ),
      );
    const r = all.find((r) => r.tag === 67 && !excluded.has(r.start) && r.payload.length >= 2);
    assert(r);
    s.bytes[r.start + r.raw.length - r.payload.length] ^= 1;
  }),
);
test('oracle rejects inserted stale line cache', fixtureOptions, () =>
  rejectMutated((c) => {
    const s = c.after.sections[0];
    s.bytes = Buffer.concat([s.bytes, encodeRecord(69, 1, Buffer.alloc(36))]);
  }),
);

const wasmPath = process.env.HWPJS_TEST_WASM;
test(
  'Native two plain footnote splices preserve independent records and exact undo/redo',
  { skip: !original || !wasmPath },
  async () => {
    const wasm = readFileSync(wasmPath);

    const module = await WebAssembly.compile(wasm),
      runtime = createReaderRuntime({ wasmModule: module });
    let native;
    try {
      const reply = await runtime.request({ kind: 'load', format: 'hwp5', bytes: original });
      assert.equal(reply.kind, 'load', reply.error);
      const before = reply.content,
        notes = before.hwp5Notes.filter((n) => n.kind === 'footnote');
      assert.equal(notes.length, 2);
      native = await createExperimentalHwp5Editor(module, original);
      native.enableHistoryDefault();
      const additions = [' first-note-0123456789', ' second-note-0123456789'].map((s) =>
        s.repeat(150),
      );
      let first;
      for (let i = 0; i < 2; i++) {
        const n = notes[i],
          row = before.paragraphs.find(
            (p) => p.section === n.section && p.paragraph === n.paragraphs[0],
          );
        assert(row);
        const change = sourceTextChange(
          { startUnit: row.text.length, endUnit: row.text.length, text: additions[i] },
          row.sourceOffsets,
        );
        native.splice({ section: n.section, paragraph: n.paragraphs[0], ...change });
        if (i === 0) first = Buffer.from(native.save({ allowStaleLayout: true }).bytes);
      }
      const edited = Buffer.from(native.save({ allowStaleLayout: true }).bytes);
      const result = verifySavedBytes(original, edited);
      assert(native.undo());
      assert.deepEqual(Buffer.from(native.save({ allowStaleLayout: true }).bytes), first);
      assert(native.undo());
      assert.deepEqual(Buffer.from(native.save({ allowStaleLayout: true }).bytes), original);
      assert(native.redo());
      assert(native.redo());
      assert.deepEqual(Buffer.from(native.save({ allowStaleLayout: true }).bytes), edited);
      assert.equal(result.streamCount, 9); // Fixed original fixture, not a generic CFB stream count.
      assert.equal(result.targets.length, 2);
    } finally {
      native?.close();
      await runtime.dispose();
    }
  },
);
