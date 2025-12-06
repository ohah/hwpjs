/// EqEdit 구조체 / EqEdit structure
///
/// 스펙 문서 매핑: 표 105 - 수식 개체 속성 / Spec mapping: Table 105 - Equation editor object attributes
///
/// **구현 상태 / Implementation Status**
/// - 구현 완료 / Implementation complete
/// - 테스트 파일(`noori.hwp`)에 EQEDIT 레코드가 없어 실제 파일로 테스트되지 않음
/// - Implementation complete, but not tested with actual file as test file (`noori.hwp`) does not contain EQEDIT records
use crate::error::HwpError;
use crate::types::{decode_utf16le, COLORREF, HWPUNIT, INT16, UINT16, UINT32};
use serde::{Deserialize, Serialize};

/// 수식 개체 / Equation editor object
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EqEdit {
    /// 속성. 스크립트가 차지하는 범위. 첫 비트가 켜져 있으면 줄 단위, 꺼져 있으면 글자 단위.
    /// Attribute. Range occupied by script. If first bit is set, line unit; otherwise, character unit.
    pub attribute: UINT32,
    /// 스크립트 길이 / Script length
    pub script_length: UINT16,
    /// 한글 수식 스크립트 / HWP equation script (EQN script compatible)
    pub script: String,
    /// 수식 글자 크기 / Equation character size
    pub character_size: HWPUNIT,
    /// 글자 색상 / Character color
    pub character_color: COLORREF,
    /// base line / Base line
    pub base_line: INT16,
    /// 수식 버전 정보 / Equation version information
    pub version_info: String,
    /// 수식 폰트 이름 / Equation font name
    pub font_name: String,
}

impl EqEdit {
    /// EqEdit을 바이트 배열에서 파싱합니다. / Parse EqEdit from byte array.
    ///
    /// # Arguments
    /// * `data` - EqEdit 데이터 (수식 개체 속성 부분만) / EqEdit data (equation editor object attributes only)
    ///
    /// # Returns
    /// 파싱된 EqEdit 구조체 / Parsed EqEdit structure
    ///
    /// # Note
    /// 스펙 문서 표 104에 따르면 EQEDIT는 다음 구조를 가집니다:
    /// - 개체 공통 속성(표 68 참조) - 가변 길이
    /// - 수식 개체 속성(표 105 참조) - 가변 길이 (16 + 6×len 바이트)
    ///
    /// 레거시 코드(hwp.js)는 수식 개체 속성의 일부만 파싱하고 있습니다.
    /// According to spec Table 104, EQEDIT has the following structure:
    /// - Object common properties (Table 68) - variable length
    /// - Equation editor object attributes (Table 105) - variable length (16 + 6×len bytes)
    ///
    /// Legacy code (hwp.js) only parses part of equation editor object attributes.
    ///
    /// **테스트 상태 / Testing Status**
    /// 현재 테스트 파일(`noori.hwp`)에 EQEDIT 레코드가 없어 실제 파일로 검증되지 않았습니다.
    /// 실제 HWP 파일에 EQEDIT 레코드가 있으면 자동으로 파싱됩니다.
    /// Current test file (`noori.hwp`) does not contain EQEDIT records, so it has not been verified with actual files.
    /// If an actual HWP file contains EQEDIT records, they will be automatically parsed.
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        // 최소 16바이트 필요 (len=0일 때) / Need at least 16 bytes (when len=0)
        if data.len() < 16 {
            return Err(HwpError::insufficient_data("EqEdit", 16, data.len()));
        }

        let mut offset = 0;

        // 표 105: 속성 (UINT32, 4바이트) / Table 105: Attribute (UINT32, 4 bytes)
        let attribute = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 105: 스크립트 길이 (WORD, 2바이트) / Table 105: Script length (WORD, 2 bytes)
        let script_length = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        let script_length_usize = script_length as usize;

        // 필요한 바이트 수 계산 / Calculate required bytes
        // UINT32(4) + WORD(2) + WCHAR array[len](2×len) + HWPUNIT(4) + COLORREF(4) + INT16(2) + WCHAR array[len](2×len) + WCHAR array[len](2×len)
        // = 16 + 6×len
        let required_bytes = 16 + 6 * script_length_usize;
        if data.len() < required_bytes {
            return Err(HwpError::InsufficientData {
                field: format!("EqEdit (script_length={})", script_length_usize),
                expected: required_bytes,
                actual: data.len(),
            });
        }

        // 표 105: 한글 수식 스크립트 (WCHAR array[len], 2×len 바이트) / Table 105: HWP equation script (WCHAR array[len], 2×len bytes)
        let script_bytes = &data[offset..offset + 2 * script_length_usize];
        let script = decode_utf16le(script_bytes)
            .map_err(|e| HwpError::EncodingError {
                reason: format!("Failed to decode EqEdit script: {}", e),
            })?;
        offset += 2 * script_length_usize;

        // 표 105: 수식 글자 크기 (HWPUNIT, 4바이트) / Table 105: Equation character size (HWPUNIT, 4 bytes)
        let character_size_value = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        let character_size = HWPUNIT::from(character_size_value);
        offset += 4;

        // 표 105: 글자 색상 (COLORREF, 4바이트) / Table 105: Character color (COLORREF, 4 bytes)
        let color_value = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        let character_color = COLORREF(color_value);
        offset += 4;

        // 표 105: base line (INT16, 2바이트) / Table 105: Base line (INT16, 2 bytes)
        let base_line = INT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // 표 105: 수식 버전 정보 (WCHAR array[len], 2×len 바이트) / Table 105: Equation version information (WCHAR array[len], 2×len bytes)
        let version_bytes = &data[offset..offset + 2 * script_length_usize];
        let version_info = decode_utf16le(version_bytes)
            .map_err(|e| HwpError::EncodingError {
                reason: format!("Failed to decode EqEdit version_info: {}", e),
            })?;
        offset += 2 * script_length_usize;

        // 표 105: 수식 폰트 이름 (WCHAR array[len], 2×len 바이트) / Table 105: Equation font name (WCHAR array[len], 2×len bytes)
        let font_bytes = &data[offset..offset + 2 * script_length_usize];
        let font_name = decode_utf16le(font_bytes)
            .map_err(|e| HwpError::EncodingError {
                reason: format!("Failed to decode EqEdit font_name: {}", e),
            })?;
        offset += 2 * script_length_usize;

        Ok(EqEdit {
            attribute,
            script_length,
            script,
            character_size,
            character_color,
            base_line,
            version_info,
            font_name,
        })
    }
}
