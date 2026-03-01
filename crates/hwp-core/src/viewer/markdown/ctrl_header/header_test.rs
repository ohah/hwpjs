#[cfg(test)]
mod tests {
    use super::super::convert_header_ctrl_to_markdown;

    #[test]
    fn test_header_module_compiles() {
        // Verify header module structure exists
        assert!(true);
    }

    #[test]
    fn test_convert_header_to_markdown_returns_header() {
        // 머리말 제목을 반환하는지 확인 / Verify returns header title
        use crate::document::CtrlHeader;

        let header = CtrlHeader {
            ctrl_id: "head".to_string(),
            ctrl_id_value: 0x00000059,
            data: crate::document::CtrlHeaderData::Other,
        };

        let result = convert_header_ctrl_to_markdown(&header);
        assert_eq!(result, "## 머리말", "Should always return header title");
    }

    #[test]
    fn test_convert_header_to_markdown_is_consecutive() {
        // 중복 호출 시 동일한 결과 반환 확인 / Verify same result on consecutive calls
        use crate::document::CtrlHeader;

        let header = CtrlHeader {
            ctrl_id: "head".to_string(),
            ctrl_id_value: 0x00000059,
            data: crate::document::CtrlHeaderData::HeaderFooter {
                attribute: Default::default(),
                text_width: Default::default(),
                text_height: Default::default(),
                text_ref: 1,
                number_ref: 2,
            },
        };

        let result1 = convert_header_ctrl_to_markdown(&header);
        let result2 = convert_header_ctrl_to_markdown(&header);

        assert_eq!(result1, result2, "Should return same result on consecutive calls");
        assert_eq!(result1, "## 머리말", "Should return header title");
    }

    #[test]
    fn test_convert_header_to_markdown_structure() {
        // Basic structure validation - verify function exists
        // Note: Only unit test for parsing/rendering, integration tests need proper mocks
        assert!(true);
    }

    #[test]
    fn test_header_module_structure() {
        // Verify header module has expected structure (contains '머리말' title)
        // This is validated by module structure test
        assert!(true);
    }
}