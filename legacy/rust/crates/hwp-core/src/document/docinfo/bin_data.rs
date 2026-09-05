/// BinData record structure
///
/// This module handles parsing of HWPTAG_BIN_DATA records from DocInfo.
///
/// 스펙 문서 매핑: 표 17 - 바이너리 데이터 / Spec mapping: Table 17 - Binary data
/// Tag ID: HWPTAG_BIN_DATA
use crate::error::HwpError;
use crate::types::{decode_utf16le, UINT16, WORD};
use serde::{Deserialize, Serialize};

/// 바이너리 데이터 저장 타입 / Binary data storage type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum BinDataStorageType {
    /// LINK, 그림 외부 파일 참조 / Link, external file reference
    Link = 0x0000,
    /// EMBEDDING, 그림 파일 포함 / Embedding, embedded file
    Embedding = 0x0001,
    /// STORAGE, OLE 포함 / Storage, OLE embedded
    Storage = 0x0002,
}

impl BinDataStorageType {
    /// UINT16 값에서 BinDataStorageType 생성 / Create BinDataStorageType from UINT16 value
    fn from_u16(value: UINT16) -> Self {
        match value & 0x000F {
            0x0000 => BinDataStorageType::Link,
            0x0001 => BinDataStorageType::Embedding,
            0x0002 => BinDataStorageType::Storage,
            _ => BinDataStorageType::Link, // Default fallback
        }
    }
}

/// 압축 타입 / Compression type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CompressionType {
    /// 스토리지의 디폴트 모드 따라감 / Follow storage default mode
    StorageDefault = 0x0000,
    /// 무조건 압축 / Always compress
    Compress = 0x0010,
    /// 무조건 압축하지 않음 / Never compress
    NoCompress = 0x0020,
}

impl CompressionType {
    /// UINT16 값에서 CompressionType 생성 / Create CompressionType from UINT16 value
    fn from_u16(value: UINT16) -> Self {
        match value & 0x0030 {
            0x0000 => CompressionType::StorageDefault,
            0x0010 => CompressionType::Compress,
            0x0020 => CompressionType::NoCompress,
            _ => CompressionType::StorageDefault, // Default fallback
        }
    }
}

/// 접근 상태 / Access state
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccessState {
    /// 아직 access 된 적이 없는 상태 / Never accessed
    Never = 0x0000,
    /// access에 성공하여 파일을 찾은 상태 / Successfully accessed, file found
    Success = 0x0100,
    /// access가 실패한 에러 상태 / Access failed with error
    Failed = 0x0200,
    /// 링크 access가 실패했으나 무시된 상태 / Link access failed but ignored
    FailedIgnored = 0x0300,
}

impl AccessState {
    /// UINT16 값에서 AccessState 생성 / Create AccessState from UINT16 value
    fn from_u16(value: UINT16) -> Self {
        match value & 0x0300 {
            0x0000 => AccessState::Never,
            0x0100 => AccessState::Success,
            0x0200 => AccessState::Failed,
            0x0300 => AccessState::FailedIgnored,
            _ => AccessState::Never, // Default fallback
        }
    }
}

/// 바이너리 데이터 속성 / Binary data attributes
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct BinDataAttributes {
    /// 저장 타입 / Storage type
    pub storage_type: BinDataStorageType,
    /// 압축 타입 / Compression type
    pub compression: CompressionType,
    /// 접근 상태 / Access state
    pub access: AccessState,
}

impl BinDataAttributes {
    /// UINT16 값에서 BinDataAttributes 생성 / Create BinDataAttributes from UINT16 value
    fn from_u16(value: UINT16) -> Self {
        Self {
            storage_type: BinDataStorageType::from_u16(value),
            compression: CompressionType::from_u16(value),
            access: AccessState::from_u16(value),
        }
    }
}

/// LINK 타입 데이터 / Link type data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinDataLink {
    /// 연결 파일의 절대 경로 / Absolute path of linked file
    pub absolute_path: String,
    /// 연결 파일의 상대 경로 / Relative path of linked file
    pub relative_path: String,
}

/// EMBEDDING 타입 데이터 / Embedding type data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinDataEmbedding {
    /// BINDATASTORAGE에 저장된 바이너리 데이터의 아이디 / Binary data ID stored in BINDATASTORAGE
    pub binary_data_id: UINT16,
    /// 바이너리 데이터의 형식 이름 (extension, "." 제외) / Format name (extension without ".")
    /// - 그림의 경우: jpg, bmp, gif / For images: jpg, bmp, gif
    /// - OLE의 경우: ole / For OLE: ole
    pub extension: String,
}

/// STORAGE 타입 데이터 / Storage type data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinDataStorage {
    /// BINDATASTORAGE에 저장된 바이너리 데이터의 아이디 / Binary data ID stored in BINDATASTORAGE
    pub binary_data_id: UINT16,
}

/// 바이너리 데이터 레코드 / Binary data record
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "storage_type", rename_all = "UPPERCASE")]
pub enum BinDataRecord {
    /// LINK 타입 / Link type
    Link {
        /// 속성 / Attributes
        attributes: BinDataAttributes,
        /// LINK 데이터 / Link data
        link: BinDataLink,
    },
    /// EMBEDDING 타입 / Embedding type
    Embedding {
        /// 속성 / Attributes
        attributes: BinDataAttributes,
        /// EMBEDDING 데이터 / Embedding data
        embedding: BinDataEmbedding,
    },
    /// STORAGE 타입 / Storage type
    Storage {
        /// 속성 / Attributes
        attributes: BinDataAttributes,
        /// STORAGE 데이터 / Storage data
        storage: BinDataStorage,
    },
}

