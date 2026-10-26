import { isHardLineBreak } from "./hard-line-break.mjs";
import { plainDocumentTextInkHeight } from "./document-text-page-fit.mjs";

// Derive the boundary from actual source-row order, not cached line positions.
export function createExplicitPageBreakTerminalFit(flows, peekNextSource) {
  return (row, source) => {
    const sourceText = source?.paragraphSource?.text ?? source?.text;
    if (
      !row ||
      !source ||
      !flows.has(`${source.section}:${source.paragraph}`) ||
      source.kind !== "text" ||
      row.section !== source.section ||
      row.paragraph !== source.paragraph ||
      row.paragraphShape?.spacingFormat !== "hwpx" ||
      (source.paragraphShape?.after ?? 0) !== 0 ||
      Object.hasOwn(row, "pageFitHeight") ||
      row.noteOwnerNode !== undefined ||
      row.pageArea !== undefined ||
      row.drawingNode !== undefined ||
      typeof row.text !== "string" ||
      !row.text.trim() ||
      typeof sourceText !== "string" ||
      sourceText.includes("\ufffc") ||
      (row.paragraphShape?.after ?? 0) !== 0 ||
      (source.paragraphSource?.textStartUnit ?? 0) !== 0 ||
      isHardLineBreak(sourceText.slice(-1))
    )
      return row;
    const terminal =
      typeof source.paragraphSource?.text === "string"
        ? source.paragraphSource.text.length
        : source.lastLine === true
          ? source.endUnit
          : null;
    if (!Number.isSafeInteger(terminal) || terminal < 1 || row.endUnit !== terminal) return row;
    const ink = plainDocumentTextInkHeight(row);
    if (ink === null) return row;
    const next = peekNextSource();
    if (
      !next ||
      next.section !== source.section ||
      next.paragraph === source.paragraph ||
      flows.get(`${next.section}:${next.paragraph}`)?.page_break !== true
    )
      return row;
    return { ...row, pageFitHeight: ink };
  };
}
