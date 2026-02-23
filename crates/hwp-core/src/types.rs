/// HWP 5.0 자료형 정의
///
/// 표 1: 자료형에 따른 타입 정의
/// 스펙 문서와 1:1 매핑을 위해 모든 자료형을 명시적으로 정의합니다.
///
/// 스펙 문서와의 호환성을 위해 자료형별 주요 이니셜을 대문자로 사용합니다
/// (BYTE, WORD, DWORD, WCHAR 등). 이는 "형식에 맞는 코드"를 유지하기 위함입니다.
use crate::error::HwpError;
use serde::{Deserialize, Serialize};

/// 소수점 2자리로 반올림하는 trait
pub trait RoundTo2dp {
    /// 소수점 2자리로 반올림
    fn round_to_2dp(self) -> f64;
}

impl RoundTo2dp for f64 {
    fn round_to_2dp(self) -> f64 {
        (self * 100.0).round() / 100.0
    }
}

/// BYTE: 부호 없는 한 바이트(0~255)
#[allow(clippy::upper_case_acronyms)]
pub type BYTE = u8;

/// WORD: 16비트 unsigned int
#[allow(clippy::upper_case_acronyms)]
pub type WORD = u16;

/// DWORD: 32비트 unsigned long
#[allow(clippy::upper_case_acronyms)]
pub type DWORD = u32;

/// WCHAR: 유니코드 기반 문자 (2바이트)
/// 한글의 내부 코드로 표현된 문자 한 글자
#[allow(clippy::upper_case_acronyms)]
pub type WCHAR = u16;

/// HWPUNIT: 1/7200인치 단위 (unsigned)
/// 문자의 크기, 그림의 크기, 용지 여백 등 문서 구성 요소의 크기를 표현
///
/// 스펙 문서와 호환성을 위한 구조체 타입 (BYTE, WORD 등 타입 별칭과 비슷함)
#[allow(clippy::upper_case_acronyms)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct HWPUNIT(pub u32);

impl HWPUNIT {
    /// 인치 단위로 변환
    pub fn to_inches(self) -> f64 {
        self.0 as f64 / 7200.0
    }

    /// 밀리미터 단위로 변환
    pub fn to_mm(self) -> f64 {
        self.to_inches() * 25.4
    }

    /// 인치 단위에서 생성
    pub fn from_inches(inches: f64) -> Self {
        Self((inches * 7200.0) as u32)
    }

    /// 밀리미터 단위에서 생성
    pub fn from_mm(mm: f64) -> Self {
        Self::from_inches(mm / 25.4)
    }

    /// 내부 값 반환
    pub fn value(self) -> u32 {
        self.0
    }
}

impl From<u32> for HWPUNIT {
    fn from(value: u32) -> Self {
        Self(value)
    }
}

impl From<HWPUNIT> for u32 {
    fn from(value: HWPUNIT) -> Self {
        value.0
    }
}

/// SHWPUNIT: 1/7200인치 단위 (signed)
/// HWPUNIT의 부호 있는 버전
///
/// 스펙 문서와 호환성을 위한 구조체 타입 (HWPUNIT와 구조가 비슷함)
#[allow(clippy::upper_case_acronyms)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct SHWPUNIT(pub i32);

impl SHWPUNIT {
    /// 인치 단위로 변환
    pub fn to_inches(self) -> f64 {
        self.0 as f64 / 7200.0
    }

    /// 밀리미터 단위로 변환
    pub fn to_mm(self) -> f64 {
        self.to_inches() * 25.4
    }

    /// 인치 단위에서 생성
    pub fn from_inches(inches: f64) -> Self {
        Self((inches * 7200.0) as i32)
    }

    /// 밀리미터 단위에서 생성
    pub fn from_mm(mm: f64) -> Self {
        Self::from_inches(mm / 25.4)
    }

    /// 내부 값 반환
    pub fn value(self) -> i32 {
        self.0
    }
}

