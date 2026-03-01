#[cfg(test)]
mod tests {
    use crate::viewer::html::options::HtmlOptions;

    #[test]
    fn test_html_options_default() {
        let options = HtmlOptions::default();

        assert!(options.image_output_dir.is_none());
        assert!(options.html_output_dir.is_none());
        assert_eq!(options.include_version, Some(true));
        assert_eq!(options.include_page_info, Some(false));
        assert_eq!(options.css_class_prefix, "");
    }

    #[test]
    fn test_html_options_image_dir() {
        let options = HtmlOptions {
            image_output_dir: Some("/images".to_string()),
            html_output_dir: None,
            include_version: Some(true),
            include_page_info: Some(false),
            css_class_prefix: String::new(),
        };

        assert_eq!(options.image_output_dir, Some("/images".to_string()));
    }

    #[test]
    fn test_html_options_html_dir() {
        let options = HtmlOptions {
            image_output_dir: None,
            html_output_dir: Some("/html".to_string()),
            include_version: Some(true),
            include_page_info: Some(false),
            css_class_prefix: String::new(),
        };

        assert_eq!(options.html_output_dir, Some("/html".to_string()));
    }

    #[test]
    fn test_html_options_with_options() {
        let options = HtmlOptions {
            image_output_dir: Some("/images".to_string()),
            html_output_dir: Some("/html".to_string()),
            include_version: Some(false),
            include_page_info: Some(false),
            css_class_prefix: String::new(),
        };

        assert_eq!(options.image_output_dir, Some("/images".to_string()));
        assert_eq!(options.html_output_dir, Some("/html".to_string()));
        assert_eq!(options.include_version, Some(false));
        assert_eq!(options.include_page_info, Some(false));
    }

    #[test]
    fn test_html_options_with_all_options() {
        let options = HtmlOptions {
            image_output_dir: Some("/img".to_string()),
            html_output_dir: Some("/html".to_string()),
            include_version: Some(false),
            include_page_info: Some(true),
            css_class_prefix: "prefix".to_string(),
        };

        assert_eq!(options.image_output_dir, Some("/img".to_string()));
        assert_eq!(options.html_output_dir, Some("/html".to_string()));
        assert_eq!(options.include_version, Some(false));
        assert_eq!(options.include_page_info, Some(true));
        assert_eq!(options.css_class_prefix, "prefix");
    }

    #[test]
    fn test_html_options_empty_prefix() {
        let options = HtmlOptions {
            image_output_dir: None,
            html_output_dir: None,
            include_version: Some(true),
            include_page_info: Some(false),
            css_class_prefix: "".to_string(),
        };

        assert_eq!(options.css_class_prefix, "");
    }

    #[test]
    fn test_html_options_special_prefix() {
        let options = HtmlOptions {
            image_output_dir: None,
            html_output_dir: None,
            include_version: Some(true),
            include_page_info: Some(false),
            css_class_prefix: "my-app".to_string(),
        };

        assert_eq!(options.css_class_prefix, "my-app");
    }

    #[test]
    fn test_html_options_url_prefix() {
        let options = HtmlOptions {
            image_output_dir: None,
            html_output_dir: None,
            include_version: Some(true),
            include_page_info: Some(false),
            css_class_prefix: "hwp-viewer-2.0".to_string(),
        };

        assert_eq!(options.css_class_prefix, "hwp-viewer-2.0");
    }

    #[test]
    fn test_html_options_complex_paths() {
        let options = HtmlOptions {
            image_output_dir: Some("/usr/local/images/path/to/dir".to_string()),
            html_output_dir: Some("/var/www/html/my-hwp-app".to_string()),
            include_version: Some(false),
            include_page_info: Some(true),
            css_class_prefix: "site".to_string(),
        };

        assert_eq!(
            options.image_output_dir,
            Some("/usr/local/images/path/to/dir".to_string())
        );
        assert_eq!(
            options.html_output_dir,
            Some("/var/www/html/my-hwp-app".to_string())
        );
        assert!(options.image_output_dir.is_some());
        assert!(options.html_output_dir.is_some());
    }

    #[test]
    fn test_html_options_none_values() {
        let options = HtmlOptions {
            image_output_dir: None,
            html_output_dir: None,
            include_version: None,
            include_page_info: None,
            css_class_prefix: "prefix".to_string(),
        };

        assert!(options.image_output_dir.is_none());
        assert!(options.html_output_dir.is_none());
        assert_eq!(options.css_class_prefix, "prefix");
    }
}
