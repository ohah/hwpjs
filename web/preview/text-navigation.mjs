import { rowTop, TEXT_TOP } from "./row-geometry.mjs";
import { caretGeometry, hitText, sameParagraph, selectableText } from "./text-geometry.mjs";
import { graphemeUnits, wordBoundary } from "./text-input.mjs";
import { affinePoint } from "./affine-point-geometry.mjs";

/** 문단 경계 후보만 계산한다. 소유권 검사는 호출자가 수행한다. */
export function adjacentParagraphBoundary(layout, focus, key) {
  if (!focus || !["ArrowLeft", "ArrowRight"].includes(key)) return null;
  const paragraph = focus.paragraph + (key === "ArrowLeft" ? -1 : 1);
  if (!Number.isSafeInteger(paragraph) || paragraph < 0) return null;
  const rows = layout.rows.filter(
    (row) =>
      row.section === focus.section &&
      row.paragraph === paragraph &&
      selectableText(row) &&
      (!focus.pageArea ||
        (row.pageArea === focus.pageArea && row.pageOrdinal === focus.pageOrdinal)),
  );
  if (!rows.length) return null;
  const row = key === "ArrowLeft" ? rows.at(-1) : rows[0];
  return {
    ...focus,
    paragraph,
    unit: key === "ArrowLeft" ? row.endUnit : row.startUnit,
    affinity: key === "ArrowLeft" ? "backward" : "forward",
  };
}

/** 기본 이동은 문단 내부다. 문단 간 후보의 소유권은 호출자가 검사한다. */
export function navigateText(
  layout,
  text,
  anchor,
  focus,
  key,
  {
    extend = false,
    paragraphEdge = false,
    crossParagraph = false,
    preferredX = null,
    word = false,
    acceptRow = null,
  } = {},
) {
  if (
    !focus ||
    !anchor ||
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key)
  )
    return null;
  let unit = focus.unit,
    affinity = "forward",
    nextX = null;
  if (key === "ArrowLeft" || key === "ArrowRight") {
    if (!extend && anchor.unit !== focus.unit)
      unit =
        key === "ArrowLeft" ? Math.min(anchor.unit, focus.unit) : Math.max(anchor.unit, focus.unit);
    else if (word) unit = wordBoundary(text, unit, key === "ArrowRight");
    else {
      const bounds = graphemeUnits(text);
      unit =
        key === "ArrowLeft"
          ? (bounds.filter((b) => b < unit).at(-1) ?? 0)
          : (bounds.find((b) => b > unit) ?? text.length);
    }
  } else {
    const caret = caretGeometry(layout, focus),
      row = caret && layout.rows[caret.row];
    if (!row) return null;
    if (key === "Home" || key === "End") {
      unit = paragraphEdge
        ? key === "Home"
          ? 0
          : text.length
        : key === "Home"
          ? row.startUnit
          : row.endUnit;
      affinity = key === "End" ? "backward" : "forward";
    } else {
      const direction = key === "ArrowUp" ? -1 : 1;
      nextX = Number.isFinite(preferredX) ? preferredX : (caret.paintGeometry ?? caret).x;
      const currentY = rowTop(row, caret.row);
      const candidates = layout.rows.flatMap((candidate, index) => {
        const delta = (rowTop(candidate, index) - currentY) * direction;
        const allowed =
          crossParagraph && extend
            ? candidate.section === focus.section
            : sameParagraph(candidate, focus);
        const instance =
          !focus.pageArea ||
          (candidate.pageArea === focus.pageArea && candidate.pageOrdinal === focus.pageOrdinal);
        const sameFrame =
          (row.transform === undefined && candidate.transform === undefined) ||
          (Array.isArray(row.transform) &&
            Array.isArray(candidate.transform) &&
            row.transform.length === 6 &&
            candidate.transform.length === 6 &&
            row.transform.every((value, i) => value === candidate.transform[i]));
        return selectableText(candidate) && allowed && instance && sameFrame && delta > 0
          ? [{ index, delta }]
          : [];
      });
      const adjacent = candidates.reduce(
        (best, candidate) =>
          (!best || candidate.delta < best.delta) &&
          (acceptRow === null || acceptRow(layout.rows[candidate.index]))
            ? candidate
            : best,
        null,
      );
      const destination = adjacent && layout.rows[adjacent.index];
      const local = adjacent && [nextX, rowTop(destination, adjacent.index) + TEXT_TOP];
      const screen =
        local &&
        (destination.transform === undefined ? local : affinePoint(destination.transform, local));
      const next = screen && hitText(layout, screen[0], screen[1], destination);
      if (next && !sameParagraph(next, focus)) return { anchor, focus: next, preferredX: nextX };
      if (next) {
        unit = next.unit;
        affinity = next.affinity;
      }
    }
  }
  const next = { ...focus, unit, affinity };
  return { anchor: extend ? anchor : next, focus: next, preferredX: nextX };
}
