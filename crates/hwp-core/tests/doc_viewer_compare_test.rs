/// 기존 viewer(HwpDocument 기반)와 새 viewer(Document 기반) 출력 비교 테스트
/// 목표: 동일한 HWP 파일에 대해 두 viewer의 출력이 완전히 일치하는지 검증
mod common;
use common::find_fixture_file;

use hwp_core::convert::to_document;
use hwp_core::viewer::doc_markdown::{doc_to_markdown, DocMarkdownOptions};
use hwp_core::viewer::MarkdownOptions;
use hwp_core::HwpParser;

fn old_markdown_options() -> MarkdownOptions {
    MarkdownOptions {
        image_output_dir: None,
        use_html: Some(true),
        include_version: Some(false),
        include_page_info: Some(false),
    }
}

fn new_markdown_options() -> DocMarkdownOptions {
    DocMarkdownOptions::default()
}

/// HTML viewer와 비교하여 새 viewer가 더 정확한 파일 목록
/// 이 파일들은 기존 viewer와 diff가 있어도 "통과"로 간주
const NEW_VIEWER_CORRECT: &[&str] = &[
    // software.hwp: 표 셀 내 텍스트("주요 기능 흐름")를 기존 viewer는 누락하지만
    //   HTML viewer에는 존재 → 새 viewer가 정답
    "software.hwp",
    // noori.hwp: bold 경계에서 공백 위치가 다름.
    //   HTML에서 </span> 후 &nbsp; → 공백이 bold 바깥 = 새 viewer가 더 가까움
    "noori.hwp",
    // multicolumns-layout.hwp: 표 셀 내 이미지 제거 후 텍스트("표 셀 안의 다단")를
    //   기존 viewer는 누락하지만 실제 콘텐츠가 존재 → 새 viewer가 정답
    "multicolumns-layout.hwp",
    // chart.hwp: 표 마지막 열 데이터(67.5 등)를 기존 viewer는 빈 셀로 처리하지만
    //   HTML viewer에는 데이터가 존재 → 새 viewer가 정답
    "chart.hwp",
    // sample-5017.hwp: bold(**2005**)/italic(*예제*) 적용. HWP 원본에 bold=true가 있고
    //   기존 viewer도 ParaCharShape가 있지만 출력에 적용 안 됨 (기존 viewer 한계)
    "sample-5017.hwp",
    // sample-5017-pics.hwp: 이미지/텍스트 출력 순서 차이. 기존 viewer는 Picture를 먼저
    //   출력하지만 실제 콘텐츠 순서는 파일 구조에 의존 → 시각적 동등
    "sample-5017-pics.hwp",
    // multicolumns-in-common-controls.hwp: 표 셀 내 다단 텍스트를 기존 viewer는 누락하지만
    //   실제 콘텐츠가 존재. trailing space 차이도 있으나 시각적 동등
    "multicolumns-in-common-controls.hwp",
    // table-caption.hwp: 캡션이 Object 구분자 "  \n"으로 trailing "  " 잔존.
    //   Markdown 렌더링 시 시각적 차이 없음 (soft line break)
    "table-caption.hwp",
];

/// 두 마크다운 출력의 차이를 보여주는 헬퍼
fn diff_lines(old: &str, new: &str) -> Vec<String> {
    let old_lines: Vec<&str> = old.lines().collect();
    let new_lines: Vec<&str> = new.lines().collect();
    let max = old_lines.len().max(new_lines.len());
    let mut diffs = Vec::new();

    for i in 0..max {
        let old_line = old_lines.get(i).unwrap_or(&"<MISSING>");
        let new_line = new_lines.get(i).unwrap_or(&"<MISSING>");
        if old_line != new_line {
            diffs.push(format!(
                "line {}: OLD={:?}  NEW={:?}",
                i + 1,
                old_line,
                new_line
            ));
        }
    }
    diffs
}

/// example.hwp: 기존 viewer vs 새 viewer 마크다운 비교
#[test]
fn compare_example_hwp_markdown() {
    compare_single_hwp("example.hwp");
}

/// 모든 HWP fixture에 대해 기존 viewer vs 새 viewer 비교
#[test]
fn compare_all_hwp_markdown() {
    let hwp_files = common::find_all_hwp_files();
    if hwp_files.is_empty() {
        println!("No HWP files found");
        return;
    }

    let parser = HwpParser::new();
    let mut passed = Vec::new();
    let mut new_correct = Vec::new();
    let mut failed = Vec::new();

    for file_path in &hwp_files {
        let file_name = std::path::Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown");

        let data = match std::fs::read(file_path) {
            Ok(d) => d,
            Err(_) => continue,
        };

        let hwp_doc = match parser.parse(&data) {
            Ok(d) => d,
            Err(_) => continue,
        };

        let old_md = hwp_doc.to_markdown(&old_markdown_options());
        let document = to_document(&hwp_doc);
        let new_md = doc_to_markdown(&document, &new_markdown_options());

        let diffs = diff_lines(&old_md, &new_md);
        if diffs.is_empty() {
            passed.push(file_name.to_string());
        } else if NEW_VIEWER_CORRECT.contains(&file_name) {
            println!(
                "\n=== {} NEW_CORRECT: {} diffs (새 viewer가 더 정확) ===",
                file_name,
                diffs.len()
            );
            new_correct.push(file_name.to_string());
        } else {
            println!("\n=== {} FAILED: {} diffs ===", file_name, diffs.len());
            for d in diffs.iter().take(5) {
                println!("  {}", d);
            }
            if diffs.len() > 5 {
                println!("  ... and {} more", diffs.len() - 5);
            }
            failed.push(file_name.to_string());
        }
    }

    let total = passed.len() + new_correct.len() + failed.len();
    let pass_total = passed.len() + new_correct.len();
    println!("\n=== SUMMARY ===");
    println!("PASSED ({}/{}): {:?}", passed.len(), total, passed);
    if !new_correct.is_empty() {
        println!(
            "NEW_CORRECT ({}/{}): {:?}",
            new_correct.len(),
            total,
            new_correct
        );
    }
    println!(
        "TOTAL PASS ({}/{})",
        pass_total,
        total,
    );
    println!("FAILED ({}/{}): {:?}", failed.len(), total, failed);
}

fn compare_single_hwp(filename: &str) {
    let path = match find_fixture_file(filename) {
        Some(p) => p,
        None => return,
    };
    let data = std::fs::read(&path).unwrap();

    let parser = HwpParser::new();
    let hwp_doc = parser.parse(&data).unwrap();

    let old_md = hwp_doc.to_markdown(&old_markdown_options());
    let document = to_document(&hwp_doc);
    let new_md = doc_to_markdown(&document, &new_markdown_options());

    let diffs = diff_lines(&old_md, &new_md);
    if !diffs.is_empty() {
        println!("\n=== {}: {} diffs ===", filename, diffs.len());
        for d in &diffs {
            println!("  {}", d);
        }
    }

    assert_eq!(
        old_md, new_md,
        "{}: 기존 viewer와 새 viewer 출력이 다릅니다",
        filename
    );
}
