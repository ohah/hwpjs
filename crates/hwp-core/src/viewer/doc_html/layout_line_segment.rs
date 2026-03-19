/// Document 기반 라인 세그먼트 레이아웃 (old viewer line_segment.rs 포팅)
/// 각 줄을 mm 절대 좌표의 hls div로 배치
use super::flat_text::FlatCharShapeInfo;
use super::layout_text::{render_layout_text, render_layout_text_with_hyperlinks};
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
    render_line_segments_with_marker(
        text,
        char_shapes,
        line_segments,
        resources,
        para_shape_class,
        content_left_mm,
        None,
    )
}

/// 마커(hhe div) 포함 라인 세그먼트 렌더링
pub fn render_line_segments_with_marker(
    text: &str,
    char_shapes: &[FlatCharShapeInfo],
    line_segments: &[LineSegmentInfo],
    resources: &Resources,
    para_shape_class: &str,
    content_left_mm: f64,
    marker_html: Option<&str>,
) -> Vec<String> {
    render_line_segments_full(
        text,
        char_shapes,
        line_segments,
        resources,
        para_shape_class,
        content_left_mm,
        marker_html,
        false,
    )
}

/// 전체 파라미터 라인 세그먼트 렌더링
pub fn render_line_segments_full(
    text: &str,
    char_shapes: &[FlatCharShapeInfo],
    line_segments: &[LineSegmentInfo],
    resources: &Resources,
    para_shape_class: &str,
    content_left_mm: f64,
    marker_html: Option<&str>,
    has_objects: bool,
) -> Vec<String> {
    render_line_segments_impl(
        text,
        char_shapes,
        line_segments,
        resources,
        para_shape_class,
        content_left_mm,
        marker_html,
        has_objects,
        &[],
        &[],
    )
}

