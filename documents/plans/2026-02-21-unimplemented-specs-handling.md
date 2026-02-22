# 미구현 스펙 처리 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** HWP 5.0 명세 대비 파서/뷰어에서 아직 구현되지 않은 항목(HTML 컨트롤 처리, 글자 모양·개요 번호)을 단계적으로 구현한다.

**Architecture:** (1) HTML 뷰어는 현재 `process_ctrl_header` 내 구역/단/머리말/꼬리말/각주/미주가 TODO로 빈 결과만 반환하므로, 각 모듈에서 자식 문단을 기존 `render_paragraph` 흐름으로 HTML 생성해 반영한다. (2) 공통 문단 처리(`viewer/core/paragraph.rs`)의 글자 모양 수집·적용 및 개요 번호는 Renderer 트레이트와 DocInfo(CharShape, 문단 번호 등)를 활용해 HTML/Markdown 각각에 반영한다.

**Tech Stack:** Rust (hwp-core), 스펙 참조 시 `.cursor/skills/hwp-spec/` 소제목별 스펙 파일, 테스트는 `bun run test:rust` / `bun run test:rust:snapshot`, 스냅샷 검토는 `bun run test:rust:snapshot:review`.

---

## 범위 정리

| 구분 | 항목 | 계획 포함 |
|------|------|-----------|
| HTML 컨트롤 | 구역 정의(section_def), 단 정의(column_def), 머리말(header), 꼬리말(footer), 각주(footnote), 미주(endnote) | ✅ 본 계획 |
| 공통/렌더러 | 글자 모양 수집·적용, 개요 번호 처리 (paragraph.rs TODO) | ✅ 본 계획 |
| 마크다운 | 스타일 적용(제한적), 개요 번호 형식 | ✅ 글자 모양·개요 번호와 함께 |
| 알 수 없는 Ctrl ID / FIELD_UNKNOWN / ShapeComponentUnknown | 조사·필요 시 파싱 | ❌ 별도 조사 후 백로그 |
| 캡션 파싱 (HWPTAG_CAPTION) | caption.rs dead_code 해제 | ❌ 별도 작업 |
| Canvas/PDF 뷰어 | 미구현 | ❌ 별도 계획 참조 (예: documents/plans/2025-02-21-pdf-viewer.md) |

---

## Task 1: 각주/미주 HTML 렌더링 (footnote / endnote)

**목적:** HTML 뷰어에서 각주·미주 컨트롤을 만나면 본문에 각주/미주 참조와 문서 말미에 각주/미주 내용 블록을 출력한다.

**참조 스펙:** `@.cursor/skills/hwp-spec/4-3-10-4-각주-미주.md`

**Files:**
- Modify: `crates/hwp-core/src/viewer/html/ctrl_header/footnote.rs`
- Modify: `crates/hwp-core/src/viewer/html/ctrl_header/endnote.rs`
- Modify: `crates/hwp-core/src/viewer/html/ctrl_header/mod.rs` (필요 시 각주/미주 결과를 문서 레벨로 전달하는 방식 결정)
- Test: `crates/hwp-core/tests/` (기존 HTML 스냅샷 또는 새 fixture)

**전제:** HTML 뷰어의 `to_html`이 문단 단위로 `process_ctrl_header`를 호출하므로, 각주/미주는 해당 문단 내에서 “참조용 마크업”과 “내용용 HTML”을 구분해 반환하거나, 문서 레벨 상태(예: `Vec<String>` footnotes/endnotes)에 누적한 뒤 body 끝에 삽입하는 방식 중 하나로 구현한다. (core/bodytext.rs의 DocumentParts 패턴 참고.)

**Step 1: 각주/미주용 fixture 또는 기존 fixture 확인**

- `crates/hwp-core/tests/fixtures/`에 각주/미주가 포함된 HWP가 있으면 사용, 없으면 최소한의 각주/미주 HWP를 추가하거나 기존 JSON/HTML 스냅샷으로 기대 출력 정의.

**Step 2: 실패하는 스냅샷 테스트 작성**

- HTML 변환 결과에 각주/미주 영역(예: `ohah-hwpjs-footnotes`, `ohah-hwpjs-endnotes`) 및 본문 내 참조(예: `sup`/`a` 링크)가 포함되도록 기대 스냅샷 작성.
- Run: `bun run test:rust:snapshot`
- Expected: 새 스냅샷 기준이면 통과할 수 있으나, 현재 구현은 빈 결과이므로 “각주/미주 내용 없음” 기준 스냅샷이면 실패하도록 기대값 수정 후 실패 확인.

**Step 3: footnote.rs / endnote.rs에 처리 로직 구현**

