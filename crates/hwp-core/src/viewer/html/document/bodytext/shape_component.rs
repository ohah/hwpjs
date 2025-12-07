/// ShapeComponent conversion to HTML
/// ShapeComponent를 HTML로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 57 - 본문의 데이터 레코드, SHAPE_COMPONENT (HWPTAG_BEGIN + 60)
/// Spec mapping: Table 57 - BodyText data records, SHAPE_COMPONENT (HWPTAG_BEGIN + 60)
use crate::document::{HwpDocument, ParagraphRecord};
use crate::viewer::html::HtmlOptions;

/// Convert ShapeComponent children to HTML
/// ShapeComponent의 자식들을 HTML로 변환
///
/// # Arguments / 매개변수
/// * `children` - ShapeComponent의 자식 레코드들 / Child records of ShapeComponent
/// * `document` - HWP 문서 / HWP document
/// * `options` - HTML 변환 옵션 / HTML conversion options
/// * `tracker` - 개요 번호 추적기 / Outline number tracker
///
/// # Returns / 반환값
/// HTML 문자열 리스트 / List of HTML strings
pub(crate) fn convert_shape_component_children_to_html(
    children: &[ParagraphRecord],
    document: &HwpDocument,
    options: &HtmlOptions,
    tracker: &mut crate::viewer::html::utils::OutlineNumberTracker,
) -> Vec<String> {
    use crate::viewer::html::document::bodytext::paragraph::convert_paragraph_to_html;

    let mut parts = Vec::new();

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
                // 그림 개체를 HTML 이미지로 변환 / Convert picture shape component to HTML image
                if let Some(image_html) = crate::viewer::html::document::bodytext::shape_component_picture::convert_shape_component_picture_to_html(
                    shape_component_picture,
                    document,
                    options,
                ) {
                    parts.push(image_html);
                }
            }
            ParagraphRecord::ListHeader { paragraphs, .. } => {
                // LIST_HEADER의 paragraphs 처리 (글상자 텍스트) / Process LIST_HEADER's paragraphs (textbox text)
                // SHAPE_COMPONENT 내부의 LIST_HEADER는 글상자 텍스트를 포함할 수 있음
                // LIST_HEADER inside SHAPE_COMPONENT can contain textbox text
                for para in paragraphs {
                    let para_html = convert_paragraph_to_html(para, document, options, tracker);
                    if !para_html.is_empty() {
                        parts.push(para_html);
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
