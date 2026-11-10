// Actual Surface/Canvas; synthetic Core and renderer ports. No Native/browser claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewEditPolicy } from '../../../web/preview/preview-edit-policy.mjs';
import { registerHooks } from 'node:module';
// Use the real internal WeakMap port with synthetic projection values in this process.
const surfaceURL = new URL('../src/surface.ts', import.meta.url).href;
const geometryURL = new URL('../../core/src/internal/native-geometry-evidence.ts', import.meta.url)
  .href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@hwpjs/core/_internal/native-geometry' && context.parentURL === surfaceURL)
      return { url: geometryURL, shortCircuit: true };
    return next(specifier, context);
  },
});
const { bindGeometryProjectionPort } = await import(geometryURL);
const { createCanvasSurface } = await import('../src/surface.ts');
import { formattingFixture, tick } from './multirange-formatting-fixture.mjs';

function model() {
  const paragraphs = ['BEFORE', '\ufffc', 'CELL', 'AFTER', 'TAIL'].map((text, paragraph) => ({
    section: 0,
    paragraph,
    text,
    editable: true,
    selectable: true,
    selectionOwner: 'section:0:body',
    currentReference: { kind: 'original', section: 0, paragraph },
    ...(paragraph === 2 ? { tableCell: { tableNode: 10, listNode: 20 } } : {}),
  }));
  return {
    format: 'hwpx',
    limited: false,
    paragraphs,
    tables: [
      {
        section: 0,
        tableNode: 10,
        hostParagraph: 1,
        rows: 1,
        columns: 1,
        cells: [{ listNode: 20, row: 0, column: 0, rowSpan: 1, columnSpan: 1, paragraphs: [2] }],
      },
    ],
  };
}
const table = () => ({
  section: 0,
  tableNode: 10,
  hostParagraph: 1,
  paragraphs: [2],
  reason: 'InlineTablePaperOverflow',
});
const at = (paragraph, unit = 0) => ({ section: 0, paragraph, unit });
test('preview policy masks a UI copy without changing any Native identity or reference', () => {
  const content = model(),
    before = structuredClone(content);
  const p = createPreviewEditPolicy(content, { previewReadOnlyTables: [table()] });
  assert.equal(p.active, true);
  assert.deepEqual(content, before);
  assert.equal(p.content.paragraphs.length, content.paragraphs.length);
  for (let i = 0; i < content.paragraphs.length; i++) {
    assert.equal(p.content.paragraphs[i].paragraph, i);
    assert.equal(p.content.paragraphs[i].currentReference, content.paragraphs[i].currentReference);
    assert.equal(p.content.paragraphs[i].tableCell, content.paragraphs[i].tableCell);
    assert.equal(p.content.paragraphs[i].editable, ![1, 2].includes(i));
    assert.equal(p.content.paragraphs[i].selectable, ![1, 2].includes(i));
  }
  assert.equal(p.content.paragraphs[0], content.paragraphs[0]);
  assert.equal(p.allowsPoint(at(0)), true);
  assert.equal(p.allowsPoint(at(1)), false);
  assert.equal(p.allowsPoint(at(2)), false);
  assert.equal(p.allowsPoint({ ...at(0), tableNode: 10 }), false);
  assert.equal(p.allowsRange(at(0), at(3)), false);
  assert.equal(p.allowsRange(at(3), at(0)), false);
  assert.equal(p.allowsRange(at(3), at(4)), true);
});
test('preview policy inactive preserves legacy behavior and content identity', () => {
  for (const layout of [{}, { previewReadOnlyTables: [] }]) {
    const content = model(),
      p = createPreviewEditPolicy(content, layout);
    assert.equal(p.active, false);
    assert.equal(p.content, content);
    assert.equal(p.allowsPoint(null), true);
    assert.equal(p.allowsRequest({ kind: 'future' }), true);
  }
});
test('preview policy binds exact owner inventory and fails closed for malformed masks', () => {
  for (const mutate of [
    (c) => {
      c.paragraphs.push({ ...c.paragraphs[2] });
    },
    (c) => {
      c.paragraphs[2].tableCell.tableNode = 11;
    },
    (c) => {
      c.tables[0].hostParagraph = 0;
    },
  ]) {
    const c = model();
    mutate(c);
    const p = createPreviewEditPolicy(c, { previewReadOnlyTables: [table()] });
    assert.equal(p.allowsPoint(at(0)), false);
    assert.equal(p.allowsRequest({ kind: 'undo' }), true);
  }
  for (const patch of [
    { paragraphs: [] },
    { paragraphs: [2, 2] },
    { paragraphs: [0] },
    { reason: 'unknown' },
    { section: -1 },
    { hostParagraph: 2 },
  ]) {
    const p = createPreviewEditPolicy(model(), {
      previewReadOnlyTables: [{ ...table(), ...patch }],
    });
    assert.equal(p.allowsPoint(at(0)), false);
  }
});
test('preview requests deny host/cells, cross-block batches and opaque mutations', () => {
  const p = createPreviewEditPolicy(model(), { previewReadOnlyTables: [table()] });
  for (const paragraph of [1, 2])
    for (const kind of ['splice', 'split', 'format', 'query-edit-range'])
      assert.equal(p.allowsRequest({ kind, section: 0, paragraph }), false);
  for (const kind of [
    'undo',
    'redo',
    'save',
    'query-formatting-capabilities',
    'set-display-options',
  ])
    assert.equal(p.allowsRequest({ kind }), true);
  assert.equal(p.allowsRequest({ kind: 'splice', section: 0, paragraph: 3 }), true);
  assert.equal(p.allowsRequest({ kind: 'merge', section: 0, paragraph: 3 }), true);
  assert.equal(p.allowsRequest({ kind: 'merge', section: 0, paragraph: 0 }), false);
  for (const kind of ['character-properties-ranges', 'replace-paragraph-ranges']) {
    assert.equal(p.allowsRequest({ kind, ranges: [at(0), at(3)] }), false);
    assert.equal(p.allowsRequest({ kind, ranges: [at(3), at(4)] }), true);
  }
  for (const message of [
    { kind: 'source-table-grid', section: 0, tableNode: 10 },
    { kind: 'cell-size', section: 0, listNode: 20 },
    { kind: 'table-column-width', section: 0, tableNode: 10 },
    { kind: 'picture-resize', section: 0, pictureNode: 7 },
    { kind: 'future-mutation', section: 0, paragraph: 3 },
    { kind: 'formatting-patch', request: { targets: [{ ref: 'opaque' }] } },
  ])
    assert.equal(p.allowsRequest(message), false);
});
test('preview ranges use source order rather than sorting or comparing paragraph IDs', () => {
  const c = model(),
    ids = [90, 50, 70, 1, 2];
  c.paragraphs.forEach((p, i) => {
    p.paragraph = ids[i];
  });
  c.tables[0].hostParagraph = 50;
  const p = createPreviewEditPolicy(c, {
    previewReadOnlyTables: [{ ...table(), hostParagraph: 50, paragraphs: [70] }],
  });
  assert.equal(p.allowsRange(at(90), at(1)), false);
  assert.equal(p.allowsRange(at(1), at(2)), true);
});

