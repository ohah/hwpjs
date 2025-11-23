mod char_shape;
/// BodyText parsing module
///
/// This module handles parsing of HWP BodyText storage.
///
/// 스펙 문서 매핑: 표 2 - 본문 (BodyText 스토리지)
pub mod constants;
mod line_seg;
mod para_header;

pub use char_shape::{CharShapeInfo, ParaCharShape};
pub use line_seg::{LineSegmentInfo, LineSegmentTag, ParaLineSeg};

use crate::cfb::CfbParser;
use crate::decompress::decompress_deflate;
use crate::document::fileheader::FileHeader;
use crate::types::{decode_utf16le, RecordHeader, WORD};
use cfb::CompoundFile;
use constants::*;
use para_header::ParaHeader;
use serde::{Deserialize, Serialize};
use std::io::Cursor;

/// Body text structure
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BodyText {
    /// Sections (Section0, Section1, etc.)
    pub sections: Vec<Section>,
}

/// Section structure
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Section {
    /// Section index
    pub index: WORD,
    /// Paragraphs in this section
    pub paragraphs: Vec<Paragraph>,
}

/// Paragraph structure
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Paragraph {
    /// Paragraph header (level 0 record)
    pub para_header: ParaHeader,
    /// Paragraph records (level 1 records)
    pub records: Vec<ParagraphRecord>,
}

/// Paragraph record (level 1 records)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ParagraphRecord {
    /// 문단의 텍스트 / Paragraph text
    ParaText {
        /// 텍스트 내용 (UTF-16LE) / Text content (UTF-16LE)
        text: String,
    },
    /// 문단의 글자 모양 / Paragraph character shape
    ParaCharShape {
        /// 글자 모양 정보 리스트 / Character shape information list
        shapes: Vec<CharShapeInfo>,
    },
    /// 문단의 레이아웃 / Paragraph line segment
    ParaLineSeg {
        /// 줄 세그먼트 정보 리스트 / Line segment information list
        segments: Vec<LineSegmentInfo>,
    },
    /// 문단의 영역 태그 / Paragraph range tag
    ParaRangeTag {
        /// Raw data (will be parsed later)
        #[serde(skip)]
        data: Vec<u8>,
    },
    /// 컨트롤 헤더 / Control header
    CtrlHeader {
        /// Raw data (will be parsed later)
        #[serde(skip)]
        data: Vec<u8>,
    },
    /// 문단 리스트 헤더 / Paragraph list header
    ListHeader {
        /// Raw data (will be parsed later)
        #[serde(skip)]
        data: Vec<u8>,
    },
    /// 기타 레코드 / Other records
    Other {
        /// Tag ID
        tag_id: u16,
        /// Raw data
        #[serde(skip)]
        data: Vec<u8>,
    },
}

