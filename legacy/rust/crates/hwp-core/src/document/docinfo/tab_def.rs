/// Tab Definition 구조체 / Tab Definition structure
///
/// 스펙 문서 매핑: 표 36 - 탭 정의 / Spec mapping: Table 36 - Tab definition
/// Tag ID: HWPTAG_TAB_DEF
/// 전체 길이: 가변 (8 + 8×count 바이트) / Total length: variable (8 + 8×count bytes)
use crate::error::HwpError;
use crate::types::{HWPUNIT, INT16, UINT32, UINT8};
use serde::{Deserialize, Serialize};

/// 탭 종류 / Tab type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TabType {
    /// 왼쪽 / Left
    Left = 0,
    /// 오른쪽 / Right
    Right = 1,
    /// 가운데 / Center
    Center = 2,
    /// 소수점 / Decimal
    Decimal = 3,
}

impl TabType {
    /// UINT8 값에서 TabType 생성 / Create TabType from UINT8 value
    fn from_byte(value: UINT8) -> Self {
        match value {
            1 => TabType::Right,
            2 => TabType::Center,
            3 => TabType::Decimal,
            _ => TabType::Left,
        }
    }
}

/// 탭 정의 속성 / Tab definition attributes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabDefAttributes {
    /// 문단 왼쪽 끝 자동 탭(내어 쓰기용 자동 탭) 유무 / Auto tab at paragraph left edge (hanging indent)
    pub has_left_auto_tab: bool,
    /// 문단 오른쪽 끝 자동 탭 유무 / Auto tab at paragraph right edge
    pub has_right_auto_tab: bool,
}

/// 탭 항목 / Tab item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabItem {
    /// 탭의 위치 / Tab position
    pub position: HWPUNIT,
    /// 탭의 종류 / Tab type
    pub tab_type: TabType,
    /// 채움 종류 (표 25 참조) / Fill type (Table 25)
    pub fill_type: UINT8,
}

/// Tab Definition 구조체 / Tab Definition structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabDef {
    /// 속성 (표 37) / Attributes (Table 37)
    pub attributes: TabDefAttributes,
    /// 탭 개수 / Tab count
    pub count: INT16,
    /// 탭 항목 목록 / Tab items list
    pub tabs: Vec<TabItem>,
}

impl TabDef {
    /// TabDef를 바이트 배열에서 파싱합니다. / Parse TabDef from byte array.
    ///
    /// # Arguments
    /// * `data` - TabDef 레코드 데이터 / TabDef record data
    ///
    /// # Returns
    /// 파싱된 TabDef 구조체 / Parsed TabDef structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        // 최소 6바이트 필요 (속성 4바이트 + count 2바이트) / Need at least 6 bytes (attributes 4 bytes + count 2 bytes)
        if data.len() < 6 {
            return Err(HwpError::insufficient_data("TabDef", 6, data.len()));
        }

        let mut offset = 0;

        // UINT32 속성 (표 37) / UINT32 attributes (Table 37)
        let attr_value = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        let attributes = TabDefAttributes {
            has_left_auto_tab: (attr_value & 0x00000001) != 0,
            has_right_auto_tab: (attr_value & 0x00000002) != 0,
        };

        // INT16 count / INT16 count
        let count = INT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // 탭 항목 파싱 (각 8바이트) / Parse tab items (8 bytes each)
        let mut tabs = Vec::new();
        for _ in 0..count {
            if offset + 8 > data.len() {
                return Err(HwpError::InsufficientData {
                    field: format!("TabDef tab item at offset {}", offset),
                    expected: offset + 8,
                    actual: data.len(),
                });
            }

            // HWPUNIT 탭의 위치 / HWPUNIT tab position
            let position = HWPUNIT(u32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]));
            offset += 4;

            // UINT8 탭의 종류 / UINT8 tab type
            let tab_type = TabType::from_byte(data[offset]);
            offset += 1;

            // UINT8 채움 종류 / UINT8 fill type
            let fill_type = data[offset];
            offset += 1;

            // UINT16 예약 (8바이트 맞춤용) / UINT16 reserved (for 8-byte alignment)
            offset += 2;

            tabs.push(TabItem {
                position,
                tab_type,
                fill_type,
            });
        }

        Ok(TabDef {
            attributes,
            count,
            tabs,
        })
    }
}
