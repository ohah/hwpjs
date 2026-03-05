use crate::document::bodytext::line_seg::LineSegmentInfo;
use crate::document::bodytext::{ColumnDivideType, ParagraphRecord, Section};
use crate::document::docinfo::para_shape::ParaShape;
use crate::document::{HwpDocument, Paragraph};
use printpdf::*;

use super::font::PdfFonts;
use super::page::PdfPageConfig;
use super::pdf_image::{decode_bindata_image, render_image};
use super::styles::PdfParaStyle;
use super::table::{estimate_table_height, render_table};
use super::text::{render_text_segments, split_text_segments};
use super::PdfOptions;

/// 문단 렌더링 컨텍스트: ParaShape + LineSegmentInfo
pub struct PdfParaContext<'a> {
    pub para_shape: Option<&'a ParaShape>,
    pub line_segments: &'a [LineSegmentInfo],
}

/// HWPUNIT → mm 변환
fn hu_to_mm(v: i32) -> f64 {
    v as f64 / 7200.0 * 25.4
}

/// 섹션에서 PageDef 추출 (HTML find_page_def와 동일하게 CtrlHeader 내부도 탐색)
fn find_page_config(section: &Section) -> PdfPageConfig {
    for paragraph in &section.paragraphs {
        for record in &paragraph.records {
            if let ParagraphRecord::PageDef { page_def } = record {
                return PdfPageConfig::from_page_def(page_def);
            }
            // CtrlHeader의 children에서도 PageDef 탐색
            if let ParagraphRecord::CtrlHeader { children, .. } = record {
                for child in children {
                    if let ParagraphRecord::PageDef { page_def } = child {
                        return PdfPageConfig::from_page_def(page_def);
                    }
                }
            }
        }
    }
    PdfPageConfig::default_a4()
}

/// 페이지네이션 상태 (HTML pagination.rs와 동일한 전략)
struct PaginationState {
    /// 이전 문단의 첫 LineSegment vertical_position (mm)
    prev_vertical_mm: Option<f64>,
    /// 현재 페이지의 최대 vertical_position (mm)
    current_max_vertical_mm: f64,
    /// 콘텐츠 영역 높이 (mm)
    content_height_mm: f64,
}

impl PaginationState {
    fn new(content_height_mm: f64) -> Self {
        Self {
            prev_vertical_mm: None,
            current_max_vertical_mm: 0.0,
            content_height_mm,
        }
    }

    /// 문단의 첫 LineSegment vertical_position으로 페이지 넘김 판단
    /// HTML pagination.rs와 동일한 전략:
    ///   explicit > page_def_change > vertical_reset > vertical_overflow
    fn needs_page_break(&self, paragraph: &Paragraph, first_vpos_mm: Option<f64>) -> bool {
        // 1. 명시적 페이지 나누기
        if paragraph
            .para_header
            .column_divide_type
            .iter()
            .any(|t| matches!(t, ColumnDivideType::Page | ColumnDivideType::Section))
        {
            return true;
        }

        // 2. vertical_position 리셋 (상단 구간으로 돌아감)
        if let (Some(prev), Some(current)) = (self.prev_vertical_mm, first_vpos_mm) {
            let is_reset = current < 0.1 || (prev > 0.1 && current < prev - 0.1);
            let top_region_mm = self.content_height_mm * 0.2;
            if is_reset && (current < 0.1 || current < top_region_mm) {
                return true;
            }
        }

        // 3. vertical_position 오버플로우
        if let Some(current) = first_vpos_mm {
            if current > self.content_height_mm && self.current_max_vertical_mm > 0.0 {
                return true;
            }
        }

        false
    }

    /// 문단의 마지막 LineSegment 위치로 상태 갱신
    fn update(&mut self, line_segments: &[LineSegmentInfo]) {
        if let Some(first) = line_segments.first() {
            self.prev_vertical_mm = Some(hu_to_mm(first.vertical_position));
        }
        for seg in line_segments {
            let vpos = hu_to_mm(seg.vertical_position) + hu_to_mm(seg.line_height);
            if vpos > self.current_max_vertical_mm {
                self.current_max_vertical_mm = vpos;
            }
        }
    }

    /// 페이지 넘김 후 상태 리셋
    fn reset_page(&mut self) {
        self.prev_vertical_mm = None;
        self.current_max_vertical_mm = 0.0;
    }
}

