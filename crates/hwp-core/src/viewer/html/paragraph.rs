use super::common;
use super::ctrl_header;
use super::line_segment::{
    DocumentRenderState, ImageInfo, LineSegmentContent, LineSegmentRenderContext, TableInfo,
};
use super::pagination::{self, PaginationContext, PaginationResult};
use super::text;
use super::HtmlOptions;
use crate::document::bodytext::{
    control_char::ControlChar,
    ctrl_header::{CtrlHeaderData, VertRelTo},
    PageDef, ParagraphRecord,
};
use crate::document::{HwpDocument, Paragraph};
use crate::viewer::html::ctrl_header::table::{render_table, TablePosition, TableRenderContext};
use crate::INT32;
use std::collections::HashMap;

/// 문단 위치 정보 / Paragraph position information
pub struct ParagraphPosition<'a> {
    pub hcd_position: Option<(f64, f64)>,
    pub page_def: Option<&'a PageDef>,
    pub first_para_vertical_mm: Option<f64>,
    pub current_para_vertical_mm: Option<f64>,
    pub para_vertical_positions: &'a [f64],
    pub current_para_index: Option<usize>,
}

/// 문단 렌더링 컨텍스트 / Paragraph rendering context
pub struct ParagraphRenderContext<'a> {
    pub document: &'a HwpDocument,
    pub options: &'a HtmlOptions,
    pub position: ParagraphPosition<'a>,
}

/// 문단 렌더링 상태 / Paragraph rendering state
pub struct ParagraphRenderState<'a> {
    pub table_counter: &'a mut u32,
    pub pattern_counter: &'a mut usize,
    pub color_to_pattern: &'a mut HashMap<u32, String>,
}

