import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { decodeAvailableSectionCopyInfo } from "../../js/hwp5-available-section-copy.mjs";
import { createMemory } from "../../js/wasm-memory.mjs";
import { withoutNormalizationExport } from "./normalization-export-fixture.mjs";
import { sectionCountFixtures } from "./section-count-fixtures.mjs";

assert(process.env.HWPJS_TEST_WASM, "Explicit copy API candidate required");
const wasmBytes = readFileSync(process.env.HWPJS_TEST_WASM);
const strictInput = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp");
test("available section copy requires independent Boolean consent and complete optional ABI", async () => {
  for (const value of [null, 1, "true", [], {}])
    await assert.rejects(
      createExperimentalHwp5Editor(wasmBytes, strictInput, { availableSectionCopy: value }),
      /Invalid available section copy option/,
    );
  for (const options of [{ distribution: true }, { normalizeObservedCfb: true }])
    await assert.rejects(
      createExperimentalHwp5Editor(wasmBytes, strictInput, {
        ...options,
        availableSectionCopy: true,
      }),
      /ConflictingAvailableSectionCopyOptions/,
    );
  for (const name of [
    "hwp5_edit_open_available_section_copy",
    "hwp5_edit_available_section_copy_info",
  ]) {
    const masked = withoutNormalizationExport(wasmBytes, name);
    await assert.rejects(
      createExperimentalHwp5Editor(masked, strictInput, { availableSectionCopy: true }),
      /Hwp5AvailableSectionCopyAbiUnavailable/,
    );
    const editor = await createExperimentalHwp5Editor(masked, strictInput);
    try {
      assert.deepEqual(Buffer.from(editor.save().bytes), strictInput);
    } finally {
      editor.close();
    }
  }
});

test("copy report cannot claim recovered content or an original history baseline", () => {
  assert.equal(decodeAvailableSectionCopyInfo(Buffer.from("null")), null);
  for (const value of [
    {},
    [],
    { declared: 1, available: 1 },
    { declared: "2", available: 1 },
    { declared: 1025, available: 1 },
  ])
    assert.throws(() => decodeAvailableSectionCopyInfo(Buffer.from(JSON.stringify(value))));
  const result = decodeAvailableSectionCopyInfo(Buffer.from('{"declared":2,"available":1}'));
  assert.equal(result.historyBaseline, "available-sections-copy");
  assert.equal(result.missingContentRecovered, false);
  assert.equal(result.sectionInventory.mismatch, true);
});

for (const [name, , declared, available, , paragraphs] of sectionCountFixtures)
  test(`explicit copy editor opens stored sections without changing its original: ${name}`, async (t) => {
    const path = `reference/rhwp/samples/${name}`;
    if (!existsSync(path)) {
      t.skip("Reference fixture unavailable");
      return;
    }
    const input = readFileSync(path);
    await assert.rejects(
      createExperimentalHwp5Editor(wasmBytes, input),
      /RepairedSourceUnsupported|SectionCountMismatch/,
    );
    const editor = await createExperimentalHwp5Editor(wasmBytes, input, {
      availableSectionCopy: true,
    });
    try {
      assert.deepEqual(editor.normalizationInfo(), {
        normalized: true,
        historyBaseline: "available-sections-copy",
        deviations: null,
        sectionInventory: { declared, available, mismatch: true },
        missingContentRecovered: false,
      });
      assert.equal(editor.sectionCount(), available);
      let count = 0;
      for (let section = 0; section < available; section++) count += editor.paragraphCount(section);
      assert.equal(count, paragraphs);
      const baseline = editor.save().bytes;
      assert.notDeepEqual(Buffer.from(baseline), input);
      editor.enableHistory({ maxEntries: 4, maxCheckpointBytes: 16 * 1024 * 1024 });
      assert.equal(editor.undo(), false);
      assert.equal(editor.redo(), false);
      assert.deepEqual(editor.save().bytes, baseline);
      // Pinned real source positions after retained leading controls, not a
      // guessed insertion into control payloads or a relaxed editing policy.
      const offsets = [[8], [8, 16], [24]][
        sectionCountFixtures.findIndex((row) => row[0] === name)
      ];
      for (let section = 0; section < available; section++) {
        const before = editor.text(section, 0),
          at = offsets[section];
        assert(before.charCodeAt(at) >= 32);
        editor.splice({ section, paragraph: 0, startUnit: at, endUnit: at, text: "사본검증😀" });
        assert.equal(
          editor.text(section, 0),
          before.slice(0, at) + "사본검증😀" + before.slice(at),
        );
      }
      const changed = editor.save({ allowStaleLayout: true }).bytes;
      for (let section = 0; section < available; section++) assert.equal(editor.undo(), true);
      assert.deepEqual(editor.save().bytes, baseline);
      for (let section = 0; section < available; section++) assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, changed);
      const reopened = await createExperimentalHwp5Editor(wasmBytes, changed);
      try {
        assert.equal(reopened.normalizationInfo().historyBaseline, "original");
        assert.equal(reopened.sectionCount(), available);
        for (let section = 0; section < available; section++)
          assert.equal(reopened.text(section, 0), editor.text(section, 0));
      } finally {
        reopened.close();
      }
      assert.deepEqual(readFileSync(path), input);
    } finally {
      editor.close();
    }
    assert.throws(() => editor.normalizationInfo(), /EditorClosed/);
  });

