/// FootnoteShape 구조체 / FootnoteShape structure
///
/// 스펙 문서 매핑: 표 133 - 각주/미주 모양 / Spec mapping: Table 133 - Footnote/endnote shape
use crate::error::HwpError;
use crate::types::{COLORREF, HWPUNIT16, UINT16, UINT32, UINT8, WCHAR};
use serde::{Deserialize, Serialize};

/// 각주/미주 모양 / Footnote/endnote shape
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FootnoteShape {
    /// 속성 / Attributes
    pub attributes: FootnoteShapeAttributes,
    /// 사용자 기호 / Custom symbol
    pub custom_symbol: WCHAR,
    /// 앞 장식 문자 / Front decoration character
    pub front_decoration: WCHAR,
    /// 뒤 장식 문자 / Back decoration character
    pub back_decoration: WCHAR,
    /// 시작 번호 / Start number
    pub start_number: UINT16,
    /// 구분선 길이 / Breakline length
    pub breakline_length: HWPUNIT16,
    /// 구분선 위 여백 / Breakline top margin
    pub breakline_top_margin: HWPUNIT16,
    /// 구분선 아래 여백 / Breakline bottom margin
    pub breakline_bottom_margin: HWPUNIT16,
    /// 주석 사이 여백 / Remark between margin
    pub remark_between_margin: HWPUNIT16,
    /// 구분선 종류 / Breakline type
    pub breakline_type: UINT8,
    /// 구분선 굵기 / Breakline thickness
    pub breakline_thickness: UINT8,
    /// 구분선 색상 / Breakline color
    pub breakline_color: COLORREF,
}

/// 각주/미주 모양 속성 / Footnote/endnote shape attributes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FootnoteShapeAttributes {
    /// 번호 모양 / Number shape
    pub number_shape: NumberShape,
    /// 한 페이지 내에서 각주를 다단에 위치시킬 방법 / Page position method for footnotes in multi-column
    pub page_position: PagePosition,
    /// 번호 매기기 방법 / Numbering method
    pub numbering: NumberingMethod,
    /// 각주 내용 중 번호 코드의 모양을 위 첨자 형식으로 할지 여부 / Superscript format for number code in footnote content
    pub superscript: bool,
    /// 텍스트에 이어 바로 출력할지 여부 / Output immediately after text
    pub prefix: bool,
}

/// 번호 모양 / Number shape
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NumberShape {
    /// 1, 2, 3
    Arabic,
    /// 동그라미 쳐진 1, 2, 3
    CircledArabic,
    /// I, II, III
    RomanUpper,
    /// i, ii, iii
    RomanLower,
    /// A, B, C
    AlphaUpper,
    /// a, b, c
    AlphaLower,
    /// 동그라미 쳐진 A, B, C
    CircledAlphaUpper,
    /// 동그라미 쳐진 a, b, c
    CircledAlphaLower,
    /// 가, 나, 다
    Hangul,
    /// 동그라미 쳐진 가, 나, 다
    CircledHangul,
    /// ㄱ, ㄴ, ㄷ
    HangulJamo,
    /// 동그라미 쳐진 ㄱ, ㄴ, ㄷ
    CircledHangulJamo,
    /// 일, 이, 삼
    HangulNumber,
    /// 一, 二, 三
    ChineseNumber,
    /// 동그라미 쳐진 一, 二, 三
    CircledChineseNumber,
    /// 갑, 을, 병, 정, 무, 기, 경, 신, 임, 계
    HeavenlyStem,
    /// 甲, 乙, 丙, 丁, 戊, 己, 庚, 辛, 壬, 癸
    HeavenlyStemChinese,
    /// 4가지 문자가 차례로 반복
    FourCharRepeat,
    /// 사용자 지정 문자 반복
    CustomCharRepeat,
}

/// 한 페이지 내에서 각주를 다단에 위치시킬 방법 / Page position method for footnotes in multi-column
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PagePosition {
    /// (각주인 경우) 각 단마다 따로 배열 / (For footnote) Arrange separately for each column
    /// (미주인 경우) 문서의 마지막 / (For endnote) End of document
    Separate,
    /// (각주인 경우) 통단으로 배열 / (For footnote) Arrange across columns
    /// (미주인 경우) 구역의 마지막 / (For endnote) End of section
    Across,
    /// (각주인 경우) 가장 오른쪽 단에 배열 / (For footnote) Arrange in rightmost column
    Rightmost,
}

/// 번호 매기기 방법 / Numbering method
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NumberingMethod {
    /// 앞 구역에 이어서 / Continue from previous section
    Continue,
    /// 현재 구역부터 새로 시작 / Start from current section
    Restart,
    /// 쪽마다 새로 시작(각주 전용) / Restart per page (footnote only)
    PerPage,
}

