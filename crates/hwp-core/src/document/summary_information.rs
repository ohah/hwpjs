/// SummaryInformation 구조체 / SummaryInformation structure
///
/// 스펙 문서 매핑: 3.2.4 - 문서 요약 / Spec mapping: 3.2.4 - Document summary
///
/// `\005HwpSummaryInformation` 스트림에는 한글 메뉴의 "파일 - 문서 정보 - 문서 요약"에서 입력한 내용이 저장됩니다.
/// The `\005HwpSummaryInformation` stream contains summary information entered from HWP menu "File - Document Info - Document Summary".
///
/// Summary Information에 대한 자세한 설명은 MSDN을 참고:
/// For detailed description of Summary Information, refer to MSDN:
/// - The Summary Information Property Set
/// - The DocumentSummaryInformation and UserDefined Property Set
///
/// 스펙 문서 표 7: 문서 요약 Property ID 정의
/// Spec document Table 7: Document summary Property ID definitions
use crate::error::HwpError;
use crate::types::{INT32, UINT32};
use serde::{Deserialize, Serialize};

/// 문서 요약 정보 / Document summary information
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SummaryInformation {
    /// 제목 / Title (PIDSI_TITLE, 0x00000002)
    pub title: Option<String>,
    /// 주제 / Subject (PIDSI_SUBJECT, 0x00000003)
    pub subject: Option<String>,
    /// 작성자 / Author (PIDSI_AUTHOR, 0x00000004)
    pub author: Option<String>,
    /// 키워드 / Keywords (PIDSI_KEYWORDS, 0x00000005)
    pub keywords: Option<String>,
    /// 주석 / Comments (PIDSI_COMMENTS, 0x00000006)
    pub comments: Option<String>,
    /// 마지막 저장한 사람 / Last Saved By (PIDSI_LASTAUTHOR, 0x00000008)
    pub last_saved_by: Option<String>,
    /// 수정 번호 / Revision Number (PIDSI_REVNUMBER, 0x00000009)
    pub revision_number: Option<String>,
    /// 마지막 인쇄 시간 (UTC+9 ISO 8601 형식) / Last Printed (PIDSI_LASTPRINTED, 0x0000000B) (UTC+9 ISO 8601 format)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_printed: Option<String>,
    /// 생성 시간/날짜 (UTC+9 ISO 8601 형식) / Create Time/Date (PIDSI_CREATE_DTM, 0x0000000C) (UTC+9 ISO 8601 format)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub create_time: Option<String>,
    /// 마지막 저장 시간/날짜 (UTC+9 ISO 8601 형식) / Last saved Time/Date (PIDSI_LASTSAVE_DTM, 0x0000000D) (UTC+9 ISO 8601 format)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_saved_time: Option<String>,
    /// 페이지 수 / Number of Pages (PIDSI_PAGECOUNT, 0x0000000E)
    pub page_count: Option<INT32>,
    /// 날짜 문자열 (사용자 정의) / Date String (User define) (HWPPIDSI_DATE_STR, 0x00000014)
    pub date_string: Option<String>,
    /// 문단 수 (사용자 정의) / Para Count (User define) (HWPPIDSI_PARACOUNT, 0x00000015)
    pub para_count: Option<INT32>,
}

/// FILETIME 구조체 (Windows FILETIME 형식) / FILETIME structure (Windows FILETIME format)
/// 64-bit value representing the number of 100-nanosecond intervals since January 1, 1601 (UTC)
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct FileTime {
    /// Low 32 bits / 하위 32비트
    pub low: UINT32,
    /// High 32 bits / 상위 32비트
    pub high: UINT32,
}

impl FileTime {
    /// FILETIME을 Unix timestamp (초)로 변환 / Convert FILETIME to Unix timestamp (seconds)
    pub fn to_unix_timestamp(self) -> i64 {
        // FILETIME epoch: January 1, 1601
        // Unix epoch: January 1, 1970
        // Difference: 11644473600 seconds = 0x019DB1DED53E8000 in 100-nanosecond intervals
        let filetime = ((self.high as u64) << 32) | (self.low as u64);
        let unix_time = filetime as i64 - 0x019DB1DED53E8000;
        unix_time / 10_000_000 // Convert from 100-nanosecond intervals to seconds
    }