- `process_footnote` / `process_endnote`에서 `children` 또는 `paragraphs`에서 문단 목록을 얻어, 기존 HTML 문단 렌더링(예: `super::paragraph::render_paragraph` 또는 동일한 컨텍스트로 문단 순회)을 호출해 HTML 문자열 수집.
- 각주/미주 번호는 호출 측에서 관리할 수 있도록 반환 구조 확장(예: `CtrlHeaderResult`에 `footnote_html: Vec<String>` 등)하거나, 문서 레벨 상태로 넘겨서 `to_html`에서 body 끝에 `<div class="ohah-hwpjs-footnotes">` 등으로 붙인다.

**Step 4: to_html에서 각주/미주 블록 출력**

- `crates/hwp-core/src/viewer/html/document.rs`의 `to_html`에서 문단 처리 시 각주/미주 결과를 수집하고, `<body>` 닫기 전에 각주/미주용 `<div>`를 추가.

**Step 5: 테스트 및 스냅샷 검토**

- Run: `bun run test:rust` then `bun run test:rust:snapshot`
- Run: `bun run test:rust:snapshot:review` 로 스냅샷 승인.

**Step 6: Commit**

```bash
git add crates/hwp-core/src/viewer/html/ctrl_header/footnote.rs crates/hwp-core/src/viewer/html/ctrl_header/endnote.rs crates/hwp-core/src/viewer/html/document.rs crates/hwp-core/tests/
git commit -m "feat(core): render footnote and endnote content in HTML viewer"
```

---

## Task 2: 머리말/꼬리말 HTML 렌더링 (header / footer)

**목적:** HTML 뷰어에서 머리말/꼬리말 컨트롤을 만나면 해당 영역 내용을 HTML로 출력한다.

**참조 스펙:** `@.cursor/skills/hwp-spec/4-3-10-3-머리말-꼬리말.md`

**Files:**
- Modify: `crates/hwp-core/src/viewer/html/ctrl_header/header.rs`
- Modify: `crates/hwp-core/src/viewer/html/ctrl_header/footer.rs`
- Modify: `crates/hwp-core/src/viewer/html/document.rs` (머리말/꼬리말을 `<body>` 상단/하단 또는 페이지 레이아웃에 반영)
- Test: `crates/hwp-core/tests/`

**Step 1: 머리말/꼬리말 fixture 확인**

- fixtures에 머리말/꼬리말이 있는 HWP 확인. 없으면 최소 fixture 추가 또는 기존 스냅샷으로 기대 출력 정의.

**Step 2: 실패하는 스냅샷 또는 단위 테스트 작성**

- HTML에 머리말/꼬리말 영역(예: `ohah-hwpjs-header`, `ohah-hwpjs-footer`)이 포함되도록 기대값 설정 후 실행해 실패 확인.

**Step 3: header.rs / footer.rs 구현**

- `process_header` / `process_footer`에서 자식 문단 또는 ctrl_paragraphs를 기존 문단 렌더링 경로로 HTML 변환해 반환.

**Step 4: to_html에서 머리말/꼬리말 삽입**

- `document.rs`의 `to_html`에서 머리말/꼬리말 결과를 수집해 `<body>` 내 적절한 위치(상단/하단)에 출력.

**Step 5: 테스트 및 스냅샷 검토**

- Run: `bun run test:rust` then `bun run test:rust:snapshot` then `bun run test:rust:snapshot:review`

**Step 6: Commit**

```bash
git add crates/hwp-core/src/viewer/html/ctrl_header/header.rs crates/hwp-core/src/viewer/html/ctrl_header/footer.rs crates/hwp-core/src/viewer/html/document.rs crates/hwp-core/tests/
git commit -m "feat(core): render header and footer content in HTML viewer"
```

---

## Task 3: 구역 정의 / 단 정의 HTML 처리 (section_def / column_def)

**목적:** 구역 정의·단 정의 컨트롤이 나왔을 때 HTML에서 시각적으로 구역/단 구분을 반영하거나, 최소한 자식 문단은 기존과 동일하게 렌더링되도록 한다. (레이아웃이 복잡하면 먼저 “자식 문단만 출력”으로 통과시키고, 구역/단 스타일은 후속 작업으로 확장 가능.)

**참조 스펙:** `@.cursor/skills/hwp-spec/4-3-10-1-구역-정의.md`, `@.cursor/skills/hwp-spec/4-3-10-2-단-정의.md`

**Files:**
- Modify: `crates/hwp-core/src/viewer/html/ctrl_header/section_def.rs`
- Modify: `crates/hwp-core/src/viewer/html/ctrl_header/column_def.rs`
- Modify: `crates/hwp-core/src/viewer/html/ctrl_header/mod.rs` (필요 시)
- Test: `crates/hwp-core/tests/`

