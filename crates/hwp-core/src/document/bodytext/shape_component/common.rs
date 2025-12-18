/// ShapeComponent 구조체 / ShapeComponent structure
///
/// 스펙 문서 매핑: 표 82, 83 - 개체 요소 속성 / Spec mapping: Table 82, 83 - Shape component attributes
use crate::error::HwpError;
use crate::types::{HWPUNIT16, INT32, UINT16, UINT32};
use serde::{Deserialize, Serialize};

/// 개체 요소 / Shape component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShapeComponent {
    /// 개체 컨트롤 ID / Object control ID
    pub object_control_id: String,
    /// 개체 컨트롤 ID 2 (GenShapeObject일 경우 id가 두 번 기록됨) / Object control ID 2 (for GenShapeObject, ID is recorded twice)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub object_control_id2: Option<String>,
    /// 개체가 속한 그룹 내에서의 offset / Offset within group
    pub group_offset: GroupOffset,
    /// 몇 번이나 그룹 되었는지 / Number of times grouped
    pub group_count: UINT16,
    /// 개체 요소의 local file version / Local file version
    pub local_version: UINT16,
    /// 개체 생성 시 초기 폭 / Initial width
    pub initial_width: UINT32,
    /// 개체 생성 시 초기 높이 / Initial height
    pub initial_height: UINT32,
    /// 개체의 현재 폭 / Current width
    pub width: UINT32,
    /// 개체의 현재 높이 / Current height
    pub height: UINT32,
    /// 속성 / Attributes
    pub attributes: ShapeComponentAttributes,
    /// 회전각 / Rotation angle
    pub rotation_angle: HWPUNIT16,
    /// 회전 중심 좌표 / Rotation center coordinates
    pub rotation_center: RotationCenter,
    /// Rendering 정보 / Rendering information
    pub rendering: RenderingInfo,
}

/// 개체가 속한 그룹 내에서의 offset / Offset within group
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct GroupOffset {
    /// X offset
    pub x: INT32,
    /// Y offset
    pub y: INT32,
}

/// 개체 요소 속성 / Shape component attributes
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ShapeComponentAttributes {
    /// 수평 뒤집기 / Horizontal flip
    HorizontalFlip,
    /// 수직 뒤집기 / Vertical flip
    VerticalFlip,
}

/// 회전 중심 좌표 / Rotation center coordinates
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct RotationCenter {
    /// X 좌표(개체 좌표계) / X coordinate (object coordinate system)
    pub x: INT32,
    /// Y 좌표(개체 좌표계) / Y coordinate (object coordinate system)
    pub y: INT32,
}

/// Rendering 정보 / Rendering information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderingInfo {
    /// scale matrix와 rotation matrix쌍의 개수 / Number of scale matrix and rotation matrix pairs
    pub matrix_count: UINT16,
    /// translation matrix / Translation matrix
    pub translation_matrix: Matrix,
    /// scale matrix/rotation matrix sequence / Scale matrix/rotation matrix sequence
    pub matrix_sequence: Vec<MatrixPair>,
}

/// Matrix 정보 / Matrix information
/// 3X3 matrix의 원소 (마지막 줄은 항상 0, 0, 1이므로 저장되지 않음)
/// Elements of 3X3 matrix (last row is always 0, 0, 1 so not stored)
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Matrix {
    /// 3X2 matrix의 원소 (6개 double 값, 48바이트) / Elements of 3X2 matrix (6 double values, 48 bytes)
    pub elements: [f64; 6],
}

/// Matrix 쌍 / Matrix pair
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct MatrixPair {
    /// Scale matrix
    pub scale: Matrix,
    /// Rotation matrix
    pub rotation: Matrix,
}

