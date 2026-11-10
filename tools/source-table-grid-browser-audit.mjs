// Task AE: prepare only. Main must authorize launch after the SOURCE WASM/router is ready.
// Usage (the caller starts/owns a fresh loopback server separately):
// HWPJS_SOURCE_GRID_BROWSER_AUTHORIZED=1 HWPJS_TEST_FRESH_ORIGIN=http://127.0.0.1:PORT \
// HWPJS_TEST_SOURCE_ROOT=/Users/yoonhb/Documents/workspace/hwpjs/zig-out/verification/document-transforms-connect-r1/source \
// HWPJS_TEST_ORACLE_ROOT=/Users/yoonhb/Documents/workspace/hwpjs/zig-out/verification/ORACLE HWPJS_TEST_CFB_SHA256=<64 hex> \
// node tools/source-table-grid-browser-audit.mjs http://127.0.0.1:PORT /absolute/new/evidence/dir
// No server, build, Git, fixture input, private editor calls, or eval mutations.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { closeOwnedBrowser } from './browser/session-close.mjs';
import { inspectBrowserCli } from './browser/bounded-cli-runner.mjs';

const candidateSuffix = '/zig-out/verification/document-transforms-connect-r1/source';
const location = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const control = location.endsWith(candidateSuffix)
  ? location.slice(0, -candidateSuffix.length)
  : location;
const candidate = join(control, 'zig-out/verification/document-transforms-connect-r1/source');
const verification = join(control, 'zig-out/verification');
const inside = (base, path) => path === base || path.startsWith(base + sep);
function safePath(value) {
  assert(typeof value === 'string' && isAbsolute(value), 'ExplicitAbsolutePathRequired');
  // Reject lexically BEFORE stat/read/import/mkdir, including paths hidden by .. normalization.
  const segments = value.split(/[\\/]+/u);
  assert(!segments.includes('..'), 'ParentTraversalForbidden');
  assert(
    !segments.some((part) =>
      /rhwp|reverse|title-column-roundtrip\.test\.mjs|hwpers_test4_complex_table\.hwp/iu.test(part),
    ),
    'ForbiddenPath',
  );
  const path = resolve(value);
  assert(inside(control, path), 'PathOutsideControlRoot');
  return path;
}
const root = safePath(process.env.HWPJS_TEST_SOURCE_ROOT);
assert(root === control || root === candidate, 'UnapprovedSourceRoot');
const output = safePath(process.argv[3]);
assert(
  inside(verification, output) && output !== verification,
  'EvidenceMustBeNewVerificationChild',
);
assert(!inside(candidate, output), 'EvidenceMustNotModifyCandidateSource');
const oracleRoot = safePath(process.env.HWPJS_TEST_ORACLE_ROOT);
const oracleModule = safePath(join(root, 'tools/created-table-grid-oracle.mjs'));
const cfb = safePath(join(oracleRoot, 'legacy/cfb.js'));
const cfbSha256 = process.env.HWPJS_TEST_CFB_SHA256;
assert(/^[a-f0-9]{64}$/u.test(cfbSha256 ?? ''), 'ExplicitCFBSHA256Required');
const origin = new URL(process.argv[2]);
assert.equal(origin.protocol, 'http:');
assert(['127.0.0.1', 'localhost'].includes(origin.hostname), 'LoopbackOnly');
assert(origin.port && !origin.username && !origin.password, 'ExplicitLoopbackPortRequired');
assert.equal(origin.href, origin.origin + '/', 'OriginOnly');
assert.equal(process.env.HWPJS_TEST_FRESH_ORIGIN, origin.origin, 'CallerMustAttestFreshOrigin');
assert.equal(
  process.env.HWPJS_SOURCE_GRID_BROWSER_AUTHORIZED,
  '1',
  'MainLaunchAuthorizationRequired',
);
assert.equal(resolve(process.cwd()), root, 'RunFromConfiguredSourceRoot');
assert(!inside(output, root) && !inside(output, oracleRoot), 'EvidenceContainsInput');

