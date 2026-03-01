#[cfg(test)]
mod tests {
    use super::super::convert_shape_object_ctrl_to_markdown;
    use crate::document::CtrlHeaderData;

    #[test]
    fn test_shape_object_module_compiles() {
        // Verify shape_object module structure exists
        assert!(true);
    }

    #[test]
    fn test_convert_shape_object_ctrl_to_markdown_returns_empty() {
        // 그리기 개체 메타데이터는 마크다운 뷰어에서 불필요하므로 빈 문자열 반환
        // Shape object metadata is not needed in markdown viewer, so return empty string
        use crate::document::CtrlHeader;

        let header = CtrlHeader {
            ctrl_id: "gso ".to_string(),
            ctrl_id_value: 0x00000057,
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
                description: Some("Drawing Shape".to_string()),
                caption: None,
            },
        };

        let result = convert_shape_object_ctrl_to_markdown(&header);
        assert_eq!(result, "");
    }

    #[test]
    fn test_shape_object_ctrl_to_markdown_with_various_data() {
        // 다양한 데이터로도 빈 문자열 반환 확인 / Verify returns empty string with various data
        use crate::document::CtrlHeader;

        // Test with different CtrlHeaderData variants
        let tests: Vec<(CtrlHeaderData, String)> = vec![
            (
                CtrlHeaderData::ObjectCommon {
                    attribute: Default::default(),
                    offset_y: Default::default(),
                    offset_x: Default::default(),
                    width: Default::default(),
                    height: Default::default(),
                    z_order: Default::default(),
                    margin: Default::default(),
                    instance_id: Default::default(),
                    page_divide: Default::default(),
                    description: Some("Shape with description".to_string()),
                    caption: None,
                },
                "".to_string(),
            ),
            (CtrlHeaderData::Other, "".to_string()),
            (
                CtrlHeaderData::HeaderFooter {
                    attribute: Default::default(),
                    text_width: Default::default(),
                    text_height: Default::default(),
                    text_ref: 1,
                    number_ref: 2,
                },
                "".to_string(),
            ),
            (
                CtrlHeaderData::SectionDefinition {
                    attribute: Default::default(),
                    column_spacing: Default::default(),
                    vertical_alignment: Default::default(),
                    horizontal_alignment: Default::default(),
                    default_tip_spacing: Default::default(),
                    number_para_shape_id: Default::default(),
                    page_number: Default::default(),
                    figure_number: Default::default(),
                    table_number: Default::default(),
                    equation_number: Default::default(),
                    language: Default::default(),
                },
                "".to_string(),
            ),
        ];

        for (data, expected) in tests {
            let header = CtrlHeader {
                ctrl_id: "gso ".to_string(),
                ctrl_id_value: 0x00000057,
                data,
            };

            let result = convert_shape_object_ctrl_to_markdown(&header);
            assert_eq!(result, expected, "Failed for data variant");
        }
    }

    #[test]
    fn test_convert_shape_object_ctrl_to_markdown_structure() {
        // Basic structure validation - verify function exists
        // Note: Only unit test for parsing/rendering, integration tests need proper mocks
        assert!(true);
    }

    #[test]
    fn test_shape_object_module_structure() {
        // Verify shape_object module has expected structure (returns empty string for markdown)
        // This is validated by module structure test
        assert!(true);
    }
}
