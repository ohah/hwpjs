/// DocData 구조체 / DocData structure
///
/// 스펙 문서 매핑: 표 49 - 문서 임의의 데이터 / Spec mapping: Table 49 - Document arbitrary data
use crate::error::HwpError;
use crate::types::{decode_utf16le, INT16, INT32, INT8, UINT16, UINT32, UINT8, WORD};
use serde::{Deserialize, Serialize};

/// 문서 임의의 데이터 (표 49) / Document arbitrary data (Table 49)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocData {
    /// 파라미터 셋 (표 50 참조) / Parameter set (see Table 50)
    pub parameter_set: ParameterSet,
}

/// 파라미터 셋 (표 50) / Parameter set (Table 50)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterSet {
    /// 파라미터 셋 ID / Parameter set ID
    pub set_id: WORD,
    /// 파라미터 셋에 존재하는 아이템 개수 / Number of items in parameter set
    pub item_count: INT16,
    /// 파라미터 아이템 리스트 / Parameter item list
    pub items: Vec<ParameterItem>,
}

/// 파라미터 아이템 (표 51) / Parameter item (Table 51)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterItem {
    /// 파라미터 아이템 ID / Parameter item ID
    pub id: WORD,
    /// 파라미터 아이템 종류 (표 52 참조) / Parameter item type (see Table 52)
    pub item_type: ParameterItemType,
    /// 파라미터 아이템 데이터 / Parameter item data
    pub data: ParameterItemData,
}

/// 파라미터 아이템 종류 (표 52) / Parameter item type (Table 52)
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParameterItemType {
    /// NULL / NULL
    Null,
    /// 문자열 / String
    Bstr,
    /// INT8 / INT8
    I1,
    /// INT16 / INT16
    I2,
    /// INT32 / INT32
    I4,
    /// INT / INT
    I,
    /// UINT8 / UINT8
    Ui1,
    /// UINT16 / UINT16
    Ui2,
    /// UINT32 / UINT32
    Ui4,
    /// UINT / UINT
    Ui,
    /// 파라미터 셋 / Parameter set
    Set,
    /// 파라미터 셋 배열 / Parameter set array
    Array,
    /// 바이너리 데이터 ID / Binary data ID
    Bindata,
}

/// 파라미터 아이템 데이터 / Parameter item data
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ParameterItemData {
    /// NULL / NULL
    Null,
    /// 문자열 / String
    Bstr(String),
    /// INT8 / INT8
    I1(INT8),
    /// INT16 / INT16
    I2(INT16),
    /// INT32 / INT32
    I4(INT32),
    /// INT / INT
    I(INT8),
    /// UINT8 / UINT8
    Ui1(UINT8),
    /// UINT16 / UINT16
    Ui2(UINT16),
    /// UINT32 / UINT32
    Ui4(UINT32),
    /// UINT / UINT
    Ui(UINT8),
    /// 파라미터 셋 / Parameter set
    Set(ParameterSet),
    /// 파라미터 셋 배열 / Parameter set array
    Array(Vec<ParameterSet>),
    /// 바이너리 데이터 ID / Binary data ID
    Bindata(UINT16),
}

impl DocData {
    /// DocData를 바이트 배열에서 파싱합니다. / Parse DocData from byte array.
    ///
    /// # Arguments
    /// * `data` - DocData 데이터 / DocData data
    ///
    /// # Returns
    /// 파싱된 DocData 구조체 / Parsed DocData structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.is_empty() {
            return Err(HwpError::InsufficientData {
                field: "DocData data".to_string(),
                expected: 1,
                actual: 0,
            });
        }

        // 파라미터 셋 파싱 (표 50) / Parse parameter set (Table 50)
        let parameter_set = ParameterSet::parse(data)?;

        Ok(DocData { parameter_set })
    }
}

