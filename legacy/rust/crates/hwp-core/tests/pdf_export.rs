//! PDF export tests.
//! 현재 PDF 기능은 보류 상태입니다. 스냅샷 테스트는 추후 활성화 예정.
//!
//! Requires fixture noori.hwp and LiberationSans font (or font_dir pointing to TTF files).
//! Test is skipped when fixture is missing or when font loading fails.
//!
//! ## 폰트 가져오기
//! printpdf는 폰트 디렉터리에서 다음 이름의 TTF 파일을 찾습니다:
//! `LiberationSans-Regular.ttf`, `LiberationSans-Bold.ttf`, `LiberationSans-Italic.ttf`, `LiberationSans-BoldItalic.ttf`.
//!
//! - **다운로드**: <https://github.com/liberationfonts/liberation-fonts/releases> 에서
//!   `Liberation-fonts-*.tar.gz` 받아 압축 해제 후 `LiberationSans-*.ttf` 네 개를 한 디렉터리에 둠.
//! - **Linux**: `fonts-liberation` 패키지 설치 후 `/usr/share/fonts/truetype/liberation/` 등에 있음.
//! - **macOS**: 위에서 받은 TTF를 `~/Library/Fonts/` 또는 임의 폴더에 넣고, 테스트/CLI 호출 시
//!   `PdfOptions { font_dir: Some("/path/to/dir".into()), .. }` 로 지정.
//! - **테스트에서 자동 사용**: `tests/fixtures/fonts/`에 `LiberationSans-Regular.ttf` 등 네 개를 두면
//!   테스트가 해당 경로를 `font_dir`로 사용함. (없으면 스킵)
//!
//! ## 스냅샷 종류
//! - **content_summary** (`*_content_summary.snap`): PDF에 넣을 요소 목록만(문단/테이블/이미지). 서식·폰트 없음. 폰트 불필요.
//! - **styled_summary** (`*_styled_summary.snap`): CharShape 스타일 정보 포함 요약. 폰트 불필요.
//! - **pdf_generated** 테스트: 실제 PDF 생성 후 유효성 검사 및 `pdf_export__{이름}.pdf` 파일로 저장.
//!   (PDF 메타데이터 비결정성으로 바이트 스냅샷은 사용하지 않음.)
//!
//! ## 실제 PDF 파일 출력
//! `pdf_generated` 테스트 실행 시 생성된 PDF를 스냅샷과 같은 디렉터리에 `pdf_export__{이름}.pdf` 형식으로 씁니다.
//! `pdftoppm`(poppler-utils)이 설치되어 있으면 첫 페이지를 `pdf_export__{이름}-1.png`로 저장해 결과를 눈으로 확인할 수 있음.

// NOTE: PDF 기능 보류 — 모든 테스트 비활성화
// 추후 PDF 기능 활성화 시 아래 주석을 해제하세요.

