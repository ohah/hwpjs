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
mod preview_image;
mod preview_text;
mod scripts;
mod xml_template;

pub use bindata::{BinData, BinaryDataFormat};
pub use bodytext::{
    BodyText, ColumnDivideType, CtrlHeader, CtrlHeaderData, CtrlId, PageNumberPosition, Paragraph,
    ParagraphRecord, Section,
};
pub use docinfo::{
    BinDataRecord, BorderFill, Bullet, CharShape, DocInfo, DocumentProperties, FaceName,
    IdMappings, Numbering, ParaShape, Style, TabDef,
};
pub use fileheader::FileHeader;
pub use preview_image::PreviewImage;
pub use preview_text::PreviewText;
pub use scripts::Scripts;
pub use xml_template::XmlTemplate;

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
    /// Preview text (PrvText stream)
    pub preview_text: Option<PreviewText>,
    /// Preview image (PrvImage stream)
    pub preview_image: Option<PreviewImage>,
    /// Scripts (Scripts storage)
    pub scripts: Option<Scripts>,
    /// XML Template (XMLTemplate storage)
    pub xml_template: Option<XmlTemplate>,
}

impl HwpDocument {
    /// Create a new empty HWP document
    pub fn new(file_header: FileHeader) -> Self {
        Self {
            file_header,
            doc_info: DocInfo::default(),
            body_text: BodyText::default(),
            bin_data: BinData::default(),
            preview_text: None,
            preview_image: None,
            scripts: None,
            xml_template: None,
        }
    }

    /// Convert HWP document to Markdown format
    /// HWP 문서를 마크다운 형식으로 변환
    ///
    /// # Arguments / 매개변수
    /// * `image_output_dir` - Optional directory path to save images as files. If None, images are embedded as base64 data URIs.
    ///                        이미지를 파일로 저장할 디렉토리 경로 (선택). None이면 base64 데이터 URI로 임베드됩니다.
    ///
    /// # Returns / 반환값
    /// Markdown string representation of the document / 문서의 마크다운 문자열 표현
    pub fn to_markdown(&self, image_output_dir: Option<&str>) -> String {
        crate::viewer::to_markdown(self, image_output_dir)
    }
}
