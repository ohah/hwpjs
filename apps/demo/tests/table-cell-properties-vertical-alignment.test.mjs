// Source-only real view/controller/port tests with synthetic Core and DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SET_ORIGINAL_CELL_VERTICAL_ALIGNMENT_COMMAND,
  SET_ORIGINAL_CELL_ALIGNMENT_BLOCK_COMMAND,
} from '@hwpjs/core';
import { createTableCellPropertiesPort } from '../src/table-cell-properties-port.ts';
import { createTableCellPropertiesController } from '../src/table-cell-properties-tool.ts';
import { fixture } from './table-cell-properties-fixture.mjs';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
const tick = async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};
function setup(options = {}) {
  const f = fixture(options.format ?? 'hwp5'),
    dom = documentFixture(),
    writes = [],
    events = [],
    messages = [];
  f.state.capabilities.originalCellVerticalAlignmentAvailable = options.capability !== false;
  f.state.capabilities.cellSizeAvailable = options.size !== false;
  if (options.readOnly) f.state.content.readOnly = true;
  const state = f.state,
    source = Object.freeze({}),
    target = Object.freeze({});
  let bound,
    live = true,
    finishRead,
    finishWrite;
  const current = () =>
    live &&
    f.state === state &&
    (bound
      ? dom.root.querySelector('dialog:modal') === bound
      : dom.root.querySelector('dialog:modal') === null);
  f.api.captureOriginalCellPropertiesSelection = () => ({
    state,
    target: source,
    current,
    bindDialog(element) {
      events.push('bind');
      assert.equal(element.open, true, 'BindVisibleModal');
      assert.equal(dom.root.querySelector('dialog:modal'), element, 'BindExactModal');
      if (options.bind === false) return false;
      bound = element;
      return current();
    },
  });
  f.editor.getOriginalCellVerticalAlignment = async (selected) => {
    assert.equal(selected, source);
    assert.equal(dom.root.querySelector('dialog:modal'), null, 'QueryBeforeModal');
    events.push('query');
    if (options.delayedRead)
      await new Promise((done) => {
        finishRead = done;
      });
    if (options.queryError) throw Error('UnsupportedOriginalCellRuntime');
    if (options.unsupported || options.readOnly)
      return { state: 'unavailable', reason: 'UnsupportedCellVerticalAlignment' };
    return {
      state: 'available',
      target,
      value: options.value === undefined ? 'TOP' : options.value,
      selector: {
        section: 0,
        paragraph: 15,
        tableNode: 81,
        listNode: options.wrongOwner ? 999 : 82,
      },
    };
  };
  if (options.block) {
    f.state.selection = null;
    f.api.captureOriginalCellAlignmentBlock = () => ({
      ...f.api.captureOriginalCellPropertiesSelection(),
      prepareDialog(element) {
        events.push('prepare');
        return !element.open && options.prepareBlock !== false;
      },
    });
    f.editor.getOriginalCellAlignmentBlock = async (selected) => {
      assert.equal(selected, source);
      assert.equal(dom.root.querySelector('dialog:modal'), null);
      events.push('batch-query');
      return { state: 'available', target, value: 'mixed', cellCount: 3 };
    };
  }
  f.editor.dispatchCommand = async (command, payload) => {
    writes.push({ command, payload });
    if (options.delayedWrite)
      await new Promise((done) => {
        finishWrite = done;
      });
    return { status: options.result ?? 'committed-with-snapshot', state: f.state };
  };
  const port = createTableCellPropertiesPort(f.editor, f.api);
  const controller = createTableCellPropertiesController({
    root: dom.root,
    port,
    onStatus: (v) => messages.push(v),
    onClose: () => events.push('focus'),
    onAppearance: () => events.push('appearance'),
    appearanceAvailable: () => true,
  });
  controller.open();
  return {
    f,
    dom,
    port,
    controller,
    writes,
    events,
    messages,
    target,
    finishRead: () => finishRead(),
    finishWrite: () => finishWrite(),
    stale: () => {
      live = false;
    },
    choose(value) {
      dom.role('cell-vertical-alignment').value = value;
      fire(dom.role('cell-vertical-alignment'), 'change');
    },
    apply() {
      fire(dom.role('cell-properties-apply'), 'click');
    },
  };
}
for (const format of ['hwp5', 'hwpx'])
  for (const value of ['TOP', 'CENTER', 'BOTTOM'])
    test(
      format + ' current ' + value + ' is observed without defaulting or issuing a transaction',
      async () => {
        const h = setup({ format, value });
        try {
          await tick();
          assert.deepEqual(h.events, ['query', 'bind']);
          assert.equal(h.dom.role('cell-vertical-alignment').value, value);
          assert.equal(h.dom.role('cell-vertical-alignment').disabled, false);
          assert.equal(h.dom.role('cell-properties-apply').disabled, true);
          assert.equal(h.writes.length, 0);
          assert.equal(h.f.mutationCalls().length, 0);
        } finally {
          h.controller.dispose();
        }
      },
    );
