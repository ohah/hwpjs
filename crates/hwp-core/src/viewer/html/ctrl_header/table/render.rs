use crate::document::bodytext::ctrl_header::{CaptionAlign, CaptionVAlign, CtrlHeaderData};
use crate::document::bodytext::{
    ControlChar, ControlCharPosition, LineSegmentInfo, PageDef, Table,
};
use crate::types::{Hwpunit16ToMm, HWPUNIT};
use crate::viewer::html::styles::{int32_to_mm, round_to_2dp};
use crate::viewer::HtmlOptions;
use crate::{HwpDocument, INT32};

use super::constants::SVG_PADDING_MM;
use super::position::{table_position, view_box};
use super::size::{content_size, htb_size, resolve_container_size};
use super::{cells, svg};

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
    /// 캡션 수직 정렬 (조합 캡션 구분용) / Caption vertical alignment (for combination caption detection)
    pub vertical_align: Option<CaptionVAlign>,
}

/// 캡션 텍스트 구조 / Caption text structure
#[derive(Debug, Clone)]
pub struct CaptionText {
    /// 캡션 라벨 (예: "표") / Caption label (e.g., "표")
    pub label: String,
    /// 캡션 번호 (예: "1", "2") / Caption number (e.g., "1", "2")
    pub number: String,
    /// 캡션 본문 (예: "위 캡션", "왼쪽") / Caption body (e.g., "위 캡션", "왼쪽")
    pub body: String,
}

/// 캡션 데이터 구조체 / Caption data struct
/// 캡션과 관련된 모든 정보를 하나로 묶음 / Bundles all caption-related information
#[derive(Debug, Clone)]
pub struct CaptionData<'a> {
    pub text: CaptionText,
    pub info: CaptionInfo,
    pub char_shape_id: usize,
    pub para_shape_id: usize,
    pub line_segments: Vec<&'a LineSegmentInfo>, // 모든 LineSegment를 저장 / Store all LineSegments
    pub original_text: String, // 원본 텍스트 (control characters 제거된 cleaned 텍스트) / Original text (cleaned text with control characters removed)
    pub control_char_positions: Vec<ControlCharPosition>, // 컨트롤 문자 위치 (원본 WCHAR 인덱스 기준) / Control character positions (original WCHAR index)
    pub auto_number_position: Option<usize>,              // AUTO_NUMBER 위치 / AUTO_NUMBER position
    pub auto_number_display_text: Option<String>, // AUTO_NUMBER 표시 텍스트 / AUTO_NUMBER display text
}

/// 테이블 렌더링 컨텍스트 / Table rendering context
pub struct TableRenderContext<'a> {
    pub document: &'a HwpDocument,
    pub ctrl_header: Option<&'a CtrlHeaderData>,
    pub page_def: Option<&'a PageDef>,
    pub options: &'a HtmlOptions,
    pub table_number: Option<u32>,
    pub pattern_counter: &'a mut usize,
    pub color_to_pattern: &'a mut std::collections::HashMap<u32, String>,
}

/// 테이블 위치 정보 / Table position information
#[derive(Debug, Clone, Copy)]
pub struct TablePosition {
    pub hcd_position: Option<(f64, f64)>,
    pub segment_position: Option<(INT32, INT32)>,
    pub para_start_vertical_mm: Option<f64>,
    pub para_start_column_mm: Option<f64>,
    pub para_segment_width_mm: Option<f64>,
    pub first_para_vertical_mm: Option<f64>,
}

