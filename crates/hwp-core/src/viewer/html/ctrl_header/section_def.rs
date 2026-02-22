use super::CtrlHeaderResult;
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

/// HTML 뷰어용 구역 정의 처리: 자식 문단을 HTML로 렌더링하여 본문 흐름에 출력
pub fn process_section_def<'a>(
    _header: &'a CtrlHeader,
    children: &'a [ParagraphRecord],
    paragraphs: &'a [Paragraph],
    document: &'a HwpDocument,
    options: &'a HtmlOptions,
) -> CtrlHeaderResult<'a> {
    let mut result = CtrlHeaderResult::new();

    let para_list = paragraphs_from_children_or_param(children, paragraphs);
    if para_list.is_empty() {
        return result;
    }

    let body = render_paragraphs_fragment(para_list, document, options);
    let prefix = &options.css_class_prefix;
    let html = format!(
        r#"<div class="{}section-def">{}</div>"#,
        prefix, body
    );
    result.extra_content = Some(html);
    result
}
