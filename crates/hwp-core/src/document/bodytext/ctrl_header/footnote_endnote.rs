use crate::error::HwpError;

use super::types::CtrlHeaderData;

/// 각주/미주 파싱 (표 4.3.10.4) / Parse footnote/endnote (Table 4.3.10.4)
pub(crate) fn parse_footnote_endnote(data: &[u8]) -> Result<CtrlHeaderData, HwpError> {
    if data.len() < 8 {
        return Err(HwpError::insufficient_data(
            "Footnote/endnote",
            8,
            data.len(),
        ));
    }

    let number = data[0];
    let mut reserved = [0u8; 5];
    reserved.copy_from_slice(&data[1..6]);
    let attribute = data[6];
    let reserved2 = data[7];

    Ok(CtrlHeaderData::FootnoteEndnote {
        number,
        reserved,
        attribute,
        reserved2,
    })
}
