import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTableCellPropertiesPort,
  tableCellDimensions,
} from '../src/table-cell-properties-port.ts';
import { fixture, changed } from './table-cell-properties-fixture.mjs';
import { tableColumnWidthPlan } from '../../../web/preview/table-column-width-plan.mjs';

for (const format of ['hwp5', 'hwpx'])
  test(format + ' 원본 셀 크기는 공식 mutation/token 한 번만 전달', async () => {
    const f = fixture(format),
      p = createTableCellPropertiesPort(f.editor, f.api),
      c = p.capture();
    assert.equal(c.reason, null);
    await p.apply(c, changed);
    assert.deepEqual(f.mutationCalls(), [
      {
        type: 'mutation',
        message: { kind: 'cell-size', section: 0, listNode: 82, width: 3879, height: 7086 },
        options: { mutation: true, token: f.state.token },
      },
    ]);
  });
test('공유 열 경계는 expected 원값을 포함한 단일 batch 요청', async () => {
  const f = fixture(),
    p = createTableCellPropertiesPort(f.editor, f.api);
  await p.apply(p.capture(), { ...changed, mode: 'column' });
  assert.deepEqual(f.mutationCalls()[0].message, {
    kind: 'table-column-width',
    section: 0,
    tableNode: 81,
    listNode: 82,
    width: 3879,
    expectedWidth: 3779,
  });
});
test('닫힌 도구 presentation은 서식 관측이나 표 순회를 하지 않음', () => {
  const f = fixture(),
    p = createTableCellPropertiesPort(f.editor, f.api);
  for (let i = 0; i < 10; i++) assert.equal(p.presentation().enabled, true);
  assert.equal(f.calls.length, 0);
});
for (const [name, change] of [
  [
    'readonly',
    (s) => {
      s.content.readOnly = true;
    },
  ],
  [
    'optional ABI 부재',
    (s) => {
      delete s.capabilities.cellSizeAvailable;
    },
  ],
  [
    'poison',
    (s) => {
      s.historyRecoveryRequired = true;
    },
  ],
])
  test(name + ' 원값 관측과 변경 거부', async () => {
    const f = fixture();
    f.mutate(change);
    const p = createTableCellPropertiesPort(f.editor, f.api),
      c = p.capture();
    assert.equal(c.cell.width, 3779);
    assert.ok(c.writeReason);
    assert.equal((await p.apply(c, changed)).status, 'rejected-unapplied');
    assert.equal(f.mutationCalls().length, 0);
  });
for (const [name, change] of [
  [
    '본문 선택',
    (s) => {
      delete s.content.paragraphs[0].tableCell;
    },
  ],
  [
    '부분 관측',
    (s) => {
      s.content.limited = true;
    },
  ],
  [
    'window',
    (s) => {
      s.content.window = {};
    },
  ],
  [
    'clipped',
    (s) => {
      s.content.paragraphs[0].clipped = true;
    },
  ],
  [
    '다른 table',
    (s) => {
      s.content.paragraphs[0].tableCell.tableNode = 99;
    },
  ],
  [
    '중복 table',
    (s) => {
      s.content.tables.push(s.content.tables[0]);
    },
  ],
  [
    '중복 list',
    (s) => {
      s.content.tables[0].cells.push(s.content.tables[0].cells[0]);
    },
  ],
  [
    '소속 누락',
    (s) => {
      s.content.tables[0].cells[0].paragraphs = [16];
    },
  ],
  [
    '출처불명 크기',
    (s) => {
      s.content.tables[0].cells[0].width = null;
    },
  ],
  [
    '생성 reference',
    (s) => {
      s.content.paragraphs[0].currentReference.kind = 'created';
    },
  ],
])
  test(name + '는 선택/Native 권위를 새로 만들지 않음', () => {
    const f = fixture();
    f.mutate(change);
    const p = createTableCellPropertiesPort(f.editor, f.api);
    assert.ok(p.capture().reason);
    assert.equal(f.mutationCalls().length, 0);
  });
