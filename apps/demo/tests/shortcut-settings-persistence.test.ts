import { test, expect } from 'bun:test';
import { mountShortcutSettings } from '../src/shortcut-settings.ts';
import { SHORTCUT_STORAGE_KEY } from '../src/shortcut-presentation.ts';
import { Document, all, fire } from './fake-dom.mjs';

const warning = '설정은 적용했지만 브라우저에 저장하지 못했습니다. JSON으로 내보내세요.';
const success = '단축키 설정을 적용했습니다.';
const override = (code = 'F9') => ({
  version: 1,
  bindings: [{ id: 'new-document', command: 'new-document', code, modifiers: ['Mod'] }],
});
function fixture() {
  const doc = new Document(),
    values = new Map<string, string>(),
    statuses: string[] = [];
  let fails = false;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (fails) throw Error('QuotaExceededError');
      values.set(key, value);
    },
  };
  doc.defaultView = { navigator: { platform: 'Win32' }, localStorage: storage };
  const create = doc.createElement.bind(doc);
  doc.createElement = (tag: string) => {
    const element = create(tag),
      append = element.append.bind(element);
    element.append = (...children: any[]) =>
      append(
        ...children.map((child) => (typeof child === 'string' ? doc.createTextNode(child) : child)),
      );
    return element;
  };
  const root = doc.createElement('div'),
    surface = doc.createElement('div');
  const mount = () =>
    mountShortcutSettings({
      root,
      surface,
      available: () => true,
      execute: () => {},
      onStatus: (message: string) => statuses.push(message),
    });
  const settings = mount();
  const file = all(root, (node: any) => node.dataset.role === 'shortcut-config')[0];
  const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
  const begin = (text: () => Promise<string>) => {
    file.files = [{ size: 100, text }];
    fire(file, 'change');
  };
  return {
    doc,
    settings,
    mount,
    values,
    statuses,
    begin,
    settle,
    failStorage() {
      fails = true;
    },
    async load(config = override()) {
      begin(async () => JSON.stringify(config));
      await settle();
    },
  };
}
const code = (settings: ReturnType<typeof mountShortcutSettings>) =>
  settings.getConfig().bindings.find((binding) => binding.id === 'new-document')!.code;

test('failed import persistence leaves the warning last while F9 applies only to the live host', async () => {
  const f = fixture();
  try {
    f.failStorage();
    await f.load();
    expect(code(f.settings)).toBe('F9');
    expect(
      f.settings.resolveCommand({
        code: 'F9',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      } as KeyboardEvent),
    ).toBe('new-document');
    expect(f.statuses).toEqual([warning]);
    expect(f.values.size).toBe(0);
    f.settings.dispose();
    const remounted = f.mount();
    try {
      expect(code(remounted)).toBe('KeyN');
    } finally {
      remounted.dispose();
    }
  } finally {
    f.settings.dispose();
  }
});
test('successful import persists F9 and reports success once; remount restores it', async () => {
  const f = fixture();
  try {
    await f.load();
    expect(f.statuses).toEqual([success]);
    expect(f.values.has(SHORTCUT_STORAGE_KEY)).toBe(true);
    f.settings.dispose();
    const remounted = f.mount();
    try {
      expect(code(remounted)).toBe('F9');
    } finally {
      remounted.dispose();
    }
  } finally {
    f.settings.dispose();
  }
});
test('failed persistence preserves an earlier durable F8 while the live host uses F9', async () => {
  const f = fixture();
  try {
    await f.load(override('F8'));
    const before = [...f.values];
    f.failStorage();
    await f.load();
    expect(code(f.settings)).toBe('F9');
    expect([...f.values]).toEqual(before);
    expect(f.statuses).toEqual([success, warning]);
    f.settings.dispose();
    const remounted = f.mount();
    try {
      expect(code(remounted)).toBe('F8');
    } finally {
      remounted.dispose();
    }
  } finally {
    f.settings.dispose();
  }
});
test('absent browser storage reports unsaved application rather than durable success', async () => {
  const f = fixture();
  try {
    delete f.doc.defaultView.localStorage;
    await f.load();
    expect(code(f.settings)).toBe('F9');
    expect(f.statuses).toEqual([warning]);
    f.settings.dispose();
    const remounted = f.mount();
    try {
      expect(code(remounted)).toBe('KeyN');
    } finally {
      remounted.dispose();
    }
  } finally {
    f.settings.dispose();
  }
});
test('conflicting import retains both live and durable bindings and never reports success', async () => {
  const f = fixture();
  try {
    await f.load();
    const before = [...f.values];
    f.statuses.length = 0;
    await f.load(override('KeyS'));
    expect(code(f.settings)).toBe('F9');
    expect([...f.values]).toEqual(before);
    expect(f.statuses).toHaveLength(1);
    expect(f.statuses[0]).toContain('conflict');
  } finally {
    f.settings.dispose();
  }
});
test('a stale async import cannot overwrite a newer live-only application warning', async () => {
  const f = fixture();
  let finish!: (text: string) => void;
  try {
    f.begin(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    f.failStorage();
    f.settings.setConfig(override('F10'));
    finish(JSON.stringify(override()));
    await f.settle();
    expect(code(f.settings)).toBe('F10');
    expect(f.statuses).toEqual([warning]);
    expect(f.values.size).toBe(0);
  } finally {
    f.settings.dispose();
  }
});
