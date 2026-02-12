use crate::error::HwpError;
use crate::types::decode_utf16le;
use crate::types::UINT32;

use super::types::{CtrlHeaderData, PageNumberPosition, PageNumberPositionFlags};

/// 쪽 번호 위치 파싱 (표 147) / Parse page number position (Table 147)
pub(crate) fn parse_page_number_position(data: &[u8]) -> Result<CtrlHeaderData, HwpError> {
    if data.len() < 12 {
        return Err(HwpError::insufficient_data(
            "PageNumberPosition",
            12,
            data.len(),
        ));
    }

    let mut offset = 0usize;
    let flags_value = UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    let shape = (flags_value & 0xFF) as u8;

    let position = match (flags_value >> 8) & 0x0F {
        0 => PageNumberPosition::None,
        1 => PageNumberPosition::TopLeft,
        2 => PageNumberPosition::TopCenter,
        3 => PageNumberPosition::TopRight,
        4 => PageNumberPosition::BottomLeft,
        5 => PageNumberPosition::BottomCenter,
        6 => PageNumberPosition::BottomRight,
        7 => PageNumberPosition::OutsideTop,
        8 => PageNumberPosition::OutsideBottom,
        9 => PageNumberPosition::InsideTop,
        10 => PageNumberPosition::InsideBottom,
        _ => PageNumberPosition::None,
    };

    let flags = PageNumberPositionFlags { shape, position };

    let user_symbol = decode_utf16le(&data[offset..offset + 2])?;
    offset += 2;
    let prefix = decode_utf16le(&data[offset..offset + 2])?;
    offset += 2;
    let suffix = decode_utf16le(&data[offset..offset + 2])?;

    Ok(CtrlHeaderData::PageNumberPosition {
        flags,
        user_symbol,
        prefix,
        suffix,
    })
}
