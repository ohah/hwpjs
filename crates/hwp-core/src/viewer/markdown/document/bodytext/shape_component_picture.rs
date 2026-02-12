/// ShapeComponentPicture conversion to Markdown
/// ShapeComponentPicture를 마크다운으로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 57 - 본문의 데이터 레코드, SHAPE_COMPONENT_PICTURE
/// Spec mapping: Table 57 - BodyText data records, SHAPE_COMPONENT_PICTURE
use crate::document::{bodytext::ShapeComponentPicture, HwpDocument};
use crate::viewer::markdown::common::format_image_markdown;

/// Convert ShapeComponentPicture to markdown
/// ShapeComponentPicture를 마크다운으로 변환
///
/// # Arguments / 매개변수
/// * `shape_component_picture` - 그림 개체 / Picture shape component
/// * `document` - HWP 문서 / HWP document
/// * `image_output_dir` - 이미지 출력 디렉토리 (선택) / Image output directory (optional)
///
/// # Returns / 반환값
/// 마크다운 문자열 / Markdown string
pub(crate) fn convert_shape_component_picture_to_markdown(
    shape_component_picture: &ShapeComponentPicture,
    document: &HwpDocument,
    image_output_dir: Option<&str>,
) -> Option<String> {
    // 그림 개체를 마크다운 이미지로 변환 / Convert picture shape component to markdown image
    let bindata_id = shape_component_picture.picture_info.bindata_id;

    // BinData에서 해당 이미지 찾기 / Find image in BinData
    if let Some(bin_item) = document
        .bin_data
        .items
        .iter()
        .find(|item| item.index == bindata_id)
    {
        let image_markdown =
            format_image_markdown(document, bindata_id, &bin_item.data, image_output_dir);
        if !image_markdown.is_empty() {
            return Some(image_markdown);
        }
    }
    None
}