impl Section {
    /// Section 데이터를 파싱하여 Paragraph 리스트로 변환합니다. / Parse section data into paragraph list.
    ///
    /// # Arguments
    /// * `data` - Section의 원시 바이트 데이터 / Raw byte data of section
    /// * `version` - 파일 버전 / File version
    ///
    /// # Returns
    /// 파싱된 Paragraph 리스트 / Parsed paragraph list
    pub fn parse_data(data: &[u8], version: u32) -> Result<Vec<Paragraph>, String> {
        let mut paragraphs = Vec::new();
        let mut offset = 0;

        while offset < data.len() {
            // 레코드 헤더 파싱 / Parse record header
            let remaining_data = &data[offset..];
            let (header, header_size) = RecordHeader::parse(remaining_data)?;
            offset += header_size;

            // 데이터 영역 읽기 / Read data area
            let data_size = header.size as usize;
            if offset + data_size > data.len() {
                return Err(format!(
                    "Record data extends beyond section: offset={}, size={}, section_len={}",
                    offset,
                    data_size,
                    data.len()
                ));
            }

            let record_data = &data[offset..offset + data_size];
            offset += data_size;

            // 레벨 0인 경우 새로운 문단 시작 (HWPTAG_PARA_HEADER) / Level 0 means new paragraph (HWPTAG_PARA_HEADER)
            if header.level == 0 {
                if header.tag_id == HWPTAG_PARA_HEADER {
                    let para_header = ParaHeader::parse(record_data, version)?;
                    paragraphs.push(Paragraph {
                        para_header,
                        records: Vec::new(),
                    });
                } else {
                    return Err(format!(
                        "Unexpected level 0 tag ID: {} (expected HWPTAG_PARA_HEADER)",
                        header.tag_id
                    ));
                }
            } else if header.level == 1 {
                // 레벨 1 레코드는 현재 문단에 추가 / Level 1 records belong to current paragraph
                if let Some(current_para) = paragraphs.last_mut() {
                    let record = match header.tag_id {
                        HWPTAG_PARA_TEXT => {
                            // UTF-16LE 텍스트 파싱 / Parse UTF-16LE text
                            let text = decode_utf16le(record_data)?;
                            ParagraphRecord::ParaText { text }
                        }
                        HWPTAG_PARA_CHAR_SHAPE => {
                            // 문단의 글자 모양 파싱 / Parse paragraph character shape
                            let para_char_shape = ParaCharShape::parse(record_data)?;
                            ParagraphRecord::ParaCharShape {
                                shapes: para_char_shape.shapes,
                            }
                        }
                        HWPTAG_PARA_LINE_SEG => {
                            // 문단의 레이아웃 파싱 / Parse paragraph line segment
                            let para_line_seg = ParaLineSeg::parse(record_data)?;
                            ParagraphRecord::ParaLineSeg {
                                segments: para_line_seg.segments,
                            }
                        }
                        HWPTAG_PARA_RANGE_TAG => ParagraphRecord::ParaRangeTag {
                            data: record_data.to_vec(),
                        },
                        HWPTAG_CTRL_HEADER => ParagraphRecord::CtrlHeader {
                            data: record_data.to_vec(),
                        },
                        HWPTAG_LIST_HEADER => ParagraphRecord::ListHeader {
                            data: record_data.to_vec(),
                        },
                        _ => ParagraphRecord::Other {
                            tag_id: header.tag_id,
                            data: record_data.to_vec(),
                        },
                    };
                    current_para.records.push(record);
                } else {
                    return Err("Level 1 record found before paragraph header".to_string());
                }
            }
        }

        Ok(paragraphs)
    }
}

impl BodyText {
    /// BodyText 스토리지에서 sections를 파싱합니다. / Parse sections from BodyText storage.
    ///
    /// # Arguments
    /// * `cfb` - CFB 구조체 (mutable reference) / CFB structure (mutable reference)
    /// * `file_header` - FileHeader (압축 여부 확인용) / FileHeader (to check compression)
    /// * `section_count` - 구역 개수 (DocumentProperties의 area_count) / Section count (area_count from DocumentProperties)
    ///
    /// # Returns
    /// 파싱된 BodyText 구조체 / Parsed BodyText structure
    pub fn parse(
        cfb: &mut CompoundFile<Cursor<&[u8]>>,
        file_header: &FileHeader,
        section_count: WORD,
    ) -> Result<Self, String> {
        let mut sections = Vec::new();

        // 각 구역을 읽어옵니다 / Read each section
        for i in 0..section_count {
            let section_name = format!("BodyText/Section{}", i);

            // 스트림 읽기 시도 / Try to read stream
            match CfbParser::read_stream(cfb, &section_name) {
                Ok(mut section_data) => {
                    // 압축 해제 (필요한 경우) / Decompress if needed
                    // HWP BodyText uses raw deflate format (windowBits: -15), not zlib
                    if file_header.is_compressed() {
                        section_data = decompress_deflate(&section_data)?;
                    }

                    // Section 데이터를 Paragraph 리스트로 파싱 / Parse section data into paragraph list
                    let paragraphs = Section::parse_data(&section_data, file_header.version)?;

                    sections.push(Section {
                        index: i,
                        paragraphs,
                    });
                }
                Err(e) => {
                    // 스트림이 없으면 경고만 출력하고 계속 진행 / If stream doesn't exist, just warn and continue
                    eprintln!("Warning: Could not read {}: {}", section_name, e);
                }
            }
        }

        Ok(BodyText { sections })
    }
}
