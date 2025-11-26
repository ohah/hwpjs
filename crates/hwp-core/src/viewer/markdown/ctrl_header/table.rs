/// TABLE CtrlId conversion to Markdown
/// TABLE CtrlId를 마크다운으로 변환하는 모듈
///
/// 스펙 문서 매핑: 표 127 - 개체 컨트롤 ID, TABLE ("tbl ")
/// Spec mapping: Table 127 - Object Control IDs, TABLE ("tbl ")
use crate::document::{CtrlHeader, CtrlHeaderData};

/// Convert TABLE CtrlId to markdown
/// TABLE CtrlId를 마크다운으로 변환
///
/// # Arguments / 매개변수
/// * `header` - 컨트롤 헤더 / Control header
/// * `has_table` - 표가 이미 추출되었는지 여부 / Whether table was already extracted
///
/// # Returns / 반환값
/// 마크다운 문자열 / Markdown string
pub(crate) fn convert_table_ctrl_to_markdown(header: &CtrlHeader, has_table: bool) -> String {
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
