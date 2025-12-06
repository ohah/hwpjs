/// Bullet 구조체 / Bullet structure
///
/// 스펙 문서 매핑: 표 42 - 글머리표 / Spec mapping: Table 42 - Bullet
/// Tag ID: HWPTAG_BULLET
/// 전체 길이: 20바이트 (표 42) 또는 가변 (레거시 코드 기준) / Total length: 20 bytes (Table 42) or variable (legacy code)
use crate::error::HwpError;
use crate::types::{BYTE, HWPUNIT16, INT32, UINT32, WCHAR};
use serde::{Deserialize, Serialize};

/// 문단 머리 정보 속성 / Paragraph header information attributes
///
/// 표 40 참조 / See Table 40
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BulletHeaderAttributes {
    /// 문단의 정렬 종류 / Paragraph alignment type
    pub align_type: BulletAlignType,
    /// 인스턴스 유사 여부 (bit 2) / Instance-like flag (bit 2)
    pub instance_like: bool,
    /// 자동 내어 쓰기 여부 / Auto outdent flag
    pub auto_outdent: bool,
    /// 수준별 본문과의 거리 종류 / Distance type from body text by level
    pub distance_type: BulletDistanceType,
}

/// 문단 정렬 종류 / Paragraph alignment type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BulletAlignType {
    /// 왼쪽 / Left
    Left = 0,
    /// 가운데 / Center
    Center = 1,
    /// 오른쪽 / Right
    Right = 2,
}

impl BulletAlignType {
    fn from_bits(bits: u32) -> Self {
        match bits & 0x00000003 {
            1 => BulletAlignType::Center,
            2 => BulletAlignType::Right,
            _ => BulletAlignType::Left,
        }
    }
}

/// 수준별 본문과의 거리 종류 / Distance type from body text by level
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BulletDistanceType {
    /// 글자 크기에 대한 상대 비율 / Relative ratio to font size
    Ratio = 0,
    /// 값 / Value
    Value = 1,
}

impl BulletDistanceType {
    fn from_bit(bit: bool) -> Self {
        if bit {
            BulletDistanceType::Value
        } else {
            BulletDistanceType::Ratio
        }
    }
}

/// 이미지 글머리표 속성 / Image bullet attributes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageBulletAttributes {
    /// 명암 / Brightness
    pub brightness: BYTE,
    /// 밝기 / Contrast
    pub contrast: BYTE,
    /// 효과 / Effect
    pub effect: BYTE,
    /// ID / ID
    pub id: BYTE,
}

/// Bullet 구조체 / Bullet structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bullet {
    /// 속성 (표 40) / Attributes (Table 40)
    pub attributes: BulletHeaderAttributes,
    /// 너비 보정값 / Width correction value
    pub width: HWPUNIT16,
    /// 본문과의 거리 / Distance from body text
    pub space: HWPUNIT16,
    /// 글자 모양 아이디 참조 / Character shape ID reference
    pub char_shape_id: INT32,
    /// 글머리표 문자 / Bullet character
    pub bullet_char: WCHAR,
    /// 이미지 글머리표 존재 여부(ID) / Image bullet existence (ID)
    pub image_bullet_id: INT32,
    /// 이미지 글머리표 속성 (명암, 밝기, 효과, ID) / Image bullet attributes (brightness, contrast, effect, ID)
    pub image_bullet_attributes: Option<ImageBulletAttributes>,
    /// 체크 글머리표 문자 / Check bullet character
    pub check_bullet_char: WCHAR,
}

impl Bullet {
    /// Bullet을 바이트 배열에서 파싱합니다. / Parse Bullet from byte array.
    ///
    /// # Arguments
    /// * `data` - Bullet 레코드 데이터 / Bullet record data
    ///
    /// # Returns
    /// 파싱된 Bullet 구조체 / Parsed Bullet structure
    pub fn parse(data: &[u8]) -> Result<Self, HwpError> {
        // 레거시 코드 기준 최소 12바이트 필요 (속성 4 + 너비 2 + 거리 2 + 글자모양ID 4) / Need at least 12 bytes based on legacy code
        if data.len() < 12 {
            return Err(HwpError::insufficient_data("Bullet", 12, data.len()));
        }

        let mut offset = 0;

        // UINT 속성 (표 40) - 레거시 코드 기준 / UINT attributes (Table 40) - based on legacy code
        let attr_value = UINT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        let attributes = BulletHeaderAttributes {
            align_type: BulletAlignType::from_bits(attr_value),
            instance_like: (attr_value & 0x00000004) != 0,
            auto_outdent: (attr_value & 0x00000008) != 0,
            distance_type: BulletDistanceType::from_bit((attr_value & 0x00000010) != 0),
        };

        // HWPUNIT16 너비 보정값 / HWPUNIT16 width correction value
        let width = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // HWPUNIT16 본문과의 거리 / HWPUNIT16 distance from body text
        let space = HWPUNIT16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // INT32 글자 모양 아이디 참조 / INT32 character shape ID reference
        let char_shape_id = INT32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // WCHAR 글머리표 문자 / WCHAR bullet character
        let bullet_char = if offset + 2 <= data.len() {
            WCHAR::from_le_bytes([data[offset], data[offset + 1]])
        } else {
            0
        };
        offset += 2;

        // INT32 이미지 글머리표 존재 여부(ID) - 옵션 / INT32 image bullet existence (ID) - optional
        let image_bullet_id = if offset + 4 <= data.len() {
            INT32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ])
        } else {
            0
        };
        offset += 4;

        // BYTE stream 이미지 글머리표 속성 (4바이트) - 옵션 / BYTE stream image bullet attributes (4 bytes) - optional
        let image_bullet_attributes = if offset + 4 <= data.len() {
            Some(ImageBulletAttributes {
                brightness: data[offset],
                contrast: data[offset + 1],
                effect: data[offset + 2],
                id: data[offset + 3],
            })
        } else {
            None
        };
        offset += 4;

        // WCHAR 체크 글머리표 문자 - 옵션 / WCHAR check bullet character - optional
        let check_bullet_char = if offset + 2 <= data.len() {
            WCHAR::from_le_bytes([data[offset], data[offset + 1]])
        } else {
            0
        };

        Ok(Bullet {
            attributes,
            width,
            space,
            char_shape_id,
            bullet_char,
            image_bullet_id,
            image_bullet_attributes,
            check_bullet_char,
        })
    }
}
