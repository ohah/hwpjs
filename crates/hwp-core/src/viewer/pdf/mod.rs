//! PDF converter for HWP documents
//! HWP 문서를 PDF로 변환하는 모듈
//!
//! **폰트/인코딩**: genpdf는 폰트에 있는 글리프만 렌더링함. Liberation Sans는 라틴 계열만 지원하므로
//! 한글 등이 포함된 문서는 한글 지원 폰트(예: Noto Sans KR)를 `font_dir`에 넣어 사용해야 함.

use crate::document::bodytext::{ParagraphRecord, Table};
use crate::document::HwpDocument;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use genpdf::{elements, fonts, Document};
use std::path::Path;

/// PDF 변환 옵션
#[derive(Debug, Clone)]
pub struct PdfOptions {
    /// 기본 폰트으로 사용할 TTF/OTF가 있는 디렉터리 경로. None이면 genpdf 기본 폰트 사용.
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

/// Base64 입력 최대 길이 (메모리 DoS 방지).
const MAX_BASE64_INPUT_LEN: usize = 16 * 1024 * 1024; // 16 MiB
/// 디코딩된 이미지 바이트 최대 길이 (메모리 DoS 방지).
const MAX_IMAGE_DECODED_LEN: usize = 12 * 1024 * 1024; // 12 MiB

/// BinData에서 이미지 바이트를 찾아 genpdf Image 요소로 변환 (embed_images가 true일 때만).
/// Base64 디코딩·이미지 로드·투명도 제거(RGB 변환) 실패 시 None을 반환해 [Image] 플레이스홀더로 대체.
/// 입력/디코딩 길이 상한을 초과하면 None을 반환한다.
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
    if item.data.len() > MAX_BASE64_INPUT_LEN {
        return None;
    }
    // Base64: 공백/줄바꿈 무시하고 디코딩 시도
    let decoded = decode_bindata_base64(item.data.as_bytes()).ok()?;
    if decoded.len() > MAX_IMAGE_DECODED_LEN {
        return None;
    }
    let dynamic = image::load_from_memory(&decoded).ok()?;
    // genpdf/printpdf는 투명 채널 미지원 → 알파 제거 후 RGB로 변환
    let opaque = dynamic.to_rgb8();
    let dynamic_opaque = image::DynamicImage::ImageRgb8(opaque);
    genpdf::elements::Image::from_dynamic_image(dynamic_opaque).ok()
}

/// BinData 항목용 Base64 디코딩 (공백·줄바꿈 무시).
fn decode_bindata_base64(input: &[u8]) -> Result<Vec<u8>, base64::DecodeError> {
    STANDARD.decode(input).or_else(|_| {
        let stripped: Vec<u8> = input
            .iter()
            .copied()
            .filter(|&b| !b.is_ascii_whitespace())
            .collect();
        STANDARD.decode(&stripped)
    })
}

/// 레코드 목록을 재귀 순회하며 요약 라인만 수집 (CtrlHeader/ShapeComponent 내부 포함)
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
                collect_summary_records(children, _document, options, lines);
                for para in paragraphs {
                    collect_summary_records(&para.records, _document, options, lines);
                }
            }
            _ => {}
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

/// HWP 문서를 PDF 바이트로 변환
///
/// # Arguments
/// * `document` - 변환할 HWP 문서
/// * `options` - PDF 변환 옵션
///
/// # Returns
/// PDF 파일 내용 (`Vec<u8>`). 빈 문서라도 유효한 PDF가 반환됨.
pub fn to_pdf(document: &HwpDocument, options: &PdfOptions) -> Vec<u8> {
    let dir = options.font_dir.as_deref().unwrap_or(Path::new("."));
    // 한글 지원: NotoSansKR(또는 Noto Sans KR) 우선 시도, 없으면 라틴 전용 Liberation Sans
    let font = fonts::from_files(dir, "NotoSansKR", Some(fonts::Builtin::Helvetica))
        .or_else(|_| fonts::from_files(dir, "Noto Sans KR", Some(fonts::Builtin::Helvetica)))
        .or_else(|_| fonts::from_files(dir, "LiberationSans", Some(fonts::Builtin::Helvetica)))
        .or_else(|_| fonts::from_files(dir, "Liberation Sans", Some(fonts::Builtin::Helvetica)))
        .expect(
            "font: set font_dir to a path containing Noto Sans KR or LiberationSans TTF/OTF files",
        );
    let mut doc = Document::new(font);
    doc.set_title("HWP Export");

    let mut has_any = false;
    fn push_records(
        records: &[ParagraphRecord],
        document: &HwpDocument,
        options: &PdfOptions,
        doc: &mut Document,
        has_any: &mut bool,
    ) {
        for record in records {
            match record {
                ParagraphRecord::ParaText { text, .. } => {
                    if !text.is_empty() {
                        doc.push(elements::Paragraph::new(text.clone()));
                        *has_any = true;
                    }
                }
                ParagraphRecord::Table { table } => {
                    doc.push(build_table_layout(table));
                    *has_any = true;
                }
                ParagraphRecord::ShapeComponentPicture {
                    shape_component_picture,
                } => {
                    let bindata_id = shape_component_picture.picture_info.bindata_id;
                    if let Some(img_el) =
                        try_build_image(document, bindata_id, options.embed_images)
                    {
                        doc.push(img_el);
                        *has_any = true;
                    } else {
                        doc.push(elements::Paragraph::new("[Image]"));
                        *has_any = true;
                    }
                }
                ParagraphRecord::ShapeComponent { children, .. } => {
                    if children.is_empty() {
                        doc.push(elements::Paragraph::new("[Image]"));
                        *has_any = true;
                    } else {
                        push_records(children, document, options, doc, has_any);
                    }
                }
                ParagraphRecord::CtrlHeader {
                    children,
                    paragraphs,
                    ..
                } => {
                    push_records(children, document, options, doc, has_any);
                    for para in paragraphs {
                        push_records(&para.records, document, options, doc, has_any);
                    }
                }
                _ => {}
            }
        }
    }
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            push_records(
                &paragraph.records,
                document,
                options,
                &mut doc,
                &mut has_any,
            );
        }
    }
    if !has_any {
        doc.push(elements::Paragraph::new(""));
    }
    let mut output = Vec::new();
    doc.render(&mut output).expect("render");
    output
}
