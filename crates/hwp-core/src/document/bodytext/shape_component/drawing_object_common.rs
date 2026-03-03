/// 그리기 개체 공통 속성 (표 81) / Drawing Object Common Properties (Table 81)
///
/// SHAPE_COMPONENT 레코드 내에서 ShapeComponent(표 82/83) 뒤에 위치하며,
/// 선 정보, 채우기 정보를 포함합니다.
/// Located after ShapeComponent (Table 82/83) within SHAPE_COMPONENT record,
/// contains line info and fill info.
use crate::document::docinfo::border_fill::{FillInfo, GradientFill, SolidFill};
use crate::error::HwpError;
use crate::types::{COLORREF, INT16, INT32, UINT, UINT32};
use serde::{Deserialize, Serialize};

/// 그리기 개체 공통 속성 / Drawing object common properties
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrawingObjectCommon {
    /// 선 정보 / Line information
    pub line_info: LineInfo,
    /// 채우기 정보 / Fill information
    pub fill_info: FillInfo,
}

/// 선 정보 / Line information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LineInfo {
    /// 선 색상 / Line color
    pub color: COLORREF,
    /// 선 굵기 (HWP 단위) / Line thickness (HWP units)
    pub thickness: INT32,
    /// 선 종류 / Line type
    pub line_type: LineType,
    /// 선 끝 모양 / Line end cap shape
    pub line_end_shape: u8,
    /// 시작 화살표 모양 / Start arrow shape
    pub start_arrow_shape: u8,
    /// 끝 화살표 모양 / End arrow shape
    pub end_arrow_shape: u8,
    /// 시작 화살표 크기 / Start arrow size
    pub start_arrow_size: u8,
    /// 끝 화살표 크기 / End arrow size
    pub end_arrow_size: u8,
    /// 시작 화살표 채우기 / Fill start arrow
    pub fill_start_arrow: bool,
    /// 끝 화살표 채우기 / Fill end arrow
    pub fill_end_arrow: bool,
    /// 외곽선 스타일 / Outline style
    pub outline_style: u8,
}

/// 선 종류 / Line type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LineType {
    /// 선 없음 / No line
    None,
    /// 실선 / Solid
    Solid,
    /// 긴 점선 / Dash
    Dash,
    /// 점선 / Dot
    Dot,
    /// 일점쇄선 / Dash-Dot
    DashDot,
    /// 이점쇄선 / Dash-Dot-Dot
    DashDotDot,
    /// 긴 긴 점선 / Long Dash
    LongDash,
    /// 원점선 / Circle Dot
    CircleDot,
    /// 이중선 / Double
    Double,
    /// 가는선-굵은선 / Thin-Bold
    ThinBold,
    /// 굵은선-가는선 / Bold-Thin
    BoldThin,
    /// 가는선-굵은선-가는선 / Thin-Bold-Thin
    ThinBoldThin,
}

impl LineType {
    fn from_u32(value: u32) -> Self {
        match value {
            0 => LineType::None,
            1 => LineType::Solid,
            2 => LineType::Dash,
            3 => LineType::Dot,
            4 => LineType::DashDot,
            5 => LineType::DashDotDot,
            6 => LineType::LongDash,
            7 => LineType::CircleDot,
            8 => LineType::Double,
            9 => LineType::ThinBold,
            10 => LineType::BoldThin,
            11 => LineType::ThinBoldThin,
            _ => LineType::Solid,
        }
    }
}

impl DrawingObjectCommon {
    /// Table 81 데이터를 파싱합니다. / Parse Table 81 data.
    ///
    /// # Arguments
    /// * `data` - ShapeComponent 이후의 나머지 바이트 / Remaining bytes after ShapeComponent
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 13 {
            return Err(HwpError::insufficient_data(
                "DrawingObjectCommon",
                13,
                data.len(),
            ));
        }

        let mut offset = 0;

