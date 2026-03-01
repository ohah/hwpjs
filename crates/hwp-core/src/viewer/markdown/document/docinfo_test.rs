//! DocInfo conversion to Markdown unit tests
//! 문서 정보 마크다운 변환 단위 테스트

#[cfg(test)]
mod tests {
    use crate::document::{HwpDocument, ParagraphRecord};
    use crate::document::bodytext::PageDef;
    use crate::viewer::markdown::document::docinfo::extract_page_info;
    use crate::viewer::markdown::document::fileheader::format_version;

    #[test]
    fn test_docinfo_module_compiles() {
        assert!(true);
    }

    #[test]
    fn test_extract_page_info_empty_document() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x05000000u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let document = HwpDocument::new(file_header);

        let result = extract_page_info(&document);
        assert!(result.is_none());
    }

    #[test]
    fn test_extract_page_info_no_page_def_paragraphs() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x05000000u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let mut document = HwpDocument::new(file_header);

        // Add paragraphs without PageDef
        let page_def = PageDef {
            paper: crate::document::bodytext::Paper {
                width: 595, // A4 width in twips
                height: 842, // A4 height in twips
                margin_top: 595,
                margin_bottom: 560,
                margin_left: 595,
                margin_right: 560,
                margin_gutter: 0,
            },
            orientation: crate::document::bodytext::PageOrientation::Portrait,
        };

        // Add a paragraph with a simple text record instead of PageDef
        document.body_text.sections = vec![];
        for _ in 0..3 {
            document.body_text.sections.push(crate::document::bodytext::Section::new());
        }

        let result = extract_page_info(&document);
        assert!(result.is_none());
    }

    #[test]
    fn test_extract_page_info_single_page_def() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x05000000u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let mut document = HwpDocument::new(file_header);

        let page_def = PageDef {
            paper: crate::document::bodytext::Paper {
                width: 595,
                height: 842,
                margin_top: 595,
                margin_bottom: 560,
                margin_left: 595,
                margin_right: 560,
                margin_gutter: 0,
            },
            orientation: crate::document::bodytext::PageOrientation::Portrait,
        };

        // Add Section and Paragraph with PageDef
        document.body_text.sections = vec![crate::document::bodytext::Section::new()];
        document.body_text.sections[0].paragraphs = vec![crate::document::bodytext::Paragraph::new()];
        document.body_text.sections[0].paragraphs[0].records = vec![
            ParagraphRecord::PageDef { page_def },
        ];

        let result = extract_page_info(&document);
        assert!(result.is_some());
    }

    #[test]
    fn test_extract_page_info_first_page_def_takes_precedence() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x05000000u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let mut document = HwpDocument::new(file_header);

        let page_def_1 = PageDef {
            paper: crate::document::bodytext::Paper {
                width: 595,
                height: 842,
                margin_top: 595,
                margin_bottom: 560,
                margin_left: 595,
                margin_right: 560,
                margin_gutter: 0,
            },
            orientation: crate::document::bodytext::PageOrientation::Portrait,
        };

        let page_def_2 = PageDef {
            paper: crate::document::bodytext::Paper {
                width: 612,
                height: 792,
                margin_top: 720,
                margin_bottom: 720,
                margin_left: 720,
                margin_right: 720,
                margin_gutter: 0,
            },
            orientation: crate::document::bodytext::PageOrientation::Portrait,
        };

        // Add multiple PageDefs
        document.body_text.sections = vec![
            crate::document::bodytext::Section::new(),
            crate::document::bodytext::Section::new(),
            crate::document::bodytext::Section::new(),
        ];

        // First paragraph in first section has PageDef 1
        document.body_text.sections[0].paragraphs = vec![crate::document::bodytext::Paragraph::new()];
        document.body_text.sections[0].paragraphs[0].records = vec![ParagraphRecord::PageDef { page_def: page_def_1 }];

        // Second section has PageDef 2 in first paragraph
        document.body_text.sections[1].paragraphs = vec![crate::document::bodytext::Paragraph::new()];
        document.body_text.sections[1].paragraphs[0].records = vec![ParagraphRecord::PageDef { page_def: page_def_2 }];

        // First section's second paragraph has PageDef 1 in second record
        document.body_text.sections[0].paragraphs.push(crate::document::bodytext::Paragraph::new());
        document.body_text.sections[0].paragraphs[1].records.push(ParagraphRecord::PageDef { page_def: page_def_1 });

        let result = extract_page_info(&document);
        assert!(result.is_some());
        assert_eq!(result.unwrap().paper.width, 595); // Should return PageDef 1 (first one found)
    }

    #[test]
    fn test_extract_page_info_all_sections_empty() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x05000000u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let mut document = HwpDocument::new(file_header);

        // All sections have only empty paragraphs
        document.body_text.sections = vec![
            crate::document::bodytext::Section::new(),
            crate::document::bodytext::Section::new(),
        ];

        for section in &mut document.body_text.sections {
            section.paragraphs = vec![crate::document::bodytext::Paragraph::new()];
        }

        let result = extract_page_info(&document);
        assert!(result.is_none());
    }

    #[test]
    fn test_extract_page_info_all_paragraphs_no_page_def() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x05000000u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let mut document = HwpDocument::new(file_header);

        document.body_text.sections = vec![crate::document::bodytext::Section::new()];
        document.body_text.sections[0].paragraphs = vec![crate::document::bodytext::Paragraph::new()];

        let result = extract_page_info(&document);
        assert!(result.is_none());
    }

    // Edge case tests for format_version
    #[test]
    fn test_format_version_hwp50() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x05000000u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let document = HwpDocument::new(file_header);

        let result = format_version(&document);
        assert_eq!(result, "5.0.00.00");
    }

    #[test]
    fn test_format_version_hwp51() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x51000000u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let document = HwpDocument::new(file_header);

        let result = format_version(&document);
        assert_eq!(result, "5.1.00.00");
    }

    #[test]
    fn test_format_version_hwp53() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x53000000u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let document = HwpDocument::new(file_header);

        let result = format_version(&document);
        assert_eq!(result, "5.3.00.00");
    }

    #[test]
    fn test_format_version_with_later_build() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x53000010u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let document = HwpDocument::new(file_header);

        let result = format_version(&document);
        assert_eq!(result, "5.3.00.10");
    }

    #[test]
    fn test_format_version_with_micro_release() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x53010300u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let document = HwpDocument::new(file_header);

        let result = format_version(&document);
        assert_eq!(result, "5.3.01.00");
    }

    #[test]
    fn test_format_version_with_patch() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x50020003u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let document = HwpDocument::new(file_header);

        let result = format_version(&document);
        assert_eq!(result, "5.0.02.03");
    }

    #[test]
    fn test_format_version_no_sections() {
        let file_header_data = vec![0u8; 256];
        file_header_data[0..32] = b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
        file_header_data[32..36] = (0x51020304u32).to_le_bytes();
        let file_header = crate::document::FileHeader::parse(&file_header_data).unwrap();
        let document = HwpDocument::new(file_header);

        // No sections in document
        document.body_text.sections = vec![];

        let result = format_version(&document);
        assert_eq!(result, "5.1.02.04");
    }
}