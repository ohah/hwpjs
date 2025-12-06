/// ParaShape 구조체 / ParaShape structure
///
/// 스펙 문서 매핑: 표 43 - 문단 모양 / Spec mapping: Table 43 - Paragraph shape
/// Tag ID: HWPTAG_PARA_SHAPE
/// 전체 길이: 54바이트 / Total length: 54 bytes
use crate::error::HwpError;
use crate::types::{INT16, INT32, UINT16, UINT32, UINT8};
use serde::{Deserialize, Serialize};

/// 문단 모양 속성1 / Paragraph shape attributes 1
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParaShapeAttributes1 {
    /// 줄 간격 종류(한글 2007 이하 버전) / Line spacing type (HWP 2007 and below)
    pub line_spacing_type_old: LineSpacingTypeOld,
    /// 정렬 방법 / Alignment method
    pub align: ParagraphAlignment,
    /// 줄 나눔 기준 영문 단위 / Line break unit for English
    pub line_divide_en: LineDivideUnit,
    /// 줄 나눔 기준 한글 단위 / Line break unit for Korean
    pub line_divide_ko: LineDivideUnit,
    /// 편집 용지의 줄 격자 사용 여부 / Use line grid of editing paper
    pub use_line_grid: bool,
    /// 최소 공백 값(0%~75%) / Minimum blank value (0%~75%)
    pub blank_min_value: UINT8,
    /// 외톨이 줄 보호 / Protect orphan line
    pub protect_orphan_line: bool,
    /// 다음 문단과 함께 / With next paragraph
    pub with_next_paragraph: bool,
    /// 문단 보호 / Protect paragraph
    pub protect_paragraph: bool,
    /// 문단 앞에서 항상 쪽 나눔 / Always page break before paragraph
    pub always_page_break_before: bool,
    /// 세로 정렬 / Vertical alignment
    pub vertical_align: VerticalAlignment,
    /// 글꼴에 맞는 줄 높이 / Line height matches font
    pub line_height_matches_font: bool,
    /// 문단 머리 모양 종류 / Paragraph header shape type
    pub header_shape_type: HeaderShapeType,
    /// 문단 수준(1~7) / Paragraph level (1~7)
    pub paragraph_level: UINT8,
    /// 문단 테두리 연결 / Connect paragraph border
    pub connect_border: bool,
    /// 문단 여백 무시 / Ignore paragraph margin
    pub ignore_margin: bool,
    /// 문단 꼬리 모양 / Paragraph tail shape
    pub tail_shape: bool,
}

/// 줄 간격 종류(한글 2007 이하 버전) / Line spacing type (HWP 2007 and below)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LineSpacingTypeOld {
    /// 글자에 따라(%) / By character (%)
    ByCharacter = 0,
    /// 고정값 / Fixed value
    Fixed = 1,
    /// 여백만 지정 / Margin only
    MarginOnly = 2,
}

impl LineSpacingTypeOld {
    fn from_bits(bits: u32) -> Self {
        match bits & 0x00000003 {
            1 => LineSpacingTypeOld::Fixed,
            2 => LineSpacingTypeOld::MarginOnly,
            _ => LineSpacingTypeOld::ByCharacter,
        }
    }
}

/// 정렬 방법 / Alignment method
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ParagraphAlignment {
    /// 양쪽 정렬 / Justify
    Justify = 0,
    /// 왼쪽 / Left
    Left = 1,
    /// 오른쪽 / Right
    Right = 2,
    /// 가운데 / Center
    Center = 3,
    /// 배분 / Distribute
    Distribute = 4,
    /// 나눔 / Divide
    Divide = 5,
}

impl ParagraphAlignment {
    fn from_bits(bits: u32) -> Self {
        match (bits >> 2) & 0x00000007 {
            1 => ParagraphAlignment::Left,
            2 => ParagraphAlignment::Right,
            3 => ParagraphAlignment::Center,
            4 => ParagraphAlignment::Distribute,
            5 => ParagraphAlignment::Divide,
            _ => ParagraphAlignment::Justify,
        }
    }
}

