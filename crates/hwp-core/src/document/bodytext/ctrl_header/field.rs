use crate::error::HwpError;
use crate::types::decode_utf16le;
use crate::types::{UINT16, UINT32, UINT8};

use super::types::CtrlHeaderData;

/// 필드 파싱 (표 152) / Parse field (Table 152)
pub(crate) fn parse_field(data: &[u8]) -> Result<CtrlHeaderData, HwpError> {
    if data.len() < 15 {
        return Err(HwpError::insufficient_data("Field data", 15, data.len()));
    }

    let mut offset = 0usize;

    let field_type_bytes = [
        data[offset + 3],
        data[offset + 2],
        data[offset + 1],
        data[offset],
    ];
    let field_type = String::from_utf8_lossy(&field_type_bytes)
        .trim_end_matches('\0')
        .to_string();
    offset += 4;

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
