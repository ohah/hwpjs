# PDF 뷰어 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 현재 뷰어 구조(HTML/Markdown)를 유지한 채, HWP 문서를 PDF 바이트(`Vec<u8>`)로 변환하는 `to_pdf` API를 추가한다.

**Architecture:** PDF는 **Renderer 트레이트를 구현하지 않는다**. Renderer는 모든 메서드가 `String`을 반환하므로, 바이너리 출력인 PDF에는 맞지 않는다. 대신 **HTML 뷰어와 동일한 패턴**을 따른다: `viewer/pdf/` 모듈에서 `to_pdf(document, options) -> Vec<u8>`를 제공하고, `document.body_text`를 직접 순회하며 genpdf에 요소를 추가한다. 공통 로직(문단/테이블/이미지 추출)은 기존 document 타입을 그대로 사용하고, 필요한 경우 HTML 뷰어의 헬퍼(예: 스타일, 페이지 정의)를 참고할 수 있다.

**Tech Stack:** Rust, genpdf (high-level PDF 생성, printpdf 기반, 순수 Rust), 기존 hwp-core document/ 루트.

---

## 설계 요약

| 항목 | 선택 |
|------|------|
| Renderer 구현 여부 | 아니오. PDF는 `to_pdf() -> Vec<u8>` 전용 진입점만 제공. |
| 본문 처리 | `process_bodytext` 미사용. HTML처럼 body_text 직접 순회. |
| PDF 라이브러리 | genpdf (레이아웃/폰트/이미지 지원, 문서형 출력에 적합). |
| 옵션 타입 | `PdfOptions` (폰트 경로, 이미지 포함 여부 등). |

---

### Task 1: hwp-core에 genpdf 의존성 추가

**Files:**
- Modify: `crates/hwp-core/Cargo.toml`

**Step 1: genpdf 의존성 추가**

`[dependencies]`에 다음 추가:

```toml
genpdf = "0.2"
```

**Step 2: 빌드 확인**

Run: `cd crates/hwp-core && cargo build`
Expected: 컴파일 성공

**Step 3: Commit**

```bash
git add crates/hwp-core/Cargo.toml
git commit -m "chore(core): add genpdf dependency for PDF viewer"
```

---

### Task 2: PdfOptions 및 to_pdf 스텁 추가

**Files:**
- Modify: `crates/hwp-core/src/viewer/pdf/mod.rs`
- Modify: `crates/hwp-core/src/viewer/mod.rs`
- Modify: `crates/hwp-core/src/lib.rs` (필요 시 pdf 모듈이 이미 viewer에 포함되어 있으면 생략)

**Step 1: PdfOptions 정의 및 to_pdf 스텁 작성**

`crates/hwp-core/src/viewer/pdf/mod.rs` 전체를 다음으로 교체:

```rust
//! PDF converter for HWP documents
//! HWP 문서를 PDF로 변환하는 모듈

use crate::document::HwpDocument;

/// PDF 변환 옵션
#[derive(Debug, Clone, Default)]
pub struct PdfOptions {
    /// 기본 폰트으로 사용할 TTF/OTF 경로. None이면 genpdf 기본 폰트 사용.
    pub font_dir: Option<std::path::PathBuf>,
    /// 이미지 임베드 여부 (기본 true)
    pub embed_images: bool,
}

/// HWP 문서를 PDF 바이트로 변환
///
/// # Arguments
/// * `document` - 변환할 HWP 문서
/// * `options` - PDF 변환 옵션
///
/// # Returns
/// PDF 파일 내용 (Vec<u8>). 빈 문서라도 유효한 PDF가 반환됨.
pub fn to_pdf(document: &HwpDocument, options: &PdfOptions) -> Vec<u8> {
    let _ = document;
    minimal_pdf_bytes(options)
}

/// 최소 유효 PDF (빈 페이지 1장) 반환. 스텁/테스트용.
/// 폰트는 options.font_dir 또는 현재 디렉터리에서 LiberationSans 사용.
fn minimal_pdf_bytes(options: &PdfOptions) -> Vec<u8> {
    use genpdf::{elements, fonts, Document};
    use std::path::Path;
    let dir = options
        .font_dir
        .as_deref()
        .unwrap_or(Path::new("."));
    let font = fonts::from_files(dir, "LiberationSans", Some(fonts::Builtin::Helvetica))
        .or_else(|_| fonts::from_files(dir, "Liberation Sans", Some(fonts::Builtin::Helvetica)))
        .expect("font: set font_dir to a path containing LiberationSans TTF files");
    let mut doc = Document::new(font);
    doc.set_title("HWP Export");
    doc.push(elements::Paragraph::new(""));
    let mut output = Vec::new();
    doc.render(&mut output).expect("render");
    output
}
```

