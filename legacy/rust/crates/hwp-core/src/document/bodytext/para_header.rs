/// ParaHeader 구조체 / ParaHeader structure
///
/// 스펙 문서 매핑: 표 58 - 문단 헤더 / Spec mapping: Table 58 - Paragraph header
/// Tag ID: HWPTAG_PARA_HEADER
/// 전체 길이: 24바이트 (5.0.3.2 이상) / Total length: 24 bytes (5.0.3.2 and above)
///
/// **레벨별 사용 / Usage by Level**
///
/// - **Level 0**: 본문의 문단 헤더 (일반적인 사용) / Paragraph header in body text (normal usage)
///   - `Section::parse_data`에서 처리되어 `Paragraph` 구조체의 `para_header` 필드로 저장됨
///   - Processed in `Section::parse_data` and stored in `Paragraph` struct's `para_header` field
///
/// - **Level 1 이상**: 컨트롤 헤더 내부의 문단 헤더 / Paragraph header inside control header
///   - 각주/미주(`fn  `, `en  `), 머리말/꼬리말(`head`, `foot`) 등의 컨트롤 헤더 내부에 직접 나타날 수 있음
///   - Can appear directly inside control headers like footnotes/endnotes (`fn  `, `en  `), headers/footers (`head`, `foot`), etc.
///   - `CtrlHeader`의 children에서 처리되어 `ParagraphRecord::CtrlHeader`의 `paragraphs` 필드에 저장됨
///   - Processed in `CtrlHeader`'s children and stored in `ParagraphRecord::CtrlHeader`'s `paragraphs` field
///   - 레거시 코드 참고: `legacy/ruby-hwp/lib/hwp/model.rb`의 `Footnote`, `Header`, `Footer` 등에서
///     `@ctrl_header.para_headers << para_header`로 처리됨
///   - Reference: `legacy/ruby-hwp/lib/hwp/model.rb`'s `Footnote`, `Header`, `Footer`, etc.
///     where `@ctrl_header.para_headers << para_header`
use crate::error::HwpError;
use crate::types::{UINT16, UINT32, UINT8};
use serde::{Deserialize, Serialize};

/// Control Mask 구조체 / Control Mask structure
///
/// libhwp의 HWPControlMask를 참고하여 구현
/// 각 비트는 `(UINT32)(1<<ctrich) 조합`으로, 특정 제어 문자의 존재 여부를 나타냅니다.
/// Control mask structure
///
/// Implemented based on libhwp's HWPControlMask
/// Each bit represents `(UINT32)(1<<ctrich) combination`, indicating the presence of specific control characters.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ControlMask {
    /// 원본 값 / Raw value
    pub value: UINT32,
}

impl Serialize for ControlMask {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeMap;
        let active_flags = self.active_flags();
        let mut map = serializer.serialize_map(Some(2))?;
        map.serialize_entry("value", &self.value)?;
        map.serialize_entry("flags", &active_flags)?;
        map.end()
    }
}

impl<'de> Deserialize<'de> for ControlMask {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        // 기존 호환성: 숫자로 직렬화된 경우도 처리 / Backward compatibility: handle numeric serialization
        // 새로운 형식: 객체로 직렬화된 경우도 처리 / New format: handle object serialization
        struct ControlMaskVisitor;

        impl<'de> serde::de::Visitor<'de> for ControlMaskVisitor {
            type Value = ControlMask;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("control mask as u32 or object with value and flags")
            }

            // 숫자로 직렬화된 경우 (기존 형식) / Numeric serialization (old format)
            fn visit_u32<E>(self, value: u32) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(ControlMask::new(value))
            }

            fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(ControlMask::new(value as u32))
            }

            // 객체로 직렬화된 경우 (새 형식) / Object serialization (new format)
            fn visit_map<M>(self, mut map: M) -> Result<Self::Value, M::Error>
            where
                M: serde::de::MapAccess<'de>,
            {
                let mut value: Option<UINT32> = None;
                let mut flags: Option<Vec<String>> = None;

                while let Some(key) = map.next_key::<String>()? {
                    match key.as_str() {
                        "value" => {
                            if value.is_some() {
                                return Err(serde::de::Error::duplicate_field("value"));
                            }
                            value = Some(map.next_value()?);
                        }
                        "flags" => {
                            if flags.is_some() {
                                return Err(serde::de::Error::duplicate_field("flags"));
                            }
                            flags = Some(map.next_value()?);
                        }
                        _ => {
                            let _ = map.next_value::<serde::de::IgnoredAny>()?;
                        }
                    }
                }

                let value = value.ok_or_else(|| serde::de::Error::missing_field("value"))?;
                // flags는 무시하고 value만 사용 (flags는 value에서 계산 가능) / Ignore flags and use only value (flags can be calculated from value)
                Ok(ControlMask::new(value))
            }
        }

        deserializer.deserialize_any(ControlMaskVisitor)
    }
}

