import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createDemoShell } from '../src/shell.ts';
import { actionAvailability, demoRoute, fontSizePoints } from '../src/shell-model.ts';
import { Document, all, fire } from './fake-dom.mjs';

const routes = {
  headless: '/demo/headless/',
  vanilla: '/demo/vanilla/',
  react: '/demo/react/',
  svelte: '/demo/svelte/',
};
function setup(extra = {}, doc = new Document()) {
  const root = doc.createElement('div'),
    calls = [],
    files = [],
    fixtures = [],
    errors = [];
  let state = {
    title: '원본.hwp',
    status: '문서를 선택하세요',
    openFile: { enabled: true },
    openFixture: { enabled: true },
    actions: {
      bold: { enabled: true, pressed: 'mixed' },
      save: { enabled: false, reason: '편집 세션을 먼저 여세요.' },
      'set-font-size': { enabled: true },
      'set-zoom': { enabled: true },
    },
  };
  const shell = createDemoShell(root, {
    framework: 'vanilla',
    routes,
    fixtures: [{ id: 'one.hwp', name: '한글 문서.hwp' }],
    getState: () => state,
    onAction: (action) => calls.push(action),
    onOpenFile: (file) => files.push(file),
    onOpenFixture: (id) => fixtures.push(id),
    onError: (e) => errors.push(e),
    ...extra,
  });
  return {
    doc,
    root,
    shell,
    calls,
    files,
    fixtures,
    errors,
    set state(next) {
      state = next;
    },
    get state() {
      return state;
    },
    command: (id) => all(root, (n) => n.tagName === 'BUTTON' && n.dataset.command === id),
    role: (role) => all(root, (n) => n.dataset.role === role)[0],
  };
}