impl ParameterSet {
    /// ParameterSet을 바이트 배열에서 파싱합니다. / Parse ParameterSet from byte array.
    ///
    /// # Arguments
    /// * `data` - ParameterSet 데이터 / ParameterSet data
    ///
    /// # Returns
    /// 파싱된 ParameterSet 구조체 / Parsed ParameterSet structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        if data.len() < 4 {
            return Err(HwpError::insufficient_data("ParameterSet", 4, data.len()));
        }

        let mut offset = 0;

        // WORD 파라미터 셋 ID / WORD parameter set ID
        let set_id = WORD::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // INT16 파라미터 셋에 존재하는 아이템 개수 / INT16 number of items in parameter set
        let item_count = INT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // 파라미터 아이템 파싱 / Parse parameter items
        let mut items = Vec::new();
        let mut current_offset = offset;

        for _ in 0..item_count {
            if current_offset >= data.len() {
                break; // 데이터가 부족할 수 있음 / Data may be insufficient
            }

            match ParameterItem::parse(&data[current_offset..]) {
                Ok((item, item_size)) => {
                    items.push(item);
                    current_offset += item_size;
                }
                Err(e) => {
                    // 파싱 실패 시 경고하고 계속 진행 / Warn and continue on parse failure
                    // 알 수 없는 타입의 경우 ParameterItem::parse에서 이미 처리하므로 여기 도달하지 않아야 함
                    // Continue on parse error with warning
                    // Unknown types should be handled in ParameterItem::parse, so this shouldn't be reached
                    #[cfg(debug_assertions)]
                    eprintln!("Failed to parse parameter item: {}", e);
                    // 에러가 발생한 경우 최소한 id와 item_type(4바이트)는 건너뛰고 계속 진행
                    // On error, skip at least id and item_type (4 bytes) and continue
                    if current_offset + 4 <= data.len() {
                        current_offset += 4;
                    } else {
                        break;
                    }
                }
            }
        }

        Ok(ParameterSet {
            set_id,
            item_count,
            items,
        })
    }
}

impl ParameterItem {
    /// ParameterItem을 바이트 배열에서 파싱합니다. / Parse ParameterItem from byte array.
    ///
    /// # Arguments
    /// * `data` - ParameterItem 데이터 / ParameterItem data
    ///
    /// # Returns
    /// 파싱된 ParameterItem과 사용된 바이트 수 / Parsed ParameterItem and bytes consumed
    pub fn parse(data: &[u8]) -> Result<(Self, usize), HwpError> {
        if data.len() < 4 {
            return Err(HwpError::insufficient_data("ParameterItem", 4, data.len()));
        }

        let mut offset = 0;

        // WORD 파라미터 아이템 ID / WORD parameter item ID
        let id = WORD::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // WORD 파라미터 아이템 종류 (표 52 참조) / WORD parameter item type (see Table 52)
        let item_type_value = WORD::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        let item_type = match item_type_value {
            0 => ParameterItemType::Null,
            1 => ParameterItemType::Bstr,
            2 => ParameterItemType::I1,
            3 => ParameterItemType::I2,
            4 => ParameterItemType::I4,
            5 => ParameterItemType::I,
            6 => ParameterItemType::Ui1,
            7 => ParameterItemType::Ui2,
            8 => ParameterItemType::Ui4,
            9 => ParameterItemType::Ui,
            0x8000 => ParameterItemType::Set,
            0x8001 => ParameterItemType::Array,
            0x8002 => ParameterItemType::Bindata,
            _ => {
                // 스펙 문서(표 52)에 명시되지 않은 알 수 없는 타입
                // Unknown type not specified in spec (Table 52)
                //
                // 이유: 스펙 문서 표 52에는 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0x8000, 0x8001, 0x8002만 정의되어 있음
                // Reason: Spec document Table 52 only defines 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0x8000, 0x8001, 0x8002
                //
                // 실제 파일에서 발견된 타입(예: 519 = 0x0207)은 스펙 문서에 없으므로
                // 데이터 크기를 알 수 없어 파싱할 수 없음
                // Types found in actual files (e.g., 519 = 0x0207) are not in spec,
                // so we cannot determine data size and cannot parse
                //
                // 별도 처리: 알 수 없는 타입의 경우 id와 item_type만 저장하고 데이터는 건너뜀
                // Special handling: For unknown types, only save id and item_type, skip data
                #[cfg(debug_assertions)]
                eprintln!(
                    "Warning: Unknown parameter item type: {} (0x{:04x}) - not in spec Table 52, skipping data",
                    item_type_value, item_type_value
                );
                // 알 수 없는 타입의 경우 데이터 크기를 알 수 없으므로, id와 item_type만 반환
                // For unknown types, we can't determine data size, so return only id and item_type
                return Ok((
                    ParameterItem {
                        id,
                        item_type: ParameterItemType::Null, // 알 수 없는 타입이므로 Null로 표시 / Mark as Null for unknown type
                        data: ParameterItemData::Null,
                    },
                    4, // id(2) + item_type(2)만 사용 / Only id(2) + item_type(2) consumed
                ));
            }
        };

        // 파라미터 아이템 데이터 파싱 / Parse parameter item data
        let (data_value, data_size) = parse_parameter_item_data(&data[offset..], item_type)
            .map_err(|e| HwpError::from(e))?;
        offset += data_size;

        Ok((
            ParameterItem {
                id,
                item_type,
                data: data_value,
            },
            offset,
        ))
    }
}

