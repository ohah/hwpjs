// PREPARATION ONLY until MAIN authorizes a fresh static bundle origin + Native SHA.
// No server/build/fixture producer. Task D supplies independent archives and oracle.
// OPTIONAL strict oversize regression, after the unchanged six fitting cases:
// HWPJS_SOURCE_GRID_OVERSIZE_BROWSER_CASES=1
// HWPJS_TEST_OVERSIZE_HWP5=<approved browser-r4/vanilla-hwp5-insert-column-applied.hwp>
// HWPJS_TEST_OVERSIZE_HWP5_SHA256=f7ee823fd6bec74a9e30556952b1e157bb403167969d10c0a15016182452f09d
// Output MUST be control/zig-out/verification/oversize-table-flow-r1/task-e/browser-r1.
// MAIN must provide a NEW authorized origin, bundle manifest SHA and Native SHA.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { closeOwnedBrowser } from './browser/session-close.mjs';
import { inspectBrowserCli } from './browser/bounded-cli-runner.mjs';
import { paintedSourceCellGeometryExpression } from './browser/source-table-grid-geometry.mjs';

const suffix = '/zig-out/verification/document-transforms-connect-r1/source';
const here = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const control = here.endsWith(suffix) ? here.slice(0, -suffix.length) : here;
const candidate = control + suffix;
const evidence = join(control, 'zig-out/verification/source-grid-multipara-r1');
const inside = (base, path) => path === base || path.startsWith(base + sep);
const env = (key) => {
  assert(process.env[key], `RequiredEnvironment:${key}`);
  return process.env[key];
};
const sha = (key) => {
  const value = env(key);
  assert(/^[a-f0-9]{64}$/u.test(value), `InvalidSHA256:${key}`);
  return value;
};
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function safePath(value) {
  assert(typeof value === 'string' && isAbsolute(value), 'ExplicitAbsolutePathRequired');
  const parts = value.split(/[\\/]+/u);
  assert(!parts.includes('..'), 'ParentTraversalForbidden');
  assert(
    !parts.some((p) => /rhwp|reverse|hwpers|title-column-roundtrip\.test\.mjs/iu.test(p)),
    'ForbiddenPath',
  );
  const path = resolve(value);
  assert(inside(control, path), 'PathOutsideControlRoot');
  return path;
}
// All lexical guards and authorization checks precede filesystem/network/browser work.
assert.equal(
  env('HWPJS_SOURCE_GRID_MULTIPARA_BROWSER_AUTHORIZED'),
  '1',
  'MainLaunchAuthorizationRequired',
);
const root = safePath(env('HWPJS_TEST_SOURCE_ROOT'));
assert.equal(root, candidate, 'ControlledShippingSourceRequired');
assert.equal(resolve(process.cwd()), root, 'RunFromControlledSource');
const output = safePath(process.argv[3]);
const oversizeFlag = process.env.HWPJS_SOURCE_GRID_OVERSIZE_BROWSER_CASES;
assert(oversizeFlag === undefined || oversizeFlag === '1', 'InvalidOversizeAuditOptIn');
const oversizeEnabled = oversizeFlag === '1';
const oversizeOutput = join(
  control,
  'zig-out/verification/oversize-table-flow-r1/task-e/browser-r1',
);
if (oversizeEnabled) assert.equal(output, oversizeOutput, 'ExactFreshOversizeEvidencePathRequired');
else
  assert(inside(evidence, output) && output !== evidence, 'NewMultiparagraphEvidenceChildRequired');
