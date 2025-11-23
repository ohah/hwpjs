/// BodyText parsing module
///
/// This module handles parsing of HWP BodyText storage.
/// 
/// 스펙 문서 매핑: 표 2 - 본문 (BodyText 스토리지)

use crate::types::WORD;
use serde::{Deserialize, Serialize};

/// Body text structure
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BodyText {
    /// Sections (Section0, Section1, etc.)
    pub sections: Vec<Section>,
}

/// Section structure
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Section {
    /// Section index
    pub index: WORD,
    /// Section data (raw bytes, will be parsed later)
    pub data: Vec<u8>,
}