test("failed native copy reopen preserves edited history and successful open resets report lifetime", async (t) => {
  const path = `reference/rhwp/samples/${sectionCountFixtures[0][0]}`;
  if (!existsSync(path)) {
    t.skip("Reference fixture unavailable");
    return;
  }
  const { instance } = await WebAssembly.instantiate(wasmBytes, {}),
    wasm = instance.exports;
  const memory = createMemory(wasm);
  const open = (fn, bytes) => memory.withBytes(bytes, (ptr, size) => fn(ptr, size));
  const query = (fn) => {
    assert.equal(fn(), 1);
    try {
      return memory.copy(wasm.hwp5_edit_output_ptr(), wasm.hwp5_edit_output_len());
    } finally {
      wasm.hwp5_edit_output_free();
    }
  };
  const report = () =>
    JSON.parse(new TextDecoder().decode(query(wasm.hwp5_edit_available_section_copy_info)));
  const save = () => query(() => wasm.hwp5_edit_save(1));
  try {
    assert.equal(open(wasm.hwp5_edit_open, strictInput), 1);
    assert.equal(wasm.hwp5_edit_history_enable(4, 16000000), 1);
    memory.withBytes(Buffer.from("원자성😀"), (ptr, len) =>
      assert.equal(wasm.hwp5_edit_splice(0, 0, 0, 0, ptr, len, 0), 1),
    );
    const changed = save(),
      revision = wasm.hwp5_edit_history_revision();
    assert(revision > 0 && revision !== 0xffffffff);
    for (const bad of [strictInput, Buffer.alloc(0), Buffer.alloc(512)]) {
      assert.equal(open(wasm.hwp5_edit_open_available_section_copy, bad), 0);
      assert.equal(report(), null);
      assert.equal(wasm.hwp5_edit_history_revision(), revision);
      assert.deepEqual(save(), changed);
    }
    assert.equal(wasm.hwp5_edit_open_available_section_copy(0, 64 * 1024 * 1024 + 1), 0);
    assert.deepEqual(save(), changed);
    assert.equal(wasm.hwp5_edit_undo(), 1);
    assert.equal(wasm.hwp5_edit_redo(), 1);
    assert.deepEqual(save(), changed);
    assert.equal(open(wasm.hwp5_edit_open_available_section_copy, readFileSync(path)), 1);
    const metadata = report(),
      baseline = save();
    assert.deepEqual(metadata, { declared: 2, available: 1 });
    assert.equal(wasm.hwp5_edit_normalization_info(), 0);
    assert.match(memory.error().message, /AvailableSectionCopyBaseline/);
    assert.equal(open(wasm.hwp5_edit_open_available_section_copy, Buffer.alloc(0)), 0);
    assert.deepEqual(report(), metadata);
    assert.deepEqual(save(), baseline);
    assert.equal(open(wasm.hwp5_edit_open, strictInput), 1);
    assert.equal(report(), null);
    assert.equal(wasm.hwp5_edit_normalization_info(), 1);
  } finally {
    wasm.hwp5_edit_close();
  }
  assert.equal(wasm.hwp5_edit_available_section_copy_info(), 0);
});
