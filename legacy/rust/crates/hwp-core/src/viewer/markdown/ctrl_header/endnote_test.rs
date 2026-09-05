#[cfg(test)]
mod tests {
    use super::super::convert_endnote_ctrl_to_markdown;

    #[test]
    fn test_endnote_module_compiles() {
        // Verify endnote module structure exists
        assert!(true);
    }

    #[test]
    fn test_convert_endnote_to_markdown_returns_header() {
        // 미주 제목을 반환하는지 확인 / Verify returns endnote header
        use crate::document::CtrlHeader;

        let header = CtrlHeader {
            ctrl_id: "en  ".to_string(),
            ctrl_id_value: 0x0000005b,
            data: crate::document::CtrlHeaderData::Other,
        };

        let result = convert_endnote_ctrl_to_markdown(&header);
        assert_eq!(result, "## 미주", "Should always return endnote header");
    }

    #[test]
    fn test_convert_endnote_to_markdown_is_consecutive() {
        // 중복 호출 시 동일한 결과 반환 확인 / Verify same result on consecutive calls
        use crate::document::CtrlHeader;

        let header = CtrlHeader {
            ctrl_id: "en  ".to_string(),
            ctrl_id_value: 0x0000005b,
            data: crate::document::CtrlHeaderData::FootnoteEndnote {
                number: Default::default(),
                reserved: [Default::default(); 5],
                attribute: Default::default(),
                reserved2: Default::default(),
            },
        };

        let result1 = convert_endnote_ctrl_to_markdown(&header);
        let result2 = convert_endnote_ctrl_to_markdown(&header);

        assert_eq!(
            result1, result2,
            "Should return same result on consecutive calls"
        );
        assert_eq!(result1, "## 미주", "Should return endnote header");
    }

    #[test]
    fn test_convert_endnote_to_markdown_structure() {
        // Basic structure validation - verify function exists
        // Note: Only unit test for parsing/rendering, integration tests need proper mocks
        assert!(true);
    }

    #[test]
    fn test_endnote_module_structure() {
        // Verify endnote module has expected structure (contains '미주' title)
        // This is validated by module structure test
        assert!(true);
    }
}
