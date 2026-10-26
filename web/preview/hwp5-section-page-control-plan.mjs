import { numberSectionPages } from "./section-page-numbering.mjs";
import { planHwp5PageControls } from "./hwp5-page-control-plan.mjs";

/** Resolve each explicit section scope and carry the post-restart counter. */
export function planHwp5SectionPageControls(
  controls,
  paragraphs,
  rows,
  pages,
  starts,
  documentStart,
) {
  try {
    const baseline = numberSectionPages(pages, starts, documentStart);
    if (
      !Array.isArray(controls) ||
      !Array.isArray(paragraphs) ||
      !Array.isArray(rows) ||
      controls.some(
        (c) => !c || !Number.isInteger(c.section) || c.section < 0 || c.section >= starts.length,
      )
    )
      throw new Error("InvalidSectionPageNumbering");
    const planned = [];
    for (const source of starts) {
      const selected = baseline.filter((p) => p.section === source.section);
      const ordinalMap = new Map(selected.map((page, index) => [page.ordinal, index]));
      const localRows = rows
        .filter((r) => r.section === source.section)
        .map((r) => ({ ...r, pageOrdinal: ordinalMap.get(r.pageOrdinal) }));
      const localPages = selected.map((page, ordinal) => ({ ...page, ordinal }));
      const start =
        source.section > 0 && source.start === 0 ? planned.at(-1).number + 1 : selected[0].number;
      const result = planHwp5PageControls(
        controls.filter((c) => c.section === source.section),
        paragraphs,
        localRows,
        localPages,
        start,
        source.section,
      );
      if (result.state !== "planned") return result;
      planned.push(
        ...result.pages.map((page, index) => ({ ...page, ordinal: selected[index].ordinal })),
      );
    }
    return { state: "planned", pages: planned };
  } catch (error) {
    return { state: "unavailable", error: error.message };
  }
}
