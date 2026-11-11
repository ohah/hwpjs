import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_COMMANDS,
  DEMO_COMMAND_REGISTRY,
  resolveCommandSupport,
  commandSupportActions,
  contextCommandIds,
  unsupportedCommandCategories,
  UNCONNECTED_COMMAND_REASON,
} from '../src/command-support.ts';
import { actionAvailability } from '../src/shell-model.ts';

test('fallback distinguishes lifecycle, document and selection without enabling an absent bridge', () => {
  const base = {
    connected: false,
    availability: { enabled: true },
    document: 'ready' as const,
    hasSelection: true,
  };
  for (const [extra, kind] of [
    [{ disposed: true, busy: true }, 'disposed'],
    [{ document: 'loading' }, 'loading'],
    [{ busy: true }, 'busy'],
    [{ document: 'none' }, 'no-document'],
    [{ document: 'error' }, 'no-document'],
    [{ hasSelection: false }, 'unconnected'],
    [{ connected: true, hasSelection: false }, 'missing-selection'],
    [{}, 'unconnected'],
  ] as const) {
    const result = resolveCommandSupport('bold', { ...base, ...extra });
    assert.equal(result.kind, kind);
    assert.equal(result.enabled, false);
    assert.ok(result.reason);
  }
  assert.equal(resolveCommandSupport('strike', base).reason, UNCONNECTED_COMMAND_REASON);
  assert.equal(
    resolveCommandSupport('strike', { ...base, hasSelection: false }).reason,
    UNCONNECTED_COMMAND_REASON,
  );
  const actions = commandSupportActions({
    connectedCommands: new Set(['bold']),
    document: 'ready',
    hasSelection: false,
    availability: { bold: { enabled: true } },
  });
  assert.equal(actions.strike.kind, 'unconnected');
  assert.equal(actions.strike.reason, UNCONNECTED_COMMAND_REASON);
  assert.equal(actions.bold.kind, 'missing-selection');
  assert.equal(actions.bold.enabled, false);
});
test('a bridge and an explicit positive capability are both required', () => {
  assert.equal(resolveCommandSupport('save', { connected: true }).enabled, false);
  assert.equal(
    resolveCommandSupport('save', { connected: false, availability: { enabled: true } }).enabled,
    false,
  );
  assert.equal(
    resolveCommandSupport('save', { connected: true, availability: { enabled: true } }).enabled,
    true,
  );
  const denied = resolveCommandSupport('bold', {
    connected: true,
    availability: { enabled: false, reason: 'RefreshRequired', pressed: 'mixed' },
  });
  assert.equal(denied.reason, 'RefreshRequired');
  assert.equal(denied.pressed, 'mixed');
});
test('document print needs a ready host and no busy work, without requiring a selection', () => {
  const input = { connected: true, document: 'ready' as const, hasSelection: false };
  assert.equal(
    resolveCommandSupport('print-preview', { ...input, availability: { enabled: true } }).enabled,
    true,
  );
  for (const [override, kind] of [
    [{ connected: false }, 'unconnected'],
    [{ document: 'none' }, 'no-document'],
    [{ busy: true }, 'busy'],
    [{ availability: { enabled: false, reason: 'InputPending' } }, 'unavailable'],
  ] as const) {
    const result = resolveCommandSupport('print-preview', {
      ...input,
      availability: { enabled: true },
      ...override,
    });
    assert.equal(result.kind, kind);
    assert.equal(result.enabled, false);
  }
});
test('unimplemented requires explicit reason and evidence, never inferred from missing wiring', () => {
  assert.equal(resolveCommandSupport('insert-chart', { connected: false }).kind, 'unconnected');
  assert.equal(
    resolveCommandSupport('insert-chart', {
      connected: false,
      confirmedUnimplemented: { reason: '미구현', evidence: '' },
    }).kind,
    'unconnected',
  );
  const result = resolveCommandSupport('insert-chart', {
    connected: false,
    confirmedUnimplemented: { reason: '검증된 제한', evidence: 'focused engine regression' },
  });
  assert.equal(result.kind, 'unimplemented');
  assert.equal(result.enabled, false);
});
test('registry-derived categories describe static wiring, not 25 document denials', () => {
  const connected = new Set(['save', 'bold'] as const);
  const groups = unsupportedCommandCategories(connected);
  const commands = groups.flatMap((group) => group.commands.map((item) => item.command));
  assert.equal(new Set(commands).size, DEMO_COMMANDS.length - 2);
  assert.ok(!commands.includes('save'));
  assert.ok(!commands.includes('bold'));
  for (const group of groups)
    for (const item of group.commands) {
      assert.equal(DEMO_COMMAND_REGISTRY[item.command].category, group.category);
      assert.equal(item.reason, UNCONNECTED_COMMAND_REASON);
    }
  const actions = commandSupportActions({
    connectedCommands: connected,
    document: 'ready',
    hasSelection: true,
    availability: {
      save: { enabled: false, reason: 'SaveDenied' },
      bold: { enabled: true },
      strike: { enabled: true },
    },
  });
  assert.equal(actions.save.reason, 'SaveDenied');
  assert.equal(actions.bold.enabled, true);
  assert.equal(actions.strike.enabled, false);
  assert.equal(actions.strike.kind, 'unconnected');
  assert.equal(unsupportedCommandCategories(new Set(DEMO_COMMANDS)).length, 0);
});
test('shell preserves explicit capabilities and guards generic action callbacks', () => {
  const state = { title: '', status: '', actions: { bold: { enabled: true, pressed: true } } };
  assert.equal(actionAvailability(state, 'bold', true).enabled, true);
  assert.equal(actionAvailability(state, 'strike', true).reason, UNCONNECTED_COMMAND_REASON);
  assert.equal(actionAvailability(state, 'bold', false).enabled, false);
  assert.equal(actionAvailability(state, 'bold', true, { disposed: true }).enabled, false);
  assert.equal(actionAvailability(state, 'bold', true, { hasSelection: false }).enabled, false);
  assert.equal(actionAvailability({ ...state, busy: true }, 'bold', true).enabled, false);
  assert.equal(
    resolveCommandSupport('set-zoom', {
      connected: true,
      document: 'none',
      availability: { enabled: true },
    }).enabled,
    true,
  );
});

test('cell block appears only for table context kinds and requires live availability', () => {
  for (const kind of ['table-cell', 'source-table-cell', 'generated-table-cell'] as const)
    assert(contextCommandIds(kind).includes('table-cell-block'));
  for (const kind of ['body', 'none', 'picture'] as const)
    assert(!contextCommandIds(kind).includes('table-cell-block'));
  const support = { connected: true, document: 'ready' as const, hasSelection: false };
  assert.equal(resolveCommandSupport('table-cell-block', support).enabled, false);
  const available = { ...support, availability: { enabled: true } };
  assert.equal(resolveCommandSupport('table-cell-block', available).enabled, true);
  assert.equal(
    resolveCommandSupport('table-cell-block', { ...available, busy: true }).enabled,
    false,
  );
});
