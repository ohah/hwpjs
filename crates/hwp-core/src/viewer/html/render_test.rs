#[cfg(test)]
mod tests {
    use super::HtmlRenderer;
    use crate::viewer::html::HtmlOptions;
    use crate::viewer::core::renderer::{TextStyles, DocumentParts};

    // ===== Text Styling Tests =====

    #[test]
    fn test_render_text_plain() {
        let renderer = HtmlRenderer;
        let styles = TextStyles::default();
        assert_eq!(
            renderer.render_text("hello", &styles),
            "hello"
        );
    }

    #[test]
    fn test_render_text_special_chars() {
        let renderer = HtmlRenderer;
        let styles = TextStyles::default();
        assert_eq!(
            renderer.render_text("hello world!", &styles),
            "hello world!"
        );
        assert_eq!(
            renderer.render_text("한글 Korean 日本語", &styles),
            "한글 Korean 日本語"
        );
    }

    #[test]
    fn test_render_text_empty() {
        let renderer = HtmlRenderer;
        let styles = TextStyles::default();
        assert_eq!(renderer.render_text("", &styles), "");
    }

    #[test]
    fn test_render_bold() {
        let renderer = HtmlRenderer;
        assert_eq!(renderer.render_bold("hello"), "<b>hello</b>");
    }

    #[test]
    fn test_render_bold_with_special_chars() {
        let renderer = HtmlRenderer;
        assert_eq!(
            renderer.render_bold("hello<span>world</span>"),
            "<b>hello<span>world</span></b>"
        );
    }

    #[test]
    fn test_render_italic() {
        let renderer = HtmlRenderer;
        assert_eq!(renderer.render_italic("hello"), "<i>hello</i>");
    }

    #[test]
    fn test_render_underline() {
        let renderer = HtmlRenderer;
        assert_eq!(renderer.render_underline("hello"), "<u>hello</u>");
    }

    #[test]
    fn test_render_strikethrough() {
        let renderer = HtmlRenderer;
        assert_eq!(renderer.render_strikethrough("hello"), "<s>hello</s>");
    }

    #[test]
    fn test_render_superscript() {
        let renderer = HtmlRenderer;
        assert_eq!(renderer.render_superscript("hello"), "<sup>hello</sup>");
    }

    #[test]
    fn test_render_subscript() {
        let renderer = HtmlRenderer;
        assert_eq!(renderer.render_subscript("hello"), "<sub>hello</sub>");
    }

    #[test]
    fn test_render_text_with_styles() {
        let renderer = HtmlRenderer;
        let styles = TextStyles {
            bold: true,
            italic: true,
            underline: true,
            ..Default::default()
        };
        assert_eq!(
            renderer.render_text("hello", &styles),
            "hello"
        );
    }

    // ===== Structure Elements Tests =====

    #[test]
    fn test_render_paragraph() {
        let renderer = HtmlRenderer;
        assert_eq!(renderer.render_paragraph("hello"), "<p>hello</p>");
    }

    #[test]
    fn test_render_paragraph_multiline() {
        let renderer = HtmlRenderer;
        assert_eq!(
            renderer.render_paragraph("hello\nworld"),
            "<p>hello\nworld</p>"
        );
    }

    #[test]
    fn test_render_table() {
        let renderer = HtmlRenderer;
        let table = crate::document::bodytext::Table::new_test();
        let options = HtmlOptions::default();
        let doc = crate::document::HwpDocument::new_test();
        assert_eq!(renderer.render_table(&table, &doc, &options), "<table></table>");
    }

    #[test]
    fn test_render_page_break() {
        let renderer = HtmlRenderer;
        let result = renderer.render_page_break();
        assert!(result.contains("<div class=\"page-break\">"));
        assert!(result.contains("<span></span>"));
    }

    #[test]
    fn test_render_page_break_unique() {
        let renderer = HtmlRenderer;
        let result1 = renderer.render_page_break();
        let result2 = renderer.render_page_break();
        assert_eq!(result1, result2);
    }

    // ===== Document Structure Tests =====

    #[test]
    fn test_render_document_with_headers() {
        let renderer = HtmlRenderer;
        let options = HtmlOptions::default();
        let doc = crate::document::HwpDocument::new_test();
        let parts = DocumentParts {
            headers: vec!["Header 1".to_string(), "Header 2".to_string()],
            ..Default::default()
        };
        let result = renderer.render_document(&parts, &doc, &options);
        assert!(result.contains("<div class=\"header\">Header 1</div>"));
        assert!(result.contains("<div class=\"header\">Header 2</div>"));
    }

