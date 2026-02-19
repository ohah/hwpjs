/// Common bodytext processing logic
/// 공통 본문 처리 로직
///
/// 모든 뷰어에서 공통으로 사용되는 본문 처리 로직을 제공합니다.
/// 출력 형식은 Renderer 트레이트를 통해 처리됩니다.
///
/// Provides common bodytext processing logic used by all viewers.
/// Output format is handled through the Renderer trait.
use crate::document::{ColumnDivideType, CtrlHeader, HwpDocument, Paragraph, ParagraphRecord};
use crate::viewer::core::renderer::{DocumentParts, Renderer};
use crate::viewer::markdown::utils::OutlineNumberTracker;
use crate::viewer::{html, html::HtmlOptions, MarkdownOptions};

/// Render paragraph using viewer-specific functions
/// 뷰어별 함수를 사용하여 문단 렌더링
///
/// 이 함수는 타입별로 기존 뷰어 함수를 호출하여 글자 모양, 개요 번호 등
/// 복잡한 처리를 기존 로직으로 처리합니다.
///
/// This function calls existing viewer functions by type to handle complex
/// processing like character shapes, outline numbers, etc. with existing logic.
///
/// tracker는 문서 전체에 걸쳐 상태를 유지해야 하므로 외부에서 전달받습니다.
/// tracker maintains state across the entire document, so it's passed from outside.
fn render_paragraph_with_viewer<R: Renderer>(
    paragraph: &Paragraph,
    document: &HwpDocument,
    renderer: &R,
    options: &R::Options,
    tracker: &mut dyn TrackerRef,
) -> String
where
    R::Options: 'static,
{
    // 타입 체크를 통해 기존 뷰어 함수 호출 / Call existing viewer functions through type checking
    // HTML 렌더러인 경우 - 새로운 HTML 뷰어는 process_paragraph를 사용 / If HTML renderer - new HTML viewer uses process_paragraph
    // HTML 뷰어는 to_html() 함수에서 직접 처리하므로 여기서는 기본 처리 사용
    // HTML viewer is handled directly in to_html() function, so use default processing here

    // Markdown 렌더러인 경우 / If Markdown renderer
    if std::any::TypeId::of::<R::Options>()
        == std::any::TypeId::of::<crate::viewer::markdown::MarkdownOptions>()
    {
        use crate::viewer::markdown::document::bodytext::paragraph::convert_paragraph_to_markdown;
        // 안전하게 타입 캐스팅 / Safely cast type
        unsafe {
            let md_options =
                &*(options as *const R::Options as *const crate::viewer::markdown::MarkdownOptions);
            let md_tracker = tracker.as_markdown_tracker_mut();
            return convert_paragraph_to_markdown(paragraph, document, md_options, md_tracker);
        }
    }

    // 기본: 공통 paragraph 처리 사용 / Default: Use common paragraph processing
    use crate::viewer::core::paragraph::process_paragraph;
    process_paragraph(paragraph, document, renderer, options)
}

/// Trait for outline number tracker reference
/// 개요 번호 추적기 참조를 위한 트레이트
trait TrackerRef {
    /// Get mutable reference to Markdown tracker
    /// Markdown 추적기의 가변 참조 가져오기
    unsafe fn as_markdown_tracker_mut(&mut self) -> &mut OutlineNumberTracker;
}

/// Enum to hold tracker by renderer type
/// 렌더러 타입별 추적기를 보관하는 열거형
enum Tracker {
    /// HTML 뷰어는 더 이상 OutlineNumberTracker를 사용하지 않음
    /// HTML viewer no longer uses OutlineNumberTracker
    Html(()),
    Markdown(OutlineNumberTracker),
}

impl TrackerRef for Tracker {
    unsafe fn as_markdown_tracker_mut(&mut self) -> &mut OutlineNumberTracker {
        match self {
            Tracker::Markdown(tracker) => tracker,
            _ => std::hint::unreachable_unchecked(),
        }
    }
}

