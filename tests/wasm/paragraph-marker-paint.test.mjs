import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutContent } from '../../web/preview/layout.mjs';
import { nextTextRow } from '../../web/preview/next-text-row.mjs';
import { measureColumnContent } from '../../web/preview/column-content-layout.mjs';
import {
  paragraphMarkerPlan,
  observedMarkerPlacement,
} from '../../web/preview/paragraph-marker.mjs';
import { decodeParagraphShapes } from '../../js/paragraph-shapes-wire.mjs';
import { paintNumberPrefix } from '../../web/preview/number-prefix-paint.mjs';
import { caretGeometry, selectionRects } from '../../web/preview/text-geometry.mjs';

const placement = (alignment = 'LEFT', fields) => ({
  alignment,
  use_instance_width: true,
  auto_indent: true,
  width_adjust: 1500,
  offset_type: 'PERCENT',
  text_offset: 50,
  char_shape_id: 0xffffffff,
  ...fields,
});
const measure = (text, _p, _unit, kind) => ({
  width: [...text].length * 10,
  height: 10,
  ...(kind === 'paragraph-marker' ? { em: 10 } : {}),
});
const p = (fields = {}) => ({
  section: 0,
  paragraph: 0,
  text: 'AAAA AAAA AAAA AAAA AAAA',
  editable: true,
  selectionOwner: 'section:0:body',
  paragraphShape: {
    spacingFormat: 'hwpx',
    alignment: 1,
    heading: {
      kind: 'bullet',
      marker: 0x25b6,
      placement: placement(),
    },
  },
  ...fields,
});
const layout = (paragraph, extra = {}) =>
  layoutContent(
    {
      format: 'hwpx',
      paragraphs: [paragraph],
    },
    180,
    measure,
    100,
    { documentBody: true, paragraphMarkers: true, ...extra },
  );

test('uses the source slot alignment and gap, with a shared hanging body origin', () => {
  for (const [align, offset] of [
    ['LEFT', 0],
    ['CENTER', 10],
    ['RIGHT', 20],
  ]) {
    const paragraph = p();
    paragraph.paragraphShape.heading.placement = placement(align);
    const scene = layout(paragraph);
    assert(scene.rows.length > 1);
    const first = scene.rows[0];
    assert.equal(first.numberPrefix.offset, offset);
    assert.equal(first.boundaries[0].x, 35);
    assert(scene.rows.slice(1).every((row) => !row.numberPrefix && row.paragraphX === 35));
    assert.equal(first.paragraphX + first.boundaries[0].x, scene.rows[1].paragraphX);
    assert.equal(scene.rows.map((row) => row.text).join(''), paragraph.text);
    assert.equal(first.startUnit, 0);
    const point = { section: 0, paragraph: 0, unit: 0 };
    assert.equal(caretGeometry(scene, point).x, 55); // shared rowLeft includes the existing 20px inset
    assert(selectionRects(scene, point, { ...point, unit: 4 }).every((r) => r.x >= 55));
  }
});

test('one-line and full-flow body producers share geometry without adding source units', () => {
  const paragraph = p();
  const whole = layout(paragraph);
  let unit = 0;
  const rows = [];
  do {
    const row = nextTextRow(paragraph, unit, 180, measure, { paragraphMarkers: true });
    rows.push(row);
    assert(row.endUnit > unit);
    unit = row.endUnit;
  } while (unit < paragraph.text.length);
  assert.deepEqual(
    rows.map(({ text, paragraphX, boundaries, numberPrefix }) => ({
      text,
      paragraphX,
      boundaries,
      numberPrefix,
    })),
    whole.rows.map(({ text, paragraphX, boundaries, numberPrefix }) => ({
      text,
      paragraphX,
      boundaries,
      numberPrefix,
    })),
  );
});

test('honors fixed HWPUNIT spacing and explicit manual indent when auto hanging is disabled', () => {
  const paragraph = p();
  paragraph.paragraphShape.heading.placement = placement('RIGHT', {
    offset_type: 'HWPUNIT',
    text_offset: 750,
    width_adjust: 0,
  });
  assert.equal(layout(paragraph).rows[0].boundaries[0].x, 20);
  paragraph.paragraphShape.heading.placement = placement('LEFT', {
    auto_indent: false,
    text_offset: 0,
    width_adjust: 0,
  });
  paragraph.paragraphShape.indent = -1200;
  const rows = layout(paragraph).rows;
  assert.equal(rows[0].boundaries[0].x, 10);
  assert.equal(rows[1].paragraphX, 8);
});

test('uses verified number strings and a source-derived fixed-width reference', () => {
  const paragraph = p({
    numberingLabel: {
      kind: 'number',
      text: '10.',
      widthText: '1.',
      markerPlacement: observedMarkerPlacement(
        'hwpx',
        placement('RIGHT', { use_instance_width: false }),
      ),
    },
  });
  const scene = layout(paragraph);
  assert.equal(scene.rows[0].numberPrefix.text, '10.');
  assert.equal(scene.rows[0].numberPrefix.offset, 10);
  assert.equal(scene.rows[0].boundaries[0].x, 45);
  paragraph.numberingLabel.markerPlacement.widthAdjust = 0;
  assert.equal(layout(paragraph).rows[0].numberPrefix, undefined);
});