/// printpdf 문서 생성 및 렌더링
pub fn render_document(document: &HwpDocument, options: &PdfOptions) -> Vec<u8> {
    let first_config = document
        .body_text
        .sections
        .first()
        .map(|s| find_page_config(s))
        .unwrap_or_else(PdfPageConfig::default_a4);

    let (doc, first_page, first_layer) = PdfDocument::new(
        "HWP Export",
        Mm(first_config.width_mm as f32),
        Mm(first_config.height_mm as f32),
        "Layer 1",
    );

    let fonts = PdfFonts::load(&doc, options.font_dir.as_deref());

    let mut current_page = first_page;
    let mut current_layer = doc.get_page(first_page).get_layer(first_layer);
    let mut page_config = first_config;
    let mut has_content = false;
    let mut pagination = PaginationState::new(page_config.content_height_mm);

    for (section_idx, section) in document.body_text.sections.iter().enumerate() {
        if section_idx > 0 {
            page_config = find_page_config(section);
            let (new_page, new_layer) = doc.add_page(
                Mm(page_config.width_mm as f32),
                Mm(page_config.height_mm as f32),
                "Layer 1",
            );
            current_page = new_page;
            current_layer = doc.get_page(new_page).get_layer(new_layer);
            pagination = PaginationState::new(page_config.content_height_mm);
        }

        for paragraph in &section.paragraphs {
            let para_shape = document
                .doc_info
                .para_shapes
                .get(paragraph.para_header.para_shape_id as usize);
            let line_segments = find_line_segments_in_records(&paragraph.records);
            let ctx = PdfParaContext {
                para_shape,
                line_segments: &line_segments,
            };

            // 페이지 넘김 판단 (HTML pagination.rs와 동일)
            let first_vpos_mm = line_segments
                .first()
                .map(|seg| hu_to_mm(seg.vertical_position));

            if has_content && pagination.needs_page_break(paragraph, first_vpos_mm) {
                let (new_page, new_layer) = doc.add_page(
                    Mm(page_config.width_mm as f32),
                    Mm(page_config.height_mm as f32),
                    "Layer 1",
                );
                current_page = new_page;
                current_layer = doc.get_page(new_page).get_layer(new_layer);
                pagination.reset_page();
            }

            render_paragraph(
                &paragraph.records,
                document,
                options,
                &doc,
                &fonts,
                &mut current_page,
                &mut current_layer,
                &page_config,
                &mut has_content,
                &ctx,
                &mut pagination,
            );

            // 부모 문단의 LineSegmentInfo로 pagination 상태 갱신
            // (render_paragraph 내부에서 CtrlHeader/Table이 오염시킨 값을 덮어쓰기)
            if !line_segments.is_empty() {
                pagination.update(&line_segments);
            }
        }
    }

    // 빈 문서면 최소 한 페이지
    if !has_content {
        let font_ref = fonts.select(false, false);
        let left_x = page_config.left_margin_mm;
        let top_y = page_config.height_mm - page_config.top_margin_mm;
        current_layer.use_text("", 10.0, Mm(left_x as f32), Mm(top_y as f32), font_ref);
    }

    doc.save_to_bytes().unwrap_or_default()
}

