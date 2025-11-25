mod char_shape;
/// BodyText parsing module
///
/// This module handles parsing of HWP BodyText storage.
///
/// 스펙 문서 매핑: 표 2 - 본문 (BodyText 스토리지)
pub mod constants;
mod ctrl_header;
mod line_seg;
mod list_header;
mod para_header;
mod range_tag;
pub mod record_tree;
mod table;

pub use char_shape::{CharShapeInfo, ParaCharShape};
pub use ctrl_header::{CtrlHeader, CtrlHeaderData};
pub use line_seg::{LineSegmentInfo, ParaLineSeg};
pub use list_header::ListHeader;
pub use para_header::{ColumnDivideType, ParaHeader};
pub use range_tag::{ParaRangeTag, RangeTagInfo};
pub use table::Table;

use crate::cfb::CfbParser;
use crate::decompress::decompress_deflate;
use crate::document::fileheader::FileHeader;
use crate::types::{decode_utf16le, WORD};
use cfb::CompoundFile;
use constants::*;
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
            if child.tag_id() == HWPTAG_PARA_HEADER {
                paragraphs.push(Self::parse_paragraph_from_tree(child, version)?);
            }
        }

        Ok(paragraphs)
    }

    /// 트리 노드에서 Paragraph를 파싱합니다. / Parse Paragraph from tree node.
    ///
    /// 문단 헤더 노드와 그 자식들을 재귀적으로 처리합니다.
    /// Recursively processes paragraph header node and its children.
    fn parse_paragraph_from_tree(node: &RecordTreeNode, version: u32) -> Result<Paragraph, String> {
        if node.tag_id() != HWPTAG_PARA_HEADER {
            return Err(format!(
                "Expected HWPTAG_PARA_HEADER, got tag {}",
                node.tag_id()
            ));
        }

        let para_header = ParaHeader::parse(node.data(), version)?;
        let mut records = Vec::new();

        // 자식들을 처리 / Process children
        for child in node.children() {
            records.push(Self::parse_record_from_tree(child, version)?);
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
    ) -> Result<ParagraphRecord, String> {
        match node.tag_id() {
            HWPTAG_PARA_TEXT => {
                let text = decode_utf16le(node.data())?;
                Ok(ParagraphRecord::ParaText { text })
            }
            HWPTAG_PARA_CHAR_SHAPE => {
                let para_char_shape = ParaCharShape::parse(node.data())?;
                Ok(ParagraphRecord::ParaCharShape {
                    shapes: para_char_shape.shapes,
                })
            }
            HWPTAG_PARA_LINE_SEG => {
                let para_line_seg = ParaLineSeg::parse(node.data())?;
                Ok(ParagraphRecord::ParaLineSeg {
                    segments: para_line_seg.segments,
                })
            }
            HWPTAG_PARA_RANGE_TAG => {
                let para_range_tag = ParaRangeTag::parse(node.data())?;
                Ok(ParagraphRecord::ParaRangeTag {
                    tags: para_range_tag.tags,
                })
            }
            HWPTAG_CTRL_HEADER => {
                let ctrl_header = CtrlHeader::parse(node.data())?;
                // 자식 레코드들을 재귀적으로 처리 / Recursively process child records
                // hwp.js: visitControlHeader에서 record.children를 모두 처리
                // hwp.js: visitControlHeader processes all record.children
                // hwp.js: visitListHeader에서 record.parentTagID === HWPTAG_CTRL_HEADER이고 isTable(control)일 때 테이블 셀로 처리
                // hwp.js: visitListHeader processes as table cell when record.parentTagID === HWPTAG_CTRL_HEADER and isTable(control)
                let mut children = Vec::new();
                let mut table_opt: Option<crate::document::bodytext::Table> = None;
                let mut list_headers_for_table: Vec<(usize, Vec<super::Paragraph>)> = Vec::new(); // (cell_index, paragraphs)

                // CTRL_HEADER가 테이블인지 확인 / Check if CTRL_HEADER is a table
                // hwp.js: CommonCtrlID.Table = makeCtrlID('t', 'b', 'l', ' ') = 0x206C6274 (little-endian: 0x74626C20)
                // hwp.js: CommonCtrlID.Table = makeCtrlID('t', 'b', 'l', ' ') = 0x206C6274 (little-endian: 0x74626C20)
                // pyhwp: CHID.TBL = 'tbl ' (바이트 리버스 후) / pyhwp: CHID.TBL = 'tbl ' (after byte reverse)
                let is_table =
                    ctrl_header.ctrl_id == "tbl " || ctrl_header.ctrl_id_value == 0x74626C20u32;

                for child in node.children() {
                    if child.tag_id() == HWPTAG_TABLE {
                        // TABLE은 별도로 처리 / TABLE is processed separately
                        let mut table_data = Table::parse(child.data(), version)?;
                        table_opt = Some(table_data);
                    } else if child.tag_id() == HWPTAG_LIST_HEADER && is_table {
                        // LIST_HEADER가 테이블의 셀인 경우 / LIST_HEADER is a table cell
                        // hwp.js: visitListHeader에서 LIST_HEADER를 파싱하고 테이블 셀로 처리
                        // hwp.js: visitListHeader parses LIST_HEADER and processes as table cell
                        let list_header_record = Self::parse_record_from_tree(child, version)?;
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
                        // 테이블 셀로 처리하기 위해 paragraphs 저장 / Store paragraphs for table cell processing
                        // 셀 인덱스 계산 (LIST_HEADER의 순서대로) / Calculate cell index (in order of LIST_HEADER)
                        // 실제로는 LIST_HEADER의 데이터에서 row/column 정보를 읽어야 하지만,
                        // 현재는 순서대로 처리 / Actually should read row/column from LIST_HEADER data, but process in order for now
                        list_headers_for_table
                            .push((list_headers_for_table.len(), paragraphs_for_cell));
                    } else {
                        children.push(Self::parse_record_from_tree(child, version)?);
                    }
                }

                // TABLE이 있으면 LIST_HEADER를 셀로 연결 / If TABLE exists, connect LIST_HEADER as cells
                if let Some(ref mut table) = table_opt {
                    for (cell_index, paragraphs) in list_headers_for_table {
                        if cell_index < table.cells.len() {
                            table.cells[cell_index].paragraphs = paragraphs;
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
            HWPTAG_LIST_HEADER => {
                let list_header = ListHeader::parse(node.data())?;
                // 자식들(셀 내부 문단) 처리 / Process children (paragraphs inside cell)
                // 트리 구조에서 이미 부모-자식 관계가 올바르게 설정되어 있으므로 레벨 체크 불필요
                // Tree structure already has correct parent-child relationships, so level check is unnecessary
                let mut paragraphs = Vec::new();
                for child in node.children() {
                    if child.tag_id() == HWPTAG_PARA_HEADER {
                        paragraphs.push(Self::parse_paragraph_from_tree(child, version)?);
                    }
                }
                Ok(ParagraphRecord::ListHeader {
                    header: list_header,
                    paragraphs,
                })
            }
            HWPTAG_TABLE => {
                // 테이블 파싱: 테이블 속성만 먼저 파싱 / Parse table: parse table attributes first
                // hwp.js: visitTable은 테이블 속성만 파싱하고, LIST_HEADER는 visitListHeader에서 처리
                // hwp.js: visitTable only parses table attributes, LIST_HEADER is processed in visitListHeader
                let table = Table::parse(node.data(), version)?;
                Ok(ParagraphRecord::Table { table })
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
