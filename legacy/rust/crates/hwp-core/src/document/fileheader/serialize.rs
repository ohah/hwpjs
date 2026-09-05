use crate::types::DWORD;
use serde::Serializer;

use super::constants::{document_flags, license_flags};

/// Serialize version DWORD as "M.n.P.r" format string
pub fn serialize_version<S>(version: &DWORD, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_str(&format_version(*version))
}

/// Format version DWORD to "M.n.P.r" string
/// Format: 0xMMnnPPrr (e.g., 0x05000300 = "5.0.3.0")
fn format_version(version: DWORD) -> String {
    let major = (version >> 24) & 0xFF;
    let minor = (version >> 16) & 0xFF;
    let patch = (version >> 8) & 0xFF;
    let revision = version & 0xFF;
    format!("{}.{}.{}.{}", major, minor, patch, revision)
}

/// Serialize document_flags DWORD as array of flag constants
pub fn serialize_document_flags<S>(flags: &DWORD, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    use serde::ser::SerializeSeq;
    let mut active_flags = Vec::new();

    if (*flags & 0x01) != 0 {
        active_flags.push(document_flags::COMPRESSED);
    }
    if (*flags & 0x02) != 0 {
        active_flags.push(document_flags::ENCRYPTED);
    }
    if (*flags & 0x04) != 0 {
        active_flags.push(document_flags::DISTRIBUTION);
    }
    if (*flags & 0x08) != 0 {
        active_flags.push(document_flags::SCRIPT);
    }
    if (*flags & 0x10) != 0 {
        active_flags.push(document_flags::DRM);
    }
    if (*flags & 0x20) != 0 {
        active_flags.push(document_flags::XML_TEMPLATE);
    }
    if (*flags & 0x40) != 0 {
        active_flags.push(document_flags::HISTORY);
    }
    if (*flags & 0x80) != 0 {
        active_flags.push(document_flags::ELECTRONIC_SIGNATURE);
    }
    if (*flags & 0x100) != 0 {
        active_flags.push(document_flags::CERTIFICATE_ENCRYPTION);
    }
    if (*flags & 0x200) != 0 {
        active_flags.push(document_flags::SIGNATURE_PREVIEW);
    }
    if (*flags & 0x400) != 0 {
        active_flags.push(document_flags::CERTIFICATE_DRM);
    }
    if (*flags & 0x800) != 0 {
        active_flags.push(document_flags::CCL);
    }
    if (*flags & 0x1000) != 0 {
        active_flags.push(document_flags::MOBILE_OPTIMIZED);
    }
    if (*flags & 0x2000) != 0 {
        active_flags.push(document_flags::PRIVACY_SECURITY);
    }
    if (*flags & 0x4000) != 0 {
        active_flags.push(document_flags::TRACK_CHANGE);
    }
    if (*flags & 0x8000) != 0 {
        active_flags.push(document_flags::KOGL);
    }
    if (*flags & 0x10000) != 0 {
        active_flags.push(document_flags::VIDEO_CONTROL);
    }
    if (*flags & 0x20000) != 0 {
        active_flags.push(document_flags::TABLE_OF_CONTENTS);
    }

    let mut seq = serializer.serialize_seq(Some(active_flags.len()))?;
    for flag in active_flags {
        seq.serialize_element(flag)?;
    }
    seq.end()
}

/// Serialize license_flags DWORD as array of flag constants
pub fn serialize_license_flags<S>(flags: &DWORD, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    use serde::ser::SerializeSeq;
    let mut active_flags = Vec::new();

    if (*flags & 0x01) != 0 {
        active_flags.push(license_flags::CCL_KOGL);
    }
    if (*flags & 0x02) != 0 {
        active_flags.push(license_flags::COPY_RESTRICTED);
    }
    if (*flags & 0x04) != 0 {
        active_flags.push(license_flags::COPY_ALLOWED_SAME_CONDITION);
    }

    let mut seq = serializer.serialize_seq(Some(active_flags.len()))?;
    for flag in active_flags {
        seq.serialize_element(flag)?;
    }
    seq.end()
}
