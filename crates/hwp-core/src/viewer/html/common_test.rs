/// HTML common module unit tests
use super::common::{get_extension_from_bindata_id, get_mime_type_from_bindata_id, get_image_url};
use crate::document::BinDataRecord;
use crate::document::docinfo::bin_data::{BinDataAttributes, BinDataStorageType, CompressionType};
use crate::document::docinfo::bin_data::{AccessState, BinDataEmbedding, BinDataLink, BinDataStorage};
use crate::document::{DocInfo, FileHeader, HwpDocument};
use base64::engine::general_purpose::STANDARD;

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_file_header() -> FileHeader {
        FileHeader {
            signature: "HWP Document File".to_string(),
            version: 0,
            document_flags: 0,
            license_flags: 0,
            encrypt_version: 0,
            kogl_country: 0,
            reserved: vec![0u8; 207],
        }
    }

    fn create_test_document() -> HwpDocument {
        HwpDocument {
            file_header: create_test_file_header(),
            doc_info: DocInfo {
                bin_data: vec![BinDataRecord::Embedding {
                    attributes: BinDataAttributes {
                        storage_type: BinDataStorageType::Link,
                        compression: CompressionType::StorageDefault,
                        access: AccessState::Never,
                    },
                    embedding: BinDataEmbedding {
                        binary_data_id: 0x1001,
                        extension: "png".to_string(),
                    },
                }],
                ..Default::default()
            },
            body_text: Default::default(),
            bin_data: Default::default(),
            preview_text: None,
            preview_image: None,
            scripts: None,
            xml_template: None,
            summary_information: None,
        }
    }

    fn create_jpg_file_header() -> FileHeader {
        FileHeader {
            signature: "HWP Document File".to_string(),
            version: 0,
            document_flags: 0,
            license_flags: 0,
            encrypt_version: 0,
            kogl_country: 0,
            reserved: vec![0u8; 207],
        }
    }

    fn create_jpg_document() -> HwpDocument {
        HwpDocument {
            file_header: create_jpg_file_header(),
            doc_info: DocInfo {
                bin_data: vec![BinDataRecord::Embedding {
                    attributes: BinDataAttributes {
                        storage_type: BinDataStorageType::Link,
                        compression: CompressionType::StorageDefault,
                        access: AccessState::Never,
                    },
                    embedding: BinDataEmbedding {
                        binary_data_id: 0x1002,
                        extension: "jpg".to_string(),
                    },
                }],
                ..Default::default()
            },
            body_text: Default::default(),
            bin_data: Default::default(),
            preview_text: None,
            preview_image: None,
            scripts: None,
            xml_template: None,
            summary_information: None,
        }
    }

    #[test]
    fn test_get_extension_from_bindata_id_found() {
        let doc = create_test_document();
        assert_eq!(get_extension_from_bindata_id(&doc, 0x1001), "png");
    }

    #[test]
    fn test_get_extension_from_bindata_id_not_found() {
        let doc = HwpDocument {
            file_header: create_test_file_header(),
            doc_info: DocInfo::default(),
            body_text: Default::default(),
            bin_data: Default::default(),
            preview_text: None,
            preview_image: None,
            scripts: None,
            xml_template: None,
            summary_information: None,
        };
        assert_eq!(get_extension_from_bindata_id(&doc, 0x1001), "jpg");
    }

    #[test]
    fn test_get_extension_from_bindata_id_jpg_not_jpeg() {
        let doc = create_jpg_document();
        assert_eq!(get_extension_from_bindata_id(&doc, 0x1002), "jpg");
        assert_eq!(get_mime_type_from_bindata_id(&doc, 0x1002), "image/jpeg");
    }

    #[test]
    fn test_get_mime_type_unknown_extension() {
        let doc = HwpDocument {
            file_header: create_test_file_header(),
            doc_info: DocInfo {
                bin_data: vec![BinDataRecord::Embedding {
                    attributes: BinDataAttributes {
                        storage_type: BinDataStorageType::Link,
                        compression: CompressionType::StorageDefault,
                        access: AccessState::Never,
                    },
                    embedding: BinDataEmbedding {
                        binary_data_id: 0x1003,
                        extension: "bmp".to_string(),
                    },
                }],
                ..Default::default()
            },
            body_text: Default::default(),
            bin_data: Default::default(),
            preview_text: None,
            preview_image: None,
            scripts: None,
            xml_template: None,
            summary_information: None,
        };
        assert_eq!(get_mime_type_from_bindata_id(&doc, 0x1003), "image/bmp");
    }

    #[test]
    fn test_get_mime_type_not_found() {
        let doc = HwpDocument {
            file_header: create_test_file_header(),
            doc_info: DocInfo::default(),
            body_text: Default::default(),
            bin_data: Default::default(),
            preview_text: None,
            preview_image: None,
            scripts: None,
            xml_template: None,
            summary_information: None,
        };
        assert_eq!(get_mime_type_from_bindata_id(&doc, 0x1001), "image/jpeg");
    }

    #[test]
    fn test_get_image_url_empty_base64() {
        let doc = HwpDocument {
            file_header: create_test_file_header(),
            doc_info: DocInfo::default(),
            body_text: Default::default(),
            bin_data: Default::default(),
            preview_text: None,
            preview_image: None,
            scripts: None,
            xml_template: None,
            summary_information: None,
        };
        assert_eq!(get_image_url(&doc, 0x1001, None, None), "");
    }

    #[test]
    fn test_get_image_url_empty_data_field() {
        let doc = create_test_document();
        assert_eq!(get_image_url(&doc, 0x1001, None, None), "");
    }

    #[test]
    fn test_get_image_url_not_found() {
        let doc = HwpDocument {
            file_header: create_test_file_header(),
            doc_info: DocInfo::default(),
            body_text: Default::default(),
            bin_data: Default::default(),
            preview_text: None,
            preview_image: None,
            scripts: None,
            xml_template: None,
            summary_information: None,
        };
        assert_eq!(get_image_url(&doc, 0xFFFF, None, None), "");
    }
}