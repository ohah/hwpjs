/// RangeTagInfo 구조체 / RangeTagInfo structure
///
/// 스펙 문서 매핑: 표 63 - 문단의 영역 태그 / Spec mapping: Table 63 - Paragraph range tag
/// 각 항목: 12바이트
use crate::error::HwpError;
use crate::types::{UINT32, UINT8};
use serde::{Deserialize, Serialize};

/// 영역 태그 정보 / Range tag information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RangeTagInfo {
    /// 영역 시작 위치 / Range start position
    pub start: UINT32,
    /// 영역 끝 위치 / Range end position
    pub end: UINT32,
    /// 태그 종류 (상위 8비트) / Tag type (upper 8 bits)
    pub tag_type: UINT8,
    /// 태그 데이터 (하위 24비트) / Tag data (lower 24 bits)
    pub tag_data: UINT32,
}

impl RangeTagInfo {
    /// RangeTagInfo를 바이트 배열에서 파싱합니다. / Parse RangeTagInfo from byte array.
    ///
    /// # Arguments
    /// * `data` - 최소 12바이트의 데이터 / At least 12 bytes of data
    ///
    /// # Returns
    /// 파싱된 RangeTagInfo 구조체 / Parsed RangeTagInfo structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 12 {
            return Err(HwpError::insufficient_data("RangeTagInfo", 12, data.len()));
        }

        // UINT32 영역 시작 / UINT32 range start
        let start = UINT32::from_le_bytes([data[0], data[1], data[2], data[3]]);

        // UINT32 영역 끝 / UINT32 range end
        let end = UINT32::from_le_bytes([data[4], data[5], data[6], data[7]]);

        // UINT32 태그(종류 + 데이터) / UINT32 tag (type + data)
        // 상위 8비트가 종류, 하위 24비트가 데이터 / Upper 8 bits are type, lower 24 bits are data
        let tag_value = UINT32::from_le_bytes([data[8], data[9], data[10], data[11]]);
        let tag_type = ((tag_value >> 24) & 0xFF) as UINT8;
        let tag_data = tag_value & 0x00FFFFFF;

        Ok(RangeTagInfo {
            start,
            end,
            tag_type,
            tag_data,
        })
    }
}

/// 문단의 영역 태그 리스트 / Paragraph range tag list
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ParaRangeTag {
    /// 영역 태그 정보 리스트 / Range tag information list
    pub tags: Vec<RangeTagInfo>,
}

impl ParaRangeTag {
    /// ParaRangeTag를 바이트 배열에서 파싱합니다. / Parse ParaRangeTag from byte array.
    ///
    /// # Arguments
    /// * `data` - 영역 태그 데이터 (12×n 바이트) / Range tag data (12×n bytes)
    ///
    /// # Returns
    /// 파싱된 ParaRangeTag 구조체 / Parsed ParaRangeTag structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() % 12 != 0 {
            return Err(HwpError::UnexpectedValue {
                field: "ParaRangeTag data length".to_string(),
                expected: "multiple of 12".to_string(),
                found: format!("{} bytes", data.len()),
            });
        }

        let count = data.len() / 12;
        let mut tags = Vec::with_capacity(count);

        for i in 0..count {
            let offset = i * 12;
            let tag_data = &data[offset..offset + 12];
            let tag_info = RangeTagInfo::parse(tag_data).map_err(|e| HwpError::from(e))?;
            tags.push(tag_info);
        }

        Ok(ParaRangeTag { tags })
    }
}
