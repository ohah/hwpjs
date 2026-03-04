#[cfg(test)]
mod tests {
    use crate::document::bodytext::ctrl_header::PageNumberPositionFlags;
    use crate::document::bodytext::ctrl_header::{CtrlHeaderData, PageNumberPosition};
    use crate::document::{FileHeader, HwpDocument};
    use crate::viewer::html::page::render_page;
    use crate::viewer::html::page::{HcIBlock, HtmlPageBreak};

    fn blocks_from_str(s: &str) -> Vec<HcIBlock> {
        if s.is_empty() {
            vec![]
        } else {
            vec![HcIBlock {
                html: s.to_string(),
                left_mm: None,
                top_mm: None,
                is_raw: false,
            }]
        }
    }

    #[test]
    fn test_html_page_break_new() {
        let marker = HtmlPageBreak::new();
        assert_eq!(format!("{}", marker), "<span></span>");
        assert_ne!(marker.to_string(), "");
    }

    #[test]
    fn test_html_page_break_display_simple() {
        let marker = HtmlPageBreak {};
        let result = format!("{}", marker);
        assert_eq!(result, "<span></span>");
    }

    #[test]
    fn test_html_page_break_unique_instantiation() {
        let marker1 = HtmlPageBreak::new();
        let marker2 = HtmlPageBreak::new();
        assert_eq!(format!("{}", marker1), format!("{}", marker2));
    }

    #[test]
    fn test_html_page_break_empty_marker() {
        let marker = HtmlPageBreak {};
        assert!(!marker.to_string().is_empty());
        assert_eq!(marker.to_string(), "<span></span>");
    }

    #[test]
    fn test_html_page_break_formatting() {
        let marker = HtmlPageBreak::new();
        let html = marker.to_string();
        assert!(html.starts_with("<span"));
        assert!(html.ends_with("</span>"));
    }

