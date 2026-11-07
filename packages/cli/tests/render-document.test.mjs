import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDocument } from '../src/render.mjs';

const area = () => ({
  declarations: 'known',
  definitions: [],
  inheritance: { state: 'unresolved' },
});
const paragraph = (ordinal = 0, text = 'Hello', extra = {}) => ({
  id: `s0:p${ordinal}`,
  type: 'paragraph',
  displayText: text,
  source: { section: 0, paragraph: ordinal, node: ordinal + 10 },
  editability: 'range-check-required',
  ...extra,
});
const cell = (blocks = []) => ({
  id: 'c:0',
  row: 0,
  column: 0,
  rowSpan: 1,
  columnSpan: 1,
  geometryKnown: true,
  contentState: 'known',
  blocks,
});
const table = (cells = []) => ({ id: 't:0', type: 'table', rows: 2, columns: 2, cells });
const model = (body = []) => ({
  version: 1,
  format: 'hwp5',
  sourceSha256: 'a'.repeat(64),
  coordinates: {
    sectionBase: 0,
    paragraphBase: 0,
    paragraphScope: 'section',
    textUnit: 'Native UTF16',
  },
  sections: [{ id: 's:0', source: { section: 0 }, header: area(), body, footer: area() }],
  unplaced: [],
  warnings: [],
  coverage: { inventoryComplete: true },
});
function frozen(value) {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) frozen(v);
    Object.freeze(value);
  }
  return value;
}
const render = (m, options = {}) => renderDocument(m, { format: 'text', ...options });

test('exact body-only text outline preserves native IDs, header/body/footer order and source model', () => {
  const m = frozen(model([paragraph(0, 'Hello🙂')]));
  const original = structuredClone(m);
  assert.equal(
    render(m),
    [
      'AI logical view; display escapes are not original text bytes.',
      'Section s:0',
      'Headers (own definitions; declarations=known, inheritance=unresolved)',
      'Body',
      'Paragraph s0:p0 (native paragraph=0): Hello🙂',
      'Footers (own definitions; declarations=known, inheritance=unresolved)',
      '',
    ].join('\n'),
  );
  assert.deepEqual(m, original);
  assert.equal(render(m).includes(m.sourceSha256), false);
  assert.equal(render(m).includes('hwp5'), false);
});

test('Markdown is a logical outline with escaped source punctuation and inline HTML', () => {
  const m = model([paragraph(0, '# title *bold* [link](url) <img src=x> | `code`')]);
  const text = render(m, { format: 'markdown' });
  assert.ok(
    text.startsWith(
      '> AI logical view; display escapes are not original text bytes.\n# Section s:0\n',
    ),
  );
  assert.ok(
    text.includes(
      '- Paragraph s0:p0 (native paragraph=0): \\# title \\*bold\\* \\[link\\]\\(url\\) \\<img src=x\\> \\| \\`code\\`',
    ),
  );
  assert.equal(text.includes('<img src=x>'), false);
});

test('C0, ESC, C1 and Unicode terminal controls are visible escapes, never terminal commands', () => {
  const source = '\u0000\t\n\r\u001b[31m\u007f\u0085\u009b2J\u202e\u2066';
  const text = render(model([paragraph(0, source)]));
  assert.ok(
    text.includes('\\u0000\\u0009\\u000a\\u000d\\u001b[31m\\u007f\\u0085\\u009b2J\\u202e\\u2066'),
  );
  assert.ok(
    [...text].every((c) => {
      const n = c.codePointAt(0);
      return n === 10 || (n > 31 && !(n >= 127 && n <= 159) && n !== 0x202e && n !== 0x2066);
    }),
  );
  assert.ok(render(model([paragraph(0, '\u001b')]), { format: 'markdown' }).includes('\\\\u001b'));
});

