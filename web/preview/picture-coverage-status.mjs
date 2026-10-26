// Bitmap availability and placement eligibility are not successful Canvas paints.
export function pictureCoverageText(coverage) {
  if (coverage === null || coverage === undefined) return "";
  const keys = ["total", "eligible", "pending", "decoded", "failed", "loading"];
  if (
    typeof coverage !== "object" ||
    !keys.every(
      (key) =>
        Object.hasOwn(coverage, key) && Number.isSafeInteger(coverage[key]) && coverage[key] >= 0,
    ) ||
    coverage.eligible > coverage.total ||
    coverage.pending !== coverage.total - coverage.eligible ||
    coverage.decoded + coverage.failed + coverage.loading !== coverage.eligible
  )
    return "그림 상태 미확인";
  const failures = coverage.failures;
  if (
    failures !== undefined &&
    (!Array.isArray(failures) ||
      failures.length !== coverage.failed ||
      failures.some(
        (f) =>
          !f ||
          ![f.section, f.pictureNode].every(
            (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff,
          ) ||
          typeof f.error !== "string" ||
          !f.error.length ||
          f.error.length > 160,
      ))
  )
    return "그림 상태 미확인";
  if (coverage.total === 0) return "";
  const details = failures
    ?.slice(0, 3)
    .map(
      (f) =>
        `${f.section}:${f.pictureNode} ${f.error === "MissingPictureImage" ? "이미지 연결 없음" : f.error}`,
    )
    .join("; ");
  return `그림 배치 후보 ${coverage.eligible}/${coverage.total} · 해독 ${coverage.decoded}개 · 실패 ${coverage.failed}개 · 대기 ${coverage.loading}개${coverage.pending ? ` · 배치 미지원 ${coverage.pending}개` : ""}${details ? ` · 원인 ${details}${failures.length > 3 ? ` 외 ${failures.length - 3}개` : ""}` : ""}`;
}
