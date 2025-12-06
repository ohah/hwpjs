/// HWP Core Library
///
/// This library provides core functionality for parsing HWP files.
/// It accepts byte arrays as input to support cross-platform usage.
pub mod cfb;
pub mod decompress;
pub mod document;
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
    pub fn parse(&self, data: &[u8]) -> Result<HwpDocument, String> {
        // Parse CFB structure
        let mut cfb = CfbParser::parse(data)?;

        // Parse required streams
        let fileheader = self.parse_fileheader(&mut cfb)?;
        let mut document = HwpDocument::new(fileheader.clone());
        document.doc_info = self.parse_docinfo(&mut cfb, &fileheader)?;
        document.body_text = self.parse_bodytext(&mut cfb, &fileheader, &document.doc_info)?;
        document.bin_data = self.parse_bindata(&mut cfb, &document.doc_info)?;

        // Parse optional streams
        self.parse_optional_streams(&mut cfb, &fileheader, &mut document, data);

        Ok(document)
    }

    // ===== Required parsing methods =====

    /// Parse FileHeader stream
    fn parse_fileheader(
        &self,
        cfb: &mut CompoundFile<Cursor<&[u8]>>,
    ) -> Result<FileHeader, String> {
        let fileheader_data = CfbParser::read_stream(cfb, "FileHeader")?;
        FileHeader::parse(&fileheader_data)
    }

    /// Parse DocInfo stream
    fn parse_docinfo(
        &self,
        cfb: &mut CompoundFile<Cursor<&[u8]>>,
        fileheader: &FileHeader,
    ) -> Result<DocInfo, String> {
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
    ) -> Result<BodyText, String> {
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
    ) -> Result<BinData, String> {
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
                match crate::document::SummaryInformation::parse(&summary_bytes) {
                    Ok(summary_information) => {
                        eprintln!("Debug: Successfully parsed SummaryInformation");
                        document.summary_information = Some(summary_information);
                    }
                    Err(e) => {
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
                        // 파싱 실패 시 None으로 유지 (raw_data 저장 안 함) / Keep None on parse failure (don't store raw_data)
                    }
                }
            }
            Err(e) => {
                eprintln!("Warning: Failed to read SummaryInformation stream: {}", e);
                eprintln!("  Tried: \\u{{0005}}HwpSummaryInformation, \\x05HwpSummaryInformation, HwpSummaryInformation");
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
    ) -> Result<Vec<u8>, String> {
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
                    eprintln!("Debug: Failed to read with {}: {}", name, e);
                }
            }
        }

        // If all string-based attempts fail, try parsing CFB bytes directly
        // 모든 문자열 기반 시도가 실패하면 CFB 바이트를 직접 파싱 시도
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
    pub fn parse_fileheader_json(&self, data: &[u8]) -> Result<String, String> {
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
    pub fn parse_summary_information_json(&self, data: &[u8]) -> Result<String, String> {
        // Parse CFB structure
        let mut cfb = CfbParser::parse(data)?;

        // Use the shared helper method to read the stream
        match Self::read_summary_information_stream(&mut cfb, data) {
            Ok(summary_bytes) => {
                let summary_information =
                    crate::document::SummaryInformation::parse(&summary_bytes)?;
                // Convert to JSON
                serde_json::to_string_pretty(&summary_information)
                    .map_err(|e| format!("Failed to serialize SummaryInformation to JSON: {}", e))
            }
            Err(_) => {
                // 스트림이 없으면 빈 SummaryInformation을 JSON으로 반환
                // If stream doesn't exist, return empty SummaryInformation as JSON
                let empty_summary = crate::document::SummaryInformation::default();
                serde_json::to_string_pretty(&empty_summary)
                    .map_err(|e| format!("Failed to serialize SummaryInformation to JSON: {}", e))
            }
        }
    }
}

impl Default for HwpParser {
    fn default() -> Self {
        Self::new()
    }
}
