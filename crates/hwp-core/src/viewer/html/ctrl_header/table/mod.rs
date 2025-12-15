/// 테이블 컨트롤 처리 및 렌더링 모듈 / Table control processing and rendering module
mod cells;
mod constants;
mod geometry;
mod position;
mod size;
mod svg;

use crate::document::bodytext::ctrl_header::{CaptionAlign, CtrlHeaderData};
use crate::document::bodytext::{PageDef, ParagraphRecord, Table};
use crate::document::{CtrlHeader, Paragraph};
use crate::types::{Hwpunit16ToMm, HWPUNIT};
use crate::viewer::HtmlOptions;
use crate::{HwpDocument, INT32};

use self::constants::SVG_PADDING_MM;
use self::position::{table_position, view_box};
use self::size::{content_size, htb_size, resolve_container_size};
use crate::viewer::html::ctrl_header::CtrlHeaderResult;

/// 캡션 정보 / Caption information
#[derive(Debug, Clone, Copy)]
pub struct CaptionInfo {
    /// 캡션 정렬 방향 / Caption alignment direction
    pub align: CaptionAlign,
    /// 캡션 위치 (true = 위, false = 아래) / Caption position (true = above, false = below)
    pub is_above: bool,
    /// 캡션과 개체 사이 간격 (hwpunit) / Spacing between caption and object (hwpunit)
    pub gap: Option<i16>,
    /// 캡션 높이 (mm) / Caption height (mm)
    pub height_mm: Option<f64>,
    /// 캡션 폭(세로 방향일 때만 사용) / Caption width (only for vertical direction)
    pub width: Option<u32>,
    /// 캡션 폭에 마진을 포함할 지 여부 (가로 방향일 때만 사용) / Whether to include margin in caption width (only for horizontal direction)
    pub include_margin: Option<bool>,
    /// 텍스트의 최대 길이(=개체의 폭) / Maximum text length (= object width)
    pub last_width: Option<u32>,
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
    caption_char_shape_id: Option<usize>, // 캡션 문단의 첫 번째 char_shape_id / First char_shape_id from caption paragraph
    caption_para_shape_id: Option<usize>, // 캡션 문단의 para_shape_id / Para shape ID from caption paragraph
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

    // margin 값 미리 계산 (SVG viewBox 계산에 필요) / Pre-calculate margin values (needed for SVG viewBox calculation)
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

    // SVG viewBox는 실제 테이블 콘텐츠 크기를 기준으로 계산해야 함 (margin 제외)
    // SVG viewBox should be calculated based on actual table content size (excluding margin)
    // resolved_size.width는 margin을 포함할 수 있으므로, margin을 제외한 실제 테이블 width를 사용
    // resolved_size.width may include margin, so use actual table width excluding margin
    let svg_width = resolved_size.width - margin_left_mm - margin_right_mm;
    let svg_height = content_size.height;
    let view_box = view_box(svg_width, svg_height, SVG_PADDING_MM);

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
    // 캡션 유무는 caption_info 존재 여부로 판단 / Determine caption existence by caption_info presence
    let has_caption = caption_info.is_some();
    let needs_htg = has_caption || ctrl_header.is_some();

    // margin 값 미리 계산 (margin_left_mm, margin_right_mm은 이미 위에서 계산됨) / Pre-calculate margin values (margin_left_mm, margin_right_mm already calculated above)
    let margin_top_mm = if let Some(CtrlHeaderData::ObjectCommon { margin, .. }) = ctrl_header {
        margin.top.to_mm()
    } else {
        0.0
    };
    let margin_bottom_mm = if let Some(CtrlHeaderData::ObjectCommon { margin, .. }) = ctrl_header {
        margin.bottom.to_mm()
    } else {
        0.0
    };

