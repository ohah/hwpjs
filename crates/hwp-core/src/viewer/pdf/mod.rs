//! PDF converter for HWP documents
//! HWP 문서를 PDF로 변환하는 모듈

use crate::document::HwpDocument;

/// PDF 변환 옵션
#[derive(Debug, Clone)]
pub struct PdfOptions {
    /// 기본 폰트으로 사용할 TTF/OTF 경로. None이면 genpdf 기본 폰트 사용.
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

/// HWP 문서를 PDF 바이트로 변환
///
/// # Arguments
/// * `document` - 변환할 HWP 문서
/// * `options` - PDF 변환 옵션
///
/// # Returns
/// PDF 파일 내용 (Vec<u8>). 빈 문서라도 유효한 PDF가 반환됨.
pub fn to_pdf(document: &HwpDocument, options: &PdfOptions) -> Vec<u8> {
    let _ = document;
    minimal_pdf_bytes(options)
}

/// 최소 유효 PDF (빈 페이지 1장) 반환. 스텁/테스트용.
/// 폰트는 options.font_dir 또는 현재 디렉터리에서 LiberationSans 사용.
fn minimal_pdf_bytes(options: &PdfOptions) -> Vec<u8> {
    use genpdf::{elements, fonts, Document};
    use std::path::Path;
    let dir = options
        .font_dir
        .as_deref()
        .unwrap_or(Path::new("."));
    let font = fonts::from_files(dir, "LiberationSans", Some(fonts::Builtin::Helvetica))
        .or_else(|_| fonts::from_files(dir, "Liberation Sans", Some(fonts::Builtin::Helvetica)))
        .expect("font: set font_dir to a path containing LiberationSans TTF files");
    let mut doc = Document::new(font);
    doc.set_title("HWP Export");
    doc.push(elements::Paragraph::new(""));
    let mut output = Vec::new();
    doc.render(&mut output).expect("render");
    output
}
