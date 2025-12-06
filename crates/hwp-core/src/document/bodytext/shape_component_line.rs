/// ShapeComponentLine 구조체 / ShapeComponentLine structure
///
/// 스펙 문서 매핑: 표 92 - 선 개체 속성 / Spec mapping: Table 92 - Line shape component attributes
///
/// **구현 상태 / Implementation Status**
/// - 구현 완료 / Implementation complete
/// - 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_LINE 레코드가 없어 실제 파일로 테스트되지 않음
/// - Implementation complete, but not tested with actual file as test file (`noori.hwp`) does not contain SHAPE_COMPONENT_LINE records
use crate::error::HwpError;
use crate::types::{INT32, UINT16};
use serde::{Deserialize, Serialize};

/// 선 개체 / Line shape component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShapeComponentLine {
    /// 시작점 / Start point
    pub start_point: Point,
    /// 끝점 / End point
    pub end_point: Point,
    /// 속성 / Attributes
    /// 처음 생성 시 수직 또는 수평선일 때, 선의 방향이 언제나 오른쪽(위쪽)으로 잡힘으로 인한 현상 때문에, 방향을 바로 잡아주기 위한 플래그
    /// Flag to correct direction when initially created as vertical or horizontal line,
    /// as the direction is always set to right (up) due to a phenomenon
    pub flag: UINT16,
}

/// 점 좌표 / Point coordinates
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Point {
    /// X 좌표 / X coordinate
    pub x: INT32,
    /// Y 좌표 / Y coordinate
    pub y: INT32,
}

impl ShapeComponentLine {
    /// ShapeComponentLine을 바이트 배열에서 파싱합니다. / Parse ShapeComponentLine from byte array.
    ///
    /// # Arguments
    /// * `data` - ShapeComponentLine 데이터 (선 개체 속성 부분만) / ShapeComponentLine data (line shape component attributes only)
    ///
    /// # Returns
    /// 파싱된 ShapeComponentLine 구조체 / Parsed ShapeComponentLine structure
    ///
    /// # Note
    /// 스펙 문서 표 91에 따르면 SHAPE_COMPONENT_LINE은 다음 구조를 가집니다:
    /// - 개체 공통 속성(표 68 참조) - 가변 길이
    /// - 그리기 개체 공통 속성(표 81 참조) - 가변 길이
    /// - 선 개체 속성(표 92 참조) - 18바이트
    ///
    /// 레거시 코드(hwp.js)는 선 개체 속성 부분만 파싱하고 있습니다.
    /// According to spec Table 91, SHAPE_COMPONENT_LINE has the following structure:
    /// - Object common properties (Table 68) - variable length
    /// - Drawing object common properties (Table 81) - variable length
    /// - Line shape component attributes (Table 92) - 18 bytes
    ///
    /// Legacy code (hwp.js) only parses the line shape component attributes part.
    ///
    /// **테스트 상태 / Testing Status**
    /// 현재 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_LINE 레코드가 없어 실제 파일로 검증되지 않았습니다.
    /// 실제 HWP 파일에 SHAPE_COMPONENT_LINE 레코드가 있으면 자동으로 파싱됩니다.
    /// Current test file (`noori.hwp`) does not contain SHAPE_COMPONENT_LINE records, so it has not been verified with actual files.
    /// If an actual HWP file contains SHAPE_COMPONENT_LINE records, they will be automatically parsed.
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        // 표 92: 선 개체 속성은 18바이트 / Table 92: Line shape component attributes is 18 bytes
        // INT32(4) + INT32(4) + INT32(4) + INT32(4) + UINT16(2) = 18 bytes
        if data.len() < 18 {
            return Err(HwpError::insufficient_data("ShapeComponentLine", 18, data.len()));
        }

        let mut offset = 0;

        // 표 92: 시작점 X 좌표 (INT32, 4바이트) / Table 92: Start point X coordinate (INT32, 4 bytes)
        let start_x = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 92: 시작점 Y 좌표 (INT32, 4바이트) / Table 92: Start point Y coordinate (INT32, 4 bytes)
        let start_y = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 92: 끝점 X 좌표 (INT32, 4바이트) / Table 92: End point X coordinate (INT32, 4 bytes)
        let end_x = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 92: 끝점 Y 좌표 (INT32, 4바이트) / Table 92: End point Y coordinate (INT32, 4 bytes)
        let end_y = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 92: 속성 (UINT16, 2바이트) / Table 92: Attributes (UINT16, 2 bytes)
        let flag = UINT16::from_le_bytes([data[offset], data[offset + 1]]);

        Ok(ShapeComponentLine {
            start_point: Point {
                x: start_x,
                y: start_y,
            },
            end_point: Point { x: end_x, y: end_y },
            flag,
        })
    }
}