impl ControlMask {
    /// ControlMask를 생성합니다. / Create a ControlMask.
    pub fn new(value: UINT32) -> Self {
        Self { value }
    }

    /// 원본 값을 반환합니다. / Returns the raw value.
    pub fn value(&self) -> UINT32 {
        self.value
    }

    /// 비트가 설정되어 있는지 확인합니다. / Check if a bit is set.
    fn has_bit(&self, bit: u32) -> bool {
        (self.value & (1u32 << bit)) != 0
    }

    /// 구역/단 정의 컨트롤을 가졌는지 여부 / Whether the paragraph has section/column definition control
    /// bit 2 (Ch 2)
    pub fn has_sect_col_def(&self) -> bool {
        self.has_bit(2)
    }

    /// 필드 시작 컨트롤을 가졌는지 여부 / Whether the paragraph has field start control
    /// bit 3 (Ch 3)
    pub fn has_field_start(&self) -> bool {
        self.has_bit(3)
    }

    /// 필드 끝 컨트롤을 가졌는지 여부 / Whether the paragraph has field end control
    /// bit 4 (Ch 4)
    pub fn has_field_end(&self) -> bool {
        self.has_bit(4)
    }

    /// Title Mark를 가졌는지 여부 / Whether the paragraph has title mark
    /// bit 8 (Ch 8)
    pub fn has_title_mark(&self) -> bool {
        self.has_bit(8)
    }

    /// 탭을 가졌는지 여부 / Whether the paragraph has tab
    /// bit 9 (Ch 9)
    pub fn has_tab(&self) -> bool {
        self.has_bit(9)
    }

    /// 강제 줄 나눔을 가졌는지 여부 / Whether the paragraph has line break
    /// bit 10 (Ch 10)
    pub fn has_line_break(&self) -> bool {
        self.has_bit(10)
    }

    /// 그리기 객체 또는 표 객체를 가졌는지 여부 / Whether the paragraph has drawing object or table
    /// bit 11 (Ch 11)
    pub fn has_gso_table(&self) -> bool {
        self.has_bit(11)
    }

    /// 문단 나누기를 가졌는지 여부 / Whether the paragraph has paragraph break
    /// bit 13 (Ch 13)
    pub fn has_para_break(&self) -> bool {
        self.has_bit(13)
    }

    /// 숨은 설명을 가졌는지 여부 / Whether the paragraph has hidden comment
    /// bit 15 (Ch 15)
    pub fn has_hidden_comment(&self) -> bool {
        self.has_bit(15)
    }

    /// 머리말 또는 꼬리말을 가졌는지 여부 / Whether the paragraph has header/footer
    /// bit 16 (Ch 16)
    pub fn has_header_footer(&self) -> bool {
        self.has_bit(16)
    }

    /// 각주 또는 미주를 가졌는지 여부 / Whether the paragraph has footnote/endnote
    /// bit 17 (Ch 17)
    pub fn has_footnote_endnote(&self) -> bool {
        self.has_bit(17)
    }

    /// 자동 번호를 가졌는지 여부 / Whether the paragraph has auto number
    /// bit 18 (Ch 18)
    pub fn has_auto_number(&self) -> bool {
        self.has_bit(18)
    }

    /// 페이지 컨트롤을 가졌는지 여부 / Whether the paragraph has page control
    /// bit 21 (Ch 21)
    pub fn has_page_control(&self) -> bool {
        self.has_bit(21)
    }

    /// 책갈피/찾아보기 표시를 가졌는지 여부 / Whether the paragraph has bookmark/index mark
    /// bit 22 (Ch 22)
    pub fn has_bookmark(&self) -> bool {
        self.has_bit(22)
    }

