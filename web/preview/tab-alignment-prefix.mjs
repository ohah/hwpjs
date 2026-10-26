import { validateTabSources } from "../../js/hwpx-tab-sources.mjs";
import { resolveTabDefinition } from "./tab-definition-geometry.mjs";

/** A measured LEFT tab fixes the prefix; distribution may only affect its suffix. */
export function tabAlignmentPrefix(row, paragraph, parts) {
  const fail = () => ({ state: "unavailable" });
  if (
    !paragraph ||
    typeof paragraph.text !== "string" ||
    paragraph.clipped ||
    (paragraph.textStartUnit ?? 0) !== 0 ||
    paragraph.section !== row.section ||
    paragraph.paragraph !== row.paragraph ||
    paragraph.text.slice(row.startUnit, row.endUnit) !== row.text ||
    (row.tabUnavailable && row.tabUnavailable !== "UnsupportedTabLeaderPaint")
  )
    return fail();
  try {
    validateTabSources({
      section: paragraph.section,
      paragraph: paragraph.paragraph + 1,
      rows: paragraph.tabSources,
    });
  } catch {
    return fail();
  }
  const definition = resolveTabDefinition(paragraph.tabDefinition, paragraph.tabDefinitionId);
  if (definition.state !== "resolved") return fail();
  const indices = parts.flatMap((part, index) => (part === "\t" ? [index] : [])),
    placements = row.tabPlacements;
  if (!indices.length || !Array.isArray(placements) || placements.length !== indices.length)
    return fail();
  for (let index = 0; index < indices.length; index++) {
    const span = indices[index],
      start = row.boundaries[span],
      end = row.boundaries[span + 1],
      tab = placements[index];
    if (
      !tab ||
      tab.state !== "placed" ||
      tab.unit !== start.unit ||
      end.unit !== start.unit + 1 ||
      !paragraph.tabSources.some((source) => source.unit === tab.unit) ||
      !Number.isFinite(tab.x) ||
      !Number.isFinite(tab.width) ||
      tab.width < 0 ||
      tab.advance !== tab.width ||
      !Number.isFinite(tab.position) ||
      !Number.isFinite(tab.start) ||
      tab.x !== start.x ||
      tab.x + tab.width !== end.x ||
      !["LEFT", "RIGHT", "CENTER", "DECIMAL"].includes(tab.type)
    )
      return fail();
    if (tab.source === "declared") {
      const stop = definition.stops[tab.index];
      if (
        !Number.isInteger(tab.index) ||
        tab.index < 0 ||
        !stop ||
        stop.type !== tab.type ||
        stop.position !== tab.position ||
        stop.leader !== tab.leader
      )
        return fail();
    } else if (tab.source === "default") {
      if (tab.type !== "LEFT" || paragraph.sectionTabInterval?.state !== "resolved") return fail();
    } else if (tab.source === "auto-left") {
      if (tab.type !== "LEFT" || !definition.autoLeft) return fail();
    } else if (tab.source === "auto-right") {
      if (tab.type !== "RIGHT" || !definition.autoRight) return fail();
    } else return fail();
  }
  if (placements.at(-1).type !== "LEFT") return fail();
  return { state: "bound", boundary: indices.at(-1) + 1 };
}
