# 2. Resources 매핑 (DocInfo / Header)

HWP 5.0의 DocInfo 스트림과 HWPX의 header.xml(refList) 간 매핑.

## 2.1 문서 속성 (Document Properties)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 구역 개수 | UINT16 area_count | (섹션 파일 개수로 유추) | HWPX에 직접 대응 없음 |
| 페이지 시작 번호 | UINT16 page_start_number | beginNum@page | 직접 매핑 |
| 각주 시작 번호 | UINT16 footnote_start_number | beginNum@footnote | 직접 매핑 |
| 미주 시작 번호 | UINT16 endnote_start_number | beginNum@endnote | 직접 매핑 |
| 그림 시작 번호 | UINT16 image_start_number | beginNum@pic | 직접 매핑 |
| 표 시작 번호 | UINT16 table_start_number | beginNum@tbl | 직접 매핑 |
| 수식 시작 번호 | UINT16 formula_start_number | beginNum@equation | 직접 매핑 |
| 캐럿 위치 (list_id) | UINT32 | 대응 없음 | HWP only → hints |
| 캐럿 위치 (para_id) | UINT32 | 대응 없음 | HWP only → hints |
| 캐럿 위치 (char_pos) | UINT32 | 대응 없음 | HWP only → hints |

## 2.2 아이디 매핑 (ID Mappings)

HWP의 IdMappings는 각 테이블의 개수를 미리 선언. HWPX는 itemCnt 속성으로 동일.

| 필드 | HWP 5.0 INT32[n] | HWPX itemCnt | 비고 |
|------|-------------------|-------------|------|
| 바이너리 데이터 | [0] | binDataItems@itemCnt | 직접 매핑 |
| 한글 글꼴 | [1] | fontface[lang=HANGUL]@fontCnt | 직접 매핑 |
| 영문 글꼴 | [2] | fontface[lang=LATIN]@fontCnt | 직접 매핑 |
| 한자 글꼴 | [3] | fontface[lang=HANJA]@fontCnt | 직접 매핑 |
| 일어 글꼴 | [4] | fontface[lang=JAPANESE]@fontCnt | 직접 매핑 |
| 기타 글꼴 | [5] | fontface[lang=OTHER]@fontCnt | 직접 매핑 |
| 기호 글꼴 | [6] | fontface[lang=SYMBOL]@fontCnt | 직접 매핑 |
| 사용자 글꼴 | [7] | fontface[lang=USER]@fontCnt | 직접 매핑 |
| 테두리/배경 | [8] | borderFills@itemCnt | 직접 매핑 |
| 글자 모양 | [9] | charProperties@itemCnt | 직접 매핑 |
| 탭 정의 | [10] | tabProperties@itemCnt | 직접 매핑 |
| 문단 번호 | [11] | numberings@itemCnt | 직접 매핑 |
| 글머리표 | [12] | bullets@itemCnt | 직접 매핑 |
| 문단 모양 | [13] | paraProperties@itemCnt | 직접 매핑 |
| 스타일 | [14] | styles@itemCnt | 직접 매핑 |
| 메모 모양 | [15] (5.0.2.1+) | memoProperties@itemCnt | 직접 매핑 |
| 변경추적 | [16] (5.0.3.2+) | trackChanges 개수 | 직접 매핑 |
| 변경추적 작성자 | [17] (5.0.3.2+) | trackChangeAuthors 개수 | 직접 매핑 |

## 2.3 바이너리 데이터 (BinData)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 저장 유형 | UINT16 bit 0-3 (Link/Embedding/Storage) | manifest 항목 | 직접 매핑 |
| 압축 방식 | UINT16 bit 4-5 | ZIP 컨테이너 레벨 | HWPX는 컨테이너에서 처리 |
| 접근 상태 | UINT16 bit 8-9 | 대응 없음 | HWP only (런타임) |
| 절대 경로 (Link) | WCHAR[] | 외부 파일 참조 | Link 타입 시 |
| 상대 경로 (Link) | WCHAR[] | 외부 파일 참조 | Link 타입 시 |
| 바이너리 ID (Embedding) | UINT16 | binDataItem@binaryItemID | 직접 매핑 |
| 확장자 (Embedding) | WCHAR[] | 파일 확장자 | 직접 매핑 |

