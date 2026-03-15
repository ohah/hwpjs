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
                    None, // 본문 레벨: 페이지 전체 너비 사용
                );
            }
        }
    }

    /// 단일 문단 및 하위 문단(테이블 셀, 텍스트박스 등)에 재귀적으로 합성 LineSeg를 삽입한다.
    /// `accumulated_vertical`: 본문 레벨에서 누적 세로 위치 (HWPUNIT). 하위 문단은 0부터 시작.
    /// `is_body_level`: 본문 최상위 문단이면 true. 하위(테이블 셀 등)이면 false.
    /// `content_width_override_hu`: 셀 내 문단일 때 셀 너비(HWPUNIT)를 전달.
    /// None이면 PageDef content_width를 사용.
    fn synthesize_for_paragraph(
        paragraph: &mut document::Paragraph,
        doc_info: &DocInfo,
        page_def: &Option<document::bodytext::PageDef>,
        accumulated_vertical: &mut i32,
        is_body_level: bool,
        content_width_override_hu: Option<i32>,
    ) {
        use document::bodytext::ParagraphRecord;

        // 먼저 하위 문단(테이블 셀, 텍스트박스 등)을 재귀 합성
        // 하위 문단의 LineSeg가 먼저 합성되어야 부모 문단의 개체 높이를 정확히 계산할 수 있음
        // 하위 문단에 재귀 적용 (테이블 셀, 텍스트박스, 각주/미주 등)
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
                        Self::synthesize_for_paragraph(para, doc_info, page_def, &mut sub_vert, false, None);
                    }
                    for child in children.iter_mut() {
                        match child {
                            ParagraphRecord::ListHeader {
                                paragraphs: list_paras,
                                ..
                            } => {
                                let mut list_vert = 0i32;
                                for para in list_paras.iter_mut() {
                                    Self::synthesize_for_paragraph(para, doc_info, page_def, &mut list_vert, false, None);
                                }
                            }
                            // 테이블 셀 내부 문단 처리 (셀 너비를 content_width로 전달)
                            ParagraphRecord::Table { table } => {
                                for cell in &mut table.cells {
                                    let mut cell_vert = 0i32;
                                    // 셀 너비에서 좌우 마진을 뺀 콘텐츠 너비
                                    let cell_content_w = cell.cell_attributes.width.0 as i32
                                        - cell.cell_attributes.left_margin as i32
                                        - cell.cell_attributes.right_margin as i32;
                                    let cell_w = if cell_content_w > 0 { Some(cell_content_w) } else { None };

                                    // 셀 내 gso 이미지 너비/높이 사전 스캔
                                    // text_option=square인 gso가 있으면 이미지 높이 범위 내의 문단에
                                    // column_start_position 오프셋 적용
                                    let mut cell_gso_width: i32 = 0;
                                    let mut cell_gso_height: i32 = 0;
                                    for para in &cell.paragraphs {
                                        for r in &para.records {
                                            if let ParagraphRecord::CtrlHeader { header, .. } = r {
                                                if let document::bodytext::CtrlHeaderData::ObjectCommon {
                                                    width, height, attribute, ..
                                                } = &header.data {
                                                    if matches!(
                                                        attribute.object_text_option,
                                                        document::bodytext::ctrl_header::ObjectTextOption::Square
                                                            | document::bodytext::ctrl_header::ObjectTextOption::Tight
                                                    ) {
                                                        cell_gso_width = width.0 as i32;
                                                        cell_gso_height = height.0 as i32;
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    for para in &mut cell.paragraphs {
                                        // gso 이미지 높이 범위 내이면 줄어든 너비 적용
                                        let in_image_range = cell_gso_width > 0 && cell_vert < cell_gso_height;
                                        let effective_w = if in_image_range {
                                            cell_w.map(|w| (w - cell_gso_width).max(0))
                                        } else {
                                            cell_w
                                        };
                                        Self::synthesize_for_paragraph(para, doc_info, page_def, &mut cell_vert, false, effective_w);

                                        // 합성된 LineSeg의 column_start_position을 이미지 너비로 조정
                                        if in_image_range {
                                            for r in &mut para.records {
                                                if let ParagraphRecord::ParaLineSeg { segments } = r {
                                                    for seg in segments.iter_mut() {
                                                        if seg.column_start_position == 0 {
                                                            seg.column_start_position = cell_gso_width;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                }
                ParagraphRecord::ListHeader { paragraphs, .. } => {
                    let mut list_vert = 0i32;
                    for para in paragraphs.iter_mut() {
                        Self::synthesize_for_paragraph(para, doc_info, page_def, &mut list_vert, false, None);
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
                                Self::synthesize_for_paragraph(para, doc_info, page_def, &mut list_vert, false, None);
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        // 하위 문단 합성이 완료된 후, 현재 문단의 LineSeg를 합성
        // 하위(셀)에 LineSeg가 있어야 개체(테이블) 실제 높이를 정확히 계산 가능
        let has_line_seg = paragraph
            .records
            .iter()
            .any(|r| matches!(r, ParagraphRecord::ParaLineSeg { .. }));

        if !has_line_seg {
            let mut segments = Self::create_synthetic_line_segments(paragraph, doc_info, page_def, content_width_override_hu);
            // 본문/하위 문단 모두 vertical_position을 누적
            // 하위(셀) 문단에서도 줄 위치가 올바르게 계산되어야 렌더링이 정확함
            for seg in &mut segments {
                seg.vertical_position += *accumulated_vertical;
            }
            if let Some(last) = segments.last() {
                *accumulated_vertical = last.vertical_position + last.line_spacing;
            }
            let insert_pos = paragraph
                .records
                .iter()
                .position(|r| matches!(r, ParagraphRecord::ParaCharShape { .. }))
                .map(|i| i + 1)
                .unwrap_or(paragraph.records.len());
            paragraph.records.insert(
                insert_pos,
                ParagraphRecord::ParaLineSeg { segments },
            );
        } else if is_body_level {
            for record in &paragraph.records {
                if let ParagraphRecord::ParaLineSeg { segments } = record {
                    if let Some(last) = segments.last() {
                        *accumulated_vertical = last.vertical_position + last.line_height;
                    }
                }
            }
        }
    }

    /// ParaShape/CharShape/PageDef 기반으로 합성 LineSegmentInfo를 생성한다.
    /// 글자 폭을 근사 계산하여 줄바꿈 위치를 추정하고, 줄 수만큼 세그먼트를 생성한다.
    ///
    /// 글자 폭 근사:
    /// - 한글/CJK (U+1100~U+FFEF): 폭 ≈ font_size (전각)
    /// - ASCII/Latin: 폭 ≈ font_size × 0.5 (반각)
    /// - 공백: 폭 ≈ font_size × 0.25
    fn create_synthetic_line_segments(
        paragraph: &document::Paragraph,
        doc_info: &DocInfo,
        page_def: &Option<document::bodytext::PageDef>,
        content_width_override_hu: Option<i32>,
    ) -> Vec<document::bodytext::line_seg::LineSegmentInfo> {
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
        // line_height: fixture 역산 기준 text_height × 0.75 (폰트 메트릭 근사)
        // HWP 원본의 line_height는 font metric 기반이며 text_height보다 작음
        let line_height_hu = (text_height_hu as f64 * 0.75).round() as i32;
        let text_line_height_hu = (font_size_hu as f64 * line_spacing_pct / 100.0).round() as i32;
        let baseline_distance_hu = (text_height_hu as f64 * 0.85).round() as i32;

        // 셀 내 gso 이미지 너비 확인 (text_option=square일 때 텍스트 영역 조정)
        // 셀 레벨에서 이미 effective_w로 처리된 경우 여기서는 건너뜀
        // (본문 레벨에서만 적용)
        let mut gso_image_width_hu: i32 = 0;
        if content_width_override_hu.is_none() {
            for record in &paragraph.records {
                if let ParagraphRecord::CtrlHeader { header, .. } = record {
                    if let document::bodytext::CtrlHeaderData::ObjectCommon {
                        width, attribute, ..
                    } = &header.data
                    {
                        // text_option이 square/tight이면 텍스트가 개체를 감싸므로
                        // column_start_position을 이미지 너비만큼 오프셋
                        if matches!(
                            attribute.object_text_option,
                            document::bodytext::ctrl_header::ObjectTextOption::Square
                                | document::bodytext::ctrl_header::ObjectTextOption::Tight
                        ) {
                            let w = width.0 as i32;
                            if w > gso_image_width_hu {
                                gso_image_width_hu = w;
                            }
                        }
                    }
                }
            }
        }

        // 콘텐츠 너비 (HWPUNIT): 셀 너비 오버라이드가 있으면 사용
        let content_width_hu = content_width_override_hu.unwrap_or_else(|| {
            page_def
                .as_ref()
                .map(|pd| {
                    let mm = pd.content_width_mm();
                    (mm * 7200.0 / 25.4).round() as i32
                })
                .unwrap_or(48189) // 170mm ≈ 48189 HWPUNIT
        });

        // 테이블/이미지 등 개체가 포함된 문단이면 개체 높이를 사용
        // 단, 셀 내부 문단(content_width_override_hu가 Some)에서는 무시.
        // 셀 안의 gso는 like_letters=false로 독립 배치되므로 줄 높이에 포함하면 안 됨.
        let is_inside_cell = content_width_override_hu.is_some();
        let mut object_height_hu: i32 = 0;
        let mut object_margin_hu: i32 = 0;
        let mut has_object = false;
        if !is_inside_cell {
        for record in &paragraph.records {
            if let ParagraphRecord::CtrlHeader { header, children, .. } = record {
                if let document::bodytext::CtrlHeaderData::ObjectCommon { height, margin, .. } = &header.data {
                    let margin_total = margin.top as i32 + margin.bottom as i32;
                    let obj_common_h = height.0 as i32 + margin_total;

                    // 테이블 셀 내 LineSeg에서 실제 높이 계산
                    let mut cell_max_h: i32 = 0;
                    for child in children {
                        if let ParagraphRecord::Table { table } = child {
                            // 각 행의 최대 셀 높이를 합산
                            let mut row_heights: std::collections::BTreeMap<u16, i32> = std::collections::BTreeMap::new();
                            for cell in &table.cells {
                                let row = cell.cell_attributes.row_address;
                                let mut cell_h: i32 = 0;
                                for para in &cell.paragraphs {
                                    for r in &para.records {
                                        if let ParagraphRecord::ParaLineSeg { segments } = r {
                                            for seg in segments {
                                                let end = seg.vertical_position + seg.line_spacing;
                                                if end > cell_h {
                                                    cell_h = end;
                                                }
                                            }
                                        }
                                    }
                                }
                                let current = row_heights.entry(row).or_insert(0);
                                if cell_h > *current {
                                    *current = cell_h;
                                }
                            }
                            let total_row_h: i32 = row_heights.values().sum();
                            if total_row_h > cell_max_h {
                                cell_max_h = total_row_h;
                            }
                        }
                    }

                    let actual_h = if cell_max_h > obj_common_h {
                        cell_max_h
                    } else {
                        obj_common_h
                    };

                    if actual_h > object_height_hu {
                        object_height_hu = actual_h;
                        object_margin_hu = margin_total;
                        has_object = true;
                    }
                }
            }
        }
        } // is_inside_cell

        // 개체가 있으면 1개 세그먼트로 처리 (개체 높이 사용)
        if has_object {
            let obj_height_hu = object_height_hu.max(text_line_height_hu);
            // 줄 간격: 개체 높이 + 마진×2 (fixture에서 개체 상하 마진이 내부+외부에 이중 적용)
            let obj_spacing_hu = obj_height_hu + object_margin_hu * 2;
            return vec![LineSegmentInfo {
                text_start_position: 0,
                vertical_position: 0,
                line_height: obj_height_hu,
                text_height: text_height_hu,
                baseline_distance: baseline_distance_hu,
                line_spacing: obj_spacing_hu, // 개체 높이 + 마진을 줄 간격으로 사용
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
            }];
        }

        // 문단 텍스트 가져오기
        let para_text = paragraph
            .records
            .iter()
            .find_map(|r| {
                if let ParagraphRecord::ParaText { text, .. } = r {
                    Some(text.as_str())
                } else {
                    None
                }
            })
            .unwrap_or("");

        // 글자 폭 근사 계산으로 줄바꿈 위치 추정
        // 각 줄의 시작 문자 위치(WCHAR 인덱스)를 반환
        let estimate_line_breaks = |text: &str, line_width_hu: i32, font_hu: i32| -> Vec<u32> {
            let mut line_starts: Vec<u32> = vec![0]; // 첫 줄은 항상 0에서 시작
            if text.is_empty() || line_width_hu <= 0 || font_hu <= 0 {
                return line_starts;
            }
            let mut current_width: i32 = 0;
            for (char_idx, ch) in text.chars().enumerate() {
                // 글자 폭 근사값 (fixture 역산 기반, 맑은 고딕/한컴바탕 등 한글 글꼴 기준)
                // justify 정렬에서 공백이 늘어나는 것을 감안하여 공백 폭을 작게 설정
                let char_width = if ch == ' ' {
                    (font_hu as f64 * 0.10) as i32 // 공백: font_size × 0.10 (justify 정렬에서 공백은 남는 공간을 채우므로 작게 설정)
                } else if ch == '\t' {
                    font_hu * 2 // 탭: font_size × 2 (근사)
                } else if Self::is_fullwidth_char(ch) {
                    (font_hu as f64 * 0.85) as i32 // 한글/CJK: font_size × 0.85
                } else {
                    (font_hu as f64 * 0.425) as i32 // ASCII/Latin: font_size × 0.425
                };
                current_width += char_width;
                if current_width > line_width_hu {
                    line_starts.push(char_idx as u32);
                    current_width = char_width; // 현재 글자를 다음 줄로
                }
            }
            line_starts
        };

        // gso 이미지가 있으면 텍스트 영역을 이미지 오른쪽으로 밀기
        // fixture: text_option=square일 때 column_start_position=이미지 너비, width=셀너비-이미지너비
        let (text_col_start, text_seg_width) = if gso_image_width_hu > 0 {
            (gso_image_width_hu, (content_width_hu - gso_image_width_hu).max(0))
        } else {
            (0, content_width_hu)
        };

        // 줄바꿈 추정은 텍스트 영역 너비 기준
        let line_starts = estimate_line_breaks(para_text, text_seg_width, font_size_hu);
        let line_count = line_starts.len();

        // ParaShape의 indent로 들여쓰기/내어쓰기 판단
        let indent_val = para_shape.map(|ps| ps.indent).unwrap_or(0);

        let mut segments = Vec::with_capacity(line_count);
        for i in 0..line_count {
            segments.push(LineSegmentInfo {
                text_start_position: line_starts[i],
                vertical_position: (i as i32) * text_line_height_hu,
                line_height: line_height_hu,
                text_height: text_height_hu,
                baseline_distance: baseline_distance_hu,
                line_spacing: text_line_height_hu,
                column_start_position: text_col_start,
                segment_width: text_seg_width,
                tag: LineSegmentTag {
                    is_first_line_of_page: i == 0,
                    is_first_line_of_column: i == 0,
                    is_empty_segment: false,
                    is_first_segment_of_line: true,
                    is_last_segment_of_line: true,
                    has_auto_hyphenation: false,
                    // 내어쓰기(indent<0): 2번째 줄부터 padding-left 적용
                    // 들여쓰기(indent>0): 첫 줄에만 padding-left 적용
                    has_indentation: if indent_val < 0 { i > 0 } else if indent_val > 0 { i == 0 } else { false },
                    has_paragraph_header_shape: false,
                },
            });
        }

        segments
    }

    /// 전각 문자 판별 (한글, CJK, 전각 기호 등)
    fn is_fullwidth_char(ch: char) -> bool {
        let cp = ch as u32;
        // 한글 자모
        (0x1100..=0x11FF).contains(&cp)
        // 한글 호환 자모
        || (0x3130..=0x318F).contains(&cp)
        // 한글 음절
        || (0xAC00..=0xD7AF).contains(&cp)
        // CJK 통합 한자
        || (0x4E00..=0x9FFF).contains(&cp)
        // CJK 호환 한자
        || (0xF900..=0xFAFF).contains(&cp)
        // 전각 기호
        || (0xFF01..=0xFF60).contains(&cp)
        // CJK 기호 및 구두점
        || (0x3000..=0x303F).contains(&cp)
        // 히라가나/가타카나
        || (0x3040..=0x30FF).contains(&cp)
    }
}

impl Default for HwpParser {
    fn default() -> Self {
        Self::new()
    }
}
