/// CFB 파서 테스트
/// CFB parser tests
mod common;
use hwp_core::*;
use std::fs;

#[test]
fn test_cfb_parse_basic() {
    // Test with actual HWP file from fixtures directory
    use crate::common::find_fixture_file;

    if let Some(path) = find_fixture_file("noori.hwp") {
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
    // Test reading FileHeader stream from CFB
    use crate::common::find_fixture_file;

    if let Some(path) = find_fixture_file("noori.hwp") {
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
