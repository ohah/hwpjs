import { validateHwp5DocumentProperties } from "../../js/hwp5-document-properties.mjs";
import { structuralAnchorUnits } from "./structural-anchor-units.mjs";
import { hwp5NumberingObjectUnits } from "./hwp5-numbering-object-units.mjs";
import { validateHwp5PageControlSources } from "../../js/hwp5-page-control-sources.mjs";

export function attachHwp5DocumentProperties(editor, content) {
  content.documentPropertySource = null;
  content.documentPropertySourceError = null;
  if (!editor || !(content.pageAreaSources?.length || content.pageControlSources?.length)) return content;
  try { content.documentPropertySource = validateHwp5DocumentProperties(editor.documentProperties()); }
  catch (error) { content.documentPropertySourceError = error.message; }
  return content;
}

/** First and only section: zero section start continues the explicit document start. */
export function hwp5EffectivePageNumberSource(content) {
  if (content.documentPropertySourceError || !content.documentPropertySource) throw new Error("MissingHwp5DocumentProperties");
  const document = validateHwp5DocumentProperties(content.documentPropertySource), sections = content.sectionSources;
  if (document.section_count !== 1 || sections?.length !== 1 || sections[0].section !== 0) throw new Error("UnsupportedHwp5SectionNumbering");
  if (document.extra_bytes !== 0 || document.extra_nonzero) throw new Error("UnsupportedHwp5DocumentPropertiesExtension");
  const section = sections[0];
  if (section.flags !== 0 || !Number.isInteger(section.page_start) || section.page_start < 0 || section.page_start > 65535) throw new Error("UnsupportedHwp5SectionNumbering");
  const start = section.page_start === 0 ? document.page_start : section.page_start;
  if (start < 1) throw new Error("MissingEffectivePageNumber");
  const controls = validateHwp5PageControlSources(content.pageControlSources ?? []);
  if (controls.length && content.pageControlSourceErrors?.length) throw new Error("IncompleteHwp5PageNumberControls");
  for (const flow of content.currentParagraphFlows ?? []) {
    if (flow.host !== "body") continue;
    const paragraph = content.paragraphs.find(row => row.section === flow.section && row.paragraph === flow.paragraph);
    if (!paragraph || paragraph.clipped) throw new Error("IncompleteHwp5PageNumberControls");
    const declarations = structuralAnchorUnits(paragraph);
    const objects = hwp5NumberingObjectUnits(content, paragraph);
    if ([...objects].some(unit => declarations.has(unit))) throw new Error("AmbiguousHwp5NumberingObjectAnchor");
    const pageUnits = new Set();
    for (const control of controls.filter(row => row.section === paragraph.section && row.paragraph === paragraph.paragraph)) {
      if (!Number.isInteger(control.unit) || paragraph.text[control.unit] !== "\ufffc" || declarations.has(control.unit) || objects.has(control.unit) || pageUnits.has(control.unit)) throw new Error("AmbiguousHwp5PageNumberAnchor");
      pageUnits.add(control.unit);
    }
    for (let unit = 0; unit < paragraph.text.length; unit++) if (paragraph.text[unit] === "\ufffc" && !declarations.has(unit) && !objects.has(unit) && !pageUnits.has(unit)) throw new Error("UnsupportedHwp5PageNumberControls");
  }
  return { supported: true, start_page: start, hide_first_header: false, hide_first_footer: false, ...(controls.length ? { page_controls: controls } : {}) };
}
