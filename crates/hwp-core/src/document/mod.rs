mod bindata;
pub mod bodytext;
mod constants;
mod docinfo;
/// HWP Document structure
///
/// This module defines the main document structure for HWP files.
///
/// 스펙 문서 매핑: 표 2 - 전체 구조
mod fileheader;

pub use bindata::{BinData, BinaryDataFormat};
pub use bodytext::{
    BodyText, ColumnDivideType, CtrlHeader, CtrlHeaderData, CtrlId, Paragraph, ParagraphRecord,
    Section,
};
pub use docinfo::{
    BorderFill, Bullet, CharShape, DocInfo, DocumentProperties, FaceName, IdMappings, Numbering,
    ParaShape, Style, TabDef,
};
pub use fileheader::FileHeader;

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

    /// Convert HWP document to Markdown format
    /// HWP 문서를 마크다운 형식으로 변환
    ///
    /// # Returns / 반환값
    /// Markdown string representation of the document / 문서의 마크다운 문자열 표현
    pub fn to_markdown(&self) -> String {
        crate::viewer::to_markdown(self)
    }
}
