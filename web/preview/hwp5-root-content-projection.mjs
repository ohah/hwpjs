import { projectHwp5RectangleContent } from "./hwp5-rectangle-content-projection.mjs";
import { projectHwp5GroupContent } from "./hwp5-group-content-projection.mjs";
import { projectHwp5MixedRootContent } from "./hwp5-mixed-root-content-projection.mjs";
import { projectHwp5GroupedMixedContent } from "./hwp5-grouped-mixed-content.mjs";

// Worker and page layout share root selection, not separate format guesses.
export function projectHwp5RootContent(content) {
  const roots = content.hwp5Drawings ?? [];
  if (!roots.length) return content.currentParagraphFlows?.some(row => row.host === "drawing")
    ? { state: "unavailable", error: "IncompleteHwp5RootSources" } : { state: "projected", content };
  const lines = roots.filter(row => row.source?.kind_id === 0x246c696e);
  const nonLines = roots.filter(row => row.source?.kind_id !== 0x246c696e);
  if (lines.length && nonLines.length && roots.every(row => [0x246c696e, 0x24636f6e, 0x24726563, 0x24706963, 0x24706f6c].includes(row.source?.kind_id))) {
    if ((content.hwp5DrawingBodies ?? []).some(body => lines.some(line => line.section === body.section && line.controlNode === body.controlNode))) return { state: "unavailable", error: "UnsupportedHwp5LineTextRoot" };
    const projected = projectHwp5RootContent({ ...content, hwp5Drawings: nonLines });
    return projected.state === "projected" ? { ...projected, content: { ...projected.content, hwp5Drawings: roots } } : projected;
  }
  if (roots.some(row => row.source?.kind_id === 0x24636f6e)
    && roots.some(row => [0x24726563, 0x24706963, 0x24706f6c].includes(row.source?.kind_id))
    && roots.every(row => [0x24636f6e, 0x24726563, 0x24706963, 0x24706f6c].includes(row.source?.kind_id))) return projectHwp5GroupedMixedContent(content);
  if (roots.every(row => row.source?.kind_id === 0x24726563)) return projectHwp5RectangleContent(content);
  if (roots.every(row => row.source?.kind_id === 0x24636f6e)) return projectHwp5GroupContent(content);
  if (roots.every(row => [0x24726563, 0x24706963].includes(row.source?.kind_id))) return projectHwp5MixedRootContent(content);
  return { state: content.currentParagraphFlows?.some(row => row.host === "drawing") ? "unavailable" : "unhandled",
    error: "UnsupportedHwp5RectangleRoot" };
}
