import { test, expect } from 'bun:test';
import { createViewOptionsBridge } from '../src/view-options-bridge.ts';
import { VIEW_ZOOM_LEVELS, isMenuZoomPercent, stepViewZoom } from '../src/view-zoom.ts';
test('unmounted, not-ready and disposed presentation remains unavailable', () => {
  const b = createViewOptionsBridge({ getHost: () => undefined, onStatus: () => {} });
  expect(b.presentation(true)['toggle-paragraph-marks']?.enabled).toBe(false);
  expect(b.presentation(false)['toggle-paragraph-marks']?.enabled).toBe(false);
  b.dispose();
  expect(b.presentation(true)['toggle-paragraph-marks']?.reason).toContain('종료');
});
test('success toggles observed value and focuses once without editor/model ports', () => {
  let value = true,
    focus = 0;
  const calls: unknown[] = [];
  const host = {
    getDisplayOptions: () => ({ paragraphMarks: value }),
    setDisplayOptions: (v: { paragraphMarks: boolean }) => {
      calls.push(v);
      value = v.paragraphMarks;
      return true;
    },
    focus: () => {
      focus++;
      return true;
    },
  };
  const b = createViewOptionsBridge({
    getHost: () => host as any,
    onStatus: () => {
      throw Error('unexpected status');
    },
  });
  expect(b.presentation(true)['toggle-paragraph-marks']?.pressed).toBe(true);
  expect(b.action({ command: 'toggle-paragraph-marks' } as any)).toBe(true);
  expect(calls).toEqual([{ paragraphMarks: false }]);
  expect(focus).toBe(1);
  expect(b.presentation(true)['toggle-paragraph-marks']?.pressed).toBe(false);
});
test('rejection and thrown display failure never focus or invent success', () => {
  for (const throws of [false, true]) {
    let focus = 0;
    const status: string[] = [];
    const b = createViewOptionsBridge({
      getHost: () =>
        ({
          getDisplayOptions: () => ({ paragraphMarks: false }),
          setDisplayOptions: () => {
            if (throws) throw Error('DisplayRejected');
            return false;
          },
          focus: () => {
            focus++;
            return true;
          },
        }) as any,
      onStatus: (s) => status.push(s),
    });
    b.action({ command: 'toggle-paragraph-marks' } as any);
    expect(focus).toBe(0);
    expect(status.length).toBe(1);
  }
});
test('fresh host observation, unknown action and disposal produce no stale writes', () => {
  let writes = 0;
  let host: any = {
    getDisplayOptions: () => ({ paragraphMarks: false }),
    setDisplayOptions: () => {
      writes++;
      return true;
    },
  };
  const b = createViewOptionsBridge({ getHost: () => host, onStatus: () => {} });
  expect(b.action({ command: 'undo' } as any)).toBe(false);
  host = undefined;
  b.action({ command: 'toggle-paragraph-marks' } as any);
  b.dispose();
  b.action({ command: 'toggle-paragraph-marks' } as any);
  expect(writes).toBe(0);
});
test('zoom choices follow renderer scales; edges no-op and invalid values rejected', () => {
  expect(VIEW_ZOOM_LEVELS[0]).toBe(50);
  expect(VIEW_ZOOM_LEVELS.at(-1)).toBe(300);
  expect(stepViewZoom(300, 'in')).toBe(null);
  expect(stepViewZoom(50, 'out')).toBe(null);
  expect(stepViewZoom(100, 'in')).toBe(125);
  expect(stepViewZoom(100, 'out')).toBe(75);
  for (const v of [NaN, Infinity, '100', 0, 400, 101]) expect(isMenuZoomPercent(v)).toBe(false);
});
