import test from 'node:test';
import assert from 'node:assert/strict';
import { formattingMarkPlans as plans } from '../../web/preview/formatting-mark-plan.mjs';
import { paintFormattingMarks as paint } from '../../web/preview/formatting-mark-paint.mjs';
import {
  canvasDisplayOptions as options,
  DEFAULT_CANVAS_DISPLAY_OPTIONS,
} from '../../web/preview/canvas-display-options.mjs';
import { layoutContent } from '../../web/preview/layout.mjs';
import { createViewOptionsBridge } from '../../apps/demo/src/view-options-bridge.ts';
import { mountFormattingMarksShortcut } from '../../apps/demo/src/formatting-marks-shortcut.ts';
const paragraph = (text = 'A \t\nB') => ({
  section: 0,
  paragraph: 0,
  text,
  selectionOwner: 'section:0:body',
  editable: true,
});
const row = () => ({
  kind: 'text',
  section: 0,
  paragraph: 0,
  startUnit: 0,
  endUnit: 4,
  text: 'A \t\n',
  x: 20,
  y: 10,
  textTop: 2,
  textHeight: 20,
  boundaries: [
    { unit: 0, x: 0 },
    { unit: 1, x: 10 },
    { unit: 2, x: 16 },
    { unit: 3, x: 40 },
    { unit: 4, x: 40 },
  ],
  tabPlacements: [{ unit: 2, state: 'placed' }],
});
test('표시 옵션 두 종류와 기존 입력 호환', () => {
  assert.equal(DEFAULT_CANVAS_DISPLAY_OPTIONS.formattingMarks, false);
  assert.deepEqual(options({ paragraphMarks: true }), { paragraphMarks: true });
  assert.deepEqual(options({ formattingMarks: true, paragraphMarks: false }), {
    paragraphMarks: false,
    formattingMarks: true,
  });
  assert(Object.isFrozen(options({ paragraphMarks: false, formattingMarks: true })));
});
test('접근자·미지의 옵션·잘못된 값 거부', () => {
  let called = 0;
  const value = {
    paragraphMarks: false,
    get formattingMarks() {
      called++;
      return true;
    },
  };
  assert.throws(() => options(value));
  assert.equal(called, 0);
  for (const value of [
    { formattingMarks: true },
    { paragraphMarks: false, formattingMarks: 1 },
    { paragraphMarks: false, extra: true },
  ])
    assert.throws(() => options(value));
});
test('원문 단위와 실제 폭으로 공백·탭·줄바꿈 분리', () => {
  const p = paragraph(),
    r = row(),
    before = structuredClone({ p, r });
  const got = plans(r, 0, p);
  assert.deepEqual(
    got.map((x) => [x.kind, x.unit, x.x, x.width]),
    [
      ['space', 1, 30, 6],
      ['tab', 2, 36, 24],
      ['line-break', 3, 60, 0],
    ],
  );
  assert(Object.isFrozen(got));
  assert(got.every(Object.isFrozen));
  assert.deepEqual({ p, r }, before);
});
test('불완전 문단·소유자·변환·다른 문단은 추정하지 않음', () => {
  for (const delta of [
    { clipped: true },
    { textStartUnit: 1 },
    { selectionOwner: null },
    { tableCell: {} },
    { drawingText: {} },
    { drawingCaption: {} },
    { createdCell: {} },
  ])
    assert.equal(plans(row(), 0, { ...paragraph(), ...delta }).length, 0);
  for (const delta of [
    { transform: [1, 0, 0, 1, 0, 0] },
    { section: 1 },
    { paragraph: 1 },
    { endUnit: 3 },
    { text: 'bad' },
    { startUnit: -1 },
  ])
    assert.equal(plans({ ...row(), ...delta }, 0, paragraph()).length, 0);
});
test('경계 누락·역순·비정상 좌표는 전체 행 거부', () => {
  for (const boundaries of [
    [],
    [
      { unit: 1, x: 0 },
      { unit: 4, x: 40 },
    ],
    [
      { unit: 0, x: 0 },
      { unit: 4, x: NaN },
    ],
    [
      { unit: 0, x: 20 },
      { unit: 4, x: 10 },
    ],
    [
      { unit: 0, x: 0 },
      { unit: 0, x: 1 },
      { unit: 4, x: 40 },
    ],
  ])
    assert.equal(plans({ ...row(), boundaries }, 0, paragraph()).length, 0);
  assert.equal(plans({ ...row(), textHeight: 0 }, 0, paragraph()).length, 0);
});
test('탭 배치가 없거나 중복·실패면 탭만 숨김', () => {
  for (const tabPlacements of [
    undefined,
    {},
    [],
    [{ unit: 2, state: 'unavailable' }],
    [
      { unit: 2, state: 'placed' },
      { unit: 2, state: 'placed' },
    ],
  ])
    assert.deepEqual(
      plans({ ...row(), tabPlacements }, 0, paragraph()).map((x) => x.kind),
      ['space', 'line-break'],
    );
});
test('객체 앵커·특수 공백은 임의 위치 표시하지 않음', () => {
  const p = paragraph('\ufffc\u00a0'),
    r = {
      ...row(),
      text: p.text,
      startUnit: 0,
      endUnit: 2,
      boundaries: [
        { unit: 0, x: 0 },
        { unit: 1, x: 10 },
        { unit: 2, x: 20 },
      ],
    };
  assert.deepEqual(plans(r, 0, p), []);
});
test('CRLF 원문 경계 하나와 빈 줄 지원', () => {
  const p = paragraph('\r\n'),
    r = {
      ...row(),
      text: p.text,
      startUnit: 0,
      endUnit: 2,
      boundaries: [
        { unit: 0, x: 0 },
        { unit: 2, x: 0 },
      ],
    };
  assert.deepEqual(
    plans(r, 0, p).map((x) => [x.kind, x.unit]),
    [['line-break', 0]],
  );
});
test('실제 조판 경계와 줄바꿈·wrap에서도 원문 보존', () => {
  const p = paragraph('가 나\n다 라');
  const content = { paragraphs: [p] };
  const before = structuredClone(content);
  const layout = layoutContent(content, 30, () => 10);
  const got = layout.rows.flatMap((r, i) => plans(r, i, p));
  assert.equal(got.filter((x) => x.kind === 'space').length, 2);
  assert.equal(got.filter((x) => x.kind === 'line-break').length, 1);
  assert.deepEqual(content, before);
});
test('그리기는 화면 상태를 복원하고 텍스트 API를 호출하지 않음', () => {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      set(t, k, v) {
        calls.push([k, v]);
        t[k] = v;
        return true;
      },
      get(t, k) {
        return (
          t[k] ??
          ((...args) => {
            assert.notEqual(k, 'fillText');
            assert.notEqual(k, 'strokeText');
            calls.push([k, ...args]);
          })
        );
      },
    },
  );
  assert.equal(paint(ctx, plans(row(), 0, paragraph()), 5), 3);
  assert.equal(calls[0][0], 'save');
  assert.equal(calls.at(-1)[0], 'restore');
  assert.equal(paint(ctx, [], 0), 0);
  assert.equal(paint(ctx, plans(row(), 0, paragraph()), NaN), 0);
});
test('그리기 예외에도 restore', () => {
  let restored = 0;
  const ctx = {
    save() {},
    restore() {
      restored++;
    },
    fillRect() {
      throw Error('paint');
    },
  };
  assert.throws(() => paint(ctx, plans(row(), 0, paragraph()), 0));
  assert.equal(restored, 1);
});
test('UI 두 토글은 현재 호스트 옵션을 각각 보존하고 focus만 요청', () => {
  const statuses = [];
  let value = { paragraphMarks: false, formattingMarks: false },
    focus = 0;
  const host = {
    getDisplayOptions: () => value,
    setDisplayOptions: (next) => {
      value = next;
      return true;
    },
    focus: () => focus++,
  };
  const bridge = createViewOptionsBridge({
    getHost: () => host,
    onStatus: (message) => statuses.push(message),
  });
  assert.equal(bridge.presentation(true)['toggle-marks'].pressed, false);
  bridge.action({ command: 'toggle-marks' });
  assert.deepEqual(value, { paragraphMarks: false, formattingMarks: true });
  assert.equal(bridge.presentation(true)['toggle-paragraph-marks'].pressed, true);
  assert.equal(bridge.presentation(true)['toggle-paragraph-marks'].enabled, false);
  bridge.action({ command: 'toggle-marks' });
  bridge.action({ command: 'toggle-paragraph-marks' });
  assert.deepEqual(value, { paragraphMarks: true, formattingMarks: false });
  bridge.action({ command: 'toggle-marks' });
  bridge.action({ command: 'toggle-marks' });
  assert.deepEqual(value, { paragraphMarks: true, formattingMarks: false });
  assert.equal(focus, 5);
  assert.deepEqual(
    statuses,
    Array(2).fill('조판 부호 일부 표시: 본문과 원본 표 셀의 공백·탭·줄바꿈을 표시합니다.'),
  );
  bridge.dispose();
  bridge.action({ command: 'toggle-marks' });
  assert.equal(focus, 5);
});
test('기존 호스트에서는 미지원 조판 토글 거부, 문단 토글은 호환', () => {
  let value = { paragraphMarks: false },
    writes = 0;
  const host = {
    getDisplayOptions: () => value,
    setDisplayOptions: (next) => {
      value = next;
      writes++;
      return true;
    },
  };
  const bridge = createViewOptionsBridge({ getHost: () => host, onStatus: () => {} });
  assert.equal(bridge.presentation(true)['toggle-marks'].enabled, false);
  bridge.action({ command: 'toggle-marks' });
  assert.equal(writes, 0);
  bridge.action({ command: 'toggle-paragraph-marks' });
  assert.deepEqual(value, { paragraphMarks: true });
  assert.equal(bridge.presentation(false)['toggle-marks'].enabled, false);
});
function keyboard(config = {}) {
  const listeners = new Map(),
    commands = [];
  let time = 100;
  const root = {
    addEventListener: (k, fn) => listeners.set(k, fn),
    removeEventListener: (k) => listeners.delete(k),
  };
  const mounted = mountFormattingMarksShortcut({
    root,
    available: () => true,
    claimed: () => false,
    execute: (c) => commands.push(c),
    onError: () => assert.fail(),
    now: () => time,
    ...config,
  });
  const fire = (code, extra = {}) => {
    let consumed = false;
    const e = {
      code,
      ctrlKey: false,
      preventDefault() {
        consumed = true;
      },
      stopImmediatePropagation() {},
      ...extra,
    };
    listeners.get('keydown')?.(e);
    return consumed;
  };
  return {
    listeners,
    commands,
    fire,
    mounted,
    advance: () => {
      time += 1600;
    },
  };
}
test('Ctrl+G 다음 C/T만 실행, 일반 Ctrl+T/C는 통과', () => {
  const k = keyboard();
  assert.equal(k.fire('KeyT', { ctrlKey: true }), false);
  assert(k.fire('KeyG', { ctrlKey: true }));
  assert(k.fire('KeyC'));
  k.fire('KeyG', { ctrlKey: true });
  k.fire('KeyT', { ctrlKey: true });
  assert.deepEqual(k.commands, ['toggle-marks', 'toggle-paragraph-marks']);
  k.mounted.dispose();
  assert.equal(k.listeners.size, 0);
  k.fire('KeyC');
  assert.equal(k.commands.length, 2);
});
test('시간초과·다른 키·focusout·IME 시작은 순차 입력 해제', () => {
  for (const cancel of [
    (k) => k.advance(),
    (k) => k.fire('KeyX'),
    (k) => k.listeners.get('focusout')(),
    (k) => k.listeners.get('compositionstart')(),
  ]) {
    const k = keyboard();
    k.fire('KeyG', { ctrlKey: true });
    cancel(k);
    assert.equal(k.fire('KeyC'), false);
    assert.deepEqual(k.commands, []);
  }
});
test('IME·반복·AltGraph·UI 입력·사용자 prefix는 가로채지 않음', () => {
  for (const extra of [
    { isComposing: true },
    { keyCode: 229 },
    { repeat: true },
    { altKey: true },
    { metaKey: true },
    { getModifierState: () => true },
    { target: { closest: () => ({ matches: () => false }) } },
  ]) {
    const k = keyboard();
    assert.equal(k.fire('KeyG', { ctrlKey: true, ...extra }), false);
    k.fire('KeyC');
    assert.equal(k.commands.length, 0);
  }
  const k = keyboard({ claimed: () => true });
  assert.equal(k.fire('KeyG', { ctrlKey: true }), false);
  const absent = keyboard({ available: () => false });
  assert.equal(absent.fire('KeyG', { ctrlKey: true }), false);
});

