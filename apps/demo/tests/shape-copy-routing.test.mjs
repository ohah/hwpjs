import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
// Execute the exact controller function, without mounting the controller/browser.
// Dependencies below are controlled callbacks, not a Native or GUI test.
const filename =
  process.env.HWPJS_ROUTE_PREIMAGE ?? new URL('../src/demo-controller.ts', import.meta.url);
const source = await readFile(filename, 'utf8');
const start = source.indexOf('  async function runAction('),
  end = source.indexOf('\n  const shell = createDemoShell', start);
assert(start >= 0 && end > start);
const functionSource = stripTypeScriptTypes(source.slice(start, end));
function route(log, historyHost = true) {
  const deps = {
    closed: false,
    presentation: () => ({ actions: new Proxy({}, { get: () => ({ enabled: true }) }) }),
    note: () => {},
    generatedTableGrid: { handles: () => false },
    shapeCopy: {
      action: async (command) => {
        log.push('shape:' + command);
        return command === 'format-copy';
      },
    },
    textColor: {
      action: (command) => {
        if (command === 'text-color') {
          log.push('text-color');
          return true;
        }
        return false;
      },
    },
    pageSettingsTool: { open: () => log.push('page-settings') },
    paragraphShape: { action: () => false },
    formatDialogs: { action: () => false },
    viewOptions: { action: () => false },
    host: historyHost
      ? {
          requestHistory: (command) => {
            log.push('host:' + command);
            return true;
          },
        }
      : {},
    editor: {
      undo: () => {
        log.push('core:undo');
        return Promise.resolve({});
      },
    },
  };
  return new Function(...Object.keys(deps), functionSource + '\nreturn runAction;')(
    ...Object.values(deps),
  );
}
for (const command of ['text-color', 'page-settings', 'undo', 'redo'])
  test(
    'exact controller routing: ' +
      command +
      ' enters existing callback synchronously without ShapeCopy await',
    async () => {
      const log = [],
        run = route(log);
      const pending = run({ command });
      assert.deepEqual(log, [['undo', 'redo'].includes(command) ? 'host:' + command : command]);
      queueMicrotask(() => log.push('microtask'));
      await pending;
      assert.equal(log[0], ['undo', 'redo'].includes(command) ? 'host:' + command : command);
      assert(!log.some((s) => s.startsWith('shape:')));
    },
  );
test('exact controller routing: direct Core undo call starts before existing undo promise await', async () => {
  const log = [],
    run = route(log, false);
  const pending = run({ command: 'undo' });
  assert.deepEqual(log, ['core:undo']);
  await pending;
});
test('exact controller routing: format-copy enters ShapeCopy once and keeps awaited completion', async () => {
  const log = [],
    run = route(log);
  await run({ command: 'format-copy' });
  assert.deepEqual(log, ['shape:format-copy']);
});
