import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectPropertiesPort } from '../src/object-properties-port.ts';
function setup() {
  const messages = [];
  let tokenEffect, capEffect, hostEffect, current;
  const make = (documentId) => {
    const token = Object.freeze({
      editorId: 'editor',
      documentId,
      generation: documentId === 'A' ? 1 : 2,
      operationRevision: 0,
      viewRevision: 0,
    });
    return Object.freeze(
      Object.assign(
        Object.create({
          get token() {
            return tokenEffect ? tokenEffect(token) : token;
          },
          get capabilities() {
            capEffect?.();
            return { pictureResizeAvailable: true };
          },
        }),
        {
          ...token,
          stateVersion: 1,
          status: 'ready',
          historyRecoveryRequired: false,
          content: {
            format: 'hwp5',
            pictures: [
              {
                section: 0,
                pictureNode: 7,
                geometry: { width: 7200, height: 3601, widthRelative: 4, heightRelative: 2 },
              },
            ],
          },
        },
      ),
    );
  };
  current = make('A');
  const selected = () => {
    const value = {
      editorId: current.editorId,
      documentId: current.documentId,
      generation: current.generation,
      operationRevision: 0,
      viewRevision: 0,
      section: 0,
      pictureNode: 7,
    };
    hostEffect?.();
    return Object.freeze(value);
  };
  const editor = {
    getEditorState: () => current,
    registerStateListener: () => () => {},
    async requestExperimental(message, options) {
      messages.push({ message, options });
      return { status: 'committed-with-snapshot', state: current };
    },
  };
  const port = createObjectPropertiesPort(editor, () => ({ getContextPicture: selected }));
  return {
    port,
    messages,
    replace() {
      current = make('B');
    },
    current: () => current,
    token(fn) {
      tokenEffect = fn;
    },
    cap(fn) {
      capEffect = fn;
    },
    host(fn) {
      hostEffect = fn;
    },
    requestGetter(fn) {
      const original = editor.requestExperimental;
      Object.defineProperty(editor, 'requestExperimental', {
        configurable: true,
        get() {
          fn();
          return original;
        },
      });
    },
  };
}
const draft = { width: '50.8', height: '12.7', dirty: { width: true, height: false } };
test('최종 token getter 재진입이 새 문서 token을 반환해도 옛 그림 초안 요청0', async () => {
  const h = setup(),
    captured = h.port.capture();
  h.token(() => {
    h.token(undefined);
    h.replace();
    return h.current().token;
  });
  const result = await h.port.apply(captured, draft);
  assert.equal(h.messages.length, 0, '옛 A 대상과 새 B token을 혼합해서는 안 됨');
  assert.equal(result.status, 'rejected-unapplied');
});
test('최종 capability 읽기 재진입 문서 변경은 요청0', async () => {
  const h = setup(),
    captured = h.port.capture();
  h.cap(() => {
    h.cap(undefined);
    h.replace();
  });
  const result = await h.port.apply(captured, draft);
  assert.equal(h.messages.length, 0);
  assert.equal(result.status, 'rejected-unapplied');
});
test('마지막 host 선택 콜백 재진입 문서 변경은 요청0', async () => {
  const h = setup(),
    captured = h.port.capture();
  let calls = 0;
  h.host(() => {
    if (++calls === 2) h.replace();
  });
  const result = await h.port.apply(captured, draft);
  assert.equal(h.messages.length, 0);
  assert.equal(result.status, 'rejected-unapplied');
});
test('전송 메서드 접근자 재진입도 마지막 current 검사 전에 관측', async () => {
  const h = setup(),
    captured = h.port.capture();
  h.requestGetter(() => h.replace());
  const result = await h.port.apply(captured, draft);
  assert.equal(h.messages.length, 0);
  assert.equal(result.status, 'rejected-unapplied');
});
