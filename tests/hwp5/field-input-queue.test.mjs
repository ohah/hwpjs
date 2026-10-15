import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "../../tools/oracle-process.mjs";
import { workerCanvasHarness, dispatchCanvasEvent } from "../canvas/worker-harness.mjs";
import { inspect, expectedSection, paragraphRecords, records } from "./style-preservation/text-record-oracle.mjs";
import { independentFieldSpans } from "./field-span-oracle.mjs";

test("an old document permission reply cannot authorize the same coordinates in a replacement document", async t => {
  assert(process.env.HWPJS_TEST_WASM, "explicit candidate required");
  const instantiate = WebAssembly.instantiate;
  t.mock.method(WebAssembly, "instantiate", async (...args) => {
    const instance = await instantiate(...args), exports = { ...instance.exports }; delete exports.hwpx_edit_created_table_field_label_mode;
    return { exports };
  });
  const h = await workerCanvasHarness(t, { rangeQueries: true });
  const bytes = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx");
  const load = async () => {
    assert.equal((await h.send({ kind: "load", format: "hwpx", bytes })).error, undefined);
    assert.equal((await h.send({ kind: "enable" })).error, undefined);
    const created = await h.send({ kind: "insert-table", section: 0, paragraph: 1, unit: 0, options: { rows: 1, columns: 1, width: 36000, rowHeight: 6000, resources: { paragraph: 1, character: 1, style: 0, border_fill: 1 } } });
    assert.equal(created.error, undefined); assert.equal(created.content.paragraphs.find(row => row.paragraph === 1).editable, false);
  };
  await load();
  assert.equal(h.controller.selectTextRange({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0 }), true);
  const old = await h.flush(false); assert.equal(old.kind, "query-edit-range"); assert.equal(old.allowed, true);
  await load();
  const baseline = (await h.send({ kind: "save" })).bytes;
  assert.equal(h.controller.selectTextRange({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0 }), true);
  assert.equal(h.input.readOnly, true);
  const freshRequest = h.requests.at(-1); assert.equal(freshRequest.kind, "query-edit-range"); assert(freshRequest.requestId > old.requestId);
  h.controller.message(old);
  assert.equal(h.input.readOnly, true, "stale allowed=true must not unlock the replacement document");
  assert.equal(dispatchCanvasEvent(h.input, "beforeinput", { inputType: "insertText", data: "bad" }).defaultPrevented, true);
  const current = await h.flush(); assert.equal(current.allowed, true); assert.equal(h.input.readOnly, false);
  assert.deepEqual((await h.send({ kind: "save" })).bytes, baseline);
  const text = h.input.value;
  dispatchCanvasEvent(h.input, "beforeinput", { inputType: "insertText", data: "x" });
  h.input.value = "x" + text; h.input.setSelectionRange(1, 1); dispatchCanvasEvent(h.input, "input");
  assert.equal((await h.flush()).error, undefined); await h.flushQueries(); assert.equal(h.input.value, "x" + text);
});

