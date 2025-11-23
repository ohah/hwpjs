/// Decompression module for HWP files
///
/// This module handles zlib decompression used in HWP 5.0 files.
use flate2::read::DeflateDecoder;
use std::io::Read;

/// Decompress zlib-compressed data
///
/// # Arguments
/// * `compressed_data` - Compressed byte array
///
/// # Returns
/// Decompressed byte vector
pub fn decompress_zlib(compressed_data: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = DeflateDecoder::new(compressed_data);
    let mut decompressed = Vec::new();
    decoder
        .read_to_end(&mut decompressed)
        .map_err(|e| format!("Failed to decompress zlib data: {}", e))?;
    Ok(decompressed)
}
