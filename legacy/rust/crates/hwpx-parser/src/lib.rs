mod body;
mod error;
mod header;
mod ocf;
mod opf;
mod utils;

pub use error::HwpxError;

use hwp_model::document::Document;
use std::io::{Read, Seek};

/// HWPX 파일을 파싱하여 공통 Document 모델로 변환한다.
pub struct HwpxParser;

impl HwpxParser {
    /// 바이트 슬라이스에서 HWPX 파싱
    pub fn parse(data: &[u8]) -> Result<Document, HwpxError> {
        let cursor = std::io::Cursor::new(data);
        Self::parse_reader(cursor)
    }

    /// Read+Seek를 구현하는 리더에서 HWPX 파싱
    pub fn parse_reader<R: Read + Seek>(reader: R) -> Result<Document, HwpxError> {
        let mut archive = zip::ZipArchive::new(reader)?;
        let mut document = Document::default();

        // 1. version.xml
        let version = ocf::parse_version(&mut archive)?;
        document.hwpx_hints = Some(hwp_model::hints::HwpxDocumentHints {
            xml_version: Some(version.xml_version),
            app_version: Some(version.app_version),
            ..Default::default()
        });

        // 2. content.hpf (OPF) → 메타데이터 + manifest
        let opf = opf::parse_opf(&mut archive)?;
        document.meta = opf.metadata;

        // 3. header.xml → Resources
        let header_path = opf.header_path.as_deref().unwrap_or("Contents/header.xml");
        document.resources = header::parse_header(&mut archive, header_path)?;
        document.settings = header::parse_settings(&mut archive, header_path)?;

        // 4. section*.xml → Sections
        for section_path in &opf.section_paths {
            let section = body::parse_section(&mut archive, section_path)?;
            document.sections.push(section);
        }

        // 5. BinData → Binaries
        document.binaries = ocf::parse_binaries(&mut archive, &opf.binary_items)?;

        Ok(document)
    }
}