    #[test]
    fn test_render_document_with_body() {
        let renderer = HtmlRenderer;
        let options = HtmlOptions::default();
        let doc = crate::document::HwpDocument::new_test();
        let parts = DocumentParts {
            body_lines: vec!["Line 1".to_string(), "Line 2".to_string()],
            ..Default::default()
        };
        let result = renderer.render_document(&parts, &doc, &options);
        assert!(result.contains("<div class=\"body\">"));
        assert!(result.contains("Line 1"));
        assert!(result.contains("Line 2"));
    }

    #[test]
    fn test_render_document_with_footers() {
        let renderer = HtmlRenderer;
        let options = HtmlOptions::default();
        let doc = crate::document::HwpDocument::new_test();
        let parts = DocumentParts {
            footers: vec!["Footer 1".to_string(), "Footer 2".to_string()],
            ..Default::default()
        };
        let result = renderer.render_document(&parts, &doc, &options);
        assert!(result.contains("<div class=\"footer\">Footer 1</div>"));
        assert!(result.contains("<div class=\"footer\">Footer 2</div>"));
    }

    #[test]
    fn test_render_document_with_footnotes() {
        let renderer = HtmlRenderer;
        let options = HtmlOptions::default();
        let doc = crate::document::HwpDocument::new_test();
        let parts = DocumentParts {
            footnotes: vec!["Footnote 1 content".to_string()],
            ..Default::default()
        };
        let result = renderer.render_document(&parts, &doc, &options);
        assert!(result.contains("<sup>1</sup>"));
        assert!(result.contains("Footnote 1 content"));
    }

    #[test]
    fn test_render_document_empty_parts() {
        let renderer = HtmlRenderer;
        let options = HtmlOptions::default();
        let doc = crate::document::HwpDocument::new_test();
        let parts = DocumentParts::default();
        let result = renderer.render_document(&parts, &doc, &options);
        assert_eq!(result, "<div class=\"body\"></div>");
    }

    #[test]
    fn test_render_document_header() {
        let renderer = HtmlRenderer;
        let options = HtmlOptions::default();
        let doc = crate::document::HwpDocument::new_test();
        let result = renderer.render_document_header(&doc, &options);
        assert_eq!(result, "");
    }

    #[test]
    fn test_render_document_footer() {
        let renderer = HtmlRenderer;
        let options = HtmlOptions::default();
        let doc = crate::document::HwpDocument::new_test();
        let parts = DocumentParts::default();
        let result = renderer.render_document_footer(&parts, &options);
        assert_eq!(result, "");
    }

    // ===== Special Elements Tests =====

    #[test]
    fn test_render_footnote_ref() {
        let renderer = HtmlRenderer;
        let options = HtmlOptions::default();
        assert_eq!(renderer.render_footnote_ref(1, "1", &options), "<sup>[1]</sup>");
    }

    #[test]
    fn test_render_endnote_ref() {
        let renderer = HtmlRenderer;
        let options = HtmlOptions::default();
        assert_eq!(renderer.render_endnote_ref(1, "1", &options), "<sup>[1]</sup>");
    }

    #[test]
    fn test_render_footnote_back() {
        let renderer = HtmlRenderer;
        let options = HtmlOptions::default();
        assert_eq!(renderer.render_footnote_back("ref1", &options), "");
    }

    #[test]
    fn test_render_endnote_back() {
        let renderer = HtmlRenderer;
        let options = HtmlOptions::default();
        assert_eq!(renderer.render_endnote_back("ref1", &options), "");
    }

    #[test]
    fn test_render_outline_number() {
        let renderer = HtmlRenderer;
        assert_eq!(renderer.render_outline_number(0, 1, "content"), "1.");
        assert_eq!(renderer.render_outline_number(1, 1, "content"), "1.1");
        assert_eq!(renderer.render_outline_number(1, 2, "content"), "1.2");
        assert_eq!(renderer.render_outline_number(2, 5, "content"), "1.2.5");
    }

    // ===== Edge Cases =====

    #[test]
    fn test_render_text_multiple_special_chars() {
        let renderer = HtmlRenderer;
        let styles = TextStyles::default();
        assert_eq!(
            renderer.render_text("hello<>\"&'world", &styles),
            "hello<>\"&'world"
        );
    }

    #[test]
    fn test_render_bold_empty() {
        let renderer = HtmlRenderer;
        assert_eq!(renderer.render_bold(""), "<b></b>");
    }

    #[test]
    fn test_render_italic_with_bold_tags() {
        let renderer = HtmlRenderer;
        assert_eq!(renderer.render_italic("<b>Hello</b>"), "<i><b>Hello</b></i>");
    }

    #[test]
    fn test_render_paragraph_with_html_tags() {
        let renderer = HtmlRenderer;
        assert_eq!(
            renderer.render_paragraph("<strong>bold</strong> text"),
            "<p><strong>bold</strong> text</p>"
        );
    }
}