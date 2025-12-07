/// Markdown Renderer implementation
/// Markdown 렌더러 구현
use crate::document::{bodytext::Table, HwpDocument};
use crate::viewer::core::renderer::{DocumentParts, Renderer, TextStyles};

/// Markdown Renderer
pub struct MarkdownRenderer;

impl Renderer for MarkdownRenderer {
    type Options = crate::viewer::markdown::MarkdownOptions;

    // ===== Text Styling =====
    fn render_text(&self, text: &str, _styles: &TextStyles) -> String {
        // TODO: 스타일 적용 (마크다운에서는 제한적)
        text.to_string()
    }

    fn render_bold(&self, text: &str) -> String {
        format!("**{}**", text)
    }

    fn render_italic(&self, text: &str) -> String {
        format!("*{}*", text)
    }

    fn render_underline(&self, text: &str) -> String {
        // 마크다운에서는 밑줄을 직접 지원하지 않으므로 HTML 태그 사용
        // Markdown doesn't directly support underline, so use HTML tag
        format!("<u>{}</u>", text)
    }

    fn render_strikethrough(&self, text: &str) -> String {
        format!("~~{}~~", text)
    }

    fn render_superscript(&self, text: &str) -> String {
        // 마크다운에서는 위첨자를 직접 지원하지 않으므로 HTML 태그 사용
        // Markdown doesn't directly support superscript, so use HTML tag
        format!("<sup>{}</sup>", text)
    }

    fn render_subscript(&self, text: &str) -> String {
        // 마크다운에서는 아래첨자를 직접 지원하지 않으므로 HTML 태그 사용
        // Markdown doesn't directly support subscript, so use HTML tag
        format!("<sub>{}</sub>", text)
    }

    // ===== Structure Elements =====
    fn render_paragraph(&self, content: &str) -> String {
        // 마크다운에서는 문단이 빈 줄로 구분되므로 그냥 텍스트 반환
        // In markdown, paragraphs are separated by blank lines, so just return text
        content.to_string()
    }

    fn render_table(
        &self,
        table: &Table,
        document: &HwpDocument,
        options: &Self::Options,
    ) -> String {
        // 기존 테이블 변환 함수 사용
        use crate::viewer::markdown::document::bodytext::table::convert_table_to_markdown;
        use crate::viewer::markdown::utils::OutlineNumberTracker;
        let mut tracker = OutlineNumberTracker::new();
        convert_table_to_markdown(table, document, options, &mut tracker)
    }

    fn render_image(
        &self,
        image_id: u16,
        document: &HwpDocument,
        options: &Self::Options,
    ) -> Option<String> {
        // bindata_id로 직접 이미지 렌더링 / Render image directly by bindata_id
        use crate::viewer::markdown::common::format_image_markdown;
        
        // BinData에서 이미지 데이터 가져오기 / Get image data from BinData
        if let Some(bin_item) = document
            .bin_data
            .items
            .iter()
            .find(|item| item.index == image_id)
        {
            let image_markdown = format_image_markdown(
                document,
                image_id,
                &bin_item.data,
                options.image_output_dir.as_deref(),
            );
            if !image_markdown.is_empty() {
                return Some(image_markdown);
            }
        }
        
        None
    }

    fn render_page_break(&self) -> String {
        "---\n".to_string()
    }

    // ===== Document Structure =====
    fn render_document(
        &self,
        _parts: &DocumentParts,
        document: &HwpDocument,
        options: &Self::Options,
    ) -> String {
        // 기존 to_markdown 함수의 로직 사용
        use crate::viewer::markdown::to_markdown;
        to_markdown(document, options)
    }

    fn render_document_header(
        &self,
        document: &HwpDocument,
        options: &Self::Options,
    ) -> String {
        let mut md = String::new();
        md.push_str("# HWP 문서\n");
        md.push_str("\n");

        if options.include_version != Some(false) {
            use crate::viewer::markdown::document::fileheader::format_version;
            md.push_str(&format!("**버전**: {}\n", format_version(document)));
            md.push_str("\n");
        }

        md
    }

    fn render_document_footer(
        &self,
        parts: &DocumentParts,
        _options: &Self::Options,
    ) -> String {
        let mut md = String::new();

        if !parts.footnotes.is_empty() {
            md.push_str("## 각주\n");
            md.push_str("\n");
            for footnote in &parts.footnotes {
                md.push_str(footnote);
                md.push_str("\n");
            }
        }

        if !parts.endnotes.is_empty() {
            md.push_str("## 미주\n");
            md.push_str("\n");
            for endnote in &parts.endnotes {
                md.push_str(endnote);
                md.push_str("\n");
            }
        }

        md
    }

    // ===== Special Elements =====
    fn render_footnote_ref(&self, id: u32, number: &str, _options: &Self::Options) -> String {
        // 마크다운에서는 각주 참조를 [^1] 형식으로 표시
        // In markdown, footnote references are shown as [^1]
        format!("[^{}]", number)
    }

    fn render_endnote_ref(&self, id: u32, number: &str, _options: &Self::Options) -> String {
        // 마크다운에서는 미주 참조를 [^1] 형식으로 표시
        // In markdown, endnote references are shown as [^1]
        format!("[^{}]", number)
    }

    fn render_footnote_back(&self, _ref_id: &str, _options: &Self::Options) -> String {
        // 마크다운에서는 각주 돌아가기 링크를 지원하지 않음
        // Markdown doesn't support footnote back links
        String::new()
    }

    fn render_endnote_back(&self, _ref_id: &str, _options: &Self::Options) -> String {
        // 마크다운에서는 미주 돌아가기 링크를 지원하지 않음
        // Markdown doesn't support endnote back links
        String::new()
    }

    fn render_outline_number(&self, _level: u8, _number: u32, content: &str) -> String {
        // TODO: 개요 번호 형식 적용
        content.to_string()
    }
}

