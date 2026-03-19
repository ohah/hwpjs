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
    /// 원본 WCHAR → 추출 텍스트 위치 매핑
    /// 제어 문자(Control/Object)가 원본에서 차지하는 위치를 보정
    /// (original_wchar_pos, extracted_text_pos) 쌍의 정렬된 목록
    pub wchar_map: Vec<(u32, u32)>,
}

/// Paragraph의 Run[]에서 flat text + char_shapes 추출
pub fn extract_flat_text(para: &Paragraph) -> FlatTextResult {
    let mut result = FlatTextResult::default();
    let mut wchar_pos: u32 = 0; // 추출 텍스트 내 위치
    let mut original_wchar_pos: u32 = 0; // 원본 HWP WCHAR 위치 (제어 문자 포함)
    let mut hyperlink_start: Option<(u32, String)> = None; // (start_pos, onclick)
    // 매핑 초기점
    result.wchar_map.push((0, 0));

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
                                let len = s.chars().count() as u32;
                                result.text.push_str(s);
                                wchar_pos += len;
                                original_wchar_pos += len;
                            }
                            TextElement::Tab { .. } => {
                                result.text.push('\t');
                                wchar_pos += 1;
                                original_wchar_pos += 1;
                            }
                            TextElement::LineBreak => {
                                result.text.push('\n');
                                wchar_pos += 1;
                                original_wchar_pos += 1;
                            }
                            TextElement::NbSpace => {
                                result.text.push('\u{00a0}');
                                wchar_pos += 1;
                                original_wchar_pos += 1;
                            }
                            TextElement::FwSpace => {
                                result.text.push(' ');
                                wchar_pos += 1;
                                original_wchar_pos += 1;
                            }
                            TextElement::Hyphen => {
                                result.text.push('-');
                                wchar_pos += 1;
                                original_wchar_pos += 1;
                            }
                            _ => {
                                // 기타 TextElement도 원본 위치 증가 (ColumnBreak 등)
                                original_wchar_pos += 1;
                            }
                        }
                    }
                }
                RunContent::Control(ctrl) => {
                    use hwp_model::control::Control;
                    // 제어 문자는 원본에서 WCHAR 차지 (확장 코드 포인트)
                    // secd/cold 쌍은 16 WCHAR, 기타는 8 WCHAR
                    let ctrl_wchars = match ctrl {
                        Control::Column(_) => 16, // secd(8) + cold(8) 쌍
                        _ => 8,
                    };
                    original_wchar_pos += ctrl_wchars;
                    // 매핑 기록 (원본 위치 → 추출 위치)
                    result.wchar_map.push((original_wchar_pos, wchar_pos));
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
                    // Object는 원본에서 8 WCHAR 차지
                    original_wchar_pos += 8;
                    result.wchar_map.push((original_wchar_pos, wchar_pos));
                }
            }
        }
    }

    result.text_len = wchar_pos as usize;
    result
}

/// 원본 WCHAR 위치 → 추출 텍스트 위치 변환
pub fn map_original_to_extracted(wchar_map: &[(u32, u32)], original_pos: u32) -> u32 {
    if wchar_map.is_empty() {
        return original_pos;
    }
    // wchar_map에서 original_pos 이하인 가장 큰 엔트리 찾기
    let mut best_orig = 0u32;
    let mut best_ext = 0u32;
    for &(orig, ext) in wchar_map {
        if orig <= original_pos {
            best_orig = orig;
            best_ext = ext;
        } else {
            break;
        }
    }
    // 나머지 오프셋은 1:1 매핑
    best_ext + (original_pos - best_orig)
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
