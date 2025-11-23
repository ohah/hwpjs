/// BinData parsing module
///
/// This module handles parsing of HWP BinData storage.
///
/// 스펙 문서 매핑: 표 2 - 바이너리 데이터 (BinData 스토리지)
use crate::types::WORD;
use serde::{Deserialize, Serialize};

/// Binary data structure
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BinData {
    /// Binary data items (BinaryData0, BinaryData1, etc.)
    pub items: Vec<BinaryDataItem>,
}

/// Binary data item
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BinaryDataItem {
    /// Item index
    pub index: WORD,
    /// Binary data (raw bytes)
    pub data: Vec<u8>,
}
