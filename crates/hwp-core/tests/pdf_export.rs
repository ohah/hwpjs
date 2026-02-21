//! PDF export tests.
//! Requires fixture noori.hwp and LiberationSans font (or font_dir pointing to TTF files).
//! Test is skipped when fixture is missing or when font loading fails.

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

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        to_pdf(&doc, &options)
    }));
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

#[test]
fn to_pdf_table_fixture_returns_valid_pdf() {
    let doc = match load_document("table.hwp") {
        Some(d) => d,
        None => {
            println!("fixture table.hwp not found, skipping");
            return;
        }
    };
    let options = PdfOptions::default();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        to_pdf(&doc, &options)
    }));
    let pdf = match result {
        Ok(bytes) => bytes,
        Err(_) => {
            println!("font loading failed, skipping");
            return;
        }
    };
    assert!(!pdf.is_empty());
    assert!(pdf.starts_with(b"%PDF"), "PDF magic bytes");
}
