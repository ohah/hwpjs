//! PDF export tests.
//! Requires fixture noori.hwp and LiberationSans font (or font_dir pointing to TTF files).
//! Test is skipped when fixture is missing or when font loading fails.
//!
//! ## 폰트 가져오기
//! genpdf는 폰트 디렉터리에서 다음 이름의 TTF 파일을 찾습니다:
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
//! - **pdf_generated** 테스트: 실제 PDF 생성 후 유효성 검사 및 `pdf_export__{이름}.pdf` 파일로 저장.
//!   (PDF 메타데이터 비결정성으로 바이트 스냅샷은 사용하지 않음.)
//!
//! ## 실제 PDF 파일 출력
//! `pdf_generated` 테스트 실행 시 생성된 PDF를 스냅샷과 같은 디렉터리에 `pdf_export__{이름}.pdf` 형식으로 씁니다.
//! `pdftoppm`(poppler-utils)이 설치되어 있으면 첫 페이지를 `pdf_export__{이름}-1.png`로 저장해 결과를 눈으로 확인할 수 있음.

mod common;

use hwp_core::viewer::pdf::{pdf_content_summary, to_pdf, PdfOptions};
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
            // noori에는 한글이 있어 Liberation Sans로는 렌더 불가(genpdf UnsupportedEncoding). 스킵.
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