/// 테이블을 HTML로 렌더링 / Render table to HTML
pub fn render_table(
    table: &Table,
    context: &mut TableRenderContext,
    position: TablePosition,
    caption: Option<&CaptionData>,
) -> String {
    // 구조체에서 개별 값 추출 / Extract individual values from structs
    let document = context.document;
    let ctrl_header = context.ctrl_header;
    let page_def = context.page_def;
    let _options = context.options;
    let table_number = context.table_number;
    // pattern_counter와 color_to_pattern은 이미 &mut이므로 직접 사용 / pattern_counter and color_to_pattern are already &mut, so use directly

    let hcd_position = position.hcd_position;
    let segment_position = position.segment_position;
    let para_start_vertical_mm = position.para_start_vertical_mm;
    let para_start_column_mm = position.para_start_column_mm;
    let para_segment_width_mm = position.para_segment_width_mm;
    let first_para_vertical_mm = position.first_para_vertical_mm;

    // 캡션 데이터에서 개별 필드 추출 / Extract individual fields from caption data
    let caption_text = caption.as_ref().map(|c| &c.text);
    let caption_info = caption.as_ref().map(|c| c.info);
    let caption_char_shape_id = caption.as_ref().map(|c| c.char_shape_id);
    let caption_para_shape_id = caption.as_ref().map(|c| c.para_shape_id);
    let caption_line_segments = caption.as_ref().map(|c| &c.line_segments);
    let caption_original_text = caption.as_ref().map(|c| &c.original_text);
    let caption_control_char_positions = caption.as_ref().map(|c| &c.control_char_positions);
    let caption_auto_number_position = caption.as_ref().and_then(|c| c.auto_number_position);
    let caption_auto_number_display_text = caption
        .as_ref()
        .and_then(|c| c.auto_number_display_text.clone());

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
    let margin_left_mm = round_to_2dp(margin_left_mm);
    let margin_right_mm = if let Some(CtrlHeaderData::ObjectCommon { margin, .. }) = ctrl_header {
        margin.right.to_mm()
    } else {
        0.0
    };
    let margin_right_mm = round_to_2dp(margin_right_mm);

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
        context.pattern_counter, // 문서 레벨 pattern_counter 전달 / Pass document-level pattern_counter
        context.color_to_pattern, // 문서 레벨 color_to_pattern 전달 / Pass document-level color_to_pattern
    );
    let cells_html = cells::render_cells(
        table,
        ctrl_header_height_mm,
        document,
        _options,
        context.pattern_counter,
        context.color_to_pattern,
    );
    let (mut left_mm, mut top_mm) = table_position(
        hcd_position,
        page_def,
        segment_position,
        ctrl_header,
        Some(resolved_size.width),
        para_start_vertical_mm,
        para_start_column_mm,
        para_segment_width_mm,
        first_para_vertical_mm,
    );

    // htG 래퍼 생성 (캡션이 있거나 ctrl_header가 있는 경우) / Create htG wrapper (if caption exists or ctrl_header exists)
    // 캡션 유무는 caption_info 존재 여부로 판단 / Determine caption existence by caption_info presence
    let has_caption = caption_info.is_some();
    // LineSegment(=글자처럼 취급/인라인) 테이블 처리
    // - 일부 fixture(noori 등)에서는 htG 없이 htb만 존재하지만,
    // - table-position 처럼 "캡션이 있는 인라인 테이블"은 htG 래퍼가 필요(캡션 블록이 htG 하위로 들어감)
    // 따라서: LineSegment 내부라도 캡션이 있으면 htG를 생성한다.
    let is_inline_table = segment_position.is_some();
    let needs_htg = if is_inline_table {
        has_caption
    } else {
        has_caption || ctrl_header.is_some()
    };

    // 인라인 테이블은 문단(line segment) 내부에서 상대 위치로 렌더링되므로,
    // htG의 left/top은 0으로 고정해야 fixture와 일치한다.
    if is_inline_table && needs_htg {
        left_mm = 0.0;
        top_mm = 0.0;
    }

    // margin 값 미리 계산 (margin_left_mm, margin_right_mm은 이미 위에서 계산됨) / Pre-calculate margin values (margin_left_mm, margin_right_mm already calculated above)
    let margin_top_mm = if let Some(CtrlHeaderData::ObjectCommon { margin, .. }) = ctrl_header {
        margin.top.to_mm()
    } else {
        0.0
    };
    let margin_top_mm = round_to_2dp(margin_top_mm);
    let margin_bottom_mm = if let Some(CtrlHeaderData::ObjectCommon { margin, .. }) = ctrl_header {
        margin.bottom.to_mm()
    } else {
        0.0
    };
    let margin_bottom_mm = round_to_2dp(margin_bottom_mm);

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
            // 가로 방향: 여러 LineSegment가 있으면 전체 높이 계산 / Horizontal direction: calculate total height if multiple LineSegments
            if let Some(segments) = caption_line_segments {
                if segments.len() > 1 {
                    // 마지막 LineSegment의 vertical_position + line_height를 사용 / Use last segment's vertical_position + line_height
                    if let Some(last_segment) = segments.last() {
                        let last_vertical_mm =
                            round_to_2dp(int32_to_mm(last_segment.vertical_position));
                        let last_line_height_mm =
                            round_to_2dp(int32_to_mm(last_segment.line_height));
                        round_to_2dp(last_vertical_mm + last_line_height_mm)
                    } else {
                        caption_info.and_then(|info| info.height_mm).unwrap_or(3.53)
                    }
                } else if let Some(segment) = segments.first() {
                    // 단일 LineSegment: line_height 사용 / Single LineSegment: use line_height
                    round_to_2dp(int32_to_mm(segment.line_height))
                } else {
                    caption_info.and_then(|info| info.height_mm).unwrap_or(3.53)
                }
            } else {
                // LineSegment 정보가 없으면 기본 높이 / Default height if no LineSegment info
                caption_info.and_then(|info| info.height_mm).unwrap_or(3.53)
            }
        };

        (round_to_2dp(width), round_to_2dp(height))
    } else {
        (0.0, 0.0)
    };

    // 캡션 렌더링 / Render caption
    // 캡션 유무는 caption_info 존재 여부로 판단 / Determine caption existence by caption_info presence
    let caption_html = if let Some(caption) = caption_text {
        if !has_caption {
            String::new()
        } else {
            // 분해된 캡션 텍스트 사용 / Use parsed caption text
            let caption_label = if !caption.label.is_empty() {
                caption.label.clone()
            } else {
                "표".to_string() // 기본값 / Default
            };
            let table_num_text = if !caption.number.is_empty() {
                caption.number.clone()
            } else {
                table_number.map(|n| n.to_string()).unwrap_or_default()
            };
            let caption_body = caption.body.clone();

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
            let (mut caption_left_mm, mut caption_top_mm) = if is_vertical {
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
                    // 위 캡션:
                    //  - 캡션의 기준 위치는 객체 margin.top / For top captions, base position is object margin.top
                    //  - 캡션과 표 사이 여백(gap)은 이미 htb_top_mm 계산에서 caption_margin_mm(= gap)으로 반영됨
                    //    The gap between caption and table (caption.gap) is already applied via caption_margin_mm in htb_top_mm
                    //
                    // 따라서 hcD top은 gap과는 독립적으로 margin.top 값을 그대로 사용해야 함
                    // So hcD top should simply use margin.top, without any magic constant like 3mm
                    margin_top_mm
                } else {
                    // 아래 캡션: htb top + htb height + 간격 / Caption below: htb top + htb height + spacing
                    // htb_top_mm은 이미 margin.top이 포함되어 있음 / htb_top_mm already includes margin.top
                    margin_top_mm + content_size.height + caption_margin_mm
                };
                (left, top)
            };

            // 캡션 위치를 mm 2자리까지 반올림 / Round caption position to 2 decimal places
            caption_left_mm = round_to_2dp(caption_left_mm);
            caption_top_mm = round_to_2dp(caption_top_mm);

            // 캡션 문단의 첫 번째 char_shape_id 사용 / Use first char_shape_id from caption paragraph
            let caption_char_shape_id_value = caption_char_shape_id.unwrap_or(0); // 기본값: 0 / Default: 0
            let cs_class = format!("cs{}", caption_char_shape_id_value);

            // 캡션 문단의 para_shape_id 사용 / Use para_shape_id from caption paragraph
            // document.doc_info.para_shapes에서 실제 ParaShape를 확인하여 ID로 추출
            // Extract ID by checking actual ParaShape from document.doc_info.para_shapes
            let ps_class = if let Some(para_shape_id) = caption_para_shape_id {
                // HWP 파일의 para_shape_id는 0-based indexing을 사용합니다 / HWP file uses 0-based indexing for para_shape_id
                if para_shape_id < document.doc_info.para_shapes.len() {
                    format!("ps{}", para_shape_id)
                } else {
                    String::new()
                }
            } else {
                String::new()
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

            // 원본 텍스트 사용 (없으면 fallback) / Use original text (fallback if not available)
            // fallback 텍스트를 먼저 생성하여 수명 문제 해결 / Create fallback text first to resolve lifetime issue
            let fallback_text = format!("{} {} {}", caption_label, table_num_text, caption_body);
            let full_caption_text = caption_original_text
                .map(|s| s.as_str())
                .unwrap_or_else(|| fallback_text.as_str());

            // 각 LineSegment를 별도의 hls div로 렌더링 / Render each LineSegment as separate hls div
            let hls_divs = if let Some(segments) = caption_line_segments {
                if segments.is_empty() {
                    // LineSegment가 없으면 fallback / Fallback if no LineSegments
                    let (line_height_mm, top_offset_mm, caption_hls_left_mm, caption_hls_width_mm) =
                        (2.79, -0.18, 0.0, caption_width_mm);
                    vec![format!(
                        r#"<div class="hls {ps_class}" style="line-height:{line_height_mm}mm;white-space:nowrap;left:{caption_hls_left_mm}mm;top:{top_offset_mm}mm;height:{caption_height_mm}mm;width:{caption_hls_width_mm}mm;"><span class="hrt {cs_class}">{caption_label}&nbsp;</span><div class="haN" style="left:0mm;top:0mm;height:{caption_height_mm}mm;"><span class="hrt {cs_class}">{table_num_text}</span></div><span class="hrt {cs_class}">&nbsp;{caption_body}</span></div>"#,
                        ps_class = ps_class,
                        line_height_mm = line_height_mm,
                        top_offset_mm = top_offset_mm,
                        caption_hls_left_mm = caption_hls_left_mm,
                        caption_height_mm = caption_height_mm,
                        caption_hls_width_mm = caption_hls_width_mm,
                        cs_class = cs_class,
                        caption_label = caption_label,
                        table_num_text = table_num_text,
                        caption_body = caption_body
                    )]
                } else {
                    // 각 LineSegment에 대해 텍스트 분할 및 렌더링 / Split text and render for each LineSegment
                    let mut hls_htmls = Vec::new();

                    // control_char_positions 가져오기 (원본 텍스트 인덱스 변환에 필요) / Get control_char_positions (needed for original text index conversion)
                    let control_char_positions = caption_control_char_positions
                        .map(|v| v.as_slice())
                        .unwrap_or(&[]);

                    // 원본 텍스트 길이 (컨트롤 문자 포함) / Original text length (including control characters)
                    // 원본 텍스트는 이미 컨트롤 문자가 제거된 상태이므로, 컨트롤 문자 크기를 더해야 함
                    // Original text already has control characters removed, so need to add control character sizes
                    let original_text_len = full_caption_text.chars().count()
                        + control_char_positions
                            .iter()
                            .map(|cc| ControlChar::get_size_by_code(cc.code) as usize)
                            .sum::<usize>();

                    // line_segment.rs의 함수와 동일한 로직 사용 / Use same logic as line_segment.rs
                    // line_segment.rs와 동일한 로직 사용 / Use same logic as line_segment.rs
                    fn original_to_cleaned_index(
                        pos: usize,
                        control_chars: &[ControlCharPosition],
                    ) -> isize {
                        let mut delta: isize = 0;
                        for cc in control_chars.iter() {
                            if cc.position >= pos {
                                break;
                            }
                            let size = ControlChar::get_size_by_code(cc.code) as isize;
                            let contributes = if ControlChar::is_convertible(cc.code)
                                && cc.code != ControlChar::PARA_BREAK
                                && cc.code != ControlChar::LINE_BREAK
                            {
                                1
                            } else {
                                0
                            } as isize;
                            delta += contributes - size;
                        }
                        delta
                    }

                    fn slice_cleaned_by_original_range(
                        cleaned: &str,
                        control_chars: &[ControlCharPosition],
                        start_original: usize,
                        end_original: usize,
                    ) -> String {
                        let start_delta = original_to_cleaned_index(start_original, control_chars);
                        let end_delta = original_to_cleaned_index(end_original, control_chars);

                        let start_cleaned = (start_original as isize + start_delta).max(0) as usize;
                        let end_cleaned = (end_original as isize + end_delta).max(0) as usize;

                        let cleaned_chars: Vec<char> = cleaned.chars().collect();
                        let s = start_cleaned.min(cleaned_chars.len());
                        let e = end_cleaned.min(cleaned_chars.len());
                        if s >= e {
                            return String::new();
                        }
                        cleaned_chars[s..e].iter().collect()
                    }

                    for (idx, segment) in segments.iter().enumerate() {
                        let lh = round_to_2dp(int32_to_mm(segment.baseline_distance));
                        let text_height_mm = round_to_2dp(int32_to_mm(segment.text_height));
                        let top_off = round_to_2dp((lh - text_height_mm) / 2.0);
                        let left_mm = round_to_2dp(int32_to_mm(segment.column_start_position));
                        let width_mm = round_to_2dp(int32_to_mm(segment.segment_width));

                        // vertical_position을 mm로 변환 / Convert vertical_position to mm
                        // 첫 번째 LineSegment는 top_off만 사용, 이후는 vertical_position을 직접 사용
                        // First LineSegment uses only top_off, others use vertical_position directly
                        let segment_top_mm = if idx == 0 {
                            round_to_2dp(top_off)
                        } else {
                            // 이후 LineSegment는 vertical_position을 mm로 변환하여 사용
                            // Subsequent LineSegments use vertical_position converted to mm
                            round_to_2dp(int32_to_mm(segment.vertical_position))
                        };

                        // text_start_position을 기준으로 텍스트 분할 (원본 WCHAR 인덱스 기준) / Split text based on text_start_position (original WCHAR index)
                        let start_pos = segment.text_start_position as usize;
                        let end_pos = if idx + 1 < segments.len() {
                            segments[idx + 1].text_start_position as usize
                        } else {
                            original_text_len
                        };

                        // 원본 텍스트 인덱스를 cleaned 텍스트 인덱스로 변환 / Convert original text index to cleaned text index
                        let segment_text = slice_cleaned_by_original_range(
                            full_caption_text,
                            &control_char_positions,
                            start_pos,
                            end_pos,
                        );

                        // 첫 번째 LineSegment에만 label과 number 포함 / Include label and number only in first LineSegment
                        let hls_content = if idx == 0 {
                            // 첫 번째 segment: AUTO_NUMBER 위치를 고려하여 분할 / First segment: split considering AUTO_NUMBER position
                            if let Some(auto_pos) = caption_auto_number_position {
                                if segment_text.chars().count() > auto_pos {
                                    let before_num: String =
                                        segment_text.chars().take(auto_pos).collect();
                                    let after_num: String =
                                        segment_text.chars().skip(auto_pos + 1).collect();
                                    let num_text = caption_auto_number_display_text
                                        .as_deref()
                                        .unwrap_or(&table_num_text);
                                    format!(
                                        r#"<span class="hrt {cs_class}">{before_num}&nbsp;</span><div class="haN" style="left:0mm;top:0mm;height:{caption_height_mm}mm;"><span class="hrt {cs_class}">{num_text}</span></div><span class="hrt {cs_class}">&nbsp;{after_num}</span>"#,
                                        cs_class = cs_class,
                                        before_num = before_num.trim(),
                                        caption_height_mm = caption_height_mm,
                                        num_text = num_text,
                                        after_num = after_num
                                    )
                                } else {
                                    // AUTO_NUMBER 위치가 텍스트 범위를 벗어남 / AUTO_NUMBER position out of range
                                    format!(
                                        r#"<span class="hrt {cs_class}">{caption_label}&nbsp;</span><div class="haN" style="left:0mm;top:0mm;height:{caption_height_mm}mm;"><span class="hrt {cs_class}">{table_num_text}</span></div><span class="hrt {cs_class}">&nbsp;{caption_body}</span>"#,
                                        cs_class = cs_class,
                                        caption_label = caption_label,
                                        caption_height_mm = caption_height_mm,
                                        table_num_text = table_num_text,
                                        caption_body = caption_body
                                    )
                                }
                            } else {
                                // AUTO_NUMBER 위치가 없으면 fallback / Fallback if no AUTO_NUMBER position
                                format!(
                                    r#"<span class="hrt {cs_class}">{caption_label}&nbsp;</span><div class="haN" style="left:0mm;top:0mm;height:{caption_height_mm}mm;"><span class="hrt {cs_class}">{table_num_text}</span></div><span class="hrt {cs_class}">&nbsp;{caption_body}</span>"#,
                                    cs_class = cs_class,
                                    caption_label = caption_label,
                                    caption_height_mm = caption_height_mm,
                                    table_num_text = table_num_text,
                                    caption_body = caption_body
                                )
                            }
                        } else {
                            // 나머지 segment: body의 나머지 부분만 / Remaining segments: only remaining part of body
                            format!(
                                r#"<span class="hrt {cs_class}">{segment_text}</span>"#,
                                cs_class = cs_class,
                                segment_text = segment_text
                            )
                        };

                        hls_htmls.push(format!(
                            r#"<div class="hls {ps_class}" style="line-height:{lh}mm;white-space:nowrap;left:{left_mm}mm;top:{segment_top_mm}mm;height:{caption_height_mm}mm;width:{width_mm}mm;">{hls_content}</div>"#,
                            ps_class = ps_class,
                            lh = lh,
                            left_mm = left_mm,
                            segment_top_mm = segment_top_mm,
                            caption_height_mm = caption_height_mm,
                            width_mm = width_mm,
                            hls_content = hls_content
                        ));
                    }
                    hls_htmls
                }
            } else {
                // LineSegment 정보가 없으면 fallback / Fallback if no LineSegment info
                let (line_height_mm, top_offset_mm, caption_hls_left_mm, caption_hls_width_mm) =
                    (2.79, -0.18, 0.0, caption_width_mm);
                vec![format!(
                    r#"<div class="hls {ps_class}" style="line-height:{line_height_mm}mm;white-space:nowrap;left:{caption_hls_left_mm}mm;top:{top_offset_mm}mm;height:{caption_height_mm}mm;width:{caption_hls_width_mm}mm;"><span class="hrt {cs_class}">{caption_label}&nbsp;</span><div class="haN" style="left:0mm;top:0mm;height:{caption_height_mm}mm;"><span class="hrt {cs_class}">{table_num_text}</span></div><span class="hrt {cs_class}">&nbsp;{caption_body}</span></div>"#,
                    ps_class = ps_class,
                    line_height_mm = line_height_mm,
                    top_offset_mm = top_offset_mm,
                    caption_hls_left_mm = caption_hls_left_mm,
                    caption_height_mm = caption_height_mm,
                    caption_hls_width_mm = caption_hls_width_mm,
                    cs_class = cs_class,
                    caption_label = caption_label,
                    table_num_text = table_num_text,
                    caption_body = caption_body
                )]
            };

            // 모든 hls div를 하나의 hcI로 묶기 / Wrap all hls divs in one hcI
            let hls_html = hls_divs.join("");

            format!(
                r#"<div class="hcD" style="left:{caption_left_mm}mm;top:{caption_top_mm}mm;width:{caption_width_mm}mm;height:{caption_height_mm}mm;overflow:hidden;"><div class="hcI" {hci_style}>{hls_html}</div></div>"#,
                caption_left_mm = caption_left_mm,
                caption_top_mm = caption_top_mm,
                caption_width_mm = caption_width_mm,
                caption_height_mm = caption_height_mm,
                hci_style = hci_style,
                hls_html = hls_html
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
    // actual table width is resolved_size.width - margin.left - margin_right
    let htb_width_mm = resolved_size.width - margin_left_mm - margin_right_mm;
    let htb_left_mm = round_to_2dp(htb_left_mm);
    let htb_top_mm = round_to_2dp(htb_top_mm);
    let htb_width_mm = round_to_2dp(htb_width_mm);
    // fixture(noori.html/table*.html)처럼 height도 2dp로 고정해서 출력 값 흔들림(221.19 vs 221.2)을 방지
    let content_height_mm = round_to_2dp(content_size.height);
    // NOTE (fixture 기준):
    // - LineSegment(글자처럼 취급) 내부 테이블은 htG가 inline-block/relative로 동작하고,
    //   htb 자체에는 display/position/vertical-align 스타일을 주지 않습니다. (table-position.html)
    // - 그 외 케이스는 htb를 inline-block/relative로 두는 레이아웃이 존재합니다.
    let htb_extra_style = if is_inline_table && needs_htg {
        ""
    } else {
        "display:inline-block;position:relative;vertical-align:middle;"
    };
    let htb_html = format!(
        r#"<div class="htb" style="left:{htb_left_mm}mm;width:{htb_width_mm}mm;top:{htb_top_mm}mm;height:{content_height_mm}mm;{htb_extra_style}">{svg}{cells_html}</div>"#,
        htb_left_mm = htb_left_mm,
        htb_width_mm = htb_width_mm,
        htb_top_mm = htb_top_mm,
        content_height_mm = content_height_mm,
        htb_extra_style = htb_extra_style,
        svg = svg,
        cells_html = cells_html,
    );

    // table-caption.html fixture 기준으로, 수직 캡션(Left/Right)이 있는 표의 htG top은
    // like_letters 기준 위치보다 한 줄(line) 만큼 아래에 배치됩니다.
    // 단, vertical_align이 "bottom"인 조합 캡션(오른쪽 아래)의 경우에는 오프셋을 적용하지 않습니다.
    //
    // fixture 분석:
    // - 표3 (왼쪽, vertical_align: middle): 오프셋 필요
    // - 표4 (오른쪽, vertical_align: middle): 오프셋 필요
    // - 표5 (왼쪽 위, vertical_align: top): 오프셋 필요
    // - 표6 (오른쪽 아래, vertical_align: bottom): 오프셋 불필요
    //
    // According to table-caption.html fixture, htG top for tables with vertical captions (Left/Right)
    // is placed one line below the like_letters reference position.
    // However, for combination captions with vertical_align "bottom" (right bottom), the offset is not applied.
    //
    // Fixture analysis:
    // - Table 3 (left, vertical_align: middle): offset needed
    // - Table 4 (right, vertical_align: middle): offset needed
    // - Table 5 (left top, vertical_align: top): offset needed
    // - Table 6 (right bottom, vertical_align: bottom): offset not needed
    //
    // htG's top is calculated in table_position(), so
    // when a vertical caption exists and vertical_align is not "bottom", we add one line height to htG's top to match the fixture position.

    // vertical_align이 "bottom"이 아닌 모든 수직 캡션에 오프셋 적용
    // Apply offset to all vertical captions where vertical_align is not "bottom"
    let should_apply_offset = if let Some(info) = caption_info {
        if let Some(vertical_align) = info.vertical_align {
            // vertical_align이 "bottom"이 아니면 오프셋 적용 / Apply offset if vertical_align is not "bottom"
            vertical_align != CaptionVAlign::Bottom
        } else {
            // vertical_align이 없으면 오프셋 적용 (기본값) / Apply offset if vertical_align is not available (default)
            true
        }
    } else {
        false
    };

    if needs_htg && has_caption && is_vertical && should_apply_offset {
        // 한 줄 높이 계산: caption_line_segments의 첫 번째 segment의 line_height + line_spacing 사용
        // Calculate line height: use line_height + line_spacing from first segment in caption_line_segments
        // line_height는 줄의 높이를, line_spacing은 줄 간격을 나타냅니다.
        // line_height represents the line height, and line_spacing represents the line spacing.
        let line_height_offset_mm = if let Some(segments) = caption_line_segments {
            if let Some(segment) = segments.first() {
                let line_height_mm = round_to_2dp(int32_to_mm(segment.line_height));
                let line_spacing_mm = round_to_2dp(int32_to_mm(segment.line_spacing));
                round_to_2dp(line_height_mm + line_spacing_mm)
            } else {
                // LineSegmentInfo가 없으면 기본값 사용 (일반적인 한 줄 높이)
                // Use default value if LineSegmentInfo is not available (typical line height)
                5.47
            }
        } else {
            // LineSegmentInfo가 없으면 기본값 사용 (일반적인 한 줄 높이)
            // Use default value if LineSegmentInfo is not available (typical line height)
            5.47
        };
        top_mm += line_height_offset_mm;
    }

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
            // actual table width is resolved_size.width - margin.left - margin_right
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

        // htG 크기를 mm 2자리까지 반올림 / Round htG size to 2 decimal places
        let htg_height = round_to_2dp(htg_height);
        let htg_width = round_to_2dp(htg_width);

        // htG 래퍼와 캡션 생성 / Create htG wrapper and caption
        // 인라인 테이블의 htG는 htb와 동일하게 inline-block/relative/vertical-align 스타일을 가져야 한다.
        let inline_htg_style = if is_inline_table {
            "display:inline-block;position:relative;vertical-align:middle;"
        } else {
            ""
        };
        let html = if has_caption && is_caption_above {
            // 위 캡션: 캡션 먼저, 그 다음 테이블 / Caption above: caption first, then table
            format!(
                r#"<div class="htG" style="left:{left_mm}mm;width:{htg_width}mm;top:{top_mm}mm;height:{htg_height}mm;{inline_htg_style}">{caption_html}{htb_html}</div>"#,
                left_mm = left_mm,
                htg_width = htg_width,
                top_mm = top_mm,
                htg_height = htg_height,
                caption_html = caption_html,
                htb_html = htb_html,
                inline_htg_style = inline_htg_style,
            )
        } else {
            // 아래 캡션 또는 캡션 없음: 테이블 먼저, 그 다음 캡션 / Caption below or no caption: table first, then caption
            format!(
                r#"<div class="htG" style="left:{left_mm}mm;width:{htg_width}mm;top:{top_mm}mm;height:{htg_height}mm;{inline_htg_style}">{htb_html}{caption_html}</div>"#,
                left_mm = left_mm,
                htg_width = htg_width,
                top_mm = top_mm,
                htg_height = htg_height,
                htb_html = htb_html,
                caption_html = caption_html,
                inline_htg_style = inline_htg_style,
            )
        };

        html
    } else {
        htb_html
    };

    result_html
}
