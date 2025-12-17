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
    para_start_vertical_mm: Option<f64>,
    para_start_column_mm: Option<f64>,
    first_para_vertical_mm: Option<f64>, // 첫 번째 문단의 vertical_position (가설 O) / First paragraph's vertical_position (Hypothesis O)
) -> (f64, f64) {
    // CtrlHeader에서 필요한 정보 추출 / Extract necessary information from CtrlHeader
    let (offset_x, offset_y, vert_rel_to, horz_rel_to) =
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
            )
        } else {
            (None, None, None, None)
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
        // horz_rel_to=para 인 경우, 문단의 column_start_position(=para_start_column_mm)을 함께 더해야 fixture(table-position.html)와 일치합니다.
        // (예: page_left 30mm + offset_x 5mm + para_col 3.53mm = 38.53mm)
        let para_left_mm = if matches!(horz_rel_to, Some(HorzRelTo::Para)) {
            para_start_column_mm.unwrap_or(0.0)
        } else {
            0.0
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
            round_to_2dp(base_left_for_obj + offset_left_mm + para_left_mm),
            round_to_2dp(base_top_for_obj + offset_top_mm),
        )
    }
}
