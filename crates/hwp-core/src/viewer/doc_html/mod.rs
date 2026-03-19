/// Document(hwp-model) 기반 HTML viewer
/// HWP/HWPX 양쪽에서 생성된 Document를 HTML로 변환
pub(crate) mod flat_text;
pub(crate) mod layout_image;
pub(crate) mod layout_line_segment;
pub(crate) mod layout_page;
pub(crate) mod layout_pagination;
pub(crate) mod layout_table;
pub(crate) mod layout_text;
mod paragraph;
pub(crate) mod styles;

use hwp_model::document::Document;

/// HTML 변환 옵션
#[derive(Debug, Clone)]
pub struct DocHtmlOptions {
    /// CSS 클래스 접두사
    pub css_class_prefix: String,
    /// inline style 사용 여부 (false이면 <style> 블록 생성)
    pub inline_style: bool,
    /// 이미지를 파일로 저장할 디렉토리 경로 (None이면 base64 데이터 URI로 임베드)
    pub image_output_dir: Option<String>,
    /// 레이아웃 모드: true이면 pixel-accurate 레이아웃 (hpa/hls/hcD 구조)
    /// false이면 시맨틱 HTML (기본값)
    pub layout: bool,
}

impl Default for DocHtmlOptions {
    fn default() -> Self {
        Self {
            css_class_prefix: "hwp-".to_string(),
            inline_style: true,
            image_output_dir: None,
            layout: false,
        }
    }
}

/// Document를 HTML로 변환
pub fn doc_to_html(doc: &Document, options: &DocHtmlOptions) -> String {
    if options.layout {
        return doc_to_html_layout(doc, options);
    }
    doc_to_html_semantic(doc, options)
}

