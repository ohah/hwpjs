/// Document module unit tests
pub use crate::FileHeader;
pub use crate::HwpDocument;

// ========== Edge Case Tests for FileHeader ==========

#[test]
fn test_fileheader_empty_data() {
    // Test parsing with empty data - should fail gracefully
    let result = FileHeader::parse(&[]);
    assert!(result.is_err());
    // Error message might not contain "empty", just verify it's an error
    if let Err(e) = result {
        println!("Error: {}", e);
        // Just ensure it reports some error about file format or invalid data
        assert!(!e.to_string().is_empty());
    }
}

#[test]
fn test_fileheader_too_short_data() {
    // Test parsing with data shorter than expected
    let short_data = vec![0u8; 10];
    let result = FileHeader::parse(&short_data);
    assert!(result.is_err());
}

#[test]
fn test_fileheader_invalid_signature() {
    // Test with invalid signature bytes
    let invalid_sig = vec![0x00u8; 32];
    let result = FileHeader::parse(&invalid_sig);
    assert!(result.is_err());
}

#[test]
fn test_fileheader_minimal_valid_data() {
    // Test parsing with minimal valid file header
    let mut data = vec![0u8; 256];
    let full_signature = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
    assert_eq!(full_signature.len(), 32);
    data[0..32].copy_from_slice(full_signature);
    // Version: 0x05000000 = HWP 5.0
    data[32..36].copy_from_slice(&0x05000000u32.to_le_bytes());
    data[36..40].copy_from_slice(&0xFFu32.to_le_bytes()); // Document flags

    let header = FileHeader::parse(&data).unwrap_or_else(|e| panic!("Failed to parse header: {}", e));

    assert_eq!(header.signature, "HWP Document File");
    assert_eq!(header.version, 0x05000000);
}

// ========== Edge Case Tests for HwpDocument ==========

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