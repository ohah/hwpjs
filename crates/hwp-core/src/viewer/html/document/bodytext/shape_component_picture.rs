/// ShapeComponentPicture conversion to HTML
/// ShapeComponentPicture를 HTML로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 57 - 본문의 데이터 레코드, SHAPE_COMPONENT_PICTURE
/// Spec mapping: Table 57 - BodyText data records, SHAPE_COMPONENT_PICTURE
use crate::document::{bodytext::ShapeComponentPicture, HwpDocument};

/// Convert ShapeComponentPicture to HTML
/// ShapeComponentPicture를 HTML로 변환
pub fn convert_shape_component_picture_to_html(
    shape_component_picture: &ShapeComponentPicture,
    document: &HwpDocument,
    options: &crate::viewer::html::HtmlOptions,
) -> Option<String> {
    let bindata_id = shape_component_picture.picture_info.bindata_id;

    // BinData에서 이미지 데이터 가져오기 / Get image data from BinData
    if let Some(bin_item) = document
        .bin_data
        .items
        .iter()
        .find(|item| item.index == bindata_id)
    {
        return Some(crate::viewer::html::common::format_image_html(
            document,
            bindata_id,
            &bin_item.data,
            options.image_output_dir.as_deref(),
            &options.css_class_prefix,
        ));
    }

    None
}

