import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configureNativeHistory } from '../packages/react-native/src/canvas/history-negotiation.mjs';
test('V1 포트는 요청 없이 명시 거부한다', async () => {
  let calls = 0;
  const port = {
    descriptor: {},
    request() {
      calls++;
    },
  };
  assert.equal((await configureNativeHistory(port, {}, 0, {})).error, 'NativeHistoryV2Unavailable');
  assert.equal(calls, 0);
});
test('빈 정책은 JS 기본값 없이 Native로 전달한다', async () => {
  const token = {};
  const packets = [];
  const port = {
    descriptor: { historyProtocol: 'hwpjs.native-history/2' },
    async request(p) {
      packets.push(p);
      return { status: 0 };
    },
  };
  assert.equal((await configureNativeHistory(port, token, 7, {})).status, 0);
  assert.equal(Buffer.from(packets[0].bytes).toString(), '{}');
  assert.equal(packets[0].token, token);
  assert.equal(packets[0].expectedRevision, 7);
});
test('명시 정책의 0값을 누락시키지 않는다', async () => {
  let packet;
  const port = {
    descriptor: { historyProtocol: 'hwpjs.native-history/2' },
    async request(p) {
      packet = p;
      return { status: 7, error: 'InvalidHistoryOptions' };
    },
  };
  const reply = await configureNativeHistory(port, {}, 0, { maxEntries: 0 });
  assert.equal(reply.error, 'InvalidHistoryOptions');
  assert.equal(Buffer.from(packet.bytes).toString(), '{"maxEntries":0}');
});
