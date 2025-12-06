/// HwpParser 테스트
/// HwpParser tests
use hwp_core::*;

#[test]
fn test_hwp_parser_new() {
    let _parser = HwpParser::new();
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
