// Bitmap availability and placement eligibility are not successful Canvas paints.
export function pictureCoverageText(coverage) {
  if (coverage === null || coverage === undefined) return "";
  const keys = ["total", "eligible", "pending", "decoded", "failed", "loading"];
  if (typeof coverage !== "object" || !keys.every(key => Object.hasOwn(coverage, key) && Number.isSafeInteger(coverage[key]) && coverage[key] >= 0)
    || coverage.eligible > coverage.total || coverage.pending !== coverage.total - coverage.eligible
    || coverage.decoded + coverage.failed + coverage.loading !== coverage.eligible) return "그림 상태 미확인";
  if (coverage.total === 0) return "";
  return `그림 배치 후보 ${coverage.eligible}/${coverage.total} · 해독 ${coverage.decoded}개 · 실패 ${coverage.failed}개 · 대기 ${coverage.loading}개${coverage.pending ? ` · 배치 미지원 ${coverage.pending}개` : ""}`;
}