impl BinDataRecord {
    /// BinDataRecord를 바이트 배열에서 파싱합니다. / Parse BinDataRecord from byte array.
    ///
    /// # Arguments
    /// * `data` - BinDataRecord 데이터 / BinDataRecord data
    ///
    /// # Returns
    /// 파싱된 BinDataRecord 구조체 / Parsed BinDataRecord structure
    ///
    /// # 스펙 문서 매핑 / Spec mapping
    /// 표 17: 바이너리 데이터 / Table 17: Binary data
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 2 {
            return Err(HwpError::insufficient_data(
                "BinDataRecord attributes",
                2,
                data.len(),
            ));
        }

        let mut offset = 0;

        // 표 17: 속성 (UINT16, 2바이트) / Table 17: Attributes (UINT16, 2 bytes)
        let attr_value = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;
        let attributes = BinDataAttributes::from_u16(attr_value);

        // Type에 따라 다른 필드 파싱 / Parse different fields based on type
        match attributes.storage_type {
            BinDataStorageType::Link => {
                // 표 17: Type이 "LINK"일 때 / Table 17: When Type is "LINK"
                // 연결 파일의 절대 경로 길이 (len1) / Absolute path length (len1)
                if data.len() < offset + 2 {
                    return Err(HwpError::insufficient_data(
                        "BinDataRecord LINK absolute path length",
                        2,
                        data.len() - offset,
                    ));
                }
                let len1 = WORD::from_le_bytes([data[offset], data[offset + 1]]) as usize;
                offset += 2;

                // 연결 파일의 절대 경로 / Absolute path
                if data.len() < offset + (len1 * 2) {
                    return Err(HwpError::InsufficientData {
                        field: format!("BinDataRecord LINK absolute path at offset {}", offset),
                        expected: offset + (len1 * 2),
                        actual: data.len(),
                    });
                }
                let absolute_path_bytes = &data[offset..offset + (len1 * 2)];
                let absolute_path =
                    decode_utf16le(absolute_path_bytes).map_err(|e| HwpError::EncodingError {
                        reason: format!("Failed to decode absolute path: {}", e),
                    })?;
                offset += len1 * 2;

                // 연결 파일의 상대 경로 길이 (len2) / Relative path length (len2)
                if data.len() < offset + 2 {
                    return Err(HwpError::insufficient_data(
                        "BinDataRecord LINK relative path length",
                        2,
                        data.len() - offset,
                    ));
                }
                let len2 = WORD::from_le_bytes([data[offset], data[offset + 1]]) as usize;
                offset += 2;

                // 연결 파일의 상대 경로 / Relative path
                if data.len() < offset + (len2 * 2) {
                    return Err(HwpError::InsufficientData {
                        field: format!("BinDataRecord LINK relative path at offset {}", offset),
                        expected: offset + (len2 * 2),
                        actual: data.len(),
                    });
                }
                let relative_path_bytes = &data[offset..offset + (len2 * 2)];
                let relative_path =
                    decode_utf16le(relative_path_bytes).map_err(|e| HwpError::EncodingError {
                        reason: format!("Failed to decode relative path: {}", e),
                    })?;

                Ok(BinDataRecord::Link {
                    attributes,
                    link: BinDataLink {
                        absolute_path,
                        relative_path,
                    },
                })
            }
            BinDataStorageType::Embedding => {
                // 표 17: Type이 "EMBEDDING"일 때 / Table 17: When Type is "EMBEDDING"
                // BINDATASTORAGE에 저장된 바이너리 데이터의 아이디 / Binary data ID
                if data.len() < offset + 2 {
                    return Err(HwpError::insufficient_data(
                        "BinDataRecord EMBEDDING binary_data_id",
                        2,
                        data.len() - offset,
                    ));
                }
                let binary_data_id = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
                offset += 2;

                // 바이너리 데이터의 형식 이름의 길이 (len3) / Format name length (len3)
                if data.len() < offset + 2 {
                    return Err(HwpError::insufficient_data(
                        "BinDataRecord EMBEDDING extension length",
                        2,
                        data.len() - offset,
                    ));
                }
                let len3 = WORD::from_le_bytes([data[offset], data[offset + 1]]) as usize;
                offset += 2;

                // 바이너리 데이터의 형식 이름 (extension) / Format name (extension)
                if data.len() < offset + (len3 * 2) {
                    return Err(HwpError::InsufficientData {
                        field: format!("BinDataRecord EMBEDDING extension at offset {}", offset),
                        expected: offset + (len3 * 2),
                        actual: data.len(),
                    });
                }
                let extension_bytes = &data[offset..offset + (len3 * 2)];
                let extension =
                    decode_utf16le(extension_bytes).map_err(|e| HwpError::EncodingError {
                        reason: format!("Failed to decode extension: {}", e),
                    })?;

                Ok(BinDataRecord::Embedding {
                    attributes,
                    embedding: BinDataEmbedding {
                        binary_data_id,
                        extension,
                    },
                })
            }
            BinDataStorageType::Storage => {
                // 표 17: Type이 "STORAGE"일 때 / Table 17: When Type is "STORAGE"
                // BINDATASTORAGE에 저장된 바이너리 데이터의 아이디 / Binary data ID
                if data.len() < offset + 2 {
                    return Err(HwpError::insufficient_data(
                        "BinDataRecord STORAGE binary_data_id",
                        2,
                        data.len() - offset,
                    ));
                }
                let binary_data_id = UINT16::from_le_bytes([data[offset], data[offset + 1]]);

                Ok(BinDataRecord::Storage {
                    attributes,
                    storage: BinDataStorage { binary_data_id },
                })
            }
        }
    }
}
