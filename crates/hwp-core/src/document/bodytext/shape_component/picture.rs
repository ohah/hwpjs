/// ShapeComponentPicture 구조체 / ShapeComponentPicture structure
///
/// 스펙 문서 매핑: 표 107 - 그림 개체 속성 / Spec mapping: Table 107 - Picture shape component attributes
///
/// **구현 상태 / Implementation Status**
/// - 구현 완료 / Implementation complete
/// - 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_PICTURE 레코드가 없어 실제 파일로 테스트되지 않음
/// - Implementation complete, but not tested with actual file as test file (`noori.hwp`) does not contain SHAPE_COMPONENT_PICTURE records
use crate::error::HwpError;
use crate::types::{COLORREF, HWPUNIT16, INT32, INT8, UINT16, UINT32};
use serde::{Deserialize, Serialize};

/// 그림 개체 / Picture shape component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShapeComponentPicture {
    /// 테두리 색 / Border color
    pub border_color: COLORREF,
    /// 테두리 두께 / Border width
    pub border_width: INT32,
    /// 테두리 속성 / Border attributes (표 87 참조 / See Table 87)
    pub border_attributes: UINT32,
    /// 이미지의 테두리 사각형의 x 좌표 / X coordinates of image border rectangle (최초 그림 삽입 시 크기 / size at initial picture insertion)
    pub border_rectangle_x: RectangleCoordinates,
    /// 이미지의 테두리 사각형의 y 좌표 / Y coordinates of image border rectangle (최초 그림 삽입 시 크기 / size at initial picture insertion)
    pub border_rectangle_y: RectangleCoordinates,
    /// 자르기 한 후 사각형 / Cropped rectangle
    pub crop_rectangle: CropRectangle,
    /// 안쪽 여백 정보 / Inner padding information (표 77 참조 / See Table 77)
    pub padding: Padding,
    /// 그림 정보 / Picture information (표 32 참조 / See Table 32)
    pub picture_info: PictureInfo,
    /// 테두리 투명도 / Border opacity
    pub border_opacity: u8,
    /// 문서 내 각 개체에 대한 고유 아이디(instance ID) / Unique ID (instance ID) for each object in document
    pub instance_id: UINT32,
    /// 그림 효과 정보 / Picture effect information (표 108 참조 / See Table 108)
    /// 가변 길이이므로 raw 데이터로 저장 / Variable length, stored as raw data
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub effect_data: Vec<u8>,
}

/// 사각형 좌표 / Rectangle coordinates
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct RectangleCoordinates {
    /// 왼쪽 / Left
    pub left: INT32,
    /// 위쪽 / Top
    pub top: INT32,
    /// 오른쪽 / Right
    pub right: INT32,
    /// 아래쪽 / Bottom
    pub bottom: INT32,
}

/// 자르기 사각형 / Crop rectangle
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct CropRectangle {
    /// 왼쪽 / Left
    pub left: INT32,
    /// 위쪽 / Top
    pub top: INT32,
    /// 오른쪽 / Right
    pub right: INT32,
    /// 아래쪽 / Bottom
    pub bottom: INT32,
}

/// 안쪽 여백 정보 / Inner padding information
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Padding {
    /// 왼쪽 여백 / Left padding
    pub left: HWPUNIT16,
    /// 오른쪽 여백 / Right padding
    pub right: HWPUNIT16,
    /// 위쪽 여백 / Top padding
    pub top: HWPUNIT16,
    /// 아래쪽 여백 / Bottom padding
    pub bottom: HWPUNIT16,
}

/// 그림 정보 / Picture information
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct PictureInfo {
    /// 밝기 / Brightness
    pub brightness: INT8,
    /// 명암 / Contrast
    pub contrast: INT8,
    /// 그림 효과 / Picture effect
    /// - 0: REAL_PIC
    /// - 1: GRAY_SCALE
    /// - 2: BLACK_WHITE
    /// - 4: PATTERN8x8
    pub effect: u8,
    /// BinItem의 아이디 참조값 / BinItem ID reference
    pub bindata_id: UINT16,
}

impl ShapeComponentPicture {
    /// ShapeComponentPicture을 바이트 배열에서 파싱합니다. / Parse ShapeComponentPicture from byte array.
    ///
    /// # Arguments
    /// * `data` - ShapeComponentPicture 데이터 (그림 개체 속성 부분만) / ShapeComponentPicture data (picture shape component attributes only)
    ///
    /// # Returns
    /// 파싱된 ShapeComponentPicture 구조체 / Parsed ShapeComponentPicture structure
    ///
    /// # Note
    /// 스펙 문서 표 106에 따르면 SHAPE_COMPONENT_PICTURE은 다음 구조를 가집니다:
    /// - 개체 공통 속성(표 68 참조) - 가변 길이
    /// - 개체 요소 공통 속성(표 83 참조) - 가변 길이
    /// - 그림 개체 속성(표 107 참조) - 가변 길이 (78 + n 바이트)
    ///
    /// 레거시 코드(hwp.js)는 그림 개체 속성의 일부만 파싱하고 있습니다.
    /// According to spec Table 106, SHAPE_COMPONENT_PICTURE has the following structure:
    /// - Object common properties (Table 68) - variable length
    /// - Object element common properties (Table 83) - variable length
    /// - Picture shape component attributes (Table 107) - variable length (78 + n bytes)
    ///
    /// Legacy code (hwp.js) only parses part of picture shape component attributes.
    ///
    /// **테스트 상태 / Testing Status**
    /// 현재 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_PICTURE 레코드가 없어 실제 파일로 검증되지 않았습니다.
    /// 실제 HWP 파일에 SHAPE_COMPONENT_PICTURE 레코드가 있으면 자동으로 파싱됩니다.
    /// Current test file (`noori.hwp`) does not contain SHAPE_COMPONENT_PICTURE records, so it has not been verified with actual files.
    /// If an actual HWP file contains SHAPE_COMPONENT_PICTURE records, they will be automatically parsed.
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        let mut offset = 0;

