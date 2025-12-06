/// FileHeader parsing module
///
/// This module handles parsing of HWP FileHeader structure.
/// According to HWP 5.0 spec, FileHeader is 256 bytes.
///
/// 스펙 문서 매핑: 표 2 - 파일 인식 정보 (FileHeader 스트림)
use crate::error::HwpError;
use crate::types::{BYTE, DWORD};
use serde::{Deserialize, Serialize};

mod constants;
mod serialize;

use serialize::{serialize_document_flags, serialize_license_flags, serialize_version};

/// FileHeader structure for HWP 5.0
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileHeader {
    /// Signature: "HWP Document File" (32 bytes)
    pub signature: String,
    /// File version (4 bytes, DWORD)
    /// Format: 0xMMnnPPrr (e.g., 0x05000300 = 5.0.3.0)
    #[serde(serialize_with = "serialize_version")]
    pub version: DWORD,
    /// Document flags (4 bytes, DWORD)
    /// Bit flags: compression, encryption, distribution, script, DRM, electronic signature, etc.
    #[serde(serialize_with = "serialize_document_flags")]
    pub document_flags: DWORD,
    /// License flags (4 bytes, DWORD)
    /// Bit flags: CCL, KOGL license, copy restriction, etc.
    #[serde(serialize_with = "serialize_license_flags")]
    pub license_flags: DWORD,
    /// Encryption version (4 bytes, DWORD)
    pub encrypt_version: DWORD,
    /// KOGL license country (1 byte, BYTE)
    pub kogl_country: BYTE,
    /// Reserved (207 bytes) - excluded from JSON serialization
    #[serde(skip_serializing)]
    pub reserved: Vec<u8>,
}

impl FileHeader {
    /// Parse FileHeader from byte array
    ///
    /// # Arguments
    /// * `data` - 256-byte FileHeader data
    ///
    /// # Returns
    /// Parsed FileHeader structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 256 {
            return Err(HwpError::insufficient_data("FileHeader", 256, data.len()));
        }

        // Parse signature (32 bytes)
        let signature_bytes = &data[0..32];
        let signature = String::from_utf8_lossy(signature_bytes)
            .trim_end_matches('\0')
            .to_string();

        // Validate signature
        if signature != "HWP Document File" {
            return Err(HwpError::InvalidSignature { found: signature });
        }

        // Parse version (4 bytes, DWORD, little-endian)
        let version = DWORD::from_le_bytes([data[32], data[33], data[34], data[35]]);

        // Parse document_flags (4 bytes, DWORD, little-endian)
        let document_flags = DWORD::from_le_bytes([data[36], data[37], data[38], data[39]]);

        // Parse license_flags (4 bytes, DWORD, little-endian)
        let license_flags = DWORD::from_le_bytes([data[40], data[41], data[42], data[43]]);

        // Parse encrypt_version (4 bytes, DWORD, little-endian)
        let encrypt_version = DWORD::from_le_bytes([data[44], data[45], data[46], data[47]]);

        // Parse kogl_country (1 byte, BYTE)
        let kogl_country = data[48];

        // Parse reserved (207 bytes)
        let reserved = data[49..256].to_vec();

        Ok(FileHeader {
            signature,
            version,
            document_flags,
            license_flags,
            encrypt_version,
            kogl_country,
            reserved,
        })
    }

    /// Check if file is compressed
    pub fn is_compressed(&self) -> bool {
        (self.document_flags & 0x01) != 0
    }

    /// Check if file is encrypted
    pub fn is_encrypted(&self) -> bool {
        (self.document_flags & 0x02) != 0
    }

    /// Check if XMLTemplate storage exists
    /// XMLTemplate 스토리지 존재 여부 확인
    pub fn has_xml_template(&self) -> bool {
        (self.document_flags & 0x20) != 0 // Bit 5
    }

    /// Convert FileHeader to JSON string
    pub fn to_json(&self) -> Result<String, HwpError> {
        serde_json::to_string_pretty(self).map_err(HwpError::from)
    }

    /// Get version as string (e.g., "5.0.3.0")
    pub fn version_string(&self) -> String {
        let major = (self.version >> 24) & 0xFF;
        let minor = (self.version >> 16) & 0xFF;
        let patch = (self.version >> 8) & 0xFF;
        let revision = self.version & 0xFF;
        format!("{}.{}.{}.{}", major, minor, patch, revision)
    }
}
