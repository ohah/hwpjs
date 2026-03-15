/// HWP Core Library
///
/// This library provides core functionality for parsing HWP files.
/// It accepts byte arrays as input to support cross-platform usage.
pub mod cfb;
pub mod decompress;
pub mod document;
pub mod error;
pub mod types;
pub mod viewer;

use ::cfb::CompoundFile;
use std::io::Cursor;

pub use cfb::CfbParser;
pub use decompress::{decompress_deflate, decompress_zlib};
pub use document::{
    BinData, BinDataRecord, BodyText, BorderFill, Bullet, CharShape, DocInfo, DocumentProperties,
    FaceName, FileHeader, HwpDocument, IdMappings, Numbering, ParaShape, Section,
    SummaryInformation, TabDef,
};
pub use error::{CompressionFormat, HwpError};
pub use types::{
    RecordHeader, BYTE, COLORREF, DWORD, HWPUNIT, HWPUNIT16, INT16, INT32, INT8, SHWPUNIT, UINT,
    UINT16, UINT32, UINT8, WCHAR, WORD,
};

/// Main HWP parser structure
pub struct HwpParser {
    // Placeholder for future implementation
}

impl HwpParser {
    /// Create a new HWP parser
    pub fn new() -> Self {
        Self {}
    }

    /// Parse HWP file from byte array
    ///
    /// # Arguments
    /// * `data` - Byte array containing the HWP file data
    ///
    /// # Returns
    /// Parsed HWP document structure
    pub fn parse(&self, data: &[u8]) -> Result<HwpDocument, HwpError> {
        // Parse CFB structure
        let mut cfb = CfbParser::parse(data)?;

        // Parse required streams
        let fileheader = self.parse_fileheader(&mut cfb)?;
        let mut document = HwpDocument::new(fileheader.clone());
        document.doc_info = self.parse_docinfo(&mut cfb, &fileheader)?;
        document.body_text = self.parse_bodytext(&mut cfb, &fileheader, &document.doc_info)?;

        // HWP 5.1+ 대응: HWPTAG_PARA_LINE_SEG가 없는 문단에 합성 LineSeg 삽입
        // 파싱 완료 후 DocInfo(CharShape/ParaShape)에 접근 가능하므로 이 시점에서 처리한다.
        // 파싱 레벨에서 삽입하면 렌더링/페이지네이션 등 모든 downstream 코드가 자동으로 혜택을 받는다.
        Self::synthesize_missing_line_segments(&mut document);

        document.bin_data = self.parse_bindata(&mut cfb, &document.doc_info)?;

        // Parse optional streams
        self.parse_optional_streams(&mut cfb, &fileheader, &mut document, data);

        // Resolve derived display texts (e.g., AUTO_NUMBER in captions) for JSON/viewers.
        document.resolve_display_texts();

        Ok(document)
    }

    // ===== Required parsing methods =====

    /// Parse FileHeader stream
    fn parse_fileheader(
        &self,
        cfb: &mut CompoundFile<Cursor<&[u8]>>,
    ) -> Result<FileHeader, HwpError> {
        let fileheader_data = CfbParser::read_stream(cfb, "FileHeader")?;
        FileHeader::parse(&fileheader_data)
    }

    /// Parse DocInfo stream
    fn parse_docinfo(
        &self,
        cfb: &mut CompoundFile<Cursor<&[u8]>>,
        fileheader: &FileHeader,
    ) -> Result<DocInfo, HwpError> {
        let docinfo_data = CfbParser::read_stream(cfb, "DocInfo")?;
        DocInfo::parse(&docinfo_data, fileheader)
    }

    /// Parse BodyText storage
    /// 구역 개수는 DocumentProperties의 area_count에서 가져옵니다 / Get section count from DocumentProperties.area_count
    fn parse_bodytext(
        &self,
        cfb: &mut CompoundFile<Cursor<&[u8]>>,
        fileheader: &FileHeader,
        doc_info: &DocInfo,
    ) -> Result<BodyText, HwpError> {
        let section_count = doc_info
            .document_properties
            .as_ref()
            .map(|props| props.area_count)
            .unwrap_or(1); // 기본값은 1 / Default is 1
        BodyText::parse(cfb, fileheader, section_count)
    }

