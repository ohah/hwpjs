import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";

const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx");

test("actual field-hosted table keeps protected width and independent XML through prefix and history", async () => {
  const original = readFileSync("reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx");
  const editor = await createHwpxEditor(candidate());
  try {
    editor.open(original); editor.enableHistory();
    const labels = editor.fieldLabels(0, 17);
    assert.equal(labels.length, 1);
    const field = labels[0];
    assert.deepEqual(editor.fieldRangeTarget(0, 17, 0, 0), field);
    assert.equal(editor.fieldLabelDisplayText(0, 17), "\ufffc");
    assert.equal(editor.canEdit(0, 17), false);
    assert.equal(editor.fieldRangeTarget(0, 17, 0, 1), null, "query cannot grant deletion of the table");
    assert.throws(() => editor.spliceFieldLabel(0, 17, field.beginElement, 0, 1, ""), /ProtectedInlineControl/);
    assert.deepEqual(Buffer.from(editor.save()), original);
    assert.equal(editor.undo(), false);
    editor.spliceFieldLabel(0, 17, field.beginElement, 0, 0, "앞😀");
    assert.equal(editor.fieldLabelDisplayText(0, 17), "앞😀\ufffc");
    const saved = Buffer.from(editor.save());
    const request = { before: original.toString("base64"), after: saved.toString("base64"), section: 0, paragraph: 17, text: "앞😀", mode: "anchored" };
    for (const flags of [[], ["-O"]]) {
      const verify = value => execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], { input: JSON.stringify(value), stdio: ["pipe", "pipe", "pipe"], timeout: 30000 });
      verify(request);
      assert.throws(() => verify({ ...request, text: "wrong" }), error => error.status === 1 && /complete XML mismatch/.test(String(error.stderr)));
    }
    const reopened = await createHwpxEditor(candidate());
    try { reopened.open(saved); assert.equal(reopened.fieldLabelDisplayText(0, 17), "앞😀\ufffc"); }
    finally { reopened.close(); }
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), original);
    assert.throws(() => editor.spliceFieldLabel(0, 17, field.beginElement, 0, 1, ""), /ProtectedInlineControl/);
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), saved);
  } finally { editor.close(); }
});
function candidate() {
  assert(process.env.HWPJS_TEST_WASM, "Explicit field query candidate required");
  return readFileSync(process.env.HWPJS_TEST_WASM);
}

test("original hyperlink queries share current label coordinates without changing saved bytes or history", async () => {
  const editor = await createHwpxEditor(candidate());
  const { fieldRangeTarget } = editor;
  try {
    editor.open(input); editor.enableHistory();
    for (const [paragraph, display] of [[1, "하이퍼링크 테스트 naver.com"], [3, "align.hwp"], [5, "문서의처음"], [7, "전자우편"]]) {
      const labels = editor.fieldLabels(0, paragraph);
      assert.equal(labels.length, 1);
      const label = labels[0];
      assert.deepEqual(fieldRangeTarget(0, paragraph, label.start, label.end), label);
      assert.equal(editor.fieldLabelDisplayText(0, paragraph), display);
      assert.deepEqual(Buffer.from(editor.save()), input);
    }
    assert.equal(fieldRangeTarget(0, 1, 10, 11), null, "outside spelling is not field permission");
    assert.equal(editor.undo(), false, "queries must not publish checkpoints");
    const begin = editor.fieldLabels(0, 3)[0].beginElement;
    editor.spliceFieldLabel(0, 3, begin, 0, 0, "앞😀");
    const saved = Buffer.from(editor.save());
    assert.equal(editor.fieldLabelDisplayText(0, 3), "앞😀align.hwp");
    assert.deepEqual(fieldRangeTarget(0, 3, 0, 3), { beginElement: begin, start: 0, end: 12 });
    assert.throws(() => fieldRangeTarget(0, 3, 2, 2), /SplitSurrogatePair/);
    assert.throws(() => editor.spliceFieldLabel(0, 3, begin, 2, 0, "x"), /SplitSurrogatePair/);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.throws(() => fieldRangeTarget(0, 3, 2, 1), /InvalidTextPosition/);
    assert.throws(() => fieldRangeTarget(0, 3, NaN, 1), /InvalidInteger/);
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), saved);
  } finally { editor.close(); }
  assert.throws(() => fieldRangeTarget(0, 3, 0, 0), /EditorClosed/);
});

test("split hyperlink display and target queries follow both current owned paragraphs", async () => {
  const editor = await createHwpxEditor(candidate());
  try {
    editor.open(input); editor.enableHistory();
    editor.splitParagraph({ section: 0, paragraph: 3, atUnit: 4 });
    const split = Buffer.from(editor.save());
    for (const [paragraph, display] of [[3, "alig"], [4, "n.hwp"]]) {
      assert.equal(editor.fieldLabelDisplayText(0, paragraph), display);
      const label = editor.fieldLabels(0, paragraph)[0];
      assert.deepEqual(editor.fieldRangeTarget(0, paragraph, 0, display.length), label);
      assert.deepEqual(Buffer.from(editor.save()), split);
    }
    const label = editor.fieldLabels(0, 4)[0];
    editor.spliceFieldLabel(0, 4, label.beginElement, 0, 0, "한😀");
    const edited = Buffer.from(editor.save());
    assert.equal(editor.fieldLabelDisplayText(0, 4), "한😀n.hwp");
    assert.throws(() => editor.fieldRangeTarget(0, 4, 2, 2), /SplitSurrogatePair/);
    assert.deepEqual(Buffer.from(editor.save()), edited);
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), split);
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), split);
  } finally { editor.close(); }
});

test("field display preserves leading BOM and refuses invalid owners without losing redo", async () => {
  const editor = await createHwpxEditor(candidate());
  const { fieldLabelDisplayText } = editor;
  try {
    editor.open(input); editor.enableHistory();
    const field = editor.fieldLabels(0, 3)[0];
    editor.spliceFieldLabel(0, 3, field.beginElement, 0, 0, "\ufeff😀");
    const saved = Buffer.from(editor.save());
    assert.equal(fieldLabelDisplayText(0, 3), "\ufeff😀align.hwp");
    assert.deepEqual(editor.fieldRangeTarget(0, 3, 0, 3), { ...field, end: field.end + 3 });
    assert.throws(() => editor.fieldRangeTarget(0, 3, 2, 2), /SplitSurrogatePair/);
    assert.equal(editor.undo(), true);
    assert.throws(() => fieldLabelDisplayText(1, 3), /InvalidSectionIndex/);
    assert.throws(() => fieldLabelDisplayText(0, 0), /InvalidParagraphIndex/);
    assert.throws(() => editor.fieldRangeTarget(0, 0, 0, 0), /InvalidParagraphIndex/);
    assert.throws(() => editor.fieldRangeTarget(0, 3, -1, 0), /InvalidInteger/);
    assert.throws(() => editor.fieldRangeTarget(0, 3, 0, 0x100000000), /InvalidInteger/);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), saved);
  } finally { editor.close(); }
  assert.throws(() => fieldLabelDisplayText(0, 3), /EditorClosed/);
});
