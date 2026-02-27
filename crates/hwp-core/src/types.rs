/// HWPUNIT: 1/7200인치 단위 (unsigned)
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