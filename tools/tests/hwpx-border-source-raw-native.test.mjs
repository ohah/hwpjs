// Fresh granted WASM only. Raw metadata observation, not diagonal geometry/edit authority.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { module, fixture, hash, receipt, artifact } from './table-appearance-native-context.mjs';

const fields = [
  'slash_crooked',
  'slash_is_counter',
  'back_slash_crooked',
  'back_slash_is_counter',
  'break_cell_separate_line',
];
// Independent stdlib ZIP/XML reader. All transformations are labelled derived,
// header-only and verified against each original uncompressed ZIP entry.
const oracle = String.raw`
import sys,json,base64,io,zipfile,copy,xml.etree.ElementTree as E
r=json.load(sys.stdin);raw=base64.b64decode(r['bytes'],validate=True)
assert len(raw)<8*1024*1024
with zipfile.ZipFile(io.BytesIO(raw)) as z:
 infos=z.infolist();assert len(infos)<4096;assert sum(x.file_size for x in infos)<32*1024*1024
 names=[x.filename for x in infos];assert len(names)==len(set(names));entries={n:z.read(n) for n in names}
H='{http://www.hancom.co.kr/hwpml/2011/head}';P='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
root=E.fromstring(entries['Contents/header.xml']);fills=list(root.iter(H+'borderFill'));ids=[int(x.attrib['id']) for x in fills]
assert len(ids)==len(set(ids))==19 and set(ids)==set(range(1,20))
mode=r['mode'];origin={str(i):i for i in ids}
if mode=='permutation':
 shift=r['shift'];origin={}
 for x in fills:
  old=int(x.attrib['id']);new=(old-1+shift)%19+1;x.set('id',str(new));origin[str(new)]=old
elif mode=='injection':
 for i,x in enumerate(fills):
  slash=x.find(H+'slash');back=x.find(H+'backSlash');assert slash is not None and back is not None
  for n,keys in [(x,['breakCellSeparateLine']),(slash,['Crooked','isCounter']),(back,['Crooked','isCounter'])]:
   for k in keys:n.attrib.pop(k,None)
  if i%3==1:
   x.set('breakCellSeparateLine','0');slash.set('Crooked','');slash.set('isCounter','0');back.set('Crooked','2');back.set('isCounter','1')
  if i%3==2:
   x.set('breakCellSeparateLine','7');slash.set('Crooked','2');slash.set('isCounter','1');back.set('Crooked','0');back.set('isCounter','true')
else:assert mode=='original'
if mode!='original':
 header=E.tostring(root,encoding='utf-8',xml_declaration=True)
 if mode=='injection':header=header.replace(b'Crooked="2"',b'Crooked="&#x32;"').replace(b'isCounter="1"',b'isCounter="&#49;"')
 entries['Contents/header.xml']=header;output=io.BytesIO()
 with zipfile.ZipFile(output,'w') as z:
  for info in infos:z.writestr(copy.copy(info),entries[info.filename])
 raw=output.getvalue()
 with zipfile.ZipFile(io.BytesIO(raw)) as z:
  assert z.namelist()==names
  for info in infos:assert z.read(info.filename)==entries[info.filename]
 root=E.fromstring(entries['Contents/header.xml']);fills=list(root.iter(H+'borderFill'))
styles={}
for x in fills:
 slash=x.find(H+'slash');back=x.find(H+'backSlash')
 styles[x.attrib['id']]={'originalId':origin[x.attrib['id']],'raw':{
 'slash_crooked':None if slash is None else slash.get('Crooked'),
 'slash_is_counter':None if slash is None else slash.get('isCounter'),
 'back_slash_crooked':None if back is None else back.get('Crooked'),
 'back_slash_is_counter':None if back is None else back.get('isCounter'),
 'break_cell_separate_line':x.get('breakCellSeparateLine')}}
sec=E.fromstring(entries['Contents/section0.xml']);elements=list(sec.iter());indices={x:i for i,x in enumerate(elements)};parents={c:p for p in elements for c in p};cells=[]
for x in elements:
 if x.tag!=P+'tc':continue
 row=parents[x];table=parents[row];assert row.tag==P+'tr' and table.tag==P+'tbl';lists=[c for c in x if c.tag==P+'subList'];assert len(lists)==1
 cells.append({'table_node':indices[table],'cell_node':indices[x],'list_node':indices[lists[0]],'border_fill_id':int(x.attrib['borderFillIDRef'])})
print(json.dumps({'classification':'original' if mode=='original' else 'derived-header-only-'+mode,'bytes':base64.b64encode(raw).decode(),'styles':styles,'cells':cells,'headerStyles':len(styles),'otherZipEntriesPreserved':True}))
`;
let childOutput = 0;
function independent(input, mode, shift) {
  const child = spawnSync('python3', ['-B', '-c', oracle], {
    input: JSON.stringify({ bytes: input.toString('base64'), mode, shift }),
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  childOutput += Buffer.byteLength(child.stdout ?? '') + Buffer.byteLength(child.stderr ?? '');
  assert.ok(childOutput <= 8 * 1024 * 1024, 'aggregate independent oracle output bound');
  if (child.error) throw child.error;
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}
function compare(report, expected) {
  const expectedIds = [...new Set(expected.cells.map((cell) => cell.border_fill_id))].sort(
    (a, b) => a - b,
  );
  assert.equal(report.sourceOnly, true);
  assert.deepEqual(
    report.styles.map((style) => style.id).sort((a, b) => a - b),
    expectedIds,
  );
  assert.deepEqual(
    report.cells.map(({ style_index: _styleIndex, ...cell }) => cell),
    expected.cells,
  );
  for (const cell of report.cells)
    assert.equal(
      report.styles[cell.style_index].id,
      cell.border_fill_id,
      'Native indexed binding matches independent XML ID',
    );
  for (const style of report.styles) {
    const raw = Object.fromEntries(
      fields.map((field) => {
        assert.equal(Object.hasOwn(style, field), true, `fresh Native must emit raw key ${field}`);
        return [field, style[field]];
      }),
    );
    assert.deepEqual(raw, expected.styles[style.id].raw, `raw metadata for borderFill ${style.id}`);
  }
}

test(
  'WASM4 HWPX raw five fields match independent Noori XML and labelled derived header metadata',
  { timeout: 90000 },
  receipt('hwpx-raw-five-native', async () => {
    const input = fixture('hwpx'),
      pin = hash(input),
      retained = [],
      observedOriginalIds = new Set();
    const cases = [
      independent(input, 'original'),
      independent(input, 'permutation', 2),
      independent(input, 'permutation', 3),
      independent(input, 'injection'),
    ];
    for (const expected of cases) {
      const bytes = Buffer.from(expected.bytes, 'base64');
      const sdk = await createHwpxEditor(module);
      try {
        sdk.open(bytes);
        const first = sdk.tableBorderSources(0),
          second = sdk.tableBorderSources(0);
        compare(first, expected);
        compare(second, expected);
        assert.equal(expected.headerStyles, 19);
        if (expected.classification === 'original')
          assert.equal(
            second.styles.length,
            14,
            'only14 original styles are table-reachable; header has19',
          );
        first.styles[0].slash_crooked = 'caller-owned mutation';
        compare(second, expected);
        compare(sdk.tableBorderSources(0), expected);
        if (expected.classification !== 'derived-header-only-injection')
          for (const style of second.styles)
            observedOriginalIds.add(expected.styles[style.id].originalId);
        const snapshot = structuredClone(second);
        retained.push({ classification: expected.classification, report: second, snapshot });
      } finally {
        sdk.close();
      }
      assert.throws(() => sdk.tableBorderSources(0), /Closed/);
      const entry = retained.at(-1);
      assert.deepEqual(entry.report, entry.snapshot, 'decoded DTO remains owned after SDK close');
    }
    assert.deepEqual(
      [...observedOriginalIds].sort((a, b) => a - b),
      Array.from({ length: 19 }, (_, i) => i + 1),
      'all19 source style raw values covered across original14 and labelled ID permutations',
    );
    assert.equal(hash(input), pin, 'pinned original byte buffer unchanged');
    assert.equal(hash(fixture('hwpx')), pin, 'original fixture on disk unchanged');
    const output = artifact(
      'hwpx-raw-native-owned.json',
      Buffer.from(
        JSON.stringify(
          retained.map(({ classification, report }) => ({ classification, report })),
          null,
          2,
        ),
      ),
    );
    return {
      originalHeaderStyles: 19,
      originalReachableStyles: 14,
      labelledDerivedCases: 3,
      observedSourceStylesAcrossPermutations: observedOriginalIds.size,
      fields,
      detachedAfterClose: true,
      independentStdlibOracle: true,
      observationOnly: true,
      output,
    };
  }),
);
