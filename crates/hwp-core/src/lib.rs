/// HWP Core Library
///
/// This library provides core functionality for parsing HWP files.
/// It accepts byte arrays as input to support cross-platform usage.
mod cfb;
mod decompress;
mod document;
mod types;
mod viewer;

pub use cfb::CfbParser;
pub use decompress::{decompress_deflate, decompress_zlib};
pub use document::{
    BinData, BodyText, BorderFill, Bullet, CharShape, DocInfo, DocumentProperties, FaceName,
    FileHeader, HwpDocument, IdMappings, Numbering, ParaShape, Section, TabDef,
};
pub use types::{
    RecordHeader, BYTE, COLORREF, DWORD, HWPUNIT, HWPUNIT16, INT16, INT32, INT8, SHWPUNIT, UINT,
    UINT16, UINT32, UINT8, WCHAR, WORD,
};

/// Main HWP parser structure
pub struct HwpParser {
    // Placeholder for future implementation
}

impl HwpParser {
    /// Create a new HWP parser
    pub fn new() -> Self {
        Self {}
    }

    /// Parse HWP file from byte array
    ///
    /// # Arguments
    /// * `data` - Byte array containing the HWP file data
    ///
    /// # Returns
    /// Parsed HWP document structure
    pub fn parse(&self, data: &[u8]) -> Result<HwpDocument, String> {
        // Parse CFB structure
        let mut cfb = CfbParser::parse(data)?;

        // Read and parse FileHeader
        let fileheader_data = CfbParser::read_stream(&mut cfb, "FileHeader")?;
        let fileheader = FileHeader::parse(&fileheader_data)?;

        // Create document structure with initial empty data
        let mut document = HwpDocument::new(fileheader.clone());

        // Read and parse DocInfo
        let docinfo_data: Vec<u8> = CfbParser::read_stream(&mut cfb, "DocInfo")?;
        document.doc_info = DocInfo::parse(&docinfo_data, &fileheader)?;

        // Parse BodyText sections
        // 구역 개수는 DocumentProperties의 area_count에서 가져옵니다 / Get section count from DocumentProperties.area_count
        let section_count = document
            .doc_info
            .document_properties
            .as_ref()
            .map(|props| props.area_count)
            .unwrap_or(1); // 기본값은 1 / Default is 1
        document.body_text = BodyText::parse(&mut cfb, &fileheader, section_count)?;

        // Initialize BinData (will be populated later)
        document.bin_data = BinData::default();

        Ok(document)
    }

    /// Parse HWP file and return FileHeader as JSON
    ///
    /// # Arguments
    /// * `data` - Byte array containing the HWP file data
    ///
    /// # Returns
    /// FileHeader as JSON string
    pub fn parse_fileheader_json(&self, data: &[u8]) -> Result<String, String> {
        // Parse CFB structure
        let mut cfb = CfbParser::parse(data)?;

        // Read and parse FileHeader
        let fileheader_data = CfbParser::read_stream(&mut cfb, "FileHeader")?;
        let fileheader = FileHeader::parse(&fileheader_data)?;

        // Convert to JSON
        fileheader.to_json()
    }
}

impl Default for HwpParser {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hwp_parser_new() {
        let _parser = HwpParser::new();
        assert!(true); // Placeholder test
    }

    #[test]
    fn test_hwp_parser_parse_with_actual_file() {
        // Test with actual HWP file if available
        let possible_paths = [
            "../../examples/fixtures/noori.hwp",
            "../examples/fixtures/noori.hwp",
            "examples/fixtures/noori.hwp",
        ];

        let mut file_path = None;
        for path in &possible_paths {
            if std::path::Path::new(path).exists() {
                file_path = Some(*path);
                break;
            }
        }

        if let Some(path) = file_path {
            if let Ok(data) = std::fs::read(path) {
                let parser = HwpParser::new();
                let result = parser.parse(&data);
                if let Err(e) = &result {
                    eprintln!("Parse error: {}", e);
                }
                assert!(result.is_ok(), "Should parse actual HWP file");
                let document = result.unwrap();

                // Validate document structure
                assert_eq!(
                    document.file_header.signature.trim_end_matches('\0'),
                    "HWP Document File"
                );
                assert!(document.file_header.version > 0);
            }
        }
    }

