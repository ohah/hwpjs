/// ShapeComponentEllipse 구조체 / ShapeComponentEllipse structure
///
/// 스펙 문서 매핑: 표 96 - 타원 개체 속성 / Spec mapping: Table 96 - Ellipse shape component attributes
///
/// **구현 상태 / Implementation Status**
/// - 구현 완료 / Implementation complete
/// - 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_ELLIPSE 레코드가 없어 실제 파일로 테스트되지 않음
/// - Implementation complete, but not tested with actual file as test file (`noori.hwp`) does not contain SHAPE_COMPONENT_ELLIPSE records
use crate::error::HwpError;
use crate::types::{INT32, UINT32};
use serde::{Deserialize, Serialize};

/// 타원 개체 / Ellipse shape component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShapeComponentEllipse {
    /// 속성 / Attributes (표 97 참조 / See Table 97)
    pub attributes: EllipseArcAttributes,
    /// 중심 좌표 / Center coordinates
    pub center: Point,
    /// 제1축 좌표 / First axis coordinates
    pub axis1: Point,
    /// 제2축 좌표 / Second axis coordinates
    pub axis2: Point,
    /// 시작 위치 / Start position
    pub start_pos: Point,
    /// 끝 위치 / End position
    pub end_pos: Point,
    /// 시작 위치 2 / Start position 2
    pub start_pos2: Point,
    /// 곡선 간격 (호일 때만 유효) / Interval of curve (effective only when it is an arc)
    pub interval: INT32,
    /// 끝 위치 2 / End position 2
    pub end_pos2: Point,
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

impl ShapeComponentEllipse {
    /// ShapeComponentEllipse을 바이트 배열에서 파싱합니다. / Parse ShapeComponentEllipse from byte array.
    ///
    /// # Arguments
    /// * `data` - ShapeComponentEllipse 데이터 (타원 개체 속성 부분만) / ShapeComponentEllipse data (ellipse shape component attributes only)
    ///
    /// # Returns
    /// 파싱된 ShapeComponentEllipse 구조체 / Parsed ShapeComponentEllipse structure
    ///
    /// # Note
    /// 스펙 문서 표 95에 따르면 SHAPE_COMPONENT_ELLIPSE은 다음 구조를 가집니다:
    /// - 개체 공통 속성(표 68 참조) - 가변 길이
    /// - 그리기 개체 공통 속성(표 81 참조) - 가변 길이
    /// - 타원 개체 속성(표 96 참조) - 60바이트
    ///
    /// 레거시 코드(hwp.js)는 타원 개체 속성 부분만 파싱하고 있습니다.
    /// According to spec Table 95, SHAPE_COMPONENT_ELLIPSE has the following structure:
    /// - Object common properties (Table 68) - variable length
    /// - Drawing object common properties (Table 81) - variable length
    /// - Ellipse shape component attributes (Table 96) - 60 bytes
    ///
    /// Legacy code (hwp.js) only parses the ellipse shape component attributes part.
    ///
    /// **테스트 상태 / Testing Status**
    /// 현재 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_ELLIPSE 레코드가 없어 실제 파일로 검증되지 않았습니다.
    /// 실제 HWP 파일에 SHAPE_COMPONENT_ELLIPSE 레코드가 있으면 자동으로 파싱됩니다.
    /// Current test file (`noori.hwp`) does not contain SHAPE_COMPONENT_ELLIPSE records, so it has not been verified with actual files.
    /// If an actual HWP file contains SHAPE_COMPONENT_ELLIPSE records, they will be automatically parsed.
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        // 표 96: 타원 개체 속성은 60바이트 / Table 96: Ellipse shape component attributes is 60 bytes
        // UINT32(4) + INT32(4) * 14 = 60 bytes
        if data.len() < 60 {
            return Err(HwpError::insufficient_data(
                "ShapeComponentEllipse",
                60,
                data.len(),
            ));
        }

        let mut offset = 0;

        // 표 96: 속성 (UINT32, 4바이트) / Table 96: Attributes (UINT32, 4 bytes)
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

        // 표 96: 중심 좌표의 X 값 (INT32, 4바이트) / Table 96: Center X coordinate (INT32, 4 bytes)
        let center_x = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 96: 중심 좌표의 Y 값 (INT32, 4바이트) / Table 96: Center Y coordinate (INT32, 4 bytes)
        let center_y = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 96: 제1축 X 좌표 값 (INT32, 4바이트) / Table 96: First axis X coordinate (INT32, 4 bytes)
        let axis1_x = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 96: 제1축 Y 좌표 값 (INT32, 4바이트) / Table 96: First axis Y coordinate (INT32, 4 bytes)
        let axis1_y = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 96: 제2축 X 좌표 값 (INT32, 4바이트) / Table 96: Second axis X coordinate (INT32, 4 bytes)
        let axis2_x = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 96: 제2축 Y 좌표 값 (INT32, 4바이트) / Table 96: Second axis Y coordinate (INT32, 4 bytes)
        let axis2_y = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 96: start pos x (INT32, 4바이트) / Table 96: Start position X (INT32, 4 bytes)
        let start_pos_x = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 96: start pos y (INT32, 4바이트) / Table 96: Start position Y (INT32, 4 bytes)
        let start_pos_y = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 96: end pos x (INT32, 4바이트) / Table 96: End position X (INT32, 4 bytes)
        let end_pos_x = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 96: end pos y (INT32, 4바이트) / Table 96: End position Y (INT32, 4 bytes)
        let end_pos_y = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 96: start pos x2 (INT32, 4바이트) / Table 96: Start position X2 (INT32, 4 bytes)
        let start_pos2_x = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 96: interval of curve (INT32, 4바이트) / Table 96: Interval of curve (INT32, 4 bytes)
        let interval = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 96: start pos y2 (INT32, 4바이트) / Table 96: Start position Y2 (INT32, 4 bytes)
        let start_pos2_y = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 96: end pos x2 (INT32, 4바이트) / Table 96: End position X2 (INT32, 4 bytes)
        let end_pos_x2 = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 96: end pos y2 (INT32, 4바이트) / Table 96: End position Y2 (INT32, 4 bytes)
        let end_pos_y2 = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);

        Ok(ShapeComponentEllipse {
            attributes: EllipseArcAttributes {
                needs_interval_recalculation,
                is_arc,
                arc_type,
            },
            center: Point {
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
            start_pos: Point {
                x: start_pos_x,
                y: start_pos_y,
            },
            end_pos: Point {
                x: end_pos_x,
                y: end_pos_y,
            },
            start_pos2: Point {
                x: start_pos2_x,
                y: start_pos2_y,
            },
            interval,
            end_pos2: Point {
                x: end_pos_x2,
                y: end_pos_y2,
            },
        })
    }
}
