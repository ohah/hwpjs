use thiserror::Error;

#[derive(Debug, Error)]
pub enum HwpxError {
    #[error("ZIP error: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("XML error: {0}")]
    Xml(#[from] quick_xml::Error),

    #[error("XML attribute error: {0}")]
    XmlAttr(#[from] quick_xml::events::attributes::AttrError),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("UTF-8 error: {0}")]
    Utf8(#[from] std::string::FromUtf8Error),

    #[error("Parse int error: {0}")]
    ParseInt(#[from] std::num::ParseIntError),

    #[error("Parse float error: {0}")]
    ParseFloat(#[from] std::num::ParseFloatError),

    #[error("Missing required element: {0}")]
    MissingElement(String),

    #[error("Invalid value: {field} = {value}")]
    InvalidValue { field: String, value: String },

    #[error("File not found in archive: {0}")]
    FileNotFound(String),
}
