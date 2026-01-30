/// Face Name (Font) 구조체 / Face Name (Font) structure
///
/// 스펙 문서 매핑: 표 19 - 글꼴 / Spec mapping: Table 19 - Font
/// Tag ID: HWPTAG_FACE_NAME
use crate::error::HwpError;
use crate::types::{decode_utf16le, BYTE, WORD};
use serde::{Deserialize, Serialize};

/// 글꼴 속성 플래그 / Font attribute flags
mod flags {
    /// 대체 글꼴 존재 여부 / Alternative font exists
    pub const HAS_ALTERNATIVE: u8 = 0x80;
    /// 글꼴 유형 정보 존재 여부 / Font type information exists
    pub const HAS_TYPE_INFO: u8 = 0x40;
    /// 기본 글꼴 존재 여부 / Default font exists
    pub const HAS_DEFAULT: u8 = 0x20;
}

/// 대체 글꼴 유형 / Alternative font type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum AlternativeFontType {
    /// 원래 종류를 알 수 없을 때 / Unknown original type
    Unknown = 0,
    /// 트루타입 글꼴(TTF) / TrueType font (TTF)
    TTF = 1,
    /// 한글 전용 글꼴(HFT) / HWP font (HFT)
    HFT = 2,
}

impl AlternativeFontType {
    /// BYTE 값에서 AlternativeFontType 생성 / Create AlternativeFontType from BYTE value
    fn from_byte(value: BYTE) -> Self {
        match value {
            1 => AlternativeFontType::TTF,
            2 => AlternativeFontType::HFT,
            _ => AlternativeFontType::Unknown,
        }
    }
}

/// 글꼴 유형 정보 / Font type information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontTypeInfo {
    /// 글꼴 계열 / Font family
    pub font_family: BYTE,
    /// 세리프 유형 / Serif type
    pub serif: BYTE,
    /// 굵기 / Boldness
    pub bold: BYTE,
    /// 비례 / Proportion
    pub proportion: BYTE,
    /// 대조 / Contrast
    pub contrast: BYTE,
    /// 스트로크 편차 / Stroke variation
    pub stroke_variation: BYTE,
    /// 자획 유형 / Stroke type
    pub stroke_type: BYTE,
    /// 글자형 / Letter type
    pub letter_type: BYTE,
    /// 중간선 / Middle line
    pub middle_line: BYTE,
    /// X-높이 / X-height
    pub x_height: BYTE,
}

/// Face Name (Font) 구조체 / Face Name (Font) structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FaceName {
    /// 글꼴 이름 / Font name
    pub name: String,
    /// 대체 글꼴 유형 (속성에 따라 존재) / Alternative font type (exists based on attribute)
    pub alternative_font_type: Option<AlternativeFontType>,
    /// 대체 글꼴 이름 (속성에 따라 존재) / Alternative font name (exists based on attribute)
    pub alternative_font_name: Option<String>,
    /// 글꼴 유형 정보 (속성에 따라 존재) / Font type information (exists based on attribute)
    pub font_type_info: Option<FontTypeInfo>,
    /// 기본 글꼴 이름 (속성에 따라 존재) / Default font name (exists based on attribute)
    pub default_font_name: Option<String>,
}

