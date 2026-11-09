// Test-only CFB records / ZIP+XML inspection; never calls product parsers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, isAbsolute } from 'node:path';
import { runInNewContext } from 'node:vm';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const context = {
  module: { exports: {} },
  require: createRequire(import.meta.url),
  Buffer,
  process,
};
const oracleRoot = process.env.HWPJS_TEST_ORACLE_ROOT;
assert(oracleRoot && isAbsolute(oracleRoot));
const cfbSource = readFileSync(resolve(oracleRoot, 'legacy/cfb.js'));
assert.equal(sha(cfbSource), process.env.HWPJS_TEST_CFB_SHA256);
runInNewContext(cfbSource.toString('utf8'), context);
function records(bytes) {
  const rows = [];
  for (let offset = 0; offset < bytes.length;) {
    assert(offset + 4 <= bytes.length);
    const word = bytes.readUInt32LE(offset);
    offset += 4;
    let length = word >>> 20;
    if (length === 4095) {
      assert(offset + 4 <= bytes.length);
      length = bytes.readUInt32LE(offset);
      offset += 4;
    }
    assert(offset + length <= bytes.length);
    rows.push({
      tag: word & 1023,
      level: (word >>> 10) & 1023,
      bytes: bytes.subarray(offset, offset + length),
    });
    offset += length;
  }
  return rows;
}
const xml = `import sys,io,json,zipfile,hashlib,xml.etree.ElementTree as E
P='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as z:
 if z.testzip() is not None: raise ValueError('CRC')
 root=E.fromstring(z.read('Contents/section0.xml'))
 tables=[]
 for table in root.iter(P+'tbl'):
  cells=[]
  for tr in table.findall(P+'tr'):
   for tc in tr.findall(P+'tc'):
    a=tc.find(P+'cellAddr');s=tc.find(P+'cellSpan');size=tc.find(P+'cellSz');sub=tc.find(P+'subList');p=sub.find(P+'p')
    cells.append(dict(row=int(a.get('rowAddr')),column=int(a.get('colAddr')),rowSpan=int(s.get('rowSpan')),columnSpan=int(s.get('colSpan')),width=int(size.get('width')),height=int(size.get('height')),paragraphId=p.get('id'),text=''.join(t.text or '' for t in sub.iter(P+'t'))))
  tables.append(dict(instance=int(table.get('id')),rows=int(table.get('rowCnt')),columns=int(table.get('colCnt')),cells=cells))
 direct=set(root.findall(P+'p'))
 hosts=[dict(paragraph=i+1,text=''.join(t.text or '' for run in p.findall(P+'run') for t in run.findall(P+'t'))) for i,p in enumerate(root.iter(P+'p')) if p in direct]
 print(json.dumps(dict(tables=tables,hosts=hosts,streams={n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()})))`;
export function inspectCreatedGridArchive(bytes, format) {
  if (format === 'hwpx') {
    const result = spawnSync('python3', ['-I', '-B', '-c', xml], {
      input: bytes,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }
  assert.equal(format, 'hwp5');
  const parsed = context.module.exports.parse(bytes);
  const streams = new Map();
  parsed.FileIndex.forEach((entry, index) => {
    if (entry.type === 2)
      streams.set(
        parsed.FullPaths[index].slice(parsed.FullPaths[0].length),
        Buffer.from(entry.content),
      );
  });
  const source = streams.get('BodyText/Section0');
  assert(source);
  const rows = records(
    streams.get('FileHeader').readUInt32LE(36) & 1 ? inflateRawSync(source) : source,
  );
  const tables = [];
  const hosts = [];
  let ordinal = -1;
  for (let index = 0; index < rows.length; index++) {
    const header = rows[index];
    if (header.tag !== 66) continue;
    ordinal++;
    if (header.level !== 0) continue;
    let end = index + 1;
    while (end < rows.length && rows[end].level > 0) end++;
    const text = rows.slice(index + 1, end).find((r) => r.tag === 67 && r.level === 1);
    if (text) hosts.push({ paragraph: ordinal, text: text.bytes.toString('utf16le') });
  }
  for (let index = 0; index < rows.length; index++) {
    const ctrl = rows[index];
    if (ctrl.tag !== 71 || !ctrl.bytes.subarray(0, 4).equals(Buffer.from([32, 108, 98, 116])))
      continue;
    let end = index + 1;
    while (end < rows.length && rows[end].level > ctrl.level) end++;
    const children = rows.slice(index + 1, end);
    const definition = children.find((r) => r.tag === 77 && r.level === ctrl.level + 1);
    assert(definition);
    const lists = children.flatMap((r, i) =>
      r.tag === 72 && r.level === ctrl.level + 1 ? [i] : [],
    );
    const cells = lists.every((at) => [32, 34].includes(children[at].bytes.length))
      ? lists.map((at, i) => {
          const list = children[at];
          const span = children.slice(at + 1, lists[i + 1] ?? children.length);
          const header = span.find((r) => r.tag === 66 && r.level === list.level);
          const content = header && span.find((r) => r.tag === 67 && r.level === header.level + 1);
          const base = list.bytes.length - 26;
          assert(base === 6 || base === 8);
          return {
            column: list.bytes.readUInt16LE(base),
            row: list.bytes.readUInt16LE(base + 2),
            columnSpan: list.bytes.readUInt16LE(base + 4),
            rowSpan: list.bytes.readUInt16LE(base + 6),
            width: list.bytes.readUInt32LE(base + 8),
            height: list.bytes.readUInt32LE(base + 12),
            paragraphId: header?.bytes.length >= 22 ? String(header.bytes.readUInt32LE(18)) : null,
            text: content?.bytes.toString('utf16le').replace(/\r$/u, '') ?? null,
          };
        })
      : [];
    tables.push({
      raw: rows.slice(index, end).map((r) => [r.tag, r.level, r.bytes.toString('hex')]),
      instance: ctrl.bytes.readUInt32LE(36),
      rows: definition.bytes.readUInt16LE(4),
      columns: definition.bytes.readUInt16LE(6),
      cells,
    });
  }
  return {
    tables,
    hosts,
    streams: Object.fromEntries([...streams].map(([name, value]) => [name, sha(value)])),
  };
}
