import { test, expect } from 'bun:test';
// @ts-ignore Canonical controller/layout, not alternate input implementations.
import { createCanvasEditor } from '../../../web/preview/canvas-editor.mjs';
// @ts-ignore Canonical renderer geometry for a source fixture string.
import { layoutContent } from '../../../web/preview/layout.mjs';
function fixture() {
  const doc: any = {
    activeElement: null,
    defaultView: { AbortController, navigator: { platform: 'MacIntel' } },
  };
  const fire = (node: EventTarget, type: string, props: object = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, props);
    node.dispatchEvent(event);
    return event;
  };
  class Node extends EventTarget {
    ownerDocument = doc;
    style: any = {};
    dataset: any = {};
    value = '';
    selectionStart = 0;
    selectionEnd = 0;
    selectionDirection = 'forward';
    disabled = false;
    scrollTop = 0;
    scrollLeft = 0;
    clientWidth = 440;
    clientHeight = 300;
    restoreBrowserRange = false;
    setAttribute() {}
    getRootNode() {
      return doc;
    }
    setSelectionRange(a: number, b: number, direction = 'forward') {
      this.selectionStart = a;
      this.selectionEnd = b;
      this.selectionDirection = direction;
    }
    focus() {
      doc.activeElement = this;
      if (this.restoreBrowserRange) this.setSelectionRange(0, 0);
      fire(this, 'focus');
    }
    blur() {
      doc.activeElement = null;
      fire(this, 'blur');
    }
    scrollIntoView() {}
    getBoundingClientRect() {
      return { left: 0, top: 0, bottom: 300 };
    }
    hasPointerCapture() {
      return false;
    }
  }
  const row = {
    section: 0,
    paragraph: 0,
    text: '기울임진하게',
    editable: true,
    selectionOwner: 'section:0:body',
  };
  const content = { format: 'hwpx', paragraphs: [row] },
    canvas = new Node(),
    input = new Node(),
    viewport = new Node();
  let layout = layoutContent(content, 400, () => 10),
    busy = false;
  const requests: any[] = [],
    selections: any[] = [];
  const renderer = {
    layout: () => layout,
    paragraph: () => row,
    onGeometry() {},
    select() {},
    preview(draft: any) {
      layout = layoutContent(
        { ...content, paragraphs: [{ ...row, text: draft?.text ?? row.text }] },
        400,
        () => 10,
      );
    },
  };
  const controls = {
    ready: () => true,
    busy: () => busy,
    request(message: any) {
      requests.push(message);
      busy = true;
      return true;
    },
  };
  const direct = createCanvasEditor({
    canvas,
    input,
    viewport,
    renderer,
    controls,
    note: { textContent: '' },
    environment: { ownerDocument: doc },
    onCommittedSelection: (selection: any) => selections.push(selection),
  });
  expect(
    direct.selectTextRange(
      { section: 0, paragraph: 0, startUnit: 3, endUnit: 6 },
      { focusInput: false },
    ),
  ).toBe(true);
  return {
    doc,
    direct,
    input,
    canvas,
    row,
    requests,
    selections,
    fire,
    setBusy(value: boolean) {
      busy = value;
    },
    ack(text = '기울임기울임') {
      row.text = text;
      layout = layoutContent(content, 400, () => 10);
      busy = false;
      direct.message({ kind: 'splice', origin: 'canvas' });
    },
  };
}
test('dialog-like focus restoration cannot publish the browser zero range over a canonical find selection', () => {
  const f = fixture();
  try {
    f.input.blur();
    f.input.restoreBrowserRange = true;
    f.input.focus();
    // Browsers may enqueue select after restoring their old control selection.
    f.fire(f.input, 'select');
    expect([f.input.selectionStart, f.input.selectionEnd]).toEqual([3, 6]);
    expect(f.selections.at(-1)?.anchor.unit).toBe(3);
    expect(f.selections.at(-1)?.focus.unit).toBe(6);
    expect(f.direct.canPasteInput()).toBe(true);
    expect(f.requests).toEqual([]);
  } finally {
    f.direct.close();
  }
});
test('availability getters preserve DOM range and canonical selection without publication', () => {
  const f = fixture();
  try {
    const before = f.selections.length;
    for (let i = 0; i < 5; i++) expect(f.direct.canPasteInput()).toBe(true);
    expect([f.input.selectionStart, f.input.selectionEnd]).toEqual([3, 6]);
    expect(f.selections.length).toBe(before);
    expect(f.requests).toEqual([]);
  } finally {
    f.direct.close();
  }
});