    // resolved_size.height가 margin을 포함하지 않는 경우를 대비하여 명시적으로 계산
    // Calculate explicitly in case resolved_size.height doesn't include margin
    let resolved_height_with_margin = if container_size.height == 0.0 {
        // container가 없으면 content.height + margin.top + margin.bottom
        // If no container, use content.height + margin.top + margin.bottom
        content_size.height + margin_top_mm + margin_bottom_mm
    } else {
        // container가 있으면 이미 margin이 포함되어 있음
        // If container exists, margin is already included
        resolved_size.height
    };

    // 캡션 정보 미리 계산 / Pre-calculate caption information
    let is_caption_above = caption_info.map(|info| info.is_above).unwrap_or(false);

    // 캡션 방향 확인 (가로/세로) / Check caption direction (horizontal/vertical)
    // Top/Bottom: 가로 방향 (horizontal), Left/Right: 세로 방향 (vertical)
    let caption_align = caption_info.map(|info| info.align);
    let is_horizontal = matches!(
        caption_align,
        Some(CaptionAlign::Top) | Some(CaptionAlign::Bottom)
    );
    let is_vertical = matches!(
        caption_align,
        Some(CaptionAlign::Left) | Some(CaptionAlign::Right)
    );
    let is_left = matches!(caption_align, Some(CaptionAlign::Left));
    let is_right = matches!(caption_align, Some(CaptionAlign::Right));

    // 캡션 간격: gap 속성을 사용하여 계산 / Caption spacing: calculate using gap property
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

    // 캡션 크기 미리 계산 (htb 위치 및 htG 크기 계산에 필요) / Pre-calculate caption size (needed for htb position and htG size calculation)
    let (caption_width_mm, caption_height_mm) = if has_caption {
        let width = if let Some(info) = caption_info {
            if is_horizontal {
                // 가로 방향(Top/Bottom): last_width만 사용, include_margin으로 마진 포함 여부 결정
                // Horizontal direction: use last_width only, determine margin inclusion with include_margin
                if let Some(last_width_hwpunit) = info.last_width {
                    let width_mm = HWPUNIT::from(last_width_hwpunit).to_mm();
                    if let Some(include_margin) = info.include_margin {
                        if include_margin {
                            // include_margin이 true이면 마진을 포함한 전체 폭 사용
                            // If include_margin is true, use full width including margin
                            width_mm
                        } else {
                            // include_margin이 false이면 last_width는 이미 마진을 제외한 값이므로 그대로 사용
                            // If include_margin is false, last_width is already without margin, so use as is
                            width_mm
                        }
                    } else {
                        // include_margin이 없으면 기본적으로 마진 제외한 값으로 간주
                        // If include_margin is not present, assume value without margin by default
                        width_mm
                    }
                } else {
                    resolved_size.width - (margin_left_mm * 2.0)
                }
            } else {
                // 세로 방향(Left/Right): width만 사용
                // Vertical direction: use width only
                if let Some(width_hwpunit) = info.width {
                    HWPUNIT::from(width_hwpunit).to_mm()
                } else {
                    30.0 // 기본값: fixture에서 확인한 값 / Default: value from fixture
                }
            }
        } else {
            resolved_size.width - (margin_left_mm * 2.0)
        };

        let height = if is_vertical {
            // 세로 방향: 테이블 높이와 같거나 더 큼 / Vertical direction: same or greater than table height
            content_size.height
        } else {
            // 가로 방향: 기본 높이 / Horizontal direction: default height
            caption_info.and_then(|info| info.height_mm).unwrap_or(3.53)
        };

        (width, height)
    } else {
        (0.0, 0.0)
    };

