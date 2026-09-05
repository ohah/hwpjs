/// ID Mappings 구조체 / ID Mappings structure
///
/// 스펙 문서 매핑: 표 15 - 아이디 매핑 헤더 / Spec mapping: Table 15 - ID mappings header
/// Tag ID: HWPTAG_ID_MAPPINGS
/// 전체 길이: 72 바이트 (18개 INT32) / Total length: 72 bytes (18 INT32 values)
use crate::error::HwpError;
use crate::types::INT32;
use serde::{Deserialize, Serialize};

/// ID Mappings 구조체 / ID Mappings structure
///
/// 스펙 문서 표 15에 따르면, 각 필드는 해당 타입의 레코드 개수를 나타냅니다.
/// According to spec document Table 15, each field represents the count of records of the corresponding type.
///
/// 스펙 문서 매핑: 표 15 - 아이디 매핑 헤더, 표 16 - 아이디 매핑 개수 인덱스
/// Spec mapping: Table 15 - ID mappings header, Table 16 - ID mapping count indices
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdMappings {
    /// 바이너리 데이터 개수 (HWPTAG_BIN_DATA 레코드 개수, 표 16 인덱스 0) / Binary data count (HWPTAG_BIN_DATA record count, Table 16 index 0)
    pub binary_data: INT32,
    /// 한글 글꼴 개수 (HWPTAG_FACE_NAME 레코드 개수, 표 16 인덱스 1) / Korean font count (HWPTAG_FACE_NAME record count, Table 16 index 1)
    pub font_korean: INT32,
    /// 영어 글꼴 개수 (HWPTAG_FACE_NAME 레코드 개수, 표 16 인덱스 2) / English font count (HWPTAG_FACE_NAME record count, Table 16 index 2)
    pub font_english: INT32,
    /// 한자 글꼴 개수 (HWPTAG_FACE_NAME 레코드 개수, 표 16 인덱스 3) / Chinese font count (HWPTAG_FACE_NAME record count, Table 16 index 3)
    pub font_chinese: INT32,
    /// 일어 글꼴 개수 (HWPTAG_FACE_NAME 레코드 개수, 표 16 인덱스 4) / Japanese font count (HWPTAG_FACE_NAME record count, Table 16 index 4)
    pub font_japanese: INT32,
    /// 기타 글꼴 개수 (HWPTAG_FACE_NAME 레코드 개수, 표 16 인덱스 5) / Other font count (HWPTAG_FACE_NAME record count, Table 16 index 5)
    pub font_other: INT32,
    /// 기호 글꼴 개수 (HWPTAG_FACE_NAME 레코드 개수, 표 16 인덱스 6) / Symbol font count (HWPTAG_FACE_NAME record count, Table 16 index 6)
    pub font_symbol: INT32,
    /// 사용자 글꼴 개수 (HWPTAG_FACE_NAME 레코드 개수, 표 16 인덱스 7) / User font count (HWPTAG_FACE_NAME record count, Table 16 index 7)
    pub font_user: INT32,
    /// 테두리/배경 개수 (HWPTAG_BORDER_FILL 레코드 배열 크기, 표 16 인덱스 8) / Border/fill count (HWPTAG_BORDER_FILL record array size, Table 16 index 8)
    pub border_fill: INT32,
    /// 글자 모양 개수 (HWPTAG_CHAR_SHAPE 레코드 배열 크기, 표 16 인덱스 9) / Character shape count (HWPTAG_CHAR_SHAPE record array size, Table 16 index 9)
    pub char_shape: INT32,
    /// 탭 정의 개수 (HWPTAG_TAB_DEF 레코드 배열 크기, 표 16 인덱스 10) / Tab definition count (HWPTAG_TAB_DEF record array size, Table 16 index 10)
    pub tab_def: INT32,
    /// 문단 번호 개수 (HWPTAG_NUMBERING 레코드 배열 크기, 표 16 인덱스 11) / Paragraph numbering count (HWPTAG_NUMBERING record array size, Table 16 index 11)
    pub paragraph_numbering: INT32,
    /// 글머리표 개수 (HWPTAG_BULLET 레코드 배열 크기, 표 16 인덱스 12) / Bullet count (HWPTAG_BULLET record array size, Table 16 index 12)
    pub bullet: INT32,
    /// 문단 모양 개수 (HWPTAG_PARA_SHAPE 레코드 배열 크기, 표 16 인덱스 13) / Paragraph shape count (HWPTAG_PARA_SHAPE record array size, Table 16 index 13)
    pub paragraph_shape: INT32,
    /// 스타일 개수 (HWPTAG_STYLE 레코드 배열 크기, 표 16 인덱스 14) / Style count (HWPTAG_STYLE record array size, Table 16 index 14)
    pub style: INT32,
    /// 메모 모양 개수 (5.0.2.1 이상, 표 16 인덱스 15) / Memo shape count (5.0.2.1 and above, Table 16 index 15)
    pub memo_shape: Option<INT32>,
    /// 변경추적 개수 (5.0.3.2 이상, 표 16 인덱스 16) / Track change count (5.0.3.2 and above, Table 16 index 16)
    pub track_change: Option<INT32>,
    /// 변경추적 사용자 개수 (5.0.3.2 이상, 표 16 인덱스 17) / Track change author count (5.0.3.2 and above, Table 16 index 17)
    pub track_change_author: Option<INT32>,
}

