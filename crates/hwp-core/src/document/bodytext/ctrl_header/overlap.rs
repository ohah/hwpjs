use crate::error::HwpError;
use crate::types::decode_utf16le;
use crate::types::{INT8, UINT16, UINT32, UINT8};

use super::types::CtrlHeaderData;

/// 글자 겹침 파싱 (표 150) / Parse character overlap (Table 150)
pub(crate) fn parse_overlap(data: &[u8]) -> Result<CtrlHeaderData, HwpError> {
    if data.len() < 10 {
        return Err(HwpError::insufficient_data("Overlap", 10, data.len()));
    }

    let mut offset = 0usize;

    let ctrl_id_bytes = [data[offset + 3], data[offset + 2], data[offset + 1], data[offset]];
    let ctrl_id = String::from_utf8_lossy(&ctrl_id_bytes)
        .trim_end_matches('\0')
        .to_string();
    offset += 4;

    let text_len = UINT16::from_le_bytes([data[offset], data[offset + 1]]) as usize;
    offset += 2;

    let text = if text_len > 0 && offset + (text_len * 2) <= data.len() {
        let text_bytes = &data[offset..offset + (text_len * 2)];
        decode_utf16le(text_bytes).unwrap_or_default()
    } else {
        String::new()
    };
    offset += text_len * 2;

    let border_type = if offset < data.len() { UINT8::from_le_bytes([data[offset]]) } else { 0 };
    offset += 1;
    let internal_text_size = if offset < data.len() { INT8::from_le_bytes([data[offset]]) } else { 0 };
    offset += 1;
    let border_internal_text_spread =
        if offset < data.len() { UINT8::from_le_bytes([data[offset]]) } else { 0 };
    offset += 1;

    let cnt = if offset < data.len() {
        UINT8::from_le_bytes([data[offset]]) as usize
    } else {
        0
    };
    offset += 1;

    let mut char_shape_ids = Vec::new();
    if cnt > 0 && offset + (cnt * 4) <= data.len() {
        for _ in 0..cnt {
            let id = UINT32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
            char_shape_ids.push(id);
            offset += 4;
        }
    }

    Ok(CtrlHeaderData::Overlap {
        ctrl_id,
        text,
        border_type,
        internal_text_size,
        border_internal_text_spread,
        char_shape_ids,
    })
}