test('headers and footers emit own odd/even definitions once without synthesizing inherited pages', () => {
  const m = model([paragraph(1, 'Body')]);
  m.sections[0].header.definitions = [
    {
      id: 'header:1',
      kind: 'header',
      apply: 'odd',
      source: { section: 0, ownerNode: 1, listNode: 2 },
      range: { state: 'unresolved' },
      blocks: [paragraph(0, 'Own header')],
    },
  ];
  m.sections[0].footer = {
    declarations: 'unavailable',
    definitions: [
      {
        id: 'footer:1',
        kind: 'footer',
        apply: null,
        source: { section: 0 },
        range: { state: 'observed', from: 0, to: 2 },
        blocks: [paragraph(2, 'Own footer')],
      },
    ],
    inheritance: { state: 'observed', fromSection: 0, definitionId: 'external:footer' },
  };
  const text = render(m);
  assert.equal(text.split('Own header').length - 1, 1);
  assert.equal(text.split('Own footer').length - 1, 1);
  assert.ok(text.indexOf('Own header') < text.indexOf('): Body'));
  assert.ok(text.indexOf('): Body') < text.indexOf('Own footer'));
  assert.ok(text.includes('apply=odd range=unresolved'));
  assert.ok(text.includes('apply=unknown range=observed from=0 to=2'));
  assert.ok(text.includes('page-area declarations unavailable'));
  assert.ok(text.includes('Inherited source section=0 definition=external:footer'));
});

test('sparse billion-row table renders each merged cell once and never materializes a dense grid', () => {
  const c = cell([paragraph(7, 'Merged')]);
  Object.assign(c, {
    row: 999_999_999,
    column: 999_999_998,
    rowSpan: 1,
    columnSpan: 2,
    width: 123,
    border: 'secret',
  });
  const t = table([c]);
  t.rows = 1_000_000_000;
  t.columns = 1_000_000_000;
  const text = render(model([t]));
  assert.ok(text.length < 1000);
  assert.ok(text.includes('row=999999999 column=999999998 rowSpan=1 columnSpan=2'));
  assert.equal(text.split('Cell c:0').length - 1, 1);
  assert.equal(text.split('Merged').length - 1, 1);
  assert.equal(text.includes('width=123'), false);
  assert.equal(text.includes('secret'), false);
});

test('nested table cells keep source traversal order, not sorted geometric guesses', () => {
  const first = cell([
    paragraph(0, 'first'),
    { ...table([{ ...cell([paragraph(1, 'nested')]), id: 'nested:cell' }]), id: 'nested:table' },
  ]);
  first.row = 5;
  const last = { ...cell([paragraph(2, 'last')]), id: 'c:last', row: 0 };
  const text = render(model([table([first, last])]));
  assert.ok(text.indexOf('): first') < text.indexOf('): nested'));
  assert.ok(text.indexOf('): nested') < text.indexOf('): last'));
});

test('unknown cell metadata remains unknown, with no invented empty cells or 1x1 spans', () => {
  const c = {
    ...cell([]),
    row: null,
    column: null,
    rowSpan: null,
    columnSpan: null,
    geometryKnown: false,
    contentState: 'unavailable',
  };
  const t = { ...table([c]), rows: null, columns: null };
  const text = render(model([t]));
  assert.ok(text.includes('rows=unknown columns=unknown'));
  assert.ok(
    text.includes(
      'row=unknown column=unknown rowSpan=unknown columnSpan=unknown [geometry unknown] content=unavailable',
    ),
  );
});

test('image placeholders report only observed metadata and distinguish unavailable alt from absence', () => {
  const image = {
    id: 'image:1',
    type: 'image',
    label: 'image',
    alt: null,
    altState: 'not-exposed',
    sourceInfo: { section: 0, pictureNode: 30, raw: 'SECRET-IMAGE' },
    width: 7200,
    height: null,
    sizeUnit: 'HWPUNIT',
  };
  const second = { ...image, id: 'image:2', alt: '', altState: 'not-provided', width: undefined };
  const third = {
    ...image,
    id: 'image:3',
    alt: 'A [picture]',
    altState: 'provided',
    width: undefined,
    height: undefined,
  };
  const text = render(model([image, second, third]));
  assert.ok(
    text.includes(
      '[Image image:1; alt not observed section=0 pictureNode=30 width=7200 height=unknown unit=HWPUNIT]',
    ),
  );
  assert.ok(text.includes('alt not provided'));
  assert.ok(text.includes('alt=A [picture]'));
  assert.equal(text.includes('SECRET-IMAGE'), false);
  assert.equal(text.includes('px'), false);
});

