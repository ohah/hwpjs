import { documentFixture, fire as dialogFire } from './formatting-dialog-test-dom.ts';
import test, { after } from 'node:test';
import { installFormattingTestStyles } from './formatting-style-preload.mjs';
const styles = installFormattingTestStyles();
after(() => styles.deregister());
const { createFontNameView } = await import('../src/font-name-view.ts');
const { createDemoShell } = await import('../src/shell.ts');
import assert from 'node:assert/strict';
import { Document, all, fire } from './fake-dom.mjs';
function setup(equal = false) {
  const doc = new Document(),
    root = doc.createElement('div'),
    calls = [];
  const fontNames = Object.fromEntries(
    ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'].map((l) => [
      l,
      { kind: 'single', name: equal ? '공통' : l + ' 원본' },
    ]),
  );
  const shell = createDemoShell(root, {
    framework: 'vanilla',
    routes: { headless: '/', vanilla: '/', react: '/', svelte: '/' },
    fixtures: [],
    getState: () => ({
      title: '원본',
      status: 'ready',
      fontNames,
      fontSizePoints: 15,
      actions: {
        'font-name': { enabled: true },
        bold: { enabled: true, pressed: 'mixed' },
        'set-font-size': { enabled: true },
      },
    }),
    onAction: (a) => calls.push(a),
  });
  return {
    root,
    shell,
    calls,
    language: all(root, (n) => n.getAttribute?.('aria-label') === '글꼴 적용 언어')[0],
  };
}
test('스타일 허수칸 제거/언어 대표+7개 실제 labelmap', () => {
  const f = setup();
  try {
    assert.equal(all(f.root, (n) => n.getAttribute?.('aria-label') === '현재 스타일').length, 0);
    assert.deepEqual(
      f.language.children.map((n) => n.textContent),
      ['대표', '한글', '영문', '한자', '일어', '외국어', '기호', '사용자'],
    );
    assert.equal(
      all(f.root, (n) => n.dataset.role === 'format-font-picker')[0].textContent,
      '언어별 글꼴',
    );
  } finally {
    f.shell.destroy();
  }
});
test('대표에서는 한글명 위장없이 공통이름만 요약', () => {
  const f = setup(true);
  try {
    assert.equal(
      all(f.root, (n) => n.dataset.role === 'format-font-picker')[0].textContent,
      '공통',
    );
  } finally {
    f.shell.destroy();
  }
});
test('명시 영문 선택은 영문 원명과 같은 글꼴창 intent', () => {
  const f = setup();
  try {
    f.language.value = 'latin';
    fire(f.language, 'change');
    assert.equal(
      all(f.root, (n) => n.dataset.role === 'format-font-picker')[0].textContent,
      'latin 원본',
    );
    const button = all(
      f.root,
      (n) => n.tagName === 'BUTTON' && n.dataset.command === 'font-name',
    )[0];
    fire(button, 'click');
    assert.deepEqual(f.calls.at(-1), { command: 'font-name', language: 'latin' });
  } finally {
    f.shell.destroy();
  }
});
test('대표 클릭은 한글이 아닌 대표 언어 범위를 명시', () => {
  const f = setup();
  try {
    const button = all(
      f.root,
      (n) => n.tagName === 'BUTTON' && n.dataset.command === 'font-name',
    )[0];
    fire(button, 'click');
    assert.deepEqual(f.calls.at(-1), { command: 'font-name', language: 'representative' });
    assert.equal(
      all(f.root, (n) => n.dataset.command === 'bold' && n.tagName === 'BUTTON')[0].getAttribute(
        'aria-pressed',
      ),
      'mixed',
    );
  } finally {
    f.shell.destroy();
  }
});

test('실제 글꼴 view 대표 option과 전체언어 안내/확인 버튼', () => {
  const f = documentFixture();
  let applied = 0;
  const languages = ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'];
  const view = createFontNameView(f.root, {
    onInput() {},
    onLanguage() {},
    onApply() {
      applied++;
    },
    onCancel() {},
  });
  const state = {
    languages,
    values: Object.fromEntries(languages.map((l) => [l, { kind: 'single', name: '원본' + l }])),
    reasons: Object.fromEntries(languages.map((l) => [l, null])),
    representativeReason: null,
    language: 'representative',
    draft: '새 글꼴',
    suggestions: ['문서 글꼴'],
    pending: false,
    refreshRequired: false,
    stale: false,
    error: null,
    canApply: true,
  };
  try {
    view.update(state);
    view.show();
    const select = f.role('font-name-language');
    assert.equal(select.value, 'representative');
    assert.equal(select.children.filter((n) => n.value === 'representative').length, 1);
    assert.match(f.text(), /한 번의 요청/);
    assert.equal(f.role('font-name-apply').disabled, false);
    dialogFire(f.role('font-name-apply'), 'click');
    assert.equal(applied, 1);
    view.update({ ...state, language: 'latin' });
    assert.match(f.text(), /선택한 언어의 글꼴만/);
  } finally {
    view.dispose();
  }
});
test('실제 글꼴 view 대표 pending/IME는 중복 요청하지 않음', () => {
  const f = documentFixture();
  let applied = 0;
  const languages = ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'];
  const view = createFontNameView(f.root, {
    onInput() {},
    onLanguage() {},
    onApply() {
      applied++;
    },
    onCancel() {},
  });
  const state = {
    languages,
    values: Object.fromEntries(languages.map((l) => [l, { kind: 'single', name: '원본' }])),
    reasons: Object.fromEntries(languages.map((l) => [l, null])),
    representativeReason: null,
    language: 'representative',
    draft: '새 글꼴',
    suggestions: [],
    pending: true,
    refreshRequired: false,
    stale: false,
    error: null,
    canApply: false,
  };
  try {
    view.update(state);
    view.show();
    dialogFire(f.role('font-name-apply'), 'click');
    assert.equal(applied, 0);
    view.update({ ...state, pending: false, canApply: true });
    const dialog = view.getDialogElement();
    dialogFire(dialog, 'compositionstart');
    dialogFire(f.role('font-name-apply'), 'click');
    assert.equal(applied, 0);
    dialogFire(dialog, 'compositionend');
    dialogFire(f.role('font-name-apply'), 'click');
    assert.equal(applied, 1);
  } finally {
    view.dispose();
  }
});
