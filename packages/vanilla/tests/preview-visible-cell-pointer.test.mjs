// Actual Surface/Canvas with synthetic renderer and Core ports; not browser pixels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { formattingFixture, tick } from './multirange-formatting-fixture.mjs';
import { createCanvasEditor } from '../../../web/preview/canvas-editor.mjs';

async function setup(body) {
  const f = formattingFixture();
  let readonly = false;
  f.renderer.readOnlyPreviewAtLogicalPoint = () => readonly;
  const surface = createCanvasSurface({ root: f.root, editor: f.editor });
  const select = async () => {
    f.pointer('pointerdown', 0, 1);
    f.pointer('pointerup', 0, 1);
    await tick();
  };
  try {
    await body(f, surface, select, (value) => (readonly = value));
  } finally {
    while (f.waits.length) f.reject();
    await surface.dispose();
  }
}
test('clicking a clipped cell clears old editable selection and permits a fresh allowed selection', () =>
  setup(async (f, surface, select, setReadonly) => {
    await select();
    assert.equal(f.input().disabled, false);
    assert.notEqual(f.state().selection, null);
    const revision = f.state().nativeHistoryRevision;
    setReadonly(true);
    f.pointer('pointerdown', 1, 1);
    await tick();
    assert.equal(f.input().value, '');
    assert.equal(f.input().disabled, true);
    assert.equal(f.input().readOnly, true);
    assert.equal(f.state().selection, null);
    assert.equal(f.state().nativeHistoryRevision, revision);
    assert.equal(f.messages.filter((m) => m.kind === 'splice').length, 0);
    setReadonly(false);
    await select();
    assert.equal(f.input().disabled, false);
    assert.equal(f.input().readOnly, false);
    assert.notEqual(f.state().selection, null);
  }));
test('a clipped-cell click cannot discard an uncommitted input buffer', () =>
  setup(async (f, surface, select, setReadonly) => {
    await select();
    const selected = f.state().selection;
    f.input().value += 'pending';
    const pending = f.input().value;
    setReadonly(true);
    f.pointer('pointerdown', 1, 1);
    await tick();
    assert.equal(f.input().value, pending);
    assert.equal(f.state().selection, selected);
    assert.equal(f.messages.filter((m) => m.kind === 'splice').length, 0);
  }));

test('cell property view query rechecks policy, observed state, IDs and lease', () =>
  setup(async (f, surface) => {
    assert.equal(surface.canEditCellProperties(0, 82), true);
    f.renderer.viewAllowsRequest = () => false;
    assert.equal(surface.canEditCellProperties(0, 82), false);
    f.renderer.viewAllowsRequest = () => {
      throw Error('unknown view');
    };
    assert.equal(surface.canEditCellProperties(0, 82), false);
    f.renderer.viewAllowsRequest = () => true;
    for (const value of [-1, -0, 1.2, NaN, Infinity, 0x100000000])
      assert.equal(surface.canEditCellProperties(0, value), false);
    const read = f.editor.getEditorState;
    const state = read();
    f.editor.getEditorState = () => ({ ...state, stateVersion: state.stateVersion + 1 });
    assert.equal(surface.canEditCellProperties(0, 82), false);
    f.editor.getEditorState = read;
    assert.equal(surface.canEditCellProperties(0, 82), true);
    await surface.dispose();
    assert.equal(surface.canEditCellProperties(0, 82), false);
  }));