**Step 1: 구역/단 fixture 확인**

- 구역 정의·단 정의가 포함된 HWP가 있으면 사용, 없으면 선택적으로 fixture 추가.

**Step 2: section_def / column_def 처리 로직 추가**

- `process_section_def` / `process_column_def`에서 자식 문단(children 또는 ctrl_paragraphs)을 기존 문단 렌더링으로 HTML 변환해 `CtrlHeaderResult`에 반영. (내부에 테이블/이미지가 있으면 기존 table/shape_object 처리와 동일하게 동작하도록 호출 경로 유지.)

**Step 3: 테스트 및 스냅샷**

- Run: `bun run test:rust` then `bun run test:rust:snapshot` then `bun run test:rust:snapshot:review`

**Step 4: Commit**

```bash
git add crates/hwp-core/src/viewer/html/ctrl_header/section_def.rs crates/hwp-core/src/viewer/html/ctrl_header/column_def.rs crates/hwp-core/tests/
git commit -m "feat(core): render section and column definition content in HTML viewer"
```

---

## Task 4: 글자 모양 정보 수집 및 공통 문단 처리에 반영

**목적:** `viewer/core/paragraph.rs`의 TODO “글자 모양 정보 수집 및 적용”을 구현한다. ParaText 레코드에서 CharShape 정보를 수집하고, Renderer의 `render_text`/`render_bold` 등에 전달할 수 있는 형태로 공통 처리한다.

**참조 스펙:** `@.cursor/skills/hwp-spec/4-3-3-문단의-글자-모양.md`, `@.cursor/skills/hwp-spec/4-2-6-글자-모양.md`. DocInfo: `document.doc_info.char_shapes`.

**Files:**
- Modify: `crates/hwp-core/src/viewer/core/paragraph.rs`
- Modify: `crates/hwp-core/src/document/bodytext/para_text.rs` (필요 시 ParaText에 char_shape_index 등 노출)
- Modify: `crates/hwp-core/src/viewer/html/text.rs` (또는 HTML 쪽에서 글자 모양 → span 스타일 매핑)
- Modify: `crates/hwp-core/src/viewer/markdown/document/bodytext/para_text.rs` (마크다운 스타일 적용)
- Test: `crates/hwp-core/tests/`

**Step 1: ParaText와 CharShape 연결 확인**

- 문단의 ParaText 레코드에 글자 모양 ID(또는 인덱스)가 어떻게 붙는지 `para_text.rs` 및 스펙 4.3.2/4.3.3 확인. 필요 시 `ParagraphRecord::ParaText`에 `char_shape_indices: Vec<u32>` 또는 동등한 필드 추가.

**Step 2: 실패하는 테스트 작성**

- “굵게/기울임/밑줄 등이 적용된 문단” fixture로 HTML/Markdown 변환 결과에 해당 태그 또는 클래스가 포함되도록 기대값 작성 후 실패 확인.

**Step 3: process_paragraph에서 글자 모양 단위로 텍스트 분할**

- `paragraph.rs`에서 ParaText 순회 시 글자 모양 경계마다 텍스트를 나누고, `document.doc_info.char_shapes`에서 CharShape를 조회해 `TextStyles`(또는 Renderer가 받을 구조)로 변환한 뒤 `renderer.render_text(text, &styles)` 등 호출.

**Step 4: HTML 렌더러에서 TextStyles → span 스타일**

- `viewer/html/text.rs`(또는 해당 모듈)에서 `render_text`/`render_bold` 등이 호출되면 `<span style="...">` 또는 클래스로 반영되도록 구현.

**Step 5: Markdown 렌더러에서 TextStyles → 마크다운 문법**

- `viewer/markdown/` 쪽에서 굵게(`**`), 기울임(`*`), 밑줄 등 제한적으로 적용.

**Step 6: 테스트 및 스냅샷**

- Run: `bun run test:rust` then `bun run test:rust:snapshot` then `bun run test:rust:snapshot:review`

**Step 7: Commit**

```bash
git add crates/hwp-core/src/viewer/core/paragraph.rs crates/hwp-core/src/viewer/html/text.rs crates/hwp-core/src/viewer/markdown/ crates/hwp-core/src/document/bodytext/para_text.rs crates/hwp-core/tests/
git commit -m "feat(core): apply character shape (bold/italic/underline) in paragraph rendering"
```

---

## Task 5: 개요 번호 처리 (공통 + HTML/Markdown)

