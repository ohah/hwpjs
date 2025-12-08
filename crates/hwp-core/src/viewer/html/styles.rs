/// CSS 스타일 생성 관련 모듈 / CSS style generation module
use crate::document::HwpDocument;

/// 문서에서 사용되는 색상, 크기, 테두리 색상, 배경색, 테두리 두께 수집 / Collect colors, sizes, border colors, background colors, and border widths used in document
pub fn collect_used_styles(
    document: &HwpDocument,
) -> (
    std::collections::HashSet<u32>, // text colors
    std::collections::HashSet<u32>, // sizes
    std::collections::HashSet<u32>, // border colors
    std::collections::HashSet<u32>, // background colors
    std::collections::HashSet<u8>,  // border widths
) {
    use crate::document::ParagraphRecord;
    let mut text_colors = std::collections::HashSet::new();
    let mut sizes = std::collections::HashSet::new();
    let border_colors = std::collections::HashSet::new();
    let mut background_colors = std::collections::HashSet::new();
    let border_widths = std::collections::HashSet::new();

    // BorderFill에서 배경색 수집 / Collect background colors from BorderFill
    // border 관련 수집은 비활성화 / Border collection is disabled
    for border_fill in &document.doc_info.border_fill {
        // 배경색 수집 / Collect background colors
        use crate::document::FillInfo;
        if let FillInfo::Solid(solid) = &border_fill.fill {
            // 배경색이 0이 아닌 경우 모두 수집 (흰색 포함) / Collect all non-zero background colors (including white)
            if solid.background_color.0 != 0 {
                background_colors.insert(solid.background_color.0);
            }
        }
    }

    // 재귀적으로 레코드를 검색하는 내부 함수 / Internal function to recursively search records
    fn search_in_records(
        records: &[ParagraphRecord],
        text_colors: &mut std::collections::HashSet<u32>,
        sizes: &mut std::collections::HashSet<u32>,
        document: &HwpDocument,
    ) {
        for record in records {
            match record {
                ParagraphRecord::ParaCharShape { shapes } => {
                    // CharShapeInfo에서 shape_id를 사용하여 실제 CharShape 가져오기
                    // Get actual CharShape using shape_id from CharShapeInfo
                    for shape_info in shapes {
                        let shape_id = shape_info.shape_id as usize;
                        if shape_id > 0 && shape_id <= document.doc_info.char_shapes.len() {
                            let shape_idx = shape_id - 1; // 1-based to 0-based
                            if let Some(char_shape) = document.doc_info.char_shapes.get(shape_idx) {
                                // 텍스트 색상 수집 / Collect text color
                                if char_shape.text_color.0 != 0 {
                                    text_colors.insert(char_shape.text_color.0);
                                }
                                // 크기 수집 / Collect size
                                if char_shape.base_size > 0 {
                                    sizes.insert(char_shape.base_size as u32);
                                }
                            }
                        }
                    }
                }
                ParagraphRecord::CtrlHeader {
                    children,
                    paragraphs,
                    ..
                } => {
                    // CtrlHeader의 children도 검색 / Search CtrlHeader's children
                    search_in_records(children, text_colors, sizes, document);
                    // CtrlHeader의 paragraphs도 검색 / Search CtrlHeader's paragraphs
                    for paragraph in paragraphs {
                        search_in_records(&paragraph.records, text_colors, sizes, document);
                    }
                }
                _ => {}
            }
        }
    }

    // 모든 섹션의 문단들을 검색 / Search all paragraphs in all sections
    for section in &document.body_text.sections {
        for paragraph in &section.paragraphs {
            search_in_records(&paragraph.records, &mut text_colors, &mut sizes, document);
        }
    }

    (
        text_colors,
        sizes,
        border_colors,
        background_colors,
        border_widths,
    )
}

