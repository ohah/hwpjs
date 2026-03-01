/// HTML viewer module unit tests
/// HTML 뷰어 모듈 단위 테스트
use crate::viewer::core::renderer::{Renderer, TextStyles};
use crate::viewer::html::{HtmlOptions, HtmlRenderer};

#[test]
fn test_html_options_default() {
    let options = HtmlOptions::default();

    assert_eq!(options.image_output_dir, None);
    assert_eq!(options.html_output_dir, None);
    assert_eq!(options.include_version, Some(true));
    assert_eq!(options.include_page_info, Some(false));
    assert_eq!(options.css_class_prefix, "");
}

#[test]
fn test_html_options_builder_chain() {
    let options = HtmlOptions::default()
        .with_image_output_dir(Some("/images"))
        .with_include_version(Some(false))
        .with_include_page_info(Some(true))
        .with_css_class_prefix("test-");

    assert_eq!(options.image_output_dir, Some("/images".to_string()));
    assert_eq!(options.html_output_dir, None); // No builder for html_output_dir
    assert_eq!(options.include_version, Some(false));
    assert_eq!(options.include_page_info, Some(true));
    assert_eq!(options.css_class_prefix, "test-");
}

#[test]
fn test_html_options_builder_partial() {
    let options = HtmlOptions::default()
        .with_image_output_dir(Some("/images"))
        .with_css_class_prefix("hwp-");

    assert_eq!(options.image_output_dir, Some("/images".to_string()));
    assert_eq!(options.html_output_dir, None);
    assert_eq!(options.include_version, Some(true));
    assert_eq!(options.css_class_prefix, "hwp-");
}

#[test]
fn test_html_options_builder_with_none_value() {
    let options = HtmlOptions::default()
        .with_include_version(None)
        .with_include_page_info(None);

    assert_eq!(options.include_version, None);
    assert_eq!(options.include_page_info, None);
}

#[test]
fn test_html_options_css_class_prefix_preserve_case() {
    let options = HtmlOptions::default().with_css_class_prefix("CSS-CLASS-");
    assert_eq!(options.css_class_prefix, "CSS-CLASS-");
}

#[test]
fn test_html_options_empty_prefix() {
    let options = HtmlOptions::default().with_css_class_prefix("");
    assert_eq!(options.css_class_prefix, "");
}

#[test]
fn test_render_text() {
    let renderer = HtmlRenderer;
    let text = "Hello World";
    let rendered = renderer.render_text(text, &TextStyles::default());

    assert_eq!(rendered, "Hello World");
}

#[test]
fn test_render_bold() {
    let renderer = HtmlRenderer;
    let text = "This is bold text";
    let rendered = renderer.render_bold(text);

    assert_eq!(rendered, "<b>This is bold text</b>");
}

#[test]
fn test_render_italic() {
    let renderer = HtmlRenderer;
    let text = "This is italic text";
    let rendered = renderer.render_italic(text);

    assert_eq!(rendered, "<i>This is italic text</i>");
}

#[test]
fn test_render_underline() {
    let renderer = HtmlRenderer;
    let text = "This is underlined text";
    let rendered = renderer.render_underline(text);

    assert_eq!(rendered, "<u>This is underlined text</u>");
}

#[test]
fn test_render_strikethrough() {
    let renderer = HtmlRenderer;
    let text = "This is strikethrough text";
    let rendered = renderer.render_strikethrough(text);

    assert_eq!(rendered, "<s>This is strikethrough text</s>");
}

#[test]
fn test_render_superscript() {
    let renderer = HtmlRenderer;
    let text = "X²";
    let rendered = renderer.render_superscript(text);

    // Superscript wraps the entire text with <sup> tag
    assert_eq!(rendered, "<sup>X²</sup>");
}

#[test]
fn test_render_subscript() {
    let renderer = HtmlRenderer;
    let text = "H₂O";
    let rendered = renderer.render_subscript(text);

    // Subscript wraps the entire text with <sub> tag
    assert_eq!(rendered, "<sub>H₂O</sub>");
}

#[test]
fn test_render_paragraph() {
    let renderer = HtmlRenderer;
    let content = "This is a paragraph";
    let rendered = renderer.render_paragraph(content);

    assert_eq!(rendered, "<p>This is a paragraph</p>");
}

#[test]
fn test_render_paragraph_with_complex_content() {
    let renderer = HtmlRenderer;
    let content = "Paragraph with <b>bold</b> and <i>italic</i> text.";
    let rendered = renderer.render_paragraph(content);

    assert_eq!(
        rendered,
        "<p>Paragraph with <b>bold</b> and <i>italic</i> text.</p>"
    );
}

#[test]
fn test_render_page_break() {
    let renderer = HtmlRenderer;
    let rendered = renderer.render_page_break();

    assert_eq!(rendered, "<div class=\"page-break\"><span></span></div>");
}

#[test]
fn test_render_footnote_ref() {
    let renderer = HtmlRenderer;
    let rendered = renderer.render_footnote_ref(1, "1", &HtmlOptions::default());

    assert_eq!(rendered, "<sup>[1]</sup>");
}
