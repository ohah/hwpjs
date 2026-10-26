import { validateSectionTabs } from "../../js/hwpx-section-tabs.mjs";
import { xmlSigned32 } from "../../js/xml-integer-text.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

/** Only a unique selected body declaration can supply the default grid interval. */
export function resolveSectionTabInterval(rows, section) {
  const unavailable = (error) => ({ state: "unavailable", error });
  if (!Number.isInteger(section) || section < 0 || section > 0xffffffff)
    return unavailable("InvalidTabSection");
  try {
    validateSectionTabs(rows);
  } catch {
    return unavailable("InvalidSectionTabSources");
  }
  const declarations = rows.filter(
    (row) => row.section === section && Number.isInteger(row.body_owner),
  );
  if (declarations.length !== 1)
    return unavailable(
      declarations.length ? "AmbiguousSectionTabDefinition" : "MissingSectionTabOwner",
    );
  const row = declarations[0],
    legacy = row.tab_stop === null ? null : xmlSigned32(row.tab_stop);
  if (row.tab_stop !== null && legacy === null) return unavailable("InvalidSectionTabInterval");
  if (row.tab_stop_val !== null || row.tab_stop_unit !== null) {
    if (row.tab_stop_val === null || row.tab_stop_unit === null)
      return unavailable("IncompleteSectionTabInterval");
    const value = xmlSigned32(row.tab_stop_val);
    if (value === null || value <= 0) return unavailable("InvalidSectionTabInterval");
    const unit = row.tab_stop_unit.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
    if (unit !== "HWPUNIT") return unavailable("UnsupportedSectionTabUnit");
    return {
      state: "resolved",
      section,
      node: row.node,
      bodyOwner: row.body_owner,
      pixels: hwpUnitPixels(value),
      basis: "tabStopVal",
      legacyMismatch: legacy !== null && legacy / 2 !== value,
    };
  }
  if (legacy === null) return unavailable("MissingSectionTabInterval");
  if (legacy <= 0) return unavailable("InvalidSectionTabInterval");
  return {
    state: "resolved",
    section,
    node: row.node,
    bodyOwner: row.body_owner,
    pixels: hwpUnitPixels(legacy) / 2,
    basis: "tabStop",
    legacyMismatch: false,
  };
}
