/// 이미지 렌더링 모듈 / Image rendering module
use crate::types::INT32;
use crate::viewer::html::styles::{int32_to_mm, round_to_2dp};

/// 이미지를 HTML로 렌더링 / Render image to HTML
pub fn render_image(
    image_url: &str,
    left: INT32,
    top: INT32,
    width: INT32,
    height: INT32,
) -> String {
    let left_mm = round_to_2dp(int32_to_mm(left));
    let top_mm = round_to_2dp(int32_to_mm(top));
    let width_mm = round_to_2dp(int32_to_mm(width));
    let height_mm = round_to_2dp(int32_to_mm(height));

    format!(
        r#"<div class="hsR" style="top:{}mm;left:{}mm;width:{}mm;height:{}mm;background-repeat:no-repeat;background-size:contain;background-image:url('{}');"></div>"#,
        top_mm, left_mm, width_mm, height_mm, image_url
    )
}

/// 이미지를 배경 이미지로 렌더링 (인라인 스타일 포함) / Render image as background image (with inline styles)
pub fn render_image_with_style(
    image_url: &str,
    left: INT32,
    top: INT32,
    width: INT32,
    height: INT32,
    margin_bottom: INT32,
    margin_right: INT32,
) -> String {
    let left_mm = round_to_2dp(int32_to_mm(left));
    let top_mm = round_to_2dp(int32_to_mm(top));
    let width_mm = round_to_2dp(int32_to_mm(width));
    let height_mm = round_to_2dp(int32_to_mm(height));
    let margin_bottom_mm = round_to_2dp(int32_to_mm(margin_bottom));
    let margin_right_mm = round_to_2dp(int32_to_mm(margin_right));

    format!(
        r#"<div class="hsR" style="top:{}mm;left:{}mm;margin-bottom:{}mm;margin-right:{}mm;width:{}mm;height:{}mm;display:inline-block;position:relative;vertical-align:middle;background-repeat:no-repeat;background-size:contain;background-image:url('{}');"></div>"#,
        top_mm, left_mm, margin_bottom_mm, margin_right_mm, width_mm, height_mm, image_url
    )
}
