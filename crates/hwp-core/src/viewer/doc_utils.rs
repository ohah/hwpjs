/// Document 기반 viewer 공통 유틸리티
use hwp_model::control::{Field, FieldParameter};
use hwp_model::document::{BinaryStore, ImageFormat};

/// 하이퍼링크 필드에서 URL 추출
/// HWP: Field.name에 "%hlk" command 문자열 (URL;타입 형식)
/// HWPX: Field.parameters에 url/href 키
pub fn extract_hyperlink_url(field: &Field) -> String {
    // 1. HWPX 방식: parameters에서 url/href 찾기
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

    // 2. HWP 방식: Field.name에서 %hlk command 파싱
    if let Some(ref command) = field.name {
        if let Some(url) = hlk_command_to_url(command) {
            return url;
        }
    }

    String::new()
}

/// HWP %hlk command 문자열에서 URL 추출
/// 형식: "URL;타입" (타입: 0=북마크, 1=URL, 2=이메일)
fn hlk_command_to_url(command: &str) -> Option<String> {
    let parts: Vec<&str> = command.split(';').collect();
    if parts.len() < 2 {
        return None;
    }
    let url_part = parts[0];
    let link_type = parts[1];
    let target = url_part.split('|').next().unwrap_or("");

    let unescape = |s: &str| -> String {
        s.replace("\\:", ":")
            .replace("\\?", "?")
            .replace("\\\\", "\\")
    };

    match link_type {
        "1" => Some(unescape(target)),
        "2" => {
            let email = unescape(target);
            if email.starts_with("mailto:") {
                Some(email)
            } else {
                Some(format!("mailto:{}", email))
            }
        }
        "0" => {
            let name = unescape(target);
            if name.is_empty() {
                Some("#".to_string())
            } else {
                Some(format!("#{}", name))
            }
        }
        _ => None,
    }
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
