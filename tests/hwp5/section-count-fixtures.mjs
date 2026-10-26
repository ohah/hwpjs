import { readFileSync } from 'node:fs';

export function parseSectionCountFixtureInventory(json) {
  const rows = JSON.parse(json);
  if (!Array.isArray(rows) || rows.length !== 3 || rows.some((row) => !validRow(row)))
    throw new Error('InvalidSectionCountFixtureInventory');
  if (new Set(rows.map((row) => row.path)).size !== rows.length)
    throw new Error('DuplicateSectionCountFixturePath');
  return Object.freeze(
    rows.map((row) =>
      Object.freeze([
        row.path,
        row.version,
        row.declared,
        row.available,
        row.sha256,
        row.paragraphs,
      ]),
    ),
  );
}

function validRow(row) {
  return (
    typeof row?.path === 'string' &&
    !/[\\:]/.test(row.path) &&
    row.path.split('/').every((part) => part !== '' && part !== '.' && part !== '..') &&
    row.path.endsWith('.hwp') &&
    typeof row.version === 'string' &&
    /^\d+\.\d+\.\d+\.\d+$/.test(row.version) &&
    row.version.split('.').every((part) => Number(part) <= 255) &&
    typeof row.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(row.sha256) &&
    [row.declared, row.available].every((n) => Number.isInteger(n) && n >= 1 && n <= 1024) &&
    row.declared !== row.available &&
    Number.isSafeInteger(row.paragraphs) &&
    row.paragraphs >= 1
  );
}

export const sectionCountFixtures = parseSectionCountFixtureInventory(
  readFileSync(
    new URL('../../src/hwp5/testdata/section-count-fixtures.json', import.meta.url),
    'utf8',
  ),
);
