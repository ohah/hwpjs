/// FileHeader 파싱 테스트
/// FileHeader parsing tests
mod common;
use hwp_core::*;

#[test]
fn test_fileheader_parse_basic() {
    // Create a minimal valid FileHeader
    let mut data = vec![0u8; 256];
    // Set signature "HWP Document File"
    let signature = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
    data[0..signature.len()].copy_from_slice(signature);
    // Set version (5.0.3.0 = 0x05000300)
    data[32..36].copy_from_slice(&0x05000300u32.to_le_bytes());
    // Set document_flags (compressed flag)
    data[36..40].copy_from_slice(&0x01u32.to_le_bytes());

    let fileheader = FileHeader::parse(&data).expect("Should parse FileHeader");
    assert_eq!(
        fileheader.signature.trim_end_matches('\0'),
        "HWP Document File"
    );
    assert_eq!(fileheader.version, 0x05000300);
    assert!(fileheader.is_compressed());
}

#[test]
fn test_fileheader_parse_too_short() {
    let data = vec![0u8; 100];
    let result = FileHeader::parse(&data);
    assert!(
        result.is_err(),
        "Should fail for data shorter than 256 bytes"
    );
}

#[test]
fn test_fileheader_parse_from_actual_file() {
    // Test with actual HWP file if available
    use crate::common::find_fixture_file;

    let file_path = match find_fixture_file("noori.hwp") {
        Some(p) => p,
        None => {
            println!("HWP test file not found in fixtures directory");
            return;
        }
    };

    match std::fs::read(file_path) {
        Ok(data) => {
            let mut cfb = CfbParser::parse(&data).expect("Should parse CFB");
            match CfbParser::read_stream(&mut cfb, "FileHeader") {
                Ok(fileheader_data) => {
                    let fileheader = FileHeader::parse(&fileheader_data)
                        .expect("Should parse FileHeader from actual file");
                    // Validate signature (must be exactly "HWP Document File")
                    let signature_trimmed = fileheader.signature.trim_end_matches('\0');
                    assert_eq!(
                        signature_trimmed, "HWP Document File",
                        "Signature must be 'HWP Document File'"
                    );

                    // Validate signature bytes (original data should be 32 bytes)
                    // The signature field is a String, but we check the original bytes
                    let signature_bytes = &fileheader_data[0..32];
                    assert_eq!(
                        signature_bytes.len(),
                        32,
                        "Signature bytes must be exactly 32 bytes"
                    );
                    let signature_str = String::from_utf8_lossy(signature_bytes)
                        .trim_end_matches('\0')
                        .to_string();
                    assert_eq!(
                        signature_str, "HWP Document File",
                        "Signature content must be 'HWP Document File'"
                    );

                    // Validate version format (0xMMnnPPrr)
                    // MM should be 5 for HWP 5.0
                    let major = (fileheader.version >> 24) & 0xFF;
                    let minor = (fileheader.version >> 16) & 0xFF;
                    let patch = (fileheader.version >> 8) & 0xFF;
                    let revision = fileheader.version & 0xFF;

                    assert_eq!(major, 5, "Major version should be 5 for HWP 5.0");
                    assert!(
                        minor <= 0xFF && patch <= 0xFF && revision <= 0xFF,
                        "Version components should be valid (0-255)"
                    );

                    // Validate document_flags (check bit flags)
                    // Bit 0: 압축 여부
                    let is_compressed = (fileheader.document_flags & 0x01) != 0;
                    assert_eq!(
                        is_compressed,
                        fileheader.is_compressed(),
                        "is_compressed() should match bit 0"
                    );

                    // Bit 1: 암호 설정 여부
                    let is_encrypted = (fileheader.document_flags & 0x02) != 0;
                    assert_eq!(
                        is_encrypted,
                        fileheader.is_encrypted(),
                        "is_encrypted() should match bit 1"
                    );

                    // Validate EncryptVersion (should be 0-4 according to spec)
                    assert!(
                        fileheader.encrypt_version <= 4,
                        "EncryptVersion should be 0-4, got {}",
                        fileheader.encrypt_version
                    );

                    // Validate KOGL Country (should be 0, 6, or 15 according to spec)
                    // Valid values: 0 (Not set), 6 (KOR), 15 (US)
                    assert!(
                        fileheader.kogl_country == 0
                            || fileheader.kogl_country == 6
                            || fileheader.kogl_country == 15,
                        "KOGL Country should be 0, 6, or 15, got {}",
                        fileheader.kogl_country
                    );

                    // Validate reserved field (should be exactly 207 bytes)
                    assert_eq!(
                        fileheader.reserved.len(),
                        207,
                        "Reserved field must be exactly 207 bytes, got {}",
                        fileheader.reserved.len()
                    );

                    // Validate total structure size
                    let total_size = 32 // signature
                        + 4 // version
                        + 4 // document_flags
                        + 4 // license_flags
                        + 4 // encrypt_version
                        + 1 // kogl_country
                        + 207; // reserved
                    assert_eq!(total_size, 256, "Total FileHeader size should be 256 bytes");
                }
                Err(e) => {
                    panic!("Should be able to read FileHeader stream: {}", e);
                }
            }
        }
        Err(_) => {
            // Skip test if file not available
        }
    }
}

#[test]
fn test_fileheader_is_compressed() {
    let mut data = vec![0u8; 256];
    let signature = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
    data[0..signature.len()].copy_from_slice(signature);
    data[32..36].copy_from_slice(&0x05000300u32.to_le_bytes());

    // Test with compression flag set
    data[36..40].copy_from_slice(&0x01u32.to_le_bytes());
    let fileheader = FileHeader::parse(&data).unwrap();
    assert!(fileheader.is_compressed());

    // Test without compression flag
    data[36..40].copy_from_slice(&0x00u32.to_le_bytes());
    let fileheader = FileHeader::parse(&data).unwrap();
    assert!(!fileheader.is_compressed());
}

#[test]
fn test_fileheader_is_encrypted() {
    let mut data = vec![0u8; 256];
    let signature = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
    data[0..signature.len()].copy_from_slice(signature);
    data[32..36].copy_from_slice(&0x05000300u32.to_le_bytes());

    // Test with encryption flag set
    data[36..40].copy_from_slice(&0x02u32.to_le_bytes());
    let fileheader = FileHeader::parse(&data).unwrap();
    assert!(fileheader.is_encrypted());

    // Test without encryption flag
    data[36..40].copy_from_slice(&0x00u32.to_le_bytes());
    let fileheader = FileHeader::parse(&data).unwrap();
    assert!(!fileheader.is_encrypted());
}
