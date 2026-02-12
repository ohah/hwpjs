/// Error types for HWP file parsing
///
/// This module defines all error types that can occur during HWP file parsing.
use thiserror::Error;

/// Main error type for HWP parsing operations
#[derive(Debug, Clone, Error)]
pub enum HwpError {
    // ===== CFB related errors =====
    /// Failed to parse CFB structure
    #[error("Failed to parse CFB structure: {0}")]
    CfbParse(String),

    /// Stream not found in CFB structure
    #[error("Stream not found: '{stream_name}' (path: {path})")]
    StreamNotFound { stream_name: String, path: String },

    /// Failed to read stream from CFB
    #[error("Failed to read stream '{stream_name}': {reason}")]
    StreamReadError { stream_name: String, reason: String },

    /// CFB file is too small
    #[error("CFB file too small: expected at least {expected} bytes, got {actual} bytes")]
    CfbFileTooSmall { expected: usize, actual: usize },

    /// Invalid directory sector in CFB
    #[error("Invalid CFB directory sector: {reason}")]
    InvalidDirectorySector { reason: String },

    /// Invalid sector size in CFB header
    #[error("Invalid sector size shift: {value} (must be <= 12)")]
    InvalidSectorSize { value: u32 },

    // ===== Decompression errors =====
    /// Failed to decompress data
    #[error("Failed to decompress {format} data: {reason}")]
    DecompressError {
        format: CompressionFormat,
        reason: String,
    },

    // ===== Parsing errors =====
    /// Insufficient data for parsing
    #[error("Insufficient data for field '{field}': expected at least {expected} bytes, got {actual} bytes")]
    InsufficientData {
        field: String,
        expected: usize,
        actual: usize,
    },

    /// Unexpected value encountered during parsing
    #[error("Unexpected value for field '{field}': expected '{expected}', got '{found}'")]
    UnexpectedValue {
        field: String,
        expected: String,
        found: String,
    },

    /// Failed to parse a record
    #[error("Failed to parse record '{record_type}': {reason}")]
    RecordParseError { record_type: String, reason: String },

    /// Failed to parse record tree structure
    #[error("Failed to parse record tree: {reason}")]
    RecordTreeParseError { reason: String },

    // ===== Document structure errors =====
    /// Required stream is missing
    #[error("Required stream missing: '{stream_name}'")]
    RequiredStreamMissing { stream_name: String },

    /// Unsupported document version
    #[error("Unsupported document version: {version} (supported versions: {supported_versions})")]
    UnsupportedVersion {
        version: String,
        supported_versions: String,
    },

    /// Invalid document signature
    #[error("Invalid HWP document signature: expected 'HWP Document File', got '{found}'")]
    InvalidSignature { found: String },

    // ===== Other errors =====
    /// IO error
    #[error("IO error: {0}")]
    Io(String),

    /// Encoding/decoding error
    #[error("Encoding error: {reason}")]
    EncodingError { reason: String },

    /// JSON serialization error
    #[error("JSON serialization error: {0}")]
    JsonError(String),

    /// Internal error (unexpected situation)
    #[error("Internal error: {message}")]
    InternalError { message: String },
}

/// Compression format type
#[derive(Debug, Clone, Copy)]
pub enum CompressionFormat {
    Zlib,
    Deflate,
}

impl std::fmt::Display for CompressionFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CompressionFormat::Zlib => write!(f, "zlib"),
            CompressionFormat::Deflate => write!(f, "deflate"),
        }
    }
}

/// Type alias for `Result<T, HwpError>`
///
/// Note: For better clarity in function signatures, consider using `Result<T, HwpError>` directly
/// to make the error type explicit. This type alias is kept for backward compatibility.
pub type HwpResult<T> = Result<T, HwpError>;

impl HwpError {
    /// Create an `InsufficientData` error with field name
    pub fn insufficient_data(field: impl Into<String>, expected: usize, actual: usize) -> Self {
        Self::InsufficientData {
            field: field.into(),
            expected,
            actual,
        }
    }

    /// Create a `StreamNotFound` error
    pub fn stream_not_found(stream_name: impl Into<String>, path: impl Into<String>) -> Self {
        Self::StreamNotFound {
            stream_name: stream_name.into(),
            path: path.into(),
        }
    }

    /// Create a `StreamReadError` error
    pub fn stream_read_error(stream_name: impl Into<String>, reason: impl Into<String>) -> Self {
        Self::StreamReadError {
            stream_name: stream_name.into(),
            reason: reason.into(),
        }
    }

    /// Create a `RecordParseError` error
    pub fn record_parse(record_type: impl Into<String>, reason: impl Into<String>) -> Self {
        Self::RecordParseError {
            record_type: record_type.into(),
            reason: reason.into(),
        }
    }

    /// Create a `DecompressError` error
    pub fn decompress_error(format: CompressionFormat, reason: impl Into<String>) -> Self {
        Self::DecompressError {
            format,
            reason: reason.into(),
        }
    }
}

/// Conversion from String to HwpError for backward compatibility
impl From<String> for HwpError {
    fn from(s: String) -> Self {
        HwpError::InternalError { message: s }
    }
}

/// Conversion from &str to HwpError for backward compatibility
impl From<&str> for HwpError {
    fn from(s: &str) -> Self {
        HwpError::InternalError {
            message: s.to_string(),
        }
    }
}

/// Conversion from std::io::Error to HwpError
impl From<std::io::Error> for HwpError {
    fn from(err: std::io::Error) -> Self {
        HwpError::Io(err.to_string())
    }
}

/// Conversion from serde_json::Error to HwpError
impl From<serde_json::Error> for HwpError {
    fn from(err: serde_json::Error) -> Self {
        HwpError::JsonError(err.to_string())
    }
}

/// Conversion from HwpError to String for NAPI and other integrations
/// This allows HwpError to be used with napi::Error::from_reason
impl From<HwpError> for String {
    fn from(err: HwpError) -> Self {
        err.to_string()
    }
}
