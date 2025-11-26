/// BinData parsing module
///
/// This module handles parsing of HWP BinData storage.
///
/// 스펙 문서 매핑: 표 2 - 바이너리 데이터 (BinData 스토리지)
use crate::decompress::decompress_deflate;
use crate::document::docinfo::BinDataRecord;
use crate::types::WORD;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use cfb::CompoundFile;
use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read};
use std::path::Path;

/// Binary data output format
/// 바이너리 데이터 출력 형식
#[derive(Debug, Clone)]
pub enum BinaryDataFormat {
    /// Base64 encoded string / Base64로 인코딩된 문자열
    Base64,
    /// File path where binary data is saved / 바이너리 데이터가 저장된 파일 경로
    File(String),
}

/// Binary data structure
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BinData {
    /// Binary data items (BinaryData0, BinaryData1, etc.)
    pub items: Vec<BinaryDataItem>,
}

/// Binary data item
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BinaryDataItem {
    /// Item index
    pub index: WORD,
    /// Base64 encoded data or file path / Base64로 인코딩된 데이터 또는 파일 경로
    pub data: String,
}

impl BinData {
    /// Parse BinData storage from CFB structure
    /// CFB 구조에서 BinData 스토리지를 파싱합니다.
    ///
    /// # Arguments
    /// * `cfb` - CompoundFile structure (mutable reference required) / CompoundFile 구조체 (가변 참조 필요)
    /// * `output_format` - Output format for binary data / 바이너리 데이터 출력 형식
    /// * `bin_data_records` - BinData records from DocInfo (표 17) / DocInfo의 BinData 레코드 (표 17)
    ///
    /// # Returns
    /// Parsed BinData structure / 파싱된 BinData 구조체
    ///
    /// # Notes
    /// 표 17의 HWPTAG_BIN_DATA 레코드에서 EMBEDDING 타입인 경우 `binary_data_id`와 `extension` 정보를 사용합니다.
    /// When BinDataRecord type is EMBEDDING, we use `binary_data_id` and `extension` from Table 17.
    pub fn parse(
        cfb: &mut CompoundFile<Cursor<&[u8]>>,
        output_format: BinaryDataFormat,
        bin_data_records: &[BinDataRecord],
    ) -> Result<Self, String> {
        let mut items = Vec::new();

        // 표 17의 bin_data_records를 사용하여 스트림을 찾습니다 (EMBEDDING/STORAGE 타입만)
        // Use bin_data_records from Table 17 to find streams (only EMBEDDING/STORAGE types)
        for record in bin_data_records {
            let (binary_data_id, extension_opt) = match record {
                BinDataRecord::Embedding { embedding, .. } => {
                    (embedding.binary_data_id, Some(embedding.extension.clone()))
                }
                BinDataRecord::Storage { storage, .. } => (storage.binary_data_id, None),
                BinDataRecord::Link { .. } => {
                    // LINK 타입은 BinData 스토리지에 없으므로 건너뜀
                    // LINK type is not in BinData storage, so skip
                    continue;
                }
            };

            let base_stream_name = format!("BIN{:04X}", binary_data_id);

            // Try different path formats
            // 다양한 경로 형식 시도
            let mut paths = vec![
                format!("BinData/{}", base_stream_name),
                format!("Root Entry/BinData/{}", base_stream_name),
                base_stream_name.clone(),
            ];

            // 표 17의 extension 정보가 있으면 확장자 포함 경로도 시도
            // If extension info from Table 17 exists, also try paths with extension
            if let Some(ext) = &extension_opt {
                paths.push(format!("BinData/{}.{}", base_stream_name, ext));
                paths.push(format!("Root Entry/BinData/{}.{}", base_stream_name, ext));
            }

            let mut found = false;
            for path in &paths {
                match cfb.open_stream(path) {
                    Ok(mut stream) => {
                        let mut buffer = Vec::new();
                        match stream.read_to_end(&mut buffer) {
                            Ok(_) => {
                                if !buffer.is_empty() {
                                    // BinData 스트림은 압축되어 있으므로 압축 해제 필요
                                    // BinData streams are compressed, so decompression is required
                                    // 레거시 코드 참고: hwpjs.js는 pako.inflate(..., { windowBits: -15 })
                                    //                  pyhwp는 zlib.decompress(..., -15) 사용
                                    // Reference: hwpjs.js uses pako.inflate(..., { windowBits: -15 })
                                    //            pyhwp uses zlib.decompress(..., -15)
                                    let compressed_size = buffer.len();
                                    let decompressed_buffer = match decompress_deflate(&buffer) {
                                        Ok(decompressed) => decompressed,
                                        Err(e) => {
                                            eprintln!(
                                                "Warning: Failed to decompress BinData stream '{}' (id={}): {}. Using raw data.",
                                                path, binary_data_id, e
                                            );
                                            buffer.clone() // 압축 해제 실패 시 원본 데이터 사용
                                        }
                                    };

                                    let data = match &output_format {
                                        BinaryDataFormat::Base64 => {
                                            STANDARD.encode(&decompressed_buffer)
                                        }
                                        BinaryDataFormat::File(dir_path) => {
                                            let ext = extension_opt.as_deref().unwrap_or("bin");
                                            let file_name = format!("{}.{}", base_stream_name, ext);
                                            let file_path = Path::new(dir_path).join(&file_name);

                                            std::fs::create_dir_all(dir_path).map_err(|e| {
                                                format!(
                                                    "Failed to create directory '{}': {}",
                                                    dir_path, e
                                                )
                                            })?;

                                            std::fs::write(&file_path, &decompressed_buffer)
                                                .map_err(|e| {
                                                    format!(
                                                        "Failed to write file '{}': {}",
                                                        file_path.display(),
                                                        e
                                                    )
                                                })?;

                                            file_path.to_string_lossy().to_string()
                                        }
                                    };

                                    items.push(BinaryDataItem {
                                        index: binary_data_id,
                                        data,
                                    });
                                    found = true;
                                    break;
                                }
                            }
                            Err(_) => continue,
                        }
                    }
                    Err(_) => continue,
                }
            }

            if !found {
                // 스트림을 찾지 못했지만 계속 진행 (다른 레코드는 있을 수 있음)
                // Stream not found, but continue (other records may exist)
            }
        }

        Ok(BinData { items })
    }
}
