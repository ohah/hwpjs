/// CtrlHeader conversion to Markdown
/// CtrlHeader를 마크다운으로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 57 - 본문의 데이터 레코드, CTRL_HEADER (HWPTAG_BEGIN + 55)
/// Spec mapping: Table 57 - BodyText data records, CTRL_HEADER (HWPTAG_BEGIN + 55)
mod column_def;
mod endnote;
mod footer;
mod footnote;
mod header;
mod page_number;
mod shape_object;
mod table;

use crate::document::{CtrlHeader, CtrlId};

use column_def::convert_column_def_ctrl_to_markdown;
use endnote::convert_endnote_ctrl_to_markdown;
use footer::convert_footer_ctrl_to_markdown;
use footnote::convert_footnote_ctrl_to_markdown;
use header::convert_header_ctrl_to_markdown;
use page_number::convert_page_number_ctrl_to_markdown;
use shape_object::convert_shape_object_ctrl_to_markdown;
use table::convert_table_ctrl_to_markdown;

/// Convert control header to markdown
/// 컨트롤 헤더를 마크다운으로 변환
///
/// # Arguments / 매개변수
/// * `header` - 컨트롤 헤더 / Control header
/// * `has_table` - 표가 이미 추출되었는지 여부 / Whether table was already extracted
///
/// # Returns / 반환값
/// 마크다운 문자열 / Markdown string
pub fn convert_control_to_markdown(header: &CtrlHeader, has_table: bool) -> String {
    match header.ctrl_id.as_str() {
        CtrlId::TABLE => convert_table_ctrl_to_markdown(header, has_table),
        CtrlId::SHAPE_OBJECT => convert_shape_object_ctrl_to_markdown(header),
        CtrlId::HEADER => convert_header_ctrl_to_markdown(header),
        CtrlId::FOOTER => convert_footer_ctrl_to_markdown(header),
        CtrlId::FOOTNOTE => convert_footnote_ctrl_to_markdown(header),
        CtrlId::ENDNOTE => convert_endnote_ctrl_to_markdown(header),
        CtrlId::COLUMN_DEF => convert_column_def_ctrl_to_markdown(),
        CtrlId::PAGE_NUMBER | CtrlId::PAGE_NUMBER_POS => {
            convert_page_number_ctrl_to_markdown(header)
        }
        _ => {
            // 기타 컨트롤은 마크다운으로 표현할 수 없으므로 빈 문자열 반환
            // Other controls cannot be expressed in markdown, so return empty string
            String::new()
        }
    }
}
