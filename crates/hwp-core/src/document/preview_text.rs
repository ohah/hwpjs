/// PreviewText 구조체 / PreviewText structure
///
/// 스펙 문서 매핑: 3.2.6 - 미리보기 텍스트 / Spec mapping: 3.2.6 - Preview text
///
/// `PrvText` 스트림에는 미리보기 텍스트가 유니코드 문자열로 저장됩니다.
/// The `PrvText` stream contains preview text stored as Unicode string.
use crate::error::HwpError;
use crate::types::decode_utf16le;
use serde::{Deserialize, Serialize};

/// 미리보기 텍스트 / Preview text
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewText {
    /// 미리보기 텍스트 내용 (UTF-16LE) / Preview text content (UTF-16LE)
    pub text: String,
}

impl PreviewText {
    /// PreviewText를 바이트 배열에서 파싱합니다. / Parse PreviewText from byte array.
    ///
    /// # Arguments
    /// * `data` - PrvText 스트림의 원시 바이트 데이터 / Raw byte data of PrvText stream
    ///
    /// # Returns
    /// 파싱된 PreviewText 구조체 / Parsed PreviewText structure
    ///
    /// # Note
    /// 스펙 문서 3.2.6에 따르면 PrvText 스트림에는 미리보기 텍스트가 유니코드 문자열로 저장됩니다.
    /// According to spec 3.2.6, the PrvText stream contains preview text stored as Unicode string.
    /// UTF-16LE 형식으로 저장되므로 decode_utf16le 함수를 사용하여 디코딩합니다.
    /// Since it's stored in UTF-16LE format, we use decode_utf16le function to decode it.
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        // UTF-16LE 디코딩 / Decode UTF-16LE
        let text = decode_utf16le(data).map_err(|e| HwpError::EncodingError {
            reason: format!("Failed to decode preview text: {}", e),
        })?;

        Ok(PreviewText { text })
    }
}
