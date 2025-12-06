/// DistributeDocData 구조체 / DistributeDocData structure
///
/// 스펙 문서 매핑: 표 53 - 배포용 문서 데이터 / Spec mapping: Table 53 - Distribution document data
use crate::error::HwpError;
use serde::{Deserialize, Serialize};

/// 배포용 문서 데이터 (표 53) / Distribution document data (Table 53)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DistributeDocData {
    /// 배포용 문서 데이터 (256바이트) / Distribution document data (256 bytes)
    pub data: Vec<u8>,
}

impl DistributeDocData {
    /// DistributeDocData를 바이트 배열에서 파싱합니다. / Parse DistributeDocData from byte array.
    ///
    /// # Arguments
    /// * `data` - DistributeDocData 데이터 (256바이트) / DistributeDocData data (256 bytes)
    ///
    /// # Returns
    /// 파싱된 DistributeDocData 구조체 / Parsed DistributeDocData structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 256 {
            return Err(HwpError::insufficient_data("DistributeDocData", 256, data.len()));
        }

        let doc_data = data[0..256].to_vec();

        Ok(DistributeDocData { data: doc_data })
    }
}
