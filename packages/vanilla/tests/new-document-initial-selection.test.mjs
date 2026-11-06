// Real Surface/Canvas with a controlled renderer and Core observations; not Native or browser proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { multiblockFixture, tick } from './multiblock-clipboard-fixture.mjs';

function prepared() {
  const f = multiblockFixture(),
    publications = [];
  const acquire = f.editor.acquireInputSurface;
  f.editor.acquireInputSurface = (...args) => {
    const lease = acquire(...args);
    return {
      ...lease,
      publishSelection: async (target) => {
        publications.push(target);
        if (!lease.isActive()) throw Error('InputSurfaceDetached');
        return lease.publishSelection(target);
      },
    };
  };
  return { ...f, publications };
}
function installDocument(f, format, documentId, { selected = true, unit } = {}) {
  const hwp5 = format === 'hwp5',
    text = hwp5 ? '\ufffc\ufffc' : '';
  const generation = f.state().generation + 1,
    operationRevision = f.state().operationRevision + 1,
    viewRevision = f.state().viewRevision + 1;
  const initial = selected
    ? {
        editorId: f.state().editorId,
        documentId,
        generation,
        operationRevision,
        viewRevision,
        coordinateSpace: 'display',
        format,
        owner: 'section:0:body',
        section: 0,
        paragraph: 0,
        startUnit: unit ?? (hwp5 ? 2 : 0),
        endUnit: unit ?? (hwp5 ? 2 : 0),
        affinity: 'forward',
      }
    : null;
  const row = {
    section: 0,
    paragraph: 0,
    text,
    editable: true,
    selectable: true,
    selectionOwner: 'section:0:body',
    ...(hwp5
      ? {
          currentReference: {
            kind: 'original',
            section: 0,
            id: '0',
            epoch: '2',
            scope: 'worker:1:1',
            row: 0,
            column: 0,
          },
          sourceOffsets: [
            { at: 0, source: 0 },
            { at: 1, source: 8 },
            { at: 2, source: 16 },
          ],
          structuralAnchors: [
            {
              kind: 'section',
              control_node: 3,
              paragraph: 0,
              source_unit: 0,
              current_unit: 0,
              unit: 0,
            },
            {
              kind: 'column',
              control_node: 5,
              paragraph: 0,
              source_unit: 8,
              current_unit: 8,
              unit: 1,
            },
          ],
        }
      : {}),
  };
  f.install({
    documentId,
    generation,
    operationRevision,
    savedOperationRevision: operationRevision,
    viewRevision,
    status: 'ready',
    selection: initial,
    content: { format, limited: false, readOnly: false, paragraphs: [row] },
  });
  return initial;
}
async function settle(f) {
  await tick();
  f.frame();
  await tick();
}
async function close(f, surface) {
  while (f.waits.length) f.reject();
  await surface.dispose();
  await tick();
}
for (const format of ['hwp5', 'hwpx'])
  test(`${format} first mounted ready document preserves and projects its initial Core caret`, async () => {
    const f = prepared(),
      initial = installDocument(f, format, 'fresh-before-mount');
    const surface = createCanvasSurface({
      root: f.root,
      editor: f.editor,
      onStatus: (s) => f.reports.push(s),
    });
    try {
      await settle(f);
      assert.deepEqual(
        f.state().selection,
        initial,
        'Core initial selection must not be cleared by Surface reset',
      );
      assert.equal(
        f.publications.filter((value) => value === null).length,
        0,
        'projection must not publish a null selection',
      );
      assert.equal(f.canvas().dataset.caret, `0:0:${initial.startUnit}`);
      assert.equal(f.input().value, f.state().content.paragraphs[0].text);
      assert.equal(surface.focus(), true);
      assert.equal(f.doc.activeElement, f.input());
      assert.equal(f.requests.length, 0, 'selection projection must not enter Native');
    } finally {
      await close(f, surface);
    }
  });
for (const format of ['hwp5', 'hwpx'])
  test(`${format} changing documents projects the new Core caret without publishing the old reset as null`, async () => {
    const f = prepared();
    const surface = createCanvasSurface({
      root: f.root,
      editor: f.editor,
      onStatus: (s) => f.reports.push(s),
    });
    try {
      await f.selectA();
      assert.notEqual(f.canvas().dataset.caret, '', 'a previous selection must actually exist');
      f.publications.length = 0;
      const initial = installDocument(f, format, 'fresh-after-swap');
      await settle(f);
      assert.deepEqual(f.state().selection, initial);
      assert.equal(f.publications.filter((value) => value === null).length, 0);
      assert.equal(f.canvas().dataset.caret, `0:0:${initial.startUnit}`);
      assert.equal(surface.focus(), true);
      assert.equal(f.doc.activeElement, f.input());
      assert.equal(f.requests.length, 0);
    } finally {
      await close(f, surface);
    }
  });
for (const phase of ['mount', 'swap'])
  test(`ordinary load without an initial selection stays unselected on ${phase}`, async () => {
    const f = prepared();
    let surface;
    if (phase === 'mount') installDocument(f, 'hwpx', 'normal-load', { selected: false });
    surface = createCanvasSurface({
      root: f.root,
      editor: f.editor,
      onStatus: (s) => f.reports.push(s),
    });
    try {
      if (phase === 'swap') {
        await f.selectA();
        f.publications.length = 0;
        installDocument(f, 'hwpx', 'normal-load', { selected: false });
      }
      await settle(f);
      assert.equal(f.state().selection, null);
      assert.equal(f.canvas().dataset.caret, '');
      assert.equal(f.publications.length, 0);
      assert.equal(f.requests.length, 0);
    } finally {
      await close(f, surface);
    }
  });
test('a revoked input lease cannot project or publish a new document caret', async () => {
  const f = prepared();
  const surface = createCanvasSurface({
    root: f.root,
    editor: f.editor,
    onStatus: (s) => f.reports.push(s),
  });
  try {
    f.revoke();
    f.publications.length = 0;
    const initial = installDocument(f, 'hwp5', 'revoked-document');
    await settle(f);
    assert.deepEqual(f.state().selection, initial);
    assert.equal(f.publications.length, 0);
    assert.equal(f.canvas().dataset.caret, '');
    assert.equal(surface.focus(), false);
    assert.equal(f.requests.length, 0);
  } finally {
    await close(f, surface);
  }
});
