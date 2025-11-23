/// CFB (Compound File Binary) parsing module
///
/// This module handles parsing of CFB structures used in HWP files.
use cfb::CompoundFile;
use std::io::{Cursor, Read};

/// CFB parser for HWP files
pub struct CfbParser;

impl CfbParser {
    /// Parse CFB structure from byte array
    ///
    /// # Arguments
    /// * `data` - Byte array containing CFB file data
    ///
    /// # Returns
    /// Parsed CompoundFile structure
    pub fn parse(data: &[u8]) -> Result<CompoundFile<Cursor<&[u8]>>, String> {
        let cursor = Cursor::new(data);
        CompoundFile::open(cursor).map_err(|e| format!("Failed to parse CFB: {}", e))
    }

    /// Read a stream from CFB structure
    ///
    /// # Arguments
    /// * `cfb` - CompoundFile structure (mutable reference required)
    /// * `stream_name` - Name of the stream to read
    ///
    /// # Returns
    /// Stream content as byte vector
    pub fn read_stream(
        cfb: &mut CompoundFile<Cursor<&[u8]>>,
        stream_name: &str,
    ) -> Result<Vec<u8>, String> {
        let mut stream = cfb
            .open_stream(stream_name)
            .map_err(|e| format!("Failed to open stream '{}': {}", stream_name, e))?;

        let mut buffer = Vec::new();
        stream
            .read_to_end(&mut buffer)
            .map_err(|e| format!("Failed to read stream '{}': {}", stream_name, e))?;

        Ok(buffer)
    }
}