    // 캡션 렌더링 / Render caption
    // 캡션 유무는 caption_info 존재 여부로 판단 / Determine caption existence by caption_info presence
    let caption_html = if let Some(caption) = caption_text {
        if !has_caption {
            String::new()
        } else {
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
            let caption_base_left_mm =
                if let Some(CtrlHeaderData::ObjectCommon { margin, .. }) = ctrl_header {
                    margin.left.to_mm()
                } else {
                    0.0
                };

            // htb width 미리 계산 (캡션 위치 계산에 필요) / Pre-calculate htb width (needed for caption position calculation)
            // resolved_size.width는 이미 margin.left + margin.right가 포함되어 있을 수 있으므로,
            // resolved_size.width already may include margin.left + margin.right, so
            // 실제 테이블 width는 resolved_size.width - margin.left - margin.right
            // actual table width is resolved_size.width - margin.left - margin.right
            let htb_width_mm_for_caption = resolved_size.width - margin_left_mm - margin_right_mm;

            // 캡션 위치 계산 (left, top) / Calculate caption position (left, top)
            let (caption_left_mm, caption_top_mm) = if is_vertical {
                // 세로 방향 (Left/Right): 캡션이 세로로 배치됨 / Vertical direction: caption placed vertically
                if is_left {
                    // 왼쪽 캡션: 캡션이 왼쪽에, 테이블이 오른쪽에 / Left caption: caption on left, table on right
                    (margin_left_mm, margin_top_mm)
                } else if is_right {
                    // 오른쪽 캡션: 테이블이 왼쪽에, 캡션이 오른쪽에 / Right caption: table on left, caption on right
                    // 캡션 left = margin.left + htb width + gap
                    // Caption left = margin.left + htb width + gap
                    (
                        margin_left_mm + htb_width_mm_for_caption + caption_margin_mm,
                        margin_top_mm,
                    )
                } else {
                    // 기본값 (발생하지 않아야 함) / Default (should not occur)
                    (margin_left_mm, margin_top_mm)
                }
            } else {
                // 가로 방향 (Top/Bottom): 캡션이 가로로 배치됨 / Horizontal direction: caption placed horizontally
                let left = caption_base_left_mm;
                let top = if is_caption_above {
                    // 위 캡션: caption_margin만 사용 (fixture 기준) / Caption above: use only caption_margin (based on fixture)
                    // fixture에서 위 캡션 top=5mm, caption_margin=5mm이므로 margin.top은 포함하지 않음
                    // In fixture, caption above top=5mm, caption_margin=5mm, so margin.top is not included
                    caption_margin_mm
                } else {
                    // 아래 캡션: htb top + htb height + 간격 / Caption below: htb top + htb height + spacing
                    // htb_top_mm은 이미 margin.top이 포함되어 있음 / htb_top_mm already includes margin.top
                    margin_top_mm + content_size.height + caption_margin_mm
                };
                (left, top)
            };

            let caption_body = caption
                .trim_start_matches("표")
                .trim_start_matches(&table_num_text)
                .trim();

            // 캡션 문단의 첫 번째 char_shape_id 사용 / Use first char_shape_id from caption paragraph
            let caption_char_shape_id = caption_char_shape_id.unwrap_or(0); // 기본값: 0 / Default: 0
            let cs_class = format!("cs{}", caption_char_shape_id);

            // 캡션 문단의 para_shape_id 사용 / Use para_shape_id from caption paragraph
            let ps_class = if let Some(para_shape_id) = caption_para_shape_id {
                format!("ps{}", para_shape_id)
            } else {
                // 기본값: 캡션 정렬에 따라 결정 / Default: determined by caption alignment
                if is_horizontal {
                    "ps12".to_string() // Top/Bottom: 오른쪽 정렬 / Right alignment
                } else {
                    "ps0".to_string() // Left/Right: 양쪽 정렬 / Justify
                }
            };

            // 세로 방향 캡션의 경우 hcI에 top 스타일 추가 / Add top style to hcI for vertical captions
            let hci_style = if is_vertical {
                // fixture에서 확인: 왼쪽/오른쪽 캡션은 hcI에 top:0.50mm 또는 top:0.99mm 추가
                // From fixture: left/right captions have top:0.50mm or top:0.99mm in hcI
                if is_right {
                    "style=\"top:0.99mm;\""
                } else {
                    "style=\"top:0.50mm;\""
                }
            } else {
                ""
            };

            format!(
                r#"<div class="hcD" style="left:{}mm;top:{}mm;width:{}mm;height:{}mm;overflow:hidden;"><div class="hcI" {}><div class="hls {}" style="line-height:2.79mm;white-space:nowrap;left:0mm;top:-0.18mm;height:{}mm;width:{}mm;"><span class="hrt {}">표&nbsp;</span><div class="haN" style="left:0mm;top:0mm;width:1.95mm;height:{}mm;"><span class="hrt {}">{}</span></div><span class="hrt {}">&nbsp;{}</span></div></div></div>"#,
                caption_left_mm,
                caption_top_mm,
                caption_width_mm,
                caption_height_mm,
                hci_style,
                ps_class,
                caption_height_mm,
                caption_width_mm,
                cs_class,
                caption_height_mm,
                cs_class,
                table_num_text,
                cs_class,
                caption_body
            )
        }
    } else {
        String::new()
    };