    /// FILETIME을 UTC+9 시간대의 ISO 8601 문자열로 변환 / Convert FILETIME to ISO 8601 string in UTC+9 timezone
    pub fn to_utc9_string(self) -> String {
        use std::time::{Duration, UNIX_EPOCH};

        let unix_timestamp = self.to_unix_timestamp();
        if unix_timestamp < 0 {
            return "1970-01-01T00:00:00+09:00".to_string();
        }

        let duration = Duration::from_secs(unix_timestamp as u64);
        let datetime = UNIX_EPOCH + duration;

        // UTC+9로 변환 (9시간 추가)
        // Convert to UTC+9 (add 9 hours)
        let utc9_datetime = datetime + Duration::from_secs(9 * 3600);

        // ISO 8601 형식으로 변환 (YYYY-MM-DDTHH:MM:SS+09:00)
        // Convert to ISO 8601 format (YYYY-MM-DDTHH:MM:SS+09:00)
        let total_secs = utc9_datetime.duration_since(UNIX_EPOCH).unwrap().as_secs();
        let days = total_secs / 86400;
        let secs_in_day = total_secs % 86400;
        let hours = secs_in_day / 3600;
        let minutes = (secs_in_day % 3600) / 60;
        let seconds = secs_in_day % 60;

        // 1970-01-01부터의 일수로 날짜 계산
        // Calculate date from days since 1970-01-01
        let mut year = 1970;
        let mut day_of_year = days as i32;

        loop {
            let days_in_year = if is_leap_year(year) { 366 } else { 365 };
            if day_of_year < days_in_year {
                break;
            }
            day_of_year -= days_in_year;
            year += 1;
        }

        let mut month = 1;
        let mut day = day_of_year + 1;
        let days_in_month = [
            31,
            if is_leap_year(year) { 29 } else { 28 },
            31,
            30,
            31,
            30,
            31,
            31,
            30,
            31,
            30,
            31,
        ];

        for &dim in &days_in_month {
            if day <= dim {
                break;
            }
            day -= dim;
            month += 1;
        }

        format!(
            "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}+09:00",
            year, month, day, hours, minutes, seconds
        )
    }
}

fn is_leap_year(year: i32) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

/// Property ID 상수 / Property ID constants
mod property_ids {
    pub const PID_CODEPAGE: u32 = 0x00000001; // Codepage (VT_I2)
    pub const PIDSI_TITLE: u32 = 0x00000002;
    pub const PIDSI_SUBJECT: u32 = 0x00000003;
    pub const PIDSI_AUTHOR: u32 = 0x00000004;
    pub const PIDSI_KEYWORDS: u32 = 0x00000005;
    pub const PIDSI_COMMENTS: u32 = 0x00000006;
    pub const PIDSI_LASTAUTHOR: u32 = 0x00000008;
    pub const PIDSI_REVNUMBER: u32 = 0x00000009;
    pub const PIDSI_LASTPRINTED: u32 = 0x0000000B;
    pub const PIDSI_CREATE_DTM: u32 = 0x0000000C;
    pub const PIDSI_LASTSAVE_DTM: u32 = 0x0000000D;
    pub const PIDSI_PAGECOUNT: u32 = 0x0000000E;
    pub const HWPPIDSI_DATE_STR: u32 = 0x00000014;
    pub const HWPPIDSI_PARACOUNT: u32 = 0x00000015;
}

/// VT (Variant Type) 상수 / VT (Variant Type) constants
/// 내부 사용 전용 / Internal use only
const VT_LPSTR: u32 = 0x001E; // 30 (0x1E) - ANSI string
const VT_LPWSTR: u32 = 0x001F; // 31 (0x1F) - Wide string (UTF-16LE)
const VT_FILETIME: u32 = 0x0040; // 64 (0x40)
const VT_I2: u32 = 0x0002; // 2 (16-bit signed integer, used for codepage)
const VT_I4: u32 = 0x0003; // 3