/// Process bodytext and return document parts
/// 본문을 처리하고 문서 부분들을 반환
pub fn process_bodytext<R: Renderer>(
    document: &HwpDocument,
    renderer: &R,
    options: &R::Options,
) -> DocumentParts
where
    R::Options: 'static,
{
    let mut parts = DocumentParts::default();

    // 각주/미주 번호 추적기 / Footnote/endnote number tracker
    let mut footnote_counter = 1u32;
    let mut endnote_counter = 1u32;

    // 개요 번호 추적기 생성 (렌더러별로 다름) / Create outline number tracker (varies by renderer)
    // 문서 전체에 걸쳐 상태를 유지해야 하므로 한 번만 생성 / Created only once to maintain state across entire document
    // 새로운 HTML 뷰어는 tracker를 사용하지 않음 / New HTML viewer does not use tracker
    let mut tracker: Tracker = if std::any::TypeId::of::<R::Options>()
        == std::any::TypeId::of::<HtmlOptions>()
    {
        Tracker::Html(())
    } else if std::any::TypeId::of::<R::Options>() == std::any::TypeId::of::<MarkdownOptions>() {
        Tracker::Markdown(OutlineNumberTracker::new())
    } else {
        // 기본 렌더러는 tracker가 필요 없을 수 있음 / Default renderer may not need tracker
        // 하지만 일단 Markdown tracker를 사용 (나중에 필요시 수정) / But use Markdown tracker for now (modify later if needed)
        Tracker::Markdown(OutlineNumberTracker::new())
    };

    // Convert body text / 본문 텍스트를 변환
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            // control_mask를 사용하여 빠른 필터링 (최적화) / Use control_mask for quick filtering (optimization)
            let control_mask = &paragraph.para_header.control_mask;

            // control_mask로 머리말/꼬리말/각주/미주가 있는지 빠르게 확인 / Quickly check if header/footer/footnote/endnote exists using control_mask
            let has_header_footer = control_mask.has_header_footer();
            let has_footnote_endnote = control_mask.has_footnote_endnote();

            // 머리말/꼬리말/각주/미주 컨트롤 처리 / Process header/footer/footnote/endnote controls
            if has_header_footer || has_footnote_endnote {
                for record in &paragraph.records {
                    if let ParagraphRecord::CtrlHeader {
                        header,
                        children,
                        paragraphs: ctrl_paragraphs,
                    } = record
                    {
                        use crate::document::CtrlId;
                        if header.ctrl_id.as_str() == CtrlId::HEADER {
                            // 머리말 처리 / Process header
                            process_header(
                                header,
                                children,
                                ctrl_paragraphs,
                                document,
                                renderer,
                                options,
                                &mut parts,
                                &mut tracker,
                            );
                        } else if header.ctrl_id.as_str() == CtrlId::FOOTER {
                            // 꼬리말 처리 / Process footer
                            process_footer(
                                header,
                                children,
                                ctrl_paragraphs,
                                document,
                                renderer,
                                options,
                                &mut parts,
                                &mut tracker,
                            );
                        } else if header.ctrl_id.as_str() == CtrlId::FOOTNOTE {
                            // 각주 처리 / Process footnote
                            let footnote_id = footnote_counter;
                            footnote_counter += 1;
                            process_footnote(
                                footnote_id,
                                header,
                                children,
                                ctrl_paragraphs,
                                document,
                                renderer,
                                options,
                                &mut parts,
                                &mut tracker,
                            );
                        } else if header.ctrl_id.as_str() == CtrlId::ENDNOTE {
                            // 미주 처리 / Process endnote
                            let endnote_id = endnote_counter;
                            endnote_counter += 1;
                            process_endnote(
                                endnote_id,
                                header,
                                children,
                                ctrl_paragraphs,
                                document,
                                renderer,
                                options,
                                &mut parts,
                                &mut tracker,
                            );
                        }
                        // 테이블은 paragraph.rs에서 처리 / Table is processed in paragraph.rs
                    }
                }
            }

            // 일반 본문 문단 처리 (컨트롤이 없는 경우) / Process regular body paragraph (when no controls)
            if !has_header_footer && !has_footnote_endnote {
                // 페이지 나누기 확인 / Check for page break
                let has_page_break = paragraph
                    .para_header
                    .column_divide_type
                    .iter()
                    .any(|t| matches!(t, ColumnDivideType::Page | ColumnDivideType::Section));

                if has_page_break && !parts.body_lines.is_empty() {
                    let last_line = parts.body_lines.last().map(String::as_str).unwrap_or("");
                    // 페이지 구분선이 이미 있는지 확인 (렌더러별로 다름) / Check if page break already exists (varies by renderer)
                    if !last_line.is_empty() && !is_page_break_line(last_line, renderer) {
                        parts.body_lines.push(renderer.render_page_break());
                    }
                }

                // 문단 처리 / Process paragraph
                let para_content = render_paragraph_with_viewer(
                    paragraph,
                    document,
                    renderer,
                    options,
                    &mut tracker,
                );
                if !para_content.is_empty() {
                    parts.body_lines.push(para_content);
                }
            }
        }
    }

    parts
}