async function setup(body) {
  const f = formattingFixture();
  f.install({ content: model() });
  let declared = [],
    callback,
    projection,
    geometryReads = 0;
  const acquire = f.editor.acquireInputSurface;
  f.editor.acquireInputSurface = (...args) => {
    const nativeLease = acquire(...args);
    bindGeometryProjectionPort(nativeLease, () => {
      geometryReads++;
      return projection ? { content: projection, evidence: {} } : undefined;
    });
    return nativeLease;
  };
  f.geometryReads = () => geometryReads;
  f.setPrivateProjection = (value) => {
    projection = value;
  };
  f.shown = [];
  f.renderer.show = (content) => {
    f.shown.push(content);
  };
  let cachedContent, cachedDeclared, cached;
  const policy = () => {
    if (cachedContent !== f.state().content || cachedDeclared !== declared) {
      cachedContent = f.state().content;
      cachedDeclared = declared;
      cached = createPreviewEditPolicy(cachedContent, { previewReadOnlyTables: declared });
    }
    return cached;
  };
  f.renderer.viewEditPolicyActive = () => policy().active;
  f.renderer.viewAllowsPoint = (p) => policy().allowsPoint(p);
  f.renderer.viewAllowsRange = (a, b) => policy().allowsRange(a, b);
  f.renderer.viewAllowsRequest = (m) => policy().allowsRequest(m);
  f.renderer.onGeometry = (fn) => {
    callback = fn;
  };
  // Deliberately retain canonical renderer paragraph/rows: Canvas must hard-deny
  // before cached permission and stale paint even if a prior projection survives.
  const s = createCanvasSurface({ root: f.root, editor: f.editor });
  const select = async (paragraph = 2) => {
    f.pointer('pointerdown', paragraph, 1);
    f.pointer('pointerup', paragraph, 1);
    await tick();
  };
  try {
    await body(
      f,
      s,
      select,
      (value) => {
        declared = Array.isArray(value) ? value : value ? [table()] : [];
      },
      () => callback?.(),
    );
  } finally {
    while (f.waits.length) f.reject();
    await s.dispose();
  }
}
function inputText(f, text) {
  const input = f.input(),
    event = new Event('beforeinput', { cancelable: true });
  Object.assign(event, { inputType: 'insertText', data: text, isComposing: false });
  input.dispatchEvent(event);
  if (!event.defaultPrevented) {
    const unit = input.selectionStart;
    input.value = input.value.slice(0, unit) + text + input.value.slice(input.selectionEnd);
    input.setSelectionRange(unit + text.length, unit + text.length);
    const next = new Event('input');
    Object.assign(next, { inputType: 'insertText', data: text, isComposing: false });
    input.dispatchEvent(next);
  }
  return event;
}
test('actual Surface prepaint denial clears stale DOM, clipboard and Core selection', () =>
  setup(async (f, s, select, mask) => {
    await select();
    assert.equal(f.state().selection.paragraph, 2);
    const capture = s.captureCaretFormatting();
    mask(true);
    const event = inputText(f, 'blocked');
    await tick();
    assert.equal(event.defaultPrevented, true);
    assert.equal(f.input().value, '');
    assert.equal(f.input().disabled, true);
    assert.equal(f.state().selection, null);
    assert.equal(f.messages.length, 0);
    assert.equal(capture?.current(), false);
    assert.equal(s.captureSourceTableGridSelection(), null);
    let cleared = false;
    const copy = new Event('copy', { cancelable: true });
    copy.clipboardData = {
      clearData() {
        cleared = true;
      },
    };
    f.input().dispatchEvent(copy);
    assert.equal(copy.defaultPrevented, true);
    assert.equal(cleared, true);
  }));
