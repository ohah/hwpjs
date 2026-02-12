/// ShapeComponentOle 구조체 / ShapeComponentOle structure
///
/// 스펙 문서 매핑: 표 118 - OLE 개체 속성 / Spec mapping: Table 118 - OLE shape component attributes
///
/// **구현 상태 / Implementation Status**
/// - 구현 완료 / Implementation complete
/// - 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_OLE 레코드가 없어 실제 파일로 테스트되지 않음
/// - Implementation complete, but not tested with actual file as test file (`noori.hwp`) does not contain SHAPE_COMPONENT_OLE records
use crate::error::HwpError;
use crate::types::{COLORREF, INT32, UINT16, UINT32};
use serde::{Deserialize, Serialize};

/// OLE 개체 / OLE shape component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShapeComponentOle {
    /// 속성 / Attributes (표 119 참조 / See Table 119)
    pub attributes: OleAttributes,
    /// 오브젝트 자체의 extent x크기 / Object extent X size
    pub extent_x: INT32,
    /// 오브젝트 자체의 extent y크기 / Object extent Y size
    pub extent_y: INT32,
    /// 오브젝트가 사용하는 스토리지의 BinData ID / BinData ID of storage used by object
    pub bindata_id: UINT16,
    /// 테두리 색 / Border color
    pub border_color: COLORREF,
    /// 테두리 두께 / Border width
    pub border_width: INT32,
    /// 테두리 속성 / Border attributes (표 87 참조 / See Table 87)
    pub border_attributes: UINT32,
}

/// OLE 개체 속성 / OLE shape component attributes
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct OleAttributes {
    /// Drawing aspect (bit 0-7)
    /// - DVASPECT_CONTENT = 1
    /// - DVASPECT_THUMBNAIL = 2
    /// - DVASPECT_ICON = 4
    /// - DVASPECT_DOCPRINT = 8
    /// 자세한 설명은 MSDN의 MFC COleClientItem::m_nDrawAspect 참고
    /// See MSDN MFC COleClientItem::m_nDrawAspect for details
    pub drawing_aspect: u8,
    /// TRUE if moniker is assigned (bit 8)
    /// 자세한 설명은 MSDN의 MFC COleClientItem::m_bMoniker 참고
    /// See MSDN MFC COleClientItem::m_bMoniker for details
    pub has_moniker: bool,
    /// 베이스라인 (bit 9-15)
    /// 0은 기본값(85%), 1-101은 0-100%를 나타냄. 현재는 수식만 별도의 베이스라인을 가짐
    /// 0 is default (85%), 1-101 represents 0-100%. Currently only equations have separate baseline
    pub baseline: u8,
    /// 개체 종류 (bit 16-21) / Object type
    /// - 0: Unknown
    /// - 1: Embedded
    /// - 2: Link
    /// - 3: Static
    /// - 4: Equation
    pub object_type: u8,
}

impl ShapeComponentOle {
    /// ShapeComponentOle을 바이트 배열에서 파싱합니다. / Parse ShapeComponentOle from byte array.
    ///
    /// # Arguments
    /// * `data` - ShapeComponentOle 데이터 (OLE 개체 속성 부분만) / ShapeComponentOle data (OLE shape component attributes only)
    ///
    /// # Returns
    /// 파싱된 ShapeComponentOle 구조체 / Parsed ShapeComponentOle structure
    ///
    /// # Note
    /// 스펙 문서 표 117에 따르면 SHAPE_COMPONENT_OLE은 다음 구조를 가집니다:
    /// - 개체 공통 속성(표 68 참조) - 가변 길이
    /// - OLE 개체 속성(표 118 참조) - 24바이트
    ///
    /// 레거시 코드(hwp.js)는 OLE 개체 속성을 파싱하지 않고 있습니다.
    /// According to spec Table 117, SHAPE_COMPONENT_OLE has the following structure:
    /// - Object common properties (Table 68) - variable length
    /// - OLE shape component attributes (Table 118) - 24 bytes
    ///
    /// Legacy code (hwp.js) does not parse OLE shape component attributes.
    ///
    /// **테스트 상태 / Testing Status**
    /// 현재 테스트 파일(`noori.hwp`)에 SHAPE_COMPONENT_OLE 레코드가 없어 실제 파일로 검증되지 않았습니다.
    /// 실제 HWP 파일에 SHAPE_COMPONENT_OLE 레코드가 있으면 자동으로 파싱됩니다.
    /// Current test file (`noori.hwp`) does not contain SHAPE_COMPONENT_OLE records, so it has not been verified with actual files.
    /// If an actual HWP file contains SHAPE_COMPONENT_OLE records, they will be automatically parsed.
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        // 표 118: OLE 개체 속성은 24바이트 / Table 118: OLE shape component attributes is 24 bytes
        // UINT16(2) + INT32(4) + INT32(4) + UINT16(2) + COLORREF(4) + INT32(4) + UINT32(4) = 24 bytes
        if data.len() < 24 {
            return Err(HwpError::insufficient_data(
                "ShapeComponentOle",
                24,
                data.len(),
            ));
        }

        let mut offset = 0;

        // 표 118: 속성 (UINT16, 2바이트) / Table 118: Attributes (UINT16, 2 bytes)
        let attr_value = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // 표 119: 속성 비트 필드 파싱 / Table 119: Parse attribute bit fields
        // Note: UINT16 is 16 bits, so bits 16-21 don't exist in this field
        // 참고: UINT16은 16비트이므로 bit 16-21은 이 필드에 존재하지 않습니다
        let drawing_aspect = (attr_value & 0xFF) as u8; // bit 0-7
        let has_moniker = (attr_value & 0x100) != 0; // bit 8
        let baseline = ((attr_value >> 9) & 0x7F) as u8; // bit 9-15
                                                         // object_type is not in UINT16 field, will be read from later data if needed
                                                         // object_type은 UINT16 필드에 없으며, 필요시 이후 데이터에서 읽습니다
        let object_type = 0u8; // Placeholder - may need to read from additional data

        // 표 118: 오브젝트 자체의 extent x크기 (INT32, 4바이트) / Table 118: Object extent X size (INT32, 4 bytes)
        let extent_x = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 118: 오브젝트 자체의 extent y크기 (INT32, 4바이트) / Table 118: Object extent Y size (INT32, 4 bytes)
        let extent_y = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 118: 오브젝트가 사용하는 스토리지의 BinData ID (UINT16, 2바이트) / Table 118: BinData ID (UINT16, 2 bytes)
        let bindata_id = UINT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // 표 118: 테두리 색 (COLORREF, 4바이트) / Table 118: Border color (COLORREF, 4 bytes)
        let border_color_value = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        let border_color = COLORREF(border_color_value);
        offset += 4;

        // 표 118: 테두리 두께 (INT32, 4바이트) / Table 118: Border width (INT32, 4 bytes)
        let border_width = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // 표 118: 테두리 속성 (UINT32, 4바이트) / Table 118: Border attributes (UINT32, 4 bytes)
        let border_attributes = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);

        Ok(ShapeComponentOle {
            attributes: OleAttributes {
                drawing_aspect,
                has_moniker,
                baseline,
                object_type,
            },
            extent_x,
            extent_y,
            bindata_id,
            border_color,
            border_width,
            border_attributes,
        })
    }
}
