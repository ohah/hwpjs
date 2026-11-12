import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEditor,
  createParagraphSelection,
  APPLY_FORMATTING_PATCH_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  createReaderRuntimeFactory,
  wasmModule,
  inputBytes,
  verifyInputs,
} from './shape-copy-native-fixture.mjs';
import { createShapeCopyTool } from '../src/shape-copy-tool.ts';
function dom() {
  const doc = new EventTarget();
  doc.defaultView = Object.assign(new EventTarget(), { innerWidth: 800, innerHeight: 600 });
  doc.activeElement = null;
  class Element extends EventTarget {
    children = [];
    dataset = {};
    style = {};
    attrs = {};
    open = false;
    hidden = false;
    disabled = false;
    checked = false;
    value = '';
    isConnected = false;
    parentElement = null;
    textContent = '';
    tagName;
    constructor(tag) {
      super();
      this.tagName = tag.toUpperCase();
      this.ownerDocument = doc;
    }
    append(...nodes) {
      for (const n of nodes) {
        n.parentElement = this;
        n.isConnected = this.isConnected;
        this.children.push(n);
      }
    }
    remove() {
      if (this.parentElement)
        this.parentElement.children = this.parentElement.children.filter((n) => n !== this);
      this.parentElement = null;
      this.isConnected = false;
    }
    setAttribute(k, v) {
      this.attrs[k] = v;
    }
    getAttribute(k) {
      return this.attrs[k];
    }
    showModal() {
      this.open = true;
    }
    show() {
      this.open = true;
    }
    close() {
      this.open = false;
    }
    focus() {
      doc.activeElement = this;
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 400, height: 400 };
    }
    getClientRects() {
      return [{}];
    }
    querySelectorAll() {
      return all(this).filter(
        (n) => ['BUTTON', 'INPUT', 'SELECT'].includes(n.tagName) && !n.disabled,
      );
    }
    querySelector() {
      return null;
    }
  }
  const all = (n) => [n, ...n.children.flatMap(all)];
  doc.createElement = (t) => new Element(t);
  doc.createTextNode = (t) => Object.assign(new Element('#text'), { textContent: t });
  const root = new Element('main');
  root.isConnected = true;
  doc.querySelector = (q) =>
    q === 'dialog:modal' ? (all(root).find((n) => n.tagName === 'DIALOG' && n.open) ?? null) : null;
  const send = (node, type, extra = {}) => {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, extra);
    node.dispatchEvent(e);
    return e;
  };
  return {
    root,
    doc,
    all: () => all(root),
    send,
    role: (r) => all(root).find((n) => n.dataset.role === r),
    field: (id) => all(root).find((n) => n.dataset.shapeCopyField === id),
  };
}
async function setup(format = 'hwp5') {
  const e = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule }) });
  const original = await inputBytes(format);
  await e.load(original, { format, editable: true });
  const rows = e
    .getEditorState()
    .content.paragraphs.filter(
      (r) => !r.tableCell && !r.drawingText && !r.drawingCaption && r.text.length > 4,
    );
  const select = async (row, start, end) =>
    e.setSelection(
      createParagraphSelection(e.getEditorState(), {
        section: row.section,
        paragraph: row.paragraph,
        startUnit: start,
        endUnit: end,
      }),
    );
  await select(rows[0], 1, 1);
  const d = dom(),
    status = [];
  let focus = 0;
  const tool = createShapeCopyTool({
    root: d.root,
    editor: e,
    onStatus: (t) => status.push(t),
    onClose: () => focus++,
    onPresentationChange() {},
  });
  return {
    e,
    tool,
    d,
    rows,
    select,
    status,
    focus: () => focus,
    close: async () => {
      tool.dispose();
      await e.dispose();
    },
  };
}
test('source modal: only explicitly selected known fields enter copy buffer; source/history/selection unchanged', async () => {
  const h = await setup();
  try {
    const state = h.e.getEditorState(),
      history = state.nativeHistoryRevision;
    assert.equal(h.tool.presentation().enabled, true);
    await h.tool.action('format-copy');
    assert.equal(h.e.getEditorState(), state);
    const confirm = h.d.role('shape-copy-confirm');
    assert.equal(confirm.disabled, true);
    assert(h.d.all().some((n) => n.textContent.includes('글자 스타일')));
    assert(h.d.all().some((n) => n.textContent.includes('탭 설정')));
    assert(!h.d.all().some((n) => /조회·적용|현재 API|완전한 복사/.test(n.textContent)));
    const input = h.d.field('character.bold');
    assert(input && !input.disabled);
    input.checked = true;
    h.d.send(input, 'change');
    assert.equal(confirm.disabled, false);
    h.d.send(confirm, 'click');
    assert.equal(h.d.role('shape-copy'), undefined);
    assert.equal(h.focus(), 1);
    assert.equal(h.e.getEditorState().nativeHistoryRevision, history);
  } finally {
    await h.close();
  }
});
test('key229 before compositionstart must not remember format or close the source modal', async () => {
  const h = await setup();
  try {
    await h.tool.action('format-copy');
    const dialog = h.d.role('shape-copy'),
      input = h.d.field('character.bold'),
      confirm = h.d.role('shape-copy-confirm');
    input.checked = true;
    h.d.send(input, 'change');
    h.d.send(dialog, 'keydown', { key: 'Process', keyCode: 229, isComposing: false });
    h.d.send(confirm, 'click');
    assert.equal(
      h.d.role('shape-copy') === dialog,
      true,
      'IME key229 closed the copy dialog before compositionstart',
    );
    h.d.send(dialog, 'keyup', { key: 'Process', keyCode: 229 });
    h.d.send(confirm, 'click');
    assert.equal(h.d.role('shape-copy'), undefined);
  } finally {
    await h.close();
  }
});
test('source modal: selection/doc replacement disables confirmation and old async results', async () => {
  const h = await setup();
  try {
    await h.tool.action('format-copy');
    const input = h.d.field('character.bold'),
      confirm = h.d.role('shape-copy-confirm');
    input.checked = true;
    h.d.send(input, 'change');
    await h.select(h.rows[1], 0, 2);
    assert.equal(confirm.disabled, true);
    h.d.send(confirm, 'click');
    assert(h.d.role('shape-copy'));
    h.d.send(h.d.role('shape-copy-cancel'), 'click');
    assert.equal(h.d.role('shape-copy'), undefined);
  } finally {
    await h.close();
  }
});
test('source modal: composition blocks copy and Escape until composition ends; cancel writes nothing', async () => {
  const h = await setup();
  try {
    await h.tool.action('format-copy');
    const dialog = h.d.role('shape-copy'),
      input = h.d.field('character.bold'),
      confirm = h.d.role('shape-copy-confirm'),
      rev = h.e.getEditorState().nativeHistoryRevision;
    input.checked = true;
    h.d.send(input, 'change');
    h.d.send(dialog, 'compositionstart');
    h.d.send(confirm, 'click');
    h.d.send(dialog, 'keydown', { key: 'Escape', isComposing: true, keyCode: 229 });
    assert.equal(h.d.role('shape-copy'), dialog);
    h.d.send(dialog, 'compositionend');
    h.d.send(h.d.role('shape-copy-cancel'), 'click');
    assert.equal(h.d.role('shape-copy'), undefined);
    assert.equal(h.e.getEditorState().nativeHistoryRevision, rev);
  } finally {
    await h.close();
  }
});

