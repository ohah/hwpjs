import assert from "node:assert/strict";
import test from "node:test";
import { fixturePaths, exerciseEditor, verifySaved, marker } from "../../tools/hwp5-edit-corpus-lib.mjs";

test("corpus inventory includes HWP and HWPX fixtures, not just preferred names", () => {
  assert.deepEqual(fixturePaths(["a/fixtures/table.HWP", "a/fixtures/x.hwpx", "a/fixtures/table.HWP", "reference/test.hwp", "a/fixtures/x.html"]), ["a/fixtures/table.HWP", "a/fixtures/x.hwpx"]);
});
function editor({ ignore = false, mutateOnError = false } = {}) {
  const texts = [Buffer.from("A\r", "utf16le"), Buffer.from("B\r", "utf16le")];
  let changed = false;
  return {
    sectionCount: () => 1, paragraphCount: () => 2,
    copyText: (_, p) => Buffer.from(texts[p]),
    splice({ paragraph }) {
      if (paragraph === 1) { if (mutateOnError) texts[1] = Buffer.alloc(0); throw new Error("UnsupportedNestedParagraph"); }
      if (!ignore) { texts[0] = Buffer.concat([Buffer.from(marker, "utf16le"), texts[0]]); changed = true; }
    },
    save(options = {}) { if (changed && !options.allowStaleLayout) throw new Error("LayoutReflowRequired"); return { bytes: Buffer.alloc(0), layoutRequiresReflow: changed }; },
  };
}
const expected = () => new Map([[0, [Buffer.from("A\r", "utf16le"), Buffer.from("B\r", "utf16le")]]]);
test("history corpus rejects lying undo redo and stale layout restoration", () => {
  const make = fault => {
    let text = Buffer.from("A\r", "utf16le"), changed = false, before, after;
    return {
      enableHistory() {}, sectionCount: () => 1, paragraphCount: () => 1,
      copyText: () => Buffer.from(text),
      splice() { before = Buffer.from(text); text = Buffer.concat([Buffer.from(marker, "utf16le"), text]); after = Buffer.from(text); changed = true; },
      undo() { if (fault !== "undo") text = Buffer.from(before); if (fault !== "layout") changed = false; return true; },
      redo() { if (fault !== "redo") text = Buffer.from(after); changed = true; return true; },
      save(options = {}) {
        if (changed && !options.allowStaleLayout) throw new Error("LayoutReflowRequired");
        return { bytes: Buffer.from(text), layoutRequiresReflow: changed };
      },
    };
  };
  const source = () => new Map([[0, [Buffer.from("A\r", "utf16le")]]]);
  assert.equal(exerciseEditor(make(), source(), { history: true }).historyVerified, 1);
  for (const fault of ["undo", "layout"]) assert.throws(() => exerciseEditor(make(fault), source(), { history: true }), /undo differs/);
  assert.throws(() => exerciseEditor(make("redo"), source(), { history: true }), /redo differs/);
});
test("corpus exercises actual insertion and counts rejection, not no-op eligibility", () => {
  const result = exerciseEditor(editor(), expected());
  assert.equal(result.attempted, 2); assert.equal(result.edited, 1);
  assert.deepEqual(result.failures, { UnsupportedNestedParagraph: 1 });
});
test("corpus detects ignored successful command and mutation on refusal", () => {
  assert.throws(() => exerciseEditor(editor({ ignore: true }), expected()), /accepted edit did not insert marker/);
  assert.throws(() => exerciseEditor(editor({ mutateOnError: true }), expected()), /refused edit mutated paragraph/);
});
test("saved oracle detects missing streams and changed non-body stream", () => {
  const header = Buffer.alloc(40), original = new Map([["FileHeader", header], ["Witness", Buffer.from("keep")]]);
  assert.throws(() => verifySaved(original, new Map([["FileHeader", header]]), new Map()), /stream inventory changed/);
  assert.throws(() => verifySaved(original, new Map([["FileHeader", header], ["Witness", Buffer.from("lost")]]), new Map()), /unselected stream Witness/);
});
test("saved oracle detects a wrong paragraph and loss of an entire section", () => {
  const record = (tag, level, payload) => {
    const header = Buffer.alloc(4); header.writeUInt32LE((tag | (level << 10) | (payload.length << 20)) >>> 0);
    return Buffer.concat([header, payload]);
  };
  const header = Buffer.alloc(40), text = Buffer.from("A\r", "utf16le");
  const raw = Buffer.concat([record(66, 0, Buffer.alloc(0)), record(67, 1, text)]);
  const before = new Map([["FileHeader", header], ["BodyText/Section0", raw]]);
  verifySaved(before, before, new Map([[0, [text]]]));
  assert.throws(() => verifySaved(before, before, new Map([[0, [Buffer.from("WRONG\r", "utf16le")]]])), /paragraph text bytes/);
  assert.throws(() => verifySaved(before, before, new Map()), /section inventory changed/);
});
