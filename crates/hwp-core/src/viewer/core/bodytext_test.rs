/// Viewer core bodytext module unit tests

pub use crate::viewer::core::bodytext::process_bodytext;
pub use crate::HwpDocument;

fn minimal_file_header_bytes() -> Vec<u8> {
    let mut data = vec![0u8; 256];
    data[0..32].copy_from_slice(b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
    data[32..36].copy_from_slice(&0x05000300u32.to_le_bytes());
    data[36..40].copy_from_slice(&0x01u32.to_le_bytes());
    data
}

#[test]
fn test_process_bodytext_empty_document() {
    // Test with minimal valid document structure (FileHeader requires 256 bytes)
    let file_header_data = minimal_file_header_bytes();
    let file_header = crate::document::FileHeader::parse(&file_header_data)
        .unwrap_or_else(|e| panic!("Failed to create FileHeader: {}", e));

    let document = HwpDocument::new(file_header);

    // Process with HTML renderer should not panic with empty document
    let parts = process_bodytext(&document, &crate::viewer::html::HtmlRenderer,
        &crate::viewer::html::HtmlOptions::default());

    // Should return some parts even for empty document
    assert_eq!(parts.body_lines.len(), 0);
    assert_eq!(parts.headers.len(), 0);
    assert_eq!(parts.footers.len(), 0);
    assert_eq!(parts.footnotes.len(), 0);
    assert_eq!(parts.endnotes.len(), 0);
}

#[test]
fn test_process_bodytext_html_renderer_available() {
    // Verify HTML renderer can be used with process_bodytext
    let file_header_data = minimal_file_header_bytes();
    let file_header = crate::document::FileHeader::parse(&file_header_data)
        .unwrap_or_else(|e| panic!("Failed to create FileHeader: {}", e));

    let document = HwpDocument::new(file_header);

    // Should not panic - this tests the trait boundary and renderer integration
    let parts = process_bodytext(&document, &crate::viewer::html::HtmlRenderer,
        &crate::viewer::html::HtmlOptions::default());

    // Verify the function returns a valid result
    for field in &[&parts.body_lines, &parts.headers, &parts.footers, &parts.footnotes, &parts.endnotes] {
        assert!(field.is_empty());
    }
}

#[test]
fn test_process_bodytext_document_parts_default() {
    // Verify default DocumentParts structure
    let parts = crate::viewer::DocumentParts::default();

    assert!(parts.headers.is_empty());
    assert!(parts.body_lines.is_empty());
    assert!(parts.footers.is_empty());
    assert!(parts.footnotes.is_empty());
    assert!(parts.endnotes.is_empty());
}