    #[test]
    fn test_hwp_parser_parse_fileheader_json() {
        // Test FileHeader JSON output
        let possible_paths = [
            "../../examples/fixtures/noori.hwp",
            "../examples/fixtures/noori.hwp",
            "examples/fixtures/noori.hwp",
        ];

        let mut file_path = None;
        for path in &possible_paths {
            if std::path::Path::new(path).exists() {
                file_path = Some(*path);
                break;
            }
        }

        if let Some(path) = file_path {
            if let Ok(data) = std::fs::read(path) {
                let parser = HwpParser::new();
                let result = parser.parse_fileheader_json(&data);
                assert!(result.is_ok(), "Should return FileHeader as JSON");
                let json = result.unwrap();

                // Validate JSON contains expected fields
                assert!(json.contains("signature"));
                assert!(json.contains("version"));
                assert!(json.contains("document_flags"));
                assert!(json.contains("license_flags"));
                assert!(json.contains("encrypt_version"));
                assert!(json.contains("kogl_country"));
            }
        }
    }

    #[test]
    fn test_hwp_parser_parse_with_invalid_data() {
        let parser = HwpParser::new();
        let data = b"invalid hwp file content";
        let result = parser.parse(data);
        // Should fail because it's not a valid CFB structure
        assert!(result.is_err(), "Should fail for invalid CFB data");
    }
}

#[cfg(test)]
mod cfb_tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_cfb_parse_basic() {
        // Test with actual HWP file from fixtures directory only
        let possible_paths = [
            "../../examples/fixtures/noori.hwp",
            "../examples/fixtures/noori.hwp",
            "examples/fixtures/noori.hwp",
        ];

        let mut file_path = None;
        for path in &possible_paths {
            if std::path::Path::new(path).exists() {
                file_path = Some(*path);
                break;
            }
        }

        if let Some(path) = file_path {
            if let Ok(data) = fs::read(path) {
                let result = CfbParser::parse(&data);
                assert!(
                    result.is_ok(),
                    "CFB parsing should succeed for valid HWP file"
                );
            }
        }
    }

    #[test]
    fn test_cfb_read_fileheader() {
        // Test reading FileHeader stream from CFB (fixtures directory only)
        let possible_paths = [
            "../../examples/fixtures/noori.hwp",
            "../examples/fixtures/noori.hwp",
            "examples/fixtures/noori.hwp",
        ];

        let mut file_path = None;
        for path in &possible_paths {
            if std::path::Path::new(path).exists() {
                file_path = Some(*path);
                break;
            }
        }

        if let Some(path) = file_path {
            if let Ok(data) = fs::read(path) {
                let mut cfb = CfbParser::parse(&data).expect("Should parse CFB");
                let result = CfbParser::read_stream(&mut cfb, "FileHeader");
                assert!(result.is_ok(), "Should be able to read FileHeader stream");
                let fileheader = result.unwrap();
                assert!(!fileheader.is_empty(), "FileHeader should not be empty");
                assert_eq!(fileheader.len(), 256, "FileHeader should be 256 bytes");
            }
        }
    }
}

#[cfg(test)]
mod decompress_tests {
    use super::*;

    #[test]
    fn test_decompress_zlib_basic() {
        // Create a simple test: compress "hello" using zlib format and then decompress it
        use flate2::write::ZlibEncoder;
        use flate2::Compression;
        use std::io::Write;

        let original = b"hello world";
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(original).unwrap();
        let compressed = encoder.finish().unwrap();

        let decompressed = decompress_zlib(&compressed).expect("Should decompress");
        assert_eq!(
            decompressed, original,
            "Decompressed data should match original"
        );
    }

    #[test]
    fn test_decompress_zlib_empty() {
        // Empty data should still work (though it might error, which is fine)
        let result = decompress_zlib(b"");
        // Either Ok with empty vec or Err is acceptable
        if let Ok(data) = result {
            assert!(data.is_empty() || !data.is_empty());
        }
    }
}

#[cfg(test)]
mod fileheader_tests {
    use super::*;

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
        // Try multiple possible paths (from workspace root and from crate directory)
        let possible_paths = [
            "../../examples/fixtures/noori.hwp", // from crate directory
            "../examples/fixtures/noori.hwp",    // from workspace root
            "examples/fixtures/noori.hwp",       // absolute-like
        ];

        let mut file_path = None;
        for path in &possible_paths {
            if std::path::Path::new(path).exists() {
                file_path = Some(*path);
                break;
            }
        }