impl IdMappings {
    /// IdMappings를 바이트 배열에서 파싱합니다. / Parse IdMappings from byte array.
    ///
    /// # Arguments
    /// * `data` - 최소 72바이트의 데이터 (18개 INT32) / At least 72 bytes of data (18 INT32 values)
    /// * `version` - FileHeader의 version (버전에 따라 필드 개수가 다를 수 있음) / FileHeader version (field count may vary by version)
    ///
    /// # Returns
    /// 파싱된 IdMappings 구조체 / Parsed IdMappings structure
    pub fn parse(data: &[u8], _version: u32) -> Result<Self, HwpError> {
        // 최소 60바이트 (15개 INT32) 필요 / Need at least 60 bytes (15 INT32 values)
        if data.len() < 60 {
            return Err(HwpError::insufficient_data("IdMappings", 60, data.len()));
        }

        let mut offset = 0;

        // INT32 배열 읽기 (각 4바이트) / Read INT32 array (4 bytes each)
        let read_int32 = |offset: &mut usize| -> INT32 {
            let value = INT32::from_le_bytes([
                data[*offset],
                data[*offset + 1],
                data[*offset + 2],
                data[*offset + 3],
            ]);
            *offset += 4;
            value
        };

        // 기본 15개 필드 (60바이트) / Basic 15 fields (60 bytes)
        let binary_data = read_int32(&mut offset);
        let font_korean = read_int32(&mut offset);
        let font_english = read_int32(&mut offset);
        let font_chinese = read_int32(&mut offset);
        let font_japanese = read_int32(&mut offset);
        let font_other = read_int32(&mut offset);
        let font_symbol = read_int32(&mut offset);
        let font_user = read_int32(&mut offset);
        let border_fill = read_int32(&mut offset);
        let char_shape = read_int32(&mut offset);
        let tab_def = read_int32(&mut offset);
        let paragraph_numbering = read_int32(&mut offset);
        let bullet = read_int32(&mut offset);
        let paragraph_shape = read_int32(&mut offset);
        let style = read_int32(&mut offset);

        // 버전에 따른 선택적 필드 / Optional fields based on version
        // 레거시 코드 기준: version >= 5017일 때 메모 모양 추가 / Legacy code: memo shape added when version >= 5017
        // 스펙 문서: 5.0.2.1 이상 / Spec document: 5.0.2.1 and above
        // 데이터 크기로 판단: 64바이트 이상이면 메모 모양 필드 존재 / Determine by data size: memo shape field exists if 64 bytes or more
        let memo_shape = if data.len() >= 64 && offset + 4 <= data.len() {
            Some(read_int32(&mut offset))
        } else {
            None
        };

        // 변경추적: 레거시 코드 기준 version >= 5032 / Track change: legacy code version >= 5032
        // 스펙 문서: 5.0.3.2 이상 / Spec document: 5.0.3.2 and above
        // 데이터 크기로 판단: 68바이트 이상이면 변경추적 필드 존재 / Determine by data size: track change field exists if 68 bytes or more
        let track_change = if data.len() >= 68 && offset + 4 <= data.len() {
            Some(read_int32(&mut offset))
        } else {
            None
        };

        // 변경추적 사용자: 레거시 코드 기준 version >= 5032 / Track change author: legacy code version >= 5032
        // 데이터 크기로 판단: 72바이트 이상이면 변경추적 사용자 필드 존재 / Determine by data size: track change author field exists if 72 bytes or more
        let track_change_author = if data.len() >= 72 && offset + 4 <= data.len() {
            Some(read_int32(&mut offset))
        } else {
            None
        };

        Ok(IdMappings {
            binary_data,
            font_korean,
            font_english,
            font_chinese,
            font_japanese,
            font_other,
            font_symbol,
            font_user,
            border_fill,
            char_shape,
            tab_def,
            paragraph_numbering,
            bullet,
            paragraph_shape,
            style,
            memo_shape,
            track_change,
            track_change_author,
        })
    }
}
