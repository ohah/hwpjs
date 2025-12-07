/// CtrlHeader conversion to HTML
/// CtrlHeader를 HTML로 변환하는 모듈
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

use column_def::convert_column_def_ctrl_to_html;
use endnote::convert_endnote_ctrl_to_html;
use footer::convert_footer_ctrl_to_html;
use footnote::convert_footnote_ctrl_to_html;
use header::convert_header_ctrl_to_html;
use page_number::convert_page_number_ctrl_to_html;
use shape_object::convert_shape_object_ctrl_to_html;
use table::convert_table_ctrl_to_html;

/// Convert control header to HTML
/// 컨트롤 헤더를 HTML로 변환
///
/// # Arguments / 매개변수
/// * `header` - 컨트롤 헤더 / Control header
/// * `has_table` - 표가 이미 추출되었는지 여부 / Whether table was already extracted
/// * `css_prefix` - CSS 클래스 접두사 / CSS class prefix
///
/// # Returns / 반환값
/// HTML 문자열 / HTML string
pub fn convert_control_to_html(
    header: &CtrlHeader,
    has_table: bool,
    css_prefix: &str,
) -> String {
    match header.ctrl_id.as_str() {
        CtrlId::TABLE => convert_table_ctrl_to_html(header, has_table, css_prefix),
        CtrlId::SHAPE_OBJECT => convert_shape_object_ctrl_to_html(header, css_prefix),
        CtrlId::HEADER => convert_header_ctrl_to_html(header, css_prefix),
        CtrlId::FOOTER => convert_footer_ctrl_to_html(header, css_prefix),
        CtrlId::FOOTNOTE => convert_footnote_ctrl_to_html(header, css_prefix),
        CtrlId::ENDNOTE => convert_endnote_ctrl_to_html(header, css_prefix),
        CtrlId::COLUMN_DEF => convert_column_def_ctrl_to_html(css_prefix),
        CtrlId::PAGE_NUMBER | CtrlId::PAGE_NUMBER_POS => {
            convert_page_number_ctrl_to_html(header, css_prefix)
        }
        _ => {
            // 기타 컨트롤은 HTML로 표현할 수 없으므로 빈 문자열 반환
            // Other controls cannot be expressed in HTML, so return empty string
            String::new()
        }
    }
}

