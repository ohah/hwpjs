import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeParagraphShapes } from '../../js/paragraph-shapes-wire.mjs';
import { decodeHwpxParagraphShapes } from '../../js/hwpx-paragraph-shapes.mjs';
import { observedParagraphHeading } from '../../web/preview/paragraph-heading.mjs';

function hwp5Shape(version, { kind = 0, id = 0, marker = 0 } = {}) {
  const stride = { 1: 48, 2: 72, 3: 76 }[version];
  const bytes = new Uint8Array(8 + stride);
  bytes.set(new TextEncoder().encode('HPS' + version));
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 1, true);
  if (version >= 2) {
    view.setUint32(8 + 48, kind, true);
    view.setUint32(8 + 52, id, true);
  }
  if (version === 3) view.setUint32(8 + 72, marker, true);
  return bytes;
}

test('keeps HPS1 unobserved and distinguishes explicit HPS2 none from an unresolved bullet', () => {
  const read = (version, fields) =>
    observedParagraphHeading('hwp5', decodeParagraphShapes(hwp5Shape(version, fields))[0]);
  assert.equal(read(1).reason, 'heading-not-observed');
  assert.deepEqual(read(2), { state: 'available', kind: 'none', text: '' });
  assert.equal(read(2, { kind: 3, id: 1 }).reason, 'unsupported-bullet');
  for (const kind of [1, 2])
    assert.equal(read(2, { kind, id: 1 }).reason, 'numbering-not-computed');
});

test('decodes only authoritative HPS3 scalar bullets and rejects incoherent wire values', () => {
  const valid = { kind: 3, id: 2, marker: 0xf06c };
  const shape = decodeParagraphShapes(hwp5Shape(3, valid))[0];
  const result = observedParagraphHeading('hwp5', shape);
  assert.deepEqual(result, {
    state: 'available',
    kind: 'bullet',
    text: '\uf06c',
    provenance: 'hwp5-docinfo',
  });
  assert(Object.isFrozen(result));
  for (const invalid of [{ kind: 2 }, { id: 0 }, { marker: 0xd800 }, { marker: 0x10000 }])
    assert.throws(
      () => decodeParagraphShapes(hwp5Shape(3, { ...valid, ...invalid })),
      /InvalidParagraphShapes/,
    );
});

const basic = {
  id: 3,
  horizontal: null,
  spacing_type: null,
  spacing: null,
  margins: Array(5).fill(null),
};
function hwpx(heading) {
  return decodeHwpxParagraphShapes(
    new TextEncoder().encode(JSON.stringify([{ ...basic, heading }])),
  )[0];
}
test('uses only typed HWPX evidence, including supplementary scalars', () => {
  assert.equal(observedParagraphHeading('hwpx', hwpx()).reason, 'heading-not-observed');
  assert.equal(observedParagraphHeading('hwpx', hwpx(null)).reason, 'heading-not-observed');
  assert.equal(
    observedParagraphHeading('hwpx', hwpx({ kind: 'bullet', marker: null })).reason,
    'unsupported-bullet',
  );
  assert.equal(
    observedParagraphHeading('hwpx', hwpx({ kind: 'bullet', marker: 0x1f7e3 })).text,
    '🟣',
  );
  assert.equal(
    observedParagraphHeading('hwpx', hwpx({ kind: 'number', marker: null })).reason,
    'numbering-not-computed',
  );
  assert.throws(() => hwpx({ kind: 'none', marker: 0x25b6 }), /InvalidParagraphShapes/);
  assert.throws(() => hwpx({ kind: 'bullet', marker: '▶' }), /InvalidParagraphShapes/);
});

test('body text and automatic-number controls cannot manufacture a heading', () => {
  const shape = { text: '1. ▶', automaticNumbers: [{ unit: 0 }], numberPrefix: { text: '1.' } };
  assert.equal(observedParagraphHeading('hwp5', shape).reason, 'heading-not-observed');
  assert.equal(observedParagraphHeading('hwpx', shape).reason, 'heading-not-observed');
});
