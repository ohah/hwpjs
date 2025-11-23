/// Decompression module for HWP files
///
/// This module handles zlib decompression used in HWP 5.0 files.
/// HWP files use zlib format (RFC 1950) which includes headers and checksums.
use flate2::read::ZlibDecoder;
use std::io::Read;

/// Decompress zlib-compressed data
///
/// # Arguments
/// * `compressed_data` - Compressed byte array in zlib format (RFC 1950)
///
/// # Returns
/// Decompressed byte vector
pub fn decompress_zlib(compressed_data: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = ZlibDecoder::new(compressed_data);
    let mut decompressed = Vec::new();
    decoder
        .read_to_end(&mut decompressed)
        .map_err(|e| format!("Failed to decompress zlib data: {}", e))?;
    Ok(decompressed)
}
