use super::{CtrlHeaderResult, FootnoteEndnoteState};
use crate::document::bodytext::ParagraphRecord;
use crate::document::{CtrlHeader, Paragraph};
use crate::viewer::html::paragraph::render_paragraphs_fragment;
use crate::viewer::HtmlOptions;
use crate::HwpDocument;

/// children에서 ListHeader의 paragraphs 반환, 없으면 ctrl_paragraphs 사용
fn paragraphs_from_children_or_param<'a>(
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

/// HTML 뷰어용 각주 처리: 본문 참조 마크업 + 문서 끝 블록용 내용 HTML 생성
pub fn process_footnote<'a>(
    _header: &'a CtrlHeader,
    children: &'a [ParagraphRecord],
    paragraphs: &'a [Paragraph],
    document: &'a HwpDocument,
    options: &'a HtmlOptions,
    note_state: Option<&mut FootnoteEndnoteState<'_>>,
) -> CtrlHeaderResult<'a> {
    let mut result = CtrlHeaderResult::new();

    let note_paragraphs = paragraphs_from_children_or_param(children, paragraphs);
    if note_paragraphs.is_empty() {
        return result;
    }

    if let Some(state) = note_state {
        let n = *state.footnote_counter;
        *state.footnote_counter = n.saturating_add(1);
        let prefix = &options.css_class_prefix;
        let id = format!("{}fn-{}", prefix, n);
        let ref_id = format!("{}fn-ref-{}", prefix, n);
        let ref_html = format!(
            "<sup class=\"{}footnote-ref\"><a href=\"#{}\" id=\"{}\">{}</a></sup>",
            prefix, id, ref_id, n
        );
        let body = render_paragraphs_fragment(note_paragraphs, document, options);
        let back_class = format!("{}footnote-back", prefix);
        let content_html = format!(
            "<div id=\"{}\" class=\"{}footnote\">{}<a href=\"#{}\" class=\"{}\">↩</a></div>",
            id, prefix, body, ref_id, back_class
        );
        state.footnote_contents.push(content_html);
        result.footnote_ref_html = Some(ref_html);
    }
    result
}
