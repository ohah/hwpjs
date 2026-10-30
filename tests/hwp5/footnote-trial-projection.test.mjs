import test from 'node:test';
import assert from 'node:assert/strict';
import { sample, mixedSample, policy } from './helpers/footnote-trial-fixtures.mjs';
import { referenceFootnoteArea as beforeArea } from './helpers/footnote-trial-reference.mjs';
import {
  placeFootnoteArea as afterArea,
  checkFootnoteAreaTrial as probe,
} from '../../web/preview/footnote-area-placement.mjs';
import { paginateFootnoteContinuationUnits as before } from '../../web/preview/footnote-continuation-engine.mjs';
import { paginateFootnoteContinuationUnits as after } from '../../web/preview/footnote-continuation-engine.mjs';
import { prepareMixedFootnoteContinuation as beforeMixed } from '../../web/preview/mixed-footnote-continuation.mjs';
import { prepareMixedFootnoteContinuation as afterMixed } from '../../web/preview/mixed-footnote-continuation.mjs';
import { paginateMeasuredPlainFootnoteContinuations as measuredBefore } from '../../web/preview/plain-footnote-continuation.mjs';
import { paginateMeasuredPlainFootnoteContinuations as measuredAfter } from '../../web/preview/plain-footnote-continuation.mjs';

const column = { x: 20, y: 20, width: 100, height: 100 };
const p = { ...policy, aboveLine: 0, belowLine: 0, betweenNotes: 0 };
const row = (y = 0, height = 1) => ({ kind: 'text', x: 0, y, width: 1, height, text: 'n' });
const note = (node = 0, rows = [row()], height = 10) => ({
  kind: 'footnote',
  section: 0,
  noteNode: node,
  width: 100,
  height,
  rows,
});
function expectedTrial(notes, selectedPolicy = p, bottom = 120, maxRows = 20000) {
  const result = beforeArea(notes, selectedPolicy, column, 20, 0, maxRows);
  if (result.state !== 'placed') return result;
  return {
    state: 'placed',
    rowsFit: result.rows.every((r) => r.y >= 20 && r.y + r.height <= bottom),
  };
}
function snapshot(result) {
  if (result.state !== 'ready') return result;
  const { notesFor, ...data } = result;
  return { ...data, allocations: result.page.pages.map((page) => notesFor([], page.ordinal, 0)) };
}
function equivalent(args) {
  const expected = snapshot(before(...structuredClone(args)));
  const actual = snapshot(after(...structuredClone(args), undefined, undefined, true));
  assert.deepEqual(actual, expected);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
  return actual;
}

test('일반 출력은 메타데이터·own key 순서·속성·symbol·상속 clip을 보존한다', () => {
  const symbol = Symbol('원 메타데이터');
  const input = Object.assign(
    Object.create({ pageClip: { x: 1, y: 2, width: 3, height: 4 } }),
    row(),
  );
  Object.defineProperty(input, '__proto__', { value: '원 문자열', enumerable: true });
  input[symbol] = { retained: true };
  const notes = [note(0, [input])];
  const a = beforeArea(notes, p, column, 20, 0),
    b = afterArea(notes, p, column, 20, 0);
  assert.deepEqual(b, a);
  assert.deepEqual(Reflect.ownKeys(b.rows[0]), Reflect.ownKeys(a.rows[0]));
  assert.deepEqual(
    Object.getOwnPropertyDescriptors(b.rows[0]),
    Object.getOwnPropertyDescriptors(a.rows[0]),
  );
  assert.deepEqual(probe(notes, p, column, 20, 0, 120), expectedTrial(notes));
});