function noSymlinks(path, missingLeaf = false) {
  const parts = relative(control, path).split(sep).filter(Boolean);
  let current = control;
  assert(!lstatSync(current).isSymbolicLink(), 'SymlinkControlRoot');
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]);
    try {
      assert(!lstatSync(current).isSymbolicLink(), 'SymlinkInputOrOutput');
      if (missingLeaf && index === parts.length - 1) assert.fail('EvidenceAlreadyExists');
    } catch (error) {
      if (missingLeaf && index === parts.length - 1 && error.code === 'ENOENT') return;
      throw error;
    }
  }
}
// These are the first filesystem operations, after every configured path is rejected/accepted.
noSymlinks(root);
noSymlinks(oracleModule);
noSymlinks(cfb);
noSymlinks(output, true);
assert.equal(createHash('sha256').update(readFileSync(cfb)).digest('hex'), cfbSha256);
const { inspectCreatedGridArchive } = await import(pathToFileURL(oracleModule).href);
// Bypass only a locally verified launcher shim. A timed-out wrapper must not orphan
// an unowned child process; unknown wrappers are refused before any browser command.
const browserCli = inspectBrowserCli();
assert.equal(browserCli.mode, 'native-direct', 'NativeBrowserCLIRequiredForBoundedProcessCleanup');
mkdirSync(output, { recursive: false });

const id = randomUUID();
let session,
  owned = false,
  failure,
  stage = 'preflight';
const commands = [],
  results = [],
  observations = [];
const json = (name, value) =>
  writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n');
