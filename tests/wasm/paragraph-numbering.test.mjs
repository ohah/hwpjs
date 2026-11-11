import assert from 'node:assert/strict';
import test from 'node:test';
import { paragraphNumberingLabels } from '../../web/preview/paragraph-numbering.mjs';
import { observedParagraphHeading } from '../../web/preview/paragraph-heading.mjs';

const level = (level, start, format, template) => ({ level, start, format, template });
const section = (section, outline = 2, controls_complete = true) => ({
  section,
  outline,
  controls_complete,
});
const row = (section, paragraph, kind, level = 0, id = 0, host = 'body') => ({
  section,
  paragraph,
  host,
  selectionOwner: `section:${section}:${host}`,
  paragraphShape: { heading: { kind, id, level } },
  text: '999. Text resembling a list label',
});
const definitions = [
  {
    id: 2,
    start: 7,
    levels: [level(1, 7, 'DIGIT', '제^1장 '), level(2, 3, 'ROMAN_SMALL', '(^2)')],
  },
  { id: 3, start: 1, levels: [level(1, 1, 'DIGIT', '^1.')] },
];

function read(rows, sections = [section(0)], resources = definitions, fields = {}) {
  const content = {
    format: 'hwpx',
    totalParagraphs: rows.length,
    paragraphs: rows,
    paragraphFlows: rows,
    ...fields,
  };
  return Object.fromEntries(
    [...paragraphNumberingLabels(content, { definitions: resources, sections })].map(
      ([key, value]) => [key, value.text],
    ),
  );
}

test('honors matching definition and level starts, resets descendants and preserves the exact template', () => {
  assert.deepEqual(
    read([
      row(0, 0, 'outline'),
      row(0, 1, 'outline', 1),
      row(0, 2, 'outline', 1),
      row(0, 3, 'none'),
      row(0, 4, 'outline'),
      row(0, 5, 'outline', 1),
    ]),
    { '0:0': '제7장 ', '0:1': '(iii)', '0:2': '(iv)', '0:4': '제8장 ', '0:5': '(iii)' },
  );
});

test('carries the same outline definition across sections and withholds changed outline or ordinary-list identity', () => {
  const outlines = [row(0, 0, 'outline'), row(1, 1, 'outline'), row(1, 2, 'outline', 1)];
  assert.deepEqual(read(outlines, [section(0), section(1)]), {
    '0:0': '제7장 ',
    '1:1': '제8장 ',
    '1:2': '(iii)',
  });
  assert.deepEqual(read(outlines, [section(0), section(1, 3)]), { '0:0': '제7장 ' });
  assert.deepEqual(
    read([row(0, 0, 'number', 0, 3), row(0, 1, 'number', 0, 2), row(0, 2, 'number', 0, 3)]),
    { '0:0': '1.' },
  );
  assert.deepEqual(
    read([row(0, 0, 'number', 0, 3), row(1, 1, 'number', 0, 3)], [section(0), section(1)]),
    { '0:0': '1.' },
  );
  assert.deepEqual(
    read([row(0, 0, 'number', 0, 3), row(0, 1, 'none'), row(0, 2, 'number', 0, 3)]),
    { '0:0': '1.' },
  );
});

test('withholds unobserved ownership, nested numbering, and ambiguous restart or start precedence', () => {
  const rows = [
    row(0, 0, 'outline'),
    row(0, 1, 'outline', 0, 0, 'table'),
    row(0, 2, 'outline'),
    row(0, 3, 'number', 0, 3),
  ];
  assert.deepEqual(read(rows), { '0:0': '제7장 ', '0:3': '1.' });
  assert.deepEqual(read(rows, [section(0, 2, false)]), {});
  assert.deepEqual(read(rows, [section(0)], definitions, { totalParagraphs: 5 }), {});
  assert.deepEqual(read([row(0, 0, 'outline'), row(0, 2, 'outline')]), {});
  assert.deepEqual(
    read(
      [row(0, 0, 'outline')],
      [section(0)],
      [{ id: 2, start: 9, levels: [level(1, 7, 'DIGIT', '^1.')] }],
    ),
    {},
  );
  assert.deepEqual(
    read(
      [row(0, 0, 'number', 0, 2)],
      [section(0)],
      [{ id: 2, start: 0, levels: [level(1, 7, 'DIGIT', '^1.')] }],
    ),
    {},
  );
});

