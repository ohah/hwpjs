//! FileHeader conversion to Markdown unit tests
//! 파일 헤더 마크다운 변환 단위 테스트

#[cfg(test)]
mod tests {
    use crate::document::HwpDocument;

    #[test]
    fn test_fileheader_module_compiles() {
        assert!(true);
    }

    #[test]
    fn test_format_version_basic_hwp50() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x05000000u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let document = HwpDocument::new(file_header);

        let result = crate::viewer::markdown::document::fileheader::format_version(&document);
        assert_eq!(result, "5.0.00.00");
    }

    #[test]
    fn test_format_version_basic_hwp51() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x51000000u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let document = HwpDocument::new(file_header);

        let result = crate::viewer::markdown::document::fileheader::format_version(&document);
        assert_eq!(result, "5.1.00.00");
    }

    #[test]
    fn test_format_version_basic_hwp53() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x53000000u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let document = HwpDocument::new(file_header);

        let result = crate::viewer::markdown::document::fileheader::format_version(&document);
        assert_eq!(result, "5.3.00.00");
    }

    #[test]
    fn test_format_version_with_later_build() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x53000010u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let document = HwpDocument::new(file_header);

        let result = crate::viewer::markdown::document::fileheader::format_version(&document);
        assert_eq!(result, "5.3.00.10");
    }

    #[test]
    fn test_format_version_with_micro_release() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x53010300u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let document = HwpDocument::new(file_header);

        let result = crate::viewer::markdown::document::fileheader::format_version(&document);
        assert_eq!(result, "5.3.01.00");
    }

    #[test]
    fn test_format_version_with_patch() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x50020003u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let document = HwpDocument::new(file_header);

        let result = crate::viewer::markdown::document::fileheader::format_version(&document);
        assert_eq!(result, "5.0.02.03");
    }

    #[test]
    fn test_format_version_full_hwp53_patch() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x53056030u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let document = HwpDocument::new(file_header);

        let result = crate::viewer::markdown::document::fileheader::format_version(&document);
        assert_eq!(result, "5.3.05.60");
    }

    #[test]
    fn test_format_version_edge_case_zeroes() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x00000000u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let document = HwpDocument::new(file_header);

        let result = crate::viewer::markdown::document::fileheader::format_version(&document);
        assert_eq!(result, "0.00.00.00");
    }

    #[test]
    fn test_format_version_edge_case_max_value() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0xFFFFFFFFu32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let document = HwpDocument::new(file_header);

        let result = crate::viewer::markdown::document::fileheader::format_version(&document);
        assert_eq!(result, "255.00.255.255");
    }

    #[test]
    fn test_format_version_no_sections() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x51020304u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let mut document = HwpDocument::new(file_header);

        // No sections in document
        document.body_text.sections = vec![];

        let result = crate::viewer::markdown::document::fileheader::format_version(&document);
        assert_eq!(result, "5.1.02.04");
    }

    #[test]
    fn test_format_version_with_empty_sections() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x52345678u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let mut document = HwpDocument::new(file_header);

        // Empty sections
        document.body_text.sections = vec![crate::document::bodytext::Section::new()];

        let result = crate::viewer::markdown::document::fileheader::format_version(&document);
        assert_eq!(result, "5.2.34.56");
    }

    #[test]
    fn test_format_version_multiple_sections() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x54010101u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let mut document = HwpDocument::new(file_header);

        // Multiple sections
        document.body_text.sections = vec![
            crate::document::bodytext::Section::new(),
            crate::document::bodytext::Section::new(),
            crate::document::bodytext::Section::new(),
        ];

        let result = crate::viewer::markdown::document::fileheader::format_version(&document);
        assert_eq!(result, "5.4.01.01");
    }
}