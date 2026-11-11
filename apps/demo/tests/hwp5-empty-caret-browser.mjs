import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, writeFileSync, mkdirSync, statfsSync, appendFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root = process.cwd(),
  framework = process.argv[2] ?? 'vanilla',
  out = resolve(process.env.CARET_OUT ?? 'gui-' + framework),
  site = resolve(process.env.CARET_SITE ?? 'public-final-proof');
mkdirSync(out, { recursive: true });
const result = { framework, phase: 'startup', browserClosed: false, serverClosed: false };
const session = 'h5-empty-caret-r1-' + framework + '-' + process.pid;
const gate = () => {
  const s = statfsSync(root),
    free = s.bavail * s.bsize;
  assert(free >= 8 * 1024 ** 3);
  appendFileSync(join(out, 'launch-gates.jsonl'), JSON.stringify({ at: Date.now(), free }) + '\n');
};
const run = (...args) => {
    if (!args.includes('close') && !args.includes('session')) gate();
    return execFileSync('agent-browser', ['--session', session, ...args], {
      encoding: 'utf8',
      timeout: 32000,
      maxBuffer: 4 * 1024 ** 2,
    });
  },
  ev = (x) => JSON.parse(run('eval', x)),
  q = (x) => 'document.querySelector(' + JSON.stringify(x) + ')',
  wait = (x) => run('wait', '--fn', x);
const input = 'textarea[aria-label="Document text input"]',
  size = 'input[aria-label="글자 크기 (pt)"]',
  font = '[data-role=format-font-picker]',
  file = 'nav.hwp-demo-menus>details:first-child',
  canvas = q('canvas') + '.dataset',
  status = q('.hwp-demo-statusbar output') + '?.textContent';
const fixture = resolve('source/apps/docs/docs/public/editor/fixtures/page.hwp');
const hash = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
assert.equal(hash(fixture), '0677cebef471d6878e287fe72d199a2dcf3a147236caaa7c613990cf52fb3e67');
result.fixtureSha256 = hash(fixture);
result.wasmSha256 = hash(join(site, 'hwpjs/hwpjs.wasm'));
function selectEmpty() {
  run('mouse', 'move', '375', '411');
  run('mouse', 'down');
  run('mouse', 'up');
  wait('document.activeElement===' + q(input));
  run('press', 'Home');
  wait(canvas + '.caret==="0:4:0"');
}
function save(name) {
  if (!ev(q(file) + '.open')) run('click', file + '>summary');
  run('check', '[data-role=allow-stale-layout]');
  ev(
    `(()=>{window.__saved=null;document.addEventListener('click',async function take(e){const a=e.target.closest?.('a[download]');if(!a)return;document.removeEventListener('click',take,true);const r=new FileReader();r.onload=()=>window.__saved=String(r.result).split(',')[1];r.readAsDataURL(await(await fetch(a.href)).blob());},true);return true})()`,
  );
  run('click', file + ' [data-command=save]');
  wait('window.__saved!==null');
  const b = Buffer.from(ev('window.__saved'), 'base64');
  writeFileSync(join(out, name + '.hwp'), b);
  return b;
}
function observed() {
  return ev(
    `({caret:${canvas}.caret,size:${q(size)}.value,sizeState:${q(size)}.dataset.observation,font:${q(font)}.textContent,fontTitle:${q(font)}.title,fontLanguage:${q(font)}.dataset.language})`,
  );
}
function settled() {
  wait(canvas + '.paintPending==="false" && ' + canvas + '.selectionAuthority==="current"');
}
function history(key) {
  if (ev(q(file) + '.open')) run('click', file + '>summary');
  selectEmpty();
  run('press', key);
  settled();
}
let server,
  owned = false;
