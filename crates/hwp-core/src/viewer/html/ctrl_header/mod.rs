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

/// children에서 ListHeader의 paragraphs 반환, 없으면 ctrl_paragraphs 사용.
/// Return paragraphs from ListHeader in children, or ctrl_paragraphs if not found.
pub(super) fn paragraphs_from_children_or_param<'a>(
    children: &'a [ParagraphRecord],
    ctrl_paragraphs: &'a [Paragraph],
) -> &'a [Paragraph] {
    for child in children {
        if let ParagraphRecord::ListHeader { paragraphs, .. } = child {
            return paragraphs;
        }
    }
    ctrl_paragraphs
}

/// 문서 레벨 각주/미주 수집 상태 (HTML 뷰어에서 본문 반복 시 전달)
/// Document-level footnote/endnote collection state (passed during body iteration in HTML viewer)
pub struct FootnoteEndnoteState<'a> {
    pub footnote_counter: &'a mut u32,
    pub endnote_counter: &'a mut u32,
    pub footnote_contents: &'a mut Vec<String>,
    pub endnote_contents: &'a mut Vec<String>,
}

/// CtrlHeader 처리 결과 / CtrlHeader processing result
#[derive(Debug, Default)]
pub struct CtrlHeaderResult<'a> {
    /// 추출된 테이블들 / Extracted tables
    pub tables: Vec<TableInfo<'a>>,
    /// 추출된 이미지들 / Extracted images
    pub images: Vec<ImageInfo>,
    /// 본문 내 각주 참조 HTML (한 건당 한 번만 설정) / In-body footnote reference HTML (one per encounter)
    pub footnote_ref_html: Option<String>,
    /// 본문 내 미주 참조 HTML / In-body endnote reference HTML
    pub endnote_ref_html: Option<String>,
    /// 머리말 영역 HTML (문서 상단에 출력) / Header area HTML (output at top of body)
    pub header_html: Option<String>,
    /// 꼬리말 영역 HTML (본문 하단에 출력) / Footer area HTML (output at bottom of body)
    pub footer_html: Option<String>,
    /// 구역/단 등 인라인 콘텐츠 HTML (해당 컨트롤 위치에 출력) / Section/column etc. inline content HTML (output at control position)
    pub extra_content: Option<String>,
}

impl<'a> CtrlHeaderResult<'a> {
    pub fn new() -> Self {
        Self {
            tables: Vec::new(),
            images: Vec::new(),
            footnote_ref_html: None,
            endnote_ref_html: None,
            header_html: None,
            footer_html: None,
            extra_content: None,
        }
    }
}

/// CtrlHeader 처리 / Process CtrlHeader
///
/// ctrl_id에 따라 적절한 모듈의 처리 함수를 호출합니다.
/// note_state가 있으면 각주/미주 시 참조·내용을 수집합니다.
/// Calls the appropriate module's processing function according to ctrl_id.
/// When note_state is present, footnote/endnote ref and content are collected.
pub fn process_ctrl_header<'a>(
    header: &'a CtrlHeader,
    children: &'a [ParagraphRecord],
    paragraphs: &'a [Paragraph],
    document: &'a HwpDocument,
    options: &'a HtmlOptions,
    note_state: Option<&mut FootnoteEndnoteState<'_>>,
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
            section_def::process_section_def(header, children, paragraphs, document, options)
        }
        CtrlId::COLUMN_DEF => {
            // 단 정의 처리 / Process column definition
            column_def::process_column_def(header, children, paragraphs, document, options)
        }
        CtrlId::HEADER => {
            // 머리말 처리 / Process header
            header::process_header(header, children, paragraphs, document, options)
        }
        CtrlId::FOOTER => {
            // 꼬리말 처리 / Process footer
            footer::process_footer(header, children, paragraphs, document, options)
        }
        CtrlId::FOOTNOTE => {
            // 각주 처리 / Process footnote
            footnote::process_footnote(header, children, paragraphs, document, options, note_state)
        }
        CtrlId::ENDNOTE => {
            // 미주 처리 / Process endnote
            endnote::process_endnote(header, children, paragraphs, document, options, note_state)
        }
        _ => {
            // 기타 CtrlHeader 처리 / Process other CtrlHeader types
            CtrlHeaderResult::new()
        }
    }
}
