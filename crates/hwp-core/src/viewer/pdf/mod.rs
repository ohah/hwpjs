//! PDF converter for HWP documents
//! HWP 문서를 PDF로 변환하는 모듈
//!
//! printpdf 기반 좌표 렌더링으로 CharShape 스타일, 페이지 설정, 테이블 테두리, 이미지 배치를 지원한다.

mod document;
mod font;
mod page;
mod pdf_image;
mod styles;
mod table;
mod text;

use crate::document::bodytext::ParagraphRecord;
use crate::document::HwpDocument;

/// PDF 변환 옵션
#[derive(Debug, Clone)]
pub struct PdfOptions {
    /// 기본 폰트으로 사용할 TTF/OTF가 있는 디렉터리 경로. None이면 기본 폰트 사용.
    /// **보안**: 신뢰할 수 있는 경로만 지정하세요. 사용자 입력을 그대로 사용하지 마세요.
    pub font_dir: Option<std::path::PathBuf>,
    /// 이미지 임베드 여부 (기본 true)
    pub embed_images: bool,
}

impl Default for PdfOptions {
    fn default() -> Self {
        Self {
            font_dir: None,
            embed_images: true,
        }
    }
}

/// PDF로 출력될 요소들의 텍스트 요약. 스냅샷 테스트용 (폰트 불필요).
/// CtrlHeader/ShapeComponent 내부를 재귀 순회하여 테이블·이미지 포함.
pub fn pdf_content_summary(document: &HwpDocument, options: &PdfOptions) -> Vec<String> {
    let mut lines = Vec::new();
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            collect_summary_records(&paragraph.records, document, options, &mut lines);
        }
    }
    if lines.is_empty() {
        lines.push("(empty)".to_string());
    }
    lines
}

/// 스타일 정보 포함 요약. 스냅샷 테스트용 (폰트 불필요).
pub fn pdf_styled_summary(document: &HwpDocument, options: &PdfOptions) -> Vec<String> {
    document::collect_styled_summary(document, options)
}

/// HWP 문서를 PDF 바이트로 변환
pub fn to_pdf(document: &HwpDocument, options: &PdfOptions) -> Vec<u8> {
    document::render_document(document, options)
}

/// 레코드 목록을 재귀 순회하며 요약 라인만 수집 (기존 호환)
fn collect_summary_records(
    records: &[ParagraphRecord],
    _document: &HwpDocument,
    options: &PdfOptions,
    lines: &mut Vec<String>,
) {
    const TRUNCATE: usize = 80;
    for record in records {
        match record {
            ParagraphRecord::ParaText { text, .. } => {
                if !text.is_empty() {
                    let s: String = text
                        .chars()
                        .take(TRUNCATE)
                        .map(|c| if c == '\n' { ' ' } else { c })
                        .collect();
                    let suffix = if text.chars().count() > TRUNCATE {
                        "..."
                    } else {
                        ""
                    };
                    lines.push(format!("paragraph: {}{}", s, suffix));
                }
            }
            ParagraphRecord::Table { table } => {
                let r = table.attributes.row_count;
                let c = table.attributes.col_count;
                lines.push(format!("table: {}x{}", r, c));
            }
            ParagraphRecord::ShapeComponentPicture {
                shape_component_picture,
            } => {
                let id = shape_component_picture.picture_info.bindata_id;
                if options.embed_images {
                    lines.push(format!("image: bindata_id={}", id));
                } else {
                    lines.push("image: [placeholder]".to_string());
                }
            }
            ParagraphRecord::ShapeComponent { children, .. } => {
                if children.is_empty() {
                    lines.push("image: [placeholder]".to_string());
                } else {
                    collect_summary_records(children, _document, options, lines);
                }
            }
            ParagraphRecord::CtrlHeader {
                children,
                paragraphs,
                ..
            } => {
                let has_table = children
                    .iter()
                    .any(|c| matches!(c, ParagraphRecord::Table { .. }));
                collect_summary_records(children, _document, options, lines);
                if !has_table {
                    for para in paragraphs {
                        collect_summary_records(&para.records, _document, options, lines);
                    }
                }
            }
            _ => {}
        }
    }
}
