# HWPX 차트 레이아웃 지원 경계

현재 HEAD19805218의 source 기준이며 새 런타임 전수 감사가 아닙니다. `chart_plot_kind`의 16종 파싱과 `chart-preview-primitives`의 8종 제한된 preview dispatch를 분리합니다.

| 축 | 현재 소스 근거 | 구현과 미완료 |
|---|---|---|
| 타입 | chart_plot_kind.zig / chart-preview-primitives.mjs | 16종 원값 enum. bar/line/scatter/pie/ofPie/stock 및 제한 bar3D/pie3D preview 경로. combo/그 밖 종류·각종3D 조건은 명시 거부; 16종 정밀 조판 완료 아님 |
| 축 | chart_axis_values / chart_axis_scaling / chart-value-scale | ID·cross 링크·위치·삭제·스케일 읽기, 기본 눈금 preview. majorTickMark 원값→선 연결은 이번 후보. major/minor unit·교차좌표·숫자 서식·minor tick/원본 tick skip 미완 |
| 범례 | chart-preview-legend-layout / preview-text-layout | 현재 계열명과 제한된 preview 줄 배치. 원본 legend 위치·overlay·서체·정밀 wrap 미반영 |
| 데이터 레이블 | chart_display_snapshot / preview annotations | 값·이름 조회와 텍스트 데이터는 있으나 원본 dLbls 위치/형식·leader lines의 일반 레이아웃/paint 없음 |
| 좌표 | chart-bar-layout / chart-series-data / createChartValueScale | 제한 타입의 현재 숫자·간격·반전·clip 좌표. 원본 전체 스타일·plot manualLayout·정밀 자동 축/글꼴은 미완 |
| 개체 배치 | chart-preview-layers / chart-anchor-geometry | 기존 host 크기·앵커와 명시 기준 영역 재사용, 불확실 owner/transform 거부. chart 내부 레이아웃의 완전 동치 아님 |
| 페이지 | chart-page-layout / chart-inline-page-reservations | 지원 owner/배치·reservation 조건하에 페이지/inline 연결. 모든 표셀·모든 대체 표현·전체 문서 조판 지원 아님 |
| 원본/unknown | chart_resource_values / chart_source_context | 표시 snapshot은 저장 SSOT가 아님. 원문/지원 편집은 Native 소유. unknown 보존과 parser/표시 지원은 별개; 전체 unknown 편집·저장 완료를 주장하지 않음 |

[주 눈금선 계약](hwpx-chart-major-ticks.md)의 변경은 2D 묶은 막대의 원본 명시 주 눈금 종류를 기존 preview 축에 반영하는 작은 구현입니다. 전체 차트 레이아웃, 웹한글기안기 동일 렌더링, 모든 타입 지원으로 확대하지 않습니다.

이 표는 HWPX OOXML chart 경로의 source 조사입니다. HWP5 차트의 같은 수준 파싱·표시 지원으로 승계하지 않습니다.
