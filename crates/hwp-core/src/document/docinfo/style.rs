/// Style 구조체 / Style structure
///
/// 스펙 문서 매핑: 표 47 - 스타일 / Spec mapping: Table 47 - Style
/// Tag ID: HWPTAG_STYLE
/// 전체 길이: 가변 (12 + 2×len1 + 2×len2 바이트) / Total length: variable (12 + 2×len1 + 2×len2 bytes)
use crate::error::HwpError;
use crate::types::{decode_utf16le, BYTE, INT16, UINT16, WORD};
use serde::{Deserialize, Serialize};

/// 스타일 종류 / Style type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StyleType {
    /// 문단 스타일 / Paragraph style
    Paragraph = 0,
    /// 글자 스타일 / Character style
    Character = 1,
}

impl StyleType {
    fn from_bits(bits: u8) -> Self {
        match bits & 0x07 {
            1 => StyleType::Character,
            _ => StyleType::Paragraph,
        }
    }
}

/// Style 구조체 / Style structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Style {
    /// 로컬/한글 스타일 이름 / Local/Korean style name
    pub local_name: String,
    /// 영문 스타일 이름 / English style name
    pub english_name: String,
    /// 속성 (표 48 참조, bit 0-2: 스타일 종류) / Attributes (See Table 48, bit 0-2: style type)
    pub style_type: StyleType,
    /// 다음 스타일 ID 참조 값 / Next style ID reference value
    pub next_style_id: BYTE,
    /// 언어 ID (표 48 참조) / Language ID (See Table 48)
    pub lang_id: INT16,
    /// 문단 모양 ID 참조 값 (스타일 종류가 문단인 경우 필수) / Paragraph shape ID reference (required if style type is paragraph)
    pub para_shape_id: Option<UINT16>,
    /// 글자 모양 ID (스타일 종류가 글자인 경우 필수) / Character shape ID (required if style type is character)
    pub char_shape_id: Option<UINT16>,
}

impl Style {
    /// Style을 바이트 배열에서 파싱합니다. / Parse Style from byte array.
    ///
    /// # Arguments
    /// * `data` - Style 레코드 데이터 / Style record data
    ///
    /// # Returns
    /// 파싱된 Style 구조체 / Parsed Style structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        // 최소 12바이트 필요 (고정 필드들) / Need at least 12 bytes for fixed fields
        if data.len() < 12 {
            return Err(HwpError::insufficient_data("Style", 12, data.len()));
        }

        let mut offset = 0;

        // WORD 길이(len1) / WORD length (len1)
        let len1 = WORD::from_le_bytes([data[offset], data[offset + 1]]) as usize;
        offset += 2;

        // WCHAR array[len1] 로컬/한글 스타일 이름 / WCHAR array[len1] local/Korean style name
        if offset + (len1 * 2) > data.len() {
            return Err(HwpError::InsufficientData {
                field: format!("Style local name at offset {}", offset),
                expected: offset + (len1 * 2),
                actual: data.len(),
            });
        }
        let local_name_bytes = &data[offset..offset + (len1 * 2)];
        let local_name = decode_utf16le(local_name_bytes).map_err(|e| HwpError::EncodingError {
            reason: format!("Failed to decode local name: {}", e),
        })?;
        offset += len1 * 2;

        // WORD 길이(len2) / WORD length (len2)
        if offset + 2 > data.len() {
            return Err(HwpError::insufficient_data(
                "Style English name length",
                2,
                data.len() - offset,
            ));
        }
        let len2 = WORD::from_le_bytes([data[offset], data[offset + 1]]) as usize;
        offset += 2;

        // WCHAR array[len2] 영문 스타일 이름 / WCHAR array[len2] English style name
        if offset + (len2 * 2) > data.len() {
            return Err(HwpError::InsufficientData {
                field: format!("Style English name at offset {}", offset),
                expected: offset + (len2 * 2),
                actual: data.len(),
            });
        }
        let english_name_bytes = &data[offset..offset + (len2 * 2)];
        let english_name =
            decode_utf16le(english_name_bytes).map_err(|e| HwpError::EncodingError {
                reason: format!("Failed to decode English name: {}", e),
            })?;
        offset += len2 * 2;

        // BYTE 속성 (표 48 참조, bit 0-2: 스타일 종류) / BYTE attributes (See Table 48, bit 0-2: style type)
        if offset + 1 > data.len() {
            return Err(HwpError::insufficient_data(
                "Style attributes",
                1,
                data.len() - offset,
            ));
        }
        let attributes = data[offset];
        offset += 1;
        let style_type = StyleType::from_bits(attributes);

        // BYTE 다음 스타일 ID 참조 값 / BYTE next style ID reference value
        if offset + 1 > data.len() {
            return Err(HwpError::insufficient_data(
                "Style next style ID",
                1,
                data.len() - offset,
            ));
        }
        let next_style_id = data[offset];
        offset += 1;

        // INT16 언어 ID (표 48 참조) / INT16 language ID (See Table 48)
        if offset + 2 > data.len() {
            return Err(HwpError::insufficient_data(
                "Style language ID",
                2,
                data.len() - offset,
            ));
        }
        let lang_id = INT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT16 문단 모양 ID 참조 값 (스타일 종류가 문단인 경우 필수) / UINT16 paragraph shape ID reference (required if style type is paragraph)
        if offset + 2 > data.len() {
            return Err(HwpError::insufficient_data(
                "Style paragraph shape ID",
                2,
                data.len() - offset,
            ));
        }
        let para_shape_id_value = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;
        let para_shape_id = if style_type == StyleType::Paragraph {
            Some(para_shape_id_value)
        } else {
            None
        };

        // UINT16 글자 모양 ID (스타일 종류가 글자인 경우 필수) / UINT16 character shape ID (required if style type is character)
        if offset + 2 > data.len() {
            return Err(HwpError::insufficient_data(
                "Style character shape ID",
                2,
                data.len() - offset,
            ));
        }
        let char_shape_id_value = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;
        let char_shape_id = if style_type == StyleType::Character {
            Some(char_shape_id_value)
        } else {
            None
        };

        Ok(Style {
            local_name,
            english_name,
            style_type,
            next_style_id,
            lang_id,
            para_shape_id,
            char_shape_id,
        })
    }
}
