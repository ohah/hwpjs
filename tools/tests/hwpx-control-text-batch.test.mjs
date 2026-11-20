import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeControlTextSnapshot,
  createHwpxControlTextBatchApi,
} from '../../js/hwpx-control-text-batch.mjs';
import { collectHwpx } from '../../packages/document/src/model/hwpx.ts';
const wire = () => ({
  schemaVersion: 1,
  axis: 'native-control-utf16',
  section: 0,
  readStamp: { session: 's1', serial: '0' },
  coverage: 'complete',
  rows: [
    {
      paragraph: 4,
      sourceNode: 31,
      plain: 'A😀￼B',
      text: 'A😀￼￼\nB',
      units: 7,
      controls: [
        { kind: 'anchor', node: 36, startUnit: 3, endUnit: 4 },
        { kind: 'line_break', node: 40, startUnit: 5, endUnit: 6 },
      ],
      coverage: 'complete',
      issue: null,
    },
  ],
});
function sdk() {
  return {
    paragraphTextSnapshot: () => [{ paragraph: 4, text: 'A😀￼B' }],
    paragraphFlow: () => [{ paragraph: 4, source_node: 31, host: 'body', top_level: true }],
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
  };
}
test('strict Native rows preserve separate literal/control FFFC and exact UTF16 axis', () => {
  const decoded = decodeControlTextSnapshot(wire(), 0);
  assert.equal(decoded.rows[0].text, 'A😀￼￼\nB');
  assert.equal(decoded.rows[0].controls[0].startUnit, 3);
  assert(Object.isFrozen(decoded.rows[0].controls));
});
test('malformed owner ordinal UTF16 marker and coverage cannot become a Native batch', () => {
  for (const mutate of [
    (v) => (v.rows[0].paragraph = 0),
    (v) => (v.rows[0].controls[0].startUnit = 2),
    (v) => (v.rows[0].controls[0].node = -1),
    (v) => (v.rows[0].text = 'wrong'),
    (v) => (v.coverage = 'partial'),
    (v) => v.rows.push({ ...v.rows[0] }),
  ]) {
    const v = wire();
    mutate(v);
    assert.throws(() => decodeControlTextSnapshot(v, 0), /InvalidHwpxControlTextSnapshot/);
  }
  assert.throws(() => decodeControlTextSnapshot(wire(), 1));
});
test('partial Native row stays explicit and cannot expose visible-axis text', () => {
  const v = wire();
  v.coverage = 'partial';
  v.rows[0] = {
    ...v.rows[0],
    coverage: 'partial',
    issue: 'UnknownControl',
    text: null,
    controls: [],
  };
  assert.equal(decodeControlTextSnapshot(v, 0).rows[0].text, null);
  v.rows[0].text = 'untrusted';
  assert.throws(() => decodeControlTextSnapshot(v, 0));
});
test('old SDK and throwing batch retain plain text and make zero per-paragraph anchor calls', () => {
  for (const mode of ['missing', 'throw']) {
    const value = sdk();
    let anchor = 0,
      batch = 0;
    value.anchorText = () => {
      anchor++;
      throw Error('must not run');
    };
    if (mode === 'throw')
      value.paragraphControlTextSnapshot = () => {
        batch++;
        throw Error('old ABI');
      };
    const result = collectHwpx({ sdk: value, sectionCount: 1 });
    assert.equal(anchor, 0);
    assert.equal(batch, mode === 'throw' ? 1 : 0);
    assert.equal(result.sections[0].paragraphs[0].displayText, 'A😀￼B');
    assert(result.warnings.some((w) => w.code === 'ControlAwareBatchUnavailable'));
  }
});
test('one batch per section cannot issue another section or Native owner', () => {
  const value = sdk();
  let calls = 0;
  value.anchorText = () => assert.fail('no anchor fallback');
  value.paragraphControlTextSnapshot = () => {
    calls++;
    return wire();
  };
  let result = collectHwpx({ sdk: value, sectionCount: 1 });
  assert.equal(calls, 1);
  assert.equal(result.sections[0].paragraphs[0].displayText, 'A😀￼￼\nB');
  value.paragraphControlTextSnapshot = () => {
    const v = wire();
    v.rows[0].sourceNode = 32;
    return v;
  };
  result = collectHwpx({ sdk: value, sectionCount: 1 });
  assert.equal(result.sections[0].paragraphs[0].displayText, 'A😀￼B');
  assert(result.warnings.some((w) => w.code === 'ControlAwareTextMismatch'));
});
test('current batch FFI releases every identity/batch output even if strict decoding fails', () => {
  for (const valid of [true, false]) {
    let freed = 0,
      current;
    const value = { ...wire(), schemaVersion: 2 };
    const identity = {
      schemaVersion: 1,
      scope: 'native-control-text-identity',
      executionAuthority: false,
      section: 0,
      firstParagraph: value.rows[0].paragraph,
      paragraphCount: value.rows.length,
      readBinding: {
        session: value.readStamp.session,
        epoch: value.readStamp.session.slice(1),
        serial: value.readStamp.serial,
      },
    };
    const emit = (x) => {
      current = new TextEncoder().encode(JSON.stringify(x));
      return 1;
    };
    const api = createHwpxControlTextBatchApi({
      check() {},
      wasm: {
        hwpx_edit_control_text_read_identity: () => emit(identity),
        hwpx_edit_paragraph_control_text_snapshot_current: () =>
          emit(valid ? value : { bad: true }),
        hwpx_edit_output_len: () => current.length,
        hwpx_edit_output_ptr: () => 8,
        hwpx_edit_output_free: () => freed++,
      },
      memory: { copy: () => current, error: () => Error('native') },
    });
    if (valid) assert.equal(api.paragraphControlTextSnapshot(0).rows.length, 1);
    else assert.throws(() => api.paragraphControlTextSnapshot(0));
    assert.equal(freed, valid ? 3 : 2);
  }
});