/// 문단 레코드 렌더링
/// LineSegmentInfo가 있으면 절대좌표 기반, 없으면 폴백
#[allow(clippy::too_many_arguments)]
fn render_paragraph(
    records: &[ParagraphRecord],
    document: &HwpDocument,
    options: &PdfOptions,
    pdf_doc: &PdfDocumentReference,
    fonts: &PdfFonts,
    current_page: &mut PdfPageIndex,
    current_layer: &mut PdfLayerReference,
    page_config: &PdfPageConfig,
    has_content: &mut bool,
    ctx: &PdfParaContext<'_>,
    pagination: &mut PaginationState,
) {
    let page_top_y = page_config.height_mm - page_config.top_margin_mm;
    let left_x = page_config.left_margin_mm;

    for record in records {
        match record {
            ParagraphRecord::ParaText { text, .. } => {
                if !text.is_empty() {
                    let char_shapes = find_char_shapes_in_records(records);

                    if !ctx.line_segments.is_empty() {
                        // ===== 정밀 모드: LineSegmentInfo 절대좌표 사용 =====
                        // HTML line_segment.rs와 동일한 좌표 변환
                        render_text_with_absolute_positions(
                            current_layer,
                            text,
                            &char_shapes,
                            ctx.line_segments,
                            document,
                            fonts,
                            page_top_y,
                            left_x,
                            ctx.para_shape,
                        );
                        pagination.update(ctx.line_segments);
                        *has_content = true;
                    } else {
                        // ===== 폴백: 추정 기반 렌더링 =====
                        let segments = split_text_segments(text, &char_shapes, document);
                        if !segments.is_empty() {
                            let para_style = ctx
                                .para_shape
                                .map(PdfParaStyle::from_para_shape)
                                .unwrap_or_default();
                            let font_height_mm = segments[0].style.font_size_pt * 0.3528;
                            let line_height =
                                super::styles::compute_line_height(&para_style, font_height_mm);
                            let effective_left = left_x + para_style.left_margin_mm;
                            let effective_width = page_config.content_width_mm
                                - para_style.left_margin_mm
                                - para_style.right_margin_mm;

                            // 폴백에서는 cursor_y 기반 ensure_space 필요
                            // pagination.current_max_vertical_mm로 근사
                            let cursor_y = page_top_y
                                - pagination.current_max_vertical_mm
                                - para_style.top_spacing_mm;

                            let used_height = render_text_segments(
                                current_layer,
                                &segments,
                                fonts,
                                effective_left,
                                cursor_y,
                                effective_width,
                                para_style.align,
                                para_style.indent_mm,
                                line_height,
                            );
                            let total_used = para_style.top_spacing_mm
                                + used_height.max(line_height)
                                + para_style.bottom_spacing_mm;
                            pagination.current_max_vertical_mm += total_used;
                            *has_content = true;
                        }
                    }
                }
            }
            ParagraphRecord::Table { table } => {
                // 부모 문단의 LineSegmentInfo가 있으면 그 위치 사용
                // 없으면 현재 pagination 위치 사용
                let table_vpos_mm = ctx
                    .line_segments
                    .first()
                    .map(|seg| hu_to_mm(seg.vertical_position))
                    .unwrap_or(pagination.current_max_vertical_mm);
                let cursor_y = page_top_y - table_vpos_mm;

                let table_height = render_table(
                    current_layer,
                    table,
                    document,
                    fonts,
                    options,
                    left_x,
                    cursor_y,
                    page_config.content_width_mm,
                );
                // pagination은 부모 문단 루프에서 line_segments로 갱신됨
                // LineSegmentInfo 없는 폴백 경우만 여기서 갱신
                if ctx.line_segments.is_empty() {
                    pagination.current_max_vertical_mm = table_vpos_mm + table_height + 2.0;
                }
                *has_content = true;
            }
            ParagraphRecord::ShapeComponentPicture {
                shape_component_picture,
            } => {
                let bindata_id = shape_component_picture.picture_info.bindata_id;
                if let Some((img, orig_w, orig_h)) =
                    decode_bindata_image(document, bindata_id, options.embed_images)
                {
                    let scp = shape_component_picture;
                    let hwp_w = (scp.border_rectangle_x.right - scp.border_rectangle_x.left).abs();
                    let mut hwp_h =
                        (scp.border_rectangle_y.bottom - scp.border_rectangle_y.top).abs();
                    if hwp_h == 0 {
                        hwp_h = (scp.crop_rectangle.bottom - scp.crop_rectangle.top).abs();
                    }

                    let (mut img_w, mut img_h) = if hwp_w > 0 && hwp_h > 0 {
                        (hu_to_mm(hwp_w), hu_to_mm(hwp_h))
                    } else {
                        let aspect = orig_h as f64 / orig_w.max(1) as f64;
                        (
                            page_config.content_width_mm,
                            page_config.content_width_mm * aspect,
                        )
                    };

                    let max_w = page_config.content_width_mm;
                    let max_h = page_config.content_height_mm * 0.8;
                    if img_w > max_w {
                        let scale = max_w / img_w;
                        img_w = max_w;
                        img_h *= scale;
                    }
                    if img_h > max_h {
                        let scale = max_h / img_h;
                        img_h = max_h;
                        img_w *= scale;
                    }

                    // 부모 문단의 LineSegmentInfo 위치 사용
                    let img_vpos_mm = ctx
                        .line_segments
                        .first()
                        .map(|seg| hu_to_mm(seg.vertical_position))
                        .unwrap_or(pagination.current_max_vertical_mm);
                    let cursor_y = page_top_y - img_vpos_mm;
                    render_image(current_layer, &img, left_x, cursor_y - img_h, img_w, img_h);
                    if ctx.line_segments.is_empty() {
                        pagination.current_max_vertical_mm = img_vpos_mm + img_h + 2.0;
                    }
                    *has_content = true;
                } else {
                    let font_ref = fonts.select(false, false);
                    let vpos = ctx
                        .line_segments
                        .first()
                        .map(|seg| hu_to_mm(seg.vertical_position))
                        .unwrap_or(pagination.current_max_vertical_mm);
                    let cursor_y = page_top_y - vpos;
                    current_layer.use_text(
                        "[Image]",
                        10.0,
                        Mm(left_x as f32),
                        Mm(cursor_y as f32),
                        font_ref,
                    );
                    if ctx.line_segments.is_empty() {
                        pagination.current_max_vertical_mm += 5.0;
                    }
                    *has_content = true;
                }
            }
            ParagraphRecord::ShapeComponent { children, .. } => {
                if children.is_empty() {
                    let font_ref = fonts.select(false, false);
                    let vpos = ctx
                        .line_segments
                        .first()
                        .map(|seg| hu_to_mm(seg.vertical_position))
                        .unwrap_or(pagination.current_max_vertical_mm);
                    let cursor_y = page_top_y - vpos;
                    current_layer.use_text(
                        "[Image]",
                        10.0,
                        Mm(left_x as f32),
                        Mm(cursor_y as f32),
                        font_ref,
                    );
                    if ctx.line_segments.is_empty() {
                        pagination.current_max_vertical_mm += 5.0;
                    }
                    *has_content = true;
                } else {
                    render_paragraph(
                        children,
                        document,
                        options,
                        pdf_doc,
                        fonts,
                        current_page,
                        current_layer,
                        page_config,
                        has_content,
                        ctx,
                        pagination,
                    );
                }
            }
            ParagraphRecord::CtrlHeader {
                children,
                paragraphs,
                ..
            } => {
                let has_table = children
                    .iter()
                    .any(|c| matches!(c, ParagraphRecord::Table { .. }));

                render_paragraph(
                    children,
                    document,
                    options,
                    pdf_doc,
                    fonts,
                    current_page,
                    current_layer,
                    page_config,
                    has_content,
                    ctx,
                    pagination,
                );

                if !has_table {
                    for para in paragraphs {
                        let sub_para_shape = document
                            .doc_info
                            .para_shapes
                            .get(para.para_header.para_shape_id as usize);
                        let sub_line_segs = find_line_segments_in_records(&para.records);
                        let sub_ctx = PdfParaContext {
                            para_shape: sub_para_shape,
                            line_segments: &sub_line_segs,
                        };
                        render_paragraph(
                            &para.records,
                            document,
                            options,
                            pdf_doc,
                            fonts,
                            current_page,
                            current_layer,
                            page_config,
                            has_content,
                            &sub_ctx,
                            pagination,
                        );
                    }
                }
            }
            ParagraphRecord::PageDef { .. } => {
                // PageDef는 이미 섹션 시작 시 처리됨
            }
            _ => {}
        }
    }
}

