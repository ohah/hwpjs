/// Table 구조체 / Table structure
///
/// 스펙 문서 매핑: 표 74 - 표 개체 / Spec mapping: Table 74 - Table object
use crate::error::HwpError;
use crate::types::{HWPUNIT, HWPUNIT16, UINT16, UINT32};
use serde::{Deserialize, Serialize};

use super::list_header::ListHeader;

/// 표 개체 / Table object
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Table {
    /// 표 개체 속성 (표 75 참조) / Table object attributes (see Table 75)
    pub attributes: TableAttributes,
    /// 셀 리스트 (표 79 참조) / Cell list (see Table 79)
    pub cells: Vec<TableCell>,
}

/// 표 개체 속성 (표 75) / Table object attributes (Table 75)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableAttributes {
    /// 속성 (표 76 참조) / Attribute (see Table 76)
    pub attribute: TableAttribute,
    /// 행 개수 / Row count
    pub row_count: UINT16,
    /// 열 개수 / Column count
    pub col_count: UINT16,
    /// 셀 간격 / Cell spacing
    pub cell_spacing: HWPUNIT16,
    /// 안쪽 여백 정보 (표 77 참조) / Padding information (see Table 77)
    pub padding: TablePadding,
    /// 행 크기 리스트 / Row size list
    pub row_sizes: Vec<HWPUNIT16>,
    /// 테두리 채우기 ID / Border fill ID
    pub border_fill_id: UINT16,
    /// 영역 속성 리스트 (5.0.1.0 이상) / Zone attributes list (5.0.1.0 and above)
    pub zones: Vec<TableZone>,
}

/// 표 속성의 속성 (표 76) / Table attribute properties (Table 76)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableAttribute {
    /// 쪽 경계에서 나눔 / Page break behavior
    pub page_break: PageBreakBehavior,
    /// 제목 줄 자동 반복 여부 / Header row auto repeat
    pub header_row_repeat: bool,
}

/// 쪽 경계에서 나눔 / Page break behavior
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PageBreakBehavior {
    /// 나누지 않음 / No break
    NoBreak,
    /// 셀 단위로 나눔 / Break by cell
    BreakByCell,
    /// 나누지 않음 (다른 값) / No break (other value)
    NoBreakOther,
}

/// 안쪽 여백 정보 (표 77) / Padding information (Table 77)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TablePadding {
    /// 왼쪽 여백 / Left padding
    pub left: HWPUNIT16,
    /// 오른쪽 여백 / Right padding
    pub right: HWPUNIT16,
    /// 위쪽 여백 / Top padding
    pub top: HWPUNIT16,
    /// 아래쪽 여백 / Bottom padding
    pub bottom: HWPUNIT16,
}

/// 영역 속성 (표 78) / Zone attributes (Table 78)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableZone {
    /// 시작 열 주소 / Start column address
    pub start_col: UINT16,
    /// 시작 행 주소 / Start row address
    pub start_row: UINT16,
    /// 끝 열 주소 / End column address
    pub end_col: UINT16,
    /// 끝 행 주소 / End row address
    pub end_row: UINT16,
    /// 테두리 채우기 ID / Border fill ID
    pub border_fill_id: UINT16,
}

/// 셀 리스트 (표 79) / Cell list (Table 79)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableCell {
    /// 문단 리스트 헤더 (표 65 참조) / Paragraph list header (see Table 65)
    pub list_header: ListHeader,
    /// 셀 속성 (표 80 참조) / Cell attributes (see Table 80)
    pub cell_attributes: CellAttributes,
    /// 셀 내부의 문단들 (레벨 3) / Paragraphs inside cell (level 3)
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub paragraphs: Vec<super::Paragraph>,
}