for (const value of ['TOP', 'CENTER', 'BOTTOM'])
  test(
    'explicit ' +
      value +
      ' from unspecified HX uses one opaque alignment command and no size/style command',
    async () => {
      const h = setup({ format: 'hwpx', value: null });
      try {
        await tick();
        assert.equal(h.dom.role('cell-vertical-alignment').value, '');
        assert.equal(h.dom.role('cell-properties-apply').disabled, true);
        h.choose(value);
        h.apply();
        await tick();
        assert.deepEqual(h.writes, [
          {
            command: SET_ORIGINAL_CELL_VERTICAL_ALIGNMENT_COMMAND,
            payload: { target: h.target, value },
          },
        ]);
        assert.equal(h.f.mutationCalls().length, 0);
        assert.equal(h.dom.root.querySelector('dialog:modal'), null);
        assert.match(h.messages[0], /세로 정렬을 적용/);
      } finally {
        h.controller.dispose();
      }
    },
  );
for (const options of [
  { capability: false },
  { unsupported: true },
  { queryError: true },
  { value: 'DISTRIBUTE' },
  { bind: false },
  { wrongOwner: true },
  { readOnly: true },
])
  test(
    'inactive or unsupported alignment preserves source size/appearance without promotion ' +
      JSON.stringify(options),
    async () => {
      const h = setup(options);
      try {
        await tick();
        assert.equal(h.dom.role('cell-vertical-alignment').disabled, true);
        assert.equal(h.dom.role('cell-properties-apply').disabled, true);
        assert.equal(h.writes.length, 0);
        assert.equal(h.dom.role('cell-width').value, '13.33');
        assert.equal(h.dom.role('cell-height').value, '25.00');
        assert.equal(h.dom.role('cell-properties-appearance').disabled, false);
        if (options.capability === false) assert.equal(h.events.includes('query'), false);
        h.apply();
        assert.equal(h.writes.length, 0);
      } finally {
        h.controller.dispose();
      }
    },
  );
test('alignment independently works when only cell size writes are unavailable', async () => {
  const h = setup({ size: false });
  try {
    await tick();
    assert.equal(h.dom.role('cell-width').disabled, true);
    assert.equal(h.dom.role('cell-vertical-alignment').disabled, false);
    h.choose('CENTER');
    assert.equal(h.dom.role('cell-properties-apply').disabled, false);
    h.apply();
    await tick();
    assert.equal(h.writes.length, 1);
    assert.equal(h.f.mutationCalls().length, 0);
  } finally {
    h.controller.dispose();
  }
});
for (const order of ['size-first', 'alignment-first'])
  test('mixed size and alignment drafts are refused without splitting ' + order, async () => {
    const h = setup();
    try {
      await tick();
      const size = () => {
        h.dom.role('cell-height').value = '30';
        fire(h.dom.role('cell-height'), 'input');
      };
      if (order === 'size-first') {
        size();
        h.choose('BOTTOM');
      } else {
        h.choose('BOTTOM');
        size();
      }
      assert.equal(h.dom.role('cell-properties-apply').disabled, true);
      assert.match(h.dom.role('cell-properties-status').textContent, /함께 적용할 수 없습니다/);
      assert.equal(h.dom.role('cell-properties-appearance').disabled, true);
      h.apply();
      await tick();
      assert.equal(h.writes.length, 0);
      assert.equal(h.f.mutationCalls().length, 0);
      h.dom.role('cell-height').value = '25.00';
      fire(h.dom.role('cell-height'), 'input');
      assert.equal(h.dom.role('cell-properties-apply').disabled, false);
      h.apply();
      await tick();
      assert.equal(h.writes.length, 1);
      assert.equal(h.f.mutationCalls().length, 0);
    } finally {
      h.controller.dispose();
    }
  });
test('unchanged alignment and unit-only changes leave old exact size command behavior intact', async () => {
  const h = setup();
  try {
    await tick();
    h.dom.role('cell-size-unit').value = 'pt';
    fire(h.dom.role('cell-size-unit'), 'change');
    assert.equal(h.dom.role('cell-vertical-alignment').value, 'TOP');
    assert.equal(h.dom.role('cell-properties-apply').disabled, true);
    h.dom.role('cell-height').value = '80';
    fire(h.dom.role('cell-height'), 'input');
    h.apply();
    await tick();
    assert.equal(h.writes.length, 0);
    assert.equal(h.f.mutationCalls().length, 1);
    assert.equal(h.f.mutationCalls()[0].message.kind, 'cell-size');
  } finally {
    h.controller.dispose();
  }
});
for (const action of ['close', 'dispose', 'replace', 'select'])
  test('async alignment capture cannot open a stale or closed dialog after ' + action, async () => {
    const h = setup({ delayedRead: true });
    try {
      assert.equal(h.dom.root.querySelector('dialog:modal'), null);
      h.controller.open();
      assert.equal(h.events.filter((e) => e === 'query').length, 1);
      if (action === 'close') h.controller.close();
      if (action === 'dispose') h.controller.dispose();
      if (action === 'replace') h.f.replace({ documentId: 'new-doc' });
      if (action === 'select')
        h.f.replace({ selection: { ...h.f.state.selection, startUnit: 1, endUnit: 1 } });
      h.finishRead();
      await tick();
      assert.equal(h.dom.root.querySelector('dialog:modal'), null);
      assert.equal(h.writes.length, 0);
    } finally {
      h.controller.dispose();
    }
  });
