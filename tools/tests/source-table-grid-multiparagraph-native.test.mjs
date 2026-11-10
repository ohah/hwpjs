// Task D: actual SDK/file integration only. Explicit pins; never build or skip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, lstatSync, existsSync } from 'node:fs';
import { resolve, join, dirname, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import {
  sha,
  h5Inspect,
  h5Seed,
  hxInspect,
  hxSeed,
  assertGridTransition,
  assertTypingTransition,
  assertArchiveEqual,
} from './source-table-grid-multiparagraph-oracle.mjs';

const ROOT = '/Users/yoonhb/Documents/workspace/hwpjs';
const CONTROL = join(ROOT, 'zig-out/verification/document-transforms-connect-r1/source');
const EVIDENCE = join(ROOT, 'zig-out/verification/source-grid-multipara-r1');
const BASE = join(ROOT, 'zig-out/verification/created-table-ui-r1/browser-public-r1');
const OLD = join(ROOT, 'zig-out/verification/source-table-live-r1/install-final/bin/hwpjs.wasm');
const PINS = Object.freeze({
  old: '28d2f91917e81d0522ffe04d6ddff150aee2ad815a9ed1ed6d470af905aaacca',
  cfb: 'd3162bbd248745eb17fd3ff9b3239e8a0f4480f466b55e4db79daecd8bf23479',
  hwp5: '833f4bbac266fe026a008f1f221b8443194a48c0874035eac4966438b55b9cca',
  hwpx: 'b5b74b76bb316a3bc4178b31b162a5919995a0a593546e56243ea15baa572289',
});
const mode = process.env.HWPJS_TEST_MULTIPARA_MODE ?? 'fresh';
assert(['prepare', 'old-refusal', 'baseline-red', 'fresh'].includes(mode));
const paths = {
  source: process.env.HWPJS_TEST_SOURCE_ROOT,
  evidence: process.env.HWPJS_TEST_EVIDENCE_DIR,
  old: process.env.HWPJS_TEST_OLD_WASM ?? OLD,
  cfb: join(ROOT, 'legacy/cfb.js'),
  hwp5: process.env.HWPJS_TEST_SOURCE_GRID_HWP5 ?? join(BASE, 'vanilla-hwp5.hwp'),
  hwpx: process.env.HWPJS_TEST_SOURCE_GRID_HWPX ?? join(BASE, 'vanilla-hwpx.hwpx'),
};
if (mode === 'fresh') paths.wasm = process.env.HWPJS_TEST_WASM;
// Complete lexical validation of all supplied paths before any fixture/source access.
function lexical(p) {
  assert(typeof p === 'string' && isAbsolute(p), 'ExplicitAbsolutePathRequired');
  assert(
    ![...p].some((ch) => ch.charCodeAt(0) < 32) &&
      !p.includes(String.fromCharCode(92)) &&
      !/hwpers|title-column-roundtrip|(?:^|\/)rhwp(?:\/|$)/iu.test(p),
    'ForbiddenPath',
  );
  assert.equal(resolve(p), p, 'CanonicalPathRequired');
  assert(!p.includes('//') && !p.endsWith('/'));
}
Object.values(paths).forEach(lexical);
assert.equal(paths.source, CONTROL, 'AuthoritativeShippingSourceRequired');
assert(paths.evidence.startsWith(EVIDENCE + '/') && !paths.evidence.startsWith(CONTROL + '/'));
assert.equal(paths.old, OLD);
assert.equal(paths.hwp5, join(BASE, 'vanilla-hwp5.hwp'));
assert.equal(paths.hwpx, join(BASE, 'vanilla-hwpx.hwpx'));
if (mode === 'fresh') {
  assert(
    /^[a-f0-9]{64}$/u.test(process.env.HWPJS_TEST_WASM_SHA256 ?? ''),
    'ExplicitFreshWasmSha256Required',
  );
  assert.notEqual(paths.wasm, OLD, 'FreshWasmPathRequired');
  assert.notEqual(
    process.env.HWPJS_TEST_WASM_SHA256,
    PINS.old,
    'FreshWasmMustDifferFromNative28d2',
  );
}
// Walk components using lstat only: reject aliases BEFORE following their targets.
function guard(p) {
  lexical(p);
  let at = sep;
  for (const part of p.split(sep).filter(Boolean)) {
    at = join(at, part);
    assert(!lstatSync(at).isSymbolicLink(), `SymlinkAliasDenied:${at}`);
  }
  return p;
}
Object.entries(paths)
  .filter(([k]) => k !== 'evidence')
  .forEach(([, p]) => guard(p));
guard(dirname(paths.evidence));
assert(!existsSync(paths.evidence), 'FreshEvidenceDirectoryRequired');
function pinned(p, pin) {
  guard(p);
  assert(lstatSync(p).isFile());
  const b = readFileSync(p);
  assert.equal(sha(b), pin, `InputHashMismatch:${p}`);
  return b;
}
const oldBytes = pinned(paths.old, PINS.old);
const cfbSource = pinned(paths.cfb, PINS.cfb);
const baselines = { hwp5: pinned(paths.hwp5, PINS.hwp5), hwpx: pinned(paths.hwpx, PINS.hwpx) };
const candidateBytes =
  mode === 'fresh' ? pinned(paths.wasm, process.env.HWPJS_TEST_WASM_SHA256) : oldBytes;
mkdirSync(paths.evidence);
const persist = (name, b) => writeFileSync(join(paths.evidence, name), b, { flag: 'wx' });
const json = (name, v) => persist(name, JSON.stringify(v, null, 2) + '\n');
const context = {
  module: { exports: {} },
  require: createRequire(import.meta.url),
  Buffer,
  process,
};
runInNewContext(cfbSource.toString(), context, { filename: paths.cfb, timeout: 10000 });
const CFB = context.module.exports;
const inspect = (b, f) => (f === 'hwp5' ? h5Inspect(CFB, b) : hxInspect(b));
const seeds = [];
for (const [format, variant] of [
  ['hwp5', 'observed'],
  ['hwp5', 'zero'],
  ['hwp5', 'empty'],
  ['hwpx', 'plain'],
]) {
  const bytes =
    format === 'hwp5' ? h5Seed(CFB, baselines[format], variant) : hxSeed(baselines[format]);
  const view = inspect(bytes, format),
    targetIndex = view.tables.findIndex((t) => t.cells.every((c) => c.paragraphs.length === 3));
  assert(targetIndex >= 0, 'IndependentThreeParagraphSourceSeed');
  const table = view.tables[targetIndex];
  assert.equal(table.height, table.rows * 7200);
  const unique = new Set(view.ids);
  assert.equal(unique.size, view.ids.length, 'SeedIdsUnique');
  for (const c of table.cells) {
    assert.equal(c.height, 7200);
    assert.deepEqual(
      c.paragraphs.map((p) => p.text),
      [0, 1, 2].map((p) =>
        variant === 'empty' && p < 2 ? '' : `R${c.row}C${c.column} P${p} 한글`,
      ),
    );
    if (format === 'hwp5')
      assert.deepEqual(
        c.paragraphs.map((p) => p.highBit),
        variant !== 'zero' ? [0, 0, 1] : [0, 0, 0],
      );
    if (variant === 'empty')
      for (const p of c.paragraphs.slice(0, 2)) {
        assert.equal(Buffer.from(p.raw[0][2], 'hex').readUInt32LE(0) & 0x7fffffff, 0);
        assert(
          p.raw.every((r) => r[0] !== 67),
          'EmptySourceParagraphHasNoTextRecord',
        );
      }
  }
  const label = `${format}-${variant}`,
    ext = format === 'hwp5' ? 'hwp' : 'hwpx',
    file = `${label}-source.${ext}`;
  persist(file, bytes);
  json(`${label}-source.oracle.json`, view);
  seeds.push({
    format,
    variant,
    label,
    ext,
    bytes,
    view,
    targetIndex,
    path: join(paths.evidence, file),
    sha256: sha(bytes),
  });
}
json(
  'seeds.json',
  seeds.map(({ bytes: _bytes, view, ...s }) => ({
    ...s,
    paragraphs: view.tables[s.targetIndex].cells.map((c) => ({
      row: c.row,
      column: c.column,
      paragraphs: c.paragraphs,
    })),
  })),
);
json('inputs.json', {
  mode,
  paths,
  pins: PINS,
  wasmSha256: sha(candidateBytes),
  baselinePinProvenance: 'source-table-live-r1/af-native-final-node24/inputs.json',
  seedMethod:
    'independent CFB record and Python ZIP/XML patch; 3 plain paragraphs/cell; 7200 units/cell; table height = rows*7200',
  highBitPolicy: 'opaque; supplied observed/zero patterns; never official last-flag semantics',
  scope: 'SDK actual files only; no browser proof, no total engine completion',
});
test('independent paragraph oracle rejects raw/style/ID/order loss and extra blank paragraphs', () => {
  for (const seed of seeds) {
    const before = seed.view,
      after = structuredClone(before),
      t = after.tables[seed.targetIndex];
    t.rows--;
    t.cells = t.cells.filter((c) => c.row === 0);
    const deleted = new Set(
      before.tables[seed.targetIndex].cells
        .filter((c) => c.row === 1)
        .flatMap((c) => c.paragraphs.map((p) => p.id)),
    );
    after.ids = after.ids.filter((id) => !deleted.has(id));
    const options = {
      action: 'delete-row',
      index: 1,
      targetIndex: seed.targetIndex,
      format: seed.format,
    };
    assertGridTransition(before, after, options);
    for (const mutate of [
      (p) => p.pop(),
      (p) => p.reverse(),
      (p) => {
        p[1].id = '999';
      },
      (p) => {
        p[1].body = ['corrupt'];
      },
      (p) => {
        p[1].runs[0].id = '999';
      },
      (p) => {
        p[1].raw = ['corrupt'];
      },
      (p) => {
        p[1].highBit = 1;
      },
    ]) {
      const bad = structuredClone(after);
      mutate(bad.tables[seed.targetIndex].cells[0].paragraphs);
      assert.throws(() => assertGridTransition(before, bad, options));
    }
    assertArchiveEqual(before, structuredClone(before), { format: seed.format });
    const corrupt = structuredClone(before);
    corrupt.streams['fixture-only-part'] = 'bad';
    assert.throws(() => assertArchiveEqual(before, corrupt, { format: seed.format }));
  }
});
if (mode !== 'prepare') {
  const module = await WebAssembly.compile(candidateBytes);
  const load = (name) => import(pathToFileURL(guard(join(CONTROL, 'js', name))));
  const { createExperimentalHwp5Editor } = await load('hwp5-editor.mjs');
  const { createHwpxEditor } = await load('hwpx-editor.mjs');
  const open = async (f, bytes) => {
    if (f === 'hwp5') return createExperimentalHwp5Editor(module, bytes);
    const sdk = await createHwpxEditor(module);
    sdk.open(bytes);
    return sdk;
  };
  const save = (sdk, f) =>
    Buffer.from(f === 'hwp5' ? sdk.save({ allowStaleLayout: true }).bytes : sdk.save());
  const text = (sdk, f, p) =>
    (f === 'hwp5' ? sdk.text(0, p) : sdk.anchorText(0, p)).replace(/\r$/u, '');
  function current(sdk, seed) {
    const bindings = sdk.tableBindings(0),
      nodes = [...new Set(bindings.map((b) => b.tableNode))];
    const ordinal = seed.view.tables
      .slice(0, seed.targetIndex)
      .filter((t) => t.section === 0).length;
    const cells = bindings.filter((b) => b.tableNode === nodes[ordinal]);
    const first = cells.find((b) => b.row === 0 && b.column === 0);
    assert(first);
    // Multiple Native bindings per cell are allowed; select first paragraph in source order.
    return {
      section: 0,
      tableNode: first.tableNode,
      expectedRows: first.rows,
      expectedColumns: first.columns,
      paragraph: first.paragraph,
    };
  }
  const grid = (t, action, index, f) => ({
    section: 0,
    tableNode: t.tableNode,
    expectedRows: t.expectedRows,
    expectedColumns: t.expectedColumns,
    action,
    index,
    ...(f === 'hwp5' ? { layout: 'observed8' } : {}),
  });
  function type(sdk, f, t, value, at) {
    if (f === 'hwp5')
      sdk.splice({ section: 0, paragraph: t.paragraph, startUnit: at, endUnit: at, text: value });
    else sdk.spliceAnchored(0, t.paragraph, at, 0, value);
  }
  const reports = [];
  for (const seed of seeds)
    for (const history of ['v1', 'v2'])
      for (const action of ['insert-row', 'delete-row', 'insert-column', 'delete-column']) {
        test(
          `${mode}: ${seed.label} ${history} ${action} real SDK mixed history`,
          { timeout: 90000 },
          async () => {
            const { format: f, label, targetIndex } = seed,
              id = `${label}-${history}-${action}`,
              report = { id, status: 'started' };
            let sdk;
            const snapshots = [],
              views = [],
              input = Buffer.from(seed.bytes),
              inputAlias = input;
            function capture(stage) {
              assert.equal(input, inputAlias, 'SourceInputIdentityUnchanged');
              assert.equal(sha(input), seed.sha256, 'SourceInputBytesImmutable');
              const b = save(sdk, f),
                v = inspect(b, f);
              snapshots.push(b);
              views.push(v);
              persist(`${id}-${stage}.${seed.ext}`, b);
              json(`${id}-${stage}.oracle.json`, v);
              return v;
            }
            try {
              sdk = await open(f, input);
              assert.equal(sdk.supportsSourceTableGrid(), true);
              if (history === 'v1') sdk.enableHistory();
              else {
                assert(sdk.historyV2Available(), 'NativeV2Required');
                sdk.enableHistoryV2();
              }
              report.history = sdk.historyStats();
              assert.equal(
                report.history.negotiation,
                history === 'v1' ? 'explicit-v1' : 'explicit-v2',
              );
              const baseline = capture('0-open');
              assert.deepEqual(
                baseline.tables[targetIndex].cells.map((c) => c.paragraphs),
                seed.view.tables[targetIndex].cells.map((c) => c.paragraphs),
                'IndependentSeedSurvivesOpenSave',
              );
              let t = current(sdk, seed);
              const index = 1; // Middle insertion shifts surviving cells; deletion retains the typed first cell.
              if (mode === 'old-refusal') {
                const before = save(sdk, f),
                  revision = sdk.historyRevision(),
                  revisions = sdk.historyRevisions();
                assert.throws(() => sdk.editSourceTableGrid(grid(t, action, index, f)), {
                  message:
                    f === 'hwp5' ? 'UnsupportedSourceTableGrid' : 'UnsupportedSourceTableStructure',
                });
                assert.deepEqual(save(sdk, f), before);
                assert.equal(sdk.historyRevision(), revision);
                assert.deepEqual(sdk.historyRevisions(), revisions);
                report.strictOpenSave = true;
                report.refusal =
                  f === 'hwp5' ? 'UnsupportedSourceTableGrid' : 'UnsupportedSourceTableStructure';
                report.status = 'old-refusal-confirmed';
                return;
              }
              type(sdk, f, t, 'D한AB', 0);
              t = current(sdk, seed);
              capture('1-text');
              sdk.setCharacterProperties({
                section: 0,
                paragraph: t.paragraph,
                startUnit: 1,
                endUnit: 3,
                properties: { bold: true },
              });
              t = current(sdk, seed);
              const before = capture('2-bold'),
                bt = before.tables[targetIndex],
                p0 = bt.cells[0].paragraphs[0];
              assert(p0.units.slice(1, 3).every((u) => u.bold));
              const revisions = sdk.historyRevisions().length;
              sdk.editSourceTableGrid(grid(t, action, index, f));
              assert.equal(
                sdk.historyRevisions().length,
                revisions + 1,
                'OneManagedStructuralEntry',
              );
              t = current(sdk, seed);
              const after = capture('3-grid');
              assertGridTransition(before, after, { action, index, format: f, targetIndex });
              const suffix = '|Ditalic',
                start = text(sdk, f, t.paragraph).length;
              type(sdk, f, t, suffix, start);
              t = current(sdk, seed);
              const typed = capture('4-text');
              assertTypingTransition(after, typed, {
                format: f,
                targetIndex,
                row: 0,
                column: 0,
                paragraph: 0,
                unit: start,
                text: suffix,
              });
              sdk.setCharacterProperties({
                section: 0,
                paragraph: t.paragraph,
                startUnit: start,
                endUnit: start + suffix.length,
                properties: { italic: true },
              });
              report.finalHistory = sdk.historyStats();
              assert.equal(report.finalHistory.undoCount, 5, 'FiveManagedSdkEdits');
              const final = capture('5-italic'),
                fp = final.tables[targetIndex].cells[0].paragraphs[0];
              assert.equal(fp.text, p0.text + suffix);
              assert(fp.units.slice(start).every((u) => u.italic));
              assert.deepEqual(fp.units.slice(0, start), p0.units);
              for (let i = snapshots.length - 2; i >= 0; i--) {
                assert.equal(sdk.undo(), true);
                assert.deepEqual(save(sdk, f), snapshots[i], `ExactContainerUndo:${i}`);
                current(sdk, seed);
              }
              assert.equal(sdk.undo(), false);
              for (let i = 1; i < snapshots.length; i++) {
                assert.equal(sdk.redo(), true);
                assert.deepEqual(save(sdk, f), snapshots[i], `ExactContainerRedo:${i}`);
                current(sdk, seed);
              }
              assert.equal(sdk.redo(), false);
              sdk.close();
              sdk = await open(f, snapshots.at(-1));
              assert.deepEqual(
                inspect(save(sdk, f), f).tables.map((t) => t.cells.map((c) => c.paragraphs)),
                final.tables.map((t) => t.cells.map((c) => c.paragraphs)),
                'ReopenedAllParagraphs',
              );
              report.status = 'passed';
              report.snapshots = snapshots.map(sha);
            } catch (e) {
              report.status = 'failed';
              report.error = { message: e.message, stack: e.stack };
              throw e;
            } finally {
              sdk?.close();
              assert.equal(sha(inputAlias), seed.sha256);
              json(`${id}-result.json`, report);
              reports.push(report);
            }
          },
        );
      }
  test.after(() => {
    for (const f of ['hwp5', 'hwpx']) pinned(paths[f], PINS[f]);
    pinned(paths.old, PINS.old);
    pinned(paths.cfb, PINS.cfb);
    json('RESULT.json', {
      mode,
      reports,
      wasmSha256: sha(candidateBytes),
      mainArtifactGreen: mode === 'fresh' && reports.every((r) => r.status === 'passed'),
      sourceInputClaim: 'caller input identity/bytes only; no Native internal pointer ABI exposed',
      scope: 'actual SDK/files; browser owned by Task E',
    });
  });
}
