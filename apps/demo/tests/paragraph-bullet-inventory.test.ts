import test from 'node:test';
import assert from 'node:assert/strict';
import { createParagraphBulletPort } from '../src/paragraph-bullet-port.ts';
const command = { name: 'apply-formatting-patch', id: Symbol() };
const inventory = {
  schemaVersion: 1,
  state: 'available',
  scope: 'current-header',
  coverage: 'complete',
  declarations: [
    { ordinal: 0, id: 99, marker: 0x2605, canApply: true, reason: null },
    { ordinal: 1, id: 100, marker: null, canApply: false, reason: 'UnsupportedBulletDeclaration' },
  ],
};
function harness(list: () => Promise<any> = async () => inventory) {
  let current = true,
    queries = 0;
  const sent: any[] = [];
  const state: any = {
    status: 'ready',
    stateVersion: 17,
    token: {},
    content: {
      get paragraphs() {
        throw Error('DoNotInferFromParagraphs');
      },
    },
  };
  const api: any = {
    command,
    target: () => ({ format: 'hwpx', section: 0, paragraph: 4 }),
    capabilities: async () => ({
      atomic: true,
      fields: { 'paragraph.bullet': { readable: true, writable: true } },
      selectionAdmissionFence: {
        version: 1,
        epoch: 'stateVersion',
        commands: ['APPLY_FORMATTING_PATCH'],
      },
    }),
    query: async () => {
      queries++;
      return {
        observations: {
          aggregate: {
            'paragraph.bullet': { state: 'known', value: { kind: 'none' }, writable: true },
          },
        },
      };
    },
    dispatch: async (_: any, p: any) => {
      sent.push(p);
      return { status: 'committed-with-snapshot' };
    },
  };
  return {
    state,
    port: createParagraphBulletPort(api, list),
    current: () => current,
    invalidate: () => (current = false),
    sent,
    queries: () => queries,
  };
}
test('UI lists unused header definitions and keeps unsupported declarations without scanning paragraph IDs', async () => {
  const h = harness(),
    captured = await h.port.read(h.state, h.current);
  assert.equal(h.queries(), 1);
  assert.equal(captured.declarations.length, 2);
  assert.deepEqual(captured.choices, [{ id: 99, marker: 0x2605 }]);
  await h.port.apply(captured, { kind: 'existing', id: 99 }, h.current);
  assert.equal(h.sent[0].selectionVersion, 17);
  assert.throws(
    () => h.port.apply(captured, { kind: 'existing', id: 100 }, h.current),
    /Unobserved/,
  );
});
test('old ABI and partial lists fail closed without guessing a fallback catalog', async () => {
  for (const result of [
    { state: 'unavailable', reason: 'ParagraphBulletDefinitionsAbiUnavailable' },
    { ...inventory, coverage: 'partial' },
  ]) {
    const h = harness(async () => result);
    await assert.rejects(h.port.read(h.state, h.current));
    assert.equal(h.sent.length, 0);
  }
});
test('stale Native inventory completion never becomes an actionable catalog', async () => {
  let release!: () => void, entered!: () => void;
  const wait = new Promise<void>((r) => (release = r)),
    started = new Promise<void>((r) => (entered = r));
  const h = harness(async () => {
    entered();
    await wait;
    return inventory;
  });
  const read = h.port.read(h.state, h.current);
  await started;
  h.invalidate();
  release();
  await assert.rejects(read, /Stale/);
  assert.equal(h.sent.length, 0);
});
