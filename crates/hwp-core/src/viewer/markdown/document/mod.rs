/// Document-level markdown conversion
/// 문서 레벨의 마크다운 변환
///
/// HWP 문서의 각 부분(bodytext, docinfo, fileheader 등)을 마크다운으로 변환하는 모듈
/// Module for converting each part of HWP document (bodytext, docinfo, fileheader, etc.) to markdown
pub mod bodytext;
mod docinfo;
pub mod fileheader;

pub use bodytext::convert_bodytext_to_markdown;
pub use docinfo::extract_page_info;
pub use fileheader::format_version;
