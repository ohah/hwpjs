/// XmlTemplate 구조체 / XmlTemplate structure
///
/// 스펙 문서 매핑: 3.2.10 - XML 템플릿 / Spec mapping: 3.2.10 - XML Template
///
/// `XMLTemplate` 스토리지에는 XML Template 정보가 저장됩니다.
/// The `XMLTemplate` storage contains XML Template information.
use crate::cfb::CfbParser;
use crate::error::HwpError;
use crate::types::{decode_utf16le, DWORD};
use serde::{Deserialize, Serialize};

/// XML 템플릿 / XML Template
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct XmlTemplate {
    /// Schema 이름 (from _SchemaName stream) / Schema name (from _SchemaName stream)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schema_name: Option<String>,
    /// Schema (from Schema stream) / Schema (from Schema stream)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    /// Instance (from Instance stream) / Instance (from Instance stream)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instance: Option<String>,
}

impl XmlTemplate {
    /// XmlTemplate을 CFB 구조에서 파싱합니다. / Parse XmlTemplate from CFB structure.
    ///
    /// # Arguments
    /// * `cfb` - CompoundFile structure (mutable reference required) / CompoundFile 구조체 (가변 참조 필요)
    ///
    /// # Returns
    /// 파싱된 XmlTemplate 구조체 / Parsed XmlTemplate structure
    ///
    /// # Note
    /// 스펙 문서 3.2.10에 따르면 XMLTemplate 스토리지에는 다음 스트림이 포함됩니다:
    /// - _SchemaName: Schema 이름 (표 10)
    /// - Schema: Schema 문자열 (표 11)
    /// - Instance: Instance 문자열 (표 12)
    /// According to spec 3.2.10, XMLTemplate storage contains the following streams:
    /// - _SchemaName: Schema name (Table 10)
    /// - Schema: Schema string (Table 11)
    /// - Instance: Instance string (Table 12)
    pub fn parse(cfb: &mut cfb::CompoundFile<std::io::Cursor<&[u8]>>) -> Result<Self, HwpError> {
        let mut xml_template = XmlTemplate::default();

        // Parse _SchemaName stream
        // _SchemaName 스트림 파싱 / Parse _SchemaName stream
        // 스펙 문서 표 10: Schema 이름 정보
        // Spec Table 10: Schema name information
        if let Ok(schema_name_data) =
            CfbParser::read_nested_stream(cfb, "XMLTemplate", "_SchemaName")
        {
            match Self::parse_schema_name(&schema_name_data) {
                Ok(schema_name) => {
                    xml_template.schema_name = Some(schema_name);
                }
                Err(e) => {
                    #[cfg(debug_assertions)]
                    eprintln!("Warning: Failed to parse _SchemaName stream: {}", e);
                }
            }
        }

        // Parse Schema stream
        // Schema 스트림 파싱 / Parse Schema stream
        // 스펙 문서 표 11: Schema 길이 정보
        // Spec Table 11: Schema length information
        if let Ok(schema_data) = CfbParser::read_nested_stream(cfb, "XMLTemplate", "Schema") {
            match Self::parse_schema(&schema_data) {
                Ok(schema) => {
                    xml_template.schema = Some(schema);
                }
                Err(e) => {
                    #[cfg(debug_assertions)]
                    eprintln!("Warning: Failed to parse Schema stream: {}", e);
                }
            }
        }

        // Parse Instance stream
        // Instance 스트림 파싱 / Parse Instance stream
        // 스펙 문서 표 12: Instance 정보
        // Spec Table 12: Instance information
        if let Ok(instance_data) = CfbParser::read_nested_stream(cfb, "XMLTemplate", "Instance") {
            match Self::parse_instance(&instance_data) {
                Ok(instance) => {
                    xml_template.instance = Some(instance);
                }
                Err(e) => {
                    #[cfg(debug_assertions)]
                    eprintln!("Warning: Failed to parse Instance stream: {}", e);
                }
            }
        }

        Ok(xml_template)
    }

    /// Schema 이름 파싱 (표 10) / Parse schema name (Table 10)
    fn parse_schema_name(data: &[u8]) -> Result<String, HwpError> {
        if data.len() < 4 {
            return Err(HwpError::insufficient_data(
                "Schema name data",
                4,
                data.len(),
            ));
        }

        // DWORD Schema 이름 길이 (4 bytes) / Schema name length (4 bytes)
        let len = DWORD::from_le_bytes([data[0], data[1], data[2], data[3]]) as usize;

        // WCHAR array[len] Schema 이름 (2×len bytes) / Schema name (2×len bytes)
        if data.len() < 4 + (len * 2) {
            return Err(HwpError::InsufficientData {
                field: "Schema name data".to_string(),
                expected: 4 + (len * 2),
                actual: data.len(),
            });
        }

        if len > 0 {
            let schema_name_bytes = &data[4..4 + (len * 2)];
            decode_utf16le(schema_name_bytes).map_err(|e| HwpError::EncodingError {
                reason: format!("Failed to decode schema name: {}", e),
            })
        } else {
            Ok(String::new())
        }
    }

    /// Schema 파싱 (표 11) / Parse schema (Table 11)
    fn parse_schema(data: &[u8]) -> Result<String, HwpError> {
        if data.len() < 4 {
            return Err(HwpError::insufficient_data("Schema data", 4, data.len()));
        }

        // DWORD Schema 길이 (4 bytes) / Schema length (4 bytes)
        let len = DWORD::from_le_bytes([data[0], data[1], data[2], data[3]]) as usize;

        // WCHAR array[len] Schema (2×len bytes) / Schema (2×len bytes)
        if data.len() < 4 + (len * 2) {
            return Err(HwpError::InsufficientData {
                field: "Schema data".to_string(),
                expected: 4 + (len * 2),
                actual: data.len(),
            });
        }

        if len > 0 {
            let schema_bytes = &data[4..4 + (len * 2)];
            decode_utf16le(schema_bytes).map_err(|e| HwpError::EncodingError {
                reason: format!("Failed to decode schema: {}", e),
            })
        } else {
            Ok(String::new())
        }
    }

    /// Instance 파싱 (표 12) / Parse instance (Table 12)
    fn parse_instance(data: &[u8]) -> Result<String, HwpError> {
        if data.len() < 4 {
            return Err(HwpError::insufficient_data("Instance data", 4, data.len()));
        }

        // DWORD Instance 길이 (4 bytes) / Instance length (4 bytes)
        let len = DWORD::from_le_bytes([data[0], data[1], data[2], data[3]]) as usize;

        // WCHAR array[len] Instance (2×len bytes) / Instance (2×len bytes)
        if data.len() < 4 + (len * 2) {
            return Err(HwpError::InsufficientData {
                field: "Instance data".to_string(),
                expected: 4 + (len * 2),
                actual: data.len(),
            });
        }

        if len > 0 {
            let instance_bytes = &data[4..4 + (len * 2)];
            decode_utf16le(instance_bytes).map_err(|e| HwpError::EncodingError {
                reason: format!("Failed to decode instance: {}", e),
            })
        } else {
            Ok(String::new())
        }
    }
}
