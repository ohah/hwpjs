import { describe, it, expect } from 'vitest';
import { hello } from '../src/index';

describe('hwp-node', () => {
  it('should return hello message', () => {
    expect(hello()).toBe('Hello from hwp-node TypeScript!');
  });
});

