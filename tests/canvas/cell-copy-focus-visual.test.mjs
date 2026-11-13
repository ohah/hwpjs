import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 제어 소스 회귀: 실제 브라우저·전체 Surface·Native 검사가 아니다.
// 변경된 paint, 기존 blur/exit, 등록 코드 및 renderer 강조 구간을 그대로 실행한다.
const root = process.env.FOCUS_VISUAL_SOURCE_ROOT
  ? resolve(process.env.FOCUS_VISUAL_SOURCE_ROOT)
  : fileURLToPath(new URL('../../', import.meta.url));
const read = (name) => readFileSync(resolve(root, name), 'utf8');
const moduleAt = (name) => import(pathToFileURL(resolve(root, name)).href);
const { allowsCellBlockMenuFocus, bindCellBlockMenuFocus } = await moduleAt(
  'web/preview/cell-block-menu-focus.mjs',
);
const { tableCellBlockContainsBox } = await moduleAt('web/preview/table-cell-block.mjs');
const { paintRowTransform } = await moduleAt('web/preview/row-transform-paint.mjs');
const editor = read('web/preview/canvas-editor.mjs');
const renderer = read('web/preview/renderer.mjs');
const controller = read('apps/demo/src/demo-controller.ts');
function between(text, start, end) {
  const a = text.indexOf(start);
  assert.notEqual(a, -1, start);
  const b = text.indexOf(end, a + start.length);
  assert.notEqual(b, -1, end);
  return text.slice(a, b);
}
const paintSource = between(editor, '  const paint = (', '  const sync = (');
const focusSource = between(editor, '  let cellBlockMenuFocus = null;', '  const selectedRange =');
const registrationSource = between(editor, '    registerCellBlockMenu(', '    hasCellBlock:');
const controllerSource = between(
  controller,
  '    if (shell.tableMenu)',
  '    contextMenu?.registerCellBlockMenu',
);
const overlaySource = between(renderer, '    let paintedCells = 0;', '    let paintedCaret =');
const draw = new Function(
  'interaction',
  'canvas',
  'layout',
  'ctx',
  'viewport',
  'height',
  'tableCellBlockContainsBox',
  'paintRowTransform',
  `const paintSelection = interaction.historyPending ? {} : interaction;
   ${overlaySource}`,
);

const node = (parentElement = null) => ({ parentElement });
function setup({ selected = true, historyPending = false, cells = [31] } = {}) {
  const input = { ...node(), value: '', selectionStart: 0, selectionEnd: 0 };
  const menu = node(),
    edit = node(menu),
    copy = node(menu),
    ribbon = node();
  const outside = node(),
    body = node(),
    undo = node(menu),
    events = { signal: { aborted: false } };
  const doc = { ...node(), addEventListener() {} },
    canvas = { dataset: {} },
    frames = [];
  let active = input;
  const handlers = new Map();
  const listen = (target, type, fn) => {
    if (!handlers.has(target)) handlers.set(target, new Map());
    handlers.get(target).set(type, fn);
  };
  const dispatch = (target, type, event) => handlers.get(target)?.get(type)?.(event);
  const block = selected
    ? {
        stage: 'cell',
        cell: { row: 1, column: 0 },
        paint: { section: 0, tableNode: 20, cells: new Set(cells) },
      }
    : null;
  const boxes = [
    { section: 0, tableNode: 20, listNode: 31, x: 0, y: 10, width: 50, height: 20 },
    { section: 0, tableNode: 20, listNode: 36, x: 50, y: 10, width: 50, height: 20 },
    { section: 0, tableNode: 999, listNode: 31, x: 0, y: 10, width: 50, height: 20 },
    { section: 0, tableNode: 20, listNode: 31, x: 0, y: 1000, width: 50, height: 20 },
  ];
  const sink = {
    select(interaction) {
      const fills = [];
      const ctx = { fillRect: (...args) => fills.push(args) };
      draw(
        interaction,
        canvas,
        { boxes },
        ctx,
        { scrollTop: 0 },
        200,
        tableCellBlockContainsBox,
        paintRowTransform,
      );
      frames.push({
        active: interaction.active,
        painted: Number(canvas.dataset.paintedCellBlockCount),
        fills,
      });
    },
  };
  const c = new Function(
    'input',
    'canvas',
    'ownerDocument',
    'renderer',
    'activeElement',
    'listen',
    'allowsCellBlockMenuFocus',
    'bindCellBlockMenuFocus',
    'events',
    'initialBlock',
    'initialPending',
    `let cellBlock = initialBlock, mergeCapture = null, blockSelection = null;
     let generatedGridSelectionEpoch = 0;
     const selectionOrigin = 'canvas';
     const anchor = null, focus = null, target = null, drag = null;
     const composing = false, pending = null, multiComposition = null, committed = '';
     const historyPending = initialPending, historyPaintBarrier = { pending: false };
     const inputIntents = { size: 0 }, controls = { busy: () => false };
     const place = () => {}, onComposition = () => {}, onCommittedSelection = () => {};
     const updateReadOnly = () => {};
     ${paintSource}
     ${focusSource}
     const registration = { ${registrationSource} };
     return { registerCellBlockMenu: registration.registerCellBlockMenu,
       paint, count: () => cellBlock?.paint.cells.size ?? 0,
       replaceBlockForControl() { cellBlock = { ...cellBlock }; } };
    `,
  )(
    input,
    canvas,
    doc,
    sink,
    () => active,
    listen,
    allowsCellBlockMenuFocus,
    bindCellBlockMenuFocus,
    events,
    block,
    historyPending,
  );
  const shell = { shapeCopyFocusTargets: [edit, copy, ribbon] };
  const owner = new Function(
    'host',
    'shell',
    `let closed = false; ${controllerSource}
     return { close() { closed = true; }, replace() { host = {}; } };`,
  )(c, shell);
  c.paint();
  return {
    input,
    menu,
    edit,
    copy,
    ribbon,
    outside,
    body,
    undo,
    events,
    canvas,
    frames,
    c,
    owner,
    get last() {
      return frames.at(-1);
    },
    blur(to) {
      active = to;
      dispatch(input, 'blur', { type: 'blur', relatedTarget: to });
    },
    // blur 동안의 중간 activeElement와 안정된 focusin을 분리한다.
    beginBlur(to) {
      active = body;
      dispatch(input, 'blur', { type: 'blur', relatedTarget: to });
    },
    focus(to) {
      active = to;
      dispatch(doc, 'focusin', { type: 'focusin', target: to });
      if (to === input) dispatch(input, 'focus', {});
    },
    pendingFocusEvent(to) {
      dispatch(doc, 'focusin', { type: 'focusin', target: to });
    },
    observesAllowed(to) {
      return allowsCellBlockMenuFocus(to, input);
    },
    pointer(to) {
      dispatch(doc, 'pointerdown', { type: 'pointerdown', target: to });
    },
  };
}

