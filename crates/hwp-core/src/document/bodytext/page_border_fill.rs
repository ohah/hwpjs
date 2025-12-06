/// PageBorderFill 구조체 / PageBorderFill structure
///
/// 스펙 문서 매핑: 표 135 - 쪽 테두리/배경 / Spec mapping: Table 135 - Page border/fill
use crate::error::HwpError;
use crate::types::{HWPUNIT16, UINT16, UINT32};
use serde::{Deserialize, Serialize};

/// 쪽 테두리/배경 / Page border/fill
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageBorderFill {
    /// 속성 / Attributes
    pub attributes: PageBorderFillAttributes,
    /// 테두리/배경 위치 왼쪽 간격 / Left spacing
    pub left_spacing: HWPUNIT16,
    /// 테두리/배경 위치 오른쪽 간격 / Right spacing
    pub right_spacing: HWPUNIT16,
    /// 테두리/배경 위치 위쪽 간격 / Top spacing
    pub top_spacing: HWPUNIT16,
    /// 테두리/배경 위치 아래쪽 간격 / Bottom spacing
    pub bottom_spacing: HWPUNIT16,
    /// 테두리/배경 ID / Border/fill ID
    pub border_fill_id: UINT16,
}

/// 쪽 테두리/배경 속성 / Page border/fill attributes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageBorderFillAttributes {
    /// 위치 기준 / Position reference
    pub position_reference: PositionReference,
    /// 머리말 포함 여부 / Include header
    pub include_header: bool,
    /// 꼬리말 포함 여부 / Include footer
    pub include_footer: bool,
    /// 채울 영역 / Fill area
    pub fill_area: FillArea,
}

/// 위치 기준 / Position reference
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PositionReference {
    /// 본문 기준 / Body text reference
    BodyText,
    /// 종이 기준 / Paper reference
    Paper,
}

/// 채울 영역 / Fill area
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FillArea {
    /// 종이 / Paper
    Paper,
    /// 쪽 / Page
    Page,
    /// 테두리 / Border
    Border,
}

impl PageBorderFill {
    /// PageBorderFill를 바이트 배열에서 파싱합니다. / Parse PageBorderFill from byte array.
    ///
    /// # Arguments
    /// * `data` - 최소 12바이트의 데이터 / At least 12 bytes of data
    ///
    /// # Returns
    /// 파싱된 PageBorderFill 구조체 / Parsed PageBorderFill structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 12 {
            return Err(HwpError::insufficient_data("PageBorderFill", 12, data.len()));
        }

        let mut offset = 0;

        // UINT 속성 (표 136 참조) / UINT attributes (see Table 136)
        let attribute_value = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 속성 파싱 (표 136) / Parse attributes (Table 136)
        let attributes = parse_page_border_fill_attributes(attribute_value);

        // HWPUNIT16 테두리/배경 위치 왼쪽 간격 / HWPUNIT16 left spacing
        let left_spacing = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // HWPUNIT16 테두리/배경 위치 오른쪽 간격 / HWPUNIT16 right spacing
        let right_spacing = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // HWPUNIT16 테두리/배경 위치 위쪽 간격 / HWPUNIT16 top spacing
        let top_spacing = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // HWPUNIT16 테두리/배경 위치 아래쪽 간격 / HWPUNIT16 bottom spacing
        let bottom_spacing = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT16 테두리/배경 ID / UINT16 border/fill ID
        let border_fill_id = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        Ok(PageBorderFill {
            attributes,
            left_spacing,
            right_spacing,
            top_spacing,
            bottom_spacing,
            border_fill_id,
        })
    }
}

/// 쪽 테두리/배경 속성 파싱 (표 136) / Parse page border/fill attributes (Table 136)
fn parse_page_border_fill_attributes(value: UINT32) -> PageBorderFillAttributes {
    // bit 0: 위치 기준 / bit 0: position reference
    // 0: 본문 기준 / 0: body text reference
    // 1: 종이 기준 / 1: paper reference
    let position_reference = if (value & 0x01) == 0 {
        PositionReference::BodyText
    } else {
        PositionReference::Paper
    };

    // bit 1: 머리말 포함 여부 / bit 1: include header
    let include_header = (value & 0x02) != 0;

    // bit 2: 꼬리말 포함 여부 / bit 2: include footer
    let include_footer = (value & 0x04) != 0;

    // bit 3-4: 채울 영역 / bit 3-4: fill area
    // 0: 종이 / 0: paper
    // 1: 쪽 / 1: page
    // 2: 테두리 / 2: border
    let fill_area = match (value >> 3) & 0x03 {
        0 => FillArea::Paper,
        1 => FillArea::Page,
        2 => FillArea::Border,
        _ => FillArea::Paper, // 기본값 / default
    };

    PageBorderFillAttributes {
        position_reference,
        include_header,
        include_footer,
        fill_area,
    }
}