function tabFixture(count, tabPlacements) {
  const p = paragraph('\t'.repeat(count));
  return {
    p,
    r: {
      ...row(),
      text: p.text,
      startUnit: 0,
      endUnit: count,
      boundaries: Array.from({ length: count + 1 }, (_, unit) => ({ unit, x: unit * 8 })),
      tabPlacements,
    },
  };
}

test('많은 탭에서도 배치 슬롯·유닛·상태 관측은 선형이고 모든 부호 좌표를 보존', (t) => {
  for (const count of [256, 512, 1024]) {
    let slotReads = 0,
      unitReads = 0,
      stateReads = 0;
    const entries = Array.from({ length: count }, (_, unit) => ({
      get unit() {
        unitReads++;
        return unit;
      },
      get state() {
        stateReads++;
        return 'placed';
      },
    }));
    const placements = new Proxy(entries, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key)) slotReads++;
        return Reflect.get(target, key, receiver);
      },
    });
    const { p, r } = tabFixture(count, placements);
    const got = plans(r, 0, p);
    assert.equal(got.length, count);
    assert.equal(slotReads, count);
    assert.equal(unitReads, count);
    assert.equal(stateReads, count);
    t.diagnostic(
      JSON.stringify({
        size: count,
        boundaries: r.boundaries.length,
        plans: got.length,
        slotReads,
        unitReads,
        stateReads,
      }),
    );
    assert.deepEqual(
      got.map(({ kind, unit, x, width }) => [kind, unit, x, width]),
      Array.from({ length: count }, (_, unit) => ['tab', unit, 20 + unit * 8, 8]),
    );
    assert.equal(p.text, '\t'.repeat(count));
  }
});

