import { test, expect } from 'bun:test';

import { parseHwp } from '../index';

test('parse_hwp should parse HWP file', () => {
  // 현재는 placeholder 구현이므로 "Hello from hwp-core!"를 반환
  const result = parseHwp('test.hwp');
  expect(result).toBe('Hello from hwp-core!');
});