## 2.4 글꼴 (Face Name / Font)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 글꼴 이름 | WCHAR[] name | font@face | 직접 매핑 |
| 대체 글꼴 존재 | 속성 bit 7 | substFont 요소 존재 | 직접 매핑 |
| 대체 글꼴 유형 | BYTE | substFont@type | TTF/HFT |
| 대체 글꼴 이름 | WCHAR[] | substFont@face | 직접 매핑 |
| 글꼴 유형 정보 존재 | 속성 bit 6 | typeInfo 요소 존재 | 직접 매핑 |
| 글꼴 계열 | BYTE familyType | typeInfo@familyType | FCAT_* enum |
| 세리프 유형 | BYTE | typeInfo@serifStyle | 직접 매핑 |
| 굵기 | BYTE weight | typeInfo@weight | 0-9 |
| 비례 | BYTE | typeInfo@proportion | 0-10 |
| 대조 | BYTE | typeInfo@contrast | 0-5 |
| 스트로크 편차 | BYTE | typeInfo@strokeVariation | 0-4 |
| 자획 유형 | BYTE | typeInfo@armStyle | 0-4 |
| 글자형 | BYTE | typeInfo@letterform | 0-4 |
| 중간선 | BYTE | typeInfo@midline | 0-2 |
| X-높이 | BYTE | typeInfo@xHeight | 0-2 |
| 기본 글꼴 이름 | WCHAR[] (속성 bit 5) | 대응 없음 | HWP only |

## 2.5 글자 모양 (CharShape / charPr)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| **7개 언어별 글꼴 ID** | WORD[7] | fontRef (hangul/latin/hanja/japanese/other/symbol/user) | 직접 매핑 |
| **7개 언어별 장평** | UINT8[7] | ratio (hangul/latin/.../user) | 직접 매핑 (%) |
| **7개 언어별 자간** | INT8[7] | spacing (hangul/latin/.../user) | 직접 매핑 (%) |
| **7개 언어별 상대 크기** | UINT8[7] | relSz (hangul/latin/.../user) | 직접 매핑 (%) |
| **7개 언어별 글자 위치** | INT8[7] | offset (hangul/latin/.../user) | 직접 매핑 (%) |
| 기준 크기 | INT32 base_size | charPr@height | 직접 매핑 (HWPUNIT) |
| 기울임 | 속성 bit 0 | `<italic/>` 요소 존재 | 직접 매핑 |
| 진하게 | 속성 bit 1 | `<bold/>` 요소 존재 | 직접 매핑 |
| 밑줄 종류 | 속성 bit 2-3 | underline@type | BOTTOM/CENTER/TOP |
| 밑줄 모양 | 속성 bit 4-7 | underline@shape | LineType3 |
| 밑줄 색 | COLORREF | underline@color | 직접 매핑 |
| 외곽선 종류 | 속성 bit 8-10 | outline@type | LineType1 |
| 그림자 종류 | 속성 bit 11-12 | shadow@type | NONE/DROP/CONTINUOUS |
| 그림자 색 | COLORREF | shadow@color | 직접 매핑 |
| 그림자 간격 X | INT8 | shadow@offsetX | 직접 매핑 (%) |
| 그림자 간격 Y | INT8 | shadow@offsetY | 직접 매핑 (%) |
| 양각 | 속성 bit 13 | `<emboss/>` 요소 존재 | 직접 매핑 |
| 음각 | 속성 bit 14 | `<engrave/>` 요소 존재 | 직접 매핑 |
| 위 첨자 | 속성 bit 15 | `<supscript/>` 요소 존재 | 직접 매핑 |
| 아래 첨자 | 속성 bit 16 | `<subscript/>` 요소 존재 | 직접 매핑 |
| 취소선 | 속성 bit 18-20 | strikeout@shape | LineType3 |
| 취소선 색 | COLORREF (5.0.3.0+) | strikeout@color | 직접 매핑 |
| 강조점 종류 | 속성 bit 21-24 | charPr@symMark | DOT_ABOVE/RING_ABOVE/... |
| 글꼴 간격 사용 | 속성 bit 25 | charPr@useFontSpace | 직접 매핑 |
| 취소선 모양 | 속성 bit 26-29 | strikeout@shape | 직접 매핑 |
| Kerning | 속성 bit 30 | charPr@useKerning | 직접 매핑 |
| 글자 색 | COLORREF | charPr@textColor | 직접 매핑 |
| 음영 색 | COLORREF | charPr@shadeColor | 직접 매핑 |
| 글자 테두리/배경 ID | UINT16 (5.0.2.1+) | charPr@borderFillIDRef | Optional |

