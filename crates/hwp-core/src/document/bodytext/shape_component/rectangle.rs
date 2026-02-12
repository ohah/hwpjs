/// ShapeComponentRectangle 구조체 / ShapeComponentRectangle structure
///
/// 스펙 문서 매핑: 표 94 - 사각형 개체 속성 / Spec mapping: Table 94 - Rectangle shape component attributes
///
/// **구현 상태 / Implementation Status**
/// - 구현 완료 / Implementation complete
/// - 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_RECTANGLE 레코드가 없어 실제 파일로 테스트되지 않음
/// - Implementation complete, but not tested with actual file as test file (`noori.hwp`) does not contain SHAPE_COMPONENT_RECTANGLE records
use crate::error::HwpError;
use crate::types::INT32;
use serde::{Deserialize, Serialize};

/// 사각형 개체 / Rectangle shape component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShapeComponentRectangle {
    /// 사각형 모서리 곡률(%) / Rectangle corner curvature (%)
    /// 직각은 0, 둥근 모양은 20, 반원은 50, 그 외는 적당한 값을 % 단위로 사용한다.
    /// Right angle is 0, rounded shape is 20, semicircle is 50, others use appropriate values in %.
    pub corner_curvature: u8,
    /// 사각형의 좌표(x) / Rectangle coordinates (x)
    pub x_coordinates: RectangleCoordinates,
    /// 사각형의 좌표(y) / Rectangle coordinates (y)
    pub y_coordinates: RectangleCoordinates,
}

/// 사각형 좌표 / Rectangle coordinates
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct RectangleCoordinates {
    /// 상단 / Top
    pub top: INT32,
    /// 오른쪽 / Right
    pub right: INT32,
    /// 하단 / Bottom
    pub bottom: INT32,
    /// 왼쪽 / Left
    pub left: INT32,
}

impl ShapeComponentRectangle {
    /// ShapeComponentRectangle을 바이트 배열에서 파싱합니다. / Parse ShapeComponentRectangle from byte array.
    ///
    /// # Arguments
    /// * `data` - ShapeComponentRectangle 데이터 (사각형 개체 속성 부분만) / ShapeComponentRectangle data (rectangle shape component attributes only)
    ///
    /// # Returns
    /// 파싱된 ShapeComponentRectangle 구조체 / Parsed ShapeComponentRectangle structure
    ///
    /// # Note
    /// 스펙 문서 표 93에 따르면 SHAPE_COMPONENT_RECTANGLE은 다음 구조를 가집니다:
    /// - 개체 공통 속성(표 68 참조) - 가변 길이
    /// - 그리기 개체 공통 속성(표 81 참조) - 가변 길이
    /// - 사각형 개체 속성(표 94 참조) - 33바이트
    ///
    /// 레거시 코드(hwp.js)는 사각형 개체 속성 부분만 파싱하고 있습니다.
    /// According to spec Table 93, SHAPE_COMPONENT_RECTANGLE has the following structure:
    /// - Object common properties (Table 68) - variable length
    /// - Drawing object common properties (Table 81) - variable length
    /// - Rectangle shape component attributes (Table 94) - 33 bytes
    ///
    /// Legacy code (hwp.js) only parses the rectangle shape component attributes part.
    ///
    /// **테스트 상태 / Testing Status**
    /// 현재 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_RECTANGLE 레코드가 없어 실제 파일로 검증되지 않았습니다.
    /// 실제 HWP 파일에 SHAPE_COMPONENT_RECTANGLE 레코드가 있으면 자동으로 파싱됩니다.
    /// Current test file (`noori.hwp`) does not contain SHAPE_COMPONENT_RECTANGLE records, so it has not been verified with actual files.
    /// If an actual HWP file contains SHAPE_COMPONENT_RECTANGLE records, they will be automatically parsed.
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        // 표 94: 사각형 개체 속성은 33바이트 / Table 94: Rectangle shape component attributes is 33 bytes
        // BYTE(1) + INT32 array[4](16) + INT32 array[4](16) = 33 bytes
        if data.len() < 33 {
            return Err(HwpError::insufficient_data(
                "ShapeComponentRectangle",
                33,
                data.len(),
            ));
        }

        let mut offset = 0;

        // 표 94: 사각형 모서리 곡률(%) (BYTE, 1바이트) / Table 94: Rectangle corner curvature (%) (BYTE, 1 byte)
        let corner_curvature = data[offset];
        offset += 1;

        // 표 94: 사각형의 좌표(x) (INT32 array[4], 16바이트) / Table 94: Rectangle coordinates (x) (INT32 array[4], 16 bytes)
        let x_top = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;
        let x_right = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;
        let x_bottom = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;
        let x_left = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 94: 사각형의 좌표(y) (INT32 array[4], 16바이트) / Table 94: Rectangle coordinates (y) (INT32 array[4], 16 bytes)
        let y_top = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;
        let y_right = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;
        let y_bottom = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;
        let y_left = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);

        Ok(ShapeComponentRectangle {
            corner_curvature,
            x_coordinates: RectangleCoordinates {
                top: x_top,
                right: x_right,
                bottom: x_bottom,
                left: x_left,
            },
            y_coordinates: RectangleCoordinates {
                top: y_top,
                right: y_right,
                bottom: y_bottom,
                left: y_left,
            },
        })
    }
}
