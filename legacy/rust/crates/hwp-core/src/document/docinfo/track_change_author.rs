/// TrackChangeAuthor 구조체 / TrackChangeAuthor structure
///
/// 스펙 문서 매핑: 표 4 - 변경 추적 작성자 / Spec mapping: Table 4 - Track change author
/// 상세 구조는 스펙 문서에 명시되지 않음 / Detailed structure not specified in spec
use crate::error::HwpError;
use serde::{Deserialize, Serialize};

/// 변경 추적 작성자 / Track change author
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackChangeAuthor {
    /// Raw data (가변) / Raw data (variable)
    #[serde(skip)]
    pub raw_data: Vec<u8>,
}

impl TrackChangeAuthor {
    /// TrackChangeAuthor를 바이트 배열에서 파싱합니다. / Parse TrackChangeAuthor from byte array.
    ///
    /// # Arguments
    /// * `data` - TrackChangeAuthor 데이터 (가변) / TrackChangeAuthor data (variable)
    ///
    /// # Returns
    /// 파싱된 TrackChangeAuthor 구조체 / Parsed TrackChangeAuthor structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        Ok(TrackChangeAuthor {
            raw_data: data.to_vec(),
        })
    }
}
