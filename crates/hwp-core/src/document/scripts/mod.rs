/// Scripts parsing module
///
/// This module handles parsing of HWP Scripts storage.
///
/// 스펙 문서 매핑: 3.2.9 - 스크립트 / Spec mapping: 3.2.9 - Scripts
mod script;
mod script_version;

pub use script::Script;
pub use script_version::ScriptVersion;

use crate::cfb::CfbParser;
use crate::error::HwpError;
use serde::{Deserialize, Serialize};

/// Scripts structure
/// 스크립트 구조
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Scripts {
    /// Script version (from JScriptVersion stream) / 스크립트 버전 (JScriptVersion 스트림)
    pub version: Option<ScriptVersion>,
    /// Default script (from DefaultJScript stream) / 기본 스크립트 (DefaultJScript 스트림)
    pub default_script: Option<Script>,
}

impl Scripts {
    /// Parse Scripts storage from CFB structure
    /// CFB 구조에서 Scripts 스토리지를 파싱합니다.
    ///
    /// # Arguments
    /// * `cfb` - CompoundFile structure (mutable reference required) / CompoundFile 구조체 (가변 참조 필요)
    ///
    /// # Returns
    /// Parsed Scripts structure / 파싱된 Scripts 구조체
    ///
    /// # Note
    /// 스펙 문서 3.2.9에 따르면 Scripts 스토리지에는 다음 스트림이 포함됩니다:
    /// - JScriptVersion: 스크립트 버전 (표 8)
    /// - DefaultJScript: 스크립트 내용 (표 9)
    /// According to spec 3.2.9, Scripts storage contains the following streams:
    /// - JScriptVersion: Script version (Table 8)
    /// - DefaultJScript: Script content (Table 9)
    pub fn parse(cfb: &mut cfb::CompoundFile<std::io::Cursor<&[u8]>>) -> Result<Self, HwpError> {
        let mut scripts = Scripts::default();

        // Parse JScriptVersion stream
        // JScriptVersion 스트림 파싱 / Parse JScriptVersion stream
        // 스펙 문서 표 8: 스크립트 버전은 8바이트 (DWORD HIGH + DWORD LOW)
        // Spec Table 8: Script version is 8 bytes (DWORD HIGH + DWORD LOW)
        if let Ok(version_data) = CfbParser::read_nested_stream(cfb, "Scripts", "JScriptVersion") {
            match ScriptVersion::parse(&version_data) {
                Ok(version) => {
                    scripts.version = Some(version);
                }
                Err(e) => {
                    #[cfg(debug_assertions)]
                    eprintln!("Warning: Failed to parse JScriptVersion stream: {}", e);
                }
            }
        }

        // Parse DefaultJScript stream
        // DefaultJScript 스트림 파싱 / Parse DefaultJScript stream
        // 스펙 문서 표 9: 스크립트 내용은 가변 길이
        // Spec Table 9: Script content is variable length
        if let Ok(script_data) = CfbParser::read_nested_stream(cfb, "Scripts", "DefaultJScript") {
            match Script::parse(&script_data) {
                Ok(default_script) => {
                    scripts.default_script = Some(default_script);
                }
                Err(e) => {
                    #[cfg(debug_assertions)]
                    eprintln!("Warning: Failed to parse DefaultJScript stream: {}", e);
                }
            }
        }

        Ok(scripts)
    }
}
