/// Numbering 구조체 / Numbering structure
///
/// 스펙 문서 매핑: 표 38 - 문단 번호 / Spec mapping: Table 38 - Paragraph numbering
/// Tag ID: HWPTAG_NUMBERING
/// 전체 길이: 가변 / Total length: variable
use crate::error::HwpError;
use crate::types::{decode_utf16le, HWPUNIT16, UINT16, UINT32, WORD};
use serde::{Deserialize, Serialize};

/// 문단 머리 정보 속성 / Paragraph header information attributes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NumberingHeaderAttributes {
    /// 문단의 정렬 종류 / Paragraph alignment type
    pub align_type: ParagraphAlignType,
    /// 인스턴스 유사 여부 (bit 2) / Instance-like flag (bit 2)
    pub instance_like: bool,
    /// 자동 내어 쓰기 여부 / Auto outdent flag
    pub auto_outdent: bool,
    /// 수준별 본문과의 거리 종류 / Distance type from body text by level
    pub distance_type: DistanceType,
}

/// 문단 정렬 종류 / Paragraph alignment type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ParagraphAlignType {
    /// 왼쪽 / Left
    Left = 0,
    /// 가운데 / Center
    Center = 1,
    /// 오른쪽 / Right
    Right = 2,
}

impl ParagraphAlignType {
    fn from_bits(bits: u32) -> Self {
        match bits & 0x00000003 {
            1 => ParagraphAlignType::Center,
            2 => ParagraphAlignType::Right,
            _ => ParagraphAlignType::Left,
        }
    }
}

/// 수준별 본문과의 거리 종류 / Distance type from body text by level
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DistanceType {
    /// 글자 크기에 대한 상대 비율 / Relative ratio to font size
    Ratio = 0,
    /// 값 / Value
    Value = 1,
}

impl DistanceType {
    fn from_bit(bit: bool) -> Self {
        if bit {
            DistanceType::Value
        } else {
            DistanceType::Ratio
        }
    }
}

/// 문단 머리 정보 (수준별) / Paragraph header information (per level)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NumberingLevelInfo {
    /// 속성 (표 40) / Attributes (Table 40)
    pub attributes: NumberingHeaderAttributes,
    /// 너비 보정값 / Width correction value
    pub width: HWPUNIT16,
    /// 본문과의 거리 / Distance from body text
    pub distance: HWPUNIT16,
    /// 글자 모양 아이디 참조 / Character shape ID reference
    pub char_shape_id: UINT32,
    /// 번호 형식 길이 / Number format length
    pub format_length: WORD,
    /// 번호 형식 문자열 / Number format string
    pub format_string: String,
    /// 시작 번호 / Start number
    pub start_number: UINT16,
    /// 수준별 시작번호 (5.0.2.5 이상, 옵션) / Level-specific start number (5.0.2.5+, optional)
    pub level_start_number: Option<UINT32>,
}

/// Numbering 구조체 / Numbering structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Numbering {
    /// 수준별 문단 머리 정보 (7개 수준, 1~7) / Level-specific paragraph header information (7 levels, 1~7)
    pub levels: Vec<NumberingLevelInfo>,
    /// 확장 번호 형식 (3개 수준, 8~10, 옵션) / Extended number format (3 levels, 8~10, optional)
    pub extended_levels: Vec<ExtendedNumberingLevel>,
}

/// 확장 번호 형식 (수준 8~10) / Extended number format (levels 8~10)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtendedNumberingLevel {
    /// 번호 형식 길이 / Number format length
    pub format_length: WORD,
    /// 번호 형식 문자열 / Number format string
    pub format_string: String,
}

impl Numbering {
    /// Numbering을 바이트 배열에서 파싱합니다. / Parse Numbering from byte array.
    ///
    /// # Arguments
    /// * `data` - Numbering 레코드 데이터 / Numbering record data
    /// * `version` - HWP 파일 버전 (5.0.2.5 이상에서 수준별 시작번호 지원) / HWP file version (level-specific start numbers supported in 5.0.2.5+)
    ///
    /// # Returns
    /// 파싱된 Numbering 구조체 / Parsed Numbering structure
    pub fn parse(data: &[u8], version: u32) -> Result<Self, HwpError> {
        let mut offset = 0;
        let mut levels = Vec::new();

        // 7개 수준 파싱 (1~7) / Parse 7 levels (1~7)
        for _ in 0..7 {
            // 데이터가 부족하면 기본값으로 채우고 종료 / Fill with defaults and exit if insufficient data
            if offset + 12 > data.len() {
                // 최소 12바이트 (속성 4 + 너비 2 + 거리 2 + 글자모양ID 4) 필요 / Need at least 12 bytes
                break;
            }

            // UINT 속성 (표 40) / UINT attributes (Table 40)
            let attr_value = UINT32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]);
            offset += 4;