test('wire snapshot never invokes row/control array accessors and rejects sparse arrays', () => {
  for (const part of ['rows', 'controls']) {
    let calls = 0;
    const v = wire();
    const list = part === 'rows' ? v.rows : v.rows[0].controls;
    Object.defineProperty(list, 0, {
      get() {
        calls++;
        return null;
      },
    });
    assert.throws(() => decodeControlTextSnapshot(v, 0), /InvalidHwpxControlTextSnapshot/);
    assert.equal(calls, 0);
  }
  const v = wire();
  delete v.rows[0];
  assert.throws(() => decodeControlTextSnapshot(v, 0));
});
test('complete wire cannot substitute another visible text axis while keeping plain owner text', () => {
  const v = wire();
  v.rows[0].text = 'Z😀￼￼\nB';
  assert.throws(() => decodeControlTextSnapshot(v, 0));
});
test('optional batch registration stays separate from required ABI and Native regular graph', async () => {
  const { readFile } = await import('node:fs/promises');
  const { HWPX_CONTROL_TEXT_READ_FUNCTIONS, REQUIRED_FUNCTIONS } =
    await import('../../js/abi-schema.mjs');
  assert.deepEqual(HWPX_CONTROL_TEXT_READ_FUNCTIONS, [
    'hwpx_edit_paragraph_control_text_snapshot',
    'hwpx_edit_paragraph_control_text_snapshot_current',
    'hwpx_edit_control_text_read_identity',
  ]);
  assert.equal(REQUIRED_FUNCTIONS.length, 29);
  assert(!REQUIRED_FUNCTIONS.includes('hwpx_edit_paragraph_control_text_snapshot'));
  const build = await readFile(new URL('../../build.zig', import.meta.url), 'utf8');
  assert(build.includes('src/control_text_read_context_probe.zig'));
  assert(build.includes('test-control-text-read-context'));
  const { documentSearchTargets } = await import('../document-search-native-registration.mjs');
  const registrations = documentSearchTargets(build).filter((row) =>
    [
      'src/control_text_read_context_probe.zig',
      'src/control_text_read_paragraph_coverage_probe.zig',
    ].includes(row.path),
  );
  assert.equal(registrations.length, 2);
  assert.deepEqual(
    registrations.map((row) => row.filter),
    ['control text batch Native', 'control paragraph coverage Native'],
  );
  assert.deepEqual(
    registrations.map((row) => row.named),
    [13, 3],
  );
  assert(build.includes('control_text_read_step.dependOn(&run.step)'));
  assert(build.includes('editor_extensions_step.dependOn(control_text_read_step)'));
  const root = await readFile(
    new URL('../../src/control_text_read_context_probe.zig', import.meta.url),
    'utf8',
  );
  const coverage = await readFile(
    new URL('../../src/control_text_read_paragraph_coverage_probe.zig', import.meta.url),
    'utf8',
  );
  assert(root.includes('@import("control_text_read_paragraph_coverage_probe.zig")'));
  const names = [
    ...root.matchAll(/^test "(control text batch Native[^"\n]+)"/gmu),
    ...coverage.matchAll(/^test "(control paragraph coverage Native[^"\n]+)"/gmu),
  ].map((match) => match[1]);
  assert.equal(names.length, 16);
  assert.equal(new Set(names).size, 16);
  assert(build.includes('core_test_step.dependOn(&run.step)'));

  assert(build.includes('control text batch Native'));
  const collect = await readFile(
    new URL('../../packages/document/src/model/control-aware-text.ts', import.meta.url),
    'utf8',
  );
  assert(!/sdk\.anchorText|Reflect\.apply\([^\n]*anchorText/.test(collect));
});

