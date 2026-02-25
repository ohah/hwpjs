/// Renderer trait unit tests
/// Renderer trait 및 관련 구조체 테스트

#[cfg(test)]
mod tests {
    use super::super::renderer::{DocumentParts, Renderer, TextStyles};

    #[test]
    fn test_text_styles_default() {
        let styles = TextStyles::default();
        assert_eq!(styles.bold, false);
        assert_eq!(styles.italic, false);
        assert_eq!(styles.underline, false);
        assert_eq!(styles.strikethrough, false);
        assert_eq!(styles.superscript, false);
        assert_eq!(styles.subscript, false);
        assert!(styles.font_family.is_none());
        assert!(styles.font_size.is_none());
        assert!(styles.color.is_none());
        assert!(styles.background_color.is_none());
    }

    #[test]
    fn test_text_styles_with_values() {
        let mut styles = TextStyles::default();
        styles.bold = true;
        styles.italic = true;
        styles.font_family = Some("Arial".to_string());
        styles.font_size = Some(14.0);
        styles.color = Some("#FF0000".to_string());

        assert_eq!(styles.bold, true);
        assert_eq!(styles.italic, true);
        assert_eq!(styles.font_family, Some("Arial".to_string()));
        assert_eq!(styles.font_size, Some(14.0));
        assert_eq!(styles.color, Some("#FF0000".to_string()));
    }

    #[test]
    fn test_text_styles_clone() {
        let styles1 = TextStyles {
            bold: true,
            italic: true,
            underline: false,
            strikethrough: false,
            superscript: false,
            subscript: false,
            font_family: Some("Arial".to_string()),
            font_size: Some(12.0),
            color: Some("#0000FF".to_string()),
            background_color: Some("#FFFFFF".to_string()),
        };

        let styles2 = styles1.clone();

        assert_eq!(styles1.bold, styles2.bold);
        assert_eq!(styles1.italic, styles2.italic);
        assert_eq!(styles1.font_family, styles2.font_family);
        assert_eq!(styles1.font_size, styles2.font_size);
        assert_eq!(styles1.color, styles2.color);
        assert_eq!(styles1.background_color, styles2.background_color);
    }

    #[test]
    fn test_text_styles_debug() {
        let styles = TextStyles::default();
        let debug_str = format!("{:?}", styles);
        assert!(debug_str.contains("TextStyles"));
        assert!(debug_str.contains("bold"));
        assert!(debug_str.contains("italic"));
    }

    #[test]
    fn test_document_parts_default() {
        let parts = DocumentParts::default();
        assert!(parts.headers.is_empty());
        assert!(parts.body_lines.is_empty());
        assert!(parts.footers.is_empty());
        assert!(parts.footnotes.is_empty());
        assert!(parts.endnotes.is_empty());
    }

    #[test]
    fn test_document_parts_with_values() {
        let mut parts = DocumentParts::default();
        parts.headers = vec!["Title".to_string()];
        parts.body_lines = vec!["Line 1".to_string(), "Line 2".to_string()];
        parts.footers = vec!["Footer".to_string()];
        parts.footnotes = vec!["Footnote".to_string()];

        assert_eq!(parts.headers, vec!["Title"]);
        assert_eq!(parts.body_lines.len(), 2);
        assert_eq!(parts.footers, vec!["Footer"]);
        assert_eq!(parts.footnotes, vec!["Footnote"]);
        assert!(parts.endnotes.is_empty());
    }

    #[test]
    fn test_document_parts_clone() {
        let parts1 = DocumentParts {
            headers: vec!["Header 1".to_string(), "Header 2".to_string()],
            body_lines: vec!["Body".to_string()],
            footers: vec!["Footer".to_string()],
            footnotes: vec!["FN 1".to_string()],
            endnotes: vec!["EN 1".to_string()],
        };

        let parts2 = parts1.clone();

        assert_eq!(parts1.headers, parts2.headers);
        assert_eq!(parts1.body_lines, parts2.body_lines);
        assert_eq!(parts1.footers, parts2.footers);
        assert_eq!(parts1.footnotes, parts2.footnotes);
        assert_eq!(parts1.endnotes, parts2.endnotes);
    }

    #[test]
    fn test_document_parts_multiple_footers_and_footnotes() {
        let mut parts = DocumentParts::default();
        parts.headers = vec![];
        parts.body_lines = vec![];
        parts.footers = vec!["Footer 1".to_string(), "Footer 2".to_string()];
        parts.footnotes = vec!["FN 1".to_string(), "FN 2".to_string()];
        parts.endnotes = vec!["EN 1".to_string(), "EN 2".to_string()];

        assert_eq!(parts.footers.len(), 2);
        assert_eq!(parts.footnotes.len(), 2);
        assert_eq!(parts.endnotes.len(), 2);
        assert_eq!(parts.footers[0], "Footer 1");
        assert_eq!(parts.footnotes[1], "FN 2");
    }
}