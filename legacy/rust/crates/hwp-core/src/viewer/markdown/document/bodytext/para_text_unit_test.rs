#[cfg(test)]
mod tests {
    use crate::viewer::markdown::document::bodytext::para_text::{
        char_index_to_byte_index, is_meaningful_text,
    };

    #[test]
    fn test_is_meaningful_text_empty_string() {
        assert!(!is_meaningful_text("", &[]));
    }

    #[test]
    fn test_is_meaningful_text_whitespace_only() {
        assert!(!is_meaningful_text("   ", &[]));
        assert!(!is_meaningful_text("\t\n ", &[]));
        assert!(!is_meaningful_text("   \t\n  ", &[]));
    }

    #[test]
    fn test_is_meaningful_text_plain_text() {
        assert!(is_meaningful_text("Hello", &[]));
        assert!(is_meaningful_text("    Hello World    ", &[]));
        assert!(is_meaningful_text("123", &[]));
        assert!(is_meaningful_text("한글", &[]));
    }

    #[test]
    fn test_is_meaningful_text_special_chars() {
        assert!(is_meaningful_text("Hello, World!", &[]));
        assert!(is_meaningful_text(
            "Text with special chars: @#$%^&*()",
            &[]
        ));
        assert!(is_meaningful_text("Line1\nLine2", &[]));
    }

    #[test]
    fn test_is_meaningful_text_single_char() {
        assert!(is_meaningful_text("a", &[]));
        assert!(is_meaningful_text("1", &[]));
        assert!(is_meaningful_text("가", &[]));
    }

    #[test]
    fn test_char_index_to_byte_index_empty_string() {
        assert_eq!(char_index_to_byte_index("", 0), None);
        assert_eq!(char_index_to_byte_index("", 1), None);
    }

    #[test]
    fn test_char_index_to_byte_index_single_byte() {
        let text = "a";
        assert_eq!(char_index_to_byte_index(text, 0), Some(0));
    }

    #[test]
    fn test_char_index_to_byte_index_multi_byte() {
        let text = "가";
        // '가'는 한글 유니코드 캐릭터 (U+AC00)
        // '가' is a Korean unicode character (U+AC00), which is 3 bytes in UTF-8
        assert_eq!(char_index_to_byte_index(text, 0), Some(0));
        assert_eq!(char_index_to_byte_index(text, 1), None); // Out of bounds
    }

    #[test]
    fn test_char_index_to_byte_index_mixed() {
        let text = "Hello";
        // "Hello" in UTF-8 is all single bytes
        assert_eq!(char_index_to_byte_index(text, 0), Some(0));
        assert_eq!(char_index_to_byte_index(text, 1), Some(1));
        assert_eq!(char_index_to_byte_index(text, 2), Some(2));
        assert_eq!(char_index_to_byte_index(text, 3), Some(3));
        assert_eq!(char_index_to_byte_index(text, 4), Some(4));
        assert_eq!(char_index_to_byte_index(text, 5), None); // Out of bounds
        assert_eq!(char_index_to_byte_index(text, 6), None); // Out of bounds
    }

    #[test]
    fn test_char_index_to_byte_index_utf8_sequence() {
        // Test with a multi-emoji string (3 emojis × 4 bytes = 12 bytes)
        let text = "😀😀😀";
        assert_eq!(char_index_to_byte_index(text, 0), Some(0));
        assert_eq!(char_index_to_byte_index(text, 1), Some(4));
        assert_eq!(char_index_to_byte_index(text, 2), Some(8));
        assert_eq!(char_index_to_byte_index(text, 3), None); // Out of bounds
    }

    #[test]
    fn test_char_index_to_byte_index_partial_encoding() {
        let text = "한";
        // '한' is U+D55C, 3 bytes in UTF-8
        assert_eq!(char_index_to_byte_index(text, 0), Some(0));
        assert_eq!(char_index_to_byte_index(text, 1), None); // Only one character at position 0
    }
}