const cli = (args) => {
  const entry = { stage, args, started: new Date().toISOString() };
  commands.push(entry);
  try {
    const stdout = execFileSync(browserCli.executable.path, args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 45000,
      killSignal: 'SIGKILL', // Only this audit's synchronous CLI child, never a global process sweep.
      maxBuffer: 16 * 1024 * 1024,
    });
    entry.stdout = stdout;
    return stdout;
  } catch (error) {
    entry.error = String(error);
    entry.stdout = String(error.stdout ?? '');
    entry.stderr = String(error.stderr ?? '');
    throw error;
  } finally {
    json('commands.json', commands);
  }
};
const run = (...args) => cli(['--session', session, ...args]);
const evaluate = (expression) => JSON.parse(run('eval', expression));
const wait = (expression) => run('wait', '--fn', expression);
const statusExpression = `document.querySelector('.hwp-demo-statusbar output')?.textContent`;
const traceExpression = `Array.from(document.querySelectorAll('.hwp-demo-trace li')).filter(e=>e.querySelector('strong')?.textContent==='state').at(-1)?.textContent`;
const settledExpression = `(()=>{const c=document.querySelector('canvas'),i=document.querySelector('textarea[data-hwpjs-document-input]');return c?.dataset.paintPending==='false' && c.dataset.selectionAuthority==='current' && c.dataset.composing!=='true' && i && i.getAttribute('aria-busy')!=='true';})()`;
function settle() {
  wait(settledExpression);
}
function witness(label) {
  const value = evaluate(
    `({status:${statusExpression},trace:${traceExpression},canvas:{...document.querySelector('canvas').dataset},inputBusy:document.querySelector('textarea[data-hwpjs-document-input]')?.getAttribute('aria-busy')})`,
  );
  observations.push({ stage, label, ...value });
  json('observations.json', observations);
  return value;
}
function changedSince(trace) {
  wait(`${traceExpression} !== ${JSON.stringify(trace)} && ${settledExpression}`);
}
const gridMenu = '.hwp-demo-menus > details:nth-child(7)';
const fileMenu = '.hwp-demo-menus > details:first-child';
function openMenu(selector) {
  if (!evaluate(`document.querySelector(${JSON.stringify(selector)})?.open`))
    run('click', selector + ' > summary');
}
function closeMenu(selector) {
  if (evaluate(`document.querySelector(${JSON.stringify(selector)})?.open`))
    run('click', selector + ' > summary');
}
function matrix(bytes, format, rows, columns) {
  const archive = inspectCreatedGridArchive(bytes, format);
  assert.equal(archive.tables.length, 1, 'ExactlyOneSavedTable');
  const table = archive.tables[0];
  assert.equal(table.rows, rows, 'IndependentSavedRowCount');
  assert.equal(table.columns, columns, 'IndependentSavedColumnCount');
  assert.equal(table.cells.length, rows * columns, 'SavedMatrixCardinality');
  const coordinates = new Set();
  for (const cell of table.cells) {
    assert(Number.isInteger(cell.row) && cell.row >= 0 && cell.row < rows);
    assert(Number.isInteger(cell.column) && cell.column >= 0 && cell.column < columns);
    assert.equal(cell.rowSpan, 1);
    assert.equal(cell.columnSpan, 1);
    assert(cell.width > 0 && cell.height > 0, 'PositiveCellDimensions');
    const key = `${cell.row}:${cell.column}`;
    assert(!coordinates.has(key), 'DuplicateSavedCell');
    coordinates.add(key);
    assert.equal(typeof cell.text, 'string');
  }
  return archive;
}
function textMatrix(archive) {
  return archive.tables[0].cells
    .map(({ row, column, text }) => ({ row, column, text }))
    .sort((a, b) => a.row - b.row || a.column - b.column);
}
function save(label, format, dims) {
  settle();
  openMenu(fileMenu);
  if (format === 'hwp5') run('check', 'input[data-role="allow-stale-layout"]');
  const file = join(output, `${label}.${format === 'hwp5' ? 'hwp' : 'hwpx'}`);
  run('download', 'nav.hwp-demo-menus button[data-command="save"]', file);
  closeMenu(fileMenu);
  noSymlinks(file);
  const bytes = readFileSync(file);
  const archive = matrix(bytes, format, ...dims);
  json(label + '-oracle.json', {
    file,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    ...archive,
  });
  return { file, archive };
}
function reopen(file) {
  const trace = evaluate(traceExpression);
  run('upload', 'input[data-role="file-picker"]', file);
  wait(
    `document.querySelector('.hwp-demo-titlebar h1, h1')?.textContent === ${JSON.stringify(file.split(sep).at(-1))} && ${statusExpression}?.includes('문서를 열었습니다.')`,
  );
  changedSince(trace);
}

const gridViewButton = 'button.hwp-demo-tool[data-command="toggle-grid"]';
function ensureTableGuides(label) {
  // A blank SOURCE seed legitimately has no printable borders. Use only the existing
  // view toggle: never add file borders or manufacture a layout/selection in eval.
  settle();
  const readState = () =>
    evaluate(
      `(()=>{const buttons=document.querySelectorAll(${JSON.stringify(gridViewButton)}),b=buttons[0],c=document.querySelector('canvas');return {buttonCount:buttons.length,disabled:b?.disabled,pressed:b?.getAttribute('aria-pressed'),showTableGrid:c?.dataset.showTableGrid};})()`,
    );
  const before = readState();
  assert.equal(before.buttonCount, 1, 'ExistingGridViewButtonRequired');
  assert.equal(before.disabled, false, 'GridViewToggleMustBeAvailable');
  assert(['true', 'false'].includes(before.pressed), 'GridViewPressedDiagnosticRequired');
  assert.equal(before.showTableGrid, before.pressed, 'GridViewUIAndPaintMustAgree');
  const clicked = before.pressed === 'false';
  if (clicked) run('click', gridViewButton);
  wait(
    `document.querySelector(${JSON.stringify(gridViewButton)})?.getAttribute('aria-pressed')==='true' && document.querySelector('canvas')?.dataset.showTableGrid==='true' && ${settledExpression}`,
  );
  json(label + '-grid-view.json', { before, clicked, after: readState(), viewOnly: true });
}