/// 레이아웃 모드 HTML 생성 (pixel-accurate, hpa/hls/hcD 구조)
fn doc_to_html_layout(doc: &Document, _options: &DocHtmlOptions) -> String {
    let css = styles::generate_layout_css(doc);
    let mut pages_html = Vec::new();

    // A4 기본값 PageDef (PageDef가 비어있는 경우 fallback)
    let default_page_def = hwp_model::section::PageDef {
        width: 59528,  // 210mm
        height: 84188, // 297mm
        margin: hwp_model::section::PageMargin {
            left: 8504,   // 30mm
            right: 8504,
            top: 5669,    // 20mm
            bottom: 4252, // 15mm
            header: 4252, // 15mm
            footer: 4252,
            gutter: 0,
        },
        ..Default::default()
    };

    let mut has_page_number_global = false;

    for section in &doc.sections {
        let page_def = if section.definition.page.width > 0 {
            &section.definition.page
        } else {
            &default_page_def
        };
        let ch_mm = layout_pagination::content_height_mm(page_def);

        // 페이지네이션 컨텍스트
        let mut pag_ctx = layout_pagination::PaginationContext {
            prev_vertical_mm: None,
            current_max_vertical_mm: 0.0,
            content_height_mm: ch_mm,
            page_vertical_offset_mm: 0.0,
        };

        let mut current_page_blocks: Vec<layout_page::PageBlock> = Vec::new();
        let mut header_html: Option<String> = None;
        let mut footer_html: Option<String> = None;
        let mut footnote_blocks: Vec<(u16, String)> = Vec::new();
        let mut has_page_number = false;
        let mut page_number: usize = 0;
        let mut endnote_blocks: Vec<(u16, String)> = Vec::new();
        let mut inline_note_refs: Vec<String> = Vec::new();
        let mut footnote_counter: u16 = 0;
        let mut endnote_counter: u16 = 0;
        let mut outline_tracker = crate::viewer::core::outline::OutlineNumberTracker::new();
        let mut number_tracker: std::collections::HashMap<
            u16,
            crate::viewer::core::outline::OutlineNumberTracker,
        > = std::collections::HashMap::new();

        for para in &section.paragraphs {
            // 페이지 나누기 판단
            let break_result = layout_pagination::check_page_break(para, &pag_ctx);
            if break_result.should_break && !current_page_blocks.is_empty() {
                // 현재 페이지 flush
                let page_html =
                    layout_page::render_page(
                        &current_page_blocks,
                        page_def,
                        header_html.as_deref(),
                        footer_html.as_deref(),
                    );
                // 각주를 페이지 </div> 앞에 삽입
                let page_html = append_footnotes_to_page(
                    page_html,
                    &footnote_blocks,
                    &endnote_blocks,
                );
                page_number += 1;
                pages_html.push(page_html);
                current_page_blocks.clear();
                footnote_blocks.clear();
                endnote_blocks.clear();

                // 페이지 오프셋 업데이트
                if let Some(vp) = layout_pagination::last_vertical_pos_mm(para) {
                    // vertical_reset인 경우 새 페이지 시작이므로 오프셋 갱신
                    if break_result.reason
                        == Some(layout_pagination::PageBreakReason::VerticalReset)
                    {
                        pag_ctx.page_vertical_offset_mm = vp;
                    }
                }
                pag_ctx.current_max_vertical_mm = 0.0;
            }

            // vertical position 추적 (Object 위치 계산 전에 업데이트)
            if let Some(vp) = layout_pagination::last_vertical_pos_mm(para) {
                let rel_vp = vp - pag_ctx.page_vertical_offset_mm;
                pag_ctx.prev_vertical_mm = Some(rel_vp);
                if rel_vp > pag_ctx.current_max_vertical_mm {
                    pag_ctx.current_max_vertical_mm = rel_vp;
                }
            }

            // 문단 내 Object/Control 수집 (hls 뒤에 배치하기 위해 먼저 수집)
            let mut obj_blocks: Vec<String> = Vec::new();
            let page_left = layout_page::content_left_abs_mm(page_def);
            let page_top = layout_page::content_top_abs_mm(page_def);
            for run in &para.runs {
                for content in &run.contents {
                    match content {
                        hwp_model::paragraph::RunContent::Object(ref shape) => {
                            let obj_html = match shape {
                                hwp_model::shape::ShapeObject::Table(ref table) => {
                                    // vert_offset=0인 테이블: 이전 콘텐츠 아래에 배치
                                    let table_page_top = if table.common.position.vert_offset == 0 {
                                        page_top + pag_ctx.current_max_vertical_mm
                                    } else {
                                        page_top
                                    };
                                    // 테이블 높이만큼 vertical position 갱신
                                    let table_h = styles::round_mm(
                                        styles::hwpunit_to_mm(table.common.size.height)
                                    );
                                    let table_bottom = pag_ctx.current_max_vertical_mm + table_h;
                                    if table_bottom > pag_ctx.current_max_vertical_mm {
                                        pag_ctx.current_max_vertical_mm = table_bottom;
                                    }
                                    layout_table::render_layout_table_with_offset(
                                        table,
                                        &doc.resources,
                                        &doc.binaries,
                                        page_left,
                                        table_page_top,
                                    )
                                }
                                hwp_model::shape::ShapeObject::Picture(ref pic) => {
                                    // 도형 좌표는 이미 페이지 절대좌표 (offset 불요)
                                    layout_image::render_layout_picture(pic, &doc.binaries)
                                }
                                hwp_model::shape::ShapeObject::Rectangle(ref rect) => {
                                    if let Some(ref dt) = rect.draw_text {
                                        layout_image::render_layout_textbox(
                                            &rect.common,
                                            &dt.paragraphs,
                                            &doc.resources,
                                        )
                                    } else {
                                        layout_image::render_layout_rect_svg(rect)
                                    }
                                }
                                hwp_model::shape::ShapeObject::Line(ref line) => {
                                    layout_image::render_layout_line(line)
                                }
                                hwp_model::shape::ShapeObject::Container(ref container) => {
                                    render_container_layout(
                                        container,
                                        &doc.resources,
                                        &doc.binaries,
                                    )
                                }
                                _ => String::new(),
                            };
                            if !obj_html.is_empty() {
                                obj_blocks.push(obj_html);
                            }
                        }
                        hwp_model::paragraph::RunContent::Control(ref ctrl) => {
                            // 머리글/꼬리글 수집
                            match ctrl {
                                hwp_model::control::Control::Header(hf) => {
                                    header_html = Some(render_sublist_layout(
                                        &hf.content.paragraphs,
                                        &doc.resources,
                                    ));
                                }
                                hwp_model::control::Control::Footer(hf) => {
                                    footer_html = Some(render_sublist_layout(
                                        &hf.content.paragraphs,
                                        &doc.resources,
                                    ));
                                }
                                hwp_model::control::Control::FootNote(note) => {
                                    footnote_counter += 1;
                                    let id = note.number.unwrap_or(footnote_counter);
                                    let note_html = render_sublist_layout(
                                        &note.content.paragraphs,
                                        &doc.resources,
                                    );
                                    footnote_blocks.push((id, note_html));
                                    // 인라인 참조 (hfN)
                                    inline_note_refs.push(format!(
                                        r#"<span class="hfN" style="top:-1.76mm;"><span class="hrt cs{cs}" style="font-size:5pt;top:-1pt;">{id})</span></span>"#,
                                        id = id, cs = run.char_shape_id
                                    ));
                                }
                                hwp_model::control::Control::EndNote(note) => {
                                    endnote_counter += 1;
                                    let id = note.number.unwrap_or(endnote_counter);
                                    let note_html = render_sublist_layout(
                                        &note.content.paragraphs,
                                        &doc.resources,
                                    );
                                    endnote_blocks.push((id, note_html));
                                    inline_note_refs.push(format!(
                                        r#"<span class="hfN" style="top:-1.76mm;"><span class="hrt cs{cs}" style="font-size:5pt;top:-1pt;">{id})</span></span>"#,
                                        id = id, cs = run.char_shape_id
                                    ));
                                }
                                hwp_model::control::Control::PageNumCtrl(_) => {
                                    has_page_number = true;
                                    has_page_number_global = true;
                                }
                                _ => {}
                            }
                        }
                        _ => {}
                    }
                }
            }

            // heading 마커 생성 (outline/bullet/number)
            let marker_html = generate_heading_marker(para, &doc.resources, &mut outline_tracker, &mut number_tracker);

            // 텍스트 렌더링 (빈 문단도 line_segments가 있으면 빈 hls 생성)
            let flat = flat_text::extract_flat_text(para);

            let para_shape_class = format!("ps{}", para.para_shape_id);
            let content_left = layout_page::content_left_mm(page_def);

            let has_objects = !obj_blocks.is_empty();
            let hls_lines = if !flat.hyperlinks.is_empty() {
                layout_line_segment::render_line_segments_impl(
                    &flat.text,
                    &flat.char_shapes,
                    &para.line_segments,
                    &doc.resources,
                    &para_shape_class,
                    content_left,
                    marker_html.as_deref(),
                    has_objects,
                    &flat.hyperlinks,
                )
            } else {
                layout_line_segment::render_line_segments_full(
                    &flat.text,
                    &flat.char_shapes,
                    &para.line_segments,
                    &doc.resources,
                    &para_shape_class,
                    content_left,
                    marker_html.as_deref(),
                    has_objects,
                )
            };

            // old viewer 순서: hls(텍스트) 먼저, Object(테이블/도형) 나중
            // hls(텍스트): hcI 내부 (inline)
            for line in hls_lines {
                current_page_blocks.push(layout_page::PageBlock { html: line, is_absolute: false });
            }
            // Object(htb/hsR 등): hpa 직접 (absolute) — old viewer 구조
            for obj_html in obj_blocks {
                current_page_blocks.push(layout_page::PageBlock { html: obj_html, is_absolute: true });
            }

            // 인라인 각주/미주 참조를 마지막 hls에 삽입
            if !inline_note_refs.is_empty() {
                if let Some(last_block) = current_page_blocks.last_mut() {
                    // </div> 앞에 hfN span 삽입
                    let refs_html = inline_note_refs.join("");
                    if let Some(pos) = last_block.html.rfind("</div>") {
                        last_block.html.insert_str(pos, &refs_html);
                    }
                }
                inline_note_refs.clear();
            }

        }

        // 마지막 페이지 flush (비어있어도 섹션당 최소 1페이지)
        if !current_page_blocks.is_empty() || pages_html.is_empty() {
            let page_html = layout_page::render_page(
                        &current_page_blocks,
                        page_def,
                        header_html.as_deref(),
                        footer_html.as_deref(),
                    );
            let page_html = append_footnotes_to_page(
                page_html,
                &footnote_blocks,
                &endnote_blocks,
            );
            page_number += 1;
            pages_html.push(page_html);
        }
    }

    // 페이지 번호 렌더링 — hpN div를 각 페이지에 삽입
    if has_page_number_global {
        for (idx, page_html) in pages_html.iter_mut().enumerate() {
            let page_num = idx + 1;
            // footer 영역 위치에 hpN div 삽입 (hpa 닫기 태그 앞)
            let page_def_for_num = if doc.sections.first()
                .map(|s| s.definition.page.width > 0)
                .unwrap_or(false)
            {
                &doc.sections[0].definition.page
            } else {
                &default_page_def
            };
            let page_w = styles::round_mm(styles::hwpunit_to_mm(page_def_for_num.width));
            let page_h = styles::round_mm(styles::hwpunit_to_mm(page_def_for_num.height));
            let hpn_left = styles::round_mm(page_w / 2.0);
            let hpn_top = styles::round_mm(
                page_h - styles::hwpunit_to_mm(page_def_for_num.margin.bottom),
            );
            let num_text = format!("- {} -", page_num);
            let hpn_html = format!(
                r#"<div class="hpN" style="left:{}mm;top:{}mm;width:10.58mm;height:4.23mm;"><span class="hrt cs0">{}</span></div>"#,
                hpn_left, hpn_top, num_text
            );
            // </div> (hpa) 앞에 삽입
            if let Some(pos) = page_html.rfind("</div>") {
                page_html.insert_str(pos, &hpn_html);
            }
        }
    }

    // HTML 조합 (old viewer와 동일한 헤더 구조)
    let title = doc
        .meta
        .title
        .as_deref()
        .unwrap_or("");
    let mut html = String::new();
    html.push_str("<!DOCTYPE html>\n<html>\n<meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge,chrome=1\">\n\n<head>\n");
    html.push_str(&format!("  <title>{}</title>\n", title));
    html.push_str("  <meta http-equiv=\"content-type\" content=\"text/html; charset=utf-8\">\n");
    html.push_str("  <style>\n");
    html.push_str(&css);
    html.push_str("  </style>\n</head>\n\n\n<body>\n");
    for page in &pages_html {
        html.push_str(page);
    }
    html.push_str("</body>\n\n</html>\n");
    html
}

