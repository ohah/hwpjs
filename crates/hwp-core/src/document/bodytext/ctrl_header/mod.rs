// CtrlHeader parsing/types split into modules.
mod ids;
mod types;

mod auto_number;
mod bookmark_marker;
mod caption;
mod column_definition;
mod comment;
mod field;
mod footnote_endnote;
mod header_footer;
mod hide;
mod object_common;
mod overlap;
mod page_adjust;
mod page_number_position;
mod section_definition;

pub use ids::CtrlId;
pub use types::*;

pub use caption::parse_caption_from_list_header;

use crate::error::HwpError;
use crate::types::UINT32;

impl CtrlHeader {
    /// CtrlHeader를 바이트 배열에서 파싱합니다. / Parse CtrlHeader from byte array.
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 4 {
            return Err(HwpError::insufficient_data("CtrlHeader", 4, data.len()));
        }

        let ctrl_id_value = UINT32::from_le_bytes([data[0], data[1], data[2], data[3]]);

        // pyhwp처럼 바이트를 리버스해서 읽음 / Read bytes in reverse order like pyhwp
        let ctrl_id_bytes = [data[3], data[2], data[1], data[0]];
        // 공백까지 포함해서 파싱 (trim_end 제거) / Parse including spaces (remove trim_end)
        let ctrl_id = String::from_utf8_lossy(&ctrl_id_bytes)
            .trim_end_matches('\0')
            .to_string();

        let remaining_data = if data.len() > 4 { &data[4..] } else { &[] };

        let parsed_data = match ctrl_id.as_str() {
            CtrlId::TABLE | CtrlId::SHAPE_OBJECT => object_common::parse_object_common(remaining_data)?,
            CtrlId::COLUMN_DEF => column_definition::parse_column_definition(remaining_data)?,
            CtrlId::FOOTNOTE | CtrlId::ENDNOTE => footnote_endnote::parse_footnote_endnote(remaining_data)?,
            CtrlId::HEADER | CtrlId::FOOTER => header_footer::parse_header_footer(remaining_data)?,
            CtrlId::PAGE_NUMBER | CtrlId::PAGE_NUMBER_POS => {
                page_number_position::parse_page_number_position(remaining_data)?
            }
            CtrlId::FIELD_START => field::parse_field(remaining_data)?,
            CtrlId::SECTION_DEF => section_definition::parse_section_definition(remaining_data)?,
            CtrlId::AUTO_NUMBER | CtrlId::AUTO_NUMBER_ALT => auto_number::parse_auto_number(remaining_data)?,
            CtrlId::NEW_NUMBER => auto_number::parse_new_number(remaining_data)?,
            CtrlId::HIDE => hide::parse_hide(remaining_data)?,
            CtrlId::PAGE_ADJUST => page_adjust::parse_page_adjust(remaining_data)?,
            CtrlId::BOOKMARK_MARKER => bookmark_marker::parse_bookmark_marker(remaining_data)?,
            CtrlId::OVERLAP => overlap::parse_overlap(remaining_data)?,
            CtrlId::COMMENT => comment::parse_comment(remaining_data)?,
            CtrlId::HIDDEN_DESC => CtrlHeaderData::HiddenDescription,
            _ => CtrlHeaderData::Other,
        };

        Ok(CtrlHeader {
            ctrl_id,
            ctrl_id_value,
            data: parsed_data,
        })
    }
}