try {
  gate();
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
  wait(q('[data-role=file-picker]') + '!==null');
  run('upload', '[data-role=file-picker]', fixture);
  wait(status + '==="문서를 열었습니다." && ' + canvas + '.paintPending==="false"');
  selectEmpty();
  result.initial = observed();
  run('screenshot', join(out, 'empty-canvas.png'));
  if (process.env.CARET_BASELINE === '1') {
    assert.equal(result.initial.size, '');
    assert.equal(result.initial.font, '글꼴 정보 미관측');
    result.phase = 'baseline reproduced';
  } else {
    result.phase = 'declared empty';
    assert.equal(result.initial.size, '10');
    assert.equal(result.initial.font, '바탕');
    assert.equal(result.initial.sizeState, 'single');
    assert.deepEqual(save('unchanged'), readFileSync(fixture));
    if (ev(q(file) + '.open')) run('click', file + '>summary');
    selectEmpty();
    run('press', 'x');
    wait(canvas + '.caret==="0:4:1"');
    settled();
    assert.equal(observed().size, '10');
    const typed = save('typed');
    result.phase = 'default input history';
    history('Meta+z');
    selectEmpty();
    assert.equal(observed().size, '10');
    assert.deepEqual(save('undo'), readFileSync(fixture));
    history('Meta+Shift+z');
    assert.deepEqual(save('redo'), typed);
    history('Meta+z');
    selectEmpty();
    result.phase = 'caret movement';
    run('press', 'ArrowUp');
    wait(canvas + '.caret!=="0:4:0"');
    result.other = observed();
    selectEmpty();
    assert.equal(observed().size, '10');
    result.phase = 'pending explicit-language font';
    run('select', 'select[aria-label="글꼴 적용 언어"]', 'latin');
    run('click', font);
    wait(q('[data-role=font-name-input]') + '!==null');
    run('select', '[data-role=font-name-language]', 'latin');
    run('fill', '[data-role=font-name-input]', 'Caret Latin');
    run('click', '[data-role=font-name-apply]');
    wait(q('[data-role=font-name-dialog]') + '===null');
    wait('document.activeElement===' + q(input));
    assert.equal(observed().font, 'Caret Latin');
    run('select', 'select[aria-label="글꼴 적용 언어"]', 'hangul');
    assert.equal(observed().font, '바탕');
    run('select', 'select[aria-label="글꼴 적용 언어"]', '');
    assert.equal(observed().font, '언어별 글꼴');
    result.pendingLanguage = observed();
    run('screenshot', join(out, 'pending-language.png'));
    assert.deepEqual(save('pending-font-no-write'), readFileSync(fixture));
    if (ev(q(file) + '.open')) run('click', file + '>summary');
    run('focus', input);
    run('press', 'ArrowUp');
    selectEmpty();
    assert.equal(observed().font, '바탕');
    assert.equal(observed().size, '10');
    result.phase = 'pending size intent';
    run('fill', size, '12');
    run('click', 'form.hwp-demo-size button');
    wait('document.activeElement===' + q(input));
    assert.equal(observed().size, '12');
    run('screenshot', join(out, 'pending-canvas.png'));
    assert.deepEqual(save('pending-no-write'), readFileSync(fixture));
    if (ev(q(file) + '.open')) run('click', file + '>summary');
    run('focus', input);
    run('press', 'y');
    wait(canvas + '.caret==="0:4:1"');
    settled();
    assert.equal(observed().size, '12');
    const pendingTyped = save('pending-typed');
    history('Meta+z');
    selectEmpty();
    result.afterPendingUndo = observed();
    assert.equal(result.afterPendingUndo.size, '10');
    assert.deepEqual(save('pending-undo'), readFileSync(fixture));
    history('Meta+Shift+z');
    assert.deepEqual(save('pending-redo'), pendingTyped);
    result.phase = 'reopen';
    run('upload', '[data-role=file-picker]', join(out, 'pending-typed.hwp'));
    wait(status + '==="문서를 열었습니다." && ' + canvas + '.paintPending==="false"');
    selectEmpty();
    assert.equal(observed().size, '12');
    assert.equal(observed().font, '바탕');
    assert.deepEqual(save('reopened'), pendingTyped);
    run('screenshot', join(out, 'reopened.png'));
    assert.deepEqual(JSON.parse(run('--json', 'errors')).data.errors, []);
    result.phase = 'complete';
  }
} catch (error) {
  result.error = String(error);
  if (owned) {
    try {
      writeFileSync(
        join(out, 'state.json'),
        JSON.stringify(
          ev(`({status:${status},canvas:{...${canvas}},active:document.activeElement.outerHTML})`),
        ),
      );
      writeFileSync(join(out, 'failure.txt'), run('snapshot', '-i'));
      run('screenshot', join(out, 'failure.png'));
    } catch {}
  }
  throw error;
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
    writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  }
}