/// heading 마커 HTML 생성 (hhe div)
fn generate_heading_marker(
    para: &hwp_model::paragraph::Paragraph,
    resources: &hwp_model::resources::Resources,
    outline_tracker: &mut crate::viewer::core::outline::OutlineNumberTracker,
    number_tracker: &mut std::collections::HashMap<
        u16,
        crate::viewer::core::outline::OutlineNumberTracker,
    >,
) -> Option<String> {
    use crate::viewer::core::outline::{format_outline_number, format_with_numbering};
    use hwp_model::types::HeadingType;

    let ps = resources.para_shapes.get(para.para_shape_id as usize)?;
    let heading = ps.heading.as_ref()?;

    // Numbering 리소스에서 level 정보 가져오기
    let numbering_level = if heading.id_ref > 0 {
        resources.numberings
            .iter()
            .find(|n| n.id == heading.id_ref)
            .and_then(|n| n.levels.iter().find(|l| l.level == heading.level))
    } else {
        // Outline: id_ref=0이면 첫 번째 Numbering 사용
        resources.numberings.first()
            .and_then(|n| n.levels.iter().find(|l| l.level == heading.level))
    };

    // Numbering에서 width(text_offset)와 CharShape 추출
    let numbering_text_offset = numbering_level
        .map(|l| styles::round_mm(styles::hwpunit_to_mm(l.text_offset)))
        .filter(|&w| w > 0.0)
        .unwrap_or(5.29);
    let marker_cs = numbering_level
        .and_then(|l| l.char_shape_id)
        .filter(|&id| id < 0xFFFF) // 0xFFFFFFFF 등 무효값 필터
        .unwrap_or(1); // 기본 cs1 (한글 문서 heading/numbering 기본)
    // CharShape에서 font-size 가져오기 (height HwpUnit → pt: /100)
    let font_size_style = resources.char_shapes.get(marker_cs as usize)
        .map(|cs| {
            let pt = styles::round_mm(cs.height as f64 / 100.0);
            format!(" style=\"font-size:{}pt;\"", pt)
        })
        .unwrap_or_default();

    match heading.heading_type {
        HeadingType::Outline => {
            let level = heading.level + 1;
            let number = outline_tracker.get_and_increment(level);
            let num_str = format_outline_number(level, number);
            // use_inst_width: 텍스트 기반 폭 계산
            let font_size_pt = resources.char_shapes.get(marker_cs as usize)
                .map(|cs| cs.height as f64 / 100.0)
                .unwrap_or(10.0);
            let marker_width = styles::round_mm(estimate_marker_text_width(&num_str, font_size_pt));
            Some(format!(
                r#"<div class="hhe" style="display:inline-block;margin-left:0mm;width:{:.2}mm;height:3.53mm;"><span class="hrt cs{}"{}>{}</span></div>"#,
                marker_width, marker_cs, font_size_style, num_str
            ))
        }
        HeadingType::Bullet => {
            // Bullet 리소스에서 문자와 CharShape 가져오기
            let bullet = resources.bullets.iter().find(|b| b.id == heading.id_ref);
            let bullet_char = bullet
                .map(|b| b.bullet_char)
                .filter(|&c| c != '\0' && !c.is_control())
                .unwrap_or('●');
            let bullet_cs = bullet
                .and_then(|b| b.para_head.char_shape_id)
                .filter(|&id| id < 0xFFFF)
                .unwrap_or(0); // bullet은 기본 cs0
            let bullet_width = bullet
                .map(|b| styles::round_mm(styles::hwpunit_to_mm(b.para_head.text_offset)))
                .filter(|&w| w > 0.0)
                .unwrap_or(numbering_text_offset);
            // Bullet font-size: bullet 전용 CharShape 또는 기본 3.33pt
            let bullet_font_style = {
                let valid_cs = bullet.and_then(|b| b.para_head.char_shape_id).filter(|&id| id < 0xFFFF);
                if let Some(cs_id) = valid_cs {
                    resources.char_shapes.get(cs_id as usize)
                        .map(|cs| {
                            let pt = styles::round_mm(cs.height as f64 / 100.0);
                            format!(" style=\"font-size:{}pt;\"", pt)
                        })
                        .unwrap_or_else(|| " style=\"font-size:3.33pt;\"".to_string())
                } else {
                    " style=\"font-size:3.33pt;\"".to_string()
                }
            };
            Some(format!(
                r#"<div class="hhe" style="display:inline-block;margin-left:0mm;width:{:.2}mm;height:3.53mm;"><span class="hrt cs{}"{}>{}</span></div>"#,
                bullet_width, bullet_cs, bullet_font_style, bullet_char
            ))
        }
        HeadingType::Number => {
            let level = heading.level + 1;
            let tracker = number_tracker.entry(heading.id_ref).or_default();
            let number = tracker.get_and_increment(level);
            let num_str = format_with_numbering(heading.id_ref, level, number, resources);
            let font_size_pt = resources.char_shapes.get(marker_cs as usize)
                .map(|cs| cs.height as f64 / 100.0)
                .unwrap_or(10.0);
            let marker_width = styles::round_mm(estimate_marker_text_width(&num_str, font_size_pt));
            Some(format!(
                r#"<div class="hhe" style="display:inline-block;margin-left:0mm;width:{:.2}mm;height:3.53mm;"><span class="hrt cs{}"{}>{}</span></div>"#,
                marker_width, marker_cs, font_size_style, num_str
            ))
        }
        _ => None,
    }
}

