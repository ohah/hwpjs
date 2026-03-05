use crate::document::bodytext::CharShapeInfo;
use crate::document::docinfo::para_shape::ParagraphAlignment;
use crate::document::HwpDocument;
use printpdf::*;

use super::font::PdfFonts;
use super::styles::PdfTextStyle;

/// 텍스트 세그먼트 (CharShape 구간별)
pub struct TextSegment {
    pub text: String,
    pub style: PdfTextStyle,
    pub shape_id: Option<usize>,
}

/// 문단 텍스트를 CharShape 기반으로 세그먼트 분할
pub fn split_text_segments(
    text: &str,
    char_shapes: &[CharShapeInfo],
    document: &HwpDocument,
) -> Vec<TextSegment> {
    if text.is_empty() {
        return Vec::new();
    }

    let text_chars: Vec<char> = text.chars().collect();
    let text_len = text_chars.len();

    let mut sorted_shapes: Vec<_> = char_shapes.iter().collect();
    sorted_shapes.sort_by_key(|s| s.position);

    let mut positions = vec![0];
    for shape in &sorted_shapes {
        let pos = shape.position as usize;
        if pos <= text_len {
            positions.push(pos);
        }
    }
    positions.push(text_len);
    positions.sort();
    positions.dedup();

    let mut segments = Vec::new();

    for i in 0..positions.len() - 1 {
        let start = positions[i];
        let end = positions[i + 1];
        if start >= end {
            continue;
        }

        let segment_text: String = text_chars[start..end].iter().collect();
        if segment_text.is_empty() {
            continue;
        }

        let shape_id = sorted_shapes
            .iter()
            .rev()
            .find(|s| (s.position as usize) <= start)
            .map(|s| s.shape_id as usize);

        let style = shape_id
            .and_then(|id| document.doc_info.char_shapes.get(id))
            .map(|cs| PdfTextStyle::from_char_shape(cs, document))
            .unwrap_or_default();

        segments.push(TextSegment {
            text: segment_text,
            style,
            shape_id,
        });
    }

    segments
}

/// 문자가 CJK(한중일) 문자인지 판별
fn is_cjk(c: char) -> bool {
    let cp = c as u32;
    (0x3000..=0x9FFF).contains(&cp)
        || (0xAC00..=0xD7AF).contains(&cp)
        || (0xF900..=0xFAFF).contains(&cp)
        || (0xFF00..=0xFFEF).contains(&cp)
}

/// 텍스트 너비를 mm 단위로 추정 (CJK 문자는 전각, ASCII는 반각)
fn estimate_text_width_mm(text: &str, font_size_pt: f64) -> f64 {
    let pt_to_mm = 0.3528;
    let mut width = 0.0;
    for c in text.chars() {
        if is_cjk(c) {
            width += font_size_pt * pt_to_mm;
        } else {
            width += font_size_pt * 0.5 * pt_to_mm;
        }
    }
    width
}

/// content_width에 맞는 예상 CJK 문자 수 계산
fn estimate_chars_per_line(content_width_mm: f64, font_size_pt: f64) -> usize {
    let char_width = font_size_pt * 0.3528;
    if char_width <= 0.0 {
        return 40;
    }
    (content_width_mm / char_width).floor().max(1.0) as usize
}

