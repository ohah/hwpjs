import test from "node:test";
import assert from "node:assert/strict";
import { hwp5EffectivePageNumberSource, attachHwp5DocumentProperties } from "../../web/preview/hwp5-document-numbering.mjs";
import { layoutHwp5PageContent } from "../../web/preview/hwp5-page-layout.mjs";
const properties = { source_record: 0, section_count: 1, page_start: 7, footnote_start: 1, endnote_start: 1, picture_start: 1, table_start: 1, equation_start: 1, caret_list: 0, caret_paragraph: 0, caret_character: 0, extra_bytes: 0, extra_nonzero: false };
const content = () => ({ documentPropertySource: properties, sectionSources: [{ section: 0, flags: 0, page_start: 0 }], currentParagraphFlows: [{ host: "body", section: 0, paragraph: 0 }], paragraphs: [{ section: 0, paragraph: 0, text: "본문" }] });
test("empty page control results cannot hide source query failures", () => {
  const value = content();
  value.pageControlSources = [];
  value.pageControlSourceErrors = [{ section: 0, error: "UnsupportedPageNumberControl" }];
  assert.throws(() => hwp5EffectivePageNumberSource(value), { message: "IncompleteHwp5PageNumberControls" });
  for (const options of [{}, { pageNumbers: [7] }]) {
    assert.deepEqual(layoutHwp5PageContent(value, () => 8, 20000, options), { state: "unavailable", error: "IncompleteHwp5PageNumberControls" });
  }
  value.pageControlSourceErrors = [];
  assert.equal(hwp5EffectivePageNumberSource(value).start_page, 7);
});
test("document numbering preserves explicit document start and section restart without defaults", () => {
  assert.equal(hwp5EffectivePageNumberSource(content()).start_page, 7);
  const restart = content(); restart.sectionSources[0].page_start = 2;
  assert.equal(hwp5EffectivePageNumberSource(restart).start_page, 2);
  for (const patch of [{ page_start: 0 }, { section_count: 2 }, { extra_bytes: 1 }]) assert.throws(() => hwp5EffectivePageNumberSource({ ...content(), documentPropertySource: { ...properties, ...patch } }));
  const control = content(); control.paragraphs[0].text = "\ufffc";
  assert.throws(() => hwp5EffectivePageNumberSource(control), /PageNumberControls/);
  control.paragraphs[0].structuralAnchors = [{ kind: "header", control_node: 1, paragraph: 0, unit: 0 }];
  assert.equal(hwp5EffectivePageNumberSource(control).start_page, 7);
});
test("section flags cannot be ignored or borrowed from a master page profile for numbering", () => {
  for (const flags of [1, 2, 4, 32, 1 << 16, 1 << 20, 1 << 21, 0x20000000]) {
    const value = content();
    value.sectionSources[0].flags = flags;
    assert.throws(() => hwp5EffectivePageNumberSource(value), { message: "UnsupportedHwp5SectionNumbering" });
    assert.equal(value.sectionSources[0].flags, flags);
  }
});
test("document properties attachment clears stale values and reports optional ABI failure", () => {
  const value = { pageAreaSources: [{}], documentPropertySource: "stale" };
  attachHwp5DocumentProperties({ documentProperties: () => properties }, value);
  assert.equal(value.documentPropertySource, properties);
  attachHwp5DocumentProperties({ documentProperties() { throw new Error("Unavailable"); } }, value);
  assert.equal(value.documentPropertySource, null); assert.equal(value.documentPropertySourceError, "Unavailable");
  attachHwp5DocumentProperties(null, value);
  assert.equal(value.documentPropertySourceError, null);
});

test("numbering exempts exact object ownership but not unknown page controls or ambiguous anchors", () => {
  const value = content(); value.paragraphs[0].text = "\ufffc\ufffc";
  value.hwp5Drawings = [{ section: 0, hostParagraph: 0, anchorUnit: 0, controlNode: 4, componentNode: 5, source: { control_node: 4, component_node: 5 } }];
  value.tables = [{ section: 0, hostParagraph: 0, anchorUnit: 1, tableNode: 8 }];
  assert.equal(hwp5EffectivePageNumberSource(value).start_page, 7);
  for (const mutate of [
    c => c.paragraphs[0].text += "\ufffc",
    c => c.hwp5Drawings[0].source.control_node = 9,
    c => c.hwp5Drawings.push(structuredClone(c.hwp5Drawings[0])),
    c => c.tables[0].anchorUnit = 0,
    c => c.tables[0].section = 1,
    c => c.tables[0].tableNode = -1,
    c => c.paragraphs[0].structuralAnchors = [{ kind: "header", control_node: 9, paragraph: 0, unit: 0 }],
  ]) {
    const copy = structuredClone(value); mutate(copy);
    assert.throws(() => hwp5EffectivePageNumberSource(copy), /PageNumberControls|NumberingObjectAnchor/);
  }
});