test('ten thousand paragraph old-SDK reads make zero anchor calls and retain one grouped diagnostic', async () => {
  const { renderDocument } = await import('../../packages/document/src/render.ts');
  const { readDocumentModel } = await import('../../packages/document/src/document-model.ts');
  const value = sdk();
  let anchors = 0;
  value.anchorText = () => {
    anchors++;
    assert.fail('quadratic fallback');
  };
  value.paragraphTextSnapshot = () =>
    Array.from({ length: 10000 }, (_, i) => ({ paragraph: i + 1, text: 'P' }));
  value.paragraphFlow = () =>
    Array.from({ length: 10000 }, (_, i) => ({
      paragraph: i + 1,
      source_node: i + 1,
      host: 'body',
      top_level: true,
    }));
  const model = await readDocumentModel({
    sdk: value,
    sectionCount: 1,
    format: 'hwpx',
    sourceSha256: 'a'.repeat(64),
  });
  const out = renderDocument(model, { format: 'text' });
  assert.equal(anchors, 0);
  assert.equal(out.split('부분 읽기: ControlAwareBatchUnavailable').length - 1, 1);
  assert(out.includes('영향 문단 10000개'));
});
test('ten thousand full rows use exactly one batch and no paragraph query', () => {
  const value = sdk();
  let batches = 0;
  value.anchorText = () => assert.fail('per-paragraph query');
  const rows = Array.from({ length: 10000 }, (_, i) => ({
    paragraph: i + 1,
    sourceNode: i + 1,
    plain: 'P',
    text: 'P',
    units: 1,
    controls: [],
    coverage: 'complete',
    issue: null,
  }));
  value.paragraphTextSnapshot = () => rows.map((r) => ({ paragraph: r.paragraph, text: r.plain }));
  value.paragraphFlow = () =>
    rows.map((r) => ({
      paragraph: r.paragraph,
      source_node: r.sourceNode,
      host: 'body',
      top_level: true,
    }));
  value.paragraphControlTextSnapshot = () => {
    batches++;
    return { ...wire(), rows };
  };
  const out = collectHwpx({ sdk: value, sectionCount: 1 });
  assert.equal(batches, 1);
  assert.equal(out.sections[0].paragraphs.length, 10000);
  assert.deepEqual(out.warnings, []);
});