/// 셀 속성 (표 80) / Cell attributes (Table 80)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CellAttributes {
    /// 열 주소 / Column address
    pub col_address: UINT16,
    /// 행 주소 / Row address
    pub row_address: UINT16,
    /// 열 병합 개수 / Column merge count
    pub col_span: UINT16,
    /// 행 병합 개수 / Row merge count
    pub row_span: UINT16,
    /// 폭 / Width
    pub width: HWPUNIT,
    /// 높이 / Height
    pub height: HWPUNIT,
    /// 왼쪽 여백 / Left margin
    pub left_margin: HWPUNIT16,
    /// 오른쪽 여백 / Right margin
    pub right_margin: HWPUNIT16,
    /// 위쪽 여백 / Top margin
    pub top_margin: HWPUNIT16,
    /// 아래쪽 여백 / Bottom margin
    pub bottom_margin: HWPUNIT16,
    /// 테두리/배경 아이디 / Border fill ID
    pub border_fill_id: UINT16,
}

impl Table {
    /// Table을 바이트 배열에서 파싱합니다. / Parse Table from byte array.
    ///
    /// # Arguments
    /// * `data` - Table 데이터 (개체 공통 속성 포함) / Table data (including object common properties)
    /// * `version` - 파일 버전 / File version
    ///
    /// # Returns
    /// 파싱된 Table 구조체 / Parsed Table structure
    pub fn parse(data: &[u8], version: u32) -> Result<Self, HwpError> {
        if data.is_empty() {
            return Err(HwpError::InsufficientData {
                field: "Table data".to_string(),
                expected: 1,
                actual: 0,
            });
        }

        let mut offset = 0;

        // 레거시 코드를 보면 HWPTAG_TABLE은 개체 공통 속성을 건너뛰고 표 개체 속성부터 시작
        // According to legacy code, HWPTAG_TABLE skips object common properties and starts from table attributes
        // 표 개체 속성 파싱 (표 75) / Parse table object attributes (Table 75)
        let attributes = parse_table_attributes(data, &mut offset, version)?;

        // IMPORTANT:
        // HWP 5.x 실데이터에서는 "표 셀"의 실제 메타(행/열, 폭/높이, 마진, borderFill 등)와
        // 셀 내부 문단은 대부분 HWPTAG_LIST_HEADER(테이블 셀 리스트) 트리로 제공됩니다.
        //
        // legacy hwpjs / pyhwp 구현도 이 LIST_HEADER 기반을 단일 소스로 취급하는 방식이며,
        // HWPTAG_TABLE payload(표 79/80)를 추정 파싱하면 오프셋 불일치로 "가짜 셀"이 하나 더 생기는
        // 케이스(table-caption 등)가 있습니다.
        //
        // 따라서 여기서는 HWPTAG_TABLE payload에서 셀 리스트를 만들지 않고,
        // 트리 결합 단계(document/bodytext/mod.rs)에서 LIST_HEADER 기반으로 table.cells를 구성합니다.
        let cells = Vec::new();

        Ok(Table { attributes, cells })
    }
}

