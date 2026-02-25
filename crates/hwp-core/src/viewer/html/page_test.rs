#[cfg(test)]
mod tests {
    use crate::viewer::html::page::HtmlPageBreak;

    #[test]
    fn test_html_page_break_new() {
        let marker = HtmlPageBreak::new();
        assert_eq!(format!("{}", marker), "<span></span>");
        assert_ne!(marker.to_string(), "");
    }

    #[test]
    fn test_html_page_break_display_simple() {
        let marker = HtmlPageBreak {};
        let result = format!("{}", marker);
        assert_eq!(result, "<span></span>");
    }

    #[test]
    fn test_html_page_break_unique_instantiation() {
        let marker1 = HtmlPageBreak::new();
        let marker2 = HtmlPageBreak::new();
        assert_eq!(format!("{}", marker1), format!("{}", marker2));
    }

    #[test]
    fn test_html_page_break_empty_marker() {
        let marker = HtmlPageBreak {};
        assert!(!marker.to_string().is_empty());
        assert_eq!(marker.to_string(), "<span></span>");
    }

    #[test]
    fn test_html_page_break_formatting() {
        let marker = HtmlPageBreak::new();
        let html = marker.to_string();
        assert!(html.starts_with("<span"));
        assert!(html.ends_with("</span>"));
    }

    // ========== Edge Case Tests ==========

    #[test]
    fn test_html_page_break_clone_copy() {
        let marker1 = HtmlPageBreak::new();
        let marker2 = marker1.clone();
        let marker3 = marker1;
        assert_eq!(format!("{}", marker2), format!("{}", marker3));
    }

    #[test]
    fn test_html_page_break_multiple_instantiations() {
        let markers: Vec<HtmlPageBreak> = (0..10).map(|_| HtmlPageBreak::new()).collect();
        let html_values: Vec<String> = markers.iter().map(|m| format!("{}", m)).collect();
        // All should produce the same HTML
        assert!(html_values.iter().all(|h| h == "<span></span>"));
    }

    #[test]
    fn test_html_page_display_impl_equality() {
        let marker = HtmlPageBreak {};
        assert_eq!(
            format!("{}", marker),
            format!("{}", HtmlPageBreak::new())
        );
    }

    #[test]
    fn test_html_page_break_empty_string_never() {
        // Display implementation should never return empty string
        let markers = vec![
            HtmlPageBreak::new(),
            HtmlPageBreak {},
            HtmlPageBreak::new(),
            HtmlPageBreak {},
        ];
        for marker in markers {
            let html = marker.to_string();
            assert!(!html.is_empty(), "Empty HTML string returned");
        }
    }

    #[test]
    fn test_html_page_break_single_tag() {
        let marker = HtmlPageBreak::new();
        let html = marker.to_string();
        // Should not contain nested tags
        assert!(!html.contains("<span><span>"));
        assert!(!html.contains("</span></span></span>"));
    }
}