/// hyperlink + wchar_map 포함 라인 세그먼트 렌더링
pub fn render_line_segments_impl(
    text: &str,
    char_shapes: &[FlatCharShapeInfo],
    line_segments: &[LineSegmentInfo],
    resources: &Resources,
    para_shape_class: &str,
    content_left_mm: f64,
    marker_html: Option<&str>,
    _has_objects: bool,
    hyperlinks: &[super::flat_text::HyperlinkRange],
    wchar_map: &[(u32, u32)],
) -> Vec<String> {
    if line_segments.is_empty() {
        return Vec::new();
    }

    let text_chars: Vec<char> = text.chars().collect();
    let text_len = text_chars.len();
    let mut html_lines: Vec<String> = Vec::new();

    // old viewer body_default_hls 감지:
    // 텍스트가 비어있고, 모든 세그먼트의 line_height가 작은 경우만 적용
    // (큰 line_height는 Chart/Table 등 인라인 오브젝트를 의미)
    let has_large_segment = line_segments
        .iter()
        .any(|s| hwpunit_to_mm(s.line_height) > 10.0);
    let is_empty_paragraph = text.trim().is_empty() && !has_large_segment;

    for (seg_idx, seg) in line_segments.iter().enumerate() {
        let flags = seg.decode_flags();

        // 빈 세그먼트 스킵
        if flags.is_empty_segment {
            continue;
        }

        // 이 세그먼트의 텍스트 범위 계산
        // text_start_pos는 원본 WCHAR 인덱스 → wchar_map으로 추출 텍스트 위치로 변환
        let seg_start = if !wchar_map.is_empty() {
            super::flat_text::map_original_to_extracted(wchar_map, seg.text_start_pos) as usize
        } else {
            seg.text_start_pos as usize
        }
        .min(text_len);
        let seg_end = if seg_idx + 1 < line_segments.len() {
            let next_pos = line_segments[seg_idx + 1].text_start_pos;
            let mapped = if !wchar_map.is_empty() {
                super::flat_text::map_original_to_extracted(wchar_map, next_pos) as usize
            } else {
                next_pos as usize
            };
            mapped.min(text_len)
        } else {
            text_len
        };

        let seg_end = seg_end.max(seg_start); // 방어: seg_start > seg_end 방지
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
        // 빈 문단에서는 건너뜀
        let text_html = if is_empty_paragraph {
            String::new()
        } else if !hyperlinks.is_empty() {
            // hyperlink 범위를 seg_start 기준으로 조정
            let seg_hyperlinks: Vec<super::flat_text::HyperlinkRange> = hyperlinks
                .iter()
                .filter(|h| (h.start as usize) < seg_end && (h.end as usize) > seg_start)
                .map(|h| super::flat_text::HyperlinkRange {
                    start: if (h.start as usize) > seg_start {
                        h.start - seg_start as u32
                    } else {
                        0
                    },
                    end: ((h.end as usize).min(seg_end) - seg_start) as u32,
                    onclick: h.onclick.clone(),
                    char_shape_id: h.char_shape_id,
                })
                .collect();
            render_layout_text_with_hyperlinks(
                seg_text,
                &seg_char_shapes,
                resources,
                &seg_hyperlinks,
            )
        } else {
            render_layout_text(seg_text, &seg_char_shapes, resources)
        };

        // 좌표 계산 (HwpUnit → mm)
        let vertical_pos_mm = hwpunit_to_mm(seg.vertical_pos);
        let line_height_raw = hwpunit_to_mm(seg.line_height);
        let text_height_raw = hwpunit_to_mm(seg.text_height);
        let has_content = !seg_text.is_empty();

        // old viewer 동일: body_default_hls 적용
        // 빈 문단(모든 세그먼트가 빈 텍스트): line-height=2.79, height=3.53, top_offset=-0.18
        let (line_height_mm, height_mm, top_mm) = if is_empty_paragraph {
            (2.79, 3.53, round_mm(vertical_pos_mm + (-0.18)))
        } else if has_content {
            // text segment: CSS line-height = line_height, CSS height = text_height
            // top = vertical_pos + (line_height - text_height) / 2
            let lh = round_mm(line_height_raw);
            let th = round_mm(text_height_raw);
            let offset = (lh - th) / 2.0;
            (lh, th, round_mm(vertical_pos_mm + offset))
        } else {
            // non-text segment: both use line_height
            let lh = round_mm(line_height_raw);
            (lh, lh, round_mm(vertical_pos_mm))
        };

        let width_mm = round_mm(hwpunit_to_mm(seg.segment_width));
        // column_start_pos > 0이면 다단 내 좌표, 아니면 content_left
        let left_mm = if seg.column_start_pos > 0 {
            round_mm(hwpunit_to_mm(seg.column_start_pos))
        } else {
            round_mm(content_left_mm)
        };

        // padding-left 처리 (들여쓰기/내어쓰기)
        let padding_left = if flags.has_indentation {
            if let Some(ps) = resources.para_shapes.get(
                para_shape_class
                    .strip_prefix("ps")
                    .and_then(|s| s.parse::<usize>().ok())
                    .unwrap_or(0),
            ) {
                let indent_hu = ps.margin.indent.value;
                if indent_hu != 0 {
                    let indent_mm = round_mm(hwpunit_to_mm(indent_hu.abs()) / 2.0);
                    format!("padding-left:{:.2}mm;", indent_mm)
                } else {
                    String::new()
                }
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        // hls div 생성 (첫 줄에 marker 삽입)
        let marker = if html_lines.is_empty() {
            marker_html.unwrap_or("")
        } else {
            ""
        };
        // hls는 항상 {:.2}mm 포맷 사용 (old viewer 일치)
        let hls = format!(
            r#"<div class="hls {}" style="line-height:{:.2}mm;white-space:nowrap;left:{:.2}mm;top:{:.2}mm;height:{:.2}mm;width:{:.2}mm;{}">{}{}</div>"#,
            para_shape_class,
            line_height_mm,
            left_mm,
            top_mm,
            height_mm,
            width_mm,
            padding_left,
            marker,
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
        let result =
            render_line_segments("Hello", &shapes, &segs, &Resources::default(), "ps0", 30.0);
        assert_eq!(result.len(), 1);
        assert!(result[0].contains("hls ps0"));
        assert!(result[0].contains("Hello"));
        assert!(result[0].contains("left:30.00mm"));
    }
}
