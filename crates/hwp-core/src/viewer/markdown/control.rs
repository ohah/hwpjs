/// Control header conversion to Markdown
/// 컨트롤 헤더를 마크다운으로 변환하는 모듈
use crate::document::{CtrlHeader, CtrlHeaderData, CtrlId, PageNumberPosition};

/// Convert control header to markdown
/// 컨트롤 헤더를 마크다운으로 변환
///
/// # Arguments / 매개변수
/// * `header` - 컨트롤 헤더 / Control header
/// * `has_table` - 표가 이미 추출되었는지 여부 / Whether table was already extracted
pub fn convert_control_to_markdown(header: &CtrlHeader, has_table: bool) -> String {
    match header.ctrl_id.as_str() {
        CtrlId::TABLE => {
            // 표 (Table) / Table
            // 표가 이미 추출되었다면 메시지를 출력하지 않음 / Don't output message if table was already extracted
            if has_table {
                return String::new();
            }
            let mut md = String::from("**표**");
            if let CtrlHeaderData::ObjectCommon { description, .. } = &header.data {
                if let Some(desc) = description {
                    if !desc.trim().is_empty() {
                        md.push_str(&format!(": {}", desc.trim()));
                    }
                }
            }
            md.push_str("\n\n*[표 내용은 추출되지 않았습니다]*");
            md
        }
        CtrlId::SHAPE_OBJECT => {
            // 그리기 개체 (Shape Object) - 글상자, 그림 등
            // Shape Object - text boxes, images, etc.
            let mut md = String::from("**그리기 개체**");
            if let CtrlHeaderData::ObjectCommon { description, .. } = &header.data {
                if let Some(desc) = description {
                    if !desc.trim().is_empty() {
                        md.push_str(&format!(": {}", desc.trim()));
                    }
                }
            }
            md.push_str("\n\n*[개체 내용은 추출되지 않았습니다]*");
            md
        }
        CtrlId::HEADER_FOOTER => {
            // 머리말 (Header) / Header
            String::from("*[머리말]*")
        }
        CtrlId::FOOTNOTE => {
            // 꼬리말 (Footer) / Footer
            String::from("*[꼬리말]*")
        }
        CtrlId::COLUMN_DEF => {
            // 단 정의 (Column Definition) / Column Definition
            String::from("*[단 정의]*")
        }
        CtrlId::PAGE_NUMBER | CtrlId::PAGE_NUMBER_POS => {
            // 쪽 번호 위치 (Page Number Position) / Page number position
            if let CtrlHeaderData::PageNumberPosition {
                flags,
                user_symbol,
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
        _ => {
            // 기타 컨트롤 / Other controls
            format!("*[컨트롤: {}]*", header.ctrl_id.trim())
        }
    }
}
