import test from 'node:test';
import assert from 'node:assert/strict';
import {
  root,
  flow,
  partitionUnchanged,
  ids,
  assertConserved,
  nestedContent,
} from './page-area-root-fixture.mjs';

test('same local component and paragraph IDs in distinct sections keep distinct area owners', () => {
  const content = {
    paragraphs: [0, 1].flatMap((section) =>
      [0, 1, 2].map((paragraph) => ({ section, paragraph, text: 'x' })),
    ),
    paragraphFlows: [
      flow(0, 0),
      flow(0, 1, 'header'),
      flow(0, 2),
      flow(1, 0),
      flow(1, 1),
      flow(1, 2, 'footer'),
    ],
    hwp5Drawings: [root(0, 34, 1), root(1, 34, 1), root(0, 35, 0), root(1, 35, 2)],
  };
  const p = partitionUnchanged(content);
  assert.equal(p.state, 'partitioned', p.error);
  assert.deepEqual(ids(p.body.hwp5Drawings), ['1:34', '0:35']);
  assert.deepEqual(ids(p.areas.find((a) => a.section === 0 && a.host === 'header').hwp5Drawings), [
    '0:34',
  ]);
  assert.deepEqual(ids(p.areas.find((a) => a.section === 1 && a.host === 'footer').hwp5Drawings), [
    '1:35',
  ]);
  assertConserved(content, p);
});

test('raw roots follow drawing-text and table-cell ownership recursively into the header', () => {
  const content = nestedContent(),
    p = partitionUnchanged(content);
  assert.equal(p.state, 'partitioned', p.error);
  assert.deepEqual(p.body.hwp5Drawings, []);
  assert.deepEqual(ids(p.areas[0].hwp5Drawings), ['0:200', '0:300']);
  assert.deepEqual(
    p.areas[0].paragraphs.map((r) => r.paragraph),
    [0, 1, 2],
  );
  assert.deepEqual(
    p.areas[0].pictures.map((r) => r.pictureNode),
    [300],
  );
  assertConserved(content, p);
});

test('missing raw-root host cannot silently fall back to the body or another section', () => {
  for (const [section, hostParagraph] of [
    [0, 99],
    [1, 0],
  ]) {
    const p = partitionUnchanged({
      paragraphs: [{ section: 0, paragraph: 0, text: 'x' }],
      paragraphFlows: [flow(0, 0)],
      hwp5Drawings: [root(section, 34, hostParagraph)],
    });
    assert.equal(p.state, 'unavailable');
    assert.equal(p.error, 'MissingPageAreaParagraphOwner');
    assert.equal(p.body, undefined);
  }
});

test('nested missing, mismatched and cyclic drawing owners remain refused', () => {
  for (const [mutate, expected] of [
    [
      (c) => {
        c.drawings = [];
      },
      'MissingPageAreaObjectOwner',
    ],
    [
      (c) => {
        c.drawings[0].source.text.list_node = 999;
      },
      'InvalidPageAreaDrawingOwnership',
    ],
    [
      (c) => {
        c.drawings[0].hostParagraph = 2;
      },
      'CyclicPageAreaOwnership',
    ],
  ]) {
    const content = nestedContent();
    mutate(content);
    const p = partitionUnchanged(content);
    assert.equal(p.state, 'unavailable');
    assert.equal(p.error, expected);
    assert.equal(p.body, undefined);
  }
});

test('malformed and duplicate original root identities remain explicit failures', () => {
  const valid = root(0, 34, 0);
  for (const hwp5Drawings of [
    null,
    {},
    [null],
    [{ ...valid, section: -1 }],
    [{ ...valid, componentNode: 0.5 }],
    [{ ...valid, hostParagraph: -1 }],
    [{ componentNode: 34 }],
  ]) {
    const p = partitionUnchanged({ paragraphs: [{ section: 0, paragraph: 0 }], hwp5Drawings });
    assert.equal(p.error, 'InvalidPageAreaOwnership');
    assert.equal(p.body, undefined);
  }
  for (const duplicate of [valid, { ...valid }, { ...valid, hostParagraph: 1 }]) {
    const p = partitionUnchanged({
      paragraphs: [
        { section: 0, paragraph: 0 },
        { section: 0, paragraph: 1 },
      ],
      paragraphFlows: [flow(0, 0), flow(0, 1, 'header')],
      hwp5Drawings: [valid, duplicate],
    });
    assert.equal(p.state, 'unavailable');
    assert.equal(
      p.error,
      'AmbiguousPageAreaOwnership',
      'same-section duplicates cannot hide in separate body/header owners',
    );
    assert.equal(p.body, undefined);
  }
});

test('non-HWP5 content keeps absent roots absent and empty provided roots distinct', () => {
  const base = {
    paragraphs: [{ section: 0, paragraph: 0 }],
    paragraphFlows: [flow(0, 0, 'header')],
  };
  const absent = partitionUnchanged(base);
  assert.equal(absent.state, 'partitioned', absent.error);
  for (const scope of [absent.body, ...absent.areas])
    assert.equal(Object.hasOwn(scope, 'hwp5Drawings'), false);
  const empty = partitionUnchanged({ ...base, hwp5Drawings: [] });
  assert.equal(empty.state, 'partitioned', empty.error);
  for (const scope of [empty.body, ...empty.areas]) assert.deepEqual(scope.hwp5Drawings, []);
});
