/// FormObject 구조체 / FormObject structure
///
/// **구현 상태 / Implementation Status**
/// - 구현 완료 / Implementation complete
/// - 스펙 문서에 상세 구조가 명시되어 있지 않음 / Spec document does not specify detailed structure
/// - 테스트 파일(`noori.hwp`)에 FORM_OBJECT 레코드가 없어 실제 파일로 테스트되지 않음
/// - Implementation complete, but not tested with actual file as test file (`noori.hwp`) does not contain FORM_OBJECT records
use crate::error::HwpError;
use serde::{Deserialize, Serialize};

/// 양식 개체 / Form object
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormObject {
    /// Raw 데이터 / Raw data
    /// 스펙 문서에 상세 구조가 명시되어 있지 않으므로 raw 데이터로 저장합니다.
    /// Raw data is stored because the spec document does not specify detailed structure.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub raw_data: Vec<u8>,
}

impl FormObject {
    /// FormObject을 바이트 배열에서 파싱합니다. / Parse FormObject from byte array.
    ///
    /// # Arguments
    /// * `data` - FormObject 데이터 / FormObject data
    ///
    /// # Returns
    /// 파싱된 FormObject 구조체 / Parsed FormObject structure
    ///
    /// # Note
    /// 스펙 문서 표 57에는 "양식 개체"로만 언급되어 있고 상세 구조가 명시되어 있지 않습니다.
    /// 레거시 코드(hwp.js)도 raw 데이터로만 저장하고 있습니다.
    /// Spec document Table 57 only mentions "Form object" and does not specify detailed structure.
    /// Legacy code (hwp.js) also stores only raw data.
    ///
    /// **테스트 상태 / Testing Status**
    /// 현재 테스트 파일(`noori.hwp`)에 FORM_OBJECT 레코드가 없어 실제 파일로 검증되지 않았습니다.
    /// 실제 HWP 파일에 FORM_OBJECT 레코드가 있으면 자동으로 파싱됩니다.
    /// Current test file (`noori.hwp`) does not contain FORM_OBJECT records, so it has not been verified with actual files.
    /// If an actual HWP file contains FORM_OBJECT records, they will be automatically parsed.
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        Ok(FormObject {
            raw_data: data.to_vec(),
        })
    }
}
