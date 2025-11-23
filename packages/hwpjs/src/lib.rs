#![deny(clippy::all)]

use hwp_core::HwpParser;
use napi_derive::napi;
use serde_json;

#[napi]
pub fn plus_100(input: u32) -> u32 {
    input + 100
}

/// Parse HWP file from byte array (Buffer or Uint8Array)
///
/// # Arguments
/// * `data` - Byte array containing HWP file data
///
/// # Returns
/// Parsed HWP document as JSON string
#[napi]
pub fn parse_hwp(data: Vec<u8>) -> Result<String, napi::Error> {
    let parser = HwpParser::new();
    let document = parser.parse(&data).map_err(napi::Error::from_reason)?;

    // Convert to JSON
    serde_json::to_string(&document)
        .map_err(|e| napi::Error::from_reason(format!("Failed to serialize to JSON: {}", e)))
}

/// Parse HWP file and return only FileHeader as JSON
///
/// # Arguments
/// * `data` - Byte array containing HWP file data
///
/// # Returns
/// FileHeader as JSON string
#[napi]
pub fn parse_hwp_fileheader(data: Vec<u8>) -> Result<String, napi::Error> {
    let parser = HwpParser::new();
    parser
        .parse_fileheader_json(&data)
        .map_err(napi::Error::from_reason)
}