**Step 2: viewer/mod.rs에서 to_pdf, PdfOptions re-export**

`crates/hwp-core/src/viewer/mod.rs`에서:

- `pub mod pdf;` 는 이미 있음.
- `pub use pdf::{to_pdf, PdfOptions};` 추가 (html, markdown re-export 다음에).

**Step 3: 빌드 및 테스트**

Run: `cd crates/hwp-core && cargo build`
Expected: 성공

**Step 4: Commit**

```bash
git add crates/hwp-core/src/viewer/pdf/mod.rs crates/hwp-core/src/viewer/mod.rs
git commit -m "feat(core): add PdfOptions and to_pdf stub returning minimal PDF"
```

---

### Task 3: to_pdf가 본문 첫 문단 텍스트를 포함하도록 구현

**Files:**
- Modify: `crates/hwp-core/src/viewer/pdf/mod.rs`
- Create: `crates/hwp-core/src/viewer/pdf/document.rs` (또는 mod 내 인라인으로 처리 가능하면 mod만 수정)

**Step 1: 실패하는 테스트 작성**

`crates/hwp-core/tests/pdf_export.rs` 생성 (모듈 등록은 `tests/snapshot_tests.rs` 또는 별도 상단에 `mod common;` 필요 시 기존 테스트 구조 참고). 기존 테스트들은 `common::find_fixture_file` 사용. 동일 패턴으로:

```rust
// crates/hwp-core/tests/pdf_export.rs
mod common;

use hwp_core::document::HwpDocument;
use hwp_core::viewer::pdf::{to_pdf, PdfOptions};
use std::io::Read;

#[test]
fn to_pdf_returns_valid_pdf_bytes() {
    let path = match common::find_fixture_file("noori.hwp") {
        Some(p) => p,
        None => {
            println!("fixture noori.hwp not found, skipping");
            return;
        }
    };
    let mut f = std::fs::File::open(&path).expect("open fixture");
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).expect("read fixture");
    let doc = HwpDocument::parse(&mut buf.as_slice()).expect("parse");
    let options = PdfOptions::default();
    let pdf = to_pdf(&doc, &options);
    assert!(!pdf.is_empty());
    assert!(pdf.starts_with(b"%PDF"), "PDF magic bytes");
}
```

(다른 fixture가 있으면 `find_fixture_file("table2.hwp")` 등으로 교체 가능.)

**Step 2: 테스트 실행**

Run: `cd crates/hwp-core && cargo test pdf_export`
Expected: fixture가 있으면 `to_pdf_returns_valid_pdf_bytes` 통과. fixture가 없으면 테스트가 skip(return)되어 통과.

**Step 3: to_pdf에서 body_text 첫 문단 텍스트 추출 후 genpdf에 추가**

`crates/hwp-core/src/viewer/pdf/mod.rs`의 `to_pdf`를 수정하여:

- `document.body_text.sections` 를 순회하고, 첫 번째 문단에서 ParaText 레코드만 추출해 텍스트 문자열을 모은 뒤, genpdf 문서에 `elements::Paragraph::new(text)` 형태로 추가.
- 문단/레코드 구조는 `crates/hwp-core/src/document/bodytext/` 타입 참고 (ParagraphRecord::ParaText 등).

구체적 코드는 기존 `paragraph.rs` 또는 markdown/html 쪽 문단 텍스트 추출 방식을 참고하여 동일한 타입으로 텍스트만 얻으면 됨.

**Step 4: 테스트 실행**

Run: `cargo test pdf_export`
Expected: PASS

**Step 5: Commit**

```bash
git add crates/hwp-core/src/viewer/pdf/ crates/hwp-core/tests/
git commit -m "feat(core): render first paragraph text into PDF"
```

---

### Task 4: HwpDocument에 to_pdf 메서드 노출

**Files:**
- Modify: `crates/hwp-core/src/document/mod.rs`

**Step 1: to_pdf 메서드 추가**

