/// Character Shape 구조체 / Character Shape structure
///
/// 스펙 문서 매핑: 표 33 - 글자 모양 / Spec mapping: Table 33 - Character shape
/// Tag ID: HWPTAG_CHAR_SHAPE
/// 전체 길이: 72 바이트 / Total length: 72 bytes
use crate::error::HwpError;
use crate::types::{COLORREF, INT32, INT8, UINT16, UINT32, UINT8, WORD};
use serde::{Deserialize, Serialize};

/// 언어별 글꼴 정보 / Language-specific font information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguageFontInfo {
    /// 한글 글꼴 ID / Korean font ID
    pub korean: WORD,
    /// 영어 글꼴 ID / English font ID
    pub english: WORD,
    /// 한자 글꼴 ID / Chinese font ID
    pub chinese: WORD,
    /// 일어 글꼴 ID / Japanese font ID
    pub japanese: WORD,
    /// 기타 글꼴 ID / Other font ID
    pub other: WORD,
    /// 기호 글꼴 ID / Symbol font ID
    pub symbol: WORD,
    /// 사용자 글꼴 ID / User font ID
    pub user: WORD,
}

/// 언어별 글자 속성 정보 (UINT8) / Language-specific character attribute information (UINT8)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguageCharAttributesU8 {
    /// 한글 / Korean
    pub korean: UINT8,
    /// 영어 / English
    pub english: UINT8,
    /// 한자 / Chinese
    pub chinese: UINT8,
    /// 일어 / Japanese
    pub japanese: UINT8,
    /// 기타 / Other
    pub other: UINT8,
    /// 기호 / Symbol
    pub symbol: UINT8,
    /// 사용자 / User
    pub user: UINT8,
}

/// 언어별 글자 속성 정보 (INT8) / Language-specific character attribute information (INT8)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguageCharAttributesI8 {
    /// 한글 / Korean
    pub korean: INT8,
    /// 영어 / English
    pub english: INT8,
    /// 한자 / Chinese
    pub chinese: INT8,
    /// 일어 / Japanese
    pub japanese: INT8,
    /// 기타 / Other
    pub other: INT8,
    /// 기호 / Symbol
    pub symbol: INT8,
    /// 사용자 / User
    pub user: INT8,
}

/// 글자 모양 속성 / Character shape attributes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharShapeAttributes {
    /// 기울임 여부 / Italic
    pub italic: bool,
    /// 진하게 여부 / Bold
    pub bold: bool,
    /// 밑줄 종류 (0: 없음, 1: 글자 아래, 2: 글자 위) / Underline type (0: none, 1: below, 2: above)
    pub underline_type: UINT8, // bits 2-3
    /// 밑줄 모양 (0-6) / Underline style (0-6)
    pub underline_style: UINT8, // bits 4-7
    /// 외곽선 종류 (0: 없음, 1: 비연속, 2: 연속) / Outline type (0: none, 1: non-continuous, 2: continuous)
    pub outline_type: UINT8, // bits 8-10
    /// 그림자 종류 / Shadow type
    pub shadow_type: UINT8, // bits 11-12
    /// 양각 여부 / Emboss
    pub emboss: bool, // bit 13
    /// 음각 여부 / Engrave
    pub engrave: bool, // bit 14
    /// 위 첨자 여부 / Superscript
    pub superscript: bool, // bit 15
    /// 아래 첨자 여부 / Subscript
    pub subscript: bool, // bit 16
    /// 취소선 여부 (0: 없음, 1 이상: 있음) / Strikethrough (0: none, 1+: present)
    /// 스펙 문서 표 35: bit 18-20 / Spec Table 35: bit 18-20
    pub strikethrough: UINT8,
    /// 강조점 종류 / Emphasis mark type
    pub emphasis_mark: UINT8, // bits 21-24
    /// 글꼴에 어울리는 빈칸 사용 여부 / Use font-appropriate spacing
    pub use_font_spacing: bool, // bit 25
    /// 취소선 모양 (표 25 참조) / Strikethrough style (Table 25)
    pub strikethrough_style: UINT8, // bits 26-29
    /// Kerning 여부 / Kerning
    pub kerning: bool, // bit 30
}

