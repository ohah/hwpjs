import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createTextStyle } from '../../web/preview/text-style.mjs';
import { layoutContent } from '../../web/preview/layout.mjs';
const base = 'legacy/rust/crates/hwp-core/tests/fixtures/';
for (const [name, count] of [
  ['facename', 13],
  ['charshape', 7],
  ['linespacing', 26],
]) {
  test(`HWPX ${name}: nominal height agrees with stored XML and paired HTML boxes`, () => {
    const source = JSON.parse(
      execFileSync(
        'python3',
        ['tests/hwpx/font-height-reference-oracle.py', `${base}${name}.hwpx`],
        { encoding: 'utf8' },
      ),
    );
    const style = createTextStyle(
      { format: 'hwpx', characterShapes: source.shapes },
      '16px sans-serif',
    );
    const boxes = [
      ...readFileSync(`${base}${name}.html`, 'utf8').matchAll(
        /<div class="hls [^"]*" style="([^"]*)"/g,
      ),
    ].map((m) => Number(/(?:^|;)height:([\d.]+)mm;/.exec(m[1])?.[1]));
    assert.equal(source.lines.length, count);
    assert.equal(boxes.length, count);
    for (const [index, line] of source.lines.entries()) {
      assert.ok(line.ids.length > 0);
      const height = Math.max(
        ...line.ids.map((id) =>
          style.fontHeight(
            { text: 'x', characterRanges: [{ start: 0, end: 1, charShapeId: id }] },
            0,
          ),
        ),
      );
      assert.ok(
        Math.abs(height - line.height / 75) < 1e-8,
        `${name} line ${index}: ${height} vs ${line.height / 75}`,
      );
      assert.ok(Math.abs(boxes[index] - (line.height * 25.4) / 7200) <= 0.0051);
    }
  });
}

test('HWPX measured body uses each row font, including smaller and empty rows', () => {
  const paragraph = {
    section: 0,
    paragraph: 1,
    text: 'ab',
    label: '',
    editable: true,
    paragraphShape: { spacingFormat: 'hwpx', modernSpacing: { attributes: 0, value: 100 } },
  };
  const content = { format: 'hwpx', paragraphs: [paragraph] };
  const measure = (_, paragraph, unit) => ({ width: 10, height: unit === 0 ? 40 : 12 });
  const result = layoutContent(content, 10, measure, 20, { documentBody: true });
  assert.deepEqual(
    result.rows.map((row) => row.textHeight),
    [40, 12],
  );
  for (const text of ['', '\n', 'a\n']) {
    const rows = layoutContent(
      { ...content, paragraphs: [{ ...paragraph, text }] },
      100,
      () => ({ width: 0, height: 12 }),
      20,
      { documentBody: true },
    ).rows;
    assert.ok(rows.every((row) => row.textHeight === 12 && row.height === 12));
  }
});