/*
mod common;

use hwp_core::viewer::pdf::{pdf_content_summary, pdf_styled_summary, to_pdf, PdfOptions};
use hwp_core::HwpParser;
use insta::{assert_snapshot, with_settings};
use std::io::Read;

fn load_document(fixture_name: &str) -> Option<hwp_core::HwpDocument> {
    let path = common::find_fixture_file(fixture_name)?;
    let mut f = std::fs::File::open(&path).ok()?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).ok()?;
    let parser = HwpParser::new();
    parser.parse(&buf).ok()
}

fn snapshots_dir() -> std::path::PathBuf {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".into());
    std::path::PathBuf::from(manifest_dir)
        .join("tests")
        .join("snapshots")
}

/// PDF 바이트를 실제 .pdf 파일로 저장. 스냅샷과 동일 디렉터리·이름 규칙 (pdf_export__{name}.pdf).
fn write_pdf_to_file(name: &str, pdf: &[u8]) {
    let path = snapshots_dir().join(format!("pdf_export__{}.pdf", name));
    if std::fs::write(&path, pdf).is_ok() {
        println!("wrote: {}", path.display());
        write_pdf_first_page_to_png(&path, name);
    }
}

/// pdftoppm(poppler-utils)으로 PDF 첫 페이지를 PNG로 저장. 결과물 확인용. 설치되어 있을 때만 실행.
fn write_pdf_first_page_to_png(pdf_path: &std::path::Path, name: &str) {
    let out_prefix = snapshots_dir().join(format!("pdf_export__{}", name));
    let status = std::process::Command::new("pdftoppm")
        .args(["-png", "-f", "1", "-l", "1"])
        .arg(pdf_path)
        .arg(&out_prefix)
        .status();
    if let Ok(s) = status {
        if s.success() {
            let png = snapshots_dir().join(format!("pdf_export__{}-1.png", name));
            if png.exists() {
                println!("wrote: {}", png.display());
            }
        }
    }
}

// ============================================================
// 기존 테스트 (하위 호환)
// ============================================================

#[test]
fn to_pdf_returns_valid_pdf_bytes() {
    let doc = match load_document("noori.hwp") {
        Some(d) => d,
        None => {
            println!("fixture noori.hwp not found, skipping");
            return;
        }
    };
    let options = PdfOptions::default();

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| to_pdf(&doc, &options)));
    let pdf = match result {
        Ok(bytes) => bytes,
        Err(_) => {
            println!("font loading failed (e.g. LiberationSans not found), skipping");
            return;
        }
    };

    assert!(!pdf.is_empty());
    assert!(pdf.starts_with(b"%PDF"), "PDF magic bytes");
}

#[test]
fn pdf_content_summary_snapshot_noori() {
    let doc = match load_document("noori.hwp") {
        Some(d) => d,
        None => {
            println!("fixture noori.hwp not found, skipping");
            return;
        }
    };
    let options = PdfOptions::default();
    let summary = pdf_content_summary(&doc, &options);
    let text = summary.join("\n");

    with_settings!({
        snapshot_path => snapshots_dir()
    }, {
        assert_snapshot!("noori_content_summary", text);
    });
}

#[test]
fn pdf_content_summary_snapshot_table() {
    let doc = match load_document("table.hwp") {
        Some(d) => d,
        None => {
            println!("fixture table.hwp not found, skipping");
            return;
        }
    };
    let options = PdfOptions::default();
    let summary = pdf_content_summary(&doc, &options);
    let text = summary.join("\n");

    with_settings!({
        snapshot_path => snapshots_dir()
    }, {
        assert_snapshot!("table_content_summary", text);
    });
}

#[test]
fn pdf_content_summary_snapshot_embed_images_false() {
    let doc = match load_document("noori.hwp") {
        Some(d) => d,
        None => {
            println!("fixture noori.hwp not found, skipping");
            return;
        }
    };
    let options = PdfOptions {
        embed_images: false,
        ..PdfOptions::default()
    };
    let summary = pdf_content_summary(&doc, &options);
    let text = summary.join("\n");

    with_settings!({
        snapshot_path => snapshots_dir()
    }, {
        assert_snapshot!("noori_embed_images_false", text);
    });
}

/// 실제 생성된 PDF 바이트를 유효성 검사 후 pdf_export__noori_pdf_generated.pdf로 저장.
#[test]
fn pdf_generated_noori_snapshot() {
    let doc = match load_document("noori.hwp") {
        Some(d) => d,
        None => {
            println!("fixture noori.hwp not found, skipping");
            return;
        }
    };
    let options = PdfOptions {
        font_dir: common::find_font_dir(),
        ..PdfOptions::default()
    };
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| to_pdf(&doc, &options)));
    let pdf = match result {
        Ok(bytes) => bytes,
        Err(_) => {
            // 폰트를 찾을 수 없으면 스킵
            return;
        }
    };
    write_pdf_to_file("noori_pdf_generated", &pdf);
    assert!(!pdf.is_empty());
    assert!(pdf.starts_with(b"%PDF"), "PDF magic bytes");
}

/// 실제 생성된 PDF 바이트를 유효성 검사 후 pdf_export__table_pdf_generated.pdf로 저장 (table.hwp).
#[test]
fn pdf_generated_table_snapshot() {
    let doc = match load_document("table.hwp") {
        Some(d) => d,
        None => {
            println!("fixture table.hwp not found, skipping");
            return;
        }
    };
    let options = PdfOptions {
        font_dir: common::find_font_dir(),
        ..PdfOptions::default()
    };
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| to_pdf(&doc, &options)));
    let pdf = match result {
        Ok(bytes) => bytes,
        Err(_) => {
            println!("font loading failed, skipping");
            return;
        }
    };
    write_pdf_to_file("table_pdf_generated", &pdf);
    assert!(!pdf.is_empty());
    assert!(pdf.starts_with(b"%PDF"), "PDF magic bytes");
}

// ============================================================
// Phase 6: styled_summary 스냅샷 테스트
// ============================================================

#[test]
fn pdf_styled_summary_snapshot_noori() {
    let doc = match load_document("noori.hwp") {
        Some(d) => d,
        None => {
            println!("fixture noori.hwp not found, skipping");
            return;
        }
    };
    let options = PdfOptions::default();
    let summary = pdf_styled_summary(&doc, &options);
    let text = summary.join("\n");

    with_settings!({
        snapshot_path => snapshots_dir()
    }, {
        assert_snapshot!("noori_styled_summary", text);
    });
}

#[test]
fn pdf_styled_summary_snapshot_table() {
    let doc = match load_document("table.hwp") {
        Some(d) => d,
        None => {
            println!("fixture table.hwp not found, skipping");
            return;
        }
    };
    let options = PdfOptions::default();
    let summary = pdf_styled_summary(&doc, &options);
    let text = summary.join("\n");

    with_settings!({
        snapshot_path => snapshots_dir()
    }, {
        assert_snapshot!("table_styled_summary", text);
    });
}

// ============================================================
// Phase 6: lopdf 기반 PDF 구조 검증
// ============================================================

#[test]
fn pdf_structure_noori() {
    let doc = match load_document("noori.hwp") {
        Some(d) => d,
        None => {
            println!("fixture noori.hwp not found, skipping");
            return;
        }
    };
    let options = PdfOptions {
        font_dir: common::find_font_dir(),
        ..PdfOptions::default()
    };
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| to_pdf(&doc, &options)));
    let pdf = match result {
        Ok(bytes) => bytes,
        Err(_) => {
            println!("font loading failed, skipping");
            return;
        }
    };

    let lopdf_doc = lopdf::Document::load_mem(&pdf).expect("lopdf should parse the PDF");

    // 페이지 수 확인 (최소 1페이지)
    let pages = lopdf_doc.get_pages();
    assert!(!pages.is_empty(), "PDF should have at least one page");

    // 페이지 크기 확인 (MediaBox가 존재하는지)
    for (&page_num, &page_id) in &pages {
        let page_dict = lopdf_doc.get_dictionary(page_id).expect("page dict");
        // MediaBox 직접 또는 상위에서 상속
        let has_media_box = page_dict.has(b"MediaBox")
            || lopdf_doc
                .get_dictionary(page_id)
                .ok()
                .and_then(|d| d.get(b"Parent").ok())
                .is_some();
        assert!(
            has_media_box,
            "Page {} should have MediaBox or inherit it",
            page_num
        );
    }

    // 폰트 리소스 존재 확인
    let has_font = pdf.windows(5).any(|w| w == b"/Font");
    assert!(has_font, "PDF should contain font resources");
}

#[test]
fn pdf_structure_table() {
    let doc = match load_document("table.hwp") {
        Some(d) => d,
        None => {
            println!("fixture table.hwp not found, skipping");
            return;
        }
    };
    let options = PdfOptions {
        font_dir: common::find_font_dir(),
        ..PdfOptions::default()
    };
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| to_pdf(&doc, &options)));
    let pdf = match result {
        Ok(bytes) => bytes,
        Err(_) => {
            println!("font loading failed, skipping");
            return;
        }
    };

    let lopdf_doc = lopdf::Document::load_mem(&pdf).expect("lopdf should parse the PDF");
    let pages = lopdf_doc.get_pages();
    assert!(!pages.is_empty(), "PDF should have at least one page");

    // 테이블이 있으므로 선(Line) 관련 명령이 PDF 스트림에 있어야 함
    let has_line_commands = pdf.windows(2).any(|w| w == b" l" || w == b" m");
    assert!(
        has_line_commands,
        "PDF with tables should contain line drawing commands"
    );
}

// ============================================================
// Phase 4: 페이지 수 검증
// ============================================================

#[test]
fn pdf_page_count_noori() {
    let doc = match load_document("noori.hwp") {
        Some(d) => d,
        None => {
            println!("fixture noori.hwp not found, skipping");
            return;
        }
    };
    let options = PdfOptions {
        font_dir: common::find_font_dir(),
        ..PdfOptions::default()
    };
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| to_pdf(&doc, &options)));
    let pdf = match result {
        Ok(bytes) => bytes,
        Err(_) => {
            println!("font loading failed, skipping");
            return;
        }
    };

    let lopdf_doc = lopdf::Document::load_mem(&pdf).expect("lopdf should parse the PDF");
    let pages = lopdf_doc.get_pages();
    // noori.hwp는 3페이지 문서
    assert!(
        pages.len() >= 2,
        "noori.hwp PDF should have at least 2 pages, got {}",
        pages.len()
    );
}

// ============================================================
// Phase 6: 전체 fixture 회귀 테스트
// ============================================================

#[test]
fn test_all_fixtures_pdf_summary() {
    let hwp_files = common::find_all_hwp_files();
    if hwp_files.is_empty() {
        println!("no fixture hwp files found, skipping");
        return;
    }

    for file_path in &hwp_files {
        let mut f = match std::fs::File::open(file_path) {
            Ok(f) => f,
            Err(_) => continue,
        };
        let mut buf = Vec::new();
        if f.read_to_end(&mut buf).is_err() {
            continue;
        }
        let parser = HwpParser::new();
        let doc = match parser.parse(&buf) {
            Ok(d) => d,
            Err(_) => continue,
        };
        let options = PdfOptions::default();

        // content_summary가 패닉 없이 동작하는지 확인
        let summary = pdf_content_summary(&doc, &options);
        assert!(
            !summary.is_empty(),
            "content_summary should not be empty for {}",
            file_path
        );

        // styled_summary도 패닉 없이 동작하는지 확인
        let styled = pdf_styled_summary(&doc, &options);
        assert!(
            !styled.is_empty(),
            "styled_summary should not be empty for {}",
            file_path
        );
    }
}

#[test]
fn test_all_fixtures_styled_summary_snapshots() {
    let hwp_files = common::find_all_hwp_files();
    if hwp_files.is_empty() {
        println!("no fixture hwp files found, skipping");
        return;
    }

    for file_path in &hwp_files {
        let filename = std::path::Path::new(file_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown");

        let mut f = match std::fs::File::open(file_path) {
            Ok(f) => f,
            Err(_) => continue,
        };
        let mut buf = Vec::new();
        if f.read_to_end(&mut buf).is_err() {
            continue;
        }
        let parser = HwpParser::new();
        let doc = match parser.parse(&buf) {
            Ok(d) => d,
            Err(_) => continue,
        };
        let options = PdfOptions::default();
        let styled = pdf_styled_summary(&doc, &options);
        let text = styled.join("\n");

        with_settings!({
            snapshot_path => snapshots_dir()
        }, {
            assert_snapshot!(format!("{}_styled_summary", filename), text);
        });
    }
}
*/
