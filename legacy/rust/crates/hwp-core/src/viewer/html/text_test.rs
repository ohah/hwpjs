#[cfg(test)]
mod tests {
    use crate::document::bodytext::{ParaHeader, Paragraph, ParagraphRecord};
    use crate::viewer::html::text::extract_text_and_shapes;

    fn create_paragraph_with_text(text: &str) -> Paragraph {
        Paragraph {
            para_header: ParaHeader::default(),
            records: vec![ParagraphRecord::ParaText {
                text: text.to_string(),
                runs: vec![],
                control_char_positions: vec![],
                inline_control_params: vec![],
            }],
        }
    }

    fn create_paragraph_with_char_shapes() -> Paragraph {
        let mut char_shapes = Vec::with_capacity(2);

        char_shapes.push(crate::document::bodytext::CharShapeInfo {
            position: 0,
            shape_id: 12,
        });

        char_shapes.push(crate::document::bodytext::CharShapeInfo {
            position: 5,
            shape_id: 14,
        });

        Paragraph {
            para_header: ParaHeader::default(),
            records: vec![ParagraphRecord::ParaCharShape {
                shapes: char_shapes,
            }],
        }
    }

    #[test]
    fn test_extract_text_and_shapes_only_text() {
        let paragraph = create_paragraph_with_text("hello world");

        let (text, char_shapes) = extract_text_and_shapes(&paragraph);

        assert_eq!(text, "hello world");
        assert_eq!(char_shapes.len(), 0);
    }

    #[test]
    fn test_extract_text_and_shapes_with_char_shapes() {
        let paragraph = create_paragraph_with_char_shapes();

        let (text, char_shapes) = extract_text_and_shapes(&paragraph);

        assert_eq!(text, "");
        assert_eq!(char_shapes.len(), 2);
    }

    #[test]
    fn test_extract_text_and_shapes_multiple_text_records() {
        let mut paragraph = Paragraph::default();
        paragraph.records = vec![];

        paragraph.records.push(ParagraphRecord::ParaText {
            text: "first part".to_string(),
            runs: vec![],
            control_char_positions: vec![],
            inline_control_params: vec![],
        });

        paragraph.records.push(ParagraphRecord::ParaText {
            text: " second part".to_string(),
            runs: vec![],
            control_char_positions: vec![],
            inline_control_params: vec![],
        });

        let (text, char_shapes) = extract_text_and_shapes(&paragraph);

        assert_eq!(text, "first part second part");
        assert_eq!(char_shapes.len(), 0);
    }

    #[test]
    fn test_extract_text_and_shapes_mixed_records() {
        let mut paragraph = Paragraph {
            para_header: ParaHeader::default(),
            records: vec![],
        };

        paragraph.records.push(ParagraphRecord::ParaText {
            text: "text".to_string(),
            runs: vec![],
            control_char_positions: vec![],
            inline_control_params: vec![],
        });

        let char_shapes = vec![crate::document::bodytext::CharShapeInfo {
            position: 0,
            shape_id: 12,
        }];

        paragraph.records.push(ParagraphRecord::ParaCharShape {
            shapes: char_shapes,
        });

        let (text, char_shapes) = extract_text_and_shapes(&paragraph);

        assert_eq!(text, "text");
        assert_eq!(char_shapes.len(), 1);
    }

    #[test]
    fn test_extract_text_and_shapes_empty_paragraph() {
        let paragraph = Paragraph {
            para_header: ParaHeader::default(),
            records: vec![],
        };

        let (text, char_shapes) = extract_text_and_shapes(&paragraph);

        assert_eq!(text, "");
        assert_eq!(char_shapes.len(), 0);
    }

    #[test]
    fn test_extract_text_and_shapes_text_with_special_chars() {
        let paragraph = create_paragraph_with_text("hello\nworld\ttest");

        let (text, _char_shapes) = extract_text_and_shapes(&paragraph);

        assert_eq!(text, "hello\nworld\ttest");
    }

    #[test]
    fn test_extract_text_and_shapes_large_char_shapes() {
        let mut paragraph = Paragraph::default();
        paragraph.records = vec![];

        let mut char_shapes = Vec::with_capacity(10);
        for i in 0..10 {
            char_shapes.push(crate::document::bodytext::CharShapeInfo {
                position: i as u32,
                shape_id: 12 + i as u32,
            });
        }

        paragraph.records.push(ParagraphRecord::ParaCharShape {
            shapes: char_shapes,
        });

        let (text, char_shapes) = extract_text_and_shapes(&paragraph);

        assert_eq!(text, "");
        assert_eq!(char_shapes.len(), 10);
    }

    #[test]
    fn test_extract_text_and_shapes_none_records() {
        let paragraph = Paragraph {
            para_header: ParaHeader::default(),
            records: vec![],
        };

        let (text, char_shapes) = extract_text_and_shapes(&paragraph);

        assert_eq!(text, "");
        assert_eq!(char_shapes.len(), 0);
    }
}
