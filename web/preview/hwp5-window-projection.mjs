import { displayContent } from './content.mjs';
import { planParagraphDependencies } from './paragraph-dependency-plan.mjs';
import {
  hwp5OwnedWindowDependencies,
  hwp5FieldOwnedWindowDependencies,
} from './hwp5-owned-window-dependencies.mjs';

export function projectHwp5DependencyWindow(
  editor,
  projection,
  { offset, count, maxParagraphs = 20000, maxUnits = 200000 },
  discover,
) {
  if (!Number.isSafeInteger(maxUnits) || maxUnits < 0) throw new RangeError('InvalidDisplayBounds');
  const total = projection.sections.reduce((sum, section) => sum + section.paragraphs.length, 0);
  planParagraphDependencies({ total, offset, count, maxParagraphs, dependencies: new Map() });
  const found = discover(editor, projection);
  const plan = planParagraphDependencies({ ...found, offset, count, maxParagraphs });
  const content = displayContent(projection, {
    paragraphOrdinals: plan.ordinals,
    maxParagraphs,
    maxUnits,
  });
  if (content.paragraphs.some((row) => row.clipped))
    throw new RangeError('ParagraphWindowTextBudgetExceeded');
  for (const paragraph of content.paragraphs) {
    const ordinal = found.ordinals.get(`${paragraph.section}:${paragraph.paragraph}`);
    if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= total)
      throw new Error('WindowDependencyBindingMismatch');
    paragraph.windowOrdinal = ordinal;
    paragraph.windowContext = ordinal < offset || ordinal >= offset + count;
    if (found.fieldTopologyDiagnostics?.has(paragraph.section)) {
      paragraph.fieldTopologyEditableCandidate = paragraph.editable === true;
      paragraph.selectable =
        !paragraph.windowContext && (paragraph.selectable === true || paragraph.editable === true);
      paragraph.editable = false;
      paragraph.fieldTopologyError = 'UnresolvedFieldMarkers';
    }
    if (paragraph.windowContext) {
      paragraph.editable = false;
      paragraph.selectable = false;
    }
  }
  const diagnostics = [...(found.fieldTopologyDiagnostics ?? [])]
    .filter(([section]) => content.paragraphs.some((row) => row.section === section))
    .map(([section, unresolved]) => ({ section, unresolved }));
  if (diagnostics.length) {
    content.fieldTopologyDiagnostics = diagnostics;
    content.readOnly = !content.paragraphs.some((row) => row.editable === true);
  }
  return {
    ...content,
    window: {
      requestedOffset: offset,
      requestedCount: count,
      paragraphOffset: offset,
      paragraphCount: count,
      contextCount: plan.ordinals.length - count,
    },
  };
}

// Compatibility route without the optional field-span ABI; query uses the explicit extended route.
export function projectHwp5OwnedWindow(editor, projection, options) {
  return projectHwp5DependencyWindow(editor, projection, options, hwp5OwnedWindowDependencies);
}

export function projectHwp5FieldOwnedWindow(editor, projection, options) {
  return projectHwp5DependencyWindow(editor, projection, options, hwp5FieldOwnedWindowDependencies);
}