test('public focus helper preserves backward selection and is terminal after close', () => {
  const f = fixture();
  try {
    expect(
      f.direct.selectTextRange(
        { section: 0, paragraph: 0, startUnit: 3, endUnit: 6, affinity: 'backward' },
        { focusInput: false },
      ),
    ).toBe(true);
    f.input.restoreBrowserRange = true;
    expect(f.direct.focusInput()).toBe(true);
    f.fire(f.input, 'select');
    expect([f.input.selectionStart, f.input.selectionEnd, f.input.selectionDirection]).toEqual([
      3,
      6,
      'backward',
    ]);
    expect(f.selections.at(-1)?.anchor.unit).toBe(6);
    expect(f.selections.at(-1)?.focus.unit).toBe(3);
    f.direct.close();
    f.doc.activeElement = null;
    expect(f.direct.focusInput()).toBe(false);
    expect(f.doc.activeElement).toBeNull();
  } finally {
    f.direct.close();
  }
});
test('recovered selection uses the existing beforeinput/input/ACK path once and retains next-typing caret', () => {
  const f = fixture();
  try {
    f.input.restoreBrowserRange = true;
    expect(f.direct.focusInput()).toBe(true);
    f.fire(f.input, 'select');
    expect(
      f.fire(f.input, 'beforeinput', { inputType: 'insertFromPaste', data: '기울임' })
        .defaultPrevented,
    ).toBe(false);
    // Unit simulation of the browser default insertion, never a real clipboard E2E.
    f.input.value = '기울임기울임';
    f.input.setSelectionRange(6, 6);
    f.fire(f.input, 'input', { inputType: 'insertFromPaste', data: '기울임' });
    expect(f.requests.length).toBe(1);
    expect(f.requests[0]).toMatchObject({
      kind: 'splice',
      startUnit: 3,
      endUnit: 6,
      text: '기울임',
    });
    expect(f.direct.canPasteInput()).toBe(false);
    f.ack();
    expect(f.input.value).toBe('기울임기울임');
    expect([f.input.selectionStart, f.input.selectionEnd]).toEqual([6, 6]);
    f.fire(f.input, 'beforeinput', { inputType: 'insertText', data: 'x' });
    f.input.value += 'x';
    f.input.setSelectionRange(7, 7);
    f.fire(f.input, 'input', { inputType: 'insertText', data: 'x' });
    expect(f.requests.length).toBe(2);
    expect(f.requests[1]).toMatchObject({ kind: 'splice', startUnit: 6, endUnit: 6, text: 'x' });
    f.ack('기울임기울임x');
    expect([f.input.selectionStart, f.input.selectionEnd]).toEqual([7, 7]);
  } finally {
    f.direct.close();
  }
});
test('focus does not rewrite composition, pending draft, or permission availability', () => {
  for (const mode of ['composition', 'pending', 'busy', 'readonly']) {
    const f = fixture();
    try {
      if (mode === 'composition') {
        f.fire(f.input, 'compositionstart');
        f.input.value = '조합중';
        f.input.setSelectionRange(2, 2);
      }
      if (mode === 'pending') {
        f.input.value = '기울임기울임';
        f.input.setSelectionRange(6, 6);
        f.fire(f.input, 'input');
        expect(f.requests.length).toBe(1);
      }
      if (mode === 'busy') f.setBusy(true);
      if (mode === 'readonly') f.row.editable = false;
      const text = f.input.value,
        range = [f.input.selectionStart, f.input.selectionEnd];
      expect(f.direct.canPasteInput()).toBe(false);
      expect(f.direct.focusInput()).toBe(true);
      expect(f.input.value).toBe(text);
      expect([f.input.selectionStart, f.input.selectionEnd]).toEqual(range);
      expect(f.requests.length).toBe(mode === 'pending' ? 1 : 0);
    } finally {
      f.direct.close();
    }
  }
});
