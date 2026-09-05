# 6. Shape 매핑 (개체 공통/표/그림/도형/OLE/수식/묶음)

## 6.1 개체 공통 속성 (ObjectCommon / AbstractShapeObjectType)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 객체 ID | CtrlId (4바이트 ASCII) | id (숫자) | 타입 변환 필요 |
| Z-Order | z_order (INT32) | zOrder | 직접 매핑 |
| 번호 범주 | 속성 bit 26-28 | numberingType | PICTURE/TABLE/EQUATION |
| 글자처럼 취급 | 속성 bit 0 | pos@treatAsChar | 직접 매핑 |
| 줄간격 영향 | (없음) | pos@affectLSpacing | HWPX only |
| 텍스트와 이동 | (없음) | pos@flowWithText | HWPX only |
| 겹침 허용 | 속성 bit 14 | pos@allowOverlap | 직접 매핑 |
| 앵커 고정 | (없음) | pos@holdAnchorAndSO | HWPX only |
| 수직 위치 기준 | 속성 bit 3-4 | pos@vertRelTo | PAPER/COLUMN/PARA |
| 수평 위치 기준 | 속성 bit 8-9 | pos@horzRelTo | PAPER/COLUMN/PARA |
| 수직 정렬 | 속성 bit 5-7 | pos@vertAlign | TOP/CENTER/BOTTOM |
| 수평 정렬 | 속성 bit 10-12 | pos@horzAlign | LEFT/CENTER/RIGHT |
| 수직 오프셋 | offset_y (SHWPUNIT) | pos@vertOffset | 직접 매핑 |
| 수평 오프셋 | offset_x (SHWPUNIT) | pos@horzOffset | 직접 매핑 |
| 폭 | width (HWPUNIT) | sz@width | 직접 매핑 |
| 높이 | height (HWPUNIT) | sz@height | 직접 매핑 |
| 폭 기준 | 속성 bit 15-17 | sz@widthRelTo | ABSOLUTE/PERCENT/RELATIVE |
| 높이 기준 | 속성 bit 18-19 | sz@heightRelTo | ABSOLUTE/PERCENT/RELATIVE |
| 크기 보호 | 속성 bit 20 | sz@protect | 직접 매핑 |
| 텍스트 흐름 | 속성 bit 21-23 | textWrap | SQUARE/TIGHT/THROUGH/... |
| 텍스트 면 | (속성에 포함) | textFlow | BOTH_SIDES/LEFT_ONLY/RIGHT_ONLY |
| 잠금 | (없음) | lock | HWPX only |
| 외곽 여백 (4방향) | margin HWPUNIT16[4] | outMargin (left/right/top/bottom) | 직접 매핑 |
| 인스턴스 ID | instance_id (UINT32) | instid | 직접 매핑 |
| 설명 | description (가변) | shapeComment | 직접 매핑 |
| 드롭캡 스타일 | (없음) | dropcapstyle | HWPX only |
| 메타태그 | (없음) | metaTag (JSON) | HWPX only |

## 6.2 도형 요소 추가 속성 (ShapeComponent / AbstractShapeComponentType)

AbstractShapeObjectType을 상속하며 추가:

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 오프셋 (x, y) | 그룹 내 좌표 | offset (x/y) | 직접 매핑 |
| 원본 크기 | (오프셋 내) | orgSz (width/height) | 직접 매핑 |
| 현재 크기 | (오프셋 내) | curSz (width/height) | 직접 매핑 |
| 수평 뒤집기 | flip 속성 | flip@horizontal | 직접 매핑 |
| 수직 뒤집기 | flip 속성 | flip@vertical | 직접 매핑 |
| 회전 각도 | 회전 정보 | rotationInfo@angle | 0-360 |
| 회전 중심 X | 회전 정보 | rotationInfo@centerX | HWPUNIT |
| 회전 중심 Y | 회전 정보 | rotationInfo@centerY | HWPUNIT |
| 이미지 회전 | (없음) | rotationInfo@rotateimage | HWPX only |
| 변환 행렬 | 렌더링 정보 | renderingInfo > transMatrix | 6개 float |
| 크기 행렬 | 렌더링 정보 | renderingInfo > scaMatrix | 6개 float |
| 회전 행렬 | 렌더링 정보 | renderingInfo > rotMatrix | 6개 float |
| 그룹 레벨 | groupLevel | groupLevel | 직접 매핑 |
| href | (없음) | href | HWPX only |

