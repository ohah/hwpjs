use super::common;
use super::ctrl_header::{self, FootnoteEndnoteState, ShapePositionContext};
use super::line_segment::{
    DocumentRenderState, ImageInfo, LineSegmentContent, LineSegmentRenderContext, TableInfo,
};
use super::pagination::{self, PageBreakReason, PaginationContext, PaginationResult};
use super::text::{self, extract_text_and_shapes};
use super::HtmlOptions;
use crate::document::bodytext::{
    control_char::ControlChar,
    ctrl_header::{CtrlHeaderData, VertRelTo},
    LineSegmentInfo, PageDef, ParagraphRecord,
};
use crate::document::{HwpDocument, Paragraph};
use crate::viewer::core::outline::{
    compute_paragraph_marker, MarkerInfo, NumberTracker, OutlineNumberTracker,
};
use crate::viewer::html::ctrl_header::table::{render_table, TablePosition, TableRenderContext};
use crate::INT32;
use std::collections::HashMap;

/// 문단 위치 정보 / Paragraph position information
pub struct ParagraphPosition<'a> {
    pub hcd_position: Option<(f64, f64)>,
    pub page_def: Option<&'a PageDef>,
    pub first_para_vertical_mm: Option<f64>,
    pub current_para_vertical_mm: Option<f64>,
    pub current_para_index: Option<usize>,
    /// 페이지 콘텐츠 영역 높이(mm). vert_rel_to=para인 테이블이 넘칠 때 앵커 위로 올려 배치하는 데 사용.
    pub content_height_mm: Option<f64>,
    /// 테이블이 페이지에 걸쳐 나뉠 때 이번 페이지에 그리는 조각 높이(mm). 재렌더 시 연속 조각에만 Some(remainder).
    pub table_fragment_height_mm: Option<f64>,
    /// 재렌더 시 table_fragment_height_mm을 적용할 테이블의 루프 인덱스(0-based). None이면 첫 테이블(0)에만 적용.
    pub table_fragment_apply_at_index: Option<usize>,
    /// 현재 페이지 번호 (1-based, inside/outside 정렬에 사용)
    pub page_number: usize,
}

/// 문단 렌더링 컨텍스트 / Paragraph rendering context
pub struct ParagraphRenderContext<'a> {
    pub document: &'a HwpDocument,
    pub options: &'a HtmlOptions,
    pub position: ParagraphPosition<'a>,
    pub body_default_hls: Option<(f64, f64)>,
}

/// 문단 렌더링 상태 / Paragraph rendering state
pub struct ParagraphRenderState<'a> {
    pub table_counter: &'a mut u32,
    pub pattern_counter: &'a mut usize,
    pub color_to_pattern: &'a mut HashMap<u32, String>,
    /// 각주/미주 수집 (문서 레벨). None이면 수집하지 않음.
    pub note_state: Option<&'a mut FootnoteEndnoteState<'a>>,
    /// 개요 번호 추적기 (본문 렌더 시에만 사용, fragment는 None)
    pub outline_tracker: Option<&'a mut OutlineNumberTracker>,
    /// 문단번호(Number/Bullet) 추적기 (본문 렌더 시에만 사용, fragment는 None)
    pub number_tracker: Option<&'a mut NumberTracker>,
    /// 현재 섹션의 개요 번호 정의 ID (1-based, from SectionDefinition)
    pub section_outline_numbering_id: u16,
}

/// 각주/미주 내용용 문단 목록을 HTML 조각으로 렌더링 (페이지/테이블 컨텍스트 없음)
/// Renders a list of paragraphs to HTML fragment for footnote/endnote content (no page/table context)
pub fn render_paragraphs_fragment(
    paragraphs: &[Paragraph],
    document: &HwpDocument,
    options: &HtmlOptions,
) -> String {
    render_paragraphs_fragment_with_hls(paragraphs, document, options, None)
}

pub fn render_paragraphs_fragment_with_hls(
    paragraphs: &[Paragraph],
    document: &HwpDocument,
    options: &HtmlOptions,
    body_default_hls: Option<(f64, f64)>,
) -> String {
    use std::collections::HashMap;
    let mut out = String::new();
    let mut table_counter = 1u32;
    let mut pattern_counter = 0usize;
    let mut color_to_pattern: HashMap<u32, String> = HashMap::new();
    let position = ParagraphPosition {
        hcd_position: None,
        page_def: None,
        first_para_vertical_mm: None,
        current_para_vertical_mm: None,
        current_para_index: None,
        content_height_mm: None,
        table_fragment_height_mm: None,
        table_fragment_apply_at_index: None,
        page_number: 1,
    };
    let context = ParagraphRenderContext {
        document,
        options,
        position,
        body_default_hls,
    };
    let mut state = ParagraphRenderState {
        table_counter: &mut table_counter,
        pattern_counter: &mut pattern_counter,
        color_to_pattern: &mut color_to_pattern,
        note_state: None,
        outline_tracker: None,
        number_tracker: None,
        section_outline_numbering_id: 0,
    };
    let mut pagination_context = PaginationContext {
        prev_vertical_mm: None,
        current_max_vertical_mm: 0.0,
        content_height_mm: 297.0,
    };
    for para in paragraphs {
        let (para_html, _table_htmls, _) =
            render_paragraph(para, &context, &mut state, &mut pagination_context, 0);
        if !para_html.is_empty() {
            out.push_str(&para_html);
        }
    }
    out
}

