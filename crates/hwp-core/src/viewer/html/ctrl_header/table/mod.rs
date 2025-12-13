/// 테이블 컨트롤 처리 및 렌더링 모듈 / Table control processing and rendering module
mod cells;
mod constants;
mod geometry;
mod position;
mod size;
mod svg;

use crate::document::bodytext::ctrl_header::CtrlHeaderData;
use crate::document::bodytext::{PageDef, ParagraphRecord, Table};
use crate::document::{CtrlHeader, Paragraph};
use crate::types::Hwpunit16ToMm;
use crate::viewer::HtmlOptions;
use crate::{HwpDocument, INT32};

use self::constants::SVG_PADDING_MM;
use self::position::{table_position, view_box};
use self::size::{content_size, htb_size, resolve_container_size};
use crate::viewer::html::ctrl_header::CtrlHeaderResult;

/// 캡션 정보 / Caption information
#[derive(Debug, Clone, Copy)]
pub struct CaptionInfo {
    /// 캡션 위치 (true = 위, false = 아래) / Caption position (true = above, false = below)
    pub is_above: bool,
    /// 캡션과 개체 사이 간격 (hwpunit) / Spacing between caption and object (hwpunit)
    pub gap: Option<i16>,
    /// 캡션 높이 (mm) / Caption height (mm)
    pub height_mm: Option<f64>,
}

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
    caption_info: Option<CaptionInfo>, // 캡션 정보 (위치, 간격, 높이) / Caption info (position, gap, height)
    segment_position: Option<(INT32, INT32)>,
    para_start_vertical_mm: Option<f64>,
    first_para_vertical_mm: Option<f64>, // 첫 번째 문단의 vertical_position (가설 O) / First paragraph's vertical_position (Hypothesis O)
) -> String {
    if table.cells.is_empty() || table.attributes.row_count == 0 {
        return r#"<div class="htb" style="left:0mm;width:0mm;top:0mm;height:0mm;"></div>"#
            .to_string();
    }

    // CtrlHeader에서 필요한 정보 추출 / Extract necessary information from CtrlHeader
    // CtrlHeader height를 mm로 변환 / Convert CtrlHeader height to mm
    let ctrl_header_height_mm =
        if let Some(CtrlHeaderData::ObjectCommon { height, .. }) = ctrl_header {
            Some(height.to_mm())
        } else {
            None
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
        ctrl_header,
        para_start_vertical_mm,
        first_para_vertical_mm,
    );

    // htG 래퍼 생성 (캡션이 있거나 ctrl_header가 있는 경우) / Create htG wrapper (if caption exists or ctrl_header exists)
    let needs_htg = caption_text.is_some() || ctrl_header.is_some();

    // margin 값 미리 계산 / Pre-calculate margin values
    let margin_top_mm = if let Some(CtrlHeaderData::ObjectCommon { margin, .. }) = ctrl_header {
        margin.top.to_mm()
    } else {
        0.0
    };
    let margin_left_mm = if let Some(CtrlHeaderData::ObjectCommon { margin, .. }) = ctrl_header {
        margin.left.to_mm()
    } else {
        0.0
    };
    let margin_right_mm = if let Some(CtrlHeaderData::ObjectCommon { margin, .. }) = ctrl_header {
        margin.right.to_mm()
    } else {
        0.0
    };
    let margin_bottom_mm = if let Some(CtrlHeaderData::ObjectCommon { margin, .. }) = ctrl_header {
        margin.bottom.to_mm()
    } else {
        0.0
    };

    // 캡션 정보 미리 계산 / Pre-calculate caption information
    let is_caption_above = caption_info.map(|info| info.is_above).unwrap_or(false);

    // 캡션 높이: 명시적으로 제공되면 사용, 없으면 기본값 / Caption height: use provided value or default
    let caption_height_mm = caption_info.and_then(|info| info.height_mm).unwrap_or(3.53); // 기본값: fixtures에서 확인한 캡션 높이 / Default: caption height from fixtures

    // 캡션 간격: gap을 hwpunit에서 mm로 변환 / Caption spacing: convert gap from hwpunit to mm
    let caption_margin_mm = if let Some(info) = caption_info {
        if let Some(gap_hwpunit) = info.gap {
            // HWPUNIT16을 mm로 변환 / Convert HWPUNIT16 to mm
            (gap_hwpunit as f64 / 7200.0) * 25.4
        } else {
            // gap이 없으면 기본값 사용 / Use default if gap not provided
            if is_caption_above {
                5.0
            } else {
                3.0
            }
        }
    } else {
        // 캡션 정보가 없으면 기본값 / Default if no caption info
        if is_caption_above {
            5.0
        } else {
            3.0
        }
    };

    // 캡션 렌더링 / Render caption
    let caption_html = if let Some(caption) = caption_text {
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
            // 위 캡션: caption_margin만 사용 (fixture 기준) / Caption above: use only caption_margin (based on fixture)
            // fixture에서 위 캡션 top=5mm, caption_margin=5mm이므로 margin.top은 포함하지 않음
            // In fixture, caption above top=5mm, caption_margin=5mm, so margin.top is not included
            caption_margin_mm
        } else {
            // 아래 캡션: htb top + htb height + 간격 / Caption below: htb top + htb height + spacing
            // htb_top_mm은 이미 margin.top이 포함되어 있음 / htb_top_mm already includes margin.top
            margin_top_mm + content_size.height + caption_margin_mm
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

    // htb 위치 조정 (마진 및 캡션 고려) / Adjust htb position (considering margin and caption)
    let htb_left_mm = margin_left_mm;
    let htb_top_mm = if is_caption_above {
        // 위 캡션이 있으면 테이블을 아래로 이동 / Move table down if caption is above
        margin_top_mm + caption_height_mm + caption_margin_mm
    } else if caption_text.is_some() {
        // 아래 캡션이 있으면 margin.top만 적용 / If caption is below, only apply margin.top
        margin_top_mm
    } else {
        margin_top_mm
    };

    // htb 높이는 콘텐츠 높이를 사용 (마진 제외) / htb height uses content height (excluding margin)
    // Fixture 기준: htb height = content_height (4.52mm), not resolved_size.height (6.52mm with margin)
    // Based on fixture: htb height = content_height (4.52mm), not resolved_size.height (6.52mm with margin)
    let htb_html = format!(
        r#"<div class="htb" style="left:{htb_left_mm}mm;width:{resolved_size_width}mm;top:{htb_top_mm}mm;height:{content_size_height}mm;">{svg}{cells_html}</div>"#,
        htb_left_mm = htb_left_mm,
        resolved_size_width = resolved_size.width,
        htb_top_mm = htb_top_mm,
        content_size_height = content_size.height,
        svg = svg,
        cells_html = cells_html,
    );

    let result_html = if needs_htg {
        // htG 크기 계산 (테이블 + 캡션) / Calculate htG size (table + caption)
        // 이미 계산한 caption_height_mm과 caption_margin_mm 재사용 / Reuse already calculated caption_height_mm and caption_margin_mm
        let actual_caption_height_mm = if caption_text.is_some() {
            caption_height_mm
        } else {
            0.0
        };

        let htg_caption_spacing_mm = if caption_text.is_some() {
            caption_margin_mm
        } else {
            0.0
        };

        let htg_height = resolved_size.height + actual_caption_height_mm + htg_caption_spacing_mm;

        // htG 너비: resolved_size.width는 이미 margin.left + margin.right가 포함되어 있음
        // htG width: resolved_size.width already includes margin.left + margin.right
        let htg_width = resolved_size.width;

        // htG 래퍼와 캡션 생성 / Create htG wrapper and caption
        let html = if caption_text.is_some() && is_caption_above {
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

/// 테이블 컨트롤 처리 / Process table control
///
/// CtrlHeader에서 테이블을 추출하고 캡션을 수집합니다.
/// Extracts tables from CtrlHeader and collects captions.
pub fn process_table<'a>(
    header: &'a CtrlHeader,
    children: &'a [ParagraphRecord],
    paragraphs: &[Paragraph],
) -> CtrlHeaderResult<'a> {
    let mut result = CtrlHeaderResult::new();

    // CtrlHeader 객체를 직접 전달 / Pass CtrlHeader object directly
    let (ctrl_header, caption_info) = match &header.data {
        CtrlHeaderData::ObjectCommon { caption, .. } => {
            let info = caption.as_ref().map(|cap| {
                use crate::document::bodytext::ctrl_header::CaptionAlign;
                CaptionInfo {
                    is_above: matches!(cap.align, CaptionAlign::Top),
                    gap: Some(cap.gap), // HWPUNIT16은 i16이므로 직접 사용 / HWPUNIT16 is i16, so use directly
                    height_mm: None, // 캡션 높이는 별도로 계산 필요 / Caption height needs separate calculation
                }
            });
            (Some(&header.data), info)
        }
        _ => (None, None),
    };

    // 캡션 텍스트 추출: paragraphs 필드에서 모든 캡션 수집 / Extract caption text: collect all captions from paragraphs field
    let mut caption_texts: Vec<String> = Vec::new();

    // paragraphs 필드에서 모든 캡션 수집 / Collect all captions from paragraphs field
    for para in paragraphs {
        for record in &para.records {
            if let ParagraphRecord::ParaText { text, .. } = record {
                if !text.trim().is_empty() {
                    caption_texts.push(text.clone());
                }
            }
        }
    }

    let mut caption_index = 0;
    let mut caption_text: Option<String> = None;
    let mut found_table = false;

    for child in children.iter() {
        if let ParagraphRecord::Table { table } = child {
            found_table = true;
            // paragraphs 필드에서 캡션 사용 (순서대로) / Use caption from paragraphs field (in order)
            let current_caption = if caption_index < caption_texts.len() {
                Some(caption_texts[caption_index].clone())
            } else {
                caption_text.clone()
            };
            caption_index += 1;
            result.tables.push((table, ctrl_header, current_caption, caption_info));
            caption_text = None; // 다음 테이블을 위해 초기화 / Reset for next table
        } else if found_table {
            // 테이블 다음에 오는 문단에서 텍스트 추출 / Extract text from paragraph after table
            if let ParagraphRecord::ParaText { text, .. } = child {
                caption_text = Some(text.clone());
                break;
            } else if let ParagraphRecord::ListHeader { paragraphs, .. } = child {
                // ListHeader의 paragraphs에서 텍스트 추출 / Extract text from ListHeader's paragraphs
                for para in paragraphs {
                    for record in &para.records {
                        if let ParagraphRecord::ParaText { text, .. } = record {
                            caption_text = Some(text.clone());
                            break;
                        }
                    }
                    if caption_text.is_some() {
                        break;
                    }
                }
                if caption_text.is_some() {
                    break;
                }
            }
        } else {
            // 테이블 이전에 오는 문단에서 텍스트 추출 (첫 번째 테이블의 캡션) / Extract text from paragraph before table (caption for first table)
            if let ParagraphRecord::ParaText { text, .. } = child {
                caption_text = Some(text.clone());
            } else if let ParagraphRecord::ListHeader { paragraphs, .. } = child {
                // ListHeader의 paragraphs에서 텍스트 추출 / Extract text from ListHeader's paragraphs
                for para in paragraphs {
                    for record in &para.records {
                        if let ParagraphRecord::ParaText { text, .. } = record {
                            caption_text = Some(text.clone());
                            break;
                        }
                    }
                    if caption_text.is_some() {
                        break;
                    }
                }
            }
        }
    }

    result
}
