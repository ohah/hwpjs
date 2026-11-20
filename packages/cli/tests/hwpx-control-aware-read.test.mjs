import { controlTextWire, marker } from './control-text-wire-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectHwpx } from '../../document/src/model/hwpx.ts';
import { readDocumentModel } from '../../document/src/document-model.ts';
import { renderDocument } from '../../document/src/render.ts';
const hash = 'a'.repeat(64);
function fixture({ plain = '앞😀뒤', projected = '앞😀\ufffc\n\t뒤', sectionCount = 1 } = {}) {
  const calls = [];
  const sdk = {
    paragraphTextSnapshot: (section) => [{ paragraph: 4 + section * 4, text: plain, nested: true }],
    paragraphFlow: (section) => [
      { paragraph: 4 + section * 4, source_node: 31, host: 'body', top_level: true },
    ],
    paragraphControlTextSnapshot(section) {
      const paragraph = 4 + section * 4;
      calls.push([section, paragraph]);
      return controlTextWire({
        section,
        paragraph,
        plain,
        text: projected,
        controls:
          projected === '앞😀\ufffc\n\t뒤'
            ? [marker('anchor', 36, 3), marker('line_break', 40, 4), marker('tab', 41, 5)]
            : projected === 'A\n\tB'
              ? [marker('line_break', 40, 1), marker('tab', 41, 2)]
              : projected === 'A\nB<script>\u001b'
                ? [marker('line_break', 40, 1)]
                : [],
      });
    },
    tableBindings: () => [],
    tablePlacements: () => [],
    tableBorderSources: () => ({ cells: [] }),
    pageAreaDeclarations: () => [],
    pictureSites: () => [],
    pictureOwners: () => [],
    chartSites: () => [],
    equationSites: () => [],
    oleSites: () => [],
    rectangleNodes: () => [],
    lineNodes: () => [],
    connectorNodes: () => [],
    ellipseSources: () => [],
    drawingTextBindings: () => [],
    save() {
      assert.fail('ObservationSdk must never save');
    },
    splice() {
      assert.fail('ObservationSdk must never mutate');
    },
  };
  const observe = () => collectHwpx({ sdk, sectionCount });
  const model = () => readDocumentModel({ format: 'hwpx', sourceSha256: hash, sectionCount, sdk });
  return { sdk, calls, observe, model };
}
test('read-only Native ordinal query retains LF TAB and object units in both sections', () => {
  const f = fixture({ sectionCount: 2 });
  const result = f.observe();
  assert.deepEqual(f.calls, [
    [0, 4],
    [1, 8],
  ]);
  assert.deepEqual(
    result.sections.map((s) => s.paragraphs[0].displayText),
    ['앞😀\ufffc\n\t뒤', '앞😀\ufffc\n\t뒤'],
  );
  assert.deepEqual(result.warnings, []);
});
test('newlines without objects and literal FFFC/TAB/LF are not guessed away', () => {
  for (const [plain, projected] of [
    ['AB', 'A\n\tB'],
    ['A\ufffcB', 'A\ufffcB'],
    ['A\n\tB', 'A\n\tB'],
  ]) {
    const f = fixture({ plain, projected });
    assert.equal(f.observe().sections[0].paragraphs[0].displayText, projected);
  }
});
test('mismatched or ambiguous Native ordinal ownership never calls paragraphControlTextSnapshot', () => {
  for (const flow of [
    [],
    [{ paragraph: 8, source_node: 31 }],
    [
      { paragraph: 4, source_node: 31 },
      { paragraph: 4, source_node: 32 },
    ],
  ]) {
    const f = fixture();
    f.sdk.paragraphFlow = () => flow;
    const observed = f.observe();
    assert.deepEqual(f.calls, []);
    assert.equal(observed.sections[0].paragraphs[0].displayText, '앞😀뒤');
    assert(observed.warnings.some((w) => w.code === 'ControlAwareOwnerUnverified'));
  }
});
test('old ABI or absent read method retains plain text with explicit incomplete-observation warning', () => {
  for (const absent of [true, false]) {
    const f = fixture();
    if (absent) delete f.sdk.paragraphControlTextSnapshot;
    else
      f.sdk.paragraphControlTextSnapshot = () => {
        throw Error('HwpxAnchorEditAbiUnavailable');
      };
    const observed = f.observe();
    assert.equal(observed.sections[0].paragraphs[0].displayText, '앞😀뒤');
    assert(observed.warnings.some((w) => w.code === 'ControlAwareBatchUnavailable'));
  }
});
test('readonly Native guard failure is recorded and is never retried as an edit', () => {
  const f = fixture();
  let calls = 0;
  f.sdk.paragraphControlTextSnapshot = () => {
    calls++;
    throw Error('UnsupportedStructuralFieldEdit');
  };
  const observed = f.observe();
  assert.equal(calls, 1);
  assert(observed.warnings.some((w) => w.code === 'ControlAwareBatchUnavailable'));
});
test('accessor, malformed Unicode, changed visible text and another paragraph content cannot replace snapshot text', () => {
  for (const projected of [null, '다른 문단', '앞\ud800뒤', '앞뒤', '뒤앞😀']) {
    const f = fixture({ projected });
    const observed = f.observe();
    assert.equal(observed.sections[0].paragraphs[0].displayText, '앞😀뒤');
    assert(observed.warnings.length > 0);
  }
  const f = fixture();
  Object.defineProperty(f.sdk, 'paragraphControlTextSnapshot', {
    get() {
      throw Error('accessor must not run');
    },
  });
  assert(f.observe().warnings.some((w) => w.code === 'ControlAwareBatchUnavailable'));
});
function object(f, { section = 0, kind = 'chart', unit = 3, node = 36 } = {}) {
  if (kind === 'chart')
    f.sdk.chartSites = (s) =>
      s === section
        ? [{ wrapper: node, paragraph: 4 + section * 4, anchorUnit: unit, error_name: null }]
        : [];
  else
    f.sdk.equationSites = (s) =>
      s === section
        ? [
            {
              source: { node, issue: null },
              paragraph: 4 + section * 4,
              anchor_unit: unit,
              error_name: null,
            },
          ]
        : [];
}
for (const format of ['text', 'markdown'])
  test(`${format} uses the existing verified reference exactly at UTF16 unit3 and preserves LF/TAB`, async () => {
    const f = fixture();
    object(f);
    const output = renderDocument(await f.model(), { format });
    const expected = `hwpjs-object:${hash}/hwpx/s0/chart/36`;
    assert.equal(output.split(expected).length - 1, 1);
    assert(output.indexOf('앞😀') < output.indexOf(expected));
    assert(output.indexOf(expected) < output.indexOf('뒤'));
    assert(!output.includes('앞😀뒤'));
    if (format === 'text') assert(output.includes('\n\t뒤'));
    else assert(output.includes('<br>&#9;뒤'));
  });
