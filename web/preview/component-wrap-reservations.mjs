import { objectCollisionBox } from "./object-collision-box.mjs";
import { restrictDrawingPlacement } from "./drawing-restricted-placement.mjs";

// Geometry only. The caller proves representation ownership before this solver.
export function resolveComponentWrapReservations(
  components,
  paragraphs,
  body,
  inventory,
  project,
  kind,
) {
  const fail = (error) => ({ state: "unavailable", error });
  if (
    !Array.isArray(components) ||
    inventory?.state !== "collected" ||
    !Array.isArray(inventory.footprints)
  )
    return fail("IncompleteOleCollisionInventory");
  const prepared = [],
    keys = new Set(),
    anchors = new Set();
  for (const component of components) {
    if (!component || typeof component !== "object") return fail("InvalidOlePageAnchor");
    const key = `${component.section}:${component.node}`;
    if (keys.has(key)) return fail("AmbiguousOleWrapIdentity");
    keys.add(key);
    const anchor = `${component.section}:${component.paragraph}:${component.anchorUnit}`;
    if (anchors.has(anchor)) return fail("AmbiguousOleWrapAnchor");
    anchors.add(anchor);
    const flow = component.source?.flow,
      flags = component.source?.position?.flags;
    if (
      ![0, 1].includes(flow?.text_wrap) ||
      ![0, 1, 2, 3].includes(flow?.text_flow) ||
      !Array.isArray(flags) ||
      typeof flags[1] !== "boolean" ||
      typeof flags[2] !== "boolean" ||
      (flags[1] && component.source.position.relations?.[0] !== 2)
    )
      return fail("UnsupportedOleWrapPolicy");
    const placed = project(component, paragraphs, body);
    if (placed.state !== "placed") return placed;
    const footprint = objectCollisionBox(placed.rectangle, flow.outside_margins);
    if (!footprint) return fail("InvalidOleCollisionMargins");
    prepared.push({ component, placed, footprint });
  }
  if (
    inventory.footprints.some(
      (item) => item?.kind === kind || keys.has(`${item?.section}:${item?.node}`),
    )
  )
    return fail("AmbiguousOleCollisionInventory");
  for (const item of prepared) {
    const occupied = [
      ...inventory.footprints,
      ...prepared
        .filter((other) => other !== item)
        .map((other) => ({
          section: other.component.section,
          pageOrdinal: other.placed.pageOrdinal,
          rectangle: other.footprint,
        })),
    ];
    const flags = item.component.source.position.flags;
    const restricted = restrictDrawingPlacement(
      item.footprint,
      item.placed.referenceBoxes.page,
      occupied,
      {
        section: item.component.section,
        pageOrdinal: item.placed.pageOrdinal,
        restrictToBody: flags[1],
        allowOverlap: flags[2],
      },
    );
    if (restricted.state !== "placed") return restricted;
    const shift = restricted.rectangle.y - item.footprint.y;
    item.footprint = restricted.rectangle;
    item.placed = {
      ...item.placed,
      rectangle: { ...item.placed.rectangle, y: item.placed.rectangle.y + shift },
    };
  }
  return {
    state: "reserved",
    reservations: prepared.map(({ component, placed, footprint }) => ({
      section: component.section,
      node: component.node,
      pageOrdinal: placed.pageOrdinal,
      rectangle: placed.rectangle,
      collisionFootprint: footprint,
      paintable: false,
      flow: {
        textWrap: component.source.flow.text_wrap,
        textFlow: component.source.flow.text_flow,
        outsideMargins: component.source.flow.outside_margins,
      },
    })),
  };
}
