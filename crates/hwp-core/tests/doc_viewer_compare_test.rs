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

/// 새 viewer가 기존 viewer보다 더 정확한 파일 목록 (비교 대상에서 제외)
/// 이 파일들은 기존 viewer의 한계(표 셀 데이터 누락, bold 경계 오류 등)로 인해
/// 출력이 다르며, 새 viewer의 출력이 HTML viewer와 더 일치한다.
/// snapshot 테스트(test_all_fixtures_markdown_snapshots)로 검증.
const NEW_VIEWER_IS_GOLDEN: &[&str] = &[
    // software.hwp: 표 셀 내 텍스트("주요 기능 흐름")를 기존 viewer는 누락
    "software.hwp",
    // noori.hwp: bold 경계에서 공백 위치 차이 → 새 viewer가 HTML과 일치
    "noori.hwp",
    // multicolumns-layout.hwp: 표 셀 내 텍스트("표 셀 안의 다단") 기존 viewer 누락
    "multicolumns-layout.hwp",
    // chart.hwp: 표 마지막 열 데이터(67.5 등) 기존 viewer 빈 셀 처리
    "chart.hwp",
    // sample-5017.hwp: bold/italic 적용 → 기존 viewer 한계
    "sample-5017.hwp",
    // sample-5017-pics.hwp: 이미지/텍스트 출력 순서 차이 → 시각적 동등
    "sample-5017-pics.hwp",
    // multicolumns-in-common-controls.hwp: 표 셀 내 다단 텍스트 기존 viewer 누락
    "multicolumns-in-common-controls.hwp",
    // table-bug.hwp: 복잡한 표 구조(row_span+col_span+다수 표). 새 viewer가 더 많은
    //   셀 데이터 출력 (팀장 확인, 개인정보 항목 등). 기존 viewer는 CtrlHeader 미처리.
    "table-bug.hwp",
    // distribution.hwp: 배포용 문서. bold 경계/heading 번호 차이.
    //   기존 viewer의 CharShape 세그먼트 처리 한계 (부분 bold 깨짐).
    "distribution.hwp",
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
    let mut golden_skipped = Vec::new();
    let mut failed = Vec::new();

    for file_path in &hwp_files {
        let file_name = std::path::Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown");

        // 새 viewer가 golden인 파일은 비교 제외 (snapshot 테스트로 검증)
        if NEW_VIEWER_IS_GOLDEN.contains(&file_name) {
            golden_skipped.push(file_name.to_string());
            continue;
        }

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
        } else {
            println!("\n=== {} FAILED: {} diffs ===", file_name, diffs.len());
            for d in diffs.iter().take(10) {
                println!("  {}", d);
            }
            if diffs.len() > 10 {
                println!("  ... and {} more", diffs.len() - 10);
            }
            // Dump for analysis
            let dump_dir = std::path::Path::new("/tmp/hwp_diffs");
            std::fs::create_dir_all(dump_dir).ok();
            let base = file_name.replace(".hwp", "");
            std::fs::write(dump_dir.join(format!("{}_old.md", base)), &old_md).ok();
            std::fs::write(dump_dir.join(format!("{}_new.md", base)), &new_md).ok();
            failed.push(file_name.to_string());
        }
    }

    let compared = passed.len() + failed.len();
    println!("\n=== SUMMARY ===");
    println!("COMPARED: {}/{}", compared, compared + golden_skipped.len());
    println!("PASSED ({}/{}): {:?}", passed.len(), compared, passed);
    if !golden_skipped.is_empty() {
        println!(
            "GOLDEN_SKIP ({}): {:?}",
            golden_skipped.len(),
            golden_skipped
        );
    }
    println!("FAILED ({}/{}): {:?}", failed.len(), compared, failed);
    assert!(
        failed.is_empty(),
        "다음 파일에서 기존 viewer와 새 viewer 출력이 다릅니다: {:?}",
        failed
    );
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