/// 줄 나눔 기준 단위 / Line break unit
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LineDivideUnit {
    /// 단어 / Word
    Word = 0,
    /// 하이픈 / Hyphen
    Hyphen = 1,
    /// 글자 / Character
    Character = 2,
}

impl LineDivideUnit {
    fn from_bits_en(bits: u32) -> Self {
        match (bits >> 5) & 0x00000003 {
            1 => LineDivideUnit::Hyphen,
            2 => LineDivideUnit::Character,
            _ => LineDivideUnit::Word,
        }
    }

    fn from_bit_ko(bit: bool) -> Self {
        if bit {
            LineDivideUnit::Character
        } else {
            LineDivideUnit::Word
        }
    }
}

/// 세로 정렬 / Vertical alignment
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VerticalAlignment {
    /// 글꼴 기준선 / Font baseline
    Baseline = 0,
    /// 위 / Top
    Top = 1,
    /// 가운데 / Center
    Center = 2,
    /// 아래 / Bottom
    Bottom = 3,
}

impl VerticalAlignment {
    fn from_bits(bits: u32) -> Self {
        match (bits >> 20) & 0x00000003 {
            1 => VerticalAlignment::Top,
            2 => VerticalAlignment::Center,
            3 => VerticalAlignment::Bottom,
            _ => VerticalAlignment::Baseline,
        }
    }
}

/// 문단 머리 모양 종류 / Paragraph header shape type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HeaderShapeType {
    /// 없음 / None
    None = 0,
    /// 개요 / Outline
    Outline = 1,
    /// 번호 / Number
    Number = 2,
    /// 글머리표 / Bullet
    Bullet = 3,
}

impl HeaderShapeType {
    fn from_bits(bits: u32) -> Self {
        match (bits >> 23) & 0x00000003 {
            1 => HeaderShapeType::Outline,
            2 => HeaderShapeType::Number,
            3 => HeaderShapeType::Bullet,
            _ => HeaderShapeType::None,
        }
    }
}

/// 문단 모양 속성2 / Paragraph shape attributes 2
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParaShapeAttributes2 {
    /// 한 줄 입력 / Single line input
    pub single_line_input: UINT8,
    /// 한글과 영문 사이 자동 간격 조정 / Auto spacing adjustment between Korean and English
    pub auto_spacing_ko_en: bool,
    /// 한글과 숫자 사이 자동 간격 조정 / Auto spacing adjustment between Korean and number
    pub auto_spacing_ko_num: bool,
}

/// 줄 간격 종류 (5.0.2.5 이상) / Line spacing type (5.0.2.5+)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LineSpacingType {
    /// 글자에 따라 / By character
    ByCharacter = 0,
    /// 고정값 / Fixed value
    Fixed = 1,
    /// 여백만 지정 / Margin only
    MarginOnly = 2,
    /// 최소값 / Minimum value
    Minimum = 3,
}

impl LineSpacingType {
    fn from_bits(bits: u32) -> Self {
        match bits & 0x0000001F {
            1 => LineSpacingType::Fixed,
            2 => LineSpacingType::MarginOnly,
            3 => LineSpacingType::Minimum,
            _ => LineSpacingType::ByCharacter,
        }
    }
}

/// 문단 모양 속성3 / Paragraph shape attributes 3
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParaShapeAttributes3 {
    /// 줄 간격 종류 (bit 0-4, 표 46 참조) / Line spacing type (bit 0-4, See Table 46)
    pub line_spacing_type: LineSpacingType,
}

