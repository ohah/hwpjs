// A transient reservation frame; original cell sizes, flows and row heights stay owned upstream.
export function frameMeasuredCellTable(measured, margins) {
  const fail = () => ({ state: "unavailable", error: "InvalidTableOuterInsets" });
  if (
    measured?.state !== "measured" ||
    !Array.isArray(measured.grid?.cells) ||
    !Number.isFinite(measured.grid.height) ||
    measured.grid.height <= 0 ||
    ![margins?.top, margins?.bottom].every((v) => Number.isFinite(v) && v >= 0)
  )
    return fail();
  const height = measured.grid.height + margins.top + margins.bottom;
  if (
    !Number.isFinite(height) ||
    height <= 0 ||
    measured.grid.cells.some((cell) => !cell || !Number.isFinite(cell.y + margins.top))
  )
    return fail();
  if (margins.top === 0 && margins.bottom === 0) return { state: "framed", measured };
  return {
    state: "framed",
    frameInsets: { top: margins.top, bottom: margins.bottom },
    measured: {
      ...measured,
      grid: {
        ...measured.grid,
        height,
        cells: measured.grid.cells.map((cell) => ({ ...cell, y: cell.y + margins.top })),
      },
    },
  };
}