    /// Parse BinData storage
    /// 표 17의 bin_data_records를 사용하여 스트림을 찾습니다 (EMBEDDING/STORAGE 타입의 binary_data_id와 extension 사용)
    /// Use bin_data_records from Table 17 to find streams (use binary_data_id and extension for EMBEDDING/STORAGE types)
    fn parse_bindata(
        &self,
        cfb: &mut CompoundFile<Cursor<&[u8]>>,
        doc_info: &DocInfo,
    ) -> Result<BinData, HwpError> {
        use crate::document::BinaryDataFormat;
        BinData::parse(cfb, BinaryDataFormat::Base64, &doc_info.bin_data)
    }

    // ===== Optional parsing methods =====

    /// Parse all optional streams (failures are logged but don't stop parsing)
    fn parse_optional_streams(
        &self,
        cfb: &mut CompoundFile<Cursor<&[u8]>>,
        fileheader: &FileHeader,
        document: &mut HwpDocument,
        data: &[u8],
    ) {
        self.parse_preview_text(cfb, document);
        self.parse_preview_image(cfb, document);
        self.parse_scripts(cfb, document);
        self.parse_xml_template(cfb, fileheader, document);
        self.parse_summary_information(cfb, document, data);
    }

    /// Parse PreviewText stream (optional)
    /// 미리보기 텍스트 스트림 파싱 / Parse preview text stream
    /// 스펙 문서 3.2.6: PrvText 스트림에는 미리보기 텍스트가 유니코드 문자열로 저장됩니다.
    /// Spec 3.2.6: PrvText stream contains preview text stored as Unicode string.
    fn parse_preview_text(
        &self,
        cfb: &mut CompoundFile<Cursor<&[u8]>>,
        document: &mut HwpDocument,
    ) {
        if let Ok(prvtext_data) = CfbParser::read_stream(cfb, "PrvText") {
            match crate::document::PreviewText::parse(&prvtext_data) {
                Ok(preview_text) => {
                    document.preview_text = Some(preview_text);
                }
                Err(e) => {
                    #[cfg(debug_assertions)]
                    eprintln!("Warning: Failed to parse PrvText stream: {}", e);
                }
            }
        }
    }

    /// Parse PreviewImage stream (optional)
    /// 미리보기 이미지 스트림 파싱 / Parse preview image stream
    /// 스펙 문서 3.2.7: PrvImage 스트림에는 미리보기 이미지가 BMP 또는 GIF 형식으로 저장됩니다.
    /// Spec 3.2.7: PrvImage stream contains preview image stored as BMP or GIF format.
    fn parse_preview_image(
        &self,
        cfb: &mut CompoundFile<Cursor<&[u8]>>,
        document: &mut HwpDocument,
    ) {
        if let Ok(prvimage_data) = CfbParser::read_stream(cfb, "PrvImage") {
            match crate::document::PreviewImage::parse(&prvimage_data, None) {
                Ok(preview_image) => {
                    document.preview_image = Some(preview_image);
                }
                Err(e) => {
                    #[cfg(debug_assertions)]
                    eprintln!("Warning: Failed to parse PrvImage stream: {}", e);
                }
            }
        }
    }

    /// Parse Scripts storage (optional)
    /// 스크립트 스토리지 파싱 / Parse scripts storage
    /// 스펙 문서 3.2.9: Scripts 스토리지에는 Script 코드가 저장됩니다.
    /// Spec 3.2.9: Scripts storage contains Script code.
    fn parse_scripts(&self, cfb: &mut CompoundFile<Cursor<&[u8]>>, document: &mut HwpDocument) {
        match crate::document::Scripts::parse(cfb) {
            Ok(scripts) => {
                document.scripts = Some(scripts);
            }
            Err(e) => {
                #[cfg(debug_assertions)]
                eprintln!("Warning: Failed to parse Scripts storage: {}", e);
            }
        }
    }

