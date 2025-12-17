use crate::error::HwpError;
use crate::types::UINT16;

use super::types::CtrlHeaderData;

/// 감추기 파싱 (표 145) / Parse hide (Table 145)
pub(crate) fn parse_hide(data: &[u8]) -> Result<CtrlHeaderData, HwpError> {
    if data.len() < 2 {
        return Err(HwpError::insufficient_data("Hide", 2, data.len()));
    }

    let attribute = UINT16::from_le_bytes([data[0], data[1]]);
    Ok(CtrlHeaderData::Hide { attribute })
}