## 2.6 탭 정의 (TabDef / tabPr)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 왼쪽 자동 탭 | 속성 bit 0 | tabPr@autoTabLeft | 직접 매핑 |
| 오른쪽 자동 탭 | 속성 bit 1 | tabPr@autoTabRight | 직접 매핑 |
| 탭 개수 | INT16 | tabItem 요소 개수 | 직접 매핑 |
| 탭 위치 | HWPUNIT | tabItem@pos | 직접 매핑 |
| 탭 종류 | UINT8 | tabItem@type | LEFT/RIGHT/CENTER/DECIMAL |
| 채움 종류 | UINT8 | tabItem@leader | NONE/DOT/DASH/LINE/... |

## 2.7 문단 번호 (Numbering)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| **각 수준별 (1-7, 확장 8-10)** | | | |
| 문단 정렬 | 속성 bit 0-1 | paraHead@align | LEFT/CENTER/RIGHT |
| 인스턴스 유사 | 속성 bit 2 | paraHead@useInstWidth | 직접 매핑 |
| 자동 내어쓰기 | 속성 bit 3 | paraHead@autoIndent | 직접 매핑 |
| 거리 종류 | 속성 bit 4 | paraHead@textOffsetType | PERCENT/HWPUNIT |
| 번호 종류 | 속성 bit 5-8 | paraHead@numFormat | NumberType2 |
| 너비 보정값 | HWPUNIT16 | paraHead@widthAdjust | 직접 매핑 |
| 본문과의 거리 | HWPUNIT16 | paraHead@textOffset | 직접 매핑 |
| 글자 모양 ID | UINT32 | paraHead@charPrIDRef | 직접 매핑 |
| 번호 형식 문자열 | WCHAR[] | paraHead 텍스트 내용 | ^1, ^2, ..., ^n, ^N |
| 시작 번호 | UINT16[7] | paraHead@start | 직접 매핑 |

## 2.8 글머리표 (Bullet)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 문단 정렬 | 속성 bit 0-1 | paraHead@align | 직접 매핑 |
| 인스턴스 유사 | 속성 bit 2 | paraHead@useInstWidth | 직접 매핑 |
| 자동 내어쓰기 | 속성 bit 3 | paraHead@autoIndent | 직접 매핑 |
| 거리 종류 | 속성 bit 4 | paraHead@textOffsetType | 직접 매핑 |
| 너비 보정값 | HWPUNIT16 | paraHead@widthAdjust | 직접 매핑 |
| 본문과의 거리 | HWPUNIT16 | paraHead@textOffset | 직접 매핑 |
| 글자 모양 ID | INT32 | paraHead@charPrIDRef | 직접 매핑 |
| 글머리표 문자 | WCHAR | bullet@char | 직접 매핑 |
| 체크 글머리표 문자 | WCHAR | bullet@checkedChar | 직접 매핑 |
| 이미지 글머리표 사용 | (image_id != -1) | bullet@useImg | 직접 매핑 |
| 이미지 ID | INT32 | img@binaryItemIDRef | 직접 매핑 |
| 이미지 명암/밝기/효과 | BYTE[3] | img@bright/@contrast/@effect | 직접 매핑 |