/// 파라미터 아이템 데이터 파싱 / Parse parameter item data
fn parse_parameter_item_data(
    data: &[u8],
    item_type: ParameterItemType,
) -> Result<(ParameterItemData, usize), HwpError> {
    match item_type {
        ParameterItemType::Null => {
            // PIT_NULL: UINT | NULL
            // 스펙 문서: "UINT | NULL" - NULL이므로 데이터 없음
            // Spec: "UINT | NULL" - no data for NULL
            Ok((ParameterItemData::Null, 0))
        }
        ParameterItemType::Bstr => {
            // PIT_BSTR: WORD 문자열 길이(slen) + WCHAR array[len]
            // 스펙 문서: "WORD | 문자열 길이(slen)" + "WCHAR array[len]"
            // Spec: "WORD | string length(slen)" + "WCHAR array[len]"
            if data.len() < 2 {
                return Err(HwpError::insufficient_data("BSTR length", 2, data.len()));
            }
            let string_len = WORD::from_le_bytes([data[0], data[1]]) as usize;
            let total_size = 2 + (string_len * 2); // WORD(2) + WCHAR array
            if data.len() < total_size {
                return Err(HwpError::InsufficientData {
                    field: "BSTR data".to_string(),
                    expected: total_size,
                    actual: data.len(),
                });
            }
            let string_bytes = &data[2..total_size];
            let string = decode_utf16le(string_bytes)
                .map_err(|e| HwpError::EncodingError {
                    reason: format!("Failed to decode BSTR: {}", e),
                })?;
            Ok((ParameterItemData::Bstr(string), total_size))
        }
        ParameterItemType::I1 => {
            // PIT_I1: INT8 / PIT_I1: INT8
            if data.len() < 1 {
                return Err(HwpError::insufficient_data("I1", 1, data.len()));
            }
            Ok((ParameterItemData::I1(INT8::from_le_bytes([data[0]])), 1))
        }
        ParameterItemType::I2 => {
            // PIT_I2: INT16 / PIT_I2: INT16
            if data.len() < 2 {
                return Err(HwpError::insufficient_data("I2", 2, data.len()));
            }
            Ok((
                ParameterItemData::I2(INT16::from_le_bytes([data[0], data[1]])),
                2,
            ))
        }
        ParameterItemType::I4 => {
            // PIT_I4: INT32 / PIT_I4: INT32
            if data.len() < 4 {
                return Err(HwpError::insufficient_data("I4", 4, data.len()));
            }
            Ok((
                ParameterItemData::I4(INT32::from_le_bytes([data[0], data[1], data[2], data[3]])),
                4,
            ))
        }
        ParameterItemType::I => {
            // PIT_I: INT8 / PIT_I: INT8
            if data.len() < 1 {
                return Err(HwpError::insufficient_data("I", 1, data.len()));
            }
            Ok((ParameterItemData::I(INT8::from_le_bytes([data[0]])), 1))
        }
        ParameterItemType::Ui1 => {
            // PIT_UI1: UINT8 / PIT_UI1: UINT8
            if data.len() < 1 {
                return Err(HwpError::insufficient_data("UI1", 1, data.len()));
            }
            Ok((ParameterItemData::Ui1(UINT8::from_le_bytes([data[0]])), 1))
        }
        ParameterItemType::Ui2 => {
            // PIT_UI2: UINT16 / PIT_UI2: UINT16
            if data.len() < 2 {
                return Err(HwpError::insufficient_data("UI2", 2, data.len()));
            }
            Ok((
                ParameterItemData::Ui2(UINT16::from_le_bytes([data[0], data[1]])),
                2,
            ))
        }
        ParameterItemType::Ui4 => {
            // PIT_UI4: UINT32 / PIT_UI4: UINT32
            if data.len() < 4 {
                return Err(HwpError::insufficient_data("UI4", 4, data.len()));
            }
            Ok((
                ParameterItemData::Ui4(UINT32::from_le_bytes([data[0], data[1], data[2], data[3]])),
                4,
            ))
        }
        ParameterItemType::Ui => {
            // PIT_UI: UINT8 / PIT_UI: UINT8
            if data.len() < 1 {
                return Err(HwpError::insufficient_data("UI", 1, data.len()));
            }
            Ok((ParameterItemData::Ui(UINT8::from_le_bytes([data[0]])), 1))
        }
        ParameterItemType::Set => {
            // PIT_SET: Parameter Set / PIT_SET: Parameter Set
            // 재귀적으로 파싱 / Parse recursively
            let parameter_set = ParameterSet::parse(data)
                .map_err(|e| HwpError::from(e))?;
            // 사용된 바이트 수 계산 (대략적으로) / Calculate bytes consumed (approximately)
            let size = 4 + parameter_set.items.iter().map(|_| 4).sum::<usize>(); // 최소 크기 / Minimum size
            Ok((ParameterItemData::Set(parameter_set), size))
        }
        ParameterItemType::Array => {
            // PIT_ARRAY: ParameterArray / PIT_ARRAY: ParameterArray
            // INT16 파라미터 셋 개수 + Parameter Set 배열 / INT16 parameter set count + Parameter Set array
            if data.len() < 2 {
                return Err(HwpError::insufficient_data("Array count", 2, data.len()));
            }
            let array_count = INT16::from_le_bytes([data[0], data[1]]) as usize;
            let mut offset = 2;
            let mut parameter_sets = Vec::new();

            for _ in 0..array_count {
                if offset >= data.len() {
                    break;
                }
                match ParameterSet::parse(&data[offset..]) {
                    Ok(set) => {
                        // 대략적인 크기 계산 / Approximate size calculation
                        let set_size = 4 + set.items.len() * 4;
                        offset += set_size;
                        parameter_sets.push(set);
                    }
                    Err(e) => {
                        #[cfg(debug_assertions)]
                        eprintln!("Failed to parse parameter set in array: {}", e);
                        break;
                    }
                }
            }

            Ok((ParameterItemData::Array(parameter_sets), offset))
        }
        ParameterItemType::Bindata => {
            // PIT_BINDATA: UINT16 바이너리 데이터 ID / PIT_BINDATA: UINT16 binary data ID
            if data.len() < 2 {
                return Err(HwpError::insufficient_data("Bindata", 2, data.len()));
            }
            Ok((
                ParameterItemData::Bindata(UINT16::from_le_bytes([data[0], data[1]])),
                2,
            ))
        }
    }
}
