import test from 'node:test';
import assert from 'node:assert/strict';
import { sectionObjectContent } from '../../web/preview/section-object-content.mjs';

test('section projection retains only its own original HWP5 drawing roots', () => {
  const roots = [0, 1].map((section) => ({ section, componentNode: 34 }));
  const input = {
    hwp5Drawings: roots,
    pictures: roots.map((root) => ({ section: root.section, pictureNode: 34 })),
  };
  const before = structuredClone(input),
    declared = new Map([
      [0, {}],
      [1, {}],
    ]);
  for (const section of [0, 1]) {
    const projected = sectionObjectContent(input, section, declared);
    assert.deepEqual(projected.hwp5Drawings, [roots[section]]);
    assert.equal(projected.hwp5Drawings[0], roots[section]);
    assert.deepEqual(projected.pictures, [input.pictures[section]]);
  }
  assert.deepEqual(input, before);
});

test('section projection validates original root ownership before filtering', () => {
  for (const roots of [null, {}, [null], [{}], [{ section: -1 }], [{ section: 0.5 }]])
    assert.throws(() => sectionObjectContent({ hwp5Drawings: roots }, 0), {
      message: 'AmbiguousSectionObjects',
    });
  assert.throws(
    () =>
      sectionObjectContent(
        { hwp5Drawings: [{ section: 2 }] },
        0,
        new Map([
          [0, {}],
          [1, {}],
        ]),
      ),
    { message: 'UnsupportedPageSections' },
  );
});
