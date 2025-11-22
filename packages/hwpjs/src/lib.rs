#![deny(clippy::all)]

use hwp_core::{FileReader, HwpParser};
use napi_derive::napi;

/// Node.js file reader implementation
struct NodeFileReader;

impl FileReader for NodeFileReader {
    fn read(&self, path: &str) -> Result<Vec<u8>, String> {
        use std::fs;
        fs::read(path).map_err(|e| e.to_string())
    }
}

#[napi]
pub fn plus_100(input: u32) -> u32 {
    input + 100
}

#[napi]
pub fn parse_hwp(path: String) -> Result<String, napi::Error> {
    let parser = HwpParser::new();
    let reader = NodeFileReader;
    parser
        .parse(&reader, &path)
        .map_err(napi::Error::from_reason)
}
