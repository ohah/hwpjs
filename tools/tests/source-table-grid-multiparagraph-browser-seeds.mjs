// D2: independent narrow browser seed cohort; original wide seeds/defaults remain immutable.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, lstatSync, existsSync } from 'node:fs';
import { resolve, isAbsolute, join, dirname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { spawnSync } from 'node:child_process';
import { inflateRawSync, deflateRawSync } from 'node:zlib';
import {
  sha,
  records,
  h5Seed,
  hxSeed,
  h5Inspect,
  hxInspect,
  repackTinyCfb,
  assertGridTransition,
} from './source-table-grid-multiparagraph-oracle.mjs';
const geometryMode = process.env.HWPJS_TEST_BROWSER_GEOMETRY_MODE ?? 'width24000';
assert(['width24000', 'padding300'].includes(geometryMode), 'BoundedBrowserGeometryModeRequired');
const ROOT = '/Users/yoonhb/Documents/workspace/hwpjs';
const CONTROL = join(ROOT, 'zig-out/verification/document-transforms-connect-r1/source');
const VERIFY = join(ROOT, 'zig-out/verification/source-grid-multipara-r1');
const APPROVED = join(ROOT, 'zig-out/verification/created-table-ui-r1/browser-public-r1');
const pins = {
  hwp5: '833f4bbac266fe026a008f1f221b8443194a48c0874035eac4966438b55b9cca',
  hwpx: 'b5b74b76bb316a3bc4178b31b162a5919995a0a593546e56243ea15baa572289',
  cfb: 'd3162bbd248745eb17fd3ff9b3239e8a0f4480f466b55e4db79daecd8bf23479',
  old: '28d2f91917e81d0522ffe04d6ddff150aee2ad815a9ed1ed6d470af905aaacca',
  wasm: process.env.HWPJS_TEST_WASM_SHA256,
};
const paths = {
  source: process.env.HWPJS_TEST_SOURCE_ROOT,
  evidence: process.env.HWPJS_TEST_EVIDENCE_DIR,
  wasm: process.env.HWPJS_TEST_WASM,
  old: join(ROOT, 'zig-out/verification/source-table-live-r1/install-final/bin/hwpjs.wasm'),
  cfb: join(ROOT, 'legacy/cfb.js'),
  hwp5: join(APPROVED, 'vanilla-hwp5.hwp'),
  hwpx: join(APPROVED, 'vanilla-hwpx.hwpx'),
  oracle: join(CONTROL, 'tools/tests/source-table-grid-multiparagraph-oracle.mjs'),
};
function lexical(p) {
  assert(typeof p === 'string' && isAbsolute(p), 'ExplicitAbsolutePathRequired');
  assert(
    ![...p].some((c) => c.charCodeAt(0) < 32) &&
      !p.includes(String.fromCharCode(92)) &&
      !/hwpers|title-column-roundtrip|(?:^|\/)rhwp(?:\/|$)/iu.test(p),
    'ForbiddenPath',
  );
  assert.equal(resolve(p), p);
  assert(!p.includes('//') && !p.endsWith('/'));
}
Object.values(paths).forEach(lexical); // Complete lexical pass before any filesystem access.
assert.equal(paths.source, CONTROL);
assert(paths.evidence.startsWith(join(VERIFY, 'task-d') + '/browser-fit-'));
assert(/^[a-f0-9]{64}$/u.test(pins.wasm ?? ''), 'ExplicitFreshWasmShaRequired');
assert.notEqual(pins.wasm, pins.old);
function guard(p) {
  lexical(p);
  let at = sep;
  for (const part of p.split(sep).filter(Boolean)) {
    at = join(at, part);
    assert(!lstatSync(at).isSymbolicLink(), `SymlinkAliasDenied:${at}`);
  }
  return p;
}
for (const [k, p] of Object.entries(paths)) if (k !== 'evidence') guard(p);
guard(dirname(paths.evidence));
assert(!existsSync(paths.evidence), 'FreshEvidenceDirectoryRequired');
function pinned(p, pin) {
  guard(p);
  assert(lstatSync(p).isFile());
  const bytes = readFileSync(p);
  assert.equal(sha(bytes), pin);
  return bytes;
}
const input = Object.fromEntries(
  ['hwp5', 'hwpx', 'cfb', 'old', 'wasm'].map((k) => [k, pinned(paths[k], pins[k])]),
);
const oracleSha = sha(readFileSync(paths.oracle));
const context = {
  module: { exports: {} },
  require: createRequire(import.meta.url),
  Buffer,
  process,
};
runInNewContext(input.cfb.toString(), context, { timeout: 10000, filename: paths.cfb });
const CFB = context.module.exports;
function unpackH5(bytes) {
  const cfb = CFB.parse(bytes),
    streams = new Map();
  cfb.FileIndex.forEach((e, i) => {
    if (e.type === 2)
      streams.set(cfb.FullPaths[i].slice(cfb.FullPaths[0].length), Buffer.from(e.content));
  });
  const compressed = streams.get('FileHeader').readUInt32LE(36) & 1;
  return {
    cfb,
    streams,
    unpack: (b) => (compressed ? inflateRawSync(b) : b),
    pack: (b) => (compressed ? deflateRawSync(b) : b),
  };
}
function encode(rows) {
  return Buffer.concat(
    rows.flatMap((r) => {
      const h = Buffer.alloc(r.bytes.length >= 4095 ? 8 : 4);
      h.writeUInt32LE((r.tag | (r.level << 10) | (Math.min(r.bytes.length, 4095) << 20)) >>> 0);
      if (h.length === 8) h.writeUInt32LE(r.bytes.length, 4);
      return [h, r.bytes];
    }),
  );
}
function h5Padding(narrow) {
  const a = unpackH5(narrow),
    rows = records(a.unpack(a.streams.get('BodyText/Section0'))),
    t = h5Inspect(CFB, narrow).tables[0];
  for (const c of t.cells) {
    assert.equal(rows[c.start].bytes.readUInt16LE(28), 0);
    assert.equal(rows[c.start].bytes.readUInt16LE(30), 0);
    rows[c.start].bytes.writeUInt16LE(300, 28);
    rows[c.start].bytes.writeUInt16LE(300, 30);
  }
  a.streams.set('BodyText/Section0', a.pack(encode(rows)));
  return repackTinyCfb(narrow, a.cfb, a.streams);
}
function h5Narrow(wide) {
  const a = unpackH5(wide),
    rows = records(a.unpack(a.streams.get('BodyText/Section0'))),
    v = h5Inspect(CFB, wide);
  assert.equal(v.tables.length, 1);
  const t = v.tables[0];
  assert.equal(rows[t.start].bytes.readUInt32LE(16), 36000);
  rows[t.start].bytes.writeUInt32LE(24000, 16);
  for (const c of t.cells) {
    assert.equal(rows[c.start].bytes.readUInt32LE(16), 18000);
    rows[c.start].bytes.writeUInt32LE(12000, 16);
  }
  a.streams.set('BodyText/Section0', a.pack(encode(rows)));
  return repackTinyCfb(wide, a.cfb, a.streams);
}
function h5Geometry(bytes) {
  const a = unpackH5(bytes),
    rows = records(a.unpack(a.streams.get('BodyText/Section0'))),
    view = h5Inspect(CFB, bytes),
    t = view.tables[0];
  const page = rows.find((r) => r.tag === 73).bytes;
  assert.equal(page.readUInt32LE(32), 0, 'FixtureGutterZero');
  const sizes = records(a.unpack(a.streams.get('DocInfo')))
    .filter((r) => r.tag === 21)
    .map((r) => r.bytes.readUInt32LE(42));
  return {
    pageWidth: page.readUInt32LE(0),
    bodyWidth: page.readUInt32LE(0) - page.readUInt32LE(8) - page.readUInt32LE(12),
    tableWidth: rows[t.start].bytes.readUInt32LE(16),
    tableHeight: t.height,
    maxEm: Math.max(...sizes),
    cells: t.cells.map((c) => ({
      row: c.row,
      column: c.column,
      width: rows[c.start].bytes.readUInt32LE(16),
      height: c.height,
      horizontalMargins:
        rows[c.start].bytes.readUInt16LE(24) + rows[c.start].bytes.readUInt16LE(26),
      top: rows[c.start].bytes.readUInt16LE(28),
      bottom: rows[c.start].bytes.readUInt16LE(30),
      verticalMargins: rows[c.start].bytes.readUInt16LE(28) + rows[c.start].bytes.readUInt16LE(30),
    })),
  };
}
const xml = String.raw`
import sys,io,zipfile,json,re,xml.etree.ElementTree as E
P='{http://www.hancom.co.kr/hwpml/2011/paragraph}';H='{http://www.hancom.co.kr/hwpml/2011/head}'
raw=sys.stdin.buffer.read()
with zipfile.ZipFile(io.BytesIO(raw)) as z:
 assert z.testzip() is None
 entries=z.infolist();data={n:z.read(n) for n in z.namelist()};assert len(entries)==len(data)
b=data['Contents/section0.xml'];root=E.fromstring(b);t=next(root.iter(P+'tbl'))
if sys.argv[1]=='padding300':
 def attribute(m,key,old,new):
  assert re.search(rb'\b'+key+rb'="'+str(old).encode()+rb'"',m)
  return re.sub(rb'\b'+key+rb'="[0-9]+"',key+b'="'+str(new).encode()+b'"',m,count=1)
 def margins(m):return attribute(attribute(m[0],b'top',0,300),b'bottom',0,300)
 b,n=re.subn(rb'<(?:[\w.-]+:)?cellMargin\b[^>]*/>',margins,b);assert n==4
 b,n=re.subn(rb'<(?:[\w.-]+:)?tc\b[^>]*>',lambda m:attribute(m[0],b'hasMargin',0,1),b);assert n==4
 data['Contents/section0.xml']=b;out=io.BytesIO()
 with zipfile.ZipFile(out,'w') as z:
  for e in entries:z.writestr(e,data[e.filename])
 sys.stdout.buffer.write(out.getvalue());sys.exit()
if sys.argv[1]=='patch':
 def width(m,old,new):
  assert re.search(rb'\bwidth="'+str(old).encode()+rb'"',m[0]);return re.sub(rb'\bwidth="[0-9]+"',b'width="'+str(new).encode()+b'"',m[0],count=1)
 b,n=re.subn(rb'<(?:[\w.-]+:)?sz\b[^>]*/>',lambda m:width(m,36000,24000),b);assert n==1
 b,n=re.subn(rb'<(?:[\w.-]+:)?cellSz\b[^>]*/>',lambda m:width(m,18000,12000),b);assert n==4
 data['Contents/section0.xml']=b;out=io.BytesIO()
 with zipfile.ZipFile(out,'w') as z:
  for e in entries:z.writestr(e,data[e.filename])
 sys.stdout.buffer.write(out.getvalue());sys.exit()
page=next(root.iter(P+'pagePr'));margin=page.find(P+'margin');assert int(margin.get('gutter','0'))==0
header=E.fromstring(data['Contents/header.xml']);sizes=[int(c.get('height')) for c in header.iter(H+'charPr')]
cells=[]
for tr in t.findall(P+'tr'):
 for c in tr.findall(P+'tc'):
  a=c.find(P+'cellAddr');s=c.find(P+'cellSz');m=c.find(P+'cellMargin')
  cells.append(dict(row=int(a.get('rowAddr')),column=int(a.get('colAddr')),width=int(s.get('width')),height=int(s.get('height')),horizontalMargins=int(m.get('left'))+int(m.get('right')),top=int(m.get('top')),bottom=int(m.get('bottom')),hasMargin=c.get('hasMargin'),verticalMargins=int(m.get('top'))+int(m.get('bottom'))))
print(json.dumps(dict(pageWidth=int(page.get('width')),bodyWidth=int(page.get('width'))-int(margin.get('left'))-int(margin.get('right')),tableWidth=int(t.find(P+'sz').get('width')),tableHeight=int(t.find(P+'sz').get('height')),maxEm=max(sizes),cells=cells)))
`;
function xmlRun(bytes, mode) {
  const p = spawnSync('python3', ['-I', '-B', '-c', xml, mode], {
    input: bytes,
    timeout: 15000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (p.error) throw p.error;
  assert.equal(p.status, 0, p.stderr.toString());
  return p.stdout;
}
const inspect = (bytes, f) => (f === 'hwp5' ? h5Inspect(CFB, bytes) : hxInspect(bytes));
const geometry = (bytes, f) =>
  f === 'hwp5' ? h5Geometry(bytes) : JSON.parse(xmlRun(bytes, 'geometry'));
const seeds = [];
for (const f of ['hwp5', 'hwpx']) {
  const wide = f === 'hwp5' ? h5Seed(CFB, input[f], 'observed') : hxSeed(input[f]);
  assert.equal(
    sha(wide),
    f === 'hwp5'
      ? '8d10b4ccd2ab27b21898e4f29fa942f07a45a596044cfad20063069bc88daf46'
      : 'fda148cc611a8c8f0e88ca3dff7d1c8ff8a084ffc11eccc652867941b068f97f',
    'OriginalWideOutputBytesUnchanged',
  );
  const narrow = f === 'hwp5' ? h5Narrow(wide) : xmlRun(wide, 'patch');
  assert.equal(
    sha(narrow),
    f === 'hwp5'
      ? 'ed8748a5e72a2d4eb89a1168489130e8b6fb52dfdf7d5a166b21118c6c5f5d56'
      : '0a69868a10b76ac79cc00be1a2b38719fe5e2fb5784386ee36f1d9d5f751d079',
    'R1OutputBytesUnchanged',
  );
  const bytes =
      geometryMode === 'padding300'
        ? f === 'hwp5'
          ? h5Padding(narrow)
          : xmlRun(narrow, 'padding300')
        : narrow,
    before = inspect(wide, f),
    view = inspect(bytes, f),
    g = geometry(bytes, f);
  assert.deepEqual(
    view.tables.map((t) => t.cells.map((c) => c.paragraphs)),
    before.tables.map((t) => t.cells.map((c) => c.paragraphs)),
    'OnlyGeometryPatchedEveryRawParagraphUnchanged',
  );
  assert.deepEqual(view.chars, before.chars);
  assert.deepEqual(view.ids, before.ids);
  assert.deepEqual(view.metadata, before.metadata);
  assert.equal(g.tableWidth, 24000);
  assert.equal(g.tableHeight, 14400);
  assert.equal(g.cells.length, 4);
  assert(g.tableWidth + 12000 <= g.bodyWidth, 'ThreeColumnsFitBody');
  for (const c of g.cells) {
    assert.equal(c.width, 12000);
    assert.equal(c.height, 7200);
    assert.equal(c.top, geometryMode === 'padding300' ? 300 : 0);
    assert.equal(c.bottom, geometryMode === 'padding300' ? 300 : 0);
    if (f === 'hwpx') assert.equal(c.hasMargin, geometryMode === 'padding300' ? '1' : '0');
    const p = view.tables[0].cells.find((p) => p.row === c.row && p.column === c.column).paragraphs;
    assert(
      p.every((p) => p.text.length * g.maxEm <= c.width - c.horizontalMargins),
      'SyntheticTextOneEmWidthBudget',
    );
    assert(p.length * 2 * g.maxEm <= c.height - c.verticalMargins, 'ThreeParagraphTwoEmLineBudget');
  }
  seeds.push({
    format: f,
    bytes,
    view,
    geometry: g,
    wideSha256: sha(wide),
    sha256: sha(bytes),
    file: f === 'hwp5' ? 'hwp5-observed-source.hwp' : 'hwpx-plain-source.hwpx',
  });
}
mkdirSync(paths.evidence);
const persist = (name, bytes) => writeFileSync(join(paths.evidence, name), bytes, { flag: 'wx' });
const json = (name, value) => persist(name, JSON.stringify(value, null, 2) + '\n');
for (const s of seeds) {
  persist(s.file, s.bytes);
  json(`${s.format}-source.oracle.json`, s.view);
}
const oldModule = await WebAssembly.compile(input.old),
  newModule = await WebAssembly.compile(input.wasm);
const { createExperimentalHwp5Editor } = await import(
  pathToFileURL(guard(join(CONTROL, 'js/hwp5-editor.mjs')))
);
const { createHwpxEditor } = await import(
  pathToFileURL(guard(join(CONTROL, 'js/hwpx-editor.mjs')))
);
async function open(s, module) {
  if (s.format === 'hwp5') return createExperimentalHwp5Editor(module, s.bytes);
  const sdk = await createHwpxEditor(module);
  sdk.open(s.bytes);
  return sdk;
}
const save = (sdk, f) =>
  Buffer.from(f === 'hwp5' ? sdk.save({ allowStaleLayout: true }).bytes : sdk.save());
function request(sdk, f, action) {
  const b = sdk.tableBindings(0).find((b) => b.row === 0 && b.column === 0);
  assert(b);
  return {
    section: 0,
    tableNode: b.tableNode,
    expectedRows: b.rows,
    expectedColumns: b.columns,
    action,
    index: 1,
    ...(f === 'hwp5' ? { layout: 'observed8' } : {}),
  };
}
const reports = [];
for (const s of seeds)
  for (const action of ['insert-row', 'delete-row', 'insert-column', 'delete-column']) {
    const label = `${s.format}-${action}`,
      report = { label, status: 'started' };
    let sdk;
    try {
      sdk = await open(s, oldModule);
      sdk.enableHistoryDefault();
      const oldSaved = save(sdk, s.format),
        revision = sdk.historyRevision();
      assert.deepEqual(
        inspect(oldSaved, s.format).tables[0].cells.map((c) => c.paragraphs),
        s.view.tables[0].cells.map((c) => c.paragraphs),
      );
      assert.throws(() => sdk.editSourceTableGrid(request(sdk, s.format, action)), {
        message:
          s.format === 'hwp5' ? 'UnsupportedSourceTableGrid' : 'UnsupportedSourceTableStructure',
      });
      assert.deepEqual(save(sdk, s.format), oldSaved);
      assert.equal(sdk.historyRevision(), revision);
      report.oldStrictOpenSaveAndRefusal = true;
      assert.deepEqual(geometry(oldSaved, s.format), s.geometry, 'OldNativeRetainsExactRawPadding');
      sdk.close();
      sdk = await open(s, newModule);
      sdk.enableHistoryDefault();
      const before = save(sdk, s.format),
        beforeView = inspect(before, s.format);
      sdk.editSourceTableGrid(request(sdk, s.format, action));
      const after = save(sdk, s.format),
        afterView = inspect(after, s.format);
      report.transition = assertGridTransition(beforeView, afterView, {
        action,
        index: 1,
        format: s.format,
      });
      const g = geometry(after, s.format);
      assert(g.tableWidth <= g.bodyWidth, 'ResultFitsBody');
      assert.equal(g.tableWidth, afterView.tables[0].columns * 12000);
      assert.equal(g.tableHeight, afterView.tables[0].rows * 7200);
      for (const c of g.cells) {
        assert.equal(c.top, s.geometry.cells[0].top);
        assert.equal(c.bottom, s.geometry.cells[0].bottom);
        if (s.format === 'hwpx') assert.equal(c.hasMargin, s.geometry.cells[0].hasMargin);
      }
      report.geometryAfter = g;
      persist(`${label}-applied.${s.format === 'hwp5' ? 'hwp' : 'hwpx'}`, after);
      json(`${label}-applied.oracle.json`, afterView);
      assert.equal(sdk.undo(), true);
      assert.deepEqual(save(sdk, s.format), before);
      assert.equal(sdk.redo(), true);
      assert.deepEqual(save(sdk, s.format), after);
      report.status = 'passed';
      report.exactUndoRedo = true;
    } catch (e) {
      report.status = 'failed';
      report.error = { message: e.message, stack: e.stack };
      throw e;
    } finally {
      sdk?.close();
      reports.push(report);
      json(`${label}-result.json`, report);
    }
  }
for (const k of ['hwp5', 'hwpx', 'cfb', 'old', 'wasm']) pinned(paths[k], pins[k]);
assert.equal(sha(readFileSync(paths.oracle)), oracleSha, 'OracleStableDuringRun');
json('source-ready.json', {
  status: 'browser-fit-source-ready',
  geometryMode,
  paddingEvidence: {
    classification:
      'independent fixture raw geometry adjustment, not official HX semantics or rendered padding proof',
    hwp5: 'spec table80 HWPUNIT16[4] left/right/top/bottom; observed8 offsets28/30',
    hwpx: 'approved generated XML tc.hasMargin and cellMargin top/bottom; changed0to1 and0to300, exact old/new Native raw roundtrip',
    publicSdk:
      'insertTable options expose rows/columns/width/rowHeight/resources/cellTexts; no public margin option, so300 generation/effective padding not established by that API',
    effectiveRenderedPaddingConfirmed: false,
    r1PixelFailureResolved: false,
  },
  paths,
  pins,
  oracleSha256: oracleSha,
  readNative: false,
  actualSdkNativeRead: true,
  browserLaunched: false,
  reports,
  textFitScope:
    'Raw geometry and conservative synthetic one-em width / two-em line budgets; actual rendered clipping remains E browser authority.',
  seeds: seeds.map(({ bytes: _b, view, ...s }) => ({
    ...s,
    path: join(paths.evidence, s.file),
    paragraphs: view.tables[0].cells.map((c) => ({
      row: c.row,
      column: c.column,
      paragraphs: c.paragraphs,
    })),
  })),
});
console.log(
  JSON.stringify(
    {
      status: 'browser-fit-source-ready',
      reports: reports.length,
      oracleSha256: oracleSha,
      seeds: seeds.map((s) => ({
        format: s.format,
        path: join(paths.evidence, s.file),
        sha256: s.sha256,
        geometry: s.geometry,
      })),
    },
    null,
    2,
  ),
);