// Helper functions to reduce render_paragraph complexity
// pub(super) for reuse in document.rs multicolumn rendering
pub(super) fn collect_control_char_positions(
    paragraph: &Paragraph,
) -> (
    Vec<crate::document::bodytext::control_char::ControlCharPosition>,
    Vec<usize>,
) {
    let mut control_char_positions = Vec::new();
    let mut shape_object_anchor_positions = Vec::new();

    for record in &paragraph.records {
        if let ParagraphRecord::ParaText {
            control_char_positions: ccp,
            ..
        } = record
        {
            control_char_positions = ccp.clone();
            for pos in control_char_positions.iter() {
                if pos.code == ControlChar::SHAPE_OBJECT {
                    shape_object_anchor_positions.push(pos.position);
                }
            }
            break;
        }
    }

    (control_char_positions, shape_object_anchor_positions)
}

/// AUTO_NUMBER 위치와 display_text를 수집
/// Collect AUTO_NUMBER positions and display texts from paragraph
fn collect_auto_numbers(paragraph: &Paragraph) -> Vec<(usize, Option<String>)> {
    let mut auto_numbers: Vec<(usize, Option<String>)> = Vec::new();
    for record in &paragraph.records {
        if let ParagraphRecord::ParaText {
            control_char_positions,
            runs,
            ..
        } = record
        {
            for cc in control_char_positions {
                if cc.code == ControlChar::AUTO_NUMBER {
                    // runs에서 같은 위치의 Control run을 찾아 display_text 가져오기
                    let display_text = runs.iter().find_map(|run| {
                        if let crate::document::bodytext::ParaTextRun::Control {
                            code,
                            position,
                            display_text,
                            ..
                        } = run
                        {
                            if *code == ControlChar::AUTO_NUMBER && *position == cc.position {
                                return display_text.clone();
                            }
                        }
                        None
                    });
                    auto_numbers.push((cc.position, display_text));
                }
            }
            break;
        }
    }
    auto_numbers
}

pub(super) fn collect_line_segments(paragraph: &Paragraph) -> Vec<LineSegmentInfo> {
    let mut line_segments = Vec::new();
    for record in &paragraph.records {
        if let ParagraphRecord::ParaLineSeg { segments } = record {
            line_segments = segments.clone();
            break;
        }
    }
    line_segments
}

fn collect_images(
    paragraph: &Paragraph,
    document: &HwpDocument,
    options: &HtmlOptions,
) -> Vec<ImageInfo> {
    let mut images = Vec::new();

    for record in &paragraph.records {
        match record {
            ParagraphRecord::ShapeComponent {
                shape_component,
                children,
                ..
            } => {
                for child in children {
                    if let ParagraphRecord::ShapeComponentPicture {
                        shape_component_picture,
                    } = child
                    {
                        let bindata_id = shape_component_picture.picture_info.bindata_id;
                        let image_url = common::get_image_url(
                            document,
                            bindata_id,
                            options.image_output_dir.as_deref(),
                            options.html_output_dir.as_deref(),
                        );
                        if !image_url.is_empty() {
                            let br_width = (shape_component_picture.border_rectangle_x.right
                                - shape_component_picture.border_rectangle_x.left)
                                .max(0) as u32;
                            let br_height = (shape_component_picture.border_rectangle_y.bottom
                                - shape_component_picture.border_rectangle_y.top)
                                .max(0) as u32;
                            // border_rectangle가 유효하면 사용, 아니면 shape_component 사용
                            let (w, h) = if br_width > 0 && br_height > 0 {
                                (br_width, br_height)
                            } else {
                                (shape_component.width, shape_component.height)
                            };
                            images.push(super::line_segment::ImageInfo {
                                width: w,
                                height: h,
                                url: image_url,
                                like_letters: false,
                                vert_rel_to: None,
                            });
                        }
                    }
                }
            }
            ParagraphRecord::ShapeComponentPicture {
                shape_component_picture,
            } => {
                let bindata_id = shape_component_picture.picture_info.bindata_id;
                let image_url = common::get_image_url(
                    document,
                    bindata_id,
                    options.image_output_dir.as_deref(),
                    options.html_output_dir.as_deref(),
                );
                if !image_url.is_empty() {
                    let width = (shape_component_picture.border_rectangle_x.right
                        - shape_component_picture.border_rectangle_x.left)
                        as u32;
                    let mut height = (shape_component_picture.border_rectangle_y.bottom
                        - shape_component_picture.border_rectangle_y.top)
                        as u32;
                    if height == 0 {
                        height = (shape_component_picture.crop_rectangle.bottom
                            - shape_component_picture.crop_rectangle.top)
                            as u32;
                    }
                    images.push(super::line_segment::ImageInfo {
                        width,
                        height,
                        url: image_url,
                        like_letters: false,
                        vert_rel_to: None,
                    });
                }
            }
            _ => {}
        }
    }

    images
}

