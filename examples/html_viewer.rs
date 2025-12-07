/// HTML 뷰어 예제 / HTML Viewer Example
///
/// 이 예제는 HWP 문서를 HTML로 변환하는 방법을 보여줍니다.
/// This example demonstrates how to convert HWP documents to HTML.
use hwp_core::*;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 명령줄 인수에서 파일 경로 가져오기 / Get file path from command line arguments
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: {} <hwp_file> [output_dir]", args[0]);
        eprintln!("사용법: {} <hwp_파일> [출력_디렉토리]", args[0]);
        std::process::exit(1);
    }

    let hwp_file = &args[1];
    let output_dir = args.get(2).map(|s| s.as_str());

    // HWP 파일 읽기 / Read HWP file
    println!("Reading HWP file: {}", hwp_file);
    println!("HWP 파일 읽는 중: {}", hwp_file);
    let data = std::fs::read(hwp_file)?;

    // HWP 문서 파싱 / Parse HWP document
    println!("Parsing HWP document...");
    println!("HWP 문서 파싱 중...");
    let parser = HwpParser::new();
    let document = parser.parse(&data)?;

    // HTML 변환 옵션 설정 / Set HTML conversion options
    let options = hwp_core::viewer::html::HtmlOptions {
        image_output_dir: output_dir.map(|s| format!("{}/images", s)),
        include_version: Some(true),
        include_page_info: Some(true),
        css_class_prefix: "ohah-hwpjs-".to_string(),
    };

    // HTML로 변환 / Convert to HTML
    println!("Converting to HTML...");
    println!("HTML로 변환 중...");
    let html = document.to_html(&options);

    // 출력 파일 경로 결정 / Determine output file path
    let output_file = if let Some(dir) = output_dir {
        let file_name = std::path::Path::new(hwp_file)
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("output");
        std::path::Path::new(dir).join(format!("{}.html", file_name))
    } else {
        let file_name = std::path::Path::new(hwp_file)
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("output");
        std::path::Path::new(".").join(format!("{}.html", file_name))
    };

    // HTML 파일 저장 / Save HTML file
    if let Some(dir) = output_dir {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(&output_file, &html)?;

    println!("HTML file saved to: {}", output_file.display());
    println!("HTML 파일 저장됨: {}", output_file.display());

    Ok(())
}

