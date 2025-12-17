use crate::error::HwpError;
use crate::types::{HWPUNIT, HWPUNIT16, UINT16, UINT32};

use super::types::CtrlHeaderData;

/// 구역 정의 파싱 (표 129) / Parse section definition (Table 129)
pub(crate) fn parse_section_definition(data: &[u8]) -> Result<CtrlHeaderData, HwpError> {
    if data.len() < 24 {
        return Err(HwpError::insufficient_data(
            "Section definition",
            24,
            data.len(),
        ));
    }

    let mut offset = 0usize;

    let attribute = UINT32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
    offset += 4;

    let column_spacing = if offset + 2 <= data.len() {
        HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]])
    } else {
        0
    };
    offset += 2;

    let vertical_alignment = if offset + 2 <= data.len() {
        HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]])
    } else {
        0
    };
    offset += 2;

    let horizontal_alignment = if offset + 2 <= data.len() {
        HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]])
    } else {
        0
    };
    offset += 2;

    let default_tip_spacing = if offset + 4 <= data.len() {
        HWPUNIT::from(UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]))
    } else {
        HWPUNIT::from(0)
    };
    offset += 4;

    let number_para_shape_id = if offset + 2 <= data.len() {
        UINT16::from_le_bytes([data[offset], data[offset + 1]])
    } else {
        0
    };
    offset += 2;

    let page_number = if offset + 2 <= data.len() {
        UINT16::from_le_bytes([data[offset], data[offset + 1]])
    } else {
        0
    };
    offset += 2;

    let figure_number = if offset + 2 <= data.len() {
        UINT16::from_le_bytes([data[offset], data[offset + 1]])
    } else {
        0
    };
    offset += 2;

    let table_number = if offset + 2 <= data.len() {
        UINT16::from_le_bytes([data[offset], data[offset + 1]])
    } else {
        0
    };
    offset += 2;

    let equation_number = if offset + 2 <= data.len() {
        UINT16::from_le_bytes([data[offset], data[offset + 1]])
    } else {
        0
    };
    offset += 2;

    let language = if offset + 2 <= data.len() {
        UINT16::from_le_bytes([data[offset], data[offset + 1]])
    } else {
        0
    };

    Ok(CtrlHeaderData::SectionDefinition {
        attribute,
        column_spacing,
        vertical_alignment,
        horizontal_alignment,
        default_tip_spacing,
        number_para_shape_id,
        page_number,
        figure_number,
        table_number,
        equation_number,
        language,
    })
}



