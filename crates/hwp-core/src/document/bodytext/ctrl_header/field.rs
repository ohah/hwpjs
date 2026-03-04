use crate::error::HwpError;
use crate::types::decode_utf16le;
use crate::types::{UINT16, UINT32, UINT8};

use super::types::CtrlHeaderData;

/// 필드 파싱 (표 152) / Parse field (Table 152)
/// `%%%%` (FIELD_START)용: 데이터 앞 4바이트가 field_type
pub(crate) fn parse_field(data: &[u8]) -> Result<CtrlHeaderData, HwpError> {
    if data.len() < 15 {
        return Err(HwpError::insufficient_data("Field data", 15, data.len()));
    }

    let field_type_bytes = [data[3], data[2], data[1], data[0]];
    let field_type = String::from_utf8_lossy(&field_type_bytes)
        .trim_end_matches('\0')
        .to_string();

    parse_field_data(&data[4..], field_type)
}

/// `%hlk` 등 ctrl_id가 이미 field_type인 경우: field_type 없이 바로 파싱
pub(crate) fn parse_field_by_ctrl_id(
    data: &[u8],
    ctrl_id: &str,
) -> Result<CtrlHeaderData, HwpError> {
    parse_field_data(data, ctrl_id.to_string())
}

/// 필드 공통 파싱: attribute(4) + other_attr(1) + command_len(2) + command + id(4)
fn parse_field_data(data: &[u8], field_type: String) -> Result<CtrlHeaderData, HwpError> {
    if data.len() < 11 {
        return Err(HwpError::insufficient_data("Field data", 11, data.len()));
    }

    let mut offset = 0usize;

    let attribute = UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    let other_attr = UINT8::from_le_bytes([data[offset]]);
    offset += 1;

    let command_len = UINT16::from_le_bytes([data[offset], data[offset + 1]]) as usize;
    offset += 2;

    let command = if command_len > 0 && offset + (command_len * 2) <= data.len() {
        let command_bytes = &data[offset..offset + (command_len * 2)];
        decode_utf16le(command_bytes).unwrap_or_default()
    } else {
        String::new()
    };
    offset += command_len * 2;

    let id = if offset + 4 <= data.len() {
        UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ])
    } else {
        0
    };

    Ok(CtrlHeaderData::Field {
        field_type,
        attribute,
        other_attr,
        command_len: command_len as UINT16,
        command,
        id,
    })
}