/// 페이지 HTML에 각주/미주 블록을 삽입 (</div> 앞)
fn append_footnotes_to_page(
    mut page_html: String,
    footnotes: &[(u16, String)],
    endnotes: &[(u16, String)],
) -> String {
    if footnotes.is_empty() && endnotes.is_empty() {
        return page_html;
    }

    let mut footer = String::new();

    if !footnotes.is_empty() {
        // 각주 구분선 (hfS) — old viewer 일치: top 위치는 본문 영역 하단 근처
        footer.push_str(
            r#"<div class="hfS" style="left:0mm;width:50.00mm;height:0.11mm;"><svg class="hs" viewBox="-0.12 -0.12 50.23 0.35" style="left:-0.12mm;top:-0.12mm;width:50.23mm;height:0.35mm;left:0;top:0;"><path d="M0,0.06 L50,0.06" style="stroke:#000000;stroke-linecap:butt;stroke-width:0.12;"></path></svg></div>"#,
        );
        for (id, html) in footnotes {
            footer.push_str(&format!(
                r#"<div class="hcD"><div class="hcI"><div class="haN" style="left:0mm;top:0mm;width:2.93mm;height:3.18mm;"><span class="hrt">{id})</span></div>{html}</div></div>"#,
                id = id,
                html = html
            ));
        }
    }

    if !endnotes.is_empty() {
        for (id, html) in endnotes {
            footer.push_str(&format!(
                r#"<div class="hcD"><div class="hcI"><div class="haN" style="left:0mm;top:0mm;width:2.93mm;height:3.18mm;"><span class="hrt">{id})</span></div>{html}</div></div>"#,
                id = id,
                html = html
            ));
        }
    }

    // </div> (hpa 닫기 태그) 앞에 삽입
    if let Some(pos) = page_html.rfind("</div>") {
        page_html.insert_str(pos, &footer);
    } else {
        page_html.push_str(&footer);
    }
    page_html
}