    /// Parse XMLTemplate storage (optional)
    /// XML 템플릿 스토리지 파싱 / Parse XML template storage
    /// 스펙 문서 3.2.10: XMLTemplate 스토리지에는 XML Template 정보가 저장됩니다.
    /// Spec 3.2.10: XMLTemplate storage contains XML Template information.
    /// FileHeader의 document_flags Bit 5를 확인하여 XMLTemplate 스토리지 존재 여부 확인
    /// Check FileHeader document_flags Bit 5 to determine if XMLTemplate storage exists
    fn parse_xml_template(
        &self,
        cfb: &mut CompoundFile<Cursor<&[u8]>>,
        fileheader: &FileHeader,
        document: &mut HwpDocument,
    ) {
        if fileheader.has_xml_template() {
            match crate::document::XmlTemplate::parse(cfb) {
                Ok(xml_template) => {
                    // 모든 필드가 None이 아닌 경우에만 설정 / Only set if at least one field is not None
                    if xml_template.schema_name.is_some()
                        || xml_template.schema.is_some()
                        || xml_template.instance.is_some()
                    {
                        document.xml_template = Some(xml_template);
                    }
                }
                Err(e) => {
                    #[cfg(debug_assertions)]
                    eprintln!("Warning: Failed to parse XMLTemplate storage: {}", e);
                }
            }
        }
    }

    /// Parse SummaryInformation stream (optional)
    /// 문서 요약 스트림 파싱 / Parse summary information stream
    /// 스펙 문서 3.2.4: \005HwpSummaryInformation 스트림에는 문서 요약 정보가 MSDN Property Set 형식으로 저장됩니다.
    /// Spec 3.2.4: \005HwpSummaryInformation stream contains document summary information stored in MSDN Property Set format.
    /// 스트림 이름은 "\005HwpSummaryInformation" (바이트: 0x05 + "HwpSummaryInformation")
    /// Stream name is "\005HwpSummaryInformation" (bytes: 0x05 + "HwpSummaryInformation")
    fn parse_summary_information(
        &self,
        cfb: &mut CompoundFile<Cursor<&[u8]>>,
        document: &mut HwpDocument,
        data: &[u8],
    ) {
        match Self::read_summary_information_stream(cfb, data) {
            Ok(summary_bytes) => {
                #[cfg(debug_assertions)]
                {
                    eprintln!(
                        "Debug: Successfully read SummaryInformation stream, size: {} bytes",
                        summary_bytes.len()
                    );
                    if summary_bytes.len() >= 2 {
                        eprintln!(
                            "Debug: Byte order: 0x{:02X}{:02X}",
                            summary_bytes[0], summary_bytes[1]
                        );
                    }
                }
                match crate::document::SummaryInformation::parse(&summary_bytes) {
                    Ok(summary_information) => {
                        #[cfg(debug_assertions)]
                        eprintln!("Debug: Successfully parsed SummaryInformation");
                        document.summary_information = Some(summary_information);
                    }
                    Err(e) => {
                        #[cfg(debug_assertions)]
                        {
                            eprintln!("Warning: Failed to parse SummaryInformation stream: {}", e);
                            eprintln!("  Stream size: {} bytes", summary_bytes.len());
                            if summary_bytes.len() >= 40 {
                                eprintln!("  First 40 bytes: {:?}", &summary_bytes[..40]);
                                eprintln!(
                                    "  Byte order: 0x{:02X}{:02X}",
                                    summary_bytes[0], summary_bytes[1]
                                );
                                eprintln!(
                                    "  Version: 0x{:02X}{:02X}",
                                    summary_bytes[2], summary_bytes[3]
                                );
                            }
                        }
                        // 파싱 실패 시 None으로 유지 (raw_data 저장 안 함) / Keep None on parse failure (don't store raw_data)
                    }
                }
            }
            Err(e) => {
                #[cfg(debug_assertions)]
                {
                    eprintln!("Warning: Failed to read SummaryInformation stream: {}", e);
                    eprintln!("  Tried: \\u{{0005}}HwpSummaryInformation, \\x05HwpSummaryInformation, HwpSummaryInformation");
                }
                // 스트림이 없으면 None으로 유지 (정상) / Keep None if stream doesn't exist (normal)
            }
        }
    }

