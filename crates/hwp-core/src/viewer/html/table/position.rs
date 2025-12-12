use crate::document::bodytext::PageDef;
use crate::types::{INT32, RoundTo2dp};
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
) -> (f64, f64) {
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
        base_pos
    }
}

