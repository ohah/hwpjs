use crate::error::HwpError;
use crate::types::decode_utf16le;
use crate::types::{UINT16, UINT32};

use super::types::CtrlHeaderData;

/// 자동번호 파싱 (표 142) / Parse auto number (Table 142)
pub(crate) fn parse_auto_number(data: &[u8]) -> Result<CtrlHeaderData, HwpError> {
    if data.len() < 12 {
        return Err(HwpError::insufficient_data("Auto number", 12, data.len()));
    }

    let mut offset = 0usize;

    let attribute = UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    let number = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
    offset += 2;

    let user_symbol = decode_utf16le(&data[offset..offset + 2]).unwrap_or_default();
    offset += 2;
    let prefix = decode_utf16le(&data[offset..offset + 2]).unwrap_or_default();
    offset += 2;
    let suffix = decode_utf16le(&data[offset..offset + 2]).unwrap_or_default();

    Ok(CtrlHeaderData::AutoNumber {
        attribute,
        number,
        user_symbol,
        prefix,
        suffix,
    })
}

/// 새 번호 지정 파싱 (표 144) / Parse new number specification (Table 144)
pub(crate) fn parse_new_number(data: &[u8]) -> Result<CtrlHeaderData, HwpError> {
    if data.len() < 8 {
        return Err(HwpError::insufficient_data("New number", 8, data.len()));
    }

    let mut offset = 0usize;
    let attribute = UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    let number = UINT16::from_le_bytes([data[offset], data[offset + 1]]);

    Ok(CtrlHeaderData::NewNumber { attribute, number })
}
