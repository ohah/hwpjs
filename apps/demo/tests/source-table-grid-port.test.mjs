import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceGridFixture as fixture } from './source-table-grid-fixture.mjs';
import { generatedTableGridCommands as commands } from '../src/generated-table-grid-port.ts';
import { createGeneratedTableGridTool } from '../src/generated-table-grid-tool.ts';
import { sourceTableGridReason } from '../src/source-table-grid-port.ts';

for (const format of ['hwp5', 'hwpx']) {
  test(`${format}: source four actions carry dimensions and Reader layout, never generated identity`, async () => {
    for (const [i, command] of commands.entries()) {
      const h = fixture(format);
      assert.equal(h.port.presentation()[command].enabled, true);
      assert.equal(
        (await h.port.apply(h.port.capture(), command)).status,
        'committed-with-snapshot',
      );
      assert.deepEqual(h.calls, [
        {
          command: h.core.EDIT_SOURCE_TABLE_GRID_COMMAND,
          payload: {
            section: 0,
            tableNode: 10,
            expectedRows: 2,
            expectedColumns: 3,
            action: command.slice('generated-table-'.length),
            index: [2, 1, 3, 2][i],
            ...(format === 'hwp5' ? { layout: 'observed8' } : {}),
          },
        },
      ]);
      assert.equal(Object.hasOwn(h.calls[0].payload, 'identity'), false);
      assert.equal(Object.hasOwn(h.calls[0].payload, 'listNode'), false);
      assert(Object.isFrozen(h.calls[0].payload));
    }
  });
}
test('final axes disable only their deletion; invalid addresses and unknown capabilities fail closed', async () => {
  for (const [rows, columns] of [
    [1, 1],
    [1, 3],
    [2, 1],
  ]) {
    const h = fixture('hwpx', rows, columns);
    const shown = h.port.presentation();
    assert.equal(shown[commands[0]].enabled, true);
    assert.equal(shown[commands[2]].enabled, true);
    assert.equal(shown[commands[1]].enabled, rows !== 1);
    assert.equal(shown[commands[3]].enabled, columns !== 1);
  }
  for (const deny of [
    (h) => delete h.core.EDIT_SOURCE_TABLE_GRID_COMMAND,
    (h) => (h.core.EDIT_SOURCE_TABLE_GRID_COMMAND = { name: 'created-table-grid', id: Symbol() }),
    (h) => (h.core.EDIT_SOURCE_TABLE_GRID_COMMAND = { name: 'source-table-grid', id: 'fake' }),
    ...['content', 'capabilities'].flatMap((location) =>
      [undefined, false, 'true', 1].map(
        (value) => (h) => (h.state[location].sourceTableGridAvailable = value),
      ),
    ),
    (h) => (h.state.content.readOnly = true),
    (h) => (h.state.capabilities.readOnly = true),
    (h) => (h.state.content.limited = true),
    (h) => (h.state.content.window = {}),
    (h) => (h.state.content.viewKind = 'window'),
    (h) => (h.state.content.format = 'hwp3'),
    (h) => (h.state.status = 'loading'),
    (h) => (h.state.historyRecoveryRequired = true),
    (h) => h.hide(),
    (h) => (h.address.tableNode = -0),
    (h) => (h.address.listNode = -1),
    (h) => (h.address.row = h.address.rows),
    (h) => (h.address.columns = 0),
  ]) {
    const h = fixture();
    deny(h);
    assert(Object.values(h.port.presentation()).every((v) => !v.enabled));
    assert.equal((await h.port.apply(h.port.capture(), commands[0])).status, 'rejected-unapplied');
    assert.equal(h.calls.length, 0);
  }
});
test('strict brand rejects copied, cross-port, consumed and invalid action leases', async () => {
  const h = fixture(),
    other = fixture(),
    lease = h.port.capture();
  for (const forged of [
    { ...lease },
    other.port.capture(),
    Object.freeze({ state: h.state, cell: lease.cell, reason: null }),
  ]) {
    assert.equal((await h.port.apply(forged, commands[0])).status, 'rejected-unapplied');
  }
  assert.equal((await h.port.apply(lease, 'source-table-insert-row')).status, 'rejected-unapplied');
  assert.equal(h.calls.length, 0);
  await h.port.apply(lease, commands[0]);
  assert.equal((await h.port.apply(lease, commands[0])).status, 'rejected-unapplied');
  assert.equal(h.calls.length, 1);
});
test('A-B-A, state replacement and flush-time readonly/capability/target changes never dispatch', async () => {
  for (const invalidate of [
    (h) => {
      h.move();
      h.move();
    },
    (h) => h.replace(),
    (h) => h.port.dispose(),
    (h) => (h.state.content.readOnly = true),
    (h) => (h.state.capabilities.sourceTableGridAvailable = false),
    (h) => (h.state.content.sourceTableGridAvailable = false),
    (h) => h.address.tableNode++,
    (h) => h.address.listNode++,
    (h) => h.address.rows++,
  ]) {
    const h = fixture(),
      lease = h.port.capture(),
      context = h.port.contextTarget();
    h.editor.update = async () => {
      assert(Object.values(h.port.presentation()).every((v) => !v.enabled));
      invalidate(h);
    };
    assert.equal((await h.port.apply(lease, commands[0])).status, 'rejected-unapplied');
    assert.equal(h.calls.length, 0);
    if (!lease.cell || h.state !== lease.state) assert.equal(context.current(), false);
  }
});
test('pending reentry is blocked and fresh projection must capture fresh node addresses', async () => {
  const h = fixture(),
    old = h.port.capture();
  let release;
  h.editor.dispatchCommand = async (command, payload) => {
    h.calls.push({ command, payload });
    return await new Promise((resolve) => {
      release = resolve;
    });
  };
  const first = h.port.apply(old, commands[0]);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal((await h.port.apply(h.port.capture(), commands[1])).status, 'rejected-unapplied');
  release({ status: 'committed-with-snapshot' });
  await first;
  assert(Object.values(h.port.presentation()).every((v) => !v.enabled));
  h.replace();
  h.address.tableNode = 100;
  h.address.listNode = 200;
  assert.equal((await h.port.apply(old, commands[0])).status, 'rejected-unapplied');
  const second = h.port.apply(h.port.capture(), commands[0]);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.calls[1].payload.tableNode, 100);
  release({ status: 'committed-with-snapshot' });
  await second;
});
test('Native unsupported/error results are never success; uncertain commits block repeat attempts', async () => {
  for (const status of [
    'rejected-unapplied',
    'known-no-op',
    'committed-refresh-required',
    'throw',
  ]) {
    const h = fixture(),
      messages = [];
    h.editor.dispatchCommand = async () => {
      h.calls.push('sent');
      if (status === 'throw') throw Error('Native ACK lost');
      return { status, error: 'UnsupportedSourceTableStructure' };
    };
    const tool = createGeneratedTableGridTool({
      port: { ...h.port, reason: sourceTableGridReason },
      onStatus: (value) => messages.push(value),
      onPresentationChange() {},
    });
    await tool.execute(commands[0]);
    assert.equal(h.calls.length, 1);
    assert.doesNotMatch(messages[0], /변경했습니다/);
    if (status === 'rejected-unapplied')
      assert.match(messages[0], /UnsupportedSourceTableStructure/);
    if (status === 'throw' || status.startsWith('committed')) {
      assert.match(messages[0], /다시 적용하지 마세요/);
      await tool.execute(commands[0]);
      assert.equal(h.calls.length, 1);
    }
    tool.dispose();
  }
});