// Read the ACTUAL painted table rules and canvas DOM rectangle, never a cached generated
// row count or private layout call. Reject ambiguous/nonrectangular paint instead of guessing.
// A screenshot and the selected pixel bands are retained for human review on every selection.
function selectCell(label, dims, requireWritable = true) {
  closeMenu(fileMenu);
  closeMenu(gridMenu);
  ensureTableGuides(label);
  run('screenshot', join(output, label + '-before-select.png'));
  const geometry = evaluate(`(()=>{
    const c=document.querySelector('canvas'),rect=c.getBoundingClientRect().toJSON();
    const w=c.width,h=c.height,p=c.getContext('2d').getImageData(0,0,w,h).data;
    const dark=(x,y)=>{const at=(y*w+x)*4,r=p[at],g=p[at+1],b=p[at+2];return p[at+3]>240&&Math.max(r,g,b)<220&&Math.max(r,g,b)-Math.min(r,g,b)<45;};
    const horizontal=[];
    for(let y=0;y<h;y++){
      let start=-1;
      for(let x=0;x<=w;x++){
        if(x<w&&dark(x,y)){if(start<0)start=x;}
        else if(start>=0){if(x-start>150&&x-start<w*.95)horizontal.push({y,left:start,right:x-1});start=-1;}
      }
    }
    const candidates=[];
    for(const top of horizontal){
      const bottom=horizontal.find(b=>b.y>top.y+8&&b.y<top.y+120*(h/rect.height)&&Math.abs(b.left-top.left)<3&&Math.abs(b.right-top.right)<3);
      if(!bottom)continue;
      const bands=[];
      for(let x=top.left;x<=top.right;x++){
        let count=0;for(let y=top.y+2;y<bottom.y-1;y++)if(dark(x,y))count++;
        if(count>=Math.max(1,(bottom.y-top.y-3)*.85)){
          if(bands.length&&x===bands.at(-1).end+1)bands.at(-1).end=x;else bands.push({start:x,end:x});
        }
      }
      if(bands.length===${dims[1] + 1})candidates.push({top,bottom,bands});
    }
    const first=candidates.sort((a,b)=>a.top.y-b.top.y)[0];
    return {rect,width:w,height:h,first:first??null,candidateCount:candidates.length};
  })()`);
  json(label + '-geometry.json', geometry);
  assert(
    geometry.first,
    'PaintedSourceCellGeometryNotFound: review screenshot, do not guess coordinates',
  );
  const { rect, width, height, first } = geometry;
  const x = rect.x + (((first.bands[0].end + first.bands[1].start) / 2) * rect.width) / width;
  const y = rect.y + (((first.top.y + first.bottom.y) / 2) * rect.height) / height;
  assert(Number.isFinite(x) && Number.isFinite(y));
  assert(x >= 0 && y >= 0);
  run('mouse', 'move', String(Math.round(x)), String(Math.round(y)));
  run('mouse', 'down');
  run('mouse', 'up');
  settle();
  if (requireWritable)
    assert(
      evaluate(
        `(()=>{const i=document.querySelector('textarea[data-hwpjs-document-input]');return document.activeElement===i && !i.disabled && !i.readOnly;})()`,
      ),
      'TrustedCanvasClickMustFocusDocumentTextarea',
    );
  witness(label);
}
function sourceAdmission(label, dims) {
  selectCell(label, dims);
  openMenu(gridMenu);
  const buttons = evaluate(
    `Array.from(document.querySelectorAll('${gridMenu} button[data-command^="generated-table-"]')).map(b=>({command:b.dataset.command,disabled:b.disabled,title:b.title}))`,
  );
  assert.equal(buttons.length, 4);
  for (const button of buttons) assert.equal(button.disabled, false, JSON.stringify(button));
  // On a reopened file these are SOURCE selections. The shared router's SOURCE port
  // requires Native state.capabilities AND content.sourceTableGridAvailable === true.
  // This observes UI admission, not direct/private access to either Native flag.
  json(label + '-admission.json', {
    evidence: 'reopened-source-only UI admission through Native-gated router',
    buttons,
  });
}
function history(kind) {
  const trace = evaluate(traceExpression);
  const selector = `button.hwp-demo-format-tool[data-command="${kind}"]`;
  assert.equal(evaluate(`document.querySelector(${JSON.stringify(selector)}).disabled`), false);
  run('click', selector);
  changedSince(trace);
  wait(`${statusExpression}?.startsWith('실행 취소/다시 실행 적용 ·') && ${settledExpression}`);
}

