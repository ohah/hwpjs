import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { validateHwp5TextSourceProtection as validate } from "../../js/hwp5-text-source-protection.mjs";
assert(process.env.HWPJS_TEST_WASM, "Explicit protection candidate required");
const wasm = readFileSync(process.env.HWPJS_TEST_WASM);

test("native extra protection identifies actual retained fields without mutating source or history", async () => {
  const input = readFileSync("reference/rhwp/samples/issue1921/59043_regulatory_analysis.hwp");
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory();
    assert.equal(editor.supportsTextSourceProtection(), true);
    const value = editor.textSourceProtection(0);
    assert.equal(value.mode, "retained_click");
    assert.equal(value.retained_headers, 29);
    assert.equal(value.protected_paragraphs.length, editor.paragraphCount(0));
    assert.equal(value.protected_paragraphs[0], false);
    assert.equal(value.protected_paragraphs[52], true);
    assert.throws(() => editor.validateTextSourcePolicy(0), /UnsupportedCrossParagraphField/);
    assert.deepEqual(editor.textSourceProtection(0), value);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.undo(), false);
    assert.equal(editor.redo(), false);
    for (const section of [-1, NaN, Infinity, 0.5, 2 ** 32, "0"])
      assert.throws(() => editor.textSourceProtection(section), /Invalid section/);
    assert.throws(() => editor.textSourceProtection(editor.sectionCount()), /InvalidSection/);
  } finally {
    editor.close();
  }
  assert.throws(() => editor.textSourceProtection(0), /EditorClosed/);
});
test("strict extra protection follows current paragraph count and preserves pending redo", async () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp");
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory();
    const before = editor.textSourceProtection(0);
    assert.equal(before.mode, "strict");
    assert.equal(before.retained_headers, null);
    assert(before.protected_paragraphs.every((value) => value === false));
    editor.splitParagraph({ section: 0, paragraph: 1, atUnit: 0 });
    assert.equal(
      editor.textSourceProtection(0).protected_paragraphs.length,
      before.protected_paragraphs.length + 1,
    );
    assert.equal(editor.undo(), true);
    assert.deepEqual(editor.textSourceProtection(0), before);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.redo(), true);
  } finally {
    editor.close();
  }
});
test("protection wire rejects malformed modes sparse bits counts and false retention", () => {
  const value = () => ({
    mode: "retained_click",
    protected_paragraphs: [false, true],
    retained_headers: 1,
  });
  assert.deepEqual(validate(value(), 2), value());
  const mutations = [
    (v) => {
      v.mode = "unknown";
    },
    (v) => {
      v.protected_paragraphs = [false];
    },
    (v) => {
      v.protected_paragraphs[1] = 1;
    },
    (v) => {
      delete v.protected_paragraphs[1];
    },
    (v) => {
      v.retained_headers = 0;
    },
    (v) => {
      v.retained_headers = null;
    },
    (v) => {
      v.protected_paragraphs[1] = false;
    },
    (v) => {
      v.mode = "strict";
      v.retained_headers = null;
    },
  ];
  for (const mutate of mutations) {
    const v = value();
    mutate(v);
    assert.throws(() => validate(v, 2), /InvalidHwp5TextSourceProtection/);
  }
});
test("missing optional protection export is explicit and cannot mutate a legacy session", async () => {
  const old = Buffer.from(wasm),
    name = "hwp5_edit_text_source_protection",
    at = old.indexOf(name);
  assert(at >= 0);
  old[at] = "x".charCodeAt(0);
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp"),
    editor = await createExperimentalHwp5Editor(old, input);
  try {
    assert.equal(editor.supportsTextSourceProtection(), false);
    assert.throws(() => editor.textSourceProtection(0), /Hwp5TextSourceProtectionAbiUnavailable/);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
  } finally {
    editor.close();
  }
});
