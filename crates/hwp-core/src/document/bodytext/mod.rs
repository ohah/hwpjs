mod char_shape;
/// BodyText parsing module
///
/// This module handles parsing of HWP BodyText storage.
///
/// 스펙 문서 매핑: 표 2 - 본문 (BodyText 스토리지)
pub mod constants;
pub use constants::HwpTag;
mod ctrl_header;
mod footnote_shape;
mod line_seg;
mod list_header;
mod page_border_fill;
mod page_def;
mod para_header;
mod range_tag;
pub mod record_tree;
mod shape_component;
mod table;

pub use char_shape::{CharShapeInfo, ParaCharShape};
pub use ctrl_header::{CtrlHeader, CtrlHeaderData, CtrlId};
pub use footnote_shape::FootnoteShape;
pub use line_seg::{LineSegmentInfo, ParaLineSeg};
pub use list_header::ListHeader;
pub use page_border_fill::PageBorderFill;
pub use page_def::PageDef;
pub use para_header::{ColumnDivideType, ParaHeader};
pub use range_tag::{ParaRangeTag, RangeTagInfo};
pub use shape_component::ShapeComponent;
pub use table::{Table, TableCell};

use crate::cfb::CfbParser;
use crate::decompress::decompress_deflate;
use crate::document::fileheader::FileHeader;
use crate::types::{decode_utf16le, RecordHeader, WORD};
use cfb::CompoundFile;
use record_tree::RecordTreeNode;
use serde::{Deserialize, Serialize};
use std::io::Cursor;

/// Body text structure
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BodyText {
    /// Sections (Section0, Section1, etc.)
    pub sections: Vec<Section>,
}

/// Section structure
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Section {
    /// Section index
    pub index: WORD,
    /// Paragraphs in this section
    pub paragraphs: Vec<Paragraph>,
}

/// Paragraph structure
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Paragraph {
    /// Paragraph header (level 0 record)
    pub para_header: ParaHeader,
    /// Paragraph records (level 1 records)
    pub records: Vec<ParagraphRecord>,
}

/// Paragraph record (level 1 records)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ParagraphRecord {
    /// 문단의 텍스트 / Paragraph text
    ParaText {
        /// 텍스트 내용 (UTF-16LE) / Text content (UTF-16LE)
        text: String,
    },
    /// 문단의 글자 모양 / Paragraph character shape
    ParaCharShape {
        /// 글자 모양 정보 리스트 / Character shape information list
        shapes: Vec<CharShapeInfo>,
    },
    /// 문단의 레이아웃 / Paragraph line segment
    ParaLineSeg {
        /// 줄 세그먼트 정보 리스트 / Line segment information list
        segments: Vec<LineSegmentInfo>,
    },
    /// 문단의 영역 태그 / Paragraph range tag
    ParaRangeTag {
        /// 영역 태그 정보 리스트 / Range tag information list
        tags: Vec<RangeTagInfo>,
    },
    /// 컨트롤 헤더 / Control header
    CtrlHeader {
        /// 컨트롤 헤더 정보 / Control header information
        #[serde(flatten)]
        header: CtrlHeader,
        /// 컨트롤 헤더의 자식 레코드 (레벨 2) / Child records of control header (level 2)
        #[serde(skip_serializing_if = "Vec::is_empty", default)]
        children: Vec<ParagraphRecord>,
    },
    /// 문단 리스트 헤더 / Paragraph list header
    ListHeader {
        /// 문단 리스트 헤더 정보 / Paragraph list header information
        header: ListHeader,
        /// 리스트 헤더의 자식 문단들 (레벨 3, 예: 테이블 셀 내부 문단) / Child paragraphs of list header (level 3, e.g., paragraphs inside table cell)
        #[serde(skip_serializing_if = "Vec::is_empty", default)]
        paragraphs: Vec<Paragraph>,
    },
    /// 표 개체 / Table object
    Table {
        /// 표 개체 정보 / Table object information
        table: Table,
    },
    /// 용지 설정 / Page definition
    PageDef {
        /// 용지 설정 정보 / Page definition information
        page_def: PageDef,
    },
    /// 각주/미주 모양 / Footnote/endnote shape
    FootnoteShape {
        /// 각주/미주 모양 정보 / Footnote/endnote shape information
        footnote_shape: FootnoteShape,
    },
    /// 쪽 테두리/배경 / Page border/fill
    PageBorderFill {
        /// 쪽 테두리/배경 정보 / Page border/fill information
        page_border_fill: PageBorderFill,
    },
    /// 개체 요소 / Shape component
    ShapeComponent {
        /// 개체 요소 정보 / Shape component information
        shape_component: ShapeComponent,
    },
    /// 기타 레코드 / Other records
    Other {
        /// Tag ID
        tag_id: WORD,
        /// Raw data
        #[serde(skip)]
        data: Vec<u8>,
    },
}

