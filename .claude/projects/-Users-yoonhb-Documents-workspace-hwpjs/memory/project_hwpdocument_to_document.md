---
name: HwpDocument → Document 변환 작업 진행상태
description: hwp-core convert 모듈 작업 상태. Resources 완성, CtrlHeader 변환 구현, 남은 작업.
type: project
---

브랜치: `feat/convert-borderfill-numbering-bullet`
이전 PR: #150 (머지 완료)

## 완료
- convert/mod.rs: 메타데이터, 시작번호, 바이너리(stub) 변환
- convert/resources.rs: 글꼴, 글자모양, 문단모양, 탭, 스타일 변환
- convert/resources.rs: borderFill, numbering, bullet 변환 (2026-03-17)
- convert/section.rs: ParagraphRecord → Run 트리 조립, ParaLineSeg 보존
- **convert/section.rs: CtrlHeader → Control/ShapeObject 변환** (2026-03-17)
  - 표(Table): ObjectCommon + Table → ShapeObject::Table (셀 내부 문단 재귀 변환)
  - 머리글/꼬리말(HeaderFooter): SubList + paragraphs
  - 각주/미주(FootnoteEndnote): Note + SubList
  - 필드(Field): Hyperlink, Bookmark, Formula 등 매핑
  - 단 정의(ColumnDefinition): ColumnControl
  - 자동번호/새번호: AutoNum, NewNum
  - 책갈피, 감추기, 겹침(Compose), 덧말(Dutmal), 숨은설명
  - 미소비 CtrlHeader 처리 (secd/cold 등 부속 제어)
- HWPUNIT → i32 From 트레이트 추가
- 테스트 28개 (22개 HWP fixture 변환 성공)
- 기존 스냅샷 전부 통과

## 다음 해야 할 것

### 1. 도형/그림 변환 (ShapeObject)
- ObjectCommon + ShapeComponent → Picture, Line, Rectangle 등
- 현재 "tbl " ctrl_id만 처리, 나머지 "gso " 미구현

### 2. 바이너리 데이터 전달
- HwpDocument의 BinData는 경로/인덱스만 있고 실제 바이트는 별도
- HwpParser에서 bin_data 바이트를 Document로 전달하는 경로 필요

### 3. viewer를 Document 기준으로 리팩토링
- hwp-core viewer가 HwpDocument 대신 Document를 읽도록
- 기존 스냅샷과 비교하여 출력 동일 검증

**Why:** 뷰어 1개 + 모델 1개 구조
**How to apply:** 현재 브랜치 PR 머지 후 이어서 작업
