import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "../../tools/oracle-process.mjs";
import { workerCanvasHarness } from "../canvas/worker-harness.mjs";
import { createFieldLinkDisplayGuard } from "../../web/preview/field-link-display-guard.mjs";

test("actual truncated field keeps preceding Canvas text editable and preserves the unresolved tail", async t => {
  const path = "reference/rhwp/samples/issue5729/stacked_tac_band_om_top.hwpx";
  if (!existsSync(path)) return t.skip("reference fixture not present");
  const source = readFileSync(path), h = await workerCanvasHarness(t, { paintFrames: true });
  const loaded = await h.send({ kind: "load", format: "hwpx", bytes: source });
  assert.equal(loaded.error, undefined); assert.equal(loaded.content.readOnly, false);
  const row = loaded.content.paragraphs.find(p => p.section === 0 && p.paragraph === 2);
  assert.equal(row.text, "한국잡월드"); assert.equal(row.plainEditable, true);
  const tail = loaded.content.paragraphs.find(p => p.section === 0 && p.paragraph === 31);
  assert.equal(tail.editable, false); assert.equal(tail.fieldReadOnlyReason, "InvalidFieldLinks");
  assert.equal((await h.send({ kind: "enable" })).error, undefined);
  assert.equal(h.controller.selectTextRange({ section: 0, paragraph: 2, startUnit: 0, endUnit: 0 }), true);
  const prefix = "앞문단😀<&";
  assert.equal(h.controller.replaceSelectedText(prefix), true);
  assert.equal((await h.flush()).error, undefined);
  const saved = Buffer.from((await h.send({ kind: "save" })).bytes);
  for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], {
    input: JSON.stringify({ mode: "plain_text", before: source.toString("base64"), after: saved.toString("base64"), section: 0, paragraph: 3, text: prefix }), timeout: 30000,
  });
  assert.equal((await h.send({ kind: "undo" })).changed, true);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), source);
  const refused = await h.send({ kind: "splice", section: 0, paragraph: 31, startUnit: 0, endUnit: 0, text: "X" });
  assert.equal(refused.error, "InvalidFieldLinks");
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), source);
  assert.equal((await h.send({ kind: "redo" })).changed, true);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), saved);
  const reopened = await h.send({ kind: "load", format: "hwpx", bytes: saved });
  assert.equal(reopened.error, undefined);
  assert.equal(reopened.content.paragraphs.find(p => p.paragraph === 2).text, prefix + row.text);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), saved);
  assert.deepEqual(readFileSync(path), source);
});

test("field link display guard caches only native link refusal per section and request", () => {
  const guard = createFieldLinkDisplayGuard();
  let calls = 0;
  assert.equal(guard.read(2, () => { calls++; throw new Error("InvalidFieldLinks"); }, false), false);
  assert.equal(guard.read(2, () => { calls++; return true; }, false), false);
  assert.equal(calls, 1);
  assert.equal(guard.reason(2), "InvalidFieldLinks");
  assert.equal(guard.read(3, () => true, false), true);
  assert.equal(guard.reason(3), null);
  assert.equal(createFieldLinkDisplayGuard().read(2, () => true, false), true);
  for (const message of ["OutOfMemory", "LimitExceeded", "InvalidParagraphIndex", "InvalidFieldLink"]) {
    const error = new Error(message);
    assert.throws(() => guard.read(4, () => { throw error; }, false), value => value === error);
    assert.equal(guard.reason(4), null);
  }
});

test("field link refusal in label scope cannot revoke a proven plain query", () => {
  const guard = createFieldLinkDisplayGuard();
  assert.equal(guard.read(2, () => { throw new Error("InvalidFieldLinks"); }, [], "labels").length, 0);
  let calls = 0;
  assert.equal(guard.read(2, () => { calls++; return true; }, false, "plain"), true);
  assert.equal(calls, 1);
  assert.equal(guard.reason(2), "InvalidFieldLinks");
  assert.equal(guard.read(2, () => { throw new Error("should remain cached"); }, null, "labels"), null);
  assert.equal(guard.read(2, () => false, false, "plain"), false);
  assert.equal(guard.read(2, () => true, false, "plain"), true, "a false permission is not a global refusal");
  assert.equal(guard.read(2, () => "proven anchor", null, "anchor"), "proven anchor");
  const oom = new Error("OutOfMemory");
  assert.throws(() => guard.read(2, () => { throw oom; }, null, "styles"), error => error === oom);
});

function unclosedField() {
  return execFileSync("python3", ["-c", `
import io,re,sys,zipfile
source=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
out=io.BytesIO()
with zipfile.ZipFile(out,'w') as saved:
 for entry in source.infolist():
  data=source.read(entry.filename)
  if entry.filename=='Contents/section0.xml':
   data,count=re.subn(rb'<hp:fieldEnd\\b[^>]*/>',b'',data,count=1)
   if count!=1:raise ValueError('Missing source field end')
  saved.writestr(entry,data)
sys.stdout.buffer.write(out.getvalue())
`], { input: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx"), timeout: 30000 });
}

test("unclosed field stays visible and read-only without repairing saved source", async t => {
  const source = unclosedField(), h = await workerCanvasHarness(t, { paintFrames: true });
  const loaded = await h.send({ kind: "load", format: "hwpx", bytes: source });
  assert.equal(loaded.error, undefined);
  assert.equal(loaded.content.readOnly, true);
  assert(loaded.content.paragraphs.some(p => p.fieldReadOnlyReason === "InvalidFieldLinks"));
  assert(loaded.content.paragraphs.every(p => !p.editable && !p.anchorEditable && !p.plainEditable && p.fieldLabels.length === 0));
  assert.equal((await h.send({ kind: "enable" })).error, undefined);
  assert.equal(h.controller.selectTextRange({ section: 0, paragraph: 0, startUnit: 0, endUnit: 0 }), false);
  assert.equal(h.input.readOnly, true);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), source);
  const refused = await h.send({ kind: "splice", section: 0, paragraph: 0, startUnit: 0, endUnit: 0, text: "X" });
  assert.equal(refused.error, "InvalidFieldLinks");
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), source);
  assert.equal((await h.send({ kind: "undo" })).changed, false);
  const valid = await h.send({ kind: "load", format: "hwpx", bytes: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx") });
  assert.equal(valid.error, undefined);
  assert.equal(valid.content.readOnly, false);
  assert(valid.content.paragraphs.some(p => p.fieldLabels.length > 0));
});
