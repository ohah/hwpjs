/// Decompression module for HWP files
///
/// This module handles zlib/deflate decompression used in HWP 5.0 files.
/// HWP files use raw deflate format (windowBits: -15) for DocInfo and BodyText streams.
use crate::error::{CompressionFormat, HwpError};
use flate2::read::{DeflateDecoder, ZlibDecoder};
use std::io::Read;

/// Decompress zlib-compressed data (with zlib header)
///
/// # Arguments
/// * `compressed_data` - Compressed byte array in zlib format (RFC 1950)
///
/// # Returns
/// Decompressed byte vector
pub fn decompress_zlib(compressed_data: &[u8]) -> Result<Vec<u8>, HwpError> {
    let mut decoder = ZlibDecoder::new(compressed_data);
    let mut decompressed = Vec::new();
    decoder
        .read_to_end(&mut decompressed)
        .map_err(|e| HwpError::decompress_error(CompressionFormat::Zlib, e.to_string()))?;
    Ok(decompressed)
}

/// Decompress raw deflate data (without zlib header, windowBits: -15)
///
/// HWP DocInfo and BodyText streams use raw deflate format.
/// This is equivalent to pako's inflate with windowBits: -15.
///
/// # Arguments
/// * `compressed_data` - Compressed byte array in raw deflate format
///
/// # Returns
/// Decompressed byte vector
pub fn decompress_deflate(compressed_data: &[u8]) -> Result<Vec<u8>, HwpError> {
    let mut decoder = DeflateDecoder::new(compressed_data);
    let mut decompressed = Vec::new();
    decoder
        .read_to_end(&mut decompressed)
        .map_err(|e| HwpError::decompress_error(CompressionFormat::Deflate, e.to_string()))?;
    Ok(decompressed)
}
