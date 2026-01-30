use crate::error::HwpError;
use crate::types::{HWPUNIT, UINT32};

use super::types::{ApplyPage, CtrlHeaderData, HeaderFooterAttribute};

/// 머리말/꼬리말 파싱 (표 140) / Parse header/footer (Table 140)
pub(crate) fn parse_header_footer(data: &[u8]) -> Result<CtrlHeaderData, HwpError> {
    if data.len() < 4 {
        return Err(HwpError::insufficient_data("Header/Footer", 4, data.len()));
    }

    let mut offset = 0usize;

    let attribute_value = UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    let apply_page = match attribute_value & 0x03 {
        0 => ApplyPage::Both,
        1 => ApplyPage::EvenOnly,
        2 => ApplyPage::OddOnly,
        _ => ApplyPage::Both,
    };

    let attribute = HeaderFooterAttribute { apply_page };

    let text_width = if offset + 4 <= data.len() {
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

    let text_height = if offset + 4 <= data.len() {
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

    let text_ref = if offset < data.len() { data[offset] } else { 0 };
    offset += 1;
    let number_ref = if offset < data.len() { data[offset] } else { 0 };

    Ok(CtrlHeaderData::HeaderFooter {
        attribute,
        text_width,
        text_height,
        text_ref,
        number_ref,
    })
}
