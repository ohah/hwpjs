/// TrackChange 구조체 / TrackChange structure
///
/// 스펙 문서 매핑: 표 4 - 변경 추적 정보 / Spec mapping: Table 4 - Track change information
/// 상세 구조는 스펙 문서에 명시되지 않음 / Detailed structure not specified in spec
use crate::error::HwpError;
use serde::{Deserialize, Serialize};

/// 변경 추적 정보 / Track change information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackChange {
    /// Raw data (1032바이트) / Raw data (1032 bytes)
    #[serde(skip)]
    pub raw_data: Vec<u8>,
}

impl TrackChange {
    /// TrackChange를 바이트 배열에서 파싱합니다. / Parse TrackChange from byte array.
    ///
    /// # Arguments
    /// * `data` - TrackChange 데이터 (1032바이트) / TrackChange data (1032 bytes)
    ///
    /// # Returns
    /// 파싱된 TrackChange 구조체 / Parsed TrackChange structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 1032 {
            return Err(HwpError::insufficient_data("TrackChange", 1032, data.len()));
        }

        Ok(TrackChange {
            raw_data: data[0..1032.min(data.len())].to_vec(),
        })
    }
}
