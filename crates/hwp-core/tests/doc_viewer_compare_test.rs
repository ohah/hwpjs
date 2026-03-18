/// HwpDocument API ↔ doc_to_xxx() 직접 호출 일관성 테스트
/// HwpDocument::to_markdown()/to_html()가 내부적으로 to_document() → doc_to_xxx()을 호출하므로
/// 동일한 옵션으로 호출 시 출력이 완전히 일치해야 함
mod common;
use common::find_fixture_file;

use hwp_core::convert::to_document;
use hwp_core::viewer::doc_html::{doc_to_html, DocHtmlOptions};
use hwp_core::viewer::doc_markdown::{doc_to_markdown, DocMarkdownOptions};
use hwp_core::viewer::{HtmlOptions, MarkdownOptions};
use hwp_core::HwpParser;

// ==================== Markdown 일관성 ====================

fn markdown_options() -> MarkdownOptions {
    MarkdownOptions {
        image_output_dir: None,
        use_html: Some(false),
        include_version: Some(false),
        include_page_info: Some(false),
    }
}

fn doc_markdown_options() -> DocMarkdownOptions {
    DocMarkdownOptions {
        image_output_dir: None,
        use_html: false,
        include_version: Some(false),
        include_page_info: Some(false),
    }
}

#[test]
fn consistency_example_hwp_markdown() {
    consistency_single_hwp_markdown("example.hwp");
}

#[test]
fn consistency_all_hwp_markdown() {
    let hwp_files = common::find_all_hwp_files();
    if hwp_files.is_empty() {
        println!("No HWP files found");
        return;
    }

    let parser = HwpParser::new();
    let mut passed = 0;
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

        let via_hwp_doc = hwp_doc.to_markdown(&markdown_options());
        let document = to_document(&hwp_doc);
        let via_doc = doc_to_markdown(&document, &doc_markdown_options());

        if via_hwp_doc == via_doc {
            passed += 1;
        } else {
            failed.push(file_name.to_string());
        }
    }

    println!(
        "\n=== MARKDOWN CONSISTENCY: {}/{} PASSED ===",
        passed,
        passed + failed.len()
    );
    assert!(
        failed.is_empty(),
        "HwpDocument::to_markdown()과 doc_to_markdown() 출력 불일치: {:?}",
        failed
    );
}

fn consistency_single_hwp_markdown(filename: &str) {
    let path = match find_fixture_file(filename) {
        Some(p) => p,
        None => return,
    };
    let data = std::fs::read(&path).unwrap();
    let parser = HwpParser::new();
    let hwp_doc = parser.parse(&data).unwrap();

    let via_hwp_doc = hwp_doc.to_markdown(&markdown_options());
    let document = to_document(&hwp_doc);
    let via_doc = doc_to_markdown(&document, &doc_markdown_options());

    assert_eq!(
        via_hwp_doc, via_doc,
        "{}: HwpDocument::to_markdown()과 doc_to_markdown() 출력이 다릅니다",
        filename
    );
}

// ==================== HTML 일관성 ====================

fn html_options() -> HtmlOptions {
    HtmlOptions {
        image_output_dir: None,
        html_output_dir: None,
        include_version: Some(false),
        include_page_info: Some(false),
        css_class_prefix: "hwp-".to_string(),
        layout: false,
    }
}

fn doc_html_options() -> DocHtmlOptions {
    DocHtmlOptions {
        css_class_prefix: "hwp-".to_string(),
        inline_style: true,
        image_output_dir: None,
        layout: false,
    }
}

// ==================== 레이아웃 모드 테스트 ====================

