import test from 'node:test';
import assert from 'node:assert/strict';
import { observeHwp5ChartContent } from '../../document/src/hwp5-chart-content.ts';
import { renderDocument } from '../../document/src/render.ts';
import { buildObjectReference } from '../../document/src/object-reference.ts';
import { display, candidates } from '../../../tests/hwp5/chart-display-wire-fixture.mjs';
function fixture() {
  const d = display(),
    c = candidates();
  d.section = 0;
  c.candidates[0].section = 0;
  const sha = 'a'.repeat(64),
    ref = buildObjectReference({
      sourceSha256: sha,
      format: 'hwp5',
      section: 0,
      kind: 'drawing',
      node: d.owner.component_node,
    });
  const block = {
    id: 'o1',
    type: 'unknown',
    kind: 'drawing',
    nativeKind: 0x246f6c65,
    source: { section: 0, node: d.owner.component_node },
    reference: ref,
    diagnostic: { code: 'ObjectDetailsDeferred', message: 'deferred' },
  };
  const area = () => ({
    declarations: 'known',
    inheritance: { state: 'unresolved' },
    definitions: [],
  });
  const model = {
    version: 1,
    format: 'hwp5',
    sourceSha256: sha,
    sections: [{ id: 's0', source: { section: 0 }, header: area(), footer: area(), body: [block] }],
    unplaced: [],
    warnings: [],
    coverage: { inventoryComplete: false },
  };
  const calls = [];
  const sdk = {
    supportsHwp5ChartDisplayAbi: () => true,
    hwp5ChartCandidates: () => c,
    hwp5ChartDisplay: (...args) => {
      calls.push(args);
      return d;
    },
  };
  return { d, c, block, model, sdk, calls, ref };
}
test('verified semantic read preserves drawing reference and uses control identity', () => {
  const f = fixture();
  observeHwp5ChartContent(f.model, f.sdk);
  assert.deepEqual(f.calls, [[0, f.d.owner.control_node]]);
  assert.equal(f.block.kind, 'drawing');
  assert.equal(f.block.reference, f.ref);
  for (const format of ['text', 'markdown']) {
    const text = renderDocument(f.model, { format, view: 'content' });
    assert.match(text, /차트 1/);
    assert.match(text, /doughnutChart/);
    assert.match(text, /값 0/);
    assert.ok(text.includes(f.ref));
    assert.doesNotMatch(text, /내용 확인 불가/);
    assert.ok(!text.includes('\\u000a'));
  }
});
test('old ABI and unresolved resource retain generic fallback', () => {
  for (const unavailable of ['abi', 'resource']) {
    const f = fixture();
    if (unavailable === 'abi') f.sdk.supportsHwp5ChartDisplayAbi = () => false;
    else
      f.c.candidates[0].resource = {
        state: 'unresolved_ole',
        error_name: 'UnknownOle',
        physical_id: null,
        resource_sha256: null,
        stream_entry: null,
        legacy_backup_present: null,
        presentation_streams: null,
      };
    observeHwp5ChartContent(f.model, f.sdk);
    assert.equal(f.block.hwp5ChartText, undefined);
    assert.deepEqual(f.calls, []);
    assert.match(renderDocument(f.model, { format: 'text' }), /내용 확인 불가/);
  }
});
test('epoch resource and owner mismatch never publish semantic text', () => {
  for (const field of ['source_epoch', 'resource_sha256', 'owner']) {
    const f = fixture();
    if (field === 'source_epoch') f.d.source_epoch = '10';
    else if (field === 'resource_sha256') f.d.resource_sha256[0]++;
    else f.d.owner.attributes++;
    observeHwp5ChartContent(f.model, f.sdk);
    assert.equal(f.block.hwp5ChartText, undefined);
    assert.equal(f.model.warnings[0].code, 'Hwp5ChartContentUnavailable');
  }
});
test('text budget and escaping remain enforced', () => {
  const f = fixture();
  observeHwp5ChartContent(f.model, f.sdk);
  f.block.hwp5ChartText = '<script> [x](https://example.invalid)';
  assert.ok(!renderDocument(f.model, { format: 'markdown' }).includes('<script>'));
  assert.throws(
    () => renderDocument(f.model, { format: 'text', maxTextUnits: 1 }),
    /RenderTextLimitExceeded/,
  );
  f.block.nativeKind = 1;
  assert.throws(() => renderDocument(f.model, { format: 'text' }), /InvalidHwp5ChartContent/);
});

test('per-read candidates fetched and decoded once for many objects with direct component lookup', () => {
  const f = fixture(),
    originals = f.model.sections[0].body;
  const entries = [],
    displays = new Map();
  originals.length = 0;
  for (let i = 0; i < 64; i++) {
    const d = structuredClone(f.d),
      shift = i * 10;
    for (const field of ['control_node', 'component_node', 'ole_node']) d.owner[field] += shift;
    for (const field of ['control_node', 'component_node']) d.owner.geometry[field] += shift;
    const row = structuredClone(f.c.candidates[0]);
    row.owner = structuredClone(d.owner);
    entries.push(row);
    displays.set(d.owner.control_node, d);
    const block = structuredClone(f.block);
    block.id = 'o' + i;
    block.source.node = d.owner.component_node;
    block.reference = buildObjectReference({
      sourceSha256: f.model.sourceSha256,
      format: 'hwp5',
      section: 0,
      kind: 'drawing',
      node: block.source.node,
    });
    originals.push(block);
  }
  let requests = 0,
    decodes = 0,
    displayRequests = 0;
  const packet = {
    ...f.c,
    candidates: entries,
    toJSON() {
      decodes++;
      return { ...f.c, candidates: entries };
    },
  };
  f.sdk.hwp5ChartCandidates = () => {
    requests++;
    return packet;
  };
  f.sdk.hwp5ChartDisplay = (_section, node) => {
    displayRequests++;
    return displays.get(node);
  };
  observeHwp5ChartContent(f.model, f.sdk);
  assert.equal(requests, 1);
  assert.equal(decodes, 1);
  assert.equal(displayRequests, 64);
  assert.ok(originals.every((block) => typeof block.hwp5ChartText === 'string'));
});

test('ambiguous component from distinct controls is refused without display lookup', () => {
  const f = fixture();
  const duplicate = structuredClone(f.c.candidates[0]);
  duplicate.owner.control_node = 3;
  duplicate.owner.geometry.control_node = 3;
  f.c.candidates.push(duplicate);
  observeHwp5ChartContent(f.model, f.sdk);
  assert.deepEqual(f.calls, []);
  assert.equal(f.block.hwp5ChartText, undefined);
  assert.equal(f.model.warnings[0].code, 'Hwp5ChartContentUnavailable');
});

test('large child lists use bounded individual pushes rather than argument spread', () => {
  const f = fixture();
  const children = Array.from({ length: 140000 }, (_, i) => ({
    id: 'u' + i,
    type: 'unknown',
    kind: 'drawing',
    nativeKind: 1,
  }));
  f.model.sections[0].body.push({ id: 't', type: 'table', cells: [{ blocks: children }] });
  observeHwp5ChartContent(f.model, f.sdk);
  assert.equal(typeof f.block.hwp5ChartText, 'string');
});

test('escaped expansion exhausts semantic budget without publishing a partial result', () => {
  const f = fixture();
  f.d.data.points[0].value = '\u0001'.repeat(800000);
  observeHwp5ChartContent(f.model, f.sdk);
  assert.equal(f.block.hwp5ChartText, undefined);
  assert.equal(f.model.warnings[0].message, 'ChartContentTextLimitExceeded');
});
