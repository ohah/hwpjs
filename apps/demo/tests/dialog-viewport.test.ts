import test from 'node:test';
import assert from 'node:assert/strict';
import { createDialogLayer } from '../src/dialog-layer.ts';
function fixture() {
  class Realm extends EventTarget {
    innerWidth = 1280;
    innerHeight = 633;
    listeners = 0;
    addEventListener(t: string, f: any, o?: any) {
      if (t === 'resize') this.listeners++;
      super.addEventListener(t, f, o);
    }
    removeEventListener(t: string, f: any, o?: any) {
      if (t === 'resize') this.listeners--;
      super.removeEventListener(t, f, o);
    }
  }
  const win = new Realm(),
    doc: any = { defaultView: win, activeElement: null };
  class Node extends EventTarget {
    children: Node[] = [];
    parentElement?: Node;
    dataset: any = {};
    style: any = {};
    open = false;
    value = '';
    textContent = '';
    attributes = new Map();
    captured: number | undefined;
    constructor(readonly ownerDocument: any) {
      super();
    }
    append(...n: Node[]) {
      for (const x of n) {
        x.parentElement = this;
        this.children.push(x);
      }
    }
    remove() {
      if (this.parentElement)
        this.parentElement.children = this.parentElement.children.filter((x) => x !== this);
    }
    setAttribute(k: string, v: string) {
      this.attributes.set(k, v);
    }
    getAttribute(k: string) {
      return this.attributes.get(k);
    }
    show() {
      this.open = true;
    }
    showModal() {
      this.open = true;
    }
    close() {
      this.open = false;
    }
    focus() {
      doc.activeElement = this;
    }
    setPointerCapture(n: number) {
      this.captured = n;
    }
    hasPointerCapture(n: number) {
      return this.captured === n;
    }
    releasePointerCapture() {
      this.captured = undefined;
    }
    getBoundingClientRect() {
      const width = Math.min(522, win.innerWidth - 22),
        height = Math.min(272, win.innerHeight - 30),
        left = this.style.left ? parseFloat(this.style.left) : (win.innerWidth - width) / 2,
        top = this.style.top ? parseFloat(this.style.top) : (win.innerHeight - height) / 2;
      return { left, top, width, height, right: left + width, bottom: top + height };
    }
  }
  doc.createElement = () => new Node(doc);
  const root = new Node(doc),
    layer = createDialogLayer(root as any, {
      role: 'test-window',
      title: '찾기',
      mode: 'modeless',
      onDismiss() {},
    }),
    input = new Node(doc);
  input.value = 'ㅎ';
  layer.body.append(input as any);
  layer.show(input as any);
  const header = (layer.element as any).children[0];
  const fire = (kind: string, data: any = {}) => {
    const event = new Event(kind, { cancelable: true });
    Object.assign(event, data);
    header.dispatchEvent(event);
    return event;
  };
  const drag = () => {
    const rect = layer.element.getBoundingClientRect();
    fire('pointerdown', {
      button: 0,
      pointerId: 1,
      clientX: rect.left + 20,
      clientY: rect.top + 10,
    });
    fire('pointermove', { pointerId: 1, clientX: 1100, clientY: 200 });
    fire('pointerup', { pointerId: 1 });
  };
  return {
    win,
    doc,
    input,
    layer,
    drag,
    resize(w: number, h: number) {
      win.innerWidth = w;
      win.innerHeight = h;
      win.dispatchEvent(new Event('resize'));
    },
  };
}
test('right-drag at 1280 then resize960 keeps the whole window inside viewport', () => {
  const f = fixture();
  try {
    f.drag();
    assert.equal(f.layer.element.getBoundingClientRect().right, 1272);
    f.resize(960, 633);
    const rect = f.layer.element.getBoundingClientRect();
    assert(rect.left >= 8);
    assert(rect.right <= 952);
    assert.equal(f.doc.activeElement, f.input);
    assert.equal(f.input.value, 'ㅎ');
  } finally {
    f.layer.destroy();
  }
});
test('shrinking both viewport axes respects responsive CSS size and safe margins', () => {
  const f = fixture();
  try {
    f.drag();
    f.resize(320, 220);
    const r = f.layer.element.getBoundingClientRect();
    assert(r.left >= 8 && r.top >= 8);
    assert(r.right <= 312 && r.bottom <= 212);
  } finally {
    f.layer.destroy();
  }
});
test('undragged window keeps CSS centering instead of pinning pixel offsets', () => {
  const f = fixture();
  try {
    f.resize(960, 633);
    assert.equal(f.layer.element.style.left, undefined);
  } finally {
    f.layer.destroy();
  }
});
test('dispose unregisters resize listener and no later resize mutates the detached window', () => {
  const f = fixture();
  f.drag();
  assert.equal(f.win.listeners, 1);
  f.layer.destroy();
  assert.equal(f.win.listeners, 0);
  const before = f.layer.element.style.left;
  f.resize(640, 400);
  assert.equal(f.layer.element.style.left, before);
});
