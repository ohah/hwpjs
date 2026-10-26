// 경고 전달과 부분 표시 상태를 한곳에서 결정합니다. 원문 상태는 변경하지 않습니다.
export function curveLayoutDiagnostics(layout, warnings) {
  return {
    warnings: [...(layout.warnings ?? []), ...warnings],
    ...(warnings.length
      ? {
          objectCoverage: 'incomplete',
          unrenderedObjects: [
            ...(layout.unrenderedObjects ?? []),
            ...warnings.map((w) => ({ ...w, error: w.code })),
          ],
        }
      : {}),
  };
}