test('기준: textarea에서 현재 단일 셀만 실제 fillRect로 강조한다', () => {
  const h = setup();
  assert.equal(h.c.count(), 1);
  assert.equal(h.last.painted, 1);
  assert.deepEqual(h.last.fills, [[0, 10, 50, 20]]);
});

test('편집 summary로 blur: logical 1과 실제 painted 1이 함께 유지된다', (t) => {
  const h = setup();
  h.blur(h.edit);
  t.diagnostic(
    JSON.stringify({
      logical: h.c.count(),
      active: h.last.active,
      painted: h.last.painted,
      fillRectCalls: h.last.fills.length,
    }),
  );
  assert.equal(h.c.count(), 1);
  assert.equal(h.last.painted, 1);
  assert.equal(h.last.fills.length, 1);
});

for (const name of ['copy', 'ribbon']) {
  test(`등록된 ${name} 버튼 포커스에서 셀 강조를 유지한다`, () => {
    const h = setup();
    h.blur(h[name]);
    assert.equal(h.c.count(), 1);
    assert.equal(h.last.painted, 1);
  });
}

test('등록된 모양 복사 버튼의 자식 노드는 기존 등록 정책을 따른다', () => {
  const h = setup(),
    icon = node(h.copy);
  h.blur(h.edit);
  h.focus(icon);
  assert.equal(h.c.count(), 1);
  assert.equal(h.last.painted, 1);
});

test('사각 선택은 선택된 두 셀만 강조하며 다른 표/화면 밖 셀을 제외한다', () => {
  const h = setup({ cells: [31, 36] });
  h.blur(h.edit);
  assert.equal(h.c.count(), 2);
  assert.equal(h.last.painted, 2);
  assert.deepEqual(h.last.fills, [
    [0, 10, 50, 20],
    [50, 10, 50, 20],
  ]);
});

for (const name of ['outside', 'undo', 'menu']) {
  test(`미등록 ${name}로 직접 blur하면 기존 논리 선택과 강조를 해제한다`, () => {
    const h = setup();
    h.blur(h[name]);
    assert.equal(h.c.count(), 0);
    assert.equal(h.last.painted, 0);
    assert.equal(h.last.active, false);
  });
  test(`편집 summary에서 ${name}로 focusin하면 기존 선택을 해제한다`, () => {
    const h = setup();
    h.blur(h.edit);
    h.focus(h[name]);
    assert.equal(h.c.count(), 0);
    assert.equal(h.last.painted, 0);
  });
}

test('메뉴 밖 pointerdown은 포커스 이동 전이라도 보존 선택을 해제한다', () => {
  const h = setup();
  h.blur(h.edit);
  h.pointer(h.outside);
  assert.equal(h.c.count(), 0);
  assert.equal(h.last.painted, 0);
});

test('relatedTarget null은 선택을 보존하지 않는다', () => {
  const h = setup();
  h.blur(null);
  assert.equal(h.c.count(), 0);
  assert.equal(h.last.painted, 0);
});

for (const reason of ['close', 'replace', 'abort']) {
  test(`${reason} 뒤 재그리기에서 등록 소유권을 다시 확인한다`, () => {
    const h = setup();
    h.blur(h.edit);
    if (reason === 'abort') h.events.signal.aborted = true;
    else h.owner[reason]();
    h.c.paint();
    assert.equal(h.last.painted, 0);
    assert.equal(h.last.active, false);
  });
}

