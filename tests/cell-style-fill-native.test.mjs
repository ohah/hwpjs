// Explicit new-WASM grant only. SDK setter paths + independent saved CFB/ZIP/XML oracles.
import assert from 'node:assert/strict';
import test from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  fixture,
  targets,
  owner,
  openSDK,
  saveSDK,
  receipt,
  artifact,
} from '../tools/tests/table-appearance-native-context.mjs';
import { readLegacyCfbStreams } from '../tools/cfb-stream-map.mjs';
import { records } from '../tools/tests/table-appearance-save-oracle.mjs';
import { inspectCellBorderOriginal } from '../tools/tests/cell-border-save-oracle.mjs';
import { hwp5TableBorderPaintPlan } from '../web/preview/hwp5-table-border-plan.mjs';

const options = { maxEntries: 12, maxCheckpointBytes: 8 * 1024 * 1024 };
const swap = (n) => ((n & 255) << 16) | (n & 0xff00) | ((n >>> 16) & 255);
// Independent official six-swatch names, deliberately not the wire enum order.
const h5Hatches = {
  HORIZONTAL: 0,
  VERTICAL: 1,
  SLASH: 2,
  BACK_SLASH: 3,
  CROSS: 4,
  CROSS_DIAGONAL: 5,
};
const fillCases = {
  none: { kind: 'none' },
  solid: { kind: 'solid', color: 0 },
  hatch: { kind: 'hatch', face: 0x123456, hatch: 0xabcdef, style: 'SLASH' },
  linear: {
    kind: 'linear',
    colors: [0xff0000, 0x0000ff],
    angle: 91,
    centerX: 25,
    centerY: 75,
    step: 2,
    stepCenter: 40,
  },
};
function h5Document(input) {
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
function verifyH5Fill(payload, expected) {
  const flags = payload.readUInt32LE(32);
  if (expected.kind === 'none') assert.equal(flags, 0);
  else if (expected.kind === 'solid' || expected.kind === 'hatch') {
    assert.equal(flags, 1);
    assert.equal(
      swap(payload.readUInt32LE(36)),
      expected.kind === 'solid' ? expected.color : expected.face,
    );
    if (expected.kind === 'hatch') assert.equal(swap(payload.readUInt32LE(40)), expected.hatch);
    assert.equal(
      payload.readInt32LE(44),
      expected.kind === 'solid' ? -1 : h5Hatches[expected.style],
    );
  } else {
    assert.equal(flags, 4);
    assert.equal(payload[36], 1, 'linear gradient type');
    assert.deepEqual(
      Array.from({ length: 5 }, (_, i) => payload.readUInt32LE(37 + i * 4)),
      [expected.angle, expected.centerX, expected.centerY, expected.step, 2],
    );
    assert.deepEqual(
      [swap(payload.readUInt32LE(57)), swap(payload.readUInt32LE(61))],
      expected.colors,
    );
    assert.equal(payload.readUInt32LE(65), 1, 'one additional center byte');
    assert.equal(payload[69], expected.stepCenter);
  }
}
function verifyH5(before, after, edits) {
  const old = h5Document(before),
    next = h5Document(after);
  const sections = new Map(),
    refs = new Set();
  for (const { target, border, fill } of edits) {
    const name = `BodyText/Section${target.section}`;
    const body = records(old.decode(name)),
      current = records(next.decode(name));
    const cell = body[target.listNode],
      nextCell = current[target.listNode];
    assert.equal(body[target.tableNode].tag, 77);
    assert.equal(cell.tag, 72);
    assert.equal(cell.level, body[target.tableNode].level);
    const oldRef = cell.payload.readUInt16LE(32),
      ref = nextCell.payload.readUInt16LE(32);
    assert.ok(
      ref > old.fills.length && ref <= next.fills.length,
      'changed cell uses appended resource',
    );
    refs.add(ref);
    const source = old.fills[oldRef - 1].payload,
      clone = next.fills[ref - 1].payload;
    const prefix = Buffer.from(source.subarray(0, 32));
    if (border)
      for (let i = 0; i < 4; i++)
        if (border.edges & (1 << i)) prefix.writeUInt32LE(swap(border.color), 4 + i * 6);
    assert.deepEqual(
      clone.subarray(0, 32),
      prefix,
      'sparse color preserves every source style/width and other prefix bytes',
    );
    if (fill) verifyH5Fill(clone, fill);
    else
      assert.deepEqual(
        clone.subarray(32),
        source.subarray(32),
        'border-only preserves complete fill bytes',
      );
    if (!sections.has(name)) sections.set(name, Buffer.from(old.decode(name)));
    sections.get(name).writeUInt16LE(ref, cell.payloadStart + 32);
  }
  assert.equal(next.fills.length, old.fills.length + refs.size, 'only live resource clones');
  const retained = next.info.filter(
    (r) => r.tag !== 20 || next.fills.indexOf(r) < old.fills.length,
  );
  assert.equal(retained.length, old.info.length);
  old.info.forEach((r, i) => {
    const expected = Buffer.from(r.raw);
    if (r.tag === 17) expected.writeUInt32LE(next.fills.length, r.payloadStart - r.start + 32);
    assert.deepEqual(retained[i].raw, expected, `original DocInfo/font/resource record ${i}`);
  });
  assert.deepEqual([...next.streams.keys()].sort(), [...old.streams.keys()].sort());
  for (const [name, raw] of old.streams) {
    if (name === 'DocInfo') continue;
    if (sections.has(name))
      assert.deepEqual(
        next.decode(name),
        sections.get(name),
        'only selected cell reference bytes change',
      );
    else assert.deepEqual(next.streams.get(name), raw, `untouched stream ${name}`);
  }
  return { owners: edits.length, clones: refs.size, originalResources: old.fills.length };
}

// Python stdlib ZIP/ElementTree/Expat oracle, sharing only the existing independent XML reader.
const hxOracle = String.raw`
import sys,json,importlib.util,copy
from pathlib import Path
s=importlib.util.spec_from_file_location('oracle',Path(sys.argv[1]));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
r=json.load(sys.stdin);old=m.archive(r['before']);new=m.archive(r['after']);need=m.require
need(list(old)==list(new),'ZIP entry order/set')
H,C=m.HEAD,m.CORE
head=m.parse(old['Contents/header.xml']);nexthead=m.parse(new['Contents/header.xml'])
container=m.one(list(head['root'].iter('{'+H+'}borderFills')),'old BF container');nc=m.one(list(nexthead['root'].iter('{'+H+'}borderFills')),'new BF container')
oldfills=list(container);oldids={x.attrib['id'] for x in oldfills};added=[x for x in nc if x.attrib['id'] not in oldids]
need(int(nc.attrib['itemCnt'])==len(nc),'BF count');refs=set();sections={}
for edit in r['edits']:
 target=edit['target'];o=m.original(r['before'],target);name=o['sectionName'];current=m.parse(new[name]);cell=o['cellIndex'];ref=current['elements'][cell].attrib['borderFillIDRef']
 clone=m.one([x for x in added if x.attrib['id']==ref],'unique selected clone');refs.add(ref)
 expected=copy.deepcopy(o['source']);expected.set('id',ref);expected.tail=None
 border=edit.get('border')
 if border:
  for i,label in enumerate(('leftBorder','rightBorder','topBorder','bottomBorder')):
   if border['edges'] & (1<<i):
    want=m.one([x for x in expected if x.tag=='{'+H+'}'+label],'old edge');actual=m.one([x for x in clone if x.tag==want.tag],'new edge')
    need(m.hexcolor(actual.attrib['color'])==border['color'],'canonical border RGB');want.set('color',actual.attrib['color'])
 fill=edit.get('fill')
 if fill is not None:
  brushes=[x for x in clone if x.tag=='{'+C+'}fillBrush'];kind=fill['kind']
  for x in list(expected):
   if x.tag=='{'+C+'}fillBrush':expected.remove(x)
  if kind=='none':need(not brushes,'none must remove brush')
  else:
   brush=m.one(brushes,'one fill brush');child=m.one(list(brush),'one variant');encoding=o['encoding']
   def color(text):
    n=m.hexcolor(text);return m.swap(n) if encoding=='colorref24' else n
   if kind=='solid':need(child.tag=='{'+C+'}winBrush' and color(child.attrib['faceColor'])==fill['color'] and child.attrib.get('hatchStyle','NONE')=='NONE','solid fill')
   elif kind=='hatch':need(child.tag=='{'+C+'}winBrush' and color(child.attrib['faceColor'])==fill['face'] and color(child.attrib['hatchColor'])==fill['hatch'] and child.attrib['hatchStyle']==fill['style'],'hatch semantics')
   else:
    need(child.tag=='{'+C+'}gradation' and child.attrib['type']=='LINEAR','linear type')
    for key in ('angle','centerX','centerY','step','stepCenter'):need(int(child.attrib[key])==fill[key],'linear '+key)
    need(int(child.attrib['colorNum'])==2,'two source colors');need([color(x.attrib['value']) for x in child]==fill['colors'],'source colors not generated stops')
   expected.append(copy.deepcopy(brush))
 need(m.tree(clone)==m.tree(expected),'clone preserves other fields and all source border widths/styles')
 if name not in sections:sections[name]=[o['section'],[]]
 sections[name][1].append(m.attr_change(o['section'],cell,'borderFillIDRef',ref))
need(len(refs)==len(added),'no unused clone')
for of in oldfills:
 nf=m.one([x for x in nc if x.attrib['id']==of.attrib['id']],'old resource retained');need(m.raw_node(head,head['elements'].index(of))==m.raw_node(nexthead,nexthead['elements'].index(nf)),'original resource bytes')
expectedhead=copy.deepcopy(nexthead['root']);ec=m.one(list(expectedhead.iter('{'+H+'}borderFills')),'expected container')
for x in list(ec):
 if x.attrib['id'] not in oldids:ec.remove(x)
ec.set('itemCnt',container.attrib['itemCnt']);need(m.tree(expectedhead)==m.tree(head['root']),'other full header/font/resource tree')
ci=head['elements'].index(container);insert=head['nodes'][ci]['closeStart'];clones=b''.join(m.raw_node(nexthead,nexthead['elements'].index(x)) for x in added)
need(new['Contents/header.xml']==m.splice(head['raw'],[m.attr_change(head,ci,'itemCnt',len(nc)),(insert,insert,clones)]),'only header count and appended clone bytes')
for name,data in old.items():
 if name=='Contents/header.xml':continue
 if name in sections:need(new[name]==m.splice(data,sections[name][1]),'only selected section ref bytes')
 else:need(new[name]==data,'unrelated ZIP entry '+name)
print(json.dumps({'owners':len(r['edits']),'clones':len(added),'originalResources':len(oldfills)}))
`;
let oracleOutput = 0;
function verifySaved(format, before, after, edits) {
  if (format === 'hwp5') return verifyH5(before, after, edits);
  const child = spawnSync(
    'python3',
    ['-B', '-c', hxOracle, resolve('tools/tests/cell-border-hwpx-oracle.py')],
    {
      input: JSON.stringify({
        before: before.toString('base64'),
        after: after.toString('base64'),
        edits,
      }),
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    },
  );
  oracleOutput += Buffer.byteLength(child.stdout ?? '') + Buffer.byteLength(child.stderr ?? '');
  assert.ok(oracleOutput <= 2 * 1024 * 1024, 'aggregate oracle output budget');
  if (child.error) throw child.error;
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}
function verifyH5NativePaint(sdk, edits) {
  const styles = sdk.borderFillSources();
  const results = [];
  for (const { target, fill } of edits) {
    if (!fill) continue;
    const cells = sdk.cellLayoutSources(target.section);
    const selected = cells.filter(
      (cell) => cell.table_record_node === target.tableNode && cell.list_node === target.listNode,
    );
    assert.equal(selected.length, 1, 'actual Native current cell DTO owner');
    const sources = styles.filter((style) => style.id === selected[0].border_fill_id);
    assert.equal(sources.length, 1, 'actual Native current resource DTO binding');
    const source = sources[0],
      plan = hwp5TableBorderPaintPlan(source);
    assert.notEqual(plan.state, 'unavailable', JSON.stringify({ source, plan }));
    const css = (color) => `#${color.toString(16).padStart(6, '0')}`;
    if (fill.kind === 'none') assert.equal(plan.fill, undefined, 'no fill paint for explicit none');
    if (fill.kind === 'solid') {
      assert.equal(plan.fill?.state, 'solid');
      assert.equal(plan.fill.color, css(fill.color));
    }
    if (fill.kind === 'hatch') {
      assert.equal(plan.fill?.state, 'pattern');
      assert.equal(plan.fill.kind, fill.style);
      assert.equal(plan.fill.background, css(fill.face));
      assert.equal(plan.fill.color, css(fill.hatch));
      assert.equal(
        source.pattern.kind,
        h5Hatches[fill.style],
        'official H5 raw hatch ordinal, SLASH=2',
      );
    }
    if (fill.kind === 'linear') {
      assert.equal(source.additional_bytes, 1, 'actual Native center-byte extension');
      assert.equal(plan.fill?.state, 'linear_gradient');
      assert.equal(plan.fill.angle, fill.angle);
      assert.equal(plan.fill.stops[0].color, css(fill.colors[0]));
      assert.equal(plan.fill.stops.at(-1).color, css(fill.colors[1]));
      assert.equal(
        plan.fill.stops.length,
        4,
        'two source colors with step2 produce four paint stops',
      );
    }
    results.push({
      resourceId: source.id,
      additionalBytes: source.additional_bytes,
      fill: plan.fill ?? null,
    });
  }
  return results;
}
async function roundTrip(format, sdk, input, call, edits, name) {
  sdk.enableHistory(options);
  const initial = saveSDK(format, sdk),
    initialRevision = sdk.historyRevision();
  call();
  assert.notEqual(sdk.historyRevision(), initialRevision);
  assert.equal(
    sdk.historyRevisions().length,
    2,
    'one atomic event for both owners and both fields',
  );
  const saved = saveSDK(format, sdk),
    revision = sdk.historyRevision();
  const independent = verifySaved(format, input, saved, edits);
  const actualNativePaint = format === 'hwp5' ? verifyH5NativePaint(sdk, edits) : undefined;
  const wrong = structuredClone(edits);
  if (wrong[0].border) wrong[0].border.color ^= 1;
  else if (wrong[0].fill.kind === 'none') wrong[0].fill = { kind: 'solid', color: 0 };
  else if (wrong[0].fill.kind === 'solid') wrong[0].fill.color ^= 1;
  else if (wrong[0].fill.kind === 'hatch') wrong[0].fill.style = 'BACK_SLASH';
  else wrong[0].fill.colors[0] ^= 1;
  assert.throws(
    () => verifySaved(format, input, saved, wrong),
    'independent oracle rejects wrong semantic expectation',
  );
  call();
  assert.equal(sdk.historyRevision(), revision, 'same request is no-op');
  assert.equal(sdk.historyRevisions().length, 2);
  assert.deepEqual(saveSDK(format, sdk), saved);
  assert.equal(sdk.undo(), true);
  assert.deepEqual(saveSDK(format, sdk), initial);
  assert.equal(sdk.undo(), false);
  assert.equal(sdk.redo(), true);
  assert.deepEqual(saveSDK(format, sdk), saved);
  assert.equal(sdk.redo(), false);
  const reopened = await openSDK(format, saved);
  try {
    assert.deepEqual(saveSDK(format, reopened), saved);
  } finally {
    reopened.close();
  }
  return {
    independent,
    actualNativePaint,
    atomicHistory: true,
    saveReopen: true,
    output: artifact(name, saved),
  };
}
for (const format of ['hwp5', 'hwpx']) {
  const ext = format === 'hwp5' ? 'hwp' : 'hwpx';
  test(
    `${format} actual JS setCellStyles sparse color keeps mixed source styles and widths`,
    receipt(`${format}-new-styles-sparse`, async () => {
      const input = fixture(format),
        sdk = await openSDK(format, input);
      try {
        const borders = targets[format].map((target, i) => ({
          ...owner(target),
          edges: i ? 10 : 5,
          color:
            inspectCellBorderOriginal({ format, before: input, target }).edges[i ? 1 : 0].color ^
            0xffffff,
        }));
        return await roundTrip(
          format,
          sdk,
          input,
          () => sdk.setCellStyles({ borders, fills: [] }),
          borders.map((border, i) => ({ target: targets[format][i], border })),
          `${format}-sparse.${ext}`,
        );
      } finally {
        sdk.close();
      }
    }),
  );
  for (const [kind, fill] of Object.entries(fillCases)) {
    test(
      `${format} actual JS setCellFills ${kind} saved oracle and atomic history`,
      receipt(`${format}-new-fill-${kind}`, async () => {
        const input = fixture(format),
          sdk = await openSDK(format, input);
        try {
          // The first original is filled; the second original is already none.
          // Explicit none uses the filled owner instead of pretending a no-op clones a resource.
          const selected = kind === 'none' ? targets[format].slice(0, 1) : targets[format];
          const fills = selected.map((target) => ({
            ...owner(target),
            fill: structuredClone(fill),
          }));
          return await roundTrip(
            format,
            sdk,
            input,
            () => sdk.setCellFills(fills),
            fills.map((row, i) => ({ target: targets[format][i], fill: row.fill })),
            `${format}-fill-${kind}.${ext}`,
          );
        } finally {
          sdk.close();
        }
      }),
    );
  }
  test(
    `${format} actual JS setCellStyles merges sparse border and hatch into one history event`,
    receipt(`${format}-new-styles-combined`, async () => {
      const input = fixture(format),
        sdk = await openSDK(format, input);
      try {
        const borders = targets[format].map((target) => ({
          ...owner(target),
          edges: 15,
          color: 0,
        }));
        const fills = targets[format].map((target) => ({
          ...owner(target),
          fill: structuredClone(fillCases.hatch),
        }));
        return await roundTrip(
          format,
          sdk,
          input,
          () => sdk.setCellStyles({ borders, fills }),
          fills.map((row, i) => ({
            target: targets[format][i],
            fill: row.fill,
            border: borders[i],
          })),
          `${format}-combined.${ext}`,
        );
      } finally {
        sdk.close();
      }
    }),
  );
  test(
    `${format} actual JS setters invalid last owner roll back and empty noops retain redo`,
    receipt(`${format}-new-styles-rollback`, async () => {
      const input = fixture(format),
        sdk = await openSDK(format, input);
      try {
        sdk.enableHistory(options);
        const borders = targets[format].map((target) => ({
          ...owner(target),
          edges: 15,
          color: 0x987654,
        }));
        const fills = targets[format].map((target) => ({
          ...owner(target),
          fill: structuredClone(fillCases.linear),
        }));
        sdk.setCellStyles({ borders, fills });
        const changed = saveSDK(format, sdk);
        assert.equal(sdk.undo(), true);
        const before = saveSDK(format, sdk),
          revision = sdk.historyRevision(),
          history = sdk.historyRevisions();
        const invalidFill = { ...fills[1], listNode: 0xfffffffe };
        const invalidBorder = { ...borders[1], tableNode: 0xfffffffe };
        for (const apply of [
          () => sdk.setCellFills([fills[0], invalidFill]),
          () => sdk.setCellStyles({ borders, fills: [fills[0], invalidFill] }),
          () => sdk.setCellStyles({ borders: [borders[0], invalidBorder], fills: [] }),
        ]) {
          assert.throws(apply);
          assert.deepEqual(saveSDK(format, sdk), before);
          assert.equal(sdk.historyRevision(), revision);
          assert.deepEqual(sdk.historyRevisions(), history);
        }
        sdk.setCellStyles({ borders: [], fills: [] });
        sdk.setCellFills([]);
        assert.deepEqual(saveSDK(format, sdk), before);
        assert.equal(sdk.historyRevision(), revision);
        assert.deepEqual(sdk.historyRevisions(), history);
        assert.equal(sdk.redo(), true, 'late rejection and noops must preserve redo');
        assert.deepEqual(saveSDK(format, sdk), changed);
        return { invalidLastOwnerCases: 3, emptyNoops: 2, redoPreserved: true };
      } finally {
        sdk.close();
      }
    }),
  );
}

for (const format of ['hwp5', 'hwpx']) {
  test(
    `${format} both actual JS setters also publish without enabled history`,
    receipt(`${format}-new-setters-no-history`, async () => {
      const input = fixture(format),
        target = targets[format][0];
      const observations = [];
      for (const combined of [false, true]) {
        const sdk = await openSDK(format, input);
        try {
          const fill = structuredClone(fillCases.linear);
          const border = { ...owner(target), edges: 15, color: 0 };
          const fills = [{ ...owner(target), fill }];
          if (combined) sdk.setCellStyles({ borders: [border], fills });
          else sdk.setCellFills(fills);
          const saved = saveSDK(format, sdk);
          observations.push(
            verifySaved(format, input, saved, [{ target, fill, ...(combined ? { border } : {}) }]),
          );
          const reopened = await openSDK(format, saved);
          try {
            assert.deepEqual(saveSDK(format, reopened), saved);
          } finally {
            reopened.close();
          }
        } finally {
          sdk.close();
        }
      }
      return { noHistory: true, setters: ['setCellFills', 'setCellStyles'], observations };
    }),
  );
}

test(
  'hwp5 pending hatch foreground survives solid on an original no-fill cell',
  receipt('hwp5-pending-hatch-solid', async () => {
    const format = 'hwp5',
      input = fixture(format),
      target = targets.hwp5[1];
    const original = h5Document(input);
    const cell = records(original.decode('BodyText/Section0'))[target.listNode];
    const originalFill = original.fills[cell.payload.readUInt16LE(32) - 1].payload;
    assert.equal(originalFill.readUInt32LE(32), 0, 'explicit original no-fill source');
    const sdk = await openSDK(format, input);
    try {
      sdk.enableHistory(options);
      const hatch = { kind: 'hatch', face: 0x123456, hatch: 0xabcdef, style: 'SLASH' };
      sdk.setCellFills([{ ...owner(target), fill: hatch }]);
      const hatched = saveSDK(format, sdk);
      sdk.setCellFills([{ ...owner(target), fill: { kind: 'solid', color: 0x2468ac } }]);
      const saved = saveSDK(format, sdk),
        doc = h5Document(saved);
      const activeCell = records(doc.decode('BodyText/Section0'))[target.listNode];
      const payload = doc.fills[activeCell.payload.readUInt16LE(32) - 1].payload;
      const observed = {
        foreground: swap(payload.readUInt32LE(40)),
        expectedCurrentHatch: hatch.hatch,
        originalSourceFillFlags: 0,
        face: swap(payload.readUInt32LE(36)),
        kind: payload.readInt32LE(44),
      };
      artifact('hwp5-pending-hatch-solid.hwp', saved);
      assert.equal(observed.face, 0x2468ac);
      assert.equal(observed.kind, -1);
      assert.equal(
        observed.foreground,
        hatch.hatch,
        `current pending hatch must precede original no-fill fallback: ${JSON.stringify(observed)}`,
      );
      assert.equal(sdk.undo(), true);
      assert.deepEqual(saveSDK(format, sdk), hatched);
      return observed;
    } finally {
      sdk.close();
    }
  }),
);
