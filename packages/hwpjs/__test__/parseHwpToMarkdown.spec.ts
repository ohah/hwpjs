import { test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseHwpToMarkdown } from '../index';

const fixturesPath = join(__dirname, '../../examples/fixtures');
const nooriHwpPath = join(fixturesPath, 'noori.hwp');

test('parseHwpToMarkdown with base64 option should include base64 data URI in markdown', () => {
  const hwpData = readFileSync(nooriHwpPath);
  const result = parseHwpToMarkdown(hwpData, { image: 'base64' });

  // Check that markdown contains base64 data URI
  expect(result.markdown).toContain('data:image/');
  expect(result.markdown).toContain('base64,');

  // Check that images array is empty
  expect(result.images).toHaveLength(0);

  // Check that markdown does NOT contain placeholder like image-0
  expect(result.markdown).not.toContain('image-0');

  console.log('Base64 test - First 500 chars of markdown:');
  console.log(result.markdown.substring(0, 500));
});

test('parseHwpToMarkdown with blob option should return images array', () => {
  const hwpData = readFileSync(nooriHwpPath);
  const result = parseHwpToMarkdown(hwpData, { image: 'blob' });

  // Check that markdown contains placeholder
  expect(result.markdown).toContain('image-0');

  // Check that images array is not empty
  expect(result.images.length).toBeGreaterThan(0);

  // Check that markdown does NOT contain base64 data URI
  expect(result.markdown).not.toContain('data:image/');
  expect(result.markdown).not.toContain('base64,');

  console.log('Blob test - Images count:', result.images.length);
  console.log('Blob test - First image ID:', result.images[0]?.id);
});

test('parseHwpToMarkdown without image option should default to blob', () => {
  const hwpData = readFileSync(nooriHwpPath);
  const result = parseHwpToMarkdown(hwpData);

  // Should default to blob behavior
  expect(result.markdown).toContain('image-0');
  expect(result.images.length).toBeGreaterThan(0);
  expect(result.markdown).not.toContain('data:image/');
});