/// Container 도형 렌더링 (하위 도형 재귀)
fn render_container_layout(
    container: &hwp_model::shape::ContainerObject,
    resources: &hwp_model::resources::Resources,
    binaries: &hwp_model::document::BinaryStore,
) -> String {
    let common = &container.common;
    let width_mm = styles::round_mm(styles::hwpunit_to_mm(common.size.width));
    let height_mm = styles::round_mm(styles::hwpunit_to_mm(common.size.height));
    let x_mm = styles::round_mm(styles::hwpunit_to_mm(common.position.horz_offset));
    let y_mm = styles::round_mm(styles::hwpunit_to_mm(common.position.vert_offset));

    let mut html = format!(
        r#"<div class="hsC" style="top:{:.2}mm;left:{:.2}mm;width:{:.2}mm;height:{:.2}mm;">"#,
        y_mm, x_mm, width_mm, height_mm
    );

    for child in &container.children {
        let child_html = match child {
            hwp_model::shape::ShapeObject::Picture(ref pic) => {
                layout_image::render_layout_picture(pic, binaries)
            }
            hwp_model::shape::ShapeObject::Rectangle(ref rect) => {
                if let Some(ref dt) = rect.draw_text {
                    layout_image::render_layout_textbox(&rect.common, &dt.paragraphs, resources)
                } else {
                    String::new()
                }
            }
            hwp_model::shape::ShapeObject::Container(ref sub) => {
                render_container_layout(sub, resources, binaries)
            }
            _ => String::new(),
        };
        if !child_html.is_empty() {
            html.push_str(&child_html);
        }
    }

    html.push_str("</div>");
    html
}

