mod char_shape;
/// BodyText parsing module
///
/// This module handles parsing of HWP BodyText storage.
///
/// 스펙 문서 매핑: 표 2 - 본문 (BodyText 스토리지)
pub mod constants;
pub use constants::HwpTag;
pub mod control_char;
pub use control_char::{ControlChar, ControlCharPosition};
pub mod chart_data;
pub mod ctrl_data;
pub mod ctrl_header;
pub mod eqedit;
pub mod footnote_shape;
pub mod form_object;
pub mod line_seg;
pub mod list_header;
pub mod memo_list;
pub mod memo_shape;
pub mod page_border_fill;
pub mod page_def;
pub mod para_header;
pub mod range_tag;
pub mod record_tree;
pub mod shape_component;
pub mod table;
pub mod video_data;

pub use char_shape::{CharShapeInfo, ParaCharShape};
pub use chart_data::ChartData;
pub use ctrl_data::CtrlData;
pub use ctrl_header::{CtrlHeader, CtrlHeaderData, CtrlId, Margin, PageNumberPosition};
pub use eqedit::EqEdit;
pub use footnote_shape::{FootnoteShape, NumberShape};
pub use form_object::FormObject;
pub use line_seg::{LineSegmentInfo, ParaLineSeg};
pub use list_header::ListHeader;
pub use memo_list::MemoList;
pub use memo_shape::MemoShape;
pub use page_border_fill::PageBorderFill;
pub use page_def::{PageDef, PaperDirection};
pub use para_header::{ColumnDivideType, ControlMask, ParaHeader};
pub use range_tag::{ParaRangeTag, RangeTagInfo};
pub use shape_component::ShapeComponent;
pub use shape_component::ShapeComponentArc;
pub use shape_component::ShapeComponentContainer;
pub use shape_component::ShapeComponentCurve;
pub use shape_component::ShapeComponentEllipse;
pub use shape_component::ShapeComponentLine;
pub use shape_component::ShapeComponentOle;
pub use shape_component::ShapeComponentPicture;
pub use shape_component::ShapeComponentPolygon;
pub use shape_component::ShapeComponentRectangle;
pub use shape_component::ShapeComponentTextArt;
pub use shape_component::ShapeComponentUnknown;
pub use table::{Table, TableCell};
pub use video_data::VideoData;

use crate::cfb::CfbParser;
use crate::decompress::decompress_deflate;
use crate::document::bodytext::ctrl_header::Caption;
use crate::document::fileheader::FileHeader;
use crate::error::HwpError;
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
        /// 텍스트/컨트롤 토큰 시퀀스 (표/개체 등 위치를 보존하기 위한 구조) / Text/control token sequence
        #[serde(skip_serializing_if = "Vec::is_empty", default)]
        runs: Vec<ParaTextRun>,
        /// 제어 문자 위치 정보 / Control character positions
        /// 제어 문자가 없어도 빈 배열로 표시되어 JSON에 포함됩니다 / Empty array is included in JSON even if no control characters
        #[serde(default)]
        control_char_positions: Vec<crate::document::bodytext::control_char::ControlCharPosition>,
        /// INLINE 제어 문자 파라미터 정보 (문자 인덱스, 파라미터) / INLINE control character parameter information (char index, parameter)
        /// INLINE 타입 제어 문자(FIELD_END, TITLE_MARK, TAB 등)의 파라미터를 저장합니다.
        /// Stores parameters for INLINE type control characters (FIELD_END, TITLE_MARK, TAB, etc.).
        /// 스펙 문서에 파라미터 구조가 명시되지 않았으므로 바이트 배열로 저장됩니다.
        /// Parameter structure is not specified in spec document, so stored as byte array.
        #[serde(skip_serializing_if = "Vec::is_empty", default)]
        inline_control_params: Vec<(
            usize,
            crate::document::bodytext::control_char::InlineControlParam,
        )>,
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
        /// 각주/미주, 머리말/꼬리말 등의 컨트롤 헤더 내부에 PARA_HEADER가 직접 올 수 있음
        /// PARA_HEADER는 Paragraph로 변환되어 paragraphs에 저장됨
        /// PARA_HEADER can appear directly inside control headers like footnotes/endnotes, headers/footers, etc.
        /// PARA_HEADER is converted to Paragraph and stored in paragraphs
        #[serde(skip_serializing_if = "Vec::is_empty", default)]
        children: Vec<ParagraphRecord>,
        /// 컨트롤 헤더 내부의 문단들 (레벨 2 이상의 PARA_HEADER) / Paragraphs inside control header (PARA_HEADER at level 2 or higher)
        /// 각주/미주, 머리말/꼬리말 등의 컨트롤 헤더 내부에 직접 나타나는 문단들
        /// Paragraphs that appear directly inside control headers like footnotes/endnotes, headers/footers, etc.
        #[serde(skip_serializing_if = "Vec::is_empty", default)]
        paragraphs: Vec<Paragraph>,
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
        /// 개체 요소의 자식 레코드 (레벨 3, 예: SHAPE_COMPONENT_PICTURE) / Child records of shape component (level 3, e.g., SHAPE_COMPONENT_PICTURE)
        #[serde(skip_serializing_if = "Vec::is_empty", default)]
        children: Vec<ParagraphRecord>,
    },
    /// 직선 개체 / Line shape component
    ShapeComponentLine {
        /// 직선 개체 정보 / Line shape component information
        shape_component_line: ShapeComponentLine,
    },
    /// 사각형 개체 / Rectangle shape component
    ShapeComponentRectangle {
        /// 사각형 개체 정보 / Rectangle shape component information
        shape_component_rectangle: ShapeComponentRectangle,
    },
    /// 타원 개체 / Ellipse shape component
    ShapeComponentEllipse {
        /// 타원 개체 정보 / Ellipse shape component information
        shape_component_ellipse: ShapeComponentEllipse,
    },
    /// 호 개체 / Arc shape component
    ShapeComponentArc {
        /// 호 개체 정보 / Arc shape component information
        shape_component_arc: ShapeComponentArc,
    },
    /// 다각형 개체 / Polygon shape component
    ShapeComponentPolygon {
        /// 다각형 개체 정보 / Polygon shape component information
        shape_component_polygon: ShapeComponentPolygon,
    },
    /// 곡선 개체 / Curve shape component
    ShapeComponentCurve {
        /// 곡선 개체 정보 / Curve shape component information
        shape_component_curve: ShapeComponentCurve,
    },
    /// OLE 개체 / OLE shape component
    ShapeComponentOle {
        /// OLE 개체 정보 / OLE shape component information
        shape_component_ole: ShapeComponentOle,
    },
    /// 그림 개체 / Picture shape component
    ShapeComponentPicture {
        /// 그림 개체 정보 / Picture shape component information
        shape_component_picture: ShapeComponentPicture,
    },
    /// 묶음 개체 / Container shape component
    ShapeComponentContainer {
        /// 묶음 개체 정보 / Container shape component information
        shape_component_container: ShapeComponentContainer,
    },
    /// 컨트롤 임의의 데이터 / Control arbitrary data
    CtrlData {
        /// 컨트롤 임의의 데이터 정보 / Control arbitrary data information
        ctrl_data: CtrlData,
    },
    /// 수식 개체 / Equation editor object
    EqEdit {
        /// 수식 개체 정보 / Equation editor object information
        eqedit: EqEdit,
    },
    /// 글맵시 개체 / Text art shape component
    ShapeComponentTextArt {
        /// 글맵시 개체 정보 / Text art shape component information
        shape_component_textart: ShapeComponentTextArt,
    },
    /// 양식 개체 / Form object
    FormObject {
        /// 양식 개체 정보 / Form object information
        form_object: FormObject,
    },
    /// 메모 모양 / Memo shape
    MemoShape {
        /// 메모 모양 정보 / Memo shape information
        memo_shape: MemoShape,
    },
    /// 메모 리스트 헤더 / Memo list header
    MemoList {
        /// 메모 리스트 헤더 정보 / Memo list header information
        memo_list: MemoList,
    },
    /// 차트 데이터 / Chart data
    ChartData {
        /// 차트 데이터 정보 / Chart data information
        chart_data: ChartData,
    },
    /// 비디오 데이터 / Video data
    VideoData {
        /// 비디오 데이터 정보 / Video data information
        video_data: VideoData,
    },
    /// Unknown 개체 / Unknown shape component
    ShapeComponentUnknown {
        /// Unknown 개체 정보 / Unknown shape component information
        shape_component_unknown: ShapeComponentUnknown,
    },
    /// 기타 레코드 / Other records
    Other {
        /// Tag ID
        tag_id: WORD,
        /// Raw data
        data: Vec<u8>,
    },
}