let oversizePath, oversizeSha;
if (oversizeEnabled) {
  oversizePath = safePath(env('HWPJS_TEST_OVERSIZE_HWP5'));
  oversizeSha = sha('HWPJS_TEST_OVERSIZE_HWP5_SHA256');
  assert.equal(
    oversizePath,
    join(evidence, 'task-e/browser-r4/vanilla-hwp5-insert-column-applied.hwp'),
    'OnlyApprovedWideHwp5Source',
  );
  assert.equal(
    oversizeSha,
    'f7ee823fd6bec74a9e30556952b1e157bb403167969d10c0a15016182452f09d',
    'OnlyApprovedWideHwp5SHA',
  );
} else {
  assert(
    process.env.HWPJS_TEST_OVERSIZE_HWP5 === undefined &&
      process.env.HWPJS_TEST_OVERSIZE_HWP5_SHA256 === undefined,
    'OversizeInputsRequireExplicitOptIn',
  );
}
const oraclePath = safePath(env('HWPJS_TEST_MULTIPARA_ORACLE'));
const oracleSha = sha('HWPJS_TEST_MULTIPARA_ORACLE_SHA256');
assert.equal(
  oraclePath,
  join(root, 'tools/tests/source-table-grid-multiparagraph-oracle.mjs'),
  'TaskDOracleOnly',
);
const oracleRoot = safePath(env('HWPJS_TEST_ORACLE_ROOT'));
const cfbPath = safePath(join(oracleRoot, 'legacy/cfb.js'));
const cfbSha = sha('HWPJS_TEST_CFB_SHA256');
const fixturePaths = Object.fromEntries(
  ['hwp5', 'hwpx'].map((format) => [
    format,
    safePath(env(`HWPJS_TEST_MULTIPARA_${format.toUpperCase()}`)),
  ]),
);
const fixtureShas = Object.fromEntries(
  ['hwp5', 'hwpx'].map((format) => [
    format,
    sha(`HWPJS_TEST_MULTIPARA_${format.toUpperCase()}_SHA256`),
  ]),
);
const approvedSeedRoot = join(evidence, 'task-d/browser-fit-r2');
const approvedSeeds = {
  hwp5: [
    [
      'hwp5-observed-source.hwp',
      'eb5143eaf34e0b81034fa0878807e478b5f9e835194f1ec2166a7f11229f4c83',
    ],
  ],
  hwpx: [
    ['hwpx-plain-source.hwpx', '1930ddfa8e2f3e2539de6042db87f0b652a636d7d3f970c19af23e6488d8b4f6'],
  ],
};
for (const format of ['hwp5', 'hwpx'])
  assert(
    approvedSeeds[format].some(
      ([name, hash]) =>
        fixturePaths[format] === join(approvedSeedRoot, name) && fixtureShas[format] === hash,
    ),
    'OnlyPageFittingTaskDSeedCohortApproved',
  );
for (const path of [
  root,
  oraclePath,
  cfbPath,
  ...Object.values(fixturePaths),
  ...(oversizeEnabled ? [oversizePath] : []),
])
  assert(!inside(output, path), 'OutputContainsInput');
const origin = new URL(process.argv[2]);
assert.equal(origin.protocol, 'http:');
assert(
  ['127.0.0.1', 'localhost'].includes(origin.hostname) && origin.port,
  'ExplicitLoopbackPortRequired',
);
assert(!origin.username && !origin.password && origin.href === origin.origin + '/', 'OriginOnly');
assert.equal(env('HWPJS_TEST_FRESH_ORIGIN'), origin.origin, 'FreshMainServerAttestationRequired');
const nativeSha = sha('HWPJS_TEST_WASM_SHA256');
assert.notEqual(
  nativeSha,
  '28d2f91917e81d0522ffe04d6ddff150aee2ad815a9ed1ed6d470af905aaacca',
  'OldPublicNativeForbiddenForMultiparagraphAudit',
);
if (oversizeEnabled)
  assert.notEqual(
    nativeSha,
    '202fc55283b670ea7c695ef3a326a0e6b8c86af3def7232c8e5bfab003699389',
    'NewOversizeAndHistoryBoundNativeRequired',
  );