test('중복 유닛은 placed 순서와 무관하게 거부하고 숫자 이외·미지원 상태는 승인하지 않음', () => {
  const placements = [
    { unit: 0, state: 'placed' },
    { unit: -0, state: 'unavailable' },
    { unit: 1, state: 'unavailable' },
    { unit: 1, state: 'placed' },
    { unit: 2, state: 'unavailable' },
    { unit: '3', state: 'placed' },
    { unit: 4, state: 'placed' },
    { unit: 5, state: 'placed' },
    { unit: 5, state: 'placed' },
    ...[
      NaN,
      Infinity,
      -1,
      6,
      1.5,
      4n,
      Symbol('unit'),
      new Number(4),
      {
        valueOf() {
          assert.fail('유닛 형변환 금지');
        },
      },
    ].map((unit) => ({ unit, state: 'placed' })),
  ];
  const { p, r } = tabFixture(6, placements);
  const before = structuredClone(placements.filter((x) => typeof x.unit === 'number'));
  assert.deepEqual(
    plans(r, 0, p).map((x) => x.unit),
    [4],
  );
  assert.deepEqual(
    placements.filter((x) => typeof x.unit === 'number'),
    before,
  );
  assert.deepEqual(plans({ ...r, tabPlacements: new Uint32Array([4]) }, 0, p), []);
});

