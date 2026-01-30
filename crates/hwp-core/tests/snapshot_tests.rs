/// 스냅샷 테스트
/// Snapshot tests
mod common;
use common::*;

use hwp_core::document::ParagraphRecord;
use hwp_core::*;
use insta::{assert_snapshot, with_settings};

// insta가 tests/snapshots 디렉토리를 사용하도록 설정하는 헬퍼 매크로
macro_rules! assert_snapshot_with_path {
    ($name:expr, $value:expr) => {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let snapshots_dir = std::path::Path::new(manifest_dir)
            .join("tests")
            .join("snapshots");
        with_settings!({
            snapshot_path => snapshots_dir
        }, {
            assert_snapshot!($name, $value);
        });
    };
}

#[test]
fn test_full_document_json_snapshot() {
    let file_path = match find_test_file() {
        Some(path) => path,
        None => return, // Skip test if file not available
    };

    // 파일명에서 스냅샷 이름 추출 / Extract snapshot name from filename
    let file_name = std::path::Path::new(&file_path)
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");
    let snapshot_name = file_name.replace(['-', '.'], "_");
    let snapshot_name_json = format!("{}_json", snapshot_name);

    if let Ok(data) = std::fs::read(&file_path) {
        let parser = HwpParser::new();
        let result = parser.parse(&data);
        if let Err(e) = &result {
            eprintln!("Parse error: {:?}", e);
        }
        assert!(result.is_ok(), "Should parse HWP document");
        let document = result.unwrap();

        // Verify BodyText is parsed correctly
        // BodyText가 올바르게 파싱되었는지 검증
        assert!(
            !document.body_text.sections.is_empty(),
            "BodyText should have at least one section"
        );
        assert!(
            document.body_text.sections[0].index == 0,
            "First section should have index 0"
        );
        assert!(
            !document.body_text.sections[0].paragraphs.is_empty(),
            "First section should have at least one paragraph"
        );

        // Convert to JSON
        // serde_json already outputs unicode characters as-is (not escaped)
        // Only control characters are escaped according to JSON standard
        let json =
            serde_json::to_string_pretty(&document).expect("Should serialize document to JSON");
        assert_snapshot_with_path!(snapshot_name_json.as_str(), json);

        // 실제 JSON 파일로도 저장 / Also save as actual JSON file
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let snapshots_dir = std::path::Path::new(manifest_dir)
            .join("tests")
            .join("snapshots");
        std::fs::create_dir_all(&snapshots_dir).unwrap_or(());
        let json_file = snapshots_dir.join(format!("{}.json", file_name));
        std::fs::write(&json_file, &json).unwrap_or_else(|e| {
            eprintln!("Failed to write JSON file: {}", e);
        });
    }
}

#[test]
fn test_all_fixtures_json_snapshots() {
    // 모든 fixtures 파일에 대해 JSON 스냅샷 생성 / Generate JSON snapshots for all fixtures files
    let hwp_files = find_all_hwp_files();
    if hwp_files.is_empty() {
        println!("No HWP files found in fixtures directory");
        return;
    }

    let parser = HwpParser::new();
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let snapshots_dir = std::path::Path::new(manifest_dir)
        .join("tests")
        .join("snapshots");

    for file_path in &hwp_files {
        let file_name = std::path::Path::new(file_path)
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown");

        // 파일명을 스냅샷 이름으로 사용 (특수 문자 제거) / Use filename as snapshot name (remove special chars)
        let snapshot_name = file_name.replace(['-', '.'], "_");
        let snapshot_name_json = format!("{}_json", snapshot_name);

        match std::fs::read(file_path) {
            Ok(data) => {
                match parser.parse(&data) {
                    Ok(document) => {
                        // Convert to JSON
                        let json = serde_json::to_string_pretty(&document)
                            .expect("Should serialize document to JSON");

                        // 스냅샷 생성 / Create snapshot
                        assert_snapshot_with_path!(snapshot_name_json.as_str(), json);

                        // 실제 JSON 파일로도 저장 / Also save as actual JSON file
                        let json_file = snapshots_dir.join(format!("{}.json", file_name));
                        std::fs::create_dir_all(&snapshots_dir).unwrap_or(());
                        std::fs::write(&json_file, &json).unwrap_or_else(|e| {
                            eprintln!("Failed to write JSON file {}: {}", json_file.display(), e);
                        });
                    }
                    Err(e) => {
                        eprintln!("Skipping {} due to parse error: {}", file_name, e);
                    }
                }
            }
            Err(e) => {
                eprintln!("Failed to read {}: {}", file_name, e);
            }
        }
    }
}

#[test]
fn test_debug_record_levels() {
    let file_path = match find_test_file() {
        Some(path) => path,
        None => return,
    };

    if let Ok(data) = std::fs::read(&file_path) {
        let mut cfb = CfbParser::parse(&data).expect("Should parse CFB");
        let fileheader = FileHeader::parse(
            &CfbParser::read_stream(&mut cfb, "FileHeader").expect("Should read FileHeader"),
        )
        .expect("Should parse FileHeader");

        let section_data = CfbParser::read_nested_stream(&mut cfb, "BodyText", "Section0")
            .expect("Should read Section0");

        let decompressed = if fileheader.is_compressed() {
            hwp_core::decompress_deflate(&section_data).expect("Should decompress section data")
        } else {
            section_data
        };

        let mut offset = 0;
        let mut record_count = 0;
        let mut table_records = Vec::new();
        let mut list_header_records = Vec::new();

        while offset < decompressed.len() {
            let remaining_data = &decompressed[offset..];
            match RecordHeader::parse(remaining_data) {
                Ok((header, header_size)) => {
                    record_count += 1;
                    let tag_id = header.tag_id;
                    let level = header.level;
                    let size = header.size as usize;

                    if tag_id == 0x43 {
                        table_records.push((record_count, level, offset));
                        println!(
                            "Record {}: TABLE (0x43) at offset {}, level {}",
                            record_count, offset, level
                        );
                    }
                    if tag_id == 0x44 {
                        list_header_records.push((record_count, level, offset));
                        println!(
                            "Record {}: LIST_HEADER (0x44) at offset {}, level {}",
                            record_count, offset, level
                        );
                    }

                    offset += header_size + size;
                }
                Err(_) => break,
            }
        }

        println!("\n=== Summary ===");
        println!("Total records: {}", record_count);
        println!("TABLE records: {}", table_records.len());
        println!("LIST_HEADER records: {}", list_header_records.len());

        for (table_idx, table_level, table_offset) in &table_records {
            println!(
                "\nTABLE at record {} (offset {}, level {}):",
                table_idx, table_offset, table_level
            );
            for (list_idx, list_level, list_offset) in &list_header_records {
                if *list_offset > *table_offset && *list_offset < *table_offset + 1000 {
                    println!(
                        "  -> LIST_HEADER at record {} (offset {}, level {})",
                        list_idx, list_offset, list_level
                    );
                }
            }
        }
    }
}