function policyInvalidationFixture() {
  const f = formattingFixture(),
    doc = f.doc;
  const canvas = doc.createElement('canvas'),
    input = doc.createElement('textarea');
  const viewport = doc.createElement('div'),
    note = { textContent: '' },
    requests = [];
  let allowed = true,
    geometry,
    invalidateDraft = false;
  f.renderer.onGeometry = (callback) => {
    geometry = callback;
  };
  f.renderer.viewEditPolicyActive = () => true;
  f.renderer.viewAllowsPoint = (point) => allowed && !!point;
  f.renderer.viewAllowsRange = (a, b) => allowed && !!a && !!b;
  f.renderer.viewAllowsRequest = () => true;
  f.renderer.preview = (draft) => {
    if (draft && invalidateDraft) {
      allowed = false;
      geometry();
    }
  };
  const controller = createCanvasEditor({
    canvas,
    input,
    viewport,
    renderer: f.renderer,
    note,
    controls: {
      ready: () => true,
      busy: () => false,
      request: (message) => {
        requests.push(message);
        return true;
      },
    },
  });
  const reply = (kind, historyRevision, extra = {}) =>
    controller.message({
      kind,
      origin: 'canvas',
      historyRevision,
      historyRevisions: [2, 1, 0],
      ...extra,
    });
  reply('enable', 1, { historyAvailable: true });
  const selectEnd = () => {
    for (const type of ['pointerdown', 'pointerup']) {
      const event = new Event(type, { cancelable: true });
      Object.assign(event, {
        button: 0,
        buttons: type === 'pointerdown' ? 1 : 0,
        pointerId: 1,
        clientX: 52,
        clientY: 10,
      });
      canvas.dispatchEvent(event);
    }
    assert.equal(input.value, 'ABCD');
    assert.equal(input.selectionEnd, 4);
  };
  return {
    f,
    canvas,
    input,
    note,
    controller,
    requests,
    reply,
    selectEnd,
    invalidate() {
      allowed = false;
      geometry();
    },
    allow() {
      allowed = true;
    },
    invalidateOnDraft() {
      invalidateDraft = true;
    },
  };
}

function discardDraftWithBookmark(f) {
  f.selectEnd();
  // Seed a canonical caret for revision 1 using the existing external reset path.
  f.controller.external({ kind: 'format', origin: 'core' });
  f.selectEnd();
  f.input.value += ' oversized draft';
  f.input.setSelectionRange(f.input.value.length, f.input.value.length);
  // A DOM selection event may arrive before the draft's preview/Native request.
  f.input.dispatchEvent(new Event('select'));
  assert.equal(f.canvas.dataset.caret, '0:0:20');
  f.invalidateOnDraft();
  f.input.dispatchEvent(new Event('input'));
  assert.equal(f.input.value, '');
  assert.equal(f.input.disabled, true);
  assert.equal(f.input.readOnly, true);
  assert.equal(f.requests.filter((m) => m.kind === 'splice').length, 0);
  assert.equal(f.f.state().content.paragraphs[0].text, 'ABCD');
}

test('geometry revocation explicitly reports discarded draft before any Native request', () => {
  const f = policyInvalidationFixture();
  try {
    discardDraftWithBookmark(f);
    assert.match(f.note.textContent, /미확정 입력을 취소/);
    const status = f.note.textContent;
    f.controller.reconcilePreviewPolicy();
    assert.equal(f.note.textContent, status);
  } finally {
    f.controller.close();
  }
});

test('discarded draft caret cannot overwrite the prior canonical history bookmark', () => {
  const f = policyInvalidationFixture();
  try {
    discardDraftWithBookmark(f);
    // A later Native revision and undo must restore the canonical revision-1
    // bookmark, rather than the discarded draft caret outside its text.
    f.allow();
    f.reply('format', 2);
    assert.equal(f.controller.history('undo'), true);
    f.reply('undo', 1, { changed: true });
    assert.equal(f.canvas.dataset.caret, '0:0:4');
    assert.equal(f.input.value, 'ABCD');
    assert.equal(f.input.selectionEnd, 4);
  } finally {
    f.controller.close();
  }
});

test('settled selection invalidation reports its view limitation without claiming discarded input', () => {
  const f = policyInvalidationFixture();
  try {
    f.selectEnd();
    f.invalidate();
    assert.match(f.note.textContent, /미리보기.*편집할 수 없습니다/);
    assert.doesNotMatch(f.note.textContent, /미확정 입력/);
    assert.equal(f.requests.filter((m) => m.kind === 'splice').length, 0);
    f.allow();
    f.selectEnd();
    assert.equal(f.input.disabled, false);
    assert.equal(f.input.readOnly, false);
  } finally {
    f.controller.close();
  }
});