`to_html` 메서드 아래에 다음 추가:

```rust
/// Convert HWP document to PDF format
/// HWP 문서를 PDF 형식으로 변환
///
/// # Arguments
/// * `options` - PDF conversion options / PDF 변환 옵션
///
/// # Returns
/// PDF file content as bytes / PDF 파일 바이트
pub fn to_pdf(&self, options: &crate::viewer::pdf::PdfOptions) -> Vec<u8> {
    crate::viewer::to_pdf(self, options)
}
```

**Step 2: 빌드**

Run: `cargo build -p hwp-core`
Expected: 성공

**Step 3: Commit**

```bash
git add crates/hwp-core/src/document/mod.rs
git commit -m "feat(core): expose HwpDocument::to_pdf"
```

---

### Task 5: PDF 본문 전체 순회 (문단/테이블/이미지 골격)

**Files:**
- Modify: `crates/hwp-core/src/viewer/pdf/mod.rs`
- Optional: Create `crates/hwp-core/src/viewer/pdf/paragraph.rs` (문단→genpdf 요소 변환)

**Step 1: 본문 전체 순회 루프 추가**

- `to_pdf` 내부에서 `document.body_text.sections` 의 모든 `paragraphs` 를 순회.
- 각 문단에 대해: ParaText는 텍스트로, 테이블/이미지 컨트롤은 일단 빈 줄 또는 플레이스홀더 문단으로 추가 (나중 작업에서 실제 테이블/이미지 구현).
- HTML 뷰어의 `document.rs`에서 본문 순회하는 방식 참고.

**Step 2: 테스트**

기존 fixture로 `to_pdf` 호출 후 `pdf.len() > 0` 및 `%PDF` 확인. 필요 시 문단 수만큼 내용이 늘어났는지 추가 assertion.

**Step 3: Commit**

```bash
git add crates/hwp-core/src/viewer/pdf/
git commit -m "feat(core): iterate all body paragraphs in PDF export"
```

---

### Task 6 (선택): 테이블/이미지 지원 및 CLI

- **테이블:** genpdf의 테이블 요소 또는 수동 레이아웃으로 `Table` 컨트롤을 셀 단위로 그리기. HTML 뷰어의 테이블 셀 구조 재사용.
- **이미지:** BinData에서 이미지 바이트 추출 후 genpdf 이미지 요소로 추가. `options.embed_images` 로 제어.
- **CLI:** `packages/hwpjs/src-cli/commands/to-pdf.ts` 추가 및 `index.ts`에 `to-pdf` 명령 등록. 출력 경로 인자 받아 파일로 저장.

이 항목들은 MVP 이후 별도 태스크로 쪼개어 진행하는 것을 권장.

---

**테스트·폰트:** 테스트에서는 `tests/fixtures/fonts/`에 폰트 번들을 두고 `find_font_dir()`를 사용하면 자동으로 폰트 경로를 잡을 수 있다.

---

## 참고 파일

- 뷰어 공통: `crates/hwp-core/src/viewer/core/renderer.rs` (Renderer는 PDF에서 사용하지 않음)
- HTML 본문 순회: `crates/hwp-core/src/viewer/html/document.rs`
- 문단/레코드 타입: `crates/hwp-core/src/document/bodytext/` (ParagraphRecord, ParaText 등)
- AGENTS.md 뷰어 확장 가이드: PDF는 “Renderer 구현” 대신 “to_pdf 진입점 + body_text 직접 순회”로 확장

---

## 실행용 프롬프트 (별도 세션에서 사용)

새 채팅을 열고 **executing-plans** 스킬을 사용해 이 계획을 실행할 때, 아래를 복사해 붙여넣으면 된다.

```
Read docs/plans/2025-02-21-pdf-viewer.md. Use superpowers:executing-plans and implement the plan task-by-task. Start from Task 1, run tests/commands as specified, commit after each task. Stop at Task 5 (full body iteration); Task 6 is optional. If font loading fails (LiberationSans), make tests skip when font_dir is missing or document the requirement.
```

---

## 실행 방식 요약

| 방식 | 언제 쓰기 |
|------|-----------|
| **별도 세션 + executing-plans** | 일관성·완성도 우선. 위 프롬프트로 새 세션에서 실행. |
| **Subagent-Driven (이 세션)** | 중간 리뷰·수정을 하면서 진행하고 싶을 때. |
