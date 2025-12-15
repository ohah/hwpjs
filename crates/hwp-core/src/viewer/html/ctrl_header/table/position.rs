use crate::document::bodytext::ctrl_header::{CtrlHeaderData, VertRelTo};
use crate::document::bodytext::PageDef;
use crate::types::{Hwpunit16ToMm, RoundTo2dp, INT32};
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
    first_para_vertical_mm: Option<f64>, // 첫 번째 문단의 vertical_position (가설 O) / First paragraph's vertical_position (Hypothesis O)
) -> (f64, f64) {
    // CtrlHeader에서 필요한 정보 추출 / Extract necessary information from CtrlHeader
    let (offset_x, offset_y, vert_rel_to, margin_top_mm) =
        if let Some(CtrlHeaderData::ObjectCommon {
            attribute,
            offset_x,
            offset_y,
            margin,
            ..
        }) = ctrl_header
        {
            (
                Some(*offset_x),
                Some(*offset_y),
                Some(attribute.vert_rel_to),
                Some(margin.top.to_mm()),
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
        let offset_left_mm = offset_x.map(|x| x.to_mm()).unwrap_or(0.0);
        let offset_top_mm = if let (Some(VertRelTo::Para), Some(offset)) = (vert_rel_to, offset_y) {
            let offset_mm = offset.to_mm();
            if let Some(para_start) = para_start_vertical_mm {
                para_start - base_left
            } else if let Some(first_para) = first_para_vertical_mm {
                let first_para_relative_mm = first_para - base_left;
                first_para_relative_mm + offset_mm
            } else {
                offset_mm
            }
        } else {
            offset_y.map(|y| y.to_mm()).unwrap_or(0.0)
        };

        (
            round_to_2dp(base_left + offset_left_mm),
            round_to_2dp(base_top + offset_top_mm),
        )
    }
}
