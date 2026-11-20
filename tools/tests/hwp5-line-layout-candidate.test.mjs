import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareLineLayout,
  cssPixelsToHwpUnits,
  LINE_LAYOUT_LIMITS,
} from '../../js/hwp5-line-layout-candidate.mjs';
import {
  observeHwp5LayoutForSave,
  observeHwp5PageLayoutForSave,
} from '../../web/preview/hwp5-layout-save-observation.mjs';
const ENDS = (1 << 17) | (1 << 18),
  EMPTY = 1 << 16;
const raw = (text) => Uint16Array.from({ length: text.length }, (_, i) => text.charCodeAt(i));
const geometry = (y = 0) => ({
  y,
  height: 100,
  textHeight: 80,
  baseline: 60,
  spacing: 20,
  x: 0,
  width: 500,
});
function input() {
  return {
    version: 0x05000300,
    paragraphs: [{ section: 0, headerOrdinal: 0, rawText: raw('가😀A\n나\r') }],
    pages: [{ section: 0, width: 1000, height: 1000 }],
    lines: [
      { paragraph: 0, page: 0, start: 0, end: 5, geometry: geometry(), flags: ENDS | 3 },
      { paragraph: 0, page: 0, start: 5, end: 6, geometry: geometry(120), flags: ENDS },
    ],
  };
}
test('layout candidate owns Unicode raw text and explicit geometry without publishing authority', () => {
  const value = input(),
    copy = structuredClone(value),
    result = prepareLineLayout(value);
  assert.deepEqual(value, copy);
  value.paragraphs[0].rawText[0] = 0;
  value.lines[0].geometry.baseline = 0;
  assert.equal(result.paragraphs[0].rawText[0], 0xac00);
  assert.equal(result.paragraphs[0].segments[0].baseline, 60);
  assert.equal(Object.hasOwn(result, 'certified'), false);
  assert.deepEqual(result.work, {
    unitsVisited: 7,
    graphemeUnitsVisited: 7,
    boundariesVisited: 8,
    paragraphsVisited: 1,
    pagesVisited: 1,
    linesVisited: 2,
  });
});
test('layout candidate preserves explicit legacy and rejects unsupported version', () => {
  const value = input();
  value.version = 0x05000107;
  assert.equal(prepareLineLayout(value).version, value.version);
  value.version = 0x05010000;
  assert.throws(() => prepareLineLayout(value), /UnsupportedLayoutWriteVersion/);
});
test('layout candidate rejects surrogate interior boundaries and malformed scalar input', () => {
  const value = input();
  value.lines[0].end = value.lines[1].start = 2;
  assert.throws(() => prepareLineLayout(value), /InvalidLayoutTextCoverage/);
  const bad = input();
  bad.paragraphs[0].rawText = new Uint16Array([0xd800, 13]);
  assert.throws(() => prepareLineLayout(bad), /InvalidLayoutUnicode/);
  const separator = input();
  separator.paragraphs[0].rawText = new Uint16Array([0x2028, 13]);
  assert.throws(() => prepareLineLayout(separator), /UnsupportedLayoutControl/);
});
test('layout candidate requires every hard break and trailing empty line', () => {
  const value = input();
  value.lines = [{ ...value.lines[0], end: 6 }];
  assert.throws(() => prepareLineLayout(value), /UnflowedHardBreak/);
  const trailing = input();
  trailing.paragraphs[0].rawText = raw('A\n\r');
  trailing.lines[0].end = 2;
  trailing.lines[1].start = trailing.lines[1].end = 2;
  trailing.lines[1].flags |= EMPTY;
  assert.equal(prepareLineLayout(trailing).paragraphs[0].segments.length, 2);
  trailing.lines.pop();
  assert.throws(() => prepareLineLayout(trailing), /IncompleteLayoutParagraph/);
});
test('layout candidate respects raw section controls and never counts their payload as text', () => {
  const value = input();
  value.paragraphs[0].rawText = new Uint16Array([
    2, 0x6364, 0x7365, 0, 0, 0, 0, 2, 2, 0x6c64, 0x636f, 0, 0, 0, 0, 2, 13,
  ]);
  value.lines = [{ ...value.lines[0], end: 16, flags: ENDS | EMPTY | 3 }];
  assert.equal(prepareLineLayout(value).paragraphs[0].segments.length, 1);
  value.lines[0].end = 8;
  assert.throws(() => prepareLineLayout(value), /IncompleteLayoutParagraph/);
});
test('layout candidate validates page transitions and local box overflow', () => {
  const value = input();
  value.pages[0].height = 120;
  assert.throws(() => prepareLineLayout(value), /LayoutOverflowOrOverlap/);
  value.pages.push({ section: 0, width: 1000, height: 120 });
  value.lines[1].page = 1;
  value.lines[1].geometry.y = 0;
  value.lines[1].flags |= 3;
  assert.equal(prepareLineLayout(value).pages.length, 2);
  value.lines[1].flags &= ~3;
  assert.throws(() => prepareLineLayout(value), /WrongLayoutFirstLineFlags/);
});
test('layout candidate rejects overlap, wrong owner, absent baseline and nonfinite numbers', () => {
  const checks = [
    (value) => {
      value.lines[1].geometry.y = 50;
    },
    (value) => {
      value.pages[0].section = 1;
    },
    (value) => {
      delete value.lines[0].geometry.baseline;
    },
    (value) => {
      value.lines[0].geometry.width = Infinity;
    },
    (value) => {
      value.lines[0].flags |= 0x80000000;
    },
  ];
  for (const change of checks) {
    const value = input();
    change(value);
    assert.throws(() => prepareLineLayout(value));
  }
});
test('layout candidate rejects duplicate unordered paragraphs, unused pages and budgets', () => {
  const duplicate = input();
  duplicate.paragraphs.push(duplicate.paragraphs[0]);
  assert.throws(() => prepareLineLayout(duplicate), /UnorderedLayoutParagraph/);
  const pages = input();
  pages.pages.push({ ...pages.pages[0] });
  assert.throws(() => prepareLineLayout(pages), /IncompleteLayoutBatch/);
  const limited = input();
  limited.lines = Array(LINE_LAYOUT_LIMITS.lines + 1).fill(limited.lines[0]);
  assert.throws(() => prepareLineLayout(limited), /LayoutLimitExceeded/);
});
test('layout unit conversion uses CSS96dpi and symmetric integer quantization with checked overflow', () => {
  assert.equal(cssPixelsToHwpUnits(1), 75);
  assert.equal(cssPixelsToHwpUnits(0.02), 2);
  assert.equal(cssPixelsToHwpUnits(-0.02), -2);
  assert.equal(Object.is(cssPixelsToHwpUnits(-0), -0), false);
  for (const value of [NaN, Infinity, 2147483648]) assert.throws(() => cssPixelsToHwpUnits(value));
});
test('layout validation work is linear in complete text and line coverage', () => {
  for (const n of [64, 128]) {
    const value = {
      version: 0x05000300,
      paragraphs: [{ section: 0, headerOrdinal: 0, rawText: raw('가\n'.repeat(n) + '\r') }],
      pages: [{ section: 0, width: 1000, height: (n + 1) * 120 }],
      lines: [],
    };
    for (let i = 0; i <= n; i++)
      value.lines.push({
        paragraph: 0,
        page: 0,
        start: i * 2,
        end: i === n ? i * 2 : i * 2 + 2,
        geometry: geometry(i * 120),
        flags: ENDS | (i === 0 ? 3 : 0) | (i === n ? EMPTY : 0),
      });
    const { work } = prepareLineLayout(value);
    assert.equal(work.unitsVisited, n * 2 + 1);
    assert.equal(work.linesVisited, n + 1);
    assert.equal(work.graphemeUnitsVisited, n * 2 + 1);
    assert.equal(work.boundariesVisited, n * 2 + 2);
  }
});
function content() {
  const text = '가😀A\n나';
  return {
    format: 'hwp5',
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text,
        editable: true,
        sourceOffsets: Array.from({ length: text.length + 1 }, (_, i) => i),
      },
    ],
  };
}
const measure = (text) => ({ width: text === '' ? 0 : 8, height: 12 });
test('existing real grapheme engine computes Unicode wrapping observation from synthetic measurements', () => {
  const value = content(),
    copy = structuredClone(value),
    flow = observeHwp5LayoutForSave(value, 16, measure);
  assert.deepEqual(
    flow.rows.map((row) => [row.start, row.end]),
    [
      [0, 3],
      [3, 5],
      [5, 6],
    ],
  );
  assert.deepEqual(value, copy);
  assert.ok(flow.rows.every((row) => Number.isFinite(row.advance) && row.availableWidth === 16));
  assert.ok(flow.unresolved.includes('measured-baseline-and-line-box'));
});
test('existing page engine computes physical overflow and resets column-local y without save authority', () => {
  const setting = {
    width: 1500,
    height: 3000,
    orientation: 'widely',
    gutter_type: 'left_only',
    duplicate_margins: 0,
    margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 },
  };
  const flow = observeHwp5PageLayoutForSave(content(), measure, setting, [
    {
      section: 0,
      paragraph: 0,
      top_level: true,
      single_column: true,
      page_break: false,
      column_break: false,
    },
  ]);
  assert.equal(flow.pages.length, 3);
  assert.deepEqual(
    flow.rows.map((row) => row.page),
    [0, 1, 2],
  );
  assert.deepEqual(
    flow.rows.map((row) => row.localY),
    [0, 0, 0],
  );
  assert.ok(flow.unresolved.includes('hwp5-page-flow-serialization-qualification'));
});
test('engine adapter refuses missing source mapping and reports limited output', () => {
  const bad = content();
  bad.paragraphs[0].sourceOffsets = undefined;
  assert.throws(() => observeHwp5LayoutForSave(bad, 16, measure), /MissingLayoutSourceBoundary/);
  const limited = observeHwp5LayoutForSave(content(), 16, measure, 1);
  assert.equal(limited.limited, true);
  assert.ok(limited.unresolved.includes('limited-output'));
  const partial = content();
  partial.paragraphs[0].textStartUnit = 1;
  assert.throws(
    () => observeHwp5LayoutForSave(partial, 16, measure),
    /UnsupportedPartialLayoutSource/,
  );
});
test('combining and ZWJ clusters stay atomic in current engine output and candidate boundaries', () => {
  const text = 'e\u0301👩‍💻나',
    value = {
      format: 'hwp5',
      paragraphs: [
        {
          section: 0,
          paragraph: 0,
          text,
          sourceOffsets: Array.from({ length: text.length + 1 }, (_, i) => i),
        },
      ],
    };
  const observed = observeHwp5LayoutForSave(value, 8, measure);
  assert.deepEqual(
    observed.rows.map((row) => [row.start, row.end]),
    [
      [0, 2],
      [2, 7],
      [7, 8],
    ],
  );
  const broken = input();
  broken.paragraphs[0].rawText = raw('e\u0301나\r');
  broken.lines[0].end = 1;
  broken.lines[1].start = 1;
  broken.lines[1].end = 3;
  assert.throws(() => prepareLineLayout(broken), /InvalidLayoutTextCoverage/);
});
