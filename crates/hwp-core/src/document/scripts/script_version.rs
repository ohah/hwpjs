/// ScriptVersion 구조체 / ScriptVersion structure
///
/// 스펙 문서 매핑: 표 8 - 스크립트 버전 / Spec mapping: Table 8 - Script version
use crate::error::HwpError;
use crate::types::DWORD;
use serde::{Deserialize, Serialize};

/// 스크립트 버전 / Script version
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptVersion {
    /// 스크립트 버전 HIGH / Script version HIGH
    pub high: DWORD,
    /// 스크립트 버전 LOW / Script version LOW
    pub low: DWORD,
}

impl ScriptVersion {
    /// ScriptVersion을 바이트 배열에서 파싱합니다. / Parse ScriptVersion from byte array.
    ///
    /// # Arguments
    /// * `data` - JScriptVersion 스트림의 원시 바이트 데이터 / Raw byte data of JScriptVersion stream
    ///
    /// # Returns
    /// 파싱된 ScriptVersion 구조체 / Parsed ScriptVersion structure
    ///
    /// # Note
    /// 스펙 문서 표 8에 따르면 스크립트 버전은 8바이트입니다:
    /// - DWORD (4 bytes): 스크립트 버전 HIGH
    /// - DWORD (4 bytes): 스크립트 버전 LOW
    /// According to spec Table 8, script version is 8 bytes:
    /// - DWORD (4 bytes): Script version HIGH
    /// - DWORD (4 bytes): Script version LOW
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 8 {
            return Err(HwpError::insufficient_data("ScriptVersion", 8, data.len()));
        }

        // DWORD 스크립트 버전 HIGH (4 bytes) / Script version HIGH (4 bytes)
        let high = DWORD::from_le_bytes([data[0], data[1], data[2], data[3]]);

        // DWORD 스크립트 버전 LOW (4 bytes) / Script version LOW (4 bytes)
        let low = DWORD::from_le_bytes([data[4], data[5], data[6], data[7]]);

        Ok(ScriptVersion { high, low })
    }
}