/// LineSegmentInfo 절대좌표 기반 텍스트 렌더링
/// HTML line_segment.rs의 render_line_segment()와 동일한 좌표 변환:
///   x = left_margin + to_mm(column_start_position)
///   y = page_top - to_mm(vertical_position) - vertical_centering_offset
#[allow(clippy::too_many_arguments)]
fn render_text_with_absolute_positions(
    layer: &PdfLayerReference,
    text: &str,
    char_shapes: &[crate::document::bodytext::CharShapeInfo],
    line_segments: &[LineSegmentInfo],
    document: &HwpDocument,
    fonts: &PdfFonts,
    page_top_y: f64,
    page_left_x: f64,
    para_shape: Option<&ParaShape>,
) {
    use super::styles::PdfTextStyle;

    let text_chars: Vec<char> = text.chars().collect();

    let mut sorted_shapes: Vec<_> = char_shapes.iter().collect();
    sorted_shapes.sort_by_key(|s| s.position);

    for (i, seg) in line_segments.iter().enumerate() {
        let start = seg.text_start_position as usize;
        let end = line_segments
            .get(i + 1)
            .map(|n| n.text_start_position as usize)
            .unwrap_or(text_chars.len());

        if start >= end || start >= text_chars.len() {
            continue;
        }
        let end = end.min(text_chars.len());

        // HTML line_segment.rs와 동일한 좌표 변환
        let x = page_left_x + hu_to_mm(seg.column_start_position);
        let line_height_mm = hu_to_mm(seg.line_height);
        let text_height_mm = hu_to_mm(seg.text_height);
        let vertical_pos_mm = hu_to_mm(seg.vertical_position);

        // 텍스트 세로 중앙 정렬 오프셋 (HTML과 동일)
        let offset_mm = (line_height_mm - text_height_mm) / 2.0;
        let top_mm = vertical_pos_mm + offset_mm;

        // PDF 좌표계: 아래에서 위로 증가
        // baseline = page_top_y - top_mm - text_height_mm (대략, 텍스트 하단 기준)
        // printpdf use_text는 baseline 기준이므로 text_height의 일부를 빼야 함
        let baseline_y = page_top_y - top_mm - text_height_mm * 0.85;

        // 들여쓰기 처리 (HTML과 동일)
        let indent_x = if seg.tag.has_indentation {
            if let Some(ps) = para_shape {
                hu_to_mm(ps.indent.abs()) / 2.0
            } else {
                0.0
            }
        } else {
            0.0
        };

        // CharShape 구간별로 분할하여 렌더링
        let mut cx = x + indent_x;
        let mut pos = start;
        while pos < end {
            let shape_id = sorted_shapes
                .iter()
                .rev()
                .find(|s| (s.position as usize) <= pos)
                .map(|s| s.shape_id as usize);

            let next_change = sorted_shapes
                .iter()
                .find(|s| (s.position as usize) > pos)
                .map(|s| (s.position as usize).min(end))
                .unwrap_or(end);

            let chunk_text: String = text_chars[pos..next_change]
                .iter()
                .filter(|c| **c != '\n')
                .collect();

            if !chunk_text.is_empty() {
                let style = shape_id
                    .and_then(|id| document.doc_info.char_shapes.get(id))
                    .map(|cs| PdfTextStyle::from_char_shape(cs, document))
                    .unwrap_or_default();

                let font_ref = fonts.select(style.bold, style.italic);
                let fs = style.font_size_pt as f32;

                layer.set_fill_color(Color::Rgb(Rgb::new(
                    style.color_r as f32 / 255.0,
                    style.color_g as f32 / 255.0,
                    style.color_b as f32 / 255.0,
                    None,
                )));
                layer.use_text(
                    &chunk_text,
                    fs,
                    Mm(cx as f32),
                    Mm(baseline_y as f32),
                    font_ref,
                );

                cx += estimate_text_width_mm(&chunk_text, style.font_size_pt);
            }
            pos = next_change;
        }
    }
}

