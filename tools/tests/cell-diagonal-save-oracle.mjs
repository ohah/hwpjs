// Independent saved CFB/ZIP/XML assertions; no product parser/model/editor/writer imports.
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readLegacyCfbStreams } from '../cfb-stream-map.mjs';
import { records } from './table-appearance-save-oracle.mjs';
const widths = [10, 12, 15, 20, 25, 30, 40, 50, 60, 70, 100, 150, 200, 300, 400, 500];
const geometry = { none: 0, rising: 8, falling: 64, cross: 72 };
const swap = (n) => ((n & 255) << 16) | (n & 0xff00) | ((n >>> 16) & 255);
function document(input) {
  const streams = readLegacyCfbStreams(Buffer.from(input));
  const flags = streams.get('FileHeader').readUInt32LE(36);
  assert.equal(flags & 6, 0);
  const decode = (name) =>
    flags & 1
      ? inflateRawSync(streams.get(name), { maxOutputLength: 128 * 1024 * 1024 })
      : streams.get(name);
  const info = records(decode('DocInfo'));
  return { streams, decode, info, fills: info.filter((r) => r.tag === 20) };
}
function body(bytes) {
  const rows = records(bytes),
    stack = [];
  for (const [i, row] of rows.entries()) {
    while (stack.length && rows[stack.at(-1)].level >= row.level) stack.pop();
    row.parent = stack.at(-1);
    stack.push(i);
  }
  return rows;
}
function expectedPayload(source, edit) {
  const out = Buffer.from(source),
    d = edit.diagonal;
  const flags = out.readUInt16LE(0);
  assert.equal(flags & 0xff00, 0, 'basic source shape only');
  assert.ok([0, 2].includes((flags >>> 2) & 7) && [0, 2].includes((flags >>> 5) & 7));
  if (Object.hasOwn(d, 'directions')) {
    assert.ok(Object.hasOwn(geometry, d.directions));
    out.writeUInt16LE((flags & ~0xfc) | geometry[d.directions], 0);
  }
  if (Object.hasOwn(d, 'style')) out[26] = { NONE: 0, SOLID: 1, DOUBLE_SLIM: 8 }[d.style];
  if (Object.hasOwn(d, 'width')) {
    assert.ok(widths.includes(d.width));
    out[27] = widths.indexOf(d.width);
  }
  if (Object.hasOwn(d, 'color')) out.writeUInt32LE(swap(d.color), 28);
  if (edit.border)
    for (let i = 0; i < 4; i++)
      if (edit.border.edges & (1 << i)) out.writeUInt32LE(swap(edit.border.color), 4 + i * 6);
  if (edit.fill) {
    assert.equal(edit.fill.kind, 'solid');
    assert.equal(out.readUInt32LE(32), 1, 'original selected solid source');
    assert.equal(out.readInt32LE(44), -1);
    out.writeUInt32LE(swap(edit.fill.color), 36);
  }
  return out;
}
function h5(before, after, edits) {
  const old = document(before),
    next = document(after),
    sections = new Map(),
    clones = new Set(),
    keys = new Map();
  for (const edit of edits) {
    const target = edit.target,
      name = `BodyText/Section${target.section}`;
    const rows = body(old.decode(name)),
      current = body(next.decode(name));
    const cell = rows[target.listNode],
      table = rows[target.tableNode];
    assert.equal(table.tag, 77);
    assert.equal(cell.tag, 72);
    assert.equal(cell.parent, table.parent);
    assert.equal(rows[table.parent].tag, 71);
    const originalId = cell.payload.readUInt16LE(32),
      id = current[target.listNode].payload.readUInt16LE(32);
    const source = old.fills[originalId - 1].payload,
      expected = expectedPayload(source, edit);
    if (!sections.has(name)) sections.set(name, Buffer.from(old.decode(name)));
    if (expected.equals(source)) {
      assert.equal(id, originalId);
      continue;
    }
    assert.ok(id > old.fills.length && id <= next.fills.length);
    clones.add(id);
    const key = `${originalId}:${expected.toString('hex')}`;
    if (keys.has(key)) assert.equal(id, keys.get(key), 'same source and intent deduplicate');
    else keys.set(key, id);
    assert.deepEqual(
      next.fills[id - 1].payload,
      expected,
      'whole clone incl four sides, fill and opaque tail',
    );
    sections.get(name).writeUInt16LE(id, cell.payloadStart + 32);
  }
  assert.equal(next.fills.length, old.fills.length + clones.size);
  const retained = next.info.filter(
    (r) => r.tag !== 20 || next.fills.indexOf(r) < old.fills.length,
  );
  assert.equal(retained.length, old.info.length);
  for (const [i, row] of old.info.entries()) {
    const expected = Buffer.from(row.raw);
    if (row.tag === 17)
      expected.writeUInt32LE(next.fills.length, row.payloadStart - row.start + 32);
    assert.deepEqual(retained[i].raw, expected, `original DocInfo/font/resource ${i}`);
  }
  assert.deepEqual([...next.streams.keys()].sort(), [...old.streams.keys()].sort());
  for (const [name, value] of old.streams) {
    if (name === 'DocInfo') continue;
    if (sections.has(name))
      assert.deepEqual(next.decode(name), sections.get(name), 'only selected LIST_HEADER refs');
    else assert.deepEqual(next.streams.get(name), value, `non-target stream ${name}`);
  }
  return { owners: edits.length, clones: clones.size, originalResources: old.fills.length };
}
const python = String.raw`
import sys,json,copy,importlib.util
from decimal import Decimal
spec=importlib.util.spec_from_file_location('reader',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
r=json.load(sys.stdin);old=m.archive(r['before']);new=m.archive(r['after']);need=m.require;H,C=m.HEAD,m.CORE
need(list(old)==list(new),'ZIP entry set/order');head=m.parse(old['Contents/header.xml']);nh=m.parse(new['Contents/header.xml'])
container=m.one(list(head['root'].iter('{'+H+'}borderFills')),'old container');nc=m.one(list(nh['root'].iter('{'+H+'}borderFills')),'new container');oldids={e.attrib['id'] for e in container};added=[e for e in nc if e.attrib['id'] not in oldids]
need(len(oldids)==len(container),'old unique IDs');need(int(nc.attrib['itemCnt'])==len(nc),'new count');sections={};clones={};dedup={}
for edit in r['edits']:
 target=edit['target'];o=m.original(r['before'],target);name=o['sectionName'];current=m.parse(new[name]);index=o['cellIndex'];ref=current['elements'][index].attrib['borderFillIDRef'];d=edit['diagonal']
 need(ref not in oldids,'changed diagonal uses new clone');actual=m.one([e for e in added if e.attrib['id']==ref],'one new clone');expected=copy.deepcopy(o['source']);expected.set('id',ref);expected.tail=None
 need(expected.get('centerLine')=='NONE','known centerLine');slash=m.one([e for e in expected if e.tag=='{'+H+'}slash'],'slash');back=m.one([e for e in expected if e.tag=='{'+H+'}backSlash'],'backSlash')
 for e in (slash,back):need(e.get('type') in ('NONE','CENTER') and e.get('Crooked')=='0' and e.get('isCounter')=='0','known basic source')
 if 'directions' in d:
  direction=d['directions'];need(direction in ('none','rising','falling','cross'),'basic request');slash.set('type','CENTER' if direction in ('rising','cross') else 'NONE');back.set('type','CENTER' if direction in ('falling','cross') else 'NONE')
 stroke=m.one([e for e in expected if e.tag=='{'+H+'}diagonal'],'original diagonal stroke');changed_colors=set();changed_widths=set()
 if 'style' in d:stroke.set('type',d['style'])
 if 'width' in d:stroke.set('width',str(Decimal(d['width'])/100)+' mm');changed_widths.add(stroke.tag)
 if 'color' in d:stroke.set('color','#%06x'%d['color']);changed_colors.add((stroke.tag,'color'))
 border=edit.get('border')
 if border:
  for i,label in enumerate(('leftBorder','rightBorder','topBorder','bottomBorder')):
   if border['edges'] & (1<<i):
    e=m.one([e for e in expected if e.tag=='{'+H+'}'+label],'edge');e.set('color','#%06x'%border['color']);changed_colors.add((e.tag,'color'))
 fill=edit.get('fill')
 if fill:
  need(fill['kind']=='solid','solid request');brush=m.one([e for e in expected if e.tag=='{'+C+'}fillBrush'],'original brush');win=m.one(list(brush),'original winBrush');need(win.tag=='{'+C+'}winBrush','solid source');color=m.swap(fill['color']) if o['encoding']=='colorref24' else fill['color'];win.set('faceColor','#%06x'%color);changed_colors.add((win.tag,'faceColor'))
 actual_nodes=list(actual.iter());expected_nodes=list(expected.iter());need(len(actual_nodes)==len(expected_nodes),'clone child count')
 for got,want in zip(actual_nodes,expected_nodes):
  need(got.tag==want.tag,'clone tags')
  for tag,key in changed_colors:
   if want.tag==tag:need(m.hexcolor(got.get(key))==m.hexcolor(want.get(key)),'color mismatch');want.set(key,got.get(key))
  if want.tag in changed_widths:need(Decimal(got.get('width').removesuffix(' mm'))==Decimal(want.get('width').removesuffix(' mm')),'width mismatch');want.set('width',got.get('width'))
 need(m.tree(actual)==m.tree(expected),'whole clone: geometry flags/fill/sides/opaque attrs retained')
 identity=copy.deepcopy(expected);identity.set('id','expected');key=(o['sourceRef'],m.tree(identity))
 if key in dedup:need(dedup[key]==ref,'same intent dedup')
 else:dedup[key]=ref
 if ref in clones:need(m.tree(clones[ref])==m.tree(expected),'distinct intents alias')
 clones[ref]=expected
 if name not in sections:sections[name]=(o['section'],[])
 sections[name][1].append(m.attr_change(o['section'],index,'borderFillIDRef',ref))
need(len(added)==len(clones),'no unused clone')
for original in container:
 retained=m.one([e for e in nc if e.attrib['id']==original.attrib['id']],'old retained');need(m.raw_node(head,head['elements'].index(original))==m.raw_node(nh,nh['elements'].index(retained)),'old resource raw bytes')
expected_head=copy.deepcopy(nh['root']);ec=m.one(list(expected_head.iter('{'+H+'}borderFills')),'expected BF')
for e in list(ec):
 if e.attrib['id'] not in oldids:ec.remove(e)
ec.set('itemCnt',container.get('itemCnt'));need(m.tree(expected_head)==m.tree(head['root']),'full old header/font tree')
ci=head['elements'].index(container);insert=head['nodes'][ci]['closeStart'];newbytes=b''.join(m.raw_node(nh,nh['elements'].index(e)) for e in added)
need(new['Contents/header.xml']==m.splice(head['raw'],[m.attr_change(head,ci,'itemCnt',len(nc)),(insert,insert,newbytes)]),'only BF count and new clone header bytes')
for name,value in old.items():
 if name=='Contents/header.xml':continue
 if name in sections:need(new[name]==m.splice(value,sections[name][1]),'only selected cell refs')
 else:need(new[name]==value,'unrelated ZIP part '+name)
print(json.dumps({'owners':len(r['edits']),'clones':len(clones),'originalResources':len(container)}))
`;
let outputBytes = 0;
export function verifyCellDiagonalSaved({ format, before, after, edits }) {
  assert.ok(Array.isArray(edits) && edits.length > 0 && edits.length <= 4096);
  assert.equal(
    new Set(edits.map(({ target }) => `${target.section}:${target.listNode}`)).size,
    edits.length,
  );
  if (format === 'hwp5') return h5(before, after, edits);
  assert.equal(format, 'hwpx');
  const child = spawnSync(
    'python3',
    ['-B', '-c', python, fileURLToPath(new URL('./cell-border-hwpx-oracle.py', import.meta.url))],
    {
      input: JSON.stringify({
        before: Buffer.from(before).toString('base64'),
        after: Buffer.from(after).toString('base64'),
        edits,
      }),
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    },
  );
  outputBytes += Buffer.byteLength(child.stdout ?? '') + Buffer.byteLength(child.stderr ?? '');
  assert.ok(outputBytes <= 2 * 1024 * 1024, 'aggregate child output limit');
  if (child.error) throw child.error;
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}
