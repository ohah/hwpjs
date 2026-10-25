import { planCellPageCuts } from "./table-cell-page-cuts.mjs";

// 공통 셀 분할 계산을 구간 수 예산과 측정 결과 계약에 연결합니다.
export function cellContentPageSlices(height, intervals, pageHeight, { maxSlices = 2000, maxIntervals = 100000 } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (![height, pageHeight].every(value => Number.isFinite(value) && value > 0)
    || !Array.isArray(intervals) || !Number.isSafeInteger(maxSlices) || maxSlices < 1
    || !Number.isSafeInteger(maxIntervals) || maxIntervals < 1) return unavailable("InvalidCellPageSlices");
  if (intervals.length > maxIntervals) return unavailable("CellPageSliceLimit");
  const result = planCellPageCuts(height, intervals, pageHeight, { maxPages: maxSlices });
  if (result.state === "planned") return { state: "prepared", slices: result.fragments };
  const errors = { InvalidTableCellCuts: "InvalidCellPageSlices", TableCellLineTooTall: "IndivisibleCellPageContent", TableCellPageLimit: "CellPageSliceLimit" };
  return unavailable(errors[result.error] ?? result.error);
}