const manifestSha = sha('HWPJS_TEST_BUNDLE_MANIFEST_SHA256');
function noSymlinks(path, newLeaf = false) {
  let current = control;
  assert(!lstatSync(current).isSymbolicLink(), 'SymlinkControlRoot');
  const parts = relative(control, path).split(sep).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]);
    try {
      assert(!lstatSync(current).isSymbolicLink(), 'SymlinkInputOrOutput');
      if (newLeaf && i === parts.length - 1) assert.fail('EvidenceAlreadyExists');
    } catch (error) {
      if (newLeaf && i === parts.length - 1 && error.code === 'ENOENT') return;
      throw error;
    }
  }
}
noSymlinks(root);
noSymlinks(output, true);
noSymlinks(oraclePath);
assert.equal(digest(readFileSync(oraclePath)), oracleSha, 'TaskDOracleSHAMismatch');
noSymlinks(cfbPath);
const cfbSource = readFileSync(cfbPath);
assert.equal(digest(cfbSource), cfbSha, 'IndependentCFBSHAMismatch');
const context = {
  module: { exports: {} },
  require: createRequire(import.meta.url),
  Buffer,
  process,
};
runInNewContext(cfbSource.toString('utf8'), context, { timeout: 10000 });
const CFB = context.module.exports;
const seedBytes = {};
for (const format of ['hwp5', 'hwpx']) {
  noSymlinks(fixturePaths[format]);
  seedBytes[format] = readFileSync(fixturePaths[format]);
  assert.equal(digest(seedBytes[format]), fixtureShas[format], 'TaskDFixtureSHAMismatch');
}
let oversizeBytes;
if (oversizeEnabled) {
  noSymlinks(oversizePath);
  oversizeBytes = readFileSync(oversizePath);
  assert.equal(digest(oversizeBytes), oversizeSha, 'ApprovedWideSourceSHAMismatch');
}
// This oracle must read archives independently; never the candidate Native reader.
const oracle = await import(pathToFileURL(oraclePath).href);
assert.equal(oracle.readNative, false, 'IndependentOracleMustDeclareReadNativeFalse');
const { h5Inspect, hxInspect, assertGridTransition, assertArchiveEqual, assertTypingTransition } =
  oracle;
for (const fn of [
  h5Inspect,
  hxInspect,
  assertGridTransition,
  assertArchiveEqual,
  assertTypingTransition,
])
  assert.equal(typeof fn, 'function', 'TaskDOracleContractRequired');
const inspectMultiparagraphArchive = (bytes, format) =>
  format === 'hwp5' ? h5Inspect(CFB, bytes) : hxInspect(bytes);
const seeds = Object.fromEntries(
  ['hwp5', 'hwpx'].map((format) => [
    format,
    inspectMultiparagraphArchive(seedBytes[format], format),
  ]),
);
const oversizeArchive = oversizeEnabled
  ? inspectMultiparagraphArchive(oversizeBytes, 'hwp5')
  : null;
const browserCli = inspectBrowserCli();
assert.equal(browserCli.mode, 'native-direct', 'BoundedNativeBrowserCLIRequired');
mkdirSync(output);
const json = (name, value) =>
  writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n');
const commands = [],
  observations = [],
  results = [],
  oversizeResults = [];
let stage = 'fresh-bundle',
  session,
  owned = false,
  failure,
  verifiedInactive = false;