impl ShapeComponent {
    /// ShapeComponent를 바이트 배열에서 파싱합니다. / Parse ShapeComponent from byte array.
    ///
    /// # Arguments
    /// * `data` - ShapeComponent 데이터 / ShapeComponent data
    ///
    /// # Returns
    /// 파싱된 ShapeComponent 구조체 / Parsed ShapeComponent structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 4 {
            return Err(HwpError::insufficient_data("ShapeComponent", 4, data.len()));
        }

        let mut offset = 0;

        // 표 82: 개체 컨트롤 ID (UINT32, 4바이트) / Table 82: Object control ID (UINT32, 4 bytes)
        let ctrl_id_value1 = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // ctrl_id를 문자열로 변환 (4바이트 ASCII) / Convert ctrl_id to string (4-byte ASCII)
        let object_control_id = String::from_utf8_lossy(&data[offset - 4..offset])
            .trim_end_matches('\0')
            .trim_end_matches(' ')
            .to_string();

        // 스펙 문서 표 82 주석: "GenShapeObject일 경우 id가 두 번 기록됨"
        // 하지만 실제 파일에서는 모든 SHAPE_COMPONENT에서 두 번째 ID가 존재함
        // 레거시 코드도 항상 두 번째 ID를 읽고 있음
        // Spec Table 82 comment: "For GenShapeObject, ID is recorded twice"
        // However, in actual files, second ID exists in all SHAPE_COMPONENT records
        // Legacy code also always reads the second ID
        let object_control_id2 = if data.len() >= offset + 4 {
            // 두 번째 ID 읽기 / Read second ID
            let ctrl_id_value2 = UINT32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]);
            offset += 4;
            Some(
                String::from_utf8_lossy(&data[offset - 4..offset])
                    .trim_end_matches('\0')
                    .trim_end_matches(' ')
                    .to_string(),
            )
        } else {
            None
        };

        // 표 83: 개체 요소 속성 / Table 83: Shape component attributes
        if data.len() < offset + 42 {
            return Err(HwpError::InsufficientData {
                field: format!("ShapeComponent attributes at offset {}", offset),
                expected: offset + 42,
                actual: data.len(),
            });
        }

        // INT32: 개체가 속한 그룹 내에서의 X offset / INT32: X offset within group
        let group_x = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // INT32: 개체가 속한 그룹 내에서의 Y offset / INT32: Y offset within group
        let group_y = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // WORD: 몇 번이나 그룹 되었는지 / WORD: Number of times grouped
        let group_count = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // WORD: 개체 요소의 local file version / WORD: Local file version
        let local_version = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // UINT32: 개체 생성 시 초기 폭 / UINT32: Initial width
        let initial_width = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // UINT32: 개체 생성 시 초기 높이 / UINT32: Initial height
        let initial_height = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // UINT32: 개체의 현재 폭 / UINT32: Current width
        let width = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // UINT32: 개체의 현재 높이 / UINT32: Current height
        let height = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // UINT32: 속성 / UINT32: Attributes
        // 0: horz flip, 1: vert flip
        let attribute_value = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;
        let attributes = if attribute_value == 0 {
            ShapeComponentAttributes::HorizontalFlip
        } else {
            ShapeComponentAttributes::VerticalFlip
        };

        // HWPUNIT16: 회전각 / HWPUNIT16: Rotation angle
        let rotation_angle = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // INT32: 회전 중심의 x 좌표(개체 좌표계) / INT32: Rotation center x coordinate (object coordinate system)
        let rotation_center_x = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // INT32: 회전 중심의 y 좌표(개체 좌표계) / INT32: Rotation center y coordinate (object coordinate system)
        let rotation_center_y = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 84: Rendering 정보 / Table 84: Rendering information
        if data.len() < offset + 2 {
            return Err(HwpError::insufficient_data(
                "ShapeComponent rendering info",
                2,
                data.len() - offset,
            ));
        }

        // WORD: scale matrix와 rotation matrix쌍의 개수 / WORD: Number of scale matrix and rotation matrix pairs
        let matrix_count = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // BYTE stream (48바이트): translation matrix / BYTE stream (48 bytes): Translation matrix
        if data.len() < offset + 48 {
            return Err(HwpError::InsufficientData {
                field: format!("ShapeComponent translation matrix at offset {}", offset),
                expected: offset + 48,
                actual: data.len(),
            });
        }
        let translation_matrix =
            parse_matrix(&data[offset..offset + 48]).map_err(|e| HwpError::from(e))?;
        offset += 48;

        // BYTE stream (cnt×48×2): scale matrix/rotation matrix sequence
        let matrix_sequence_size = matrix_count as usize * 48 * 2;
        if data.len() < offset + matrix_sequence_size {
            return Err(HwpError::InsufficientData {
                field: format!("ShapeComponent matrix sequence at offset {}", offset),
                expected: offset + matrix_sequence_size,
                actual: data.len(),
            });
        }

        let mut matrix_sequence = Vec::new();
        for i in 0..matrix_count as usize {
            let seq_offset = offset + (i * 48 * 2);
            let scale_matrix =
                parse_matrix(&data[seq_offset..seq_offset + 48]).map_err(|e| HwpError::from(e))?;
            let rotation_matrix = parse_matrix(&data[seq_offset + 48..seq_offset + 96])
                .map_err(|e| HwpError::from(e))?;
            matrix_sequence.push(MatrixPair {
                scale: scale_matrix,
                rotation: rotation_matrix,
            });
        }
        let _ = offset + matrix_sequence_size; // offset은 더 이상 사용되지 않음 / offset is no longer used

        Ok(ShapeComponent {
            object_control_id,
            object_control_id2,
            group_offset: GroupOffset {
                x: group_x,
                y: group_y,
            },
            group_count,
            local_version,
            initial_width,
            initial_height,
            width,
            height,
            attributes,
            rotation_angle,
            rotation_center: RotationCenter {
                x: rotation_center_x,
                y: rotation_center_y,
            },
            rendering: RenderingInfo {
                matrix_count,
                translation_matrix,
                matrix_sequence,
            },
        })
    }
}

/// Matrix 파싱 (표 85) / Parse matrix (Table 85)
/// double array[6] (48바이트) - 3X2 matrix의 원소 / double array[6] (48 bytes) - Elements of 3X2 matrix
fn parse_matrix(data: &[u8]) -> Result<Matrix, HwpError> {
    if data.len() < 48 {
        return Err(HwpError::insufficient_data("Matrix", 48, data.len()));
    }

    let mut elements = [0.0; 6];
    for (i, element) in elements.iter_mut().enumerate() {
        let offset = i * 8;
        *element = f64::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
            data[offset + 4],
            data[offset + 5],
            data[offset + 6],
            data[offset + 7],
        ]);
    }

    Ok(Matrix { elements })
}