/// Generate CSS styles
/// CSS 스타일 생성
pub fn generate_css_styles(
    css_prefix: &str,
    document: &HwpDocument,
    _page_def_opt: Option<&crate::document::bodytext::PageDef>, // TODO: 레이아웃 깨짐 문제로 인해 일단 사용 안 함 / Temporarily unused due to layout issues
    used_text_colors: &std::collections::HashSet<u32>,
    used_sizes: &std::collections::HashSet<u32>,
    used_border_colors: &std::collections::HashSet<u32>,
    used_background_colors: &std::collections::HashSet<u32>,
) -> String {
    use crate::viewer::html::page_def::find_page_def_for_section;

    // face_names를 사용하여 폰트 CSS 생성 / Generate font CSS using face_names
    let mut font_css = String::new();
    let mut font_families = Vec::new();

    for (idx, face_name) in document.doc_info.face_names.iter().enumerate() {
        // 폰트 이름을 CSS-safe하게 변환 / Convert font name to CSS-safe
        let font_name = face_name.name.replace('"', "'");
        let _css_font_name = format!("hwp-font-{}", idx);

        // @font-face는 실제 폰트 파일이 필요하므로, font-family만 생성
        // @font-face requires actual font files, so only generate font-family
        font_families.push(format!("\"{}\"", font_name));

        // 폰트 클래스 생성 (선택적) / Generate font class (optional)
        font_css.push_str(&format!(
            "    .{css_prefix}font-{idx} {{\n        font-family: \"{font_name}\", sans-serif;\n    }}\n\n",
            css_prefix = css_prefix,
            idx = idx,
            font_name = font_name
        ));
    }

    // 기본 폰트 패밀리 생성 / Generate default font family
    let default_font_family = if !font_families.is_empty() {
        format!("{}, ", font_families.join(", "))
    } else {
        String::new()
    };

    // 텍스트 색상 클래스 생성 / Generate text color classes
    // 순서 보장을 위해 정렬 / Sort to ensure consistent order
    let mut color_css = String::new();
    let mut sorted_colors: Vec<u32> = used_text_colors.iter().copied().collect();
    sorted_colors.sort();
    for &color_value in &sorted_colors {
        let color = crate::types::COLORREF(color_value);
        let r = color.r();
        let g = color.g();
        let b = color.b();
        color_css.push_str(&format!(
            "    .{0}color-{1:02x}{2:02x}{3:02x} {{\n        color: rgb({4}, {5}, {6});\n    }}\n\n",
            css_prefix, r, g, b, r, g, b
        ));
    }

    // 테두리 색상 클래스 생성 (방향별) - 비활성화 / Generate border color classes (by direction) - disabled
    let border_color_css = String::new();
    let border_directions = ["left", "right", "top", "bottom"];
    let _ = used_border_colors; // 사용하지 않지만 변수는 유지
    let _ = border_directions; // 사용하지 않지만 변수는 유지

    // 배경색 클래스 생성 / Generate background color classes
    // 순서 보장을 위해 정렬 / Sort to ensure consistent order
    let mut background_color_css = String::new();
    let mut sorted_bg_colors: Vec<u32> = used_background_colors.iter().copied().collect();
    sorted_bg_colors.sort();
    for &color_value in &sorted_bg_colors {
        let color = crate::types::COLORREF(color_value);
        let r = color.r();
        let g = color.g();
        let b = color.b();
        // 테이블 셀에 우선 적용되도록 !important 추가 / Add !important to ensure it applies to table cells
        background_color_css.push_str(&format!(
            "    .{0}bg-color-{1:02x}{2:02x}{3:02x} {{\n        background-color: rgb({4}, {5}, {6}) !important;\n    }}\n\n",
            css_prefix, r, g, b, r, g, b
        ));
    }

    // 테두리 스타일 및 두께 클래스 생성 (방향별) - 비활성화 / Generate border style and width classes (by direction) - disabled
    let border_style_css = String::new();
    let border_width_css = String::new();
    let _ = document; // 사용하지 않지만 변수는 유지

    // 크기 클래스 생성 / Generate size classes
    // 순서 보장을 위해 정렬 / Sort to ensure consistent order
    let mut size_css = String::new();
    let mut sorted_sizes: Vec<u32> = used_sizes.iter().copied().collect();
    sorted_sizes.sort();
    for &size_value in &sorted_sizes {
        let size_pt = size_value as f32 / 100.0;
        let size_int = (size_pt * 100.0) as u32; // 13.00pt -> 1300
        size_css.push_str(&format!(
            "    .{css_prefix}size-{size_int} {{\n        font-size: {size_pt:.2}pt;\n    }}\n\n",
            css_prefix = css_prefix,
            size_int = size_int,
            size_pt = size_pt
        ));
    }

    // ParaShape CSS 클래스 생성 / Generate ParaShape CSS classes
    let mut para_shape_css = String::new();
    use crate::document::docinfo::para_shape::ParagraphAlignment;

    for (idx, para_shape) in document.doc_info.para_shapes.iter().enumerate() {
        let mut para_style = Vec::new();

        // 여백 처리 / Process margins
        // 레거시 코드와 동일하게 변환 / Convert same as legacy code
        // paragraph_spacing.top.hwpPt(true) / 2 → (top_spacing / 100) / 2 = top_spacing / 200 pt
        // HWPUNIT를 pt로 변환: HWPUNIT / 100 = pt
        if para_shape.top_spacing != 0 {
            let top_spacing_pt = para_shape.top_spacing as f64 / 200.0; // 레거시: hwpPt(true) / 2
            para_style.push(format!("margin-top: {:.2}pt;", top_spacing_pt));
        }
        if para_shape.bottom_spacing != 0 {
            let bottom_spacing_pt = para_shape.bottom_spacing as f64 / 200.0; // 레거시: hwpPt(true) / 2
            para_style.push(format!("margin-bottom: {:.2}pt;", bottom_spacing_pt));
        }

        // indent, left, right는 px 단위로 변환 (레거시 코드와 동일) / Convert indent, left, right to px (same as legacy)
        // 레거시: indent * (-0.003664154103852596) px
        const HWPUNIT_TO_PX: f64 = -0.003664154103852596;

        if para_shape.indent != 0 {
            // 레거시: text-indent:-${indent * (-0.003664154103852596)}px
            let indent_px_value = para_shape.indent as f64 * HWPUNIT_TO_PX;
            let text_indent_px = -indent_px_value;
            para_style.push(format!("text-indent: {:.2}px;", text_indent_px));

            // 레거시: padding-left:${indent * (-0.003664154103852596)}px
            // left_margin이 없을 때만 indent의 padding-left 설정
            if para_shape.left_margin == 0 {
                para_style.push(format!("padding-left: {:.2}px;", indent_px_value));
            }
        }

        if para_shape.left_margin != 0 {
            // 레거시: padding-left:${left * (-0.003664154103852596)}px
            // left_margin이 있으면 indent의 padding-left를 덮어씀
            let left_px = para_shape.left_margin as f64 * HWPUNIT_TO_PX;
            para_style.push(format!("padding-left: {:.2}px;", left_px));
        }

        if para_shape.right_margin != 0 {
            // 레거시: padding-right:${right * (-0.003664154103852596)}px
            let right_px = para_shape.right_margin as f64 * HWPUNIT_TO_PX;
            para_style.push(format!("padding-right: {:.2}px;", right_px));
        }

        // 정렬 / Alignment
        let align = match para_shape.attributes1.align {
            ParagraphAlignment::Left => "left",
            ParagraphAlignment::Right => "right",
            ParagraphAlignment::Center => "center",
            ParagraphAlignment::Justify => "justify",
            ParagraphAlignment::Distribute => "justify",
            ParagraphAlignment::Divide => "justify",
        };
        para_style.push(format!("text-align: {};", align));

        if !para_style.is_empty() {
            para_shape_css.push_str(&format!(
                "    .{css_prefix}parashape-{idx} {{\n        {styles}\n    }}\n\n",
                css_prefix = css_prefix,
                idx = idx,
                styles = para_style.join("\n        ")
            ));
        }
    }

    // 섹션별 CSS 생성 / Generate CSS for each section
    let mut section_css = String::new();
    for (section_idx, section) in document.body_text.sections.iter().enumerate() {
        if let Some(page_def) = find_page_def_for_section(section) {
            // mm 단위로 변환 / Convert to mm
            // 용지 방향에 따라 width와 height 결정 / Determine width and height based on paper direction
            use crate::document::bodytext::PaperDirection;
            let (paper_width_mm, paper_height_mm) = match page_def.attributes.paper_direction {
                PaperDirection::Vertical => {
                    // 세로 방향: width < height / Vertical: width < height
                    (page_def.paper_width.to_mm(), page_def.paper_height.to_mm())
                }
                PaperDirection::Horizontal => {
                    // 가로 방향: width와 height를 바꿈 / Horizontal: swap width and height
                    (page_def.paper_height.to_mm(), page_def.paper_width.to_mm())
                }
            };
            let left_margin_mm = page_def.left_margin.to_mm();
            let right_margin_mm = page_def.right_margin.to_mm();
            let top_margin_mm = page_def.top_margin.to_mm();
            let bottom_margin_mm = page_def.bottom_margin.to_mm();
            let header_margin_mm = page_def.header_margin.to_mm();
            let footer_margin_mm = page_def.footer_margin.to_mm();

            section_css.push_str(&format!(
                r#"
    /* Section {section_idx} Styles */
    .{css_prefix}Section-{section_idx} {{
        width: 100%;
        margin: 0;
        padding: 0;
    }}

    .{css_prefix}Section-{section_idx} .{css_prefix}Paper {{
        width: {paper_width_mm:.2}mm;
        min-height: {paper_height_mm:.2}mm;
        margin: 0 auto 40px auto;
        background-color: #fff;
        position: relative;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }}

    .{css_prefix}Section-{section_idx} .{css_prefix}Page {{
        width: 100%;
        min-height: {paper_height_mm:.2}mm;
        padding: {top_margin_mm:.2}mm {right_margin_mm:.2}mm {bottom_margin_mm:.2}mm {left_margin_mm:.2}mm;
        box-sizing: border-box;
    }}

    .{css_prefix}Section-{section_idx} .{css_prefix}HeaderPageFooter {{
        width: 100%;
        position: absolute;
        left: 0;
        padding: 0 {right_margin_mm:.2}mm 0 {left_margin_mm:.2}mm;
        box-sizing: border-box;
    }}

    .{css_prefix}Section-{section_idx} .{css_prefix}HeaderPageFooter.{css_prefix}Header {{
        top: 0;
        height: {header_margin_mm:.2}mm;
    }}

    .{css_prefix}Section-{section_idx} .{css_prefix}HeaderPageFooter.{css_prefix}Footer {{
        bottom: 0;
        height: {footer_margin_mm:.2}mm;
    }}
"#,
                section_idx = section_idx,
                css_prefix = css_prefix,
                paper_width_mm = paper_width_mm,
                paper_height_mm = paper_height_mm,
                right_margin_mm = right_margin_mm,
                left_margin_mm = left_margin_mm,
                top_margin_mm = top_margin_mm,
                bottom_margin_mm = bottom_margin_mm,
                header_margin_mm = header_margin_mm,
                footer_margin_mm = footer_margin_mm,
            ));
        }
    }

    // 기본값 사용 / Use default values
    // max-width는 제거하여 섹션의 Paper 크기에 맞게 자동 조정 / Remove max-width to auto-adjust to section Paper size
    let max_width_px = "none";
    let padding_left_px = 20.0;
    let padding_right_px = 20.0;
    let padding_top_px = 20.0;
    let padding_bottom_px = 20.0;

    format!(
        r#"
    /* CSS Reset - 브라우저 기본 스타일 초기화 / CSS Reset - Reset browser default styles */
    *, *::before, *::after {{
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        /* 논리적 속성 초기화 / Reset logical properties */
        margin-block-start: 0;
        margin-block-end: 0;
        margin-inline-start: 0;
        margin-inline-end: 0;
        padding-block-start: 0;
        padding-block-end: 0;
        padding-inline-start: 0;
        padding-inline-end: 0;
    }}

    html, body {{
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
    }}

    html {{
        font-size: 100%;
        -webkit-text-size-adjust: 100%;
        -ms-text-size-adjust: 100%;
    }}

    body {{
        font-size: 1rem;
        line-height: 1;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        background-color: #f5f5f5;
    }}

    /* Typography reset */
    h1, h2, h3, h4, h5, h6 {{
        margin: 0;
        padding: 0;
        margin-block-start: 0;
        margin-block-end: 0;
        margin-inline-start: 0;
        margin-inline-end: 0;
        padding-block-start: 0;
        padding-block-end: 0;
        padding-inline-start: 0;
        padding-inline-end: 0;
        font-size: 1em;
        font-weight: normal;
        line-height: 1;
        display: block;
        unicode-bidi: normal;
    }}

    p, blockquote, pre {{
        margin: 0;
        padding: 0;
        margin-block-start: 0;
        margin-block-end: 0;
        margin-inline-start: 0;
        margin-inline-end: 0;
        padding-block-start: 0;
        padding-block-end: 0;
        padding-inline-start: 0;
        padding-inline-end: 0;
        display: block;
        unicode-bidi: normal;
    }}

    /* Links */
    a {{
        margin: 0;
        padding: 0;
        text-decoration: none;
        color: inherit;
        background-color: transparent;
    }}

    a:active, a:hover {{
        outline: 0;
    }}

    /* Lists */
    ul, ol, li {{
        margin: 0;
        padding: 0;
        margin-block-start: 0;
        margin-block-end: 0;
        margin-inline-start: 0;
        margin-inline-end: 0;
        padding-block-start: 0;
        padding-block-end: 0;
        padding-inline-start: 0;
        padding-inline-end: 0;
        list-style: none;
    }}
    
    ul, ol {{
        display: block;
    }}
    
    li {{
        display: list-item;
    }}

    /* Tables */
    table {{
        display: table;
        border-collapse: collapse;
        border-spacing: 0;
        border-color: transparent;
        width: 100%;
        table-layout: auto;
        empty-cells: show;
    }}

    thead, tbody, tfoot {{
        margin: 0;
        padding: 0;
        border: 0;
    }}

    tr {{
        margin: 0;
        padding: 0;
        border: 0;
        display: table-row;
        vertical-align: inherit;
    }}

    th, td {{
        margin: 0;
        padding: 0;
        /* border: 0 제거 - border 클래스가 적용되도록 / Remove border: 0 to allow border classes to apply */
        text-align: left;
        font-weight: normal;
        font-style: normal;
        vertical-align: top;
        display: table-cell;
    }}

    th {{
        font-weight: normal;
    }}

    caption {{
        margin: 0;
        padding: 0;
        text-align: center;
    }}

    /* Forms */
    button, input, select, textarea {{
        margin: 0;
        padding: 0;
        border: 0;
        outline: 0;
        font: inherit;
        color: inherit;
        background: transparent;
        vertical-align: baseline;
    }}

    button, input {{
        overflow: visible;
    }}

    button, select {{
        text-transform: none;
    }}

    button, [type="button"], [type="reset"], [type="submit"] {{
        -webkit-appearance: button;
        cursor: pointer;
    }}

    button::-moz-focus-inner, [type="button"]::-moz-focus-inner, [type="reset"]::-moz-focus-inner, [type="submit"]::-moz-focus-inner {{
        border-style: none;
        padding: 0;
    }}

    input[type="checkbox"], input[type="radio"] {{
        box-sizing: border-box;
        padding: 0;
    }}

    textarea {{
        overflow: auto;
        resize: vertical;
    }}

    /* Images and media */
    img, svg, video, canvas, audio, iframe, embed, object {{
        display: block;
        max-width: 100%;
        height: auto;
        border: 0;
        vertical-align: middle;
    }}

    img {{
        border-style: none;
    }}

    svg:not(:root) {{
        overflow: hidden;
    }}

    /* Other elements */
    hr {{
        margin: 0;
        padding: 0;
        border: 0;
        height: 0;
    }}

    code, kbd, samp, pre {{
        font-family: monospace, monospace;
        font-size: 1em;
    }}

    abbr[title] {{
        border-bottom: none;
        text-decoration: underline;
        text-decoration: underline dotted;
    }}

    b, strong {{
        font-weight: normal;
    }}

    i, em {{
        font-style: normal;
    }}

    small {{
        font-size: 80%;
    }}

    sub, sup {{
        font-size: 75%;
        line-height: 0;
        position: relative;
        vertical-align: baseline;
    }}

    sub {{
        bottom: -0.25em;
    }}

    sup {{
        top: -0.5em;
    }}

    /* Additional resets */
    article, aside, details, figcaption, figure, footer, header, hgroup, main, menu, nav, section {{
        display: block;
        margin: 0;
        padding: 0;
        margin-block-start: 0;
        margin-block-end: 0;
        margin-inline-start: 0;
        margin-inline-end: 0;
        padding-block-start: 0;
        padding-block-end: 0;
        padding-inline-start: 0;
        padding-inline-end: 0;
    }}
    
    /* Block-level elements reset */
    div, address, dl, dt, dd, fieldset, form, legend {{
        margin: 0;
        padding: 0;
        margin-block-start: 0;
        margin-block-end: 0;
        margin-inline-start: 0;
        margin-inline-end: 0;
        padding-block-start: 0;
        padding-block-end: 0;
        padding-inline-start: 0;
        padding-inline-end: 0;
    }}
    
    div {{
        display: block;
    }}

    summary {{
        display: list-item;
    }}

    /* HWP Document Styles */
    .{css_prefix}document {{
        max-width: {max_width_px};
        margin: 0 auto;
        padding: {padding_top_px}px {padding_right_px}px {padding_bottom_px}px {padding_left_px}px;
        font-family: {default_font_family}-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        line-height: 1.6;
    }}
{font_css}

    /* Section and Page Styles */
    .{css_prefix}Section {{
        width: 100%;
        margin: 0;
        padding: 0;
        margin-bottom: 40px;
    }}

    .{css_prefix}Paper {{
        width: 100%;
        margin: 0 auto;
        background-color: #fff;
        position: relative;
    }}

    .{css_prefix}Page {{
        width: 100%;
        box-sizing: border-box;
    }}

    .{css_prefix}HeaderPageFooter {{
        width: 100%;
        position: absolute;
        left: 0;
        box-sizing: border-box;
    }}

    .{css_prefix}HeaderPageFooter.{css_prefix}Header {{
        top: 0;
    }}

    .{css_prefix}HeaderPageFooter.{css_prefix}Footer {{
        bottom: 0;
    }}

{section_css}

    .{css_prefix}header {{
        margin-bottom: 20px;
    }}

    .{css_prefix}footer {{
        margin-top: 20px;
        border-top: 1px solid #ddd;
        padding-top: 10px;
    }}

    .{css_prefix}main {{
        margin: 20px 0;
    }}

    .{css_prefix}paragraph {{
    }}

    .{css_prefix}outline {{
        display: block;
        margin: 10px 0;
    }}

    .{css_prefix}table {{
        border-collapse: collapse;
        width: 100%;
        margin: 10px 0;
    }}

    .{css_prefix}table th,
    .{css_prefix}table td {{
        padding: 8px;
        text-align: left;
        border: 1px solid black;
    }}

    .{css_prefix}table th {{
        font-weight: bold;
    }}
    
    /* 테이블 셀 배경색은 bg-color 클래스로 처리 / Table cell background colors are handled by bg-color classes */

    .{css_prefix}image {{
        max-width: 100%;
        height: auto;
        margin: 10px 0;
    }}

    .{css_prefix}footnote-ref,
    .{css_prefix}endnote-ref {{
        text-decoration: none;
        color: #0066cc;
        font-weight: bold;
    }}

    .{css_prefix}footnote-ref:hover,
    .{css_prefix}endnote-ref:hover {{
        text-decoration: underline;
    }}

    .{css_prefix}footnote,
    .{css_prefix}endnote {{
        margin: 10px 0;
        padding: 10px;
        background-color: #f9f9f9;
        border-left: 3px solid #0066cc;
    }}

    .{css_prefix}footnotes,
    .{css_prefix}endnotes {{
        margin-top: 40px;
        padding-top: 20px;
        border-top: 2px solid #ddd;
    }}

    .{css_prefix}page-number {{
        font-weight: normal;
    }}

    .{css_prefix}overline {{
        text-decoration: overline;
    }}

    .{css_prefix}emboss {{
        text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.3);
    }}

    .{css_prefix}engrave {{
        text-shadow: -1px -1px 1px rgba(0, 0, 0, 0.3);
    }}

    .{css_prefix}underline-solid {{
        text-decoration: underline;
        text-decoration-style: solid;
    }}

    .{css_prefix}underline-dotted {{
        text-decoration: underline;
        text-decoration-style: dotted;
    }}

    .{css_prefix}underline-dashed {{
        text-decoration: underline;
        text-decoration-style: dashed;
    }}

    .{css_prefix}underline-double {{
        text-decoration: underline;
        text-decoration-style: double;
    }}

    .{css_prefix}strikethrough-solid {{
        text-decoration: line-through;
        text-decoration-style: solid;
    }}

    .{css_prefix}strikethrough-dotted {{
        text-decoration: line-through;
        text-decoration-style: dotted;
    }}

    .{css_prefix}strikethrough-dashed {{
        text-decoration: line-through;
        text-decoration-style: dashed;
    }}

    .{css_prefix}footnote-back,
    .{css_prefix}endnote-back {{
        text-decoration: none;
        color: #0066cc;
        margin-left: 5px;
    }}

    .{css_prefix}footnote-back:hover,
    .{css_prefix}endnote-back:hover {{
        text-decoration: underline;
    }}

    .{css_prefix}page-break {{
        border: none;
        border-top: 2px solid #ddd;
        margin: 20px 0;
    }}

    .{css_prefix}emphasis-1::before {{
        content: "●";
        margin-right: 3px;
    }}

    .{css_prefix}emphasis-2::before {{
        content: "○";
        margin-right: 3px;
    }}

    .{css_prefix}emphasis-3::before {{
        content: "◆";
        margin-right: 3px;
    }}

    .{css_prefix}emphasis-4::before {{
        content: "◇";
        margin-right: 3px;
    }}

    .{css_prefix}emphasis-5::before {{
        content: "■";
        margin-right: 3px;
    }}

    .{css_prefix}emphasis-6::before {{
        content: "□";
        margin-right: 3px;
    }}

    .{css_prefix}emphasis-7::before {{
        content: "★";
        margin-right: 3px;
    }}

    .{css_prefix}emphasis-8::before {{
        content: "☆";
        margin-right: 3px;
    }}

               {color_css}
               {size_css}
               {border_color_css}
               {background_color_css}
               {border_style_css}
               {border_width_css}
               {para_shape_css}
               {section_css}
               "#,
        css_prefix = css_prefix,
        default_font_family = default_font_family,
        font_css = font_css,
        max_width_px = max_width_px,
        padding_top_px = padding_top_px,
        padding_right_px = padding_right_px,
        padding_bottom_px = padding_bottom_px,
        padding_left_px = padding_left_px,
        color_css = color_css,
        size_css = size_css,
        border_color_css = border_color_css,
        background_color_css = background_color_css,
        border_style_css = border_style_css,
        border_width_css = border_width_css,
        para_shape_css = para_shape_css,
        section_css = section_css
    )
}
