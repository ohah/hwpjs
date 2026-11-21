import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkedObjectBodyFlow,
  checkedObjectBodyFlowObservation,
  checkedObjectBodyFlowRequest,
  createObjectBodyFlowApi,
} from '../../js/object-body-flow.mjs';
const wraps = ['SQUARE', 'TOP_AND_BOTTOM', 'BEHIND_TEXT', 'IN_FRONT_OF_TEXT'];
const sides = ['BOTH_SIDES', 'LEFT_ONLY', 'RIGHT_ONLY', 'LARGEST_ONLY'];
function observation() {
  return {
    geometry: {
      format: 'hwpx',
      selector: { kind: 'drawing', section: 0, node: 17 },
      owner: {
        ownerNode: 17,
        componentNode: null,
        paragraph: 0,
        anchorUnit: 0,
        sourceSha256: Array(32).fill(1),
        link: 'rect:owned',
      },
      frame: {
        width: 10,
        height: 20,
        horizontalOffset: 0,
        verticalOffset: 0,
        treatAsCharacter: false,
      },
      editable: { size: true, position: true },
      reason: null,
      historyRevision: 0,
      binding: { session: 'native-session', serial: '0' },
    },
    flow: { textWrap: 'SQUARE', textFlow: 'LEFT_ONLY' },
  };
}
function request(o = observation(), flow = o.flow) {
  const g = o.geometry;
  return {
    geometry: {
      selector: g.selector,
      owner: g.owner,
      expected: g.frame,
      historyRevision: g.historyRevision,
      binding: g.binding,
      patch: {},
    },
    expectedFlow: o.flow,
    flow,
  };
}
function mock() {
  let code = 1,
    frees = 0,
    writes = [];
  const data = new TextEncoder().encode(JSON.stringify(observation()));
  const wasm = {
    hwpx_edit_object_body_flow_version: () => 1,
    hwpx_edit_object_body_flow: () => 1,
    hwpx_edit_set_object_body_flow: () => code,
    hwpx_edit_output_len: () => data.length,
    hwpx_edit_output_ptr: () => 0,
    hwpx_edit_output_free: () => frees++,
  };
  const memory = {
    copy: () => data,
    error: () => Error('NativeDenied'),
    withBytes: (bytes, f) => {
      writes.push(JSON.parse(new TextDecoder().decode(bytes)));
      return f(0, bytes.length);
    },
  };
  return {
    wasm,
    memory,
    get frees() {
      return frees;
    },
    writes,
    set code(v) {
      code = v;
    },
    api: () => createObjectBodyFlowApi({ wasm, memory, check() {} }),
  };
}
test('all exact source enum combinations validate without defaulting', () => {
  for (const textWrap of wraps)
    for (const textFlow of sides)
      assert.deepEqual(checkedObjectBodyFlow({ textWrap, textFlow }), { textWrap, textFlow });
});
test('missing null unknown prototype and getter fields are rejected without evaluation', () => {
  let calls = 0;
  for (const x of [
    null,
    {},
    { textWrap: null, textFlow: 'BOTH_SIDES' },
    { textWrap: 'SQUARE', textFlow: null },
    { textWrap: 'square', textFlow: 'BOTH_SIDES' },
    { textWrap: 'SQUARE', textFlow: 'BOTH_SIDES', extra: true },
    Object.create({ textWrap: 'SQUARE', textFlow: 'BOTH_SIDES' }),
    {
      get textWrap() {
        calls++;
        return 'SQUARE';
      },
      textFlow: 'BOTH_SIDES',
    },
  ])
    assert.throws(() => checkedObjectBodyFlow(x));
  assert.equal(calls, 0);
});
test('non square writes preserve observed side; returning square can change side', () => {
  for (const oldWrap of wraps)
    for (const side of sides) {
      const o = observation();
      o.flow = { textWrap: oldWrap, textFlow: side };
      for (const textWrap of wraps) {
        assert.equal(
          checkedObjectBodyFlowRequest(request(o, { textWrap, textFlow: side })).flow.textFlow,
          side,
        );
        for (const next of sides)
          if (next !== side) {
            const r = request(o, { textWrap, textFlow: next });
            if (textWrap === 'SQUARE')
              assert.equal(checkedObjectBodyFlowRequest(r).flow.textFlow, next);
            else assert.throws(() => checkedObjectBodyFlowRequest(r), /InvalidObjectBodyFlow/);
          }
      }
    }
});
test('request requires full owner digest and empty geometry patch', () => {
  for (const mutation of [
    (r) => r.geometry.owner.sourceSha256.pop(),
    (r) => (r.geometry.owner.sourceSha256 = '00'.repeat(32)),
    (r) => (r.geometry.patch = { width: 1 }),
    (r) => (r.geometry.binding = null),
    (r) => (r.expectedFlow = null),
  ]) {
    const r = request();
    mutation(r);
    assert.throws(() => checkedObjectBodyFlowRequest(r));
  }
});
test('unavailable read fields cannot be interpreted as valid placement', () => {
  for (const mutation of [
    (o) => (o.flow = null),
    (o) => delete o.flow,
    (o) => (o.geometry.format = 'hwp5'),
    (o) => (o.geometry.editable.position = false),
    (o) => (o.geometry.frame.treatAsCharacter = true),
  ]) {
    const o = observation();
    mutation(o);
    assert.throws(() => checkedObjectBodyFlowObservation(o));
  }
});
test('legacy partial and wrong version ABIs refuse without read or write', () => {
  for (const missing of [
    'hwpx_edit_object_body_flow_version',
    'hwpx_edit_object_body_flow',
    'hwpx_edit_set_object_body_flow',
    'wrong-version',
  ]) {
    const m = mock();
    if (missing === 'wrong-version') m.wasm.hwpx_edit_object_body_flow_version = () => 2;
    else delete m.wasm[missing];
    const a = m.api();
    assert.equal(a.supportsObjectBodyFlow(), false);
    assert.throws(
      () => a.objectBodyFlow({ kind: 'drawing', section: 0, node: 17 }),
      /AbiUnavailable/,
    );
    assert.throws(() => a.setObjectBodyFlow(request()), /AbiUnavailable/);
    assert.equal(m.frees, 0);
    assert.equal(m.writes.length, 0);
  }
});
test('SDK per-instance scope rejects foreign captures and strips only its own namespace', () => {
  const m = mock(),
    a = m.api(),
    b = m.api();
  const o = a.objectBodyFlow({ kind: 'drawing', section: 0, node: 17 });
  assert.match(o.geometry.binding.session, /^body-flow:/);
  assert.equal(m.frees, 1);
  assert.throws(() => b.setObjectBodyFlow(request(o)), /ForeignObjectBodyFlowOwner/);
  assert.equal(m.writes.length, 0);
  assert.equal(a.setObjectBodyFlow(request(o)).application, 'applied');
  assert.equal(m.writes[0].geometry.binding.session, 'native-session');
});
test('same value reaches Native once; no-op and unknown results remain distinct', () => {
  const m = mock(),
    a = m.api(),
    o = a.objectBodyFlow({ kind: 'drawing', section: 0, node: 17 });
  m.code = 2;
  assert.deepEqual(a.setObjectBodyFlow(request(o)), {
    nativeCode: 2,
    application: 'unapplied',
    changed: false,
  });
  m.code = 3;
  const result = a.setObjectBodyFlow(request(o));
  assert.equal(result.application, 'unknown');
  assert.equal(result.changed, null);
  assert.equal(result.error, 'NativeDenied');
  assert.equal(m.writes.length, 2);
});
test('read frees output on malformed JSON and binding mismatch', () => {
  for (const corrupt of ['json', 'selector']) {
    const m = mock();
    if (corrupt === 'json') m.memory.copy = () => new TextEncoder().encode('{');
    else {
      const o = observation();
      o.geometry.selector.node = 18;
      m.memory.copy = () => new TextEncoder().encode(JSON.stringify(o));
    }
    assert.throws(() => m.api().objectBodyFlow({ kind: 'drawing', section: 0, node: 17 }));
    assert.equal(m.frees, 1);
  }
});
test('optional symbols exactly match generated ABI schema version one', async () => {
  const { HWPX_OBJECT_BODY_FLOW_ABI } = await import('../../js/abi-schema.mjs');
  const m = mock();
  assert.deepEqual(Object.keys(HWPX_OBJECT_BODY_FLOW_ABI), [
    'hwpx_edit_object_body_flow_version',
    'hwpx_edit_object_body_flow',
    'hwpx_edit_set_object_body_flow',
  ]);
  for (const n of Object.keys(HWPX_OBJECT_BODY_FLOW_ABI))
    assert.equal(typeof m.wasm[n], 'function');
  assert.deepEqual(HWPX_OBJECT_BODY_FLOW_ABI.hwpx_edit_object_body_flow_version, {
    params: [],
    results: ['i32'],
  });
  assert.equal(m.api().supportsObjectBodyFlow(), true);
});
