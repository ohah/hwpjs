use super::{paragraphs_from_children_or_param, CtrlHeaderResult};
use crate::document::bodytext::ParagraphRecord;
use crate::document::{CtrlHeader, CtrlHeaderData, Paragraph};
use crate::viewer::html::paragraph::render_paragraphs_fragment;
use crate::viewer::HtmlOptions;
use crate::HwpDocument;

/// HTML 뷰어용 단 정의 처리: 자식 문단을 HTML로 렌더링하여 본문 흐름에 출력
pub fn process_column_def<'a>(
    header: &'a CtrlHeader,
    children: &'a [ParagraphRecord],
    paragraphs: &'a [Paragraph],
    document: &'a HwpDocument,
    options: &'a HtmlOptions,
) -> CtrlHeaderResult<'a> {
    let mut result = CtrlHeaderResult::new();

    // 다단이면 빈 결과 반환 (실제 렌더링은 부모에서 처리)
    if let CtrlHeaderData::ColumnDefinition { attribute, .. } = &header.data {
        if attribute.column_count > 1 {
            return result;
        }
    }

    let para_list = paragraphs_from_children_or_param(children, paragraphs);
    if para_list.is_empty() {
        return result;
    }

    let body = render_paragraphs_fragment(para_list, document, options);
    let prefix = &options.css_class_prefix;
    let html = format!(r#"<div class="{}column-def">{}</div>"#, prefix, body);
    result.extra_content = Some(html);
    result
}
