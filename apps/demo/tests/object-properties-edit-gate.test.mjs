import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectPropertiesEditGate } from '../src/object-properties-edit-gate.ts';
test('two dirty intents reject both applies and never start automatic two-commit sequence', () => {
  const g = createObjectPropertiesEditGate();
  g.setDirty('geometry', true);
  g.setDirty('margins', true);
  assert.equal(g.conflict, true);
  assert.equal(g.begin('geometry'), false);
  assert.equal(g.begin('margins'), false);
  assert.equal(g.busy, false);
  g.setDirty('geometry', false);
  assert.equal(g.begin('margins'), true);
  assert.equal(g.begin('geometry'), false);
  assert.equal(g.begin('margins'), false);
  g.end('geometry');
  assert.equal(g.busy, true);
  g.end('margins');
  assert.equal(g.busy, false);
});
test('a pristine other form cannot race a pending mutation and disposal removes only own subscriber', () => {
  const g = createObjectPropertiesEditGate();
  let seen = 0;
  const stop = g.subscribe(() => seen++);
  assert.equal(g.begin('geometry'), true);
  assert.equal(g.begin('margins'), false);
  stop();
  g.end('geometry');
  assert.equal(seen, 1);
  assert.equal(g.begin('margins'), true);
});

test('all three lane pairs conflict and no second lane races a mutation', () => {
  for (const a of ['geometry', 'margins', 'bodyFlow'])
    for (const b of ['geometry', 'margins', 'bodyFlow']) {
      if (a === b) continue;
      const g = createObjectPropertiesEditGate();
      g.setDirty(a, true);
      g.setDirty(b, true);
      assert.equal(g.conflict, true);
      assert.equal(g.begin(a), false);
      assert.equal(g.begin(b), false);
      g.setDirty(a, false);
      assert.equal(g.begin(b), true);
      for (const c of ['geometry', 'margins', 'bodyFlow']) assert.equal(g.begin(c), false);
      g.end(b);
      assert.equal(g.busy, false);
    }
});