## 6.3 캡션 (Caption)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 캡션 방향 | 속성 | side | TOP/BOTTOM/LEFT/RIGHT |
| 전체 크기 사용 | 속성 | fullSz | 직접 매핑 |
| 캡션 폭 | HWPUNIT | width | 직접 매핑 |
| 캡션 간격 | HWPUNIT | gap | 직접 매핑 |
| 마지막 폭 | (없음) | lastWidth | HWPX only |
| 내용 | 문단 리스트 | subList > p[] | 직접 매핑 (재귀) |

## 6.4 선/테두리 정보 (LineShape)

| 필드 | HWP 5.0 (표 86) | HWPX | 비고 |
|------|------------------|------|------|
| 선 색상 | COLORREF | lineShape@color | 직접 매핑 |
| 선 굵기 | INT32 | lineShape@width | HWPUNIT |
| 선 종류 | UINT32 | lineShape@style | LineType1 |
| 끝 모양 | (속성에 포함) | lineShape@endCap | FLAT/ROUND/SQUARE |
| 시작 화살표 | (속성에 포함) | lineShape@headStyle | NORMAL/ARROW/... |
| 끝 화살표 | (속성에 포함) | lineShape@tailStyle | NORMAL/ARROW/... |
| 시작 화살표 채움 | (속성에 포함) | lineShape@headfill | 0/1 |
| 끝 화살표 채움 | (속성에 포함) | lineShape@tailfill | 0/1 |
| 시작 화살표 크기 | (속성에 포함) | lineShape@headSz | SMALL_SMALL/... |
| 끝 화살표 크기 | (속성에 포함) | lineShape@tailSz | SMALL_SMALL/... |
| 외곽선 스타일 | (없음) | lineShape@outlineStyle | INNER/OUTER/BOTH |
| 투명도 | (없음) | lineShape@alpha | HWPX only (0-255) |

## 6.5 표 (Table)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | "tbl " | `<tbl>` | 직접 매핑 |
| 행 개수 | UINT16 | rowCnt | 직접 매핑 |
| 열 개수 | UINT16 | colCnt | 직접 매핑 |
| 셀 간격 | HWPUNIT16 | cellSpacing | 직접 매핑 |
| 안쪽 여백 (4방향) | HWPUNIT16[4] | inMargin | 직접 매핑 |
| 테두리/배경 ID | UINT16 | borderFillIDRef | 직접 매핑 |
| 페이지 나눔 | 속성 bit 0-1 | pageBreak | TABLE/CELL/NONE |
| 제목행 반복 | 속성 bit 2 | repeatHeader | 직접 매핑 |
| 크기 조정 안 함 | (없음) | noAdjust | HWPX only |
| **셀 영역** | | | |
| 영역 속성 (5.0.1.0+) | 영역 배열 | cellzoneList > cellzone | 직접 매핑 |
| 영역 시작 행/열 | UINT16/UINT16 | startRowAddr/startColAddr | 직접 매핑 |
| 영역 끝 행/열 | UINT16/UINT16 | endRowAddr/endColAddr | 직접 매핑 |
| 영역 테두리 ID | UINT16 | borderFillIDRef | 직접 매핑 |
| **행** | (평면 배열) | `<tr>` | 좌표 기준 그룹핑 필요 |
| **셀** | | | |
| 셀 이름 | (없음) | tc@name | HWPX only |
| 머리글 셀 | (없음) | tc@header | HWPX only |
| 셀 여백 있음 | (없음) | tc@hasMargin | HWPX only |
| 셀 보호 | (없음) | tc@protect | HWPX only |
| 셀 편집 가능 | (없음) | tc@editable | HWPX only |
| 셀 테두리 ID | UINT16 | tc@borderFillIDRef | 직접 매핑 |
| 셀 주소 (col) | 셀 속성 내 | cellAddr@colAddr | 직접 매핑 |
| 셀 주소 (row) | 셀 속성 내 | cellAddr@rowAddr | 직접 매핑 |
| 열 병합 | colMerge (UINT16) | cellSpan@colSpan | 직접 매핑 |
| 행 병합 | rowMerge (UINT16) | cellSpan@rowSpan | 직접 매핑 |
| 셀 폭 | HWPUNIT | cellSz@width | 직접 매핑 |
| 셀 높이 | HWPUNIT | cellSz@height | 직접 매핑 |
| 셀 여백 (4방향) | (ListHeader) | cellMargin | 직접 매핑 |
| 셀 세로 정렬 | (ListHeader) | subList@vertAlign | TOP/CENTER/BOTTOM |
| 셀 내용 | 문단 리스트 | subList > p[] | 직접 매핑 (재귀) |

