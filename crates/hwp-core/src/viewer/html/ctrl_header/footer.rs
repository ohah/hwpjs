use super::{paragraphs_from_children_or_param, CtrlHeaderResult};
use crate::document::bodytext::list_header::VerticalAlign;
use crate::document::bodytext::ParagraphRecord;
use crate::document::{CtrlHeader, Paragraph};
use crate::viewer::html::paragraph::render_paragraphs_fragment;
use crate::viewer::html::styles::int32_to_mm;
use crate::viewer::HtmlOptions;
use crate::HwpDocument;

/// HTML 뷰어용 꼬리말 처리: 문단 목록을 HTML로 렌더링하여 본문 하단에 출력할 HTML 반환
pub fn process_footer<'a>(
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
    result.footer_html = Some(body);

    // ListHeader의 vertical_align 확인 및 content height 계산
    // Check ListHeader vertical_align and calculate content height
    for child in children {
        if let ParagraphRecord::ListHeader { header, .. } = child {
            if matches!(header.attribute.vertical_align, VerticalAlign::Bottom) {
                // 꼬리말 콘텐츠 높이를 line segment에서 계산
                // Calculate footer content height from line segments
                let content_height_mm = calculate_content_height(para_list);
                if content_height_mm > 0.0 {
                    result.footer_content_height_mm = Some(content_height_mm);
                }
            }
            break;
        }
    }

    result
}

/// 문단 목록의 콘텐츠 높이 계산 (마지막 세그먼트의 vertical_position + line_height)
/// Calculate content height from paragraph list (last segment's vertical_position + line_height)
/// 반올림하지 않은 raw 값 반환 (최종 hcI top 계산 시에만 반올림)
/// Returns unrounded raw value (rounding applied only at final hcI top calculation)
fn calculate_content_height(paragraphs: &[Paragraph]) -> f64 {
    let mut max_height: f64 = 0.0;
    for para in paragraphs {
        for record in &para.records {
            if let ParagraphRecord::ParaLineSeg { segments } = record {
                if let Some(last_seg) = segments.last() {
                    let h = int32_to_mm(last_seg.vertical_position)
                        + int32_to_mm(last_seg.line_height);
                    if h > max_height {
                        max_height = h;
                    }
                }
            }
        }
    }
    max_height
}
