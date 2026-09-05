use hwp_core::{decompress_deflate, CfbParser, FileHeader, HwpParser, RecordHeader};
use std::env;
use std::fs;
use std::hint::black_box;
use std::path::Path;
use std::time::Instant;

#[derive(Debug, Clone, Copy)]
struct ProbeResult {
    stream_count: usize,
    stream_bytes: u64,
    version: u32,
    flags: u32,
    docinfo_records: usize,
    section_records: usize,
    checksum: u64,
}

fn scan_records(data: &[u8]) -> Result<(usize, u64), Box<dyn std::error::Error>> {
    let mut offset = 0usize;
    let mut count = 0usize;
    let mut checksum = 0u64;

    while offset < data.len() {
        let (header, header_size) = RecordHeader::parse(&data[offset..])?;
        offset += header_size;
        let size = header.size as usize;
        let end = offset
            .checked_add(size)
            .ok_or("record payload offset overflow")?;
        if end > data.len() {
            return Err(format!(
                "record payload exceeds stream: end={}, stream_len={}",
                end,
                data.len()
            )
            .into());
        }

        checksum = checksum
            .wrapping_mul(33)
            .wrapping_add(u64::from(header.tag_id))
            .wrapping_add(u64::from(header.level));
        checksum = checksum.wrapping_add(u64::from(header.size));
        count += 1;
        offset = end;
    }

    Ok((count, checksum))
}

fn probe_hwp(data: &[u8]) -> Result<ProbeResult, Box<dyn std::error::Error>> {
    let mut cfb = CfbParser::parse(data)?;
    let (stream_count, stream_bytes) = {
        let mut count = 0usize;
        let mut bytes = 0u64;
        for entry in cfb.walk() {
            if entry.is_stream() {
                count += 1;
                bytes = bytes.saturating_add(entry.len());
            }
        }
        (count, bytes)
    };

    let file_header_data = CfbParser::read_stream(&mut cfb, "FileHeader")?;
    let file_header = FileHeader::parse(&file_header_data)?;

    let docinfo_data = CfbParser::read_stream(&mut cfb, "DocInfo")?;
    let docinfo_plain = if file_header.is_compressed() {
        decompress_deflate(&docinfo_data)?
    } else {
        docinfo_data
    };
    let (docinfo_records, docinfo_checksum) = scan_records(&docinfo_plain)?;

    let (section_records, section_checksum) = match CfbParser::read_nested_stream(
        &mut cfb,
        "BodyText",
        "Section0",
    ) {
        Ok(section_data) => {
            let section_plain = if file_header.is_compressed() {
                decompress_deflate(&section_data)?
            } else {
                section_data
            };
            scan_records(&section_plain)?
        }
        Err(_) => (0, 0),
    };

    Ok(ProbeResult {
        stream_count,
        stream_bytes,
        version: file_header.version,
        flags: file_header.document_flags,
        docinfo_records,
        section_records,
        checksum: docinfo_checksum ^ section_checksum,
    })
}

fn full_hwp(data: &[u8]) -> Result<u64, Box<dyn std::error::Error>> {
    let document = HwpParser::new().parse(data)?;
    let paragraphs: usize = document
        .body_text
        .sections
        .iter()
        .map(|section| section.paragraphs.len())
        .sum();
    Ok((document.body_text.sections.len() as u64)
        .wrapping_mul(1_000_003)
        .wrapping_add(paragraphs as u64)
        .wrapping_add(document.bin_data.items.len() as u64))
}

fn usage(program: &str) -> ! {
    eprintln!("usage: {program} <probe|full> <file> [iterations]");
    std::process::exit(2);
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args();
    let program = args.next().unwrap_or_else(|| "hwp5-rust".to_string());
    let mode = args.next().unwrap_or_else(|| usage(&program));
    let path = args.next().unwrap_or_else(|| usage(&program));
    let iterations: usize = args
        .next()
        .as_deref()
        .unwrap_or("1")
        .parse()
        .map_err(|_| "iterations must be an integer")?;
    if iterations == 0 {
        return Err("iterations must be greater than zero".into());
    }

    let data = fs::read(&path)?;
    let run = || -> Result<u64, Box<dyn std::error::Error>> {
        match mode.as_str() {
            "probe" => {
                let result = probe_hwp(&data)?;
                Ok(result
                    .stream_count
                    .wrapping_add(result.stream_bytes as usize)
                    .wrapping_add(result.version as usize)
                    .wrapping_add(result.flags as usize)
                    .wrapping_add(result.docinfo_records)
                    .wrapping_add(result.section_records)
                    .wrapping_add(result.checksum as usize) as u64)
            }
            "full" => full_hwp(&data),
            _ => usage(&program),
        }
    };

    black_box(run()?);
    let started = Instant::now();
    let mut checksum = 0u64;
    for _ in 0..iterations {
        checksum = checksum.wrapping_add(black_box(run()?));
    }
    let elapsed = started.elapsed();
    let nanos = elapsed.as_nanos();
    if mode == "probe" {
        let result = probe_hwp(&data)?;
        eprintln!(
            "probe_fields streams={} stream_bytes={} version={} flags={} docinfo_records={} section_records={} probe_checksum={}",
            result.stream_count,
            result.stream_bytes,
            result.version,
            result.flags,
            result.docinfo_records,
            result.section_records,
            result.checksum,
        );
    }
    println!(
        "mode={mode} file={} iterations={iterations} elapsed_ns={nanos} ns_per_iter={} checksum={checksum}",
        Path::new(&path).display(),
        nanos / iterations as u128
    );
    Ok(())
}