/// 문단을 HTML로 렌더링 / Render paragraph to HTML
/// 반환값: (문단 HTML, 테이블 HTML 리스트, 페이지네이션 결과) / Returns: (paragraph HTML, table HTML list, pagination result)
pub fn render_paragraph(
    paragraph: &Paragraph,
    context: &ParagraphRenderContext,
    state: &mut ParagraphRenderState,
    pagination_context: &mut PaginationContext,
) -> (String, Vec<String>, Option<PaginationResult>) {
    // 구조체에서 개별 값 추출 / Extract individual values from structs
    let document = context.document;
    let options = context.options;
    let hcd_position = context.position.hcd_position;
    let page_def = context.position.page_def;
    let first_para_vertical_mm = context.position.first_para_vertical_mm;
    let current_para_vertical_mm = context.position.current_para_vertical_mm;
    let para_vertical_positions = context.position.para_vertical_positions;
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
    let (text, char_shapes) = text::extract_text_and_shapes(paragraph);

    // ParaText의 control_char_positions 수집 (원본 WCHAR 인덱스 기준) / Collect control_char_positions (based on original WCHAR indices)
    let mut control_char_positions = Vec::new();
    for record in &paragraph.records {
        if let ParagraphRecord::ParaText {
            control_char_positions: ccp,
            ..
        } = record
        {
            control_char_positions = ccp.clone();
            break;
        }
    }

    // LineSegment 찾기 / Find LineSegment
    let mut line_segments = Vec::new();
    for record in &paragraph.records {
        if let ParagraphRecord::ParaLineSeg { segments } = record {
            line_segments = segments.clone();
            break;
        }
    }

    // 이미지와 테이블 수집 / Collect images and tables
    let mut images = Vec::new();
    let mut tables: Vec<TableInfo> = Vec::new();

    // ParaText의 control_char_positions에서 SHAPE_OBJECT(표/그리기 개체) 앵커 위치 수집
    // Collect SHAPE_OBJECT anchor positions from ParaText control_char_positions
    let mut shape_object_anchor_positions: Vec<usize> = Vec::new();
    for record in &paragraph.records {
        if let ParagraphRecord::ParaText {
            control_char_positions,
            ..
        } = record
        {
            for pos in control_char_positions.iter() {
                if pos.code == ControlChar::SHAPE_OBJECT {
                    shape_object_anchor_positions.push(pos.position);
                }
            }
        }
    }
    let mut shape_object_anchor_cursor: usize = 0;

    for record in &paragraph.records {
        match record {
            ParagraphRecord::ShapeComponent {
                shape_component,
                children,
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
                            // shape_component.width/height를 직접 사용 / Use shape_component.width/height directly
                            images.push(ImageInfo {
                                width: shape_component.width,
                                height: shape_component.height,
                                url: image_url,
                                like_letters: false, // ShapeComponent에서 직접 온 이미지는 ctrl_header 정보 없음 / Images from ShapeComponent directly have no ctrl_header info
                                affect_line_spacing: false,
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
                        affect_line_spacing: false,
                        vert_rel_to: None,
                    });
                }
            }
            ParagraphRecord::Table { table } => {
                tables.push(TableInfo {
                    table: &table,
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
                let ctrl_result = ctrl_header::process_ctrl_header(
                    &header,
                    &children,
                    &paragraphs,
                    document,
                    options,
                );
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
    let para_start_vertical_mm = current_para_vertical_mm.or_else(|| {
        line_segments
            .first()
            .map(|seg| seg.vertical_position as f64 * 25.4 / 7200.0)
    });
    let para_start_column_mm = line_segments
        .first()
        .map(|seg| seg.column_start_position as f64 * 25.4 / 7200.0);
    let para_segment_width_mm = line_segments
        .first()
        .map(|seg| seg.segment_width as f64 * 25.4 / 7200.0);
    // base_top(mm): hcD의 top 위치. like_letters=false 테이블(=hpa 레벨로 빠지는 객체)의 vert_rel_to=para 계산에
    // 페이지 기준(절대) y 좌표가 필요하므로, paragraph 기준 y(vertical_position)에 base_top을 더해 절대값으로 전달한다.
    let base_top_mm = if let Some((_hcd_left, hcd_top)) = hcd_position {
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

        let content = LineSegmentContent {
            segments: &line_segments,
            text: &text,
            char_shapes: &char_shapes,
            control_char_positions: &control_char_positions,
            original_text_len: paragraph.para_header.text_char_count as usize,
            images: &inline_images, // like_letters=true인 이미지만 line_segment에 포함 / Include only images with like_letters=true in line_segment
            tables: inline_table_infos.as_slice(), // like_letters=true인 테이블 포함 / Include tables with like_letters=true
        };

        let context = LineSegmentRenderContext {
            document,
            para_shape_class: &para_shape_class,
            options,
            para_shape_indent,
            hcd_position,
            page_def,
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
        for table_info in absolute_tables.iter() {
            // vert_rel_to: "para"일 때 다음 문단을 참조 / When vert_rel_to: "para", reference next paragraph
            let ref_para_vertical_mm = match table_info.ctrl_header {
                Some(CtrlHeaderData::ObjectCommon { attribute, .. })
                    if matches!(attribute.vert_rel_to, VertRelTo::Para) =>
                {
                    // NOTE (fixture/table-position.html):
                    // vert_rel_to=para인 객체의 기준 문단은 "현재 문단"의 vertical_position입니다.
                    // (이전 구현처럼 idx+1을 참조하면 표가 한 칸씩 아래로 밀립니다.)
                    current_para_index
                        .and_then(|idx| para_vertical_positions.get(idx).copied())
                        .or(para_start_vertical_mm)
                }
                _ => para_start_vertical_mm,
            };
            let ref_para_vertical_abs_mm = ref_para_vertical_mm.map(|v| v + base_top_mm);
            let first_para_vertical_abs_mm = first_para_vertical_mm.map(|v| v + base_top_mm);

            // 테이블 크기 계산 (mm 단위) / Calculate table size (in mm)
            // size 모듈은 pub(crate)이므로 같은 크레이트 내에서 접근 가능
            // size module is pub(crate), so accessible within the same crate
            use crate::viewer::html::ctrl_header::table;
            use table::size::{content_size, htb_size, resolve_container_size};
            let container_size = htb_size(table_info.ctrl_header);
            let content_size = content_size(table_info.table, table_info.ctrl_header);
            let resolved_size = resolve_container_size(container_size, content_size);
            let height_mm = resolved_size.height;

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
                ref_para_vertical_abs_mm,
                para_start_column_mm,
                para_segment_width_mm,
                first_para_vertical_abs_mm,
            );

            // 페이지네이션 체크 (렌더링 직전) / Check pagination (before rendering)
            let table_result =
                pagination::check_table_page_break(top_mm, height_mm, pagination_context);

            if table_result.has_page_break {
                // 페이지네이션 결과 반환 (document.rs에서 처리) / Return pagination result (handled in document.rs)
                return (result, table_htmls, Some(table_result));
            }

            let mut context = TableRenderContext {
                document,
                ctrl_header: table_info.ctrl_header,
                page_def,
                options,
                table_number: Some(*state.table_counter),
                pattern_counter: state.pattern_counter,
                color_to_pattern: state.color_to_pattern,
            };

            let position = TablePosition {
                hcd_position,
                segment_position: None, // like_letters=false인 테이블은 segment_position 없음 / No segment_position for like_letters=false tables
                para_start_vertical_mm: ref_para_vertical_abs_mm,
                para_start_column_mm,
                para_segment_width_mm,
                first_para_vertical_mm: first_para_vertical_abs_mm,
            };

            let table_html = render_table(
                table_info.table,
                &mut context,
                position,
                table_info.caption.as_ref(),
            );
            table_htmls.push(table_html);
            *state.table_counter += 1; // table_counter 증가 / Increment table_counter
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

    (result, table_htmls, None)
}
