import { pageRowRequiredHeight } from './page-row-extents.mjs';

// Keep a measured paragraph's before spacing with its first ordinary text ink.
// The existing paginator owns page/column selection and oversized-row refusal.
export function hwp5ParagraphBeforeGap(gap, row, paragraph) {
  if (
    !row ||
    gap?.kind !== 'gap' ||
    gap.paragraphBefore !== true ||
    gap.section !== row?.section ||
    gap.paragraph !== row?.paragraph ||
    row.kind !== 'text' ||
    row.startUnit !== 0 ||
    typeof row.text !== 'string' ||
    row.text.includes('\ufffc') ||
    row.paragraphShape?.spacingFormat !== 'hwp5' ||
    paragraph?.tableCell ||
    paragraph?.tableCaption ||
    paragraph?.drawingCaption ||
    row.transform ||
    row.inlineTables ||
    row.sourceObjectAnchor ||
    row.tableVerticalSource ||
    row.tableNode !== undefined ||
    row.positionedFragments ||
    !Number.isFinite(gap.height) ||
    gap.height <= 0 ||
    gap.keepNextHeight !== undefined
  )
    return gap;
  const required = pageRowRequiredHeight(row, row.keepNextHeight ?? 0);
  return required !== null && required > 0 ? { ...gap, keepNextHeight: required } : gap;
}