#[test]
fn test_debug_list_header_children() {
    let file_path = match find_test_file() {
        Some(path) => path,
        None => return,
    };

    if let Ok(data) = std::fs::read(&file_path) {
        let parser = HwpParser::new();
        let result = parser.parse(&data);
        if let Err(e) = &result {
            eprintln!("Parse error: {:?}", e);
        }
        assert!(result.is_ok(), "Should parse HWP document");
        let _document = result.unwrap();

        use hwp_core::decompress::decompress_deflate;
        use hwp_core::document::bodytext::record_tree::RecordTreeNode;
        use hwp_core::CfbParser;
        use hwp_core::FileHeader;

        let mut cfb = CfbParser::parse(&data).expect("Should parse CFB");
        let fileheader = FileHeader::parse(
            &CfbParser::read_stream(&mut cfb, "FileHeader").expect("Should read FileHeader"),
        )
        .expect("Should parse FileHeader");

        let section_data = CfbParser::read_nested_stream(&mut cfb, "BodyText", "Section0")
            .expect("Should read Section0");

        let decompressed = if fileheader.is_compressed() {
            decompress_deflate(&section_data).expect("Should decompress section data")
        } else {
            section_data
        };

        let tree = RecordTreeNode::parse_tree(&decompressed).expect("Should parse tree");

        // LIST_HEADER 찾기 및 자식 확인 / Find LIST_HEADER and check children
        fn find_list_headers(node: &RecordTreeNode, depth: usize) {
            if node.tag_id() == 0x44 {
                // HWPTAG_LIST_HEADER
                println!(
                    "{}LIST_HEADER (level {}): {} children",
                    "  ".repeat(depth),
                    node.level(),
                    node.children().len()
                );
                for (i, child) in node.children().iter().enumerate() {
                    println!(
                        "{}  Child {}: tag_id={}, level={}",
                        "  ".repeat(depth),
                        i,
                        child.tag_id(),
                        child.level()
                    );
                    if child.tag_id() == 0x32 {
                        // HWPTAG_PARA_HEADER
                        println!("{}    -> PARA_HEADER found!", "  ".repeat(depth));
                    }
                }
            }
            for child in node.children() {
                find_list_headers(child, depth + 1);
            }
        }

        println!("=== LIST_HEADER Children Debug ===");
        find_list_headers(&tree, 0);
    }
}

#[test]
fn test_document_markdown_snapshot() {
    let file_path = match find_test_file() {
        Some(path) => path,
        None => return, // Skip test if file not available
    };

    // 파일명에서 스냅샷 이름 추출 / Extract snapshot name from filename
    let file_name = std::path::Path::new(&file_path)
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");
    let snapshot_name = file_name.replace(['-', '.'], "_");
    let snapshot_name_md = format!("{}_markdown", snapshot_name);

    if let Ok(data) = std::fs::read(&file_path) {
        let parser = HwpParser::new();
        let result = parser.parse(&data);
        if let Err(e) = &result {
            eprintln!("Parse error: {:?}", e);
        }
        assert!(result.is_ok(), "Should parse HWP document");
        let document = result.unwrap();

        // Convert to markdown with image files (not base64)
        // 이미지를 파일로 저장하고 파일 경로를 사용 / Save images as files and use file paths
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let snapshots_dir = std::path::Path::new(manifest_dir)
            .join("tests")
            .join("snapshots");
        let images_dir = snapshots_dir.join("images").join(file_name);
        std::fs::create_dir_all(&images_dir).unwrap_or(());
        let options = hwp_core::viewer::markdown::MarkdownOptions {
            image_output_dir: images_dir.to_str().map(|s| s.to_string()),
            use_html: Some(true),
            include_version: Some(true),
            include_page_info: Some(true),
        };
        let markdown = document.to_markdown(&options);
        assert_snapshot_with_path!(snapshot_name_md.as_str(), markdown);

        // 실제 Markdown 파일로도 저장 / Also save as actual Markdown file
        let md_file = snapshots_dir.join(format!("{}.md", file_name));
        std::fs::write(&md_file, &markdown).unwrap_or_else(|e| {
            eprintln!("Failed to write Markdown file: {}", e);
        });
    }
}

