/// CharShapeInfo 구조체 / CharShapeInfo structure
///
/// 스펙 문서 매핑: 표 61 - 문단의 글자 모양 / Spec mapping: Table 61 - Paragraph character shape
/// 각 항목: 8바이트
use crate::error::HwpError;
use crate::types::UINT32;
use serde::{Deserialize, Serialize};

/// 글자 모양 정보 / Character shape information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharShapeInfo {
    /// 글자 모양이 바뀌는 시작 위치 / Position where character shape changes
    pub position: UINT32,
    /// 글자 모양 ID / Character shape ID
    pub shape_id: UINT32,
}

impl CharShapeInfo {
    /// CharShapeInfo를 바이트 배열에서 파싱합니다. / Parse CharShapeInfo from byte array.
    ///
    /// # Arguments
    /// * `data` - 최소 8바이트의 데이터 / At least 8 bytes of data
    ///
    /// # Returns
    /// 파싱된 CharShapeInfo 구조체 / Parsed CharShapeInfo structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 8 {
            return Err(HwpError::insufficient_data("CharShapeInfo", 8, data.len()));
        }

        // UINT32 글자 모양이 바뀌는 시작 위치 / UINT32 position where character shape changes
        let position = UINT32::from_le_bytes([data[0], data[1], data[2], data[3]]);

        // UINT32 글자 모양 ID / UINT32 character shape ID
        let shape_id = UINT32::from_le_bytes([data[4], data[5], data[6], data[7]]);

        Ok(CharShapeInfo { position, shape_id })
    }
}

/// 문단의 글자 모양 리스트 / Paragraph character shape list
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ParaCharShape {
    /// 글자 모양 정보 리스트 / Character shape information list
    pub shapes: Vec<CharShapeInfo>,
}

impl ParaCharShape {
    /// ParaCharShape를 바이트 배열에서 파싱합니다. / Parse ParaCharShape from byte array.
    ///
    /// # Arguments
    /// * `data` - 글자 모양 데이터 (8×n 바이트) / Character shape data (8×n bytes)
    ///
    /// # Returns
    /// 파싱된 ParaCharShape 구조체 / Parsed ParaCharShape structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() % 8 != 0 {
            return Err(HwpError::UnexpectedValue {
                field: "ParaCharShape data length".to_string(),
                expected: "multiple of 8".to_string(),
                found: format!("{} bytes", data.len()),
            });
        }

        let count = data.len() / 8;
        let mut shapes = Vec::with_capacity(count);

        for i in 0..count {
            let offset = i * 8;
            let shape_data = &data[offset..offset + 8];
            let shape_info = CharShapeInfo::parse(shape_data)?;
            shapes.push(shape_info);
        }

        Ok(ParaCharShape { shapes })
    }
}
