use super::common;
use super::ctrl_header;
use super::line_segment;
use super::text;
use super::HtmlOptions;
use crate::document::bodytext::ctrl_header::CtrlHeaderData;
use crate::document::bodytext::ParagraphRecord;
use crate::document::bodytext::Table;
use crate::document::HwpDocument;
use crate::viewer::html::ctrl_header::table::CaptionInfo;

/// 문단을 HTML로 렌더링 / Render paragraph to HTML
/// 반환값: (문단 HTML, 테이블 HTML 리스트) / Returns: (paragraph HTML, table HTML list)
pub fn render_paragraph(
    paragraph: &crate::document::bodytext::Paragraph,
    document: &HwpDocument,
    options: &HtmlOptions,
    hcd_position: Option<(f64, f64)>,
    page_def: Option<&crate::document::bodytext::PageDef>,
    first_para_vertical_mm: Option<f64>, // 첫 번째 문단의 vertical_position (가설 O) / First paragraph's vertical_position (Hypothesis O)
    current_para_vertical_mm: Option<f64>, // 현재 문단의 vertical_position / Current paragraph's vertical_position
    para_vertical_positions: &[f64], // 모든 문단의 vertical_position (vert_rel_to: "para"일 때 참조 문단 찾기 위해) / All paragraphs' vertical_positions (to find reference paragraph when vert_rel_to: "para")
    current_para_index: Option<usize>, // 현재 문단 인덱스 (vertical_position이 있는 문단 기준) / Current paragraph index (based on paragraphs with vertical_position)
    table_counter: &mut u32, // 문서 레벨 table_counter (문서 전체에서 테이블 번호 연속 유지) / Document-level table_counter (maintain sequential table numbers across document)
) -> (String, Vec<String>) {
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
    let mut tables: Vec<(
        &Table,
        Option<&CtrlHeaderData>,
        Option<String>,      // 캡션 텍스트 / Caption text
        Option<CaptionInfo>, // 캡션 정보 / Caption info
        Option<usize>, // 캡션 문단의 첫 번째 char_shape_id / First char_shape_id from caption paragraph
        Option<usize>, // 캡션 문단의 para_shape_id / Para shape ID from caption paragraph
    )> = Vec::new();

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
                        );
                        if !image_url.is_empty() {
                            // ShapeComponent에서 width와 height 가져오기 / Get width and height from ShapeComponent
                            images.push((shape_component.width, shape_component.height, image_url));
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
                );
                if !image_url.is_empty() {
                    // border_rectangle에서 크기 계산 / Calculate size from border_rectangle
                    let width = (shape_component_picture.border_rectangle_x.right
                        - shape_component_picture.border_rectangle_x.left)
                        as u32;
                    let height = (shape_component_picture.border_rectangle_y.bottom
                        - shape_component_picture.border_rectangle_y.top)
                        as u32;
                    images.push((width, height, image_url));
                }
            }
            ParagraphRecord::Table { table } => {
                tables.push((table, None, None, None, None, None));
            }
            ParagraphRecord::CtrlHeader {
                header,
                children,
                paragraphs,
                ..
            } => {
                // CtrlHeader 처리 / Process CtrlHeader
                let ctrl_result = ctrl_header::process_ctrl_header(header, children, paragraphs);
                tables.extend(ctrl_result.tables);
                images.extend(ctrl_result.images);
            }
            _ => {}
        }
    }

    // 테이블 HTML 리스트 생성 / Create table HTML list
    let mut table_htmls = Vec::new();
    // inline_tables는 owned tuple을 저장하므로 타입 명시 / inline_tables stores owned tuples, so specify type
    let mut inline_tables: Vec<(
        &Table,
        Option<&CtrlHeaderData>,
        Option<String>,
        Option<CaptionInfo>,
        Option<usize>, // 캡션 문단의 첫 번째 char_shape_id / First char_shape_id from caption paragraph
        Option<usize>, // 캡션 문단의 para_shape_id / Para shape ID from caption paragraph
    )> = Vec::new(); // like_letters=true인 테이블들 / Tables with like_letters=true

    // 문단의 첫 번째 LineSegment의 vertical_position 계산 (vert_rel_to: "para"일 때 사용) / Calculate first LineSegment's vertical_position (used when vert_rel_to: "para")
    // current_para_vertical_mm이 전달되면 사용하고, 없으면 현재 문단의 첫 번째 LineSegment 사용
    // If current_para_vertical_mm is provided, use it; otherwise use first LineSegment of current paragraph
    let para_start_vertical_mm = current_para_vertical_mm.or_else(|| {
        line_segments
            .first()
            .map(|seg| seg.vertical_position as f64 * 25.4 / 7200.0)
    });

    // LineSegment가 있으면 사용 / Use LineSegment if available
    if !line_segments.is_empty() {
        // like_letters=true인 테이블과 false인 테이블 분리 / Separate tables with like_letters=true and false
        let mut absolute_tables = Vec::new();
        for (table, ctrl_header, caption_text, caption_info, caption_char_shape_id, caption_para_shape_id) in tables.iter() {
            let like_letters = ctrl_header
                .and_then(|h| match h {
                    CtrlHeaderData::ObjectCommon { attribute, .. } => Some(attribute.like_letters),
                    _ => None,
                })
                .unwrap_or(false);
            if like_letters {
                inline_tables.push((*table, *ctrl_header, caption_text.clone(), *caption_info, *caption_char_shape_id, *caption_para_shape_id));
            } else {
                absolute_tables.push((*table, *ctrl_header, caption_text.clone(), *caption_info, *caption_char_shape_id, *caption_para_shape_id));
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
        // inline_tables는 Vec<(&Table, ...)>이고, TableInfo는 (&Table, ..., Option<&str>)이므로 변환 필요
        // inline_tables is Vec<(&Table, ...)> and TableInfo is (&Table, ..., Option<&str>), so need conversion
        use crate::viewer::html::line_segment::TableInfo;
        let inline_table_infos: Vec<TableInfo> = inline_tables
            .iter()
            .map(
                |(table, ctrl_header, caption_text, caption_info, caption_char_shape_id, caption_para_shape_id)| {
                    // iter()로 인해 table은 &&Table이 되므로 한 번 역참조 / table becomes &&Table due to iter(), so dereference once
                    // ctrl_header는 Option<&CtrlHeaderData>이므로 복사 / ctrl_header is Option<&CtrlHeaderData>, copy
                    // caption_text는 Option<String>이므로 as_deref()로 Option<&str>로 변환 / caption_text is Option<String>, convert to Option<&str> with as_deref()
                    (
                        *table,
                        *ctrl_header,
                        caption_text.as_deref(),
                        *caption_info,
                        *caption_char_shape_id,
                        *caption_para_shape_id,
                    )
                },
            )
            .collect();
        // 테이블 번호 시작값: 현재 table_counter 사용 (문서 레벨에서 관리) / Table number start value: use current table_counter (managed at document level)
        let table_counter_start = *table_counter;
        result.push_str(&line_segment::render_line_segments_with_content(
            &line_segments,
            &text,
            &char_shapes,
            document,
            &para_shape_class,
            &images,
            inline_table_infos.as_slice(), // like_letters=true인 테이블 포함 / Include tables with like_letters=true
            options,
            para_shape_indent,
            hcd_position,        // hcD 위치 전달 / Pass hcD position
            page_def,            // 페이지 정의 전달 / Pass page definition
            table_counter_start, // 테이블 번호 시작값 전달 / Pass table number start value
        ));
        
        // inline_tables의 개수만큼 table_counter 증가 (이미 line_segment에 포함되었으므로) / Increment table_counter by inline_tables count (already included in line_segment)
        *table_counter += inline_table_infos.len() as u32;

        // like_letters=true인 테이블은 이미 line_segment에 포함되었으므로 여기서는 처리하지 않음
        // Tables with like_letters=true are already included in line_segment, so don't process them here

        // like_letters=false인 테이블을 별도로 렌더링 (hpa 레벨에 배치) / Render tables with like_letters=false separately (placed at hpa level)
        for (table, ctrl_header, caption_text, caption_info, caption_char_shape_id, caption_para_shape_id) in
            absolute_tables.iter()
        {
            use crate::document::bodytext::ctrl_header::{CtrlHeaderData, VertRelTo};
            use crate::viewer::html::ctrl_header::table::render_table;

            // vert_rel_to: "para"일 때 다음 문단을 참조 / When vert_rel_to: "para", reference next paragraph
            let ref_para_vertical_mm = match ctrl_header {
                Some(CtrlHeaderData::ObjectCommon { attribute, .. })
                    if matches!(attribute.vert_rel_to, VertRelTo::Para) =>
                {
                    current_para_index
                        .and_then(|idx| para_vertical_positions.get(idx + 1).copied())
                        .or(para_start_vertical_mm)
                }
                _ => para_start_vertical_mm,
            };

            let table_html = render_table(
                table,
                document,
                *ctrl_header, // Option<&CtrlHeaderData>는 Copy이므로 clone 대신 역참조 / Option<&CtrlHeaderData> is Copy, so dereference instead of clone
                hcd_position,
                page_def,
                options,
                Some(*table_counter), // 현재 table_counter 사용 / Use current table_counter
                caption_text.as_deref(),
                *caption_info,          // 캡션 정보 전달 / Pass caption info
                *caption_char_shape_id, // 캡션 char_shape_id 전달 / Pass caption char_shape_id
                *caption_para_shape_id, // 캡션 para_shape_id 전달 / Pass caption para_shape_id
                None, // like_letters=false인 테이블은 segment_position 없음 / No segment_position for like_letters=false tables
                ref_para_vertical_mm, // 참조 문단의 vertical_position 전달 / Pass reference paragraph's vertical_position
                first_para_vertical_mm, // 첫 번째 문단의 vertical_position 전달 (가설 O) / Pass first paragraph's vertical_position (Hypothesis O)
            );
            table_htmls.push(table_html);
            *table_counter += 1; // table_counter 증가 / Increment table_counter
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

    (result, table_htmls)
}