test('배치 getter는 원문과 경계가 검증된 양의 폭 탭에서만 한 번 관측', () => {
  let reads = 0;
  const placements = [
    { unit: 0, state: 'placed' },
    { unit: 1, state: 'placed' },
  ];
  const { p, r } = tabFixture(2, placements);
  Object.defineProperty(r, 'tabPlacements', {
    get() {
      reads++;
      return placements;
    },
  });
  assert.deepEqual(
    plans(r, 0, p).map((x) => x.unit),
    [0, 1],
  );
  assert.equal(reads, 1);
  const noRead = {
    get() {
      assert.fail('불필요한 배치 getter 관측');
    },
  };
  const plain = {
    ...row(),
    text: 'a ',
    endUnit: 2,
    boundaries: [
      { unit: 0, x: 0 },
      { unit: 1, x: 10 },
      { unit: 2, x: 16 },
    ],
  };
  Object.defineProperty(plain, 'tabPlacements', noRead);
  assert.deepEqual(
    plans(plain, 0, paragraph('a ')).map((x) => x.kind),
    ['space'],
  );
  for (const bad of [
    { ...r, boundaries: [] },
    {
      ...r,
      boundaries: [
        { unit: 0, x: 0 },
        { unit: 2, x: 0 },
      ],
    },
    { ...r, text: 'wrong' },
    { ...r, transform: [1, 0, 0, 1, 0, 0] },
  ]) {
    Object.defineProperty(bad, 'tabPlacements', noRead);
    assert.deepEqual(plans(bad, 0, p), []);
  }
  const clipped = { ...r };
  Object.defineProperty(clipped, 'tabPlacements', noRead);
  assert.deepEqual(plans(clipped, 0, { ...p, clipped: true }), []);
});

