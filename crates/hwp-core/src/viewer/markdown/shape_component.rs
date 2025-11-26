/// ShapeComponent conversion to Markdown
/// ShapeComponent를 마크다운으로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 57 - 본문의 데이터 레코드, SHAPE_COMPONENT (HWPTAG_BEGIN + 60)
/// Spec mapping: Table 57 - BodyText data records, SHAPE_COMPONENT (HWPTAG_BEGIN + 60)
use crate::document::{HwpDocument, ParagraphRecord};
use crate::viewer::markdown::shape_component_picture::convert_shape_component_picture_to_markdown;

/// Convert ShapeComponent children to markdown
/// ShapeComponent의 자식들을 마크다운으로 변환
///
/// # Arguments / 매개변수
/// * `children` - ShapeComponent의 자식 레코드들 / Child records of ShapeComponent
/// * `document` - HWP 문서 / HWP document
/// * `image_output_dir` - 이미지 출력 디렉토리 (선택) / Image output directory (optional)
///
/// # Returns / 반환값
/// 마크다운 문자열 리스트 / List of markdown strings
pub(crate) fn convert_shape_component_children_to_markdown(
    children: &[ParagraphRecord],
    document: &HwpDocument,
    image_output_dir: Option<&str>,
) -> Vec<String> {
    let mut parts = Vec::new();

    // SHAPE_COMPONENT의 children을 재귀적으로 처리 / Recursively process SHAPE_COMPONENT's children
    // SHAPE_COMPONENT_PICTURE는 SHAPE_COMPONENT의 자식으로 올 수 있음
    // SHAPE_COMPONENT_PICTURE can be a child of SHAPE_COMPONENT
    for child in children {
        if let ParagraphRecord::ShapeComponentPicture {
            shape_component_picture,
        } = child
        {
            // 그림 개체를 마크다운 이미지로 변환 / Convert picture shape component to markdown image
            if let Some(image_md) = convert_shape_component_picture_to_markdown(
                shape_component_picture,
                document,
                image_output_dir,
            ) {
                parts.push(image_md);
            }
        }
        // 기타 children은 무시 (SHAPE_COMPONENT_PICTURE만 처리) / Ignore other children (only process SHAPE_COMPONENT_PICTURE)
    }

    parts
}