test("the independent hyperlink scope oracle rejects forged header and end identities", () => {
  const section = inspect(readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwp")).sections[0].bytes;
  const fields = independentFieldSpans(section), all = records(section);
  assert.equal(fields.length, 4); assert.deepEqual(fields[0].begin, { paragraph: 0, unit: 24 }); assert.deepEqual(fields[0].end, { paragraph: 0, unit: 33 });
  const header = all[fields[0].source_node], forgedHeader = Buffer.from(section);
  forgedHeader.writeUInt32LE(0x25636c6b, header.start + header.raw.length - header.payload.length);
  assert.throws(() => independentFieldSpans(forgedHeader), /independent field header mismatch/);
  const owner = paragraphRecords(section, 0), text = owner.direct.find(row => row.tag === 67 && row.level === owner.head.level + 1), forgedEnd = Buffer.from(section);
  forgedEnd.writeUInt32LE(0xffffffff, text.start + text.raw.length - text.payload.length + fields[0].end.unit * 2 + 2);
  assert.throws(() => independentFieldSpans(forgedEnd), /independent field end mismatch/);
});

for (const composition of [false, true]) test(`queued exterior ${composition ? "composition" : "input"} without the optional created-table mode ABI waits for native range permission`, async t => {
  assert(process.env.HWPJS_TEST_WASM, "explicit candidate required");
  const instantiate = WebAssembly.instantiate;
  t.mock.method(WebAssembly, "instantiate", async (...args) => {
    const instance = await instantiate(...args), exports = { ...instance.exports };
    delete exports.hwpx_edit_created_table_field_label_mode;
    return { exports };
  });
  const h = await workerCanvasHarness(t, { rangeQueries: true });
  const source = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx");
  const loaded = await h.send({ kind: "load", format: "hwpx", bytes: source }); assert.equal(loaded.error, undefined);
  assert.equal((await h.send({ kind: "enable" })).error, undefined);
  const created = await h.send({ kind: "insert-table", section: 0, paragraph: 1, unit: 0, options: { rows: 1, columns: 1, width: 36000, rowHeight: 6000, resources: { paragraph: 1, character: 1, style: 0, border_fill: 1 } } });
  assert.equal(created.error, undefined);
  const input = Buffer.from((await h.send({ kind: "save" })).bytes);
  const original = created.content.paragraphs.find(row => row.section === 0 && row.paragraph === 1);
  assert.equal(original.editable, false); assert.equal(original.selectable, true);
  assert.equal(h.controller.selectTextRange({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0 }), true);
  await h.flushQueries(); assert.equal(h.input.readOnly, false);
  const start = h.requests.length;
  let draft = original.text;
  const type = (caret, end = caret) => {
    h.input.setSelectionRange(caret, end);
    assert.equal(dispatchCanvasEvent(h.input, "beforeinput", { inputType: "insertText", data: "가" }).defaultPrevented, false, `draft insertion at ${caret}`);
    draft = draft.slice(0, caret) + "가" + draft.slice(end); h.input.value = draft;
    h.input.setSelectionRange(caret + 1, caret + 1); dispatchCanvasEvent(h.input, "input");
  };
  type(0); type(1);
  assert.equal((await h.flush()).error, undefined);
  assert.equal(h.requests.at(-1).kind, "query-edit-range");
  assert.equal(h.input.readOnly, false, "native permission latency must not disable the already active draft");
  if (composition) {
    h.input.setSelectionRange(0, 0); dispatchCanvasEvent(h.input, "compositionstart");
    dispatchCanvasEvent(h.input, "beforeinput", { inputType: "insertCompositionText", data: "ㄱ", isComposing: true });
    h.input.value = "ㄱ" + draft; h.input.setSelectionRange(1, 1); dispatchCanvasEvent(h.input, "input", { isComposing: true });
    await h.flushQueries();
    assert.equal(h.requests.slice(start).filter(row => row.kind === "splice").length, 1, "range permission must not commit intermediate composition");
    draft = "가" + draft; h.input.value = draft; h.input.setSelectionRange(1, 1);
    dispatchCanvasEvent(h.input, "input", { isComposing: true }); dispatchCanvasEvent(h.input, "compositionend", { data: "가" }); await Promise.resolve();
  } else type(0);
  assert.equal(h.requests.slice(start).filter(row => row.kind === "splice").length, 1, "unverified draft must not submit a native splice");
  await h.flushQueries(); assert.equal((await h.flush()).error, undefined);
  await h.flushQueries(); assert.equal((await h.flush()).error, undefined);
  await h.flushQueries();
  assert.deepEqual(h.requests.slice(start).filter(row => row.kind === "splice").map(row => row.startUnit), [0, 1, 0]);
  const saved = await h.send({ kind: "save" }); assert.equal(saved.error, undefined);
  for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-field-outside-oracle.py"], {
    input: JSON.stringify({ before: input.toString("base64"), after: Buffer.from(saved.bytes).toString("base64"), part: "Contents/section0.xml", paragraph: 2, prefix: "가가가" }), timeout: 30000,
  });
  for (let index = 0; index < 3; index++) { assert.equal(h.controller.history("undo"), true); assert.equal((await h.flush()).error, undefined); await h.flushQueries(); }
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
  assert.equal(h.controller.selectTextRange({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0 }), true);
  await h.flushQueries(); draft = original.text;
  assert.equal(h.input.readOnly, false, "restored selection must not retain an unsent permission request");
  const refusalStart = h.requests.length;
  type(0);
  if (composition) {
    h.input.setSelectionRange(6, 12); dispatchCanvasEvent(h.input, "compositionstart");
    dispatchCanvasEvent(h.input, "beforeinput", { inputType: "insertCompositionText", data: "가", isComposing: true });
    h.input.value = draft.slice(0, 6) + "가" + draft.slice(12); h.input.setSelectionRange(7, 7); dispatchCanvasEvent(h.input, "input", { isComposing: true });
  } else type(6, 12); // This selection crosses the exterior/field boundary.
  assert.equal((await h.flush()).error, undefined); await h.flushQueries();
  if (composition) { dispatchCanvasEvent(h.input, "compositionend", { data: "가" }); await Promise.resolve(); }
  assert.equal(h.requests.slice(refusalStart).filter(row => row.kind === "splice").length, 1);
  assert(h.requests.slice(refusalStart).some(row => row.kind === "query-edit-range" && row.startUnit === 6 && row.endUnit === 12));
  assert.equal(h.input.value, "가" + original.text);
  const refused = await h.send({ kind: "save" }); assert.equal(refused.error, undefined);
  execFileSync("python3", ["tools/hwpx-field-outside-oracle.py"], {
    input: JSON.stringify({ before: input.toString("base64"), after: Buffer.from(refused.bytes).toString("base64"), part: "Contents/section0.xml", paragraph: 2, prefix: "가" }), timeout: 30000,
  });
});