            let attributes = NumberingHeaderAttributes {
                align_type: ParagraphAlignType::from_bits(attr_value),
                instance_like: (attr_value & 0x00000004) != 0,
                auto_outdent: (attr_value & 0x00000008) != 0,
                distance_type: DistanceType::from_bit((attr_value & 0x00000010) != 0),
            };

            // HWPUNIT16 너비 보정값 / HWPUNIT16 width correction value
            let width = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
            offset += 2;

            // HWPUNIT16 본문과의 거리 / HWPUNIT16 distance from body text
            let distance = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
            offset += 2;

            // UINT 글자 모양 아이디 참조 / UINT character shape ID reference
            let char_shape_id = UINT32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]);
            offset += 4;

            // WORD 번호 형식 길이 / WORD number format length
            let (format_length, format_string) = if offset + 2 <= data.len() {
                let len = WORD::from_le_bytes([data[offset], data[offset + 1]]);
                offset += 2;

                // WCHAR array[format_length] 번호 형식 문자열 / WCHAR array[format_length] number format string
                let format_bytes = len as usize * 2;
                if offset + format_bytes <= data.len() {
                    let str = decode_utf16le(&data[offset..offset + format_bytes])
                        .map_err(|e| HwpError::EncodingError {
                            reason: format!("Failed to decode numbering format: {}", e),
                        })?;
                    offset += format_bytes;
                    (len, str)
                } else {
                    // 데이터가 부족하면 빈 문자열 / Empty string if insufficient data
                    (0, String::new())
                }
            } else {
                // 데이터가 부족하면 기본값 사용 / Use default if insufficient data
                (0, String::new())
            };

            // UINT16 시작 번호 / UINT16 start number
            let start_number = if offset + 2 <= data.len() {
                let value = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
                offset += 2;
                value
            } else {
                0
            };

            // UINT 수준별 시작번호 (5.0.2.5 이상, 옵션) / UINT level-specific start number (5.0.2.5+, optional)
            let level_start_number = if version >= 0x00020500 && offset + 4 <= data.len() {
                let value = UINT32::from_le_bytes([
                    data[offset],
                    data[offset + 1],
                    data[offset + 2],
                    data[offset + 3],
                ]);
                offset += 4;
                Some(value)
            } else {
                None
            };

            levels.push(NumberingLevelInfo {
                attributes,
                width,
                distance,
                char_shape_id,
                format_length,
                format_string,
                start_number,
                level_start_number,
            });
        }

        // 확장 번호 형식 파싱 (3개 수준, 8~10) / Parse extended number format (3 levels, 8~10)
        let mut extended_levels = Vec::new();
        for _ in 0..3 {
            if offset + 2 > data.len() {
                // 확장 레벨이 없을 수 있음 / Extended levels may not exist
                break;
            }

            // WORD 확장 번호 형식 길이 / WORD extended number format length
            let format_length = WORD::from_le_bytes([data[offset], data[offset + 1]]);
            offset += 2;

            // WCHAR array[format_length] 확장 번호 형식 문자열 / WCHAR array[format_length] extended number format string
            let format_bytes = format_length as usize * 2;
            if offset + format_bytes > data.len() {
                // 확장 레벨 데이터가 불완전할 수 있음 / Extended level data may be incomplete
                break;
            }
            let format_string = decode_utf16le(&data[offset..offset + format_bytes])
                .map_err(|e| HwpError::EncodingError {
                    reason: format!("Failed to decode extended numbering format: {}", e),
                })?;
            offset += format_bytes;

            extended_levels.push(ExtendedNumberingLevel {
                format_length,
                format_string,
            });
        }

        Ok(Numbering {
            levels,
            extended_levels,
        })
    }
}
