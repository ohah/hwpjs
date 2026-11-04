import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pictureMillimeters,
  pictureUnits,
  pictureSize,
  proportionalPictureSize,
} from '../src/object-properties-input.ts';
import { createObjectPropertiesPort } from '../src/object-properties-port.ts';
import { resolveCommandSupport } from '../src/command-support.ts';

export function fixture(options = {}) {
  const calls = [];
  let node = 7,
    counter = 0;
  const picture = {
    section: 0,
    pictureNode: 7,
    geometry: { width: 7200, height: 3600, widthRelative: 4, heightRelative: 2 },
    ...options.picture,
  };
  let state;
  function replace(delta = {}) {
    const token = {
      editorId: 'editor',
      documentId: 'document',
      generation: 1,
      operationRevision: counter,
      viewRevision: 0,
      ...delta.token,
    };
    state = Object.freeze({
      ...token,
      status: 'ready',
      stateVersion: counter,
      capabilities: { pictureResizeAvailable: true },
      content: { format: 'hwp5', limited: false, pictures: [picture] },
      ...delta,
      token: Object.freeze(token),
    });
    return state;
  }
  replace(options.state);
  let duringRead;
  const host = {
    getContextPicture() {
      const answer =
        node === null
          ? null
          : node === undefined
            ? undefined
            : { ...state.token, section: 0, pictureNode: node };
      duringRead?.();
      return answer;
    },
  };
  const editor = {
    getEditorState: () => state,
    registerStateListener: () => () => {},
    requestExperimental: async (...args) => {
      calls.push(args);
      return { status: 'committed-with-snapshot', state };
    },
  };
  const port = createObjectPropertiesPort(editor, () => host);
  return {
    port,
    editor,
    picture,
    host,
    calls,
    replace,
    state: () => state,
    select: (n) => {
      node = n;
    },
    during: (fn) => {
      duringRead = fn;
    },
    advance() {
      counter++;
      return replace();
    },
  };
}
test('mm 표시는 반올림이며 편집값만 기존 단위/숫자 SSOT로 변환', () => {
  assert.equal(pictureMillimeters(1), '0');
  assert.equal(pictureMillimeters(10001), '35.28');
  assert.equal(pictureUnits('25.4'), 7200);
  assert.equal(pictureUnits('.5'), 142);
  assert.deepEqual(pictureSize({ width: '25.4', height: '12.7' }), { width: 7200, height: 3600 });
});
test('빈 값·NaN·음수·지수·과정밀·과대 크기는 clamp 없이 거부', () => {
  for (const text of [
    '',
    ' ',
    '0',
    '-1',
    'NaN',
    'Infinity',
    '1e3',
    '1.0000001',
    '999999999999999999999',
    '0.000001',
  ])
    assert.throws(() => pictureUnits(text));
  assert.throws(() => pictureMillimeters(0));
});
test('비율 유지도 정수 크기와 같은 상한 검증 사용', () => {
  const next = proportionalPictureSize('width', '50.8', { width: 7200, height: 3600 });
  assert.deepEqual(pictureSize(next), { width: 14400, height: 7200 });
  assert.throws(() => proportionalPictureSize('width', '15000000', { width: 1, height: 2 }));
});
test('기본·크기 부재·보호·상대 크기는 편집 대상 합성 안 함', () => {
  const h = fixture();
  assert.equal(h.port.capture().reason, null);
  for (const picture of [
    { sizeProtected: true },
    { geometry: null },
    { geometry: { width: null, height: null } },
    { geometry: { width: 7200, height: 3600, widthRelative: 0, heightRelative: 2 } },
  ]) {
    assert.equal(fixture({ picture }).port.capture().target, null);
  }
});
test('자동0·직접 크기 없는 그룹·회전 그림을 표시 크기로 대체하지 않음', () => {
  for (const picture of [
    { geometry: { width: 7200, height: 0, widthRelative: 4, heightRelative: 2 } },
    {
      geometry: { width: null, height: null },
      groupResizeAvailable: true,
      owner: { anchorNode: 1 },
      renderingCorners: [
        [0, 0],
        [7200, 0],
        [7200, 3600],
        [0, 3600],
      ],
    },
    {
      transform: { angle: 90 },
      renderingCorners: [
        [0, 0],
        [0, 7200],
        [-3600, 7200],
        [-3600, 0],
      ],
    },
  ])
    assert.equal(fixture({ picture }).port.capture().target, null);
});
test('읽기 전용·cap OFF·refresh required·이력복구·미지 선택 거부', () => {
  for (const state of [
    { capabilities: {} },
    { capabilities: { pictureResizeAvailable: true, readOnly: true } },
    { status: 'refresh-required' },
    { historyRecoveryRequired: true },
  ]) {
    assert.ok(fixture({ state }).port.capture().reason);
  }
  const h = fixture();
  h.select(undefined);
  assert.ok(h.port.capture().reason);
  h.select(null);
  assert.ok(h.port.capture().reason);
});
test('중복 그림 identity·다른 section·불완전 내용 거부', () => {
  const h = fixture();
  h.replace({ content: { format: 'hwp5', pictures: [h.picture, { ...h.picture }] } });
  assert.equal(h.port.capture().target, null);
  h.replace({ content: { format: 'hwpx', pictures: [{ ...h.picture, section: 1 }] } });
  assert.equal(h.port.capture().target, null);
  h.replace({ content: { format: 'hwpx', limited: true, pictures: [h.picture] } });
  assert.equal(h.port.capture().target, null);
});
test('단일 picture-resize에 두 축을 함께 전달·원 token 유지', async () => {
  const h = fixture();
  const capture = h.port.capture();
  await h.port.apply(capture, { width: '50.8', height: '25.4' });
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0], [
    { kind: 'picture-resize', section: 0, pictureNode: 7, width: 14400, height: 7200 },
    { mutation: true, token: capture.state.token },
  ]);
  assert.deepEqual(h.picture.geometry, {
    width: 7200,
    height: 3600,
    widthRelative: 4,
    heightRelative: 2,
  });
});
test('표시 그림과 실제 resizeRecordNode 구분은 기존 helper를 그대로 사용', async () => {
  const h = fixture({ picture: { resizeRecordNode: 91 } });
  await h.port.apply(h.port.capture(), { width: '50.8', height: '25.4' });
  assert.equal(h.calls[0][0].pictureNode, 91);
});
test('같은 크기 확인은 요청0·이력0', async () => {
  const h = fixture();
  assert.equal(
    (await h.port.apply(h.port.capture(), { width: '25.4', height: '12.7' })).status,
    'known-no-op',
  );
  assert.equal(h.calls.length, 0);
});
test('반올림된 mm를 열기 후 그대로 확인해도 원 정수/HWPUNIT를 재변환하지 않음', async () => {
  for (const width of [1, 10001, 0xffffffff]) {
    const h = fixture({
      picture: { geometry: { width, height: 3601, widthRelative: 4, heightRelative: 2 } },
    });
    const c = h.port.capture();
    const answer = await h.port.apply(c, {
      width: pictureMillimeters(width),
      height: pictureMillimeters(3601),
      dirty: { width: false, height: false },
    });
    assert.equal(answer.status, 'known-no-op');
    assert.equal(h.calls.length, 0);
  }
});
test('너비만 편집하면 반올림 표시된 높이가 아니라 현재 Native 정수 높이를 보존', async () => {
  const h = fixture({
    picture: { geometry: { width: 10001, height: 3601, widthRelative: 4, heightRelative: 2 } },
  });
  await h.port.apply(h.port.capture(), {
    width: '50.8',
    height: pictureMillimeters(3601),
    dirty: { width: true, height: false },
  });
  assert.equal(h.calls[0][0].width, 14400);
  assert.equal(h.calls[0][0].height, 3601);
});
test('비율 잠금의 종속 축도 표시 mm 재변환 없이 원 HWPUNIT 비율로 한 번 계산', () => {
  const original = { width: 10001, height: 3601 };
  const actual = pictureSize(
    { width: '50.8', height: '0', dirty: { width: true, height: true }, aspectRatio: 'width' },
    original,
  );
  assert.equal(actual.width, 14400);
  assert.equal(actual.height, Number((14400n * 3601n + 10001n / 2n) / 10001n));
});
test('그림 선택만 바뀌거나 문서/operation이 바뀌면 원 대상 제출0', async () => {
  const h = fixture();
  const a = h.port.capture();
  h.select(8);
  assert.equal(
    (await h.port.apply(a, { width: '50.8', height: '25.4' })).status,
    'rejected-unapplied',
  );
  h.select(7);
  h.advance();
  assert.equal(
    (await h.port.apply(a, { width: '50.8', height: '25.4' })).status,
    'rejected-unapplied',
  );
  assert.equal(h.calls.length, 0);
});
test('모달이 열린 뒤 capability 회수와 문서 교체는 같은 숫자 node여도 거부', async () => {
  const h = fixture();
  const a = h.port.capture();
  h.state().capabilities.pictureResizeAvailable = false;
  assert.equal(
    (await h.port.apply(a, { width: '50.8', height: '12.7' })).status,
    'rejected-unapplied',
  );
  h.replace({ token: { documentId: 'new-document', generation: 2 } });
  assert.equal(
    (await h.port.apply(a, { width: '50.8', height: '12.7' })).status,
    'rejected-unapplied',
  );
  assert.equal(h.calls.length, 0);
});
test('원 크기 관측이 바뀌어도 낡은 원값으로 다른 축을 덮지 않음', async () => {
  const h = fixture();
  const a = h.port.capture();
  h.picture.geometry.height = 7201;
  assert.equal(
    (
      await h.port.apply(a, {
        width: '50.8',
        height: '12.7',
        dirty: { width: true, height: false },
      })
    ).status,
    'rejected-unapplied',
  );
  assert.equal(h.calls.length, 0);
});
test('host callback 재진입으로 상태가 교체되면 snapshot 권한 생성0', () => {
  const h = fixture();
  let once = true;
  h.during(() => {
    if (once) {
      once = false;
      h.advance();
    }
  });
  assert.equal(h.port.capture().target, null);
});
test('잘못된 입력은 Native 진입0', async () => {
  const h = fixture();
  await assert.rejects(h.port.apply(h.port.capture(), { width: '0', height: '12.7' }));
  assert.equal(h.calls.length, 0);
});
test('그림만 선택한 상태는 텍스트 selection 없이 객체 명령 허용, 텍스트 명령은 기존 거부', () => {
  const h = fixture();
  assert.equal(
    resolveCommandSupport('object-properties', {
      document: 'ready',
      hasSelection: false,
      connected: true,
      availability: h.port.availability(),
    }).enabled,
    true,
  );
  assert.equal(
    resolveCommandSupport('bold', {
      document: 'ready',
      hasSelection: false,
      connected: true,
      availability: { enabled: true },
    }).kind,
    'missing-selection',
  );
});
test('객체 선택 부재는 registry 분리 후에도 포트가 거부', () => {
  const h = fixture();
  h.select(null);
  assert.equal(
    resolveCommandSupport('object-properties', {
      document: 'ready',
      hasSelection: false,
      connected: true,
      availability: h.port.availability(),
    }).enabled,
    false,
  );
});
test('공개 core 설치 entry와 대역 runtime의 요청/undo/redo·readonly 거부 계약', async () => {
  const core = await import('@hwpjs/core');
  for (const format of ['hwp5', 'hwpx']) {
    const log = [];
    let revision = 0;
    const source = fixture().picture;
    const content = () => ({
      format,
      limited: false,
      paragraphs: [],
      pictures: [{ ...source, geometry: { ...source.geometry, width: revision ? 14400 : 7200 } }],
    });
    const runtime = {
      async request(message, context) {
        log.push(message);
        if (message.kind === 'picture-resize') revision++;
        if (message.kind === 'undo') revision--;
        if (message.kind === 'redo') revision++;
        return {
          kind: message.kind,
          content: content(),
          historyRevision: revision,
          pictureResizeAvailable: true,
          historyAvailable: true,
          meta: {
            context,
            application: ['picture-resize', 'undo', 'redo'].includes(message.kind)
              ? 'applied'
              : 'unapplied',
            changed: ['picture-resize', 'undo', 'redo'].includes(message.kind),
          },
        };
      },
      dispose() {},
    };
    const editor = core.createEditor({ runtimeFactory: () => runtime });
    await editor.load(new Uint8Array([1]), { format, editable: true });
    const host = {
      getContextPicture: () => ({ ...editor.getEditorState().token, section: 0, pictureNode: 7 }),
    };
    const port = createObjectPropertiesPort(editor, () => host);
    const capture = port.capture();
    assert.equal(capture.reason, null);
    const answer = await port.apply(capture, { width: '50.8', height: '12.7' });
    assert.equal(answer.status, 'committed-with-snapshot');
    assert.equal(log.filter((x) => x.kind === 'picture-resize').length, 1);
    assert.equal(editor.getEditorState().content.pictures[0].geometry.width, 14400);
    await editor.undo();
    assert.equal(editor.getEditorState().content.pictures[0].geometry.width, 7200);
    const priorEdits = log.filter((x) => x.kind === 'picture-resize').length;
    assert.equal(
      (await port.apply(capture, { width: '50.8', height: '12.7' })).status,
      'rejected-unapplied',
    );
    assert.equal(log.filter((x) => x.kind === 'picture-resize').length, priorEdits);
    await editor.redo();
    assert.equal(editor.getEditorState().content.pictures[0].geometry.width, 14400);
    await editor.dispose();
    const readonly = core.createEditor({ runtimeFactory: () => ({ ...runtime }) });
    await readonly.load(new Uint8Array([1]), { format, editable: false });
    const roPort = createObjectPropertiesPort(readonly, () => ({
      getContextPicture: () => ({ ...readonly.getEditorState().token, section: 0, pictureNode: 7 }),
    }));
    assert.match(roPort.capture().reason, /읽기 전용/);
    const before = log.filter((x) => x.kind === 'picture-resize').length;
    const refused = await readonly.requestExperimental(
      { kind: 'picture-resize', section: 0, pictureNode: 7, width: 14400, height: 3600 },
      { mutation: true, token: readonly.getEditorState().token },
    );
    assert.equal(refused.status, 'rejected-unapplied');
    assert.match(refused.error, /ReadOnly/);
    assert.equal(log.filter((x) => x.kind === 'picture-resize').length, before);
    await readonly.dispose();
  }
});