    /// 덧말/글자 겹침을 가졌는지 여부 / Whether the paragraph has additional text overlapping letter
    /// bit 23 (Ch 23)
    pub fn has_additional_text_overlapping_letter(&self) -> bool {
        self.has_bit(23)
    }

    /// 하이픈을 가졌는지 여부 / Whether the paragraph has hyphen
    /// bit 24 (Ch 24)
    pub fn has_hyphen(&self) -> bool {
        self.has_bit(24)
    }

    /// 묶음 빈칸을 가졌는지 여부 / Whether the paragraph has bundle blank
    /// bit 30 (Ch 30)
    pub fn has_bundle_blank(&self) -> bool {
        self.has_bit(30)
    }

    /// 고정 폭 빈칸을 가졌는지 여부 / Whether the paragraph has fixed width blank
    /// bit 31 (Ch 31)
    pub fn has_fix_width_blank(&self) -> bool {
        self.has_bit(31)
    }

    /// 활성화된 모든 플래그를 문자열 배열로 반환합니다. / Returns all active flags as a string array.
    pub fn active_flags(&self) -> Vec<&'static str> {
        let mut flags = Vec::new();
        if self.has_sect_col_def() {
            flags.push("section_column_definition");
        }
        if self.has_field_start() {
            flags.push("field_start");
        }
        if self.has_field_end() {
            flags.push("field_end");
        }
        if self.has_title_mark() {
            flags.push("title_mark");
        }
        if self.has_tab() {
            flags.push("tab");
        }
        if self.has_line_break() {
            flags.push("line_break");
        }
        if self.has_gso_table() {
            flags.push("gso_table");
        }
        if self.has_para_break() {
            flags.push("paragraph_break");
        }
        if self.has_hidden_comment() {
            flags.push("hidden_comment");
        }
        if self.has_header_footer() {
            flags.push("header_footer");
        }
        if self.has_footnote_endnote() {
            flags.push("footnote_endnote");
        }
        if self.has_auto_number() {
            flags.push("auto_number");
        }
        if self.has_page_control() {
            flags.push("page_control");
        }
        if self.has_bookmark() {
            flags.push("bookmark");
        }
        if self.has_additional_text_overlapping_letter() {
            flags.push("additional_text_overlapping_letter");
        }
        if self.has_hyphen() {
            flags.push("hyphen");
        }
        if self.has_bundle_blank() {
            flags.push("bundle_blank");
        }
        if self.has_fix_width_blank() {
            flags.push("fix_width_blank");
        }
        flags
    }
}

impl From<UINT32> for ControlMask {
    fn from(value: UINT32) -> Self {
        Self::new(value)
    }
}

impl From<ControlMask> for UINT32 {
    fn from(mask: ControlMask) -> Self {
        mask.value
    }
}

/// 단 나누기 종류 / Column divide type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ColumnDivideType {
    /// 구역 나누기 / Section divide
    Section = 0x01,
    /// 다단 나누기 / Multi-column divide
    MultiColumn = 0x02,
    /// 쪽 나누기 / Page divide
    Page = 0x04,
    /// 단 나누기 / Column divide
    Column = 0x08,
}

impl ColumnDivideType {
    fn from_bits(bits: u8) -> Vec<Self> {
        let mut types = Vec::new();
        if bits & 0x01 != 0 {
            types.push(ColumnDivideType::Section);
        }
        if bits & 0x02 != 0 {
            types.push(ColumnDivideType::MultiColumn);
        }
        if bits & 0x04 != 0 {
            types.push(ColumnDivideType::Page);
        }
        if bits & 0x08 != 0 {
            types.push(ColumnDivideType::Column);
        }
        types
    }
}

