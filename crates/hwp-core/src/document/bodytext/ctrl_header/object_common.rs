use crate::error::HwpError;
use crate::types::decode_utf16le;
use crate::types::{HWPUNIT, HWPUNIT16, INT32, SHWPUNIT, UINT16, UINT32};

use super::types::{
    CtrlHeaderData, HorzRelTo, Margin, ObjectAttribute, ObjectCategory, ObjectHeightStandard,
    ObjectTextOption, ObjectTextPositionOption, ObjectWidthStandard, VertRelTo,
};

/// 개체 공통 속성 파싱 (표 69) / Parse object common properties (Table 69)
pub(crate) fn parse_object_common(data: &[u8]) -> Result<CtrlHeaderData, HwpError> {
    if data.len() < 40 {
        return Err(HwpError::insufficient_data(
            "Object common properties",
            40,
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

    let offset_y = SHWPUNIT::from(INT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]));
    offset += 4;

    let offset_x = SHWPUNIT::from(INT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]));
    offset += 4;

    let width = HWPUNIT::from(UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]));
    offset += 4;

    let height = HWPUNIT::from(UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]));
    offset += 4;

    let z_order = INT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    let margin_bottom = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
    offset += 2;
    let margin_left = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
    offset += 2;
    let margin_right = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
    offset += 2;
    let margin_top = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
    offset += 2;

    let instance_id = UINT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    let page_divide = INT32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    let description = if offset + 2 <= data.len() {
        let description_len = UINT16::from_le_bytes([data[offset], data[offset + 1]]) as usize;
        offset += 2;
        if description_len > 0 && offset + (description_len * 2) <= data.len() {
            let description_bytes = &data[offset..offset + (description_len * 2)];
            match decode_utf16le(description_bytes) {
                Ok(text) if !text.is_empty() => Some(text),
                _ => None,
            }
        } else {
            None
        }
    } else {
        None
    };

    let attribute = parse_object_attribute(attribute_value);

    Ok(CtrlHeaderData::ObjectCommon {
        attribute,
        offset_y,
        offset_x,
        width,
        height,
        z_order,
        margin: Margin {
            top: margin_top,
            right: margin_right,
            bottom: margin_bottom,
            left: margin_left,
        },
        instance_id,
        page_divide,
        description,
        caption: None,
    })
}

/// 개체 속성 파싱 (표 70) / Parse object attribute (Table 70)
fn parse_object_attribute(value: UINT32) -> ObjectAttribute {
    let like_letters = (value & 0x01) != 0;
    let affect_line_spacing = (value & 0x04) != 0;

    let vert_rel_to = match (value >> 3) & 0x03 {
        0 => VertRelTo::Paper,
        1 => VertRelTo::Page,
        2 => VertRelTo::Para,
        _ => VertRelTo::Para,
    };
    let vert_relative = ((value >> 5) & 0x07) as u8;

    // NOTE (HWP spec Table 70):
    // vert_rel_to has Paper/Page/Para; horz_rel_to also has Paper/Page/Column/Para.
    // Previously we collapsed (0|1) into Page which loses "paper" anchors and breaks fixtures
    // (e.g. table-position '표 5' should be paper-left 35mm, but became page-left 65mm).
    let horz_rel_to = match (value >> 8) & 0x03 {
        0 => HorzRelTo::Paper,
        1 => HorzRelTo::Page,
        2 => HorzRelTo::Column,
        3 => HorzRelTo::Para,
        _ => HorzRelTo::Page,
    };
    let horz_relative = ((value >> 10) & 0x07) as u8;

    let vert_rel_to_para_limit = (value & 0x2000) != 0;
    let overlap = (value & 0x4000) != 0;

    let object_width_standard = match (value >> 15) & 0x07 {
        0 => ObjectWidthStandard::Paper,
        1 => ObjectWidthStandard::Page,
        2 => ObjectWidthStandard::Column,
        3 => ObjectWidthStandard::Para,
        4 => ObjectWidthStandard::Absolute,
        _ => ObjectWidthStandard::Absolute,
    };

    let object_height_standard = match (value >> 18) & 0x03 {
        0 => ObjectHeightStandard::Paper,
        1 => ObjectHeightStandard::Page,
        2 => ObjectHeightStandard::Absolute,
        _ => ObjectHeightStandard::Absolute,
    };

    let object_text_option = match (value >> 21) & 0x07 {
        0 => ObjectTextOption::Square,
        1 => ObjectTextOption::Tight,
        2 => ObjectTextOption::Through,
        3 => ObjectTextOption::TopAndBottom,
        4 => ObjectTextOption::BehindText,
        5 => ObjectTextOption::InFrontOfText,
        _ => ObjectTextOption::Square,
    };

    let object_text_position_option = match (value >> 24) & 0x03 {
        0 => ObjectTextPositionOption::BothSides,
        1 => ObjectTextPositionOption::LeftOnly,
        2 => ObjectTextPositionOption::RightOnly,
        3 => ObjectTextPositionOption::LargestOnly,
        _ => ObjectTextPositionOption::BothSides,
    };

    let object_category = match (value >> 26) & 0x07 {
        0 => ObjectCategory::None,
        1 => ObjectCategory::Figure,
        2 => ObjectCategory::Table,
        3 => ObjectCategory::Equation,
        _ => ObjectCategory::None,
    };

    let size_protect = (value & 0x100000) != 0;

    ObjectAttribute {
        like_letters,
        affect_line_spacing,
        vert_rel_to,
        vert_relative,
        horz_rel_to,
        horz_relative,
        vert_rel_to_para_limit,
        overlap,
        object_width_standard,
        object_height_standard,
        object_text_option,
        object_text_position_option,
        object_category,
        size_protect,
    }
}
