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
}