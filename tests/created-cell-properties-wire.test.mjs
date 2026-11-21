import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreatedCellPropertiesApi } from '../js/created-cell-properties-api.mjs';
import { createdCellPropertiesMessage } from '../js/created-cell-properties.mjs';
import { applyCreatedCellPropertiesCommand } from '../web/preview/created-cell-properties-command.mjs';
const request = () => ({
  section: 0,
  identity: '18446744073709551615',
  row: 0,
  column: 1,
  expected: { width: 100, height: 20 },
  size: { width: 110 },
  appearance: {
    borders: { left: { color: 0x234567, width: 10 } },
    fill: { kind: 'solid', color: 0x123456 },
  },
});
function mock(prefix, result = 1) {
  let writes = 0,
    frees = 0,
    captured,
    binding = { document: '123', generation: '1', owner: '456', epoch: '9007199254740993' };
  const wasm = {
    [`${prefix}_created_cell_properties_version`]: () => 1,
    [`${prefix}_created_cell_properties_ticket`]: () => 1,
    [`${prefix}_set_created_cell_properties`]: () => {
      writes++;
      return result;
    },
    [`${prefix}_output_ptr`]: () => 1,
    [`${prefix}_output_len`]: () => 1,
    [`${prefix}_output_free`]: () => {
      frees++;
    },
  };
  const memory = {
    error: () => Error('NativeRefusal'),
    copy: () => new TextEncoder().encode(JSON.stringify(binding)),
    withBytes(bytes, action) {
      captured = JSON.parse(new TextDecoder().decode(bytes));
      return action(1, bytes.length);
    },
  };
  const api = createCreatedCellPropertiesApi({ wasm, memory, prefix, check() {} });
  return {
    api,
    wasm,
    memory,
    get writes() {
      return writes;
    },
    get frees() {
      return frees;
    },
    get captured() {
      return captured;
    },
    set binding(v) {
      binding = v;
    },
  };
}
for (const prefix of ['hwp5_edit', 'hwpx_edit']) {
  test(prefix + ' explicit none survives typed wire once; absent fill stays absent', () => {
    const m = mock(prefix),
      r = request();
    r.appearance = { fill: { kind: 'none' } };
    delete r.size;
    assert.equal(m.api.editCreatedCellProperties(r).changed, true);
    assert.equal(m.writes, 1);
    assert.deepEqual(m.captured.appearance, { background: { none: {} } });
    assert.equal(Object.hasOwn(m.captured, 'size'), false);
    const untouched = mock(prefix),
      sizeOnly = request();
    delete sizeOnly.appearance;
    untouched.api.editCreatedCellProperties(sizeOnly);
    assert.deepEqual(untouched.captured.appearance, {});
    assert.equal(Object.hasOwn(untouched.captured.appearance, 'background'), false);
    assert.equal(untouched.writes, 1);
  });

  test(prefix + ' exact owner full witness sparse write and one Native call', () => {
    const m = mock(prefix);
    assert.equal(m.api.supportsCreatedCellProperties(), true);
    assert.deepEqual(m.api.editCreatedCellProperties(request()), {
      application: 'applied',
      changed: true,
    });
    assert.equal(m.writes, 1);
    assert.equal(m.frees, 1);
    assert.equal(m.captured.witness.epoch, '9007199254740993');
    assert.deepEqual(m.captured.appearance, {
      border: { edges: [{ color: 0x234567, width_hundredth_mm: 10 }, null, null, null] },
      background: { solid: { color: 0x123456 } },
    });
    assert.equal(m.captured.identity, '18446744073709551615');
  });
  test(prefix + ' old optional ABI refuses before write', () => {
    const m = mock(prefix);
    delete m.wasm[`${prefix}_created_cell_properties_ticket`];
    assert.equal(m.api.supportsCreatedCellProperties(), false);
    assert.throws(() => m.api.editCreatedCellProperties(request()), /Unavailable/);
    assert.equal(m.writes, 0);
  });
  test(prefix + ' full witness malformed and foreign address reject before write', () => {
    const m = mock(prefix);
    m.binding = { document: '01', generation: '1', owner: '1', epoch: '1' };
    assert.throws(() => m.api.editCreatedCellProperties(request()), /Witness/);
    assert.equal(m.writes, 0);
    assert.equal(m.frees, 1);
    assert.throws(
      () => m.api.editCreatedCellProperties({ ...request(), tableNode: 1 }),
      /Properties/,
    );
  });
  test(prefix + ' getter never executes', () => {
    const m = mock(prefix);
    let reads = 0;
    const r = request();
    Object.defineProperty(r, 'identity', {
      get() {
        reads++;
        return '1';
      },
      enumerable: true,
    });
    assert.throws(() => m.api.editCreatedCellProperties(r));
    assert.equal(reads, 0);
    assert.equal(m.writes, 0);
  });
  test(prefix + ' no-op and uncertain result remain distinct', () => {
    assert.deepEqual(mock(prefix, 2).api.editCreatedCellProperties(request()), {
      application: 'not-applied',
      changed: false,
    });
    assert.deepEqual(mock(prefix, 3).api.editCreatedCellProperties(request()), {
      application: 'unknown',
      changed: null,
    });
    assert.throws(() => mock(prefix, 0).api.editCreatedCellProperties(request()), /NativeRefusal/);
  });
  test(prefix + ' post invocation trap is unknown with no retry', () => {
    const m = mock(prefix);
    m.wasm[`${prefix}_set_created_cell_properties`] = () => {
      throw Error('trap');
    };
    assert.deepEqual(m.api.editCreatedCellProperties(request()), {
      application: 'unknown',
      changed: null,
    });
  });
}
test('Worker V2, format, history, window and capability refuse before mutation', () => {
  let calls = 0;
  const editor = {
    historyStats: () => ({ protocolVersion: 2 }),
    supportsCreatedCellProperties: () => true,
    editCreatedCellProperties() {
      calls++;
      return { application: 'applied', changed: true };
    },
  };
  for (const [format, enabled, poisoned, window] of [
    ['hwp5', false, false, null],
    ['hwp5', true, true, null],
    ['hwp5', true, false, {}],
    ['other', true, false, null],
  ])
    assert.throws(() =>
      applyCreatedCellPropertiesCommand(editor, format, enabled, poisoned, window, request()),
    );
  assert.equal(calls, 0);
  assert.deepEqual(
    applyCreatedCellPropertiesCommand(editor, 'hwpx', true, false, null, request()),
    { application: 'applied', changed: true },
  );
  assert.equal(calls, 1);
});