function traced(call, throwAt = 0) {
  const events = [],
    reason = Error('관측 오류 ' + throwAt);
  let step = 0;
  const observe = (text) => {
    events.push(text);
    if (++step === throwAt) throw reason;
  };
  const wrap = (value, label) =>
    new Proxy(value, {
      get(target, key, receiver) {
        observe(label + '.get:' + String(key));
        return Reflect.get(target, key, receiver);
      },
      ownKeys(target) {
        observe(label + '.keys');
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, key) {
        observe(label + '.descriptor:' + String(key));
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
  const clip = wrap({ x: 0, y: 0, width: 1, height: 1 }, 'clip');
  const inputRow = wrap({ ...row(), pageClip: clip, extra: '원 속성' }, 'row');
  const box = wrap({ x: 0, y: 0, width: 1, height: 1 }, 'box');
  const prefix = wrap({ x: 0, y: 0, width: 1, height: 1, text: '1' }, 'prefix');
  const inputNote = wrap(
    { ...note(0, [inputRow]), boxes: [box], numberPrefixes: [prefix] },
    'note',
  );
  try {
    const result = call([inputNote]);
    return { result, events };
  } catch (error) {
    assert.equal(error, reason);
    return { error: error.message, events };
  }
}
test('generic 입력 Proxy/getter의 own 조회·열거 순서와 예외 정체성을 보존한다', () => {
  const full = (fn) => (notes) => fn(notes, p, column, 20, 0);
  const baseline = traced(full(beforeArea));
  assert.deepEqual(traced(full(afterArea)), baseline);
  for (const at of [1, 5, 17, 31, 51, baseline.events.length])
    assert.deepEqual(traced(full(afterArea), at), traced(full(beforeArea), at));
});
test('trial도 입력 getter 읽기는 생략하지 않고 결과 객체 보관만 생략한다', () => {
  const a = traced((notes) => expectedTrial(notes));
  const b = traced((notes) => probe(notes, p, column, 20, 0, 120));
  assert.deepEqual(b, a);
  for (const at of [1, 17, 41, a.events.length])
    assert.deepEqual(
      traced((notes) => probe(notes, p, column, 20, 0, 120), at),
      traced((notes) => expectedTrial(notes), at),
    );
});
test('앞 행의 height·clip·symbol이 다음 행 결과에 남지 않는다', () => {
  const symbol = Symbol('앞 행만');
  const first = { ...row(), pageClip: { x: 0, y: 0, width: 1, height: 1 }, [symbol]: true };
  const second = row(1, 1);
  Object.defineProperty(second, 'height', { value: 1, enumerable: false });
  const notes = [note(0, [first, second])];
  assert.deepEqual(probe(notes, p, column, 20, 0, 120), expectedTrial(notes));
  assert.equal(expectedTrial(notes).rowsFit, false);
});
test('상속 높이 조회는 구조 검사가 끝난 뒤 원 receiver/key로 실행된다', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'height');
  assert.equal(descriptor, undefined);
  function run(call) {
    const events = [];
    Object.defineProperty(Object.prototype, 'height', {
      configurable: true,
      get() {
        events.push(Reflect.ownKeys(this).map(String));
        return 1;
      },
    });
    try {
      const r = row();
      Object.defineProperty(r, 'height', { value: 1, enumerable: false });
      return { result: call([note(0, [r])]), events };
    } finally {
      delete Object.prototype.height;
    }
  }
  assert.deepEqual(
    run((n) => probe(n, p, column, 20, 0, 120)),
    run((n) => expectedTrial(n)),
  );
});
function coercionCase(
  call,
  { beforeFailure = false, structural = false, throwCoercion = false } = {},
) {
  const events = [];
  let reads = 0;
  const reason = Error('늦은 높이 오류');
  const value = {
    valueOf() {
      events.push('coercion');
      if (throwCoercion) throw reason;
      return 1;
    },
  };
  const r = row();
  Object.defineProperty(r, 'height', {
    enumerable: true,
    get() {
      return ++reads === 4 ? value : 1;
    },
  });
  const notes = [note(0, [r]), note(1)];
  if (beforeFailure) notes.reverse();
  if (structural) notes[1].boxes = [{ x: 0, y: 0, width: -1, height: 1 }];
  try {
    return { result: call(notes), events };
  } catch (error) {
    assert.equal(error, reason);
    return { error: reason.message, events };
  }
}
test('객체 높이 coercion·오류는 원 bounds 검사 순서에서만 실행한다', () => {
  for (const options of [
    {},
    { structural: true },
    { throwCoercion: true },
    { beforeFailure: true },
  ]) {
    const a = coercionCase((n) => expectedTrial(n, p, 101), options);
    const b = coercionCase((n) => probe(n, p, column, 20, 0, 101), options);
    assert.deepEqual(b, a);
  }
});
test('더 뒤 구조 오류가 앞의 bounds 실패보다 먼저 반환되는 계약을 유지한다', () => {
  const a = [note(0), { ...note(1), boxes: [{ x: 0, y: 0, width: -1, height: 1 }] }];
  const b = probe(a, p, column, 20, 0, 21);
  assert.equal(b.error, 'InvalidFootnoteArea');
  assert.deepEqual(b, expectedTrial(a, p, 21));
});
test('전체 overflow·중복 owner·행과 prefix/box 한도 오류 우선순서를 유지한다', () => {
  const invalid = row(0, 2);
  const cases = [
    [[note(0), note(0, [invalid], 1)], 20000, 'AmbiguousFootnoteArea'],
    [[note(0, [row()], 60), note(0, [row()], 60)], 20000, 'FootnoteAreaOverflow'],
    [[note(0), note(0)], 1, 'AmbiguousFootnoteArea'],
    [[note(0), note(1)], 1, 'FootnoteAreaLimit'],
    [
      [{ ...note(0), numberPrefixes: [{ x: 0, y: 0, width: 1, height: 1 }] }],
      1,
      'FootnoteAreaLimit',
    ],
    [
      [
        {
          ...note(0),
          boxes: [
            { x: 0, y: 0, width: 1, height: 1 },
            { x: 0, y: 1, width: 1, height: 1 },
          ],
        },
      ],
      1,
      'FootnoteAreaLimit',
    ],
  ];
  for (const [notes, limit, error] of cases) {
    const expected = expectedTrial(notes, p, 120, limit);
    assert.equal(expected.error, error);
    assert.deepEqual(probe(notes, p, column, 20, 0, 120, limit), expected);
  }
});
test('소유 plain의 직접 수치 경로는 물질화 경로와 같은 결과를 반환한다', () => {
  for (const [f, h] of [
    [1, 1],
    [8, 1],
    [32, 4],
    [32, 16],
  ]) {
    const result = equivalent(sample(f, 16, Array(h).fill(1)));
    assert.equal(result.state, 'ready', result.error);
  }
  for (const heights of [
    [0.1, 0.2, 0.3],
    [11.1, 22.2, 33.3],
    [1e-4, 0.003, 9.7],
  ]) {
    const args = sample(3, 30, heights);
    args[1].height = 7500;
    equivalent(args);
  }
});
test('실제 mixed 내부 호출도 표·clip·prefix·plain 공존 결과를 보존한다', () => {
  function run(prepare) {
    const args = mixedSample();
    args[3][0].numberPrefixes = [{ x: 0, y: 0, width: 1, height: 1, text: '1' }];
    args[3][0].continuationUnits[0].prefixIndices = [0];
    args[3].push({ ...sample(1, 1)[3][0], noteNode: 41, anchorUnit: 1 });
    const plan = prepare(args[3], column, args[4], args[5]);
    assert.equal(plan?.state, 'prepared', plan?.error);
    const result = plan.paginate(...args.slice(0, 7));
    assert.equal(result.state, 'ready', result.error);
    return snapshot(result);
  }
  assert.deepEqual(run(afterMixed), run(beforeMixed));
});
test('custom adapter의 기본 호출은 materialization과 range 키/height 관측을 유지한다', () => {
  function run(fn) {
    const events = [],
      args = sample(3, 8);
    let retained = false;
    const adapter = {
      validate: () => null,
      units: (n) => n.rows,
      fragment(n, range) {
        events.push(Object.keys(range));
        const f = { ...n, height: range.height, rows: range.normalizedUnits };
        Object.defineProperty(f, 'height', {
          get() {
            events.push('height');
            return range.height + (retained ? 0.25 : 0);
          },
        });
        retained = true;
        return f;
      },
    };
    const result = snapshot(fn(...args, adapter));
    return { result, events };
  }
  const actual = run(after);
  assert.deepEqual(actual, run(before));
  assert.ok(actual.events.some((entry) => entry === 'height'));
  assert.ok(
    actual.events.some((entry) => Array.isArray(entry) && entry.includes('normalizedUnits')),
  );
});
test('외부 map이 반환된 내부 행을 getter로 바꿔도 관측을 생략하지 않는다', () => {
  function run(fn) {
    const args = sample(1, 8),
      events = [],
      source = args[3][0].rows;
    source.slice = (start, end) => ({
      map(callback) {
        const result = Array.prototype.slice.call(source, start, end).map(callback);
        const value = result[0].height;
        Object.defineProperty(result[0], 'height', {
          enumerable: true,
          get() {
            events.push('mapped.height');
            return value;
          },
        });
        return result;
      },
    });
    const result = snapshot(fn(...args));
    const bytes = JSON.stringify(result);
    return { bytes, events };
  }
  const a = run(before),
    b = run(after);
  assert(a.events.length > 0);
  assert.ok(b.events.every((entry) => entry === 'mapped.height'));
  assert.ok(b.events.length >= 4);
  assert.deepEqual(b, a);
});
test('원 FP 반례의 결과와 기존 engine 실패 조건을 바꾸지 않는다', () => {
  const fp = { ...policy, aboveLine: 0.1, belowLine: 0.2, betweenNotes: 0.3 };
  const notes = [note(0, [row(0, 0.05)], 0.3), note(1, [row(0, 0.05)], 60)];
  const a = beforeArea(notes, fp, column, 20, 0.1);
  const b = afterArea(notes, fp, column, 20, 0.1);
  assert.equal(a.rows[0].y, 59.40000000000001);
  assert.deepEqual(b, a);
  assert.deepEqual(probe(notes, fp, column, 20, 0.1, 120), {
    state: 'placed',
    rowsFit: a.rows.every((r) => r.y >= 20 && r.y + r.height <= 120),
  });
  for (const mutate of [
    (x) => {
      x[6].maxRows = 0;
    },
    (x) => {
      x[3][1].noteNode = x[3][0].noteNode;
    },
    (x) => {
      x[3][0].anchorUnit = 999;
    },
    (x) => {
      x[3][0].rows[0].height = -1;
    },
    (x) => {
      x[2][0].column_changes = false;
    },
  ]) {
    const args = sample(2, 8);
    mutate(args);
    equivalent(args);
  }
});

test('복사 당시 height의 특수 타입은 기존 늦은 bounds 결과와 오류를 유지한다', () => {
  for (const copied of [NaN, Infinity, undefined, null, -0, 1n, Symbol('복사 높이')]) {
    function run(call) {
      let reads = 0;
      const r = row();
      Object.defineProperty(r, 'height', {
        enumerable: true,
        get() {
          return ++reads === 4 ? copied : 1;
        },
      });
      try {
        return { result: call([note(0, [r])]), reads };
      } catch (error) {
        return { error: error.name + ':' + error.message, reads };
      }
    }
    assert.deepEqual(
      run((n) => probe(n, p, column, 20, 0, 120)),
      run((n) => expectedTrial(n)),
    );
  }
});

test('일반 출력의 상속 setter는 새 own clip/x/y 기록에 관여하지 않는다', () => {
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'pageClip');
  assert.equal(previous, undefined);
  let writes = 0;
  Object.defineProperty(Object.prototype, 'pageClip', {
    configurable: true,
    get() {
      return undefined;
    },
    set() {
      writes++;
    },
  });
  try {
    const clip = { x: 1, y: 2, width: 3, height: 4 };
    const r = Object.assign(Object.create({ pageClip: clip }), row());
    const notes = [note(0, [r])];
    const a = beforeArea(notes, p, column, 20, 0),
      b = afterArea(notes, p, column, 20, 0);
    assert.deepEqual(b, a);
    assert.equal(Object.hasOwn(b.rows[0], 'pageClip'), true);
    assert.equal(writes, 0);
    assert.deepEqual(probe(notes, p, column, 20, 0, 120), expectedTrial(notes));
  } finally {
    delete Object.prototype.pageClip;
  }
});

