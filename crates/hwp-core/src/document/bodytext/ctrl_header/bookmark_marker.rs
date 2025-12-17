use crate::error::HwpError;
use crate::types::decode_utf16le;
use crate::types::UINT16;

use super::types::CtrlHeaderData;

/// 찾아보기 표식 파싱 (표 149) / Parse bookmark marker (Table 149)
pub(crate) fn parse_bookmark_marker(data: &[u8]) -> Result<CtrlHeaderData, HwpError> {
    if data.len() < 6 {
        return Err(HwpError::insufficient_data("Bookmark marker", 6, data.len()));
    }

    let mut offset = 0usize;

    let keyword1_len = UINT16::from_le_bytes([data[offset], data[offset + 1]]) as usize;
    offset += 2;

    let keyword1 = if keyword1_len > 0 && offset + (keyword1_len * 2) <= data.len() {
        let keyword1_bytes = &data[offset..offset + (keyword1_len * 2)];
        decode_utf16le(keyword1_bytes).unwrap_or_default()
    } else {
        String::new()
    };
    offset += keyword1_len * 2;

    let keyword2_len = if offset + 2 <= data.len() {
        UINT16::from_le_bytes([data[offset], data[offset + 1]]) as usize
    } else {
        0
    };
    offset += 2;

    let keyword2 = if keyword2_len > 0 && offset + (keyword2_len * 2) <= data.len() {
        let keyword2_bytes = &data[offset..offset + (keyword2_len * 2)];
        decode_utf16le(keyword2_bytes).unwrap_or_default()
    } else {
        String::new()
    };

    Ok(CtrlHeaderData::BookmarkMarker { keyword1, keyword2 })
}