try {
  session = cli([
    'session',
    'id',
    '--scope',
    'worktree',
    '--prefix',
    'hwpjs-source-grid-' + id,
  ]).trim();
  assert(/^[\w.-]+$/u.test(session), 'UnexpectedSessionId');
  const info = JSON.parse(cli(['--session', session, '--json', 'session', 'info']));
  assert.equal(info.success, true);
  assert.equal(info.data.active, false, 'NeverTakeOverExistingBrowser');
  owned = true;
  json('config.json', {
    root,
    oracleRoot,
    cfbSha256,
    origin: origin.origin,
    output,
    session,
    serverOwned: false,
  });
  for (const framework of ['vanilla', 'react', 'svelte']) {
    for (const format of ['hwp5', 'hwpx']) {
      const label = `${framework}-${format}`;
      stage = `${label}:new`;
      run('open', new URL(`/demo/${framework}/`, origin).href);
      run('click', 'button.hwp-demo-tool[data-command="new-document"]');
      run('select', 'select[data-role="new-document-format"]', format);
      run('click', 'button[data-role="create-new-document"]');
      wait(
        `document.querySelector('.hwp-demo-titlebar h1, h1')?.textContent.includes('.${format === 'hwp5' ? 'hwp' : 'hwpx'}') && ${statusExpression}?.includes('문서를 열었습니다.') && !!document.querySelector('canvas')`,
      );
      run('click', 'button.hwp-demo-tool[data-command="insert-table"]');
      run('fill', 'input[data-role="table-rows"]', '2');
      run('fill', 'input[data-role="table-columns"]', '2');
      run('click', 'button[data-role="table-insert"]');
      wait(
        `${statusExpression} === '표를 만들었습니다. 셀을 선택해주세요.' && ${settledExpression}`,
      );
      const seed = save(label + '-seed', format, [2, 2]);
      reopen(seed.file); // This file, not a fixture/generated identity, is now the SOURCE.
      const checkpoints = [];
      let dims = [2, 2];
      for (const [action, next] of [
        ['insert-row', [3, 2]],
        ['insert-column', [3, 3]],
        ['delete-row', [2, 3]],
        ['delete-column', [2, 2]],
      ]) {
        stage = `${label}:${action}`;
        sourceAdmission(`${label}-${action}`, dims);
        const trace = evaluate(traceExpression);
        run('click', `${gridMenu} button[data-command="generated-table-${action}"]`);
        changedSince(trace);
        wait(
          `${statusExpression} === '표의 행·열을 변경했습니다. 셀을 다시 선택하세요.' && ${settledExpression}`,
        );
        closeMenu(gridMenu);
        const applied = save(`${label}-${action}`, format, next);
        assert(
          textMatrix(applied.archive).every((cell) => cell.text === ''),
          'GridActionChangedBlankCellText',
        );
        history('undo');
        const undone = save(`${label}-${action}-undo`, format, dims);
        assert(textMatrix(undone.archive).every((cell) => cell.text === ''));
        history('redo');
        const redone = save(`${label}-${action}-redo`, format, next);
        assert.deepEqual(textMatrix(redone.archive), textMatrix(applied.archive));
        witness(`${label}-${action}-settled`);
        checkpoints.push({
          action,
          dimensions: next,
          applied: applied.file,
          undo: undone.file,
          redo: redone.file,
        });
        dims = next;
      }
      stage = `${label}:typing`;
      selectCell(label + '-typing', dims, false);
      const input = evaluate(
        `(()=>{const i=document.querySelector('textarea[data-hwpjs-document-input]');return {focused:document.activeElement===i,disabled:i.disabled,readOnly:i.readOnly,busy:i.getAttribute('aria-busy')};})()`,
      );
      let typing = {
        attempted: false,
        reason: 'Document textarea not writable after trusted cell click',
        input,
      };
      if (input.focused && !input.disabled && !input.readOnly && input.busy !== 'true') {
        const trace = evaluate(traceExpression);
        // One actual key through the focused textarea; no fill, splice, dispatchEvent or private API.
        run('press', 'x');
        changedSince(trace);
        const typed = save(label + '-typed', format, dims);
        const texts = textMatrix(typed.archive);
        assert.equal(
          texts.filter((cell) => cell.text === 'x').length,
          1,
          'ActualKeyboardInputMustReachSavedSourceCell',
        );
        assert(texts.every((cell) => cell.text === '' || cell.text === 'x'));
        history('undo');
        const untyped = save(label + '-typing-undo', format, dims);
        assert(
          textMatrix(untyped.archive).every((cell) => cell.text === ''),
          'TypingUndoMustRestoreSourceMatrix',
        );
        typing = {
          attempted: true,
          keyboard: 'press x',
          typed: typed.file,
          undo: untyped.file,
          passed: true,
        };
      }
      stage = `${label}:final-reopen`;
      const final = save(label + '-final', format, dims);
      reopen(final.file);
      sourceAdmission(label + '-final-reopened', dims);
      closeMenu(gridMenu);
      const resaved = save(label + '-final-reopened-resave', format, dims);
      assert.deepEqual(textMatrix(resaved.archive), textMatrix(final.archive));
      run('screenshot', join(output, label + '-final.png'));
      const errors = run('errors').trim();
      writeFileSync(join(output, label + '-errors.txt'), errors);
      assert.equal(errors, '', errors);
      results.push({
        framework,
        format,
        sourceSeed: seed.file,
        checkpoints,
        typing,
        finalFile: final.file,
        reopenedResave: resaved.file,
        reopened: true,
        sourceAdmission: 'Native-gated shared-menu UI',
        passed: true,
      });
      json('results.json', results);
    }
  }
} catch (error) {
  failure = error;
  json('failure.json', { stage, error: String(error), stack: error.stack });
  if (owned) {
    for (const [name, args] of [
      [null, ['screenshot', join(output, 'failure.png')]],
      ['failure-dom.txt', ['snapshot']],
      ['failure-errors.txt', ['errors']],
      ['failure-html.txt', ['get', 'html', 'body']],
    ]) {
      try {
        const result = run(...args);
        if (name) writeFileSync(join(output, name), result);
      } catch (captureError) {
        json(`capture-error-${args[0]}.json`, { error: String(captureError) });
      }
    }
  }
} finally {
  let verifiedInactive = false,
    cleanupError;
  if (owned) {
    try {
      await closeOwnedBrowser(async (...args) => {
        const reply = JSON.parse(cli(['--session', session, '--json', ...args]));
        assert.equal(reply.success, true, JSON.stringify(reply));
        return reply.data;
      });
      verifiedInactive = true;
    } catch (error) {
      cleanupError = String(error);
      failure ??= error;
    }
  }
  json('cleanup.json', {
    session,
    owned,
    closeRequested: owned,
    verifiedInactive,
    serverOwned: false,
    cleanupError: cleanupError ?? null,
  });
  json('summary.json', {
    status: failure ? 'failed' : 'passed',
    cases: results.length,
    expectedCases: 6,
    output,
    stage,
    verifiedInactive,
    sourceOnlyPreparation: false,
  });
}
if (failure) throw failure;
console.log(
  JSON.stringify({ status: 'passed', cases: results.length, output, verifiedInactive: true }),
);
