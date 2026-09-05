# 7. Hints 및 전용 필드

## 7.1 HWP only → HwpHints

문서의 의미와 무관한 포맷 부산물. roundtrip 시 보존용.

### HwpDocumentHints

| 필드 | 타입 | 용도 |
|------|------|------|
| file_header_raw | Vec<u8> | 원본 FileHeader 256바이트 보존 |
| version | (u8, u8, u8, u8) | HWP 버전 (major, minor, build, revision) |
| compressed | bool | 압축 여부 |
| scripts | Option<Scripts> | JScript 매크로 |
| preview_image | Option<Vec<u8>> | EMF 미리보기 이미지 |
| caret_list_id | Option<u32> | 마지막 캐럿 위치 - 리스트 ID |
| caret_para_id | Option<u32> | 마지막 캐럿 위치 - 문단 ID |
| caret_char_pos | Option<u32> | 마지막 캐럿 위치 - 문자 위치 |

### HwpSectionHints

| 필드 | 타입 | 용도 |
|------|------|------|
| language_id | Option<u16> | 대표 Language ID (5.0.1.5+) |
| master_page_width | Option<u32> | 바탕쪽 폭 |
| master_page_height | Option<u32> | 바탕쪽 높이 |
| master_page_text_ref | Option<u8> | 바탕쪽 텍스트 참조 |
| master_page_num_ref | Option<u8> | 바탕쪽 번호 참조 |

### HwpParagraphHints

| 필드 | 타입 | 용도 |
|------|------|------|
| line_segments | Vec<LineSegmentInfo> | 레이아웃 캐시 (ParaLineSeg) |
| control_mask | u32 | 제어 문자 존재 비트마스크 |
| range_tags_raw | Vec<u8> | 원본 범위 태그 바이트 |
| tail_shape | Option<u8> | 문단 꼬리 모양 (bit 30) |

### LineSegmentInfo (ParaLineSeg 보존용)

| 필드 | 타입 | 용도 |
|------|------|------|
| text_start_pos | u32 | 줄 시작 문자 위치 |
| vertical_pos | i32 | 줄 Y 좌표 |
| line_height | i32 | 줄 전체 높이 |
| text_height | i32 | 텍스트 높이 |
| baseline_distance | i32 | 베이스라인 거리 |
| line_spacing | i32 | 줄 간격 |
| column_start_pos | i32 | 단 내 X 위치 |
| segment_width | i32 | 줄 폭 |
| flags | u32 | first/last/empty 등 |

### HWP write 시 ParaLineSeg 전략

| 시나리오 | 처리 |
|---------|------|
| HWP read → 수정 없음 → HWP write | 원본 hints 값 그대로 |
| HWP read → 텍스트 수정 → HWP write | 해당 문단 hints 비움 → 기본값 |
| HWPX read → HWP write | hints 없음 → 기본값 |
| 새 문서 → HWP write | 기본값 |

기본값: lineHeight=1000, textHeight=1000, baselineDistance=850, segmentWidth=42520

## 7.2 HWPX only → HwpxHints / Option 필드

### HwpxHints (패키지 메타)

| 필드 | 타입 | 용도 |
|------|------|------|
| xml_version | String | version.xml의 xmlVersion ("1.5") |
| app_version | String | application 버전 ("12, 0, 0, 0") |
| extra_manifest_entries | Vec<ManifestEntry> | 알 수 없는 manifest 항목 보존 |

### 공통 모델의 Option 필드 (HWPX에서 유래)

| 위치 | 필드 | 타입 | 용도 |
|------|------|------|------|
| DocumentMeta | title | Option<String> | Dublin Core |
| DocumentMeta | creator | Option<String> | Dublin Core |
| DocumentMeta | description | Option<String> | Dublin Core |
| DocumentMeta | language | Option<String> | Dublin Core |
| DocumentMeta | created_date | Option<String> | Dublin Core |
| DocumentMeta | modified_date | Option<String> | Dublin Core |
| DocumentMeta | keywords | Option<String> | Dublin Core |
| Paragraph | meta_tag | Option<String> | JSON 메타데이터 |
| Paragraph | para_tc_id | Option<String> | 변경추적 ID |
| ShapeCommon | meta_tag | Option<String> | JSON 메타데이터 |
| ShapeCommon | lock | bool | 개체 잠금 |
| ShapeCommon | dropcap_style | Option<DropcapStyle> | 드롭캡 |
| ShapePosition | affect_line_spacing | bool | 줄간격 영향 |
| ShapePosition | flow_with_text | bool | 텍스트와 이동 |
| ShapePosition | hold_anchor_and_so | bool | 앵커 고정 |
| SectionDef | memo_shape_id | Option<u16> | 메모 모양 참조 |
| SectionDef | master_page_cnt | Option<u16> | 바탕쪽 개수 |
| LineObject | is_reverse_hv | Option<bool> | 선 방향 교정 |
| EllipseObject | interval_dirty | Option<bool> | 간격 재계산 |
| LineSpec | alpha | Option<u8> | 선 투명도 (0-255) |
| ImageRef | alpha | Option<u8> | 이미지 투명도 (0-255) |
| FillBrush (WinBrush) | alpha | Option<u8> | 채우기 투명도 |
| TableCell | name | Option<String> | 셀 이름 |
| TableCell | header | bool | 머리글 셀 |
| TableCell | protect | bool | 셀 보호 |
| TableCell | editable | bool | 셀 편집 가능 |
| Caption | last_width | Option<HwpUnit> | 마지막 폭 |
| ParaShape | text_dir | Option<TextDirection> | LTR/RTL |
| ParaShape | suppress_line_numbers | Option<bool> | 줄번호 억제 |
| Style | lock_form | Option<bool> | 양식 잠금 |
| BorderFill | break_cell_separate_line | Option<bool> | 셀 분리선 끊기 |

## 7.3 양쪽에 있지만 표현이 다른 것

변환 로직이 필요한 항목:

| 영역 | HWP 5.0 | HWPX | 변환 |
|------|---------|------|------|
| 색상 | COLORREF (0x00BBGGRR) | #RRGGBB 문자열 | 바이트 순서 변환 |
| 속성 플래그 | UINT32 비트마스크 | 개별 XML 속성/요소 | 비트 추출 ↔ 속성 설정 |
| 텍스트 | WCHAR[] + 위치 토큰 | `<run><t>` 트리 | 위치 분할 ↔ 병합 |
| 글자 모양 적용 | ParaCharShape (position→ID) | run@charPrIDRef | 위치 → run 분할 |
| 표 구조 | 평면 셀 배열 | `<tr><tc>` 계층 | 좌표 그룹핑 ↔ 평면화 |
| 개체 속성 | CtrlHeader + ObjectCommon 분산 | AbstractShapeObjectType 통합 | 합치기 ↔ 분리 |
| Grid 값 | HWPUNIT16 (0=off, n=간격) | 0/1 boolean | 간격 → bool, bool → 기본간격 |
| 용지 방향 | bit (0/1) | PORTRAIT/LANDSCAPE/WIDELY | WIDELY는 HWPX 확장 |
| 필드 명령어 | WCHAR[] (파싱 필요) | parameters (구조화) | 문자열 파싱 ↔ 구조화 |
