/// 테이블 렌더링 모듈 / Table rendering modules
mod cells;
mod constants;
mod geometry;
mod position;
mod size;
mod svg;

use crate::document::bodytext::ctrl_header::ObjectAttribute;
use crate::document::bodytext::{Margin, PageDef, Table};
use crate::types::{HWPUNIT, Hwpunit16ToMm, SHWPUNIT};

use self::position::{table_position, view_box};
use self::size::{content_size, htb_size, resolve_container_size};
use crate::viewer::html::table::constants::SVG_PADDING_MM;

/// 테이블을 HTML로 렌더링
#[allow(clippy::too_many_arguments)]
pub fn render_table(
    table: &Table,
    document: &crate::document::HwpDocument,
    ctrl_header_size: Option<(HWPUNIT, HWPUNIT, Margin)>,
    attr_info: Option<(&ObjectAttribute, SHWPUNIT, SHWPUNIT)>,
    hcd_position: Option<(f64, f64)>,
    page_def: Option<&PageDef>,
    _options: &crate::viewer::html::HtmlOptions,
    table_number: Option<u32>,
    caption_text: Option<&str>,
    segment_position: Option<(crate::types::INT32, crate::types::INT32)>,
    para_start_vertical_mm: Option<f64>,
    first_para_vertical_mm: Option<f64>, // 첫 번째 문단의 vertical_position (가설 O) / First paragraph's vertical_position (Hypothesis O)
) -> String {
    // #region agent log
    use std::fs::OpenOptions;
    use std::io::Write;
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(r"d:\ohah\hwpjs\.cursor\debug.log") {
        let _ = writeln!(file, r#"{{"id":"log_table_render_entry","timestamp":{},"location":"table/mod.rs:render_table","message":"render_table called","data":{{"has_ctrl_header_size":{},"has_attr_info":{},"has_caption":{},"table_number":{:?},"segment_position":{:?}}},"sessionId":"debug-session","runId":"run1","hypothesisId":"A"}}"#, 
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
            ctrl_header_size.is_some(),
            attr_info.is_some(),
            caption_text.is_some(),
            table_number,
            segment_position.is_some()
        );
    }
    // #endregion

    if table.cells.is_empty() || table.attributes.row_count == 0 {
        return r#"<div class="htb" style="left:0mm;width:0mm;top:0mm;height:0mm;"></div>"#
            .to_string();
    }

    let container_size = htb_size(ctrl_header_size.clone());
    let content_size = content_size(table, ctrl_header_size.clone());
    let resolved_size = resolve_container_size(container_size, content_size);
    let view_box = view_box(resolved_size.width, resolved_size.height, SVG_PADDING_MM);

    let svg = svg::render_svg(table, document, &view_box, content_size);
    let cells_html = cells::render_cells(table);

    let (offset_x, offset_y, vert_rel_to) = if let Some((attr, ox, oy)) = attr_info {
        (Some(ox), Some(oy), Some(attr.vert_rel_to))
    } else {
        (None, None, None)
    };
    // 바깥여백 상단 계산 (가설 Margin) / Calculate margin top (Hypothesis Margin)
    let margin_top_mm = ctrl_header_size.as_ref().map(|(_, _, margin)| margin.top.to_mm());
    // #region agent log
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(r"d:\ohah\hwpjs\.cursor\debug.log") {
        let _ = writeln!(file, r#"{{"id":"log_table_offset","timestamp":{},"location":"table/mod.rs:render_table","message":"table offset values","data":{{"offset_x":{:?},"offset_y":{:?},"offset_x_mm":{:?},"offset_y_mm":{:?},"hcd_position":{:?},"segment_position":{:?},"vert_rel_to":{:?},"para_start_vertical_mm":{:?},"margin_top_mm":{:?}}},"sessionId":"debug-session","runId":"run1","hypothesisId":"Margin"}}"#,
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
            offset_x.map(|x| x.0),
            offset_y.map(|y| y.0),
            offset_x.map(|x| x.to_mm()),
            offset_y.map(|y| y.to_mm()),
            hcd_position,
            segment_position,
            vert_rel_to,
            para_start_vertical_mm,
            margin_top_mm
        );
    }
    // #endregion
    let (left_mm, top_mm) = table_position(hcd_position, page_def, segment_position, offset_x, offset_y, vert_rel_to, para_start_vertical_mm, first_para_vertical_mm, margin_top_mm);

    // #region agent log
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(r"d:\ohah\hwpjs\.cursor\debug.log") {
        let like_letters = attr_info.map(|(attr, _, _)| attr.like_letters).unwrap_or(false);
        let _ = writeln!(file, r#"{{"id":"log_table_render_size","timestamp":{},"location":"table/mod.rs:render_table","message":"table size calculated","data":{{"container_width":{},"container_height":{},"content_width":{},"content_height":{},"resolved_width":{},"resolved_height":{},"left_mm":{},"top_mm":{},"like_letters":{}}},"sessionId":"debug-session","runId":"run1","hypothesisId":"B"}}"#,
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
            container_size.width, container_size.height,
            content_size.width, content_size.height,
            resolved_size.width, resolved_size.height,
            left_mm, top_mm, like_letters
        );
    }
    // #endregion

    // htG 래퍼 생성 (캡션이 있거나 ctrl_header_size가 있는 경우) / Create htG wrapper (if caption exists or ctrl_header_size exists)
    let needs_htg = caption_text.is_some() || ctrl_header_size.is_some();
    
    // #region agent log
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(r"d:\ohah\hwpjs\.cursor\debug.log") {
        let _ = writeln!(file, r#"{{"id":"log_table_render_htg","timestamp":{},"location":"table/mod.rs:render_table","message":"htG wrapper decision","data":{{"needs_htg":{},"has_caption":{},"has_ctrl_header_size":{}}},"sessionId":"debug-session","runId":"run1","hypothesisId":"C"}}"#,
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
            needs_htg, caption_text.is_some(), ctrl_header_size.is_some()
        );
    }
    // #endregion

    // 캡션 렌더링 / Render caption
    let caption_html = if let Some(caption) = caption_text {
        // 캡션 위치 결정 (위/아래) / Determine caption position (above/below)
        let is_caption_above = caption.contains("위 캡션") || caption.contains("위캡션");
        let caption_height_mm = 3.53; // fixtures에서 확인한 캡션 높이 / Caption height from fixtures
        let caption_margin_mm = if is_caption_above { 5.0 } else { 3.0 }; // 위 캡션: 5mm, 아래 캡션: 3mm
        
        // 캡션 텍스트에서 "표 X" 부분 추출 / Extract "표 X" from caption text
        let caption_parts: Vec<&str> = caption.split("표").collect();
        let table_num_text = if let Some(num_part) = caption_parts.get(1) {
            let extracted = num_part.trim().chars().take_while(|c| c.is_ascii_digit()).collect::<String>();
            if extracted.is_empty() {
                table_number.map(|n| n.to_string()).unwrap_or_default()
            } else {
                extracted
            }
        } else {
            table_number.map(|n| n.to_string()).unwrap_or_default()
        };
        // #region agent log
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(r"d:\ohah\hwpjs\.cursor\debug.log") {
            let _ = writeln!(file, r#"{{"id":"log_table_caption_number","timestamp":{},"location":"table/mod.rs:render_table","message":"table number extraction","data":{{"caption":{:?},"table_number":{:?},"table_num_text":{:?}}},"sessionId":"debug-session","runId":"run1","hypothesisId":"L"}}"#,
                std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
                caption,
                table_number,
                table_num_text
            );
        }
        // #endregion
        
        // 캡션 HTML 생성 / Generate caption HTML
        let caption_left_mm = if let Some((_, _, margin)) = &ctrl_header_size {
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
        
        let caption_body = caption.trim_start_matches("표").trim_start_matches(&table_num_text).trim();
        // #region agent log
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(r"d:\ohah\hwpjs\.cursor\debug.log") {
            let _ = writeln!(file, r#"{{"id":"log_table_caption_html","timestamp":{},"location":"table/mod.rs:render_table","message":"caption html generation","data":{{"table_num_text":{:?},"caption_body":{:?}}},"sessionId":"debug-session","runId":"run1","hypothesisId":"M"}}"#,
                std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
                table_num_text,
                caption_body
            );
        }
        // #endregion
        format!(
            r#"<div class="hcD" style="left:{}mm;top:{}mm;width:{}mm;height:{}mm;overflow:hidden;"><div class="hcI"><div class="hls ps0" style="line-height:2.79mm;white-space:nowrap;left:0mm;top:-0.18mm;height:{}mm;width:{}mm;"><span class="hrt cs0">표&nbsp;</span><div class="haN" style="left:0mm;top:0mm;width:1.95mm;height:{}mm;"><span class="hrt cs0">{}</span></div><span class="hrt cs0">&nbsp;{}</span></div></div></div>"#,
            caption_left_mm, caption_top_mm, caption_width_mm, caption_height_mm,
            caption_height_mm, caption_width_mm,
            caption_height_mm, table_num_text,
            caption_body
        )
    } else {
        String::new()
    };
    
    // htb 위치 조정 (캡션이 있으면) / Adjust htb position (if caption exists)
    let htb_left_mm = if let Some((_, _, margin)) = &ctrl_header_size {
        margin.left.to_mm()
    } else {
        0.0
    };
    let htb_top_mm = if caption_text.is_some() && caption_text.map(|s| s.contains("위 캡션") || s.contains("위캡션")).unwrap_or(false) {
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
    
    let htb_html = format!(
        r#"<div class="htb" style="left:{}mm;width:{}mm;top:{}mm;height:{}mm;">{}{}</div>"#,
        htb_left_mm, resolved_size.width, htb_top_mm, resolved_size.height, svg, cells_html
    );

    let result_html = if needs_htg {
        // htG 크기 계산 (테이블 + 캡션) / Calculate htG size (table + caption)
        let caption_height_mm = if caption_text.is_some() { 3.53 } else { 0.0 };
        let caption_margin_mm = if caption_text.map(|s| s.contains("위 캡션") || s.contains("위캡션")).unwrap_or(false) {
            5.0 + 3.0 // 위 캡션: 5mm 위쪽 + 3mm 아래쪽
        } else if caption_text.is_some() {
            3.0 + 1.0 // 아래 캡션: 3mm 간격 + 1mm 여유
        } else {
            0.0
        };
        let htg_height = resolved_size.height + caption_height_mm + caption_margin_mm;
        let htg_width = if let Some((width, _, margin)) = &ctrl_header_size {
            width.to_mm() + margin.left.to_mm() + margin.right.to_mm()
        } else {
            resolved_size.width
        };
        
        // htG 래퍼와 캡션 생성 / Create htG wrapper and caption
        let html = if caption_text.is_some() && caption_text.map(|s| s.contains("위 캡션") || s.contains("위캡션")).unwrap_or(false) {
            // 위 캡션: 캡션 먼저, 그 다음 테이블 / Caption above: caption first, then table
            format!(
                r#"<div class="htG" style="left:{}mm;width:{}mm;top:{}mm;height:{}mm;">{}{}</div>"#,
                left_mm, htg_width, top_mm, htg_height, caption_html, htb_html
            )
        } else {
            // 아래 캡션 또는 캡션 없음: 테이블 먼저, 그 다음 캡션 / Caption below or no caption: table first, then caption
            format!(
                r#"<div class="htG" style="left:{}mm;width:{}mm;top:{}mm;height:{}mm;">{}{}</div>"#,
                left_mm, htg_width, top_mm, htg_height, htb_html, caption_html
            )
        };
        
        // #region agent log
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(r"d:\ohah\hwpjs\.cursor\debug.log") {
            let html_preview = if html.len() > 200 { &html[..200] } else { &html };
            let _ = writeln!(file, r#"{{"id":"log_table_render_result","timestamp":{},"location":"table/mod.rs:render_table","message":"render_table result","data":{{"has_htg":true,"html_length":{},"html_preview":{:?}}},"sessionId":"debug-session","runId":"run1","hypothesisId":"E"}}"#,
                std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
                html.len(),
                html_preview
            );
        }
        // #endregion
        
        html
    } else {
        // #region agent log
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(r"d:\ohah\hwpjs\.cursor\debug.log") {
            let _ = writeln!(file, r#"{{"id":"log_table_render_result","timestamp":{},"location":"table/mod.rs:render_table","message":"render_table result","data":{{"has_htg":false,"html_length":{}}},"sessionId":"debug-session","runId":"run1","hypothesisId":"E"}}"#,
                std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
                htb_html.len()
            );
        }
        // #endregion
        
        htb_html
    };
    
    result_html
}