/// Check if a line is a page break line (renderer-specific)
/// 페이지 구분선인지 확인 (렌더러별)
fn is_page_break_line<R: Renderer>(line: &str, _renderer: &R) -> bool {
    // HTML: <hr
    // Markdown: ---
    line.contains("<hr") || line == "---"
}

/// Find paragraphs from either children or ctrl_paragraphs based on LIST_HEADER
/// LIST_HEADER에 따라 children 또는 ctrl_paragraphs에서 문단 찾기
fn find_paragraphs_in_records<'a>(
    children: &'a [ParagraphRecord],
    _ctrl_paragraphs: &'a [Paragraph],
) -> Option<&'a [Paragraph]> {
    for child_record in children {
        if let ParagraphRecord::ListHeader { paragraphs, .. } = child_record {
            return Some(paragraphs);
        }
    }
    None
}

/// Process paragraphs and collect their rendered content
/// 문단을 처리하고 렌더링된 내용을 수집
fn process_paragraphs<'a, R: Renderer>(
    paragraphs: &'a [Paragraph],
    ctx: &HeaderProcessContext<'a, R>,
    tracker: &mut dyn TrackerRef,
    target: &mut Vec<String>,
) where
    R::Options: 'static,
{
    for para in paragraphs {
        let para_content =
            render_paragraph_with_viewer(para, ctx.document, ctx.renderer, ctx.options, tracker);
        if !para_content.is_empty() {
            target.push(para_content);
        }
    }
}

/// Header processing context
/// 헤더 처리 컨텍스트
struct HeaderProcessContext<'a, R: Renderer> {
    document: &'a HwpDocument,
    renderer: &'a R,
    options: &'a R::Options,
}

/// Process header
/// 머리말 처리
#[allow(clippy::too_many_arguments)]
fn process_header<R: Renderer>(
    _header: &CtrlHeader,
    children: &[ParagraphRecord],
    ctrl_paragraphs: &[Paragraph],
    document: &HwpDocument,
    renderer: &R,
    options: &R::Options,
    parts: &mut DocumentParts,
    tracker: &mut dyn TrackerRef,
) where
    R::Options: 'static,
{
    #[allow(clippy::too_many_arguments)]
    {
        // 헤더 처리 컨텍스트 / Header processing context
        let ctx = HeaderProcessContext {
            document,
            renderer,
            options,
        };

        // LIST_HEADER가 있으면 children에서 처리, 없으면 paragraphs에서 처리
        // If LIST_HEADER exists, process from children, otherwise from paragraphs
        if let Some(paragraphs) = find_paragraphs_in_records(children, ctrl_paragraphs) {
            process_paragraphs(paragraphs, &ctx, tracker, parts.headers.as_mut())
        } else {
            process_paragraphs(ctrl_paragraphs, &ctx, tracker, parts.headers.as_mut())
        };
    }
}

/// Process footer
/// 꼬리말 처리
#[allow(clippy::too_many_arguments)]
fn process_footer<R: Renderer>(
    _header: &CtrlHeader,
    children: &[ParagraphRecord],
    ctrl_paragraphs: &[Paragraph],
    document: &HwpDocument,
    renderer: &R,
    options: &R::Options,
    parts: &mut DocumentParts,
    tracker: &mut dyn TrackerRef,
) where
    R::Options: 'static,
{
    #[allow(clippy::too_many_arguments)]
    {
        // LIST_HEADER가 있으면 children에서 처리, 없으면 paragraphs에서 처리
        // If LIST_HEADER exists, process from children, otherwise from paragraphs
        if let Some(paragraphs) = find_paragraphs_in_records(children, ctrl_paragraphs) {
            process_paragraphs(paragraphs, &HeaderProcessContext { document, renderer, options }, tracker, parts.footers.as_mut())
        } else {
            process_paragraphs(ctrl_paragraphs, &HeaderProcessContext { document, renderer, options }, tracker, parts.footers.as_mut())
        };
    }
}

