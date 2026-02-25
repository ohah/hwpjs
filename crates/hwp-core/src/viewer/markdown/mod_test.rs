/// Viewer Markdown module unit tests
use crate::viewer::core::renderer::Renderer;
pub use crate::viewer::markdown::*;

#[test]
fn test_markdown_options_builder() {
    // Test builder pattern for MarkdownOptions
    let options = MarkdownOptions {
        image_output_dir: Some("/output".to_string()),
        use_html: Some(true),
        include_version: Some(false),
        include_page_info: Some(false),
    };

    assert_eq!(
        options.image_output_dir,
        Some("/output".to_string())
    );
    assert_eq!(options.use_html, Some(true));
    assert_eq!(options.include_version, Some(false));
    assert_eq!(options.include_page_info, Some(false));
}

#[test]
fn test_markdown_options_with_empty() {
    let options = MarkdownOptions {
        image_output_dir: None,
        use_html: None,
        include_version: None,
        include_page_info: None,
    };

    // Empty values
    assert!(options.image_output_dir.is_none());
    assert!(options.use_html.is_none());
    assert!(options.include_version.is_none());
    assert!(options.include_page_info.is_none());
}

#[test]
fn test_markdown_options_chaining() {
    let options = MarkdownOptions {
        image_output_dir: Some("dir".to_string()),
        use_html: None,
        include_version: None,
        include_page_info: None,
    };

    // Builder override
    let options = options.with_image_output_dir(None);

    assert!(options.image_output_dir.is_none());
}

/// Markdown Renderer text rendering tests
#[test]
fn test_render_text_empty() {
    let renderer = crate::viewer::markdown::MarkdownRenderer;
    let options = crate::viewer::markdown::MarkdownOptions {
        image_output_dir: None,
        use_html: None,
        include_version: None,
        include_page_info: None,
    };

    let text = "";
    let styles = crate::viewer::core::renderer::TextStyles::default();

    assert_eq!(renderer.render_text(text, &styles), String::new());
}

#[test]
fn test_render_text_plain() {
    let renderer = crate::viewer::markdown::MarkdownRenderer;
    let options = crate::viewer::markdown::MarkdownOptions {
        image_output_dir: None,
        use_html: None,
        include_version: None,
        include_page_info: None,
    };

    let text = "Hello World";
    let styles = crate::viewer::core::renderer::TextStyles::default();

    assert_eq!(renderer.render_text(text, &styles), text.to_string());
}

#[test]
fn test_render_text_bold() {
    let renderer = crate::viewer::markdown::MarkdownRenderer;

    let text = "Bold text";
    let styles = crate::viewer::core::renderer::TextStyles {
        bold: true,
        ..Default::default()
    };

    assert_eq!(renderer.render_bold(text), format!("**{}**", text));
    assert_eq!(renderer.render_text(text, &styles), format!("**{}**", text));
}

#[test]
fn test_render_text_italic() {
    let renderer = crate::viewer::markdown::MarkdownRenderer;

    let text = "Italic text";
    let styles = crate::viewer::core::renderer::TextStyles {
        italic: true,
        ..Default::default()
    };

    assert_eq!(renderer.render_italic(text), format!("*{}*", text));
    assert_eq!(renderer.render_text(text, &styles), format!("*{}*", text));
}

#[test]
fn test_render_text_underline() {
    let renderer = crate::viewer::markdown::MarkdownRenderer;

    let text = "Underline";
    let styles = crate::viewer::core::renderer::TextStyles {
        underline: true,
        ..Default::default()
    };

    assert!(renderer.render_underline(text).contains("<u>"));
}

#[test]
fn test_render_text_strikethrough() {
    let renderer = crate::viewer::markdown::MarkdownRenderer;

    let text = "Strikethrough";
    let styles = crate::viewer::core::renderer::TextStyles {
        strikethrough: true,
        ..Default::default()
    };

    assert_eq!(renderer.render_strikethrough(text), format!("~~{}~~", text));
    assert_eq!(renderer.render_text(text, &styles), format!("~~{}~~", text));
}

#[test]
fn test_render_text_superscript() {
    let renderer = crate::viewer::markdown::MarkdownRenderer;

    let text = "Superscript";
    let styles = crate::viewer::core::renderer::TextStyles {
        superscript: true,
        ..Default::default()
    };

    assert!(renderer.render_superscript(text).contains("<sup>"));
}

