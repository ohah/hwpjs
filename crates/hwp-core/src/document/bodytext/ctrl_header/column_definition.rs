use crate::error::HwpError;
use crate::types::{HWPUNIT16, UINT16, UINT32, UINT8};

use super::types::{ColumnDefinitionAttribute, ColumnDirection, ColumnType, CtrlHeaderData};

/// 단 정의 파싱 (표 138) / Parse column definition (Table 138)
pub(crate) fn parse_column_definition(data: &[u8]) -> Result<CtrlHeaderData, HwpError> {
    if data.len() < 12 {
        return Err(HwpError::insufficient_data(
            "Column definition",
            12,
            data.len(),
        ));
    }

    let mut offset = 0usize;

    let attribute_low = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
    offset += 2;

    let column_type = match attribute_low & 0x03 {
        0 => ColumnType::Normal,
        1 => ColumnType::Distributed,
        2 => ColumnType::Parallel,
        _ => ColumnType::Normal,
    };

    let column_count = ((attribute_low >> 2) & 0xFF) as UINT8;
    let column_count_u8 = if column_count == 0 { 1 } else { column_count };

    let column_direction = match (attribute_low >> 10) & 0x03 {
        0 => ColumnDirection::Left,
        1 => ColumnDirection::Right,
        2 => ColumnDirection::Both,
        _ => ColumnDirection::Left,
    };

    let equal_width = (attribute_low & 0x1000) != 0;

    let attribute = ColumnDefinitionAttribute {
        column_type,
        column_count: column_count_u8,
        column_direction,
        equal_width,
    };

    let column_spacing = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
    offset += 2;

    let mut column_widths = Vec::new();
    if !equal_width {
        for _ in 0..column_count_u8 {
            if offset + 2 <= data.len() {
                column_widths.push(HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]));
                offset += 2;
            } else {
                break;
            }
        }
    }

    let attribute_high = if offset + 2 <= data.len() {
        UINT16::from_le_bytes([data[offset], data[offset + 1]])
    } else {
        0
    };
    offset += 2;

    let divider_line_type = if offset < data.len() { data[offset] } else { 0 };
    offset += 1;

    let divider_line_thickness = if offset < data.len() { data[offset] } else { 0 };
    offset += 1;

    let divider_line_color = if offset + 4 <= data.len() {
        UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ])
    } else {
        0
    };

    Ok(CtrlHeaderData::ColumnDefinition {
        attribute,
        column_spacing,
        column_widths,
        attribute_high,
        divider_line_type,
        divider_line_thickness,
        divider_line_color,
    })
}