/// CJK 문자 너비 추정 (text.rs에서 가져옴)
fn estimate_text_width_mm(text: &str, font_size_pt: f64) -> f64 {
    let pt_to_mm = 0.3528;
    let mut width = 0.0;
    for c in text.chars() {
        let cp = c as u32;
        let is_cjk = (0x3000..=0x9FFF).contains(&cp)
            || (0xAC00..=0xD7AF).contains(&cp)
            || (0xF900..=0xFAFF).contains(&cp)
            || (0xFF00..=0xFFEF).contains(&cp);
        if is_cjk {
            width += font_size_pt * pt_to_mm;
        } else {
            width += font_size_pt * 0.5 * pt_to_mm;
        }
    }
    width
}

/// 같은 records 내에서 ParaCharShape 찾기
fn find_char_shapes_in_records(
    records: &[ParagraphRecord],
) -> Vec<crate::document::bodytext::CharShapeInfo> {
    for record in records {
        if let ParagraphRecord::ParaCharShape { shapes } = record {
            return shapes.clone();
        }
    }
    Vec::new()
}

/// 같은 records 내에서 ParaLineSeg 찾기
fn find_line_segments_in_records(records: &[ParagraphRecord]) -> Vec<LineSegmentInfo> {
    for record in records {
        if let ParagraphRecord::ParaLineSeg { segments } = record {
            return segments.clone();
        }
    }
    Vec::new()
}

