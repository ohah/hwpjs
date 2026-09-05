use super::{CtrlHeaderResult, FootnoteBlock, FootnoteEndnoteState};
use crate::document::bodytext::ParagraphRecord;
use crate::document::{CtrlHeader, Paragraph};
use crate::viewer::html::paragraph::collect_line_segments;
use crate::viewer::html::styles::{int32_to_mm, round_to_2dp};
use crate::viewer::html::text::{extract_text_and_shapes, render_text};
use crate::viewer::HtmlOptions;
use crate::HwpDocument;

/// HTML 뷰어용 각주 처리: 본문 참조 마크업 + FootnoteBlock 데이터 수집
pub fn process_footnote<'a>(
    _header: &'a CtrlHeader,
    _children: &'a [ParagraphRecord],
    paragraphs: &'a [Paragraph],
    document: &'a HwpDocument,
    _options: &'a HtmlOptions,
    note_state: Option<&mut FootnoteEndnoteState<'_>>,
) -> CtrlHeaderResult<'a> {
    let mut result = CtrlHeaderResult::new();

    if paragraphs.is_empty() {
        return result;
    }

    if let Some(state) = note_state {
        *state.footnote_counter = state.footnote_counter.saturating_add(1);
        let n = *state.footnote_counter;

        // 인라인 참조: fixture의 hfN 스타일
        let ref_html = format!(
            r#"<span class="hfN" style="top:-1.76mm;"><span class="hrt cs1" style="font-size:5pt;top:-1pt;">{})</span></span>"#,
            n
        );
        result.footnote_ref_html = Some(ref_html);

        let first_para = &paragraphs[0];

        // 텍스트와 CharShape 추출 → hls 래핑 없이 <span class="hrt csN">텍스트</span>만 생성
        let (text, char_shapes) = extract_text_and_shapes(first_para);
        let body = render_text(&text, &char_shapes, document, "");

        // 문단 데이터에서 height/line_height/width 추출
        let line_segments = collect_line_segments(first_para);
        let (height_mm, line_height_mm, width_mm) = if let Some(seg) = line_segments.first() {
            (
                round_to_2dp(int32_to_mm(seg.text_height)),
                round_to_2dp(int32_to_mm(seg.line_height)),
                round_to_2dp(int32_to_mm(seg.segment_width)),
            )
        } else {
            (3.17, 2.48, 150.0)
        };

        // ParaShape 클래스
        let para_shape_id = first_para.para_header.para_shape_id;
        let para_shape_class = if (para_shape_id as usize) < document.doc_info.para_shapes.len() {
            format!("ps{}", para_shape_id)
        } else {
            String::new()
        };

        // CharShape 클래스 (첫 번째 CharShapeInfo에서 추출)
        let char_shape_class = if let Some(cs) = char_shapes.first() {
            format!("cs{}", cs.shape_id)
        } else {
            "cs0".to_string()
        };

        state.footnote_contents.push(FootnoteBlock {
            number: n,
            body_html: body,
            height_mm,
            line_height_mm,
            width_mm,
            para_shape_class,
            char_shape_class,
        });
    }
    result
}
