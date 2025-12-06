/// ShapeComponentContainer 구조체 / ShapeComponentContainer structure
///
/// 스펙 문서 매핑: 표 121 - 묶음 개체 속성 / Spec mapping: Table 121 - Container shape component attributes
///
/// **구현 상태 / Implementation Status**
/// - 구현 완료 / Implementation complete
/// - 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_CONTAINER 레코드가 없어 실제 파일로 테스트되지 않음
/// - Implementation complete, but not tested with actual file as test file (`noori.hwp`) does not contain SHAPE_COMPONENT_CONTAINER records
use crate::error::HwpError;
use crate::types::{UINT16, UINT32};
use serde::{Deserialize, Serialize};

/// 묶음 개체 / Container shape component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShapeComponentContainer {
    /// 개체의 개수 / Number of objects
    pub object_count: UINT16,
    /// 개체의 컨트롤 ID 배열 / Control ID array of objects
    pub control_ids: Vec<UINT32>,
}

impl ShapeComponentContainer {
    /// ShapeComponentContainer을 바이트 배열에서 파싱합니다. / Parse ShapeComponentContainer from byte array.
    ///
    /// # Arguments
    /// * `data` - ShapeComponentContainer 데이터 (묶음 개체 속성 부분만) / ShapeComponentContainer data (container shape component attributes only)
    ///
    /// # Returns
    /// 파싱된 ShapeComponentContainer 구조체 / Parsed ShapeComponentContainer structure
    ///
    /// # Note
    /// 스펙 문서 표 120에 따르면 SHAPE_COMPONENT_CONTAINER은 다음 구조를 가집니다:
    /// - 개체 공통 속성(표 68 참조) - 가변 길이
    /// - 묶음 개체 속성(표 121 참조) - 가변 길이 (2 + 4×n 바이트)
    /// - 개체 속성 x 묶음 개체의 갯수 - 가변 길이
    ///
    /// 레거시 코드(hwp.js)는 묶음 개체 속성을 파싱하지 않고 있습니다.
    /// According to spec Table 120, SHAPE_COMPONENT_CONTAINER has the following structure:
    /// - Object common properties (Table 68) - variable length
    /// - Container shape component attributes (Table 121) - variable length (2 + 4×n bytes)
    /// - Object properties × number of container objects - variable length
    ///
    /// Legacy code (hwp.js) does not parse container shape component attributes.
    ///
    /// **테스트 상태 / Testing Status**
    /// 현재 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_CONTAINER 레코드가 없어 실제 파일로 검증되지 않았습니다.
    /// 실제 HWP 파일에 SHAPE_COMPONENT_CONTAINER 레코드가 있으면 자동으로 파싱됩니다.
    /// Current test file (`noori.hwp`) does not contain SHAPE_COMPONENT_CONTAINER records, so it has not been verified with actual files.
    /// If an actual HWP file contains SHAPE_COMPONENT_CONTAINER records, they will be automatically parsed.
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        // 최소 2바이트 필요 (개체의 개수) / Need at least 2 bytes (object count)
        if data.len() < 2 {
            return Err(HwpError::insufficient_data("ShapeComponentContainer", 2, data.len()));
        }

        let mut offset = 0;

        // 표 121: 개체의 개수 (WORD, 2바이트) / Table 121: Number of objects (WORD, 2 bytes)
        let object_count = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        let object_count_usize = object_count as usize;

        // 필요한 바이트 수 계산 / Calculate required bytes
        // WORD(2) + UINT32 array[n](4×n) = 2 + 4×n
        let required_bytes = 2 + 4 * object_count_usize;
        if data.len() < required_bytes {
            return Err(HwpError::InsufficientData {
                field: format!("ShapeComponentContainer (object_count={})", object_count_usize),
                expected: required_bytes,
                actual: data.len(),
            });
        }

        // 표 121: 개체의 컨트롤 ID 배열 (UINT32 array[n], 4×n 바이트) / Table 121: Control ID array (UINT32 array[n], 4×n bytes)
        let mut control_ids = Vec::with_capacity(object_count_usize);
        for _ in 0..object_count_usize {
            let control_id = UINT32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]);
            control_ids.push(control_id);
            offset += 4;
        }

        Ok(ShapeComponentContainer {
            object_count,
            control_ids,
        })
    }
}
