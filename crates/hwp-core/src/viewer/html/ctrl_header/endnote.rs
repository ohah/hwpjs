use super::{paragraphs_from_children_or_param, CtrlHeaderResult, FootnoteEndnoteState};
use crate::document::bodytext::ParagraphRecord;
use crate::document::{CtrlHeader, Paragraph};
use crate::viewer::html::paragraph::render_paragraphs_fragment;
use crate::viewer::HtmlOptions;
use crate::HwpDocument;

/// HTML 뷰어용 미주 처리: 본문 참조 마크업 + 문서 끝 블록용 내용 HTML 생성
pub fn process_endnote<'a>(
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
        let n = *state.endnote_counter;
        *state.endnote_counter = n.saturating_add(1);
        let prefix = &options.css_class_prefix;
        let id = format!("{}en-{}", prefix, n);
        let ref_id = format!("{}en-ref-{}", prefix, n);
        let ref_html = format!(
            "<sup class=\"{}endnote-ref\"><a href=\"#{}\" id=\"{}\">{}</a></sup>",
            prefix, id, ref_id, n
        );
        let body = render_paragraphs_fragment(note_paragraphs, document, options);
        let back_class = format!("{}endnote-back", prefix);
        let content_html = format!(
            "<div id=\"{}\" class=\"{}endnote\">{}<a href=\"#{}\" class=\"{}\">↩</a></div>",
            id, prefix, body, ref_id, back_class
        );
        state.endnote_contents.push(content_html);
        result.endnote_ref_html = Some(ref_html);
    }
    result
}
