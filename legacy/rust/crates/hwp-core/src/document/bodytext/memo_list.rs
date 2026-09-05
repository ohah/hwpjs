/// MemoList 구조체 / MemoList structure
///
/// **구현 상태 / Implementation Status**
/// - 구현 완료 / Implementation complete
/// - 스펙 문서에 상세 구조가 명시되어 있지 않음 / Spec document does not specify detailed structure
/// - 테스트 파일(`noori.hwp`)에 MEMO_LIST 레코드가 없어 실제 파일로 테스트되지 않음
/// - Implementation complete, but not tested with actual file as test file (`noori.hwp`) does not contain MEMO_LIST records
use crate::error::HwpError;
use serde::{Deserialize, Serialize};

/// 메모 리스트 헤더 / Memo list header
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoList {
    /// Raw 데이터 / Raw data
    /// 스펙 문서에 상세 구조가 명시되어 있지 않으므로 raw 데이터로 저장합니다.
    /// Raw data is stored because the spec document does not specify detailed structure.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub raw_data: Vec<u8>,
}

impl MemoList {
    /// MemoList을 바이트 배열에서 파싱합니다. / Parse MemoList from byte array.
    ///
    /// # Arguments
    /// * `data` - MemoList 데이터 / MemoList data
    ///
    /// # Returns
    /// 파싱된 MemoList 구조체 / Parsed MemoList structure
    ///
    /// # Note
    /// 스펙 문서 표 57에는 "메모 리스트 헤더"로만 언급되어 있고 상세 구조가 명시되어 있지 않습니다.
    /// 레거시 코드(hwp.js)도 raw 데이터로만 저장하고 있습니다.
    /// Spec document Table 57 only mentions "Memo list header" and does not specify detailed structure.
    /// Legacy code (hwp.js) also stores only raw data.
    ///
    /// **테스트 상태 / Testing Status**
    /// 현재 테스트 파일(`noori.hwp`)에 MEMO_LIST 레코드가 없어 실제 파일로 검증되지 않았습니다.
    /// 실제 HWP 파일에 MEMO_LIST 레코드가 있으면 자동으로 파싱됩니다.
    /// Current test file (`noori.hwp`) does not contain MEMO_LIST records, so it has not been verified with actual files.
    /// If an actual HWP file contains MEMO_LIST records, they will be automatically parsed.
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        Ok(MemoList {
            raw_data: data.to_vec(),
        })
    }
}
