import { validateTabDefinitions } from "../../js/hwpx-tab-definitions.mjs";
import { xmlUnsigned32 } from "../../js/xml-integer-text.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
const trim = (value) =>
  typeof value === "string" ? value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "") : null;
const boolean = (value) =>
  ["1", "true"].includes(trim(value)) ? true : ["0", "false"].includes(trim(value)) ? false : null;

/** Shared source-to-pixel conversion for measurement and alignment provenance checks. */
export function resolveTabDefinition(definition, expectedId) {
  const fail = (error) => ({ state: "unavailable", error });
  try {
    validateTabDefinitions([definition]);
  } catch {
    return fail("MissingCurrentTabDefinition");
  }
  if (definition.id !== expectedId) return fail("MissingCurrentTabDefinition");
  const autoLeft = boolean(definition.auto_left),
    autoRight = boolean(definition.auto_right);
  if (autoLeft === null || autoRight === null) return fail("UnsupportedTabAutomaticFlags");
  const stops = [];
  for (const item of definition.items) {
    const value = xmlUnsigned32(item.pos),
      unitName = trim(item.unit ?? null);
    if (!Object.hasOwn(item, "unit") || value === null || ![null, "HWPUNIT"].includes(unitName))
      return fail("UnsupportedTabStopUnit");
    const type = trim(item.kind);
    if (!["LEFT", "RIGHT", "CENTER", "DECIMAL"].includes(type))
      return fail("UnsupportedTabStopType");
    stops.push({
      position: hwpUnitPixels(value) / (unitName === null ? 2 : 1),
      type,
      leader: trim(item.leader),
    });
  }
  return { state: "resolved", stops, autoLeft, autoRight };
}
