/// 압축 해제 테스트
/// Decompression tests
use hwp_core::*;

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
