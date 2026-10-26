import { measureReservedBodyRow } from "./reserved-body-row.mjs";

/** One request's row advancement and remeasurement share the same reservations. */
export function createReservedBodyCallbacks(
  reservations,
  measure,
  { rowY, maxIterations = 32 } = {},
) {
  if (
    !Array.isArray(reservations) ||
    typeof measure !== "function" ||
    (rowY !== undefined && typeof rowY !== "function") ||
    !Number.isSafeInteger(maxIterations) ||
    maxIterations < 1 ||
    maxIterations > 1000
  )
    return { state: "unavailable", error: "InvalidReservedBodyCallbacks" };
  let failure, diagnostic;
  const record = (error, row, context, stage, measuredY) => {
    failure = error;
    diagnostic = { layoutStage: stage };
    for (const key of ["section", "paragraph", "startUnit"])
      if (Number.isSafeInteger(row?.[key]) && row[key] >= 0) diagnostic[key] = row[key];
    for (const key of ["pageOrdinal", "columnOrdinal"])
      if (Number.isSafeInteger(context?.[key]) && context[key] >= 0) diagnostic[key] = context[key];
    if (Number.isFinite(context?.y)) diagnostic.expectedY = context.y;
    if (Number.isFinite(measuredY)) diagnostic.measuredY = measuredY;
  };
  return {
    state: "ready",
    failure: () => failure,
    diagnostic: () => (diagnostic ? { ...diagnostic } : undefined),
    rowY(row, context) {
      let y = rowY?.(row, context) ?? context.y;
      if (!Number.isFinite(y) || y < context.y) {
        record("InvalidReservedPictureAdvance", row, context, "reserved-row-origin", y);
        return NaN;
      }
      if (!row.paragraphSource) return y;
      for (let attempt = 0; attempt < maxIterations; attempt++) {
        const measured = measureReservedBodyRow(row, { ...context, y }, reservations, measure);
        if (measured.state !== "measured") {
          record(measured.error, row, context, "reserved-row-advance");
          return NaN;
        }
        const next = rowY?.(row, { ...context, y: measured.y }) ?? measured.y;
        if (!Number.isFinite(next) || next < measured.y) {
          record("InvalidReservedPictureAdvance", row, context, "reserved-row-advance", next);
          return NaN;
        }
        if (next === measured.y) return next;
        y = next;
      }
      record("ReservedPictureAdvanceLimit", row, context, "reserved-row-advance", y);
      return NaN;
    },
    measurePositionedRow(source, row, context) {
      if (!source.paragraphSource) return row;
      const measured = measureReservedBodyRow(source, context, reservations, measure);
      if (measured.state !== "measured" || measured.y !== context.y) {
        record(
          measured.error ?? "UnresolvedReservedPictureAdvance",
          source,
          context,
          "reserved-row-remeasure",
          measured.y,
        );
        return null;
      }
      return measured.row;
    },
  };
}