test('unknown, unplaced and incomplete inventories remain explicit warnings, not recovered raw text', () => {
  const m = model();
  m.unplaced = [
    {
      block: {
        id: 'unknown:1',
        type: 'unknown',
        kind: 'unsupported',
        raw: 'DO NOT RECOVER',
        diagnostic: { code: 'UnknownOwner', message: 'No proven parent\u001b' },
      },
      diagnostic: { code: 'Unplaced', message: 'Reading order unknown' },
    },
  ];
  m.warnings.push({ code: 'Partial', message: 'Section unavailable' });
  m.coverage.inventoryComplete = false;
  const text = render(m);
  assert.ok(text.includes('Unplaced\n[Warning: Unplaced: Reading order unknown]'));
  assert.ok(
    text.includes('[Unknown unknown:1; unsupported; UnknownOwner: No proven parent\\u001b]'),
  );
  assert.ok(text.includes('Inventory incomplete; this view is partial.'));
  assert.ok(text.includes('Partial: Section unavailable'));
  assert.equal(text.includes('DO NOT RECOVER'), false);
});

test('HWPX preserves document-wide native ordinals and never relabels them zero-based', () => {
  const m = model([paragraph(91, 'Global ordinal')]);
  m.format = 'hwpx';
  assert.ok(render(m).includes('Paragraph s0:p91 (native paragraph=91):'));
  m.sections[0].body[0] = paragraph(0);
  assert.throws(() => render(m), /Coordinate/);
});

test('readonly model observations are not renderer edit authority and deprecated boolean is rejected', () => {
  for (const editability of ['read-only', 'unknown', 'range-check-required'])
    assert.ok(render(model([paragraph(0, 'text', { editability })])).includes('text'));
  assert.throws(
    () => render(model([paragraph(0, '', { editability: undefined, editable: true })])),
    /Editability/,
  );
});

test('reject malformed versions, block kinds, coordinates, holes, diagnostics and optional shapes', () => {
  assert.throws(() => renderDocument(model(), { format: 'html' }), /Format/);
  assert.throws(() => render({ ...model(), version: 2 }), /Version/);
  assert.throws(() => render(model([{ id: 'x', type: 'html', text: 'raw' }])), /BlockType/);
  assert.throws(() => render(model([paragraph(-1)])), /Coordinate/);
  assert.throws(() => render(model([table([{ ...cell(), rowSpan: 0 }])])), /Coordinate/);
  const hole = [paragraph()];
  delete hole[0];
  assert.throws(() => render(model(hole)), /Object/);
  assert.throws(() => render({ ...model(), warnings: [{ code: 'x' }] }), /String/);
  assert.throws(
    () =>
      render(model([{ id: 'i', type: 'image', alt: null, altState: 'provided', sourceInfo: {} }])),
    /ProvidedImageAlt/,
  );
});

test('reject containment cycles, shared subtrees and duplicate IDs without recursion overflow', () => {
  const t = table(),
    c = cell([t]);
  t.cells.push(c);
  assert.throws(() => render(model([t])), /RepeatedRenderNodeOrCycle|Duplicate/);
  const p = paragraph();
  assert.throws(() => render(model([p, p])), /RepeatedRenderNode/);
  assert.throws(() => render(model([paragraph(), paragraph()])), /Duplicate/);
});