    /// Try to read SummaryInformation stream with multiple name variations
    /// 여러 가능한 스트림 이름 시도 / Try multiple possible stream names
    /// CFB 라이브러리는 특수 문자를 포함한 스트림 이름을 처리할 수 있도록 바이트 배열로 변환 필요
    /// CFB library may need byte array conversion for stream names with special characters
    fn read_summary_information_stream(
        cfb: &mut CompoundFile<Cursor<&[u8]>>,
        data: &[u8],
    ) -> Result<Vec<u8>, HwpError> {
        const STREAM_NAMES: &[&str] = &[
            "\u{0005}HwpSummaryInformation",
            "\x05HwpSummaryInformation",
            "HwpSummaryInformation",
        ];

        // Try string-based names first
        for name in STREAM_NAMES {
            match CfbParser::read_stream(cfb, name) {
                Ok(stream_data) => return Ok(stream_data),
                Err(e) => {
                    #[cfg(debug_assertions)]
                    eprintln!("Debug: Failed to read with {}: {}", name, e);
                }
            }
        }

        // If all string-based attempts fail, try parsing CFB bytes directly
        // 모든 문자열 기반 시도가 실패하면 CFB 바이트를 직접 파싱 시도
        #[cfg(debug_assertions)]
        eprintln!("Debug: All string-based attempts failed, trying direct byte parsing for \\005HwpSummaryInformation");
        let stream_name_bytes = b"\x05HwpSummaryInformation";
        CfbParser::read_stream_by_bytes(data, stream_name_bytes)
    }

    /// Parse HWP file and return FileHeader as JSON
    ///
    /// # Arguments
    /// * `data` - Byte array containing the HWP file data
    ///
    /// # Returns
    /// FileHeader as JSON string
    pub fn parse_fileheader_json(&self, data: &[u8]) -> Result<String, HwpError> {
        // Parse CFB structure
        let mut cfb = CfbParser::parse(data)?;

        // Read and parse FileHeader
        let fileheader_data = CfbParser::read_stream(&mut cfb, "FileHeader")?;
        let fileheader = FileHeader::parse(&fileheader_data)?;

        // Convert to JSON
        fileheader.to_json()
    }

    /// Parse HWP file and return SummaryInformation as JSON
    ///
    /// # Arguments
    /// * `data` - Byte array containing the HWP file data
    ///
    /// # Returns
    /// SummaryInformation as JSON string, or empty JSON object if not found
    pub fn parse_summary_information_json(&self, data: &[u8]) -> Result<String, HwpError> {
        // Parse CFB structure
        let mut cfb = CfbParser::parse(data)?;

        // Use the shared helper method to read the stream
        match Self::read_summary_information_stream(&mut cfb, data) {
            Ok(summary_bytes) => {
                let summary_information =
                    crate::document::SummaryInformation::parse(&summary_bytes)?;
                // Convert to JSON
                serde_json::to_string_pretty(&summary_information).map_err(error::HwpError::from)
            }
            Err(_) => {
                // 스트림이 없으면 빈 SummaryInformation을 JSON으로 반환
                // If stream doesn't exist, return empty SummaryInformation as JSON
                let empty_summary = crate::document::SummaryInformation::default();
                serde_json::to_string_pretty(&empty_summary).map_err(error::HwpError::from)
            }
        }
    }

    /// HWP 5.1+ 대응: HWPTAG_PARA_LINE_SEG(표 62)가 없는 문단에 합성 LineSeg를 삽입한다.
    ///
    /// HWP 5.1.x 이상 버전에서는 LineSeg 레코드(문단 각 줄의 레이아웃 캐시)가
    /// 파일에 포함되지 않는 경우가 있다. LineSeg가 없으면 .hls(position:absolute)
    /// 요소에 top/left 좌표를 설정할 수 없어 모든 줄이 (0,0)에 겹쳐 렌더링된다.
    ///
    /// 이 함수는 ParaShape(줄간격), CharShape(글꼴 크기), PageDef(페이지 크기)를
    /// 기반으로 합성 LineSeg를 생성하여 records에 삽입한다.
    /// 파싱 레벨에서 처리하므로 렌더링, 페이지네이션, 테이블 셀 등
    /// 모든 downstream 코드가 자동으로 혜택을 받는다.
    ///
    /// 줄바꿈 위치는 글꼴 메트릭 없이는 알 수 없으므로 문단 전체를 1개 세그먼트로 처리한다.
    fn synthesize_missing_line_segments(document: &mut HwpDocument) {
        use document::bodytext::ParagraphRecord;

        // doc_info에 대한 참조를 먼저 분리하여 borrow 충돌 방지
        let doc_info = &document.doc_info as *const DocInfo;

        // 현재 PageDef 추적 (섹션별로 다를 수 있음)
        let mut current_page_def: Option<document::bodytext::PageDef> = None;

        for section in &mut document.body_text.sections {
            // 본문 문단의 누적 vertical_position 추적 (HWPUNIT)
            let mut accumulated_vertical: i32 = 0;

            for paragraph in &mut section.paragraphs {
                // PageDef 업데이트: 섹션 정의(secd) 컨트롤에서 추출
                for record in &paragraph.records {
                    if let ParagraphRecord::CtrlHeader { children, .. } = record {
                        for child in children {
                            if let ParagraphRecord::PageDef { page_def: pd } = child {
                                current_page_def = Some(pd.clone());
                            }
                        }
                    }
                }

                // SAFETY: doc_info는 body_text 수정 중에 변경되지 않으므로 안전
                let di = unsafe { &*doc_info };
                Self::synthesize_for_paragraph(
                    paragraph,
                    di,
                    &current_page_def,
                    &mut accumulated_vertical,
                    true, // 본문 레벨: vertical_position 누적
                );
            }
        }
    }

