// Public UI actions through an owned agent-browser session; no private editor calls.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const origin = new URL(process.argv[2]);
assert(['127.0.0.1', 'localhost'].includes(origin.hostname));
const output = resolve(process.argv[3]);
mkdirSync(output, { recursive: false });
const session = execFileSync(
  'agent-browser',
  ['session', 'id', '--scope', 'worktree', '--prefix', 'hwpjs-grid-e2e'],
  { encoding: 'utf8' },
).trim();
const run = (...args) =>
  execFileSync('agent-browser', ['--session', session, ...args], {
    encoding: 'utf8',
    timeout: 45000,
  });
const evaluate = (text) => JSON.parse(run('eval', text));
const clickCell = () => {
  const r = evaluate('document.querySelector("canvas").getBoundingClientRect().toJSON()');
  run('mouse', 'move', String(Math.round(r.x + 145)), String(Math.round(r.y + 146)));
  run('mouse', 'down');
  run('mouse', 'up');
};
const rows = (n) => run('wait', '--fn', `document.querySelector('canvas').dataset.rows === '${n}'`);
const menu = '.hwp-demo-menus > details:nth-child(7)';
const action = (name, expectedRows) => {
  clickCell();
  run('click', menu + ' > summary');
  assert.equal(
    evaluate(
      `document.querySelector('${menu} button[data-command="generated-table-${name}"]').disabled`,
    ),
    false,
    name,
  );
  run('click', menu + ` button[data-command="generated-table-${name}"]`);
  rows(expectedRows);
};
const results = [];
let failure;
try {
  for (const framework of ['vanilla', 'react', 'svelte'])
    for (const format of ['hwpx', 'hwp5']) {
      const label = framework + '-' + format;
      run('open', new URL('/demo/' + framework + '/', origin).href);
      run('click', 'button.hwp-demo-tool[data-command="new-document"]');
      run('select', 'select[data-role="new-document-format"]', format);
      run('click', 'button[data-role="create-new-document"]');
      run(
        'wait',
        '--fn',
        `document.querySelector('h1')?.textContent.includes('.${format === 'hwp5' ? 'hwp' : 'hwpx'}') && !document.body.innerText.includes('새 문서 읽는 중')`,
      );
      run('click', 'button.hwp-demo-tool[data-command="insert-table"]');
      run('fill', 'input[data-role="table-rows"]', '2');
      run('fill', 'input[data-role="table-columns"]', '2');
      run('click', 'button[data-role="table-insert"]');
      rows(5);
      action('insert-row', 7);
      run('click', 'button.hwp-demo-format-tool[data-command="undo"]');
      rows(5);
      run('click', 'button.hwp-demo-format-tool[data-command="redo"]');
      rows(7);
      action('insert-column', 10);
      action('delete-row', 7);
      action('delete-column', 5);
      run('screenshot', join(output, label + '.png'));
      run('click', '.hwp-demo-menus > details:first-child > summary');
      if (format === 'hwp5') run('check', 'input[data-role="allow-stale-layout"]');
      const file = join(output, label + '.' + (format === 'hwp5' ? 'hwp' : 'hwpx'));
      run('download', 'nav.hwp-demo-menus button[data-command="save"]', file);
      run('upload', 'input[data-role="file-picker"]', file);
      run(
        'wait',
        '--fn',
        `document.querySelector('h1')?.textContent === '${label}.${format === 'hwp5' ? 'hwp' : 'hwpx'}' && document.body.innerText.includes('문서를 열었습니다.') && document.querySelector('canvas').dataset.paintPending === 'false'`,
      );
      clickCell();
      run('click', menu + ' > summary');
      assert.equal(
        evaluate(
          `document.querySelector('${menu} button[data-command="generated-table-insert-row"]').disabled`,
        ),
        false,
        'Reopened source table uses the separate source port; see source-table-grid-browser-audit.mjs',
      );
      const errors = run('errors').trim();
      assert.equal(errors, '', errors);
      results.push({
        framework,
        format,
        file,
        fourActions: true,
        undoRedo: true,
        downloaded: true,
        reopened: true,
        sourceGridAvailable: true,
      });
      writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
    }
} catch (error) {
  failure = error;
  try {
    run('screenshot', join(output, 'failure.png'));
    writeFileSync(join(output, 'failure-dom.txt'), run('snapshot', '-i'));
  } catch {}
} finally {
  try {
    run('close');
  } catch (error) {
    failure ??= error;
  }
  writeFileSync(
    join(output, 'cleanup.json'),
    JSON.stringify({ session, closeRequested: true, verified: !failure }, null, 2),
  );
}
if (failure) throw failure;
console.log(JSON.stringify({ cases: results.length, output }));
