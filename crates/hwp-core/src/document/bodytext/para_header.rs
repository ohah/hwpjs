/// ParaHeader 구조체 / ParaHeader structure
///
/// 스펙 문서 매핑: 표 58 - 문단 헤더 / Spec mapping: Table 58 - Paragraph header
/// Tag ID: HWPTAG_PARA_HEADER
/// 전체 길이: 24바이트 (5.0.3.2 이상) / Total length: 24 bytes (5.0.3.2 and above)
use crate::types::{UINT16, UINT32, UINT8};
use serde::{Deserialize, Serialize};

/// 단 나누기 종류 / Column divide type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ColumnDivideType {
    /// 구역 나누기 / Section divide
    Section = 0x01,
    /// 다단 나누기 / Multi-column divide
    MultiColumn = 0x02,
    /// 쪽 나누기 / Page divide
    Page = 0x04,
    /// 단 나누기 / Column divide
    Column = 0x08,
}

impl ColumnDivideType {
    fn from_bits(bits: u8) -> Vec<Self> {
        let mut types = Vec::new();
        if bits & 0x01 != 0 {
            types.push(ColumnDivideType::Section);
        }
        if bits & 0x02 != 0 {
            types.push(ColumnDivideType::MultiColumn);
        }
        if bits & 0x04 != 0 {
            types.push(ColumnDivideType::Page);
        }
        if bits & 0x08 != 0 {
            types.push(ColumnDivideType::Column);
        }
        types
    }
}

/// 문단 헤더 구조체 / Paragraph header structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParaHeader {
    /// 텍스트 문자 수 / Text character count
    /// `if (nchars & 0x80000000) { nchars &= 0x7fffffff; }`
    pub text_char_count: UINT32,
    /// 컨트롤 마스크 / Control mask
    /// `(UINT32)(1<<ctrich) 조합`
    pub control_mask: UINT32,
    /// 문단 모양 아이디 참조값 / Paragraph shape ID reference
    pub para_shape_id: UINT16,
    /// 문단 스타일 아이디 참조값 / Paragraph style ID reference
    pub para_style_id: UINT8,
    /// 단 나누기 종류 / Column divide type
    pub column_divide_type: Vec<ColumnDivideType>,
    /// 글자 모양 정보 수 / Character shape info count
    pub char_shape_count: UINT16,
    /// range tag 정보 수 / Range tag info count
    pub range_tag_count: UINT16,
    /// 각 줄에 대한 align에 대한 정보 수 / Line align info count
    pub line_align_count: UINT16,
    /// 문단 Instance ID (unique ID) / Paragraph instance ID
    pub instance_id: UINT32,
    /// 변경추적 병합 문단여부 (5.0.3.2 버전 이상) / Track change merge paragraph flag (5.0.3.2 and above)
    pub section_merge: Option<UINT16>,
}

impl Default for ParaHeader {
    fn default() -> Self {
        Self {
            text_char_count: 0,
            control_mask: 0,
            para_shape_id: 0,
            para_style_id: 0,
            column_divide_type: Vec::new(),
            char_shape_count: 0,
            range_tag_count: 0,
            line_align_count: 0,
            instance_id: 0,
            section_merge: None,
        }
    }
}

impl ParaHeader {
    /// ParaHeader를 바이트 배열에서 파싱합니다. / Parse ParaHeader from byte array.
    ///
    /// # Arguments
    /// * `data` - 최소 22바이트의 데이터 (5.0.3.2 이상은 24바이트) / At least 22 bytes of data (24 bytes for 5.0.3.2 and above)
    /// * `version` - 파일 버전 (5.0.3.2 이상인지 확인용) / File version (to check if 5.0.3.2 and above)
    ///
    /// # Returns
    /// 파싱된 ParaHeader 구조체 / Parsed ParaHeader structure
    pub fn parse(data: &[u8], version: u32) -> Result<Self, String> {
        // 최소 22바이트 필요 (5.0.3.2 이상은 24바이트) / Need at least 22 bytes (24 bytes for 5.0.3.2 and above)
        let min_size = if version >= 0x05000302 { 24 } else { 22 };
        if data.len() < min_size {
            return Err(format!(
                "ParaHeader must be at least {} bytes, got {} bytes",
                min_size,
                data.len()
            ));
        }

        let mut offset = 0;

        // UINT32 text(=chars) / UINT32 text character count
        let mut text_char_count = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        // `if (nchars & 0x80000000) { nchars &= 0x7fffffff; }`
        if text_char_count & 0x80000000 != 0 {
            text_char_count &= 0x7fffffff;
        }
        offset += 4;

        // UINT32 control mask / UINT32 control mask
        let control_mask = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // UINT16 문단 모양 아이디 참조값 / UINT16 paragraph shape ID reference
        let para_shape_id = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT8 문단 스타일 아이디 참조값 / UINT8 paragraph style ID reference
        let para_style_id = data[offset];
        offset += 1;

        // UINT8 단 나누기 종류 / UINT8 column divide type
        let column_divide_bits = data[offset];
        let column_divide_type = ColumnDivideType::from_bits(column_divide_bits);
        offset += 1;

        // UINT16 글자 모양 정보 수 / UINT16 character shape info count
        let char_shape_count = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT16 range tag 정보 수 / UINT16 range tag info count
        let range_tag_count = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT16 각 줄에 대한 align에 대한 정보 수 / UINT16 line align info count
        let line_align_count = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT32 문단 Instance ID / UINT32 paragraph instance ID
        let instance_id = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // UINT16 변경추적 병합 문단여부 (5.0.3.2 버전 이상) / UINT16 track change merge paragraph flag (5.0.3.2 and above)
        let section_merge = if version >= 0x05000302 && data.len() >= 24 {
            Some(UINT16::from_le_bytes([data[offset], data[offset + 1]]))
        } else {
            None
        };

        Ok(ParaHeader {
            text_char_count,
            control_mask,
            para_shape_id,
            para_style_id,
            column_divide_type,
            char_shape_count,
            range_tag_count,
            line_align_count,
            instance_id,
            section_merge,
        })
    }
}
