import assert from "node:assert/strict";
import { formattingCounts } from "./formatting.mjs";
import { objectActual } from "./objects.mjs";
import { headerFooterActual } from "./header-footer.mjs";
import { numberControlActual } from "./number-controls.mjs";
import { reportBytes } from "./document-report-wire.mjs";
import { pageNumberActual } from "./page-number.mjs";
import { indexMarkActual } from "./index-mark.mjs";
import { visibilityActual } from "./page-visibility.mjs";
import { bookmarkActual } from "./bookmarks.mjs";
import { overlapActual } from "./char-overlap.mjs";
import { identityActual } from "./links.mjs";
import { fieldsActual } from "./fields.mjs";
import { rubyActual } from "./ruby.mjs";
import { hiddenActual } from "./hidden-comment.mjs";
import { noteActual } from "./note-validation.mjs";
import { equationActual } from "./equation-validation.mjs";
import { oleActual } from "./ole-validation.mjs";
import { shapeActual } from "./shape-validation.mjs";
import { unselectedStyles } from "./drawing-style-document.mjs";
export { input as decodedDocumentInput, records as documentRecords };
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const u = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const words = (b) =>
  Array.from({ length: b.length / 4 }, (_, i) => b.readUInt32LE(i * 4));
function input(
  h,
  doc,
  sections,
  maxBytes = 64 * 1024 * 1024,
  maxSections = 4096,
) {
  return Buffer.concat([
    w(maxBytes),
    u(maxSections),
    h,
    w(doc.length),
    doc,
    u(sections.length),
    ...sections.flatMap((s) => [u(s.index), w(s.bytes.length), s.bytes]),
  ]);
}
function records(bytes) {
  const result = [];
  for (let p = 0; p < bytes.length; ) {
    const offset = p,
      bits = bytes.readUInt32LE(p);
    p += 4;
    let n = bits >>> 20;
    if (n === 4095) {
      n = bytes.readUInt32LE(p);
      p += 4;
    }
    assert.ok(n <= bytes.length - p);
    result.push({ tag: bits & 1023, offset, start: p, end: p + n });
    p += n;
  }
  return result;
}
// Dispatch equivalence, not an independent implementation of HWP semantics:
// individual probes already have byte-oracle and malformed-input tests.
export function documentActual(call, h, doc, sections) {
  const v = h.readUInt32LE(32),
    c = formattingCounts(doc);
  const run = (mode, bytes, counts = []) =>
    call(mode, Buffer.concat([w(v), ...counts.map(w), bytes]));
  const resource = run(5, doc),
    bins = resource.readUInt32LE(0);
  const params = (source, b) =>
    call(23, Buffer.concat([Buffer.from([source]), w(v), w(bins), b]));
  const totalBytes =
    h.length + doc.length + sections.reduce((n, s) => n + s.bytes.length, 0);
  const totalRecords =
    records(doc).length +
    sections.reduce((n, s) => n + records(s.bytes).length, 0);
  const props = records(doc).find((r) => r.tag === 16);
  assert.ok(props);
  const expected = [
    ...[
      v,
      h.readUInt32LE(36),
      sections.length,
      totalBytes,
      totalRecords,
      records(doc).length,
      doc.readUInt16LE(props.start),
    ].map(w),
    resource.subarray(0, 8),
    ...[
      c.borderFill,
      c.charShape,
      c.tabDef,
      c.numbering,
      c.bullet,
      c.paraShape,
      c.style,
    ].map(w),
    run(7, doc).subarray(0, 16),
    params(0, doc),
  ];
  for (const s of [...sections].sort((a, b) => a.index - b.index)) {
    const b = s.bytes,
      groups = run(15, b),
      objects = objectActual(b);
    let paras = 0,
      intervening = 0;
    for (let p = 0; p < groups.length; p += 24) {
      paras += groups.readUInt32LE(p + 16);
      intervening += groups.readUInt32LE(p + 20);
    }
    expected.push(
      w(records(b).length),
      run(10, b, [c.charShape, c.paraShape, c.style]).subarray(0, 24),
      run(11, b, [c.numbering, c.borderFill]),
      run(16, b),
      w(groups.length / 24),
      w(paras),
      w(intervening),
      run(17, b, [c.borderFill]).subarray(0, 16),
      params(1, b),
      w(objects[0] + objects[1] + objects[2]),
      ...headerFooterActual(call, v, b).map(w),
      ...numberControlActual(call, b).map(w),
      ...pageNumberActual(call, b).map(w),
      ...indexMarkActual(call, v, b).map(w),
      ...visibilityActual(call, v, b).map(w),
      ...bookmarkActual(call, v, b).map(w),
      ...overlapActual(
        call,
        v,
        b,
        records(doc).filter((r) => r.tag === 21).length,
      ).map(w),
      w(identityActual(call, v, b)),
      ...fieldsActual(call, v, b).map(w),
      ...rubyActual(call, v, b).map(w),
      ...hiddenActual(call, v, b).map(w),
      ...noteActual(call, v, b).map(w),
      ...equationActual(call, v, b).map(w),
      ...oleActual(call, v, b).map(w),
      ...shapeActual(call, v, b).map(w),
      ...unselectedStyles(b).map(w),
    );
  }
  const want = Buffer.concat(expected);
  assert.equal(want.length, reportBytes(sections.length));
  assert.deepEqual(
    call(24, input(h, doc, sections, totalBytes), totalRecords),
    want,
  );
  assert.deepEqual(
    call(24, input(h, doc, [...sections].reverse()), totalRecords),
    want,
  );
  assert.throws(
    () => call(24, input(h, doc, sections, totalBytes - 1)),
    /LimitExceeded/,
  );
  assert.throws(
    () => call(24, input(h, doc, sections), totalRecords - 1),
    /LimitExceeded/,
  );
  return [1, sections.length, totalBytes, totalRecords];
}
export function documentEdges(call, h, doc, sections) {
  const valid = input(h, doc, sections),
    good = call(24, valid);
  let rejected = 0;
  const reject = (bytes, error, limit) => {
    assert.throws(() => call(24, bytes, limit), error);
    assert.deepEqual(call(24, valid), good);
    rejected++;
  };
  for (const n of [0, 5, 6, 261, 262, valid.length - 1])
    reject(valid.subarray(0, n), /UnexpectedEnd/);
  reject(Buffer.concat([valid, u(0)]), /TrailingDocumentInput/);
  reject(input(h, doc, sections, 0), /InvalidDocumentLimit/);
  reject(input(h, doc, sections), /InvalidDocumentLimit/, 0);
  reject(input(h, doc, sections, 0xffffffff, 0), /LimitExceeded/);
  for (const flag of [2, 4, 16, 256, 1024]) {
    const bad = Buffer.from(h);
    bad.writeUInt32LE(flag, 36);
    reject(
      input(bad, doc, sections),
      /UnsupportedEncryption|UnsupportedDistribution|UnsupportedDrm/,
    );
  }
  const properties = records(doc).find((r) => r.tag === 16);
  const modified = Buffer.from(doc);
  modified.writeUInt16LE(sections.length + 1, properties.start);
  reject(input(h, modified, sections), /SectionCountMismatch/);
  const without = Buffer.concat([
    doc.subarray(0, properties.offset),
    doc.subarray(properties.end),
  ]);
  reject(input(h, without, sections), /MissingDocumentProperties/);
  reject(
    input(
      h,
      Buffer.concat([doc, doc.subarray(properties.offset, properties.end)]),
      sections,
    ),
    /DuplicateDocumentProperties/,
  );
  const level = Buffer.from(doc);
  level.writeUInt32LE(
    (level.readUInt32LE(properties.offset) | 1024) >>> 0,
    properties.offset,
  );
  reject(input(h, level, sections), /InvalidDocInfoLevel/);
  reject(
    input(
      h,
      doc,
      sections.map((s, i) => (i ? s : { ...s, index: sections.length })),
    ),
    /InvalidSectionIndex/,
  );
  // Make two declared sections even for a one-section corpus document.
  const twoDoc = Buffer.from(doc);
  twoDoc.writeUInt16LE(2, properties.start);
  const two = [
    { index: 0, bytes: sections[0].bytes },
    { index: 1, bytes: sections[0].bytes },
  ];
  const twoResult = words(call(24, input(h, twoDoc, two)));
  assert.equal(twoResult[2], 2);
  reject(input(h, twoDoc, [two[0], two[0]]), /DuplicateSectionIndex/);
  reject(
    input(h, twoDoc, [two[0], { ...two[1], bytes: Buffer.alloc(0) }]),
    /MissingSectionDefinition/,
  );
  reject(input(h, twoDoc, two, 0xffffffff, 1), /LimitExceeded/);
  const badSection = Buffer.from(sections[0].bytes),
    para = records(badSection).find((r) => r.tag === 66);
  badSection.writeUInt16LE(65535, para.start + 8);
  reject(
    input(h, twoDoc, [two[0], { ...two[1], bytes: badSection }]),
    /InvalidResourceReference/,
  );
  // Verify the integrated path invokes source validation, retaining unsupported
  // data rather than silently upgrading it to fully validated content.
  const emptyParagraph = Buffer.concat([w(66 | (24 << 20)), Buffer.alloc(24)]);
  const shifted = Buffer.concat([emptyParagraph, sections[0].bytes]);
  reject(
    input(h, twoDoc, [two[0], { ...two[1], bytes: shifted }]),
    /MisplacedSectionDefinition/,
  );
  // Unknown records before the first paragraph must not be confused with it.
  const prefixed = Buffer.concat([w(999), sections[0].bytes]);
  call(24, input(h, twoDoc, [two[0], { ...two[1], bytes: prefixed }]));
  const frame = (b) => Buffer.concat([w(27 | (b.length << 20)), b]);
  const unknown = frame(Buffer.concat([u(1), u(1), u(0), u(7), u(0x7777)]));
  const pending = words(
    call(24, input(h, Buffer.concat([doc, unknown]), sections)),
  );
  assert.equal(pending[24], words(good)[24] + 1); // unsupported payloads
  assert.equal(pending[25], words(good)[25] + 10); // unsupported bytes
  const bins = words(good)[7];
  const invalidRef = frame(
    Buffer.concat([u(1), u(1), u(0), u(7), u(0x8002), u(bins + 1)]),
  );
  reject(
    input(h, Buffer.concat([doc, invalidRef]), sections),
    /InvalidResourceReference/,
  );
  const truncated = frame(Buffer.concat([u(1), u(1), u(0), u(7), u(3)]));
  reject(
    input(h, Buffer.concat([doc, unknown, truncated]), sections),
    /UnexpectedEnd/,
  );
  return { rejected, recoveries: rejected };
}
