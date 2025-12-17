/// Border/Fill 구조체 / Border/Fill structure
///
/// 스펙 문서 매핑: 표 23 - 테두리/배경 속성 / Spec mapping: Table 23 - Border/fill properties
/// Tag ID: HWPTAG_BORDER_FILL
use crate::error::HwpError;
use crate::types::{BYTE, COLORREF, INT16, INT32, UINT, UINT16, UINT8};
use serde::{Deserialize, Serialize};

/// 테두리선 정보 / Border line information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BorderLine {
    /// 테두리선 종류 (표 25) / Border line type (Table 25)
    pub line_type: UINT8,
    /// 테두리선 굵기 (표 26) / Border line width (Table 26)
    pub width: UINT8,
    /// 테두리선 색상 / Border line color
    pub color: COLORREF,
}

/// 대각선 정보 / Diagonal line information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagonalLine {
    /// 대각선 종류 (표 27) / Diagonal line type (Table 27)
    pub line_type: UINT8,
    /// 대각선 굵기 / Diagonal line thickness
    pub thickness: UINT8,
    /// 대각선 색상 / Diagonal line color
    pub color: COLORREF,
}

/// 채우기 종류 / Fill type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum FillType {
    /// 채우기 없음 / No fill
    None = 0x00000000,
    /// 단색 채우기 / Solid fill
    Solid = 0x00000001,
    /// 이미지 채우기 / Image fill
    Image = 0x00000002,
    /// 그러데이션 채우기 / Gradient fill
    Gradient = 0x00000004,
}

/// 단색 채우기 정보 / Solid fill information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolidFill {
    /// 배경색 / Background color
    pub background_color: COLORREF,
    /// 무늬색 / Pattern color
    pub pattern_color: COLORREF,
    /// 무늬 종류 (표 29) / Pattern type (Table 29)
    pub pattern_type: INT32,
}

/// 그러데이션 채우기 정보 / Gradient fill information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GradientFill {
    /// 그러데이션 유형 (표 30) / Gradient type (Table 30)
    pub gradient_type: INT16,
    /// 그러데이션의 기울임(시작 각) / Gradient angle (start angle)
    pub angle: INT16,
    /// 그러데이션의 가로 중심(중심 X 좌표) / Gradient horizontal center (center X coordinate)
    pub horizontal_center: INT16,
    /// 그러데이션의 세로 중심(중심 Y 좌표) / Gradient vertical center (center Y coordinate)
    pub vertical_center: INT16,
    /// 그러데이션 번짐 정도(0-100) / Gradient spread (0-100)
    pub spread: INT16,
    /// 그러데이션의 색 수 / Number of gradient colors
    pub color_count: INT16,
    /// 색상이 바뀌는 곳의 위치 (color_count > 2일 경우에만) / Color change positions (only if color_count > 2)
    pub positions: Option<Vec<INT32>>,
    /// 색상 배열 / Color array
    pub colors: Vec<COLORREF>,
}

/// 이미지 채우기 정보 / Image fill information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageFill {
    /// 이미지 채우기 유형 (표 31) / Image fill type (Table 31)
    pub image_fill_type: BYTE,
    /// 그림 정보 (표 32) / Image information (Table 32)
    pub image_info: Vec<u8>, // 5 bytes
    /// 그러데이션 번짐정도의 중심 (0..100) / Gradient spread center (0..100)
    pub gradient_spread_center: Option<BYTE>,
    /// 추가 채우기 속성 길이 / Additional fill attribute length
    pub additional_attributes_length: Option<UINT>,
    /// 추가 채우기 속성 / Additional fill attributes
    pub additional_attributes: Option<Vec<u8>>,
}

/// 채우기 정보 / Fill information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
#[allow(dead_code)]
pub enum FillInfo {
    /// 채우기 없음 / No fill
    None,
    /// 단색 채우기 / Solid fill
    Solid(SolidFill),
    /// 이미지 채우기 / Image fill
    Image(ImageFill),
    /// 그러데이션 채우기 / Gradient fill
    Gradient(GradientFill),
}

