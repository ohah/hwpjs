/// Numbering 구조체 / Numbering structure
///
/// 스펙 문서 매핑: 표 38 - 문단 번호 / Spec mapping: Table 38 - Paragraph numbering
/// Tag ID: HWPTAG_NUMBERING
/// 전체 길이: 가변 / Total length: variable
use crate::error::HwpError;
use crate::types::{decode_utf16le, HWPUNIT16, UINT16, UINT32, WORD};
use serde::{Deserialize, Serialize};

/// 번호 종류 (표 41) / Number type (Table 41)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NumberType {
    /// 아라비아 숫자 (1, 2, 3, ...) / Arabic numerals
    Arabic = 0,
    /// 동그라미 숫자 (①, ②, ③, ...) / Circled digits
    CircledDigits = 1,
    /// 대문자 로마 숫자 (I, II, III, ...) / Upper roman numerals
    UpperRoman = 2,
    /// 소문자 로마 숫자 (i, ii, iii, ...) / Lower roman numerals
    LowerRoman = 3,
    /// 대문자 알파벳 (A, B, C, ...) / Upper alpha
    UpperAlpha = 4,
    /// 소문자 알파벳 (a, b, c, ...) / Lower alpha
    LowerAlpha = 5,
    /// 한글 가나다 (가, 나, 다, ...) / Hangul ga-na-da
    HangulGa = 8,
    /// 한글 가나다 순환 / Hangul ga-na-da cycle
    HangulGaCycle = 9,
}

