/// HWP 5.0 자료형 정의
///
/// 표 1: 자료형에 따른 타입 정의
/// 스펙 문서와 1:1 매핑을 위해 모든 자료형을 명시적으로 정의합니다.
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
pub type BYTE = u8;

/// WORD: 16비트 unsigned int
pub type WORD = u16;

/// DWORD: 32비트 unsigned long
pub type DWORD = u32;

/// WCHAR: 유니코드 기반 문자 (2바이트)
/// 한글의 내부 코드로 표현된 문자 한 글자
pub type WCHAR = u16;

/// HWPUNIT: 1/7200인치 단위 (unsigned)
/// 문자의 크기, 그림의 크기, 용지 여백 등 문서 구성 요소의 크기를 표현
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