test('새 내부 옵션을 생략한 기존 measured 호출은 원 동작을 유지한다', () => {
  const args = sample(8, 16, [1, 1, 1, 1]);
  assert.deepEqual(
    snapshot(measuredAfter(...structuredClone(args.slice(0, 7)))),
    snapshot(measuredBefore(...structuredClone(args.slice(0, 7)))),
  );
});

test('명시 내부 측정 plain 호출의 직접 수치 경로도 원 결과를 유지한다', () => {
  for (const [n, h] of [
    [8, 1],
    [16, 4],
    [32, 16],
  ]) {
    const args = sample(n, 16, Array(h).fill(1));
    const expected = measuredBefore(...structuredClone(args.slice(0, 7)));
    const actual = measuredAfter(...structuredClone(args.slice(0, 7)), true);
    assert.equal(actual.state, 'ready', actual.error);
    assert.deepEqual(snapshot(actual), snapshot(expected));
  }
});

test('새 내부 옵션으로 생성한 mixed 경로도 원 표·prefix·clip 출력을 유지한다', () => {
  function run(prepare, owned) {
    const args = mixedSample();
    args[3][0].numberPrefixes = [{ x: 0, y: 0, width: 1, height: 1, text: '1' }];
    args[3][0].continuationUnits[0].prefixIndices = [0];
    args[3].push({ ...sample(1, 1)[3][0], noteNode: 41, anchorUnit: 1 });
    const plan = prepare(args[3], column, args[4], args[5], {}, owned);
    assert.equal(plan?.state, 'prepared', plan?.error);
    const result = plan.paginate(...args.slice(0, 7));
    assert.equal(result.state, 'ready', result.error);
    return snapshot(result);
  }
  assert.deepEqual(run(afterMixed, true), run(beforeMixed, false));
});