## 2.9 문단 모양 (ParaShape / paraPr)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 정렬 방법 | 속성1 bit 2-4 | align@horizontal | JUSTIFY/LEFT/RIGHT/CENTER/DISTRIBUTE |
| 세로 정렬 | 속성1 bit 20-21 | align@vertical | BASELINE/TOP/CENTER/BOTTOM |
| 줄 나눔 영문 | 속성1 bit 5-6 | breakSetting@breakLatinWord | KEEP_WORD/BREAK_CHAR |
| 줄 나눔 한글 | 속성1 bit 7 | breakSetting@breakNonLatinWord | KEEP_WORD/BREAK_CHAR |
| 줄 격자 사용 | 속성1 bit 8 | paraPr@snapToGrid | 직접 매핑 |
| 최소 공백값 | 속성1 bit 9-15 | paraPr@condense | 0-100 (%) |
| 외톨이 줄 보호 | 속성1 bit 16 | breakSetting@widowOrphan | 직접 매핑 |
| 다음 문단과 함께 | 속성1 bit 17 | breakSetting@keepWithNext | 직접 매핑 |
| 문단 보호 | 속성1 bit 18 | breakSetting@keepLines | 직접 매핑 |
| 쪽 나눔 전 | 속성1 bit 19 | breakSetting@pageBreakBefore | 직접 매핑 |
| 글꼴 줄 높이 | 속성1 bit 22 | paraPr@fontLineHeight | 직접 매핑 |
| 문단 머리 종류 | 속성1 bit 23-24 | heading@type | NONE/OUTLINE/NUMBER/BULLET |
| 문단 수준 | 속성1 bit 25-27 | heading@level | 0-10 |
| 테두리 연결 | 속성1 bit 28 | border@connect | 직접 매핑 |
| 여백 무시 | 속성1 bit 29 | border@ignoreMargin | 직접 매핑 |
| 문단 꼬리 모양 | 속성1 bit 30 | 대응 없음 | HWP only → hints |
| 왼쪽 여백 | INT32 | margin > left@value | HWPUNIT |
| 오른쪽 여백 | INT32 | margin > right@value | HWPUNIT |
| 들여쓰기/내어쓰기 | INT32 | margin > intent@value | 양수=들여, 음수=내어 |
| 위 문단 간격 | INT32 | margin > prev@value | HWPUNIT |
| 아래 문단 간격 | INT32 | margin > next@value | HWPUNIT |
| 줄 간격 종류 | 속성3 (5.0.2.5+) | lineSpacing@type | PERCENT/FIXED/AT_LEAST/BETWEEN |
| 줄 간격 값 | INT32 | lineSpacing@value | HWPUNIT |
| 줄 간격 단위 | (속성3에 포함) | lineSpacing@unit | HWPUNIT/CHAR |
| 탭 ID | UINT16 | paraPr@tabPrIDRef | 직접 매핑 |
| 번호/글머리표 ID | UINT16 | heading@idRef | 직접 매핑 |
| 테두리/배경 ID | UINT16 | border@borderFillIDRef | 직접 매핑 |
| 테두리 간격 (4방향) | INT16[4] | border@offset(Left/Right/Top/Bottom) | HWPUNIT |
| 한 줄 입력 | 속성2 bit 0-1 (5.0.1.7+) | breakSetting@lineWrap | BREAK/NONE |
| 한글-영문 자동 간격 | 속성2 bit 4 | autoSpacing@eAsianEng | 직접 매핑 |
| 한글-숫자 자동 간격 | 속성2 bit 5 | autoSpacing@eAsianNum | 직접 매핑 |
| 텍스트 방향 | (없음) | paraPr@textDir | LTR/RTL, HWPX only |
| 줄번호 억제 | (없음) | paraPr@suppressLineNumbers | HWPX only |