test('depth and string budgets reject full input before any partial output is returned', () => {
  const t = table([cell([paragraph()])]);
  assert.throws(() => render(model([t]), { maxDepth: 1 }), /DepthLimit/);
  assert.throws(
    () => render(model([paragraph(0, 'a'.repeat(100))]), { maxTextUnits: 50 }),
    /TextLimit/,
  );
  assert.throws(() => render(model(), { maxNodes: 2 }), /NodeLimit/);
  assert.throws(() => render(model(), { maxOutputUnits: 10 }), /OutputLimit/);
  for (const options of [
    { maxDepth: 33 },
    { maxNodes: 0 },
    { maxTextUnits: Infinity },
    { maxOutputUnits: 33 * 1024 * 1024 },
  ])
    assert.throws(() => render(model(), options), /InvalidRenderLimit/);
});

test('large flat source remains linear and keeps every explicit sparse paragraph exactly once', () => {
  const m = model(Array.from({ length: 10_000 }, (_, i) => paragraph(i, 'line' + i)));
  const text = render(m);
  assert.equal(text.split('Paragraph ').length - 1, 10_000);
  assert.ok(text.includes('Paragraph s0:p9999 (native paragraph=9999): line9999'));
});

test('empty observed displayText is empty and never falls back to Native control payload text', () => {
  const raw = '\u0002捤獥RAW-NATIVE-SECRET';
  const m = model([paragraph(0, raw, { displayText: '', text: raw })]);
  const text = render(m);
  assert.ok(text.includes('Paragraph s0:p0 (native paragraph=0): \n'));
  assert.equal(text.includes('捤獥'), false);
  assert.equal(text.includes('RAW-NATIVE-SECRET'), false);
  assert.equal(render(m, { format: 'markdown' }).includes('RAW-NATIVE'), false);
});

test('display text uses only known preview text, ignoring unexpected raw Native text unchanged', () => {
  const m = frozen(
    model([
      paragraph(0, '\u0002捤獥\u0000ControlPayload', {
        displayText: 'Readable sentence🙂',
        text: '\u0002捤獥\u0000ControlPayload',
      }),
    ]),
  );
  const text = render(m);
  assert.ok(text.includes('Readable sentence🙂'));
  assert.equal(text.includes('ControlPayload'), false);
  assert.equal(text.includes('捤獥'), false);
  assert.equal(m.sections[0].body[0].text, '\u0002捤獥\u0000ControlPayload');
});

test('unobserved displayText is explicit unknown with reason; missing property is schema error', () => {
  const m = model([
    paragraph(0, 'RAW-PAYLOAD', {
      displayText: null,
      reason: 'PreviewUnavailable',
      text: 'RAW-PAYLOAD',
    }),
  ]);
  assert.ok(render(m).includes('[Unknown display text: PreviewUnavailable]'));
  assert.equal(render(m).includes('RAW-PAYLOAD'), false);
  m.sections[0].body[0].reason = undefined;
  assert.ok(render(m).includes('[Unknown display text: not observed]'));
  delete m.sections[0].body[0].displayText;
  assert.throws(() => render(m), /InvalidDocumentView/);
});

test('unexpected raw Native text is not read or counted toward display budgets', () => {
  const p = paragraph(0, '', { text: 'a'.repeat(100000) });
  assert.ok(render(model([p]), { maxTextUnits: 50 }).includes('native paragraph=0): \n'));
  Object.defineProperty(p, 'text', {
    get() {
      throw Error('RawTextMustNotBeRead');
    },
  });
  assert.doesNotThrow(() => render(model([p])));
});

test('all emitted metadata, not only paragraph text, escapes terminal and Markdown syntax', () => {
  const image = {
    id: 'image:\u001b]8;;url',
    type: 'image',
    alt: 'A\u0007<svg>',
    altState: 'provided',
    sourceInfo: { section: 0, resourceId: 123 },
    sizeUnit: 'hu\u001b',
    width: 1,
  };
  const m = model([image]);
  m.warnings = [{ code: '\u001b[2J', message: '<b>warning\u0007' }];
  const text = render(m, { format: 'markdown' });
  assert.equal(text.includes('\u001b'), false);
  assert.equal(text.includes('\u0007'), false);
  assert.equal(text.includes('<svg>'), false);
  assert.equal(text.includes('<b>'), false);
  assert.ok(text.includes('resourceId=123'));
});