for (const prefix of ['hwp5_edit', 'hwpx_edit']) {
  test(
    prefix + ' generated-cell alignment is one exact-witness edit on the negotiated writer',
    () => {
      for (const verticalAlignment of [0, 1, 2]) {
        const m = mock(prefix);
        m.wasm[prefix + '_created_cell_vertical_alignment_write_version'] = () => 1;
        const { size: _size, appearance: _appearance, ...owner } = request();
        assert.equal(m.api.supportsCreatedCellVerticalAlignment(), true);
        assert.equal(
          m.api.editCreatedCellProperties({ ...owner, verticalAlignment }).changed,
          true,
        );
        assert.deepEqual(m.captured, {
          ...owner,
          vertical_alignment: verticalAlignment,
          appearance: {},
          witness: { document: '123', generation: '1', owner: '456', epoch: '9007199254740993' },
        });
        assert.equal(m.writes, 1);
        assert.equal(m.frees, 1);
      }
    },
  );
  test(
    prefix + ' projection alone cannot negotiate a setter and existing writes keep their shape',
    () => {
      for (const v of [undefined, 0, 2]) {
        const m = mock(prefix);
        m.wasm[prefix + '_created_cell_vertical_alignment_projection'] = () => 1;
        if (v !== undefined)
          m.wasm[prefix + '_created_cell_vertical_alignment_write_version'] = () => v;
        assert.equal(m.api.supportsCreatedCellVerticalAlignment(), false);
        assert.throws(
          () => m.api.editCreatedCellProperties({ ...request(), verticalAlignment: 1 }),
          /CreatedCellVerticalAlignmentUnavailable/,
        );
        assert.equal(m.frees, 0);
        assert.equal(m.writes, 0);
        assert.equal(m.api.editCreatedCellProperties(request()).changed, true);
        assert.equal(Object.hasOwn(m.captured, 'vertical_alignment'), false);
        assert.equal(m.writes, 1);
      }
    },
  );
  test(prefix + ' invalid or unavailable alignment cannot reach Native', () => {
    const m = mock(prefix);
    m.wasm[prefix + '_created_cell_vertical_alignment_write_version'] = () => 1;
    for (const value of [null, undefined, -0, -1, 3, 0.5, 'CENTER', NaN])
      assert.throws(
        () => m.api.editCreatedCellProperties({ ...request(), verticalAlignment: value }),
        /InvalidCreatedCellProperties/,
      );
    assert.equal(m.frees, 0);
    assert.equal(m.writes, 0);
  });
}

