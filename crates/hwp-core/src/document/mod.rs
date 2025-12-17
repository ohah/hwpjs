pub mod bindata;
pub mod bodytext;
pub mod constants;
pub mod docinfo;
/// HWP Document structure
///
/// This module defines the main document structure for HWP files.
///
/// 스펙 문서 매핑: 표 2 - 전체 구조
pub mod fileheader;
pub mod preview_image;
pub mod preview_text;
pub mod scripts;
pub mod summary_information;
pub mod xml_template;

pub use bindata::{BinData, BinaryDataFormat};
pub use bodytext::{
    BodyText, ColumnDivideType, CtrlHeader, CtrlHeaderData, CtrlId, PageNumberPosition, Paragraph,
    ParagraphRecord, Section,
};
pub use docinfo::{
    BinDataRecord, BorderFill, Bullet, CharShape, DocInfo, DocumentProperties, FaceName, FillInfo,
    HeaderShapeType, IdMappings, Numbering, ParaShape, Style, TabDef,
};
pub use fileheader::FileHeader;
pub use preview_image::PreviewImage;
pub use preview_text::PreviewText;
pub use scripts::Scripts;
pub use summary_information::SummaryInformation;
pub use xml_template::XmlTemplate;

use serde::{Deserialize, Serialize};

/// Main HWP document structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HwpDocument {
    /// File header information
    pub file_header: FileHeader,
    /// Document information (DocInfo stream)
    pub doc_info: DocInfo,
    /// Body text (BodyText storage)
    pub body_text: BodyText,
    /// Binary data (BinData storage)
    pub bin_data: BinData,
    /// Preview text (PrvText stream)
    pub preview_text: Option<PreviewText>,
    /// Preview image (PrvImage stream)
    pub preview_image: Option<PreviewImage>,
    /// Scripts (Scripts storage)
    pub scripts: Option<Scripts>,
    /// XML Template (XMLTemplate storage)
    pub xml_template: Option<XmlTemplate>,
    /// Summary Information (\005HwpSummaryInformation stream)
    pub summary_information: Option<SummaryInformation>,
}

impl HwpDocument {
    /// Create a new empty HWP document
    pub fn new(file_header: FileHeader) -> Self {
        Self {
            file_header,
            doc_info: DocInfo::default(),
            body_text: BodyText::default(),
            bin_data: BinData::default(),
            preview_text: None,
            preview_image: None,
            scripts: None,
            xml_template: None,
            summary_information: None,
        }
    }

    /// Convert HWP document to Markdown format
    /// HWP 문서를 마크다운 형식으로 변환
    ///
    /// # Arguments / 매개변수
    /// * `options` - Markdown conversion options / 마크다운 변환 옵션
    ///
    /// # Returns / 반환값
    /// Markdown string representation of the document / 문서의 마크다운 문자열 표현
    pub fn to_markdown(&self, options: &crate::viewer::markdown::MarkdownOptions) -> String {
        crate::viewer::to_markdown(self, options)
    }

    /// Convert HWP document to Markdown format (기존 API 호환성)
    /// HWP 문서를 마크다운 형식으로 변환 (기존 API 호환성)
    ///
    /// # Arguments / 매개변수
    /// * `image_output_dir` - Optional directory path to save images as files. If None, images are embedded as base64 data URIs.
    ///   이미지를 파일로 저장할 디렉토리 경로 (선택). None이면 base64 데이터 URI로 임베드됩니다.
    ///
    /// # Returns / 반환값
    /// Markdown string representation of the document / 문서의 마크다운 문자열 표현
    pub fn to_markdown_with_dir(&self, image_output_dir: Option<&str>) -> String {
        let options = crate::viewer::markdown::MarkdownOptions {
            image_output_dir: image_output_dir.map(|s| s.to_string()),
            use_html: Some(true),
            include_version: Some(true),
            include_page_info: Some(true),
        };
        crate::viewer::to_markdown(self, &options)
    }

    /// Convert HWP document to HTML format
    /// HWP 문서를 HTML 형식으로 변환
    ///
    /// # Arguments / 매개변수
    /// * `options` - HTML conversion options / HTML 변환 옵션
    ///
    /// # Returns / 반환값
    /// HTML string representation of the document / 문서의 HTML 문자열 표현
    pub fn to_html(&self, options: &crate::viewer::html::HtmlOptions) -> String {
        crate::viewer::to_html(self, options)
    }

