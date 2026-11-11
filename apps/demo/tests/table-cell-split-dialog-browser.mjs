import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, statfsSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const site = resolve(process.env.SPLIT_SITE),
  fixture = resolve(process.env.SPLIT_FIXTURE),
  oracle = resolve(process.env.SPLIT_ORACLE);
const framework = process.env.HWPJS_FRAMEWORK || 'vanilla',
  out = resolve(process.env.SPLIT_OUT);
assert(['vanilla', 'react', 'svelte'].includes(framework));
mkdirSync(out, { recursive: true });
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
assert.equal(hash(fixture), process.env.SPLIT_FIXTURE_SHA256);
assert.equal(hash(oracle), process.env.SPLIT_ORACLE_SHA256);
const result = {
  framework,
  phase: 'startup',
  fixtureSha256: hash(fixture),
  oracleSha256: hash(oracle),
  browserClosed: false,
  serverClosed: false,
};
function gate(cmd) {
  const s = statfsSync(out),
    free = s.bavail * s.bsize;
  appendFileSync(
    join(out, 'launch-gates.jsonl'),
    JSON.stringify({ at: new Date().toISOString(), cmd, free }) + '\n',
  );
  assert(free >= 8 * 1024 ** 3, 'disk below 8 GiB');
}
const session = 'hwpjs-split-ui-r1-' + framework + '-' + process.pid;
const run = (...args) => {
  if (!['close', 'session'].includes(args.at(-1)) && !args.includes('close'))
    gate('agent-browser ' + args[0]);
  return execFileSync('agent-browser', ['--session', session, ...args], {
    encoding: 'utf8',
    timeout: 32000,
    maxBuffer: 4 * 1024 ** 2,
  });
};
const ev = (x) => JSON.parse(run('eval', x)),
  q = (x) => 'document.querySelector(' + JSON.stringify(x) + ')',
  wait = (x) => run('wait', '--fn', x);
const input = 'textarea[aria-label="Document text input"]',
  file = 'nav.hwp-demo-menus > details:first-child',
  table = 'nav.hwp-demo-menus > details:has([data-command="table-cell-split"])';
const menu = table + ' [data-command="table-cell-split"]',
  context = '.hwpjs-document-context-menu:not([hidden]) [data-command-id="table-cell-split"]';
const dialog = 'dialog[data-role="table-cell-split-dialog"]',
  row = dialog + ' [name=splitRows]',
  col = dialog + ' [name=splitColumns]',
  apply = dialog + ' [data-role=apply-cell-split]',
  cancel = dialog + ' [data-role=cancel-cell-split]';
const status = q('.hwp-demo-statusbar output') + '?.textContent',
  canvas = q('canvas') + '?.dataset';
function upload(path) {
  run('upload', '[data-role=file-picker]', path);
  wait(status + '==="문서를 열었습니다." && ' + canvas + '.paintPending==="false"');
}
function save(name) {
  if (!ev(q(file) + '.open')) run('click', file + ' > summary');
  run('check', '[data-role=allow-stale-layout]');
  ev(
    `(()=>{window.__splitDownload=null;document.addEventListener('click',async function take(e){const a=e.target.closest?.('a[download]');if(!a)return;document.removeEventListener('click',take,true);const r=new FileReader();r.onload=()=>window.__splitDownload=String(r.result).split(',')[1];r.readAsDataURL(await(await fetch(a.href)).blob());},true);return true})()`,
  );
  run('click', file + ' [data-command=save]');
  wait('window.__splitDownload!==null');
  const b = Buffer.from(ev('window.__splitDownload'), 'base64');
  writeFileSync(join(out, name + '.hwp'), b);
  return b;
}
function select() {
  run('mouse', 'move', '326', '308');
  run('mouse', 'down');
  run('mouse', 'up');
  wait('document.activeElement===' + q(input));
  run('press', 'F5');
  wait(canvas + '.paintedCellBlockCount==="1"');
}
function openMenu() {
  run('click', table + ' > summary');
  run('click', menu);
  wait(q(dialog) + '?.open===true');
}
function geometry() {
  return ev(
    `(()=>{const d=${q(dialog)},style=getComputedStyle(d);return {dialog:d.getBoundingClientRect().toJSON(),border:style.borderTopWidth,borderColor:style.borderTopColor,viewport:[innerWidth,innerHeight],counts:[...d.querySelectorAll('.hwp-cell-split-count')].map(l=>{const r=document.createRange();r.selectNode(l.firstChild);return {text:r.getBoundingClientRect().toJSON(),input:l.querySelector('input').getBoundingClientRect().toJSON()}}),buttonPadding:getComputedStyle(d.querySelector('[data-role=apply-cell-split]')).padding,overflow:d.scrollWidth>d.clientWidth}})()`,
  );
}
let server,
  owned = false;
