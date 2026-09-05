# 4. Paragraph 매핑 (문단/Run/텍스트/제어문자/범위태그)

## 4.1 문단 (ParaHeader / p)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 문단 ID | instance_id (UINT32) | p@id | 직접 매핑 |
| 문단 모양 ID | para_shape_id (UINT16) | p@paraPrIDRef | 직접 매핑 |
| 스타일 ID | para_style_id (UINT8) | p@styleIDRef | 직접 매핑 |
| 쪽 나누기 | column_divide_type bit (Page) | p@pageBreak (0/1) | 직접 매핑 |
| 단 나누기 | column_divide_type bit (Column) | p@columnBreak (0/1) | 직접 매핑 |
| 구역 나누기 | column_divide_type bit (Section) | secPr 요소로 처리 | 구조 차이 |
| 병합 문단 | section_merge (5.0.3.2+) | p@merged (0/1) | 변경 추적 |
| 변경추적 ID | (없음) | p@paraTcId | HWPX only |
| 메타태그 | (없음) | p > metaTag (JSON) | HWPX only |
| 텍스트 문자 수 | text_char_count (UINT32) | (run 텍스트 길이 합산) | HWP 파싱용 |
| 글자 모양 정보 수 | char_shape_count (UINT16) | (run 개수로 유추) | HWP 파싱용 |
| 범위 태그 수 | range_tag_count (UINT16) | (마크업 요소 개수) | HWP 파싱용 |
| 줄 정보 수 | line_align_count (UINT16) | 대응 없음 | HWP only → hints |

## 4.2 텍스트 표현 구조 비교

### HWP 5.0: 평면 레코드

```
ParaHeader
├── PARA_TEXT:       WCHAR[] (텍스트 + 제어문자 0-31)
├── PARA_CHAR_SHAPE: [{position, shape_id}] (위치 기반)
├── PARA_LINE_SEG:   [{...레이아웃...}] (뷰어 캐시)
└── PARA_RANGE_TAG:  [{start, end, type, data}] (범위)
```

### HWPX: 트리 구조

```xml
<p id="" paraPrIDRef="" styleIDRef="">
  <run charPrIDRef="">
    <t>텍스트<tab/><lineBreak/>텍스트</t>
  </run>
  <run charPrIDRef="">
    <ctrl><autoNum/></ctrl>
  </run>
  <run charPrIDRef="">
    <tbl>...</tbl>
  </run>
</p>
```

### 공통 모델: HWPX 트리 기준

```rust
Paragraph {
    runs: Vec<Run>,
}
Run {
    char_shape_id: u16,
    contents: Vec<RunContent>,
}
enum RunContent {
    Text(TextContent),
    Control(Control),
    Object(ShapeObject),
}
```

## 4.3 글자 모양 적용 방식

| 방식 | HWP 5.0 | HWPX | 변환 |
|------|---------|------|------|
| 적용 단위 | 위치(position) → 모양ID | run@charPrIDRef | |
| HWP → 모델 | ParaCharShape의 position 경계에서 텍스트 분할 → Run[] 생성 | - | 위치 기반 분할 |
| 모델 → HWP | Run[]의 charPrIDRef + 텍스트 길이 → ParaCharShape 배열 재구성 | - | 누적 길이 계산 |
| 모델 → HWPX | Run[]을 그대로 `<run charPrIDRef>` 출력 | - | 1:1 |

## 4.4 제어 문자 매핑

### CHAR 타입 (1 WCHAR, 추가 데이터 없음)

| 코드 | 이름 | HWPX | 공통 모델 |
|------|------|------|----------|
| 0x0A | LINE_BREAK | `<lineBreak/>` | TextElement::LineBreak |
| 0x0D | PARA_BREAK | (문단 경계) | (Paragraph 분리) |
| 0x18 | HYPHEN | `<hyphen/>` | TextElement::Hyphen |
| 0x1E | BOUND_SPACE | `<nbSpace/>` | TextElement::NbSpace |
| 0x1F | FIXED_SPACE | `<fwSpace/>` | TextElement::FwSpace |

