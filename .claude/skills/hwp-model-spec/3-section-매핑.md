# 3. Section 매핑 (구역/페이지/각주/미주/Grid/단)

## 3.1 구역 정의 (Section Definition / secPr)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 머리말 감춤 | 속성 bit 0 | visibility@hideFirstHeader | 직접 매핑 |
| 꼬리말 감춤 | 속성 bit 1 | visibility@hideFirstFooter | 직접 매핑 |
| 바탕쪽 감춤 | 속성 bit 2 | visibility@hideFirstMasterPage | 직접 매핑 |
| 테두리 감춤 | 속성 bit 3 | visibility@border | SHOW_ALL/HIDE_FIRST/SHOW_FIRST |
| 배경 감춤 | 속성 bit 4 | visibility@fill | SHOW_ALL/HIDE_FIRST/SHOW_FIRST |
| 쪽번호 감춤 | 속성 bit 5 | visibility@hideFirstPageNum | 직접 매핑 |
| 첫 쪽만 테두리 | 속성 bit 8 | visibility@border (SHOW_FIRST) | 값 변환 필요 |
| 첫 쪽만 배경 | 속성 bit 9 | visibility@fill (SHOW_FIRST) | 값 변환 필요 |
| 텍스트 방향 | 속성 bit 16-18 | secPr@textDirection | HORIZONTAL/VERTICAL |
| 빈칸 감춤 | 속성 bit 19 | visibility@hideFirstEmptyLine | 직접 매핑 |
| 페이지 번호 적용 | 속성 bit 20-21 | startNum@pageStartsOn | BOTH/ODDPAGE/EVENPAGE |
| 원고지 정서법 | 속성 bit 22 | grid@wonggojiFormat | 직접 매핑 |
| 줄 번호 표시 | (없음) | visibility@showLineNumber | HWPX only |
| 단 사이 간격 | HWPUNIT16 | secPr@spaceColumns | 직접 매핑 |
| 세로 줄맞춤 (Grid) | HWPUNIT16 (0=off, n=간격) | grid@lineGrid | HWP는 간격값, HWPX는 0/1 |
| 가로 줄맞춤 (Grid) | HWPUNIT16 (0=off, n=간격) | grid@charGrid | HWP는 간격값, HWPX는 0/1 |
| 기본 탭 간격 | HWPUNIT | secPr@tabStop | 직접 매핑 |
| 번호 문단 모양 ID | UINT16 | secPr@outlineShapeIDRef | 직접 매핑 |
| 페이지 시작 번호 | UINT16 (0=이어서) | startNum@page | 직접 매핑 |
| 그림 시작 번호 | UINT16 | startNum@pic | 직접 매핑 |
| 표 시작 번호 | UINT16 | startNum@tbl | 직접 매핑 |
| 수식 시작 번호 | UINT16 | startNum@equation | 직접 매핑 |
| 메모 모양 ID | (없음) | secPr@memoShapeIDRef | HWPX only |
| 바탕쪽 개수 | (없음) | secPr@masterPageCnt | HWPX only |
| 대표 Language | UINT16 (5.0.1.5+) | 대응 없음 | HWP only → hints |

## 3.2 용지 설정 (Page Definition / pagePr)

| 필드 | HWP 5.0 (표 131) | HWPX | 비고 |
|------|-------------------|------|------|
| 용지 가로 크기 | HWPUNIT | pagePr@width | 직접 매핑 |
| 용지 세로 크기 | HWPUNIT | pagePr@height | 직접 매핑 |
| 왼쪽 여백 | HWPUNIT | margin@left | 직접 매핑 |
| 오른쪽 여백 | HWPUNIT | margin@right | 직접 매핑 |
| 위쪽 여백 | HWPUNIT | margin@top | 직접 매핑 |
| 아래쪽 여백 | HWPUNIT | margin@bottom | 직접 매핑 |
| 머리말 여백 | HWPUNIT | margin@header | 직접 매핑 |
| 꼬리말 여백 | HWPUNIT | margin@footer | 직접 매핑 |
| 제본 여백 | HWPUNIT | margin@gutter | 직접 매핑 |
| 용지 방향 | 속성 bit 0 (0=세로, 1=가로) | pagePr@landscape | PORTRAIT/LANDSCAPE/WIDELY |
| 제책 방법 | 속성 bit 1-2 | pagePr@gutterType | LEFT_ONLY/LEFT_RIGHT/TOP_BOTTOM |

## 3.3 각주 설정 (Footnote / footNotePr)

