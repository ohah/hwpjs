/// MemoShape 구조체 / MemoShape structure
///
/// 스펙 문서 매핑: 표 4 - 메모 모양 / Spec mapping: Table 4 - Memo shape
/// 상세 구조는 스펙 문서에 명시되지 않음 / Detailed structure not specified in spec
use crate::error::HwpError;
use serde::{Deserialize, Serialize};

/// 메모 모양 / Memo shape
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoShape {
    /// Raw data (22바이트) / Raw data (22 bytes)
    #[serde(skip)]
    pub raw_data: Vec<u8>,
}

impl MemoShape {
    /// MemoShape를 바이트 배열에서 파싱합니다. / Parse MemoShape from byte array.
    ///
    /// # Arguments
    /// * `data` - MemoShape 데이터 (22바이트) / MemoShape data (22 bytes)
    ///
    /// # Returns
    /// 파싱된 MemoShape 구조체 / Parsed MemoShape structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 22 {
            return Err(HwpError::insufficient_data("MemoShape", 22, data.len()));
        }

        Ok(MemoShape {
            raw_data: data[0..22.min(data.len())].to_vec(),
        })
    }
}
