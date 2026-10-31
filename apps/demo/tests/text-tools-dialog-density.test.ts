import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTextToolsDialog, type SearchDraft } from '../src/text-tools-dialog.ts';
import { documentFixture, all, fire } from './formatting-dialog-test-dom.ts';
// 순수 이벤트·DOM/CSS 계약이다. 실제 픽셀·브라우저 포커스·Native 검색 증거가 아니다.
function fixture(draft: SearchDraft = { query: '찾기', replacement: '교체', direction: 'down' }) {
  const dom = documentFixture(),
    finds: boolean[] = [],
    modes: boolean[] = [];
  let dismissed = 0,
    changed = 0,
    replaced = 0,
    view: ReturnType<typeof createTextToolsDialog>;
  view = createTextToolsDialog(dom.root as unknown as HTMLElement, {
    replace: false,
    draft,
    onDismiss() {
      dismissed++;
    },
    onChange() {
      changed++;
    },
    onFind(continuing) {
      finds.push(continuing === true);
    },
    onReplace() {
      replaced++;
    },
    onMode(value) {
      modes.push(value);
      view.setMode(value);
    },
  });
  view.show();
  const role = (name: string) => {
    const found = all(dom.root).find((node) => node.dataset.role === name);
    assert(found, name);
    return found;
  };
  const klass = (name: string) => {
    const found = all(dom.root).find((node) => node.className === name);
    assert(found, name);
    return found;
  };
  return {
    ...dom,
    view,
    role,
    klass,
    finds,
    modes,
    get dismissed() {
      return dismissed;
    },
    get changed() {
      return changed;
    },
    get replaced() {
      return replaced;
    },
  };
}
test('좌우 그룹·모델리스 포커스·상태와 제한 문구를 유지한다', () => {
  const f = fixture();
  try {
    const dialog = f.role('text-search'),
      fields = f.klass('hwp-search-fields'),
      actions = f.klass('hwp-search-actions');
    assert.equal(dialog.getAttribute('aria-modal'), 'false');
    assert.equal(dialog.modal, false);
    assert.equal(f.doc.activeElement, f.role('search-query'));
    assert.equal(fields.parentElement, actions.parentElement);
    assert.equal(f.role('search-query').parentElement?.parentElement, fields);
    assert.equal(f.role('find-next').parentElement, actions);
    assert.equal(f.role('close-text-tool').parentElement, actions);
    assert.equal(f.role('search-status').getAttribute('role'), 'status');
    assert.equal(f.role('search-status').getAttribute('aria-live'), 'polite');
    const limit = f.klass('hwp-search-limit');
    assert.equal(limit.hidden, false);
    assert.match(limit.textContent, /현재 불러온 표시 범위/);
    assert.match(limit.textContent, /전체 바꾸기는 지원하지 않습니다/);
  } finally {
    f.view.destroy();
  }
});
test('찾기·바꾸기 탭 전환이 초안과 버튼·ARIA 상태를 보존한다', () => {
  const f = fixture();
  try {
    assert.equal(f.role('search-replacement').parentElement?.hidden, true);
    assert.equal(f.role('replace-selection').hidden, true);
    fire(f.role('search-tab-replace'), 'click');
    assert.deepEqual(f.modes, [true]);
    assert.equal(f.role('search-replacement').parentElement?.hidden, false);
    assert.equal(f.role('replace-selection').hidden, false);
    assert.equal(f.role('search-tab-replace').getAttribute('aria-selected'), 'true');
    assert.equal(f.role('search-tab-replace').tabIndex, 0);
    assert.equal(f.role('search-tab-find').tabIndex, -1);
    fire(f.role('replace-selection'), 'click');
    assert.equal(f.replaced, 1);
    fire(f.role('search-tab-find'), 'click');
    assert.deepEqual(f.view.getDraft(), { query: '찾기', replacement: '교체', direction: 'down' });
    assert.equal(f.role('search-tab-find').getAttribute('aria-selected'), 'true');
  } finally {
    f.view.destroy();
  }
});
test('세 방향을 유지하고 별도 창의 radio name을 공유하지 않는다', () => {
  const a = fixture(),
    b = fixture();
  try {
    for (const direction of ['down', 'up', 'all'] as const) {
      const radio = a.role('search-direction-' + direction) as unknown as HTMLInputElement;
      radio.checked = true;
      fire(radio, 'change');
      assert.equal(a.view.getDraft().direction, direction);
      for (const other of ['down', 'up', 'all'])
        assert.equal(
          (a.role('search-direction-' + other) as unknown as HTMLInputElement).checked,
          other === direction,
        );
    }
    assert.notEqual(
      (a.role('search-direction-down') as unknown as HTMLInputElement).name,
      (b.role('search-direction-down') as unknown as HTMLInputElement).name,
    );
    assert.equal(a.changed, 3);
    assert.equal(b.view.getDraft().direction, 'down');
  } finally {
    a.view.destroy();
    b.view.destroy();
  }
});
test('Enter는 찾기, IME Enter는 접수하지 않는다', () => {
  const f = fixture();
  try {
    for (const patch of [{ isComposing: true }, { keyCode: 229 }])
      fire(f.role('search-query'), 'keydown', { key: 'Enter', ...patch });
    assert.equal(f.finds.length, 0);
    const event = fire(f.role('search-query'), 'keydown', { key: 'Enter' });
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(f.finds, [false]);
  } finally {
    f.view.destroy();
  }
});
test('탭 방향키·Escape 및 모델리스 Tab 동작을 유지한다', () => {
  const f = fixture();
  try {
    fire(f.klass('hwp-search-tabs'), 'keydown', { key: 'ArrowRight' });
    assert.deepEqual(f.modes, [true]);
    assert.equal(f.doc.activeElement, f.role('search-tab-replace'));
    fire(f.klass('hwp-search-tabs'), 'keydown', { key: 'ArrowLeft' });
    assert.deepEqual(f.modes, [true, false]);
    assert.equal(f.doc.activeElement, f.role('search-tab-find'));
    const dialog = f.role('text-search');
    assert.equal(fire(dialog, 'keydown', { key: 'Tab' }).defaultPrevented, false);
    fire(dialog, 'keydown', { key: 'Escape', isComposing: true });
    fire(dialog, 'keydown', { key: 'Escape', keyCode: 229 });
    assert.equal(f.dismissed, 0);
    assert.equal(fire(dialog, 'keydown', { key: 'Escape' }).defaultPrevented, true);
    assert.equal(f.dismissed, 1);
  } finally {
    f.view.destroy();
  }
});
test('빈 검색·busy·복구 상태가 입력과 버튼을 올바르게 제한한다', () => {
  const f = fixture({ query: '', replacement: '', direction: 'down' });
  try {
    assert.equal(f.role('find-next').disabled, true);
    f.role('search-query').value = '가';
    fire(f.role('search-query'), 'input');
    assert.equal(f.role('find-next').disabled, false);
    f.view.setBusy(true);
    for (const role of [
      'search-query',
      'search-replacement',
      'search-direction-down',
      'search-direction-up',
      'search-direction-all',
      'find-next',
      'replace-selection',
      'continue-search',
    ])
      assert.equal(f.role(role).disabled, true);
    assert.equal(f.role('close-text-tool').disabled, false);
    f.view.setBusy(false);
    assert.equal(f.role('find-next').disabled, false);
    assert.equal(f.changed, 1);
  } finally {
    f.view.destroy();
  }
});
test('조건적 계속 찾기와 상태 변경이 범위 제한 안내를 숨기지 않는다', () => {
  const f = fixture();
  try {
    const limit = f.klass('hwp-search-limit'),
      text = limit.textContent;
    assert.equal(f.role('continue-search').hidden, true);
    f.view.continueFromEnd('처음부터 계속 찾기');
    assert.equal(f.role('continue-search').hidden, false);
    assert.equal(f.role('continue-search').textContent, '처음부터 계속 찾기');
    fire(f.role('continue-search'), 'click');
    assert.deepEqual(f.finds, [true]);
    f.view.setStatus('불러온 내용에서 찾지 못했습니다.');
    assert.equal(f.role('search-status').textContent, '불러온 내용에서 찾지 못했습니다.');
    f.view.continueFromEnd();
    assert.equal(f.role('continue-search').hidden, true);
    f.view.setMode(true);
    assert.equal(limit.hidden, false);
    assert.equal(limit.textContent, text);
  } finally {
    f.view.destroy();
  }
});
const css = readFileSync(new URL('../src/text-tools-dialog.css', import.meta.url), 'utf8');
const scope = ".hwp-dialog-layer[data-role='text-search']";
const rules = Array.from(
  css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g),
  (m) => ({
    selectors: m[1].split(',').map((s) => s.trim()),
    declarations: new Map(
      m[2]
        .split(';')
        .filter((s) => s.trim())
        .map((s) => {
          const colon = s.indexOf(':');
          return [s.slice(0, colon).trim(), s.slice(colon + 1).trim()];
        }),
    ),
  }),
);
const rule = (selector: string) => {
  const found = rules.find((r) => r.selectors.includes(selector));
  assert(found, selector);
  return found.declarations;
};
test('CSS는 422 폭·80 버튼 열·24 입력·28 제목과 좌측 단일 프레임을 지정한다', () => {
  assert.equal(rule(scope).get('width'), 'min(422px, calc(100vw - 24px))');
  assert.equal(
    rule(scope + ' .hwp-search-grid').get('grid-template-columns'),
    'minmax(0, 1fr) 80px',
  );
  assert.equal(rule(scope + ' .hwp-search-actions button').get('width'), '80px');
  assert.equal(
    rule(scope + ' .hwp-search-field').get('grid-template-columns'),
    '54px minmax(0, 1fr)',
  );
  assert.equal(rule(scope + ' .hwp-search-field input').get('height'), '24px');
  assert.equal(rule(scope + ' .hwp-dialog-header').get('height'), '28px');
  assert.equal(rule(scope + ' .hwp-search-fields').get('border'), '1px solid #d4d6da');
  assert.equal(rule(scope + ' .hwp-search-fields fieldset').get('border'), '0');
  assert.equal(rule(scope + ' .hwp-search-tabs').get('margin'), '0 0 8px');
});
test('입력 focus는 겹친 단일2px이며 다른 키보드 focus도 남는다', () => {
  for (const pseudo of [':focus', ':focus-visible']) {
    const r = rule(scope + ' .hwp-search-field input' + pseudo);
    assert.equal(r.get('outline'), '2px solid #0969da');
    assert.equal(r.get('outline-offset'), '-2px');
    assert.equal(r.get('box-shadow'), 'none');
  }
  assert.equal(rule(scope + ' :focus-visible').get('outline'), '2px solid #0969da');
  assert.equal(rule(scope + ' :focus-visible').get('outline-offset'), '0');
});
test('모든 선택자가 찾기 창에 한정되고 안내·좁은 화면 접근성을 보존한다', () => {
  for (const r of rules)
    for (const selector of r.selectors) assert(selector.startsWith(scope), selector);
  for (const selector of [scope + ' .hwp-search-message', scope + ' .hwp-search-limit']) {
    const r = rule(selector);
    assert.notEqual(r.get('display'), 'none');
    assert.notEqual(r.get('visibility'), 'hidden');
    assert.notEqual(r.get('opacity'), '0');
    assert.notEqual(r.get('font-size'), '0');
    assert.notEqual(r.get('height'), '0');
    assert(r.get('color'));
  }
  assert.match(css, /@media \(max-width: 360px\)/);
  const grids = rules.filter((r) => r.selectors.includes(scope + ' .hwp-search-grid'));
  assert.equal(grids.at(-1)?.declarations.get('grid-template-columns'), '1fr');
  assert.equal(rule(scope + ' .hwp-search-actions button').get('overflow-wrap'), 'anywhere');
});
