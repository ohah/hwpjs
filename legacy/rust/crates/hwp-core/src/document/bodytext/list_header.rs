/// ListHeader 구조체 / ListHeader structure
///
/// 스펙 문서 매핑: 표 65 - 문단 리스트 헤더 / Spec mapping: Table 65 - Paragraph list header
use crate::error::HwpError;
use crate::types::{INT16, UINT32};
use serde::{Deserialize, Serialize};

/// 문단 리스트 헤더 / Paragraph list header
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListHeader {
    /// 문단 수 / Paragraph count
    pub paragraph_count: INT16,
    /// 속성 (표 65-1 참조) / Attribute (see Table 65-1)
    pub attribute: ListHeaderAttribute,
}

/// 문단 리스트 헤더 속성 (표 65-1) / Paragraph list header attribute (Table 65-1)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListHeaderAttribute {
    /// 텍스트 방향 / Text direction
    pub text_direction: TextDirection,
    /// 문단의 줄바꿈 / Paragraph line break
    pub line_break: LineBreak,
    /// 세로 정렬 / Vertical alignment
    pub vertical_align: VerticalAlign,
}

/// 텍스트 방향 / Text direction
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextDirection {
    /// 가로 / Horizontal
    Horizontal,
    /// 세로 / Vertical
    Vertical,
}

/// 문단의 줄바꿈 / Paragraph line break
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LineBreak {
    /// 일반적인 줄바꿈 / Normal line break
    Normal,
    /// 자간을 조종하여 한 줄을 유지 / Maintain one line by adjusting character spacing
    MaintainOneLine,
    /// 내용에 따라 폭이 늘어남 / Width increases according to content
    ExpandByContent,
}

/// 세로 정렬 / Vertical alignment
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VerticalAlign {
    /// 위쪽 / Top
    Top,
    /// 가운데 / Center
    Center,
    /// 아래쪽 / Bottom
    Bottom,
}

impl ListHeader {
    /// ListHeader를 바이트 배열에서 파싱합니다. / Parse ListHeader from byte array.
    ///
    /// # Arguments
    /// * `data` - 최소 6바이트의 데이터 / At least 6 bytes of data
    ///
    /// # Returns
    /// 파싱된 ListHeader 구조체 / Parsed ListHeader structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        // 표 65에는 6바이트로 되어있지만 실제 파일/구현에서는
        // - 6바이트: [paragraph_count:2][attribute:4]
        // - 8바이트: [paragraph_count:2][unknown1:2][attribute:4]
        // 변형이 존재합니다. pyhwp는 8바이트 구조를 기본으로 사용합니다.
        // 따라서 최소 6바이트를 허용하되, 8바이트 이상이면 8바이트 구조를 우선합니다.
        if data.len() < 6 {
            return Err(HwpError::insufficient_data("ListHeader", 6, data.len()));
        }

        // INT16 문단 수 / INT16 paragraph count
        let paragraph_count = INT16::from_le_bytes([data[0], data[1]]);

        // UINT32 속성 (표 65-1 참조) / UINT32 attribute (see Table 65-1)
        // 6바이트 구조: [paragraph_count:2][attribute:4]
        // 8바이트 구조: [paragraph_count:2][unknown1:2][attribute:4]
        let attribute_value = if data.len() >= 8 {
            UINT32::from_le_bytes([data[4], data[5], data[6], data[7]])
        } else {
            UINT32::from_le_bytes([data[2], data[3], data[4], data[5]])
        };

        // 속성 파싱 (표 65-1) / Parse attribute (Table 65-1)
        let attribute = parse_list_header_attribute(attribute_value);

        Ok(ListHeader {
            paragraph_count,
            attribute,
        })
    }
}

/// 문단 리스트 헤더 속성 파싱 (표 65-1) / Parse list header attribute (Table 65-1)
fn parse_list_header_attribute(value: UINT32) -> ListHeaderAttribute {
    // bit 0-2: 텍스트 방향 / bit 0-2: text direction
    let text_direction = match value & 0x07 {
        0 => TextDirection::Horizontal,
        1 => TextDirection::Vertical,
        _ => TextDirection::Horizontal,
    };

    // bit 3-4: 문단의 줄바꿈 / bit 3-4: paragraph line break
    let line_break = match (value >> 3) & 0x03 {
        0 => LineBreak::Normal,
        1 => LineBreak::MaintainOneLine,
        2 => LineBreak::ExpandByContent,
        _ => LineBreak::Normal,
    };

    // bit 5-6: 세로 정렬 / bit 5-6: vertical alignment
    let vertical_align = match (value >> 5) & 0x03 {
        // 스펙(표 65-1): 0=top, 1=center, 2=bottom
        0 => VerticalAlign::Top,
        1 => VerticalAlign::Center,
        2 => VerticalAlign::Bottom,
        _ => VerticalAlign::Top,
    };

    ListHeaderAttribute {
        text_direction,
        line_break,
        vertical_align,
    }
}