#[test]
fn test_layout_mode_produces_hpa() {
    let hwp_files = common::find_all_hwp_files();
    if hwp_files.is_empty() {
        return;
    }
    let parser = HwpParser::new();
    let data = std::fs::read(&hwp_files[0]).unwrap();
    let hwp_doc = parser.parse(&data).unwrap();

    // layout=true로 HTML 생성
    let options = HtmlOptions {
        layout: true,
        ..html_options()
    };
    let html = hwp_doc.to_html(&options);

    // hpa div가 있어야 함
    assert!(
        html.contains(r#"class="hpa""#),
        "Layout mode should produce hpa div"
    );
    assert!(
        html.contains(r#"class="hls"#),
        "Layout mode should produce hls div"
    );
    assert!(
        html.contains("<style>"),
        "Layout mode should include CSS"
    );
}

#[test]
fn test_layout_mode_hwpx() {
    let hwpx_files = common::find_all_hwpx_files();
    if hwpx_files.is_empty() {
        return;
    }
    let data = std::fs::read(&hwpx_files[0]).unwrap();
    let document = hwpx_parser::HwpxParser::parse(&data).unwrap();

    let options = DocHtmlOptions {
        layout: true,
        ..doc_html_options()
    };
    let html = doc_to_html(&document, &options);

    assert!(
        html.contains(r#"class="hpa""#),
        "HWPX layout mode should produce hpa div"
    );
}

#[test]
fn consistency_example_hwp_html() {
    consistency_single_hwp_html("example.hwp");
}

#[test]
fn consistency_all_hwp_html() {
    let hwp_files = common::find_all_hwp_files();
    if hwp_files.is_empty() {
        println!("No HWP files found");
        return;
    }

    let parser = HwpParser::new();
    let mut passed = 0;
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

        let via_hwp_doc = hwp_doc.to_html(&html_options());
        let document = to_document(&hwp_doc);
        let via_doc = doc_to_html(&document, &doc_html_options());

        if via_hwp_doc == via_doc {
            passed += 1;
        } else {
            failed.push(file_name.to_string());
        }
    }

    println!(
        "\n=== HTML CONSISTENCY: {}/{} PASSED ===",
        passed,
        passed + failed.len()
    );
    assert!(
        failed.is_empty(),
        "HwpDocument::to_html()과 doc_to_html() 출력 불일치: {:?}",
        failed
    );
}

fn consistency_single_hwp_html(filename: &str) {
    let path = match find_fixture_file(filename) {
        Some(p) => p,
        None => return,
    };
    let data = std::fs::read(&path).unwrap();
    let parser = HwpParser::new();
    let hwp_doc = parser.parse(&data).unwrap();

    let via_hwp_doc = hwp_doc.to_html(&html_options());
    let document = to_document(&hwp_doc);
    let via_doc = doc_to_html(&document, &doc_html_options());

    assert_eq!(
        via_hwp_doc, via_doc,
        "{}: HwpDocument::to_html()과 doc_to_html() 출력이 다릅니다",
        filename
    );
}

// ==================== HWPX HTML 스냅샷 일관성 ====================

#[test]
fn consistency_all_hwpx_html() {
    let hwpx_files = common::find_all_hwpx_files();
    if hwpx_files.is_empty() {
        println!("No HWPX files found");
        return;
    }

    let options = DocHtmlOptions::default();
    let mut passed = 0;
    let mut failed = Vec::new();

    for file_path in &hwpx_files {
        let file_name = std::path::Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown");

        let data = match std::fs::read(file_path) {
            Ok(d) => d,
            Err(_) => continue,
        };
        let document = match hwpx_parser::HwpxParser::parse(&data) {
            Ok(d) => d,
            Err(_) => continue,
        };

        let html = doc_to_html(&document, &options);
        if !html.is_empty() {
            passed += 1;
        } else {
            failed.push(file_name.to_string());
        }
    }

    println!(
        "\n=== HWPX HTML: {}/{} non-empty ===",
        passed,
        passed + failed.len()
    );
    assert!(
        failed.is_empty(),
        "HWPX doc_to_html() 빈 출력: {:?}",
        failed
    );
}

#[test]
fn compare_old_vs_new_layout_html() {
    let hwp_files = common::find_all_hwp_files();
    if hwp_files.is_empty() {
        return;
    }
    let parser = HwpParser::new();

    for file_path in &hwp_files {
        let file_name = std::path::Path::new(file_path)
            .file_stem()
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

        // old viewer HTML
        #[allow(deprecated)]
        let old_html = hwp_core::viewer::to_html(
            &hwp_doc,
            &HtmlOptions {
                layout: false,
                ..html_options()
            },
        );

        // new layout HTML
        let document = to_document(&hwp_doc);
        let new_html = doc_to_html(
            &document,
            &DocHtmlOptions {
                layout: true,
                ..doc_html_options()
            },
        );

        // 둘 다 /tmp에 저장하여 수동 비교 가능
        let dump_dir = std::path::Path::new("/tmp/hwp_layout_compare");
        std::fs::create_dir_all(dump_dir).ok();
        std::fs::write(dump_dir.join(format!("{}_old.html", file_name)), &old_html).ok();
        std::fs::write(dump_dir.join(format!("{}_new.html", file_name)), &new_html).ok();

        // 기본 검증: 둘 다 비어있지 않아야 함
        assert!(
            !old_html.is_empty(),
            "{}: old HTML is empty",
            file_name
        );
        assert!(
            !new_html.is_empty(),
            "{}: new layout HTML is empty",
            file_name
        );

        // hpa div가 새 HTML에 있어야 함
        assert!(
            new_html.contains(r#"class="hpa""#),
            "{}: new layout should have hpa",
            file_name
        );

        println!(
            "  {} — old: {} bytes, new: {} bytes",
            file_name,
            old_html.len(),
            new_html.len()
        );
    }
}
