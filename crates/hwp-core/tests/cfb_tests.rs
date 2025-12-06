/// CFB 파서 테스트
/// CFB parser tests
use hwp_core::*;
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