test('다른 textarea 소유의 등록은 현재 선택 강조를 허용하지 않는다', () => {
  const h = setup(),
    foreign = node();
  bindCellBlockMenuFocus(h.edit, (candidate) => candidate === foreign);
  h.blur(h.edit);
  assert.equal(h.c.count(), 0);
  assert.equal(h.last.painted, 0);
});

test('선택이 없으면 등록 메뉴 포커스도 입력 활성 상태를 만들지 않는다', () => {
  const h = setup({ selected: false });
  h.blur(h.edit);
  assert.equal(h.last.active, false);
  assert.equal(h.last.painted, 0);
});

test('historyPending이면 등록 포커스에도 renderer의 기존 강조 억제를 유지한다', () => {
  const h = setup({ historyPending: true });
  h.blur(h.edit);
  assert.equal(h.c.count(), 1);
  assert.equal(h.last.painted, 0);
});

test('textarea 복귀는 같은 선택을 강조하며 이후 바깥 blur는 해제한다', () => {
  const h = setup();
  h.blur(h.edit);
  h.focus(h.input);
  assert.equal(h.c.count(), 1);
  assert.equal(h.last.painted, 1);
  h.blur(h.outside);
  assert.equal(h.c.count(), 0);
  assert.equal(h.last.painted, 0);
});

test('바깥에서 해제된 선택은 등록 메뉴로 돌아와도 되살리지 않는다', () => {
  const h = setup();
  h.blur(h.edit);
  h.focus(h.outside);
  h.focus(h.edit);
  assert.equal(h.c.count(), 0);
  assert.equal(h.last.active, false);
  assert.equal(h.last.painted, 0);
});

for (const name of ['edit', 'copy', 'ribbon']) {
  test(`중간 body blur → 허용 ${name} focusin에서만 다시 그린다`, (t) => {
    const h = setup();
    h.beginBlur(h[name]);
    assert.equal(h.c.count(), 1);
    assert.equal(h.last.active, false);
    assert.equal(h.last.painted, 0);
    assert.equal(h.observesAllowed(h[name]), true);
    const beforeFrames = h.frames.length;
    h.focus(h[name]);
    t.diagnostic(
      JSON.stringify({
        event: 'body-blur-then-allowed-focusin',
        target: name,
        logical: h.c.count(),
        registeredOwner: h.observesAllowed(h[name]),
        painted: h.last.painted,
        repaintDelta: h.frames.length - beforeFrames,
      }),
    );
    assert.equal(h.c.count(), 1);
    assert.equal(h.last.painted, 1);
    assert.equal(h.frames.length, beforeFrames + 1);
  });
}

test('허용 대상 pointerdown은 중간 body 상태나 안정 포커스에서 새 paint를 만들지 않는다', () => {
  const h = setup();
  h.beginBlur(h.edit);
  const beforeFocus = h.frames.length;
  h.pointer(h.edit);
  assert.equal(h.frames.length, beforeFocus);
  assert.equal(h.last.painted, 0);
  h.focus(h.edit);
  const afterFocus = h.frames.length;
  h.pointer(h.copy);
  assert.equal(h.frames.length, afterFocus);
  assert.equal(h.c.count(), 1);
});

test('focusin 대상과 현재 activeElement가 일치하기 전에는 새 paint를 만들지 않는다', () => {
  const h = setup();
  h.beginBlur(h.edit);
  const before = h.frames.length;
  h.pendingFocusEvent(h.edit);
  assert.equal(h.frames.length, before);
  assert.equal(h.last.painted, 0);
  assert.equal(h.c.count(), 1);
});

test('중간 blur 후 controller 소유권이 사라지면 focusin은 기존 선택을 해제한다', () => {
  const h = setup();
  h.beginBlur(h.edit);
  h.owner.close();
  h.focus(h.edit);
  assert.equal(h.observesAllowed(h.edit), false);
  assert.equal(h.c.count(), 0);
  assert.equal(h.last.painted, 0);
});

test('중간 blur 후 같은 보존 셀 블록이 아니면 허용 focusin도 새 paint를 만들지 않는다', () => {
  const h = setup();
  h.beginBlur(h.edit);
  const before = h.frames.length;
  h.c.replaceBlockForControl();
  h.focus(h.edit);
  assert.equal(h.frames.length, before);
  assert.equal(h.last.painted, 0);
});

test('중간 blur → 바깥 focusin은 기존 선택과 강조를 해제한다', () => {
  const h = setup();
  h.beginBlur(h.edit);
  h.focus(h.outside);
  assert.equal(h.c.count(), 0);
  assert.equal(h.last.painted, 0);
});

test('중간 blur → summary → 메뉴 버튼 전이는 현재 대상별로 다시 그린다', () => {
  const h = setup();
  h.beginBlur(h.edit);
  h.focus(h.edit);
  const before = h.frames.length;
  h.focus(h.copy);
  assert.equal(h.frames.length, before + 1);
  assert.equal(h.c.count(), 1);
  assert.equal(h.last.painted, 1);
});