        // 그림 개체 속성(표 107) 파싱 시작 / Start parsing picture shape component attributes (Table 107)
        // 최소 78바이트 필요 (고정 부분) / Need at least 78 bytes (fixed part)
        if data.len() < 78 {
            return Err(HwpError::insufficient_data("ShapeComponentPicture", 78, data.len()));
        }

        // 표 107: 테두리 색 (COLORREF, 4바이트) / Table 107: Border color (COLORREF, 4 bytes)
        let border_color_value = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        let border_color = COLORREF(border_color_value);
        offset += 4;

        // 표 107: 테두리 두께 (INT32, 4바이트) / Table 107: Border width (INT32, 4 bytes)
        let border_width = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 107: 테두리 속성 (UINT32, 4바이트) / Table 107: Border attributes (UINT32, 4 bytes)
        let border_attributes = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 107: 이미지의 테두리 사각형의 x 좌표 (INT32 array[4], 16바이트) / Table 107: X coordinates of image border rectangle (INT32 array[4], 16 bytes)
        let border_x_left = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;
        let border_x_top = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;
        let border_x_right = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;
        let border_x_bottom = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 107: 이미지의 테두리 사각형의 y 좌표 (INT32 array[4], 16바이트) / Table 107: Y coordinates of image border rectangle (INT32 array[4], 16 bytes)
        let border_y_left = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;
        let border_y_top = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;
        let border_y_right = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;
        let border_y_bottom = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 107: 자르기 한 후 사각형의 left (INT32, 4바이트) / Table 107: Cropped rectangle left (INT32, 4 bytes)
        let crop_left = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 107: 자르기 한 후 사각형의 top (INT32, 4바이트) / Table 107: Cropped rectangle top (INT32, 4 bytes)
        let crop_top = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 107: 자르기 한 후 사각형의 right (INT32, 4바이트) / Table 107: Cropped rectangle right (INT32, 4 bytes)
        let crop_right = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 107: 자르기 한 후 사각형의 bottom (INT32, 4바이트) / Table 107: Cropped rectangle bottom (INT32, 4 bytes)
        let crop_bottom = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 107: 안쪽 여백 정보 (표 77 참조, 8바이트) / Table 107: Inner padding information (Table 77, 8 bytes)
        let padding_left = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;
        let padding_right = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;
        let padding_top = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;
        let padding_bottom = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // 표 107: 그림 정보 (표 32 참조, 5바이트) / Table 107: Picture information (Table 32, 5 bytes)
        let brightness = data[offset] as i8;
        offset += 1;
        let contrast = data[offset] as i8;
        offset += 1;
        let effect = data[offset];
        offset += 1;
        let bindata_id = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // 표 107: 테두리 투명도 (BYTE, 1바이트) / Table 107: Border opacity (BYTE, 1 byte)
        let border_opacity = data[offset];
        offset += 1;

        // 표 107: 문서 내 각 개체에 대한 고유 아이디(instance ID) (UINT32, 4바이트) / Table 107: Instance ID (UINT32, 4 bytes)
        let instance_id = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 107: 그림 효과 정보 (표 108 참조, 가변 길이) / Table 107: Picture effect information (Table 108, variable length)
        let effect_data = if offset < data.len() {
            data[offset..].to_vec()
        } else {
            Vec::new()
        };

        Ok(ShapeComponentPicture {
            border_color,
            border_width,
            border_attributes,
            border_rectangle_x: RectangleCoordinates {
                left: border_x_left,
                top: border_x_top,
                right: border_x_right,
                bottom: border_x_bottom,
            },
            border_rectangle_y: RectangleCoordinates {
                left: border_y_left,
                top: border_y_top,
                right: border_y_right,
                bottom: border_y_bottom,
            },
            crop_rectangle: CropRectangle {
                left: crop_left,
                top: crop_top,
                right: crop_right,
                bottom: crop_bottom,
            },
            padding: Padding {
                left: padding_left,
                right: padding_right,
                top: padding_top,
                bottom: padding_bottom,
            },
            picture_info: PictureInfo {
                brightness,
                contrast,
                effect,
                bindata_id,
            },
            border_opacity,
            instance_id,
            effect_data,
        })
    }
}
