import test, { after } from 'node:test';
import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
const styles = new Set([
  new URL('../src/document-open-ui.css', import.meta.url).href,
  new URL('../src/dialog-layer.css', import.meta.url).href,
]);
const hooks = registerHooks({
  load(url, context, next) {
    if (styles.has(url)) return { format: 'module', source: 'export {};', shortCircuit: true };
    return next(url, context);
  },
});
after(() => hooks.deregister());
const { createDemoShell } = await import('../src/shell.ts');
import { Document, all, fire } from './fake-dom.mjs';
function setup() {
  const doc = new Document(),
    root = doc.createElement('div');
  let state = {
    title: '원본.hwp',
    status: 'ready',
    fontName: '휴먼명조',
    fontNameTitle: '언어별 문서 원본 글꼴 · 영문: HCI Poppy',
    fontNameLanguage: 'hangul',
    fontNames: Object.fromEntries(
      ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'].map((language) => [
        language,
        {
          kind: 'single',
          name:
            language === 'hangul'
              ? '휴먼명조'
              : language === 'latin'
                ? 'HCI Poppy'
                : `${language} 원본`,
        },
      ]),
    ),
    fontSizeStatus: 'mixed',
    fontSizeHint: '혼합 크기',
    styleLabel: '스타일 이름 미관측',
    actions: { 'set-font-size': { enabled: true }, 'font-name': { enabled: true } },
  };
  const shell = createDemoShell(root, {
    framework: 'vanilla',
    routes: { headless: '/', vanilla: '/', react: '/', svelte: '/' },
    fixtures: [],
    getState: () => state,
    onAction() {},
    onOpenFile() {},
    onOpenFixture() {},
  });
  return {
    doc,
    root,
    shell,
    set: (v) => (state = { ...state, ...v }),
    input: () => all(root, (n) => n.getAttribute?.('aria-label') === '글자 크기 (pt)')[0],
    font: () => all(root, (n) => n.dataset.role === 'format-font-picker')[0],
    language: () => all(root, (n) => n.getAttribute?.('aria-label') === '글꼴 적용 언어')[0],
  };
}
test('실제 shell 혼합 placeholder와 원본 한글명/언어 tooltip 표시', () => {
  const f = setup();
  try {
    assert.equal(f.input().value, '');
    assert.equal(f.input().placeholder, '혼합 크기');
    assert.equal(f.input().dataset.observation, 'mixed');
    assert.equal(f.language().value, '', '기본 적용 언어는 대표');
    assert.equal(f.font().getAttribute('aria-label'), '언어별 글꼴 요약');
    assert.equal(f.font().textContent, '언어별 글꼴');
    f.language().value = 'hangul';
    fire(f.language(), 'change');
    assert.equal(f.font().getAttribute('aria-label'), '현재 한글 글꼴');
    assert.equal(f.font().textContent, '휴먼명조');
    assert.match(f.font().title, /HCI Poppy/);
  } finally {
    f.shell.destroy();
  }
});
test('관측 갱신은 입력 중 크기 초안을 덮지 않고 포커스 밖에서 원본값 반영', () => {
  const f = setup();
  try {
    const input = f.input();
    f.doc.activeElement = input;
    input.value = '22';
    f.set({ fontSizeStatus: 'single', fontSizeHint: '', fontSizePoints: 13 });
    f.shell.update();
    assert.equal(input.value, '22');
    f.doc.activeElement = null;
    f.shell.update();
    assert.equal(input.value, '13');
    assert.equal(input.placeholder, '');
  } finally {
    f.shell.destroy();
  }
});

test('readonly 쓰기 거부와 원본 글꼴·tooltip·크기 관측은 분리', () => {
  const f = setup();
  try {
    f.language().value = 'hangul';
    fire(f.language(), 'change');
    f.set({
      fontSizeStatus: 'single',
      fontSizeHint: '',
      fontSizePoints: 13,
      actions: {
        'font-name': { enabled: false, reason: 'ReadOnlyDocument' },
        'set-font-size': { enabled: false, reason: 'ReadOnlyDocument' },
      },
    });
    f.shell.update();
    assert.equal(f.font().disabled, true);
    assert.equal(f.input().disabled, true);
    assert.equal(f.font().textContent, '휴먼명조');
    assert.match(f.font().title, /HCI Poppy/);
    assert.equal(f.input().value, '13');
    assert.equal(f.input().dataset.observation, 'single');
  } finally {
    f.shell.destroy();
  }
});
