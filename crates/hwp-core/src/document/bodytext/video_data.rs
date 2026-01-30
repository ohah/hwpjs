/// VideoData 구조체 / VideoData structure
///
/// 스펙 문서 매핑: 표 123 - 동영상 개체 속성 / Spec mapping: Table 123 - Video object attributes
///
/// **구현 상태 / Implementation Status**
/// - 구현 완료 / Implementation complete
/// - 테스트 파일(`noori.hwp`)에 VIDEO_DATA 레코드가 없어 실제 파일로 테스트되지 않음
/// - Implementation complete, but not tested with actual file as test file (`noori.hwp`) does not contain VIDEO_DATA records
use crate::error::HwpError;
use crate::types::{decode_utf16le, INT32, UINT16};
use serde::{Deserialize, Serialize};

/// 동영상 개체 / Video object
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoData {
    /// 동영상 타입 (표 124 참조) / Video type (see Table 124)
    /// - 0: 로컬 동영상 / Local video
    /// - 1: 웹 동영상 / Web video
    pub video_type: INT32,
    /// 동영상 타입에 따른 속성 / Attributes based on video type
    pub video_attributes: VideoAttributes,
}

/// 동영상 속성 / Video attributes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum VideoAttributes {
    /// 로컬 동영상 속성 (표 125 참조) / Local video attributes (see Table 125)
    Local {
        /// 비디오 파일이 사용하는 스토리지의 BinData ID / BinData ID of storage used by video file
        video_bindata_id: UINT16,
        /// 썸네일 파일이 사용하는 스토리지의 BinData ID / BinData ID of storage used by thumbnail file
        thumbnail_bindata_id: UINT16,
    },
    /// 웹 동영상 속성 (표 126 참조) / Web video attributes (see Table 126)
    Web {
        /// 웹 태그 / Web tag
        web_tag: String,
        /// 썸네일 파일이 사용하는 스토리지의 BinData ID / BinData ID of storage used by thumbnail file
        thumbnail_bindata_id: UINT16,
    },
}

impl VideoData {
    /// VideoData를 바이트 배열에서 파싱합니다. / Parse VideoData from byte array.
    ///
    /// # Arguments
    /// * `data` - VideoData 데이터 (동영상 개체 속성 부분만) / VideoData data (video object attributes only)
    ///
    /// # Returns
    /// 파싱된 VideoData 구조체 / Parsed VideoData structure
    ///
    /// # Note
    /// 스펙 문서 표 122에 따르면 VIDEO_DATA는 다음 구조를 가집니다:
    /// - 개체 공통 속성(표 68 참조) - 가변 길이
    /// - 동영상 개체 속성(표 123 참조) - 가변 길이 (4 + n 바이트)
    ///
    /// 레거시 코드(hwp.js)는 동영상 개체 속성을 파싱하지 않고 있습니다.
    /// According to spec Table 122, VIDEO_DATA has the following structure:
    /// - Object common properties (Table 68) - variable length
    /// - Video object attributes (Table 123) - variable length (4 + n bytes)
    ///
    /// Legacy code (hwp.js) does not parse video object attributes.
    ///
    /// **테스트 상태 / Testing Status**
    /// 현재 테스트 파일(`noori.hwp`)에 VIDEO_DATA 레코드가 없어 실제 파일로 검증되지 않았습니다.
    /// 실제 HWP 파일에 VIDEO_DATA 레코드가 있으면 자동으로 파싱됩니다.
    /// Current test file (`noori.hwp`) does not contain VIDEO_DATA records, so it has not been verified with actual files.
    /// If an actual HWP file contains VIDEO_DATA records, they will be automatically parsed.
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        // 최소 4바이트 필요 (동영상 타입) / Need at least 4 bytes (video type)
        if data.len() < 4 {
            return Err(HwpError::insufficient_data("VideoData", 4, data.len()));
        }

        let mut offset = 0;

        // 표 123: 동영상 타입 (INT32, 4바이트) / Table 123: Video type (INT32, 4 bytes)
        let video_type = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 123: 동영상 타입에 따른 속성 파싱 / Table 123: Parse attributes based on video type
        let video_attributes = match video_type {
            0 => {
                // 로컬 동영상 속성 (표 125) / Local video attributes (Table 125)
                if data.len() < offset + 4 {
                    return Err(HwpError::insufficient_data(
                        "VideoData local video attributes",
                        4,
                        data.len() - offset,
                    ));
                }
                let video_bindata_id = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
                offset += 2;
                let thumbnail_bindata_id = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
                offset += 2;
                VideoAttributes::Local {
                    video_bindata_id,
                    thumbnail_bindata_id,
                }
            }
            1 => {
                // 웹 동영상 속성 (표 126) / Web video attributes (Table 126)
                // 웹 태그는 가변 길이이므로, 나머지 데이터에서 썸네일 BinData ID(2바이트)를 제외한 부분이 웹 태그
                // Web tag is variable length, so remaining data minus thumbnail BinData ID (2 bytes) is web tag
                if data.len() < offset + 2 {
                    return Err(HwpError::insufficient_data(
                        "VideoData web video attributes",
                        2,
                        data.len() - offset,
                    ));
                }
                // 웹 태그 길이 계산: 전체 길이 - offset - 썸네일 BinData ID(2바이트)
                // Calculate web tag length: total length - offset - thumbnail BinData ID (2 bytes)
                let web_tag_length = data.len().saturating_sub(offset + 2);
                if web_tag_length == 0 {
                    return Err(HwpError::UnexpectedValue {
                        field: "VideoData web tag length".to_string(),
                        expected: "positive number".to_string(),
                        found: "0".to_string(),
                    });
                }
                let web_tag_bytes = &data[offset..offset + web_tag_length];
                let web_tag =
                    decode_utf16le(web_tag_bytes).map_err(|e| HwpError::EncodingError {
                        reason: format!("Failed to decode web tag: {}", e),
                    })?;
                offset += web_tag_length;
                let thumbnail_bindata_id = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
                offset += 2;
                VideoAttributes::Web {
                    web_tag,
                    thumbnail_bindata_id,
                }
            }
            _ => {
                return Err(HwpError::UnexpectedValue {
                    field: "VideoData video_type".to_string(),
                    expected: "0 or 1".to_string(),
                    found: video_type.to_string(),
                });
            }
        };

        Ok(VideoData {
            video_type,
            video_attributes,
        })
    }
}