test('actual Surface current-frame denial preserves body input and immutable Native model', () =>
  setup(async (f, s, select, mask, frame) => {
    const native = f.state().content,
      snapshot = structuredClone(native);
    await select();
    mask(true);
    frame();
    await tick();
    assert.equal(f.input().disabled, true);
    assert.equal(f.input().value, '');
    assert.deepEqual(native, snapshot);
    await select(3);
    assert.equal(f.input().disabled, false);
    assert.equal(f.input().readOnly, false);
    inputText(f, 'Q');
    await tick();
    assert.equal(f.messages.at(-1).kind, 'splice');
    assert.equal(f.messages.at(-1).paragraph, 3);
    assert.deepEqual(native, snapshot);
  }));
test('actual Surface final asynchronous gateway rejects an admitted request after policy changes', () =>
  setup(async (f, s, select, mask) => {
    await select(2);
    inputText(f, 'Q');
    mask(true); // before the bridge microtask reaches Native
    await tick();
    assert.equal(f.messages.length, 0);
    assert.equal(f.waits.length, 0);
    assert.equal(f.input().value, '');
  }));
test('actual Surface fresh selection recovers after policy removal with no old buffered input', () =>
  setup(async (f, s, select, mask, frame) => {
    await select();
    const begin = new Event('compositionstart');
    f.input().dispatchEvent(begin);
    mask(true);
    frame();
    await tick();
    assert.equal(f.input().value, '');
    mask(false);
    frame();
    await select(2);
    assert.equal(f.input().readOnly, false);
    const late = new Event('compositionend');
    Object.assign(late, { data: 'STALE' });
    f.input().dispatchEvent(late);
    await tick();
    assert.equal(f.messages.length, 0);
    inputText(f, 'R');
    await tick();
    assert.equal(f.messages.at(-1).kind, 'splice');
    assert.equal(f.messages.at(-1).text, 'R');
  }));