test('SSR importing shell has no DOM Worker or fetch side effects', () => {
  const url = new URL('../src/shell.ts', import.meta.url).href;
  const script = `for (const key of ['document','window','Worker','ResizeObserver','fetch']) Object.defineProperty(globalThis,key,{get(){throw Error('side effect '+key)}}); await import(${JSON.stringify(url)});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('actual example URLs are injected; RN is absent; unsafe routes fail before DOM mutation', () => {
  const h = setup();
  const links = all(h.root, (n) => n.tagName === 'A');
  assert.deepEqual(
    links.map((n) => n.href),
    Object.values(routes),
  );
  assert.equal(links.find((n) => n.getAttribute('aria-current') === 'page').textContent, 'Vanilla');
  for (const bad of ['#', 'javascript:alert(1)', '//foreign/', '/\\foreign/', '/bad\npath'])
    assert.throws(() => demoRoute(bad));
  const root = h.doc.createElement('div');
  assert.throws(() =>
    createDemoShell(root, {
      framework: 'vanilla',
      routes: { ...routes, react: '#' },
      fixtures: [],
      getState: () => h.state,
    }),
  );
  assert.equal(root.children.length, 0);
  h.shell.destroy();
});

test('disabled explanations are accessible and clicks recheck current capability', () => {
  const h = setup(),
    bold = h.command('bold')[0],
    save = h.command('save')[0];
  assert.equal(bold.getAttribute('aria-pressed'), 'mixed');
  assert.equal(save.disabled, true);
  assert.match(save.title, /편집 세션/);
  const description = all(h.root, (n) => n.id === save.getAttribute('aria-describedby'))[0];
  assert.match(description.textContent, /편집 세션/);
  assert.match(all(h.root, (n) => n.className === 'hwp-demo-support')[0].textContent, /편집 세션/);
  fire(save, 'click');
  assert.deepEqual(h.calls, []);
  h.state = { ...h.state, busy: true };
  fire(bold, 'click');
  assert.deepEqual(h.calls, []);
  h.state = { ...h.state, busy: false };
  fire(bold, 'click');
  assert.deepEqual(h.calls, [{ command: 'bold' }]);
  assert.equal(
    h.state.actions.bold.pressed,
    'mixed',
    'shell does not optimistically edit document/selection state',
  );
  h.shell.destroy();
});

test('disconnected callbacks keep tools and pickers disabled even if capability is true', () => {
  const h = setup({ onAction: undefined, onOpenFile: undefined, onOpenFixture: undefined });
  assert.equal(h.command('bold')[0].disabled, true);
  assert.match(h.command('bold')[0].title, /연결/);
  assert.equal(h.role('file-picker').disabled, true);
  assert.equal(h.role('fixture-picker').disabled, true);
  h.shell.destroy();
});

test('file and allowlisted fixture intents share no local document model or fetch', () => {
  const h = setup(),
    file = h.role('file-picker'),
    picker = h.role('fixture-picker');
  const open = all(h.root, (n) => n.tagName === 'BUTTON' && n.textContent === '예제 열기')[0];
  const original = { name: '문서.hwp' };
  file.files = [original];
  file.value = 'document';
  fire(file, 'change');
  assert.deepEqual(h.files, [original]);
  assert.equal(file.value, '');
  fire(file, 'change');
  assert.equal(h.files.length, 2);
  picker.value = '../../secret';
  fire(open, 'click');
  assert.deepEqual(h.fixtures, []);
  picker.value = 'one.hwp';
  fire(open, 'click');
  assert.deepEqual(h.fixtures, ['one.hwp']);
  assert.equal(h.state.title, '원본.hwp');
  h.shell.destroy();
});

test('font size drafts use pt, reject nondecimal inputs, and refresh preserves focused draft', () => {
  const h = setup(),
    size = all(h.root, (n) => n.dataset.command === 'set-font-size' && n.tagName === 'INPUT')[0];
  const form = all(h.root, (n) => n.className === 'hwp-demo-size')[0];
  for (const raw of [
    '',
    '0',
    '-1',
    'NaN',
    'Infinity',
    '1e2',
    '0x10',
    '😀',
    '１２',
    '12.001',
    '4096.01',
  ]) {
    size.value = raw;
    fire(form, 'submit');
    assert.deepEqual(h.calls, [], raw);
  }
  size.value = '10.25';
  fire(form, 'submit');
  assert.deepEqual(h.calls, [{ command: 'set-font-size', points: 10.25 }]);
  h.state = { ...h.state, fontSizePoints: 20 };
  size.focus();
  size.value = '11.50';
  h.shell.update();
  assert.equal(size.value, '11.50');
  h.shell.update({ resetFormatDraft: true });
  assert.equal(
    size.value,
    '20',
    'bridge clears draft on selection/document replacement even while focused',
  );
  h.doc.activeElement = null;
  h.shell.update();
  assert.equal(size.value, '20');
  h.shell.destroy();
});

test('root-scoped instances do not share IDs or mutate host subtree; destroy is terminal', () => {
  const h = setup(),
    other = setup({}, h.doc);
  const firstIds = new Set(all(h.root, (n) => Boolean(n.id)).map((n) => n.id));
  assert.equal(
    all(other.root, (n) => Boolean(n.id)).some((n) => firstIds.has(n.id)),
    false,
  );
  const hostChild = h.doc.createElement('canvas');
  h.shell.surfaceMount.append(hostChild);
  const oldButton = h.command('bold')[0];
  h.shell.update();
  assert.equal(h.shell.surfaceMount.children[0], hostChild);
  h.shell.destroy();
  h.shell.destroy();
  h.shell.update();
  fire(oldButton, 'click');
  assert.deepEqual(h.calls, []);
  assert.equal(h.root.children.length, 0);
  fire(other.command('bold')[0], 'click');
  assert.equal(other.calls.length, 1);
  other.shell.destroy();
});

test('headless has no canvas host and bounded trace uses text rather than HTML', () => {
  const h = setup({ framework: 'headless' });
  assert.equal(h.shell.surfaceMount, null);
  assert.ok(h.shell.headlessMount);
  assert.equal(all(h.root, (n) => n.tagName === 'CANVAS' || n.tagName === 'TEXTAREA').length, 0);
  h.shell.setTrace(
    Array.from({ length: 120 }, (_, i) => ({
      event: 'update',
      detail: `<img src=x onerror=evil()> ${i}`,
    })),
  );
  const trace = all(h.root, (n) => n.tagName === 'OL')[0];
  assert.equal(trace.children.length, 100);
  assert.match(trace.children[0].textContent, /20$/);
  assert.equal(all(h.root, (n) => n.tagName === 'IMG').length, 0);
  h.shell.destroy();
  h.shell.setTrace([{ event: 'late', detail: 'late' }]);
  assert.equal(trace.children.length, 100);
});

test('sync exceptions, async rejection and reporter failure do not publish success or revive disposed UI', async () => {
  let reject;
  const errors = [],
    h = setup({
      onAction: () =>
        new Promise((_, r) => {
          reject = r;
        }),
      onError: (error) => errors.push(error),
    });
  fire(h.command('bold')[0], 'click');
  reject(new Error('rejected'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(errors.length, 1);
  assert.equal(h.state.status, '문서를 선택하세요');
  fire(h.command('bold')[0], 'click');
  h.shell.destroy();
  reject(new Error('late'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(errors.length, 1);
  const throwing = setup({
    onAction() {
      throw new Error('failure');
    },
    onError() {
      throw new Error('reporter');
    },
  });
  fire(throwing.command('bold')[0], 'click');
  assert.match(throwing.root.textContent, /완료하지 못했습니다/);
  throwing.shell.destroy();
});

test('menu Escape restores summary focus and reports expanded state', () => {
  const h = setup(),
    menu = all(h.root, (n) => n.tagName === 'DETAILS' && n.className === 'hwp-demo-menu')[0];
  menu.open = true;
  fire(menu, 'toggle');
  assert.equal(menu.children[0].getAttribute('aria-expanded'), 'true');
  fire(menu, 'keydown', { key: 'Escape' });
  assert.equal(menu.open, false);
  assert.equal(h.doc.activeElement, menu.children[0]);
  h.shell.destroy();
});

test('pure presentation capability policy never enables absent actions', () => {
  assert.equal(actionAvailability({ title: '', status: '' }, 'save', true).enabled, false);
  assert.equal(fontSizePoints('0.01'), 0.01);
  assert.equal(fontSizePoints('4096'), 4096);
});

test('explicit open cancellation keeps a status outcome without a generic failure banner', async () => {
  const { DocumentOpenCancelledError } = await import('../src/document-open-consent.ts');
  for (const error of [
    new DocumentOpenCancelledError(),
    Object.assign(Error('TransportLost'), { name: 'DocumentOpenCancelledError' }),
  ]) {
    const f = setup({
      onOpenFixture: async () => {
        throw error;
      },
    });
    fire(f.role('open-selected-example'), 'click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const reason = all(f.root, (n) => n.className === 'hwp-demo-reason')[0];
    assert.equal(
      reason.textContent,
      error instanceof DocumentOpenCancelledError
        ? ''
        : '요청을 완료하지 못했습니다. 문서 상태를 확인하세요.',
    );
    assert.equal(f.errors.at(-1), error);
    f.shell.destroy();
  }
});
