/// HTML Renderer implementation
/// HTML 렌더러 구현
use crate::document::HwpDocument;
use crate::viewer::core::outline::format_outline_number;
use crate::viewer::core::renderer::{DocumentParts, Renderer, TextStyles};
use crate::viewer::html::{HtmlOptions, HtmlPageBreak};

/// HTML Renderer
pub struct HtmlRenderer;

impl Renderer for HtmlRenderer {
    type Options = HtmlOptions;

    // ===== Text Styling =====
    fn render_text(&self, text: &str, _styles: &TextStyles) -> String {
        text.to_string()
    }

    fn render_bold(&self, text: &str) -> String {
        format!("<b>{}</b>", text)
    }

    fn render_italic(&self, text: &str) -> String {
        format!("<i>{}</i>", text)
    }

    fn render_underline(&self, text: &str) -> String {
        format!("<u>{}</u>", text)
    }

    fn render_strikethrough(&self, text: &str) -> String {
        format!("<s>{}</s>", text)
    }

    fn render_superscript(&self, text: &str) -> String {
        // HTML superscript: <sup>
        format!("<sup>{}</sup>", text)
    }

    fn render_subscript(&self, text: &str) -> String {
        // HTML subscript: <sub>
        format!("<sub>{}</sub>", text)
    }

    // ===== Structure Elements =====

    fn render_paragraph(&self, content: &str) -> String {
        format!("<p>{}</p>", content)
    }

    fn render_table(
        &self,
        _table: &crate::document::bodytext::Table,
        _document: &HwpDocument,
        _options: &Self::Options,
    ) -> String {
        "<table></table>".to_string()
    }

    fn render_image(
        &self,
        _image_id: u16,
        _document: &HwpDocument,
        _options: &Self::Options,
    ) -> Option<String> {
        None
    }

    fn render_page_break(&self) -> String {
        format!("<div class=\"page-break\">{}</div>", HtmlPageBreak::new())
    }

    // ===== Document Structure =====

    fn render_document(
        &self,
        parts: &DocumentParts,
        _document: &HwpDocument,
        _options: &Self::Options,
    ) -> String {
        let mut html = String::new();

        // Headers
        for header in &parts.headers {
            html.push_str(&format!("<div class=\"header\">{}</div>\n", header));
        }

        // Body
        html.push_str("<div class=\"body\">");
        html.push_str(&parts.body_lines.join("\n"));
        html.push_str("</div>");

        // Footers
        for footer in &parts.footers {
            html.push_str(&format!("<div class=\"footer\">{}</div>\n", footer));
        }

        // Footnotes
        for (i, footnote) in parts.footnotes.iter().enumerate() {
            let num = (i as u32) + 1;
            html.push_str(&format!(
                "<div class=\"footnote\"><sup>{}</sup> {}</div>\n",
                num, footnote
            ));
        }

        // Endnotes
        for (i, endnote) in parts.endnotes.iter().enumerate() {
            let num = (i as u32) + 1;
            html.push_str(&format!(
                "<div class=\"endnote\"><sup>{}</sup> {}</div>\n",
                num, endnote
            ));
        }

        html
    }

    fn render_document_header(&self, _document: &HwpDocument, _options: &Self::Options) -> String {
        String::new()
    }

    fn render_document_footer(&self, _parts: &DocumentParts, _options: &Self::Options) -> String {
        String::new()
    }

    // ===== Special Elements =====

    fn render_footnote_ref(&self, _id: u32, number: &str, _options: &Self::Options) -> String {
        format!("<sup>[{}]</sup>", number)
    }

    fn render_endnote_ref(&self, _id: u32, number: &str, _options: &Self::Options) -> String {
        format!("<sup>[{}]</sup>", number)
    }

    fn render_footnote_back(&self, _ref_id: &str, _options: &Self::Options) -> String {
        String::new()
    }

    fn render_endnote_back(&self, _ref_id: &str, _options: &Self::Options) -> String {
        String::new()
    }

    fn render_outline_number(&self, level: u8, number: u32, content: &str) -> String {
        // Convert (level, number) to outline format
        let _content = content;
        format_outline_number(level, number)
    }
}