test('내부 수치 확인은 원 순서 FP 좌표와 뒤 구조 오류 우선순위를 유지한다', () => {
  const fp = { ...policy, aboveLine: 0.1, belowLine: 0.2, betweenNotes: 0.3 };
  const notes = [note(0, [row(0, 0.05)], 0.3), note(1, [row(0, 0.05)], 60)];
  const expected = beforeArea(notes, fp, column, 20, 0.1);
  assert.equal(expected.rows[0].y, 59.40000000000001);
  assert.deepEqual(probe(notes, fp, column, 20, 0.1, 120, 20000, true), {
    state: 'placed',
    rowsFit: expected.rows.every((r) => r.y >= 20 && r.y + r.height <= 120),
  });
  const malformed = [note(0), { ...note(1), boxes: [{ x: 0, y: 0, width: -1, height: 1 }] }];
  assert.deepEqual(
    probe(malformed, p, column, 20, 0, 21, 20000, true),
    expectedTrial(malformed, p, 21),
  );
});

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { layoutNoteBodyPages } from '../../web/preview/note-body-page-layout.mjs';
import { hwp5PageGeometry } from '../../web/preview/hwp5-page-geometry.mjs';
import { projectHwp5ColumnFlow } from '../../web/preview/hwp5-column-flow.mjs';

