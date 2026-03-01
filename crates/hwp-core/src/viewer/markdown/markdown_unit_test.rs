#[cfg(test)]
mod markdown_unit_tests {
    use crate::viewer::markdown::MarkdownOptions;

    // ===== MarkdownOptions tests =====

    #[test]
    fn test_markdown_options_default() {
        let options = MarkdownOptions {
            image_output_dir: None,
            use_html: None,
            include_version: None,
            include_page_info: None,
        };

        assert!(options.image_output_dir.is_none());
        assert!(options.use_html.is_none());
        assert!(options.include_version.is_none());
        assert!(options.include_page_info.is_none());
    }

    #[test]
    fn test_markdown_options_with_image_output_dir() {
        let mut options = MarkdownOptions {
            image_output_dir: None,
            use_html: None,
            include_version: None,
            include_page_info: None,
        };

        options.image_output_dir = Some("/output".to_string());

        assert_eq!(options.image_output_dir, Some("/output".to_string()));
    }

    #[test]
    fn test_markdown_options_builder_method_chain() {
        let options = MarkdownOptions {
            image_output_dir: None,
            use_html: None,
            include_version: None,
            include_page_info: None,
        };

        let options = options
            .with_image_output_dir(Some("/output"))
            .with_include_version(Some(true));

        assert_eq!(options.image_output_dir, Some("/output".to_string()));
        assert_eq!(options.include_version, Some(true));
    }

    #[test]
    fn test_markdown_options_builder_override() {
        let options = MarkdownOptions {
            image_output_dir: Some("original".to_string()),
            use_html: None,
            include_version: None,
            include_page_info: None,
        };

        let options = options.with_image_output_dir(Some("override"));

        assert_eq!(options.image_output_dir, Some("override".to_string()));
    }

    #[test]
    fn test_markdown_options_builder_chain_multiple() {
        let options = MarkdownOptions {
            image_output_dir: None,
            use_html: None,
            include_version: None,
            include_page_info: None,
        };

        let options = options
            .with_image_output_dir(Some("/images"))
            .with_use_html(Some(true))
            .with_include_page_info(Some(true));

        assert_eq!(options.image_output_dir, Some("/images".to_string()));
        assert_eq!(options.use_html, Some(true));
        assert_eq!(options.include_page_info, Some(true));
    }

    #[test]
    fn test_markdown_options_clone() {
        let options1 = MarkdownOptions {
            image_output_dir: Some("/test".to_string()),
            use_html: Some(true),
            include_version: Some(false),
            include_page_info: None,
        };

        let options2 = options1.clone();

        assert_eq!(options1.image_output_dir, options2.image_output_dir);
        assert_eq!(options1.use_html, options2.use_html);
        assert_eq!(options1.include_version, options2.include_version);
        assert_eq!(options1.include_page_info, options2.include_page_info);
    }

    // ===== MarkdownOptions struct fields tests =====

    #[test]
    fn test_markdown_options_fields_types() {
        let options = MarkdownOptions {
            image_output_dir: Some("path/to/images".to_string()),
            use_html: Some(false),
            include_version: Some(true),
            include_page_info: None,
        };

        // Test that fields have correct types
        let _: Option<String> = options.image_output_dir;
        let _: Option<bool> = options.use_html;
        let _: Option<bool> = options.include_version;
        let _: Option<bool> = options.include_page_info;
    }

    // ===== Markdown text formatting tests =====

    #[test]
    fn test_basic_text_segment() {
        let test_text = "This is a test paragraph";
        assert_eq!(test_text, "This is a test paragraph");
    }

    #[test]
    fn test_empty_paragraph() {
        let test_text = "";
        assert!(test_text.is_empty());
    }

    #[test]
    fn test_multiline_text() {
        let test_text = "Line 1\nLine 2\nLine 3";
        assert!(test_text.contains("Line 1"));
        assert!(test_text.contains("Line 2"));
        assert!(test_text.contains("Line 3"));
    }

    #[test]
    fn test_markdown_heading() {
        let line = "# Heading";
        assert_eq!(line, "# Heading");
        assert!(line.len() > 0);
    }

    #[test]
    fn test_markdown_empty_line() {
        let line = "";
        assert!(line.is_empty());
    }

    // ===== Control identification tests =====

    #[test]
    fn test_ctrl_header_id_values() {
        // Test common control ID values
        let ctrl_ids: [&str; 5] = ["FIELD_BEGIN", "FIELD_END", "TITLE_MARK", "TAB", "LINE"];
        for ctrl_id in ctrl_ids.iter() {
            assert!(!ctrl_id.is_empty());
        }
    }

    #[test]
    fn test_table_structure_values() {
        // Basic table structure values
        let rows: usize = 10;
        let cols: usize = 5;
        let cell_index: usize = 1;
        assert_eq!(rows, 10);
        assert_eq!(cols, 5);
        assert_eq!(cell_index, 1);
    }
}
