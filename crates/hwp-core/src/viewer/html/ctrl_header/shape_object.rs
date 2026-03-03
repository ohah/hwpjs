use super::CtrlHeaderResult;
use crate::document::bodytext::ctrl_header::VertRelTo;
use crate::document::bodytext::control_char::ControlChar;
use crate::document::bodytext::{ParaTextRun, ParagraphRecord};
use crate::document::{CtrlHeader, CtrlHeaderData, Paragraph};
use crate::viewer::html::common;
use crate::viewer::html::line_segment::ImageInfo;
use crate::viewer::html::paragraph::render_paragraphs_fragment;
use crate::viewer::html::styles::{int32_to_mm, round_to_2dp};
use crate::viewer::HtmlOptions;
use crate::HwpDocument;

/// 그리기 개체 처리 / Process shape object
pub fn process_shape_object<'a>(
    header: &'a CtrlHeader,
    children: &'a [ParagraphRecord],
    paragraphs: &'a [Paragraph],
    document: &'a HwpDocument,
    options: &'a HtmlOptions,
) -> CtrlHeaderResult<'a> {
    let mut result = CtrlHeaderResult::new();

    // object_common 속성 추출 / Extract object_common attributes
    let (like_letters, vert_rel_to, initial_width, initial_height) = match &header.data {
        CtrlHeaderData::ObjectCommon {
            attribute,
            width,
            height,
            ..
        } => (
            attribute.like_letters,
            Some(attribute.vert_rel_to),
            Some(u32::from(*width)),
            Some(u32::from(*height)),
        ),
        _ => (false, None, None, None),
    };

    // ObjectCommon에 크기가 없으면 ShapeComponent에서 찾기
    let (initial_width, initial_height) = if initial_width.is_some() && initial_height.is_some() {
        (initial_width, initial_height)
    } else {
        let mut w = None;
        let mut h = None;
        for record in children {
            if let ParagraphRecord::ShapeComponent {
                shape_component, ..
            } = record
            {
                w = Some(shape_component.width);
                h = Some(shape_component.height);
                break;
            }
        }
        if w.is_none() {
            for para in paragraphs {
                for record in &para.records {
                    match record {
                        ParagraphRecord::ShapeComponent {
                            shape_component, ..
                        } => {
                            w = Some(shape_component.width);
                            h = Some(shape_component.height);
                            break;
                        }
                        ParagraphRecord::CtrlHeader {
                            children: nested_children,
                            ..
                        } => {
                            for nested_record in nested_children {
                                if let ParagraphRecord::ShapeComponent {
                                    shape_component, ..
                                } = nested_record
                                {
                                    w = Some(shape_component.width);
                                    h = Some(shape_component.height);
                                    break;
                                }
                            }
                            if w.is_some() {
                                break;
                            }
                        }
                        _ => {}
                    }
                }
                if w.is_some() {
                    break;
                }
            }
        }
        (w, h)
    };

    // 텍스트 도형(ShapeComponentRectangle) 감지
    let has_rectangle_shape = children.iter().any(|r| {
        if let ParagraphRecord::ShapeComponent { children, .. } = r {
            children
                .iter()
                .any(|c| matches!(c, ParagraphRecord::ShapeComponentRectangle { .. }))
        } else {
            false
        }
    });

    if has_rectangle_shape {
        if let Some(html) = render_rectangle_shape(header, children, document, options) {
            result.shape_html = Some(html);
            return result;
        }
    }

    // 이미지 수집 (기존 로직)
    if !children.is_empty() {
        collect_images_from_records(
            children,
            document,
            options,
            like_letters,
            vert_rel_to,
            initial_width,
            initial_height,
            &mut result.images,
        );
    } else if initial_width.is_some() && initial_height.is_some() {
        for para in paragraphs {
            collect_images_from_records(
                &para.records,
                document,
                options,
                like_letters,
                vert_rel_to,
                initial_width,
                initial_height,
                &mut result.images,
            );
        }
    }

    result
}

