/// PreviewImage 구조체 / PreviewImage structure
///
/// 스펙 문서 매핑: 3.2.7 - 미리보기 이미지 / Spec mapping: 3.2.7 - Preview image
///
/// `PrvImage` 스트림에는 미리보기 이미지가 BMP 또는 GIF 형식으로 저장됩니다.
/// The `PrvImage` stream contains preview image stored as BMP or GIF format.
use crate::error::HwpError;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// 미리보기 이미지 / Preview image
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewImage {
    /// Base64로 인코딩된 이미지 데이터 / Base64 encoded image data
    pub data: String,
    /// 이미지 형식 ("BMP" 또는 "GIF") / Image format ("BMP" or "GIF")
    pub format: String,
    /// 파일로 저장된 경우 파일 경로 (선택적) / File path if saved as file (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
}

impl PreviewImage {
    /// PreviewImage를 바이트 배열에서 파싱합니다. / Parse PreviewImage from byte array.
    ///
    /// # Arguments
    /// * `data` - PrvImage 스트림의 원시 바이트 데이터 / Raw byte data of PrvImage stream
    /// * `save_to_file` - 파일로 저장할 디렉토리 경로 (선택적) / Optional directory path to save file
    ///
    /// # Returns
    /// 파싱된 PreviewImage 구조체 / Parsed PreviewImage structure
    ///
    /// # Note
    /// 스펙 문서 3.2.7에 따르면 PrvImage 스트림에는 미리보기 이미지가 BMP 또는 GIF 형식으로 저장됩니다.
    /// According to spec 3.2.7, the PrvImage stream contains preview image stored as BMP or GIF format.
    /// 이미지 형식은 파일 시그니처를 확인하여 감지합니다.
    /// Image format is detected by checking file signature.
    /// 이미지 데이터는 항상 base64로 인코딩되어 저장되며, 선택적으로 파일로도 저장할 수 있습니다.
    /// Image data is always stored as base64 encoded string, and optionally saved as file.
    pub fn parse(data: &[u8], save_to_file: Option<&str>) -> Result<Self, HwpError> {
        if data.is_empty() {
            return Err(HwpError::InsufficientData {
                field: "PreviewImage data".to_string(),
                expected: 1,
                actual: 0,
            });
        }

        // 이미지 형식 감지 / Detect image format
        // BMP: "BM" (0x42 0x4D)로 시작 / BMP: starts with "BM" (0x42 0x4D)
        // GIF: "GIF87a" 또는 "GIF89a"로 시작 / GIF: starts with "GIF87a" or "GIF89a"
        let format = if data.len() >= 2 && data[0] == 0x42 && data[1] == 0x4D {
            "BMP".to_string()
        } else if data.len() >= 6 {
            let gif_header = &data[0..6];
            if gif_header == b"GIF87a" || gif_header == b"GIF89a" {
                "GIF".to_string()
            } else {
                // 알 수 없는 형식이지만 데이터는 저장 / Unknown format but store data
                "UNKNOWN".to_string()
            }
        } else {
            // 데이터가 너무 짧아서 형식을 확인할 수 없음 / Data too short to determine format
            "UNKNOWN".to_string()
        };

        // Base64 인코딩 / Base64 encoding
        let base64_data = STANDARD.encode(data);

        // 파일로 저장 (선택적) / Save to file (optional)
        let file_path = if let Some(dir_path) = save_to_file {
            let extension = match format.as_str() {
                "BMP" => "bmp",
                "GIF" => "gif",
                _ => "bin",
            };
            let file_name = format!("preview_image.{}", extension);
            let file_path = Path::new(dir_path).join(&file_name);

            std::fs::create_dir_all(dir_path).map_err(|e| {
                HwpError::Io(format!("Failed to create directory '{}': {}", dir_path, e))
            })?;

            std::fs::write(&file_path, data).map_err(|e| {
                HwpError::Io(format!(
                    "Failed to write preview image file '{}': {}",
                    file_path.display(),
                    e
                ))
            })?;

            Some(file_path.to_string_lossy().to_string())
        } else {
            None
        };

        Ok(PreviewImage {
            data: base64_data,
            format,
            file_path,
        })
    }
}