test('actual Surface read-only preview still admits Native undo without a table retarget', () =>
  setup(async (f, s, select, mask, frame) => {
    await select();
    mask(true);
    frame();
    await tick();
    assert.equal(s.requestHistory('undo'), true);
    await tick();
    assert.equal(f.requests.at(-1).kind, 'public-undo');
    mask(false);
    f.ack({
      operationRevision: 2,
      viewRevision: 2,
      nativeHistoryRevision: 0,
      nativeHistoryRevisions: [0, 1],
      selection: null,
    });
    await tick();
    frame();
    f.frame();
    await tick();
    await select(3);
    assert.equal(f.state().selection.paragraph, 3);
    inputText(f, 'U');
    await tick();
    assert.equal(f.messages.at(-1).paragraph, 3);
  }));

test('actual Surface preserves private port identity normally and uses fresh public IDs while active', () =>
  setup(async (f, s, select, mask, frame) => {
    const privateContent = { ...model(), window: true };
    f.setPrivateProjection(privateContent);
    f.install({ operationRevision: 2, viewRevision: 2 });
    assert.equal(f.shown.at(-1), privateContent);
    assert(f.geometryReads() > 0);
    await select(3);
    mask(true);
    frame();
    await tick();
    const before = f.geometryReads();
    const fresh = model();
    fresh.tables[0].tableNode = 100;
    fresh.tables[0].cells[0].listNode = 200;
    fresh.tables[0].cells[0].paragraphs = [12];
    Object.assign(fresh.paragraphs[2], {
      paragraph: 12,
      tableCell: { tableNode: 100, listNode: 200 },
    });
    mask([{ ...table(), tableNode: 100, paragraphs: [12] }]);
    f.install({ content: fresh, operationRevision: 3, viewRevision: 3, selection: null });
    assert.equal(f.geometryReads(), before, 'active preview must not read the private window');
    assert.equal(f.shown.at(-1), fresh);
    assert.equal(f.renderer.viewAllowsPoint(at(2)), false);
    assert.equal(f.renderer.viewAllowsPoint(at(12)), false);
    await select(3);
    inputText(f, 'F');
    await tick();
    assert.equal(f.messages.at(-1).kind, 'splice');
    assert.equal(f.messages.at(-1).paragraph, 3);
  }));

test('preview policy draft end units preserve allowed body owner but reject malformed or masked points', () => {
  const content = model();
  const policy = createPreviewEditPolicy(content, { previewReadOnlyTables: [table()] });
  const end = content.paragraphs[0].text.length;
  assert.equal(policy.allowsPoint(at(0, end + 1)), true);
  assert.equal(policy.allowsRange(at(0, end), at(0, end + 1)), true);
  for (const unit of [-1, 0.5, NaN, Infinity, '7', 0x100000000]) {
    assert.equal(policy.allowsPoint(at(0, unit)), false);
  }
  assert.equal(policy.allowsPoint(at(2, end + 1)), false);
  assert.equal(policy.allowsPoint(at(99, end + 1)), false);
  assert.equal(policy.allowsRange(at(0, end + 1), at(3, 1)), false);
});

test('actual Surface draft end append survives frame reconcile while Native ACK is pending', () =>
  setup(async (f, s, select, mask, frame) => {
    mask(true);
    f.pointer('pointerdown', 0, 6);
    f.pointer('pointerup', 0, 6);
    await tick();
    assert.equal(f.input().value, 'BEFORE');
    assert.equal(f.input().selectionStart, 6);
    inputText(f, 'x');
    frame();
    await tick();
    assert.equal(f.messages.length, 1, 'body insertion at canonical end must reach Native');
    assert.equal(f.waits.length, 1, 'one ACK must still be pending');
    assert.equal(f.input().value, 'BEFOREx');
    assert.equal(f.input().disabled, false);
    assert.equal(f.messages[0].kind, 'splice');
    assert.equal(f.messages[0].paragraph, 0);
    assert.equal(f.messages[0].startUnit, 6);
    assert.equal(f.messages[0].endUnit, 6);
    assert.equal(f.messages[0].text, 'x');
    const fresh = structuredClone(f.state().content);
    fresh.paragraphs[0].text = 'BEFOREx';
    f.ack({
      content: fresh,
      operationRevision: 2,
      viewRevision: 2,
      nativeHistoryRevision: 2,
      nativeHistoryRevisions: [2, 1, 0],
    });
    await tick();
    frame();
    await tick();
    assert.equal(f.input().value, 'BEFOREx');
    assert.equal(f.input().readOnly, false);
    assert.equal(f.input().disabled, false);
    assert.equal(f.state().content.paragraphs[0].text, 'BEFOREx');
    assert.equal(s.canRequestHistory('undo'), true);
  }));
