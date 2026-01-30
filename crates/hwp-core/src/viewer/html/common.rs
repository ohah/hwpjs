/// HTML 뷰어 공통 유틸리티 함수 / HTML viewer common utility functions
use crate::document::{BinDataRecord, HwpDocument};
use crate::{HwpError, WORD};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::fs;
use std::path::Path;

/// Get file extension from BinData ID
/// BinData ID에서 파일 확장자 가져오기
pub fn get_extension_from_bindata_id(document: &HwpDocument, bindata_id: WORD) -> String {
    for record in &document.doc_info.bin_data {
        if let BinDataRecord::Embedding { embedding, .. } = record {
            if embedding.binary_data_id == bindata_id {
                return embedding.extension.clone();
            }
        }
    }
    "jpg".to_string()
}

/// Get MIME type from BinData ID
/// BinData ID에서 MIME 타입 가져오기
pub fn get_mime_type_from_bindata_id(document: &HwpDocument, bindata_id: WORD) -> String {
    for record in &document.doc_info.bin_data {
        if let BinDataRecord::Embedding { embedding, .. } = record {
            if embedding.binary_data_id == bindata_id {
                return match embedding.extension.to_lowercase().as_str() {
                    "jpg" | "jpeg" => "image/jpeg",
                    "png" => "image/png",
                    "gif" => "image/gif",
                    "bmp" => "image/bmp",
                    _ => "image/jpeg",
                }
                .to_string();
            }
        }
    }
    "image/jpeg".to_string()
}

/// Save image to file and return file path
/// 이미지를 파일로 저장하고 파일 경로 반환
pub fn save_image_to_file(
    document: &HwpDocument,
    bindata_id: crate::types::WORD,
    base64_data: &str,
    dir_path: &str,
) -> Result<String, HwpError> {
    // base64 디코딩 / Decode base64
    let image_data = STANDARD
        .decode(base64_data)
        .map_err(|e| HwpError::InternalError {
            message: format!("Failed to decode base64: {}", e),
        })?;

    // 파일명 생성 / Generate filename
    let extension = get_extension_from_bindata_id(document, bindata_id);
    let file_name = format!("BIN{:04X}.{}", bindata_id, extension);
    let file_path = Path::new(dir_path).join(&file_name);

    // 디렉토리 생성 / Create directory
    fs::create_dir_all(dir_path)
        .map_err(|e| HwpError::Io(format!("Failed to create directory '{}': {}", dir_path, e)))?;

    // 파일 저장 / Save file
    fs::write(&file_path, &image_data).map_err(|e| {
        HwpError::Io(format!(
            "Failed to write file '{}': {}",
            file_path.display(),
            e
        ))
    })?;

    Ok(file_path.to_string_lossy().to_string())
}

/// Get image URL (file path or base64 data URI)
/// 이미지 URL 가져오기 (파일 경로 또는 base64 데이터 URI)
pub fn get_image_url(
    document: &HwpDocument,
    bindata_id: WORD,
    image_output_dir: Option<&str>,
    html_output_dir: Option<&str>,
) -> String {
    // BinData에서 이미지 데이터 찾기 / Find image data from BinData
    let base64_data = document
        .bin_data
        .items
        .iter()
        .find(|item| item.index == bindata_id)
        .map(|item| item.data.as_str())
        .unwrap_or("");

    if base64_data.is_empty() {
        return String::new();
    }

    match image_output_dir {
        Some(dir_path) => {
            // 이미지를 파일로 저장 / Save image as file
            match save_image_to_file(document, bindata_id, base64_data, dir_path) {
                Ok(file_path) => {
                    // HTML 출력 디렉토리가 있으면 상대 경로 계산 / Calculate relative path if HTML output directory is provided
                    if let Some(html_dir) = html_output_dir {
                        let image_path = Path::new(&file_path);
                        let html_path = Path::new(html_dir);

                        // 상대 경로 계산 / Calculate relative path
                        match pathdiff::diff_paths(image_path, html_path) {
                            Some(relative_path) => {
                                // 경로 구분자를 슬래시로 통일 / Normalize path separators to forward slashes
                                relative_path.to_string_lossy().replace('\\', "/")
                            }
                            None => {
                                // 상대 경로 계산 실패 시 파일명만 반환 / Return filename only if relative path calculation fails
                                image_path
                                    .file_name()
                                    .and_then(|n| n.to_str())
                                    .map(|s| s.to_string())
                                    .unwrap_or_else(|| file_path)
                            }
                        }
                    } else {
                        // HTML 출력 디렉토리가 없으면 파일명만 반환 / Return filename only if HTML output directory is not provided
                        let file_path_obj = Path::new(&file_path);
                        file_path_obj
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or(&file_path)
                            .to_string()
                    }
                }
                Err(_) => {
                    // 실패 시 base64로 폴백 / Fallback to base64 on failure
                    let mime_type = get_mime_type_from_bindata_id(document, bindata_id);
                    format!("data:{};base64,{}", mime_type, base64_data)
                }
            }
        }
        None => {
            // base64 데이터 URI로 임베드 / Embed as base64 data URI
            let mime_type = get_mime_type_from_bindata_id(document, bindata_id);
            format!("data:{};base64,{}", mime_type, base64_data)
        }
    }
}
