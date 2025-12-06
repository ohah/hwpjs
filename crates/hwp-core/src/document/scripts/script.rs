/// Script 구조체 / Script structure
///
/// 스펙 문서 매핑: 표 9 - 스크립트 / Spec mapping: Table 9 - Script
use crate::error::HwpError;
use crate::types::{decode_utf16le, DWORD};
use serde::{Deserialize, Serialize};

/// 스크립트 / Script
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Script {
    /// 스크립트 헤더 / Script header
    pub header: String,
    /// 스크립트 소스 / Script source
    pub source: String,
    /// 스크립트 Pre 소스 / Script pre source
    pub pre_source: String,
    /// 스크립트 Post 소스 / Script post source
    pub post_source: String,
}

impl Script {
    /// Script를 바이트 배열에서 파싱합니다. / Parse Script from byte array.
    ///
    /// # Arguments
    /// * `data` - DefaultJScript 스트림의 원시 바이트 데이터 / Raw byte data of DefaultJScript stream
    ///
    /// # Returns
    /// 파싱된 Script 구조체 / Parsed Script structure
    ///
    /// # Note
    /// 스펙 문서 표 9에 따르면 스크립트는 다음 구조를 가집니다:
    /// - DWORD (4 bytes): 스크립트 헤더 길이 (len1)
    /// - WCHAR array[len1] (2×len1 bytes): 스크립트 헤더
    /// - DWORD (4 bytes): 스크립트 소스 길이 (len2)
    /// - WCHAR array[len2] (2×len2 bytes): 스크립트 소스
    /// - DWORD (4 bytes): 스크립트 Pre 소스 길이 (len3)
    /// - WCHAR array[len3] (2×len3 bytes): 스크립트 Pre 소스
    /// - DWORD (4 bytes): 스크립트 Post 소스 길이 (len4)
    /// - WCHAR array[len4] (2×len4 bytes): 스크립트 Post 소스
    /// - DWORD (4 bytes): 스크립트 end flag (-1)
    /// According to spec Table 9, script has the following structure:
    /// - DWORD (4 bytes): Script header length (len1)
    /// - WCHAR array[len1] (2×len1 bytes): Script header
    /// - DWORD (4 bytes): Script source length (len2)
    /// - WCHAR array[len2] (2×len2 bytes): Script source
    /// - DWORD (4 bytes): Script pre source length (len3)
    /// - WCHAR array[len3] (2×len3 bytes): Script pre source
    /// - DWORD (4 bytes): Script post source length (len4)
    /// - WCHAR array[len4] (2×len4 bytes): Script post source
    /// - DWORD (4 bytes): Script end flag (-1)
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        let mut offset = 0;

        // 최소 20바이트 필요 (4개의 DWORD 길이 필드 + end flag) / Need at least 20 bytes (4 DWORD length fields + end flag)
        if data.len() < 20 {
            return Err(HwpError::insufficient_data("Script", 20, data.len()));
        }

        // DWORD 스크립트 헤더 길이 (4 bytes) / Script header length (4 bytes)
        let header_len = DWORD::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]) as usize;
        offset += 4;

        // WCHAR array[len1] 스크립트 헤더 (2×len1 bytes) / Script header (2×len1 bytes)
        let header = if header_len > 0 {
            let header_bytes_len = header_len.saturating_mul(2);
            if offset + header_bytes_len <= data.len() {
                let header_bytes = &data[offset..offset + header_bytes_len];
                decode_utf16le(header_bytes).unwrap_or_default()
            } else {
                String::new()
            }
        } else {
            String::new()
        };
        offset = offset.saturating_add(header_len.saturating_mul(2));

        // DWORD 스크립트 소스 길이 (4 bytes) / Script source length (4 bytes)
        if offset + 4 > data.len() {
            return Err(HwpError::insufficient_data(
                "Script source length",
                4,
                data.len().saturating_sub(offset),
            ));
        }
        let source_len = DWORD::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]) as usize;
        offset += 4;

        // WCHAR array[len2] 스크립트 소스 (2×len2 bytes) / Script source (2×len2 bytes)
        let source = if source_len > 0 {
            let source_bytes_len = source_len.saturating_mul(2);
            if offset + source_bytes_len <= data.len() {
                let source_bytes = &data[offset..offset + source_bytes_len];
                decode_utf16le(source_bytes).unwrap_or_default()
            } else {
                String::new()
            }
        } else {
            String::new()
        };
        offset = offset.saturating_add(source_len.saturating_mul(2));

        // DWORD 스크립트 Pre 소스 길이 (4 bytes) / Script pre source length (4 bytes)
        if offset + 4 > data.len() {
            return Err(HwpError::insufficient_data(
                "Script pre source length",
                4,
                data.len().saturating_sub(offset),
            ));
        }
        let pre_source_len = DWORD::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]) as usize;
        offset += 4;

        // WCHAR array[len3] 스크립트 Pre 소스 (2×len3 bytes) / Script pre source (2×len3 bytes)
        let pre_source = if pre_source_len > 0 {
            let pre_source_bytes_len = pre_source_len.saturating_mul(2);
            if offset + pre_source_bytes_len <= data.len() {
                let pre_source_bytes = &data[offset..offset + pre_source_bytes_len];
                decode_utf16le(pre_source_bytes).unwrap_or_default()
            } else {
                String::new()
            }
        } else {
            String::new()
        };
        offset = offset.saturating_add(pre_source_len.saturating_mul(2));

        // DWORD 스크립트 Post 소스 길이 (4 bytes) / Script post source length (4 bytes)
        if offset + 4 > data.len() {
            return Err(HwpError::insufficient_data(
                "Script post source length",
                4,
                data.len().saturating_sub(offset),
            ));
        }
        let post_source_len = DWORD::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]) as usize;
        offset += 4;

        // WCHAR array[len4] 스크립트 Post 소스 (2×len4 bytes) / Script post source (2×len4 bytes)
        let post_source = if post_source_len > 0 {
            let post_source_bytes_len = post_source_len.saturating_mul(2);
            if offset + post_source_bytes_len <= data.len() {
                let post_source_bytes = &data[offset..offset + post_source_bytes_len];
                decode_utf16le(post_source_bytes).unwrap_or_default()
            } else {
                String::new()
            }
        } else {
            String::new()
        };
        offset = offset.saturating_add(post_source_len.saturating_mul(2));

        // DWORD 스크립트 end flag (-1) (4 bytes) / Script end flag (-1) (4 bytes)
        // 검증 목적으로 읽지만 사용하지 않음 / Read for validation but not used
        if offset + 4 <= data.len() {
            let end_flag = DWORD::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]);
            if end_flag != 0xFFFFFFFF {
                #[cfg(debug_assertions)]
                eprintln!(
                    "Warning: Script end flag is not -1 (0xFFFFFFFF), got 0x{:08X}",
                    end_flag
                );
            }
        }

        Ok(Script {
            header,
            source,
            pre_source,
            post_source,
        })
    }
}