test('withholds missing ancestors and unknown tokens without counting those rows as parent items', () => {
  const levels = [level(1, 1, 'DIGIT', '^1.'), level(2, 1, 'DIGIT', '^x')];
  const rows = [
    row(0, 0, 'outline', 1),
    row(0, 1, 'outline'),
    row(0, 2, 'outline', 1),
    row(0, 3, 'outline'),
  ];
  assert.deepEqual(read(rows, [section(0)], [{ id: 2, start: 1, levels }]), {
    '0:1': '1.',
    '0:3': '2.',
  });
  levels[1] = level(2, 1, 'ROMAN_SMALL', '^1.^2');
  assert.deepEqual(read(rows, [section(0)], [{ id: 2, start: 1, levels }]), {
    '0:1': '1.',
    '0:3': '2.',
  });
  levels[1] = level(2, 1, 'DIGIT', '^1.^2');
  assert.deepEqual(read(rows, [section(0)], [{ id: 2, start: 1, levels }]), {
    '0:1': '1.',
    '0:2': '1.1',
    '0:3': '2.',
  });
});

test('computes HWP5 decimal level paths and withholds unobserved nonzero format bits', () => {
  const paragraphs = [0, 1, 2].map((paragraph) => ({
    section: 0,
    paragraph,
    host: 'body',
    selectionOwner: 'section:0:body',
    paragraphShape: { headingKind: 2, headingId: 1, headingLevel: paragraph === 0 ? 0 : 1 },
  }));
  const content = {
    format: 'hwp5',
    totalParagraphs: 3,
    paragraphs,
    currentParagraphFlows: paragraphs,
    sectionSources: [{ section: 0, numbering_id: 0 }],
    pageControlSourceErrors: [],
    pageControlSources: [{ section: 0, kind: 'restart', attributes: 0, extra_nonzero: false }],
  };
  const resource = {
    id: 1,
    start: 4,
    levels: [
      { start: 4, attributes: 12, template: '^1.' },
      { start: 2, attributes: 12, template: '^N' },
    ],
  };
  const labels = paragraphNumberingLabels(content, [resource]);
  assert.equal(labels.get('0:0').text, '4.');
  assert.equal(labels.get('0:1').text, '4.2.');
  assert.equal(labels.get('0:2').text, '4.3.');
  assert.deepEqual(
    observedParagraphHeading('hwp5', paragraphs[1].paragraphShape, labels.get('0:1')),
    {
      state: 'available',
      kind: 'number',
      text: '4.2.',
      provenance: 'hwp5-numbering',
    },
  );
  resource.levels[1].attributes = 0x10c;
  assert.deepEqual([...paragraphNumberingLabels(content, [resource]).keys()], ['0:0']);
  content.pageControlSources[0].attributes = 6;
  assert.equal(paragraphNumberingLabels(content, [resource]).size, 0);
});

test('HWP5 outline counters carry across explicit equal section references with local paragraph ordinals', () => {
  const paragraphs = [0, 1].map((section) => ({
    section,
    paragraph: 0,
    host: 'body',
    selectionOwner: `section:${section}:body`,
    paragraphShape: { headingKind: 1, headingId: 0, headingLevel: 0 },
  }));
  const content = {
    format: 'hwp5',
    totalParagraphs: 2,
    paragraphs,
    currentParagraphFlows: paragraphs,
    sectionSources: [
      { section: 0, numbering_id: 2 },
      { section: 1, numbering_id: 2 },
    ],
    pageControlSourceErrors: [],
    pageControlSources: [],
  };
  const resource = { id: 2, start: 0, levels: [{ start: 1, attributes: 12, template: '제^1장' }] };
  assert.deepEqual(
    [...paragraphNumberingLabels(content, [resource])],
    [
      ['0:0', { kind: 'outline', text: '제1장' }],
      ['1:0', { kind: 'outline', text: '제2장' }],
    ],
  );
  content.sectionSources[1].numbering_id = 3;
  assert.deepEqual(
    [...paragraphNumberingLabels(content, [resource, { ...resource, id: 3 }]).keys()],
    ['0:0'],
  );
});