## 6.6 그림 (Picture)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | "$pic" | `<pic>` | 직접 매핑 |
| 반전 | (없음) | reverse | HWPX only |
| 테두리 (LineShape) | 표 86 | lineShape | 직접 매핑 |
| 이미지 좌표 (4점) | INT32[4]×2 | imgRect > pt0-pt3 | 직접 매핑 |
| 자르기 | INT32[4] | imgClip (left/top/right/bottom) | 직접 매핑 |
| 안쪽 여백 | HWPUNIT16[4] | inMargin | 직접 매핑 |
| 원본 크기 | (포함) | imgDim (dimwidth/dimheight) | 직접 매핑 |
| 이미지 참조 ID | UINT16 | img@binaryItemIDRef | 직접 매핑 |
| 이미지 명암 | BYTE | img@bright | -100~100 |
| 이미지 밝기 | BYTE | img@contrast | -100~100 |
| 이미지 효과 | BYTE | img@effect | REAL_PIC/GRAY_SCALE/BLACK_WHITE |
| 이미지 투명도 | (없음) | img@alpha | HWPX only (0-255) |
| 그림 효과 | 효과 구조 | effects (shadow/glow/softEdge/reflection) | HWPX가 더 상세 |

## 6.7 선 (Line)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | "$rTn" | `<line>` | 직접 매핑 |
| 시작점 | UINT32 (x, y) | startPt (x/y) | 직접 매핑 |
| 끝점 | UINT32 (x, y) | endPt (x/y) | 직접 매핑 |
| 방향 교정 | (없음) | isReverseHV | HWPX only |

## 6.8 사각형 (Rectangle)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | "$rec" | `<rect>` | 직접 매핑 |
| 곡률 | BYTE (0-100) | ratio (0-50%) | 값 범위 다름 |
| 좌표 (4점) | INT32[4]×2 | pt0-pt3 (x/y) | 직접 매핑 |

## 6.9 타원 (Ellipse)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | "$ell" | `<ellipse>` | 직접 매핑 |
| 중심점 | INT32 (x, y) | center (x/y) | 직접 매핑 |
| 제1축 좌표 | INT32 (x, y) | ax1 (x/y) | 직접 매핑 |
| 제2축 좌표 | INT32 (x, y) | ax2 (x/y) | 직접 매핑 |
| 시작/끝 지점 | start1/end1/start2/end2 | start1/end1/start2/end2 | 직접 매핑 |
| 호 속성 | arcType | hasArcPr/arcType | HWPX가 더 명확 |
| 간격 재계산 | (없음) | intervalDirty | HWPX only |

