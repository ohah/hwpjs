import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { inflateRawSync, deflateRawSync } from "node:zlib";
import { hiddenActual } from "./hidden-comment.mjs";
import {
  documentRecords,
  documentActual,
  decodedDocumentInput,
} from "./documents.mjs";
import { containerActual } from "./containers.mjs";
import { linksActual } from "./links.mjs";
import { typeActual } from "./control-types.mjs";
import { sectionFieldOffset } from "./document-report-wire.mjs";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
export function hiddenReference(call, cfb) {
  const path = new URL(
    "../../reference/rhwp/samples/issue6034/2912735_court_report_form.hwp",
    import.meta.url,
  );
  if (!existsSync(path)) return { skipped: "reference fixture unavailable" };
  const file = readFileSync(path);
  cfb.parse(file, { strict: true });
  const h = Buffer.from(cfb.findExact("/FileHeader").content),
    v = h.readUInt32LE(32),
    flags = h.readUInt32LE(36);
  assert.equal(flags & (2 | 4 | 16 | 256 | 1024), 0);
  const decode = (p) => {
    const raw = Buffer.from(cfb.findExact(p).content),
      b = flags & 1 ? inflateRawSync(raw) : raw;
    assert.deepEqual(call(3, Buffer.concat([h, raw]), b.length), b);
    return b;
  };
  const original = decode("/BodyText/Section0"),
    doc = decode("/DocInfo");
  const stats = hiddenActual(call, v, original);
  assert.deepEqual(stats, [1, 1, 1, 0, 0, 0]);
  linksActual(call, v, original);
  assert.equal(typeActual(call, v, original)[2], 1);
  // Keep the observed code in the actual document; compare code 15 separately.
  const b = Buffer.from(original),
    text = documentRecords(b).find((r) => r.offset === 614);
  assert.equal(text.tag, 67);
  const token = text.start + 12;
  assert.equal(b.readUInt16LE(token), 23);
  assert.equal(b.readUInt32LE(token + 2), 0x74636d74);
  assert.equal(b.readUInt16LE(token + 14), 23);
  const sections = [{ index: 0, bytes: b }];
  const documentReport = documentActual(call, h, doc, sections),
    containerReport = containerActual(call, file, cfb, h, doc, sections);
  const rows = documentRecords(b),
    control = rows.find(
      (r) => r.tag === 71 && b.readUInt32LE(r.start) === 0x74636d74,
    ),
    level = (b.readUInt32LE(control.offset) >>> 10) & 1023,
    index = rows.indexOf(control);
  const list = rows[index + 1];
  assert.equal(list.tag, 72);
  assert.equal((b.readUInt32LE(list.offset) >>> 10) & 1023, level + 1);
  let end = control.end;
  for (let i = index + 1; i < rows.length; i++) {
    if (((b.readUInt32LE(rows[i].offset) >>> 10) & 1023) <= level) break;
    end = rows[i].end;
  }
  const nodes = cfb.document().nodes,
    body = nodes.findIndex((n) => n.name === "BodyText" && n.parent === 0),
    section = nodes.findIndex(
      (n) => n.name === "Section0" && n.parent === body,
    );
  assert.ok(section >= 0);
  const full = (plain) => {
    const copy = nodes.map((n) => ({ ...n }));
    copy[section].content = flags & 1 ? deflateRawSync(plain) : plain;
    return call(
      25,
      Buffer.concat([w(67108864), Buffer.from(cfb.write({ nodes: copy }))]),
    );
  };
  const short = Buffer.concat([
    b.subarray(0, list.end - 1),
    b.subarray(list.end),
  ]);
  short.writeUInt32LE(
    ((b.readUInt32LE(list.offset) & 0xfffff) |
      ((list.end - list.start - 1) << 20)) >>>
      0,
    list.offset,
  );
  const count = Buffer.from(b);
  count.writeUInt16LE(2, list.start);
  const missing = Buffer.concat([b.subarray(0, control.end), b.subarray(end)]);
  let rejected = 0;
  const normal = call(24, decodedDocumentInput(h, doc, sections));
  const code15 = Buffer.from(b);
  code15.writeUInt16LE(15, token);
  code15.writeUInt16LE(15, token + 14);
  const expected = Buffer.from(normal),
    checked = sectionFieldOffset(0, "control_types", 0),
    observed = sectionFieldOffset(0, "control_types", 2);
  expected.writeUInt32LE(expected.readUInt32LE(checked) + 1, checked);
  expected.writeUInt32LE(0, observed);
  assert.deepEqual(
    call(24, decodedDocumentInput(h, doc, [{ index: 0, bytes: code15 }])),
    expected,
  );
  assert.deepEqual(full(code15).subarray(0, expected.length), expected);
  linksActual(call, v, code15);
  for (const code of [2, 3, 11, 21]) {
    const bad = Buffer.from(b);
    bad.writeUInt16LE(code, token);
    bad.writeUInt16LE(code, token + 14);
    for (const invoke of [
      () => call(16, Buffer.concat([w(v), bad])),
      () => call(24, decodedDocumentInput(h, doc, [{ index: 0, bytes: bad }])),
      () => full(bad),
    ]) {
      assert.throws(invoke, /ControlCodeMismatch/);
      rejected++;
    }
    assert.deepEqual(call(24, decodedDocumentInput(h, doc, sections)), normal);
  }
  const info = Buffer.from(doc),
    properties = documentRecords(info).find((r) => r.tag === 16);
  info.writeUInt16LE(2, properties.start);
  documentActual(call, h, info, [
    { index: 0, bytes: code15 },
    { index: 1, bytes: b },
  ]);
  for (const [bad, error] of [
    [short, /UnexpectedEnd/],
    [count, /ListParagraphCountMismatch/],
    [missing, /MissingHiddenCommentList/],
  ]) {
    for (const invoke of [
      () => call(41, Buffer.concat([w(v), Buffer.from([1]), bad])),
      () => call(24, decodedDocumentInput(h, doc, [{ index: 0, bytes: bad }])),
      () => full(bad),
    ]) {
      assert.throws(invoke, error);
      rejected++;
    }
    hiddenActual(call, v, b);
    documentActual(call, h, doc, sections);
  }
  return {
    stats,
    rejected,
    observedCodes: 1,
    documentReport,
    containerReport,
  };
}
