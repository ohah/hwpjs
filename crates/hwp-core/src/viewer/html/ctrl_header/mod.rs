mod column_def;
mod endnote;
mod footer;
mod footnote;
mod header;
mod section_def;
/// CtrlHeader 처리 모듈 / CtrlHeader processing module
///
/// 각 ctrl_id 타입별로 독립적인 모듈로 처리합니다.
/// Each ctrl_id type is processed in its own independent module.
mod shape_object;

// table 모듈은 폴더로 분리되어 있음 / table module is separated into a folder
pub mod table;

use crate::document::{CtrlHeader, CtrlId, Paragraph, ParagraphRecord};
use crate::viewer::html::line_segment::{ImageInfo, TableInfo};
use crate::viewer::HtmlOptions;
use crate::HwpDocument;

/// CtrlHeader 처리 결과 / CtrlHeader processing result
#[derive(Debug, Default)]
pub struct CtrlHeaderResult<'a> {
    /// 추출된 테이블들 / Extracted tables
    pub tables: Vec<TableInfo<'a>>,
    /// 추출된 이미지들 / Extracted images
    pub images: Vec<ImageInfo>,
}

impl<'a> CtrlHeaderResult<'a> {
    pub fn new() -> Self {
        Self {
            tables: Vec::new(),
            images: Vec::new(),
        }
    }
}

/// CtrlHeader 처리 / Process CtrlHeader
///
/// ctrl_id에 따라 적절한 모듈의 처리 함수를 호출합니다.
/// Calls the appropriate module's processing function according to ctrl_id.
pub fn process_ctrl_header<'a>(
    header: &'a CtrlHeader,
    children: &'a [ParagraphRecord],
    paragraphs: &'a [Paragraph],
    document: &'a HwpDocument,
    options: &'a HtmlOptions,
) -> CtrlHeaderResult<'a> {
    match header.ctrl_id.as_str() {
        CtrlId::TABLE => {
            // 테이블 컨트롤 처리 / Process table control
            table::process_table(header, children, paragraphs)
        }
        CtrlId::SHAPE_OBJECT => {
            // 그리기 개체 처리 / Process shape object
            shape_object::process_shape_object(header, children, paragraphs, document, options)
        }
        CtrlId::SECTION_DEF => {
            // 구역 정의 처리 / Process section definition
            section_def::process_section_def(header, children, paragraphs)
        }
        CtrlId::COLUMN_DEF => {
            // 단 정의 처리 / Process column definition
            column_def::process_column_def(header, children, paragraphs)
        }
        CtrlId::HEADER => {
            // 머리말 처리 / Process header
            header::process_header(header, children, paragraphs)
        }
        CtrlId::FOOTER => {
            // 꼬리말 처리 / Process footer
            footer::process_footer(header, children, paragraphs)
        }
        CtrlId::FOOTNOTE => {
            // 각주 처리 / Process footnote
            footnote::process_footnote(header, children, paragraphs)
        }
        CtrlId::ENDNOTE => {
            // 미주 처리 / Process endnote
            endnote::process_endnote(header, children, paragraphs)
        }
        _ => {
            // 기타 CtrlHeader 처리 / Process other CtrlHeader types
            CtrlHeaderResult::new()
        }
    }
}