## 2.10 테두리/배경 (BorderFill)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 3D 효과 | 속성 bit 0 | borderFill@threeD | 직접 매핑 |
| 그림자 효과 | 속성 bit 1 | borderFill@shadow | 직접 매핑 |
| Slash 대각선 | 속성 bit 2-4 | slash@type | NONE/CENTER/CENTER_BELOW/... |
| BackSlash 대각선 | 속성 bit 5-7 | backSlash@type | 직접 매핑 |
| Slash 꺽은선 | 속성 bit 8-9 | slash@Crooked | 직접 매핑 |
| BackSlash 꺽은선 | 속성 bit 10 | backSlash@Crooked | 직접 매핑 |
| Slash 180도 회전 | 속성 bit 11 | slash@isCounter | 직접 매핑 |
| BackSlash 180도 회전 | 속성 bit 12 | backSlash@isCounter | 직접 매핑 |
| 중심선 유무 | 속성 bit 13 | borderFill@centerLine | NONE/LEFT/RIGHT/BOTH |
| 셀 분리선 끊기 | (없음) | borderFill@breakCellSeparateLine | HWPX only |
| **4방향 테두리선** | | | |
| 선 종류 | UINT8 | leftBorder/@type (등) | LineType3 |
| 선 굵기 | UINT8 | leftBorder/@width (등) | 직접 매핑 |
| 선 색상 | COLORREF | leftBorder/@color (등) | 직접 매핑 |
| **대각선** | | | |
| 선 종류 | UINT8 | diagonal@type | LineType3 |
| 선 굵기 | UINT8 | diagonal@width | 직접 매핑 |
| 선 색상 | COLORREF | diagonal@color | 직접 매핑 |
| **채우기** | | | |
| 단색 배경색 | COLORREF | winBrush@faceColor | 직접 매핑 |
| 단색 무늬색 | COLORREF | winBrush@hatchColor | 직접 매핑 |
| 단색 무늬 종류 | INT32 | winBrush@hatchStyle | 직접 매핑 |
| 단색 투명도 | (없음) | winBrush@alpha | HWPX only (0-255) |
| 그러데이션 유형 | INT16 | gradation@type | LINEAR/SQUARE/RADIAL |
| 그러데이션 각도 | INT16 | gradation@angle | 0-360 |
| 그러데이션 중심 X | INT16 | gradation@centerX | 0-100 |
| 그러데이션 중심 Y | INT16 | gradation@centerY | 0-100 |
| 그러데이션 번짐 | INT16 | gradation@step | 0-255 |
| 그러데이션 색 수 | INT16 | gradation@colorNum | 2-256 |
| 그러데이션 색상[] | COLORREF[] | gradation > color@value | 직접 매핑 |
| 이미지 채우기 유형 | BYTE | imgBrush@mode | TOTAL/CENTER/TILE/... |
| 이미지 참조 | BYTE[5] | img@binaryItemIDRef | 직접 매핑 |
| 이미지 투명도 | (없음) | img@alpha | HWPX only (0-255) |

## 2.11 스타일 (Style)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 로컬 스타일 이름 | WCHAR[] | style@name | 직접 매핑 |
| 영문 스타일 이름 | WCHAR[] | style@engName | 직접 매핑 |
| 스타일 종류 | BYTE bit 0-2 | style@type | PARA/CHAR |
| 다음 스타일 ID | BYTE | style@nextStyleIDRef | 직접 매핑 |
| 언어 ID | INT16 | style@langID | 직접 매핑 |
| 문단 모양 ID | UINT16 | style@paraPrIDRef | PARA 타입 시 |
| 글자 모양 ID | UINT16 | style@charPrIDRef | CHAR 타입 시 |
| 양식 잠금 | (없음) | style@lockForm | HWPX only |
