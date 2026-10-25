// 소유 목록 안의 다단 시작과 강제 쪽/단 나눔을 구분합니다.
export function validateHwp5OwnedColumnBreak(flags, declaration, host, { allowCellPageBreak = false } = {}) {
  const names = host === "drawing" ? ["UnsupportedHwp5DrawingBreak", "MissingHwp5DrawingColumnDeclaration"]
    : host === "table_cell" ? ["UnsupportedHwp5CellBreak", "MissingHwp5CellColumnDeclaration"] : null;
  if (!names) throw new Error("InvalidHwp5OwnedColumnHost");
  if (typeof allowCellPageBreak !== "boolean" || allowCellPageBreak && host !== "table_cell") throw new Error("InvalidHwp5OwnedColumnHost");
  if (!Number.isInteger(flags) || flags < 0 || flags > 255 || (flags & ~(allowCellPageBreak ? 6 : 2)) !== 0) throw new Error(names[0]);
  if ((flags & 2) !== 0 && !declaration) throw new Error(names[1]);
}
