import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoShell } from '../src/shell.ts';
import { Document, all, fire } from './fake-dom.mjs';
function setup() {
  const doc = new Document(),
    root = doc.createElement('div'),
    calls = [];
  const shell = createDemoShell(root, {
    framework: 'vanilla',
    routes: { vanilla: '/v/', react: '/r/', svelte: '/s/', headless: '/h/' },
    fixtures: [],
    getState: () => ({
      title: '문서',
      status: '',
      actions: {
        save: { enabled: true },
        cut: { enabled: true },
        'insert-chart': { enabled: false, reason: '차트 연결 없음' },
      },
    }),
    onAction: (a) => calls.push(a),
  });
  return {
    doc,
    root,
    calls,
    shell,
    primary: all(root, (n) => n.className === 'hwp-demo-tool-groups')[0],
    extra: all(root, (n) => n.className === 'hwp-demo-menu hwp-demo-extra-tools')[0],
  };
}
const buttons = (root) => all(root, (n) => n.tagName === 'BUTTON');
test('기본 순서와 추가 도구 및 장식 SVG 접근성을 보존한다', () => {
  const h = setup();
  assert.deepEqual(
    buttons(h.primary).map((n) => n.dataset.command),
    [
      'cut',
      'copy',
      'paste',
      'format-copy',
      'toggle-marks',
      'toggle-paragraph-marks',
      'toggle-grid',
      'character-properties',
      'paragraph-properties',
      'insert-table',
      'table-cell-properties',
      'insert-shape',
      'insert-image',
      'object-properties',
      'insert-symbol',
      'insert-link',
      'insert-footnote',
      'insert-endnote',
      'insert-header',
      'insert-footer',
      'find',
      'replace',
    ],
  );
  assert.equal(h.primary.children.length, 8);
  assert.ok(
    h.primary.children.every(
      (n) => n.getAttribute('role') === 'group' && n.getAttribute('aria-label'),
    ),
  );
  assert.deepEqual(
    buttons(h.extra).map((n) => n.dataset.command),
    ['save', 'insert-chart', 'word-count'],
  );
  assert.equal(h.primary.contains(h.extra), false);
  for (const b of [...buttons(h.primary), ...buttons(h.extra)]) {
    const icon = b.children[0];
    assert.equal(icon.namespaceURI, 'http://www.w3.org/2000/svg');
    assert.equal(icon.getAttribute('aria-hidden'), 'true');
    assert.equal(icon.getAttribute('focusable'), 'false');
    assert.equal(icon.textContent, '');
    assert.equal(b.getAttribute('aria-label'), b.children[1].textContent);
  }
  h.shell.destroy();
});
test('추가 도구의 판정·실행·닫기·키보드 복귀와 기존 메뉴 상호배제를 보존한다', () => {
  const h = setup(),
    [save, chart] = buttons(h.extra),
    summary = h.extra.children[0];
  assert.equal(save.disabled, false);
  assert.equal(chart.disabled, true);
  assert.match(chart.title, /차트 연결 없음/);
  fire(chart, 'click');
  assert.deepEqual(h.calls, []);
  h.extra.open = true;
  fire(h.extra, 'toggle');
  assert.equal(summary.getAttribute('aria-expanded'), 'true');
  fire(save, 'click');
  assert.deepEqual(h.calls, [{ command: 'save' }]);
  assert.equal(h.extra.open, false);
  h.extra.open = true;
  fire(h.extra, 'keydown', { key: 'Escape' });
  assert.equal(h.extra.open, false);
  assert.equal(h.doc.activeElement, summary);
  const menu = all(h.root, (n) => n.className === 'hwp-demo-menu')[0];
  menu.open = true;
  h.extra.open = true;
  fire(h.extra, 'toggle');
  assert.equal(menu.open, false);
  menu.open = true;
  fire(menu, 'toggle');
  assert.equal(h.extra.open, false);
  assert.equal(h.extra.contains(all(h.root, (n) => n.className === 'hwp-demo-support')[0]), false);
  const cut = buttons(h.primary)[0];
  assert.equal(fire(cut, 'pointerdown', { button: 0 }).defaultPrevented, true);
  assert.equal(fire(cut, 'pointerdown', { button: 1 }).defaultPrevented, false);
  h.shell.destroy();
  fire(save, 'click');
  assert.equal(h.calls.length, 1);
});

test('바꾸기·문서 통계와 서식 메뉴 정렬은 기존 command와 실제 가용성을 재사용한다', () => {
  const h = setup();
  try {
    const replace = buttons(h.primary).find((n) => n.dataset.command === 'replace');
    const count = buttons(h.extra).find((n) => n.dataset.command === 'word-count');
    assert.ok(replace && count);
    assert.equal(replace.disabled, true);
    assert.equal(count.disabled, true);
    fire(replace, 'click');
    fire(count, 'click');
    assert.deepEqual(h.calls, []);
    const format = all(h.root, (n) => n.className === 'hwp-demo-menu').find(
      (n) => n.children[0]?.textContent === '서식',
    );
    assert.ok(format);
    assert.deepEqual(
      buttons(format)
        .map((n) => n.dataset.command)
        .filter((id) => id.startsWith('align-')),
      [
        'align-left',
        'align-center',
        'align-right',
        'align-justify',
        'align-distribute',
        'align-distribute-space',
      ],
    );
  } finally {
    h.shell.destroy();
  }
});
test('지원된 노출 보완 명령은 payload 위조 없이 각각 한 번 dispatch한다', () => {
  const doc = new Document(),
    root = doc.createElement('div'),
    calls = [];
  let enabled = true;
  const ids = [
    'replace',
    'word-count',
    'align-left',
    'align-center',
    'align-right',
    'align-justify',
  ];
  const shell = createDemoShell(root, {
    framework: 'vanilla',
    routes: { vanilla: '/v/', react: '/r/', svelte: '/s/', headless: '/h/' },
    fixtures: [],
    getState: () => ({
      title: '',
      status: '',
      actions: Object.fromEntries(ids.map((id) => [id, { enabled }])),
    }),
    onAction: (a) => calls.push(a),
  });
  try {
    const primary = all(root, (n) => n.className === 'hwp-demo-tool-groups')[0];
    const extra = all(root, (n) => n.className === 'hwp-demo-menu hwp-demo-extra-tools')[0];
    const format = all(root, (n) => n.className === 'hwp-demo-menu').find(
      (n) => n.children[0]?.textContent === '서식',
    );
    for (const id of ids) {
      const location = id === 'replace' ? primary : id === 'word-count' ? extra : format;
      const b = buttons(location).find((n) => n.dataset.command === id);
      assert.ok(b);
      fire(b, 'click');
    }
    assert.deepEqual(
      calls,
      ids.map((command) => ({ command })),
    );
    enabled = false;
    shell.update();
    const stale = buttons(primary).find((n) => n.dataset.command === 'replace');
    fire(stale, 'click');
    assert.equal(calls.length, ids.length);
  } finally {
    shell.destroy();
  }
});