#[test]
fn test_render_text_subscript() {
    let renderer = crate::viewer::markdown::MarkdownRenderer;

    let text = "Subscript";
    let styles = crate::viewer::core::renderer::TextStyles {
        subscript: true,
        ..Default::default()
    };

    assert!(renderer.render_subscript(text).contains("<sub>"));
}

#[test]
fn test_render_text_multiple_styles() {
    let renderer = crate::viewer::markdown::MarkdownRenderer;

    let text = "Styled text";
    let styles = crate::viewer::core::renderer::TextStyles {
        bold: true,
        italic: true,
        underline: true,
        strikethrough: true,
        superscript: true,
        subscript: true,
        ..Default::default()
    };

    let result = renderer.render_text(text, &styles);
    // Check basic structure
    assert!(result.contains("**"));
    assert!(result.contains("*"));
    assert!(result.contains("<u>"));
    assert!(result.contains("~~"));
    assert!(result.contains("<sup>"));
    assert!(result.contains("<sub>"));
}

#[test]
fn test_render_paragraph() {
    let renderer = crate::viewer::markdown::MarkdownRenderer;

    let content = "Paragraph content";
    assert_eq!(renderer.render_paragraph(content), content);
}

#[test]
fn test_render_page_break() {
    let renderer = crate::viewer::markdown::MarkdownRenderer;

    let result = renderer.render_page_break();
    assert!(result.contains("---\n"));
}

#[test]
fn test_render_footnote_ref() {
    let renderer = crate::viewer::markdown::MarkdownRenderer;
    let options = crate::viewer::markdown::MarkdownOptions {
        image_output_dir: None,
        use_html: None,
        include_version: None,
        include_page_info: None,
    };

    let ref_id = 1u32;
    let number = "1";
    assert_eq!(renderer.render_footnote_ref(ref_id, number, &options), "[^1]");
}

#[test]
fn test_render_endnote_ref() {
    let renderer = crate::viewer::markdown::MarkdownRenderer;
    let options = crate::viewer::markdown::MarkdownOptions {
        image_output_dir: None,
        use_html: None,
        include_version: None,
        include_page_info: None,
    };

    let ref_id = 1u32;
    let number = "1";
    assert_eq!(renderer.render_endnote_ref(ref_id, number, &options), "[^1]");
}

#[test]
fn test_render_footnote_back() {
    let renderer = crate::viewer::markdown::MarkdownRenderer;
    let options = crate::viewer::markdown::MarkdownOptions {
        image_output_dir: None,
        use_html: None,
        include_version: None,
        include_page_info: None,
    };

    let ref_id = "note-1";
    assert_eq!(renderer.render_footnote_back(ref_id, &options), "");
}

#[test]
fn test_render_endnote_back() {
    let renderer = crate::viewer::markdown::MarkdownRenderer;
    let options = crate::viewer::markdown::MarkdownOptions {
        image_output_dir: None,
        use_html: None,
        include_version: None,
        include_page_info: None,
    };

    let ref_id = "endnote-1";
    assert_eq!(renderer.render_endnote_back(ref_id, &options), "");
}

#[test]
fn test_render_outline_number() {
    let renderer = crate::viewer::markdown::MarkdownRenderer;

    let content = "Heading";
    let result = renderer.render_outline_number(1, 1, content);
    // Level 1 produces format "{}.", e.g., "1."
    assert!(result.starts_with("1.")); // 1: level, 1: number
    assert!(result.contains("Heading"));
}

#[test]
fn test_render_outline_number_level_3() {
    let renderer = crate::viewer::markdown::MarkdownRenderer;

    let content = "Subheading";
    let result = renderer.render_outline_number(3, 2, content);
    // Level 3 produces "{})", e.g., "2)"
    assert!(result.contains(")")); // 3: level, 2: number
    assert!(result.contains("Subheading"));
}

#[test]
fn test_render_text_none() {
    let renderer = crate::viewer::markdown::MarkdownRenderer;
    let styles = crate::viewer::core::renderer::TextStyles::default();

    let result = renderer.render_text("", &styles);
    // Empty string should result in no output
    assert_eq!(result, String::new());
}

#[test]
fn test_render_convert_control_to_markdown() {
    // Test control conversion function exists
    // Placeholder test - actual test would need proper input
    // The function would be: convert_control_to_markdown(ctrl_id, data)
}

#[test]
fn test_render_convert_table_to_markdown() {
    // Test table conversion function exists
    // Placeholder test - actual test would need proper input
    // The function call would be: convert_table_to_markdown(table_data)
}