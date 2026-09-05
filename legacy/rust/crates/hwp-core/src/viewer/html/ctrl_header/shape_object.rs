use super::{CtrlHeaderResult, ShapePositionContext};
use crate::document::bodytext::control_char::ControlChar;
use crate::document::bodytext::ctrl_header::VertRelTo;
use crate::document::bodytext::shape_component::drawing_object_common::{
    DrawingObjectCommon, LineType,
};
use crate::document::bodytext::{ParaTextRun, ParagraphRecord};
use crate::document::{CtrlHeader, CtrlHeaderData, FillInfo, Paragraph};
use crate::viewer::core::outline::{
    compute_paragraph_marker_with_char_shape, MarkerInfo, NumberTracker, OutlineNumberTracker,
};
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
    shape_pos: Option<&ShapePositionContext<'_>>,
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

    // 이미지 수집 (도형 렌더링과 무관하게 항상 먼저 수행)
    // 도형(Rectangle/Line) early return 이후에 배치하면 도형+이미지 공존 시 이미지가 누락됨
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
        if like_letters {
            if let Some(html) = render_rectangle_shape_inline(header, children, document, options) {
                result.inline_shape_html = Some(html);
                return result;
            }
        } else if let Some(html) =
            render_rectangle_shape(header, children, document, options, shape_pos)
        {
            result.shape_html = Some(html);
            return result;
        }
    }

    // 선 도형(ShapeComponentLine) 렌더링
    // fixture에서 선 도형은 <div class="hsR"> 안에 SVG <path>로 렌더링됨
    let has_line_shape = children.iter().any(|r| {
        if let ParagraphRecord::ShapeComponent { children, .. } = r {
            children
                .iter()
                .any(|c| matches!(c, ParagraphRecord::ShapeComponentLine { .. }))
        } else {
            false
        }
    });

    if has_line_shape && !like_letters {
        if let Some(html) = render_line_shape(header, children) {
            result.shape_html = Some(html);
            return result;
        }
    }

    result
}

