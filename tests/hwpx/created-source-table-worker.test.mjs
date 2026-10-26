import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workerCanvasHarness } from '../canvas/worker-harness.mjs';
import { rowAtPoint } from '../../web/preview/row-geometry.mjs';
import { execFileSync } from '../../tools/oracle-process.mjs';

test('existing inline table and generated tables share a host without aliasing source cells', async (t) => {
  const h = await workerCanvasHarness(t, { paintFrames: true });
  const bytes = readFileSync('reference/rhwp/samples/task1763/cell_trailing_ls_expand.hwpx');
  assert.equal((await h.send({ kind: 'load', format: 'hwpx', bytes })).error, undefined);
  const enabled = await h.send({ kind: 'enable' });
  assert.equal(enabled.error, undefined);
  const source = enabled.content.tables[0];
  const host = enabled.content.paragraphs.find(
    (p) => p.section === source.section && p.paragraph === source.hostParagraph,
  );
  const sourceTexts = enabled.content.paragraphs.map((p) => [p.paragraph, p.text]);
  const resources = Object.fromEntries(
    Object.entries(enabled.content.tableCreationResources).map(([key, ids]) => [
      key,
      key === 'border_fill' && ids.includes(1) ? 1 : ids[0],
    ]),
  );
  const identities = [];
  for (const [index, unit] of [source.anchorUnit, source.anchorUnit + 1].entries()) {
    assert.equal(
      h.controller.selectTextRange({
        section: host.section,
        paragraph: host.paragraph,
        startUnit: unit,
        endUnit: unit,
      }),
      true,
    );
    assert.equal(
      h.controller.insertTable({ rows: 1, columns: 1, width: 3600, rowHeight: 1800, resources }),
      true,
    );
    const created = await h.flush();
    assert.equal(created.error, undefined);
    identities.push(created.identity);
    assert.equal(
      h.renderer.layout().pageLayoutMode,
      'measured-created-inline',
      h.renderer.layout().pageLayoutError,
    );
    assert.equal(h.controller.replaceSelection(index === 0 ? '앞표😀' : '뒤표😀'), true);
    const changed = await h.flush();
    assert.equal(changed.error, undefined);
    assert.deepEqual(
      changed.content.paragraphs.map((p) => [p.paragraph, p.text]),
      sourceTexts,
    );
  }
  const layout = h.renderer.layout();
  assert.equal(layout.boxes.filter((box) => box.createdCell).length, 2);
  assert(layout.boxes.some((box) => box.tableNode === source.tableNode && !box.createdCell));
  for (const box of layout.boxes.filter(
    (box) => box.tableNode === source.tableNode && !box.createdCell,
  )) {
    const hit = layout.rows[rowAtPoint(layout, box.x + box.width / 2, box.y + box.height / 2)];
    assert.equal(hit.tableNode, source.tableNode);
    assert.equal(hit.listNode, box.listNode);
    assert.equal(hit.createdCell, undefined);
  }
  for (const box of layout.boxes.filter((box) => box.createdCell)) {
    const hit = layout.rows[rowAtPoint(layout, box.x + box.width - 1, box.y + box.height - 1)];
    assert.equal(hit.createdCell.identity, box.createdCell.identity);
    assert.equal(hit.paragraph, undefined);
  }
  assert.deepEqual(
    new Set(layout.boxes.filter((box) => box.createdCell).map((box) => box.createdCell.identity)),
    new Set(identities),
  );
  h.paint();
  const saved = await h.send({ kind: 'save' });
  assert.equal(saved.error, undefined);
  execFileSync(
    'python3',
    [
      '-c',
      "import sys,json,base64,io,zipfile,xml.etree.ElementTree as E; d=json.load(sys.stdin); a=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['before']))); b=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['after']))); ns='{http://www.hancom.co.kr/hwpml/2011/paragraph}'; part='Contents/section0.xml'; before=list(E.fromstring(a.read(part)).iter(ns+'tbl')); after=list(E.fromstring(b.read(part)).iter(ns+'tbl')); assert len(before)==1 and len(after)==3;\nfor old in before:\n current=[t for t in after if t.attrib['id']==old.attrib['id']]; assert len(current)==1; old.tail=None; current[0].tail=None; assert E.tostring(old)==E.tostring(current[0])\nassert a.namelist()==b.namelist(); assert all(a.read(n)==b.read(n) for n in a.namelist() if n!=part)",
    ],
    {
      input: JSON.stringify({
        before: bytes.toString('base64'),
        after: Buffer.from(saved.bytes).toString('base64'),
      }),
      timeout: 30000,
    },
  );
  for (let index = 0; index < 4; index++)
    assert.equal((await h.send({ kind: 'undo' })).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), bytes);
  for (let index = 0; index < 4; index++)
    assert.equal((await h.send({ kind: 'redo' })).error, undefined);
  assert.deepEqual((await h.send({ kind: 'save' })).bytes, saved.bytes);
  const reopened = await h.send({ kind: 'load', format: 'hwpx', bytes: saved.bytes });
  assert.equal(reopened.error, undefined);
  assert.equal(reopened.content.tables.length, 3);
  for (const text of ['앞표😀', '뒤표😀'])
    assert(reopened.content.paragraphs.some((p) => p.text === text));
});
