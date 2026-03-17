//! HwpDocument → hwp_model::Document 변환 모듈
//!
//! 기존 hwp-core parser가 생성하는 HwpDocument를
//! hwp-model의 공통 Document 모델로 변환한다.
//! 이 어댑터는 viewer가 Document 기준으로 리팩토링되면
//! HWP/HWPX 양쪽에서 동일한 viewer를 사용할 수 있게 한다.

use crate::document::HwpDocument;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use hwp_model::document::{BinaryItem, BinaryStore, Document, DocumentMeta, DocumentSettings, ImageFormat};

mod resources;
mod section;

/// HwpDocument를 hwp-model Document로 변환
pub fn to_document(hwp: &HwpDocument) -> Document {
    Document {
        meta: convert_meta(hwp),
        settings: convert_settings(hwp),
        resources: resources::convert_resources(&hwp.doc_info),
        sections: section::convert_sections(&hwp.body_text, &hwp.doc_info),
        binaries: convert_binaries(hwp),
        ..Default::default()
    }
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

fn convert_binaries(hwp: &HwpDocument) -> BinaryStore {
    use crate::document::docinfo::BinDataRecord;

    // DocInfo의 BinDataRecord에서 확장자 정보를 인덱스별로 매핑
    let mut ext_map = std::collections::HashMap::new();
    for record in &hwp.doc_info.bin_data {
        match record {
            BinDataRecord::Embedding { embedding, .. } => {
                ext_map.insert(embedding.binary_data_id, embedding.extension.clone());
            }
            BinDataRecord::Storage { storage, .. } => {
                ext_map.insert(storage.binary_data_id, "ole".to_string());
            }
            BinDataRecord::Link { .. } => {}
        }
    }

    let items = hwp
        .bin_data
        .items
        .iter()
        .filter_map(|item| {
            let data = STANDARD.decode(&item.data).ok()?;
            let ext = ext_map
                .get(&item.index)
                .map(|s| s.as_str())
                .unwrap_or("");
            let format = extension_to_image_format(ext);
            let id = format!("BIN{:04X}", item.index);
            let src = if ext.is_empty() {
                id.clone()
            } else {
                format!("{}.{}", id, ext)
            };
            Some(BinaryItem {
                id,
                src,
                format,
                data,
            })
        })
        .collect();

    BinaryStore { items }
}

fn extension_to_image_format(ext: &str) -> ImageFormat {
    match ext.to_lowercase().as_str() {
        "png" => ImageFormat::Png,
        "jpg" | "jpeg" => ImageFormat::Jpg,
        "bmp" => ImageFormat::Bmp,
        "gif" => ImageFormat::Gif,
        "tiff" | "tif" => ImageFormat::Tiff,
        "wmf" => ImageFormat::Wmf,
        "emf" => ImageFormat::Emf,
        "svg" => ImageFormat::Svg,
        other => ImageFormat::Unknown(other.to_string()),
    }
}