/// Character Shape 구조체 / Character Shape structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharShape {
    /// 언어별 글꼴 ID (표 34) / Language-specific font IDs (Table 34)
    pub font_ids: LanguageFontInfo,
    /// 언어별 장평, 50%~200% / Language-specific font stretch, 50%~200%
    pub font_stretch: LanguageCharAttributesU8,
    /// 언어별 자간, -50%~50% / Language-specific letter spacing, -50%~50%
    pub letter_spacing: LanguageCharAttributesI8,
    /// 언어별 상대 크기, 10%~250% / Language-specific relative size, 10%~250%
    pub relative_size: LanguageCharAttributesU8,
    /// 언어별 글자 위치, -100%~100% / Language-specific text position, -100%~100%
    pub text_position: LanguageCharAttributesI8,
    /// 기준 크기, 0pt~4096pt / Base size, 0pt~4096pt
    pub base_size: INT32,
    /// 속성 (표 35) / Attributes (Table 35)
    pub attributes: CharShapeAttributes,
    /// 그림자 간격 X, -100%~100% / Shadow spacing X, -100%~100%
    pub shadow_spacing_x: INT8,
    /// 그림자 간격 Y, -100%~100% / Shadow spacing Y, -100%~100%
    pub shadow_spacing_y: INT8,
    /// 글자 색 / Text color
    pub text_color: COLORREF,
    /// 밑줄 색 / Underline color
    pub underline_color: COLORREF,
    /// 음영 색 / Shading color
    pub shading_color: COLORREF,
    /// 그림자 색 / Shadow color
    pub shadow_color: COLORREF,
    /// 글자 테두리/배경 ID (5.0.2.1 이상) / Character border/fill ID (5.0.2.1 and above)
    pub border_fill_id: Option<UINT16>,
    /// 취소선 색 (5.0.3.0 이상) / Strikethrough color (5.0.3.0 and above)
    pub strikethrough_color: Option<COLORREF>,
}

