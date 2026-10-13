import { displayContent } from "./content.mjs";
import { hwp5TableWindowDependencies } from "./hwp5-table-window-dependencies.mjs";
import { planParagraphDependencies } from "./paragraph-dependency-plan.mjs";

// Table dependency slice only; not yet the general HWP5 Worker window route.
export function projectHwp5TableWindow(editor, projection, { offset, count, maxParagraphs = 20000, maxUnits = 200000 }) {
  const total = projection.sections.reduce((sum, section) => sum + section.paragraphs.length, 0);
  planParagraphDependencies({ total, offset, count, maxParagraphs, dependencies: new Map() });
  const found = hwp5TableWindowDependencies(editor, projection);
  const plan = planParagraphDependencies({ ...found, offset, count, maxParagraphs });
  const content = displayContent(projection, { paragraphOrdinals: plan.ordinals, maxParagraphs, maxUnits });
  if (content.paragraphs.some(row => row.clipped)) throw new RangeError("ParagraphWindowTextBudgetExceeded");
  for (const paragraph of content.paragraphs) {
    const ordinal = found.ordinals.get(`${paragraph.section}:${paragraph.paragraph}`);
    paragraph.windowContext = ordinal < offset || ordinal >= offset + count;
    if (paragraph.windowContext) { paragraph.editable = false; paragraph.selectable = false; }
  }
  return { ...content, window: { requestedOffset: offset, requestedCount: count, paragraphOffset: offset, paragraphCount: count, contextCount: plan.ordinals.length - count } };
}
