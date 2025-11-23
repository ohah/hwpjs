/// HWP 5.0 자료형 정의
/// 
/// 표 1: 자료형에 따른 타입 정의
/// 스펙 문서와 1:1 매핑을 위해 모든 자료형을 명시적으로 정의합니다.

use serde::{Deserialize, Serialize};

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

    /// 인치 단위에서 생성
    pub fn from_inches(inches: f64) -> Self {
        Self((inches * 7200.0) as u32)
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

    /// 인치 단위에서 생성
    pub fn from_inches(inches: f64) -> Self {
        Self((inches * 7200.0) as i32)
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

/// COLORREF: RGB 값 (0x00bbggrr)
/// rr: red 1 byte, gg: green 1 byte, bb: blue 1 byte
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
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