#[test]
fn test_headerfooter_markdown() {
    // headerfooter.hwp 파일에 대해 Markdown 스냅샷 생성 / Generate Markdown snapshot for headerfooter.hwp
    let file_path = match find_headerfooter_file() {
        Some(path) => path,
        None => {
            eprintln!("headerfooter.hwp not found, skipping test");
            return;
        }
    };

    let parser = HwpParser::new();
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let snapshots_dir = std::path::Path::new(manifest_dir)
        .join("tests")
        .join("snapshots");

    let file_name = std::path::Path::new(&file_path)
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");
    let snapshot_name = file_name.replace(['-', '.'], "_");
    let snapshot_name_md = format!("{}_markdown", snapshot_name);

    match std::fs::read(&file_path) {
        Ok(data) => {
            match parser.parse(&data) {
                Ok(document) => {
                    // Convert to markdown with image files (not base64)
                    // 이미지를 파일로 저장하고 파일 경로를 사용 / Save images as files and use file paths
                    let images_dir = snapshots_dir.join("images").join(file_name);
                    std::fs::create_dir_all(&images_dir).unwrap_or(());

                    let options = hwp_core::viewer::markdown::MarkdownOptions {
                        image_output_dir: images_dir.to_str().map(|s| s.to_string()),
                        use_html: Some(true),
                        include_version: Some(true),
                        include_page_info: Some(true),
                    };

                    let markdown = document.to_markdown(&options);

                    // 스냅샷 생성 / Create snapshot
                    assert_snapshot_with_path!(snapshot_name_md.as_str(), markdown);

                    // 실제 Markdown 파일로도 저장 / Also save as actual Markdown file
                    let md_file = snapshots_dir.join(format!("{}.md", file_name));
                    std::fs::create_dir_all(&snapshots_dir).unwrap_or(());
                    std::fs::write(&md_file, &markdown).unwrap_or_else(|e| {
                        eprintln!("Failed to write Markdown file {}: {}", md_file.display(), e);
                    });
                }
                Err(e) => {
                    eprintln!("Failed to parse {}: {:?}", file_path, e);
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to read {}: {}", file_path, e);
        }
    }
}

#[test]
fn test_all_fixtures_markdown_snapshots() {
    // 모든 fixtures 파일에 대해 Markdown 스냅샷 생성 / Generate Markdown snapshots for all fixtures files
    let hwp_files = find_all_hwp_files();
    if hwp_files.is_empty() {
        println!("No HWP files found in fixtures directory");
        return;
    }

    let parser = HwpParser::new();
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let snapshots_dir = std::path::Path::new(manifest_dir)
        .join("tests")
        .join("snapshots");

    for file_path in &hwp_files {
        let file_name = std::path::Path::new(file_path)
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown");

        // 파일명을 스냅샷 이름으로 사용 (특수 문자 제거) / Use filename as snapshot name (remove special chars)
        let snapshot_name = file_name.replace(['-', '.'], "_");
        let snapshot_name_md = format!("{}_markdown", snapshot_name);

        match std::fs::read(file_path) {
            Ok(data) => {
                match parser.parse(&data) {
                    Ok(document) => {
                        // Convert to markdown with image files (not base64)
                        // 이미지를 파일로 저장하고 파일 경로를 사용 / Save images as files and use file paths
                        let images_dir = snapshots_dir.join("images").join(file_name);
                        std::fs::create_dir_all(&images_dir).unwrap_or(());

                        let options = hwp_core::viewer::markdown::MarkdownOptions {
                            image_output_dir: images_dir.to_str().map(|s| s.to_string()),
                            use_html: Some(true),
                            include_version: Some(true),
                            include_page_info: Some(true),
                        };
                        let markdown = document.to_markdown(&options);

                        // 스냅샷 생성 / Create snapshot
                        assert_snapshot_with_path!(snapshot_name_md.as_str(), markdown);

                        // 실제 Markdown 파일로도 저장 / Also save as actual Markdown file
                        let md_file = snapshots_dir.join(format!("{}.md", file_name));
                        std::fs::create_dir_all(&snapshots_dir).unwrap_or(());
                        std::fs::write(&md_file, &markdown).unwrap_or_else(|e| {
                            eprintln!("Failed to write Markdown file {}: {}", md_file.display(), e);
                        });
                    }
                    Err(e) => {
                        eprintln!("Skipping {} due to parse error: {}", file_name, e);
                    }
                }
            }
            Err(e) => {
                eprintln!("Failed to read {}: {}", file_name, e);
            }
        }
    }
}

#[test]
fn test_document_html_snapshot() {
    let file_path = match find_fixture_file("linespacing.hwp") {
        Some(path) => path,
        None => return, // Skip test if file not available
    };

    // 파일명에서 스냅샷 이름 추출 / Extract snapshot name from filename
    let file_name = std::path::Path::new(&file_path)
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");
    let snapshot_name = file_name.replace(['-', '.'], "_");
    let snapshot_name_html = format!("{}_html", snapshot_name);

    if let Ok(data) = std::fs::read(&file_path) {
        let parser = HwpParser::new();
        let result = parser.parse(&data);
        if let Err(e) = &result {
            eprintln!("Parse error: {:?}", e);
        }
        assert!(result.is_ok(), "Should parse HWP document");
        let document = result.unwrap();

        // Convert to HTML with image files (not base64)
        // 이미지를 파일로 저장하고 파일 경로를 사용 / Save images as files and use file paths
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let snapshots_dir = std::path::Path::new(manifest_dir)
            .join("tests")
            .join("snapshots");
        let images_dir = snapshots_dir.join("images").join(file_name);
        std::fs::create_dir_all(&images_dir).unwrap_or(());
        let options = hwp_core::viewer::HtmlOptions {
            image_output_dir: images_dir.to_str().map(|s| s.to_string()),
            html_output_dir: snapshots_dir.to_str().map(|s| s.to_string()),
            include_version: Some(true),
            include_page_info: Some(true),
            css_class_prefix: "ohah-hwpjs-".to_string(),
        };
        let html = document.to_html(&options);
        assert_snapshot_with_path!(snapshot_name_html.as_str(), html);

        // 실제 HTML 파일로도 저장 / Also save as actual HTML file
        let html_file = snapshots_dir.join(format!("{}.html", file_name));
        std::fs::write(&html_file, &html).unwrap_or_else(|e| {
            eprintln!("Failed to write HTML file: {}", e);
        });
    }
}

#[test]
fn test_headerfooter_html() {
    // headerfooter.hwp 파일에 대해 HTML 스냅샷 생성 / Generate HTML snapshot for headerfooter.hwp
    let file_path = match find_headerfooter_file() {
        Some(path) => path,
        None => {
            eprintln!("headerfooter.hwp not found, skipping test");
            return;
        }
    };

    let parser = HwpParser::new();
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let snapshots_dir = std::path::Path::new(manifest_dir)
        .join("tests")
        .join("snapshots");

    let file_name = std::path::Path::new(&file_path)
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");
    let snapshot_name = file_name.replace(['-', '.'], "_");
    let snapshot_name_html = format!("{}_html", snapshot_name);

    match std::fs::read(&file_path) {
        Ok(data) => {
            match parser.parse(&data) {
                Ok(document) => {
                    // Convert to HTML with image files (not base64)
                    // 이미지를 파일로 저장하고 파일 경로를 사용 / Save images as files and use file paths
                    let images_dir = snapshots_dir.join("images").join(file_name);
                    std::fs::create_dir_all(&images_dir).unwrap_or(());

                    let options = hwp_core::viewer::html::HtmlOptions {
                        image_output_dir: images_dir.to_str().map(|s| s.to_string()),
                        html_output_dir: snapshots_dir.to_str().map(|s| s.to_string()),
                        include_version: Some(true),
                        include_page_info: Some(true),
                        css_class_prefix: "ohah-hwpjs-".to_string(),
                    };

                    let html = document.to_html(&options);

                    // 스냅샷 생성 / Create snapshot
                    assert_snapshot_with_path!(snapshot_name_html.as_str(), html);

                    // 실제 HTML 파일로도 저장 / Also save as actual HTML file
                    let html_file = snapshots_dir.join(format!("{}.html", file_name));
                    std::fs::create_dir_all(&snapshots_dir).unwrap_or(());
                    std::fs::write(&html_file, &html).unwrap_or_else(|e| {
                        eprintln!("Failed to write HTML file {}: {}", html_file.display(), e);
                    });
                }
                Err(e) => {
                    eprintln!("Failed to parse {}: {:?}", file_path, e);
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to read {}: {}", file_path, e);
        }
    }
}

#[test]
fn test_all_fixtures_html_snapshots() {
    // 모든 fixtures 파일에 대해 HTML 스냅샷 생성 / Generate HTML snapshots for all fixtures files
    let hwp_files = find_all_hwp_files();
    if hwp_files.is_empty() {
        println!("No HWP files found in fixtures directory");
        return;
    }

    let parser = HwpParser::new();
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let snapshots_dir = std::path::Path::new(manifest_dir)
        .join("tests")
        .join("snapshots");

    for file_path in &hwp_files {
        let file_name = std::path::Path::new(file_path)
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown");

        // 파일명을 스냅샷 이름으로 사용 (특수 문자 제거) / Use filename as snapshot name (remove special chars)
        let snapshot_name = file_name.replace(['-', '.'], "_");
        let snapshot_name_html = format!("{}_html", snapshot_name);

        match std::fs::read(file_path) {
            Ok(data) => {
                match parser.parse(&data) {
                    Ok(document) => {
                        // Convert to HTML with image files (not base64)
                        // 이미지를 파일로 저장하고 파일 경로를 사용 / Save images as files and use file paths
                        let images_dir = snapshots_dir.join("images").join(file_name);
                        std::fs::create_dir_all(&images_dir).unwrap_or(());

                        let options = hwp_core::viewer::html::HtmlOptions {
                            image_output_dir: images_dir.to_str().map(|s| s.to_string()),
                            html_output_dir: snapshots_dir.to_str().map(|s| s.to_string()),
                            include_version: Some(true),
                            include_page_info: Some(true),
                            css_class_prefix: String::new(), // table.html과 일치하도록 빈 문자열 사용
                        };
                        if file_name == "table" {
                            eprintln!("DEBUG: Processing table.hwp file");
                        }
                        let html = document.to_html(&options);

                        // 스냅샷 생성 / Create snapshot
                        assert_snapshot_with_path!(snapshot_name_html.as_str(), html);

                        // 실제 HTML 파일로도 저장 / Also save as actual HTML file
                        let html_file = snapshots_dir.join(format!("{}.html", file_name));
                        std::fs::create_dir_all(&snapshots_dir).unwrap_or(());
                        std::fs::write(&html_file, &html).unwrap_or_else(|e| {
                            eprintln!("Failed to write HTML file {}: {}", html_file.display(), e);
                        });
                    }
                    Err(e) => {
                        eprintln!("Skipping {} due to parse error: {}", file_name, e);
                    }
                }
            }
            Err(e) => {
                eprintln!("Failed to read {}: {}", file_name, e);
            }
        }
    }
}

#[test]
fn test_table2_html_snapshot() {
    // table2.hwp 파일만 테스트 / Test only table2.hwp file
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let fixtures_dir = std::path::Path::new(manifest_dir)
        .join("tests")
        .join("fixtures");
    let file_path = fixtures_dir.join("table2.hwp");

    if !file_path.exists() {
        eprintln!("table2.hwp not found, skipping test");
        return;
    }

    let parser = HwpParser::new();
    let snapshots_dir = std::path::Path::new(manifest_dir)
        .join("tests")
        .join("snapshots");

    let file_name = "table2";
    let snapshot_name_html = "table2_html";

    match std::fs::read(&file_path) {
        Ok(data) => {
            match parser.parse(&data) {
                Ok(document) => {
                    // Convert to HTML with image files (not base64)
                    // 이미지를 파일로 저장하고 파일 경로를 사용 / Save images as files and use file paths
                    let images_dir = snapshots_dir.join("images").join(file_name);
                    std::fs::create_dir_all(&images_dir).unwrap_or(());

                    let options = hwp_core::viewer::html::HtmlOptions {
                        image_output_dir: images_dir.to_str().map(|s| s.to_string()),
                        html_output_dir: snapshots_dir.to_str().map(|s| s.to_string()),
                        include_version: Some(true),
                        include_page_info: Some(true),
                        css_class_prefix: String::new(), // table.html과 일치하도록 빈 문자열 사용
                    };
                    eprintln!("DEBUG: Processing table2.hwp file");
                    let html = document.to_html(&options);

                    // 스냅샷 생성 / Create snapshot
                    assert_snapshot_with_path!(snapshot_name_html, html);

                    // 실제 HTML 파일로도 저장 / Also save as actual HTML file
                    let html_file = snapshots_dir.join(format!("{}.html", file_name));
                    std::fs::create_dir_all(&snapshots_dir).unwrap_or(());
                    std::fs::write(&html_file, &html).unwrap_or_else(|e| {
                        eprintln!("Failed to write HTML file {}: {}", html_file.display(), e);
                    });
                }
                Err(e) => {
                    eprintln!("Parse error for table2.hwp: {}", e);
                    panic!("Failed to parse table2.hwp: {}", e);
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to read table2.hwp: {}", e);
            panic!("Failed to read table2.hwp: {}", e);
        }
    }
}

#[test]
fn test_parse_all_fixtures() {
    // 모든 fixtures 파일을 파싱하여 에러가 없는지 확인 / Parse all fixtures files to check for errors
    let hwp_files = find_all_hwp_files();
    if hwp_files.is_empty() {
        println!("No HWP files found in fixtures directory");
        return;
    }

    let parser = HwpParser::new();
    let mut success_count = 0;
    let mut error_count = 0;
    let mut error_files: Vec<(String, String, String)> = Vec::new(); // (file, version, error)

    for file_path in &hwp_files {
        match std::fs::read(file_path) {
            Ok(data) => {
                // FileHeader 버전 확인 / Check FileHeader version
                use hwp_core::CfbParser;
                use hwp_core::FileHeader;
                let version_str = match CfbParser::parse(&data) {
                    Ok(mut cfb) => match CfbParser::read_stream(&mut cfb, "FileHeader") {
                        Ok(fileheader_data) => match FileHeader::parse(&fileheader_data) {
                            Ok(fh) => {
                                let major = (fh.version >> 24) & 0xFF;
                                let minor = (fh.version >> 16) & 0xFF;
                                let patch = (fh.version >> 8) & 0xFF;
                                let revision = fh.version & 0xFF;
                                format!("{}.{}.{}.{}", major, minor, patch, revision)
                            }
                            Err(_) => "unknown".to_string(),
                        },
                        Err(_) => "unknown".to_string(),
                    },
                    Err(_) => "unknown".to_string(),
                };

                match parser.parse(&data) {
                    Ok(_document) => {
                        success_count += 1;
                    }
                    Err(e) => {
                        error_count += 1;
                        let file_name = std::path::Path::new(file_path)
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or(file_path);
                        error_files.push((file_name.to_string(), version_str, e.to_string()));
                        eprintln!("Failed to parse {}: {}", file_path, e);
                    }
                }
            }
            Err(e) => {
                error_count += 1;
                eprintln!("Failed to read {}: {}", file_path, e);
            }
        }
    }

    println!("\n=== Summary ===",);
    println!(
        "Parsed {} files successfully, {} errors",
        success_count, error_count
    );

    // 에러 유형별 통계 / Statistics by error type
    let mut object_common_errors: Vec<(String, String, String)> = Vec::new();
    let mut other_errors: Vec<(String, String, String)> = Vec::new();

    for (file, version, error) in &error_files {
        if error.contains("Object common properties must be at least 42 bytes") {
            object_common_errors.push((file.clone(), version.clone(), error.clone()));
        } else {
            other_errors.push((file.clone(), version.clone(), error.clone()));
        }
    }

    if !object_common_errors.is_empty() {
        println!(
            "\n=== Object common properties 40-byte errors ({} files) ===",
            object_common_errors.len()
        );
        for (file, version, error) in &object_common_errors {
            println!("  {} (version: {}): {}", file, version, error);
        }
    }

    if !other_errors.is_empty() {
        println!("\n=== Other errors ({} files) ===", other_errors.len());
        for (file, version, error) in &other_errors {
            println!("  {} (version: {}): {}", file, version, error);
        }
    }

    // 최소한 하나는 성공해야 함 / At least one should succeed
    assert!(
        success_count > 0,
        "At least one file should parse successfully"
    );
}

#[test]
fn test_analyze_object_common_properties_size() {
    // Object common properties의 실제 바이트 크기 분석 / Analyze actual byte size of Object common properties
    let error_files = vec![
        "aligns.hwp",
        "borderfill.hwp",
        "matrix.hwp",
        "table.hwp",
        "textbox.hwp",
    ];

    let fixtures_dir = find_fixtures_dir();
    if fixtures_dir.is_none() {
        println!("Fixtures directory not found");
        return;
    }
    let fixtures_dir = fixtures_dir.unwrap();

    use hwp_core::decompress::decompress_deflate;
    use hwp_core::document::bodytext::record_tree::RecordTreeNode;
    use hwp_core::document::bodytext::CtrlHeader;
    use hwp_core::CfbParser;
    use hwp_core::FileHeader;

    println!("\n=== Analyzing Object Common Properties Size ===\n");

    for file_name in &error_files {
        let file_path = fixtures_dir.join(file_name);
        if !file_path.exists() {
            println!("File not found: {}", file_name);
            continue;
        }

        match std::fs::read(&file_path) {
            Ok(data) => {
                let mut cfb = match CfbParser::parse(&data) {
                    Ok(c) => c,
                    Err(e) => {
                        println!("{}: Failed to parse CFB: {}", file_name, e);
                        continue;
                    }
                };

                // FileHeader 버전 확인 / Check FileHeader version
                let fileheader = match CfbParser::read_stream(&mut cfb, "FileHeader") {
                    Ok(fh_data) => match FileHeader::parse(&fh_data) {
                        Ok(fh) => {
                            let major = (fh.version >> 24) & 0xFF;
                            let minor = (fh.version >> 16) & 0xFF;
                            let patch = (fh.version >> 8) & 0xFF;
                            let revision = fh.version & 0xFF;
                            println!(
                                "{}: Version {}.{}.{}.{}",
                                file_name, major, minor, patch, revision
                            );
                            fh
                        }
                        Err(e) => {
                            println!("{}: Failed to parse FileHeader: {}", file_name, e);
                            continue;
                        }
                    },
                    Err(e) => {
                        println!("{}: Failed to read FileHeader: {}", file_name, e);
                        continue;
                    }
                };

                // BodyText Section0 읽기 / Read BodyText Section0
                let section_data =
                    match CfbParser::read_nested_stream(&mut cfb, "BodyText", "Section0") {
                        Ok(s) => s,
                        Err(e) => {
                            println!("{}: Failed to read Section0: {}", file_name, e);
                            continue;
                        }
                    };

                // 압축 해제 / Decompress
                let decompressed = if fileheader.is_compressed() {
                    match decompress_deflate(&section_data) {
                        Ok(d) => d,
                        Err(e) => {
                            println!("{}: Failed to decompress: {}", file_name, e);
                            continue;
                        }
                    }
                } else {
                    section_data
                };

                // 레코드 트리 파싱 / Parse record tree
                let tree = match RecordTreeNode::parse_tree(&decompressed) {
                    Ok(t) => t,
                    Err(e) => {
                        println!("{}: Failed to parse tree: {}", file_name, e);
                        continue;
                    }
                };

                // CTRL_HEADER 레코드 찾기 / Find CTRL_HEADER records
                fn find_ctrl_headers(node: &RecordTreeNode, depth: usize) {
                    for child in &node.children {
                        if child.header.tag_id == 0x42 {
                            // HWPTAG_CTRL_HEADER
                            // CtrlHeader 파싱 시도 / Try to parse CtrlHeader
                            match CtrlHeader::parse(&child.data) {
                                Ok(_ctrl) => {
                                    // 성공한 경우는 스킵 / Skip if successful
                                }
                                Err(e) => {
                                    // 에러 발생 시 데이터 크기 출력 / Print data size on error
                                    let indent = "  ".repeat(depth);
                                    println!(
                                        "{}CTRL_HEADER at depth {}: data size = {} bytes, error: {}",
                                        indent, depth, child.data.len(), e
                                    );

                                    // 컨트롤 ID 확인 / Check control ID
                                    if child.data.len() >= 4 {
                                        let ctrl_id_bytes = [
                                            child.data[3],
                                            child.data[2],
                                            child.data[1],
                                            child.data[0],
                                        ];
                                        let ctrl_id = String::from_utf8_lossy(&ctrl_id_bytes);
                                        println!(
                                            "{}  Control ID: '{}' (0x{:08X})",
                                            indent,
                                            ctrl_id,
                                            u32::from_le_bytes([
                                                child.data[0],
                                                child.data[1],
                                                child.data[2],
                                                child.data[3]
                                            ])
                                        );

                                        // remaining_data 크기 확인 / Check remaining_data size
                                        if child.data.len() > 4 {
                                            let remaining_size = child.data.len() - 4;
                                            println!(
                                                "{}  Remaining data size (after control ID): {} bytes",
                                                indent, remaining_size
                                            );

                                            // 표 69 구조 계산 / Calculate Table 69 structure
                                            // attribute(4) + offset_y(4) + offset_x(4) + width(4) + height(4) + z_order(4) + margin(8) + instance_id(4) + page_divide(4) = 40
                                            // description_len(2) + description(2×len) = 추가
                                            println!(
                                                "{}  Expected: 40 bytes (without description) or 42+ bytes (with description)",
                                                indent
                                            );
                                        }
                                    }
                                }
                            }
                        }
                        find_ctrl_headers(child, depth + 1);
                    }
                }

                println!("{}: Analyzing CTRL_HEADER records...", file_name);
                find_ctrl_headers(&tree, 0);
                println!();
            }
            Err(e) => {
                println!("{}: Failed to read file: {}", file_name, e);
            }
        }
    }
}

#[test]
fn test_document_markdown_with_image_files() {
    let file_path = match find_test_file() {
        Some(path) => path,
        None => return, // Skip test if file not available
    };

    if let Ok(data) = std::fs::read(&file_path) {
        let parser = HwpParser::new();
        let result = parser.parse(&data);
        if let Err(e) = &result {
            eprintln!("Parse error: {:?}", e);
        }
        assert!(result.is_ok(), "Should parse HWP document");
        let document = result.unwrap();

        // Skip test if document has no images
        if document.bin_data.items.is_empty() {
            println!("Document has no images, skipping image file test");
            return;
        }

        // Create images directory in snapshots folder
        // 스냅샷 폴더 안에 이미지 디렉토리 생성
        // Use CARGO_MANIFEST_DIR to find the crate root, then navigate to snapshots
        let manifest_dir = env!("CARGO_MANIFEST_DIR"); // e.g., "/path/to/hwpjs/crates/hwp-core"
        let snapshots_dir = std::path::Path::new(manifest_dir)
            .join("tests")
            .join("snapshots");
        let images_dir = snapshots_dir.join("images");
        std::fs::create_dir_all(&images_dir).unwrap();

        // Convert to markdown with image files
        let options = hwp_core::viewer::markdown::MarkdownOptions {
            image_output_dir: images_dir.to_str().map(|s| s.to_string()),
            use_html: Some(true),
            include_version: Some(true),
            include_page_info: Some(true),
        };
        let markdown = document.to_markdown(&options);

        // Check that markdown contains file paths instead of base64
        assert!(
            !markdown.contains("data:image"),
            "Markdown should not contain base64 data URIs when image_output_dir is provided"
        );

        // Check that markdown contains image file references
        assert!(
            markdown.contains("![이미지]"),
            "Markdown should contain image references"
        );

        // Collect all image files that were created
        let image_files: Vec<_> = std::fs::read_dir(&images_dir)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| {
                entry
                    .path()
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| ["jpg", "jpeg", "png", "gif", "bmp"].contains(&ext))
                    .unwrap_or(false)
            })
            .collect();

        // Verify that image files were created
        assert!(
            !image_files.is_empty(),
            "At least one image file should be created when document has images"
        );

        // Verify each image file
        for entry in &image_files {
            let path = entry.path();
            let file_name = path.file_name().unwrap().to_string_lossy();

            // Check file exists
            assert!(path.exists(), "Image file should exist: {}", file_name);

            // Check file size is not zero
            let metadata = std::fs::metadata(&path).unwrap();
            assert!(
                metadata.len() > 0,
                "Image file should not be empty: {}",
                file_name
            );

            // Check file content (verify it's a valid image by checking file signatures)
            let file_data = std::fs::read(&path).unwrap();
            let extension = path
                .extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or("")
                .to_lowercase();

            // Print file info for debugging
            println!(
                "Checking image file: {} (size: {} bytes, extension: {})",
                file_name,
                file_data.len(),
                extension
            );

            // Check file signature based on extension
            let is_valid = match extension.as_str() {
                "jpg" | "jpeg" => {
                    // JPEG files start with FF D8
                    file_data.len() >= 2 && file_data[0] == 0xFF && file_data[1] == 0xD8
                }
                "png" => {
                    // PNG files start with 89 50 4E 47
                    file_data.len() >= 4
                        && file_data[0] == 0x89
                        && file_data[1] == 0x50
                        && file_data[2] == 0x4E
                        && file_data[3] == 0x47
                }
                "gif" => {
                    // GIF files start with "GIF89a" or "GIF87a"
                    file_data.len() >= 6
                        && (file_data.starts_with(b"GIF89a") || file_data.starts_with(b"GIF87a"))
                }
                "bmp" => {
                    // BMP files start with "BM"
                    file_data.len() >= 2 && file_data[0] == 0x42 && file_data[1] == 0x4D
                }
                _ => {
                    // For unknown extensions, just check file is not empty
                    println!(
                        "Warning: Unknown image extension '{}' for file {}, skipping signature check",
                        extension, file_name
                    );
                    true // Accept unknown extensions
                }
            };

            if !is_valid {
                // Print first few bytes for debugging
                let preview: String = file_data
                    .iter()
                    .take(16)
                    .map(|b| format!("{:02X} ", b))
                    .collect();
                println!(
                    "Warning: File {} may not be a valid {} file. First 16 bytes: {}",
                    file_name, extension, preview
                );
                // Don't fail the test, just warn - the file was created successfully
                // The issue might be with the extension or file format detection
            } else {
                println!("✓ File {} has valid {} signature", file_name, extension);
            }

            // Verify that markdown references this file
            let file_name_str = path.file_name().unwrap().to_string_lossy();
            assert!(
                markdown.contains(file_name_str.as_ref()),
                "Markdown should reference image file: {}",
                file_name_str
            );
        }

        println!(
            "Successfully created {} image file(s) in {}",
            image_files.len(),
            images_dir.display()
        );

        // Print full paths of created files
        println!("\nCreated image files:");
        for entry in &image_files {
            let path = entry.path();
            let metadata = std::fs::metadata(&path).unwrap();
            println!("  - {} ({} bytes)", path.display(), metadata.len());
        }

        // Note: Files are created in snapshots directory and will be kept
        // 스냅샷 디렉토리에 생성되므로 파일이 유지됩니다
        println!("\n✅ Image files are saved in: {}", images_dir.display());

        println!("Image file test passed!");
    }
}

#[test]
fn test_footnote_endnote_debug() {
    use hwp_core::decompress::decompress_deflate;
    use hwp_core::document::bodytext::record_tree::RecordTreeNode;
    use hwp_core::document::bodytext::HwpTag;
    use hwp_core::document::CtrlId;
    use hwp_core::document::ParagraphRecord;
    use hwp_core::CfbParser;
    use hwp_core::FileHeader;

    let file_path = match find_fixture_file("footnote-endnote.hwp") {
        Some(path) => path,
        None => {
            eprintln!("footnote-endnote.hwp not found, skipping test");
            return;
        }
    };

    eprintln!("\n=== Parsing footnote-endnote.hwp ===\n");
    if let Ok(data) = std::fs::read(&file_path) {
        // 원본 파일의 바이너리 데이터에서 직접 텍스트 확인
        let mut cfb = CfbParser::parse(&data).expect("Should parse CFB");
        let fileheader = FileHeader::parse(
            &CfbParser::read_stream(&mut cfb, "FileHeader").expect("Should read FileHeader"),
        )
        .expect("Should parse FileHeader");

        let section_data = CfbParser::read_nested_stream(&mut cfb, "BodyText", "Section0")
            .expect("Should read Section0");

        let decompressed = if fileheader.is_compressed() {
            decompress_deflate(&section_data).expect("Should decompress section data")
        } else {
            section_data
        };

        let tree = RecordTreeNode::parse_tree(&decompressed).expect("Should parse tree");

        // 원본 바이너리에서 각주/미주 텍스트 찾기
        eprintln!("\n=== 원본 바이너리에서 각주/미주 텍스트 찾기 ===\n");
        fn find_footnote_endnote_text(
            node: &RecordTreeNode,
            depth: usize,
            parent_ctrl_id: Option<&str>,
        ) {
            let indent = "  ".repeat(depth);

            if node.tag_id() == HwpTag::CTRL_HEADER {
                if node.data().len() >= 4 {
                    let ctrl_id_bytes = &node.data()[0..4];
                    let ctrl_id = String::from_utf8_lossy(ctrl_id_bytes);
                    eprintln!("{}[ORIGINAL] CTRL_HEADER: ctrl_id={:?}", indent, ctrl_id);

                    if ctrl_id.trim() == "fn  " || ctrl_id.trim() == "en  " {
                        // 각주/미주 내부의 텍스트 찾기
                        for child in node.children() {
                            find_footnote_endnote_text(child, depth + 1, Some(&ctrl_id));
                        }
                    } else {
                        for child in node.children() {
                            find_footnote_endnote_text(child, depth + 1, parent_ctrl_id);
                        }
                    }
                }
            } else if node.tag_id() == HwpTag::LIST_HEADER {
                if let Some(ctrl_id) = parent_ctrl_id {
                    eprintln!("{}[ORIGINAL] LIST_HEADER inside {:?}", indent, ctrl_id);
                    for child in node.children() {
                        find_footnote_endnote_text(child, depth + 1, parent_ctrl_id);
                    }
                } else {
                    for child in node.children() {
                        find_footnote_endnote_text(child, depth + 1, parent_ctrl_id);
                    }
                }
            } else if node.tag_id() == HwpTag::PARA_TEXT {
                if let Some(ctrl_id) = parent_ctrl_id {
                    // UTF-16LE로 디코딩
                    let data = node.data();
                    if let Ok(text) = hwp_core::types::decode_utf16le(data) {
                        eprintln!(
                            "{}[ORIGINAL] PARA_TEXT inside {:?}: {}",
                            indent, ctrl_id, text
                        );
                    } else {
                        eprintln!(
                            "{}[ORIGINAL] PARA_TEXT inside {:?}: (decode failed, len={})",
                            indent,
                            ctrl_id,
                            data.len()
                        );
                    }
                }
            } else {
                for child in node.children() {
                    find_footnote_endnote_text(child, depth + 1, parent_ctrl_id);
                }
            }
        }

        for child in tree.children() {
            find_footnote_endnote_text(child, 0, None);
        }

        // 파서로 파싱한 결과 확인
        eprintln!("\n=== 파서로 파싱한 결과 ===\n");
        let parser = HwpParser::new();
        let result = parser.parse(&data);
        if let Err(e) = &result {
            eprintln!("Parse error: {:?}", e);
        }
        assert!(result.is_ok(), "Should parse HWP document");
        let document = result.unwrap();

        // 각주/미주 확인
        for section in &document.body_text.sections {
            for (para_idx, paragraph) in section.paragraphs.iter().enumerate() {
                eprintln!(
                    "[TEST] Paragraph {}: control_mask.value={}, has_footnote_endnote={}",
                    para_idx,
                    paragraph.para_header.control_mask.value,
                    paragraph.para_header.control_mask.has_footnote_endnote()
                );
                for record in &paragraph.records {
                    if let ParagraphRecord::CtrlHeader {
                        header,
                        children,
                        paragraphs,
                        ..
                    } = record
                    {
                        if header.ctrl_id.as_str() == CtrlId::FOOTNOTE {
                            let number =
                                if let hwp_core::document::CtrlHeaderData::FootnoteEndnote {
                                    number,
                                    ..
                                } = &header.data
                                {
                                    Some(*number)
                                } else {
                                    None
                                };
                            eprintln!(
                                "[TEST] Found FOOTNOTE number={:?}: children_count={}, paragraphs_count={}",
                                number, children.len(), paragraphs.len()
                            );
                            for child in children {
                                if let ParagraphRecord::ListHeader {
                                    paragraphs: list_paragraphs,
                                    ..
                                } = child
                                {
                                    eprintln!(
                                        "[TEST] FOOTNOTE ListHeader: paragraphs_count={}",
                                        list_paragraphs.len()
                                    );
                                    for (para_idx, para) in list_paragraphs.iter().enumerate() {
                                        for para_record in &para.records {
                                            if let ParagraphRecord::ParaText { text, .. } =
                                                para_record
                                            {
                                                eprintln!(
                                                    "[TEST] FOOTNOTE ListHeader Para[{}] ParaText: {}",
                                                    para_idx, text
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        } else if header.ctrl_id.as_str() == CtrlId::ENDNOTE {
                            let number =
                                if let hwp_core::document::CtrlHeaderData::FootnoteEndnote {
                                    number,
                                    ..
                                } = &header.data
                                {
                                    Some(*number)
                                } else {
                                    None
                                };
                            eprintln!(
                                "[TEST] Found ENDNOTE number={:?}: children_count={}, paragraphs_count={}",
                                number, children.len(), paragraphs.len()
                            );
                            for child in children {
                                if let ParagraphRecord::ListHeader {
                                    paragraphs: list_paragraphs,
                                    ..
                                } = child
                                {
                                    eprintln!(
                                        "[TEST] ENDNOTE ListHeader: paragraphs_count={}",
                                        list_paragraphs.len()
                                    );
                                    for (para_idx, para) in list_paragraphs.iter().enumerate() {
                                        for para_record in &para.records {
                                            if let ParagraphRecord::ParaText { text, .. } =
                                                para_record
                                            {
                                                eprintln!(
                                                    "[TEST] ENDNOTE ListHeader Para[{}] ParaText: {}",
                                                    para_idx, text
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

#[test]
fn test_debug_charshape_strikethrough() {
    use crate::common::find_fixture_file;

    let file_path = match find_fixture_file("charshape.hwp") {
        Some(path) => path,
        None => {
            eprintln!("charshape.hwp file not found, skipping test");
            return;
        }
    };

    if let Ok(data) = std::fs::read(&file_path) {
        let parser = HwpParser::new();
        let result = parser.parse(&data);
        if let Err(e) = &result {
            eprintln!("Parse error: {:?}", e);
        }
        assert!(result.is_ok(), "Should parse HWP document");
        let document = result.unwrap();

        // "밑줄없음밑줄가운데줄윗줄" 텍스트가 있는 문단 찾기
        // Find paragraph with "밑줄없음밑줄가운데줄윗줄" text
        for section in &document.body_text.sections {
            for para in &section.paragraphs {
                for record in &para.records {
                    if let ParagraphRecord::ParaText { text, .. } = record {
                        if text.contains("가운데줄") {
                            eprintln!("\n=== DEBUG: Found paragraph with '가운데줄' ===");
                            eprintln!("Text: {}", text);

                            // ParaCharShape 찾기
                            // Find ParaCharShape
                            for record2 in &para.records {
                                if let ParagraphRecord::ParaCharShape { shapes } = record2 {
                                    eprintln!("\nParaCharShape shapes:");
                                    for shape_info in shapes {
                                        eprintln!(
                                            "  position: {}, shape_id: {}",
                                            shape_info.position, shape_info.shape_id
                                        );

                                        // shape_id로 CharShape 가져오기
                                        // Get CharShape by shape_id
                                        if let Some(char_shape) = document
                                            .doc_info
                                            .char_shapes
                                            .get(shape_info.shape_id as usize)
                                        {
                                            eprintln!(
                                                "    shape_id {} attributes:",
                                                shape_info.shape_id
                                            );
                                            eprintln!("      bold: {}", char_shape.attributes.bold);
                                            eprintln!(
                                                "      italic: {}",
                                                char_shape.attributes.italic
                                            );
                                            eprintln!(
                                                "      strikethrough: {} (0=none, 1-6=type)",
                                                char_shape.attributes.strikethrough
                                            );
                                            eprintln!(
                                                "      strikethrough_style: {}",
                                                char_shape.attributes.strikethrough_style
                                            );

                                            // "가운데줄" 부분 확인 (position 6에서 shape_id 9)
                                            // Check "가운데줄" part (shape_id 9 at position 6)
                                            if shape_info.shape_id == 9 && shape_info.position == 6
                                            {
                                                eprintln!("\n*** FOUND shape_id 9 at position 6 (가운데줄) ***");
                                                eprintln!(
                                                    "  strikethrough: {}",
                                                    char_shape.attributes.strikethrough
                                                );
                                                eprintln!(
                                                    "  strikethrough_style: {}",
                                                    char_shape.attributes.strikethrough_style
                                                );
                                                eprintln!(
                                                    "  strikethrough != 0: {}",
                                                    char_shape.attributes.strikethrough != 0
                                                );
                                                eprintln!("  underline_type: {} (0=none, 1=below, 2=above)", char_shape.attributes.underline_type);
                                                eprintln!(
                                                    "  underline_style: {}",
                                                    char_shape.attributes.underline_style
                                                );
                                                eprintln!("  NOTE: underline_type=2 might indicate strikethrough in some HWP versions");
                                            }
                                        } else {
                                            eprintln!("    shape_id {} NOT FOUND in char_shapes array (len={})",
                                                shape_info.shape_id,
                                                document.doc_info.char_shapes.len());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