| 필드 | HWP 5.0 (표 133-134) | HWPX | 비고 |
|------|----------------------|------|------|
| 번호 모양 | 속성 bit 0-3 | autoNumFormat@type | NumberType |
| 사용자 문자 | WCHAR | autoNumFormat@userChar | 직접 매핑 |
| 앞 장식 문자 | WCHAR | autoNumFormat@prefixChar | 직접 매핑 |
| 뒤 장식 문자 | WCHAR | autoNumFormat@suffixChar | 직접 매핑 |
| 위첨자 여부 | 속성 bit 12 | autoNumFormat@supscript | 직접 매핑 |
| 배열 방법 | 속성 bit 4-7 | placement@place | EACH_COLUMN/MERGED_COLUMN/RIGHT_MOST |
| 텍스트 아래 배치 | 속성 bit 8 | placement@beneathText | 직접 매핑 |
| 번호 형식 | 속성 bit 9-11 | numbering@type | CONTINUOUS/ON_PAGE/ON_SECTION |
| 시작 번호 | UINT16 | numbering@newNum | 직접 매핑 |
| 구분선 길이 | UINT16 | noteLine@length | 직접 매핑 |
| 구분선 종류 | UINT8 | noteLine@type | LineType3 |
| 구분선 굵기 | UINT8 | noteLine@width | 직접 매핑 |
| 구분선 색상 | COLORREF | noteLine@color | 직접 매핑 |
| 주석 사이 여백 | UINT16 | noteSpacing@betweenNotes | 직접 매핑 |
| 구분선 아래 여백 | UINT16 | noteSpacing@belowLine | 직접 매핑 |
| 구분선 위 여백 | UINT16 | noteSpacing@aboveLine | 직접 매핑 |

## 3.4 미주 설정 (Endnote / endNotePr)

각주와 동일 구조. 차이점:

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 배열 방법 | 속성 bit 4-7 | placement@place | END_OF_DOCUMENT/END_OF_SECTION (값 범위 다름) |
| 번호 형식 | 속성 bit 9-11 | numbering@type | CONTINUOUS/ON_SECTION (ON_PAGE 미지원) |

## 3.5 쪽 테두리/배경 (Page Border Fill)

| 필드 | HWP 5.0 (표 135-136) | HWPX | 비고 |
|------|----------------------|------|------|
| 테두리/배경 ID | UINT16 | pageBorderFill@borderFillIDRef | 직접 매핑 |
| 위치 기준 | 속성 bit 0-1 | pageBorderFill@textBorder | PAPER/TEXT |
| 머리말 포함 | 속성 bit 2 | pageBorderFill@headerInside | 직접 매핑 |
| 꼬리말 포함 | 속성 bit 3 | pageBorderFill@footerInside | 직접 매핑 |
| 채움 영역 | 속성 bit 4-5 | pageBorderFill@fillArea | PAPER/TEXT/PAPERLINE |
| 왼쪽 간격 | HWPUNIT16 | offset@left | 직접 매핑 |
| 오른쪽 간격 | HWPUNIT16 | offset@right | 직접 매핑 |
| 위쪽 간격 | HWPUNIT16 | offset@top | 직접 매핑 |
| 아래쪽 간격 | HWPUNIT16 | offset@bottom | 직접 매핑 |

## 3.6 바탕쪽 정보 (Master Page)

| 필드 | HWP 5.0 (표 137) | HWPX | 비고 |
|------|-------------------|------|------|
| 바탕쪽 폭 | HWPUNIT | (바탕쪽 자체에 정의) | 구조 차이 |
| 바탕쪽 높이 | HWPUNIT | (바탕쪽 자체에 정의) | 구조 차이 |
| 텍스트 참조 | BYTE | 대응 없음 | HWP only |
| 번호 참조 | BYTE | 대응 없음 | HWP only |
| 바탕쪽 ID 참조 | (없음) | masterPage@idRef | HWPX only |

## 3.7 단 정의 (Column Definition / colPr)

| 필드 | HWP 5.0 (표 138-139) | HWPX | 비고 |
|------|----------------------|------|------|
| 단 종류 | 속성 bit 0-1 | colPr@type | NEWSPAPER/BALANCED |
| 단 개수 | 속성 bit 2-9 | colPr@colCount | 1-10 |
| 단 방향 | 속성 bit 10-11 | colPr@layout | LEFT/RIGHT/CENTER |
| 단 너비 동일 | 속성 bit 12 | colPr@sameSz | 직접 매핑 |
| 단 사이 간격 | HWPUNIT16 | colPr@sameGap | 직접 매핑 |
| 단 너비 배열 | WORD[] | colSz@width (각각) | sameSz=0일 때만 |
| 구분선 종류 | UINT8 | colLine@type | LineType3 |
| 구분선 굵기 | UINT8 | colLine@width | 직접 매핑 |
| 구분선 색상 | COLORREF | colLine@color | 직접 매핑 |

## 3.8 줄 번호 (Line Number Shape)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 재시작 유형 | (표 미상) | lineNumberShape@restartType | RESTART_BY_SECTION/PAGE/KEEP_CONTINUE |
| 표시 간격 | (표 미상) | lineNumberShape@countBy | 직접 매핑 |
| 본문 거리 | (표 미상) | lineNumberShape@distance | HWPUNIT |
| 시작 번호 | (표 미상) | lineNumberShape@startNumber | 직접 매핑 |