/// ParaShape 구조체 / ParaShape structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParaShape {
    /// 속성1 (표 44) / Attributes 1 (Table 44)
    pub attributes1: ParaShapeAttributes1,
    /// 왼쪽 여백 / Left margin
    pub left_margin: INT32,
    /// 오른쪽 여백 / Right margin
    pub right_margin: INT32,
    /// 들여쓰기 / Indent
    pub indent: INT32,
    /// 내어쓰기 / Outdent
    pub outdent: INT32,
    /// 문단 위 간격 / Paragraph top spacing
    pub top_spacing: INT32,
    /// 문단 아래 간격 / Paragraph bottom spacing
    pub bottom_spacing: INT32,
    /// 줄 간격(한글 2007 이하 버전) / Line spacing (HWP 2007 and below)
    pub line_spacing_old: INT32,
    /// 탭 정의 ID 참조 값 / Tab definition ID reference
    pub tab_def_id: UINT16,
    /// 번호/글머리표 ID 참조 값 / Number/bullet ID reference
    pub number_bullet_id: UINT16,
    /// 테두리/배경 ID 참조 값 / Border/fill ID reference
    pub border_fill_id: UINT16,
    /// 문단 테두리 간격(왼쪽) / Paragraph border spacing (left)
    pub border_spacing_left: INT16,
    /// 문단 테두리 간격(오른쪽) / Paragraph border spacing (right)
    pub border_spacing_right: INT16,
    /// 문단 테두리 간격(위) / Paragraph border spacing (top)
    pub border_spacing_top: INT16,
    /// 문단 테두리 간격(아래) / Paragraph border spacing (bottom)
    pub border_spacing_bottom: INT16,
    /// 속성2 (표 45, 5.0.1.7 이상, 옵션) / Attributes 2 (Table 45, 5.0.1.7+, optional)
    pub attributes2: Option<ParaShapeAttributes2>,
    /// 속성3 (표 46, 5.0.2.5 이상, 옵션) / Attributes 3 (Table 46, 5.0.2.5+, optional)
    pub attributes3: Option<ParaShapeAttributes3>,
    /// 줄 간격(5.0.2.5 이상, 옵션) / Line spacing (5.0.2.5+, optional)
    pub line_spacing: Option<INT32>,
}

