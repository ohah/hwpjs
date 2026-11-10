// AF: explicit live-session evidence. No implicit WASM, fixture, or oracle fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  realpathSync,
  lstatSync,
  existsSync,
} from 'node:fs';
import { resolve, dirname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { inflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pathNames = [
  'SOURCE_ROOT',
  'WASM',
  'OLD_WASM',
  'ORACLE_ROOT',
  'EVIDENCE_DIR',
  'SOURCE_GRID_HWP5',
  'SOURCE_GRID_HWPX',
];
const hashNames = ['WASM', 'OLD_WASM', 'CFB', 'SOURCE_GRID_HWP5', 'SOURCE_GRID_HWPX'];
const paths = {},
  pins = {};
// Complete the lexical pass over EVERY input before any filesystem access.
for (const name of pathNames) {
  const value = process.env[`HWPJS_TEST_${name}`];
  assert(typeof value === 'string' && isAbsolute(value), `ExplicitAbsolutePathRequired:${name}`);
  assert(
    ![...value].some((character) => character.charCodeAt(0) < 32) &&
      !value.includes(String.fromCharCode(92)) &&
      !/hwpers|title-column-roundtrip|(?:^|\/)rhwp(?:\/|$)/iu.test(value),
    `ForbiddenPath:${name}`,
  );
  assert(
    value === resolve(value) && !value.includes('//') && !value.endsWith('/'),
    `NonCanonicalPath:${name}`,
  );
  paths[name] = value;
}
for (const name of hashNames) {
  const value = process.env[`HWPJS_TEST_${name}_SHA256`];
  assert(
    typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value),
    `ExplicitSha256Required:${name}`,
  );
  pins[name] = value;
}
const verification = '/zig-out/verification/';
assert(paths.SOURCE_ROOT.includes(verification), 'ControlledSourceRequired');
const workspace = paths.SOURCE_ROOT.slice(0, paths.SOURCE_ROOT.indexOf(verification));
const verificationRoot = workspace + verification;
assert(paths.EVIDENCE_DIR.startsWith(verificationRoot), 'ControlledEvidenceRequired');
assert(!paths.EVIDENCE_DIR.startsWith(paths.SOURCE_ROOT + '/'), 'EvidenceOutsideSourceRequired');
const approved = join(workspace, 'zig-out/verification/created-table-ui-r1/browser-public-r1');
assert.equal(
  paths.SOURCE_GRID_HWP5,
  join(approved, 'vanilla-hwp5.hwp'),
  'ApprovedHwp5FixtureRequired',
);
assert.equal(
  paths.SOURCE_GRID_HWPX,
  join(approved, 'vanilla-hwpx.hwpx'),
  'ApprovedHwpxFixtureRequired',
);
assert.notEqual(paths.WASM, paths.OLD_WASM, 'DistinctOldWasmRequired');
assert.notEqual(pins.WASM, pins.OLD_WASM, 'FreshWasmMustDifferFromOld');

// Reject symlink aliases too, after the complete lexical pass.
for (const name of pathNames.filter((name) => name !== 'EVIDENCE_DIR'))
  assert.equal(realpathSync(paths[name]), paths[name], `SymlinkAliasDenied:${name}`);
assert.equal(realpathSync(dirname(paths.EVIDENCE_DIR)), dirname(paths.EVIDENCE_DIR));
assert(!existsSync(paths.EVIDENCE_DIR), 'FreshEvidenceDirectoryRequired');
const pinned = (path, hash) => {
  assert(lstatSync(path).isFile(), `RegularFileRequired:${path}`);
  const bytes = readFileSync(path);
  assert.equal(sha(bytes), hash, `InputHashMismatch:${path}`);
  return bytes;
};
const binary = pinned(paths.WASM, pins.WASM);
const oldBinary = pinned(paths.OLD_WASM, pins.OLD_WASM);
const cfbPath = join(paths.ORACLE_ROOT, 'legacy/cfb.js');
assert.equal(realpathSync(cfbPath), cfbPath);
const cfbSource = pinned(cfbPath, pins.CFB);
const fixtures = ['hwp5', 'hwpx'].map((format) => {
  const name = format === 'hwp5' ? 'SOURCE_GRID_HWP5' : 'SOURCE_GRID_HWPX';
  return {
    format,
    path: paths[name],
    sha256: pins[name],
    bytes: pinned(paths[name], pins[name]),
    ext: format === 'hwp5' ? 'hwp' : 'hwpx',
  };
});
const sourceFiles = [
  'js/hwp5-editor.mjs',
  'js/hwpx-editor.mjs',
  'js/source-table-grid.mjs',
  'js/abi-schema.mjs',
  'js/editor-history.mjs',
  'web/preview/reader-runtime.mjs',
  'web/preview/source-table-grid-command.mjs',
];
const sourceHashes = Object.fromEntries(
  sourceFiles.map((name) => [name, sha(readFileSync(join(paths.SOURCE_ROOT, name)))]),
);
const module = await WebAssembly.compile(binary);
const oldModule = await WebAssembly.compile(oldBinary);
for (const format of ['hwp5', 'hwpx']) {
  const name = `${format}_edit_source_table_grid`;
  assert(
    WebAssembly.Module.exports(module).some((e) => e.name === name && e.kind === 'function'),
    `FreshExportRequired:${name}`,
  );
  assert(
    !WebAssembly.Module.exports(oldModule).some((e) => e.name === name && e.kind === 'function'),
    `OldArtifactMustLackSourceGrid:${name}`,
  );
}
mkdirSync(paths.EVIDENCE_DIR); // No recursive mkdir or overwriting an older cohort.
const persist = (name, bytes) =>
  writeFileSync(join(paths.EVIDENCE_DIR, name), bytes, { flag: 'wx' });
const json = (name, value) => persist(name, JSON.stringify(value, null, 2) + '\n');
json('inputs.json', {
  paths,
  pins,
  sourceHashes,
  classification: 'actual SDK sessions + independent CFB and ZIP/XML; no browser or Worker claim',
});
const load = (name) => import(pathToFileURL(join(paths.SOURCE_ROOT, name)));
const { createExperimentalHwp5Editor } = await load('js/hwp5-editor.mjs');
const { createHwpxEditor } = await load('js/hwpx-editor.mjs');
const vm = { module: { exports: {} }, require: createRequire(import.meta.url), Buffer, process };
runInNewContext(cfbSource.toString('utf8'), vm, { filename: cfbPath, timeout: 10000 });
const CFB = vm.module.exports;

function records(bytes) {
  const out = [];
  for (let at = 0; at < bytes.length;) {
    assert(at + 4 <= bytes.length, 'RecordHeaderBounds');
    const header = bytes.readUInt32LE(at);
    at += 4;
    let length = header >>> 20;
    if (length === 4095) {
      assert(at + 4 <= bytes.length);
      length = bytes.readUInt32LE(at);
      at += 4;
    }
    assert(length <= bytes.length - at, 'RecordPayloadBounds');
    out.push({
      tag: header & 1023,
      level: (header >>> 10) & 1023,
      bytes: bytes.subarray(at, at + length),
    });
    at += length;
  }
  return out;
}
const rawRecord = (row) => [row.tag, row.level, row.bytes.toString('hex')];
function h5Oracle(bytes) {
  const archive = CFB.parse(bytes),
    streams = new Map();
  archive.FileIndex.forEach((entry, index) => {
    if (entry.type === 2)
      streams.set(
        archive.FullPaths[index].slice(archive.FullPaths[0].length),
        Buffer.from(entry.content),
      );
  });
  const compressed = streams.get('FileHeader').readUInt32LE(36) & 1;
  const unpack = (bytes) => (compressed ? inflateRawSync(bytes) : bytes);
  const docinfo = records(unpack(streams.get('DocInfo')));
  const chars = docinfo
    .filter((r) => r.tag === 21)
    .map((r, id) => {
      assert(r.bytes.length >= 50, 'CharShapePayloadBounds');
      const flags = r.bytes.readUInt32LE(46);
      return {
        id: String(id),
        bold: Boolean(flags & 2),
        italic: Boolean(flags & 1),
        raw: sha(r.bytes),
      };
    });
  const tables = [],
    ids = [],
    sections = {};
  for (const [name, payload] of streams) {
    if (!/^BodyText\/Section[0-9]+$/u.test(name)) continue;
    const rows = records(unpack(payload)),
      section = Number(name.match(/[0-9]+$/u)[0]);
    sections[section] = rows.map(rawRecord);
    for (const row of rows)
      if (row.tag === 66 && row.bytes.length >= 22) ids.push(String(row.bytes.readUInt32LE(18)));
    for (let at = 0; at < rows.length; at++) {
      const ctrl = rows[at];
      if (ctrl.tag !== 71 || !ctrl.bytes.subarray(0, 4).equals(Buffer.from([32, 108, 98, 116])))
        continue;
      let end = at + 1;
      while (end < rows.length && rows[end].level > ctrl.level) end++;
      const indexes = Array.from({ length: end - at - 1 }, (_, i) => at + i + 1);
      const definition = indexes.find(
        (i) => rows[i].tag === 77 && rows[i].level === ctrl.level + 1,
      );
      assert(definition !== undefined, 'TableDefinitionRequired');
      const lists = indexes.filter((i) => rows[i].tag === 72 && rows[i].level === ctrl.level + 1);
      const cells = lists.map((i, cellIndex) => {
        const list = rows[i],
          base = 8; // Explicit Reader observed8 policy; never infer from length.
        assert.equal(list.bytes.length, base + 26, 'Observed8CellLayoutRequired');
        const span = rows.slice(i + 1, lists[cellIndex + 1] ?? end);
        const paragraphs = span.filter((r) => r.tag === 66 && r.level === list.level);
        assert.equal(paragraphs.length, 1, 'SingleSourceCellParagraphRequired');
        const header = paragraphs[0];
        const text =
          span
            .find((r) => r.tag === 67 && r.level === header.level + 1)
            ?.bytes.toString('utf16le')
            .replace(/\r$/u, '') ?? '';
        const shape = span.find((r) => r.tag === 68 && r.level === header.level + 1);
        assert(shape && shape.bytes.length % 8 === 0, 'CharShapeRunsRequired');
        const runs = [];
        for (let k = 0; k < shape.bytes.length; k += 8)
          runs.push({
            start: shape.bytes.readUInt32LE(k),
            id: String(shape.bytes.readUInt32LE(k + 4)),
          });
        assert.equal(runs[0]?.start, 0);
        for (let k = 0; k < runs.length; k++) {
          assert(
            chars.some((c) => c.id === runs[k].id),
            'RunStyleIdResolves',
          );
          assert(k === 0 || runs[k].start > runs[k - 1].start, 'OrderedRunStarts');
        }
        const units = Array.from({ length: text.length }, (_, unit) => {
          const run = runs.findLast((r) => r.start <= unit),
            style = chars.find((c) => c.id === run.id);
          return { id: run.id, bold: style.bold, italic: style.italic };
        });
        return {
          row: list.bytes.readUInt16LE(base + 2),
          column: list.bytes.readUInt16LE(base),
          rowSpan: list.bytes.readUInt16LE(base + 6),
          columnSpan: list.bytes.readUInt16LE(base + 4),
          id: String(header.bytes.readUInt32LE(18)),
          text,
          runs,
          units,
          raw: span.map(rawRecord),
        };
      });
      tables.push({
        section,
        node: definition,
        rows: rows[definition].bytes.readUInt16LE(4),
        columns: rows[definition].bytes.readUInt16LE(6),
        cells,
        outside: [...rows.slice(0, at), ...rows.slice(end)].map(rawRecord),
        raw: rows.slice(at, end).map(rawRecord),
      });
    }
  }
  const stableDocinfo = docinfo
    .filter((r) => r.tag !== 21)
    .map((r) => {
      const bytes = Buffer.from(r.bytes);
      if (r.tag === 17) {
        assert(bytes.length >= 40);
        bytes.fill(0, 36, 40);
      }
      return rawRecord({ ...r, bytes });
    });
  return {
    tables,
    ids,
    chars,
    stableHeader: stableDocinfo,
    sections,
    streams: Object.fromEntries([...streams].map(([name, data]) => [name, sha(data)])),
  };
}

// Python's stdlib ZIP/XML parser is independent of product JS/WASM parsers.
const xmlOracle = String.raw`
import sys,io,json,zipfile,hashlib,re,copy,xml.etree.ElementTree as E
P='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
H='{http://www.hancom.co.kr/hwpml/2011/head}'
sha=lambda b:hashlib.sha256(b).hexdigest()
def canonical(e):
 return [e.tag,sorted(e.attrib.items()),e.text or '',[canonical(c) for c in e],e.tail or '']
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as z:
 assert z.testzip() is None
 assert len(z.namelist())==len(set(z.namelist()))
 data={n:z.read(n) for n in z.namelist()}
 header=E.fromstring(data['Contents/header.xml'])
 chars=[]
 for c in header.iter(H+'charPr'):
  chars.append(dict(id=c.get('id'),bold=c.find(H+'bold') is not None,italic=c.find(H+'italic') is not None,raw=sha(E.tostring(c))))
 styles={c['id']:c for c in chars}
 stable=copy.deepcopy(header)
 for parent in stable.iter():
  if parent.tag==H+'charProperties':
   parent.set('itemCnt','AF_DYNAMIC_COUNT')
   for c in list(parent):
    if c.tag==H+'charPr':parent.remove(c)
 tables=[];ids=[];sections={}
 for name,raw in data.items():
  if not re.fullmatch(r'Contents/section[0-9]+\.xml',name):continue
  root=E.fromstring(raw);section=int(re.search(r'[0-9]+',name).group())
  for p in root.iter(P+'p'):ids.append(p.get('id'))
  elements=list(root.iter());nodes={e:i for i,e in enumerate(elements)}
  # Fixtures are flat simple tables, so matching same-prefix tbl spans is unambiguous.
  spans=list(re.finditer(rb'<(?P<p>(?:[A-Za-z_][\w.-]*:)?)tbl\b[^>]*>.*?</(?P=p)tbl\s*>',raw,re.S))
  source=list(root.iter(P+'tbl'));assert len(spans)==len(source)
  sections[str(section)]=sha(raw)
  for table,span in zip(source,spans):
   cells=[]
   for tr in table.findall(P+'tr'):
    for tc in tr.findall(P+'tc'):
     address=tc.find(P+'cellAddr');s=tc.find(P+'cellSpan');sub=tc.find(P+'subList');ps=sub.findall(P+'p');assert len(ps)==1
     p=ps[0];text='';runs=[];units=[]
     for run in p.findall(P+'run'):
      value=''.join(t.text or '' for t in run.findall(P+'t'));sid=run.get('charPrIDRef');assert sid in styles
      runs.append(dict(start=len(text.encode('utf-16le'))//2,id=sid));text+=value
      units += [dict(id=sid,bold=styles[sid]['bold'],italic=styles[sid]['italic'])]*(len(value.encode('utf-16le'))//2)
     cells.append(dict(row=int(address.get('rowAddr')),column=int(address.get('colAddr')),rowSpan=int(s.get('rowSpan')),columnSpan=int(s.get('colSpan')),id=p.get('id'),text=text,runs=runs,units=units,raw=canonical(tc)))
   tables.append(dict(section=section,node=nodes[table],rows=int(table.get('rowCnt')),columns=int(table.get('colCnt')),cells=cells,outside=sha(raw[:span.start()]+b'AF_TARGET_TABLE'+raw[span.end():]),raw=canonical(table)))
 print(json.dumps(dict(tables=tables,ids=ids,chars=chars,stableHeader=canonical(stable),sections=sections,streams={n:sha(b) for n,b in data.items()})))
`;
function inspect(bytes, format) {
  if (format === 'hwp5') return h5Oracle(Buffer.from(bytes));
  const child = spawnSync('python3', ['-I', '-B', '-c', xmlOracle], {
    input: bytes,
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (child.error) throw child.error;
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}
function sameOutside(base, view, targetIndex, format) {
  const target = base.tables[targetIndex];
  assert.deepEqual(
    view.tables.filter((_, i) => i !== targetIndex).map((t) => t.raw),
    base.tables.filter((_, i) => i !== targetIndex).map((t) => t.raw),
    'NonTargetTablesPreserved',
  );
  assert.deepEqual(
    view.tables[targetIndex].outside,
    target.outside,
    'NonTargetSectionPayloadPreserved',
  );
  assert.deepEqual(view.stableHeader, base.stableHeader, 'NonCharacterHeaderPayloadPreserved');
  for (const style of base.chars)
    assert.deepEqual(
      view.chars.find((c) => c.id === style.id),
      style,
      'ExistingCharacterStylePreserved',
    );
  assert.deepEqual(Object.keys(view.streams).sort(), Object.keys(base.streams).sort());
  const changed = new Set(
    format === 'hwp5'
      ? ['DocInfo', `BodyText/Section${target.section}`]
      : ['Contents/header.xml', `Contents/section${target.section}.xml`],
  );
  for (const name of Object.keys(base.streams))
    if (!changed.has(name))
      assert.equal(view.streams[name], base.streams[name], `NonTargetPayload:${name}`);
  for (const table of view.tables)
    for (const cell of table.cells)
      assert(
        cell.units.every((unit) => view.chars.some((style) => style.id === unit.id)),
        'AllRunStyleIdsResolve',
      );
}
async function open(f, bytes, wasmModule = module) {
  if (f.format === 'hwp5') return createExperimentalHwp5Editor(wasmModule, bytes);
  const sdk = await createHwpxEditor(wasmModule);
  sdk.open(bytes);
  return sdk;
}
const save = (sdk, f) =>
  Buffer.from(f.format === 'hwp5' ? sdk.save({ allowStaleLayout: true }).bytes : sdk.save());
const text = (sdk, f, paragraph) =>
  f.format === 'hwp5'
    ? sdk.text(0, paragraph).replace(/\r$/u, '')
    : sdk.anchorText(0, paragraph).replace(/\r$/u, '');
function current(sdk, f, targetOrdinal, log) {
  const bindings = sdk.tableBindings(0),
    nodes = [...new Set(bindings.map((b) => b.tableNode))];
  assert(nodes[targetOrdinal] !== undefined, 'CurrentSourceTableRequired');
  const cells = bindings.filter((b) => b.tableNode === nodes[targetOrdinal]);
  const first = cells.find((b) => b.row === 0 && b.column === 0);
  assert(first && cells.every((b) => b.rowSpan === 1 && b.columnSpan === 1));
  assert.equal(cells.length, first.rows * first.columns, 'OneNativeParagraphPerCell');
  let epoch = null,
    reference = null;
  if (f.format === 'hwp5') {
    const references = sdk.currentSourceReferences(0, { first: first.paragraph, count: 1 });
    assert.equal(references.references.length, 1);
    reference = references.references[0];
    epoch = reference.epoch;
    assert.equal(reference.kind, 'original', 'SourceParagraphNotGenerated');
    assert.equal(sdk.currentText(reference).replace(/\r$/u, ''), text(sdk, f, first.paragraph));
    assert.equal(
      Number(reference.id),
      sdk.currentTextPreview().sections[0].paragraphs[first.paragraph].nodeIndex,
    );
  }
  const value = {
    section: 0,
    tableNode: first.tableNode,
    expectedRows: first.rows,
    expectedColumns: first.columns,
    paragraph: first.paragraph,
    listNode: first.listNode,
    epoch,
    revision: sdk.historyRevision(),
  };
  log.push(value);
  return { ...value, cells, reference, text: text(sdk, f, first.paragraph) };
}
function type(sdk, f, target, value, at) {
  if (f.format === 'hwp5')
    sdk.splice({
      section: 0,
      paragraph: target.paragraph,
      startUnit: at,
      endUnit: at,
      text: value,
    });
  else sdk.spliceAnchored(0, target.paragraph, at, 0, value);
}
const grid = (target, action, index, f) => ({
  section: 0,
  tableNode: target.tableNode,
  expectedRows: target.expectedRows,
  expectedColumns: target.expectedColumns,
  action,
  index,
  ...(f.format === 'hwp5' ? { layout: 'observed8' } : {}),
});
const reports = [];
for (const f of fixtures)
  for (const mode of ['v1', 'default'])
    for (const action of ['insert-row', 'delete-row', 'insert-column', 'delete-column']) {
      test(
        `${f.format} ${mode} actual SDK original source ${action}: mixed editing, independent save, complete history`,
        { timeout: 120000 },
        async () => {
          const label = `${f.format}-${mode}-${action}`,
            log = [],
            snapshots = [],
            observations = [];
          let sdk;
          const report = { label, status: 'started', sourceTableGridAvailable: false };
          const capture = (stage) => {
            const bytes = save(sdk, f),
              view = inspect(bytes, f.format);
            persist(`${label}-${stage}.${f.ext}`, bytes);
            json(`${label}-${stage}.oracle.json`, view);
            snapshots.push(bytes);
            observations.push(view);
            return view;
          };
          try {
            sdk = await open(f, f.bytes);
            assert.equal(sdk.supportsSourceTableGrid(), true);
            report.sourceTableGridAvailable = true;
            if (mode === 'v1') sdk.enableHistory();
            else sdk.enableHistoryDefault();
            report.history = sdk.historyStats();
            if (mode === 'default' && sdk.historyV2Available())
              assert.equal(report.history.negotiation, 'native-default-v2');
            const baseline = capture('0-baseline');
            const targetIndex = baseline.tables.findIndex(
              (t) =>
                t.section === 0 &&
                t.rows >= 2 &&
                t.columns >= 2 &&
                t.cells.length === t.rows * t.columns &&
                t.cells.every((c) => c.rowSpan === 1 && c.columnSpan === 1),
            );
            assert(targetIndex >= 0, 'ApprovedFixtureNeedsSimple2x2SourceTable');
            const ordinal = baseline.tables
              .slice(0, targetIndex)
              .filter((t) => t.section === 0).length;
            let target = current(sdk, f, ordinal, log);
            assert.equal(
              target.tableNode,
              baseline.tables[targetIndex].node,
              'IndependentTargetNodeMatchesNative',
            );
            const prefix = 'AF한🙂<&',
              suffix = '|Z한🙂';
            type(sdk, f, target, prefix, 0);
            target = current(sdk, f, ordinal, log);
            assert(target.text.startsWith(prefix));
            capture('1-type');
            sdk.setCharacterProperties({
              section: 0,
              paragraph: target.paragraph,
              startUnit: 1,
              endUnit: 3,
              properties: { bold: true },
            });
            target = current(sdk, f, ordinal, log);
            const beforeGrid = capture('2-partial-bold');
            const beforeCell = beforeGrid.tables[targetIndex].cells.find(
              (c) => c.row === 0 && c.column === 0,
            );
            assert(
              beforeCell.units.slice(1, 3).every((u) => u.bold),
              'IndependentPartialBold',
            );
            assert.deepEqual(
              beforeCell.units.slice(0, 1),
              observations[1].tables[targetIndex].cells[0].units.slice(0, 1),
            );
            assert.deepEqual(
              beforeCell.units.slice(3),
              observations[1].tables[targetIndex].cells[0].units.slice(3),
            );
            const stale = { ...target };
            const row = action.endsWith('row'),
              insert = action.startsWith('insert-');
            const index = (row ? target.expectedRows : target.expectedColumns) - (insert ? 0 : 1);
            const count = sdk.historyRevisions().length;
            sdk.editSourceTableGrid(grid(target, action, index, f));
            target = current(sdk, f, ordinal, log); // Always re-query Native; no old node/paragraph reuse.
            assert.equal(sdk.historyRevisions().length, count + 1, 'OneStructuralHistoryEntry');
            if (f.format === 'hwp5')
              assert(BigInt(target.epoch) > BigInt(stale.epoch), 'FreshNativeEpochAfterStructure');
            const structural = capture('3-grid');
            const beforeTable = beforeGrid.tables[targetIndex],
              afterTable = structural.tables[targetIndex];
            assert.equal(afterTable.rows, beforeTable.rows + (row ? (insert ? 1 : -1) : 0));
            assert.equal(afterTable.columns, beforeTable.columns + (row ? 0 : insert ? 1 : -1));
            assert.equal(afterTable.cells.length, afterTable.rows * afterTable.columns);
            const oldIds = new Set(beforeGrid.ids);
            const added = afterTable.cells.filter(
              (c) => !beforeTable.cells.some((old) => old.id === c.id),
            );
            assert.equal(added.length, insert ? (row ? beforeTable.columns : beforeTable.rows) : 0);
            for (const cell of added) {
              assert(cell.id && cell.id !== '0' && !oldIds.has(cell.id));
              assert.equal(cell.text, '');
              assert.equal(structural.ids.filter((id) => id === cell.id).length, 1);
            }
            for (const old of beforeTable.cells) {
              if (!insert && (row ? old.row : old.column) === index) continue;
              const survivor = afterTable.cells.find((c) => c.id === old.id);
              assert(survivor, 'SurvivingParagraphIdPreserved');
              assert.equal(survivor.text, old.text);
              assert.deepEqual(survivor.runs, old.runs);
              assert.deepEqual(survivor.units, old.units);
              assert.equal(survivor.row, old.row + (row && insert && old.row >= index ? 1 : 0));
              assert.equal(
                survivor.column,
                old.column + (!row && insert && old.column >= index ? 1 : 0),
              );
            }
            const suffixStart = target.text.length;
            type(sdk, f, target, suffix, suffixStart);
            target = current(sdk, f, ordinal, log);
            assert(target.text.endsWith(suffix));
            capture('4-survivor-type');
            sdk.setCharacterProperties({
              section: 0,
              paragraph: target.paragraph,
              startUnit: suffixStart,
              endUnit: suffixStart + suffix.length,
              properties: { italic: true },
            });
            current(sdk, f, ordinal, log);
            const final = capture('5-italic');
            const finalCell = final.tables[targetIndex].cells.find((c) => c.id === beforeCell.id);
            assert.equal(finalCell.text, beforeCell.text + suffix);
            assert(
              finalCell.units.slice(suffixStart).every((u) => u.italic),
              'IndependentItalic',
            );
            assert.deepEqual(
              finalCell.units.slice(0, suffixStart),
              beforeCell.units,
              'PreexistingRunStylesSurvive',
            );
            for (const view of observations) sameOutside(baseline, view, targetIndex, f.format);
            // Retain redo while probing stale dimensions, unknown nodes/actions and public numeric codes.
            assert.equal(sdk.undo(), true);
            assert.deepEqual(save(sdk, f), snapshots[4]);
            target = current(sdk, f, ordinal, log);
            const retained = sdk.historyRevisions(),
              revision = sdk.historyRevision();
            for (const denied of [
              grid(stale, 'insert-row', 0, f),
              { ...grid(target, 'insert-row', 0, f), tableNode: 0xffffffff },
              ...[0, 1, 2, 3, 'merge'].map((action) => grid(target, action, 0, f)),
            ]) {
              assert.throws(() => sdk.editSourceTableGrid(denied));
              assert.deepEqual(sdk.historyRevisions(), retained);
              assert.equal(sdk.historyRevision(), revision);
              assert.deepEqual(save(sdk, f), snapshots[4]);
            }
            assert.equal(sdk.redo(), true);
            assert.deepEqual(save(sdk, f), snapshots[5]);
            for (let at = snapshots.length - 2; at >= 0; at--) {
              assert.equal(sdk.undo(), true);
              assert.deepEqual(save(sdk, f), snapshots[at], `ExactUndoSnapshot:${at}`);
              current(sdk, f, ordinal, log);
            }
            assert.equal(sdk.undo(), false);
            for (let at = 1; at < snapshots.length; at++) {
              assert.equal(sdk.redo(), true);
              assert.deepEqual(save(sdk, f), snapshots[at], `ExactRedoSnapshot:${at}`);
              current(sdk, f, ordinal, log);
            }
            assert.equal(sdk.redo(), false);
            sdk.close();
            sdk = undefined; // Reopen only after the entire original session finished.
            sdk = await open(f, snapshots.at(-1));
            assert.equal(sdk.supportsSourceTableGrid(), true);
            const reopenedBindings = sdk.tableBindings(0);
            assert(
              reopenedBindings.some(
                (b) => b.rows === afterTable.rows && b.columns === afterTable.columns,
              ),
            );
            assert.deepEqual(
              inspect(save(sdk, f), f.format).tables.map((t) =>
                t.cells.map((c) => [c.id, c.text, c.units]),
              ),
              final.tables.map((t) => t.cells.map((c) => [c.id, c.text, c.units])),
              'ReopenedIndependentTextStylesIds',
            );
            report.status = 'passed';
            report.snapshots = snapshots.map(sha);
            report.redoRetainedOnRejection = true;
          } catch (error) {
            report.status = 'failed';
            report.error = { message: error.message, stack: error.stack };
            throw error;
          } finally {
            sdk?.close();
            report.fixtureUnchanged = sha(readFileSync(f.path)) === f.sha256;
            report.currentNativeTuples = log;
            json(`${label}-result.json`, report);
            reports.push(report);
            assert.equal(report.fixtureUnchanged, true, 'SourceFixtureUnchanged');
          }
        },
      );
    }
for (const f of fixtures)
  test(`${f.format} actual old ABI rejects source grid while retaining open/save`, async () => {
    const sdk = await open(f, f.bytes, oldModule);
    try {
      sdk.enableHistoryDefault();
      assert.equal(sdk.supportsSourceTableGrid(), false);
      const before = save(sdk, f),
        revision = sdk.historyRevision();
      assert.throws(
        () =>
          sdk.editSourceTableGrid({
            section: 0,
            tableNode: 1,
            expectedRows: 2,
            expectedColumns: 2,
            action: 'insert-row',
            index: 0,
            ...(f.format === 'hwp5' ? { layout: 'observed8' } : {}),
          }),
        /SourceTableGridAbiUnavailable/,
      );
      assert.deepEqual(save(sdk, f), before);
      assert.equal(sdk.historyRevision(), revision);
      json(`${f.format}-old-abi.json`, {
        sourceTableGridAvailable: false,
        revisionUnchanged: true,
        savedBytesUnchanged: true,
      });
    } finally {
      sdk.close();
    }
  });
test.after(() => {
  const unchanged = Object.fromEntries(
    sourceFiles.map((name) => [
      name,
      sha(readFileSync(join(paths.SOURCE_ROOT, name))) === sourceHashes[name],
    ]),
  );
  const fixtureUnchanged = Object.fromEntries(
    fixtures.map((f) => [f.format, sha(readFileSync(f.path)) === f.sha256]),
  );
  const result = {
    reports,
    sourceUnchanged: unchanged,
    fixtureUnchanged,
    cfbOracleUnchanged: sha(readFileSync(cfbPath)) === pins.CFB,
    wasmSha256: pins.WASM,
    oldWasmSha256: pins.OLD_WASM,
    actualNativeRun: true,
  };
  json('RESULT.json', result);
  assert(Object.values(unchanged).every(Boolean), 'SDKSourceUnchanged');
  assert(Object.values(fixtureUnchanged).every(Boolean), 'FixtureSourcesUnchanged');
  assert.equal(result.cfbOracleUnchanged, true);
});
