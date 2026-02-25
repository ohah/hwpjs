/// Viewer Markdown module unit tests
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

// TODO: Add unit tests for convert_control_to_markdown and convert_table_to_markdown
// These functions require proper input data matching the actual structure of HWP control headers and tables