test("native field range permits a label edit without the optional created-table mode ABI", async t => {
  assert(process.env.HWPJS_TEST_WASM, "explicit candidate required");
  const instantiate = WebAssembly.instantiate;
  t.mock.method(WebAssembly, "instantiate", async (...args) => {
    const instance = await instantiate(...args), exports = { ...instance.exports };
    delete exports.hwpx_edit_created_table_field_label_mode;
    return { exports };
  });
  const h = await workerCanvasHarness(t, { rangeQueries: true });
  const source = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx");
  assert.equal((await h.send({ kind: "load", format: "hwpx", bytes: source })).error, undefined);
  assert.equal((await h.send({ kind: "enable" })).error, undefined);
  const created = await h.send({ kind: "insert-table", section: 0, paragraph: 1, unit: 0, options: { rows: 1, columns: 1, width: 36000, rowHeight: 6000, resources: { paragraph: 1, character: 1, style: 0, border_fill: 1 } } });
  assert.equal(created.error, undefined);
  const input = Buffer.from((await h.send({ kind: "save" })).bytes);
  const original = created.content.paragraphs.find(row => row.section === 0 && row.paragraph === 1);
  assert.equal(h.controller.selectTextRange({ section: 0, paragraph: 1, startUnit: 12, endUnit: 12 }), true);
  await h.flushQueries(); assert.equal(h.input.readOnly, false);
  const start = h.requests.length;
  assert.equal(dispatchCanvasEvent(h.input, "beforeinput", { inputType: "insertText", data: "가" }).defaultPrevented, false);
  h.input.value = original.text.slice(0, 12) + "가" + original.text.slice(12);
  h.input.setSelectionRange(13, 13); dispatchCanvasEvent(h.input, "input");
  assert.equal((await h.flush()).error, undefined); await h.flushQueries();
  assert.deepEqual(h.requests.slice(start).filter(row => row.kind === "splice").map(row => row.startUnit), [12]);
  const saved = await h.send({ kind: "save" }); assert.equal(saved.error, undefined);
  const payload = { before: input.toString("base64"), after: Buffer.from(saved.bytes).toString("base64"), text: "가", paragraph: 2, atUnit: 5 };
  for (const flags of [[], ["-O"]]) {
    const verify = data => execFileSync("python3", [...flags, "tools/hwpx-field-edit-oracle.py"], { input: JSON.stringify(data), timeout: 30000 });
    verify(payload);
    assert.throws(() => verify({ ...payload, atUnit: 4 }), error => error.status === 1 && String(error.stderr).includes("Unexpected XML change"));
  }
  assert.equal(h.controller.history("undo"), true); assert.equal((await h.flush()).error, undefined); await h.flushQueries();
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
  assert.equal(h.controller.history("redo"), true); assert.equal((await h.flush()).error, undefined); await h.flushQueries();
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), Buffer.from(saved.bytes));
});

