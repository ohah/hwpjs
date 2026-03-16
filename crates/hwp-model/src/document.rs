use crate::hints::{HwpDocumentHints, HwpxDocumentHints};
use crate::resources::Resources;
use crate::section::Section;
use crate::types::CompatibleDocument;

/// 공통 문서 루트. HWP 5.0과 HWPX 양쪽에서 파싱한 결과를 담는다.
#[derive(Debug, Clone, Default)]
pub struct Document {
    pub meta: DocumentMeta,
    pub settings: DocumentSettings,
    pub resources: Resources,
    pub sections: Vec<Section>,
    pub binaries: BinaryStore,
    pub compatible_document: Option<CompatibleDocument>,

    /// HWP 5.0 roundtrip용 힌트
    pub hwp_hints: Option<HwpDocumentHints>,
    /// HWPX roundtrip용 힌트
    pub hwpx_hints: Option<HwpxDocumentHints>,
}

/// Dublin Core 메타데이터 + HWP 공통
#[derive(Debug, Clone, Default)]
pub struct DocumentMeta {
    pub title: Option<String>,
    pub creator: Option<String>,
    pub description: Option<String>,
    pub language: Option<String>,
    pub created_date: Option<String>,
    pub modified_date: Option<String>,
    pub keywords: Option<String>,
    pub subject: Option<String>,
    pub publisher: Option<String>,
}

/// 시작번호 설정
#[derive(Debug, Clone, Default)]
pub struct DocumentSettings {
    pub page_start: u16,
    pub footnote_start: u16,
    pub endnote_start: u16,
    pub picture_start: u16,
    pub table_start: u16,
    pub equation_start: u16,
}

/// 바이너리(이미지 등) 저장소
#[derive(Debug, Clone, Default)]
pub struct BinaryStore {
    pub items: Vec<BinaryItem>,
}

#[derive(Debug, Clone)]
pub struct BinaryItem {
    pub id: String,
    pub src: String,
    pub format: ImageFormat,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub enum ImageFormat {
    #[default]
    Png,
    Jpg,
    Bmp,
    Gif,
    Tiff,
    Wmf,
    Emf,
    Svg,
    Unknown(String),
}