/// 텍스트 세그먼트들을 PDF 레이어에 렌더링 (줄바꿈 지원)
/// 반환값: 사용한 총 높이(mm)
pub fn render_text_segments(
    layer: &PdfLayerReference,
    segments: &[TextSegment],
    fonts: &PdfFonts,
    x_mm: f64,
    y_mm: f64,
    content_width_mm: f64,
    align: ParagraphAlignment,
    first_line_indent_mm: f64,
    line_height: f64,
) -> f64 {
    if segments.is_empty() {
        return 0.0;
    }

    let mut cursor_y = y_mm;

    // 세그먼트들을 줄(line) 단위로 분할
    // 각 줄은 (text, style) 조각 목록
    struct Chunk {
        text: String,
        bold: bool,
        italic: bool,
        color_r: u8,
        color_g: u8,
        color_b: u8,
        font_size_pt: f64,
    }

    let mut lines: Vec<Vec<Chunk>> = vec![Vec::new()];

    for segment in segments {
        let parts: Vec<&str> = segment.text.split('\n').collect();
        for (part_idx, part) in parts.iter().enumerate() {
            if part_idx > 0 {
                lines.push(Vec::new());
            }
            if !part.is_empty() {
                lines.last_mut().unwrap().push(Chunk {
                    text: part.to_string(),
                    bold: segment.style.bold,
                    italic: segment.style.italic,
                    color_r: segment.style.color_r,
                    color_g: segment.style.color_g,
                    color_b: segment.style.color_b,
                    font_size_pt: segment.style.font_size_pt,
                });
            }
        }
    }

    let mut is_first_line = true;

    for line_chunks in &lines {
        if line_chunks.is_empty() {
            cursor_y -= line_height;
            is_first_line = false;
            continue;
        }

        // 첫 줄 들여쓰기
        let indent = if is_first_line {
            first_line_indent_mm
        } else {
            0.0
        };
        is_first_line = false;

        // 전체 줄 텍스트와 너비 추정
        let full_text: String = line_chunks.iter().map(|c| c.text.as_str()).collect();
        let font_size = line_chunks[0].font_size_pt;
        let estimated_width = estimate_text_width_mm(&full_text, font_size);

        // 정렬에 따른 X 시작점 계산
        let align_offset = match align {
            ParagraphAlignment::Center => {
                (content_width_mm - indent - estimated_width).max(0.0) / 2.0
            }
            ParagraphAlignment::Right => (content_width_mm - indent - estimated_width).max(0.0),
            _ => 0.0, // Left, Justify, Distribute, Divide → 좌측 정렬
        };
        let line_x = x_mm + indent + align_offset;

        if estimated_width <= content_width_mm - indent {
            // 한 줄에 맞음: 각 스타일 청크를 x 위치 이동하며 렌더링
            let mut cx = line_x;
            for chunk in line_chunks {
                let font_ref = fonts.select(chunk.bold, chunk.italic);
                let fs = chunk.font_size_pt as f32;

                layer.set_fill_color(Color::Rgb(Rgb::new(
                    chunk.color_r as f32 / 255.0,
                    chunk.color_g as f32 / 255.0,
                    chunk.color_b as f32 / 255.0,
                    None,
                )));
                layer.use_text(
                    &chunk.text,
                    fs,
                    Mm(cx as f32),
                    Mm(cursor_y as f32),
                    font_ref,
                );
                cx += estimate_text_width_mm(&chunk.text, chunk.font_size_pt);
            }
            cursor_y -= line_height;
        } else {
            // 줄바꿈 필요: 문자 수 기반으로 자르기
            let full_chars: Vec<char> = full_text.chars().collect();
            let mut pos = 0;

            // 줄바꿈 시 첫 번째 스타일 사용 (단순화)
            let first = &line_chunks[0];
            let font_ref = fonts.select(first.bold, first.italic);
            let fs = first.font_size_pt as f32;

            layer.set_fill_color(Color::Rgb(Rgb::new(
                first.color_r as f32 / 255.0,
                first.color_g as f32 / 255.0,
                first.color_b as f32 / 255.0,
                None,
            )));

            let mut sub_first = true;
            while pos < full_chars.len() {
                let cur_indent = if sub_first { indent } else { 0.0 };
                sub_first = false;
                let cur_width = content_width_mm - cur_indent;
                let cur_cpl = estimate_chars_per_line(cur_width, font_size);
                let end = (pos + cur_cpl).min(full_chars.len());
                let line_text: String = full_chars[pos..end].iter().collect();

                layer.use_text(
                    &line_text,
                    fs,
                    Mm((x_mm + cur_indent) as f32),
                    Mm(cursor_y as f32),
                    font_ref,
                );

                cursor_y -= line_height;
                pos = end;
            }
        }
    }

    y_mm - cursor_y
}

/// 텍스트 세그먼트의 스타일 요약 (스냅샷용)
pub fn segments_style_summary(segments: &[TextSegment]) -> String {
    if segments.is_empty() {
        return String::new();
    }
    let first = &segments[0];
    let style_str = first.style.summary(first.shape_id.unwrap_or(0));
    let full_text: String = segments.iter().map(|s| s.text.as_str()).collect();

    const TRUNCATE: usize = 80;
    let display_text: String = full_text
        .chars()
        .take(TRUNCATE)
        .map(|c| if c == '\n' { ' ' } else { c })
        .collect();
    let suffix = if full_text.chars().count() > TRUNCATE {
        "..."
    } else {
        ""
    };

    format!("{} {}{}", style_str, display_text, suffix)
}
