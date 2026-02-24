#[cfg(test)]
mod tests {
    use crate::viewer::core::renderer::TextStyles;
    use crate::viewer::html::render::HtmlRenderer;
    use crate::viewer::core::renderer::Renderer;

    #[test]
    fn test_render_text() {
        let renderer = HtmlRenderer;
        assert_eq!(renderer.render_text("hello", &TextStyles::default()), "hello");
        assert_eq!(renderer.render_text("world", &TextStyles::default()), "world");
        assert_eq!(renderer.render_text("  ", &TextStyles::default()), "  ");
    }

    #[test]
    fn test_render_bold() {
        let renderer = HtmlRenderer;
        assert_eq!(renderer.render_bold("bold text"), "<b>bold text</b>");
        assert_eq!(renderer.render_bold("single"), "<b>single</b>");
    }

    #[test]
    fn test_render_italic() {
        let renderer = HtmlRenderer;
        assert_eq!(renderer.render_italic("italic text"), "<i>italic text</i>");
        assert_eq!(renderer.render_italic("emphasis"), "<i>emphasis</i>");
    }

    #[test]
    fn test_render_underline() {
        let renderer = HtmlRenderer;
        assert_eq!(renderer.render_underline("underlined"), "<u>underlined</u>");
    }

    #[test]
    fn test_render_strikethrough() {
        let renderer = HtmlRenderer;
        assert_eq!(renderer.render_strikethrough("deleted"), "<s>deleted</s>");
    }

    #[test]
    fn test_render_superscript() {
        let renderer = HtmlRenderer;
        assert_eq!(renderer.render_superscript("2"), "<sup>2</sup>");
        assert_eq!(renderer.render_superscript("x²"), "<sup>x²</sup>");
    }

    #[test]
    fn test_render_subscript() {
        let renderer = HtmlRenderer;
        assert_eq!(renderer.render_subscript("2"), "<sub>2</sub>");
        assert_eq!(renderer.render_subscript("water"), "<sub>water</sub>");
    }

    #[test]
    fn test_methods_without_text_styles() {
        let renderer = HtmlRenderer;
        let text = "test content";
        assert_eq!(renderer.render_bold(text), format!("<b>{}</b>", text));
        assert_eq!(renderer.render_italic(text), format!("<i>{}</i>", text));
        assert_eq!(renderer.render_underline(text), format!("<u>{}</u>", text));
    }

    #[test]
    fn test_empty_inputs() {
        let renderer = HtmlRenderer;
        assert_eq!(renderer.render_text("", &TextStyles::default()), "");
        assert_eq!(renderer.render_bold(""), "<b></b>");
        assert_eq!(renderer.render_italic(""), "<i></i>");
    }

    #[test]
    fn test_special_characters() {
        let renderer = HtmlRenderer;
        assert_eq!(renderer.render_bold("a < b > c"), "<b>a < b > c</b>");
        assert_eq!(renderer.render_italic("test & test"), "<i>test & test</i>");
        assert_eq!(renderer.render_bold("a\"b"), "<b>a\"b</b>");
    }

    #[test]
    fn test_multiline_text() {
        let renderer = HtmlRenderer;
        let text = "line1\nline2\nline3";
        assert_eq!(renderer.render_bold(text), format!("<b>{}</b>", text));
        assert_eq!(renderer.render_italic(text), format!("<i>{}</i>", text));
    }

    #[test]
    fn test_with_styles() {
        let renderer = HtmlRenderer;
        let styles = TextStyles::default();
        let text = "styled text";
        assert_eq!(renderer.render_text(text, &styles), text);
    }

    #[test]
    fn test_paragraph_styling_methods() {
        let renderer = HtmlRenderer;
        // Test that all text styling methods exist and return correct HTML
        assert_eq!(renderer.render_bold("A"), "<b>A</b>");
        assert_eq!(renderer.render_italic("B"), "<i>B</i>");
        assert_eq!(renderer.render_underline("C"), "<u>C</u>");
        assert_eq!(renderer.render_superscript("x²"), "<sup>x²</sup>");
        assert_eq!(renderer.render_subscript("H₂O"), "<sub>H₂O</sub>");
        assert_eq!(renderer.render_strikethrough("done"), "<s>done</s>");
    }

    #[test]
    fn test_long_text_styling() {
        let renderer = HtmlRenderer;
        let long_text = "This is a long text that needs to be formatted correctly for testing purposes. It should wrap properly and preserve all characters.";
        assert_eq!(renderer.render_bold(long_text), format!("<b>{}</b>", long_text));
        assert_eq!(renderer.render_italic(long_text), format!("<i>{}</i>", long_text));
    }
}