//! HwpDocument → hwp_model::Document 변환 모듈
//!
//! 기존 hwp-core parser가 생성하는 HwpDocument를
//! hwp-model의 공통 Document 모델로 변환한다.
//! 이 어댑터는 viewer가 Document 기준으로 리팩토링되면
//! HWP/HWPX 양쪽에서 동일한 viewer를 사용할 수 있게 한다.

use crate::document::HwpDocument;
use hwp_model::document::{
    BinaryItem, BinaryStore, Document, DocumentMeta, DocumentSettings, ImageFormat,
};

mod resources;
mod section;

/// HwpDocument를 hwp-model Document로 변환
pub fn to_document(hwp: &HwpDocument) -> Document {
    let mut doc = Document::default();

    // 메타데이터
    doc.meta = convert_meta(hwp);

    // 시작번호
    doc.settings = convert_settings(hwp);

    // Resources (DocInfo)
    doc.resources = resources::convert_resources(&hwp.doc_info);

    // Sections (BodyText)
    doc.sections = section::convert_sections(&hwp.body_text, &hwp.doc_info);

    // Binaries
    doc.binaries = convert_binaries(hwp);

    doc
}

fn convert_meta(hwp: &HwpDocument) -> DocumentMeta {
    let mut meta = DocumentMeta::default();

    if let Some(ref si) = hwp.summary_information {
        meta.title = si.title.clone();
        meta.creator = si.author.clone();
        meta.subject = si.subject.clone();
        meta.keywords = si.keywords.clone();
        meta.description = si.comments.clone();
    }

    meta
}

fn convert_settings(hwp: &HwpDocument) -> DocumentSettings {
    match &hwp.doc_info.document_properties {
        Some(props) => DocumentSettings {
            page_start: props.page_start_number,
            footnote_start: props.footnote_start_number,
            endnote_start: props.endnote_start_number,
            picture_start: props.image_start_number,
            table_start: props.table_start_number,
            equation_start: props.formula_start_number,
        },
        None => DocumentSettings::default(),
    }
}

fn convert_binaries(_hwp: &HwpDocument) -> BinaryStore {
    // HWP 5.0의 BinData는 CFB 스토리지 내 별도 스트림으로 저장되어 있고,
    // HwpDocument.bin_data.items에는 경로/인덱스 정보만 있음.
    // 실제 바이너리 데이터는 파싱 시점에 이미 추출되어 있어야 함.
    // TODO: HwpParser에서 bin_data 바이트를 Document로 전달하는 경로 추가
    BinaryStore::default()
}
