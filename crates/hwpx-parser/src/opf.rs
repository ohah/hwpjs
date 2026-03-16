use crate::error::HwpxError;
use crate::ocf::BinaryItemInfo;
use crate::utils::{attr_str, local_name, read_zip_entry_string};
use hwp_model::document::DocumentMeta;
use quick_xml::events::Event;
use quick_xml::Reader;
use std::io::{Read, Seek};

pub struct OpfInfo {
    pub metadata: DocumentMeta,
    pub header_path: Option<String>,
    pub section_paths: Vec<String>,
    pub binary_items: Vec<BinaryItemInfo>,
}

/// content.hpf (OPF) 파싱
pub fn parse_opf<R: Read + Seek>(archive: &mut zip::ZipArchive<R>) -> Result<OpfInfo, HwpxError> {
    // container.xml에서 rootfile 경로 찾기
    let opf_path = find_opf_path(archive).unwrap_or_else(|| "Contents/content.hpf".to_string());
    let xml = read_zip_entry_string(archive, &opf_path)?;

    let mut reader = Reader::from_str(&xml);
    reader.config_mut().trim_text(true);

    let mut info = OpfInfo {
        metadata: DocumentMeta::default(),
        header_path: None,
        section_paths: Vec::new(),
        binary_items: Vec::new(),
    };

    // manifest items 수집
    let mut manifest_items: Vec<(String, String, String)> = Vec::new(); // (id, href, media-type)
    let mut spine_refs: Vec<String> = Vec::new();
    let mut current_meta_name = String::new();

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Empty(ref e) | Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"title" => {}
                b"language" => {}
                b"meta" => {
                    current_meta_name = attr_str(e, b"name").unwrap_or_default();
                }
                b"item" => {
                    let id = attr_str(e, b"id").unwrap_or_default();
                    let href = attr_str(e, b"href").unwrap_or_default();
                    let media_type = attr_str(e, b"media-type").unwrap_or_default();
                    manifest_items.push((id, href, media_type));
                }
                b"itemref" => {
                    if let Some(idref) = attr_str(e, b"idref") {
                        spine_refs.push(idref);
                    }
                }
                _ => {}
            },
            Event::Text(ref t) => {
                let text = t.unescape().unwrap_or_default().to_string();
                if !text.is_empty() {
                    match current_meta_name.as_str() {
                        "creator" => info.metadata.creator = Some(text),
                        "subject" => {
                            if !text.is_empty() {
                                info.metadata.subject = Some(text);
                            }
                        }
                        "description" => {
                            if !text.is_empty() {
                                info.metadata.description = Some(text);
                            }
                        }
                        "CreatedDate" => info.metadata.created_date = Some(text),
                        "ModifiedDate" => info.metadata.modified_date = Some(text),
                        "keyword" => {
                            if !text.is_empty() {
                                info.metadata.keywords = Some(text);
                            }
                        }
                        _ => {}
                    }
                }
                current_meta_name.clear();
            }
            Event::End(ref e) => {
                let tag = e.name();
                let name = local_name(tag.as_ref());
                if name == b"title" || name == b"language" {
                    // text는 위에서 처리됨
                }
                if name == b"meta" {
                    current_meta_name.clear();
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    // title과 language는 별도 처리 필요 (중첩 텍스트)
    // 다시 한번 파싱
    let mut reader2 = Reader::from_str(&xml);
    reader2.config_mut().trim_text(true);
    let mut buf2 = Vec::new();
    let mut in_title = false;
    let mut in_language = false;
    loop {
        match reader2.read_event_into(&mut buf2)? {
            Event::Start(ref e) => match local_name(e.name().as_ref()) {
                b"title" => in_title = true,
                b"language" => in_language = true,
                _ => {}
            },
            Event::Text(ref t) => {
                let text = t.unescape().unwrap_or_default().to_string();
                if in_title {
                    info.metadata.title = Some(text);
                    in_title = false;
                } else if in_language {
                    info.metadata.language = Some(text);
                    in_language = false;
                }
            }
            Event::End(ref e) => match local_name(e.name().as_ref()) {
                b"title" => in_title = false,
                b"language" => in_language = false,
                _ => {}
            },
            Event::Eof => break,
            _ => {}
        }
        buf2.clear();
    }

    // manifest items 분류
    for (id, href, media_type) in &manifest_items {
        if id == "header" || href.contains("header.xml") {
            info.header_path = Some(href.clone());
        } else if id.starts_with("section") || href.contains("section") {
            info.section_paths.push(href.clone());
        } else if href.starts_with("BinData/") || media_type.starts_with("image/") {
            info.binary_items.push(BinaryItemInfo {
                id: id.clone(),
                href: href.clone(),
                media_type: media_type.clone(),
            });
        }
    }

    // section 경로 정렬 (section0, section1, ...)
    info.section_paths.sort();

    // spine에서 section 순서가 있으면 그걸 우선
    if !spine_refs.is_empty() && info.section_paths.is_empty() {
        for idref in &spine_refs {
            if idref == "header" {
                continue;
            }
            if let Some((_, href, _)) = manifest_items.iter().find(|(id, _, _)| id == idref) {
                info.section_paths.push(href.clone());
            }
        }
    }

    Ok(info)
}

fn find_opf_path<R: Read + Seek>(archive: &mut zip::ZipArchive<R>) -> Option<String> {
    let xml = read_zip_entry_string(archive, "META-INF/container.xml").ok()?;
    let mut reader = Reader::from_str(&xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf).ok()? {
            Event::Empty(ref e) | Event::Start(ref e) => {
                if local_name(e.name().as_ref()) == b"rootfile" {
                    if let Some(mt) = attr_str(e, b"media-type") {
                        if mt.contains("hwpml-package") {
                            return attr_str(e, b"full-path");
                        }
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    None
}
