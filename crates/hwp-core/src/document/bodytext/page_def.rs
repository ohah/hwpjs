/// PageDef 구조체 / PageDef structure
///
/// 스펙 문서 매핑: 표 131 - 용지 설정 / Spec mapping: Table 131 - Page definition
use crate::error::HwpError;
use crate::types::{HWPUNIT, UINT32};
use serde::{Deserialize, Serialize};

/// 용지 설정 / Page definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageDef {
    /// 용지 가로 크기 / Paper width
    pub paper_width: HWPUNIT,
    /// 용지 세로 크기 / Paper height
    pub paper_height: HWPUNIT,
    /// 용지 왼쪽 여백 / Left margin
    pub left_margin: HWPUNIT,
    /// 오른쪽 여백 / Right margin
    pub right_margin: HWPUNIT,
    /// 위 여백 / Top margin
    pub top_margin: HWPUNIT,
    /// 아래 여백 / Bottom margin
    pub bottom_margin: HWPUNIT,
    /// 머리말 여백 / Header margin
    pub header_margin: HWPUNIT,
    /// 꼬리말 여백 / Footer margin
    pub footer_margin: HWPUNIT,
    /// 제본 여백 / Binding margin
    pub binding_margin: HWPUNIT,
    /// 속성 / Attributes
    pub attributes: PageDefAttributes,
}

/// 용지 설정 속성 / Page definition attributes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageDefAttributes {
    /// 용지 방향 / Paper direction
    pub paper_direction: PaperDirection,
    /// 제책 방법 / Binding method
    pub binding_method: BindingMethod,
}

/// 용지 방향 / Paper direction
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaperDirection {
    /// 좁게 (세로) / Vertical (narrow)
    Vertical,
    /// 넓게 (가로) / Horizontal (wide)
    Horizontal,
}

/// 제책 방법 / Binding method
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BindingMethod {
    /// 한쪽 편집 / Single page editing
    SinglePage,
    /// 맞쪽 편집 / Facing pages editing
    FacingPages,
    /// 위로 넘기기 / Flip up
    FlipUp,
}

impl PageDef {
    /// PageDef를 바이트 배열에서 파싱합니다. / Parse PageDef from byte array.
    ///
    /// # Arguments
    /// * `data` - 최소 40바이트의 데이터 / At least 40 bytes of data
    ///
    /// # Returns
    /// 파싱된 PageDef 구조체 / Parsed PageDef structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 40 {
            return Err(HwpError::insufficient_data("PageDef", 40, data.len()));
        }

        let mut offset = 0;

        // HWPUNIT 용지 가로 크기 / HWPUNIT paper width
        let paper_width = HWPUNIT::from(UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]));
        offset += 4;

        // HWPUNIT 용지 세로 크기 / HWPUNIT paper height
        let paper_height = HWPUNIT::from(UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]));
        offset += 4;

        // HWPUNIT 용지 왼쪽 여백 / HWPUNIT left margin
        let left_margin = HWPUNIT::from(UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]));
        offset += 4;

        // HWPUNIT 오른쪽 여백 / HWPUNIT right margin
        let right_margin = HWPUNIT::from(UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]));
        offset += 4;

        // HWPUNIT 위 여백 / HWPUNIT top margin
        let top_margin = HWPUNIT::from(UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]));
        offset += 4;

        // HWPUNIT 아래 여백 / HWPUNIT bottom margin
        let bottom_margin = HWPUNIT::from(UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]));
        offset += 4;

        // HWPUNIT 머리말 여백 / HWPUNIT header margin
        let header_margin = HWPUNIT::from(UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]));
        offset += 4;

        // HWPUNIT 꼬리말 여백 / HWPUNIT footer margin
        let footer_margin = HWPUNIT::from(UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]));
        offset += 4;

        // HWPUNIT 제본 여백 / HWPUNIT binding margin
        let binding_margin = HWPUNIT::from(UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]));
        offset += 4;

        // UINT32 속성 (표 132 참조) / UINT32 attributes (see Table 132)
        let attribute_value = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);

        // 속성 파싱 (표 132) / Parse attributes (Table 132)
        let attributes = parse_page_def_attributes(attribute_value);

        Ok(PageDef {
            paper_width,
            paper_height,
            left_margin,
            right_margin,
            top_margin,
            bottom_margin,
            header_margin,
            footer_margin,
            binding_margin,
            attributes,
        })
    }
}

/// 용지 설정 속성 파싱 (표 132) / Parse page definition attributes (Table 132)
fn parse_page_def_attributes(value: UINT32) -> PageDefAttributes {
    // bit 0: 용지 방향 / bit 0: paper direction
    // 0: 좁게 (세로) / 0: vertical (narrow)
    // 1: 넓게 (가로) / 1: horizontal (wide)
    let paper_direction = if (value & 0x01) == 0 {
        PaperDirection::Vertical
    } else {
        PaperDirection::Horizontal
    };

    // bit 1-2: 제책 방법 / bit 1-2: binding method
    // 0: 한쪽 편집 / 0: single page editing
    // 1: 맞쪽 편집 / 1: facing pages editing
    // 2: 위로 넘기기 / 2: flip up
    let binding_method = match (value >> 1) & 0x03 {
        0 => BindingMethod::SinglePage,
        1 => BindingMethod::FacingPages,
        2 => BindingMethod::FlipUp,
        _ => BindingMethod::SinglePage, // 기본값 / default
    };

    PageDefAttributes {
        paper_direction,
        binding_method,
    }
}