/// 표 개체 속성 파싱 (표 75) / Parse table object attributes (Table 75)
fn parse_table_attributes(
    data: &[u8],
    offset: &mut usize,
    version: u32,
) -> Result<TableAttributes, HwpError> {
    // 최소 22바이트 필요 (기본 필드) / Need at least 22 bytes (basic fields)
    if data.len() < *offset + 22 {
        return Err(HwpError::insufficient_data(
            "Table attributes",
            22,
            data.len() - *offset,
        ));
    }

    // UINT32 속성 (표 76 참조) / UINT32 attribute (see Table 76)
    let attribute_value = UINT32::from_le_bytes([
        data[*offset],
        data[*offset + 1],
        data[*offset + 2],
        data[*offset + 3],
    ]);
    *offset += 4;

    // UINT16 RowCount / UINT16 RowCount
    let row_count_raw = UINT16::from_le_bytes([data[*offset], data[*offset + 1]]);
    *offset += 2;

    // UINT16 nCols / UINT16 nCols
    let col_count_raw = UINT16::from_le_bytes([data[*offset], data[*offset + 1]]);
    *offset += 2;

    // row_count와 col_count는 UINT16이므로 최대 65535까지 가능 / row_count and col_count are UINT16, so max 65535
    // JSON에서는 정상적으로 파싱되므로 파싱 자체는 문제없음 / Parsing is fine since JSON shows normal values
    // 실제 문제는 row_sizes 메모리 손상이므로, row_count/col_count는 그대로 사용 / Actual issue is row_sizes memory corruption, so use row_count/col_count as is
    let row_count = row_count_raw;
    let col_count = col_count_raw;

    // HWPUNIT16 CellSpacing / HWPUNIT16 CellSpacing
    let cell_spacing = HWPUNIT16::from_le_bytes([data[*offset], data[*offset + 1]]);
    *offset += 2;

    // BYTE stream 8 안쪽 여백 정보 (표 77 참조) / BYTE stream 8 padding information (see Table 77)
    let padding = TablePadding {
        left: HWPUNIT16::from_le_bytes([data[*offset], data[*offset + 1]]),
        right: HWPUNIT16::from_le_bytes([data[*offset + 2], data[*offset + 3]]),
        top: HWPUNIT16::from_le_bytes([data[*offset + 4], data[*offset + 5]]),
        bottom: HWPUNIT16::from_le_bytes([data[*offset + 6], data[*offset + 7]]),
    };
    *offset += 8;

    // BYTE stream 2×row Row Size / BYTE stream 2×row Row Size
    // row_count가 이미 유효성 검사를 거쳤으므로 안전하게 파싱 / row_count is already validated, so safe to parse
    let mut row_sizes = Vec::new();
    for _ in 0..row_count {
        if *offset + 2 > data.len() {
            // 데이터가 부족하면 중단하고 지금까지 파싱한 것만 사용 / Stop if insufficient data and use what we've parsed so far
            break;
        }
        row_sizes.push(HWPUNIT16::from_le_bytes([data[*offset], data[*offset + 1]]));
        *offset += 2;
    }

    // row_sizes가 row_count와 일치하지 않으면 빈 Vec로 초기화 / Initialize as empty Vec if row_sizes doesn't match row_count
    // 메모리 손상 방지를 위해 유효성 검사 / Validate to prevent memory corruption
    if row_sizes.len() != row_count as usize {
        row_sizes = Vec::new();
    }

    // UINT16 Border Fill ID / UINT16 Border Fill ID
    let border_fill_id = UINT16::from_le_bytes([data[*offset], data[*offset + 1]]);
    *offset += 2;

    // UINT16 Valid Zone Info Size (5.0.1.0 이상) / UINT16 Valid Zone Info Size (5.0.1.0 and above)
    let mut zones = Vec::new();
    if version >= 5010 {
        if *offset + 2 > data.len() {
            return Err(HwpError::insufficient_data(
                "valid zone info size",
                2,
                data.len() - *offset,
            ));
        }
        let valid_zone_info_size = UINT16::from_le_bytes([data[*offset], data[*offset + 1]]);
        *offset += 2;

        // BYTE stream 10×zone 영역 속성 (표 78 참조) / BYTE stream 10×zone zone attributes (see Table 78)
        let zone_count = valid_zone_info_size as usize / 10;
        for _ in 0..zone_count {
            if *offset + 10 > data.len() {
                return Err(HwpError::insufficient_data(
                    "zone attributes",
                    10,
                    data.len() - *offset,
                ));
            }
            zones.push(TableZone {
                start_col: UINT16::from_le_bytes([data[*offset], data[*offset + 1]]),
                start_row: UINT16::from_le_bytes([data[*offset + 2], data[*offset + 3]]),
                end_col: UINT16::from_le_bytes([data[*offset + 4], data[*offset + 5]]),
                end_row: UINT16::from_le_bytes([data[*offset + 6], data[*offset + 7]]),
                border_fill_id: UINT16::from_le_bytes([data[*offset + 8], data[*offset + 9]]),
            });
            *offset += 10;
        }
    }

    // 속성 파싱 (표 76) / Parse attribute (Table 76)
    let attribute = parse_table_attribute(attribute_value);

    // row_count=0이거나 row_sizes가 row_count와 일치하지 않으면 빈 Vec로 초기화 / Initialize as empty Vec if row_count=0 or row_sizes doesn't match row_count
    // Vec의 메타데이터 손상 방지를 위해 명시적으로 빈 Vec 사용 / Use explicit empty Vec to prevent Vec metadata corruption
    let final_row_sizes = if row_count == 0 || row_sizes.len() != row_count as usize {
        Vec::new()
    } else {
        row_sizes
    };

    let result = TableAttributes {
        attribute,
        row_count,
        col_count,
        cell_spacing,
        padding,
        row_sizes: final_row_sizes, // row_count=0이거나 row_sizes가 비어있거나 비정상적으로 크면 빈 Vec 사용 / Use empty Vec when row_count=0 or row_sizes is empty/abnormal
        border_fill_id,
        zones,
    };
    Ok(result)
}