impl Section {
    /// Section 데이터를 파싱하여 Paragraph 리스트로 변환합니다. / Parse section data into paragraph list.
    ///
    /// 트리 구조를 먼저 파싱한 후 재귀적으로 방문하여 구조화된 데이터로 변환합니다.
    /// First parses the tree structure, then recursively visits it to convert to structured data.
    ///
    /// # Arguments
    /// * `data` - Section의 원시 바이트 데이터 / Raw byte data of section
    /// * `version` - 파일 버전 / File version
    ///
    /// # Returns
    /// 파싱된 Paragraph 리스트 / Parsed paragraph list
    pub fn parse_data(data: &[u8], version: u32) -> Result<Vec<Paragraph>, String> {
        // 먼저 레코드를 트리 구조로 파싱 / First parse records into tree structure
        let tree = RecordTreeNode::parse_tree(data)?;

        // 트리를 재귀적으로 방문하여 Paragraph 리스트로 변환 / Recursively visit tree to convert to Paragraph list
        let mut paragraphs = Vec::new();
        for child in tree.children() {
            if child.tag_id() == HwpTag::PARA_HEADER {
                paragraphs.push(Self::parse_paragraph_from_tree(child, version, data)?);
            }
        }

        Ok(paragraphs)
    }

    /// 트리 노드에서 Paragraph를 파싱합니다. / Parse Paragraph from tree node.
    ///
    /// 문단 헤더 노드와 그 자식들을 재귀적으로 처리합니다.
    /// Recursively processes paragraph header node and its children.
    fn parse_paragraph_from_tree(
        node: &RecordTreeNode,
        version: u32,
        original_data: &[u8],
    ) -> Result<Paragraph, String> {
        if node.tag_id() != HwpTag::PARA_HEADER {
            return Err(format!(
                "Expected HwpTag::PARA_HEADER, got tag {}",
                node.tag_id()
            ));
        }

        let para_header = ParaHeader::parse(node.data(), version)?;
        let mut records = Vec::new();

        // 자식들을 처리 / Process children
        for child in node.children() {
            records.push(Self::parse_record_from_tree(child, version, original_data)?);
        }

        Ok(Paragraph {
            para_header,
            records,
        })
    }

