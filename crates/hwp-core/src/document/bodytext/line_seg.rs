/// LineSegmentInfo 구조체 / LineSegmentInfo structure
///
/// 스펙 문서 매핑: 표 62 - 문단의 레이아웃 / Spec mapping: Table 62 - Paragraph line segment
/// 각 항목: 36바이트
use crate::error::HwpError;
use crate::types::{INT32, UINT32};
use serde::{Deserialize, Serialize};

/// 줄 세그먼트 태그 플래그 / Line segment tag flags
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LineSegmentTag {
    /// 페이지의 첫 줄인지 여부 / Is first line of page
    pub is_first_line_of_page: bool,
    /// 컬럼의 첫 줄인지 여부 / Is first line of column
    pub is_first_line_of_column: bool,
    /// 텍스트가 배열되지 않은 빈 세그먼트인지 여부 / Is empty segment without text
    pub is_empty_segment: bool,
    /// 줄의 첫 세그먼트인지 여부 / Is first segment of line
    pub is_first_segment_of_line: bool,
    /// 줄의 마지막 세그먼트인지 여부 / Is last segment of line
    pub is_last_segment_of_line: bool,
    /// 줄의 마지막에 auto-hyphenation이 수행되었는지 여부 / Auto-hyphenation performed at end of line
    pub has_auto_hyphenation: bool,
    /// indentation 적용 / Indentation applied
    pub has_indentation: bool,
    /// 문단 머리 모양 적용 / Paragraph header shape applied
    pub has_paragraph_header_shape: bool,
}

impl LineSegmentTag {
    /// UINT32 태그 값에서 LineSegmentTag를 파싱합니다. / Parse LineSegmentTag from UINT32 tag value.
    fn from_bits(tag: UINT32) -> Self {
        LineSegmentTag {
            is_first_line_of_page: (tag & 0x00000001) != 0,
            is_first_line_of_column: (tag & 0x00000002) != 0,
            is_empty_segment: (tag & 0x00010000) != 0,
            is_first_segment_of_line: (tag & 0x00020000) != 0,
            is_last_segment_of_line: (tag & 0x00040000) != 0,
            has_auto_hyphenation: (tag & 0x00080000) != 0,
            has_indentation: (tag & 0x00100000) != 0,
            has_paragraph_header_shape: (tag & 0x00200000) != 0,
        }
    }
}

/// 줄 세그먼트 정보 / Line segment information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LineSegmentInfo {
    /// 텍스트 시작 위치 / Text start position
    pub text_start_position: UINT32,
    /// 줄의 세로 위치 / Vertical position of line
    pub vertical_position: INT32,
    /// 줄의 높이 / Height of line
    pub line_height: INT32,
    /// 텍스트 부분의 높이 / Height of text portion
    pub text_height: INT32,
    /// 줄의 세로 위치에서 베이스라인까지 거리 / Distance from vertical position to baseline
    pub baseline_distance: INT32,
    /// 줄간격 / Line spacing
    pub line_spacing: INT32,
    /// 컬럼에서의 시작 위치 / Start position in column
    pub column_start_position: INT32,
    /// 세그먼트의 폭 / Width of segment
    pub segment_width: INT32,
    /// 태그 (플래그들) / Tag (flags)
    pub tag: LineSegmentTag,
}

impl LineSegmentInfo {
    /// LineSegmentInfo를 바이트 배열에서 파싱합니다. / Parse LineSegmentInfo from byte array.
    ///
    /// # Arguments
    /// * `data` - 최소 36바이트의 데이터 / At least 36 bytes of data
    ///
    /// # Returns
    /// 파싱된 LineSegmentInfo 구조체 / Parsed LineSegmentInfo structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 36 {
            return Err(HwpError::insufficient_data(
                "LineSegmentInfo",
                36,
                data.len(),
            ));
        }

        let mut offset = 0;

        // UINT32 텍스트 시작 위치 / UINT32 text start position
        let text_start_position = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // INT32 줄의 세로 위치 / INT32 vertical position of line
        let vertical_position = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // INT32 줄의 높이 / INT32 height of line
        let line_height = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // INT32 텍스트 부분의 높이 / INT32 height of text portion
        let text_height = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // INT32 줄의 세로 위치에서 베이스라인까지 거리 / INT32 distance from vertical position to baseline
        let baseline_distance = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // INT32 줄간격 / INT32 line spacing
        let line_spacing = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // INT32 컬럼에서의 시작 위치 / INT32 start position in column
        let column_start_position = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // INT32 세그먼트의 폭 / INT32 width of segment
        let segment_width = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // UINT32 태그 / UINT32 tag
        let tag_value = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        let tag = LineSegmentTag::from_bits(tag_value);

        Ok(LineSegmentInfo {
            text_start_position,
            vertical_position,
            line_height,
            text_height,
            baseline_distance,
            line_spacing,
            column_start_position,
            segment_width,
            tag,
        })
    }
}

/// 문단의 레이아웃 리스트 / Paragraph line segment list
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ParaLineSeg {
    /// 줄 세그먼트 정보 리스트 / Line segment information list
    pub segments: Vec<LineSegmentInfo>,
}

impl ParaLineSeg {
    /// ParaLineSeg를 바이트 배열에서 파싱합니다. / Parse ParaLineSeg from byte array.
    ///
    /// # Arguments
    /// * `data` - 레이아웃 데이터 (36×n 바이트) / Line segment data (36×n bytes)
    ///
    /// # Returns
    /// 파싱된 ParaLineSeg 구조체 / Parsed ParaLineSeg structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() % 36 != 0 {
            return Err(HwpError::UnexpectedValue {
                field: "ParaLineSeg data length".to_string(),
                expected: "multiple of 36".to_string(),
                found: format!("{} bytes", data.len()),
            });
        }

        let count = data.len() / 36;
        let mut segments = Vec::with_capacity(count);

        for i in 0..count {
            let offset = i * 36;
            let segment_data = &data[offset..offset + 36];
            let segment_info = LineSegmentInfo::parse(segment_data)?;
            segments.push(segment_info);
        }

        Ok(ParaLineSeg { segments })
    }
}
