use crate::error::HwpxError;
use quick_xml::events::BytesStart;
use quick_xml::Reader;
use std::io::{Read, Seek};

/// ZIP에서 파일을 문자열로 읽기
pub fn read_zip_entry_string<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    path: &str,
) -> Result<String, HwpxError> {
    let mut file = archive
        .by_name(path)
        .map_err(|_| HwpxError::FileNotFound(path.to_string()))?;
    let mut buf = String::new();
    file.read_to_string(&mut buf)?;
    Ok(buf)
}

/// ZIP에서 파일을 바이트로 읽기
pub fn read_zip_entry_bytes<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    path: &str,
) -> Result<Vec<u8>, HwpxError> {
    let mut file = archive
        .by_name(path)
        .map_err(|_| HwpxError::FileNotFound(path.to_string()))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf)?;
    Ok(buf)
}

/// XML 속성에서 문자열 값 가져오기
pub fn attr_str(e: &BytesStart, name: &[u8]) -> Option<String> {
    e.attributes().filter_map(|a| a.ok()).find_map(|a| {
        if a.key.as_ref() == name {
            String::from_utf8(a.value.to_vec()).ok()
        } else {
            None
        }
    })
}

/// XML 속성에서 필수 문자열 값
#[allow(dead_code)]
pub fn attr_str_req(e: &BytesStart, name: &[u8]) -> Result<String, HwpxError> {
    attr_str(e, name).ok_or_else(|| {
        HwpxError::MissingElement(format!(
            "attribute '{}' on <{}>",
            String::from_utf8_lossy(name),
            String::from_utf8_lossy(e.name().as_ref())
        ))
    })
}

/// XML 속성에서 u16 값
pub fn attr_u16(e: &BytesStart, name: &[u8]) -> Option<u16> {
    attr_str(e, name).and_then(|v| v.parse().ok())
}

/// XML 속성에서 u32 값
pub fn attr_u32(e: &BytesStart, name: &[u8]) -> Option<u32> {
    attr_str(e, name).and_then(|v| v.parse().ok())
}

/// XML 속성에서 u64 값
pub fn attr_u64(e: &BytesStart, name: &[u8]) -> Option<u64> {
    attr_str(e, name).and_then(|v| v.parse().ok())
}

/// XML 속성에서 i32 값
pub fn attr_i32(e: &BytesStart, name: &[u8]) -> Option<i32> {
    attr_str(e, name).and_then(|v| v.parse().ok())
}

/// XML 속성에서 i8 값
pub fn attr_i8(e: &BytesStart, name: &[u8]) -> Option<i8> {
    attr_str(e, name).and_then(|v| v.parse().ok())
}

/// XML 속성에서 u8 값
pub fn attr_u8(e: &BytesStart, name: &[u8]) -> Option<u8> {
    attr_str(e, name).and_then(|v| v.parse().ok())
}

/// XML 속성에서 bool 값 ("0"/"1" 또는 "true"/"false")
pub fn attr_bool(e: &BytesStart, name: &[u8]) -> Option<bool> {
    attr_str(e, name).map(|v| v == "1" || v == "true")
}

/// XML 속성에서 f32 값
pub fn attr_f32(e: &BytesStart, name: &[u8]) -> Option<f32> {
    attr_str(e, name).and_then(|v| v.parse().ok())
}

/// #RRGGBB 문자열 → Color (Option<u32>)
pub fn parse_color(s: &str) -> hwp_model::types::Color {
    let s = s.trim_start_matches('#');
    if s.eq_ignore_ascii_case("none") {
        return None;
    }
    // #AARRGGBB (8자리) → alpha 무시, RGB만
    let hex = if s.len() == 8 { &s[2..] } else { s };
    u32::from_str_radix(hex, 16).ok()
}

/// local name 추출 (네임스페이스 접두어 제거)
pub fn local_name(full: &[u8]) -> &[u8] {
    full.iter()
        .position(|&b| b == b':')
        .map(|i| &full[i + 1..])
        .unwrap_or(full)
}

/// 현재 요소의 끝까지 스킵
pub fn skip_element(reader: &mut Reader<&[u8]>, tag_name: &[u8]) -> Result<(), HwpxError> {
    let mut depth = 1u32;
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            quick_xml::events::Event::Start(e) => {
                if local_name(e.name().as_ref()) == local_name(tag_name) {
                    depth += 1;
                }
            }
            quick_xml::events::Event::End(e) => {
                if local_name(e.name().as_ref()) == local_name(tag_name) {
                    depth -= 1;
                    if depth == 0 {
                        break;
                    }
                }
            }
            quick_xml::events::Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(())
}
