import {usesDocumentFontMetrics} from "./font-layout-policy.mjs";
import {paragraphLineAdvance} from "./paragraph-geometry.mjs";
import {textMeasurement} from "./text-measurement.mjs";

// Reservation fixed-point seed, not a stored line height or a new spacing rule.
export function paragraphLineProbeHeight(shape,measure,unit,fallback){
  if(!usesDocumentFontMetrics(shape?.spacingFormat))return fallback;
  const font=textMeasurement(measure("",unit)).height;
  return Math.max(font,paragraphLineAdvance(shape,font,font));
}