try {
  gate('python http.server');
  server = spawn(
    'python3',
    ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1', '--directory', site],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const [m] = await once(server.stdout, 'data');
  const port = /port (\d+)/.exec(String(m))?.[1];
  assert(port);
  assert.equal(JSON.parse(run('--json', 'session', 'info')).data.active, false);
  owned = true;
  run('open', `http://127.0.0.1:${port}/demo/${framework}/`);
  wait(q(menu) + '!==null');
  upload(fixture);
  run('screenshot', join(out, 'opened.png'));
  result.phase = 'pointer F5 context menu';
  select();
  run('mouse', 'down', 'right');
  run('mouse', 'up', 'right');
  wait(q(context) + '?.disabled===false');
  run('click', context);
  wait(q(dialog) + '?.open===true');
  assert.equal(ev('document.activeElement.name'), 'splitColumns');
  assert.equal(ev(q(dialog + ' [name=equalizeRows]') + '.disabled'), true);
  assert.equal(ev(q(dialog + ' [value=merge-then-split]') + '.disabled'), true);
  assert(ev(q(dialog + ' [data-role=cell-split-scope]') + '.textContent').includes('후속'));
  result.desktop = geometry();
  assert.equal(result.desktop.border, '1px');
  for (const c of result.desktop.counts) assert(c.text.bottom <= c.input.top);
  assert(!result.desktop.overflow);
  assert(result.desktop.counts[0].input.right < result.desktop.counts[1].input.left);
  run('screenshot', join(out, 'dialog.png'));
  ev('window.__splitSentinel=17');
  run('press', 'F5');
  assert.equal(ev('window.__splitSentinel'), 17);
  assert.equal(ev(canvas + '.cellBlockCount'), '1');
  assert.equal(ev(canvas + '.cellBlockActiveCell'), '0:0');
  result.focusCycle = [];
  for (let i = 0; i < 8; i++) {
    run('press', 'Tab');
    assert(ev(q(dialog) + '.contains(document.activeElement)'));
    result.focusCycle.push(
      ev(
        '({name:document.activeElement.name,role:document.activeElement.dataset.role,visible:document.activeElement.matches(":focus-visible")})',
      ),
    );
  }
  run('press', 'Shift+Tab');
  assert(ev(q(dialog) + '.contains(document.activeElement)'));
  run('click', cancel);
  wait(q(dialog) + '===null');
  assert(ev('document.activeElement===' + q(input)));
  run('press', 'ArrowRight');
  wait(canvas + '.cellBlockActiveCell==="0:1"');
  run('press', 'ArrowLeft');
  wait(canvas + '.cellBlockActiveCell==="0:0"');
  result.cancelKeyboardCellNavigation = true;
  assert.deepEqual(save('cancel'), readFileSync(fixture));
  result.phase = 'table menu Escape';
  openMenu();
  run('press', 'Escape');
  wait(q(dialog) + '===null');
  assert(ev('document.activeElement===' + q(input)));
  assert.deepEqual(save('escape'), readFileSync(fixture));
  result.phase = 'validation responsive';
  openMenu();
  for (const [r, c] of [
    ['1', '1'],
    ['0', '2'],
    ['64', '2'],
    ['1.5', '2'],
  ]) {
    run('fill', row, r);
    run('fill', col, c);
    run('click', apply);
    assert(ev(q(dialog) + '?.open'));
  }
  run('fill', row, '2');
  run('fill', col, '3');
  run('set', 'viewport', '320', '568');
  result.mobile = geometry();
  assert(!result.mobile.overflow);
  for (const c of result.mobile.counts) assert(c.text.bottom <= c.input.top);
  assert(result.mobile.dialog.left >= 0 && result.mobile.dialog.right <= 320);
  run('screenshot', join(out, 'dialog-mobile.png'));
  run('set', 'viewport', '1280', '720');
  result.phase = 'apply follow focus';
  run('click', apply);
  wait(status + '==="셀을 나눴습니다."');
  wait(canvas + '.paintPending==="false"');
  assert(ev('document.activeElement===' + q('canvas')));
  result.followFocus = ev(
    `({active:document.activeElement.getAttribute('aria-label'),canvas:{...${canvas}}})`,
  );
  const split = save('split');
  result.phase = 'independent CFB';
  for (const flags of [[], ['-O']]) {
    gate('CFB oracle');
    execFileSync('python3', [...flags, oracle, fixture, join(out, 'split.hwp')], {
      stdio: 'inherit',
    });
  }
  run('click', 'button.hwp-demo-format-tool[data-command=undo]');
  wait(canvas + '.selectionAuthority==="current"');
  assert.deepEqual(save('undo'), readFileSync(fixture));
  run('click', 'button.hwp-demo-format-tool[data-command=redo]');
  wait(canvas + '.selectionAuthority==="current"');
  assert.deepEqual(save('redo'), split);
  upload(join(out, 'split.hwp'));
  assert.deepEqual(save('reopened'), split);
  run('screenshot', join(out, 'reopened.png'));
  if (process.env.HWPJS_SPLIT_CONTROLLED_CONTRACTS === '1') {
    result.phase = 'controlled UI contracts';
    result.contracts = ev('(async()=>await window.runSplitContracts())()');
    assert.equal(result.contracts.cases.length, 6);
  }
  assert.deepEqual(JSON.parse(run('--json', 'errors')).data.errors, []);
  result.phase = 'complete';
} catch (e) {
  result.error = String(e);
  if (owned) {
    try {
      writeFileSync(join(out, 'failure.txt'), run('snapshot', '-i'));
      run('screenshot', join(out, 'failure.png'));
      writeFileSync(
        join(out, 'state.json'),
        JSON.stringify(
          ev(`({status:${status},canvas:{...${canvas}},active:document.activeElement.outerHTML})`),
          null,
          2,
        ),
      );
    } catch {}
  }
  throw e;
} finally {
  try {
    if (owned) {
      assert(JSON.parse(run('--json', 'close')).success);
      for (let i = 0; i < 20; i++) {
        result.session = JSON.parse(run('--json', 'session', 'info')).data;
        if (!result.session.active && result.session.pid === null) {
          result.browserClosed = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      assert(result.browserClosed);
    }
  } finally {
    if (server && server.exitCode === null && server.signalCode === null) {
      server.kill();
      await once(server, 'exit');
    }
    result.serverClosed = !!server && (server.exitCode !== null || server.signalCode !== null);
    result.wasmSha256 = hash(join(site, 'hwpjs/hwpjs.wasm'));
    writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  }
}
