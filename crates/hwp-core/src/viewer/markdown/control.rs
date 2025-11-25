/// Control header conversion to Markdown
/// 컨트롤 헤더를 마크다운으로 변환하는 모듈
use crate::document::{CtrlHeader, CtrlHeaderData};

/// Convert control header to markdown
/// 컨트롤 헤더를 마크다운으로 변환
///
/// # Arguments / 매개변수
/// * `header` - 컨트롤 헤더 / Control header
/// * `has_table` - 표가 이미 추출되었는지 여부 / Whether table was already extracted
pub fn convert_control_to_markdown(header: &CtrlHeader, has_table: bool) -> String {
    match header.ctrl_id.as_str() {
        "tbl " => {
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
        "gso " => {
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
        "head" => {
            // 머리말 (Header) / Header
            String::from("*[머리말]*")
        }
        "foot" => {
            // 꼬리말 (Footer) / Footer
            String::from("*[꼬리말]*")
        }
        "cold" => {
            // 단 정의 (Column Definition) / Column Definition
            String::from("*[단 정의]*")
        }
        _ => {
            // 기타 컨트롤 / Other controls
            format!("*[컨트롤: {}]*", header.ctrl_id.trim())
        }
    }
}