for (const format of ['hwp5', 'hwpx']) {
  test(
    format + ' generated alignment requires support and known exact current owner in Core',
    () => {
      const { size: _size, appearance: _appearance, ...owner } = request();
      const state = {
        status: 'ready',
        capabilities: {
          createdCellPropertiesAvailable: true,
          createdCellVerticalAlignmentAvailable: true,
        },
        content: {
          format,
          limited: false,
          createdCellPropertiesAvailable: true,
          createdCellVerticalAlignmentAvailable: true,
          createdTables: [
            {
              section: owner.section,
              identity: owner.identity,
              rows: 1,
              columns: 2,
              cells: [{ row: 0, column: 1, ...owner.expected, verticalAlignment: 0 }],
            },
          ],
        },
      };
      const patch = { ...owner, verticalAlignment: 1 };
      assert.deepEqual(createdCellPropertiesMessage(patch, state), {
        kind: 'created-cell-properties',
        ...patch,
        expected: Object.assign(Object.create(null), patch.expected),
      });
      for (const alter of [
        (copy) => (copy.capabilities.createdCellVerticalAlignmentAvailable = false),
        (copy) => (copy.content.createdCellVerticalAlignmentAvailable = false),
        (copy) => (copy.content.createdTables[0].cells[0].verticalAlignment = null),
        (copy) => delete copy.content.createdTables[0].cells[0].verticalAlignment,
      ]) {
        const copy = structuredClone(state);
        alter(copy);
        assert.throws(
          () => createdCellPropertiesMessage(patch, copy),
          /CreatedCellVerticalAlignmentUnavailable/,
        );
        assert.equal(createdCellPropertiesMessage(request(), copy).size.width, 110);
      }
      assert.throws(
        () => createdCellPropertiesMessage({ ...patch, column: 0 }, state),
        /StaleCreatedCellProperties/,
      );
    },
  );

  test(format + ' generated alignment runtime forwarding requires explicit support', () => {
    const { size: _size, appearance: _appearance, ...owner } = request();
    const patch = { ...owner, kind: 'created-cell-properties', verticalAlignment: 2 };
    const calls = [];
    let supported = false;
    const editor = {
      historyStats: () => ({ protocolVersion: 2 }),
      supportsCreatedCellProperties: () => true,
      supportsCreatedCellVerticalAlignment: () => supported,
      editCreatedCellProperties: (request) => (
        calls.push(request),
        { application: 'applied', changed: true }
      ),
    };
    const apply = (message) =>
      applyCreatedCellPropertiesCommand(editor, format, true, false, null, message);
    assert.throws(() => apply(patch), /CreatedCellVerticalAlignmentUnavailable/);
    assert.equal(calls.length, 0);
    supported = true;
    assert.equal(apply(patch).changed, true);
    assert.deepEqual(calls, [
      {
        ...owner,
        expected: Object.assign(Object.create(null), owner.expected),
        verticalAlignment: 2,
      },
    ]);
    assert.throws(
      () => apply({ ...patch, verticalAlignment: null }),
      /InvalidCreatedCellProperties/,
    );
    assert.equal(calls.length, 1);
  });
}
