import { displayContent } from "./content.mjs";
import { planParagraphDependencies } from "./paragraph-dependency-plan.mjs";
import { hwp5OwnedWindowDependencies } from "./hwp5-owned-window-dependencies.mjs";

export function projectHwp5DependencyWindow(editor, projection, { offset, count, maxParagraphs = 20000, maxUnits = 200000 }, discover) {
  if (!Number.isSafeInteger(maxUnits) || maxUnits < 0) throw new RangeError("InvalidDisplayBounds");
  const total = projection.sections.reduce((sum, section) => sum + section.paragraphs.length, 0);
  planParagraphDependencies({ total, offset, count, maxParagraphs, dependencies: new Map() });
  const found = discover(editor, projection);
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

// Includes tables/captions/notes/drawings; field closure and Worker remain pending.
export function projectHwp5OwnedWindow(editor, projection, options) {
  return projectHwp5DependencyWindow(editor, projection, options, hwp5OwnedWindowDependencies);
}
