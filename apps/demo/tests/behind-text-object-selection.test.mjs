import test from 'node:test';
import assert from 'node:assert/strict';
import {
  behindTextObjectSelectionAvailability,
  requestBehindTextObjectSelection,
} from '../src/behind-text-object-selection.ts';
import { createObjectActivationRelay } from '../src/object-activation-relay.ts';
const ready = () => ({
  status: 'ready',
  content: { format: 'hwpx' },
  historyRecoveryRequired: false,
});
test('ready HWPX arms exactly one Surface request and announces border then P', () => {
  let calls = 0;
  const notes = [];
  assert.equal(
    requestBehindTextObjectSelection(
      ready,
      {
        requestBehindTextObjectSelection() {
          calls++;
          return true;
        },
      },
      (v) => notes.push(v),
    ),
    true,
  );
  assert.equal(calls, 1);
  assert.match(notes[0], /테두리.*P/);
  assert.match(notes[0], /Escape/);
});
test('H5 absent unknown loading and recovering states never request arm', () => {
  for (const state of [
    { status: 'loading', content: { format: 'hwpx' } },
    { ...ready(), content: { format: 'hwp5' } },
    { ...ready(), content: null },
    { ...ready(), content: { format: 'unknown' } },
    { ...ready(), historyRecoveryRequired: true },
  ]) {
    let calls = 0;
    const notes = [];
    assert.equal(
      requestBehindTextObjectSelection(
        () => state,
        {
          requestBehindTextObjectSelection() {
            calls++;
            return true;
          },
        },
        (v) => notes.push(v),
      ),
      false,
    );
    assert.equal(calls, 0);
    assert(notes[0]);
  }
});
test('unconnected host disables command without text selection requirement', () => {
  assert.equal(behindTextObjectSelectionAvailability(ready(), undefined).enabled, false);
  assert.equal(behindTextObjectSelectionAvailability(ready(), {}).enabled, false);
  assert.equal(
    behindTextObjectSelectionAvailability(ready(), { requestBehindTextObjectSelection: () => true })
      .enabled,
    true,
  );
});
test('latest state at dispatch prevents stale enabled HWPX intent after doc switch', () => {
  let state = ready(),
    calls = 0;
  const host = {
    requestBehindTextObjectSelection() {
      calls++;
      return true;
    },
  };
  assert(behindTextObjectSelectionAvailability(state, host).enabled);
  state = { ...state, content: { format: 'hwp5' } };
  assert.equal(
    requestBehindTextObjectSelection(
      () => state,
      host,
      () => {},
    ),
    false,
  );
  assert.equal(calls, 0);
});
test('false undefined and throwing Surface replies use localized refusal without retry', () => {
  for (const response of ['false', 'undefined', 'throw']) {
    let calls = 0;
    const notes = [];
    assert.equal(
      requestBehindTextObjectSelection(
        ready,
        {
          requestBehindTextObjectSelection() {
            calls++;
            if (response === 'throw') throw Error('internal');
            if (response === 'false') return false;
          },
        },
        (s) => notes.push(s),
      ),
      false,
    );
    assert.equal(calls, 1);
    assert.match(notes[0], /지금은 글 뒤 개체를 선택할 수 없습니다/);
    assert(!notes[0].includes('internal'));
  }
});
test('app request does not select object, invoke properties, edit or create own armed state', () => {
  let armed = 0;
  const host = {
    requestBehindTextObjectSelection() {
      armed++;
      return true;
    },
    getSelectedObject() {
      assert.fail('no selection lookup');
    },
    requestSelectedObjectProperties() {
      assert.fail('next trusted click owns properties');
    },
    dispatchCommand() {
      assert.fail('no document edit');
    },
  };
  requestBehindTextObjectSelection(ready, host, () => {});
  assert.equal(armed, 1);
});
test('relay arms only current mounted Surface and never replays on replacement', () => {
  const relay = createObjectActivationRelay();
  let a = 0,
    b = 0;
  assert.equal(relay.requestBehindTextObjectSelection(), false);
  relay.connect({
    registerObjectActivation: () => () => {},
    requestBehindTextObjectSelection() {
      a++;
      return true;
    },
  });
  assert.equal(relay.requestBehindTextObjectSelection(), true);
  relay.connect({
    registerObjectActivation: () => () => {},
    requestBehindTextObjectSelection() {
      b++;
      return true;
    },
  });
  assert.equal(a, 1);
  assert.equal(b, 0);
  assert.equal(relay.requestBehindTextObjectSelection(), true);
  relay.connect(undefined);
  assert.equal(relay.requestBehindTextObjectSelection(), false);
  relay.dispose();
  assert.equal(relay.requestBehindTextObjectSelection(), false);
  assert.equal(b, 1);
});
test('reentrant mount switch cannot claim old host arm as current', () => {
  const relay = createObjectActivationRelay();
  relay.connect({
    registerObjectActivation: () => () => {},
    requestBehindTextObjectSelection() {
      relay.connect(undefined);
      return true;
    },
  });
  assert.equal(relay.requestBehindTextObjectSelection(), false);
  relay.dispose();
});