/// heading 마커 텍스트 폭 추정 (font metrics 없이 문자 유형별 고정 폭 사용)
/// old viewer fixture 역산: at 10pt → ASCII digit/letter ≈ 2.45mm, Korean ≈ 3.87mm
fn estimate_marker_text_width(text: &str, font_size_pt: f64) -> f64 {
    let scale = font_size_pt / 10.0;
    let has_open_paren = text.contains('(');
    let mut width = 0.0;
    for ch in text.chars() {
        width += if ch == '(' || (ch == ')' && has_open_paren) {
            2.245 * scale
        } else if ch == ')' {
            2.74 * scale
        } else if ('\u{AC00}'..='\u{D7AF}').contains(&ch) {
            // 한글 음절
            3.87 * scale
        } else if ch == '①' || ch == '②' || ch == '③' || ch == '④' || ch == '⑤'
            || ch == '⑥' || ch == '⑦' || ch == '⑧' || ch == '⑨' || ch == '⑩'
            || ch == '⑪' || ch == '⑫' || ch == '⑬' || ch == '⑭' || ch == '⑮'
        {
            4.86 * scale
        } else {
            // ASCII digit, letter, period, etc.
            2.45 * scale
        };
    }
    width
}

/// SubList(머리글/꼬리글 등) 문단을 레이아웃 HTML로 렌더링
fn render_sublist_layout(
    paragraphs: &[hwp_model::paragraph::Paragraph],
    resources: &hwp_model::resources::Resources,
) -> String {
    let mut parts = Vec::new();
    for para in paragraphs {
        let flat = flat_text::extract_flat_text(para);
        if flat.text.is_empty() {
            continue;
        }
        let ps_class = format!("ps{}", para.para_shape_id);
        let lines = layout_line_segment::render_line_segments(
            &flat.text,
            &flat.char_shapes,
            &para.line_segments,
            resources,
            &ps_class,
            0.0,
        );
        parts.extend(lines);
    }
    parts.join("")
}

