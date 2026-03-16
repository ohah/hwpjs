//! HwpDocument → hwp_model::Document 변환 모듈
//!
//! 기존 hwp-core parser가 생성하는 HwpDocument를
//! hwp-model의 공통 Document 모델로 변환한다.
//! 이 어댑터는 viewer가 Document 기준으로 리팩토링되면
//! HWP/HWPX 양쪽에서 동일한 viewer를 사용할 수 있게 한다.

use crate::document::HwpDocument;
use hwp_model::document::{BinaryItem, BinaryStore, Document, DocumentMeta, DocumentSettings, ImageFormat};

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
    let props = &hwp.doc_info.document_properties;
    DocumentSettings {
        page_start: props.page_start_number,
        footnote_start: props.footnote_start_number,
        endnote_start: props.endnote_start_number,
        picture_start: props.image_start_number,
        table_start: props.table_start_number,
        equation_start: props.formula_start_number,
    }
}

fn convert_binaries(hwp: &HwpDocument) -> BinaryStore {
    let mut store = BinaryStore::default();

    for (path, data) in &hwp.bin_data.entries {
        let format = if path.ends_with(".png") || path.ends_with(".PNG") {
            ImageFormat::Png
        } else if path.ends_with(".jpg") || path.ends_with(".jpeg") || path.ends_with(".JPG") {
            ImageFormat::Jpg
        } else if path.ends_with(".gif") || path.ends_with(".GIF") {
            ImageFormat::Gif
        } else if path.ends_with(".bmp") || path.ends_with(".BMP") {
            ImageFormat::Bmp
        } else if path.ends_with(".wmf") || path.ends_with(".WMF") {
            ImageFormat::Wmf
        } else if path.ends_with(".emf") || path.ends_with(".EMF") {
            ImageFormat::Emf
        } else {
            ImageFormat::Unknown(
                path.rsplit('.')
                    .next()
                    .unwrap_or("")
                    .to_lowercase(),
            )
        };

        store.items.push(BinaryItem {
            id: path.clone(),
            src: path.clone(),
            format,
            data: data.clone(),
        });
    }

    store
}