/// ParaText의 텍스트/컨트롤 토큰 / ParaText token (text or control)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ParaTextRun {
    /// 일반 텍스트 조각 / Plain text chunk
    Text { text: String },
    /// 컨트롤 토큰(표/개체 등) / Control token (table/shape object etc.)
    Control {
        /// 원본 WCHAR 인덱스 위치 / Original WCHAR index position
        position: usize,
        /// 제어 문자 코드 (0-31) / Control character code (0-31)
        code: u8,
        /// 제어 문자 이름 / Control character name
        name: String,
        /// 원본에서 차지하는 WCHAR 길이 / Size in WCHAR units in original stream
        size_wchars: usize,
        /// 표시 텍스트(파생값) / Display text (derived value)
        ///
        /// - **Source of truth가 아님**: 원본 복원/Writer에서는 `runs`의 컨트롤 정보와 문서 설정으로 재계산해야 합니다.
        /// - 뷰어/프리뷰 용도로만 사용하며, 불일치 시 무시될 수 있습니다.
        #[serde(skip_serializing_if = "Option::is_none")]
        display_text: Option<String>,
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
    pub fn parse_data(data: &[u8], version: u32) -> Result<Vec<Paragraph>, HwpError> {
        // 먼저 레코드를 트리 구조로 파싱 / First parse records into tree structure
        let tree = RecordTreeNode::parse_tree(data)?;

        // 트리를 재귀적으로 방문하여 Paragraph 리스트로 변환 / Recursively visit tree to convert to Paragraph list
        let mut paragraphs = Vec::new();
        for child in tree.children() {
            if child.tag_id() == HwpTag::PARA_HEADER {
                paragraphs.push(
                    Self::parse_paragraph_from_tree(child, version, data)
                        .map_err(HwpError::from)?,
                );
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
    ) -> Result<Paragraph, HwpError> {
        Self::parse_paragraph_from_tree_internal(node, version, original_data, false)
    }

    /// 문단 헤더 노드와 그 자식들을 재귀적으로 처리합니다 (내부 함수).
    /// Recursively processes paragraph header node and its children (internal function).
    /// `is_inside_control_header`: 컨트롤 헤더 내부의 Paragraph인지 여부
    /// `is_inside_control_header`: Whether this paragraph is inside a control header
    fn parse_paragraph_from_tree_internal(
        node: &RecordTreeNode,
        version: u32,
        original_data: &[u8],
        is_inside_control_header: bool,
    ) -> Result<Paragraph, HwpError> {
        if node.tag_id() != HwpTag::PARA_HEADER {
            return Err(HwpError::UnexpectedValue {
                field: "Paragraph tag".to_string(),
                expected: format!("{}", HwpTag::PARA_HEADER),
                found: format!("{}", node.tag_id()),
            });
        }

        let para_header = ParaHeader::parse(node.data(), version).map_err(HwpError::from)?;
        let mut records = Vec::new();

        // 자식들을 처리 / Process children
        for child in node.children() {
            records.push(
                Self::parse_record_from_tree(child, version, original_data)
                    .map_err(HwpError::from)?,
            );
        }

        // 컨트롤 헤더 내부의 머리말/꼬리말/각주/미주 문단인 경우에만 ParaText 레코드 제거 (중복 방지, hwplib 방식)
        // Remove ParaText records only from header/footer/footnote/endnote paragraphs inside control headers (avoid duplication, hwplib approach)
        // hwplib: 컨트롤 헤더 내부의 Paragraph의 ParaText에는 ExtendChar만 포함되고, 실제 텍스트는 ControlHeader 내부의 ParagraphList에만 있음
        // hwplib: ParaText in paragraphs inside control headers only contains ExtendChar, actual text is only in ControlHeader's ParagraphList
        // 본문 Paragraph의 경우 ParaText에 참조 텍스트("각주참조" 등)가 포함되므로 제거하지 않음
        // For body paragraphs, ParaText contains reference text ("각주참조" etc.), so don't remove it
        if is_inside_control_header {
            let is_control_paragraph = records.iter().any(|record| {
                if let ParagraphRecord::CtrlHeader { header, .. } = record {
                    use crate::document::bodytext::CtrlId;
                    header.ctrl_id.as_str() == CtrlId::HEADER
                        || header.ctrl_id.as_str() == CtrlId::FOOTER
                        || header.ctrl_id.as_str() == CtrlId::FOOTNOTE
                        || header.ctrl_id.as_str() == CtrlId::ENDNOTE
                } else {
                    false
                }
            });

            if is_control_paragraph {
                // ParaText 레코드만 필터링 (다른 레코드는 유지)
                // Filter out only ParaText records (keep other records)
                let before_count = records.len();
                records.retain(|record| !matches!(record, ParagraphRecord::ParaText { .. }));
                let after_count = records.len();
                if before_count != after_count {
                    #[cfg(debug_assertions)]
                    eprintln!("[DEBUG] Removed {} ParaText records from control paragraph (is_inside_control_header={})", 
                        before_count - after_count, is_inside_control_header);
                }
            }
        } else {
            // 본문 Paragraph의 경우 ParaText 확인 (디버그)
            // Check ParaText in body paragraph (debug)
            let para_text_count = records
                .iter()
                .filter(|record| matches!(record, ParagraphRecord::ParaText { .. }))
                .count();
            if para_text_count > 0 {
                for record in &records {
                    if let ParagraphRecord::ParaText { text, .. } = record {
                        #[cfg(debug_assertions)]
                        eprintln!("[DEBUG] Body paragraph ParaText: {}", text);
                    }
                }
            }
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
    ) -> Result<ParagraphRecord, HwpError> {
        match node.tag_id() {
            HwpTag::PARA_TEXT => {
                let data = node.data();
                // pyhwp처럼 제어 문자를 찾고 텍스트만 추출 / Find control characters and extract only text like pyhwp
                let mut control_char_positions = Vec::new();
                let mut inline_control_params = Vec::new();
                let mut cleaned_text = String::new();
                let mut runs: Vec<ParaTextRun> = Vec::new();
                let mut idx = 0;

                while idx < data.len() {
                    // 제어 문자 찾기 (UTF-16LE 바이트 배열에서) / Find control character (in UTF-16LE byte array)
                    let mut found_control = false;
                    let mut control_code = 0u8;
                    let mut control_size = 0usize;

                    // 현재 위치에서 제어 문자 확인 (0-31 범위) / Check for control character at current position (range 0-31)
                    if idx + 1 < data.len() {
                        let code = data[idx] as u32;
                        // 제어 문자는 UTF-16LE에서 하위 바이트가 0-31이고 상위 바이트가 0인 경우 / Control character is when lower byte is 0-31 and upper byte is 0 in UTF-16LE
                        if code <= 31 && data[idx + 1] == 0 {
                            control_code = code as u8;
                            control_size = ControlChar::get_size_by_code(control_code) * 2; // WCHAR를 바이트로 변환 / Convert WCHAR to bytes
                            found_control = true;
                        }
                    }

                    if found_control {
                        // 제어 문자 위치 저장 (문자 인덱스 기준) / Store control character position (based on character index)
                        let char_idx = idx / 2; // UTF-16LE에서 문자 인덱스는 바이트 인덱스 / 2 / Character index in UTF-16LE is byte index / 2
                        let control_name = ControlChar::to_name(control_code);
                        control_char_positions.push(
                            crate::document::bodytext::control_char::ControlCharPosition {
                                position: char_idx,
                                code: control_code,
                                name: control_name.clone(),
                            },
                        );

                        runs.push(ParaTextRun::Control {
                            position: char_idx,
                            code: control_code,
                            name: control_name,
                            size_wchars: ControlChar::get_size_by_code(control_code),
                            display_text: None,
                        });

                        // INLINE 타입 제어 문자인 경우 파라미터 파싱 / Parse parameters for INLINE type control characters
                        if ControlChar::get_size_by_code(control_code) == 8
                            && matches!(
                                control_code,
                                ControlChar::FIELD_END
                                    | ControlChar::RESERVED_5_7_START..=ControlChar::RESERVED_5_7_END
                                    | ControlChar::TITLE_MARK
                                    | ControlChar::TAB
                                    | ControlChar::RESERVED_19_20_START..=ControlChar::RESERVED_19_20_END
                            )
                        {
                            // 제어 문자 코드(2 bytes) 이후의 파라미터(12 bytes) 파싱 / Parse parameter (12 bytes) after control character code (2 bytes)
                            if idx + 2 + 12 <= data.len() {
                                let param_data = &data[idx + 2..idx + 2 + 12];
                                if let Ok(param) =
                                    crate::document::bodytext::control_char::InlineControlParam::parse(control_code, param_data)
                                {
                                    inline_control_params.push((char_idx, param));
                                }
                            }
                        }

                        // 텍스트로 표현 가능한 제어 문자는 텍스트에 변환된 형태로 추가 / Add convertible control characters as converted text
                        // 단, PARA_BREAK와 LINE_BREAK는 control_char_positions에만 저장하고 텍스트에는 포함하지 않음
                        // However, PARA_BREAK and LINE_BREAK are only stored in control_char_positions, not added to text
                        if ControlChar::is_convertible(control_code) {
                            // PARA_BREAK와 LINE_BREAK는 텍스트에 추가하지 않음 (control_char_positions에만 저장)
                            // Don't add PARA_BREAK and LINE_BREAK to text (only store in control_char_positions)
                            if control_code != ControlChar::PARA_BREAK
                                && control_code != ControlChar::LINE_BREAK
                            {
                                if let Some(text_repr) = ControlChar::to_text(control_code) {
                                    cleaned_text.push_str(text_repr);
                                    runs.push(ParaTextRun::Text {
                                        text: text_repr.to_string(),
                                    });
                                }
                            }
                        }
                        // 제거해야 할 제어 문자는 텍스트에 추가하지 않음 / Don't add removable control characters to text

                        idx += control_size; // 제어 문자와 파라미터 건너뛰기 / Skip control character and parameters
                    } else {
                        // 텍스트 부분 디코딩 / Decode text portion
                        // 다음 제어 문자까지 또는 끝까지 / Until next control character or end
                        let mut text_end = idx;
                        while text_end < data.len() {
                            if text_end + 1 < data.len() {
                                let code = data[text_end] as u32;
                                if code <= 31 && data[text_end + 1] == 0 {
                                    break; // 제어 문자 발견 / Control character found
                                }
                            }
                            text_end += 2; // UTF-16LE는 2바이트 단위 / UTF-16LE is 2-byte units
                        }

                        if text_end > idx {
                            // 텍스트 부분 디코딩 / Decode text portion
                            let text_bytes = &data[idx..text_end];
                            if let Ok(text) = decode_utf16le(text_bytes) {
                                cleaned_text.push_str(&text);
                                if !text.is_empty() {
                                    runs.push(ParaTextRun::Text { text });
                                }
                            }
                            idx = text_end;
                        } else {
                            // 더 이상 처리할 데이터 없음 / No more data to process
                            break;
                        }
                    }
                }

                Ok(ParagraphRecord::ParaText {
                    text: cleaned_text,
                    runs,
                    control_char_positions,
                    inline_control_params,
                })
            }
            HwpTag::PARA_CHAR_SHAPE => {
                let para_char_shape =
                    ParaCharShape::parse(node.data()).map_err(HwpError::from)?;
                Ok(ParagraphRecord::ParaCharShape {
                    shapes: para_char_shape.shapes,
                })
            }
            HwpTag::PARA_LINE_SEG => {
                let para_line_seg =
                    ParaLineSeg::parse(node.data()).map_err(HwpError::from)?;
                Ok(ParagraphRecord::ParaLineSeg {
                    segments: para_line_seg.segments,
                })
            }
            HwpTag::PARA_RANGE_TAG => {
                let para_range_tag =
                    ParaRangeTag::parse(node.data()).map_err(HwpError::from)?;
                Ok(ParagraphRecord::ParaRangeTag {
                    tags: para_range_tag.tags,
                })
            }
            HwpTag::CTRL_HEADER => {
                let ctrl_header = CtrlHeader::parse(node.data()).map_err(HwpError::from)?;
                // 디버그: CTRL_HEADER 파싱 시작 / Debug: Start parsing CTRL_HEADER
                use crate::document::bodytext::ctrl_header::CtrlId;
                #[cfg(debug_assertions)]
                eprintln!(
                    "[DEBUG] Parsing CTRL_HEADER: ctrl_id={:?}, ctrl_id_value={}",
                    ctrl_header.ctrl_id, ctrl_header.ctrl_id_value
                );

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
                let is_table = ctrl_header.ctrl_id == CtrlId::TABLE
                    || ctrl_header.ctrl_id_value == 0x74626C20u32;

                let mut paragraphs = Vec::new();
                // libhwp 방식: TABLE 위치를 먼저 찾아서 TABLE 이후의 LIST_HEADER는 children에 추가하지 않음
                // libhwp approach: Find TABLE position first, then don't add LIST_HEADERs after TABLE to children
                let children_slice: Vec<_> = node.children().iter().collect();

                // TABLE 이전의 LIST_HEADER를 찾아서 캡션으로 파싱 / Find LIST_HEADER before TABLE and parse as caption
                // hwplib과 hwp-rs 방식: 별도 레코드로 캡션 처리 / hwplib and hwp-rs approach: process caption as separate record
                let mut caption_opt: Option<Caption> = None;
                // TABLE 위치 찾기 / Find TABLE position
                let table_index = if is_table {
                    children_slice
                        .iter()
                        .position(|child| child.tag_id() == HwpTag::TABLE)
                } else {
                    None
                };

                if is_table {
                    if let Some(table_idx) = table_index {
                        // TABLE 이전의 LIST_HEADER 찾기 / Find LIST_HEADER before TABLE
                        for child in children_slice.iter().take(table_idx) {
                            if child.tag_id() == HwpTag::LIST_HEADER {
                                // 캡션으로 파싱 / Parse as caption
                                use crate::document::bodytext::ctrl_header::parse_caption_from_list_header;
                                caption_opt = parse_caption_from_list_header(child.data())?;
                                break; // 첫 번째 LIST_HEADER만 캡션으로 처리 / Only process first LIST_HEADER as caption
                            }
                        }
                    }
                }

                // CTRL_HEADER가 LIST_HEADER를 가지고 있는지 먼저 확인 (머리말/꼬리말/각주/미주의 경우)
                // Check if CTRL_HEADER has LIST_HEADER first (for headers/footers/footnotes/endnotes)
                // PARA_HEADER 처리 전에 확인하여 중복 방지
                // Check before processing PARA_HEADER to avoid duplication
                let has_list_header = children_slice
                    .iter()
                    .any(|child| child.tag_id() == HwpTag::LIST_HEADER && !is_table);

                for (idx, child) in children_slice.iter().enumerate() {
                    if child.tag_id() == HwpTag::TABLE {
                        // TABLE은 별도로 처리 / TABLE is processed separately
                        let table_data =
                            Table::parse(child.data(), version).map_err(HwpError::from)?;
                        table_opt = Some(table_data);
                    } else if child.tag_id() == HwpTag::PARA_HEADER {
                        // CTRL_HEADER 내부의 PARA_HEADER를 Paragraph로 변환
                        // Convert PARA_HEADER inside CTRL_HEADER to Paragraph
                        //
                        // 원리: CTRL_HEADER 내부에는 LIST_HEADER와 PARA_HEADER가 모두 올 수 있음
                        // Principle: Both LIST_HEADER and PARA_HEADER can appear inside CTRL_HEADER
                        // 이 둘의 역할과 실제 텍스트 위치가 컨트롤 타입에 따라 다름
                        // Their roles and actual text locations differ depending on control type
                        //
                        // 머리말/꼬리말의 경우:
                        // For headers/footers:
                        // - LIST_HEADER가 있으면 실제 텍스트는 LIST_HEADER 내부의 paragraphs에 저장됨
                        //   If LIST_HEADER exists, actual text is stored in LIST_HEADER's internal paragraphs
                        // - PARA_HEADER의 ParaText는 ExtendChar(확장 문자)만 포함하고 실제 텍스트는 없음
                        //   PARA_HEADER's ParaText only contains ExtendChar (extended characters), no actual text
                        // - 따라서 LIST_HEADER가 있으면 PARA_HEADER를 추가하지 않아야 중복 방지
                        //   Therefore, if LIST_HEADER exists, don't add PARA_HEADER to avoid duplication
                        //
                        // 각주/미주의 경우:
                        // For footnotes/endnotes:
                        // - LIST_HEADER는 문단 리스트 헤더 정보만 포함 (paragraph_count, 속성 등)
                        //   LIST_HEADER only contains paragraph list header info (paragraph_count, attributes, etc.)
                        // - LIST_HEADER 내부의 ParaText는 자동 번호 템플릿("각주입니다." 등)만 포함 (AUTO_NUMBER 제어 문자 포함)
                        //   ParaText inside LIST_HEADER only contains auto-number template ("각주입니다." etc.) with AUTO_NUMBER control char
                        // - 실제 텍스트는 PARA_HEADER의 ParaText에 저장됨
                        //   Actual text is stored in PARA_HEADER's ParaText
                        // - 따라서 LIST_HEADER가 있어도 PARA_HEADER를 처리해야 실제 텍스트를 얻을 수 있음
                        //   Therefore, even if LIST_HEADER exists, process PARA_HEADER to get actual text
                        //
                        // is_inside_control_header=true로 전달하여:
                        // Pass is_inside_control_header=true to:
                        // - 컨트롤 헤더 내부의 Paragraph임을 표시
                        //   Indicate this is a paragraph inside a control header
                        // - parse_paragraph_from_tree_internal에서 중복 ParaText 제거 (ExtendChar만 있는 ParaText 제거)
                        //   Remove duplicate ParaText in parse_paragraph_from_tree_internal (remove ParaText containing only ExtendChar)
                        let is_header_footer = {
                            use crate::document::bodytext::ctrl_header::CtrlId;
                            ctrl_header.ctrl_id.as_str() == CtrlId::HEADER
                                || ctrl_header.ctrl_id.as_str() == CtrlId::FOOTER
                        };
                        if !has_list_header || !is_header_footer {
                            // 각주/미주는 LIST_HEADER가 있어도 PARA_HEADER 처리
                            // For footnotes/endnotes, process PARA_HEADER even if LIST_HEADER exists
                            let paragraph = Self::parse_paragraph_from_tree_internal(
                                child,
                                version,
                                original_data,
                                true, // 컨트롤 헤더 내부이므로 true / true because inside control header
                            )
                            .map_err(HwpError::from)?;
                            paragraphs.push(paragraph);
                        }
                    } else if child.tag_id() == HwpTag::LIST_HEADER && is_table {
                        // IMPORTANT:
                        // TABLE 이전에 오는 LIST_HEADER는 "캡션"으로 사용되며 셀 LIST_HEADER가 아닙니다.
                        // 이를 셀로도 처리하면 캡션 텍스트가 셀 내부와 ctrl_header paragraphs에 중복으로 나타납니다.
                        // 따라서 TABLE 이전 LIST_HEADER는 여기서 건너뜁니다.
                        if let Some(table_idx) = table_index {
                            if idx < table_idx {
                                continue;
                            }
                        }
                        // LIST_HEADER가 테이블의 셀인 경우 / LIST_HEADER is a table cell
                        // libhwp 방식: TABLE 이후의 LIST_HEADER는 children에 추가하지 않음
                        // libhwp approach: LIST_HEADERs after TABLE are not added to children
                        let list_header_record =
                            Self::parse_record_from_tree(child, version, original_data)
                                .map_err(HwpError::from)?;
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

                        // libhwp 방식: TABLE 이전/이후의 LIST_HEADER 모두 children에 추가하지 않음
                        // libhwp approach: Don't add LIST_HEADERs (before or after TABLE) to children
                        // TABLE 이전의 LIST_HEADER는 캡션으로 별도 처리되고,
                        // TABLE 이후의 LIST_HEADER는 셀로만 처리됨
                        // LIST_HEADERs before TABLE are processed as captions separately,
                        // and LIST_HEADERs after TABLE are only processed as cells
                        // children에 추가하지 않음 / Don't add to children

                        // LIST_HEADER 원시 데이터에서 CellAttributes 파싱 / Parse CellAttributes from LIST_HEADER raw data
                        // 레거시(pyhwp/hwp.js/hwplib)와 동일하게, 셀 LIST_HEADER는 선두 8바이트(paraCount + property)를 가진 후
                        // 바로 CellAttributes(표 80: 26바이트)가 이어지는 형태로 처리합니다.
                        // LIST_HEADER data structure: ListHeader + CellAttributes (26 bytes)
                        // 표 65: ListHeader는 INT16(2) + UINT32(4) = 6바이트 (문서 기준)
                        // 하지만 실제 구현에서는 UINT16 paragraphs + UINT16 unknown1 + UINT32 listflags = 8바이트
                        // pyhwp를 참고하면 TableCell은 ListHeader를 상속하고 추가 필드를 가짐
                        // pyhwp의 TableCell 구조:
                        //   - ListHeader: UINT16 paragraphs + UINT16 unknown1 + UINT32 listflags = 8바이트
                        //   - UINT16 col, UINT16 row, UINT16 colspan, UINT16 rowspan, ...
                        let cell_data = child.data();
                        let (row_addr, col_addr, cell_attrs_opt) = if cell_data.len() >= 34 {
                            // CellAttributes는 ListHeader(8바이트) 이후부터 시작
                            use crate::document::bodytext::table::CellAttributes;
                            use crate::types::{HWPUNIT, HWPUNIT16, UINT16, UINT32};
                            let offset = 8;
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
                        children.push(
                            Self::parse_record_from_tree(child, version, original_data)
                                .map_err(HwpError::from)?,
                        );
                    }
                }

                // TABLE이 있으면 LIST_HEADER를 셀로 연결 / If TABLE exists, connect LIST_HEADER as cells
                if let Some(ref mut table) = table_opt {
                    // table.cells가 비어있으면 LIST_HEADER에서 셀 생성 / Create cells from LIST_HEADER if table.cells is empty
                    if table.cells.is_empty() && !list_headers_for_table.is_empty() {
                        use crate::document::bodytext::list_header::ListHeader;
                        use crate::document::bodytext::table::{CellAttributes, TableCell};
                        use crate::types::{HWPUNIT, HWPUNIT16, UINT16, UINT32};

                        // IMPORTANT:
                        // 일부 파일(table-caption 등)에서 동일한 (row,col) LIST_HEADER가 두 번 잡히는 케이스가 있어
                        // 그대로 TableCell을 2번 생성하면 <div class="hce">도 2번 렌더링됩니다.
                        // 근본적으로는 "셀 생성의 단일 소스는 LIST_HEADER"이므로,
                        // 여기에서 LIST_HEADER 후보를 (row,col) 기준으로 먼저 정규화(dedupe)합니다.
                        // paragraphs가 있는 엔트리를 우선합니다.
                        if list_headers_for_table.len() > 1 {
                            use std::collections::BTreeMap;
                            let mut by_pos: BTreeMap<
                                (u16, u16),
                                (u16, u16, Vec<super::Paragraph>, Option<CellAttributes>),
                            > = BTreeMap::new();
                            for (row_addr, col_addr, paragraphs, cell_attrs_opt) in
                                list_headers_for_table.drain(..)
                            {
                                let key = (row_addr, col_addr);
                                match by_pos.get(&key) {
                                    None => {
                                        by_pos.insert(
                                            key,
                                            (row_addr, col_addr, paragraphs, cell_attrs_opt),
                                        );
                                    }
                                    Some((_, _, existing_paras, _)) => {
                                        // Prefer entry that actually has paragraphs.
                                        if existing_paras.is_empty() && !paragraphs.is_empty() {
                                            by_pos.insert(
                                                key,
                                                (row_addr, col_addr, paragraphs, cell_attrs_opt),
                                            );
                                        }
                                    }
                                }
                            }
                            list_headers_for_table = by_pos.into_values().collect();
                        }

                        // LIST_HEADER에서 셀 생성 / Create cells from LIST_HEADER
                        let row_count = table.attributes.row_count.into();
                        let col_count = table.attributes.col_count.into();

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
                                        if cell_data.len() >= 34 {
                                            let offset = 8;
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
                                        let offset = 8;
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
                                let cell_index = row_addr as usize
                                    * table.attributes.col_count as usize
                                    + col_addr as usize;
                                if cell_index < table.cells.len() {
                                    table.cells[cell_index].paragraphs = paragraphs.clone();
                                }
                            }
                        }
                    }

                    children.push(ParagraphRecord::Table {
                        table: table.clone(),
                    });
                }

                // 캡션을 CtrlHeader에 반영 / Apply caption to CtrlHeader
                let mut final_ctrl_header = ctrl_header;
                if let Some(caption) = caption_opt {
                    // CtrlHeaderData::ObjectCommon의 caption 필드 업데이트 / Update caption field in CtrlHeaderData::ObjectCommon
                    if let CtrlHeaderData::ObjectCommon {
                        attribute,
                        offset_y,
                        offset_x,
                        width,
                        height,
                        z_order,
                        margin,
                        instance_id,
                        page_divide,
                        description,
                        ..
                    } = &final_ctrl_header.data
                    {
                        final_ctrl_header.data = CtrlHeaderData::ObjectCommon {
                            attribute: attribute.clone(),
                            offset_y: *offset_y,
                            offset_x: *offset_x,
                            width: *width,
                            height: *height,
                            z_order: *z_order,
                            margin: margin.clone(),
                            instance_id: *instance_id,
                            page_divide: *page_divide,
                            description: description.clone(),
                            caption: Some(caption),
                        };
                    }
                }

                #[cfg(debug_assertions)]
                eprintln!(
                    "[DEBUG] CTRL_HEADER {:?}: Final - children_count={}, paragraphs_count={}, caption={:?}",
                    final_ctrl_header.ctrl_id,
                    children.len(),
                    paragraphs.len(),
                    if let CtrlHeaderData::ObjectCommon { caption, .. } = &final_ctrl_header.data {
                        caption.is_some()
                    } else {
                        false
                    }
                );

                Ok(ParagraphRecord::CtrlHeader {
                    header: final_ctrl_header,
                    children,
                    paragraphs,
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
                            paragraphs.push(
                                Self::parse_paragraph_from_tree(child, version, original_data)
                                    .map_err(HwpError::from)?,
                            );
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
                                                        header: child_header,
                                                        data: child_data.to_vec(),
                                                        children: Vec::new(),
                                                    };

                                                    let parsed_record =
                                                        Self::parse_record_from_tree(
                                                            &child_node,
                                                            version,
                                                            original_data,
                                                        )
                                                        .map_err(HwpError::from)?;
                                                    // 디버그: ListHeader 내부의 ParaText 확인 / Debug: Check ParaText inside ListHeader
                                                    if let ParagraphRecord::ParaText {
                                                        text, ..
                                                    } = &parsed_record
                                                    {
                                                        #[cfg(debug_assertions)]
                                                        eprintln!(
                                                            "[DEBUG] ListHeader ParaText: {}",
                                                            text
                                                        );
                                                    }
                                                    para_records.push(parsed_record);
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

                // SHAPE_COMPONENT의 children을 재귀적으로 처리
                // Recursively process SHAPE_COMPONENT's children
                // SHAPE_COMPONENT_PICTURE는 SHAPE_COMPONENT의 자식으로 올 수 있음
                // SHAPE_COMPONENT_PICTURE can be a child of SHAPE_COMPONENT
                // LIST_HEADER 다음에 PARA_HEADER가 올 수 있음 (글상자 텍스트)
                // PARA_HEADER can appear after LIST_HEADER (textbox text)
                // 레거시 참고: libhwp의 forTextBox, hwp-rs의 DrawText, pyhwp의 TextboxParagraphList
                // Reference: libhwp's forTextBox, hwp-rs's DrawText, pyhwp's TextboxParagraphList
                let mut children = Vec::new();
                let children_slice = node.children();
                let mut index = 0;

                while index < children_slice.len() {
                    let child = &children_slice[index];

                    if child.tag_id() == HwpTag::LIST_HEADER {
                        // LIST_HEADER 파싱 / Parse LIST_HEADER
                        let list_header_record =
                            Self::parse_record_from_tree(child, version, original_data)
                                .map_err(HwpError::from)?;

                        // LIST_HEADER 다음에 PARA_HEADER가 있는지 확인하고 처리
                        // Check if PARA_HEADER follows LIST_HEADER and process it
                        let mut list_header_with_paragraphs = list_header_record;
                        let mut para_headers_found = Vec::new();

                        // 다음 형제 노드들을 확인하여 PARA_HEADER들을 찾기
                        // Check following sibling nodes to find PARA_HEADERs
                        let mut next_index = index + 1;
                        while next_index < children_slice.len() {
                            let next_child = &children_slice[next_index];

                            if next_child.tag_id() == HwpTag::PARA_HEADER
                                && next_child.level() == child.level()
                            {
                                // PARA_HEADER를 Paragraph로 변환
                                // Convert PARA_HEADER to Paragraph
                                if let Ok(paragraph) = Self::parse_paragraph_from_tree(
                                    next_child,
                                    version,
                                    original_data,
                                ) {
                                    para_headers_found.push(paragraph);
                                    next_index += 1;
                                } else {
                                    break;
                                }
                            } else {
                                break;
                            }
                        }

                        // 찾은 PARA_HEADER들을 LIST_HEADER의 paragraphs에 추가
                        // Add found PARA_HEADERs to LIST_HEADER's paragraphs
                        if !para_headers_found.is_empty() {
                            if let ParagraphRecord::ListHeader {
                                header,
                                mut paragraphs,
                            } = list_header_with_paragraphs
                            {
                                paragraphs.extend(para_headers_found);
                                list_header_with_paragraphs =
                                    ParagraphRecord::ListHeader { header, paragraphs };

                                // 처리한 PARA_HEADER들만큼 index 건너뛰기
                                // Skip processed PARA_HEADERs
                                index = next_index;
                            } else {
                                index += 1;
                            }
                        } else {
                            index += 1;
                        }

                        children.push(list_header_with_paragraphs);
                    } else {
                        children.push(
                            Self::parse_record_from_tree(child, version, original_data)
                                .map_err(HwpError::from)?,
                        );
                        index += 1;
                    }
                }

                Ok(ParagraphRecord::ShapeComponent {
                    shape_component,
                    children,
                })
            }
            HwpTag::SHAPE_COMPONENT_LINE => {
                // 직선 개체 파싱 / Parse line shape component
                // 스펙 문서 매핑: 표 92 - 선 개체 속성 / Spec mapping: Table 92 - Line shape component attributes
                // 레거시 코드는 선 개체 속성 부분만 파싱하고 있습니다.
                // Legacy code only parses the line shape component attributes part.
                // 실제 파일 구조를 확인하여 필요시 수정이 필요할 수 있습니다.
                // Actual file structure may need to be verified and modified if necessary.
                // 참고: 현재 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_LINE 레코드가 없어 실제 파일로 테스트되지 않음
                // Note: Current test file (`noori.hwp`) does not contain SHAPE_COMPONENT_LINE records, so it has not been tested with actual files
                let shape_component_line = ShapeComponentLine::parse(node.data())?;
                Ok(ParagraphRecord::ShapeComponentLine {
                    shape_component_line,
                })
            }
            HwpTag::SHAPE_COMPONENT_RECTANGLE => {
                // 사각형 개체 파싱 / Parse rectangle shape component
                // 스펙 문서 매핑: 표 94 - 사각형 개체 속성 / Spec mapping: Table 94 - Rectangle shape component attributes
                // 레거시 코드는 사각형 개체 속성 부분만 파싱하고 있습니다.
                // Legacy code only parses the rectangle shape component attributes part.
                // 참고: 현재 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_RECTANGLE 레코드가 없어 실제 파일로 테스트되지 않음
                // Note: Current test file (`noori.hwp`) does not contain SHAPE_COMPONENT_RECTANGLE records, so it has not been tested with actual files
                let shape_component_rectangle = ShapeComponentRectangle::parse(node.data())?;
                Ok(ParagraphRecord::ShapeComponentRectangle {
                    shape_component_rectangle,
                })
            }
            HwpTag::SHAPE_COMPONENT_ELLIPSE => {
                // 타원 개체 파싱 / Parse ellipse shape component
                // 스펙 문서 매핑: 표 96 - 타원 개체 속성 / Spec mapping: Table 96 - Ellipse shape component attributes
                // 레거시 코드는 타원 개체 속성 부분만 파싱하고 있습니다.
                // Legacy code only parses the ellipse shape component attributes part.
                // 참고: 현재 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_ELLIPSE 레코드가 없어 실제 파일로 테스트되지 않음
                // Note: Current test file (`noori.hwp`) does not contain SHAPE_COMPONENT_ELLIPSE records, so it has not been tested with actual files
                let shape_component_ellipse = ShapeComponentEllipse::parse(node.data())?;
                Ok(ParagraphRecord::ShapeComponentEllipse {
                    shape_component_ellipse,
                })
            }
            HwpTag::SHAPE_COMPONENT_ARC => {
                // 호 개체 파싱 / Parse arc shape component
                // 스펙 문서 매핑: 표 101 - 호 개체 속성 / Spec mapping: Table 101 - Arc shape component attributes
                // 레거시 코드는 호 개체 속성 부분만 파싱하고 있습니다.
                // Legacy code only parses the arc shape component attributes part.
                // 참고: 현재 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_ARC 레코드가 없어 실제 파일로 테스트되지 않음
                // Note: Current test file (`noori.hwp`) does not contain SHAPE_COMPONENT_ARC records, so it has not been tested with actual files
                let shape_component_arc = ShapeComponentArc::parse(node.data())?;
                Ok(ParagraphRecord::ShapeComponentArc {
                    shape_component_arc,
                })
            }
            HwpTag::SHAPE_COMPONENT_POLYGON => {
                // 다각형 개체 파싱 / Parse polygon shape component
                // 스펙 문서 매핑: 표 99 - 다각형 개체 속성 / Spec mapping: Table 99 - Polygon shape component attributes
                // 레거시 코드는 다각형 개체 속성 부분만 파싱하고 있습니다.
                // Legacy code only parses the polygon shape component attributes part.
                // 참고: 현재 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_POLYGON 레코드가 없어 실제 파일로 테스트되지 않음
                // Note: Current test file (`noori.hwp`) does not contain SHAPE_COMPONENT_POLYGON records, so it has not been tested with actual files
                let shape_component_polygon = ShapeComponentPolygon::parse(node.data())?;
                Ok(ParagraphRecord::ShapeComponentPolygon {
                    shape_component_polygon,
                })
            }
            HwpTag::SHAPE_COMPONENT_CURVE => {
                // 곡선 개체 파싱 / Parse curve shape component
                // 스펙 문서 매핑: 표 103 - 곡선 개체 속성 / Spec mapping: Table 103 - Curve shape component attributes
                // 레거시 코드는 곡선 개체 속성 부분만 파싱하고 있습니다.
                // Legacy code only parses the curve shape component attributes part.
                // 참고: 현재 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_CURVE 레코드가 없어 실제 파일로 테스트되지 않음
                // Note: Current test file (`noori.hwp`) does not contain SHAPE_COMPONENT_CURVE records, so it has not been tested with actual files
                let shape_component_curve = ShapeComponentCurve::parse(node.data())?;
                Ok(ParagraphRecord::ShapeComponentCurve {
                    shape_component_curve,
                })
            }
            HwpTag::SHAPE_COMPONENT_OLE => {
                // OLE 개체 파싱 / Parse OLE shape component
                // 스펙 문서 매핑: 표 118 - OLE 개체 속성 / Spec mapping: Table 118 - OLE shape component attributes
                // 레거시 코드는 OLE 개체 속성을 파싱하지 않고 있습니다.
                // Legacy code does not parse OLE shape component attributes.
                // 참고: 현재 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_OLE 레코드가 없어 실제 파일로 테스트되지 않음
                // Note: Current test file (`noori.hwp`) does not contain SHAPE_COMPONENT_OLE records, so it has not been tested with actual files
                let shape_component_ole = ShapeComponentOle::parse(node.data())?;
                Ok(ParagraphRecord::ShapeComponentOle {
                    shape_component_ole,
                })
            }
            HwpTag::SHAPE_COMPONENT_PICTURE => {
                // 그림 개체 파싱 / Parse picture shape component
                // 스펙 문서 매핑: 표 107 - 그림 개체 속성 / Spec mapping: Table 107 - Picture shape component attributes
                // 레거시 코드는 그림 개체 속성의 일부만 파싱하고 있습니다.
                // Legacy code only parses part of picture shape component attributes.
                // 참고: 현재 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_PICTURE 레코드가 없어 실제 파일로 테스트되지 않음
                // Note: Current test file (`noori.hwp`) does not contain SHAPE_COMPONENT_PICTURE records, so it has not been tested with actual files
                let shape_component_picture = ShapeComponentPicture::parse(node.data())?;
                Ok(ParagraphRecord::ShapeComponentPicture {
                    shape_component_picture,
                })
            }
            HwpTag::SHAPE_COMPONENT_CONTAINER => {
                // 묶음 개체 파싱 / Parse container shape component
                // 스펙 문서 매핑: 표 121 - 묶음 개체 속성 / Spec mapping: Table 121 - Container shape component attributes
                // 레거시 코드는 묶음 개체 속성을 파싱하지 않고 있습니다.
                // Legacy code does not parse container shape component attributes.
                // 참고: 현재 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_CONTAINER 레코드가 없어 실제 파일로 테스트되지 않음
                // Note: Current test file (`noori.hwp`) does not contain SHAPE_COMPONENT_CONTAINER records, so it has not been tested with actual files
                let shape_component_container = ShapeComponentContainer::parse(node.data())?;
                Ok(ParagraphRecord::ShapeComponentContainer {
                    shape_component_container,
                })
            }
            HwpTag::CTRL_DATA => {
                // 컨트롤 임의의 데이터 파싱 / Parse control arbitrary data
                // 스펙 문서 매핑: 표 66 - 컨트롤 임의의 데이터 / Spec mapping: Table 66 - Control arbitrary data
                // Parameter Set 구조를 완전히 파싱합니다.
                // Fully parses Parameter Set structure.
                // 참고: 현재 테스트 파일(`noori.hwp`)에 CTRL_DATA 레코드가 없어 실제 파일로 테스트되지 않음
                // Note: Current test file (`noori.hwp`) does not contain CTRL_DATA records, so it has not been tested with actual files
                let ctrl_data = CtrlData::parse(node.data())?;
                Ok(ParagraphRecord::CtrlData { ctrl_data })
            }
            HwpTag::EQEDIT => {
                // 수식 개체 파싱 / Parse equation editor object
                // 스펙 문서 매핑: 표 105 - 수식 개체 속성 / Spec mapping: Table 105 - Equation editor object attributes
                // 레거시 코드는 수식 개체 속성의 일부만 파싱하고 있습니다.
                // Legacy code only parses part of equation editor object attributes.
                // 참고: 현재 테스트 파일(`noori.hwp`)에 EQEDIT 레코드가 없어 실제 파일로 테스트되지 않음
                // Note: Current test file (`noori.hwp`) does not contain EQEDIT records, so it has not been tested with actual files
                let eqedit = EqEdit::parse(node.data())?;
                Ok(ParagraphRecord::EqEdit { eqedit })
            }
            HwpTag::SHAPE_COMPONENT_TEXTART => {
                // 글맵시 개체 파싱 / Parse text art shape component
                // 스펙 문서에 상세 구조가 명시되어 있지 않으므로 raw 데이터로 저장합니다.
                // Raw data is stored because the spec document does not specify detailed structure.
                // 참고: 현재 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_TEXTART 레코드가 없어 실제 파일로 테스트되지 않음
                // Note: Current test file (`noori.hwp`) does not contain SHAPE_COMPONENT_TEXTART records, so it has not been tested with actual files
                let shape_component_textart = ShapeComponentTextArt::parse(node.data())?;
                Ok(ParagraphRecord::ShapeComponentTextArt {
                    shape_component_textart,
                })
            }
            HwpTag::FORM_OBJECT => {
                // 양식 개체 파싱 / Parse form object
                // 스펙 문서에 상세 구조가 명시되어 있지 않으므로 raw 데이터로 저장합니다.
                // Raw data is stored because the spec document does not specify detailed structure.
                // 참고: 현재 테스트 파일(`noori.hwp`)에 FORM_OBJECT 레코드가 없어 실제 파일로 테스트되지 않음
                // Note: Current test file (`noori.hwp`) does not contain FORM_OBJECT records, so it has not been tested with actual files
                let form_object = FormObject::parse(node.data())?;
                Ok(ParagraphRecord::FormObject { form_object })
            }
            HwpTag::MEMO_SHAPE => {
                // 메모 모양 파싱 / Parse memo shape
                // 스펙 문서에 상세 구조가 명시되어 있지 않으므로 raw 데이터로 저장합니다.
                // Raw data is stored because the spec document does not specify detailed structure.
                // 참고: 현재 테스트 파일(`noori.hwp`)에 MEMO_SHAPE 레코드가 없어 실제 파일로 테스트되지 않음
                // Note: Current test file (`noori.hwp`) does not contain MEMO_SHAPE records, so it has not been tested with actual files
                let memo_shape = MemoShape::parse(node.data())?;
                Ok(ParagraphRecord::MemoShape { memo_shape })
            }
            HwpTag::MEMO_LIST => {
                // 메모 리스트 헤더 파싱 / Parse memo list header
                // 스펙 문서에 상세 구조가 명시되어 있지 않으므로 raw 데이터로 저장합니다.
                // Raw data is stored because the spec document does not specify detailed structure.
                // 참고: 현재 테스트 파일(`noori.hwp`)에 MEMO_LIST 레코드가 없어 실제 파일로 테스트되지 않음
                // Note: Current test file (`noori.hwp`) does not contain MEMO_LIST records, so it has not been tested with actual files
                let memo_list = MemoList::parse(node.data())?;
                Ok(ParagraphRecord::MemoList { memo_list })
            }
            HwpTag::CHART_DATA => {
                // 차트 데이터 파싱 / Parse chart data
                // 스펙 문서에 상세 구조가 명시되어 있지 않으므로 raw 데이터로 저장합니다.
                // Raw data is stored because the spec document does not specify detailed structure.
                // 참고: 현재 테스트 파일(`noori.hwp`)에 CHART_DATA 레코드가 없어 실제 파일로 테스트되지 않음
                // Note: Current test file (`noori.hwp`) does not contain CHART_DATA records, so it has not been tested with actual files
                let chart_data = ChartData::parse(node.data())?;
                Ok(ParagraphRecord::ChartData { chart_data })
            }
            HwpTag::VIDEO_DATA => {
                // 비디오 데이터 파싱 / Parse video data
                // 스펙 문서 매핑: 표 123 - 동영상 개체 속성 / Spec mapping: Table 123 - Video object attributes
                // 레거시 코드는 동영상 개체 속성을 파싱하지 않고 있습니다.
                // Legacy code does not parse video object attributes.
                // 참고: 현재 테스트 파일(`noori.hwp`)에 VIDEO_DATA 레코드가 없어 실제 파일로 테스트되지 않음
                // Note: Current test file (`noori.hwp`) does not contain VIDEO_DATA records, so it has not been tested with actual files
                let video_data = VideoData::parse(node.data())?;
                Ok(ParagraphRecord::VideoData { video_data })
            }
            HwpTag::SHAPE_COMPONENT_UNKNOWN => {
                // Unknown 개체 파싱 / Parse unknown shape component
                // 스펙 문서에 상세 구조가 명시되어 있지 않으므로 raw 데이터로 저장합니다.
                // Raw data is stored because the spec document does not specify detailed structure.
                // 참고: 현재 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_UNKNOWN 레코드가 없어 실제 파일로 테스트되지 않음
                // Note: Current test file (`noori.hwp`) does not contain SHAPE_COMPONENT_UNKNOWN records, so it has not been tested with actual files
                let shape_component_unknown = ShapeComponentUnknown::parse(node.data())?;
                Ok(ParagraphRecord::ShapeComponentUnknown {
                    shape_component_unknown,
                })
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
    ) -> Result<Self, HwpError> {
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
                    let paragraphs = Section::parse_data(&section_data, file_header.version)
                        .map_err(HwpError::from)?;

                    sections.push(Section {
                        index: i,
                        paragraphs,
                    });
                }
                Err(e) => {
                    // 스트림이 없으면 경고만 출력하고 계속 진행 / If stream doesn't exist, just warn and continue
                    #[cfg(debug_assertions)]
                    eprintln!("Warning: Could not read BodyText/{}: {}", stream_name, e);
                }
            }
        }

        Ok(BodyText { sections })
    }
}
