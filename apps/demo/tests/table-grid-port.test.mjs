import test from 'node:test';
import assert from 'node:assert/strict';
import { createTableGridPort } from '../src/table-grid-port.ts';
import { createGeneratedTableGridTool } from '../src/generated-table-grid-tool.ts';
import { sourceGridFixture as fixture } from './source-table-grid-fixture.mjs';
import { generatedTableGridCommands as commands } from '../src/generated-table-grid-port.ts';

for (const kind of ['source', 'generated']) {
  test(`router ${kind}: opaque discriminant selects the real command for all four existing intents`, async () => {
    for (const command of commands) {
      const h = fixture();
      h.select(kind);
      const port = createTableGridPort(h.editor, h.core, () => h.host);
      const lease = port.capture();
      assert.deepEqual(Object.keys(lease).sort(), ['kind', 'state']);
      assert.equal(lease.kind, kind);
      assert(Object.isFrozen(lease));
      assert.equal(
        port.contextTarget().kind,
        `${kind === 'generated' ? 'generated' : 'source'}-table-cell`,
      );
      assert.equal(port.presentation()[command].enabled, true);
      assert.equal((await port.apply(lease, command)).status, 'committed-with-snapshot');
      assert.equal(
        h.calls[0].command,
        kind === 'source'
          ? h.core.EDIT_SOURCE_TABLE_GRID_COMMAND
          : h.core.EDIT_CREATED_TABLE_GRID_COMMAND,
      );
      assert.equal(Object.hasOwn(h.calls[0].payload, 'identity'), kind === 'generated');
      assert.equal(Object.hasOwn(h.calls[0].payload, 'tableNode'), kind === 'source');
      assert.equal((await port.apply(lease, command)).status, 'rejected-unapplied');
      assert.equal(h.calls.length, 1);
      port.dispose();
    }
  });
}
test('router rejects copied/cross-router leases and source/generated A-B-A', async () => {
  const h = fixture(),
    port = createTableGridPort(h.editor, h.core, () => h.host),
    other = createTableGridPort(h.editor, h.core, () => h.host);
  const lease = port.capture(),
    context = port.contextTarget();
  for (const foreign of [{ ...lease }, { ...lease, kind: 'generated' }, other.capture()])
    assert.equal((await port.apply(foreign, commands[0])).status, 'rejected-unapplied');
  h.select('generated');
  h.select('source');
  assert.equal(context.current(), false);
  assert.equal((await port.apply(lease, commands[0])).status, 'rejected-unapplied');
  assert.equal(h.calls.length, 0);
});
test('shared pending fence prevents changing route during a flush from admitting another command', async () => {
  const h = fixture(),
    port = createTableGridPort(h.editor, h.core, () => h.host);
  let release;
  h.editor.update = async () =>
    await new Promise((resolve) => {
      release = resolve;
    });
  const operation = port.apply(port.capture(), commands[0]);
  h.select('generated');
  assert(Object.values(port.presentation()).every((v) => !v.enabled));
  assert.equal(port.contextTarget(), null);
  const pendingLease = port.capture();
  assert.equal((await port.apply(pendingLease, commands[0])).status, 'rejected-unapplied');
  release();
  assert.equal((await operation).status, 'rejected-unapplied');
  assert.equal((await port.apply(pendingLease, commands[0])).status, 'rejected-unapplied');
  assert.equal(h.calls.length, 0);
  port.dispose();
  assert(Object.values(port.presentation()).every((v) => !v.enabled));
  assert.equal((await port.apply(port.capture(), commands[0])).status, 'rejected-unapplied');
});
test('router never enables source using generated capability or a fabricated identity', async () => {
  for (const capability of [undefined, false]) {
    const h = fixture();
    h.state.capabilities.sourceTableGridAvailable = capability;
    const port = createTableGridPort(h.editor, h.core, () => h.host);
    assert(Object.values(port.presentation()).every((v) => !v.enabled));
    assert.equal(port.contextTarget(), null);
    const messages = [];
    const tool = createGeneratedTableGridTool({
      port,
      onStatus: (v) => messages.push(v),
      onPresentationChange() {},
    });
    await tool.execute(commands[0]);
    assert.equal(h.calls.length, 0);
    assert.match(messages[0], /현재 엔진은 원본 표/);
    tool.dispose();
  }
});
