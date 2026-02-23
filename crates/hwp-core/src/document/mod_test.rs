/// Document module unit tests
pub use crate::FileHeader;
pub use crate::HwpDocument;

#[test]
fn test_hwp_document_fields_accessible() {
    // Test that HwpDocument has all required fields accessible
    let file_header = FileHeader::parse(&vec![0u8; 256]).unwrap_or_else(|_| {
        let mut data = vec![0u8; 256];
        data[0..32].copy_from_slice(b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
        data[32..36].copy_from_slice(&0x05000300u32.to_le_bytes());
        data[36..40].copy_from_slice(&0x01u32.to_le_bytes());
        FileHeader::parse(&data).unwrap_or_else(|e| panic!("Failed to create FileHeader: {}", e))
    });

    let doc = HwpDocument::new(file_header);

    // Ensure we can access all fields without panics
    let _ = &doc.file_header;
    let _ = &doc.doc_info;
    let _ = &doc.body_text;
    let _ = &doc.bin_data;
    let _ = &doc.preview_text;
    let _ = &doc.preview_image;
    let _ = &doc.scripts;
    let _ = &doc.xml_template;
    let _ = &doc.summary_information;
}

#[test]
fn test_hwp_document_serialization_possible() {
    // Test if document can be JSON serialized (structure check)
    let file_header = FileHeader::parse(&vec![0u8; 256]).unwrap_or_else(|_| {
        let mut data = vec![0u8; 256];
        data[0..32].copy_from_slice(b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
        data[32..36].copy_from_slice(&0x05000300u32.to_le_bytes());
        data[36..40].copy_from_slice(&0x01u32.to_le_bytes());
        FileHeader::parse(&data).unwrap_or_else(|e| panic!("Failed to create FileHeader: {}", e))
    });

    let doc = HwpDocument::new(file_header);

    // Verify it's possible to attempt serialization
    let _ = serde_json::to_string(&doc);
}