        // COLORREF: 선 색상 / Line color
        let line_color = COLORREF(u32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]));
        offset += 4;

        // INT32: 선 굵기 / Line thickness
        let line_thickness = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // UINT32: 선 속성 (비트 플래그) / Line property (bit flags)
        let line_property = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        let line_type = LineType::from_u32(line_property & 0x3F);
        let line_end_shape = ((line_property >> 6) & 0x0F) as u8;
        let start_arrow_shape = ((line_property >> 10) & 0x3F) as u8;
        let end_arrow_shape = ((line_property >> 16) & 0x3F) as u8;
        let start_arrow_size = ((line_property >> 22) & 0x0F) as u8;
        let end_arrow_size = ((line_property >> 26) & 0x0F) as u8;
        let fill_start_arrow = (line_property >> 30) & 1 != 0;
        let fill_end_arrow = (line_property >> 31) & 1 != 0;

        // BYTE: 외곽선 스타일 / Outline style
        let outline_style = data[offset];
        offset += 1;

        let line_info = LineInfo {
            color: line_color,
            thickness: line_thickness,
            line_type,
            line_end_shape,
            start_arrow_shape,
            end_arrow_shape,
            start_arrow_size,
            end_arrow_size,
            fill_start_arrow,
            fill_end_arrow,
            outline_style,
        };

        // 채우기 정보 파싱 (BorderFill::parse_fill_info와 동일 포맷)
        // Parse fill info (same format as BorderFill::parse_fill_info)
        let fill_info = if offset < data.len() {
            Self::parse_fill_info(&data[offset..])?
        } else {
            FillInfo::None
        };

        Ok(DrawingObjectCommon {
            line_info,
            fill_info,
        })
    }

    /// 채우기 정보 파싱 / Parse fill information
    ///
    /// DrawingObjectCommon의 gradient는 BorderFill(표 28)과 다른 포맷 사용:
    /// gradient_type=BYTE(1), angle/center/step/color_count=INT32(4) each
    fn parse_fill_info(data: &[u8]) -> Result<FillInfo, HwpError> {
        if data.len() < 4 {
            return Ok(FillInfo::None);
        }

        let mut offset = 0;

        let fill_type_value = UINT::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        if fill_type_value == 0 {
            return Ok(FillInfo::None);
        }

        let is_solid = (fill_type_value & 0x00000001) != 0;
        let is_gradient = (fill_type_value & 0x00000004) != 0;

        if is_solid {
            if offset + 12 > data.len() {
                return Ok(FillInfo::None);
            }
            let background_color = COLORREF(u32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]));
            offset += 4;
            let pattern_color = COLORREF(u32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]));
            offset += 4;
            let pattern_type = INT32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]);
            return Ok(FillInfo::Solid(SolidFill {
                background_color,
                pattern_color,
                pattern_type,
            }));
        }

        if is_gradient {
            // DrawingObjectCommon gradient format:
            // BYTE: gradient_type (1)
            // INT32: angle (4)
            // INT32: center_x (4)
            // INT32: center_y (4)
            // INT32: step (4)
            // INT32: color_count (4)
            // COLORREF[]: colors (4 × color_count)
            if offset + 21 > data.len() {
                return Ok(FillInfo::None);
            }

            let gradient_type = data[offset] as INT16;
            offset += 1;

            let angle = INT32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]) as INT16;
            offset += 4;

            let horizontal_center = INT32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]) as INT16;
            offset += 4;

            let vertical_center = INT32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]) as INT16;
            offset += 4;

            let spread = INT32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]) as INT16;
            offset += 4;

            let color_count_i32 = INT32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]);
            offset += 4;
            let color_count = color_count_i32 as INT16;

            let needed = 4 * color_count as usize;
            if offset + needed > data.len() {
                return Ok(FillInfo::None);
            }
            let mut colors = Vec::new();
            for _ in 0..color_count {
                colors.push(COLORREF(u32::from_le_bytes([
                    data[offset],
                    data[offset + 1],
                    data[offset + 2],
                    data[offset + 3],
                ])));
                offset += 4;
            }

            return Ok(FillInfo::Gradient(GradientFill {
                gradient_type,
                angle,
                horizontal_center,
                vertical_center,
                spread,
                color_count,
                positions: None,
                colors,
            }));
        }

        // Image fill or unknown — fall back to None
        Ok(FillInfo::None)
    }
}