impl ParaShape {
    /// ParaShape을 바이트 배열에서 파싱합니다. / Parse ParaShape from byte array.
    ///
    /// # Arguments
    /// * `data` - ParaShape 레코드 데이터 / ParaShape record data
    /// * `version` - HWP 파일 버전 (5.0.1.7 이상에서 속성2 지원, 5.0.2.5 이상에서 속성3 및 줄 간격 지원) / HWP file version (attributes2 supported in 5.0.1.7+, attributes3 and line spacing in 5.0.2.5+)
    ///
    /// # Returns
    /// 파싱된 ParaShape 구조체 / Parsed ParaShape structure
    pub fn parse(data: &[u8], version: u32) -> Result<Self, HwpError> {
        // 최소 46바이트 필요 (속성1 4 + 여백/간격 28 + ID 6 + 테두리 간격 8) / Need at least 46 bytes
        if data.len() < 46 {
            return Err(HwpError::insufficient_data("ParaShape", 46, data.len()));
        }

        let mut offset = 0;

        // UINT32 속성1 (표 44) / UINT32 attributes1 (Table 44)
        let attr1_value = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        let attributes1 = ParaShapeAttributes1 {
            line_spacing_type_old: LineSpacingTypeOld::from_bits(attr1_value),
            align: ParagraphAlignment::from_bits(attr1_value),
            line_divide_en: LineDivideUnit::from_bits_en(attr1_value),
            line_divide_ko: LineDivideUnit::from_bit_ko((attr1_value & 0x00000080) != 0),
            use_line_grid: (attr1_value & 0x00000100) != 0,
            blank_min_value: ((attr1_value >> 9) & 0x0000007F) as UINT8,
            protect_orphan_line: (attr1_value & 0x00010000) != 0,
            with_next_paragraph: (attr1_value & 0x00020000) != 0,
            protect_paragraph: (attr1_value & 0x00040000) != 0,
            always_page_break_before: (attr1_value & 0x00080000) != 0,
            vertical_align: VerticalAlignment::from_bits(attr1_value),
            line_height_matches_font: (attr1_value & 0x00400000) != 0,
            header_shape_type: HeaderShapeType::from_bits(attr1_value),
            paragraph_level: ((attr1_value >> 25) & 0x00000007) as UINT8,
            connect_border: (attr1_value & 0x10000000) != 0,
            ignore_margin: (attr1_value & 0x20000000) != 0,
            tail_shape: (attr1_value & 0x40000000) != 0,
        };

        // INT32 왼쪽 여백 / INT32 left margin
        let left_margin = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // INT32 오른쪽 여백 / INT32 right margin
        let right_margin = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // INT32 들여쓰기 / INT32 indent
        let indent = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // INT32 내어쓰기 / INT32 outdent
        let outdent = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // INT32 문단 위 간격 / INT32 paragraph top spacing
        let top_spacing = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // INT32 문단 아래 간격 / INT32 paragraph bottom spacing
        let bottom_spacing = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // INT32 줄 간격(한글 2007 이하 버전) / INT32 line spacing (HWP 2007 and below)
        let line_spacing_old = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // UINT16 탭 정의 ID 참조 값 / UINT16 tab definition ID reference
        let tab_def_id = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT16 번호/글머리표 ID 참조 값 / UINT16 number/bullet ID reference
        let number_bullet_id = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT16 테두리/배경 ID 참조 값 / UINT16 border/fill ID reference
        let border_fill_id = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // INT16 문단 테두리 간격(왼쪽) / INT16 paragraph border spacing (left)
        let border_spacing_left = INT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // INT16 문단 테두리 간격(오른쪽) / INT16 paragraph border spacing (right)
        let border_spacing_right = INT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // INT16 문단 테두리 간격(위) / INT16 paragraph border spacing (top)
        let border_spacing_top = INT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // INT16 문단 테두리 간격(아래) / INT16 paragraph border spacing (bottom)
        let border_spacing_bottom = INT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT32 속성2 (표 45, 5.0.1.7 이상) / UINT32 attributes2 (Table 45, 5.0.1.7+)
        let attributes2 = if version >= 0x00010107 && offset + 4 <= data.len() {
            let attr2_value = UINT32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]);
            offset += 4;
            Some(ParaShapeAttributes2 {
                single_line_input: (attr2_value & 0x00000003) as UINT8,
                auto_spacing_ko_en: (attr2_value & 0x00000010) != 0,
                auto_spacing_ko_num: (attr2_value & 0x00000020) != 0,
            })
        } else {
            None
        };

        // UINT32 속성3 (표 46, 5.0.2.5 이상) / UINT32 attributes3 (Table 46, 5.0.2.5+)
        let attributes3 = if version >= 0x00020500 && offset + 4 <= data.len() {
            let attr3_value = UINT32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]);
            offset += 4;
            Some(ParaShapeAttributes3 {
                line_spacing_type: LineSpacingType::from_bits(attr3_value),
            })
        } else {
            None
        };

        // INT32 줄 간격(5.0.2.5 이상) / INT32 line spacing (5.0.2.5+)
        let line_spacing = if version >= 0x00020500 && offset + 4 <= data.len() {
            let value = INT32::from_le_bytes([
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

        Ok(ParaShape {
            attributes1,
            left_margin,
            right_margin,
            indent,
            outdent,
            top_spacing,
            bottom_spacing,
            line_spacing_old,
            tab_def_id,
            number_bullet_id,
            border_fill_id,
            border_spacing_left,
            border_spacing_right,
            border_spacing_top,
            border_spacing_bottom,
            attributes2,
            attributes3,
            line_spacing,
        })
    }
}