impl From<i32> for SHWPUNIT {
    fn from(value: i32) -> Self {
        Self(value)
    }
}

impl From<SHWPUNIT> for i32 {
    fn from(value: SHWPUNIT) -> Self {
        value.0
    }
}

/// HWPUNIT16 (i16)에 대한 변환 메서드 제공 / Conversion methods for HWPUNIT16 (i16)
pub trait Hwpunit16ToMm {
    /// 밀리미터 단위로 변환 / Convert to millimeters
    fn to_mm(self) -> f64;
}

impl Hwpunit16ToMm for i16 {
    fn to_mm(self) -> f64 {
        (self as f64 / 7200.0) * 25.4
    }
}

/// COLORREF: BGR 형식 (0x00bbggrr)
/// 스펙 문서: RGB값(0x00bbggrr) - 실제로는 BGR 순서로 저장됨
/// Spec: RGB value (0x00bbggrr) - actually stored in BGR order
/// rr: red 1 byte (하위 바이트), gg: green 1 byte (중간 바이트), bb: blue 1 byte (상위 바이트)
///
/// 스펙 문서와 호환성을 위한 구조체 타입 (DWORD 타입 별칭과 구조가 비슷함)
#[allow(clippy::upper_case_acronyms)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct COLORREF(pub u32);

impl COLORREF {
    /// RGB 값으로 생성
    pub fn rgb(r: u8, g: u8, b: u8) -> Self {
        Self((b as u32) << 16 | (g as u32) << 8 | r as u32)
    }

    /// Red 값 추출
    pub fn r(self) -> u8 {
        (self.0 & 0xFF) as u8
    }

    /// Green 값 추출
    pub fn g(self) -> u8 {
        ((self.0 >> 8) & 0xFF) as u8
    }

    /// Blue 값 추출
    pub fn b(self) -> u8 {
        ((self.0 >> 16) & 0xFF) as u8
    }

    /// 내부 값 반환
    pub fn value(self) -> u32 {
        self.0
    }
}

impl From<u32> for COLORREF {
    fn from(value: u32) -> Self {
        Self(value)
    }
}

impl From<COLORREF> for u32 {
    fn from(value: COLORREF) -> Self {
        value.0
    }
}

// COLORREF를 RGB 형태로 JSON 직렬화 / Serialize COLORREF as RGB object in JSON
impl Serialize for COLORREF {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("COLORREF", 3)?;
        state.serialize_field("r", &self.r())?;
        state.serialize_field("g", &self.g())?;
        state.serialize_field("b", &self.b())?;
        state.end()
    }
}

// JSON에서 RGB 형태로 역직렬화 / Deserialize COLORREF from RGB object in JSON
impl<'de> Deserialize<'de> for COLORREF {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de::{self, MapAccess, Visitor};
        use std::fmt;

        #[derive(Deserialize)]
        #[serde(field_identifier, rename_all = "lowercase")]
        enum Field {
            R,
            G,
            B,
        }

        struct COLORREFVisitor;

        impl<'de> Visitor<'de> for COLORREFVisitor {
            type Value = COLORREF;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("struct COLORREF with r, g, b fields")
            }

            fn visit_map<V>(self, mut map: V) -> Result<COLORREF, V::Error>
            where
                V: MapAccess<'de>,
            {
                let mut r = None;
                let mut g = None;
                let mut b = None;
                while let Some(key) = map.next_key()? {
                    match key {
                        Field::R => {
                            if r.is_some() {
                                return Err(de::Error::duplicate_field("r"));
                            }
                            r = Some(map.next_value()?);
                        }
                        Field::G => {
                            if g.is_some() {
                                return Err(de::Error::duplicate_field("g"));
                            }
                            g = Some(map.next_value()?);
                        }
                        Field::B => {
                            if b.is_some() {
                                return Err(de::Error::duplicate_field("b"));
                            }
                            b = Some(map.next_value()?);
                        }
                    }
                }
                let r = r.ok_or_else(|| de::Error::missing_field("r"))?;
                let g = g.ok_or_else(|| de::Error::missing_field("g"))?;
                let b = b.ok_or_else(|| de::Error::missing_field("b"))?;
                Ok(COLORREF::rgb(r, g, b))
            }
        }

        deserializer.deserialize_map(COLORREFVisitor)
    }
}

