import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_COMMAND_REGISTRY,
  resolveCommandSupport,
  contextCommandIds,
} from '../src/command-support.ts';
test('dedicated cell background command has independent label/capability and cell context', () => {
  assert.equal(DEMO_COMMAND_REGISTRY['table-cell-background'].label, '셀 배경');
  assert.equal(DEMO_COMMAND_REGISTRY['table-cell-properties'].label, '표/셀 속성');
  assert.ok(contextCommandIds('table-cell').includes('table-cell-background'));
  const supported = (availability) =>
    resolveCommandSupport('table-cell-background', {
      connected: true,
      document: 'ready',
      hasSelection: true,
      busy: false,
      disposed: false,
      availability,
    });
  assert.equal(supported({ enabled: false, reason: 'optional engine missing' }).enabled, false);
  assert.equal(supported({ enabled: true }).enabled, true);
});
