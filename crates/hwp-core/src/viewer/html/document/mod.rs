/// Document-level HTML conversion
/// 문서 레벨의 HTML 변환
///
/// HWP 문서의 각 부분(bodytext, docinfo, fileheader 등)을 HTML로 변환하는 모듈
/// Module for converting each part of HWP document (bodytext, docinfo, fileheader, etc.) to HTML
pub mod bodytext;
mod docinfo;
mod fileheader;

pub use bodytext::convert_bodytext_to_html;