test('소수는 반올림하지 않고 기존 pt→HWPUNIT 정수 규칙 재사용', () => {
  assert.deepEqual(tableCellDimensions({ widthPoints: '37.79', heightPoints: '0', mode: 'cell' }), {
    width: 3779,
    height: 0,
  });
  for (const raw of ['37.791', '1e3', ' 20', '-1', '42949672.96'])
    assert.throws(() => tableCellDimensions({ ...changed, widthPoints: raw }));
});
test('같은 크기는 Native와 history를 건드리지 않음', async () => {
  const f = fixture(),
    p = createTableCellPropertiesPort(f.editor, f.api);
  assert.equal(
    (await p.apply(p.capture(), { widthPoints: '37.79', heightPoints: '70.86', mode: 'cell' }))
      .status,
    'known-no-op',
  );
  assert.equal(f.mutationCalls().length, 0);
});
test('선택-only 새 state와 queue flush 중 교체는 전송 전 거부', async () => {
  const f = fixture(),
    p = createTableCellPropertiesPort(f.editor, f.api),
    c = p.capture();
  f.replace({ selection: { ...f.state.selection, startUnit: 1 } });
  assert.equal((await p.apply(c, changed)).status, 'rejected-unapplied');
  const fresh = p.capture();
  f.editor.update = async () => f.replace({ selection: null });
  assert.equal((await p.apply(fresh, changed)).status, 'rejected-unapplied');
  assert.equal(f.mutationCalls().length, 0);
});
test('pending 중복과 dispose 후 전송은 거부', async () => {
  const f = fixture(),
    p = createTableCellPropertiesPort(f.editor, f.api),
    c = p.capture();
  let release;
  f.editor.update = () =>
    new Promise((r) => {
      release = r;
    });
  const first = p.apply(c, changed);
  assert.equal((await p.apply(c, changed)).status, 'rejected-unapplied');
  p.dispose();
  release();
  assert.equal((await first).status, 'rejected-unapplied');
  assert.equal(f.mutationCalls().length, 0);
});
test('committed-refresh-required+error는 원결과 그대로/같은 capture 재접수0', async () => {
  const f = fixture(),
    p = createTableCellPropertiesPort(f.editor, f.api),
    c = p.capture();
  const reply = { status: 'committed-refresh-required', error: 'SnapshotMissing', state: f.state };
  let n = 0;
  f.editor.requestExperimental = async () => {
    n++;
    return reply;
  };
  assert.equal(await p.apply(c, changed), reply);
  assert.equal((await p.apply(c, changed)).status, 'rejected-unapplied');
  assert.equal(n, 1);
});
test('전송 후 오류는 미적용으로 위조하지 않고 재접수도 하지 않음', async () => {
  const f = fixture(),
    p = createTableCellPropertiesPort(f.editor, f.api),
    c = p.capture();
  let n = 0;
  f.editor.requestExperimental = async () => {
    n++;
    throw Error('Transport');
  };
  await assert.rejects(p.apply(c, changed));
  assert.equal((await p.apply(c, changed)).status, 'rejected-unapplied');
  assert.equal(n, 1);
});
test('batch ABI 부재는 단일 셀 반복으로 대체하지 않음', async () => {
  const f = fixture();
  f.state.capabilities.cellSizeBatchAvailable = false;
  const p = createTableCellPropertiesPort(f.editor, f.api);
  assert.equal(
    (await p.apply(p.capture(), { ...changed, mode: 'column' })).status,
    'rejected-unapplied',
  );
  assert.equal(f.mutationCalls().length, 0);
});
test('성공 후 현재 public facade로만 선택 복원/selection-only state fence 전달', async () => {
  const f = fixture(),
    p = createTableCellPropertiesPort(f.editor, f.api),
    c = p.capture();
  f.editor.requestExperimental = async () => {
    f.replace({ selection: undefined, operationRevision: 1 });
    return { status: 'committed-with-snapshot', state: f.state };
  };
  const reply = await p.apply(c, changed);
  assert.equal(await p.restoreSelection(c, reply), true);
  assert.equal(
    f.calls.find((c) => c.type === 'selection').options.stateVersion,
    reply.state.stateVersion,
  );
  assert.equal(
    f.calls.find((c) => c.type === 'selection').target.owner,
    'fresh-public-test-target',
  );
});
test('다른 문서/새 사용자 선택/refresh필요 상태는 선택 복원0', async () => {
  for (const change of [
    { documentId: 'other', selection: undefined },
    { selection: { user: true } },
    { status: 'refresh-required', selection: undefined },
  ]) {
    const f = fixture(),
      p = createTableCellPropertiesPort(f.editor, f.api),
      c = p.capture();
    await p.apply(c, changed);
    f.replace(change);
    assert.equal(
      await p.restoreSelection(c, { status: 'committed-with-snapshot', state: f.state }),
      false,
    );
    assert.equal(f.calls.filter((c) => c.type === 'selection').length, 0);
  }
});
test('동일 state 안의 셀 원값 변경과 flush 중 capability 변경도 거부', async () => {
  for (const mutation of [
    (s) => {
      s.content.tables[0].cells[0].width++;
    },
    (s) => {
      s.capabilities.cellSizeAvailable = false;
    },
  ]) {
    const f = fixture(),
      p = createTableCellPropertiesPort(f.editor, f.api),
      c = p.capture();
    f.editor.update = async () => f.mutate(mutation);
    assert.equal((await p.apply(c, changed)).status, 'rejected-unapplied');
    assert.equal(f.mutationCalls().length, 0);
  }
});
test('미접수 capture나 외부 복제 capture는 성공 응답을 줘도 선택 발급0', async () => {
  const f = fixture(),
    p = createTableCellPropertiesPort(f.editor, f.api),
    c = p.capture();
  f.replace({ selection: undefined });
  for (const capture of [c, { ...c }])
    assert.equal(
      await p.restoreSelection(capture, { status: 'committed-with-snapshot', state: f.state }),
      false,
    );
  assert.equal(f.calls.filter((c) => c.type === 'issue').length, 0);
});
test('dirty0은 표시 반올림 문자열을 무시하고 원 HWPUNIT/no-op을 보존', async () => {
  const f = fixture(),
    p = createTableCellPropertiesPort(f.editor, f.api);
  const c = p.capture();
  assert.equal(
    (
      await p.apply(c, {
        widthPoints: '37.8',
        heightPoints: '70.9',
        mode: 'cell',
        dirty: { width: false, height: false },
      })
    ).status,
    'known-no-op',
  );
  assert.equal(f.mutationCalls().length, 0);
  assert.equal(f.state.content.tables[0].cells[0].width, 3779);
});
test('dirty 높이만 수정하면 자동 너비0을 기본값으로 대체하지 않음', async () => {
  const f = fixture();
  f.state.content.tables[0].cells[0].width = 0;
  const p = createTableCellPropertiesPort(f.editor, f.api),
    c = p.capture();
  assert.equal(c.cell.width, 0);
  assert.equal(c.columnAvailable, false);
  await p.apply(c, {
    widthPoints: '100',
    heightPoints: '71.86',
    mode: 'cell',
    dirty: { width: false, height: true },
  });
  assert.deepEqual(f.mutationCalls()[0].message, {
    kind: 'cell-size',
    section: 0,
    listNode: 82,
    width: 0,
    height: 7186,
  });
});
test('source 부재/null은 자동0과 구분하고 임의 기본 크기를 만들지 않음', async () => {
  for (const width of [undefined, null]) {
    const f = fixture();
    f.state.content.tables[0].cells[0].width = width;
    const p = createTableCellPropertiesPort(f.editor, f.api),
      c = p.capture();
    assert.ok(c.reason);
    await p.apply(c, changed);
    assert.equal(f.mutationCalls().length, 0);
  }
});
test('지원 못하는 병합 열 geometry는 실제 canonical 이유로 batch 비활성', async () => {
  const f = fixture();
  const t = f.state.content.tables[0];
  t.columns = 2;
  const p = createTableCellPropertiesPort(f.editor, f.api),
    c = p.capture();
  assert.equal(c.columnAvailable, false);
  assert.equal(c.columnReason, 'IncompleteSourceTableRowCoverage');
  const r = await p.apply(c, { ...changed, mode: 'column' });
  assert.equal(r.error, c.columnReason);
  assert.equal(f.mutationCalls().length, 0);
});
test('병합 공유 열의 영향 범위는 canonical plan으로만 계산/요청1개', async () => {
  const f = fixture();
  const t = f.state.content.tables[0];
  t.rows = 2;
  t.columns = 2;
  t.cells = [
    {
      listNode: 82,
      row: 0,
      column: 0,
      rowSpan: 1,
      columnSpan: 1,
      width: 3779,
      height: 7086,
      paragraphs: [15],
    },
    {
      listNode: 83,
      row: 0,
      column: 1,
      rowSpan: 1,
      columnSpan: 1,
      width: 3779,
      height: 7086,
      paragraphs: [16],
    },
    {
      listNode: 84,
      row: 1,
      column: 0,
      rowSpan: 1,
      columnSpan: 2,
      width: 7558,
      height: 7086,
      paragraphs: [17],
    },
  ];
  const before = structuredClone(t),
    p = createTableCellPropertiesPort(f.editor, f.api),
    c = p.capture();
  assert.equal(c.columnAvailable, true);
  await p.apply(c, { ...changed, mode: 'column', dirty: { width: true, height: false } });
  const requests = f.mutationCalls();
  assert.equal(requests.length, 1);
  const plan = tableColumnWidthPlan(t, requests[0].message);
  assert.deepEqual(plan.cells, [
    { section: 0, listNode: 82, width: 3879, height: 7086 },
    { section: 0, listNode: 84, width: 7658, height: 7086 },
  ]);
  assert.deepEqual(t, before);
});
test('열 너비 변경에서 untouched 높이는 optional wire에 재지정하지 않음', async () => {
  const f = fixture(),
    p = createTableCellPropertiesPort(f.editor, f.api);
  await p.apply(p.capture(), {
    widthPoints: '38.79',
    heightPoints: '70.9',
    mode: 'column',
    dirty: { width: true, height: false },
  });
  const message = f.mutationCalls()[0].message;
  assert.equal(Object.hasOwn(message, 'height'), false);
  assert.equal(Object.hasOwn(message, 'expectedHeight'), false);
});
test('undo/headless action 뒤 새 상태에 이전 모달 A의 값을 재타깃하지 않음', async () => {
  const f = fixture(),
    p = createTableCellPropertiesPort(f.editor, f.api),
    a = p.capture();
  f.replace({
    operationRevision: 9,
    viewRevision: 9,
    selection: { ...f.state.selection, paragraph: 16 },
  });
  assert.equal((await p.apply(a, changed)).error, 'StaleTableCellSelection');
  assert.equal(f.mutationCalls().length, 0);
});
test('final capture의 공개 observer가 새 문서로 교체하면 호스트 요청0', async () => {
  const f = fixture();
  const observe = f.api.getSelectionFormatting;
  let n = 0;
  f.api.getSelectionFormatting = (state) => {
    if (++n === 3) f.replace({ documentId: 'new-document', selection: null });
    return observe(state);
  };
  const p = createTableCellPropertiesPort(f.editor, f.api),
    captured = p.capture();
  const result = await p.apply(captured, changed);
  assert.equal(f.mutationCalls().length, 0, 'SDK token 거부에 도달하기 전 host dispatch0이어야 함');
  assert.equal(result.status, 'rejected-unapplied');
});
test('final capture observer의 선택-only 교체도 이전 대상 요청0', async () => {
  const f = fixture();
  const observe = f.api.getSelectionFormatting;
  let n = 0;
  f.api.getSelectionFormatting = (state) => {
    if (++n === 3) f.replace({ selection: { ...state.selection, paragraph: 16 } });
    return observe(state);
  };
  const p = createTableCellPropertiesPort(f.editor, f.api),
    captured = p.capture();
  const result = await p.apply(captured, changed);
  assert.equal(f.mutationCalls().length, 0);
  assert.equal(result.status, 'rejected-unapplied');
});
test('동일 state 참조여도 final capture callback이 token을 바꾸면 호스트 요청0', async () => {
  const f = fixture();
  const observe = f.api.getSelectionFormatting;
  let n = 0;
  f.api.getSelectionFormatting = (state) => {
    if (++n === 3)
      f.mutate((s) => {
        s.token = { ...s.token, operationRevision: 10 };
      });
    return observe(state);
  };
  const p = createTableCellPropertiesPort(f.editor, f.api),
    captured = p.capture();
  const result = await p.apply(captured, changed);
  assert.equal(f.mutationCalls().length, 0);
  assert.equal(result.status, 'rejected-unapplied');
});
test('마지막 요청 method getter가 문서를 바꾸면 호스트 요청0', async () => {
  const f = fixture(),
    send = f.editor.requestExperimental;
  let reads = 0;
  Object.defineProperty(f.editor, 'requestExperimental', {
    configurable: true,
    get() {
      if (++reads === 4) f.replace({ documentId: 'method-getter-document', selection: null });
      return send;
    },
  });
  const p = createTableCellPropertiesPort(f.editor, f.api),
    c = p.capture();
  const reply = await p.apply(c, changed);
  assert.equal(reads, 4);
  assert.equal(f.mutationCalls().length, 0);
  assert.equal(reply.status, 'rejected-unapplied');
});
test('요청 인자 token getter가 선택을 바꾸면 마지막 admission에서 요청0', async () => {
  const f = fixture(),
    send = f.editor.requestExperimental,
    token = f.state.token;
  let reads = 0,
    armed = false,
    fired = false;
  Object.defineProperty(f.state, 'token', {
    configurable: true,
    get() {
      if (armed) {
        armed = false;
        fired = true;
        f.replace({ selection: null });
      }
      return token;
    },
  });
  Object.defineProperty(f.editor, 'requestExperimental', {
    configurable: true,
    get() {
      if (++reads === 4) armed = true;
      return send;
    },
  });
  const p = createTableCellPropertiesPort(f.editor, f.api),
    c = p.capture();
  const reply = await p.apply(c, changed);
  assert.equal(fired, true);
  assert.equal(f.mutationCalls().length, 0);
  assert.equal(reply.status, 'rejected-unapplied');
});
