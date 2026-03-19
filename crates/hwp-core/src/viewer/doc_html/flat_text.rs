/// Run[] → flat text + CharShapeInfo[] 어댑터
/// Document 모델의 Run 트리 구조를 old viewer가 기대하는 flat 구조로 변환
///
/// old viewer의 LineSegmentContent가 받는 데이터:
/// - text: &str (전체 문단 텍스트, 컨트롤 문자 제거)
/// - char_shapes: &[CharShapeInfo] (position, shape_id)
/// - control_char_positions: &[ControlCharPosition] (제어 문자 위치)

use hwp_model::paragraph::{Paragraph, Run, RunContent, TextElement};

/// old viewer의 CharShapeInfo 호환 구조
#[derive(Debug, Clone)]
pub struct FlatCharShapeInfo {
    /// 텍스트 시작 위치 (clean text 내 WCHAR offset)
    pub position: u32,
    /// CharShape ID (resources.char_shapes 인덱스)
    pub shape_id: u16,
}

/// 하이퍼링크 범위 정보
#[derive(Debug, Clone)]
pub struct HyperlinkRange {
    /// 텍스트 시작 위치 (WCHAR offset)
    pub start: u32,
    /// 텍스트 끝 위치 (WCHAR offset)
    pub end: u32,
    /// onclick 스크립트
    pub onclick: String,
}

/// Run[] → flat text 변환 결과
#[derive(Debug, Default)]
pub struct FlatTextResult {
    /// 전체 문단 텍스트 (개행, 탭 등 제어 문자 포함)
    pub text: String,
    /// CharShape 변경점 목록
    pub char_shapes: Vec<FlatCharShapeInfo>,
    /// 현재 텍스트의 WCHAR 길이
    pub text_len: usize,
    /// 하이퍼링크 범위 목록
    pub hyperlinks: Vec<HyperlinkRange>,
    /// 건너뛴 WCHAR 수 (Control/Object 등 텍스트에 미포함된 원본 문자)
    /// text_start_pos 변환: extracted_pos = original_wchar_pos - skipped_wchars
    pub skipped_wchars: u32,
}

/// Paragraph의 Run[]에서 flat text + char_shapes 추출
pub fn extract_flat_text(para: &Paragraph) -> FlatTextResult {
    let mut result = FlatTextResult::default();
    let mut wchar_pos: u32 = 0;
    let mut hyperlink_start: Option<(u32, String)> = None; // (start_pos, onclick)

    for run in &para.runs {
        // 이 Run의 시작 위치에 CharShape 기록
        result.char_shapes.push(FlatCharShapeInfo {
            position: wchar_pos,
            shape_id: run.char_shape_id,
        });

        for content in &run.contents {
            match content {
                RunContent::Text(tc) => {
                    for elem in &tc.elements {
                        match elem {
                            TextElement::Text(s) => {
                                result.text.push_str(s);
                                wchar_pos += s.chars().count() as u32;
                            }
                            TextElement::Tab { .. } => {
                                result.text.push('\t');
                                wchar_pos += 1;
                            }
                            TextElement::LineBreak => {
                                result.text.push('\n');
                                wchar_pos += 1;
                            }
                            TextElement::NbSpace => {
                                result.text.push('\u{00a0}');
                                wchar_pos += 1;
                            }
                            TextElement::FwSpace => {
                                result.text.push(' ');
                                wchar_pos += 1;
                            }
                            TextElement::Hyphen => {
                                result.text.push('-');
                                wchar_pos += 1;
                            }
                            _ => {}
                        }
                    }
                }
                RunContent::Control(ctrl) => {
                    use hwp_model::control::Control;
                    match ctrl {
                        Control::FieldBegin(field) => {
                            if field.field_type == hwp_model::types::FieldType::Hyperlink {
                                let url = crate::viewer::doc_utils::extract_hyperlink_url(field);
                                let onclick = crate::viewer::doc_utils::url_to_onclick(&url);
                                hyperlink_start = Some((wchar_pos, onclick));
                            }
                        }
                        Control::FieldEnd => {
                            if let Some((start, onclick)) = hyperlink_start.take() {
                                if !onclick.is_empty() {
                                    result.hyperlinks.push(HyperlinkRange {
                                        start,
                                        end: wchar_pos,
                                        onclick,
                                    });
                                }
                            }
                        }
                        _ => {}
                    }
                }
                RunContent::Object(_) => {
                    // Object는 원본에서 WCHAR 위치를 차지하지만 텍스트에 미포함
                    // (HWP 원본: 확장 문자 코드 + WCHAR 마커)
                    result.skipped_wchars += 8; // 일반적으로 Object marker = 8 WCHARs
                }
            }
        }
    }

    result.text_len = wchar_pos as usize;
    result
}

/// CharShapeInfo에서 주어진 위치의 shape_id를 찾기
/// (binary search로 해당 위치에 적용되는 char_shape_id 반환)
pub fn find_char_shape_at(char_shapes: &[FlatCharShapeInfo], pos: u32) -> u16 {
    match char_shapes.binary_search_by_key(&pos, |cs| cs.position) {
        Ok(idx) => char_shapes[idx].shape_id,
        Err(idx) => {
            if idx > 0 {
                char_shapes[idx - 1].shape_id
            } else {
                char_shapes.first().map(|cs| cs.shape_id).unwrap_or(0)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use hwp_model::paragraph::*;

    fn make_text_run(cs_id: u16, text: &str) -> Run {
        Run {
            char_shape_id: cs_id,
            contents: vec![RunContent::Text(TextContent {
                char_shape_id: None,
                elements: vec![TextElement::Text(text.to_string())],
            })],
        }
    }

    #[test]
    fn test_extract_flat_text_simple() {
        let para = Paragraph {
            runs: vec![
                make_text_run(0, "Hello "),
                make_text_run(1, "World"),
            ],
            ..Default::default()
        };
        let result = extract_flat_text(&para);
        assert_eq!(result.text, "Hello World");
        assert_eq!(result.char_shapes.len(), 2);
        assert_eq!(result.char_shapes[0].position, 0);
        assert_eq!(result.char_shapes[0].shape_id, 0);
        assert_eq!(result.char_shapes[1].position, 6);
        assert_eq!(result.char_shapes[1].shape_id, 1);
    }

    #[test]
    fn test_extract_flat_text_with_tab() {
        let para = Paragraph {
            runs: vec![Run {
                char_shape_id: 0,
                contents: vec![RunContent::Text(TextContent {
                    char_shape_id: None,
                    elements: vec![
                        TextElement::Text("A".to_string()),
                        TextElement::Tab { width: 0, leader: Default::default(), tab_type: Default::default() },
                        TextElement::Text("B".to_string()),
                    ],
                })],
            }],
            ..Default::default()
        };
        let result = extract_flat_text(&para);
        assert_eq!(result.text, "A\tB");
        assert_eq!(result.text_len, 3);
    }

    #[test]
    fn test_find_char_shape_at() {
        let shapes = vec![
            FlatCharShapeInfo { position: 0, shape_id: 10 },
            FlatCharShapeInfo { position: 5, shape_id: 20 },
            FlatCharShapeInfo { position: 10, shape_id: 30 },
        ];
        assert_eq!(find_char_shape_at(&shapes, 0), 10);
        assert_eq!(find_char_shape_at(&shapes, 3), 10);
        assert_eq!(find_char_shape_at(&shapes, 5), 20);
        assert_eq!(find_char_shape_at(&shapes, 7), 20);
        assert_eq!(find_char_shape_at(&shapes, 10), 30);
        assert_eq!(find_char_shape_at(&shapes, 15), 30);
    }
}