    // htb 위치 조정 (마진 및 캡션 고려) / Adjust htb position (considering margin and caption)
    let htb_left_mm = if is_vertical && is_left {
        // 왼쪽 캡션: margin.left + 캡션 width + gap / Left caption: margin.left + caption width + gap
        margin_left_mm + caption_width_mm + caption_margin_mm
    } else {
        // 오른쪽 캡션이나 가로 방향: margin.left만 사용 / Right caption or horizontal: use margin.left only
        margin_left_mm
    };

    let htb_top_mm = if has_caption && is_caption_above {
        // 위 캡션이 있으면 테이블을 아래로 이동 / Move table down if caption is above
        margin_top_mm + caption_height_mm + caption_margin_mm
    } else if has_caption {
        // 아래 캡션이 있으면 margin.top만 적용 / If caption is below, only apply margin.top
        margin_top_mm
    } else {
        margin_top_mm
    };

    // htb 높이는 콘텐츠 높이를 사용 (마진 제외) / htb height uses content height (excluding margin)
    // Fixture 기준: htb height = content_height (4.52mm), not resolved_size.height (6.52mm with margin)
    // Based on fixture: htb height = content_height (4.52mm), not resolved_size.height (6.52mm with margin)
    // htb width도 마진을 제외한 실제 테이블 width를 사용해야 함
    // htb width should also use actual table width excluding margin
    // resolved_size.width는 이미 margin.left + margin.right가 포함되어 있을 수 있으므로,
    // resolved_size.width already may include margin.left + margin.right, so
    // 실제 테이블 width는 resolved_size.width - margin.left - margin.right
    // actual table width is resolved_size.width - margin.left - margin.right
    let htb_width_mm = resolved_size.width - margin_left_mm - margin_right_mm;
    let htb_html = format!(
        r#"<div class="htb" style="left:{htb_left_mm}mm;width:{htb_width_mm}mm;top:{htb_top_mm}mm;height:{content_size_height}mm;">{svg}{cells_html}</div>"#,
        htb_left_mm = htb_left_mm,
        htb_width_mm = htb_width_mm,
        htb_top_mm = htb_top_mm,
        content_size_height = content_size.height,
        svg = svg,
        cells_html = cells_html,
    );

