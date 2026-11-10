import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGeneratedTableGridPort,
  generatedTableGridCommands,
} from '../src/generated-table-grid-port.ts';
import { createGeneratedTableGridTool } from '../src/generated-table-grid-tool.ts';

function fixture(format = 'hwp5', rows = 2, columns = 3) {
  let state = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    stateVersion: 1,
    status: 'ready',
    token: { editorId: 'e', documentId: 'd', generation: 1, operationRevision: 1, viewRevision: 1 },
    capabilities: { createdTableGridAvailable: true },
    content: {
      format,
      limited: false,
      readOnly: false,
      createdTables: [
        {
          section: 0,
          identity: '18446744073709551615',
          instance_id: 999,
          rows,
          columns,
          cells: Array.from({ length: rows * columns }, (_, i) => ({
            row: Math.floor(i / columns),
            column: i % columns,
          })),
        },
      ],
    },
  };
  let selectionEpoch = 0,
    present = true;
  const address = { identity: '18446744073709551615', row: rows - 1, column: columns - 1 };
  const calls = [],
    core = {
      EDIT_CREATED_TABLE_GRID_COMMAND: Object.freeze({
        name: 'created-table-grid',
        id: Symbol('grid'),
      }),
    };
  const editor = {
    getEditorState: () => state,
    update: async () => {},
    dispatchCommand: async (command, payload) => {
      calls.push({ command, payload });
      return { status: 'committed-with-snapshot', state };
    },
  };
  const host = {
    captureGeneratedTableGridSelection() {
      if (!present) return null;
      const captured = state,
        epoch = selectionEpoch;
      return {
        state: captured,
        section: 0,
        createdCell: { ...address },
        current: () => present && selectionEpoch === epoch && state === captured,
      };
    },
  };
  const port = createGeneratedTableGridPort(editor, core, () => host);
  return {
    core,
    editor,
    host,
    port,
    calls,
    address,
    get state() {
      return state;
    },
    replace(patch) {
      state = { ...state, ...patch, stateVersion: state.stateVersion + 1 };
    },
    move() {
      selectionEpoch++;
    },
    hide() {
      present = false;
    },
  };
}
for (const format of ['hwp5', 'hwpx']) {
  test(`${format}: four actions retain canonical u64 identity and selected row/column indices`, async () => {
    for (const [command, action, index] of [
      ['generated-table-insert-row', 'insert-row', 2],
      ['generated-table-delete-row', 'delete-row', 1],
      ['generated-table-insert-column', 'insert-column', 3],
      ['generated-table-delete-column', 'delete-column', 2],
    ]) {
      const h = fixture(format);
      assert.ok(h.port.presentation()[command].enabled);
      assert.equal(
        (await h.port.apply(h.port.capture(), command)).status,
        'committed-with-snapshot',
      );
      assert.deepEqual(h.calls, [
        {
          command: h.core.EDIT_CREATED_TABLE_GRID_COMMAND,
          payload: { section: 0, identity: '18446744073709551615', action, index },
        },
      ]);
    }
  });
}
test('last row/column deletion is disabled and rejected while insertion remains available', async () => {
  const h = fixture('hwpx', 1, 1),
    shown = h.port.presentation();
  for (const command of generatedTableGridCommands) {
    assert.equal(shown[command].enabled, command.includes('insert'));
    if (command.includes('delete'))
      assert.equal((await h.port.apply(h.port.capture(), command)).status, 'rejected-unapplied');
  }
  assert.equal(h.calls.length, 0);
});
test('unavailable ABI/command/selection and invalid observations never enable controls', async () => {
  for (const deny of [
    (h) => {
      delete h.state.capabilities.createdTableGridAvailable;
    },
    (h) => {
      h.state.capabilities.createdTableGridAvailable = false;
    },
    (h) => {
      delete h.core.EDIT_CREATED_TABLE_GRID_COMMAND;
    },
    (h) => {
      h.core.EDIT_CREATED_TABLE_GRID_COMMAND = { name: 'fake', id: Symbol() };
    },
    (h) => h.hide(),
    (h) => {
      h.state.content.createdTables = [];
    }, // original tables never substitute
    (h) => {
      h.state.content.tables = [{ tableNode: 999 }];
      h.state.content.createdTables[0].identity = '999';
    },
    (h) => {
      h.address.identity = '01';
    },
    (h) => {
      h.address.identity = '18446744073709551616';
    },
    (h) => {
      h.address.row = 2;
    },
    (h) => {
      h.state.content.createdTables[0].cells[0].rowSpan = 2;
    },
    (h) => {
      h.state.content.createdTables.push({ ...h.state.content.createdTables[0] });
    },
    (h) => {
      h.state.content.createdTables[0].cells.pop();
    },
    (h) => {
      h.state.content.limited = true;
    },
    (h) => {
      h.state.content.readOnly = true;
    },
    (h) => {
      h.state.historyRecoveryRequired = true;
    },
    (h) => {
      h.state.status = 'loading';
    },
  ]) {
    const h = fixture();
    deny(h);
    assert.ok(Object.values(h.port.presentation()).every((value) => !value.enabled));
    assert.equal(
      (await h.port.apply(h.port.capture(), generatedTableGridCommands[0])).status,
      'rejected-unapplied',
    );
    assert.equal(h.calls.length, 0);
  }
});
test('state replacement and local selection A→B→A invalidate captured leases and context', async () => {
  for (const invalidate of [(h) => h.move(), (h) => h.replace({}), (h) => h.port.dispose()]) {
    const h = fixture(),
      lease = h.port.capture(),
      context = h.port.contextTarget();
    invalidate(h);
    assert.equal(context.current(), false);
    assert.equal(
      (await h.port.apply(lease, generatedTableGridCommands[0])).status,
      'rejected-unapplied',
    );
    assert.equal(h.calls.length, 0);
  }
});
test('flush race, readonly/ABI change, reentry and pending controls fail before command dispatch', async () => {
  for (const invalidate of [
    (h) => h.move(),
    (h) => h.replace({}),
    (h) => {
      h.state.content.readOnly = true;
    },
    (h) => {
      h.state.capabilities.createdTableGridAvailable = false;
    },
  ]) {
    const h = fixture();
    h.editor.update = async () => {
      assert.ok(Object.values(h.port.presentation()).every((value) => !value.enabled));
      invalidate(h);
    };
    assert.equal(
      (await h.port.apply(h.port.capture(), generatedTableGridCommands[0])).status,
      'rejected-unapplied',
    );
    assert.equal(h.calls.length, 0);
  }
});
test('one lease dispatches once and does not retry uncertain/refresh-required completion', async () => {
  for (const response of ['committed-refresh-required', 'throw']) {
    const h = fixture(),
      messages = [],
      lease = h.port.capture();
    h.editor.dispatchCommand = async () => {
      h.calls.push('sent');
      if (response === 'throw') throw Error('lost');
      return { status: response };
    };
    const tool = createGeneratedTableGridTool({
      port: h.port,
      onStatus: (value) => messages.push(value),
      onPresentationChange() {},
    });
    await tool.execute(generatedTableGridCommands[0]);
    assert.equal(h.calls.length, 1);
    assert.match(messages[0], /다시 적용하지 마세요/);
    // The dispatched lease is consumed even when projection/ACK is uncertain.
    const other = fixture(),
      captured = other.port.capture();
    await other.port.apply(captured, generatedTableGridCommands[0]);
    assert.equal(
      (await other.port.apply(captured, generatedTableGridCommands[0])).status,
      'rejected-unapplied',
    );
    assert.equal(other.calls.length, 1);
    void lease;
  }
});
test('pending tool rejects double-click and clears availability after settlement', async () => {
  const h = fixture();
  let release;
  h.editor.dispatchCommand = async () => {
    h.calls.push('sent');
    return await new Promise((resolve) => {
      release = resolve;
    });
  };
  const tool = createGeneratedTableGridTool({
    port: h.port,
    onStatus() {},
    onPresentationChange() {},
  });
  const first = tool.execute(generatedTableGridCommands[0]);
  await Promise.resolve();
  await Promise.resolve();
  assert.ok(Object.values(tool.presentation()).every((value) => !value.enabled));
  await tool.execute(generatedTableGridCommands[1]);
  assert.equal(h.calls.length, 1);
  release({ status: 'committed-with-snapshot' });
  await first;
  tool.dispose();
  assert.ok(Object.values(tool.presentation()).every((value) => !value.enabled));
});

test('local Canvas events refresh controls after handlers even when Core state is unchanged', async () => {
  const h = fixture(),
    root = new EventTarget();
  let refreshes = 0;
  const tool = createGeneratedTableGridTool({
    root,
    port: h.port,
    onStatus() {},
    onPresentationChange() {
      refreshes++;
    },
  });
  root.dispatchEvent(new Event('pointerup'));
  root.dispatchEvent(new Event('keyup'));
  assert.equal(refreshes, 0);
  await Promise.resolve();
  assert.equal(refreshes, 1);
  root.dispatchEvent(new Event('compositionstart'));
  tool.dispose();
  await Promise.resolve();
  assert.equal(refreshes, 1);
  root.dispatchEvent(new Event('pointerup'));
  await Promise.resolve();
  assert.equal(refreshes, 1);
});