impl CharShape {
    /// CharShape를 바이트 배열에서 파싱합니다. / Parse CharShape from byte array.
    ///
    /// # Arguments
    /// * `data` - 최소 66바이트의 데이터 (기본 66바이트, 버전에 따라 최대 72바이트) / At least 66 bytes of data (basic 66 bytes, up to 72 bytes depending on version)
    /// * `version` - FileHeader의 version (버전에 따라 필드 개수가 다를 수 있음) / FileHeader version (field count may vary by version)
    ///
    /// # Returns
    /// 파싱된 CharShape 구조체 / Parsed CharShape structure
    pub fn parse(data: &[u8], _version: u32) -> Result<Self, HwpError> {
        // 최소 66바이트 필요 / Need at least 66 bytes
        if data.len() < 66 {
            return Err(HwpError::insufficient_data("CharShape", 66, data.len()));
        }

        let mut offset = 0;

        // WORD array[7] 언어별 글꼴 ID / WORD array[7] language-specific font IDs
        let font_ids = LanguageFontInfo {
            korean: WORD::from_le_bytes([data[offset], data[offset + 1]]),
            english: WORD::from_le_bytes([data[offset + 2], data[offset + 3]]),
            chinese: WORD::from_le_bytes([data[offset + 4], data[offset + 5]]),
            japanese: WORD::from_le_bytes([data[offset + 6], data[offset + 7]]),
            other: WORD::from_le_bytes([data[offset + 8], data[offset + 9]]),
            symbol: WORD::from_le_bytes([data[offset + 10], data[offset + 11]]),
            user: WORD::from_le_bytes([data[offset + 12], data[offset + 13]]),
        };
        offset += 14;

        // UINT8 array[7] 언어별 장평 / UINT8 array[7] language-specific font stretch
        let font_stretch = LanguageCharAttributesU8 {
            korean: data[offset] as UINT8,
            english: data[offset + 1] as UINT8,
            chinese: data[offset + 2] as UINT8,
            japanese: data[offset + 3] as UINT8,
            other: data[offset + 4] as UINT8,
            symbol: data[offset + 5] as UINT8,
            user: data[offset + 6] as UINT8,
        };
        offset += 7;

        // INT8 array[7] 언어별 자간 / INT8 array[7] language-specific letter spacing
        // u8을 i8로 캐스팅할 때 부호 확장이 제대로 되도록 i8::from_le_bytes 사용
        // Use i8::from_le_bytes to properly handle sign extension when casting u8 to i8
        let letter_spacing = LanguageCharAttributesI8 {
            korean: i8::from_le_bytes([data[offset]]),
            english: i8::from_le_bytes([data[offset + 1]]),
            chinese: i8::from_le_bytes([data[offset + 2]]),
            japanese: i8::from_le_bytes([data[offset + 3]]),
            other: i8::from_le_bytes([data[offset + 4]]),
            symbol: i8::from_le_bytes([data[offset + 5]]),
            user: i8::from_le_bytes([data[offset + 6]]),
        };
        offset += 7;

        // UINT8 array[7] 언어별 상대 크기 / UINT8 array[7] language-specific relative size
        let relative_size = LanguageCharAttributesU8 {
            korean: data[offset] as UINT8,
            english: data[offset + 1] as UINT8,
            chinese: data[offset + 2] as UINT8,
            japanese: data[offset + 3] as UINT8,
            other: data[offset + 4] as UINT8,
            symbol: data[offset + 5] as UINT8,
            user: data[offset + 6] as UINT8,
        };
        offset += 7;

        // INT8 array[7] 언어별 글자 위치 / INT8 array[7] language-specific text position
        // u8을 i8로 캐스팅할 때 부호 확장이 제대로 되도록 i8::from_le_bytes 사용
        // Use i8::from_le_bytes to properly handle sign extension when casting u8 to i8
        let text_position = LanguageCharAttributesI8 {
            korean: i8::from_le_bytes([data[offset]]),
            english: i8::from_le_bytes([data[offset + 1]]),
            chinese: i8::from_le_bytes([data[offset + 2]]),
            japanese: i8::from_le_bytes([data[offset + 3]]),
            other: i8::from_le_bytes([data[offset + 4]]),
            symbol: i8::from_le_bytes([data[offset + 5]]),
            user: i8::from_le_bytes([data[offset + 6]]),
        };
        offset += 7;

        // INT32 기준 크기 / INT32 base size
        let base_size = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // UINT32 속성 (표 35) / UINT32 attributes (Table 35)
        let attr_value = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // UINT32 속성 파싱 (표 35) / Parse UINT32 attributes (Table 35)
        let attributes = CharShapeAttributes {
            italic: (attr_value & 0x00000001) != 0,
            bold: (attr_value & 0x00000002) != 0,
            underline_type: ((attr_value >> 2) & 0x03) as UINT8,
            underline_style: ((attr_value >> 4) & 0x0F) as UINT8,
            outline_type: ((attr_value >> 8) & 0x07) as UINT8,
            shadow_type: ((attr_value >> 11) & 0x03) as UINT8,
            emboss: (attr_value & 0x00002000) != 0,
            engrave: (attr_value & 0x00004000) != 0,
            superscript: (attr_value & 0x00008000) != 0,
            subscript: (attr_value & 0x00010000) != 0,
            strikethrough: ((attr_value >> 18) & 0x07) as UINT8, // bit 18-20: 취소선 여부 (표 35) / bit 18-20: Strikethrough (Table 35)
            emphasis_mark: ((attr_value >> 21) & 0x0F) as UINT8,
            use_font_spacing: (attr_value & 0x02000000) != 0,
            strikethrough_style: ((attr_value >> 26) & 0x0F) as UINT8,
            kerning: (attr_value & 0x40000000) != 0,
        };

        // INT8 그림자 간격 X / INT8 shadow spacing X
        let shadow_spacing_x = data[offset] as INT8;
        offset += 1;

        // INT8 그림자 간격 Y / INT8 shadow spacing Y
        let shadow_spacing_y = data[offset] as INT8;
        offset += 1;

        // COLORREF 글자 색 / COLORREF text color
        let text_color = COLORREF(u32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]));
        offset += 4;

        // COLORREF 밑줄 색 / COLORREF underline color
        let underline_color = COLORREF(u32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]));
        offset += 4;

        // COLORREF 음영 색 / COLORREF shading color
        let shading_color = COLORREF(u32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]));
        offset += 4;

        // COLORREF 그림자 색 / COLORREF shadow color
        let shadow_color = COLORREF(u32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]));
        offset += 4;

        // UINT16 글자 테두리/배경 ID (5.0.2.1 이상) / UINT16 character border/fill ID (5.0.2.1 and above)
        // 데이터 크기로 판단: 66바이트 이상이면 border_fill_id 필드 존재 / Determine by data size: border_fill_id exists if 66 bytes or more
        let border_fill_id = if data.len() >= 66 && offset + 2 <= data.len() {
            Some(WORD::from_le_bytes([data[offset], data[offset + 1]]))
        } else {
            None
        };
        if border_fill_id.is_some() {
            offset += 2;
        }

        // COLORREF 취소선 색 (5.0.3.0 이상) / COLORREF strikethrough color (5.0.3.0 and above)
        // 데이터 크기로 판단: 70바이트 이상이면 strikethrough_color 필드 존재 / Determine by data size: strikethrough_color exists if 70 bytes or more
        let strikethrough_color = if data.len() >= 70 && offset + 4 <= data.len() {
            Some(COLORREF(u32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ])))
        } else {
            None
        };

        Ok(CharShape {
            font_ids,
            font_stretch,
            letter_spacing,
            relative_size,
            text_position,
            base_size,
            attributes,
            shadow_spacing_x,
            shadow_spacing_y,
            text_color,
            underline_color,
            shading_color,
            shadow_color,
            border_fill_id,
            strikethrough_color,
        })
    }
}
