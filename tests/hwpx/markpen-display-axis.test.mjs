import test from "node:test";
import assert from "node:assert/strict";
import { displayHwpxContent } from "../../web/preview/hwpx-content.mjs";

const location = { section: 0, paragraph: 1 };
const render = events => displayHwpxContent({ paragraphCount: 1, events: [
  { ...location, kind: "paragraph_start" }, ...events.map(event => ({ ...location, ...event })),
  { ...location, kind: "paragraph_end" },
] });

test("known markpen markers occupy no display units while unknown inline content remains visible", () => {
  const pair = [
    { kind: "inline_empty", inlineKind: "markpen_begin" },
    { kind: "inline_empty", inlineKind: "markpen_end" },
  ];
  assert.equal(render(pair).paragraphs[0].text, "");
  assert.equal(render([
    { kind: "content", value: "앞😀" }, pair[0],
    { kind: "content", value: "강조" }, pair[1],
    { kind: "inline_empty", inlineKind: "unknown" },
    { kind: "content", value: "뒤" },
  ]).paragraphs[0].text, "앞😀강조\ufffc뒤");
  const clipped = displayHwpxContent({ paragraphCount: 1, events: [
    { ...location, kind: "paragraph_start" },
    ...pair.map(event => ({ ...location, ...event })),
    { ...location, kind: "content", value: "😀" },
    { ...location, kind: "paragraph_end" },
  ] }, { maxUnits: 1 });
  assert.equal(clipped.paragraphs[0].text, "");
  assert.equal(clipped.limited, true);
});