function cli(args) {
  const record = { stage, args, started: new Date().toISOString() };
  commands.push(record);
  try {
    return (record.stdout = execFileSync(browserCli.executable.path, args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 45000,
      killSignal: 'SIGKILL',
      maxBuffer: 16 * 1024 * 1024,
    }));
  } catch (error) {
    Object.assign(record, {
      error: String(error),
      stdout: String(error.stdout ?? ''),
      stderr: String(error.stderr ?? ''),
    });
    throw error;
  } finally {
    json('commands.json', commands);
  }
}
const run = (...args) => cli(['--session', session, ...args]);
const evaluate = (expr) => JSON.parse(run('eval', expr));
const wait = (expr) => run('wait', '--fn', expr);
const inputSelector = 'textarea[data-hwpjs-document-input]';
const openedStatus = '문서를 열었습니다.';
const status = `document.querySelector('.hwp-demo-statusbar output')?.textContent`;
const trace = `Array.from(document.querySelectorAll('.hwp-demo-trace li')).filter(e=>e.querySelector('strong')?.textContent==='state').at(-1)?.textContent`;
const settled = `(()=>{const c=document.querySelector('canvas'),i=document.querySelector('${inputSelector}');return c?.dataset.paintPending==='false'&&c.dataset.selectionAuthority==='current'&&c.dataset.composing!=='true'&&i&&i.getAttribute('aria-busy')!=='true';})()`;
const settle = () => wait(settled);
function changed(before) {
  wait(`${trace}!==${JSON.stringify(before)}&&${settled}`);
}
const gridMenu = '.hwp-demo-menus > details:nth-child(7)';
const fileMenu = '.hwp-demo-menus > details:first-child';
function menu(selector, open) {
  if (evaluate(`document.querySelector(${JSON.stringify(selector)})?.open`) !== open)
    run('click', selector + ' > summary');
}
function witness(label) {
  const value = evaluate(
    `(()=>{const c=document.querySelector('canvas'),i=document.querySelector('${inputSelector}');return {status:${status},trace:${trace},canvas:{...c.dataset},text:i.value,selectionStart:i.selectionStart,selectionEnd:i.selectionEnd,focused:document.activeElement===i,disabled:i.disabled,readOnly:i.readOnly,busy:i.getAttribute('aria-busy')};})()`,
  );
  assert.equal(value.canvas.selectionAuthority, 'current', 'HistoryAuthorityMustBeCurrent');
  assert.equal(value.canvas.paintPending, 'false');
  assert.notEqual(value.canvas.composing, 'true');
  assert.notEqual(value.busy, 'true');
  assert.equal(value.canvas.pageLayoutMode, 'measured-body', 'FittingSeedMustUseMeasuredLayout');
  assert.equal(value.canvas.pageLayoutError, '', 'FittingSeedMustHaveNoLayoutError');
  observations.push({ stage, label, ...value });
  json('observations.json', observations);
  return value;
}
function firstSecond(archive) {
  const table = archive.tables[0];
  assert.equal(archive.tables.length, 1);
  const cell = table.cells.find((c) => c.row === 0 && c.column === 0);
  assert(cell?.paragraphs.length >= 2, 'SurvivingFirstCellMustHaveSecondParagraph');
  const paragraph = cell.paragraphs[1];
  assert(
    paragraph.text.length > 0 && !paragraph.text.includes('\n'),
    'DistinctSingleLineSecondParagraphRequired',
  );
  assert.equal(
    table.cells.flatMap((c) => c.paragraphs).filter((p) => p.text === paragraph.text).length,
    1,
    'SecondParagraphTextMustUniquelyWitnessSource',
  );
  return { table, paragraph };
}
function guides(label) {
  settle();
  // Public view-only 100% zoom retains unscaled painted guide pixels.
  // Full row/cell visibility is checked below before any trusted selection.
  const zoomSelector = '.hwp-demo-statusbar select[data-command="set-zoom"]';
  const zoomBefore = evaluate(
    `(()=>{const nodes=document.querySelectorAll('${zoomSelector}');return {count:nodes.length,value:nodes[0]?.value,disabled:nodes[0]?.disabled};})()`,
  );
  assert.equal(zoomBefore.count, 1, 'ExistingPublicZoomRequired');
  assert.equal(zoomBefore.disabled, false, 'PublicZoomMustBeAvailable');
  if (zoomBefore.value !== '100') run('select', zoomSelector, '100');
  wait(`document.querySelector('${zoomSelector}')?.value==='100'&&${settled}`);
  json(label + '-view-zoom.json', { before: zoomBefore, percent: 100, viewOnly: true });
  const button = 'button.hwp-demo-tool[data-command="toggle-grid"]';
  const before = evaluate(
    `(()=>{const b=document.querySelectorAll('${button}');return {count:b.length,disabled:b[0]?.disabled,pressed:b[0]?.getAttribute('aria-pressed'),paint:document.querySelector('canvas')?.dataset.showTableGrid};})()`,
  );
  assert.equal(before.count, 1);
  assert.equal(before.disabled, false);
  assert(['true', 'false'].includes(before.pressed));
  assert.equal(before.pressed, before.paint);
  if (before.pressed === 'false') run('click', button);
  wait(
    `document.querySelector('${button}')?.getAttribute('aria-pressed')==='true'&&document.querySelector('canvas')?.dataset.showTableGrid==='true'&&${settled}`,
  );
  json(label + '-grid-view.json', { before, viewOnly: true });
}
function selectSecond(label, archive) {
  menu(fileMenu, false);
  menu(gridMenu, false);
  guides(label);
  const { table, paragraph } = firstSecond(archive);
  run('screenshot', join(output, label + '-before-select.png'));
  const geometry = evaluate(
    paintedSourceCellGeometryExpression(table.columns, { maxRowCssHeight: null }),
  );
  json(label + '-geometry.json', geometry);
  assert(
    geometry.first,
    'PaintedGeometryMissingOrClipped: review screenshot, never fabricate selection',
  );
  const { rect, width, height, first } = geometry;
  const left = rect.x + (first.bands[0].end * rect.width) / width;
  const right = rect.x + (first.bands[1].start * rect.width) / width;
  const top = rect.y + (first.top.y * rect.height) / height;
  const bottom = rect.y + (first.bottom.y * rect.height) / height;
  const x = Math.round(left + Math.min(16, (right - left) / 4));
  // Bounded search INSIDE measured first cell. Only public textarea text/caret can
  // accept a hit. No private layout, Core call, forged event or selection mutation.
  assert(
    bottom - top >= 35 && top >= rect.top && bottom <= rect.bottom,
    'CompletePaintedRowMustFitCanvas',
  );
  const viewport = evaluate('({width:innerWidth,height:innerHeight})');
  assert(
    left >= 0 && right <= viewport.width && top >= 0 && bottom <= viewport.height,
    'CompleteFirstCellMustFitVisibleViewport',
  );
  let selected;
  for (let y = Math.ceil(top + 5), count = 0; y < bottom - 5 && count < 40; y += 3, count++) {
    const hit = evaluate(
      `(()=>{const c=document.querySelector('canvas');return {visible:${x}>=0&&${y}>=0&&${x}<innerWidth&&${y}<innerHeight,canvas:document.elementFromPoint(${x},${y})===c};})()`,
    );
    assert(hit.visible && hit.canvas, 'MeasuredPointMustHitVisibleCanvas');
    run('mouse', 'move', String(x), String(y));
    run('mouse', 'down');
    run('mouse', 'up');
    settle();
    const value = witness(label + '-hit-' + count);
    if (
      value.focused &&
      !value.disabled &&
      !value.readOnly &&
      value.text === paragraph.text &&
      /^\d+:\d+:\d+$/u.test(value.canvas.caret ?? '')
    ) {
      selected = value;
      break;
    }
  }
  assert(selected, 'TrustedCanvasMustSelectSecondSourceParagraph');
  run('press', 'Home');
  settle();
  const atStart = witness(label + '-second-start');
  assert.equal(atStart.text, paragraph.text);
  assert.equal(atStart.canvas.caret, selected.canvas.caret.replace(/:\d+$/u, ':0'));
  assert.equal(atStart.canvas.selection, '0:0', 'CollapsedSecondParagraphCaretRequired');
  assert(atStart.focused && !atStart.disabled && !atStart.readOnly);
  json(label + '-second-paragraph.json', {
    text: paragraph.text,
    caret: atStart.canvas.caret,
    geometry,
    publicWitnessOnly: true,
  });
  return atStart;
}
function admission(label, archive) {
  const selected = selectSecond(label, archive);
  menu(gridMenu, true);
  const buttons = evaluate(
    `Array.from(document.querySelectorAll('${gridMenu} button[data-command^="generated-table-"]')).map(b=>({command:b.dataset.command,disabled:b.disabled,title:b.title}))`,
  );
  assert.equal(buttons.length, 4);
  const table = archive.tables[0];
  assert.deepEqual(
    buttons.map((b) => b.command).sort(),
    ['insert-row', 'insert-column', 'delete-row', 'delete-column']
      .map((a) => 'generated-table-' + a)
      .sort(),
  );
  for (const b of buttons) {
    const disabled =
      (b.command === 'generated-table-delete-row' && table.rows === 1) ||
      (b.command === 'generated-table-delete-column' && table.columns === 1);
    assert.equal(b.disabled, disabled, JSON.stringify(b));
  }
  json(label + '-admission.json', {
    selected,
    buttons,
    source: 'external Task D archive, Native-gated existing menu',
  });
}
function reopen(file) {
  const before = evaluate(trace);
  run('upload', 'input[data-role="file-picker"]', file);
  wait(
    `document.querySelector('.hwp-demo-titlebar h1,h1')?.textContent===${JSON.stringify(file.split(sep).at(-1))}&&${status}?.includes(${JSON.stringify(openedStatus)})`,
  );
  changed(before);
}
function save(label, format) {
  settle();
  menu(fileMenu, true);
  if (format === 'hwp5') run('check', 'input[data-role="allow-stale-layout"]');
  const file = join(output, label + (format === 'hwp5' ? '.hwp' : '.hwpx'));
  run('download', 'nav.hwp-demo-menus button[data-command="save"]', file);
  menu(fileMenu, false);
  noSymlinks(file);
  const bytes = readFileSync(file),
    archive = inspectMultiparagraphArchive(bytes, format);
  json(label + '-oracle.json', { file, sha256: digest(bytes), archive, readNative: false });
  return { file, archive };
}
function history(kind) {
  settle();
  const selector = `button.hwp-demo-format-tool[data-command="${kind}"]`;
  assert.equal(evaluate(`document.querySelector(${JSON.stringify(selector)})?.disabled`), false);
  const before = evaluate(trace);
  run('click', selector);
  changed(before);
  wait(`${status}?.startsWith('실행 취소/다시 실행 적용 ·')&&${settled}`);
  witness('history-' + kind);
}
// This separate regression expects a rejected physical layout, not an editable
// selection. Never relax witness()/second-paragraph/authority guards for the six cases.
function strictOversizeCase(framework) {
  const label = `${framework}-oversize-hwp5`;
  const startedAt = new Date().toISOString(),
    start = performance.now();
  stage = label + ':open';
  run('open', new URL(`/demo/${framework}/`, origin).href);
  wait(`!!document.querySelector('input[data-role="file-picker"]')`);
  reopen(oversizePath);
  const value = evaluate(
    `(()=>{const c=document.querySelector('canvas'),i=document.querySelector('${inputSelector}');return {status:${status},trace:${trace},canvas:{...c.dataset},rect:c.getBoundingClientRect().toJSON(),input:{readOnly:i.readOnly,disabled:i.disabled,busy:i.getAttribute('aria-busy')}};})()`,
  );
  json(label + '-public-dom.json', value);
  assert.equal(value.status, openedStatus, 'OversizeSourceMustLoad');
  assert.equal(
    value.canvas.pageLayoutError,
    'InlineTablePaperOverflow',
    'SpecificBoundedPaperOverflowRequired',
  );
  assert.equal(
    value.canvas.pageLayoutMode,
    'logical-fallback',
    'OversizePhysicalLayoutMustBeRejected',
  );
  assert.equal(value.canvas.selectionAuthority, 'current', 'OversizeAuthorityMustBeCurrent');
  assert.equal(value.canvas.paintPending, 'false');
  assert.equal(value.canvas.composing, 'false');
  assert.equal(value.input.readOnly, true, 'OversizeInputMustRemainReadOnly');
  assert.notEqual(value.input.busy, 'true');
  run('screenshot', join(output, label + '.png'));
  writeFileSync(join(output, label + '-dom.txt'), run('snapshot'));
  // Public save only: no shrink, text/grid mutation, selection injection or private reader.
  stage = label + ':unchanged-save';
  const saved = save(label + '-unchanged', 'hwp5');
  const savedBytes = readFileSync(saved.file);
  assertArchiveEqual(oversizeBytes, savedBytes, { format: 'hwp5' });
  assertArchiveEqual(oversizeArchive, saved.archive, { format: 'hwp5' });
  assert.equal(
    digest(readFileSync(oversizePath)),
    oversizeSha,
    'ApprovedSourceFileMustRemainUnchanged',
  );
  const errors = run('errors').trim();
  writeFileSync(join(output, label + '-errors.txt'), errors);
  assert.equal(errors, '', errors);
  oversizeResults.push({
    framework,
    format: 'hwp5',
    source: oversizePath,
    sourceSha256: oversizeSha,
    saved: saved.file,
    savedSha256: digest(savedBytes),
    sourceBytesUnchanged: true,
    startedAt,
    elapsedMs: performance.now() - start,
    expectedError: 'InlineTablePaperOverflow',
    expectedLayout: 'logical-fallback',
    physicalRenderSupported: false,
    readNative: false,
    passed: true,
  });
  json('oversize-results.json', oversizeResults);
}
async function remote(path, expected) {
  const response = await fetch(new URL(path, origin), {
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200, 'FreshBundleAssetUnavailable');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(digest(bytes), expected, 'MainApprovedBundleSHAMismatch');
  return bytes;
}
try {
  const manifest = JSON.parse(await remote('/hwpjs/editor/manifest.json', manifestSha));
  assert.equal(manifest.wasmSha256, nativeSha);
  assert.equal(
    manifest.files.filter((f) => f.path === 'hwpjs/hwpjs.wasm' && f.sha256 === nativeSha).length,
    1,
  );
  await remote('/hwpjs/hwpjs.wasm', nativeSha);
  json('config.json', {
    root,
    origin: origin.origin,
    nativeSha,
    manifestSha,
    oraclePath,
    oracleSha,
    oracleRoot,
    cfbSha,
    fixturePaths,
    fixtureShas,
    oversize: oversizeEnabled
      ? { path: oversizePath, sha256: oversizeSha, expectedCases: 3 }
      : null,
    browserCli,
    readNative: false,
  });
  session = cli([
    'session',
    'id',
    '--scope',
    'worktree',
    '--prefix',
    'hwp-mp-' + randomUUID(),
  ]).trim();
  assert(/^[\w.-]+$/u.test(session));
  const info = JSON.parse(cli(['--session', session, '--json', 'session', 'info']));
  assert.equal(info.success, true);
  assert.equal(info.data.active, false, 'NeverTakeOverExistingBrowser');
  owned = true;
  for (const framework of ['vanilla', 'react', 'svelte'])
    for (const format of ['hwp5', 'hwpx']) {
      const caseStartedAt = new Date().toISOString();
      const caseStart = performance.now();
      const label = `${framework}-${format}`,
        checkpoints = [],
        seed = seeds[format];
      stage = label + ':open';
      run('open', new URL(`/demo/${framework}/`, origin).href);
      wait(`!!document.querySelector('input[data-role="file-picker"]')`);
      for (const action of ['insert-row', 'insert-column', 'delete-row', 'delete-column']) {
        const prefix = `${label}-${action}`;
        stage = prefix + ':external-source';
        reopen(fixturePaths[format]);
        admission(prefix, seed);
        stage = prefix + ':apply';
        const before = evaluate(trace);
        run('click', `${gridMenu} button[data-command="generated-table-${action}"]`);
        changed(before);
        wait(`${status}==='표의 행·열을 변경했습니다. 셀을 다시 선택하세요.'&&${settled}`);
        menu(gridMenu, false);
        const applied = save(prefix + '-applied', format);
        assertGridTransition(seed, applied.archive, {
          format,
          action,
          index: action.startsWith('insert') ? 1 : 0,
        });
        stage = prefix + ':undo';
        history('undo');
        const undone = save(prefix + '-undo', format);
        assertArchiveEqual(seed, undone.archive, { format });
        stage = prefix + ':redo';
        history('redo');
        const redone = save(prefix + '-redo', format);
        assertArchiveEqual(applied.archive, redone.archive, { format });
        stage = prefix + ':typing-after-history';
        selectSecond(prefix + '-typing', redone.archive);
        const typingTrace = evaluate(trace);
        run('press', 'x');
        changed(typingTrace);
        const typed = save(prefix + '-typed', format);
        assertTypingTransition(redone.archive, typed.archive, {
          format,
          row: 0,
          column: 0,
          paragraph: 1,
          unit: 0,
          text: 'x',
        });
        history('undo');
        const typingUndo = save(prefix + '-typing-undo', format);
        assertArchiveEqual(redone.archive, typingUndo.archive, { format });
        history('redo');
        const typingRedo = save(prefix + '-typing-redo', format);
        assertArchiveEqual(typed.archive, typingRedo.archive, { format });
        stage = prefix + ':reopen-resave';
        reopen(typingRedo.file);
        admission(prefix + '-reopened', typingRedo.archive);
        menu(gridMenu, false);
        const resaved = save(prefix + '-reopened-resave', format);
        assertArchiveEqual(typingRedo.archive, resaved.archive, { format });
        run('screenshot', join(output, prefix + '-final.png'));
        checkpoints.push({
          action,
          applied: applied.file,
          undo: undone.file,
          redo: redone.file,
          typed: typed.file,
          typingUndo: typingUndo.file,
          typingRedo: typingRedo.file,
          resaved: resaved.file,
        });
        json(label + '-checkpoints.json', checkpoints);
      }
      const errors = run('errors').trim();
      writeFileSync(join(output, label + '-errors.txt'), errors);
      assert.equal(errors, '', errors);
      results.push({
        framework,
        format,
        sourceSeed: fixturePaths[format],
        startedAt: caseStartedAt,
        elapsedMs: performance.now() - caseStart,
        checkpoints,
        readNative: false,
        passed: true,
      });
      json('results.json', results);
    }
  assert.equal(results.length, 6);
  if (oversizeEnabled) {
    for (const framework of ['vanilla', 'react', 'svelte']) strictOversizeCase(framework);
    assert.equal(oversizeResults.length, 3);
  }
} catch (error) {
  failure = error;
  json('failure.json', { stage, error: String(error), stack: error.stack });
  if (owned)
    for (const [name, args] of [
      ['failure-dom.txt', ['snapshot']],
      ['failure-errors.txt', ['errors']],
      [
        'failure-public-dom.json',
        [
          'eval',
          `(()=>{const c=document.querySelector('canvas'),i=document.querySelector('${inputSelector}');return {title:document.querySelector('.hwp-demo-titlebar h1')?.textContent,status:${status},canvas:c?{...c.dataset}:null,rect:c?.getBoundingClientRect().toJSON(),input:i?{value:i.value,disabled:i.disabled,readOnly:i.readOnly,busy:i.getAttribute('aria-busy')}:null,trace:${trace}};})()`,
        ],
      ],
      [null, ['screenshot', join(output, 'failure.png')]],
    ]) {
      try {
        const value = run(...args);
        if (name) writeFileSync(join(output, name), value);
      } catch (captureError) {
        json(`capture-${args[0]}.json`, { error: String(captureError) });
      }
    }
} finally {
  let cleanupError;
  if (owned)
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
    stage,
    cases: results.length,
    expectedCases: 6,
    oversizeCases: oversizeResults.length,
    expectedOversizeCases: oversizeEnabled ? 3 : 0,
    actionsPerCase: 4,
    verifiedInactive,
    output,
    readNative: false,
    actualBrowserRun: owned,
  });
}
if (failure) throw failure;
console.log(
  JSON.stringify({
    status: 'passed',
    cases: results.length,
    oversizeCases: oversizeResults.length,
    output,
    verifiedInactive,
  }),
);