/// ShapeComponentRectangle을 hsG HTML로 렌더링
fn render_rectangle_shape(
    header: &CtrlHeader,
    children: &[ParagraphRecord],
    document: &HwpDocument,
    options: &HtmlOptions,
) -> Option<String> {
    let (offset_x, offset_y, _obj_width, _obj_height, caption) = match &header.data {
        CtrlHeaderData::ObjectCommon {
            offset_x,
            offset_y,
            width,
            height,
            caption,
            ..
        } => (
            offset_x.0,
            offset_y.0,
            u32::from(*width),
            u32::from(*height),
            caption.as_ref(),
        ),
        _ => return None,
    };

    let top_mm = round_to_2dp(int32_to_mm(offset_y));
    let left_mm = round_to_2dp(int32_to_mm(offset_x));
    let stroke_width = 0.12;
    let half_stroke = 0.06;

    let mut shape_width_hu: u32 = 0;
    let mut shape_height_hu: u32 = 0;
    let mut shape_content_paragraphs: Option<&[Paragraph]> = None;

    for record in children {
        if let ParagraphRecord::ShapeComponent {
            shape_component,
            children: sc_children,
        } = record
        {
            shape_width_hu = shape_component.width;
            shape_height_hu = shape_component.height;
            for child in sc_children {
                if let ParagraphRecord::ListHeader { paragraphs, .. } = child {
                    shape_content_paragraphs = Some(paragraphs);
                    break;
                }
            }
            break;
        }
    }

    if shape_width_hu == 0 || shape_height_hu == 0 {
        return None;
    }

    let shape_w_mm = round_to_2dp(int32_to_mm(shape_width_hu as i32));
    let shape_h_mm = round_to_2dp(int32_to_mm(shape_height_hu as i32));
    let hsr_w_mm = round_to_2dp(shape_w_mm + stroke_width);
    let hsr_h_mm = round_to_2dp(shape_h_mm + stroke_width);

    let svg_vb_w = round_to_2dp(shape_w_mm + stroke_width + 2.0 * 0.15);
    let svg_vb_h = round_to_2dp(shape_h_mm + stroke_width + 2.0 * 0.15);
    let svg_style_w = round_to_2dp(shape_w_mm + 2.0 * 0.15 + half_stroke);
    let svg_style_h = round_to_2dp(shape_h_mm + 2.0 * 0.15 + half_stroke);
    let path_end_x = round_to_2dp(shape_w_mm + half_stroke);
    let path_end_y = round_to_2dp(shape_h_mm + half_stroke);

    let svg_html = format!(
        r#"<svg class="hs" viewBox="-0.30 -0.30 {vbw} {vbh}" style="left:-0.15mm;top:-0.15mm;width:{sw}mm;height:{sh}mm;"><path fill="none" d="M{hs},{hs}L{ex},{hs}L{ex},{ey}L{hs},{ey}L{hs},{hs}Z " style="stroke:#000000;stroke-linecap:butt;stroke-width:{st};"></path></svg>"#,
        vbw = svg_vb_w,
        vbh = svg_vb_h,
        sw = svg_style_w,
        sh = svg_style_h,
        hs = half_stroke,
        ex = path_end_x,
        ey = path_end_y,
        st = stroke_width,
    );

    let content_html = if let Some(paras) = shape_content_paragraphs {
        render_shape_content(paras, document, options)
    } else {
        String::new()
    };

    let prefix = &options.css_class_prefix;

    let hst_html = format!(
        r#"<div class="{p}hsT" style="left:-{hs}mm;top:-{hs}mm;width:{w}mm;height:{h}mm;">{svg}{content}</div>"#,
        p = prefix,
        hs = half_stroke,
        w = hsr_w_mm,
        h = hsr_h_mm,
        svg = svg_html,
        content = content_html,
    );

    let hsr_html = format!(
        r#"<div class="{p}hsR" style="top:0mm;left:0mm;width:{w}mm;height:{h}mm;">{hst}</div>"#,
        p = prefix,
        w = hsr_w_mm,
        h = hsr_h_mm,
        hst = hst_html,
    );

    // 캡션 처리: ObjectCommon.caption이 있으면 gap 사용, 없으면 children의 첫 ListHeader를 캡션으로 감지
    let mut caption_html = String::new();
    let mut caption_height_hu: i32 = 0;
    let mut caption_gap_hu: i32 = if let Some(cap) = caption {
        i32::from(cap.gap)
    } else {
        850 // 기본 캡션 간격 / Default caption gap
    };

    // children에서 첫 번째 ListHeader를 캡션으로 사용 (ShapeComponent 내부의 ListHeader와 구분)
    for record in children {
        if let ParagraphRecord::ListHeader { paragraphs, .. } = record {
            if !paragraphs.is_empty() {
                for para in paragraphs {
                    for rec in &para.records {
                        if let ParagraphRecord::ParaLineSeg { segments } = rec {
                            if let Some(seg) = segments.last() {
                                caption_height_hu =
                                    seg.vertical_position + seg.line_height;
                            }
                        }
                    }
                }
                if caption_height_hu == 0 {
                    caption_height_hu = 1000;
                }

                let caption_top_mm = round_to_2dp(int32_to_mm(
                    shape_height_hu as i32 + caption_gap_hu,
                ));
                let caption_w_mm = round_to_2dp(shape_w_mm - 0.12);

                // 캡션 paragraph에서 AUTO_NUMBER 처리 / Handle AUTO_NUMBER in caption paragraph
                // table caption과 동일하게 haN div 생성 / Generate haN div same as table caption
                let caption_para = &paragraphs[0];

                // CharShape 클래스 / CharShape class
                let caption_char_shape_id = caption_para.records.iter().find_map(|rec| {
                    if let ParagraphRecord::ParaCharShape { shapes } = rec {
                        shapes.first().map(|s| s.shape_id as usize)
                    } else {
                        None
                    }
                });
                let cs_class = caption_char_shape_id
                    .map(|id| format!("cs{}", id))
                    .unwrap_or_default();

                // ParaShape 클래스 / ParaShape class
                let ps_class = format!("ps{}", caption_para.para_header.para_shape_id);

                // 텍스트와 AUTO_NUMBER 위치 찾기 / Find text and AUTO_NUMBER position
                let mut caption_text = String::new();
                let mut auto_number_pos: Option<usize> = None;
                let mut auto_number_display: Option<String> = None;
                for rec in &caption_para.records {
                    if let ParagraphRecord::ParaText { text, runs, control_char_positions, .. } = rec {
                        caption_text = text.clone();
                        auto_number_pos = control_char_positions.iter()
                            .find(|cp| cp.code == ControlChar::AUTO_NUMBER)
                            .map(|cp| cp.position);
                        auto_number_display = runs.iter().find_map(|run| {
                            if let ParaTextRun::Control { code, display_text, .. } = run {
                                if *code == ControlChar::AUTO_NUMBER {
                                    return display_text.clone();
                                }
                            }
                            None
                        });
                        break;
                    }
                }

                // haN 너비 계산 / Calculate haN width
                let num_text = auto_number_display.as_deref().unwrap_or("");
                let han_width_style = if !num_text.is_empty() {
                    let cs = caption_char_shape_id
                        .and_then(|id| document.doc_info.char_shapes.get(id))
                        .or_else(|| document.doc_info.char_shapes.first());
                    if let Some(cs) = cs {
                        let font_size_mm = (cs.base_size as f64 / 100.0) * 0.352778;
                        let char_count = num_text.chars().count().max(1);
                        let w = round_to_2dp(font_size_mm * 0.6 * char_count as f64);
                        format!("width:{:.1}mm;", w)
                    } else {
                        String::new()
                    }
                } else {
                    String::new()
                };

                // body_default_hls 값 / body_default_hls values
                let lh = 2.79;
                let top_off = -0.18;
                let height_mm = round_to_2dp(int32_to_mm(caption_height_hu));

                // 캡션 hls 너비: segment_width 사용 / Caption hls width: use segment_width
                let caption_hls_width_mm = {
                    let mut w = caption_w_mm;
                    for rec in &caption_para.records {
                        if let ParagraphRecord::ParaLineSeg { segments } = rec {
                            if let Some(seg) = segments.first() {
                                w = round_to_2dp(int32_to_mm(seg.segment_width));
                            }
                            break;
                        }
                    }
                    w
                };

                let hls_content = if let Some(auto_pos) = auto_number_pos {
                    // AUTO_NUMBER 앞뒤 텍스트 분리 / Split text before/after AUTO_NUMBER
                    let before: String = caption_text.chars().take(auto_pos).collect::<String>().trim_end().to_string();
                    let after: String = caption_text.chars().skip(auto_pos + 1).collect::<String>().trim().to_string();
                    format!(
                        r#"<span class="hrt {cs}">{before}&nbsp;</span><div class="haN" style="left:0mm;top:0mm;{han_w}height:{h}mm;"><span class="hrt {cs}">{num}</span></div><span class="hrt {cs}">&nbsp;{after}</span>"#,
                        cs = cs_class,
                        before = before,
                        han_w = han_width_style,
                        h = height_mm,
                        num = num_text,
                        after = after,
                    )
                } else {
                    // AUTO_NUMBER 없으면 일반 텍스트 / No AUTO_NUMBER, plain text
                    let trimmed = caption_text.trim();
                    format!(
                        r#"<span class="hrt {cs}">{text}&nbsp;</span>"#,
                        cs = cs_class,
                        text = trimmed,
                    )
                };

                let body = format!(
                    r#"<div class="hls {ps}" style="line-height:{lh}mm;white-space:nowrap;left:0.00mm;top:{top}mm;height:{h}mm;width:{w}mm;">{content}</div>"#,
                    ps = ps_class,
                    lh = lh,
                    top = top_off,
                    h = height_mm,
                    w = caption_hls_width_mm,
                    content = hls_content,
                );

                caption_html = format!(
                    r#"<div class="{p}hcD" style="left:0mm;top:{t}mm;width:{cw}mm;height:{ch}mm;overflow:hidden;"><div class="{p}hcI" >{body}</div></div>"#,
                    p = prefix,
                    t = caption_top_mm,
                    cw = caption_w_mm,
                    ch = height_mm,
                );
            }
            break;
        }
    }

    let hsg_w_mm = round_to_2dp(2.0 * (shape_w_mm + half_stroke));
    let hsg_h_mm = if caption_height_hu > 0 {
        round_to_2dp(
            int32_to_mm(shape_height_hu as i32 + caption_gap_hu + caption_height_hu)
                + stroke_width,
        )
    } else {
        hsr_h_mm
    };

    let html = format!(
        r#"<div class="{p}hsG" style="top:{t}mm;left:{l}mm;width:{w}mm;height:{h}mm;">{hsr}{caption}</div>"#,
        p = prefix,
        t = top_mm,
        l = left_mm,
        w = hsg_w_mm,
        h = hsg_h_mm,
        hsr = hsr_html,
        caption = caption_html,
    );

    Some(html)
}

