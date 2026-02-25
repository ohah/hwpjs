/// Renderer module unit tests
pub use crate::viewer::core::renderer::{TextStyles, DocumentParts};

#[cfg(test)]
mod tests {
    use super::*;

    // ========== TextStyles Tests ==========

    #[test]
    fn test_text_styles_default() {
        let styles = TextStyles::default();
        assert_eq!(styles.bold, false);
        assert_eq!(styles.italic, false);
        assert_eq!(styles.underline, false);
        assert_eq!(styles.strikethrough, false);
        assert_eq!(styles.superscript, false);
        assert_eq!(styles.subscript, false);
        assert_eq!(styles.font_family, None);
        assert_eq!(styles.font_size, None);
        assert_eq!(styles.color, None);
        assert_eq!(styles.background_color, None);
    }

    #[test]
    fn test_text_styles_mutate_bold() {
        let mut styles = TextStyles::default();
        assert!(!styles.bold);
        styles.bold = true;
        assert!(styles.bold);
    }

    #[test]
    fn test_text_styles_mutate_italic() {
        let mut styles = TextStyles::default();
        assert!(!styles.italic);
        styles.italic = true;
        assert!(styles.italic);
    }

    #[test]
    fn test_text_styles_mutate_underline() {
        let mut styles = TextStyles::default();
        assert!(!styles.underline);
        styles.underline = true;
        assert!(styles.underline);
    }

    #[test]
    fn test_text_styles_mutate_strikethrough() {
        let mut styles = TextStyles::default();
        assert!(!styles.strikethrough);
        styles.strikethrough = true;
        assert!(styles.strikethrough);
    }

    #[test]
    fn test_text_styles_mutate_superscript() {
        let mut styles = TextStyles::default();
        assert!(!styles.superscript);
        styles.superscript = true;
        assert!(styles.superscript);
    }

    #[test]
    fn test_text_styles_mutate_subscript() {
        let mut styles = TextStyles::default();
        assert!(!styles.subscript);
        styles.subscript = true;
        assert!(styles.subscript);
    }

    #[test]
    fn test_text_styles_mutate_font_family() {
        let mut styles = TextStyles::default();
        assert!(styles.font_family.is_none());
        styles.font_family = Some("malgun Gothic".to_string());
        assert_eq!(styles.font_family, Some("malgun Gothic".to_string()));
    }

    #[test]
    fn test_text_styles_mutate_font_size() {
        let mut styles = TextStyles::default();
        assert!(styles.font_size.is_none());
        styles.font_size = Some(12.0);
        assert_eq!(styles.font_size, Some(12.0));
    }

    #[test]
    fn test_text_styles_mutate_color() {
        let mut styles = TextStyles::default();
        assert!(styles.color.is_none());
        styles.color = Some("#FF0000".to_string());
        assert_eq!(styles.color, Some("#FF0000".to_string()));
    }

    #[test]
    fn test_text_styles_mutate_background_color() {
        let mut styles = TextStyles::default();
        assert!(styles.background_color.is_none());
        styles.background_color = Some("#FFFF00".to_string());
        assert_eq!(styles.background_color, Some("#FFFF00".to_string()));
    }

    #[test]
    fn test_text_styles_clone() {
        let original = TextStyles {
            bold: true,
            italic: false,
            underline: true,
            strikethrough: false,
            superscript: false,
            subscript: false,
            font_family: Some("test".to_string()),
            font_size: Some(14.0),
            color: Some("#0000FF".to_string()),
            background_color: Some("#000000".to_string()),
        };

        let cloned = original.clone();
        assert_eq!(original.bold, cloned.bold);
        assert_eq!(original.italic, cloned.italic);
        assert_eq!(original.font_family, cloned.font_family);
        assert_eq!(original.font_size, cloned.font_size);
    }

    #[test]
    fn test_text_styles_clone_deep_copy() {
        let original = TextStyles {
            bold: true,
            font_family: Some("test".to_string()),
            ..Default::default()
        };

        let mut cloned = original.clone();
        cloned.font_family = Some("modified".to_string());

        // Original should not be affected
        assert_eq!(original.font_family, Some("test".to_string()));
        // Cloned should have the modified value
        assert_eq!(cloned.font_family, Some("modified".to_string()));
    }

    // ========== DocumentParts Tests ==========

    #[test]
    fn test_document_parts_default() {
        let parts = DocumentParts::default();
        assert_eq!(parts.headers.len(), 0);
        assert_eq!(parts.body_lines.len(), 0);
        assert_eq!(parts.footers.len(), 0);
        assert_eq!(parts.footnotes.len(), 0);
        assert_eq!(parts.endnotes.len(), 0);
    }