impl SummaryInformation {
    /// SummaryInformation을 바이트 배열에서 파싱합니다. / Parse SummaryInformation from byte array.
    ///
    /// # Arguments
    /// * `data` - \005HwpSummaryInformation 스트림의 원시 바이트 데이터 / Raw byte data of \005HwpSummaryInformation stream
    ///
    /// # Returns
    /// 파싱된 SummaryInformation 구조체 / Parsed SummaryInformation structure
    ///
    /// # Note
    /// MSDN Property Set 형식을 파싱합니다.
    /// Parses MSDN Property Set format.
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.is_empty() {
            return Ok(SummaryInformation::default());
        }

        let mut result = SummaryInformation::default();

        // MSDN Property Set 형식 파싱 / Parse MSDN Property Set format
        // PropertySetStreamHeader 구조:
        // - ByteOrder (UINT16, 2 bytes)
        // - Version (UINT16, 2 bytes)
        // - SystemIdentifier (UINT32, 4 bytes) - pyhwp 참고
        // - CLSID (16 bytes)
        // - propsetDescList (N_ARRAY, 가변 길이)
        //   - 각 PropertySetDesc: FMTID (16 bytes) + Offset (4 bytes) = 20 bytes
        //   - N_ARRAY는 먼저 개수(UINT32, 4 bytes)를 읽고, 그 다음 항목들을 읽음
        if data.len() < 24 {
            return Err(HwpError::insufficient_data(
                "Property Set header",
                24,
                data.len(),
            ));
        }

        let mut offset = 0;

        // Byte order (2 bytes): 0xFEFF (little-endian) or 0xFFFE (big-endian)
        // MSDN Property Set 형식에서는 두 가지 모두 지원
        // MSDN Property Set format supports both
        // Note: Byte order field is stored as raw bytes, not in a specific endianness
        // 주의: Byte order 필드는 raw 바이트로 저장되며, 특정 엔디언으로 저장되지 않음
        // 0xFEFF (stored as [0xFE, 0xFF]) means little-endian
        // 0xFEFF ([0xFE, 0xFF]로 저장)는 little-endian을 의미
        // 0xFFFE (stored as [0xFF, 0xFE]) means big-endian
        // 0xFFFE ([0xFF, 0xFE]로 저장)는 big-endian을 의미
        let byte_order_bytes = [data[offset], data[offset + 1]];
        // Read as big-endian to get the actual BOM value
        // 실제 BOM 값을 얻기 위해 big-endian으로 읽기
        let byte_order = u16::from_be_bytes(byte_order_bytes);
        let is_big_endian = byte_order == 0xFFFE;

        if byte_order != 0xFEFF && byte_order != 0xFFFE {
            return Err(HwpError::UnexpectedValue {
                field: "Property Set byte order".to_string(),
                expected: "0xFEFF or 0xFFFE".to_string(),
                found: format!("0x{:04X}", byte_order),
            });
        }
        offset += 2;

        // Version (2 bytes): Usually 0x0000
        offset += 2;

        // SystemIdentifier (4 bytes): UINT32 (pyhwp 참고)
        // 실제 데이터를 보면 [5, 1, 2, 0]이 SystemIdentifier인 것 같습니다
        // Looking at actual data, [5, 1, 2, 0] seems to be SystemIdentifier
        offset += 4;

        // CLSID (16 bytes): GUID, skip
        offset += 16;

