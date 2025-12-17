/// ShapeComponentPolygon 구조체 / ShapeComponentPolygon structure
///
/// 스펙 문서 매핑: 표 99 - 다각형 개체 속성 / Spec mapping: Table 99 - Polygon shape component attributes
///
/// **구현 상태 / Implementation Status**
/// - 구현 완료 / Implementation complete
/// - 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_POLYGON 레코드가 없어 실제 파일로 테스트되지 않음
/// - Implementation complete, but not tested with actual file as test file (`noori.hwp`) does not contain SHAPE_COMPONENT_POLYGON records
use crate::error::HwpError;
use crate::types::{INT16, INT32};
use serde::{Deserialize, Serialize};

/// 다각형 개체 / Polygon shape component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShapeComponentPolygon {
    /// 점의 개수 / Count of points
    pub point_count: INT16,
    /// X 좌표 배열 / X coordinates array
    pub x_coordinates: Vec<INT32>,
    /// Y 좌표 배열 / Y coordinates array
    pub y_coordinates: Vec<INT32>,
}

impl ShapeComponentPolygon {
    /// ShapeComponentPolygon을 바이트 배열에서 파싱합니다. / Parse ShapeComponentPolygon from byte array.
    ///
    /// # Arguments
    /// * `data` - ShapeComponentPolygon 데이터 (다각형 개체 속성 부분만) / ShapeComponentPolygon data (polygon shape component attributes only)
    ///
    /// # Returns
    /// 파싱된 ShapeComponentPolygon 구조체 / Parsed ShapeComponentPolygon structure
    ///
    /// # Note
    /// 스펙 문서 표 98에 따르면 SHAPE_COMPONENT_POLYGON은 다음 구조를 가집니다:
    /// - 개체 공통 속성(표 68 참조) - 가변 길이
    /// - 그리기 개체 공통 속성(표 81 참조) - 가변 길이
    /// - 다각형 개체 속성(표 99 참조) - 가변 길이 (2 + 2(4×cnt) 바이트)
    ///
    /// 레거시 코드(hwp.js)는 다각형 개체 속성 부분만 파싱하고 있습니다.
    /// According to spec Table 98, SHAPE_COMPONENT_POLYGON has the following structure:
    /// - Object common properties (Table 68) - variable length
    /// - Drawing object common properties (Table 81) - variable length
    /// - Polygon shape component attributes (Table 99) - variable length (2 + 2(4×cnt) bytes)
    ///
    /// Legacy code (hwp.js) only parses the polygon shape component attributes part.
    ///
    /// **테스트 상태 / Testing Status**
    /// 현재 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_POLYGON 레코드가 없어 실제 파일로 검증되지 않았습니다.
    /// 실제 HWP 파일에 SHAPE_COMPONENT_POLYGON 레코드가 있으면 자동으로 파싱됩니다.
    /// Current test file (`noori.hwp`) does not contain SHAPE_COMPONENT_POLYGON records, so it has not been verified with actual files.
    /// If an actual HWP file contains SHAPE_COMPONENT_POLYGON records, they will be automatically parsed.
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        // 최소 2바이트 필요 (점의 개수) / Need at least 2 bytes (point count)
        if data.len() < 2 {
            return Err(HwpError::insufficient_data("ShapeComponentPolygon", 2, data.len()));
        }

        let mut offset = 0;

        // 표 99: 점의 개수 (INT16, 2바이트) / Table 99: Count of points (INT16, 2 bytes)
        let point_count = INT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // 점의 개수가 음수이거나 0이면 오류 / If point count is negative or zero, error
        if point_count <= 0 {
            return Err(HwpError::UnexpectedValue {
                field: "ShapeComponentPolygon point_count".to_string(),
                expected: "positive number".to_string(),
                found: point_count.to_string(),
            });
        }

        let point_count_usize = point_count as usize;

        // 필요한 바이트 수 계산 / Calculate required bytes
        // INT16(2) + INT32 array[cnt](4×cnt) + INT32 array[cnt](4×cnt) = 2 + 8×cnt
        let required_bytes = 2 + 8 * point_count_usize;
        if data.len() < required_bytes {
            return Err(HwpError::InsufficientData {
                field: format!("ShapeComponentPolygon (point_count={})", point_count_usize),
                expected: required_bytes,
                actual: data.len(),
            });
        }

        // 표 99: X 좌표 배열 (INT32 array[cnt], 4×cnt 바이트) / Table 99: X coordinates array (INT32 array[cnt], 4×cnt bytes)
        let mut x_coordinates = Vec::with_capacity(point_count_usize);
        for _ in 0..point_count_usize {
            let x = INT32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]);
            x_coordinates.push(x);
            offset += 4;
        }

        // 표 99: Y 좌표 배열 (INT32 array[cnt], 4×cnt 바이트) / Table 99: Y coordinates array (INT32 array[cnt], 4×cnt bytes)
        let mut y_coordinates = Vec::with_capacity(point_count_usize);
        for _ in 0..point_count_usize {
            let y = INT32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]);
            y_coordinates.push(y);
            offset += 4;
        }

        Ok(ShapeComponentPolygon {
            point_count,
            x_coordinates,
            y_coordinates,
        })
    }
}
