/// TrackChangeContent 구조체 / TrackChangeContent structure
///
/// 스펙 문서 매핑: 표 4 - 변경 추적 내용 및 모양 / Spec mapping: Table 4 - Track change content and shape
/// 상세 구조는 스펙 문서에 명시되지 않음 / Detailed structure not specified in spec
use crate::error::HwpError;
use serde::{Deserialize, Serialize};

/// 변경 추적 내용 및 모양 / Track change content and shape
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackChangeContent {
    /// Raw data (가변) / Raw data (variable)
    #[serde(skip)]
    pub raw_data: Vec<u8>,
}

impl TrackChangeContent {
    /// TrackChangeContent를 바이트 배열에서 파싱합니다. / Parse TrackChangeContent from byte array.
    ///
    /// # Arguments
    /// * `data` - TrackChangeContent 데이터 (가변) / TrackChangeContent data (variable)
    ///
    /// # Returns
    /// 파싱된 TrackChangeContent 구조체 / Parsed TrackChangeContent structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        Ok(TrackChangeContent {
            raw_data: data.to_vec(),
        })
    }
}
