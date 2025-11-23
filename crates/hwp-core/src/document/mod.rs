/// HWP Document structure
/// 
/// This module defines the main document structure for HWP files.
/// 
/// 스펙 문서 매핑: 표 2 - 전체 구조

mod fileheader;
mod docinfo;
mod bodytext;
mod bindata;

pub use fileheader::FileHeader;
pub use docinfo::DocInfo;
pub use bodytext::{BodyText, Section};
pub use bindata::BinData;

use serde::{Deserialize, Serialize};

/// Main HWP document structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HwpDocument {
    /// File header information
    pub file_header: FileHeader,
    /// Document information (DocInfo stream)
    pub doc_info: DocInfo,
    /// Body text (BodyText storage)
    pub body_text: BodyText,
    /// Binary data (BinData storage)
    pub bin_data: BinData,
}

impl HwpDocument {
    /// Create a new empty HWP document
    pub fn new(file_header: FileHeader) -> Self {
        Self {
            file_header,
            doc_info: DocInfo::default(),
            body_text: BodyText::default(),
            bin_data: BinData::default(),
        }
    }
}