/// 테두리/배경 속성 / Border/fill properties
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BorderFill {
    /// 속성 (표 24) / Attributes (Table 24)
    pub attributes: BorderFillAttributes,
    /// 4방향 테두리선 정보 / 4-direction border line information
    pub borders: [BorderLine; 4], // [Left, Right, Top, Bottom]
    /// 대각선 정보 / Diagonal line information
    pub diagonal: DiagonalLine,
    /// 채우기 정보 / Fill information
    pub fill: FillInfo,
}

/// 테두리/배경 속성 비트 플래그 / Border/fill attribute bit flags
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BorderFillAttributes {
    /// 3D 효과의 유무 / 3D effect presence
    pub has_3d_effect: bool,
    /// 그림자 효과의 유무 / Shadow effect presence
    pub has_shadow: bool,
    /// Slash 대각선 모양 / Slash diagonal shape
    pub slash_shape: u8, // bits 2-4
    /// BackSlash 대각선 모양 / BackSlash diagonal shape
    pub backslash_shape: u8, // bits 5-7
    /// Slash 대각선 꺽은선 / Slash diagonal broken line
    pub slash_broken_line: u8, // bits 8-9
    /// BackSlash 대각선 꺽은선 / BackSlash diagonal broken line
    pub backslash_broken_line: bool, // bit 10
    /// Slash 대각선 모양 180도 회전 여부 / Slash diagonal 180 degree rotation
    pub slash_rotated_180: bool, // bit 11
    /// BackSlash 대각선 모양 180도 회전 여부 / BackSlash diagonal 180 degree rotation
    pub backslash_rotated_180: bool, // bit 12
    /// 중심선 유무 / Center line presence
    pub has_center_line: bool, // bit 13
}

