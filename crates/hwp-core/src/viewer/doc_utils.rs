/// Document 기반 viewer 공통 유틸리티
use hwp_model::control::{Field, FieldParameter};
use hwp_model::document::{BinaryStore, ImageFormat};

/// 하이퍼링크 필드에서 URL 추출
pub fn extract_hyperlink_url(field: &Field) -> String {
    for param in &field.parameters {
        match param {
            FieldParameter::String { name, value } => {
                if name == "url" || name == "href" {
                    return value.clone();
                }
            }
            FieldParameter::Element { children, .. } => {
                for child in children {
                    if let FieldParameter::String { name, value } = child {
                        if name == "url" || name == "href" {
                            return value.clone();
                        }
                    }
                }
            }
            _ => {}
        }
    }
    String::new()
}

/// ImageFormat → MIME type 변환
pub fn image_format_to_mime(format: &ImageFormat) -> &'static str {
    match format {
        ImageFormat::Png => "image/png",
        ImageFormat::Jpg => "image/jpeg",
        ImageFormat::Gif => "image/gif",
        ImageFormat::Bmp => "image/bmp",
        ImageFormat::Svg => "image/svg+xml",
        ImageFormat::Tiff => "image/tiff",
        ImageFormat::Wmf => "image/x-wmf",
        ImageFormat::Emf => "image/x-emf",
        ImageFormat::Unknown(_) => "application/octet-stream",
    }
}

/// BinaryStore에서 ID로 아이템 찾기
pub fn find_binary_item<'a>(
    binary_item_id: &str,
    binaries: &'a BinaryStore,
) -> Option<&'a hwp_model::document::BinaryItem> {
    if binary_item_id.is_empty() {
        return None;
    }
    binaries.items.iter().find(|b| b.id == binary_item_id)
}

/// CSS font-family 값 이스케이핑 (single quote 내부용)
pub fn escape_css_font_name(name: &str) -> String {
    name.replace('\\', "\\\\").replace('\'', "\\'")
}
