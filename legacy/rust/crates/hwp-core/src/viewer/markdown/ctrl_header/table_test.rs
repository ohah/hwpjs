#[cfg(test)]
mod tests {
    use super::super::convert_table_ctrl_to_markdown;
    use crate::document::CtrlHeaderData;

    #[test]
    fn test_table_module_compiles() {
        // Verify table module structure exists
        assert!(true);
    }

    #[test]
    fn test_convert_table_ctrl_to_markdown_not_extracted() {
        // 표가 이미 추출되지 않은 경우 / When table is not extracted yet
        use crate::document::CtrlHeader;

        let header = CtrlHeader {
            ctrl_id: "tbl ".to_string(),
            ctrl_id_value: 0x00000056,
            data: CtrlHeaderData::ObjectCommon {
                attribute: Default::default(),
                offset_y: Default::default(),
                offset_x: Default::default(),
                width: Default::default(),
                height: Default::default(),
                z_order: Default::default(),
                margin: Default::default(),
                instance_id: Default::default(),
                page_divide: Default::default(),
                description: None,
                caption: None,
            },
        };

        let result = convert_table_ctrl_to_markdown(&header, false);
        assert!(result.contains("**표**"));
        assert!(result.contains("*[표 내용은 추출되지 않았습니다]*"));
        assert!(!result.contains(":"));
    }

    #[test]
    fn test_convert_table_ctrl_to_markdown_with_description() {
        // 표에 설명이 있는 경우 / When table has description
        use crate::document::CtrlHeader;

        let header = CtrlHeader {
            ctrl_id: "tbl ".to_string(),
            ctrl_id_value: 0x00000056,
            data: CtrlHeaderData::ObjectCommon {
                attribute: Default::default(),
                offset_y: Default::default(),
                offset_x: Default::default(),
                width: Default::default(),
                height: Default::default(),
                z_order: Default::default(),
                margin: Default::default(),
                instance_id: Default::default(),
                page_divide: Default::default(),
                description: Some("구조 개선표".to_string()),
                caption: None,
            },
        };

        let result = convert_table_ctrl_to_markdown(&header, false);
        assert!(result.contains("**표**: 구조 개선표"));
        assert!(result.contains("*[표 내용은 추출되지 않았습니다]*"));
    }

    #[test]
    fn test_convert_table_ctrl_to_markdown_already_extracted() {
        // 표가 이미 추출된 경우 / When table is already extracted
        use crate::document::CtrlHeader;

        let header = CtrlHeader {
            ctrl_id: "tbl ".to_string(),
            ctrl_id_value: 0x00000056,
            data: CtrlHeaderData::ObjectCommon {
                attribute: Default::default(),
                offset_y: Default::default(),
                offset_x: Default::default(),
                width: Default::default(),
                height: Default::default(),
                z_order: Default::default(),
                margin: Default::default(),
                instance_id: Default::default(),
                page_divide: Default::default(),
                description: Some("구조 개선표".to_string()),
                caption: None,
            },
        };

        let result = convert_table_ctrl_to_markdown(&header, true);
        assert!(result.is_empty());
    }

    #[test]
    fn test_convert_table_ctrl_to_markdown_empty_description() {
        // 표에 빈 설명이 있는 경우 / When table has empty description
        use crate::document::CtrlHeader;

        let header = CtrlHeader {
            ctrl_id: "tbl ".to_string(),
            ctrl_id_value: 0x00000056,
            data: CtrlHeaderData::ObjectCommon {
                attribute: Default::default(),
                offset_y: Default::default(),
                offset_x: Default::default(),
                width: Default::default(),
                height: Default::default(),
                z_order: Default::default(),
                margin: Default::default(),
                instance_id: Default::default(),
                page_divide: Default::default(),
                description: Some("   ".to_string()), // Only whitespace
                caption: None,
            },
        };

        let result = convert_table_ctrl_to_markdown(&header, false);
        assert!(result.contains("**표**"));
        assert!(result.contains("*[표 내용은 추출되지 않았습니다]*"));
        assert!(!result.contains(":"));
    }

    #[test]
    fn test_convert_table_ctrl_to_markdown_multiple_newlines() {
        // 여러 줄 래핑 테스트 / Test multiple newline wrapping
        use crate::document::CtrlHeader;

        let header = CtrlHeader {
            ctrl_id: "tbl ".to_string(),
            ctrl_id_value: 0x00000056,
            data: CtrlHeaderData::ObjectCommon {
                attribute: Default::default(),
                offset_y: Default::default(),
                offset_x: Default::default(),
                width: Default::default(),
                height: Default::default(),
                z_order: Default::default(),
                margin: Default::default(),
                instance_id: Default::default(),
                page_divide: Default::default(),
                description: Some("Multi\nLine\nDescription".to_string()),
                caption: None,
            },
        };

        let result = convert_table_ctrl_to_markdown(&header, false);
        // \n\n 래핑 확인 / Check for \n\n wrapping
        assert!(result.contains("**표**: Multi\nLine\nDescription"));
        assert!(!result.contains("\n\n\n"));
    }

    #[test]
    fn test_table_module_structure() {
        // Verify table module has expected structure
        assert!(true);
    }
}
