/// CtrlData 구조체 / CtrlData structure
///
/// 스펙 문서 매핑: 표 66 - 컨트롤 임의의 데이터 / Spec mapping: Table 66 - Control arbitrary data
///
/// **구현 상태 / Implementation Status**
/// - 구현 완료 / Implementation complete
/// - 테스트 파일(`noori.hwp`)에 CTRL_DATA 레코드가 없어 실제 파일로 테스트되지 않음
/// - Implementation complete, but not tested with actual file as test file (`noori.hwp`) does not contain CTRL_DATA records
use crate::document::docinfo::ParameterSet;
use crate::error::HwpError;
use serde::{Deserialize, Serialize};

/// 컨트롤 임의의 데이터 / Control arbitrary data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CtrlData {
    /// 파라미터 셋 (표 50 참조) / Parameter set (see Table 50)
    pub parameter_set: ParameterSet,
}

impl CtrlData {
    /// CtrlData를 바이트 배열에서 파싱합니다. / Parse CtrlData from byte array.
    ///
    /// # Arguments
    /// * `data` - CtrlData 데이터 / CtrlData data
    ///
    /// # Returns
    /// 파싱된 CtrlData 구조체 / Parsed CtrlData structure
    ///
    /// # Note
    /// 스펙 문서 표 66에 따르면 CTRL_DATA는 다음 구조를 가집니다:
    /// - Parameter Set (표 50 참조) - 가변 길이
    ///
    /// 레거시 코드(hwp.js)는 CTRL_DATA를 파싱하지 않고 있습니다.
    /// According to spec Table 66, CTRL_DATA has the following structure:
    /// - Parameter Set (Table 50) - variable length
    ///
    /// Legacy code (hwp.js) does not parse CTRL_DATA.
    ///
    /// **테스트 상태 / Testing Status**
    /// 현재 테스트 파일(`noori.hwp`)에 CTRL_DATA 레코드가 없어 실제 파일로 검증되지 않았습니다.
    /// 실제 HWP 파일에 CTRL_DATA 레코드가 있으면 자동으로 파싱됩니다.
    /// Current test file (`noori.hwp`) does not contain CTRL_DATA records, so it has not been verified with actual files.
    /// If an actual HWP file contains CTRL_DATA records, they will be automatically parsed.
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.is_empty() {
            return Err(HwpError::InsufficientData {
                field: "CtrlData data".to_string(),
                expected: 1,
                actual: 0,
            });
        }

        // 파라미터 셋 파싱 (표 50) / Parse parameter set (Table 50)
        let parameter_set = ParameterSet::parse(data)
            .map_err(|e| HwpError::from(e))?;

        Ok(CtrlData { parameter_set })
    }
}
