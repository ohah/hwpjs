// Test-only independent CFB records and Python stdlib ZIP/XML. No product parser.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inflateRawSync, deflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
export const sha = (b) => createHash('sha256').update(b).digest('hex');
export function records(bytes) {
  const rows = [];
  for (let at = 0; at < bytes.length;) {
    assert(at + 4 <= bytes.length);
    const word = bytes.readUInt32LE(at);
    at += 4;
    let length = word >>> 20;
    if (length === 4095) {
      assert(at + 4 <= bytes.length);
      length = bytes.readUInt32LE(at);
      at += 4;
    }
    assert(length <= bytes.length - at);
    rows.push({
      tag: word & 1023,
      level: (word >>> 10) & 1023,
      bytes: Buffer.from(bytes.subarray(at, at + length)),
    });
    at += length;
  }
  return rows;
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
const raw = (r) => [r.tag, r.level, r.bytes.toString('hex')];
function archive(CFB, bytes) {
  const cfb = CFB.parse(Buffer.from(bytes)),
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
function h5Tables(rows) {
  const tables = [];
  for (let at = 0; at < rows.length; at++) {
    const ctrl = rows[at];
    if (ctrl.tag !== 71 || ctrl.bytes.subarray(0, 4).toString('hex') !== '206c6274') continue;
    let end = at + 1;
    while (end < rows.length && rows[end].level > ctrl.level) end++;
    const lists = [];
    let node;
    for (let i = at + 1; i < end; i++) {
      if (rows[i].level !== ctrl.level + 1) continue;
      if (rows[i].tag === 72) lists.push(i);
      if (rows[i].tag === 77) node = i;
    }
    assert(node !== undefined);
    const cells = lists.map((i, j) => {
      const list = rows[i],
        stop = lists[j + 1] ?? end;
      assert.equal(list.bytes.length, 34, 'PinnedObserved8Layout');
      const ps = [];
      for (let k = i + 1; k < stop; k++) {
        if (rows[k].tag === 66 && rows[k].level === list.level) ps.push({ start: k, stop });
      }
      ps.forEach((p, k) => {
        p.stop = ps[k + 1]?.start ?? stop;
      });
      assert.equal(list.bytes.readUInt16LE(0), ps.length, 'DeclaredParagraphCount');
      return {
        start: i,
        stop,
        ps,
        row: list.bytes.readUInt16LE(10),
        column: list.bytes.readUInt16LE(8),
        rowSpan: list.bytes.readUInt16LE(14),
        columnSpan: list.bytes.readUInt16LE(12),
        height: list.bytes.readUInt32LE(20),
      };
    });
    tables.push({
      start: at,
      end,
      node,
      rows: rows[node].bytes.readUInt16LE(4),
      columns: rows[node].bytes.readUInt16LE(6),
      height: ctrl.bytes.readUInt32LE(20),
      cells,
    });
    at = end - 1;
  }
  return tables;
}
export function h5Inspect(CFB, bytes) {
  const { cfb, streams, unpack } = archive(CFB, bytes);
  const chars = records(unpack(streams.get('DocInfo')))
    .filter((r) => r.tag === 21)
    .map((r, id) => ({
      id: String(id),
      bold: Boolean(r.bytes.readUInt32LE(46) & 2),
      italic: Boolean(r.bytes.readUInt32LE(46) & 1),
      raw: r.bytes.toString('hex'),
    }));
  const styles = new Map(chars.map((c) => [c.id, c])),
    tables = [],
    ids = [];
  for (const [name, b] of streams) {
    if (!/^BodyText\/Section\d+$/u.test(name)) continue;
    const rows = records(unpack(b));
    for (const r of rows) if (r.tag === 66) ids.push(String(r.bytes.readUInt32LE(18)));
    for (const t of h5Tables(rows))
      tables.push({
        ...t,
        section: Number(name.match(/\d+$/u)[0]),
        outside: [...rows.slice(0, t.start), ...rows.slice(t.end)].map(raw),
        cells: t.cells.map((c) => ({
          ...c,
          paragraphs: c.ps.map((p) => {
            const span = rows.slice(p.start, p.stop),
              h = span[0].bytes;
            const textRecord = span.find((r) => r.tag === 67),
              shape = span.find((r) => r.tag === 68);
            assert(shape && shape.bytes.length % 8 === 0);
            const text = textRecord?.bytes.toString('utf16le').replace(/\r$/u, '') ?? '',
              runs = [];
            for (let i = 0; i < shape.bytes.length; i += 8) {
              const run = {
                start: shape.bytes.readUInt32LE(i),
                id: String(shape.bytes.readUInt32LE(i + 4)),
              };
              assert(styles.has(run.id));
              assert(i === 0 ? run.start === 0 : run.start > runs.at(-1).start);
              runs.push(run);
            }
            const units = [];
            let ri = 0;
            for (let i = 0; i < text.length; i++) {
              while (ri + 1 < runs.length && runs[ri + 1].start <= i) ri++;
              const s = styles.get(runs[ri].id);
              units.push({ id: s.id, bold: s.bold, italic: s.italic });
            }
            return {
              id: String(h.readUInt32LE(18)),
              text,
              runs,
              units,
              format: h.subarray(4, 12).toString('hex'),
              highBit: h.readUInt32LE(0) >>> 31,
              raw: span.map(raw),
              body: span.filter((r) => r.tag === 67 || r.tag === 68).map(raw),
            };
          }),
        })),
      });
  }
  return {
    tables,
    ids,
    chars,
    metadata: Object.fromEntries(
      cfb.FileIndex.flatMap((e, i) =>
        e.type
          ? [
              [
                cfb.FullPaths[i],
                {
                  type: e.type,
                  CLSID: e.CLSID,
                  state: e.state,
                  ct: e.ct?.toISOString(),
                  mt: e.mt?.toISOString(),
                },
              ],
            ]
          : [],
      ),
    ),
    streams: Object.fromEntries([...streams].map(([n, b]) => [n, sha(b)])),
  };
}
export function h5Seed(CFB, bytes, highBits) {
  const a = archive(CFB, bytes),
    name = 'BodyText/Section0',
    rows = records(a.unpack(a.streams.get(name)));
  const t = h5Tables(rows).find(
    (t) =>
      t.rows >= 2 &&
      t.columns >= 2 &&
      t.cells.length === t.rows * t.columns &&
      t.cells.every((c) => c.rowSpan === 1 && c.columnSpan === 1),
  );
  assert(t, 'ApprovedSimpleTableRequired');
  let id = Math.max(...rows.filter((r) => r.tag === 66).map((r) => r.bytes.readUInt32LE(18))) + 1;
  const doc = records(a.unpack(a.streams.get('DocInfo'))),
    charRows = doc.filter((r) => r.tag === 21);
  assert.equal(charRows.length, 1, 'PinnedBaselineSingleCharacterStyle');
  const additions = [2, 1].map((flags) => {
    const bytes = Buffer.from(charRows[0].bytes);
    bytes.writeUInt32LE((bytes.readUInt32LE(46) | flags) >>> 0, 46);
    return { ...charRows[0], bytes };
  });
  const charAt = doc.indexOf(charRows[0]);
  doc.splice(charAt + 1, 0, ...additions);
  const mapping = doc.find((r) => r.tag === 17);
  assert.equal(mapping.bytes.readUInt32LE(36), 1);
  mapping.bytes.writeUInt32LE(3, 36);
  a.streams.set('DocInfo', a.pack(encode(doc)));
  const patches = new Map();
  rows[t.start].bytes.writeUInt32LE(t.rows * 7200, 20);
  for (const c of t.cells) {
    assert.equal(c.ps.length, 1);
    const list = rows[c.start];
    list.bytes.writeUInt16LE(3, 0);
    list.bytes.writeUInt32LE(7200, 20);
    const original = rows.slice(c.ps[0].start, c.ps[0].stop);
    assert(
      original.every((r) => [66, 67, 68, 69].includes(r.tag)),
      'PlainSeedOnly',
    );
    const replacement = [list];
    for (let p = 0; p < 3; p++) {
      const text = highBits === 'empty' && p < 2 ? '' : `R${c.row}C${c.column} P${p} 한글`;
      const h = Buffer.from(original[0].bytes);
      h.writeUInt32LE(
        ((text ? text.length + 1 : 0) + (p === 2 && highBits !== 'zero' ? 0x80000000 : 0)) >>> 0,
        0,
      );
      h.writeUInt32LE(p === 0 ? original[0].bytes.readUInt32LE(18) : id++, 18);
      h.writeUInt16LE(1, 12);
      h.writeUInt16LE(0, 14);
      h.writeUInt16LE(0, 16);
      const shape = Buffer.from(original.find((r) => r.tag === 68).bytes.subarray(0, 8));
      shape.writeUInt32LE(0);
      shape.writeUInt32LE(p, 4);
      replacement.push(
        { ...original[0], bytes: h },
        ...(text
          ? [{ tag: 67, level: original[0].level + 1, bytes: Buffer.from(text + '\r', 'utf16le') }]
          : []),
        { tag: 68, level: original[0].level + 1, bytes: shape },
      );
    }
    patches.set(c.start, { end: c.stop, replacement });
  }
  const out = [];
  for (let i = 0; i < rows.length;) {
    const patch = patches.get(i);
    if (patch) {
      out.push(...patch.replacement);
      i = patch.end;
    } else out.push(rows[i++]);
  }
  a.streams.set(name, a.pack(encode(out)));
  return repackTinyCfb(bytes, a.cfb, a.streams);
}
// Test fixture serializer: preserve approved directory bytes/tree/metadata; only relocate streams.
// MS-CFB v3, 512-byte sectors, 64-byte mini sectors; deliberately bounded to one FAT.
export function repackTinyCfb(original, cfb, streams) {
  assert.equal(original.readUInt16LE(30), 9);
  assert.equal(original.readUInt32LE(44), 1);
  const oldFat = original.subarray((original.readUInt32LE(76) + 1) * 512);
  const dirParts = [],
    seen = new Set();
  let sid = original.readUInt32LE(48);
  while (sid !== 0xfffffffe) {
    assert(sid < original.length / 512 - 1 && !seen.has(sid));
    seen.add(sid);
    dirParts.push(original.subarray((sid + 1) * 512, (sid + 2) * 512));
    sid = oldFat.readUInt32LE(sid * 4);
  }
  const directory = Buffer.from(Buffer.concat(dirParts)),
    minis = [],
    miniFatValues = [];
  cfb.FileIndex.forEach((entry, i) => {
    if (entry.type !== 2) return;
    const path = cfb.FullPaths[i].slice(cfb.FullPaths[0].length),
      content = streams.get(path);
    assert(content && content.length > 0 && content.length < 4096, 'TinyMiniStreamsOnly');
    // CFB parser FileIndex keeps original directory slot order.
    assert.equal(
      directory.subarray(i * 128, i * 128 + entry.name.length * 2).toString('utf16le'),
      entry.name,
    );
    const count = Math.ceil(content.length / 64),
      first = miniFatValues.length;
    directory.writeUInt32LE(first, i * 128 + 116);
    directory.writeBigUInt64LE(BigInt(content.length), i * 128 + 120);
    const padded = Buffer.alloc(count * 64);
    content.copy(padded);
    minis.push(padded);
    for (let j = 0; j < count; j++)
      miniFatValues.push(j + 1 === count ? 0xfffffffe : first + j + 1);
  });
  const mini = Buffer.concat(minis),
    dirCount = directory.length / 512,
    mfCount = Math.ceil((miniFatValues.length * 4) / 512),
    miniCount = Math.ceil(mini.length / 512);
  const fatId = dirCount + mfCount + miniCount;
  assert(fatId + 1 <= 128);
  const header = Buffer.from(original.subarray(0, 512));
  header.writeUInt32LE(0, 48);
  header.writeUInt32LE(dirCount, 60);
  header.writeUInt32LE(mfCount, 64);
  header.fill(0xff, 76);
  header.writeUInt32LE(fatId, 76);
  directory.writeUInt32LE(dirCount + mfCount, 116);
  directory.writeBigUInt64LE(BigInt(mini.length), 120);
  const miniFat = Buffer.alloc(mfCount * 512, 0xff);
  miniFatValues.forEach((v, i) => miniFat.writeUInt32LE(v, i * 4));
  const miniPadded = Buffer.alloc(miniCount * 512);
  mini.copy(miniPadded);
  const fat = Buffer.alloc(512, 0xff);
  for (const [first, count] of [
    [0, dirCount],
    [dirCount, mfCount],
    [dirCount + mfCount, miniCount],
  ])
    for (let i = 0; i < count; i++)
      fat.writeUInt32LE(i + 1 === count ? 0xfffffffe : first + i + 1, (first + i) * 4);
  fat.writeUInt32LE(0xfffffffd, fatId * 4);
  return Buffer.concat([header, directory, miniFat, miniPadded, fat]);
}
const python = String.raw`
import sys,io,json,zipfile,re,copy,hashlib,xml.etree.ElementTree as E
P='{http://www.hancom.co.kr/hwpml/2011/paragraph}';H='{http://www.hancom.co.kr/hwpml/2011/head}'
sha=lambda b:hashlib.sha256(b).hexdigest()
raw=sys.stdin.buffer.read();mode=sys.argv[1]
with zipfile.ZipFile(io.BytesIO(raw)) as z:
 assert z.testzip() is None
 assert len(z.namelist())==len(set(z.namelist()))
 entries=z.infolist();data={n:z.read(n) for n in z.namelist()}
header=E.fromstring(data['Contents/header.xml'])
chars=[dict(id=c.get('id'),bold=c.find(H+'bold') is not None,italic=c.find(H+'italic') is not None,raw=E.tostring(c).hex()) for c in header.iter(H+'charPr')];styles={c['id']:c for c in chars}
def spans(tag,b):return list(re.finditer(rb'<(?P<p>(?:[A-Za-z_][\w.-]*:)?)'+tag+rb'\b[^>]*>.*?</(?P=p)'+tag+rb'\s*>',b,re.S))
def attr(b,name,value):
 b,n=re.subn(rb'(\b'+name+rb'=")[^"]*"',lambda m:m[1]+str(value).encode()+b'"',b,count=1);assert n==1;return b
def seed(raw):
 root=E.fromstring(raw);ids=[int(p.get('id')) for p in root.iter(P+'p')];fresh=max(ids)+1
 ts=list(root.iter(P+'tbl'));ss=spans(b'tbl',raw);assert len(ts)==len(ss)
 target=next(i for i,t in enumerate(ts) if int(t.get('rowCnt'))>=2 and int(t.get('colCnt'))>=2)
 t=ts[target];s=ss[target];b=s[0];cells=spans(b'tc',b);pieces=[];at=0
 for c in cells:
  cb=c[0];e=E.fromstring(cb.replace(b'<hp:tc',b'<hp:tc xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"',1));a=e.find(P+'cellAddr')
  ps=spans(b'p',cb);assert len(ps)==1;old=ps[0][0];pfx=re.match(rb'<([\w.-]+:)?p\b',old)[1] or b''
  old=re.sub(rb'<(?:[\w.-]+:)?linesegarray\b[^>]*>.*?</(?:[\w.-]+:)?linesegarray\s*>',b'',old,flags=re.S)
  opening=old[:old.index(b'>')+1];run=e.find(P+'subList').find(P+'p').find(P+'run');sid=run.get('charPrIDRef');paras=[]
  for j in range(3):
   op=opening if j==0 else attr(opening,b'id',fresh);fresh+=j!=0
   text=f"R{a.get('rowAddr')}C{a.get('colAddr')} P{j} 한글".encode()
   paras.append(op+b'<'+pfx+b'run charPrIDRef="'+str(j).encode()+b'"><'+pfx+b't>'+text+b'</'+pfx+b't></'+pfx+b'run></'+pfx+b'p>')
  cb=cb[:ps[0].start()]+b''.join(paras)+cb[ps[0].end():]
  cb=re.sub(rb'<(?:[\w.-]+:)?cellSz\b[^>]*/>',lambda m:attr(m[0],b'height',7200),cb)
  cb=re.sub(rb'<(?:[\w.-]+:)?subList\b[^>]*>',lambda m:attr(m[0],b'textHeight',0) if b'textHeight=' in m[0] else m[0],cb)
  pieces.extend([b[at:c.start()],cb]);at=c.end()
 pieces.append(b[at:]);b=b''.join(pieces)
 b=re.sub(rb'<(?:[\w.-]+:)?sz\b[^>]*/>',lambda m:attr(m[0],b'height',int(t.get('rowCnt'))*7200),b,count=1)
 return raw[:s.start()]+b+raw[s.end():]
if mode=='seed':
 parent=next(e for e in header.iter() if e.tag==H+'charProperties');existing=parent.findall(H+'charPr');assert len(existing)==1
 for sid,kind in [(1,'bold'),(2,'italic')]:
  c=copy.deepcopy(existing[0]);c.set('id',str(sid));E.SubElement(c,H+kind);parent.append(c)
 parent.set('itemCnt','3');data['Contents/header.xml']=E.tostring(header,encoding='utf-8',xml_declaration=True)
 data['Contents/section0.xml']=seed(data['Contents/section0.xml']);out=io.BytesIO()
 with zipfile.ZipFile(out,'w') as z:
  for e in entries:z.writestr(e,data[e.filename])
 sys.stdout.buffer.write(out.getvalue());sys.exit()
tables=[];ids=[]
for name,b in data.items():
 if not re.fullmatch(r'Contents/section\d+\.xml',name):continue
 root=E.fromstring(b);ids.extend(p.get('id') for p in root.iter(P+'p'))
 for t,span in zip(root.iter(P+'tbl'),spans(b'tbl',b)):
  cells=[];rawcells=spans(b'tc',span[0]);elemcells=[c for tr in t.findall(P+'tr') for c in tr.findall(P+'tc')];assert len(rawcells)==len(elemcells)
  for c,rc in zip(elemcells,rawcells):
   a=c.find(P+'cellAddr');s=c.find(P+'cellSpan');size=c.find(P+'cellSz');ps=c.find(P+'subList').findall(P+'p');rps=spans(b'p',rc[0]);assert len(ps)==len(rps);paragraphs=[]
   for p,rp in zip(ps,rps):
    text='';runs=[];units=[]
    for run in p.findall(P+'run'):
     sid=run.get('charPrIDRef');assert sid in styles;value=''.join(x.text or '' for x in run.findall(P+'t'));runs.append(dict(start=len(text.encode('utf-16le'))//2,id=sid));text+=value
     units.extend([dict(id=sid,bold=styles[sid]['bold'],italic=styles[sid]['italic'])]*(len(value.encode('utf-16le'))//2))
    paragraphs.append(dict(id=p.get('id'),text=text,runs=runs,units=units,format={k:v for k,v in p.attrib.items() if k!='id'},raw=rp[0].hex(),body=[m[0].hex() for m in spans(b'run',rp[0])]))
   cells.append(dict(row=int(a.get('rowAddr')),column=int(a.get('colAddr')),rowSpan=int(s.get('rowSpan')),columnSpan=int(s.get('colSpan')),height=int(size.get('height')),paragraphs=paragraphs))
  tables.append(dict(section=int(re.search(r'\d+',name)[0]),rows=int(t.get('rowCnt')),columns=int(t.get('colCnt')),height=int(t.find(P+'sz').get('height')),cells=cells,outside=sha(b[:span.start()]+b'TARGET'+b[span.end():])))
print(json.dumps(dict(tables=tables,ids=ids,chars=chars,streams={n:sha(b) for n,b in data.items()})))
`;
function xml(bytes, mode) {
  const c = spawnSync('python3', ['-I', '-B', '-c', python, mode], {
    input: bytes,
    timeout: 15000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (c.error) throw c.error;
  assert.equal(c.status, 0, c.stderr.toString());
  return c.stdout;
}
export const hxSeed = (bytes) => xml(bytes, 'seed');
export const hxInspect = (bytes) => JSON.parse(xml(bytes, 'inspect'));

export const readNative = false;
const cellKey = (c) => `${c.row},${c.column}`;
const paragraphArrays = (t) =>
  t.cells.map((c) => ({
    row: c.row,
    column: c.column,
    rowSpan: c.rowSpan,
    columnSpan: c.columnSpan,
    paragraphs: c.paragraphs,
  }));
function stableOutside(before, after, { format, targetIndex = 0, headerMayGrow = false }) {
  assert.deepEqual(after.metadata, before.metadata, 'ContainerMetadataPreserved');
  assert.equal(after.tables.length, before.tables.length, 'TableCountPreserved');
  assert.deepEqual(
    after.tables[targetIndex].outside,
    before.tables[targetIndex].outside,
    'OutsideTargetTablePreserved',
  );
  for (let i = 0; i < before.tables.length; i++)
    if (i !== targetIndex)
      assert.deepEqual(
        paragraphArrays(after.tables[i]),
        paragraphArrays(before.tables[i]),
        'OtherTablePreserved',
      );
  const t = before.tables[targetIndex],
    changed = new Set(
      format === 'hwp5'
        ? [`BodyText/Section${t.section}`, ...(headerMayGrow ? ['DocInfo'] : [])]
        : [`Contents/section${t.section}.xml`, ...(headerMayGrow ? ['Contents/header.xml'] : [])],
    );
  assert.deepEqual(
    Object.keys(after.streams).sort(),
    Object.keys(before.streams).sort(),
    'PartNamesPreserved',
  );
  for (const [name, hash] of Object.entries(before.streams))
    if (!changed.has(name)) assert.equal(after.streams[name], hash, `NonTargetPart:${name}`);
  const chars = new Map(after.chars.map((c) => [c.id, c]));
  for (const c of before.chars)
    assert.deepEqual(chars.get(c.id), c, 'ExistingCharacterStyleBytesPreserved');
}
// Callers supply expected action/index; no product grid/parser algorithm is consulted.
export function assertGridTransition(
  before,
  after,
  { action, index, format, targetIndex = 0, templateIndex } = {},
) {
  assert(['insert-row', 'delete-row', 'insert-column', 'delete-column'].includes(action));
  const b = before.tables[targetIndex],
    a = after.tables[targetIndex],
    row = action.endsWith('row'),
    insert = action.startsWith('insert-');
  const limit = row ? b.rows : b.columns;
  assert(Number.isInteger(index) && index >= 0 && index < limit + (insert ? 1 : 0));
  assert.equal(a.rows, b.rows + (row ? (insert ? 1 : -1) : 0));
  assert.equal(a.columns, b.columns + (!row ? (insert ? 1 : -1) : 0));
  assert.equal(a.cells.length, a.rows * a.columns);
  assert(a.cells.every((c) => c.rowSpan === 1 && c.columnSpan === 1));
  const next = new Map(a.cells.map((c) => [cellKey(c), c]));
  assert.equal(next.size, a.cells.length, 'UniqueCellCoordinates');
  const beforeIds = new Set(before.ids),
    surviving = new Set();
  for (const c of b.cells) {
    if (!insert && (row ? c.row : c.column) === index) continue;
    const shift = (value) => value + (value >= index ? (insert ? 1 : -1) : 0);
    const key = `${row ? shift(c.row) : c.row},${row ? c.column : shift(c.column)}`,
      n = next.get(key);
    assert(n, 'SurvivingCellRequired');
    assert.deepEqual(
      n.paragraphs,
      c.paragraphs,
      'EveryParagraphRawBodyStyleIdOrderHighBitPreserved',
    );
    for (const p of c.paragraphs) surviving.add(p.id);
  }
  const added = a.cells.filter((c) => !beforeIds.has(c.paragraphs[0]?.id));
  assert.equal(added.length, insert ? (row ? b.columns : b.rows) : 0);
  const previous = new Map(b.cells.map((c) => [cellKey(c), c]));
  for (const c of added) {
    assert.equal(row ? c.row : c.column, index, 'InsertedCellAtRequestedIndex');
    assert.equal(c.paragraphs.length, 1, 'ExactlyOneNewParagraphPerCell');
    const p = c.paragraphs[0];
    assert.equal(p.text, '');
    assert(p.id && p.id !== '0' && !beforeIds.has(p.id), 'FreshNonzeroParagraphId');
    // Fixture policy may explicitly select templateIndex. All supplied seeds have equal first formatting/high-bit patterns across cells.
    const axis = templateIndex ?? Math.min(index, limit - 1),
      template = previous.get(`${row ? axis : c.row},${row ? c.column : axis}`);
    assert(template);
    assert.deepEqual(p.format, template.paragraphs[0].format, 'FirstTemplateParagraphFormat');
    assert.equal(p.runs[0].id, template.paragraphs[0].runs[0].id, 'FirstTemplateCharacterStyle');
    if (format === 'hwp5')
      assert.equal(
        p.highBit,
        template.paragraphs.at(-1).highBit,
        'OpaqueHighBitFromSuppliedTemplateTail',
      );
  }
  assert.equal(new Set(after.ids).size, after.ids.length, 'UniqueResultParagraphIds');
  assert.equal(
    after.ids.filter((id) => !beforeIds.has(id)).length,
    added.length,
    'OneNewIdPerInsertedCell',
  );
  for (const c of a.cells)
    for (const p of c.paragraphs)
      assert(surviving.has(p.id) || !beforeIds.has(p.id), 'DeletedParagraphAbsent');
  stableOutside(before, after, { format, targetIndex });
  return { insertedCells: added.length, survivingParagraphs: surviving.size };
}
export function assertArchiveEqual(before, after, { format } = {}) {
  if (Buffer.isBuffer(before) && Buffer.isBuffer(after)) {
    assert.deepEqual(after, before, 'ExactContainerBytes');
    return;
  }
  assert.deepEqual(after.streams, before.streams, `ExactArchivePayloads:${format}`);
  assert.deepEqual(after.ids, before.ids);
  assert.deepEqual(after.chars, before.chars);
  assert.deepEqual(after.metadata, before.metadata);
  assert.deepEqual(after.tables.map(paragraphArrays), before.tables.map(paragraphArrays));
}
export function assertTypingTransition(
  before,
  after,
  { format, targetIndex = 0, row, column, paragraph, unit, text } = {},
) {
  const b = before.tables[targetIndex],
    a = after.tables[targetIndex];
  assert.equal(a.rows, b.rows);
  assert.equal(a.columns, b.columns);
  const cells = new Map(a.cells.map((c) => [cellKey(c), c]));
  let changed = 0;
  for (const c of b.cells) {
    const n = cells.get(cellKey(c));
    assert(n);
    assert.equal(n.paragraphs.length, c.paragraphs.length);
    for (let i = 0; i < c.paragraphs.length; i++) {
      const p = c.paragraphs[i],
        q = n.paragraphs[i];
      if (c.row !== row || c.column !== column || i !== paragraph) {
        assert.deepEqual(q, p, 'UntouchedParagraphRawPreserved');
        continue;
      }
      changed++;
      assert(Number.isInteger(unit) && unit >= 0 && unit <= p.text.length);
      assert.equal(q.id, p.id);
      assert.deepEqual(q.format, p.format);
      assert.equal(q.highBit, p.highBit);
      assert.equal(q.text, p.text.slice(0, unit) + text + p.text.slice(unit));
      assert.deepEqual(q.units.slice(0, unit), p.units.slice(0, unit));
      assert.deepEqual(q.units.slice(unit + text.length), p.units.slice(unit));
      const inherited =
        p.units[Math.min(unit, p.units.length - 1)] ??
        (() => {
          const style = before.chars.find((c) => c.id === p.runs[0].id);
          assert(style);
          return { id: style.id, bold: style.bold, italic: style.italic };
        })();
      assert.deepEqual(
        q.units.slice(unit, unit + text.length),
        Array.from({ length: text.length }, () => inherited),
        'InsertedTextInheritsCharacterStyle',
      );
    }
  }
  assert.equal(changed, 1, 'ExactlyOneEditedParagraph');
  assert.deepEqual(after.ids, before.ids);
  stableOutside(before, after, { format, targetIndex });
}