test('실제 측정 생성 경계의 최종 출력은 기록된 물질화 기준과 같다', () => {
  const bytes = readFileSync(
    new URL('./fixtures/mixed-note-table/reopened-content.json', import.meta.url),
  );
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    'c745c389a05dba52f14a70a98c0008db1cb7b00838568335c8af13bd4a69a5b9',
  );
  const data = JSON.parse(bytes);
  const content = {
    ...data,
    pageSettings: [hwp5PageGeometry(data.pageSources[0])],
    paragraphFlows: projectHwp5ColumnFlow(data, {
      notes: true,
      pageAreas: true,
      tableCells: Boolean(data.tables?.length),
      captions: true,
    }),
  };
  const before = structuredClone(content);
  const result = layoutNoteBodyPages(content, (text) => Array.from(text).length * 8);
  assert.equal(result.state, 'paginated');
  assert.deepEqual(content, before);
  assert.equal(
    createHash('sha256').update(JSON.stringify(result)).digest('hex'),
    '8c21fcc526d2621bd1917c9dc5c34b667a918fd18a45560e69f79b0181e86c87',
  );
});
test('직접 trial은 좌표 출력과 메타데이터를 노출하지 않고 입력을 보존한다', () => {
  const notes = [note(0, [row(0, 1), row(1, 1)], 2)];
  const original = structuredClone(notes);
  const result = probe(notes, p, column, 20, 0, 120, 20000, true);
  assert.deepEqual(result, expectedTrial(notes));
  assert.deepEqual(Reflect.ownKeys(result), ['state', 'rowsFit']);
  assert.deepEqual(notes, original);
});