        // propsetDescList: N_ARRAY이므로 먼저 개수 읽기
        // propsetDescList: N_ARRAY, so read count first
        // N_ARRAY는 counttype (UINT32)로 개수를 읽습니다
        // N_ARRAY reads count using counttype (UINT32)
        if offset + 4 > data.len() {
            return Err(HwpError::insufficient_data(
                "propsetDescList count",
                4,
                data.len() - offset,
            ));
        }
        let num_property_sets = if is_big_endian {
            UINT32::from_be_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ])
        } else {
            UINT32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ])
        };
        offset += 4;

        if num_property_sets == 0 {
            return Ok(result);
        }

        // 첫 번째 PropertySetDesc 읽기 (일반적으로 하나만 있음)
        // Read first PropertySetDesc (usually only one)
        // 각 PropertySetDesc는 FMTID (16 bytes) + Offset (4 bytes) = 20 bytes
        // Each PropertySetDesc is FMTID (16 bytes) + Offset (4 bytes) = 20 bytes
        if offset + 20 > data.len() {
            return Err(HwpError::InsufficientData {
                field: "PropertySetDesc".to_string(),
                expected: offset + 20,
                actual: data.len(),
            });
        }

        // FMTID (16 bytes) 건너뛰기 / Skip FMTID (16 bytes)
        offset += 16;

        // 첫 번째 PropertySetDesc의 offset 읽기
        // Read offset of first PropertySetDesc
        // PropertySetDesc 구조: FMTID (16 bytes) + Offset (4 bytes)
        // PropertySetDesc structure: FMTID (16 bytes) + Offset (4 bytes)
        if offset + 4 > data.len() {
            return Err(HwpError::insufficient_data(
                "PropertySetDesc offset",
                4,
                data.len() - offset,
            ));
        }

        // PropertySetDesc의 offset은 byte order에 따라 읽어야 함
        // PropertySetDesc offset should be read according to byte order
        // 실제 데이터를 보면 offset 44에서 [48, 0, 0, 0] = 0x00000030 = 48 (little-endian)
        // Looking at actual data, at offset 44 we have [48, 0, 0, 0] = 0x00000030 = 48 (little-endian)
        let property_set_offset = if is_big_endian {
            UINT32::from_be_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]) as usize
        } else {
            UINT32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]) as usize
        };

        let property_set_start = property_set_offset;
        if property_set_start >= data.len() {
            return Err(HwpError::UnexpectedValue {
                field: format!("Property Set offset (start={})", property_set_start),
                expected: format!("< {}", data.len()),
                found: property_set_start.to_string(),
            });
        }

        // Property Set Header: Size (4) + NumProperties (4) + Property entries
        if property_set_start + 8 > data.len() {
            return Err(HwpError::insufficient_data(
                "Property Set header",
                8,
                data.len() - property_set_start,
            ));
        }

        // Size (4 bytes): Size of property set (from current offset to end of property set)
        let _property_set_size = if is_big_endian {
            UINT32::from_be_bytes([
                data[property_set_start],
                data[property_set_start + 1],
                data[property_set_start + 2],
                data[property_set_start + 3],
            ]) as usize
        } else {
            UINT32::from_le_bytes([
                data[property_set_start],
                data[property_set_start + 1],
                data[property_set_start + 2],
                data[property_set_start + 3],
            ]) as usize
        };
        let mut offset = property_set_start + 4;

        // NumProperties (4 bytes): Number of properties
        let num_properties = if is_big_endian {
            UINT32::from_be_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ])
        } else {
            UINT32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ])
        };
        offset += 4;

        // Property entries: Each entry is Property ID (4) + Offset (4) = 8 bytes
        let property_entries_start = offset;
        let property_entries_size = (num_properties as usize) * 8;
        if offset + property_entries_size > data.len() {
            return Err(HwpError::InsufficientData {
                field: "property entries".to_string(),
                expected: offset + property_entries_size,
                actual: data.len(),
            });
        }

        // Parse properties: find codepage first, then parse all properties
        // Property 파싱: 먼저 codepage를 찾고, 그 다음 모든 property 파싱
        let mut codepage: u16 = 0xFFFF; // Default: invalid codepage

        for i in 0..num_properties {
            let entry_offset = property_entries_start + (i as usize * 8);

            // Property ID (4 bytes)
            let property_id = if is_big_endian {
                UINT32::from_be_bytes([
                    data[entry_offset],
                    data[entry_offset + 1],
                    data[entry_offset + 2],
                    data[entry_offset + 3],
                ])
            } else {
                UINT32::from_le_bytes([
                    data[entry_offset],
                    data[entry_offset + 1],
                    data[entry_offset + 2],
                    data[entry_offset + 3],
                ])
            };

            // Offset (4 bytes): Offset from Property Set start (Size field)
            let value_offset = if is_big_endian {
                UINT32::from_be_bytes([
                    data[entry_offset + 4],
                    data[entry_offset + 5],
                    data[entry_offset + 6],
                    data[entry_offset + 7],
                ]) as usize
            } else {
                UINT32::from_le_bytes([
                    data[entry_offset + 4],
                    data[entry_offset + 5],
                    data[entry_offset + 6],
                    data[entry_offset + 7],
                ]) as usize
            };

            let value_data_offset = property_set_start + value_offset;
            if value_data_offset >= data.len() {
                continue;
            }

            // Find codepage first
            if property_id == property_ids::PID_CODEPAGE {
                if let Ok(cp) = Self::parse_vt_i2(&data[value_data_offset..], is_big_endian) {
                    codepage = cp as u16;
                }
                continue;
            }

            // Parse property value
            match property_id {
                property_ids::PIDSI_TITLE => {
                    result.title =
                        Self::parse_vt_lpstr(&data[value_data_offset..], is_big_endian, codepage)
                            .ok();
                }
                property_ids::PIDSI_SUBJECT => {
                    result.subject =
                        Self::parse_vt_lpstr(&data[value_data_offset..], is_big_endian, codepage)
                            .ok();
                }
                property_ids::PIDSI_AUTHOR => {
                    result.author =
                        Self::parse_vt_lpstr(&data[value_data_offset..], is_big_endian, codepage)
                            .ok();
                }
                property_ids::PIDSI_KEYWORDS => {
                    result.keywords =
                        Self::parse_vt_lpstr(&data[value_data_offset..], is_big_endian, codepage)
                            .ok();
                }
                property_ids::PIDSI_COMMENTS => {
                    result.comments =
                        Self::parse_vt_lpstr(&data[value_data_offset..], is_big_endian, codepage)
                            .ok();
                }
                property_ids::PIDSI_LASTAUTHOR => {
                    result.last_saved_by =
                        Self::parse_vt_lpstr(&data[value_data_offset..], is_big_endian, codepage)
                            .ok();
                }
                property_ids::PIDSI_REVNUMBER => {
                    result.revision_number =
                        Self::parse_vt_lpstr(&data[value_data_offset..], is_big_endian, codepage)
                            .ok();
                }
                property_ids::PIDSI_LASTPRINTED => {
                    result.last_printed =
                        Self::parse_vt_filetime(&data[value_data_offset..], is_big_endian)
                            .ok()
                            .map(|ft| ft.to_utc9_string());
                }
                property_ids::PIDSI_CREATE_DTM => {
                    result.create_time =
                        Self::parse_vt_filetime(&data[value_data_offset..], is_big_endian)
                            .ok()
                            .map(|ft| ft.to_utc9_string());
                }
                property_ids::PIDSI_LASTSAVE_DTM => {
                    result.last_saved_time =
                        Self::parse_vt_filetime(&data[value_data_offset..], is_big_endian)
                            .ok()
                            .map(|ft| ft.to_utc9_string());
                }
                property_ids::PIDSI_PAGECOUNT => {
                    result.page_count =
                        Self::parse_vt_i4(&data[value_data_offset..], is_big_endian).ok();
                }
                property_ids::HWPPIDSI_DATE_STR => {
                    result.date_string =
                        Self::parse_vt_lpstr(&data[value_data_offset..], is_big_endian, codepage)
                            .ok();
                }
                property_ids::HWPPIDSI_PARACOUNT => {
                    result.para_count =
                        Self::parse_vt_i4(&data[value_data_offset..], is_big_endian).ok();
                }
                _ => {
                    // Unknown property ID, skip
                }
            }
        }

        Ok(result)
    }

    /// VT_I2 파싱 (16-bit signed integer, codepage에 사용) / Parse VT_I2 (16-bit signed integer, used for codepage)
    /// Format: VT type (4 bytes) + Value (2 bytes)
    fn parse_vt_i2(data: &[u8], is_big_endian: bool) -> Result<i16, HwpError> {
        if data.len() < 6 {
            return Err(HwpError::insufficient_data("VT_I2", 6, data.len()));
        }

        // VT type (4 bytes): Should be VT_I2 (0x0002)
        let vt_type = if is_big_endian {
            UINT32::from_be_bytes([data[0], data[1], data[2], data[3]])
        } else {
            UINT32::from_le_bytes([data[0], data[1], data[2], data[3]])
        };
        if vt_type != VT_I2 {
            return Err(HwpError::UnexpectedValue {
                field: "VT_I2 type".to_string(),
                expected: format!("0x{:08X}", VT_I2),
                found: format!("0x{:08X}", vt_type),
            });
        }

        // Value (2 bytes): Signed 16-bit integer
        let value = if is_big_endian {
            i16::from_be_bytes([data[4], data[5]])
        } else {
            i16::from_le_bytes([data[4], data[5]])
        };

        Ok(value)
    }

    /// VT_LPSTR 또는 VT_LPWSTR 파싱 (문자열) / Parse VT_LPSTR or VT_LPWSTR (string)
    /// Format: VT type (4 bytes) + Length (4 bytes) + String (null-terminated)
    /// codepage에 따라 적절한 인코딩으로 디코딩 / Decode using appropriate encoding based on codepage
    fn parse_vt_lpstr(data: &[u8], is_big_endian: bool, codepage: u16) -> Result<String, HwpError> {
        if data.len() < 8 {
            return Err(HwpError::insufficient_data(
                "VT_LPSTR/VT_LPWSTR",
                8,
                data.len(),
            ));
        }

        // VT type (4 bytes): Should be VT_LPSTR (0x001E) or VT_LPWSTR (0x001F)
        let vt_type = if is_big_endian {
            UINT32::from_be_bytes([data[0], data[1], data[2], data[3]])
        } else {
            UINT32::from_le_bytes([data[0], data[1], data[2], data[3]])
        };

        // VT_LPWSTR (wide string) 처리
        if vt_type == VT_LPWSTR {
            return Self::parse_vt_lpwstr(data, is_big_endian);
        }

        if vt_type != VT_LPSTR {
            return Err(HwpError::UnexpectedValue {
                field: "VT_LPSTR/VT_LPWSTR type".to_string(),
                expected: format!("0x{:08X} or 0x{:08X}", VT_LPSTR, VT_LPWSTR),
                found: format!("0x{:08X}", vt_type),
            });
        }

        // Length (4 bytes): String length in bytes (including null terminator)
        // hwplib의 CodePageString처럼 size만큼 읽음
        let size = if is_big_endian {
            UINT32::from_be_bytes([data[4], data[5], data[6], data[7]]) as usize
        } else {
            UINT32::from_le_bytes([data[4], data[5], data[6], data[7]]) as usize
        };

        if data.len() < 8 + size {
            return Err(HwpError::InsufficientData {
                field: "VT_LPSTR string".to_string(),
                expected: 8 + size,
                actual: data.len(),
            });
        }

        // String data: size만큼 읽음 (hwplib의 CodePageString처럼)
        let string_data = &data[8..8 + size];

        // Decode string based on codepage
        // codepage에 따라 적절한 인코딩으로 디코딩
        Self::decode_string_by_codepage(string_data, codepage).map_err(|e| {
            HwpError::EncodingError {
                reason: format!(
                    "Failed to decode VT_LPSTR string with codepage {}: {}",
                    codepage, e
                ),
            }
        })
    }

    /// VT_FILETIME 파싱 (날짜/시간) / Parse VT_FILETIME (date/time)
    /// Format: VT type (4 bytes) + FILETIME (8 bytes: low 4 bytes + high 4 bytes)
    fn parse_vt_filetime(data: &[u8], is_big_endian: bool) -> Result<FileTime, HwpError> {
        if data.len() < 12 {
            return Err(HwpError::insufficient_data("VT_FILETIME", 12, data.len()));
        }

        // VT type (4 bytes): Should be VT_FILETIME (0x0040)
        let vt_type = if is_big_endian {
            UINT32::from_be_bytes([data[0], data[1], data[2], data[3]])
        } else {
            UINT32::from_le_bytes([data[0], data[1], data[2], data[3]])
        };
        if vt_type != VT_FILETIME {
            return Err(HwpError::UnexpectedValue {
                field: "VT_FILETIME type".to_string(),
                expected: format!("0x{:08X}", VT_FILETIME),
                found: format!("0x{:08X}", vt_type),
            });
        }

        // FILETIME: Low 32 bits (4 bytes) + High 32 bits (4 bytes)
        let low = if is_big_endian {
            UINT32::from_be_bytes([data[4], data[5], data[6], data[7]])
        } else {
            UINT32::from_le_bytes([data[4], data[5], data[6], data[7]])
        };
        let high = if is_big_endian {
            UINT32::from_be_bytes([data[8], data[9], data[10], data[11]])
        } else {
            UINT32::from_le_bytes([data[8], data[9], data[10], data[11]])
        };

        Ok(FileTime { low, high })
    }

    /// VT_LPWSTR 파싱 (Wide string, UTF-16LE) / Parse VT_LPWSTR (Wide string, UTF-16LE)
    /// Format: VT type (4 bytes) + Length (4 bytes, character count) + String (UTF-16LE, null-terminated)
    /// hwplib의 UnicodeString 구현 참고
    fn parse_vt_lpwstr(data: &[u8], is_big_endian: bool) -> Result<String, HwpError> {
        if data.len() < 8 {
            return Err(HwpError::insufficient_data("VT_LPWSTR", 8, data.len()));
        }

        // VT type (4 bytes): Should be VT_LPWSTR (0x001F)
        let vt_type = if is_big_endian {
            UINT32::from_be_bytes([data[0], data[1], data[2], data[3]])
        } else {
            UINT32::from_le_bytes([data[0], data[1], data[2], data[3]])
        };
        if vt_type != VT_LPWSTR {
            return Err(HwpError::UnexpectedValue {
                field: "VT_LPWSTR type".to_string(),
                expected: format!("0x{:08X}", VT_LPWSTR),
                found: format!("0x{:08X}", vt_type),
            });
        }

        // Length (4 bytes): Character count (not byte count)
        // hwplib의 UnicodeString처럼 character count를 읽음
        let char_count = if is_big_endian {
            UINT32::from_be_bytes([data[4], data[5], data[6], data[7]]) as usize
        } else {
            UINT32::from_le_bytes([data[4], data[5], data[6], data[7]]) as usize
        };

        if char_count == 0 {
            return Ok(String::new());
        }

        // UTF-16LE: 각 character는 2 bytes
        let byte_count = char_count * 2;
        if data.len() < 8 + byte_count {
            return Err(HwpError::InsufficientData {
                field: "VT_LPWSTR string".to_string(),
                expected: 8 + byte_count,
                actual: data.len(),
            });
        }

        // String data: UTF-16LE bytes
        // hwplib의 UnicodeString처럼 length * 2 바이트를 읽음
        let string_bytes = &data[8..8 + byte_count];

        // UTF-16LE 디코딩 (hwplib의 StringUtil.getFromUnicodeLE처럼)
        let mut chars = Vec::new();
        for i in (0..string_bytes.len()).step_by(2) {
            if i + 1 < string_bytes.len() {
                let code_point = u16::from_le_bytes([string_bytes[i], string_bytes[i + 1]]);
                if code_point == 0 {
                    break; // null terminator
                }
                if let Some(ch) = char::from_u32(code_point as u32) {
                    chars.push(ch);
                }
            }
        }

        Ok(chars.into_iter().collect())
    }

    /// Codepage에 따라 문자열 디코딩 / Decode string based on codepage
    /// hwplib의 CodePageString.getJavaValue() 로직 참고
    fn decode_string_by_codepage(data: &[u8], codepage: u16) -> Result<String, HwpError> {
        use encoding_rs::*;

        if data.is_empty() {
            return Ok(String::new());
        }

        // Codepage 상수 (hwplib 참고)
        const CP_UTF16: u16 = 1200;
        const CP_UTF16_BE: u16 = 1201;
        const CP_UTF8: u16 = 65001;
        const CP_MS949: u16 = 949;
        const CP_WINDOWS_1252: u16 = 1252;

        // hwplib처럼 codepage가 -1 (0xFFFF)이면 기본 인코딩 사용
        let result = if codepage == 0xFFFF {
            // Default: try UTF-8, fallback to Windows-1252
            String::from_utf8(data.to_vec())
                .unwrap_or_else(|_| WINDOWS_1252.decode(data).0.to_string())
        } else {
            match codepage {
                CP_UTF16 => {
                    let mut chars = Vec::new();
                    for i in (0..data.len()).step_by(2) {
                        if i + 1 < data.len() {
                            let code_point = u16::from_le_bytes([data[i], data[i + 1]]);
                            if let Some(ch) = char::from_u32(code_point as u32) {
                                if ch != '\0' {
                                    chars.push(ch);
                                }
                            }
                        }
                    }
                    chars.into_iter().collect()
                }
                CP_UTF16_BE => {
                    let mut chars = Vec::new();
                    for i in (0..data.len()).step_by(2) {
                        if i + 1 < data.len() {
                            let code_point = u16::from_be_bytes([data[i], data[i + 1]]);
                            if let Some(ch) = char::from_u32(code_point as u32) {
                                if ch != '\0' {
                                    chars.push(ch);
                                }
                            }
                        }
                    }
                    chars.into_iter().collect()
                }
                CP_UTF8 => {
                    String::from_utf8(data.to_vec()).map_err(|e| HwpError::EncodingError {
                        reason: format!("UTF-8 decode error: {}", e),
                    })?
                }
                CP_MS949 => EUC_KR.decode(data).0.to_string(),
                CP_WINDOWS_1252 => WINDOWS_1252.decode(data).0.to_string(),
                _ => {
                    // Unknown codepage: try UTF-8, fallback to Windows-1252
                    String::from_utf8(data.to_vec())
                        .unwrap_or_else(|_| WINDOWS_1252.decode(data).0.to_string())
                }
            }
        };

        // Remove null terminator (hwplib의 CodePageString.getJavaValue처럼)
        // hwplib는 null terminator를 찾아서 substring(0, terminator)를 반환
        let terminator = result.find('\0');
        if let Some(pos) = terminator {
            Ok(result[..pos].to_string())
        } else {
            Ok(result)
        }
    }

    /// VT_I4 파싱 (32-bit signed integer) / Parse VT_I4 (32-bit signed integer)
    /// Format: VT type (4 bytes) + Value (4 bytes)
    fn parse_vt_i4(data: &[u8], is_big_endian: bool) -> Result<INT32, HwpError> {
        if data.len() < 8 {
            return Err(HwpError::insufficient_data("VT_I4", 8, data.len()));
        }

        // VT type (4 bytes): Should be VT_I4 (0x0003)
        let vt_type = if is_big_endian {
            UINT32::from_be_bytes([data[0], data[1], data[2], data[3]])
        } else {
            UINT32::from_le_bytes([data[0], data[1], data[2], data[3]])
        };
        if vt_type != VT_I4 {
            return Err(HwpError::UnexpectedValue {
                field: "VT_I4 type".to_string(),
                expected: format!("0x{:08X}", VT_I4),
                found: format!("0x{:08X}", vt_type),
            });
        }

        // Value (4 bytes): Signed 32-bit integer
        let value = if is_big_endian {
            INT32::from_be_bytes([data[4], data[5], data[6], data[7]])
        } else {
            INT32::from_le_bytes([data[4], data[5], data[6], data[7]])
        };

        Ok(value)
    }
}