    /// 단일 문단 및 하위 문단(테이블 셀, 텍스트박스 등)에 재귀적으로 합성 LineSeg를 삽입한다.
    /// `accumulated_vertical`: 본문 레벨에서 누적 세로 위치 (HWPUNIT). 하위 문단은 0부터 시작.
    /// `is_body_level`: 본문 최상위 문단이면 true. 하위(테이블 셀 등)이면 false.
    fn synthesize_for_paragraph(
        paragraph: &mut document::Paragraph,
        doc_info: &DocInfo,
        page_def: &Option<document::bodytext::PageDef>,
        accumulated_vertical: &mut i32,
        is_body_level: bool,
    ) {
        use document::bodytext::ParagraphRecord;

        // 이미 LineSeg가 있으면 스킵 (단, vertical_position 누적은 반영)
        let has_line_seg = paragraph
            .records
            .iter()
            .any(|r| matches!(r, ParagraphRecord::ParaLineSeg { .. }));

        if !has_line_seg {
            let mut seg = Self::create_synthetic_line_segment(paragraph, doc_info, page_def);
            if is_body_level {
                seg.vertical_position = *accumulated_vertical;
                *accumulated_vertical += seg.line_height;
            }
            // ParaCharShape 바로 뒤에 삽입 (원래 LineSeg가 위치하는 곳)
            let insert_pos = paragraph
                .records
                .iter()
                .position(|r| matches!(r, ParagraphRecord::ParaCharShape { .. }))
                .map(|i| i + 1)
                .unwrap_or(paragraph.records.len());
            paragraph.records.insert(
                insert_pos,
                ParagraphRecord::ParaLineSeg { segments: vec![seg] },
            );
        } else if is_body_level {
            // 기존 LineSeg가 있는 경우에도 마지막 세그먼트의 vertical_position + line_height를 누적
            for record in &paragraph.records {
                if let ParagraphRecord::ParaLineSeg { segments } = record {
                    if let Some(last) = segments.last() {
                        *accumulated_vertical = last.vertical_position + last.line_height;
                    }
                }
            }
        }

        // 하위 문단에도 재귀 적용 (테이블 셀, 텍스트박스, 각주/미주 등)
        // 하위는 독립적인 좌표 공간이므로 accumulated_vertical을 0부터 시작
        for record in &mut paragraph.records {
            match record {
                ParagraphRecord::CtrlHeader {
                    paragraphs,
                    children,
                    ..
                } => {
                    let mut sub_vert = 0i32;
                    for para in paragraphs.iter_mut() {
                        Self::synthesize_for_paragraph(para, doc_info, page_def, &mut sub_vert, false);
                    }
                    for child in children.iter_mut() {
                        if let ParagraphRecord::ListHeader {
                            paragraphs: list_paras,
                            ..
                        } = child
                        {
                            let mut list_vert = 0i32;
                            for para in list_paras.iter_mut() {
                                Self::synthesize_for_paragraph(para, doc_info, page_def, &mut list_vert, false);
                            }
                        }
                    }
                }
                ParagraphRecord::ListHeader { paragraphs, .. } => {
                    let mut list_vert = 0i32;
                    for para in paragraphs.iter_mut() {
                        Self::synthesize_for_paragraph(para, doc_info, page_def, &mut list_vert, false);
                    }
                }
                ParagraphRecord::ShapeComponent { children, .. } => {
                    for child in children.iter_mut() {
                        if let ParagraphRecord::ListHeader {
                            paragraphs: list_paras,
                            ..
                        } = child
                        {
                            let mut list_vert = 0i32;
                            for para in list_paras.iter_mut() {
                                Self::synthesize_for_paragraph(para, doc_info, page_def, &mut list_vert, false);
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }

    /// ParaShape/CharShape/PageDef 기반으로 합성 LineSegmentInfo를 생성한다.
    fn create_synthetic_line_segment(
        paragraph: &document::Paragraph,
        doc_info: &DocInfo,
        page_def: &Option<document::bodytext::PageDef>,
    ) -> document::bodytext::line_seg::LineSegmentInfo {
        use document::bodytext::line_seg::{LineSegmentInfo, LineSegmentTag};
        use document::bodytext::ParagraphRecord;

        let para_shape_id = paragraph.para_header.para_shape_id as usize;
        let para_shape = doc_info.para_shapes.get(para_shape_id);

        // 줄간격 (%, bycharacter 기준)
        let line_spacing_pct = para_shape
            .and_then(|ps| ps.line_spacing.or(Some(ps.line_spacing_old)))
            .unwrap_or(160) as f64;

        // CharShape에서 글꼴 크기 가져오기
        let char_shape_id = paragraph
            .records
            .iter()
            .find_map(|r| {
                if let ParagraphRecord::ParaCharShape { shapes } = r {
                    shapes.first().map(|s| s.shape_id as usize)
                } else {
                    None
                }
            })
            .unwrap_or(0);

        let base_size = doc_info
            .char_shapes
            .get(char_shape_id)
            .map(|cs| cs.base_size)
            .unwrap_or(1000); // 10pt 기본값

        // base_size는 pt×100 단위, HWPUNIT: 1pt = 100 HWPUNIT
        let font_size_hu = base_size;
        let text_height_hu = font_size_hu;
        let text_line_height_hu = (font_size_hu as f64 * line_spacing_pct / 100.0).round() as i32;
        let baseline_distance_hu = (text_height_hu as f64 * 0.85).round() as i32;

        // 테이블/이미지 등 개체가 포함된 문단이면 개체 높이를 line_height로 사용
        // CtrlHeader::ObjectCommon의 height 필드에서 가져옴
        let mut object_height_hu: i32 = 0;
        for record in &paragraph.records {
            if let ParagraphRecord::CtrlHeader { header, .. } = record {
                if let document::bodytext::CtrlHeaderData::ObjectCommon { height, margin, .. } = &header.data {
                    let total = height.0 as i32 + margin.top as i32 + margin.bottom as i32;
                    if total > object_height_hu {
                        object_height_hu = total;
                    }
                }
            }
        }

        let line_height_hu = if object_height_hu > text_line_height_hu {
            object_height_hu
        } else {
            text_line_height_hu
        };

        // 콘텐츠 너비 (HWPUNIT)
        let content_width_hu = page_def
            .as_ref()
            .map(|pd| {
                let mm = pd.content_width_mm();
                (mm * 7200.0 / 25.4).round() as i32
            })
            .unwrap_or(48189); // 170mm ≈ 48189 HWPUNIT

        LineSegmentInfo {
            text_start_position: 0,
            vertical_position: 0,
            line_height: line_height_hu,
            text_height: text_height_hu,
            baseline_distance: baseline_distance_hu,
            line_spacing: line_height_hu,
            column_start_position: 0,
            segment_width: content_width_hu,
            tag: LineSegmentTag {
                is_first_line_of_page: true,
                is_first_line_of_column: true,
                is_empty_segment: false,
                is_first_segment_of_line: true,
                is_last_segment_of_line: true,
                has_auto_hyphenation: false,
                has_indentation: false,
                has_paragraph_header_shape: false,
            },
        }
    }
}

impl Default for HwpParser {
    fn default() -> Self {
        Self::new()
    }
}