    #[test]
    fn test_document_parts_mutate_headers() {
        let mut parts = DocumentParts::default();
        assert_eq!(parts.headers.len(), 0);

        parts.headers.push("Header 1".to_string());
        parts.headers.push("Header 2".to_string());

        assert_eq!(parts.headers.len(), 2);
        assert_eq!(parts.headers[0], "Header 1");
        assert_eq!(parts.headers[1], "Header 2");
    }

    #[test]
    fn test_document_parts_mutate_body_lines() {
        let mut parts = DocumentParts::default();
        parts.body_lines.push("First line".to_string());
        parts.body_lines.push("Second line".to_string());
        parts.body_lines.push("Third line".to_string());

        assert_eq!(parts.body_lines.len(), 3);
        assert_eq!(parts.body_lines[0], "First line");
        assert_eq!(parts.body_lines[1], "Second line");
        assert_eq!(parts.body_lines[2], "Third line");
    }

    #[test]
    fn test_document_parts_mutate_footers() {
        let mut parts = DocumentParts::default();
        parts.footers.push("Footer 1".to_string());
        parts.footers.push("Footer 2".to_string());

        assert_eq!(parts.footers.len(), 2);
        assert_eq!(parts.footers.get(0), Some(&"Footer 1".to_string()));
        assert_eq!(parts.footers.get(1), Some(&"Footer 2".to_string()));
    }

    #[test]
    fn test_document_parts_mutate_footnotes() {
        let mut parts = DocumentParts::default();
        parts.footnotes.push("Footnote 1".to_string());
        parts.footnotes.push("Footnote 2".to_string());

        assert_eq!(parts.footnotes.len(), 2);
        assert_eq!(parts.footnotes, vec!["Footnote 1".to_string(), "Footnote 2".to_string()]);
    }

    #[test]
    fn test_document_parts_mutate_endnotes() {
        let mut parts = DocumentParts::default();
        parts.endnotes.push("Endnote 1".to_string());
        parts.endnotes.push("Endnote 2".to_string());

        assert_eq!(parts.endnotes.len(), 2);
        assert_eq!(parts.endnotes, vec!["Endnote 1".to_string(), "Endnote 2".to_string()]);
    }

    #[test]
    fn test_document_parts_clear_all() {
        let mut parts = DocumentParts::default();

        parts.headers.push("Header".to_string());
        parts.body_lines.push("Body".to_string());
        parts.footers.push("Footer".to_string());
        parts.footnotes.push("Footnote".to_string());
        parts.endnotes.push("Endnote".to_string());

        assert_eq!(parts.headers.len(), 1);
        assert_eq!(parts.body_lines.len(), 1);
        assert_eq!(parts.footers.len(), 1);
        assert_eq!(parts.footnotes.len(), 1);
        assert_eq!(parts.endnotes.len(), 1);

        parts.headers.clear();
        parts.body_lines.clear();
        parts.footers.clear();
        parts.footnotes.clear();
        parts.endnotes.clear();

        assert_eq!(parts.headers.len(), 0);
        assert_eq!(parts.body_lines.len(), 0);
        assert_eq!(parts.footers.len(), 0);
        assert_eq!(parts.footnotes.len(), 0);
        assert_eq!(parts.endnotes.len(), 0);
    }

    #[test]
    fn test_document_parts_clone() {
        let original = DocumentParts {
            headers: vec!["h1".to_string(), "h2".to_string()],
            body_lines: vec!["line1".to_string(), "line2".to_string()],
            footers: vec!["f1".to_string()],
            footnotes: vec![],
            endnotes: vec!["e1".to_string()],
        };

        let cloned = original.clone();

        assert_eq!(original.headers, cloned.headers);
        assert_eq!(original.body_lines, cloned.body_lines);
        assert_eq!(original.footers, cloned.footers);
        assert_eq!(original.footnotes, cloned.footnotes);
        assert_eq!(original.endnotes, cloned.endnotes);
    }

    #[test]
    fn test_document_parts_clone_deep_copy() {
        let mut original = DocumentParts {
            headers: vec!["h1".to_string()],
            body_lines: vec!["line1".to_string()],
            ..Default::default()
        };

        let mut cloned = original.clone();
        cloned.headers.push("h2".to_string());

        // Headers in original should not be affected
        assert_eq!(original.headers, vec!["h1".to_string()]);
        // Cloned headers should have both
        assert_eq!(cloned.headers, vec!["h1".to_string(), "h2".to_string()]);
    }
}