/// UINT8: unsigned int8
pub type UINT8 = u8;

/// UINT16: unsigned int16
pub type UINT16 = u16;

/// UINT32: unsigned int32
pub type UINT32 = u32;

/// UINT: UINT32와 동일
#[allow(clippy::upper_case_acronyms)]
pub type UINT = UINT32;

/// INT8: signed int8
pub type INT8 = i8;

/// INT16: signed int16
pub type INT16 = i16;

/// INT32: signed int32
pub type INT32 = i32;

/// HWPUNIT16: INT16과 같음
pub type HWPUNIT16 = i16;

/// 레코드 헤더 파싱 결과 / Record header parsing result
///
/// 스펙 문서 매핑: 그림 45 - 레코드 구조 / Spec mapping: Figure 45 - Record structure
/// 레코드 헤더는 32비트로 구성되며 Tag ID (10 bits), Level (10 bits), Size (12 bits)를 포함합니다.
/// Record header is 32 bits consisting of Tag ID (10 bits), Level (10 bits), Size (12 bits).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RecordHeader {
    /// Tag ID (10 bits, 0x000-0x3FF)
    pub tag_id: u16,
    /// Level (10 bits)
    pub level: u16,
    /// Size (12 bits, 또는 확장 길이) / Size (12 bits, or extended length)
    pub size: u32,
    /// 확장 길이를 사용하는지 여부 (Size가 0xFFF인 경우) / Whether extended size is used (when Size is 0xFFF)
    pub has_extended_size: bool,
}

impl RecordHeader {
    /// 레코드 헤더를 파싱합니다. / Parse record header.
    ///
    /// # Arguments
    /// * `data` - 최소 4바이트의 데이터 (레코드 헤더) / At least 4 bytes of data (record header)
    ///
    /// # Returns
    /// 파싱된 RecordHeader와 다음 데이터 위치로 이동할 바이트 수 (헤더 크기) / Parsed RecordHeader and number of bytes to advance (header size)
    pub fn parse(data: &[u8]) -> Result<(Self, usize), HwpError> {
        if data.len() < 4 {
            return Err(HwpError::insufficient_data("RecordHeader", 4, data.len()));
        }

        // DWORD를 little-endian으로 읽기 / Read DWORD as little-endian
        let header_value = DWORD::from_le_bytes([data[0], data[1], data[2], data[3]]);

        // Tag ID: bits 0-9 (10 bits)
        let tag_id = (header_value & 0x3FF) as u16;

        // Level: bits 10-19 (10 bits)
        let level = ((header_value >> 10) & 0x3FF) as u16;

        // Size: bits 20-31 (12 bits)
        let size = (header_value >> 20) & 0xFFF;

        let (size, has_extended_size, header_size) = if size == 0xFFF {
            // 확장 길이 사용: 다음 DWORD가 실제 길이 / Extended size: next DWORD is actual length
            if data.len() < 8 {
                return Err(HwpError::insufficient_data(
                    "RecordHeader (extended)",
                    8,
                    data.len(),
                ));
            }
            let extended_size = DWORD::from_le_bytes([data[4], data[5], data[6], data[7]]);
            (extended_size, true, 8)
        } else {
            (size, false, 4)
        };

        Ok((
            RecordHeader {
                tag_id,
                level,
                size,
                has_extended_size,
            },
            header_size,
        ))
    }
}