test('inherited displayText and invalid explicit limits never become permissive text fallbacks', () => {
  const p = paragraph(0, 'RAW-INTERNAL');
  delete p.displayText;
  Object.setPrototypeOf(p, { displayText: 'inherited' });
  assert.throws(() => render(model([p])), /InvalidDocumentView/);
  assert.throws(() => render(model(), { maxOutputUnits: -1 }), /InvalidRenderLimit/);
});

test('adversarial Unicode: isolated high/low surrogates escape visibly but real emoji remain exact', () => {
  const input = model([paragraph(0, '\ud800🙂\udfff')]);
  for (const format of ['text', 'markdown']) {
    const text = render(input, { format });
    assert.equal(text.isWellFormed(), true);
    assert.ok(text.includes('🙂'));
    assert.ok(text.includes(format === 'text' ? '\\ud800🙂\\udfff' : '\\\\ud800🙂\\\\udfff'));
    assert.equal(input.sections[0].body[0].displayText, '\ud800🙂\udfff');
  }
});

test('adversarial model integration: a truncated observation error cannot suppress readable document text', async () => {
  const { readDocumentModel } = await import('../src/document-model.mjs');
  const message = 'x'.repeat(511 - 'pictureSources: '.length) + '🙂';
  const sdk = {
    currentTextPreview: () => ({
      sections: [
        { index: 0, paragraphs: [{ nodeIndex: 7, text: 'Readable content', textPresent: true }] },
      ],
    }),
    paragraphCount: () => 1,
    paragraphFlow: () => [
      {
        paragraph: 0,
        source_node: 7,
        template_node: 7,
        generated: false,
        host: 'body',
        top_level: true,
      },
    ],
    tableBindings: () => [],
    tablePlacements: () => [],
    tableLayoutSources: () => [],
    cellLayoutSources: () => [],
    pageAreaSources: () => [],
    tableAnchors: () => [],
    drawingSources: () => [],
    drawingAnchors: () => [],
    pictureSources: () => {
      throw Error(message);
    },
  };
  const input = await readDocumentModel({
    format: 'hwp5',
    sourceSha256: 'a'.repeat(64),
    sectionCount: 1,
    sdk,
  });
  const before = structuredClone(input);
  for (const format of ['text', 'markdown']) {
    const output = render(input, { format });
    assert.equal(output.isWellFormed(), true, 'host must be able to publish the logical view');
    assert.ok(output.includes('Readable content'));
    assert.ok(output.includes('ObservationUnavailable:'));
  }
  assert.deepEqual(input, before);
});

test('adversarial budgets count lone-surrogate display expansion including Markdown backslashes', () => {
  for (const format of ['text', 'markdown']) {
    const baseline = render(model([paragraph(0, '')]), { format }).length;
    const input = model([paragraph(0, '\ud800')]);
    const extra = format === 'text' ? 6 : 7;
    assert.equal(render(input, { format }).length, baseline + extra);
    assert.throws(
      () => render(input, { format, maxOutputUnits: baseline + extra - 1 }),
      /OutputLimit/,
    );
    assert.equal(
      render(input, { format, maxOutputUnits: baseline + extra }).length,
      baseline + extra,
    );
  }
});

test('adversarial Unicode diagnostics and alt metadata never emit malformed terminal strings', () => {
  const input = model([
    {
      id: 'image:\ud800',
      type: 'image',
      alt: 'alt\udfff🙂',
      altState: 'provided',
      sourceInfo: { pictureNode: 7 },
      width: 3,
      sizeUnit: '\ud800units',
    },
  ]);
  input.warnings = [{ code: 'truncated\udfff', message: 'warning\ud800' }];
  for (const format of ['text', 'markdown']) {
    const output = render(input, { format });
    assert.equal(output.isWellFormed(), true);
    assert.ok(output.includes('🙂'));
    assert.ok(output.includes('ud800'));
    assert.ok(output.includes('udfff'));
  }
});