impl FaceName {
    /// FaceName을 바이트 배열에서 파싱합니다. / Parse FaceName from byte array.
    ///
    /// # Arguments
    /// * `data` - FaceName 레코드 데이터 / FaceName record data
    ///
    /// # Returns
    /// 파싱된 FaceName 구조체 / Parsed FaceName structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 3 {
            return Err(HwpError::insufficient_data("FaceName", 3, data.len()));
        }

        let mut offset = 0;

        // BYTE 속성 (표 20) / BYTE attribute (Table 20)
        let attributes = data[offset];
        offset += 1;

        // WORD 글꼴 이름 길이 / WORD font name length
        let name_length = WORD::from_le_bytes([data[offset], data[offset + 1]]) as usize;
        offset += 2;

        // WCHAR array 글꼴 이름 / WCHAR array font name
        if offset + (name_length * 2) > data.len() {
            return Err(HwpError::InsufficientData {
                field: format!("FaceName font name at offset {}", offset),
                expected: offset + (name_length * 2),
                actual: data.len(),
            });
        }
        let name_bytes = &data[offset..offset + (name_length * 2)];
        let name = decode_utf16le(name_bytes).map_err(|e| HwpError::EncodingError {
            reason: format!("Failed to decode font name: {}", e),
        })?;
        offset += name_length * 2;

        // 대체 글꼴 처리 (속성 bit 7이 1인 경우) / Process alternative font (if attribute bit 7 is 1)
        let (alternative_font_type, alternative_font_name) = if (attributes
            & flags::HAS_ALTERNATIVE)
            != 0
        {
            if offset >= data.len() {
                return Err(HwpError::insufficient_data(
                    "FaceName alternative font type",
                    1,
                    0,
                ));
            }
            let alt_type_byte = data[offset];
            offset += 1;

            // WORD 대체 글꼴 이름 길이 / WORD alternative font name length
            if offset + 2 > data.len() {
                return Err(HwpError::insufficient_data(
                    "FaceName alternative font name length",
                    2,
                    data.len() - offset,
                ));
            }
            let alt_name_length = WORD::from_le_bytes([data[offset], data[offset + 1]]) as usize;
            offset += 2;

            // WCHAR array 대체 글꼴 이름 / WCHAR array alternative font name
            if offset + (alt_name_length * 2) > data.len() {
                return Err(HwpError::InsufficientData {
                    field: format!("FaceName alternative font name at offset {}", offset),
                    expected: offset + (alt_name_length * 2),
                    actual: data.len(),
                });
            }
            let alt_name_bytes = &data[offset..offset + (alt_name_length * 2)];
            let alt_name = decode_utf16le(alt_name_bytes).map_err(|e| HwpError::EncodingError {
                reason: format!("Failed to decode alternative font name: {}", e),
            })?;
            offset += alt_name_length * 2;

            (
                Some(AlternativeFontType::from_byte(alt_type_byte)),
                Some(alt_name),
            )
        } else {
            (None, None)
        };

        // 글꼴 유형 정보 처리 (속성 bit 6이 1인 경우) / Process font type info (if attribute bit 6 is 1)
        let font_type_info = if (attributes & flags::HAS_TYPE_INFO) != 0 {
            if offset + 10 > data.len() {
                return Err(HwpError::insufficient_data(
                    "FaceName font type info",
                    10,
                    data.len() - offset,
                ));
            }
            Some(FontTypeInfo {
                font_family: data[offset],
                serif: data[offset + 1],
                bold: data[offset + 2],
                proportion: data[offset + 3],
                contrast: data[offset + 4],
                stroke_variation: data[offset + 5],
                stroke_type: data[offset + 6],
                letter_type: data[offset + 7],
                middle_line: data[offset + 8],
                x_height: data[offset + 9],
            })
        } else {
            None
        };
        if font_type_info.is_some() {
            offset += 10;
        }

        // 기본 글꼴 처리 (속성 bit 5가 1인 경우) / Process default font (if attribute bit 5 is 1)
        let default_font_name = if (attributes & flags::HAS_DEFAULT) != 0 {
            if offset + 2 > data.len() {
                return Err(HwpError::insufficient_data(
                    "FaceName default font name length",
                    2,
                    data.len() - offset,
                ));
            }
            let default_name_length =
                WORD::from_le_bytes([data[offset], data[offset + 1]]) as usize;
            offset += 2;

            if offset + (default_name_length * 2) > data.len() {
                return Err(HwpError::InsufficientData {
                    field: format!("FaceName default font name at offset {}", offset),
                    expected: offset + (default_name_length * 2),
                    actual: data.len(),
                });
            }
            let default_name_bytes = &data[offset..offset + (default_name_length * 2)];
            let default_name =
                decode_utf16le(default_name_bytes).map_err(|e| HwpError::EncodingError {
                    reason: format!("Failed to decode default font name: {}", e),
                })?;
            Some(default_name)
        } else {
            None
        };

        Ok(FaceName {
            name,
            alternative_font_type,
            alternative_font_name,
            font_type_info,
            default_font_name,
        })
    }
}
