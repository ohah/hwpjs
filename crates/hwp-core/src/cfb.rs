/// CFB (Compound File Binary) parsing module
///
/// This module handles parsing of CFB structures used in HWP files.
/// HWP 파일은 CFB 형식을 사용하여 여러 스토리지와 스트림을 포함합니다.
///
/// 스펙 문서 매핑: 표 2 - 파일 구조 (CFB 구조)
use crate::error::HwpError;
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
    pub fn parse(data: &[u8]) -> Result<CompoundFile<Cursor<&[u8]>>, HwpError> {
        let cursor = Cursor::new(data);
        CompoundFile::open(cursor).map_err(|e| HwpError::CfbParse(e.to_string()))
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
    ) -> Result<Vec<u8>, HwpError> {
        // Try to open stream with the given name
        // 주어진 이름으로 스트림 열기 시도
        match cfb.open_stream(stream_name) {
            Ok(mut stream) => {
                let mut buffer = Vec::new();
                stream
                    .read_to_end(&mut buffer)
                    .map_err(|e| HwpError::stream_read_error(stream_name, e.to_string()))?;
                Ok(buffer)
            }
            Err(_) => {
                // If the stream name contains special characters (like \x05),
                // cfb crate's open_stream may not handle it correctly.
                // We need to parse CFB file bytes directly to find the stream.
                // 스트림 이름에 특수 문자가 포함된 경우 (예: \x05),
                // cfb crate의 open_stream이 이를 올바르게 처리하지 못할 수 있습니다.
                // CFB 파일의 바이트를 직접 파싱하여 스트림을 찾아야 합니다.
                Err(HwpError::stream_not_found(stream_name, "root"))
            }
        }
    }

    /// Read a stream by parsing CFB directory entries directly (for streams with special characters)
    /// CFB 디렉토리 엔트리를 직접 파싱하여 스트림 읽기 (특수 문자가 포함된 스트림용)
    ///
    /// # Arguments
    /// * `data` - Original CFB file data / 원본 CFB 파일 데이터
    /// * `stream_name_bytes` - Stream name as bytes (UTF-16LE encoded) / 바이트로 된 스트림 이름 (UTF-16LE 인코딩)
    ///
    /// # Returns
    /// Stream content as byte vector / 바이트 벡터로 된 스트림 내용
    pub fn read_stream_by_bytes(
        data: &[u8],
        stream_name_bytes: &[u8],
    ) -> Result<Vec<u8>, HwpError> {
        #[cfg(debug_assertions)]
        eprintln!(
            "Debug: read_stream_by_bytes called, data len: {}, stream_name: {:?}",
            data.len(),
            stream_name_bytes
        );
        if data.len() < 512 {
            return Err(HwpError::CfbFileTooSmall {
                expected: 512,
                actual: data.len(),
            });
        }

        // CFB Header structure (first 512 bytes)
        // CFB 헤더 구조 (처음 512 바이트)
        // Sector size is usually 512 bytes, but can be different
        // 섹터 크기는 보통 512 바이트이지만 다를 수 있음

        // Read sector size from header (offset 0x1E, 2 bytes)
        // 헤더에서 섹터 크기 읽기 (오프셋 0x1E, 2 바이트)
        let sector_size = if data.len() >= 0x20 {
            let sector_size_shift = u16::from_le_bytes([data[0x1E], data[0x1F]]) as u32;
            if sector_size_shift > 12 {
                return Err(HwpError::InvalidSectorSize {
                    value: sector_size_shift,
                });
            }
            1 << sector_size_shift // Usually 512 (2^9)
        } else {
            512 // Default
        };

        // Read directory sector location (offset 0x30, 4 bytes)
        // 디렉토리 섹터 위치 읽기 (오프셋 0x30, 4 바이트)
        let dir_sector = if data.len() >= 0x34 {
            u32::from_le_bytes([data[0x30], data[0x31], data[0x32], data[0x33]])
        } else {
            return Err(HwpError::CfbFileTooSmall {
                expected: 0x34,
                actual: data.len(),
            });
        };

        // Convert stream name to UTF-16LE bytes for comparison
        // 스트림 이름을 UTF-16LE 바이트로 변환하여 비교
        // CFB directory entries store names as UTF-16LE (2 bytes per character)
        // CFB 디렉토리 엔트리는 이름을 UTF-16LE로 저장 (문자당 2 바이트)
        // The name length field stores the UTF-16LE character count (including null terminator)
        // 이름 길이 필드는 UTF-16LE 문자 개수를 저장 (null 종료 문자 포함)
        let mut stream_name_utf16 = Vec::new();
        for &b in stream_name_bytes {
            stream_name_utf16.push(b);
            stream_name_utf16.push(0); // UTF-16LE: each ASCII char is 2 bytes (low byte, high byte=0)
        }
        // Null terminator (2 bytes for UTF-16LE)
        // 널 종료 문자 (UTF-16LE는 2 바이트)
        stream_name_utf16.push(0);
        stream_name_utf16.push(0);

        // Expected name length in UTF-16LE characters (including null terminator)
        // 예상되는 UTF-16LE 문자 개수 (null 종료 문자 포함)
        let expected_name_length = (stream_name_utf16.len() / 2) as u16;

        #[cfg(debug_assertions)]
        eprintln!(
            "Debug: Stream name UTF-16LE: {:?} (first 20 bytes)",
            &stream_name_utf16[..20.min(stream_name_utf16.len())]
        );

        // Read directory entries
        // 디렉토리 엔트리 읽기
        // Each directory entry is 128 bytes
        // 각 디렉토리 엔트리는 128 바이트
        // Directory entries are stored in sectors
        // 디렉토리 엔트리는 섹터에 저장됨
        // CFB structure: Header (512 bytes) + Sectors
        // CFB 구조: 헤더 (512 바이트) + 섹터들
        // First sector starts at offset = sector_size (usually 512)
        // 첫 번째 섹터는 오프셋 = sector_size (보통 512)부터 시작
        // Directory sector number is 0-indexed, so:
        // 디렉토리 섹터 번호는 0부터 시작하므로:
        // dir_start = sector_size + (dir_sector * sector_size)
        // But if dir_sector is -1 (ENDOFCHAIN), it means no directory
        // 하지만 dir_sector가 -1 (ENDOFCHAIN)이면 디렉토리가 없음
        let dir_entry_size = 128;
        let dir_start = if dir_sector == 0xFFFFFFFF {
            return Err(HwpError::InvalidDirectorySector {
                reason: "ENDOFCHAIN marker found".to_string(),
            });
        } else {
            (sector_size as usize) + (dir_sector as usize * sector_size as usize)
        };

        #[cfg(debug_assertions)]
        eprintln!(
            "Debug: dir_sector: {}, sector_size: {}, dir_start: {}",
            dir_sector, sector_size, dir_start
        );

        if dir_start >= data.len() {
            return Err(HwpError::InvalidDirectorySector {
                reason: format!(
                    "Directory sector offset {} is beyond file size {}",
                    dir_start,
                    data.len()
                ),
            });
        }

        #[cfg(debug_assertions)]
        eprintln!(
            "Debug: Searching directory entries, dir_start: {}, sector_size: {}",
            dir_start, sector_size
        );

        // Search through directory entries (max 128 entries per sector)
        // 디렉토리 엔트리 검색 (섹터당 최대 128 엔트리)
        for i in 0..128 {
            let entry_offset = dir_start + (i * dir_entry_size);
            if entry_offset + dir_entry_size > data.len() {
                break;
            }

            // Read entry name length (first 2 bytes, UTF-16LE character count)
            // 엔트리 이름 길이 읽기 (처음 2 바이트, UTF-16LE 문자 개수)
            let name_length =
                u16::from_le_bytes([data[entry_offset], data[entry_offset + 1]]) as usize;

            // Check if entry is empty (name_length == 0 or invalid)
            // 엔트리가 비어있는지 확인 (name_length == 0 또는 유효하지 않음)
            if name_length == 0 || name_length > 32 {
                continue; // Skip empty or invalid entries
            }

            // Read entry name (UTF-16LE, up to 64 bytes = 32 characters)
            // 엔트리 이름 읽기 (UTF-16LE, 최대 64 바이트 = 32 문자)
            // Name is stored as UTF-16LE, so actual byte length is name_length * 2
            // 이름은 UTF-16LE로 저장되므로 실제 바이트 길이는 name_length * 2
            let name_byte_length = name_length * 2;
            let name_start = entry_offset + 2; // Skip length field
            let name_end = name_start + name_byte_length.min(64);
            let entry_name_bytes = &data[name_start..name_end];

            // Pad entry_name_bytes to 64 bytes for comparison
            // 비교를 위해 entry_name_bytes를 64 바이트로 패딩
            let mut entry_name = [0u8; 64];
            entry_name[..entry_name_bytes.len().min(64)]
                .copy_from_slice(&entry_name_bytes[..entry_name_bytes.len().min(64)]);

            // Check entry type (offset 66 from entry start, 1 byte)
            // 엔트리 타입 확인 (엔트리 시작부터 오프셋 66, 1 바이트)
            let entry_type = data[entry_offset + 66];

            // Check if entry name starts with our stream name (for debugging)
            // 디버깅을 위해 엔트리 이름이 스트림 이름으로 시작하는지 확인
            #[cfg(debug_assertions)]
            if i < 20 || entry_type == 2 {
                let name_str = String::from_utf16_lossy(
                    &entry_name_bytes
                        .chunks(2)
                        .take_while(|chunk| chunk.len() == 2 && (chunk[0] != 0 || chunk[1] != 0))
                        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                        .collect::<Vec<_>>(),
                );
                eprintln!(
                    "Debug: Entry {} type: {}, name_length: {}, name: {:?} (bytes: {:?})",
                    i,
                    entry_type,
                    name_length,
                    name_str,
                    &entry_name_bytes[..20.min(entry_name_bytes.len())]
                );
            }

            // Compare names byte-by-byte
            // 바이트 단위로 이름 비교
            // Compare the actual name bytes
            // 실제 이름 바이트 비교
            // Check if name length matches and bytes match
            // 이름 길이가 일치하고 바이트가 일치하는지 확인
            let name_matches = name_length == expected_name_length as usize
                && entry_name_bytes.len() >= stream_name_utf16.len()
                && entry_name_bytes[..stream_name_utf16.len()] == stream_name_utf16[..];

            if name_matches {
                #[cfg(debug_assertions)]
                eprintln!(
                    "Debug: Found matching entry at index {} (type: {})",
                    i, entry_type
                );
                // Found matching entry, check if it's a stream (type = 2)
                // 일치하는 엔트리를 찾았으므로 스트림인지 확인 (타입 = 2)
                if entry_type != 2 {
                    #[cfg(debug_assertions)]
                    eprintln!(
                        "Debug: Entry is not a stream (type: {}), continuing...",
                        entry_type
                    );
                    // Not a stream
                    continue;
                }

                // Read starting sector (offset 116, 4 bytes)
                // 시작 섹터 읽기 (오프셋 116, 4 바이트)
                let start_sector = u32::from_le_bytes([
                    data[entry_offset + 116],
                    data[entry_offset + 117],
                    data[entry_offset + 118],
                    data[entry_offset + 119],
                ]);

                // Read stream size (offset 120, 4 bytes for small streams, 8 bytes for large)
                // 스트림 크기 읽기 (오프셋 120, 작은 스트림은 4 바이트, 큰 스트림은 8 바이트)
                let stream_size = u32::from_le_bytes([
                    data[entry_offset + 120],
                    data[entry_offset + 121],
                    data[entry_offset + 122],
                    data[entry_offset + 123],
                ]) as usize;

                if stream_size == 0 {
                    return Ok(Vec::new());
                }

                // Read stream data
                // 스트림 데이터 읽기
                let stream_start = (start_sector as usize + 1) * (sector_size as usize);
                if stream_start + stream_size > data.len() {
                    return Err(HwpError::InvalidDirectorySector {
                        reason: format!(
                            "Stream data offset {} + size {} is beyond file size {}",
                            stream_start,
                            stream_size,
                            data.len()
                        ),
                    });
                }

                return Ok(data[stream_start..stream_start + stream_size].to_vec());
            }
        }

        Err(HwpError::stream_not_found(
            String::from_utf8_lossy(stream_name_bytes),
            "root (byte search)",
        ))
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
    ) -> Result<Vec<u8>, HwpError> {
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
                stream
                    .read_to_end(&mut buffer)
                    .map_err(|e| HwpError::stream_read_error(&path, e.to_string()))?;
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
                            .map_err(|e| HwpError::stream_read_error(&root_path, e.to_string()))?;
                        Ok(buffer)
                    }
                    Err(e) => Err(HwpError::stream_not_found(
                        format!("{}/{}", storage_name, stream_name),
                        format!("Tried '{}' and '{}', last error: {}", path, root_path, e),
                    )),
                }
            }
        }
    }
}
