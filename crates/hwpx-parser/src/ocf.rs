use crate::error::HwpxError;
use crate::utils::{attr_str, local_name, read_zip_entry_bytes, read_zip_entry_string};
use hwp_model::document::{BinaryItem, BinaryStore, ImageFormat};
use quick_xml::events::Event;
use quick_xml::Reader;
use std::io::{Read, Seek};

pub struct VersionInfo {
    pub major: u8,
    pub minor: u8,
    pub micro: u8,
    pub xml_version: String,
    pub app_version: String,
}

/// version.xml 파싱
pub fn parse_version<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
) -> Result<VersionInfo, HwpxError> {
    let xml = read_zip_entry_string(archive, "version.xml")?;
    let mut reader = Reader::from_str(&xml);
    reader.config_mut().trim_text(true);

    let mut version = VersionInfo {
        major: 5,
        minor: 0,
        micro: 0,
        xml_version: String::new(),
        app_version: String::new(),
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"HCFVersion" {
                    version.major = attr_str(e, b"major")
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(5);
                    version.minor = attr_str(e, b"minor")
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(0);
                    version.micro = attr_str(e, b"micro")
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(0);
                    version.xml_version =
                        attr_str(e, b"xmlVersion").unwrap_or_default();
                    version.app_version =
                        attr_str(e, b"appVersion").unwrap_or_default();
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(version)
}

pub struct BinaryItemInfo {
    pub id: String,
    pub href: String,
    pub media_type: String,
}

/// BinData 디렉토리에서 바이너리 데이터 읽기
pub fn parse_binaries<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    items: &[BinaryItemInfo],
) -> Result<BinaryStore, HwpxError> {
    let mut store = BinaryStore::default();

    for item in items {
        let path = if item.href.starts_with("BinData/") || item.href.starts_with("Contents/") {
            item.href.clone()
        } else {
            format!("Contents/{}", item.href)
        };

        match read_zip_entry_bytes(archive, &path) {
            Ok(data) => {
                let format = guess_image_format(&item.href);
                store.items.push(BinaryItem {
                    id: item.id.clone(),
                    src: item.href.clone(),
                    format,
                    data,
                });
            }
            Err(_) => {
                // BinData 없으면 무시 (외부 링크일 수 있음)
            }
        }
    }

    Ok(store)
}

fn guess_image_format(path: &str) -> ImageFormat {
    let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "png" => ImageFormat::Png,
        "jpg" | "jpeg" => ImageFormat::Jpg,
        "bmp" => ImageFormat::Bmp,
        "gif" => ImageFormat::Gif,
        "tiff" | "tif" => ImageFormat::Tiff,
        "wmf" => ImageFormat::Wmf,
        "emf" => ImageFormat::Emf,
        "svg" => ImageFormat::Svg,
        other => ImageFormat::Unknown(other.to_string()),
    }
}
