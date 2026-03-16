pub mod html;

use hwp_model::document::Document;

/// 렌더링 옵션
#[derive(Debug, Clone, Default)]
pub struct RenderOptions {
    /// 이미지를 base64로 인라인할지 여부 (기본: true)
    pub inline_images: bool,
    /// 이미지 저장 디렉토리 (inline_images=false일 때)
    pub image_output_dir: Option<String>,
}

impl RenderOptions {
    pub fn new() -> Self {
        Self {
            inline_images: true,
            image_output_dir: None,
        }
    }
}

/// Document를 HTML 문자열로 변환
pub fn to_html(document: &Document, options: &RenderOptions) -> String {
    html::render(document, options)
}