/// 문단 헤더 구조체 / Paragraph header structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParaHeader {
    /// 텍스트 문자 수 / Text character count
    /// `if (nchars & 0x80000000) { nchars &= 0x7fffffff; }`
    pub text_char_count: UINT32,
    /// 컨트롤 마스크 / Control mask
    /// `(UINT32)(1<<ctrich) 조합`
    /// JSON 직렬화 시 value만 직렬화하여 기존 호환성 유지 / Only value is serialized in JSON to maintain backward compatibility
    pub control_mask: ControlMask,
    /// 문단 모양 아이디 참조값 / Paragraph shape ID reference
    pub para_shape_id: UINT16,
    /// 문단 스타일 아이디 참조값 / Paragraph style ID reference
    pub para_style_id: UINT8,
    /// 단 나누기 종류 / Column divide type
    pub column_divide_type: Vec<ColumnDivideType>,
    /// 글자 모양 정보 수 / Character shape info count
    pub char_shape_count: UINT16,
    /// range tag 정보 수 / Range tag info count
    pub range_tag_count: UINT16,
    /// 각 줄에 대한 align에 대한 정보 수 / Line align info count
    pub line_align_count: UINT16,
    /// 문단 Instance ID (unique ID) / Paragraph instance ID
    pub instance_id: UINT32,
    /// 변경추적 병합 문단여부 (5.0.3.2 버전 이상) / Track change merge paragraph flag (5.0.3.2 and above)
    pub section_merge: Option<UINT16>,
}

impl Default for ParaHeader {
    fn default() -> Self {
        Self {
            text_char_count: 0,
            control_mask: ControlMask::new(0),
            para_shape_id: 0,
            para_style_id: 0,
            column_divide_type: Vec::new(),
            char_shape_count: 0,
            range_tag_count: 0,
            line_align_count: 0,
            instance_id: 0,
            section_merge: None,
        }
    }
}

impl ParaHeader {
    /// ParaHeader를 바이트 배열에서 파싱합니다. / Parse ParaHeader from byte array.
    ///
    /// # Arguments
    /// * `data` - 최소 22바이트의 데이터 (5.0.3.2 이상은 24바이트) / At least 22 bytes of data (24 bytes for 5.0.3.2 and above)
    /// * `version` - 파일 버전 (5.0.3.2 이상인지 확인용) / File version (to check if 5.0.3.2 and above)
    ///
    /// # Returns
    /// 파싱된 ParaHeader 구조체 / Parsed ParaHeader structure
    pub fn parse(data: &[u8], version: u32) -> Result<Self, HwpError> {
        // 최소 22바이트 필요 (5.0.3.2 이상은 24바이트) / Need at least 22 bytes (24 bytes for 5.0.3.2 and above)
        let min_size = if version >= 0x05000302 { 24 } else { 22 };
        if data.len() < min_size {
            return Err(HwpError::insufficient_data(
                "ParaHeader",
                min_size,
                data.len(),
            ));
        }

        let mut offset = 0;

        // UINT32 text(=chars) / UINT32 text character count
        let mut text_char_count = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        // `if (nchars & 0x80000000) { nchars &= 0x7fffffff; }`
        if text_char_count & 0x80000000 != 0 {
            text_char_count &= 0x7fffffff;
        }
        offset += 4;

        // UINT32 control mask / UINT32 control mask
        let control_mask_value = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        let control_mask = ControlMask::new(control_mask_value);
        offset += 4;

        // UINT16 문단 모양 아이디 참조값 / UINT16 paragraph shape ID reference
        let para_shape_id = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT8 문단 스타일 아이디 참조값 / UINT8 paragraph style ID reference
        let para_style_id = data[offset];
        offset += 1;

        // UINT8 단 나누기 종류 / UINT8 column divide type
        let column_divide_bits = data[offset];
        let column_divide_type = ColumnDivideType::from_bits(column_divide_bits);
        offset += 1;

        // UINT16 글자 모양 정보 수 / UINT16 character shape info count
        let char_shape_count = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT16 range tag 정보 수 / UINT16 range tag info count
        let range_tag_count = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT16 각 줄에 대한 align에 대한 정보 수 / UINT16 line align info count
        let line_align_count = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT32 문단 Instance ID / UINT32 paragraph instance ID
        let instance_id = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // UINT16 변경추적 병합 문단여부 (5.0.3.2 버전 이상) / UINT16 track change merge paragraph flag (5.0.3.2 and above)
        let section_merge = if version >= 0x05000302 && data.len() >= 24 {
            Some(UINT16::from_le_bytes([data[offset], data[offset + 1]]))
        } else {
            None
        };

        Ok(ParaHeader {
            text_char_count,
            control_mask,
            para_shape_id,
            para_style_id,
            column_divide_type,
            char_shape_count,
            range_tag_count,
            line_align_count,
            instance_id,
            section_merge,
        })
    }
}
