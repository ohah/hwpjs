/// LayoutCompatibility 구조체 / LayoutCompatibility structure
///
/// 스펙 문서 매핑: 표 56 - 레이아웃 호환성 / Spec mapping: Table 56 - Layout compatibility
use crate::error::HwpError;
use crate::types::UINT32;
use serde::{Deserialize, Serialize};

/// 레이아웃 호환성 (표 56) / Layout compatibility (Table 56)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutCompatibility {
    /// 글자 단위 서식 / Character unit format
    pub character_format: UINT32,
    /// 문단 단위 서식 / Paragraph unit format
    pub paragraph_format: UINT32,
    /// 구역 단위 서식 / Section unit format
    pub section_format: UINT32,
    /// 개체 단위 서식 / Object unit format
    pub object_format: UINT32,
    /// 필드 단위 서식 / Field unit format
    pub field_format: UINT32,
}

impl LayoutCompatibility {
    /// LayoutCompatibility를 바이트 배열에서 파싱합니다. / Parse LayoutCompatibility from byte array.
    ///
    /// # Arguments
    /// * `data` - LayoutCompatibility 데이터 (20바이트) / LayoutCompatibility data (20 bytes)
    ///
    /// # Returns
    /// 파싱된 LayoutCompatibility 구조체 / Parsed LayoutCompatibility structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 20 {
            return Err(HwpError::insufficient_data(
                "LayoutCompatibility",
                20,
                data.len(),
            ));
        }

        Ok(LayoutCompatibility {
            character_format: UINT32::from_le_bytes([data[0], data[1], data[2], data[3]]),
            paragraph_format: UINT32::from_le_bytes([data[4], data[5], data[6], data[7]]),
            section_format: UINT32::from_le_bytes([data[8], data[9], data[10], data[11]]),
            object_format: UINT32::from_le_bytes([data[12], data[13], data[14], data[15]]),
            field_format: UINT32::from_le_bytes([data[16], data[17], data[18], data[19]]),
        })
    }
}
