/// DocInfo parsing module
///
/// This module handles parsing of HWP DocInfo stream.
///
/// 스펙 문서 매핑: 표 2 - 문서 정보 (DocInfo 스트림) / Spec mapping: Table 2 - Document information (DocInfo stream)
mod border_fill;
mod char_shape;
mod constants;
mod document_properties;
mod face_name;
mod id_mappings;
mod numbering;
mod tab_def;

use crate::decompress::decompress_deflate;
use crate::document::fileheader::FileHeader;
use crate::types::RecordHeader;
pub use border_fill::BorderFill;
pub use char_shape::CharShape;
use constants::*;
pub use document_properties::DocumentProperties;
pub use face_name::FaceName;
pub use id_mappings::IdMappings;
pub use numbering::Numbering;
use serde::{Deserialize, Serialize};
pub use tab_def::TabDef;

/// Document information structure
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DocInfo {
    /// Document properties (parsed)
    pub document_properties: Option<DocumentProperties>,
    /// ID mappings (parsed)
    pub id_mappings: Option<IdMappings>,
    /// Binary data list (excluded from JSON serialization) / 바이너리 데이터 리스트 (JSON 직렬화에서 제외)
    #[serde(skip)]
    pub bin_data: Vec<Vec<u8>>,
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
    /// Bullet information
    pub bullets: Vec<Vec<u8>>,
    /// Paragraph shapes
    pub para_shapes: Vec<Vec<u8>>,
    /// Styles
    pub styles: Vec<Vec<u8>>,
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
    pub fn parse(stream_data: &[u8], file_header: &FileHeader) -> Result<Self, String> {
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
            let (header, header_size) = RecordHeader::parse(remaining_data)?;
            offset += header_size;

            // 데이터 영역 읽기 / Read data area
            let data_size = header.size as usize;
            if offset + data_size > decompressed_data.len() {
                return Err(format!(
                    "Record data extends beyond stream: offset={}, size={}, stream_len={}",
                    offset,
                    data_size,
                    decompressed_data.len()
                ));
            }

            let record_data = &decompressed_data[offset..offset + data_size];
            offset += data_size;

            // 태그별로 분류하여 저장 / Classify and store by tag
            match header.tag_id {
                HWPTAG_DOCUMENT_PROPERTIES => {
                    if header.level == 0 {
                        // DocumentProperties는 완전히 파싱 / Fully parse DocumentProperties
                        let props = DocumentProperties::parse(record_data)?;
                        doc_info.document_properties = Some(props);
                    }
                }
                HWPTAG_ID_MAPPINGS => {
                    if header.level == 0 {
                        // IdMappings는 완전히 파싱 / Fully parse IdMappings
                        let id_mappings = IdMappings::parse(record_data, file_header.version)?;
                        doc_info.id_mappings = Some(id_mappings);
                    }
                }
                HWPTAG_BIN_DATA => {
                    if header.level == 1 {
                        doc_info.bin_data.push(record_data.to_vec());
                    }
                }
                HWPTAG_FACE_NAME => {
                    if header.level == 1 {
                        // FaceName은 완전히 파싱 / Fully parse FaceName
                        let face_name = FaceName::parse(record_data)?;
                        doc_info.face_names.push(face_name);
                    }
                }
                HWPTAG_BORDER_FILL => {
                    if header.level == 1 {
                        // BorderFill은 완전히 파싱 / Fully parse BorderFill
                        let border_fill = BorderFill::parse(record_data)?;
                        doc_info.border_fill.push(border_fill);
                    }
                }
                HWPTAG_CHAR_SHAPE => {
                    if header.level == 1 {
                        // CharShape는 완전히 파싱 / Fully parse CharShape
                        let char_shape = CharShape::parse(record_data, file_header.version)?;
                        doc_info.char_shapes.push(char_shape);
                    }
                }
                HWPTAG_TAB_DEF => {
                    if header.level == 1 {
                        // TabDef는 완전히 파싱 / Fully parse TabDef
                        let tab_def = TabDef::parse(record_data)?;
                        doc_info.tab_defs.push(tab_def);
                    }
                }
                HWPTAG_NUMBERING => {
                    if header.level == 1 {
                        // Numbering은 완전히 파싱 / Fully parse Numbering
                        let numbering = Numbering::parse(record_data, file_header.version)?;
                        doc_info.numbering.push(numbering);
                    }
                }
                HWPTAG_BULLET => {
                    if header.level == 1 {
                        doc_info.bullets.push(record_data.to_vec());
                    }
                }
                HWPTAG_PARA_SHAPE => {
                    if header.level == 1 {
                        doc_info.para_shapes.push(record_data.to_vec());
                    }
                }
                HWPTAG_STYLE => {
                    if header.level == 1 {
                        doc_info.styles.push(record_data.to_vec());
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