/// 표 속성의 속성 파싱 (표 76) / Parse table attribute properties (Table 76)
fn parse_table_attribute(value: UINT32) -> TableAttribute {
    // bit 0-1: 쪽 경계에서 나눔 / bit 0-1: page break behavior
    let page_break = match value & 0x03 {
        0 => PageBreakBehavior::NoBreak,
        1 => PageBreakBehavior::BreakByCell,
        2 => PageBreakBehavior::NoBreakOther,
        _ => PageBreakBehavior::NoBreak,
    };

    // bit 2: 제목 줄 자동 반복 여부 / bit 2: header row auto repeat
    let header_row_repeat = (value & 0x04) != 0;

    TableAttribute {
        page_break,
        header_row_repeat,
    }
}

/// 셀 리스트 파싱 (표 79) / Parse cell list (Table 79)
#[allow(dead_code)]
fn parse_cell_list(
    data: &[u8],
    row_count: UINT16,
    col_count: UINT16,
    row_sizes: &[HWPUNIT16], // 각 행의 실제 셀 개수
) -> Result<Vec<TableCell>, HwpError> {
    let mut cells = Vec::new();
    let mut offset = 0;

    // 셀 개수 산정:
    // - 스펙/실데이터에서 row_sizes는 "각 행의 실제 셀 개수"로 사용됩니다.
    // - row_sizes가 유효하면(합>0) 그대로 사용하고, 없으면 row_count*col_count로 폴백합니다.
    let total_cells_from_row_sizes: usize = row_sizes.iter().map(|&size| size as usize).sum();
    let total_cells = if total_cells_from_row_sizes > 0 {
        total_cells_from_row_sizes
    } else {
        row_count as usize * col_count as usize
    };

    // ListHeader(표 65)는 문서에 6바이트로 되어 있으나, 실제 파일에서는
    // [paragraph_count:2][unknown1:2][attribute:4]의 8바이트 형태가 존재합니다.
    //
    // TableCell에서는 ListHeader 바로 뒤에 CellAttributes(표 80, 26바이트)가 이어지므로,
    // "6바이트/8바이트" 중 어떤 레이아웃인지 실제 바이트를 보고 판별해야 오프셋이 틀어지지 않습니다.
    fn parse_cell_attributes_at(data: &[u8], offset: usize) -> Option<CellAttributes> {
        if offset + 26 > data.len() {
            return None;
        }
        Some(CellAttributes {
            col_address: UINT16::from_le_bytes([data[offset], data[offset + 1]]),
            row_address: UINT16::from_le_bytes([data[offset + 2], data[offset + 3]]),
            col_span: UINT16::from_le_bytes([data[offset + 4], data[offset + 5]]),
            row_span: UINT16::from_le_bytes([data[offset + 6], data[offset + 7]]),
            width: HWPUNIT::from(UINT32::from_le_bytes([
                data[offset + 8],
                data[offset + 9],
                data[offset + 10],
                data[offset + 11],
            ])),
            height: HWPUNIT::from(UINT32::from_le_bytes([
                data[offset + 12],
                data[offset + 13],
                data[offset + 14],
                data[offset + 15],
            ])),
            left_margin: HWPUNIT16::from_le_bytes([data[offset + 16], data[offset + 17]]),
            right_margin: HWPUNIT16::from_le_bytes([data[offset + 18], data[offset + 19]]),
            top_margin: HWPUNIT16::from_le_bytes([data[offset + 20], data[offset + 21]]),
            bottom_margin: HWPUNIT16::from_le_bytes([data[offset + 22], data[offset + 23]]),
            border_fill_id: UINT16::from_le_bytes([data[offset + 24], data[offset + 25]]),
        })
    }

    fn is_plausible_cell_attrs(
        attrs: &CellAttributes,
        row_count: UINT16,
        col_count: UINT16,
    ) -> bool {
        // row/col은 테이블 범위 내여야 함
        if attrs.row_address >= row_count || attrs.col_address >= col_count {
            return false;
        }
        // 폭/높이는 0이 아닌 것이 일반적 (0이면 오프셋 오판 가능성이 큼)
        if attrs.width.0 == 0 || attrs.height.0 == 0 {
            return false;
        }
        true
    }

    for _ in 0..total_cells {
        if offset >= data.len() {
            break; // 셀 데이터가 부족할 수 있음 / Cell data may be insufficient
        }

        // 1) ListHeader 크기(6/8) 판별
        // - 우선 8바이트로 가정한 뒤, 그 다음 26바이트를 CellAttributes로 해석했을 때 값이 그럴듯하면 8
        // - 아니면 6바이트로 시도
        // - 둘 다 그럴듯하지 않으면(데이터 손상 등) 8을 기본으로 둠 (기존 로직과 호환)
        let header_len = {
            let mut chosen = 8usize;
            let try8 = parse_cell_attributes_at(data, offset + 8)
                .filter(|a| is_plausible_cell_attrs(a, row_count, col_count));
            let try6 = parse_cell_attributes_at(data, offset + 6)
                .filter(|a| is_plausible_cell_attrs(a, row_count, col_count));
            if try8.is_some() {
                chosen = 8;
            } else if try6.is_some() {
                chosen = 6;
            }
            chosen
        };

        // 2) ListHeader 파싱 (확정된 길이만큼)
        if offset + header_len > data.len() {
            break;
        }
        let list_header =
            ListHeader::parse(&data[offset..offset + header_len]).map_err(|e| HwpError::from(e))?;
        offset += header_len;

        // 셀 속성 파싱 (표 80 참조) / Parse cell attributes (see Table 80)
        // 표 80: 전체 길이 26바이트
        // UINT16(2) + UINT16(2) + UINT16(2) + UINT16(2) + HWPUNIT(4) + HWPUNIT(4) + HWPUNIT16[4](8) + UINT16(2) = 26
        if offset + 26 > data.len() {
            return Err(HwpError::insufficient_data(
                "cell attributes",
                26,
                data.len() - offset,
            ));
        }

        let cell_attributes = parse_cell_attributes_at(data, offset).ok_or_else(|| {
            HwpError::insufficient_data("cell attributes", 26, data.len().saturating_sub(offset))
        })?;
        offset += 26;

        cells.push(TableCell {
            list_header,
            cell_attributes,
            paragraphs: Vec::new(), // 트리 구조에서 나중에 채워짐 / Will be filled from tree structure later
        });
    }

    Ok(cells)
}