for (const format of ["hwp5", "hwpx"]) test(`queued ${format} hyperlink content preserves field ownership and rejects a protected range`, async t => {
  assert(process.env.HWPJS_TEST_WASM, "explicit candidate required");
  const input = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.${format === "hwp5" ? "hwp" : "hwpx"}`);
  const h = await workerCanvasHarness(t);
  const loaded = await h.send({ kind: "load", format, bytes: input }); assert.equal(loaded.error, undefined);
  assert.equal((await h.send({ kind: "enable" })).error, undefined);
  const paragraph = loaded.content.paragraphs.find(row => row.section === 0 && row.paragraph === 0);
  assert(paragraph?.editable);
  let displayStart, sourceStart, source;
  if (format === "hwp5") {
    source = inspect(input);
    const field = independentFieldSpans(source.sections[0].bytes).find(row => row.field_id === 0x25686c6b);
    assert(field); assert.equal(field.begin.paragraph, 0); sourceStart = field.begin.unit;
    const owner = paragraphRecords(source.sections[0].bytes, 0), text = owner.direct.find(row => row.tag === 67 && row.level === owner.head.level + 1).payload;
    displayStart = 0;
    for (let unit = 0; unit < sourceStart; displayStart++) {
      const code = text.readUInt16LE(unit * 2); unit += code >= 1 && code <= 23 && code !== 10 && code !== 13 ? 8 : 1;
      assert(unit <= sourceStart);
    }
    assert.equal(paragraph.text[displayStart - 1], "«");
  } else {
    // The actual fixture has its first label at the beginning of the paragraph.
    assert.equal(paragraph.fieldLabels[0].start, 0); sourceStart = displayStart = 0;
  }
  assert.equal(h.controller.selectTextRange({ section: 0, paragraph: 0, startUnit: displayStart, endUnit: displayStart }), true);
  const start = h.requests.length, steps = [];
  let draft = paragraph.text;
  for (const offset of [0, 0, 1]) {
    const at = displayStart + offset; h.input.setSelectionRange(at, at);
    assert.equal(dispatchCanvasEvent(h.input, "beforeinput", { inputType: "insertText", data: "가" }).defaultPrevented, false);
    draft = draft.slice(0, at) + "가" + draft.slice(at); steps.push({ display: at, source: sourceStart + offset, after: draft });
    h.input.value = draft; h.input.setSelectionRange(at + 1, at + 1); dispatchCanvasEvent(h.input, "input");
  }
  assert.equal(h.requests.length, start + 1);
  for (const step of steps) assert.equal((await h.flush()).error, undefined, step.after);
  assert.deepEqual(h.requests.slice(start).map(({ startUnit, endUnit, text }) => ({ startUnit, endUnit, text })), steps.map(step => ({ startUnit: step.source, endUnit: step.source, text: "가" })));
  const save = async () => { const reply = await h.send({ kind: "save", allowStaleLayout: true }); assert.equal(reply.error, undefined); return reply.bytes; };
  const saved = await save();
  if (format === "hwp5") {
    let expected = source.sections[0].bytes;
    for (const step of steps) expected = expectedSection(expected, 0, step.source, step.source, "가");
    const after = inspect(saved); assert.deepEqual(after.sections[0].bytes, expected); assert.deepEqual(after.metadata, source.metadata);
    for (const [path, bytes] of source.streams) if (path !== source.sections[0].path) assert.deepEqual(after.streams.get(path), bytes, path);
  } else {
    const identity = execFileSync("python3", ["-c", "import base64,io,sys,zipfile,xml.etree.ElementTree as E; z=zipfile.ZipFile(io.BytesIO(base64.b64decode(sys.stdin.read(),validate=True))); p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'; print(next(E.fromstring(z.read('Contents/section0.xml')).iter(p+'fieldBegin')).get('id'))"], { input: input.toString("base64"), encoding: "utf8", timeout: 30000 }).trim();
    for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-nested-field-edit-oracle.py"], { input: JSON.stringify({ before: input.toString("base64"), after: Buffer.from(saved).toString("base64"), paragraph: 1, beginId: identity, text: "가가가" }), timeout: 30000 });
  }
  for (let index = 2; index >= 0; index--) { assert.equal(h.controller.history("undo"), true); assert.equal((await h.flush()).error, undefined); assert.equal(h.input.value, index ? steps[index - 1].after : paragraph.text); }
  assert.deepEqual(Buffer.from(await save()), input);
  for (const step of steps) { assert.equal(h.controller.history("redo"), true); assert.equal((await h.flush()).error, undefined); assert.equal(h.input.value, step.after); }
  assert.deepEqual(await save(), saved);
  const first = format === "hwp5" ? displayStart - 1 : 0, last = format === "hwp5" ? displayStart : draft.length;
  assert.equal(h.controller.selectTextRange({ section: 0, paragraph: 0, startUnit: first, endUnit: last }), true);
  dispatchCanvasEvent(h.input, "beforeinput", { inputType: "deleteByCut" });
  h.input.value = draft.slice(0, first) + draft.slice(last); h.input.setSelectionRange(first, first); dispatchCanvasEvent(h.input, "input");
  const rejected = await h.flush(); assert.match(rejected.error, /UnsupportedControlDeletion|UnsupportedFieldLabelRange/);
  assert.equal(h.input.value, draft); assert.deepEqual(await save(), saved);
  const reopened = await h.send({ kind: "load", format, bytes: saved }); assert.equal(reopened.error, undefined);
  assert.equal(reopened.content.paragraphs.find(row => row.section === 0 && row.paragraph === 0).text, draft);
});