impl FootnoteShape {
    /// FootnoteShape를 바이트 배열에서 파싱합니다. / Parse FootnoteShape from byte array.
    ///
    /// # Arguments
    /// * `data` - 최소 26바이트의 데이터 / At least 26 bytes of data
    ///
    /// # Returns
    /// 파싱된 FootnoteShape 구조체 / Parsed FootnoteShape structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 26 {
            return Err(HwpError::insufficient_data("FootnoteShape", 26, data.len()));
        }

        let mut offset = 0;

        // UINT32 속성 (표 134 참조) / UINT32 attributes (see Table 134)
        let attribute_value = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 속성 파싱 (표 134) / Parse attributes (Table 134)
        let attributes = parse_footnote_shape_attributes(attribute_value);

        // WCHAR 사용자 기호 / WCHAR custom symbol
        let custom_symbol = WCHAR::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // WCHAR 앞 장식 문자 / WCHAR front decoration character
        let front_decoration = WCHAR::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // WCHAR 뒤 장식 문자 / WCHAR back decoration character
        let back_decoration = WCHAR::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT16 시작 번호 / UINT16 start number
        let start_number = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // HWPUNIT16 구분선 길이 / HWPUNIT16 breakline length
        let breakline_length = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // HWPUNIT16 구분선 위 여백 / HWPUNIT16 breakline top margin
        let breakline_top_margin = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // HWPUNIT16 구분선 아래 여백 / HWPUNIT16 breakline bottom margin
        let breakline_bottom_margin = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // HWPUNIT16 주석 사이 여백 / HWPUNIT16 remark between margin
        let remark_between_margin = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT8 구분선 종류 / UINT8 breakline type
        let breakline_type = data[offset];
        offset += 1;

        // UINT8 구분선 굵기 / UINT8 breakline thickness
        let breakline_thickness = data[offset];
        offset += 1;

        // COLORREF 구분선 색상 / COLORREF breakline color
        let breakline_color = COLORREF(u32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]));
        offset += 4;

        Ok(FootnoteShape {
            attributes,
            custom_symbol,
            front_decoration,
            back_decoration,
            start_number,
            breakline_length,
            breakline_top_margin,
            breakline_bottom_margin,
            remark_between_margin,
            breakline_type,
            breakline_thickness,
            breakline_color,
        })
    }
}

/// 각주/미주 모양 속성 파싱 (표 134) / Parse footnote/endnote shape attributes (Table 134)
fn parse_footnote_shape_attributes(value: UINT32) -> FootnoteShapeAttributes {
    // bit 0-7: 번호 모양 / bit 0-7: number shape
    let number_shape_value = (value & 0xFF) as u8;
    let number_shape = match number_shape_value {
        0 => NumberShape::Arabic,
        1 => NumberShape::CircledArabic,
        2 => NumberShape::RomanUpper,
        3 => NumberShape::RomanLower,
        4 => NumberShape::AlphaUpper,
        5 => NumberShape::AlphaLower,
        6 => NumberShape::CircledAlphaUpper,
        7 => NumberShape::CircledAlphaLower,
        8 => NumberShape::Hangul,
        9 => NumberShape::CircledHangul,
        10 => NumberShape::HangulJamo,
        11 => NumberShape::CircledHangulJamo,
        12 => NumberShape::HangulNumber,
        13 => NumberShape::ChineseNumber,
        14 => NumberShape::CircledChineseNumber,
        15 => NumberShape::HeavenlyStem,
        16 => NumberShape::HeavenlyStemChinese,
        0x80 => NumberShape::FourCharRepeat,
        0x81 => NumberShape::CustomCharRepeat,
        _ => NumberShape::Arabic, // 기본값 / default
    };

    // bit 8-9: 한 페이지 내에서 각주를 다단에 위치시킬 방법 / bit 8-9: page position method
    let page_position = match (value >> 8) & 0x03 {
        0 => PagePosition::Separate,
        1 => PagePosition::Across,
        2 => PagePosition::Rightmost,
        _ => PagePosition::Separate, // 기본값 / default
    };

    // bit 10-11: numbering / bit 10-11: numbering method
    let numbering = match (value >> 10) & 0x03 {
        0 => NumberingMethod::Continue,
        1 => NumberingMethod::Restart,
        2 => NumberingMethod::PerPage,
        _ => NumberingMethod::Continue, // 기본값 / default
    };

    // bit 12: 각주 내용 중 번호 코드의 모양을 위 첨자 형식으로 할지 여부 / bit 12: superscript format
    let superscript = (value & 0x1000) != 0;

    // bit 13: 텍스트에 이어 바로 출력할지 여부 / bit 13: output immediately after text
    let prefix = (value & 0x2000) != 0;

    FootnoteShapeAttributes {
        number_shape,
        page_position,
        numbering,
        superscript,
        prefix,
    }
}