/// Process footnote
/// 각주 처리
#[allow(clippy::too_many_arguments)]
fn process_footnote<R: Renderer>(
    footnote_id: u32,
    _header: &CtrlHeader,
    _children: &[ParagraphRecord],
    ctrl_paragraphs: &[Paragraph],
    document: &HwpDocument,
    renderer: &R,
    options: &R::Options,
    parts: &mut DocumentParts,
    tracker: &mut dyn TrackerRef,
) where
    R::Options: 'static,
{
    // 각주 번호 형식 (TODO: FootnoteShape에서 가져오기)
    // Footnote number format (TODO: Get from FootnoteShape)
    let footnote_number = format!("{}", footnote_id);

    // 각주 내용 수집 / Collect footnote content
    let footnote_contents = collect_footnote_content(ctrl_paragraphs, document, renderer, options, tracker);

    for (_footnote_ref_id, footnote_back, content) in footnote_contents {
        let footnote_id_str = format!("footnote-{}", footnote_id);
        let footnote_container = format_footnote_container(
            &footnote_id_str,
            &footnote_back,
            &content,
            renderer,
            options,
        );

        // 본문에 각주 참조 링크 삽입 / Insert footnote reference link in body
        if !parts.body_lines.is_empty() {
            let last_idx = parts.body_lines.len() - 1;
            let last_line = &mut parts.body_lines[last_idx];
            // 렌더러별로 각주 참조 링크 추가 방법이 다름
            // Method to add footnote reference link varies by renderer
            let footnote_ref = renderer.render_footnote_ref(footnote_id, &footnote_number, options);
            *last_line = append_to_last_paragraph(last_line, &footnote_ref, renderer);
        } else {
            // 본문이 비어있으면 새 문단으로 추가 / Add as new paragraph if body is empty
            let footnote_ref = renderer.render_footnote_ref(footnote_id, &footnote_number, options);
            parts
                .body_lines
                .push(renderer.render_paragraph(&footnote_ref));
        }

        parts.footnotes.push(footnote_container);
    }}

/// Process endnote
/// 미주 처리
#[allow(clippy::too_many_arguments)]
fn process_endnote<R: Renderer>(
    endnote_id: u32,
    _header: &CtrlHeader,
    _children: &[ParagraphRecord],
    ctrl_paragraphs: &[Paragraph],
    document: &HwpDocument,
    renderer: &R,
    options: &R::Options,
    parts: &mut DocumentParts,
    tracker: &mut dyn TrackerRef,
) where
    R::Options: 'static,
{
    // 미주 번호 형식 (TODO: FootnoteShape에서 가져오기)
    // Endnote number format (TODO: Get from FootnoteShape)
    let endnote_number = format!("{}", endnote_id);

    // 미주 내용 수집 / Collect endnote content
    let endnote_contents = collect_footnote_content(ctrl_paragraphs, document, renderer, options, tracker);

    for (_endnote_ref_id, endnote_back, content) in endnote_contents {
        let endnote_id_str = format!("endnote-{}", endnote_id);

        // 본문에 미주 참조 링크 삽입 / Insert endnote reference link in body
        if !parts.body_lines.is_empty() {
            let last_idx = parts.body_lines.len() - 1;
            let last_line = &mut parts.body_lines[last_idx];
            let endnote_ref = renderer.render_endnote_ref(endnote_id, &endnote_number, options);
            *last_line = append_to_last_paragraph(last_line, &endnote_ref, renderer);
        } else {
            // 본문이 비어있으면 새 문단으로 추가 / Add as new paragraph if body is empty
            let endnote_ref = renderer.render_endnote_ref(endnote_id, &endnote_number, options);
            parts
                .body_lines
                .push(renderer.render_paragraph(&endnote_ref));
        }

        parts.endnotes.push(format_endnote_container(
            &endnote_id_str,
            &endnote_back,
            &content,
            renderer,
            options,
        ));
    }
}

