/// Document 기반 라인 세그먼트 레이아웃 (old viewer line_segment.rs 포팅)
/// 각 줄을 mm 절대 좌표의 hls div로 배치
use super::flat_text::FlatCharShapeInfo;
use super::layout_text::render_layout_text;
use super::styles::{hwpunit_to_mm, round_mm};
use hwp_model::hints::LineSegmentInfo;
use hwp_model::resources::Resources;

/// 문단의 라인 세그먼트를 절대 좌표 hls div로 렌더링
///
/// # Arguments
/// * `text` - flat text (Run[]에서 추출)
/// * `char_shapes` - CharShape 변경점
/// * `line_segments` - LineSegmentInfo[] (레이아웃 캐시)
/// * `resources` - 문서 리소스 (CharShape, ParaShape 등)
/// * `para_shape_class` - ps{N} 클래스 이름
/// * `content_left_mm` - 콘텐츠 영역 좌측 오프셋 (mm)
///
/// # Returns
/// hls div HTML 목록
pub fn render_line_segments(
    text: &str,
    char_shapes: &[FlatCharShapeInfo],
    line_segments: &[LineSegmentInfo],
    resources: &Resources,
    para_shape_class: &str,
    content_left_mm: f64,
) -> Vec<String> {
    if line_segments.is_empty() || text.is_empty() {
        return Vec::new();
    }

    let text_chars: Vec<char> = text.chars().collect();
    let text_len = text_chars.len();
    let mut html_lines: Vec<String> = Vec::new();

    for (seg_idx, seg) in line_segments.iter().enumerate() {
        let flags = seg.decode_flags();

        // 빈 세그먼트 스킵
        if flags.is_empty_segment {
            continue;
        }

        // 이 세그먼트의 텍스트 범위 계산
        let seg_start = seg.text_start_pos as usize;
        let seg_end = if seg_idx + 1 < line_segments.len() {
            (line_segments[seg_idx + 1].text_start_pos as usize).min(text_len)
        } else {
            text_len
        };

        if seg_start > text_len {
            continue;
        }
        let seg_end = seg_end.min(text_len);

        let seg_text: String = text_chars[seg_start..seg_end].iter().collect();
        // trailing newline 제거
        let seg_text = seg_text.trim_end_matches('\n');

        // 이 구간의 CharShape 정보 필터링 (seg_start 기준으로 offset 조정)
        let seg_char_shapes: Vec<FlatCharShapeInfo> = char_shapes
            .iter()
            .filter(|cs| {
                let pos = cs.position as usize;
                pos < seg_end
            })
            .map(|cs| {
                let pos = if (cs.position as usize) < seg_start {
                    0
                } else {
                    cs.position - seg_start as u32
                };
                FlatCharShapeInfo {
                    position: pos,
                    shape_id: cs.shape_id,
                }
            })
            .collect();

        // 텍스트 HTML 렌더링
        let text_html = render_layout_text(seg_text, &seg_char_shapes, resources);

        // 좌표 계산 (HwpUnit → mm)
        let top_mm = round_mm(hwpunit_to_mm(seg.vertical_pos));
        let height_mm = round_mm(hwpunit_to_mm(seg.line_height));
        let line_height_mm = round_mm(hwpunit_to_mm(seg.text_height));
        let width_mm = round_mm(hwpunit_to_mm(seg.segment_width));
        let left_mm = round_mm(content_left_mm);

        // hls div 생성
        let hls = format!(
            r#"<div class="hls {}" style="line-height:{:.2}mm;white-space:nowrap;left:{:.2}mm;top:{:.2}mm;height:{:.2}mm;width:{:.2}mm;">{}</div>"#,
            para_shape_class,
            line_height_mm,
            left_mm,
            top_mm,
            height_mm,
            width_mm,
            text_html
        );

        html_lines.push(hls);
    }

    html_lines
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_line_segments_empty() {
        let result = render_line_segments("", &[], &[], &Resources::default(), "ps0", 0.0);
        assert!(result.is_empty());
    }

    #[test]
    fn test_render_line_segments_single_line() {
        let segs = vec![LineSegmentInfo {
            text_start_pos: 0,
            vertical_pos: 0,
            line_height: 720, // 720/7200 * 25.4 = 2.54mm
            text_height: 500,
            baseline_distance: 0,
            line_spacing: 0,
            column_start_pos: 0,
            segment_width: 36000, // 36000/7200 * 25.4 = 127mm
            flags: 0,
        }];
        let shapes = vec![FlatCharShapeInfo {
            position: 0,
            shape_id: 0,
        }];
        let result = render_line_segments(
            "Hello",
            &shapes,
            &segs,
            &Resources::default(),
            "ps0",
            30.0,
        );
        assert_eq!(result.len(), 1);
        assert!(result[0].contains("hls ps0"));
        assert!(result[0].contains("Hello"));
        assert!(result[0].contains("left:30.00mm"));
    }
}
