use crate::error::HwpError;
use crate::types::UINT32;

use super::types::CtrlHeaderData;

/// 홀/짝수 조정 파싱 (표 146) / Parse page adjustment (Table 146)
pub(crate) fn parse_page_adjust(data: &[u8]) -> Result<CtrlHeaderData, HwpError> {
    if data.len() < 4 {
        return Err(HwpError::insufficient_data("Page adjust", 4, data.len()));
    }

    let attribute = UINT32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    Ok(CtrlHeaderData::PageAdjust { attribute })
}



