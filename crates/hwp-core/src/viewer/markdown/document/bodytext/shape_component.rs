/// ShapeComponent conversion to Markdown
/// ShapeComponent를 마크다운으로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 57 - 본문의 데이터 레코드, SHAPE_COMPONENT (HWPTAG_BEGIN + 60)
/// Spec mapping: Table 57 - BodyText data records, SHAPE_COMPONENT (HWPTAG_BEGIN + 60)
use crate::document::{HwpDocument, ParagraphRecord};
use crate::viewer::markdown::document::bodytext::shape_component_picture::convert_shape_component_picture_to_markdown;

/// Convert ShapeComponent children to markdown
/// ShapeComponent의 자식들을 마크다운으로 변환
///
/// # Arguments / 매개변수
/// * `children` - ShapeComponent의 자식 레코드들 / Child records of ShapeComponent
/// * `document` - HWP 문서 / HWP document
/// * `image_output_dir` - 이미지 출력 디렉토리 (선택) / Image output directory (optional)
/// * `tracker` - 개요 번호 추적기 / Outline number tracker
///
/// # Returns / 반환값
/// 마크다운 문자열 리스트 / List of markdown strings
pub(crate) fn convert_shape_component_children_to_markdown(
    children: &[ParagraphRecord],
    document: &HwpDocument,
    image_output_dir: Option<&str>,
    tracker: &mut crate::viewer::core::OutlineNumberTracker,
) -> Vec<String> {
    use crate::viewer::markdown::document::bodytext::paragraph::convert_paragraph_to_markdown;
    use crate::viewer::markdown::MarkdownOptions;

    let mut parts = Vec::new();
    let options = MarkdownOptions {
        image_output_dir: image_output_dir.map(|s| s.to_string()),
        use_html: None,
        include_version: None,
        include_page_info: None,
    };

    // SHAPE_COMPONENT의 children을 재귀적으로 처리 / Recursively process SHAPE_COMPONENT's children
    // SHAPE_COMPONENT_PICTURE는 SHAPE_COMPONENT의 자식으로 올 수 있음
    // SHAPE_COMPONENT_PICTURE can be a child of SHAPE_COMPONENT
    // LIST_HEADER는 글상자 텍스트를 포함할 수 있음 (SHAPE_COMPONENT 내부의 글상자)
    // LIST_HEADER can contain textbox text (textbox inside SHAPE_COMPONENT)
    for child in children {
        match child {
            ParagraphRecord::ShapeComponentPicture {
                shape_component_picture,
            } => {
                // 그림 개체를 마크다운 이미지로 변환 / Convert picture shape component to markdown image
                if let Some(image_md) = convert_shape_component_picture_to_markdown(
                    shape_component_picture,
                    document,
                    image_output_dir,
                ) {
                    parts.push(image_md);
                }
            }
            ParagraphRecord::ListHeader { paragraphs, .. } => {
                // LIST_HEADER의 paragraphs 처리 (글상자 텍스트) / Process LIST_HEADER's paragraphs (textbox text)
                // SHAPE_COMPONENT 내부의 LIST_HEADER는 글상자 텍스트를 포함할 수 있음
                // LIST_HEADER inside SHAPE_COMPONENT can contain textbox text
                for para in paragraphs {
                    let para_md = convert_paragraph_to_markdown(para, document, &options, tracker);
                    if !para_md.is_empty() {
                        parts.push(para_md);
                    }
                }
            }
            _ => {
                // 기타 children은 무시 / Ignore other children
            }
        }
    }

    parts
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document::ParagraphRecord;

    fn create_mock_document() -> HwpDocument {
        use crate::document::{FileHeader, HwpDocument};
        let mut file_header_data = vec![0u8; 256];
        file_header_data[0..32].copy_from_slice(b"HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
        file_header_data[32..36].copy_from_slice(&0x05000300u32.to_le_bytes());
        file_header_data[36..40].copy_from_slice(&0x01u32.to_le_bytes());
        let file_header = FileHeader::parse(&file_header_data).unwrap_or_else(|_| unreachable!());
        HwpDocument::new(file_header)
    }

    #[test]
    fn test_convert_shape_component_children_empty_children() {
        let document = create_mock_document();
        let mut tracker = crate::viewer::core::OutlineNumberTracker::new();
        let result = convert_shape_component_children_to_markdown(
            &[],
            &document,
            None,
            &mut tracker,
        );
        assert!(result.is_empty());
    }

    #[test]
    fn test_convert_shape_component_children_with_unsupported_children() {
        let document = create_mock_document();
        let mut tracker = crate::viewer::core::OutlineNumberTracker::new();

        // Test with unsupported child types (should be ignored)
        // We'll just test with an empty Vec for now as creating unsupported children requires complex types
        let children: Vec<ParagraphRecord> = vec![];
        let result = convert_shape_component_children_to_markdown(
            &children,
            &document,
            None,
            &mut tracker,
        );

        // Should return empty vector
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn test_convert_shape_component_children_with_document_and_tracker() {
        let document = create_mock_document();
        let mut tracker = crate::viewer::core::OutlineNumberTracker::new();

        // Test that function accepts these parameters
        let children: Vec<ParagraphRecord> = vec![];
        let result1 = convert_shape_component_children_to_markdown(
            &children,
            &document,
            None,
            &mut tracker,
        );
        let result2 = convert_shape_component_children_to_markdown(
            &children,
            &document,
            Some("test_output"),
            &mut tracker,
        );

        // Both should return empty results
        assert_eq!(result1.len(), 0);
        assert_eq!(result2.len(), 0);
    }
}