/// 시맨틱 모드 HTML 생성 (기존 동작)
fn doc_to_html_semantic(doc: &Document, options: &DocHtmlOptions) -> String {
    let mut body_parts: Vec<String> = Vec::new();
    let mut header_parts: Vec<String> = Vec::new();
    let mut footer_parts: Vec<String> = Vec::new();
    let mut footnote_parts: Vec<String> = Vec::new();
    let mut endnote_parts: Vec<String> = Vec::new();
    let mut footnote_counter: u16 = 0;
    let mut endnote_counter: u16 = 0;

    // 개요/번호 추적기
    let mut outline_tracker = crate::viewer::core::outline::OutlineNumberTracker::new();
    let mut number_tracker: std::collections::HashMap<
        u16,
        crate::viewer::core::outline::OutlineNumberTracker,
    > = std::collections::HashMap::new();

    // CSS 스타일 생성
    let css = if !options.inline_style {
        styles::generate_css(doc, &options.css_class_prefix)
    } else {
        String::new()
    };

    for (section_idx, section) in doc.sections.iter().enumerate() {
        // 섹션 간 구분선
        if section_idx > 0 && !body_parts.is_empty() {
            body_parts.push(format!("<hr class=\"{}section-break\">", options.css_class_prefix));
        }

        for para in &section.paragraphs {
            // 페이지 구분선
            if para.page_break && !body_parts.is_empty() {
                body_parts.push(format!(
                    "<hr class=\"{}page-break\">",
                    options.css_class_prefix
                ));
            }

            let (body_html, ctrl_parts) = paragraph::render_paragraph_with_tracker(
                para,
                &doc.resources,
                &doc.binaries,
                options,
                &mut footnote_counter,
                &mut endnote_counter,
                &mut outline_tracker,
                &mut number_tracker,
            );

            // 각주/미주 인라인 참조를 수집 (본문 뒤에 붙임)
            let mut inline_refs = String::new();
            for part in ctrl_parts {
                match part {
                    HtmlControlPart::Header(html) => header_parts.push(html),
                    HtmlControlPart::Footer(html) => footer_parts.push(html),
                    HtmlControlPart::Footnote { id, html } => {
                        inline_refs.push_str(&format!(
                            "<sup><a href=\"#fn-{}\" id=\"fnref-{}\">[{}]</a></sup>",
                            id, id, id
                        ));
                        footnote_parts.push(format!(
                            "<div id=\"fn-{}\" class=\"{}footnote\"><a href=\"#fnref-{}\">↩</a> {}</div>",
                            id, options.css_class_prefix, id, html
                        ));
                    }
                    HtmlControlPart::Endnote { id, html } => {
                        inline_refs.push_str(&format!(
                            "<sup><a href=\"#en-{}\" id=\"enref-{}\">[e{}]</a></sup>",
                            id, id, id
                        ));
                        endnote_parts.push(format!(
                            "<div id=\"en-{}\" class=\"{}endnote\"><a href=\"#enref-{}\">↩</a> {}</div>",
                            id, options.css_class_prefix, id, html
                        ));
                    }
                }
            }

            if !body_html.is_empty() {
                if !inline_refs.is_empty() {
                    // 각주/미주 참조를 본문 마지막 </p> 앞에 삽입
                    if let Some(pos) = body_html.rfind("</p>") {
                        let mut merged = body_html;
                        merged.insert_str(pos, &inline_refs);
                        body_parts.push(merged);
                    } else {
                        // <p>가 없는 경우 (블록 요소): 뒤에 붙임
                        body_parts.push(format!("{}{}", body_html, inline_refs));
                    }
                } else {
                    body_parts.push(body_html);
                }
            } else if !inline_refs.is_empty() {
                body_parts.push(inline_refs);
            }
        }
    }

    // HTML 조합
    let mut html = String::new();

    if !css.is_empty() {
        html.push_str(&format!("<style>\n{}</style>\n", css));
    }

    if !header_parts.is_empty() {
        html.push_str(&format!(
            "<header class=\"{}header\">\n{}\n</header>\n",
            options.css_class_prefix,
            header_parts.join("\n")
        ));
    }

    html.push_str("<div class=\"");
    html.push_str(&options.css_class_prefix);
    html.push_str("body\">\n");
    html.push_str(&body_parts.join("\n"));
    html.push_str("\n</div>\n");

    if !footer_parts.is_empty() {
        html.push_str(&format!(
            "<footer class=\"{}footer\">\n{}\n</footer>\n",
            options.css_class_prefix,
            footer_parts.join("\n")
        ));
    }

    if !footnote_parts.is_empty() {
        html.push_str(&format!(
            "<section class=\"{}footnotes\">\n{}\n</section>\n",
            options.css_class_prefix,
            footnote_parts.join("\n")
        ));
    }

    if !endnote_parts.is_empty() {
        html.push_str(&format!(
            "<section class=\"{}endnotes\">\n{}\n</section>\n",
            options.css_class_prefix,
            endnote_parts.join("\n")
        ));
    }

    html
}

/// HTML 컨트롤에서 추출된 문서 부분
pub(crate) enum HtmlControlPart {
    Header(String),
    Footer(String),
    Footnote { id: u16, html: String },
    Endnote { id: u16, html: String },
}

/// SubList 내부의 문단들을 HTML로 렌더링
pub(crate) fn render_sublist_paragraphs(
    paragraphs: &[hwp_model::paragraph::Paragraph],
    resources: &hwp_model::resources::Resources,
    binaries: &hwp_model::document::BinaryStore,
    options: &DocHtmlOptions,
) -> String {
    let mut parts = Vec::new();
    let mut fn_ctr: u16 = 0;
    let mut en_ctr: u16 = 0;
    for para in paragraphs {
        let (body, _) = paragraph::render_paragraph(
            para,
            resources,
            binaries,
            options,
            &mut fn_ctr,
            &mut en_ctr,
        );
        if !body.is_empty() {
            parts.push(body);
        }
    }
    parts.join("\n")
}