/// ShapeComponentRectangle을 hsR HTML로 렌더링 (절대 위치)
fn render_rectangle_shape(
    header: &CtrlHeader,
    children: &[ParagraphRecord],
    document: &HwpDocument,
    options: &HtmlOptions,
    shape_pos: Option<&ShapePositionContext<'_>>,
) -> Option<String> {
    use crate::document::bodytext::ctrl_header::{HorzRelTo, VertRelTo};

    let (offset_x, offset_y, _obj_width, _obj_height, caption, attribute) = match &header.data {
        CtrlHeaderData::ObjectCommon {
            attribute,
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
            attribute,
        ),
        _ => return None,
    };

    let mut shape_width_hu: u32 = 0;
    let mut shape_height_hu: u32 = 0;
    let mut shape_content_paragraphs: Option<&[Paragraph]> = None;
    let mut shape_vertical_align = crate::document::bodytext::list_header::VerticalAlign::Top;
    let mut drawing_obj: Option<&DrawingObjectCommon> = None;

    for record in children {
        if let ParagraphRecord::ShapeComponent {
            shape_component,
            drawing_object_common,
            children: sc_children,
        } = record
        {
            shape_width_hu = shape_component.width;
            shape_height_hu = shape_component.height;
            drawing_obj = drawing_object_common.as_ref();
            for child in sc_children {
                if let ParagraphRecord::ListHeader { header, paragraphs } = child {
                    shape_content_paragraphs = Some(paragraphs);
                    shape_vertical_align = header.attribute.vertical_align;
                    break;
                }
            }
            break;
        }
    }

    let line_type = drawing_obj
        .map(|d| d.line_info.line_type)
        .unwrap_or(LineType::Solid);
    let _has_stroke = !matches!(line_type, LineType::None);
    let stroke_width = compute_stroke_width(drawing_obj);
    let half_stroke = round_to_2dp(stroke_width / 2.0);

    if shape_width_hu == 0 || shape_height_hu == 0 {
        return None;
    }

    let shape_w_raw = int32_to_mm(shape_width_hu as i32);
    let shape_h_raw = int32_to_mm(shape_height_hu as i32);
    let shape_w_mm = round_to_2dp(shape_w_raw);
    let shape_h_mm = round_to_2dp(shape_h_raw);
    let hsr_w_mm = round_to_2dp(shape_w_mm + stroke_width);
    let hsr_h_mm = round_to_2dp(shape_h_mm + stroke_width);

    let has_content = shape_content_paragraphs.is_some();

    // SVG fill 생성 / Generate SVG fill
    let fill_info = drawing_obj.map(|d| &d.fill_info);
    let (svg_defs, fill_attr) = build_svg_fill(fill_info, shape_w_raw, shape_h_raw);

    // SVG stroke 스타일 생성 / Generate SVG stroke style
    let stroke_style = build_svg_stroke(drawing_obj, stroke_width);

    // 도형에 텍스트 콘텐츠가 있는 경우: hsT 래퍼 사용 / Shapes with text content: use hsT wrapper
    // 콘텐츠가 없는 경우: SVG를 hsR에 직접 배치 / Shapes without content: place SVG directly in hsR
    let (path_start_x, path_start_y, vb_margin) = if has_content {
        (half_stroke, half_stroke, 0.30)
    } else {
        (0.0, 0.0, 0.15)
    };

    let path_end_x = round_to_2dp(shape_w_raw + path_start_x);
    let path_end_y = round_to_2dp(shape_h_raw + path_start_y);
    let svg_vb_w = round_to_2dp(hsr_w_mm + 2.0 * vb_margin);
    let svg_vb_h = round_to_2dp(hsr_h_mm + 2.0 * vb_margin);
    let svg_style_w = round_to_2dp(hsr_w_mm + 2.0 * 0.15);
    let svg_style_h = round_to_2dp(hsr_h_mm + 2.0 * 0.15);

    let path_d = format!(
        "M{sx},{sy}L{ex},{sy}L{ex},{ey}L{sx},{ey}L{sx},{sy}Z ",
        sx = path_start_x,
        sy = path_start_y,
        ex = path_end_x,
        ey = path_end_y,
    );

    let path_style_attr = if stroke_style.is_empty() {
        String::new()
    } else {
        format!(r#" style="{}""#, stroke_style)
    };

    let svg_html = format!(
        r#"<svg class="hs" viewBox="-{vm} -{vm} {vbw} {vbh}" style="left:-0.15mm;top:-0.15mm;width:{sw}mm;height:{sh}mm;">{defs}<path fill="{fill}" d="{d}"{ps}></path></svg>"#,
        vm = vb_margin,
        vbw = svg_vb_w,
        vbh = svg_vb_h,
        sw = svg_style_w,
        sh = svg_style_h,
        defs = svg_defs,
        fill = fill_attr,
        d = path_d,
        ps = path_style_attr,
    );

    let content_html = if let Some(paras) = shape_content_paragraphs {
        render_shape_content(
            paras,
            document,
            options,
            Some((shape_height_hu, stroke_width)),
            shape_vertical_align,
        )
    } else {
        String::new()
    };

    let prefix = &options.css_class_prefix;

    // 콘텐츠가 있는 경우: hsT 래퍼 / Content shapes: hsT wrapper
    // 콘텐츠가 없는 경우: SVG를 직접 배치 / No-content shapes: place SVG directly
    let hst_html = if has_content {
        format!(
            r#"<div class="{p}hsT" style="left:-{hs}mm;top:-{hs}mm;width:{w}mm;height:{h}mm;">{svg}{content}</div>"#,
            p = prefix,
            hs = half_stroke,
            w = hsr_w_mm,
            h = hsr_h_mm,
            svg = svg_html,
            content = content_html,
        )
    } else {
        // 콘텐츠 없음: SVG를 직접 출력 / No content: output SVG directly
        svg_html.clone()
    };

    // 절대 위치 계산 / Compute absolute position
    let offset_x_mm = int32_to_mm(offset_x);
    let offset_y_mm = int32_to_mm(offset_y);

    let (base_left, base_top) = if let Some(ctx) = shape_pos {
        if let Some((left, top)) = ctx.hcd_position {
            (round_to_2dp(left), round_to_2dp(top))
        } else if let Some(pd) = ctx.page_def {
            let left = round_to_2dp(pd.left_margin.to_mm() + pd.binding_margin.to_mm());
            let top = round_to_2dp(pd.top_margin.to_mm() + pd.header_margin.to_mm());
            (left, top)
        } else {
            (20.0, 24.99)
        }
    } else {
        (20.0, 24.99)
    };

    let page_number = shape_pos.map(|ctx| ctx.page_number).unwrap_or(1);
    let page_def = shape_pos.and_then(|ctx| ctx.page_def);

    // 수평 기준 폭 계산 / Compute horizontal reference width
    let ref_width = match attribute.horz_rel_to {
        HorzRelTo::Paper => page_def.map(|pd| pd.effective_width_mm()).unwrap_or(210.0),
        HorzRelTo::Page | HorzRelTo::Column => {
            if let Some(pd) = page_def {
                pd.effective_width_mm()
                    - (pd.left_margin.to_mm() + pd.binding_margin.to_mm())
                    - pd.right_margin.to_mm()
            } else {
                150.0
            }
        }
        HorzRelTo::Para => {
            if let Some(pd) = page_def {
                pd.effective_width_mm()
                    - (pd.left_margin.to_mm() + pd.binding_margin.to_mm())
                    - pd.right_margin.to_mm()
            } else {
                150.0
            }
        }
    };

    let binding_margin_mm = page_def.map(|pd| pd.binding_margin.to_mm()).unwrap_or(0.0);

    let base_left_for_horz = if matches!(attribute.horz_rel_to, HorzRelTo::Paper) {
        0.0
    } else {
        base_left
    };

    // horz_relative: 0=left, 1=center, 2=right, 3=inside, 4=outside
    let abs_left = match attribute.horz_relative {
        1 => {
            // center
            round_to_2dp(base_left_for_horz + (ref_width - shape_w_mm) / 2.0 + offset_x_mm)
        }
        2 => {
            // right
            round_to_2dp(base_left_for_horz + ref_width - shape_w_mm - offset_x_mm)
        }
        3 => {
            // inside: odd→left, even→right (ref_width - binding_margin)
            let is_odd = page_number % 2 == 1;
            if is_odd {
                // left alignment
                round_to_2dp(base_left_for_horz + offset_x_mm)
            } else {
                // right alignment with binding_margin adjustment
                let adj_width = ref_width - binding_margin_mm;
                round_to_2dp(base_left_for_horz + adj_width - shape_w_mm - offset_x_mm)
            }
        }
        4 => {
            // outside: odd→right, even→left
            let is_odd = page_number % 2 == 1;
            if is_odd {
                // right alignment
                round_to_2dp(base_left_for_horz + ref_width - shape_w_mm - offset_x_mm)
            } else {
                // left alignment
                round_to_2dp(base_left_for_horz + offset_x_mm)
            }
        }
        _ => {
            // left (0) or unknown
            round_to_2dp(base_left_for_horz + offset_x_mm)
        }
    };

    // 수직 기준 높이 계산 / Compute vertical reference height
    let ref_height = match attribute.vert_rel_to {
        VertRelTo::Paper => page_def.map(|pd| pd.effective_height_mm()).unwrap_or(297.0),
        VertRelTo::Page => {
            if let Some(pd) = page_def {
                pd.effective_height_mm()
                    - (pd.top_margin.to_mm() + pd.header_margin.to_mm())
                    - (pd.bottom_margin.to_mm() + pd.footer_margin.to_mm())
            } else {
                232.0
            }
        }
        VertRelTo::Para => {
            if let Some(pd) = page_def {
                pd.effective_height_mm()
                    - (pd.top_margin.to_mm() + pd.header_margin.to_mm())
                    - (pd.bottom_margin.to_mm() + pd.footer_margin.to_mm())
            } else {
                232.0
            }
        }
    };

    let base_top_for_vert = if matches!(attribute.vert_rel_to, VertRelTo::Paper) {
        0.0
    } else {
        base_top
    };

    // vert_relative: 0=top, 1=center, 2=bottom
    let abs_top = match attribute.vert_relative {
        1 => {
            // center
            round_to_2dp(base_top_for_vert + (ref_height - shape_h_mm) / 2.0 + offset_y_mm)
        }
        2 => {
            // bottom
            round_to_2dp(base_top_for_vert + ref_height - shape_h_mm - offset_y_mm)
        }
        _ => {
            // top (0) or unknown
            round_to_2dp(base_top_for_vert + offset_y_mm)
        }
    };

    // 캡션이 없으면 hsR 직접 출력, 있으면 hsG 래퍼 사용
    // Output hsR directly when no caption, use hsG wrapper when caption exists
    let has_caption = caption.is_some()
        && children
            .iter()
            .any(|r| matches!(r, ParagraphRecord::ListHeader { .. }));

    if !has_caption {
        let html = format!(
            r#"<div class="{p}hsR" style="top:{t}mm;left:{l}mm;width:{w}mm;height:{h}mm;">{hst}</div>"#,
            p = prefix,
            t = abs_top,
            l = abs_left,
            w = hsr_w_mm,
            h = hsr_h_mm,
            hst = hst_html,
        );
        return Some(html);
    }

    // 캡션 있는 경우: 기존 hsG 래퍼 로직 / Caption present: use existing hsG wrapper logic
    let hsr_html = format!(
        r#"<div class="{p}hsR" style="top:0mm;left:0mm;width:{w}mm;height:{h}mm;">{hst}</div>"#,
        p = prefix,
        w = hsr_w_mm,
        h = hsr_h_mm,
        hst = hst_html,
    );

    let mut caption_html = String::new();
    let mut caption_height_hu: i32 = 0;
    let caption_gap_hu: i32 = if let Some(cap) = caption {
        i32::from(cap.gap)
    } else {
        850
    };
    for record in children {
        if let ParagraphRecord::ListHeader { paragraphs, .. } = record {
            if !paragraphs.is_empty() {
                for para in paragraphs {
                    for rec in &para.records {
                        if let ParagraphRecord::ParaLineSeg { segments } = rec {
                            if let Some(seg) = segments.last() {
                                caption_height_hu = seg.vertical_position + seg.line_height;
                            }
                        }
                    }
                }
                if caption_height_hu == 0 {
                    caption_height_hu = 1000;
                }

                let caption_top_mm =
                    round_to_2dp(int32_to_mm(shape_height_hu as i32 + caption_gap_hu));
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
                    if let ParagraphRecord::ParaText {
                        text,
                        runs,
                        control_char_positions,
                        ..
                    } = rec
                    {
                        caption_text = text.clone();
                        auto_number_pos = control_char_positions
                            .iter()
                            .find(|cp| cp.code == ControlChar::AUTO_NUMBER)
                            .map(|cp| cp.position);
                        auto_number_display = runs.iter().find_map(|run| {
                            if let ParaTextRun::Control {
                                code, display_text, ..
                            } = run
                            {
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
                    let before: String = caption_text
                        .chars()
                        .take(auto_pos)
                        .collect::<String>()
                        .trim_end()
                        .to_string();
                    let after: String = caption_text
                        .chars()
                        .skip(auto_pos + 1)
                        .collect::<String>()
                        .trim()
                        .to_string();
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
                    r#"<div class="hls {ps}" style="line-height:{lh}mm;white-space:nowrap;left:0mm;top:{top}mm;height:{h}mm;width:{w}mm;">{content}</div>"#,
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
            int32_to_mm(shape_height_hu as i32 + caption_gap_hu + caption_height_hu) + stroke_width,
        )
    } else {
        hsr_h_mm
    };

    let html = format!(
        r#"<div class="{p}hsG" style="top:{t}mm;left:{l}mm;width:{w}mm;height:{h}mm;">{hsr}{caption}</div>"#,
        p = prefix,
        t = abs_top,
        l = abs_left,
        w = hsg_w_mm,
        h = hsg_h_mm,
        hsr = hsr_html,
        caption = caption_html,
    );

    Some(html)
}

/// DrawingObjectCommon의 thickness에서 stroke_width(mm) 계산
/// Compute stroke width in mm from DrawingObjectCommon thickness
fn compute_stroke_width(drawing_obj: Option<&DrawingObjectCommon>) -> f64 {
    let thickness = drawing_obj.map(|d| d.line_info.thickness).unwrap_or(0);
    if thickness <= 0 {
        return 0.12; // 기본값 / default
    }
    let w = round_to_2dp(int32_to_mm(thickness));
    if w < 0.01 {
        0.12
    } else {
        w
    }
}

/// like_letters=true인 ShapeComponentRectangle을 인라인 hsR HTML로 렌더링
/// Render ShapeComponentRectangle as inline hsR HTML when like_letters=true
fn render_rectangle_shape_inline(
    header: &CtrlHeader,
    children: &[ParagraphRecord],
    document: &HwpDocument,
    options: &HtmlOptions,
) -> Option<String> {
    let _attribute = match &header.data {
        CtrlHeaderData::ObjectCommon { attribute, .. } => attribute,
        _ => return None,
    };

    let mut shape_width_hu: u32 = 0;
    let mut shape_height_hu: u32 = 0;
    let mut shape_content_paragraphs: Option<&[Paragraph]> = None;
    let mut shape_vertical_align = crate::document::bodytext::list_header::VerticalAlign::Top;
    let mut drawing_obj: Option<&DrawingObjectCommon> = None;

    for record in children {
        if let ParagraphRecord::ShapeComponent {
            shape_component,
            drawing_object_common,
            children: sc_children,
        } = record
        {
            shape_width_hu = shape_component.width;
            shape_height_hu = shape_component.height;
            drawing_obj = drawing_object_common.as_ref();
            for child in sc_children {
                if let ParagraphRecord::ListHeader { header, paragraphs } = child {
                    shape_content_paragraphs = Some(paragraphs);
                    shape_vertical_align = header.attribute.vertical_align;
                    break;
                }
            }
            break;
        }
    }

    if shape_width_hu == 0 || shape_height_hu == 0 {
        return None;
    }

    let stroke_width = compute_stroke_width(drawing_obj);
    let half_stroke = round_to_2dp(stroke_width / 2.0);

    let shape_w_raw = int32_to_mm(shape_width_hu as i32);
    let shape_h_raw = int32_to_mm(shape_height_hu as i32);
    let shape_w_mm = round_to_2dp(shape_w_raw);
    let shape_h_mm = round_to_2dp(shape_h_raw);
    let hsr_w_mm = round_to_2dp(shape_w_mm + stroke_width);
    let hsr_h_mm = round_to_2dp(shape_h_mm + stroke_width);

    let has_content = shape_content_paragraphs.is_some();

    // SVG fill / stroke
    let fill_info = drawing_obj.map(|d| &d.fill_info);
    let (svg_defs, fill_attr) = build_svg_fill(fill_info, shape_w_raw, shape_h_raw);
    let stroke_style = build_svg_stroke(drawing_obj, stroke_width);

    let (path_start_x, path_start_y, vb_margin) = if has_content {
        (half_stroke, half_stroke, 0.30)
    } else {
        (0.0, 0.0, 0.15)
    };

    let path_end_x = round_to_2dp(shape_w_raw + path_start_x);
    let path_end_y = round_to_2dp(shape_h_raw + path_start_y);
    let svg_vb_w = round_to_2dp(hsr_w_mm + 2.0 * vb_margin);
    let svg_vb_h = round_to_2dp(hsr_h_mm + 2.0 * vb_margin);
    let svg_style_w = round_to_2dp(hsr_w_mm + 2.0 * 0.15);
    let svg_style_h = round_to_2dp(hsr_h_mm + 2.0 * 0.15);

    let path_d = format!(
        "M{sx},{sy}L{ex},{sy}L{ex},{ey}L{sx},{ey}L{sx},{sy}Z ",
        sx = path_start_x,
        sy = path_start_y,
        ex = path_end_x,
        ey = path_end_y,
    );

    let path_style_attr = if stroke_style.is_empty() {
        String::new()
    } else {
        format!(r#" style="{}""#, stroke_style)
    };

    let svg_html = format!(
        r#"<svg class="hs" viewBox="-{vm} -{vm} {vbw} {vbh}" style="left:-0.15mm;top:-0.15mm;width:{sw}mm;height:{sh}mm;">{defs}<path fill="{fill}" d="{d}"{ps}></path></svg>"#,
        vm = vb_margin,
        vbw = svg_vb_w,
        vbh = svg_vb_h,
        sw = svg_style_w,
        sh = svg_style_h,
        defs = svg_defs,
        fill = fill_attr,
        d = path_d,
        ps = path_style_attr,
    );

    let content_html = if let Some(paras) = shape_content_paragraphs {
        render_shape_content(
            paras,
            document,
            options,
            Some((shape_height_hu, stroke_width)),
            shape_vertical_align,
        )
    } else {
        String::new()
    };

    let prefix = &options.css_class_prefix;

    let hst_html = if has_content {
        format!(
            r#"<div class="{p}hsT" style="left:-{hs}mm;top:-{hs}mm;width:{w}mm;height:{h}mm;">{svg}{content}</div>"#,
            p = prefix,
            hs = half_stroke,
            w = hsr_w_mm,
            h = hsr_h_mm,
            svg = svg_html,
            content = content_html,
        )
    } else {
        svg_html
    };

    // 인라인: display:inline-block;position:relative;vertical-align:middle
    let html = format!(
        r#"<div class="{p}hsR" style="top:0mm;margin-bottom:0mm;left:0mm;margin-right:0mm;width:{w}mm;height:{h}mm;display:inline-block;position:relative;vertical-align:middle;">{hst}</div>"#,
        p = prefix,
        w = hsr_w_mm,
        h = hsr_h_mm,
        hst = hst_html,
    );

    Some(html)
}

/// COLORREF를 #RRGGBB 문자열로 변환 / Convert COLORREF to #RRGGBB string
fn colorref_to_hex(c: &crate::types::COLORREF) -> String {
    format!("#{:02X}{:02X}{:02X}", c.r(), c.g(), c.b())
}

/// SVG fill 생성 (defs + fill attribute) / Build SVG fill (defs + fill attribute)
/// Returns (defs_html, fill_attr) — e.g. ("<defs>...</defs>", "url(#w_00)") or ("", "none")
fn build_svg_fill(fill_info: Option<&FillInfo>, shape_w: f64, shape_h: f64) -> (String, String) {
    let fill = match fill_info {
        Some(fi) => fi,
        None => return (String::new(), "none".to_string()),
    };

    match fill {
        FillInfo::None => (String::new(), "none".to_string()),
        FillInfo::Solid(solid) => {
            let bg_color = &solid.background_color;
            let pattern_type = solid.pattern_type;

            if pattern_type > 0 {
                // 패턴 채우기 (크로스해치 등) / Pattern fill (crosshatch etc.)
                let bg_r = bg_color.r();
                let bg_g = bg_color.g();
                let bg_b = bg_color.b();
                let fg_r = solid.pattern_color.r();
                let fg_g = solid.pattern_color.g();
                let fg_b = solid.pattern_color.b();

                let pattern_path = match pattern_type {
                    // 가로줄 / Horizontal
                    1 => r#"M0,1.5 l3,0"#.to_string(),
                    // 세로줄 / Vertical
                    2 => r#"M1.5,0 l0,3"#.to_string(),
                    // \\\ (backslash)
                    3 => r#"M0,0 l3,3 M-1,3 l1,1 M3,-1 l1,1"#.to_string(),
                    // /// (forward slash)
                    4 => r#"M-1,1 l1,-1 M0,3 l3,-3 M3,3 l1,-1"#.to_string(),
                    // 크로스해치 X: \ and / lines
                    5 => r#"M3,-1 l1,1 M0,0 l3,3 M-1,3 l1,1 M-1,1 l1,-1 M0,3 l3,-3 M3,3 l1,-1"#
                        .to_string(),
                    // + 격자 / Grid
                    6 => r#"M0,1.5 l3,0 M1.5,0 l0,3"#.to_string(),
                    _ => r#"M3,-1 l1,1 M0,0 l3,3 M-1,3 l1,1 M-1,1 l1,-1 M0,3 l3,-3 M3,3 l1,-1"#
                        .to_string(),
                };

                let defs = format!(
                    r#"<defs><pattern id="w_00" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="rgb({},{},{})"/><path d='{}' stroke="rgb({},{},{})" stroke-width='0.2'/></pattern></defs>"#,
                    bg_r, bg_g, bg_b, pattern_path, fg_r, fg_g, fg_b,
                );
                (defs, "url(#w_00)".to_string())
            } else {
                // 단색 채우기 / Solid fill
                let r = bg_color.r();
                let g = bg_color.g();
                let b = bg_color.b();
                let defs = format!(
                    r#"<defs><pattern id="w_01" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="rgb({},{},{})"/></pattern></defs>"#,
                    r, g, b,
                );
                (defs, "url(#w_01)".to_string())
            }
        }
        FillInfo::Gradient(grad) => {
            // 그러데이션 채우기 / Gradient fill
            if grad.colors.len() < 2 {
                return (String::new(), "none".to_string());
            }

            let color_start = &grad.colors[0];
            let color_end = &grad.colors[grad.colors.len() - 1];

            let r_start = color_start.r() as f64;
            let g_start = color_start.g() as f64;
            let b_start = color_start.b() as f64;
            let r_end = color_end.r() as f64;
            let g_end = color_end.g() as f64;
            let b_end = color_end.b() as f64;

            // 수평 그라디언트: 세로 stripe 패턴 생성 / Horizontal gradient: vertical stripe pattern
            // spread 값에 1을 더한 수만큼의 쌍으로 분할 (기본 52쌍 = 104 paths)
            let num_pairs = std::cmp::max(grad.spread as usize + 1, 2);
            let path_end_x = round_to_2dp(shape_w - half_stroke_for_gradient());
            let path_end_y = round_to_2dp(shape_h - half_stroke_for_gradient());
            // 각 쪽(left/right)에서 shape_w 전체를 커버하는 stripe 폭
            let stripe_width_raw = shape_w / num_pairs as f64;

            let mut paths = String::new();
            for i in 0..num_pairs {
                // 외곽(i=0) → 중앙(i=num_pairs-1): end 색상에서 start 색상으로 보간
                let t = if num_pairs > 1 {
                    i as f64 / (num_pairs - 1) as f64
                } else {
                    0.0
                };
                let r = (r_end + (r_start - r_end) * t) as u8;
                let g = (g_end + (g_start - g_end) * t) as u8;
                let b = (b_end + (b_start - b_end) * t) as u8;
                let hex = format!("#{:02X}{:02X}{:02X}", r, g, b);

                // 왼쪽 (네거티브 x) + 오른쪽 (포지티브 x) 대칭 배치
                let left_x1 = round_to_2dp(
                    -shape_w + half_stroke_for_gradient() + stripe_width_raw * i as f64,
                );
                let left_x2 = round_to_2dp(
                    -shape_w + half_stroke_for_gradient() + stripe_width_raw * (i + 1) as f64,
                );
                let right_x1 = round_to_2dp(path_end_x - stripe_width_raw * i as f64);
                let right_x2 = round_to_2dp(path_end_x - stripe_width_raw * (i + 1) as f64);

                paths.push_str(&format!(
                    r#"<path d="M{},{py}L{},{ny}L{},{ny}L{},{py}Z " style="fill:{c};stroke:{c};stroke-width:1;"></path>"#,
                    left_x1,
                    left_x1,
                    left_x2,
                    left_x2,
                    py = path_end_y,
                    ny = round_to_2dp(-shape_h + half_stroke_for_gradient()),
                    c = hex,
                ));
                paths.push_str(&format!(
                    r#"<path d="M{},{py}L{},{ny}L{},{ny}L{},{py}Z " style="fill:{c};stroke:{c};stroke-width:1;"></path>"#,
                    right_x1,
                    right_x1,
                    right_x2,
                    right_x2,
                    py = path_end_y,
                    ny = round_to_2dp(-shape_h + half_stroke_for_gradient()),
                    c = hex,
                ));
            }

            let defs = format!(
                r#"<defs><pattern id="g_0" width="100%" height="100%" patternUnits="userSpaceOnUse">{}</pattern></defs>"#,
                paths,
            );
            (defs, "url(#g_0)".to_string())
        }
        FillInfo::Image(_) => (String::new(), "none".to_string()),
    }
}

fn half_stroke_for_gradient() -> f64 {
    0.06
}

/// SVG stroke 스타일 생성 / Build SVG stroke style
/// Returns style content string, e.g. "stroke:#000000;stroke-linecap:butt;stroke-width:0.12;"
fn build_svg_stroke(drawing_obj: Option<&DrawingObjectCommon>, stroke_width: f64) -> String {
    let (line_type, line_color) = match drawing_obj {
        Some(d) => (d.line_info.line_type, &d.line_info.color),
        None => {
            // 폴백: 기본 검정 실선 / Fallback: default black solid
            return format!(
                "stroke:#000000;stroke-linecap:butt;stroke-width:{};",
                stroke_width
            );
        }
    };

    if matches!(line_type, LineType::None) {
        return String::new();
    }

    let color_hex = colorref_to_hex(line_color);

    let dasharray = match line_type {
        LineType::Solid => String::new(),
        LineType::Dot => "stroke-dasharray:0.17,0.26;".to_string(),
        LineType::Dash => "stroke-dasharray:0.47,0.47,0.47,0,0.47,0.47,0.47,0;".to_string(),
        LineType::DashDot => "stroke-dasharray:1.86,0.52,0.17,0.52;".to_string(),
        LineType::DashDotDot => "stroke-dasharray:0.47,0.47,0.47,0,0.47,0.47,0.47,0;".to_string(),
        LineType::LongDash => "stroke-dasharray:1.86,0.26;".to_string(),
        LineType::CircleDot => "stroke-dasharray:0.12,0.26;".to_string(),
        _ => String::new(),
    };

    format!(
        "stroke:{};stroke-linecap:butt;{dasharray}stroke-width:{};",
        color_hex,
        stroke_width,
        dasharray = dasharray,
    )
}

/// 도형 내부 콘텐츠 렌더링 (다단 지원)
fn render_shape_content(
    paragraphs: &[Paragraph],
    document: &HwpDocument,
    options: &HtmlOptions,
    container_dims: Option<(u32, f64)>, // (shape_height_hu, stroke_width)
    vertical_align: crate::document::bodytext::list_header::VerticalAlign,
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

    let mut pattern_counter = 0usize;
    let mut color_to_pattern: HashMap<u32, String> = HashMap::new();

    if col_count <= 1 {
        // cold 문단(column_divide_type 비어있지 않은)부터 수집, 그 이전 문단은 skip
        // Collect from cold paragraph (non-empty column_divide_type), skip earlier paragraphs
        // column_divide_type가 없으면 첫 문단(ghost)을 skip하고 나머지 수집
        // If no column_divide_type markers exist, skip the first (ghost) paragraph
        let has_cold_marker = paragraphs
            .iter()
            .any(|p| !p.para_header.column_divide_type.is_empty());

        let mut single_col_line_segments: Vec<LineSegmentInfo> = Vec::new();
        let mut single_col_text = String::new();
        let mut single_col_char_shapes: Vec<crate::document::bodytext::CharShapeInfo> = Vec::new();
        let mut single_col_control_char_positions = Vec::new();
        let mut single_col_collecting = false;
        let mut single_col_para_shape_id: u16 = 0;
        let mut single_col_wchar_offset: usize = 0;
        let mut paragraph_markers: Vec<(u32, MarkerInfo)> = Vec::new();
        let mut outline_tracker = OutlineNumberTracker::new();
        let mut number_tracker = NumberTracker::new();

        for (i, para) in paragraphs.iter().enumerate() {
            if has_cold_marker {
                if !para.para_header.column_divide_type.is_empty() {
                    single_col_collecting = true;
                }
            } else {
                // No cold markers: skip first paragraph (ghost) if multiple exist
                if i > 0 || paragraphs.len() == 1 {
                    single_col_collecting = true;
                }
            }
            if !single_col_collecting {
                continue;
            }

            single_col_para_shape_id = para.para_header.para_shape_id;

            let (para_text, char_shapes_vec) = text::extract_text_and_shapes(para);
            let fallback_cs_id = char_shapes_vec.first().map(|cs| cs.shape_id);
            if let Some(marker) = compute_paragraph_marker_with_char_shape(
                &para.para_header,
                document,
                &mut outline_tracker,
                &mut number_tracker,
                0,
                fallback_cs_id,
            ) {
                paragraph_markers.push((single_col_wchar_offset as u32, marker));
            }
            let text_offset = single_col_wchar_offset;

            for record in &para.records {
                match record {
                    ParagraphRecord::ParaLineSeg { segments } => {
                        for seg in segments {
                            let mut adjusted = seg.clone();
                            adjusted.text_start_position += text_offset as u32;
                            single_col_line_segments.push(adjusted);
                        }
                    }
                    ParagraphRecord::ParaText {
                        control_char_positions: ccp,
                        ..
                    } => {
                        for cp in ccp {
                            let mut adjusted = cp.clone();
                            adjusted.position += text_offset;
                            single_col_control_char_positions.push(adjusted);
                        }
                    }
                    _ => {}
                }
            }

            single_col_wchar_offset += para.para_header.text_char_count as usize;
            single_col_text.push_str(&para_text);
            for mut cs in char_shapes_vec {
                cs.position += text_offset as u32;
                single_col_char_shapes.push(cs);
            }
        }

        if single_col_line_segments.is_empty() {
            let body = render_paragraphs_fragment(paragraphs, document, options);
            return format!(
                r#"<div class="{p}hcD" style="left:{m}mm;top:{m}mm;">{body}</div>"#,
                p = prefix,
                m = margin_mm,
            );
        }

        let para_shape_class =
            if (single_col_para_shape_id as usize) < document.doc_info.para_shapes.len() {
                format!("ps{}", single_col_para_shape_id)
            } else {
                String::new()
            };
        let para_shape_indent =
            if (single_col_para_shape_id as usize) < document.doc_info.para_shapes.len() {
                Some(document.doc_info.para_shapes[single_col_para_shape_id as usize].indent)
            } else {
                None
            };

        let content = LineSegmentContent {
            segments: &single_col_line_segments,
            text: &single_col_text,
            char_shapes: &single_col_char_shapes,
            control_char_positions: &single_col_control_char_positions,
            original_text_len: single_col_wchar_offset,
            images: &[],
            tables: &[],
            shape_htmls: &[],
            marker_info: None,
            paragraph_markers: &paragraph_markers,
            footnote_refs: &[],
            endnote_refs: &[],
            auto_numbers: &[],
            hyperlinks: &[],
        };

        let ls_context = LineSegmentRenderContext {
            document,
            para_shape_class: &para_shape_class,
            options,
            para_shape_indent,
            hcd_position: None,
            page_def: None,
            body_default_hls: Some((2.79, -0.18)),
        };

        let mut ls_state = DocumentRenderState {
            table_counter_start: 0,
            pattern_counter: &mut pattern_counter,
            color_to_pattern: &mut color_to_pattern,
        };

        let body = render_line_segments_with_content(&content, &ls_context, &mut ls_state);

        // 수직 정렬 오프셋 계산 / Compute vertical alignment offset
        let top_mm_val = if let Some((shape_h_hu, stroke_w)) = container_dims {
            use crate::document::bodytext::list_header::VerticalAlign;
            let margin_hu = 298;
            let raw_available =
                int32_to_mm(shape_h_hu as i32) + stroke_w - 2.0 * int32_to_mm(margin_hu);
            let raw_content = if let Some(last) = single_col_line_segments.last() {
                int32_to_mm(last.vertical_position + last.line_height)
            } else {
                0.0
            };
            let offset = match vertical_align {
                VerticalAlign::Center if raw_available > raw_content => {
                    round_to_2dp((raw_available - raw_content) / 2.0)
                }
                VerticalAlign::Bottom if raw_available > raw_content => {
                    round_to_2dp(raw_available - raw_content)
                }
                _ => 0.0,
            };
            if offset.abs() >= 0.1 {
                offset
            } else {
                0.0
            }
        } else {
            0.0
        };

        let top_style = if top_mm_val.abs() > 0.001 {
            format!(" style=\"top:{}mm;\"", top_mm_val)
        } else {
            String::new()
        };

        return format!(
            r#"<div class="{p}hcD" style="left:{m}mm;top:{m}mm;"><div class="{p}hcI"{ts}>{body}</div></div>"#,
            p = prefix,
            m = margin_mm,
            ts = top_style,
            body = body,
        );
    }

    let col_count_usize = col_count as usize;
    let col_spacing_mm = round_to_2dp(int32_to_mm(col_spacing_hu as i32));

    let mut col_contents: Vec<String> = vec![String::new(); col_count_usize];
    let mut content_h_mm: f64 = 0.0;
    let mut seg_width_mm: f64 = 0.0;

    // cold 문단(column_divide_type 비어있지 않은)부터 다음 cold 또는 끝까지 모든 문단의
    // line segments, text, char_shapes를 집계 / Aggregate all paragraphs from cold (non-empty
    // column_divide_type) to next cold or end
    let mut all_line_segments: Vec<LineSegmentInfo> = Vec::new();
    let mut all_text = String::new();
    let mut all_char_shapes: Vec<crate::document::bodytext::CharShapeInfo> = Vec::new();
    let mut all_control_char_positions = Vec::new();
    let mut collecting = false;
    let mut para_shape_id: u16 = 0;
    let mut wchar_offset: usize = 0; // 원본 WCHAR 단위 오프셋 / Original WCHAR unit offset
    let mut mc_paragraph_markers: Vec<(u32, MarkerInfo)> = Vec::new();
    let mut mc_outline_tracker = OutlineNumberTracker::new();
    let mut mc_number_tracker = NumberTracker::new();

    for para in paragraphs {
        if !para.para_header.column_divide_type.is_empty() {
            if collecting {
                break; // 다음 cold 문단 도달 시 중단 / Stop at next cold paragraph
            }
            collecting = true;
        }
        if !collecting {
            continue;
        }

        para_shape_id = para.para_header.para_shape_id;

        let (para_text, char_shapes) = text::extract_text_and_shapes(para);
        let fallback_cs_id = char_shapes.first().map(|cs| cs.shape_id);
        if let Some(marker) = compute_paragraph_marker_with_char_shape(
            &para.para_header,
            document,
            &mut mc_outline_tracker,
            &mut mc_number_tracker,
            0,
            fallback_cs_id,
        ) {
            mc_paragraph_markers.push((wchar_offset as u32, marker));
        }

        // text_start_position 보정: 원본 WCHAR 단위 오프셋 사용
        // Adjust text_start_position: use original WCHAR unit offset
        let text_offset = wchar_offset;

        for record in &para.records {
            match record {
                ParagraphRecord::ParaLineSeg { segments } => {
                    for seg in segments {
                        let mut adjusted = seg.clone();
                        adjusted.text_start_position += text_offset as u32;
                        all_line_segments.push(adjusted);
                    }
                }
                ParagraphRecord::ParaText {
                    control_char_positions: ccp,
                    ..
                } => {
                    for cp in ccp {
                        let mut adjusted = cp.clone();
                        adjusted.position += text_offset;
                        all_control_char_positions.push(adjusted);
                    }
                }
                _ => {}
            }
        }

        wchar_offset += para.para_header.text_char_count as usize;
        all_text.push_str(&para_text);
        // char_shapes 위치도 WCHAR 오프셋으로 보정 / Adjust char_shapes positions by WCHAR offset
        for mut cs in char_shapes {
            cs.position += text_offset as u32;
            all_char_shapes.push(cs);
        }
    }

    if all_line_segments.len() < col_count_usize {
        let body = render_paragraphs_fragment(paragraphs, document, options);
        return format!(
            r#"<div class="{p}hcD" style="left:{m}mm;top:{m}mm;">{body}</div>"#,
            p = prefix,
            m = margin_mm,
        );
    }

    // split_into_column_groups로 컬럼 경계 감지 / Detect column boundaries with split_into_column_groups
    let col_groups = crate::viewer::html::document::split_into_column_groups(&all_line_segments);
    if col_groups.len() < col_count_usize {
        let body = render_paragraphs_fragment(paragraphs, document, options);
        return format!(
            r#"<div class="{p}hcD" style="left:{m}mm;top:{m}mm;">{body}</div>"#,
            p = prefix,
            m = margin_mm,
        );
    }

    let para_shape_class = if (para_shape_id as usize) < document.doc_info.para_shapes.len() {
        format!("ps{}", para_shape_id)
    } else {
        String::new()
    };

    let para_shape_indent = if (para_shape_id as usize) < document.doc_info.para_shapes.len() {
        Some(document.doc_info.para_shapes[para_shape_id as usize].indent)
    } else {
        None
    };

    if seg_width_mm == 0.0 {
        seg_width_mm = round_to_2dp(int32_to_mm(all_line_segments[0].segment_width));
    }

    // 첫 번째 line segment의 vertical_position을 top 오프셋으로 사용
    // Use first line segment's vertical_position as top offset
    let first_vpos: i32 = all_line_segments[0].vertical_position;

    // 첫 번째 컬럼 그룹의 높이를 content_h_mm으로 사용
    // Use first column group's height as content_h_mm
    let (first_start, first_end) = col_groups[0];
    let first_col_segs = &all_line_segments[first_start..first_end];
    if let Some(last) = first_col_segs.last() {
        let h = round_to_2dp(int32_to_mm(last.vertical_position + last.line_height));
        if h > content_h_mm {
            content_h_mm = h;
        }
    }

    let original_text_len = wchar_offset;

    for (col, &(start, end)) in col_groups.iter().enumerate().take(col_count_usize) {
        let col_segs = &all_line_segments[start..end];
        if col_segs.is_empty() {
            continue;
        }

        let col_original_text_len = if end < all_line_segments.len() {
            all_line_segments[end].text_start_position as usize
        } else {
            original_text_len
        };

        let content = LineSegmentContent {
            segments: col_segs,
            text: &all_text,
            char_shapes: &all_char_shapes,
            control_char_positions: &all_control_char_positions,
            original_text_len: col_original_text_len,
            images: &[],
            tables: &[],
            shape_htmls: &[],
            marker_info: None,
            paragraph_markers: &mc_paragraph_markers,
            footnote_refs: &[],
            endnote_refs: &[],
            auto_numbers: &[],
            hyperlinks: &[],
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

        col_contents[col].push_str(&render_line_segments_with_content(
            &content, &context, &mut state,
        ));
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

    // 수직 정렬 오프셋 계산 / Compute vertical alignment offset
    // 컨테이너 높이에서 마진을 뺀 가용 높이와 컨텐츠 높이의 차이로 정렬 오프셋을 계산
    // Compute alignment offset from difference between available height (container minus margins)
    // and content height. Skip negligible offsets (< 0.1mm).
    let top_mm = if let Some((shape_h_hu, stroke_w)) = container_dims {
        use crate::document::bodytext::list_header::VerticalAlign;
        // 라운딩 오차 방지를 위해 원본 HWP 단위에서 직접 계산
        // Compute from raw HWP units to avoid rounding error accumulation
        let margin_hu = 298;
        let raw_available =
            int32_to_mm(shape_h_hu as i32) + stroke_w - 2.0 * int32_to_mm(margin_hu);
        let raw_content = if let Some(last) = all_line_segments
            .get(col_groups[0].0..col_groups[0].1)
            .and_then(|s| s.last())
        {
            int32_to_mm(last.vertical_position + last.line_height)
        } else {
            0.0
        };
        let offset = match vertical_align {
            VerticalAlign::Center if raw_available > raw_content => {
                round_to_2dp((raw_available - raw_content) / 2.0)
            }
            VerticalAlign::Bottom if raw_available > raw_content => {
                round_to_2dp(raw_available - raw_content)
            }
            _ => 0.0,
        };
        if offset.abs() >= 0.1 {
            offset
        } else {
            round_to_2dp(int32_to_mm(first_vpos))
        }
    } else {
        round_to_2dp(int32_to_mm(first_vpos))
    };

    for (col, col_html) in col_contents.iter().enumerate() {
        let top_style = if top_mm.abs() > 0.001 {
            format!("top:{}mm;", top_mm)
        } else {
            String::new()
        };

        if col == 0 {
            if top_style.is_empty() {
                hcd_inner.push_str(&format!(
                    r#"<div class="{p}hcI">{c}</div>"#,
                    p = prefix,
                    c = col_html,
                ));
            } else {
                hcd_inner.push_str(&format!(
                    r#"<div class="{p}hcI" style="{t}">{c}</div>"#,
                    p = prefix,
                    t = top_style,
                    c = col_html,
                ));
            }
        } else {
            let col_left_mm = round_to_2dp(seg_width_mm + col_spacing_mm);
            hcd_inner.push_str(&format!(
                r#"<div class="{p}hcI" style="left:{l}mm;{t}">{c}</div>"#,
                p = prefix,
                l = col_left_mm,
                t = top_style,
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
                ..
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

/// 선 도형(ShapeComponentLine)을 SVG로 렌더링
/// fixture 기준: <div class="hsR" style="top:...;left:...;width:...;height:...;"><svg>...</svg></div>
fn render_line_shape(header: &CtrlHeader, children: &[ParagraphRecord]) -> Option<String> {
    let (offset_x, offset_y, obj_width, obj_height) = match &header.data {
        CtrlHeaderData::ObjectCommon {
            offset_x,
            offset_y,
            width,
            height,
            ..
        } => (
            offset_x.0,
            offset_y.0,
            u32::from(*width),
            u32::from(*height),
        ),
        _ => return None,
    };

    // ShapeComponentLine 찾기
    let line = children.iter().find_map(|r| {
        if let ParagraphRecord::ShapeComponent {
            children: sc_children,
            ..
        } = r
        {
            sc_children.iter().find_map(|c| {
                if let ParagraphRecord::ShapeComponentLine {
                    shape_component_line,
                } = c
                {
                    Some(shape_component_line)
                } else {
                    None
                }
            })
        } else {
            None
        }
    })?;

    let top_mm = round_to_2dp(int32_to_mm(offset_y));
    let left_mm = round_to_2dp(int32_to_mm(offset_x));
    let width_mm = round_to_2dp(obj_width as f64 / 7200.0 * 25.4);
    let height_mm = round_to_2dp(obj_height as f64 / 7200.0 * 25.4);

    // 선 좌표를 mm로 변환
    let start_x_mm = round_to_2dp(int32_to_mm(line.start_point.x));
    let start_y_mm = round_to_2dp(int32_to_mm(line.start_point.y));
    let end_x_mm = round_to_2dp(int32_to_mm(line.end_point.x));
    let end_y_mm = round_to_2dp(int32_to_mm(line.end_point.y));

    let padding = 0.15;
    let vb_left = round_to_2dp(-padding);
    let vb_top = round_to_2dp(-padding);
    let vb_width = round_to_2dp(width_mm + padding * 2.0);
    let vb_height = round_to_2dp(height_mm + padding * 2.0);

    Some(format!(
        r#"<div class="hsR" style="top:{top_mm}mm;left:{left_mm}mm;width:{width_mm}mm;height:{height_mm}mm;"><svg class="hs" viewBox="{vb_left} {vb_top} {vb_width} {vb_height}" style="left:{vb_left}mm;top:{vb_top}mm;width:{vb_width}mm;height:{vb_height}mm;"><path d="M{start_x_mm},{start_y_mm} L{end_x_mm},{end_y_mm}" style="stroke:#000000;stroke-linecap:butt;stroke-width:0.12;"></path></svg></div>"#,
    ))
}
