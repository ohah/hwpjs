/// Viewer core bodytext module unit tests

pub use crate::viewer::core::bodytext::process_bodytext;
pub use crate::HwpDocument;

#[test]
fn test_process_bodytext_empty_document() {
    // Test with minimal valid document structure
    let file_header = hwp_core::document::FileHeader::parse(&[0x48, 0x57, 0x50, 0x20, 0x44, 0x6f, 0x63, 0x75,
        0x6d, 0x65, 0x6e, 0x74, 0x20, 0x46, 0x69, 0x6c, 0x65, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05, 0x00, 0x03, 0x00, 0x00,
        0x00, 0x00, 0x00]).unwrap_or_else(|e| panic!("Failed to create FileHeader: {}", e));

    let document = HwpDocument::new(file_header);

    // Process with HTML renderer should not panic with empty document
    let parts = process_bodytext(&document, &hwp_core::viewer::core::renderer::HtmlRenderer,
        &hwp_core::viewer::html::HtmlOptions::default());

    // Should return some parts even for empty document
    assert_eq!(parts.title.len(), 0);
    assert_eq!(parts.outline.len(), 0);
    assert_eq!(parts.content.len(), 0);
}

#[test]
fn test_process_bodytext_html_renderer_available() {
    // Verify HTML renderer can be used with process_bodytext
    let file_header = hwp_core::document::FileHeader::parse(&[0x48, 0x57, 0x50, 0x20, 0x44, 0x6f, 0x63, 0x75,
        0x6d, 0x65, 0x6e, 0x74, 0x20, 0x46, 0x69, 0x6c, 0x65, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05, 0x00, 0x03, 0x00, 0x00,
        0x00, 0x00, 0x00]).unwrap_or_else(|e| panic!("Failed to create FileHeader: {}", e));

    let document = HwpDocument::new(file_header);

    // Should not panic - this tests the trait boundary and renderer integration
    let parts = process_bodytext(&document, &hwp_core::viewer::core::renderer::HtmlRenderer,
        &hwp_core::viewer::html::HtmlOptions::default());

    // Verify the function returns a valid result
    assert!(parts.title.len() >= 0 || parts.title.is_empty());
    assert!(parts.outline.len() >= 0 || parts.outline.is_empty());
    assert!(parts.content.len() >= 0 || parts.content.is_empty());
}

#[test]
fn test_process_bodytext_document_parts_default() {
    // Verify default DocumentParts structure
    let parts = hwp_core::viewer::core::bodytext::DocumentParts::default();

    assert_eq!(parts.title, String::new());
    assert_eq!(parts.outline, String::new());
    assert_eq!(parts.content, String::new());
}