use crate::document::bodytext::ctrl_header::{CtrlHeaderData, HorzRelTo, VertRelTo};
use crate::document::bodytext::PageDef;
use crate::types::{RoundTo2dp, INT32};
use crate::viewer::html::styles::{int32_to_mm, round_to_2dp};

/// viewBox 데이터 / ViewBox data
#[derive(Clone, Copy)]
pub(crate) struct ViewBox {
    pub left: f64,
    pub top: f64,
    pub width: f64,
    pub height: f64,
}

/// SVG viewBox 계산 / Calculate SVG viewBox
pub(crate) fn view_box(htb_width: f64, htb_height: f64, padding: f64) -> ViewBox {
    ViewBox {
        left: round_to_2dp(-padding),
        top: round_to_2dp(-padding),
        width: round_to_2dp(htb_width + (padding * 2.0)),
        height: round_to_2dp(htb_height + (padding * 2.0)),
    }
}

/// 테이블 절대 위치 계산 / Calculate absolute table position
pub(crate) fn table_position(
    hcd_position: Option<(f64, f64)>,
    page_def: Option<&PageDef>,
    segment_position: Option<(INT32, INT32)>,
    ctrl_header: Option<&CtrlHeaderData>,
    obj_outer_width_mm: Option<f64>,
    para_start_vertical_mm: Option<f64>,
    para_start_column_mm: Option<f64>,
    para_segment_width_mm: Option<f64>,
    first_para_vertical_mm: Option<f64>, // 첫 번째 문단의 vertical_position (가설 O) / First paragraph's vertical_position (Hypothesis O)
) -> (f64, f64) {
    // CtrlHeader에서 필요한 정보 추출 / Extract necessary information from CtrlHeader
    let (offset_x, offset_y, vert_rel_to, horz_rel_to, horz_relative) =
        if let Some(CtrlHeaderData::ObjectCommon {
            attribute,
            offset_x,
            offset_y,
            ..
        }) = ctrl_header
        {
            (
                Some(*offset_x),
                Some(*offset_y),
                Some(attribute.vert_rel_to),
                Some(attribute.horz_rel_to),
                Some(attribute.horz_relative),
            )
        } else {
            (None, None, None, None, None)
        };

    let (base_left, base_top) = if let Some((left, top)) = hcd_position {
        (left.round_to_2dp(), top.round_to_2dp())
    } else if let Some(pd) = page_def {
        let left = (pd.left_margin.to_mm() + pd.binding_margin.to_mm()).round_to_2dp();
        let top = (pd.top_margin.to_mm() + pd.header_margin.to_mm()).round_to_2dp();
        (left, top)
    } else {
        (20.0, 24.99)
    };

    if let Some((segment_col, segment_vert)) = segment_position {
        // 레거시 코드처럼 vertical_position을 절대 위치로 직접 사용 / Use vertical_position as absolute position directly like legacy code
        // vertical_position은 이미 페이지 기준 절대 위치이므로 base_pos를 더하지 않음 / vertical_position is already absolute position relative to page, so don't add base_pos
        let segment_left_mm = int32_to_mm(segment_col);
        let segment_top_mm = int32_to_mm(segment_vert);
        (round_to_2dp(segment_left_mm), round_to_2dp(segment_top_mm))
    } else {
        // 종이(paper) 기준인 경우, 기준 원점은 용지 좌상단이므로 base_left/base_top을 적용하지 않는다.
        // (page/hcD 기준은 본문 시작점이므로 base_left/base_top이 필요)
        let base_top_for_obj = if matches!(vert_rel_to, Some(VertRelTo::Paper)) {
            0.0
        } else {
            base_top
        };
        let base_left_for_obj = if matches!(horz_rel_to, Some(HorzRelTo::Paper)) {
            0.0
        } else {
            base_left
        };
        let offset_left_mm = offset_x.map(|x| x.to_mm()).unwrap_or(0.0);
        let para_left_mm = if matches!(horz_rel_to, Some(HorzRelTo::Para)) {
            para_start_column_mm.unwrap_or(0.0)
        } else {
            0.0
        };
        let obj_w_mm = obj_outer_width_mm.unwrap_or(0.0);

        // 기준 폭 계산 (right/center 정렬에 필요)
        // - paper: 용지 폭
        // - page/column: 본문(content) 폭
        // - para: 현재 LineSeg의 segment_width
        let mut ref_width_mm = match horz_rel_to {
            Some(HorzRelTo::Paper) => page_def.map(|pd| pd.paper_width.to_mm()).unwrap_or(210.0),
            Some(HorzRelTo::Para) => para_segment_width_mm.unwrap_or(0.0),
            Some(HorzRelTo::Page) | Some(HorzRelTo::Column) | None => {
                if let Some(pd) = page_def {
                    // content width = paper - (left+binding) - right
                    pd.paper_width.to_mm()
                        - (pd.left_margin.to_mm() + pd.binding_margin.to_mm())
                        - pd.right_margin.to_mm()
                } else {
                    148.0
                }
            }
        };
        // ParaLineSeg.segment_width가 0인 케이스가 있어(빈 문단/앵커 문단),
        // 이 경우에는 content width에서 para_left를 뺀 값으로 폴백한다.
        if matches!(horz_rel_to, Some(HorzRelTo::Para)) && ref_width_mm <= 0.0 {
            if let Some(pd) = page_def {
                let content_w = pd.paper_width.to_mm()
                    - (pd.left_margin.to_mm() + pd.binding_margin.to_mm())
                    - pd.right_margin.to_mm();
                // 문단 기준 폭은 "문단 시작(col_start)"을 좌우에서 모두 제외한 값으로 해석해야
                // fixture(table-position)의 "문단 오른쪽/가운데" 케이스와 일치한다.
                // 예) content_w(150) - 2*col_start(3.53) = 142.94mm
                ref_width_mm = (content_w - (para_left_mm * 2.0)).max(0.0);
            }
        }

        // horz_relative (Table 70): 0=left, 1=center, 2=right
        // NOTE: fixture(table-position.html)의 "오른쪽부터 Nmm" 케이스는 right 기준 계산이 필요합니다.
        let relative_mode = horz_relative.unwrap_or(0);
        let left_mm = match relative_mode {
            2 => {
                // right aligned: (ref_right - offset_x - obj_width)
                base_left_for_obj + para_left_mm + (ref_width_mm - offset_left_mm - obj_w_mm)
            }
            1 => {
                // centered: (ref_center - obj_width/2) + offset_x
                base_left_for_obj
                    + para_left_mm
                    + (ref_width_mm / 2.0 - obj_w_mm / 2.0)
                    + offset_left_mm
            }
            _ => {
                // left aligned
                base_left_for_obj + para_left_mm + offset_left_mm
            }
        };
        let offset_top_mm = if let (Some(VertRelTo::Para), Some(offset)) = (vert_rel_to, offset_y) {
            let offset_mm = offset.to_mm();
            if let Some(para_start) = para_start_vertical_mm {
                // y 계산은 base_top 기준이어야 합니다. (base_left 사용은 버그)
                para_start - base_top_for_obj
            } else if let Some(first_para) = first_para_vertical_mm {
                let first_para_relative_mm = first_para - base_top_for_obj;
                first_para_relative_mm + offset_mm
            } else {
                offset_mm
            }
        } else {
            offset_y.map(|y| y.to_mm()).unwrap_or(0.0)
        };

        (
            round_to_2dp(left_mm),
            round_to_2dp(base_top_for_obj + offset_top_mm),
        )
    }
}
