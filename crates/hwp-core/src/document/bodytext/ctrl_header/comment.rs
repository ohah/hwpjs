use crate::error::HwpError;
use crate::types::decode_utf16le;
use crate::types::{UINT16, UINT32};

use super::types::CtrlHeaderData;

/// 덧말 파싱 (표 151) / Parse comment (Table 151)
pub(crate) fn parse_comment(data: &[u8]) -> Result<CtrlHeaderData, HwpError> {
    if data.len() < 18 {
        return Err(HwpError::insufficient_data("Comment", 18, data.len()));
    }

    let mut offset = 0usize;

    let main_text_len = UINT16::from_le_bytes([data[offset], data[offset + 1]]) as usize;
    offset += 2;

    let main_text = if main_text_len > 0 && offset + (main_text_len * 2) <= data.len() {
        let main_text_bytes = &data[offset..offset + (main_text_len * 2)];
        decode_utf16le(main_text_bytes).unwrap_or_default()
    } else {
        String::new()
    };
    offset += main_text_len.max(1) * 2;

    let sub_text_len = if offset + 2 <= data.len() {
        UINT16::from_le_bytes([data[offset], data[offset + 1]]) as usize
    } else {
        0
    };
    offset += 2;

    let sub_text = if sub_text_len > 0 && offset + (sub_text_len * 2) <= data.len() {
        let sub_text_bytes = &data[offset..offset + (sub_text_len * 2)];
        decode_utf16le(sub_text_bytes).unwrap_or_default()
    } else {
        String::new()
    };
    offset += sub_text_len.max(1) * 2;

    let position = if offset + 4 <= data.len() {
        UINT32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
    } else {
        0
    };
    offset += 4;

    let fsize_ratio = if offset + 4 <= data.len() {
        UINT32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
    } else {
        0
    };
    offset += 4;

    let option = if offset + 4 <= data.len() {
        UINT32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
    } else {
        0
    };
    offset += 4;

    let style_number = if offset + 4 <= data.len() {
        UINT32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
    } else {
        0
    };
    offset += 4;

    let alignment = if offset + 4 <= data.len() {
        UINT32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
    } else {
        0
    };

    Ok(CtrlHeaderData::Comment {
        main_text,
        sub_text,
        position,
        fsize_ratio,
        option,
        style_number,
        alignment,
    })
}



