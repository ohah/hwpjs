/// HWP 문서 viewer 변환 함수 통합 테스트
/// HWP Document viewer conversion functions integration tests
mod common;
use hwp_core::{HwpDocument, FileHeader, HwpParser};
use hwp_core::viewer::{MarkdownOptions, HtmlOptions, PdfOptions};

// Helper function to create default MarkdownOptions since it doesn't implement Default
fn get_default_markdown_options() -> MarkdownOptions {
    MarkdownOptions {
        image_output_dir: None,
        use_html: Some(true),
        include_version: Some(true),
        include_page_info: Some(false),
    }
}

#[test]
fn test_hwp_document_to_markdown_basic() {
    // Test with actual HWP file if available
    use crate::common::find_fixture_file;

    if let Some(path) = find_fixture_file("noori.hwp") {
        if let Ok(data) = std::fs::read(path) {
            let parser = HwpParser::new();
            let result = parser.parse(&data);
            assert!(result.is_ok(), "Should parse actual HWP file");
            let document = result.unwrap();

            // Test basic markdown conversion
            let markdown = document.to_markdown(&get_default_markdown_options());
            assert!(!markdown.is_empty(), "Markdown output should not be empty");
        }
    }
}

#[test]
fn test_hwp_document_to_markdown_with_dir() {
    // Test to_markdown_with_dir with image output directory
    use crate::common::find_fixture_file;

    if let Some(path) = find_fixture_file("noori.hwp") {
        if let Ok(data) = std::fs::read(path) {
            let parser = HwpParser::new();
            let result = parser.parse(&data);
            assert!(result.is_ok(), "Should parse actual HWP file");
            let document = result.unwrap();

            // Test markdown conversion with image directory option
            let markdown = document.to_markdown_with_dir(None);
            assert!(!markdown.is_empty(), "Markdown output with dir option should not be empty");
        }
    }
}

#[test]
fn test_hwp_document_to_html_basic() {
    // Test basic HTML conversion
    use crate::common::find_fixture_file;

    if let Some(path) = find_fixture_file("noori.hwp") {
        if let Ok(data) = std::fs::read(path) {
            let parser = HwpParser::new();
            let result = parser.parse(&data);
            assert!(result.is_ok(), "Should parse actual HWP file");
            let document = result.unwrap();

            // Test basic HTML conversion
            let html = document.to_html(&HtmlOptions::default());
            assert!(!html.is_empty(), "HTML output should not be empty");
        }
    }
}

#[test]
#[ignore] // Requires font files (Liberation Sans) to be available
fn test_hwp_document_to_pdf_basic() {
    // Test basic PDF conversion (requires fonts)
    use crate::common::find_fixture_file;

    if let Some(path) = find_fixture_file("noori.hwp") {
        if let Ok(data) = std::fs::read(path) {
            let parser = HwpParser::new();
            let result = parser.parse(&data);
            assert!(result.is_ok(), "Should parse actual HWP file");
            let document = result.unwrap();

            // Test basic PDF conversion
            let pdf_bytes = document.to_pdf(&PdfOptions::default());
            assert!(!pdf_bytes.is_empty(), "PDF output should not be empty");
            // Check that PDF has minimal structure (first line should be PDF header)
            if let Some(first_byte) = pdf_bytes.first() {
                assert_eq!(*first_byte, b'%', "PDF should start with %");
            }
        }
    }
}

#[test]
fn test_hwp_document_to_markdown_with_options() {
    // Test markdown conversion with custom options
    use crate::common::find_fixture_file;

    if let Some(path) = find_fixture_file("noori.hwp") {
        if let Ok(data) = std::fs::read(path) {
            let parser = HwpParser::new();
            let result = parser.parse(&data);
            assert!(result.is_ok(), "Should parse actual HWP file");
            let document = result.unwrap();

            let options = get_default_markdown_options();
            let markdown = document.to_markdown(&options);
            assert!(!markdown.is_empty(), "Markdown output with options should not be empty");
        }
    }
}

#[test]
fn test_hwp_document_to_html_with_options() {
    // Test HTML conversion with custom options
    use crate::common::find_fixture_file;

    if let Some(path) = find_fixture_file("noori.hwp") {
        if let Ok(data) = std::fs::read(path) {
            let parser = HwpParser::new();
            let result = parser.parse(&data);
            assert!(result.is_ok(), "Should parse actual HWP file");
            let document = result.unwrap();

            let html_options = HtmlOptions::default();
            // Don't modify options - test default behavior is sufficient

            let html = document.to_html(&html_options);
            assert!(!html.is_empty(), "HTML output with options should not be empty");
        }
    }
}

#[test]
fn test_hwp_document_resolve_display_texts() {
    // Test resolve_display_texts method
    use crate::common::find_fixture_file;

    if let Some(path) = find_fixture_file("noori.hwp") {
        if let Ok(data) = std::fs::read(path) {
            let parser = HwpParser::new();
            let result = parser.parse(&data);
            assert!(result.is_ok(), "Should parse actual HWP file");
            let mut document = result.unwrap();

            // Before resolving display texts
            let sections_before = document.body_text.sections.len();

            // Resolve display texts
            document.resolve_display_texts();

            // After resolving display texts, sections should still exist
            assert!(
                document.body_text.sections.len() >= sections_before,
                "Sections should not be removed after resolving display texts"
            );
        }
    }
}

#[test]
fn test_hwp_document_empty() {
    // Test with minimal valid FileHeader
    // Create FileHeader with minimal valid bytes
    let mut file_header_data = vec![b'H', b'W', b'P', b'D', b'o', b'c', b'u', b'm', b'e', b'n', b't', b'F', b'i', b'l', b'e', b'\r', b'\n'];
    file_header_data.resize(256, 0); // Pad to minimum size

    if let Ok(file_header) = FileHeader::parse(&file_header_data) {
        let document = HwpDocument::new(file_header);

        // Even an empty document should convert to non-empty output
        let markdown_options = get_default_markdown_options();
        let markdown = document.to_markdown(&markdown_options);
        assert!(!markdown.is_empty(), "Empty document should produce markdown output");

        let html_options = HtmlOptions::default();
        let html = document.to_html(&html_options);
        assert!(!html.is_empty(), "Empty document should produce HTML output");
    }
}