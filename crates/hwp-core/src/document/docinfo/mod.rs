/// DocInfo parsing module
///
/// This module handles parsing of HWP DocInfo stream.
///
/// 스펙 문서 매핑: 표 2 - 문서 정보 (DocInfo 스트림) / Spec mapping: Table 2 - Document information (DocInfo stream)
pub mod bin_data;
pub mod border_fill;
pub mod bullet;
pub mod char_shape;
pub mod compatible_document;
pub mod constants;
pub mod distribute_doc_data;
pub mod doc_data;
pub mod document_properties;
pub mod face_name;
pub mod forbidden_char;
pub mod id_mappings;
pub mod layout_compatibility;
pub mod memo_shape;
pub mod numbering;
pub mod para_shape;
pub mod style;
pub mod tab_def;
pub mod track_change;
pub mod track_change_author;
pub mod track_change_content;

pub use crate::decompress::decompress_deflate;
pub use crate::document::fileheader::FileHeader;
pub use crate::error::HwpError;
pub use crate::types::RecordHeader;
pub use bin_data::BinDataRecord;
pub use border_fill::{BorderFill, FillInfo};
pub use bullet::Bullet;
pub use char_shape::CharShape;
pub use compatible_document::CompatibleDocument;
pub use constants::HwpTag;
pub use distribute_doc_data::DistributeDocData;
pub use doc_data::{DocData, ParameterSet};
pub use document_properties::DocumentProperties;
pub use face_name::FaceName;
pub use forbidden_char::ForbiddenChar;
pub use id_mappings::IdMappings;
pub use layout_compatibility::LayoutCompatibility;
pub use memo_shape::MemoShape;
pub use numbering::Numbering;
pub use para_shape::{HeaderShapeType, ParaShape};
use serde::{Deserialize, Serialize};
pub use style::Style;
pub use tab_def::TabDef;
pub use track_change::TrackChange;
pub use track_change_author::TrackChangeAuthor;
pub use track_change_content::TrackChangeContent;

/// Document information structure
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DocInfo {
    /// Document properties (parsed)
    pub document_properties: Option<DocumentProperties>,
    /// ID mappings (parsed)
    pub id_mappings: Option<IdMappings>,
    /// Binary data records (parsed) / 바이너리 데이터 레코드 (파싱됨)
    pub bin_data: Vec<BinDataRecord>,
    /// Face names (fonts) (parsed) / 글꼴 목록 (파싱됨)
    pub face_names: Vec<FaceName>,
    /// Border/fill information (parsed) / 테두리/배경 정보 (파싱됨)
    pub border_fill: Vec<BorderFill>,
    /// Character shapes (parsed) / 글자 모양 (파싱됨)
    pub char_shapes: Vec<CharShape>,
    /// Tab definitions (parsed) / 탭 정의 (파싱됨)
    pub tab_defs: Vec<TabDef>,
    /// Numbering information (parsed) / 문단 번호 정보 (파싱됨)
    pub numbering: Vec<Numbering>,
    /// Bullet information (parsed) / 글머리표 정보 (파싱됨)
    pub bullets: Vec<Bullet>,
    /// Paragraph shapes (parsed) / 문단 모양 (파싱됨)
    pub para_shapes: Vec<ParaShape>,
    /// Styles (parsed) / 스타일 (파싱됨)
    pub styles: Vec<Style>,
    /// Document arbitrary data (parsed) / 문서 임의의 데이터 (파싱됨)
    pub doc_data: Vec<DocData>,
    /// Distribution document data (parsed) / 배포용 문서 데이터 (파싱됨)
    pub distribute_doc_data: Option<DistributeDocData>,
    /// Compatible document (parsed) / 호환 문서 (파싱됨)
    pub compatible_document: Option<CompatibleDocument>,
    /// Layout compatibility (parsed) / 레이아웃 호환성 (파싱됨)
    pub layout_compatibility: Option<LayoutCompatibility>,
    /// Track change information (parsed) / 변경 추적 정보 (파싱됨)
    pub track_change: Option<TrackChange>,
    /// Memo shapes (parsed) / 메모 모양 (파싱됨)
    pub memo_shapes: Vec<MemoShape>,
    /// Forbidden characters (parsed) / 금칙처리 문자 (파싱됨)
    pub forbidden_chars: Vec<ForbiddenChar>,
    /// Track change contents (parsed) / 변경 추적 내용 및 모양 (파싱됨)
    pub track_change_contents: Vec<TrackChangeContent>,
    /// Track change authors (parsed) / 변경 추적 작성자 (파싱됨)
    pub track_change_authors: Vec<TrackChangeAuthor>,
}