## 6.10 호 (Arc)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | "$arc" | `<arc>` | 직접 매핑 |
| 호 종류 | arcType | type | NORMAL/PIE/CHORD |
| 중심점/축 | (타원과 동일) | center/ax1/ax2 | 직접 매핑 |

## 6.11 다각형 (Polygon)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | "$pol" | `<polygon>` | 직접 매핑 |
| 좌표 개수 | UINT16 cnt | pt 요소 개수 | 직접 매핑 |
| 좌표 배열 | INT32[cnt]×2 | pt (x/y) × cnt | 직접 매핑 |

## 6.12 곡선 (Curve)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | "$cur" | `<curve>` | 직접 매핑 |
| 세그먼트 개수 | UINT16 cnt | seg 요소 개수 | 직접 매핑 |
| 세그먼트 좌표 | INT32[cnt]×2 | seg (x1/y1/x2/y2) | 형식 약간 다름 |
| 세그먼트 타입 | BYTE[cnt-1] | seg@type | CURVE/LINE |

## 6.13 OLE 개체

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | "$ole" | `<ole>` | 직접 매핑 |
| 개체 타입 | 속성 | objectType | 직접 매핑 |
| Extent X/Y | INT32 | extent x/y | 직접 매핑 |
| 바이너리 ID | UINT16 | binaryItemIDRef | 직접 매핑 |
| 테두리 (LineShape) | 표 86 | lineShape | 직접 매핑 |

## 6.14 수식 (Equation)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | "eqed" | `<equation>` | 직접 매핑 |
| 줄 모드 | UINT32 | lineMode | 직접 매핑 |
| 스크립트 | WCHAR[] | script | 수식 문자열 |
| 글자 크기 | HWPUNIT | baseUnit | 직접 매핑 |
| 글자 색상 | COLORREF | textColor | 직접 매핑 |
| 베이스라인 | INT16 | baseLine | 직접 매핑 |
| 버전 | WCHAR[] | version | 직접 매핑 |
| 폰트 이름 | WCHAR[] | font | 직접 매핑 |

## 6.15 묶음 개체 (Container)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | "$con" | `<container>` | 직접 매핑 |
| 자식 개체 | 재귀적 ShapeComponent | 하위 도형 요소들 | 재귀 (동일) |
| 그룹 레벨 | groupLevel | groupLevel | 직접 매핑 |

## 6.16 글맵시 (TextArt)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | (그리기 개체 내) | `<textart>` | 직접 매핑 |
| 텍스트 내용 | 글상자 텍스트 | text 속성 | 직접 매핑 |
| 글꼴 이름 | 글상자 정보 | textartPr@fontName | 직접 매핑 |
| 글꼴 스타일 | 글상자 정보 | textartPr@fontStyle | 직접 매핑 |
| 텍스트 모양 | 글상자 정보 | textartPr@textShape | 직접 매핑 |
| 외곽선 좌표 | 글상자 리스트 | outline (좌표 배열) | 직접 매핑 |

## 6.17 연결선 (ConnectLine)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | (그리기 개체 내) | `<connectLine>` | 직접 매핑 |
| 연결 유형 | 속성 | type (STRAIGHT_CONNECT/STROKE_CONNECT/...) | 직접 매핑 |
| 시작 도형 ID | (속성 내) | startPt@subjectIDRef | 직접 매핑 |
| 끝 도형 ID | (속성 내) | endPt@subjectIDRef | 직접 매핑 |
| 시작 연결점 | (속성 내) | startPt@subjectIdx | 직접 매핑 |
| 끝 연결점 | (속성 내) | endPt@subjectIdx | 직접 매핑 |

## 6.18 모든 도형의 공통 하위 요소

| 요소 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 테두리 (LineShape) | 표 86 | lineShape | 6.4 참조 |
| 채우기 (FillBrush) | 표 28 | fillBrush | 2.10 참조 |
| 글상자 텍스트 | 글상자 리스트 | drawText | 선택적, 문단 리스트 포함 |
