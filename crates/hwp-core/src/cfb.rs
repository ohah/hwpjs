/// CFB (Compound File Binary) parsing module
///
/// This module handles parsing of CFB structures used in HWP files.
/// HWP 파일은 CFB 형식을 사용하여 여러 스토리지와 스트림을 포함합니다.
///
/// 스펙 문서 매핑: 표 2 - 파일 구조 (CFB 구조)
use cfb::CompoundFile;
use std::io::{Cursor, Read};

/// CFB parser for HWP files
/// HWP 파일용 CFB 파서
pub struct CfbParser;

impl CfbParser {
    /// Parse CFB structure from byte array
    /// 바이트 배열에서 CFB 구조를 파싱합니다.
    ///
    /// # Arguments
    /// * `data` - Byte array containing CFB file data / CFB 파일 데이터를 포함하는 바이트 배열
    ///
    /// # Returns
    /// Parsed CompoundFile structure / 파싱된 CompoundFile 구조체
    pub fn parse(data: &[u8]) -> Result<CompoundFile<Cursor<&[u8]>>, String> {
        let cursor = Cursor::new(data);
        CompoundFile::open(cursor).map_err(|e| format!("Failed to parse CFB: {}", e))
    }

    /// Read a stream from CFB structure (root level)
    /// CFB 구조에서 스트림을 읽습니다 (루트 레벨).
    ///
    /// # Arguments
    /// * `cfb` - CompoundFile structure (mutable reference required) / CompoundFile 구조체 (가변 참조 필요)
    /// * `stream_name` - Name of the stream to read / 읽을 스트림 이름
    ///
    /// # Returns
    /// Stream content as byte vector / 바이트 벡터로 된 스트림 내용
    pub fn read_stream(
        cfb: &mut CompoundFile<Cursor<&[u8]>>,
        stream_name: &str,
    ) -> Result<Vec<u8>, String> {
        let mut stream = cfb
            .open_stream(stream_name)
            .map_err(|e| format!("Failed to open stream '{}': {}", stream_name, e))?;

        let mut buffer = Vec::new();
        stream
            .read_to_end(&mut buffer)
            .map_err(|e| format!("Failed to read stream '{}': {}", stream_name, e))?;

        Ok(buffer)
    }

    /// Read a stream from nested storage (e.g., BodyText/Section0)
    /// 중첩된 스토리지에서 스트림을 읽습니다 (예: BodyText/Section0).
    ///
    /// # Arguments
    /// * `cfb` - CompoundFile structure (mutable reference required) / CompoundFile 구조체 (가변 참조 필요)
    /// * `storage_name` - Name of the storage (e.g., "BodyText") / 스토리지 이름 (예: "BodyText")
    /// * `stream_name` - Name of the stream within the storage (e.g., "Section0") / 스토리지 내 스트림 이름 (예: "Section0")
    ///
    /// # Returns
    /// Stream content as byte vector / 바이트 벡터로 된 스트림 내용
    pub fn read_nested_stream(
        cfb: &mut CompoundFile<Cursor<&[u8]>>,
        storage_name: &str,
        stream_name: &str,
    ) -> Result<Vec<u8>, String> {
        // First, try to open the storage and then the stream
        // If open_storage is not available, fall back to path-based approach
        // 먼저 스토리지를 열고 그 안에서 스트림을 열려고 시도합니다.
        // open_storage를 사용할 수 없는 경우 경로 기반 접근 방식으로 폴백합니다.
        let path = format!("{}/{}", storage_name, stream_name);

        // Try path-based approach first (most CFB libraries support this)
        // 먼저 경로 기반 접근 방식을 시도합니다 (대부분의 CFB 라이브러리가 이를 지원합니다).
        match cfb.open_stream(&path) {
            Ok(mut stream) => {
                let mut buffer = Vec::new();
                stream.read_to_end(&mut buffer).map_err(|e| {
                    format!(
                        "Failed to read stream '{}/{}': {}",
                        storage_name, stream_name, e
                    )
                })?;
                Ok(buffer)
            }
            Err(_) => {
                // Fallback: try with "Root Entry/" prefix (hwp.js style)
                // 폴백: "Root Entry/" 접두사를 사용하여 시도합니다 (hwp.js 스타일).
                let root_path = format!("Root Entry/{}/{}", storage_name, stream_name);
                match cfb.open_stream(&root_path) {
                    Ok(mut stream) => {
                        let mut buffer = Vec::new();
                        stream
                            .read_to_end(&mut buffer)
                            .map_err(|e| format!("Failed to read stream '{}': {}", root_path, e))?;
                        Ok(buffer)
                    }
                    Err(e) => Err(format!(
                        "Failed to open nested stream '{}/{}': Tried '{}' and '{}', last error: {}",
                        storage_name, stream_name, path, root_path, e
                    )),
                }
            }
        }
    }

    /// Read a BodyText section stream (convenience method)
    /// BodyText 섹션 스트림을 읽습니다 (편의 메서드).
    ///
    /// # Arguments
    /// * `cfb` - CompoundFile structure (mutable reference required) / CompoundFile 구조체 (가변 참조 필요)
    /// * `section_index` - Section index (0-based) / 섹션 인덱스 (0부터 시작)
    ///
    /// # Returns
    /// Stream content as byte vector / 바이트 벡터로 된 스트림 내용
    pub fn read_bodytext_section(
        cfb: &mut CompoundFile<Cursor<&[u8]>>,
        section_index: u16,
    ) -> Result<Vec<u8>, String> {
        let stream_name = format!("Section{}", section_index);
        Self::read_nested_stream(cfb, "BodyText", &stream_name)
    }
}