impl NumberType {
    fn from_bits(bits: u32) -> Self {
        match (bits >> 5) & 0x0F {
            0 => NumberType::Arabic,
            1 => NumberType::CircledDigits,
            2 => NumberType::UpperRoman,
            3 => NumberType::LowerRoman,
            4 => NumberType::UpperAlpha,
            5 => NumberType::LowerAlpha,
            8 => NumberType::HangulGa,
            9 => NumberType::HangulGaCycle,
            _ => NumberType::Arabic,
        }
    }
}

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
    /// 번호 종류 / Number type
    pub number_type: NumberType,
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
    /// HWP 스펙 표 38 준수: 레벨별 인터리브 + 후미 그룹 레이아웃
    /// Per-level (7회 반복):
    ///   attr(UINT32, 4) + width(HWPUNIT16, 2) + dist(HWPUNIT16, 2)
    ///   + char_shape_id(UINT32, 4) + format_length(WORD, 2) + format_string(WCHAR[], var)
    /// 후미 그룹:
    ///   start_numbers[0..6] → 7 × UINT16 = 14 bytes
    ///   level_start_numbers[0..6] → 7 × UINT32 = 28 bytes (v5.0.2.5+, optional)
    ///   extended_levels[0..2] → 3 × (WORD + WCHAR[])
    ///
    /// # Arguments
    /// * `data` - Numbering 레코드 데이터 / Numbering record data
    /// * `version` - HWP 파일 버전 (5.0.2.5 이상에서 수준별 시작번호 지원)
    ///
    /// # Returns
    /// 파싱된 Numbering 구조체 / Parsed Numbering structure
    pub fn parse(data: &[u8], version: u32) -> Result<Self, HwpError> {
        let mut offset = 0;
        const NUM_LEVELS: usize = 7;

        // 레벨별 인터리브 파싱 (7개 수준)
        // 각 레벨: attr(4) + width(2) + dist(2) + char_shape_id(4) + format_length(2) + format_string(var)
        let mut attrs = [0u32; NUM_LEVELS];
        let mut widths = [0i16; NUM_LEVELS];
        let mut distances = [0i16; NUM_LEVELS];
        let mut char_shape_ids = [0u32; NUM_LEVELS];
        let mut format_lengths = [0u16; NUM_LEVELS];
        let mut format_strings: Vec<String> = Vec::with_capacity(NUM_LEVELS);

        for i in 0..NUM_LEVELS {
            // attr (UINT32, 4 bytes)
            if offset + 4 <= data.len() {
                attrs[i] = UINT32::from_le_bytes([
                    data[offset],
                    data[offset + 1],
                    data[offset + 2],
                    data[offset + 3],
                ]);
                offset += 4;
            }

            // width (HWPUNIT16, 2 bytes)
            if offset + 2 <= data.len() {
                widths[i] = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
                offset += 2;
            }

            // distance (HWPUNIT16, 2 bytes)
            if offset + 2 <= data.len() {
                distances[i] = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
                offset += 2;
            }

            // char_shape_id (UINT32, 4 bytes)
            if offset + 4 <= data.len() {
                char_shape_ids[i] = UINT32::from_le_bytes([
                    data[offset],
                    data[offset + 1],
                    data[offset + 2],
                    data[offset + 3],
                ]);
                offset += 4;
            }

            // format_length (WORD, 2 bytes) + format_string (WCHAR[], var bytes)
            if offset + 2 <= data.len() {
                let len = WORD::from_le_bytes([data[offset], data[offset + 1]]);
                offset += 2;
                format_lengths[i] = len;

                let format_bytes = len as usize * 2;
                if format_bytes > 0 && offset + format_bytes <= data.len() {
                    let s =
                        decode_utf16le(&data[offset..offset + format_bytes]).map_err(|e| {
                            HwpError::EncodingError {
                                reason: format!("Failed to decode numbering format: {}", e),
                            }
                        })?;
                    offset += format_bytes;
                    format_strings.push(s);
                } else {
                    if format_bytes > 0 {
                        offset = data.len().min(offset + format_bytes);
                    }
                    format_strings.push(String::new());
                }
            } else {
                format_strings.push(String::new());
            }
        }

        // 후미 그룹: start_numbers[0..6] → 7 × UINT16 = 14 bytes
        let mut start_numbers = [0u16; NUM_LEVELS];
        for i in 0..NUM_LEVELS {
            if offset + 2 > data.len() {
                break;
            }
            start_numbers[i] = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
            offset += 2;
        }

        // 후미 그룹: level_start_numbers[0..6] → 7 × UINT32 = 28 bytes (v5.0.2.5+, optional)
        let mut level_start_numbers = [None; NUM_LEVELS];
        if version >= 0x00020500 {
            for i in 0..NUM_LEVELS {
                if offset + 4 > data.len() {
                    break;
                }
                level_start_numbers[i] = Some(UINT32::from_le_bytes([
                    data[offset],
                    data[offset + 1],
                    data[offset + 2],
                    data[offset + 3],
                ]));
                offset += 4;
            }
        }

        // 7개 수준 조립 / Assemble 7 levels
        let mut levels = Vec::with_capacity(NUM_LEVELS);
        for i in 0..NUM_LEVELS {
            let attributes = NumberingHeaderAttributes {
                align_type: ParagraphAlignType::from_bits(attrs[i]),
                instance_like: (attrs[i] & 0x00000004) != 0,
                auto_outdent: (attrs[i] & 0x00000008) != 0,
                distance_type: DistanceType::from_bit((attrs[i] & 0x00000010) != 0),
                number_type: NumberType::from_bits(attrs[i]),
            };
            levels.push(NumberingLevelInfo {
                attributes,
                width: widths[i],
                distance: distances[i],
                char_shape_id: char_shape_ids[i],
                format_length: format_lengths[i],
                format_string: format_strings[i].clone(),
                start_number: start_numbers[i],
                level_start_number: level_start_numbers[i],
            });
        }

        // 확장 번호 형식 파싱 (3개 수준, 8~10) / Parse extended number format (3 levels, 8~10)
        let mut extended_levels = Vec::new();
        for _ in 0..3 {
            if offset + 2 > data.len() {
                break;
            }

            let format_length = WORD::from_le_bytes([data[offset], data[offset + 1]]);
            offset += 2;

            let format_bytes = format_length as usize * 2;
            if offset + format_bytes > data.len() {
                break;
            }
            let format_string =
                decode_utf16le(&data[offset..offset + format_bytes]).map_err(|e| {
                    HwpError::EncodingError {
                        reason: format!("Failed to decode extended numbering format: {}", e),
                    }
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
