/// Document 기반 페이지네이션 (old viewer pagination.rs 포팅)
/// LineSegmentInfo의 vertical_position으로 페이지 분할 판단
use super::styles::hwpunit_to_mm;
use hwp_model::hints::LineSegmentInfo;
use hwp_model::paragraph::Paragraph;

/// 페이지네이션 컨텍스트
pub struct PaginationContext {
    /// 이전 문단의 마지막 vertical_position (mm)
    pub prev_vertical_mm: Option<f64>,
    /// 현재 페이지의 최대 vertical_position (mm)
    pub current_max_vertical_mm: f64,
    /// 콘텐츠 영역 높이 (mm)
    pub content_height_mm: f64,
    /// 페이지 vertical_position 오프셋 (mm, 누적 문서에서 페이지 상대 위치 계산용)
    pub page_vertical_offset_mm: f64,
}

/// 페이지 나누기 결과
#[derive(Debug)]
pub struct PageBreakResult {
    pub should_break: bool,
    pub reason: Option<PageBreakReason>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageBreakReason {
    Explicit,
    VerticalReset,
    VerticalOverflow,
}

/// 문단이 페이지 나누기를 유발하는지 판단
pub fn check_page_break(para: &Paragraph, ctx: &PaginationContext) -> PageBreakResult {
    // 1. 명시적 page_break
    if para.page_break {
        return PageBreakResult {
            should_break: true,
            reason: Some(PageBreakReason::Explicit),
        };
    }

    // 2. LineSegment vertical_position 기반 판단
    let first_vp_mm = first_vertical_pos_mm(&para.line_segments)
        .map(|v| v - ctx.page_vertical_offset_mm);
    let last_end_mm = last_end_pos_mm(&para.line_segments)
        .map(|v| v - ctx.page_vertical_offset_mm);

    // vertical_position 리셋 감지 (이전보다 작아지면 새 페이지)
    if let (Some(prev), Some(current)) = (ctx.prev_vertical_mm, first_vp_mm) {
        let top_region = ctx.content_height_mm * 0.2;
        if (current < 0.1 || (prev > 0.1 && current < prev - 0.1))
            && (current < 0.1 || current < top_region)
        {
            return PageBreakResult {
                should_break: true,
                reason: Some(PageBreakReason::VerticalReset),
            };
        }
    }

    // vertical_position overflow
    if let Some(vp) = first_vp_mm {
        if vp > ctx.content_height_mm && ctx.current_max_vertical_mm > 0.0 {
            return PageBreakResult {
                should_break: true,
                reason: Some(PageBreakReason::VerticalOverflow),
            };
        }
    }

    // 끝 위치 overflow
    if let Some(end) = last_end_mm {
        if end > ctx.content_height_mm && ctx.current_max_vertical_mm > 0.0 {
            return PageBreakResult {
                should_break: true,
                reason: Some(PageBreakReason::VerticalOverflow),
            };
        }
    }

    PageBreakResult {
        should_break: false,
        reason: None,
    }
}

/// 첫 LineSegment의 vertical_position (mm)
fn first_vertical_pos_mm(segs: &[LineSegmentInfo]) -> Option<f64> {
    segs.first().map(|s| hwpunit_to_mm(s.vertical_pos))
}

/// 마지막 LineSegment의 끝 위치 (vertical_pos + line_spacing) (mm)
fn last_end_pos_mm(segs: &[LineSegmentInfo]) -> Option<f64> {
    segs.last()
        .map(|s| hwpunit_to_mm(s.vertical_pos + s.line_spacing))
}

/// 문단의 마지막 vertical_position (mm, offset 미적용)
pub fn last_vertical_pos_mm(para: &Paragraph) -> Option<f64> {
    para.line_segments
        .last()
        .map(|s| hwpunit_to_mm(s.vertical_pos))
}

/// 콘텐츠 영역 높이 계산 (mm)
pub fn content_height_mm(page_def: &hwp_model::section::PageDef) -> f64 {
    let height = match page_def.landscape {
        hwp_model::types::Landscape::Landscape => hwpunit_to_mm(page_def.width),
        _ => hwpunit_to_mm(page_def.height),
    };
    height
        - hwpunit_to_mm(page_def.margin.top)
        - hwpunit_to_mm(page_def.margin.bottom)
        - hwpunit_to_mm(page_def.margin.header)
        - hwpunit_to_mm(page_def.margin.footer)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_para(page_break: bool, vp: i32, line_spacing: i32) -> Paragraph {
        Paragraph {
            page_break,
            line_segments: vec![LineSegmentInfo {
                text_start_pos: 0,
                vertical_pos: vp,
                line_height: 720,
                text_height: 500,
                baseline_distance: 0,
                line_spacing,
                column_start_pos: 0,
                segment_width: 36000,
                flags: 0,
            }],
            ..Default::default()
        }
    }

    #[test]
    fn test_explicit_page_break() {
        let para = make_para(true, 0, 720);
        let ctx = PaginationContext {
            prev_vertical_mm: Some(10.0),
            current_max_vertical_mm: 10.0,
            content_height_mm: 250.0,
            page_vertical_offset_mm: 0.0,
        };
        let result = check_page_break(&para, &ctx);
        assert!(result.should_break);
        assert_eq!(result.reason, Some(PageBreakReason::Explicit));
    }

    #[test]
    fn test_vertical_overflow() {
        // vp = 260mm (> 250mm content height)
        let para = make_para(false, 73584, 720); // 73584/7200*25.4 ≈ 259.6mm
        let ctx = PaginationContext {
            prev_vertical_mm: Some(200.0),
            current_max_vertical_mm: 200.0,
            content_height_mm: 250.0,
            page_vertical_offset_mm: 0.0,
        };
        let result = check_page_break(&para, &ctx);
        assert!(result.should_break);
    }

    #[test]
    fn test_no_break() {
        let para = make_para(false, 2835, 720); // ~10mm
        let ctx = PaginationContext {
            prev_vertical_mm: Some(5.0),
            current_max_vertical_mm: 5.0,
            content_height_mm: 250.0,
            page_vertical_offset_mm: 0.0,
        };
        let result = check_page_break(&para, &ctx);
        assert!(!result.should_break);
    }
}