    /// 트리 노드에서 ParagraphRecord를 파싱합니다. / Parse ParagraphRecord from tree node.
    ///
    /// 모든 레벨의 레코드를 재귀적으로 처리합니다.
    /// Recursively processes records at all levels.
    fn parse_record_from_tree(
        node: &RecordTreeNode,
        version: u32,
        original_data: &[u8],
    ) -> Result<ParagraphRecord, String> {
        match node.tag_id() {
            HwpTag::PARA_TEXT => {
                let text = decode_utf16le(node.data())?;
                Ok(ParagraphRecord::ParaText { text })
            }
            HwpTag::PARA_CHAR_SHAPE => {
                let para_char_shape = ParaCharShape::parse(node.data())?;
                Ok(ParagraphRecord::ParaCharShape {
                    shapes: para_char_shape.shapes,
                })
            }
            HwpTag::PARA_LINE_SEG => {
                let para_line_seg = ParaLineSeg::parse(node.data())?;
                Ok(ParagraphRecord::ParaLineSeg {
                    segments: para_line_seg.segments,
                })
            }
            HwpTag::PARA_RANGE_TAG => {
                let para_range_tag = ParaRangeTag::parse(node.data())?;
                Ok(ParagraphRecord::ParaRangeTag {
                    tags: para_range_tag.tags,
                })
            }
            HwpTag::CTRL_HEADER => {
                let ctrl_header = CtrlHeader::parse(node.data())?;
                // 자식 레코드들을 재귀적으로 처리 / Recursively process child records
                // hwp.js: visitControlHeader에서 record.children를 모두 처리
                // hwp.js: visitControlHeader processes all record.children
                // hwp.js: visitListHeader에서 record.parentTagID === HWPTAG_CTRL_HEADER이고 isTable(control)일 때 테이블 셀로 처리
                // hwp.js: visitListHeader processes as table cell when record.parentTagID === HWPTAG_CTRL_HEADER and isTable(control)
                let mut children = Vec::new();
                let mut table_opt: Option<crate::document::bodytext::Table> = None;
                let mut list_headers_for_table: Vec<(
                    u16,
                    u16,
                    Vec<super::Paragraph>,
                    Option<crate::document::bodytext::table::CellAttributes>,
                )> = Vec::new(); // (row_address, col_address, paragraphs, cell_attributes)

                // CTRL_HEADER가 테이블인지 확인 / Check if CTRL_HEADER is a table
                // hwp.js: CommonCtrlID.Table = makeCtrlID('t', 'b', 'l', ' ') = 0x206C6274 (little-endian: 0x74626C20)
                // hwp.js: CommonCtrlID.Table = makeCtrlID('t', 'b', 'l', ' ') = 0x206C6274 (little-endian: 0x74626C20)
                // pyhwp: CHID.TBL = 'tbl ' (바이트 리버스 후) / pyhwp: CHID.TBL = 'tbl ' (after byte reverse)
                use crate::document::bodytext::ctrl_header::CtrlId;
                let is_table = ctrl_header.ctrl_id == CtrlId::TABLE
                    || ctrl_header.ctrl_id_value == 0x74626C20u32;

                for child in node.children() {
                    if child.tag_id() == HwpTag::TABLE {
                        // TABLE은 별도로 처리 / TABLE is processed separately
                        let mut table_data = Table::parse(child.data(), version)?;
                        table_opt = Some(table_data);
                    } else if child.tag_id() == HwpTag::LIST_HEADER && is_table {
                        // LIST_HEADER가 테이블의 셀인 경우 / LIST_HEADER is a table cell
                        // hwp.js: visitListHeader에서 LIST_HEADER를 파싱하고 테이블 셀로 처리
                        // hwp.js: visitListHeader parses LIST_HEADER and processes as table cell
                        let list_header_record =
                            Self::parse_record_from_tree(child, version, original_data)?;
                        // LIST_HEADER는 children에도 포함되어야 함 / LIST_HEADER should also be included in children
                        // 테이블 셀로 처리하기 위해 paragraphs 추출 / Extract paragraphs for table cell processing
                        let paragraphs_for_cell = if let ParagraphRecord::ListHeader {
                            header: _,
                            paragraphs,
                        } = &list_header_record
                        {
                            paragraphs.clone()
                        } else {
                            Vec::new()
                        };
                        // LIST_HEADER를 children에 추가 / Add LIST_HEADER to children
                        children.push(list_header_record);

                        // LIST_HEADER 원시 데이터에서 CellAttributes 파싱 / Parse CellAttributes from LIST_HEADER raw data
                        // LIST_HEADER 데이터 구조: ListHeader (10바이트) + CellAttributes (26바이트)
                        // LIST_HEADER data structure: ListHeader + CellAttributes (26 bytes)
                        // 표 65: ListHeader는 INT16(2) + UINT32(4) = 6바이트 (문서 기준)
                        // 하지만 실제 구현에서는 UINT16 paragraphs + UINT16 unknown1 + UINT32 listflags = 8바이트
                        // pyhwp를 참고하면 TableCell은 ListHeader를 상속하고 추가 필드를 가짐
                        // pyhwp의 TableCell 구조:
                        //   - ListHeader: UINT16 paragraphs + UINT16 unknown1 + UINT32 listflags = 8바이트
                        //   - UINT16 col, UINT16 row, UINT16 colspan, UINT16 rowspan, ...
                        let cell_data = child.data();
                        let (row_addr, col_addr, cell_attrs_opt) = if cell_data.len() >= 34 {
                            // ListHeader는 실제로 8바이트 (pyhwp 기준)
                            // CellAttributes는 ListHeader 이후부터 시작
                            use crate::document::bodytext::table::CellAttributes;
                            use crate::types::{HWPUNIT, HWPUNIT16, UINT16, UINT32};
                            // ListHeader: UINT16(2) + UINT16(2) + UINT32(4) = 8바이트 (pyhwp 실제 구현)
                            let offset = 8; // ListHeader: UINT16(2) + UINT16(2) + UINT32(4) = 8바이트
                            if offset + 26 <= cell_data.len() {
                                let cell_attrs = CellAttributes {
                                    col_address: UINT16::from_le_bytes([
                                        cell_data[offset],
                                        cell_data[offset + 1],
                                    ]),
                                    row_address: UINT16::from_le_bytes([
                                        cell_data[offset + 2],
                                        cell_data[offset + 3],
                                    ]),
                                    col_span: UINT16::from_le_bytes([
                                        cell_data[offset + 4],
                                        cell_data[offset + 5],
                                    ]),
                                    row_span: UINT16::from_le_bytes([
                                        cell_data[offset + 6],
                                        cell_data[offset + 7],
                                    ]),
                                    width: HWPUNIT::from(UINT32::from_le_bytes([
                                        cell_data[offset + 8],
                                        cell_data[offset + 9],
                                        cell_data[offset + 10],
                                        cell_data[offset + 11],
                                    ])),
                                    height: HWPUNIT::from(UINT32::from_le_bytes([
                                        cell_data[offset + 12],
                                        cell_data[offset + 13],
                                        cell_data[offset + 14],
                                        cell_data[offset + 15],
                                    ])),
                                    left_margin: HWPUNIT16::from_le_bytes([
                                        cell_data[offset + 16],
                                        cell_data[offset + 17],
                                    ]),
                                    right_margin: HWPUNIT16::from_le_bytes([
                                        cell_data[offset + 18],
                                        cell_data[offset + 19],
                                    ]),
                                    top_margin: HWPUNIT16::from_le_bytes([
                                        cell_data[offset + 20],
                                        cell_data[offset + 21],
                                    ]),
                                    bottom_margin: HWPUNIT16::from_le_bytes([
                                        cell_data[offset + 22],
                                        cell_data[offset + 23],
                                    ]),
                                    border_fill_id: UINT16::from_le_bytes([
                                        cell_data[offset + 24],
                                        cell_data[offset + 25],
                                    ]),
                                };
                                (
                                    cell_attrs.row_address,
                                    cell_attrs.col_address,
                                    Some(cell_attrs),
                                )
                            } else {
                                (list_headers_for_table.len() as u16, 0, None)
                            }
                        } else {
                            (list_headers_for_table.len() as u16, 0, None)
                        };

                        // 테이블 셀로 처리하기 위해 저장 / Store for table cell processing
                        list_headers_for_table.push((
                            row_addr,
                            col_addr,
                            paragraphs_for_cell,
                            cell_attrs_opt,
                        ));
                    } else {
                        children.push(Self::parse_record_from_tree(child, version, original_data)?);
                    }
                }

                // TABLE이 있으면 LIST_HEADER를 셀로 연결 / If TABLE exists, connect LIST_HEADER as cells
                if let Some(ref mut table) = table_opt {
                    // table.cells가 비어있으면 LIST_HEADER에서 셀 생성 / Create cells from LIST_HEADER if table.cells is empty
                    if table.cells.is_empty() && !list_headers_for_table.is_empty() {
                        use crate::document::bodytext::list_header::ListHeader;
                        use crate::document::bodytext::table::{CellAttributes, TableCell};
                        use crate::types::{HWPUNIT, HWPUNIT16, UINT16, UINT32};

                        // LIST_HEADER에서 셀 생성 / Create cells from LIST_HEADER
                        let row_count = table.attributes.row_count as usize;
                        let col_count = table.attributes.col_count as usize;

                        // row_address와 col_address를 사용하여 셀 매핑 / Map cells using row_address and col_address
                        let mut cell_map: Vec<Vec<Option<(usize, Vec<super::Paragraph>)>>> =
                            vec![vec![None; col_count]; row_count];

                        for (idx, (row_addr, col_addr, paragraphs, _)) in
                            list_headers_for_table.iter().enumerate()
                        {
                            let row = *row_addr as usize;
                            let col = *col_addr as usize;
                            if row < row_count && col < col_count {
                                cell_map[row][col] = Some((idx, paragraphs.clone()));
                            }
                        }

                        // 각 LIST_HEADER에서 셀 생성 / Create cells from each LIST_HEADER
                        // list_headers_for_table의 순서대로 처리 / Process in order of list_headers_for_table
                        for (row_addr, col_addr, paragraphs, cell_attrs_opt) in
                            &list_headers_for_table
                        {
                            let row = *row_addr as usize;
                            let col = *col_addr as usize;
                            if row < row_count && col < col_count {
                                // LIST_HEADER 원시 데이터 찾기 / Find LIST_HEADER raw data
                                let mut found_list_header = None;
                                for child in node.children() {
                                    if child.tag_id() == HwpTag::LIST_HEADER {
                                        let cell_data = child.data();
                                        if cell_data.len() >= 36 {
                                            let offset = 10;
                                            let check_row = UINT16::from_le_bytes([
                                                cell_data[offset + 2],
                                                cell_data[offset + 3],
                                            ]);
                                            let check_col = UINT16::from_le_bytes([
                                                cell_data[offset],
                                                cell_data[offset + 1],
                                            ]);
                                            if check_row == *row_addr && check_col == *col_addr {
                                                found_list_header = Some((
                                                    ListHeader::parse(cell_data)?,
                                                    cell_data,
                                                ));
                                                break;
                                            }
                                        }
                                    }
                                }

                                let (list_header, cell_attributes) = if let Some(cell_attrs) =
                                    cell_attrs_opt
                                {
                                    // cell_attrs_opt에서 가져오기 / Get from cell_attrs_opt
                                    let list_header = found_list_header.map(|(lh, _)| lh).unwrap_or_else(|| {
                                        // 기본 ListHeader 생성 / Create default ListHeader
                                        ListHeader::parse(&[0u8; 10]).unwrap_or_else(|_| ListHeader {
                                            paragraph_count: 0,
                                            attribute: crate::document::bodytext::list_header::ListHeaderAttribute {
                                                text_direction: crate::document::bodytext::list_header::TextDirection::Horizontal,
                                                line_break: crate::document::bodytext::list_header::LineBreak::Normal,
                                                vertical_align: crate::document::bodytext::list_header::VerticalAlign::Top,
                                            },
                                        })
                                    });
                                    (list_header, cell_attrs.clone())
                                } else {
                                    // cell_data에서 파싱 / Parse from cell_data
                                    if let Some((list_header, cell_data)) = found_list_header {
                                        let offset = 10;
                                        let cell_attributes = CellAttributes {
                                            col_address: UINT16::from_le_bytes([
                                                cell_data[offset],
                                                cell_data[offset + 1],
                                            ]),
                                            row_address: UINT16::from_le_bytes([
                                                cell_data[offset + 2],
                                                cell_data[offset + 3],
                                            ]),
                                            col_span: UINT16::from_le_bytes([
                                                cell_data[offset + 4],
                                                cell_data[offset + 5],
                                            ]),
                                            row_span: UINT16::from_le_bytes([
                                                cell_data[offset + 6],
                                                cell_data[offset + 7],
                                            ]),
                                            width: HWPUNIT::from(UINT32::from_le_bytes([
                                                cell_data[offset + 8],
                                                cell_data[offset + 9],
                                                cell_data[offset + 10],
                                                cell_data[offset + 11],
                                            ])),
                                            height: HWPUNIT::from(UINT32::from_le_bytes([
                                                cell_data[offset + 12],
                                                cell_data[offset + 13],
                                                cell_data[offset + 14],
                                                cell_data[offset + 15],
                                            ])),
                                            left_margin: HWPUNIT16::from_le_bytes([
                                                cell_data[offset + 16],
                                                cell_data[offset + 17],
                                            ]),
                                            right_margin: HWPUNIT16::from_le_bytes([
                                                cell_data[offset + 18],
                                                cell_data[offset + 19],
                                            ]),
                                            top_margin: HWPUNIT16::from_le_bytes([
                                                cell_data[offset + 20],
                                                cell_data[offset + 21],
                                            ]),
                                            bottom_margin: HWPUNIT16::from_le_bytes([
                                                cell_data[offset + 22],
                                                cell_data[offset + 23],
                                            ]),
                                            border_fill_id: UINT16::from_le_bytes([
                                                cell_data[offset + 24],
                                                cell_data[offset + 25],
                                            ]),
                                        };
                                        (list_header, cell_attributes)
                                    } else {
                                        // 기본값 사용 / Use default
                                        continue;
                                    }
                                };

                                table.cells.push(TableCell {
                                    list_header,
                                    cell_attributes,
                                    paragraphs: paragraphs.clone(),
                                });
                            }
                        }
                    } else {
                        // 기존 방식: row_address와 col_address를 사용하여 셀 찾기 / Existing way: find cell using row_address and col_address
                        for (row_addr, col_addr, paragraphs, _) in list_headers_for_table {
                            if let Some(cell) = table.cells.iter_mut().find(|c| {
                                c.cell_attributes.row_address == row_addr
                                    && c.cell_attributes.col_address == col_addr
                            }) {
                                cell.paragraphs = paragraphs;
                            } else {
                                // 셀을 찾지 못한 경우 인덱스로 시도 / Try by index if cell not found
                                let cell_index = (row_addr as usize
                                    * table.attributes.col_count as usize
                                    + col_addr as usize);
                                if cell_index < table.cells.len() {
                                    table.cells[cell_index].paragraphs = paragraphs;
                                }
                            }
                        }
                    }
                    children.push(ParagraphRecord::Table {
                        table: table.clone(),
                    });
                }

                Ok(ParagraphRecord::CtrlHeader {
                    header: ctrl_header,
                    children,
                })
            }
            HwpTag::LIST_HEADER => {
                let list_header = ListHeader::parse(node.data())?;
                // 자식들(셀 내부 문단) 처리 / Process children (paragraphs inside cell)
                // hwp.js: visitListHeader에서 paragraphs 수를 읽고, for 루프로 reader.read()를 호출하여 다음 레코드를 읽음
                // hwp.js: visitListHeader reads paragraph count and calls reader.read() in for loop to read next records
                // 트리 구조에서는 자식이 제대로 연결되지 않을 수 있으므로 원본 데이터에서 순차적으로 읽음
                // In tree structure, children may not be properly connected, so read sequentially from original data
                let mut paragraphs = Vec::new();

                // ListHeader의 paragraph_count를 확인하여 예상 문단 수 확인 / Check ListHeader's paragraph_count to verify expected paragraph count
                let expected_count = list_header.paragraph_count as usize;

                // 먼저 트리 구조에서 자식 노드를 확인 / First check child nodes in tree structure
                let mut stack: Vec<&RecordTreeNode> = vec![node];
                while let Some(current_node) = stack.pop() {
                    for child in current_node.children() {
                        if child.tag_id() == HwpTag::PARA_HEADER {
                            paragraphs.push(Self::parse_paragraph_from_tree(
                                child,
                                version,
                                original_data,
                            )?);
                        } else {
                            // 자식의 자식도 확인하기 위해 스택에 추가 / Add to stack to check children of children
                            stack.push(child);
                        }
                    }
                }

                // 트리 구조에서 자식을 찾지 못한 경우 원본 데이터에서 순차적으로 읽기 / If children not found in tree, read sequentially from original data
                if paragraphs.len() < expected_count {
                    // 원본 데이터에서 LIST_HEADER의 위치 찾기 / Find LIST_HEADER position in original data
                    // 원본 데이터를 순회하면서 LIST_HEADER를 찾고, 그 다음 레코드들을 읽기
                    // Traverse original data to find LIST_HEADER and read next records
                    let mut list_header_offset = None;
                    let mut offset = 0;

                    // 원본 데이터에서 LIST_HEADER 찾기 / Find LIST_HEADER in original data
                    while offset < original_data.len() {
                        if let Ok((header, header_size)) =
                            RecordHeader::parse(&original_data[offset..])
                        {
                            if header.tag_id == HwpTag::LIST_HEADER {
                                // node.data()와 비교하여 같은 LIST_HEADER인지 확인 / Compare with node.data() to verify same LIST_HEADER
                                let data_offset = offset + header_size;
                                if data_offset + header.size as usize <= original_data.len() {
                                    let record_data = &original_data
                                        [data_offset..data_offset + header.size as usize];
                                    if record_data == node.data() {
                                        list_header_offset = Some(offset);
                                        break;
                                    }
                                }
                            }
                            offset += header_size + header.size as usize;
                        } else {
                            break;
                        }
                    }

                    if let Some(start_offset) = list_header_offset {
                        // LIST_HEADER 다음 레코드들을 순차적으로 읽기 / Read next records sequentially after LIST_HEADER
                        let mut offset = start_offset;

                        // LIST_HEADER 헤더와 데이터 건너뛰기 / Skip LIST_HEADER header and data
                        if let Ok((header, header_size)) =
                            RecordHeader::parse(&original_data[offset..])
                        {
                            offset += header_size + header.size as usize;
                        }

                        // paragraph_count만큼 PARA_HEADER 읽기 / Read PARA_HEADER records up to paragraph_count
                        let mut para_count = 0;
                        while para_count < expected_count && offset < original_data.len() {
                            if let Ok((header, header_size)) =
                                RecordHeader::parse(&original_data[offset..])
                            {
                                offset += header_size;

                                if header.tag_id == HwpTag::PARA_HEADER {
                                    // PARA_HEADER 레코드 파싱 / Parse PARA_HEADER record
                                    let data_size = header.size as usize;
                                    if offset + data_size <= original_data.len() {
                                        let para_data = &original_data[offset..offset + data_size];
                                        offset += data_size;

                                        // PARA_HEADER를 트리 노드로 변환하여 파싱 / Convert PARA_HEADER to tree node and parse
                                        let para_node = RecordTreeNode {
                                            header: header.clone(),
                                            data: para_data.to_vec(),
                                            children: Vec::new(),
                                        };

                                        // PARA_HEADER의 자식 레코드들도 읽기 / Read child records of PARA_HEADER
                                        let mut para_records = Vec::new();
                                        while offset < original_data.len() {
                                            if let Ok((child_header, child_header_size)) =
                                                RecordHeader::parse(&original_data[offset..])
                                            {
                                                // 자식 레코드는 PARA_HEADER보다 레벨이 높아야 함 / Child records must have higher level than PARA_HEADER
                                                if child_header.level <= header.level {
                                                    break; // 같은 레벨 이하는 형제 레코드 / Same level or lower are sibling records
                                                }

                                                offset += child_header_size;
                                                let child_data_size = child_header.size as usize;
                                                if offset + child_data_size <= original_data.len() {
                                                    let child_data = &original_data
                                                        [offset..offset + child_data_size];
                                                    offset += child_data_size;

                                                    let child_node = RecordTreeNode {
                                                        header: child_header.clone(),
                                                        data: child_data.to_vec(),
                                                        children: Vec::new(),
                                                    };

                                                    para_records.push(
                                                        Self::parse_record_from_tree(
                                                            &child_node,
                                                            version,
                                                            original_data,
                                                        )?,
                                                    );
                                                } else {
                                                    break;
                                                }
                                            } else {
                                                break;
                                            }
                                        }

                                        // Paragraph 생성 / Create Paragraph
                                        use crate::document::bodytext::para_header::ParaHeader;
                                        let para_header = ParaHeader::parse(para_data, version)?;
                                        paragraphs.push(Paragraph {
                                            para_header,
                                            records: para_records,
                                        });

                                        para_count += 1;
                                    } else {
                                        break;
                                    }
                                } else {
                                    // PARA_HEADER가 아니면 건너뛰기 / Skip if not PARA_HEADER
                                    offset += header.size as usize;
                                }
                            } else {
                                break;
                            }
                        }
                    }
                }

                Ok(ParagraphRecord::ListHeader {
                    header: list_header,
                    paragraphs,
                })
            }
            HwpTag::TABLE => {
                // 테이블 파싱: 테이블 속성만 먼저 파싱 / Parse table: parse table attributes first
                // hwp.js: visitTable은 테이블 속성만 파싱하고, LIST_HEADER는 visitListHeader에서 처리
                // hwp.js: visitTable only parses table attributes, LIST_HEADER is processed in visitListHeader
                let table = Table::parse(node.data(), version)?;
                Ok(ParagraphRecord::Table { table })
            }
            HwpTag::PAGE_DEF => {
                // 용지 설정 파싱 / Parse page definition
                // 스펙 문서 매핑: 표 131 - 용지 설정 / Spec mapping: Table 131 - Page definition
                let page_def = PageDef::parse(node.data())?;
                Ok(ParagraphRecord::PageDef { page_def })
            }
            HwpTag::FOOTNOTE_SHAPE => {
                // 각주/미주 모양 파싱 / Parse footnote/endnote shape
                // 스펙 문서 매핑: 표 133 - 각주/미주 모양 / Spec mapping: Table 133 - Footnote/endnote shape
                let footnote_shape = FootnoteShape::parse(node.data())?;
                Ok(ParagraphRecord::FootnoteShape { footnote_shape })
            }
            HwpTag::PAGE_BORDER_FILL => {
                // 쪽 테두리/배경 파싱 / Parse page border/fill
                // 스펙 문서 매핑: 표 135 - 쪽 테두리/배경 / Spec mapping: Table 135 - Page border/fill
                let page_border_fill = PageBorderFill::parse(node.data())?;
                Ok(ParagraphRecord::PageBorderFill { page_border_fill })
            }
            HwpTag::SHAPE_COMPONENT => {
                // 개체 요소 파싱 / Parse shape component
                // 스펙 문서 매핑: 표 82, 83 - 개체 요소 속성 / Spec mapping: Table 82, 83 - Shape component attributes
                let shape_component = ShapeComponent::parse(node.data())?;
                Ok(ParagraphRecord::ShapeComponent { shape_component })
            }
            _ => Ok(ParagraphRecord::Other {
                tag_id: node.tag_id(),
                data: node.data().to_vec(),
            }),
        }
    }
}

