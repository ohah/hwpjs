/// ForbiddenChar 구조체 / ForbiddenChar structure
///
/// 스펙 문서 매핑: 표 4 - 금칙처리 문자 / Spec mapping: Table 4 - Forbidden character
/// 상세 구조는 스펙 문서에 명시되지 않음 / Detailed structure not specified in spec
use crate::error::HwpError;
use serde::{Deserialize, Serialize};

/// 금칙처리 문자 / Forbidden character
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForbiddenChar {
    /// Raw data (가변) / Raw data (variable)
    #[serde(skip)]
    pub raw_data: Vec<u8>,
}

impl ForbiddenChar {
    /// ForbiddenChar를 바이트 배열에서 파싱합니다. / Parse ForbiddenChar from byte array.
    ///
    /// # Arguments
    /// * `data` - ForbiddenChar 데이터 (가변) / ForbiddenChar data (variable)
    ///
    /// # Returns
    /// 파싱된 ForbiddenChar 구조체 / Parsed ForbiddenChar structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        Ok(ForbiddenChar {
            raw_data: data.to_vec(),
        })
    }
}
