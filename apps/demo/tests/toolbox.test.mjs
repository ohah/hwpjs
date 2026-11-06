import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
      'new-document',
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
  assert.equal(h.primary.children.length, 9);
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
  const cut = buttons(h.primary).find((n) => n.dataset.command === 'cut');
  assert.ok(cut);
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

test('서식 아이콘은 이름·눌림·미지원 이유와 최신 capability 및 종료 경계를 보존한다', () => {
  const doc = new Document(),
    root = doc.createElement('div'),
    calls = [];
  const ids = [
    'undo',
    'redo',
    'bold',
    'italic',
    'underline',
    'strike',
    'text-color',
    'font-name',
    'align-left',
    'align-center',
    'align-right',
    'align-justify',
    'align-distribute',
    'align-distribute-space',
  ];
  let enabled = true;
  const shell = createDemoShell(root, {
    framework: 'vanilla',
    routes: { vanilla: '/v/', react: '/r/', svelte: '/s/', headless: '/h/' },
    fixtures: [],
    getState: () => ({
      title: '',
      status: '',
      actions: Object.fromEntries(
        ids.map((id) => [
          id,
          {
            enabled: enabled && id !== 'align-distribute-space',
            pressed: id === 'bold' ? 'mixed' : undefined,
            reason: '현재 선택에서 지원하지 않습니다.',
          },
        ]),
      ),
    }),
    onAction: (a) => calls.push(a),
  });
  try {
    const bar = all(root, (n) => n.className === 'hwp-demo-formatbar')[0];
    const groups = all(bar, (n) => n.className === 'hwp-demo-format-group');
    assert.deepEqual(
      groups.map((n) => n.getAttribute('aria-label')),
      ['실행 취소와 다시 실행', '문자 서식', '문단 정렬'],
    );
    const tools = buttons(bar).filter((n) => n.className === 'hwp-demo-format-tool');
    assert.deepEqual(
      tools.map((n) => n.dataset.command),
      ids,
    );
    for (const b of tools) {
      assert.equal(b.children[0].namespaceURI, 'http://www.w3.org/2000/svg');
      assert.equal(b.children[0].getAttribute('aria-hidden'), 'true');
      assert.equal(b.children[0].getAttribute('focusable'), 'false');
      assert.equal(b.children[1].className, 'hwp-demo-sr');
      assert.equal(b.getAttribute('aria-label'), b.children[1].textContent);
      assert.equal(
        b.children[0].dataset.icon,
        b.dataset.command === 'font-name' ? 'character-properties' : b.dataset.command,
      );
    }
    assert.equal(
      tools.find((n) => n.dataset.command === 'bold').getAttribute('aria-pressed'),
      'mixed',
    );
    const unsupported = tools.at(-1);
    assert.equal(unsupported.disabled, true);
    const description = all(root, (n) => n.id === unsupported.getAttribute('aria-describedby'))[0];
    assert.match(description.textContent, /현재 선택/);
    assert.match(unsupported.title, /현재 선택/);
    fire(unsupported, 'click');
    assert.deepEqual(calls, []);
    for (const b of tools.slice(0, -1)) {
      assert.equal(fire(b, 'pointerdown', { button: 0 }).defaultPrevented, true);
      fire(b, 'click');
    }
    assert.deepEqual(
      calls,
      ids
        .slice(0, -1)
        .map((command) =>
          command === 'font-name' ? { command, language: 'representative' } : { command },
        ),
    );
    enabled = false;
    for (const b of tools) fire(b, 'click');
    assert.equal(calls.length, 13, '갱신 전에도 최신 capability로 차단한다');
    shell.update();
    assert.ok(tools.every((b) => b.disabled));
    shell.destroy();
    for (const b of tools) fire(b, 'click');
    assert.equal(calls.length, 13);
  } finally {
    shell.destroy();
  }
});

test('25px 서식 행의 아이콘 포커스 링은 버튼 안쪽에 있고 공통 포커스 규칙을 보존한다', () => {
  const css = readFileSync(new URL('../src/shell.css', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../src/editor-layout.css', import.meta.url), 'utf8');
  const block = (source, selector) => {
    const start = source.indexOf(selector + ' {');
    assert.ok(start >= 0, selector);
    return source.slice(start + selector.length + 2, source.indexOf('}', start));
  };
  const px = (rule, property) => {
    const match = rule.match(new RegExp('(?:^|[;\\n])\\s*' + property + ':\\s*(-?[0-9]+)px'));
    assert.ok(match, property);
    return Number(match[1]);
  };
  const common = block(css, '.hwp-demo :focus-visible');
  const local = block(css, '.hwp-demo-format-tool:focus-visible');
  const row = block(layout, '#app > .hwp-demo');
  const bar = block(layout, '#app .hwp-demo-formatbar');
  const group = block(layout, '#app .hwp-demo-format-group');
  const button = block(css, '.hwp-demo-format-tool');
  const icon = block(css, '.hwp-demo-format-tool .hwp-demo-symbol');
  assert.equal(px(common, 'outline'), 2);
  assert.equal(px(common, 'outline-offset'), 2, '공통·모달 포커스는 그대로 둔다');
  assert.equal(px(local, 'outline-offset'), -2);
  assert.doesNotMatch(local, /(?:^|;)\s*outline\s*:/, '공통 outline 색과 두께를 상속한다');
  assert.match(bar, /overflow-y:\s*hidden/);
  assert.match(group, /flex-wrap:\s*nowrap/);
  assert.match(css, /box-sizing:\s*border-box/);
  assert.equal(px(row, '--hwp-format-height'), 25);
  assert.equal(px(button, 'height'), 21);
  assert.equal(px(group, 'height'), 21);
  assert.equal(px(icon, 'height'), 18);
  const contentHeight =
    px(row, '--hwp-format-height') -
    2 * px(bar, 'padding') -
    px(block(css, '.hwp-demo-formatbar'), 'border-bottom');
  const outsideExtent = (offset) => Math.max(0, px(common, 'outline') + offset);
  const beforeHeight = px(button, 'height') + 2 * outsideExtent(px(common, 'outline-offset'));
  const afterHeight = px(button, 'height') + 2 * outsideExtent(px(local, 'outline-offset'));
  assert.equal(contentHeight, 22);
  assert.equal(beforeHeight, 29);
  assert.ok(beforeHeight > contentHeight, '외곽 링은 기존 고정행 안에 들어가지 않는다');
  assert.equal(afterHeight, 21);
  assert.ok(afterHeight <= contentHeight, '안쪽 링은 버튼 경계와 함께 고정행 안에 들어간다');
  assert.ok(px(icon, 'height') <= px(button, 'height') - 2, 'SVG도 버튼 테두리 안에 들어간다');
  // CSS 계산 회귀이며 실제 스크롤바·폰트·375px 키보드 포커스는 reviewer가 관측한다.
});
