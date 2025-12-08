/// HTML Renderer implementation
/// HTML 렌더러 구현
use crate::document::{bodytext::Table, HwpDocument};
use crate::viewer::core::renderer::{DocumentParts, Renderer, TextStyles};

/// HTML Renderer
pub struct HtmlRenderer;

impl Renderer for HtmlRenderer {
    type Options = crate::viewer::html::HtmlOptions;

    // ===== Text Styling =====
    fn render_text(&self, text: &str, styles: &TextStyles) -> String {
        // CSS 클래스 접두사 (기본값 사용) / CSS class prefix (use default)
        const CSS_PREFIX: &str = "ohah-hwpjs-";

        let mut result = text.to_string();

        // 스타일 적용 순서: 안쪽부터 바깥쪽으로 / Apply styles from innermost to outermost
        // 1. 기울임 (가장 안쪽) / Italic (innermost)
        if styles.italic {
            result = format!(r#"<em class="{}italic">{}</em>"#, CSS_PREFIX, result);
        }

        // 2. 진하게 / Bold
        if styles.bold {
            result = format!(r#"<strong class="{}bold">{}</strong>"#, CSS_PREFIX, result);
        }

        // 3. 밑줄 / Underline
        if styles.underline {
            // 기본적으로 solid 스타일 사용 (스타일 타입 정보가 없을 경우)
            // Use solid style by default (when style type information is not available)
            result = format!(r#"<u class="{}underline-solid">{}</u>"#, CSS_PREFIX, result);
        }

        // 4. 취소선 / Strikethrough
        if styles.strikethrough {
            // 기본적으로 solid 스타일 사용 (스타일 타입 정보가 없을 경우)
            // Use solid style by default (when style type information is not available)
            result = format!(
                r#"<s class="{}strikethrough-solid">{}</s>"#,
                CSS_PREFIX, result
            );
        }

        // 5. 위 첨자 / Superscript
        if styles.superscript {
            result = format!(r#"<sup class="{}superscript">{}</sup>"#, CSS_PREFIX, result);
        }

        // 6. 아래 첨자 / Subscript
        if styles.subscript {
            result = format!(r#"<sub class="{}subscript">{}</sub>"#, CSS_PREFIX, result);
        }

        // 색상 및 폰트 스타일 적용 / Apply color and font styles
        let mut style_attrs = Vec::new();
        if let Some(ref color) = styles.color {
            style_attrs.push(format!("color: {}", color));
        }
        if let Some(ref bg_color) = styles.background_color {
            style_attrs.push(format!("background-color: {}", bg_color));
        }
        if let Some(ref font_family) = styles.font_family {
            style_attrs.push(format!("font-family: {}", font_family));
        }
        if let Some(font_size) = styles.font_size {
            style_attrs.push(format!("font-size: {:.2}pt", font_size));
        }

        if !style_attrs.is_empty() {
            result = format!(
                r#"<span style="{}">{}</span>"#,
                style_attrs.join("; "),
                result
            );
        }

        result
    }

    fn render_bold(&self, text: &str) -> String {
        format!("<strong>{}</strong>", text)
    }

    fn render_italic(&self, text: &str) -> String {
        format!("<em>{}</em>", text)
    }

    fn render_underline(&self, text: &str) -> String {
        format!("<u>{}</u>", text)
    }

    fn render_strikethrough(&self, text: &str) -> String {
        format!("<s>{}</s>", text)
    }

    fn render_superscript(&self, text: &str) -> String {
        format!("<sup>{}</sup>", text)
    }

    fn render_subscript(&self, text: &str) -> String {
        format!("<sub>{}</sub>", text)
    }

    // ===== Structure Elements =====
    fn render_paragraph(&self, content: &str) -> String {
        format!(r#"<p class="ohah-hwpjs-paragraph">{}</p>"#, content)
    }

    fn render_table(
        &self,
        table: &Table,
        document: &HwpDocument,
        options: &Self::Options,
    ) -> String {
        // 기존 테이블 변환 함수 사용
        use crate::viewer::html::document::bodytext::table::convert_table_to_html;
        use crate::viewer::html::utils::OutlineNumberTracker;
        let mut tracker = OutlineNumberTracker::new();
        convert_table_to_html(table, document, options, &mut tracker)
    }

    fn render_image(
        &self,
        image_id: u16,
        document: &HwpDocument,
        options: &Self::Options,
    ) -> Option<String> {
        // bindata_id로 직접 이미지 렌더링 / Render image directly by bindata_id
        use crate::viewer::html::common::format_image_html;

        // BinData에서 이미지 데이터 가져오기 / Get image data from BinData
        if let Some(bin_item) = document
            .bin_data
            .items
            .iter()
            .find(|item| item.index == image_id)
        {
            return Some(format_image_html(
                document,
                image_id,
                &bin_item.data,
                options.image_output_dir.as_deref(),
                &options.css_class_prefix,
            ));
        }

        None
    }

    fn render_page_break(&self) -> String {
        format!(r#"    <hr class="ohah-hwpjs-page-break" />"#)
    }

    // ===== Document Structure =====
    fn render_document(
        &self,
        parts: &DocumentParts,
        document: &HwpDocument,
        options: &Self::Options,
    ) -> String {
        // 기존 to_html 함수의 로직 사용
        use crate::viewer::html::to_html;
        to_html(document, options)
    }

    fn render_document_header(&self, document: &HwpDocument, options: &Self::Options) -> String {
        let mut html = String::new();
        html.push_str("    <h1>HWP 문서</h1>\n");

        if options.include_version != Some(false) {
            let version = document.file_header.version;
            let major = (version >> 24) & 0xFF;
            let minor = (version >> 16) & 0xFF;
            let patch = (version >> 8) & 0xFF;
            let build = version & 0xFF;
            html.push_str(&format!(
                "    <p><strong>버전</strong>: {}.{:02}.{:02}.{:02}</p>\n",
                major, minor, patch, build
            ));
        }

        html
    }

    fn render_document_footer(&self, parts: &DocumentParts, options: &Self::Options) -> String {
        let mut html = String::new();

        if !parts.footnotes.is_empty() {
            html.push_str(&format!(
                r#"    <section class="{}footnotes">"#,
                options.css_class_prefix
            ));
            html.push_str("\n      <h2>각주</h2>\n");
            for footnote in &parts.footnotes {
                html.push_str(footnote);
                html.push_str("\n");
            }
            html.push_str("    </section>\n");
        }

        if !parts.endnotes.is_empty() {
            html.push_str(&format!(
                r#"    <section class="{}endnotes">"#,
                options.css_class_prefix
            ));
            html.push_str("\n      <h2>미주</h2>\n");
            for endnote in &parts.endnotes {
                html.push_str(endnote);
                html.push_str("\n");
            }
            html.push_str("    </section>\n");
        }

        html
    }

    // ===== Special Elements =====
    fn render_footnote_ref(&self, id: u32, number: &str, options: &Self::Options) -> String {
        let footnote_ref_id = format!("footnote-{}-ref", id);
        let footnote_href = format!("#footnote-{}", id);
        format!(
            r#"<sup><a href="{}" class="{}{}" id="{}">{}</a></sup>"#,
            footnote_href, options.css_class_prefix, "footnote-ref", footnote_ref_id, number
        )
    }

    fn render_endnote_ref(&self, id: u32, number: &str, options: &Self::Options) -> String {
        let endnote_ref_id = format!("endnote-{}-ref", id);
        let endnote_href = format!("#endnote-{}", id);
        format!(
            r#"<sup><a href="{}" class="{}{}" id="{}">{}</a></sup>"#,
            endnote_href, options.css_class_prefix, "endnote-ref", endnote_ref_id, number
        )
    }

    fn render_footnote_back(&self, ref_id: &str, options: &Self::Options) -> String {
        let footnote_back_href = format!("#{}", ref_id);
        format!(
            r#"<a href="{}" class="{}{}">↩</a> "#,
            footnote_back_href, options.css_class_prefix, "footnote-back"
        )
    }

    fn render_endnote_back(&self, ref_id: &str, options: &Self::Options) -> String {
        let endnote_back_href = format!("#{}", ref_id);
        format!(
            r#"<a href="{}" class="{}{}">↩</a> "#,
            endnote_back_href, options.css_class_prefix, "endnote-back"
        )
    }

    fn render_outline_number(&self, level: u8, number: u32, content: &str) -> String {
        // 개요 번호 형식 적용 / Apply outline number format
        use crate::viewer::html::utils::format_outline_number;
        let outline_number = format_outline_number(level, number);
        format!("{} {}", outline_number, content)
    }
}
