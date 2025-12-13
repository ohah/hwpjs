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

    let base_pos = if let Some((left, top)) = hcd_position {
        (left.round_to_2dp(), top.round_to_2dp())
    } else if let Some(pd) = page_def {
        let left = (pd.left_margin.to_mm() + pd.binding_margin.to_mm()).round_to_2dp();
        let top = (pd.top_margin.to_mm() + pd.header_margin.to_mm()).round_to_2dp();
        (left, top)
    } else {
        (20.0, 24.99)
    };

    if let Some((segment_col, segment_vert)) = segment_position {
        let segment_left_mm = int32_to_mm(segment_col);
        let segment_top_mm = int32_to_mm(segment_vert);
        (
            round_to_2dp(base_pos.0 + segment_left_mm),
            round_to_2dp(base_pos.1 + segment_top_mm),
        )
    } else {
        // segment_position이 없으면 offset_x, offset_y 사용 / Use offset_x, offset_y if segment_position is None
        let offset_left_mm = offset_x.map(|x| x.to_mm()).unwrap_or(0.0);
        let offset_top_mm = if let (Some(VertRelTo::Para), Some(offset)) = (vert_rel_to, offset_y) {
            // 가설 MinDiff: offset_y는 두 번째 문단의 vertical_position을 기준으로 한 절대 위치일 수 있습니다
            // Hypothesis MinDiff: offset_y may be absolute position relative to second paragraph's vertical_position
            let offset_mm = offset.to_mm();

            // offset_y가 0이면 hcd_position.top을 사용 (문단 시작 위치와 무관) / If offset_y is 0, use hcd_position.top (independent of paragraph start)
            if offset_mm == 0.0 {
                0.0
            } else if let Some(para_start) = para_start_vertical_mm {
                // para_start는 참조 문단의 첫 번째 LineSegment의 vertical_position (절대 위치)
                // para_start is the vertical_position of the first LineSegment of the reference paragraph (absolute position)
                // offset_y는 참조 문단의 vertical_position을 기준으로 한 상대 위치
                // offset_y is relative position relative to reference paragraph's vertical_position
                // 하지만 사용자 제안: para_start에 여백 탑을 더해주면 될 것 같다
                // But user suggestion: add top margin to para_start
                // para_start는 이미 절대 위치이므로, base_pos.1 (top margin)을 더하면 안 됨
                // para_start is already absolute position, so we shouldn't add base_pos.1 (top margin)
                // 대신: para_start를 base_pos를 기준으로 한 상대 위치로 변환
                // Instead: convert para_start to relative position relative to base_pos
                // offset_top_mm = para_start - base_pos.1
                para_start - base_pos.1
            } else if let Some(first_para) = first_para_vertical_mm {
                // 가설 O: offset_y는 첫 번째 문단의 vertical_position을 기준으로 한 상대 위치
                // Hypothesis O: offset_y is relative to the first paragraph's vertical_position
                let first_para_relative_mm = first_para - base_pos.1;
                first_para_relative_mm + offset_mm
            } else {
                offset_mm
            }
        } else {
            offset_y.map(|y| y.to_mm()).unwrap_or(0.0)
        };

        (
            round_to_2dp(base_pos.0 + offset_left_mm),
            round_to_2dp(base_pos.1 + offset_top_mm),
        )
    }
}
