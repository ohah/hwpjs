import assert from 'node:assert/strict';
const object = (v, label) =>
  assert(v !== null && typeof v === 'object' && !Array.isArray(v), label);
const uint = (v, label) => assert(Number.isSafeInteger(v) && v >= 0, label);
const epoch = (v, label) => assert(typeof v === 'string' && /^[1-9][0-9]*$/.test(v), label);
export function assertRanges(ranges, text, shapeIds) {
  assert.equal(typeof text, 'string');
  assert(Array.isArray(ranges) && ranges.length > 0, 'required nonempty characterRanges');
  let end = 0;
  for (const r of ranges) {
    object(r, 'range');
    uint(r.start, 'range start');
    uint(r.end, 'range end');
    uint(r.charShapeId, 'shape id');
    assert.equal(r.start, end);
    assert(r.end >= r.start && r.end <= text.length);
    if (shapeIds) assert(shapeIds.has(r.charShapeId));
    end = r.end;
  }
  assert.equal(end, text.length, 'complete range coverage');
}
export function assertContentShape(content, full = false) {
  object(content, 'required content');
  assert.equal(content.format, 'hwp5', 'required content format');
  assert(
    Array.isArray(content.paragraphs) && content.paragraphs.length > 0,
    'required nonempty paragraphs',
  );
  if (full) {
    assert.equal(content.limited, false);
    assert.equal(content.viewKind, undefined);
    assert.equal(content.window, undefined);
    assert.equal(content.paragraphs.length, 65);
  }
  assert(
    Array.isArray(content.characterShapes) && content.characterShapes.length > 0,
    'required nonempty characterShapes',
  );
  const ids = new Set();
  for (const s of content.characterShapes) {
    object(s, 'shape');
    uint(s.id, 'shape id');
    ids.add(s.id);
  }
  for (const p of content.paragraphs) {
    object(p, 'paragraph');
    uint(p.section, 'section');
    uint(p.paragraph, 'paragraph index');
    assertRanges(p.characterRanges, p.text, ids);
    const r = p.currentReference;
    object(r, 'required currentReference');
    assert.equal(r.kind, 'original');
    assert(typeof r.scope === 'string' && r.scope.length > 0);
    epoch(r.epoch, 'reference epoch');
    assert(typeof r.id === 'string' && r.id.length > 0);
  }
}
export function assertMetadata(reply, kind) {
  object(reply, 'required reply');
  assert.equal(reply.kind, kind);
  assert.equal(reply.error, undefined);
  object(reply.meta, 'required meta');
  assert(['applied', 'unapplied', 'unknown'].includes(reply.meta.application));
  assert(reply.meta.changed === null || typeof reply.meta.changed === 'boolean');
  uint(reply.historyRevision, 'required historyRevision');
  assert(
    Array.isArray(reply.historyRevisions) && reply.historyRevisions.length > 0,
    'required historyRevisions',
  );
  for (const r of reply.historyRevisions) uint(r, 'reachable revision');
  assert(reply.historyRevisions.includes(reply.historyRevision));
  object(reply.historyStats, 'required historyStats');
  assert(Object.keys(reply.historyStats).length > 0);
}
export function assertHistoryPacket(reply, kind) {
  assertMetadata(reply, kind);
  assert(['undo', 'redo'].includes(kind));
  assert.equal(reply.meta.application, 'applied');
  assert.equal(reply.meta.changed, true);
  const p = reply.content;
  object(p, 'required history packet');
  assert.equal(p.viewKind, 'history-owner-window');
  assert.equal(p.version, 1);
  assert.equal(p.operation, kind);
  uint(p.beforeRevision, 'before revision');
  uint(p.revision, 'revision');
  assert.equal(p.revision, reply.historyRevision);
  epoch(p.beforeEpoch, 'before epoch');
  epoch(p.epoch, 'packet epoch');
  assert(BigInt(p.epoch) > BigInt(p.beforeEpoch));
  object(p.owner, 'owner');
  for (const n of ['section', 'paragraph', 'sourceNode']) uint(p.owner[n], n);
  assert(
    p.owner.parentNode === null ||
      (Number.isSafeInteger(p.owner.parentNode) && p.owner.parentNode >= 0),
  );
  const w = p.window;
  object(w, 'required packet window');
  epoch(w.epoch, 'window epoch');
  assert.equal(w.epoch, p.epoch);
  assert.equal(typeof w.text, 'string');
  assert(w.text.length >= 2 && w.text.endsWith('\r'));
  assert.equal(w.startUnit, 0);
  assert.equal(w.endUnit, w.text.length);
  assert.equal(w.totalUnits, w.text.length);
  assert.equal(w.section, p.owner.section);
  assert.equal(w.sourceNode, p.owner.sourceNode);
  assert.equal(w.parentNode, p.owner.parentNode);
  assertRanges(p.characterRanges, w.text.slice(0, -1));
  object(p.reference, 'reference');
  assert.equal(p.reference.kind, 'original');
  assert(typeof p.reference.scope === 'string' && p.reference.scope.length > 0);
  assert.equal(p.reference.epoch, p.epoch);
  assert.equal(p.reference.id, String(p.owner.sourceNode));
  assert.equal(p.reference.section, p.owner.section);
  assert.equal(p.reference.row, 0);
  assert.equal(p.reference.column, 0);
}
export function assertReplyShape(reply, kind, { full = false } = {}) {
  assertMetadata(reply, kind);
  if (kind === 'formatting-capabilities') {
    const c = reply.formattingCapabilities;
    object(c, 'required formattingCapabilities');
    assert.equal(typeof c.atomic, 'boolean');
    if (c.atomic) {
      object(c.binding, 'required capability binding');
      assert(Object.keys(c.binding).length > 0);
    } else assert(typeof c.reason === 'string' && c.reason.length > 0);
  } else if (kind === 'save') {
    assert(
      reply.bytes instanceof Uint8Array && reply.bytes.byteLength >= 512,
      'required nonempty saved CFB',
    );
    assert.deepEqual(
      Array.from(reply.bytes.slice(0, 8)),
      [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
      'required CFB header',
    );
  } else assertContentShape(reply.content, full);
}
export function assertSplicePacket(reply) {
  assertMetadata(reply, 'splice');
  assert.equal(reply.meta.application, 'applied');
  assert.equal(reply.meta.changed, true);
  const p = reply.content;
  object(p, 'required splice packet');
  assert.equal(p.viewKind, 'owner-window-patch');
  object(p.receipt, 'required receipt');
  epoch(p.receipt.epoch, 'receipt epoch');
  object(p.window, 'required packet window');
  epoch(p.window.epoch, 'window epoch');
  assert.equal(p.window.epoch, p.receipt.epoch);
  assert.equal(typeof p.window.text, 'string');
  assert(p.window.text.length >= 2 && p.window.text.endsWith('\r'));
  assert.equal(p.window.startUnit, 0);
  assert.equal(p.window.endUnit, p.window.text.length);
  assert.equal(p.window.totalUnits, p.window.text.length);
}