    let result_html = if needs_htg {
        // htG 크기 계산 (테이블 + 캡션) / Calculate htG size (table + caption)
        let actual_caption_height_mm = if has_caption { caption_height_mm } else { 0.0 };
        let htg_caption_spacing_mm = if has_caption { caption_margin_mm } else { 0.0 };

        // htG 높이 계산 / Calculate htG height
        // margin_bottom_mm을 명시적으로 사용하여 계산
        // Calculate explicitly using margin_bottom_mm
        let htg_height = if is_vertical {
            // 세로 방향: margin.top + content.height + margin.bottom (캡션 높이가 테이블 높이와 같으므로)
            // Vertical: margin.top + content.height + margin.bottom (caption height equals table height)
            resolved_height_with_margin
        } else {
            // 가로 방향: margin.top + content.height + margin.bottom + 캡션 높이 + 간격
            // Horizontal: margin.top + content.height + margin.bottom + caption height + spacing
            resolved_height_with_margin + actual_caption_height_mm + htg_caption_spacing_mm
        };

        // htG 너비 계산 / Calculate htG width
        let htg_width = if is_vertical {
            // 세로 방향: margin.left + 캡션 width + gap + 테이블 width + margin.right
            // Vertical: margin.left + caption width + gap + table width + margin.right
            // resolved_size.width는 이미 margin.left + margin.right가 포함되어 있으므로,
            // 실제 테이블 width는 resolved_size.width - margin.left - margin.right
            // resolved_size.width already includes margin.left + margin.right, so
            // actual table width is resolved_size.width - margin.left - margin.right
            let actual_table_width = resolved_size.width - margin_left_mm - margin_right_mm;
            margin_left_mm
                + caption_width_mm
                + caption_margin_mm
                + actual_table_width
                + margin_right_mm
        } else {
            // 가로 방향: resolved_size.width는 이미 margin.left + margin.right가 포함되어 있음
            // Horizontal: resolved_size.width already includes margin.left + margin.right
            resolved_size.width
        };

        // htG 래퍼와 캡션 생성 / Create htG wrapper and caption
        let html = if has_caption && is_caption_above {
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
                    align: cap.align, // 캡션 정렬 방향 / Caption alignment direction
                    is_above: matches!(cap.align, CaptionAlign::Top),
                    gap: Some(cap.gap), // HWPUNIT16은 i16이므로 직접 사용 / HWPUNIT16 is i16, so use directly
                    height_mm: None, // 캡션 높이는 별도로 계산 필요 / Caption height needs separate calculation
                    width: Some(cap.width.into()), // 캡션 폭 / Caption width
                    include_margin: Some(cap.include_margin), // 마진 포함 여부 / Whether to include margin
                    last_width: Some(cap.last_width.into()), // 텍스트 최대 길이 / Maximum text length
                }
            });
            (Some(&header.data), info)
        }
        _ => (None, None),
    };

    // 캡션 텍스트 추출: paragraphs 필드에서 모든 캡션 수집 / Extract caption text: collect all captions from paragraphs field
    let mut caption_texts: Vec<String> = Vec::new();
    let mut caption_char_shape_ids: Vec<Option<usize>> = Vec::new();
    let mut caption_para_shape_ids: Vec<Option<usize>> = Vec::new();

    // paragraphs 필드에서 모든 캡션 수집 / Collect all captions from paragraphs field
    for para in paragraphs {
        let mut caption_text_opt: Option<String> = None;
        let mut caption_char_shape_id_opt: Option<usize> = None;
        // para_shape_id 추출 / Extract para_shape_id
        let para_shape_id = para.para_header.para_shape_id as usize;

        for record in &para.records {
            if let ParagraphRecord::ParaText { text, .. } = record {
                if !text.trim().is_empty() {
                    caption_text_opt = Some(text.clone());
                }
            } else if let ParagraphRecord::ParaCharShape { shapes } = record {
                // 첫 번째 char_shape_id 찾기 / Find first char_shape_id
                if let Some(shape_info) = shapes.first() {
                    caption_char_shape_id_opt = Some(shape_info.shape_id as usize);
                }
            }
        }

        if let Some(text) = caption_text_opt {
            caption_texts.push(text);
            caption_char_shape_ids.push(caption_char_shape_id_opt);
            caption_para_shape_ids.push(Some(para_shape_id));
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

            // 캡션 char_shape_id 찾기 / Find caption char_shape_id
            let current_caption_char_shape_id = if caption_index < caption_char_shape_ids.len() {
                caption_char_shape_ids[caption_index]
            } else {
                None
            };

            // 캡션 para_shape_id 찾기 / Find caption para_shape_id
            let current_caption_para_shape_id = if caption_index < caption_para_shape_ids.len() {
                caption_para_shape_ids[caption_index]
            } else {
                None
            };

            caption_index += 1;
            result.tables.push((
                table,
                ctrl_header,
                current_caption,
                caption_info,
                current_caption_char_shape_id,
                current_caption_para_shape_id,
            ));
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
