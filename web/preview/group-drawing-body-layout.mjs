import { layoutDrawingBodyContent } from "./drawing-body-content-layout.mjs";

// The outer compositor owns standalone drawings; the inner group keeps its children.
export function layoutGroupDrawingBody(content, measure, maxRows, layoutBody) {
  const active = (content.drawings ?? []).filter((d) => d.source?.group_context === null);
  const retainedDrawings = (content.drawings ?? []).filter((d) => d.source?.group_context !== null);
  const retainedContainers = (content.containers ?? []).filter(
    (c) => c.source?.group_context === null && c.source.geometry?.treat_as_character === true,
  );
  if (!active.length) return { state: "unavailable", error: "MissingStandaloneGroupDrawings" };
  return layoutDrawingBodyContent({ ...content, drawings: active }, measure, maxRows, layoutBody, {
    retainedDrawings,
    retainedContainers,
  });
}
