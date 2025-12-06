/// ShapeComponentArc 구조체 / ShapeComponentArc structure
///
/// 스펙 문서 매핑: 표 101 - 호 개체 속성 / Spec mapping: Table 101 - Arc shape component attributes
///
/// **구현 상태 / Implementation Status**
/// - 구현 완료 / Implementation complete
/// - 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_ARC 레코드가 없어 실제 파일로 테스트되지 않음
/// - Implementation complete, but not tested with actual file as test file (`noori.hwp`) does not contain SHAPE_COMPONENT_ARC records
use crate::error::HwpError;
use crate::types::{INT32, UINT32};
use serde::{Deserialize, Serialize};

/// 호 개체 / Arc shape component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShapeComponentArc {
    /// 속성 / Attributes (표 97 참조 / See Table 97)
    pub attributes: EllipseArcAttributes,
    /// 타원의 중심 좌표 / Ellipse center coordinates
    pub ellipse_center: Point,
    /// 제1축 좌표 / First axis coordinates
    pub axis1: Point,
    /// 제2축 좌표 / Second axis coordinates
    pub axis2: Point,
}

/// 타원/호 개체 속성 / Ellipse/Arc shape component attributes
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct EllipseArcAttributes {
    /// 호(ARC)로 바뀌었을 때, interval을 다시 계산해야 할 필요가 있는지 여부 / Whether interval needs to be recalculated when changed to ARC
    /// (interval - 원 위에 존재하는 두 점 사이의 거리) / (interval - distance between two points on the circle)
    pub needs_interval_recalculation: bool,
    /// 호(ARC)로 바뀌었는지 여부 / Whether it has been changed to ARC
    pub is_arc: bool,
    /// 호(ARC)의 종류 / ARC type
    pub arc_type: u8,
}

/// 점 좌표 / Point coordinates
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Point {
    /// X 좌표 / X coordinate
    pub x: INT32,
    /// Y 좌표 / Y coordinate
    pub y: INT32,
}

impl ShapeComponentArc {
    /// ShapeComponentArc을 바이트 배열에서 파싱합니다. / Parse ShapeComponentArc from byte array.
    ///
    /// # Arguments
    /// * `data` - ShapeComponentArc 데이터 (호 개체 속성 부분만) / ShapeComponentArc data (arc shape component attributes only)
    ///
    /// # Returns
    /// 파싱된 ShapeComponentArc 구조체 / Parsed ShapeComponentArc structure
    ///
    /// # Note
    /// 스펙 문서 표 100에 따르면 SHAPE_COMPONENT_ARC은 다음 구조를 가집니다:
    /// - 개체 공통 속성(표 68 참조) - 가변 길이
    /// - 그리기 개체 공통 속성(표 81 참조) - 가변 길이
    /// - 호 개체 속성(표 101 참조) - 28바이트
    ///
    /// 레거시 코드(hwp.js)는 호 개체 속성 부분만 파싱하고 있습니다.
    /// According to spec Table 100, SHAPE_COMPONENT_ARC has the following structure:
    /// - Object common properties (Table 68) - variable length
    /// - Drawing object common properties (Table 81) - variable length
    /// - Arc shape component attributes (Table 101) - 28 bytes
    ///
    /// Legacy code (hwp.js) only parses the arc shape component attributes part.
    ///
    /// **테스트 상태 / Testing Status**
    /// 현재 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_ARC 레코드가 없어 실제 파일로 검증되지 않았습니다.
    /// 실제 HWP 파일에 SHAPE_COMPONENT_ARC 레코드가 있으면 자동으로 파싱됩니다.
    /// Current test file (`noori.hwp`) does not contain SHAPE_COMPONENT_ARC records, so it has not been verified with actual files.
    /// If an actual HWP file contains SHAPE_COMPONENT_ARC records, they will be automatically parsed.
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        // 표 101: 호 개체 속성은 28바이트 / Table 101: Arc shape component attributes is 28 bytes
        // UINT32(4) + INT32(4) * 6 = 28 bytes
        if data.len() < 28 {
            return Err(HwpError::insufficient_data("ShapeComponentArc", 28, data.len()));
        }

        let mut offset = 0;

        // 표 101: 속성 (UINT32, 4바이트) / Table 101: Attributes (UINT32, 4 bytes)
        let attr_value = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 97: 속성 비트 필드 파싱 / Table 97: Parse attribute bit fields
        let needs_interval_recalculation = (attr_value & 0x01) != 0; // bit 0
        let is_arc = (attr_value & 0x02) != 0; // bit 1
        let arc_type = ((attr_value >> 2) & 0xFF) as u8; // bit 2-9

        // 표 101: 타원의 중심 좌표 X 값 (INT32, 4바이트) / Table 101: Ellipse center X coordinate (INT32, 4 bytes)
        let center_x = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 101: 타원의 중심 좌표 Y 값 (INT32, 4바이트) / Table 101: Ellipse center Y coordinate (INT32, 4 bytes)
        let center_y = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 101: 제1축 X 좌표 값 (INT32, 4바이트) / Table 101: First axis X coordinate (INT32, 4 bytes)
        let axis1_x = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 101: 제1축 Y 좌표 값 (INT32, 4바이트) / Table 101: First axis Y coordinate (INT32, 4 bytes)
        let axis1_y = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 101: 제2축 X 좌표 값 (INT32, 4바이트) / Table 101: Second axis X coordinate (INT32, 4 bytes)
        let axis2_x = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 101: 제2축 Y 좌표 값 (INT32, 4바이트) / Table 101: Second axis Y coordinate (INT32, 4 bytes)
        let axis2_y = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);

        Ok(ShapeComponentArc {
            attributes: EllipseArcAttributes {
                needs_interval_recalculation,
                is_arc,
                arc_type,
            },
            ellipse_center: Point {
                x: center_x,
                y: center_y,
            },
            axis1: Point {
                x: axis1_x,
                y: axis1_y,
            },
            axis2: Point {
                x: axis2_x,
                y: axis2_y,
            },
        })
    }
}