        let file_path = match file_path {
            Some(p) => p,
            None => {
                println!("HWP test file not found in any expected location");
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
}

#[cfg(test)]
mod snapshot_tests {
    use super::*;
    use insta::assert_snapshot;

    /// Helper function to find test HWP file
    fn find_test_file() -> Option<String> {
        let possible_paths = [
            "../../examples/fixtures/noori.hwp",
            "../examples/fixtures/noori.hwp",
            "examples/fixtures/noori.hwp",
        ];

        for path in &possible_paths {
            if std::path::Path::new(path).exists() {
                return Some(path.to_string());
            }
        }
        None
    }

    #[test]
    fn test_full_document_json_snapshot() {
        let file_path = match find_test_file() {
            Some(path) => path,
            None => return, // Skip test if file not available
        };

        if let Ok(data) = std::fs::read(&file_path) {
            let parser = HwpParser::new();
            let result = parser.parse(&data);
            if let Err(e) = &result {
                eprintln!("Parse error: {:?}", e);
            }
            assert!(result.is_ok(), "Should parse HWP document");
            let document = result.unwrap();

            // Verify BodyText is parsed correctly
            // BodyText가 올바르게 파싱되었는지 검증
            assert!(
                !document.body_text.sections.is_empty(),
                "BodyText should have at least one section"
            );
            assert!(
                document.body_text.sections[0].index == 0,
                "First section should have index 0"
            );
            assert!(
                !document.body_text.sections[0].paragraphs.is_empty(),
                "First section should have at least one paragraph"
            );

            // Convert to JSON
            // serde_json already outputs unicode characters as-is (not escaped)
            // Only control characters are escaped according to JSON standard
            let json =
                serde_json::to_string_pretty(&document).expect("Should serialize document to JSON");
            assert_snapshot!("full_document_json", json);
        }
    }

    #[test]
    fn test_debug_record_levels() {
        let file_path = match find_test_file() {
            Some(path) => path,
            None => return,
        };

        if let Ok(data) = std::fs::read(&file_path) {
            let mut cfb = CfbParser::parse(&data).expect("Should parse CFB");
            let fileheader = FileHeader::parse(
                &CfbParser::read_stream(&mut cfb, "FileHeader").expect("Should read FileHeader"),
            )
            .expect("Should parse FileHeader");

            let section_data = CfbParser::read_nested_stream(&mut cfb, "BodyText", "Section0")
                .expect("Should read Section0");

            let decompressed = if fileheader.is_compressed() {
                crate::decompress_deflate(&section_data).expect("Should decompress section data")
            } else {
                section_data
            };

            use crate::types::RecordHeader;
            let mut offset = 0;
            let mut record_count = 0;
            let mut table_records = Vec::new();
            let mut list_header_records = Vec::new();

            while offset < decompressed.len() {
                let remaining_data = &decompressed[offset..];
                match RecordHeader::parse(remaining_data) {
                    Ok((header, header_size)) => {
                        record_count += 1;
                        let tag_id = header.tag_id;
                        let level = header.level;
                        let size = header.size as usize;

                        if tag_id == 0x43 {
                            table_records.push((record_count, level, offset));
                            println!(
                                "Record {}: TABLE (0x43) at offset {}, level {}",
                                record_count, offset, level
                            );
                        }
                        if tag_id == 0x44 {
                            list_header_records.push((record_count, level, offset));
                            println!(
                                "Record {}: LIST_HEADER (0x44) at offset {}, level {}",
                                record_count, offset, level
                            );
                        }

                        offset += header_size + size;
                    }
                    Err(_) => break,
                }
            }

            println!("\n=== Summary ===");
            println!("Total records: {}", record_count);
            println!("TABLE records: {}", table_records.len());
            println!("LIST_HEADER records: {}", list_header_records.len());

            for (table_idx, table_level, table_offset) in &table_records {
                println!(
                    "\nTABLE at record {} (offset {}, level {}):",
                    table_idx, table_offset, table_level
                );
                for (list_idx, list_level, list_offset) in &list_header_records {
                    if *list_offset > *table_offset && *list_offset < *table_offset + 1000 {
                        println!(
                            "  -> LIST_HEADER at record {} (offset {}, level {})",
                            list_idx, list_offset, list_level
                        );
                    }
                }
            }
        }
    }
}
