/** User-visible projection of the current frame, never a document support cache. */
export function updateChartPreviewStatus(node, coverage) {
  if (!node) return;
  const status = chartPreviewStatus(coverage);
  node.hidden = status.hidden;
  node.textContent = status.text;
}

export function chartPreviewStatus(coverage) {
  if (!coverage?.total) return { hidden: true, text: "" };
  const abbreviated = coverage.annotations?.reduce((sum, row) => sum + row.categoryOmitted + row.legendOmitted + row.shortened, 0) ?? 0;
  const titleCount = coverage.annotations?.reduce((sum, row) => sum + (row.titlePainted ?? 0), 0) ?? 0;
  const count = code => (coverage.warnings ?? []).filter(row => row.codes.includes(code)).length;
  const policies = [
    ["PreviewPlainChartTitle", "제목 텍스트 초안·원본 서식 미적용"], ["PreviewChartTitleShortened", "긴 제목 표시 축약"],
    ["SourceChartTitleMetadataUnavailable", "제목 원본 역할 정보 없음"], ["SourceChartTitleTextIncomplete", "제목 줄바꿈·필드 등 미적용"], ["SourceChartTitleAmbiguous", "제목 원본 연결 모호"],
    ["SourceOfPieFirstSeries", "복합 원형 첫 계열 표시·나머지 보존"],
    ["OfficePieFirstSeries", "Office 원형 첫 계열 표시·나머지 보존"],
    ["PreviewDefaultBlankPolicy", "빈 값 정책 부재: gap 초안"],
    ["PreviewPie3DEllipse", "3D 원형 타원 초안"], ["PreviewPie3DThickness", "3D 원형 두께 초안"], ["PreviewPie3DWallOrder", "3D 원형 측벽 순서 초안"],
    ["PreviewRightAngleShear", "3D 직각축 시어 초안"], ["PreviewNormalized3DDepth", "정규화 깊이 초안"],
    ["Preview3DFaceOrder", "3D 면 정렬 초안"], ["Preview3DAxesOmitted", "3D 축 생략"],
    ["PreviewUniformCatmullRom", "균등 곡선 보간 초안"], ["PreviewClampedCurveEndpoints", "곡선 끝점 중복 정책"],
    ["PreviewStockEndpoints", "주식형 고저선·첫/끝 시리즈 초안"], ["PreviewDefaultStockGap", "기본 주식형 간격"],
    ["SourceStockSeriesLinesNotApplied", "주식형 선 원값 ABI 부재: 계열 선 미적용"],
    ["PreviewStockGapBlanks", "주식형 결측값은 비워 표시"],
    ["PreviewOfPieFit", "복합 원형 배치 초안"], ["PreviewAutoSplitLastTwo", "보조 항목 마지막 2개 선택 초안"],
    ["PreviewPositionTailSplit", "원본 순서 뒤쪽 항목 선택 초안"], ["PreviewCombinedCategory", "가상 묶음 범례"],
    ["SourceChartConnectorsNotApplied", "원본 연결선 미적용"], ["SourceChartGapNotApplied", "원본 복합 차트 간격 미적용"],
    ["PreviewPieFit", "원형 크기 맞춤 초안"], ["SourcePieDataLabelsNotApplied", "원형 데이터 라벨 미적용"], ["SourcePointOverridesNotApplied", "개별 포인트 설정 미적용"],
    ["PreviewDefaultPieAngle", "기본 원형 시작 각도"], ["PreviewDefaultPieExplosion", "기본 원형 분리값"],
    ["PreviewStraightLines", "직선 꺾은선"], ["PreviewGapBlanks", "결측 구간 분리"],
    ["SourceMarkersNotApplied", "원본 표식 미적용"], ["PreviewAlgebraicStacks", "부호 포함 누적 초안"],
    ["PreviewAbsolutePercentTotal", "절댓값 분모 백분율 초안"], ["DefaultGapWidth", "기본 막대 간격"],
    ["PreviewDefaultOverlap", "기본 겹침 초안"],
    ["PreviewScatterMarkerDots", "산점도 기본 원형 표식"], ["PreviewScatterGapBlanks", "산점도 결측 구간 분리"],
    ["PreviewAutoMarkerSymbol", "자동 표식 모양 초안"], ["PreviewDefaultMarkerSize", "기본 표식 크기 초안"], ["PreviewMarkerGeometry", "기본 표식 도형 초안"],
  ].flatMap(([code, label]) => { const n = count(code); return n ? [`${label} ${n}개`] : []; });
  const emptyCount = count("PreviewEmptyCircularSeries");
  if (emptyCount) policies.push(`숫자 없는 표시 계열 안내 ${emptyCount}개`);
  const placement = coverage.sourcePagePlacement === true
    ? "원본 개체 크기·어울림을 반영한 측정 페이지입니다. 차트 내부 색·눈금·범례는 미리보기이며 한글 조판과의 동일성은 보장하지 않습니다."
    : "기본 색·눈금·범례 배치의 겹침 미리보기이며 원본 줄 흐름·서식·조판은 아직 적용하지 않았습니다.";
  return { hidden: false, text: `차트 초안 · 현재 화면 ${coverage.drawn}개 · 제목 텍스트 ${titleCount}개 · 원본 간격/겹침 ${coverage.sourceSpacing ?? 0}개 · 조회 대기 ${coverage.pending}개 · 미지원 ${coverage.unavailable.length}개 · 라벨 생략/축약 ${abbreviated}개. ${placement}${policies.length ? " 표시 정책: " + policies.join(" · ") + "." : ""}` };
}
