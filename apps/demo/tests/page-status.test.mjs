import test from 'node:test';
import assert from 'node:assert/strict';
import { pageStatusLabel, createPageStatusRelay } from '../src/page-status.ts';

const host = (value) => ({ getPageStatus: () => value });
test('measured visible ordinal and total are explicit; source numbers and caret are not used', () => {
  assert.equal(
    pageStatusLabel(
      true,
      false,
      host({ current: 2, total: 7, partial: false, sourcePage: 100, caretPage: 5 }),
    ),
    '미리보기 2 / 7쪽',
  );
});
test('partial/window counts never become a document total', () => {
  assert.equal(
    pageStatusLabel(true, false, host({ current: 2, total: 7, partial: true })),
    '부분 미리보기 내 2쪽 · 전체 쪽수 미확인',
  );
});
test('no document, loading/busy, disconnected and stale observations do not retain numbers', () => {
  const forbidden = {
    getPageStatus() {
      throw Error('MustNotReadOldSurface');
    },
  };
  assert.equal(pageStatusLabel(false, false, forbidden), '');
  assert.equal(pageStatusLabel(true, true, forbidden), '');
  assert.equal(pageStatusLabel(true, false), '');
  assert.equal(pageStatusLabel(true, false, host(null)), '');
});
test('invalid or out-of-range ordinals are unknown, never clamped or defaulted', () => {
  for (const current of [null, 0, -1, NaN, Infinity, 1.5, 8]) {
    assert.equal(
      pageStatusLabel(true, false, host({ current, total: 7, partial: false })),
      '미리보기 미확인 / 7쪽',
    );
  }
  for (const total of [null, 0, -1, NaN, Infinity, 1.5]) {
    assert.match(
      pageStatusLabel(true, false, host({ current: null, total, partial: false })),
      /미리보기 미확인 \/ 전체 쪽수 미확인$/,
    );
  }
});
test('late framework mount and remount forward events; previous subscriptions and disposal are released', () => {
  const relay = createPageStatusRelay();
  let refreshes = 0,
    releases = 0;
  const events = [];
  const source = (current) => ({
    getPageStatus: () => ({ current, total: 9, partial: false }),
    subscribePageStatus(fn) {
      events.push(fn);
      return () => {
        releases++;
      };
    },
  });
  const stop = relay.subscribePageStatus(() => {
    refreshes++;
  });
  assert.equal(relay.getPageStatus(), undefined);
  relay.connect(source(1));
  assert.equal(refreshes, 1);
  events[0]();
  assert.equal(refreshes, 2);
  relay.connect(source(2));
  assert.equal(releases, 1);
  assert.equal(relay.getPageStatus().current, 2);
  stop();
  events[1]();
  assert.equal(refreshes, 3);
  relay.dispose();
  assert.equal(releases, 2);
  assert.equal(relay.getPageStatus(), undefined);
});

test('disposed framework relay rejects late onReady and subscriptions permanently', () => {
  const relay = createPageStatusRelay();
  let subscriptions = 0,
    emissions = 0,
    reads = 0;
  relay.dispose();
  const stop = relay.subscribePageStatus(() => {
    emissions++;
  });
  relay.connect({
    getPageStatus() {
      reads++;
      return { current: 1, total: 1, partial: false };
    },
    subscribePageStatus() {
      subscriptions++;
      return () => {};
    },
  });
  assert.equal(relay.getPageStatus(), undefined);
  assert.equal(subscriptions, 0);
  assert.equal(emissions, 0);
  assert.equal(reads, 0);
  stop();
  relay.dispose();
});

test('framework relay snapshots listeners when a callback synchronously resubscribes', () => {
  const relay = createPageStatusRelay();
  let calls = 0,
    stop;
  const listener = () => {
    calls++;
    if (calls === 1) {
      stop();
      stop = relay.subscribePageStatus(listener);
    }
  };
  stop = relay.subscribePageStatus(listener);
  relay.connect({});
  assert.equal(calls, 1);
  relay.connect({});
  assert.equal(calls, 2);
  stop();
  relay.dispose();
});
