/// PAGE_NUMBER CtrlId conversion to Markdown
/// PAGE_NUMBER CtrlId를 마크다운으로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 127 - 개체 이외의 컨트롤과 컨트롤 ID, PAGE_NUMBER ("pgno") / PAGE_NUMBER_POS ("pgnp")
/// Spec mapping: Table 127 - Controls other than objects and Control IDs, PAGE_NUMBER ("pgno") / PAGE_NUMBER_POS ("pgnp")
use crate::document::{CtrlHeader, CtrlHeaderData, PageNumberPosition};

/// Convert PAGE_NUMBER or PAGE_NUMBER_POS CtrlId to markdown
/// PAGE_NUMBER 또는 PAGE_NUMBER_POS CtrlId를 마크다운으로 변환
///
/// # Arguments / 매개변수
/// * `header` - 컨트롤 헤더 / Control header
///
/// # Returns / 반환값
/// 마크다운 문자열 / Markdown string
pub(crate) fn convert_page_number_ctrl_to_markdown(header: &CtrlHeader) -> String {
    // 쪽 번호 위치 (Page Number Position) / Page number position
    if let CtrlHeaderData::PageNumberPosition {
        flags,
        user_symbol: _,
        prefix,
        suffix,
    } = &header.data
    {
        let position_str = match flags.position {
            PageNumberPosition::None => "없음",
            PageNumberPosition::TopLeft => "왼쪽 위",
            PageNumberPosition::TopCenter => "가운데 위",
            PageNumberPosition::TopRight => "오른쪽 위",
            PageNumberPosition::BottomLeft => "왼쪽 아래",
            PageNumberPosition::BottomCenter => "가운데 아래",
            PageNumberPosition::BottomRight => "오른쪽 아래",
            PageNumberPosition::OutsideTop => "바깥쪽 위",
            PageNumberPosition::OutsideBottom => "바깥쪽 아래",
            PageNumberPosition::InsideTop => "안쪽 위",
            PageNumberPosition::InsideBottom => "안쪽 아래",
        };
        format!(
            "*[쪽 번호 위치: {} (모양: {}, 장식: {}{})]*",
            position_str, flags.shape, prefix, suffix
        )
    } else {
        String::from("*[쪽 번호 위치]*")
    }
}
