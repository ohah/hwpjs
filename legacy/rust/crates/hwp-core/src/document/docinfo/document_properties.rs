/// Document Properties 구조체 / Document Properties structure
///
/// 스펙 문서 매핑: 표 14 - 문서 속성 / Spec mapping: Table 14 - Document properties
/// Tag ID: HWPTAG_DOCUMENT_PROPERTIES
/// 전체 길이: 26 바이트 / Total length: 26 bytes
use crate::error::HwpError;
use crate::types::{UINT16, UINT32};
use serde::{Deserialize, Serialize};

/// 문서 속성 구조체 / Document properties structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentProperties {
    /// 구역 개수 / Area count
    pub area_count: UINT16,
    /// 문서 내 각종 시작번호에 대한 정보 / Start number information
    pub start_number_info: UINT16,
    /// 페이지 시작 번호 / Page start number
    pub page_start_number: UINT16,
    /// 각주 시작 번호 / Footnote start number
    pub footnote_start_number: UINT16,
    /// 미주 시작 번호 / Endnote start number
    pub endnote_start_number: UINT16,
    /// 그림 시작 번호 / Image start number
    pub image_start_number: UINT16,
    /// 표 시작 번호 / Table start number
    pub table_start_number: UINT16,
    /// 수식 시작 번호 / Formula start number
    pub formula_start_number: UINT16,
    /// 문서 내 캐럿의 위치 정보 (리스트 아이디) / Caret position information in document (list ID)
    pub list_id: UINT32,
    /// 문단 아이디 / Paragraph ID
    pub paragraph_id: UINT32,
    /// 문단 내에서의 글자 단위 위치 / Character position within paragraph
    pub character_position: UINT32,
}

impl DocumentProperties {
    /// DocumentProperties를 바이트 배열에서 파싱합니다. / Parse DocumentProperties from byte array.
    ///
    /// # Arguments
    /// * `data` - 최소 26바이트의 데이터 / At least 26 bytes of data
    ///
    /// # Returns
    /// 파싱된 DocumentProperties 구조체 / Parsed DocumentProperties structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        // 레거시 코드 기준으로 26바이트를 읽음
        // Read 26 bytes based on legacy code
        if data.len() < 26 {
            return Err(HwpError::insufficient_data(
                "DocumentProperties",
                26,
                data.len(),
            ));
        }

        let mut offset = 0;

        // UINT16 구역 개수 / UINT16 area count
        let area_count = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT16 페이지 시작 번호 / UINT16 page start number
        // Note: 레거시 코드에서는 "문서 내 각종 시작번호에 대한 정보" 필드를 건너뛰고 바로 페이지 시작 번호를 읽음
        // Note: Legacy code skips "start number information" field and reads page_start_number directly
        let page_start_number = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT16 각주 시작 번호 / UINT16 footnote start number
        let footnote_start_number = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT16 미주 시작 번호 / UINT16 endnote start number
        let endnote_start_number = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT16 그림 시작 번호 / UINT16 image start number
        let image_start_number = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT16 표 시작 번호 / UINT16 table start number
        let table_start_number = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT16 수식 시작 번호 / UINT16 formula start number
        let formula_start_number = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT32 문서 내 캐럿의 위치 정보 (리스트 아이디) / UINT32 caret position (list ID)
        let list_id = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // UINT32 문단 아이디 / UINT32 paragraph ID
        let paragraph_id = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // UINT32 문단 내에서의 글자 단위 위치 / UINT32 character position within paragraph
        let character_position = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);

        Ok(DocumentProperties {
            area_count,
            start_number_info: 0, // 레거시 코드에서는 이 필드를 건너뜀 / This field is skipped in legacy code
            page_start_number,
            footnote_start_number,
            endnote_start_number,
            image_start_number,
            table_start_number,
            formula_start_number,
            list_id,
            paragraph_id,
            character_position,
        })
    }
}