impl BorderFill {
    /// BorderFill을 바이트 배열에서 파싱합니다. / Parse BorderFill from byte array.
    ///
    /// # Arguments
    /// * `data` - BorderFill 레코드 데이터 / BorderFill record data
    ///
    /// # Returns
    /// 파싱된 BorderFill 구조체 / Parsed BorderFill structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 32 {
            return Err(HwpError::insufficient_data("BorderFill", 32, data.len()));
        }

        let mut offset = 0;

        // UINT16 속성 (표 24) / UINT16 attributes (Table 24)
        let attr_value = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        let attributes = BorderFillAttributes {
            has_3d_effect: (attr_value & 0x0001) != 0,
            has_shadow: (attr_value & 0x0002) != 0,
            slash_shape: ((attr_value >> 2) & 0x07) as u8,
            backslash_shape: ((attr_value >> 5) & 0x07) as u8,
            slash_broken_line: ((attr_value >> 8) & 0x03) as u8,
            backslash_broken_line: (attr_value & 0x0400) != 0,
            slash_rotated_180: (attr_value & 0x0800) != 0,
            backslash_rotated_180: (attr_value & 0x1000) != 0,
            has_center_line: (attr_value & 0x2000) != 0,
        };

        // NOTE:
        // BorderFill의 실제 저장 포맷은 구현체/버전에 따라 2가지가 관찰됨.
        // (A) 스펙(표 23): line_types[4] -> widths[4] -> colors[4]
        // (B) 레거시(hwpjs.js): (line_type, width, color) * 4 (Left, Right, Top, Bottom) interleave
        // 여기서는 둘 다 파싱해보고 “더 그럴듯한” 결과를 선택한다.
        if data.len() < offset + 24 + 1 + 1 + 4 {
            return Err(HwpError::insufficient_data(
                "BorderFill (borders+diagonal)",
                offset + 24 + 1 + 1 + 4,
                data.len(),
            ));
        }

        fn score_borderline(line: &BorderLine) -> i32 {
            let mut s = 0;
            // width는 표 26: 0..=15
            if line.width <= 15 {
                s += 3;
            } else {
                s -= 10;
            }
            // line_type는 표 25: 0..=16 (실무에서 확장값이 있을 수 있어 약간 완화)
            if line.line_type <= 32 {
                s += 2;
            } else {
                s -= 5;
            }
            // color는 COLORREF이므로 어떤 값이든 가능하지만, 0xFFFFFFFF 같은 극단값은 감점
            if line.color.0 == 0xFFFFFFFF {
                s -= 2;
            }
            s
        }

        fn score_borders(borders: &[BorderLine; 4]) -> i32 {
            borders.iter().map(score_borderline).sum()
        }

        let start = offset;

        // (B) interleave: (line, width, color) * 4
        let mut borders_interleave: [BorderLine; 4] = [
            BorderLine {
                line_type: 0,
                width: 0,
                color: COLORREF(0),
            },
            BorderLine {
                line_type: 0,
                width: 0,
                color: COLORREF(0),
            },
            BorderLine {
                line_type: 0,
                width: 0,
                color: COLORREF(0),
            },
            BorderLine {
                line_type: 0,
                width: 0,
                color: COLORREF(0),
            },
        ];
        let mut off_i = start;
        for i in 0..4 {
            let line_type = data[off_i];
            off_i += 1;
            let width = data[off_i];
            off_i += 1;
            let color = COLORREF(u32::from_le_bytes([
                data[off_i],
                data[off_i + 1],
                data[off_i + 2],
                data[off_i + 3],
            ]));
            off_i += 4;
            borders_interleave[i] = BorderLine {
                line_type,
                width,
                color,
            };
        }

        // (A) spec arrays: line_types[4], widths[4], colors[4]
        let mut borders_spec: [BorderLine; 4] = borders_interleave.clone();
        let mut off_s = start;
        let line_types = [
            data[off_s],
            data[off_s + 1],
            data[off_s + 2],
            data[off_s + 3],
        ];
        off_s += 4;
        let widths = [
            data[off_s],
            data[off_s + 1],
            data[off_s + 2],
            data[off_s + 3],
        ];
        off_s += 4;
        let mut colors = [COLORREF(0); 4];
        for i in 0..4 {
            colors[i] = COLORREF(u32::from_le_bytes([
                data[off_s],
                data[off_s + 1],
                data[off_s + 2],
                data[off_s + 3],
            ]));
            off_s += 4;
        }
        for i in 0..4 {
            borders_spec[i] = BorderLine {
                line_type: line_types[i],
                width: widths[i],
                color: colors[i],
            };
        }

        // 점수 비교로 선택
        let score_i = score_borders(&borders_interleave);
        let score_s = score_borders(&borders_spec);
        let borders = if score_i >= score_s {
            offset = off_i;
            borders_interleave
        } else {
            offset = off_s;
            borders_spec
        };

        // debug instrumentation removed

        // UINT8 대각선 종류 / UINT8 diagonal line type
        let diagonal_type = data[offset];
        offset += 1;

        // UINT8 대각선 굵기 / UINT8 diagonal line thickness
        let diagonal_thickness = data[offset];
        offset += 1;

        // COLORREF 대각선 색깔 / COLORREF diagonal line color
        let diagonal_color = COLORREF(u32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]));
        offset += 4;

        let diagonal = DiagonalLine {
            line_type: diagonal_type,
            thickness: diagonal_thickness,
            color: diagonal_color,
        };

        // BYTE stream 채우기 정보 (표 28) / BYTE stream fill information (Table 28)
        let fill = if offset < data.len() {
            Self::parse_fill_info(&data[offset..])?
        } else {
            FillInfo::None
        };

        Ok(BorderFill {
            attributes,
            borders,
            diagonal,
            fill,
        })
    }

    /// 채우기 정보 파싱 / Parse fill information
    fn parse_fill_info(data: &[u8]) -> Result<FillInfo, HwpError> {
        if data.len() < 4 {
            return Ok(FillInfo::None);
        }

        let mut offset = 0;

        // UINT 채우기 종류 / UINT fill type
        let fill_type_value = UINT::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        let fill_type = if fill_type_value == 0x00000000 {
            FillType::None
        } else if (fill_type_value & 0x00000001) != 0 {
            FillType::Solid
        } else if (fill_type_value & 0x00000002) != 0 {
            FillType::Image
        } else if (fill_type_value & 0x00000004) != 0 {
            FillType::Gradient
        } else {
            return Ok(FillInfo::None);
        };

        match fill_type {
            FillType::None => Ok(FillInfo::None),
            FillType::Solid => {
                if offset + 12 > data.len() {
                    return Err(HwpError::insufficient_data(
                        "Solid fill data",
                        12,
                        data.len() - offset,
                    ));
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
                Ok(FillInfo::Solid(SolidFill {
                    background_color,
                    pattern_color,
                    pattern_type,
                }))
            }
            FillType::Gradient => {
                if offset + 12 > data.len() {
                    return Err(HwpError::insufficient_data(
                        "Gradient fill data",
                        12,
                        data.len() - offset,
                    ));
                }
                let gradient_type = INT16::from_le_bytes([data[offset], data[offset + 1]]);
                offset += 2;
                let angle = INT16::from_le_bytes([data[offset], data[offset + 1]]);
                offset += 2;
                let horizontal_center = INT16::from_le_bytes([data[offset], data[offset + 1]]);
                offset += 2;
                let vertical_center = INT16::from_le_bytes([data[offset], data[offset + 1]]);
                offset += 2;
                let spread = INT16::from_le_bytes([data[offset], data[offset + 1]]);
                offset += 2;
                let color_count = INT16::from_le_bytes([data[offset], data[offset + 1]]);
                offset += 2;

                let positions = if color_count > 2 {
                    if offset + (4 * color_count as usize) > data.len() {
                        return Err(HwpError::insufficient_data(
                            "Gradient positions data",
                            4 * color_count as usize,
                            data.len() - offset,
                        ));
                    }
                    let mut pos_vec = Vec::new();
                    for _ in 0..color_count {
                        pos_vec.push(INT32::from_le_bytes([
                            data[offset],
                            data[offset + 1],
                            data[offset + 2],
                            data[offset + 3],
                        ]));
                        offset += 4;
                    }
                    Some(pos_vec)
                } else {
                    None
                };

                if offset + (4 * color_count as usize) > data.len() {
                    return Err(HwpError::insufficient_data(
                        "Gradient colors data",
                        4 * color_count as usize,
                        data.len() - offset,
                    ));
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

                Ok(FillInfo::Gradient(GradientFill {
                    gradient_type,
                    angle,
                    horizontal_center,
                    vertical_center,
                    spread,
                    color_count,
                    positions,
                    colors,
                }))
            }
            FillType::Image => {
                // 이미지 채우기는 복잡하므로 기본 구조만 파싱 / Image fill is complex, so only parse basic structure
                if offset + 1 > data.len() {
                    return Err(HwpError::insufficient_data(
                        "Image fill type",
                        1,
                        data.len() - offset,
                    ));
                }
                let image_fill_type = data[offset];
                offset += 1;

                if offset + 5 > data.len() {
                    return Err(HwpError::insufficient_data(
                        "Image info",
                        5,
                        data.len() - offset,
                    ));
                }
                let image_info = data[offset..offset + 5].to_vec();
                offset += 5;

                // 나머지는 복잡하므로 일단 기본 구조만 / Rest is complex, so only basic structure for now
                Ok(FillInfo::Image(ImageFill {
                    image_fill_type,
                    image_info,
                    gradient_spread_center: None,
                    additional_attributes_length: None,
                    additional_attributes: None,
                }))
            }
        }
    }
}
