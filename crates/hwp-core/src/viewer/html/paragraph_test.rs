#[cfg(test)]
mod tests {
    use super::paragraph;
    use crate::document::{FileHeader, HwpDocument, Paragraph};
    use crate::viewer::html::HtmlOptions;

    // Test ParagraphPosition defaults
    #[test]
    fn test_paragraph_position_new() {
        let position = paragraph::ParagraphPosition {
            hcd_position: None,
            page_def: None,
            first_para_vertical_mm: None,
            current_para_vertical_mm: None,
            current_para_index: None,
            content_height_mm: None,
            table_fragment_height_mm: None,
            table_fragment_apply_at_index: None,
        };

        assert!(position.hcd_position.is_none());
        assert!(position.page_def.is_none());
        assert!(position.first_para_vertical_mm.is_none());
        assert!(position.current_para_vertical_mm.is_none());
        assert!(position.current_para_index.is_none());
        assert!(position.content_height_mm.is_none());
        assert!(position.table_fragment_height_mm.is_none());
        assert!(position.table_fragment_apply_at_index.is_none());
    }

    // Test ParagraphRenderContext fields are accessible
    #[test]
    fn test_paragraph_render_context_fields() {
        let mut file_header_data = vec![0u8; 256];
        file_header_data[0..32].copy_from_slice(b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
        file_header_data[32..36].copy_from_slice(&0x05000300u32.to_le_bytes());
        file_header_data[36..40].copy_from_slice(&0x01u32.to_le_bytes());
        let file_header = FileHeader::parse(&file_header_data).unwrap_or_else(|_| unreachable!());
        let doc = HwpDocument::new(file_header);

        let position = paragraph::ParagraphPosition {
            hcd_position: Some((100.0, 200.0)),
            page_def: None,
            first_para_vertical_mm: Some(30.0),
            current_para_vertical_mm: Some(50.0),
            current_para_index: Some(5),
            content_height_mm: Some(297.0),
            table_fragment_height_mm: None,
            table_fragment_apply_at_index: None,
        };

        let context = paragraph::ParagraphRenderContext {
            document: &doc,
            options: &HtmlOptions::default(),
            position,
            body_default_hls: None,
        };

        assert_eq!(context.document, &doc);
        assert_eq!(
            context.position.hcd_position,
            Some((100.0, 200.0))
        );
        assert_eq!(context.position.first_para_vertical_mm, Some(30.0));
        assert_eq!(context.position.current_para_vertical_mm, Some(50.0));
        assert_eq!(context.position.current_para_index, Some(5));
        assert_eq!(context.position.content_height_mm, Some(297.0));
    }

    // Test ParagraphRenderState fields are accessible
    #[test]
    fn test_paragraph_render_state_fields() {
        let mut table_counter = 1u32;
        let mut pattern_counter = 0usize;
        let mut color_to_pattern = std::collections::HashMap::new();
        color_to_pattern.insert(42, "pattern42".to_string());

        let mut note_state: Option<std::rc::Rc<RefCell<std::cell::RefCell<paragraph::FootnoteEndnoteState>>>> =
            None;

        let mut outline_tracker: Option<std::rc::Rc<RefCell<std::cell::RefCell<crate::viewer::core::outline::OutlineNumberTracker>>>>
            = Some(std::rc::Rc::new(
                std::cell::RefCell::new(crate::viewer::core::outline::OutlineNumberTracker::new())
            ));

        let mut state = paragraph::ParagraphRenderState {
            table_counter: &mut table_counter,
            pattern_counter: &mut pattern_counter,
            color_to_pattern: &mut color_to_pattern,
            note_state: None,
            outline_tracker: Some(&mut outline_tracker),
        };

        assert_eq!(*state.table_counter, 1);
        assert_eq!(*state.pattern_counter, 0);
        assert_eq!(state.color_to_pattern.get(&42), Some(&"pattern42".to_string()));
        assert!(state.outline_tracker.is_some());
    }

    // Test render_paragraphs_fragment with empty paragraphs
    #[test]
    fn test_render_paragraphs_fragment_empty() {
        let mut file_header_data = vec![0u8; 256];
        file_header_data[0..32].copy_from_slice(b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
        file_header_data[32..36].copy_from_slice(&0x05000300u32.to_le_bytes());
        file_header_data[36..40].copy_from_slice(&0x01u32.to_le_bytes());
        let file_header = FileHeader::parse(&file_header_data).unwrap_or_else(|_| unreachable!());
        let doc = HwpDocument::new(file_header);

        let html = paragraph::render_paragraphs_fragment(
            &[],
            &doc,
            &HtmlOptions::default(),
        );

        assert_eq!(html, "");
    }

    // Test collect_control_char_positions with empty paragraph
    #[test]
    fn test_collect_control_char_positions_empty() {
        let file_header_data = vec![0u8; 256];
        let file_header = FileHeader::parse(&file_header_data).unwrap_or_else(|_| unreachable!());
        let doc = HwpDocument::new(file_header);
        let paragraph = Paragraph::new(vec![]);

        let (control_positions, shape_positions) =
            paragraph::collect_control_char_positions(&paragraph, &doc);

        assert!(control_positions.is_empty());
        assert!(shape_positions.is_empty());
    }

    // Test collect_line_segments with no line segment records
    #[test]
    fn test_collect_line_segments_no_segments() {
        let file_header_data = vec![0u8; 256];
        let file_header = FileHeader::parse(&file_header_data).unwrap_or_else(|_| unreachable!());
        let doc = HwpDocument::new(file_header);
        let paragraph = Paragraph::new(vec![]);

        let line_segments = paragraph::collect_line_segments(&paragraph);

        assert!(line_segments.is_empty());
    }

    // Test collect_images with no images in paragraph
    #[test]
    fn test_collect_images_no_images() {
        let mut file_header_data = vec![0u8; 256];
        file_header_data[0..32].copy_from_slice(b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
        file_header_data[32..36].copy_from_slice(&0x05000300u32.to_le_bytes());
        file_header_data[36..40].copy_from_slice(&0x01u32.to_le_bytes());
        let file_header = FileHeader::parse(&file_header_data).unwrap_or_else(|_| unreachable!());
        let doc = HwpDocument::new(file_header);
        let paragraph = Paragraph::new(vec![]);

        let images = paragraph::collect_images(&paragraph, &doc, &HtmlOptions::default());

        assert!(images.is_empty());
    }

    // Edge case: Paragraph with only non-image records
    #[test]
    fn test_paragraph_with_other_records() {
        let mut file_header_data = vec![0u8; 256];
        file_header_data[0..32].copy_from_slice(b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
        file_header_data[32..36].copy_from_slice(&0x05000300u32.to_le_bytes());
        file_header_data[36..40].copy_from_slice(&0x01u32.to_le_bytes());
        let file_header = FileHeader::parse(&file_header_data).unwrap_or_else(|_| unreachable!());
        let doc = HwpDocument::new(file_header);

        let html = paragraph::render_paragraphs_fragment(
            &[],
            &doc,
            &HtmlOptions::default(),
        );

        // Should not panic with empty paragraphs
        assert_eq!(html, "");
    }
}