    // Page rendering tests
    #[test]
    fn test_render_page_empty_content_no_tables() {
        let mut file_header_data = vec![0u8; 256];
        file_header_data[0..32].copy_from_slice(b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
        file_header_data[32..36].copy_from_slice(&0x05000300u32.to_le_bytes());
        file_header_data[36..40].copy_from_slice(&0x01u32.to_le_bytes());
        let file_header = FileHeader::parse(&file_header_data).unwrap_or_else(|_| unreachable!());
        let document = HwpDocument::new(file_header);

        let result = render_page(
            1,
            &blocks_from_str(""),
            &[],
            None,
            Some((100, 100)),
            None,
            Some(&CtrlHeaderData::PageNumberPosition {
                flags: PageNumberPositionFlags {
                    position: PageNumberPosition::None,
                    shape: 0,
                },
                number: 0,
                prefix: String::from("페이지 "),
                suffix: String::new(),
                user_symbol: String::new(),
            }),
            1,
            &document,
            None,
            None,
            None,
        );

        assert!(result.contains("<div"));
        assert!(result.contains("class=\"hpa\""));
    }

    #[test]
    fn test_render_page_with_tables() {
        let mut file_header_data = vec![0u8; 256];
        file_header_data[0..32].copy_from_slice(b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
        file_header_data[32..36].copy_from_slice(&0x05000300u32.to_le_bytes());
        file_header_data[36..40].copy_from_slice(&0x01u32.to_le_bytes());
        let file_header = FileHeader::parse(&file_header_data).unwrap_or_else(|_| unreachable!());
        let document = HwpDocument::new(file_header);

        let table_html = String::from("<table>content</table>");
        let result = render_page(
            1,
            &blocks_from_str("content"),
            &[table_html.clone()],
            None,
            Some((50, 50)),
            None,
            None,
            1,
            &document,
            Some("header"),
            Some("footer"),
            None,
        );

        assert!(result.contains("header"));
        assert!(result.contains("footer"));
        assert!(result.contains(&table_html));
    }

    #[test]
    fn test_render_page_a3_paper_size() {
        let mut file_header_data = vec![0u8; 256];
        file_header_data[0..32].copy_from_slice(b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
        file_header_data[32..36].copy_from_slice(&0x05000300u32.to_le_bytes());
        file_header_data[36..40].copy_from_slice(&0x01u32.to_le_bytes());
        let file_header = FileHeader::parse(&file_header_data).unwrap_or_else(|_| unreachable!());
        let document = HwpDocument::new(file_header);

        let page_def = crate::document::bodytext::PageDef {
            paper_width: crate::types::HWPUNIT(2970), // A3 in mm (HWPUNIT is in 0.1mm)
            paper_height: crate::types::HWPUNIT(4200),
            left_margin: crate::types::HWPUNIT(0),
            top_margin: crate::types::HWPUNIT(0),
            right_margin: crate::types::HWPUNIT(0),
            bottom_margin: crate::types::HWPUNIT(0),
            header_margin: crate::types::HWPUNIT(0),
            footer_margin: crate::types::HWPUNIT(0),
            binding_margin: crate::types::HWPUNIT(0),
            attributes: crate::document::bodytext::page_def::PageDefAttributes {
                paper_direction: crate::document::bodytext::page_def::PaperDirection::Vertical,
                binding_method: crate::document::bodytext::page_def::BindingMethod::SinglePage,
            },
        };

        let result = render_page(
            1,
            &blocks_from_str("content"),
            &[],
            Some(&page_def),
            None,
            None,
            None,
            1,
            &document,
            None,
            None,
            None,
        );

        assert!(result.contains("class=\"hpa\""));
    }

    #[test]
    fn test_render_page_page_number_bottom_center() {
        let mut file_header_data = vec![0u8; 256];
        file_header_data[0..32].copy_from_slice(b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
        file_header_data[32..36].copy_from_slice(&0x05000300u32.to_le_bytes());
        file_header_data[36..40].copy_from_slice(&0x01u32.to_le_bytes());
        let file_header = FileHeader::parse(&file_header_data).unwrap_or_else(|_| unreachable!());
        let document = HwpDocument::new(file_header);

        let result = render_page(
            1,
            &blocks_from_str("content"),
            &[],
            None,
            Some((50, 50)),
            None,
            Some(&CtrlHeaderData::PageNumberPosition {
                flags: PageNumberPositionFlags {
                    position: PageNumberPosition::BottomCenter,
                    shape: 0,
                },
                number: 0,
                prefix: String::from(""),
                suffix: String::from(""),
                user_symbol: String::new(),
            }),
            1,
            &document,
            None,
            None,
            None,
        );

        assert!(result.contains("<span"));
        assert!(result.contains("</span>"));
        assert!(result.contains("class=\"hpN\""));
    }

    #[test]
    fn test_render_page_null_characters_in_prefix_suffix() {
        let mut file_header_data = vec![0u8; 256];
        file_header_data[0..32].copy_from_slice(b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
        file_header_data[32..36].copy_from_slice(&0x05000300u32.to_le_bytes());
        file_header_data[36..40].copy_from_slice(&0x01u32.to_le_bytes());
        let file_header = FileHeader::parse(&file_header_data).unwrap_or_else(|_| unreachable!());
        let document = HwpDocument::new(file_header);

        // Prefix with null characters
        let prefix_with_null = String::from("ABC\0DEF");
        let result = render_page(
            1,
            &blocks_from_str("content"),
            &[],
            None,
            Some((50, 50)),
            None,
            Some(&CtrlHeaderData::PageNumberPosition {
                flags: PageNumberPositionFlags {
                    position: PageNumberPosition::BottomCenter,
                    shape: 0,
                },
                number: 0,
                prefix: prefix_with_null,
                suffix: String::new(),
                user_symbol: String::new(),
            }),
            1,
            &document,
            None,
            None,
            None,
        );

        assert!(result.contains("<span"));
        assert!(result.contains("</span>"));
    }

    #[test]
    fn test_render_page_empty_header_fragment() {
        let mut file_header_data = vec![0u8; 256];
        file_header_data[0..32].copy_from_slice(b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
        file_header_data[32..36].copy_from_slice(&0x05000300u32.to_le_bytes());
        file_header_data[36..40].copy_from_slice(&0x01u32.to_le_bytes());
        let file_header = FileHeader::parse(&file_header_data).unwrap_or_else(|_| unreachable!());
        let document = HwpDocument::new(file_header);

        let result = render_page(
            1,
            &blocks_from_str("content"),
            &[],
            None,
            Some((50, 50)),
            None,
            None,
            1,
            &document,
            Some(""),
            Some("footer"),
            None,
        );

        assert!(result.contains("<div"));
        assert!(result.contains("footer"));
    }
}