/// UTF-16LE 바이트 배열을 String으로 디코딩 / Decode UTF-16LE byte array to String
pub fn decode_utf16le(bytes: &[u8]) -> Result<String, HwpError> {
    use crate::error::HwpError;
    if bytes.len() % 2 != 0 {
        return Err(HwpError::EncodingError {
            reason: "UTF-16LE bytes must be even length".to_string(),
        });
    }
    let u16_chars: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
        .collect();
    String::from_utf16(&u16_chars).map_err(|e| HwpError::EncodingError {
        reason: format!("Failed to decode UTF-16LE string: {}", e),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // HWPUNIT Tests
    #[test]
    fn test_hwpunit_basic() {
        let unit = HWPUNIT(7200);
        assert_eq!(unit.value(), 7200);

        let unit2 = HWPUNIT::from(7200);
        assert_eq!(unit2, HWPUNIT(7200));

        let unit3 = HWPUNIT::from(unit2.0);
        assert_eq!(unit3, HWPUNIT(7200));

        let from_u32: u32 = unit3.into();
        assert_eq!(from_u32, 7200);
    }

    #[test]
    fn test_hwpunit_inches_conversion() {
        let unit = HWPUNIT::from_inches(1.0);
        assert_eq!(unit.0, 7200u32);

        let inches = unit.to_inches();
        assert_eq!(inches, 1.0);
    }

    #[test]
    fn test_hwpunit_mm_conversion() {
        let unit = HWPUNIT::from_mm(1.0); // 1mm ≈ 0.0393701 inches = 283.5 in HWPUNIT
        assert!(unit.to_mm() > 0.99);
        assert!(unit.to_mm() < 1.01);

        let mm = unit.to_mm();
        assert_eq!(mm, 1.0);
    }

    #[test]
    fn test_hwpunit_zero() {
        let unit = HWPUNIT(0);
        assert_eq!(unit.to_inches(), 0.0);
        assert_eq!(unit.to_mm(), 0.0);
    }

    #[test]
    fn test_hwpunit_round_to_2dp_trait() {
        let val: f64 = 12.345;
        let rounded = val.round_to_2dp();
        assert_eq!(rounded, 12.35);
    }

    // SHWPUNIT Tests
    #[test]
    fn test_shwpunit_basic() {
        let unit = SHWPUNIT(7200);
        assert_eq!(unit.value(), 7200);

        let unit2 = SHWPUNIT::from(7200);
        assert_eq!(unit2, SHWPUNIT(7200));
    }

    #[test]
    fn test_shwpunit_inches_conversion() {
        let unit = SHWPUNIT::from_inches(1.0);
        assert_eq!(unit.0, 7200i32);

        let inches = unit.to_inches();
        assert_eq!(inches, 1.0);
    }

    #[test]
    fn test_shwpunit_mm_conversion() {
        let unit = SHWPUNIT::from_mm(1.0);
        assert!(unit.to_mm() > 0.99);
        assert!(unit.to_mm() < 1.01);

        let mm = unit.to_mm();
        assert_eq!(mm, 1.0);
    }

    #[test]
    fn test_shwpunit_zero() {
        let unit = SHWPUNIT(0);
        assert_eq!(unit.to_inches(), 0.0);
        assert_eq!(unit.to_mm(), 0.0);
    }

    // COLORREF Tests
    #[test]
    fn test_colorref_basic() {
        let color = COLORREF::rgb(255, 128, 64);
        assert_eq!(color.r(), 255);
        assert_eq!(color.g(), 128);
        assert_eq!(color.b(), 64);
        assert_eq!(color.value(), 0x00648000);
    }

    #[test]
    fn test_colorref_black() {
        let color = COLORREF::rgb(0, 0, 0);
        assert_eq!(color.r(), 0);
        assert_eq!(color.g(), 0);
        assert_eq!(color.b(), 0);
        assert_eq!(color.value(), 0);
    }

    #[test]
    fn test_colorref_white() {
        let color = COLORREF::rgb(255, 255, 255);
        assert_eq!(color.r(), 255);
        assert_eq!(color.g(), 255);
        assert_eq!(color.b(), 255);
        assert_eq!(color.value(), 0xFFFFFF);
    }

    #[test]
    fn test_colorref_serialization() {
        let color = COLORREF::rgb(200, 100, 50);
        let json = serde_json::to_string(&color).unwrap();
        assert_eq!(json, r#"{"r":200,"g":100,"b":50}"#);
    }

    #[test]
    fn test_colorref_deserialization() {
        let color: COLORREF = serde_json::from_str(r#"{"r":200,"g":100,"b":50}"#).unwrap();
        assert_eq!(color.r(), 200);
        assert_eq!(color.g(), 100);
        assert_eq!(color.b(), 50);
    }

    #[test]
    fn test_colorref_roundtrip() {
        let original = COLORREF::rgb(150, 200, 125);
        let json = serde_json::to_string(&original).unwrap();
        let restored: COLORREF = serde_json::from_str(&json).unwrap();
        assert_eq!(restored, original);
    }

    // RecordHeader Tests
    #[test]
    fn test_recordheader_parse_basic() {
        let data = [0x00, 0x01, 0x00, 0x34]; // tag_id=1, level=0, size=0x034
        let (header, _) = RecordHeader::parse(&data).unwrap();
        assert_eq!(header.tag_id, 1u16);
        assert_eq!(header.level, 0u16);
        assert_eq!(header.size, 0x034u32);
        assert!(!header.has_extended_size);
    }

    #[test]
    fn test_recordheader_extended_size() {
        let data = [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x01, 0x00, 0x80]; // size=0xFFF, extended_size=0x00010080 (256)
        let (header, _) = RecordHeader::parse(&data).unwrap();
        assert_eq!(header.tag_id, 0);
        assert_eq!(header.level, 0);
        assert_eq!(header.size, 0xFFFu32);
        assert!(header.has_extended_size);
    }

    #[test]
    fn test_recordheader_too_short() {
        let data = [0x00, 0x01, 0x00, 0x34];
        let result = RecordHeader::parse(&data[0..3]);
        assert!(result.is_err());
    }

    #[test]
    fn test_recordheader_extended_too_short() {
        let data = [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x01];
        let result = RecordHeader::parse(&data);
        assert!(result.is_err());
    }

    #[test]
    fn test_recordheader_all_levels() {
        // tag_id: bits 0-9 (10 bits) = max 1023
        // level: bits 10-19 (10 bits) = max 1023
        // size: bits 20-31 (12 bits) = max 4095

        let data = [0xFF, 0xBF, 0xFF, 0xFF]; // tag_id=1023, level=1023, size=4095
        let (header, _) = RecordHeader::parse(&data).unwrap();
        assert_eq!(header.tag_id, 1023);
        assert_eq!(header.level, 1023);
        assert_eq!(header.size, 4095);
    }

    // UTF-16LE decoding Tests
    #[test]
    fn test_decode_utf16le_basic() {
        let bytes = [0x48, 0x57, 0x50, 0x20, 0x44, 0x6F, 0x63, 0x75]; // "HWP Docu"
        let result = decode_utf16le(&bytes).unwrap();
        assert_eq!(result, "HWP Docu");
    }

    #[test]
    fn test_decode_utf16le_odd_length() {
        let bytes = [0x48, 0x57, 0x50]; // odd length
        let result = decode_utf16le(&bytes);
        assert!(result.is_err());
    }

    #[test]
    fn test_decode_utf16le_valid_utf8() {
        let bytes = [0xAE, 0xB0, 0xD5, 0xC5]; // "한글" in EUC-KR encoded as UTF-16LE? Not actually but testing the logic
        let result = decode_utf16le(&bytes);
        assert!(result.is_ok());
    }
}