    /// Resolve derived display texts for control tokens (e.g., AUTO_NUMBER) into `ParaTextRun::Control.display_text`.
    ///
    /// IMPORTANT:
    /// - `runs` (control tokens + document settings) are the source of truth.
    /// - `display_text` is a derived/cache value for preview/viewers and may be recomputed.
    pub fn resolve_display_texts(&mut self) {
        use crate::document::bodytext::{ControlChar, ParaTextRun};
        use crate::document::ParagraphRecord;

        // Footnote/endnote numbering rules are defined by FootnoteShape (spec Table 133/134).
        // In practice, two FootnoteShape records appear (footnote, endnote). If only one exists,
        // we reuse it for both.
        let mut footnote_shape_opt: Option<crate::document::bodytext::FootnoteShape> = None;
        let mut endnote_shape_opt: Option<crate::document::bodytext::FootnoteShape> = None;
        for section in &self.body_text.sections {
            for paragraph in &section.paragraphs {
                for record in &paragraph.records {
                    if let ParagraphRecord::FootnoteShape { footnote_shape } = record {
                        if footnote_shape_opt.is_none() {
                            footnote_shape_opt = Some(footnote_shape.clone());
                        } else if endnote_shape_opt.is_none() {
                            endnote_shape_opt = Some(footnote_shape.clone());
                        }
                    }
                }
            }
        }
        if endnote_shape_opt.is_none() {
            endnote_shape_opt = footnote_shape_opt.clone();
        }

        let mut table_no: u32 = self
            .doc_info
            .document_properties
            .as_ref()
            .map(|p| p.table_start_number as u32)
            .unwrap_or(1);

        let footnote_start: u32 = footnote_shape_opt
            .as_ref()
            .map(|s| s.start_number as u32)
            .or_else(|| {
                self.doc_info
                    .document_properties
                    .as_ref()
                    .map(|p| p.footnote_start_number as u32)
            })
            .unwrap_or(1);
        let endnote_start: u32 = endnote_shape_opt
            .as_ref()
            .map(|s| s.start_number as u32)
            .or_else(|| {
                self.doc_info
                    .document_properties
                    .as_ref()
                    .map(|p| p.endnote_start_number as u32)
            })
            .unwrap_or(1);

        let footnote_numbering = footnote_shape_opt
            .as_ref()
            .map(|s| s.attributes.numbering)
            .unwrap_or(crate::document::bodytext::footnote_shape::NumberingMethod::Continue);
        let endnote_numbering = endnote_shape_opt
            .as_ref()
            .map(|s| s.attributes.numbering)
            .unwrap_or(crate::document::bodytext::footnote_shape::NumberingMethod::Continue);

        // NOTE: PerPage is currently treated the same as Continue (requested).
        let mut footnote_no: u32 = footnote_start;
        let mut endnote_no: u32 = endnote_start;
        let mut image_no: u32 = self
            .doc_info
            .document_properties
            .as_ref()
            .map(|p| p.image_start_number as u32)
            .unwrap_or(1);
        let mut formula_no: u32 = self
            .doc_info
            .document_properties
            .as_ref()
            .map(|p| p.formula_start_number as u32)
            .unwrap_or(1);

        #[derive(Debug, Clone, Copy, PartialEq, Eq)]
        enum AutoNumberKind {
            Page = 0,
            Footnote = 1,
            Endnote = 2,
            Image = 3,
            Table = 4,
            Formula = 5,
            Unknown = 255,
        }

        fn parse_auto_number_kind(attribute: u32) -> AutoNumberKind {
            match (attribute & 0x0F) as u8 {
                0 => AutoNumberKind::Page,
                1 => AutoNumberKind::Footnote,
                2 => AutoNumberKind::Endnote,
                3 => AutoNumberKind::Image,
                4 => AutoNumberKind::Table,
                5 => AutoNumberKind::Formula,
                _ => AutoNumberKind::Unknown,
            }
        }

        fn parse_number_shape(
            attribute: u32,
        ) -> crate::document::bodytext::footnote_shape::NumberShape {
            // spec Table 143 bit 4-11 number shape, mapping uses Table 134 (same as FootnoteShape)
            let v = ((attribute >> 4) & 0xFF) as u8;
            use crate::document::bodytext::footnote_shape::NumberShape;
            match v {
                0 => NumberShape::Arabic,
                1 => NumberShape::CircledArabic,
                2 => NumberShape::RomanUpper,
                3 => NumberShape::RomanLower,
                4 => NumberShape::AlphaUpper,
                5 => NumberShape::AlphaLower,
                6 => NumberShape::CircledAlphaUpper,
                7 => NumberShape::CircledAlphaLower,
                8 => NumberShape::Hangul,
                9 => NumberShape::CircledHangul,
                10 => NumberShape::HangulJamo,
                11 => NumberShape::CircledHangulJamo,
                12 => NumberShape::HangulNumber,
                13 => NumberShape::ChineseNumber,
                14 => NumberShape::CircledChineseNumber,
                15 => NumberShape::HeavenlyStem,
                16 => NumberShape::HeavenlyStemChinese,
                0x80 => NumberShape::FourCharRepeat,
                0x81 => NumberShape::CustomCharRepeat,
                _ => NumberShape::Arabic,
            }
        }

        fn format_number(
            shape: crate::document::bodytext::footnote_shape::NumberShape,
            n: u32,
        ) -> String {
            use crate::document::bodytext::footnote_shape::NumberShape;
            match shape {
                NumberShape::Arabic => n.to_string(),
                NumberShape::RomanUpper => to_roman(n).to_uppercase(),
                NumberShape::RomanLower => to_roman(n).to_lowercase(),
                NumberShape::AlphaUpper => to_alpha(n, true),
                NumberShape::AlphaLower => to_alpha(n, false),
                NumberShape::CircledArabic => circled_number(n).unwrap_or_else(|| n.to_string()),
                NumberShape::CircledAlphaUpper => {
                    circled_alpha(n, true).unwrap_or_else(|| to_alpha(n, true))
                }
                NumberShape::CircledAlphaLower => {
                    circled_alpha(n, false).unwrap_or_else(|| to_alpha(n, false))
                }
                NumberShape::Hangul => hangul_gana(n).unwrap_or_else(|| n.to_string()),
                NumberShape::HangulJamo => hangul_jamo(n).unwrap_or_else(|| n.to_string()),
                NumberShape::CircledHangul => circled_hangul_gana(n)
                    .unwrap_or_else(|| hangul_gana(n).unwrap_or_else(|| n.to_string())),
                NumberShape::CircledHangulJamo => circled_hangul_jamo(n)
                    .unwrap_or_else(|| hangul_jamo(n).unwrap_or_else(|| n.to_string())),
                NumberShape::HangulNumber => hangul_number(n).unwrap_or_else(|| n.to_string()),
                NumberShape::ChineseNumber => chinese_number(n).unwrap_or_else(|| n.to_string()),
                NumberShape::CircledChineseNumber => circled_chinese_number(n)
                    .unwrap_or_else(|| chinese_number(n).unwrap_or_else(|| n.to_string())),
                NumberShape::HeavenlyStem => heavenly_stem(n).unwrap_or_else(|| n.to_string()),
                NumberShape::HeavenlyStemChinese => {
                    heavenly_stem_chinese(n).unwrap_or_else(|| n.to_string())
                }
                // NOTE: Repeat-based shapes require additional spec-backed inputs (e.g., custom symbol set).
                // We intentionally fall back to Arabic until we can resolve the exact behavior from spec/fixtures.
                NumberShape::FourCharRepeat | NumberShape::CustomCharRepeat => n.to_string(),
            }
        }

        fn circled_number(n: u32) -> Option<String> {
            // ①..⑳ (U+2460..U+2473) for 1..20
            if (1..=20).contains(&n) {
                let cp = 0x2460 + (n - 1);
                return char::from_u32(cp).map(|c| c.to_string());
            }
            // ㉑..㉟ (U+3251..U+325F) for 21..35 (circled numbers in a circle)
            if (21..=35).contains(&n) {
                let cp = 0x3251 + (n - 21);
                return char::from_u32(cp).map(|c| c.to_string());
            }
            None
        }

        fn circled_alpha(n: u32, upper: bool) -> Option<String> {
            // Ⓐ..Ⓩ (U+24B6..U+24CF) for 1..26
            // ⓐ..ⓩ (U+24D0..U+24E9) for 1..26
            if !(1..=26).contains(&n) {
                return None;
            }
            let base = if upper { 0x24B6 } else { 0x24D0 };
            let cp = base + (n - 1);
            char::from_u32(cp).map(|c| c.to_string())
        }

        fn hangul_gana(n: u32) -> Option<String> {
            // 가..하 (14 chars) used commonly for numbering
            const LIST: [&str; 14] = [
                "가", "나", "다", "라", "마", "바", "사", "아", "자", "차", "카", "타", "파", "하",
            ];
            if n == 0 {
                return None;
            }
            let idx = ((n - 1) % (LIST.len() as u32)) as usize;
            Some(LIST[idx].to_string())
        }

        fn circled_hangul_gana(n: u32) -> Option<String> {
            // ㉮..㉻ (U+326E..U+327B) for 1..14
            if !(1..=14).contains(&n) {
                return None;
            }
            let cp = 0x326E + (n - 1);
            char::from_u32(cp).map(|c| c.to_string())
        }

        fn hangul_jamo(n: u32) -> Option<String> {
            // ㄱ ㄴ ㄷ ㄹ ㅁ ㅂ ㅅ ㅇ ㅈ ㅊ ㅋ ㅌ ㅍ ㅎ
            const LIST: [&str; 14] = [
                "ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
            ];
            if n == 0 {
                return None;
            }
            let idx = ((n - 1) % (LIST.len() as u32)) as usize;
            Some(LIST[idx].to_string())
        }

        fn circled_hangul_jamo(n: u32) -> Option<String> {
            // ㉠..㉭ (U+3260..U+326D) for 1..14
            if !(1..=14).contains(&n) {
                return None;
            }
            let cp = 0x3260 + (n - 1);
            char::from_u32(cp).map(|c| c.to_string())
        }

        fn hangul_number(n: u32) -> Option<String> {
            // 일, 이, 삼 ... (up to 99 for now)
            if n == 0 || n > 99 {
                return None;
            }
            const DIGITS: [&str; 10] = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
            if n < 10 {
                return Some(DIGITS[n as usize].to_string());
            }
            if n == 10 {
                return Some("십".to_string());
            }
            let tens = n / 10;
            let ones = n % 10;
            let mut out = String::new();
            if tens > 1 {
                out.push_str(DIGITS[tens as usize]);
            }
            out.push('십');
            if ones > 0 {
                out.push_str(DIGITS[ones as usize]);
            }
            Some(out)
        }

        fn chinese_number(n: u32) -> Option<String> {
            // 一, 二, 三 ... (up to 99 for now)
            if n == 0 || n > 99 {
                return None;
            }
            const DIGITS: [&str; 10] = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
            if n < 10 {
                return Some(DIGITS[n as usize].to_string());
            }
            if n == 10 {
                return Some("十".to_string());
            }
            let tens = n / 10;
            let ones = n % 10;
            let mut out = String::new();
            if tens > 1 {
                out.push_str(DIGITS[tens as usize]);
            }
            out.push('十');
            if ones > 0 {
                out.push_str(DIGITS[ones as usize]);
            }
            Some(out)
        }

        fn circled_chinese_number(n: u32) -> Option<String> {
            // ㊀..㊉ (U+3280..U+3289) for 1..10
            if !(1..=10).contains(&n) {
                return None;
            }
            let cp = 0x3280 + (n - 1);
            char::from_u32(cp).map(|c| c.to_string())
        }

        fn heavenly_stem(n: u32) -> Option<String> {
            // 갑, 을, 병, 정, 무, 기, 경, 신, 임, 계
            const LIST: [&str; 10] = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
            if n == 0 {
                return None;
            }
            let idx = ((n - 1) % 10) as usize;
            Some(LIST[idx].to_string())
        }

        fn heavenly_stem_chinese(n: u32) -> Option<String> {
            // 甲, 乙, 丙, 丁, 戊, 己, 庚, 辛, 壬, 癸
            const LIST: [&str; 10] = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
            if n == 0 {
                return None;
            }
            let idx = ((n - 1) % 10) as usize;
            Some(LIST[idx].to_string())
        }

        fn to_roman(mut n: u32) -> String {
            if n == 0 {
                return String::new();
            }
            let mut out = String::new();
            let pairs = [
                (1000, "M"),
                (900, "CM"),
                (500, "D"),
                (400, "CD"),
                (100, "C"),
                (90, "XC"),
                (50, "L"),
                (40, "XL"),
                (10, "X"),
                (9, "IX"),
                (5, "V"),
                (4, "IV"),
                (1, "I"),
            ];
            for (v, s) in pairs {
                while n >= v {
                    out.push_str(s);
                    n -= v;
                }
            }
            out
        }

        fn to_alpha(mut n: u32, upper: bool) -> String {
            // 1->A, 26->Z, 27->AA
            if n == 0 {
                return String::new();
            }
            let mut buf: Vec<u8> = Vec::new();
            while n > 0 {
                n -= 1;
                let c = (n % 26) as u8;
                buf.push(if upper { b'A' + c } else { b'a' + c });
                n /= 26;
            }
            buf.reverse();
            String::from_utf8_lossy(&buf).to_string()
        }

        fn resolve_paragraph_record(
            record: &mut ParagraphRecord,
            table_no: &mut u32,
            footnote_no: &mut u32,
            endnote_no: &mut u32,
            _image_no: &mut u32,
            _formula_no: &mut u32,
        ) {
            match record {
                ParagraphRecord::CtrlHeader {
                    header,
                    children,
                    paragraphs,
                    ..
                } => {
                    // Footnote/endnote ctrl headers ("fn  " / "en  "): assign number to all AUTO_NUMBER tokens in this subtree.
                    if header.ctrl_id == "fn  " || header.ctrl_id == "en  " {
                        let current = if header.ctrl_id == "fn  " {
                            *footnote_no
                        } else {
                            *endnote_no
                        };

                        fn fill_auto_numbers_in_records(
                            records: &mut [ParagraphRecord],
                            value: u32,
                        ) {
                            for r in records.iter_mut() {
                                match r {
                                    ParagraphRecord::ParaText { runs, .. } => {
                                        for run in runs.iter_mut() {
                                            if let ParaTextRun::Control {
                                                code, display_text, ..
                                            } = run
                                            {
                                                if *code == ControlChar::AUTO_NUMBER
                                                    && display_text.is_none()
                                                {
                                                    *display_text = Some(value.to_string());
                                                }
                                            }
                                        }
                                    }
                                    ParagraphRecord::CtrlHeader {
                                        children,
                                        paragraphs,
                                        ..
                                    } => {
                                        fill_auto_numbers_in_records(children, value);
                                        for p in paragraphs.iter_mut() {
                                            fill_auto_numbers_in_records(&mut p.records, value);
                                        }
                                    }
                                    ParagraphRecord::ListHeader { paragraphs, .. } => {
                                        for p in paragraphs.iter_mut() {
                                            fill_auto_numbers_in_records(&mut p.records, value);
                                        }
                                    }
                                    ParagraphRecord::ShapeComponent { children, .. } => {
                                        fill_auto_numbers_in_records(children, value);
                                    }
                                    _ => {}
                                }
                            }
                        }

                        fill_auto_numbers_in_records(children, current);
                        for p in paragraphs.iter_mut() {
                            fill_auto_numbers_in_records(&mut p.records, current);
                        }

                        if header.ctrl_id == "fn  " {
                            *footnote_no += 1;
                        } else {
                            *endnote_no += 1;
                        }
                    }

                    // Table ctrl header ("tbl "): assign table number to the first AUTO_NUMBER found in caption paragraphs.
                    if header.ctrl_id == "tbl " {
                        let mut assigned_for_this_table = false;
                        for p in paragraphs.iter_mut() {
                            for r in p.records.iter_mut() {
                                if let ParagraphRecord::ParaText { runs, .. } = r {
                                    for run in runs.iter_mut() {
                                        if let ParaTextRun::Control {
                                            code, display_text, ..
                                        } = run
                                        {
                                            if *code == ControlChar::AUTO_NUMBER
                                                && display_text.is_none()
                                            {
                                                *display_text = Some(table_no.to_string());
                                                assigned_for_this_table = true;
                                                break;
                                            }
                                        }
                                    }
                                }
                                if assigned_for_this_table {
                                    break;
                                }
                            }
                            if assigned_for_this_table {
                                break;
                            }
                        }
                        if assigned_for_this_table {
                            *table_no += 1;
                        }
                    }

                    // Recurse into nested structures for completeness.
                    for c in children.iter_mut() {
                        resolve_paragraph_record(
                            c,
                            table_no,
                            footnote_no,
                            endnote_no,
                            _image_no,
                            _formula_no,
                        );
                    }
                    for p in paragraphs.iter_mut() {
                        for r in p.records.iter_mut() {
                            resolve_paragraph_record(
                                r,
                                table_no,
                                footnote_no,
                                endnote_no,
                                _image_no,
                                _formula_no,
                            );
                        }
                    }
                }
                ParagraphRecord::ListHeader { paragraphs, .. } => {
                    for p in paragraphs.iter_mut() {
                        for r in p.records.iter_mut() {
                            resolve_paragraph_record(
                                r,
                                table_no,
                                footnote_no,
                                endnote_no,
                                _image_no,
                                _formula_no,
                            );
                        }
                    }
                }
                ParagraphRecord::ShapeComponent { children, .. } => {
                    for c in children.iter_mut() {
                        resolve_paragraph_record(
                            c,
                            table_no,
                            footnote_no,
                            endnote_no,
                            _image_no,
                            _formula_no,
                        );
                    }
                }
                _ => {}
            }
        }

        for section in self.body_text.sections.iter_mut() {
            // Apply "Restart" per section. PerPage is currently treated as Continue.
            use crate::document::bodytext::footnote_shape::NumberingMethod;
            if matches!(footnote_numbering, NumberingMethod::Restart) {
                footnote_no = footnote_start;
            }
            if matches!(endnote_numbering, NumberingMethod::Restart) {
                endnote_no = endnote_start;
            }

            for paragraph in section.paragraphs.iter_mut() {
                // If this paragraph has an AutoNumber/NewNumber ctrl header, use it to resolve AUTO_NUMBER tokens in its ParaText runs.
                let mut para_auto_attr: Option<u32> = None;
                let mut para_auto_prefix: Option<String> = None;
                let mut para_auto_suffix: Option<String> = None;
                let mut new_number_attr_and_value: Option<(u32, u16)> = None;

                for record in paragraph.records.iter() {
                    if let ParagraphRecord::CtrlHeader { header, .. } = record {
                        match &header.data {
                            crate::document::bodytext::ctrl_header::CtrlHeaderData::AutoNumber {
                                attribute,
                                prefix,
                                suffix,
                                ..
                            } => {
                                para_auto_attr = Some(*attribute);
                                if !prefix.is_empty() {
                                    para_auto_prefix = Some(prefix.clone());
                                }
                                if !suffix.is_empty() {
                                    para_auto_suffix = Some(suffix.clone());
                                }
                            }
                            crate::document::bodytext::ctrl_header::CtrlHeaderData::NewNumber {
                                attribute,
                                number,
                            } => {
                                new_number_attr_and_value = Some((*attribute, *number));
                            }
                            _ => {}
                        }
                    }
                }

                // Apply NEW_NUMBER to counters (bit 0-3: kind, number: new value)
                if let Some((attr, num)) = new_number_attr_and_value {
                    match parse_auto_number_kind(attr) {
                        AutoNumberKind::Footnote => footnote_no = num as u32,
                        AutoNumberKind::Endnote => endnote_no = num as u32,
                        AutoNumberKind::Image => image_no = num as u32,
                        AutoNumberKind::Table => table_no = num as u32,
                        AutoNumberKind::Formula => formula_no = num as u32,
                        _ => {}
                    }
                }

                // Fill AUTO_NUMBER tokens in this paragraph if we know the kind.
                if let Some(attr) = para_auto_attr {
                    let kind = parse_auto_number_kind(attr);
                    let shape = parse_number_shape(attr);
                    let prefix = para_auto_prefix.as_deref().unwrap_or("");
                    let suffix = para_auto_suffix.as_deref().unwrap_or("");

                    let next_value = match kind {
                        AutoNumberKind::Footnote => Some(footnote_no),
                        AutoNumberKind::Endnote => Some(endnote_no),
                        AutoNumberKind::Image => Some(image_no),
                        AutoNumberKind::Table => Some(table_no),
                        AutoNumberKind::Formula => Some(formula_no),
                        _ => None,
                    };

                    if let Some(v) = next_value {
                        let formatted = format!("{}{}{}", prefix, format_number(shape, v), suffix);
                        for record in paragraph.records.iter_mut() {
                            if let ParagraphRecord::ParaText { runs, .. } = record {
                                for run in runs.iter_mut() {
                                    if let ParaTextRun::Control {
                                        code, display_text, ..
                                    } = run
                                    {
                                        if *code == ControlChar::AUTO_NUMBER
                                            && display_text.is_none()
                                        {
                                            *display_text = Some(formatted.clone());
                                        }
                                    }
                                }
                            }
                        }

                        // Increment the counter once per paragraph auto-number usage.
                        match kind {
                            AutoNumberKind::Footnote => footnote_no += 1,
                            AutoNumberKind::Endnote => endnote_no += 1,
                            AutoNumberKind::Image => image_no += 1,
                            AutoNumberKind::Table => table_no += 1,
                            AutoNumberKind::Formula => formula_no += 1,
                            _ => {}
                        }
                    }
                }

                for record in paragraph.records.iter_mut() {
                    resolve_paragraph_record(
                        record,
                        &mut table_no,
                        &mut footnote_no,
                        &mut endnote_no,
                        &mut image_no,
                        &mut formula_no,
                    );
                }
            }
        }
    }
}
