import { layoutDrawingWrapBody } from "./drawing-wrap-body-flow.mjs";
import { resolveOleWrapReservations } from "./ole-wrap-reservations.mjs";

/** Reuse the bounded floating-wrap solver; document objects retain OLE identity. */
export function layoutOleWrapBody(oles, paragraphs, layoutBody, { collisionInventory, measure, maxIterations = 32 } = {}) {
  const fail = error => ({ state: "unavailable", error });
  if (!Array.isArray(oles) || oles.some(ole => !ole || typeof ole !== "object")
    || typeof layoutBody !== "function" || typeof collisionInventory !== "function") return fail("InvalidOleWrapCallbacks");
  if (oles.some(ole => ![0, 1].includes(ole.source?.flow?.text_wrap))) return fail("UnsupportedOleWrapPolicy");
  // Solver adapters are not inserted into the document's drawing inventory.
  const anchors = oles.map(ole => ({ section: ole.section, drawingNode: ole.oleNode,
    hostParagraph: ole.paragraph, anchorUnit: ole.anchorUnit, source: ole.source }));
  const selectedBody = options => {
    const result = layoutBody(options);
    // Independent nested wrap solvers cannot claim a joint fixed point.
    return result?.drawingWrapReservations?.length || result?.oleWrapReservations?.length
      ? fail("UnsupportedNestedOleWrapFlow") : result;
  };
  const result = layoutDrawingWrapBody(anchors, paragraphs, selectedBody, {
    maxIterations, measure,
    resolveReservations(body) {
      const resolved = resolveOleWrapReservations(oles, paragraphs, body, collisionInventory(body));
      if (resolved.state !== "reserved") return resolved;
      return { ...resolved, reservations: resolved.reservations.map(item => ({ ...item, drawingNode: item.oleNode })) };
    },
  });
  if (!result || !Array.isArray(result.drawingWrapReservations)) return result;
  const { drawingWrapReservations, drawingWrapIterations, ...body } = result;
  return { ...body, oleWrapIterations: drawingWrapIterations,
    oleWrapReservations: drawingWrapReservations.map(({ drawingNode, ...item }) => item) };
}