test('composition, stale selection and malformed choices never issue alignment', async () => {
  const h = setup();
  try {
    await tick();
    h.choose('CENTER');
    fire(h.dom.role('table-cell-properties-dialog'), 'compositionstart');
    h.apply();
    assert.equal(h.writes.length, 0);
    fire(h.dom.role('table-cell-properties-dialog'), 'compositionend');
    h.choose('SIDEWAYS');
    assert.equal(h.dom.role('cell-properties-apply').disabled, true);
    h.apply();
    assert.equal(h.writes.length, 0);
    h.choose('CENTER');
    h.f.replace({ selection: { ...h.f.state.selection, startUnit: 1, endUnit: 1 } });
    assert.equal(h.dom.role('cell-vertical-alignment').disabled, true);
    h.apply();
    await tick();
    assert.equal(h.writes.length, 0);
  } finally {
    h.controller.dispose();
  }
});
for (const result of [
  'committed-with-snapshot',
  'committed-refresh-required',
  'rejected-unapplied',
  'known-no-op',
])
  test(
    'single-use ' +
      result +
      ' completion does not split or replay alignment and ignores late closed UI',
    async () => {
      const h = setup({ delayedWrite: true, result });
      try {
        await tick();
        h.choose('CENTER');
        h.apply();
        h.apply();
        await tick();
        assert.equal(h.writes.length, 1);
        assert.equal(h.dom.role('cell-vertical-alignment').disabled, true);
        h.controller.close();
        h.finishWrite();
        await tick();
        assert.equal(h.writes.length, 1);
        assert.equal(h.f.mutationCalls().length, 0);
        assert.equal(h.dom.root.querySelector('dialog:modal'), null);
        assert.deepEqual(h.messages, []);
      } finally {
        h.controller.dispose();
      }
    },
  );

for (const result of [
  'committed-with-snapshot',
  'committed-refresh-required',
  'rejected-unapplied',
  'known-no-op',
])
  test(
    'visible ' + result + ' result closes the single-use alignment UI without a second operation',
    async () => {
      const h = setup({ result });
      try {
        await tick();
        h.choose('CENTER');
        const button = h.dom.role('cell-properties-apply');
        h.apply();
        await tick();
        assert.equal(h.writes.length, 1);
        assert.equal(h.f.mutationCalls().length, 0);
        assert.equal(h.dom.root.querySelector('dialog:modal'), null);
        fire(button, 'click');
        await tick();
        assert.equal(h.writes.length, 1);
        if (result === 'committed-refresh-required') assert.match(h.messages[0], /다시 적용하지/);
        if (result === 'rejected-unapplied') assert.match(h.messages[0], /속성을 다시 열어/);
      } finally {
        h.controller.dispose();
      }
    },
  );

test('block properties dispatch exactly one batch and never retarget the active cell', async () => {
  const h = setup({ block: true, delayedWrite: true });
  try {
    await tick();
    assert.deepEqual(h.events, ['batch-query', 'prepare', 'bind']);
    assert.equal(h.controller.presentation().enabled, true);
    h.choose('BOTTOM');
    h.apply();
    h.apply();
    assert.deepEqual(h.writes, [
      {
        command: SET_ORIGINAL_CELL_ALIGNMENT_BLOCK_COMMAND,
        payload: { target: h.target, value: 'BOTTOM' },
      },
    ]);
    assert.equal(h.f.mutationCalls().length, 0);
    h.finishWrite();
    await tick();
    assert.equal(h.dom.root.querySelector('dialog:modal'), null);
    assert.match(h.messages[0], /세로 정렬을 적용했습니다/);
  } finally {
    h.controller.dispose();
  }
});

test('a block that goes stale before modal focus never opens or writes', async () => {
  const h = setup({ block: true, prepareBlock: false });
  try {
    await tick();
    assert.deepEqual(h.events, ['batch-query', 'prepare']);
    assert.equal(h.dom.root.querySelector('dialog:modal'), null);
    assert.equal(h.writes.length, 0);
    assert.match(h.messages[0], /다시 열어주세요/);
  } finally {
    h.controller.dispose();
  }
});
