//! PDF converter for HWP documents
//! HWP 문서를 PDF로 변환하는 모듈

use crate::document::bodytext::{ParagraphRecord, Table};
use crate::document::HwpDocument;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use genpdf::{elements, fonts, Document};
use std::path::Path;

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

/// 문단 리스트에서 ParaText만 모아 하나의 문자열로 반환
fn paragraph_text_from_paragraphs(paragraphs: &[crate::document::Paragraph]) -> String {
    let mut s = String::new();
    for para in paragraphs {
        for record in &para.records {
            if let ParagraphRecord::ParaText { text, .. } = record {
                s.push_str(text);
            }
        }
    }
    s
}

/// HWP Table을 genpdf TableLayout으로 변환
fn build_table_layout(table: &Table) -> elements::TableLayout {
    let rows = table.attributes.row_count as usize;
    let cols = table.attributes.col_count as usize;
    if rows == 0 || cols == 0 {
        let mut t = elements::TableLayout::new(vec![1]);
        t.set_cell_decorator(elements::FrameCellDecorator::new(true, true, false));
        let mut row_builder = t.row();
        row_builder.push_element(elements::Paragraph::new(""));
        row_builder.push().expect("row");
        return t;
    }
    let column_weights = (0..cols).map(|_| 1).collect::<Vec<_>>();
    let mut layout = elements::TableLayout::new(column_weights);
    layout.set_cell_decorator(elements::FrameCellDecorator::new(true, true, false));

    let mut grid: Vec<Vec<String>> = vec![vec![String::new(); cols]; rows];
    for cell in &table.cells {
        let r = cell.cell_attributes.row_address as usize;
        let c = cell.cell_attributes.col_address as usize;
        if r < rows && c < cols {
            grid[r][c] = paragraph_text_from_paragraphs(&cell.paragraphs);
        }
    }
    for row in grid {
        let mut row_builder = layout.row();
        for cell in row {
            row_builder.push_element(elements::Paragraph::new(cell));
        }
        row_builder.push().expect("table row");
    }
    layout
}

/// BinData에서 이미지 바이트를 찾아 genpdf Image 요소로 변환 (embed_images가 true일 때만)
fn try_build_image(
    document: &HwpDocument,
    bindata_id: u16,
    embed_images: bool,
) -> Option<elements::Image> {
    if !embed_images {
        return None;
    }
    let item = document
        .bin_data
        .items
        .iter()
        .find(|i| i.index == bindata_id)?;
    let decoded = STANDARD.decode(item.data.as_bytes()).ok()?;
    let dynamic = image::load_from_memory(&decoded).ok()?;
    genpdf::elements::Image::from_dynamic_image(dynamic).ok()
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
    let dir = options
        .font_dir
        .as_deref()
        .unwrap_or(Path::new("."));
    let font = fonts::from_files(dir, "LiberationSans", Some(fonts::Builtin::Helvetica))
        .or_else(|_| fonts::from_files(dir, "Liberation Sans", Some(fonts::Builtin::Helvetica)))
        .expect("font: set font_dir to a path containing LiberationSans TTF files");
    let mut doc = Document::new(font);
    doc.set_title("HWP Export");

    let mut has_any = false;
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            for record in &paragraph.records {
                match record {
                    ParagraphRecord::ParaText { text, .. } => {
                        if !text.is_empty() {
                            doc.push(elements::Paragraph::new(text.clone()));
                            has_any = true;
                        }
                    }
                    ParagraphRecord::Table { table } => {
                        let layout = build_table_layout(table);
                        doc.push(layout);
                        has_any = true;
                    }
                    ParagraphRecord::ShapeComponentPicture {
                        shape_component_picture,
                    } => {
                        let bindata_id = shape_component_picture.picture_info.bindata_id;
                        if let Some(img_el) =
                            try_build_image(document, bindata_id, options.embed_images)
                        {
                            doc.push(img_el);
                            has_any = true;
                        } else {
                            doc.push(elements::Paragraph::new("[Image]"));
                            has_any = true;
                        }
                    }
                    ParagraphRecord::ShapeComponent { .. } => {
                        doc.push(elements::Paragraph::new("[Image]"));
                        has_any = true;
                    }
                    _ => {}
                }
            }
        }
    }
    if !has_any {
        doc.push(elements::Paragraph::new(""));
    }
    let mut output = Vec::new();
    doc.render(&mut output).expect("render");
    output
}

/// 최소 유효 PDF (빈 페이지 1장) 반환. 스텁/테스트용.
#[allow(dead_code)]
fn minimal_pdf_bytes(options: &PdfOptions) -> Vec<u8> {
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
