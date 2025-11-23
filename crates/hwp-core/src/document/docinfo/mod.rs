/// DocInfo parsing module
///
/// This module handles parsing of HWP DocInfo stream.
/// 
/// 스펙 문서 매핑: 표 2 - 문서 정보 (DocInfo 스트림)

use serde::{Deserialize, Serialize};

/// Document information structure
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DocInfo {
    /// Document properties
    pub document_properties: Option<Vec<u8>>,
    /// ID mappings
    pub id_mappings: Option<Vec<u8>>,
    /// Binary data list
    pub bin_data: Vec<Vec<u8>>,
    /// Face names (fonts)
    pub face_names: Vec<Vec<u8>>,
    /// Border/fill information
    pub border_fill: Vec<Vec<u8>>,
    /// Character shapes
    pub char_shapes: Vec<Vec<u8>>,
    /// Tab definitions
    pub tab_defs: Vec<Vec<u8>>,
    /// Numbering information
    pub numbering: Vec<Vec<u8>>,
    /// Bullet information
    pub bullets: Vec<Vec<u8>>,
    /// Paragraph shapes
    pub para_shapes: Vec<Vec<u8>>,
    /// Styles
    pub styles: Vec<Vec<u8>>,
}

