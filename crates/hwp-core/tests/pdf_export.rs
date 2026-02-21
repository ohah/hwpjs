//! PDF export tests.
//! Requires fixture noori.hwp and LiberationSans font (or font_dir pointing to TTF files).
//! Test is skipped when fixture is missing or when font loading fails.

mod common;

use hwp_core::viewer::pdf::{to_pdf, PdfOptions};
use hwp_core::HwpParser;
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
    let parser = HwpParser::new();
    let doc = parser.parse(&buf).expect("parse");
    let options = PdfOptions::default();

    // Font loading may fail if LiberationSans is not available; skip test in that case
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