test('중복·미일치 항목 상태 getter는 읽지 않고 유일한 현재 탭 상태만 원문 순서로 관측', () => {
  const trace = [];
  const entry = (unit, state, readable = true) => ({
    get unit() {
      trace.push(`unit:${unit}`);
      return unit;
    },
    get state() {
      assert(readable, '미일치·중복 상태 관측');
      trace.push(`state:${unit}`);
      return state;
    },
  });
  const { p, r } = tabFixture(3, [
    entry(0, 'placed'),
    entry(1, 'placed', false),
    entry(1, 'unavailable', false),
    entry(2, 'unavailable'),
    entry(9, 'placed', false),
  ]);
  assert.deepEqual(
    plans(r, 0, p).map((x) => x.unit),
    [0],
  );
  assert.deepEqual(trace, ['unit:0', 'unit:1', 'unit:1', 'unit:2', 'unit:9', 'state:0', 'state:2']);
});

test('희소 배열·상속 슬롯을 보존하고 iterator는 관측하지 않으며 getter 오류를 숨기지 않음', () => {
  const placements = [];
  placements.length = 4;
  const proto = Object.create(Array.prototype);
  Object.defineProperty(proto, '1', { value: { unit: 0, state: 'placed' } });
  Object.setPrototypeOf(placements, proto);
  placements[3] = { unit: 1, state: 'placed' };
  Object.defineProperty(placements, Symbol.iterator, {
    get() {
      throw new Error('iterator 관측 금지');
    },
  });
  const { p, r } = tabFixture(2, placements);
  assert.deepEqual(
    plans(r, 0, p).map((x) => x.unit),
    [0, 1],
  );
  const error = new Error('getter 원본');
  const unitThrow = [
    {
      get unit() {
        throw error;
      },
    },
  ];
  const stateThrow = [
    {
      unit: 0,
      get state() {
        throw error;
      },
    },
  ];
  for (const tabPlacements of [unitThrow, stateThrow])
    assert.throws(
      () => plans({ ...r, tabPlacements }, 0, p),
      (value) => value === error,
    );
  const throwRow = { ...r };
  Object.defineProperty(throwRow, 'tabPlacements', {
    get() {
      throw error;
    },
  });
  assert.throws(
    () => plans(throwRow, 0, p),
    (value) => value === error,
  );
});
