import test from 'node:test';
import assert from 'node:assert/strict';
import { mountStrictLayoutSaveTool } from '../src/strict-layout-save-tool.ts';
class Node extends EventTarget {
  dataset: Record<string, string> = {};
  children: Node[] = [];
  disabled = false;
  textContent = '';
  title = '';
  files: any[] = [];
  parent?: Node;
  href = '';
  download = '';
  clicks = 0;
  focused = 0;
  focus() {
    this.focused++;
  }
  readonly ownerDocument: any;
  readonly tag: string;
  constructor(ownerDocument: any, tag: string) {
    super();
    this.ownerDocument = ownerDocument;
    this.tag = tag;
  }
  append(...nodes: Node[]) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((n) => n !== this);
  }
  setAttribute() {}
  click() {
    this.clicks++;
    this.dispatchEvent(new Event('click'));
  }
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function setup() {
  const made: Node[] = [],
    doc: any = {
      createElement(tag: string) {
        const n = new Node(doc, tag);
        made.push(n);
        return n;
      },
      createTextNode(text: string) {
        const n = new Node(doc, 'text');
        n.textContent = text;
        return n;
      },
    };
  const root = new Node(doc, 'root');
  const listeners = new Set<() => void>();
  let available = true,
    disposed = 0,
    cleared = 0;
  const calls: any[] = [];
  let task: ((options: any) => Promise<void>) | undefined;
  const saver: any = {
    available: () => available,
    async save(options: any) {
      calls.push(options);
      await task?.(options);
    },
    clearFont() {
      cleared++;
    },
    dispose() {
      disposed++;
    },
  };
  let documentId = 'first';
  const editor: any = {
    getEditorState: () => ({ documentId, status: 'ready', content: { format: 'hwp5' } }),
    registerStateListener(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const tool = mountStrictLayoutSaveTool({
    root: root as any,
    editor,
    saver,
    filename: () => '한글.hwp',
    consent: () => false,
  });
  const role = (name: string) => made.find((n) => n.dataset.role === name)!;
  return {
    root,
    made,
    role,
    tool,
    calls,
    saver,
    listeners,
    set available(value: boolean) {
      available = value;
      for (const fn of listeners) fn();
    },
    set task(fn: (options: any) => Promise<void>) {
      task = fn;
    },
    replaceDocument() {
      documentId = 'second';
      for (const fn of listeners) fn();
    },
    get disposed() {
      return disposed;
    },
    get cleared() {
      return cleared;
    },
  };
}
test('public shell mounts an explicit discoverable tool without preparing or saving', () => {
  const f = setup();
  assert.equal(f.root.children.length, 1);
  assert.equal(f.calls.length, 0);
  assert.equal(f.role('strict-layout-save').textContent, '글꼴 측정 후 HWP 저장');
  f.available = false;
  assert.equal(f.role('strict-layout-save').disabled, true);
  f.role('strict-layout-save').click();
  assert.equal(f.calls.length, 0);
  f.tool.dispose();
  assert.equal(f.root.children.length, 0);
  assert.equal(f.disposed, 1);
  assert.equal(f.listeners.size, 0);
});
test('tool passes only explicit font/consent and strict action; no stale option', async () => {
  const f = setup();
  const font = { name: 'approved.ttf' };
  f.role('strict-layout-font').files = [font];
  f.role('strict-layout-save').click();
  await tick();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].fontFile, font);
  assert.equal(f.calls[0].allowUnprotectedOutput, false);
  assert.equal('allowStaleLayout' in f.calls[0], false);
  assert.equal(f.role('strict-layout-save').dataset.state, 'saved');
  f.tool.dispose();
});
test('file change aborts pending publication; failure remains visible, dispose owns cleanup', async () => {
  const f = setup();
  let release!: () => void;
  f.task = async (options) => {
    await new Promise<void>((r) => {
      release = r;
    });
    options.signal.throwIfAborted();
  };
  f.role('strict-layout-save').click();
  f.role('strict-layout-font').dispatchEvent(new Event('change'));
  assert.equal(f.calls[0].signal.aborted, true);
  assert.equal(f.cleared, 1);
  release();
  await tick();
  assert.notEqual(f.role('strict-layout-save').dataset.state, 'saved');
  f.task = async () => {
    throw Error('UnsupportedPlainBody');
  };
  f.role('strict-layout-save').click();
  await tick();
  assert.equal(f.role('strict-layout-save').dataset.state, 'failed');
  assert.match(f.role('strict-layout-save-status').textContent, /UnsupportedPlainBody/);
  f.tool.dispose();
});

test('document replacement clears selected font and cancels old UI publication', async () => {
  const f = setup();
  let release!: () => void;
  (f.role('strict-layout-font') as any).value = 'old-font.ttf';
  f.task = async (options) => {
    await new Promise<void>((r) => {
      release = r;
    });
    options.signal.throwIfAborted();
  };
  f.role('strict-layout-save').click();
  f.replaceDocument();
  assert.equal(f.calls[0].signal.aborted, true);
  assert.equal((f.role('strict-layout-font') as any).value, '');
  release();
  await tick();
  assert.equal(f.role('strict-layout-save-status').textContent, '');
  assert.equal(f.role('strict-layout-save').dataset.state, 'idle');
  f.tool.dispose();
});

test('font decode failure localizes status and restores file focus without changing consent or file', async () => {
  const f = setup();
  const file = { name: 'original.ttf' };
  f.role('strict-layout-font').files = [file];
  f.task = async () => {
    throw Error('StrictFontDecodeFailed');
  };
  f.role('strict-layout-save').click();
  await tick();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].fontFile, file);
  assert.equal(f.calls[0].allowUnprotectedOutput, false);
  assert.equal('allowStaleLayout' in f.calls[0], false);
  assert.equal(f.role('strict-layout-save').dataset.state, 'failed');
  assert.equal(f.role('strict-layout-save').disabled, false);
  assert.equal(f.role('strict-layout-font').focused, 1);
  assert.deepEqual(f.role('strict-layout-font').files, [file]);
  assert.match(f.role('strict-layout-save-status').textContent, /브라우저가 읽지 못했습니다/);
  assert.match(f.role('strict-layout-save-status').textContent, /기존 저장 옵션/);
  assert.equal(
    f.made.some((node) => node.tag === 'a'),
    false,
  );
  await tick();
  assert.equal(f.calls.length, 1);
  f.tool.dispose();
});

test('old font decode rejection cannot steal focus after document replacement', async () => {
  const f = setup();
  let reject!: (error: Error) => void;
  f.task = async () =>
    new Promise<void>((_resolve, fail) => {
      reject = fail;
    });
  f.role('strict-layout-save').click();
  f.replaceDocument();
  reject(Error('StrictFontDecodeFailed'));
  await tick();
  assert.equal(f.role('strict-layout-font').focused, 0);
  assert.equal(f.role('strict-layout-save-status').textContent, '');
  assert.equal(f.role('strict-layout-save').dataset.state, 'idle');
  f.tool.dispose();
});