for (const format of ['hwp5', 'hwpx'])
  test(
    'actual source modal -> same toolbar action -> normal SDK Native atomic target apply/' + format,
    async () => {
      const h = await setup(format);
      try {
        await h.select(h.rows[0], 0, 1);
        assert.equal(
          (
            await h.e.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
              target: h.e.getEditorState().selection,
              selectionVersion: h.e.getEditorState().stateVersion,
              patch: {
                character: { size: 1800, bold: true, italic: true },
                paragraph: { alignment: 'LEFT' },
              },
            })
          ).status,
          'committed-with-snapshot',
        );
        const save = async () => Buffer.from((await h.e.save({ allowStaleLayout: true })).bytes);
        const before = await save(),
          rev = h.e.getEditorState().nativeHistoryRevision;
        await h.select(h.rows[0], 1, 1);
        await h.tool.action('format-copy');
        const both = h.d.role('shape-copy-mode-both');
        both.checked = true;
        h.d.send(both, 'change');
        for (const id of [
          'character.size',
          'character.bold',
          'character.italic',
          'paragraph.alignment',
        ]) {
          const input = h.d.field(id);
          assert(input && !input.disabled, id);
          input.checked = true;
          h.d.send(input, 'change');
        }
        h.d.send(h.d.role('shape-copy-confirm'), 'click');
        assert.equal(h.d.role('shape-copy'), undefined);
        await h.select(h.rows[1], 0, 2);
        assert.equal(h.tool.presentation().enabled, true);
        await h.tool.action('format-copy');
        assert.equal(
          h.focus(),
          2,
          'source close and successful apply restore focus through existing callback',
        );
        assert.equal(h.e.getEditorState().nativeHistoryRevision, rev + 1);
        const actual = await h.e.queryFormatting(h.e.getEditorState().selection, {
          fields: ['character.size', 'character.bold', 'character.italic', 'paragraph.alignment'],
        });
        assert.deepEqual(
          Object.fromEntries(
            Object.entries(actual.observations.aggregate).map(([k, v]) => [k, v.value]),
          ),
          {
            'character.size': 1800,
            'character.bold': true,
            'character.italic': true,
            'paragraph.alignment': 'LEFT',
          },
        );
        const after = await save();
        assert.notDeepEqual(after, before);
        assert.equal(
          (await h.e.dispatchCommand(UNDO_COMMAND, { token: h.e.getEditorState().token })).status,
          'committed-with-snapshot',
        );
        assert.deepEqual(await save(), before);
        assert.equal(
          (await h.e.dispatchCommand(REDO_COMMAND, { token: h.e.getEditorState().token })).status,
          'committed-with-snapshot',
        );
        assert.deepEqual(await save(), after);
      } finally {
        await h.close();
      }
    },
  );

await verifyInputs();
