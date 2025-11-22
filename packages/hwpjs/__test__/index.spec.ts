import { test, expect } from 'bun:test';

import { plus100 } from '../index';

test('sync function from native code', () => {
  const fixture = 42;
  expect(plus100(fixture)).toBe(fixture + 100);
});