impl DocInfo {
    /// DocInfo 스트림을 파싱합니다. / Parse DocInfo stream.
    ///
    /// # Arguments
    /// * `stream_data` - DocInfo 스트림의 원시 바이트 데이터 / Raw byte data of DocInfo stream
    /// * `file_header` - FileHeader (압축 여부 확인용) / FileHeader (to check compression)
    ///
    /// # Returns
    /// 파싱된 DocInfo 구조체 / Parsed DocInfo structure
    pub fn parse(stream_data: &[u8], file_header: &FileHeader) -> Result<Self, HwpError> {
        // 압축 해제 (필요한 경우) / Decompress if needed
        // HWP DocInfo uses raw deflate format (windowBits: -15), not zlib
        let decompressed_data = if file_header.is_compressed() {
            decompress_deflate(stream_data)?
        } else {
            stream_data.to_vec()
        };

        let mut doc_info = DocInfo::default();
        let mut offset = 0;

        // 레코드 단위로 파싱 / Parse record by record
        while offset < decompressed_data.len() {
            // 레코드 헤더 파싱 / Parse record header
            let remaining_data = &decompressed_data[offset..];
            let (header, header_size) =
                RecordHeader::parse(remaining_data).map_err(|e| HwpError::from(e))?;
            offset += header_size;

            // 데이터 영역 읽기 / Read data area
            let data_size = header.size as usize;
            if offset + data_size > decompressed_data.len() {
                return Err(HwpError::InsufficientData {
                    field: format!("DocInfo record at offset {}", offset),
                    expected: offset + data_size,
                    actual: decompressed_data.len(),
                });
            }

            let record_data = &decompressed_data[offset..offset + data_size];
            offset += data_size;

            // 태그별로 분류하여 저장 / Classify and store by tag
            match header.tag_id {
                HwpTag::DOCUMENT_PROPERTIES => {
                    if header.level == 0 {
                        // DocumentProperties는 완전히 파싱 / Fully parse DocumentProperties
                        let props = DocumentProperties::parse(record_data)
                            .map_err(|e| HwpError::from(e))?;
                        doc_info.document_properties = Some(props);
                    }
                }
                HwpTag::ID_MAPPINGS => {
                    if header.level == 0 {
                        // IdMappings는 완전히 파싱 / Fully parse IdMappings
                        let id_mappings = IdMappings::parse(record_data, file_header.version)
                            .map_err(|e| HwpError::from(e))?;
                        doc_info.id_mappings = Some(id_mappings);
                    }
                }
                HwpTag::BIN_DATA => {
                    if header.level == 1 {
                        // BinDataRecord는 완전히 파싱 / Fully parse BinDataRecord
                        let bin_data_record =
                            BinDataRecord::parse(record_data).map_err(|e| HwpError::from(e))?;
                        doc_info.bin_data.push(bin_data_record);
                    }
                }
                HwpTag::FACE_NAME => {
                    if header.level == 1 {
                        // FaceName은 완전히 파싱 / Fully parse FaceName
                        let face_name =
                            FaceName::parse(record_data).map_err(|e| HwpError::from(e))?;
                        doc_info.face_names.push(face_name);
                    }
                }
                HwpTag::BORDER_FILL => {
                    if header.level == 1 {
                        // BorderFill은 완전히 파싱 / Fully parse BorderFill
                        let border_fill =
                            BorderFill::parse(record_data).map_err(|e| HwpError::from(e))?;
                        doc_info.border_fill.push(border_fill);
                    }
                }
                HwpTag::CHAR_SHAPE => {
                    if header.level == 1 {
                        // CharShape는 완전히 파싱 / Fully parse CharShape
                        let char_shape = CharShape::parse(record_data, file_header.version)
                            .map_err(|e| HwpError::from(e))?;
                        doc_info.char_shapes.push(char_shape);
                    }
                }
                HwpTag::TAB_DEF => {
                    if header.level == 1 {
                        // TabDef는 완전히 파싱 / Fully parse TabDef
                        let tab_def = TabDef::parse(record_data).map_err(|e| HwpError::from(e))?;
                        doc_info.tab_defs.push(tab_def);
                    }
                }
                HwpTag::NUMBERING => {
                    if header.level == 1 {
                        // Numbering은 완전히 파싱 / Fully parse Numbering
                        let numbering = Numbering::parse(record_data, file_header.version)
                            .map_err(|e| HwpError::from(e))?;
                        doc_info.numbering.push(numbering);
                    }
                }
                HwpTag::BULLET => {
                    if header.level == 1 {
                        // Bullet은 완전히 파싱 / Fully parse Bullet
                        let bullet = Bullet::parse(record_data).map_err(|e| HwpError::from(e))?;
                        doc_info.bullets.push(bullet);
                    }
                }
                HwpTag::PARA_SHAPE => {
                    if header.level == 1 {
                        // ParaShape은 완전히 파싱 / Fully parse ParaShape
                        let para_shape = ParaShape::parse(record_data, file_header.version)
                            .map_err(|e| HwpError::from(e))?;
                        doc_info.para_shapes.push(para_shape);
                    }
                }
                HwpTag::STYLE => {
                    if header.level == 1 {
                        let style = Style::parse(record_data).map_err(|e| HwpError::from(e))?;
                        doc_info.styles.push(style);
                    }
                }
                HwpTag::DOC_DATA => {
                    if header.level == 0 {
                        // 문서 임의의 데이터 파싱 / Parse document arbitrary data
                        let doc_data =
                            DocData::parse(record_data).map_err(|e| HwpError::from(e))?;
                        doc_info.doc_data.push(doc_data);
                    }
                }
                HwpTag::DISTRIBUTE_DOC_DATA => {
                    if header.level == 0 {
                        // 배포용 문서 데이터 파싱 / Parse distribution document data
                        let distribute_doc_data =
                            DistributeDocData::parse(record_data).map_err(|e| HwpError::from(e))?;
                        doc_info.distribute_doc_data = Some(distribute_doc_data);
                    }
                }
                HwpTag::COMPATIBLE_DOCUMENT => {
                    if header.level == 0 {
                        // 호환 문서 파싱 / Parse compatible document
                        let compatible_document = CompatibleDocument::parse(record_data)
                            .map_err(|e| HwpError::from(e))?;
                        doc_info.compatible_document = Some(compatible_document);
                    }
                }
                HwpTag::LAYOUT_COMPATIBILITY => {
                    if header.level == 1 {
                        // 레이아웃 호환성 파싱 / Parse layout compatibility
                        let layout_compatibility = LayoutCompatibility::parse(record_data)
                            .map_err(|e| HwpError::from(e))?;
                        doc_info.layout_compatibility = Some(layout_compatibility);
                    }
                }
                HwpTag::TRACKCHANGE => {
                    if header.level == 1 {
                        // 변경 추적 정보 파싱 / Parse track change information
                        let track_change =
                            TrackChange::parse(record_data).map_err(|e| HwpError::from(e))?;
                        doc_info.track_change = Some(track_change);
                    }
                }
                HwpTag::MEMO_SHAPE => {
                    if header.level == 1 {
                        // 메모 모양 파싱 / Parse memo shape
                        let memo_shape =
                            MemoShape::parse(record_data).map_err(|e| HwpError::from(e))?;
                        doc_info.memo_shapes.push(memo_shape);
                    }
                }
                HwpTag::FORBIDDEN_CHAR => {
                    if header.level == 0 {
                        // 금칙처리 문자 파싱 / Parse forbidden character
                        let forbidden_char =
                            ForbiddenChar::parse(record_data).map_err(|e| HwpError::from(e))?;
                        doc_info.forbidden_chars.push(forbidden_char);
                    }
                }
                HwpTag::TRACK_CHANGE => {
                    if header.level == 1 {
                        // 변경 추적 내용 및 모양 파싱 / Parse track change content and shape
                        let track_change_content = TrackChangeContent::parse(record_data)
                            .map_err(|e| HwpError::from(e))?;
                        doc_info.track_change_contents.push(track_change_content);
                    }
                }
                HwpTag::TRACK_CHANGE_AUTHOR => {
                    if header.level == 1 {
                        // 변경 추적 작성자 파싱 / Parse track change author
                        let track_change_author =
                            TrackChangeAuthor::parse(record_data).map_err(|e| HwpError::from(e))?;
                        doc_info.track_change_authors.push(track_change_author);
                    }
                }
                // 기타 태그는 무시 (나중에 구현 가능) / Other tags are ignored (can be implemented later)
                _ => {
                    // 알 수 없는 태그는 무시하고 계속 진행 / Unknown tags are ignored and continue
                }
            }
        }

        Ok(doc_info)
    }
}