### INLINE 타입 (8 WCHAR, 파라미터 포함)

| 코드 | 이름 | HWPX | 공통 모델 |
|------|------|------|----------|
| 0x04 | FIELD_END | `<fieldEnd/>` | Control::FieldEnd |
| 0x08 | TITLE_MARK | `<titleMark ignore="">` | TextElement::TitleMark |
| 0x09 | TAB | `<tab width="" leader="" type=""/>` | TextElement::Tab { width, leader, tab_type } |

### EXTENDED 타입 (8 WCHAR, CtrlHeader 참조)

| 코드 | 이름 | HWPX | 공통 모델 |
|------|------|------|----------|
| 0x0B | SHAPE_OBJECT | `<tbl>`, `<pic>`, 도형 등 | RunContent::Object(ShapeObject) |
| 0x0F | HIDDEN_DESC | `<ctrl>` (숨은 설명) | Control::HiddenDesc |
| 0x10 | HEADER_FOOTER | `<ctrl><header/>` / `<footer/>` | Control::Header / Control::Footer |
| 0x11 | FOOTNOTE | `<ctrl><footNote/>` / `<endNote/>` | Control::FootNote / Control::EndNote |
| 0x12 | AUTO_NUMBER | `<ctrl><autoNum/>` | Control::AutoNum |
| 0x15 | PAGE_CONTROL | `<pageNumCtrl/>` | Control::PageNumCtrl |
| 0x16 | BOOKMARK | `<bookmark/>` / `<fieldBegin/>` | Control::Bookmark / Control::FieldBegin |
| 0x17 | COMMENT_OVERLAP | `<compose/>` / `<dutmal/>` | Control::Compose / Control::Dutmal |

## 4.5 범위 태그 (ParaRangeTag)

### HWP 5.0

```
RangeTagInfo (12바이트):
  - start: UINT32 (범위 시작 위치)
  - end: UINT32 (범위 끝 위치)
  - tag: UINT32 (상위 8비트=종류, 하위 24비트=데이터)
```

### HWPX: `<t>` 내부 마크업 요소

| 태그 종류 | HWP type | HWPX | 공통 모델 |
|----------|----------|------|----------|
| 형광펜 | 0x03, data=색상 | `<markpenBegin color=""/>` ... `<markpenEnd/>` | TextElement::MarkpenBegin/End |
| 변경추적 삽입 | 0x01, data=ID | `<insertBegin Id="" TcId=""/>` ... `<insertEnd/>` | TextElement::InsertBegin/End |
| 변경추적 삭제 | 0x02, data=ID | `<deleteBegin Id="" TcId=""/>` ... `<deleteEnd/>` | TextElement::DeleteBegin/End |

### 변환 로직

| 방향 | 처리 |
|------|------|
| HWP → 모델 | RangeTag의 start/end 위치를 텍스트에 삽입하여 Begin/End 요소 생성 |
| 모델 → HWP | Begin/End 요소의 텍스트 내 위치를 계산하여 RangeTag 배열 재구성 |
| 모델 → HWPX | Begin/End 요소를 `<t>` 내부 마크업으로 직접 출력 |

## 4.6 줄 세그먼트 (ParaLineSeg) — HWP only

HWPX에 대응하는 것 없음. hints로 보존.

| 필드 | HWP 5.0 | 용도 |
|------|---------|------|
| text_start_position | UINT32 | 이 줄의 시작 문자 위치 |
| vertical_position | INT32 | 줄의 Y 좌표 (HWPUNIT) |
| line_height | INT32 | 줄 전체 높이 |
| text_height | INT32 | 텍스트만의 높이 |
| baseline_distance | INT32 | 베이스라인까지 거리 |
| line_spacing | INT32 | 줄 간격 |
| column_start_position | INT32 | 단 내 X 위치 |
| segment_width | INT32 | 줄 폭 |
| flags | UINT32 | first_line, last_line, empty_line 등 |

HWP write 시: 기본값으로 채움 (lineHeight=1000, width=42520). 한컴오피스가 재조판.
