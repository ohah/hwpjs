/// FileHeader conversion to Markdown
/// 파일 헤더를 마크다운으로 변환하는 모듈
use crate::document::HwpDocument;

/// 버전 번호를 읽기 쉬운 문자열로 변환
/// Convert version number to readable string
pub fn format_version(document: &HwpDocument) -> String {
    let version = document.file_header.version;
    let major = (version >> 24) & 0xFF;
    let minor = (version >> 16) & 0xFF;
    let patch = (version >> 8) & 0xFF;
    let build = version & 0xFF;

    format!("{}.{:02}.{:02}.{:02}", major, minor, patch, build)
}
