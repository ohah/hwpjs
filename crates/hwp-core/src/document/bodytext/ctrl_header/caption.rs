use crate::error::HwpError;
use crate::types::{HWPUNIT, HWPUNIT16, UINT32}; // keep

use super::types::{Caption, CaptionAlign, CaptionVAlign};

/// LIST_HEADER 레코드에서 캡션 파싱 (hwplib 방식) / Parse caption from LIST_HEADER record (hwplib approach)
pub fn parse_caption_from_list_header(data: &[u8]) -> Result<Option<Caption>, HwpError> {
    if data.len() < 22 {
        return Ok(None);
    }

    let mut offset = 0usize;

    // paraCount (SInt4) - 4 bytes (read but not used)
    offset += 4;

    let list_header_property = UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    let vertical_align = match (list_header_property >> 5) & 0x03 {
        0 => CaptionVAlign::Top,
        1 => CaptionVAlign::Middle,
        2 => CaptionVAlign::Bottom,
        _ => CaptionVAlign::Middle,
    };

    let caption_property_value = UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    let align = match caption_property_value & 0x03 {
        0 => CaptionAlign::Left,
        1 => CaptionAlign::Right,
        2 => CaptionAlign::Top,
        3 => CaptionAlign::Bottom,
        _ => CaptionAlign::Bottom,
    };

    let include_margin = (caption_property_value & 0x04) != 0;

    let width = HWPUNIT::from(UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]));
    offset += 4;

    let gap = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
    offset += 2;

    let last_width = HWPUNIT::from(UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]));

    Ok(Some(Caption {
        align,
        include_margin,
        width,
        gap,
        last_width,
        vertical_align: Some(vertical_align),
    }))
}

/// 캡션 파싱 (표 72 - 14바이트) / Parse caption (Table 72 - 14 bytes)
#[allow(dead_code)]
fn parse_caption(data: &[u8]) -> Result<Caption, HwpError> {
    if data.len() < 14 {
        return Err(HwpError::insufficient_data("Caption", 14, data.len()));
    }

    let mut offset = 0usize;
    let attribute_value = UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    let align = match attribute_value & 0x03 {
        0 => CaptionAlign::Left,
        1 => CaptionAlign::Right,
        2 => CaptionAlign::Top,
        3 => CaptionAlign::Bottom,
        _ => CaptionAlign::Bottom,
    };

    let include_margin = (attribute_value & 0x04) != 0;

    let width = HWPUNIT::from(UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]));
    offset += 4;

    let gap = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
    offset += 2;

    let last_width = HWPUNIT::from(UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]));

    Ok(Caption {
        align,
        include_margin,
        width,
        gap,
        last_width,
        vertical_align: None,
    })
}

/// 캡션 파싱 (표 72 - 12바이트 버전) / Parse caption (Table 72 - 12 bytes version)
#[allow(dead_code)]
fn parse_caption_12bytes(data: &[u8]) -> Result<Caption, HwpError> {
    if data.len() < 12 {
        return Err(HwpError::insufficient_data(
            "Caption (12 bytes)",
            12,
            data.len(),
        ));
    }

    let mut offset = 0usize;
    let attribute_value = UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    let align = match attribute_value & 0x03 {
        0 => CaptionAlign::Left,
        1 => CaptionAlign::Right,
        2 => CaptionAlign::Top,
        3 => CaptionAlign::Bottom,
        _ => CaptionAlign::Bottom,
    };

    let include_margin = (attribute_value & 0x04) != 0;

    let width = HWPUNIT::from(UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]));
    offset += 4;

    let gap = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
    let last_width = HWPUNIT::from(0);

    Ok(Caption {
        align,
        include_margin,
        width,
        gap,
        last_width,
        vertical_align: None,
    })
}