/// styled_summary용: 문서 순회하며 스타일 포함 요약 수집
pub fn collect_styled_summary(document: &HwpDocument, options: &PdfOptions) -> Vec<String> {
    let mut lines = Vec::new();

    for (section_idx, section) in document.body_text.sections.iter().enumerate() {
        let page_config = find_page_config(section);

        if section_idx > 0 {
            lines.push(format!(
                "page_break: new_page ({})",
                page_config.format_summary()
            ));
        }

        for paragraph in &section.paragraphs {
            let para_shape = document
                .doc_info
                .para_shapes
                .get(paragraph.para_header.para_shape_id as usize);
            let line_segments = find_line_segments_in_records(&paragraph.records);
            let ctx = PdfParaContext {
                para_shape,
                line_segments: &line_segments,
            };
            collect_styled_records(&paragraph.records, document, options, &mut lines, &ctx);
        }
    }

    if lines.is_empty() {
        lines.push("(empty)".to_string());
    }
    lines
}

/// 레코드 재귀 순회하며 스타일 포함 요약 수집
fn collect_styled_records(
    records: &[ParagraphRecord],
    document: &HwpDocument,
    options: &PdfOptions,
    lines: &mut Vec<String>,
    ctx: &PdfParaContext<'_>,
) {
    let char_shapes = find_char_shapes_in_records(records);

    for record in records {
        match record {
            ParagraphRecord::ParaText { text, .. } => {
                if !text.is_empty() {
                    let segments = super::text::split_text_segments(text, &char_shapes, document);
                    let para_style = ctx
                        .para_shape
                        .map(PdfParaStyle::from_para_shape)
                        .unwrap_or_default();
                    let style_summary = super::text::segments_style_summary(&segments);
                    let ps_summary = para_style.summary();
                    if !style_summary.is_empty() {
                        lines.push(format!(
                            "paragraph: {} [ps: {}] {}",
                            segments[0].style.summary(segments[0].shape_id.unwrap_or(0)),
                            ps_summary,
                            {
                                let full_text: String =
                                    segments.iter().map(|s| s.text.as_str()).collect();
                                let display: String = full_text
                                    .chars()
                                    .take(80)
                                    .map(|c| if c == '\n' { ' ' } else { c })
                                    .collect();
                                let suffix = if full_text.chars().count() > 80 {
                                    "..."
                                } else {
                                    ""
                                };
                                format!("{}{}", display, suffix)
                            },
                        ));
                    }
                }
            }
            ParagraphRecord::Table { table } => {
                lines.push(format!("table: {}", super::table::table_summary(table)));
            }
            ParagraphRecord::ShapeComponentPicture {
                shape_component_picture,
            } => {
                let id = shape_component_picture.picture_info.bindata_id;
                if options.embed_images {
                    lines.push(format!("image: bindata_id={}", id));
                } else {
                    lines.push("image: [placeholder]".to_string());
                }
            }
            ParagraphRecord::ShapeComponent { children, .. } => {
                if children.is_empty() {
                    lines.push("image: [placeholder]".to_string());
                } else {
                    collect_styled_records(children, document, options, lines, ctx);
                }
            }
            ParagraphRecord::CtrlHeader {
                children,
                paragraphs,
                ..
            } => {
                let has_table = children
                    .iter()
                    .any(|c| matches!(c, ParagraphRecord::Table { .. }));
                collect_styled_records(children, document, options, lines, ctx);
                if !has_table {
                    for para in paragraphs {
                        let sub_para_shape = document
                            .doc_info
                            .para_shapes
                            .get(para.para_header.para_shape_id as usize);
                        let sub_line_segs = find_line_segments_in_records(&para.records);
                        let sub_ctx = PdfParaContext {
                            para_shape: sub_para_shape,
                            line_segments: &sub_line_segs,
                        };
                        collect_styled_records(&para.records, document, options, lines, &sub_ctx);
                    }
                }
            }
            _ => {}
        }
    }
}
