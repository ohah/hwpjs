/// CompatibleDocument 구조체 / CompatibleDocument structure
///
/// 스펙 문서 매핑: 표 54 - 호환 문서 / Spec mapping: Table 54 - Compatible document
use crate::error::HwpError;
use crate::types::UINT32;
use serde::{Deserialize, Serialize};

/// 호환 문서 (표 54) / Compatible document (Table 54)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompatibleDocument {
    /// 대상 프로그램 (표 55 참조) / Target program (see Table 55)
    pub target_program: TargetProgram,
}

/// 대상 프로그램 (표 55) / Target program (Table 55)
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TargetProgram {
    /// 한글 문서(현재 버전) / HWP document (current version)
    HwpCurrent,
    /// 한글 2007 호환 문서 / HWP 2007 compatible document
    Hwp2007,
    /// MS 워드 호환 문서 / MS Word compatible document
    MsWord,
}

impl CompatibleDocument {
    /// CompatibleDocument를 바이트 배열에서 파싱합니다. / Parse CompatibleDocument from byte array.
    ///
    /// # Arguments
    /// * `data` - CompatibleDocument 데이터 (4바이트) / CompatibleDocument data (4 bytes)
    ///
    /// # Returns
    /// 파싱된 CompatibleDocument 구조체 / Parsed CompatibleDocument structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 4 {
            return Err(HwpError::insufficient_data("CompatibleDocument", 4, data.len()));
        }

        let target_program_value = UINT32::from_le_bytes([data[0], data[1], data[2], data[3]]);
        let target_program = match target_program_value {
            0 => TargetProgram::HwpCurrent,
            1 => TargetProgram::Hwp2007,
            2 => TargetProgram::MsWord,
            _ => {
                return Err(HwpError::UnexpectedValue {
                    field: "CompatibleDocument target_program".to_string(),
                    expected: "0, 1, or 2".to_string(),
                    found: target_program_value.to_string(),
                });
            }
        };

        Ok(CompatibleDocument { target_program })
    }
}