test('equation snake-case Native anchor and equal owner IDs across sections stay separate', async () => {
  const f = fixture({ sectionCount: 2 });
  object(f, { section: 1, kind: 'equation' });
  const output = renderDocument(await f.model(), { format: 'markdown' });
  const ref = `hwpjs-object:${hash}/hwpx/s1/equation/36`;
  assert.equal(output.split(ref).length - 1, 1);
  assert(output.includes(`앞😀[수식 1](${ref}) [내용 확인 불가]<br>&#9;뒤`));
  assert(output.includes('앞😀\ufffc<br>&#9;뒤'));
});
test('wrong inline unit keeps a standalone reference without moving another paragraph text', async () => {
  const f = fixture();
  object(f, { unit: 1 });
  const output = renderDocument(await f.model(), { format: 'text' });
  assert(output.includes('앞😀\ufffc\n\t뒤'));
  assert.equal(output.split(`hwpjs-object:${hash}/hwpx/s0/chart/36`).length - 1, 1);
});
test('ambiguous controls at the same UTF16 unit do not guess a reference owner', async () => {
  const f = fixture();
  object(f);
  object(f, { kind: 'equation', node: 37 });
  const output = renderDocument(await f.model(), { format: 'text' });
  assert(output.includes('앞😀\ufffc\n\t뒤'));
  for (const part of ['/chart/36', '/equation/37']) assert.equal(output.split(part).length - 1, 1);
});
test('Native LF is rendered, literal HTML/control bytes remain escaped', async () => {
  const f = fixture({ plain: 'AB<script>\u001b', projected: 'A\nB<script>\u001b' });
  const output = renderDocument(await f.model(), { format: 'markdown' });
  assert(output.includes('A<br>B\\<script\\>'));
  assert(!output.includes('\u001b'));
});
test('control-aware reads stay inside the existing readonly observation scope', () => {
  const f = fixture();
  let active = false,
    scopes = 0;
  f.sdk.withReadObservations = (section, read) => {
    assert.equal(section, 0);
    assert(!active);
    active = true;
    scopes++;
    try {
      return read();
    } finally {
      active = false;
    }
  };
  const actual = f.sdk.paragraphControlTextSnapshot;
  f.sdk.paragraphControlTextSnapshot = (section, paragraph) => {
    assert(active);
    return actual(section, paragraph);
  };
  f.observe();
  assert.equal(scopes, 1);
  assert(!active);
});