/// 도형 내부 콘텐츠 렌더링 (다단 지원)
fn render_shape_content(
    paragraphs: &[Paragraph],
    document: &HwpDocument,
    options: &HtmlOptions,
) -> String {
    use crate::document::bodytext::LineSegmentInfo;
    use crate::viewer::html::line_segment::{
        render_line_segments_with_content, DocumentRenderState, LineSegmentContent,
        LineSegmentRenderContext,
    };
    use crate::viewer::html::text;
    use std::collections::HashMap;

    let prefix = &options.css_class_prefix;

    let mut col_count: u8 = 1;
    let mut col_spacing_hu: i16 = 0;
    let mut div_line_type: u8 = 0;

    for para in paragraphs {
        for record in &para.records {
            if let ParagraphRecord::CtrlHeader { header, .. } = record {
                if let CtrlHeaderData::ColumnDefinition {
                    attribute,
                    column_spacing,
                    divider_line_type,
                    ..
                } = &header.data
                {
                    if attribute.column_count > 1 {
                        col_count = attribute.column_count;
                        col_spacing_hu = *column_spacing;
                        div_line_type = *divider_line_type;
                    }
                }
            }
        }
    }

    let margin_mm = round_to_2dp(int32_to_mm(298));

    if col_count <= 1 {
        let body = render_paragraphs_fragment(paragraphs, document, options);
        return format!(
            r#"<div class="{p}hcD" style="left:{m}mm;top:{m}mm;">{body}</div>"#,
            p = prefix,
            m = margin_mm,
        );
    }

    let col_count_usize = col_count as usize;
    let col_spacing_mm = round_to_2dp(int32_to_mm(col_spacing_hu as i32));

    let mut col_contents: Vec<String> = vec![String::new(); col_count_usize];
    let mut content_h_mm: f64 = 0.0;
    let mut seg_width_mm: f64 = 0.0;

    let mut pattern_counter = 0usize;
    let mut color_to_pattern: HashMap<u32, String> = HashMap::new();

    let mut mc_rendered = false;
    for para in paragraphs {
        if para.para_header.column_divide_type.is_empty() {
            continue;
        }
        if mc_rendered {
            break; // 중복 다단 문단 건너뛰기 / Skip duplicate multi-column paragraphs
        }
        mc_rendered = true;

        let para_shape_id = para.para_header.para_shape_id;
        let para_shape_class = if (para_shape_id as usize) < document.doc_info.para_shapes.len() {
            format!("ps{}", para_shape_id)
        } else {
            String::new()
        };

        let (para_text, char_shapes) = text::extract_text_and_shapes(para);

        let mut line_segments: Vec<LineSegmentInfo> = Vec::new();
        let mut control_char_positions = Vec::new();

        for record in &para.records {
            match record {
                ParagraphRecord::ParaLineSeg { segments } => {
                    line_segments = segments.clone();
                }
                ParagraphRecord::ParaText {
                    control_char_positions: ccp,
                    ..
                } => {
                    control_char_positions = ccp.clone();
                }
                _ => {}
            }
        }

        if line_segments.len() < col_count_usize {
            continue;
        }

        let segs_per_col = line_segments.len() / col_count_usize;
        if segs_per_col == 0 {
            continue;
        }

        if seg_width_mm == 0.0 {
            seg_width_mm = round_to_2dp(int32_to_mm(line_segments[0].segment_width));
        }

        let col_segs = &line_segments[..segs_per_col];
        if let Some(last) = col_segs.last() {
            let h = round_to_2dp(int32_to_mm(last.vertical_position + last.line_height));
            if h > content_h_mm {
                content_h_mm = h;
            }
        }

        let para_shape_indent =
            if (para_shape_id as usize) < document.doc_info.para_shapes.len() {
                Some(document.doc_info.para_shapes[para_shape_id as usize].indent)
            } else {
                None
            };

        let original_text_len = para.para_header.text_char_count as usize;

        for col in 0..col_count_usize {
            let col_start = col * segs_per_col;
            let col_end = (col + 1) * segs_per_col;
            let col_segs = &line_segments[col_start..col_end];

            let col_original_text_len = if col + 1 < col_count_usize {
                line_segments[(col + 1) * segs_per_col].text_start_position as usize
            } else {
                original_text_len
            };

            let content = LineSegmentContent {
                segments: col_segs,
                text: &para_text,
                char_shapes: &char_shapes,
                control_char_positions: &control_char_positions,
                original_text_len: col_original_text_len,
                images: &[],
                tables: &[],
                shape_htmls: &[],
            };

            let context = LineSegmentRenderContext {
                document,
                para_shape_class: &para_shape_class,
                options,
                para_shape_indent,
                hcd_position: None,
                page_def: None,
                body_default_hls: Some((2.79, -0.18)),
            };

            let mut state = DocumentRenderState {
                table_counter_start: 0,
                pattern_counter: &mut pattern_counter,
                color_to_pattern: &mut color_to_pattern,
            };

            col_contents[col]
                .push_str(&render_line_segments_with_content(&content, &context, &mut state));
        }
    }

    let mut hcd_inner = String::new();

    if div_line_type > 0 && content_h_mm > 0.0 {
        let sep_left_mm = round_to_2dp(seg_width_mm + (col_spacing_mm - 0.11) / 2.0);
        let svg_h = round_to_2dp(content_h_mm + 0.23);
        hcd_inner.push_str(&format!(
            r#"<div class="{p}hcS" style="left:{sl}mm;top:0mm;width:0.11mm;height:{h}mm;"><svg class="hs" viewBox="-0.12 -0.12 0.35 {svgh}" style="left:-0.12mm;top:-0.12mm;width:0.35mm;height:{svgh}mm;left:0;top:0;"><path d="M0.06,0 L0.06,{h}" style="stroke:#000000;stroke-linecap:butt;stroke-width:0.12;"></path></svg></div>"#,
            p = prefix,
            sl = sep_left_mm,
            h = content_h_mm,
            svgh = svg_h,
        ));
    }

    for (col, col_html) in col_contents.iter().enumerate() {
        if col == 0 {
            hcd_inner.push_str(&format!(
                r#"<div class="{p}hcI">{c}</div>"#,
                p = prefix,
                c = col_html,
            ));
        } else {
            let col_left_mm = round_to_2dp(seg_width_mm + col_spacing_mm);
            hcd_inner.push_str(&format!(
                r#"<div class="{p}hcI" style="left:{l}mm;">{c}</div>"#,
                p = prefix,
                l = col_left_mm,
                c = col_html,
            ));
        }
    }

    format!(
        r#"<div class="{p}hcD" style="left:{m}mm;top:{m}mm;">{inner}</div>"#,
        p = prefix,
        m = margin_mm,
        inner = hcd_inner,
    )
}