**목적:** `viewer/core/paragraph.rs`의 TODO “개요 번호 처리 (렌더러별로 다름)”를 구현한다. 문단 리스트 헤더/문단 번호 정보를 사용해 HTML/Markdown에서 목차 번호를 출력한다.

**참조 스펙:** `@.cursor/skills/hwp-spec/4-2-8-문단-번호.md`, `@.cursor/skills/hwp-spec/4-3-7-문단-리스트-헤더.md`. 기존 `viewer/markdown/utils::OutlineNumberTracker` 참고.

**Files:**
- Modify: `crates/hwp-core/src/viewer/core/paragraph.rs`
- Modify: `crates/hwp-core/src/viewer/html/paragraph.rs` 또는 HTML 쪽 개요 번호 출력 위치
- Modify: `crates/hwp-core/src/viewer/markdown/renderer.rs` (TODO “개요 번호 형식 적용”)
- Test: `crates/hwp-core/tests/`

**Step 1: 문단 번호/리스트 헤더 데이터 구조 확인**

- `Paragraph`의 `para_header` 및 `ParagraphRecord::ListHeader` 등에서 개요 레벨·번호 정보가 어디에 있는지 확인.

**Step 2: 실패하는 테스트 작성**

- 개요 번호가 있는 문단 fixture로 HTML/Markdown에 “1.”, “1.1.” 등 번호가 나오도록 기대값 설정 후 실패 확인.

**Step 3: 공통 paragraph 처리에서 개요 번호 문자열 생성**

- `process_paragraph` 호출 전 또는 문단 내용 앞에, DocInfo 문단 번호 정의와 리스트 헤더를 이용해 “1.”, “1.1.” 형태 문자열을 생성. (Markdown용 OutlineNumberTracker와 유사한 로직을 공통화하거나 HTML에서도 사용할 수 있게 트레이트/헬퍼로 분리.)

**Step 4: HTML에서 개요 번호 출력**

- 문단 렌더 시 개요 번호를 `<span class="ohah-hwpjs-outline-number">` 등으로 앞에 붙인다.

**Step 5: Markdown에서 개요 번호 형식 적용**

- `markdown/renderer.rs`의 개요 번호 TODO를 제거하고, 기존 OutlineNumberTracker와 연동해 마크다운 목차 번호 출력.

**Step 6: 테스트 및 스냅샷**

- Run: `bun run test:rust` then `bun run test:rust:snapshot` then `bun run test:rust:snapshot:review`

**Step 7: Commit**

```bash
git add crates/hwp-core/src/viewer/core/paragraph.rs crates/hwp-core/src/viewer/html/paragraph.rs crates/hwp-core/src/viewer/markdown/renderer.rs crates/hwp-core/tests/
git commit -m "feat(core): render outline numbers in HTML and Markdown viewers"
```

---

## 실행 순서 권장

1. Task 1 (각주/미주) → Task 2 (머리말/꼬리말) → Task 3 (구역/단) : HTML 컨트롤 처리.
2. Task 4 (글자 모양) → Task 5 (개요 번호) : 공통 문단 + HTML/Markdown.

Task 1~3은 서로 독립에 가깝고, Task 4와 5는 공통 paragraph 변경을 공유하므로 4 → 5 순서를 권장한다.

---

## 참고

- **스펙 참조:** 구현 시 해당 소제목의 `.cursor/skills/hwp-spec/*.md` 파일을 읽어 표·필드 정의를 따른다. (AGENTS.md 및 hwp-spec 스킬)
- **테스트:** `crates/hwp-core/tests/fixtures/` 의 HWP, `tests/snapshots/` 의 스냅샷, `common::find_fixture_file()` 사용. (AGENTS.md)
- **커밋 규칙:** 단일 목적, 논리적 분리. (AGENTS.md 커밋 규칙)

---

## 실행 옵션 (Execution Handoff)

계획 작성이 완료되었으며 `documents/plans/2026-02-21-unimplemented-specs-handling.md`에 저장했습니다. 실행 방식은 두 가지입니다.

**1. 서브에이전트 방식 (이 세션)**  
작업별로 새 서브에이전트를 호출하고, 태스크 사이에 코드 리뷰를 하며 진행합니다.  
- **필수 서브스킬:** superpowers:subagent-driven-development  
- 이 세션에서 태스크 단위로 디스패치 후 검토.

**2. 별도 세션 (병렬)**  
새 채팅에서 실행 계획 스킬로 배치 실행하고, 체크포인트마다 검토합니다.  
- 새 세션을 worktree에서 열고, **필수 서브스킬:** superpowers:executing-plans 사용.

원하는 방식을 선택해 주세요.
