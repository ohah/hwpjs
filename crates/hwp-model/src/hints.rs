use serde::{Deserialize, Serialize};

/// HWP 5.0 roundtrip용 문서 힌트
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HwpDocumentHints {
    #[serde(skip)]
    pub file_header_raw: Vec<u8>,
    pub version: (u8, u8, u8, u8),
    pub compressed: bool,
    #[serde(skip)]
    pub scripts: Option<Vec<u8>>,
    #[serde(skip)]
    pub preview_image: Option<Vec<u8>>,
    pub caret_list_id: Option<u32>,
    pub caret_para_id: Option<u32>,
    pub caret_char_pos: Option<u32>,
}

/// HWP 5.0 roundtrip용 섹션 힌트
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HwpSectionHints {
    pub language_id: Option<u16>,
    pub master_page_width: Option<u32>,
    pub master_page_height: Option<u32>,
    pub master_page_text_ref: Option<u8>,
    pub master_page_num_ref: Option<u8>,
}

/// HWP 5.0 roundtrip용 문단 힌트
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HwpParagraphHints {
    pub line_segments: Vec<LineSegmentInfo>,
    pub control_mask: u32,
    #[serde(skip)]
    pub range_tags_raw: Vec<u8>,
    pub tail_shape: Option<u8>,
}

/// ParaLineSeg 보존 (HWP 5.0 레이아웃 캐시)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LineSegmentInfo {
    pub text_start_pos: u32,
    pub vertical_pos: i32,
    pub line_height: i32,
    pub text_height: i32,
    pub baseline_distance: i32,
    pub line_spacing: i32,
    pub column_start_pos: i32,
    pub segment_width: i32,
    pub flags: u32,
}

/// HWPX roundtrip용 문서 힌트
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HwpxDocumentHints {
    pub xml_version: Option<String>,
    pub app_version: Option<String>,
    pub extra_manifest_entries: Vec<ManifestEntry>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ManifestEntry {
    pub id: String,
    pub href: String,
    pub media_type: String,
}
