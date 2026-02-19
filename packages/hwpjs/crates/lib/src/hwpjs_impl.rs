use craby::{prelude::*, throw};

use crate::ffi::bridging::*;
use crate::generated::*;
use hwp_core::HwpParser;

pub struct Hwpjs {
    #[allow(dead_code)]
    ctx: Context,
}

#[craby_module]
impl HwpjsSpec for Hwpjs {
    fn new(ctx: Context) -> Self {
        Self { ctx }
    }

    fn id(&self) -> usize {
        self.ctx.id
    }

    fn to_json(&mut self, data: Vec<u8>) -> String {
        let parser = HwpParser::new();
        let document = parser.parse(&data).unwrap_or_else(|e| throw!("{}", e));

        serde_json::to_string(&document)
            .unwrap_or_else(|e| throw!("Failed to serialize to JSON: {}", e))
    }

    fn to_markdown(&mut self, data: Vec<u8>, options: ToMarkdownOptions) -> ToMarkdownResult {
        let parser = HwpParser::new();
        let document = parser.parse(&data).unwrap_or_else(|e| throw!("{}", e));

        // ToMarkdownOptions를 hwp_core::viewer::markdown::MarkdownOptions로 변환
        let image_output_dir: Nullable<String> = options.image_output_dir.into();
        let use_html = Some(options.use_html);
        let include_version = Some(options.include_version);
        let include_page_info = Some(options.include_page_info);

        let markdown_options = hwp_core::viewer::markdown::MarkdownOptions {
            image_output_dir: image_output_dir.into_value(),
            use_html,
            include_version,
            include_page_info,
        };

        // 마크다운 변환 (이미지는 base64로 임베드)
        let markdown = document.to_markdown(&markdown_options);

        ToMarkdownResult { markdown }
    }

    fn file_header(&mut self, data: Vec<u8>) -> String {
        let parser = HwpParser::new();
        parser
            .parse_fileheader_json(&data)
            .unwrap_or_else(|e| throw!("{}", e))
    }
}