/// ParagraphRecord 배열에서 재귀적으로 이미지 수집 / Recursively collect images from ParagraphRecord array
#[allow(clippy::too_many_arguments)]
fn collect_images_from_records(
    records: &[ParagraphRecord],
    document: &HwpDocument,
    options: &HtmlOptions,
    like_letters: bool,
    vert_rel_to: Option<VertRelTo>,
    parent_shape_component_width: Option<u32>,
    parent_shape_component_height: Option<u32>,
    images: &mut Vec<ImageInfo>,
) {
    for record in records {
        match record {
            ParagraphRecord::ShapeComponentPicture {
                shape_component_picture,
            } => {
                let bindata_id = shape_component_picture.picture_info.bindata_id;
                let image_url = common::get_image_url(
                    document,
                    bindata_id,
                    options.image_output_dir.as_deref(),
                    options.html_output_dir.as_deref(),
                );
                if !image_url.is_empty() {
                    let br_width = (shape_component_picture.border_rectangle_x.right
                        - shape_component_picture.border_rectangle_x.left)
                        .max(0) as u32;
                    let br_height = (shape_component_picture.border_rectangle_y.bottom
                        - shape_component_picture.border_rectangle_y.top)
                        .max(0) as u32;
                    let (width, height) = if br_width > 0 && br_height > 0 {
                        (br_width, br_height)
                    } else {
                        (
                            parent_shape_component_width.unwrap_or(0),
                            parent_shape_component_height.unwrap_or(0),
                        )
                    };

                    if width > 0 && height > 0 {
                        images.push(ImageInfo {
                            width,
                            height,
                            url: image_url,
                            like_letters,
                            vert_rel_to,
                        });
                    }
                }
            }
            ParagraphRecord::ShapeComponent {
                shape_component,
                children,
            } => {
                collect_images_from_records(
                    children,
                    document,
                    options,
                    like_letters,
                    vert_rel_to,
                    Some(shape_component.width),
                    Some(shape_component.height),
                    images,
                );
            }
            ParagraphRecord::CtrlHeader { children, .. } => {
                collect_images_from_records(
                    children,
                    document,
                    options,
                    like_letters,
                    vert_rel_to,
                    parent_shape_component_width,
                    parent_shape_component_height,
                    images,
                );
            }
            _ => {}
        }
    }
}