/// 문단을 HTML로 렌더링 / Render paragraph to HTML
/// 반환값: (문단 HTML, 테이블 HTML 리스트, 페이지네이션 결과) / Returns: (paragraph HTML, table HTML list, pagination result)
/// skip_tables_count: 페이지네이션 후 같은 문단을 다시 렌더링할 때 이미 처리된 테이블 수를 건너뛰기 위한 파라미터
/// skip_tables_count: Parameter to skip already processed tables when re-rendering paragraph after pagination
pub fn render_paragraph(
    paragraph: &Paragraph,
    context: &ParagraphRenderContext,
    state: &mut ParagraphRenderState,
    pagination_context: &mut PaginationContext,
    skip_tables_count: usize,
) -> (String, Vec<String>, Option<PaginationResult>) {
    // 구조체에서 개별 값 추출 / Extract individual values from structs
    let document = context.document;
    let options = context.options;
    let hcd_position = context.position.hcd_position;
    let page_def = context.position.page_def;
    let first_para_vertical_mm = context.position.first_para_vertical_mm;
    let current_para_vertical_mm = context.position.current_para_vertical_mm;
    let current_para_index = context.position.current_para_index;

    // table_counter, pattern_counter, color_to_pattern은 이미 &mut이므로 직접 사용 / table_counter, pattern_counter, color_to_pattern are already &mut, so use directly
    let mut result = String::new();

    // ParaShape 클래스 가져오기 / Get ParaShape class
    let para_shape_id = paragraph.para_header.para_shape_id;
    // HWP 파일의 para_shape_id는 0-based indexing을 사용합니다 / HWP file uses 0-based indexing for para_shape_id
    let para_shape_class = if (para_shape_id as usize) < document.doc_info.para_shapes.len() {
        format!("ps{}", para_shape_id)
    } else {
        String::new()
    };

    // 텍스트와 CharShape 추출 / Extract text and CharShape
    let (text, char_shapes) = extract_text_and_shapes(paragraph);

    // ParaText의 control_char_positions와 shape_object_anchor_positions 수집
    let (control_char_positions, shape_object_anchor_positions) =
        collect_control_char_positions(paragraph);
    let mut shape_object_anchor_cursor: usize = 0;

    // AUTO_NUMBER 위치와 display_text 수집
    let auto_numbers = collect_auto_numbers(paragraph);

    // LineSegment 수집 / Collect line segments
    let line_segments = collect_line_segments(paragraph);

    // 이미지 수집 / Collect images
    let mut images = collect_images(paragraph, document, options);

    // 테이블 수집 / Collect tables
    let mut tables: Vec<TableInfo> = Vec::new();
    // 각주/미주 본문 참조 마크업 (문단 끝에 붙임) / Footnote/endnote in-body ref markup (append at end of paragraph)
    let mut footnote_refs: Vec<String> = Vec::new();
    let mut endnote_refs: Vec<String> = Vec::new();
    // 구역/단 등 인라인 콘텐츠 (문단 끝에 붙임) / Section/column etc. inline content (append at end of paragraph)
    let mut extra_contents: Vec<String> = Vec::new();
    let mut shape_htmls: Vec<String> = Vec::new();

    for record in &paragraph.records {
        match record {
            ParagraphRecord::ShapeComponent {
                shape_component,
                children,
                ..
            } => {
                // ShapeComponent의 children에서 이미지 찾기 / Find images in ShapeComponent's children
                for child in children {
                    if let ParagraphRecord::ShapeComponentPicture {
                        shape_component_picture,
                    } = child
                    {
                        let bindata_id = shape_component_picture.picture_info.bindata_id;
                        let image_url = common::get_image_url(
                            document,
                            bindata_id,
                            options.image_output_dir.as_deref(),
                            options.html_output_dir.as_deref(),
                        );
                        if !image_url.is_empty() {
                            let br_width = (shape_component_picture.border_rectangle_x.right
                                - shape_component_picture.border_rectangle_x.left)
                                .max(0) as u32;
                            let br_height = (shape_component_picture.border_rectangle_y.bottom
                                - shape_component_picture.border_rectangle_y.top)
                                .max(0) as u32;
                            // border_rectangle가 유효하면 사용, 아니면 shape_component 사용
                            let (w, h) = if br_width > 0 && br_height > 0 {
                                (br_width, br_height)
                            } else {
                                (shape_component.width, shape_component.height)
                            };
                            images.push(ImageInfo {
                                width: w,
                                height: h,
                                url: image_url,
                                like_letters: false,
                                vert_rel_to: None,
                            });
                        }
                    }
                }
            }
            ParagraphRecord::ShapeComponentPicture {
                shape_component_picture,
            } => {
                let bindata_id = shape_component_picture.picture_info.bindata_id;
                let image_url = common::get_image_url(
                    document,
                    bindata_id,
                    options.image_output_dir.as_deref(),
                    options.html_output_dir.as_deref(),
                );
                if !image_url.is_empty() {
                    // ShapeComponentPicture가 직접 올 때는 border_rectangle 사용 (부모 ShapeComponent가 없음)
                    // When ShapeComponentPicture comes directly, use border_rectangle (no parent ShapeComponent)
                    let width = (shape_component_picture.border_rectangle_x.right
                        - shape_component_picture.border_rectangle_x.left)
                        as u32;
                    let mut height = (shape_component_picture.border_rectangle_y.bottom
                        - shape_component_picture.border_rectangle_y.top)
                        as u32;

                    // border_rectangle_y의 top과 bottom이 같으면 crop_rectangle 사용
                    // If border_rectangle_y's top and bottom are the same, use crop_rectangle
                    if height == 0 {
                        height = (shape_component_picture.crop_rectangle.bottom
                            - shape_component_picture.crop_rectangle.top)
                            as u32;
                    }

                    images.push(ImageInfo {
                        width,
                        height,
                        url: image_url,
                        like_letters: false, // ShapeComponentPicture에서 직접 온 이미지는 ctrl_header 정보 없음 / Images from ShapeComponentPicture directly have no ctrl_header info
                        vert_rel_to: None,
                    });
                }
            }
            ParagraphRecord::Table { table } => {
                tables.push(TableInfo {
                    table,
                    ctrl_header: None,
                    anchor_char_pos: None,
                    caption: None,
                });
            }
            ParagraphRecord::CtrlHeader {
                header,
                children,
                paragraphs,
                ..
            } => {
                // CtrlHeader 처리 / Process CtrlHeader
                let shape_pos_ctx = ShapePositionContext {
                    hcd_position: context.position.hcd_position,
                    page_def: context.position.page_def,
                    page_number: context.position.page_number,
                };
                let ctrl_result = ctrl_header::process_ctrl_header(
                    header,
                    children,
                    paragraphs,
                    document,
                    options,
                    state.note_state.as_deref_mut(),
                    Some(&shape_pos_ctx),
                );
                if let Some(ref s) = ctrl_result.footnote_ref_html {
                    footnote_refs.push(s.clone());
                }
                if let Some(ref s) = ctrl_result.endnote_ref_html {
                    endnote_refs.push(s.clone());
                }
                if let Some(s) = ctrl_result.extra_content {
                    extra_contents.push(s);
                }
                if let Some(s) = ctrl_result.shape_html {
                    shape_htmls.push(s);
                }
                // SHAPE_OBJECT(11)는 "표/그리기 개체" 공통 제어문자이므로, ctrl_id가 "tbl "인 경우에만
                // ParaText의 SHAPE_OBJECT 위치를 순서대로 매칭하여 anchor를 부여합니다.
                if header.ctrl_id == "tbl " {
                    let anchor = shape_object_anchor_positions
                        .get(shape_object_anchor_cursor)
                        .copied();
                    shape_object_anchor_cursor = shape_object_anchor_cursor.saturating_add(1);
                    for t in ctrl_result.tables.iter() {
                        let mut tt = t.clone();
                        tt.anchor_char_pos = anchor;
                        tables.push(tt);
                    }
                } else {
                    tables.extend(ctrl_result.tables);
                }
                images.extend(ctrl_result.images);
            }
            _ => {}
        }
    }

    // 테이블 HTML 리스트 생성 / Create table HTML list
    let mut table_htmls = Vec::new();
    // inline_tables는 owned TableInfo를 저장 / inline_tables stores owned TableInfo
    let mut inline_tables: Vec<TableInfo> = Vec::new(); // like_letters=true인 테이블들 / Tables with like_letters=true

    // 문단의 첫 번째 LineSegment의 vertical_position 계산 (vert_rel_to: "para"일 때 사용) / Calculate first LineSegment's vertical_position (used when vert_rel_to: "para")
    // current_para_vertical_mm이 전달되면 사용하고, 없으면 현재 문단의 첫 번째 LineSegment 사용
    // If current_para_vertical_mm is provided, use it; otherwise use first LineSegment of current paragraph
    // table_position 함수는 para_start_vertical_mm을 절대 위치(페이지 기준)로 기대하므로,
    // 콘텐츠 기준 세로 위치(vertical_position)에 base_top을 더해 절대 위치로 변환한다.
    // table_position expects para_start_vertical_mm as absolute position (relative to page),
    // so we add base_top to content-relative vertical_position.
    let base_top_for_calc = if let Some((_, top)) = context.position.hcd_position {
        top
    } else if let Some(pd) = context.position.page_def {
        pd.top_margin.to_mm() + pd.header_margin.to_mm()
    } else {
        24.99
    };
    let para_start_vertical_mm = if let Some(0) = current_para_index {
        // 새 페이지의 첫 문단이므로 base_top을 사용 / First paragraph of new page, so use base_top
        Some(base_top_for_calc)
    } else {
        // 콘텐츠 기준 세로 위치를 절대 위치로 변환 / Convert content-relative vertical to absolute
        let relative_mm = current_para_vertical_mm.or_else(|| {
            line_segments
                .first()
                .map(|seg| seg.vertical_position as f64 * 25.4 / 7200.0)
        });
        relative_mm.map(|rel| rel + base_top_for_calc)
    };

    let para_start_column_mm = line_segments
        .first()
        .map(|seg| seg.column_start_position as f64 * 25.4 / 7200.0);
    let para_segment_width_mm = line_segments
        .first()
        .map(|seg| seg.segment_width as f64 * 25.4 / 7200.0);
    let content_height_mm = context.position.content_height_mm; // 블록 내 테이블 위치 계산용 / For table position inside block
    let position_table_fragment_height_mm = context.position.table_fragment_height_mm;
    let position_table_fragment_apply_at_index = context.position.table_fragment_apply_at_index; // 재렌더 시 어느 테이블에 remainder 적용할지 (아래에서 context가 LineSegmentRenderContext로 섀도됨)
                                                                                                 // base_top(mm): hcD의 top 위치. like_letters=false 테이블(=hpa 레벨로 빠지는 객체)의 vert_rel_to=para 계산에
                                                                                                 // 페이지 기준(절대) y 좌표가 필요하므로, paragraph 기준 y(vertical_position)에 base_top을 더해 절대값으로 전달한다.
    let _base_top_mm = if let Some((_hcd_left, hcd_top)) = hcd_position {
        hcd_top
    } else if let Some(pd) = page_def {
        pd.top_margin.to_mm() + pd.header_margin.to_mm()
    } else {
        24.99
    };

    // LineSegment가 있으면 사용 / Use LineSegment if available
    if !line_segments.is_empty() {
        // like_letters=true인 테이블과 false인 테이블 분리 / Separate tables with like_letters=true and false
        let mut absolute_tables = Vec::new();
        for table_info in tables.iter() {
            let like_letters = table_info
                .ctrl_header
                .and_then(|h| match h {
                    CtrlHeaderData::ObjectCommon { attribute, .. } => Some(attribute.like_letters),
                    _ => None,
                })
                .unwrap_or(false);
            if like_letters {
                inline_tables.push(TableInfo {
                    table: table_info.table,
                    ctrl_header: table_info.ctrl_header,
                    anchor_char_pos: table_info.anchor_char_pos,
                    caption: table_info.caption.clone(),
                });
            } else {
                absolute_tables.push(TableInfo {
                    table: table_info.table,
                    ctrl_header: table_info.ctrl_header,
                    anchor_char_pos: table_info.anchor_char_pos,
                    caption: table_info.caption.clone(),
                });
            }
        }

        // like_letters=true인 이미지와 false인 이미지 분리 / Separate images with like_letters=true and false
        let mut inline_images = Vec::new();
        let mut absolute_images = Vec::new();
        for image_info in images.iter() {
            if image_info.like_letters {
                inline_images.push(image_info.clone());
            } else {
                absolute_images.push(image_info.clone());
            }
        }

        // ParaShape indent 값 가져오기 / Get ParaShape indent value
        // HWP 파일의 para_shape_id는 0-based indexing을 사용합니다 / HWP file uses 0-based indexing for para_shape_id
        let para_shape_indent = if (para_shape_id as usize) < document.doc_info.para_shapes.len() {
            Some(document.doc_info.para_shapes[para_shape_id as usize].indent)
        } else {
            None
        };

        // like_letters=true인 테이블을 line_segment에 포함 / Include tables with like_letters=true in line_segment
        // inline_tables는 이미 TableInfo이므로 그대로 사용 / inline_tables is already TableInfo, so use as is
        let inline_table_infos: Vec<TableInfo> = inline_tables
            .iter()
            .map(|table_info| TableInfo {
                table: table_info.table,
                ctrl_header: table_info.ctrl_header,
                anchor_char_pos: table_info.anchor_char_pos,
                caption: table_info.caption.clone(),
            })
            .collect();
        // 테이블 번호 시작값: 현재 table_counter 사용 (문서 레벨에서 관리) / Table number start value: use current table_counter (managed at document level)
        let table_counter_start = *state.table_counter;

        // 마커 정보 계산 (Bullet/Number/Outline)
        let marker_info: Option<MarkerInfo> = if let (Some(outline_tracker), Some(number_tracker)) =
            (state.outline_tracker.as_deref_mut(), state.number_tracker.as_deref_mut())
        {
            compute_paragraph_marker(
                &paragraph.para_header,
                document,
                outline_tracker,
                number_tracker,
                state.section_outline_numbering_id,
            )
        } else {
            None
        };

        let content = LineSegmentContent {
            segments: &line_segments,
            text: &text,
            char_shapes: &char_shapes,
            control_char_positions: &control_char_positions,
            original_text_len: paragraph.para_header.text_char_count as usize,
            images: &inline_images, // like_letters=true인 이미지만 line_segment에 포함 / Include only images with like_letters=true in line_segment
            tables: inline_table_infos.as_slice(), // like_letters=true인 테이블 포함 / Include tables with like_letters=true
            shape_htmls: &[],
            marker_info: marker_info.as_ref(),
            paragraph_markers: &[],
            footnote_refs: &footnote_refs,
            endnote_refs: &endnote_refs,
            auto_numbers: &auto_numbers,
        };

        let context = LineSegmentRenderContext {
            document,
            para_shape_class: &para_shape_class,
            options,
            para_shape_indent,
            hcd_position,
            page_def,
            body_default_hls: context.body_default_hls,
        };

        let mut line_segment_state = DocumentRenderState {
            table_counter_start,
            pattern_counter: state.pattern_counter,
            color_to_pattern: state.color_to_pattern,
        };

        result.push_str(&super::line_segment::render_line_segments_with_content(
            &content,
            &context,
            &mut line_segment_state,
        ));

        // inline_tables의 개수만큼 table_counter 증가 (이미 line_segment에 포함되었으므로) / Increment table_counter by inline_tables count (already included in line_segment)
        *state.table_counter += inline_table_infos.len() as u32;

        // like_letters=true인 테이블은 이미 line_segment에 포함되었으므로 여기서는 처리하지 않음
        // Tables with like_letters=true are already included in line_segment, so don't process them here

        // like_letters=false인 이미지를 별도로 렌더링 (hpa 레벨에 배치) / Render images with like_letters=false separately (placed at hpa level)
        for image_info in absolute_images.iter() {
            use crate::viewer::html::image::render_image;

            // vert_rel_to에 따라 위치 계산 / Calculate position based on vert_rel_to
            let (left_mm, top_mm) = match image_info.vert_rel_to {
                Some(VertRelTo::Para) => {
                    // para 기준: hcd_position 사용 / Use hcd_position for para reference
                    if let Some((hcd_left, hcd_top)) = hcd_position {
                        // offset_x, offset_y는 현재 image_info에 없으므로 0으로 설정
                        // offset_x, offset_y are not in image_info currently, so set to 0
                        (hcd_left, hcd_top)
                    } else {
                        // hcd_position이 없으면 para_start_vertical_mm 사용 / Use para_start_vertical_mm if hcd_position not available
                        (0.0, para_start_vertical_mm.unwrap_or(0.0))
                    }
                }
                Some(VertRelTo::Page) | Some(VertRelTo::Paper) | None => {
                    // page/paper 기준: 절대 위치 (현재는 0,0으로 설정, 나중에 object_common의 offset_x, offset_y 사용)
                    // page/paper reference: absolute position (currently set to 0,0, later use object_common's offset_x, offset_y)
                    (0.0, 0.0)
                }
            };

            // 이미지 크기 계산 (mm 단위) / Calculate image size (in mm)
            let height_mm = image_info.height as f64 * 25.4 / 7200.0;

            // 페이지네이션 체크 (렌더링 직전) / Check pagination (before rendering)
            let image_result =
                pagination::check_object_page_break(top_mm, height_mm, pagination_context);

            if image_result.has_page_break {
                // 페이지네이션 결과 반환 (document.rs에서 처리) / Return pagination result (handled in document.rs)
                return (result, table_htmls, Some(image_result));
            }

            let image_html = render_image(
                &image_info.url,
                (left_mm * 7200.0 / 25.4) as INT32,
                (top_mm * 7200.0 / 25.4) as INT32,
                image_info.width as INT32,
                image_info.height as INT32,
            );
            result.push_str(&image_html);
        }

        // like_letters=false인 테이블을 별도로 렌더링 (hpa 레벨에 배치) / Render tables with like_letters=false separately (placed at hpa level)
        // 페이지네이션 후 같은 문단을 다시 렌더링할 때 이미 처리된 테이블을 건너뛰기 / Skip already processed tables when re-rendering paragraph after pagination
        // 같은 문단 내 여러 테이블: 두 번째 테이블부터는 이전 테이블 하단을 기준으로 배치 (fixture table2 캡션 위치 일치)
        // Multiple tables in same paragraph: place each subsequent table below the previous one (match fixture table2 caption order)
        // DOM 순서: fixture는 top이 큰 블록(아래쪽)을 먼저 출력 → top_mm 내림차순 정렬
        // DOM order: fixture outputs higher top (lower on page) first → sort by top_mm descending
        let mut next_para_vertical_mm = para_start_vertical_mm;
        let mut table_entries: Vec<(f64, String)> = Vec::new();
        let mut overflow_already_applied = false; // 문단 내 overflow 보정은 한 번만 (fixture 표7만 1페이지 하단, 표8은 2페이지 상단)
        for (table_loop_index, table_info) in
            absolute_tables.iter().skip(skip_tables_count).enumerate()
        {
            let ref_para_vertical_for_table = next_para_vertical_mm;
            let first_para_vertical_for_table = first_para_vertical_mm;

            // 테이블 크기 계산 (mm 단위) / Calculate table size (in mm)
            // size 모듈은 pub(crate)이므로 같은 크레이트 내에서 접근 가능
            // size module is pub(crate), so accessible within the same crate
            use crate::viewer::html::ctrl_header::table;
            use table::size::{content_size, htb_size, resolve_container_size};
            let container_size = htb_size(table_info.ctrl_header);
            let content_size = content_size(table_info.table, table_info.ctrl_header);
            let resolved_size = resolve_container_size(container_size, content_size);
            let height_mm = resolved_size.height;

            // 캡션이 있을 때 전체 블록 높이(htG)를 사전 추정
            // render.rs의 htG 계산식과 동일: resolved_height_with_margin + caption_height + caption_gap
            // caption_height는 CaptionInfo.height_mm이 None인 경우가 많으므로,
            // render.rs와 동일하게 LineSegment 데이터에서 계산함.
            let block_height_for_overflow = {
                use crate::document::bodytext::ctrl_header::CaptionAlign;
                use crate::viewer::html::styles::{int32_to_mm, round_to_2dp};
                let mut h = height_mm;
                if let Some(ref caption) = table_info.caption {
                    let is_horizontal =
                        matches!(caption.info.align, CaptionAlign::Top | CaptionAlign::Bottom);
                    if is_horizontal {
                        // render.rs의 caption_height_mm 계산 로직과 동일:
                        // LineSegment에서 마지막 vertical_position + line_height를 사용
                        let caption_h = {
                            let mut all_segments = Vec::new();
                            for para in caption.paragraphs.iter() {
                                for seg in para.line_segments.iter() {
                                    all_segments.push(*seg);
                                }
                            }
                            if all_segments.len() > 1 {
                                if let Some(last_seg) = all_segments.last() {
                                    let last_v =
                                        round_to_2dp(int32_to_mm(last_seg.vertical_position));
                                    let last_lh = round_to_2dp(int32_to_mm(last_seg.line_height));
                                    round_to_2dp(last_v + last_lh)
                                } else {
                                    caption.info.height_mm.unwrap_or(3.53)
                                }
                            } else if let Some(first_seg) = all_segments.first() {
                                round_to_2dp(int32_to_mm(first_seg.line_height))
                            } else {
                                caption.info.height_mm.unwrap_or(3.53)
                            }
                        };
                        let caption_gap = caption
                            .info
                            .gap
                            .map(|g| (g as f64 / 7200.0) * 25.4)
                            .unwrap_or(3.0);
                        h += caption_h + caption_gap;
                    }
                    // 세로 캡션(Left/Right)은 htG height = resolved_height이므로 추가 없음
                }
                h
            };

            // overflow 보정(앵커 위로 올리기)은 이 문단에서 처음으로 콘텐츠를 넘치는 테이블에만 적용.
            // 두 번째 넘치는 테이블은 보정 없이 넘치게 해 페이지 브레이크 후 다음 페이지 상단에 배치 (fixture 표7·표8).
            let would_overflow = ref_para_vertical_for_table
                .zip(content_height_mm)
                .map(|(r, ch)| r + block_height_for_overflow > ch)
                .unwrap_or(false);
            let overflow_check = (would_overflow && !overflow_already_applied).then(|| {
                overflow_already_applied = true;
                (content_height_mm, Some(block_height_for_overflow))
            });

            // 테이블 위치 계산 (정확한 위치) / Calculate table position (exact position)
            // table_position은 pub(crate)이므로 같은 크레이트 내에서 접근 가능
            // table_position is pub(crate), so accessible within the same crate
            use crate::viewer::html::ctrl_header::table::position::table_position;

            let (_left_mm, top_mm) = table_position(
                hcd_position,
                page_def,
                None, // like_letters=false인 테이블은 segment_position 없음 / No segment_position for like_letters=false tables
                table_info.ctrl_header,
                Some(resolved_size.width), // obj_outer_width_mm: 테이블 너비 사용 / Use table width
                ref_para_vertical_for_table, // 상대 위치로 전달 / Pass as relative position
                para_start_column_mm,
                para_segment_width_mm,
                first_para_vertical_for_table, // 상대 위치로 전달 / Pass as relative position
                overflow_check.and_then(|(ch, _)| ch),
                overflow_check.and_then(|(_, th)| th),
            );

            // 페이지네이션 체크 (렌더링 직전) / Check pagination (before rendering)
            let table_result =
                pagination::check_table_page_break(top_mm, height_mm, pagination_context);

            // TableOverflow 시 첫 조각만 렌더하고 remainder 반환; 재렌더 시 position.table_fragment_height_mm을 첫 테이블에만 전달
            let (fragment_height_mm, table_result_with_remainder) = if table_result.has_page_break
                && table_result.reason == Some(PageBreakReason::TableOverflow)
            {
                let content_h = content_height_mm.unwrap_or(0.0);
                let height_drawn_mm = content_h - top_mm;
                let remainder_mm = (height_mm - height_drawn_mm).max(0.0);
                (
                    Some(height_drawn_mm),
                    Some(PaginationResult {
                        has_page_break: true,
                        reason: Some(PageBreakReason::TableOverflow),
                        table_overflow_remainder_mm: Some(remainder_mm),
                        table_overflow_at_index: Some(skip_tables_count + table_loop_index),
                    }),
                )
            } else {
                let frag = match position_table_fragment_apply_at_index {
                    Some(idx) if idx == skip_tables_count + table_loop_index => {
                        position_table_fragment_height_mm
                    }
                    None if table_loop_index == 0 => position_table_fragment_height_mm, // 기존: 첫 테이블에만 적용
                    _ => None,
                };
                (frag, None)
            };

            let mut table_context = TableRenderContext {
                document,
                ctrl_header: table_info.ctrl_header,
                page_def,
                options,
                table_number: Some(*state.table_counter),
                pattern_counter: state.pattern_counter,
                color_to_pattern: state.color_to_pattern,
            };

            // overflow_check가 None이면 render.rs의 table_position에서도 overflow 보정이 발생하지 않도록
            // content_height_mm을 None으로 전달한다.
            let content_height_for_render = if overflow_check.is_some() {
                content_height_mm
            } else {
                None
            };
            let position = TablePosition {
                hcd_position,
                segment_position: None, // like_letters=false인 테이블은 segment_position 없음 / No segment_position for like_letters=false tables
                para_start_vertical_mm: ref_para_vertical_for_table,
                para_start_column_mm,
                para_segment_width_mm,
                first_para_vertical_mm: first_para_vertical_for_table,
                content_height_mm: content_height_for_render,
                fragment_height_mm,
                table_height_for_overflow_mm: overflow_check.map(|_| block_height_for_overflow),
                segment_line_height_mm: None,
                segment_baseline_distance_mm: None,
            };

            let (table_html, htg_height_opt) = render_table(
                table_info.table,
                &mut table_context,
                position,
                table_info.caption.as_ref(),
            );
            table_entries.push((top_mm, table_html));
            *state.table_counter += 1;

            // 다음 테이블의 기준 세로 위치 = 이번 테이블 하단 (htG 높이 사용 시 캡션·마진 포함)
            let block_height_mm = htg_height_opt.unwrap_or(height_mm);
            next_para_vertical_mm = Some(top_mm + block_height_mm);

            if let Some(tr) = table_result_with_remainder {
                // TableOverflow: 첫 조각만 출력하고 remainder와 함께 반환 / First fragment only, return with remainder
                table_htmls.extend(table_entries.into_iter().map(|(_, h)| h));
                return (result, table_htmls, Some(tr));
            }
            if table_result.has_page_break {
                // 그 외 페이지 브레이크: 기존처럼 반환 / Other page break: return as before
                table_htmls.extend(table_entries.into_iter().map(|(_, h)| h));
                return (result, table_htmls, Some(table_result));
            }
        }
        // fixture DOM 순서: top 큰 순(아래 블록 먼저) / Fixture DOM order: higher top first
        table_entries.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        for (_, html) in table_entries {
            table_htmls.push(html);
        }
    } else if !text.is_empty() {
        // LineSegment가 없으면 텍스트만 렌더링 / Render text only if no LineSegment
        let rendered_text =
            text::render_text(&text, &char_shapes, document, &options.css_class_prefix);
        result.push_str(&format!(
            r#"<div class="hls {}">{}</div>"#,
            para_shape_class, rendered_text
        ));
    }

    // 구역/단 등 인라인 콘텐츠를 문단 끝에 붙임 / Append section/column etc. inline content at end of paragraph
    for s in &extra_contents {
        result.push_str(s);
    }
    for s in &shape_htmls {
        table_htmls.push(s.clone());
    }

    (result, table_htmls, None)
}
