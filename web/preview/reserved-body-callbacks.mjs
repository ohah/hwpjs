import { measureReservedBodyRow } from "./reserved-body-row.mjs";

/** One request's row advancement and remeasurement share the same reservations. */
export function createReservedBodyCallbacks(reservations, measure, { rowY, maxIterations = 32 } = {}) {
  if (!Array.isArray(reservations) || typeof measure !== "function" || rowY !== undefined && typeof rowY !== "function"
    || !Number.isSafeInteger(maxIterations) || maxIterations < 1 || maxIterations > 1000)
    return { state: "unavailable", error: "InvalidReservedBodyCallbacks" };
  let failure;
  return { state: "ready", failure: () => failure,
    rowY(row, context) {
      let y = rowY?.(row, context) ?? context.y;
      if (!Number.isFinite(y) || y < context.y) { failure = "InvalidReservedPictureAdvance"; return NaN; }
      if (!row.paragraphSource) return y;
      for (let attempt = 0; attempt < maxIterations; attempt++) {
        const measured = measureReservedBodyRow(row, { ...context, y }, reservations, measure);
        if (measured.state !== "measured") { failure = measured.error; return NaN; }
        const next = rowY?.(row, { ...context, y: measured.y }) ?? measured.y;
        if (!Number.isFinite(next) || next < measured.y) { failure = "InvalidReservedPictureAdvance"; return NaN; }
        if (next === measured.y) return next;
        y = next;
      }
      failure = "ReservedPictureAdvanceLimit"; return NaN;
    },
    measurePositionedRow(source, row, context) {
      if (!source.paragraphSource) return row;
      const measured = measureReservedBodyRow(source, context, reservations, measure);
      if (measured.state !== "measured" || measured.y !== context.y) {
        failure = measured.error ?? "UnresolvedReservedPictureAdvance"; return null;
      }
      return measured.row;
    },
  };
}
