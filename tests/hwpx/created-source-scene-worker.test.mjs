import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workerCanvasHarness } from '../canvas/worker-harness.mjs';
import { rowAtPoint } from '../../web/preview/row-geometry.mjs';
import { execFileSync } from '../../tools/oracle-process.mjs';

test('noori source tables and pictures retain their engine around a generated body table', async (t) => {
  const h = await workerCanvasHarness(t, { paintFrames: true });
  const bytes = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/noori.hwpx');
  assert.equal((await h.send({ kind: 'load', format: 'hwpx', bytes })).error, undefined);
  const enabled = await h.send({ kind: 'enable' });
  assert.equal(enabled.error, undefined);
  assert.equal(enabled.content.tables.length, 5);
  assert.equal(enabled.content.pictures.length, 4);
  const originalPicturePlacements =
    h.renderer.layout().flowPictures?.map((p) => p.pictureNode) ?? [];
  const sourceHosts = new Set(enabled.content.tables.map((table) => table.hostParagraph));
  const host = enabled.content.paragraphs.find(
    (p) =>
      p.editable &&
      !p.tableCell &&
      !p.tableCaption &&
      !sourceHosts.has(p.paragraph) &&
      !p.text.includes('\ufffc'),
  );
  assert(host);
  const beforeTexts = enabled.content.paragraphs.map((p) => [p.paragraph, p.text]);
  const resources = Object.fromEntries(
    Object.entries(enabled.content.tableCreationResources).map(([key, ids]) => [
      key,
      key === 'border_fill' && ids.includes(1) ? 1 : ids[0],
    ]),
  );
  assert.equal(
    h.controller.selectTextRange({
      section: host.section,
      paragraph: host.paragraph,
      startUnit: 0,
      endUnit: 0,
    }),
    true,
  );
  assert.equal(
    h.controller.insertTable({ rows: 1, columns: 1, width: 7200, rowHeight: 1800, resources }),
    true,
  );
  const created = await h.flush();
  assert.equal(created.error, undefined);
  assert.equal(
    h.renderer.layout().pageLayoutMode,
    'measured-source-created-body',
    h.renderer.layout().pageLayoutError,
  );
  assert.equal(h.controller.replaceSelection('본문 새 표😀'), true);
  const changed = await h.flush();
  assert.equal(changed.error, undefined);
  assert.deepEqual(
    changed.content.paragraphs.map((p) => [p.paragraph, p.text]),
    beforeTexts,
  );
  const layout = h.renderer.layout();
  assert.equal(layout.boxes.filter((box) => box.createdCell).length, 1);
  assert.deepEqual(
    new Set(layout.boxes.filter((box) => !box.createdCell).map((box) => box.tableNode)),
    new Set(enabled.content.tables.map((table) => table.tableNode)),
  );
  assert.deepEqual(layout.flowPictures?.map((p) => p.pictureNode) ?? [], originalPicturePlacements);
  const box = layout.boxes.find((box) => box.createdCell);
  const hit = layout.rows[rowAtPoint(layout, box.x + box.width - 1, box.y + box.height - 1)];
  assert.equal(hit.createdCell.identity, created.identity);
  assert.equal(hit.paragraph, undefined);
  h.paint();
  const saved = await h.send({ kind: 'save', allowStaleLayout: true });
  assert.equal(saved.error, undefined);
  execFileSync(
    'python3',
    [
      '-c',
      "import sys,json,base64,io,zipfile,xml.etree.ElementTree as E; d=json.load(sys.stdin); a=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['before']))); b=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['after']))); ns='{http://www.hancom.co.kr/hwpml/2011/paragraph}'; part='Contents/section0.xml'; old=E.fromstring(a.read(part)); new=E.fromstring(b.read(part)); tables=list(old.iter(ns+'tbl')); after=list(new.iter(ns+'tbl')); assert len(tables)==5 and len(after)==6;\nfor table in tables:\n matches=[t for t in after if t.attrib['id']==table.attrib['id']]; assert len(matches)==1; table.tail=None; matches[0].tail=None; assert E.tostring(table)==E.tostring(matches[0])\nfor x,y in zip(old.iter(ns+'pic'),new.iter(ns+'pic')):\n x.tail=None; y.tail=None; assert E.tostring(x)==E.tostring(y)\nassert len(list(old.iter(ns+'pic')))==len(list(new.iter(ns+'pic')))==4; assert a.namelist()==b.namelist(); assert all(a.read(n)==b.read(n) for n in a.namelist() if n!=part)",
    ],
    {
      input: JSON.stringify({
        before: bytes.toString('base64'),
        after: Buffer.from(saved.bytes).toString('base64'),
      }),
      timeout: 30000,
    },
  );
  assert.equal((await h.send({ kind: 'undo' })).error, undefined);
  assert.equal((await h.send({ kind: 'undo' })).error, undefined);
  assert.deepEqual(
    Buffer.from((await h.send({ kind: 'save', allowStaleLayout: true })).bytes),
    bytes,
  );
  assert.equal((await h.send({ kind: 'redo' })).error, undefined);
  assert.equal((await h.send({ kind: 'redo' })).error, undefined);
  assert.deepEqual((await h.send({ kind: 'save', allowStaleLayout: true })).bytes, saved.bytes);
  const reopened = await h.send({ kind: 'load', format: 'hwpx', bytes: saved.bytes });
  assert.equal(reopened.error, undefined);
  assert.equal(reopened.content.tables.length, 6);
  assert.equal(reopened.content.pictures.length, 4);
  assert(reopened.content.paragraphs.some((p) => p.text === '본문 새 표😀'));
});
