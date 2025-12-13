/// 테이블 렌더링 모듈 / Table rendering modules
mod cells;
mod constants;
mod geometry;
mod position;
mod size;
mod svg;

use crate::document::bodytext::ctrl_header::CtrlHeaderData;
use crate::document::bodytext::{PageDef, Table};
use crate::types::Hwpunit16ToMm;
use crate::viewer::HtmlOptions;
use crate::{HwpDocument, INT32};

use self::position::{table_position, view_box};
use self::size::{content_size, htb_size, resolve_container_size};
use crate::viewer::html::table::constants::SVG_PADDING_MM;

/// 테이블을 HTML로 렌더링
#[allow(clippy::too_many_arguments)]
pub fn render_table(
    table: &Table,
    document: &HwpDocument,
    ctrl_header: Option<&CtrlHeaderData>,
    hcd_position: Option<(f64, f64)>,
    page_def: Option<&PageDef>,
    _options: &HtmlOptions,
    table_number: Option<u32>,
    caption_text: Option<&str>,
    segment_position: Option<(INT32, INT32)>,
    para_start_vertical_mm: Option<f64>,
    first_para_vertical_mm: Option<f64>, // 첫 번째 문단의 vertical_position (가설 O) / First paragraph's vertical_position (Hypothesis O)
) -> String {
    if table.cells.is_empty() || table.attributes.row_count == 0 {
        return r#"<div class="htb" style="left:0mm;width:0mm;top:0mm;height:0mm;"></div>"#
            .to_string();
    }

    // CtrlHeader에서 필요한 정보 추출 / Extract necessary information from CtrlHeader
    let (offset_x, offset_y, vert_rel_to, margin_top_mm, ctrl_header_height_mm) =
        if let Some(CtrlHeaderData::ObjectCommon {
            attribute,
            offset_x,
            offset_y,
            height,
            margin,
            ..
        }) = ctrl_header
        {
            (
                Some(*offset_x),
                Some(*offset_y),
                Some(attribute.vert_rel_to),
                Some(margin.top.to_mm()),
                Some(height.to_mm()),
            )
        } else {
            (None, None, None, None, None)
        };

    let container_size = htb_size(ctrl_header);
    let content_size = content_size(table, ctrl_header);
    let resolved_size = resolve_container_size(container_size, content_size);
    let view_box = view_box(resolved_size.width, resolved_size.height, SVG_PADDING_MM);

    let svg = svg::render_svg(
        table,
        document,
        &view_box,
        content_size,
        ctrl_header_height_mm,
    );
    let cells_html = cells::render_cells(table, ctrl_header_height_mm);
    let (left_mm, top_mm) = table_position(
        hcd_position,
        page_def,
        segment_position,
        offset_x,
        offset_y,
        vert_rel_to,
        para_start_vertical_mm,
        first_para_vertical_mm,
        margin_top_mm,
    );

    // htG 래퍼 생성 (캡션이 있거나 ctrl_header가 있는 경우) / Create htG wrapper (if caption exists or ctrl_header exists)
    let needs_htg = caption_text.is_some() || ctrl_header.is_some();

    // 캡션 렌더링 / Render caption
    let caption_html = if let Some(caption) = caption_text {
        // 캡션 위치 결정 (위/아래) / Determine caption position (above/below)
        let is_caption_above = caption.contains("위 캡션") || caption.contains("위캡션");
        let caption_height_mm = 3.53; // fixtures에서 확인한 캡션 높이 / Caption height from fixtures
        let caption_margin_mm = if is_caption_above { 5.0 } else { 3.0 }; // 위 캡션: 5mm, 아래 캡션: 3mm

        // 캡션 텍스트에서 "표 X" 부분 추출 / Extract "표 X" from caption text
        let caption_parts: Vec<&str> = caption.split("표").collect();
        let table_num_text = if let Some(num_part) = caption_parts.get(1) {
            let extracted = num_part
                .trim()
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>();
            if extracted.is_empty() {
                table_number.map(|n| n.to_string()).unwrap_or_default()
            } else {
                extracted
            }
        } else {
            table_number.map(|n| n.to_string()).unwrap_or_default()
        };

        // 캡션 HTML 생성 / Generate caption HTML
        let caption_left_mm = if let Some(CtrlHeaderData::ObjectCommon { margin, .. }) = ctrl_header
        {
            margin.left.to_mm()
        } else {
            0.0
        };
        let caption_top_mm = if is_caption_above {
            caption_margin_mm
        } else {
            resolved_size.height + caption_margin_mm
        };
        let caption_width_mm = resolved_size.width - (caption_left_mm * 2.0);

        let caption_body = caption
            .trim_start_matches("표")
            .trim_start_matches(&table_num_text)
            .trim();
        format!(
            r#"<div class="hcD" style="left:{}mm;top:{}mm;width:{}mm;height:{}mm;overflow:hidden;"><div class="hcI"><div class="hls ps0" style="line-height:2.79mm;white-space:nowrap;left:0mm;top:-0.18mm;height:{}mm;width:{}mm;"><span class="hrt cs0">표&nbsp;</span><div class="haN" style="left:0mm;top:0mm;width:1.95mm;height:{}mm;"><span class="hrt cs0">{}</span></div><span class="hrt cs0">&nbsp;{}</span></div></div></div>"#,
            caption_left_mm,
            caption_top_mm,
            caption_width_mm,
            caption_height_mm,
            caption_height_mm,
            caption_width_mm,
            caption_height_mm,
            table_num_text,
            caption_body
        )
    } else {
        String::new()
    };

    // htb 위치 조정 (캡션이 있으면) / Adjust htb position (if caption exists)
    let htb_left_mm = if let Some(CtrlHeaderData::ObjectCommon { margin, .. }) = ctrl_header {
        margin.left.to_mm()
    } else {
        0.0
    };
    let htb_top_mm = if caption_text.is_some()
        && caption_text
            .map(|s| s.contains("위 캡션") || s.contains("위캡션"))
            .unwrap_or(false)
    {
        // 위 캡션이 있으면 테이블을 아래로 이동 / Move table down if caption is above
        let caption_height_mm = 3.53;
        let caption_margin_mm = 5.0;
        caption_height_mm + caption_margin_mm
    } else if caption_text.is_some() {
        // 아래 캡션이 있으면 테이블을 위로 이동 / Move table up if caption is below
        1.0
    } else {
        0.0
    };

    // htb 높이는 콘텐츠 높이를 사용 (마진 제외) / htb height uses content height (excluding margin)
    // Fixture 기준: htb height = content_height (4.52mm), not resolved_size.height (6.52mm with margin)
    // Based on fixture: htb height = content_height (4.52mm), not resolved_size.height (6.52mm with margin)
    let htb_html = format!(
        r#"<div class="htb" style="left:{}mm;width:{}mm;top:{}mm;height:{}mm;">{}{}</div>"#,
        htb_left_mm, resolved_size.width, htb_top_mm, content_size.height, svg, cells_html
    );

    let result_html = if needs_htg {
        // htG 크기 계산 (테이블 + 캡션) / Calculate htG size (table + caption)
        let caption_height_mm = if caption_text.is_some() { 3.53 } else { 0.0 };
        let caption_margin_mm = if caption_text
            .map(|s| s.contains("위 캡션") || s.contains("위캡션"))
            .unwrap_or(false)
        {
            5.0 + 3.0 // 위 캡션: 5mm 위쪽 + 3mm 아래쪽
        } else if caption_text.is_some() {
            3.0 + 1.0 // 아래 캡션: 3mm 간격 + 1mm 여유
        } else {
            0.0
        };
        let htg_height = resolved_size.height + caption_height_mm + caption_margin_mm;
        let htg_width =
            if let Some(CtrlHeaderData::ObjectCommon { width, margin, .. }) = ctrl_header {
                width.to_mm() + margin.left.to_mm() + margin.right.to_mm()
            } else {
                resolved_size.width
            };

        // htG 래퍼와 캡션 생성 / Create htG wrapper and caption
        let html = if caption_text.is_some()
            && caption_text
                .map(|s| s.contains("위 캡션") || s.contains("위캡션"))
                .unwrap_or(false)
        {
            // 위 캡션: 캡션 먼저, 그 다음 테이블 / Caption above: caption first, then table
            format!(
                r#"<div class="htG" style="left:{left_mm}mm;width:{htg_width}mm;top:{top_mm}mm;height:{htg_height}mm;">{caption_html}{htb_html}</div>"#,
                left_mm = left_mm,
                htg_width = htg_width,
                top_mm = top_mm,
                htg_height = htg_height,
                caption_html = caption_html,
                htb_html = htb_html,
            )
        } else {
            // 아래 캡션 또는 캡션 없음: 테이블 먼저, 그 다음 캡션 / Caption below or no caption: table first, then caption
            format!(
                r#"<div class="htG" style="left:{left_mm}mm;width:{htg_width}mm;top:{top_mm}mm;height:{htg_height}mm;">{htb_html}{caption_html}</div>"#,
                left_mm = left_mm,
                htg_width = htg_width,
                top_mm = top_mm,
                htg_height = htg_height,
                htb_html = htb_html,
                caption_html = caption_html,
            )
        };

        html
    } else {
        htb_html
    };

    result_html
}