/// Append content to last paragraph (renderer-specific)
/// 마지막 문단에 내용 추가 (렌더러별)
fn append_to_last_paragraph<R: Renderer>(last_line: &str, content: &str, _renderer: &R) -> String {
    // HTML: </p> 태그 앞에 추가
    // Markdown: 문단 끝에 추가
    if last_line.contains("</p>") {
        last_line.replace("</p>", &format!(" {}</p>", content))
    } else {
        format!("{} {}", last_line, content)
    }
}

/// Process paragraphs and collect rendered content with backlinks
/// 문단을 처리하고 렌더링된 내용을 수집
fn collect_footnote_content<R: Renderer>(
    ctrl_paragraphs: &[Paragraph],
    document: &HwpDocument,
    renderer: &R,
    options: &R::Options,
    tracker: &mut dyn TrackerRef,
) -> Vec<(String, String, String)>
where
    R::Options: 'static,
{
    let mut result = Vec::new();

    for para in ctrl_paragraphs {
        let para_content = render_paragraph_with_viewer(para, document, renderer, options, tracker);
        if !para_content.is_empty() {
            let unique_id = "[footnote-id]".to_string(); // TODO: Use proper tracking
            let back_link = "[^1]".to_string(); // TODO: Generate proper backlink
            result.push((unique_id, back_link, para_content));
        }
    }

    result
}

/// Format footnote container (renderer-specific)
/// 각주 컨테이너 포맷 (렌더러별)
fn format_footnote_container<R: Renderer>(
    id: &str,
    back_link: &str,
    content: &str,
    _renderer: &R,
    options: &R::Options,
) -> String
where
    R::Options: 'static,
{
    // 타입 체크를 통해 렌더러별 포맷 적용 / Apply renderer-specific format through type checking
    // HTML 렌더러인 경우 / If HTML renderer
    if std::any::TypeId::of::<R::Options>() == std::any::TypeId::of::<HtmlOptions>() {
        unsafe {
            let html_options = &*(options as *const R::Options as *const html::HtmlOptions);
            return format!(
                r#"      <div id="{}" class="{}footnote">"#,
                id, html_options.css_class_prefix
            ) + &format!(r#"        {}"#, back_link)
                + content
                + "      </div>";
        }
    }

    // Markdown 렌더러인 경우 / If Markdown renderer
    if std::any::TypeId::of::<R::Options>() == std::any::TypeId::of::<MarkdownOptions>() {
        // 마크다운에서는 각주를 [^1]: 형식으로 표시
        // In markdown, footnotes are shown as [^1]:
        return format!("{}{}", back_link, content);
    }

    // 기본: 일반 텍스트 / Default: plain text
    format!("{} {}", back_link, content)
}

/// Format endnote container (renderer-specific)
/// 미주 컨테이너 포맷 (렌더러별)
fn format_endnote_container<R: Renderer>(
    id: &str,
    back_link: &str,
    content: &str,
    _renderer: &R,
    options: &R::Options,
) -> String
where
    R::Options: 'static,
{
    // 타입 체크를 통해 렌더러별 포맷 적용 / Apply renderer-specific format through type checking
    // HTML 렌더러인 경우 / If HTML renderer
    if std::any::TypeId::of::<R::Options>() == std::any::TypeId::of::<HtmlOptions>() {
        unsafe {
            let html_options = &*(options as *const R::Options as *const html::HtmlOptions);
            return format!(
                r#"      <div id="{}" class="{}endnote">"#,
                id, html_options.css_class_prefix
            ) + &format!(r#"        {}"#, back_link)
                + content
                + "      </div>";
        }
    }

    // Markdown 렌더러인 경우 / If Markdown renderer
    if std::any::TypeId::of::<R::Options>() == std::any::TypeId::of::<MarkdownOptions>() {
        // 마크다운에서는 미주를 [^1]: 형식으로 표시
        // In markdown, endnotes are shown as [^1]:
        return format!("{}{}", back_link, content);
    }

    // 기본: 일반 텍스트 / Default: plain text
    format!("{} {}", back_link, content)
}