impl BodyText {
    /// BodyText 스토리지에서 sections를 파싱합니다. / Parse sections from BodyText storage.
    ///
    /// # Arguments
    /// * `cfb` - CFB 구조체 (mutable reference) / CFB structure (mutable reference)
    /// * `file_header` - FileHeader (압축 여부 확인용) / FileHeader (to check compression)
    /// * `section_count` - 구역 개수 (DocumentProperties의 area_count) / Section count (area_count from DocumentProperties)
    ///
    /// # Returns
    /// 파싱된 BodyText 구조체 / Parsed BodyText structure
    pub fn parse(
        cfb: &mut CompoundFile<Cursor<&[u8]>>,
        file_header: &FileHeader,
        section_count: WORD,
    ) -> Result<Self, String> {
        let mut sections = Vec::new();

        // 각 구역을 읽어옵니다 / Read each section
        for i in 0..section_count {
            let stream_name = format!("Section{}", i);

            // 스트림 읽기 시도 / Try to read stream
            // CFB 경로 처리는 CfbParser에 위임 / Delegate CFB path handling to CfbParser
            match CfbParser::read_nested_stream(cfb, "BodyText", &stream_name) {
                Ok(mut section_data) => {
                    // 압축 해제 (필요한 경우) / Decompress if needed
                    // HWP BodyText uses raw deflate format (windowBits: -15), not zlib
                    if file_header.is_compressed() {
                        section_data = decompress_deflate(&section_data)?;
                    }

                    // Section 데이터를 Paragraph 리스트로 파싱 / Parse section data into paragraph list
                    let paragraphs = Section::parse_data(&section_data, file_header.version)?;

                    sections.push(Section {
                        index: i,
                        paragraphs,
                    });
                }
                Err(e) => {
                    // 스트림이 없으면 경고만 출력하고 계속 진행 / If stream doesn't exist, just warn and continue
                    eprintln!("Warning: Could not read BodyText/{}: {}", stream_name, e);
                }
            }
        }

        Ok(BodyText { sections })
    }
}
