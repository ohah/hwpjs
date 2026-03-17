//! HWP 자료형 정의 (스펙 표 1 매핑)
//! types.md 및 hwp-5.0.md 참조

use crate::error::HwpError;
use serde::{Deserialize, Serialize};

// ========== 타입 별칭 (스펙 표 1) ==========
#[allow(clippy::upper_case_acronyms)]
pub type BYTE = u8;
#[allow(clippy::upper_case_acronyms)]
pub type WORD = u16;
#[allow(clippy::upper_case_acronyms)]
pub type DWORD = u32;
#[allow(clippy::upper_case_acronyms)]
pub type WCHAR = u16;
#[allow(clippy::upper_case_acronyms)]
pub type INT8 = i8;
#[allow(clippy::upper_case_acronyms)]
pub type INT16 = i16;
#[allow(clippy::upper_case_acronyms)]
pub type INT32 = i32;
#[allow(clippy::upper_case_acronyms)]
pub type UINT8 = u8;
#[allow(clippy::upper_case_acronyms)]
pub type UINT16 = u16;
#[allow(clippy::upper_case_acronyms)]
pub type UINT32 = u32;
#[allow(clippy::upper_case_acronyms)]
pub type UINT = UINT32;
#[allow(clippy::upper_case_acronyms)]
pub type HWPUNIT16 = i16;

// ========== COLORREF (스펙: 0x00bbggrr BGR) ==========
#[allow(clippy::upper_case_acronyms)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct COLORREF(pub u32);

impl COLORREF {
    pub fn rgb(r: u8, g: u8, b: u8) -> Self {
        Self(u32::from(b) << 16 | u32::from(g) << 8 | u32::from(r))
    }
    pub fn r(self) -> u8 {
        (self.0 & 0xFF) as u8
    }
    pub fn g(self) -> u8 {
        ((self.0 >> 8) & 0xFF) as u8
    }
    pub fn b(self) -> u8 {
        ((self.0 >> 16) & 0xFF) as u8
    }
    pub fn value(self) -> u32 {
        self.0
    }
    /// BGR(0x00BBGGRR) → RGB(0x00RRGGBB) 변환
    pub fn to_rgb(self) -> u32 {
        let r = self.0 & 0xFF;
        let g = (self.0 >> 8) & 0xFF;
        let b = (self.0 >> 16) & 0xFF;
        (r << 16) | (g << 8) | b
    }
}

/// JSON 직렬화: { "r", "g", "b" } 객체 형태로 출력 (이전 스냅샷 호환)
#[derive(Serialize, Deserialize)]
struct ColorRefRgb {
    r: u8,
    g: u8,
    b: u8,
}

impl Serialize for COLORREF {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        ColorRefRgb {
            r: self.r(),
            g: self.g(),
            b: self.b(),
        }
        .serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for COLORREF {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let rgb = ColorRefRgb::deserialize(deserializer)?;
        Ok(COLORREF::rgb(rgb.r, rgb.g, rgb.b))
    }
}

// ========== SHWPUNIT: 1/7200인치 (signed) ==========
#[allow(clippy::upper_case_acronyms)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Default)]
pub struct SHWPUNIT(pub i32);

impl SHWPUNIT {
    pub fn to_inches(self) -> f64 {
        self.0 as f64 / 7200.0
    }
    pub fn to_mm(self) -> f64 {
        self.to_inches() * 25.4
    }
    pub fn from_inches(inches: f64) -> Self {
        Self((inches * 7200.0) as i32)
    }
    pub fn from_mm(mm: f64) -> Self {
        Self::from_inches(mm / 25.4)
    }
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

// ========== RecordHeader (스펙 그림 45: TagID 10bit, Level 10bit, Size 12bit) ==========
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RecordHeader {
    pub tag_id: u16,
    pub level: u16,
    pub size: u32,
    pub has_extended_size: bool,
}

const RECORD_HEADER_EXTENDED_SIZE: u32 = 0xFFF; // 12 bits all set

impl RecordHeader {
    /// 레코드 헤더 파싱. 반환: (헤더, 헤더 바이트 수).
    pub fn parse(data: &[u8]) -> Result<(Self, usize), HwpError> {
        if data.len() < 4 {
            return Err(HwpError::InsufficientData {
                field: "RecordHeader".to_string(),
                expected: 4,
                actual: data.len(),
            });
        }
        let dword = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
        let tag_id = (dword & 0x3FF) as u16;
        let level = ((dword >> 10) & 0x3FF) as u16;
        let size12 = dword >> 20;
        let (size, header_len) = if size12 == RECORD_HEADER_EXTENDED_SIZE {
            if data.len() < 8 {
                return Err(HwpError::InsufficientData {
                    field: "RecordHeader extended size".to_string(),
                    expected: 8,
                    actual: data.len(),
                });
            }
            let size = u32::from_le_bytes([data[4], data[5], data[6], data[7]]);
            (size, 8)
        } else {
            (size12, 4)
        };
        Ok((
            Self {
                tag_id,
                level,
                size,
                has_extended_size: size12 == RECORD_HEADER_EXTENDED_SIZE,
            },
            header_len,
        ))
    }
}

// ========== HWPUNIT16 → mm 변환 트레이트 ==========
/// HWPUNIT16(1/7200인치)을 mm로 변환하는 트레이트
pub trait Hwpunit16ToMm {
    fn to_mm(self) -> f64;
}

impl Hwpunit16ToMm for i16 {
    fn to_mm(self) -> f64 {
        (self as f64 / 7200.0) * 25.4
    }
}

// ========== UTF-16LE 디코딩 ==========
/// UTF-16LE 바이트 슬라이스를 문자열로 디코딩
pub fn decode_utf16le(bytes: &[u8]) -> Result<String, std::string::FromUtf16Error> {
    let u16_len = bytes.len() / 2;
    let mut u16_slice = Vec::with_capacity(u16_len);
    for chunk in bytes.chunks_exact(2) {
        u16_slice.push(u16::from_le_bytes([chunk[0], chunk[1]]));
    }
    String::from_utf16(&u16_slice)
}

// ========== HWPUNIT: 1/7200인치 단위 (unsigned) ==========
/// 문자의 크기, 그림의 크기, 용지 여백 등 문서 구성 요소의 크기를 표현
///
/// 스펙 문서와 호환성을 위한 구조체 타입 (BYTE, WORD 등 타입 별칭과 비슷함)
#[allow(clippy::upper_case_acronyms)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Default)]
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

    pub fn from_inches(inches: f64) -> Self {
        Self((inches * 7200.0) as u32)
    }

    pub fn from_mm(mm: f64) -> Self {
        Self::from_inches(mm / 25.4)
    }

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

impl From<HWPUNIT> for i32 {
    fn from(value: HWPUNIT) -> Self {
        value.0 as i32
    }
}