test('excludes missing provenance, PUA, custom font, duplicate retained numbers and oversized slots', () => {
  const paragraph = p();
  const plan = () => paragraphMarkerPlan(paragraph, 180, measure);
  assert(plan());
  paragraph.automaticNumberPrefixes = [{ source: {} }];
  assert.equal(plan(), null);
  delete paragraph.automaticNumberPrefixes;
  paragraph.automaticNumbers = [{ unit: 0 }];
  assert.equal(plan(), null);
  delete paragraph.automaticNumbers;
  paragraph.paragraphShape.heading.marker = 0xf06c;
  assert.equal(plan(), null);
  paragraph.paragraphShape.heading.marker = 0x25b6;
  paragraph.paragraphShape.heading.placement.char_shape_id = 3;
  assert.equal(plan(), null);
  paragraph.paragraphShape.heading.placement = placement('LEFT', { width_adjust: 30000 });
  assert.equal(plan(), null);
  const fallback = layout(paragraph).rows;
  assert.deepEqual(fallback, layout(paragraph, { paragraphMarkers: false }).rows);
  paragraph.paragraphShape.heading.placement = placement();
  paragraph.textStartUnit = 4;
  assert.equal(plan(), null);
  paragraph.textStartUnit = 0;
  paragraph.selectionOwner = 'section:0:table:4:list:5';
  assert.equal(plan(), null);
  paragraph.selectionOwner = 'section:0:body';
  paragraph.paragraphShape.indent = -1200;
  assert.equal(plan(), null);
});

test('does not retrieve or store stale paragraph-flow rows for a measured marker', () => {
  let lookups = 0;
  const cachingMeasure = Object.assign(measure, {
    paragraphFlowReuse: {
      scope: () => ({
        lookup() {
          lookups++;
          return null;
        },
      }),
    },
  });
  const paragraph = p();
  const content = { format: 'hwpx', paragraphs: [paragraph] };
  layoutContent(content, 180, cachingMeasure, 100, { documentBody: true, paragraphMarkers: true });
  assert.equal(lookups, 0);
  delete cachingMeasure.paragraphFlowReuse;
});

test('paints only the marker at the measured slot offset and restores context state', () => {
  const row = layout(p()).rows[0];
  const calls = [];
  const ctx = {
    fillStyle: '#123456',
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    fillText: (...args) => calls.push(['fillText', ...args]),
  };
  const fontAt = Object.assign(
    (_paragraph, unit, kind) => {
      assert.equal(unit, p().text.length - 1);
      assert.equal(kind, 'paragraph-marker');
      return '10px sans-serif';
    },
    { color: () => '#223344' },
  );
  assert.equal(paintNumberPrefix(ctx, row, 0, p(), fontAt, 0), true);
  assert.deepEqual(calls, [['save'], ['fillText', '▶', 20, 0], ['restore']]);
});

test('optional HPS4 placement preserves the HPS3 scalar contract and signed source fields', () => {
  const bytes = new Uint8Array(100);
  bytes.set(new TextEncoder().encode('HPS4'));
  const v = new DataView(bytes.buffer);
  v.setUint32(4, 1, true);
  for (const [at, value] of [
    [48, 3],
    [52, 1],
    [72, 0x25b6],
    [76, 14],
    [88, 0xffffffff],
  ])
    v.setUint32(8 + at, value, true);
  v.setInt32(8 + 80, 1500, true);
  v.setInt32(8 + 84, 50, true);
  const shape = decodeParagraphShapes(bytes)[0];
  assert.equal(shape.headingMarker, 0x25b6);
  assert.deepEqual(shape.headingPlacement, {
    attributes: 14,
    width_adjustment: 1500,
    text_distance: 50,
    char_shape_id: 0xffffffff,
  });
  assert.deepEqual(observedMarkerPlacement('hwp5', shape.headingPlacement), {
    alignment: 'RIGHT',
    useInstanceWidth: true,
    autoIndent: true,
    widthAdjust: 20,
    offsetType: 'PERCENT',
    textOffset: 50,
  });
});

test('deferred columns reuse marker measurements per paragraph and width, and reset on reflow', () => {
  const paragraph = p({ text: 'A '.repeat(200) });
  const declaration = {
    ambiguous: false,
    count: 2,
    same_size: false,
    kind: 'newspaper',
    direction: 'left',
    sizes: [
      { width: 13500, gap: 1500 },
      { width: 13500, gap: 0 },
    ],
  };
  const flows = [{ section: 0, paragraph: 0, top_level: true, column_declaration: declaration }];
  let markerMeasurements = 0;
  const counted = (...args) => {
    if (args[3] === 'paragraph-marker') markerMeasurements++;
    return measure(...args);
  };
  const build = () =>
    measureColumnContent(
      { format: 'hwpx', paragraphs: [paragraph] },
      { x: 0, y: 0, width: 380, height: 500 },
      flows,
      counted,
      100,
      { paragraphMarkers: true },
    );
  const measured = build();
  assert.equal(measured.state, 'measured');
  const source = measured.rows.find((row) => row.paragraphSource);
  let unit = 0;
  while (unit < paragraph.text.length) {
    const row = measured.measureRow({ ...source, startUnit: unit }, 180);
    assert(row.endUnit > unit);
    unit = row.endUnit;
  }
  assert.equal(markerMeasurements, 1);
  measured.measureRow(source, 160);
  assert.equal(markerMeasurements, 2);
  paragraph.paragraphShape.heading.placement = placement('RIGHT');
  const fresh = build();
  assert.equal(
    fresh.measureRow(
      fresh.rows.find((row) => row.paragraphSource),
      180,
    ).numberPrefix.offset,
    20,
  );
  assert.equal(markerMeasurements, 3);
});
