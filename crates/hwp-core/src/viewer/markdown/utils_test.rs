#[cfg(test)]
mod tests {
    use crate::viewer::markdown::utils::{is_block_element, is_text_part};

    #[test]
    fn test_is_block_element_empty_string() {
        assert!(!is_block_element(""));
    }

    #[test]
    fn test_is_block_element_text_only() {
        assert!(!is_block_element("Plain text"));
        assert!(!is_block_element("This is a paragraph"));
    }

    #[test]
    fn test_is_block_element_inline_image() {
        assert!(is_block_element("![이미지]"));
        assert!(is_block_element("![이미지](path/to/image.png)"));
    }

    #[test]
    fn test_is_block_element_table_separator() {
        assert!(is_block_element("|"));
        assert!(is_block_element("||"));
        assert!(is_block_element("|||"));
    }

    #[test]
    fn test_is_block_element_table_with_text() {
        assert!(is_block_element("| Cell1 | Cell2 |"));
        assert!(is_block_element("|---|"));
    }

    #[test]
    fn test_is_block_element_page_break() {
        assert!(is_block_element("---"));
        assert!(is_block_element("------"));
    }

    #[test]
    fn test_is_block_element_extra_dashes() {
        // Markdown page break is exactly "---" or longer
        assert!(is_block_element("----"));
        assert!(is_block_element("-----"));
    }

    #[test]
    fn test_is_text_part_empty_string() {
        assert!(is_text_part(""));
    }

    #[test]
    fn test_is_text_part_only_whitespace() {
        assert!(is_text_part("   "));
        assert!(is_text_part("\n\t"));
    }

    #[test]
    fn test_is_text_part_plain_text() {
        assert!(is_text_part("Normal text"));
        assert!(is_text_part("More text here"));
    }

    #[test]
    fn test_is_text_part_with_numbers() {
        assert!(is_text_part("Text 123"));
        assert!(is_text_part("Item 1 of 5"));
    }

    #[test]
    fn test_is_text_part_with_special_chars() {
        assert!(is_text_part("Text: Hello, World!"));
        assert!(is_text_part("Text with\nnewline"));
    }

    #[test]
    fn test_is_text_part_block_elements() {
        assert!(!is_text_part("![이미지]"));
        assert!(!is_text_part("|"));
        assert!(!is_text_part("| Cell |"));
        assert!(!is_text_part("---"));
    }

    // Note: should_process_control_header needs proper CtrlHeader setup
    // Skipping for now as we don't have a simple way to create CtrlHeader instances
    // This module is reserved for future expansion as noted in utils.rs
}
