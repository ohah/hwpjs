import { isFootnoteColumnReservation } from "./footnote-column-reservation.mjs";

export function cellCutBodyOptionsError(options) {
  return options.columnZones ||
    options.columnDeclaration !== undefined ||
    options.measureRow !== undefined ||
    options.rowY !== undefined ||
    (options.columnBottom !== undefined && !isFootnoteColumnReservation(options.columnBottom))
    ? "custom-body-flow"
    : null;
}
